/* ═══════════════════════════════════════════════
   NWN MDL Viewer — Three.js ES Module Loader
   ═══════════════════════════════════════════════

   NEW: Bridges the ES-module build of Three.js back onto the global
   `window.THREE` object, so none of the 25 classic script files have to
   change. Three.js dropped its UMD/global build after r160 — a plain
   <script src="three.min.js"> is no longer possible.

   Two load paths, selected by protocol (same check cleanmodels.js uses):

     HTTP(S) / Tauri   → import('vendor/three/three.module.min.js')
                         Tauri serves over http://ipc.localhost, not literal
                         file://, so it always takes this branch.
     file:// (+content:) → Chromium refuses module imports from file: URLs
                         ("Cross origin requests are only supported for
                         HTTP"). blob: URLs are exempt, so the module source
                         is decoded from an embedded Base64 string, wrapped
                         in a Blob and imported from its object URL —
                         mirroring the WASM-under-file:// trick in
                         cleanmodels.js.

   Sequencing: scene.js constructs a WebGLRenderer at parse time and
   animation.js calls animate(0) at the bottom of the file — every one of
   the 25 files assumes THREE already exists when it starts executing. The
   browser gives no ordering guarantee between an async loader and later
   scripts (verified: `defer` does NOT wait for a module script's top-level
   await), so this loader injects them itself, one at a time, awaiting each
   load event — the same pattern cleanmodels.js's _loadScript() already uses.

   The ordered file list stays defined exactly once, in index.html: the tags
   inside the viewer's module-marker comment block (see build.py's
   extract_js_order) carry type="text/nwn-script", which the browser does
   not execute. Both this loader (at runtime) and build.py (at build time)
   read that same block.
   NOTE: deliberately not spelling out the marker comment's exact text here —
   build.py searches the whole built HTML for it, and this file ends up
   inlined into that same HTML (see build.py step 2.6), so quoting it
   verbatim would make build.py match its own docs instead of the real
   marker. Cost a rebuilt-and-broken dist/index.html to find out.

   build.py emits the concatenated standalone bundle as a single inline tag
   of the same type; inline tags are injected via a blob URL rather than
   eval'd, so the code keeps running at global scope (ui.js's
   window[updateFn](val) lookup depends on that).

   Public API (window.threeLoader):
     threeLoader.ready()    – Promise, resolves once window.THREE is set
     threeLoader.isReady()  – boolean
   ═══════════════════════════════════════════════ */

const threeLoader = (() => {

  const THREE_MODULE_PATH = 'vendor/three/three.module.min.js';
  const THREE_B64_JS      = 'js/three_module_b64.js';
  const SCRIPT_TYPE       = 'text/nwn-script';

  const protocol = window.location.protocol;
  const _isLocal = protocol === 'file:' || protocol === 'content:';

  let _ready = false;
  let _readyResolve, _readyReject;
  const _readyPromise = new Promise((res, rej) => {
    _readyResolve = res;
    _readyReject  = rej;
  });
  // Nobody may be awaiting ready() when the failure happens — keep the
  // rejection from surfacing as an unhandled promise rejection.
  _readyPromise.catch(() => {});

  // ── Load a classic script and resolve once it has executed ──────────────
  function _loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src     = src;
      s.async   = false;   // keep execution order even if the browser prefetches
      s.onload  = resolve;
      s.onerror = () => reject(new Error('Script load error: ' + src));
      document.head.appendChild(s);
    });
  }

  // ── Run inline code at global scope via a blob URL ──────────────────────
  // Not eval()/new Function(): those would move top-level declarations out of
  // global scope, breaking cross-file references between the bundled files.
  function _loadInlineScript(code) {
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    return _loadScript(url).finally(() => URL.revokeObjectURL(url));
  }

  // ── Import Three.js, protocol-dependent ─────────────────────────────────
  async function _importTHREE() {
    if (!_isLocal) {
      // Absolute URL: a dynamic import() of a relative path without "./"
      // would be treated as a bare module specifier and fail.
      return await import(new URL(THREE_MODULE_PATH, document.baseURI).href);
    }

    // file:// — Base64 → Blob → import(blobUrl)
    // In the standalone HTML build the constant is already inlined ahead of
    // this file, so the extra script load is skipped (same as cleanmodels.js).
    if (typeof THREE_MODULE_B64 === 'undefined') {
      await _loadScript(THREE_B64_JS);
    }
    if (typeof THREE_MODULE_B64 === 'undefined') {
      throw new Error(THREE_B64_JS + ' missing — cannot load Three.js under ' + protocol);
    }

    const bin   = atob(THREE_MODULE_B64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

    const url = URL.createObjectURL(new Blob([bytes], { type: 'text/javascript' }));
    try {
      return await import(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // ── Run the viewer's own scripts, in document order, one at a time ───────
  async function _runViewerScripts() {
    const tags = document.querySelectorAll('script[type="' + SCRIPT_TYPE + '"]');
    for (const tag of tags) {
      const src = tag.getAttribute('src');
      if (src) await _loadScript(src);
      else if (tag.textContent.trim()) await _loadInlineScript(tag.textContent);
    }
  }

  // ── Fatal error surface ─────────────────────────────────────────────────
  // i18n.js and log.js are not loaded yet at this point, so this deliberately
  // uses plain English and touches the DOM directly instead of L()/logError().
  function _showFatal(err) {
    console.error('[three-loader]', err);
    const el = document.getElementById('empty-state');
    if (el) {
      el.innerHTML = '<div class="es-icon">⚠</div>' +
        '<p>Three.js failed to load</p>' +
        '<small>' + String(err && err.message || err) + '</small>';
    }
  }

  function _domReady() {
    if (document.readyState !== 'loading') return Promise.resolve();
    return new Promise(res => document.addEventListener('DOMContentLoaded', res, { once: true }));
  }

  async function _boot() {
    try {
      // Start fetching Three.js immediately; only the script-tag scan below
      // needs the parsed DOM.
      const threePromise = _importTHREE();
      await _domReady();

      window.THREE = await threePromise;
      _ready = true;
      _readyResolve();

      await _runViewerScripts();
    } catch (err) {
      _showFatal(err);
      _readyReject(err);
    }
  }

  _boot();

  return {
    ready:   () => _readyPromise,
    isReady: () => _ready,
  };

})();
