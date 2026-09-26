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
    sc.view_settings.view_transform, sc.view_settings.look = "Standard", "None"
    sc.view_settings.exposure, sc.view_settings.gamma = 0.0, 1.05
    sc.use_nodes = True
    ct = sc.node_tree
    ct.nodes.clear()
    rl = ct.nodes.new("CompositorNodeRLayers")
    gl = ct.nodes.new("CompositorNodeGlare")
    gl.glare_type, gl.threshold, gl.size, gl.mix = "FOG_GLOW", 0.9, 7, -0.2
    hs = ct.nodes.new("CompositorNodeHueSat")
    hs.inputs["Saturation"].default_value = 1.12
    bc = ct.nodes.new("CompositorNodeBrightContrast")
    bc.inputs["Contrast"].default_value = -2.0
    comp = ct.nodes.new("CompositorNodeComposite")
    ct.links.new(rl.outputs["Image"], gl.inputs["Image"])
    ct.links.new(gl.outputs["Image"], hs.inputs["Image"])
    ct.links.new(hs.outputs["Image"], bc.inputs["Image"])
    ct.links.new(bc.outputs["Image"], comp.inputs["Image"])
    LIGHTS.clear()
    lights = LIGHTS
    for name, energy, col, rot in (("Key", 3.2, (1.0, 0.95, 0.88), (-50, 0, -35)), ("Fill", 1.1, (0.55, 0.6, 1.0), (-60, 0, 110)),
                                   ("Rim", 2.4, (0.6, 0.45, 1.0), (60, 0, 20))):
        L = bpy.data.lights.new(name, "SUN")
        L.energy, L.color, L.angle = energy, col, math.radians(8)
        ob = bpy.data.objects.new(name, L)
        sc.collection.objects.link(ob)
        ob.rotation_euler = [math.radians(a) for a in rot]
        ob["base_rot"] = rot
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


LIGHTS = []


def aim(cam, azimuth, elev=8.0, dist=6.0, target=(0, 0, 0.93), ortho=2.25, lens=None):
    a, e = math.radians(azimuth), math.radians(elev)
    for L in LIGHTS:  # lighting rig turns with the camera, so back views are lit like front views
        rx, ry, rz = L["base_rot"]
        L.rotation_euler = (math.radians(rx), math.radians(ry), math.radians(rz) - a)
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


FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def label(img, text, out, size=22):
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", img, "-vf",
                    f"drawtext=fontfile={FONT}:text='{text}':x=12:y=10:fontsize={size}:fontcolor=0x9fd8ff",
                    out], check=True)
    return out


def review_props(arm, mats):
    """Review-only proxies (NOT exported): rifle / pistol / tool on socket.hand.R, crate, seat, ladder."""
    import voxkit
    props = {}

    def make(name, vol, parent=None, loc=(0, 0, 0)):
        me = voxkit.mesh_volume(vol, name, mats=mats)
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        if parent:
            ob.parent = bpy.data.objects[parent]
            ob.matrix_parent_inverse.identity()
        ob.location = loc
        ob.hide_render = True
        props[name] = ob
        return ob

    # grip frame: x along barrel, y left, z up; origin at grip centre. Voxels -> the Vol is authored in
    # that frame directly because the socket empty carries the frame.
    r = voxkit.Vol()
    r.box(-7, -1, 1, 16, 1, 4, "dark").box(-7, -1, -1, -3, 1, 2, "dark")        # body + stock
    r.box(16, 0, 2, 22, 1, 3, "metal").box(2, -1, 4, 8, 1, 5, "metal")          # barrel + sight rail
    r.box(-1, -1, -3, 1, 1, 1, "dark").box(3, -1, -3, 5, 1, 1, "suit_secondary")  # grip + magazine
    r.box(8, -1, -1, 11, 1, 1, "dark").box(10, -1, 1, 16, 1, 2, "accent").box(12, -1, 3, 13, 1, 4, "emit")
    make("prop.rifle", r, "socket.hand.R")
    p = voxkit.Vol()
    p.box(-2, -1, 1, 7, 1, 3, "metal").box(-1, -1, -3, 1, 1, 1, "dark").box(5, -1, 3, 6, 1, 4, "emit")
    p.box(0, -1, 3, 4, 1, 4, "accent")
    make("prop.pistol", p, "socket.hand.R")
    t = voxkit.Vol()
    t.box(-1, -1, -2, 1, 1, 2, "dark").box(1, -1, 0, 9, 1, 2, "metal").box(9, -2, -1, 11, 2, 3, "accent")
    t.box(10, -1, 3, 11, 1, 4, "emit")
    make("prop.tool", t, "socket.hand.R")
    c = voxkit.Vol()
    c.box(-6, -5, -5, 6, 5, 5, "suit_secondary").paint(-6, -5, -1, 6, 5, 1, "accent")
    make("prop.crate", c)
    s = voxkit.Vol()
    s.box(-9, -12, 0, 9, 3, 8, "dark").box(-9, -12, 8, 9, 3, 10, "suit_secondary").box(-9, -13, 10, 9, -10, 32, "suit_secondary")
    make("prop.seat", s)
    lad = voxkit.Vol()
    lad.box(-9, 8, 0, -7, 10, 72, "metal").box(7, 8, 0, 9, 10, 72, "metal")
    for z in range(3, 72, 7):
        lad.box(-7, 8, z, 7, 10, z + 1, "dark")
    make("prop.ladder", lad)
    return props


PROP_FOR = {"rifle": ["prop.rifle"], "pistol": ["prop.pistol"], "one_hand": ["prop.tool"]}


def props_for(meta):
    name = meta["name"]
    if name in ("carry_idle", "carry_walk"):
        return ["prop.crate"]
    if name in ("sit", "sit_idle"):
        return ["prop.seat"]
    if name == "climb_ladder":
        return ["prop.ladder"]
    if name in ("melee_swing",):
        return ["prop.tool"]
    return PROP_FOR.get(meta.get("grip"), [])


def contact_sheets(out, arm, bodies, actions, mats, args, variant="male", per_sheet=6, nframes=6,
                   views=(("3/4", 35, 12), ("side", 90, 6))):
    sc = bpy.context.scene
    cam = sc.camera or setup(sc, samples=8, res=(300, 420))
    sc.render.resolution_x, sc.render.resolution_y = 300, 420
    sc.eevee.taa_render_samples = max(8, min(args.samples, 16))
    props = review_props(arm, mats)
    everything = [o for o in sc.objects if o.type == "MESH" and o.name.startswith("GEO-")]
    show_only(list(bodies[variant]["meshes"].values()) + [bodies[variant]["hair"]], everything)
    rd = f"{out}/renders/anim"
    os.makedirs(rd, exist_ok=True)
    rows = []
    for meta in actions:
        act = bpy.data.actions[meta["name"]]
        arm.animation_data.action = act
        f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
        span = (f1 - f0) if meta["loop"] else (f1 - f0)
        n = nframes
        frames = [f0 + round(span * i / (n if meta["loop"] else n - 1)) for i in range(n)]
        vis = props_for(meta)
        for pn, po in props.items():
            po.hide_render = pn not in vis
        crate = props["prop.crate"]
        for vname, az, el in views:
            imgs = []
            for f in frames:
                sc.frame_set(f)
                if "prop.crate" in vis:
                    hr = arm.pose.bones["hand.R"].matrix
                    hl = arm.pose.bones["hand.L"].matrix
                    crate.location = (hr.translation + hl.translation) / 2 + Vector((0, 0, -0.03))
                    crate.rotation_euler = (0, 0, 0)
                target = (0, 0, 0.8)
                if meta.get("lying") or meta.get("endsLying") or meta.get("startsLying"):
                    target = (0, -0.2, 0.6)
                aim(cam, az, elev=el, dist=8, target=target, ortho=2.5)
                p = f"{rd}/{meta['name']}_{vname.replace('/', '')}_{f:03d}.png"
                still(p)
                imgs.append(p)
            row = f"{rd}/{meta['name']}_{vname.replace('/', '')}_row.png"
            tile(imgs, len(imgs), row)
            lab = "{}  ({} f{}{})  {}".format(meta["name"].upper(), meta["frames"], ", loop" if meta["loop"] else "",
                                              ", extra" if meta.get("extra") else "", vname)
            rows.append(label(row, lab.replace(":", ""), row.replace("_row.png", "_row_l.png")))
    arm.animation_data.action = None
    sheets = []
    per = per_sheet * len(views)
    for i in range(0, len(rows), per):
        chunk = rows[i:i + per]
        pth = f"{out}/anim_sheet_{i // per + 1:02d}.png"
        tile(chunk, 1, pth)
        sheets.append(pth)
    return sheets


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
    if "idle" in bpy.data.actions:             # present the relaxed stance, not the bind pose
        arm.animation_data_create()
        arm.animation_data.action = bpy.data.actions["idle"]
        sc.frame_set(0)
    for variant, b in bodies.items():
        show_only(list(b["meshes"].values()) + [b["hair"]], everything)
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
