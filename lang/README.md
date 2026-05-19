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

## Key reference / Schlüssel-Referenz (v1.4)

| Key Group | Description |
|-----------|-------------|
| `logo_*` / `drop_*` | Header and Drag & Drop zone text. |
| `ctrl_*` / `btn_*` | UI Controls (Wireframe, Lighting, Grid, etc.). |
| `ntb_*` / `colordrop_*` | Mesh visibility and Walkmesh (WOK/PWK/DWK) color settings. |
| `dwk_*` | Door Walkmesh state labels (Closed / Open 1 / Open 2), pin-toggle tooltip, and DWK load status messages. |
| `anim_*` | Animation playback controls. |
| `nd_*` | Node Detail panel (shows specific data for the selected node). |
| `nd_em_*` | Particle Emitter specific properties in the Node Detail panel. |
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
| `{bone}` | Name of a skeleton bone | "Part {part} → bone {bone} (Z: {z})" |
| `{z}` | Z-position of an attachment point | "Part {part} → bone {bone} (Z: {z})" |
| `{dp}` | Number of door positions in a DWK mesh | "DWK loaded: {nodes} mesh(es), {faces} face(s), {dp} door position(s)." |
| `{pct}` | WASM download progress in percent | "Downloading WASM… {pct}%" |
| `{names}` | Comma-separated list of watched texture filenames | "Watching: cube_diff.tga, cube_norm.tga" |

---

## Detailed Feature Notes (v1.3)

### Walkmesh & Collision (`colordrop_*`)
These keys define labels for specialized mesh types.
* **WOK**: Walkmesh for tilesets (surfaces).
* **PWK**: Walkmesh for placeables (regions and interaction points).
* **DWK**: Walkmesh for doors. Supports three states — Closed, Open 1, and Open 2 — selectable via the DWK button in the toolbar. The pin toggle (`dwk_pin_title` / `dwk_pinned_on`) keeps the DWK visible when the next model is loaded.
* **Walk Geometry**: The actual navigable surface area within a collision mesh.

### PLT Layers (`plt_layer_N`)
Neverwinter Nights uses a 10-layer palette system for dynamic coloring of armors and skins.
* **Layers 0–1:** Usually reserved for Skin and Hair.
* **Layers 2–7:** Materials like Metal, Cloth, and Leather.
* **Layers 8–9:** Tattoos or special glow effects.

### WASM Decompiler Phases (`dcmp_phase_*`)
When a binary MDL is loaded, the WASM decompiler goes through a sequence of loading stages. Each stage has its own translatable label shown in the progress overlay:

| Key | Stage |
|-----|-------|
| `dcmp_phase_fetch` | Downloading the WASM binary (shows `{pct}%` if progress is available) |
| `dcmp_phase_fetch_indeterminate` | Downloading WASM without known progress |
| `dcmp_phase_decode` | Decoding the Base64-encoded WASM data |
| `dcmp_phase_compile` | Browser compiling the WASM module |
| `dcmp_phase_instantiate` | Instantiating the compiled module |
| `dcmp_phase_wait` | Waiting for the Go runtime to become ready |
| `dcmp_phase_ready` | Module ready — shown briefly before decompilation starts |
| `dcmp_phase_decompile` | Active decompilation of the MDL file |

### Multi-Part Assembly (`log_multi_part`, `log_char_*`)
NWN models can consist of multiple separate MDL parts assembled at runtime. The viewer distinguishes two assembly types:

**Generic Multi-Part (Fall C)** — e.g. weapon parts (`_b_` blade / `_m_` middle / `_t_` top):
* **`log_multi_part`**: Logged for each part merged into the base model during generic assembly.

**Character Multi-Part (Fall D)** — body parts of dynamic characters (chest, head, legs, …):
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

**Note:** The `hr_tauri_not_impl` key exists in the built-in fallback strings but is intentionally omitted from the external JSON files — it is a developer-facing placeholder for a future Tauri desktop backend and does not require translation.

### Supermodel Logic (`super_*`)
If a model references a Supermodel for animations, these strings guide the user to load the required additional `.mdl` files to enable animations.

### Particle Emitters (`nd_em_*`, `log_em_*`)
NWN uses emitter nodes for particle effects. These keys cover the various physics, timing, and rendering properties (like birthrate, life expectancy, drag, gravity, etc.) displayed in the node details panel when an emitter is selected.

---

## Troubleshooting

* **Fallback:** If a key is missing in your translation, the viewer falls back to the built-in default strings.
* **JSON Syntax:** Use a JSON Linter to ensure no commas or quotes are missing. Always verify the structure after editing.
* **Encoding:** Always save files in **UTF-8** (without BOM) to ensure special characters like "ä, ö, ü" display correctly.

---

## Available languages / Verfügbare Sprachen

| Datei | Sprache | Status |
|-------|---------|--------|
| `en.json` | English | Standard / Default (v1.4) |
| `de.json` | Deutsch | Maintained (v1.4) |

Contributions welcome — submit a pull request!
