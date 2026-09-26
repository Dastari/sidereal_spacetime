"""Crew voxel armour kit (armor-v1, r002 = spec v2 refit): pure part definitions, no bpy, unit-testable.

Every armour/equipment part is a set of voxel volumes on the 1/32 m character grid, one volume per
crew_rig bone, rigidly skinned to that bone (weight 1.0). Volumes are authored in the rest-pose
armature frame shared with CHAR-BODY:
    x = character right (+X is .R), y = forward (the character faces +Y), z = up,
    origin = feet centre on the ground, cell (x, y, z) spans [x, x+1) * 1/32 m.
Right-side parts are authored at +x and mirrored to .L with x -> -1 - x.

Spec v2 (chibi, ~2.8 heads): silhouette and colour blocking use 2-voxel main blocks (1/16 m);
single 1/32 m voxels are reserved for trims, rivets, badges and lights. T2/T3 carry ~10-20 %
emissive surface. Colour lives only in the ten shared material slots (colourways/roles/player
colours are slot tables).

The body dimensions below (BODY) are CHAR-ARMOR's v2 placeholder built from the v2 numbers in
CHARACTER_SPEC.md, used until CHAR-BODY republishes CHARACTER_SPEC_BODY.json with spec_version 2.
Builders read BODY, so a refit is a data change plus the automated fit checks.

Fit rules (checked by crew_armor_kit.py / test_crew_armor_parts.py):
- no same-normal coplanar visible face between armour and the body, or between the parts of a
  preset (no z-fighting): armour encloses the body cells it covers at least 1 voxel proud, or
  sits clear of them. Gloves/boots replace the hands/feet regions (hidesBodyRegions);
- the hanging arm/hand zone (x >= 7 beside the hips) stays clear of torso, belt and leg armour;
- the legs touch at x = 0 at most (nothing crosses the midline).

Style lineage: scripts/art_library/ship_kit_prototype.py (PR #25) boxes/slots/themes, via
CHAR-BODY's voxkit Vol/mesh_volume contract.
"""
from __future__ import annotations

from dataclasses import dataclass, field

KIT_ID = "crew.armor-v1"
REVISION = "r002"
SPEC_VERSION = 2
V = 1.0 / 32.0
SLOTS = ["skin", "hair", "eye", "suit_primary", "suit_secondary", "accent", "metal", "dark", "emit", "glass"]
SI = {s: i for i, s in enumerate(SLOTS)}
EQUIPMENT_SLOTS = ["chest", "shoulders", "gloves", "belt", "legs", "boots", "back"]
TIERS = {0: "civilian", 1: "light", 2: "standard", 3: "heavy"}
RIG_BONES = ["root", "pelvis", "spine", "chest", "neck", "head",
             "shoulder.R", "shoulder.L", "upper_arm.R", "upper_arm.L", "forearm.R", "forearm.L",
             "hand.R", "hand.L", "thigh.R", "thigh.L", "shin.R", "shin.L", "foot.R", "foot.L", "toe.R", "toe.L"]
BODY_REGIONS = ["body", "head", "hands", "feet", "hair"]
# Torso fits: body variants differ in chest / waist half-width.
FITS = {"wide": {"chest": 7, "waist": 6, "variants": ["male", "neutral"]},
        "narrow": {"chest": 6, "waist": 5, "variants": ["female"]}}
P, S2, AC, M, D, EM, GL = "suit_primary", "suit_secondary", "accent", "metal", "dark", "emit", "glass"
SK, HR, EY = "skin", "hair", "eye"

# ============================================================================================ BODY v2
# Placeholder v2 body (voxels). Segment boxes are (x0, y0, z0, x1, y1, z1); .R side at +x.
BODY = {
    "skullTop": 55, "hairTop": 58,
    "bones": {  # head, tail (voxels, Blender armature frame); .L mirrors x
        "root": ((0, 0, 0), (0, 6, 0)), "pelvis": ((0, 0, 18), (0, 0, 22)), "spine": ((0, 0, 22), (0, 0, 28)),
        "chest": ((0, 0, 28), (0, 0, 36)), "neck": ((0, 0, 36), (0, 0, 37)), "head": ((0, 0, 37), (0, 0, 55)),
        "shoulder.R": ((2, 0, 34), (10.5, 0, 34.5)), "upper_arm.R": ((10.5, 0, 34), (10.5, 0, 27)),
        "forearm.R": ((10.5, 0, 27), (10.5, 0, 21)), "hand.R": ((11.5, 0, 21), (11.5, 0, 15)),
        "thigh.R": ((4.5, 0, 18), (4.5, 0, 10)), "shin.R": ((4.5, 0, 10), (4.5, 0, 4)),
        "foot.R": ((4.5, 0, 4), (4.5, 4, 1)), "toe.R": ((4.5, 4, 1), (4.5, 7, 1)),
    },
    "parents": {"pelvis": "root", "spine": "pelvis", "chest": "spine", "neck": "chest", "head": "neck",
                "shoulder.R": "chest", "upper_arm.R": "shoulder.R", "forearm.R": "upper_arm.R", "hand.R": "forearm.R",
                "thigh.R": "pelvis", "shin.R": "thigh.R", "foot.R": "shin.R", "toe.R": "foot.R"},
}


def rig_bones():
    """[(name, head, tail, parent)] for every crew_rig bone (voxels), .L mirrored."""
    out = []
    for n, (h, t) in BODY["bones"].items():
        par = BODY["parents"].get(n)
        out.append((n, h, t, par))
        if n.endswith(".R"):
            mp = par[:-2] + ".L" if par and par.endswith(".R") else par
            out.append((n[:-2] + ".L", (-h[0], h[1], h[2]), (-t[0], t[1], t[2]), mp))
    return out


# ============================================================================================ VOLUME
class Vol:
    """Integer voxel volume (API-compatible with CHAR-BODY voxkit.Vol)."""

    def __init__(self):
        self.c = {}

    def box(self, x0, y0, z0, x1, y1, z1, slot):
        assert slot in SI, slot
        for x in range(x0, x1):
            for y in range(y0, y1):
                for z in range(z0, z1):
                    self.c[(x, y, z)] = slot
        return self

    def cut(self, x0, y0, z0, x1, y1, z1):
        for x in range(x0, x1):
            for y in range(y0, y1):
                for z in range(z0, z1):
                    self.c.pop((x, y, z), None)
        return self

    def paint(self, x0, y0, z0, x1, y1, z1, slot):
        for x in range(x0, x1):
            for y in range(y0, y1):
                for z in range(z0, z1):
                    if (x, y, z) in self.c:
                        self.c[(x, y, z)] = slot
        return self

    def chamfer_z(self, x0, y0, x1, y1, z0, z1):
        """Remove the four vertical edge columns of a box footprint (softened brick corner)."""
        for x, y in ((x0, y0), (x1 - 1, y0), (x0, y1 - 1), (x1 - 1, y1 - 1)):
            self.cut(x, y, z0, x + 1, y + 1, z1)
        return self

    def chamfer_outer(self, x1, y0, y1, z0, z1):
        """Soften only the two outer (+x) vertical edges; inner edges hug the body."""
        self.cut(x1 - 1, y0, z0, x1, y0 + 1, z1).cut(x1 - 1, y1 - 1, z0, x1, y1, z1)
        return self

    def mirrored(self):
        m = Vol()
        m.c = {(-1 - x, y, z): s for (x, y, z), s in self.c.items()}
        return m

    def bounds(self):
        if not self.c:
            return None
        ks = list(self.c)
        return [min(k[i] for k in ks) for i in range(3)], [max(k[i] for k in ks) + 1 for i in range(3)]

    def slots(self):
        return sorted(set(self.c.values()), key=SI.get)


@dataclass
class Part:
    id: str
    slot: str
    tier: int
    style: str
    name: str
    fits: dict                        # fit name ("wide"/"narrow"/"all") -> {bone: Vol}
    socket: str | None = None
    mass_kg: float = 0.0
    grid: tuple = (2, 2)
    exhaust: list = field(default_factory=list)   # [(bone, (x, y, z) voxels, radius voxels)] presentation only
    hides: list = field(default_factory=list)     # CHAR-BODY regions replaced by this part

    def bones(self):
        return sorted({b for vols in self.fits.values() for b in vols}, key=RIG_BONES.index)

    def voxels(self, fit=None):
        fit = fit or next(iter(self.fits))
        return sum(len(v.c) for v in self.fits[fit].values())

    def slots_used(self):
        return sorted({s for vols in self.fits.values() for v in vols.values() for s in v.c.values()}, key=SI.get)

    def emissive_share(self, fit=None):
        vols = self.fits[fit or next(iter(self.fits))]
        n = sum(len(v.c) for v in vols.values())
        return sum(1 for v in vols.values() for s in v.c.values() if s == EM) / max(n, 1)

    def fit_for(self, variant):
        if "all" in self.fits:
            return "all"
        for name, f in FITS.items():
            if variant in f["variants"]:
                return name
        return "wide"


def sided(vols_r):
    """{bone.R: Vol} -> {bone.R: Vol, bone.L: mirrored Vol}."""
    out = {}
    for bone, v in vols_r.items():
        out[bone] = v
        if bone.endswith(".R"):
            out[bone[:-2] + ".L"] = v.mirrored()
    return out


# ======================================================================================== MANNEQUIN
def mannequin(variant="male"):
    """CHAR-ARMOR's v2 placeholder body: {region: {bone: Vol}} (review renders and fit checks only)."""
    c = FITS["narrow" if variant == "female" else "wide"]["chest"]
    w = c - 1
    body, head, hands, feet, hair = {}, {}, {}, {}, {}
    pe = Vol().box(-7, -4, 17, 7, 5, 22, S2).paint(-7, -4, 20, 7, 5, 22, D)          # hips + belt band
    pe.box(-2, 5, 20, 2, 6, 22, M)                                                     # buckle
    sp = Vol().box(-w, -4, 22, w, 5, 28, P).paint(-1, 4, 22, 1, 5, 28, S2)
    ch = Vol().box(-c, -5, 28, c, 5, 36, P).paint(-c, -5, 34, c, 5, 36, S2)             # chest + yoke seam
    ch.paint(2, 4, 31, 4, 5, 32, AC)                                                  # badge
    nk = Vol().box(-3, -3, 36, 3, 3, 37, SK)
    body.update({"pelvis": pe, "spine": sp, "chest": ch, "neck": nk})
    ua = Vol().box(8, -3, 27, 13, 3, 34, P).box(7, -3, 32, 14, 3, 36, P).paint(7, -3, 32, 14, 3, 33, S2)
    fa = Vol().box(8, -3, 21, 13, 3, 27, P).paint(8, -3, 21, 13, 3, 22, S2)
    th = Vol().box(1, -3, 10, 8, 4, 18, S2)
    sh = Vol().box(1, -3, 4, 8, 4, 10, S2).paint(1, 3, 8, 8, 4, 10, P)
    body.update(sided({"upper_arm.R": ua, "forearm.R": fa, "thigh.R": th, "shin.R": sh}))
    hands.update(sided({"hand.R": Vol().box(8, -3, 15, 15, 4, 21, SK)}))
    feet.update(sided({"foot.R": Vol().box(1, -4, 0, 8, 4, 4, D).paint(1, -4, 0, 8, 4, 1, M),
                       "toe.R": Vol().box(1, 4, 0, 8, 7, 3, D).paint(1, 4, 0, 8, 7, 1, M)}))
    hd = Vol().box(-9, -8, 37, 9, 8, 55, SK)
    for x, y in ((-9, -8), (8, -8), (-9, 7), (8, 7)):
        hd.cut(x, y, 37, x + 1, y + 1, 55)
    hd.cut(-9, -8, 37, 9, -7, 39).cut(-9, 7, 37, 9, 8, 38)                            # jaw
    for sx in (-6, 3):                                                                # big dark eyes + highlight
        hd.paint(sx, 7, 43, sx + 3, 8, 47, EY).paint(sx + 1, 7, 45, sx + 2, 8, 46, AC)
    hd.paint(-1, 7, 40, 1, 8, 41, D)                                                  # mouth
    hd.paint(-8, 7, 41, -6, 8, 42, AC).paint(6, 7, 41, 8, 8, 42, AC)                  # blush
    head["head"] = hd
    hr = Vol().box(-10, -9, 49, 10, 7, 56, HR).box(-9, -8, 56, 9, 6, 58, HR)
    hr.box(-10, -9, 41, -8, 5, 49, HR).box(8, -9, 41, 10, 5, 49, HR).box(-9, -9, 39, 9, -7, 49, HR)
    for x in range(-9, 9, 2):                                                         # fringe clumps
        hr.box(x, 7, 50 - (x // 2) % 2 * 2, x + 2, 9, 56, HR)
    hr.cut(-8, -7, 49, 8, 7, 54)                                                     # hollow shell
    hair["head"] = hr
    return {"body": body, "head": head, "hands": hands, "feet": feet, "hair": hair}


# ============================================================================================= CHEST
# Body (wide): chest x -7..7, y -5..5, z 28..36; waist x -6..6, y -4..5, z 22..28; neck x/y -3..3;
# deltoid x 7..14, y -3..3, z 32..36; head z 37+ (x -9..9) overhangs the yoke.
def torso_shell(c, w, tier, base_slot):
    """Chest + waist shells enclosing the body torso (>= 1 voxel proud)."""
    ch, sp = Vol(), Vol()
    fy = 6 + (tier >= 3)                  # front face
    by = -6                               # back face (packs mount behind y = -7)
    A = c + 1                             # side face, clear of the upper arm (x >= 8)
    ch.box(-A, by, 28, A, fy, 36, base_slot).chamfer_z(-A, by, A, fy, 28, 36)
    if A > 7:                             # notch for the deltoid; its floor stays inside the body
        ch.cut(c - 1, -4, 31, A, 4, 36).cut(-A, -4, 31, -c + 1, 4, 36)
    ch.cut(-4, -4, 35, 4, 4, 36)          # neck well (floor inside the body chest)
    ch.box(-A + 1, by + 1, 36, A - 1, fy - 1, 37, S2).cut(-4, -4, 36, 4, 4, 37)   # yoke ring under the head
    sp.box(-w - 1, -5, 23, w + 1, fy, 28, base_slot)
    sp.cut(-w - 1, fy - 1, 23, -w, fy, 28).cut(w, fy - 1, 23, w + 1, fy, 28)
    return ch, sp, fy, by, A


def chest_vols(c, w, tier, style):
    base_slot = S2 if style == "overalls" else P
    ch, sp, fy, by, A = torso_shell(c, w, tier, base_slot)
    vols = {"chest": ch, "spine": sp}
    if style == "overalls":
        ch.box(-4, fy, 28, 4, fy + 1, 34, P).box(-3, fy + 1, 30, 3, fy + 2, 32, D)      # bib + pocket
        ch.paint(-2, fy + 1, 31, 2, fy + 2, 32, P)
        for x0 in (-5, 4):                                                              # braces
            ch.paint(x0, by, 28, x0 + 1, fy, 37, P)
            ch.box(x0, fy, 32, x0 + 1, fy + 1, 33, M)
        sp.paint(-w - 1, -5, 23, w + 1, fy, 28, P)
        sp.box(-3, fy, 24, 3, fy + 1, 27, D).paint(-2, fy, 25, 2, fy + 1, 26, M)
        return vols
    if style in ("jacket", "coat", "labcoat", "flight"):
        seam = S2 if style == "flight" else D
        ch.paint(-1, fy - 1, 28, 1, fy, 36, seam)                          # placket / zip line
        sp.paint(-1, fy - 1, 23, 1, fy, 28, seam)
        sp.paint(-w - 1, -5, 23, w + 1, fy, 25, S2)                        # hem band (2-vox block)
        if style in ("jacket", "coat", "labcoat"):
            lap = AC if style == "coat" else S2
            for k in range(3):                                             # stepped V lapels in 2-vox steps
                ch.paint(-2 - 2 * k, fy - 1, 34 - 2 * k, 2 + 2 * k, fy, 36 - 2 * k, lap)
                ch.paint(-1 - 2 * k, fy - 1, 34 - 2 * k, 1 + 2 * k, fy, 36 - 2 * k, D if style != "labcoat" else S2)
        if style == "jacket":
            ch.box(-A + 2, fy, 29, -2, fy + 1, 32, S2).paint(-A + 2, fy, 31, -2, fy + 1, 32, AC)   # chest pocket
            sp.box(-w, fy, 24, -2, fy + 1, 27, S2).box(2, fy, 24, w, fy + 1, 27, S2)             # hand pockets
            ch.box(3, fy, 31, 5, fy + 1, 32, AC).box(5, fy, 31, 6, fy + 1, 32, EM)              # badge + light
            for z in (29, 31, 33):
                ch.box(-1, fy, z, 1, fy + 1, z + 1, M)                                          # zip teeth
        if style == "coat":
            for z in (29, 31, 33):                                                               # double-breasted
                ch.box(-4, fy, z, -3, fy + 1, z + 1, M).box(3, fy, z, 4, fy + 1, z + 1, M)
            ch.box(3, fy, 34, 6, fy + 1, 35, AC).box(3, fy, 33, 4, fy + 1, 34, EM)             # rank bar + pin
            ch.box(-A, fy - 2, 29, -A + 1, fy, 35, AC).box(A - 1, fy - 2, 29, A, fy, 35, AC)   # braided edges
            sp.paint(-w - 1, -5, 27, w + 1, fy, 28, AC)                                          # waist trim
            ch.paint(-A + 1, by, 36, A - 1, fy, 37, AC)                                         # gold collar (yoke)
        if style == "labcoat":
            ch.box(-A + 1, fy, 29, -3, fy + 1, 32, S2).box(-A + 2, fy + 1, 31, -A + 3, fy + 2, 34, AC)  # pocket + pens
            ch.box(-A + 4, fy + 1, 31, -A + 5, fy + 2, 33, EM)
            ch.box(3, fy, 32, 6, fy + 1, 34, EM)                                                 # glowing ID badge
            sp.box(-w - 1, fy, 23, -2, fy + 1, 26, S2).box(2, fy, 23, w + 1, fy + 1, 26, S2)
        if style == "flight":
            ch.paint(-A, by, 31, A, fy, 33, AC)                                                  # chest stripe (2)
            ch.box(-A + 1, fy, 30, -2, fy + 1, 34, S2).box(-A + 2, fy + 1, 31, -A + 4, fy + 2, 33, EM)  # comms
            for x0 in (-4, 3):
                ch.box(x0, fy, 28, x0 + 1, fy + 1, 36, D)                                        # harness straps
                sp.box(x0, fy, 23, x0 + 1, fy + 1, 28, D)
            sp.box(-2, fy, 24, 2, fy + 2, 27, M).box(-1, fy + 2, 25, 1, fy + 3, 26, EM)          # quick-release
            ch.box(A - 3, fy, 34, A - 1, fy + 1, 35, AC)                                         # wings pin
        return vols

    # ---- plated / rigged looks: base + raised 2-vox plates, seams, lights (T2/T3 ~10-20 % emit)
    ft = 1 if tier < 3 else 2
    if tier >= 2 or style in ("medic", "vest", "hazard"):
        ch.box(-c, fy, 29, c, fy + ft, 35, P).chamfer_z(-c, fy, c, fy + ft, 29, 35)        # front plates
        ch.paint(-1, fy, 29, 1, fy + ft, 35, D)                                             # centre seam
        ch.paint(-c, fy, 31, c, fy + ft, 32, S2)                                            # plate split
        ch.box(-c + 1, by - 1, 29, c - 1, by, 33, P).paint(-1, by - 1, 29, 1, by, 33, M)   # back plate + mount
        ch.paint(-A, -4, 30, A, 4, 32, D)                                                   # side vents
        sp.box(-w, fy, 24, w, fy + 1, 26, S2).box(-w + 1, fy, 26, w - 1, fy + 1, 28, P)    # abdomen plates
        sp.paint(-w - 1, -5, 23, w + 1, -4, 28, P)
    if tier >= 1:
        ch.box(c - 3, fy + ft, 33, c - 1, fy + ft + 1, 34, EM if tier >= 2 else AC)       # status light
    if tier >= 2:
        ch.paint(-A, -4, 30, A, 4, 31, EM)                                                  # glowing side vents
        ch.paint(-c + 1, fy + ft - 1, 31, c - 1, fy + ft, 32, EM)                           # plate split glow
        ch.paint(-1, by - 1, 29, 1, by, 33, EM)                                             # back spine glow
        ch.box(-4, fy + ft, 29, 4, fy + ft + 1, 30, EM)                                     # light bar
        ch.box(-c + 1, fy + ft, 33, -c + 3, fy + ft + 1, 34, M)                             # bolts
        sp.box(-3, fy + 1, 24, 3, fy + 2, 25, EM)                                           # belly light strip
    if tier >= 3:
        ch.box(-c - 1, fy + ft - 1, 30, -c + 1, fy + ft + 1, 36, S2)                       # bolted flanks
        ch.box(c - 1, fy + ft - 1, 30, c + 1, fy + ft + 1, 36, S2)
        ch.box(-2, fy + ft, 31, 2, fy + ft + 1, 33, AC).box(-1, fy + ft + 1, 31, 1, fy + ft + 2, 33, EM)   # core
        ch.box(-c + 1, fy + ft, 34, c - 1, fy + ft + 1, 35, EM)                            # upper light bar
        sp.box(-w, fy + 1, 26, w, fy + 2, 28, P).paint(-w, fy + 1, 27, w, fy + 2, 28, EM)  # lower plate glow
    if style in ("harness", "tactical"):
        for x0 in (-4, 3):                                                                   # webbing
            ch.box(x0, fy, 28, x0 + 1, fy + 1, 36, D).box(x0, by - 1, 28, x0 + 1, by, 36, D)
            sp.box(x0, fy, 23, x0 + 1, fy + 1, 28, D)
        ch.box(-A, fy, 31, A, fy + 1, 32, D).box(-1, fy + 1, 31, 1, fy + 2, 32, M)          # chest strap + buckle
        sp.box(-w, fy, 24, -1, fy + 2, 27, S2).paint(-w, fy + 1, 26, -1, fy + 2, 27, D)     # belly pouches
        sp.box(1, fy, 24, w, fy + 2, 27, S2).paint(1, fy + 1, 26, w, fy + 2, 27, D)
        if style == "tactical":
            for x0 in (-A + 1, -2, A - 4):                                                   # magazine pouches
                ch.box(x0, fy + 1, 28, x0 + 3, fy + 3, 31, S2).paint(x0, fy + 2, 30, x0 + 3, fy + 3, 31, D)
            ch.box(A - 3, fy + 1, 33, A - 1, fy + 2, 35, EM).box(-A + 1, fy + 1, 33, -A + 3, fy + 2, 35, AC)
    if style == "medic":
        ch.paint(-c, fy, 34, c, fy + ft, 35, AC)                                            # red band
        ch.box(-c + 1, fy + ft, 32, -c + 4, fy + ft + 1, 33, AC).box(-c + 2, fy + ft, 31, -c + 3, fy + ft + 1, 34, AC)
        ch.paint(-A, by, 32, A, fy, 33, AC)
        sp.box(-w, fy + 1, 25, w, fy + 2, 26, AC)
    if style == "vest":
        ch.box(-c + 1, fy + ft, 32, -c + 3, fy + ft + 1, 34, AC).box(-c + 1, fy + ft + 1, 33, -c + 2, fy + ft + 2, 34, M)
        ch.box(-A, fy - 1, 28, A, fy + ft, 29, AC)                                          # hi-vis stripe
        sp.box(-w, fy + 1, 26, w, fy + 2, 27, AC)
    if style == "hazard":
        for x in range(-w, w, 2):                                                           # hazard chevrons
            sp.box(x, fy, 23, x + 1, fy + 1, 24, AC)
        ch.paint(-c, fy, 34, c, fy + ft, 35, AC)
        ch.box(-2, fy + ft, 32, 2, fy + ft + 1, 34, D).box(-1, fy + ft + 1, 32, 1, fy + ft + 2, 34, EM)
    return vols


def coat_tails(c, w, style):
    """Coat skirts: front/back hip panels (pelvis) and front/back tails per thigh so the skirt swings with
    the legs. The outer thigh above z 15 stays open for the hanging hand."""
    hub = Vol().box(-8, 5, 16, 8, 6, 19, P).box(-8, -5, 16, 8, -4, 19, P)
    trim = AC if style == "coat" else S2
    hub.paint(-8, -5, 18, 8, 6, 19, trim)
    drop = 12 if style == "coat" else 10                 # coat to above the knee, lab coat to the knee
    tail = Vol()
    tail.box(0, 4, drop, 8, 5, 17, P).box(0, -4, drop, 8, -3, 17, P)          # front + back panels
    tail.box(0, -4, drop, 1, 5, 17, P)                                        # inner edge
    tail.box(8, -4, drop, 9, 5, 14, P)                                        # outer wrap below the hand
    tail.paint(0, -4, drop, 9, 5, drop + 1, trim)                             # hem
    if style == "labcoat":
        tail.box(9, -2, 11, 10, 2, 14, S2).paint(9, -2, 13, 10, 2, 14, AC)   # side pocket
    else:
        tail.box(0, 5, drop + 1, 1, 6, 16, trim)                              # front braid
    return {"pelvis": hub, **sided({"thigh.R": tail})}


# ========================================================================================= SHOULDERS
# Body deltoid (upper_arm.R): x 7..14, y -3..3, z 32..36; upper arm x 8..13, y -3..3, z 27..34.
# The chibi head (x -9..9 from z 37) overhangs the inner shoulder, so crowns start at x >= 10.
def shoulder_vols(tier, style):
    ua = Vol()
    if style in ("cloth", "epaulette") or tier == 0:
        top = AC if style == "epaulette" else S2
        ua.box(9, -4, 31, 15, 4, 36, P if style == "epaulette" else S2).chamfer_outer(15, -4, 4, 31, 36)
        ua.box(8, -4, 36, 15, 4, 37, top).box(7, -4, 36, 8, 4, 37, top)
        if style == "epaulette":
            for y in range(-4, 4, 2):                                             # fringe
                ua.box(15, y, 30, 16, y + 1, 36, AC)
            ua.box(11, -1, 37, 13, 1, 38, M)                                      # rank pip
        else:
            ua.box(15, -1, 32, 16, 1, 34, D)                                      # sleeve tab
        return sided({"upper_arm.R": ua})
    g = {1: 0, 2: 1, 3: 2}[tier]
    x1, y0, y1 = 15 + g, -4 - g, 4 + g
    low = 31 - (tier >= 2)
    ua.box(9, y0, low, x1, y1, 36, P).chamfer_outer(x1, y0, y1, low, 36)          # cap (inner face in the deltoid)
    ua.box(8, y0, 36, x1, y1, 37, P).box(7, -4, 36, 8, 4, 37, P)                   # top row over the deltoid
    dz = 35 if tier >= 2 else 36                                                   # (light caps hug the deltoid)
    ua.cut(x1 - 1, y0, dz, x1, y1, 37)                                             # stepped dome: outer edge
    ua.cut(9, y0, dz, x1, y0 + 1, 37).cut(9, y1 - 1, dz, x1, y1, 37)               # front/back edges
    ua.box(10, y0 + 2, 37, x1 - 2, y1 - 2, 38 + (tier >= 2), S2)                   # crown beside the head
    ua.box(9, y0 - (tier >= 3), low - 1, x1 + 1, y1 + (tier >= 3), low, S2)        # rim
    ua.box(x1, -2, low + 1, x1 + 1, 2, low + 2, EM)                                # side light
    if tier >= 2:
        ua.box(x1, y0 + 1, 33, x1 + 1, y1 - 1, 34, EM)                             # light strip
        ua.box(10, y1, 32, x1 - 1, y1 + 1, 33, EM).box(10, y0 - 1, 32, x1 - 1, y0, 33, EM)   # front/back glow
        ua.box(x1, y0 + 1, 35, x1 + 1, y0 + 2, 36, M).box(x1, y1 - 2, 35, x1 + 1, y1 - 1, 36, M)   # bolts
    if tier >= 3:
        ua.box(x1, y0 + 1, low, x1 + 1, y1 - 1, 33, P).paint(x1, y0 + 1, low, x1 + 1, y1 - 1, low + 1, D)
        ua.box(x1 - 3, y0, 39, x1, y1, 40, S2)                                     # ridge
        ua.box(x1 + 1, y0 + 1, low + 1, x1 + 2, y0 + 2, low + 2, M).box(x1 + 1, y1 - 2, low + 1, x1 + 2, y1 - 1, low + 2, M)
    if style == "flight":
        ua.box(x1, -2, 31, x1 + 1, 2, 33, AC).box(x1 + 1, -1, 31, x1 + 2, 1, 32, EM)   # mission patch
    return sided({"upper_arm.R": ua})


# ============================================================================================ GLOVES
# Body hand.R: chunky cube x 8..15, y -3..4, z 15..21 (hidden when gloves are worn);
# forearm x 8..13, y -3..3, z 21..27. The glove never reaches inward past x = 8 (thigh at x < 8).
def glove_vols(tier, style):
    hd, fa = Vol(), Vol()
    palm = S2 if tier < 2 else D
    hd.box(8, -4, 14, 16, 5, 21, palm).chamfer_outer(16, -4, 5, 14, 21)        # fist (2-vox blocks)
    hd.paint(8, -4, 14, 16, 5, 16, S2 if tier < 2 else palm)                   # finger row
    for y in (-2, 0, 2):
        hd.paint(8, y, 15, 16, y + 1, 16, D).cut(8, y, 14, 16, y + 1, 15)       # finger grooves (stepped tips)
    hd.box(9, 5, 16, 12, 6, 20, palm)                                           # thumb (front)
    hd.box(16, -2, 16, 17, 3, 20, P)                                            # back-of-hand plate
    hd.paint(8, -4, 19, 16, 5, 21, P if tier else S2)                           # cuff band
    if tier >= 1:
        hd.box(16, -3, 15, 17, 4, 16, M)                                        # knuckle bar
        hd.box(17, -1, 17, 18, 2, 19, EM if tier >= 2 else AC)
    if tier >= 2:
        hd.paint(8, -4, 19, 16, 5, 20, EM)                                      # glowing cuff seam
    if tier >= 3:
        hd.box(9, 6, 17, 14, 7, 20, P).box(16, -3, 20, 17, 4, 21, EM)           # knuckle guard + wrist glow
    if tier >= 1 or style == "work":
        top = 23 + {0: 1, 1: 1, 2: 2, 3: 3}[tier]
        fa.box(7, -4, 21, 14, 4, top, P if tier >= 2 else S2).chamfer_z(7, -4, 14, 4, 21, top)   # bracer
        fa.paint(7, -4, top - 1, 14, 4, top, AC)
        if tier >= 2:
            fa.box(14, -2, 21, 15, 2, top - 1, S2).box(14, -1, 21, 15, 1, 22, EM)   # wrist display
            fa.box(14, -3, top - 1, 15, 3, top, EM)
        if style == "work":
            fa.box(7, -5, top - 2, 15, 5, top, D).paint(7, -5, top - 1, 15, 5, top, AC)   # flared gauntlet
    return sided({"hand.R": hd, **({"forearm.R": fa} if fa.c else {})})


# ============================================================================================= BOOTS
# Body foot.R x 1..8, y -4..4, z 0..4 and toe.R y 4..7, z 0..3 (hidden when boots are worn);
# shin.R x 1..8, y -3..4, z 4..10. Boots are a ~0.12 m block plus a shaft on the shin.
def boot_vols(tier, style):
    ft, to, sh = Vol(), Vol(), Vol()
    sole = 1 + (tier >= 2)
    ft.box(0, -5, 0, 9, 4, 4, P).paint(0, -5, 0, 9, 4, sole, D)                # heel/instep block (foot bone)
    ft.cut(0, -5, sole, 1, -4, 4).cut(8, -5, sole, 9, -4, 4)                   # rounded heel
    ft.paint(1, -5, sole, 8, -4, 4, S2)                                         # heel counter
    to.box(0, 4, 0, 9, 9, 4, P).paint(0, 4, 0, 9, 9, sole, D)                   # toe box (toe bone)
    to.cut(0, 8, sole, 1, 9, 4).cut(8, 8, sole, 9, 9, 4)
    to.paint(1, 8, sole, 8, 9, 4, S2)                                           # toe cap
    up = {0: 2, 1: 3, 2: 4, 3: 5}[tier] + (1 if style == "dress" else 0)
    top = 4 + up
    sh.box(0, -4, 4, 9, 5, top, P).chamfer_z(0, -4, 9, 5, 4, top)              # shaft (shin bone)
    sh.paint(0, -4, top - 1, 9, 5, top, AC if style == "dress" else S2)        # cuff rim
    if style == "sneaker":
        ft.paint(0, -5, sole, 9, 4, sole + 1, AC)
        to.paint(0, 4, sole, 9, 9, sole + 1, AC)
        to.paint(2, 5, 3, 7, 8, 4, S2)                                          # laces
        return sided({"foot.R": ft, "toe.R": to, "shin.R": sh})
    if style != "dress":
        for z in range(4, top - 1, 2):
            sh.paint(2, 4, z, 7, 5, z + 1, D)                                   # laces
        to.paint(2, 5, 3, 7, 8, 4, D)
    if tier >= 2:
        sh.box(9, -2, 5, 10, 2, 6, EM).paint(0, 4, top - 1, 9, 5, top, EM)     # ankle light + front cuff glow
        to.paint(1, 8, 2, 8, 9, 3, EM)                                          # toe cap light
        to.box(1, 9, 0, 8, 10, sole + 1, M)                                     # toe guard
        ft.box(9, -2, sole, 10, 2, sole + 2, M)                                 # ankle bolt
    if tier >= 3:
        ft.paint(0, -5, 0, 9, 4, 1, M)
        to.paint(0, 4, 0, 9, 9, 1, M)
        sh.box(9, -2, 7, 10, 2, 8, EM).box(2, 5, 4, 7, 6, 7, P)                 # glow + greave lip (below knee guards)
        sh.paint(2, 5, 6, 7, 6, 7, EM)
    if style == "flight":
        sh.paint(0, -4, top - 3, 9, 5, top - 2, AC).box(9, -2, 6, 10, 2, 8, AC)
    if style == "dress":
        sh.box(1, 5, top - 2, 8, 6, top - 1, M)                                 # buckle strap
    return sided({"foot.R": ft, "toe.R": to, "shin.R": sh})


# ============================================================================================== LEGS
# Body thigh.R x 1..8, y -3..4, z 10..18; shin.R x 1..8, y -3..4, z 4..10. The hand hangs at
# x >= 8, z >= 14: leg armour on the outer thigh stays below z 14.
def legs_vols(tier, style):
    th, sh = Vol(), Vol()
    if tier == 0:
        th.box(8, -3, 10, 9, 3, 14, S2).paint(8, -3, 13, 9, 3, 14, D)           # cargo pocket
        th.box(9, -1, 11, 10, 1, 12, M)
        th.box(2, 4, 11, 7, 5, 14, S2)                                          # knee patch
        th.box(1, 4, 15, 4, 5, 17, S2)                                          # front pocket
        return sided({"thigh.R": th})
    sh.box(1, 4, 7, 8, 6, 12, P).chamfer_z(1, 4, 8, 6, 7, 12)                   # knee guard (2 deep)
    sh.paint(1, 5, 9, 8, 6, 10, S2)
    sh.box(2, 6, 8, 7, 7, 11, S2)                                               # guard boss
    if tier >= 2:
        sh.box(3, 7, 9, 6, 8, 10, EM)
        th.box(1, 4, 12, 8, 5, 17, P).paint(1, 4, 14, 8, 5, 15, EM)            # thigh front plate + glow seam
        sh.paint(1, 5, 9, 8, 6, 10, EM)
        th.box(8, -3, 10, 9, 4, 14, P).paint(8, -3, 12, 9, 4, 13, D)           # outer plate below the hand
        th.box(9, -1, 11, 10, 1, 12, EM)
    else:
        th.box(0, -4, 13, 9, 5, 14, D)                                          # thigh strap
        th.box(9, -2, 10, 10, 2, 14, S2).paint(9, -2, 13, 10, 2, 14, AC)       # thigh pouch
    if tier >= 3:
        th.box(1, 5, 12, 8, 6, 17, P).paint(1, 5, 12, 8, 6, 13, EM)             # layered front plate
        sh.box(2, 7, 11, 6, 8, 12, P)
    vols = sided({"thigh.R": th, "shin.R": sh})
    if tier >= 3:
        pv = Vol()
        for x0, x1 in ((-7, -2), (2, 7)):                                       # front tassets under the belt
            pv.box(x0, 5, 15, x1, 7, 19, P).paint(x0, 6, 15, x1, 7, 16, S2)
        vols["pelvis"] = pv
    return vols


# ============================================================================================== BELT
# Body pelvis x -7..7, y -4..5, z 17..22 (belt band z 20..22); waist x -6..6 above. Arms and
# gloves hang at x >= 7 for y -5..5, so the band has arm notches whose floor stays inside the body.
def belt_vols(c, w, tier, style):
    p = Vol()
    band = AC if style == "sash" else D
    p.box(-8, -5, 19, 8, 7, 23, band).chamfer_z(-8, -5, 8, 7, 19, 23)
    p.cut(6, -5, 19, 8, 6, 22).cut(-8, -5, 19, -6, 6, 22)                      # arm notches (pelvis ±7)
    k = w - 1 if w >= 6 else w + 1       # top row: buried in a wide waist, or covering a narrow waist's hip ledge
    p.cut(k, -5, 22, 8, 6, 23).cut(-8, -5, 22, -k, 6, 23)
    p.box(-2, 7, 19, 2, 8, 23, M if style != "sash" else AC)                    # buckle
    p.box(-1, 8, 20, 1, 9, 22, EM if tier >= 1 else M)
    p.paint(-8, -5, 22, 8, 7, 23, S2 if style != "sash" else AC)               # top edge
    if style == "plain":
        p.box(3, 7, 20, 4, 8, 22, S2).box(-4, 7, 20, -3, 8, 22, S2)             # loops
        return {"pelvis": p}
    if style == "sash":
        p.box(-6, 7, 22, -4, 8, 25, AC).box(-6, 7, 16, -5, 8, 19, AC)           # sash knot + tail
        p.box(3, 7, 20, 5, 8, 22, M)
        return {"pelvis": p}
    h = 3 if tier < 3 else 4
    for x0 in ([-6, 3] if tier <= 1 else [-6, -4, 2, 4]):                       # front pouches
        wd = 3 if tier <= 1 else 2
        p.box(x0, 7, 23 - h, x0 + wd, 9, 23, S2).paint(x0, 8, 22, x0 + wd, 9, 23, P)
    for x0 in (4, -8):                                                          # hip pouches (back quarters)
        p.box(x0, -7, 19, x0 + 4, -5, 23, S2).paint(x0, -7, 22, x0 + 4, -5, 23, P)
    p.box(-2, -7, 18, 2, -5, 23, S2).paint(-2, -7, 22, 2, -5, 23, P)          # back pouch
    if tier >= 2:
        p.paint(-8, 6, 20, 8, 7, 21, EM).paint(-8, 6, 22, 8, 7, 23, EM)         # front glow lines
    if style == "tool":
        p.box(8, -7, 11, 9, -6, 21, M).box(8, -8, 11, 9, -5, 13, M)             # wrench behind the hip
        p.box(-9, -7, 12, -8, -6, 20, AC).box(-9, -7, 20, -8, -6, 22, D)        # screwdriver
        p.box(-3, 9, 20, -1, 10, 22, EM)
    if style == "medic":
        p.box(-6, 9, 20, -3, 10, 21, AC).box(-5, 9, 19, -4, 10, 22, AC)         # red cross tab
    if style == "holster" or tier >= 2:
        p.box(8, -8, 11, 11, -5, 20, D).paint(8, -8, 19, 11, -5, 20, M)         # holster behind the arm
    if tier >= 3:
        p.paint(-8, -5, 19, 8, 7, 20, M)
        p.box(-6, 9, 20, -2, 10, 22, P).box(2, 9, 20, 6, 10, 22, P)             # armoured pouch lids
    return {"pelvis": p}


# ============================================================================================== BACK
# Pack front face at y = -7: behind the chest armour back (-6) and bridged to a bare body (-5) by a
# harness plate that hides inside chest armour. Packs ride the chest bone (socket.back); tops stay
# at or below z 36 because the chibi head (y -8..8) overhangs from z 37.
def back_vols(kind, tier):
    p = Vol()
    b0 = -7
    ex = []
    harness = lambda: p.box(-3, b0, 31, 3, -5, 35, D).paint(-3, b0, 34, 3, -5, 35, M)   # noqa: E731
    if kind == "backpack":
        depth = {0: 4, 1: 5, 2: 6, 3: 7}[tier]
        W = {0: 5, 1: 6, 2: 6, 3: 7}[tier]
        top, bot = 36, {0: 27, 1: 26, 2: 24, 3: 22}[tier]
        yb = b0 - depth
        p.box(-W, yb, bot, W, b0, top, P).chamfer_z(-W, yb, W, b0, bot, top)
        p.box(-W + 1, yb - 1, bot + 1, W - 1, yb, top - 2, P)                          # outer panel
        p.paint(-W + 1, yb - 1, bot + 1, W - 1, yb, bot + 2, D).paint(-W + 1, yb - 1, top - 3, W - 1, yb, top - 2, D)
        p.paint(-W + 1, yb - 1, bot + 1, -W + 2, yb, top - 2, D).paint(W - 2, yb - 1, bot + 1, W - 1, yb, top - 2, D)
        p.paint(-W, yb, top - 2, W, b0, top, S2)                                        # lid (2-vox)
        p.box(-W + 2, yb - 2, bot + 2, W - 2, yb - 1, bot + 5, S2).paint(-W + 2, yb - 2, bot + 4, W - 2, yb - 1, bot + 5, AC)
        harness()
        if tier >= 1:
            p.box(W, yb + 1, bot + 1, W + 2, b0 - 1, top - 3, D)                       # side bottle
            p.box(-W - 1, yb + 1, bot + 2, -W, b0 - 1, top - 4, S2)
            p.box(-1, yb - 1, top - 4, 1, yb, top - 3, EM)
        if tier >= 2:
            p.paint(-W, yb, bot, W, b0, bot + 1, M)
            p.box(W - 3, yb - 2, top - 6, W - 1, yb - 1, top - 4, EM)                   # glow panel
            p.paint(-W + 1, yb - 1, bot + 2, -W + 2, yb, top - 3, EM).paint(W - 2, yb - 1, bot + 2, W - 1, yb, top - 3, EM)
            p.paint(-W, yb, top - 2, W, yb + 1, top - 1, EM)                             # lid light edge
        if tier >= 3:
            p.box(-W - 1, yb - 1, bot - 1, W + 1, b0 - 1, bot, D)
            p.box(-W + 1, yb - 2, bot + 6, W - 1, yb - 1, bot + 7, EM)                  # light bar
            p.box(W - 1, yb + 1, top, W, yb + 2, top + 8, M).box(W - 1, yb + 1, top + 8, W, yb + 2, top + 9, EM)  # antenna
    elif kind == "oxygen":
        twin = tier >= 2
        for cx in ([-3, 3] if twin else [0]):
            r = 2 if twin else 3
            x0, x1, yb = cx - r, cx + r, b0 - 2 * r
            p.box(x0, yb, 25, x1, b0, 35, S2).chamfer_z(x0, yb, x1, b0, 25, 35)          # tank
            p.box(x0 + 1, yb + 1, 35, x1 - 1, b0 - 1, 37, M)                              # valve
            band = EM if twin else AC
            p.paint(x0, yb, 27, x1, b0, 28, band).paint(x0, yb, 33, x1, b0, 34, band)     # bands
            p.box(cx - 1, yb - 1, 29, cx + 1, yb, 32, EM)                                 # gauge window
        p.box(-6 if twin else -4, b0 - 1, 26, 6 if twin else 4, b0, 35, D)               # frame plate
        p.box(-1, b0 - 5, 24, 1, b0 - 1, 25, D)                                          # hose manifold
        harness()
    elif kind == "jetpack":
        W = 6 if tier < 3 else 7
        depth = 5 if tier < 3 else 6
        p.box(-W + 2, b0 - depth, 25, W - 2, b0, 36, P).chamfer_z(-W + 2, b0 - depth, W - 2, b0, 25, 36)   # fuel core
        p.box(-W + 3, b0 - depth - 1, 27, W - 3, b0 - depth, 34, S2)
        p.box(-1, b0 - depth - 2, 27, 1, b0 - depth - 1, 34, EM)                          # core light column
        for sx in (-1, 1):                                                                 # twin thrusters
            x0 = W - 3 if sx > 0 else -W
            x1 = x0 + 3
            p.box(x0, b0 - depth + 1, 23, x1, b0 - 1, 35, S2).chamfer_z(x0, b0 - depth + 1, x1, b0 - 1, 23, 35)
            p.paint(x0, b0 - depth + 1, 33, x1, b0 - 1, 35, AC)
            p.box(x0, b0 - depth + 1, 20, x1, b0 - 1, 23, M)                               # nozzle bell
            p.box(x0 + 1, b0 - depth + 2, 19, x1 - 1, b0 - 2, 20, EM)                      # hot throat
            p.paint(x0, b0 - depth + 1, 29, x1, b0 - 1, 30, EM)                            # thruster glow ring
            p.paint(x0, b0 - depth + 1, 25, x1, b0 - 1, 26, EM)
            ex.append(("chest", ((x0 + x1) / 2, (b0 - depth + 1 + b0 - 1) / 2, 19), 1.5))
        if tier >= 3:
            p.box(-W - 1, b0 - 3, 30, -W, b0 - 1, 36, D).box(W, b0 - 3, 30, W + 1, b0 - 1, 36, D)   # fins
        harness()
    elif kind == "medpack":
        p.box(-6, b0 - 5, 24, 6, b0, 36, AC).chamfer_z(-6, b0 - 5, 6, b0, 24, 36)
        p.box(-5, b0 - 6, 25, 5, b0 - 5, 34, S2)
        p.box(-1, b0 - 7, 26, 1, b0 - 6, 33, AC).box(-3, b0 - 7, 28, 3, b0 - 6, 31, AC)   # cross (2-vox arms)
        p.paint(-6, b0 - 5, 34, 6, b0, 36, M)
        p.box(3, b0 - 6, 32, 5, b0 - 5, 34, EM)
        harness()
    elif kind == "radio":
        p.box(-5, b0 - 5, 24, 5, b0, 36, P).chamfer_z(-5, b0 - 5, 5, b0, 24, 36)
        p.box(-4, b0 - 6, 26, 4, b0 - 5, 33, D).paint(-3, b0 - 6, 31, -1, b0 - 5, 32, EM)
        p.box(3, b0 - 3, 36, 4, b0 - 2, 50, M).box(3, b0 - 3, 50, 4, b0 - 2, 51, EM)       # whip antenna
        p.paint(-5, b0 - 5, 29, 5, b0, 30, AC)
        harness()
    elif kind == "toolpack":
        p.box(-6, b0 - 5, 23, 6, b0, 35, P).chamfer_z(-6, b0 - 5, 6, b0, 23, 35)
        p.box(-5, b0 - 6, 24, 5, b0 - 5, 29, D).paint(-5, b0 - 6, 28, 5, b0 - 5, 29, AC)
        p.paint(-6, b0 - 5, 33, 6, b0, 35, S2)
        p.box(6, b0 - 5, 27, 8, b0 - 1, 37, M).box(6, b0 - 4, 37, 8, b0 - 2, 38, AC)       # torch rack
        p.box(-8, b0 - 4, 25, -6, b0 - 1, 33, AC).paint(-8, b0 - 4, 28, -6, b0 - 1, 30, D)   # cable reel
        p.box(-2, b0 - 6, 31, 2, b0 - 5, 32, EM)
        harness()
    return {"chest": p}, ex


CHEST_STYLES = [
    ("jacket", 0, "jacket", "Crew jacket"), ("harness", 1, "harness", "Light harness vest"),
    ("plate", 2, "plate", "Standard plate carrier"), ("heavy", 3, "plate", "Heavy assault cuirass"),
    ("coat", 0, "coat", "Officer's coat"), ("labcoat", 0, "labcoat", "Lab coat"),
    ("overalls", 0, "overalls", "Work overalls"), ("flight", 1, "flight", "Flight suit harness"),
    ("tactical", 1, "tactical", "Tactical chest rig"), ("vest", 2, "vest", "Security vest"),
    ("medic", 2, "medic", "Medical plate"), ("hazard", 2, "hazard", "Hazard-rated plate"),
]
SHOULDER_STYLES = [
    ("cloth", 0, "cloth", "Shoulder pads"), ("light", 1, "plain", "Light pauldrons"),
    ("standard", 2, "plain", "Standard pauldrons"), ("heavy", 3, "plain", "Heavy pauldrons"),
    ("epaulette", 0, "epaulette", "Officer epaulettes"), ("flight", 1, "flight", "Flight pauldrons"),
]
GLOVE_STYLES = [
    ("fabric", 0, "plain", "Fabric gloves"), ("light", 1, "plain", "Light gloves"),
    ("standard", 2, "plain", "Armoured gauntlets"), ("heavy", 3, "plain", "Heavy gauntlets"),
    ("work", 1, "work", "Work gloves"),
]
BOOT_STYLES = [
    ("sneaker", 0, "sneaker", "Deck shoes"), ("light", 1, "plain", "Work boots"),
    ("standard", 2, "plain", "Armoured boots"), ("heavy", 3, "plain", "Heavy mag boots"),
    ("dress", 1, "dress", "Dress boots"), ("flight", 1, "flight", "Flight boots"),
]
LEG_STYLES = [
    ("cargo", 0, "cargo", "Cargo trousers"), ("light", 1, "plain", "Knee pads and straps"),
    ("standard", 2, "plain", "Thigh and knee plates"), ("heavy", 3, "plain", "Heavy greaves and tassets"),
]
BELT_STYLES = [
    ("plain", 0, "plain", "Belt"), ("utility", 1, "utility", "Utility belt"),
    ("standard", 2, "utility", "Load-bearing belt"), ("heavy", 3, "utility", "Heavy armoured belt"),
    ("tool", 1, "tool", "Tool belt"), ("medic", 1, "medic", "Medic belt"),
    ("sash", 0, "sash", "Officer's belt"), ("holster", 2, "holster", "Holster belt"),
]
BACK_STYLES = [
    ("backpack-t0", "backpack", 0, "Day pack"), ("backpack-t1", "backpack", 1, "Field pack"),
    ("backpack-t2", "backpack", 2, "Expedition pack"), ("backpack-t3", "backpack", 3, "Heavy combat rig"),
    ("oxygen-single", "oxygen", 1, "Oxygen pack"), ("oxygen-twin", "oxygen", 2, "Twin-tank oxygen pack"),
    ("jetpack-light", "jetpack", 2, "Light jetpack"), ("jetpack-heavy", "jetpack", 3, "Heavy jetpack"),
    ("medpack", "medpack", 1, "Medical pack"), ("radio", "radio", 1, "Recon radio pack"),
    ("toolpack", "toolpack", 1, "Engineer tool pack"),
]
MASS = {"chest": [1.2, 3.0, 6.5, 11.0], "shoulders": [0.2, 1.0, 2.2, 4.0], "gloves": [0.1, 0.3, 0.8, 1.4],
        "boots": [0.8, 1.2, 2.0, 3.4], "legs": [0.3, 1.0, 3.0, 5.5], "belt": [0.2, 0.5, 0.9, 1.6],
        "back": [0.8, 1.2, 2.4, 4.0]}
GRID = {"chest": (3, 3), "shoulders": (2, 2), "gloves": (2, 1), "boots": (2, 2), "legs": (2, 3), "belt": (2, 1),
        "back": (3, 4)}
HIDES = {"gloves": ["hands"], "boots": ["feet"]}   # CHAR-BODY regions a part replaces
SOCKET = {"chest": "socket.chest", "shoulders": "socket.shoulder", "gloves": "socket.glove", "boots": "socket.foot",
          "legs": None, "belt": "socket.belt", "back": "socket.back"}


def build_catalog():
    parts = []

    def add(pid, slot, tier, style, name, fits, exhaust=()):
        parts.append(Part(pid, slot, tier, style, name, fits, SOCKET[slot], MASS[slot][tier], GRID[slot], list(exhaust),
                          list(HIDES.get(slot, ()))))

    for sfx, t, st, name in CHEST_STYLES:
        fits = {}
        for fname, f in FITS.items():
            vols = chest_vols(f["chest"], f["waist"], t, st)
            if st in ("coat", "labcoat"):
                vols.update(coat_tails(f["chest"], f["waist"], st))
            fits[fname] = vols
        add(f"armor.chest.{sfx}", "chest", t, st, name, fits)
    for sfx, t, st, name in SHOULDER_STYLES:
        add(f"armor.shoulders.{sfx}", "shoulders", t, st, name, {"all": shoulder_vols(t, st)})
    for sfx, t, st, name in GLOVE_STYLES:
        add(f"armor.gloves.{sfx}", "gloves", t, st, name, {"all": glove_vols(t, st)})
    for sfx, t, st, name in BOOT_STYLES:
        add(f"armor.boots.{sfx}", "boots", t, st, name, {"all": boot_vols(t, st)})
    for sfx, t, st, name in LEG_STYLES:
        add(f"armor.legs.{sfx}", "legs", t, st, name, {"all": legs_vols(t, st)})
    for sfx, t, st, name in BELT_STYLES:
        add(f"armor.belt.{sfx}", "belt", t, st, name,
            {fn: belt_vols(f["chest"], f["waist"], t, st) for fn, f in FITS.items()})
    for sfx, kind, t, name in BACK_STYLES:
        vols, ex = back_vols(kind, t)
        add(f"armor.back.{sfx}", "back", t, kind, name, {"all": vols}, ex)
    return parts


# ========================================================================================= COLOURWAYS
# sRGB hex per armour slot (skin/hair/eye belong to the character). The six sheet colourways match
# the equipment sheet's columns; role colourways match the crew roster.
def cw(primary, secondary, accent, metal, dark, emit, glass="#7fd8ff", label=""):
    return {"suit_primary": primary, "suit_secondary": secondary, "accent": accent, "metal": metal,
            "dark": dark, "emit": emit, "glass": glass, "label": label}


COLOURWAYS = {
    "arctic": cw("#dcd6ea", "#5d5f8a", "#4f7cff", "#a3abc0", "#2a2b40", "#56c8ff", label="Arctic"),
    "crimson": cw("#c8263d", "#2e2735", "#f08a2a", "#a0a6b3", "#1b1820", "#ff5a4a", label="Crimson"),
    "cobalt": cw("#2f63e6", "#e2e6f0", "#1b2d7a", "#a8b2c6", "#161c33", "#5fd2ff", label="Cobalt"),
    "amber": cw("#f4a61e", "#2d2c38", "#4c83ff", "#aeafb6", "#1c1b24", "#6fd6ff", label="Amber"),
    "moss": cw("#86b43c", "#2e3528", "#d4e05c", "#929c90", "#161a14", "#8dff5a", label="Moss"),
    "shadow": cw("#4d4864", "#2b283a", "#f08a2a", "#827f96", "#131219", "#ff9a3a", label="Shadow"),
    "captain": cw("#1f2d55", "#e3e8f1", "#f3bb3c", "#d0a84c", "#12182a", "#63c9ff", label="Command navy"),
    "engineer": cw("#f08c1e", "#2f2e3e", "#3f78ff", "#aeb2bd", "#1c1b25", "#46d6ff", label="Engineering orange"),
    "medic": cw("#eceff5", "#bcc4d3", "#e0253e", "#a3abbd", "#252633", "#55d2ff", label="Medical white"),
    "pilot": cw("#e6eaf2", "#2b4cb0", "#f08a24", "#a2abbe", "#1a1f33", "#58d0ff", label="Flight white"),
    "security": cw("#2e4394", "#1a2138", "#f2c14a", "#a0aabf", "#121626", "#4fb6ff", label="Security blue"),
    "marine": cw("#bd253c", "#2c2732", "#e8e4ea", "#949aa8", "#16131a", "#ff4d5e", label="Marine red"),
    "salvage": cw("#ec9c22", "#302e35", "#f5d24a", "#a3a7af", "#1a1a1e", "#ffc24a", label="Salvage hazard"),
    "recon": cw("#5a6e3e", "#2b3125", "#93a462", "#838c7d", "#141812", "#6cff5a", label="Recon green"),
    "scientist": cw("#f0f2f7", "#5e4c9e", "#9a6cff", "#adb2c0", "#2c2842", "#b58cff", label="Laboratory white"),
    "mechanic": cw("#2b3663", "#1c2035", "#f08a24", "#a7acb8", "#12141f", "#ffa04a", label="Mechanic navy"),
    "civilian": cw("#8e7159", "#3f4c5f", "#d8b36a", "#9fa5ad", "#1e2027", "#7fd0ff", label="Civilian"),
}
SHEET_COLOURWAYS = ["arctic", "crimson", "cobalt", "amber", "moss", "shadow"]

# ============================================================================================ PRESETS
# headPreset ids name CHAR-HEADS looks (coordinated on Agent Mail thread "characters"); they
# are intents until CHAR-HEADS publishes its catalog.
PRESETS = [
    {"id": "role.captain", "undersuit": {"suit_primary": "#243258", "suit_secondary": "#141b30"}, "name": "Captain", "colourway": "captain", "headPreset": "head.captain-cap",
     "parts": {"chest": "armor.chest.coat", "shoulders": "armor.shoulders.epaulette", "gloves": "armor.gloves.fabric",
               "belt": "armor.belt.sash", "boots": "armor.boots.dress"}},
    {"id": "role.engineer", "undersuit": {"suit_primary": "#3b3a4c", "suit_secondary": "#26252f"}, "name": "Engineer", "colourway": "engineer", "headPreset": "head.engineer-helmet",
     "parts": {"chest": "armor.chest.harness", "shoulders": "armor.shoulders.light", "gloves": "armor.gloves.work",
               "belt": "armor.belt.tool", "legs": "armor.legs.light", "boots": "armor.boots.light",
               "back": "armor.back.toolpack"}},
    {"id": "role.medic", "undersuit": {"suit_primary": "#d9dde6", "suit_secondary": "#9aa2b4"}, "name": "Medic", "colourway": "medic", "headPreset": "head.medic-helmet",
     "parts": {"chest": "armor.chest.medic", "shoulders": "armor.shoulders.standard", "gloves": "armor.gloves.light",
               "belt": "armor.belt.medic", "legs": "armor.legs.light", "boots": "armor.boots.standard",
               "back": "armor.back.medpack"}},
    {"id": "role.pilot", "undersuit": {"suit_primary": "#d8dde8", "suit_secondary": "#2b4cb0"}, "name": "Pilot", "colourway": "pilot", "headPreset": "head.pilot-helmet",
     "parts": {"chest": "armor.chest.flight", "shoulders": "armor.shoulders.flight", "gloves": "armor.gloves.light",
               "belt": "armor.belt.utility", "legs": "armor.legs.light", "boots": "armor.boots.flight",
               "back": "armor.back.oxygen-single"}},
    {"id": "role.security", "undersuit": {"suit_primary": "#26356e", "suit_secondary": "#161c33"}, "name": "Security officer", "colourway": "security", "headPreset": "head.security-cap",
     "parts": {"chest": "armor.chest.vest", "shoulders": "armor.shoulders.standard", "gloves": "armor.gloves.standard",
               "belt": "armor.belt.holster", "legs": "armor.legs.standard", "boots": "armor.boots.standard",
               "back": "armor.back.backpack-t1"}},
    {"id": "role.marine", "undersuit": {"suit_primary": "#3a3440", "suit_secondary": "#221e27"}, "name": "Heavy marine", "colourway": "marine", "headPreset": "head.marine-helmet",
     "parts": {"chest": "armor.chest.heavy", "shoulders": "armor.shoulders.heavy", "gloves": "armor.gloves.heavy",
               "belt": "armor.belt.heavy", "legs": "armor.legs.heavy", "boots": "armor.boots.heavy",
               "back": "armor.back.backpack-t3"}},
    {"id": "role.salvage", "undersuit": {"suit_primary": "#4a4652", "suit_secondary": "#2a2830"}, "name": "Salvage tech", "colourway": "salvage", "headPreset": "head.salvage-helmet",
     "parts": {"chest": "armor.chest.hazard", "shoulders": "armor.shoulders.standard", "gloves": "armor.gloves.work",
               "belt": "armor.belt.tool", "legs": "armor.legs.standard", "boots": "armor.boots.standard",
               "back": "armor.back.oxygen-twin"}},
    {"id": "role.recon", "undersuit": {"suit_primary": "#3f4a35", "suit_secondary": "#262c21"}, "name": "Recon scout", "colourway": "recon", "headPreset": "head.recon-goggles",
     "parts": {"chest": "armor.chest.tactical", "shoulders": "armor.shoulders.light", "gloves": "armor.gloves.light",
               "belt": "armor.belt.utility", "legs": "armor.legs.light", "boots": "armor.boots.light",
               "back": "armor.back.radio"}},
    {"id": "role.scientist", "undersuit": {"suit_primary": "#6d5aa8", "suit_secondary": "#3a3060"}, "name": "Scientist", "colourway": "scientist", "headPreset": "head.scientist-hair",
     "parts": {"chest": "armor.chest.labcoat", "gloves": "armor.gloves.fabric", "belt": "armor.belt.plain",
               "boots": "armor.boots.sneaker", "back": "armor.back.backpack-t0"}},
    {"id": "role.mechanic", "undersuit": {"suit_primary": "#303a66", "suit_secondary": "#1c2138"}, "name": "Mechanic", "colourway": "mechanic", "headPreset": "head.mechanic-cap",
     "parts": {"chest": "armor.chest.overalls", "shoulders": "armor.shoulders.cloth", "gloves": "armor.gloves.work",
               "belt": "armor.belt.tool", "legs": "armor.legs.cargo", "boots": "armor.boots.light",
               "back": "armor.back.toolpack"}},
    # stretch archetypes
    {"id": "role.civilian", "undersuit": {"suit_primary": "#4c5a70", "suit_secondary": "#2e3442"}, "name": "Civilian", "colourway": "civilian", "headPreset": "head.civilian-hair",
     "parts": {"chest": "armor.chest.jacket", "belt": "armor.belt.plain", "legs": "armor.legs.cargo",
               "boots": "armor.boots.sneaker"}},
    {"id": "role.jet-trooper", "undersuit": {"suit_primary": "#2a3550", "suit_secondary": "#161c2c"}, "name": "Jet trooper", "colourway": "cobalt", "headPreset": "head.closed-helmet",
     "parts": {"chest": "armor.chest.plate", "shoulders": "armor.shoulders.standard", "gloves": "armor.gloves.standard",
               "belt": "armor.belt.standard", "legs": "armor.legs.standard", "boots": "armor.boots.heavy",
               "back": "armor.back.jetpack-heavy"}},
]
ROSTER_ROLES = [p["id"] for p in PRESETS[:10]]

# Existing live r008 component ids keep their inventory identity; this maps each owned legacy item
# to its new voxel visual (presentation only; never ownership, stats or authority).
LEGACY_ROLE_MAP = {"captain": "role.captain", "engineer": "role.engineer", "medic": "role.medic", "pilot": "role.pilot",
                   "security": "role.security", "marine": "role.marine", "salvage": "role.salvage", "recon": "role.recon",
                   "scientist": "role.scientist", "mechanic": "role.mechanic"}


def legacy_visual_map():
    by_id = {p["id"]: p for p in PRESETS}
    out = {}
    for legacy, role in LEGACY_ROLE_MAP.items():
        pr = by_id[role]
        for slot in EQUIPMENT_SLOTS:
            if slot in pr["parts"]:
                out[f"{legacy}-{slot}"] = {"part": pr["parts"][slot], "colourway": pr["colourway"]}
    return out


def validate(parts):
    """Structural checks shared by the unit test and the exporter."""
    ids = [p.id for p in parts]
    assert len(ids) == len(set(ids)), "duplicate part ids"
    for p in parts:
        assert set(p.hides) <= set(BODY_REGIONS), (p.id, p.hides)
    for p in parts:
        assert p.slot in EQUIPMENT_SLOTS and p.tier in TIERS, p.id
        assert set(p.fits) in ({"all"}, set(FITS)), (p.id, list(p.fits))
        for fit, vols in p.fits.items():
            assert vols, (p.id, fit)
            for bone, v in vols.items():
                assert bone in RIG_BONES, (p.id, bone)
                assert v.c, (p.id, fit, bone)
                for k, s in v.c.items():
                    assert all(isinstance(i, int) for i in k), (p.id, bone, k)
                    assert s in SI and s not in ("skin", "hair", "eye"), (p.id, bone, s)
            # paired bones are exact mirrors
            for bone, v in vols.items():
                if bone.endswith(".R"):
                    other = vols.get(bone[:-2] + ".L")
                    assert other is not None and other.c == v.mirrored().c, (p.id, bone)
    by_id = set(ids)
    for pr in PRESETS:
        assert pr["colourway"] in COLOURWAYS, pr["id"]
        for slot, pid in pr["parts"].items():
            assert pid in by_id and pid.split(".")[1] == slot, (pr["id"], slot, pid)
    return True
