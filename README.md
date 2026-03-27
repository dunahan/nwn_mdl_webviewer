# ⬡ NWN MDL Viewer

A browser-based 3D model viewer for **Neverwinter Nights 1: Enhanced Edition** decompiled ASCII `.mdl` files.  
No installation, no server — just open `index.html` locally or use it directly via **GitHub Pages**.

🌐 **Live Demo:** `https://<your-username>.github.io/nwn-mdl-viewer/`

---

## ✨ Features

- **MDL ASCII Parser** — Parses all node types: `trimesh`, `skin`, `dummy`, `emitter`, `aabb`, `light`, `reference`
- **3D Rendering** — Phong shading with ambient, directional and fill lights
- **Scene Graph** — Full node hierarchy in the sidebar, each node individually toggleable
- **Node Inspector** — Click any node to see vertices, faces, bitmap name, position, diffuse colour, alpha
- **Camera Controls** — Orbit (LMB drag), Zoom (scroll wheel), Pan (RMB drag), touch support
- **Wireframe Overlay** — Adjustable opacity slider
- **Lighting Control** — Intensity slider
- **Extras** — Auto-rotation, Bounding Box display, Grid toggle, Flat/Smooth shading
- **Zero dependencies** — Only Three.js r128 (loaded from CDN); runs fully offline once cached

---

## 🚀 Quick Start

### Option A — GitHub Pages (recommended)

1. Fork or clone this repository
2. Go to **Settings → Pages → Source → Deploy from branch → `main` / `(root)`**
3. Visit `https://<your-username>.github.io/nwn-mdl-viewer/`

### Option B — Local use

```bash
git clone https://github.com/<your-username>/nwn-mdl-viewer.git
cd nwn-mdl-viewer
# Simply open index.html in any modern browser:
open index.html          # macOS
start index.html         # Windows
xdg-open index.html      # Linux
```

---

## 📁 File Format

NWN stores models as **compiled binary** `.mdl` files.  
This viewer requires the **decompiled ASCII format**.

### How to decompile

**Using `nwnmdlcomp`** (official NWN:EE tool):

```bash
# Install via NWN:EE Toolset or download from:
# https://github.com/nwneetools/nwneetools

nwnmdlcomp -d c_dragon.mdl
# → outputs c_dragon_ascii.mdl  (or similar name)
```

**Using `nwn-lib` (Python):**

```bash
pip install nwn
python -m nwn.mdl decompile c_dragon.mdl -o c_dragon_ascii.mdl
```

**Using older tools:**

| Tool | Platform | Notes |
|------|----------|-------|
| [NWNExplorer](https://github.com/virusman/nwnexplorer) | Windows | GUI, can export ASCII MDL |
| [nwnmdlcomp](https://github.com/nwneetools/nwneetools) | Win/Linux/Mac | CLI, official EE tool |
| [nwn-lib](https://rubygems.org/gems/nwn-lib) | Ruby | `nwn-gff`, also handles MDL |

---

## 📂 Project Structure

```
nwn-mdl-viewer/
├── index.html              # Main application (self-contained)
├── README.md               # This file
├── LICENSE                 # MIT License
├── .gitignore
├── docs/
│   ├── FORMAT.md           # NWN MDL format reference
│   └── DECOMPILE.md        # Step-by-step decompilation guide
└── .github/
    └── workflows/
        └── pages.yml       # GitHub Pages auto-deploy workflow
```

---

## 🎮 Usage

1. Open the viewer in your browser
2. **Drag & drop** a decompiled `.mdl` file onto the viewport  
   — or click the drop zone and pick a file
3. Use the sidebar to inspect nodes and toggle visibility
4. Click any node name in the list to see its details

### Controls

| Action | Control |
|--------|---------|
| Orbit  | Left mouse drag |
| Zoom   | Scroll wheel |
| Pan    | Right mouse drag |
| Inspect node | Click sidebar item |
| Toggle visibility | Click ⬡ icon next to node |

---

## ⚠️ Known Limitations

- **Textures**: TGA/DDS textures are not loaded — geometry is shaded using diffuse colour values from the MDL
- **Animations**: Keyframe animations defined in `newanim` blocks are parsed (count shown) but not yet played back
- **Binary MDL**: Only ASCII/decompiled format is supported
- **Walkmesh**: AABB nodes are shown as markers but walkmesh geometry is not rendered separately

---

## 🗺️ Roadmap

- [x] Texture loading (TGA via `tga.js`, DDS support)
- [ ] Animation playback (keyframe interpolation)
- [ ] Export to glTF/OBJ
- [ ] Multiple file loading (supermodel chain)
- [ ] Walkmesh visualisation overlay

---

## 🛠️ Tech Stack

| Technology | Version | Purpose |
|-----------|---------|---------|
| [Three.js](https://threejs.org/) | r128 | 3D rendering (WebGL) |
| Vanilla JS | ES2020 | MDL parser, UI logic |
| HTML/CSS | — | UI (no framework) |
| [Cinzel](https://fonts.google.com/specimen/Cinzel) | — | Display font (Google Fonts) |
| [Share Tech Mono](https://fonts.google.com/specimen/Share+Tech+Mono) | — | Monospace UI font |

---

## 📜 License

MIT — see [LICENSE](LICENSE)

---

## 🙏 Credits

- **Bioware / Beamdog** for the NWN MDL format
- **Three.js** contributors
- NWN community tools: nwneetools, NWNExplorer

---

*Made with ♥ for the Neverwinter Nights modding community*
