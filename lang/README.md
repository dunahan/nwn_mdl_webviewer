# NWN MDL Viewer — Translations / Übersetzungen

## Selecting a language / Sprache wählen

Add `?lang=XX` to the URL, where `XX` is the filename without `.json`:

```
index.html?lang=en     → English
index.html?lang=de     → Deutsch (default)
index.html?lang=fr     → Français  (if lang/fr.json exists)
```

On **GitHub Pages** the URL would look like:
```
https://your-name.github.io/nwn-mdl-viewer/?lang=en
```

When running **locally** (via a web server), the same applies:
```
http://localhost:8080/?lang=en
```

> **Note:** When opening `index.html` directly from the filesystem (`file://`),
> the browser cannot load external JSON files due to security restrictions.
> The viewer will fall back to the built-in German strings automatically.
> To test translations locally, use a simple HTTP server:
> ```bash
> python3 -m http.server 8080
> # then open http://localhost:8080
> ```

---

## Creating a new translation / Neue Sprache erstellen

1. Copy `lang/en.json` to `lang/XX.json` (e.g. `lang/fr.json`)
2. Edit the `_meta` block:
   ```json
   "_meta": {
     "language": "Français",
     "code": "fr",
     "author": "Your Name",
     "version": "1.0"
   }
   ```
3. Translate all values (keep the keys unchanged!)
4. Do **not** translate `{placeholder}` tokens like `{name}`, `{n}`, `{total}`, `{cls}`, `{msg}`, `{lang}` —
   these are filled in dynamically at runtime.
5. Open `index.html?lang=fr` to test.

---

## Key reference / Schlüssel-Referenz

| Key | Used for |
|-----|----------|
| `logo_subtitle` | Subtitle under "NWN MDL Viewer" in the header |
| `drop_title` | Drop zone heading |
| `drop_or` | Drop zone secondary text |
| `drop_hint` | Drop zone small hint |
| `textures_heading` | "Textures" section label in sidebar |
| `scene_graph` | "Scene Graph" section label |
| `no_file_loaded` | Placeholder in node list when empty |
| `ctrl_wireframe` | Wireframe slider label |
| `ctrl_lighting` | Lighting slider label |
| `btn_normals` | Normals toggle button |
| `btn_grid` | Grid toggle button |
| `btn_bbox` | Bounding Box toggle button |
| `btn_rotate` | Auto-rotation toggle button |
| `empty_title` | Large text in empty viewport |
| `empty_hint` | Small hint in empty viewport |
| `hud_*` | Camera HUD overlay texts |
| `axis_up` | Y-axis label (shows which direction is up) |
| `status_ready` | Initial status bar message |
| `nd_*` | Node detail panel field labels |
| `info_*` | Model info panel field labels |
| `vis_toggle_title` | Tooltip for the visibility toggle button |
| `sidebar_toggle_title` | Tooltip to collapse/expand the sidebar |
| `log_toggle_title` | Tooltip to collapse/expand the activity log |
| `status_*` | Dynamic status messages (`{placeholder}` tokens are replaced) |
| `super_* ` | Supermodel and animation merging logic messages |
| `err_*` | Error messages |
| `plt_heading` | Heading for the PLT (Pixel Look-up Table) color picker |
| `plt_row_label` | Label for color rows in the PLT picker |
| `plt_layer_*` | "Individual layer names for PLT textures (Skin, Hair, Metal, etc.)" |

---

## Available languages / Verfügbare Sprachen

| Datei | Sprache |
|-------|---------|
| `de.json` | Deutsch (Standard / Default) |
| `en.json` | English |

Contributions welcome — submit a pull request!
