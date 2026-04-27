/* ═══════════════════════════════════════════════
   NWN MDL Viewer — Session Management
   (clearSession, applyTexturesToScene)
   ═══════════════════════════════════════════════ */

//  Session-Reset: GPU-Speicher, Texturen, Szene
//  Muss vor jedem neuen Ladevorgang aufgerufen werden.
// ─────────────────────────────────────────────
function clearSession(keepTextures = false) {
  // 1. Alle Geometrien und Materialien der alten Szene vom GPU freigeben
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

// NEU: SkeletonHelper aufräumen
  if (typeof skeletonHelper !== 'undefined' && skeletonHelper) {
    scene.remove(skeletonHelper);
    
    // SkeletonHelper hat kein .dispose(), aber seine Geometrie und Material schon.
    // Wir nutzen deine existierende Funktion, um sicherzugehen:
    disposeObject(skeletonHelper); 
    
    skeletonHelper = null;
  }

  // WOK bereinigen
  if (typeof wokGroup !== 'undefined' && wokGroup) {
    scene.remove(wokGroup);
    wokGroup.traverse(c => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    });
    wokGroup = null;
    wokVisible = false;
  }
 
  // PWK bereinigen
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
 
  // WOK-Button zurücksetzen
  const btnWok = document.getElementById('btn-walkmesh');
  if (btnWok) { btnWok.classList.remove('active'); btnWok.disabled = true; }

  // Farb-Dropdown zurücksetzen
  if (typeof resetColorDropdown === 'function') resetColorDropdown();

  // 2. Textur-Cache vom GPU entladen und leeren
  for (const key of Object.keys(textureCache)) {
    textureCache[key].dispose();
    delete textureCache[key];
  }
  
  // gecachtes MTR ebenfalls leeren
  for (const key of Object.keys(mtrCache)) {
    delete mtrCache[key];
  }
  
  for (const key of Object.keys(invertedTexCache)) {
    invertedTexCache[key].dispose();
    delete invertedTexCache[key];
  }

  // 3. Interne Zustände zurücksetzen
  nodeObjects        = {};
  selectedNodeName   = null;
  currentModel       = null;
  pendingSupermodel  = null;
  animState.current  = null;
  animState.playing  = false;
  animState.time     = 0;
  geometryPose       = {};
  document.getElementById('anim-panel').style.display = 'none';
  const animBody  = document.getElementById('anim-body');
  const animArrow = document.querySelector('#anim-header .tex-arrow');
  animBody.classList.remove('collapsed');
  if (animArrow) animArrow.classList.add('open');

  // 4. UI zurücksetzen
  document.getElementById('node-list').innerHTML =
    '<div style="padding:20px;color:var(--muted);font-size:11px;text-align:center;">' + L('no_file_loaded') + '</div>';
  const nodeToolbar = document.getElementById('node-toolbar');
  if (nodeToolbar) nodeToolbar.style.display = 'none';
  document.getElementById('model-info').style.display    = 'none';
  document.getElementById('texture-status').style.display= 'none';
  const texList  = document.getElementById('texture-list');
  const texArrow = document.querySelector('.tex-arrow');
  texList.innerHTML = '';
  texList.classList.remove('collapsed');
  if (texArrow) texArrow.classList.add('open');
  document.getElementById('node-detail').style.display   = 'none';
  document.getElementById('empty-state').style.display   = 'flex';
  document.getElementById('stat-verts').textContent = '—';
  document.getElementById('stat-faces').textContent = '—';
  document.getElementById('stat-nodes').textContent = '—';

  // Slider + Textboxen zurücksetzen
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

    // MTR-Lookup: materialname hat Vorrang vor bitmap-basiertem Lookup
    const mtrKey = node.materialname
      ? node.materialname.toLowerCase()
      : (node.bitmap ? node.bitmap.toLowerCase() : null);
    const mtr = mtrKey ? (mtrCache[mtrKey] || null) : null;

    if (mtr) {
      // ── MTR-Pfad ──────────────────────────────────────────────────
      // texture0 → Diffuse
      const diffuseKey = mtr.textures.hasOwnProperty(0) && mtr.textures[0] !== null
        ? mtr.textures[0]
        : (node.bitmap ? node.bitmap.toLowerCase() : null);

      if (diffuseKey && textureCache[diffuseKey]) {
        const diffuseTex = textureCache[diffuseKey];
        mat.map = diffuseTex;
        mat.color.set(0xffffff);
        applied++;
        if (diffuseTex.userData.hasAlpha === true) {
          mat.transparent = true;
          mat.alphaTest   = 0.1;
          mat.depthWrite  = true;
        }
      }

      // texture1 → Normal-Map
      if (mtr.textures[1] && textureCache[mtr.textures[1]]) {
        mat.normalMap = textureCache[mtr.textures[1]];
        mat.normalScale.set(1, 1);

        // NEU — Tangenten nachberechnen wenn noch nicht vorhanden
        if (obj.geometry && !obj.geometry.userData.hasTangents) {
          obj.geometry.computeTangents();
          obj.geometry.userData.hasTangents = true;
        }
      }

      // texture2 → Specular-Map (invertiert als roughnessMap)
      if (mtr.textures[2] && textureCache[mtr.textures[2]]) {
        mat.roughnessMap = invertSpecToRoughnessMap(
          textureCache[mtr.textures[2]], mtr.textures[2] + '_inv');
        mat.roughness = 1.0;
        mat.metalness = 0.0;
      }

      // texture3 → Roughness-Map (direkt, Vorrang über texture2)
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

      // MTR parameter-Werte: Roughness und Specularity
      const roughnessParam   = mtr.params['Roughness']   || mtr.params['roughness'];
      const specularityParam = mtr.params['Specularity'] || mtr.params['specularity'];
      if (roughnessParam && !mat.roughnessMap) {
        mat.roughness = Math.max(0, Math.min(1, roughnessParam.values[0]));
      }
      if (specularityParam && !mat.metalnessMap) {
        mat.metalness = Math.max(0, Math.min(0.8, specularityParam.values[0] * 0.4));
      }

      // transparency und twosided
      if (mtr.transparency) {
        mat.transparent = true;
        mat.depthWrite  = false;
      }
      if (mtr.twosided) {
        mat.side = THREE.DoubleSide;
      }

      mat.needsUpdate = true;

    } else {
      // ── Nicht-MTR-Pfad ─────────────────────────────────────────────
      // texture0 aus MDL-Node hat Vorrang über bitmap
      const diffuseKey = (node.textures && node.textures[0] != null)
        ? node.textures[0]
        : (node.bitmap ? node.bitmap.toLowerCase() : null);

      if (!diffuseKey) continue;
      const tex = textureCache[diffuseKey];
      if (!tex) continue;
      mat.map = tex;
      mat.color.set(0xffffff);
      applied++;

      if (tex.userData.hasAlpha === true || node.transparencyhint === 1) {
        mat.transparent = true;
        mat.alphaTest   = 0.1;
        mat.depthWrite  = true;
      }

      // texture1 → Normal-Map
      if (node.textures && node.textures[1] && textureCache[node.textures[1]]) {
        mat.normalMap = textureCache[node.textures[1]];
        mat.normalScale.set(1, 1);

        // NEU — Tangenten nachberechnen wenn noch nicht vorhanden
        if (obj.geometry && !obj.geometry.userData.hasTangents) {
          obj.geometry.computeTangents();
          obj.geometry.userData.hasTangents = true;
        }
      }

      // texture2 → Specular-Map (invertiert)
      if (node.textures && node.textures[2] && textureCache[node.textures[2]]) {
        mat.roughnessMap = invertSpecToRoughnessMap(
          textureCache[node.textures[2]], node.textures[2] + '_inv');
        mat.roughness = 1.0;
        mat.metalness = 0.0;
      }

      // texture3 → Roughness-Map (direkt)
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

      mat.needsUpdate = true;
    }
  }
  // ── Emitter-Preview-Quads aktualisieren ───────────────────────────────────
  // Wird gebraucht wenn Texturen nachträglich geladen werden (nach dem Modell).
  // In normalem Workflow (Texturen vor MDL) sind Quads bereits in buildScene texturiert.
  for (const node of currentModel.nodes) {
    if (node.type !== 'emitter') continue;
    const obj = nodeObjects[node.name];
    if (!obj || !obj.userData.hasEmitterPreview) continue;
    const texName = node.emitterTexture;
    if (!texName || !textureCache[texName]) continue;
    const tex = textureCache[texName];
    // Preview-Quad-Mesh innerhalb der Emitter-Gruppe finden
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

  return applied;
}

// ─────────────────────────────────────────────
//  Textur-Sidebar aktualisieren
// ─────────────────────────────────────────────
function updateTextureUI() {
  const keys = Object.keys(textureCache);
  const panel = document.getElementById('texture-status');
  const list  = document.getElementById('texture-list');
  if (keys.length === 0) { panel.style.display = 'none'; return; }
  panel.style.display = 'block';
  list.innerHTML = keys.map(k =>
    `<span style="color:var(--gold2)">✓</span> <span style="color:var(--text)">${k}</span>`
  ).join('<br>');
}

// ─────────────────────────────────────────────