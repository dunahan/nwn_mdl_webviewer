# NWN MDL Viewer — Translations / Übersetzungen

## Selecting a language / Sprache wählen

Add `?lang=XX` to the URL, where `XX` is the filename without `.json`:

* `index.html?lang=en`     → English (default)
* `index.html?lang=de`     → Deutsch
* `index.html?lang=fr`     → Français (if lang/fr.json exists)

### URL Examples
* **GitHub Pages:** `https://your-name.github.io/nwn-mdl-viewer/?lang=en`
* **Local Server:** `http://localhost:8080/?lang=en`

> **Note:** When opening `index.html` directly from the filesystem (`file://`), the browser cannot load external JSON files due to security restrictions. The viewer will fall back to the built-in German strings automatically.
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

## Key reference / Schlüssel-Referenz (v1.1)

| Key Group | Description |
|-----------|-------------|
| `logo_*` / `drop_*` | Header and Drag & Drop zone text. |
| `ctrl_*` / `btn_*` | UI Controls (Wireframe, Lighting, Grid, etc.). |
| `ntb_*` / `colordrop_*` | Mesh visibility and Walkmesh (WOK/PWK) color settings. |
| `anim_*` | Animation playback controls. |
| `nd_*` | Node Detail panel (shows specific data for the selected node). |
| `info_*` | Model Info panel (general statistics like vertex count). |
| `status_*` | Bottom status bar messages (supports placeholders). |
| `super_*` | Messages regarding Supermodel/Animation merging. |
| `err_*` | Error messages for invalid files or parsing issues. |
| `plt_*` | Labels for the PLT (Pixel Look-up Table) color picker. |

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

### Supermodel Logic (`super_*`)
If a model references a Supermodel for animations, these strings guide the user to load the required additional `.mdl` files to enable animations.

---

## Troubleshooting

* **Fallback:** If a key is missing in your translation, the viewer falls back to the built-in default strings.
* **JSON Syntax:** Use a JSON Linter to ensure no commas or quotes are missing. Always verify the structure after editing.
* **Encoding:** Always save files in **UTF-8** (without BOM) to ensure special characters like "ä, ö, ü" display correctly.

---

## Available languages / Verfügbare Sprachen

| Datei | Sprache | Status |
|-------|---------|--------|
| `de.json` | Deutsch | Standard / Default |
| `en.json` | English | Maintained |

Contributions welcome — submit a pull request!