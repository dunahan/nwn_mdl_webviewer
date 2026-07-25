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
    if (k === 'newmodel')            model.name = t[1] || 'unknown';
    else if (k === 'setsupermodel')  model.supermodel = t[2] || '';
    else if (k === 'classification') model.classification = t[1] || 'unknown';
    else if (k === 'setanimationscale') model.animationScale = parseFloat(t[1]) || 1.0;
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
      // Read length and transtime from the next lines
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
          // Rest pose from first animation (time=0)
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

// Reads all keyframes of an animation node.
// Returns { name, data: { posKeys, oriKeys, emitterKeys }, next }.
// posKeys:     [{t, x, y, z}, ...]
// oriKeys:     [{t, ax, ay, az, angle}, ...]
// emitterKeys: { birthrate: [{t, vals:[v]}, ...], colorend: [{t, vals:[r,g,b]}, ...], ... }
function parseFullAnimNode(lines, start) {
  const hdr = lines[start].trim().split(/\s+/);
  const name = hdr[2] || '';
  const data = {
    posKeys: [], oriKeys: [], scaleKeys: [], emitterKeys: {},
    samplePeriod: 0, animVerts: [], animTverts: [],  // animmesh UV/vertex animation
    // Danglymesh per-animation overrides (null = not specified → fall back to geometry defaults)
    danglyDisplacement: null,
    danglyPeriod:       null,
    danglyTightness:    null,
  };
  let i = start + 1;

  function tok(idx) { return lines[idx].trim().split(/\s+/).filter(x => x.length > 0); }
  function num(s)   { const v = parseFloat(s); return isNaN(v) ? 0 : v; }

  // Number of data values per known emitter controller key
  // (anything not explicitly listed gets 1 value as fallback)
  const EMITTER_KEY_COLS = {
    birthrate: 1, velocity: 1, randvel: 1, spread: 1,
    grav: 1, drag: 1, fps: 1, mass: 1, lifeexp: 1, particlerot: 1,
    alphastart: 1, alphamid: 1, alphaend: 1,
    sizestart: 1, sizemid: 0, sizeend: 1,
    colorstart: 3, colormid: 3, colorend: 3,
    selfillumcolor: 3,   // NEW — für selfillumcolorkey / selfillumcolorbezierkey
  };

  // Every keyword (non-numeric token) ends the current data block.
  // endlist additionally consumes its own line.
  function readAllKeys(startIdx, minCols, count) {
    const keys = [];
    let j = startIdx, read = 0;
    while (j < lines.length) {
      const t2 = tok(j);
      const k0 = (t2[0] || '').toLowerCase();
      if (k0 === 'endlist') { j++; break; }
      // Every alphabetic keyword (new block or endnode) aborts
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
    } else if (k === 'positionbezierkey') {
      // value(3) + tangentIn(3) + tangentOut(3) = 9 Floats/Key
      const count = (t.length > 1 && !isNaN(parseInt(t[1]))) ? parseInt(t[1]) : 0;
      const res = readAllKeys(i + 1, 9, count);
      data.posKeys = res.keys.map(k => ({ t: k.t, x: k.vals[0], y: k.vals[1], z: k.vals[2] }));
      i = res.next;
      continue;
    } else if (k === 'scalebezierkey') {
      // value(1) + tangentIn(1) + tangentOut(1) = 3 Floats/Key
      const count = (t.length > 1 && !isNaN(parseInt(t[1]))) ? parseInt(t[1]) : 0;
      const res = readAllKeys(i + 1, 3, count);
      data.scaleKeys = res.keys.map(k => ({ t: k.t, s: k.vals[0] }));
      i = res.next;
      continue;
    } else if (k.endsWith('bezierkey')) {
      // ── Generic Bezier Controller Key (alphabezierkey, selfillumcolorbezierkey, …) ──
      // Format: <baseName>bezierkey <count>
      //           <time> <value...> <tangentIn...> <tangentOut...>
      // Only the value portion is adopted — the viewer interpolates linearly,
      // not cubic; therefore, the tangents are discarded rather than misinterpreted.
      const baseName = k.slice(0, -9);   // 'alphabezierkey' → 'alpha'
      const baseCols = EMITTER_KEY_COLS[baseName] ?? 1;
      const count = (t.length > 1 && !isNaN(parseInt(t[1]))) ? parseInt(t[1]) : 0;
      const res = readAllKeys(i + 1, baseCols * 3, count);
      data.emitterKeys[baseName] = res.keys.map(kk => ({ t: kk.t, vals: kk.vals.slice(0, baseCols) }));
      i = res.next;
      continue;
    } else if (k.endsWith('key')) {
      // ── Generic Emitter Controller Key ─────────────────────────────
      // Format: <baseName>key <count>
      //           <time> <val> [<val2> <val3>]
      //           ...
      const baseName = k.slice(0, -3);  // 'birthratekey' → 'birthrate'
      const cols  = EMITTER_KEY_COLS[baseName] ?? 1;
      const count = (t.length > 1 && !isNaN(parseInt(t[1]))) ? parseInt(t[1]) : 0;
      const res = readAllKeys(i + 1, cols, count);
      data.emitterKeys[baseName] = res.keys;
      i = res.next;
      continue;

    // ── animmesh: sampleperiod / animverts / animtverts ─────────────────
    // These fields are located in the animation node (not in the geometry node).
    // animtverts: numFrames x vertCount UV entries without timestamp;
    // Frame index = floor(time / samplePeriod) % numFrames.
    } else if (k === 'sampleperiod') {
      data.samplePeriod = parseFloat(t[1]) || 0;
    } else if (k === 'displacement') {
      // danglymesh per-animation override: Aurora stores these as signed floats;
      // negative values indicate an active (inverted/directional) effect.
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
      // Counter-based reading — 'endlist' afterwards is consumed by normal i++.
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

// Deprecated but still referenced — wrapper for compatibility
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
    materialname: '',
    textures: {},     // index → name (from MDL node, e.g., texture0, texture1 ...)
    renderhint: '',   // 'NormalAndSpecMapped' | 'NormalTangents' | ''
    verts: [], tverts: [], normals: [], tangents: [], faces: [],
    ambient: [0.2, 0.2, 0.2],
    diffuse: [0.8, 0.8, 0.8],
    specular: [0, 0, 0],
    shininess: 0,
    render: 1,
    alpha: 1.0,
    selfIllumColor: null, // [r,g,b] or null — only for EFFECT nodes
    tilefade: 0,
    transparencyhint: 0,  // 0 = opaque, 1 = use texture alpha (decals, splotches)
    // ── Emitter-specific Properties ──────────────────────────
    emitterTexture: '',   // "texture" in emitter nodes (particle texture)
    blend:          '',   // 'Normal' | 'Lighten' | 'Additive' | ...
    update:         '',   // 'Fountain' | 'Single' | 'Explosion' | ...
    renderMode:     '',   // 'Normal' | 'Billboard_to_Local_Z' | 'Linked' | ...
    xgrid: 1, ygrid: 1,   // Sprite sheet grid
    xsize: 0, ysize: 0,   // Emitter area in cm (spawn spread area)
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
    chunkName:  '',   // Chunk model for rock emitter (chunkName)
    // ── Light-specific Properties ─────────────────────────────────────────
    lightColor:         [1, 1, 1],  // [r, g, b] — light color
    lightRadius:         5.0,       // Range (falloff distance)
    lightMultiplier:     1.0,       // Intensity multiplier
    lightAmbientOnly:    0,         // 1 → AmbientLight, 0 → PointLight
    lightIsDynamic:      1,
    lightNDynamicType:   0,         // nDynamicType: 0=none, 1=dynamic, 2=dynamic+shadow
    lightAffectDynamic:  1,
    lightPriority:       5,
    lightFadingLight:    1,
    lightShadow:         0,
    lightGenerateFlare:  0,
    lightFlareRadius:    0,
    // ── Danglymesh-specific Properties ──────────────────────────────────────
    danglyPeriod:        1.0,   // Swing period in seconds
    danglyTightness:     1.0,   // Return force (stored for reference, unused in sine-wave sim)
    danglyDisplacement:  0.5,   // Maximum vertex displacement in NWN units
    constraints:         [],    // Per-vertex weights [0–1], normalised from MDL's 0–255
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
    else if (k === 'renderhint') {
      node.renderhint = t[1] || '';
    }
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
    // ── Emitter-Properties ──────────────────────────────────────────────
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
    // ── Light-Properties (only for node.type === 'light') ─────────────────────
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
      // Per vertex: tx ty tz  bx by bz  nx ny nz  (Tangent, Binormal, Normal — 3 floats each)
      const count = parseInt(t[1]) || 0;
      for (let j = 0; j < count; j++) {
        i++;
        if (i >= lines.length) break;
        const vt = tok(i);
        if (vt.length >= 9) node.tangents.push([
          num(vt[0]), num(vt[1]), num(vt[2]),  // T  — Tangents
          num(vt[3]), num(vt[4]), num(vt[5]),  // B  — Binormals
          num(vt[6]), num(vt[7]), num(vt[8]),  // N  — Normale (in Tangent-Space)
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
      // danglymesh: one weight per line (0=rigid, 255=free) — normalise to 0–1
      const count = parseInt(t[1]) || 0;
      node.constraints = [];
      for (let j = 0; j < count; j++) {
        i++;
        if (i >= lines.length) break;
        node.constraints.push((parseFloat(lines[i].trim()) || 0) / 255.0);
      }
    } else if (k === 'weights') {
      // skin node: one line per original vertex "BoneName Weight BoneName Weight ..."
      // Stored as node.vertexWeights[vi] = [{bone, weight}, ...]
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

// ─────────────────────────────────────────────
//  NWN Orientation: Axis-Angle → Quaternion
//  NWN stores (axis_x, axis_y, axis_z, angle_rad)
//  NOT as Quaternion-XYZW!
// ─────────────────────────────────────────────
function axisAngleToQuat(ax, ay, az, angle) {
  const len = Math.sqrt(ax*ax + ay*ay + az*az);
  if (len < 1e-6 || Math.abs(angle) < 1e-6) {
    return new THREE.Quaternion(0, 0, 0, 1); // Identity
  }
  const half = angle / 2;
  const s = Math.sin(half) / len;
  return new THREE.Quaternion(ax * s, ay * s, az * s, Math.cos(half));
}

// ─────────────────────────────────────────────
