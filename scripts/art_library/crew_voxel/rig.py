"""crew_rig skeleton, sockets and segment layout (single source of truth).

Units are voxels (1/32 m) in Blender armature space: origin at feet centre, Z up, +Y forward
(the character faces +Y), so the character's RIGHT side is +X and .R bones sit at +X.
glTF export converts to Y-up: gltf = (x, z, -y), so glTF forward is -Z.

All body variants share this exact skeleton so every animation, armour piece and socket works
on every variant. Variants only change geometry inside the segment bounds.
"""
import math

REVISION = "r003"
SPEC_VERSION = 2
VOX = 1.0 / 32.0

# r002 = CHARACTER_SPEC v2 chibi proportions (~2.8 heads): skull 37..55, hair to 58 (1.81 m),
# shoulder line 36, belt 22..24, crotch 18, knee 10, ankle 3. Arms hang to the hip line.
# name: (head, tail, parent). Only .R is listed for paired bones; .L mirrors x.
_BONES = [
    ("root", (0, 0, 0), (0, 6, 0), None),
    ("pelvis", (0, 0, 19), (0, 0, 23), "root"),
    ("spine", (0, 0, 23), (0, 0, 28), "pelvis"),
    ("chest", (0, 0, 28), (0, 0, 36), "spine"),
    ("neck", (0, 0, 36), (0, 0, 37), "chest"),
    ("head", (0, 0, 37), (0, 0, 55), "neck"),
    ("shoulder.R", (2, 0, 33), (9.5, 0, 34), "chest"),
    ("upper_arm.R", (9.5, 0, 34), (9.5, 0, 26), "shoulder.R"),
    ("forearm.R", (9.5, 0, 26), (9.5, 0, 20), "upper_arm.R"),
    ("hand.R", (9.5, 0, 20), (9.5, 0, 13), "forearm.R"),
    ("thigh.R", (4, 0, 19), (4, 0, 10), "pelvis"),
    ("shin.R", (4, 0, 10), (4, 0, 3), "thigh.R"),
    ("foot.R", (4, 0, 3), (4, 3, 1), "shin.R"),
    ("toe.R", (4, 3, 1), (4, 6, 1), "foot.R"),
]

# Landmarks (voxels) used by the animation library to retarget poses authored on r001.
LANDMARKS = {"ankle": 3, "knee": 10, "hip": 19, "chestBase": 28, "shoulder": 34, "shoulderLine": 36,
             "skullBase": 37, "skullTop": 55, "hairTop": 58, "armX": 9.5, "legX": 4}


def _mirror(name):
    return name[:-2] + ".L" if name.endswith(".R") else name


def bones():
    out = []
    for n, h, t, p in _BONES:
        out.append((n, h, t, p))
        if n.endswith(".R"):
            out.append((_mirror(n), (-h[0], h[1], h[2]), (-t[0], t[1], t[2]), _mirror(p) if p else p))
    return out


BONE_ORDER = [b[0] for b in bones()]

# Sockets: name -> (parent bone, location in voxels (rest, armature space), local axes as world
# vectors (x_axis, z_axis)). Convention (CHARACTER_SPEC v1): local -Y is the outward/forward
# direction of the socket; hand sockets: +X along the barrel, +Z toward the top of the weapon,
# origin at the grip centre. Y axis = Z x X.
F, B, U, D, R, L = (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1), (1, 0, 0), (-1, 0, 0)
_SOCKETS = {
    "socket.head": ("head", (0, 0, 55), L, F),          # top of skull; -Y = up, +Z = forward
    "socket.face": ("head", (0, 8, 44), L, U),          # face plane y=8, eye line; -Y = forward
    "socket.eyes": ("head", (0, 8, 44.5), L, U),
    "socket.chest": ("chest", (0, 5, 31), L, U),        # chest front face y=5; -Y = forward
    "socket.back": ("chest", (0, -5, 31), R, U),         # back face y=-5; -Y = backward
    "socket.belt": ("pelvis", (0, 0, 23), L, U),         # belt centre line, -Y forward
    "socket.shoulder.R": ("upper_arm.R", (9.5, 0, 36), F, U),   # top of deltoid, -Y = +X (outward)
    "socket.hip.R": ("pelvis", (7, 0, 20), F, U),        # -Y = +X (outward, right side)
    "socket.hand.R": ("hand.R", (9.5, 0.5, 16), F, U),   # fist centre; +X barrel forward, -Y = +X
    "socket.hand.L": ("hand.L", (-9.5, 0.5, 16), F, U),
    "socket.foot.R": ("foot.R", (4, 0, 0), L, U),        # sole centre under ankle, -Y forward
    "socket.glove.R": ("hand.R", (9.5, 0, 20), L, U),    # wrist centre, -Y forward
}


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def sockets():
    out = {}
    for n, (bone, loc, xa, za) in _SOCKETS.items():
        out[n] = (bone, loc, xa, _cross(za, xa), za)
        if n.endswith(".R"):
            mb = bone[:-2] + ".L" if bone.endswith(".R") else bone
            mloc = (-loc[0], loc[1], loc[2])
            if n in ("socket.hand.R",):
                continue  # hand.L is authored explicitly (support grip keeps +X forward)
            # mirrored outward: shoulder/hip -Y must point -X. Keep X forward, flip Z? No: keep Z up and
            # use X = back so that Y = Z x X = up x back = +X  => -Y = -X (outward left).
            if n in ("socket.shoulder.R", "socket.hip.R"):
                mx, mz = B, U
            else:
                mx, mz = xa, za
            out[n[:-2] + ".L"] = (mb, mloc, mx, _cross(mz, mx), mz)
    return dict(sorted(out.items()))


ACTIONS = [
    "idle", "idle_armed", "walk", "run", "crouch_idle", "crouch_walk", "aim_rifle", "aim_pistol", "shoot_rifle",
    "shoot_pistol", "reload", "melee_swing", "throw", "pick_up", "carry_idle", "carry_walk", "use_interact",
    "repair_loop", "sit", "sit_idle", "wave", "point", "cheer", "thumbs_up", "emote_happy", "emote_sad",
    "emote_angry", "emote_confused", "celebrate", "hurt", "death", "knocked_out", "revive", "jetpack_hover",
    "climb_ladder",
]

# Segment layout: which bone each named body segment rides on. Armour agents replace segments
# per bone; bounds (voxels) are measured from the built male/female/neutral geometry at export.
SEGMENTS = {
    "head": ["head"], "neck": ["neck"], "torso": ["chest", "spine"], "hips": ["pelvis"],
    "shoulders": ["shoulder.L", "shoulder.R"], "upper_arms": ["upper_arm.L", "upper_arm.R"],
    "forearms": ["forearm.L", "forearm.R"], "hands": ["hand.L", "hand.R"],
    "thighs": ["thigh.L", "thigh.R"], "shins": ["shin.L", "shin.R"],
    "feet": ["foot.L", "foot.R", "toe.L", "toe.R"],
}

# Equipment slot -> socket / bones it rides on (for CHAR-ARMOR / CHAR-HEADS / CHAR-WEAPONS).
EQUIPMENT_SLOTS = {
    "hair": {"socket": "socket.head", "bones": ["head"]},
    "helmet": {"socket": "socket.head", "bones": ["head"]},
    "face": {"socket": "socket.face", "bones": ["head"]},
    "visor": {"socket": "socket.eyes", "bones": ["head"]},
    "chest": {"socket": "socket.chest", "bones": ["chest", "spine"]},
    "shoulders": {"socket": ["socket.shoulder.L", "socket.shoulder.R"], "bones": ["upper_arm.L", "upper_arm.R"]},
    "gloves": {"socket": ["socket.glove.L", "socket.glove.R"], "bones": ["hand.L", "hand.R", "forearm.L", "forearm.R"]},
    "belt": {"socket": "socket.belt", "bones": ["pelvis"]},
    "legs": {"socket": None, "bones": ["thigh.L", "thigh.R", "shin.L", "shin.R"]},
    "boots": {"socket": ["socket.foot.L", "socket.foot.R"], "bones": ["foot.L", "foot.R", "toe.L", "toe.R", "shin.L", "shin.R"]},
    "back": {"socket": "socket.back", "bones": ["chest"]},
    "holster": {"socket": ["socket.hip.L", "socket.hip.R"], "bones": ["pelvis"]},
    "hand_primary": {"socket": "socket.hand.R", "bones": ["hand.R"]},
    "hand_support": {"socket": "socket.hand.L", "bones": ["hand.L"]},
}


def m(v):
    return [round(c * VOX, 6) for c in v]


def gltf(v):
    """Blender Z-up (+Y forward) metres -> glTF Y-up."""
    return [round(v[0], 6), round(v[2], 6), round(-v[1], 6)]


def quat_from_axes(x, y, z):
    """Rotation matrix columns x,y,z -> quaternion (w, x, y, z)."""
    m00, m01, m02 = x[0], y[0], z[0]
    m10, m11, m12 = x[1], y[1], z[1]
    m20, m21, m22 = x[2], y[2], z[2]
    tr = m00 + m11 + m22
    if tr > 0:
        s = math.sqrt(tr + 1.0) * 2
        return (0.25 * s, (m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s)
    if m00 > m11 and m00 > m22:
        s = math.sqrt(1.0 + m00 - m11 - m22) * 2
        return ((m21 - m12) / s, 0.25 * s, (m01 + m10) / s, (m02 + m20) / s)
    if m11 > m22:
        s = math.sqrt(1.0 + m11 - m00 - m22) * 2
        return ((m02 - m20) / s, (m01 + m10) / s, 0.25 * s, (m12 + m21) / s)
    s = math.sqrt(1.0 + m22 - m00 - m11) * 2
    return ((m10 - m01) / s, (m02 + m20) / s, (m12 + m21) / s, 0.25 * s)
