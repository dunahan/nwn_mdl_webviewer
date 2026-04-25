/* ═══════════════════════════════════════════════
   NWN MDL Viewer — WOK Walkmesh Parser & Renderer
   ═══════════════════════════════════════════════ */

// ─────────────────────────────────────────────
//  Surface-Material-Definitionen (NWN Aurora)
// ─────────────────────────────────────────────
const WOK_SURFACE = {
  0:  { name: 'Nonwalk',      walkable: false },
  1:  { name: 'Walk',         walkable: true  },
  2:  { name: 'Dirt',         walkable: true  },
  3:  { name: 'Stone',        walkable: true  },
  4:  { name: 'Wood',         walkable: true  },
  5:  { name: 'Water',        walkable: true  },
  6:  { name: 'NonwalkGrass', walkable: false },
  7:  { name: 'Transparent',  walkable: false },
  8:  { name: 'Carpet',       walkable: true  },
  9:  { name: 'Metal',        walkable: true  },
  10: { name: 'Puddles',      walkable: true  },
  11: { name: 'Mud',          walkable: true  },
  12: { name: 'Leaves',       walkable: true  },
  13: { name: 'Lava',         walkable: false },
  14: { name: 'BottomlessPit',walkable: false },
  15: { name: 'DeepWater',    walkable: true  },
  16: { name: 'Door',         walkable: true  },
  17: { name: 'Snow',         walkable: true  },
  18: { name: 'Sand',         walkable: true  },
};

// Separat mutablees Farb-Objekt — wird vom Dropdown live verändert
const WOK_COLORS = {
  0:  0xff3333,
  1:  0x44dd44,
  2:  0xaa7744,
  3:  0x8899aa,
  4:  0xcc8844,
  5:  0x4488ff,
  6:  0xff6622,
  7:  0xff2222,
  8:  0xdd88cc,
  9:  0xaabbcc,
  10: 0x6699ff,
  11: 0x886644,
  12: 0x77bb44,
  13: 0xff4400,
  14: 0x220022,
  15: 0x224488,
  16: 0xffcc00,
  17: 0xeeeeff,
  18: 0xddcc88,
};

function wokSurface(id) {
  const s = WOK_SURFACE[id] || { name: 'Unknown(' + id + ')', walkable: false };
  return { ...s, color: WOK_COLORS[id] !== undefined ? WOK_COLORS[id] : 0xffffff };
}

// Live-Farbupdate für WOK — durchläuft wokGroup und setzt alle Materialien
function updateWokColor(matId, hexStr) {
  WOK_COLORS[matId] = parseInt(hexStr.replace('#', ''), 16);
  if (!wokGroup) return;
  wokGroup.traverse(child => {
    if (child.userData.wokMat === matId && child.material) {
      child.material.color.set(hexStr);
    }
  });
}

// WOK-Farbpanel im Dropdown befüllen (nur vorhandene matIds)
function buildWokColorPanel() {
  const list    = document.getElementById('cdrop-wok-list');
  const section = document.getElementById('cdrop-wok-section');
  const empty   = document.getElementById('cdrop-empty');
  if (!list || !section) return;

  const present = new Set();
  if (wokGroup) wokGroup.traverse(c => {
    if (c.userData.wokMat !== undefined) present.add(c.userData.wokMat);
  });

  if (present.size === 0) { section.style.display = 'none'; return; }

  list.innerHTML = '';
  for (const matId of [...present].sort((a, b) => a - b)) {
    const surf = wokSurface(matId);
    const hex  = '#' + (WOK_COLORS[matId] || 0xffffff).toString(16).padStart(6, '0');
    const row  = document.createElement('div');
    row.className = 'cdrop-row';
    row.innerHTML =
      `<label>${surf.name}</label>` +
      `<input type="color" value="${hex}" oninput="updateWokColor(${matId}, this.value)">`;
    list.appendChild(row);
  }
  section.style.display = 'block';
  if (empty) empty.style.display = 'none';
}

// ─────────────────────────────────────────────
//  Parser
// ─────────────────────────────────────────────
function parseWOK(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const wok = { name: '', nodes: [] };

  let i = 0;
  function tok(idx) {
    return lines[idx].trim().split(/\s+/).filter(x => x.length > 0);
  }
  function key(idx) { return (tok(idx)[0] || '').toLowerCase(); }
  function num(s)   { const v = parseFloat(s); return isNaN(v) ? 0 : v; }

  while (i < lines.length) {
    const t = tok(i);
    const k = key(i);

    if (k === 'beginwalkmeshgeom') {
      wok.name = t[1] || '';
    } else if (k === 'node') {
      // node aabb <nodename>
      const node = {
        name:      t[2] || '',
        parent:    '',
        position:  [0, 0, 0],
        wirecolor: [1, 0, 0],
        verts:     [],
        faces:     [],   // { v:[i0,i1,i2], sg, adj:[a0,a1,a2], mat }
      };
      i++;
      while (i < lines.length) {
        const nt = tok(i);
        const nk = nt[0]?.toLowerCase();
        if (nk === 'endnode') { wok.nodes.push(node); break; }

        // AABB-Baum beginnt (Zeilen-Block aus Bounding-Box-Daten).
        // Geometrie ist da bereits vollständig geparst — bis zum
        // endnode vorspulen, dann Node sichern und Schleife verlassen.
        if (nk === 'aabb') {
          while (i < lines.length) {    // bis endnode vorspulen …
            if (tok(i)[0]?.toLowerCase() === 'endnode') break;
            i++;
          }
          wok.nodes.push(node);          // … dann erst sichern
          break;
        }

        if (nk === 'parent')    node.parent    = nt[1] || '';
        else if (nk === 'position')  node.position  = [num(nt[1]), num(nt[2]), num(nt[3])];
        else if (nk === 'wirecolor') node.wirecolor = [num(nt[1]), num(nt[2]), num(nt[3])];
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
  return wok;
}

// ─────────────────────────────────────────────
//  Scene Builder — pro Surface-Material ein Mesh
// ─────────────────────────────────────────────
let wokGroup   = null;   // THREE.Group  (global, damit toggle funktioniert)
let wokVisible = false;
let wokPinned  = false;  // Pin-Flag: WOK beim Laden automatisch einblenden

function buildWalkMesh(wok) {
  // Altes Walkmesh entfernen
  if (wokGroup) {
    scene.remove(wokGroup);
    wokGroup.traverse(c => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    });
    wokGroup = null;
  }

  wokGroup = new THREE.Group();
  wokGroup.name = 'walkmesh_' + wok.name;
  // NWN ist Z-up, Three.js ist Y-up — identische Korrektur wie modelGroup in scene_build.js
  wokGroup.rotation.x = -Math.PI / 2;

  for (const node of wok.nodes) {
    if (node.verts.length === 0 || node.faces.length === 0) continue;

    // Faces nach Material gruppieren → ein Mesh pro Materialtyp
    const byMat = {};
    for (const face of node.faces) {
      const mid = face.mat;
      if (!byMat[mid]) byMat[mid] = [];
      byMat[mid].push(face);
    }

    // Node-Position aus dem WOK (entspricht dem MDL-Node-Offset)
    const [px, py, pz] = node.position;

    for (const [matIdStr, faces] of Object.entries(byMat)) {
      const matId  = parseInt(matIdStr);
      const surf   = wokSurface(matId);

      const posArr = [];
      for (const face of faces) {
        for (const vi of face.v) {
          const v = node.verts[vi];
          if (!v) continue;
          // WOK-Vertices sind relativ zur Node-Position
          posArr.push(v[0] + px, v[1] + py, v[2] + pz);
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
      geo.computeVertexNormals();

      // Gefüllte Fläche (halbtransparent, farbig nach Typ)
      const fillMat = new THREE.MeshBasicMaterial({
        color:       surf.color,
        transparent: true,
        opacity:     surf.walkable ? 0.25 : 0.40,
        side:        THREE.DoubleSide,
        depthWrite:  false,
      });
      const fillMesh = new THREE.Mesh(geo, fillMat);
      fillMesh.userData.wokMat = matId;
      wokGroup.add(fillMesh);

      // Kanten (Wireframe) als LineSegments — deutlich besser lesbar als WireframeGeometry
      const edges    = new THREE.EdgesGeometry(geo);
      const lineMat  = new THREE.LineBasicMaterial({
        color:   surf.color,
        opacity: surf.walkable ? 0.5 : 0.8,
        transparent: true,
      });
      const lineSegs = new THREE.LineSegments(edges, lineMat);
      lineSegs.userData.wokMat = matId;
      wokGroup.add(lineSegs);
    }
  }

  // Wenn die Pinnadel aktiv ist, Walkmesh automatisch einblenden
  if (wokPinned) {
    wokVisible = true;
    const btn = document.getElementById('btn-walkmesh');
    if (btn) { btn.classList.add('active'); btn.disabled = false; }
  }
  wokGroup.visible = wokVisible;
  scene.add(wokGroup);
  buildWokColorPanel();
  
  logInfo('Walkmesh geladen: ' + wok.nodes.length + ' Node(s), ' +
          wok.nodes.reduce((s, n) => s + n.faces.length, 0) + ' Faces');
}

function toggleWalkMesh() {
  if (!wokGroup) return;
  wokVisible = !wokVisible;
  wokGroup.visible = wokVisible;
  const btn = document.getElementById('btn-walkmesh');
  if (btn) btn.classList.toggle('active', wokVisible);
}

function toggleWokPin() {
  wokPinned = !wokPinned;
  const pin = document.getElementById('btn-walkmesh-pin');
  if (pin) pin.classList.toggle('pinned', wokPinned);
  // Tooltip aktualisieren
  if (pin) pin.title = wokPinned
    ? 'Walkmesh ist fixiert — bleibt beim Laden neuer Modelle erhalten'
    : 'Walkmesh beim nächsten Modell-Laden fixieren';
}