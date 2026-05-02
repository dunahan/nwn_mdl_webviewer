/* ═══════════════════════════════════════════════
   NWN MDL Viewer — Particle Emitter Engine
   (Sprite-Sheet-Animation + Partikel-Pool)

   Unterstützt NWN Aurora Emitter-Nodes:
     update Fountain  – Partikel strömen vom Emitter-Punkt
     blend  Lighten   – AdditiveBlending (beste Annäherung in WebGL)
     xgrid/ygrid      – Sprite-Sheet-Raster (z.B. 4×4 = 16 Frames)
     fps/frameStart/frameEnd – Animations-Rate und Frame-Bereich
     birthrate/lifeExp       – Spawn-Rate und Lebensdauer
     sizeStart/Mid/End       – Größenverlauf
     alphaStart/Mid/End      – Transparenzverlauf
     colorStart/End          – Farbverlauf
   ═══════════════════════════════════════════════ */

// Globale Registry aller aktiven Emitter-Instanzen
// nodeName → NWNEmitter
const emitterInstances = {};

// ─────────────────────────────────────────────
//  NWNParticle  —  ein einzelner Partikel
// ─────────────────────────────────────────────
class NWNParticle {
  /**
   * @param {THREE.Texture} baseTex   – Shared Canvas-Texture (textureCache-Eintrag)
   * @param {number}        xgrid     – Sprite-Sheet Spalten
   * @param {number}        ygrid     – Sprite-Sheet Zeilen
   */
  constructor(baseTex, xgrid, ygrid) {
    this.xgrid = xgrid;
    this.ygrid = ygrid;

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

    this.mat = new THREE.SpriteMaterial({
      map:         this.tex,
      blending:    THREE.AdditiveBlending,   // Lighten ≈ Additive in WebGL
      depthWrite:  false,
      transparent: true,
      fog:         false,
    });

    this.sprite = new THREE.Sprite(this.mat);
    this.sprite.visible = false;
    this.alive  = false;
    this.node   = null;
    this.age    = 0;

    // Bewegungsvektoren (Welt-Space)
    this.vx = 0; this.vy = 0; this.vz = 0;

    // Zufälliger Start-Frame für "random 1"-Emitter
    this.startFrame = 0;
  }

  /**
   * Partikel aktivieren (aus Pool nehmen).
   * @param {THREE.Vector3} worldPos  – Spawn-Position in Welt-Space
   * @param {object}        node      – Geparstes Emitter-Node-Objekt aus parser.js
   */
  spawn(worldPos, node) {
    this.node       = node;
    this.age        = 0;
    this.alive      = true;
    this.sprite.visible = true;

    // Spread: seitliche Streuung am Spawn-Punkt
    const sp = Math.max(node.spread || 0, 0);
    this.sprite.position.set(
      worldPos.x + (Math.random() - 0.5) * sp * 0.5,
      worldPos.y,
      worldPos.z + (Math.random() - 0.5) * sp * 0.5
    );

    // Geschwindigkeit: Fountain → hauptsächlich +Y (Three.js Welt-Up)
    // randvel addiert Zufall in alle Richtungen
    const rv   = node.randvel || 0;
    const vel  = (node.velocity || 0) + (Math.random() - 0.5) * rv;
    this.vx    = (Math.random() - 0.5) * rv;
    this.vy    = Math.max(vel, 0);   // Flamme geht aufwärts
    this.vz    = (Math.random() - 0.5) * rv;

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
      this.sprite.visible = false;
      return false;
    }

    const t = this.age / node.lifeExp;   // normierte Lebenszeit 0..1

    // ── Position (Euler-Integration) ──────────────────────────────
    this.sprite.position.x += this.vx * dt;
    this.sprite.position.y += this.vy * dt;
    this.sprite.position.z += this.vz * dt;
    this.vy -= (node.grav || 0) * dt;   // Schwerkraft (bei Flammen meist 0)

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
    this.sprite.scale.setScalar(Math.max(size, 0.001));

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
      const p = new NWNParticle(this.baseTex, node.xgrid, node.ygrid);
      scene.add(p.sprite);
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
      p = new NWNParticle(this.baseTex, this.node.xgrid, this.node.ygrid);
      scene.add(p.sprite);
    }
    p.spawn(this._getWorldPos(), this.node);
    this.active.push(p);
  }

  _disposeParticles() {
    for (const p of [...this.active, ...this.pool]) {
      scene.remove(p.sprite);
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
      logInfo('[Emitter] "' + node.name + '" initialisiert'
        + (texOk ? '' : ' (Textur ausstehend: "' + node.emitterTexture + '")')
        + keyTag
      );
    } catch (err) {
      logWarn('[Emitter] "' + node.name + '" Fehler: ' + err.message);
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
