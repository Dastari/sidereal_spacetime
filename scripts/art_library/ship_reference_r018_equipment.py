"""Three opt-in manufactured equipment derivatives within their unchanged sockets.

Headless only; --objects --out assets/runtime/ship-visual/r002/equipment-r018
--save-blend assets/source/ship-reference/r002/equipment-r018/equipment.blend.
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
import ship_reference_r002_art as A

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
    p = K.Piece("reference.r018.locker", "object", "interior", (w, d, h))
    b = p.b
    # Complete rear pressure shell; the front is a true open clipped housing,
    # rather than a solid box with painted vent rectangles.
    b(0, 0, 0, w, 1.5, h, "secondary.equipment-cover")
    b(0, 1, 0, w, d-1, h, "primary.equipment-frame")
    b(1.4, 1.5, 2.5, w-1.4, 3.0, h-2.5, "dark")
    # Two unequal removable doors are inset behind the continuous shoulder.
    b(1.7, 3.0, 3, 5.2, d-1.5, 20.8, "primary.equipment-cover")
    b(5.8, 3.0, 3, w-1.7, d-1.8, 20.8, "primary.equipment-cover")
    b(4.2, d-1.35, 9, 4.7, d-.7, 13, "metal")
    b(6.3, d-1.65, 10, 6.8, d-1, 14, "metal")
    # A substantial contained cooling cassette above the doors, with backing.
    b(1.8, 3, 23, w-1.8, d-2.4, 28.5, "dark")
    for z in (23.7, 25.4, 27.1):
        b(2, d-2.4, z, w-2, d-1.4, z+.65, "metal")
    b(w-2.4, d-1.35, 22, w-1.9, d-.9, 26, "emit_b")
    b(1.8, d-1.5, 1.6, 4.5, d-.9, 2.1, "trim")
    return p


def bridge_bank(w, d, h):
    # Preserve the prior actual top, one texel below the catalog envelope.
    h -= 1
    p = K.Piece("reference.r018.bridge-bank", "object", "interior", (w, d, h))
    b = p.b
    b(0, 0, 0, w, d, 1.2, "dark")
    # Open centre under the joined deck, with deep unequal equipment cheeks.
    b(0, 0, 1, 7.5, d, 9.5, "primary.equipment-cover")
    b(w-7, 0, 1, w, d, 9.5, "primary.equipment-cover")
    b(7, 0, 2, w-6.5, 1.5, 9.5, "secondary")
    b(0, 0, 9, w, d, 10, "trim")
    b(1, 3.5, 10, w-1, d-.5, 10.55, "primary")
    # A single joined clipped pressure housing backs two large readable bays.
    b(0, 0, 9.5, w, 1.3, h, "primary.equipment-cover")
    for x, X in ((.7, 16), (16.5, w-.7)):
        b(x, 1, 10, X, 3.6, h-.4, "primary.equipment-frame")
        b(x+1.3, 1.4, 11.3, X-1.3, 2.9, h-1.7, "dark")
        b(x+1.65, 2.9, 11.65, X-1.65, 3.04, h-2.05, "emit_a")
    # Two substantial control banks, not isolated subpixel single keys.
    for x, X in ((2, 13.5), (18, 29.5)):
        b(x, 4.4, 10.55, X, 7.4, 11.2, "secondary")
        for row in range(2):
            for q in range(5):
                xx=x+.65+q*1.9
                b(xx, 4.8+row*1.1, 11.2, xx+1.2, 5.5+row*1.1, 11.55, "metal")
        b(X-2.4, 6.8, 11.2, X-1.1, 7.2, 11.8, "accent")
    # Backed side access bay and a small warm task lamp remain inside the case.
    b(w-6.2, d-.4, 3, w-1.5, d-.2, 6.7, "dark")
    b(w-5.6, d-.2, 3.6, w-2.1, d-.1, 6.1, "trim")
    b(1.5, d-.5, 8.1, 5.5, d-.2, 8.55, "emit_b")
    return p


def workshop_console(w, d, h):
    # Preserve the prior actual top, one texel below the catalog envelope.
    h -= 1
    p = K.Piece("reference.r018.workshop", "object", "interior", (w, d, h))
    b = p.b
    b(0, 0, 0, w, d, 1.1, "dark")
    b(0, 0, 1, 6, d, 9, "primary.equipment-cover")
    b(w-6, 0, 1, w, d, 9, "primary.equipment-cover")
    b(5.5, 0, 1, w-5.5, 1.5, 9, "secondary")
    b(0, 0, 8.5, w, d, 9.5, "trim")
    b(1, 3.5, 9.5, w-1, d-.6, 10.1, "primary")
    b(0, 0, 9, w, 1.3, h, "primary.equipment-cover")
    # Large protected system display and offset electrical/service housing.
    b(.7, 1, 10, 15.8, 3.8, h-.4, "primary.equipment-frame")
    b(2, 1.4, 11.3, 14.5, 3.0, h-1.7, "dark")
    b(2.3, 3.0, 11.6, 14.2, 3.15, h-2, "emit_a")
    b(16.4, 1, 10.4, w-.7, 4.1, h-.8, "trim.equipment-frame")
    b(17.7, 1.5, 11.7, w-2, 3.2, h-2.1, "dark")
    for z in (12.1, 13.5):
        b(18, 3.2, z, w-2.3, 3.6, z+.6, "metal")
    b(w-2.8, 3.65, 12, w-2.3, 3.9, 14.4, "emit_b")
    b(2, 4.8, 10.1, 14.5, 8.9, 10.6, "secondary")
    for row in range(3):
        for q in range(5):
            x=2.6+q*2.1
            b(x, 5.2+row*1.1, 10.6, x+1.3, 5.95+row*1.1, 10.95, "metal")
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
    E.OBJECTS_REVISION="equipment-r018"
    E.boxes_mesh=equipment_mesh
    E.export_objects(args)
    manifest=Path(args.out)/"manifest.json"
    data=json.loads(manifest.read_text())
    data["generator"]["candidateBuilder"]="scripts/art_library/ship_reference_r018_equipment.py"
    data["generator"]["candidateBuilderSha256"]=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    data["generator"]["housingHelperSha256"]=hashlib.sha256(Path(A.__file__).read_bytes()).hexdigest()
    data["requiredObjectIds"]=list(IDS)
    data["status"]="isolated opt-in proposal; default art and navigation unchanged"
    manifest.write_text(json.dumps(data,indent=2)+"\n")
