/* ═══════════════════════════════════════════════
   NWN MDL Viewer — TXI Parser & Cache

   TXI-Dateien weisen einer gleichnamigen Textur
   zusätzliche Eigenschaften zu (z.B. decal, clamp,
   blending, prozeduraler Effekt, Bump-Map-Verweise).

   Die Datei "c_air_skin.txi" gehört zu "c_air_skin.tga".
   ═══════════════════════════════════════════════ */

// TXI-Cache: basename (lowercase, ohne Extension) → geparste TXI-Daten
const txiCache = {};

// ─────────────────────────────────────────────
//  parseTXI  — liest eine TXI-Textdatei
// ─────────────────────────────────────────────
function parseTXI(text) {
  const result = {
    // ── Rendering ────────────────────────────
    decal:                false,   // 1 = transparentes Overlay, kein Depth-Write
    clamp:                0,       // 0=repeat/repeat, 1=clampS, 2=clampT, 3=beide
    blending:             null,    // 'additive' | 'punchthrough' | null
    mipmap:               true,    // false = Mipmapping deaktiviert
    filter:               true,    // false = nearest-Filterung

    // ── Textur-Verweise ───────────────────────
    bumpmaptexture:       null,    // Name einer Bump-Map-Textur
    envmaptexture:        null,    // Name einer Environment-Map-Textur

    // ── Sprite-Animation (numx/numy/fps) ─────
    numx:                 1,       // Sprite-Sheet Spalten
    numy:                 1,       // Sprite-Sheet Zeilen
    fps:                  0,       // Frames pro Sekunde

    // ── Prozedurale Effekte ───────────────────
    // (arturo = Hitze-Shimmer, water, cycle, …)
    // Im Viewer nicht animiert, wird als Marker gespeichert.
    proceduretype:        null,    // 'arturo' | 'water' | 'cycle' | …
    speed:                0,
    distort:              false,
    distortangle:         0,
    distortionamplitude:  0,
    arturowidth:          0,
    arturoheight:         0,
    downsamplemax:        0,
    downsamplemin:        0,

    // ── UV-Kanal-Animation ────────────────────
    // channelscale / channeltranslate: jeweils N Werte
    // (nicht interaktiv gerendert, aber geparst)
    channelscale:         [],
    channeltranslate:     [],

    // ── Sonstiges ────────────────────────────
    alphamean:            0,
  };

  const lines   = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  let   collect = null;   // aktuell laufender Multi-Zeilen-Block
  let   needed  = 0;      // noch fehlende Werte im Block

  for (let line of lines) {
    // Kommentare entfernen
    const ci = line.indexOf('//');
    if (ci >= 0) line = line.substring(0, ci);
    line = line.trim();
    if (!line) continue;

    // Laufender Multi-Zeilen-Block (channelscale / channeltranslate)
    if (collect && needed > 0) {
      const v = parseFloat(line);
      if (!isNaN(v)) { collect.push(v); needed--; }
      continue;
    }
    collect = null;

    const parts = line.split(/\s+/).filter(p => p.length > 0);
    if (parts.length === 0) continue;
    const key  = parts[0].toLowerCase();
    const val1 = parts[1] || '';

    switch (key) {

      // ── Rendering ──────────────────────────
      case 'decal':
        result.decal = parseInt(val1) === 1;
        break;
      case 'clamp':
        result.clamp = parseInt(val1) || 0;
        break;
      case 'blending':
        result.blending = val1.toLowerCase() || null;
        break;
      case 'mipmap':
        result.mipmap = parseInt(val1) !== 0;
        break;
      case 'filter':
        result.filter = parseInt(val1) !== 0;
        break;

      // ── Textur-Verweise ─────────────────────
      case 'bumpmaptexture':
      case 'bumpmap':
        result.bumpmaptexture = val1.toLowerCase() || null;
        break;
      case 'envmaptexture':
      case 'envmap':
        result.envmaptexture = val1.toLowerCase() || null;
        break;

      // ── Sprite-Animation ────────────────────
      case 'numx':
        result.numx = parseInt(val1) || 1;
        break;
      case 'numy':
        result.numy = parseInt(val1) || 1;
        break;
      case 'fps':
        result.fps = parseFloat(val1) || 0;
        break;

      // ── Prozedurale Effekte ─────────────────
      case 'proceduretype':
        result.proceduretype = val1.toLowerCase() || null;
        break;
      case 'speed':
        result.speed = parseFloat(val1) || 0;
        break;
      case 'distort':
        result.distort = parseInt(val1) === 1;
        break;
      case 'distortangle':
        result.distortangle = parseFloat(val1) || 0;
        break;
      case 'distortionamplitude':
        result.distortionamplitude = parseFloat(val1) || 0;
        break;
      case 'arturowidth':
        result.arturowidth = parseInt(val1) || 0;
        break;
      case 'arturoheight':
        result.arturoheight = parseInt(val1) || 0;
        break;
      case 'downsamplemax':
        result.downsamplemax = parseInt(val1) || 0;
        break;
      case 'downsamplemin':
        result.downsamplemin = parseInt(val1) || 0;
        break;

      // ── UV-Kanal-Blöcke ─────────────────────
      // Format: channelscale <anzahl>
      //   <wert1>
      //   <wert2>  …
      case 'channelscale': {
        const n = parseInt(val1) || 0;
        if (n > 0) { collect = result.channelscale; needed = n; }
        break;
      }
      case 'channeltranslate': {
        const n = parseInt(val1) || 0;
        if (n > 0) { collect = result.channeltranslate; needed = n; }
        break;
      }

      // ── Sonstiges ───────────────────────────
      case 'alphamean':
        result.alphamean = parseFloat(val1) || 0;
        break;

      // Unbekannte Keys werden stillschweigend übersprungen
      default:
        break;
    }
  }

  return result;
}

// ─────────────────────────────────────────────
//  applyTXIToMaterial
//
//  Wendet die geparsten TXI-Eigenschaften auf
//  ein THREE.Material und die zugehörige Textur an.
//  Wird aus applyTexturesToScene() heraus aufgerufen.
// ─────────────────────────────────────────────
function applyTXIToMaterial(mat, txi, tex) {
  if (!mat || !txi) return;

  // ── decal → transparentes Overlay ──────────
  // Kein Depth-Write, DoubleSide, kein AlphaTest
  if (txi.decal) {
    mat.transparent = true;
    mat.depthWrite  = false;
    mat.side        = THREE.DoubleSide;
    mat.alphaTest   = 0;         // AlphaTest überschreiben (kein Clipping gewünscht)
  }

  // ── Additive Überblendung ───────────────────
  if (txi.blending === 'additive') {
    mat.blending    = THREE.AdditiveBlending;
    mat.transparent = true;
    mat.depthWrite  = false;
    mat.alphaTest   = 0;
  }

  // ── UV-Wrap-Modus (clamp) ───────────────────
  if (tex && txi.clamp > 0) {
    if (txi.clamp === 1 || txi.clamp === 3) tex.wrapS = THREE.ClampToEdgeWrapping;
    if (txi.clamp === 2 || txi.clamp === 3) tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
  }

  // ── Bump-Map aus TXI-Verweis ────────────────
  if (txi.bumpmaptexture && textureCache[txi.bumpmaptexture]) {
    mat.bumpMap   = textureCache[txi.bumpmaptexture];
    mat.bumpScale = 0.05;
  }

  // ── Environment-Map aus TXI-Verweis ─────────
  if (txi.envmaptexture && textureCache[txi.envmaptexture]) {
    mat.envMap          = textureCache[txi.envmaptexture];
    mat.envMapIntensity = 0.5;
  }

  // ── Mipmapping deaktivieren ─────────────────
  if (!txi.mipmap && tex) {
    tex.minFilter       = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate     = true;
  }

  // ── Nearest-Filterung ───────────────────────
  if (!txi.filter && tex) {
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
  }

  // ── Prozedurale Effekte als Marker ──────────
  // arturo / water / cycle können im Viewer nicht
  // animiert werden. Wir speichern den Typ in userData
  // (für zukünftige Shader-Erweiterungen oder UI-Badges).
  if (txi.proceduretype) {
    mat.userData = mat.userData || {};
    mat.userData.txi_proceduretype   = txi.proceduretype;
    mat.userData.txi_speed           = txi.speed;
    mat.userData.txi_distort         = txi.distort;
    mat.userData.txi_distortamp      = txi.distortionamplitude;
  }

  mat.needsUpdate = true;
}

// ─────────────────────────────────────────────
//  buildTXISummary
//
//  Gibt eine lesbare Zusammenfassung der aktiven
//  TXI-Eigenschaften zurück (für Log/UI).
// ─────────────────────────────────────────────
function buildTXISummary(txi) {
  const parts = [];
  if (txi.decal)           parts.push('decal');
  if (txi.blending)        parts.push('blending:' + txi.blending);
  if (txi.clamp)           parts.push('clamp:' + txi.clamp);
  if (txi.proceduretype)   parts.push('proc:' + txi.proceduretype);
  if (txi.bumpmaptexture)  parts.push('bump→' + txi.bumpmaptexture);
  if (txi.envmaptexture)   parts.push('env→' + txi.envmaptexture);
  if (!txi.mipmap)         parts.push('no-mipmap');
  if (txi.distort)         parts.push('distort(amp=' + txi.distortionamplitude + ')');
  if (txi.numx > 1 || txi.numy > 1) parts.push('sprite ' + txi.numx + 'x' + txi.numy);
  return parts.join(' | ') || '—';
}
