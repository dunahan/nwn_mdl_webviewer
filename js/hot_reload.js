/* ═══════════════════════════════════════════════
   NWN MDL Viewer — Texture Hot-Reload
   ═══════════════════════════════════════════════

   Watches a user-selected folder for changed texture files
   (TGA / DDS / PLT) and updates the textureCache + Three.js scene
   automatically without reloading the model.

   Backend abstraction (Tauri-ready):
     'browser-fsa'  – File System Access API (Chrome/Edge)
                      Polling via setInterval + FileSystemFileHandle
     'tauri'        – tauri-plugin-fs + tauri-plugin-dialog. Phase 1: same
                      polling as browser-fsa, fed by FileSystemHandle-shaped
                      shims (see _tauriDirRef / _tauriFileRef). Event-based
                      fs.watch() is phase 2.
     null           – not supported (Firefox etc.)

   Dependencies (global variables from other modules):
     textureCache          – textures.js
     parseTGA              – textures.js
     parseNWNDDS           – textures.js
     parseNWNPLT           – textures.js
     applyPLTPalette       – textures.js
     applyTexturesToScene  – session.js
     getNeededTextures     – loader.js   (texture filter based on model needs)
     getNodeTexKeys        – loader.js   (texture keys of a single node)
     currentModel          – scene.js    (currently loaded model)
     L / fmt               – i18n.js
     setStatus             – ui.js
     logInfoI18n / logWarnI18n / logMsg  – log.js

   Public API (window.HotReload):
     HotReload.init()              – call on DOMContentLoaded
     HotReload.toggle()            – button handler: pick folder / stop
     HotReload.getBackend()        – 'browser-fsa' | 'tauri' | null
     HotReload.getMDLHandle(name)  – FileSystemFileHandle | null (phase 3)
     HotReload.onWatchChange(cb)   – cb(active) on watch start/stop (phase 3)
     HotReload.onMDLChanged(cb)    – cb(key) on MDL change on disk (phase 3)
     HotReload.onModelLoaded()     – after applyTexturesToScene() from loader.js
     HotReload.setModelFileHandle(h) – MDL drop handle as picker hint

   Tauri phase 2 (later):
     Replace the polling in _backendStartWatch() / _backendStopWatch() with
     fs.watch() (needs tauri-plugin-fs feature "watch"). _onFileChanged() and
     all texture logic remain unchanged.
   ═══════════════════════════════════════════════ */

const HotReload = (() => {

  // ── Configuration ───────────────────────────────────────────────────────
  const POLL_MS  = 2000;                          // Polling interval (ms)
  const TEX_EXTS     = ['tga', 'dds', 'plt'];         // Supported texture extensions
  const TEX_PRIORITY = { 'dds': 3, 'tga': 2, 'plt': 1 }; // Higher value = preferred format
  const MDL_EXTS     = ['mdl'];                        // Supported model extensions (phase 3)
  const SCAN_DEPTH = 1;                            // Max. subdirectory depth for scan

  // ── Internal state ───────────────────────────────────────────────────────
  let _backend   = null;   // 'browser-fsa' | 'tauri' | null
  let _active    = false;
  let _pollTimer = null;

  // Map: basename (lowercase, without ext) → { handle, ext, lastModified }
  const _watched = new Map();

  // Map: basename (lowercase, without ext) → { handle, lastModified }  (phase 3)
  const _watchedMDL = new Map();

  // Callbacks for watch start/stop  (phase 3: SetBrowser registers here)
  const _watchChangeCallbacks = [];

  // Callbacks for MDL change on disk  (phase 3: SetBrowser registers here)
  const _mdlChangedCallbacks = [];

  // Set: keys explicitly clicked by the user (highlighted state)
  const _selectedWatchKeys = new Set();

  // FileSystemFileHandle of the last MDL loaded via drag & drop –
  // used as startIn hint for showDirectoryPicker().
  let _modelFileHandle = null;

  // ── Helper: filename → basename + ext ───────────────────────────────────
  function _splitName(name) {
    const lower = name.toLowerCase();
    const dot   = lower.lastIndexOf('.');
    if (dot < 0) return null;
    return { key: lower.slice(0, dot), ext: lower.slice(dot + 1) };
  }

  // ════════════════════════════════════════════════════════════════════════
  //  INIT
  // ════════════════════════════════════════════════════════════════════════

  function init() {
    _backend = _detectBackend();
    const btn = document.getElementById('btn-hot-reload');
    if (!btn) return;

    if (!_backend) {
      // Browser does not support feature → disable button + tooltip
      btn.disabled = true;
      btn.title    = L('hr_not_supported');
    }
  }

  // ── Backend detection ────────────────────────────────────────────────────
  function _detectBackend() {
    // FIX: require the plugin globals, not just __TAURI__ — otherwise the
    // button stays enabled but every click fails inside the picker.
    const T = typeof window !== 'undefined' ? window.__TAURI__ : null;
    if (T && T.dialog && T.fs && T.core && T.path)                        return 'tauri';
    if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) return 'browser-fsa';
    return null;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ════════════════════════════════════════════════════════════════════════

  // Main toggle: start folder selection / stop watching
  async function toggle() {
    if (!_backend) return;

    if (_active) {
      // Watcher running → stop and discard handles
      _backendStopWatch();
      _watched.clear();
      _watchedMDL.clear();
      _selectedWatchKeys.clear();
      _refreshNodeIndicators();
      _updateUI();
    } else {
      // Watcher inactive → pick folder and start
      await _backendPick();
    }
  }

  function getBackend() { return _backend; }

  // ════════════════════════════════════════════════════════════════════════
  //  BACKEND: 'browser-fsa'
  //  Can be swapped 1:1 for the Tauri counterpart later.
  // ════════════════════════════════════════════════════════════════════════

  async function _backendPick() {
    // Both pickers yield a directory handle; everything below is shared.
    let dirHandle;
    if (_backend === 'tauri') {
      dirHandle = await _tauriPickDir();
    } else {
      try {
        dirHandle = await window.showDirectoryPicker({
          mode:    'read',
          startIn: _modelFileHandle ?? 'documents',
        });
      } catch (_) {
        // User cancelled dialog → silently ignore
        return;
      }
    }
    if (!dirHandle) return;

    _watched.clear();
    _watchedMDL.clear();
    _selectedWatchKeys.clear();

    try {
      await _scanDir(dirHandle);
    } catch (e) {
      logMsg(`[HotReload] Folder scan error: ${e.message}`, 'warn');
      return;
    }

    const texCount = _watched.size;
    const mdlCount = _watchedMDL.size;

    if (texCount === 0 && mdlCount === 0) {
      setStatus(L('hr_no_textures'));
      return;
    }

    setStatus(fmt('hr_dir_picked', { n: texCount + mdlCount }));

    // Immediately fill in missing textures for the currently loaded model
    await _fillMissingTextures();

    _backendStartWatch();
    _refreshNodeIndicators();
  }

  // ── Tauri: FileSystemHandle-shaped shims ────────────────────────────────
  //
  // SetBrowser, loader.js (loadMDLFromHandle / _readMDLHandle) and _scanDir
  // only use .kind, .name, .getFile() and .entries(), so shims with that shape
  // leave all of them untouched.
  //
  // getLastModified() is stat-only: getFile() reads the whole file over IPC,
  // far too expensive for the 2 s poll across hundreds of files.
  // ponytail: symlinks are listed as plain files (readDir does not follow them),
  // symlinked folders are therefore not scanned; mtime == null falls back to the
  // file size (misses shrinking files). Upgrade: stat() the entry / fs.watch().

  async function _tauriMtime(path) {
    const s = await window.__TAURI__.fs.stat(path);
    return s.mtime ? s.mtime.getTime() : s.size;
  }

  function _tauriFileRef(path, name) {
    return {
      kind: 'file', name, path,
      getLastModified: () => _tauriMtime(path),
      async getFile() {
        const bytes = await window.__TAURI__.fs.readFile(path);
        return new File([bytes], name, { lastModified: await _tauriMtime(path) });
      },
    };
  }

  function _tauriDirRef(path, name) {
    return {
      kind: 'directory', name, path,
      async *entries() {
        const T = window.__TAURI__;
        for (const e of await T.fs.readDir(path)) {
          const child = await T.path.join(path, e.name);
          yield [e.name, e.isDirectory ? _tauriDirRef(child, e.name) : _tauriFileRef(child, e.name)];
        }
      },
    };
  }

  // Folder dialog + fs scope grant. Tauri's dialog does NOT grant fs access to
  // the chosen path — grant_folder_access (lib.rs) must run before any readDir.
  // Returns null on cancel or error.
  async function _tauriPickDir() {
    const T = window.__TAURI__;
    // Directory part of the last loaded MDL (if any) as dialog start folder.
    const start = _modelFileHandle?.path?.replace(/[\\/][^\\/]*$/, '');
    try {
      const path = await T.dialog.open({ directory: true, multiple: false, defaultPath: start });
      if (!path) return null;                                   // cancelled
      await T.core.invoke('grant_folder_access', { path });
      return _tauriDirRef(path, path);
    } catch (e) {
      // Tauri rejects with plain strings, not Error objects.
      logMsg(`[HotReload] Folder access error: ${e?.message ?? e}`, 'warn');
      return null;
    }
  }

  // FIX: mtime without reading the file where the handle can do that (Tauri);
  // falls back to getFile().lastModified for FileSystemFileHandle (unchanged).
  const _mtime = async h =>
    h.getLastModified ? h.getLastModified() : (await h.getFile()).lastModified;

  // ── Directory scan (recursive up to SCAN_DEPTH) ─────────────────────────
  //
  // Traverses dirHandle up to depth SCAN_DEPTH (currently 1 = root + direct
  // subdirectories). Each file found is registered in _watched (textures)
  // or _watchedMDL (MDL) depending on its extension.
  //
  // On name collisions (e.g. mdl/tca01.mdl and tca01.mdl in the root folder)
  // the last entry found wins (Map.set overwrites). Since NWN assets
  // by convention have unique base names, this is not a problem in practice.
  //
  async function _scanDir(dirHandle, depth = 0) {
    for await (const [name, handle] of dirHandle.entries()) {

      if (handle.kind === 'directory') {
        // Subdirectory: go one level deeper if depth limit not reached
        if (depth < SCAN_DEPTH) await _scanDir(handle, depth + 1);
        continue;
      }

      const parts = _splitName(name);
      if (!parts) continue;

      if (TEX_EXTS.includes(parts.ext)) {
        const existing = _watched.get(parts.key);
        const newPrio  = TEX_PRIORITY[parts.ext] ?? 0;
        const oldPrio  = existing ? (TEX_PRIORITY[existing.ext] ?? 0) : -1;
        if (!existing || newPrio > oldPrio) {
          _watched.set(parts.key, { handle, ext: parts.ext, lastModified: await _mtime(handle) });
        }
      } else if (MDL_EXTS.includes(parts.ext)) {
        _watchedMDL.set(parts.key, { handle, lastModified: await _mtime(handle) });
      }
    }
  }

  function _backendStartWatch() {
    if (_active) return;
    _active    = true;
    _pollTimer = setInterval(_poll, POLL_MS);
    document.getElementById('node-list')?.classList.add('node-list-watching');
    _watchChangeCallbacks.forEach(cb => cb(true));
    _updateUI();
  }

  function _backendStopWatch() {
    if (!_active) return;
    _active = false;
    clearInterval(_pollTimer);
    _pollTimer = null;
    document.getElementById('node-list')?.classList.remove('node-list-watching');
    _watchChangeCallbacks.forEach(cb => cb(false));
  }

  // ── Polling loop (browser-fsa) ───────────────────────────────────────────
  async function _poll() {
    // ── Texture changes ──────────────────────────────────────────────────
    for (const [key, entry] of _watched.entries()) {
      try {
        // FIX #149: Read file metadata and content in one step, then drop the
        // File object immediately. On Windows/Chromium, keeping a File reference
        // alive holds an OS-level file descriptor open. Passing the raw ArrayBuffer
        // to _onFileChanged instead of the File object ensures the descriptor is
        // released as soon as the GC collects the short-lived File.
        const mtime = await _mtime(entry.handle);
        if (mtime <= entry.lastModified) continue;
        let file = await entry.handle.getFile();
        const buffer = await file.arrayBuffer();
        file = null;  // release OS handle (Windows/Chromium lock fix)
        // FIX: advance lastModified only after a successful read. A failed read
        // (editor still holding the file on Windows) is retried on the next poll
        // instead of being lost until the next save.
        entry.lastModified = mtime;
        await _onFileChanged(key, entry.ext, buffer);
      } catch (_) {
        // Handle lost (file deleted / folder no longer accessible) → skip
      }
    }

    // ── MDL changes (phase 3) ────────────────────────────────────────────
    // Only check lastModified and fire callback — no auto-reload.
    // SetBrowser decides what to do (set sb-changed indicator).
    for (const [key, entry] of _watchedMDL.entries()) {
      try {
        const mtime = await _mtime(entry.handle);
        if (mtime <= entry.lastModified) continue;
        entry.lastModified = mtime;
        _mdlChangedCallbacks.forEach(cb => cb(key));
      } catch (_) {
        // Handle lost → skip
      }
    }
  }

  // ── Fill missing textures from the watched folder ────────────────────────
  //
  // Runs once (no polling) and loads all files from _watched
  // that are NOT yet present in the textureCache.
  // Triggered: (a) directly after _backendPick(), (b) after every model load
  // via HotReload.onModelLoaded() from loader.js.
  //
  // Batched: applyTexturesToScene() is called only once at the end,
  // not for each individual texture.
  //
  async function _fillMissingTextures() {
    if (_watched.size === 0) return 0;

    // Only load textures actually needed by the current model.
    // getNeededTextures() is global in loader.js; currentModel global in scene.js.
    const needed = (typeof getNeededTextures === 'function' &&
                    typeof currentModel !== 'undefined' && currentModel)
      ? getNeededTextures(currentModel)
      : null;   // null = no filter (fallback if model not yet loaded)

    let filled = 0;

    for (const [key, entry] of _watched.entries()) {
      if (needed && !needed.has(key)) continue;  // not needed by model → skip
      if (textureCache[key])          continue;  // already in cache → skip

      let buffer;
      try {
        // FIX #149: Null the File reference immediately after reading to release
        // the OS-level file descriptor on Windows/Chromium.
        let file = await entry.handle.getFile();
        buffer   = await file.arrayBuffer();
        file     = null;  // release OS handle (Windows/Chromium lock fix)
      } catch (_) {
        continue;   // handle no longer accessible → skip
      }

      let newTex;
      try {
        if      (entry.ext === 'tga') newTex = parseTGA(buffer);
        else if (entry.ext === 'dds') newTex = parseNWNDDS(buffer);
        else if (entry.ext === 'plt') {
          newTex = parseNWNPLT(buffer);
          newTex.userData.pltTexKey = key;
        }
        else continue;
      } catch (e) {
        logWarnI18n('hr_parse_error', { name: key + '.' + entry.ext, msg: e.message });
        continue;
      }

      textureCache[key] = newTex;

      // PLT: apply palette immediately with current layer settings
      if (entry.ext === 'plt' && typeof applyPLTPalette === 'function') {
        applyPLTPalette(textureCache[key]);
      }

      filled++;
    }

    if (filled > 0) {
      if (typeof applyTexturesToScene   === 'function') applyTexturesToScene();
      if (typeof resolveMissingTextures === 'function') resolveMissingTextures();
      if (typeof updateTextureUI        === 'function') updateTextureUI();
      logInfoI18n('hr_filled_missing', { n: filled });
      setStatus(fmt('hr_filled_missing', { n: filled }));
    }

    return filled;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  TEXTURE RELOAD  (backend-independent)
  //  Remains completely unchanged during Tauri migration.
  // ════════════════════════════════════════════════════════════════════════

  // FIX #149: Signature changed from (key, ext, file) to (key, ext, buffer).
  // The caller (_poll) now reads arrayBuffer() and drops the File reference
  // before calling here, so no OS file descriptor is held during parse/update.
  async function _onFileChanged(key, ext, buffer) {
    // Only update textures needed by the current model.
    if (typeof getNeededTextures === 'function' &&
        typeof currentModel !== 'undefined' && currentModel) {
      if (!getNeededTextures(currentModel).has(key)) return;
    }

    // 1. buffer is received directly — no file read needed here

    // 2. Parse (same parsers as loader.js)
    let newTex;
    try {
      if      (ext === 'tga') newTex = parseTGA(buffer);
      else if (ext === 'dds') newTex = parseNWNDDS(buffer);
      else if (ext === 'plt') {
        newTex = parseNWNPLT(buffer);
        newTex.userData.pltTexKey = key;
      }
      else return;
    } catch (e) {
      logWarnI18n('hr_parse_error', { name: key + '.' + ext, msg: e.message });
      return;
    }

    // 3. Update cache
    const existing = textureCache[key];
    if (existing && existing.image instanceof HTMLCanvasElement) {
      // In-place patch: replace canvas content of the existing THREE.Texture.
      // All materials in the scene show the new image without re-assignment.
      _patchCanvasInPlace(existing, newTex);
    } else {
      // Texture was not yet in cache → register and reassign to scene.
      textureCache[key] = newTex;
      if (typeof applyTexturesToScene === 'function') applyTexturesToScene();
    }

    // 4. PLT: reapply palette with current layer settings
    if (ext === 'plt' && typeof applyPLTPalette === 'function') {
      applyPLTPalette(textureCache[key]);
    }

    // 5. Log + status bar + flash node indicator
    _flashNodeIndicator(key);
    logInfoI18n('hr_reloaded', { name: key + '.' + ext });
    setStatus(fmt('hr_reloaded', { name: key + '.' + ext }));
  }

  // ── Replace canvas content of a CanvasTexture in place ───────────────────
  //
  // Strategy: draw new canvas content onto the existing canvas.
  // The THREE.Texture object reference is preserved → all materials
  // that already reference this texture immediately show the new image
  // after needsUpdate = true (no applyTexturesToScene needed).
  //
  // Resize: reassign canvas.width/height (resets canvas content,
  // then drawImage from new canvas). Three.js accepts this GPU-side via needsUpdate.
  //
  function _patchCanvasInPlace(target, source) {
    const srcCvs = source.image;
    const tgtCvs = target.image;
    const ctx    = tgtCvs.getContext('2d');

    // Adjust dimensions (reset via size assignment is intentional)
    if (tgtCvs.width !== srcCvs.width || tgtCvs.height !== srcCvs.height) {
      tgtCvs.width  = srcCvs.width;
      tgtCvs.height = srcCvs.height;
    } else {
      ctx.clearRect(0, 0, tgtCvs.width, tgtCvs.height);
    }

    ctx.drawImage(srcCvs, 0, 0);

    // Transfer userData (hasAlpha, isPLT, pltBuffer, pltTexKey, …)
    // Existing keys are preserved; new keys from source are merged in.
    Object.assign(target.userData, source.userData);

    target.needsUpdate = true;

    // Release intermediate canvas (GC hint)
    source.dispose();
  }

  // ════════════════════════════════════════════════════════════════════════
  //  SCENE GRAPH INDICATORS
  //
  //  Shows a ↻ symbol next to every node whose texture is being watched.
  //  On an actual reload the indicator of the affected node flashes.
  // ════════════════════════════════════════════════════════════════════════

  // Refresh all node indicators (after watcher start/stop + after model load)
  function _refreshNodeIndicators() {
    const items = document.querySelectorAll('.node-item');
    if (!items.length) return;

    const watching = _active && _watched.size > 0;

    items.forEach(item => {
      const existing = item.querySelector('.watch-indicator');

      if (!watching) {
        existing?.remove();
        return;
      }

      // Look up node object from currentModel
      const nodeName = item.dataset.name;
      const node = (typeof currentModel !== 'undefined' && currentModel)
        ? currentModel.nodes.find(n => n.name === nodeName)
        : null;

      // Match texture keys of this node against the _watched set
      const isWatched = node &&
        typeof getNodeTexKeys === 'function' &&
        [...getNodeTexKeys(node)].some(k => _watched.has(k));

      if (isWatched) {
        if (!existing) {
          const watchedKeys = [...getNodeTexKeys(node)].filter(k => _watched.has(k));
          const ind = document.createElement('span');
          ind.className   = 'watch-indicator';
          ind.textContent = '↻';
          // Tooltip: show actual texture filenames
          ind.title = watchedKeys
            .map(k => k + '.' + (_watched.get(k)?.ext ?? ''))
            .join('\n');
          ind.onclick = (e) => {
            e.stopPropagation();
            _showWatchedTexInfo(watchedKeys);
          };
          item.appendChild(ind);
        }
      } else {
        existing?.remove();
      }
    });
  }

  // Brief flash of the indicator for all nodes using the key
  function _flashNodeIndicator(key) {
    document.querySelectorAll('.node-item').forEach(item => {
      const ind = item.querySelector('.watch-indicator');
      if (!ind) return;

      const nodeName = item.dataset.name;
      const node = (typeof currentModel !== 'undefined' && currentModel)
        ? currentModel.nodes.find(n => n.name === nodeName)
        : null;

      if (node && typeof getNodeTexKeys === 'function' &&
          [...getNodeTexKeys(node)].some(k => k === key)) {
        ind.classList.remove('watch-flash');
        // Force reflow so the animation restarts
        void ind.offsetWidth;
        ind.classList.add('watch-flash');
      }
    });
  }

  // Click on ↻: toggle selection, update states of all indicators,
  // highlight texture list and set status bar.
  function _showWatchedTexInfo(watchedKeys) {
    if (!watchedKeys.length) return;

    // Toggle: if all clicked keys were already selected → deselect, otherwise select
    const allAlreadySelected = watchedKeys.every(k => _selectedWatchKeys.has(k));
    if (allAlreadySelected) {
      watchedKeys.forEach(k => _selectedWatchKeys.delete(k));
    } else {
      watchedKeys.forEach(k => _selectedWatchKeys.add(k));
    }

    _updateIndicatorStates();

    // Status bar + texture list highlight only when selecting (not when deselecting)
    if (!allAlreadySelected) {
      const names = watchedKeys
        .map(k => k + '.' + (_watched.get(k)?.ext ?? ''))
        .join(', ');
      setStatus(fmt('hr_watching_node', { names }));

      watchedKeys.forEach(k => {
        const entry = document.querySelector(
          `#texture-list .tex-entry[data-texkey="${CSS.escape(k)}"]`
        );
        if (!entry) return;
        entry.classList.remove('tex-watch-highlight');
        void entry.offsetWidth;
        entry.classList.add('tex-watch-highlight');
        entry.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    }
  }

  // Colour all ↻ indicators according to the current selection state:
  //   No selection active → all light blue (neutral)
  //   Selection active:
  //     selected keys      → gold (wi-selected)
  //     all others         → dark blue (wi-dimmed)
  function _updateIndicatorStates() {
    const hasSelection = _selectedWatchKeys.size > 0;

    document.querySelectorAll('.node-item').forEach(item => {
      const ind = item.querySelector('.watch-indicator');
      if (!ind) return;

      ind.classList.remove('wi-selected', 'wi-dimmed');
      if (!hasSelection) return;   // Neutral → no extra class

      const nodeName = item.dataset.name;
      const node = (typeof currentModel !== 'undefined' && currentModel)
        ? currentModel.nodes.find(n => n.name === nodeName)
        : null;

      const isSelected = node &&
        typeof getNodeTexKeys === 'function' &&
        [...getNodeTexKeys(node)].some(k => _selectedWatchKeys.has(k));

      ind.classList.add(isSelected ? 'wi-selected' : 'wi-dimmed');
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  //  UI
  // ════════════════════════════════════════════════════════════════════════

  function _updateUI() {
    const btn    = document.getElementById('btn-hot-reload');
    const status = document.getElementById('hot-reload-status');
    if (!btn) return;

    if (_active && (_watched.size > 0 || _watchedMDL.size > 0)) {
      btn.classList.add('active');
      btn.textContent = L('hr_btn_stop');
      btn.setAttribute('data-i18n', 'hr_btn_stop');
      if (status) status.textContent = fmt('hr_watching', { n: _watched.size + _watchedMDL.size });
    } else {
      btn.classList.remove('active');
      btn.textContent = L('hr_btn_watch');
      btn.setAttribute('data-i18n', 'hr_btn_watch');
      if (status) status.textContent = '';
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  PUBLIC
  // ════════════════════════════════════════════════════════════════════════

  // Called from loader.js after every applyTexturesToScene() call.
  // Immediately fills in missing textures for the newly loaded model,
  // provided the watcher is active and knows the matching folder.
  async function onModelLoaded() {
    if (!_active || _watched.size === 0) return;
    await _fillMissingTextures();   // await + return → caller can wait for texture fill
    _refreshNodeIndicators();
    _updateIndicatorStates();
  }

  // Called from loader.js after a drag & drop.
  // Stores the MDL FileHandle as the start-folder hint for showDirectoryPicker().
  function setModelFileHandle(handle) {
    _modelFileHandle = handle;
  }

  return {
    init,
    toggle,
    getBackend,
    onModelLoaded,
    setModelFileHandle,
    // Phase 3: SetBrowser interface
    getMDLHandle:   name => _watchedMDL.get(name.toLowerCase())?.handle ?? null,
    onWatchChange:  cb   => _watchChangeCallbacks.push(cb),
    onMDLChanged:   cb   => _mdlChangedCallbacks.push(cb),
    // Returns true when the watcher is running and has found at least one file.
    // Used by SetBrowser to show/hide the "Watch Folder required" hint banner.
    isWatching:     ()   => _active && _watched.size > 0,
  };

})();

// Initialise as soon as the DOM is ready.
// FIX: see the matching comment in floating_panel.js — three-loader.js injects
// this file after DOMContentLoaded has already fired, so a bare
// addEventListener('DOMContentLoaded', …) here would never run.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => HotReload.init());
} else {
  HotReload.init();
}
