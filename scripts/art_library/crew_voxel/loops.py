"""Animated review loops (MP4 + GIF) at game camera and 3/4 close-up, with the pixel face driven by
each action's expression track and locomotion travelling over a checker floor (planting check).

Upper-body layering is reproduced exactly as the runtime does it: the base clip plays full body and
an upper-body-only copy of the aim/hold clip REPLACES the upper bones on top (Blender NLA).
"""
import os
import subprocess

import bpy

import render
from render import aim, review_props, show_only, still, visible_meshes

FACE_IMAGES = {}
UPPER = {"spine", "chest", "neck", "head", "shoulder.L", "shoulder.R", "upper_arm.L", "upper_arm.R",
         "forearm.L", "forearm.R", "hand.L", "hand.R"}


def face_images(out):
    """Compose every expression (+ blink frames) with the default atlas; load as Blender images."""
    import face_atlas
    atlas, layers = face_atlas.build_atlas()
    d = f"{out}/face_states"
    os.makedirs(d, exist_ok=True)
    states = {e: {"expression": e} for e in atlas["expressions"]}
    for e in atlas["expressions"]:
        states[f"{e}+half"] = {"expression": e, "blinkEyes": "half"}
        states[f"{e}+closed"] = {"expression": e, "blinkEyes": "closed"}
    for key, st in states.items():
        p = f"{d}/{key}.png"
        face_atlas.write_png(p, face_atlas.compose(atlas, layers, st))
        img = bpy.data.images.load(p)
        img.name = f"face.{key}"
        FACE_IMAGES[key] = img


def set_face(key):
    m = bpy.data.materials.get("crew.face")
    if m and key in FACE_IMAGES:
        m.node_tree.nodes["face_texture"].image = FACE_IMAGES[key]


def face_at(track, f):
    """Expression track -> face state key at frame f; 'blink' cues give half/closed/half over 3 frames."""
    expr, blink = "neutral", None
    for fr, e in sorted(track):
        if e == "blink":
            if fr <= f < fr + 3:
                blink = ("half", "closed", "half")[f - fr]
        elif fr <= f:
            expr = e
    return f"{expr}+{blink}" if blink else expr


def upper_only(action_name):
    src = bpy.data.actions[action_name]
    act = src.copy()
    act.name = f"{action_name}.upper"
    for fc in list(act.fcurves):
        bone = fc.data_path.split('"')[1] if '"' in fc.data_path else ""
        if bone not in UPPER:
            act.fcurves.remove(fc)
    return act


def checker_floor():
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
    fl = bpy.context.active_object
    fl.name = "review_checker"
    m = bpy.data.materials.new("review_checker")
    m.use_nodes = True
    nt = m.node_tree
    ck = nt.nodes.new("ShaderNodeTexChecker")
    ck.inputs["Scale"].default_value = 80.0          # 0.5 m tiles on the 40 m plane
    ck.inputs["Color1"].default_value = (0.03, 0.05, 0.10, 1)
    ck.inputs["Color2"].default_value = (0.07, 0.10, 0.19, 1)
    nt.links.new(ck.outputs["Color"], nt.nodes["Principled BSDF"].inputs["Base Color"])
    nt.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.6
    fl.data.materials.append(m)
    return fl


# (clip name, base action, upper action or None, prop, cycles, locomotion)
LOOPS = [
    ("idle", "idle", None, None, 1, False),
    ("walk", "walk", None, None, 3, True),
    ("run", "run", None, None, 3, True),
    ("aim_walk", "walk", "aim_rifle", "prop.rifle", 3, True),
    ("armed_run", "run", "idle_armed", "prop.rifle", 3, True),
    ("emote_happy", "emote_happy", None, None, 1, False),
    ("emote_sad", "emote_sad", None, None, 1, False),
    ("emote_angry", "emote_angry", None, None, 1, False),
    ("emote_confused", "emote_confused", None, None, 1, False),
    ("wave", "wave", None, None, 1, False),
    ("cheer", "cheer", None, None, 1, False),
    ("hurt", "hurt", None, None, 1, False),
    ("death", "death", None, None, 1, False),
]
VIEWS = (("game", -40, 48, (320, 320), 2.8), ("close", -35, 10, (360, 480), 2.3))
STEP = 2              # render every 2nd frame, play at 12 fps (same real-time speed)


def loops(out, arm, bodies, mats, actions, args, variant="male", only=None):
    sc = bpy.context.scene
    cam = sc.camera or render.setup(sc, samples=12, res=(420, 420))
    sc.eevee.taa_render_samples = max(4, min(args.samples, 8))
    for attr in ("use_raytracing", "use_fast_gi"):          # loops: speed over GI (shared busy host)
        if hasattr(sc.eevee, attr):
            setattr(sc.eevee, attr, False)
    props = review_props(arm, mats)
    face_images(out)
    everything = [o for o in sc.objects if o.type == "MESH" and o.name.startswith("GEO-")]
    show_only(visible_meshes(bodies[variant]), everything)
    floor = checker_floor()
    disc = bpy.data.objects.get("review_floor")
    if disc:
        disc.hide_render = True
    meta = {m["name"]: m for m in actions}
    rd = f"{out}/loops"
    os.makedirs(rd, exist_ok=True)
    made = []
    arm.animation_data_create()
    ad = arm.animation_data
    for name, base, upper, prop, cycles, loco in LOOPS:
        if only and name not in only:
            continue
        if base not in bpy.data.actions or (upper and upper not in bpy.data.actions):
            continue
        ad.action = None
        for t in list(ad.nla_tracks):
            ad.nla_tracks.remove(t)
        b = bpy.data.actions[base]
        f0, f1 = int(b.frame_range[0]), int(b.frame_range[1])
        span = f1 - f0
        st = ad.nla_tracks.new().strips.new(base, f0, b)
        st.repeat = cycles
        if upper:
            u = upper_only(upper)
            s2 = ad.nla_tracks.new().strips.new(u.name, f0, u)
            s2.repeat = max(1.0, cycles * span / max(1, u.frame_range[1] - u.frame_range[0]))
            s2.blend_type = "REPLACE"
        for pn, po in props.items():
            po.hide_render = pn != prop
        speed = meta.get(base, {}).get("nominalSpeed", 0) if loco else 0
        total = span * cycles
        track = meta.get(upper or base, {}).get("expressionTrack", [[0, "neutral"]])
        for view, az, el, res, ortho in VIEWS:
            sc.render.resolution_x, sc.render.resolution_y = res
            fd = f"{rd}/{name}_{view}"
            os.makedirs(fd, exist_ok=True)
            for k, f in enumerate(range(f0, f0 + total, STEP)):
                sc.frame_set(f)
                t = (f - f0) / 24.0
                arm.location = (0, speed * t, 0)
                set_face(face_at(track, (f - f0) % span if not upper else (f - f0)))
                aim(cam, az, elev=el, dist=10, target=(0, speed * t, 0.8), ortho=ortho)
                still(f"{fd}/{k:04d}.png")
            mp4, gif = f"{rd}/{name}_{view}.mp4", f"{rd}/{name}_{view}.gif"
            subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-framerate", str(24 // STEP), "-i", f"{fd}/%04d.png",
                            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", mp4], check=True)
            subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-framerate", str(24 // STEP), "-i", f"{fd}/%04d.png", "-vf",
                            "split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse", gif], check=True)
            made += [mp4, gif]
        arm.location = (0, 0, 0)
        for t in list(ad.nla_tracks):
            ad.nla_tracks.remove(t)
    set_face("neutral")
    floor.hide_render = True
    if disc:
        disc.hide_render = False
    return made
