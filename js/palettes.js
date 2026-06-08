/* ═══════════════════════════════════════════════
   NWN MDL Viewer — PLT Palettes (embedded)

   Structure per palette: 176 rows × 256 columns × 3 bytes (RGB)
   Row      = selectable hue (User selection, 0–175)
   Column   = color_index from PLT pixel (0–255)
   Lookup   = getPaletteRGB(layerIdx, row, colorIndex)
   ═══════════════════════════════════════════════ */

// ─────────────────────────────────────────────
//  Layer metadata
// ─────────────────────────────────────────────
const PLT_LAYER_NAMES  = ['Skin','Hair','Metal 1','Metal 2','Cloth 1','Cloth 2','Leather 1','Leather 2','Tattoo 1','Tattoo 2'];
const PLT_LAYER_COLORS = ['#e8a880','#7a5030','#b8c0cc','#c8a44a','#5878b8','#b85878','#8a6040','#504030','#4888b8','#b87048'];

// ─────────────────────────────────────────────
//  Embedded palettes (base64-encoded RGB byte array)
//  and hex hash for color picker in plt_swatch.js
// ─────────────────────────────────────────────

// Decoded cache: layerIdx → Uint8Array(176 * 256 * 3)
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
//  Public API
// ─────────────────────────────────────────────

// Returns [r, g, b] for a PLT pixel.
// layerIdx  0–9  (Layer index from PLT)
// row       0–175 (User selection in the picker)
// colorIdx  0–255 (color_index from PLT pixel byte 0)
function getPaletteRGB(layerIdx, row, colorIdx) {
  const buf = _decodePalette(layerIdx);
  if (!buf) return [colorIdx, colorIdx, colorIdx]; // Fallback: Grayscale
  const off = (row * 256 + colorIdx) * 3;
  return [buf[off], buf[off + 1], buf[off + 2]];
}

// Returns true if a palette is embedded for a layer.
function hasPalette(layerIdx) {
  return layerIdx in _PLT_PALETTE_B64;
}

// Returns hex string (#rrggbb) of the representative color for the picker.
function getPaletteSwatchHex(layerIdx, row) {
  const tables = {
    0: PLT_SKIN_SWATCH,
    1: PLT_HAIR_SWATCH,
    2: PLT_METAL1_SWATCH,
    3: PLT_METAL2_SWATCH,
    4: PLT_CLOTH_SWATCH,
    5: PLT_CLOTH_SWATCH,   // Cloth 2 = identical to Cloth 1
    6: PLT_LEATH_SWATCH,
    7: PLT_LEATH_SWATCH,   // Leather 2 = identical to Leather 1
    8: PLT_TATTOO_SWATCH,
    9: PLT_TATTOO_SWATCH,  // Tattoo 2 = identical to Tattoo 1
  };
  const tbl = tables[layerIdx];
  if (tbl) {
    const v = tbl[row] || 0x888888;
    return '#' + v.toString(16).padStart(6, '0');
  }
  // Fallback for layers without an embedded palette
  return PLT_LAYER_COLORS[layerIdx] || '#888888';
}

// Global user selection (row 0–175 per layer)
// Layer 0 (Skin) and 1 (Hair) intentionally remain global —
// skin and hair color should be identical for all parts of a model.
const pltLayerRows = new Array(10).fill(0);

// Per-part layer rows for layers 2–9 (Metal, Cloth, Leather, Tattoo).
// texKey → Array(10): automatically created on first access.
const pltPartLayerRows = {};

function getPltRows(texKey) {
  if (!pltPartLayerRows[texKey])
    pltPartLayerRows[texKey] = new Array(10).fill(0);
  return pltPartLayerRows[texKey];
}

// ─────────────────────────────────────────────
