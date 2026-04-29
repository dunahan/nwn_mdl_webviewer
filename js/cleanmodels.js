/* ═══════════════════════════════════════════════
   NWN MDL Viewer — cleanmodels-wasm Integration
   ═══════════════════════════════════════════════
   Das WASM-Modul installiert ein globales `cleanmodels`-
   Objekt mit synchronen Methoden (kein stdin/stdout):

     cleanmodels.version()             → string
     cleanmodels.decompile(Uint8Array) → { ok, ascii }   | { ok, error }
     cleanmodels.compile(string)       → { ok, binary }  | { ok, error }
     cleanmodels.parse(string)         → { ok, warnings }| { ok, error }

   Ablauf:
     1. WASM-Binary laden (Base64 bei file://, fetch bei HTTP)
     2. go.run(instance) starten — läuft permanent, nie awaiten
     3. Auf window.cleanmodels warten (Polling)
     4. cm.decompile(ArrayBuffer) → Promise<string> (ASCII-MDL)
   ═══════════════════════════════════════════════ */

const CM_WASM_PATH   = 'wasm/cleanmodels.wasm';
const CM_WASM_B64_JS = 'js/cleanmodels_wasm.js';

const cm = (() => {

  const _isFile = window.location.protocol === 'file:';
  let _moduleReady = false;
  let _readyResolve, _readyReject;
  const _readyPromise = new Promise((res, rej) => {
    _readyResolve = res;
    _readyReject  = rej;
  });

  function _loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload  = resolve;
      s.onerror = () => reject(new Error('Script-Ladefehler: ' + src));
      document.head.appendChild(s);
    });
  }

  // Wartet bis window.cleanmodels gesetzt ist (go.run installiert es async).
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
          reject(new Error('cleanmodels: Timeout — window.cleanmodels nicht verfügbar.'));
        }
      }, 20);
    });
  }

  async function _load() {
    console.info('[cleanmodels] Start, Modus:', _isFile ? 'file://' : 'HTTP');

    if (typeof Go === 'undefined') {
      _readyReject(new Error('[cleanmodels] wasm_exec.js fehlt.'));
      return;
    }

    try {
      // ── 1. WASM-Binary laden ──────────────────────────────────────
      let wasmBuffer;

      if (_isFile) {
        if (typeof CM_WASM_B64 === 'undefined') {
          console.info('[cleanmodels] Lade', CM_WASM_B64_JS);
          await _loadScript(CM_WASM_B64_JS);
        }
        if (typeof CM_WASM_B64 === 'undefined') {
          throw new Error(CM_WASM_B64_JS + ' fehlt.');
        }
        const bin = atob(CM_WASM_B64);
        const buf = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        wasmBuffer = buf.buffer;
        console.info('[cleanmodels] Base64 dekodiert:', (wasmBuffer.byteLength / 1048576).toFixed(2), 'MB');
      } else {
        const resp = await fetch(CM_WASM_PATH);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        wasmBuffer = await resp.arrayBuffer();
        console.info('[cleanmodels] WASM geladen:', (wasmBuffer.byteLength / 1048576).toFixed(2), 'MB');
      }

      // ── 2. Instanz erzeugen und go.run() starten ─────────────────
      // go.run() läuft permanent — fire-and-forget, NICHT awaiten.
      const go       = new Go();
      const wasm     = await WebAssembly.compile(wasmBuffer);
      const instance = await WebAssembly.instantiate(wasm, go.importObject);

      console.info('[cleanmodels] Instanz erzeugt, go.run() wird gestartet…');
      go.run(instance);

      // ── 3. Auf window.cleanmodels warten ─────────────────────────
      await _waitForGlobal();

      _moduleReady = true;
      _readyResolve();

      const ver = window.cleanmodels.version ? window.cleanmodels.version() : '(unbekannt)';
      console.info('[cleanmodels] Modul bereit. Version:', ver);

    } catch (err) {
      console.error('[cleanmodels] Ladefehler:', err);
      _readyReject(err);
    }
  }

  // Dekompiliert ein binäres MDL (ArrayBuffer) → Promise<string> (ASCII)
  async function decompile(buffer) {
    await _readyPromise;
    const bytes  = new Uint8Array(buffer);
    const result = window.cleanmodels.decompile(bytes);
    if (!result || !result.ok) {
      const msg = (result && result.error) ? result.error : 'Unbekannter Fehler';
      throw new Error('cleanmodels.decompile: ' + msg);
    }
    console.info('[cleanmodels] Dekompilierung erfolgreich,', result.ascii.length, 'Zeichen.');
    return result.ascii;
  }

  async function version() {
    await _readyPromise;
    return window.cleanmodels.version ? window.cleanmodels.version() : null;
  }

  function isReady() { return _moduleReady; }
  function ready()   { return _readyPromise; }

  _load();
  return { decompile, version, isReady, ready };

})();

// ─────────────────────────────────────────────
function isBinaryMDL(buffer) {
  if (!buffer || buffer.byteLength < 4) return false;
  const b = new Uint8Array(buffer, 0, 1)[0];
  return !(b === 0x09 || b === 0x0A || b === 0x0D || (b >= 0x20 && b <= 0x7E));
}
