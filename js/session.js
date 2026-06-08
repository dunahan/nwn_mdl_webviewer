/* ═══════════════════════════════════════════════
   NWN MDL Viewer — Session Management
   (clearSession, applyTexturesToScene)
   ═══════════════════════════════════════════════ */

//  Session Reset: GPU memory, textures, scene
//  Must be called before every new loading process.
// ─────────────────────────────────────────────
function clearSession(keepTextures = false) {
  // 1. Release all geometries and materials of the old scene from the GPU
  function disposeObject(obj) {
    if (!obj) return;
    obj.traverse(child => {
      if (child.geometry) {
        child.geometry.dispose();
      }
      if (child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const mat of mats) {
          for (const key of ['map','normalMap','roughnessMap','bumpMap','emissiveMap','alphaMap','aoMap']) {
            if (mat[key]) mat[key] = null;
          }
          mat.dispose();
        }
      }
    });
  }

  if (modelGroup) { disposeObject(modelGroup); scene.remove(modelGroup); modelGroup = null; }
  if (bboxHelper) { scene.remove(bboxHelper);  bboxHelper = null; }

  // NEW: Clean up SkeletonHelper
  if (typeof skeletonHelper !== 'undefined' && skeletonHelper) {
    scene.remove(skeletonHelper);
    
    // SkeletonHelper does not have a .dispose(), but its geometry and material do.
    // We use your existing function to be safe:
    disposeObject(skeletonHelper); 
    
    skeletonHelper = null;
  }

  // Clean up WOK
  if (typeof wokGroup !== 'undefined' && wokGroup) {
    scene.remove(wokGroup);
    wokGroup.traverse(c => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    });
    wokGroup = null;
    wokVisible = false;
  }
 
  // // Clean up PWK
  if (typeof pwkGroup !== 'undefined' && pwkGroup) {
    scene.remove(pwkGroup);
    pwkGroup.traverse(c => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    });
    pwkGroup = null;
    pwkVisible = false;
    const btnPwk = document.getElementById('btn-pwk');
    if (btnPwk) { btnPwk.classList.remove('active'); btnPwk.disabled = true; }
  }

  // Clean up PWK
  if (typeof dwkGroup !== 'undefined' && dwkGroup) {
    scene.remove(dwkGroup);
    dwkGroup.traverse(c => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    });
    dwkGroup = null;
    dwkVisible = false;
    const btnDwk = document.getElementById('btn-dwk');
    if (btnDwk) { btnDwk.classList.remove('active'); btnDwk.disabled = true; }
  }
 
  // Reset WOK button
  const btnWok = document.getElementById('btn-walkmesh');
  if (btnWok) { btnWok.classList.remove('active'); btnWok.disabled = true; }

  // Reset color dropdown
  if (typeof resetColorDropdown === 'function') resetColorDropdown();

  // 2. Unload and clear texture cache from GPU
  for (const key of Object.keys(textureCache)) {
    textureCache[key].dispose();
    delete textureCache[key];
  }
  
  // Also clear cached MTR
  for (const key of Object.keys(mtrCache)) {
    delete mtrCache[key];
  }
  
  for (const key of Object.keys(invertedTexCache)) {
    invertedTexCache[key].dispose();
    delete invertedTexCache[key];
  }

  // Reset PLT color state:
  // Completely clear per-part rows (layers 2–9)
  for (const key of Object.keys(pltPartLayerRows)) {
    delete pltPartLayerRows[key];
  }

  // Reset global rows (layer 0 skin + 1 hair) to default
  pltLayerRows.fill(0);

  // Clean up particle emitters (before nodeObjects reset, as emitters use nodeObjects)
  if (typeof clearAllEmitters === 'function') clearAllEmitters();

  // Reset TXI sprite animation
  if (typeof clearUVAnimRegistry === 'function') clearUVAnimRegistry();

  // 3. Reset internal states
  nodeObjects        = {};
  selectedNodeName   = null;
  currentModel       = null;
  pendingSupermodel  = null;
  animState.current  = null;
  animState.playing  = false;
  animState.time     = 0;
  if (typeof txiWallTime !== 'undefined') txiWallTime = 0;
  geometryPose       = {};
  document.getElementById('anim-panel').style.display = 'none';
  const animBody  = document.getElementById('anim-body');
  const animArrow = document.querySelector('#anim-header .tex-arrow');
  animBody.classList.remove('collapsed');
  if (animArrow) animArrow.classList.add('open');

  // 4. Reset UI
  document.getElementById('node-list').innerHTML =
    '<div style="padding:20px;color:var(--muted);font-size:11px;text-align:center;">' + L('no_file_loaded') + '</div>';
  const nodeToolbar = document.getElementById('node-toolbar');
  if (nodeToolbar) nodeToolbar.style.display = 'none';
  document.getElementById('model-info').style.display    = 'none';
  document.getElementById('texture-status').style.display= 'none';
  const texList  = document.getElementById('texture-list');
  const texArrow = document.querySelector('#texture-header .tex-arrow');  // fix: was '.tex-arrow' → always targets the first element in the DOM
  texList.innerHTML = '';
  texList.classList.remove('collapsed');
  if (texArrow) texArrow.classList.add('open');

  // Scene Graph Body: reset collapse
  const sgBody  = document.getElementById('scene-graph-body');
  const sgArrow = document.querySelector('#section-title .tex-arrow');
  if (sgBody)  sgBody.classList.remove('collapsed');
  if (sgArrow) sgArrow.classList.add('open');
  document.getElementById('node-detail').style.display   = 'none';
  document.getElementById('empty-state').style.display   = 'flex';
  document.getElementById('stat-verts').textContent = '—';
  document.getElementById('stat-faces').textContent = '—';
  document.getElementById('stat-nodes').textContent = '—';

  // Reset sliders + textboxes
  wireOpacity = 0;
  meshOpacity = 1.0;
  document.getElementById('wire-opacity').value = 0;
  document.getElementById('wire-val').value      = 0;
  document.getElementById('mesh-opacity').value  = 100;
  document.getElementById('mesh-val').value      = 100;
}

function applyTexturesToScene() {
  if (!currentModel) return;
  let applied = 0;

  for (const node of currentModel.nodes) {
    const obj = nodeObjects[node.name];
    if (!obj || !obj.material) continue;
    const mat = obj.material;

    // MTR lookup: materialname takes precedence over bitmap-based lookup
    const mtrKey = node.materialname
      ? node.materialname.toLowerCase()
      : (node.bitmap ? node.bitmap.toLowerCase() : null);
    const mtr = mtrKey ? (mtrCache[mtrKey] || null) : null;

    if (mtr) {
      // ── MTR Path ──────────────────────────────────────────────────
      // texture0 → Diffuse
      const diffuseKey = mtr.textures.hasOwnProperty(0) && mtr.textures[0] !== null
        ? mtr.textures[0]
        : (node.bitmap ? node.bitmap.toLowerCase() : null);

      if (diffuseKey && textureCache[diffuseKey]) {
        const diffuseTex = textureCache[diffuseKey];
        mat.map = diffuseTex;
        mat.color.set(0xffffff);
        applied++;
        // FIX: trust actual alpha channel, same as scene_build.js / non-MTR path.
        if (diffuseTex.userData.hasAlpha === true) {
          if (hasMirroredNormals(node) && isTextureBimodal(diffuseTex)) {
            mat.transparent = false;
            mat.alphaTest   = 0.5;
            mat.depthWrite  = true;
          } else {
            mat.transparent = true;
            mat.alphaTest   = 0.1;
            mat.depthWrite  = true;
          }
          // Same DoubleSide fix as in the non-MTR path.
          mat.side = THREE.DoubleSide;
        }
      }

      // texture1 → Normal-Map
      if (mtr.textures[1] && textureCache[mtr.textures[1]]) {
        mat.normalMap = textureCache[mtr.textures[1]];
        mat.normalScale.set(1, 1);

        // NEW — Recalculate tangents if not already present
        if (obj.geometry && !obj.geometry.userData.hasTangents) {
          obj.geometry.computeTangents();
          obj.geometry.userData.hasTangents = true;
        }
      }

      // texture2 → Specular-Map (inverted as roughnessMap)
      if (mtr.textures[2] && textureCache[mtr.textures[2]]) {
        mat.roughnessMap = invertSpecToRoughnessMap(
          textureCache[mtr.textures[2]], mtr.textures[2] + '_inv');
        mat.roughness = 1.0;
        mat.metalness = 0.0;
      }

      // texture3 → Roughness-Map (direct, takes precedence over texture2)
      if (mtr.textures[3] && textureCache[mtr.textures[3]]) {
        mat.roughnessMap = textureCache[mtr.textures[3]];
        mat.roughness    = 1.0;
      }

      // texture4 → Height-Map
      if (mtr.textures[4] && textureCache[mtr.textures[4]]) {
        mat.bumpMap   = textureCache[mtr.textures[4]];
        mat.bumpScale = 0.05;
      }

      // texture5 → Illumination / Emissive
      if (mtr.textures[5] && textureCache[mtr.textures[5]]) {
        mat.emissiveMap       = textureCache[mtr.textures[5]];
        mat.emissive.set(0xffffff);
        mat.emissiveIntensity = 1.0;
      }

      // MTR parameter values: Roughness and Specularity
      const roughnessParam   = mtr.params['Roughness']   || mtr.params['roughness'];
      const specularityParam = mtr.params['Specularity'] || mtr.params['specularity'];
      if (roughnessParam && !mat.roughnessMap) {
        mat.roughness = Math.max(0, Math.min(1, roughnessParam.values[0]));
      }
      if (specularityParam && !mat.metalnessMap) {
        mat.metalness = Math.max(0, Math.min(0.8, specularityParam.values[0] * 0.4));
      }

      // transparency and twosided
      if (mtr.transparency) {
        mat.transparent = true;
        mat.depthWrite  = false;
      }
      if (mtr.twosided) {
        mat.side = THREE.DoubleSide;
      }

      mat.needsUpdate = true;
      // FIX: Sync base* values for MTR path too — same as Non-MTR path below.
      // Without this, updateMeshOpacity() would reset to stale scene_build.js values
      // instead of the final state after MTR transparency / alpha overrides.
      if (obj.userData) {
         obj.userData.baseTransparent = mat.transparent;
         obj.userData.baseDepthWrite  = mat.depthWrite;
         obj.userData.baseAlphaTest   = mat.alphaTest;
      }

    } else {
      // ── Non-MTR Path ─────────────────────────────────────────────
      // texture0 from MDL node takes precedence over bitmap
      const diffuseKey = (node.textures && node.textures[0] != null)
        ? node.textures[0]
        : (node.bitmap ? node.bitmap.toLowerCase() : null);

      if (!diffuseKey) continue;
      const tex = textureCache[diffuseKey];
      if (!tex) continue;
      mat.map = tex;
      mat.color.set(0xffffff);
      applied++;

      if (tex.userData.hasAlpha === true) {
        // FIX: Apply alpha mode whenever the texture actually has an alpha channel,
        // regardless of transparencyhint. Mirrors scene_build.js: useTexAlpha = texHasAlpha.
        // transparencyhint=0 is sometimes wrong (modeller oversight / MTR texture swap).
        if (hasMirroredNormals(node) && isTextureBimodal(tex)) {
          // Handbuilt-DoubleSide + bimodal alpha: hard cutout, stays in opaque queue.
          mat.transparent = false;
          mat.alphaTest   = 0.5;
          mat.depthWrite  = true;
        } else {
          // Gradient alpha (cobwebs, smoke) or single-sided semi-transparent planes.
          mat.transparent = true;
          mat.alphaTest   = 0.1;
          mat.depthWrite  = true;
        }
        // Any alpha-texture mesh needs DoubleSide so back-facing geometry isn't culled.
        mat.side = THREE.DoubleSide;

        // Remove the BackSide indicator child mesh that buildScene added when it assumed
        // FrontSide-only rendering. Now that we're DoubleSide, the dark indicator mesh
        // is both wrong (dark blue bleed-through) and unnecessary.
        for (let ci = obj.children.length - 1; ci >= 0; ci--) {
          if (obj.children[ci].userData?.isBackface) {
            obj.children[ci].geometry?.dispose();
            obj.children[ci].material?.dispose();
            obj.remove(obj.children[ci]);
          }
        }
      } else if (!tex.userData.hasAlpha && node.transparencyhint === 1) {
        // FIX: transparencyhint=1 without a real alpha channel (24-bit TGA/DXT1).
        // The texture uses black as its "transparent" color — punch through via alphaTest.
        // This is the same path as useColorAlphaTest in scene_build.js, applied retroactively
        // when the texture is loaded after the model.
        mat.alphaTest  = 0.1;
        mat.depthWrite = true;
        mat.side       = THREE.DoubleSide;
        // Remove the BackSide indicator child mesh (same reasoning as above).
        for (let ci = obj.children.length - 1; ci >= 0; ci--) {
          if (obj.children[ci].userData?.isBackface) {
            obj.children[ci].geometry?.dispose();
            obj.children[ci].material?.dispose();
            obj.remove(obj.children[ci]);
          }
        }
      }

      // texture1 → Normal-Map
      if (node.textures && node.textures[1] && textureCache[node.textures[1]]) {
        mat.normalMap = textureCache[node.textures[1]];
        mat.normalScale.set(1, 1);

        // NEW — Recalculate tangents if not already present
        if (obj.geometry && !obj.geometry.userData.hasTangents) {
          obj.geometry.computeTangents();
          obj.geometry.userData.hasTangents = true;
        }
      }

      // texture2 → Specular-Map (inverted)
      if (node.textures && node.textures[2] && textureCache[node.textures[2]]) {
        mat.roughnessMap = invertSpecToRoughnessMap(
          textureCache[node.textures[2]], node.textures[2] + '_inv');
        mat.roughness = 1.0;
        mat.metalness = 0.0;
      }

      // texture3 → Roughness-Map (direct)
      if (node.textures && node.textures[3] && textureCache[node.textures[3]]) {
        mat.roughnessMap = textureCache[node.textures[3]];
        mat.roughness    = 1.0;
      }

      // texture4 → Height-Map
      if (node.textures && node.textures[4] && textureCache[node.textures[4]]) {
        mat.bumpMap   = textureCache[node.textures[4]];
        mat.bumpScale = 0.05;
      }

      // texture5 → Illumination / Emissive
      if (node.textures && node.textures[5] && textureCache[node.textures[5]]) {
        mat.emissiveMap       = textureCache[node.textures[5]];
        mat.emissive.set(0xffffff);
        mat.emissiveIntensity = 1.0;
      }

      // selfillumcolor → apply emissiveMap retroactively (EFFECT models)
      // Only if scene_build hasn't set it yet (texture arrived after the MDL).
      if (node.selfIllumColor && !mat.emissiveMap) {
        const [sr, sg, sb] = node.selfIllumColor;
        if ((sr > 0 || sg > 0 || sb > 0)) {
          mat.emissiveMap       = tex;
          mat.emissive.setRGB(sr, sg, sb);
          mat.emissiveIntensity = 1.0;
        }
      }

      // TXI blending — 'lighten' and 'additive' are mapped to AdditiveBlending.
      // proceduretype cycle: set initial repeat/offset (tickTxiCycle updates afterwards).
      if (typeof txiCache !== 'undefined') {
        const txi = txiCache[diffuseKey] || null;
        if (txi) {
          const blend = (txi.blending || '').toLowerCase();
          if (blend === 'additive' || blend === 'lighten') {
            mat.blending    = THREE.AdditiveBlending;
            mat.transparent = true;
            mat.depthWrite  = false;
            mat.alphaTest   = 0;
          }
          if ((txi.proceduretype || '').toLowerCase() === 'cycle') {
            const numx = txi.numx || 1;
            const numy = txi.numy || 1;
            const fps  = txi.fps  || 0;
            if (mat.map && (numx > 1 || numy > 1)) {
              mat.map.repeat.set(1 / numx, 1 / numy);
              mat.map.offset.set(0, (numy - 1) / numy);
              mat.map.wrapS = THREE.RepeatWrapping;
              mat.map.wrapT = THREE.RepeatWrapping;
              mat.map.needsUpdate = true;
              // Register per-frame ticker (updateUVAnims in txi.js)
              if (fps > 0 && typeof uvAnimRegistry !== 'undefined') {
                uvAnimRegistry.push({ tex: mat.map, numx, numy, fps, elapsed: 0 });
              }
            }
          }
        }
      }

      mat.needsUpdate = true;
      // Sync base* values so updateMeshOpacity() resets to the correct state.
      // Must always run (not just inside the alpha block) to capture any transparency
      // mode set by TXI blending, selfIllumColor, or the new useColorAlphaTest path.
      if (obj.userData) {
         obj.userData.baseTransparent = mat.transparent;
         obj.userData.baseDepthWrite  = mat.depthWrite;
         // FIX: sync alphaTest too
         obj.userData.baseAlphaTest   = mat.alphaTest;
      }
    }
  }

  // ── Update Emitter Preview Quads ───────────────────────────────────
  // Needed if textures are loaded retroactively (after the model).
  // In a normal workflow (textures before MDL), quads are already textured in buildScene.
  for (const node of currentModel.nodes) {
    if (node.type !== 'emitter') continue;
    const obj = nodeObjects[node.name];
    if (!obj || !obj.userData.hasEmitterPreview) continue;
    const texName = node.emitterTexture;
    if (!texName || !textureCache[texName]) continue;
    const tex = textureCache[texName];
    // Find preview quad mesh inside the emitter group
    obj.traverse(child => {
      if (child.userData.isEmitterPreview && child.material) {
        child.material.map     = tex;
        child.material.color.set(0xffffff);
        child.material.opacity = 1.0;
        if (child.userData.emitterBlend === 'additive') {
          child.material.blending  = THREE.AdditiveBlending;
          child.material.alphaTest = 0;
        }
        child.material.needsUpdate = true;
      }
    });
  }

  // ── Particle Emitters: Update textures (retroactive loading) ─────────
  if (typeof refreshEmitterTextures === 'function') refreshEmitterTextures();

  return applied;
}

// ─────────────────────────────────────────────
//  Update Texture UI Sidebar
// ─────────────────────────────────────────────
function updateTextureUI() {
  const keys = Object.keys(textureCache).sort((a, b) => a.localeCompare(b));
  const panel = document.getElementById('texture-status');
  const list  = document.getElementById('texture-list');
  if (keys.length === 0) { panel.style.display = 'none'; return; }
  panel.style.display = 'block';
  list.innerHTML = keys.map(k =>
    `<span class="tex-entry" data-texkey="${k}"><span style="color:var(--gold2)">✓</span> <span style="color:var(--text)">${k}</span></span>`
  ).join('');
}

// ─────────────────────────────────────────────
