"""Review renders: turnarounds, comparisons, animation contact sheets (EEVEE, headless)."""
import math
import os
import subprocess

import bpy
from mathutils import Vector

VIEWS = {  # name -> camera azimuth (degrees, 0 = camera in front of the character at +Y)
    "front": 0, "front-right": 45, "right": 90, "back-right": 135, "back": 180,
    "back-left": 225, "left": 270, "front-left": 315,
}


def setup(sc, samples=32, res=(640, 900)):
    sc.render.engine = "BLENDER_EEVEE_NEXT"
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.film_transparent = False
    sc.eevee.taa_render_samples = samples
    for attr, val in (("use_shadows", True), ("use_raytracing", True), ("use_fast_gi", True)):
        if hasattr(sc.eevee, attr):
            setattr(sc.eevee, attr, val)
    w = sc.world or bpy.data.worlds.new("World")
    sc.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position, ramp.color_ramp.elements[0].color = 0.0, (0.004, 0.008, 0.03, 1)
    ramp.color_ramp.elements[1].position, ramp.color_ramp.elements[1].color = 1.0, (0.03, 0.05, 0.14, 1)
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = 1.0
    wo = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(tc.outputs["Window"], sep.inputs[0])
    nt.links.new(sep.outputs["Y"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
    nt.links.new(bg.outputs[0], wo.inputs[0])
    sc.view_settings.view_transform, sc.view_settings.look = "AgX", "AgX - Base Contrast"
    sc.view_settings.exposure, sc.view_settings.gamma = 0.1, 1.0
    sc.use_nodes = True
    ct = sc.node_tree
    ct.nodes.clear()
    rl = ct.nodes.new("CompositorNodeRLayers")
    gl = ct.nodes.new("CompositorNodeGlare")
    gl.glare_type, gl.threshold, gl.size, gl.mix = "FOG_GLOW", 0.9, 7, -0.2
    hs = ct.nodes.new("CompositorNodeHueSat")
    hs.inputs["Saturation"].default_value = 1.25
    bc = ct.nodes.new("CompositorNodeBrightContrast")
    bc.inputs["Contrast"].default_value = -2.0
    comp = ct.nodes.new("CompositorNodeComposite")
    ct.links.new(rl.outputs["Image"], gl.inputs["Image"])
    ct.links.new(gl.outputs["Image"], hs.inputs["Image"])
    ct.links.new(hs.outputs["Image"], bc.inputs["Image"])
    ct.links.new(bc.outputs["Image"], comp.inputs["Image"])
    lights = []
    for name, energy, col, rot in (("Key", 3.2, (1.0, 0.95, 0.88), (-50, 0, -35)), ("Fill", 1.1, (0.55, 0.6, 1.0), (-60, 0, 110)),
                                   ("Rim", 2.4, (0.6, 0.45, 1.0), (60, 0, 20))):
        L = bpy.data.lights.new(name, "SUN")
        L.energy, L.color, L.angle = energy, col, math.radians(8)
        ob = bpy.data.objects.new(name, L)
        sc.collection.objects.link(ob)
        ob.rotation_euler = [math.radians(a) for a in rot]
        lights.append(ob)
    # floor disc with a faint glow ring (reference plinth feel)
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=0.55, depth=0.02, location=(0, 0, -0.011))
    floor = bpy.context.active_object
    floor.name = "review_floor"
    fm = bpy.data.materials.new("review_floor")
    fm.use_nodes = True
    b = fm.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (0.02, 0.03, 0.07, 1)
    b.inputs["Emission Color"].default_value = (0.1, 0.35, 1.0, 1)
    b.inputs["Emission Strength"].default_value = 0.15
    b.inputs["Roughness"].default_value = 0.4
    floor.data.materials.append(fm)
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    return cam


def aim(cam, azimuth, elev=8.0, dist=6.0, target=(0, 0, 0.93), ortho=2.25, lens=None):
    a, e = math.radians(azimuth), math.radians(elev)
    # azimuth 0: camera at +Y (in front of the character, who faces +Y)
    off = Vector((math.sin(a) * math.cos(e), math.cos(a) * math.cos(e), math.sin(e))) * dist
    cam.location = Vector(target) + off
    cam.rotation_euler = (Vector(target) - cam.location).to_track_quat("-Z", "Y").to_euler()
    if lens:
        cam.data.type, cam.data.lens = "PERSP", lens
    else:
        cam.data.type, cam.data.ortho_scale = "ORTHO", ortho


def still(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def show_only(objs_visible, all_objs):
    for o in all_objs:
        vis = o in objs_visible
        o.hide_render = not vis
        o.hide_set(not vis)


def tile(paths, cols, out, label=None):
    """ffmpeg tile of equal-size images."""
    n = len(paths)
    inputs = []
    for p in paths:
        inputs += ["-i", p]
    lay = "|".join(("+".join(["w0"] * (i % cols)) or "0") + "_" + ("+".join(["h0"] * (i // cols)) or "0") for i in range(n))
    fc = "".join(f"[{i}:v]" for i in range(n)) + f"xstack=inputs={n}:layout={lay}:fill=black[v]"
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *inputs, "-filter_complex", fc, "-map", "[v]", out], check=True)
    return out


def turnaround(out, arm, bodies, args):
    sc = bpy.context.scene
    cam = setup(sc, samples=args.samples)
    everything = [o for o in sc.objects if o.type == "MESH" and o.name.startswith("GEO-")]
    for o in sc.objects:
        if o.type == "EMPTY":
            o.hide_render = True
    arm.hide_render = True
    rd = f"{out}/renders"
    os.makedirs(rd, exist_ok=True)
    sheet = []
    for variant, (ob, hob, parts, hair) in bodies.items():
        show_only([ob, hob], everything)
        row = []
        for view in ("front", "front-right", "right", "back", "back-left"):
            aim(cam, VIEWS[view])
            p = f"{rd}/turn_{variant}_{view}.png"
            still(p)
            row.append(p)
        sheet += row
    tile(sheet, 5, f"{out}/turnaround.png")
    # hero 3/4 perspective of all three variants side by side is done by offsetting the armature copies
    return f"{out}/turnaround.png"
