"""Animated evidence for the armed layer: every class plays each baked clip side by side.

Two cameras per clip: a high 'game' camera over all classes and a 3/4 close-up on three classes.
Walking/running play in place (CHAR-BODY's gait is a treadmill cycle) over a floor grid that
scrolls at the clip's nominal speed, so any foot sliding is visible. Frames -> MP4 + GIF (ffmpeg).
Items follow socket.hand.R (or their holster before the draw grab frame) every frame; item part
clips (slide, magazine, pump, drill...) are synced to shoot/reload.
"""
import json
import math
import os
import shutil
import subprocess

import bpy
from mathutils import Matrix, Quaternion, Vector

from . import armed, blend, body_frames
from .blend import sample_track
from .fx import build_all as build_fx
from .held import clone_body, load_body, template_collection
from .items import HOLSTERS
from .render import add_lights, emission_mat, new_scene, text

SPEEDS = {"walk_armed": 0.909, "run_armed": 1.87}      # CHAR-BODY nominal speeds (m/s), refreshed from the spec
ITEM_CLIP = {"shoot": "fire", "reload": "reload"}
CLOSEUP = ["pistol", "carbine", "heavy"]


def attach_rig(body, action_name, loop, total):
    rig = body["crew_rig"]
    for t in list(rig.animation_data.nla_tracks):
        rig.animation_data.nla_tracks.remove(t)
    act = bpy.data.actions[action_name]
    strip = rig.animation_data.nla_tracks.new().strips.new(action_name, int(act.frame_range[0]), act)
    strip.extrapolation = "HOLD"
    if loop:
        strip.repeat = max(1.0, math.ceil(total / max(1, act.frame_range[1] - act.frame_range[0])) + 1)
    return act


def item_objects(root):
    return {ob.name[len(root.name) + 1:]: ob for ob in root.children}


def set_item(item, root, body, clip, f, meta_clip, base_locs):
    attached = meta_clip["attach"][min(f, len(meta_clip["attach"]) - 1)]
    if attached == "holster":
        h = body_frames.holster_local(HOLSTERS[item.meta["holster"]])
        m = body[h["socket"]].matrix_world @ Matrix.Translation(Vector(h["offset"])) @ Quaternion(h["rotationWXYZ"]).to_matrix().to_4x4()
    else:
        m = body["socket.hand.R"].matrix_world @ armed.ITEM_TO_SOCKET
    root.matrix_world = m
    anim = ITEM_CLIP.get(clip)
    parts = item_objects(root)
    for pname, part in item.parts.items():
        ob = parts.get(pname)
        if ob is None:
            continue
        keys = part.tracks.get(anim) if anim else None
        ob.location = base_locs[ob.name]
        ob.rotation_euler = (0, 0, 0)
        if keys:
            n = max(k[0] for k in keys)
            dl, dr = sample_track(keys, f % (n + 1))
            ob.location = base_locs[ob.name] + Vector(dl) * item.voxel
            ob.rotation_euler = tuple(math.radians(r) for r in dr)
    return m


def floor_grid(coll, name, width, depth):
    mat = emission_mat("armed.grid", (0.03, 0.10, 0.25), 1.0)
    base = emission_mat("armed.floor", (0.006, 0.010, 0.030), 1.0)
    me = bpy.data.meshes.new(name + ".base")
    me.from_pydata([(-width, -depth, -0.002), (width, -depth, -0.002), (width, depth, -0.002), (-width, depth, -0.002)], [], [(0, 1, 2, 3)])
    me.materials.append(base)
    coll.objects.link(bpy.data.objects.new(name + ".base", me))
    lines = bpy.data.objects.new(name, None)
    coll.objects.link(lines)
    step = 0.25
    verts, faces = [], []
    y = -depth
    while y <= depth + 1.0:
        o = len(verts)
        verts += [(-width, y - 0.006, 0), (width, y - 0.006, 0), (width, y + 0.006, 0), (-width, y + 0.006, 0)]
        faces.append((o, o + 1, o + 2, o + 3))
        y += step
    x = -width
    while x <= width:
        o = len(verts)
        verts += [(x - 0.006, -depth, 0.0005), (x + 0.006, -depth, 0.0005), (x + 0.006, depth + 1.0, 0.0005), (x - 0.006, depth + 1.0, 0.0005)]
        faces.append((o, o + 1, o + 2, o + 3))
        x += step
    gm = bpy.data.meshes.new(name + ".lines")
    gm.from_pydata(verts, [], faces)
    gm.materials.append(mat)
    g = bpy.data.objects.new(name + ".lines", gm)
    coll.objects.link(g)
    g.parent = lines
    return lines


def render_clip(o, tpl, by_id, meta, clip, classes, mode, out_dir, fx_by):
    """Render one clip for the given classes; returns the frame directory."""
    wide = mode == "game"
    res = (1280, 480) if wide else (880, 620)
    sc, cam, coll = new_scene(f"armed.{mode}", res[0], res[1], 8)
    sc.render.fps = 24
    by_cls = {m["class"] + "." + m["clip"]: m for m in meta}
    spacing = 1.05 if wide else 1.1
    figures = []
    total = 0
    for i, cls in enumerate(classes):
        m = by_cls.get(f"{cls}.{clip}")
        if not m:
            continue
        total = max(total, m["frames"] + 1)
        loc = Vector((-(i - (len(classes) - 1) / 2) * spacing, 0, 0))
        body = clone_body(tpl, coll, loc, 0, m["action"], 0, 0)
        attach_rig(body, m["action"], m["loop"], 48)
        item = by_id[m["item"]]
        root = blend.spawn(item, item.theme, Matrix.Identity(4), coll, name=f"armed.{cls}")
        base_locs = {ob.name: ob.location.copy() for ob in root.children}
        fx = None
        fx_id = item.meta["fx"].get("fire") if clip == "shoot" else None
        if clip == "shoot" and item.animation_set == "tool":
            fx_id = item.meta["fx"].get("use")
        if fx_id:
            fx = blend.spawn_fx(fx_by[fx_id], Matrix.Identity(4), coll, name=f"armed.fx.{cls}")
        figures.append((cls, m, body, item, root, base_locs, fx, loc))
        label = text(coll, cls.upper(), (loc.x, loc.y + 0.45, 0.01), 0.1 if wide else 0.08)
        label.rotation_euler = (0, 0, math.radians(180))
    if clip in ("idle_armed", "aim"):
        total, step = min(total, 48), 3
    elif clip == "shoot":
        total, step = 12, 1
    else:
        total, step = max(total, 14), 1
    grid = floor_grid(coll, "armed.floor", 8.0, 4.0)
    speed = SPEEDS.get(clip, 0.0)
    if wide:
        cam.data.type, cam.data.lens, cam.data.sensor_fit = "PERSP", 40, "HORIZONTAL"
        cam.location = (0.0, 11.5, 8.4)
        cam.rotation_euler = (math.radians(55), 0, math.radians(180))
    else:
        cam.data.type, cam.data.lens, cam.data.sensor_fit = "PERSP", 50, "HORIZONTAL"
        cam.location = (-2.6, 4.6, 2.3)
        cam.rotation_euler = (math.radians(74), 0, math.radians(210))
    for ob in list(sc.collection.objects):
        if ob.type == "LIGHT":
            bpy.data.objects.remove(ob, do_unlink=True)
    add_lights(sc, "armed", tilt=20, yaw=180)
    title = text(coll, f"{clip.replace('_', ' ').upper()}  ·  CHAR-BODY r004 rig + CHAR-WEAPONS armed layer (support-hand IK per frame)",
                 (0, -0.2, 2.35 if wide else 2.05), 0.09 if wide else 0.07, colour=(0.3, 0.8, 1.0))
    title.rotation_euler = (math.radians(90), 0, math.radians(180))
    frame_dir = os.path.join(out_dir, f"{mode}_{clip}")
    shutil.rmtree(frame_dir, ignore_errors=True)
    os.makedirs(frame_dir)
    for n, f in enumerate(range(0, total, step)):
        sc.frame_set(f)
        bpy.context.view_layer.update()
        grid.location = (0, -((speed * f / 24.0) % 0.25) if speed else 0, 0)
        for cls, m, body, item, root, base_locs, fx, loc in figures:
            local = f % (m["frames"] + 1) if m["loop"] else min(f, m["frames"])
            mi = set_item(item, root, body, clip, local, m, base_locs)
            if fx is not None:
                sock = "muzzle" if "muzzle" in item.sockets else "emitter"
                show = local in (1, 2) if item.animation_set != "tool" else True
                anchor = mi @ Vector(item.to_metres(item.sockets[sock]["position"]))
                fx.matrix_world = Matrix.Translation(anchor) @ mi.to_3x3().to_4x4() @ Matrix.Scale(1.0 if show else 1e-4, 4)
        sc.render.filepath = os.path.join(frame_dir, f"{n:04d}.png")
        bpy.ops.render.render(write_still=True)
    return frame_dir


def encode(frame_dir, out_base, loops=2, fps=24):
    mp4 = out_base + ".mp4"
    gif = out_base + ".gif"
    pattern = os.path.join(frame_dir, "%04d.png")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-stream_loop", str(loops - 1), "-framerate", str(fps), "-i", pattern,
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", mp4], check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", str(fps), "-i", pattern, "-vf",
                    f"fps={min(fps, 12)},scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160[p];[b][p]paletteuse=dither=bayer",
                    "-loop", "0", gif], check=True)
    return mp4, gif


def export_actions(o, rig, meta):
    """Baked armed clips as a skeleton-only GLB (one glTF animation per '<class>.<clip>' NLA track)."""
    rig.animation_data_create()
    for m in meta:
        tr = rig.animation_data.nla_tracks.new()
        tr.name = m["action"]
        tr.strips.new(m["action"], int(bpy.data.actions[m["action"]].frame_range[0]), bpy.data.actions[m["action"]])
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    os.makedirs(o.out, exist_ok=True)
    path = os.path.join(o.out, "armed-actions.glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_animations=True,
                              export_animation_mode="NLA_TRACKS", export_yup=True, export_cameras=False, export_lights=False)
    for tr in list(rig.animation_data.nla_tracks):
        rig.animation_data.nla_tracks.remove(tr)
    slim = [{k: v for k, v in m.items() if k != "attach"} | {"grabFrame": m["grabFrame"],
             "attachHolsterFrames": [i for i, a in enumerate(m["attach"]) if a == "holster"]} for m in meta]
    with open(os.path.join(o.out, "armed-actions.json"), "w") as fh:
        json.dump({"schema": "sidereal.crew.armed-actions/1", "revision": "r001", "rig": f"crew_rig (CHAR-BODY {body_frames.BODY_SPEC_REVISION}, spec_version 2)",
                   "note": "Baked on CHAR-BODY's pose library; support hand solved onto each class item's support socket every frame.",
                   "classes": [{"class": c, "item": i, "family": f} for c, i, f in armed.CLASSES], "clips": slim}, fh, indent=1)
        fh.write("\n")
    return path


def run(o, items, by_id):
    tpl = load_body(o.body)
    template_collection(tpl)
    rig, meta = armed.bake_all(o, by_id, tpl["crew_rig"])
    export_actions(o, rig, meta)
    if o.no_armed_render:
        return
    fx_by = {f.id: f for f in build_fx()}
    out = os.path.join(o.renders, "armed")
    os.makedirs(out, exist_ok=True)
    classes = [c for c, _, _ in armed.CLASSES]
    clips = [c for c in armed.CLIPS if not o.armed_clips or c in o.armed_clips.split(",")]
    videos = []
    for clip in clips:
        modes = [("game", classes)] + ([("closeup", CLOSEUP)] if clip in ("walk_armed", "run_armed", "aim", "shoot", "reload", "draw") else [])
        for mode, cls_list in modes:
            d = render_clip(o, tpl, by_id, meta, clip, cls_list, mode, out, fx_by)
            mp4, gif = encode(d, os.path.join(out, f"{mode}_{clip}"), loops=3 if clip in ("walk_armed", "run_armed", "shoot") else 1,
                              fps=8 if clip in ("idle_armed", "aim") else 24)
            shutil.rmtree(d, ignore_errors=True)
            videos.append({"clip": clip, "camera": mode, "mp4": os.path.basename(mp4), "gif": os.path.basename(gif)})
            print(f"[armed] rendered {mode}_{clip}")
    with open(os.path.join(out, "armed_clips.json"), "w") as fh:
        json.dump({"clips": meta, "videos": videos}, fh, indent=1)
