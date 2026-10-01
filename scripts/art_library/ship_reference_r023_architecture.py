"""Two immutable R23 room hosts inside their exact admitted R21 envelopes.

Only locker/workshop are exported to NEW equipment-r023 paths. R22 bridge-bank,
reactors, native kits, entity counts and default selections remain untouched.
"""
import hashlib
import importlib.util
import json
import sys
from pathlib import Path

import bpy
import bmesh

HERE = Path(__file__).resolve().parent
BASE = HERE / "ship_reference_r021_equipment.py"
BASE_SHA = "8e007da11e4ed04263a304a23050997e9f27d8c0bee002439cd334e482b5f192"
HOUSING_SHA = "f05fd738d4bc91a7978d344f8c5015358433fc58cb6840742688a94d1744eaad"
if hashlib.sha256(BASE.read_bytes()).hexdigest() != BASE_SHA:
    raise RuntimeError("R23 requires the immutable R21 equipment builder")
spec = importlib.util.spec_from_file_location("reference_r023_equipment_base", BASE)
B = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = B
spec.loader.exec_module(B)
if hashlib.sha256(Path(B.A.__file__).read_bytes()).hexdigest() != HOUSING_SHA:
    raise RuntimeError("R23 requires the immutable original housing source")
E, K, O = B.E, B.K, B.O
IDS = ("shipyard.equipment.wall-locker", "pale-studless.console.standard")


def wall_locker(w, d, h):
    p = K.Piece("reference.r023.locker", "object", "interior", (w, d, h))
    b = p.b
    # Original full rear and clipped rim retain exact bounds/floor contact.
    b(0, 0, 0, w, 1.5, h, "secondary.equipment-cover")
    b(0, 1, 0, w, d-1, h, "primary.equipment-frame")
    # A broad lower supply mouth takes half the host height, with real contents
    # .25-.31m behind the original lip. No cuboid cover seals its opening.
    b(1.4, 1.5, 2.5, w-1.4, 2.0, 16.2, "dark")
    b(1.8, 2, 3.3, w-1.8, 4.1, 4.2, "metal")
    b(2.2, 2, 5, 4.6, 3.2, 13.7, "trim")
    b(5.3, 2, 5.6, 8.7, 3.4, 11.5, "metal")
    b(5.8, 3.4, 6.5, 8.1, 3.7, 10.5, "secondary")
    b(1.8, 4.4, 16.6, w-1.8, 6.7, 18.1, "trim")
    # Unequal upper removable storage body shares the existing broad shoulders.
    b(1.8, 4.7, 18.6, w-1.8, 6.5, 27.1, "primary.equipment-cover")
    b(w-3.5, 6.5, 20.4, w-3, d-.7, 24.2, "metal")
    b(2.4, 6.5, 20, 3.8, 6.65, 23.4, "trim")
    b(1.8, 1.8, 28, w-1.8, 2.2, 30.2, "dark")
    b(2, 2.2, 28.8, w-2, 3.3, 29.5, "metal")
    b(w-2.4, d-1.35, 14.6, w-1.9, d-.9, 16, "emit_b")
    b(1.8, d-1.5, 1.6, 4.5, d-.9, 2.1, "trim")
    return p


def workshop_console(w, d, h):
    h -= 1  # actual admitted R21 top, not unused catalog padding
    p = K.Piece("reference.r023.workshop", "object", "interior", (w, d, h))
    b = p.b
    b(0, 0, 0, w, d, 1.1, "dark")  # exact existing contact triangles
    # Lower machine/storage bays retain the original full depth and support.
    b(0, 0, 1, 8, d, 9, "primary.equipment-frame")
    b(1.3, .8, 2.3, 6.7, 1.8, 7.7, "dark")
    b(2, 1.8, 3, 6, 3, 6.8, "metal")
    b(w-6, 0, 1, w, d, 9, "primary.equipment-cover")
    b(w-4.8, d-.5, 3, w-1.2, d-.2, 6.5, "trim")
    b(7.5, 0, 1, w-5.5, 1.5, 9, "secondary")
    b(0, 0, 8.5, w, d, 9.5, "trim")
    b(1, 3.5, 9.5, w-1, d-.6, 10.1, "primary")
    # One common upper body: a wide readable instrument and a smaller backed
    # tool return. The display front Y=7.5 is .03125m behind lip Y=8.
    # The mouth is widened and its lower sill sits below the 10.9 instrument.
    b(0, 0, 9, w, 1.3, h, "primary.equipment-cover")
    b(0, 1, 8.5, 18.5, 8, h-.2, "primary.equipment-frame")
    b(1.4, 6.2, 10.2, 17.1, 6.6, 13.8, "dark")
    b(1.8, 7.15, 10.9, 16.7, 7.5, 13.25, "emit_a")
    b(19.0, 1, 10.2, w-.3, 7.8, h-.4, "trim.equipment-frame")
    b(20.1, 1.5, 11.5, w-1.4, 2.2, h-1.7, "dark")
    b(20.3, 2.2, 12, w-1.6, 3.4, 12.7, "metal")
    b(w-2.4, 7.35, 12, w-1.9, 7.6, 14.1, "emit_b")
    # Keyboard/keycap maxima stay BELOW the instrument sill; the earlier R22
    # bank's actual oblique failure established this visibility requirement.
    b(2, 4.8, 10.1, 14.5, 8.9, 10.5, "secondary")
    b(2.6, 5.2, 10.5, 13.6, 7.9, 10.8, "metal")
    b(16.3, 5.2, 10.1, w-2, 8.6, 10.5, "trim")
    for x in (17, 19.5):
        b(x, 6.1, 10.5, x+1.3, 7.4, 10.8, "metal")
    b(1.5, d-.25, 3, 4.5, d-.1, 6.5, "accent")
    return p


ORIGINAL_PRISM = B.front_prism


def front_prism(name, box):
    if (name == IDS[0] and box[6] == "primary.equipment-cover"
            and box[2] == 18.6 and box[5] == 27.1):
        # This removable NONCONTACT cover already has eight clipped corners.
        # A second all-edge bevel adds 64 triangles without opening the bay.
        # Original contact rear/rim continue through the immutable helper.
        x, y, z, X, Y, Z = [v * E.T for v in box[:6]]
        cut = min((X-x)*.13, (Z-z)*.12, .09)
        ring = [(x+cut,z),(X-cut,z),(X,z+cut),(X,Z-cut),
                (X-cut,Z),(x+cut,Z),(x,Z-cut),(x,z+cut)]
        bm = bmesh.new()
        back = [bm.verts.new((a,y,b)) for a,b in ring]
        front = [bm.verts.new((a,Y,b)) for a,b in ring]
        def face(v):
            f = bm.faces.new(v)
            f.material_index = E.SI[box[6]]
        face(tuple(reversed(back)))
        face(tuple(front))
        for i in range(8):
            j = (i+1)%8
            face((back[i],back[j],front[j],front[i]))
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        me = bpy.data.meshes.new("GEO-"+name)
        bm.to_mesh(me)
        bm.free()
        me.update()
        return me
    # Only the new upper instrument rim is thinner. The actual original locker
    # contact rim and workshop lower machine housing use the immutable helper.
    if not (name == IDS[1] and box[6] == "primary.equipment-frame"
            and box[3]-box[0] > 16 and box[5]-box[2] < 7):
        return ORIGINAL_PRISM(name, box)
    x, y, z, X, Y, Z = [v * E.T for v in box[:6]]
    cut = min((X-x)*.13, (Z-z)*.12, .09)
    outer = [(x+cut,z),(X-cut,z),(X,z+cut),(X,Z-cut),
             (X-cut,Z),(x+cut,Z),(x,Z-cut),(x,z+cut)]
    # .025m finite bezel leaves a complete near-lip instrument at steep views;
    # the old .075m global rim would consume this admitted low upper opening.
    rim = .025
    inner = [(a+(rim if a<(x+X)/2 else -rim),
              b+(rim if b<(z+Z)/2 else -rim)) for a,b in outer]
    bm = bmesh.new()
    back = [bm.verts.new((a,y,b)) for a,b in outer]
    front = [bm.verts.new((a,Y,b)) for a,b in outer]
    ib = [bm.verts.new((a,y,b)) for a,b in inner]
    iff = [bm.verts.new((a,Y,b)) for a,b in inner]
    def face(v):
        f = bm.faces.new(v)
        f.material_index = E.SI[box[6]]
    for i in range(8):
        j = (i+1)%8
        face((back[i],back[j],front[j],front[i]))
        face((front[i],front[j],iff[j],iff[i]))
        face((ib[i],iff[i],iff[j],ib[j]))
        face((back[j],back[i],ib[i],ib[j]))
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    outside = set(back+front)
    edges = [e for e in bm.edges if all(v in outside for v in e.verts)]
    bmesh.ops.bevel(bm, geom=edges, offset=min(.018,(Y-y)*.14),
                    segments=1, affect="EDGES", clamp_overlap=True)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    me = bpy.data.meshes.new("GEO-"+name)
    bm.to_mesh(me)
    bm.free()
    me.update()
    return me


if __name__ == "__main__":
    args = E.args()
    if not args.objects:
        raise RuntimeError("This isolated exporter supports only --objects")
    O.OBJECT_SIZES = {did: O.OBJECT_SIZES[did] for did in IDS}
    O.builders = lambda _kit, _exporter: {IDS[0]: wall_locker, IDS[1]: workshop_console}
    E.OBJECTS_REVISION = "equipment-r023"
    B.front_prism = front_prism
    E.boxes_mesh = B.equipment_mesh
    E.export_objects(args)
    manifest = Path(args.out) / "manifest.json"
    data = json.loads(manifest.read_text())
    data["generator"]["candidateBuilder"] = "scripts/art_library/ship_reference_r023_architecture.py"
    data["generator"]["candidateBuilderSha256"] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    data["generator"]["equipmentHelper"] = "scripts/art_library/ship_reference_r021_equipment.py"
    data["generator"]["equipmentHelperSha256"] = BASE_SHA
    data["generator"]["housingHelperSha256"] = HOUSING_SHA
    data["requiredObjectIds"] = list(IDS)
    data["status"] = "isolated opt-in R23 host proposal; old assets and navigation unchanged"
    manifest.write_text(json.dumps(data, indent=2) + "\n")
