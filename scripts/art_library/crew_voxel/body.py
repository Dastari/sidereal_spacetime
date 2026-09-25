"""Base crew body volumes (undersuit, glove/boot bases, neutral head blank, default hair).

Every volume is authored in rest-pose armature voxels (see rig.py): x right, y forward, z up.
Right-side parts are authored once at +x and mirrored. Each bone gets its own volume, so the
body is rigid per bone (weights 1.0), which is what keeps the voxel read under animation.

Variants share the skeleton: 'male', 'female', 'neutral' only differ in torso/hip/arm
geometry and facial detail. Proportions (1 voxel = 1/32 m):
  sole 0 | ankle 3 | knee 13 | hip joint 25 | crotch 23 | belt 27-29 | shoulder line 42 |
  neck 42-44 | head 44-58 (14 vox = 0.44 m, ~4.1 heads) | default hair to 60
"""
from voxkit import Vol

P, S, A, M, D, K, H, E, EM = ("suit_primary", "suit_secondary", "accent", "metal", "dark", "skin", "hair", "eye", "emit")

VARIANTS = {
    # chest half-width, waist half-width, hip half-width, bust, deltoid outer, jaw, lashes
    "male": dict(chest=7, waist=6, hip=7, bust=False, delt=13, jaw=5, lashes=False, brow=2),
    "female": dict(chest=6, waist=5, hip=7, bust=True, delt=12, jaw=4, lashes=True, brow=1),
    "neutral": dict(chest=7, waist=6, hip=7, bust=False, delt=12, jaw=5, lashes=False, brow=1),
}


def legs():
    th, sh, ft, to = Vol(), Vol(), Vol(), Vol()
    # thigh 13..24 (6 wide x 6 deep), outer seam stripe, cargo pocket, hip overlap into pelvis
    th.box(1, -3, 13, 7, 3, 25, P)
    th.cut(1, -3, 23, 2, 3, 25)                           # crotch bevel
    th.paint(6, -1, 14, 7, 0, 23, S)                      # outer seam
    th.box(7, -2, 16, 8, 2, 20, S).box(7, -2, 20, 8, 2, 21, D)     # thigh pocket + flap
    th.paint(1, 2, 13, 7, 3, 14, S)                       # hem above knee
    # shin 3..13: knee pad, boot shaft (boot base), calf
    sh.box(1, -3, 7, 7, 3, 13, P)
    sh.box(2, -3, 5, 6, -2, 11, P)                        # calf bulge behind
    sh.box(2, 3, 10, 6, 4, 14, S).paint(3, 3, 12, 5, 4, 13, A)     # knee pad with accent tab
    sh.box(1, -3, 3, 7, 3, 7, D)                          # boot shaft
    sh.box(0, -3, 6, 8, 4, 7, S)                          # boot cuff rim (1 vox proud)
    sh.paint(3, 2, 4, 5, 3, 6, S)                         # laces strip
    # foot 0..4 (ankle block + heel), toe 4..8
    ft.box(1, -4, 0, 7, 4, 4, D).box(1, -4, 0, 7, 4, 1, K)          # boot + sole (sole uses 'skin' ? no)
    ft.paint(1, -4, 0, 7, 4, 1, M)                        # sole plate reads metal-grey
    ft.paint(1, -4, 1, 7, -3, 3, S)                       # heel counter
    to.box(1, 4, 0, 7, 8, 3, D).paint(1, 4, 0, 7, 8, 1, M)
    to.paint(2, 7, 1, 6, 8, 2, S)                         # toe cap trim
    to.cut(1, 7, 2, 2, 8, 3).cut(6, 7, 2, 7, 8, 3)        # rounded toe corners
    return {"thigh.R": th, "shin.R": sh, "foot.R": ft, "toe.R": to}


def arms(v):
    ua, fa, hd, sd = Vol(), Vol(), Vol(), Vol()
    d = v["delt"]
    ua.box(8, -2, 32, 12, 2, 40, P)                       # upper arm 4x4
    ua.box(7, -3, 38, d, 3, 42, P)                        # deltoid cap
    ua.cut(d - 1, -3, 41, d, 3, 42).cut(7, -3, 41, 8, -2, 42).cut(7, 2, 41, 8, 3, 42)
    ua.box(12, -1, 35, 13, 2, 38, A)                      # sleeve patch
    ua.paint(7, -3, 38, d, 3, 39, S)                      # yoke seam under the cap
    fa.box(8, -2, 25, 12, 2, 32, P)                       # forearm
    fa.box(7, -3, 24, 13, 3, 27, S)                       # cuff (1 vox proud)
    fa.paint(8, 1, 29, 9, 2, 32, S)                       # inner seam
    fa.box(8, -1, 31, 12, 1, 33, P)                       # elbow overlap
    # hand (bare hand glove base = skin), closed-ish fist; thumb toward body/forward
    hd.box(8, -2, 20, 12, 2, 24, K)
    hd.cut(11, -2, 20, 12, 2, 21)                         # finger taper
    hd.box(8, 2, 21, 10, 3, 23, K)                        # thumb forward/inside
    hd.paint(8, -2, 23, 12, 2, 24, S)                     # glove-base wrist band
    hd.paint(9, 1, 20, 11, 2, 22, K)
    sd.box(3, -3, 39, 8, 3, 41, P)                        # clavicle/trapezius block (shoulder bone)
    return {"upper_arm.R": ua, "forearm.R": fa, "hand.R": hd, "shoulder.R": sd}


def torso(v):
    c, w, h = v["chest"], v["waist"], v["hip"]
    pe, sp, ch, nk = Vol(), Vol(), Vol(), Vol()
    # pelvis 23..29, belt 27..29 (1 vox proud front/back), buckle
    pe.box(-h, -3, 23, h, 5, 29, P)
    pe.cut(-h, -3, 23, -h + 1, 5, 24).cut(h - 1, -3, 23, h, 5, 24)
    pe.box(-h, -4, 27, h, 6, 29, D)
    pe.box(-2, 6, 27, 2, 7, 29, M).paint(-1, 6, 27, 1, 7, 29, A)
    pe.box(3, 6, 27, 5, 7, 29, D).box(-5, -5, 27, -3, -4, 29, S)     # belt loops / pouch hint
    pe.paint(-1, 4, 23, 1, 5, 27, S)                      # fly seam
    # spine/waist 29..34
    sp.box(-w, -3, 29, w, 5, 35, P)
    sp.paint(-1, 4, 29, 1, 5, 35, S)                      # front placket
    sp.paint(-w, -3, 29, w, 5, 30, S)                     # waist seam above belt
    # chest 34..42 (9 deep: y -4..5)
    ch.box(-c, -4, 35, c, 5, 41, P)
    ch.box(-c + 1, -4, 41, c - 1, 5, 42, P)
    ch.box(-c + 1, -3, 34, c - 1, 5, 35, P)               # overlap into waist
    ch.cut(-c, 4, 35, -c + 1, 5, 41).cut(c - 1, 4, 35, c, 5, 41)   # soften front vertical edges
    if v["bust"]:
        ch.box(-5, 5, 36, 5, 6, 39, P).cut(-5, 5, 36, -4, 6, 37).cut(4, 5, 36, 5, 6, 37)
        ch.paint(-1, 5, 36, 1, 6, 39, S)
    ch.paint(-1, 4, 35, 1, 5, 41, S)                      # front placket / zip
    ch.box(-1, 5, 39, 1, 6, 41, M)                        # zip pull
    ch.box(-c + 2, 5, 36, -2, 6, 39, S).paint(-c + 2, 5, 38, -2, 6, 39, D)   # chest pocket + flap
    ch.box(3, 5, 38, 5, 6, 39, A).box(5, 5, 38, 6, 6, 39, EM)               # name badge + status light
    ch.paint(-c, -4, 40, c, 5, 41, S)                     # shoulder yoke seam
    ch.box(-3, -5, 36, 3, -4, 40, S).paint(-2, -5, 37, 2, -4, 39, A)        # back plate (O2 port)
    # collar (chest bone) around the neck
    ch.box(-4, -4, 41, 4, 4, 43, S).cut(-3, -3, 41, 3, 3, 43)
    ch.box(-2, 4, 41, 2, 5, 42, S)
    # neck
    nk.box(-2, -2, 41, 2, 2, 45, K)
    return {"pelvis": pe, "spine": sp, "chest": ch, "neck": nk}


def head(v):
    hd = Vol()
    j = v["jaw"]
    hd.box(-7, -6, 46, 7, 6, 57, K)
    hd.box(-6, -6, 57, 6, 6, 58, K).box(-6, -5, 45, 6, 6, 46, K).box(-j, -4, 44, j, 5, 45, K)
    for x in (-7, 6):                                     # vertical edge chamfer
        hd.cut(x, -6, 46, x + 1, -5, 57).cut(x, 5, 46, x + 1, 6, 57)
    # eyes 2x3, brows, nose, mouth, ears
    for sx in (-5, 3):
        hd.paint(sx, 5, 49, sx + 2, 6, 52, E)
    b = v["brow"]
    hd.paint(-5, 5, 53, -5 + 2 + (1 if b > 1 else 0), 6, 54, H).paint(3 - (1 if b > 1 else 0), 5, 53, 5, 6, 54, H)
    if v["lashes"]:
        hd.box(-6, 5, 51, -5, 6, 52, E).box(5, 5, 51, 6, 6, 52, E)
    hd.box(-1, 6, 48, 1, 7, 50, K)                        # nose
    hd.paint(-2, 5, 46, 2, 6, 47, "dark" if not v["lashes"] else "accent")   # mouth
    hd.box(-8, -1, 48, -7, 2, 52, K).box(7, -1, 48, 8, 2, 52, K)             # ears
    return {"head": hd}


def hair_default(v):
    """Default short hair (head bone). CHAR-HEADS replaces it; kept separate so it can be hidden."""
    hr = Vol()
    hr.box(-7, -6, 57, 7, 6, 59, H).box(-6, -5, 59, 6, 5, 60, H)
    hr.box(-8, -6, 52, -7, 5, 58, H).box(7, -6, 52, 8, 5, 58, H)            # sides (above ears)
    hr.box(-7, -7, 47, 7, -6, 59, H).cut(-7, -7, 47, -6, -6, 50).cut(6, -7, 47, 7, -6, 50)  # back
    # fringe: jagged front layer
    for x, lo in zip(range(-7, 7), [55, 54, 55, 56, 54, 55, 56, 55, 54, 56, 55, 54, 55, 56]):
        hr.box(x, 6, lo, x + 1, 7, 59, H)
    hr.box(-7, -6, 56, 7, 7, 57, H).cut(-6, -5, 56, 6, 6, 57)                # rim
    for x, y in ((-4, -2), (-1, 1), (2, -3), (4, 2), (-3, 3), (1, -5)):      # tufts
        hr.box(x, y, 60, x + 2, y + 2, 61, H)
    if v["lashes"]:                                                           # longer back/sides
        hr.box(-8, -7, 44, 8, -5, 52, H).box(-8, -5, 46, -7, 3, 52, H).box(7, -5, 46, 8, 3, 52, H)
    return {"hair": hr}


def build(variant):
    v = VARIANTS[variant]
    parts = {}
    for grp in (legs(), arms(v)):
        for k, vol in grp.items():
            parts[k] = vol
            m = Vol()
            for (x, y, z), s in vol.c.items():
                m.c[(-1 - x, y, z)] = s
            parts[k[:-2] + ".L"] = m
    parts.update(torso(v))
    parts.update(head(v))
    # asymmetric badge/pocket are fine (chest is not mirrored). Hair is returned separately.
    return parts, hair_default(v)["hair"]
