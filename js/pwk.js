/* ═══════════════════════════════════════════════
   NWN MDL Viewer — PWK Placeable Walk Geometry
   Parser & Renderer
   ═══════════════════════════════════════════════

   PWK Nodes:
     trimesh  *_wg      → Walk Geometry (Blocking area, Material 7 = NonWalk)
     dummy    IoP_* → Interaction Points (Usage positions)

   Coordinate system: NWN is Z-up → same -Math.PI/2 correction
   as WOK and MDL.
   ═══════════════════════════════════════════════ */

// ─────────────────────────────────────────────
//  Colors for PWK elements (mutable for dropdown)
// ─────────────────────────────────────────────
const PWK_COLORS = {
  wg:  0x8833ff,   // Walk Geometry — Blocking area (Purple)
  iop: 0xffcc00,   // Interaction Point — Usage marker (Gold)
};

function numToHex(n) { return '#' + n.toString(16).padStart(6, '0'); }

// Live color update for PWK meshes
function updatePwkColor(type, hexStr) {
  PWK_COLORS[type] = parseInt(hexStr.replace('#', ''), 16);
  if (!pwkGroup) return;
  pwkGroup.traverse(child => {
    if (child.userData.pwkType === type && child.material) {
      child.material.color.set(hexStr);
    }
  });
}

// Show PWK panel in dropdown and set initial values
function buildPwkColorPanel() {
  const section = document.getElementById('cdrop-pwk-section');
  const empty   = document.getElementById('cdrop-empty');
  const wgInput = document.getElementById('cpwk-wg');
  const iopInput= document.getElementById('cpwk-iop');
  if (!section) return;
  if (wgInput)  wgInput.value  = numToHex(PWK_COLORS.wg);
  if (iopInput) iopInput.value = numToHex(PWK_COLORS.iop);
  section.style.display = 'block';
  if (empty) empty.style.display = 'none';
}

// ─────────────────────────────────────────────
//  Parser
// ─────────────────────────────────────────────
function parsePWK(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const pwk = { name: '', meshNodes: [], iop: [] };

  let i = 0;
  function tok(idx) { return lines[idx].trim().split(/\s+/).filter(x => x.length > 0); }
  function key(idx) { return (tok(idx)[0] || '').toLowerCase(); }
  function num(s)   { const v = parseFloat(s); return isNaN(v) ? 0 : v; }

  // Derive filename from the first comment block or node names
  // (PWK has no "beginwalkmeshgeom" — name is in the parent reference)

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
        orientation: [0, 0, 0, 0],  // axis-angle like MDL
        wirecolor:   [1, 0, 0],
        verts:       [],
        faces:       [],
      };

      i++;
      while (i < lines.length) {
        const nt = tok(i);
        const nk = (nt[0] || '').toLowerCase();

        if (nk === 'endnode') {
          // Type routing: trimesh → Walk Geometry, dummy with IoP prefix → Interaction Point
          if (nodeType === 'trimesh') {
            pwk.meshNodes.push(node);
            // Derive root name from parent (if not already set)
            if (!pwk.name && node.parent) pwk.name = node.parent;
          } else if (nodeType === 'dummy' && nodeName.toLowerCase().startsWith('iop_')) {
            pwk.iop.push(node);
            if (!pwk.name && node.parent) pwk.name = node.parent;
          }
          break;
        }

        if      (nk === 'parent')      node.parent      = nt[1] || '';
        else if (nk === 'position')    node.position    = [num(nt[1]), num(nt[2]), num(nt[3])];
        else if (nk === 'orientation') node.orientation = [num(nt[1]), num(nt[2]), num(nt[3]), num(nt[4])];
        else if (nk === 'wirecolor')   node.wirecolor   = [num(nt[1]), num(nt[2]), num(nt[3])];
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
  return pwk;
}

// ─────────────────────────────────────────────
//  Scene Builder
// ─────────────────────────────────────────────
let pwkGroup   = null;
let pwkVisible = false;
let pwkPinned  = false;  // Pin flag: automatically show PWK on load

function buildPWKMesh(pwk) {
  // Remove old PWK mesh
  if (pwkGroup) {
    scene.remove(pwkGroup);
    pwkGroup.traverse(c => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    });
    pwkGroup = null;
  }

  const totalFaces = pwk.meshNodes.reduce((s, n) => s + n.faces.length, 0);
  if (totalFaces === 0 && pwk.iop.length === 0) {
    logWarn(L('pwk_no_geom'));
    return;
  }

  pwkGroup = new THREE.Group();
  pwkGroup.name = 'pwk_' + pwk.name;
  // NWN is Z-up, Three.js is Y-up — same correction as WOK and MDL
  pwkGroup.rotation.x = -Math.PI / 2;

  // ── Walk Geometry Meshes ──────────────────────────────────────────
  for (const node of pwk.meshNodes) {
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

    // Filled surface — purple/semi-transparent
    const fillMat = new THREE.MeshBasicMaterial({
      color:      PWK_COLORS.wg,
      transparent: true,
      opacity:    0.30,
      side:       THREE.DoubleSide,
      depthWrite: false,
    });
    const fillMesh = new THREE.Mesh(geo, fillMat);
    fillMesh.userData.pwkType = 'wg';
    pwkGroup.add(fillMesh);

    // Edges
    const edges   = new THREE.EdgesGeometry(geo);
    const lineMat = new THREE.LineBasicMaterial({
      color:       PWK_COLORS.wg,
      transparent: true,
      opacity:     0.80,
    });
    const lineSegs = new THREE.LineSegments(edges, lineMat);
    lineSegs.userData.pwkType = 'wg';
    pwkGroup.add(lineSegs);
  }

  // ── Interaction Points — small diamond markers ─────────────────────
  for (const iop of pwk.iop) {
    const [px, py, pz] = iop.position;

    // Diamond from 6 vertices (octahedron shape, compact)
    const r = 0.08;   // Radius of the marker
    const h = 0.12;   // Height top/bottom
    const iopVerts = [
      // Sides (4 triangles)
      px,  py+h, pz,    px+r, py, pz,   px,   py, pz+r,
      px,  py+h, pz,    px,   py, pz+r, px-r, py, pz,
      px,  py+h, pz,    px-r, py, pz,   px,   py, pz-r,
      px,  py+h, pz,    px,   py, pz-r, px+r, py, pz,
      // Bottom
      px,  py-h, pz,    px,   py, pz+r, px+r, py, pz,
      px,  py-h, pz,    px-r, py, pz,   px,   py, pz+r,
      px,  py-h, pz,    px,   py, pz-r, px-r, py, pz,
      px,  py-h, pz,    px+r, py, pz,   px,   py, pz-r,
    ];

    const iopGeo = new THREE.BufferGeometry();
    iopGeo.setAttribute('position', new THREE.Float32BufferAttribute(iopVerts, 3));
    iopGeo.computeVertexNormals();

    const iopMat = new THREE.MeshBasicMaterial({
      color:      PWK_COLORS.iop,
      transparent: true,
      opacity:    0.85,
      side:       THREE.DoubleSide,
      depthWrite: false,
    });
    const iopMesh = new THREE.Mesh(iopGeo, iopMat);
    iopMesh.userData.pwkType = 'iop';
    iopMesh.userData.iopName = iop.name;
    pwkGroup.add(iopMesh);

    // Cross line as additional marker (visible even from a distance)
    const crossPts = [
      px - r*1.5, py, pz,   px + r*1.5, py, pz,
      px, py, pz - r*1.5,   px, py, pz + r*1.5,
      px, py - h*1.5, pz,   px, py + h*1.5, pz,
    ];
    const crossGeo = new THREE.BufferGeometry();
    crossGeo.setAttribute('position', new THREE.Float32BufferAttribute(crossPts, 3));
    const crossMat = new THREE.LineBasicMaterial({ color: PWK_COLORS.iop });
    const crossLines = new THREE.LineSegments(crossGeo, crossMat);
    crossLines.userData.pwkType = 'iop';
    pwkGroup.add(crossLines);
  }

  // If the pin is active, automatically show PWK
  if (pwkPinned) {
    pwkVisible = true;
    const btn = document.getElementById('btn-pwk');
    if (btn) { btn.classList.add('active'); btn.disabled = false; }
  }
  pwkGroup.visible = pwkVisible;
  scene.add(pwkGroup);
  buildPwkColorPanel();

  logInfo(fmt('pwk_loaded', {
    nodes: pwk.meshNodes.length,
    faces: totalFaces,
    iop:   pwk.iop.length
  }));
}

function togglePWK() {
  if (!pwkGroup) return;
  pwkVisible = !pwkVisible;
  pwkGroup.visible = pwkVisible;
  const btn = document.getElementById('btn-pwk');
  if (btn) btn.classList.toggle('active', pwkVisible);
}

function togglePwkPin() {
  pwkPinned = !pwkPinned;
  const pin = document.getElementById('btn-pwk-pin');
  if (pin) pin.classList.toggle('pinned', pwkPinned);
  if (pin) pin.title = pwkPinned
    ? L('pwk_pinned_on')
    : L('pwk_pin_title');
}
