# How to Decompile NWN MDL Files

NWN ships models as **compiled binary** `.mdl` files. This viewer needs the **ASCII / decompiled** version.  
Here are step-by-step instructions for each platform.

---

## Method 1 — CleanModels EE (Bash/CLI-Application, Windows GUI) - Recommended, all platforms

1. Download [CleanModelsEE]([https://github.com/virusman/nwnexplorer/releases](https://github.com/plenarius/cleanmodels/releases/tag/latest)
   eventually download [Windows Gui](https://github.com/plenarius/cleanmodels-qt/releases/tag/latest)
2. Setup last_dirs.pl or use commandline

```bash
cleanmodels-cli --decompile=true --pattern=*.mdl --indir=<PathToYourIn-Dir>/in --outdir=<PathToYourOut-Dir>/out
```

---

## Method 2 — NWNExplorer (Windows GUI)

1. Download [NWNExplorer](https://github.com/virusman/nwnexplorer/releases)
2. Open NWNExplorer → File → Open NWN installation folder
3. Navigate to `Models` section
4. Right-click a model → **Export as ASCII MDL**
5. Save the `.mdl` file

---

## Method 3 — nwnmdlcomp

`nwnmdlcomp` is a NWN command-line tool.

### Install

**Windows:** Download from  
[neverwintervault.org](https://neverwintervault.org/project/nwn1/other/tool/nwnmdlcomp-nwn-model-compiler)

**Linux / macOS:**
```bash
# actually I don't have Linux installed, so I can't provide a way here. Will follow.
```

### Usage

```bash
# Decompile a single model
nwnmdlcomp -d c_dragon.mdl

# Output will be: c_dragon_d.mdl  (or similar, tool dependent)
# Rename if needed:
mv c_dragon_d.mdl c_dragon_ascii.mdl
```

---

## Where are the MDL files?

### Steam (Windows)
```
C:\Program Files (x86)\Steam\steamapps\common\Neverwinter Nights Enhanced Edition\data\
```
Models are packed inside `.bif` archives. Use NWNExplorer to extract them.
You can also use the [neverwinter.nim](https://github.com/niv/neverwinter.nim/releases/tag/2.1.2) tools to extract those files.

### Steam (Linux)
```
~/.steam/steam/steamapps/common/Neverwinter Nights Enhanced Edition/data/
```

### GOG (Windows)
```
C:\GOG Games\Neverwinter Nights Enhanced Edition\data\
```

### Key `.bif` archives containing models:
| Archive | Contents |
|---------|---------|
| `models_01/_02.bif, xp2_models.bif, os_models.bif` | Character models, creature models  and many more bifs|
| `tileset_XXXX.bif, xp1_tiles.bif` | Tileset geometries, for example tileset_tin01.bif |
| `models_XX.bif` | Placeable models etc |
| `textures_XX.bif` | Textures |

---

## Verify the ASCII format

Open the `.mdl` file in a text editor. It should start with something like:

```
# Exported from ...
newmodel c_dragon
setsupermodel c_dragon c_human
classification character
...
```

If you see binary garbage, it's still in compiled format — decompile it first.

---

## Troubleshooting

**"No nodes found"/"Keine Nodes gefunden" error in the viewer**  
→ File is still binary. Use one of the methods above to decompile.

**Mesh appears but looks wrong / inside-out**  
→ Normal behaviour for some NWN models that use double-sided rendering. Enable "Normalen" button in the viewer.

**Empty scene (only grid shown)**  
→ Model may be a pure dummy hierarchy (e.g. a supermodel base). Try loading an actual character or placeable model.
