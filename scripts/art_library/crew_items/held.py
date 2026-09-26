"""Items held by the CHAR-BODY r001 rig in key poses (review evidence + reach audit).

CHAR-BODY has not authored its actions yet, so each pose here is solved in Blender with two-bone
IK (forearm chain) + a hand orientation constraint so that socket.hand.R lands exactly on the
item's grip frame and socket.hand.L on its support socket. The same placements are exported as
`HOLD_POSES` (body-frame item placements) for CHAR-BODY to key into real actions; the measured
hand-to-socket errors are written to held_poses.json so unreachable grips are visible, not hidden.
"""
import json
import math
import os

import bpy
from mathutils import Matrix, Quaternion, Vector

from . import blend, body_frames
from .items import HOLSTERS
from .render import add_lights, emission_mat, text

V = 1 / 32


def rot_from(forward, up):
    f = Vector(forward).normalized()
    u = Vector(up).normalized()
    r = f.cross(u).normalized()
    u = r.cross(f).normalized()
    return Matrix((r, f, u)).transposed()          # columns: item +X, +Y, +Z


# Body-frame placements (Blender, character faces +Y). anchor = item socket placed at `at`.
# yaw = whole-body stance rotation (degrees, +CCW) so the support shoulder can reach the fore grip.
HOLD_POSES = {
    "aim_rifle": {"yaw": -38, "anchor": "stock", "at": (0.05, 0.13, 1.21), "forward": (-0.616, 0.788, 0.0), "up": (0, 0, 1),
                  "support": True, "clip": "aim_rifle"},
    "hip_heavy": {"yaw": -30, "anchor": "grip", "at": (0.17, 0.30, 0.88), "forward": (-0.5, 0.866, 0.05), "up": (0, 0, 1),
                  "support": True, "clip": "aim_rifle"},
    "aim_pistol": {"yaw": -10, "anchor": "grip", "at": (0.12, 0.47, 1.20), "forward": (0.17, 0.985, 0.0), "up": (0, 0, 1),
                   "support": False, "clip": "aim_pistol"},
    "repair_loop": {"yaw": 0, "anchor": "grip", "at": (0.16, 0.40, 1.00), "forward": (0.0, 0.94, -0.34), "up": (0, 0.34, 0.94),
                    "support": False, "clip": "repair_loop"},
    "use_device": {"yaw": 0, "anchor": "grip", "at": (0.16, 0.34, 1.06), "forward": (0.0, 0.5, 0.866), "up": (0, -0.866, 0.5),
                   "support": False, "clip": "use_interact"},
    "melee_ready": {"yaw": 0, "anchor": "grip", "at": (0.32, 0.30, 1.05), "forward": (0.15, 0.35, 0.92), "up": (0, -0.92, 0.35),
                    "support": False, "clip": "melee_swing"},
    "throw_windup": {"yaw": 0, "anchor": "grip", "at": (0.36, -0.22, 1.62), "forward": (0, 1, 0), "up": (0, 0, 1),
                     "support": False, "clip": "throw"},
    "carry_box": {"yaw": 0, "anchor": "centre", "at": (0.0, 0.36, 0.86), "forward": (0, 1, 0), "up": (0, 0, 1),
                  "support": True, "clip": "carry_idle"},
    "carry_case": {"yaw": 0, "anchor": "grip", "at": (0.31, 0.02, 0.70), "forward": (0, 1, 0), "up": (0, 0, 1),
                   "support": False, "clip": "carry_idle"},
}

POSE_FOR_SET = {"rifle": "aim_rifle", "pistol": "aim_pistol", "tool": "repair_loop", "device": "use_device",
                "melee": "melee_ready", "throw": "throw_windup", "carry": "carry_box"}

SHOWCASE = [("compact-carbine", "aim_rifle"), ("pistol", "aim_pistol"), ("heavy-gun", "hip_heavy"),
            ("repair-tool", "repair_loop"), ("data-pad", "use_device"), ("baton", "melee_ready"),
            ("grenade", "throw_windup"), ("cargo-box", "carry_box"), ("medkit", "carry_case"), (None, "holstered")]


def load_body(path):
    with bpy.data.libraries.load(path) as (src, dst):
        dst.objects = [n for n in src.objects if n in ("crew_rig", "GEO-crew-body-male", "GEO-crew-hair-default-male") or n.startswith("socket.")]
    return {ob.name: ob for ob in dst.objects}


DISPLAY_YAW = 62      # presentation turn so the item side faces the review camera


def clone_body(tpl, coll, location, yaw, display=True):
    rig = tpl["crew_rig"].copy()
    rig.data = tpl["crew_rig"].data.copy()
    coll.objects.link(rig)
    rig.hide_render = False
    rig.location, rig.rotation_euler = location, (0, 0, math.radians(yaw + (DISPLAY_YAW if display else 0)))
    out = {"crew_rig": rig}
    for name, ob in tpl.items():
        if name == "crew_rig":
            continue
        c = ob.copy()
        c.hide_render = False
        coll.objects.link(c)
        c.parent = rig
        c.parent_type, c.parent_bone = ob.parent_type, ob.parent_bone
        c.matrix_parent_inverse = ob.matrix_parent_inverse.copy()
        for md in c.modifiers:
            if md.type == "ARMATURE":
                md.object = rig
        out[name] = c
    return out


def rest_socket_in_hand(tpl, side):
    rig = tpl["crew_rig"]
    bone = rig.data.bones[f"hand.{side}"]
    sock = tpl[f"socket.hand.{side}"]
    bpy.context.view_layer.update()
    return (rig.matrix_world @ bone.matrix_local).inverted() @ sock.matrix_world


def ik_arm(rig, coll, side, hand_world, pole_world):
    tgt = bpy.data.objects.new(f"ik.{side}", None)
    coll.objects.link(tgt)
    tgt.matrix_world = hand_world
    pole = bpy.data.objects.new(f"pole.{side}", None)
    coll.objects.link(pole)
    pole.location = pole_world
    pb = rig.pose.bones[f"forearm.{side}"]
    c = pb.constraints.new("IK")
    c.target, c.chain_count, c.use_tail = tgt, 3, True
    c.pole_target, c.pole_angle = pole, math.radians(-90)
    h = rig.pose.bones[f"hand.{side}"].constraints.new("COPY_ROTATION")
    h.target = tgt
    return tgt


def item_anchor_local(item, anchor):
    if anchor == "centre":
        b = item.bounds()
        return Vector(item.to_metres(((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2)))
    return Vector(item.to_metres(item.sockets[anchor]["position"]))


def arm_geometry(rig, side):
    bones = rig.data.bones
    shoulder = rig.matrix_world @ bones[f"upper_arm.{side}"].head_local
    reach = bones[f"upper_arm.{side}"].length + bones[f"forearm.{side}"].length
    return shoulder, reach


def solve_placement(item, p, rig, sock_in_hand):
    """Search the item placement near the nominal pose so both wrist targets are within arm reach.
    Returns (body-frame matrix, placement dict actually used, residual reach deficit per side)."""
    rz90 = Matrix.Rotation(math.radians(90), 4, "Z")
    arms = {s: arm_geometry(rig, s) for s in ("R", "L")}
    anchor = item_anchor_local(item, p["anchor"])
    sup = Vector(item.to_metres(item.sockets["support"]["position"])) if p["support"] and "support" in item.sockets else None
    nominal = Vector(p["at"])
    best = None
    step = 0.03
    rng = range(-5, 6)
    yaws = (-30, -20, -10, 0, 10, 20, 30) if sup is not None else (0,)
    for dyaw in yaws:
        rot = (Matrix.Rotation(math.radians(dyaw), 3, "Z") @ rot_from(p["forward"], p["up"])).to_4x4()
        for i in rng:
            for j in rng:
                for k in rng:
                    at = nominal + Vector((i, j, k)) * step
                    m_body = Matrix.Translation(at - rot.to_3x3() @ anchor) @ rot
                    m_item = rig.matrix_world @ m_body
                    deficit = {}
                    targets = {"R": m_item @ rz90}
                    if sup is not None:
                        targets["L"] = m_item @ Matrix.Translation(sup) @ rz90
                    inside = 0.0
                    inv = rig.matrix_world.inverted()
                    for side, t in targets.items():
                        wrist = (t @ sock_in_hand[side].inverted()).translation
                        sh, reach = arms[side]
                        d = (wrist - sh).length
                        deficit[side] = max(0.0, d - reach * 0.985) + max(0.0, reach * 0.45 - d)
                        w = inv @ t.translation
                        if abs(w.x) < 0.2 and -0.13 < w.y < 0.2 and 0.72 < w.z < 1.36:
                            inside += 0.2 - max(abs(w.x) - 0.0, 0) * 0
                    cost = sum(deficit.values()) * 10 + inside * 5 + (at - nominal).length + abs(dyaw) * 0.002
                    if best is None or cost < best[0]:
                        best = (cost, m_body, at, dyaw, deficit)
    _, m_body, at, dyaw, deficit = best
    used = dict(p, at=[round(v, 4) for v in at], forwardYawOffsetDeg=dyaw)
    return m_body, used, deficit


def pose_item(tpl, coll, item, pose_name, location, sock_in_hand):
    p = HOLD_POSES[pose_name]
    body = clone_body(tpl, coll, location, p["yaw"])
    rig = body["crew_rig"]
    bpy.context.view_layer.update()
    m_body, used, deficit = solve_placement(item, p, rig, sock_in_hand)
    m_item = rig.matrix_world @ m_body
    blend.spawn(item, item.theme, m_item, coll, name=f"held.{item.id}")
    rz90 = Matrix.Rotation(math.radians(90), 4, "Z")
    targets = {"R": m_item @ rz90}
    if p["support"] and "support" in item.sockets:
        sup = Vector(item.to_metres(item.sockets["support"]["position"]))
        targets["L"] = m_item @ Matrix.Translation(sup) @ rz90
    for side, sock_target in targets.items():
        hand_world = sock_target @ sock_in_hand[side].inverted()
        sgn = 1 if side == "R" else -1
        pole = rig.matrix_world @ Vector((sgn * 0.75, -0.35, 0.75))
        ik_arm(rig, coll, side, hand_world, pole)
    bpy.context.view_layer.update()
    errors = {}
    for side, sock_target in targets.items():
        # The pole side decides elbow flexion; try a few pole placements/angles, keep the closest solve.
        c = rig.pose.bones[f"forearm.{side}"].constraints["IK"]
        c.iterations = 2000
        sgn = 1 if side == "R" else -1
        best = None
        for px, py, pz in ((0.75, -0.35, 0.75), (0.7, -0.6, 0.2), (0.4, -0.7, 1.2), (0.9, 0.2, 0.6), (0.6, -0.5, -0.2)):
            c.pole_target.location = rig.matrix_world @ Vector((sgn * px, py, pz))
            for ang in (-90, 0, 90, 180):
                c.pole_angle = math.radians(ang)
                bpy.context.view_layer.update()
                e = (body[f"socket.hand.{side}"].matrix_world.translation - sock_target.translation).length
                if best is None or e < best[0] - 1e-4:
                    best = (e, c.pole_target.location.copy(), c.pole_angle)
        c.pole_target.location, c.pole_angle = best[1], best[2]
        bpy.context.view_layer.update()
        errors[side] = best[0]
    return errors, used, {k: round(v, 4) for k, v in deficit.items()}


def holstered(tpl, coll, by_id, location):
    body = clone_body(tpl, coll, location, 0)
    bpy.context.view_layer.update()
    placed = []
    for iid in ("pistol", "compact-carbine", "grenade", "baton", "data-pad"):
        it = by_id[iid]
        preset = HOLSTERS[it.meta["holster"]]
        h = body_frames.holster_local(preset)
        sock = body[h["socket"]]
        q = h["rotationWXYZ"]
        m = sock.matrix_world @ Matrix.Translation(Vector(h["offset"])) @ Quaternion(q).to_matrix().to_4x4()
        blend.spawn(it, it.theme, m, coll, name=f"holster.{iid}")
        placed.append(iid)
    return placed


ITEM_POSE_OVERRIDE = {"heavy-gun": "hip_heavy", "mining-drill": "hip_heavy", "medkit": "carry_case"}


def item_holds(tpl, coll, items, sock_in_hand):
    """Solved default hold placement per item (body frame) for CHAR-BODY to key actions against."""
    out = {}
    rigs = {}
    for item in items:
        pose = ITEM_POSE_OVERRIDE.get(item.id) or POSE_FOR_SET.get(item.animation_set)
        if not pose:
            continue
        p = HOLD_POSES[pose]
        if p["yaw"] not in rigs:
            rigs[p["yaw"]] = clone_body(tpl, coll, Vector((0, 0, -50)), p["yaw"], display=False)["crew_rig"]
            bpy.context.view_layer.update()
        rig = rigs[p["yaw"]]
        m_body, used, deficit = solve_placement(item, p, rig, sock_in_hand)
        # m_body is relative to the yawed rig; express the item in the UNYAWED character body frame.
        m = Matrix.Rotation(math.radians(p["yaw"]), 4, "Z") @ m_body
        out[item.id] = {"pose": pose, "characterClip": p["clip"], "stanceYawDeg": p["yaw"],
                        "gripPosition": [round(v, 4) for v in m.translation],
                        "rotationWXYZ": [round(v, 6) for v in m.to_quaternion()],
                        "reachDeficitM": {k: round(v, 4) for k, v in deficit.items()}}
    return out


def run(o, items, by_id):
    from .render import new_scene, render
    tpl = load_body(o.body)
    spacing = 0.95
    n = len(SHOWCASE)
    sc, cam, coll = new_scene("held", 2600, 1000, o.samples)
    for ob in tpl.values():
        coll.objects.link(ob)
        ob.hide_render = True
    sock_in_hand = {s: rest_socket_in_hand(tpl, s) for s in ("R", "L")}
    report = {"bodySpec": "CHAR-BODY r001 crew-body.blend (male)", "method": "Blender IK (forearm chain) + hand copy-rotation",
              "poses": HOLD_POSES, "results": []}
    for i, (iid, pose) in enumerate(SHOWCASE):
        loc = Vector((-(i - (n - 1) / 2) * spacing, 0, 0))
        if iid is None:
            report["results"].append({"pose": pose, "items": holstered(tpl, coll, by_id, loc)})
            label = "HOLSTERED"
        else:
            err, used, deficit = pose_item(tpl, coll, by_id[iid], pose, loc, sock_in_hand)
            report["results"].append({"item": iid, "pose": pose, "placement": used, "reachDeficitM": deficit,
                                      "handErrorM": {k: round(v, 4) for k, v in err.items()}})
            label = by_id[iid].meta["label"]
        for body, size, z, col in ((label, 0.12, 0.16, (0.55, 0.85, 1.0)), (pose.replace("_", " ").upper(), 0.08, 0.03, (0.2, 0.65, 1.0))):
            t = text(coll, body, (loc.x, 0.75, z), size, colour=col)
            t.rotation_euler = (math.radians(90), 0, math.radians(180))
    me = bpy.data.meshes.new("floor")
    me.from_pydata([(-8, -3, 0), (8, -3, 0), (8, 3, 0), (-8, 3, 0)], [], [(0, 1, 2, 3)])
    me.materials.append(emission_mat("floor", (0.004, 0.008, 0.025), 1.0))
    coll.objects.link(bpy.data.objects.new("floor", me))
    cam.data.type, cam.data.lens, cam.data.sensor_fit = "PERSP", 50, "HORIZONTAL"
    cam.location = (0.0, 14.5, 3.4)
    cam.rotation_euler = (math.radians(80.5), 0, math.radians(180))
    for ob in list(sc.collection.objects):
        if ob.type == "LIGHT":
            bpy.data.objects.remove(ob, do_unlink=True)
    add_lights(sc, "held", tilt=10, yaw=180)
    render(sc, os.path.join(o.renders, "held_key_poses.png"))
    holds = item_holds(tpl, coll, items, sock_in_hand)
    report["itemHolds"] = holds
    if getattr(o, "holds", ""):
        with open(o.holds, "w") as fh:
            json.dump({"schema": "sidereal.crew.item-holds/1", "revision": "r001",
                       "bodySpec": "CHAR-BODY r001", "frame": "character body frame, Blender axes (+Y facing, +Z up), metres; item origin = grip",
                       "method": "analytic two-bone reach search around nominal HOLD_POSES (scripts/art_library/crew_items/held.py)",
                       "poses": HOLD_POSES, "items": holds}, fh, indent=1)
            fh.write("\n")
    with open(os.path.join(o.renders, "held_poses.json"), "w") as fh:
        json.dump(report, fh, indent=1)
    print("[held] hand errors:", [(r.get("item"), r.get("handErrorM")) for r in report["results"]])
