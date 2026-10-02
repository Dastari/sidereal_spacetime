"""Build the ship-specific authored Wayfarer maneuver cluster in Blender.

Blender frame: X along the mounting face, -Y outward, Z up, face plane Y=0.
glTF frame: X along the face, +Z outward, Y up. Three real mouths retain
catalogue @4 MD exit positions; this producer never changes flight statistics.
Outputs are explicitly selected by --out/--source/--evidence. The study is read
only and supplies the exact engine material definitions through --palette-glb.
"""

import argparse
import hashlib
import json
import math
import struct
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

EXITS = {
    "out": ((0.0, -1.0, 0.0), (0.0, -1.0, 0.0)),
    "xneg": ((-0.625, -0.7, 0.0), (-1.0, 0.0, 0.0)),
    "xpos": ((0.625, -0.7, 0.0), (1.0, 0.0, 0.0)),
}
SLOTS = ("primary", "secondary", "accent", "trim", "metal", "rubber", "rcs_lens")


def glb_document(path):
    raw = path.read_bytes()
    assert raw[:4] == b"glTF" and struct.unpack_from("<I", raw, 8)[0] == len(raw)
    size = struct.unpack_from("<I", raw, 12)[0]
    return json.loads(raw[20:20 + size]), raw


def materials(palette_glb):
    model, raw = glb_document(palette_glb)
    definitions = {m["name"]: m for m in model["materials"]}
    result = {}
    for name in SLOTS:
        definition = definitions["emit_a" if name == "rcs_lens" else name]
        pbr = definition["pbrMetallicRoughness"]
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        p = mat.node_tree.nodes.get("Principled BSDF")
        p.inputs["Base Color"].default_value = pbr["baseColorFactor"]
        p.inputs["Metallic"].default_value = pbr.get("metallicFactor", 1)
        p.inputs["Roughness"].default_value = pbr.get("roughnessFactor", 1)
        cc = definition.get("extensions", {}).get("KHR_materials_clearcoat", {})
        p.inputs["Coat Weight"].default_value = cc.get("clearcoatFactor", 0)
        p.inputs["Coat Roughness"].default_value = cc.get("clearcoatRoughnessFactor", 0)
        mat.diffuse_color = tuple(pbr["baseColorFactor"])
        mat["sr_palette"] = name
        mat["sr_palette_kind"] = "derived" if name == "rcs_lens" else "slot"
        mat["sr_family"] = {
            "primary": "plastic-light", "secondary": "plastic-dark",
            "accent": "plastic-colour", "trim": "plastic-dark",
            "metal": "metal", "rubber": "rubber", "rcs_lens": "emissive",
        }[name]
        if name == "rcs_lens":
            p.inputs["Emission Color"].default_value = (*definition["emissiveFactor"], 1)
            p.inputs["Emission Strength"].default_value = 0.65
        result[name] = mat
    return result, hashlib.sha256(raw).hexdigest()


def box(name, lo, hi, material, objects, bevel=0.018):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(Vector(lo) + Vector(hi)) / 2)
    obj = bpy.context.object
    obj.name = "GEO-" + name
    obj.dimensions = Vector(hi) - Vector(lo)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    if bevel:
        mod = obj.modifiers.new("Molded edge", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        bpy.ops.object.modifier_apply(modifier=mod.name)
        normal = obj.modifiers.new("Face-weighted normals", "WEIGHTED_NORMAL")
        normal.keep_sharp = True
        bpy.ops.object.modifier_apply(modifier=normal.name)
    objects.append(obj)
    return obj


def frame(direction):
    d = Vector(direction)
    u = d.cross(Vector((0, 0, 1))).normalized()
    return d, u, d.cross(u)


def bell(name, point, direction, mats, objects):
    """Recessed octagonal throat, rolled lip and a finite inset blue lens."""
    d, u, v = frame(direction)
    radius = 0.14
    profile = [(-0.19, 0.82), (-0.035, 1.0), (0.0, 1.0),
               (0.0, 0.79), (-0.09, 0.62), (-0.12, 0.62), (-0.125, 0.43)]
    vertices = [Vector(point) + d * depth + radius * r * (
        u * math.cos(math.pi / 8 + 2 * math.pi * k / 8)
        + v * math.sin(math.pi / 8 + 2 * math.pi * k / 8))
        for depth, r in profile for k in range(8)]
    faces, slots = [], []
    for band, slot in enumerate(("secondary", "metal", "metal", "rubber", "rcs_lens", "rubber")):
        for k in range(8):
            faces.append((band * 8 + k, band * 8 + (k + 1) % 8,
                          (band + 1) * 8 + (k + 1) % 8, (band + 1) * 8 + k))
            slots.append(SLOTS.index(slot))
    faces.append(tuple(range(48, 56)))
    slots.append(SLOTS.index("rubber"))
    mesh = bpy.data.meshes.new("GEO-mouth-" + name)
    mesh.from_pydata(vertices, [], faces)
    for slot in SLOTS:
        mesh.materials.append(mats[slot])
    for polygon, slot in zip(mesh.polygons, slots):
        polygon.material_index = slot
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new("GEO-mouth-" + name, mesh)
    bpy.context.collection.objects.link(obj)
    objects.append(obj)


def build(mats):
    objects = []
    box("mount-saddle", (-0.5625, -0.105, -0.5625), (0.5625, 0, 0.5625), mats["primary"], objects, 0.025)
    box("mount-gasket", (-0.43, -0.18, -0.43), (0.43, -0.085, 0.43), mats["rubber"], objects)
    box("neck-collar", (-0.28, -0.48, -0.28), (0.28, -0.12, 0.28), mats["accent"], objects, 0.023)
    head = box("navy-plenum", (-0.465, -0.89, -0.39), (0.465, -0.40, 0.39), mats["secondary"], objects, 0.025)
    # Cut actual openings through the casing, rather than laying a glowing disc on a cap.
    for name, (point, direction) in EXITS.items():
        d = Vector(direction)
        bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.115, depth=0.50,
                                           location=Vector(point) - d * 0.18)
        cutter = bpy.context.object
        cutter.name = "GEO-cutter-" + name
        cutter.rotation_mode = "QUATERNION"
        cutter.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d)
        bpy.context.view_layer.objects.active = head
        cut = head.modifiers.new("Open mouth " + name, "BOOLEAN")
        cut.operation, cut.solver, cut.object = "DIFFERENCE", "EXACT", cutter
        bpy.ops.object.modifier_apply(modifier=cut.name)
        bpy.data.objects.remove(cutter, do_unlink=True)
        bell(name, point, direction, mats, objects)
    for z0, z1, label in ((0.37, 0.51, "top"), (-0.51, -0.37, "bottom")):
        for side in (-1, 1):
            x0, x1 = (0.24, 0.485) if side > 0 else (-0.485, -0.24)
            box("pale-shoulder-" + label + str(side), (x0, -0.875, z0),
                (x1, -0.375, z1), mats["primary"], objects, 0.025)
        box("shoulder-dark-bed-" + label, (-0.23, -0.86, z0),
            (0.23, -0.395, z1), mats["rubber"], objects, 0.012)
    box("red-service-cap", (-0.21, -0.635, 0.46), (0.21, -0.365, 0.555), mats["accent"], objects, 0.02)
    # A deep louvre below the shoulder top; open cells retain dark backing.
    for k in range(5):
        y = -0.84 + k * 0.04
        box("louvre-" + str(k), (-0.19, y, 0.475), (0.19, y + 0.018, 0.520), mats["trim"], objects, 0.006)
    for side in (-1, 1):
        x = side * 0.34
        box("feed-" + str(side), (x - 0.032, -0.445, -0.075),
            (x + 0.032, -0.105, 0.005), mats["metal"], objects, 0.008)
        box("saddle-fastener-" + str(side), (x - 0.03, -0.118, 0.44),
            (x + 0.03, -0.099, 0.50), mats["trim"], objects, 0.004)
    # Retain the separate authored parts in the editable source.
    root = bpy.data.objects.new("component.wayfarer.rcs.md", None)
    bpy.context.collection.objects.link(root)
    root["artRevision"] = "wayfarer-rcs-r001"
    root["nozzleAxis"] = "Blender -Y outward; glTF +Z outward; MD catalogue @4"
    root["staticPlume"] = False
    for obj in objects:
        obj.parent = root
    for name, (point, direction) in EXITS.items():
        obj = bpy.data.objects.new("nozzle." + name, None)
        bpy.context.collection.objects.link(obj)
        obj.location = point
        obj.rotation_mode = "QUATERNION"
        obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(Vector(direction))
        obj["exhaustAxisBlender"] = list(direction)
        obj["functionalPlanarNozzle"] = True
        obj.parent = root
    return root, objects


def export(root, objects, path):
    """Consolidate only a copy, keeping source components independently editable."""
    copies = []
    for obj in objects:
        copy = obj.copy()
        copy.data = obj.data.copy()
        bpy.context.collection.objects.link(copy)
        copy.parent = None
        copies.append(copy)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in copies:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = copies[0]
    bpy.ops.object.join()
    geo = bpy.context.object
    geo.name = "GEO-wayfarer-rcs-md"
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    # Collapse duplicate material slots into precisely one primitive per material.
    old = [m.name for m in geo.data.materials]
    indices = [SLOTS.index(old[p.material_index]) for p in geo.data.polygons]
    mats = {m.name: m for m in geo.data.materials}
    geo.data.materials.clear()
    for name in SLOTS:
        geo.data.materials.append(mats[name])
    for polygon, index in zip(geo.data.polygons, indices):
        polygon.material_index = index
    geo.parent = root
    bpy.ops.object.select_all(action="DESELECT")
    for obj in (root, geo, *(o for o in root.children if o.type == "EMPTY")):
        obj.select_set(True)
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True,
                             export_yup=True, export_extras=True, export_cameras=False,
                             export_lights=False, export_texcoords=False)
    bpy.data.objects.remove(geo, do_unlink=True)


def audit(path, palette_sha):
    model, raw = glb_document(path)
    primitives = [p for m in model["meshes"] for p in m["primitives"]]
    positions = [model["accessors"][p["attributes"]["POSITION"]] for p in primitives]
    lo = [min(p["min"][a] for p in positions) for a in range(3)]
    hi = [max(p["max"][a] for p in positions) for a in range(3)]
    mouths = {n["name"]: n for n in model["nodes"] if n["name"].startswith("nozzle.")}
    assert len(mouths) == 3
    for name, (point, direction) in EXITS.items():
        expected = [point[0], point[2], -point[1]]
        assert max(abs(a - b) for a, b in zip(mouths["nozzle." + name]["translation"], expected)) < 1e-7
    assert len(primitives) == len(SLOTS) == len(model["materials"])
    assert lo[0] >= -0.625001 and hi[0] <= 0.625001
    assert lo[1] >= -0.625001 and hi[1] <= 0.625001
    assert lo[2] >= -1e-7 and hi[2] <= 1.000001
    assert not model.get("images") and not model.get("textures")
    return {"revision": "wayfarer-rcs-r001", "sha256": hashlib.sha256(raw).hexdigest(),
            "bytes": len(raw), "sourcePaletteGlbSha256": palette_sha,
            "triangles": sum(model["accessors"][p["indices"]]["count"] // 3 for p in primitives),
            "vertices": sum(p["count"] for p in positions), "primitives": len(primitives),
            "materials": [m["name"] for m in model["materials"]], "boundsGltf": [lo, hi],
            "nozzles": [{"name": name, "exitBlender": point, "exhaustBlender": direction,
                         "exitGltf": [point[0], point[2], -point[1]],
                         "exhaustGltf": [direction[0], direction[2], -direction[1]]}
                        for name, (point, direction) in EXITS.items()],
            "staticPlume": False, "nozzleEmissionStrength": 0.65}


def render(path, evidence):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(path))
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x, scene.render.resolution_y = 1100, 850
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0.025, 0.03, 0.055, 1)
    scene.world.node_tree.nodes["Background"].inputs[1].default_value = 0.35
    scene.use_nodes = False  # Deliberately no compositor bloom in the geometry review.
    scene.view_settings.view_transform = "AgX"
    target = Vector((0, -0.5, 0))
    for name, pos, energy, colour, size in (
        ("Key", (2, -4, 4), 500, (0.84, 0.9, 1), 3),
        ("Fill", (-3, -2, 1), 220, (0.65, 0.75, 1), 3),
        ("Rim", (0, 2, 3), 600, (1, 0.83, 0.63), 2),
    ):
        data = bpy.data.lights.new(name, "AREA")
        data.energy, data.color, data.size = energy, colour, size
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        obj.location = pos
        obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()
    data = bpy.data.cameras.new("Review camera")
    camera = bpy.data.objects.new("Review camera", data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    data.type, data.ortho_scale = "ORTHO", 1.9
    camera.location = target + Vector((2.6, -4, 2.8))
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = str(evidence / "wayfarer-rcs-r001-no-bloom.png")
    bpy.ops.render.render(write_still=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--palette-glb", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--render-only", action="store_true")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    args.evidence.mkdir(parents=True, exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    if args.render_only:
        render(args.out, args.evidence)
        return
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    mats, palette_sha = materials(args.palette_glb)
    root, objects = build(mats)
    root["sourcePaletteGlbSha256"] = palette_sha
    args.source.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(args.source), compress=True)
    export(root, objects, args.out)
    receipt = audit(args.out, palette_sha)
    receipt["blenderVersion"] = bpy.app.version_string
    receipt["sourceSha256"] = hashlib.sha256(args.source.read_bytes()).hexdigest()
    receipt["builderSha256"] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    (args.evidence / "wayfarer-rcs-r001-provenance.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps(receipt))


if __name__ == "__main__":
    main()
