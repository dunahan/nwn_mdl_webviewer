/* ═══════════════════════════════════════════════
   NWN MDL Viewer — File Loader & Supermodel Merge
   ═══════════════════════════════════════════════ */

//  Multi-File Loader  (MDL + TGA/PNG gleichzeitig)
// ─────────────────────────────────────────────
function loadFiles(fileList) {
  if (!fileList || fileList.length === 0) return;

  const files = Array.from(fileList);
  const mdlFiles = files.filter(f => f.name.toLowerCase().endsWith('.mdl') || f.name.toLowerCase().endsWith('.txt'));
  const texFiles = files.filter(f => /\.(tga|png|jpg|jpeg|dds)$/i.test(f.name));

  if (mdlFiles.length === 0 && texFiles.length === 0) {
    setStatus(L('status_no_files'));
    return;
  }

  // MDL laden:
  // - Ist ein Supermodel ausstehend und passt eine der Dateien → nur Animationen laden
  // - Sonst: neue Session starten
  if (mdlFiles.length > 0) {
    const isSupermodelLoad = pendingSupermodel && currentModel &&
      mdlFiles.some(f => f.name.replace(/\.[^.]+$/, '').toLowerCase() === pendingSupermodel.toLowerCase());
    if (!isSupermodelLoad) {
      clearSession();
      clearLog();
    }
  }

  setStatus(fmt('status_loading', { n: files.length }));

  // 1. Alle Texturen laden
  let texPending = texFiles.length;
  let texLoaded  = 0;

  function onAllTexReady() {
    updateTextureUI();
    if (mdlFiles.length > 0) {
      loadAllMDLFiles(mdlFiles);
    } else if (currentModel) {
      const n = applyTexturesToScene();
      setStatus(fmt('status_tex_applied', { n }));
    }
  }

  if (texPending === 0) {
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
          logError('TGA: ' + file.name + ' — ' + err.message);
          setStatus(fmt('status_tga_error', { name: file.name, msg: err.message }));
        }
        texPending--;
        if (texPending === 0) onAllTexReady();
      };
      reader.onerror = () => {
        logError(file.name + ' — ' + L('status_read_error'));
        setStatus(fmt('status_read_error'));
        texPending--;
        if (texPending === 0) onAllTexReady();
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
          logError('DDS: ' + file.name + ' — ' + err.message);
          setStatus(fmt('status_tga_error', { name: file.name, msg: err.message }));
        }
        texPending--;
        if (texPending === 0) onAllTexReady();
      };
      reader.onerror = () => {
        logError(file.name + ' — ' + L('status_read_error'));
        setStatus(fmt('status_read_error'));
        texPending--;
        if (texPending === 0) onAllTexReady();
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
        if (texPending === 0) onAllTexReady();
      }, undefined, () => {
        texPending--;
        if (texPending === 0) onAllTexReady();
      });
    }
  }
}

// ─────────────────────────────────────────────
//  Supermodel-Animations-Merge
// ─────────────────────────────────────────────
function mergeAnimationsFromSupermodel(mainModel, superModel) {
  if (superModel.animations.length === 0) {
    logWarn(fmt('super_no_anims', { name: superModel.name }));
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

  logInfo(fmt('super_anims_merged', { name: superModel.name, n: superModel.animations.length }));
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
        logWarn(L('super_not_found'));
      }
      return;
    }

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

    // Schritt 2: Kein Verweis → erstes Modell mit Geometrie nehmen
    if (!mainModel) {
      for (const model of Object.values(parsed)) {
        const hasMesh = model.nodes.some(n =>
          n.type === 'trimesh' || n.type === 'skin' || n.type === 'danglymesh');
        if (hasMesh) { mainModel = model; break; }
      }
    }

    if (!mainModel || !mainModel.nodes.length) {
      logError(L('err_no_nodes'));
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
      logWarn(fmt('super_pending_warn', { name: mainModel.name, super: mainModel.supermodel }));
      logInfo(fmt('super_pending_info', { super: mainModel.supermodel }));
      setStatus(fmt('super_pending_status', { super: mainModel.supermodel }));
    }
  }

  for (const file of mdlFiles) {
    const baseName = file.name.replace(/\.[^.]+$/, '').toLowerCase();
    const reader = new FileReader();
    reader.onload = e => {
      texts[baseName] = e.target.result;
      pending--;
      if (pending === 0) onAllRead();
    };
    reader.onerror = () => {
      logError(file.name + ' — ' + L('status_read_error'));
      pending--;
      if (pending === 0) onAllRead();
    };
    reader.readAsText(file);
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
