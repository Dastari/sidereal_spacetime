"""Armed animation layer for every weapon class on the CHAR-BODY r004 rig (owner round 2, item 4).

For each class (pistol, SMG, carbine, rifle, shotgun, heavy, beam, rail, melee, tool) this bakes
idle_armed, walk_armed, run_armed, aim, shoot/attack/use, reload, draw and holster onto crew_rig:

* Body: CHAR-BODY's parametric pose library (anims.py: base_pose, gait with foot IK/planting, hip
  sway and bob, counter-rotating chest; aim/shoot/reload/melee/repair key poses) is solved by its
  Poser, so locomotion, feet and stance are CHAR-BODY's own authored motion.
* Weapon layer (CHAR-WEAPONS): the weapon frame rides the chest (low ready / port arms) over the
  gait, and the SUPPORT HAND is re-solved every frame onto the class item's own support socket
  (item frame -> socket frame), blended against any hand.L key a clip authors (reload mag change).
* Draw/holster: the right hand reaches the item's holster grip (socket + holster transform from the
  item data), picks it up at the grab frame and carries it to the ready pose (holster = reverse).
Measured per frame: support-hand error (m) and item-voxel penetration into the chest/head boxes.
"""
import json
import math
import os
import sys

import bpy
from mathutils import Matrix, Quaternion, Vector

from . import blend, body_frames
from .items import HOLSTERS

ITEM_TO_SOCKET = Matrix.Rotation(math.radians(-90), 4, "Z")
SOCKET_TO_ITEM = ITEM_TO_SOCKET.inverted()

CLASSES = [("pistol", "pistol", "pistol"), ("smg", "smg", "pistol"), ("carbine", "compact-carbine", "rifle"),
           ("rifle", "rifle", "rifle"), ("shotgun", "shotgun", "rifle"), ("heavy", "heavy-gun", "heavy"),
           ("beam", "beam-rifle", "rifle"), ("rail", "rail-rifle", "rifle"), ("melee", "baton", "melee"),
           ("tool", "repair-tool", "tool")]
CLIPS = ["idle_armed", "walk_armed", "run_armed", "aim", "shoot", "reload", "draw", "holster"]
GRAB = 6          # draw: frame the hand closes on the holstered item
DRAW_LEN = 14


def import_body_lib(scripts_dir):
    if scripts_dir not in sys.path:
        sys.path.insert(0, scripts_dir)
    import anims  # noqa: E402  (CHAR-BODY pose library)
    return anims


class ArmedBaker:
    def __init__(self, anims, rig_obj):
        self.A = anims
        self.poser = anims.Poser(rig_obj)
        self.lib = anims.lib()
        self.rig = rig_obj
        self.stances = {}

    # -------------------------------------------------------------- helpers
    def frames_of(self, name):
        spec = self.lib[name]
        if "frames" in spec:
            return [(f, P) for f, P in spec["frames"]]
        ks = spec["keys"]
        return [(f, self.A.sample(ks, f)) for f in range(ks[0][0], ks[-1][0] + 1)]

    def socket_R(self):
        p = self.poser
        return p.M("hand.R") @ p.rest["hand.R"].inverted() @ p.sock["socket.hand.R"]

    def socket_L(self):
        p = self.poser
        return p.M("hand.L") @ p.rest["hand.L"].inverted() @ p.sock["socket.hand.L"]

    def solve_hand(self, side, Ms, pole, girdle=False):
        """Two-bone arm IK onto a socket frame. With girdle=True the shoulder (clavicle) bone swings
        forward/up by up to 24 degrees when the target is beyond arm reach (chibi arms are short)."""
        p = self.poser
        hand_M = p.hand_from_socket(side, Ms)
        if girdle:
            reach = p.length[f"upper_arm.{side}"] + p.length[f"forearm.{side}"]
            best = None
            base = p.pb[f"shoulder.{side}"].rotation_quaternion.copy()
            sx = 1 if side == "R" else -1
            for yaw in (0, 8, 16, 24):
                for pitch in (0, 10, 20):
                    p.pb[f"shoulder.{side}"].rotation_quaternion = base
                    p.fk(f"shoulder.{side}", (pitch, 0, sx * yaw))
                    p.update()
                    d = (hand_M.translation - p.M(f"upper_arm.{side}").translation).length - reach * 0.999
                    score = max(0.0, d) * 100 + yaw * 0.001 + pitch * 0.001
                    if best is None or score < best[0]:
                        best = (score, yaw, pitch)
                    if d <= 0:
                        break
            p.pb[f"shoulder.{side}"].rotation_quaternion = base
            p.fk(f"shoulder.{side}", (best[2], 0, sx * best[1]))
            p.update()
        p.limb(f"upper_arm.{side}", f"forearm.{side}", f"hand.{side}", hand_M, pole)

    def support_target(self, item, Mr):
        """Item support socket expressed in the solved socket.hand.R frame."""
        g = Vector(item.sockets["grip"]["position"])
        s = Vector(item.sockets["support"]["position"])
        d = (s - g) * item.voxel                                   # item frame metres
        off = Vector((d.y, -d.x, d.z))                              # item -> socket axes
        Ml = Mr.copy()
        Ml.translation = Mr.translation + Mr.to_3x3() @ off
        return Ml

    def holster_socket_frame(self, item):
        """Armature-space socket.hand.R frame that grips the holstered item (moves with the body)."""
        h = body_frames.holster_local(HOLSTERS[item.meta["holster"]])
        p = self.poser
        bone = {"socket.back": "chest", "socket.belt": "pelvis", "socket.hip.R": "pelvis", "socket.hip.L": "pelvis"}[h["socket"]]
        delta = p.M(bone) @ p.rest[bone].inverted()
        m_item = delta @ p.sock[h["socket"]] @ Matrix.Translation(Vector(h["offset"])) @ Quaternion(h["rotationWXYZ"]).to_matrix().to_4x4()
        return m_item @ SOCKET_TO_ITEM, m_item

    def penetration(self, item, Mr):
        """Item voxel centres (armature space) inside the torso/head boxes -> count."""
        p = self.poser
        m_item = Mr @ ITEM_TO_SOCKET
        o = Vector(item.origin())
        inv = {b: (p.M(b) @ p.rest[b].inverted()).inverted() for b in body_frames.BODY_BOXES}
        n = 0
        for cell in item.body.cells:
            c = m_item @ ((Vector(cell) + Vector((0.5, 0.5, 0.5)) - o) * item.voxel)
            for b, (lo, hi) in body_frames.BODY_BOXES.items():
                q = (inv[b] @ c) / (1 / 32)
                if all(lo[i] + 0.5 < q[i] < hi[i] - 0.5 for i in range(3)):
                    n += 1
                    break
        return n

    # -------------------------------------------------------------- body poses per family
    def body_pose(self, fam, clip, ph, f):
        A = self.A
        if clip in ("walk_armed", "run_armed"):
            run = clip == "run_armed"
            kw = dict(step=24, lift=7.5, bob=2.2, lean=16, arm_swing=50, elbow=75, pelvis_z=-1.2, stance=0.4, sway=0.4,
                      drop=3, twist=11, bounce_head=3) if run else dict(step=15, lift=3.5, bob=1.2, lean=5, arm_swing=28, elbow=18)
            P = A.gait(ph, **kw)
            if fam in ("rifle", "heavy"):
                P["pole.R"], P["pole.L"] = (0.9, -0.6, -0.4), (-0.6, -0.4, -1)
                for k in ("fk:upper_arm.R", "fk:forearm.R", "fk:hand.R", "fk:upper_arm.L", "fk:forearm.L", "fk:hand.L"):
                    P.pop(k, None)
                # quieter twist so the weapon line stays steady (overlap stays in the legs)
                for k in ("fk:chest", "fk:spine"):
                    x, y, z = P[k]
                    P[k] = (x, y, z * 0.4)
            elif fam in ("pistol",):
                P["hand.R"] = ("c", 8, 8, 28, 0, -30, 0)
                P["pole.R"] = (1, -0.5, -0.2)
                P.pop("fk:upper_arm.R", None)
            else:  # melee / tool: one hand, item down at the side, free arm swings
                P["hand.R"] = ("c", 9, 5, 25, 0, -60, 0)
                P["pole.R"] = (1, -0.3, 0)
            return P
        return None

    # ------------------------------------------------------------------ weapon-frame solver
    # Poses are defined by what reads right on screen, then the arms are solved to them:
    #   long-gun aim   : stock seated in the right shoulder pocket, barrel level toward the target
    #   long-gun ready : stock still at the shoulder, muzzle down ~35 deg and across the body
    #   heavy          : stock at the right hip (hip fire), barrel level / slightly down at ready
    #   pistol/SMG aim : sights on the eye line at arm's length (x = dominant eye)
    # A small search (torso blade, barrel yaw, pocket, reach) keeps both hands ON the item
    # (support gap is a hard limit) and minimises item voxels inside the torso/head boxes.
    V = 1 / 32
    POCKETS = {"shoulder": [(7.0, 5.0, 34.0), (7.5, 4.0, 33.0), (6.5, 5.5, 35.0), (8.0, 3.0, 32.0), (5.5, 6.0, 33.0)],
               "hip": [(8.0, 4.0, 25.0), (8.5, 1.0, 27.0), (9.0, -1.0, 28.0), (8.0, 2.0, 29.0)]}
    KINDS = {"aim": {"pitch": (0.0,), "yaw": (0.0, 6.0, 12.0), "blade": (0, -15, -30, -45, -60)},
             "ready": {"pitch": (-38.0, -30.0, -22.0), "yaw": (30.0, 40.0, 50.0, 60.0), "blade": (0, -10, -20, -30)},
             "hip_aim": {"pitch": (0.0, -4.0), "yaw": (0.0, 8.0, 16.0), "blade": (0, -15, -30, -45)},
             "hip_ready": {"pitch": (-12.0, -8.0), "yaw": (0.0, 8.0, 16.0), "blade": (0, -15, -30, -45)},
             "sight": {"pitch": (0.0,), "yaw": (0.0,), "blade": (0, -10, -20)}}

    def chest_delta(self):
        p = self.poser
        return p.M("chest") @ p.rest["chest"].inverted()

    def bone_delta(self, bone):
        p = self.poser
        return p.M(bone) @ p.rest[bone].inverted()

    def rot(self, yaw, pitch, roll=0.0, base=None):
        R = Matrix.Rotation(math.radians(yaw), 3, "Z") @ Matrix.Rotation(math.radians(pitch), 3, "X")
        R = R @ (base if base is not None else self.poser.sock["socket.hand.R"].to_3x3())
        return R @ Matrix.Rotation(math.radians(roll), 3, "X")

    def frame_from_point(self, item, Rsock, socket_name, point):
        """socket.hand.R frame that puts item socket `socket_name` at `point` (armature metres)."""
        d = (Vector(item.sockets[socket_name]["position"]) - Vector(item.sockets["grip"]["position"])) * item.voxel
        off = Vector((d.y, -d.x, d.z))
        M = Rsock.to_4x4()
        M.translation = point - Rsock @ off
        return M

    def eye_point(self):
        p = self.poser
        e = p.sock.get("socket.eyes")
        return (self.bone_delta("head") @ e).translation if e is not None else Vector((0, 7, 45.5)) * self.V

    @staticmethod
    def blade_body(P, blade):
        """Turn hips/torso into a bladed stance; the head counter-turns to keep facing the target."""
        P = dict(P)
        for bone, k in (("fk:pelvis", 0.45), ("fk:spine", 0.25), ("fk:chest", 0.35), ("fk:head", -0.9)):
            x, y, z = P.get(bone, (0, 0, 0))
            P[bone] = (x, y, z + blade * k)
        return P

    @staticmethod
    def strip_weapon(P):
        P = dict(P)
        w = P.pop("weapon", None)
        P.pop("weapon#w", None)
        for k in ("fk:upper_arm.R", "fk:forearm.R", "fk:hand.R"):
            P.pop(k, None)
        return P, w

    def weapon_frame(self, item, kind, st):
        """Solved-socket frame for one kind + stance params, on the CURRENT body pose."""
        if kind == "sight":
            eye = self.eye_point()
            R = self.rot(st["yaw"], st["pitch"])
            fwd = R.col[0].normalized()
            point = eye + fwd * (st["reach"] * self.V) + Vector((st.get("dx", 1.5) * self.V, 0, -st.get("drop", 0) * self.V))
            sock = "sight" if "sight" in item.sockets else "muzzle"
            return self.frame_from_point(item, R, sock, point)
        pocket_bone = "pelvis" if kind.startswith("hip") else "chest"
        pocket = self.bone_delta(pocket_bone) @ (Vector(st["pocket"]) * self.V)
        base = None
        if kind in ("ready", "hip_ready"):                    # ready carries sway with the torso
            base = self.chest_delta().to_3x3() @ self.poser.sock["socket.hand.R"].to_3x3()
        R = self.rot(st["yaw"], st["pitch"], base=base)
        anchor = "stock" if "stock" in item.sockets else "grip"
        return self.frame_from_point(item, R, anchor, pocket)

    def evaluate(self, item, P_body, kind, st, two_hand):
        p = self.poser
        p.apply(self.blade_body(P_body, st["blade"]))
        Mr = self.weapon_frame(item, kind, st)
        self.solve_hand("R", Mr, (1.0, -0.5, -0.4), girdle=True)
        err_r = (self.socket_R().translation - Mr.translation).length
        err_l = 0.0
        if two_hand:
            Ml = self.support_target(item, self.socket_R())
            self.solve_hand("L", Ml, (-0.6, -0.4, -1.0), girdle=True)
            err_l = (self.socket_L().translation - Ml.translation).length
        return Mr, err_r, err_l, self.penetration(item, self.socket_R())

    def solve_kind(self, cls, item, kind, P_body, two_hand):
        g = self.KINDS[kind]
        best = None
        pockets = [None] if kind == "sight" else self.POCKETS["hip" if kind.startswith("hip") else "shoulder"]
        reaches = (18, 16, 14, 12, 10, 8) if kind == "sight" else (None,)
        drops = (0, 2, 4, 6) if kind == "sight" else (0,)
        for blade in g["blade"]:
            for yaw in g["yaw"]:
                for pitch in g["pitch"]:
                    for pocket in pockets:
                        for reach in reaches:
                            for drop in drops:
                                st = {"blade": blade, "yaw": yaw, "pitch": pitch, "pocket": pocket, "reach": reach, "drop": drop}
                                _, er, el, pen = self.evaluate(item, P_body, kind, st, two_hand)
                                score = (5000 * max(0.0, er - 0.004) + 5000 * max(0.0, el - 0.004) + pen
                                         + 0.03 * abs(blade) + 0.02 * abs(yaw) - (0.3 * reach if reach else 0) + 1.0 * drop)
                                if best is None or score < best[0]:
                                    best = (score, st, er, el, pen)
        _, st, er, el, pen = best
        print(f"[armed] solve {cls}/{kind}: {st} rightErr {er:.3f} supportErr {el:.3f} pen {pen}")
        return dict(st, rightErrorM=round(er, 4), supportErrorM=round(el, 4), penetration=pen)

    def settle(self, item, Mr, fam, cls, clip, P):
        """Per-frame refinement: if the support hand cannot reach this frame's grip (gait arm and
        chest motion), slide the weapon (up to 4 vox) toward the support shoulder; keep the best."""
        two = item.meta["two_handed"] or cls == "smg" or (fam == "pistol" and clip in ("aim", "shoot", "reload"))
        authored_l = bool(P.get("hand.L")) and P.get("hand.L#w", 1.0) > 0.01
        self.solve_hand("R", Mr, (1.0, -0.5, -0.4), girdle=True)
        if not two or authored_l:
            return Mr
        p = self.poser
        sh = p.M("upper_arm.L").translation
        best = None
        for k in (0, 1, 2, 3, 4):
            M = Mr.copy()
            if k:
                d = (sh - self.support_target(item, Mr).translation).normalized()
                M.translation = Mr.translation + d * (k * self.V)
            self.solve_hand("R", M, (1.0, -0.5, -0.4), girdle=True)
            Ml = self.support_target(item, self.socket_R())
            self.solve_hand("L", Ml, (-0.6, -0.4, -1.0), girdle=True)
            gap = (self.socket_L().translation - Ml.translation).length
            pen = self.penetration(item, self.socket_R())
            score = 5000 * max(0.0, gap - 0.004) + pen + 0.5 * k
            if best is None or score < best[0]:
                best = (score, M)
            if gap <= 0.004 and k == 0:
                break
        self.solve_hand("R", best[1], (1.0, -0.5, -0.4), girdle=True)
        return best[1]

    def kinds_for(self, cls, fam, clip):
        if fam == "rifle":
            return "aim" if clip in ("aim", "shoot", "reload") else "ready"
        if fam == "heavy":
            return "hip_aim"                  # heavy guns ride the hip, level, in every armed clip
        if cls == "smg":
            # SMG: stock (rear cap) seated at the shoulder like a carbine; ready = muzzle down
            return "aim" if clip in ("aim", "shoot", "reload") else "ready"
        if fam == "pistol" and clip in ("aim", "shoot", "reload"):
            return "sight"
        return None

    def tune(self, cls, item, fam):
        out = {}
        for clip, base in (("aim", None), ("idle_armed", None)):
            kind = self.kinds_for(cls, fam, clip)
            if not kind or kind in out:
                continue
            P0 = self.clip_frames(fam, clip)[0][1]
            P_body, _ = self.strip_weapon(P0)
            two = item.meta["two_handed"] or fam == "pistol"
            out[kind] = self.solve_kind(cls, item, kind, P_body, two)
        return out

    @staticmethod
    def two_hand_low(P, cls, clip):
        """SMG: carry low and centred in both hands instead of the one-hand pistol idle."""
        if cls != "smg" or clip not in ("idle_armed", "walk_armed", "run_armed"):
            return P
        P = dict(P)
        P["hand.R"] = ("c", 1, 9, 27, 15, -25, 0)
        P["pole.R"], P["pole.L"] = (1, -0.5, -0.4), (-1, -0.5, -0.4)
        for k in ("fk:upper_arm.L", "fk:forearm.L", "fk:hand.L"):
            P.pop(k, None)
        return P

    def clip_frames(self, fam, clip):
        """[(frame, P, weapon_override_or_None)] for one class clip. P comes from CHAR-BODY's library."""
        lib_map = {
            "rifle": {"idle_armed": "idle_armed", "aim": "aim_rifle", "shoot": "shoot_rifle", "reload": "reload"},
            "heavy": {"idle_armed": "idle_armed", "aim": "aim_rifle", "shoot": "shoot_rifle", "reload": "reload"},
            "pistol": {"idle_armed": "idle_pistol", "aim": "aim_pistol", "shoot": "shoot_pistol", "reload": "aim_pistol"},
            "melee": {"idle_armed": "idle_pistol", "aim": "idle_pistol", "shoot": "melee_swing"},
            "tool": {"idle_armed": "idle_pistol", "aim": "repair_loop", "shoot": "repair_loop"},
        }[fam]
        if clip in ("walk_armed", "run_armed"):
            n = 14 if clip == "run_armed" else 18
            return [(f, self.body_pose(fam, clip, f / n, f)) for f in range(n + 1)]
        if clip in ("draw", "holster"):
            idle = self.frames_of(lib_map["idle_armed"])[0][1]
            base = self.frames_of("idle")[0][1]
            out = []
            for f in range(DRAW_LEN + 1):
                t = f if clip == "draw" else DRAW_LEN - f
                s = min(1.0, t / DRAW_LEN)
                P = self.A.sample(self.A.fill([(0, dict(base), "io"), (DRAW_LEN, dict(idle), "io")]), s * DRAW_LEN)
                out.append((f, P))
            return out
        name = lib_map.get(clip)
        if name is None:
            return []
        frames = self.frames_of(name)
        if fam == "heavy" and clip in ("aim", "shoot", "reload"):
            # heavy guns fire from the hip (reference heavy marine): keep the clip's recoil/tilt
            # deltas, but carry the weapon at hip height instead of shouldering it
            base_w = self.frames_of("aim_rifle")[0][1]["weapon"]
            hip = ("c", 4, 10, 29, 0, -2, 0, "one_hand")
            out = []
            for f, P in frames:
                P = dict(P)
                w = P.get("weapon")
                if w and w[0] == "w":
                    d = [w[i] - base_w[i] for i in (1, 2, 3, 4, 5, 6)]
                    P["weapon"] = ("c", hip[1] + d[0], hip[2] + d[1], hip[3] + d[2], hip[4] + d[3], hip[5] + d[4], hip[6] + d[5], "one_hand")
                elif w:
                    P["weapon"] = w
                out.append((f, P))
            return out
        if fam == "pistol" and clip == "reload":
            # pistol reload: tilt the gun in, support hand to the belt pouch and back to the grip
            R0 = frames[0][1]
            RL = dict(R0)
            RL["weapon"] = ("w", 1.0, 11, 35, 25, -20, 35, "pistol")
            ks = self.A.fill([(0, R0, "io"), (5, dict(RL), "io"),
                              (11, dict(RL, **{"hand.L": ("w", -7, 2, 27, 0, -80, 0)}), "io"),
                              (16, dict(RL, **{"hand.L": ("w", -7, 1, 26, 0, -80, 0)}), "io"),
                              (22, dict(RL, **{"hand.L": None}), "io"), (28, R0, "io")])
            frames = [(f, self.A.sample(ks, f)) for f in range(0, 29)]
        return frames

    # -------------------------------------------------------------- bake one clip
    def bake(self, cls, item, fam, clip):
        p = self.poser
        frames = self.clip_frames(fam, clip)
        if not frames:
            return None
        act = bpy.data.actions.new(f"{cls}.{clip}")
        act.use_fake_user = True
        self.rig.animation_data_create()
        self.rig.animation_data.action = act
        p.lastq = {}
        attach, support_err, pen = [], [], []
        ready_Mr = None
        if clip in ("draw", "holster"):
            rk = self.kinds_for(cls, fam, "idle_armed")
            P0 = self.clip_frames(fam, "idle_armed")[0][1]
            if rk and self.stances.get(cls, {}).get(rk):
                rst = self.stances[cls][rk]
                p.apply(self.blade_body(self.strip_weapon(P0)[0], rst["blade"]))
                ready_Mr = self.weapon_frame(item, rk, rst)
            else:
                p.apply(P0)
                ready_Mr = self.socket_R()
        kind = self.kinds_for(cls, fam, clip)
        st = self.stances.get(cls, {}).get(kind) if kind else None
        w_base = None
        if st:
            ref = {"aim": "aim", "shoot": "aim", "reload": "aim"}.get(clip, "idle_armed")
            w_base = self.strip_weapon(self.clip_frames(fam, ref)[0][1])[1]
        for f, P in frames:
            P = self.two_hand_low(dict(P), cls, clip)
            if st:
                P_body, w = self.strip_weapon(P)
                p.apply(self.blade_body(P_body, st["blade"]))
                Mr = self.weapon_frame(item, kind, st)
                if w and w_base and w[0] == w_base[0]:
                    # CHAR-BODY's authored motion (breath, recoil kick, reload tilt) as deltas
                    dpos = Vector(w[1:4]) - Vector(w_base[1:4])
                    if w[0] == "c":
                        dpos = self.chest_delta().to_3x3() @ dpos
                    Rd = Matrix.Rotation(math.radians(w[4] - w_base[4]), 3, "Z") @ Matrix.Rotation(math.radians(w[5] - w_base[5]), 3, "X")
                    R2 = Rd @ Mr.to_3x3() @ Matrix.Rotation(math.radians(w[6] - w_base[6]), 3, "X")
                    if clip == "shoot":
                        dpos = dpos * (0.35 if kind.startswith("hip") else 0.5)   # kick goes into the body, not through it
                    t = Mr.translation + dpos * self.V
                    Mr = R2.to_4x4()
                    Mr.translation = t
                Mr = self.settle(item, Mr, fam, cls, clip, P)
            else:
                if "weapon" in P and P["weapon"] is not None:
                    sp, x, y, z, yaw, pitch, roll, _ = P["weapon"]
                    P["weapon"] = (sp, x, y, z, yaw, pitch, roll, "one_hand")      # support solved below
                p.apply(P)
            held = True
            if clip in ("draw", "holster"):
                t = f if clip == "draw" else DRAW_LEN - f
                M_h, _ = self.holster_socket_frame(item)
                fkR = self.socket_R()
                if t <= GRAB:
                    s = self.A.EASE["io"](t / GRAB)
                    Mr = self.A.blend(fkR, M_h, s)
                    held = t >= GRAB
                else:
                    s = self.A.EASE["io"]((t - GRAB) / (DRAW_LEN - GRAB))
                    if item.meta["holster"].startswith("back"):
                        # swing the long gun up and out over the right shoulder, muzzle high, then
                        # bring it down into the ready (never through the torso)
                        C = self.chest_delta()
                        up = self.rot(0, 70, base=C.to_3x3() @ p.sock["socket.hand.R"].to_3x3())
                        w1 = up.to_4x4()
                        w1.translation = C @ (Vector((13.0, -2.0, 44.0)) * self.V)
                        w2 = self.rot(15, 20, base=C.to_3x3() @ p.sock["socket.hand.R"].to_3x3()).to_4x4()
                        w2.translation = C @ (Vector((12.0, 6.0, 40.0)) * self.V)
                        if s < 0.4:
                            Mr = self.A.blend(M_h, w1, s / 0.4)
                        elif s < 0.7:
                            Mr = self.A.blend(w1, w2, (s - 0.4) / 0.3)
                        else:
                            Mr = self.A.blend(w2, ready_Mr, (s - 0.7) / 0.3)
                    else:
                        Mr = self.A.blend(M_h, ready_Mr, s)
                self.solve_hand("R", Mr, (1.0, -0.6, -0.3), girdle=True)
            Mr = self.socket_R()
            two_hand = item.meta["two_handed"] or (fam == "pistol" and clip in ("aim", "shoot", "reload"))
            if cls == "smg":
                two_hand = True
            err = None
            if two_hand and held and "support" in item.sockets and clip not in ("draw", "holster"):
                Ml = self.support_target(item, Mr)
                w_auth = P.get("hand.L#w", 1.0) if P.get("hand.L") else 0.0
                target = self.A.blend(Ml, self.socket_L(), w_auth)
                self.solve_hand("L", target, P.get("pole.L", (-0.6, -0.4, -1)), girdle=True)
                if w_auth < 0.01:
                    err = (self.socket_L().translation - Ml.translation).length
            support_err.append(err)
            pen.append(self.penetration(item, self.socket_R()) if held else 0)
            attach.append("hand" if held else "holster")
            p.key(f)
        for fc in act.fcurves:
            for kp in fc.keyframe_points:
                kp.interpolation = "LINEAR"
        act.use_frame_range = True
        act.frame_start, act.frame_end = frames[0][0], frames[-1][0]
        loop = clip in ("idle_armed", "walk_armed", "run_armed", "aim") or (clip == "shoot" and fam in ("rifle", "heavy", "tool"))
        act.use_cyclic = loop
        self.rig.animation_data.action = None
        errs = [e for e in support_err if e is not None]
        return {"action": act.name, "class": cls, "item": item.id, "clip": clip, "frames": frames[-1][0] - frames[0][0],
                "fps": 24, "loop": loop, "attach": attach,
                "supportErrorMaxM": round(max(errs), 4) if errs else None,
                "stance": {k: {kk: vv for kk, vv in v.items()} for k, v in self.stances.get(cls, {}).items()}, "supportFramesSolved": len(errs), "bodyPenetrationMaxVoxels": max(pen) if pen else 0, "grabFrame": GRAB if clip == "draw" else (DRAW_LEN - GRAB if clip == "holster" else None)}


def bake_all(o, by_id, rig_src):
    anims = import_body_lib(os.path.join(os.path.dirname(o.body), "scripts"))
    rig = rig_src.copy()
    rig.data = rig_src.data.copy()
    rig.name = "crew_rig.armed"
    bpy.context.scene.collection.objects.link(rig)
    rig.hide_render = True
    baker = ArmedBaker(anims, rig)
    meta = []
    for cls, iid, fam in CLASSES:
        baker.stances[cls] = baker.tune(cls, by_id[iid], fam)
        for clip in CLIPS:
            m = baker.bake(cls, by_id[iid], fam, clip)
            if m:
                meta.append(m)
                print(f"[armed] {cls}.{clip}: {m['frames']}f support max {m['supportErrorMaxM']} pen {m['bodyPenetrationMaxVoxels']}")
    baker.poser.reset()
    return rig, meta
