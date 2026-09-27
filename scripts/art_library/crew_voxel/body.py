"""Crew body r004 (CHARACTER_SPEC v2 + OWNER FEEDBACK round 2).

Layers (separate mesh regions, rigid per bone, same crew_rig):
  base   skin body with modest privacy shorts (+ sports bra on the feminine body), bare feet.
         The underwear is part of the base mesh and is never removed.
  hands  bare hands (hidden by gloves)
  head   skull + ears; the whole flat front plane is the `face` slot (animatable pixel texture)
  suit   default jumpsuit + boots (hides `base` when worn; a wardrobe layer, not the base)
  gear   default crew gear: harness plates, shoulder/knee/shin pads, gloves, pouches
  hair   default curly clumps (CHAR-HEADS replaces)

Authored in rest-pose armature voxels (1/32 m; x right, y forward, z up). Every bone owns a
voxkit.Part made of brick ISLANDS (seams between authored bricks only). Right limbs are authored
at +x and mirrored.

Layout (voxels): sole 0 | ankle 3 | knee 11 | crotch 19 | hip joint 20 | belt 23..25 |
chest base 29 | shoulder joint 35 | shoulder line 37 | neck 36..40 | skull 39..55 (16 tall x 16 wide
x 14 deep) | hair to 58 (1.81 m). Head+hair = 19/58 = 0.33 of height.
Legs x 1..7 (gap 2), torso x -7..7, arms x 7..12, hands x 7..13 at z 15..21.
"""
from voxkit import Part, Vol

P, S, A, M, D, K, H, E, EM, F = ("suit_primary", "suit_secondary", "accent", "metal", "dark", "skin", "hair",
                                 "eye", "emit", "face")
U = D          # underwear slot: neutral charcoal ('dark'), tintable like every slot

VARIANTS = {
    "male": dict(waist=6, bust=False, pockets=True, hair="short", label="masculine"),
    "female": dict(waist=5, bust=True, pockets=False, hair="long", label="feminine"),
    "neutral": dict(waist=6, bust=False, pockets=True, hair="short", label="neutral (masculine build)"),
}

SKULL = dict(x0=-8, x1=8, y0=-7, y1=7, z0=39, z1=55)     # face canvas: x -8..8, z 39..55 on y = 7


def mirror_pairs(d):
    out = {}
    for k, part in d.items():
        out[k] = part
        if k.endswith(".R"):
            out[k[:-2] + ".L"] = part.mirrored()
    return out


# ------------------------------------------------------------------------------ base (underwear)
def base_body(v):
    w = v["waist"]
    b = {k: Part() for k in ("thigh.R", "shin.R", "foot.R", "toe.R", "upper_arm.R", "forearm.R",
                             "pelvis", "spine", "chest", "neck")}
    b["thigh.R"].brick(1, -3, 11, 7, 4, 20, K)
    b["thigh.R"].brick(0, -4, 16, 8, 5, 20, U)                          # shorts leg (1 proud)
    b["shin.R"].brick(1, -3, 3, 7, 4, 11, K)
    b["shin.R"].brick(2, 4, 8, 6, 5, 11, K)                             # knee
    b["foot.R"].brick(1, -4, 0, 7, 4, 3, K)                             # bare foot
    b["toe.R"].brick(1, 4, 0, 7, 6, 2, K)
    b["upper_arm.R"].brick(7, -2, 27, 12, 3, 33, K)
    b["upper_arm.R"].brick(7, -3, 32, 12, 3, 37, K).cut(11, -3, 36, 12, 3, 37)   # deltoid
    b["forearm.R"].brick(7, -2, 21, 12, 3, 27, K)
    pe = b["pelvis"]
    pe.brick(-7, -4, 19, 7, 5, 25, U).cut(-1, -4, 19, 1, 5, 20)         # privacy shorts
    pe.brick(-7, -5, 24, 7, 6, 25, M)                                   # waistband
    b["spine"].brick(-w, -4, 25, w, 5, 30, K)
    ch = b["chest"]
    ch.brick(-7, -5, 29, 7, 5, 37, K).cut(-7, -5, 36, -6, 5, 37).cut(6, -5, 36, 7, 5, 37)
    if v["bust"]:
        ch.paint(-7, -5, 31, 7, 5, 35, U)                               # sports bra band (flush)
        bust = ch.brick(-5, 5, 31, 5, 6, 35, U)                         # bust, 1 proud
        bust.cut(-5, 5, 31, -4, 6, 32).cut(4, 5, 31, 5, 6, 32)
        for x0 in (-5, 3):
            ch.paint(x0, -5, 35, x0 + 2, 5, 37, U)                      # straps (flush)
    else:
        ch.brick(-6, 5, 32, -1, 6, 35, K)                               # chest planes
        ch.brick(1, 5, 32, 6, 6, 35, K)
    b["neck"].brick(-2, -2, 36, 2, 2, 40, K)
    return mirror_pairs(b)


def hands():
    hd = Part()
    hd.brick(7, -3, 15, 13, 3, 21, K).cut(7, 2, 15, 13, 3, 16)         # chunky fist 6x6x6
    hd.brick(7, 3, 16, 9, 4, 19, K)                                    # thumb
    return mirror_pairs({"hand.R": hd})


# ------------------------------------------------------------------------------ suit (wardrobe)
def suit(v):
    w = v["waist"]
    s = {k: Part() for k in ("thigh.R", "shin.R", "foot.R", "toe.R", "upper_arm.R", "forearm.R",
                             "pelvis", "spine", "chest")}
    th = s["thigh.R"]
    th.brick(1, -3, 11, 7, 4, 20, P)
    th.paint(6, 0, 12, 7, 1, 19, S)                                    # outer seam
    th.brick(7, -2, 13, 8, 2, 17, P)                                   # cargo pocket
    th.brick(7, -2, 17, 8, 2, 18, S)
    sh = s["shin.R"]
    sh.brick(1, -3, 7, 7, 4, 11, P)
    sh.brick(0, -4, 5, 8, 5, 8, P)                                     # hem flared over the boot top
    sh.brick(2, 4, 9, 6, 5, 12, S)                                     # knee panel
    sh.brick(1, -4, 3, 8, 5, 6, D)                                     # boot shaft
    sh.brick(1, -4, 6, 8, 5, 7, D)                                     # boot rim
    ft = s["foot.R"]
    ft.brick(1, -4, 1, 8, 4, 3, D)
    ft.brick(1, -4, 0, 8, 4, 1, M)                                     # distinct pale sole
    ft.brick(1, -5, 1, 8, -4, 3, S)                                    # heel counter
    to = s["toe.R"]
    to.brick(1, 4, 1, 8, 7, 3, D).cut(1, 6, 2, 8, 7, 3)
    to.brick(1, 4, 0, 8, 7, 1, M)
    ua = s["upper_arm.R"]
    ua.brick(7, -3, 32, 12, 3, 37, P).cut(11, -3, 36, 12, 3, 37)
    ua.brick(7, -2, 27, 12, 3, 32, P)
    fa = s["forearm.R"]
    fa.brick(7, -2, 22, 12, 3, 27, P)
    fa.brick(6, -3, 20, 13, 4, 22, S)                                  # cuff
    pe = s["pelvis"]
    pe.brick(-7, -4, 19, 7, 5, 24, P).cut(-1, -4, 19, 1, 5, 20)
    pe.brick(-7, -5, 23, 7, 6, 25, D)                                  # belt
    pe.brick(-2, 6, 23, 2, 7, 25, M).paint(-1, 6, 23, 1, 7, 25, A)     # buckle
    pe.brick(3, 6, 23, 5, 7, 25, D)
    sp = s["spine"]
    sp.brick(-w, -4, 24, w, 5, 30, P)
    sp.paint(-1, 4, 24, 0, 5, 30, S)
    ch = s["chest"]
    ch.brick(-7, -5, 29, 7, 5, 37, P).cut(-7, -5, 36, -6, 5, 37).cut(6, -5, 36, 7, 5, 37)
    if v["pockets"]:
        ch.brick(-6, 5, 30, -2, 6, 33, P)
        ch.brick(-6, 5, 33, -2, 6, 34, S)
        ch.brick(2, 5, 30, 6, 6, 33, P)
        ch.brick(2, 5, 33, 6, 6, 34, S)
    if v["bust"]:
        ch.brick(-5, 5, 31, 5, 6, 34, P).cut(-5, 5, 31, -4, 6, 32).cut(4, 5, 31, 5, 6, 32)
        ch.paint(-1, 5, 31, 0, 6, 34, S)
    ch.brick(-5, 5, 34, -3, 6, 35, M)                                  # rank pins
    ch.brick(4, 5, 35, 5, 6, 36, EM)                                   # status light
    col = Vol().box(-4, -5, 36, 4, 4, 38, S)                           # standing collar
    col.cut(-3, -4, 36, 3, 3, 38).cut(-1, 3, 36, 1, 4, 38)
    ch.island(col)
    ch.brick(-3, 5, 35, -1, 6, 37, P)                                  # lapels
    ch.brick(1, 5, 35, 3, 6, 37, P)
    ch.brick(-3, -6, 30, 3, -5, 34, S).paint(-1, -6, 31, 1, -5, 33, A)
    out = mirror_pairs(s)
    patch = Part()
    patch.brick(-13, -1, 29, -12, 2, 32, A)                            # sleeve patch (left arm)
    out["upper_arm.L"] = out["upper_arm.L"].merged(patch)
    return out


# ------------------------------------------------------------------------------ gear (default crew)
def gear(v):
    g = {k: Part() for k in ("chest", "pelvis", "upper_arm.R", "hand.R", "thigh.R", "shin.R")}
    c = g["chest"]
    c.brick(-6, 5, 30, 6, 7, 36, S)                                    # front harness plate
    c.brick(-2, 7, 32, 2, 8, 34, A)                                    # chest emblem
    c.brick(3, 7, 33, 5, 8, 34, EM)                                    # comm light
    c.brick(-6, -7, 30, 6, -5, 36, S)                                  # back plate
    c.brick(-2, -8, 31, 2, -7, 34, A)                                  # back O2 port
    for x0 in (-6, 4):
        c.brick(x0, -7, 36, x0 + 2, 7, 38, M)                          # shoulder straps
    c.brick(-7, -6, 29, 7, 6, 30, M)                                   # harness waist band
    pe = g["pelvis"]
    for x0 in (-6, 3):
        pe.brick(x0, 5, 20, x0 + 3, 7, 23, S)                          # belt pouches
        pe.brick(x0, 5, 22, x0 + 3, 8, 23, M)
    pe.brick(-7, -6, 23, 7, 7, 24, D)                                  # utility belt
    ua = g["upper_arm.R"]
    ua.brick(6, -4, 34, 13, 4, 38, S).cut(12, -4, 37, 13, 4, 38)       # shoulder pad
    ua.brick(6, -4, 33, 13, 4, 34, M)                                  # pad trim
    hd = g["hand.R"]
    hd.brick(7, -3, 15, 13, 3, 21, A).cut(7, 2, 15, 13, 3, 16)         # glove (replaces the hand)
    hd.brick(7, 3, 16, 9, 4, 19, A)
    hd.brick(6, -4, 19, 14, 4, 21, S)                                  # gauntlet cuff
    th = g["thigh.R"]
    th.brick(7, -2, 12, 9, 3, 17, S)                                   # thigh pouch
    th.brick(7, -2, 16, 10, 3, 17, M)
    sh = g["shin.R"]
    sh.brick(1, 4, 9, 7, 6, 13, A).cut(1, 5, 12, 7, 6, 13)             # knee pad
    sh.brick(2, 5, 5, 6, 6, 8, S)                                      # shin guard
    return mirror_pairs(g)


# ------------------------------------------------------------------------------ head
def head(v):
    k = SKULL
    hd = Part()
    sk = Vol().box(k["x0"], k["y0"], k["z0"] + 1, k["x1"], k["y1"], k["z1"] - 1, K)
    sk.box(k["x0"] + 1, k["y0"] + 1, k["z1"] - 1, k["x1"] - 1, k["y1"] - 1, k["z1"], K)   # crown step
    sk.box(k["x0"] + 1, k["y0"] + 1, k["z0"], k["x1"] - 1, k["y1"] - 1, k["z0"] + 1, K)   # jaw step
    for x in (k["x0"], k["x1"] - 1):                                   # soften vertical edges
        sk.cut(x, k["y0"], k["z0"], x + 1, k["y0"] + 1, k["z1"]).cut(x, k["y1"] - 1, k["z0"], x + 1, k["y1"], k["z1"])
    # the flat front plane is the animatable face canvas (slot `face`)
    sk.paint(k["x0"], k["y1"] - 1, k["z0"], k["x1"], k["y1"], k["z1"], F)
    hd.island(sk)
    hd.brick(-9, -1, 43, -8, 2, 47, K)                                 # ears
    hd.brick(8, -1, 43, 9, 2, 47, K)
    return {"head": hd}


def curly_hair(v, seed=3):
    """Chunky curly clumps over a solid mass; each clump bevelled separately so seams read as curls."""
    import random
    rng = random.Random(seed)
    hr = Part()
    long = v["hair"] == "long"
    mass = Vol().box(-9, -8, 50, 9, 8, 55, H).box(-8, -7, 55, 8, 7, 56, H)
    mass.box(-9, -9, 44 if not long else 36, 9, -7, 50, H)
    for x0, x1 in ((-9, -8), (8, 9)):
        mass.box(x0, -8, 47 if not long else 38, x1, 3, 50, H)
    hr.island(mass)

    def clump(cx, cy, cz, sx=4, sy=4, sz=3):
        c = Vol().box(cx - sx // 2, cy - sy // 2, cz, cx - sx // 2 + sx, cy - sy // 2 + sy, cz + sz, H)
        c.box(cx - sx // 2 + 1, cy - sy // 2 + 1, cz + sz, cx - sx // 2 + sx - 1, cy - sy // 2 + sy - 1, cz + sz + 1, H)
        hr.island(c)

    for x in range(-7, 8, 4):                                          # crown
        for y in range(-7, 8, 4):
            edge = (abs(x) > 5) + (abs(y) > 5)
            clump(x + rng.randint(-1, 1), y + rng.randint(-1, 1), 53 + rng.randint(0, 1) - edge)
    for sx in (-1, 1):                                                 # sides
        for y in range(-7, 4, 4):
            for z in range(47 if not long else 38, 52, 4):
                clump(sx * 9, y + rng.randint(-1, 1), z + rng.randint(-1, 1), 2, 4, 4)
    for x in range(-7, 8, 4):                                          # back
        for z in range(43 if not long else 34, 52, 4):
            clump(x + rng.randint(-1, 1), -9 - rng.randint(0, 1), z + rng.randint(-1, 1), 4, 3, 4)
    for x in range(-6, 7, 4):                                          # fringe over the forehead
        clump(x + rng.randint(-1, 1), 8, 51 + rng.randint(0, 1), 4, 3, 4)
    if long:
        clump(0, -11, 40, 6, 4, 10)                                    # ponytail
        clump(0, -12, 34, 4, 3, 6)
        hr.brick(-2, -13, 49, 2, -10, 51, A)
    return {"hair": hr}


def build(variant):
    """-> layers dict: {region: {bone: Part}}, plus the hair Part."""
    v = VARIANTS[variant]
    layers = {
        "base": base_body(v),
        "hands": hands(),
        "head": head(v),
        "suit": suit(v),
        "gear": gear(v),
    }
    return layers, curly_hair(v)["hair"]
