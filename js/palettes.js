/* ═══════════════════════════════════════════════
   NWN MDL Viewer — PLT Paletten (eingebettet)

   Struktur je Palette: 176 Zeilen × 256 Spalten × 3 Byte (RGB)
   Zeile   = wählbarer Farbton (User-Auswahl, 0–175)
   Spalte  = color_index aus PLT-Pixel (0–255)
   Lookup  = getPaletteRGB(layerIdx, row, colorIndex)
   ═══════════════════════════════════════════════ */

// ─────────────────────────────────────────────
//  Layer-Metadaten
// ─────────────────────────────────────────────
const PLT_LAYER_NAMES  = ['Skin','Hair','Metal 1','Metal 2','Cloth 1','Cloth 2','Leather 1','Leather 2','Tattoo 1','Tattoo 2'];
const PLT_LAYER_COLORS = ['#e8a880','#7a5030','#b8c0cc','#c8a44a','#5878b8','#b85878','#8a6040','#504030','#4888b8','#b87048'];

// ─────────────────────────────────────────────
//  Eingebettete Paletten (base64-kodiertes RGB-Byte-Array)
//  sowie Hexhash für Color Picker in plt_swatch.js
// ─────────────────────────────────────────────

// Dekodierter Cache: layerIdx → Uint8Array(176 * 256 * 3)
const _pltPaletteCache = {};

function _decodePalette(layerIdx) {
  if (_pltPaletteCache[layerIdx]) return _pltPaletteCache[layerIdx];
  const b64 = _PLT_PALETTE_B64[layerIdx];
  if (!b64) return null;
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  _pltPaletteCache[layerIdx] = buf;
  return buf;
}

// ─────────────────────────────────────────────
//  Öffentliche API
// ─────────────────────────────────────────────

// Gibt [r, g, b] für einen PLT-Pixel zurück.
// layerIdx  0–9  (Layer-Index aus PLT)
// row       0–175 (User-Auswahl im Picker)
// colorIdx  0–255 (color_index aus PLT-Pixel-Byte 0)
function getPaletteRGB(layerIdx, row, colorIdx) {
  const buf = _decodePalette(layerIdx);
  if (!buf) return [colorIdx, colorIdx, colorIdx]; // Fallback: Graustufe
  const off = (row * 256 + colorIdx) * 3;
  return [buf[off], buf[off + 1], buf[off + 2]];
}

// Gibt true zurück wenn für einen Layer eine Palette eingebettet ist.
function hasPalette(layerIdx) {
  return layerIdx in _PLT_PALETTE_B64;
}

// Gibt Hex-String (#rrggbb) der Repräsentativfarbe für den Picker zurück.
function getPaletteSwatchHex(layerIdx, row) {
  const tables = {
    0: PLT_SKIN_SWATCH,
    1: PLT_HAIR_SWATCH,
    2: PLT_METAL1_SWATCH,
    3: PLT_METAL2_SWATCH,
    4: PLT_CLOTH_SWATCH,
    5: PLT_CLOTH_SWATCH,   // Cloth 2 = identisch mit Cloth 1
    6: PLT_LEATH_SWATCH,
    7: PLT_LEATH_SWATCH,   // Leather 2 = identisch mit Leather 1
    8: PLT_TATTOO_SWATCH,
    9: PLT_TATTOO_SWATCH,  // Tattoo 2 = identisch mit Tattoo 1
  };
  const tbl = tables[layerIdx];
  if (tbl) {
    const v = tbl[row] || 0x888888;
    return '#' + v.toString(16).padStart(6, '0');
  }
  // Fallback für Layer ohne eingebettete Palette 
  return PLT_LAYER_COLORS[layerIdx] || '#888888';
}

// Aktuelle User-Auswahl (row 0–175 je Layer)
const pltLayerRows = new Array(10).fill(0);

// ─────────────────────────────────────────────