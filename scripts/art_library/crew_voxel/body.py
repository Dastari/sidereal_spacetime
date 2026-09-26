"""Base crew body r002 (CHARACTER_SPEC v2, chibi ~2.8 heads): undersuit, glove/boot bases,
neutral head blank (big dark eyes, highlight, blush) and default clumped hair.

Authored in rest-pose armature voxels (1/32 m; x right, y forward, z up). Every bone owns a
voxkit.Part made of brick ISLANDS: seams (bevels) appear only between authored bricks (collar,
pockets, cuffs, belt, boots, hair clumps), never between every fine voxel. Silhouette steps use
2-voxel main blocks; single voxels are used only for detail (eyes, pins, seams, lights).
Right-side limbs are authored at +x and mirrored.

Layout (voxels): sole 0 | boots 0..7 | ankle 3 | knee 10 | crotch 18 | hip joint 19 | belt 22..24 |
shoulder line 36 | neck 35..38 | skull 37..55 (18 tall, 18 wide, 16 deep) | hair to 58 (1.81 m).
Legs x 1..7 (gap 2), torso x -7..7, arms x 7..12, hands x 6..13 hanging at z 13..19.
"""
from voxkit import Part, Vol

P, S, A, M, D, K, H, E, EM = ("suit_primary", "suit_secondary", "accent", "metal", "dark", "skin", "hair", "eye", "emit")
BL = "skin:blush"

VARIANTS = {
    "male": dict(waist=6, bust=False, lashes=False, pockets=True, hair="short"),
    "female": dict(waist=5, bust=True, lashes=True, pockets=False, hair="long"),
    "neutral": dict(waist=6, bust=False, lashes=False, pockets=True, hair="short"),
}


def legs():
    th, sh, ft, to = Part(), Part(), Part(), Part()
    th.brick(1, -3, 10, 7, 4, 19, P)
    th.paint(6, 0, 11, 7, 1, 18, S)                        # outer trouser seam (fine detail)
    th.brick(7, -2, 12, 8, 2, 16, P)                       # cargo pocket
    th.brick(7, -2, 16, 8, 2, 17, S)                       # pocket flap
    sh.brick(1, -3, 7, 7, 4, 10, P)
    sh.brick(0, -4, 5, 8, 5, 8, P)                         # trouser hem, flared over the boot top
    sh.brick(2, 4, 8, 6, 5, 11, S)                         # knee panel
    sh.brick(1, -4, 3, 8, 5, 6, D)                         # boot shaft (flares 1 outward)
    sh.brick(1, -4, 6, 8, 5, 7, D)                         # boot rim
    ft.brick(1, -4, 1, 8, 4, 3, D)                         # boot upper
    ft.brick(1, -4, 0, 8, 4, 1, M)                         # sole (distinct, pale)
    ft.brick(1, -5, 1, 8, -4, 3, S)                        # heel counter
    to.brick(1, 4, 1, 8, 7, 3, D).cut(1, 6, 2, 8, 7, 3)    # toe cap, stepped front
    to.brick(1, 4, 0, 8, 7, 1, M)                          # toe sole
    return {"thigh.R": th, "shin.R": sh, "foot.R": ft, "toe.R": to}


def arms(v):
    ua, fa, hd = Part(), Part(), Part()
    ua.brick(7, -3, 31, 12, 3, 36, P).cut(11, -3, 35, 12, 3, 36)   # sleeve cap (stepped outer top)
    ua.brick(7, -2, 26, 12, 3, 31, P)                               # upper arm 5x5
    fa.brick(7, -2, 21, 12, 3, 26, P)                               # forearm 5x5
    fa.brick(6, -3, 19, 13, 4, 21, S)                               # cuff, 1 proud
    hd.brick(7, -3, 14, 13, 3, 19, K).cut(7, 2, 14, 13, 3, 15)     # chunky fist cube 6x6x5
    hd.brick(7, 3, 15, 9, 4, 18, K)                                 # thumb, forward-inside
    return {"upper_arm.R": ua, "forearm.R": fa, "hand.R": hd}


def torso(v):
    w = v["waist"]
    pe, sp, ch, nk = Part(), Part(), Part(), Part()
    pe.brick(-7, -4, 18, 7, 5, 23, P).cut(-1, -4, 18, 1, 5, 19)    # hips, crotch notch
    pe.brick(-7, -5, 22, 7, 6, 24, D)                               # belt (1 proud front/back)
    pe.brick(-2, 6, 22, 2, 7, 24, M).paint(-1, 6, 22, 1, 7, 24, A)  # buckle
    pe.brick(3, 6, 22, 5, 7, 24, D)                                 # belt keeper
    sp.brick(-w, -4, 23, w, 5, 29, P)
    sp.paint(-1, 4, 23, 0, 5, 29, S)                                # front seam
    ch.brick(-7, -5, 28, 7, 5, 36, P).cut(-7, -5, 35, -6, 5, 36).cut(6, -5, 35, 7, 5, 36)
    if v["pockets"]:
        ch.brick(-6, 5, 29, -2, 6, 32, P)                           # chest pockets + flaps
        ch.brick(-6, 5, 32, -2, 6, 33, S)
        ch.brick(2, 5, 29, 6, 6, 32, P)
        ch.brick(2, 5, 32, 6, 6, 33, S)
        ch.brick(3, 6, 32, 5, 7, 33, A)                             # name tab
    if v["bust"]:
        ch.brick(-5, 5, 30, 5, 6, 33, P).cut(-5, 5, 30, -4, 6, 31).cut(4, 5, 30, 5, 6, 31)
        ch.paint(-1, 5, 30, 0, 6, 33, S)
        ch.brick(3, 6, 33, 5, 7, 34, A)
    ch.brick(-5, 5, 33, -3, 6, 34, M)                               # rank pins
    ch.brick(4, 5, 34, 5, 6, 35, EM)                                # status light
    col = Vol().box(-4, -5, 35, 4, 4, 37, S)                        # standing collar
    col.cut(-3, -4, 35, 3, 3, 37).cut(-1, 3, 35, 1, 4, 37)
    ch.island(col)
    ch.brick(-3, 5, 34, -1, 6, 36, P)                               # lapels
    ch.brick(1, 5, 34, 3, 6, 36, P)
    ch.brick(-3, -6, 29, 3, -5, 33, S).paint(-1, -6, 30, 1, -5, 32, A)   # back O2 port
    nk.brick(-2, -2, 34, 2, 2, 38, K)
    return {"pelvis": pe, "spine": sp, "chest": ch, "neck": nk}


def head(v):
    hd = Part()
    sk = Vol().box(-9, -8, 38, 9, 8, 54, K).box(-8, -7, 54, 8, 7, 55, K).box(-8, -7, 37, 8, 7, 38, K)
    for x in (-9, 8):
        sk.cut(x, -8, 38, x + 1, -7, 54).cut(x, 7, 38, x + 1, 8, 54)
    # face (front layer y = 7): big dark eyes 3x4 with a 1-voxel highlight, small mouth, blush
    for x0 in (-6, 3):
        sk.paint(x0, 7, 41, x0 + 3, 8, 45, E)
        sk.paint(x0, 7, 44, x0 + 1, 8, 45, M)
    if v["lashes"]:
        sk.paint(-7, 7, 44, -6, 8, 46, E).paint(6, 7, 44, 7, 8, 46, E)
    sk.paint(-6, 7, 46, -3, 8, 47, H).paint(3, 7, 46, 6, 8, 47, H)  # brows
    sk.paint(-1, 7, 39, 1, 8, 40, D)                                  # mouth
    sk.paint(-8, 7, 40, -6, 8, 41, BL).paint(6, 7, 40, 8, 8, 41, BL)  # blush
    hd.island(sk)
    hd.brick(-10, -1, 41, -9, 2, 45, K)                               # ears
    hd.brick(9, -1, 41, 10, 2, 45, K)
    return {"head": hd}


def lock(part, x0, x1, y0, y1, zb, zt, taper=0, axis="x", slot=H):
    """A chunky hair clump: a block whose last 2 voxels step in by one voxel on the `taper` side
    (-1 / +1 along `axis`), giving the stepped, swept tip of the reference's hair clumps."""
    v = Vol().box(x0, y0, zb + 2, x1, y1, zt, slot)
    if axis == "x":
        a0, a1 = (x0 + (1 if taper > 0 else 0), x1 - (1 if taper < 0 else 0)) if taper else (x0 + 1, x1 - 1)
        v.box(a0, y0, zb, a1, y1, zb + 2, slot)
    else:
        a0, a1 = (y0 + (1 if taper > 0 else 0), y1 - (1 if taper < 0 else 0)) if taper else (y0 + 1, y1 - 1)
        v.box(x0, a0, zb, x1, a1, zb + 2, slot)
    return part.island(v)


def hair_default(v):
    """One smooth hair mass (cap + sides + back) with a few chunky clumps on the silhouette:
    fringe locks, side locks, back locks and crown clumps. Big faces, stepped edges, no studs."""
    hr = Part()
    long = v["hair"] == "long"
    mass = Vol().box(-10, -9, 51, 10, 9, 56, H).box(-9, -8, 56, 9, 8, 57, H).box(-7, -6, 57, 7, 6, 58, H)
    mass.box(-10, -10, 44 if not long else 36, 10, -8, 51, H)          # back
    for x0, x1 in ((-10, -9), (9, 10)):                                 # sides behind the ears
        mass.box(x0, -9, 47 if not long else 38, x1, 2, 51, H)
    hr.island(mass)
    for x0, y0, w, d in [(-9, -7, 6, 6), (-2, -8, 6, 6), (4, -3, 6, 6), (-8, 1, 6, 6), (0, 2, 6, 5)]:
        hr.island(Vol().box(x0, y0, 56, x0 + w, y0 + d, 58, H).box(x0 + 1, y0 + 1, 58, x0 + w - 1, y0 + d - 1, 59, H))
    for x0, x1, zb, t in [(-10, -5, 48, -1), (-5, 0, 47, -1), (0, 5, 48, 1), (5, 10, 49, 1)]:
        lock(hr, x0, x1, 8, 10, zb, 57, t)                              # fringe
    for sx in (-1, 1):
        x0, x1 = (-11, -9) if sx < 0 else (9, 11)
        for y0, y1, zb in [(-9, -4, 45 if not long else 35), (-4, 1, 46 if not long else 37), (1, 5, 47 if not long else 40)]:
            lock(hr, x0, x1, y0, y1, zb, 55, -1 if y0 < 0 else 1, axis="y")
    for x0, x1, zb, t in [(-10, -5, 43, -1), (-5, 0, 42, 1), (0, 5, 44, -1), (5, 10, 43, 1)]:
        lock(hr, x0, x1, -11, -9, zb if not long else zb - 9, 55, t)    # back
    if long:
        lock(hr, -3, 3, -13, -10, 36, 52)                               # ponytail
        hr.brick(-2, -13, 50, 2, -10, 52, A)                            # hair tie
    return {"hair": hr}


def gear(v):
    """Default crew gear layer (reference 'Crew' variant): harness plates, shoulder pads, knee/shin
    pads, gloves, belt pouches, thigh pouch. Separate mesh region 'gear' so armour can replace it."""
    g = {k: Part() for k in ("chest", "pelvis", "upper_arm.R", "hand.R", "thigh.R", "shin.R")}
    c = g["chest"]
    c.brick(-6, 5, 29, 6, 7, 35, S)                                    # front harness plate
    c.brick(-2, 7, 31, 2, 8, 33, A)                                    # chest emblem
    c.brick(3, 7, 32, 5, 8, 33, EM)                                    # comm light
    c.brick(-6, -7, 29, 6, -5, 35, S)                                  # back plate
    c.brick(-2, -8, 30, 2, -7, 33, A)                                  # back O2 port
    for x0 in (-6, 4):
        c.brick(x0, -7, 35, x0 + 2, 7, 37, M)                          # shoulder straps
    c.brick(-7, -6, 28, 7, 6, 29, M)                                   # harness waist band
    pe = g["pelvis"]
    for x0 in (-6, 3):
        pe.brick(x0, 5, 19, x0 + 3, 7, 22, S)                          # belt pouches
        pe.brick(x0, 5, 21, x0 + 3, 8, 22, M)                          # pouch flaps
    pe.brick(-7, -6, 22, 7, 7, 23, D)                                  # belt (1 proud of base belt band)
    ua = g["upper_arm.R"]
    ua.brick(6, -4, 33, 13, 4, 37, S).cut(12, -4, 36, 13, 4, 37)       # shoulder pad
    ua.brick(6, -4, 32, 13, 4, 33, M)                                  # pad trim
    hd = g["hand.R"]
    hd.brick(7, -3, 13, 13, 3, 19, A).cut(7, 2, 13, 13, 3, 14)         # glove (replaces the bare hand)
    hd.brick(7, 3, 15, 9, 4, 18, A)                                    # glove thumb
    hd.brick(6, -4, 17, 14, 4, 19, S)                                  # gauntlet cuff
    th = g["thigh.R"]
    th.brick(7, -2, 11, 9, 3, 16, S)                                   # thigh pouch
    th.brick(7, -2, 15, 10, 3, 16, M)                                  # pouch flap
    sh = g["shin.R"]
    sh.brick(1, 4, 8, 7, 6, 12, A).cut(1, 5, 11, 7, 6, 12)             # knee pad
    sh.brick(2, 5, 5, 6, 6, 8, S)                                      # shin guard
    out = {}
    for k, part in g.items():
        out[k] = part
        if k.endswith(".R"):
            out[k[:-2] + ".L"] = part.mirrored()
    return out


def curly_hair(v, seed=3):
    """Chunky curly clumps with depth: a solid inner mass plus ~50 overlapping stepped clump islands
    on the top, sides, back and fringe. Each clump is bevelled separately, so seams read as curls."""
    import random
    rng = random.Random(seed)
    hr = Part()
    long = v["hair"] == "long"
    mass = Vol().box(-10, -9, 50, 10, 9, 55, H).box(-9, -8, 55, 9, 8, 56, H)
    mass.box(-10, -10, 43 if not long else 36, 10, -8, 50, H)
    for x0, x1 in ((-10, -9), (9, 10)):
        mass.box(x0, -9, 46 if not long else 38, x1, 3, 50, H)
    hr.island(mass)

    def clump(cx, cy, cz, sx=4, sy=4, sz=3):
        c = Vol().box(cx - sx // 2, cy - sy // 2, cz, cx - sx // 2 + sx, cy - sy // 2 + sy, cz + sz, H)
        c.box(cx - sx // 2 + 1, cy - sy // 2 + 1, cz + sz, cx - sx // 2 + sx - 1, cy - sy // 2 + sy - 1, cz + sz + 1, H)
        hr.island(c)

    for x in range(-8, 9, 4):                                          # crown
        for y in range(-8, 9, 4):
            j = rng.randint(-1, 1)
            edge = (abs(x) > 6) + (abs(y) > 6)
            clump(x + j, y + rng.randint(-1, 1), 54 + rng.randint(0, 1) - edge)
    for sx in (-1, 1):                                                 # sides
        for y in range(-8, 5, 4):
            for z in range(46 if not long else 38, 55, 4):
                clump(sx * (10 + rng.randint(0, 1)), y + rng.randint(-1, 1), z + rng.randint(-1, 1), 3, 4, 4)
    for x in range(-8, 9, 4):                                          # back
        for z in range(42 if not long else 34, 55, 4):
            clump(x + rng.randint(-1, 1), -10 - rng.randint(0, 1), z + rng.randint(-1, 1), 4, 3, 4)
    for x in range(-8, 9, 4):                                          # fringe (hangs over the forehead)
        clump(x + rng.randint(-1, 1), 9, 49 + rng.randint(0, 2), 4, 3, 5)
    if long:
        clump(0, -12, 40, 6, 4, 10)                                    # ponytail
        clump(0, -13, 34, 4, 3, 6)
        hr.brick(-2, -14, 49, 2, -11, 51, A)                           # hair tie
    return {"hair": hr}


def build(variant):
    v = VARIANTS[variant]
    parts = {}
    for grp in (legs(), arms(v)):
        for k, part in grp.items():
            parts[k] = part
            parts[k[:-2] + ".L"] = part.mirrored()
    patch = Part()
    patch.brick(-13, -1, 28, -12, 2, 31, A)                          # sleeve patch, left arm only
    parts["upper_arm.L"] = parts["upper_arm.L"].merged(patch)
    parts.update(torso(v))
    parts.update(head(v))
    return parts, curly_hair(v)["hair"], gear(v)
