/* ═══════════════════════════════════════════════
   NWN MDL Viewer — UI: Node List & Controls
   ═══════════════════════════════════════════════ */

//  Sidebar node list
// ─────────────────────────────────────────────
function buildNodeList(model) {
  const list = document.getElementById('node-list');
  list.innerHTML = '';

  // Show toolbar and adjust type buttons
  const toolbar = document.getElementById('node-toolbar');
  if (toolbar) {
    toolbar.style.display = 'flex';
    // Gray out type buttons if no node of this type is present
    const presentTypes = new Set(model.nodes.map(n => n.type));
    toolbar.querySelectorAll('.ntb-type').forEach(btn => {
      const t = btn.dataset.type;
      btn.disabled = !presentTypes.has(t);
      btn.style.opacity = presentTypes.has(t) ? '1' : '0.25';
      btn.classList.remove('ntb-active');
    });
    // Initialize type button state (all visible → all active)
    nodeVisUpdateTypeButtons();
  }
  
  // Items are collected in a fragment instead of being appended to the
  // live DOM individually — for large tilesets (set browser groups), this
  // prevents hundreds of individual reflows.
  const frag = document.createDocumentFragment();
  
  for (const node of model.nodes) {
    const item = document.createElement('div');
    item.className = 'node-item';
    item.dataset.name = node.name;

    // FIX: Direct Three.js object reference for collision-safe visibility toggling.
    // nodeObjects[node.name] only holds the *last* writer when multiple tiles share
    // the same node name (e.g. "walkmesh").  _nwnObj always points to *this* node's
    // specific object regardless of name collisions in the group scene.
    item._nwnObj = node._threeObj || null;

    const typeClass = ['trimesh','skin','dummy','emitter','aabb','danglymesh'].includes(node.type) ? node.type : 'other';
    const dot = document.createElement('div');
    dot.className = `node-dot dot-${typeClass}`;
    item.appendChild(dot);

    const name = document.createElement('span');
    name.className = 'node-name';
    name.textContent = node.displayName || node.name;
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
    } else if (node._threeObj || nodeObjects[node.name]) {
      // All other visible nodes (dummy, emitter, light …) are also toggleable.
      // Use node._threeObj as the primary check so that nodes from non-last tiles
      // (whose nodeObjects entry was overwritten) still receive a toggle button.
      const vis = document.createElement('span');
      vis.className = 'vis-toggle';
      vis.textContent = '●';
      vis.title = L('vis_toggle_title');
      vis.onclick = (e) => { e.stopPropagation(); toggleNodeVisibility(node.name, item, vis, '●'); };
      item.appendChild(vis);
    }

    item.onclick = () => selectNode(node.name);
    frag.appendChild(item);
  }
  
  list.appendChild(frag);
}

function toggleNodeVisibility(name, item, btn, visibleIcon) {
  // FIX: Prefer the direct Three.js reference stored on the DOM element.
  // nodeObjects[name] only holds the last tile's object when multiple tiles share
  // the same node name.  item._nwnObj always points to the correct specific object.
  const obj = item._nwnObj || nodeObjects[name];
  if (!obj) return;
  obj.visible = !obj.visible;
  item.classList.toggle('hidden', !obj.visible);
  const onIcon  = visibleIcon || '⬡';
  const offIcon = '○';
  btn.textContent = obj.visible ? onIcon : offIcon;
  nodeVisUpdateTypeButtons();   // Update type button state
}

// ─────────────────────────────────────────────
//  Node-Toolbar-Actions
// ─────────────────────────────────────────────

// Show or hide all nodes
function nodeVisAll(show) {
  document.querySelectorAll('.node-item').forEach(item => {
    const name = item.dataset.name;
    const obj  = item._nwnObj || nodeObjects[name];
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

// Toggle all nodes of a specific type together:
// If all are visible → hide all; otherwise → show all
function nodeVisToggleType(type) {
  const items = [...document.querySelectorAll(`.node-item`)].filter(el => {
    const obj  = el._nwnObj || nodeObjects[el.dataset.name];
    // Type via userData.nodeData.type, fallback via badge text
    if (!obj) return false;
    const nodeType = (obj.userData.nodeData?.type || '').toLowerCase();
    return nodeType === type;
  });
  if (items.length === 0) return;

  const allVisible = items.every(el => {
    const obj = el._nwnObj || nodeObjects[el.dataset.name];
    return obj && obj.visible;
  });
  const show = !allVisible;   // if all visible → hide, otherwise → show

  items.forEach(item => {
    const obj  = item._nwnObj || nodeObjects[item.dataset.name];
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

// Update type button state:
// active = at least one node of this type is visible
function nodeVisUpdateTypeButtons() {
  const toolbar = document.getElementById('node-toolbar');
  if (!toolbar) return;
  toolbar.querySelectorAll('.ntb-type').forEach(btn => {
    if (btn.disabled) return;
    const type = btn.dataset.type;
    const anyVisible = [...document.querySelectorAll('.node-item')].some(el => {
      const obj = el._nwnObj || nodeObjects[el.dataset.name];
      const nodeType = (obj?.userData.nodeData?.type || '').toLowerCase();
      return nodeType === type && obj?.visible;
    });
    btn.classList.toggle('ntb-active', anyVisible);
  });
}

// ─────────────────────────────────────────────
//  Selection Highlight — static white Outline-Mesh
// ─────────────────────────────────────────────
function clearSelectionHighlight() {
  if (!selectionHighlight) return;
  if (selectionHighlight.parent) selectionHighlight.parent.remove(selectionHighlight);
  selectionHighlight.material.dispose();
  selectionHighlight = null;
}

function addSelectionHighlight(obj) {
  clearSelectionHighlight();
  if (!obj || !obj.isMesh || !obj.geometry) return;   // only Trimesh/Skin/Dangly/Animmesh
  const mat = new THREE.MeshBasicMaterial({
    color:       0xffffff,
    side:        THREE.BackSide,
    depthWrite:  false,
    transparent: true,
    opacity:     0.6,
  });
  // Same geometry reference as the original — thus follows automatically
  // CPU skinning/dangly mesh deformation without custom update logic.
  const mesh = new THREE.Mesh(obj.geometry, mat);
  mesh.scale.setScalar(1.03);
  mesh.userData.isSelectionHighlight = true;
  obj.add(mesh);
  selectionHighlight = mesh;
}

function selectNode(name) {
  selectedNodeName = name;
  document.querySelectorAll('.node-item').forEach(el => el.classList.remove('selected'));
  const el = document.querySelector(`.node-item[data-name="${CSS.escape(name)}"]`);
  if (el) { el.classList.add('selected'); el.scrollIntoView({ block: 'nearest' }); }

const obj = nodeObjects[name];
  if (!obj || !obj.userData.nodeData) { document.getElementById('node-detail').style.display = 'none'; clearSelectionHighlight(); return; }
  addSelectionHighlight(obj);
  const n = obj.userData.nodeData;

  const detail = document.getElementById('node-detail');
  detail.style.display = 'block';

  let extraRows = '';
  // NEW: second UV stage present but not rendered — same signal as the
  // buildScene() log hint, shown per-node in the inspector.
  const extraUvCount = (n.tverts1?.length || 0) + (n.tverts2?.length || 0) + (n.tverts3?.length || 0);
  if (extraUvCount > 0) {
    extraRows += '<div class="nd-row"><span>UV1/2/3</span><span class="nd-val" style="color:var(--amber)">' +
      (n.tverts1?.length ? 'tverts1 ' : '') +
      (n.tverts2?.length ? 'tverts2 ' : '') +
      (n.tverts3?.length ? 'tverts3' : '') +
      ' (unused)</span></div>';
  }
  if (n.type === 'reference' && n.refModel) {
    // NEW: same "parsed but not loaded" signal as the UV-stage hint above.
    extraRows += '<div class="nd-row"><span>refModel</span><span class="nd-val" style="color:var(--amber)">' +
      n.refModel + ' (not loaded)</span></div>';
  }
  if (n.type === 'danglymesh') {
    extraRows = '<div class="nd-row"><span>' + L('nd_dangle_info_label') + '</span><span class="nd-val">' + L('nd_dangle_info') + '</span></div>';
  } else if (n.type === 'light') {
    const _rgb = c => 'rgb(' + c.map(v => Math.round(v*255)).join(',') + ')';
    const _sw  = 'display:inline-block;width:12px;height:12px;border-radius:2px;margin-right:4px;vertical-align:middle;background:';
    const swL  = '<span style="' + _sw + _rgb(n.lightColor) + '"></span>';
    const yn   = v => v ? L('nd_lt_yes') : L('nd_lt_no');
    extraRows =
      '<div class="nd-section-header">' + L('nd_lt_section') + '</div>' +
      '<div class="nd-row"><span>' + L('nd_lt_color')         + '</span><span class="nd-val">' + swL + n.lightColor.map(v => v.toFixed(3)).join(', ') + '</span></div>' +
      '<div class="nd-row"><span>' + L('nd_lt_radius')        + '</span><span class="nd-val">' + n.lightRadius.toFixed(2) + '</span></div>' +
      '<div class="nd-row"><span>' + L('nd_lt_multiplier')    + '</span><span class="nd-val">' + n.lightMultiplier.toFixed(2) + '</span></div>' +
      '<div class="nd-row"><span>' + L('nd_lt_ambient_only')  + '</span><span class="nd-val">' + yn(n.lightAmbientOnly) + '</span></div>' +
      '<div class="nd-row"><span>' + L('nd_lt_ndynamic')      + '</span><span class="nd-val">' + n.lightNDynamicType + '</span></div>' +
      '<div class="nd-row"><span>' + L('nd_lt_affect_dynamic')+ '</span><span class="nd-val">' + yn(n.lightAffectDynamic) + '</span></div>' +
      '<div class="nd-row"><span>' + L('nd_lt_priority')      + '</span><span class="nd-val">' + n.lightPriority + '</span></div>' +
      '<div class="nd-row"><span>' + L('nd_lt_fading')        + '</span><span class="nd-val">' + yn(n.lightFadingLight) + '</span></div>' +
      '<div class="nd-row"><span>' + L('nd_lt_shadow')        + '</span><span class="nd-val">' + yn(n.lightShadow) + '</span></div>';
  } else if (n.type === 'emitter') {
    const _rgb = c => 'rgb(' + c.map(v => Math.round(v*255)).join(',') + ')';
    const _sw  = 'display:inline-block;width:12px;height:12px;border-radius:2px;margin-right:4px;vertical-align:middle;background:';
    const swS = '<span style="' + _sw + _rgb(n.colorStart) + '"></span>';
    const swM = '<span style="' + _sw + _rgb(n.colorMid)   + '"></span>';
    const swE = '<span style="' + _sw + _rgb(n.colorEnd)   + '"></span>';
    // Birthrate: animated key takes precedence over static value
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

  // ── MTR-Section ──────────────────────────────────────────────────
  const mtrKey = n.materialname
    ? n.materialname.toLowerCase()
    : (n.bitmap ? n.bitmap.toLowerCase() : null);
  const mtr = mtrKey ? (mtrCache[mtrKey] || null) : null;

  let mtrSection = '';
  if (mtr) {
    // Texture slots with loading status
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

    // Parameters
    const paramEntries = Object.entries(mtr.params);
    const paramRows = paramEntries.map(([pname, p]) =>
      '<div class="nd-row nd-mtr-row"><span>' + pname + '</span>' +
      '<span class="nd-val">' + p.values.map(v => v.toFixed(3)).join(', ') + '</span></div>'
    ).join('');

    // Tangent status
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
      '<span class="nd-title">' + (n.displayName || n.name) + '</span>' +
      '<span id="node-detail-drag-strip" class="nd-drag-strip" title="' + L('nd_drag_title') + '">⠿ ⠿ ⠿</span>' +
      '<span class="nd-zoom-btns">' +
        '<button class="nd-zoom-btn" data-zoom="-1" title="Smaller">−</button>' +
        '<button class="nd-zoom-btn" data-zoom="0"  title="Reset">○</button>' +
        '<button class="nd-zoom-btn" data-zoom="1"  title="Larger">＋</button>' +
      '</span>' +
      '<button class="nd-close-btn" title="' + L('nd_close_title') + '">×</button>' +
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
  // CSP: keine inline onclick-Attribute — Zoom-/Close-Buttons per addEventListener
  // verkabeln (innerHTML ersetzt bei jedem Aufruf den kompletten DOM-Teilbaum,
  // deshalb muss das bei jedem selectNode()-Aufruf neu passieren, analog zu
  // initNodeDetailDrag() direkt darunter).
  detail.querySelectorAll('.nd-zoom-btn').forEach(btn => {
    btn.addEventListener('click', () => nodeDetailZoom(parseInt(btn.dataset.zoom, 10)));
  });
  detail.querySelector('.nd-close-btn').addEventListener('click', closeNodeDetail);
  // Bind drag logic to the new handle (innerHTML replaces DOM → re-register)
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
      // Reset to original state
      // FIX: restore alphaTest alongside transparent/depthWrite — without it,
      // meshes that use alphaTest (e.g. foliage, decals) appear black at 100%
      // because transparent=false + alphaTest=0 discards alpha-punched pixels.
      mat.transparent = child.userData.baseTransparent ?? false;
      mat.opacity     = child.userData.baseOpacity     ?? 1.0;
      mat.depthWrite  = child.userData.baseDepthWrite  ?? true;
      mat.alphaTest   = child.userData.baseAlphaTest   ?? 0;
    }
    mat.needsUpdate = true;
  });
}

// Helper functions for bidirectional slider↔textbox synchronization
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
  // FIX: also clear the screen-space pan offset (see scene.js) — otherwise
  // "↺ Cam" would re-center theta/phi/radius but leave the model visually
  // shifted from a previous deliberate pan.
  orbit.panX = 0;
  orbit.panY = 0;
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

// Representative colors per layer (placeholder until real palette mapping)
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
    const isMulti = pltEntries.length > 1;

    // For multiple parts: collapsible section per part
    let appendTarget = listEl;
    if (isMulti) {
      const label = document.createElement('div');
      label.className = 'plt-part-label';

      const arrow = document.createElement('span');
      arrow.className = 'plt-part-arrow';
      arrow.textContent = '▼';   // expanded = downwards

      const nameSpan = document.createElement('span');
      nameSpan.textContent = texName;
      label.appendChild(arrow);
      label.appendChild(nameSpan);

      const partBody = document.createElement('div');
      partBody.className = 'plt-part-body';

      label.addEventListener('click', () => {
        const collapsed = partBody.classList.toggle('collapsed');
        arrow.textContent = collapsed ? '▲' : '▼';
      });

      listEl.appendChild(label);
      listEl.appendChild(partBody);
      appendTarget = partBody;
    }

    const usedLayers = tex.userData.usedLayers || new Array(10).fill(false);

    for (let i = 0; i < 10; i++) {
      const used = usedLayers[i];
      // Layer header row
      const item = document.createElement('div');
      item.className = 'plt-layer-item' + (used ? ' used' : '');

      const dot = document.createElement('div');
      dot.className = 'plt-layer-dot';
      dot.dataset.layerDot = i;   // for global Skin/Hair synchronization
      // Layer 0+1 (Skin/Hair) → global rows; rest → per part
      const rowForDot = (i <= 1) ? pltLayerRows[i] : getPltRows(texName)[i];
      dot.style.background = getPaletteSwatchHex(i, rowForDot);
      item.appendChild(dot);

      const nameSpan = document.createElement('span');
      nameSpan.className = 'plt-layer-name';
      nameSpan.textContent = L('plt_layer_' + i);
      item.appendChild(nameSpan);

      const tag = document.createElement('span');
      tag.className = 'plt-layer-tag';
      tag.textContent = used ? '●' : '○';
      item.appendChild(tag);

      // Expand arrow for color picker only if palette exists and layer is used
      if (used && hasPalette(i)) {
        const pickArrow = document.createElement('span');
        pickArrow.className = 'plt-pick-arrow';
        pickArrow.textContent = '▶';
        pickArrow.style.cssText = 'font-size:8px;color:var(--muted);margin-left:2px;transition:transform 0.2s;flex-shrink:0;';
        item.appendChild(pickArrow);
        item.style.cursor = 'pointer';

        const picker = _buildLayerPicker(i, dot, texName);
        picker.style.display = 'none'; // collapsed by default

        item.addEventListener('click', () => {
          const open = picker.style.display !== 'none';
          picker.style.display = open ? 'none' : 'flex';
          pickArrow.style.transform = open ? '' : 'rotate(90deg)';
        });

        appendTarget.appendChild(item);
        appendTarget.appendChild(picker);
      } else {
        appendTarget.appendChild(item);
      }
    }
  }

  // Render with palettes directly on initial creation
  reapplyAllPLTPalettes();
}

// Scrollbar inserted here
function _buildLayerPicker(layerIdx, dotEl, texKey) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:2px;padding:4px 0 6px 18px;max-height:120px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:var(--scrollbar) transparent;';
  wrap.dataset.layerPicker = layerIdx;

  // Layer 0 (Skin) + 1 (Hair) are global – same color applied to all parts.
  // Layer 2–9 (Metal, Cloth, Leather, Tattoo) are per part/texture.
  const isGlobal = (layerIdx <= 1);
  const partRows  = isGlobal ? null : getPltRows(texKey);
  const currentRow = isGlobal ? pltLayerRows[layerIdx] : partRows[layerIdx];

  const rows = hasPalette(layerIdx) ? 176 : 0;
  for (let row = 0; row < rows; row++) {
    const hex = getPaletteSwatchHex(layerIdx, row);
    const sw = document.createElement('div');
    sw.style.cssText = `width:12px;height:12px;border-radius:2px;background:${hex};cursor:pointer;flex-shrink:0;`;
    sw.title = L('plt_row_label') + row;
    if (row === currentRow) {
      sw.style.outline = '1.5px solid var(--gold)';
      sw.style.outlineOffset = '1px';
    }
    sw.addEventListener('click', () => {
      if (isGlobal) {
        // Apply Skin / Hair globally to all PLT textures
        pltLayerRows[layerIdx] = row;
        reapplyAllPLTPalettes();
        // Synchronize all picker wraps for this layer (across all part sections)
        const newHex = getPaletteSwatchHex(layerIdx, row);
        document.querySelectorAll(`[data-layer-picker="${layerIdx}"]`).forEach(otherWrap => {
          otherWrap.querySelectorAll('div').forEach((s, idx) => {
            s.style.outline      = (idx === row) ? '1.5px solid var(--gold)' : '';
            s.style.outlineOffset= (idx === row) ? '1px' : '';
          });
        });
        // Synchronize all dots for this layer (across all part sections)
        document.querySelectorAll(`[data-layer-dot="${layerIdx}"]`).forEach(d => {
          d.style.background = newHex;
        });
      } else {
        // Re-render only this part for Metal / Cloth / Leather / Tattoo
        partRows[layerIdx] = row;
        applyPLTPalette(textureCache[texKey]);
        // Update selection highlight and dot only inside its own picker
        wrap.querySelectorAll('div').forEach((s, idx) => {
          s.style.outline      = (idx === row) ? '1.5px solid var(--gold)' : '';
          s.style.outlineOffset= (idx === row) ? '1px' : '';
        });
        dotEl.style.background = getPaletteSwatchHex(layerIdx, row);
      }
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

function toggleSceneGraph() {
  const body  = document.getElementById('scene-graph-body');
  const arrow = document.querySelector('#section-title .tex-arrow');
  if (!body) return;
  body.classList.toggle('collapsed');
  if (arrow) arrow.classList.toggle('open');
}

// ─────────────────────────────────────────────
//  Mesh-Colors Dropdown (Viewport top-center)
// ─────────────────────────────────────────────
function toggleColorDropdown() {
  const dd = document.getElementById('color-dropdown');
  if (dd) dd.classList.toggle('open');
}

// Close dropdown on session reset and hide sections
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
//  Theme System
//  Built-in themes are embedded as JS objects
//  so the viewer also works via file://
//  (fetch() is blocked on file:// by browsers).
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

// ─────────────────────────────────────────────
// Applies a theme object to :root.
// @param {object} theme - Object with { name, variables }
// ─────────────────────────────────────────────
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
  // FIX: Native OS controls (e.g., <select> dropdowns in Tauri/WebView2/WebKitGTK)
  // ignore our CSS theme and follow the color-scheme instead. Without this
  // line, they remain light even when --bg is dark (Tauri bug report).
  root.style.colorScheme = _isDarkBg(theme.variables['--bg-rgb']) ? 'dark' : 'light';
}

// --bg-rgb is "r, g, b" (see themes/README.md). If the value is missing
// (e.g., a minimalist custom theme without --bg-rgb) → assume dark,
// since both built-in themes are dark.
function _isDarkBg(rgbStr) {
  if (!rgbStr) return true;
  const [r, g, b] = rgbStr.split(',').map(Number);
  if ([r, g, b].some(Number.isNaN)) return true;
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;   // ITU-R BT.601 Luminanz
}

// ─────────────────────────────────────────────
// Activates a built-in theme based on its key.
// @param {string} name - 'default' or 'high-contrast'
// ─────────────────────────────────────────────
function loadBuiltinTheme(name) {
  const theme = BUILTIN_THEMES[name] || BUILTIN_THEMES['default'];
  applyTheme(theme);
  localStorage.setItem('nwn-theme', name);
}

/**
 * Loads a user-selected JSON file as a custom theme.
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
 * Handler for the theme dropdown.
 * @param {string} value - Selected value in the <select>
 */
function onThemeSelect(value) {
  if (value === '__custom__') {
    document.getElementById('theme-file-input').click();
  } else {
    loadBuiltinTheme(value);
  }
}

/**
 * Initializes the theme system on startup.
 * Custom themes cannot be restored via file://
 * (no filesystem access without user gesture) — fallback to default.
 */
function initTheme() {
  const saved = localStorage.getItem('nwn-theme') || 'default';
  const sel   = document.getElementById('theme-select');
  const name  = (saved === '__custom__' || !BUILTIN_THEMES[saved]) ? 'default' : saved;
  if (sel) sel.value = name;
  loadBuiltinTheme(name);
}

// Initialization on DOM Ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTheme);
} else {
  initTheme();
}

// ─────────────────────────────────────────────
//  Node-Detail-Panel — Drag to move + Close
// ─────────────────────────────────────────────
(function () {
  // Saved position {x, y} in viewport coordinates.
  // null = not initialized yet → Default bottom-right on first open.
  let _pos = null;
  let dragging = false;
  let startX, startY, startL, startT;

  // Helper function: returns clientX/Y independently of mouse or touch events
  function _evXY(e) {
    const src = e.touches ? e.touches[0] : e;
    return { x: src.clientX, y: src.clientY };
  }

  // Shared move handler for mouse and touch
  function _onMove(e) {
    if (!dragging) return;
    if (e.cancelable) e.preventDefault();   // Prevent scrolling on touch
    const { x, y } = _evXY(e);
    const panel = document.getElementById('node-detail');
    const vp    = document.getElementById('viewport');
    const pr    = vp.getBoundingClientRect();
    let newL = startL + (x - startX);
    let newT = startT + (y - startY);
    newL = Math.max(0, Math.min(pr.width  - panel.offsetWidth,  newL));
    newT = Math.max(0, Math.min(pr.height - panel.offsetHeight, newT));
    panel.style.left = newL + 'px';
    panel.style.top  = newT + 'px';
    _pos = { x: newL, y: newT };
  }

  // Shared end handler for mouse and touch
  function _onEnd() {
    if (!dragging) return;
    dragging = false;
    const strip = document.getElementById('node-detail-drag-strip');
    if (strip) strip.style.cursor = 'grab';
  }

  // Register global listeners only once
  window.addEventListener('mousemove',   _onMove);
  window.addEventListener('mouseup',     _onEnd);
  window.addEventListener('touchmove',   _onMove,  { passive: false });
  window.addEventListener('touchend',    _onEnd);
  window.addEventListener('touchcancel', _onEnd);

  function initNodeDetailDrag() {
    const panel = document.getElementById('node-detail');
    const strip = document.getElementById('node-detail-drag-strip');
    if (!panel || !strip) return;

    // Deactivate bottom/right — would misinterpret left/top movement as resizing
    panel.style.bottom = 'auto';
    panel.style.right  = 'auto';

    if (!_pos) {
      // Default position: bottom-right in viewport, 12px offset.
      // Make panel briefly visible to read its actual size.
      const wasHidden = panel.style.display === 'none';
      if (wasHidden) {
        panel.style.visibility = 'hidden';
        panel.style.display    = 'block';
      }
      const vp = document.getElementById('viewport');
      const pr = vp.getBoundingClientRect();
      // Math.max(0, …) prevents negative starting values on narrow displays
      _pos = {
        x: Math.max(0, pr.width  - panel.offsetWidth  - 12),
        y: Math.max(0, pr.height - panel.offsetHeight - 12),
      };
      if (wasHidden) {
        panel.style.display    = 'none';
        panel.style.visibility = '';
      }
    }

    // Set position (restores the last known position after innerHTML reset)
    panel.style.left = _pos.x + 'px';
    panel.style.top  = _pos.y + 'px';

    // Drag start: Only on the strip, mouse + touch
    const onDragStart = e => {
      if (e.type === 'mousedown' && e.button !== 0) return;
      dragging = true;
      const { x, y } = _evXY(e);
      startX = x;  startY = y;
      startL = _pos.x;  startT = _pos.y;
      strip.style.cursor = 'grabbing';
      e.preventDefault();
    };

    // Remove old listener before setting a new one (innerHTML builds a new strip)
    strip.removeEventListener('mousedown',  strip._dragMouse);
    strip.removeEventListener('touchstart', strip._dragTouch);
    strip._dragMouse = onDragStart;
    strip._dragTouch = onDragStart;
    strip.addEventListener('mousedown',  onDragStart);
    strip.addEventListener('touchstart', onDragStart, { passive: false });
  }

  // Zoom function: step=-1 smaller, 0=reset, 1=larger
  const ZOOM_STEPS = [8, 9, 10, 11, 12, 14, 16];
  let _zoomIdx = 2;  // Default = 10px (index 2)
  function nodeDetailZoom(step) {
    if (step === 0) _zoomIdx = 2;
    else _zoomIdx = Math.max(0, Math.min(ZOOM_STEPS.length - 1, _zoomIdx + step));
    const body = document.getElementById('node-detail-body');
    if (body) body.style.fontSize = ZOOM_STEPS[_zoomIdx] + 'px';
    // Recalculate position so the panel stays within the viewport after resizing
    const panel = document.getElementById('node-detail');
    const vp    = document.getElementById('viewport');
    if (panel && vp && _pos) {
      const pr = vp.getBoundingClientRect();
      _pos.x = Math.max(0, Math.min(_pos.x, pr.width  - panel.offsetWidth));
      _pos.y = Math.max(0, Math.min(_pos.y, pr.height - panel.offsetHeight));
      panel.style.left = _pos.x + 'px';
      panel.style.top  = _pos.y + 'px';
    }
  }
  window.nodeDetailZoom = nodeDetailZoom;

  // Close panel and deselect node
  function closeNodeDetail() {
    const panel = document.getElementById('node-detail');
    if (panel) panel.style.display = 'none';
    document.querySelectorAll('.node-item').forEach(el => el.classList.remove('selected'));
    if (typeof selectedNodeName !== 'undefined') selectedNodeName = null;
    clearSelectionHighlight();
  }
  window.closeNodeDetail    = closeNodeDetail;
  window.initNodeDetailDrag = initNodeDetailDrag;
})();
