/* ═══════════════════════════════════════════════
   NWN MDL Viewer — Scene Builder (buildScene)
   ═══════════════════════════════════════════════ */

//  Build scene from parsed model
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
//  Tile Position Offset  (Set Browser — Group View)
//
//  Set by SetBrowser/loader.js before each buildScene() call
//  when multiple tiles are positioned next to each other in Three.js space.
//  Automatically reset after the call to buildScene().
//
//  Coordinates are in Three.js world coordinates (X=East, Y=Up, Z=South).
// ─────────────────────────────────────────────

let _buildOffset = null;   // [x, z] | null

function setBuildOffset(x, z) {
  _buildOffset = [x, z];
}

// ─────────────────────────────────────────────
//  Smoothing-Group-aware normal calculation
//  (NWN / 3dsMax compatible)
//
//  Two faces smooth across a shared vertex if and only if
//  (sgA & sgB) !== 0. sg === 0 means: no group → always
//  hard edge (flat normal for this face).
// ─────────────────────────────────────────────
function computeSGNormals(node) {
  const faces = node.faces;
  const verts = node.verts;
  const fCount = faces.length;

  // 1. Calculate flat face normals
  const faceNX = new Float32Array(fCount);
  const faceNY = new Float32Array(fCount);
  const faceNZ = new Float32Array(fCount);

  for (let fi = 0; fi < fCount; fi++) {
    const [a, b, c] = faces[fi].v;
    const va = verts[a] || [0, 0, 0];
    const vb = verts[b] || [0, 0, 0];
    const vc = verts[c] || [0, 0, 0];
    const e1x = vb[0] - va[0], e1y = vb[1] - va[1], e1z = vb[2] - va[2];
    const e2x = vc[0] - va[0], e2y = vc[1] - va[1], e2z = vc[2] - va[2];
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    faceNX[fi] = nx / len; faceNY[fi] = ny / len; faceNZ[fi] = nz / len;
  }

  // 2. Vertex → List of faces using it
  const vertFaces = new Array(verts.length);
  for (let fi = 0; fi < fCount; fi++) {
    for (let k = 0; k < 3; k++) {
      const vi = faces[fi].v[k];
      if (!vertFaces[vi]) vertFaces[vi] = [];
      vertFaces[vi].push(fi);
    }
  }

  // 3. Per vertex: Cluster faces by SG connectivity using Union-Find,
  //    then average normals within each cluster.
  const out = new Float32Array(fCount * 9);

  for (let vi = 0; vi < verts.length; vi++) {
    const fList = vertFaces[vi];
    if (!fList) continue;
    const n = fList.length;

    // Union-Find
    const parent = new Int32Array(n);
    for (let i = 0; i < n; i++) parent[i] = i;

    const _find = (x) => {
      while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
      return x;
    };

    for (let i = 0; i < n; i++) {
      const sgi = faces[fList[i]].sg;
      if (sgi === 0) continue;           // sg=0: isolated, never merge
      for (let j = i + 1; j < n; j++) {
        const sgj = faces[fList[j]].sg;
        if (sgj === 0) continue;
        if (sgi & sgj) {
          const ri = _find(i), rj = _find(j);
          if (ri !== rj) parent[ri] = rj;
        }
      }
    }
    
    // Map → typed arrays. Cluster keys fall within a known, small
    // value range (n is typically 2–6)—an array index is cheaper
    // here than a hash lookup. Group IDs: cluster roots (sg≠0) lie
    // in [0, n) via _find(i); isolated sg=0 faces are assigned
    // n+i e [n, 2n) so that the two ranges never collide.
    const groupCount = n * 2;
    const clNX = new Float64Array(groupCount);
    const clNY = new Float64Array(groupCount);
    const clNZ = new Float64Array(groupCount);
    const groupOf = new Int32Array(n);

    for (let i = 0; i < n; i++) {
      const key = (faces[fList[i]].sg === 0) ? (n + i) : _find(i);
      groupOf[i] = key;
      clNX[key] += faceNX[fList[i]];
      clNY[key] += faceNY[fList[i]];
      clNZ[key] += faceNZ[fList[i]];
    }

    // Normalize every used group slot in place (n is small, so
    // negligibly cheap, even if a few slots remain unused)
    for (let g = 0; g < groupCount; g++) {
      const nx = clNX[g], ny = clNY[g], nz = clNZ[g];
    //const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;  // until changes in v184
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (len > 1e-8) {
        clNX[g] = nx / len; clNY[g] = ny / len; clNZ[g] = nz / len;
      }
    }

    // Write to exploded buffer — groupOf[i] wiederverwendet den bereits
    // berechneten Schlüssel statt _find(i) ein zweites Mal aufzurufen.
    for (let i = 0; i < n; i++) {
      const fi  = fList[i];
      const key = groupOf[i];
      for (let k = 0; k < 3; k++) {
        if (faces[fi].v[k] === vi) {
          out[fi * 9 + k * 3 + 0] = clNX[key];
          out[fi * 9 + k * 3 + 1] = clNY[key];
          out[fi * 9 + k * 3 + 2] = clNZ[key];
          break;
        }
      }
    }
  }

  return out;
}

/*
  * Detects flat meshes based on the bounding box.
  * If the smallest dimension is less than the FLAT_RATIO of the largest,
  * the mesh is considered a 2D surface → DoubleSide is appropriate.
*/
const FLAT_RATIO = 0.05; // 5% — adjustable

function isFlatMesh(node) {
  const verts = node.verts;
  if (!verts || verts.length < 3) return false;

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (const v of verts) {
    if (v[0] < minX) minX = v[0];  if (v[0] > maxX) maxX = v[0];
    if (v[1] < minY) minY = v[1];  if (v[1] > maxY) maxY = v[1];
    if (v[2] < minZ) minZ = v[2];  if (v[2] > maxZ) maxZ = v[2];
  }

  const maxExt = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
  const minExt = Math.min(maxX - minX, maxY - minY, maxZ - minZ);

  if (maxExt < 0.001) return false; // degenerate mesh
  return minExt / maxExt < FLAT_RATIO;
}

/*
 * Detects NWN-style "handbuilt DoubleSide" meshes.
 *
 * NWN modellers often duplicate every face with inverted winding/normals to fake
 * two-sidedness instead of relying on the renderer.  The tell-tale sign is that
 * roughly half the vertex normals point in the opposite direction of the other half
 * along at least one axis.
 *
 * Detection heuristic:
 *   - For each normal component (x, y, z) count how many normals are strictly
 *     positive and how many are strictly negative.
 *   - If the positive/negative split is close to 50 % on any axis the geometry is
 *     considered "mirrored" → use alphaTest instead of transparent blending.
 *
 * The 40/60 tolerance handles slight numerical asymmetry without false positives on
 * organic meshes where normals point in many directions.
 */
function hasMirroredNormals(node) {
  const norms = node.normals;
  if (!norms || norms.length < 4) return false;

  let posX = 0, negX = 0;
  let posY = 0, negY = 0;
  let posZ = 0, negZ = 0;
  const total = norms.length;

  for (const n of norms) {
    if (n[0] >  0.01) posX++; else if (n[0] < -0.01) negX++;
    if (n[1] >  0.01) posY++; else if (n[1] < -0.01) negY++;
    if (n[2] >  0.01) posZ++; else if (n[2] < -0.01) negZ++;
  }

  const isMirrored = (p, n) => {
    const used = p + n;
    if (used < total * 0.5) return false; // axis barely used → skip
    const ratio = Math.min(p, n) / used;
    return ratio >= 0.40; // 40–60 % split → mirrored
  };

  return isMirrored(posX, negX) || isMirrored(posY, negY) || isMirrored(posZ, negZ);
}

/*
 * Returns true when tex.userData.isBimodal was set by the texture parser
 * (parseTGA / parseNWNDDS / parseStandardDDS in textures.js).
 *
 * Bimodal = alpha is almost entirely 0 or 255, < 5 % soft pixels.
 * These textures are safe for alphaTest (hard cutout).
 * Gradient textures (cobwebs, smoke) need transparent=true blending instead.
 *
 * Falls back to true for textures loaded before this flag existed or via
 * THREE.TextureLoader (PNG/JPG), which rarely carry gradient alpha in NWN.
 */
function isTextureBimodal(tex) {
  if (!tex) return false;
  // isBimodal is computed at parse time in textures.js while the pixel buffer
  // is still available. If missing (old cache entry / PNG), default to true.
  return tex.userData?.isBimodal !== false;
}

const NODE_COLORS = {
  trimesh: 0x4a90c0, skin: 0xc070c0, dummy: 0x70b870,
  animmesh: 0x6ab84a,
  danglymesh: 0x50b8d0,
  emitter: 0xf0a030, aabb: 0xe8a020, light: 0xf8f050, reference: 0x80c0e0,
};

function nodeColor(type) { return NODE_COLORS[type] || 0x808080; }

function refreshBBox() {
  if (!modelGroup) return;

  // Remove old helper
  if (bboxHelper) { scene.remove(bboxHelper); bboxHelper = null; }

  const box = new THREE.Box3().setFromObject(modelGroup);
  if (box.isEmpty()) return;

  bboxHelper = new THREE.Box3Helper(box, new THREE.Color(0xc8a44a));
  bboxHelper.visible = document.getElementById('btn-bbox').classList.contains('active');
  scene.add(bboxHelper);
}

// Maps per-original-vertex constraint weights into the exploded face-vertex buffer format.
// Mirrors the same explode step used for positions/normals in buildScene().
function buildDanglyWeights(node) {
  const out = new Float32Array(node.faces.length * 3);
  for (let fi = 0; fi < node.faces.length; fi++) {
    for (let k = 0; k < 3; k++) {
      const vi = node.faces[fi].v[k];
      out[fi * 3 + k] = (vi < node.constraints.length) ? node.constraints[vi] : 0;
    }
  }
  return out;
}

function hasOpenBoundary(node) {
  const edgeCount = new Map();
  for (const face of node.faces) {
    const [a, b, c] = face.v;
    for (const [i, j] of [[a, b], [b, c], [c, a]]) {
      const key = i < j ? i + '_' + j : j + '_' + i;
      edgeCount.set(key, (edgeCount.get(key) || 0) + 1);
    }
  }
  for (const n of edgeCount.values()) if (n === 1) return true;
  return false;
}

function buildScene(model) {
  // modelGroup/wireGroup/bboxHelper have already been cleared by clearSession().
  // (clearSession is called before every MDL load)

  // ── Classification-based PBR limits ────────────────────────────────────
  // NWN Phong specular values are additive colour, not physical reflectivity.
  // Mapping them 1:1 to PBR metalness/roughness produces over-shiny surfaces,
  // especially on Tileset, Door, Placeable and Effect models which almost never
  // carry real metallic materials (those use dedicated MTR slots instead).
  // Characters may have armour parts with slightly higher metalness.
  //
  // These limits apply only to the Phong→PBR fallback path (no MTR, no roughnessMap).
  // When an MTR Roughness/Specularity parameter or a roughnessMap is present,
  // the authored values are used directly and these limits are NOT applied.
  const _cls = (model.classification || '').toLowerCase();
  const _isTileOrEnv = _cls === 'tile' || _cls === 'door' ||
                       _cls === 'placeable' || _cls === 'effect';
  // FIX: Max metalness for non-authored (Phong-derived) path.
  //   Tile/Door/Placeable/Effect → 0.12  (wood, stone, plaster: near-zero metalness)
  //   Character / other          → 0.30  (may have armour, still capped below 0.35)
  const _maxMetalness    = _isTileOrEnv ? 0.12 : 0.30;
  // FIX: Roughness floor for non-authored path.
  //   Tile/Door/Placeable/Effect → 0.60  (weathered surfaces should be matte)
  //   Character / other          → 0.40  (skin, leather can be smoother)
  const _roughnessFloor  = _isTileOrEnv ? 0.60 : 0.40;

  modelGroup = new THREE.Group();

  // NWN uses a Z-up coordinate system, Three.js expects Y-up.
  // Rotation by -90° on the X-axis: NWN-Z becomes Three.js-Y (up).
  const NWN_TO_THREEJS = -Math.PI / 2;
  modelGroup.rotation.x = NWN_TO_THREEJS;

  // Optional tile offset for group view (set by setBuildOffset)
  if (_buildOffset) {
    modelGroup.position.set(_buildOffset[0], 0, _buildOffset[1]);
    _buildOffset = null;
  }

  scene.add(modelGroup);

  const nodeMap = {};
  for (const n of model.nodes) nodeMap[n.name] = n;

  // Build Three.js objects
  const objects = {};
  let totalVerts = 0, totalFaces = 0;

  for (const node of model.nodes) {
    let obj;

    if ((node.type === 'trimesh' || node.type === 'skin' || node.type === 'danglymesh'
          || node.type === 'animmesh') && node.faces.length > 0 && node.verts.length > 0) {
      // Explode geometry: 3 verts per face (separate UV / normal per-face-vertex)
      const positions = new Float32Array(node.faces.length * 9);
      const uvs       = new Float32Array(node.faces.length * 6);
      const normals   = new Float32Array(node.faces.length * 9);
      let hasNormals  = node.normals.length > 0;

      for (let fi = 0; fi < node.faces.length; fi++) {
        const face = node.faces[fi];
        for (let k = 0; k < 3; k++) {
          const vi = face.v[k]; const ti = face.t[k];
          const v  = node.verts[vi] || [0, 0, 0];
          positions[fi * 9 + k * 3 + 0] = v[0];
          positions[fi * 9 + k * 3 + 1] = v[1];
          positions[fi * 9 + k * 3 + 2] = v[2];
          const uv = (node.tverts[ti]) || [0, 0];
          uvs[fi * 6 + k * 2 + 0] = uv[0];
          uvs[fi * 6 + k * 2 + 1] = 1 - uv[1]; // flip V
          if (hasNormals) {
            const nm = node.normals[vi] || [0, 1, 0];
            normals[fi * 9 + k * 3 + 0] = nm[0];
            normals[fi * 9 + k * 3 + 1] = nm[1];
            normals[fi * 9 + k * 3 + 2] = nm[2];
          }
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('uv',       new THREE.BufferAttribute(uvs, 2));
      
      // Priority: SG-Normals > MDL-Normals > computeVertexNormals (Fallback)
      // NWN MDL files almost always have hasNormals=true, so computeSGNormals
      // must not hang in the else branch, otherwise it will never be called.
      const hasSmoothGroups = node.faces.some(f => typeof f.sg === 'number');
      if (hasSmoothGroups) {
        geo.setAttribute('normal', new THREE.BufferAttribute(computeSGNormals(node), 3));
      } else if (hasNormals) {
        geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
      } else {
        geo.computeVertexNormals();
      }      

      // Save base UVs — needed when changing animations (resetToPose),
      // so animmesh nodes can return to their base state.
      geo.userData.baseUVs = uvs.slice();

      // animmesh: Store Face->Tvert mapping for UV animation.
      // animation.js uses this to calculate the correct UV coordinates per frame.
      if (node.type === 'animmesh') {
        const faceTverts = new Int16Array(node.faces.length * 3);
        for (let fi = 0; fi < node.faces.length; fi++) {
          const face = node.faces[fi];
          faceTverts[fi * 3 + 0] = face.t[0];
          faceTverts[fi * 3 + 1] = face.t[1];
          faceTverts[fi * 3 + 2] = face.t[2];
        }
        geo.userData.animFaceTverts = faceTverts;
        geo.userData.animVertCount  = node.tverts.length;
      }

      // ── Danglymesh: save rest positions and per-vertex constraint weights ──
      // dangly.js (tickDangly) reads these every frame to compute displaced positions.
      // Normals are NOT recomputed per frame for performance — minor lighting artefacts
      // are acceptable for small displacements in a viewer context.
      if (node.type === 'danglymesh' && node.constraints.length > 0) {
        geo.userData.isDangly          = true;
        geo.userData.danglyRest        = positions.slice();   // copy of rest positions
        geo.userData.danglyConstraints = buildDanglyWeights(node);
        geo.userData.danglyPeriod      = node.danglyPeriod;
        geo.userData.danglyTightness   = node.danglyTightness;
        geo.userData.danglyDisplacement = node.danglyDisplacement;
        geo.userData.danglyPhase       = Math.random() * Math.PI * 2; // stagger multiple nodes
        geo.attributes.position.usage  = THREE.DynamicDrawUsage;
      }

      // ── MTR-Lookup: materialname → MTR cache takes precedence over bitmap ───────
      // mtrCache is defined globally in mtr.js and is already populated
      // when buildScene() is called (Load order: Textures+MTR → buildScene).
      const mtrKey = node.materialname
        ? node.materialname.toLowerCase()
        : (node.bitmap ? node.bitmap.toLowerCase() : null);
      const mtr = (mtrKey && typeof mtrCache !== 'undefined') ? (mtrCache[mtrKey] || null) : null;

      // Effective renderhint: MTR overwrites MDL node value.
      // Important: NWN:EE often sets renderhint only in the MTR, not in the MDL itself.
      const effectiveRenderhint = (mtr && mtr.renderhint)
        ? mtr.renderhint
        : (node.renderhint || '');

      // Set tangents if renderhint requires normal mapping.
      // Path A: MDL already contains tangents → unroll directly (preferred, exact author data).
      // Path B: Fallback via computeTangents() if no tangents are present in the MDL.
      const needsTangents = effectiveRenderhint &&
        (effectiveRenderhint.toLowerCase() === 'normalandspecmapped' ||
         effectiveRenderhint.toLowerCase() === 'normaltangents');

      // Path A — Use parsed tangents from MDL
      // Sanity check: Count must match verts, otherwise fallback
      const hasParsedTangents = needsTangents &&
        node.tangents && node.tangents.length > 0 &&
        node.tangents.length === node.verts.length;

      if (hasParsedTangents) {
        // Unroll tangents into flat array (Face-Vertex order like positions/normals).
        // Three.js expects vec4: [tx, ty, tz, w] — w = Handedness (+1 / -1).
        // w = sign(dot(cross(N, T), B))
        const tangentArr = new Float32Array(node.faces.length * 3 * 4);
        for (let fi = 0; fi < node.faces.length; fi++) {
          const face = node.faces[fi];
          for (let fk = 0; fk < 3; fk++) {
            const vi = face.v[fk];
            const tg = node.tangents[vi];
            if (!tg) continue;
            const [tx, ty, tz, bx, by, bz, nx, ny, nz] = tg;
            // cross(N, T)
            const cx = ny * tz - nz * ty;
            const cy = nz * tx - nx * tz;
            const cz = nx * ty - ny * tx;
            const w = (cx * bx + cy * by + cz * bz) >= 0 ? 1 : -1;
            const base = (fi * 3 + fk) * 4;
            tangentArr[base + 0] = tx;
            tangentArr[base + 1] = ty;
            tangentArr[base + 2] = tz;
            tangentArr[base + 3] = w;
          }
        }
        geo.setAttribute('tangent', new THREE.BufferAttribute(tangentArr, 4));
        geo.userData.hasTangents = true;

      } else if (needsTangents) {
        // Path B — Fallback: Calculate tangents.
        // computeTangents() requires an index buffer → create sequential index.
        if (!geo.index) {
          const n = positions.length / 3;
          const idx = new Uint32Array(n);
          for (let i = 0; i < n; i++) idx[i] = i;
          geo.setIndex(new THREE.BufferAttribute(idx, 1));
        }
        geo.computeTangents();
        geo.userData.hasTangents = true;
      }

      const d = node.diffuse;

      // Diffuse texture: MTR texture0 > node.bitmap
      const diffuseKey = (mtr && mtr.textures[0])
        ? mtr.textures[0].toLowerCase()
        : (node.bitmap ? node.bitmap.toLowerCase() : '');
      const tex = diffuseKey ? (textureCache[diffuseKey] || null) : null;

      // Normal map: MTR texture1 (only if tangents were calculated — otherwise pointless)
      const normalTexKey = (mtr && mtr.textures[1] && needsTangents)
        ? mtr.textures[1].toLowerCase() : null;
      const normalTex = normalTexKey ? (textureCache[normalTexKey] || null) : null;

      // Specular map → Roughness map (inverted): MTR texture2
      // invertSpecToRoughnessMap() is defined in textures.js; cache key with suffix
      // so the inverted version is cached separately.
      const specTexKey = (mtr && mtr.textures[2]) ? mtr.textures[2].toLowerCase() : null;
      const specTex    = specTexKey ? (textureCache[specTexKey] || null) : null;
      const roughTex   = specTex ? invertSpecToRoughnessMap(specTex, specTexKey + '_inv') : null;

      // MTR parameters: Roughness and Specularity (names are case-sensitive according to parseMTR)
      const mtrRoughParam = mtr?.params?.['Roughness']?.values?.[0] ?? null;
      const mtrSpecParam  = mtr?.params?.['Specularity']?.values?.[0] ?? null;

      // transparencyhint 1 → Texture has an alpha channel (Decals, Splotches, Plants).
      // Only apply if the texture actually has an alpha channel (DXT5/32-bit TGA/PNG).
      // DXT1 textures have no alpha channel — transparencyhint would be a modeling error.
      const texHasAlpha  = tex ? (tex.userData.hasAlpha === true) : false;
      // FIX: Trust the texture's actual alpha channel unconditionally when it has one.
      // transparencyhint=0 can be wrong in two common NWN scenarios:
      //   1. MTR overrides the diffuse with a texture that has alpha (hint was for original).
      //   2. The texture has a real 32-bit alpha channel but the modeller forgot the hint
      //      (e.g. uvwgrid: bpp=32, 24% soft alpha pixels, transparencyhint=0).
      // In both cases suppressing alpha causes transparent pixels to render as black.
      // Safe: opaque NWN textures are authored as 24-bit (DXT1/24-bit TGA) -> texHasAlpha stays false.
      const isCharacterModel = (model.classification || '').toUpperCase() === 'CHARACTER';
      const useTexAlpha  = texHasAlpha && (!isCharacterModel || node.transparencyhint === 1);
      // FIX: transparencyhint=1 without a real alpha channel (24-bit TGA/DXT1):
      // NWN treats black as transparent -- punch through via alphaTest on RGB luminance.
      const useColorAlphaTest = !texHasAlpha && node.transparencyhint === 1 && tex !== null;
      const useMeshAlpha = node.alpha < 0.99;
      const useMtrTrans  = mtr ? mtr.transparency : false;

      // FIX: NWN "handbuilt DoubleSide" meshes (fences, cobwebs, foliage).
      // NWN modellers duplicate faces with inverted normals/winding to fake two-sidedness
      // instead of using a renderer flag.  The geometry contains both the front-facing
      // and back-facing quads in the same mesh, which is why these meshes have roughly
      // 50 % positive and 50 % negative normals on at least one axis.
      //
      // With transparent = true + depthWrite = false (our standard alpha-blend path),
      // Three.js sorts the whole mesh as one unit by camera distance.  The back-face
      // quads may then render on top of the front-face quads, showing the clear colour
      // (dark-blue) through the transparent pixels → the "blue background" artefact.
      //
      // Fix: use alphaTest instead of alpha-blend for these meshes.
      //   • alphaTest punches through alpha < threshold (hard cutout, no blending).
      //   • depthWrite = true prevents the z-fighting between the two quad sets.
      //   • DoubleSide is technically redundant (both faces are already in geometry)
      //     but kept as a safety net so culling never hides a face.
      //   • transparent = false keeps the mesh in the opaque render queue → correct
      //     depth sorting relative to other opaque geometry.
      const useAlphaTest = useTexAlpha && hasMirroredNormals(node) && isTextureBimodal(tex);

      // Roughness + Metalness:
      // If roughnessMap is present → scalar = multiplier (1.0 = map has full effect).
      // If no roughnessMap → convert from MDL Phong values.
      // MTR Roughness/Specularity parameters overwrite the fallback if explicitly set.
      //
      // FIX: The original Phong→PBR conversion over-estimated both metalness and
      // specularity for typical NWN geometry:
      //   • specMax * 1.5, capped at 0.6 → produced metalness 0.4–0.6 for normal meshes.
      //     In PBR, non-metallic surfaces (wood, stone, plaster) must stay below 0.04.
      //     We now use * 0.5 and cap at _maxMetalness (class-dependent: 0.12 or 0.30).
      //   • shininess / 64.0 → roughness curve was too steep; shininess=32 gave 0.50
      //     (visually glassy). Dividing by 128 and raising the floor via _roughnessFloor
      //     maps typical NWN values (16–64) to roughness 0.65–0.88 instead of 0.25–0.75.
      //   • MTR Specularity scalar was multiplied by 0.4 before; now 0.2 to match the
      //     reduced non-authored path.
      const roughness = roughTex
        ? (mtrRoughParam !== null ? mtrRoughParam : 1.0)
        : (mtrRoughParam !== null
            ? mtrRoughParam
            : Math.max(_roughnessFloor, 1.0 - Math.min(node.shininess / 128.0, 0.40)));
      const specMax   = Math.max(node.specular[0], node.specular[1], node.specular[2]);
      const metalness = mtrSpecParam !== null
        ? Math.min(mtrSpecParam * 0.2, _maxMetalness)
        : Math.min(specMax * 0.5, _maxMetalness);
        
      // NWN uses back-face culling; DoubleSide only for alpha-blended materials
      // (magic effects, glass) that may legitimately show both faces.
      // Also force DoubleSide for handbuilt-DoubleSide meshes (useAlphaTest path) so
      // culling never accidentally removes a face that the duplicate geometry relies on.
      const needsDoubleSide = useMeshAlpha || useMtrTrans || useTexAlpha || useColorAlphaTest
        || (mtr ? mtr.twosided : false) || isFlatMesh(node) || hasOpenBoundary(node);

      const mat = new THREE.MeshStandardMaterial({
        color:        tex ? new THREE.Color(1, 1, 1) : new THREE.Color(d[0] || 0.8, d[1] || 0.8, d[2] || 0.8),
        map:          tex       || null,
        normalMap:    normalTex || null,
        roughnessMap: roughTex  || null,
        roughness,
        metalness,
        side:        needsDoubleSide ? THREE.DoubleSide : THREE.FrontSide,
        // FIX: useAlphaTest path → hard cutout, stays in opaque queue, correct depth.
        //      normal alpha-blend path → transparent blend, depthWrite off.
        //      useColorAlphaTest path → transparencyhint=1 without real alpha channel:
        //        black pixels are "transparent" — punch through via alphaTest on RGB luminance.
        //        Keep transparent=false to stay in opaque render queue (correct depth sorting).
        transparent: (useAlphaTest || useColorAlphaTest) ? false : (useMeshAlpha || useTexAlpha || useMtrTrans),
        opacity:     node.alpha,
        alphaTest:   useAlphaTest ? 0.5 : (useColorAlphaTest ? 0.1 : (useTexAlpha ? 0.1 : 0)),
        depthWrite:  (useAlphaTest || useColorAlphaTest) ? true : !useTexAlpha,
      });

      // Apply TXI properties (decal, blending, clamp, register cycle animation)
      const txiData = txiCache ? (txiCache[diffuseKey] || null) : null;
      if (txiData) {
        applyTXIToMaterial(mat, txiData, tex);
      }

      // Fallback color if no bitmap and diffuse is black
      if (!tex && d[0] === 0 && d[1] === 0 && d[2] === 0) mat.color.set(0x888888);
      // If texture is referenced (via bitmap or MTR texture0) but not yet loaded: Hint color
      if ((node.bitmap || (mtr && mtr.textures[0])) && !tex) mat.color.set(nodeColor(node.type));

      // selfillumcolor → Emissive (EFFECT models with self-illumination, e.g., vdr_globemin, vim_cntglobe)
      // IMPORTANT: Set emissiveMap = tex, so the *texture* itself glows and not
      // the entire material turns white (mat.emissive without Map = solid color over everything).
      if (node.selfIllumColor) {
        const [sr, sg, sb] = node.selfIllumColor;
        if ((sr > 0 || sg > 0 || sb > 0) && tex) {
          mat.emissiveMap       = tex;
          mat.emissive.setRGB(sr, sg, sb);
          mat.emissiveIntensity = 1.0;
        }
      }

      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      
      // Store original values -- used by updateMeshOpacity to reset.
      // FIX: mirror the material constructor exactly so the reset path always restores
      // the correct state. All three useAlphaTest/useColorAlphaTest branches must appear here.
      mesh.userData.baseOpacity     = node.alpha;
      mesh.userData.baseTransparent = (useAlphaTest || useColorAlphaTest) ? false : (useMeshAlpha || useTexAlpha || useMtrTrans);
      mesh.userData.baseDepthWrite  = (useAlphaTest || useColorAlphaTest) ? true  : !useTexAlpha;
      mesh.userData.baseAlphaTest   = useAlphaTest ? 0.5 : (useColorAlphaTest ? 0.1 : (useTexAlpha ? 0.1 : 0));
      obj = mesh;

      // Wireframe overlay: attach as child of the main mesh,
      // so it automatically inherits the entire transformation hierarchy.
      const wireMat = new THREE.MeshBasicMaterial({
        color: 0xffffff, wireframe: true, transparent: true, opacity: wireOpacity,
      });
      const wireMesh = new THREE.Mesh(geo, wireMat);
      wireMesh.visible = wireOpacity > 0;
      wireMesh.userData.isWireframe = true;
      obj.add(wireMesh);   // ← Child of obj, not of wireGroup

      // Back-face indicator: flat dark colour visible when looking inside a mesh.
      // Only needed when the main material uses FrontSide (i.e. not needsDoubleSide).
      // Skip for hasMirroredNormals meshes: they will get DoubleSide from applyTexturesToScene
      // once the texture arrives, and the indicator would bleed through the alpha regions
      // (the "dark blue background" artefact) until then.
      if (!needsDoubleSide && !hasMirroredNormals(node)) {
        const backMat = new THREE.MeshBasicMaterial({
          color:      0x111133,   // ← adjust color here
          side:       THREE.BackSide,
          depthWrite: true,
        });
        const backMesh = new THREE.Mesh(geo, backMat);
        backMesh.userData.isBackface = true;
        obj.add(backMesh);
      }

      totalVerts += node.verts.length;
      totalFaces += node.faces.length;
    } else if (node.type === 'aabb' && node.faces.length > 0 && node.verts.length > 0) {
      // ── Walkmesh (AABB) ───────────────────────────────────────────────
      // Simple triangle geometry from verts + faces (no UVs/normals needed).
      // Display: semi-transparent fill + wireframe overlay in amber.
      const positions = new Float32Array(node.faces.length * 9);
      for (let fi = 0; fi < node.faces.length; fi++) {
        const face = node.faces[fi];
        for (let k = 0; k < 3; k++) {
          const v = node.verts[face.v[k]] || [0, 0, 0];
          positions[fi * 9 + k * 3 + 0] = v[0];
          positions[fi * 9 + k * 3 + 1] = v[1];
          positions[fi * 9 + k * 3 + 2] = v[2];
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.computeVertexNormals();

      // Semi-transparent fill
      const fillMat = new THREE.MeshBasicMaterial({
        color: 0xe8a020,
        transparent: true,
        opacity: 0.12,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const fillMesh = new THREE.Mesh(geo, fillMat);

      // Wireframe overlay
      const wireMat = new THREE.MeshBasicMaterial({
        color: 0xe8a020,
        wireframe: true,
        transparent: true,
        opacity: 0.7,
      });
      const wireMesh = new THREE.Mesh(geo, wireMat);
      wireMesh.userData.isWireframe = true;

      // Group of fill + wireframe
      obj = new THREE.Group();
      obj.add(fillMesh);
      obj.add(wireMesh);
      obj.userData.isAABB = true;

    } else if (node.type === 'emitter') {
      // ── Emitter Marker ────────────────────────────────────────────────
      // Coordinate system note:
      //   modelGroup has rotation.x = -π/2  →  R_x(-π/2) transforms vectors:
      //     local (x,y,z) → world (x, z, -y)
      //   Consequently:
      //     local -Z → world +Y  (upwards, particle direction) ← Arrows
      //     local -Y → world +Z  (towards camera)              ← Preview Quad
      const group = new THREE.Group();

      // Color from colorStart, fallback orange if too dark
      const cs = node.colorStart || [1, 0.6, 0.1];
      const lum = cs[0] * 0.299 + cs[1] * 0.587 + cs[2] * 0.114;
      const emitColor = lum < 0.05
        ? new THREE.Color(0xf0a030)
        : new THREE.Color(cs[0], cs[1], cs[2]);

      // An emitter is considered active if either static birthrate > 0 OR
      // birthratekey is present in an animation.
      const hasAnimBirthrate = (model.animations || []).some(
        anim => (anim.nodes[node.name]?.emitterKeys?.birthrate?.length ?? 0) > 0
      );
      const markerActive = (node.birthrate > 0 || hasAnimBirthrate) && node.emitterTexture;

      // Resolve texture now — needed to decide decoration visibility below.
      const emTexName = node.emitterTexture || null;
      const emTex     = emTexName ? textureCache[emTexName] : null;

      // Decoration visibility strategy:
      //   markerActive + texture already in cache → particles start immediately
      //     → hide decoration and quad (particles take over)
      //   markerActive + texture not yet loaded   → show decoration at full opacity +
      //     colored placeholder quad; both hidden once texture arrives (session.js)
      //   !markerActive (no birthrate / no texture) → show at full opacity
      const decorVisible = !markerActive;

      // Center: Sphere — r reduced from 0.06 → 0.04
      const sGeo = new THREE.SphereGeometry(0.04, 8, 6);
      const sMat = new THREE.MeshBasicMaterial({ color: emitColor });
      const sphereMesh = new THREE.Mesh(sGeo, sMat);
      sphereMesh.userData.isEmitterDecoration = true;
      sphereMesh.visible = decorVisible;
      group.add(sphereMesh);

      // Ring in XZ plane — r reduced 0.15 → 0.10, tube 0.012 → 0.008
      const rGeo = new THREE.TorusGeometry(0.10, 0.008, 6, 20);
      const rMat = new THREE.MeshBasicMaterial({ color: emitColor, transparent: true, opacity: 0.75 });
      const ring = new THREE.Mesh(rGeo, rMat);
      ring.rotation.x = Math.PI / 2;
      ring.userData.isEmitterDecoration = true;
      ring.visible = decorVisible;
      group.add(ring);

      // Direction arrows — scaled ~30% smaller (reach 0.22 → 0.16)
      const arrowPts = new Float32Array([
        // Center ray
         0,    0,  0,       0,    0,  -0.16,
        // Arrowhead legs
        -0.04, 0, -0.10,    0,    0,  -0.16,
         0.04, 0, -0.10,    0,    0,  -0.16,
        // Side rays (indicate spread)
        -0.08, 0,  0,      -0.06, 0,  -0.11,
         0.08, 0,  0,       0.06, 0,  -0.11,
      ]);
      const aGeo = new THREE.BufferGeometry();
      aGeo.setAttribute('position', new THREE.Float32BufferAttribute(arrowPts, 3));
      const aMat = new THREE.LineBasicMaterial({ color: emitColor, transparent: true, opacity: 0.85 });
      const arrowLines = new THREE.LineSegments(aGeo, aMat);
      arrowLines.userData.isEmitterDecoration = true;
      arrowLines.visible = decorVisible;
      group.add(arrowLines);

      // ── Texture Preview Quad ───────────────────────────────────────────
      // PlaneGeometry has normal = local +Z.
      // rotation.x = +π/2 rotates the normal to local -Y.
      // After modelGroup rotation: local -Y → world +Z (towards camera) → visible.
      // Size from sizeStart, minimum size 0.15
      const qSize = Math.max(node.sizeStart || 0.5, 0.15);
      const qGeo  = new THREE.PlaneGeometry(qSize, qSize);
      const qMat  = new THREE.MeshBasicMaterial({
        transparent: true,
        depthWrite:  false,
        side:        THREE.DoubleSide,
        alphaTest:   0.05,
        color:       emTex ? 0xffffff : emitColor,
        map:         emTex || null,
        opacity:     emTex ? 1.0 : 0.0,
      });
      if ((node.blend || '').toLowerCase() === 'additive') {
        qMat.blending  = THREE.AdditiveBlending;
        qMat.alphaTest = 0;
      }
      const quad = new THREE.Mesh(qGeo, qMat);
      quad.rotation.x = Math.PI / 2;   // Normal → local -Y → world +Z (towards camera)
      quad.userData.isEmitterPreview  = true;
      quad.userData.emitterTexName    = emTexName;
      quad.userData.emitterBlend      = (node.blend || '').toLowerCase();
      // Active emitter + texture already loaded → hide quad (particles take over).
      // Active emitter + texture missing        → hide quad (emitter.js shows placeholder).
      // Inactive emitter                        → show quad (texture preview or empty).
      quad.visible = !markerActive;
      group.add(quad);

      // userData on the group object for applyTexturesToScene
      group.userData.hasEmitterPreview    = true;
      group.userData.emitterTexName       = emTexName;

      obj = group;

    } else if (node.type === 'light') {
      // ── Light Node ────────────────────────────────────────────────────────
      const group = new THREE.Group();

      // Marker: small sphere in light color (brightened to be visible)
      const lc = node.lightColor;
      const markerColor = new THREE.Color(
        Math.max(lc[0], 0.45),
        Math.max(lc[1], 0.45),
        Math.max(lc[2], 0.45)
      );
      const sGeo = new THREE.SphereGeometry(0.05, 8, 6);
      const sMat = new THREE.MeshBasicMaterial({ color: markerColor });
      group.add(new THREE.Mesh(sGeo, sMat));

      // Line cross: shows light position in space
      const linePts = new Float32Array([
        -0.13,0,0,  0.13,0,0,
         0,-0.13,0,  0,0.13,0,
         0,0,-0.13,  0,0,0.13,
      ]);
      const lGeo = new THREE.BufferGeometry();
      lGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePts, 3));
      const lMat = new THREE.LineBasicMaterial({ color: markerColor, transparent: true, opacity: 0.55 });
      group.add(new THREE.LineSegments(lGeo, lMat));

      // Create Three.js light
      const lightColor = new THREE.Color(lc[0], lc[1], lc[2]);
      let mdlLight;
      if (node.lightAmbientOnly) {
        // ambientonly → AmbientLight with reduced intensity (would flood scene otherwise)
        mdlLight = new THREE.AmbientLight(lightColor, node.lightMultiplier * 0.25);
      } else {
        // PointLight: decay=1 (linear falloff, closer to NWN behavior than physically correct)
        mdlLight = new THREE.PointLight(lightColor, node.lightMultiplier, node.lightRadius, 1);
        mdlLight.castShadow = false;   // Shadows from model lights too expensive for viewer
      }
      group.add(mdlLight);

      // Reference for animation.js (colorkey / radiuskey / multiplierkey)
      group.userData.mdlLight      = mdlLight;
      group.userData.isLightNode   = true;

      obj = group;

    } else {
      // Dummy / reference / unknown types → small sphere
      const geo = new THREE.SphereGeometry(0.04, 6, 6);
      const mat = new THREE.MeshBasicMaterial({ color: nodeColor(node.type) });
      obj = new THREE.Mesh(geo, mat);
    }

    // Apply local transform.
    // Priority: animation time=0 keyframe (rest pose) > geometry orientation.
    // NWN format: orientation = (axis_x, axis_y, axis_z, angle_radians) — Axis-Angle, NOT a Quaternion!
    //
    // skin nodes: The Three.js mesh position remains at (0,0,0), because the MDL vertices
    // are stored in the local space of the skin node and are only transformed into
    // model space via CPU skinning.
    // The node.position of the skin node is the pivot offset, which must be added to
    // every vertex during skinning (vertex_model = vertex_local + skin_node_pos).
    const isSkinNode = node.type === 'skin';
    if (!isSkinNode) {
      const restPose = model.restPose && model.restPose[node.name];
      const oriSrc   = (restPose && restPose.orientation) ? restPose.orientation : node.orientation;
      const [ax, ay, az, angle] = oriSrc;
      obj.quaternion.copy(axisAngleToQuat(ax, ay, az, angle));
      obj.position.set(...node.position);
      obj.scale.setScalar(node.scale);
    }

    obj.name = node.name;
    obj.userData.nodeData = node;
    obj.isBone = true; // NEW: Strictly required for the SkeletonHelper to recognize the hierarchy

    // FIX (AABB / duplicate-name collision):
    // Store a direct back-reference on the parsed node data so that buildNodeList()
    // can attach it to each .node-item element as _nwnObj.  This allows visibility
    // toggles and type-filter buttons to resolve the *specific* Three.js object for
    // this node without relying on nodeObjects[node.name], which only keeps the last
    // writer when multiple tiles share the same node name (e.g. "walkmesh" in AABB).
    node._threeObj = obj;

    objects[node.name] = obj;
    nodeObjects[node.name] = obj;
  }

  // Build hierarchy
  for (const node of model.nodes) {
    const obj = objects[node.name];
    if (!obj) continue;
    const parentName = node.parent;
    if (parentName && parentName !== 'NULL' && objects[parentName]) {
      objects[parentName].add(obj);
    } else {
      modelGroup.add(obj);
    }
  }

  // Fit camera to model
  const box = new THREE.Box3().setFromObject(modelGroup);
  if (!box.isEmpty()) {
    const center = box.getCenter(new THREE.Vector3());
    const size   = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    orbit.target.copy(center);
    orbit.radius = Math.max(maxDim * 2.2, 2.0);
    orbit.theta  = 0.5; orbit.phi = 1.1;
    updateCamera();

    // Store initial camera for reset
    orbit.initTarget = center.clone();
    orbit.initRadius = orbit.radius;
    orbit.initTheta  = orbit.theta;
    orbit.initPhi    = orbit.phi;

    // BBox helper
    refreshBBox();
    
    // NEW: Initialize SkeletonHelper
    skeletonHelper = new THREE.SkeletonHelper(modelGroup);
    // If you want to adjust the color, you can do it here (default is a blue/green gradient)
    // skeletonHelper.material.color.set(0xffcc00); 
  
    // Bind to the button state in the HTML by default, if it exists
    const btnSkeleton = document.getElementById('btn-skeleton');
    skeletonHelper.visible = btnSkeleton ? btnSkeleton.classList.contains('active') : false;
    scene.add(skeletonHelper);
  } else {
    // Empty box: Emitter-only model with no measurable dimensions (e.g., only emitter marker)
    orbit.target.set(0, 0, 0);
    orbit.radius = 3;
    orbit.theta  = 0.5; orbit.phi = 1.1;
    orbit.initTarget = new THREE.Vector3(0, 0, 0);
    orbit.initRadius = 3;
    orbit.initTheta  = 0.5;
    orbit.initPhi    = 1.1;
    updateCamera();
  }

  // Update stats
  document.getElementById('stat-verts').textContent = totalVerts.toLocaleString('de');
  document.getElementById('stat-faces').textContent = totalFaces.toLocaleString('de');
  document.getElementById('stat-nodes').textContent = model.nodes.length;
  document.getElementById('empty-state').style.display = 'none';
  setStatus(fmt('status_model_loaded', { name: model.name, cls: model.classification }));

  currentModel = model;
  buildNodeList(model);
  showModelInfo(model, totalVerts, totalFaces);

  // ── Prepare CPU Skinning ─────────────────────────────────────────────
  // Coordinate convention: All skinning calculations run in NWN Z-Up space,
  // meaning BEFORE the -90° X-rotation of the modelGroup. This avoids coordinate
  // system conflicts, since skin vertices and bone matrices are both in NWN space.
  //
  // The modelGroup rotation (-90° around X) converts NWN Z-up to Three.js Y-up
  // and is automatically applied by Three.js to all child meshes (incl. skin meshes).
  // The CPU-skinned vertices are written into the geometry buffer in NWN space;
  // Three.js renders them correctly because the skin mesh is a child of modelGroup.

  // ── Step 1: Set all bones to MDL geometry pose ─────────────────────
  // The bind matrices MUST be calculated based on the pure geometry pose,
  // NOT based on the animation rest pose (model.restPose).
  // Background: For models with custom animations (e.g., c_drggreen),
  // model.restPose was already populated from the t=0 key of the first animation
  // and applied during object creation. This leads to incorrect bind matrices because
  // the bones are then in an animated pose, not in the neutral geometry pose.
  // Models without custom animations (e.g., c_drgred) were not affected, as
  // model.restPose remained empty and the geometry pose was used directly.
  for (const node of model.nodes) {
    if (node.type === 'skin') continue;   // Skin nodes have no pose of their own
    const obj = objects[node.name];
    if (!obj) continue;
    const [ax, ay, az, angle] = node.orientation;
    obj.quaternion.copy(axisAngleToQuat(ax, ay, az, angle));
    obj.position.set(...node.position);
    obj.scale.setScalar(node.scale);
  }

  modelGroup.updateMatrixWorld(true);

  // NWN space matrix of a bone: mg_inv * bone.matrixWorld
  // mg_inv: inverts the modelGroup world matrix (contains -90° X-rotation + position)
  const _mgInv = new THREE.Matrix4().copy(modelGroup.matrixWorld).invert();

  // Inverse bind matrices in NWN space for all bones
  const bindInverseMatrices = {};
  for (const [name, obj] of Object.entries(objects)) {
    const boneNWN = new THREE.Matrix4().multiplyMatrices(_mgInv, obj.matrixWorld);
    bindInverseMatrices[name] = boneNWN.invert();
  }

  // Per skin node: Bind positions in NWN model space and weights per exploded vertex
  for (const node of model.nodes) {
    if (node.type !== 'skin' || !node.vertexWeights) continue;
    const obj = objects[node.name];
    if (!obj || !(obj instanceof THREE.Mesh)) continue;
    const geo = obj.geometry;

    // Vertex model space = vertex_local + skin_node_position
    // skin_node_position is the MDL pivot offset (NWN space).
    const [spx, spy, spz] = node.position;   // skin node pivot in NWN model space
    const [oax, oay, oaz, oangle] = node.orientation;
    
    // Apply skin node rotation to bind positions
    const skinQuat = axisAngleToQuat(oax, oay, oaz, oangle);
    const hasRot = Math.abs(1.0 - Math.abs(skinQuat.w)) > 1e-4;
    const rotMat = hasRot
      ? new THREE.Matrix4().makeRotationFromQuaternion(skinQuat)
      : null;
    
    const rawPos = geo.attributes.position.array;
    const bindPos = new Float32Array(rawPos.length);
    const _vtmp = new THREE.Vector3();
    
    for (let k = 0; k < rawPos.length; k += 3) {
      _vtmp.set(rawPos[k], rawPos[k + 1], rawPos[k + 2]);
      if (rotMat) _vtmp.applyMatrix4(rotMat);
      bindPos[k]     = _vtmp.x + spx;
      bindPos[k + 1] = _vtmp.y + spy;
      bindPos[k + 2] = _vtmp.z + spz;
    }
    geo.userData.bindPositions = bindPos;

    // Weights per exploded vertex: The explode step generates 3 verts per face.
    // Exploded vertex fi*3+k comes from the original vertex node.faces[fi].v[k].
    const perVertWeights = [];
    for (let fi = 0; fi < node.faces.length; fi++) {
      for (let k = 0; k < 3; k++) {
        const vi = node.faces[fi].v[k];
        perVertWeights.push(node.vertexWeights[vi] || []);
      }
    }
    geo.userData.perVertWeights = perVertWeights;
    geo.userData.hasSkin = true;
    geo.attributes.position.usage = THREE.DynamicDrawUsage;
  }

  // Provide skinning data globally for animation.js
  window._nwnBindInvMatrices = bindInverseMatrices;
  window._nwnModelGroup      = modelGroup;

  // ── Step 2: Apply rest pose from animations ───────────────────────────
  // Only set the animation rest pose AFTER the bind matrix calculation,
  // so the scene appears in the expected starting position.
  applyRestPose(model);
  modelGroup.updateMatrixWorld(true);

  saveGeometryPose();
  buildAnimUI(model);
  
  // ── Step 3: Bring skin meshes into initial rest pose ──────────────────────
  // applySkinning() must be called once even without animations,
  // so the skin vertices are transformed from the local skin node space (only vertex_local)
  // into model space (vertex_local + skin_node_pivot).
  // For models with animations, this only happens through selectAnim() →
  // applyAnimFrame() → applySkinning() – calling it directly here
  // ensures that pure geometry models (e.g., cloaks without animations)
  // are also positioned correctly.
  // Since the bones are now in the geometry pose (= bind pose), the result is
  // skinMat = currentBone × inverseBind = identity, meaning each vertex lands
  // exactly at its bind position (vertex_local + skin_node_pivot).
  applySkinning();

  // ── Step 4: Start particle emitters ────────────────────────────────────
  // initAllEmitters() creates a particle pool for each active emitter node.
  // Textures from textureCache are used directly — if they are not loaded yet,
  // refreshEmitterTextures() in applyTexturesToScene() will ensure they start.
  if (typeof initAllEmitters === 'function') initAllEmitters(model);

  // NEW: tverts1/2/3 are parsed but not yet rendered (no second UV channel
  // wired into scene_build.js materials) — surface a log hint so this isn't
  // silently lost when a model actually carries a second UV stage.
  const extraUvNodes = model.nodes.filter(n =>
    (n.tverts1 && n.tverts1.length > 0) ||
    (n.tverts2 && n.tverts2.length > 0) ||
    (n.tverts3 && n.tverts3.length > 0)
  );
  if (extraUvNodes.length > 0) {
    logWarnI18n('extra_uv_stage_warn', { n: extraUvNodes.length });
  }
}

// ─────────────────────────────────────────────
