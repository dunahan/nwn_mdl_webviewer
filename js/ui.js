/* ═══════════════════════════════════════════════
   NWN MDL Viewer — UI: Node List & Controls
   ═══════════════════════════════════════════════ */

//  Sidebar node list
// ─────────────────────────────────────────────
function buildNodeList(model) {
  const list = document.getElementById('node-list');
  list.innerHTML = '';

  // Toolbar einblenden und Typ-Buttons anpassen
  const toolbar = document.getElementById('node-toolbar');
  if (toolbar) {
    toolbar.style.display = 'flex';
    // Typ-Buttons ausgrauen wenn kein Node dieses Typs vorhanden
    const presentTypes = new Set(model.nodes.map(n => n.type));
    toolbar.querySelectorAll('.ntb-type').forEach(btn => {
      const t = btn.dataset.type;
      btn.disabled = !presentTypes.has(t);
      btn.style.opacity = presentTypes.has(t) ? '1' : '0.25';
      btn.classList.remove('ntb-active');
    });
    // Typ-Button-Zustand initialisieren (alle sichtbar → alle aktiv)
    nodeVisUpdateTypeButtons();
  }
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
  nodeVisUpdateTypeButtons();   // Typ-Button-Zustand nachführen
}

// ─────────────────────────────────────────────
//  Node-Toolbar-Aktionen
// ─────────────────────────────────────────────

// Alle Nodes ein- oder ausblenden
function nodeVisAll(show) {
  document.querySelectorAll('.node-item').forEach(item => {
    const name = item.dataset.name;
    const obj  = nodeObjects[name];
    if (!obj) return;
    obj.visible = show;
    item.classList.toggle('hidden', !show);
    const btn = item.querySelector('.vis-toggle');
    if (btn) {
      const isHex = btn.textContent === '⬡' || btn.textContent === '○';
      btn.textContent = show ? (isHex ? '⬡' : '●') : '○';
    }
  });
  nodeVisUpdateTypeButtons();
}

// Alle Nodes eines Typs gemeinsam umschalten:
// Sind alle sichtbar → alle ausblenden; sonst → alle einblenden
function nodeVisToggleType(type) {
  const items = [...document.querySelectorAll(`.node-item`)].filter(el => {
    const name = el.dataset.name;
    const obj  = nodeObjects[name];
    // Typ über userData.nodeData.type, Fallback über Badge-Text
    if (!obj) return false;
    const nodeType = (obj.userData.nodeData?.type || '').toLowerCase();
    return nodeType === type;
  });
  if (items.length === 0) return;

  const allVisible = items.every(el => {
    const obj = nodeObjects[el.dataset.name];
    return obj && obj.visible;
  });
  const show = !allVisible;   // wenn alle sichtbar → ausblenden, sonst → einblenden

  items.forEach(item => {
    const name = item.dataset.name;
    const obj  = nodeObjects[name];
    if (!obj) return;
    obj.visible = show;
    item.classList.toggle('hidden', !show);
    const btn = item.querySelector('.vis-toggle');
    if (btn) {
      const isHex = btn.textContent === '⬡' || btn.textContent === '○';
      btn.textContent = show ? (isHex ? '⬡' : '●') : '○';
    }
  });
  nodeVisUpdateTypeButtons();
}

// Typ-Button-Zustand nachführen:
// aktiv = mindestens ein Node dieses Typs ist sichtbar
function nodeVisUpdateTypeButtons() {
  const toolbar = document.getElementById('node-toolbar');
  if (!toolbar) return;
  toolbar.querySelectorAll('.ntb-type').forEach(btn => {
    if (btn.disabled) return;
    const type = btn.dataset.type;
    const anyVisible = [...document.querySelectorAll('.node-item')].some(el => {
      const obj = nodeObjects[el.dataset.name];
      const nodeType = (obj?.userData.nodeData?.type || '').toLowerCase();
      return nodeType === type && obj?.visible;
    });
    btn.classList.toggle('ntb-active', anyVisible);
  });
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
  } else if (n.type === 'emitter') {
    const _rgb = c => 'rgb(' + c.map(v => Math.round(v*255)).join(',') + ')';
    const _sw  = 'display:inline-block;width:12px;height:12px;border-radius:2px;margin-right:4px;vertical-align:middle;background:';
    const swS = '<span style="' + _sw + _rgb(n.colorStart) + '"></span>';
    const swM = '<span style="' + _sw + _rgb(n.colorMid)   + '"></span>';
    const swE = '<span style="' + _sw + _rgb(n.colorEnd)   + '"></span>';
    // Birthrate: animierter Key hat Vorrang über statischen Wert
    const birthrateVal = (n._birthrateKeys && n._birthrateKeys.length > 0)
      ? L('nd_em_birthrate_key')
      : (n.birthrate + L('nd_em_birthrate_unit'));
    extraRows =
      '<div class="nd-section-header">' + L('nd_em_section') + '</div>' +
      '<div class="nd-row"><span>' + L('nd_em_texture')  + '</span><span class="nd-val">' + (n.emitterTexture || '\u2014') + '</span></div>' +
      '<div class="nd-row"><span>' + L('nd_em_blend')    + '</span><span class="nd-val">' + (n.blend || '\u2014') + '</span></div>' +
      '<div class="nd-row"><span>' + L('nd_em_update')   + '</span><span class="nd-val">' + (n.update || '\u2014') + '</span></div>' +
      '<div class="nd-row"><span>' + L('nd_em_render')   + '</span><span class="nd-val">' + (n.renderMode || '\u2014') + '</span></div>' +
      '<div class="nd-row"><span>' + L('nd_em_birthrate') + '</span><span class="nd-val">' + birthrateVal + '</span></div>' +
      '<div class="nd-row"><span>' + L('nd_em_lifeexp')  + '</span><span class="nd-val">' + n.lifeExp + L('nd_em_lifeexp_unit') + '</span></div>' +
      '<div class="nd-row"><span>' + L('nd_em_velocity') + '</span><span class="nd-val">' + n.velocity + (n.randvel ? ' \u00b1' + n.randvel : '') + '</span></div>' +
      '<div class="nd-row"><span>' + L('nd_em_size')     + '</span><span class="nd-val">' + n.sizeStart.toFixed(2) + ' \u2192 ' + n.sizeEnd.toFixed(2) + '</span></div>' +
      '<div class="nd-row"><span>' + L('nd_em_alpha')    + '</span><span class="nd-val">' + n.alphaStart.toFixed(2) + ' \u2192 ' + n.alphaEnd.toFixed(2) + '</span></div>' +
      '<div class="nd-row"><span>' + L('nd_em_color')    + '</span><span class="nd-val">' + swS + swM + swE + '</span></div>' +
      (n.grav    ? '<div class="nd-row"><span>' + L('nd_em_grav')   + '</span><span class="nd-val">' + n.grav   + '</span></div>' : '') +
      (n.drag    ? '<div class="nd-row"><span>' + L('nd_em_drag')   + '</span><span class="nd-val">' + n.drag   + '</span></div>' : '') +
      (n.spread  ? '<div class="nd-row"><span>' + L('nd_em_spread') + '</span><span class="nd-val">' + n.spread + '</span></div>' : '') +
      (n.chunkName ? '<div class="nd-row"><span>' + L('nd_em_chunk') + '</span><span class="nd-val">' + n.chunkName + '</span></div>' : '') +
      ((n.xgrid > 1 || n.ygrid > 1)
        ? '<div class="nd-row"><span>' + L('nd_em_grid') + '</span><span class="nd-val">' + n.xgrid + ' \u00d7 ' + n.ygrid + ' (' + L('nd_em_grid_frame') + ' ' + n.frameStart + '\u2013' + n.frameEnd + ')</span></div>'
        : '');
  }

  // ── MTR-Abschnitt ──────────────────────────────────────────────────
  const mtrKey = n.materialname
    ? n.materialname.toLowerCase()
    : (n.bitmap ? n.bitmap.toLowerCase() : null);
  const mtr = mtrKey ? (mtrCache[mtrKey] || null) : null;

  let mtrSection = '';
  if (mtr) {
    // Texture-Slots mit Lade-Status
    const mapSlots = [
      { idx: 0, label: 'Diffuse'   },
      { idx: 1, label: 'Normal'    },
      { idx: 2, label: 'Specular'  },
      { idx: 3, label: 'Roughness' },
      { idx: 4, label: 'Height'    },
      { idx: 5, label: 'Emissive'  },
    ];

    const texRows = mapSlots.map(slot => {
      const texName = mtr.textures.hasOwnProperty(slot.idx) ? mtr.textures[slot.idx] : null;
      if (texName === null && !mtr.textures.hasOwnProperty(slot.idx)) return ''; // Slot nicht im MTR
      const loaded  = texName && textureCache[texName];
      const missing = texName && !loaded;
      const icon    = loaded ? '✓' : (missing ? '?' : '—');
      const color   = loaded ? 'var(--gold2)' : (missing ? 'var(--amber)' : 'var(--muted)');
      const display = texName || '—';
      return '<div class="nd-row nd-mtr-row">' +
        '<span>' + slot.label + '</span>' +
        '<span class="nd-val">' +
          '<span style="color:' + color + ';margin-right:3px">' + icon + '</span>' +
          '<span style="color:' + (loaded ? 'var(--text)' : (missing ? 'var(--amber)' : 'var(--muted)')) + '">' +
            display +
          '</span>' +
        '</span></div>';
    }).filter(Boolean).join('');

    // Renderhint
    const rhVal   = mtr.renderhint || null;
    const rhRow   = rhVal
      ? '<div class="nd-row nd-mtr-row"><span>Renderhint</span>' +
        '<span class="nd-val nd-mtr-hint">' + rhVal + '</span></div>'
      : '';

    // Parameter
    const paramEntries = Object.entries(mtr.params);
    const paramRows = paramEntries.map(([pname, p]) =>
      '<div class="nd-row nd-mtr-row"><span>' + pname + '</span>' +
      '<span class="nd-val">' + p.values.map(v => v.toFixed(3)).join(', ') + '</span></div>'
    ).join('');

    // Tangenten-Status
    const geo = obj.geometry;
    const hasTangents = geo && geo.userData && geo.userData.hasTangents;
    const tanRow = '<div class="nd-row nd-mtr-row"><span>Tangents</span>' +
      '<span class="nd-val">' +
        '<span style="color:' + (hasTangents ? 'var(--gold2)' : 'var(--muted)') + ';margin-right:3px">' +
          (hasTangents ? '✓' : '—') +
        '</span>' +
        '<span style="color:' + (hasTangents ? 'var(--text)' : 'var(--muted)') + '">' +
          (hasTangents ? 'computed' : 'derivative') +
        '</span>' +
      '</span></div>';

    mtrSection =
      '<div class="nd-section-header">MTR · ' + mtrKey + '</div>' +
      rhRow +
      texRows +
      tanRow +
      (paramRows ? '<div class="nd-section-sub">Parameters</div>' + paramRows : '');
  }

  detail.innerHTML =
    '<div id="node-detail-handle">' +
      '<span class="nd-title">' + n.name + '</span>' +
      '<span class="nd-zoom-btns">' +
        '<button class="nd-zoom-btn" onclick="nodeDetailZoom(-1)" title="Smaller">−</button>' +
        '<button class="nd-zoom-btn" onclick="nodeDetailZoom(0)"  title="Reset">○</button>' +
        '<button class="nd-zoom-btn" onclick="nodeDetailZoom(1)"  title="Larger">＋</button>' +
      '</span>' +
      '<span class="nd-drag-icon">☰</span>' +
    '</div>' +
    '<div id="node-detail-body">' +
    '<div class="nd-row"><span>' + L('nd_type')     + '</span><span class="nd-val">' + n.type + '</span></div>' +
    '<div class="nd-row"><span>' + L('nd_parent')   + '</span><span class="nd-val">' + n.parent + '</span></div>' +
    '<div class="nd-row"><span>' + L('nd_vertices') + '</span><span class="nd-val">' + n.verts.length + '</span></div>' +
    '<div class="nd-row"><span>' + L('nd_faces')    + '</span><span class="nd-val">' + n.faces.length + '</span></div>' +
    '<div class="nd-row"><span>' + L('nd_bitmap')   + '</span><span class="nd-val">' + (n.bitmap || '—') + '</span></div>' +
    '<div class="nd-row"><span>' + L('nd_position') + '</span><span class="nd-val">' + n.position.map(v=>v.toFixed(3)).join(', ') + '</span></div>' +
    '<div class="nd-row"><span>' + L('nd_diffuse')  + '</span><span class="nd-val">' + n.diffuse.map(v=>v.toFixed(2)).join(', ') + '</span></div>' +
    '<div class="nd-row"><span>' + L('nd_alpha')    + '</span><span class="nd-val">' + n.alpha.toFixed(2) + '</span></div>' +
    extraRows +
    mtrSection +
    '</div>';
  // Drag-Logik an den neuen Handle binden (innerHTML ersetzt DOM → neu registrieren)
  initNodeDetailDrag();
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
  document.getElementById('wire-val').value = val;
  document.getElementById('wire-opacity').value = val;
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
  document.getElementById('light-val').value = val;
  document.getElementById('light-intensity').value = val;
  dirLight.intensity     = (val / 100) * 1.4;
  dirLight2.intensity    = (val / 100) * 0.6;
  ambientLight.intensity = (val / 100) * 0.5;
}

function updateMeshOpacity(val) {
  meshOpacity = val / 100;
  document.getElementById('mesh-val').value = val;
  document.getElementById('mesh-opacity').value = val;
  if (!modelGroup) return;
  modelGroup.traverse(child => {
    if (!child.isMesh || child.userData.isWireframe || child.userData.isAABB) return;
    const mat = child.material;
    if (!mat || !mat.isMeshStandardMaterial) return;
    if (meshOpacity < 1.0) {
      mat.transparent = true;
      mat.opacity     = meshOpacity;
      mat.depthWrite  = false;
    } else {
      // Auf Originalzustand zurücksetzen
      mat.transparent = child.userData.baseTransparent || false;
      mat.opacity     = child.userData.baseOpacity     ?? 1.0;
      mat.depthWrite  = child.userData.baseDepthWrite  ?? true;
    }
    mat.needsUpdate = true;
  });
}

// Hilfsfunktionen für bidirektionale Slider↔Textbox-Synchronisation
function syncSlider(sliderId, input, updateFn) {
  const slider = document.getElementById(sliderId);
  const min = parseFloat(slider.min), max = parseFloat(slider.max);
  let val = parseFloat(input.value);
  if (isNaN(val)) return;
  val = Math.max(min, Math.min(max, val));
  slider.value = val;
  window[updateFn](val);
}

function clampValInput(input, min, max) {
  let val = parseFloat(input.value);
  if (isNaN(val)) val = min;
  val = Math.max(min, Math.min(max, val));
  input.value = val;
}

function toggleNormals() {
  const btn = document.getElementById('btn-normals');
  btn.classList.toggle('active');
  const on = btn.classList.contains('active');
  if (modelGroup) {
    modelGroup.traverse(child => {
      if (child.isMesh && !child.userData.isWireframe && child.material.isMeshStandardMaterial) {
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

function toggleFloor() {
  const btn = document.getElementById('btn-floor');
  btn.classList.toggle('active');
  floorMesh.visible = btn.classList.contains('active');
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
//  Mesh-Farben Dropdown (Viewport top-center)
// ─────────────────────────────────────────────
function toggleColorDropdown() {
  const dd = document.getElementById('color-dropdown');
  if (dd) dd.classList.toggle('open');
}

// Dropdown bei Session-Reset schließen und Sektionen ausblenden
function resetColorDropdown() {
  const dd      = document.getElementById('color-dropdown');
  const wokSec  = document.getElementById('cdrop-wok-section');
  const pwkSec  = document.getElementById('cdrop-pwk-section');
  const empty   = document.getElementById('cdrop-empty');
  if (dd)     dd.classList.remove('open');
  if (wokSec) wokSec.style.display = 'none';
  if (pwkSec) pwkSec.style.display = 'none';
  if (empty)  empty.style.display  = 'block';
}

// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
//  Theme System
//  Eingebaute Themes sind als JS-Objekte eingebettet,
//  damit der Viewer auch über file:// funktioniert
//  (fetch() ist auf file:// vom Browser blockiert).
// ─────────────────────────────────────────────

const BUILTIN_THEMES = {
  'default': {
    name: 'Default',
    variables: {
      '--bg':              '#0a0c0f',
      '--bg-rgb':          '10, 12, 15',
      '--panel':           '#10141a',
      '--border':          '#2a3040',
      '--gold':            '#c8a44a',
      '--gold-rgb':        '200, 164, 74',
      '--gold2':           '#e8c870',
      '--amber':           '#f08030',
      '--text':            '#d0c8b8',
      '--muted':           '#6a7080',
      '--mesh':            '#4a90c0',
      '--dummy':           '#70b870',
      '--skin':            '#c070c0',
      '--emitter':         '#f0a030',
      '--danglymesh':      '#50b8d0',
      '--aabb':            '#e8a020',
      '--red':             '#c04040',
      '--red-light':       '#e06060',
      '--log-error':       '#e05050',
      '--log-warn':        '#e0a030',
      '--scrollbar':       '#606880',
      '--font-size-base':  '13px',
      '--font-size-small': '11px',
      '--font-size-label': '10px',
      '--font-size-tiny':  '9px',
      '--font-size-log':   '12px'
    }
  },
  'high-contrast': {
    name: 'High Contrast',
    variables: {
      '--bg':              '#000000',
      '--bg-rgb':          '0, 0, 0',
      '--panel':           '#111111',
      '--border':          '#ffffff',
      '--gold':            '#ffffff',
      '--gold-rgb':        '255, 255, 255',
      '--gold2':           '#ffff00',
      '--amber':           '#ff8800',
      '--text':            '#ffffff',
      '--muted':           '#cccccc',
      '--mesh':            '#44aaff',
      '--dummy':           '#44ee44',
      '--skin':            '#ff44ff',
      '--emitter':         '#ffaa00',
      '--danglymesh':      '#00ffee',
      '--aabb':            '#ffcc00',
      '--red':             '#ff4444',
      '--red-light':       '#ff7777',
      '--log-error':       '#ff4444',
      '--log-warn':        '#ffaa00',
      '--scrollbar':       '#888888',
      '--font-size-base':  '16px',
      '--font-size-small': '14px',
      '--font-size-label': '13px',
      '--font-size-tiny':  '12px',
      '--font-size-log':   '14px'
    }
  }
};

let _currentThemeVars = {};

/**
 * Wendet ein Theme-Objekt auf :root an.
 * @param {object} theme - Objekt mit { name, variables }
 */
function applyTheme(theme) {
  const root = document.documentElement;
  for (const key of Object.keys(_currentThemeVars)) {
    root.style.removeProperty(key);
  }
  _currentThemeVars = {};
  if (!theme || !theme.variables) return;
  for (const [key, value] of Object.entries(theme.variables)) {
    root.style.setProperty(key, value);
    _currentThemeVars[key] = value;
  }
}

/**
 * Aktiviert ein eingebautes Theme anhand seines Schlüssels.
 * @param {string} name - 'default' oder 'high-contrast'
 */
function loadBuiltinTheme(name) {
  const theme = BUILTIN_THEMES[name] || BUILTIN_THEMES['default'];
  applyTheme(theme);
  localStorage.setItem('nwn-theme', name);
}

/**
 * Lädt eine vom Nutzer gewählte JSON-Datei als Custom-Theme.
 * @param {File} file
 */
function loadCustomThemeFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const theme = JSON.parse(e.target.result);
      if (!theme.variables) throw new Error(L('err_theme_variables'));
      applyTheme(theme);
      localStorage.setItem('nwn-theme', '__custom__');
      const sel = document.getElementById('theme-select');
      if (sel) sel.value = '__custom__';
    } catch (err) {
      alert(fmt('err_theme_load', { msg: err.message }));
    }
  };
  reader.readAsText(file);
}

/**
 * Handler für das Theme-Dropdown.
 * @param {string} value - Gewählter Wert im <select>
 */
function onThemeSelect(value) {
  if (value === '__custom__') {
    document.getElementById('theme-file-input').click();
  } else {
    loadBuiltinTheme(value);
  }
}

/**
 * Initialisiert das Theme-System beim Start.
 * Custom-Themes können bei file:// nicht wiederhergestellt werden
 * (kein Dateisystem-Zugriff ohne Nutzer-Geste) — Fallback auf Default.
 */
function initTheme() {
  const saved = localStorage.getItem('nwn-theme') || 'default';
  const sel   = document.getElementById('theme-select');
  const name  = (saved === '__custom__' || !BUILTIN_THEMES[saved]) ? 'default' : saved;
  if (sel) sel.value = name;
  loadBuiltinTheme(name);
}

// Initialisierung beim DOM-Ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTheme);
} else {
  initTheme();
}

// ─────────────────────────────────────────────
//  Node-Detail-Panel — Drag to move
// ─────────────────────────────────────────────
(function () {
  // Gespeicherte Position {x, y} in Viewport-Koordinaten.
  // null = noch nicht initialisiert → Default unten-rechts beim ersten Öffnen.
  let _pos = null;
  let dragging = false;
  let startX, startY, startL, startT;

  // mousemove / mouseup nur einmal registrieren (nicht bei jedem Node-Klick neu)
  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    const panel = document.getElementById('node-detail');
    const vp    = document.getElementById('viewport');
    const pr    = vp.getBoundingClientRect();
    let newL = startL + (e.clientX - startX);
    let newT = startT + (e.clientY - startY);
    newL = Math.max(0, Math.min(pr.width  - panel.offsetWidth,  newL));
    newT = Math.max(0, Math.min(pr.height - panel.offsetHeight, newT));
    panel.style.left = newL + 'px';
    panel.style.top  = newT + 'px';
    _pos = { x: newL, y: newT };
  });

  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    const handle = document.getElementById('node-detail-handle');
    if (handle) handle.style.cursor = 'grab';
  });

  function initNodeDetailDrag() {
    const panel  = document.getElementById('node-detail');
    const handle = document.getElementById('node-detail-handle');
    if (!panel || !handle) return;

    // Sicherstellen dass bottom/right nie aktiv sind — die würden mit left/top
    // ein Strecken anstelle einer Verschiebung auslösen.
    panel.style.bottom = 'auto';
    panel.style.right  = 'auto';

    if (!_pos) {
      // Default-Position: unten-rechts im Viewport, 12px Abstand.
      // Panel kurz rendern um die echte Größe zu lesen.
      const wasHidden = panel.style.display === 'none';
      if (wasHidden) {
        panel.style.visibility = 'hidden';
        panel.style.display    = 'block';
      }
      const vp = document.getElementById('viewport');
      const pr = vp.getBoundingClientRect();
      _pos = {
        x: pr.width  - panel.offsetWidth  - 12,
        y: pr.height - panel.offsetHeight - 12,
      };
      if (wasHidden) {
        panel.style.display    = 'none';
        panel.style.visibility = '';
      }
    }

    // Position bei jedem Aufruf setzen (innerHTML-Reset löscht inline-Styles nicht,
    // aber _pos stellt die letzte bekannte Position wieder her).
    panel.style.left = _pos.x + 'px';
    panel.style.top  = _pos.y + 'px';

    // mousedown direkt auf dem Handle — ersetzt alten Listener durch removeEventListener
    const onMouseDown = e => {
      if (e.button !== 0) return;
      dragging = true;
      startX   = e.clientX;
      startY   = e.clientY;
      startL   = _pos.x;
      startT   = _pos.y;
      handle.style.cursor = 'grabbing';
      e.preventDefault();
    };
    // Alten Listener entfernen bevor neu gesetzt (innerHTML baut neuen Handle)
    handle.removeEventListener('mousedown', handle._dragHandler);
    handle._dragHandler = onMouseDown;
    handle.addEventListener('mousedown', onMouseDown);
  }

  // Zoom-Funktion: step=-1 kleiner, 0=reset, 1=größer
  const ZOOM_STEPS = [8, 9, 10, 11, 12, 14, 16];
  let _zoomIdx = 2;  // Default = 10px (index 2)
  function nodeDetailZoom(step) {
    if (step === 0) _zoomIdx = 2;
    else _zoomIdx = Math.max(0, Math.min(ZOOM_STEPS.length - 1, _zoomIdx + step));
    const body = document.getElementById('node-detail-body');
    if (body) body.style.fontSize = ZOOM_STEPS[_zoomIdx] + 'px';
    // Position neu berechnen damit Panel nicht aus dem Viewport rutscht
    const panel = document.getElementById('node-detail');
    const vp    = document.getElementById('viewport');
    if (panel && vp && _pos) {
      const pr = vp.getBoundingClientRect();
      _pos.x = Math.min(_pos.x, pr.width  - panel.offsetWidth);
      _pos.y = Math.min(_pos.y, pr.height - panel.offsetHeight);
      panel.style.left = _pos.x + 'px';
      panel.style.top  = _pos.y + 'px';
    }
  }
  window.nodeDetailZoom = nodeDetailZoom;

  // Exportieren damit showNodeDetail() es aufrufen kann
  window.initNodeDetailDrag = initNodeDetailDrag;
})();
