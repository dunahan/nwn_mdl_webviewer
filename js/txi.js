/* ═══════════════════════════════════════════════
   NWN MDL Viewer — TXI Parser & Cache

   TXI files assign additional properties to a texture
   of the same name (e.g. decal, clamp, blending,
   procedural effect, bump map references).

   The file "c_air_skin.txi" belongs to "c_air_skin.tga".
   ═══════════════════════════════════════════════ */

// TXI cache: basename (lowercase, no extension) → parsed TXI data
const txiCache = {};

// Materials with active sprite-sheet animation (proceduretype cycle)
const uvAnimRegistry = [];   // { tex, numx, numy, fps, elapsed }

// Called on model reset
function clearUVAnimRegistry() {
  uvAnimRegistry.length = 0;
}

// ─────────────────────────────────────────────
//  parseTXI  — reads a TXI text file
// ─────────────────────────────────────────────
function parseTXI(text) {
  const result = {
    // ── Rendering ────────────────────────────
    decal:                false,   // 1 = transparent overlay, no depth write
    clamp:                0,       // 0=repeat/repeat, 1=clampS, 2=clampT, 3=both
    blending:             null,    // 'additive' | 'punchthrough' | null
    mipmap:               true,    // false = mipmapping disabled
    filter:               true,    // false = nearest filtering

    // ── Texture references ───────────────────
    bumpmaptexture:       null,    // name of a bump map texture
    envmaptexture:        null,    // name of an environment map texture

    // ── Sprite animation (numx/numy/fps) ─────
    numx:                 1,       // sprite-sheet columns
    numy:                 1,       // sprite-sheet rows
    fps:                  0,       // frames per second

    // ── Procedural effects ───────────────────
    // (arturo = heat shimmer, water, cycle, …)
    // Not animated in viewer, stored as marker.
    proceduretype:        null,    // 'arturo' | 'water' | 'cycle' | …
    speed:                0,
    distort:              false,
    distortangle:         0,
    distortionamplitude:  0,
    arturowidth:          0,
    arturoheight:         0,
    downsamplemax:        0,
    downsamplemin:        0,

    // ── UV channel animation ─────────────────
    // channelscale / channeltranslate: N values each
    // (not rendered interactively, but parsed)
    channelscale:         [],
    channeltranslate:     [],

    // ── Miscellaneous ────────────────────────
    alphamean:            0,
  };

  const lines   = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  let   collect = null;   // currently active multi-line block
  let   needed  = 0;      // remaining values in block

  for (let line of lines) {
    // Strip inline comments
    const ci = line.indexOf('//');
    if (ci >= 0) line = line.substring(0, ci);
    line = line.trim();
    if (!line) continue;

    // Running multi-line block (channelscale / channeltranslate)
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

      // ── Rendering ────────────────────────────
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

      // ── Texture references ───────────────────
      case 'bumpmaptexture':
      case 'bumpmap':
        result.bumpmaptexture = val1.toLowerCase() || null;
        break;
      case 'envmaptexture':
      case 'envmap':
        result.envmaptexture = val1.toLowerCase() || null;
        break;

      // ── Sprite animation ─────────────────────
      case 'numx':
        result.numx = parseInt(val1) || 1;
        break;
      case 'numy':
        result.numy = parseInt(val1) || 1;
        break;
      case 'fps':
        result.fps = parseFloat(val1) || 0;
        break;

      // ── Procedural effects ───────────────────
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

      // ── UV channel blocks ────────────────────
      // Format: channelscale <count>
      //   <value1>
      //   <value2>  …
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

      // ── Miscellaneous ────────────────────────
      case 'alphamean':
        result.alphamean = parseFloat(val1) || 0;
        break;

      // Unknown keys are silently skipped
      default:
        break;
    }
  }

  return result;
}

// ─────────────────────────────────────────────
//  applyTXIToMaterial
//
//  Applies the parsed TXI properties to a
//  THREE.Material and its associated texture.
//  Called from applyTexturesToScene().
// ─────────────────────────────────────────────
function applyTXIToMaterial(mat, txi, tex) {
  if (!mat || !txi) return;

  // ── decal → transparent overlay ─────────────
  // No depth write, DoubleSide, no alphaTest
  if (txi.decal) {
    mat.transparent = true;
    mat.depthWrite  = false;
    mat.side        = THREE.DoubleSide;
    mat.alphaTest   = 0;         // override alphaTest (no clipping desired)
  }

  // ── Additive blending ────────────────────────
  if (txi.blending === 'additive') {
    mat.blending    = THREE.AdditiveBlending;
    mat.transparent = true;
    mat.depthWrite  = false;
    mat.alphaTest   = 0;
  }

  // ── UV wrap mode (clamp) ─────────────────────
  if (tex && txi.clamp > 0) {
    if (txi.clamp === 1 || txi.clamp === 3) tex.wrapS = THREE.ClampToEdgeWrapping;
    if (txi.clamp === 2 || txi.clamp === 3) tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
  }

  // ── Bump map from TXI reference ──────────────
  if (txi.bumpmaptexture && textureCache[txi.bumpmaptexture]) {
    mat.bumpMap   = textureCache[txi.bumpmaptexture];
    mat.bumpScale = 0.05;
  }

  // ── Environment map from TXI reference ───────
  if (txi.envmaptexture && textureCache[txi.envmaptexture]) {
    mat.envMap          = textureCache[txi.envmaptexture];
    mat.envMapIntensity = 0.5;
  }

  // ── Disable mipmapping ───────────────────────
  if (!txi.mipmap && tex) {
    tex.minFilter       = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate     = true;
  }

  // ── Nearest filtering ────────────────────────
  if (!txi.filter && tex) {
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
  }

  // ── Procedural effects ───────────────────────
  if (txi.proceduretype) {
    mat.userData = mat.userData || {};
    mat.userData.txi_proceduretype  = txi.proceduretype;
    mat.userData.txi_speed          = txi.speed;
    mat.userData.txi_distort        = txi.distort;
    mat.userData.txi_distortamp     = txi.distortionamplitude;

    // ── Sprite-sheet animation (proceduretype cycle) ──
    if (txi.proceduretype === 'cycle' && tex && (txi.numx > 1 || txi.numy > 1) && txi.fps > 0) {
      // Restrict texture to one cell
      tex.repeat.set(1 / txi.numx, 1 / txi.numy);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      // Start frame: first cell top-left
      // flipY=false → row 0 (screen top) is at high V value
      tex.offset.set(0, (txi.numy - 1) / txi.numy);
      tex.needsUpdate = true;
      uvAnimRegistry.push({ tex, numx: txi.numx, numy: txi.numy, fps: txi.fps, elapsed: 0 });
    }
  }

  mat.needsUpdate = true;
}

// ─────────────────────────────────────────────
//  buildTXISummary
//
//  Returns a human-readable summary of the active
//  TXI properties (for log/UI).
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

// ─────────────────────────────────────────────
//  updateUVAnims  — call once per frame (delta in seconds)
// ─────────────────────────────────────────────
function updateUVAnims(delta) {
  for (const e of uvAnimRegistry) {
    e.elapsed += delta;
    const frameCount = e.numx * e.numy;
    const frameIndex = Math.floor(e.elapsed * e.fps) % frameCount;
    const col = frameIndex % e.numx;
    const row = Math.floor(frameIndex / e.numx);
    // Row 0 = top of image; with flipY=false V=1 is at the top
    e.tex.offset.set(
      col / e.numx,
      (e.numy - 1 - row) / e.numy
    );
  }
}
