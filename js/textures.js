/* ═══════════════════════════════════════════════
   NWN MDL Viewer — Texture Cache & Parsers
   (NWN/Bioware DDS + TGA)
   ═══════════════════════════════════════════════ */

/**
 * Analyses the alpha channel of a decoded RGBA pixel buffer and returns true when
 * the alpha is effectively binary (hard-edge cutout):
 *   • < 5 % of pixels have alpha in the "soft" range 11–244.
 *
 * This is used to tag textures at parse time so scene_build.js / session.js can choose
 * between alphaTest (hard cutout, opaque render queue) and transparent blending:
 *
 *   BIMODAL  (fence bars, foliage):  alpha is 0 or 255 → safe to use alphaTest.
 *   GRADIENT (cobwebs, smoke):       large soft middle → must blend transparently.
 *
 * @param  {Uint8ClampedArray} pixels  RGBA flat array (stride 4), length = w*h*4.
 * @returns {boolean}
 */
function _computeIsBimodal(pixels) {
  const total = pixels.length / 4;
  if (total === 0) return true;
  let middle = 0;
  for (let i = 3; i < pixels.length; i += 4) {
    const a = pixels[i];
    if (a > 10 && a < 245) middle++;
  }
  return (middle / total) < 0.05;
}

//  Texture cache  (key = basename lowercase, no extension)
// ─────────────────────────────────────────────
const textureCache = {};   // 'c_badger' → THREE.Texture
const invertedTexCache = {};  // prevents memory leak on repeated applyTexturesToScene calls

function basename(filename) {
  return filename.replace(/\.[^.]+$/, '').toLowerCase();
}

// ─────────────────────────────────────────────
//  NWN/Bioware DDS parser  (custom 20-byte header + DXT1/DXT5)
//
//  Bioware does not use standard DDS. Custom header:
//    [0-3]   uint32 width
//    [4-7]   uint32 height
//    [8-11]  uint32 mip hint (ignored)
//    [12-15] uint32 mip0 size  (w*h/2 = DXT1 | w*h = DXT5)
//    [16-19] float  1.0 (ignored)
//    [20+]   raw DXT1/DXT5 block data without further header
// ─────────────────────────────────────────────
function parseNWNDDS(buffer) {
  const data = new Uint8Array(buffer);
  if (data.length < 20) throw new Error('DDS: file too short');

  // Detect standard DDS: magic "DDS " (0x44 0x44 0x53 0x20) at offset 0.
  // NWN/Bioware custom DDS has no magic — the width is stored there directly.
  // NWN:EE textures (normal maps, specular maps) use standard DDS with ATI1/ATI2.
  if (data[0] === 0x44 && data[1] === 0x44 && data[2] === 0x53 && data[3] === 0x20) {
    return parseStandardDDS(buffer);
  }

  const w      = data[0]|(data[1]<<8)|(data[2]<<16)|(data[3]<<24);
  const h      = data[4]|(data[5]<<8)|(data[6]<<16)|(data[7]<<24);
  const mip0sz = data[12]|(data[13]<<8)|(data[14]<<16)|(data[15]<<24);

  if (w<=0||h<=0||w>8192||h>8192) throw new Error('DDS: invalid resolution '+w+'x'+h);

  const dxt1Exp = Math.max(1,Math.ceil(w/4))*Math.max(1,Math.ceil(h/4))*8;
  const dxt5Exp = Math.max(1,Math.ceil(w/4))*Math.max(1,Math.ceil(h/4))*16;
  let fmt = (mip0sz===dxt5Exp) ? 'DXT5' : 'DXT1';
  if (mip0sz!==dxt1Exp && mip0sz!==dxt5Exp) {
    fmt = ((data.length-20) >= dxt5Exp) ? 'DXT5' : 'DXT1';
  }

  const pixels  = new Uint8ClampedArray(w * h * 4);
  const blocksX = Math.max(1, Math.ceil(w/4));
  const blocksY = Math.max(1, Math.ceil(h/4));

  function rgb565(v) {
    return [((v>>11)&0x1F)*255/31|0, ((v>>5)&0x3F)*255/63|0, (v&0x1F)*255/31|0];
  }

  function decodeDXT1(src, bx, by) {
    const c0=src[0]|(src[1]<<8), c1=src[2]|(src[3]<<8);
    const [r0,g0,b0]=rgb565(c0), [r1,g1,b1]=rgb565(c1);
    const cr=[r0,r1,0,0], cg=[g0,g1,0,0], cb=[b0,b1,0,0], ca=[255,255,255,255];
    if (c0>c1) {
      cr[2]=(2*r0+r1)/3|0; cg[2]=(2*g0+g1)/3|0; cb[2]=(2*b0+b1)/3|0;
      cr[3]=(r0+2*r1)/3|0; cg[3]=(g0+2*g1)/3|0; cb[3]=(b0+2*b1)/3|0;
    } else {
      cr[2]=(r0+r1)/2|0; cg[2]=(g0+g1)/2|0; cb[2]=(b0+b1)/2|0;
      cr[3]=0; cg[3]=0; cb[3]=0; ca[3]=0;
    }
    let idx=src[4]|(src[5]<<8)|(src[6]<<16)|(src[7]<<24);
    for (let py=0;py<4;py++) for (let px=0;px<4;px++) {
      const dx=bx*4+px, dy=by*4+py;
      if (dx<w&&dy<h) {
        const i=idx&3, p=(dy*w+dx)*4;
        pixels[p]=cr[i]; pixels[p+1]=cg[i]; pixels[p+2]=cb[i]; pixels[p+3]=ca[i];
      }
      idx>>>=2;
    }
  }

  function decodeDXT5Alpha(src) {
    const a0=src[0],a1=src[1];
    const av=[a0,a1,0,0,0,0,0,0];
    if (a0>a1) { for(let i=2;i<8;i++) av[i]=((8-i)*a0+(i-1)*a1)/7|0; }
    else { for(let i=2;i<6;i++) av[i]=((6-i)*a0+(i-1)*a1)/5|0; av[6]=0; av[7]=255; }
    // 6-Byte 48-bit Indexfeld → 16 3-bit Indizes
    const b=[src[2],src[3],src[4],src[5],src[6],src[7]];
    const result=[];
    let bit=0;
    for(let i=0;i<16;i++) {
      const byte_=Math.floor(bit/8), shift=bit%8;
      let v=(b[byte_]>>shift);
      if(shift>5) v|=(b[byte_+1]<<(8-shift));
      result.push(av[v&7]);
      bit+=3;
    }
    return result;
  }

  let off=20;
  for (let by=0;by<blocksY;by++) for (let bx=0;bx<blocksX;bx++) {
    if (fmt==='DXT5') {
      const alphas=decodeDXT5Alpha(data.subarray(off,off+8));
      decodeDXT1(data.subarray(off+8,off+16),bx,by);
      for(let py=0;py<4;py++) for(let px=0;px<4;px++) {
        const dx=bx*4+px,dy=by*4+py;
        if(dx<w&&dy<h) pixels[(dy*w+dx)*4+3]=alphas[py*4+px];
      }
      off+=16;
    } else {
      decodeDXT1(data.subarray(off,off+8),bx,by);
      off+=8;
    }
  }

  // Flip rows vertically — identical to parseTGA.
  // With flipY=false + 1-v UV transform Three.js expects canvas.row[0] = image bottom.
  // DXT1 stores top-to-bottom → canvas.row[0] = image top → must be flipped.
  const rowBytes = w * 4;
  const tmp = new Uint8ClampedArray(rowBytes);
  for (let row = 0; row < (h >> 1); row++) {
    const top = row * rowBytes;
    const bot = (h - 1 - row) * rowBytes;
    tmp.set(pixels.subarray(top, top + rowBytes));
    pixels.copyWithin(top, bot, bot + rowBytes);
    pixels.set(tmp, bot);
  }

  const cvs=document.createElement('canvas');
  cvs.width=w; cvs.height=h;
  cvs.getContext('2d').putImageData(new ImageData(pixels,w,h),0,0);
  const tex=new THREE.CanvasTexture(cvs);
  tex.flipY=false;
  tex.wrapS=THREE.RepeatWrapping;
  tex.wrapT=THREE.RepeatWrapping;
  if (!tex.userData) tex.userData = {};
  tex.userData.hasAlpha  = (fmt === 'DXT5');
  tex.userData.isBimodal = (fmt === 'DXT5') ? _computeIsBimodal(pixels) : true;
  tex.needsUpdate=true;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ─────────────────────────────────────────────
//  Standard DDS parser  (NWN:EE — ATI1/BC4, ATI2/BC5, DXT1/DXT3/DXT5)
//
//  Standard DDS header layout:
//    [0-3]   "DDS "   magic
//    [4-7]   124      dwSize
//    [8-11]           dwFlags
//    [12-15]          dwHeight
//    [16-19]          dwWidth
//    ...
//    [76-79]  32      DDS_PIXELFORMAT.dwSize
//    [80-83]          DDS_PIXELFORMAT.dwFlags
//    [84-87]          DDS_PIXELFORMAT.dwFourCC  ('ATI1','ATI2','DXT1',…)
//    [128+]           image data (without DX10 extension)
//    [148+]           image data (with DX10 extension, FourCC='DX10')
//
//  ATI1 = BC4 (one channel, e.g. specular map)
//  ATI2 = BC5 (two channels RG, e.g. normal map — Z is reconstructed)
// ─────────────────────────────────────────────
function parseStandardDDS(buffer) {
  const data = new Uint8Array(buffer);
  const view = new DataView(buffer);

  if (data.length < 128) throw new Error('DDS: standard header too short');

  const dwHeight = view.getUint32(12, true);
  const dwWidth  = view.getUint32(16, true);

  if (dwWidth <= 0 || dwHeight <= 0 || dwWidth > 8192 || dwHeight > 8192)
    throw new Error('DDS: invalid resolution ' + dwWidth + 'x' + dwHeight);

  // FourCC aus Pixel-Format-Block (Offset 84)
  const pfFourCC = String.fromCharCode(data[84], data[85], data[86], data[87]);

  const w = dwWidth, h = dwHeight;
  const blocksX = Math.max(1, Math.ceil(w / 4));
  const blocksY = Math.max(1, Math.ceil(h / 4));
  const pixels  = new Uint8ClampedArray(w * h * 4);

  // DX10 extension: additional 20 bytes after standard header
  const dataOffset = (pfFourCC === 'DX10') ? 148 : 128;

  // ── BC4 block decoder ────────────────────────────────────────────────────
  // Identical to DXT5 alpha block: 8 bytes, one channel, 16 interpolated values.
  // Used for ATI1 (directly) and ATI2 (twice per block).
  function decodeBC4Block(off) {
    const a0 = data[off], a1 = data[off + 1];
    const av = [a0, a1, 0, 0, 0, 0, 0, 0];
    if (a0 > a1) {
      for (let i = 2; i < 8; i++) av[i] = ((8-i)*a0 + (i-1)*a1) / 7 | 0;
    } else {
      for (let i = 2; i < 6; i++) av[i] = ((6-i)*a0 + (i-1)*a1) / 5 | 0;
      av[6] = 0; av[7] = 255;
    }
    const b = [data[off+2], data[off+3], data[off+4], data[off+5], data[off+6], data[off+7]];
    const result = new Uint8Array(16);
    let bit = 0;
    for (let i = 0; i < 16; i++) {
      const byteIdx = Math.floor(bit / 8), shift = bit % 8;
      let v = b[byteIdx] >> shift;
      if (shift > 5) v |= (b[byteIdx + 1] << (8 - shift));
      result[i] = av[v & 7];
      bit += 3;
    }
    return result;
  }

  // ── rgb565 + DXT1 block decoder (for standard DXT1/DXT3/DXT5) ────────────
  function rgb565(v) {
    return [((v>>11)&0x1F)*255/31|0, ((v>>5)&0x3F)*255/63|0, (v&0x1F)*255/31|0];
  }

  function decodeDXT1Block(off, bx, by, alphaOverride) {
    const c0=data[off]|(data[off+1]<<8), c1=data[off+2]|(data[off+3]<<8);
    const [r0,g0,b0]=rgb565(c0), [r1,g1,b1]=rgb565(c1);
    const cr=[r0,r1,0,0], cg=[g0,g1,0,0], cb=[b0,b1,0,0], ca=[255,255,255,255];
    if (c0>c1) {
      cr[2]=(2*r0+r1)/3|0; cg[2]=(2*g0+g1)/3|0; cb[2]=(2*b0+b1)/3|0;
      cr[3]=(r0+2*r1)/3|0; cg[3]=(g0+2*g1)/3|0; cb[3]=(b0+2*b1)/3|0;
    } else {
      cr[2]=(r0+r1)/2|0; cg[2]=(g0+g1)/2|0; cb[2]=(b0+b1)/2|0;
      cr[3]=0; cg[3]=0; cb[3]=0; ca[3]=0;
    }
    let idx=data[off+4]|(data[off+5]<<8)|(data[off+6]<<16)|(data[off+7]<<24);
    for (let py=0;py<4;py++) for (let px=0;px<4;px++) {
      const dx=bx*4+px, dy=by*4+py;
      if (dx<w&&dy<h) {
        const i=idx&3, p=(dy*w+dx)*4;
        pixels[p]=cr[i]; pixels[p+1]=cg[i]; pixels[p+2]=cb[i];
        pixels[p+3]=alphaOverride ? alphaOverride[py*4+px] : ca[i];
      }
      idx>>>=2;
    }
  }

  let hasAlpha   = false;
  let isNormalMap = false;

  if (pfFourCC === 'ATI1') {
    // ── BC4: 8 bytes/block, one channel (specular, greyscale) ─────────────
    let off = dataOffset;
    for (let by=0; by<blocksY; by++) for (let bx=0; bx<blocksX; bx++) {
      const vals = decodeBC4Block(off);
      for (let py=0; py<4; py++) for (let px=0; px<4; px++) {
        const dx=bx*4+px, dy=by*4+py;
        if (dx<w&&dy<h) {
          const v=vals[py*4+px], p=(dy*w+dx)*4;
          pixels[p]=v; pixels[p+1]=v; pixels[p+2]=v; pixels[p+3]=255;
        }
      }
      off += 8;
    }

  } else if (pfFourCC === 'ATI2') {
    // ── BC5: 16 bytes/block, two channels R+G (normal map XY) ─────────────
    // Z component is reconstructed from X and Y: Z = sqrt(1 - X² - Y²)
    isNormalMap = true;
    let off = dataOffset;
    for (let by=0; by<blocksY; by++) for (let bx=0; bx<blocksX; bx++) {
      const rVals = decodeBC4Block(off);
      const gVals = decodeBC4Block(off + 8);
      for (let py=0; py<4; py++) for (let px=0; px<4; px++) {
        const dx=bx*4+px, dy=by*4+py;
        if (dx<w&&dy<h) {
          const ri=rVals[py*4+px], gi=gVals[py*4+px];
          // [0,255] → [-1,1] → compute Z → [0,255]
          const rx=ri/127.5-1.0, ry=gi/127.5-1.0;
          const rz=Math.sqrt(Math.max(0.0, 1.0-rx*rx-ry*ry));
          const bi=Math.round((rz+1.0)*127.5);
          const p=(dy*w+dx)*4;
          pixels[p]=ri; pixels[p+1]=gi; pixels[p+2]=bi; pixels[p+3]=255;
        }
      }
      off += 16;
    }

  } else if (pfFourCC === 'DXT1') {
    // ── Standard DXT1: 8 bytes/block ─────────────────────────────────────
    let off = dataOffset;
    for (let by=0; by<blocksY; by++) for (let bx=0; bx<blocksX; bx++) {
      decodeDXT1Block(off, bx, by, null);
      off += 8;
    }

  } else if (pfFourCC === 'DXT3') {
    // ── Standard DXT3: explicit 4-bit alpha + DXT1 (16 bytes/block) ───────
    hasAlpha = true;
    let off = dataOffset;
    for (let by=0; by<blocksY; by++) for (let bx=0; bx<blocksX; bx++) {
      const alphas = new Uint8Array(16);
      for (let i=0; i<8; i++) {
        alphas[i*2]   = (data[off+i] & 0xF) * 17;   // 4-bit → 8-bit
        alphas[i*2+1] = (data[off+i] >> 4)  * 17;
      }
      decodeDXT1Block(off + 8, bx, by, alphas);
      off += 16;
    }

  } else if (pfFourCC === 'DXT5') {
    // ── Standard DXT5: interpolated alpha block + DXT1 (16 bytes/block) ───
    hasAlpha = true;
    let off = dataOffset;
    for (let by=0; by<blocksY; by++) for (let bx=0; bx<blocksX; bx++) {
      // Alpha block = BC4 block (identical format)
      const alphas = decodeBC4Block(off);
      decodeDXT1Block(off + 8, bx, by, alphas);
      off += 16;
    }

  } else {
    throw new Error('DDS: unsupported format: "' + pfFourCC + '"');
  }

  // Flip vertically — standard DDS: top-to-bottom, Three.js flipY=false expects bottom-to-top
  const rowBytes = w * 4;
  const tmp = new Uint8ClampedArray(rowBytes);
  for (let row=0; row<(h>>1); row++) {
    const top=row*rowBytes, bot=(h-1-row)*rowBytes;
    tmp.set(pixels.subarray(top, top+rowBytes));
    pixels.copyWithin(top, bot, bot+rowBytes);
    pixels.set(tmp, bot);
  }

  const cvs = document.createElement('canvas');
  cvs.width = w; cvs.height = h;
  cvs.getContext('2d').putImageData(new ImageData(pixels, w, h), 0, 0);
  const tex = new THREE.CanvasTexture(cvs);
  tex.flipY = false;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  if (!tex.userData) tex.userData = {};
  tex.userData.hasAlpha    = hasAlpha;
  tex.userData.isBimodal   = hasAlpha ? _computeIsBimodal(pixels) : true;
  tex.userData.isNormalMap = isNormalMap;
  tex.needsUpdate = true;
  // Normal maps (ATI2/BC5) are linear, everything else is sRGB
  tex.colorSpace = isNormalMap ? THREE.LinearSRGBColorSpace : THREE.SRGBColorSpace;
  return tex;
}

// ─────────────────────────────────────────────
//  TGA parser  (Type 2 uncompressed + Type 10 RLE, 16/24/32 bit)
// ─────────────────────────────────────────────
function parseTGA(buffer) {
  const data = new Uint8Array(buffer);
  const idLen       = data[0];
  const colorMapType= data[1];
  const imgType     = data[2];
  // color map fields: 3-7
  const xOrigin     = data[8]  | (data[9]  << 8);
  const yOrigin     = data[10] | (data[11] << 8);
  const width       = data[12] | (data[13] << 8);
  const height      = data[14] | (data[15] << 8);
  const bpp         = data[16];   // bits per pixel: 16, 24, 32
  const imgDesc     = data[17];
  const topToBottom = !!(imgDesc & 0x20);  // bit 5

  if (width === 0 || height === 0) throw new Error('TGA: invalid dimensions');

  // Supported types: 2 = uncompressed true-color, 10 = RLE true-color, 3 = grey
  if (![2, 3, 10, 11].includes(imgType)) {
    throw new Error(`TGA: image type ${imgType} not supported`);
  }

  // Skip header + ID + colormap
  const colorMapSize = colorMapType === 1 ? ((data[5] | (data[6] << 8)) * Math.ceil(data[7] / 8)) : 0;
  let offset = 18 + idLen + colorMapSize;

  const bytesPerPixel = Math.ceil(bpp / 8);
  const pixels = new Uint8ClampedArray(width * height * 4);

  function readPixel(off) {
    let r, g, b, a = 255;
    if (bpp === 32) {
      b = data[off]; g = data[off+1]; r = data[off+2]; a = data[off+3];
    } else if (bpp === 24) {
      b = data[off]; g = data[off+1]; r = data[off+2];
    } else if (bpp === 16) {
      const v = data[off] | (data[off+1] << 8);
      r = ((v >> 10) & 0x1F) * 8;
      g = ((v >> 5)  & 0x1F) * 8;
      b = ( v        & 0x1F) * 8;
    } else if (bpp === 8) {  // greyscale
      r = g = b = data[off];
    } else {
      r = g = b = 0;
    }
    return [r, g, b, a];
  }

  let pixelIndex = 0;

  if (imgType === 2 || imgType === 3) {
    // Uncompressed
    for (let p = 0; p < width * height; p++) {
      const [r, g, b, a] = readPixel(offset);
      pixels[p * 4]     = r;
      pixels[p * 4 + 1] = g;
      pixels[p * 4 + 2] = b;
      pixels[p * 4 + 3] = a;
      offset += bytesPerPixel;
    }
  } else {
    // RLE compressed (type 10/11)
    let p = 0;
    while (p < width * height) {
      const rep = data[offset++];
      if (rep & 0x80) {
        // Run-length packet
        const count = (rep & 0x7F) + 1;
        const [r, g, b, a] = readPixel(offset);
        offset += bytesPerPixel;
        for (let k = 0; k < count && p < width * height; k++, p++) {
          pixels[p * 4]     = r;
          pixels[p * 4 + 1] = g;
          pixels[p * 4 + 2] = b;
          pixels[p * 4 + 3] = a;
        }
      } else {
        // Raw packet
        const count = rep + 1;
        for (let k = 0; k < count && p < width * height; k++, p++) {
          const [r, g, b, a] = readPixel(offset);
          pixels[p * 4]     = r;
          pixels[p * 4 + 1] = g;
          pixels[p * 4 + 2] = b;
          pixels[p * 4 + 3] = a;
          offset += bytesPerPixel;
        }
      }
    }
  }

  // TGA stores bottom-to-top by default; flip unless top-to-bottom flag is set
  if (!topToBottom) {
    const rowBytes = width * 4;
    const tmp = new Uint8ClampedArray(rowBytes);
    for (let row = 0; row < (height >> 1); row++) {
      const top = row * rowBytes;
      const bot = (height - 1 - row) * rowBytes;
      tmp.set(pixels.subarray(top, top + rowBytes));
      pixels.copyWithin(top, bot, bot + rowBytes);
      pixels.set(tmp, bot);
    }
  }

  // Build canvas → THREE.CanvasTexture
  const cvs = document.createElement('canvas');
  cvs.width = width; cvs.height = height;
  const ctx = cvs.getContext('2d');
  ctx.putImageData(new ImageData(pixels, width, height), 0, 0);

  const tex = new THREE.CanvasTexture(cvs);
  tex.flipY = false;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  if (!tex.userData) tex.userData = {};
  tex.userData.hasAlpha  = (bpp === 32);
  tex.userData.isBimodal = (bpp === 32) ? _computeIsBimodal(pixels) : true;
  tex.needsUpdate = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  
  return tex;
}

// ─────────────────────────────────────────────
//  NWN PLT parser  (Bioware palette texture)
//
//  Header (24 bytes):
//    [0-7]   "PLT V1  "  signature
//    [8-11]  uint32 LE   number of layers (always 10)
//    [12-15] uint32 LE   0 (reserved)
//    [16-19] uint32 LE   width
//    [20-23] uint32 LE   height
//    [24+]   pixel data  2 bytes each: [color_index, layer_index]
//
//  10 layers (0–9): skin, hair, metal1, metal2, cloth1, cloth2,
//                   leather1, leather2, tattoo1, tattoo2
//
//  Currently: color_index is rendered as greyscale.
//  usedLayers[] and pltBuffer are stored for later
//  palette mapping.
// ─────────────────────────────────────────────
function parseNWNPLT(buffer) {
  const data = new Uint8Array(buffer);
  if (data.length < 24) throw new Error('PLT: file too short');

  const sig = String.fromCharCode(...data.subarray(0, 8));
  if (!sig.startsWith('PLT V1')) throw new Error('PLT: invalid signature "' + sig.trim() + '"');

  const numLayers = data[8]  | (data[9]  << 8) | (data[10] << 16) | (data[11] << 24);
  const w         = data[16] | (data[17] << 8) | (data[18] << 16) | (data[19] << 24);
  const h         = data[20] | (data[21] << 8) | (data[22] << 16) | (data[23] << 24);

  if (w <= 0 || h <= 0 || w > 8192 || h > 8192)
    throw new Error('PLT: invalid resolution ' + w + 'x' + h);

  const expectedBytes = w * h * 2;
  if (data.length - 24 < expectedBytes)
    throw new Error('PLT: incomplete pixel data (expected ' + expectedBytes + ', received ' + (data.length - 24) + ')');

  const pixels     = new Uint8ClampedArray(w * h * 4);
  const usedLayers = new Array(10).fill(false);

  for (let i = 0; i < w * h; i++) {
    const off        = 24 + i * 2;
    const colorIndex = data[off];      // 0–255: brightness value
    const layerIdx   = data[off + 1];  // 0–9:   layer membership

    if (layerIdx < 10) usedLayers[layerIdx] = true;

    const p = i * 4;
    pixels[p]     = colorIndex;
    pixels[p + 1] = colorIndex;
    pixels[p + 2] = colorIndex;
    pixels[p + 3] = 255;
  }

  // PLT stores top-to-bottom → flip vertically (like DDS)
  const rowBytes = w * 4;
  const tmp = new Uint8ClampedArray(rowBytes);
  for (let row = 0; row < (h >> 1); row++) {
    const top = row * rowBytes;
    const bot = (h - 1 - row) * rowBytes;
    tmp.set(pixels.subarray(top, top + rowBytes));
    pixels.copyWithin(top, bot, bot + rowBytes);
    pixels.set(tmp, bot);
  }

  const cvs = document.createElement('canvas');
  cvs.width = w; cvs.height = h;
  cvs.getContext('2d').putImageData(new ImageData(pixels, w, h), 0, 0);

  const pltTex = new THREE.CanvasTexture(cvs);
  pltTex.flipY = false;
  pltTex.wrapS = THREE.RepeatWrapping;
  pltTex.wrapT = THREE.RepeatWrapping;
  if (!pltTex.userData) pltTex.userData = {};
  pltTex.userData.hasAlpha   = false;
  pltTex.userData.isPLT      = true;        // marker for later palette mapping
  pltTex.userData.pltWidth   = w;
  pltTex.userData.pltHeight  = h;
  pltTex.userData.numLayers  = numLayers;
  pltTex.userData.usedLayers = usedLayers;  // bool[10]: which layers are present
  pltTex.userData.pltBuffer  = buffer;      // raw data for later palette mapping
  pltTex.needsUpdate = true;
  pltTex.colorSpace = THREE.SRGBColorSpace;
  return pltTex;
}

// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
//  PLT → re-render canvas with palette
//
//  Reads pltBuffer from tex.userData, replaces the greyscale
//  value of each pixel with the real palette RGB value
//  from palettes.js (getPaletteRGB).
//  Called when the user changes a layer colour.
// ─────────────────────────────────────────────
function applyPLTPalette(tex) {
  if (!tex || !tex.userData || !tex.userData.isPLT) return;
  const buffer = tex.userData.pltBuffer;
  if (!buffer) return;

  const data     = new Uint8Array(buffer);
  const w        = tex.userData.pltWidth;
  const h        = tex.userData.pltHeight;
  const pixels   = new Uint8ClampedArray(w * h * 4);
  // Layer 0 (skin) + 1 (hair) → global; layers 2–9 → per part/texture
  const partRows = getPltRows(tex.userData.pltTexKey || '__default__');

  for (let i = 0; i < w * h; i++) {
    const off        = 24 + i * 2;
    const colorIndex = data[off];
    const layerIdx   = data[off + 1];
    const row        = (layerIdx < 10)
      ? ((layerIdx <= 1) ? pltLayerRows[layerIdx] : partRows[layerIdx])
      : 0;
    const [r, g, b]  = getPaletteRGB(layerIdx, row, colorIndex);
    const p = i * 4;
    pixels[p]     = r;
    pixels[p + 1] = g;
    pixels[p + 2] = b;
    pixels[p + 3] = 255;
  }

  // PLT top-to-bottom → flip vertically
  const rowBytes = w * 4;
  const tmp = new Uint8ClampedArray(rowBytes);
  for (let row = 0; row < (h >> 1); row++) {
    const top = row * rowBytes;
    const bot = (h - 1 - row) * rowBytes;
    tmp.set(pixels.subarray(top, top + rowBytes));
    pixels.copyWithin(top, bot, bot + rowBytes);
    pixels.set(tmp, bot);
  }

  const cvs = tex.image;
  cvs.getContext('2d').putImageData(new ImageData(pixels, w, h), 0, 0);
  tex.needsUpdate = true;
}

// Re-render all PLT textures in cache (after layer selection)
function reapplyAllPLTPalettes() {
  for (const tex of Object.values(textureCache)) {
    if (tex && tex.userData && tex.userData.isPLT) {
      applyPLTPalette(tex);
    }
  }
}

// ─────────────────────────────────────────────
//  Specular map → roughness map (inverted)
//
//  NWN:EE spec maps: bright = shiny, dark = matte
//  Three.js roughnessMap:  bright = rough, dark = smooth
//  → Invert RGB channels: r=255-r, g=255-g, b=255-b
//  Alpha channel is not modified.
//  Returns a new CanvasTexture (original is preserved).
// ─────────────────────────────────────────────
function invertSpecToRoughnessMap(sourceTex, cacheKey) {
  // Cache hit: inverted version already present
  if (cacheKey && invertedTexCache[cacheKey]) return invertedTexCache[cacheKey];

  const src = sourceTex.image;
  if (!src || !src.width) return sourceTex;

  const w   = src.width;
  const h   = src.height;
  const cvs = document.createElement('canvas');
  cvs.width = w; cvs.height = h;
  const ctx = cvs.getContext('2d');
  ctx.drawImage(src, 0, 0);

  const imgData = ctx.getImageData(0, 0, w, h);
  const d       = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i]     = 255 - d[i];
    d[i + 1] = 255 - d[i + 1];
    d[i + 2] = 255 - d[i + 2];
  }
  ctx.putImageData(imgData, 0, 0);

  const tex = new THREE.CanvasTexture(cvs);
  tex.colorSpace = THREE.LinearSRGBColorSpace;  // roughness maps are linear
  tex.flipY  = false;
  tex.wrapS  = THREE.RepeatWrapping;
  tex.wrapT  = THREE.RepeatWrapping;
  tex.needsUpdate = true;

  if (cacheKey) invertedTexCache[cacheKey] = tex;
  return tex;
}