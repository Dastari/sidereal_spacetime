"""Items held by the CHAR-BODY r002 (spec v2 chibi) rig in its own baked actions.

No IK and no invented poses: each figure plays one of CHAR-BODY's actions at a key frame, the item
is placed on socket.hand.R with the item->socket adapter (item +Y -> socket +X), and the support
hand error is MEASURED as the distance from socket.hand.L to the item's support socket. Items put
their support grips on the r002 grip-profile offsets, so baked two-handed actions land on them.
The measured errors are written to held_poses.json and the content holds file (nothing is hidden).
"""
import json
import math
import os

import bpy
from mathutils import Matrix, Quaternion, Vector

from . import blend, body_frames
from .fx import build_all as build_fx
from .items import HOLSTERS
from .render import add_lights, emission_mat, text

ITEM_TO_SOCKET = Matrix.Rotation(math.radians(-90), 4, "Z")     # item +Y -> socket +X
DISPLAY_YAW = 35
BODY_OBJECTS = ("crew_rig", "GEO-crew-body-male", "GEO-crew-head-male", "GEO-crew-hands-male",
                "GEO-crew-feet-male", "GEO-crew-hair-default-male")

# Default action + key frame per animation set (CHAR-BODY r002 action names, CHARACTER_SPEC v2).
SET_ACTION = {"rifle": ("aim_rifle", 12), "pistol": ("aim_pistol", 12), "tool": ("repair_loop", 6),
              "device": ("use_interact", 11), "melee": ("melee_swing", 10), "throw": ("throw", 10),
              "carry": ("carry_idle", 20)}
ITEM_ACTION = {"heavy-gun": ("idle_armed", 20), "mining-drill": ("aim_rifle", 12), "medkit": ("use_interact", 11)}

SHOWCASE = [
    ("compact-carbine", "aim_rifle", 12, None), ("rifle", "shoot_rifle", 1, "muzzle-flash"),
    ("pistol", "aim_pistol", 12, None), ("heavy-gun", "idle_armed", 20, None),
    ("compact-carbine", "reload", 18, None), ("mining-drill", "aim_rifle", 12, None),
    ("repair-tool", "repair_loop", 6, "repair-sparks"),
    ("welder", "repair_loop", 18, "repair-sparks"), ("data-pad", "use_interact", 11, None),
    ("medkit", "use_interact", 11, None), ("cargo-box", "carry_idle", 20, None),
    ("baton", "melee_swing", 10, None), ("grenade", "throw", 10, None), (None, "idle", 30, None),
]


def load_body(path):
    with bpy.data.libraries.load(path) as (src, dst):
        dst.objects = [n for n in src.objects if n in BODY_OBJECTS or n.startswith("socket.")]
        dst.actions = list(src.actions)
    return {ob.name: ob for ob in dst.objects if ob is not None}


def clone_body(tpl, coll, location, yaw, action, frame, scene_frame):
    rig = tpl["crew_rig"].copy()
    rig.data = tpl["crew_rig"].data.copy()
    coll.objects.link(rig)
    rig.hide_render = False
    rig.location, rig.rotation_euler = location, (0, 0, math.radians(yaw))
    rig.animation_data_create()
    rig.animation_data.action = None
    for t in list(rig.animation_data.nla_tracks):
        rig.animation_data.nla_tracks.remove(t)
    act = bpy.data.actions[action]
    strip = rig.animation_data.nla_tracks.new().strips.new(action, int(scene_frame - (frame - act.frame_range[0])), act)
    strip.extrapolation = "HOLD"
    out = {"crew_rig": rig}
    for name, ob in tpl.items():
        if name == "crew_rig":
            continue
        c = ob.copy()
        c.hide_render = False
        c.animation_data_clear()
        coll.objects.link(c)
        c.parent = rig
        c.parent_type, c.parent_bone = ob.parent_type, ob.parent_bone
        c.matrix_parent_inverse = ob.matrix_parent_inverse.copy()
        for md in c.modifiers:
            if md.type == "ARMATURE":
                md.object = rig
        out[name] = c
    return out


def item_clip_frame(item, anim, char_frame, char_frames):
    part_frames = [k[0] for p in item.parts.values() for k in p.tracks.get(anim, [])]
    if not part_frames:
        return None
    return round(char_frame / max(1, char_frames) * max(part_frames))


def place_item(item, body, coll, pose=None):
    m_item = body["socket.hand.R"].matrix_world @ ITEM_TO_SOCKET
    if item.animation_set == "carry" and item.meta["support_mode"] == "carry":
        # carried box: centred between both hands, oriented with the body
        r, l = body["socket.hand.R"].matrix_world.translation, body["socket.hand.L"].matrix_world.translation
        rot = body["crew_rig"].matrix_world.to_3x3().to_4x4()
        b = item.bounds()
        centre = Vector(item.to_metres(((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2)))
        m_item = Matrix.Translation((r + l) / 2 - rot.to_3x3() @ centre) @ rot
    blend.spawn(item, item.theme, m_item, coll, name=f"held.{item.id}", pose=pose)
    err = {}
    for side, sock in (("R", "grip"), ("L", "support")):
        if side == "L" and (not item.meta["two_handed"] and item.animation_set != "pistol"):
            continue
        if sock not in item.sockets:
            continue
        target = m_item @ Vector(item.to_metres(item.sockets[sock]["position"]))
        err[side] = round((body[f"socket.hand.{side}"].matrix_world.translation - target).length, 4)
        if side == "L":
            # where the baked action actually puts hand.L, in item voxels relative to the grip
            seen = m_item.inverted() @ body["socket.hand.L"].matrix_world.translation
            err["observedSupportItemVox"] = [round(v / item.voxel, 2) for v in seen]
    return m_item, err


def holstered(item_ids, by_id, body, coll):
    for iid in item_ids:
        it = by_id[iid]
        h = body_frames.holster_local(HOLSTERS[it.meta["holster"]])
        sock = body[h["socket"]]
        m = sock.matrix_world @ Matrix.Translation(Vector(h["offset"])) @ Quaternion(h["rotationWXYZ"]).to_matrix().to_4x4()
        blend.spawn(it, it.theme, m, coll, name=f"holster.{iid}")


def item_holds(tpl, coll, items, sc):
    """Measure every held item on its default action (body frame, unyawed rig)."""
    out = {}
    frame = 200
    for item in items:
        action = ITEM_ACTION.get(item.id) or SET_ACTION.get(item.animation_set)
        if not action:
            continue
        body = clone_body(tpl, coll, Vector((0, 0, -60)), 0, action[0], action[1], frame)
        sc.frame_set(frame)
        m_item, err = place_item(item, body, coll)
        m = body["crew_rig"].matrix_world.inverted() @ m_item
        out[item.id] = {"characterClip": action[0], "frame": action[1],
                        "gripPosition": [round(v, 4) for v in m.translation],
                        "rotationWXYZ": [round(v, 6) for v in m.to_quaternion()],
                        "handErrorM": err}
    return out


def run(o, items, by_id):
    from .render import new_scene, render
    tpl = load_body(o.body)
    fx_by = {f.id: f for f in build_fx()}
    keep = bpy.data.collections.new("TEMPLATE")
    bpy.context.scene.collection.children.link(keep)
    for ob in tpl.values():
        keep.objects.link(ob)
    report = {"bodySpec": "CHAR-BODY r002 (spec_version 2) crew-body.blend, male",
              "method": "CHAR-BODY baked actions at key frames; item on socket.hand.R; support error measured", "results": []}
    frame = 100
    for sheet, chunk in (("held_weapons", SHOWCASE[:7]), ("held_tools", SHOWCASE[7:])):
        sc, cam, coll = new_scene("held", 2600, 1000, o.samples)
        placed = []
        for c, (iid, action, key, fx_id) in enumerate(chunk):
            loc = Vector((-(c - (len(chunk) - 1) / 2) * 1.1, 0, 0))
            placed.append((iid, action, key, fx_id, clone_body(tpl, coll, loc, DISPLAY_YAW, action, key, frame), loc))
        sc.frame_set(frame)
        bpy.context.view_layer.update()
        for iid, action, key, fx_id, body, loc in placed:
            if iid is None:
                holstered(("pistol", "compact-carbine", "grenade", "baton", "data-pad"), by_id, body, coll)
                report["results"].append({"pose": "holstered", "action": action})
                label, sub = "HOLSTERED", "IDLE"
            else:
                it = by_id[iid]
                clip = {"reload": "reload", "shoot_rifle": "fire"}.get(action)
                pose = None
                if clip:
                    f = item_clip_frame(it, clip, key, bpy.data.actions[action].frame_range[1])
                    pose = (clip, f) if f is not None else None
                m_item, err = place_item(it, body, coll, pose=pose)
                report["results"].append({"item": iid, "action": action, "frame": key, "handErrorM": err})
                if fx_id:
                    sock = "muzzle" if "muzzle" in it.sockets else "emitter"
                    anchor = m_item @ Vector(it.to_metres(it.sockets[sock]["position"]))
                    blend.spawn_fx(fx_by[fx_id], Matrix.Translation(anchor) @ m_item.to_3x3().to_4x4(), coll)
                label, sub = it.meta["label"], action.replace("_", " ").upper()
            for body_txt, size, z, col in ((label, 0.09, -0.12, (0.55, 0.85, 1.0)), (sub, 0.065, -0.24, (0.2, 0.65, 1.0))):
                t = text(coll, body_txt, (loc.x, loc.y, z), size, colour=col)
                t.rotation_euler = (math.radians(90), 0, math.radians(180))
        me = bpy.data.meshes.new("floor")
        me.from_pydata([(-8, -3, 0), (8, -3, 0), (8, 6, 0), (-8, 6, 0)], [], [(0, 1, 2, 3)])
        me.materials.append(emission_mat("floor", (0.004, 0.008, 0.025), 1.0))
        coll.objects.link(bpy.data.objects.new("floor", me))
        bar = bpy.data.meshes.new("bar")
        bx = -(len(chunk) / 2) * 1.1 - 0.1
        bar.from_pydata([(bx, 0, 0), (bx + 0.03, 0, 0), (bx + 0.03, 0, 1.8), (bx, 0, 1.8)], [], [(0, 1, 2, 3)])
        bar.materials.append(emission_mat("bar", (1.0, 0.45, 0.1), 2.0))
        coll.objects.link(bpy.data.objects.new("bar", bar))
        t = text(coll, "1.8 m", (bx, 0, 1.85), 0.07, colour=(1.0, 0.7, 0.4))
        t.rotation_euler = (math.radians(90), 0, math.radians(180))
        cam.data.type, cam.data.lens, cam.data.sensor_fit = "PERSP", 50, "HORIZONTAL"
        cam.location = (0.0, 12.5, 3.4)
        cam.rotation_euler = (math.radians(79), 0, math.radians(180))
        for ob in list(sc.collection.objects):
            if ob.type == "LIGHT":
                bpy.data.objects.remove(ob, do_unlink=True)
        add_lights(sc, "held", tilt=15, yaw=180)
        render(sc, os.path.join(o.renders, f"{sheet}.png"))
    holds = item_holds(tpl, coll, items, sc)
    report["itemHolds"] = holds
    with open(os.path.join(o.renders, "held_poses.json"), "w") as fh:
        json.dump(report, fh, indent=1)
    if getattr(o, "holds", ""):
        with open(o.holds, "w") as fh:
            json.dump({"schema": "sidereal.crew.item-holds/1", "revision": "r002",
                       "bodySpec": "CHAR-BODY r002 (spec_version 2)",
                       "frame": "character body frame, Blender axes (+Y facing, +Z up), metres; item origin = grip",
                       "method": "item on socket.hand.R in CHAR-BODY's baked action at the key frame; hand errors measured",
                       "items": holds}, fh, indent=1)
            fh.write("\n")
    print("[held]", [(r.get("item"), r.get("handErrorM")) for r in report["results"]])
