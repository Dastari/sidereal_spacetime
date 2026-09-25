"""Crew voxel armour kit v1 (armor-v1): pure part definitions, no bpy, unit-testable.

Every armour/equipment part is a set of voxel volumes on the 1/32 m character grid: one volume
per crew_rig bone, rigidly skinned to that bone (weight 1.0). The volumes are authored in the
CHAR-BODY r001 rest-pose armature frame (CHARACTER_SPEC_BODY.json):
    x = character right (+X is .R), y = forward (the character faces +Y), z = up,
    origin = feet centre on the ground, cell (x, y, z) spans [x, x+1) * 1/32 m.
Right-side parts are authored at +x and mirrored to .L with x -> -1 - x (as the body does).

Fit rules (checked by crew_armor_kit.py against the real body volumes):
- armour never shares a same-normal coplanar face with the body (no z-fighting). It either
  encloses the body cells it covers (at least 1 voxel proud) or it sits clear of them;
- torso armour stays clear of the upper-arm swing (arms at x = 8..12, deltoid from x = 7);
- joints keep a 1-voxel break between parts on different bones.

Colour and role live only in the ten shared material slots (skin, hair, eye, suit_primary,
suit_secondary, accent, metal, dark, emit, glass): colourways, role looks and player colours are
slot tables. Geometry is shared.

Style lineage: scripts/art_library/ship_kit_prototype.py (docs/shipyard-player-builder-design, PR #25)
boxes/slots/themes/bevel, via CHAR-BODY's voxkit Vol/mesh_volume contract.
"""
from __future__ import annotations

from dataclasses import dataclass, field

KIT_ID = "crew.armor-v1"
REVISION = "r001"
V = 1.0 / 32.0
SLOTS = ["skin", "hair", "eye", "suit_primary", "suit_secondary", "accent", "metal", "dark", "emit", "glass"]
SI = {s: i for i, s in enumerate(SLOTS)}
EQUIPMENT_SLOTS = ["chest", "shoulders", "gloves", "belt", "legs", "boots", "back"]
TIERS = {0: "civilian", 1: "light", 2: "standard", 3: "heavy"}
RIG_BONES = ["root", "pelvis", "spine", "chest", "neck", "head",
             "shoulder.R", "shoulder.L", "upper_arm.R", "upper_arm.L", "forearm.R", "forearm.L",
             "hand.R", "hand.L", "thigh.R", "thigh.L", "shin.R", "shin.L", "foot.R", "foot.L", "toe.R", "toe.L"]
# Torso fits: CHAR-BODY variants differ only in chest / waist half-width.
FITS = {"wide": {"chest": 7, "waist": 6, "variants": ["male", "neutral"]},
        "narrow": {"chest": 6, "waist": 5, "variants": ["female"]}}
P, S2, AC, M, D, EM, GL = "suit_primary", "suit_secondary", "accent", "metal", "dark", "emit", "glass"


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

    def shell_paint(self, slot, normal, depth=1):
        """Paint the outermost `depth` cells seen along `normal` (e.g. (0, 1, 0) = front)."""
        axis = [i for i in range(3) if normal[i]][0]
        sgn = normal[axis]
        best = {}
        for k in self.c:
            key = tuple(k[i] for i in range(3) if i != axis)
            v = k[axis] * sgn
            if key not in best or v > best[key]:
                best[key] = v
        for k in list(self.c):
            key = tuple(k[i] for i in range(3) if i != axis)
            if best[key] - k[axis] * sgn < depth:
                self.c[k] = slot
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

    def bones(self):
        return sorted({b for vols in self.fits.values() for b in vols}, key=RIG_BONES.index)

    def voxels(self, fit=None):
        fit = fit or next(iter(self.fits))
        return sum(len(v.c) for v in self.fits[fit].values())

    def slots_used(self):
        return sorted({s for vols in self.fits.values() for v in vols.values() for s in v.c.values()}, key=SI.get)

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


def per_fit(builder, *args):
    return {name: builder(f["chest"], f["waist"], *args) for name, f in FITS.items()}


# ============================================================================================= CHEST
# Body (male/wide): chest x -7..7, y -5 (back plate) .. 6 (front details), z 34..42, collar ring
# x/y -4..4 z 41..43; spine x -6..6, y -3..5, z 29..35; deltoid x 7..13, y -3..3, z 38..42.
def torso_shell(c, w, tier, base_slot):
    """Chest + spine shells that enclose the body torso (>= 1 voxel proud)."""
    ch, sp = Vol(), Vol()
    fy = 7 + (tier >= 3)                  # front face
    by = -6                               # back face (packs mount behind y = -7)
    A = c + 1                             # side face (clear of the upper arm at x = 8)
    ch.box(-A, by, 34, A, fy, 42, base_slot)
    if A > 7:                             # notch for the deltoid swing (wide fit); ends inside the body
        ch.cut(6, -4, 37, A, 4, 41).cut(-A, -4, 37, -6, 4, 41)
    ch.chamfer_z(-A, by, A, fy, 34, 42)
    ch.cut(c - 2, -4, 40, A, 4, 42).cut(-A, -4, 40, -c + 2, 4, 42)   # room for the pauldron top row
    ch.cut(-5, -4, 40, 5, 5, 42)          # neck well: its floor sits inside the body's chest
    ch.box(-A + 1, by + 1, 42, A - 1, fy - 1, 43, S2).cut(-5, -4, 42, 5, 5, 43)    # yoke ring
    sp.box(-w - 1, -4, 30, w + 1, fy - 1, 34, base_slot)
    sp.chamfer_z(-w - 1, -4, w + 1, fy - 1, 30, 34)
    return ch, sp, fy, by, A


def chest_vols(c, w, tier, style):
    base_slot = S2 if style == "overalls" else P
    ch, sp, fy, by, A = torso_shell(c, w, tier, base_slot)
    vols = {"chest": ch, "spine": sp}
    if style in ("jacket", "coat", "labcoat", "flight", "overalls"):
        if style == "overalls":
            ch.paint(-A, by, 34, A, fy, 42, D)                         # undershirt under the bib
            ch.paint(-A, by, 34, A, fy, 42, S2)
            ch.box(-4, fy, 34, 4, fy + 1, 40, P)                        # bib
            ch.box(-3, fy + 1, 36, 3, fy + 2, 39, D).paint(-2, fy + 1, 38, 2, fy + 2, 39, P)   # bib pocket
            for x0 in (-6, 5):                                          # braces over the shoulders
                ch.paint(x0, by, 34, x0 + 1, fy, 43, P)
                ch.box(x0, fy, 38, x0 + 1, fy + 1, 39, M)                 # brace buckle
            sp.paint(-w - 1, -4, 30, w + 1, fy - 1, 34, P)
            sp.box(-3, fy - 1, 30, 3, fy, 33, D).paint(-2, fy - 1, 31, 2, fy, 32, M)
            return vols
        # open-front garments: centre placket, lapels, pockets, hems
        ch.paint(-1, fy - 1, 34, 1, fy, 42, D if style != "flight" else S2)
        sp.paint(-1, fy - 2, 30, 1, fy - 1, 34, D if style != "flight" else S2)
        sp.paint(-w - 1, -4, 30, w + 1, fy, 31, S2)                     # hem band
        if style in ("jacket", "coat", "labcoat"):
            lap = AC if style == "coat" else S2
            for k in range(4):                                          # stepped V lapels
                ch.paint(-2 - k, fy - 1, 41 - k * 1, 2 + k, fy, 42 - k * 1, lap)
                ch.paint(-1 - k, fy - 1, 41 - k * 1, 1 + k, fy, 42 - k * 1, D if style != "labcoat" else S2)
            ch.box(-A + 1, by, 42, A - 1, by + 2, 44, lap).cut(-4, by + 1, 42, 4, by + 2, 44)   # raised back collar
        if style == "jacket":
            ch.box(-A + 2, fy, 36, -2, fy + 1, 39, S2).paint(-A + 2, fy, 38, -2, fy + 1, 39, AC)   # chest pocket + flap
            sp.box(-w, fy - 1, 30, -2, fy, 33, S2).box(2, fy - 1, 30, w, fy, 33, S2)                   # hand pockets
            ch.box(3, fy, 38, 5, fy + 1, 39, AC).box(5, fy, 38, 6, fy + 1, 39, EM)                    # name badge + light
            ch.paint(-A, by, 40, A, fy, 41, S2)                                                       # shoulder seam
            for z in (35, 37, 39):
                ch.box(-1, fy, z, 1, fy + 1, z + 1, M)                                                # zip teeth
        if style == "coat":
            for z in (35, 37, 39):                                      # double-breasted buttons
                ch.box(-4, fy, z, -3, fy + 1, z + 1, M).box(3, fy, z, 4, fy + 1, z + 1, M)
            sp.box(-4, fy - 1, 31, -3, fy, 32, M).box(3, fy - 1, 31, 4, fy, 32, M)
            ch.box(3, fy, 40, 6, fy + 1, 41, AC).box(3, fy, 39, 4, fy + 1, 40, EM)      # rank bar + pin
            ch.paint(-A, by, 34, A, by + 1, 42, S2)                     # back seam
            ch.box(-A, fy - 2, 35, -A + 1, fy, 41, AC)                  # braided trim at the front edge
            ch.box(A - 1, fy - 2, 35, A, fy, 41, AC)
            sp.paint(-w - 1, -4, 33, w + 1, fy, 34, AC)                 # waist band trim
        if style == "labcoat":
            ch.box(-A + 1, fy, 35, -3, fy + 1, 38, S2)                  # breast pocket
            ch.box(-A + 2, fy + 1, 37, -A + 3, fy + 2, 40, AC)          # pens
            ch.box(-A + 4, fy + 1, 37, -A + 5, fy + 2, 39, EM)
            ch.box(3, fy, 39, 6, fy + 1, 41, EM)                        # ID badge (glowing)
            sp.box(-w - 1, fy - 1, 30, -2, fy, 32, S2).box(2, fy - 1, 29, w + 1, fy, 32, S2)
        if style == "flight":
            ch.paint(-A, by, 38, A, fy, 39, AC)                         # chest stripe
            ch.box(-A + 1, fy, 37, -2, fy + 1, 40, S2).box(-A + 2, fy + 1, 38, -A + 3, fy + 2, 39, EM)  # comms unit
            for x0 in (-4, 3):                                          # harness straps
                ch.box(x0, fy, 34, x0 + 1, fy + 1, 42, D)
                sp.box(x0, fy - 1, 30, x0 + 1, fy, 34, D)
            sp.box(-2, fy - 1, 30, 2, fy + 1, 33, M).box(-1, fy + 1, 31, 1, fy + 2, 32, EM)       # quick-release
            ch.box(A - 3, fy, 40, A - 1, fy + 1, 41, AC)                # wings pin
        return vols

    # ---- plated / rigged looks: soft base + raised plates, straps, pouches, lights
    ft = 1 if tier < 3 else 2
    if tier >= 2 or style in ("medic", "vest", "hazard"):
        # front chest plates: split pair with a dark centre seam
        ch.box(-c, fy, 35, c, fy + ft, 41, P).chamfer_z(-c, fy, c, fy + ft, 35, 41)
        ch.paint(-1, fy, 35, 1, fy + ft, 41, D)
        ch.box(-c + 1, by - 1, 35, c - 1, by, 39, P)                    # back plate (below the pack harness)
        ch.paint(-1, by - 1, 36, 1, by, 39, M)                          # back mount spine
        ch.paint(-A, -4, 36, A, 4, 37, D)                               # side panel seam
        for k, z in enumerate(range(30, 34, 2)):                        # abdomen plates
            sp.box(-w, fy - 1, z, w, fy, z + 2, P if k % 2 == 0 else S2).paint(-w, fy - 1, z + 1, w, fy, z + 2, D)
        sp.paint(-w - 1, -4, 30, w + 1, -3, 34, P)                     # lower back plate
    if tier >= 1:
        ch.box(c - 3, fy + ft, 38, c - 1, fy + ft + 1, 40, EM if tier >= 2 else AC)   # status light
    if tier >= 2:
        ch.box(-c + 1, fy + ft, 39, -c + 3, fy + ft + 1, 40, M)          # bolt pair
        ch.box(-A, by, 35, -A + 1, by + 2, 41, M).box(A - 1, by, 35, A, by + 2, 41, M)   # back rails
    if tier >= 3:
        ch.box(-c - 1, fy + ft - 1, 36, -c + 1, fy + ft + 1, 42, S2)    # bolted flanks
        ch.box(c - 1, fy + ft - 1, 36, c + 1, fy + ft + 1, 42, S2)
        ch.box(-3, fy + ft, 35, 3, fy + ft + 1, 37, AC).box(-1, fy + ft + 1, 35, 1, fy + ft + 2, 37, EM)  # reactor core
        ch.box(-A + 2, by, 42, A - 2, by + 2, 45, S2).cut(-4, by + 1, 42, 4, by + 2, 45)               # rear gorget
        sp.box(-w, fy - 1, 30, w, fy + 1, 32, P).paint(-w, fy, 30, w, fy + 1, 31, AC)                 # lower abdomen plate
    if style in ("harness", "tactical"):
        for x0 in (-4, 3):                                              # webbing straps front + back
            ch.box(x0, fy, 34, x0 + 1, fy + 1, 42, D)
            ch.box(x0, by - 1, 34, x0 + 1, by, 42, D)
            sp.box(x0, fy - 1, 30, x0 + 1, fy, 34, D)
        ch.box(-A, fy, 37, A, fy + 1, 38, D)                           # chest strap
        ch.box(-1, fy + 1, 37, 1, fy + 2, 38, M)                        # buckle
        sp.box(-w, fy - 1, 30, -1, fy + 1, 33, S2).paint(-w, fy, 32, -1, fy + 1, 33, D)   # belly pouches
        sp.box(1, fy - 1, 30, w, fy + 1, 33, S2).paint(1, fy, 32, w, fy + 1, 33, D)
        if style == "tactical":
            for x0 in (-A + 1, -2, A - 4):                              # magazine pouches
                ch.box(x0, fy + 1, 34, x0 + 3, fy + 3, 37, S2).paint(x0, fy + 2, 36, x0 + 3, fy + 3, 37, D)
            ch.box(A - 3, fy + 1, 39, A - 1, fy + 2, 41, EM)            # IR strobe
            ch.box(-A + 1, fy + 1, 39, -A + 3, fy + 2, 41, AC)          # radio
    if style == "medic":
        ch.paint(-c, fy, 40, c, fy + ft, 41, AC)                        # red band
        ch.box(-c + 1, fy + ft, 37, -c + 4, fy + ft + 1, 38, AC)        # cross
        ch.box(-c + 2, fy + ft, 36, -c + 3, fy + ft + 1, 39, AC)
        ch.paint(-A, by, 38, A, fy, 39, AC)                             # side stripe
        sp.box(-w, fy, 30, w, fy + 1, 31, AC)
    if style == "vest":
        ch.box(-c + 1, fy + ft, 38, -c + 3, fy + ft + 1, 40, AC).box(-c + 1, fy + ft + 1, 39, -c + 2, fy + ft + 2, 40, M)  # badge
        ch.box(-A, fy - 1, 35, A, fy + ft, 36, AC)                      # hi-vis stripe
        sp.box(-w, fy, 32, w, fy + 1, 33, AC)
        ch.box(2, fy + ft, 36, 5, fy + ft + 1, 38, D)                   # cuffs pouch
    if style == "hazard":
        for x in range(-w, w, 2):                                       # hazard chevrons at the hem
            sp.box(x, fy - 1, 30, x + 1, fy + 1, 31, AC)
        ch.paint(-c, fy, 40, c, fy + ft, 41, AC)
        ch.box(-2, fy + ft, 37, 2, fy + ft + 1, 39, D).box(-1, fy + ft + 1, 37, 1, fy + ft + 2, 39, EM)  # gauge
    return vols


def coat_tails(c, w, style):
    """Coat skirts: a hip hub (pelvis) and front/back tails per thigh, so the skirt swings with the legs.
    Above z = 19 the tails leave the outer thigh open: the hanging hand sits there (x >= 7)."""
    hub = Vol().box(-8, -5, 25, 8, 7, 26, P).box(-8, 5, 24, 8, 7, 25, P).box(-8, -5, 24, 8, -3, 25, P)
    hub.paint(-8, -5, 25, 8, 7, 26, AC if style == "coat" else S2)
    drop = 15 if style == "coat" else 14                     # coat to above the knee, lab coat to the knee
    trim = AC if style == "coat" else S2
    tail = Vol()
    tail.box(0, 3, drop, 7, 4, 24, P).box(0, -4, drop, 7, -3, 24, P)          # front + back panels
    tail.box(0, -4, drop, 1, 4, 24, P)                                        # inner edge
    tail.box(7, -4, drop, 9, 4, 19, P)                                        # outer wrap below the hand
    tail.paint(0, -4, drop, 9, 4, drop + 1, trim)                              # hem
    tail.paint(8, -4, drop, 9, 4, 19, S2)                                     # side seam
    if style == "labcoat":
        tail.box(9, -2, 15, 10, 2, 19, S2).paint(9, -2, 18, 10, 2, 19, AC)   # side pocket
    else:
        tail.box(0, 4, drop + 2, 1, 5, 23, trim)                              # front braid
    return {"pelvis": hub, **sided({"thigh.R": tail})}


# ========================================================================================= SHOULDERS
# Body deltoid (upper_arm.R): x 7..13, y -3..3, z 38..42; upper arm x 8..12, y -2..2, z 32..40.
def shoulder_vols(tier, style):
    ua = Vol()
    if style == "cloth":
        ua.box(9, -4, 37, 14, 4, 41, S2).chamfer_outer(14, -4, 4, 37, 41)
        ua.box(8, -4, 41, 14, 4, 42, S2).box(6, -4, 41, 8, 4, 42, S2).box(7, -3, 42, 13, 3, 43, S2)
        ua.box(14, -1, 38, 15, 1, 40, D)                                      # sleeve tab
    elif style == "epaulette":
        ua.box(9, -4, 37, 14, 4, 41, P).box(8, -4, 41, 14, 4, 42, P).box(6, -4, 41, 8, 4, 42, P)
        ua.box(7, -4, 42, 14, 4, 43, AC)                                      # gold board
        for y in range(-4, 4, 2):                                             # fringe
            ua.box(14, y, 38, 15, y + 1, 43, AC)
        ua.box(9, -1, 43, 11, 1, 44, M)                                       # rank pip
    else:
        g = {1: 0, 2: 1, 3: 2}[tier]
        x1, y0, y1 = 14 + g, -4 - g, 4 + g
        low = 37
        # Cap from x = 9 (inside the deltoid/arm) down past the deltoid's underside, a top row that
        # wraps the deltoid's top corners (reaching x = 6 only inside the chest-armour notch), crown.
        ua.box(9, y0, low, x1, y1, 41, P).chamfer_outer(x1, y0, y1, low, 41)
        ua.box(8, y0, 41, x1, y1, 42, P).box(6, -4, 41, 8, 4, 42, P)
        ua.box(7, y0 + 1, 42, x1 - 1, y1 - 1, 43 + (tier >= 2), P)           # crown
        ua.paint(8, y0, 41, x1, y1, 42, S2 if tier >= 2 else P)               # crown seam
        if tier >= 2:
            ua.paint(7, y0 + 1, 43, x1 - 1, y1 - 1, 44, S2)
            ua.box(9, y0 + 2, 44, x1 - 2, y1 - 2, 45, S2)                    # rounded top step
        ua.box(9, y0 - (tier >= 3), low - 1, x1 + 1, y1 + (tier >= 3), low, S2)   # rim
        ua.box(x1, -1, low + 1, x1 + 1, 1, low + 2, EM)                       # side light
        if tier >= 2:
            ua.box(x1, y0 + 1, 39, x1 + 1, y1 - 1, 40, AC)                    # raised stripe
            ua.box(x1, y0 + 1, 41, x1 + 1, y0 + 2, 42, M).box(x1, y1 - 2, 41, x1 + 1, y1 - 1, 42, M)   # bolts
        if tier >= 3:
            ua.box(x1, y0 + 1, low, x1 + 1, y1 - 1, 39, P).paint(x1, y0 + 1, low + 1, x1 + 1, y1 - 1, low + 2, D)  # outer lame
            ua.box(x1 - 3, y0, 45, x1, y1, 46, S2)                           # ridge
            for y in (y0 + 1, y1 - 2):
                ua.box(x1 + 1, y, low + 1, x1 + 2, y + 1, low + 2, M)         # rivets
        if style == "flight":
            ua.box(x1, -2, low + 2, x1 + 1, 2, 41, AC).box(x1 + 1, -1, low + 3, x1 + 2, 1, 40, EM)   # mission patch
    return sided({"upper_arm.R": ua})


# ============================================================================================ GLOVES
# Body hand.R: x 8..12, y -2..2 (+thumb y 2..3), z 20..24; forearm cuff x 7..13, y -3..3, z 24..27.
def glove_vols(tier, style):
    """The hand hangs beside the hip, so glove and bracer never extend inward past x = 7."""
    hd, fa = Vol(), Vol()
    palm = S2 if tier < 2 else D
    hd.box(7, -3, 21, 13, 4, 24, palm)                                        # palm + knuckles
    for k, y in enumerate(range(-3, 3)):                                      # fingers (brick columns)
        hd.box(7, y, 19, 13 if k % 2 == 0 else 12, y + 1, 21, palm)
    hd.box(8, 3, 20, 11, 5, 23, palm)                                         # thumb, forward/inward
    hd.box(8, -2, 24, 12, 2, 25, palm)                                        # wrist plug (inside the cuff)
    hd.box(13, -2, 21, 14, 3, 24, P)                                          # back-of-hand plate
    hd.paint(7, -3, 23, 13, 4, 24, P if tier else S2)                         # glove band
    if tier >= 1:
        hd.box(13, -3, 20, 14, 4, 21, M)                                      # knuckle bar
        hd.box(14, 0, 22, 15, 2, 23, EM if tier >= 2 else AC)
    if tier >= 3:
        hd.box(13, -3, 19, 14, 4, 20, M)                                      # finger guard
        hd.box(8, 5, 21, 12, 6, 24, P)                                        # knuckle guard (front)
    if tier >= 1 or style == "work":
        cu = {0: 3, 1: 3, 2: 4, 3: 4}[tier]
        top = 27 + cu
        # bracer on the forearm, sitting on the body cuff (z 27) and enclosing the forearm 1 proud
        fa.box(7, -3, 27, 13, 3, top, P if tier >= 2 else S2).chamfer_z(7, -3, 13, 3, 27, top)
        fa.paint(7, -3, top - 1, 13, 3, top, AC)                              # top trim
        if tier >= 2:
            fa.box(13, -2, 28, 14, 2, top - 1, S2).box(13, -1, 28, 14, 1, 29, EM)   # wrist display
        if tier >= 3:
            fa.box(8, 3, 28, 13, 4, top, P)                                   # outer guard (front)
            fa.box(8, -4, 28, 13, -3, top, P)
        if style == "work":
            fa.box(7, -4, top - 2, 14, 4, top, D).paint(7, -4, top - 1, 14, 4, top, AC)   # flared gauntlet
    return sided({"hand.R": hd, **({"forearm.R": fa} if fa.c else {})})


# ============================================================================================= BOOTS
# Body foot.R: x 1..7, y -4..4, z 0..4; toe.R: x 1..7, y 4..8, z 0..3; shin.R boot base x 1..7,
# y -3..3, z 3..7 with a cuff x 0..8, y -3..4, z 6..7 (left visible as the boot strap); knee pad
# x 2..6, y 3..4, z 10..14. The legs touch at x = 0, so nothing crosses the midline.
def boot_vols(tier, style):
    ft, to, sh = Vol(), Vol(), Vol()
    sole = 1 + (tier >= 2)
    ft.box(0, -5, 0, 8, 4, 3, P).paint(0, -5, 0, 8, 4, sole, D)               # shoe body + sole (foot bone)
    ft.cut(0, -5, sole, 1, -4, 3).cut(7, -5, sole, 8, -4, 3)                  # rounded heel
    ft.paint(1, -5, sole, 7, -4, 3, S2)                                       # heel counter
    to.box(0, 4, 0, 8, 9, 4, P).paint(0, 4, 0, 8, 9, sole, D)                 # toe box (toe bone)
    to.cut(0, 8, sole, 1, 9, 4).cut(7, 8, sole, 8, 9, 4)                      # rounded toe
    to.paint(1, 8, sole, 7, 9, 4, S2)                                         # toe cap
    sh.box(0, -5, 3, 8, 5, 6, P).chamfer_z(0, -5, 8, 5, 3, 6)                 # ankle collar (shin bone)
    sh.paint(0, -5, 5, 8, 5, 6, S2)
    sh.box(2, 5, 3, 6, 6, 6, D)                                               # tongue / instep
    if style == "sneaker":
        ft.paint(0, -5, sole, 8, 4, sole + 1, AC)                             # sole stripe
        to.paint(0, 4, sole, 8, 9, sole + 1, AC)
        to.paint(2, 5, 3, 6, 8, 4, S2)                                        # laces
        return sided({"foot.R": ft, "toe.R": to, "shin.R": sh})
    up = {0: 2, 1: 2, 2: 3, 3: 3}[tier] + (2 if style == "dress" else 0)
    top = 7 + up
    sh.box(0, -4, 7, 8, 5, top, P).chamfer_z(0, -4, 8, 5, 7, top)             # upper shaft above the strap
    sh.paint(0, -4, top - 1, 8, 5, top, S2 if style != "dress" else AC)       # cuff rim
    if style != "dress":
        for z in range(7, top - 1, 2):
            sh.paint(2, 4, z, 6, 5, z + 1, D)                                 # laces
        to.paint(2, 5, 3, 6, 8, 4, D)
    if tier >= 2:
        sh.box(8, -1, 4, 9, 1, 5, EM)                                         # ankle light
        to.box(1, 9, 0, 7, 10, sole + 1, M)                                   # toe guard
        sh.box(8, -2, 7, 9, 2, top - 1, S2)                                   # outer ankle plate
    if tier >= 3:
        ft.paint(0, -5, 0, 8, 4, 1, M)                                        # mag sole plate
        to.paint(0, 4, 0, 8, 9, 1, M)
        sh.box(8, -1, 8, 9, 1, 9, EM)
        sh.paint(0, -5, 3, 8, -4, 5, M)                                        # heel spur plate
    if style == "flight":
        sh.paint(0, -4, 7, 8, 5, 8, AC)
        sh.box(8, -2, 7, 9, 2, 9, AC)
    if style == "dress":
        sh.box(1, 5, top - 2, 7, 6, top - 1, M)                               # buckle strap
    return sided({"foot.R": ft, "toe.R": to, "shin.R": sh})


# ============================================================================================== LEGS
# Body thigh.R: x 1..7, y -3..3, z 13..25, pocket x 7..8 y -2..2 z 16..21; shin x 1..7, y -3..3.
# The hanging hand/glove occupies x >= 7, y -3..5, z >= 19: leg armour stays out of that zone.
def legs_vols(tier, style):
    th, sh = Vol(), Vol()
    if tier == 0:
        th.box(8, -3, 14, 9, 3, 19, S2).paint(8, -3, 18, 9, 3, 19, D)         # cargo pocket (under the hand)
        th.box(9, -1, 16, 10, 1, 17, M)                                       # snap
        th.box(2, 3, 14, 6, 4, 17, S2)                                        # knee patch
        th.box(1, 3, 21, 4, 4, 23, S2)                                        # front pocket
        return sided({"thigh.R": th})
    # knee guard on the upper shin (proud of any boot shaft)
    sh.box(1, 4, 10, 7, 6, 15, P).chamfer_z(1, 4, 7, 6, 10, 15)
    sh.paint(1, 5, 12, 7, 6, 13, S2)
    sh.box(2, 6, 11, 6, 7, 14, S2)                                            # guard boss
    if tier >= 2:
        sh.box(3, 7, 12, 5, 8, 13, EM if tier >= 3 else AC)
        th.box(1, 3, 15, 7, 4, 23, P).paint(1, 3, 19, 7, 4, 20, D)           # thigh front plates
        th.box(8, -3, 14, 9, 4, 19, P).paint(8, -3, 16, 9, 4, 17, D)         # outer plate (below the hand)
        th.box(9, -1, 15, 10, 1, 16, M)
    else:
        for z in (14, 17):
            th.box(0, -4, z, 9, 4, z + 1, D)                                  # thigh straps
        th.box(9, -2, 14, 10, 2, 18, S2).paint(9, -2, 17, 10, 2, 18, AC)     # thigh pouch
        th.box(8, -3, 15, 9, 3, 18, S2)
    if tier >= 3:
        th.box(1, 4, 20, 7, 5, 24, P).paint(1, 4, 20, 7, 5, 21, S2)           # hip lame (front)
        sh.box(2, 7, 13, 6, 8, 15, P)                                         # raised knee crest
        th.box(8, -3, 13, 10, 4, 15, S2).paint(9, -3, 13, 10, 4, 14, D)       # lower outer thigh plate
    vols = sided({"thigh.R": th, "shin.R": sh})
    if tier >= 3:
        pv = Vol()
        for x0, x1 in ((-7, -1), (1, 7)):                                     # front tassets from the belt line
            pv.box(x0, 5, 22, x1, 7, 26, P).paint(x0, 6, 22, x1, 7, 23, S2)
        vols["pelvis"] = pv
    return vols


# ============================================================================================== BELT
# Body pelvis: x -7..7, y -3..5, z 23..29; belt x -7..7, y -4..6, z 27..29 (buckle y 6..7, pouch
# y -5..-4); spine x -6..6 above. The arms hang at x >= 7 for y -4..5, so the band has arm notches
# whose floor stays inside the body (x = 5), and pouches/holsters ride front and back.
def belt_vols(tier, style):
    p = Vol()
    band = AC if style == "sash" else D
    p.box(-8, -6, 26, 8, 8, 30, band).chamfer_z(-8, -6, 8, 8, 26, 30)
    p.cut(5, -4, 26, 8, 5, 29).cut(-8, -4, 26, -5, 5, 29)                     # arm notches (floor inside the body)
    p.cut(5, -4, 29, 8, 5, 30).cut(-8, -4, 29, -5, 5, 30)
    p.cut(4, -3, 29, 5, 5, 30).cut(-5, -3, 29, -4, 5, 30)                     # clear of narrow waists
    p.box(-2, 8, 26, 2, 9, 30, M if style != "sash" else AC)                  # buckle
    p.box(-1, 9, 27, 1, 10, 29, EM if tier >= 1 else M)
    p.paint(-8, -6, 29, 8, 8, 30, S2 if style != "sash" else AC)              # top edge
    if style == "plain":
        p.box(4, 8, 27, 5, 9, 29, S2).box(-5, 8, 27, -4, 9, 29, S2)           # belt loops
        return {"pelvis": p}
    if style == "sash":
        p.box(-7, 8, 29, -4, 9, 33, AC).box(-6, 8, 25, -5, 9, 29, AC)         # sash knot + tail
        p.box(3, 8, 27, 6, 9, 29, M)
        return {"pelvis": p}
    h = 3 if tier < 3 else 4
    fronts = [-7, 4] if tier <= 1 else [-7, -5, 3, 5]
    for x0 in fronts:                                                         # front pouches
        w = 3 if tier <= 1 else 2
        p.box(x0, 8, 30 - h, x0 + w, 10, 30, S2).paint(x0, 9, 29, x0 + w, 10, 30, P)
    for x0 in (4, -8):                                                        # hip pouches (back quarters)
        p.box(x0, -8, 26, x0 + 4, -6, 30, S2).paint(x0, -8, 29, x0 + 4, -6, 30, P)
    p.box(-2, -8, 25, 2, -6, 30, S2).paint(-2, -8, 29, 2, -6, 30, P)          # back pouch
    if style == "tool":
        p.box(8, -7, 18, 9, -6, 29, M).box(8, -8, 18, 9, -5, 20, M)           # wrench behind the hip
        p.box(-9, -7, 19, -8, -6, 28, AC).box(-9, -7, 28, -8, -6, 30, D)      # screwdriver
        p.box(-3, 10, 26, -1, 11, 29, EM)                                     # multimeter light
    if style == "medic":
        p.box(-7, 10, 27, -4, 11, 28, AC).box(-6, 10, 26, -5, 11, 29, AC)     # red cross tab
    if style == "holster" or tier >= 2:
        p.box(8, -8, 18, 11, -5, 27, D).paint(8, -8, 26, 11, -5, 27, M)       # holster behind the arm
    if tier >= 3:
        p.paint(-8, -6, 26, 8, 8, 27, M)                                      # armoured lower edge
        p.box(-7, 10, 27, -3, 11, 29, P).box(3, 10, 27, 7, 11, 29, P)        # armoured pouch lids
    return {"pelvis": p}


# ============================================================================================== BACK
# Pack front face sits at y = -7: behind tier 0-2 chest armour (back face -6), flush on tier 3 (-7),
# and clear of the bare body (back plate -5). Packs ride the chest bone (socket.back).
def back_vols(kind, tier):
    p = Vol()
    b0 = -7
    ex = []
    # harness plate between the pack and the back (hidden inside chest armour, bridges the gap on a bare body)
    straps = lambda: p.box(-3, b0, 39, 3, -5, 42, D).paint(-3, b0, 41, 3, -5, 42, M)   # noqa: E731
    if kind == "backpack":
        depth = {0: 4, 1: 5, 2: 6, 3: 7}[tier]
        W = {0: 5, 1: 6, 2: 6, 3: 7}[tier]
        top = 42 + (tier >= 2)
        bot = {0: 33, 1: 32, 2: 30, 3: 29}[tier]
        p.box(-W, b0 - depth, bot, W, b0, top, P).chamfer_z(-W, b0 - depth, W, b0, bot, top)
        p.box(-W + 1, b0 - depth - 1, bot + 1, W - 1, b0 - depth, top - 2, P)    # outer panel
        p.paint(-W + 1, b0 - depth - 1, bot + 1, W - 1, b0 - depth, bot + 2, D)  # panel frame
        p.paint(-W + 1, b0 - depth - 1, top - 3, W - 1, b0 - depth, top - 2, D)
        p.paint(-W + 1, b0 - depth - 1, bot + 1, -W + 2, b0 - depth, top - 2, D)
        p.paint(W - 2, b0 - depth - 1, bot + 1, W - 1, b0 - depth, top - 2, D)
        p.paint(-W, b0 - depth, top - 1, W, b0, top, S2)                          # lid
        p.paint(-W, b0 - depth, bot, W, b0, bot + 1, S2)                          # base
        p.box(-W + 2, b0 - depth - 2, bot + 2, W - 2, b0 - depth - 1, bot + 5, S2)   # front pocket
        p.paint(-W + 2, b0 - depth - 2, bot + 4, W - 2, b0 - depth - 1, bot + 5, AC)  # pocket flap
        straps()
        if tier >= 1:
            p.box(W, b0 - depth + 1, bot + 1, W + 2, b0 - 1, top - 2, D)           # side bottle
            p.box(-W - 1, b0 - depth + 1, bot + 2, -W, b0 - 1, top - 3, S2)
            p.box(-1, b0 - depth - 1, top - 3, 1, b0 - depth, top - 2, EM)
        if tier >= 2:
            p.box(-W, b0 - depth - 1, bot, W, b0 - depth, bot + 1, M)
            p.box(W - 3, b0 - depth - 2, top - 5, W - 1, b0 - depth - 1, top - 4, EM)
            p.box(-W - 1, b0 - depth, top, W + 1, b0 - 1, top + 2, D).cut(-W + 1, b0 - depth + 1, top, W - 1, b0 - 2, top + 2)  # bedroll frame
        if tier >= 3:
            p.box(-W - 1, b0 - depth - 1, bot - 1, W + 1, b0 - 1, bot, D)
            p.box(-W, b0 - depth - 2, bot + 6, W, b0 - depth - 1, bot + 7, AC)
            p.box(W - 1, b0 - depth + 1, top + 2, W, b0 - depth + 2, top + 9, M)  # antenna
            p.box(W - 1, b0 - depth + 1, top + 9, W, b0 - depth + 2, top + 10, EM)
    elif kind == "oxygen":
        twin = tier >= 2
        centres = [-3, 3] if twin else [0]
        r = 3 if not twin else 2
        for cx in centres:
            x0, x1 = cx - r, cx + r
            yb = b0 - 2 * r
            p.box(x0, yb, 31, x1, b0, 43, S2).chamfer_z(x0, yb, x1, b0, 31, 43)       # tank
            p.box(x0 + 1, yb + 1, 43, x1 - 1, b0 - 1, 45, M)                           # valve
            p.box(cx - 1 + (not twin), yb + 2, 45, cx + 1 - (not twin) + (not twin), b0 - 2, 46, AC)
            p.paint(x0, yb, 34, x1, b0, 35, AC).paint(x0, yb, 40, x1, b0, 41, AC)      # bands
            p.box(cx - 1, yb - 1, 36, cx + 1, yb, 39, EM)                              # gauge window
        p.box(-6, b0 - 1, 32, 6, b0, 42, D) if twin else p.box(-4, b0 - 1, 32, 4, b0, 42, D)   # frame plate
        p.box(-1, b0 - 2 * r - 1, 30, 1, b0 - 1, 31, D)                                # hose manifold
        straps()
    elif kind == "jetpack":
        W = 6 if tier < 3 else 7
        depth = 5 if tier < 3 else 6
        p.box(-W + 2, b0 - depth, 32, W - 2, b0, 43, P).chamfer_z(-W + 2, b0 - depth, W - 2, b0, 32, 43)   # fuel core
        p.box(-W + 3, b0 - depth - 1, 34, W - 3, b0 - depth, 41, S2)
        p.box(-1, b0 - depth - 2, 38, 1, b0 - depth - 1, 40, EM)
        for sx in (-1, 1):                                                              # twin thrusters
            x0 = W - 3 if sx > 0 else -W
            x1 = x0 + 3
            p.box(x0, b0 - depth + 1, 30, x1, b0 - 1, 42, S2).chamfer_z(x0, b0 - depth + 1, x1, b0 - 1, 30, 42)
            p.paint(x0, b0 - depth + 1, 41, x1, b0 - 1, 42, AC)
            p.box(x0, b0 - depth + 1, 27, x1, b0 - 1, 30, M)                            # nozzle bell
            p.box(x0 + 1, b0 - depth + 2, 26, x1 - 1, b0 - 2, 27, EM)                   # hot throat
            ex.append(("chest", ((x0 + x1) / 2, (b0 - depth + 1 + b0 - 1) / 2, 26), 1.5))
        if tier >= 3:
            p.box(-W - 1, b0 - 3, 38, -W, b0 - 1, 44, D).box(W, b0 - 3, 38, W + 1, b0 - 1, 44, D)   # stabiliser fins
            p.box(-2, b0 - depth - 1, 43, 2, b0 - 1, 45, D)
        straps()
    elif kind == "medpack":
        p.box(-6, b0 - 5, 31, 6, b0, 43, AC).chamfer_z(-6, b0 - 5, 6, b0, 31, 43)
        p.box(-5, b0 - 6, 32, 5, b0 - 5, 41, S2)
        p.box(-1, b0 - 7, 33, 1, b0 - 6, 40, AC).box(-3, b0 - 7, 35, 3, b0 - 6, 37, AC)   # cross
        p.paint(-6, b0 - 5, 42, 6, b0, 43, M)
        p.box(4, b0 - 6, 40, 5, b0 - 5, 41, EM)
        straps()
    elif kind == "radio":
        p.box(-5, b0 - 5, 31, 5, b0, 43, P).chamfer_z(-5, b0 - 5, 5, b0, 31, 43)
        p.box(-4, b0 - 6, 33, 4, b0 - 5, 40, D).paint(-3, b0 - 6, 38, -1, b0 - 5, 39, EM)
        p.box(3, b0 - 3, 43, 4, b0 - 2, 57, M).box(3, b0 - 3, 57, 4, b0 - 2, 58, EM)      # whip antenna
        p.box(-4, b0 - 3, 43, -2, b0 - 1, 45, M)                                            # connector
        p.paint(-5, b0 - 5, 36, 5, b0, 37, AC)
        straps()
    elif kind == "toolpack":
        p.box(-6, b0 - 5, 30, 6, b0, 42, P).chamfer_z(-6, b0 - 5, 6, b0, 30, 42)
        p.box(-5, b0 - 6, 31, 5, b0 - 5, 36, D).paint(-5, b0 - 6, 35, 5, b0 - 5, 36, AC)
        p.paint(-6, b0 - 5, 41, 6, b0, 42, S2)
        p.box(6, b0 - 5, 34, 8, b0 - 1, 45, M).box(6, b0 - 4, 45, 8, b0 - 2, 46, AC)          # welding torch rack
        p.box(-8, b0 - 4, 32, -6, b0 - 1, 40, AC).paint(-8, b0 - 4, 35, -6, b0 - 1, 37, D)    # cable reel
        p.box(-2, b0 - 6, 38, 2, b0 - 5, 39, EM)
        straps()
    return {"chest": p}, ex


# ============================================================================================ CATALOG
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
SOCKET = {"chest": "socket.chest", "shoulders": "socket.shoulder", "gloves": "socket.glove", "boots": "socket.foot",
          "legs": None, "belt": "socket.belt", "back": "socket.back"}


def build_catalog():
    parts = []

    def add(pid, slot, tier, style, name, fits, exhaust=()):
        parts.append(Part(pid, slot, tier, style, name, fits, SOCKET[slot], MASS[slot][tier], GRID[slot], list(exhaust)))

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
        add(f"armor.belt.{sfx}", "belt", t, st, name, {"all": belt_vols(t, st)})
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
