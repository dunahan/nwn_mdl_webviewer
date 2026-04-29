#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  generate_wasm_b64.sh
#  Generiert js/cleanmodels_wasm.js aus wasm/cleanmodels.wasm.
#
#  Verwendung:
#    ./scripts/generate_wasm_b64.sh                  # aus Repo-Root
#    ./scripts/generate_wasm_b64.sh path/to/file.wasm
#
#  Dieses Script ist für lokale Entwicklung gedacht, wenn man eine
#  neue cleanmodels.wasm manuell einsetzen möchte, ohne auf den
#  CI-Workflow zu warten.
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

WASM="${1:-wasm/cleanmodels.wasm}"
OUT="js/cleanmodels_wasm.js"

# ── Prüfungen ────────────────────────────────────────────────────
if [ ! -f "$WASM" ]; then
  echo "❌ Fehler: '$WASM' nicht gefunden."
  echo "   Verwendung: $0 [pfad/zur/cleanmodels.wasm]"
  exit 1
fi

command -v base64 >/dev/null 2>&1 || { echo "❌ base64 nicht gefunden."; exit 1; }

# ── Version aus wasm/cleanmodels.version lesen (optional) ────────
VERSION_FILE="$(dirname "$WASM")/cleanmodels.version"
if [ -f "$VERSION_FILE" ]; then
  TAG=$(cat "$VERSION_FILE")
else
  TAG="(lokal)"
fi

# ── Generieren ───────────────────────────────────────────────────
mkdir -p "$(dirname "$OUT")"

echo "⏳ Kodiere '$WASM' als Base64…"
B64=$(base64 -w 0 "$WASM" 2>/dev/null || base64 "$WASM")   # macOS: kein -w

cat > "$OUT" << JSEOF
/* cleanmodels.wasm — Base64-kodiert für file://-Modus
   Upstream-Version : ${TAG}
   Generiert        : $(date -u '+%Y-%m-%dT%H:%M:%SZ')
   ACHTUNG: Diese Datei wird automatisch generiert.
   Nicht manuell bearbeiten — stattdessen generate_wasm_b64.sh nutzen
   oder den GitHub-Actions-Workflow update-wasm.yml auslösen.
*/
// eslint-disable-next-line
var CM_WASM_B64 = "${B64}";
JSEOF

WASM_SIZE=$(wc -c < "$WASM")
OUT_SIZE=$(wc -c  < "$OUT")
SHA=$(sha256sum "$WASM" 2>/dev/null | cut -d' ' -f1 || shasum -a 256 "$WASM" | cut -d' ' -f1)

echo "✅ Fertig!"
echo "   WASM  : $WASM ($WASM_SIZE Bytes)"
echo "   JS    : $OUT ($OUT_SIZE Bytes)"
echo "   SHA256: $SHA"
echo "   Version: $TAG"
