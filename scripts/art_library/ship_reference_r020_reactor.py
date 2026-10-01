"""Proposal-only active reactor derivatives, in their exact existing fitting frames.

Run Blender in background with this file. Historical exporters and assets are inputs,
never rewritten. The named component overrides are integrated by the R002 publisher.
"""
import hashlib
import json
import struct
from pathlib import Path

import bpy
import bmesh

ROOT = Path(__file__).resolve().parents[2]
SLOTS = ("primary", "accent", "trim", "metal", "dark", "secondary.vessel")
PROFILES = {
    "reactor.md": {"sha256": "eee26cc08eec7467f9a48d3ff40277cc1fb391540738d022ec88286067329f6c", "bounds": [-1.25, 0, -1.3125, 1.25, 2.3125, 1.25], "side": -1, "quarterTurns": 3, "anchor": [1.5, 5.5]},
    "reactor.lg": {"sha256": "3994af1583c43abe0e2c043f517a3a0ce91ba4717814bd209fa3f11b3e36c741", "bounds": [-1.75, 0, -1.8125, 1.75, 2.9375, 1.75], "side": 1, "quarterTurns": 0, "anchor": [2, 5]},
}


def old_document(name, profile):
    raw = (ROOT / "assets/runtime/ship-components/r006" / (name + ".glb")).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == profile["sha256"], "Immutable original input changed"
    length = struct.unpack_from("<I", raw, 12)[0]
    return json.loads(raw[20:20 + length])


def material(source):
    result = bpy.data.materials.new(source["name"])
    result.use_nodes = True
    shader = result.node_tree.nodes.get("Principled BSDF")
    pbr = source.get("pbrMetallicRoughness", {})
    shader.inputs["Base Color"].default_value = pbr.get("baseColorFactor", [1, 1, 1, 1])
    shader.inputs["Metallic"].default_value = pbr.get("metallicFactor", 0)
    shader.inputs["Roughness"].default_value = pbr.get("roughnessFactor", .45)
    shader.inputs["Emission Strength"].default_value = 0
    return result


def build(name, profile):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    old = old_document(name, profile)
    old_materials = {m["name"].split("_", 1)[1]: m for m in old["materials"]}
    mats = [material(old_materials[s]) for s in SLOTS]
    lo, _, gltf_z0, hi, height, gltf_z1 = profile["bounds"]
    back, front = -gltf_z1, -gltf_z0  # Blender +Y access face, glTF -Z.
    side = profile["side"]
    body_x0 = lo + (.5 if side < 0 else .375)
    body_x1 = hi - (.5 if side > 0 else .375)
    body_back, body_front = back + .375, front - .375
    parts = []

    def box(label, bounds, slot, bevel=0):
        x, y, z, X, Y, Z = bounds
        assert x < X and y < Y and z < Z, label
        assert x >= lo and X <= hi and y >= back and Y <= front and z >= 0 and Z <= height, label
        mesh = bmesh.new()
        vertices = [mesh.verts.new((a, b, c)) for a, b, c in ((x, y, z), (X, y, z), (X, Y, z), (x, Y, z), (x, y, Z), (X, y, Z), (X, Y, Z), (x, Y, Z))]
        for face in ((3, 2, 1, 0), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
            mesh.faces.new([vertices[i] for i in face])
        if bevel:
            bmesh.ops.bevel(mesh, geom=list(mesh.edges), offset=bevel, segments=1, affect="EDGES", clamp_overlap=True)
        bmesh.ops.recalc_face_normals(mesh, faces=list(mesh.faces))
        for face in mesh.faces:
            face.material_index = SLOTS.index(slot)
        data = bpy.data.meshes.new("GEO-" + label)
        mesh.to_mesh(data)
        mesh.free()
        parts.append((label, data))

    # Preserve the exact old rectangular bottom-contact footprint and base datum.
    # Original base is chamfered: its z=0 contact rectangle is inset 27.5 mm.
    # Keep both that contact surface and the original outer envelope exactly.
    box("contact-base", (lo, back, 0, hi, front, .125), "trim", .0275)
    box("closed-pressure-body", (body_x0, body_back, .120, body_x1, body_front, height - .375), "secondary.vessel", .018)
    # Real split front housing: no full box behind/over the intended opening.
    left, right = lo + .5625, hi - .625
    box("front-left-post", (lo + .125, front - .390, .120, left, front - .025, height - .1875), "primary", .020)
    box("front-right-post", (right, front - .390, .120, hi - .125, front - .025, height - .4375), "primary", .020)
    box("front-lower-joined-case", (lo + .125, front - .390, .125, hi - .125, front - .025, .4375), "primary", .020)
    box("front-header", (left - .015, front - .390, height - .6875, right + .015, front - .025, height - .4375), "trim", .015)
    box("front-closed-backing", (left + .035, body_front - .005, .48, right - .035, body_front + .020, height - .725), "dark")
    divider = left + (right - left) * .63
    for i in range(3):
        x = left + .10 + i * (divider - left - .20) / 3
        box("front-cooling-fin-%d" % i, (x, body_front + .015, .5625 + i * .0625, x + .085, body_front + .085, height - .875 - i * .0625), "metal")
    box("unequal-control-cover", (divider + .0625, body_front + .012, .5625, right - .065, body_front + .095, height - .90), "primary", .015)
    box("control-accent", (divider + .10, body_front + .090, .70, right - .10, body_front + .115, .875), "accent")
    box("control-binding", (divider + .10, body_front + .094, height - 1.13, right - .10, body_front + .108, height - 1.08), "metal")
    # Unequal finite access plates break up the case columns without filling the bay.
    box("front-column-service-cover", (lo + .175, front - .050, .6875, left - .10, front - .010, height - .875), "trim", .012)
    box("front-column-service-mark", (lo + .20, front - .012, .9375, left - .125, front - .005, 1.0), "accent")
    box("opposite-column-short-cover", (right + .075, front - .050, .5625, hi - .175, front - .010, .875), "metal")
    box("lower-case-access-binding", (left + .05, front - .040, .20, divider - .06, front - .010, .2625), "metal")

    # Near-side service return is left for starboard-facing MD, right for fore-facing LG.
    sx0, sx1 = (lo + .125, body_x0 + .015) if side < 0 else (body_x1 - .015, hi - .125)
    side_y0, side_y1 = body_back + .125, body_front - .1875
    box("side-rear-jamb", (sx0, back + .1875, .120, sx1, side_y0 + .015, height - .25), "primary", .018)
    box("side-front-jamb", (sx0, side_y1 - .015, .120, sx1, front - .025, height - .4375), "primary", .018)
    box("side-lower-return", (sx0, side_y0 - .015, .120, sx1, side_y1 + .015, .50), "trim", .015)
    box("side-header-return", (sx0, side_y0 - .015, height - .75, sx1, side_y1 + .015, height - .50), "trim", .015)
    bx0, bx1 = (body_x0 - .020, body_x0 + .005) if side < 0 else (body_x1 - .005, body_x1 + .020)
    box("side-closed-backing", (bx0, side_y0 + .035, .535, bx1, side_y1 - .035, height - .79), "dark")
    fx0, fx1 = (body_x0 - .085, body_x0 - .015) if side < 0 else (body_x1 + .015, body_x1 + .085)
    for i in range(2):
        y = side_y0 + .12 + i * .22
        box("side-cooling-fin-%d" % i, (fx0, y, .625, fx1, y + .09, height - .925 - i * .125), "metal")
    # A shorter control cassette occupies only the upper forward side of this well.
    cx0, cx1 = (body_x0 - .115, body_x0 - .015) if side < 0 else (body_x1 + .015, body_x1 + .115)
    box("side-upper-access-cassette", (cx0, side_y1 - .43, 1.0, cx1, side_y1 - .06, height - .875), "primary", .012)
    ax0, ax1 = (cx0 - .012, cx0 + .005) if side < 0 else (cx1 - .005, cx1 + .012)
    box("side-control-binding", (ax0, side_y1 - .39, 1.07, ax1, side_y1 - .10, 1.1325), "accent")
    for i in range(2):
        y = side_y0 + .12 + i * .48
        box("side-kicker-clamp-%d" % i, (sx0, y, .25, sx1, y + .125, .3125), "metal")

    # Broad unequal top shoulders leave a genuinely backed recessed service lane.
    box("broad-top-shoulder", (lo + .125, back + .1875, height - .390, left + .125, front - .125, height - .125), "primary", .020)
    box("offset-top-shoulder", (right - .125, back + .4375, height - .390, hi - .125, front - .3125, height - .25), "primary", .020)
    box("rear-joined-service-spine", (left + .110, body_back - .030, height - .390, right - .110, body_back + .180, height), "trim", .018)
    box("top-closed-backing", (left + .15, body_back + .22, height - .380, right - .15, body_front - .20, height - .350), "dark")
    for i in range(3):
        y = body_back + .30 + i * .22
        box("top-coarse-fin-%d" % i, (left + .21, y, height - .355, divider - .05, y + .085, height - .275), "metal")
    box("top-offset-access-cover", (divider + .025, body_back + .25, height - .360, right - .20, body_front - .22, height - .285), "accent", .012)
    box("top-forward-unequal-access", (left + .175, body_back + .95, height - .360, divider - .05, body_front - .24, height - .245), "primary", .012)
    box("top-access-latch", (left + .225, body_front - .35, height - .250, divider - .10, body_front - .29, height - .225), "metal")
    box("top-spine-service-band", (left + .15, body_back - .035, height - .205, divider - .075, body_back - .020, height - .1425), "metal")

    merged = bmesh.new()
    for _, data in parts:
        merged.from_mesh(data)
        bpy.data.meshes.remove(data)
    bmesh.ops.recalc_face_normals(merged, faces=list(merged.faces))
    data = bpy.data.meshes.new("GEO-" + name + "-r020")
    merged.to_mesh(data)
    merged.free()
    data.update()
    uv = data.uv_layers.new(name="authored-surface")
    for face in data.polygons:
        axis = max(range(3), key=lambda i: abs(face.normal[i]))
        u, v = (axis + 1) % 3, (axis + 2) % 3
        for li in face.loop_indices:
            p = data.vertices[data.loops[li].vertex_index].co
            uv.data[li].uv = (p[u], p[v])
    object_ = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(object_)
    for mat in mats:
        data.materials.append(mat)
    root = bpy.data.objects.new("component." + name, None)
    bpy.context.collection.objects.link(root)
    old_root = next(n for n in old["nodes"] if n.get("name") == "component." + name)
    for key, value in old_root["extras"].items():
        root[key] = value
    root["proposalRevision"] = "r020"
    root["originalAssetSha256"] = profile["sha256"]
    object_.parent = root
    for node in old["nodes"]:
        if not node.get("name", "").startswith("port."):
            continue
        port = bpy.data.objects.new(node["name"], None)
        bpy.context.collection.objects.link(port)
        px, py, pz = node["translation"]
        port.location = (px, -pz, py)
        port.parent = root
        for key, value in node["extras"].items():
            port[key] = value
    bpy.ops.object.select_all(action="SELECT")
    bpy.context.view_layer.objects.active = object_
    out = ROOT / "assets/runtime/ship-visual/r002/equipment-r020"
    source = ROOT / "assets/source/ship-reference/r002/equipment-r020"
    out.mkdir(parents=True, exist_ok=True)
    source.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(source / (name + ".blend")), compress=True, check_existing=False)
    target = out / (name + ".glb")
    bpy.ops.export_scene.gltf(filepath=str(target), export_format="GLB", export_apply=True, export_extras=True, export_yup=True, export_cameras=False, export_lights=False, export_animations=False, export_materials="EXPORT")
    data.calc_loop_triangles()
    assert len(data.loop_triangles) <= 1200, "Candidate reactor triangle ceiling exceeded"
    bounds = [min(v.co[i] for v in data.vertices) for i in range(3)] + [max(v.co[i] for v in data.vertices) for i in range(3)]
    gltf_bounds = [bounds[0], bounds[2], -bounds[4], bounds[3], bounds[5], -bounds[1]]
    assert all(abs(a - b) < 1e-6 for a, b in zip(gltf_bounds, profile["bounds"])), gltf_bounds
    meta = {"id": name, "status": "proposal", "revision": "r020", "kind": "component", "frame": "interior", "bounds": gltf_bounds, "source": str((source / (name + ".blend")).relative_to(ROOT)), "url": "/assets/ship-visual/r002/equipment-r020/" + name + ".glb", "sha256": hashlib.sha256(target.read_bytes()).hexdigest(), "bytes": target.stat().st_size, "oldAssetSha256": profile["sha256"], "semanticGroups": list(SLOTS), "triangles": len(data.loop_triangles), "emissiveAreaM2": 0, "front": "Blender +Y / glTF -Z", "nearServiceSide": side, "actualPlacement": {"anchor": profile["anchor"], "quarterTurns": profile["quarterTurns"]}, "frontBayDepthM": .35, "sideBayDepthM": .375, "baseContact": {"z": 0, "blenderBoundsXY": [lo + .0275, back + .0275, hi - .0275, front - .0275], "baseOuterBoundsXY": [lo, back, hi, front]}, "parts": [label for label, _ in parts]}
    (out / (name + "-source.json")).write_text(json.dumps(meta, indent=2) + "\n")
    print(json.dumps(meta))


if __name__ == "__main__":
    for name, profile in PROFILES.items():
        build(name, profile)
