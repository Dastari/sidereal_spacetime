"""Proposal RCS art, r003. Blender 4.3, metres, Z-up face mount at y=0.

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
first build as /root/sidereal-scratch/flight-ifcs/codex/rcs-old-md.glb, plus
rcs-r002-md.glb captured from commit 0edf3c4c before building r003.
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
import bmesh
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / "assets/art-library/ship-components/r004"
RUNTIME = ROOT / "assets/runtime/ship-components/r004"
SCRATCH = Path("/root/sidereal-scratch/flight-ifcs/codex")
EVIDENCE = Path("/root/sidereal-progress/flight-ifcs/art")
SOURCE = ART / "source/rcs_quad.blend"
SLOTS = ["slot0_primary", "slot1_secondary", "slot4_metal", "slot5_dark", "slot6_emit_a", "slot2_accent"]


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


def frame(direction):
    d = Vector(direction)
    u = d.cross(Vector((0, 0, 1)) if abs(d.z) < .9 else Vector((0, 1, 0))).normalized()
    return d, u, d.cross(u)


def mesh_object(name, verts, faces, slots, mats, objects):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    for slot in SLOTS:
        mesh.materials.append(mats[slot])
    for polygon, slot in zip(mesh.polygons, slots):
        polygon.material_index = SLOTS.index(slot)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    ob = bpy.data.objects.new("GEO-" + name, mesh)
    bpy.context.collection.objects.link(ob)
    objects.append(ob)
    return ob


CORNERS = [(-1, -.5), (-.5, -1), (.5, -1), (1, -.5),
           (1, .5), (.5, 1), (-.5, 1), (-1, .5)]


def bell(name, exit_point, direction, length, radius, mats, objects):
    """Four octagonal bands and a dark cap: 70 triangles, genuinely hollow."""
    d, u, v = frame(direction)
    throat_depth = min(length * .4, radius * .45)
    profile = [(-length, .72), (0, 1), (0, .79),
               (-throat_depth, .66), (-throat_depth, .42)]
    verts = [Vector(exit_point) + d * depth + radius * r * (u * x + v * y)
             for depth, r in profile for x, y in CORNERS]
    faces, slots = [], []
    for band, slot in enumerate(["slot4_metal", "slot4_metal", "slot5_dark", "slot6_emit_a"]):
        for i in range(8):
            j = (i + 1) % 8
            faces.append((band * 8 + i, band * 8 + j, (band + 1) * 8 + j, (band + 1) * 8 + i))
            slots.append(slot)
    faces.append(tuple(range(32, 40)))
    slots.append("slot5_dark")
    mesh_object(name, verts, faces, slots, mats, objects)


def socket_head(size, lo, hi, specs, mats, objects):
    """Replace five box faces with open square sockets, leaving no hidden cap.

    The square-to-octagon transitions join the buried bell roots. Face rings
    use eight triangles each; no boolean slivers or overlapping solid faces.
    """
    box(size + "-head", lo, hi, "slot1_secondary", mats, objects)
    ob = objects.pop()
    verts = [v.co.copy() + ob.location for v in ob.data.vertices]
    faces, slots = [], []
    for poly in ob.data.polygons:
        match = next((spec for spec in specs if poly.normal.dot(Vector(spec[1])) > .999), None)
        if match is None:
            faces.append(tuple(poly.vertices))
            slots.append("slot1_secondary")
            continue
        point, direction, length, radius = match
        d, u, v = frame(direction)
        # A square metal socket inset from the face, down to the bell root.
        face_depth = verts[poly.vertices[0]].dot(d)
        centre = Vector(point) + d * (face_depth - Vector(point).dot(d))
        square = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
        # Keep the enlarged small tangential socket inside the bevelled face.
        # Its bell root remains buried; the mouth can overhang the socket.
        clearance = min(abs((verts[i] - centre).dot(basis))
                        for i in poly.vertices for basis in (u, v))
        half = min(radius * 1.06, clearance - .001)
        inner = []
        for x, y in square:
            inner.append(len(verts))
            verts.append(centre + half * (u*x + v*y))
        # The flat face of a bevelled box has four corners.
        groups = []
        face_centre = sum((verts[i] for i in poly.vertices), Vector()) / len(poly.vertices)
        for x, y in square:
            ids = [i for i in poly.vertices
                   if (verts[i]-face_centre).dot(u)*x > 0 and (verts[i]-face_centre).dot(v)*y > 0]
            assert len(ids) == 1
            groups.append(ids[0])
        for k in range(4):
            faces.append((groups[k], groups[(k+1) % 4], inner[(k+1) % 4], inner[k]))
            slots.append("slot1_secondary")
        root = len(verts)
        verts.extend(Vector(point) - d*length + radius*.72*(u*x+v*y) for x,y in CORNERS)
        # CORNERS starts on the left-bottom edge; bridge each square corner
        # to its two corresponding octagon vertices, then connect the sides.
        for k in range(4):
            a, b = root + 2*k, root + 2*k+1
            c = root + (2*k+2) % 8
            faces.extend([(inner[k], a, b), (inner[k], b, c, inner[(k+1) % 4])])
            slots.extend(["slot4_metal"]*2)
    bpy.data.objects.remove(ob, do_unlink=True)
    mesh_object(size + "-socket-head", verts, faces, slots, mats, objects)



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
    # The head and collar use whole grid dimensions, including the small
    # head's 5/8 m width (nearest symmetric grid size to the requested 75%).
    if sm:
        blocks = [("mount", (-.3125, -.0625, -.3125), (.3125, 0, .3125), 0),
                  ("collar-base", (-.25, -.1875, -.25), (.25, -.0625, .25), 0),
                  ("collar-neck", (-.1875, -.25, -.1875), (.1875, -.125, .1875), 5)]
        lo, hi = (-.3125, -.4375, -.3125), (.3125, -.1875, .3125)
    else:
        blocks = [("mount", (-.5625, -.125, -.5625), (.5625, 0, .5625), 0),
                  ("collar-base", (-.4375, -.3125, -.4375), (.4375, -.0625, .4375), 0),
                  ("collar-neck", (-.375, -.5, -.375), (.375, -.25, .375), 5)]
        lo, hi = (-.5, -.9375, -.5), (.5, -.4375, .5)
    for name, low, high, slot in blocks:
        box(size + "-" + name, low, high, SLOTS[slot], mats, objects)
    specs = []
    for name, (point, direction) in nozzle_table(size).items():
        length = (.1 if name == "out" else .125) if sm else (.125 if name == "out" else .25)
        radius = (.08125 if sm else .121875) if name == "out" else (.06875 if sm else .105)
        radius *= 1.25  # r003: every exit diameter is 25% larger than r002.
        specs.append((point, direction, length, radius))
        bell(size + "-bell-" + name, point, direction, length, radius, mats, objects)
    socket_head(size, lo, hi, specs, mats, objects)
    # Two square propellant feeds bridge plate and head alongside the collar.
    r, back, front = (.25, -.0625, -.25) if sm else (.4375, -.125, -.5)
    for sign in (-1, 1):
        x = r if sign > 0 else -r-.0625
        box(size + "-feed", (x, front, -.0625), (x+.0625, back, 0),
            "slot4_metal", mats, objects, bevel=False)
    # Surface inlays: accent on the collar and broad crimson stripes on the navy head.
    # These are finite-area faces, offset from the supporting surface to avoid z-fighting.
    verts, faces, slots = [], [], []
    for x0, x1, y0, y1, z, slot in [
        (-r+.0625, r-.0625, back-.03125, back-.09375, r+.001, "slot2_accent"),
        (-r+.0625, r-.0625, back-.03125, back-.09375, -r-.001, "slot2_accent"),
        (lo[0]+.04, hi[0]-.04, hi[1]-(.09375 if sm else .125), hi[1]-.03125, hi[2]+.001, "slot2_accent"),
        (lo[0]+.04, hi[0]-.04, hi[1]-(.09375 if sm else .125), hi[1]-.03125, lo[2]-.001, "slot2_accent")]:
        i = len(verts)
        verts.extend([(x0,y0,z),(x1,y0,z),(x1,y1,z),(x0,y1,z)])
        faces.append((i,i+1,i+2,i+3))
        slots.append(slot)
    mesh_object(size + "-inlays", verts, faces, slots, mats, objects)
    boxes = len(blocks) + 1 + 2
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
    root["artRevision"] = "rcs-quad-r003"
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
    collection = bpy.data.collections.new("RCS " + size.upper() + " | proposal r003")
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


def render_comparison(previous="old"):
    """Same camera, lights, material palette and scale for both revisions."""
    clear()
    camera = setup_render()
    target = Vector((0, -.5, 0))
    camera.location = target + Vector((2.8, -4, 3))
    rotation = (target - camera.location).to_track_quat("-Z", "Y")
    camera.rotation_euler = rotation.to_euler()
    camera.data.ortho_scale = 3.9
    right, up = rotation @ Vector((1, 0, 0)), rotation @ Vector((0, 1, 0))
    previous_path = SCRATCH / ("rcs-r002-md.glb" if previous == "r002" else "rcs-old-md.glb")
    def triangles(path):
        model = glb_json(path)
        return sum(model["accessors"][p["indices"]]["count"]//3 for m in model["meshes"] for p in m["primitives"])
    for side, path, label in [(-1, previous_path, previous.upper() + " / " + str(triangles(previous_path)) + " triangles"),
                              (1, RUNTIME / "rcs.md.glb", "R003 / " + str(triangles(RUNTIME / "rcs.md.glb")) + " triangles")]:
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
    bpy.context.scene.render.filepath = str(EVIDENCE / ("rcs-quad-r003-md-r002-vs-r003.png" if previous == "r002" else "rcs-quad-r003-md-old-vs-new.png"))
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
        bpy.data.collections["RCS MD | proposal r003"].hide_viewport = True
        bpy.data.collections["RCS SM | proposal r003"].hide_render = False
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
                       EVIDENCE / ("rcs-quad-r003-" + size + "-" + view + ".png"))
    if args.render or args.compare:
        if (SCRATCH / "rcs-old-md.glb").exists():
            render_comparison()
            render_comparison("r002")
        else:
            print("Comparison needs the pre-edit runtime GLB at", SCRATCH / "rcs-old-md.glb")
    print("RCS quad proposal complete")


if __name__ == "__main__":
    main()
