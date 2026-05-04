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

  if (mdlFiles.length === 0 && texFiles.length === 0 && mtrFiles.length === 0) {
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
        logInfo(fmt('status_mtr_loaded', { name: file.name }));
      } catch(err) {
        logError(fmt('status_mtr_error', { name: file.name, msg: err.message }));
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
        logError(fmt('err_wok_load', { name: file.name, msg: err.message }));
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
        logError(fmt('err_pwk_load', { name: file.name, msg: err.message }));
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
          logError(fmt('err_tga_load', { name: file.name, msg: err.message }));
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
          logError(fmt('err_dds_load', { name: file.name, msg: err.message }));
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
          texLoaded++;
          setStatus(fmt('status_tex_loaded', { name: file.name, n: texLoaded, total: texFiles.length }));
        } catch(err) {
          logError(fmt('err_plt_load', { name: file.name, msg: err.message }));
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
//  Fehlende-Texturen-Report
// ─────────────────────────────────────────────
function logMissingTextures(model) {
  if (!model) return;
  const needed = new Set();

  for (const node of model.nodes) {
    // MTR-Pfad: materialname → MTR-Cache → Textur-Slots prüfen
    const mtrKey = node.materialname
      ? node.materialname.toLowerCase()
      : (node.bitmap ? node.bitmap.toLowerCase() : null);
    const mtr = mtrKey ? (mtrCache[mtrKey] || null) : null;

    if (mtr) {
      for (let i = 0; i <= 5; i++) {
        if (mtr.textures[i]) needed.add(mtr.textures[i].toLowerCase());
      }
    } else {
      // Direkte Bitmap- und Textur-Slots aus dem MDL-Node
      if (node.bitmap) needed.add(node.bitmap.toLowerCase());
      if (node.textures) {
        for (const t of Object.values(node.textures)) {
          if (t && t !== 'null') needed.add(t.toLowerCase());
        }
      }
    }

    // Emitter-Textur
    if (node.emitterTexture) needed.add(node.emitterTexture.toLowerCase());
  }

  // Platzhalter und bereits geladene Texturen herausfiltern
  const missing = [...needed].filter(
    name => name && name !== 'null' && name !== '' && !textureCache[name]
  );

  if (missing.length === 0) {
    logInfo(L('tex_missing_none'));
    return;
  }

  logWarn(fmt('tex_missing_header', { n: missing.length }));
  for (const name of missing) {
    logWarn('  ✕ ' + name);
  }
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
            logInfo(fmt('log_multi_part', { part: parts[i].name, base: base.name }));
          }

          buildScene(base);
          const n = applyTexturesToScene();
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
          n.type === 'trimesh' || n.type === 'skin' || n.type === 'danglymesh');
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
      logWarn(fmt('super_pending_warn', { name: mainModel.name, super: mainModel.supermodel }));
      logInfo(fmt('super_pending_info', { super: mainModel.supermodel }));
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
          if (!cm.isReady()) {
            logInfo(L('wasm_loading'));
            try { await cm.ready(); } catch(wasmErr) {
              logError(fmt('wasm_unavailable', { msg: wasmErr.message }));
              logError(fmt('wasm_no_binary',   { name: file.name }));
              pending--;
              if (pending === 0) onAllRead();
              return;
            }
          }
          showDecompileOverlay(file.name);
          logInfo(fmt('dcmp_decompiling', { name: file.name }));
          try {
            const ascii = await cm.decompile(buffer);
            if (_decompileCancelled) return;
            texts[baseName] = ascii;
            logInfo(fmt('dcmp_done', { name: file.name }));
          } catch (decompErr) {
            if (!_decompileCancelled) {
              logError(fmt('dcmp_error', { name: file.name, msg: decompErr.message }));
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

function showDecompileOverlay(filename) {
  _decompileCancelled = false;    // Jedes neue Decompile startet sauber
  const overlay  = document.getElementById('decompile-overlay');
  const fileLabel = document.getElementById('dcmp-filename');
  if (!overlay) return;
  if (fileLabel) fileLabel.textContent = filename;
  // i18n auf die dynamischen Texte anwenden
  overlay.querySelectorAll('[data-i18n]').forEach(el => {
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
// Das WASM läuft im Hintergrund weiter bis es fertig ist —
// das Ergebnis wird aber verworfen und die Session zurückgesetzt.
function cancelDecompile() {
  _decompileCancelled = true;
  hideDecompileOverlay();
  clearSession();
  clearLog();
  setStatus(L('dcmp_cancelled'));
  logWarn(L('dcmp_cancelled'));
}
