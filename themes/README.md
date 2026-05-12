# NWN MDL Viewer — Theme Documentation

The viewer supports custom themes in JSON format. You can fully customize the appearance — colors, accents, and font sizes.

---

## Loading a Theme

1. Open the viewer.
2. Click on **📂 Custom…** in the dropdown next to the language selection. 
3. Select your `.json` file.

The theme is applied immediately and will automatically load as the "Default" upon the next start.
**Note:** Custom themes are not saved when the browser is closed — you will need to reload them next time.

---

## JSON File Structure

```json
{
  "name": "My Theme",
  "author": "Your Name",
  "description": "Short description (optional)",
  "variables": {
    "--bg":    "#0a0c0f",
    "--panel": "#10141a"
  }
}
```

- `name`, `author`, `description` — optional, but recommended.
- `variables` — **required field**, contains all CSS variables you wish to override.
- You do **not need to provide all variables** — any missing values will be inherited from the default theme.

---

## All Available Variables

### Backgrounds

| Variable | Default | Description |
|---|---|---|
| `--bg` | `#0a0c0f` | Main background color (Viewport) |
| `--panel` | `#10141a` | Sidebar background, dropdowns, input fields |

Whenever you change `--bg`, `--bg-rgb` must also be set to the corresponding RGB values (comma-separated, without rgb()):

```json
"--bg":    "#1a1a2e",
"--bg-rgb": "26, 26, 46"
```

The same applies to `--gold` → `--gold-rgb`.

---

### Borders & Dividers

| Variable | Default | Description |
|---|---|---|
| `--border` | `#2a3040` | All border lines and dividers |

---

### Akzentfarben

| Variable | Default | Description |
|---|---|---|
| `--gold` | `#c8a44a` | Primary accent (titles, active buttons, hover) |
| `--gold2` | `#e8c870` | Lighter accent (hover text in the drop zone) |
| `--amber` | `#f08030` | Warning notices (MTR notice text) |
| `--gold-rgb` | `200, 164, 74` | RGB channel of `--gold` — **always keep in sync!** |
| `--bg-rgb` | `10, 12, 15` | RGB channel of `--bg` — **always keep in sync!** |

---

### Text

| Variable | Default | Description |
|---|---|---|
| `--text` | `#d0c8b8` | Primary text |
| `--muted` | `#6a7080` | Secondary/dimmed text, labels |
| `--section-heading` | `#8a95a8` | Section headings (Textures, Scene Graph, Animations, PLT Layers) — defaults to same value as `--muted`, but can be set independently |

---

### Node Colors (Scene Graph)

| Variable | Default | Description |
|---|---|---|
| `--mesh` | `#4a90c0` | Trimesh-Nodes |
| `--dummy` | `#70b870` | Dummy-Nodes |
| `--skin` | `#c070c0` | Skin-Nodes |
| `--emitter` | `#f0a030` | Emitter-Nodes |
| `--danglymesh` | `#50b8d0` | Danglymesh-Nodes |
| `--aabb` | `#e8a020` | AABB-Nodes |

---

### Status & Log

| Variable | Default | Description |
|---|---|---|
| `--red` | `#c04040` | Error color (Cancel button border) |
| `--red-light` | `#e06060` | Error color (Cancel button text on hover) |
| `--log-error` | `#e05050` | Log entries: Error icon |
| `--log-warn` | `#e0a030` | Log entries: Warning icon |

---

### Scrollbar

| Variable | Default | Description |
|---|---|---|
| `--scrollbar` | `#606880` | Color of the scrollbars in the sidebar |

---

### Schriftgrößen

| Variable | Default | Description |
|---|---|---|
| `--font-size-base` | `13px` | Standard font size (body) |
| `--font-size-small` | `11px` | Small text (texture list, node list) |
| `--font-size-label` | `10px` | Labels, panel titles |
| `--font-size-tiny` | `9px` | Very small text (badges, speed buttons) |
| `--font-size-log` | `12px` | Log panel text (entries, timestamp, toggle) |
| `--font-size-node` | `12px` | Node names in the Scene Graph list (type badges scale automatically: `node - 2px`) |

---

## Full Template

You can copy and customize this template directly. Save it as `mein-theme.json`:

```json
{
  "name": "My Theme",
  "author": "Your Name",
  "description": "Description",
  "variables": {
    "--bg":              "#0a0c0f",
    "--bg-rgb":          "10, 12, 15",
    "--panel":           "#10141a",
    "--border":          "#2a3040",
    "--gold":            "#c8a44a",
    "--gold-rgb":        "200, 164, 74",
    "--gold2":           "#e8c870",
    "--amber":           "#f08030",
    "--text":            "#d0c8b8",
    "--muted":           "#6a7080",
    "--section-heading": "#8a95a8",
    "--mesh":            "#4a90c0",
    "--dummy":           "#70b870",
    "--skin":            "#c070c0",
    "--emitter":         "#f0a030",
    "--danglymesh":      "#50b8d0",
    "--aabb":            "#e8a020",
    "--red":             "#c04040",
    "--red-light":       "#e06060",
    "--log-error":       "#e05050",
    "--log-warn":        "#e0a030",
    "--scrollbar":       "#606880",
    "--font-size-base":  "13px",
    "--font-size-small": "11px",
    "--font-size-label": "10px",
    "--font-size-tiny":  "9px",
    "--font-size-log":   "12px",
    "--font-size-node":  "12px"
  }
}
```

---

## Tips

- **Farben** can be specified in any CSS color format: `#rrggbb`, `#rgb`, `rgb(r,g,b)`, `hsl(...)` etc.
- **`--bg-rgb` and `--gold-rgb`** ust always be provided as comma-separated RGB numbers (without the `rgb()` wrapper), as they are used internally for semi-transparent backgrounds (e.g., `rgba(var(--bg-rgb), 0.85)`).
- You can override only specific variables — any unlisted variables will retain their default values.
- A good tool for choosing colors: [coolors.co](https://coolors.co) or the color picker in your operating system.
