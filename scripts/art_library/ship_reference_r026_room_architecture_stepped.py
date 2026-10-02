"""R26 immutable room-facing machinery derivative inside the two R25 host bounds.

The display planes and normalized whole charts remain fixed. New opaque backing
sits behind each display, while existing near-lip rings remain open toward +Y.
No catalog, fixture placement, capability, or old asset is changed.
"""
import json
import math
import sys
from pathlib import Path

import bpy
import bmesh

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import ship_reference_r025_rooms_clean as C
import ship_reference_r025_rooms_display as D

E, H, ROOT = C.E, C.H, C.ROOT
HELD_CLEAN_SHA = "a1ebc2ac2142fcad372caa9adfbf0be9a0b3006db34bcbb68384251a8f90d400"
HELD_DISPLAY_SHA = "4040c19cd8f2eda41b416a0f794fedf95f1b7ff52331c54748711202fb76b697"
TRIANGLE_CAPS = {C.WORKSHOP: 1124, C.MEDICAL: 866}
DISPLAY_CORRIDORS = {
    C.WORKSHOP: [32.5, 3.95, 20, 48, 16, 27],
    C.MEDICAL: [7, 7.15, 24, 18, 20, 29],
}
UPPER_RINGS_WITHOUT_MICROBEVEL = {
    C.WORKSHOP: ((3, 1.5, 16, 28, 8, 28), (30.5, 1, 18, 50, 4.8, 30)),
    C.MEDICAL: ((1, 4.7, 16, 6, 12, 24), (5, 4, 22, 20, 8, 31)),
}


def closed_clipped_ring(name, box):
    """Same finite clipped aperture and depth, without the upper edge microbevel."""
    assert box[6].endswith("equipment-frame")
    x, y, z, X, Y, Z = [v*E.T for v in box[:6]]
    cut = min((X-x)*.13, (Z-z)*.12, .09)
    outer = [(x+cut,z), (X-cut,z), (X,z+cut), (X,Z-cut),
             (X-cut,Z), (x+cut,Z), (x,Z-cut), (x,z+cut)]
    rim = min(.075, (X-x)*.15, (Z-z)*.17)
    inner = [(a+(rim if a<(x+X)/2 else -rim),
              b+(rim if b<(z+Z)/2 else -rim)) for a,b in outer]
    bm = bmesh.new()
    back = [bm.verts.new((a,y,b)) for a,b in outer]
    front = [bm.verts.new((a,Y,b)) for a,b in outer]
    ib = [bm.verts.new((a,y,b)) for a,b in inner]
    iff = [bm.verts.new((a,Y,b)) for a,b in inner]
    for i in range(8):
        j = (i+1)%8
        for vertices in ((back[i],back[j],front[j],front[i]),
                         (front[i],front[j],iff[j],iff[i]),
                         (ib[i],iff[i],iff[j],ib[j]),
                         (back[j],back[i],ib[i],ib[j])):
            face = bm.faces.new(vertices)
            face.material_index = E.SI[box[6]]
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    mesh = bpy.data.meshes.new("GEO-"+name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    return mesh


def architecture_mesh(did, piece, boxes):
    selected = {tuple(boxes[i]) for i,q in enumerate(piece.boxes)
                if tuple(q[:6]) in UPPER_RINGS_WITHOUT_MICROBEVEL[did]}
    assert len(selected) == 2, "Exactly two named upper rings per host"
    original = H.front_prism
    def scoped_prism(name, box):
        return closed_clipped_ring(name, box) if tuple(box) in selected else original(name, box)
    H.front_prism = scoped_prism
    try:
        return H.equipment_mesh(did, boxes, E.hidden_faces(boxes))
    finally:
        H.front_prism = original


def workshop(w, d, h):
    old = C.workshop(w, d, h)
    p = H.K.Piece(C.WORKSHOP, "object", "interior", (w, d, h))
    # Keep the complete lower machine/contact/counter/control assembly, original
    # extreme-height support and screen plane. Replace only named upper machinery.
    p.boxes = old.boxes[:19] + old.boxes[25:28] + old.boxes[30:]
    b = p.b
    # Broad unequal service body: a real open 0.3875m bay, finite clipped rim,
    # substantial cassette and offset distribution equipment inside its mouth.
    b(3, 0, 16, 28, 1.8, 28, "secondary")
    b(3, 1.5, 16, 28, 8, 28, "primary.equipment-frame")
    b(5, 1.6, 18, 26, 2.1, 26, "dark")
    b(7, 1.7, 18.5, 18, 5.6, 25.5, "primary.equipment-cover")
    b(20, 1.8, 19, 25, 4.3, 24.5, "metal")
    b(7.8, 5.4, 20, 16.8, 5.8, 23.8, "secondary")
    b(22.8, 4.1, 20, 24.1, 4.5, 22.7, "accent")
    # The monitor has unequal depth from its neighboring service case. Preserve
    # the previous 4.8 front lip and 3.95 display plane: no deep-screen regression.
    b(30.5, 0, 14, 50, 1.6, 30, "primary.equipment-cover")
    b(30.5, 1, 18, 50, 4.8, 30, "primary.equipment-frame")
    b(32, 1.5, 19.5, 48.5, 3.8, 28.5, "dark")
    return p


def medical(w, d, h):
    old = C.medical(w, d, h)
    p = H.K.Piece(C.MEDICAL, "object", "interior", (w, d, h))
    # Lower cabinet, contact plane, keyboard, existing display/rim and extreme
    # height post remain exact. Supply body becomes a true tall utility machine.
    p.boxes = old.boxes[:17] + old.boxes[19:]
    b = p.b
    b(1, 3, 14.875, 6, 5, 28, "secondary")
    b(1, 4.7, 16, 6, 12, 24, "primary.equipment-frame")
    b(1.7, 4.8, 18, 5.3, 5.2, 24, "dark")
    b(2, 5, 18.5, 4.8, 8.3, 22.5, "metal")
    b(2.2, 8.1, 20, 4.6, 8.6, 22.5, "accent")
    # Enclosed rear monitor body is wholly behind the 7.15 plane; the original
    # open frame alone reaches 8. No new solid intersects its +Y X/Z corridor.
    b(7, 4, 20, 19, 6.6, 31, "secondary.equipment-cover")
    return p


def assert_display_corridor(piece, previous):
    """Reject new solid fronts; certify clipped ring aperture at its actual lip."""
    x, y, z, X, Y, Z = DISPLAY_CORRIDORS[piece.id]
    for box in piece.boxes:
        if box in previous.boxes or box[4] <= y:
            continue
        a, b, c, A, B, Cc, slot = box
        if A <= x or a >= X or Cc <= z or c >= Z:
            continue
        assert slot.endswith("equipment-frame"), "New solid blocks the display +Y corridor"
        # Exactly the clipped ring grammar used by H.front_prism, in texels.
        cut = min((A-a)*.13, (Cc-c)*.12, .09*16)
        rim = min(.075*16, (A-a)*.15, (Cc-c)*.17)
        outer = [(a+cut,c), (A-cut,c), (A,c+cut), (A,Cc-cut),
                 (A-cut,Cc), (a+cut,Cc), (a,Cc-cut), (a,c+cut)]
        inner = [(u+(rim if u<(a+A)/2 else -rim),
                  v+(rim if v<(c+Cc)/2 else -rim)) for u,v in outer]
        for u,v in ((x,z), (X,z), (X,Z), (x,Z)):
            assert all((q[0]-p[0])*(v-p[1])-(q[1]-p[1])*(u-p[0]) > 0
                       for p,q in zip(inner, inner[1:]+inner[:1])), "Screen corner outside true ring aperture"
    assert piece.boxes[0] == previous.boxes[0], "Original floor contact base stays exact"


def normalize_display_uv(mesh):
    """Author one upright X/Z chart over the actual whole planar screen."""
    screen = [f for f in mesh.polygons
              if mesh.materials[f.material_index].name == f"slot{E.SI['emit_a']}_emit_a"]
    assert screen, "Require actual semantic display faces after material slots exist"
    loops = [i for f in screen for i in f.loop_indices]
    coordinates = [mesh.vertices[mesh.loops[i].vertex_index].co for i in loops]
    assert max(p.y for p in coordinates)-min(p.y for p in coordinates) <= 1e-8, "One planar display"
    xmin, xmax = min(p.x for p in coordinates), max(p.x for p in coordinates)
    zmin, zmax = min(p.z for p in coordinates), max(p.z for p in coordinates)
    assert xmax > xmin and zmax > zmin, "No degenerate screen chart"
    uv = mesh.uv_layers.active.data
    before = [tuple(q.uv) for q in uv]
    for i in loops:
        p = mesh.vertices[mesh.loops[i].vertex_index].co
        uv[i].uv = ((p.x-xmin)/(xmax-xmin), (p.z-zmin)/(zmax-zmin))
    selected = set(loops)
    assert all(tuple(q.uv) == before[i] for i, q in enumerate(uv) if i not in selected), "Other UVs unchanged"
    assert all(math.isfinite(v) and 0 <= v <= 1 for i in loops for v in uv[i].uv)
    assert {tuple(uv[i].uv) for i in loops} == {(0., 0.), (0., 1.), (1., 0.), (1., 1.)}
    return {"policy": "whole planar display X-to-U/Z-to-V; all other UVs unchanged",
            "displayLoopCount": len(loops), "sourceXZBoundsM": [xmin, zmin, xmax, zmax]}



def build(did, make):
    assert E.sha256(Path(C.__file__)) == HELD_CLEAN_SHA, "Immutable clean geometry source changed"
    assert E.sha256(Path(D.__file__)) == HELD_DISPLAY_SHA, "Immutable display source changed"
    size = C.SIZES[did]
    out = ROOT / "assets/runtime/ship-objects/reference-r026-room-architecture-stepped"
    source = ROOT / "assets/source/ship-reference/r002/rooms-r026-room-architecture-stepped"
    target, editable = out / (did+".glb"), source / (did+".blend")
    assert not target.exists() and not editable.exists(), "Never overwrite a candidate"
    out.mkdir(parents=True, exist_ok=True)
    source.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    piece = make(*size)
    assert all(all(math.isfinite(v) for v in q[:6]) and
               all(0 <= q[i] < q[i+3] <= size[i] for i in range(3)) for q in piece.boxes)
    previous = (C.workshop if did == C.WORKSHOP else C.medical)(*size)
    assert_display_corridor(piece, previous)
    boxes = E.to_catalog(piece, "interior", 0)
    mesh = C.geometric_triangle_mesh(architecture_mesh(did, piece, boxes))
    for mat in E.slot_materials():
        mesh.materials.append(mat)
    chart = normalize_display_uv(mesh)
    root = bpy.data.objects.new("object."+did, None)
    bpy.context.collection.objects.link(root)
    root["designId"], root["frame"], root["proposalRevision"] = did, "interior", "r026"
    ob = bpy.data.objects.new(did, mesh)
    bpy.context.collection.objects.link(ob)
    ob.parent = root
    tris, verts, lo, hi, used = E.measure(ob)
    print(json.dumps({"designId": did, "actualTriangles": tris, "triangleCap": TRIANGLE_CAPS[did]}), flush=True)
    assert tris <= TRIANGLE_CAPS[did], f"Retain the qualified host triangle ceiling: {tris}/{TRIANGLE_CAPS[did]}"
    assert len(used) <= 10, "Retain semantic primitive budget"
    assert all(abs(a-b) <= 1e-6 for a, b in zip(lo, (-size[0]/32, -size[1]/32, 0)))
    assert all(abs(a-b) <= 1e-6 for a, b in zip(hi, (size[0]/32, size[1]/32, size[2]/16)))
    bpy.ops.object.select_all(action="SELECT")
    bpy.context.view_layer.objects.active = ob
    bpy.ops.wm.save_as_mainfile(filepath=str(editable), compress=True, check_existing=False)
    bpy.ops.export_scene.gltf(filepath=str(target), export_format="GLB", use_selection=True,
        export_apply=True, export_extras=True, export_yup=True, export_cameras=False,
        export_lights=False, export_animations=False, export_materials="EXPORT")
    metadata = {"designId": did, "status": "proposal; integrated native art pending", "revision": "r026",
        "sizeTexels": size, "triangles": tris, "vertices": verts, "boxes": len(boxes),
        "boundsM": [list(lo), list(hi)], "materialSlotsUsed": [E.SLOTS[i] for i in used],
        "glb": str(target.relative_to(ROOT)), "url": "/assets/ship-objects/reference-r026-room-architecture-stepped/"+did+".glb",
        "bytes": target.stat().st_size, "sha256": E.sha256(target),
        "source": str(editable.relative_to(ROOT)), "sourceSha256": E.sha256(editable),
        "generator": str(Path(__file__).relative_to(ROOT)), "generatorSha256": E.sha256(__file__),
        "helperSha256": E.sha256(H.__file__), "semanticAuthoringSha256": E.sha256(H.A.__file__),
        "authoredBoxesTexels": piece.boxes, "immutableCleanSourceSha256": HELD_CLEAN_SHA,
        "immutableDisplaySourceSha256": HELD_DISPLAY_SHA,
        "displayCorridorTexels": DISPLAY_CORRIDORS[did],
        "serviceBodyScope": "existing catalog footprint; unchanged display plane and lower contact geometry",
        "immutablePreviousSourceSha256": E.sha256(HERE / "ship_reference_r025_rooms.py"),
        "normalPolicy": "actual loop triangles split; unchanged positions/material/geometric flat normals",
        "displayChart": chart, "capabilities": {"seat": False, "storage": False, "control": False}}
    metadata["upperRingMicrobevelOmittedTexels"] = UPPER_RINGS_WITHOUT_MICROBEVEL[did]
    (out / (did+"-source.json")).write_text(json.dumps(metadata, indent=2)+"\n")
    print(json.dumps({k: v for k, v in metadata.items() if k != "authoredBoxesTexels"}))


if __name__ == "__main__":
    build(C.WORKSHOP, workshop)
    build(C.MEDICAL, medical)
