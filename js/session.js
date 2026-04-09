/* ═══════════════════════════════════════════════
   NWN MDL Viewer — Session Management
   (clearSession, applyTexturesToScene)
   ═══════════════════════════════════════════════ */

//  Session-Reset: GPU-Speicher, Texturen, Szene
//  Muss vor jedem neuen Ladevorgang aufgerufen werden.
// ─────────────────────────────────────────────
function clearSession(keepTextures = false) {
  //let skeletonHelper = null; // deaktiviert, führt zu Promlemen bei der Anzeige von Skeletten
  
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
          for (const key of ['map','normalMap','specularMap','emissiveMap','alphaMap','aoMap']) {
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

  // 2. Textur-Cache vom GPU entladen und leeren
  for (const key of Object.keys(textureCache)) {
    textureCache[key].dispose();
    delete textureCache[key];
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
}


function applyTexturesToScene() {
  if (!currentModel) return;
  let applied = 0;
  for (const node of currentModel.nodes) {
    if (!node.bitmap) continue;
    const key = node.bitmap.toLowerCase();
    const tex = textureCache[key];
    if (!tex) continue;
    const obj = nodeObjects[node.name];
    if (!obj || !obj.material) continue;
    const mat = obj.material;
    mat.map = tex;
    mat.color.set(0xffffff);
    // transparencyhint nachträglich korrekt setzen —
    // aber nur wenn die Textur wirklich einen Alpha-Kanal hat.
    if (node.transparencyhint === 1 && tex.userData.hasAlpha === true) {
      mat.transparent  = true;
      mat.alphaTest    = 0.1;
      mat.depthWrite   = false;
    }
    mat.needsUpdate = true;
    applied++;
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
