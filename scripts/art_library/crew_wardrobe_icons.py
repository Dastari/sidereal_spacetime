"""Inventory icons for the r006 wardrobe items (headless Blender).

    blender -b --factory-startup -P scripts/art_library/crew_wardrobe_icons.py -- \
        --items items.json --out assets/runtime/crew/wardrobe/r001/icons [--size 256]

items.json: [{id, glb, mesh, colours: {slot: "#rrggbb"}}] (the wardrobe list; see crew-wardrobe.ts).
Each icon is the item's own mesh (armour-v1 part, or the r005 body suit layer for uniforms) in its
colourway, bevelled brick materials kept, 3/4 front orthographic view on a transparent background.
"""
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
opt = {argv[i]: argv[i + 1] for i in range(0, len(argv) - 1, 2)}
items = json.loads(Path(opt["--items"]).read_text())
out = Path(opt["--out"])
size = int(opt.get("--size", 256))
out.mkdir(parents=True, exist_ok=True)


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgba(h):
    h = h.lstrip("#")
    return tuple(srgb_to_linear(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in {
        e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items} else "BLENDER_EEVEE"
    s.render.film_transparent = True
    s.render.resolution_x = s.render.resolution_y = size
    s.render.image_settings.file_format = "PNG"
    s.render.image_settings.color_mode = "RGBA"
    s.view_settings.view_transform = "Standard"
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.55, 0.58, 0.66, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.9
    s.world = world
    return s


for item in items:
    scene = reset()
    bpy.ops.import_scene.gltf(filepath=item["glb"])
    keep = [o for o in scene.objects if o.type == "MESH" and o.name.startswith(item["mesh"])]
    for o in list(scene.objects):
        if o.type == "MESH" and o not in keep:
            bpy.data.objects.remove(o, do_unlink=True)
    for o in keep:
        for slot in o.material_slots:
            m = slot.material
            name = m.name.split(".")[1] if m.name.startswith("crew.") else ""
            hexv = item["colours"].get(name)
            if hexv and m.use_nodes:
                bsdf = m.node_tree.nodes.get("Principled BSDF")
                # glTF import multiplies COLOR_0 by the base colour factor in a Mix node (B input).
                for node in m.node_tree.nodes:
                    if node.type == "MIX":
                        for socket in node.inputs:
                            if socket.name == "B" and socket.type == "RGBA":
                                socket.default_value = hex_rgba(hexv)
                if bsdf:
                    bsdf.inputs["Base Color"].default_value = hex_rgba(hexv)
                    if name == "emit":
                        bsdf.inputs["Emission Color"].default_value = hex_rgba(hexv)
                        bsdf.inputs["Emission Strength"].default_value = 1.0
    # Rest pose: the body GLB imports with its first action applied.
    for o in scene.objects:
        if o.type == "ARMATURE":
            o.data.pose_position = "REST"
            if o.animation_data:
                o.animation_data.action = None
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in keep for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    centre = (lo + hi) / 2
    extent = max((hi - lo).length, 0.05)
    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = extent * 1.05
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    # glTF import: character faces -Y in Blender (+Z glTF forward is -Y); view the front 3/4.
    yaw = math.radians(-30)
    direction = Vector((math.sin(yaw), -math.cos(yaw), 0.35)).normalized()
    cam.location = centre + direction * extent * 4
    cam.rotation_euler = (centre - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.0
    sun.rotation_euler = (math.radians(50), 0, math.radians(-35))
    scene.collection.objects.link(sun)
    scene.render.filepath = str(out / f"{item['id']}.png")
    bpy.ops.render.render(write_still=True)
    print("icon", item["id"], [o.name for o in keep])
