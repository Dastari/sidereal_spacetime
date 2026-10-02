"""Immutable authored display-UV derivative of the qualified R25 room geometry."""
import json
import math
import sys
from pathlib import Path

import bpy

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import ship_reference_r025_rooms_clean as C

E, H, ROOT = C.E, C.H, C.ROOT
HELD_CLEAN_SHA = "a1ebc2ac2142fcad372caa9adfbf0be9a0b3006db34bcbb68384251a8f90d400"


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
    size = C.SIZES[did]
    out = ROOT / "assets/runtime/ship-objects/reference-r025-display"
    source = ROOT / "assets/source/ship-reference/r002/rooms-r025-display"
    target, editable = out / (did+".glb"), source / (did+".blend")
    assert not target.exists() and not editable.exists(), "Never overwrite a candidate"
    out.mkdir(parents=True, exist_ok=True)
    source.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    piece = make(*size)
    assert all(all(math.isfinite(v) for v in q[:6]) and
               all(0 <= q[i] < q[i+3] <= size[i] for i in range(3)) for q in piece.boxes)
    boxes = E.to_catalog(piece, "interior", 0)
    mesh = C.geometric_triangle_mesh(H.equipment_mesh(did, boxes, E.hidden_faces(boxes)))
    for mat in E.slot_materials():
        mesh.materials.append(mat)
    chart = normalize_display_uv(mesh)
    root = bpy.data.objects.new("object."+did, None)
    bpy.context.collection.objects.link(root)
    root["designId"], root["frame"], root["proposalRevision"] = did, "interior", "r025"
    ob = bpy.data.objects.new(did, mesh)
    bpy.context.collection.objects.link(ob)
    ob.parent = root
    tris, verts, lo, hi, used = E.measure(ob)
    assert tris <= 4500
    assert all(abs(a-b) <= 1e-6 for a, b in zip(lo, (-size[0]/32, -size[1]/32, 0)))
    assert all(abs(a-b) <= 1e-6 for a, b in zip(hi, (size[0]/32, size[1]/32, size[2]/16)))
    bpy.ops.object.select_all(action="SELECT")
    bpy.context.view_layer.objects.active = ob
    bpy.ops.wm.save_as_mainfile(filepath=str(editable), compress=True, check_existing=False)
    bpy.ops.export_scene.gltf(filepath=str(target), export_format="GLB", use_selection=True,
        export_apply=True, export_extras=True, export_yup=True, export_cameras=False,
        export_lights=False, export_animations=False, export_materials="EXPORT")
    metadata = {"designId": did, "status": "proposal; integrated native art pending", "revision": "r025",
        "sizeTexels": size, "triangles": tris, "vertices": verts, "boxes": len(boxes),
        "boundsM": [list(lo), list(hi)], "materialSlotsUsed": [E.SLOTS[i] for i in used],
        "glb": str(target.relative_to(ROOT)), "url": "/assets/ship-objects/reference-r025-display/"+did+".glb",
        "bytes": target.stat().st_size, "sha256": E.sha256(target),
        "source": str(editable.relative_to(ROOT)), "sourceSha256": E.sha256(editable),
        "generator": str(Path(__file__).relative_to(ROOT)), "generatorSha256": E.sha256(__file__),
        "helperSha256": E.sha256(H.__file__), "semanticAuthoringSha256": E.sha256(H.A.__file__),
        "authoredBoxesTexels": piece.boxes, "immutableCleanSourceSha256": HELD_CLEAN_SHA,
        "immutablePreviousSourceSha256": E.sha256(HERE / "ship_reference_r025_rooms.py"),
        "normalPolicy": "actual loop triangles split; unchanged positions/material/geometric flat normals",
        "displayChart": chart, "capabilities": {"seat": False, "storage": False, "control": False}}
    (out / (did+"-source.json")).write_text(json.dumps(metadata, indent=2)+"\n")
    print(json.dumps({k: v for k, v in metadata.items() if k != "authoredBoxesTexels"}))


if __name__ == "__main__":
    build(C.WORKSHOP, C.workshop)
    build(C.MEDICAL, C.medical)
