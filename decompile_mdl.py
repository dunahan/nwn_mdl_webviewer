import struct
import argparse
import os
import sys
from dataclasses import dataclass, field
from typing import List, Tuple, BinaryIO, Optional

# ==========================================
# 1. DATEI-HEADER & BASIS-INFOS
# ==========================================

@dataclass
class BinaryMdlHeader:
    length_of_obj: int
    length_of_obj_volatile: int

    FORMAT = "<4sII"
    SIZE = struct.calcsize(FORMAT)

    @classmethod
    def parse(cls, stream: BinaryIO) -> Optional["BinaryMdlHeader"]:
        raw_data = stream.read(cls.SIZE)
        if len(raw_data) < 4 or raw_data[:4] != b"\x00\x00\x00\x00":
            return None # Wahrscheinlich ASCII
        if len(raw_data) < cls.SIZE:
            raise ValueError("Binäre Datei ist fehlerhaft (Header zu kurz).")

        _, length_obj, length_vol = struct.unpack(cls.FORMAT, raw_data)
        return cls(length_of_obj=length_obj, length_of_obj_volatile=length_vol)

@dataclass
class ProxyModelBase:
    name: str
    root_node_offset: int
    type_id: int

    @classmethod
    def parse_from_core_block(cls, core_data: bytes) -> "ProxyModelBase":
        _, _, name_raw, root_offset = struct.unpack_from("<ii64si", core_data, 0)
        type_id, = struct.unpack_from("<B", core_data, 108)
        name_clean = name_raw.split(b"\x00", 1)[0].decode("ascii", errors="replace")
        return cls(name=name_clean, root_node_offset=root_offset, type_id=type_id)

# ==========================================
# 2. DATENMODELL (AST)
# ==========================================

@dataclass
class Vector3:
    x: float
    y: float
    z: float

@dataclass
class Vector2:
    u: float
    v: float

@dataclass
class MeshGeometry:
    vertices: List[Vector3]
    normals: List[Vector3]
    uvs: List[Vector2]
    faces: List[Tuple[int, int, int]]
    tangents: List[Vector3] = field(default_factory=list)
    handedness: List[float] = field(default_factory=list)
    materialname: str = ""
    bitmap: str = "" # Fallback für alte NWN 1 Texturen

# ==========================================
# 3. BINÄR-ENTZIFERUNG (Volatile Block)
# ==========================================

class VolatileBlockReader:
    def __init__(self, volatile_data: bytes):
        self.data = volatile_data

    def read_vec3_list(self, offset: int, count: int) -> List[Vector3]:
        if offset == 0xFFFFFFFF or offset >= len(self.data): return []
        return [Vector3(*struct.unpack_from("<3f", self.data, offset + (i * 12))) for i in range(count)]

    def read_vec2_list(self, offset: int, count: int) -> List[Vector2]:
        if offset == 0xFFFFFFFF or offset >= len(self.data): return []
        return [Vector2(*struct.unpack_from("<2f", self.data, offset + (i * 8))) for i in range(count)]

    def read_float_list(self, offset: int, count: int) -> List[float]:
        if offset == 0xFFFFFFFF or offset >= len(self.data): return []
        return [struct.unpack_from("<f", self.data, offset + (i * 4))[0] for i in range(count)]

# ==========================================
# 4. TREE WALKER (Der Baum-Läufer)
# ==========================================

class TreeWalker:
    def __init__(self, core_data: bytes, volatile_reader: VolatileBlockReader):
        self.core = core_data
        self.volatile = volatile_reader
        self.nodes = [] # Speichert alle gefundenen Knoten als (Name, Parent, TypeID, Geometry)

    def walk(self, offset: int, parent_name: str = "NULL"):
        """Geht rekursiv durch den Core-Block und liest alle Nodes aus."""
        if offset <= 0 or offset >= len(self.core): return

        # Basis-Informationen des Nodes aus ProxyMdlNode lesen (Offset 32 = Name, Offset 108 = Type)
        name_raw = self.core[offset+32 : offset+64]
        name = name_raw.split(b"\x00", 1)[0].decode("ascii", errors="replace")
        
        child_offset, child_num, _ = struct.unpack_from("<iii", self.core, offset+72)
        type_id, = struct.unpack_from("<I", self.core, offset+108)

        geom = None
        # Wenn Bit 5 (0x0020) gesetzt ist, handelt es sich um ein TriMesh oder Subclass (z.B. Skin, AnimMesh)
        if (type_id & 0x0021) == 0x0021:
            geom = self._parse_trimesh(offset)
        
        self.nodes.append((name, parent_name, type_id, geom))

        # Rekursiv alle Kinder-Nodes ablaufen
        if child_num > 0 and child_offset > 0:
            for i in range(child_num):
                c_off, = struct.unpack_from("<i", self.core, child_offset + i*4)
                if c_off > 0:
                    self.walk(c_off, name)

    def _parse_trimesh(self, offset: int) -> MeshGeometry:
        """Liest die spezifischen TriMesh-Daten aus dem ProxyMdlNodeTriMesh."""
        
        # WICHTIG: Die TriMesh-spezifischen Daten beginnen erst nach dem 112-Byte Basis-Header!
        trimesh_offset = offset + 112

        # Textur & Material auslesen
        tex0_raw = self.core[trimesh_offset+120 : trimesh_offset+184]
        bitmap = tex0_raw.split(b"\x00", 1)[0].decode("ascii", errors="replace")
        
        mat_raw = self.core[trimesh_offset+312 : trimesh_offset+376]
        materialname = mat_raw.split(b"\x00", 1)[0].decode("ascii", errors="replace")
        
        # Pointer für den Volatile Block holen
        v_tok, num_v, _, uv_tok = struct.unpack_from("<IHHI", self.core, trimesh_offset+444)
        n_tok, = struct.unpack_from("<I", self.core, trimesh_offset+468)
        tan_tok, = struct.unpack_from("<I", self.core, trimesh_offset+488)
        hand_tok, = struct.unpack_from("<I", self.core, trimesh_offset+496)

        # Faces aus den MaxFace-Strukturen im Core-Block lesen (Offset +8 im TriMesh-Block)
        f_off, f_num, _ = struct.unpack_from("<iii", self.core, trimesh_offset+8)
        faces = []
        
        # Bounds Check: Nur lesen, wenn der Pointer Sinn macht
        if f_num > 0 and f_off > 0 and f_off < len(self.core):
            for i in range(f_num):
                face_pos = f_off + i * 32
                # Sicherstellen, dass das Face noch im Core Block liegt
                if face_pos + 32 <= len(self.core):
                    # MaxFace struct ist 32 Bytes lang. vertexindices starten bei Byte 26.
                    v0, v1, v2 = struct.unpack_from("<HHH", self.core, face_pos + 26)
                    faces.append((v0, v1, v2))

        # 3D Daten aus dem Volatile Block holen
        verts = self.volatile.read_vec3_list(v_tok, num_v)
        uvs = self.volatile.read_vec2_list(uv_tok, num_v)
        norms = self.volatile.read_vec3_list(n_tok, num_v)
        tans = self.volatile.read_vec3_list(tan_tok, num_v)
        hands = self.volatile.read_float_list(hand_tok, num_v)

        return MeshGeometry(
            vertices=verts, normals=norms, uvs=uvs, faces=faces,
            tangents=tans, handedness=hands, materialname=materialname, bitmap=bitmap
        )

# ==========================================
# 5. ASCII-EXPORTER
# ==========================================

class AsciiMdlExporter:
    @staticmethod
    def format_float(value: float) -> str:
        return f"{value:.5f}"

    def export_node(self, name: str, parent: str, type_id: int, geom: Optional[MeshGeometry]) -> str:
        # Bestimme den Node-Typ für die Textdatei
        keyword = "dummy"
        if (type_id & 0x0021) == 0x0021: 
            keyword = "trimesh"
            
        lines = [f"node {keyword} {name}", f"  parent {parent}"]

        # Wenn es eine Geometrie gibt, schreibe die Werte
        if geom:
            if geom.materialname: 
                lines.append(f"  materialname {geom.materialname}")
            elif geom.bitmap: 
                lines.append(f"  bitmap {geom.bitmap}")

            if geom.vertices:
                lines.append(f"  verts {len(geom.vertices)}")
                for v in geom.vertices: lines.append(f"    {self.format_float(v.x)} {self.format_float(v.y)} {self.format_float(v.z)}")

            if geom.faces:
                lines.append(f"  faces {len(geom.faces)}")
                for face in geom.faces: lines.append(f"    {face[0]} {face[1]} {face[2]} 1 1")

            if geom.uvs:
                lines.append(f"  tverts {len(geom.uvs)}")
                for uv in geom.uvs: lines.append(f"    {self.format_float(uv.u)} {self.format_float(uv.v)} 0.00000")

            if geom.normals:
                lines.append(f"  normals {len(geom.normals)}")
                for n in geom.normals: lines.append(f"    {self.format_float(n.x)} {self.format_float(n.y)} {self.format_float(n.z)}")

            if geom.tangents and geom.handedness and len(geom.tangents) == len(geom.handedness):
                lines.append(f"  tangents {len(geom.tangents)}")
                for t, h in zip(geom.tangents, geom.handedness):
                    lines.append(f"    {self.format_float(t.x)} {self.format_float(t.y)} {self.format_float(t.z)} {self.format_float(h)}")

        lines.append("endnode")
        return "\n".join(lines)

# ==========================================
# 6. CLI & WORKFLOW 
# ==========================================

class DecompilerCLI:
    def __init__(self, input_path: str, output_path: str):
        self.input_path = input_path
        self.output_path = output_path

    def run(self):
        if not os.path.exists(self.input_path):
            print(f"Fehler: Eingabedatei '{self.input_path}' nicht gefunden.")
            sys.exit(1)

        print(f"[*] Lese Binärdatei: {self.input_path} ...")
        
        try:
            with open(self.input_path, "rb") as infile:
                header = BinaryMdlHeader.parse(infile)
                if not header: 
                    print("[!] Die Datei scheint bereits im ASCII-Format zu sein. Abbruch.")
                    return
                
                core_data = infile.read(header.length_of_obj)
                volatile_data = infile.read(header.length_of_obj_volatile)
                
                model_base = ProxyModelBase.parse_from_core_block(core_data)
                print(f"[*] Modell-Name: '{model_base.name}'")
                
                # Baum Walker initialisieren und vom Root-Node aus starten
                reader = VolatileBlockReader(volatile_data)
                walker = TreeWalker(core_data, reader)
                print("[*] Durchsuche Knotenbaum und extrahiere Geometrie...")
                walker.walk(model_base.root_node_offset)
                
            print(f"[*] {len(walker.nodes)} Knoten gefunden. Starte Export...")
            
            # ASCII Export durchführen
            exporter = AsciiMdlExporter()
            
            # Header der MDL Datei
            ascii_lines = [
                f"# Decompiliertes Modell: {model_base.name}",
                f"newmodel {model_base.name}",
                f"beginmodelgeom {model_base.name}"
            ]
            
            # Alle vom Walker gefundenen Nodes der Reihe nach exportieren
            for name, parent, type_id, geom in walker.nodes:
                ascii_lines.append(exporter.export_node(name, parent, type_id, geom))
            
            # Footer der MDL Datei
            ascii_lines.append(f"endmodelgeom {model_base.name}")
            ascii_lines.append(f"donemodel {model_base.name}")

            with open(self.output_path, "w", encoding="utf-8") as outfile:
                outfile.write("\n".join(ascii_lines) + "\n")

            print(f"[+] Decompilierung erfolgreich! Gespeichert unter: {self.output_path}")

        except Exception as e:
            print(f"[!] Ein unerwarteter Fehler ist aufgetreten: {e}")
            sys.exit(1)

def main():
    parser = argparse.ArgumentParser(
        description="Ein Decompiler für NWN 1 und NWN:EE Modelle (.mdl). Wandelt Binärdateien in ASCII um."
    )
    parser.add_argument("input_file", help="Der Pfad zur binären .mdl Eingabedatei")
    parser.add_argument("output_file", help="Der Pfad, unter dem die ASCII-Datei gespeichert werden soll")
    args = parser.parse_args()

    app = DecompilerCLI(args.input_file, args.output_file)
    app.run()

if __name__ == "__main__":
    main()
