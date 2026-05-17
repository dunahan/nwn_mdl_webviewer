/* ═══════════════════════════════════════════════
   NWN MDL Viewer — Texture Hot-Reload
   ═══════════════════════════════════════════════

   Beobachtet einen vom User gewählten Ordner auf
   geänderte Texturdateien (TGA / DDS / PLT) und
   aktualisiert den textureCache + die Three.js-Szene
   automatisch ohne Neu-Laden des Modells.

   Backend-Abstraktion (Tauri-ready):
     'browser-fsa'  – File System Access API (Chrome/Edge)
                      Polling via setInterval + FileSystemFileHandle
     'tauri'        – (Platzhalter) nativer fs-watch via
                      tauri-plugin-fs, event-basiert, kein Polling
     null           – nicht unterstützt (Firefox u.a.)

   Abhängigkeiten (globale Variablen aus anderen Modulen):
     textureCache          – textures.js
     parseTGA              – textures.js
     parseNWNDDS           – textures.js
     parseNWNPLT           – textures.js
     applyPLTPalette       – textures.js
     applyTexturesToScene  – session.js
     L / fmt               – i18n.js
     setStatus             – ui.js
     logInfoI18n / logWarnI18n / logMsg  – log.js

   Öffentliche API (window.HotReload):
     HotReload.init()         – beim DOMContentLoaded aufrufen
     HotReload.toggle()       – Button-Handler: Ordner wählen / Stop
     HotReload.getBackend()   – 'browser-fsa' | 'tauri' | null

   Tauri-Migration (später):
     Nur _backendPick() und _backendStartWatch() / _backendStopWatch()
     tauschen. _onFileChanged() und alle Textur-Logik bleiben unverändert.
   ═══════════════════════════════════════════════ */

const HotReload = (() => {

  // ── Konfiguration ────────────────────────────────────────────────────────
  const POLL_MS  = 2000;                          // Polling-Intervall (ms)
  const TEX_EXTS = ['tga', 'dds', 'plt'];         // Unterstützte Endungen

  // ── Interner Zustand ─────────────────────────────────────────────────────
  let _backend   = null;   // 'browser-fsa' | 'tauri' | null
  let _active    = false;
  let _pollTimer = null;

  // Map: basename (lowercase, ohne ext) → { handle, ext, lastModified }
  const _watched = new Map();

  // ── Hilfsfunktion: Dateiname → basename + ext ────────────────────────────
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
      // Browser unterstützt Feature nicht → Button deaktivieren + Tooltip
      btn.disabled = true;
      btn.title    = L('hr_not_supported');
    }
  }

  // ── Backend-Erkennung ────────────────────────────────────────────────────
  function _detectBackend() {
    if (typeof window !== 'undefined' && window.__TAURI__)                return 'tauri';
    if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) return 'browser-fsa';
    return null;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  ÖFFENTLICHE API
  // ════════════════════════════════════════════════════════════════════════

  // Haupt-Toggle: Ordner wählen starten / Beobachtung stoppen
  async function toggle() {
    if (!_backend) return;

    if (_active) {
      // Watcher läuft → stoppen und Handles verwerfen
      _backendStopWatch();
      _watched.clear();
      _updateUI();
    } else {
      // Watcher inaktiv → Ordner wählen und starten
      await _backendPick();
    }
  }

  function getBackend() { return _backend; }

  // ════════════════════════════════════════════════════════════════════════
  //  BACKEND: 'browser-fsa'
  //  Kann später 1:1 durch Tauri-Pendant ersetzt werden.
  // ════════════════════════════════════════════════════════════════════════

  async function _backendPick() {
    if (_backend === 'tauri') {
      // ── Tauri (Platzhalter) ─────────────────────────────────────────
      // const { open } = window.__TAURI__.dialog;
      // const dir = await open({ directory: true, multiple: false });
      // ... Handles über Tauri-FS-API aufbauen ...
      logWarnI18n('hr_tauri_not_impl');
      return;
    }

    // ── browser-fsa ──────────────────────────────────────────────────
    let dirHandle;
    try {
      dirHandle = await window.showDirectoryPicker({ mode: 'read' });
    } catch (_) {
      // User hat Dialog abgebrochen → still ignorieren
      return;
    }

    _watched.clear();
    let count = 0;

    try {
      for await (const [name, handle] of dirHandle.entries()) {
        if (handle.kind !== 'file') continue;
        const parts = _splitName(name);
        if (!parts || !TEX_EXTS.includes(parts.ext)) continue;

        const file = await handle.getFile();
        _watched.set(parts.key, {
          handle,
          ext:          parts.ext,
          lastModified: file.lastModified,
        });
        count++;
      }
    } catch (e) {
      logMsg(`[HotReload] Ordner-Scan Fehler: ${e.message}`, 'warn');
      return;
    }

    if (count === 0) {
      setStatus(L('hr_no_textures'));
      return;
    }

    setStatus(fmt('hr_dir_picked', { n: count }));
    _backendStartWatch();
  }

  function _backendStartWatch() {
    if (_active) return;
    _active    = true;
    _pollTimer = setInterval(_poll, POLL_MS);
    _updateUI();
  }

  function _backendStopWatch() {
    if (!_active) return;
    _active = false;
    clearInterval(_pollTimer);
    _pollTimer = null;
  }

  // ── Polling-Schleife (browser-fsa) ───────────────────────────────────────
  async function _poll() {
    for (const [key, entry] of _watched.entries()) {
      try {
        const file = await entry.handle.getFile();
        if (file.lastModified <= entry.lastModified) continue;
        entry.lastModified = file.lastModified;
        await _onFileChanged(key, entry.ext, file);
      } catch (_) {
        // Handle verloren (Datei gelöscht / Ordner nicht mehr zugänglich) → überspringen
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  TEXTUR-RELOAD  (backend-unabhängig)
  //  Bleibt bei Tauri-Migration komplett unverändert.
  // ════════════════════════════════════════════════════════════════════════

  async function _onFileChanged(key, ext, file) {
    // 1. Datei lesen
    let buffer;
    try {
      buffer = await file.arrayBuffer();
    } catch (e) {
      logMsg(`[HotReload] Lesefehler "${key}.${ext}": ${e.message}`, 'warn');
      return;
    }

    // 2. Parsen (gleiche Parser wie loader.js)
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

    // 3. Cache aktualisieren
    const existing = textureCache[key];
    if (existing && existing.image instanceof HTMLCanvasElement) {
      // In-place-Patch: canvas-Inhalt des bestehenden THREE.Texture ersetzen.
      // Alle Materials in der Szene zeigen das neue Bild ohne Re-Assign.
      _patchCanvasInPlace(existing, newTex);
    } else {
      // Textur war noch nicht im Cache → eintragen und Szene neu zuweisen.
      textureCache[key] = newTex;
      if (typeof applyTexturesToScene === 'function') applyTexturesToScene();
    }

    // 4. PLT: Palette mit aktuellen Layer-Einstellungen neu anwenden
    if (ext === 'plt' && typeof applyPLTPalette === 'function') {
      applyPLTPalette(textureCache[key]);
    }

    // 5. Log + Statuszeile
    logInfoI18n('hr_reloaded', { name: key + '.' + ext });
    setStatus(fmt('hr_reloaded', { name: key + '.' + ext }));
  }

  // ── Canvas-Inhalt einer CanvasTexture in-place ersetzen ──────────────────
  //
  // Strategie: neuen Canvas-Inhalt auf den bestehenden Canvas zeichnen.
  // Die THREE.Texture-Objekt-Referenz bleibt erhalten → alle Materials,
  // die diese Textur bereits zugewiesen haben, zeigen sofort das neue Bild
  // nach needsUpdate = true (kein applyTexturesToScene nötig).
  //
  // Größenänderung: canvas.width/height neu setzen (setzt canvas-Inhalt zurück,
  // dann drawImage aus neuem Canvas). GPU-seitig akzeptiert Three.js das via needsUpdate.
  //
  function _patchCanvasInPlace(target, source) {
    const srcCvs = source.image;
    const tgtCvs = target.image;
    const ctx    = tgtCvs.getContext('2d');

    // Dimensionen anpassen (reset durch Größenzuweisung ist gewollt)
    if (tgtCvs.width !== srcCvs.width || tgtCvs.height !== srcCvs.height) {
      tgtCvs.width  = srcCvs.width;
      tgtCvs.height = srcCvs.height;
    } else {
      ctx.clearRect(0, 0, tgtCvs.width, tgtCvs.height);
    }

    ctx.drawImage(srcCvs, 0, 0);

    // userData übertragen (hasAlpha, isPLT, pltBuffer, pltTexKey, …)
    // Vorhandene Keys bleiben erhalten; neue Keys aus source kommen dazu.
    Object.assign(target.userData, source.userData);

    target.needsUpdate = true;

    // Alten Zwischen-Canvas freigeben (GC-Hilfe)
    source.dispose();
  }

  // ════════════════════════════════════════════════════════════════════════
  //  UI
  // ════════════════════════════════════════════════════════════════════════

  function _updateUI() {
    const btn    = document.getElementById('btn-hot-reload');
    const status = document.getElementById('hot-reload-status');
    if (!btn) return;

    if (_active && _watched.size > 0) {
      btn.classList.add('active');
      btn.textContent = L('hr_btn_stop');
      btn.setAttribute('data-i18n', 'hr_btn_stop');
      if (status) status.textContent = fmt('hr_watching', { n: _watched.size });
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
  return { init, toggle, getBackend };

})();

// Init sobald DOM bereit ist
document.addEventListener('DOMContentLoaded', () => HotReload.init());
