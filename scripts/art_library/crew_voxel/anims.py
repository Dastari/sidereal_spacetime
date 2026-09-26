"""crew_rig animation library (authored in Python, baked to Blender actions, 24 fps).

Authoring model
---------------
A pose is a flat dict of parameters that are interpolated, then solved per frame:
  "fk:<bone>": (rx, ry, rz)  degrees, rotation of the bone about its head in ARMATURE axes, relative to
                             its parent (x = pitch: +raises a hanging limb forward / bends an upright bone forward; y = roll: + tilts toward
                             the character's left (-X); z = yaw: + turns left). .L values are mirrored by sym().
  "pelvis":   (dx, dy, dz)    voxel offset of the whole body (pelvis carries legs and torso)
  "foot.R"/"foot.L": (x, y, z, yaw, pitch)  ankle IK target in armature voxels (feet stay planted)
  "hand.R"/"hand.L": (space, x, y, z, yaw, pitch, roll)  socket.hand.* IK target; space "w" = armature,
                     "c" = relative to the chest bone (moves with the torso)
  "weapon":   (space, x, y, z, yaw, pitch, roll, profile)  grip frame of the held item; both hands derive
              from it via GRIP_PROFILES (support hand on the item's support grip)
  "pole.R"/"pole.L"/"kpole.R"/"kpole.L": elbow / knee pole direction (armature axes)
Key poses are listed with frame numbers and an easing; the in-between frames interpolate the
PARAMETERS (so IK hands stay on the weapon), and every frame is solved and keyed (baked, LINEAR).
The Python here is the editable source of truth; the .blend holds the baked result.
"""
import math

import bpy
from mathutils import Matrix, Quaternion, Vector

import rig

VOX = rig.VOX
FPS = 24

# Poses are authored in the r001 landmark frame and retargeted to the current rig at solve time:
# hand / weapon heights map piecewise-linearly between landmarks, foot travel and pelvis offsets
# scale with leg length. This keeps one editable pose library across body revisions.
AUTH_Z = [0, 3, 25, 34, 41, 58]          # r001: floor, ankle, hip, chest base, shoulder joint, skull top
LM = rig.LANDMARKS
CUR_Z = [0, LM["ankle"], LM["hip"], LM["chestBase"], LM["shoulder"], LM["skullTop"]]
LEG = (LM["hip"] - LM["ankle"]) / (25 - 3)


def zmap(z):
    for i in range(len(AUTH_Z) - 1):
        a0, a1 = AUTH_Z[i], AUTH_Z[i + 1]
        if z <= a1 or i == len(AUTH_Z) - 2:
            t = (z - a0) / (a1 - a0)
            return CUR_Z[i] + t * (CUR_Z[i + 1] - CUR_Z[i])
    return z


def retarget(P):
    Q = dict(P)
    for k, v in P.items():
        if k in ("foot.R", "foot.L"):
            x, y, z, yaw, pitch = v
            Q[k] = (x, y * LEG, 3 + (z - 3) * LEG, yaw, pitch)
        elif k == "pelvis":
            Q[k] = tuple(c * LEG for c in v)
        elif k in ("hand.R", "hand.L"):
            sp, x, y, z, *rest = v
            Q[k] = (sp, x, y, zmap(z), *rest)
        elif k == "weapon":
            sp, x, y, z, *rest = v
            Q[k] = (sp, x, y, zmap(z), *rest)
    return Q

# grip profiles: support-hand socket offset in the primary grip frame (voxels; x along barrel,
# y = left of the barrel, z = up). Published in the spec for CHAR-WEAPONS.
GRIP_PROFILES = {
    "rifle": {"support": (9.0, 0.0, 0.5), "note": "support hand under the foregrip, 9 vox (0.28 m) ahead of the main grip"},
    "pistol": {"support": (-0.5, 2.5, -1.0), "note": "two-handed pistol: support hand wraps the main grip from the left"},
    "tool": {"support": (6.0, 0.0, 1.0), "note": "two-handed tool/device: support hand 6 vox ahead on the body"},
    "one_hand": {"support": None, "note": "support hand free"},
}


def D(rx, ry, rz):
    return (Matrix.Rotation(math.radians(rz), 3, "Z") @ Matrix.Rotation(math.radians(ry), 3, "Y")
            @ Matrix.Rotation(math.radians(rx), 3, "X"))


def ypr(yaw, pitch, roll):
    return (Matrix.Rotation(math.radians(yaw), 3, "Z") @ Matrix.Rotation(math.radians(pitch), 3, "X")
            @ Matrix.Rotation(math.radians(roll), 3, "Y"))


def frame(Y, Xref, pos):
    Y = Y.normalized()
    X = (Xref - Xref.dot(Y) * Y)
    if X.length < 1e-6:
        X = Vector((1, 0, 0)) - Y.x * Y
    X.normalize()
    Z = X.cross(Y)
    M = Matrix.Identity(4)
    M.col[0][:3], M.col[1][:3], M.col[2][:3] = X, Y, Z
    M.translation = pos
    return M


class Poser:
    def __init__(self, arm):
        self.arm = arm
        self.pb = arm.pose.bones
        self.rest = {b.name: b.matrix_local.copy() for b in arm.data.bones}
        self.length = {b.name: b.length for b in arm.data.bones}
        self.sock = {}
        for n, (bone, loc, xa, ya, za) in rig.sockets().items():
            M = Matrix.Identity(4)
            M.col[0][:3], M.col[1][:3], M.col[2][:3] = xa, ya, za
            M.translation = Vector(loc) * VOX
            self.sock[n] = M
        for p in self.pb:
            p.rotation_mode = "QUATERNION"
        self.lastq = {}

    def reset(self):
        for p in self.pb:
            p.rotation_quaternion = (1, 0, 0, 0)
            p.location = (0, 0, 0)
            p.scale = (1, 1, 1)

    def update(self):
        bpy.context.view_layer.update()

    def fk(self, bone, r):
        R = self.rest[bone].to_3x3()
        if R.col[1].z > 0.5:
            # upright bones (pelvis, spine, chest, neck, head): +rx = bend FORWARD (flexion), like limbs
            r = (-r[0], r[1], r[2])
        self.pb[bone].rotation_quaternion = (R.inverted() @ D(*r) @ R).to_quaternion()

    def move(self, bone, d):
        R = self.rest[bone].to_3x3()
        self.pb[bone].location = R.inverted() @ (Vector(d) * VOX)

    def M(self, bone):
        return self.pb[bone].matrix.copy()

    def set_M(self, bone, M):
        self.pb[bone].matrix = M
        self.update()

    def chest_delta(self):
        return self.M("chest") @ self.rest["chest"].inverted()

    def limb(self, upper, lower, end, end_M, pole):
        S = self.M(upper).translation
        l1, l2 = self.length[upper], self.length[lower]
        W = end_M.translation
        d = W - S
        dist = max(1e-4, min(d.length, (l1 + l2) * 0.9995))
        dv = d.normalized()
        a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist)
        h = math.sqrt(max(0.0, l1 * l1 - a * a))
        pole = Vector(pole)
        perp = pole - pole.dot(dv) * dv
        if perp.length < 1e-6:
            perp = Vector((0, -1, 0)) - dv.y * dv
        perp.normalize()
        E = S + dv * a + perp * h
        W2 = S + dv * dist
        hinge = perp.cross(dv).normalized()
        # keep the part's rest twist: hinge sign follows the rest X axis carried by the parent
        parent = self.pb[upper].parent
        pdelta = (self.M(parent.name) @ self.rest[parent.name].inverted()).to_3x3()
        refX = pdelta @ self.rest[upper].to_3x3().col[0]
        if hinge.dot(refX) < 0:
            hinge = -hinge
        self.set_M(upper, frame(E - S, hinge, S))
        self.set_M(lower, frame(W2 - E, hinge, E))
        Me = end_M.copy()
        Me.translation = W2
        self.set_M(end, Me)

    def hand_target(self, side, space, x, y, z, yaw, pitch, roll):
        sname = f"socket.hand.{side}"
        R = ypr(yaw, pitch, roll) @ self.sock[sname].to_3x3()
        Ms = R.to_4x4()
        Ms.translation = Vector((x, y, z)) * VOX
        if space == "c":
            Ms = self.chest_delta() @ Ms
        return Ms

    def hand_from_socket(self, side, Ms):
        return Ms @ self.sock[f"socket.hand.{side}"].inverted() @ self.rest[f"hand.{side}"]

    def key(self, frame_no, keyed_loc=("pelvis",)):
        for p in self.pb:
            q = p.rotation_quaternion.copy()
            last = self.lastq.get(p.name)
            if last is not None and last.dot(q) < 0:
                q.negate()
                p.rotation_quaternion = q
            self.lastq[p.name] = q
            p.keyframe_insert("rotation_quaternion", frame=frame_no, group=p.name)
            if p.name in keyed_loc:
                p.keyframe_insert("location", frame=frame_no, group=p.name)

    # ------------------------------------------------------------------ solve one pose
    def apply(self, P):
        P = retarget(P)
        self.reset()
        for k, v in P.items():
            if k.startswith("fk:"):
                self.fk(k[3:], v)
        self.move("pelvis", P.get("pelvis", (0, 0, 0)))
        self.update()
        for side in ("R", "L"):
            ft = P.get(f"foot.{side}")
            if ft:
                x, y, z, yaw, pitch = ft
                R = (Matrix.Rotation(math.radians(yaw), 3, "Z") @ Matrix.Rotation(math.radians(pitch), 3, "X")
                     @ self.rest[f"foot.{side}"].to_3x3())
                Mf = R.to_4x4()
                Mf.translation = Vector((x, y, z)) * VOX
                Mf = blend(self.M(f"foot.{side}"), Mf, P.get(f"foot.{side}#w", 1.0))
                sx = 1 if side == "R" else -1
                self.limb(f"thigh.{side}", f"shin.{side}", f"foot.{side}", Mf, P.get(f"kpole.{side}", (0.15 * sx, 1, 0)))
                toe = P.get(f"fk:toe.{side}")
                if toe:
                    self.fk(f"toe.{side}", toe)
                    self.update()
        fks = {s: self.M(f"hand.{s}") @ self.rest[f"hand.{s}"].inverted() @ self.sock[f"socket.hand.{s}"] for s in "RL"}
        targets = {}
        wp = P.get("weapon")
        if wp:
            ww = P.get("weapon#w", 1.0)
            space, x, y, z, yaw, pitch, roll, prof = wp
            Mr = self.hand_target("R", space, x, y, z, yaw, pitch, roll)
            targets["R"] = blend(fks["R"], Mr, ww)
            sup = GRIP_PROFILES[prof]["support"]
            if sup:
                # support frame = grip frame translated along the grip axes (x barrel, y left, z up)
                off = Mr.to_3x3() @ Vector((sup[0], sup[1], sup[2])) * VOX
                Ml = Mr.copy()
                Ml.translation = Mr.translation + off
                targets["L"] = blend(fks["L"], Ml, ww)
        for side in ("R", "L"):
            h = P.get(f"hand.{side}")
            if h:
                targets[side] = blend(targets.get(side, fks[side]), self.hand_target(side, *h), P.get(f"hand.{side}#w", 1.0))
        for side, Ms in targets.items():
            sx = 1 if side == "R" else -1
            pole = P.get(f"pole.{side}", (0.55 * sx, -1.0, -0.25))
            self.limb(f"upper_arm.{side}", f"forearm.{side}", f"hand.{side}", self.hand_from_socket(side, Ms), pole)
            hk = P.get(f"fkpost:hand.{side}")
            if hk:
                self.fk(f"hand.{side}", hk)
                self.update()
        # small location drift from matrix assignment is not keyed except on pelvis
        for p in self.pb:
            if p.name not in ("pelvis",):
                p.location = (0, 0, 0)


# ====================================================================== pose helpers
def sym(P, bone, rx, ry=0.0, rz=0.0):
    P[f"fk:{bone}.R"] = (rx, ry, rz)
    P[f"fk:{bone}.L"] = (rx, -ry, -rz)
    return P


def mir_hand(h):
    space, x, y, z, yaw, pitch, roll = h
    return (space, -x, y, z, -yaw, pitch, -roll)


def lerp(a, b, s):
    if isinstance(a, tuple) and isinstance(b, tuple) and len(a) == len(b):
        return tuple(lerp(x, y, s) for x, y in zip(a, b))
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return a + (b - a) * s
    return b if s >= 0.5 else a


EASE = {
    "lin": lambda s: s,
    "io": lambda s: s * s * (3 - 2 * s),
    "in": lambda s: s * s,
    "out": lambda s: 1 - (1 - s) * (1 - s),
    "snap": lambda s: 1 - (1 - s) ** 3,
    "back": lambda s: 1 + 2.2 * (s - 1) ** 3 + 1.2 * (s - 1) ** 2,
}


def base_pose():
    """Relaxed contrapposto (owner: never a stiff statue): weight on the right leg, right hip up and
    shifted over the foot, left knee soft with the foot turned out and a touch forward, chest
    counter-tilted, head tilted, arms slightly away from the body, elbows soft, hands turned in."""
    P = {}
    P["pelvis"] = (0.8, 0, -0.5)
    P["fk:pelvis"] = (0, -4, 3)
    P["fk:spine"] = (2, 3, -2)
    P["fk:chest"] = (1, 2.5, -2)
    P["fk:neck"] = (0, -2, 0)
    P["fk:head"] = (-3, -4, 5)
    P["fk:upper_arm.R"] = (4, -9, 0)
    P["fk:upper_arm.L"] = (-3, 11, 0)
    P["fk:forearm.R"] = (14, 0, 0)
    P["fk:forearm.L"] = (20, 0, 0)
    P["fk:hand.R"] = (0, 0, 14)
    P["fk:hand.L"] = (4, 0, -18)
    P["foot.R"] = (4.2, 0.2, 3, -8, 0)
    P["foot.L"] = (-5.0, 2.6, 3.4, 14, -6)
    P["kpole.R"] = (0.1, 1, 0)
    P["kpole.L"] = (-0.3, 1, 0)
    return P


def pose(base=None, **kw):
    P = dict(base if base is not None else base_pose())
    for k, v in kw.items():
        P[k.replace("__", ".").replace("fk_", "fk:")] = v
    return P


TARGETS = ("hand.", "foot.", "weapon")


def fill(keys):
    """Each key is a full pose. FK channels / pelvis missing from a key default to neutral so
    interpolation is always defined; IK targets set to None are dropped (limb returns to FK)."""
    fk = {k for _, P, _ in keys for k in P if k.startswith("fk:") or k == "pelvis"}
    out = []
    for f, P, e in keys:
        Q = {k: (0.0, 0.0, 0.0) for k in fk}
        Q.update({k: v for k, v in P.items() if v is not None})
        out.append((f, Q, e))
    return out


def sample(keys, f):
    """Interpolate parameters; a target present on one side only fades in/out through a weight
    (blended against the FK pose / derived support grip) so limbs never pop."""
    for i in range(len(keys) - 1):
        f0, P0, _ = keys[i]
        f1, P1, e = keys[i + 1]
        if f0 <= f <= f1:
            s = EASE[e]((f - f0) / (f1 - f0)) if f1 > f0 else 1.0
            P = {}
            for k in set(P0) | set(P1):
                if k.endswith("#w"):
                    continue
                if k in P0 and k in P1:
                    P[k] = lerp(P0[k], P1[k], s)
                    if k.startswith(TARGETS):
                        P[k + "#w"] = lerp(P0.get(k + "#w", 1.0), P1.get(k + "#w", 1.0), s)
                elif k in P1:
                    P[k] = P1[k]
                    if k.startswith(TARGETS):
                        P[k + "#w"] = s
                else:
                    P[k] = P0[k]
                    if k.startswith(TARGETS):
                        P[k + "#w"] = 1.0 - s
            return P
    return keys[-1][1]


def blend(A, B, w):
    if w >= 0.999:
        return B.copy()
    if w <= 0.001:
        return A.copy()
    q = A.to_quaternion().slerp(B.to_quaternion(), w)
    M = q.to_matrix().to_4x4()
    M.translation = A.translation.lerp(B.translation, w)
    return M


# ====================================================================== cycles
def gait(phase, step, lift, bob, lean, arm_swing, elbow, pelvis_z=0.0, width=4.5, stance=0.6, knee_out=0.15,
         sway=0.7, drop=4.0, twist=8.0, bounce_head=2.0):
    """Parametric locomotion pose at phase in [0,1): right foot contacts at 0, left at 0.5.
    Principles: hip sway over the stance foot, hip drop on the swing side, pelvis twist with
    counter-rotating chest, a dip just after contact (squash) and a rise at passing, head and
    forearms trail the body (overlap / follow-through), feet travel in arcs with heel-toe roll."""
    P = {}
    two = 2 * math.pi
    for side, off in (("R", 0.0), ("L", 0.5)):
        ph = (phase + off) % 1.0
        sx = 1 if side == "R" else -1
        if ph < stance:            # stance: foot slides from front to back, heel-strike then toe-off
            u = ph / stance
            y = step * (0.5 - u)
            z = 3.0
            pitch = 10 * max(0.0, 1 - u / 0.15) if u < 0.15 else (0.0 if u < 0.75 else -24 * (u - 0.75) / 0.25)
        else:                      # swing: arc back to front
            u = (ph - stance) / (1 - stance)
            s = u * u * (3 - 2 * u)
            y = step * (-0.5 + s)
            z = 3.0 + lift * math.sin(math.pi * u) ** 0.8
            pitch = -24 * (1 - u) ** 2 + 10 * u * u
        P[f"foot.{side}"] = (width * sx, y, z, -6 * sx, pitch)
        P[f"kpole.{side}"] = (knee_out * sx, 1, 0)
        P[f"fk:toe.{side}"] = (min(0.0, -pitch) * 0.9 if ph < stance else 0.0, 0, 0)
    c = math.cos(two * phase)                  # +1 at right contact, -1 at left contact
    lag = math.cos(two * (phase - 0.07))       # trailing (overlap)
    # vertical: lowest shortly after each contact, highest at passing
    v = math.cos(2 * two * (phase - 0.06))
    P["pelvis"] = (sway * c, 0, pelvis_z - bob * (0.5 + 0.5 * v))
    P["fk:pelvis"] = (0, -drop * c, twist * c)
    P["fk:spine"] = (lean * 0.5, drop * 0.5 * c, -twist * 0.6 * c)
    P["fk:chest"] = (lean * 0.5 + 1.5 * v, drop * 0.4 * c, -twist * 0.9 * c)
    P["fk:neck"] = (-lean * 0.4, 0, twist * 0.5 * lag)
    P["fk:head"] = (-lean * 0.4 - bounce_head * v, -drop * 0.3 * lag, twist * 0.4 * lag)
    # arms swing opposite to legs with the forearm lagging behind the upper arm
    P["fk:upper_arm.R"] = (-arm_swing * c, -9, 0)
    P["fk:upper_arm.L"] = (arm_swing * c, 9, 0)
    P["fk:forearm.R"] = (elbow + 0.5 * elbow * max(0.0, -lag), 0, 0)
    P["fk:forearm.L"] = (elbow + 0.5 * elbow * max(0.0, lag), 0, 0)
    P["fk:hand.R"] = (6 * -lag, 0, 12)
    P["fk:hand.L"] = (6 * lag, 0, -12)
    return P


def cycle(fn, frames, **kw):
    return [(f, fn(f / frames, **kw)) for f in range(frames + 1)]


# ====================================================================== the library
def lib():
    A = {}
    B = base_pose

    def keys(name, loop, spec, meta=None):
        A[name] = {"keys": fill(spec), "loop": loop, "meta": meta or {}}

    def fnact(name, loop, frames_list, meta=None):
        A[name] = {"frames": frames_list, "loop": loop, "meta": meta or {}}

    # ---------------------------------------------------------------- idles
    def idle_at(ph, amp=1.0):
        """Breathing (2 per loop) on top of a slow weight shift toward the stance leg and back."""
        P = B()
        br = math.sin(2 * math.pi * 2 * ph)                  # breath
        ws = 0.5 - 0.5 * math.cos(2 * math.pi * ph)          # weight shift 0..1..0
        px, py, pz = P["pelvis"]
        P["pelvis"] = (px + 0.5 * amp * ws, py, pz - 0.3 * amp * (0.5 + 0.5 * br) - 0.2 * ws)
        P["fk:pelvis"] = (0, -4 - 1.5 * amp * ws, 3 + 2 * ws)
        P["fk:chest"] = (1 + 1.6 * amp * br, 2.5 + 1.2 * ws, -2 - 1.5 * ws)
        P["fk:head"] = (-3 - 1.2 * amp * br, -4 - 2 * ws, 5 - 4 * ws)
        P["fk:upper_arm.R"] = (4 + amp * br, -9 - 1.5 * amp * br, 0)
        P["fk:upper_arm.L"] = (-3 - amp * br, 11 + 1.5 * amp * br, 0)
        P["fk:forearm.R"] = (14 + 3 * amp * br, 0, 0)
        P["fk:forearm.L"] = (20 + 3 * amp * br, 0, 0)
        return P

    fnact("idle", True, cycle(idle_at, 72), {"nominalSpeed": 0})

    RIFLE_LOW = ("c", 4, 8, 32, 25, -28, 10, "rifle")

    def idle_armed_at(ph):
        P = idle_at(ph, 0.8)
        s = math.sin(2 * math.pi * ph)
        P["weapon"] = ("c", 4, 8, 32 + 0.3 * s, 25, -28 + 1.5 * s, 10, "rifle")
        P["fk:chest"] = (1.2 * s, 0, -6)
        P["fk:head"] = (0, 0, 5)
        P["pole.R"] = (0.9, -0.6, -0.4)
        P["pole.L"] = (-0.6, -0.4, -1)
        return P

    fnact("idle_armed", True, cycle(idle_armed_at, 72), {"grip": "rifle"})

    def idle_pistol_at(ph):
        P = idle_at(ph, 0.8)
        s = math.sin(2 * math.pi * ph)
        P["hand.R"] = ("c", 8, 7, 28 + 0.3 * s, 0, -35 + s, 0)
        P["pole.R"] = (1, -0.5, -0.2)
        return P

    fnact("idle_pistol", True, cycle(idle_pistol_at, 72), {"grip": "one_hand", "extra": True})

    # ---------------------------------------------------------------- locomotion
    fnact("walk", True, cycle(gait, 18, step=15, lift=3.5, bob=1.2, lean=5, arm_swing=28, elbow=18),
          {"nominalSpeed": round(2 * 15 * LEG * VOX / (18 / FPS), 3)})
    fnact("run", True, cycle(gait, 14, step=24, lift=7.5, bob=2.2, lean=16, arm_swing=50, elbow=75,
                             pelvis_z=-1.2, stance=0.4, sway=0.4, drop=3, twist=11, bounce_head=3),
          {"nominalSpeed": round(2 * 24 * LEG * VOX / (14 / FPS), 3)})

    def crouch_at(ph, moving=False):
        if moving:
            P = gait(ph, step=10, lift=2.0, bob=0.5, lean=24, arm_swing=12, elbow=40, pelvis_z=-7.5, width=5.0, knee_out=0.35)
        else:
            P = B()
            s = math.sin(2 * math.pi * ph)
            P["pelvis"] = (0, -1.5, -8 - 0.3 * s)
            P["foot.R"] = (5.5, 2.5, 3, -12, 0)
            P["foot.L"] = (-5, -2.5, 3, 10, 0)
            P["kpole.R"], P["kpole.L"] = (0.35, 1, 0), (-0.35, 1, 0)
            P["fk:spine"] = (14, 0, 0)
            P["fk:chest"] = (10 + 1.2 * s, 0, 0)
            P["fk:head"] = (-18, 0, 0)
            sym(P, "upper_arm", 20, -12, 0)
            sym(P, "forearm", 45, 0, 0)
        return P

    fnact("crouch_idle", True, cycle(crouch_at, 72))
    fnact("crouch_walk", True, cycle(lambda ph: crouch_at(ph, True), 24),
          {"nominalSpeed": round(2 * 10 * LEG * VOX / (24 / FPS), 3)})

    # ---------------------------------------------------------------- aiming / shooting
    def aim_base():
        P = B()
        P["foot.R"] = (5.5, -3.5, 3, -28, 0)
        P["foot.L"] = (-4.5, 3.5, 3, -8, 0)
        P["pelvis"] = (0, 0, -0.8)
        P["fk:pelvis"] = (0, 0, -12)
        P["fk:spine"] = (3, 0, -3)
        P["fk:chest"] = (2, 0, -3)
        P["fk:neck"] = (0, 0, 8)
        P["fk:head"] = (-2, 3, 9)
        P["pole.R"] = (1.0, -0.4, -0.6)
        P["pole.L"] = (-0.5, -0.3, -1.0)
        return P

    RIFLE_AIM = ("w", 4.5, 10, 37, 0, 0, 0, "rifle")

    def aim_rifle_at(ph):
        P = aim_base()
        s, c = math.sin(2 * math.pi * ph), math.cos(2 * math.pi * ph)
        P["weapon"] = ("w", 4.5 + 0.15 * c, 10, 37 + 0.2 * s, 0.6 * c, 0.5 * s, 0, "rifle")
        P["pelvis"] = (0, 0, -0.8 - 0.2 * s)
        return P

    fnact("aim_rifle", True, cycle(aim_rifle_at, 48), {"grip": "rifle"})

    def aim_pistol_base():
        P = B()
        P["foot.R"] = (5, -2, 3, -14, 0)
        P["foot.L"] = (-4.5, 2.5, 3, 4, 0)
        P["pelvis"] = (0, 0, -0.6)
        P["fk:pelvis"] = (0, 0, -8)
        P["fk:chest"] = (3, 0, -2)
        P["fk:head"] = (-3, 0, 8)
        P["pole.R"] = (1, -0.3, -0.8)
        P["pole.L"] = (-1, -0.3, -0.8)
        return P

    def aim_pistol_at(ph):
        P = aim_pistol_base()
        s, c = math.sin(2 * math.pi * ph), math.cos(2 * math.pi * ph)
        P["weapon"] = ("w", 1.0 + 0.15 * c, 14, 38 + 0.2 * s, 0.5 * c, 0.5 * s, 0, "pistol")
        return P

    fnact("aim_pistol", True, cycle(aim_pistol_at, 48), {"grip": "pistol"})

    def shot(base_fn, w0, kick, pitch_up, frames):
        out = []
        for f in range(frames + 1):
            k = 0.0 if f == 0 else (1.0 if f == 1 else math.exp(-(f - 1) / 2.2))
            if f == frames:
                k = 0.0
            P = base_fn(0)
            sp, x, y, z, yaw, pitch, roll, prof = w0
            P["weapon"] = (sp, x, y - kick * k, z + 0.4 * k, yaw, pitch + pitch_up * k, roll, prof)
            P["fk:chest"] = tuple(a + b for a, b in zip(P.get("fk:chest", (0, 0, 0)), (-3 * k, 0, 0)))
            P["fk:head"] = tuple(a + b for a, b in zip(P.get("fk:head", (0, 0, 0)), (-2 * k, 0, 0)))
            out.append((f, P))
        return out

    fnact("shoot_rifle", True, shot(aim_rifle_at, RIFLE_AIM, 1.6, 5, 6), {"grip": "rifle", "muzzleFlashFrame": 1,
                                                                        "note": "one shot per loop (6 frames = 4 rps); blend over aim_rifle"})
    fnact("shoot_pistol", False, shot(aim_pistol_at, ("w", 1.0, 14, 38, 0, 0, 0, "pistol"), 1.2, 14, 9),
          {"grip": "pistol", "muzzleFlashFrame": 1})

    # reload (rifle): tilt weapon, left hand to belt pouch, to mag well, slap, back to foregrip
    R0 = aim_rifle_at(0)
    RL = dict(R0)
    RL["weapon"] = ("c", 5, 10, 34, 20, -15, 35, "rifle")
    RL["fk:head"] = (10, 0, 6)
    keys("reload", False, [
        (0, R0, "io"),
        (5, dict(RL), "io"),
        (11, dict(RL, **{"hand.L": ("w", -7, 2, 27, 0, -80, 0)}), "io"),
        (16, dict(RL, **{"hand.L": ("w", -7, 1, 26, 0, -80, 0)}), "io"),
        (23, dict(RL, **{"hand.L": ("c", 4, 13, 30, 20, -15, 35)}), "io"),
        (27, dict(RL, **{"hand.L": ("c", 4, 13, 31.5, 20, -15, 35)}), "snap"),
        (31, dict(RL, **{"hand.L": None}), "io"),
        (38, R0, "io"),
    ], {"grip": "rifle"})

    # melee swing (right hand, one-handed item or bare)
    M0 = B()
    M0["foot.R"], M0["foot.L"] = (5, -3, 3, -20, 0), (-4.5, 3, 3, 0, 0)
    M0["pelvis"] = (0, 0, -1)
    keys("melee_swing", False, [
        (0, dict(M0), "io"),
        (7, dict(M0, **{"fk:pelvis": (0, 0, -25), "fk:chest": (-6, 0, -20), "fk:head": (0, 0, 30),
                        "hand.R": ("w", 9, -1, 52, -40, 70, -30), "pole.R": (1, 0, -0.2),
                        "fk:upper_arm.L": (40, 20, 0), "fk:forearm.L": (60, 0, 0)}), "io"),
        (10, dict(M0, **{"fk:pelvis": (0, 0, 20), "fk:chest": (12, 0, 25), "fk:head": (0, 0, -20), "pelvis": (0, 2, -2.5),
                         "hand.R": ("w", -4, 14, 30, 40, -40, 30), "pole.R": (1, -0.5, -0.4),
                         "fk:upper_arm.L": (-20, 30, 0), "fk:forearm.L": (40, 0, 0)}), "snap"),
        (14, dict(M0, **{"fk:pelvis": (0, 0, 28), "fk:chest": (14, 0, 30), "fk:head": (0, 0, -24), "pelvis": (0, 2.5, -3),
                         "hand.R": ("w", -8, 8, 24, 70, -70, 40), "pole.R": (1, -0.5, -0.4),
                         "fk:upper_arm.L": (-25, 35, 0), "fk:forearm.L": (30, 0, 0)}), "out"),
        (24, dict(M0), "io"),
    ], {"grip": "one_hand"})

    # throw (right hand overhand)
    T0 = B()
    keys("throw", False, [
        (0, dict(T0), "io"),
        (8, dict(T0, **{"foot.R": (5, -4, 3, -30, 0), "foot.L": (-4.5, 5, 3.6, 0, 0), "pelvis": (0, -1.5, -1.5),
                        "fk:pelvis": (0, 0, -25), "fk:chest": (-10, 0, -25), "fk:head": (0, 0, 30),
                        "hand.R": ("w", 12, -8, 46, 0, 60, 0), "pole.R": (1, 0, -0.3),
                        "fk:upper_arm.L": (70, 10, 0), "fk:forearm.L": (20, 0, 0)}), "io"),
        (12, dict(T0, **{"foot.R": (5, -4, 3.5, -30, -20), "foot.L": (-4.5, 5, 3, 0, 0), "pelvis": (0, 2, -2),
                         "fk:pelvis": (0, 0, 10), "fk:chest": (14, 0, 12), "fk:head": (0, 0, -5),
                         "hand.R": ("w", 5, 14, 46, 0, -10, 0), "pole.R": (1, -0.5, -0.2),
                         "fk:upper_arm.L": (-10, 20, 0), "fk:forearm.L": (40, 0, 0)}), "snap"),
        (16, dict(T0, **{"foot.R": (5, -3, 4, -30, -30), "foot.L": (-4.5, 5, 3, 0, 0), "pelvis": (0, 3, -2.5),
                         "fk:pelvis": (0, 0, 18), "fk:chest": (20, 0, 18), "fk:head": (-8, 0, -10),
                         "hand.R": ("w", -2, 12, 26, 20, -70, 0), "pole.R": (1, -0.3, -0.2),
                         "fk:upper_arm.L": (-25, 25, 0), "fk:forearm.L": (30, 0, 0)}), "out"),
        (28, dict(T0), "io"),
    ], {"releaseFrame": 12})

    # pick up (floor in front), ends holding at chest
    PU = B()
    down = dict(PU, **{"pelvis": (0, -4, -12), "foot.R": (5, 1.5, 3, -10, 0), "foot.L": (-5, -1.5, 3, 10, 0),
                       "kpole.R": (0.4, 1, 0), "kpole.L": (-0.4, 1, 0),
                       "fk:spine": (25, 0, 0), "fk:chest": (20, 0, 0), "fk:head": (5, 0, 0),
                       "hand.R": ("w", 4, 12, 5, 0, -70, 0), "hand.L": ("w", -4, 12, 5, 0, -70, 0),
                       "pole.R": (1, 0, 0), "pole.L": (-1, 0, 0)})
    hold = dict(PU, **{"hand.R": ("c", 7, 9, 29, 20, 0, -80), "hand.L": ("c", -7, 9, 29, -20, 0, 80),
                       "fk:chest": (-3, 0, 0), "pole.R": (1, -0.5, -0.6), "pole.L": (-1, -0.5, -0.6)})
    keys("pick_up", False, [
        (0, dict(PU), "io"),
        (10, down, "io"),
        (14, dict(down, **{"hand.R": ("w", 6, 12, 7, 0, -60, -60), "hand.L": ("w", -6, 12, 7, 0, -60, 60)}), "io"),
        (26, hold, "io"),
        (32, hold, "io"),
    ], {"attach": "item follows socket.hand.R from frame 14"})

    def carry_at(ph, moving=False):
        P = gait(ph, step=12, lift=2.5, bob=0.7, lean=2, arm_swing=0, elbow=0) if moving else idle_at(ph, 0.8)
        s = math.sin(2 * math.pi * ph * (2 if moving else 1))
        P["hand.R"] = ("c", 7, 9, 29 + 0.2 * s, 20, 0, -80)
        P["hand.L"] = ("c", -7, 9, 29 + 0.2 * s, -20, 0, 80)
        P["pole.R"], P["pole.L"] = (1, -0.5, -0.6), (-1, -0.5, -0.6)
        P["fk:chest"] = (-4, 0, P.get("fk:chest", (0, 0, 0))[2] * 0.4)
        return P

    fnact("carry_idle", True, cycle(carry_at, 72), {"carry": "box between hands, centre (0, 9, 29) vox chest-relative"})
    fnact("carry_walk", True, cycle(lambda ph: carry_at(ph, True), 18), {"nominalSpeed": round(2 * 12 * LEG * VOX / (18 / FPS), 3)})

    # use / interact: reach forward-right and press
    UI = B()
    reach = dict(UI, **{"hand.R": ("w", 5, 15, 38, 0, 0, -90), "pole.R": (1, -0.3, -0.5),
                        "fk:chest": (6, 0, 6), "fk:head": (-4, 0, -4), "pelvis": (0, 1, -0.6)})
    keys("use_interact", False, [
        (0, dict(UI), "io"),
        (8, reach, "io"),
        (11, dict(reach, **{"hand.R": ("w", 5, 17, 38, 0, 0, -90)}), "snap"),
        (15, reach, "io"),
        (24, dict(UI), "io"),
    ], {"contactFrame": 11})

    def repair_at(ph):
        P = B()
        s, c = math.sin(2 * math.pi * ph), math.cos(2 * math.pi * ph)
        s2 = math.sin(4 * math.pi * ph)
        P["pelvis"] = (0, -0.5, -2.5)
        P["foot.R"], P["foot.L"] = (5.5, 1, 3, -12, 0), (-5.5, 0, 3, 12, 0)
        P["fk:spine"] = (10, 0, 0)
        P["fk:chest"] = (8 + 1.5 * s2, 0, 3 * s)
        P["fk:head"] = (8, 0, -3 * s)
        P["weapon"] = ("w", 3 + 2.0 * c, 13 + 1.0 * s, 32 + 1.5 * s2, -20, -20 + 10 * s2, 0, "one_hand")
        P["hand.L"] = ("w", -3, 13, 33, 20, 0, 60)
        P["pole.R"], P["pole.L"] = (1, -0.5, -0.5), (-1, -0.5, -0.5)
        return P

    fnact("repair_loop", True, cycle(repair_at, 24), {"grip": "one_hand", "sparkFrames": [6, 18]})

    # sit down (onto a seat whose top is ~13 vox / 0.41 m high, behind the character)
    SEAT = B()
    SEAT.update({"pelvis": (0, -4, -11.5), "foot.R": (4.5, 7, 3, -4, 0), "foot.L": (-4.5, 7, 3, 4, 0),
                 "fk:spine": (4, 0, 0), "fk:chest": (0, 0, 0), "fk:head": (0, 0, 0),
                 "hand.R": ("w", 6, 8, 16, 0, -90, -20), "hand.L": ("w", -6, 8, 16, 0, -90, 20),
                 "pole.R": (1, -1, 0), "pole.L": (-1, -1, 0)})
    keys("sit", False, [
        (0, B(), "io"),
        (10, dict(SEAT, **{"pelvis": (0, -2, -8), "fk:spine": (22, 0, 0), "fk:chest": (12, 0, 0), "fk:head": (-18, 0, 0),
                           "foot.R": (4.5, 4, 3, -4, 0), "foot.L": (-4.5, 4, 3, 4, 0)}), "io"),
        (18, SEAT, "out"),
        (22, SEAT, "io"),
    ], {"seatHeightVox": 10})

    def sit_idle_at(ph):
        P = dict(SEAT)
        s = math.sin(2 * math.pi * ph)
        P["fk:chest"] = (1.2 * s, 0, 0)
        P["fk:head"] = (-1 * s, 0, 3 * math.sin(2 * math.pi * ph + 0.7))
        return P

    fnact("sit_idle", True, cycle(sit_idle_at, 72), {"seatHeightVox": 10})

    # ---------------------------------------------------------------- emotes
    E0 = B()

    def wave_frames():
        out = []
        n = 36
        for f in range(n + 1):
            u = f / n
            env = min(1.0, u * 5, (1 - u) * 5)
            w = math.sin(2 * math.pi * 2.5 * u)
            P = dict(E0)
            P["fk:upper_arm.R"] = (15 * env, -150 * env, 0)
            P["fk:forearm.R"] = (0, 0, 0)
            P["fk:forearm.R"] = (0, 30 * w * env, 0)
            P["fk:hand.R"] = (0, 15 * w * env, 0)
            P["fk:chest"] = (0, 3 * env, 4 * env)
            P["fk:head"] = (0, -5 * env, 0)
            out.append((f, P))
        return out

    fnact("wave", False, wave_frames())
    PT = dict(E0, **{"fk:upper_arm.R": (85, -10, 0), "fk:forearm.R": (5, 0, 0), "fk:hand.R": (0, 0, 0),
                     "fk:chest": (0, 0, 8), "fk:head": (0, 0, -6), "fk:upper_arm.L": (0, 5, 0)})
    keys("point", False, [(0, E0, "io"), (7, PT, "back"), (20, PT, "io"), (28, E0, "io")])

    def cheer_frames():
        out = []
        n = 32
        for f in range(n + 1):
            u = f / n
            env = min(1.0, u * 6, (1 - u) * 4)
            pump = 0.5 + 0.5 * math.cos(2 * math.pi * 2 * u)
            P = dict(E0)
            sym(P, "upper_arm", 20 * env, -(150 - 25 * pump) * env, 0)
            sym(P, "forearm", 20 * pump * env, 0, 0)
            P["pelvis"] = (0, 0, -0.3 - 1.2 * env * pump)
            P["fk:head"] = (-12 * env, 0, 0)
            P["fk:chest"] = (-5 * env, 0, 0)
            out.append((f, P))
        return out

    fnact("cheer", False, cheer_frames())
    TU = dict(E0, **{"fk:upper_arm.R": (55, -12, 20), "fk:forearm.R": (60, 0, 0), "fk:hand.R": (0, -70, 0),
                     "fk:chest": (0, 0, 6), "fk:head": (0, -6, -4)})
    keys("thumbs_up", False, [(0, E0, "io"), (6, TU, "back"), (18, TU, "io"), (24, E0, "io")])

    def happy_frames():
        out = []
        n = 36
        for f in range(n + 1):
            u = f / n
            env = min(1.0, u * 6, (1 - u) * 5)
            b = abs(math.sin(2 * math.pi * 2 * u))
            P = dict(E0)
            sym(P, "upper_arm", 10 * env, -35 * env, 0)
            sym(P, "forearm", 70 * env, 0, 0)
            P["pelvis"] = (0, 0, -0.3 - 1.5 * b * env)
            P["fk:head"] = (-6 * env, 12 * math.sin(2 * math.pi * 2 * u) * env, 0)
            P["fk:chest"] = (-4 * env, 4 * math.sin(2 * math.pi * 2 * u) * env, 0)
            out.append((f, P))
        return out

    fnact("emote_happy", False, happy_frames())
    SAD = dict(E0, **{"fk:spine": (8, 0, 0), "fk:chest": (14, 0, 0), "fk:neck": (10, 0, 0), "fk:head": (22, 0, 0),
                      "fk:shoulder.R": (8, 0, 0), "fk:shoulder.L": (8, 0, 0), "pelvis": (0, 0, -1)})
    sym(SAD, "upper_arm", 6, -2, 0)
    sym(SAD, "forearm", 4, 0, 0)
    SAD2 = dict(SAD, **{"fk:head": (24, 0, 6), "fk:chest": (15, 0, 3)})
    keys("emote_sad", False, [(0, E0, "io"), (10, SAD, "io"), (22, SAD2, "io"), (34, SAD, "io"), (44, E0, "io")])
    ANG = dict(E0, **{"fk:chest": (10, 0, 0), "fk:head": (8, 0, 0), "pelvis": (0, 0, -1.5),
                      "foot.R": (6, 1, 3, -15, 0), "foot.L": (-6, 0, 3, 15, 0)})
    sym(ANG, "upper_arm", -10, -25, 0)
    sym(ANG, "forearm", 80, 0, 0)
    ANG2 = dict(ANG, **{"foot.R": (6, 1, 5.5, -15, 0), "pelvis": (0, 0, -0.5)})
    ANG3 = dict(ANG, **{"fk:chest": (13, 0, 0), "pelvis": (0, 0, -2)})
    keys("emote_angry", False, [(0, E0, "io"), (6, ANG, "snap"), (10, ANG2, "io"), (13, ANG3, "snap"),
                                (17, ANG2, "io"), (20, ANG3, "snap"), (30, ANG, "io"), (38, E0, "io")])
    CON = dict(E0, **{"fk:head": (0, 18, 6), "fk:chest": (0, 4, 0), "hand.R": ("c", 9, 2, 57, 0, 90, -60),
                      "pole.R": (1, 0, 0)})
    CON2 = dict(CON, **{"hand.R": ("c", 9, 3, 58, 0, 90, -60), "fk:head": (0, 20, 2)})
    sym(CON, "forearm", 12, 0, 0)
    keys("emote_confused", False, [(0, E0, "io"), (8, CON, "io"), (12, CON2, "io"), (16, CON, "io"), (20, CON2, "io"),
                                   (24, CON, "io"), (34, E0, "io")])

    def celebrate_frames():
        out = []
        n = 36
        for f in range(n + 1):
            u = f / n
            # anticipation (0-.2), jump (.2-.55), land (.55-.7), settle
            if u < 0.2:
                j, crouch = 0.0, math.sin(u / 0.2 * math.pi / 2)
            elif u < 0.55:
                v = (u - 0.2) / 0.35
                j, crouch = 9 * math.sin(math.pi * v), 0.0
            elif u < 0.7:
                j, crouch = 0.0, math.sin((u - 0.55) / 0.15 * math.pi)
            else:
                j, crouch = 0.0, 0.0
            env = min(1.0, u * 8, (1 - u) * 4)
            P = dict(E0)
            air = j > 0
            P["pelvis"] = (0, 0, -0.3 - 4.5 * crouch + j)
            if air:
                P["foot.R"] = (4.5, 0.5, 3 + j - 0.6 * j, -6, -20)
                P["foot.L"] = (-4.5, 0.5, 3 + j - 0.6 * j, 6, -20)
            P["fk:upper_arm.R"] = (30 * env, -165 * env if u > 0.18 else -20 * env, 0)
            P["fk:forearm.R"] = (15 * env, 0, 0)
            P["fk:upper_arm.L"] = (20 * env, 40 * env, 0)
            P["fk:forearm.L"] = (70 * env, 0, 0)
            P["fk:head"] = (-15 * env if air else 0, 0, 0)
            P["fk:chest"] = (-6 * env if air else 6 * crouch, 0, 0)
            out.append((f, P))
        return out

    fnact("celebrate", False, celebrate_frames())

    HURT = dict(E0, **{"fk:spine": (-8, 0, 6), "fk:chest": (-14, 4, 8), "fk:head": (-18, 6, 0), "pelvis": (0, -2, -1.5),
                       "foot.R": (4.5, -1, 3, -6, 0), "foot.L": (-4.5, 1.5, 3, 6, 0)})
    sym(HURT, "upper_arm", 35, -30, 0)
    sym(HURT, "forearm", 60, 0, 0)
    keys("hurt", False, [(0, E0, "snap"), (3, HURT, "io"), (8, dict(HURT, **{"fk:chest": (-6, 2, 4)}), "io"), (16, E0, "io")])

    # death: stagger back, knees buckle, fall onto the back
    D1 = dict(HURT, **{"pelvis": (0, -3, -2)})
    D2 = dict(E0, **{"pelvis": (0, -6, -12), "foot.R": (5, 2, 3, -20, 0), "foot.L": (-5, 3, 3, 20, 0),
                     "fk:spine": (-15, 0, 0), "fk:chest": (-15, 0, 5), "fk:head": (-10, 10, 0),
                     "kpole.R": (0.6, 1, 0), "kpole.L": (-0.6, 1, 0)})
    sym(D2, "upper_arm", 40, -50, 0)
    sym(D2, "forearm", 30, 0, 0)
    LIE = {"pelvis": (0, -14, -20.5), "fk:pelvis": (-88, 0, 0), "fk:spine": (4, 0, 0), "fk:chest": (2, 0, 3),
           "fk:head": (8, 25, 0), "fk:thigh.R": (6, -8, 0), "fk:thigh.L": (14, 6, 0), "fk:shin.R": (-8, 0, 0),
           "fk:shin.L": (-24, 0, 0), "fk:foot.R": (30, 0, 0), "fk:foot.L": (25, 0, 0),
           "fk:upper_arm.R": (40, -70, 0), "fk:upper_arm.L": (20, 80, 0), "fk:forearm.R": (30, 0, 0),
           "fk:forearm.L": (10, 0, 0), "foot.R": None, "foot.L": None}
    keys("death", False, [(0, E0, "snap"), (5, D1, "io"), (14, D2, "in"), (24, LIE, "back"), (40, LIE, "io")],
         {"endsLying": True})

    def ko_at(ph):
        P = {k: v for k, v in LIE.items() if v is not None}
        s = math.sin(2 * math.pi * ph)
        P["fk:chest"] = (2 - 1.5 * s, 0, 3)
        P["fk:head"] = (8 + 1 * s, 25, 0)
        return P

    fnact("knocked_out", True, cycle(ko_at, 72), {"lying": True})
    SITUP = dict(LIE, **{"pelvis": (0, -9, -19.5), "fk:pelvis": (-80, 0, 0), "fk:spine": (35, 0, 0), "fk:chest": (30, 0, 0),
                         "fk:head": (0, 0, 0), "fk:upper_arm.R": (-30, -20, 0), "fk:upper_arm.L": (-30, 20, 0),
                         "fk:forearm.R": (10, 0, 0), "fk:forearm.L": (10, 0, 0), "fk:thigh.R": (0, -6, 0),
                         "fk:thigh.L": (60, 6, 0), "fk:shin.L": (-110, 0, 0)})
    KNEEL = dict(E0, **{"pelvis": (0, -2, -9), "foot.R": (5, 7, 3, -10, 0), "foot.L": (-5, -8, 3.5, 10, -60),
                        "fk:spine": (20, 0, 0), "fk:chest": (15, 0, 0), "fk:head": (-20, 0, 0),
                        "hand.R": ("w", 6, 10, 18, 0, -80, 0), "pole.R": (1, 0, 0)})
    keys("revive", False, [(0, {k: v for k, v in LIE.items()}, "io"), (10, SITUP, "io"), (20, KNEEL, "io"),
                           (34, E0, "io")], {"startsLying": True})

    def hover_at(ph):
        P = B()
        s = math.sin(2 * math.pi * ph)
        P["foot.R"] = None
        P["foot.L"] = None
        P = {k: v for k, v in P.items() if v is not None}
        P["pelvis"] = (0, 0, 4 + 1.2 * s)
        P["fk:thigh.R"] = (18 + 4 * s, -4, 0)
        P["fk:shin.R"] = (-35 - 6 * s, 0, 0)
        P["fk:thigh.L"] = (4 - 3 * s, 5, 0)
        P["fk:shin.L"] = (-12 + 4 * s, 0, 0)
        P["fk:foot.R"] = (-25, 0, 0)
        P["fk:foot.L"] = (-30, 0, 0)
        sym(P, "upper_arm", 10, -30 - 4 * s, 0)
        sym(P, "forearm", 25, 0, 0)
        P["fk:chest"] = (4 + 1.5 * s, 0, 0)
        P["fk:head"] = (-6, 0, 0)
        return P

    fnact("jetpack_hover", True, cycle(hover_at, 48), {"thrusterSocket": "socket.back"})

    def climb_at(ph):
        """Ladder at y = 7 vox, rungs every 10 vox; the body stays in place and rungs scroll down."""
        P = B()
        P = {k: v for k, v in P.items() if not k.startswith("foot.")}
        rung = 10.0
        for side, off in (("R", 0.0), ("L", 0.5)):
            sx = 1 if side == "R" else -1
            u = (ph + off) % 1.0
            if u < 0.6:       # holding: hand moves down with the body climbing
                z = 54 - rung * 2 * (u / 0.6)
                y = 7.5
            else:             # reach up to the next rung two rungs above
                v = (u - 0.6) / 0.4
                z = 34 + rung * 2 * (v * v * (3 - 2 * v))
                y = 7.5 - 3 * math.sin(math.pi * v)
            P[f"hand.{side}"] = ("w", 5 * sx, y, z, 0, 90, -90 * sx)
            P[f"pole.{side}"] = (1.0 * sx, -0.6, -0.3)
            uf = (ph + off + 0.5) % 1.0
            if uf < 0.6:
                fz = 13 - rung * 2 * (uf / 0.6)
                fy = 4.5
            else:
                v = (uf - 0.6) / 0.4
                fz = -7 + rung * 2 * (v * v * (3 - 2 * v))
                fy = 4.5 - 3 * math.sin(math.pi * v)
            P[f"foot.{side}"] = (4.5 * sx, fy, max(3.0, fz + 3), 0, 0)
        P["pelvis"] = (0, 1.5, 0.5 * math.sin(4 * math.pi * ph))
        P["fk:chest"] = (5, 0, 3 * math.sin(2 * math.pi * ph))
        P["fk:head"] = (-15, 0, 0)
        return P

    fnact("climb_ladder", True, cycle(climb_at, 30), {"ladderYVox": 7.5, "rungSpacingVox": 7,
                                                        "climbSpeed": round(2 * 10 * LEG * VOX / (30 / FPS), 3)})
    return A


def build_actions(arm, sc, only=None):
    poser = Poser(arm)
    arm.animation_data_create()
    L = lib()
    meta = []
    for name in rig.ACTIONS + [n for n in L if n not in rig.ACTIONS]:
        if only and name not in only:
            continue
        spec = L[name]
        act = bpy.data.actions.new(name)
        act.use_fake_user = True
        arm.animation_data.action = act
        poser.lastq = {}
        if "frames" in spec:
            frames = spec["frames"]
        else:
            ks = spec["keys"]
            frames = [(f, sample(ks, f)) for f in range(ks[0][0], ks[-1][0] + 1)]
        for f, P in frames:
            poser.apply(P)
            poser.key(f)
        for fc in act.fcurves:
            for kp in fc.keyframe_points:
                kp.interpolation = "LINEAR"
        act.use_frame_range = True
        act.frame_start, act.frame_end = frames[0][0], frames[-1][0]
        act.use_cyclic = spec["loop"]
        act["loop"] = spec["loop"]
        m = {"name": name, "frames": frames[-1][0] - frames[0][0], "fps": FPS, "loop": spec["loop"],
             "seconds": round((frames[-1][0] - frames[0][0]) / FPS, 3), "extra": name not in rig.ACTIONS}
        m.update(spec["meta"])
        meta.append(m)
    arm.animation_data.action = None
    poser.reset()
    bpy.context.view_layer.update()
    return meta
