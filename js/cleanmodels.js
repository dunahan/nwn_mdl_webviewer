/* ═══════════════════════════════════════════════
   NWN MDL Viewer — cleanmodels-wasm Integration
   ═══════════════════════════════════════════════
   The WASM module installs a global `cleanmodels`
   object with synchronous methods (no stdin/stdout):

     cleanmodels.version()             → string
     cleanmodels.decompile(Uint8Array) → { ok, ascii }   | { ok, error }
     cleanmodels.compile(string)       → { ok, binary }  | { ok, error }
     cleanmodels.parse(string)         → { ok, warnings }| { ok, error }

   Workflow:
     1. Load WASM binary (Base64 for file://, fetch for HTTP)
     2. Start go.run(instance) — runs permanently, never await
     3. Wait for window.cleanmodels (Polling)
     4. cm.decompile(ArrayBuffer) → Promise<string> (ASCII-MDL)
   ═══════════════════════════════════════════════ */

const CM_WASM_PATH   = 'wasm/cleanmodels.wasm';
const CM_WASM_B64_JS = 'js/cleanmodels_wasm.js';

const cm = (() => {

  const protocol = window.location.protocol;
  const _isLocal = protocol === 'file:' || protocol === 'content:';
  let _moduleReady = false;
  let _readyResolve, _readyReject;
  const _readyPromise = new Promise((res, rej) => {
    _readyResolve = res;
    _readyReject  = rej;
  });

  let _progressCb       = null;  // External progress callback
  let _fetchController  = null;  // AbortController for fetch cancellation

  function _fireProgress(evt) {
    if (typeof _progressCb === 'function') _progressCb(evt);
  }

  function _loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload  = resolve;
      s.onerror = () => reject(new Error(fmt('cm_script_error', { src })));
      document.head.appendChild(s);
    });
  }

  // Waits until window.cleanmodels is set (go.run installs it async).
  function _waitForGlobal(timeout = 10000) {
    return new Promise((resolve, reject) => {
      if (window.cleanmodels) { resolve(); return; }
      const start    = Date.now();
      const interval = setInterval(() => {
        if (window.cleanmodels) {
          clearInterval(interval);
          resolve();
        } else if (Date.now() - start > timeout) {
          clearInterval(interval);
          reject(new Error(L('cm_timeout')));
        }
      }, 20);
    });
  }

  async function _load() {
    console.info(fmt('cm_start', { mode: _isLocal ? protocol : 'HTTP' }));

    if (typeof Go === 'undefined') {
      _readyReject(new Error(L('cm_no_wasm_exec')));
      return;
    }

    try {
      // ── 1. Load WASM binary ──────────────────────────────────────
      let wasmBuffer;

      if (_isLocal) {
        // Local (file:// / content:): Base64 path, no streaming possible
        _fireProgress({ phase: 'fetch_indeterminate' });
        if (typeof CM_WASM_B64 === 'undefined') {
          console.info(fmt('cm_loading_b64', { src: CM_WASM_B64_JS }));
          await _loadScript(CM_WASM_B64_JS);
        }
        if (typeof CM_WASM_B64 === 'undefined') {
          throw new Error(fmt('cm_b64_missing', { src: CM_WASM_B64_JS }));
        }
        _fireProgress({ phase: 'decode' });
        const bin = atob(CM_WASM_B64);
        const buf = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        wasmBuffer = buf.buffer;
        console.info(fmt('cm_b64_decoded', { size: (wasmBuffer.byteLength / 1048576).toFixed(2) }));
      } else {
        // HTTP: Streaming fetch with progress indication
        _fetchController = new AbortController();
        const resp = await fetch(CM_WASM_PATH, { signal: _fetchController.signal });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);

        const contentLength = resp.headers.get('Content-Length');
        const total = contentLength ? parseInt(contentLength, 10) : 0;

        if (total > 0 && resp.body) {
          // Determinate: Content-Length known → show real %
          const reader = resp.body.getReader();
          const chunks = [];
          let loaded = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            loaded += value.length;
            _fireProgress({ phase: 'fetch', loaded, total,
              pct: Math.round(loaded / total * 100) });
          }
          const all = new Uint8Array(loaded);
          let offset = 0;
          for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; }
          wasmBuffer = all.buffer;
        } else {
          // Indeterminate: no Content-Length (e.g., compression without known size)
          _fireProgress({ phase: 'fetch_indeterminate' });
          wasmBuffer = await resp.arrayBuffer();
        }
        console.info(fmt('cm_wasm_loaded', { size: (wasmBuffer.byteLength / 1048576).toFixed(2) }));
      }

      // ── 2. Create instance and start go.run() ─────────────────
      // go.run() runs permanently — fire-and-forget, DO NOT await.
      _fireProgress({ phase: 'compile' });
      const go   = new Go();
      const wasm = await WebAssembly.compile(wasmBuffer);

      _fireProgress({ phase: 'instantiate' });
      const instance = await WebAssembly.instantiate(wasm, go.importObject);

      console.info(L('cm_instantiated'));
      go.run(instance);

      // ── 3. Wait for window.cleanmodels ─────────────────────────
      _fireProgress({ phase: 'wait' });
      await _waitForGlobal();

      _moduleReady = true;
      _readyResolve();

      _fireProgress({ phase: 'ready' });
      const ver = window.cleanmodels.version ? window.cleanmodels.version() : '?';
      console.info(fmt('cm_ready', { ver }));

    } catch (err) {
      if (err && err.name === 'AbortError') return;  // User aborted
      console.error(L('cm_load_error'), err);
      _readyReject(err);
    }
  }

  // Decompiles a binary MDL (ArrayBuffer) → Promise<string> (ASCII)
  async function decompile(buffer) {
    await _readyPromise;
    const bytes  = new Uint8Array(buffer);
    const result = window.cleanmodels.decompile(bytes);
    if (!result || !result.ok) {
      const msg = (result && result.error) ? result.error : L('cm_unknown_error');
      throw new Error(fmt('cm_decompile_error', { msg }));
    }
    console.info(fmt('cm_decompile_ok', { n: result.ascii.length }));
    return result.ascii;
  }

  async function version() {
    await _readyPromise;
    return window.cleanmodels.version ? window.cleanmodels.version() : null;
  }

  function isReady() { return _moduleReady; }
  function ready()   { return _readyPromise; }
  function onProgress(fn) { _progressCb = fn; }
  function cancelLoad() {
    if (_fetchController) { _fetchController.abort(); _fetchController = null; }
  }

  _load();
  return { decompile, version, isReady, ready, onProgress, cancelLoad };

})();

// ─────────────────────────────────────────────
function isBinaryMDL(buffer) {
  if (!buffer || buffer.byteLength < 4) return false;
  const b = new Uint8Array(buffer, 0, 1)[0];
  return !(b === 0x09 || b === 0x0A || b === 0x0D || (b >= 0x20 && b <= 0x7E));
}
