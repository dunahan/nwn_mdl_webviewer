/* ═══════════════════════════════════════════════
   NWN MDL Viewer — Texture Cache & Parsers
   (NWN/Bioware DDS + TGA)
   ═══════════════════════════════════════════════ */

//  Textur-Cache  (key = basename lowercase, kein extension)
// ─────────────────────────────────────────────
const textureCache = {};   // 'c_badger' → THREE.Texture

function basename(filename) {
  return filename.replace(/\.[^.]+$/, '').toLowerCase();
}

// ─────────────────────────────────────────────
//  NWN/Bioware DDS-Parser  (custom 20-Byte Header + DXT1/DXT5)
//
//  Bioware nutzt kein Standard-DDS. Eigener Header:
//    [0-3]   uint32 Breite
//    [4-7]   uint32 Höhe
//    [8-11]  uint32 Mip-Hinweis (ignoriert)
//    [12-15] uint32 Mip0-Größe  (w*h/2 = DXT1 | w*h = DXT5)
//    [16-19] float  1.0 (ignoriert)
//    [20+]   Rohe DXT1/DXT5-Blockdaten ohne weiteren Header
// ─────────────────────────────────────────────
function parseNWNDDS(buffer) {
  const data = new Uint8Array(buffer);
  if (data.length < 20) throw new Error('DDS: Datei zu kurz');

  const w      = data[0]|(data[1]<<8)|(data[2]<<16)|(data[3]<<24);
  const h      = data[4]|(data[5]<<8)|(data[6]<<16)|(data[7]<<24);
  const mip0sz = data[12]|(data[13]<<8)|(data[14]<<16)|(data[15]<<24);

  if (w<=0||h<=0||w>8192||h>8192) throw new Error('DDS: Ungültige Auflösung '+w+'x'+h);

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

  // Zeilen vertikal spiegeln — identisch zu parseTGA.
  // Mit flipY=false + 1-v UV-Transform erwartet Three.js canvas.row[0] = Bild-Unten.
  // DXT1 speichert top-to-bottom → canvas.row[0] = Bild-Oben → muss gespiegelt werden.
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
  tex.userData.hasAlpha = (fmt === 'DXT5');
  tex.needsUpdate=true;
  return tex;
}

// ─────────────────────────────────────────────
//  TGA-Parser  (Type 2 uncompressed + Type 10 RLE, 16/24/32 bit)
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

  if (width === 0 || height === 0) throw new Error('TGA: ungültige Größe');

  // Supported types: 2 = uncompressed true-color, 10 = RLE true-color, 3 = grey
  if (![2, 3, 10, 11].includes(imgType)) {
    throw new Error(`TGA: Bildtyp ${imgType} nicht unterstützt`);
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
  tex.userData.hasAlpha = (bpp === 32);
  tex.needsUpdate = true;
  return tex;
}

// ─────────────────────────────────────────────
//  NWN PLT-Parser  (Bioware Palette Texture)
//
//  Header (24 Bytes):
//    [0-7]   "PLT V1  "  Signatur
//    [8-11]  uint32 LE   Anzahl Layer (immer 10)
//    [12-15] uint32 LE   0 (reserviert)
//    [16-19] uint32 LE   Breite
//    [20-23] uint32 LE   Höhe
//    [24+]   Pixeldaten  je 2 Bytes: [color_index, layer_index]
//
//  10 Layer (0–9): skin, hair, metal1, metal2, cloth1, cloth2,
//                  leather1, leather2, tattoo1, tattoo2
//
//  Aktuell: Layer werden ignoriert — color_index wird als
//           Graustufe gerendert. Vollständiges Paletten-Mapping
//           folgt in einem späteren Schritt.
// ─────────────────────────────────────────────
function parseNWNPLT(buffer) {
  const data = new Uint8Array(buffer);
  if (data.length < 24) throw new Error('PLT: Datei zu kurz');

  const sig = String.fromCharCode(...data.subarray(0, 8));
  if (!sig.startsWith('PLT V1')) throw new Error('PLT: Ungültige Signatur "' + sig.trim() + '"');

  const numLayers = data[8]  | (data[9]  << 8) | (data[10] << 16) | (data[11] << 24);
  const w         = data[16] | (data[17] << 8) | (data[18] << 16) | (data[19] << 24);
  const h         = data[20] | (data[21] << 8) | (data[22] << 16) | (data[23] << 24);

  if (w <= 0 || h <= 0 || w > 8192 || h > 8192)
    throw new Error('PLT: Ungültige Auflösung ' + w + 'x' + h);

  const expectedBytes = w * h * 2;
  if (data.length - 24 < expectedBytes)
    throw new Error('PLT: Pixeldaten unvollständig (erwartet ' + expectedBytes + ', erhalten ' + (data.length - 24) + ')');

  const pixels = new Uint8ClampedArray(w * h * 4);

  for (let i = 0; i < w * h; i++) {
    const off        = 24 + i * 2;
    const colorIndex = data[off];     // 0–255: Helligkeitswert
    // data[off + 1]  = layer_index (0–9) — vorerst ignoriert

    const p = i * 4;
    pixels[p]     = colorIndex;
    pixels[p + 1] = colorIndex;
    pixels[p + 2] = colorIndex;
    pixels[p + 3] = 255;
  }

  // PLT speichert top-to-bottom → vertikal spiegeln (wie DDS)
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

  const tex = new THREE.CanvasTexture(cvs);
  tex.flipY = false;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  if (!tex.userData) tex.userData = {};
  tex.userData.hasAlpha  = false;
  tex.userData.isPLT     = true;       // Marker für späteres Paletten-Mapping
  tex.userData.pltWidth  = w;
  tex.userData.pltHeight = h;
  tex.userData.numLayers = numLayers;
  tex.needsUpdate = true;
  return tex;
}

// ─────────────────────────────────────────────
