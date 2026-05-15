# ⬡ NWN MDL Viewer

A browser-based 3D model viewer for **Neverwinter Nights 1: Enhanced Edition** binary AND decompiled ASCII `.mdl` files.
No installation, no server — just open `index.html` locally or use it directly via **GitHub Pages**.

🌐 **Live Demo:** `https://dunahan.github.io/nwn_mdl_webviewer/`

---

## ✨ Features

### MDL Parsing & Rendering
- **MDL ASCII Parser** — Parses node types: `trimesh`, `skin`, `danglymesh`, `animmesh`, `dummy`, `emitter`, `aabb`, `light`, `reference`
- **Binary MDL support** — Inline WebAssembly decompilation via [CleanModelsEE](https://github.com/plenarius/cleanmodels/tree/v4-go-rewrite); drag & drop compiled `.mdl` files directly
- **3D Rendering** — Phong shading with ambient, directional and fill lights; switchable Flat/Smooth shading
- **EFFECT-class models** — `selfillumcolor` → emissive texture mapping, alpha keyframe animation (e.g. `vdr_globemin`, `vim_cntglobe`)
- **Skinned meshes** — Skin node orientation (axis-angle) applied for accurate bind positions

### Multi-Part Model Assembly
- **Character part assembly** — Automatically detects and merges NWN body part files (regex `p[mf][a-z]\d_…`) into a single scene; pelvis-based skeleton alignment
- **Weapon / prop merging** — Drag multiple `.mdl` files at once; independent part models are merged into one scene
- **EFFECT-only model inclusion** — Emitter-only models (no geometry) are included in multi-part assemblies
- **Supermodel chain** — Loads and links `setsupermodel` references when the parent file is dropped together

### Animations
- **Keyframe playback** — Interpolation for position, orientation, scale, alpha and UV animation keys
- **Scrubber & speed control** — Interactive timeline with ¼×, ½×, 1×, 2× speed presets
- **Animation selector** — Drop-down list of `newanim` blocks in the model

### Particle Emitters
- **Emitter system** — Pool-based particle management with NWN emitter parameter support (`birthrate`, `lifeexp`, `velocity`, `spread`, `particleRot`, …)
- **Sprite-sheet UV animation** — UV tiling and orientation (TGA flip-Y / `flipY=false` compatible)
- **Keyframe-driven birthrate** — Emitter birthrate follows animation keyframe curves

### Textures & Materials
- **Texture formats** — TGA, DDS, PNG, JPG
- **MTR support** — Enhanced Edition multi-texture material files with per-slot status indicators (✓ loaded / ? missing / — undefined)
- **TXI support** — Reads texture metadata (clamp, blend mode, …)
- **PLT (BioWare Palette Texture)** — Full 10-layer palette system with per-layer color picker UI:
  `skin · hair · metal1 · metal2 · cloth1 · cloth2 · leather1 · leather2 · tattoo1 · tattoo2`

### Walkmesh Visualisation
- **WOK** (area walkmesh) — Surface-type coloring, per-surface color picker, pinnable across loads
- **PWK** (placeable walkmesh) — Walk geometry + interaction point regions, individual color pickers, pinnable
- **DWK** (door walkmesh) — Three door states (Closed / Open 1 / Open 2), per-state geometry, color pickers, pinnable

### Scene Graph & Inspection
- **Node hierarchy** — Scene graph in the sidebar, collapsible
- **Per-node visibility** — Toggle individual nodes via ⬡ icon
- **Type filter toolbar** — One-click bulk toggle for MESH / SKIN / DUMMY / EMIT / LIGHT / AABB / DANG
- **Node Inspector** — Draggable floating panel with zoom controls (−/○/＋); shows: vertices, faces, bitmap name, position, orientation, diffuse colour, alpha, self-illumination colour

### Camera & Display Controls
| Control | Description |
|---------|-------------|
| Orbit | Left mouse drag |
| Zoom | Scroll wheel |
| Pan | Right mouse drag |
| Touch | Pinch-zoom & drag supported |
| Reset Camera | Button in toolbar |

| Toggle | Description |
|--------|-------------|
| Wireframe | Overlay with adjustable opacity slider |
| Lighting | Intensity slider |
| Mesh Opacity | Global mesh transparency slider |
| Floor Plane | Toggleable reference floor |
| Grid | Ground grid overlay |
| Bounding Box | Axis-aligned bounding box helper |
| Axes Helper | World-space origin axes |
| Skeleton | Bone visualisation for skinned meshes |
| Normal Helper | Per-face normal display |
| Auto-Rotate | Continuous model rotation |

### UI & Theming
- **Themes** — Built-in *Default* and *High Contrast* themes; load any custom theme via JSON file
- **i18n** — Full English / German UI (switchable at runtime); all strings externalized to `lang/*.json`
- **Error Log Panel** — Timestamped entries with three levels:

| Sign | Color | Meaning |
|------|-------|---------|
| $${\color{red}✕}$$ | $${\color{red}Red}$$ | Error (TGA/DDS parse, MDL, FileReader) |
| $${\color{orange}⚠}$$ | $${\color{orange}Orange}$$ | Warning (missing texture, pending supermodel, …) |
| $${\color{grey}·}$$ | $${\color{grey}Grey}$$ | Info |

The panel opens automatically on errors; the badge counter lights up orange for warnings.

### MTR Texture Status Indicators

| Symbol | Color | Meaning |
|--------|-------|---------|
| $${\color{gold}✓}$$ | $${\color{gold}Gold}$$ | Texture loaded and active |
| $${\color{yellow}?}$$ | $${\color{yellow}Amber}$$ | Referenced in MTR, but file not loaded |
| $${\color{grey}—}$$ | $${\color{grey}Grey}$$ | Slot not defined in MTR |

---

## 🚀 Quick Start

### Option A — GitHub Pages (recommended)

1. Fork or clone this repository
2. Go to **Settings → Pages → Source → Deploy from branch → `main` / `(root)`**
3. Visit `https://<your-username>.github.io/nwn_mdl_webviewer/`

### Option B — Local use (with a release)

1. Download the latest Release from GitHub
2. Open in browser (Chrome, Firefox, Edge)
3. Drag `.mdl` + texture files (`.tga`, `.dds`, `.plt`, …) into the drop zone

### Option C — Local use (build from source)

```bash
git clone https://github.com/dunahan/nwn_mdl_webviewer.git
cd nwn_mdl_webviewer

# Creates dist/index.html (self-contained, all JS inlined)
python3 build.py

cd dist
open index.html          # macOS
start index.html         # Windows
xdg-open index.html      # Linux
```

---

## 📁 File Formats Supported

| Extension | Description |
|-----------|-------------|
| `.mdl` | NWN model — ASCII (decompiled) or binary (auto-decompiled via WASM) |
| `.tga` | TGA texture (parsed in-browser) |
| `.dds` | DDS texture (compressed formats) |
| `.png` / `.jpg` | Standard image formats |
| `.plt` | BioWare Palette Texture (10-layer colourisable texture) |
| `.mtr` | Enhanced Edition material definition |
| `.txi` | Texture metadata |
| `.wok` | Area walkmesh |
| `.pwk` | Placeable walkmesh |
| `.dwk` | Door walkmesh |

---

## 🔧 Binary MDL Decompilation

The viewer can decompile binary `.mdl` files **directly in the browser** using an embedded WebAssembly build of [CleanModelsEE](https://github.com/plenarius/cleanmodels/tree/v4-go-rewrite).
Just drop a compiled model onto the viewer — no external tools required.

For batch decompilation or repair outside the viewer, use the standalone CLI tool:

```bash
# Decompile a single binary MDL to ASCII
cleanmodels decompile plc_torch.mdl plc_torch.mdl

# Repair + decompile an entire folder recursively
cleanmodels repair -a -r haks/ cleaned/

# Check + verbose log
cleanmodels check -r -v models/ &> log.txt
```

Alternatively:

| Tool | Platform | Notes |
|------|----------|-------|
| [nwnmdlcomp](https://neverwintervault.org/project/nwn1/other/tool/nwnmdlcomp-nwn-model-compiler) | CLI | `nwnmdlcomp -d model.mdl` |
| [NWNExplorer](https://github.com/virusman/nwnexplorer) | Windows GUI | Can export ASCII MDL |

---

## 📂 Project Structure

```
nwn-mdl-webviewer/
├── index.html              # Main entry point
├── README.md               # This file
├── LICENSE                 # MIT License
├── build.py                # Build script (inlines all JS/CSS → dist/)
├── .gitignore
│
├── css/
│   └── viewer.css          # All UI styles and theme variables
│
├── js/
│   ├── animation.js        # Keyframe animation playback & scrubber
│   ├── cleanmodels.js      # WASM bridge for binary MDL decompilation
│   ├── dwk.js              # Door walkmesh parser & renderer
│   ├── emitter.js          # Particle emitter system (pool, UV anim)
│   ├── loader.js           # File drop handler, multi-part assembly logic
│   ├── log.js              # Error/warning/info log panel
│   ├── mtr.js              # MTR material file parser
│   ├── palettes.js         # PLT palette data & getPaletteRGB() API
│   ├── parser.js           # MDL ASCII parser (all node types)
│   ├── plt_swatch.js       # PLT layer UI & color picker watcher
│   ├── pwk.js              # Placeable walkmesh parser & renderer
│   ├── scene.js            # Three.js scene setup, camera, render loop
│   ├── scene_build.js      # MDL → Three.js object builder
│   ├── session.js          # Session state, texture cache, scene reset
│   ├── textures.js         # TGA/DDS/PNG loader, texture cache
│   ├── txi.js              # TXI metadata parser
│   ├── ui.js               # Sidebar, node list, inspector panel, controls
│   ├── wasm_exec.js        # Go WASM runtime support
│   └── wok.js              # Area walkmesh parser & renderer
│
├── lang/
│   ├── en.json             # English UI strings
│   ├── de.json             # German UI strings
│   └── README.md           # How to add a new translation
│
├── wasm/
│   └── cleanmodels.wasm    # CleanModelsEE WebAssembly binary
│
├── testfiles/              # Sample MDL files for testing
├── docs/
│   ├── FORMAT.md           # NWN MDL format reference
│   └── DECOMPILE.md        # Step-by-step decompilation guide
│
└── .github/
    └── workflows/
        ├── pages.yml       # GitHub Pages auto-deploy
        └── update-wasm.yml # Auto-update WASM from CleanModelsEE releases
```

---

## 🎮 Usage

1. Open the viewer in your browser
2. **Drag & drop** one or more `.mdl` files (+ textures) onto the viewport  
   — or click the drop zone to pick files
3. For **multi-part models** (character body parts, weapon components), drop all parts at once — the viewer assembles them automatically
4. Use the **sidebar** to inspect nodes and toggle visibility
5. Click any node name to open the **Node Inspector** panel (draggable, zoomable)
6. Drop `.wok` / `.pwk` / `.dwk` files alongside the model to visualise walkmesh geometry

---

## ⚠️ Known Limitations

- Not every model variant has been tested; edge cases may still produce display artefacts
- Supermodel references that are not dropped together with the main model are noted in the log but not loaded automatically
- Export to glTF / OBJ is not yet implemented

---

## 🗺️ Roadmap

- [x] Texture loading (TGA, DDS, PNG, PLT)
- [x] Animation playback (keyframe interpolation, scrubber, speed control)
- [x] Binary MDL decompilation (in-browser WASM)
- [x] Walkmesh visualisation (WOK, PWK, DWK)
- [x] PLT palette texture system (10 layers, color picker)
- [x] Particle emitter system (pool-based, sprite-sheet UV)
- [x] Multi-part model assembly (characters, weapons)
- [x] EFFECT-class model rendering (selfillum, alpha keyframes)
- [x] Theme system (built-in + custom JSON)
- [x] Full i18n (EN / DE)
- [ ] Export to glTF / OBJ
- [ ] Automatic supermodel chain loading

---

## 🛠️ Tech Stack

| Technology | Version | Purpose |
|-----------|---------|---------|
| [Three.js](https://threejs.org/) | r152 | 3D rendering (WebGL) |
| Vanilla JS | ES2020 | MDL parser, UI logic, all modules |
| HTML / CSS | — | UI (no framework) |
| WebAssembly | — | In-browser binary MDL decompilation |
| [Cinzel](https://fonts.google.com/specimen/Cinzel) | — | Display font (Google Fonts) |
| [Share Tech Mono](https://fonts.google.com/specimen/Share+Tech+Mono) | — | Monospace UI font |

---

## 📜 License

MIT — see [LICENSE](LICENSE)

---

## 🙏 Credits

- **Bioware / Beamdog** for the NWN MDL format
- **plenarius** for [CleanModelsEE](https://github.com/plenarius/cleanmodels) (WASM decompiler)
- **Three.js** contributors
- NWN community tools: nwneetools, NWNExplorer

---

*Made with ♥ for the Neverwinter Nights modding community*
