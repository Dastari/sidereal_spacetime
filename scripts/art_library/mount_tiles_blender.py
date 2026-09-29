"""Author the r002 roof mount tiles; all dimensions are metres, +Y is boresight.

Rebuild source and bundle (Blender 4.3, headless):
  nice -n 15 blender -b --factory-startup --python-exit-code 1 -t 2 \
    -P scripts/art_library/mount_tiles_blender.py -- --manifest
Optional --evidence DIR renders the Federation contact sheet and component fit.
No textures, external services or live assets are modified. The editable source
contains seven origin-centred meshes with live bevels; export evaluates bevels.
The annular bearing is intentionally polygonal; all box boundaries are 1/16 m.
"""

import argparse
import hashlib
import os
import json
import math
import struct
import sys
from pathlib import Path

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
from ship_kit_export import slot_materials  # noqa: E402

T = 1 / 16
SPECS = {**{f"mount.fixed.{s}": (n, 0.25) for s, n in
            (("sm", 1), ("md", 2), ("lg", 3), ("xl", 4))},
         **{f"mount.turret.{s}": (n, 0.375) for s, n in
            (("md", 2), ("lg", 3), ("xl", 4))}}
SOURCE = ROOT / "assets/source/ship-kit/r002/mount_tiles.blend"
BUNDLE = ROOT / "assets/runtime/ship-kit/r002/mount-tiles.glb"
MANIFEST = BUNDLE.with_name("manifest.json")
SCRATCH = Path(os.environ.get("SIDEREAL_SCRATCH", ROOT / ".runtime")) / "mount-tiles-scratch"
# Canonical kit slot order (ship-kit.ts SHIP_KIT_SLOTS); manifest slot lists follow it.
SLOTS = ["primary", "secondary", "accent", "trim", "metal", "dark", "emit_a", "emit_b", "glass"]


class Mesh:
    """Disconnected, closed brick islands in one editable mesh per kit node."""

    def __init__(self, name, materials):
        self.name, self.materials = name, materials
        self.vertices, self.faces, self.slots = [], [], []

    def add(self, vertices, faces, slots):
        start = len(self.vertices)
        self.vertices.extend(vertices)
        self.faces.extend(tuple(start + v for v in f) for f in faces)
        self.slots.extend([slots] * len(faces) if isinstance(slots, str) else slots)

    def box(self, x0, y0, z0, x1, y1, z1, slot):
        self.add([(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
                  (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)],
                 [(3, 2, 1, 0), (4, 5, 6, 7), (0, 1, 5, 4),
                  (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], slot)

    def arrow(self, y, z, width):
        # Solid chevron pointing +Y; a shallow island below the interface plane.
        outline = [(-width, y), (0, y + 2*T), (width, y),
                   (width-T, y-T), (0, y+T), (-width+T, y-T)]
        # Outline is clockwise, so lower face follows it and upper reverses it.
        count = len(outline)
        vertices = [(x, yy, zz) for zz in (z-T, z) for x, yy in outline]
        faces = [tuple(range(count)), tuple(reversed(range(count, 2*count)))]
        faces += [(i, i+count, (i+1) % count+count, (i+1) % count)
                  for i in range(count)]
        self.add(vertices, faces, "accent")

    def bearing(self, n):
        sides = 16 if n == 2 else 24
        outer, inner = n/2 - 2*T, max(3*T, n/2 - 9*T)
        # Counter-clockwise r/z section: inner wall, bottom, luminous joint,
        # upper race, flat annular interface. No cap or tick above z=0.375.
        profile = [(inner, 2*T), (outer-T, 2*T), (outer-T, 3*T),
                   (outer, 3*T), (outer, 4*T), (outer-T, 4*T),
                   (outer-T, 6*T), (inner, 6*T)]
        face_slots = ["dark", "dark", "metal", "emit_a", "metal", "metal", "metal", "dark"]
        verts = [(r*math.cos(2*math.pi*i/sides), r*math.sin(2*math.pi*i/sides), z)
                 for r, z in profile for i in range(sides)]
        faces, slots = [], []
        for j in range(len(profile)):
            for i in range(sides):
                k, jj = (i+1) % sides, (j+1) % len(profile)
                faces.append((j*sides+i, j*sides+k, jj*sides+k, jj*sides+i))
                slots.append(face_slots[j])
        self.add(verts, faces, slots)

    def object(self):
        mesh = bpy.data.meshes.new(self.name)
        mesh.from_pydata(self.vertices, [], self.faces)
        mesh.update()
        for material in self.materials:
            mesh.materials.append(material)
        indices = {m.name: i for i, m in enumerate(self.materials)}
        for face, slot in zip(mesh.polygons, self.slots):
            face.material_index = indices[slot]
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        bevel = obj.modifiers.new("Studless edge chamfer (live)", "BEVEL")
        bevel.width, bevel.segments = 0.008, 1
        bevel.limit_method, bevel.angle_limit = "ANGLE", math.radians(30)
        bevel.harden_normals, bevel.use_clamp_overlap = True, True
        obj["boresight"] = "+Y"
        obj["interface_z_m"] = SPECS[self.name][1]
        obj["footprint_m"] = SPECS[self.name][0]
        return obj


def fixed(name, n, materials):
    p, h = Mesh(name, materials), n/2
    p.box(-h, -h, 0, h, h, T, "dark")
    p.box(-h+T, -h+T, T, h-T, h-4*T, 3*T, "metal")
    # Broad, uninterrupted flat mounting plate; cassettes and fasteners sit
    # lower along its perimeter, leaving the centre clear for component bases.
    p.box(-h+2*T, -h+2*T, 3*T, h-2*T, h-4*T, 4*T, "secondary")
    for side in (-1, 1):
        x0, x1 = (-h, -h+2*T) if side == -1 else (h-2*T, h)
        for i in range(n):
            y0, y1 = -h+i+T, -h+i+1-T
            p.box(x0, y0, T, x1, y1, 3*T, "primary" if i % 2 == 0 else "secondary")
        for y in (-h+T, h-3*T):
            p.box(x0, y, 3*T, x1, y+2*T, 4*T, "metal")
        if n >= 3:
            for i in range(n-1):
                y = -h+i+1
                p.box(x0, y-T, T, x1, y, 2*T, "trim")
    p.box(-h+2*T, h-4*T, T, h-2*T, h-T, 2*T, "trim")
    p.arrow(h-3*T, 3*T, 2*T if n == 1 else 3*T)
    p.box(-h+3*T, h-T, T, h-3*T, h, 2*T, "emit_a")
    # Rear service blocks increase in number with footprint, not in scale.
    for i in range(n):
        x = -h+i+0.5
        p.box(x-2*T, -h, T, x+2*T, -h+T, 2*T, "trim")
    return p.object()


def turret(name, n, materials):
    p, h = Mesh(name, materials), n/2
    p.box(-h, -h, 0, h, h, T, "dark")
    p.box(-h+T, -h+T, T, h-T, h-T, 2*T, "secondary")
    p.bearing(n)
    for xsign in (-1, 1):
        for ysign in (-1, 1):
            x, y = xsign*(h-2*T), ysign*(h-2*T)
            p.box(x-T, y-T, T, x+T, y+T, 3*T, "primary")
    # Radial alignment ticks are on the square apron, below the bearing top.
    for sign in (-1, 1):
        for i in range(n):
            x = -h+0.5+i
            y = sign*(h-T)
            p.box(x, y-T, T, x+T, y, 2*T, "trim")
    p.arrow(h-3*T, 3*T, 3*T)
    return p.object()


def bundle_entries(bundle=BUNDLE):
    data = Path(bundle).read_bytes()
    doc = json.loads(data[20:20+struct.unpack_from("<I", data, 12)[0]])
    sha = hashlib.sha256(data).hexdigest()
    entries = {}
    for node in doc["nodes"]:
        if "mesh" not in node:
            continue
        primitives = doc["meshes"][node["mesh"]]["primitives"]
        positions = [doc["accessors"][p["attributes"]["POSITION"]] for p in primitives]
        lo = [min(a["min"][i] for a in positions) for i in range(3)]
        hi = [max(a["max"][i] for a in positions) for i in range(3)]
        entries[node["name"]] = dict(
            bounds=[round(v/T, 6) for v in (lo[0], -hi[2], lo[1], hi[0], -lo[2], hi[1])],
            decals=[], file=Path(bundle).name, node=node["name"], sha256=sha,
            slots=sorted({doc["materials"][p["material"]]["name"] for p in primitives}, key=SLOTS.index),
            triangles=sum(doc["accessors"][p["indices"]]["count"]//3 for p in primitives),
            voxelAligned=False)
    return entries


def render_setup():
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 96
    # The project's Blender 4.3 CPU build has no OpenImageDenoise support.
    scene.cycles.use_denoising = False
    scene.render.threads_mode, scene.render.threads = "FIXED", 2
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.world.color = (0.16, 0.16, 0.16)
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.exposure = 0.6
    for name, location, power, size in [("Key", (0, 3, 12), 2200, 9),
                                         ("Fill", (-8, -3, 8), 1600, 8),
                                         ("Rim", (5, -6, 6), 1800, 6)]:
        light = bpy.data.lights.new(name, "AREA")
        light.energy, light.shape, light.size = power, "DISK", size
        obj = bpy.data.objects.new(name, light)
        scene.collection.objects.link(obj)
        obj.location = location
        obj.rotation_euler = (-obj.location).to_track_quat("-Z", "Y").to_euler()
    camera = bpy.data.objects.new("Evidence camera", bpy.data.cameras.new("Evidence camera"))
    scene.collection.objects.link(camera)
    camera.data.type = "ORTHO"
    scene.camera = camera
    return scene, camera


def shot(scene, camera, path, target, direction, scale, width=1440, height=960):
    camera.location = Vector(target) + Vector(direction)
    camera.rotation_euler = (Vector(target)-camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.ortho_scale = scale
    scene.render.resolution_x, scene.render.resolution_y = width, height
    scene.render.resolution_percentage = 100
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def evidence(objects, directory, materials):
    """Render after saving/exporting, so presentation transforms never enter assets."""
    directory.mkdir(parents=True, exist_ok=True)
    scene, camera = render_setup()
    # One camera-facing board: every tile at the same physical scale, shown
    # twice, front and rear. Text and assembly are evidence-only scene objects.
    right = Vector((-1, 0, 0))
    up = Vector((0, -0.78, 0.625)).normalized()
    normal = right.cross(up)
    clones = []
    label_material = bpy.data.materials.new("Evidence typography")
    label_material.use_nodes = True
    shader = label_material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (0.8, 0.85, 0.9, 1)
    shader.inputs["Emission Color"].default_value = (0.8, 0.85, 0.9, 1)
    shader.inputs["Emission Strength"].default_value = 1.0

    def label(text, position, size):
        curve = bpy.data.curves.new(text, "FONT")
        curve.body, curve.size, curve.align_x = text, size, "CENTER"
        obj = bpy.data.objects.new(text, curve)
        scene.collection.objects.link(obj)
        obj.location = position
        obj.rotation_euler = normal.to_track_quat("Z", "Y").to_euler()
        curve.materials.append(label_material)
        clones.append(obj)

    for i, (name, obj) in enumerate(objects.items()):
        row, column = (0, i) if i < 4 else (1, i-4)
        centre = right*((column-1.5)*6.0) + up*(5.6-row*11)
        for turn, vertical in ((math.radians(25), 2.15), (math.radians(205), -2.15)):
            copy = obj.copy()
            copy.data = obj.data
            scene.collection.objects.link(copy)
            copy.location = centre + up*vertical
            copy.rotation_euler.z = turn
            clones.append(copy)
        label(name, centre-up*4.9, 0.32)
        label(f"{SPECS[name][0]} m / interface {SPECS[name][1]:g} m", centre-up*5.3, 0.22)
        obj.hide_render = True
    label("R002 / ROOF MOUNTS / FEDERATION", up*12, 0.46)
    label("Front (+Y) and rear isometrics / same physical scale / proposal", up*11.3, 0.29)
    shot(scene, camera, directory/"mount-tiles-contact.png", (0, 0, 0), normal*30, 26, 1600, 1600)
    for obj in clones:
        bpy.data.objects.remove(obj, do_unlink=True)
    # Imported authored components retain their original dimensions and slots.
    for name, component, x in [("mount.turret.md", "autocannon.sm", -2.3),
                                ("mount.fixed.md", "laser-cannon.md", 2.3)]:
        obj = objects[name]
        obj.hide_render, obj.location.x = False, x
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=str(ROOT / f"assets/art-library/ship-components/r004/glb/{component}.glb"))
        imported = set(bpy.data.objects)-before
        meshes = [o for o in imported if o.type == "MESH"]
        bpy.context.view_layer.update()
        bottom = min((o.matrix_world @ v.co).z for o in meshes for v in o.data.vertices)
        for root in (o for o in imported if o.parent not in imported):
            root.location += Vector((x, 0, SPECS[name][1]-bottom))
        for mesh in meshes:
            for slot in mesh.material_slots:
                canonical = slot.material.name.split(".")[0]
                if canonical.startswith("slot"):
                    canonical = canonical.split("_", 1)[1]
                slot.material = next(m for m in materials if m.name == canonical)
        print(f"FIT {component}: bottom {bottom:.6f} -> interface {SPECS[name][1]}")
    # From +Y the +X assembly projects to the left of the -X assembly.
    label("MD FIXED + LASER-CANNON.MD       MD TURRET + AUTOCANNON.SM", (0, 2.0, -0.12), 0.23)
    shot(scene, camera, directory/"mount-tiles-component-fit.png", (0, 0, 0.7), (5, 10, 9), 10.2, 1440, 960)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", action="store_true", help="merge only the seven mount entries")
    parser.add_argument("--evidence", type=Path, help="optional evidence directory (never saved in source)")
    args = parser.parse_args(sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else [])
    SCRATCH.mkdir(parents=True, exist_ok=True)
    bpy.context.preferences.filepaths.temporary_directory = str(SCRATCH)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.context.preferences.filepaths.use_auto_save_temporary_files = False
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for material in list(bpy.data.materials):
        bpy.data.materials.remove(material)
    materials = slot_materials("federation")
    objects = {name: (fixed if ".fixed." in name else turret)(name, n, materials)
               for name, (n, _) in SPECS.items()}
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1.0
    for obj in objects.values():
        obj.select_set(True)
    bpy.context.view_layer.objects.active = next(iter(objects.values()))
    SOURCE.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE), compress=True)
    bpy.ops.export_scene.gltf(filepath=str(BUNDLE), export_format="GLB", use_selection=True,
                             export_apply=True, export_yup=True, export_cameras=False,
                             export_lights=False, export_materials="EXPORT", export_normals=True,
                             export_texcoords=False, export_tangents=False, export_extras=False,
                             export_animations=False, export_skins=False, export_morph=False)
    entries = bundle_entries()
    for name, entry in entries.items():
        print(name, entry["triangles"], "triangles", entry["bounds"], entry["slots"])
        assert entry["triangles"] <= (1500 if SPECS[name][0] <= 2 else 3000)
    assert BUNDLE.stat().st_size < 1_000_000
    if args.manifest:
        document = json.loads(MANIFEST.read_text())
        document["pieces"].update(entries)
        MANIFEST.write_text(json.dumps(document, indent=1, sort_keys=True)+"\n")
    if args.evidence:
        evidence(objects, args.evidence, materials)


if __name__ == "__main__":
    main()
