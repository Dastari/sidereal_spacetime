"""Immutable clean hard-normal derivative of the private R25 room fixtures.

No existing asset, room grammar or authoritative capability is changed. Dimensions
are fixed by the accepted reference-room-fixtures@r025 catalog. Run Blender -b -t 2.
"""
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import ship_reference_r018_equipment as H

E, K = H.E, H.K
ROOT = E.ROOT
WORKSHOP = "shipyard.equipment.workshop-bank-r025"
MEDICAL = "shipyard.equipment.medical-equipment-bank-r025"
SIZES = {WORKSHOP: (52, 16, 32), MEDICAL: (20, 20, 32)}


def workshop(w, d, h):
    p = K.Piece(WORKSHOP, "object", "interior", (w, d, h))
    b = p.b
    # A long working surface rests on unequal enclosed machines. The centre is
    # a real backed service opening, with 0.375m of clear depth to its hardware.
    b(0, 0, 0, w, d, 1, "dark")
    b(0, 0, .75, 15, d, 13, "primary.equipment-cover")
    b(35, 0, .75, w, d, 11, "primary.equipment-cover")
    b(14, 0, .75, 36, 2, 13, "secondary")
    b(15, 1.75, .75, 35, 3, 12.5, "dark")
    b(15, 2.5, 1.5, 17, d, 13, "trim")
    b(33, 2.5, 1.5, 35, d, 13, "trim")
    b(17, 2.5, 1.5, 33, d, 3, "trim")
    b(18, 2.8, 3, 25, 10, 8, "metal")
    b(26, 2.8, 4, 32, 8, 11, "primary.equipment-cover")
    b(27, 7.8, 6, 31, 8.4, 7, "accent")
    b(0, 0, 12.5, w, d, 14, "trim")
    b(.5, 2, 13.875, w-.5, d-.4, 15, "primary")
    # Broad lower access covers and latches; no per-screw geometry.
    b(1.5, d-.65, 3, 12.8, d-.1, 10.5, "secondary")
    b(11, d-.1, 5, 11.6, d, 8.5, "metal")
    b(37, d-.65, 2.5, 49.5, d-.1, 8.5, "accent")
    b(38, d-.1, 4, 38.7, d, 6.5, "metal")
    # Unequal narrow upper assemblies leave most of the room visible.
    b(3, 0, 14, 5, 2.5, h, "trim")
    b(26, 0, 14, 28, 2.5, 28, "trim")
    b(3, 0, 18, 28, 1.6, 28, "primary.equipment-cover")
    b(5.5, 1.4, 20, 25.5, 1.9, 26, "dark")
    for x, z, length in ((7, 21, 3), (12, 22, 3.5), (18, 21, 4), (23, 22, 2.5)):
        b(x, 1.7, z, x+1, 2.8, z+length, "metal")
    b(3, 0, 31, 14, 4, h, "trim")
    b(5, 2, 30.65, 12, 3.5, 31.1, "emit_b")
    b(39, 0, 14, 41, 3, 29, "metal")
    b(30.5, 1, 18, 50, 4.8, 29, "primary.equipment-frame")
    b(32, 1.8, 19.5, 48.5, 3.8, 27.5, "dark")
    b(32.5, 3.75, 20, 48, 3.95, 27, "emit_a")
    b(31, 5.5, 14.875, 48, 9, 15.7, "secondary")
    for x in (33, 36, 39, 42, 45):
        b(x, 6, 15.55, x+1.7, 7.3, 16.1, "metal")
    b(5, 5, 14.875, 14, 11, 16, "metal")
    b(6, 6, 15.875, 8, 9, 17.5, "accent")
    return p


def medical(w, d, h):
    p = K.Piece(MEDICAL, "object", "interior", (w, d, h))
    b = p.b
    # Independent auxiliary cabinet: never a bed or a seat collider alias.
    b(0, 0, 0, w, d, 1, "dark")
    b(0, 0, .75, w, 2, 14, "secondary")
    b(0, 1.5, .75, w, d, 13.5, "primary.equipment-frame")
    b(1.5, 1.75, 2.5, w-1.5, 8, 12, "dark")
    b(2.5, 7.5, 3, 9, 14, 10.8, "metal")
    b(10, 7.5, 4, 17.5, 12, 11.5, "secondary.equipment-cover")
    b(11.5, 11.8, 6, 16, 12.4, 7.1, "accent")
    b(0, 0, 13, w, d, 14, "trim")
    b(.5, 2, 13.875, w-.5, d-.5, 15, "primary")
    b(2, 14, 14.875, 11, 18, 15.8, "secondary")
    for x in (3, 5.5, 8):
        b(x, 15, 15.65, x+1.5, 16.5, 16.2, "metal")
    b(14, 3, 14, 16, 6, h, "metal")
    b(5, 4, 22, w, 8, 31, "primary.equipment-frame")
    b(6.5, 4.8, 23.5, 18.5, 7, 29.5, "dark")
    b(7, 6.95, 24, 18, 7.15, 29, "emit_a")
    b(2, 3, 14.875, 5, 8, 21, "trim")
    b(2.5, 3.5, 20.875, 4.5, 7.5, 22.5, "accent")
    b(17.5, 12, 3.5, 19.5, d-.10, 5.5, "trim")
    b(17.6, d-.125, 4, 19.4, d, 5, "emit_b")
    return p


def geometric_triangle_mesh(mesh):
    """Preserve actual loop triangles/positions/UVs; use per-triangle flat normals."""
    mesh.calc_loop_triangles()
    points, faces, materials, uvs = [], [], [], []
    original_uv = mesh.uv_layers.active.data
    for triangle in mesh.loop_triangles:
        start = len(points)
        points.extend(tuple(mesh.vertices[mesh.loops[li].vertex_index].co) for li in triangle.loops)
        faces.append((start, start+1, start+2))
        materials.append(triangle.material_index)
        uvs.extend(tuple(original_uv[li].uv) for li in triangle.loops)
    result = bpy.data.meshes.new(mesh.name+"-geometric-flat-triangles")
    result.from_pydata(points, [], faces)
    result.update()
    uv = result.uv_layers.new(name="authored-surface")
    for face, material in zip(result.polygons, materials):
        face.material_index = material
        face.use_smooth = False
    for loop, coordinate in zip(uv.data, uvs):
        loop.uv = coordinate
    assert len(result.vertices) == len(points)
    assert all(tuple(v.co) == p for v, p in zip(result.vertices, points)), "No coordinate movement"
    bpy.data.meshes.remove(mesh)
    return result


def build(did, make):
    assert E.sha256(HERE / "ship_reference_r025_rooms.py") == "cadd4cffaa5cf8624bb814866c1e70bd4ee1f9283dff52e5c70eb78a9a206c71"
    size = SIZES[did]
    piece = make(*size)
    assert all(all(math.isfinite(v) for v in q[:6]) and
               all(0 <= q[i] < q[i+3] <= size[i] for i in range(3))
               for q in piece.boxes), "Reject authored overflow before export; no clipping"
    out = ROOT / "assets/runtime/ship-objects/reference-r025-clean"
    source = ROOT / "assets/source/ship-reference/r002/rooms-r025-clean"
    target, editable = out / (did + ".glb"), source / (did + ".blend")
    assert not target.exists() and not editable.exists(), "Never overwrite a candidate"
    out.mkdir(parents=True, exist_ok=True)
    source.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    boxes = E.to_catalog(piece, "interior", 0)
    mesh = H.equipment_mesh(did, boxes, E.hidden_faces(boxes))
    mesh = geometric_triangle_mesh(mesh)
    for mat in E.slot_materials():
        mesh.materials.append(mat)
    mesh.polygons.foreach_set("use_smooth", [False] * len(mesh.polygons))
    root = bpy.data.objects.new("object." + did, None)
    bpy.context.collection.objects.link(root)
    root["designId"], root["frame"], root["proposalRevision"] = did, "interior", "r025"
    ob = bpy.data.objects.new(did, mesh)
    bpy.context.collection.objects.link(ob)
    ob.parent = root
    tris, verts, lo, hi, used = E.measure(ob)
    assert tris <= 4500, "Finite new furniture assembly budget"
    assert all(abs(a-b) <= 1e-6 for a, b in zip(lo, (-size[0]/32, -size[1]/32, 0)))
    assert all(abs(a-b) <= 1e-6 for a, b in zip(hi, (size[0]/32, size[1]/32, size[2]/16)))
    bpy.ops.object.select_all(action="SELECT")
    bpy.context.view_layer.objects.active = ob
    bpy.ops.wm.save_as_mainfile(filepath=str(editable), compress=True, check_existing=False)
    bpy.ops.export_scene.gltf(filepath=str(target), export_format="GLB", use_selection=True,
        export_apply=True, export_extras=True, export_yup=True, export_cameras=False,
        export_lights=False, export_animations=False, export_materials="EXPORT")
    metadata = {"designId": did, "status": "proposal; native art pending", "revision": "r025",
        "sizeTexels": size, "triangles": tris, "vertices": verts, "boxes": len(boxes),
        "boundsM": [list(lo), list(hi)], "materialSlotsUsed": [E.SLOTS[i] for i in used],
        "glb": str(target.relative_to(ROOT)), "url": "/assets/ship-objects/reference-r025-clean/"+did+".glb",
        "bytes": target.stat().st_size, "sha256": E.sha256(target),
        "source": str(editable.relative_to(ROOT)), "sourceSha256": E.sha256(editable),
        "generator": str(Path(__file__).relative_to(ROOT)), "generatorSha256": E.sha256(__file__),
        "helperSha256": E.sha256(H.__file__), "semanticAuthoringSha256": E.sha256(H.A.__file__),
        "authoredBoxesTexels": piece.boxes, "immutablePreviousSourceSha256": E.sha256(HERE / "ship_reference_r025_rooms.py"),
        "normalPolicy": "actual loop triangles split, unchanged positions/UV/material; geometric flat",
        "capabilities": {"seat": False, "storage": False, "control": False}}
    (out / (did + "-source.json")).write_text(json.dumps(metadata, indent=2)+"\n")
    print(json.dumps({k: v for k, v in metadata.items() if k != "authoredBoxesTexels"}))


if __name__ == "__main__":
    build(WORKSHOP, workshop)
    build(MEDICAL, medical)
