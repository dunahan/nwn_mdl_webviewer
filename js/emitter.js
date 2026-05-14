/* ═══════════════════════════════════════════════
   NWN MDL Viewer — Particle Emitter Engine
   (Sprite-Sheet-Animation + Partikel-Pool)

   Unterstützt NWN Aurora Emitter-Nodes:
     update Fountain  – Partikel entlang der lokalen +X-Achse des Emitter-Nodes
                         (Aurora-Konvention: der Toolset orientiert Emitter so,
                          dass local +X in die gewünschte Emissionsrichtung zeigt)
     blend  Lighten   – AdditiveBlending (beste Annäherung in WebGL)
     xgrid/ygrid      – Sprite-Sheet-Raster (z.B. 4×4 = 16 Frames)
     fps/frameStart/frameEnd – Animations-Rate und Frame-Bereich
     birthrate/lifeExp       – Spawn-Rate und Lebensdauer
     sizeStart/Mid/End       – Größenverlauf
     alphaStart/Mid/End      – Transparenzverlauf
     colorStart/End          – Farbverlauf
     spread                  – Kegelstreuung (half-angle) um Emitter-Richtung
     grav                    – nur für Point-to-Point-Emitter (Orbital-Bahn)
     mass                    – Partikelgewicht × NWN_G (9.81): erzeugt Bogenbahn.
                               mass=0.32 → Scheitelpunkt ~0.23s, Boden ~1.7s
     drag                    – Luftwiderstand (exponentielles Abbremsen)
     particleRot             – Sprite-Rotation in rad/s
   ═══════════════════════════════════════════════ */

// Globale Registry aller aktiven Emitter-Instanzen
// nodeName → NWNEmitter
const emitterInstances = {};

// ─────────────────────────────────────────────
//  NWNParticle  —  ein einzelner Partikel
// ─────────────────────────────────────────────
class NWNParticle {
  /**
   * @param {THREE.Texture} baseTex    – Shared Canvas-Texture (textureCache-Eintrag)
   * @param {number}        xgrid      – Sprite-Sheet Spalten
   * @param {number}        ygrid      – Sprite-Sheet Zeilen
   * @param {string}        renderMode – NWN render-Modus des Emitters (z.B. 'Billboard_to_World_Z')
   */
  constructor(baseTex, xgrid, ygrid, renderMode) {
    this.xgrid = xgrid;
    this.ygrid = ygrid;

    // Billboard_to_World_Z: Sprite liegt flach auf dem Boden (XZ-Ebene),
    // nicht kamerazugewandt. Für alle anderen Modi: normales THREE.Sprite.
    this.isFlatBillboard =
      (renderMode || '').toLowerCase() === 'billboard_to_world_z';

    // Texture klonen: teilt Canvas-Pixeldaten, hat aber eigene offset/repeat-Vektoren.
    // THREE.Texture.clone() → new THREE.CanvasTexture mit gleicher .image (Canvas).
    // THREE.ColorManagement verarbeitet die texture.matrix automatisch jedes Frame —
    // kein needsUpdate() nötig für offset-Änderungen.
    this.tex = baseTex.clone();
    this.tex.repeat.set(1 / xgrid, -1 / ygrid);
    // Negatives repeat.y: dreht den Frame-Inhalt richtig herum.
    // Grund: mit flipY=false + UNPACK_FLIP_Y=false landet canvas row 0
    // (visuell oben) bei WebGL v=0 (Sprite-Unten) — ohne Korrektur wäre
    // jeder Frame auf dem Kopf. repeat.y < 0 invertiert die v-Richtung.

    if (this.isFlatBillboard) {
      // ── Billboard_to_World_Z: flaches Quad horizontal in der XZ-Ebene ──
      // PlaneGeometry liegt standardmäßig in der XY-Ebene (Normale = +Z).
      // Rotation −90° um X dreht sie in die XZ-Ebene (Normale = +Y = nach oben).
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
      this.obj.rotation.x = -Math.PI / 2;   // in XZ-Ebene legen
    } else {
      // ── Alle anderen Modi: kamerazugewandtes Sprite ──────────────────
      this.mat = new THREE.SpriteMaterial({
        map:         this.tex,
        blending:    THREE.AdditiveBlending,
        depthWrite:  false,
        transparent: true,
        fog:         false,
      });
      this.obj = new THREE.Sprite(this.mat);
    }

    // Rückwärtskompatibilität: this.sprite bleibt als Alias erhalten
    this.sprite = this.obj;

    this.obj.visible = false;
    this.alive  = false;
    this.node   = null;
    this.age    = 0;

    // Bewegungsvektoren (Welt-Space)
    this.vx = 0; this.vy = 0; this.vz = 0;

    // Sprite-Rotation (kumulativ, rad) — für particleRot
    this.rotation = 0;

    // Zufälliger Start-Frame für "random 1"-Emitter
    this.startFrame = 0;
  }

  /**
   * Partikel aktivieren (aus Pool nehmen).
   * @param {THREE.Vector3} worldPos  – Spawn-Position in Welt-Space
   * @param {object}        node      – Geparstes Emitter-Node-Objekt aus parser.js
   * @param {THREE.Vector3} emitDir   – Lokale +Z-Achse in Welt-Space (Emissionsrichtung)
   * @param {THREE.Vector3} localX    – Lokale +X-Achse in Welt-Space (für xsize-Streuung)
   * @param {THREE.Vector3} localY    – Lokale +Y-Achse in Welt-Space (für ysize-Streuung)
   */
  spawn(worldPos, node, emitDir, localX, localY) {
    this.node       = node;
    this.age        = 0;
    this.alive      = true;
    this.rotation   = 0;
    this.obj.visible = true;

    // ── Emitter-Richtung ─────────────────────────────────────────────
    const dir = (emitDir && emitDir.lengthSq() > 0.01)
      ? emitDir.clone().normalize()
      : new THREE.Vector3(0, 0, 1);

    // Lokale Achsen für Spawn-Fläche (Fallback: senkrecht zu dir ableiten)
    let lx = localX, ly = localY;
    if (!lx || !ly) {
      lx = new THREE.Vector3();
      if (Math.abs(dir.x) < 0.9) lx.set(1, 0, 0); else lx.set(0, 1, 0);
      lx.crossVectors(lx, dir).normalize();
      ly = new THREE.Vector3().crossVectors(dir, lx).normalize();
    }

    // ── Spawn-Position: xsize/ysize definieren die Emitter-Fläche in cm ─
    // NWN-Wiki: "particles are emitted randomly within the x/y boundaries (in cm)"
    // Umrechnung: cm → NWN-Einheiten (÷100), Half-Extent (÷2) → Divisor 200
    const halfX = (node.xsize || 0) / 200;
    const halfY = (node.ysize || 0) / 200;
    const ox = (Math.random() - 0.5) * 2 * halfX;
    const oy = (Math.random() - 0.5) * 2 * halfY;
    this.obj.position.set(
      worldPos.x + lx.x * ox + ly.x * oy,
      worldPos.y + lx.y * ox + ly.y * oy,
      worldPos.z + lx.z * ox + ly.z * oy
    );

    // ── Geschwindigkeit: Kegel-Spread um die Emissionsrichtung ────────
    const sp  = Math.max(node.spread || 0, 0);
    const rv  = node.randvel || 0;
    const vel = (node.velocity || 0) + (Math.random() - 0.5) * rv;

    if (sp > 0 && vel !== 0) {
      // Gleichmäßige Verteilung auf Kegeloberfläche (half-angle = spread/2)
      const halfAngle = sp * 0.5;
      const coneAngle = Math.random() * halfAngle;
      const phi       = Math.random() * Math.PI * 2;
      const sinC      = Math.sin(coneAngle);
      const cosC      = Math.cos(coneAngle);
      this.vx = (dir.x * cosC + lx.x * sinC * Math.cos(phi) + ly.x * sinC * Math.sin(phi)) * vel;
      this.vy = (dir.y * cosC + lx.y * sinC * Math.cos(phi) + ly.y * sinC * Math.sin(phi)) * vel;
      this.vz = (dir.z * cosC + lx.z * sinC * Math.cos(phi) + ly.z * sinC * Math.sin(phi)) * vel;
    } else {
      // Kein Spread: direkt entlang Emitter-Achse + randvel-Rauschen
      this.vx = dir.x * vel + (Math.random() - 0.5) * rv;
      this.vy = dir.y * vel + (Math.random() - 0.5) * rv;
      this.vz = dir.z * vel + (Math.random() - 0.5) * rv;
    }

    // Zufälliger Start-Frame (random 1 in NWN-Format → jeder Partikel beginnt anders)
    const totalFrames = node.frameEnd - node.frameStart + 1;
    this.startFrame   = node.frameStart + Math.floor(Math.random() * totalFrames);
  }

  /**
   * Partikel für einen Frame aktualisieren.
   * @param  {number}  dt   – Delta-Zeit in Sekunden
   * @returns {boolean}     – false wenn der Partikel gestorben ist
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

    const t = this.age / node.lifeExp;   // normierte Lebenszeit 0..1

    // ── Position (Euler-Integration) ──────────────────────────────
    this.obj.position.x += this.vx * dt;
    this.obj.position.y += this.vy * dt;
    this.obj.position.z += this.vz * dt;

    // NWN-Gravitation: Das Aurora Engine skaliert 'mass' mit der Erdbeschleunigung.
    // mass=1.0 → Partikel fällt mit ca. 9.81 NWN-Einheiten/s² (Erdschwerkraft).
    // mass=0.32 → eff. 3.14/s² → Scheitelpunkt bei t≈0.23s, Partikel erreicht
    // den Boden (Δy≈−3.9) nach t≈1.7s — erzeugt den sichtbaren Bogen. ✓
    const NWN_G = 9.81;
    if (node.mass) {
      this.vy -= node.mass * NWN_G * dt;
    }

    // Drag: exponentielles Abbremsen — simuliert Luftwiderstand
    // Formel: v *= (1 - drag)^dt  ≈  v * e^(-drag * dt)
    const drag = node.drag || 0;
    if (drag > 0) {
      const damping = Math.pow(Math.max(1 - drag, 0), dt);
      this.vx *= damping;
      this.vy *= damping;
      this.vz *= damping;
    }

    // Sprite-Rotation: particleRot = Winkelgeschwindigkeit in rad/s
    // Für Billboard_to_World_Z: Rotation um Welt-Y-Achse (Spin auf dem Boden).
    // Für normale Sprites: Rotation im Screen-Space (SpriteMaterial.rotation).
    if (node.particleRot) {
      this.rotation += node.particleRot * dt;
      if (this.isFlatBillboard) {
        this.obj.rotation.y = this.rotation;
      } else {
        this.mat.rotation = this.rotation;
      }
    }

    // ── Größe: sizeStart → [sizeMid] → sizeEnd ────────────────────
    // NWN: sizeMid = 0 bedeutet "nicht verwendet" → lineares Lerp Start→End
    const sS = node.sizeStart, sM = node.sizeMid, sE = node.sizeEnd;
    let size;
    if (Math.abs(sM) < 1e-4) {
      // Lineares Lerp
      size = sS + (sE - sS) * t;
    } else {
      // Drei-Punkt-Lerp mit Midpoint bei t=0.5
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

    // ── Farbe: colorStart → colorEnd (lineares Lerp) ──────────────
    const cS = node.colorStart, cE = node.colorEnd;
    this.mat.color.setRGB(
      cS[0] + (cE[0] - cS[0]) * t,
      cS[1] + (cE[1] - cS[1]) * t,
      cS[2] + (cE[2] - cS[2]) * t
    );

    // ── Sprite-Sheet-Frame ─────────────────────────────────────────
    // fps steuert die Animations-Rate unabhängig von der Lebensdauer.
    // startFrame ermöglicht randomisierten Einstieg (random=1).
    //
    // UV-Koordinaten-Berechnung (flipY=false + TGA-vertikaler Flip):
    //   canvas.row[0] = visuell unten (nach TGA-Flip im Parser)
    //   → canvasRow = (ygrid-1) - visualRow  (Umkehrung)
    const fps         = node.fps > 0 ? node.fps : 25;
    const totalFrames = node.frameEnd - node.frameStart + 1;
    const elapsed     = this.startFrame - node.frameStart + this.age * fps;
    const frameIdx    = node.frameStart + (Math.floor(elapsed) % totalFrames + totalFrames) % totalFrames;

    const col       = frameIdx % this.xgrid;
    const canvasRow = Math.floor(frameIdx / this.xgrid);
    // Kein Y-Flip nötig: der TGA-Parser + Three.js flipY=false + UV-Matrix
    // (v → 1-v) heben sich gegenseitig auf — canvasRow = visualRow.
    // offset.y = (canvasRow+1)/ygrid weil repeat.y negativ: die untere Kante
    // des Frames liegt bei offset.y, die obere bei offset.y - |repeat.y|.
    this.tex.offset.set(col / this.xgrid, (canvasRow + 1) / this.ygrid);
    // Kein needsUpdate() nötig: texture.matrix (enthält offset) wird vom
    // Renderer automatisch jedes Frame als Uniform hochgeladen.

    return true;
  }

  /** GPU-Ressourcen freigeben */
  dispose() {
    this.tex.dispose();
    this.mat.dispose();
    this.alive = false;
  }
}


// ─────────────────────────────────────────────
//  Hilfsfunktion: lineares Interpolieren eines 1D-Controller-Keys
//  keys: [{t, vals:[v]}, ...]   (aus parser.js emitterKeys)
//  t:    aktuelle Animationszeit in Sekunden
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
//  NWNEmitter  —  Partikel-Pool und Spawn-Logik
// ─────────────────────────────────────────────
class NWNEmitter {
  /** @param {object} node – Geparstes Emitter-Node-Objekt */
  constructor(node) {
    this.node        = node;
    this.pool        = [];    // inaktive Partikel (bereit zum Recycling)
    this.active      = [];    // gerade lebende Partikel
    this.accumulator = 0;     // Spawn-Zeitzähler
    this.baseTex     = textureCache[node.emitterTexture] || null;
    this._buildPool();
  }

  _buildPool() {
    if (!this.baseTex) return;
    const node = this.node;
    // Maximale Birthrate ermitteln: animierter Key hat Vorrang vor statischem Wert.
    // _birthrateKeys wird von initAllEmitters() am Node hinterlegt.
    let maxBirthrate = node.birthrate;
    if (node._birthrateKeys?.length > 0) {
      maxBirthrate = Math.max(...node._birthrateKeys.map(k => k.vals[0]));
    }
    // Partikelanzahl = birthrate × lifeExp + Puffer
    const maxAlive = Math.ceil(maxBirthrate * node.lifeExp) + 6;
    for (let i = 0; i < maxAlive; i++) {
      const p = new NWNParticle(this.baseTex, node.xgrid, node.ygrid, node.renderMode);
      scene.add(p.obj);
      this.pool.push(p);
    }
  }

  /**
   * Wird aus applyTexturesToScene() aufgerufen wenn die Textur
   * nachträglich geladen wurde (Texturen nach dem Modell gedroppt).
   */
  refreshTexture() {
    const tex = textureCache[this.node.emitterTexture] || null;
    if (tex && tex !== this.baseTex) {
      // Pool komplett neu aufbauen mit der jetzt verfügbaren Textur
      this._disposeParticles();
      this.baseTex = tex;
      this._buildPool();
    }
  }

  /** Welt-Position des Emitter-Nodes abfragen */
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
    // NWN-Aurora-Konvention für Fountain: Partikel strömen entlang der lokalen +Z-Achse
    // des Emitter-Nodes (= NWN-lokales „Oben"). Der Toolset orientiert Emitter so, dass
    // local +Z in die gewünschte Emissionsrichtung zeigt; bei den Wasserfall-Emittern
    // (≈177° Rotation) zeigt +Z → Welt (−X, +Y) → erzeugt mit mass-Gravitation einen Bogen.
    return new THREE.Vector3(0, 0, 1).transformDirection(obj.matrixWorld).normalize();
  }

  /**
   * Alle drei lokalen Achsen des Emitter-Nodes in Welt-Space.
   * localX / localY spannen die Spawn-Fläche auf (für xsize/ysize).
   * emitDir (localZ) ist die Emissionsrichtung.
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

  /** Pro Frame aufrufen */
  update(dt) {
    if (!this.baseTex) return;

    // ── Effektive Birthrate ermitteln ────────────────────────────────────
    // Animierter birthratekey hat Vorrang. animState ist global aus animation.js.
    // evalKey1D interpoliert linear zwischen den Keyframes.
    let birthrate = this.node.birthrate;
    if (this.node._birthrateKeys?.length > 0) {
      birthrate = evalKey1D(this.node._birthrateKeys, animState.time);
    }

    // Aktive Partikel immer updaten (sie dürfen noch auslaufen)
    this.active = this.active.filter(p => {
      const alive = p.update(dt);
      if (!alive) this.pool.push(p);
      return alive;
    });

    // Keine neuen Partikel wenn Birthrate gerade 0 ist
    if (birthrate <= 0) return;

    // Sichtbarkeit: Node ausgeblendet → keine neuen Partikel,
    // aber bestehende Partikel dürfen noch sterben
    const obj = nodeObjects[this.node.name];
    const nodeVisible = !obj || obj.visible;

    if (nodeVisible) {
      // Neue Partikel spawnen
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
    // Aus Pool nehmen oder neuen Partikel erstellen
    let p = this.pool.pop();
    if (!p) {
      p = new NWNParticle(this.baseTex, this.node.xgrid, this.node.ygrid, this.node.renderMode);
      scene.add(p.obj);
    }
    const { emitDir, localX, localY } = this._getWorldAxes();
    p.spawn(this._getWorldPos(), this.node, emitDir, localX, localY);
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

  /** Alle GPU-Ressourcen freigeben und Sprites aus der Szene entfernen */
  dispose() {
    this._disposeParticles();
    this.baseTex = null;
  }
}


// ─────────────────────────────────────────────
//  Globale API  —  wird von anderen Modulen genutzt
// ─────────────────────────────────────────────

/**
 * Alle Emitter eines geladenen Modells initialisieren.
 * Wird am Ende von buildScene() aufgerufen (scene_build.js).
 * @param {object} model – Geparstes MDL-Modell
 */
function initAllEmitters(model) {
  clearAllEmitters();
  if (!model) return;
  for (const node of model.nodes) {
    if (node.type !== 'emitter') continue;
    if (!node.emitterTexture)    continue;

    // ── Birthratekey aus Animations-Daten suchen ────────────────────────
    // NWN-Effektmodelle haben oft birthrate=0 im Geometrieblock und steuern
    // den Spawn-Verlauf ausschließlich über birthratekey in der Animation.
    // Wir suchen die erste Animation mit birthratekey-Daten für diesen Node.
    node._birthrateKeys = null;
    for (const anim of (model.animations || [])) {
      const keys = anim.nodes[node.name]?.emitterKeys?.birthrate;
      if (keys?.length > 0) {
        node._birthrateKeys = keys;
        break;
      }
    }

    const hasBirthrate = node.birthrate > 0 || node._birthrateKeys !== null;
    if (!hasBirthrate) continue;   // Emitter ohne jegliche Birthrate-Definition

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
 * Alle aktiven Emitter für einen Frame updaten.
 * Wird im Render-Loop von animation.js aufgerufen.
 * @param {number} dt – Delta-Zeit in Sekunden
 */
function tickAllEmitters(dt) {
  for (const inst of Object.values(emitterInstances)) {
    inst.update(dt);
  }
}

/**
 * Alle Emitter und ihre Sprites aus der Szene entfernen.
 * Wird in clearSession() (session.js) aufgerufen.
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
 * Emitter-Texturen aktualisieren wenn Texturen nachträglich geladen wurden.
 * Wird in applyTexturesToScene() (session.js) aufgerufen.
 */
function refreshEmitterTextures() {
  for (const inst of Object.values(emitterInstances)) {
    inst.refreshTexture();
  }
}
