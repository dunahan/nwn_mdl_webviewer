# wasm/

Enthält die WebAssembly-Binary des [cleanmodels](https://github.com/plenarius/cleanmodels)-Tools
sowie zugehörige Metadateien. Der Inhalt dieses Verzeichnisses wird
**automatisch** durch den CI-Workflow aktuell gehalten — manuelle Änderungen
werden beim nächsten Update überschrieben.

---

## Dateien

| Datei | Beschreibung |
|-------|--------------|
| `cleanmodels.wasm` | WebAssembly-Binary (Upstream-Release) |
| `cleanmodels.version` | Versionstag des eingespielten Releases, z.B. `v1.4.2` |
| `cleanmodels.wasm.sha256` | SHA-256-Prüfsumme der Binary |

> `js/cleanmodels_wasm.js` liegt im `js/`-Verzeichnis, gehört aber
> inhaltlich hierher: Es ist die Base64-kodierte Version der Binary
> für den `file://`-Betrieb und wird zusammen mit `cleanmodels.wasm`
> immer gleichzeitig aktualisiert.

---

## Wozu zwei Formate?

Der Viewer unterstützt zwei Betriebsmodi:

**HTTP / GitHub Pages**
`cleanmodels.wasm` wird per `fetch()` geladen — der Browser darf
das, weil eine echte HTTP-Origin vorhanden ist. Schnell, kein Overhead.

**Lokal (`file://`)**
Browser blockieren `fetch()` auf `file://`-Origins aus
Sicherheitsgründen. Stattdessen wird `js/cleanmodels_wasm.js`
als normales `<script>`-Tag eingebunden, das die Binary als
Base64-String in der Variable `CM_WASM_B64` bereitstellt.
`cleanmodels.js` wählt den Modus automatisch anhand von
`window.location.protocol`.

---

## Update-Mechanismus

Updates werden durch den Workflow
[`.github/workflows/update-wasm.yml`](../.github/workflows/update-wasm.yml)
eingespielt:

```
Upstream Release (plenarius/cleanmodels)
        │
        ▼
  GitHub Actions
  ┌─────────────────────────────────────────┐
  │ 1. Neueste Release-Version prüfen       │
  │ 2. cleanmodels.wasm herunterladen       │
  │ 3. SHA-256 verifizieren & speichern     │
  │ 4. js/cleanmodels_wasm.js generieren    │
  │ 5. wasm/cleanmodels.version schreiben   │
  │ 6. Commit & Push                        │
  └─────────────────────────────────────────┘
        │
        ▼
  GitHub Pages zeigt sofort die neue Version
```

**Auslöser:**
- **Täglich 03:00 UTC** — automatischer Versionsvergleich, Commit nur bei Änderung
- **Manuell** — über `Actions → Update cleanmodels WASM → Run workflow`, optional mit `force: true`
- **Eigener Release** — WASM wird als Release-Asset angehängt

---

## Versionsstand prüfen

```bash
cat wasm/cleanmodels.version        # eingespielter Tag
cat wasm/cleanmodels.wasm.sha256    # SHA-256 der Binary
```

Den aktuell verfügbaren Upstream-Release findet man unter:
https://github.com/plenarius/cleanmodels/releases/latest

---

## Manuelles Update (ohne CI)

```bash
# 1. Neue cleanmodels.wasm manuell herunterladen und hier ablegen
# 2. Versionsdatei aktualisieren
echo "v1.x.x" > wasm/cleanmodels.version

# 3. Base64-JS regenerieren
./scripts/generate_wasm_b64.sh

# 4. Alle drei Dateien committen
git add wasm/ js/cleanmodels_wasm.js
git commit -m "chore: cleanmodels WASM → v1.x.x (manuell)"
```
