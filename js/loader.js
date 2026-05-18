/* ═══════════════════════════════════════════════
   NWN MDL Viewer — File Loader & Supermodel Merge
   ═══════════════════════════════════════════════ */

//  Multi-File Loader  (MDL + Texturen gleichzeitig)
// ─────────────────────────────────────────────
function loadFiles(fileList) {
  if (!fileList || fileList.length === 0) return;

  const files    = Array.from(fileList);
  const mdlFiles = files.filter(f => f.name.toLowerCase().endsWith('.mdl') || f.name.toLowerCase().endsWith('.txt'));
  const texFiles = files.filter(f => /\.(tga|png|jpg|jpeg|dds|plt)$/i.test(f.name));
  const mtrFiles = files.filter(f => /\.mtr$/i.test(f.name));
  const wokFiles = files.filter(f => /\.wok$/i.test(f.name));
  const pwkFiles = files.filter(f => /\.pwk$/i.test(f.name));
  const dwkFiles = files.filter(f => /\.dwk$/i.test(f.name));

  if (mdlFiles.length === 0 && texFiles.length === 0 && mtrFiles.length === 0
      && wokFiles.length === 0 && pwkFiles.length === 0 && dwkFiles.length === 0) {
    setStatus(L('status_no_files'));
    return;
  }

  if (mdlFiles.length > 0) {
    const isSupermodelLoad = pendingSupermodel && currentModel &&
      mdlFiles.some(f => f.name.replace(/\.[^.]+$/, '').toLowerCase() === pendingSupermodel.toLowerCase());
    if (!isSupermodelLoad) {
      clearSession();
      clearLog();
    }
  }

  setStatus(fmt('status_loading', { n: files.length }));

  // Gesamtzähler: Texturen + MTR müssen beide fertig sein vor onAllTexReady
  let texPending = texFiles.length;
  let mtrPending = mtrFiles.length;
  let texLoaded  = 0;

  function onAllTexReady() {
    updateTextureUI();
    buildPLTPanel();
    if (mdlFiles.length > 0) {
      loadAllMDLFiles(mdlFiles);
    } else if (currentModel) {
      const n = applyTexturesToScene();
      if (typeof HotReload !== 'undefined') HotReload.onModelLoaded();
      resolveMissingTextures();
      setStatus(fmt('status_tex_applied', { n }));
    }
  }

  function checkAllReady() {
    if (texPending === 0 && mtrPending === 0) onAllTexReady();
  }

  // MTR-Dateien als Text einlesen
  for (const file of mtrFiles) {
    const key = basename(file.name);
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        mtrCache[key] = parseMTR(ev.target.result);
        logInfoI18n('status_mtr_loaded', { name: file.name });
      } catch(err) {
        logErrorI18n('status_mtr_error', { name: file.name, msg: err.message });
      }
      mtrPending--;
      checkAllReady();
    };
    reader.onerror = () => {
      logError(file.name + ' — ' + L('status_read_error'));
      mtrPending--;
      checkAllReady();
    };
    reader.readAsText(file);
  }

  // WOK-Dateien direkt als Text einlesen (unabhängig von MDL/Texturen)
  for (const file of wokFiles) {
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const wok = parseWOK(ev.target.result);
        buildWalkMesh(wok);
        // Walkmesh-Button im UI aktivieren
        const btn = document.getElementById('btn-walkmesh');
        if (btn) btn.disabled = false;
      } catch (err) {
        logErrorI18n('err_wok_load', { name: file.name, msg: err.message });
      }
    };
    reader.readAsText(file);
  }

  // PWK-Dateien direkt als Text einlesen
  for (const file of pwkFiles) {
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const pwk = parsePWK(ev.target.result);
        buildPWKMesh(pwk);
        const btn = document.getElementById('btn-pwk');
        if (btn) btn.disabled = false;
      } catch (err) {
        logErrorI18n('err_pwk_load', { name: file.name, msg: err.message });
      }
    };
    reader.readAsText(file);
  }

  // DWK-Dateien direkt als Text einlesen
  for (const file of dwkFiles) {
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const dwk = parseDWK(ev.target.result);
        buildDWKMesh(dwk);
        const btn = document.getElementById('btn-dwk');
        if (btn) btn.disabled = false;
      } catch (err) {
        logErrorI18n('err_dwk_load', { name: file.name, msg: err.message });
      }
    };
    reader.readAsText(file);
  }

  if (texPending === 0 && mtrPending === 0) {
    onAllTexReady();
    return;
  }

  for (const file of texFiles) {
    const key = basename(file.name);
    const ext = file.name.split('.').pop().toLowerCase();

    if (ext === 'tga') {
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          textureCache[key] = parseTGA(ev.target.result);
          texLoaded++;
          setStatus(fmt('status_tex_loaded', { name: file.name, n: texLoaded, total: texFiles.length }));
        } catch(err) {
          logErrorI18n('err_tga_load', { name: file.name, msg: err.message });
          setStatus(fmt('status_tga_error', { name: file.name, msg: err.message }));
        }
        texPending--;
        checkAllReady();
      };
      reader.onerror = () => {
        logError(file.name + ' — ' + L('status_read_error'));
        setStatus(fmt('status_read_error'));
        texPending--;
        checkAllReady();
      };
      reader.readAsArrayBuffer(file);
    } else if (ext === 'dds') {
      // NWN/Bioware custom DDS (kein Standard-DDS-Header)
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          textureCache[key] = parseNWNDDS(ev.target.result);
          texLoaded++;
          setStatus(fmt('status_tex_loaded', { name: file.name, n: texLoaded, total: texFiles.length }));
        } catch(err) {
          logErrorI18n('err_dds_load', { name: file.name, msg: err.message });
          setStatus(fmt('status_tga_error', { name: file.name, msg: err.message }));
        }
        texPending--;
        checkAllReady();
      };
      reader.onerror = () => {
        logError(file.name + ' — ' + L('status_read_error'));
        setStatus(fmt('status_read_error'));
        texPending--;
        checkAllReady();
      };
      reader.readAsArrayBuffer(file);
    } else if (ext === 'plt') {
      // NWN/Bioware PLT (Palette Texture)
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          textureCache[key] = parseNWNPLT(ev.target.result);
          textureCache[key].userData.pltTexKey = key;  // für per-Part Paletten-Lookup
          texLoaded++;
          setStatus(fmt('status_tex_loaded', { name: file.name, n: texLoaded, total: texFiles.length }));
        } catch(err) {
          logErrorI18n('err_plt_load', { name: file.name, msg: err.message });
          setStatus(fmt('status_tga_error', { name: file.name, msg: err.message }));
        }
        texPending--;
        checkAllReady();
      };
      reader.onerror = () => {
        logError(file.name + ' — ' + L('status_read_error'));
        setStatus(fmt('status_read_error'));
        texPending--;
        checkAllReady();
      };
      reader.readAsArrayBuffer(file);
    } else {
      // PNG/JPG: Browser kann das nativ
      const url = URL.createObjectURL(file);
      const loader = new THREE.TextureLoader();
      loader.load(url, tex => {
        tex.flipY = false;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.userData.hasAlpha = false;
        textureCache[key] = tex;
        texLoaded++;
        setStatus(fmt('status_tex_loaded', { name: file.name, n: texLoaded, total: texFiles.length }));
        texPending--;
        checkAllReady();
      }, undefined, () => {
        texPending--;
        checkAllReady();
      });
    }
  }
}

// ─────────────────────────────────────────────
//  Supermodel-Animations-Merge
// ─────────────────────────────────────────────
function mergeAnimationsFromSupermodel(mainModel, superModel) {
  if (superModel.animations.length === 0) {
    logWarnI18n('super_no_anims', { name: superModel.name });
    return;
  }

  const mainNodeNames = new Set(mainModel.nodes.map(n => n.name));

  for (const anim of superModel.animations) {
    const remapped = { name: anim.name, length: anim.length, transtime: anim.transtime, nodes: {} };
    for (const [nodeName, data] of Object.entries(anim.nodes)) {
      // Root-Node-Name remappen: supermodel.name → mainmodel.name
      const mapped = (nodeName === superModel.name) ? mainModel.name : nodeName;
      if (mainNodeNames.has(mapped) || mapped === mainModel.name) {
        remapped.nodes[mapped] = data;
      }
    }
    mainModel.animations.push(remapped);
  }
  mainModel.animCount = mainModel.animations.length;

  // Rest-Pose aus erster Animation wenn noch keine vorhanden
  if (Object.keys(mainModel.restPose).length === 0 && mainModel.animations.length > 0) {
    for (const [nodeName, data] of Object.entries(mainModel.animations[0].nodes)) {
      const firstOri = data.oriKeys[0];
      const firstPos = data.posKeys[0];
      if (firstOri || firstPos) {
        mainModel.restPose[nodeName] = {
          orientation: firstOri ? [firstOri.ax, firstOri.ay, firstOri.az, firstOri.angle] : null,
          position:    firstPos ? [firstPos.x, firstPos.y, firstPos.z] : null,
        };
      }
    }
  }

  logInfoI18n('super_anims_merged', { name: superModel.name, n: superModel.animations.length });
}

// ─────────────────────────────────────────────
//  Fehlende-Texturen-Report
// ─────────────────────────────────────────────

// DOM-Referenzen der Log-Einträge: texname → <div.log-entry>
// '__header__' ist der Zähler-Eintrag oben.
const _missingTexEntries = {};

// Gibt die Textur-Keys (lowercase, ohne Extension) eines einzelnen Nodes zurück.
// Wird von hot_reload.js für die Node-Watch-Indikatoren im Szene-Graph genutzt.
function getNodeTexKeys(node) {
  const keys   = new Set();
  const mtrKey = node.materialname
    ? node.materialname.toLowerCase()
    : (node.bitmap ? node.bitmap.toLowerCase() : null);
  const mtr    = mtrKey ? (mtrCache[mtrKey] || null) : null;

  if (mtr) {
    for (let i = 0; i <= 5; i++) {
      if (mtr.textures[i]) keys.add(mtr.textures[i].toLowerCase());
    }
  } else {
    if (node.bitmap) keys.add(node.bitmap.toLowerCase());
    if (node.textures) {
      for (const t of Object.values(node.textures)) {
        if (t && t !== 'null') keys.add(t.toLowerCase());
      }
    }
  }
  if (node.emitterTexture) keys.add(node.emitterTexture.toLowerCase());
  keys.delete('null');
  keys.delete('');
  return keys;
}

// Gibt alle vom Modell benötigten Textur-Keys (lowercase, ohne Extension) zurück.
// Gemeinsame Basis für logMissingTextures() und HotReload._fillMissingTextures().
function getNeededTextures(model) {
  const needed = new Set();
  if (!model) return needed;

  for (const node of model.nodes) {
    const mtrKey = node.materialname
      ? node.materialname.toLowerCase()
      : (node.bitmap ? node.bitmap.toLowerCase() : null);
    const mtr = mtrKey ? (mtrCache[mtrKey] || null) : null;

    if (mtr) {
      for (let i = 0; i <= 5; i++) {
        if (mtr.textures[i]) needed.add(mtr.textures[i].toLowerCase());
      }
    } else {
      if (node.bitmap) needed.add(node.bitmap.toLowerCase());
      if (node.textures) {
        for (const t of Object.values(node.textures)) {
          if (t && t !== 'null') needed.add(t.toLowerCase());
        }
      }
    }
    if (node.emitterTexture) needed.add(node.emitterTexture.toLowerCase());
  }

  needed.delete('null');
  needed.delete('');
  return needed;
}

function logMissingTextures(model) {
  if (!model) return;

  // Alte Referenzen beim Neu-Laden verwerfen
  for (const key of Object.keys(_missingTexEntries)) delete _missingTexEntries[key];

  const needed  = getNeededTextures(model);
  const missing = [...needed].filter(name => !textureCache[name]).sort();

  const logEntries = document.getElementById('log-entries');

  if (missing.length === 0) {
    logInfoI18n('tex_missing_none');
    return;
  }

  logWarnI18n('tex_missing_header', { n: missing.length });
  _missingTexEntries['__header__'] = logEntries.lastElementChild;

  for (const name of missing) {
    logWarn('  ✕ ' + name);
    _missingTexEntries[name] = logEntries.lastElementChild;
  }
}

// Wird aufgerufen wenn Texturen nachgeladen werden (ohne neues MDL).
// Entfernt aufgelöste Einträge aus dem Log und aktualisiert den Header-Zähler.
function resolveMissingTextures() {
  if (Object.keys(_missingTexEntries).length === 0) return;

  let remaining = 0;

  for (const [name, el] of Object.entries(_missingTexEntries)) {
    if (name === '__header__') continue;
    if (textureCache[name]) {
      el?.parentNode?.removeChild(el);
      delete _missingTexEntries[name];
    } else {
      remaining++;
    }
  }

  const headerEl = _missingTexEntries['__header__'];
  if (!headerEl) return;

  if (remaining === 0) {
    // Alle aufgelöst: Header entfernen, ✓-Meldung loggen
    headerEl.parentNode?.removeChild(headerEl);
    delete _missingTexEntries['__header__'];
    logInfoI18n('tex_missing_none');
  } else {
    // Zähler im Header aktualisieren
    const msgSpan = headerEl.querySelector('.log-msg');
    if (msgSpan) msgSpan.textContent = fmt('tex_missing_header', { n: remaining });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Character-Part Positionierung  (Fall D)
//
//  Modus A – Mit Basis-Skelett (z.B. pmh0.mdl):
//    Traversiert die Node-Hierarchie des Skeletts, berechnet Weltpositionen
//    aller Attachment-Nodes (_g-Suffixe) und platziert jedes Part exakt dort.
//
//  Modus B – Ohne Skelett (Fallback):
//    Bounding-Box-Stacking entlang der NWN-Z-Achse (Z = hoch).
// ─────────────────────────────────────────────────────────────────────────────
function positionCharacterParts(charParts, skeletonModel) {
  if (typeof scene === 'undefined' || typeof THREE === 'undefined') return;

  // ── Hilfsfunktionen ──────────────────────────────────────────────────────

  // "pmh0_chest001" → "chest"
  function partKey(name) {
    const m = name.match(/^p[mf][a-z]\d_([a-z]+)\d+$/i);
    return m ? m[1].toLowerCase() : '';
  }
  function findPart(keyword) {
    return charParts.find(p => partKey(p.name) === keyword) || null;
  }
  function findRoot(partName) {
    return scene.getObjectByName(partName) || null;
  }

  // ── Phase 0: Alle Parts auf Ursprung zurücksetzen ─────────────────────────
  // (Binary-MDL-Attachment-Offsets aus buildScene eliminieren)
  for (const part of charParts) {
    const root = findRoot(part.name);
    if (root) root.position.set(0, 0, 0);
  }
  scene.updateMatrixWorld(true);

  // ══════════════════════════════════════════════════════════════════════════
  //  Modus A: Skelett-basierte Positionierung
  // ══════════════════════════════════════════════════════════════════════════
  if (skeletonModel) {

    // NWN Part-Kürzel → Attachment-Node-Name im Skelett
    // Quelle: pmh0.mdl-Analyse (gilt für alle pm[mf][0-9].mdl Basisskelette)
    const BONE_MAP = {
      'chest':  'torso_g',
      'pelvis': 'pelvis_g',
      'belt':   'belt_g1',
      'neck':   'neck_g',
      'head':   'head_g',
      'shol':   'lbicep_g',    // Schulterplatte: Schultergelenk links
      'shor':   'rbicep_g',    //                 Schultergelenk rechts
      'bicepl': 'lbicep_g',    // Oberarm links
      'bicepr': 'rbicep_g',    // Oberarm rechts
      'forel':  'lforearm_g',  // Unterarm links
      'forer':  'rforearm_g',  // Unterarm rechts
      'handl':  'lhand_g',     // Hand links
      'handr':  'rhand_g',     // Hand rechts
      'legl':   'lthigh_g',    // Oberschenkel links
      'legr':   'rthigh_g',    // Oberschenkel rechts
      'shinl':  'lshin_g',     // Schienbein links
      'shinr':  'rshin_g',     // Schienbein rechts
      'footl':  'lfoot_g',     // Fuß links
      'footr':  'rfoot_g',     // Fuß rechts
    };

    // Weltpositionen aller Skelett-Nodes durch Traversierung der Hierarchie
    const nodeMap = {};
    for (const n of skeletonModel.nodes) nodeMap[n.name.toLowerCase()] = n;

    const worldPos = {};
    function computeWorld(name) {
      const key = name.toLowerCase();
      if (key in worldPos) return worldPos[key];
      const n = nodeMap[key];
      if (!n) return (worldPos[key] = { x: 0, y: 0, z: 0 });

      const pos = n.position || [0, 0, 0];
      const lx = Array.isArray(pos) ? (pos[0] || 0) : (pos.x || 0);
      const ly = Array.isArray(pos) ? (pos[1] || 0) : (pos.y || 0);
      const lz = Array.isArray(pos) ? (pos[2] || 0) : (pos.z || 0);

      const par = (n.parent || '').toLowerCase().trim();
      if (!par || par === 'null') {
        worldPos[key] = { x: lx, y: ly, z: lz };
      } else {
        const p = computeWorld(par);
        worldPos[key] = { x: p.x + lx, y: p.y + ly, z: p.z + lz };
      }
      return worldPos[key];
    }
    for (const n of skeletonModel.nodes) computeWorld(n.name);

    // Jedes Part an seinem Attachment-Node platzieren
    for (const part of charParts) {
      const bone = BONE_MAP[partKey(part.name.toLowerCase())];
      if (!bone) continue;
      const wp = worldPos[bone];
      if (!wp) continue;
      const root = findRoot(part.name);
      if (root) root.position.set(wp.x, wp.y, wp.z);
      logInfoI18n('log_char_bone', { part: part.name, bone, z: wp.z.toFixed(3) });
    }

    logInfoI18n('log_char_positioned');
    return;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Modus B: Bounding-Box-Stacking (Fallback ohne Skelett)
  // ══════════════════════════════════════════════════════════════════════════

  // Phase 1: Bounding-Boxes nach Phase-0-Reset
  const origBox = {};
  for (const part of charParts) {
    const root = findRoot(part.name);
    if (!root) continue;
    const box = new THREE.Box3().setFromObject(root);
    if (!box.isEmpty()) origBox[part.name] = box;
  }

  // Phase 2a: Wirbelsäule + Beine entlang Z-Achse (NWN: Z = hoch)
  const SPINE_GROUPS = [
    ['footl', 'footr'], ['shinl', 'shinr'], ['legl', 'legr'],
    ['pelvis'], ['belt'], ['chest'], ['neck'], ['head'],
  ];

  let floorZ = 0, chestTopZ = 0;

  for (const keys of SPINE_GROUPS) {
    const parts = keys.map(findPart).filter(Boolean);
    if (!parts.length) continue;
    let gMinZ = Infinity, gMaxZ = -Infinity;
    for (const p of parts) {
      const b = origBox[p.name];
      if (!b) continue;
      if (b.min.z < gMinZ) gMinZ = b.min.z;
      if (b.max.z > gMaxZ) gMaxZ = b.max.z;
    }
    if (!isFinite(gMinZ)) continue;
    const offset = floorZ - gMinZ;
    for (const p of parts) {
      const root = findRoot(p.name);
      if (root) root.position.z += offset;
    }
    floorZ += (gMaxZ - gMinZ);
    if (keys.includes('chest')) chestTopZ = floorZ;
  }
  if (chestTopZ === 0) chestTopZ = floorZ;

  // Phase 2b: Arme hängen abwärts von der Brust-Oberkante
  const ARM_CHAINS = [
    ['shol', 'bicepl', 'forel', 'handl'],
    ['shor', 'bicepr', 'forer', 'handr'],
  ];
  for (const chain of ARM_CHAINS) {
    let armTopZ = chestTopZ;
    for (const key of chain) {
      const part = findPart(key);
      if (!part) continue;
      const b = origBox[part.name];
      if (!b) continue;
      const root = findRoot(part.name);
      if (root) root.position.z += armTopZ - b.max.z;
      armTopZ = b.min.z + (armTopZ - b.max.z);
    }
  }

  logInfoI18n('log_char_positioned');
}

// ─────────────────────────────────────────────
//  MDL-Loader  (Einzel- oder Mehrfach-Dateien)
// ─────────────────────────────────────────────
function loadAllMDLFiles(mdlFiles) {
  const texts = {};
  let pending = mdlFiles.length;

  function onAllRead() {
    // Alle Dateien parsen
    const parsed = {};
    for (const [baseName, text] of Object.entries(texts)) {
      try {
        parsed[baseName] = parseMDL(text);
      } catch (err) {
        logError(fmt('super_mdl_error', { name: baseName }) + ' — ' + err.message);
      }
    }
    if (Object.keys(parsed).length === 0) return;

    // ── Fall A: Supermodel nachladen ──────────────────────────────────
    // Ein Modell wartet bereits auf sein Supermodel.
    if (pendingSupermodel && currentModel) {
      const superName = pendingSupermodel.toLowerCase();
      const superModel =
        parsed[superName] ||
        Object.values(parsed).find(m => m.name.toLowerCase() === superName);

      if (superModel) {
        mergeAnimationsFromSupermodel(currentModel, superModel);
        pendingSupermodel = null;
        applyRestPose(currentModel);
        saveGeometryPose();
        buildAnimUI(currentModel);
        setStatus(fmt('super_anims_loaded', { name: superModel.name, n: currentModel.animations.length }));
      } else {
        logWarnI18n('super_not_found');
      }
      return;
    }

    // ── Fall D: Character Part Assembly (pmX#_PART### – Körperteile dynamischer Charaktere) ──
    // Erkennt optional das Basis-Skelett (pmh0, pmf0, …) unter den geladenen Dateien.
    // Mit Skelett → exakte Attachment-Positionen aus der Node-Hierarchie.
    // Ohne Skelett → BB-Stacking als Fallback.
    {
      const allParsed = Object.values(parsed);
      if (allParsed.length > 1) {
        const charPartRx    = /^p[mf][a-z]\d_[a-z]+\d+$/i;
        const baseSkeletonRx = /^p[mf][a-z]\d$/i;

        const charParts     = allParsed.filter(m => charPartRx.test(m.name));
        const skeletonModel = allParsed.find(m => baseSkeletonRx.test(m.name)) || null;

        // Fall D greift wenn: nur Parts geladen  ODER  Skelett + Parts  ODER
        // Skelett + Parts + Supermodel des Skeletts (z.B. a_fa.mdl).
        // Das Supermodel-MDL wird beim nonPartNonSkeleton-Check ausgeschlossen,
        // damit es Fall D nicht verhindert (es wird später als Animation-Quelle genutzt).
        const skelSuperName = skeletonModel
          ? (skeletonModel.supermodel || '').toLowerCase()
          : '';
        const nonPartNonSkeleton = allParsed.filter(
          m => !charPartRx.test(m.name) &&
               !baseSkeletonRx.test(m.name) &&
               !(skelSuperName && skelSuperName !== 'null' &&
                 m.name.toLowerCase() === skelSuperName)
        );

        if (charParts.length > 1 && nonPartNonSkeleton.length === 0) {
          charParts.sort((a, b) => a.name.localeCompare(b.name));
          const base   = charParts.find(m => /pelvis/i.test(m.name)) || charParts[0];
          const others = charParts.filter(m => m !== base);

          logInfoI18n('log_char_assembly', { n: charParts.length, base: base.name });

          for (const part of others) {
            for (const node of part.nodes) base.nodes.push(node);
            logInfoI18n('log_char_part', { part: part.name, base: base.name });
          }

          // ── Skelett-Bone-Nodes in base integrieren ───────────────────────────
          // Die Bone-Nodes (rootdummy, torso_g, rbicep_g …) aus dem Skelett
          // (pfa0.mdl) müssen in der Szene vorhanden sein, damit:
          //   a) mergeAnimationsFromSupermodel sie als gültige Ziele akzeptiert
          //      (mainNodeNames.has(boneName) → true)
          //   b) applyAnimFrame ihre Three.js-Objekte in nodeObjects findet
          //   c) applySkinning die animierten Bone-Transforms lesen kann
          // Der Root-Node des Skeletts wird übersprungen; seine direkten Kinder
          // werden stattdessen unter base.name eingehängt (Parent-Remapping).
          if (skeletonModel) {
            const skelRootName = skeletonModel.name.toLowerCase();
            for (const node of skeletonModel.nodes) {
              if (node.name.toLowerCase() === skelRootName) continue;       // Root überspringen
              if (base.nodes.find(n => n.name === node.name)) continue;     // kein Duplikat
              const patched = Object.assign({}, node);
              if ((patched.parent || '').toLowerCase() === skelRootName) {
                patched.parent = base.name;   // direkte Skelett-Kinder an base-Root hängen
              }
              base.nodes.push(patched);
            }
            logInfoI18n('log_char_skeleton', { name: skeletonModel.name });
          }
          // ─────────────────────────────────────────────────────────────────────

          buildScene(base);
          // ── Charpart-Roots an Bones reparenten & Bone-Debug ausblenden ───────
          // positionCharacterParts() überspringen wenn Skelett vorhanden:
          // Dessen computeWorld() ignoriert Bone-Rotationen (nur additive Positionen),
          // was zu Fehlpositionierungen führt. Die Bone-Object3Ds sind bereits durch
          // Three.js korrekt im Raum platziert (inkl. Rotationen der Eltern).
          // → boneObj.add(partRoot) + position (0,0,0): Part landet exakt am Bone-Ursprung.
          if (skeletonModel) {
            const BONE_MAP = {
              'chest':  'torso_g',    'pelvis': 'pelvis_g',   'belt':   'belt_g1',
              'neck':   'neck_g',     'head':   'head_g',
              'shol':   'lbicep_g',   'shor':   'rbicep_g',
              'bicepl': 'lbicep_g',   'bicepr': 'rbicep_g',
              'forel':  'lforearm_g', 'forer':  'rforearm_g',
              'handl':  'lhand_g',    'handr':  'rhand_g',
              'legl':   'lthigh_g',   'legr':   'rthigh_g',
              'shinl':  'lshin_g',    'shinr':  'rshin_g',
              'footl':  'lfoot_g',    'footr':  'rfoot_g',
            };

            // Case-insensitive Bone-Lookup: Skelette verschiedener Modelle
            // nutzen unterschiedliche Schreibweisen (z.B. Lbicep_g vs lbicep_g).
            // BONE_MAP-Werte sind immer Kleinbuchstaben → einmalig LC-Map aufbauen.
            const nodeObjLC = {};
            for (const [k, v] of Object.entries(nodeObjects)) {
              if (k) nodeObjLC[k.toLowerCase()] = v;
            }

            // Schritt 1: Part-Roots an ihre Bones hängen, lokale Position auf (0,0,0)
            for (const part of charParts) {
              if (part === base) continue;
              const m = part.name.match(/^p[mf][a-z]\d_([a-z]+)\d+$/i);
              const boneName = BONE_MAP[m ? m[1].toLowerCase() : ''];
              if (!boneName) continue;
              const partRoot = nodeObjects[part.name];
              const boneObj  = nodeObjLC[boneName];
              if (!partRoot || !boneObj) continue;
              boneObj.add(partRoot);
              partRoot.position.set(0, 0, 0);
              partRoot.quaternion.identity();
            }

            // Pelvis-Geometrie-Kinder des Base-Roots an pelvis_g reparenten.
            // Der Base-Root selbst kann nicht verschoben werden (alle Bones hängen daran).
            // Seine Geometrie-Meshes (kein Skelett-Node) werden wie alle anderen Parts
            // direkt unter ihren Bone-Attachment-Node gehängt.
            const pelvisGObj   = nodeObjLC[BONE_MAP['pelvis']];
            const baseRootObj  = nodeObjects[base.name];
            if (pelvisGObj && baseRootObj) {
              const skelNodeNames = new Set(
                skeletonModel.nodes.map(n => n.name.toLowerCase())
              );
              for (const ch of [...baseRootObj.children]) {
                if (!skelNodeNames.has(ch.name.toLowerCase())) {
                  pelvisGObj.add(ch);
                  ch.position.set(0, 0, 0);
                  ch.quaternion.identity();
                }
              }
            }

            // Schritt 2: Bone-Debug-Meshes ausblenden.
            // Identitätsvergleich (!== child) statt Namensvergleich, weil Debug-Spheres
            // denselben Namen wie ihr Parent-Bone tragen können → nodeObjects[name] wäre
            // truthy aber zeigt auf den Bone, nicht auf das Debug-Mesh.
            const skelRootName = skeletonModel.name.toLowerCase();
            for (const node of skeletonModel.nodes) {
              if (node.name.toLowerCase() === skelRootName) continue;
              const obj = nodeObjects[node.name];
              if (!obj) continue;
              for (const child of obj.children) {
                if (nodeObjects[child.name] !== child) child.visible = false;
              }
            }
          } else {
            positionCharacterParts(charParts, skeletonModel);  // Fallback Modus B (BB-Stacking)
          }
          // ─────────────────────────────────────────────────────────────────────

          const n = applyTexturesToScene();
          if (typeof HotReload !== 'undefined') HotReload.onModelLoaded();
          logMissingTextures(base);
          if (n > 0) setStatus(fmt('status_model_tex', { name: base.name, n }));

          // ── Supermodel-Animationen aus Skelett übernehmen ─────────────────
          // Der Supermodel-Verweis steckt im Skelett (z.B. pfa0 → a_fa),
          // nicht in den einzelnen Parts. Nach dem Assembly auf base übertragen
          // und entweder sofort mergen (wenn mitgeladen) oder pendingSupermodel
          // setzen (für den Nachlade-Workflow über Fall A).
          const superSource = skeletonModel || base;
          const smName = (superSource.supermodel || '').toLowerCase();
          if (smName && smName !== 'null' && smName !== superSource.name.toLowerCase()) {
            base.supermodel = superSource.supermodel;

            const superModel =
              parsed[smName] ||
              Object.values(parsed).find(m => m.name.toLowerCase() === smName);

            if (superModel) {
              // Supermodel war unter den geladenen Dateien → sofort mergen
              mergeAnimationsFromSupermodel(base, superModel);
              applyRestPose(base);
              saveGeometryPose();
              buildAnimUI(base);
              pendingSupermodel = null;
              setStatus(fmt('super_anims_loaded', { name: superModel.name, n: base.animations.length }));
            } else {
              // Noch nicht geladen → Hinweis, Nutzer kann Supermodel nachreichen
              pendingSupermodel = base.supermodel;
              logWarnI18n('super_pending_warn', { name: base.name, super: base.supermodel });
              logInfoI18n('super_pending_info', { super: base.supermodel });
              setStatus(fmt('super_pending_status', { super: base.supermodel }));
            }
          }
          // ──────────────────────────────────────────────────────────────────

          return;
        }
      }
    }
    // ── Ende Fall D ────────────────────────────────────────────────────────────

    // ── Fall C: Multi-Part Assembly (z.B. Waffenteile _b_ / _m_ / _t_) ──────
    // Mehrere MDLs geladen, alle mit Geometrie, keines referenziert ein anderes
    // als Supermodel → als mehrteiliges Modell zusammensetzen.
    {
      const allParsed = Object.values(parsed);
      if (allParsed.length > 1) {

        // Supermodel-Namen aus allen geladenen Modellen sammeln
        const superNames = new Set(
          allParsed
            .map(m => (m.supermodel || '').toLowerCase())
            .filter(sm => sm && sm !== 'null' && sm !== '')
        );

        // Kandidaten: haben Geometrie + sind nicht das Supermodel eines anderen + haben ggfs Effekte
        const parts = allParsed.filter(m =>
          !superNames.has(m.name.toLowerCase()) &&
          m.nodes.some(n => n.type !== 'dummy')
        );


        // Nur wenn ALLE Kandidaten komplett unabhängig sind (kein setsupermodel)
        const allIndependent = parts.every(m => {
          const sm = (m.supermodel || '').toLowerCase();
          return !sm || sm === 'null' || sm === '';
        });

        if (parts.length > 1 && allIndependent) {
          // Alphabetisch sortieren → deterministisch (_b_ → _m_ → _t_)
          parts.sort((a, b) => a.name.localeCompare(b.name));
          const base = parts[0];

          for (let i = 1; i < parts.length; i++) {
            for (const node of parts[i].nodes) {
              base.nodes.push(node);
            }
            logInfoI18n('log_multi_part', { part: parts[i].name, base: base.name });
          }

          buildScene(base);
          const n = applyTexturesToScene();
          if (typeof HotReload !== 'undefined') HotReload.onModelLoaded();
          logMissingTextures(base);
          if (n > 0) setStatus(fmt('status_model_tex', { name: base.name, n }));
          return;
        }
      }
    }
    // ── Ende Fall C ────────────────────────────────────────────────────────

    // ── Fall B: Hauptmodell bestimmen ─────────────────────────────────
    // Regel: Das Hauptmodell hat einen setsupermodel-Verweis auf ein ANDERES Modell
    //        (also NICHT NULL und NICHT sich selbst).
    // Das Supermodel wird NUR für Animationen genutzt, nicht für Geometrie.

    let mainModel = null;
    let superModelCandidate = null;

    // Schritt 1: Finde Modell mit nicht-trivialem Supermodel-Verweis
    for (const model of Object.values(parsed)) {
      const sm = (model.supermodel || '').toLowerCase();
      if (sm && sm !== 'null' && sm !== '' && sm !== model.name.toLowerCase()) {
        mainModel = model;
        break;
      }
    }

    // Schritt 2: Kein Supermodel-Verweis → erstes Modell mit Geometrie bevorzugen,
    // dann Fallback auf jedes Modell mit Nodes (emitter-only, EFFECT-Klasse usw.)
    if (!mainModel) {
      for (const model of Object.values(parsed)) {
        const hasMesh = model.nodes.some(n =>
          n.type === 'trimesh' || n.type === 'skin' || n.type === 'danglymesh' || n.type === 'animmesh');
        if (hasMesh) { mainModel = model; break; }
      }
    }

    // Fallback: Modell ohne Mesh aber mit Nodes (z.B. fx_clouds: nur dummy + emitter)
    if (!mainModel) {
      for (const model of Object.values(parsed)) {
        if (model.nodes.length > 0) { mainModel = model; break; }
      }
    }

    if (!mainModel || !mainModel.nodes.length) {
      logErrorI18n('err_no_nodes');
      alert(L('err_parse_title') + '\n' + L('err_no_nodes') + '\n\n' + L('err_parse_hint'));
      return;
    }

    // Schritt 3: Supermodel suchen (NICHT als Geometrie-Basis verwenden)
    if (mainModel.supermodel) {
      const smName = mainModel.supermodel.toLowerCase();
      if (smName && smName !== 'null') {
        superModelCandidate =
          parsed[smName] ||
          Object.values(parsed).find(m =>
            m.name.toLowerCase() === smName &&
            m.name.toLowerCase() !== mainModel.name.toLowerCase());
      }
    }

    // Szene mit der Geometrie des Hauptmodells aufbauen
    buildScene(mainModel);
    const n = applyTexturesToScene();
    if (typeof HotReload !== 'undefined') HotReload.onModelLoaded();
    logMissingTextures(mainModel);
    if (n > 0) setStatus(fmt('status_model_tex', { name: mainModel.name, n }));

    // Supermodel-Animationen direkt anwenden
    if (superModelCandidate) {
      mergeAnimationsFromSupermodel(mainModel, superModelCandidate);
      applyRestPose(mainModel);
      saveGeometryPose();
      buildAnimUI(mainModel);
      pendingSupermodel = null;

    } else if (mainModel.supermodel &&
               mainModel.supermodel.toLowerCase() !== 'null' &&
               mainModel.supermodel !== '') {
      // Supermodel wurde referenziert aber nicht mitgeladen → Hinweis
      pendingSupermodel = mainModel.supermodel;
      logWarnI18n('super_pending_warn', { name: mainModel.name, super: mainModel.supermodel });
      logInfoI18n('super_pending_info', { super: mainModel.supermodel });
      setStatus(fmt('super_pending_status', { super: mainModel.supermodel }));
    }
  }

  for (const file of mdlFiles) {
    const baseName = file.name.replace(/\.[^.]+$/, '').toLowerCase();
    const reader = new FileReader();

    reader.onload = async e => {
      const buffer = e.target.result;  // ArrayBuffer

      try {
        // Binäres MDL erkennen und ggf. decompilieren
        if (isBinaryMDL(buffer)) {
          // Overlay sofort zeigen — auch wenn WASM noch lädt
          showDecompileOverlay(file.name);

          if (!cm.isReady()) {
            logInfoI18n('wasm_loading');
            cm.onProgress(_setDecompilePhase);
            try { await cm.ready(); } catch(wasmErr) {
              if (!_decompileCancelled) {
                logErrorI18n('wasm_unavailable', { msg: wasmErr.message });
                logErrorI18n('wasm_no_binary',   { name: file.name });
                hideDecompileOverlay();
                pending--;
                if (pending === 0) onAllRead();
              }
              return;
            }
            cm.onProgress(null);
          }

          // WASM bereit → Decompile-Phase anzeigen und einen Frame warten
          // damit der Browser das Overlay rendert bevor der sync WASM-Call blockiert.
          _setDecompilePhase({ phase: 'decompile' });
          await new Promise(r => setTimeout(r, 16));

          logInfoI18n('dcmp_decompiling', { name: file.name });
          try {
            const ascii = await cm.decompile(buffer);
            if (_decompileCancelled) return;
            texts[baseName] = ascii;
            logInfoI18n('dcmp_done', { name: file.name });
          } catch (decompErr) {
            if (!_decompileCancelled) {
              logErrorI18n('dcmp_error', { name: file.name, msg: decompErr.message });
            }
          } finally {
            if (!_decompileCancelled) hideDecompileOverlay();
          }
        } else {
          // ASCII-MDL: direkt als Text dekodieren
          texts[baseName] = new TextDecoder('utf-8').decode(buffer);
        }
      } catch (err) {
        if (!_decompileCancelled) logError(file.name + ' — ' + err.message);
      }

      // Bei Abbruch: Ladevorgang komplett abbrechen, kein onAllRead()
      if (_decompileCancelled) return;

      pending--;
      if (pending === 0) onAllRead();
    };

    reader.onerror = () => {
      logError(file.name + ' — ' + L('status_read_error'));
      pending--;
      if (pending === 0) onAllRead();
    };

    // Immer als ArrayBuffer lesen — wir entscheiden danach ASCII vs. Binär
    reader.readAsArrayBuffer(file);
  }
}

// ─────────────────────────────────────────────
//  Drag & Drop  (Multi-File)
// ─────────────────────────────────────────────
const dropZone = document.getElementById('drop-zone');
const viewport = document.getElementById('viewport');

function preventDefaults(e) { e.preventDefault(); e.stopPropagation(); }
['dragenter','dragover','dragleave','drop'].forEach(ev => document.addEventListener(ev, preventDefaults));
['dragenter','dragover'].forEach(ev => {
  viewport.addEventListener(ev, () => dropZone.classList.add('drag-over'));
  dropZone.addEventListener(ev, () => dropZone.classList.add('drag-over'));
});
['dragleave','drop'].forEach(ev => {
  viewport.addEventListener(ev, () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener(ev, () => dropZone.classList.remove('drag-over'));
});
viewport.addEventListener('drop', e => { loadFiles(e.dataTransfer.files); });
dropZone.addEventListener('drop', e => { loadFiles(e.dataTransfer.files); });
document.getElementById('file-input').addEventListener('change', e => { loadFiles(e.target.files); e.target.value=''; });

// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
//  Decompile-Overlay
// ─────────────────────────────────────────────

// Flag: true = Nutzer hat Abbrechen geklickt,
//        WASM läuft noch im Hintergrund aber das Ergebnis wird verworfen.
let _decompileCancelled = false;

// Aktualisiert Progressbar und Phase-Label im Overlay.
// Wird sowohl als cm.onProgress()-Callback als auch direkt aufgerufen.
function _setDecompilePhase({ phase, pct = 0 }) {
  const bar   = document.getElementById('dcmp-progress-bar');
  const label = document.getElementById('dcmp-phase-label');
  if (!bar || !label) return;

  // Indeterminate-Phasen (kein exakter %)
  const indeterminate = ['fetch_indeterminate', 'decode', 'compile', 'instantiate', 'wait', 'decompile'];

  if (phase === 'fetch') {
    bar.classList.remove('indeterminate');
    bar.style.width = pct + '%';
    label.textContent = fmt('dcmp_phase_fetch', { pct });
  } else if (phase === 'ready') {
    bar.classList.remove('indeterminate');
    bar.style.width = '100%';
    label.textContent = L('dcmp_phase_ready');
  } else if (indeterminate.includes(phase)) {
    bar.classList.add('indeterminate');
    const key = 'dcmp_phase_' + phase;
    label.textContent = L(key) || label.textContent;
  }
}

function showDecompileOverlay(filename) {
  _decompileCancelled = false;    // Jedes neue Decompile startet sauber
  const overlay   = document.getElementById('decompile-overlay');
  const fileLabel = document.getElementById('dcmp-filename');
  const bar       = document.getElementById('dcmp-progress-bar');
  const label     = document.getElementById('dcmp-phase-label');
  if (!overlay) return;
  if (fileLabel) fileLabel.textContent = filename;
  // Progressbar zurücksetzen
  if (bar)   { bar.classList.add('indeterminate'); bar.style.width = ''; }
  if (label) label.textContent = L('dcmp_hint') || '';
  // i18n auf die statischen Texte anwenden
  overlay.querySelectorAll('[data-i18n]').forEach(el => {
    if (el.id === 'dcmp-phase-label') return;   // wird dynamisch gesetzt
    const val = L(el.getAttribute('data-i18n'));
    if (val) el.textContent = val;
  });
  overlay.classList.add('active');
}

function hideDecompileOverlay() {
  const overlay = document.getElementById('decompile-overlay');
  if (overlay) overlay.classList.remove('active');
}

// Wird vom Abbrechen-Button im Overlay aufgerufen.
// Bricht den WASM-Fetch ab (falls noch laufend) und verwirft das Ergebnis.
function cancelDecompile() {
  _decompileCancelled = true;
  if (typeof cm !== 'undefined' && typeof cm.cancelLoad === 'function') cm.cancelLoad();
  hideDecompileOverlay();
  clearSession();
  clearLog();
  setStatus(L('dcmp_cancelled'));
  logWarnI18n('dcmp_cancelled');
}
