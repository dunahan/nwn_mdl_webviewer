/* ═══════════════════════════════════════════════
   NWN MDL Viewer — Static UI Event Bindings
   ═══════════════════════════════════════════════

   Wires up every element in index.html that used to carry an inline
   onclick="…"/onchange="…"/oninput="…"/onblur="…" HTML attribute.

   WHY THIS FILE EXISTS:
   Content-Security-Policy's script-src (see tauri.conf.json in the
   nwn_mdl_viewer_tauri repo) does NOT include 'unsafe-inline'. Inline
   event-handler HTML ATTRIBUTES are gated by script-src exactly like
   <script> blocks are — under a strict CSP they simply never fire
   (silently, no console error in older WebKitGTK — this is what made
   language/theme switching and most sidebar buttons appear "dead" while
   addEventListener-based code, like drag&drop, kept working fine).
   Moving every handler here — plain addEventListener calls from an
   already-CSP-approved external script file — restores full
   functionality without weakening script-src.

   Must load AFTER every other module (all referenced functions/objects
   — HotReload, SetBrowser, toggleSidebar, switchLanguage, etc. — need to
   already exist) and runs immediately: this script tag sits at the end
   of <body>, so the DOM is already fully parsed by the time it executes
   (same assumption the rest of the codebase already makes, e.g.
   loader.js's top-level getElementById calls).

   Companion fixes for dynamically-generated innerHTML with the same
   problem: js/ui.js (node-detail zoom/close buttons), js/setbrowser.js
   (panel handle buttons), js/wok.js (per-material color picker inputs).
   ═══════════════════════════════════════════════ */

(function () {
  // Small helper: addEventListener with a null-safety check, so a
  // missing element (e.g. a future markup change) logs instead of
  // throwing and blocking every binding after it.
  function on(id, type, handler) {
    const el = document.getElementById(id);
    if (!el) { console.warn('[ui_bindings] Element nicht gefunden: #' + id); return; }
    el.addEventListener(type, handler);
  }

  // ── Header / Sidebar ──────────────────────────────────────────────
  on('sidebar-toggle', 'click', toggleSidebar);
  on('lang-select',    'change', e => switchLanguage(e.target.value));
  on('theme-select',   'change', e => onThemeSelect(e.target.value));
  on('theme-file-input', 'change', e => {
    loadCustomThemeFile(e.target.files[0]);
    e.target.value = '';
  });

  // ── Drop zone / Scene Graph / Textures ─────────────────────────────
  on('drop-zone',      'click', () => document.getElementById('file-input').click());
  on('texture-header', 'click', toggleTextureList);
  on('section-title',  'click', toggleSceneGraph);

  // ── Node-Visibility-Toolbar ─────────────────────────────────────────
  on('ntb-all',  'click', () => nodeVisAll(true));
  on('ntb-none', 'click', () => nodeVisAll(false));
  document.querySelectorAll('.ntb-type').forEach(btn => {
    btn.addEventListener('click', () => nodeVisToggleType(btn.dataset.type));
  });

  // ── Animations-Panel ─────────────────────────────────────────────────
  on('anim-header',   'click', toggleAnimPanel);
  on('anim-select',   'change', e => onAnimSelect(e.target.value));
  on('btn-anim-play', 'click', toggleAnimPlay);
  on('anim-scrubber', 'input',  e => onScrub(e.target.value));
  on('anim-scrubber', 'change', e => onScrub(e.target.value));
  // Scoped to #anim-speed-row: dwk-state-* buttons below also use the
  // "speed-btn" class for styling but are unrelated (setDWKState, not
  // setAnimSpeed) — the scoped selector keeps the two from colliding.
  document.querySelectorAll('#anim-speed-row .speed-btn').forEach(btn => {
    btn.addEventListener('click', () => setAnimSpeed(parseFloat(btn.dataset.speed)));
  });

  // ── PLT Layer-Panel / Hot-Reload ─────────────────────────────────────
  on('plt-header',     'click', togglePLTPanel);
  on('btn-hot-reload',  'click', () => HotReload.toggle());

  // ── Wireframe / Lighting / Mesh Opacity sliders ─────────────────────
  on('wire-opacity', 'input', e => updateWireframe(e.target.value));
  on('wire-val',     'input', e => syncSlider('wire-opacity', e.target, 'updateWireframe'));
  on('wire-val',     'blur',  e => clampValInput(e.target, 0, 100));

  on('light-intensity', 'input', e => updateLight(e.target.value));
  on('light-val',       'input', e => syncSlider('light-intensity', e.target, 'updateLight'));
  on('light-val',       'blur',  e => clampValInput(e.target, 0, 200));

  on('mesh-opacity', 'input', e => updateMeshOpacity(e.target.value));
  on('mesh-val',     'input', e => syncSlider('mesh-opacity', e.target, 'updateMeshOpacity'));
  on('mesh-val',     'blur',  e => clampValInput(e.target, 0, 100));

  // ── View toggle buttons ───────────────────────────────────────────
  on('btn-normals',  'click', toggleNormals);
  on('btn-grid',     'click', toggleGrid);
  on('btn-floor',    'click', toggleFloor);
  on('btn-axes',     'click', toggleAxes);
  on('btn-bbox',     'click', toggleBBox);
  on('btn-rotate',   'click', toggleAutoRotate);
  on('btn-resetcam', 'click', resetCamera);
  on('btn-skeleton', 'click', toggleSkeleton);

  // ── PWK / WOK / DWK Walkmesh controls ────────────────────────────────
  on('btn-pwk',         'click', togglePWK);
  on('btn-pwk-pin',     'click', togglePwkPin);
  on('btn-walkmesh',     'click', toggleWalkMesh);
  on('btn-walkmesh-pin', 'click', toggleWokPin);
  on('btn-dwk',         'click', toggleDWK);
  on('btn-dwk-pin',     'click', toggleDwkPin);
  on('dwk-state-closed', 'click', () => setDWKState('closed'));
  on('dwk-state-open1',  'click', () => setDWKState('open1'));
  on('dwk-state-open2',  'click', () => setDWKState('open2'));

  // ── Set Browser / Decompile Overlay ──────────────────────────────────
  on('btn-set-browser',  'click', () => SetBrowser.open());
  on('dcmp-cancel-btn',  'click', cancelDecompile);

  // ── Mesh-Colors Dropdown ──────────────────────────────────────────
  on('color-dropdown-toggle', 'click', toggleColorDropdown);
  on('cpwk-wg',  'input', e => updatePwkColor('wg',  e.target.value));
  on('cpwk-iop', 'input', e => updatePwkColor('iop', e.target.value));
  on('cdwk-wg',  'input', e => updateDwkColor('wg',  e.target.value));
  on('cdwk-dp',  'input', e => updateDwkColor('dp',  e.target.value));

  // ── Status bar ──────────────────────────────────────────────────────
  on('log-toggle', 'click', toggleLogPanel);
})();
