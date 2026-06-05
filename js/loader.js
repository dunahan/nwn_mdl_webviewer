/* ═══════════════════════════════════════════════
   NWN MDL Viewer — File Loader & Supermodel Merge
   ═══════════════════════════════════════════════ */

//  Multi-File Loader  (MDL + textures simultaneously)
// ─────────────────────────────────────────────
function loadFiles(fileList) {
  if (!fileList || fileList.length === 0) return;

  const files    = Array.from(fileList);
  const mdlFiles = files.filter(f => f.name.toLowerCase().endsWith('.mdl') || f.name.toLowerCase().endsWith('.txt'));
  const texFiles = files.filter(f => /\.(tga|png|jpg|jpeg|dds|plt)$/i.test(f.name));
  const txiFiles = files.filter(f => /\.txi$/i.test(f.name));
  const mtrFiles = files.filter(f => /\.mtr$/i.test(f.name));
  const wokFiles = files.filter(f => /\.wok$/i.test(f.name));
  const pwkFiles = files.filter(f => /\.pwk$/i.test(f.name));
  const dwkFiles = files.filter(f => /\.dwk$/i.test(f.name));

  if (mdlFiles.length === 0 && texFiles.length === 0 && txiFiles.length === 0 
      && mtrFiles.length === 0 && wokFiles.length === 0 && pwkFiles.length === 0
      && dwkFiles.length === 0) {
    setStatus(L('status_no_files'));
    return;
  }

  if (mdlFiles.length > 0) {
    const isSupermodelLoad = pendingSupermodel && currentModel &&
      mdlFiles.some(f => f.name.replace(/\.[^.]+$/, '').toLowerCase() === pendingSupermodel.toLowerCase());
    if (!isSupermodelLoad) {
      clearSession();
      clearLog();
      // Model name hint for collapsed sidebar
      const baseName = mdlFiles[0].name.replace(/\.[^.]+$/, '');
      const hint = document.getElementById('model-name-hint');
      if (hint) { hint.textContent = baseName; hint.classList.add('has-model'); }
    }
  }

  setStatus(fmt('status_loading', { n: files.length }));

  // Global counter: textures + MTR must both be done before onAllTexReady
  let texPending = texFiles.length;
  let txiPending = txiFiles.length;
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
    if (texPending === 0 && txiPending === 0 && mtrPending === 0) onAllTexReady();
  }

  // Read TXI files as text
  for (const file of txiFiles) {
    const key = basename(file.name);
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        txiCache[key] = parseTXI(ev.target.result);
        logInfoI18n('status_txi_loaded', { name: file.name });
      } catch(err) {
        logErrorI18n('err_txi_load', { name: file.name, msg: err.message });
      }
      txiPending--;
      checkAllReady();
    };
    reader.onerror = () => {
      logError(file.name + ' — ' + L('status_read_error'));
      txiPending--;
      checkAllReady();
    };
    reader.readAsText(file);
  }

  // Read MTR files as text
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

  // Read WOK files directly as text (independent of MDL/textures)
  for (const file of wokFiles) {
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const wok = parseWOK(ev.target.result);
        buildWalkMesh(wok);
        // Enable walkmesh button in UI
        const btn = document.getElementById('btn-walkmesh');
        if (btn) btn.disabled = false;
      } catch (err) {
        logErrorI18n('err_wok_load', { name: file.name, msg: err.message });
      }
    };
    reader.readAsText(file);
  }

  // Read PWK files directly as text
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

  // Read DWK files directly as text
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
      // NWN/Bioware custom DDS (non-standard DDS header)
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
      // NWN/Bioware PLT (palette texture)
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          textureCache[key] = parseNWNPLT(ev.target.result);
          textureCache[key].userData.pltTexKey = key;  // for per-part palette lookup
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
      // PNG/JPG: browser handles this natively
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
//  loadMDLFromHandle  (SetBrowser — phase 4)
// ─────────────────────────────────────────────
//
// Loads an MDL from a FileSystemFileHandle — entry point for the
// Set Browser when a tile is loaded by click.
//
// The full loadFiles() path is traversed:
//   clearSession · binary detection · decompile overlay · buildScene
//   applyTexturesToScene · HotReload.onModelLoaded (→ _fillMissingTextures)
//
// Textures come from the existing textureCache — the watcher has already
// pre-loaded them during folder pick (clearSession does not clear the cache).
//
// @param  {FileSystemFileHandle} handle
// @return {Promise<void>}
//
async function loadMDLFromHandle(handle) {
  let file;
  try {
    file = await handle.getFile();
  } catch (e) {
    logMsg(fmt('sb_load_error', { model: handle.name ?? '?', msg: e.message }), 'error');
    return;
  }

  // Keep handle as picker hint so showDirectoryPicker() lands in
  // the correct directory on the next watcher start.
  if (typeof HotReload !== 'undefined') {
    HotReload.setModelFileHandle(handle);
  }

  // Update model name hint in viewport (for collapsed sidebar)
  const baseName = handle.name.replace(/\.[^.]+$/, '');
  const hint = document.getElementById('model-name-hint');
  if (hint) { hint.textContent = baseName; hint.classList.add('has-model'); }

  loadFiles([file]);
}

// ─────────────────────────────────────────────
//  _readMDLHandle  (internal — Set Browser group helper)
// ─────────────────────────────────────────────
//
// Reads an MDL from a FileSystemFileHandle and returns the ASCII text.
// Handles both ASCII and binary MDLs (WASM decompile).
// Returns null if reading or decompiling fails.
//
async function _readMDLHandle(handle) {
  let file;
  try { file = await handle.getFile(); }
  catch (e) { logMsg(`[Group] File not readable: ${handle.name}`, 'warn'); return null; }

  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = async e => {
      const buffer = e.target.result;
      try {
        if (isBinaryMDL(buffer)) {
          if (!cm.isReady()) await cm.ready();
          resolve(await cm.decompile(buffer));
        } else {
          resolve(new TextDecoder('utf-8').decode(buffer));
        }
      } catch (err) {
        logMsg(`[Group] Decompile error: ${handle.name} — ${err.message}`, 'warn');
        resolve(null);
      }
    };
    reader.onerror = () => resolve(null);
    reader.readAsArrayBuffer(file);
  });
}

// ─────────────────────────────────────────────
//  loadGroupFromHandles  (Set Browser — group view)
// ─────────────────────────────────────────────
//
// Loads multiple MDL tiles side by side in a grid into the scene.
// Each entry in `entries` is a FileSystemFileHandle (or null for
// empty slots). Order matches the grid: index i → col i%cols, row i/cols.
//
// Tile size: NWN standard 10m × 10m. The group is centred around the origin.
//
// @param {(FileSystemFileHandle|null)[]} entries  grid entries (null = empty slot)
// @param {number}                        cols     column count
// @param {number}                        rows     row count (for centring only)
//
async function loadGroupFromHandles(entries, cols, rows) {
  const TILE_SIZE  = 10.0;
  const TILE_PAUSE = 20;    // ms — short pause between tiles for browser rendering

  clearSession();
  clearLog();

  // Root group holds all tile groups → clearSession() cleans up everything in one call
  const rootGroup = new THREE.Group();
  scene.add(rootGroup);
  modelGroup = rootGroup;   // set immediately so clearSession works correctly

  let loadedCount = 0;

  for (let i = 0; i < entries.length; i++) {
    const handle = entries[i];
    if (!handle) continue;   // skip empty slot

    const col = i % cols;
    const row = Math.floor(i / cols);

    // Centring: grid midpoint is at (0, 0, 0)
    // NWN X→ Three.js X,  NWN Y→ Three.js −Z  (after −PI/2 rotation)
    const offsetX =  (col - (cols - 1) / 2) * TILE_SIZE;
    const offsetZ = -(row - (rows - 1) / 2) * TILE_SIZE;

    const text = await _readMDLHandle(handle);
    if (!text) continue;

    let parsed;
    try { parsed = parseMDL(text); }
    catch (e) {
      logMsg(`[Group] Parse error: ${handle.name} — ${e.message}`, 'warn');
      continue;
    }
    if (!parsed) continue;

    setBuildOffset(offsetX, offsetZ);
    buildScene(parsed);
    // currentModel + nodeObjects now point to this tile

    // Apply textures from existing cache immediately
    applyTexturesToScene();

    // Load and apply missing textures from watch folder for THIS tile.
    // Correct because currentModel still points to this tile →
    // getNeededTextures(currentModel) filters only its textures.
    if (typeof HotReload !== 'undefined') await HotReload.onModelLoaded();

    // Detach tile group from scene and attach to rootGroup
    scene.remove(modelGroup);
    rootGroup.add(modelGroup);
    loadedCount++;

    // Short pause: browser renders the finished tile before loading the next
    await new Promise(r => setTimeout(r, TILE_PAUSE));

    // Reset modelGroup to rootGroup after pause
    modelGroup = rootGroup;
  }

  // Ensure modelGroup points to rootGroup (even if the last slot was empty)
  modelGroup = rootGroup;

  if (loadedCount > 0) {
    logInfoI18n('sb_group_loaded', { n: loadedCount });
    setStatus(fmt('sb_group_loaded', { n: loadedCount }));
  } else {
    logMsg(L('sb_group_empty'), 'warn');
    setStatus(L('sb_group_empty'));
  }
}

// ─────────────────────────────────────────────
//  Supermodel Animation Merge
// ─────────────────────────────────────────────
function mergeAnimationsFromSupermodel(mainModel, superModel) {
  if (superModel.animations.length === 0) {
    logWarnI18n('super_no_anims', { name: superModel.name });
    return;
  }

  const mainNodeNames = new Set(mainModel.nodes.map(n => n.name));
  const animScale = mainModel.animationScale || 1.0;

  for (const anim of superModel.animations) {
    const remapped = { name: anim.name, length: anim.length, transtime: anim.transtime, nodes: {} };
    for (const [nodeName, data] of Object.entries(anim.nodes)) {
      // Remap root node name: supermodel.name → mainmodel.name
      const mapped = (nodeName === superModel.name) ? mainModel.name : nodeName;
      if (mainNodeNames.has(mapped) || mapped === mainModel.name) {
        // Scale posKeys if needed — do not mutate data object (shared with superModel)
        if (animScale !== 1.0 && data.posKeys.length > 0) {
          remapped.nodes[mapped] = {
            ...data,
            posKeys: data.posKeys.map(k => ({
              t: k.t, x: k.x * animScale, y: k.y * animScale, z: k.z * animScale
            }))
          };
        } else {
          remapped.nodes[mapped] = data;
        }
      }
    }
    mainModel.animations.push(remapped);
  }
  mainModel.animCount = mainModel.animations.length;

  // Rest pose from first animation if none present yet
  if (Object.keys(mainModel.restPose).length === 0 && mainModel.animations.length > 0) {
    for (const [nodeName, data] of Object.entries(mainModel.animations[0].nodes)) {
      const firstOri = data.oriKeys[0];
      const firstPos = data.posKeys[0];
      if (firstOri || firstPos) {
        mainModel.restPose[nodeName] = {
          orientation: firstOri ? [firstOri.ax, firstOri.ay, firstOri.az, firstOri.angle] : null,
          position:    firstPos ? [firstPos.x, firstPos.y, firstPos.z] : null,
          // posKeys were already scaled during merge — firstPos is already scaled
        };
      }
    }
  }

  logInfoI18n('super_anims_merged', { name: superModel.name, n: superModel.animations.length });
}

// ─────────────────────────────────────────────
//  Missing Texture Report
// ─────────────────────────────────────────────

// DOM references of log entries: texname → <div.log-entry>
// '__header__' is the counter entry at the top.
const _missingTexEntries = {};

// Returns the texture keys (lowercase, without extension) of a single node.
// Used by hot_reload.js for the node watch indicators in the scene graph.
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

// Returns all texture keys (lowercase, without extension) needed by the model.
// Shared base for logMissingTextures() and HotReload._fillMissingTextures().
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

  // Discard old references on reload
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

// Called when textures are reloaded (without a new MDL).
// Removes resolved entries from the log and updates the header counter.
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
    // All resolved: remove header, log ✓ message
    headerEl.parentNode?.removeChild(headerEl);
    delete _missingTexEntries['__header__'];
    logInfoI18n('tex_missing_none');
  } else {
    // Update counter in header
    const msgSpan = headerEl.querySelector('.log-msg');
    if (msgSpan) msgSpan.textContent = fmt('tex_missing_header', { n: remaining });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Character Part Positioning  (case D)
//
//  Mode A – With base skeleton (e.g. pmh0.mdl):
//    Traverses the node hierarchy of the skeleton, computes world positions
//    of all attachment nodes (_g suffixes) and places each part exactly there.
//
//  Mode B – Without skeleton (fallback):
//    Bounding-box stacking along the NWN Z axis (Z = up).
// ─────────────────────────────────────────────────────────────────────────────
function positionCharacterParts(charParts, skeletonModel) {
  if (typeof scene === 'undefined' || typeof THREE === 'undefined') return;

  // ── Helper functions ─────────────────────────────────────────────────────

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

  // ── Phase 0: Reset all parts to origin ──────────────────────────────────
  // (eliminate binary MDL attachment offsets from buildScene)
  for (const part of charParts) {
    const root = findRoot(part.name);
    if (root) root.position.set(0, 0, 0);
  }
  scene.updateMatrixWorld(true);

  // ══════════════════════════════════════════════════════════════════════════
  //  Mode A: Skeleton-based positioning
  // ══════════════════════════════════════════════════════════════════════════
  if (skeletonModel) {

    // NWN part abbreviation → attachment node name in skeleton
    // Source: pmh0.mdl analysis (applies to all pm[mf][0-9].mdl base skeletons)
    const BONE_MAP = {
      'chest':  'torso_g',
      'pelvis': 'pelvis_g',
      'belt':   'belt_g1',
      'neck':   'neck_g',
      'head':   'head_g',
      'shol':   'lbicep_g',    // shoulder plate: left shoulder joint
      'shor':   'rbicep_g',    //                  right shoulder joint
      'bicepl': 'lbicep_g',    // upper arm left
      'bicepr': 'rbicep_g',    // upper arm right
      'forel':  'lforearm_g',  // forearm left
      'forer':  'rforearm_g',  // forearm right
      'handl':  'lhand_g',     // hand left
      'handr':  'rhand_g',     // hand right
      'legl':   'lthigh_g',    // thigh left
      'legr':   'rthigh_g',    // thigh right
      'shinl':  'lshin_g',     // shin left
      'shinr':  'rshin_g',     // shin right
      'footl':  'lfoot_g',     // foot left
      'footr':  'rfoot_g',     // foot right
    };

    // World positions of all skeleton nodes via hierarchy traversal
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

    // Place each part at its attachment node
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
  //  Mode B: Bounding-box stacking (fallback without skeleton)
  // ══════════════════════════════════════════════════════════════════════════

  // Phase 1: bounding boxes after phase-0 reset
  const origBox = {};
  for (const part of charParts) {
    const root = findRoot(part.name);
    if (!root) continue;
    const box = new THREE.Box3().setFromObject(root);
    if (!box.isEmpty()) origBox[part.name] = box;
  }

  // Phase 2a: spine + legs along Z axis (NWN: Z = up)
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

  // Phase 2b: arms hang downward from the chest top edge
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
//  MDL Loader  (single or multiple files)
// ─────────────────────────────────────────────
function loadAllMDLFiles(mdlFiles) {
  const texts = {};
  let pending = mdlFiles.length;

  function onAllRead() {
    // Parse all files
    const parsed = {};
    for (const [baseName, text] of Object.entries(texts)) {
      try {
        parsed[baseName] = parseMDL(text);
      } catch (err) {
        logError(fmt('super_mdl_error', { name: baseName }) + ' — ' + err.message);
      }
    }
    if (Object.keys(parsed).length === 0) return;

    // ── Case A: load supermodel ──────────────────────────────────────
    // A model is already waiting for its supermodel.
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
        refreshBBox();
        setStatus(fmt('super_anims_loaded', { name: superModel.name, n: currentModel.animations.length }));
      } else {
        logWarnI18n('super_not_found');
      }
      return;
    }

    // ── Case D: Character Part Assembly (pmX#_PART### – body parts of dynamic characters) ──
    // Optionally detects the base skeleton (pmh0, pmf0, …) among the loaded files.
    // With skeleton → exact attachment positions from the node hierarchy.
    // Without skeleton → BB stacking as fallback.
    {
      const allParsed = Object.values(parsed);
      if (allParsed.length > 1) {
        const charPartRx    = /^p[mf][a-z]\d_[a-z]+\d+$/i;
        const baseSkeletonRx = /^p[mf][a-z]\d$/i;

        const charParts     = allParsed.filter(m => charPartRx.test(m.name));
        const skeletonModel = allParsed.find(m => baseSkeletonRx.test(m.name)) || null;

        // Case D applies when: only parts loaded  OR  skeleton + parts  OR
        // skeleton + parts + supermodel of skeleton (e.g. a_fa.mdl).
        // The supermodel MDL is excluded from the nonPartNonSkeleton check
        // so it does not block case D (it is used later as animation source).
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

          // ── Integrate skeleton bone nodes into base ─────────────────────────
          // The bone nodes (rootdummy, torso_g, rbicep_g …) from the skeleton
          // (pfa0.mdl) must be present in the scene so that:
          //   a) mergeAnimationsFromSupermodel accepts them as valid targets
          //      (mainNodeNames.has(boneName) → true)
          //   b) applyAnimFrame finds their Three.js objects in nodeObjects
          //   c) applySkinning can read the animated bone transforms
          // The root node of the skeleton is skipped; its direct children
          // are attached under base.name instead (parent remapping).
          if (skeletonModel) {
            const skelRootName = skeletonModel.name.toLowerCase();
            for (const node of skeletonModel.nodes) {
              if (node.name.toLowerCase() === skelRootName) continue;       // skip root
              if (base.nodes.find(n => n.name === node.name)) continue;     // no duplicate
              const patched = Object.assign({}, node);
              if ((patched.parent || '').toLowerCase() === skelRootName) {
                patched.parent = base.name;   // attach direct skeleton children to base root
              }
              base.nodes.push(patched);
            }
            logInfoI18n('log_char_skeleton', { name: skeletonModel.name });
          }
          // ─────────────────────────────────────────────────────────────────────

          buildScene(base);
          // ── Reparent charpart roots to bones & hide bone debug meshes ────────
          // Skip positionCharacterParts() when skeleton is present:
          // Its computeWorld() ignores bone rotations (additive positions only),
          // causing misplacements. The bone Object3Ds are already correctly placed
          // in space by Three.js (including parent rotations).
          // → boneObj.add(partRoot) + position (0,0,0): part lands exactly at bone origin.
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

            // Case-insensitive bone lookup: skeletons of different models
            // use different capitalisations (e.g. Lbicep_g vs lbicep_g).
            // BONE_MAP values are always lowercase → build LC map once.
            const nodeObjLC = {};
            for (const [k, v] of Object.entries(nodeObjects)) {
              if (k) nodeObjLC[k.toLowerCase()] = v;
            }

            // Step 1: attach part roots to their bones, set local position to (0,0,0)
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

            // Reparent pelvis geometry children of base root to pelvis_g.
            // The base root itself cannot be moved (all bones hang from it).
            // Its geometry meshes (non-skeleton nodes) are attached directly
            // under their bone attachment node, like all other parts.
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

            // Step 2: hide bone debug meshes.
            // Use identity comparison (!== child) instead of name comparison, because
            // debug spheres can carry the same name as their parent bone →
            // nodeObjects[name] would be truthy but point to the bone, not the debug mesh.
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
            positionCharacterParts(charParts, skeletonModel);  // fallback mode B (BB stacking)
          }
          // ─────────────────────────────────────────────────────────────────────

          const n = applyTexturesToScene();
          if (typeof HotReload !== 'undefined') HotReload.onModelLoaded();
          logMissingTextures(base);
          if (n > 0) setStatus(fmt('status_model_tex', { name: base.name, n }));

          // ── Adopt supermodel animations from skeleton ────────────────────
          // The supermodel reference is in the skeleton (e.g. pfa0 → a_fa),
          // not in the individual parts. Transfer to base after assembly and
          // either merge immediately (if already loaded) or set pendingSupermodel
          // (for the deferred-load workflow via case A).
          const superSource = skeletonModel || base;
          const smName = (superSource.supermodel || '').toLowerCase();
          if (smName && smName !== 'null' && smName !== superSource.name.toLowerCase()) {
            base.supermodel = superSource.supermodel;

            const superModel =
              parsed[smName] ||
              Object.values(parsed).find(m => m.name.toLowerCase() === smName);

            if (superModel) {
              // Supermodel was among the loaded files → merge immediately
              mergeAnimationsFromSupermodel(base, superModel);
              applyRestPose(base);
              saveGeometryPose();
              buildAnimUI(base);
              pendingSupermodel = null;
              setStatus(fmt('super_anims_loaded', { name: superModel.name, n: base.animations.length }));
            } else {
              // Not yet loaded → hint, user can supply supermodel later
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
    // ── End case D ───────────────────────────────────────────────────────────

    // ── Case C: Multi-Part Assembly (e.g. weapon parts _b_ / _m_ / _t_) ──────
    // Multiple MDLs loaded, all with geometry, none references another
    // as supermodel → assemble as a multi-part model.
    {
      const allParsed = Object.values(parsed);
      if (allParsed.length > 1) {

        // Collect supermodel names from all loaded models
        const superNames = new Set(
          allParsed
            .map(m => (m.supermodel || '').toLowerCase())
            .filter(sm => sm && sm !== 'null' && sm !== '')
        );

        // Candidates: have geometry + are not the supermodel of another + may have effects
        const parts = allParsed.filter(m =>
          !superNames.has(m.name.toLowerCase()) &&
          m.nodes.some(n => n.type !== 'dummy')
        );


        // Only if ALL candidates are completely independent (no setsupermodel)
        const allIndependent = parts.every(m => {
          const sm = (m.supermodel || '').toLowerCase();
          return !sm || sm === 'null' || sm === '';
        });

        if (parts.length > 1 && allIndependent) {
          // Sort alphabetically → deterministic (_b_ → _m_ → _t_)
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
    // ── End case C ───────────────────────────────────────────────────────

    // ── Case B: determine main model ──────────────────────────────────
    // Rule: the main model has a setsupermodel reference to a DIFFERENT model
    //       (i.e. NOT NULL and NOT itself).
    // The supermodel is used ONLY for animations, not for geometry.

    let mainModel = null;
    let superModelCandidate = null;

    // Step 1: find model with non-trivial supermodel reference
    for (const model of Object.values(parsed)) {
      const sm = (model.supermodel || '').toLowerCase();
      if (sm && sm !== 'null' && sm !== '' && sm !== model.name.toLowerCase()) {
        mainModel = model;
        break;
      }
    }

    // Step 2: no supermodel reference → prefer first model with geometry,
    // then fall back to any model with nodes (emitter-only, EFFECT class etc.)
    if (!mainModel) {
      for (const model of Object.values(parsed)) {
        const hasMesh = model.nodes.some(n =>
          n.type === 'trimesh' || n.type === 'skin' || n.type === 'danglymesh' || n.type === 'animmesh');
        if (hasMesh) { mainModel = model; break; }
      }
    }

    // Fallback: model without mesh but with nodes (e.g. fx_clouds: dummy + emitter only)
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

    // Step 3: find supermodel (NOT to be used as geometry base)
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

    // Build scene with the geometry of the main model
    buildScene(mainModel);
    const n = applyTexturesToScene();
    if (typeof HotReload !== 'undefined') HotReload.onModelLoaded();
    logMissingTextures(mainModel);
    if (n > 0) setStatus(fmt('status_model_tex', { name: mainModel.name, n }));

    // Apply supermodel animations directly
    if (superModelCandidate) {
      mergeAnimationsFromSupermodel(mainModel, superModelCandidate);
      applyRestPose(mainModel);
      saveGeometryPose();
      buildAnimUI(mainModel);
      pendingSupermodel = null;
      refreshBBox();

    } else if (mainModel.supermodel &&
               mainModel.supermodel.toLowerCase() !== 'null' &&
               mainModel.supermodel !== '') {
      // Supermodel was referenced but not loaded → hint
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
        // Detect binary MDL and decompile if needed
        if (isBinaryMDL(buffer)) {
          // Show overlay immediately — even if WASM is still loading
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

          // WASM ready → show decompile phase and wait one frame
          // so the browser renders the overlay before the sync WASM call blocks.
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
          // ASCII MDL: decode directly as text
          texts[baseName] = new TextDecoder('utf-8').decode(buffer);
        }
      } catch (err) {
        if (!_decompileCancelled) logError(file.name + ' — ' + err.message);
      }

      // On cancel: abort loading completely, no onAllRead()
      if (_decompileCancelled) return;

      pending--;
      if (pending === 0) onAllRead();
    };

    reader.onerror = () => {
      logError(file.name + ' — ' + L('status_read_error'));
      pending--;
      if (pending === 0) onAllRead();
    };

    // Always read as ArrayBuffer — we decide ASCII vs. binary afterwards
    reader.readAsArrayBuffer(file);
  }
}

// ─────────────────────────────────────────────
//  Drag & Drop  (multi-file)
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
// Tries to read the FileSystemFileHandle of the MDL file from a drop event
// and passes it to HotReload as the start-folder hint for showDirectoryPicker().
// Only available in Chrome/Edge (getAsFileSystemHandle); no-op in other browsers.
async function _captureModelHandle(items) {
  if (typeof HotReload === 'undefined' || !items) return;
  for (const item of items) {
    if (item.kind !== 'file') continue;
    try {
      const handle = await item.getAsFileSystemHandle();
      if (handle?.kind === 'file' && handle.name.toLowerCase().endsWith('.mdl')) {
        HotReload.setModelFileHandle(handle);
        break;
      }
    } catch (_) { /* API not available or access denied */ }
  }
}

viewport.addEventListener('drop', e => {
  const files = e.dataTransfer.files;          // save synchronously before DataTransfer is cleared
  _captureModelHandle(e.dataTransfer.items);   // fire-and-forget – handle is only needed at picker time
  loadFiles(files);
});
dropZone.addEventListener('drop', e => {
  const files = e.dataTransfer.files;
  _captureModelHandle(e.dataTransfer.items);
  loadFiles(files);
});
document.getElementById('file-input').addEventListener('change', e => { loadFiles(e.target.files); e.target.value=''; });

// ── Viewport drag highlight (only when sidebar is hidden) ───────────────
// Shows a golden border ring + label when files are dragged over the viewport
// and the sidebar is collapsed.
const _vpOverlay = document.getElementById('viewport-drag-overlay');

viewport.addEventListener('dragover', () => {
  if (document.getElementById('sidebar').classList.contains('collapsed')) {
    _vpOverlay.classList.add('drag-active');
  }
});

viewport.addEventListener('dragleave', e => {
  // Only deactivate when the cursor truly leaves the viewport
  if (!e.relatedTarget || !viewport.contains(e.relatedTarget)) {
    _vpOverlay.classList.remove('drag-active');
  }
});

viewport.addEventListener('drop', () => _vpOverlay.classList.remove('drag-active'));

// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
//  Decompile Overlay
// ─────────────────────────────────────────────

// Flag: true = user clicked cancel,
//        WASM is still running in the background but the result is discarded.
let _decompileCancelled = false;

// Updates the progress bar and phase label in the overlay.
// Called both as a cm.onProgress() callback and directly.
function _setDecompilePhase({ phase, pct = 0 }) {
  const bar   = document.getElementById('dcmp-progress-bar');
  const label = document.getElementById('dcmp-phase-label');
  if (!bar || !label) return;

  // Indeterminate phases (no exact %)
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
  _decompileCancelled = false;    // every new decompile starts clean
  const overlay   = document.getElementById('decompile-overlay');
  const fileLabel = document.getElementById('dcmp-filename');
  const bar       = document.getElementById('dcmp-progress-bar');
  const label     = document.getElementById('dcmp-phase-label');
  if (!overlay) return;
  if (fileLabel) fileLabel.textContent = filename;
  // Reset progress bar
  if (bar)   { bar.classList.add('indeterminate'); bar.style.width = ''; }
  if (label) label.textContent = L('dcmp_hint') || '';
  // Apply i18n to static texts
  overlay.querySelectorAll('[data-i18n]').forEach(el => {
    if (el.id === 'dcmp-phase-label') return;   // set dynamically
    const val = L(el.getAttribute('data-i18n'));
    if (val) el.textContent = val;
  });
  overlay.classList.add('active');
}

function hideDecompileOverlay() {
  const overlay = document.getElementById('decompile-overlay');
  if (overlay) overlay.classList.remove('active');
}

// Called by the cancel button in the overlay.
// Aborts the WASM fetch (if still running) and discards the result.
function cancelDecompile() {
  _decompileCancelled = true;
  if (typeof cm !== 'undefined' && typeof cm.cancelLoad === 'function') cm.cancelLoad();
  hideDecompileOverlay();
  clearSession();
  clearLog();
  setStatus(L('dcmp_cancelled'));
  logWarnI18n('dcmp_cancelled');
}
