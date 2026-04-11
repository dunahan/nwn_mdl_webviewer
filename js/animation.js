/* ═══════════════════════════════════════════════
   NWN MDL Viewer — Animation Engine & Render Loop
   ═══════════════════════════════════════════════ */

//  Animation Engine
// ─────────────────────────────────────────────
const animState = {
  current:  null,   // aktuelles Anim-Objekt
  time:     0,
  playing:  false,
  speed:    1.0,
  scrubbing: false,
};

// Gespeicherte Rest-Pose (Geometrie-Transforms) für Reset
let geometryPose = {};  // nodeName → { pos, quat }

function saveGeometryPose() {
  geometryPose = {};
  for (const [name, obj] of Object.entries(nodeObjects)) {
    geometryPose[name] = {
      pos:  obj.position.clone(),
      quat: obj.quaternion.clone(),
    };
  }
}

// Lineare Interpolation zwischen zwei Keyframe-Arrays
function lerpKeys(keys, time) {
  if (!keys || keys.length === 0) return null;
  if (keys.length === 1) return keys[0];
  // Klemme auf gültigen Bereich
  if (time <= keys[0].t) return keys[0];
  if (time >= keys[keys.length - 1].t) return keys[keys.length - 1];
  // Suche umgebende Keys
  let lo = 0, hi = keys.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (keys[mid].t <= time) lo = mid; else hi = mid;
  }
  const a = keys[lo], b = keys[hi];
  const alpha = (b.t === a.t) ? 0 : (time - a.t) / (b.t - a.t);
  return { lo: a, hi: b, alpha };
}

function applyAnimFrame(anim, time) {
  for (const [nodeName, data] of Object.entries(anim.nodes)) {
    const obj = nodeObjects[nodeName];
    if (!obj) continue;

    // Position interpolieren
    if (data.posKeys.length > 0) {
      const r = lerpKeys(data.posKeys, time);
      if (r && r.alpha !== undefined) {
        obj.position.set(
          r.lo.x + (r.hi.x - r.lo.x) * r.alpha,
          r.lo.y + (r.hi.y - r.lo.y) * r.alpha,
          r.lo.z + (r.hi.z - r.lo.z) * r.alpha
        );
      } else if (r) {
        obj.position.set(r.x, r.y, r.z);
      }
    }

    // Orientierung interpolieren (Achse-Winkel → Quaternion → Slerp)
    if (data.oriKeys.length > 0) {
      const r = lerpKeys(data.oriKeys, time);
      if (r && r.alpha !== undefined) {
        const qa = axisAngleToQuat(r.lo.ax, r.lo.ay, r.lo.az, r.lo.angle);
        const qb = axisAngleToQuat(r.hi.ax, r.hi.ay, r.hi.az, r.hi.angle);
        obj.quaternion.slerpQuaternions(qa, qb, r.alpha);
      } else if (r) {
        obj.quaternion.copy(axisAngleToQuat(r.ax, r.ay, r.az, r.angle));
      }
    }
  }
}

function resetToPose() {
  // Zurück zur Rest-Pose (Geometrie-Transforms + Rest-Pose-Keys)
  for (const [name, pose] of Object.entries(geometryPose)) {
    const obj = nodeObjects[name];
    if (!obj) continue;
    obj.position.copy(pose.pos);
    obj.quaternion.copy(pose.quat);
  }
}

// ── CPU-Skinning (Linear Blend Skinning in NWN-Z-Up-Space) ──────────────────
// Formel pro Vertex:  finalPos = Σ_i ( weight_i × skinMat_i × bindPos )
// skinMat_i = currentBoneNWN × inverseBoneBindNWN
// Alle Matrizen und Positionen in NWN-Space (vor modelGroup -90°-X-Rotation).
// Die modelGroup-Rotation wird von Three.js automatisch auf das Skin-Mesh angewendet.
const _sk = {
  mgInv:    new THREE.Matrix4(),
  boneMat:  new THREE.Matrix4(),
  skinMat:  new THREE.Matrix4(),
  vBind:    new THREE.Vector3(),
  vTmp:     new THREE.Vector3(),
  vFinal:   new THREE.Vector3(),
};

function applySkinning() {
  if (!currentModel || !window._nwnBindInvMatrices || !window._nwnModelGroup) return;
  const bindInv = window._nwnBindInvMatrices;
  const mg      = window._nwnModelGroup;

  // mg_inv einmal pro Frame berechnen: wandelt bone.matrixWorld in NWN-Space um
  mg.updateMatrixWorld(true);
  _sk.mgInv.copy(mg.matrixWorld).invert();

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
        const boneObj = nodeObjects[bone];
        if (!boneObj || !bindInv[bone]) continue;

        // Aktueller Bone in NWN-Space
        _sk.boneMat.multiplyMatrices(_sk.mgInv, boneObj.matrixWorld);
        // skinMatrix = currentBoneNWN × inverseBoneBindNWN
        _sk.skinMat.multiplyMatrices(_sk.boneMat, bindInv[bone]);

        _sk.vTmp.copy(_sk.vBind).applyMatrix4(_sk.skinMat);
        _sk.vFinal.addScaledVector(_sk.vTmp, weight);
        totalW += weight;
      }

      if (totalW < 1e-6) {
        _sk.vFinal.copy(_sk.vBind);        // Fallback: Bind-Position
      } else if (Math.abs(totalW - 1.0) > 0.01) {
        _sk.vFinal.divideScalar(totalW);   // Gewichte normalisieren
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

// Rest-Pose aus Modell auf Szene anwenden (nach Supermodel-Merge nötig)
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
  // Erste Animation auswählen aber nicht starten
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
  const cur = animState.time.toFixed(2).padStart(5);
  const tot = animState.current.length.toFixed(2);
  document.getElementById('anim-time-display').textContent = cur + ' / ' + tot;
  if (!animState.scrubbing) {
    const frac = animState.current.length > 0 ? animState.time / animState.current.length : 0;
    document.getElementById('anim-scrubber').value = Math.round(frac * 1000);
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
loadLanguage();   // Sprache laden (async) — wendet data-i18n Attribute an

let lastTime = 0;
function animate(time) {
  requestAnimationFrame(animate);
  const dt = (time - lastTime) * 0.001;
  lastTime = time;
  if (autoRotate && modelGroup) {
    orbit.theta += dt * 0.4;
    updateCamera();
  }
  tickAnimation(dt);
  renderer.render(scene, camera);
}
animate(0);

