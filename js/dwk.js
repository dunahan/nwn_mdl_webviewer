/* ═══════════════════════════════════════════════
   NWN MDL Viewer — DWK Door Walk Geometry
   Parser & Renderer
   ═══════════════════════════════════════════════

   DWK-Nodes (Tür-Walkmesh):
     trimesh  *_wg_closed  → Sperr-Geometrie (Tür geschlossen)
     trimesh  *_wg_open1   → Sperr-Geometrie (Tür auf, Richtung 1)
     trimesh  *_wg_open2   → Sperr-Geometrie (Tür auf, Richtung 2)
     dummy    *_dp_closed_N → Türpositionen (geschlossen)
     dummy    *_dp_open1_N  → Türpositionen (offen, Richtung 1)
     dummy    *_dp_open2_N  → Türpositionen (offen, Richtung 2)

   Koordinatensystem: NWN ist Z-up → -Math.PI/2 Korrektur wie WOK/PWK/MDL.
   ═══════════════════════════════════════════════ */

// ─────────────────────────────────────────────
//  Farben für DWK-Elemente (mutable für Dropdown)
// ─────────────────────────────────────────────
const DWK_COLORS = {
  wg: 0x00aacc,   // Walk-Geometry (Sperr-Box) — Cyan
  dp: 0xffaa00,   // Door-Position-Marker — Amber
};

function _dwkNumToHex(n) { return '#' + n.toString(16).padStart(6, '0'); }

// Live-Farbupdate für DWK-Meshes
function updateDwkColor(type, hexStr) {
  DWK_COLORS[type] = parseInt(hexStr.replace('#', ''), 16);
  if (!dwkGroup) return;
  dwkGroup.traverse(child => {
    if (child.userData.dwkType === type && child.material) {
      child.material.color.set(hexStr);
    }
  });
}

// DWK-Panel im Dropdown einblenden und Startwerte setzen
function buildDwkColorPanel() {
  const section = document.getElementById('cdrop-dwk-section');
  const empty   = document.getElementById('cdrop-empty');
  const wgInput = document.getElementById('cdwk-wg');
  const dpInput = document.getElementById('cdwk-dp');
  if (!section) return;
  if (wgInput) wgInput.value = _dwkNumToHex(DWK_COLORS.wg);
  if (dpInput) dpInput.value = _dwkNumToHex(DWK_COLORS.dp);
  section.style.display = 'block';
  if (empty) empty.style.display = 'none';
}

// ─────────────────────────────────────────────
//  Zustand-Erkennung aus Node-Namen
// ─────────────────────────────────────────────
function _dwkNodeState(name) {
  const n = name.toLowerCase();
  if (n.includes('_wg_open2') || n.includes('_dp_open2')) return 'open2';
  if (n.includes('_wg_open1') || n.includes('_dp_open1')) return 'open1';
  if (n.includes('_wg_closed') || n.includes('_dp_closed')) return 'closed';
  return null;
}

// ─────────────────────────────────────────────
//  Parser
// ─────────────────────────────────────────────
function parseDWK(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const dwk = { name: '', meshNodes: [], dpNodes: [] };

  let i = 0;
  function tok(idx) { return lines[idx].trim().split(/\s+/).filter(x => x.length > 0); }
  function key(idx) { return (tok(idx)[0] || '').toLowerCase(); }
  function num(s)   { const v = parseFloat(s); return isNaN(v) ? 0 : v; }

  while (i < lines.length) {
    const t = tok(i);
    const k = key(i);

    if (k === 'node') {
      const nodeType = (t[1] || '').toLowerCase();
      const nodeName = t[2] || '';

      const node = {
        type:        nodeType,
        name:        nodeName,
        parent:      '',
        position:    [0, 0, 0],
        orientation: [0, 0, 0, 0],
        verts:       [],
        faces:       [],
        state:       _dwkNodeState(nodeName),
      };

      i++;
      while (i < lines.length) {
        const nt = tok(i);
        const nk = (nt[0] || '').toLowerCase();

        if (nk === 'endnode') {
          // DWK-Root-Name aus parent ableiten (erster gültiger)
          if (!dwk.name && node.parent && node.parent.toLowerCase() !== 'null') {
            dwk.name = node.parent;
          }
          if (nodeType === 'trimesh' && node.state) {
            dwk.meshNodes.push(node);
          } else if (nodeType === 'dummy' && node.state) {
            dwk.dpNodes.push(node);
          }
          break;
        }

        if      (nk === 'parent')      node.parent      = nt[1] || '';
        else if (nk === 'position')    node.position    = [num(nt[1]), num(nt[2]), num(nt[3])];
        else if (nk === 'orientation') node.orientation = [num(nt[1]), num(nt[2]), num(nt[3]), num(nt[4])];
        else if (nk === 'verts') {
          const count = parseInt(nt[1]) || 0;
          for (let j = 0; j < count; j++) {
            i++;
            const vt = tok(i);
            if (vt.length >= 3) node.verts.push([num(vt[0]), num(vt[1]), num(vt[2])]);
          }
        } else if (nk === 'faces') {
          const count = parseInt(nt[1]) || 0;
          for (let j = 0; j < count; j++) {
            i++;
            const ft = tok(i);
            // Format: v0 v1 v2  smoothGroup  adj0 adj1 adj2  surfaceMat
            if (ft.length >= 8) {
              node.faces.push({
                v:   [parseInt(ft[0]), parseInt(ft[1]), parseInt(ft[2])],
                sg:  parseInt(ft[3]) || 0,
                adj: [parseInt(ft[4]), parseInt(ft[5]), parseInt(ft[6])],
                mat: parseInt(ft[7]) || 0,
              });
            }
          }
        }
        i++;
      }
    }
    i++;
  }
  return dwk;
}

// ─────────────────────────────────────────────
//  Scene Builder
// ─────────────────────────────────────────────
let dwkGroup   = null;
let dwkVisible = false;
let dwkPinned  = false;
let dwkState   = 'closed';  // aktuell angezeigter Zustand: 'closed' | 'open1' | 'open2'

function buildDWKMesh(dwk) {
  // Altes DWK-Mesh entfernen
  if (dwkGroup) {
    scene.remove(dwkGroup);
    dwkGroup.traverse(c => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    });
    dwkGroup = null;
  }

  const totalFaces = dwk.meshNodes.reduce((s, n) => s + n.faces.length, 0);
  if (totalFaces === 0 && dwk.dpNodes.length === 0) {
    logWarn(L('dwk_no_geom'));
    return;
  }

  dwkGroup = new THREE.Group();
  dwkGroup.name = 'dwk_' + dwk.name;
  // NWN ist Z-up, Three.js ist Y-up — gleiche Korrektur wie WOK und MDL
  dwkGroup.rotation.x = -Math.PI / 2;

  // ── Walk-Geometry-Meshes (pro Zustand) ───────────────────────────────────
  for (const node of dwk.meshNodes) {
    if (node.verts.length === 0 || node.faces.length === 0) continue;

    const [px, py, pz] = node.position;
    const posArr = [];

    for (const face of node.faces) {
      for (const vi of face.v) {
        const v = node.verts[vi];
        if (!v) continue;
        posArr.push(v[0] + px, v[1] + py, v[2] + pz);
      }
    }

    if (posArr.length === 0) continue;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
    geo.computeVertexNormals();

    // Gefüllte Fläche — Cyan/halbtransparent
    const fillMat = new THREE.MeshBasicMaterial({
      color:       DWK_COLORS.wg,
      transparent: true,
      opacity:     0.25,
      side:        THREE.DoubleSide,
      depthWrite:  false,
    });
    const fillMesh = new THREE.Mesh(geo, fillMat);
    fillMesh.userData.dwkType  = 'wg';
    fillMesh.userData.dwkState = node.state;
    dwkGroup.add(fillMesh);

    // Kanten
    const edges   = new THREE.EdgesGeometry(geo);
    const lineMat = new THREE.LineBasicMaterial({
      color:       DWK_COLORS.wg,
      transparent: true,
      opacity:     0.75,
    });
    const lineSegs = new THREE.LineSegments(edges, lineMat);
    lineSegs.userData.dwkType  = 'wg';
    lineSegs.userData.dwkState = node.state;
    dwkGroup.add(lineSegs);
  }

  // ── Door-Position-Marker — kleine Rauten wie PWK IoP ────────────────────
  for (const dp of dwk.dpNodes) {
    const [px, py, pz] = dp.position;

    const r = 0.08, h = 0.12;
    const dpVerts = [
      // Obere 4 Dreiecke
      px, py+h, pz,   px+r, py, pz,   px,   py, pz+r,
      px, py+h, pz,   px,   py, pz+r, px-r, py, pz,
      px, py+h, pz,   px-r, py, pz,   px,   py, pz-r,
      px, py+h, pz,   px,   py, pz-r, px+r, py, pz,
      // Untere 4 Dreiecke
      px, py-h, pz,   px,   py, pz+r, px+r, py, pz,
      px, py-h, pz,   px-r, py, pz,   px,   py, pz+r,
      px, py-h, pz,   px,   py, pz-r, px-r, py, pz,
      px, py-h, pz,   px+r, py, pz,   px,   py, pz-r,
    ];
    const dpGeo = new THREE.BufferGeometry();
    dpGeo.setAttribute('position', new THREE.Float32BufferAttribute(dpVerts, 3));
    dpGeo.computeVertexNormals();

    const dpMat = new THREE.MeshBasicMaterial({
      color:       DWK_COLORS.dp,
      transparent: true,
      opacity:     0.85,
      side:        THREE.DoubleSide,
      depthWrite:  false,
    });
    const dpMesh = new THREE.Mesh(dpGeo, dpMat);
    dpMesh.userData.dwkType  = 'dp';
    dpMesh.userData.dwkState = dp.state;
    dpMesh.userData.dpName   = dp.name;
    dwkGroup.add(dpMesh);

    // Kreuz-Linie als zusätzlicher Marker
    const crossPts = [
      px - r*1.5, py, pz,   px + r*1.5, py, pz,
      px, py, pz - r*1.5,   px, py, pz + r*1.5,
      px, py - h*1.5, pz,   px, py + h*1.5, pz,
    ];
    const crossGeo = new THREE.BufferGeometry();
    crossGeo.setAttribute('position', new THREE.Float32BufferAttribute(crossPts, 3));
    const crossMat  = new THREE.LineBasicMaterial({ color: DWK_COLORS.dp });
    const crossLines = new THREE.LineSegments(crossGeo, crossMat);
    crossLines.userData.dwkType  = 'dp';
    crossLines.userData.dwkState = dp.state;
    dwkGroup.add(crossLines);
  }

  // Initialen Zustand anwenden
  _applyDwkState();

  if (dwkPinned) {
    dwkVisible = true;
    const btn = document.getElementById('btn-dwk');
    if (btn) { btn.classList.add('active'); btn.disabled = false; }
  }
  dwkGroup.visible = dwkVisible;
  scene.add(dwkGroup);
  buildDwkColorPanel();
  _updateDwkStateButtons();

  logInfo(fmt('dwk_loaded', {
    nodes: dwk.meshNodes.length,
    faces: totalFaces,
    dp:    dwk.dpNodes.length,
  }));
}

// Zeigt nur Kinder des aktuell gewählten Zustands
function _applyDwkState() {
  if (!dwkGroup) return;
  dwkGroup.traverse(child => {
    if (!child.userData.dwkState) return;  // Root-Group oder unmarkierte Objekte
    child.visible = (child.userData.dwkState === dwkState);
  });
}

// Zustand wechseln (closed / open1 / open2)
function setDWKState(state) {
  dwkState = state;
  _applyDwkState();
  _updateDwkStateButtons();
}

// State-Buttons im UI hervorheben
function _updateDwkStateButtons() {
  for (const s of ['closed', 'open1', 'open2']) {
    const btn = document.getElementById('dwk-state-' + s);
    if (btn) btn.classList.toggle('active', s === dwkState);
  }
}

function toggleDWK() {
  if (!dwkGroup) return;
  dwkVisible = !dwkVisible;
  dwkGroup.visible = dwkVisible;
  const btn = document.getElementById('btn-dwk');
  if (btn) btn.classList.toggle('active', dwkVisible);
}

function toggleDwkPin() {
  dwkPinned = !dwkPinned;
  const pin = document.getElementById('btn-dwk-pin');
  if (pin) pin.classList.toggle('pinned', dwkPinned);
  if (pin) pin.title = dwkPinned
    ? L('dwk_pinned_on')
    : L('dwk_pin_title');
}
