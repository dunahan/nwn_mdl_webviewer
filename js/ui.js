/* ═══════════════════════════════════════════════
   NWN MDL Viewer — UI: Node List & Controls
   ═══════════════════════════════════════════════ */

//  Sidebar node list
// ─────────────────────────────────────────────
function buildNodeList(model) {
  const list = document.getElementById('node-list');
  list.innerHTML = '';
  for (const node of model.nodes) {
    const item = document.createElement('div');
    item.className = 'node-item';
    item.dataset.name = node.name;

    const typeClass = ['trimesh','skin','dummy','emitter','aabb','danglymesh'].includes(node.type) ? node.type : 'other';
    const dot = document.createElement('div');
    dot.className = `node-dot dot-${typeClass}`;
    item.appendChild(dot);

    const name = document.createElement('span');
    name.className = 'node-name';
    name.textContent = node.name;
    item.appendChild(name);

    const badge = document.createElement('span');
    badge.className = `node-type-badge type-${typeClass}`;
    badge.textContent = node.type;
    item.appendChild(badge);

    if (node.type === 'trimesh' || node.type === 'skin' || node.type === 'danglymesh') {
      const vis = document.createElement('span');
      vis.className = 'vis-toggle';
      vis.textContent = '⬡';
      vis.title = L('vis_toggle_title');
      vis.onclick = (e) => { e.stopPropagation(); toggleNodeVisibility(node.name, item, vis); };
      item.appendChild(vis);
    } else if (nodeObjects[node.name]) {
      // Alle anderen sichtbaren Nodes (dummy, emitter, light …) ebenfalls umschaltbar
      const vis = document.createElement('span');
      vis.className = 'vis-toggle';
      vis.textContent = '●';
      vis.title = L('vis_toggle_title');
      vis.onclick = (e) => { e.stopPropagation(); toggleNodeVisibility(node.name, item, vis, '●'); };
      item.appendChild(vis);
    }

    item.onclick = () => selectNode(node.name);
    list.appendChild(item);
  }
}

function toggleNodeVisibility(name, item, btn, visibleIcon) {
  const obj = nodeObjects[name];
  if (!obj) return;
  obj.visible = !obj.visible;
  item.classList.toggle('hidden', !obj.visible);
  const onIcon  = visibleIcon || '⬡';
  const offIcon = '○';
  btn.textContent = obj.visible ? onIcon : offIcon;
}

function selectNode(name) {
  selectedNodeName = name;
  document.querySelectorAll('.node-item').forEach(el => el.classList.remove('selected'));
  const el = document.querySelector(`.node-item[data-name="${CSS.escape(name)}"]`);
  if (el) { el.classList.add('selected'); el.scrollIntoView({ block: 'nearest' }); }

  const obj = nodeObjects[name];
  if (!obj || !obj.userData.nodeData) { document.getElementById('node-detail').style.display = 'none'; return; }
  const n = obj.userData.nodeData;

  const detail = document.getElementById('node-detail');
  detail.style.display = 'block';

  let extraRows = '';
  if (n.type === 'danglymesh') {
    extraRows = '<div class="nd-row"><span>' + L('nd_dangle_info_label') + '</span><span class="nd-val">' + L('nd_dangle_info') + '</span></div>';
  }

  detail.innerHTML =
    '<div class="nd-title">' + n.name + '</div>' +
    '<div class="nd-row"><span>' + L('nd_type')     + '</span><span class="nd-val">' + n.type + '</span></div>' +
    '<div class="nd-row"><span>' + L('nd_parent')   + '</span><span class="nd-val">' + n.parent + '</span></div>' +
    '<div class="nd-row"><span>' + L('nd_vertices') + '</span><span class="nd-val">' + n.verts.length + '</span></div>' +
    '<div class="nd-row"><span>' + L('nd_faces')    + '</span><span class="nd-val">' + n.faces.length + '</span></div>' +
    '<div class="nd-row"><span>' + L('nd_bitmap')   + '</span><span class="nd-val">' + (n.bitmap || '—') + '</span></div>' +
    '<div class="nd-row"><span>' + L('nd_position') + '</span><span class="nd-val">' + n.position.map(v=>v.toFixed(3)).join(', ') + '</span></div>' +
    '<div class="nd-row"><span>' + L('nd_diffuse')  + '</span><span class="nd-val">' + n.diffuse.map(v=>v.toFixed(2)).join(', ') + '</span></div>' +
    '<div class="nd-row"><span>' + L('nd_alpha')    + '</span><span class="nd-val">' + n.alpha.toFixed(2) + '</span></div>' +
    extraRows;
}

function showModelInfo(model, verts, faces) {
  const el = document.getElementById('model-info');
  el.style.display = 'block';
  const meshCount = model.nodes.filter(n => n.type === 'trimesh' || n.type === 'skin' || n.type === 'danglymesh').length;
  el.innerHTML =
    '<div class="info-name">' + model.name + '</div>' +
    '<div class="info-row"><span>' + L('info_supermodel') + '</span><span class="info-val">' + (model.supermodel || '—') + '</span></div>' +
    '<div class="info-row"><span>' + L('info_class')      + '</span><span class="info-val">' + model.classification + '</span></div>' +
    '<div class="info-row"><span>' + L('info_nodes')      + '</span><span class="info-val">' + model.nodes.length + ' (' + meshCount + ' ' + L('info_meshes_suffix') + ')</span></div>' +
    '<div class="info-row"><span>' + L('info_vertices')   + '</span><span class="info-val">' + verts.toLocaleString() + '</span></div>' +
    '<div class="info-row"><span>' + L('info_faces')      + '</span><span class="info-val">' + faces.toLocaleString() + '</span></div>' +
    '<div class="info-row"><span>' + L('info_anims')      + '</span><span class="info-val">' + model.animCount + '</span></div>';
}

// ─────────────────────────────────────────────
//  UI Controls
// ─────────────────────────────────────────────
function updateWireframe(val) {
  wireOpacity = val / 100;
  document.getElementById('wire-val').textContent = val + '%';
  if (modelGroup) {
    modelGroup.traverse(child => {
      if (child.isMesh && child.userData.isWireframe) {
        child.material.opacity = wireOpacity;
        child.visible = wireOpacity > 0;
      }
    });
  }
}

function updateLight(val) {
  document.getElementById('light-val').textContent = val + '%';
  dirLight.intensity   = (val / 100) * 1.0;
  dirLight2.intensity  = (val / 100) * 0.4;
  ambientLight.intensity = (val / 100) * 0.35;
}

function toggleNormals() {
  const btn = document.getElementById('btn-normals');
  btn.classList.toggle('active');
  const on = btn.classList.contains('active');
  if (modelGroup) {
    modelGroup.traverse(child => {
      if (child.isMesh && !child.userData.isWireframe && child.material.isMeshPhongMaterial) {
        child.material.flatShading = !on;
        child.material.needsUpdate = true;
      }
    });
  }
}

function toggleGrid() {
  const btn = document.getElementById('btn-grid');
  btn.classList.toggle('active');
  gridHelper.visible = btn.classList.contains('active');
}

function toggleBBox() {
  const btn = document.getElementById('btn-bbox');
  btn.classList.toggle('active');
  if (bboxHelper) bboxHelper.visible = btn.classList.contains('active');
}

function toggleAxes() {
  const btn = document.getElementById('btn-axes');
  btn.classList.toggle('active');
  axesHelper.visible = btn.classList.contains('active');
}

function toggleAutoRotate() {
  const btn = document.getElementById('btn-rotate');
  btn.classList.toggle('active');
  autoRotate = btn.classList.contains('active');
}

function resetCamera() {
  if (!orbit.initTarget) return;
  orbit.target.copy(orbit.initTarget);
  orbit.radius = orbit.initRadius;
  orbit.theta  = orbit.initTheta;
  orbit.phi    = orbit.initPhi;
  updateCamera();
}

function toggleSkeleton() {
  const btn = document.getElementById('btn-skeleton');
  if (btn) btn.classList.toggle('active');
  if (skeletonHelper) {
    skeletonHelper.visible = btn ? btn.classList.contains('active') : !skeletonHelper.visible;
  }
}

function setStatus(msg) { document.getElementById('status-msg').textContent = msg; }

// ─────────────────────────────────────────────
//  PLT Layer Panel
// ─────────────────────────────────────────────

// Repräsentative Farben pro Layer (Platzhalter bis zum echten Paletten-Mapping)
// const PLT_LAYER_NAMES  = ['Skin','Hair','Metal 1','Metal 2','Cloth 1','Cloth 2','Leather 1','Leather 2','Tattoo 1','Tattoo 2'];
// const PLT_LAYER_COLORS = ['#e8a880','#7a5030','#b8c0cc','#c8a44a','#5878b8','#b85878','#8a6040','#504030','#4888b8','#b87048'];

function buildPLTPanel() {
  const panel  = document.getElementById('plt-panel');
  const listEl = document.getElementById('plt-layer-list');
  if (!panel || !listEl) return;

  const pltEntries = Object.entries(textureCache)
    .filter(([, tex]) => tex && tex.userData && tex.userData.isPLT);

  if (pltEntries.length === 0) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'block';
  listEl.innerHTML = '';

  for (const [texName, tex] of pltEntries) {
    if (pltEntries.length > 1) {
      const label = document.createElement('div');
      label.style.cssText = 'font-size:10px;color:var(--muted);margin:6px 0 3px;' +
        'letter-spacing:1px;text-transform:uppercase;border-top:1px solid var(--border);padding-top:6px;';
      label.textContent = texName;
      listEl.appendChild(label);
    }

    const usedLayers = tex.userData.usedLayers || new Array(10).fill(false);

    for (let i = 0; i < 10; i++) {
      const used = usedLayers[i];
      // Layer-Header-Zeile
      const item = document.createElement('div');
      item.className = 'plt-layer-item' + (used ? ' used' : '');

      const dot = document.createElement('div');
      dot.className = 'plt-layer-dot';
      dot.style.background = getPaletteSwatchHex(i, pltLayerRows[i]);
      item.appendChild(dot);

      const nameSpan = document.createElement('span');
      nameSpan.className = 'plt-layer-name';
      nameSpan.textContent = L('plt_layer_' + i);
      item.appendChild(nameSpan);

      const tag = document.createElement('span');
      tag.className = 'plt-layer-tag';
      tag.textContent = used ? '●' : '○';
      item.appendChild(tag);

      // Aufklapp-Pfeil für Color-Picker nur wenn Palette vorhanden und Layer benutzt
      if (used && hasPalette(i)) {
        const arrow = document.createElement('span');
        arrow.className = 'plt-pick-arrow';
        arrow.textContent = '▶';
        arrow.style.cssText = 'font-size:8px;color:var(--muted);margin-left:2px;transition:transform 0.2s;flex-shrink:0;';
        item.appendChild(arrow);
        item.style.cursor = 'pointer';

        const picker = _buildLayerPicker(i, dot);
        picker.style.display = 'none'; // collapsed by default

        item.addEventListener('click', () => {
          const open = picker.style.display !== 'none';
          picker.style.display = open ? 'none' : 'flex';
          arrow.style.transform = open ? '' : 'rotate(90deg)';
        });

        listEl.appendChild(item);
        listEl.appendChild(picker);
      } else {
        listEl.appendChild(item);
      }
    }
  }

  // Beim ersten Aufbau direkt mit Paletten rendern
  reapplyAllPLTPalettes();
}

// hier Scrollbalken eingefügt
function _buildLayerPicker(layerIdx, dotEl) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:2px;padding:4px 0 6px 18px;max-height:120px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:var(--scrollbar) transparent;';
  wrap.dataset.layerPicker = layerIdx;

  const rows = hasPalette(layerIdx) ? 176 : 0;
  for (let row = 0; row < rows; row++) {
    const hex = getPaletteSwatchHex(layerIdx, row);
    const sw = document.createElement('div');
    sw.style.cssText = `width:12px;height:12px;border-radius:2px;background:${hex};cursor:pointer;flex-shrink:0;`;
    sw.title = L('plt_row_label') + row;
    if (row === pltLayerRows[layerIdx]) {
      sw.style.outline = '1.5px solid var(--gold)';
      sw.style.outlineOffset = '1px';
    }
    sw.addEventListener('click', () => {
      pltLayerRows[layerIdx] = row;
      reapplyAllPLTPalettes();
      // Auswahl-Highlight aktualisieren
      wrap.querySelectorAll('div').forEach((s, idx) => {
        s.style.outline = (idx === row) ? '1.5px solid var(--gold)' : '';
        s.style.outlineOffset = (idx === row) ? '1px' : '';
      });
      // Dot-Farbe aktualisieren
      dotEl.style.background = hex;
    });
    wrap.appendChild(sw);
  }
  return wrap;
}

function togglePLTPanel() {
  const body  = document.getElementById('plt-body');
  const arrow = document.querySelector('#plt-header .tex-arrow');
  if (!body) return;
  body.classList.toggle('collapsed');
  if (arrow) arrow.classList.toggle('open');
}

// ─────────────────────────────────────────────
