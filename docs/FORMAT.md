# NWN MDL Format Reference

This document describes the ASCII (decompiled) MDL format used by Neverwinter Nights 1 / Enhanced Edition.

---

## File Structure

```
newmodel <modelname>
setsupermodel <modelname> <supermodelname>
classification <type>
setanimationscale <float>

beginmodelgeom <modelname>
  node <nodetype> <nodename>
    ...
  endnode
  node ...
  endnode
endmodelgeom

newanim <animname> <modelname>
  ...
doneanim <animname> <modelname>

donemodel <modelname>
```

---

## Node Types

| Type | Description |
|------|-------------|
| `dummy` | Empty transform node, used for hierarchy/attachment points |
| `trimesh` | Static triangle mesh (geometry) |
| `skin` | Skinned/deformable mesh (for animated characters) |
| `danglymesh` | Physics-simulated mesh (cloth, hair); per-vertex constraints define rigidity |
| `animmesh` | Mesh with per-frame vertex/UV animation via `animverts` / `animtverts` |
| `emitter` | Particle emitter |
| `aabb` | Axis-aligned bounding box (walkmesh collision) |
| `light` | Light source |
| `reference` | Reference to another model |

---

## Common Node Properties

```
parent <nodename | NULL>
position <x> <y> <z>
orientation <x> <y> <z> <w>     # Quaternion
scale <float>
```

---

## Trimesh / Skin Properties

```
bitmap <texturename>             # Texture (without extension)
materialname <mtrname>           # MTR material file reference (Enhanced Edition)
ambient <r> <g> <b>
diffuse <r> <g> <b>
specular <r> <g> <b>
shininess <float>
selfillumcolor <r> <g> <b>       # Self-illumination (emissive) colour; used by EFFECT-class models
alpha <float>                    # 0.0 = transparent, 1.0 = opaque
render <0|1>
shadow <0|1>
beaming <0|1>
inheritcolor <0|1>
transparencyhint <int>
tilefade <int>

verts <count>
  <x> <y> <z>
  ...

tverts <count>                   # UV coordinates
  <u> <v> [0]
  ...

normals <count>
  <nx> <ny> <nz>
  ...

faces <count>
  <v0> <v1> <v2>  <smoothgroup>  <t0> <t1> <t2>  <materialid>
  ...
```

---

## Coordinate System

NWN uses a **right-handed, Z-up** coordinate system:
- **X** — right (east)
- **Y** — forward (north)
- **Z** — up (height)

The viewer converts this to Three.js's Y-up convention internally by applying a `−90°` rotation around the X axis (`rotation.x = -π/2`).

Angles in orientation quaternions: `(x, y, z, w)` — standard quaternion notation.  
UV origin is **bottom-left** (V is flipped compared to OpenGL convention — the viewer corrects this automatically with `1 - v`).

---

## Classification Values

| Value | Meaning |
|-------|---------|
| `tile` | Tileset geometry |
| `character` | Player/NPC character |
| `door` | Door placeable |
| `item` | Inventory item |
| `effect` | Visual effect |
| `gui` | GUI element |
| `other` | Misc |

---

## Supermodel Chain

NWN models can reference a **supermodel** for shared geometry/animations:

```
setsupermodel c_human c_human_base
```

The viewer resolves `setsupermodel` references **when the parent file is dropped together** with the child model in the same file selection. The supermodel's nodes and animations are merged into the scene automatically.

If the referenced supermodel file is not present in the drop, the viewer logs a warning and continues with the child model alone.

---

## Useful Resources

- [NWN MDL format notes (Neverwinter Vault)](https://neverwintervault.org)
- [nwneetools source](https://github.com/nwneetools/nwneetools) — reference C implementation
- [CleanModels EE](https://github.com/plenarius/cleanmodels/tree/v4-go-rewrite) — cross-platform MDL decompiler/repair tool (also embedded as WASM in this viewer)
