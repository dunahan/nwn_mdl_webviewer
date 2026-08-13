# NWN MDL Viewer — Translations / Übersetzungen

## Selecting a language / Sprache wählen

Add `?lang=XX` to the URL, where `XX` is the filename without `.json`:

* `index.html?lang=en`     → English (default)
* `index.html?lang=de`     → Deutsch
* `index.html?lang=fr`     → Français (if lang/fr.json exists)

### URL Examples
* **GitHub Pages:** `https://your-name.github.io/nwn-mdl-viewer/?lang=en`
* **Local Server:** `http://localhost:8080/?lang=en`

> **Note:** When opening `index.html` directly from the filesystem (`file://`), the browser cannot load external JSON files due to security restrictions. The viewer will fall back to the built-in English strings automatically.
> To test translations locally, use a simple HTTP server:
> ```bash
> python3 -m http.server 8080
> ```

---

## Creating a new translation / Neue Sprache erstellen

1. Copy `lang/en.json` to `lang/XX.json` (e.g. `lang/fr.json`).
2. Edit the `_meta` block (ensure `code` matches the filename).
3. Translate all values (keep the keys unchanged!).
4. **Placeholders:** Do **not** translate `{placeholder}` tokens like `{name}`, `{n}`, `{total}`, `{cls}`, `{msg}`, `{lang}` — these are filled in dynamically at runtime.
5. Open `index.html?lang=fr` to test.

---

## Key reference

| Key Group | Description |
|-----------|-------------|
| `logo_*` / `drop_*` | Header and Drag & Drop zone text. |
| `ctrl_*` / `btn_*` | UI Controls (Wireframe, Lighting, Grid, Skeleton, etc.). |
| `ntb_*` / `colordrop_*` | Mesh visibility toolbar and Walkmesh (WOK/PWK/DWK) color-picker labels. |
| `wok_*` / `pwk_*` / `dwk_*` | Walkmesh state labels, pin-toggle tooltips, and load-status messages for area, placeable, and door walkmeshes. |
| `anim_*` | Animation playback controls. |
| `nd_*` | Node Detail panel (shows specific data for the selected node). |
| `nd_em_*` | Particle Emitter specific properties in the Node Detail panel. |
| `extra_uv_stage_warn` | Log warning (and Node Detail panel hint) when a model uses a second UV stage (`tverts1`/`tverts2`/`tverts3`) — parsed but not yet rendered. |
| `ref_model_not_loaded` | Log warning (and Node Detail panel hint) when a `reference` node's `refModel` is parsed but the referenced sub-model is not loaded/merged into the scene. |
| `nd_lt_*` | Light properties in the Node Detail panel. |
| `info_*` | Model Info panel (general statistics like vertex count). |
| `status_*` | Bottom status bar messages (supports placeholders). |
| `super_*` | Messages regarding Supermodel/Animation merging. |
| `err_*` | Error messages for invalid files, parsing issues, or missing themes. |
| `plt_*` | Labels for the PLT (Pixel Look-up Table) color picker. |
| `dcmp_*` | UI strings for the MDL decompiler process, including progressive phase labels (`dcmp_phase_*`). |
| `cm_*` | Technical log messages for the cleanmodels WASM module. |
| `wasm_*` | Status and error messages for the WASM decompiler module loading. |
| `log_em_*` | Log messages for the particle Emitter system initialization and errors. |
| `log_multi_part` | Log message for generic Multi-Part assembly (e.g. weapon parts `_b_` / `_m_` / `_t_`). |
| `log_char_*` | Log messages for Multi-Part character assembly (part merging, skeleton attachment, bounding-box stacking). |
| `hr_*` | Texture Hot-Reload feature (watch folder button, status messages, node indicator tooltip). |
| `sb_*` | Set Browser panel strings, tile loading statuses, and group messages. |

### Placeholder Dictionary
These variables are replaced dynamically at runtime and must not be translated.

| Token | Description | Context / Example |
|:---|:---|:---|
| `{name}` | File or object name | "Model loaded: **tor01.mdl**" |
| `{n}` | Current count or number | "**3** texture(s) applied" |
| `{total}` | Total count | "Texture loaded: skin.tga (**1**/**5**)" |
| `{cls}` | Model classification | "Model loaded: human (**Character**)" |
| `{msg}` | System error message | "Texture error: file.tga — **Invalid Header**" |
| `{lang}` | Name of the language | "Language loaded: **Français**" |
| `{super}` | Name of a Supermodel | "Please load **human.mdl** additionally" |
| `{mode}` | Cleanmodels mode | "[cleanmodels] Start, mode: {mode}" |
| `{ver}` | Version of Cleanmodels | "[cleanmodels] Module ready. Version: {ver}" |
| `{size}` | Filesize in MB | "[cleanmodels] WASM loaded: {size} MB" |
| `{src}` | File source/name | "Script load error: {src}" |
| `{tex}` | Name of a texture file | "(texture pending: \"{tex}\")" |
| `{base}` | Name of the base model in multi-part assembly | "Multi-Part: \"{part}\" merged into \"{base}\"" |
| `{part}` | Name of a sub-part in multi-part assembly | "Multi-Part: \"{part}\" merged into \"{base}\"" |
| `{ref}` | Name of a referenced sub-model (MDL `reference` node) | "Reference node \"tor_torch01\" points to \"{ref}\" — not loaded/merged into the scene." |
| `{bone}` | Name of a skeleton bone | "Part {part} → bone {bone} (Z: {z})" |
| `{z}` | Z-position of an attachment point | "Part {part} → bone {bone} (Z: {z})" |
| `{dp}` | Number of door positions in a DWK mesh | "DWK loaded: {nodes} mesh(es), {faces} face(s), {dp} door position(s)." |
| `{iop}` | Number of interaction points in a PWK mesh | "PWK loaded: {nodes} mesh(es), {faces} face(s), {iop} interaction point(s)." |
| `{nodes}` | Number of mesh nodes in a walkmesh | "Walkmesh loaded: {nodes} node(s), {faces} face(s)." |
| `{faces}` | Number of faces in a walkmesh | "Walkmesh loaded: {nodes} node(s), {faces} face(s)." |
| `{pct}` | WASM download progress in percent | "Downloading WASM… {pct}%" |
| `{names}` | Comma-separated list of watched texture filenames | "Watching: cube_diff.tga, cube_norm.tga" |
| `{nr}` | The ID/Number of a tileset tile | "Tile #**42** loaded: ttr01_b05" |
| `{model}` | The model name of a specific tile | "Tile #42 loaded: **ttr01_b05**" |

---

## Detailed Feature Notes (v1.4.1)

### Walkmesh & Collision (`wok_*`, `pwk_*`, `dwk_*`, `colordrop_*`)

These keys cover three distinct walkmesh types, each with their own set of labels.

* **WOK** (`wok_*`): Area walkmesh for tilesets — covers navigable surface types. The pin button (`wok_pin_title`) keeps the WOK visible when the next model is loaded. When pinned, `wok_pinned_on` is shown as the button tooltip.
* **PWK** (`pwk_*`): Walkmesh for placeables — covers walk geometry and interaction point (IoP) regions. `pwk_pin_title` / `pwk_pinned_on` work identically to WOK.
* **DWK** (`dwk_*`): Walkmesh for doors. Supports three states — Closed, Open 1, and Open 2 — selectable via buttons in the toolbar (`dwk_state_closed`, `dwk_state_open1`, `dwk_state_open2`). The pin toggle (`dwk_pin_title` / `dwk_pinned_on`) keeps the DWK visible when the next model is loaded.

The `colordrop_*` keys label the color-picker sections in the viewport dropdown:

| Key | Description |
|-----|-------------|
| `colordrop_wok` | Heading for the WOK surface color section |
| `colordrop_pwk` | Heading for the PWK region color section |
| `colordrop_pwk_wg` | Label for the Walk Geometry color picker within PWK |
| `colordrop_pwk_iop` | Label for the Interaction Point color picker within PWK |
| `colordrop_dwk` | Heading for the DWK door geometry color section |
| `colordrop_dwk_wg` | Label for the Walk Geometry color picker within DWK |
| `colordrop_dwk_dp` | Label for the Door Position marker color picker within DWK |

### PLT Layers (`plt_layer_N`)
Neverwinter Nights uses a 10-layer palette system for dynamic coloring of armors and skins.
* **Layers 0–1:** Skin and Hair — applied globally across all parts of a multi-part model.
* **Layers 2–9:** Metal, Cloth, Leather, and Tattoo — applied per-part, so different body parts can have different metal tones for example.

### WASM Decompiler Phases (`dcmp_phase_*`)
When a binary MDL is loaded, the WASM decompiler goes through a sequence of loading stages. Each stage has its own translatable label shown in the progress overlay:

| Key | Stage |
|-----|-------|
| `dcmp_phase_fetch` | Downloading the WASM binary (shows `{pct}%` if progress is available) |
| `dcmp_phase_fetch_indeterminate` | Downloading WASM without known progress |
| `dcmp_phase_decode` | Decoding the Base64-encoded WASM data (file:// mode only) |
| `dcmp_phase_compile` | Browser compiling the WASM module |
| `dcmp_phase_instantiate` | Instantiating the compiled module |
| `dcmp_phase_wait` | Waiting for the Go runtime to become ready |
| `dcmp_phase_ready` | Module ready — shown briefly before decompilation starts |
| `dcmp_phase_decompile` | Active decompilation of the MDL file |

### Multi-Part Assembly (`log_multi_part`, `log_char_*`)
NWN models can consist of multiple separate MDL parts assembled at runtime. The viewer distinguishes two assembly types:

**Generic Multi-Part (Case C)** — e.g. weapon parts (`_b_` blade / `_m_` middle / `_t_` top):
* **`log_multi_part`**: Logged for each part merged into the base model during generic assembly.

**Character Multi-Part (Case D)** — body parts of dynamic characters (chest, head, legs, …):
* **`log_char_assembly`**: Logged when the character multi-part pipeline starts.
* **`log_char_part`**: Logged for each character part merged into the base model.
* **`log_char_positioned`**: Logged when parts are stacked via bounding-box fallback (no skeleton found).
* **`log_char_skeleton`**: Logged when a base skeleton is found and exact bone attachment is used.
* **`log_char_bone`**: Logged for each individual part-to-bone mapping with its Z-offset.

### Texture Hot-Reload (`hr_*`)
The viewer can watch a local folder for texture changes and automatically reload updated files without reloading the model. This feature requires Chrome or Edge (File System Access API).

| Key | Description |
|-----|-------------|
| `hr_btn_watch` | Label for the "Watch Folder" button in the sidebar (inactive state). |
| `hr_btn_stop` | Label for the same button when watching is active. |
| `hr_watching` | Status text shown next to the button: number of watched files. Placeholder: `{n}`. |
| `hr_reloaded` | Status bar message after a texture was successfully reloaded. Placeholder: `{name}`. |
| `hr_not_supported` | Tooltip on the disabled button when the browser does not support the File System Access API. |
| `hr_dir_picked` | Status message after a watch folder was selected, showing how many texture files were found. Placeholder: `{n}`. |
| `hr_no_textures` | Status message when the selected folder contains no supported texture files (TGA/DDS/PLT). |
| `hr_parse_error` | Log warning when a changed file could not be parsed. Placeholders: `{name}`, `{msg}`. |
| `hr_filled_missing` | Status message after missing textures for the loaded model were automatically filled from the watch folder. Placeholder: `{n}`. |
| `hr_indicator_title` | Tooltip text for the `↻` watch indicator icon shown next to nodes in the Scene Graph. |
| `hr_watching_node` | Status bar message when the user clicks a `↻` indicator to inspect which textures are watched. Placeholder: `{names}` (comma-separated filenames). |
| `hr_tauri_not_impl` | Developer-facing log message for an unimplemented Tauri desktop backend. Present in the built-in language bundle but intentionally omitted from the external JSON files — no translation required. |

### Set Browser (`sb_*`)
The Set Browser is a floating panel that parses NWN `.set` tileset-definition files and displays all tiles as a browsable grid or list. It integrates with the Hot-Reload watch folder to detect which tile MDLs are currently available.

| Key | Description |
|-----|-------------|
| `sb_panel_title` | Title shown in the panel header when no set is loaded. |
| `sb_load_btn` | Label for the "Load .set" button in the toolbar. |
| `sb_filter_ph` | Placeholder text for the tile/model name filter input field. |
| `sb_group_all` | Option label in the group dropdown that shows tiles from all groups. |
| `sb_tile_count` | Count label shown in the panel title and status bar. Placeholder: `{n}`. |
| `sb_no_set` | Default text shown in the tile area when no `.set` file has been loaded yet. |
| `sb_loaded` | Status message after a `.set` file was successfully loaded. Placeholders: `{name}`, `{n}`. |
| `sb_tile_loaded` | Status message after a single tile model was loaded into the viewer. Placeholders: `{nr}`, `{model}`. |
| `sb_tile_changed` | Tile tooltip and status message when the active tile's MDL file has changed on disk since loading. Placeholder: `{model}`. |
| `sb_tile_unavail` | Tooltip on tiles whose MDL is not present in the watched folder. |
| `sb_tile_available` | Tooltip on tiles whose MDL is available and can be clicked to load. Placeholders: `{nr}`, `{model}`. |
| `sb_tile_active_tip` | Tooltip on the tile currently loaded in the viewer. Placeholders: `{nr}`, `{model}`. |
| `sb_read_error` | Error message when the `.set` file could not be read. Placeholders: `{name}`, `{msg}`. |
| `sb_load_error` | Error message when a tile model could not be loaded. Placeholders: `{model}`, `{msg}`. |
| `sb_group_loaded` | Status message after a whole group of tiles was loaded into the scene as a grid. Placeholder: `{n}`. |
| `sb_group_empty` | Status message when the selected group has no tiles available in the watch folder. |
| `sb_group_file_error` | Log warning during group loading when a tile's MDL FileHandle could not be read. Placeholder: `{name}`. |
| `sb_group_decompile_error` | Log warning during group loading when a binary tile MDL failed to decompile. Placeholders: `{name}`, `{msg}`. |
| `sb_group_parse_error` | Log warning during group loading when a tile MDL's ASCII text failed to parse. Placeholders: `{name}`, `{msg}`. |

### Supermodel Logic (`super_*`)
If a model references a Supermodel for animations, these strings guide the user to load the required additional `.mdl` files to enable animations.

### Particle Emitters (`nd_em_*`, `log_em_*`)
NWN uses emitter nodes for particle effects. These keys cover the various physics, timing, and rendering properties (like birthrate, life expectancy, drag, gravity, etc.) displayed in the Node Detail panel when an emitter node is selected. `nd_em_birthrate_key` is a special label shown instead of a numeric birthrate when the birthrate is controlled by an animation keyframe curve rather than a static value.

---

### Multi-UV Support (`extra_uv_stage_warn`)
The MDL format supports up to four UV stages (`tverts`, `tverts1`, `tverts2`, `tverts3`) — used by NWN for lightmapping and detail texturing on top of the primary diffuse UV layout. The viewer currently **parses** stages 1–3 but does not yet render them (no second UV channel is wired into the Three.js material). If a loaded model carries any of these extra stages, `extra_uv_stage_warn` fires once as a log warning, and affected nodes show an "UV1/2/3 (unused)" hint in the Node Detail panel.

### Reference Nodes (`ref_model_not_loaded`)
A `reference` node points at a separate sub-model via its `refModel` field, meant to be loaded and attached at that node's position at runtime. The viewer **parses** `refModel`/`reattachable` but does not load or merge the referenced sub-model into the scene — the node renders as a distinct wireframe marker instead of a solid dummy sphere. `ref_model_not_loaded` fires once per affected node as a log warning, and the Node Detail panel shows the referenced model name with a "(not loaded)" hint.

---

## Troubleshooting

* **Fallback:** If a key is missing in your translation, the viewer falls back to the built-in English default strings — no crash or visible error.
* **JSON Syntax:** Use a JSON Linter to ensure no commas or quotes are missing. Always verify the structure after editing.
* **Encoding:** Always save files in **UTF-8** (without BOM) to ensure special characters like "ä, ö, ü" display correctly.
* **`_meta` block:** The `code` field must match the filename (e.g. `"code": "fr"` for `lang/fr.json`). The `version` field is informational only and does not affect loading.

---

## Available languages / Verfügbare Sprachen

| File | Language | Status |
|------|----------|--------|
| `en.json` | English | Built-in default (v1.4.1) |
| `de.json` | Deutsch | Maintained (v1.4.1) |

Contributions welcome — submit a pull request!
