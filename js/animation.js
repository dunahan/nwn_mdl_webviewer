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

    // Alpha interpolieren (alphakey — EFFECT-Modelle animieren Mesh-Transparenz)
    const aKeys = data.emitterKeys && data.emitterKeys.alpha;
    if (aKeys && aKeys.length > 0) {
      let alpha;
      if (time <= aKeys[0].t) {
        alpha = aKeys[0].vals[0];
      } else if (time >= aKeys[aKeys.length - 1].t) {
        alpha = aKeys[aKeys.length - 1].vals[0];
      } else {
        let lo = 0, hi = aKeys.length - 1;
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (aKeys[mid].t <= time) lo = mid; else hi = mid; }
        const a = aKeys[lo], b = aKeys[hi];
        const frac = (b.t === a.t) ? 0 : (time - a.t) / (b.t - a.t);
        alpha = a.vals[0] + (b.vals[0] - a.vals[0]) * frac;
      }
      // meshOpacity-Slider berücksichtigen (globale Variable aus scene.js / ui.js)
      const mats = obj.material ? (Array.isArray(obj.material) ? obj.material : [obj.material]) : [];
      for (const mat of mats) {
        mat.opacity     = alpha * (typeof meshOpacity === 'number' ? meshOpacity : 1.0);
        mat.transparent = true;
        mat.visible     = mat.opacity > 0.001;
      }
    }

    // UV-Animation (animmesh) — animtverts: lineare Interpolation zwischen Frames.
    // Statt hartem Frame-Step werden die UV-Koordinaten zweier benachbarter Frames
    // per alpha-Blend gemischt → fliesender Kameraschwenk statt Springen.
    if (data.animTverts && data.animTverts.length > 0 && data.samplePeriod > 0) {
      const geo = obj.geometry;
      if (geo && geo.userData.animFaceTverts) {
        const vertCount  = geo.userData.animVertCount  || 1;
        const numFrames  = Math.floor(data.animTverts.length / vertCount);
        if (numFrames > 0) {
          // Gebrochene Frame-Position: z. B. 1.7 → zwischen Frame 1 und Frame 2
          const rawFrame = (time / data.samplePeriod) % numFrames;
          const frameA   = Math.floor(rawFrame) % numFrames;
          const frameB   = (frameA + 1) % numFrames;
          const alpha    = rawFrame - Math.floor(rawFrame);
          const faceTverts = geo.userData.animFaceTverts;  // Int16Array: faces*3
          const uvArr      = geo.attributes.uv.array;
          const numFaces   = (faceTverts.length / 3) | 0;
          const offA       = frameA * vertCount;
          const offB       = frameB * vertCount;
          for (let fi = 0; fi < numFaces; fi++) {
            for (let k = 0; k < 3; k++) {
              const ti  = faceTverts[fi * 3 + k];
              const uvA = data.animTverts[offA + ti];
              const uvB = data.animTverts[offB + ti];
              uvArr[fi * 6 + k * 2 + 0] = uvA[0] + (uvB[0] - uvA[0]) * alpha;
              uvArr[fi * 6 + k * 2 + 1] = 1.0 - (uvA[1] + (uvB[1] - uvA[1]) * alpha);  // V-Flip
            }
          }
          geo.attributes.uv.needsUpdate = true;
        }
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
    // animmesh: UVs in den Geometrie-Grundzustand zuruecksetzen,
    // damit beim Wechsel auf eine anim ohne animtverts kein veralteter Frame sichtbar bleibt.
    if (obj.geometry && obj.geometry.userData.baseUVs) {
      obj.geometry.attributes.uv.array.set(obj.geometry.userData.baseUVs);
      obj.geometry.attributes.uv.needsUpdate = true;
    }
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

// ── TXI proceduretype cycle ────────────────────────────────────────────────
// Animiert Texturen mit proceduretype cycle (numx/numy/fps aus TXI-Cache).
// Laeuft unabhaengig vom MDL-Animationskanal auf Echtzeit-Basis.
// txiCache wird von txi.js befuellt; jeder Eintrag: { proceduretype, numx, numy, fps, blending, ... }
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
    // Textur-Ausschnitt per repeat/offset setzen (kein UV-Buffer-Update noetig).
    mat.map.repeat.set(1 / numx, 1 / numy);
    mat.map.offset.set(col / numx, (numy - 1 - row) / numy);  // V-Flip fuer Three.js
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
  if (typeof tickAllEmitters === 'function') tickAllEmitters(dt);
  tickTxiCycle(dt);
  renderer.render(scene, camera);
}
animate(0);

