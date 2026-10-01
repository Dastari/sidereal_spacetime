"""Three opt-in manufactured equipment derivatives within their unchanged sockets.

Headless only; --objects --out assets/runtime/ship-visual/r002/equipment-r021
--save-blend assets/source/ship-reference/r002/equipment-r021/equipment.blend.
No navigation, other object, native kit or default revision is exported here.
"""
import hashlib
import json
import sys
from pathlib import Path
import bpy
import bmesh
from mathutils.bvhtree import BVHTree

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import importlib.util
# Authentic immutable housing helper: current door authoring cannot alter this
# derivative's input geometry, slot aliases, or hidden-face policy.
HELPER = HERE.parent.parent / "assets/source/ship-reference/r002/equipment-r018/ship_reference_r002_art.py"
spec = importlib.util.spec_from_file_location("reference_r021_housing", HELPER)
A = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = A
spec.loader.exec_module(A)

E, K, O = A.E, A.K, A.R.O
IDS = ("shipyard.equipment.wall-locker", "shipyard.equipment.bridge-bank",
       "pale-studless.console.standard")
for base in ("primary", "secondary", "trim"):
    for kind in ("equipment-cover", "equipment-frame"):
        alias = base + "." + kind
        E.SI[alias] = len(E.SLOTS)
        E.SLOTS.append(alias)
        K.SLOT_PBR[alias] = K.SLOT_PBR[base]
        for theme in K.THEMES.values():
            theme[alias] = theme[base]
EXACT_SHAPES = frozenset(s for s in E.SLOTS if s.endswith(
    ("equipment-cover", "equipment-frame")))
A.NONRECT_COVER_SLOTS = A.NONRECT_COVER_SLOTS | EXACT_SHAPES


def wall_locker(w, d, h):
    p = K.Piece("reference.r021.locker", "object", "interior", (w, d, h))
    b = p.b
    # Exact original rear/rim geometry retains the complete floor contact and
    # bounds. Its existing body is redistributed; no surrounding prop is added.
    b(0, 0, 0, w, 1.5, h, "secondary.equipment-cover")
    b(0, 1, 0, w, d-1, h, "primary.equipment-frame")
    b(1.4, 1.5, 2.5, w-1.4, 2.0, h-2.5, "dark")
    # One broad seated storage door and a genuinely deep narrow supply bay.
    b(1.7, 4.3, 3, 7.2, 6.5, 21.2, "primary.equipment-cover")
    b(7.7, 1.8, 3.6, w-1.7, 2.2, 21.0, "trim")
    for z in (5.0, 11.0, 17.0):
        b(7.9, 2.2, z, w-1.9, 3.5, z+1.8, "metal")
    b(6.1, d-1.35, 9, 6.6, d-.7, 13, "metal")
    # Upper cooling mouth is 0.31 m behind the original joined pale shoulder.
    b(1.8, 1.8, 23, w-1.8, 2.2, 28.5, "dark")
    for z in (23.7, 25.4, 27.1):
        b(2, 2.2, z, w-2, 3.3, z+.65, "metal")
    b(w-2.4, d-1.35, 22, w-1.9, d-.9, 26, "emit_b")
    b(1.8, d-1.5, 1.6, 4.5, d-.9, 2.1, "trim")
    return p


def bridge_bank(w, d, h):
    h -= 1
    p = K.Piece("reference.r021.bridge-bank", "object", "interior", (w, d, h))
    b = p.b
    b(0, 0, 0, w, d, 1.2, "dark")  # exact original contact base
    # Unequal joined lower service cases, with open backed fronts and the same
    # centre clearance. Back plates sit 0.34 m behind their original front plane.
    for x, X in ((0, 7.5), (w-7, w)):
        b(x, 0, 1, X, d, 9.5, "primary.equipment-frame")
        b(x+1.3, .9, 2.3, X-1.3, 1.6, 8.2, "dark")
        b(x+1.6, 1.6, 3, X-1.6, 2.2, 5.8, "trim")
    b(7, 0, 2, w-6.5, 1.5, 9.5, "secondary")
    b(0, 0, 9, w, d, 10, "trim")
    b(1, 3.5, 10, w-1, d-.5, 10.55, "primary")
    # Full-width common case: an unequal navigation display and compact supply
    # panel share real side/upper returns, not two independent little screens.
    b(0, 0, 9.5, w, 1.3, h, "primary.equipment-cover")
    for x, X, slot in ((.7, 21.5, "primary"), (22, w-.7, "trim")):
        b(x, 1, 10.4, X, 6.6, h-.4, slot+".equipment-frame")
        b(x+1.3, 1.4, 11.7, X-1.3, 2.0, h-1.7, "dark")
        if slot == "primary":
            b(x+1.65, 2.0, 12.05, X-1.65, 2.15, h-2.05, "emit_a")
        else:
            b(x+1.6, 2, 12.0, X-1.6, 3.1, h-2, "metal")
    for x, X in ((2, 13.5), (18, 29.5)):
        b(x, 4.4, 10.55, X, 7.4, 11.2, "secondary")
        b(x+.7, 4.8, 11.2, X-.7, 6.8, 11.55, "metal")
        b(X-2.4, 6.8, 11.2, X-1.1, 7.2, 11.8, "accent")
    b(1.5, d-.5, 8.1, 5.5, d-.2, 8.55, "emit_b")
    return p


def workshop_console(w, d, h):
    h -= 1
    p = K.Piece("reference.r021.workshop", "object", "interior", (w, d, h))
    b = p.b
    b(0, 0, 0, w, d, 1.1, "dark")  # exact original contact base
    # A bench-mounted machine well on the left and removable storage on right.
    b(0, 0, 1, 8, d, 9, "primary.equipment-frame")
    b(1.3, .8, 2.3, 6.7, 1.8, 7.7, "dark")
    b(2, 1.8, 3, 6, 3.0, 6.8, "metal")
    b(w-6, 0, 1, w, d, 9, "primary.equipment-cover")
    b(w-4.8, d-.5, 3, w-1.2, d-.2, 6.5, "trim")
    b(7.5, 0, 1, w-5.5, 1.5, 9, "secondary")
    b(0, 0, 8.5, w, d, 9.5, "trim")
    b(1, 3.5, 9.5, w-1, d-.6, 10.1, "primary")
    # Joined asymmetric upper housing: large instrument mouth and narrow tool
    # cassette, each actually backed inside the existing complete host depth.
    b(0, 0, 9, w, 1.3, h, "primary.equipment-cover")
    b(.7, 1, 9.5, 16.8, 8.0, h-.4, "primary.equipment-frame")
    b(2, 1.4, 10.8, 15.5, 2, h-1.7, "dark")
    b(2.3, 2, 11.1, 15.2, 2.15, h-2, "emit_a")
    b(17.4, 1, 10.4, w-.7, 7.8, h-.8, "trim.equipment-frame")
    b(18.7, 1.5, 11.7, w-2, 2.2, h-2.1, "dark")
    b(19, 2.2, 12, w-2.3, 3.4, 12.6, "metal")
    b(w-2.8, 7.35, 12, w-2.3, 7.6, 14.4, "emit_b")
    b(2, 4.8, 10.1, 14.5, 8.9, 10.6, "secondary")
    b(2.6, 5.2, 10.6, 13.6, 7.9, 10.95, "metal")
    b(16.3, 5.2, 10.1, w-2, 8.6, 10.55, "trim")
    for x in (17, 19.5):
        b(x, 6.1, 10.55, x+1.3, 7.4, 11.15, "metal")
    b(1.5, d-.25, 3, 4.5, d-.1, 6.5, "accent")
    return p


BUILDERS = {IDS[0]: wall_locker, IDS[1]: bridge_bank, IDS[2]: workshop_console}


def front_prism(name, box):
    """Actual joined XZ clipped enclosure, extruded in depth; optional through bay."""
    x,y,z,X,Y,Z = [v*E.T for v in box[:6]]  # centred to_catalog values are still texels
    cut=min((X-x)*.13,(Z-z)*.12,.09)
    outer=[(x+cut,z),(X-cut,z),(X,z+cut),(X,Z-cut),
           (X-cut,Z),(x+cut,Z),(x,Z-cut),(x,z+cut)]
    ring=box[6].endswith("equipment-frame")
    bm=bmesh.new()
    back=[bm.verts.new((a,y,b)) for a,b in outer]
    front=[bm.verts.new((a,Y,b)) for a,b in outer]
    def face(v):
        f=bm.faces.new(v);f.material_index=E.SI[box[6]]
    for i in range(8):
        j=(i+1)%8;face((back[i],back[j],front[j],front[i]))
    if ring:
        rim=min(.075,(X-x)*.15,(Z-z)*.17)
        inner=[(a+(rim if a<(x+X)/2 else -rim),
                b+(rim if b<(z+Z)/2 else -rim)) for a,b in outer]
        ib=[bm.verts.new((a,y,b)) for a,b in inner]
        iff=[bm.verts.new((a,Y,b)) for a,b in inner]
        for i in range(8):
            j=(i+1)%8
            face((front[i],front[j],iff[j],iff[i]))
            face((ib[i],iff[i],iff[j],ib[j]))
            face((back[j],back[i],ib[i],ib[j]))
    else:
        face(tuple(reversed(back)));face(tuple(front))
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    edges=list(bm.edges)
    if ring and name != "shipyard.equipment.wall-locker":
        # The inner mouth already has a finite clipped octagonal silhouette.
        # Chamfer only the outer pressure housing; retain the original locker
        # rim/base exactly and avoid subdividing hidden deep aperture edges.
        outside=set(back+front)
        edges=[e for e in edges if all(v in outside for v in e.verts)]
    if edges:
        bmesh.ops.bevel(bm,geom=edges,offset=min(.018,(Y-y)*.14),
                        segments=1,affect="EDGES",clamp_overlap=True)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    me=bpy.data.meshes.new("GEO-"+name);bm.to_mesh(me);bm.free();me.update()
    return me


def equipment_mesh(name, boxes, hidden=None):
    bm=bmesh.new()
    for i,box in enumerate(boxes):
        if box[6] in EXACT_SHAPES:
            me=front_prism(name,box)
        else:
            me=A.authored_mesh(name,[box],[hidden[i]] if hidden else None)
        part=bmesh.new();part.from_mesh(me);bpy.data.meshes.remove(me)
        temporary=to_mesh(part);bm.from_mesh(temporary);part.free();bpy.data.meshes.remove(temporary)
    me=bpy.data.meshes.new("GEO-"+name);bm.to_mesh(me);bm.free();me.update()
    uv=me.uv_layers.new(name="authored-surface")
    for f in me.polygons:
        axis=max(range(3),key=lambda a:abs(f.normal[a]));u,v=(axis+1)%3,(axis+2)%3
        display=f.material_index==E.SI["emit_a"]
        if display:
            if axis==1:u,v=0,2
            coords=[me.vertices[me.loops[j].vertex_index].co for j in f.loop_indices]
            lo=[min(p[a] for p in coords) for a in (u,v)]
            hi=[max(p[a] for p in coords) for a in (u,v)]
        for li in f.loop_indices:
            p=me.vertices[me.loops[li].vertex_index].co
            uv.data[li].uv=((p[u]-lo[0])/max(1e-8,hi[0]-lo[0]),
                           (p[v]-lo[1])/max(1e-8,hi[1]-lo[1])) if display else (p[u],p[v])
    # Actual exported mesh rays must reach every front screen, not its bezel.
    tree=BVHTree.FromPolygons([v.co for v in me.vertices], [list(f.vertices) for f in me.polygons])
    for f in me.polygons:
        if f.material_index!=E.SI["emit_a"] or f.normal.y<.99:continue
        centre=sum((me.vertices[v].co for v in f.vertices),me.vertices[0].co*0)/len(f.vertices)
        hit=tree.ray_cast(centre+f.normal*2,-f.normal,2.01)
        if hit[2] is None or me.polygons[hit[2]].material_index!=E.SI["emit_a"]:
            raise RuntimeError(f"Opaque enclosure hides screen: {name} at {tuple(centre)}")
    return me


def to_mesh(bm):
    me=bpy.data.meshes.new("GEO-equipment-part");bm.to_mesh(me)
    return me


if __name__ == "__main__":
    args=E.args()
    if not args.objects:
        raise RuntimeError("This isolated exporter supports only --objects")
    O.OBJECT_SIZES={did:O.OBJECT_SIZES[did] for did in IDS}
    O.builders=lambda _kit,_exporter:BUILDERS
    E.OBJECTS_REVISION="equipment-r021"
    E.boxes_mesh=equipment_mesh
    E.export_objects(args)
    manifest=Path(args.out)/"manifest.json"
    data=json.loads(manifest.read_text())
    data["generator"]["candidateBuilder"]="scripts/art_library/ship_reference_r021_equipment.py"
    data["generator"]["candidateBuilderSha256"]=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    data["generator"]["housingHelperSha256"]=hashlib.sha256(Path(A.__file__).read_bytes()).hexdigest()
    data["requiredObjectIds"]=list(IDS)
    data["status"]="isolated opt-in proposal; default art and navigation unchanged"
    manifest.write_text(json.dumps(data,indent=2)+"\n")
