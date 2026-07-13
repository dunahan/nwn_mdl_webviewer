/* ═══════════════════════════════════════════════
   NWN MDL Viewer — Animation Engine & Render Loop
   ═══════════════════════════════════════════════ */

//  Animation Engine
// ─────────────────────────────────────────────
const animState = {
  current:  null,   // current animation object
  time:     0,
  playing:  false,
  speed:    1.0,
  scrubbing: false,
};

// Leichtgewichtiger FPS-Zähler ohne externe Abhängigkeit.
// DOM wird bewusst nur 4×/s aktualisiert statt pro Frame — sonst flackert
// die Zahl unleserlich und man schreibt unnötig oft ins DOM.
const fpsUI = { el: null, frames: 0, elapsed: 0 };

function tickFps(dt) {
  if (!fpsUI.el) fpsUI.el = document.getElementById('stat-fps');
  fpsUI.frames++;
  fpsUI.elapsed += dt;
  if (fpsUI.elapsed >= 0.25) {
    if (fpsUI.el) fpsUI.el.textContent = Math.round(fpsUI.frames / fpsUI.elapsed);
    fpsUI.frames = 0;
    fpsUI.elapsed = 0;
  }
}

// DOM-Cache für die Animations-UI
const animUI = {
  display: null,
  scrubber: null,
  initDone: false,
  init() {
    this.display = document.getElementById('anim-time-display');
    this.scrubber = document.getElementById('anim-scrubber');
    this.initDone = true;
  }
};

// Saved rest pose (geometry transforms) for reset
let geometryPose = {};  // nodeName → { pos, quat }

function saveGeometryPose() {
  geometryPose = {};
  for (const [name, obj] of Object.entries(nodeObjects)) {
    geometryPose[name] = {
      pos:   obj.position.clone(),
      quat:  obj.quaternion.clone(),
      scale: obj.scale.clone(),
    };
  }
}

// ── PERFORMANCE OPTIMIZATION: REUSABLE OBJECTS FOR LOOP ──────────────────
const _lerpResult = { lo: null, hi: null, alpha: 0 };
const _tempQuatA  = new THREE.Quaternion();
const _tempQuatB  = new THREE.Quaternion();
const _tempVectorA = new THREE.Vector3();
const _tempVectorB = new THREE.Vector3();
// ──────────────────────────────────────────────────────────────────────────

// Linear interpolation between two keyframe arrays
function lerpKeys(keys, time) {
  if (!keys || keys.length === 0) return null;
  if (keys.length === 1) return keys[0];
  // Clamp to valid range
  if (time <= keys[0].t) return keys[0];
  if (time >= keys[keys.length - 1].t) return keys[keys.length - 1];
  // Find surrounding keys
  let lo = 0, hi = keys.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (keys[mid].t <= time) lo = mid; else hi = mid;
  }
  const a = keys[lo], b = keys[hi];
  const alpha = (b.t === a.t) ? 0 : (time - a.t) / (b.t - a.t);
// Wiederverwendung statt: return { lo: a, hi: b, alpha: alpha };
  _lerpResult.lo = a;
  _lerpResult.hi = b;
  _lerpResult.alpha = alpha;
  return _lerpResult;
}

// Interpolation for emitterKey arrays ({ t, vals[] }) — returns interpolated vals array.
function lerpEmitterKey(keys, time) {
  if (!keys || keys.length === 0) return null;
  if (time <= keys[0].t) return keys[0].vals;
  if (time >= keys[keys.length - 1].t) return keys[keys.length - 1].vals;
  let lo = 0, hi = keys.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (keys[mid].t <= time) lo = mid; else hi = mid; }
  const a = keys[lo], b = keys[hi];
  const frac = (b.t === a.t) ? 0 : (time - a.t) / (b.t - a.t);
  return a.vals.map((v, i) => v + (b.vals[i] - v) * frac);
}

function applyAnimFrame(anim, time) {
  if (!anim || !anim.nodes) return;

  // VORHER: for (const [nodeName, data] of Object.entries(anim.nodes))
  // JETZT: for...in Schleife erzeugt keine temporären Arrays im Speicher
  for (const nodeName in anim.nodes) {
    const data = anim.nodes[nodeName];
    const obj = nodeObjects[nodeName];
    if (!obj) continue;

    // POSITION
    if (data.posKeys && data.posKeys.length > 0) {
      const res = lerpKeys(data.posKeys, time);
      if (res && res.alpha === undefined) {
        obj.position.set(res.x, res.y, res.z);
      } else if (res) {
        _tempVectorA.set(res.lo.x, res.lo.y, res.lo.z);
        _tempVectorB.set(res.hi.x, res.hi.y, res.hi.z);
        obj.position.lerpVectors(_tempVectorA, _tempVectorB, res.alpha);
      }
    }

    // ROTATION — gleiches Prinzip
    if (data.oriKeys && data.oriKeys.length > 0) {
      const res = lerpKeys(data.oriKeys, time);
      if (res && res.alpha === undefined) {
        obj.quaternion.copy(axisAngleToQuat(res.ax, res.ay, res.az, res.angle));
      } else if (res) {
        _tempQuatA.copy(axisAngleToQuat(res.lo.ax, res.lo.ay, res.lo.az, res.lo.angle));
        _tempQuatB.copy(axisAngleToQuat(res.hi.ax, res.hi.ay, res.hi.az, res.hi.angle));
        obj.quaternion.slerpQuaternions(_tempQuatA, _tempQuatB, res.alpha);
      }
    }

    // SCALE — gleiches Prinzip
    if (data.scaleKeys && data.scaleKeys.length > 0) {
      const res = lerpKeys(data.scaleKeys, time);
      if (res && res.alpha === undefined) {
        obj.scale.setScalar(res.s);
      } else if (res) {
        obj.scale.setScalar(res.lo.s + (res.hi.s - res.lo.s) * res.alpha);
      }
    }
  }
}

function resetToPose() {
  // Return to rest pose (geometry transforms + rest pose keys)
  for (const [name, pose] of Object.entries(geometryPose)) {
    const obj = nodeObjects[name];
    if (!obj) continue;
    obj.position.copy(pose.pos);
    obj.quaternion.copy(pose.quat);
    if (pose.scale) obj.scale.copy(pose.scale);
    // Reset light properties to MDL base values
    if (obj.userData && obj.userData.mdlLight && obj.userData.nodeData) {
      const nd    = obj.userData.nodeData;
      const light = obj.userData.mdlLight;
      light.color.setRGB(nd.lightColor[0], nd.lightColor[1], nd.lightColor[2]);
      light.distance  = nd.lightRadius;
      light.intensity = nd.lightMultiplier;
    }
    // animmesh: reset UVs to the base geometry state
    // so that no stale frame remains visible when switching to an anim without animtverts.
    if (obj.geometry && obj.geometry.userData.baseUVs) {
      obj.geometry.attributes.uv.array.set(obj.geometry.userData.baseUVs);
      obj.geometry.attributes.uv.needsUpdate = true;
    }
  }
}

// ── CPU Skinning (Linear Blend Skinning in NWN Z-Up space) ──────────────────
// Formula per vertex:  finalPos = Σ_i ( weight_i × skinMat_i × bindPos )
// skinMat_i = currentBoneNWN × inverseBoneBindNWN
// All matrices and positions in NWN space (before modelGroup -90° X rotation).
// The modelGroup rotation is applied to the skin mesh automatically by Three.js.
const _sk = {
  mgInv:   new THREE.Matrix4(),
  boneMat: new THREE.Matrix4(),
  vBind:   new THREE.Vector3(),
  vTmp:    new THREE.Vector3(),
  vFinal:  new THREE.Vector3(),
};

// Bone-Name → finale Skin-Matrix (NWN-Space), pro Frame neu befüllt.
// ponytail: Map wird jeden Frame neu angelegt statt gepoolt — bei ~30-60
// Bones ist die Allokation vernachlässigbar gegen die eingesparten
// Matrix-Multiplikationen. Falls GC-Druck je messbar wird: persistenten
// Matrix4-Pool pro Bone anlegen statt Map.clear() pro Frame.
const _skinMatCache = new Map();

function _getSkinMat(bone, bindInv) {
  let m = _skinMatCache.get(bone);
  if (m) return m;
  const boneObj = nodeObjects[bone];
  if (!boneObj || !bindInv[bone]) return null;
  m = new THREE.Matrix4();
  _sk.boneMat.multiplyMatrices(_sk.mgInv, boneObj.matrixWorld);
  m.multiplyMatrices(_sk.boneMat, bindInv[bone]);
  _skinMatCache.set(bone, m);
  return m;
}

function applySkinning() {
  if (!currentModel || !window._nwnBindInvMatrices || !window._nwnModelGroup) return;
  const bindInv = window._nwnBindInvMatrices;
  const mg      = window._nwnModelGroup;

  // Compute mg_inv once per frame: transforms bone.matrixWorld into NWN space
  mg.updateMatrixWorld(true);
  _sk.mgInv.copy(mg.matrixWorld).invert();

  // Eine Skin-Matrix pro Bone für diesen Frame — wird beim ersten
  // Vertex, der den Bone nutzt, berechnet und danach wiederverwendet.
  _skinMatCache.clear();

  for (const node of currentModel.nodes) {
    if (node.type !== 'skin') continue;
    const obj = nodeObjects[node.name];
    if (!obj || !(obj instanceof THREE.Mesh)) continue;
    const geo = obj.geometry;
    if (!geo.userData.hasSkin) continue;

    const bindPos      = geo.userData.bindPositions;   // NWN model-space
    const perVertW     = geo.userData.perVertWeights;
    const posArr       = geo.attributes.position.array;
    const nVerts       = perVertW.length;

    for (let i = 0; i < nVerts; i++) {
      const pairs = perVertW[i];
      _sk.vFinal.set(0, 0, 0);
      _sk.vBind.set(bindPos[i * 3], bindPos[i * 3 + 1], bindPos[i * 3 + 2]);

      let totalW = 0;
      for (const { bone, weight } of pairs) {
        const skinMat = _getSkinMat(bone, bindInv);
        if (!skinMat) continue;

        _sk.vTmp.copy(_sk.vBind).applyMatrix4(skinMat);
        _sk.vFinal.addScaledVector(_sk.vTmp, weight);
        totalW += weight;
      }

      if (totalW < 1e-6) {
        _sk.vFinal.copy(_sk.vBind);        // Fallback: bind position
      } else if (Math.abs(totalW - 1.0) > 0.01) {
        _sk.vFinal.divideScalar(totalW);   // Normalize weights
      }

      posArr[i * 3]     = _sk.vFinal.x;
      posArr[i * 3 + 1] = _sk.vFinal.y;
      posArr[i * 3 + 2] = _sk.vFinal.z;
    }

    geo.attributes.position.needsUpdate = true;
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
  }
}

// Apply rest pose from model to scene (required after supermodel merge)
function applyRestPose(model) {
  for (const node of model.nodes) {
    const obj = nodeObjects[node.name];
    if (!obj) continue;
    const restPose = model.restPose && model.restPose[node.name];
    if (restPose) {
      if (restPose.orientation) {
        const [ax, ay, az, angle] = restPose.orientation;
        obj.quaternion.copy(axisAngleToQuat(ax, ay, az, angle));
      }
      if (restPose.position) {
        obj.position.set(...restPose.position);
      }
      if (restPose.scale != null) {
        obj.scale.setScalar(restPose.scale);
      }
    }
  }
}


function buildAnimUI(model) {
  const panel = document.getElementById('anim-panel');
  const sel   = document.getElementById('anim-select');
  if (!model.animations || model.animations.length === 0) {
    panel.style.display = 'none';
    return;
  }
  panel.style.display = 'block';
  sel.innerHTML = '';
  for (const a of model.animations) {
    const opt = document.createElement('option');
    opt.value = a.name;
    opt.textContent = a.name + '  (' + a.length.toFixed(2) + 's)';
    sel.appendChild(opt);
  }
  // Select first animation but do not start it
  selectAnim(model.animations[0].name, false);
}

function selectAnim(name, autoPlay) {
  const model = currentModel;
  if (!model) return;
  const anim = model.animations.find(a => a.name === name);
  if (!anim) return;
  animState.current  = anim;
  animState.time     = 0;
  animState.playing  = false;
  document.getElementById('btn-anim-play').textContent = '▶';
  document.getElementById('anim-scrubber').value = 0;
  updateAnimTimeDisplay();
  resetToPose();
  applyAnimFrame(anim, 0);
  applySkinning();
  if (autoPlay) { animState.playing = true; document.getElementById('btn-anim-play').textContent = '⏸'; }
}

function onAnimSelect(name) { selectAnim(name, false); }

function toggleAnimPlay() {
  if (!animState.current) return;
  animState.playing = !animState.playing;
  document.getElementById('btn-anim-play').textContent = animState.playing ? '⏸' : '▶';
}

function onScrub(val) {
  if (!animState.current) return;
  animState.time = (val / 1000) * animState.current.length;
  animState.playing = false;
  document.getElementById('btn-anim-play').textContent = '▶';
  applyAnimFrame(animState.current, animState.time);
  applySkinning();
  updateAnimTimeDisplay();
}

function setAnimSpeed(s) {
  animState.speed = s;
  document.querySelectorAll('.speed-btn').forEach(b => {
    b.classList.toggle('active', parseFloat(b.textContent) === s ||
      (s === 0.25 && b.textContent === '¼×') ||
      (s === 0.5  && b.textContent === '½×') ||
      (s === 1    && b.textContent === '1×') ||
      (s === 2    && b.textContent === '2×'));
  });
}

function updateAnimTimeDisplay() {
  if (!animState.current) return;
  
  // Einmalige Initialisierung bei Bedarf
  if (!animUI.initDone) animUI.init();

  const cur = animState.time.toFixed(2);
  const tot = animState.current.length.toFixed(2);
  const frac = animState.time / animState.current.length;

  // Direkter Zugriff auf den Cache statt document.getElementById
  if (animUI.display) {
    animUI.display.textContent = cur + ' / ' + tot;
  }
  if (!animState.scrubbing && animUI.scrubber) {
    animUI.scrubber.value = Math.round(frac * 1000);
  }
}

function tickAnimation(dt) {
  if (!animState.playing || !animState.current) return;
  animState.time += dt * animState.speed;
  if (animState.time >= animState.current.length) {
    animState.time = animState.time % animState.current.length;
  }
  applyAnimFrame(animState.current, animState.time);
  applySkinning();
  updateAnimTimeDisplay();
}

// ── TXI proceduretype cycle ────────────────────────────────────────────────
// Animates textures with proceduretype cycle (numx/numy/fps from TXI cache).
// Runs independently of the MDL animation channel on a real-time basis.
// txiCache is populated by txi.js; each entry: { proceduretype, numx, numy, fps, blending, ... }
let txiWallTime = 0;

function tickTxiCycle(dt) {
  txiWallTime += dt;
  if (!currentModel) return;
  if (typeof txiCache === 'undefined') return;
  for (const node of currentModel.nodes) {
    if (node.type !== 'trimesh' && node.type !== 'animmesh') continue;
    const bitmapKey = node.bitmap ? node.bitmap.toLowerCase() : '';
    if (!bitmapKey) continue;
    const txi = txiCache[bitmapKey];
    if (!txi || (txi.proceduretype || '').toLowerCase() !== 'cycle') continue;
    const numx = txi.numx || 1;
    const numy = txi.numy || 1;
    const fps  = txi.fps  || 1;
    const totalFrames = numx * numy;
    const frameIdx = Math.floor(txiWallTime * fps) % totalFrames;
    const col = frameIdx % numx;
    const row = Math.floor(frameIdx / numx);
    const obj = nodeObjects[node.name];
    if (!obj || !obj.material) continue;
    const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    if (!mat || !mat.map) continue;
    // Set texture crop via repeat/offset (no UV buffer update needed).
    mat.map.repeat.set(1 / numx, 1 / numy);
    mat.map.offset.set(col / numx, (numy - 1 - row) / numy);  // V-flip for Three.js
  }
}


function resize() {
  const vp = document.getElementById('viewport');
  const w = vp.clientWidth, h = vp.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

window.addEventListener('resize', resize);
resize();
updateCamera();
loadLanguage();   // Load language (async) — applies data-i18n attributes

let lastTime = 0;

function animate(time) {
  requestAnimationFrame(animate);
  const dt = (time - lastTime) * 0.001;
  lastTime = time;
  tickFps(dt);
  if (autoRotate && modelGroup) {
    orbit.theta += dt * 0.4;
    updateCamera();
  }
  tickAnimation(dt);
  if (typeof tickAllEmitters === 'function') tickAllEmitters(dt);
  if (typeof tickDangly === 'function') tickDangly(dt);
  tickTxiCycle(dt);
  renderer.render(scene, camera);
}

animate(0);

