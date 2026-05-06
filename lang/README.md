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

## Key reference / Schlüssel-Referenz (v1.2)

| Key Group | Description |
|-----------|-------------|
| `logo_*` / `drop_*` | Header and Drag & Drop zone text. |
| `ctrl_*` / `btn_*` | UI Controls (Wireframe, Lighting, Grid, etc.). |
| `ntb_*` / `colordrop_*` | Mesh visibility and Walkmesh (WOK/PWK) color settings. |
| `anim_*` | Animation playback controls. |
| `nd_*` | Node Detail panel (shows specific data for the selected node). |
| `nd_em_*` | Particle Emitter specific properties in the Node Detail panel. |
| `info_*` | Model Info panel (general statistics like vertex count). |
| `status_*` | Bottom status bar messages (supports placeholders). |
| `super_*` | Messages regarding Supermodel/Animation merging. |
| `err_*` | Error messages for invalid files, parsing issues, or missing themes. |
| `plt_*` | Labels for the PLT (Pixel Look-up Table) color picker. |
| `dcmp_*` | UI strings for the MDL decompiler process. |
| `cm_*` | Technical log messages for the cleanmodels WASM module. |
| `wasm_*` | Status and error messages for the WASM decompiler module loading. |
| `log_em_*` | Log messages for the particle Emitter system initialization and errors. |
| `log_char_*` | Log messages for Multi-Part character/weapon assembly (part merging, skeleton attachment, bounding-box stacking). |

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

---

## Detailed Feature Notes (v1.1)

### Walkmesh & Collision (`colordrop_*`)
These keys define labels for specialized mesh types.
* **WOK**: Walkmesh for tilesets (surfaces).
* **PWK / DWK**: Walkmesh for placeables and doors (regions).
* **Walk Geometry**: The actual navigable surface area within a collision mesh.

### PLT Layers (`plt_layer_N`)
Neverwinter Nights uses a 10-layer palette system for dynamic coloring of armors and skins.
* **Layers 0–1:** Usually reserved for Skin and Hair.
* **Layers 2–7:** Materials like Metal, Cloth, and Leather.
* **Layers 8–9:** Tattoos or special glow effects.

### Multi-Part Assembly (`log_char_*`)
NWN character models can consist of multiple separate MDL parts (body, helmet, weapons, etc.) that are assembled at runtime. These keys cover the log output during that process.
* **`log_char_assembly`**: Logged when the multi-part pipeline starts.
* **`log_char_part`**: Logged for each part merged into the base model.
* **`log_char_positioned`**: Logged when parts are stacked via bounding-box fallback (no skeleton found).
* **`log_char_skeleton`**: Logged when a base skeleton is found and exact bone attachment is used.
* **`log_char_bone`**: Logged for each individual part-to-bone mapping with its Z-offset.

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
| `en.json` | English | Standard / Default (v1.2) |
| `de.json` | Deutsch | Maintained (v1.2) |

Contributions welcome — submit a pull request!
