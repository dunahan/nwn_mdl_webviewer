/* ═══════════════════════════════════════════════
   NWN MDL Viewer — Set Browser
   (Tileset-Definitions-Parser + Browser-Panel)

   Reads NWN .set files (INI format) and provides a searchable
   tile browser as a freely positionable floating panel.

   .set file format (INI, ASCII):
     [TILESET]      → metadata    (Name, NumTiles, …)
     [TILE###]      → tile def.   (Model, terrain corners, …)
     [GROUP#]       → group       (Name, Rows, Columns)
     [GROUP#TILE#]  → membership of a tile in a group

   Tile state model:
     sb-unavailable  MDL not in watched folder
     sb-available    MDL in folder, clickable
     sb-active       Currently loaded in viewer (gold border)
     sb-changed      Active tile: file changed on disk (+ ↻)

   Dependencies (global variables from other modules):
     HotReload          – hot_reload.js  getMDLHandle · onWatchChange · onMDLChanged
     loadMDLFromHandle  – loader.js      (phase 4 — protected by typeof guard)
     L / fmt            – i18n.js
     setStatus          – ui.js
     logInfoI18n / logWarnI18n / logMsg  – log.js

   Public API (window.SetBrowser):
     SetBrowser.init()             – call on DOMContentLoaded
     SetBrowser.open()             – show / create panel
     SetBrowser.close()            – hide panel
     SetBrowser.loadSetFile(file)  – read File object of a .set file

   Panel rendering (phase 2):
     _buildPanel()   – create panel DOM (stub → phase 2)
     _renderTiles()  – render tile grid / list (stub → phase 2)
   ═══════════════════════════════════════════════ */


// ════════════════════════════════════════════════════════════════
//  parseSetFile  —  public helper function
//
//  Converts the raw text of a .set file into a structured
//  data object.  Used by SetBrowser.loadSetFile() but can
//  also be tested independently.
//
//  @param  {string} text   content of the .set file (UTF-8 / ASCII)
//  @return {SetData}       { meta, tiles[], groups[] }
//
//  SetData.meta   { name:string, numTiles:number, envMap:string,
//                   interior:boolean, hasHeightTrans:boolean }
//  SetData.tiles  Array<TileDef> — length = meta.numTiles
//    TileDef  { nr:number, model:string,
//               terrain: { tl,tr,bl,br },
//               height:  { tl,tr,bl,br },
//               orientation:number,
//               lights: { main1,main2,src1,src2 } }
//  SetData.groups Array<GroupDef>
//    GroupDef { name:string, rows:number, cols:number,
//               tileNrs: number[] }
// ════════════════════════════════════════════════════════════════

function parseSetFile(text) {

  // ── Result structure ─────────────────────────────────────────
  const meta = {
    name:           '',
    numTiles:       0,
    envMap:         '',
    interior:       false,
    hasHeightTrans: false,
  };
  const tiles  = [];
  const groups = [];

  // ── Helper functions ─────────────────────────────────────────

  // Determine tile index from a section name like "TILE0" or "TILE042".
  // Returns -1 if the name does not match.
  function _tileNr(sectionName) {
    const m = sectionName.match(/^TILE(\d+)$/i);   // 1+ Ziffern (war: 3+)
    return m ? parseInt(m[1], 10) : -1;
  }

  // Determine group index from "GROUP5" or "GROUP5TILE2".
  // Returns { groupIdx, tileIdx }; tileIdx = -1 if no TILE suffix.
  function _groupInfo(sectionName) {
    const m = sectionName.match(/^GROUP(\d+)(?:TILE(\d+))?$/i);
    if (!m) return null;
    return {
      groupIdx: parseInt(m[1], 10),
      tileIdx:  m[2] !== undefined ? parseInt(m[2], 10) : -1,
    };
  }

  // Create an empty TileDef object for index nr.
  function _emptyTile(nr) {
    return {
      nr,
      model:       '',
      terrain:     { tl: '', tr: '', bl: '', br: '' },
      height:      { tl: 0,  tr: 0,  bl: 0,  br: 0  },
      orientation: 0,
      lights:      { main1: 0, main2: 0, src1: 0, src2: 0 },
    };
  }

  // ── INI parser ───────────────────────────────────────────────
  //
  // Strategy: line by line; track current section;
  // assign KEY=VALUE lines to the currently active object.
  // Blank lines, comments (#) and lines without "=" are ignored.
  //
  let currentSection = '';
  let currentTile    = null;   // TileDef | null
  let currentGroup   = null;   // GroupDef | null

  const lines = text.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // ── Section header  [NAME] ───────────────────────────────
    if (line.startsWith('[') && line.endsWith(']')) {
      // Store current TileDef object in tiles[]
      if (currentTile !== null) {
        tiles[currentTile.nr] = currentTile;
        currentTile = null;
      }

      currentSection = line.slice(1, -1).toUpperCase();
      currentGroup   = null;

      const nr = _tileNr(currentSection);
      if (nr >= 0) {
        // TILE### section: create new TileDef
        currentTile = _emptyTile(nr);
        continue;
      }

      const gi = _groupInfo(currentSection);
      if (gi) {
        if (gi.tileIdx < 0) {
          // GROUP# section: create new GroupDef if not yet present
          if (!groups[gi.groupIdx]) {
            groups[gi.groupIdx] = { name: '', rows: 0, cols: 0, tileNrs: [] };
          }
          currentGroup = groups[gi.groupIdx];
        } else {
          // GROUP#TILE# section: remember active group for tile membership
          currentGroup = groups[gi.groupIdx] ?? null;
        }
        continue;
      }

      // Neither TILE nor GROUP → reset currentGroup
      currentGroup = null;
      continue;
    }

    // ── Comment or blank line ────────────────────────────────
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;

    // ── KEY=VALUE ─────────────────────────────────────────────
    const eqIdx = line.indexOf('=');
    if (eqIdx < 0) continue;

    const key = line.slice(0, eqIdx).trim().toLowerCase();
    const val = line.slice(eqIdx + 1).trim();

    // TILESET / GENERAL section (both formats occur in NWN tilesets)
    if (currentSection === 'TILESET' || currentSection === 'GENERAL') {
      switch (key) {
        case 'name':           meta.name           = val;                        break;
        case 'numtiles':       meta.numTiles        = parseInt(val, 10) || 0;    break;
        case 'envmap':         meta.envMap          = val;                        break;
        case 'interior':       meta.interior        = val === '1';               break;
        case 'hasheighttrans': meta.hasHeightTrans  = val === '1';               break;
        case 'hasheighttransition': meta.hasHeightTrans = val === '1';           break;
      }
      continue;
    }

    // [TILES] section: Count=N (alternative format for NumTiles)
    if (currentSection === 'TILES') {
      if (key === 'count') meta.numTiles = parseInt(val, 10) || meta.numTiles;
      continue;
    }

    // Populate active TILE### object
    if (currentTile !== null) {
      switch (key) {
        case 'model':             currentTile.model             = val.toLowerCase(); break;
        case 'topleft':           currentTile.terrain.tl        = val.toUpperCase(); break;
        case 'topright':          currentTile.terrain.tr        = val.toUpperCase(); break;
        case 'bottomleft':        currentTile.terrain.bl        = val.toUpperCase(); break;
        case 'bottomright':       currentTile.terrain.br        = val.toUpperCase(); break;
        case 'topleftheight':     currentTile.height.tl         = parseFloat(val) || 0; break;
        case 'toprightheight':    currentTile.height.tr         = parseFloat(val) || 0; break;
        case 'bottomleftheight':  currentTile.height.bl         = parseFloat(val) || 0; break;
        case 'bottomrightheight': currentTile.height.br         = parseFloat(val) || 0; break;
        case 'orientation':       currentTile.orientation       = parseInt(val, 10) || 0; break;
        case 'mainlight1':        currentTile.lights.main1      = parseInt(val, 10) || 0; break;
        case 'mainlight2':        currentTile.lights.main2      = parseInt(val, 10) || 0; break;
        case 'sourcelight1':      currentTile.lights.src1       = parseInt(val, 10) || 0; break;
        case 'sourcelight2':      currentTile.lights.src2       = parseInt(val, 10) || 0; break;
      }
      continue;
    }

    // Populate active GROUP# section
    if (currentGroup !== null) {
      const gi = _groupInfo(currentSection);
      if (gi && gi.tileIdx >= 0) {
        // GROUP#TILE# section: register tile membership
        if (key === 'tile') {
          const tileNr = parseInt(val, 10);
          if (!isNaN(tileNr) && !currentGroup.tileNrs.includes(tileNr)) {
            currentGroup.tileNrs.push(tileNr);
          }
        }
      } else {
        // GROUP# section: group metadata + inline tile assignments
        // NWN format 1 (modern): Tile0=106, Tile1=-1, Tile2=107 directly in [GROUP#]
        // NWN format 2 (older):  separate [GROUP#TILE#] sections (handled above)
        if (/^tile\d+$/i.test(key)) {
          const tileNr = parseInt(val, 10);
          // Keep negative values (= empty slots, e.g. -1) as position markers —
          // they are needed in _loadGroupTiles() for the grid layout.
          // Insert positive values only once (no duplicates).
          if (tileNr < 0 || !currentGroup.tileNrs.includes(tileNr)) {
            currentGroup.tileNrs.push(tileNr);
          }
        } else {
          switch (key) {
            case 'name':    currentGroup.name = val;                        break;
            case 'rows':    currentGroup.rows = parseInt(val, 10) || 0;    break;
            case 'columns': currentGroup.cols = parseInt(val, 10) || 0;    break;
          }
        }
      }
    }
  }

  // Store last open TileDef after EOF
  if (currentTile !== null) {
    tiles[currentTile.nr] = currentTile;
  }

  // Sparse array → dense array (missing entries as empty TileDefs)
  // So that tiles[i] is always defined as long as i < meta.numTiles.
  const denseTiles = [];
  for (let i = 0; i < Math.max(meta.numTiles, tiles.length); i++) {
    denseTiles.push(tiles[i] ?? _emptyTile(i));
  }

  // Groups: sparse → dense, remove empty entries
  const denseGroups = groups.filter(Boolean);

  return { meta, tiles: denseTiles, groups: denseGroups };
}


// ════════════════════════════════════════════════════════════════
//  SetBrowser  —  Panel + state management
// ════════════════════════════════════════════════════════════════

const SetBrowser = (() => {

  // ── Internal state ───────────────────────────────────────────
  let _setData    = null;   // { meta, tiles, groups } | null
  let _activeTileNr = -1;   // nr of the tile currently loaded in viewer (-1 = none)
  let _panelOpen  = false;
  let _collapsed  = false;

  // Active filter (phase 2 sets these values via UI)
  let _filterText  = '';      // free-text filter on model names
  let _filterGroup = -1;      // group index (-1 = all)
  let _viewMode    = 'grid';  // 'grid' | 'list'


  // ════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ════════════════════════════════════════════════════════════

  function init() {
    // Register HotReload hooks once HotReload is available
    if (typeof HotReload !== 'undefined') {
      HotReload.onWatchChange(_refreshAvailability);
      HotReload.onMDLChanged(_onMDLChanged);
    }
  }

  // Show panel (creates DOM on first call)
  function open() {
    if (!_panelEl()) _buildPanel();
    _panelEl().style.display = 'flex';
    _panelOpen = true;
  }

  // Hide panel (DOM is preserved, state is preserved)
  function close() {
    const el = _panelEl();
    if (el) el.style.display = 'none';
    _panelOpen = false;
  }

  // Read .set file and populate browser
  async function loadSetFile(file) {
    let text;
    try {
      text = await file.text();
    } catch (e) {
      logMsg(fmt('sb_read_error', { name: file.name, msg: e.message }), 'error');
      return;
    }

    _setData      = parseSetFile(text);
    _activeTileNr = -1;
    _filterText   = '';
    _filterGroup  = -1;

    logInfoI18n('sb_loaded', { name: file.name, n: _setData.tiles.length });
    setStatus(fmt('sb_loaded', { name: file.name, n: _setData.tiles.length }));

    // Open panel if not yet open
    if (!_panelOpen) open();

    _rebuildGroupSelect();
    _updateTitle();
    _renderTiles();
    _refreshAvailability();
  }


  // ════════════════════════════════════════════════════════════
  //  AVAILABILITY  (HotReload synchronisation)
  // ════════════════════════════════════════════════════════════

  // Checks for all tiles whether their MDL is in the watch folder and
  // updates the CSS classes of the tile elements accordingly.
  // Called on watch start/stop and after every tile click.
  function _refreshAvailability() {
    if (!_setData) return;

    // ── Watch Folder hint banner ─────────────────────────────────────
    const hintEl = document.getElementById('sb-watch-hint');
    if (hintEl) {
      const backend     = typeof HotReload !== 'undefined' ? HotReload.getBackend() : null;
      const watching    = typeof HotReload !== 'undefined' && HotReload.isWatching();
      if (!backend) {
        // Browser does not support File System Access API (Firefox etc.)
        hintEl.textContent = L('sb_watch_unsupported');
        hintEl.style.display = 'block';
      } else if (!watching) {
        // Supported but not yet active → prompt user to click Watch Folder
        hintEl.textContent = L('sb_watch_hint');
        hintEl.style.display = 'block';
      } else {
        hintEl.style.display = 'none';
      }
    }

    const canQuery = typeof HotReload !== 'undefined' &&
                     typeof HotReload.getMDLHandle === 'function';

    for (const tile of _setData.tiles) {
      const el = _tileEl(tile.nr);
      if (!el) continue;

      const available = canQuery && !!HotReload.getMDLHandle(tile.model);
      const isActive  = tile.nr === _activeTileNr;
      const nr        = String(tile.nr).padStart(3, '0');

      el.classList.toggle('sb-unavailable', !available && !isActive);
      el.classList.toggle('sb-available',    available && !isActive);
      el.classList.toggle('sb-active',       isActive);
      // sb-changed persists until _onTileClick() removes it

      // Update tooltip per state
      if (isActive) {
        // sb-changed may already be set (by _onMDLChanged) — respect priority
        el.title = el.classList.contains('sb-changed')
          ? fmt('sb_tile_changed',   { model: tile.model })
          : fmt('sb_tile_active_tip', { nr, model: tile.model });
      } else if (available) {
        el.title = fmt('sb_tile_available', { nr, model: tile.model });
      } else {
        el.title = L('sb_tile_unavail');
      }
    }
  }

  // MDL change in watch folder (callback from HotReload)
  // Sets sb-changed ONLY on the actively loaded tile.
  function _onMDLChanged(key) {
    if (_activeTileNr < 0 || !_setData) return;

    const activeTile = _setData.tiles[_activeTileNr];
    if (!activeTile) return;
    if (activeTile.model.toLowerCase() !== key.toLowerCase()) return;

    // Only the active tile gets the indicator — the user reloads manually.
    const el = _tileEl(_activeTileNr);
    if (el) {
      el.classList.add('sb-changed');
      el.title = fmt('sb_tile_changed', { model: activeTile.model });
    }
    setStatus(fmt('sb_tile_changed', { model: activeTile.model }));
  }


  // ════════════════════════════════════════════════════════════
  //  TILE CLICK  →  load model
  // ════════════════════════════════════════════════════════════

  async function _onTileClick(tileNr) {
    if (!_setData) return;
    const tile = _setData.tiles[tileNr];
    if (!tile) return;

    // If group filter active and group has more than 1 tile → load group
    if (_filterGroup >= 0) {
      const group = _setData.groups[_filterGroup];
      if (group && group.tileNrs.filter(n => n >= 0).length > 1
               && group.tileNrs.includes(tileNr)) {
        await _loadGroupTiles(group);
        return;
      }
    }

    // ── Single-tile path ─────────────────────────────────────────
    if (typeof HotReload === 'undefined' ||
        typeof HotReload.getMDLHandle !== 'function') return;

    const handle = HotReload.getMDLHandle(tile.model);
    if (!handle) return;

    if (typeof loadMDLFromHandle !== 'function') {
      logMsg('[SetBrowser] loadMDLFromHandle not available (phase 4)', 'warn');
      return;
    }

    try {
      if (_activeTileNr >= 0) {
        _tileEl(_activeTileNr)?.classList.remove('sb-changed');
      }

      await loadMDLFromHandle(handle);

      _activeTileNr = tileNr;
      _refreshAvailability();
      setStatus(fmt('sb_tile_loaded', { model: tile.model, nr: tile.nr }));
    } catch (e) {
      logMsg(fmt('sb_load_error', { model: tile.model, msg: e.message }), 'error');
    }
  }

  // ── Group view: load all tiles of a group together ────────────

  async function _loadGroupTiles(group) {
    if (!_setData || !group) return;

    if (typeof loadGroupFromHandles !== 'function') {
      logMsg('[SetBrowser] loadGroupFromHandles not available', 'warn');
      return;
    }

    const canQuery = typeof HotReload !== 'undefined' &&
                     typeof HotReload.getMDLHandle === 'function';

    // Build grid entries: tileNrs order = grid position
    // Negative values = empty slots → null
    const entries = group.tileNrs.map(nr => {
      if (nr < 0 || !_setData.tiles[nr]) return null;
      return canQuery ? HotReload.getMDLHandle(_setData.tiles[nr].model) : null;
    });

    const cols = group.cols || Math.ceil(Math.sqrt(entries.length));
    const rows = group.rows || Math.ceil(entries.length / cols);

    try {
      await loadGroupFromHandles(entries, cols, rows);
      _activeTileNr = -1;   // group active — no single tile highlighted
      _refreshAvailability();
    } catch (e) {
      logMsg(fmt('sb_load_error', { model: group.name, msg: e.message }), 'error');
    }
  }


  // ════════════════════════════════════════════════════════════
  //  FILTER  (set by phase-2 UI)
  // ════════════════════════════════════════════════════════════

  // Sets the free-text filter and re-renders the tile list.
  function setFilter(text) {
    _filterText = (text ?? '').toLowerCase().trim();
    _renderTiles();
    _refreshAvailability();
  }

  // Sets the group filter (-1 = all groups).
  function setGroupFilter(groupIdx) {
    _filterGroup = groupIdx;
    _renderTiles();
    _refreshAvailability();
  }

  // Switches between grid and list view.
  function setViewMode(mode) {
    _viewMode = mode === 'list' ? 'list' : 'grid';
    _renderTiles();
    _refreshAvailability();
  }

  // Returns the currently filtered tiles (for _renderTiles).
  function _filteredTiles() {
    if (!_setData) return [];
    let result = _setData.tiles;

    // Group filter
    if (_filterGroup >= 0) {
      const group = _setData.groups[_filterGroup];
      if (group) {
        const nrSet = new Set(group.tileNrs);
        result = result.filter(t => nrSet.has(t.nr));
      }
    }

    // Text filter (on model name and tile nr)
    if (_filterText) {
      result = result.filter(t =>
        t.model.includes(_filterText) ||
        String(t.nr).includes(_filterText)
      );
    }

    return result;
  }


  // ════════════════════════════════════════════════════════════
  //  PANEL DOM
  // ════════════════════════════════════════════════════════════

  // Reference to the panel element (or null if not yet created).
  function _panelEl() {
    return document.getElementById('set-browser-panel');
  }

  // Reference to the DOM element of a single tile.
  function _tileEl(nr) {
    return document.querySelector(`#set-browser-panel [data-tile-nr="${nr}"]`);
  }

  // ── Build panel ──────────────────────────────────────────────

  function _buildPanel() {
    // Panel inside #viewport so position:absolute works correctly
    const viewport = document.getElementById('viewport');
    if (!viewport) return;

    const panel = document.createElement('div');
    panel.id = 'set-browser-panel';

    // ── Handle (drag strip + title + toolbar buttons) ────────
    const handle = document.createElement('div');
    handle.id = 'sb-handle';
    handle.innerHTML =
      `<div class="sb-drag-area" id="sb-drag-area"></div>` +
      `<span class="sb-title" id="sb-title">${L('sb_panel_title')}</span>` +
      `<span class="sb-drag-strip" id="sb-drag-strip" title="${L('nd_drag_title')}">⠿ ⠿ ⠿</span>` +
      `<div class="sb-handle-btns">` +
        `<button class="sb-hbtn" id="sb-btn-grid" title="Grid" onclick="SetBrowser.setViewMode('grid')">⊞</button>` +
        `<button class="sb-hbtn" id="sb-btn-list" title="List" onclick="SetBrowser.setViewMode('list')">≡</button>` +
        `<button class="sb-hbtn sb-zoom-btn" onclick="SetBrowser.zoom(-1)" title="Decrease font size">−</button>` +
        `<button class="sb-hbtn sb-zoom-btn" id="sb-btn-zoom-reset" onclick="SetBrowser.zoom(0)" title="Reset font size">o</button>` +
        `<button class="sb-hbtn sb-zoom-btn" onclick="SetBrowser.zoom(1)"  title="Increase font size">+</button>` +
        `<button class="sb-hbtn" id="sb-btn-collapse" onclick="SetBrowser.toggleCollapse()" title="Collapse / Expand">▾</button>` +
        `<button class="sb-hbtn sb-hbtn-close" id="sb-btn-close" title="${L('nd_close_title')}" onclick="SetBrowser.close()">×</button>` +
      `</div>`;
    panel.appendChild(handle);

    // ── Toolbar (load file + filter + group dropdown) ─────────
    const toolbar = document.createElement('div');
    toolbar.id = 'sb-toolbar';

    // Hidden file input for .set files
    const fileInput = document.createElement('input');
    fileInput.type   = 'file';
    fileInput.accept = '.set';
    fileInput.id     = 'sb-file-input';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', e => {
      const f = e.target.files?.[0];
      if (f) SetBrowser.loadSetFile(f);
      fileInput.value = '';   // reset so the same file can be loaded again
    });
    toolbar.appendChild(fileInput);

    const loadBtn = document.createElement('button');
    loadBtn.className   = 'sb-tbtn';
    loadBtn.id          = 'sb-btn-load';
    loadBtn.dataset.i18n = 'sb_load_btn';
    loadBtn.textContent = L('sb_load_btn');
    loadBtn.onclick     = () => fileInput.click();
    toolbar.appendChild(loadBtn);

    const filter = document.createElement('input');
    filter.type        = 'text';
    filter.id          = 'sb-filter';
    filter.className   = 'sb-filter';
    filter.dataset.i18nPlaceholder = 'sb_filter_ph';
    filter.placeholder = L('sb_filter_ph');
    filter.oninput     = e => SetBrowser.setFilter(e.target.value);
    toolbar.appendChild(filter);

    const groupSel = document.createElement('select');
    groupSel.id        = 'sb-group-select';
    groupSel.className = 'sb-group-select';
    groupSel.onchange  = e => SetBrowser.setGroupFilter(parseInt(e.target.value, 10));
    toolbar.appendChild(groupSel);

    panel.appendChild(toolbar);

    // ── Watch Folder hint (shown when no watcher is active) ──────
    const watchHint = document.createElement('div');
    watchHint.id = 'sb-watch-hint';
    watchHint.style.display = 'none';   // _refreshAvailability() controls visibility
    panel.appendChild(watchHint);

    // ── Tile container (scrollbar) ───────────────────────────
    const body = document.createElement('div');
    body.id        = 'set-browser-body';
    body.className = 'sb-body';
    body.textContent = L('sb_no_set');
    panel.appendChild(body);

    // ── Status bar ───────────────────────────────────────────
    const status = document.createElement('div');
    status.id = 'sb-statusbar';
    status.className = 'sb-statusbar';
    panel.appendChild(status);

    viewport.appendChild(panel);

    // ── Start position: slightly offset from node-detail ──────
    _setDefaultPos(panel);

    // ── Initialise drag ──────────────────────────────────────
    _initDrag(panel,
      document.getElementById('sb-drag-area'),
      document.getElementById('sb-drag-strip'));

    // ── Populate group dropdown (empty until .set is loaded) ──
    _rebuildGroupSelect();
  }

  // Sets the panel to its default position in the viewport.
  function _setDefaultPos(panel) {
    const vp = document.getElementById('viewport');
    if (!vp) return;
    const pr = vp.getBoundingClientRect();
    // Centre-left, slightly below the top edge
    const x = Math.max(0, Math.floor(pr.width  * 0.08));
    const y = Math.max(0, Math.floor(pr.height * 0.1));
    panel.style.left = x + 'px';
    panel.style.top  = y + 'px';
    _dragPos = { x, y };
  }

  // ── Rebuild group select (after .set load) ───────────────

  function _rebuildGroupSelect() {
    const sel = document.getElementById('sb-group-select');
    if (!sel) return;
    sel.innerHTML = '';

    const all = document.createElement('option');
    all.value       = '-1';
    all.dataset.i18n = 'sb_group_all';
    all.textContent = L('sb_group_all');
    sel.appendChild(all);

    if (_setData) {
      _setData.groups.forEach((g, i) => {
        const opt = document.createElement('option');
        opt.value       = String(i);
        opt.textContent = g.name || `Group ${i}`;
        sel.appendChild(opt);
      });
    }

    sel.value = String(_filterGroup);
  }

  // ── Update title in handle ────────────────────────────────────

  function _updateTitle() {
    const titleEl = document.getElementById('sb-title');
    if (!titleEl) return;
    if (!_setData) {
      titleEl.textContent = L('sb_panel_title');
      return;
    }
    const name = _setData.meta.name || L('sb_panel_title');
    const n    = _setData.tiles.length;
    titleEl.textContent = `${name} · ${fmt('sb_tile_count', { n })}`;
  }

  // ── Update status bar ─────────────────────────────────────────

  function _updateStatusBar() {
    const bar = document.getElementById('sb-statusbar');
    if (!bar || !_setData) { if (bar) bar.textContent = ''; return; }
    const visible   = _filteredTiles();
    const available = visible.filter(t =>
      typeof HotReload !== 'undefined' &&
      typeof HotReload.getMDLHandle === 'function' &&
      !!HotReload.getMDLHandle(t.model)
    ).length;
    bar.textContent = fmt('sb_tile_count', { n: visible.length })
                    + (available > 0 ? `  ·  ${available} ✓` : '');
  }


  // ════════════════════════════════════════════════════════════
  //  TILE RENDERING
  // ════════════════════════════════════════════════════════════

  function _renderTiles() {
    const body = document.getElementById('set-browser-body');
    if (!body) return;

    if (!_setData) {
      body.className   = 'sb-body';
      body.textContent = L('sb_no_set');
      _updateStatusBar();
      return;
    }

    const visible = _filteredTiles();
    body.innerHTML = '';
    body.className = `sb-body sb-${_viewMode}`;

    if (_viewMode === 'grid') {
      _renderGrid(body, visible);
    } else {
      _renderList(body, visible);
    }

    _updateStatusBar();
  }

  function _renderGrid(container, tiles) {
    for (const tile of tiles) {
      const el = document.createElement('div');
      el.className       = 'sb-tile';
      el.dataset.tileNr  = tile.nr;
      el.dataset.model   = tile.model;
      el.title           = L('sb_tile_unavail');   // overwritten by _refreshAvailability
      el.onclick         = () => _onTileClick(tile.nr);
      el.innerHTML =
        `<span class="sb-tile-nr">#${String(tile.nr).padStart(3, '0')}</span>` +
        `<span class="sb-tile-model">${tile.model || '—'}</span>`;
      container.appendChild(el);
    }
  }

  function _renderList(container, tiles) {
    for (const tile of tiles) {
      const el = document.createElement('div');
      el.className      = 'sb-tile sb-tile-row';
      el.dataset.tileNr = tile.nr;
      el.dataset.model  = tile.model;
      el.title          = L('sb_tile_unavail');
      el.onclick        = () => _onTileClick(tile.nr);

      // Terrain corners compact: TL·TR / BL·BR
      const { tl = '?', tr = '?', bl = '?', br = '?' } = tile.terrain;
      const terrainStr = `${tl}·${tr} / ${bl}·${br}`;

      el.innerHTML =
        `<span class="sb-col-nr">#${String(tile.nr).padStart(3, '0')}</span>` +
        `<span class="sb-col-model">${tile.model || '—'}</span>` +
        `<span class="sb-col-terrain">${terrainStr}</span>`;
      container.appendChild(el);
    }
  }


  // ════════════════════════════════════════════════════════════
  //  ZOOM  (font size in tile container)
  // ════════════════════════════════════════════════════════════

  const SB_ZOOM_STEPS = [9, 10, 11, 12, 13, 14, 16];
  let _zoomIdx = 2;   // default: 11 px — corresponds to var(--font-size-small) in sb-body

  function zoom(step) {
    if (step === 0) _zoomIdx = 2;
    else if (step > 0) _zoomIdx = Math.min(_zoomIdx + 1, SB_ZOOM_STEPS.length - 1);
    else               _zoomIdx = Math.max(_zoomIdx - 1, 0);

    const body = document.getElementById('set-browser-body');
    if (body) body.style.fontSize = SB_ZOOM_STEPS[_zoomIdx] + 'px';

    // Dim reset button when at default
    const resetBtn = document.getElementById('sb-btn-zoom-reset');
    if (resetBtn) resetBtn.style.opacity = _zoomIdx === 2 ? '0.35' : '';
  }

  function toggleCollapse() {
    _collapsed = !_collapsed;
    const panel = _panelEl();
    if (!panel) return;
    panel.classList.toggle('sb-collapsed', _collapsed);
    const btn = document.getElementById('sb-btn-collapse');
    if (btn) btn.textContent = _collapsed ? '▴' : '▾';
  }


  // ════════════════════════════════════════════════════════════
  //  DRAG LOGIC  (self-contained, no interference with ui.js)
  // ════════════════════════════════════════════════════════════

  let _dragPos  = null;
  let _dragging = false;
  let _dStartX, _dStartY, _dStartL, _dStartT;

  function _evXY(e) {
    const src = e.touches ? e.touches[0] : e;
    return { x: src.clientX, y: src.clientY };
  }

  // Accepts multiple drag trigger elements (drag-area + strip).
  function _initDrag(panel, ...strips) {
    if (!strips.length) return;

    const onStart = e => {
      if (e.type === 'mousedown' && e.button !== 0) return;
      _dragging = true;
      const { x, y } = _evXY(e);
      _dStartX = x;  _dStartY = y;
      _dStartL = _dragPos?.x ?? panel.offsetLeft;
      _dStartT = _dragPos?.y ?? panel.offsetTop;
      strips.forEach(s => { if (s) s.style.cursor = 'grabbing'; });
      e.preventDefault();
    };

    const onMove = e => {
      if (!_dragging) return;
      if (e.cancelable) e.preventDefault();
      const { x, y } = _evXY(e);
      const vp  = document.getElementById('viewport');
      const pr  = vp.getBoundingClientRect();
      let newL  = _dStartL + (x - _dStartX);
      let newT  = _dStartT + (y - _dStartY);
      newL = Math.max(0, Math.min(pr.width  - panel.offsetWidth,  newL));
      newT = Math.max(0, Math.min(pr.height - panel.offsetHeight, newT));
      panel.style.left = newL + 'px';
      panel.style.top  = newT + 'px';
      _dragPos = { x: newL, y: newT };
    };

    const onEnd = () => {
      if (!_dragging) return;
      _dragging = false;
      strips.forEach(s => { if (s) s.style.cursor = 'grab'; });
    };

    // Attach listeners to all provided drag trigger elements
    for (const strip of strips) {
      if (!strip) continue;
      strip.addEventListener('mousedown',  onStart);
      strip.addEventListener('touchstart', onStart, { passive: false });
    }

    // Global move/end listeners
    window.addEventListener('mousemove',   onMove);
    window.addEventListener('mouseup',     onEnd);
    window.addEventListener('touchmove',   onMove,  { passive: false });
    window.addEventListener('touchend',    onEnd);
    window.addEventListener('touchcancel', onEnd);
  }


  // ════════════════════════════════════════════════════════════
  //  PUBLIC RETURN
  // ════════════════════════════════════════════════════════════

  return {
    init,
    open,
    close,
    loadSetFile,
    // For phase-2 UI bindings:
    setFilter,
    setGroupFilter,
    setViewMode,
    zoom,
    toggleCollapse,
    // For tests / debugging:
    getSetData:      () => _setData,
    getActiveTileNr: () => _activeTileNr,
  };

})();


// ── Initialise once DOM is ready ─────────────────────────────────
document.addEventListener('DOMContentLoaded', () => SetBrowser.init());
