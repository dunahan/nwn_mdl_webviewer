/* ═══════════════════════════════════════════════
   NWN MDL Viewer — MTR Parser & Cache
   ═══════════════════════════════════════════════ */

// MTR-Cache: basename (lowercase, ohne Extension) → geparste MTR-Daten
const mtrCache = {};

function parseMTR(text) {
  const result = {
    renderhint:   null,   // 'NormalAndSpecMapped' | 'NormalTangents' | null
    textures:     {},     // index (0–10) → name (lowercase) | null
    transparency: false,
    twosided:     false,
    params:       {},     // name → { type, values }
  };

  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  for (let line of lines) {
    // Kommentare entfernen (// ...)
    const ci = line.indexOf('//');
    if (ci >= 0) line = line.substring(0, ci);
    line = line.trim();
    if (!line) continue;

    const parts = line.split(/\s+/);
    const key   = parts[0].toLowerCase();

    if (key === 'renderhint') {
      result.renderhint = parts[1] || null;

    } else if (/^texture\d+$/.test(key)) {
      const idx = parseInt(key.replace('texture', ''));
      if (!isNaN(idx)) {
        const val = (parts[1] || '').toLowerCase();
        result.textures[idx] = (val === 'null' || val === '') ? null : val;
      }

    } else if (key === 'bitmap') {
      // bitmap in MTR = schwaches Alias für texture0 (nur wenn texture0 nicht explizit gesetzt)
      if (!result.textures.hasOwnProperty(0)) {
        const val = (parts[1] || '').toLowerCase();
        result.textures[0] = (val === 'null' || val === '') ? null : val;
      }

    } else if (key === 'transparency') {
      result.transparency = parseInt(parts[1]) === 1;

    } else if (key === 'twosided') {
      result.twosided = parseInt(parts[1]) === 1;

    } else if (key === 'parameter') {
      // parameter float|int Name Wert(e)
      const type   = (parts[1] || '').toLowerCase();
      const name   = parts[2] || '';
      const values = parts.slice(3).map(Number);
      if (name) result.params[name] = { type, values };
    }
  }
  return result;
}