"""Character socket frames the item kit binds to (CHAR-BODY spec r001, Blender frame, voxels).

Source: /root/sidereal-progress/_shared/CHARACTER_SPEC_BODY.json (schema sidereal.crew.body-spec/1,
spec_version 2, revision r004 chibi body; proposal, not owner-approved). `load_spec` refreshes
these from the published file at build time so a CHAR-BODY revision bump does not need a code edit. Values are copied so the kit builds without the
shared folder; build.py re-validates them against that file when it exists.

Socket axes are the socket's local X/Y/Z expressed in the character body frame (rest pose):
character faces +Y, right = +X, Z up. Local -Y is the socket's outward direction; hand sockets
have their origin at the grip centre, +X along the barrel and +Z toward the top of the item.
"""
import math

BODY_SPEC_REVISION = "r004"
VOX = 1 / 32

SOCKETS = {
    "socket.hand.R": {"bone": "hand.R", "vox": (9.5, 0.5, 18), "x": (0, 1, 0), "y": (-1, 0, 0), "z": (0, 0, 1)},
    "socket.hand.L": {"bone": "hand.L", "vox": (-9.5, 0.5, 18), "x": (0, 1, 0), "y": (-1, 0, 0), "z": (0, 0, 1)},
    "socket.hip.R": {"bone": "pelvis", "vox": (7, 0, 21), "x": (0, 1, 0), "y": (-1, 0, 0), "z": (0, 0, 1)},
    "socket.hip.L": {"bone": "pelvis", "vox": (-7, 0, 21), "x": (0, -1, 0), "y": (1, 0, 0), "z": (0, 0, 1)},
    "socket.back": {"bone": "chest", "vox": (0, -5, 32), "x": (1, 0, 0), "y": (0, 1, 0), "z": (0, 0, 1)},
    "socket.belt": {"bone": "pelvis", "vox": (0, 0, 24), "x": (-1, 0, 0), "y": (0, -1, 0), "z": (0, 0, 1)},
}

# Item frame (+X right, +Y forward, +Z up) -> hand socket frame (+X barrel, +Z up): item +Y -> socket +X,
# item +X -> socket -Y. That is a -90 degree rotation about Z. Quaternion (w, x, y, z).
ITEM_TO_HAND_SOCKET_WXYZ = (math.cos(-math.pi / 4), 0.0, 0.0, math.sin(-math.pi / 4))


def _dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def body_dir_to_socket(socket, v):
    s = SOCKETS[socket]
    return tuple(round(_dot(v, s[k]), 6) for k in ("x", "y", "z"))


def quat_from_axes(x, y, z):
    """Rotation whose columns are the given orthonormal axes -> quaternion (w, x, y, z)."""
    m00, m01, m02 = x[0], y[0], z[0]
    m10, m11, m12 = x[1], y[1], z[1]
    m20, m21, m22 = x[2], y[2], z[2]
    tr = m00 + m11 + m22
    if tr > 0:
        s = math.sqrt(tr + 1.0) * 2
        q = (0.25 * s, (m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s)
    elif m00 > m11 and m00 > m22:
        s = math.sqrt(1.0 + m00 - m11 - m22) * 2
        q = ((m21 - m12) / s, 0.25 * s, (m01 + m10) / s, (m02 + m20) / s)
    elif m11 > m22:
        s = math.sqrt(1.0 + m11 - m00 - m22) * 2
        q = ((m02 - m20) / s, (m01 + m10) / s, 0.25 * s, (m12 + m21) / s)
    else:
        s = math.sqrt(1.0 + m22 - m00 - m11) * 2
        q = ((m10 - m01) / s, (m02 + m20) / s, (m12 + m21) / s, 0.25 * s)
    n = math.sqrt(sum(c * c for c in q))
    return tuple(round(c / n, 6) for c in q)


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def norm(v):
    n = math.sqrt(_dot(v, v))
    return tuple(c / n for c in v)


def holster_local(preset):
    """Holster preset (item forward/up in BODY frame + body-frame offset) -> socket-local rotation
    quaternion (w,x,y,z) of the item frame and socket-local offset in metres."""
    if preset is None:
        return None
    f, u = norm(preset["forward"]), norm(preset["up"])
    r = norm(cross(f, u))                    # item +X = forward x up (right-handed: X = Y x Z)
    u = cross(r, f)
    sock = preset["socket"]
    xs, ys, zs = (body_dir_to_socket(sock, a) for a in (r, f, u))
    return {"socket": sock, "rotationWXYZ": quat_from_axes(xs, ys, zs),
            "offset": body_dir_to_socket(sock, preset["offset"])}


# Grip profiles (socket.hand.R frame: +X barrel, +Y left, +Z up) shared with CHAR-BODY r004 (spec
# gripProfiles); converted to the item frame (item +Y = socket +X, item +X = socket -Y). Items put
# their support grip here and the armed clips solve hand.L onto the item's support socket per frame.
GRIP_PROFILES_SOCKET = {"rifle": (6.0, 1.0, 0.5), "pistol": (-0.5, 2.5, -1.0), "tool": (6.0, 0.0, 1.0)}
# Torso / head boxes (armature voxels, rest pose) used for item-into-body clipping checks.
BODY_BOXES = {"chest": ((-7, -5, 29), (7, 6, 37)), "spine": ((-6, -5, 24), (6, 6, 29)), "head": ((-8, -7, 39), (8, 7, 55))}


def load_spec(spec):
    """Adopt socket positions/axes, grip profiles and torso/head boxes from a published body spec."""
    global BODY_SPEC_REVISION
    by = {s["name"]: s for s in spec.get("sockets", [])}
    for name, s in SOCKETS.items():
        o = by.get(name)
        if o:
            s["vox"] = tuple(float(v) for v in o["locationVox"])
            for k in ("x", "y", "z"):
                s[k] = tuple(round(v) for v in o["axes"][k])
    for name, off in (spec.get("gripProfiles") or {}).items():
        if name in GRIP_PROFILES_SOCKET and off and off.get("support"):
            GRIP_PROFILES_SOCKET[name] = tuple(off["support"])
    seg = spec.get("segments") or {}
    for bone in BODY_BOXES:
        m = (seg.get(bone) or {}).get("male")
        if m:
            BODY_BOXES[bone] = (tuple(m["minVox"]), tuple(m["maxVox"]))
    BODY_SPEC_REVISION = spec.get("revision", BODY_SPEC_REVISION)


def support_offset_item(profile):
    x, y, z = GRIP_PROFILES_SOCKET[profile]
    return (-y, x, z)


def validate_against(spec):
    """Return a list of mismatches between these copied frames and a loaded body-spec JSON."""
    issues = []
    by = {s["name"]: s for s in spec.get("sockets", [])}
    for name, s in SOCKETS.items():
        o = by.get(name)
        if not o:
            issues.append(f"{name} missing")
            continue
        if tuple(float(v) for v in o["locationVox"]) != tuple(float(v) for v in s["vox"]):
            issues.append(f"{name} location {o['locationVox']} != {s['vox']}")
        for k in ("x", "y", "z"):
            if tuple(round(v) for v in o["axes"][k]) != s[k]:
                issues.append(f"{name} axis {k} {o['axes'][k]} != {s[k]}")
    return issues
