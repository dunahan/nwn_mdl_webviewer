/* ═══════════════════════════════════════════════
   NWN MDL Viewer — Particle Emitter Engine
   (Sprite-Sheet Animation + Particle Pool)

   Supports NWN Aurora emitter nodes:
     update Fountain  – Particles along the local +X axis of the emitter node
                         (Aurora convention: the toolset orients emitters so that
                          local +X points in the desired emission direction)
     blend  Lighten   – AdditiveBlending (best approximation in WebGL)
     xgrid/ygrid      – Sprite-sheet grid (e.g. 4×4 = 16 frames)
     fps/frameStart/frameEnd – Animation rate and frame range
     birthrate/lifeExp       – Spawn rate and lifetime
     sizeStart/Mid/End       – Size curve
     alphaStart/Mid/End      – Transparency curve
     colorStart/End          – Color curve
     spread                  – Cone spread (half-angle) around emission direction
     grav                    – Only for point-to-point emitters (orbital path)
     mass                    – Particle weight × NWN_G (9.81): produces arc trajectory.
                               mass=0.32 → apex ~0.23s, ground ~1.7s
     drag                    – Air resistance (exponential deceleration)
     particleRot             – Sprite rotation in rad/s
   ═══════════════════════════════════════════════ */

// Global registry of all active emitter instances
// nodeName → NWNEmitter
const emitterInstances = {};

// ─────────────────────────────────────────────
//  NWNParticle  —  a single particle
// ─────────────────────────────────────────────
class NWNParticle {
  /**
   * @param {THREE.Texture} baseTex    – Shared canvas texture (textureCache entry)
   * @param {number}        xgrid      – Sprite-sheet columns
   * @param {number}        ygrid      – Sprite-sheet rows
   * @param {string}        renderMode – NWN render mode of the emitter (e.g. 'Billboard_to_World_Z')
   */
  constructor(baseTex, xgrid, ygrid, renderMode) {
    this.xgrid = xgrid;
    this.ygrid = ygrid;

    // Billboard_to_World_Z: sprite lies flat on the ground (XZ plane),
    // not camera-facing. For all other modes: standard THREE.Sprite.
    this.isFlatBillboard =
      (renderMode || '').toLowerCase() === 'billboard_to_world_z';

    // Clone texture: shares canvas pixel data but has its own offset/repeat vectors.
    // THREE.Texture.clone() → new THREE.CanvasTexture with the same .image (canvas).
    // THREE.ColorManagement processes texture.matrix automatically every frame —
    // no needsUpdate() required for offset changes.
    this.tex = baseTex.clone();
    this.tex.repeat.set(1 / xgrid, -1 / ygrid);
    // Negative repeat.y: flips the frame content the right way up.
    // Reason: with flipY=false + UNPACK_FLIP_Y=false, canvas row 0
    // (visually top) lands at WebGL v=0 (sprite bottom) — without correction
    // every frame would be upside down. repeat.y < 0 inverts the v direction.

    if (this.isFlatBillboard) {
      // ── Billboard_to_World_Z: flat quad horizontal in the XZ plane ──
      // PlaneGeometry is by default in the XY plane (normal = +Z).
      // Rotation −90° around X rotates it into the XZ plane (normal = +Y = upward).
      this.mat = new THREE.MeshBasicMaterial({
        map:         this.tex,
        blending:    THREE.AdditiveBlending,
        depthWrite:  false,
        transparent: true,
        side:        THREE.DoubleSide,
        fog:         false,
      });
      const geo = new THREE.PlaneGeometry(1, 1);
      this.obj = new THREE.Mesh(geo, this.mat);
      this.obj.rotation.x = -Math.PI / 2;   // lay flat in XZ plane
    } else {
      // ── All other modes: camera-facing sprite ───────────────────────
      this.mat = new THREE.SpriteMaterial({
        map:         this.tex,
        blending:    THREE.AdditiveBlending,
        depthWrite:  false,
        transparent: true,
        fog:         false,
      });
      this.obj = new THREE.Sprite(this.mat);
    }

    // Backwards compatibility: this.sprite is kept as an alias
    this.sprite = this.obj;

    this.obj.visible = false;
    this.alive  = false;
    this.node   = null;
    this.age    = 0;

    // Movement vectors (world space)
    this.vx = 0; this.vy = 0; this.vz = 0;

    // Point-to-point destination (space), set by spawn(); null = normal flight
    this.p2pTarget = null;

    // Sprite rotation (cumulative, rad) — for particleRot
    this.rotation = 0;

    // Random start frame for "random 1" emitters
    this.startFrame = 0;
  }

  /**
   * Activate a particle (take from pool).
   * @param {THREE.Vector3} worldPos  – Spawn position in world space
   * @param {object}        node      – Parsed emitter node object from parser.js
   * @param {THREE.Vector3} emitDir   – Local +Z axis in world space (emission direction)
   * @param {THREE.Vector3} localX    – Local +X axis in world space (for xsize spread)
   * @param {THREE.Vector3} localY    – Local +Y axis in world space (for ysize spread)
   */
  spawn(worldPos, node, emitDir, localX, localY, p2pTarget = null) {
    this.node        = node;
    this.age         = 0;
    this.alive       = true;
    this.rotation    = 0;
    this.obj.visible = true;
    this.p2pTarget   = p2pTarget;

    // ── Emitter direction ────────────────────────────────────────────
    const dir = (emitDir && emitDir.lengthSq() > 0.01)
      ? emitDir.clone().normalize()
      : new THREE.Vector3(0, 0, 1);

    // Local axes for spawn area (fallback: derive perpendicular to dir)
    let lx = localX, ly = localY;
    if (!lx || !ly) {
      lx = new THREE.Vector3();
      if (Math.abs(dir.x) < 0.9) lx.set(1, 0, 0); else lx.set(0, 1, 0);
      lx.crossVectors(lx, dir).normalize();
      ly = new THREE.Vector3().crossVectors(dir, lx).normalize();
    }

    // ── Spawn position: xsize/ysize define the emitter area in cm ──────
    // NWN wiki: "particles are emitted randomly within the x/y boundaries (in cm)"
    // Conversion: cm → NWN units (÷100), half-extent (÷2) → divisor 200
    const halfX = (node.xsize || 0) / 200;
    const halfY = (node.ysize || 0) / 200;
    const ox = (Math.random() - 0.5) * 2 * halfX;
    const oy = (Math.random() - 0.5) * 2 * halfY;
    this.obj.position.set(
      worldPos.x + lx.x * ox + ly.x * oy,
      worldPos.y + lx.y * ox + ly.y * oy,
      worldPos.z + lx.z * ox + ly.z * oy
    );

    // ── Velocity: cone spread around the emission direction ───────────
    const sp  = Math.max(node.spread || 0, 0);
    const rv  = node.randvel || 0;
    const vel = (node.velocity || 0) + (Math.random() - 0.5) * rv;

    if (sp > 0 && vel !== 0) {
      // Uniform distribution over cone surface (half-angle = spread/2)
      const halfAngle = sp * 0.5;
      const coneAngle = Math.random() * halfAngle;
      const phi       = Math.random() * Math.PI * 2;
      const sinC      = Math.sin(coneAngle);
      const cosC      = Math.cos(coneAngle);
      this.vx = (dir.x * cosC + lx.x * sinC * Math.cos(phi) + ly.x * sinC * Math.sin(phi)) * vel;
      this.vy = (dir.y * cosC + lx.y * sinC * Math.cos(phi) + ly.y * sinC * Math.sin(phi)) * vel;
      this.vz = (dir.z * cosC + lx.z * sinC * Math.cos(phi) + ly.z * sinC * Math.sin(phi)) * vel;
    } else {
      // No spread: directly along emitter axis + randvel noise
      this.vx = dir.x * vel + (Math.random() - 0.5) * rv;
      this.vy = dir.y * vel + (Math.random() - 0.5) * rv;
      this.vz = dir.z * vel + (Math.random() - 0.5) * rv;
    }

    // Random start frame (random 1 in NWN format → each particle starts at a different frame)
    const totalFrames = node.frameEnd - node.frameStart + 1;
    this.startFrame   = node.frameStart + Math.floor(Math.random() * totalFrames);
  }

  /**
   * Update particle for one frame.
   * @param  {number}  dt   – Delta time in seconds
   * @returns {boolean}     – false when the particle has died
   */
  update(dt) {
    if (!this.alive || !this.node) return false;

    this.age += dt;
    const node = this.node;

    if (this.age >= node.lifeExp || node.lifeExp <= 0) {
      this.alive = false;
      this.obj.visible = false;
      return false;
    }

    const t = this.age / node.lifeExp;   // normalised lifetime 0..1

    // ── Position (Euler integration) ──────────────────────────────
    this.obj.position.x += this.vx * dt;
    this.obj.position.y += this.vy * dt;
    this.obj.position.z += this.vz * dt;

    if (this.p2pTarget) {
      // ── Point-to-Point (Gravity) physics ──────────────────────────────
      // p2p_sel=0: Instead of normal gravity, the particle is pulled toward
      // the target point (Reference Node). According to NWN documentation,
      // 'grav' is a direct acceleration (m/s²) toward the target, and
      // 'threshold' is the deletion radius around the target ("Event
      // Horizon"). 'drag' is documented only qualitatively ("overshoots
      // the target, then turns back — higher value = greater overshoot"),
      // with no published formula; here, it is approximated as a velocity
      // boost that produces exactly this overshoot behavior.
      // ponytail: p2p_sel=1 (Bezier path) uses the same approximation;
      // true Bezier tangents (p2p_bezier2/3) are not evaluated — this is
      // the place to implement them if needed (e.g., for lightning emitters).
      const dx = this.p2pTarget.x - this.obj.position.x;
      const dy = this.p2pTarget.y - this.obj.position.y;
      const dz = this.p2pTarget.z - this.obj.position.z;
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

      if (node.threshold > 0 && dist < node.threshold) {
        this.alive = false;
        this.obj.visible = false;
        return false;
      }

      if (dist > 1e-5) {
        const grav = node.grav || 0;
        const invDist = 1 / dist;
        this.vx += dx * invDist * grav * dt;
        this.vy += dy * invDist * grav * dt;
        this.vz += dz * invDist * grav * dt;
      }

      const drag = node.drag || 0;
      if (drag > 0) {
        const boost = 1 + drag * dt;
        this.vx *= boost;
        this.vy *= boost;
        this.vz *= boost;
      }
    } else {
      // NWN gravity: the Aurora engine scales 'mass' by gravitational acceleration.
      // mass=1.0 → particle falls at ~9.81 NWN units/s² (Earth gravity).
      // mass=0.32 → eff. 3.14/s² → apex at t≈0.23s, particle reaches
      // ground (Δy≈−3.9) after t≈1.7s — produces the visible arc. ✓
      const NWN_G = 9.81;
      if (node.mass) {
        this.vy -= node.mass * NWN_G * dt;
      }

      // Drag: exponential deceleration — simulates air resistance
      // Formula: v *= (1 - drag)^dt  ≈  v * e^(-drag * dt)
      const drag = node.drag || 0;
      if (drag > 0) {
        const damping = Math.pow(Math.max(1 - drag, 0), dt);
        this.vx *= damping;
        this.vy *= damping;
        this.vz *= damping;
      }
    }

    // Sprite rotation: particleRot = angular velocity in rad/s
    // For Billboard_to_World_Z: rotation around world Y axis (spin on the ground).
    // For normal sprites: rotation in screen space (SpriteMaterial.rotation).
    if (node.particleRot) {
      this.rotation += node.particleRot * dt;
      if (this.isFlatBillboard) {
        this.obj.rotation.y = this.rotation;
      } else {
        this.mat.rotation = this.rotation;
      }
    }

    // ── Size: sizeStart → [sizeMid] → sizeEnd ─────────────────────
    // NWN: sizeMid = 0 means "not used" → linear lerp Start→End
    const sS = node.sizeStart, sM = node.sizeMid, sE = node.sizeEnd;
    let size;
    if (Math.abs(sM) < 1e-4) {
      // Linear lerp
      size = sS + (sE - sS) * t;
    } else {
      // Three-point lerp with midpoint at t=0.5
      size = t < 0.5
        ? sS + (sM - sS) * (t * 2)
        : sM + (sE - sM) * ((t - 0.5) * 2);
    }
    this.obj.scale.setScalar(Math.max(size, 0.001));

    // ── Alpha: alphaStart → alphaMid → alphaEnd ───────────────────
    const aS = node.alphaStart, aM = node.alphaMid, aE = node.alphaEnd;
    let alpha;
    if (t < 0.5) alpha = aS + (aM - aS) * (t * 2);
    else         alpha = aM + (aE - aM) * ((t - 0.5) * 2);
    this.mat.opacity = Math.max(0, Math.min(1, alpha));

    // ── Color: colorStart → colorEnd (linear lerp) ───────────────
    const cS = node.colorStart, cE = node.colorEnd;
    this.mat.color.setRGB(
      cS[0] + (cE[0] - cS[0]) * t,
      cS[1] + (cE[1] - cS[1]) * t,
      cS[2] + (cE[2] - cS[2]) * t
    );

    // ── Sprite-sheet frame ─────────────────────────────────────────
    // fps controls the animation rate independently of lifetime.
    // startFrame enables a randomised entry point (random=1).
    //
    // UV coordinate calculation (flipY=false + TGA vertical flip):
    //   canvas.row[0] = visually bottom (after TGA flip in parser)
    //   → canvasRow = (ygrid-1) - visualRow  (inversion)
    const fps         = node.fps > 0 ? node.fps : 25;
    const totalFrames = node.frameEnd - node.frameStart + 1;
    const elapsed     = this.startFrame - node.frameStart + this.age * fps;
    const frameIdx    = node.frameStart + (Math.floor(elapsed) % totalFrames + totalFrames) % totalFrames;

    const col       = frameIdx % this.xgrid;
    const canvasRow = Math.floor(frameIdx / this.xgrid);
    // No Y-flip needed: the TGA parser + Three.js flipY=false + UV matrix
    // (v → 1-v) cancel each other out — canvasRow = visualRow.
    // offset.y = (canvasRow+1)/ygrid because repeat.y is negative: the bottom edge
    // of the frame is at offset.y, the top edge at offset.y - |repeat.y|.
    this.tex.offset.set(col / this.xgrid, (canvasRow + 1) / this.ygrid);
    // No needsUpdate() needed: texture.matrix (containing offset) is uploaded
    // by the renderer automatically as a uniform every frame.

    return true;
  }

  /** Release GPU resources */
  dispose() {
    this.tex.dispose();
    this.mat.dispose();
    this.alive = false;
  }
}


// ─────────────────────────────────────────────
//  Helper function: linear interpolation of a 1D controller key
//  keys: [{t, vals:[v]}, ...]   (from parser.js emitterKeys)
//  t:    current animation time in seconds
// ─────────────────────────────────────────────
function evalKey1D(keys, t) {
  if (!keys || keys.length === 0) return 0;
  if (t <= keys[0].t)                    return keys[0].vals[0];
  if (t >= keys[keys.length - 1].t)     return keys[keys.length - 1].vals[0];
  for (let i = 0; i < keys.length - 1; i++) {
    if (t >= keys[i].t && t <= keys[i + 1].t) {
      const frac = (t - keys[i].t) / (keys[i + 1].t - keys[i].t);
      return keys[i].vals[0] + (keys[i + 1].vals[0] - keys[i].vals[0]) * frac;
    }
  }
  return 0;
}


// ─────────────────────────────────────────────
//  NWNEmitter  —  particle pool and spawn logic
// ─────────────────────────────────────────────
class NWNEmitter {
  /** @param {object} node – Parsed emitter node object */
  constructor(node) {
    this.node        = node;
    this.pool        = [];    // inactive particles (ready for recycling)
    this.active      = [];    // currently living particles
    this.accumulator = 0;     // spawn time accumulator
    this.baseTex     = textureCache[node.emitterTexture] || null;
    // Placeholder marker shown at the emitter position when no texture is loaded yet.
    // Managed entirely within emitter.js — see _syncPlaceholder().
    this._placeholder = null;
    this._buildPool();
    this._syncPlaceholder();
  }

  _buildPool() {
    if (!this.baseTex) return;
    const node = this.node;
    // Determine maximum birthrate: animated key takes precedence over static value.
    // _birthrateKeys is attached to the node by initAllEmitters().
    let maxBirthrate = node.birthrate;
    if (node._birthrateKeys?.length > 0) {
      maxBirthrate = Math.max(...node._birthrateKeys.map(k => k.vals[0]));
    }
    // Particle count = birthrate × lifeExp + buffer
    const maxAlive = Math.ceil(maxBirthrate * node.lifeExp) + 6;
    for (let i = 0; i < maxAlive; i++) {
      const p = new NWNParticle(this.baseTex, node.xgrid, node.ygrid, node.renderMode);
      scene.add(p.obj);
      this.pool.push(p);
    }
  }

  /**
   * Called from applyTexturesToScene() when the texture was loaded
   * after the fact (textures dropped after the model).
   */
  refreshTexture() {
    const tex = textureCache[this.node.emitterTexture] || null;
    if (tex && tex !== this.baseTex) {
      // Rebuild pool completely with the now-available texture
      this._disposeParticles();
      this.baseTex = tex;
      this._buildPool();
      // Texture arrived → hide placeholder, particles take over
      this._syncPlaceholder();
    }
  }

  // ─────────────────────────────────────────────
  //  Placeholder marker (visible when baseTex is null)
  // ─────────────────────────────────────────────

  /**
   * Central switch: builds or shows/hides the placeholder depending on
   * whether a texture is available. Called from constructor and refreshTexture().
   */
  _syncPlaceholder() {
    if (!this.baseTex) {
      // No texture → ensure placeholder exists and is visible
      if (!this._placeholder) this._buildPlaceholder();
      if (this._placeholder) this._placeholder.visible = true;
    } else {
      // Texture loaded → hide placeholder (particles take over)
      if (this._placeholder) this._placeholder.visible = false;
    }
  }

  /**
   * Builds a small marker (tiny sphere + halo ring) in the emitter's colorStart
   * and attaches it as a child of the emitter's scene node so it inherits
   * position, orientation, and animation transforms automatically.
   */
  _buildPlaceholder() {
    const nodeObj = nodeObjects[this.node.name];
    if (!nodeObj) return;

    // Derive marker colour from colorStart (same logic as scene_build.js emitColor)
    const cs  = this.node.colorStart || [1, 0.6, 0.1];
    const lum = cs[0] * 0.299 + cs[1] * 0.587 + cs[2] * 0.114;
    const color = lum < 0.05
      ? new THREE.Color(0xf0a030)
      : new THREE.Color(cs[0], cs[1], cs[2]);

    const grp = new THREE.Group();
    grp.userData.isEmitterPlaceholder = true;

    // Tiny centre sphere — marks the exact emitter origin
    const sGeo = new THREE.SphereGeometry(0.015, 6, 4);
    const sMat = new THREE.MeshBasicMaterial({ color });
    grp.add(new THREE.Mesh(sGeo, sMat));

    // Small halo ring — gives size reference and makes the marker recognisable
    // rotation.x = π/2 matches the ring orientation used in scene_build.js
    const rGeo = new THREE.TorusGeometry(0.05, 0.003, 6, 16);
    const rMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
    const ring = new THREE.Mesh(rGeo, rMat);
    ring.rotation.x = Math.PI / 2;
    grp.add(ring);

    nodeObj.add(grp);
    this._placeholder = grp;
  }

  /** Query world position of the emitter node */
  _getWorldPos() {
    const obj = nodeObjects[this.node.name];
    if (!obj) return new THREE.Vector3();
    const pos = new THREE.Vector3();
    obj.getWorldPosition(pos);
    return pos;
  }

  _getWorldDir() {
    const obj = nodeObjects[this.node.name];
    if (!obj) return new THREE.Vector3(0, 0, 1);
    obj.updateMatrixWorld(true);
    // NWN Aurora convention for Fountain: particles flow along the local +Z axis
    // of the emitter node (= NWN local "up"). The toolset orients emitters so that
    // local +Z points in the desired emission direction; for waterfall emitters
    // (≈177° rotation) +Z → world (−X, +Y) → produces an arc with mass gravity.
    return new THREE.Vector3(0, 0, 1).transformDirection(obj.matrixWorld).normalize();
  }

  /**
   * All three local axes of the emitter node in world space.
   * localX / localY span the spawn area (for xsize/ysize).
   * emitDir (localZ) is the emission direction.
   */
  _getWorldAxes() {
    const obj = nodeObjects[this.node.name];
    if (!obj) return {
      emitDir: new THREE.Vector3(0, 0, 1),
      localX:  new THREE.Vector3(1, 0, 0),
      localY:  new THREE.Vector3(0, 1, 0),
    };
    obj.updateMatrixWorld(true);
    return {
      emitDir: new THREE.Vector3(0, 0, 1).transformDirection(obj.matrixWorld).normalize(),
      localX:  new THREE.Vector3(1, 0, 0).transformDirection(obj.matrixWorld).normalize(),
      localY:  new THREE.Vector3(0, 1, 0).transformDirection(obj.matrixWorld).normalize(),
    };
  }

  /** World position of the P2P target reference node, or null if not configured. */
  _getP2PTargetWorldPos() {
    if (!this.node._p2pTargetName) return null;
    const obj = nodeObjects[this.node._p2pTargetName];
    if (!obj) return null;
    const pos = new THREE.Vector3();
    obj.getWorldPosition(pos);
    return pos;
  }

  /** Call once per frame */
  update(dt) {
    if (!this.baseTex) return;

    // ── Determine effective birthrate ────────────────────────────────────
    // Animated birthratekey takes precedence. animState is global from animation.js.
    // evalKey1D interpolates linearly between keyframes.
    let birthrate = this.node.birthrate;
    if (this.node._birthrateKeys?.length > 0) {
      birthrate = evalKey1D(this.node._birthrateKeys, animState.time);
    }

    // Always update active particles (they may still run out)
    this.active = this.active.filter(p => {
      const alive = p.update(dt);
      if (!alive) this.pool.push(p);
      return alive;
    });

    // No new particles when birthrate is currently 0
    if (birthrate <= 0) return;

    // Visibility: node hidden → no new particles,
    // but existing particles may still die
    const obj = nodeObjects[this.node.name];
    const nodeVisible = !obj || obj.visible;

    if (nodeVisible) {
      // Spawn new particles
      this.accumulator += dt;
      const interval = 1.0 / birthrate;
      while (this.accumulator >= interval) {
        this.accumulator -= interval;
        this._spawn();
      }
    }
  }

  _spawn() {
    if (!this.baseTex) return;
    // Take from pool or create a new particle
    let p = this.pool.pop();
    if (!p) {
      p = new NWNParticle(this.baseTex, this.node.xgrid, this.node.ygrid, this.node.renderMode);
      scene.add(p.obj);
    }
    const { emitDir, localX, localY } = this._getWorldAxes();
    const p2pTarget = this.node.p2p ? this._getP2PTargetWorldPos() : null;
    p.spawn(this._getWorldPos(), this.node, emitDir, localX, localY, p2pTarget);
    this.active.push(p);
  }

  _disposeParticles() {
    for (const p of [...this.active, ...this.pool]) {
      scene.remove(p.obj);
      p.dispose();
    }
    this.active = [];
    this.pool   = [];
  }

  /** Release all GPU resources and remove sprites from the scene */
  dispose() {
    this._disposeParticles();
    // Remove placeholder marker from its parent node and free GPU resources
    if (this._placeholder) {
      const nodeObj = nodeObjects[this.node.name];
      if (nodeObj) nodeObj.remove(this._placeholder);
      this._placeholder.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
      this._placeholder = null;
    }
    this.baseTex = null;
  }
}

// ─────────────────────────────────────────────
//  NWNLightningBolt  —  static beam between emitter and reference node
//  (minimal lightning representation; see update=Lightning in initAllEmitters)
// ─────────────────────────────────────────────
class NWNLightningBolt {
  constructor(node) {
    this.node = node;
    this.obj  = null;
    this._build();
  }

  _build() {
    const emitterObj = nodeObjects[this.node.name];
    const targetObj  = nodeObjects[this.node._p2pTargetName];
    if (!emitterObj || !targetObj) return;

    const from = new THREE.Vector3();
    const to   = new THREE.Vector3();
    emitterObj.getWorldPosition(from);
    targetObj.getWorldPosition(to);

    // Use the same color as the emitter markers in scene_build.js (colorStart);
    // switch to an electric blue if the value is too dark.
    const cs  = this.node.colorStart || [0.6, 0.8, 1.0];
    const lum = cs[0] * 0.299 + cs[1] * 0.587 + cs[2] * 0.114;
    const color = lum < 0.05 ? new THREE.Color(0x88ccff) : new THREE.Color(cs[0], cs[1], cs[2]);

    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 });
    this.obj = new THREE.Line(geo, mat);
    this.obj.userData.isLightningBolt = true;
    scene.add(this.obj);
  }

  /** Reflects the visibility of the emitter node (scene graph toggle). */
  update(dt) {
    const emitterObj = nodeObjects[this.node.name];
    if (this.obj && emitterObj) this.obj.visible = emitterObj.visible;
  }

  /** No texture state — no-op for the shared refreshEmitterTextures() loop. */
  refreshTexture() {}

  dispose() {
    if (this.obj) {
      scene.remove(this.obj);
      this.obj.geometry.dispose();
      this.obj.material.dispose();
      this.obj = null;
    }
  }
}

// ─────────────────────────────────────────────
//  Global API  —  used by other modules
// ─────────────────────────────────────────────

/**
 * Initialise all emitters of a loaded model.
 * Called at the end of buildScene() (scene_build.js).
 * @param {object} model – Parsed MDL model
 */
function initAllEmitters(model) {
  clearAllEmitters();
  if (!model) return;
  for (const node of model.nodes) {
    if (node.type !== 'emitter') continue;

    // ── Resolve P2P target point ────────────────────────────────────────────
    // A reference node as a child node is mandatory for p2p=1 AND for
    // update=Lightning (according to NWN documentation, Lightning is a specialized
    // p2p emitter) — therefore, resolve it here for both cases.
    const isLightning = (node.update || '').toLowerCase() === 'lightning';
    node._p2pTargetName = (node.p2p || isLightning)
      ? (model.nodes.find(n => n.parent === node.name && n.type === 'reference')?.name || null)
      : null;

    // ── Lightning: static beam instead of particle sprites ────────────────
    // ponytail: no fractal/flickering (subdivision/lightningRadius/lightningScale
    // unused), fixed static beam upon model load. Upgrade path if
    // needed: periodic midpoint displacement recalculation in update().
    if (isLightning) {
      if (!node._p2pTargetName) continue;   // keine Reference-Node → nichts zu zeichnen
      try {
        emitterInstances[node.name] = new NWNLightningBolt(node);
        logInfo(fmt('log_em_init', { name: node.name }) + L('log_em_lightning_static'));
      } catch (err) {
        logWarn(fmt('log_em_error', { name: node.name, msg: err.message }));
      }
      continue;
    }

    if (!node.emitterTexture) continue;

    // ── Search for birthratekey in animation data ────────────────────────
    // NWN effect models often have birthrate=0 in the geometry block and control
    // the spawn curve exclusively via birthratekey in the animation.
    // We look for the first animation with birthratekey data for this node.
    node._birthrateKeys = null;
    for (const anim of (model.animations || [])) {
      const keys = anim.nodes[node.name]?.emitterKeys?.birthrate;
      if (keys?.length > 0) {
        node._birthrateKeys = keys;
        break;
      }
    }

    const hasBirthrate = node.birthrate > 0 || node._birthrateKeys !== null;
    if (!hasBirthrate) continue;   // emitter with no birthrate definition at all

    try {
      emitterInstances[node.name] = new NWNEmitter(node);
      const texOk  = !!textureCache[node.emitterTexture];
      const keyTag = node._birthrateKeys ? ' [birthratekey]' : '';
      logInfo(fmt('log_em_init', { name: node.name })
        + (texOk ? '' : ' ' + fmt('log_em_tex_pending', { tex: node.emitterTexture }))
        + keyTag
      );
    } catch (err) {
      logWarn(fmt('log_em_error', { name: node.name, msg: err.message }));
    }
  }
}

/**
 * Update all active emitters for one frame.
 * Called in the render loop from animation.js.
 * @param {number} dt – Delta time in seconds
 */
function tickAllEmitters(dt) {
  for (const inst of Object.values(emitterInstances)) {
    inst.update(dt);
  }
}

/**
 * Remove all emitters and their sprites from the scene.
 * Called in clearSession() (session.js).
 */
function clearAllEmitters() {
  for (const inst of Object.values(emitterInstances)) {
    inst.dispose();
  }
  for (const key of Object.keys(emitterInstances)) {
    delete emitterInstances[key];
  }
}

/**
 * Update emitter textures when textures were loaded after the fact.
 * Called in applyTexturesToScene() (session.js).
 */
function refreshEmitterTextures() {
  for (const inst of Object.values(emitterInstances)) {
    inst.refreshTexture();
  }
}
