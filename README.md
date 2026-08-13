# ⬡ NWN MDL Viewer

A browser-based 3D model viewer for **Neverwinter Nights 1: Enhanced Edition** binary AND decompiled ASCII `.mdl` files.
No installation, no server — just open `index.html` locally or use it directly via **GitHub Pages**.

🌐 **Live Demo:** `https://dunahan.github.io/nwn_mdl_webviewer/`

[![Latest Release](https://img.shields.io/github/v/release/dunahan/nwn_mdl_webviewer?label=Release&color=c8a44a)](https://github.com/dunahan/nwn_mdl_webviewer/releases/latest)

---

## 📋 Table of Contents

- [✨ Features](#-features)
  - [MDL Parsing & Rendering](#mdl-parsing--rendering)
  - [Multi-Part Model Assembly](#multi-part-model-assembly)
  - [Animations](#animations)
  - [Particle Emitters](#particle-emitters)
  - [Textures & Materials](#textures--materials)
  - [Walkmesh Visualisation](#walkmesh-visualisation)
  - [Texture Hot-Reload](#texture-hot-reload)
  - [Set Browser](#set-browser)
  - [Scene Graph & Inspection](#scene-graph--inspection)
  - [Camera & Display Controls](#camera--display-controls)
  - [UI & Theming](#ui--theming)
  - [Floating Panels](#floating-panels)
  - [MTR Texture Status Indicators](#mtr-texture-status-indicators)
- [🚀 Quick Start](#-quick-start)
- [📁 File Formats Supported](#-file-formats-supported)
- [🔧 Binary MDL Decompilation](#-binary-mdl-decompilation)
- [📂 Project Structure](#-project-structure)
- [🎮 Usage](#-usage)
- [⚠️ Known Limitations](#️-known-limitations)
- [🗺️ Roadmap](#️-roadmap)
- [❓ FAQ](#-faq)
- [🛠️ Tech Stack](#️-tech-stack)
- [📜 License](#-license)
- [🙏 Credits](#-credits)

---

## ✨ Features

### MDL Parsing & Rendering
- **MDL ASCII Parser** — Parses node types: `trimesh`, `skin`, `danglymesh`, `animmesh`, `dummy`, `emitter`, `aabb`, `light`, `reference`
- **Binary MDL support** — Inline WebAssembly decompilation via [CleanModelsEE](https://github.com/plenarius/cleanmodels/tree/v4-go-rewrite); drag & drop compiled `.mdl` files directly
- **3D Rendering** — PBR (MeshStandardMaterial) with ambient, directional and fill lights; switchable Flat/Smooth shading via smoothing-group-aware normal calculation
- **EFFECT-class models** — `selfillumcolor` → emissive texture mapping, alpha keyframe animation (e.g. `vdr_globemin`, `vim_cntglobe`)
- **Skinned meshes** — CPU Linear Blend Skinning in NWN Z-up space; skin node orientation (axis-angle) applied for accurate bind positions
- **Normal & specular mapping** — `NormalAndSpecMapped` / `NormalTangents` renderhint support; tangent vectors read directly from MDL or computed as fallback; ATI2/BC5 DDS normal maps supported
- **animmesh UV animation** — Smooth per-frame UV interpolation for scrolling textures (waterfalls, lava, etc.)
- **Multi-UV stage detection** — Additional UV channels (`tverts1`/`tverts2`/`tverts3`, used by NWN for lightmapping/detail texturing) are parsed and surfaced as a log warning + Node Inspector hint when present; not yet rendered (no second UV channel wired into materials)
- **Reference node detection** — `reference` nodes (pointing at a separate sub-model via `refModel`) are parsed and surfaced as a log warning + Node Inspector hint, rendered as a distinct wireframe marker; the referenced sub-model itself is not loaded/merged into the scene
- **Danglymesh simulation** — Procedural sine-wave physics for cloth, hair and chain nodes (`danglymesh`); constraint-weighted per-vertex displacement; per-animation `displacement`/`period` overrides honoured from animation blocks (e.g. wider swing during `run` animations); `displacement=0` in an animation block deactivates jitter for that clip, leaving only keyframe-driven rotation
- **AABB walkmesh** — Interior walkmesh nodes rendered with per-surface-type coloring

### Multi-Part Model Assembly
- **Character part assembly** — Automatically detects and merges NWN body part files (regex `p[mf][a-z]\d_…`) into a single scene; skeleton-based bone attachment (Mode A) with bounding-box stacking fallback (Mode B)
- **Weapon / prop merging** — Drag multiple `.mdl` files at once; independent part models are merged into one scene
- **EFFECT-only model inclusion** — Emitter-only models (no geometry) are included in multi-part assemblies
- **Supermodel chain** — Loads and links `setsupermodel` references when the parent file is dropped together

### Animations
- **Keyframe playback** — Interpolation for position, orientation, scale, alpha, UV animation, and light property keys
- **Scrubber & speed control** — Interactive timeline with ¼×, ½×, 1×, 2× speed presets
- **Animation selector** — Drop-down list of `newanim` blocks in the model
- **Supermodel animations** — Animations from base skeletons (e.g. `a_fa.mdl`) merged and applied to character parts
- **`selfillumcolorkey`** — Animated emissive color for EFFECT-class nodes; all three RGB channels correctly interpolated each frame and applied to the `emissiveMap` material

### Particle Emitters
- **Emitter system** — Pool-based particle management with NWN emitter parameter support (`birthrate`, `lifeexp`, `velocity`, `spread`, `particleRot`, `mass`, `drag`, …)
- **Sprite-sheet UV animation** — UV tiling and orientation (TGA flip-Y / `flipY=false` compatible); `xgrid`/`ygrid` support
- **Keyframe-driven birthrate** — Emitter birthrate follows animation keyframe curves (`birthratekey`)
- **Billboard modes** — Standard camera-facing sprites and `Billboard_to_World_Z` flat-ground particles
- **Smart decoration visibility** — The in-scene emitter marker (sphere, ring, directional arrows) is automatically hidden once the emitter is active and its texture is loaded; visible only as a placeholder when the texture has not yet arrived or the emitter has no birthrate

### Textures & Materials
- **Texture formats** — TGA (Types 2, 3, 10, 11 — 16/24/32-bit), DDS (DXT1, DXT3, DXT5, Bioware custom, standard), PNG, JPG; ATI1/BC4 and ATI2/BC5 for NWN:EE specular and normal maps
- **MTR support** — Enhanced Edition multi-texture material files; 6 texture slots (diffuse, normal, specular, roughness, height, emissive) with per-slot load status indicators (✓ / ? / —)
- **TXI support** — Reads texture metadata: `decal`, `clamp`, `blending`, `proceduretype cycle` sprite animation, `bumpmaptexture`, `envmaptexture`, `numx`/`numy`/`fps`
- **PLT (BioWare Palette Texture)** — Full 10-layer palette system with per-layer color picker UI and per-part independent layer control for layers 2–9:
  `skin · hair · metal1 · metal2 · cloth1 · cloth2 · leather1 · leather2 · tattoo1 · tattoo2`
- **Alpha handling** — Bimodal (hard cutout via `alphaTest`) vs. gradient (transparent blend) auto-detection; handbuilt DoubleSide mesh detection for NWN foliage/fences

### Walkmesh Visualisation
- **WOK** (area walkmesh) — Surface-type coloring with 19 material types, per-surface color picker, pinnable across loads
- **PWK** (placeable walkmesh) — Walk geometry + interaction point (IoP) markers, individual color pickers, pinnable
- **DWK** (door walkmesh) — Three door states (Closed / Open 1 / Open 2), per-state geometry, color pickers, pinnable

### Texture Hot-Reload
- **Watch Folder** — File System Access API (Chrome/Edge); monitors a local folder for changed texture files
- **Automatic reapply** — Changed TGA/DDS/PLT files are reloaded and applied to all affected materials in the scene without reloading the model; in-place canvas patch preserves GPU object references
- **Missing texture fill** — Watcher immediately fills missing textures for a newly loaded model from the watch folder
- **Scene graph indicators** — ↻ icon next to nodes whose textures are being watched; click to highlight in texture list; flash animation on reload

### Set Browser
- **Tileset (.set) parser** — Reads NWN INI-format `.set` files (tile definitions, group layouts, terrain corners)
- **Tile browser** — Searchable, filterable floating panel (grid and list view); free-text and group filter
- **Click-to-load** — Clicking an available tile loads its MDL instantly via the watch folder handle
- **Group view** — Loads all tiles of a group side-by-side in a NWN-standard 10 m × 10 m grid; the scene graph and model-info panel reflect all tiles combined (aggregate node list, total vertex/face counts)
- **Change indicator** — Active tile gets a ↻ badge when its MDL changes on disk

### Scene Graph & Inspection
- **Node hierarchy** — Scene graph in the sidebar, collapsible
- **Per-node visibility** — Toggle individual nodes via ⬡ / ● icon
- **Type filter toolbar** — One-click bulk toggle for MESH / SKIN / DUMMY / EMIT / LIGHT / AABB / DANG
- **Collision-safe visibility** — In group-loaded tileset scenes, multiple tiles may share identical node names (e.g. `walkmesh` on AABB nodes, or generic mesh names like `ground01`). Each scene graph entry correctly controls its own specific Three.js object regardless of name collisions — visibility toggles and type-filter buttons all resolve to the right tile.
- **Node Inspector** — Draggable floating panel with zoom controls (−/○/＋); shows: type, parent, vertices, faces, bitmap, position, diffuse, alpha, plus type-specific sections for emitter nodes (all parameters), light nodes (color, radius, multiplier, shadow, etc.), and MTR nodes (slot status, renderhint, tangent status, shader parameters)
- **Skeleton Helper** — Three.js SkeletonHelper overlay for skinned models; toggled via the Skeleton button
- **Node selection** — Click a node in the Scene Graph sidebar, or **Ctrl+Click** (Cmd+Click on macOS) directly on a mesh in the 3D viewport, to select it and open the Node Inspector panel
- **Selection highlight** — The selected mesh is outlined with a static white highlight (visible on trimesh, skin, danglymesh, and animmesh nodes); automatically follows CPU-skinning and danglymesh deformation, and clears when a different node is selected or the panel is closed
- **Deselect** — Ctrl+Click (Cmd+Click on macOS) on empty space in the viewport closes the Node Inspector and clears the selection highlight

### Camera & Display Controls
| Control | Description |
|---------|-------------|
| Orbit | Left mouse drag |
| Zoom | Scroll wheel |
| Pan | Right mouse drag |
| Touch | Pinch-zoom & one/two-finger drag |
| Reset Camera | Button in toolbar |

| Toggle | Description |
|--------|-------------|
| Wireframe | Overlay with adjustable opacity slider |
| Lighting | Intensity slider |
| Mesh Opacity | Global mesh transparency slider |
| Floor Plane | Toggleable reference floor (opaque, shadow-receiving) |
| Grid | Ground grid overlay |
| Bounding Box | Axis-aligned bounding box helper |
| Axes | World-space origin axes |
| Skeleton | Bone visualisation for skinned meshes |
| Smoothing | Toggle flat/smooth shading |
| Auto-Rotate | Continuous model rotation |

### UI & Theming
- **Themes** — Built-in *Default* and *High Contrast* themes; load any custom theme via JSON file; persisted in `localStorage`
- **i18n** — Full English / German UI (switchable at runtime via dropdown or `?lang=` URL parameter); all strings externalized
- **Version display** — App version shown in sidebar header (injected by build script via `{{APP_VERSION}}`)
- **Sidebar toggle** — Collapsible sidebar with smooth transition; model name hint visible in viewport when collapsed
- **Error Log Panel** — Timestamped entries with three levels; all i18n entries retranslate on language switch:

| Sign | Color | Meaning |
|------|-------|---------|
| $${\color{red}✕}$$ | $${\color{red}Red}$$ | Error (TGA/DDS parse, MDL, FileReader) |
| $${\color{orange}⚠}$$ | $${\color{orange}Orange}$$ | Warning (missing texture, pending supermodel, …) |
| $${\color{grey}·}$$ | $${\color{grey}Grey}$$ | Info |

The panel opens automatically on errors; the badge counter lights up orange for warnings.

### Floating Panels

- **Floatable sidebar panels** — The Animations and PLT Layers panels can be detached from the sidebar into freely positionable floating windows via the ⇱ button in their header; ⇲ re-docks them back into the sidebar
- **Drag-to-reposition** — Each floating panel has a ⠿ grip strip for repositioning; panels are clamped to the viewport boundary
- **Persistent state** — Floating/docked state and position are saved per panel in `localStorage` and restored on the next visit
- **Extensible** — Any sidebar container can be made floatable by adding `data-floatable` to its HTML element (`floating_panel.js`)

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
| `.tga` | TGA texture (parsed in-browser: Types 2, 3, 10, 11; 16/24/32-bit) |
| `.dds` | DDS texture: Bioware custom (DXT1/DXT5), standard (DXT1/DXT3/DXT5/ATI1/ATI2) |
| `.png` / `.jpg` | Standard image formats |
| `.plt` | BioWare Palette Texture (10-layer colourizable texture) |
| `.mtr` | Enhanced Edition multi-texture material definition (6 texture slots) |
| `.txi` | Texture metadata (blending, clamp, sprite animation, procedural effects) |
| `.wok` | Area walkmesh |
| `.pwk` | Placeable walkmesh |
| `.dwk` | Door walkmesh |
| `.set` | NWN tileset definition (tile models, terrain, groups) |

---

## 🔧 Binary MDL Decompilation

The viewer can decompile binary `.mdl` files **directly in the browser** using an embedded WebAssembly build of [CleanModelsEE](https://github.com/plenarius/cleanmodels/tree/v4-go-rewrite).
Just drop a compiled model onto the viewer — no external tools required.

A progress overlay with a cancel button is shown during decompilation. On `file://` protocol (local HTML), the WASM binary is loaded from a Base64-encoded JS file; on HTTP(S) it is streamed with real progress.

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
│   └── viewer.css          # All UI styles and CSS custom property theme variables
│
├── js/
│   ├── animation.js        # Keyframe animation engine, render loop, CPU skinning, TXI cycle
│   ├── cleanmodels.js      # WASM bridge for binary MDL decompilation (HTTP + file:// / Base64)
│   ├── dangly.js           # Danglymesh simulation — procedural sine-wave physics, per-animation displacement/period overrides
│   ├── dwk.js              # Door walkmesh parser & renderer (3 door states)
│   ├── emitter.js          # Particle emitter system (pool-based, sprite-sheet, birthratekey)
│   ├── floating_panel.js   # Floating panel manager — dock ↔ float for data-floatable sidebar panels
│   ├── hot_reload.js       # Texture hot-reload via File System Access API (browser-fsa)
│   ├── i18n.js             # Internationalisation — embedded EN/DE bundles + external JSON support
│   ├── loader.js           # File loader, multi-part assembly, supermodel merge, decompile overlay
│   ├── log.js              # Error/warning/info log panel; sidebar toggle
│   ├── mtr.js              # MTR material file parser (6 texture slots + parameters)
│   ├── palettes.js         # PLT palette data (embedded Base64) & getPaletteRGB() API
│   ├── parser.js           # MDL ASCII parser — all node types, animation keys, axis-angle orientation
│   ├── pwk.js              # Placeable walkmesh parser & renderer (walk geometry + IoP markers)
│   ├── scene.js            # Three.js scene setup, camera, orbit controls, render loop
│   ├── scene_build.js      # MDL → Three.js scene builder (geometry, materials, lights, emitters)
│   ├── session.js          # Session state reset, texture application, PLT panel, texture UI
│   ├── setbrowser.js       # Set Browser — .set parser, tile browser panel, group loading
│   ├── textures.js         # TGA/DDS/PLT/PNG parsers, texture cache, palette reapply, spec→roughness invert
│   ├── txi.js              # TXI metadata parser, UV animation registry
│   ├── ui.js               # Sidebar, node list, inspector panel, controls, PLT picker, themes
│   ├── wasm_exec.js        # Go WASM runtime support
│   └── wok.js              # Area walkmesh parser & renderer (19 surface types, color picker)
│
├── lang/
│   ├── en.json             # English UI strings
│   ├── de.json             # German UI strings
│   └── README.md           # How to add a new translation
│
├── themes/
│   ├── default.json        # Default dark theme (CSS custom properties)
│   └── high-contrast.json  # High Contrast theme
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
        ├── release.yml     # Manual release action
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
6. Use ⇱ in the **Animations** or **PLT Layers** panel header to detach them from the sidebar as floating windows; ⇲ docks them back
7. Drop `.wok` / `.pwk` / `.dwk` files alongside the model to visualise walkmesh geometry
8. Use **Watch Folder** (Chrome/Edge) to auto-reload textures whenever you edit them externally
9. Load a `.set` file via the **Set Browser** button to browse and load tileset tiles

---

## ⚠️ Known Limitations

- Not every model variant has been tested; edge cases may still produce display artefacts
- Supermodel references that are not dropped together with the main model are noted in the log but not loaded automatically
- Hot-Reload and Set Browser require Chrome or Edge (File System Access API); not available in Firefox
- Export to glTF / OBJ is not yet implemented
- Secondary UV stages (`tverts1`/`tverts2`/`tverts3`) are parsed but not rendered — lightmapped or detail-texture surfaces display using the primary UV layout only; the log panel and Node Inspector flag affected nodes
- `reference` nodes are detected but the referenced sub-model is not loaded — the node shows as a wireframe marker instead of the actual referenced geometry; the log panel and Node Inspector flag affected nodes with the target model's name

---

## 🗺️ Roadmap

- [x] Texture loading (TGA, DDS, PNG, PLT)
- [x] Animation playback (keyframe interpolation, scrubber, speed control)
- [x] Binary MDL decompilation (in-browser WASM)
- [x] Walkmesh visualisation (WOK, PWK, DWK)
- [x] PLT palette texture system (10 layers, color picker, per-part control)
- [x] Particle emitter system (pool-based, sprite-sheet UV, birthratekey)
- [x] Multi-part model assembly (characters with skeleton, weapons)
- [x] EFFECT-class model rendering (selfillum, alpha keyframes)
- [x] Normal & specular map support (NormalAndSpecMapped / NormalTangents, ATI2/BC5)
- [x] animmesh UV animation (smooth frame interpolation)
- [x] Texture Hot-Reload (File System Access API, in-place canvas patch)
- [x] Set Browser (tileset .set parser, tile grid/list view, group loading)
- [x] Theme system (built-in + custom JSON, localStorage persistence)
- [x] Full i18n (EN / DE, retranslation of log entries on language switch)
- [x] TXI support (decal, clamp, blending, cycle sprite animation)
- [x] Floatable sidebar panels (Animations, PLT Layers — freely positionable, state persisted in localStorage)
- [x] Danglymesh simulation (procedural sine-wave physics, constraint-weighted per-vertex displacement, per-animation `displacement`/`period` overrides)
- [x] `selfillumcolorkey` animation for EFFECT-class nodes (all 3 RGB channels, applied to emissiveMap)
- [ ] Export to glTF / OBJ
- [ ] Automatic supermodel chain loading
- [ ] Render secondary UV stages (`tverts1`/`tverts2`/`tverts3`) for lightmapping/detail texturing
- [ ] Load and merge referenced sub-models from `reference` nodes into the scene

---

## ❓ FAQ

### Hot-Reload: Texture files stay locked after closing the viewer (Windows / Chrome)

**Symptom:** After closing the viewer tab (or reloading the page), texture files in the watched folder can no longer be edited or overwritten on Windows — they appear locked by another process.

**Cause:** Chrome/Chromium holds OS-level file handles open when a `FileSystemFileHandle` is accessed. In earlier versions of the viewer, `File` objects created during polling were not always released promptly, leaving handles open until garbage collection caught up — which on Windows can take longer than expected.

**Fix (v1.4.1+):** The polling loop in `hot_reload.js` now immediately nulls `File` references after reading (`file = null`), so the GC can release OS handles much sooner. See [Issue #149](https://github.com/dunahan/nwn_mdl_webviewer/issues/149) for the full background.

**If the problem still occurs:** Close the browser tab completely and reopen it — a simple `F5` reload is not always sufficient to free all handles on Windows.

> **Note:** Hot-Reload and Set Browser require **Chrome or Edge** (File System Access API). Firefox is not supported.

---

### Textures are not showing — what can I do?

1. **Drop textures together with the model** — drag `.tga`, `.dds`, `.plt`, or `.png` files onto the viewer at the same time as the `.mdl`.
2. **Use Watch Folder** — click *Watch Folder* in the sidebar and select the folder containing your textures. Any texture referenced by the loaded model is filled in automatically.
3. **Check the log panel** — click the ▲ icon at the bottom right. Missing textures are listed by exact filename so you can see what the model expects.
4. **Filename case sensitivity** — on Linux/GitHub Pages filenames are case-sensitive. `Skin01.tga` and `skin01.tga` are different files. The viewer lowercases all lookups internally; make sure your files are lowercase.

---

### The Animations panel does not appear

The model references its animations via a **supermodel** (e.g. `a_fa.mdl` for female characters, `a_ma.mdl` for male). Load the supermodel file alongside the main model — the log panel will tell you the exact filename it expects. Once the supermodel is loaded, the Animation panel appears and all keyframe animations become available.

---

### Binary MDL: the "Decompiling…" spinner runs forever

The WebAssembly decompiler (cleanmodels) is downloaded once on first use (~2–4 MB). The progress bar shows the stage:

| Stage shown | What is happening |
|---|---|
| Downloading WASM… | Fetching the `.wasm` binary from the server |
| Decoding… | Decoding the Base64 bundle (local `file://` mode only) |
| Compiling / Instantiating… | Browser compiling and initialising the module |
| Decompiling… | Active decompilation of your MDL |

If it stalls at *Downloading WASM…*, your connection may be slow or the request may have been interrupted. Click **Cancel** and try again. In `file://` mode (standalone HTML) the WASM is embedded as Base64 and does not require a network connection.

---

### Character parts are floating or stacked in the wrong positions

Multi-part character models (chest, head, legs, …) require all body parts **and** the base skeleton (e.g. `pmh0.mdl`, `pmf0.mdl`) to be dropped at the same time. Without the skeleton, the viewer falls back to bounding-box stacking which is a rough approximation. For exact placement, include the skeleton file in your drop. The log panel confirms which assembly mode was used.

---

### Set Browser / Hot-Reload button is greyed out

These features rely on the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API), which is currently only available in **Chrome and Edge**. Firefox does not support this API. The rest of the viewer (MDL rendering, textures, animations, PLT) works in all modern browsers.

---

### Set Browser group view: toggling a node only affects one tile

**Symptom:** In a group scene, multiple tiles share the same node name (e.g. `walkmesh` on AABB nodes, or generic mesh names like `ground01`). Clicking the visibility toggle in the scene graph appears to only affect one tile.

**Status: fixed.** The viewer stores a direct Three.js object reference on each scene graph entry at load time, so visibility controls always resolve to the correct per-tile object regardless of name collisions. If you encounter this with an older build, update to the latest release.

---

### Custom theme is not restored after a page reload

Custom themes loaded via *📂 Custom…* are applied immediately but are only stored as a flag in `localStorage` — the actual JSON file is not cached by the browser. On reload, the viewer falls back to the Default theme. To reapply your theme, use the *📂 Custom…* option again and re-select your JSON file.

> **Tip:** The two built-in themes (*Default* and *High Contrast*) are fully persistent across reloads with no re-selection needed.

---

## 🛠️ Tech Stack

| Technology | Version | Purpose |
|-----------|---------|---------|
| [Three.js](https://threejs.org/) | r152 | 3D rendering (WebGL) |
| Vanilla JS | ES2020 | MDL parser, UI logic, all modules |
| HTML / CSS | — | UI (no framework, CSS custom properties for theming) |
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
