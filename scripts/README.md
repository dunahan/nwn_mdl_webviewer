# scripts/

Hilfsskripte für die lokale Entwicklung. Die Skripte sind Ergänzungen zum
CI-Workflow [`update-wasm.yml`](../.github/workflows/update-wasm.yml) und
gedacht für Situationen, in denen man nicht auf GitHub Actions warten möchte
— etwa beim lokalen Testen einer neuen WASM-Version.

---

## generate_wasm_b64.sh

Generiert `js/cleanmodels_wasm.js` aus einer lokalen `cleanmodels.wasm`.

Die Datei `cleanmodels_wasm.js` enthält die WASM-Binary als Base64-kodierte
JavaScript-Variable (`CM_WASM_B64`) und wird vom Viewer im `file://`-Modus
verwendet, da Browser dort keine `fetch()`-Aufrufe erlauben.

**Voraussetzungen:** `bash`, `base64` (Linux & macOS vorhanden)

```bash
# Aus dem Repo-Root aufrufen:
./scripts/generate_wasm_b64.sh

# Oder mit explizitem Pfad zur WASM-Datei:
./scripts/generate_wasm_b64.sh pfad/zur/cleanmodels.wasm
```

**Ausgabe:**

```
⏳ Kodiere 'wasm/cleanmodels.wasm' als Base64…
✅ Fertig!
   WASM  : wasm/cleanmodels.wasm (3924680 Bytes)
   JS    : js/cleanmodels_wasm.js (5233024 Bytes)
   SHA256: a3f8c1…
   Version: v1.4.2
```

Die erzeugte `js/cleanmodels_wasm.js` **nie manuell bearbeiten** — sie wird
bei jedem Update überschrieben. Stattdessen immer dieses Skript oder den
CI-Workflow verwenden.

---

## Wann welches Tool?

| Situation | Tool |
|-----------|------|
| Upstream hat neuen Release veröffentlicht, CI läuft automatisch | Nichts tun |
| Upstream-Update sofort einspielen ohne auf Nightly zu warten | Workflow manuell auslösen (`Actions → Update cleanmodels WASM → Run workflow`) |
| Lokales Testen einer eigenen / gepatchten WASM-Binary | `generate_wasm_b64.sh` |
| Eigenen Viewer-Release erstellen | Release auf GitHub publizieren — CI aktualisiert die WASM automatisch |

---

## Neue Skripte hinzufügen

Skripte bitte mit `chmod +x` als ausführbar markieren und oben im
Skript mit einem kurzen Kommentarblock dokumentieren (Zweck, Aufruf,
Abhängigkeiten). Dieses README entsprechend ergänzen.
