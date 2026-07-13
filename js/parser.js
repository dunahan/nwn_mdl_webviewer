/* ═══════════════════════════════════════════════
   NWN MDL Viewer — MDL Parser
   (parseMDL, parseNode, parseFullAnimNode)
   ═══════════════════════════════════════════════ */

function parseMDL(text) {
  // Line-Endings normalisieren
  const rawLines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  // Inline-Kommentare (# ...) entfernen
  const lines = rawLines.map(l => { const c = l.indexOf('#'); return c >= 0 ? l.substring(0, c) : l; });

  const model = { name: '', supermodel: '', classification: 'unknown', nodes: [], animCount: 0, animations: [] };
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();
    
    // Leere Zeilen sofort überspringen
    if (!trimmed) {
      i++;
      continue;
    }

    // Zeile genau EINMAL splitten und den Key extrahieren
    const t = trimmed.split(/\s+/).filter(p => p.length > 0);
    const k = (t[0] || '').toLowerCase();

    if (k === 'newmodel')            model.name = t[1] || 'unknown';
    else if (k === 'setsupermodel')  model.supermodel = t[2] || '';
    else if (k === 'classification') model.classification = t[1] || 'unknown';
    else if (k === 'setanimationscale') model.animationScale = parseFloat(t[1]) || 1.0;
    else if (k === 'beginmodelgeom') {
      i++;
      while (i < lines.length) {
        const geomTrimmed = lines[i].trim();
        if (!geomTrimmed) { i++; continue; }

        const geomT = geomTrimmed.split(/\s+/).filter(p => p.length > 0);
        const geomK = (geomT[0] || '').toLowerCase();

        if (geomK === 'endmodelgeom') {
          break;
        }
        if (geomK === 'node') {
          const result = parseNode(lines, i);
          model.nodes.push(result.node);
          i = result.next;
          continue; // parseNode erhöht den Index bereits passend
        }
        i++;
      }
    } else if (k === 'newanim') {
      model.animCount++;
      const animName = t[1] || '';
      
      // Länge und Transtime aus den nächsten Zeilen vorauslesen
      let length = 0, transtime = 0;
      const peek = Math.min(i + 4, lines.length);
      for (let p = i + 1; p < peek; p++) {
        const pt = lines[p].trim().split(/\s+/).filter(x => x.length > 0);
        if (pt[0] === 'length')    length   = parseFloat(pt[1]) || 0;
        if (pt[0] === 'transtime') transtime = parseFloat(pt[1]) || 0;
      }
      
      const anim = { name: animName, length, transtime, nodes: {} };
      i++;
      
      while (i < lines.length) {
        const animTrimmed = lines[i].trim();
        if (!animTrimmed) { i++; continue; }

        const animT = animTrimmed.split(/\s+/).filter(x => x.length > 0);
        const animK = (animT[0] || '').toLowerCase();

        if (animK === 'doneanim') {
          break;
        }
        if (animK === 'node') {
          const result = parseFullAnimNode(lines, i);
          anim.nodes[result.name] = result.data;
          
          // Rest-Pose aus der ersten Animation (Zeitpunkt 0) sichern
          if (model.animCount === 1 && (
              result.data.oriKeys.length > 0 ||
              result.data.posKeys.length > 0 ||
              result.data.scaleKeys.length > 0)) {
            if (!model.restPose) model.restPose = {};
            const firstOri   = result.data.oriKeys[0];
            const firstPos   = result.data.posKeys[0];
            const firstScale = result.data.scaleKeys[0];
            model.restPose[result.name] = {
              orientation: firstOri   ? [firstOri.ax, firstOri.ay, firstOri.az, firstOri.angle] : null,
              position:    firstPos   ? [firstPos.x, firstPos.y, firstPos.z] : null,
              scale:       firstScale ? firstScale.s : null,
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

// Liest alle Keyframes eines Animations-Knotens.
function parseFullAnimNode(lines, start) {
  const hdr = lines[start].trim().split(/\s+/);
  const name = hdr[2] || '';
  const data = {
    posKeys: [], oriKeys: [], scaleKeys: [], emitterKeys: {},
    samplePeriod: 0, animVerts: [], animTverts: [],
    danglyDisplacement: null,
    danglyPeriod:       null,
    danglyTightness:    null,
  };
  let i = start + 1;

  function tok(idx) { return lines[idx].trim().split(/\s+/).filter(x => x.length > 0); }
  function num(s)   { const v = parseFloat(s); return isNaN(v) ? 0 : v; }

  const EMITTER_KEY_COLS = {
    birthrate: 1, velocity: 1, randvel: 1, spread: 1,
    grav: 1, drag: 1, fps: 1, mass: 1, lifeexp: 1, particlerot: 1,
    alphastart: 1, alphamid: 1, alphaend: 1,
    sizestart: 1, sizemid: 0, sizeend: 1,
    colorstart: 3, colormid: 3, colorend: 3,
  };

  function readAllKeys(startIdx, minCols, count) {
    const keys = [];
    let j = startIdx, read = 0;
    while (j < lines.length) {
      const t2 = tok(j);
      const k0 = (t2[0] || '').toLowerCase();
      if (k0 === 'endlist') { j++; break; }
      if (isNaN(parseFloat(t2[0])) && t2[0] !== '') break;
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
    } else if (k === 'scalekey') {
      const count = (t.length > 1 && !isNaN(parseInt(t[1]))) ? parseInt(t[1]) : 0;
      const res = readAllKeys(i + 1, 1, count);
      data.scaleKeys = res.keys.map(k => ({ t: k.t, s: k.vals[0] }));
      i = res.next;
      continue;
    } else if (k.endsWith('key')) {
      const baseName = k.slice(0, -3);
      const cols  = EMITTER_KEY_COLS[baseName] ?? 1;
      const count = (t.length > 1 && !isNaN(parseInt(t[1]))) ? parseInt(t[1]) : 0;
      const res = readAllKeys(i + 1, cols, count);
      data.emitterKeys[baseName] = res.keys;
      i = res.next;
      continue;
    } else if (k === 'sampleperiod') {
      data.samplePeriod = parseFloat(t[1]) || 0;
    } else if (k === 'displacement') {
      data.danglyDisplacement = parseFloat(t[1]) || 0;
    } else if (k === 'period') {
      data.danglyPeriod       = parseFloat(t[1]) || 0;
    } else if (k === 'tightness') {
      data.danglyTightness    = parseFloat(t[1]) || 0;
    } else if (k === 'animverts') {
      const count = parseInt(t[1]) || 0;
      data.animVerts = [];
      for (let j = 0; j < count; j++) {
        i++;
        if (i >= lines.length) break;
        const vt = tok(i);
        if (vt.length >= 3) data.animVerts.push([parseFloat(vt[0])||0, parseFloat(vt[1])||0, parseFloat(vt[2])||0]);
      }
    } else if (k === 'animtverts') {
      const count = parseInt(t[1]) || 0;
      data.animTverts = [];
      for (let j = 0; j < count; j++) {
        i++;
        if (i >= lines.length) break;
        const vt = tok(i);
        if (vt.length >= 2) data.animTverts.push([parseFloat(vt[0])||0, parseFloat(vt[1])||0]);
      }
    }
    i++;
  }
  return { name, data, next: i };
}

// Abwärtskompatibilität
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

// Liest die statische Geometrie eines Knotens ein
function parseNode(lines, start) {
  const hdr = lines[start].trim().split(/\s+/);
  const node = {
    type: (hdr[1] || 'dummy').toLowerCase(),
    name: hdr[2] || 'node',
    parent: 'NULL',
    position: [0, 0, 0],
    orientation: [0, 0, 0, 1],
    scale: 1,
    bitmap: '',
    materialname: '',
    textures: {},
    renderhint: '',
    verts: [], tverts: [], normals: [], tangents: [], faces: [],
    ambient: [0.2, 0.2, 0.2],
    diffuse: [0.8, 0.8, 0.8],
    specular: [0, 0, 0],
    shininess: 0,
    render: 1,
    alpha: 1.0,
    selfIllumColor: null,
    tilefade: 0,
    transparencyhint: 0,
    emitterTexture: '',
    blend:          '',
    update:         '',
    renderMode:     '',
    xgrid: 1, ygrid: 1,
    xsize: 0, ysize: 0,
    alphaStart: 1, alphaMid: 1, alphaEnd: 0,
    colorStart: [1,1,1], colorMid: [1,1,1], colorEnd: [1,1,1],
    sizeStart: 1, sizeMid: 0, sizeEnd: 1,
    birthrate:  0,
    lifeExp:    1,
    mass:       0,
    velocity:   0,
    randvel:    0,
    spread:     0,
    grav:       0,
    drag:       0,
    fps:        0,
    frameStart: 0,
    frameEnd:   0,
    chunkName:  '',
    lightColor:         [1, 1, 1],
    lightRadius:         5.0,
    lightMultiplier:     1.0,
    lightAmbientOnly:    0,
    lightIsDynamic:      1,
    lightNDynamicType:   0,
    lightAffectDynamic:  1,
    lightPriority:       5,
    lightFadingLight:    1,
    lightShadow:         0,
    lightGenerateFlare:  0,
    lightFlareRadius:    0,
    danglyPeriod:        1.0,
    danglyTightness:     1.0,
    danglyDisplacement:  0.5,
    constraints:         [],
    vertexWeights:       []
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

    if      (k === 'parent')            node.parent = t[1] || 'NULL';
    else if (k === 'position')          node.position = [num(t[1]), num(t[2]), num(t[3])];
    else if (k === 'orientation')       node.orientation = [num(t[1]), num(t[2]), num(t[3]), num(t[4])];
    else if (k === 'scale')             node.scale = num(t[1]) || 1;
    else if (k === 'bitmap')            node.bitmap = (t[1] || '').toLowerCase();
    else if (k === 'materialname')      node.materialname = (t[1] || '').toLowerCase();
    else if (/^texture\d+$/.test(k)) {
      const idx = parseInt(k.replace('texture', ''));
      if (!isNaN(idx)) {
        const val = (t[1] || '').toLowerCase();
        node.textures[idx] = (val === 'null' || val === '') ? null : val;
      }
    }
    else if (k === 'renderhint')        node.renderhint = t[1] || '';
    else if (k === 'ambient')           node.ambient = [num(t[1]), num(t[2]), num(t[3])];
    else if (k === 'diffuse')           node.diffuse = [num(t[1]), num(t[2]), num(t[3])];
    else if (k === 'specular')          node.specular = [num(t[1]), num(t[2]), num(t[3])];
    else if (k === 'shininess')         node.shininess = num(t[1]);
    else if (k === 'render') {
      if (node.type === 'emitter') node.renderMode = t[1] || '';
      else node.render = parseInt(t[1]) || 0;
    }
    else if (k === 'alpha')             node.alpha = num(t[1]);
    else if (k === 'selfillumcolor' || k === 'setfillumcolor')    node.selfIllumColor = [num(t[1]), num(t[2]), num(t[3])];
    else if (k === 'tilefade')          node.tilefade = parseInt(t[1]) || 0;
    else if (k === 'transparencyhint')  node.transparencyhint = parseInt(t[1]) || 0;
    else if (k === 'texture' && node.type === 'emitter') node.emitterTexture = (t[1]||'').toLowerCase();
    else if (k === 'blend')             node.blend      = t[1] || '';
    else if (k === 'update')            node.update     = t[1] || '';
    else if (k === 'xgrid')             node.xgrid      = parseInt(t[1]) || 1;
    else if (k === 'ygrid')             node.ygrid      = parseInt(t[1]) || 1;
    else if (k === 'xsize')             node.xsize      = num(t[1]);
    else if (k === 'ysize')             node.ysize      = num(t[1]);
    else if (k === 'alphastart')        node.alphaStart = num(t[1]);
    else if (k === 'alphamid')          node.alphaMid   = num(t[1]);
    else if (k === 'alphaend')          node.alphaEnd   = num(t[1]);
    else if (k === 'colorstart')        node.colorStart = [num(t[1]), num(t[2]), num(t[3])];
    else if (k === 'colormid')          node.colorMid   = [num(t[1]), num(t[2]), num(t[3])];
    else if (k === 'colorend')          node.colorEnd   = [num(t[1]), num(t[2]), num(t[3])];
    else if (k === 'sizestart')         node.sizeStart  = num(t[1]);
    else if (k === 'sizemid')           node.sizeMid    = num(t[1]);
    else if (k === 'sizeend')           node.sizeEnd    = num(t[1]);
    else if (k === 'birthrate')         node.birthrate  = num(t[1]);
    else if (k === 'lifeexp')           node.lifeExp    = num(t[1]);
    else if (k === 'mass')              node.mass       = num(t[1]);
    else if (k === 'velocity')          node.velocity   = num(t[1]);
    else if (k === 'randvel')           node.randvel    = num(t[1]);
    else if (k === 'spread')            node.spread     = num(t[1]);
    else if (k === 'grav')              node.grav       = num(t[1]);
    else if (k === 'drag')              node.drag       = num(t[1]);
    else if (k === 'fps')               node.fps        = num(t[1]);
    else if (k === 'framestart')        node.frameStart = parseInt(t[1]) || 0;
    else if (k === 'frameend')          node.frameEnd   = parseInt(t[1]) || 0;
    else if (k === 'chunkname')         node.chunkName  = (t[1]||'').toLowerCase();
    else if (k === 'color'         && node.type === 'light') node.lightColor        = [num(t[1]), num(t[2]), num(t[3])];
    else if (k === 'radius'        && node.type === 'light') node.lightRadius        = num(t[1]);
    else if (k === 'multiplier')                             node.lightMultiplier    = num(t[1]);
    else if (k === 'ambientonly')                            node.lightAmbientOnly   = parseInt(t[1]) || 0;
    else if (k === 'isdynamic')                              node.lightIsDynamic     = parseInt(t[1]) || 0;
    else if (k === 'ndynamictype')                           node.lightNDynamicType  = parseInt(t[1]) || 0;
    else if (k === 'affectdynamic')                          node.lightAffectDynamic = parseInt(t[1]) || 0;
    else if (k === 'lightpriority')                          node.lightPriority      = parseInt(t[1]) || 5;
    else if (k === 'fadinglight')                            node.lightFadingLight   = parseInt(t[1]) || 1;
    else if (k === 'shadow'        && node.type === 'light') node.lightShadow        = parseInt(t[1]) || 0;
    else if (k === 'generateflare')                          node.lightGenerateFlare = parseInt(t[1]) || 0;
    else if (k === 'flareradius')                            node.lightFlareRadius   = num(t[1]);
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
    } else if (k === 'tangents') {
      const count = parseInt(t[1]) || 0;
      for (let j = 0; j < count; j++) {
        i++;
        if (i >= lines.length) break;
        const vt = tok(i);
        if (vt.length >= 9) node.tangents.push([
          num(vt[0]), num(vt[1]), num(vt[2]),
          num(vt[3]), num(vt[4]), num(vt[5]),
          num(vt[6]), num(vt[7]), num(vt[8]),
        ]);
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
    } else if (k === 'period')         node.danglyPeriod       = num(t[1]);
    else if (k === 'tightness')        node.danglyTightness    = num(t[1]);
    else if (k === 'displacement')     node.danglyDisplacement = num(t[1]);
    else if (k === 'constraints') {
      const count = parseInt(t[1]) || 0;
      node.constraints = [];
      for (let j = 0; j < count; j++) {
        i++;
        if (i >= lines.length) break;
        node.constraints.push((parseFloat(lines[i].trim()) || 0) / 255.0);
      }
    } else if (k === 'weights') {
      const count = parseInt(t[1]) || 0;
      node.vertexWeights = [];
      for (let j = 0; j < count; j++) {
        i++;
        if (i >= lines.length) break;
        const wt = tok(i);
        const pairs = [];
        for (let w = 0; w + 1 < wt.length; w += 2) {
          const bone   = wt[w];
          const weight = parseFloat(wt[w + 1]) || 0;
          if (bone && weight > 0) pairs.push({ bone, weight });
        }
        node.vertexWeights.push(pairs);
      }
    }
    i++;
  }
  return { node, next: i };
}

// Mathe-Brücke für NWN Orientierungen
function axisAngleToQuat(ax, ay, az, angle) {
  const len = Math.sqrt(ax*ax + ay*ay + az*az);
  if (len < 1e-6 || Math.abs(angle) < 1e-6) {
    return new THREE.Quaternion(0, 0, 0, 1);
  }
  const half = angle / 2;
  const s = Math.sin(half) / len;
  return new THREE.Quaternion(ax * s, ay * s, az * s, Math.cos(half));
}