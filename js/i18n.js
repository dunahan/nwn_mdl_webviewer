/* ═══════════════════════════════════════════════
   NWN MDL Viewer — Internationalisation (i18n)
   ═══════════════════════════════════════════════ */


// ─────────────────────────────────────────────
//  i18n — Internationalisation
//  - Beide Kernsprachen (en/de) sind eingebettet → funktioniert auch lokal (file://)
//  - Weitere Sprachen per ?lang=fr laden (benötigt HTTP-Server oder GitHub Pages)
//  - Sprachumschalter-Dropdown in der Sidebar
// ─────────────────────────────────────────────

const I18N_BUNDLE = {
  en: {
    _meta: { language: 'English', code: 'en' },
    logo_subtitle:'Neverwinter Nights 1 · Enhanced Edition',
    drop_title:'Drop MDL + Textures here', drop_or:'or click to open',
    drop_hint:'Multiple files at once supported',
    textures_heading:'Textures', scene_graph:'Scene Graph',
    no_file_loaded:'No file loaded', ctrl_wireframe:'Wireframe',
    ctrl_lighting:'Lighting', btn_normals:'Normals', btn_grid:'Grid',
    btn_bbox:'BBox', btn_axes:'Axes', btn_rotate:'Rotate', btn_resetcam:'↺ Camera', btn_skeleton:'Skeleton',
    anim_heading:'Animations', anim_speed:'Speed:',
    empty_title:'Load MDL File',
    empty_hint:'Drag & Drop · ASCII Format · Decompiled',
    hud_camera:'Camera', hud_orbit:'LMB Orbit', hud_zoom:'RMB/Wheel Zoom',
    hud_pan:'MMB Pan', hud_vertices:'Vertices', hud_faces:'Faces',
    hud_nodes:'Nodes', axis_up:'Y (up)',
    status_ready:'Ready — drop or open a file', status_prefix:'Status',
    nd_type:'Type', nd_parent:'Parent', nd_vertices:'Vertices',
    nd_faces:'Faces', nd_bitmap:'Bitmap', nd_position:'Position',
    nd_diffuse:'Diffuse', nd_alpha:'Alpha',
    nd_dangle_info:'Physics Mesh', nd_dangle_info_label:'Type Info',
    info_supermodel:'Supermodel', info_class:'Class', info_nodes:'Nodes',
    info_vertices:'Vertices', info_faces:'Triangles', info_anims:'Animations',
    info_meshes_suffix:'Meshes', vis_toggle_title:'Toggle visibility',
    status_loading:'Loading {n} file(s)…',
    status_tex_loaded:'Texture loaded: {name} ({n}/{total})',
    status_tex_applied:'{n} texture(s) applied to existing model.',
    status_model_loaded:'Model loaded: {name} ({cls})',
    status_model_tex:'Model loaded: {name} — {n} texture(s) applied.',
    status_parse:'Parsing MDL: {name} …',
    status_no_files:'No .mdl or .tga files recognised.',
    status_read_error:'Error reading file.',
    status_tga_error:'TGA error: {name} — {msg}',
    status_lang_loaded:'Language: {lang}',
    status_lang_fallback:'Language file not found — using English.',
    status_mtr_loaded: 'MTR loaded: {name}',
    status_mtr_error:  'MTR error: {name} — {msg}',
    err_no_nodes:'No nodes found. Is this a decompiled ASCII file?',
    err_parse_title:'Parse error:',
    err_parse_hint:'Please make sure the file is a decompiled ASCII .mdl file.',
    super_no_anims:'Supermodel "{name}" has no animations.',
    super_anims_merged:'Supermodel "{name}": {n} animations applied.',
    super_anims_loaded:'Animations from "{name}" loaded — {n} animations available.',
    super_not_found:'No matching supermodel file found in the selection.',
    super_mdl_error:'MDL parse error: {name}',
    super_pending_warn:'Model "{name}" references supermodel "{super}".',
    super_pending_info:'→ Please load "{super}.mdl" additionally to activate animations.',
    super_pending_status:'Supermodel "{super}" required → please load additionally.',
    plt_heading:          'PLT Layers',
    sidebar_toggle_title: 'Toggle sidebar',
    log_toggle_title:     'Toggle log',
    plt_row_label:        'Row ',
    plt_layer_0:          'Skin',
    plt_layer_1:          'Hair',
    plt_layer_2:          'Metal 1',
    plt_layer_3:          'Metal 2',
    plt_layer_4:          'Cloth 1',
    plt_layer_5:          'Cloth 2',
    plt_layer_6:          'Leather 1',
    plt_layer_7:          'Leather 2',
    plt_layer_8:          'Tattoo 1',
    plt_layer_9:          'Tattoo 2'
  },
  de: {
    _meta: { language: 'Deutsch', code: 'de' },
    logo_subtitle:'Neverwinter Nights 1 · Enhanced Edition',
    drop_title:'MDL + Texturen ablegen', drop_or:'oder klicken zum Öffnen',
    drop_hint:'Mehrere Dateien gleichzeitig möglich',
    textures_heading:'Texturen', scene_graph:'Szenen-Graph',
    no_file_loaded:'Keine Datei geladen', ctrl_wireframe:'Gitterlinien',
    ctrl_lighting:'Beleuchtung', btn_normals:'Normalen', btn_grid:'Raster',
    btn_bbox:'BBox', btn_axes:'Achsen', btn_rotate:'Rotation', btn_resetcam:'↺ Kamera', btn_skeleton:'Skelett',
    anim_heading:'Animationen', anim_speed:'Tempo:',
    empty_title:'MDL Datei laden',
    empty_hint:'Drag & Drop · ASCII-Format · Decompiliert',
    hud_camera:'Kamera', hud_orbit:'LMB Orbit', hud_zoom:'RMB/Rad Zoom',
    hud_pan:'MMB Pan', hud_vertices:'Vertices', hud_faces:'Faces',
    hud_nodes:'Nodes', axis_up:'Y (oben)',
    status_ready:'Bereit — Datei ablegen oder öffnen', status_prefix:'Status',
    nd_type:'Typ', nd_parent:'Eltern', nd_vertices:'Vertices',
    nd_faces:'Faces', nd_bitmap:'Bitmap', nd_position:'Position',
    nd_diffuse:'Diffuse', nd_alpha:'Alpha',
    nd_dangle_info:'Physik-Mesh', nd_dangle_info_label:'Typ-Info',
    info_supermodel:'Supermodel', info_class:'Klasse', info_nodes:'Nodes',
    info_vertices:'Vertices', info_faces:'Dreiecke', info_anims:'Animationen',
    info_meshes_suffix:'Meshes', vis_toggle_title:'Sichtbarkeit umschalten',
    status_loading:'Lade {n} Datei(en)…',
    status_tex_loaded:'Textur geladen: {name} ({n}/{total})',
    status_tex_applied:'{n} Textur(en) auf bestehendes Modell angewendet.',
    status_model_loaded:'Modell geladen: {name} ({cls})',
    status_model_tex:'Modell geladen: {name} — {n} Textur(en) angewendet.',
    status_parse:'Parse MDL: {name} …',
    status_no_files:'Keine .mdl oder .tga Dateien erkannt.',
    status_read_error:'Fehler beim Lesen der Datei.',
    status_tga_error:'TGA-Fehler: {name} — {msg}',
    status_lang_loaded:'Sprache: {lang}',
    status_lang_fallback:'Sprache nicht gefunden — Englisch als Fallback.',
    status_mtr_loaded: 'MTR geladen: {name}',
    status_mtr_error:  'MTR-Fehler: {name} — {msg}',
    err_no_nodes:'Keine Nodes gefunden. Ist die Datei im ASCII-Format?',
    err_parse_title:'Fehler beim Parsen:',
    err_parse_hint:'Stellen Sie sicher, dass es sich um eine decompilierte ASCII .mdl Datei handelt.',
    super_no_anims:'Supermodel "{name}" hat keine Animationen.',
    super_anims_merged:'Supermodel "{name}": {n} Animationen übernommen.',
    super_anims_loaded:'Animationen von "{name}" geladen — {n} Animationen verfügbar.',
    super_not_found:'Keine passende Supermodel-Datei in der Auswahl gefunden.',
    super_mdl_error:'MDL-Fehler: {name}',
    super_pending_warn:'Modell "{name}" verweist auf Supermodel "{super}".',
    super_pending_info:'→ Bitte "{super}.mdl" zusätzlich laden um Animationen zu aktivieren.',
    super_pending_status:'Supermodel "{super}" benötigt → bitte zusätzlich laden.',
    plt_heading:          'PLT Layer',
    sidebar_toggle_title: 'Sidebar ein-/ausblenden',
    log_toggle_title:     'Log ein-/ausblenden',
    plt_row_label:        'Zeile ',
    plt_layer_0:          'Haut',
    plt_layer_1:          'Haar',
    plt_layer_2:          'Metall 1',
    plt_layer_3:          'Metall 2',
    plt_layer_4:          'Stoff 1',
    plt_layer_5:          'Stoff 2',
    plt_layer_6:          'Leder 1',
    plt_layer_7:          'Leder 2',
    plt_layer_8:          'Tattoo 1',
    plt_layer_9:          'Tattoo 2'
  }
};

// Englisch ist der eingebaute Fallback
const I18N_FALLBACK = I18N_BUNDLE.en;
let LANG = Object.assign({}, I18N_FALLBACK);
let currentLangCode = 'en';

function L(key)       { return LANG[key] || I18N_FALLBACK[key] || key; }
function fmt(key, vars) {
  let s = L(key);
  for (const [k, v] of Object.entries(vars || {})) s = s.split('{'+k+'}').join(v);
  return s;
}

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const val = L(el.getAttribute('data-i18n'));
    if (val) el.textContent = val;
  });
  // Dropdown-Auswahl synchron halten
  const sel = document.getElementById('lang-select');
  if (sel) sel.value = currentLangCode;
}

// Sprache wechseln — funktioniert immer (eingebettet oder per fetch)
async function switchLanguage(code) {
  // --- 1. SPRACHDATEN LADEN ---
  if (I18N_BUNDLE[code]) {
    // A. Eingebettete Sprache (en / de)
    LANG = Object.assign({}, I18N_FALLBACK, I18N_BUNDLE[code]);
    currentLangCode = code;
  } else {
    // B. Externe JSON-Datei (für eigene Übersetzungen)
    try {
      const resp = await fetch('lang/' + code + '.json');
      if (!resp.ok) throw new Error(resp.status);
      const data = await resp.json();
      LANG = Object.assign({}, I18N_FALLBACK, data);
      currentLangCode = code;
      
      // Dropdown mit neuer Option befüllen falls noch nicht vorhanden
      const sel = document.getElementById('lang-select');
      if (sel && !sel.querySelector('option[value="' + code + '"]')) {
        const opt = document.createElement('option');
        opt.value = code; opt.textContent = data._meta?.language || code;
        sel.appendChild(opt);
      }
    } catch (e) {
      setStatus(L('status_lang_fallback'));
      return; // Bei Fehler abbrechen, UI nicht aktualisieren
    }
  }

  // --- 2. UI AKTUALISIEREN (Wird jetzt immer erreicht!) ---
  
  applyI18n(); // Übersetzt statisches HTML (data-i18n)
  
  // Dynamische UI-Elemente neu zeichnen
  if (typeof currentModel !== 'undefined' && currentModel) {
    buildNodeList(currentModel); 
    if (typeof showModelInfo === 'function') {
      showModelInfo(currentModel, window.lastVertCount || 0, window.lastFaceCount || 0);
    }
  }

  // PLT Panel immer neu bauen, da es von textureCache abhängt
  if (typeof buildPLTPanel === 'function') {
    buildPLTPanel(); // Hier greift nun das L('plt_layer_' + i)
  }
  
  // Statusleiste und URL-Parameter aktualisieren
  setStatus(fmt('status_lang_loaded', { lang: LANG._meta?.language || currentLangCode }));
  const url = new URL(window.location);
  url.searchParams.set('lang', currentLangCode);
  history.replaceState(null, '', url);
}

// Beim Start: Sprache aus URL-Parameter oder Browser-Sprache ermitteln
async function loadLanguage() {
  const params = new URLSearchParams(window.location.search);
  let code = params.get('lang');
  // Kein Parameter → Browser-Sprache als Hinweis nutzen (nur wenn eingebettet)
  if (!code) {
    const browserLang = (navigator.language || 'en').slice(0, 2).toLowerCase();
    code = I18N_BUNDLE[browserLang] ? browserLang : 'en';
  }
  await switchLanguage(code);
}