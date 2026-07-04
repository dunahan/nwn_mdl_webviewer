# Tauri-Backend für `js/hot_reload.js` — Implementierungsnotizen

Ergänzt die ausführlicheren Architektur-Entscheidungen in
`TAURI_INTEGRATION_NOTES.md` im `nwn_mdl_viewer_tauri`-Repo (Phase 1:
Repo-Wiring, `grant_folder_access`-Command, Permissions). Dieses Dokument
beschreibt nur die Annahmen, die konkret in `hot_reload.js` (Phase 2)
gemacht wurden.

## Kernidee: synthetischer Handle

Beide Backends (`browser-fsa`, `tauri`) füllen dieselben `_watched` /
`_watchedMDL`-Maps mit Objekten der Form
`{ handle: { getFile(): Promise<File> }, ext, lastModified }`.

`_poll()`, `_fillMissingTextures()`, `_onFileChanged()` — und, entscheidend,
`loader.js`s `FileReader`-basiertes MDL-Laden (`_readMDLHandle`,
`loadMDLFromHandle`) — rufen ausschließlich `handle.getFile()` auf und
behandeln das Ergebnis als echtes `File`/`Blob`. Der Tauri-Handle
(`_makeTauriFileHandle`) konstruiert dafür ein **echtes natives**
`new File([bytes], name, { lastModified })` aus den über
`@tauri-apps/plugin-fs` gelesenen Bytes — dadurch funktioniert der gesamte
downstream Code unverändert, inklusive `FileReader.readAsArrayBuffer()`.

## Verifizierte Fakten (gegen offizielle Doku geprüft, nicht geraten)

- `window.__TAURI__.core.invoke(...)` — Core-API-Namespace unter `.core`,
  nicht direkt `window.__TAURI__.invoke`.
- Mit `app.withGlobalTauri: true` (siehe `tauri.conf.json` im
  Tauri-App-Repo) werden Plugin-JS-Bindings automatisch unter
  `window.__TAURI__.<pluginName>` bereitgestellt (`.fs`, `.dialog`),
  sobald das jeweilige Rust-Plugin registriert ist — kein `import`/Bundler
  nötig.
- `@tauri-apps/plugin-fs`: `readFile()` liefert `Uint8Array`,
  `stat()`/`lstat()` liefern u. a. `mtime: Date | null`.
- Tauri erweitert den fs-Scope **nicht automatisch** für vom
  `dialog`-Plugin gewählte Ordner — deshalb der `grant_folder_access`-
  Rust-Command-Aufruf direkt nach `dialog.open()`.

## Nicht abschließend verifizierte Annahmen (Phase 2 TODOs)

1. **`fs:allow-watch`-Permission-Identifier.** Musterkonform zu den
   übrigen `fs:allow-*`-Identifiern angenommen, aber nicht wortwörtlich in
   der Doku bestätigt. Beim ersten lokalen `tauri dev`-Testlauf mit
   aktivem Ordner-Watch: Tauri gibt bei fehlender Permission den exakt
   benötigten Identifier in der Konsole aus — dann in
   `nwn_mdl_viewer_tauri/src-tauri/capabilities/default.json` korrigieren.
2. **`window.__TAURI__.path.join(...)`.** Angenommen, dass das
   `@tauri-apps/api/path`-Modul ebenfalls unter `window.__TAURI__.path`
   exponiert wird (Konvention passt zu `.core`, `.fs`, `.dialog`). Falls
   nicht: `_tauriJoin()` hat bereits einen funktionalen Fallback
   (String-Join mit `/`), das Verhalten bricht also nicht hart, ist aber
   ggf. auf Windows nicht 100 % pfadkorrekt. Bei Gelegenheit lokal
   verifizieren (`console.log(window.__TAURI__.path)`).
3. **`fs.watch()`-Rückgabewert `UnwatchFn`.** Angenommen als synchron
   aufrufbare Funktion (`_tauriUnwatch()` in `_backendStopWatch()`, kein
   `await`). Falls sich das als Promise-basiert herausstellt, ist der Fix
   trivial (`await _tauriUnwatch()`).
4. **Neue Dateien werden während einer laufenden Watch-Session NICHT
   automatisch aufgenommen** (bewusste Entscheidung für Verhaltens-Parität
   mit dem bisherigen `browser-fsa`-Polling, das ebenfalls nur bereits
   bekannte Einträge pollt). Mit `fs.watch()` wäre das technisch einfach
   nachrüstbar (Create-Events zusätzlich zu Modify-Events behandeln) —
   bewusst nicht in diesem Patch, um den Diff klein und das Verhalten
   vorhersehbar zu halten.

## Bewusst NICHT in diesem Patch behandelt

- CSP-Verschärfung, CDN-Vendoring (Three.js, Google Fonts) — siehe
  `TAURI_INTEGRATION_NOTES.md`, Phase 3 (Tauri-Repo).

## Phase 3 — Natives Drag&Drop für MDL-Laden (`js/loader.js`)

`loader.js`s `_captureModelHandle()` nutzte `DataTransferItem.
getAsFileSystemHandle()` — eine Browser-only-API. Der eigentliche Grund,
warum das unter Tauri gar nicht erst zum Tragen kommt: Mit
`dragDropEnabled: true` (Tauri-Default) fangen native Fenster/WebView die
OS-Drop-Events ab, **bevor** sie das DOM erreichen — die komplette
bestehende `viewport.addEventListener('drop', …)`-Kette (browser-fsa) lief
unter Tauri also ins Leere, nicht nur die Handle-Erfassung. Verifiziert
gegen mehrere unabhängige Quellen, u. a.
[tauri-apps/tauri#14373](https://github.com/tauri-apps/tauri/issues/14373).

**Lösung:** separater, paralleler Codepfad in `loader.js` über
`getCurrentWebviewWindow().onDragDropEvent(...)` (liefert absolute
Dateipfade statt `DataTransfer`). Nutzt denselben `_tauriReadAsFile()`-
Bridge-Mechanismus wie der Ordner-Watcher (jetzt öffentlich als
`HotReload.tauriPathToFile()`), sodass `loadFiles()` unverändert
weiterverwendet werden kann — echte `File`-Objekte, kein Sonderfall nötig.

**Neuer Rust-Command:** `grant_files_access` (siehe `nwn_mdl_viewer_tauri`-
Repo) — anders als `grant_folder_access` pro einzelnem Pfad, nicht
rekursiv pro Elternordner, da ein Drop Dateien aus mehreren, vorher nie
freigegebenen Verzeichnissen enthalten kann.

### Nicht abschließend verifizierte Annahmen (Phase 3)

1. **Globaler Namespace `window.__TAURI__.webviewWindow.
   getCurrentWebviewWindow()`.** Passend zum Import-Pfad
   `@tauri-apps/api/webviewWindow` und dem bereits bestätigten Muster
   (`.core`, `.fs`, `.dialog`), aber nicht wortwörtlich für DIESEN
   Namespace belegt. Code probiert defensiv zusätzlich
   `window.__TAURI__.webview.getCurrentWebview()` als Fallback (beide APIs
   besitzen laut Recherche `.onDragDropEvent(...)`).
2. **`event.payload.position`-Feld: physische vs. logische Pixel.**
   Angenommen physisch (Tauri-Konvention), durch `devicePixelRatio`
   geteilt für `elementFromPoint()`. Falls falsch: rein kosmetischer
   Fehler nahe der Viewport-Kante (Drag-Overlay flackert eventuell knapp
   daneben), keine Funktionsstörung.
3. **`allow_file` auf der Rust-Scope-API.** Siehe `TAURI_INTEGRATION_NOTES.md`
   im Tauri-Repo — nicht 1:1 in der offiziellen Referenz gefunden, nur in
   einem Community-Beispiel. `cargo check` vor dem Merge ist hier Pflicht.
4. **Keine zusätzliche `capabilities/default.json`-Permission für
   `onDragDropEvent` nötig.** Ein funktionierendes Minimalbeispiel kam mit
   nur `core:default` aus — aber nicht selbst nachgestellt/kompiliert.

### Testprotokoll (Phase 3)

| Datum | Aktion | Ergebnis |
|---|---|---|
| 2026-07-02 | `node --check js/loader.js` | ✅ Syntax gültig |
| 2026-07-02 | End-to-End-Test (echter Tauri-Build, Datei vom Desktop droppen) | ⛔ Nicht durchführbar (kein Rust-Toolchain in der Sandbox) — **muss lokal verifiziert werden**, siehe Annahmen 1–4 oben. |

## Phase 4 — CDN-Vendoring (`vendor/`, `index.html`, `build.py`)

Voraussetzung für eine strikte Tauri-CSP (siehe `TAURI_INTEGRATION_NOTES.md`
im Tauri-Repo) — mit `csp: null` war das bisher kein Blocker, aber sobald
CSP verschärft wird, dürfen `script-src`/`font-src` keine Drittanbieter
(`cdnjs.cloudflare.com`, `fonts.googleapis.com`, `fonts.gstatic.com`) mehr
enthalten.

**Vendoring-Strategie:** npm als vertrauenswürdige, versionierte Quelle
statt direktem CDN-Scraping — `cdnjs.cloudflare.com`/`fonts.googleapis.com`
lagen ohnehin außerhalb der in dieser Sandbox erlaubten Netzwerk-Domains,
aber auch unabhängig davon ist npm die sauberere, reproduzierbare Quelle.

- **Three.js** (`vendor/three/three.min.js`): `npm pack three@0.152.0`
  (exakt dieselbe Version wie zuvor per CDN gepinnt), `build/three.min.js`.
  **SHA-512 verifiziert** — byte-identisch zum vorherigen
  `integrity="sha512-..."`-Attribut des CDN-`<script>`-Tags. Kein
  Vertrauensbruch beim Quellenwechsel, siehe `vendor/README.md` für den
  Befehl zur Re-Verifikation bei künftigen Versions-Updates.
- **Fonts** (`vendor/fonts/`): `@fontsource/cinzel@5.2.8` +
  `@fontsource/share-tech-mono@5.2.7`, nur `latin`-Subset (passend zu den
  aktuell einzigen Übersetzungen en/de) und nur die tatsächlich genutzten
  Gewichte (Cinzel 400+600, Share Tech Mono 400). Lizenz: SIL OFL 1.1,
  Lizenztexte mitkopiert.

**`build.py` erweitert:** kopiert jetzt zusätzlich `vendor/` → `dist/vendor/`
für die Standalone-Web-Distribution (GitHub Pages) — analog zu `lang/` und
`wasm/`. Die Vendor-Dateien werden NICHT inline in `dist/index.html`
gebündelt (anders als die projekteigenen `js/*.js`-Module) — würden nur die
Datei um 634 KB minifiziertes Three.js aufblähen, ohne Nutzen, da `<script
src="vendor/...">` unter `file://` genauso funktioniert wie unter HTTP
(anders als `fetch()`, das war der eigentliche Grund für das Base64-WASM-
Embedding).

### Wichtige Kurskorrektur: `frontendDist` zeigt jetzt wieder auf rohes `viewer/`, nicht `viewer/dist`

**Widerruft eine Entscheidung aus Phase 1.** Grund: `build.py`s
Bündelung inlined alle projekteigenen JS-Module als `<script>...</script>`-
Blöcke direkt in `dist/index.html` — eine strikte CSP mit `script-src
'self'` (ohne `'unsafe-inline'`) hätte das komplett blockiert, und
`'unsafe-inline'` für Scripts hätte den ganzen Sinn einer CSP-Härtung
untergraben. Die rohe `viewer/`-Quelle nutzt dagegen ausschließlich externe
`<script src="js/...">`-Tags (keine Inline-Skripte) — genau das macht eine
strikte `script-src 'self'` (plus `'wasm-unsafe-eval'` fürs WASM) überhaupt
erst möglich. Details, warum das für Tauri unproblematisch ist (kein
Python3 mehr in der Tauri-Build-Pipeline nötig, `build.py`/`dist/` bleibt
nur für die separate Web-Distribution relevant), siehe
`TAURI_INTEGRATION_NOTES.md`, Phase 4, im Tauri-Repo.

### Nicht abschließend verifizierte Annahmen (Phase 4)

Keine — dieser Teil des Patches ist vollständig gegen tatsächliches
Verhalten geprüft (Hash-Vergleich für Three.js, `build.py`-Testlauf lokal
erfolgreich, `dist/index.html` referenziert die vendorierten Pfade
korrekt). Die CSP-Direktiven selbst (Tauri-Repo) sind gegen offizielle
Tauri-Doku-Beispiele abgeglichen, aber ein echter Tauri-Build war auch hier
mangels Rust-Toolchain nicht möglich — siehe Testprotokoll dort.

### Testprotokoll (Phase 4)

| Datum | Aktion | Ergebnis |
|---|---|---|
| 2026-07-03 | SHA-512-Vergleich `vendor/three/three.min.js` vs. vorherigem SRI-Hash | ✅ Byte-identisch |
| 2026-07-03 | `python3 build.py` mit vendor/-Kopierschritt | ✅ Erfolgreich, `dist/vendor/` korrekt befüllt und von `dist/index.html` referenziert |
| 2026-07-03 | Patch-Anwendung (`git am`) auf frischem Klon | ⚠️ Schlug zunächst fehl (`index.html` hat CRLF, `git am` normalisiert das beim Mail-Parsing weg) — **Fix: `git am --keep-cr` verwenden.** Volle Erklärung in `TAURI_INTEGRATION_NOTES.md` (Tauri-Repo, ganz oben). Nach Fix erfolgreich verifiziert inkl. Hash-Check der Binärdateien nach Patch-Anwendung. |
| 2026-07-03 | Visueller/funktionaler Test im echten Browser (Fonts rendern? Three.js lädt?) | ⛔ Nicht durchführbar in dieser Sandbox (kein Browser) — **sollte lokal kurz gegengeprüft werden**, auch wenn der Hash-Match und der erfolgreiche Build-Lauf hohe Zuversicht geben. |
