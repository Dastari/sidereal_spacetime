"""Proposal RCS art, r001. Blender 4.3, metres, Z-up face mount at y=0.

Run from any directory (one Blender process; TMPDIR must be disk backed)::

  TMPDIR=/root/sidereal-scratch/flight-ifcs/codex nice -n 15 blender \
    -b --factory-startup -t 2 --python-exit-code 1 \
    -P scripts/art_library/rcs_quad_blender.py -- --build --render

The existing kit has a combined source, so this component override has its own
editable source/rcs_quad.blend. Rebuild with this script, not the legacy RCS box
builder. Only six measured fields in each RCS manifest row are replaced.
Box extents are on the 1/16 m lattice; bevels and hollow bell profiles are finish
geometry. Exact nozzle centres follow the brief (Y does not scale by 0.6).
GLB local +Y is the exhaust axis; Blender local +Z converts to that axis.
The optional comparison reads the original runtime rcs.md.glb saved before the
first build as /root/sidereal-scratch/flight-ifcs/codex/rcs-old-md.glb.
"""
import argparse
import hashlib
import json
import math
import shutil
import struct
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / "assets/art-library/ship-components/r004"
RUNTIME = ROOT / "assets/runtime/ship-components/r004"
SCRATCH = Path("/root/sidereal-scratch/flight-ifcs/codex")
EVIDENCE = Path("/root/sidereal-progress/flight-ifcs/art")
SOURCE = ART / "source/rcs_quad.blend"
SLOTS = ["slot0_primary", "slot1_secondary", "slot4_metal", "slot5_dark", "slot6_emit_a"]


def glb_json(path):
    data = path.read_bytes()
    length = struct.unpack_from("<I", data, 12)[0]
    return json.loads(data[20:20 + length])


def clear():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for mat in list(bpy.data.materials):
        bpy.data.materials.remove(mat)


def materials():
    # Import the exact existing slot materials, including their emissive strength.
    bpy.ops.import_scene.gltf(filepath=str(RUNTIME / "thrust-block.sm.glb"))
    result = {name: bpy.data.materials[name] for name in SLOTS}
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    return result


def box(name, lo, hi, slot, mats, objects, bevel=True):
    assert all(abs(v * 16 - round(v * 16)) < 1e-6 for v in (*lo, *hi))
    bpy.ops.mesh.primitive_cube_add(size=1, location=(Vector(lo) + Vector(hi)) / 2)
    ob = bpy.context.object
    ob.name = "GEO-" + name
    ob.dimensions = Vector(hi) - Vector(lo)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    ob.data.materials.append(mats[slot])
    if bevel:
        mod = ob.modifiers.new("Brick edge", "BEVEL")
        mod.width = 0.009 if name.startswith("sm") else 0.014
        mod.segments = 1
        bpy.ops.object.modifier_apply(modifier=mod.name)
    objects.append(ob)


def bell(name, exit_point, direction, length, radius, mats, objects):
    """Eight-sided square bell: dark taper, bright lip, cavity, thin hot throat.

    Five profile bands plus a rear cap: 86 triangles. No coplanar overlays or
    luminous filled discs. The nozzle datum lies at the actual lip plane.
    """
    d = Vector(direction)
    u = d.cross(Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((0, 1, 0))).normalized()
    v = d.cross(u)
    corners = [(-1, -.5), (-.5, -1), (.5, -1), (1, -.5),
               (1, .5), (.5, 1), (-.5, 1), (-1, .5)]
    # Outer root -> lip -> inner lip -> inner throat -> emissive annulus -> cap.
    profile = [(-length, .55), (0, 1), (0, .78),
               (-length * .72, .40), (-length * .72, .31),
               (-length * .88, .31)]
    verts = [Vector(exit_point) + d * depth + radius * r * (u * x + v * y)
             for depth, r in profile for x, y in corners]
    faces, indices = [], []
    for band, slot in enumerate([1, 2, 3, 4, 3]):
        for i in range(8):
            j = (i + 1) % 8
            faces.append((band * 8 + i, band * 8 + j, (band + 1) * 8 + j, (band + 1) * 8 + i))
            indices.append(slot)
    faces.append(tuple(range(40, 48)))
    indices.append(3)
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    ob = bpy.data.objects.new("GEO-" + name, mesh)
    bpy.context.collection.objects.link(ob)
    for slot in SLOTS:
        mesh.materials.append(mats[slot])
    for polygon, slot in zip(mesh.polygons, indices):
        polygon.material_index = slot
    objects.append(ob)


def nozzle_table(size):
    extent, y, depth = (.375, -.35, .5) if size == "sm" else (.625, -.7, 1.)
    return {"out": ((0, -depth, 0), (0, -1, 0)),
            "xpos": ((extent, y, 0), (1, 0, 0)),
            "xneg": ((-extent, y, 0), (-1, 0, 0)),
            "zpos": ((0, y, extent), (0, 0, 1)),
            "zneg": ((0, y, -extent), (0, 0, -1))}


def build(size, mats, original):
    objects = []
    sm = size == "sm"
    # Whole brick islands; details consume geometry only where the silhouette benefits.
    if sm:
        blocks = [("mount", (-.25, -.0625, -.25), (.25, 0, .25), 1),
                  ("pylon", (-.125, -.25, -.125), (.125, -.0625, .125), 1),
                  ("head", (-.1875, -.375, -.1875), (.1875, -.25, .1875), 0),
                  ("service-cap", (-.125, -.25, .125), (.125, -.125, .1875), 0)]
    else:
        blocks = [("mount", (-.4375, -.125, -.4375), (.4375, 0, .4375), 1),
                  ("pylon", (-.1875, -.5, -.1875), (.1875, -.125, .1875), 1),
                  ("head", (-.3125, -.8125, -.3125), (.3125, -.5, .3125), 0),
                  ("service-cap", (-.1875, -.4375, .1875), (.1875, -.1875, .25), 0),
                  ("service-cap-bottom", (-.1875, -.4375, -.25), (.1875, -.1875, -.1875), 0),
                  ("collar", (-.25, -.5625, -.25), (.25, -.5, .25), 2)]
    for name, lo, hi, slot in blocks:
        box(size + "-" + name, lo, hi, SLOTS[slot], mats, objects)
    # Four square captive fasteners, one grid texel each, recessed into mount corners.
    r = .1875 if sm else .375
    front = -.125 if sm else -.1875
    for x in (-r, r - .0625):
        for z in (-r, r - .0625):
            box(size + "-bolt", (x, front, z), (x + .0625, front + .0625, z + .0625),
                "slot4_metal", mats, objects, bevel=False)
    # A contrasting flush seam across the service cap (one brick wide).
    if not sm:
        box(size + "-seam", (-.125, -.3125, .25), (.125, -.25, .3125),
            "slot1_secondary", mats, objects)
    for name, (point, direction) in nozzle_table(size).items():
        length = (.125 if name == "out" else .1875) if sm else (.1875 if name == "out" else .3125)
        bell(size + "-bell-" + name, point, direction, length, .125 if sm else .1875, mats, objects)
    boxes = len(blocks) + 4 + (0 if sm else 1)
    bpy.ops.object.select_all(action="DESELECT")
    for ob in objects:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    geo = bpy.context.object
    geo.name = "rcs." + size
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    # Join leaves repeated material slots; canonicalize into one primitive per slot.
    old = [mat.name for mat in geo.data.materials]
    slots = [SLOTS.index(old[p.material_index]) for p in geo.data.polygons]
    geo.data.materials.clear()
    for name in SLOTS:
        geo.data.materials.append(mats[name])
    for p, slot in zip(geo.data.polygons, slots):
        p.material_index = slot
    root = bpy.data.objects.new("component.rcs." + size, None)
    bpy.context.collection.objects.link(root)
    root_data = next(n for n in original["nodes"] if n["name"] == root.name)
    for key, value in root_data.get("extras", {}).items():
        root[key] = value
    root["artRevision"] = "rcs-quad-r001"
    root["artSource"] = str(SOURCE.relative_to(ROOT))
    root["artBuilder"] = str(Path(__file__).resolve().relative_to(ROOT))
    root["boxCount"] = boxes
    root["nozzleAxis"] = "glTF local +Y; Blender local +Z"
    geo.parent = root
    for node in original["nodes"]:
        if not node.get("name", "").startswith("port."):
            continue
        ob = bpy.data.objects.new(node["name"], None)
        bpy.context.collection.objects.link(ob)
        x, y, z = node.get("translation", [0, 0, 0])
        ob.location = (x, -z, y)
        for key, value in node.get("extras", {}).items():
            ob[key] = value
        ob.parent = root
    for name, (point, direction) in nozzle_table(size).items():
        ob = bpy.data.objects.new("nozzle." + name, None)
        bpy.context.collection.objects.link(ob)
        ob.location = point
        ob.rotation_mode = "QUATERNION"
        ob.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(Vector(direction))
        ob.empty_display_type = "ARROWS"
        ob.empty_display_size = .1
        ob.parent = root
    bpy.ops.object.select_all(action="DESELECT")
    for ob in [root, *root.children]:
        ob.select_set(True)
    out = RUNTIME / (geo.name + ".glb")
    bpy.ops.export_scene.gltf(filepath=str(out), export_format="GLB", use_selection=True,
                             export_yup=True, export_extras=True, export_cameras=False,
                             export_lights=False, export_texcoords=False)
    shutil.copyfile(out, ART / "glb" / out.name)
    model = glb_json(out)
    stats = {"sha256": hashlib.sha256(out.read_bytes()).hexdigest(), "bytes": out.stat().st_size,
             "boxes": boxes, "triangles": sum(model["accessors"][p["indices"]]["count"] // 3
                 for m in model["meshes"] for p in m["primitives"]),
             "vertices": sum(model["accessors"][p["attributes"]["POSITION"]]["count"]
                 for m in model["meshes"] for p in m["primitives"]),
             "materialSlotsUsed": sorted(m["name"] for m in model["materials"])}
    print(json.dumps({"component": geo.name, **stats}))
    # Avoid Blender suffixing the next export's nozzle names.
    for ob in root.children:
        if ob.type == "EMPTY":
            ob.name = size + "." + ob.name
    collection = bpy.data.collections.new("RCS " + size.upper() + " | proposal r001")
    bpy.context.scene.collection.children.link(collection)
    for ob in [root, *root.children]:
        for coll in list(ob.users_collection):
            coll.objects.unlink(ob)
        collection.objects.link(ob)
    collection.hide_render = True
    return stats


def setup_render():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 1000
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs[0].default_value = (.025, .035, .06, 1)
    scene.world.node_tree.nodes["Background"].inputs[1].default_value = .4
    scene.view_settings.view_transform = "AgX"
    for name, position, energy, color, size in [
        ("Key", (2, -4, 5), 600, (.84, .9, 1), 4),
        ("Fill", (-3, -1, 2), 400, (.5, .7, 1), 3),
        ("Rim", (1, 3, 3), 700, (1, .75, .5), 3)]:
        data = bpy.data.lights.new(name, "AREA")
        data.energy, data.color, data.shape, data.size = energy, color, "DISK", size
        ob = bpy.data.objects.new(name, data)
        scene.collection.objects.link(ob)
        ob.location = position
        ob.rotation_euler = (Vector((0, -.4, 0)) - ob.location).to_track_quat("-Z", "Y").to_euler()
    data = bpy.data.cameras.new("Review camera")
    camera = bpy.data.objects.new("Review camera", data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    data.type = "ORTHO"
    return camera


def render(path, size, view, dest):
    clear()
    bpy.ops.import_scene.gltf(filepath=str(path))
    camera = setup_render()
    target = Vector((0, -.25 if size == "sm" else -.5, 0))
    camera.location = target + Vector((2.8, -4, 3) if view == "three-quarter" else (0, 0, 5))
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.ortho_scale = 1.12 if size == "sm" else 1.88
    bpy.context.scene.render.filepath = str(dest)
    bpy.ops.render.render(write_still=True)


def render_comparison():
    """Same camera, lights, material palette and scale for the old/new medium."""
    clear()
    camera = setup_render()
    target = Vector((0, -.5, 0))
    camera.location = target + Vector((2.8, -4, 3))
    rotation = (target - camera.location).to_track_quat("-Z", "Y")
    camera.rotation_euler = rotation.to_euler()
    camera.data.ortho_scale = 3.9
    right, up = rotation @ Vector((1, 0, 0)), rotation @ Vector((0, 1, 0))
    for side, path, label in [(-1, SCRATCH / "rcs-old-md.glb", "OLD / 80 triangles"),
                              (1, RUNTIME / "rcs.md.glb", "PROPOSAL / 786 triangles")]:
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=str(path))
        imported = set(bpy.data.objects) - before
        for ob in imported:
            if ob.parent not in imported:
                ob.location += right * side * .95
        data = bpy.data.curves.new(label, "FONT")
        data.body, data.align_x, data.size = label, "CENTER", .09
        ob = bpy.data.objects.new(label, data)
        bpy.context.scene.collection.objects.link(ob)
        ob.rotation_euler = rotation.to_euler()
        ob.location = target + right * side * .95 + up * .91
    bpy.context.scene.render.resolution_y = 750
    bpy.context.scene.render.filepath = str(EVIDENCE / "rcs-quad-r001-md-old-vs-new.png")
    bpy.ops.render.render(write_still=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--build", action="store_true")
    parser.add_argument("--render", action="store_true")
    parser.add_argument("--compare", action="store_true", help="only rerender the old/new comparison")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    assert bpy.app.version[:2] == (4, 3), "Use Blender 4.3"
    SCRATCH.mkdir(parents=True, exist_ok=True)
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    bpy.context.preferences.filepaths.temporary_directory = str(SCRATCH)
    bpy.context.preferences.filepaths.save_version = 0
    if args.build:
        originals = {s: glb_json(RUNTIME / ("rcs." + s + ".glb")) for s in ("sm", "md")}
        clear()
        mats = materials()
        stats = {"rcs." + s: build(s, mats, originals[s]) for s in ("sm", "md")}
        # Keep small visible on opening; medium is an independently editable collection.
        bpy.data.collections["RCS MD | proposal r001"].hide_viewport = True
        bpy.data.collections["RCS SM | proposal r001"].hide_render = False
        bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE), compress=True)
        for folder in (RUNTIME, ART):
            path = folder / "manifest.json"
            manifest = json.loads(path.read_text())
            for row in manifest["components"]:
                if row["id"] in stats:
                    row.update(stats[row["id"]])
            path.write_text(json.dumps(manifest, indent=1) + "\n")
    if args.render:
        for size in ("sm", "md"):
            for view in ("three-quarter", "top"):
                render(RUNTIME / ("rcs." + size + ".glb"), size, view,
                       EVIDENCE / ("rcs-quad-r001-" + size + "-" + view + ".png"))
    if args.render or args.compare:
        if (SCRATCH / "rcs-old-md.glb").exists():
            render_comparison()
        else:
            print("Comparison needs the pre-edit runtime GLB at", SCRATCH / "rcs-old-md.glb")
    print("RCS quad proposal complete")


if __name__ == "__main__":
    main()
