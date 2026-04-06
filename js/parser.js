/* ═══════════════════════════════════════════════
   NWN MDL Viewer — MDL Parser
   (parseMDL, parseNode, parseFullAnimNode)
   ═══════════════════════════════════════════════ */

function parseMDL(text) {
  // Normalize line endings
  const rawLines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  // Strip inline comments (# ...)
  const lines = rawLines.map(l => { const c = l.indexOf('#'); return c >= 0 ? l.substring(0, c) : l; });

  const model = { name: '', supermodel: '', classification: 'unknown', nodes: [], animCount: 0, animations: [] };
  let i = 0;

  function tok(idx) {
    const parts = lines[idx].trim().split(/\s+/);
    return parts.filter(p => p.length > 0);
  }
  function key(idx) { return (tok(idx)[0] || '').toLowerCase(); }

  while (i < lines.length) {
    const k = key(i);
    const t = tok(i);
    if (k === 'newmodel')       model.name = t[1] || 'unknown';
    else if (k === 'setsupermodel') model.supermodel = t[2] || '';
    else if (k === 'classification') model.classification = t[1] || 'unknown';
    else if (k === 'beginmodelgeom') {
      i++;
      while (i < lines.length && key(i) !== 'endmodelgeom') {
        if (key(i) === 'node') {
          const result = parseNode(lines, i);
          model.nodes.push(result.node);
          i = result.next;
          continue;
        }
        i++;
      }
    } else if (k === 'newanim') {
      model.animCount++;
      const animName = t[1] || '';
      // Lies length und transtime aus den nächsten Zeilen
      let length = 0, transtime = 0;
      const peek = Math.min(i + 4, lines.length);
      for (let p = i + 1; p < peek; p++) {
        const pt = lines[p].trim().split(/\s+/);
        if (pt[0] === 'length')    length   = parseFloat(pt[1]) || 0;
        if (pt[0] === 'transtime') transtime = parseFloat(pt[1]) || 0;
      }
      const anim = { name: animName, length, transtime, nodes: {} };
      i++;
      while (i < lines.length) {
        const ak = key(i);
        if (ak === 'doneanim') break;
        if (ak === 'node') {
          const result = parseFullAnimNode(lines, i);
          anim.nodes[result.name] = result.data;
          // Rest-Pose aus erster Animation (Zeit=0)
          if (model.animCount === 1 && (result.data.oriKeys.length > 0 || result.data.posKeys.length > 0)) {
            if (!model.restPose) model.restPose = {};
            const firstOri = result.data.oriKeys[0];
            const firstPos = result.data.posKeys[0];
            model.restPose[result.name] = {
              orientation: firstOri ? [firstOri.ax, firstOri.ay, firstOri.az, firstOri.angle] : null,
              position:    firstPos ? [firstPos.x, firstPos.y, firstPos.z] : null,
            };
          }
          i = result.next;
          continue;
        }
        i++;
      }
      model.animations.push(anim);
    }
    i++;
  }
  if (!model.restPose) model.restPose = {};
  return model;
}

// Liest alle Keyframes eines Animations-Nodes.
// Gibt { name, data: { posKeys, oriKeys }, next } zurück.
// posKeys: [{t, x, y, z}, ...]
// oriKeys: [{t, ax, ay, az, angle}, ...]
function parseFullAnimNode(lines, start) {
  const hdr = lines[start].trim().split(/\s+/);
  const name = hdr[2] || '';
  const data = { posKeys: [], oriKeys: [] };
  let i = start + 1;

  function tok(idx) { return lines[idx].trim().split(/\s+/).filter(x => x.length > 0); }
  function num(s)   { const v = parseFloat(s); return isNaN(v) ? 0 : v; }

  function readAllKeys(startIdx, minCols, count) {
    const keys = [];
    let j = startIdx, read = 0;
    while (j < lines.length) {
      const t2 = tok(j);
      const k0 = (t2[0] || '').toLowerCase();
      if (k0 === 'endlist') { j++; break; }
      if (k0 === 'endnode' || k0 === 'node' || k0 === 'orientationkey' ||
          k0 === 'positionkey' || k0 === 'scalekey') break;
      if (t2.length >= minCols + 1) {
        const time = parseFloat(t2[0]);
        if (!isNaN(time)) keys.push({ t: time, vals: t2.slice(1, minCols + 1).map(num) });
        read++;
        if (count > 0 && read >= count) { j++; break; }
      }
      j++;
    }
    return { keys, next: j };
  }

  while (i < lines.length) {
    const t = tok(i);
    const k = (t[0] || '').toLowerCase();
    if (k === 'endnode') return { name, data, next: i + 1 };

    if (k === 'orientationkey') {
      const count = (t.length > 1 && !isNaN(parseInt(t[1]))) ? parseInt(t[1]) : 0;
      const res = readAllKeys(i + 1, 4, count);
      data.oriKeys = res.keys.map(k => ({ t: k.t, ax: k.vals[0], ay: k.vals[1], az: k.vals[2], angle: k.vals[3] }));
      i = res.next;
      continue;
    } else if (k === 'positionkey') {
      const count = (t.length > 1 && !isNaN(parseInt(t[1]))) ? parseInt(t[1]) : 0;
      const res = readAllKeys(i + 1, 3, count);
      data.posKeys = res.keys.map(k => ({ t: k.t, x: k.vals[0], y: k.vals[1], z: k.vals[2] }));
      i = res.next;
      continue;
    }
    i++;
  }
  return { name, data, next: i };
}

// Veraltet aber noch referenziert — Wrapper für Kompatibilität
function parseAnimNode(lines, start) {
  const res = parseFullAnimNode(lines, start);
  const firstOri = res.data.oriKeys[0];
  const firstPos = res.data.posKeys[0];
  return {
    name: res.name,
    restOrientation: firstOri ? [firstOri.ax, firstOri.ay, firstOri.az, firstOri.angle] : null,
    restPosition:    firstPos ? [firstPos.x, firstPos.y, firstPos.z] : null,
    next: res.next
  };
}

function parseNode(lines, start) {
  const hdr = lines[start].trim().split(/\s+/);
  const node = {
    type: (hdr[1] || 'dummy').toLowerCase(),
    name: hdr[2] || 'node',
    parent: 'NULL',
    position: [0, 0, 0],
    orientation: [0, 0, 0, 1],  // quaternion x y z w
    scale: 1,
    bitmap: '',
    verts: [], tverts: [], normals: [], faces: [],
    ambient: [0.2, 0.2, 0.2],
    diffuse: [0.8, 0.8, 0.8],
    specular: [0, 0, 0],
    shininess: 0,
    render: 1,
    alpha: 1.0,
    tilefade: 0,
    transparencyhint: 0,  // 0 = opak, 1 = Textur-Alpha nutzen (Decals, Splotches)
  };

  function tok(idx) { return lines[idx].trim().split(/\s+/).filter(x => x.length > 0); }
  function num(s) { const v = parseFloat(s); return isNaN(v) ? 0 : v; }

  let i = start + 1;
  while (i < lines.length) {
    const raw = lines[i].trim();
    if (raw === '' || raw.startsWith('#')) { i++; continue; }
    if (raw.toLowerCase() === 'endnode') return { node, next: i + 1 };

    const t = tok(i);
    const k = (t[0] || '').toLowerCase();

    if      (k === 'parent')      node.parent = t[1] || 'NULL';
    else if (k === 'position')    node.position = [num(t[1]), num(t[2]), num(t[3])];
    else if (k === 'orientation') node.orientation = [num(t[1]), num(t[2]), num(t[3]), num(t[4])];
    else if (k === 'scale')       node.scale = num(t[1]) || 1;
    else if (k === 'bitmap')      node.bitmap = (t[1] || '').toLowerCase();
    else if (k === 'ambient')     node.ambient = [num(t[1]), num(t[2]), num(t[3])];
    else if (k === 'diffuse')     node.diffuse = [num(t[1]), num(t[2]), num(t[3])];
    else if (k === 'specular')    node.specular = [num(t[1]), num(t[2]), num(t[3])];
    else if (k === 'shininess')   node.shininess = num(t[1]);
    else if (k === 'render')      node.render = parseInt(t[1]) || 0;
    else if (k === 'alpha')       node.alpha = num(t[1]);
    else if (k === 'tilefade')    node.tilefade = parseInt(t[1]) || 0;
    else if (k === 'transparencyhint') node.transparencyhint = parseInt(t[1]) || 0;
    else if (k === 'verts') {
      const count = parseInt(t[1]) || 0;
      for (let j = 0; j < count; j++) {
        i++;
        if (i >= lines.length) break;
        const vt = tok(i);
        if (vt.length >= 3) node.verts.push([num(vt[0]), num(vt[1]), num(vt[2])]);
      }
    } else if (k === 'tverts') {
      const count = parseInt(t[1]) || 0;
      for (let j = 0; j < count; j++) {
        i++;
        if (i >= lines.length) break;
        const vt = tok(i);
        if (vt.length >= 2) node.tverts.push([num(vt[0]), num(vt[1])]);
      }
    } else if (k === 'normals') {
      const count = parseInt(t[1]) || 0;
      for (let j = 0; j < count; j++) {
        i++;
        if (i >= lines.length) break;
        const vt = tok(i);
        if (vt.length >= 3) node.normals.push([num(vt[0]), num(vt[1]), num(vt[2])]);
      }
    } else if (k === 'faces') {
      const count = parseInt(t[1]) || 0;
      for (let j = 0; j < count; j++) {
        i++;
        if (i >= lines.length) break;
        const ft = tok(i);
        if (ft.length >= 7) {
          node.faces.push({
            v:  [parseInt(ft[0]), parseInt(ft[1]), parseInt(ft[2])],
            sg: parseInt(ft[3]) || 0,
            t:  [parseInt(ft[4]), parseInt(ft[5]), parseInt(ft[6])],
            sm: parseInt(ft[7]) || 0
          });
        }
      }
    } else if (k === 'constraints') {
      // danglymesh: ein Constraint-Wert pro Zeile (0=starr, 255=frei) — nur überspringen
      const count = parseInt(t[1]) || 0;
      for (let j = 0; j < count; j++) {
        i++;
        if (i >= lines.length) break;
      }
    }
    i++;
  }
  return { node, next: i };
}

// ─────────────────────────────────────────────
//  NWN Orientation: Achse-Winkel → Quaternion
//  NWN speichert (axis_x, axis_y, axis_z, winkel_rad)
//  NICHT als Quaternion-XYZW!
// ─────────────────────────────────────────────
function axisAngleToQuat(ax, ay, az, angle) {
  const len = Math.sqrt(ax*ax + ay*ay + az*az);
  if (len < 1e-6 || Math.abs(angle) < 1e-6) {
    return new THREE.Quaternion(0, 0, 0, 1); // Identität
  }
  const half = angle / 2;
  const s = Math.sin(half) / len;
  return new THREE.Quaternion(ax * s, ay * s, az * s, Math.cos(half));
}

// ─────────────────────────────────────────────
