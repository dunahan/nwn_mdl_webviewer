# How to Decompile NWN MDL Files

NWN ships models as **compiled binary** `.mdl` files. This viewer needs the **ASCII / decompiled** version.  
Here are step-by-step instructions for each platform.

---

## Method 1 — nwnmdlcomp (Recommended, all platforms)

`nwnmdlcomp` is the official NWN:EE command-line tool from Beamdog.

### Install

**Windows:** Download from the [NWN:EE Toolset](https://store.steampowered.com/app/704450/) or from  
https://github.com/nwneetools/nwneetools/releases

**Linux / macOS:**
```bash
git clone https://github.com/nwneetools/nwneetools.git
cd nwneetools
make
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

## Method 2 — NWNExplorer (Windows GUI)

1. Download [NWNExplorer](https://github.com/virusman/nwnexplorer/releases)
2. Open NWNExplorer → File → Open NWN installation folder
3. Navigate to `Models` section
4. Right-click a model → **Export as ASCII MDL**
5. Save the `.mdl` file

---

## Where are the MDL files?

### Steam (Windows)
```
C:\Program Files (x86)\Steam\steamapps\common\Neverwinter Nights Enhanced Edition\data\
```
Models are packed inside `.bif` archives. Use NWNExplorer to extract them.

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
| `models.bif` | Character models, creature models |
| `tiles.bif` | Tileset geometry |
| `placeables.bif` | Door/placeable models |
| `items.bif` | Inventory item models |

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

**"Keine Nodes gefunden" error in the viewer**  
→ File is still binary. Use one of the methods above to decompile.

**Mesh appears but looks wrong / inside-out**  
→ Normal behaviour for some NWN models that use double-sided rendering. Enable "Normalen" button in the viewer.

**Empty scene (only grid shown)**  
→ Model may be a pure dummy hierarchy (e.g. a supermodel base). Try loading an actual character or placeable model.
