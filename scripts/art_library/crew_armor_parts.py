"""Crew voxel armour kit (armor-v1 r003): pure part definitions, no bpy, unit-testable.

Fitted to the owner-approved CHAR-BODY r005 (CHARACTER_SPEC_BODY.json spec_version 2, ~3 heads). Every part is
a set of voxel volumes on the 1/32 m grid, one volume per crew_rig bone, rigidly skinned to that bone.
Authoring frame = CHAR-BODY rest-pose armature voxels: x = character right (+X is .R), y = forward
(the character faces +Y), z = up, origin = feet centre on the ground; cell (x, y, z) spans
[x, x+1) * 1/32 m. Right-side parts are authored at +x and mirrored with x -> -1 - x.

Surface style (owner feedback 2026-09-25/26, CHAR-BODY styleRules): every box() call is its own
BRICK ISLAND. The Blender kit meshes each island separately, bevels it softly and gives it smooth
face-area normals, so seams appear only between authored plates, straps and pouches (the layered,
chunky detail read) and never between fine voxels. Silhouette steps use 2-voxel main blocks; single
voxels are reserved for trims, rivets, badges and lights. T2/T3 carry ~10-20 % emissive surface.
Colour lives only in the ten shared material slots, so colourways/roles/player colours are tables.

Fit rules (checked by crew_armor_fit.py against mannequin(), a port of CHAR-BODY r002 body.py):
- no same-normal coplanar visible face between armour and the body or between the parts of a
  preset (no z-fighting): armour encloses what it covers >= 1 voxel proud, or sits clear of it.
  Gloves/boots replace the hands/feet regions (hidesBodyRegions);
- the arms hang flush against the chest (x = 7) and the hands hang beside the hips/thighs (x >= 6,
  z 13..21), so torso armour is a vest (front/back shells + straps) and belt/leg armour keeps the
  hand zone clear; the legs touch at x = 0 at most.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

KIT_ID = "crew.armor-v1"
REVISION = "r006"
SPEC_VERSION = 2
BODY_REVISION = "r005"
V = 1.0 / 32.0
SLOTS = ["skin", "hair", "eye", "suit_primary", "suit_secondary", "accent", "metal", "dark", "emit", "glass"]
SI = {s: i for i, s in enumerate(SLOTS)}
EQUIPMENT_SLOTS = ["chest", "shoulders", "gloves", "belt", "legs", "boots", "back"]
TIERS = {0: "civilian", 1: "light", 2: "standard", 3: "heavy"}
RIG_BONES = ["root", "pelvis", "spine", "chest", "neck", "head",
             "shoulder.R", "shoulder.L", "upper_arm.R", "upper_arm.L", "forearm.R", "forearm.L",
             "hand.R", "hand.L", "thigh.R", "thigh.L", "shin.R", "shin.L", "foot.R", "foot.L", "toe.R", "toe.L"]
BODY_REGIONS = ["base", "suit", "gear", "head", "hands", "hair"]   # CHAR-BODY r004 layers
# Torso fits: CHAR-BODY variants differ only in waist half-width (chest is +-7 on all).
FITS = {"wide": {"chest": 7, "waist": 6, "variants": ["male", "neutral"]},
        "narrow": {"chest": 7, "waist": 5, "variants": ["female"]}}
P, S2, AC, M, D, EM, GL = "suit_primary", "suit_secondary", "accent", "metal", "dark", "emit", "glass"
SK, HR, EY = "skin", "hair", "eye"

# ============================================================================================== RIG
BODY = {
    "bones": {  # CHAR-BODY r004 bone head/tail (voxels); .L mirrors x
        "root": ((0, 0, 0), (0, 6, 0)), "pelvis": ((0, 0, 20), (0, 0, 24)), "spine": ((0, 0, 24), (0, 0, 29)),
        "chest": ((0, 0, 29), (0, 0, 37)), "neck": ((0, 0, 37), (0, 0, 39)), "head": ((0, 0, 39), (0, 0, 55)),
        "shoulder.R": ((2, 0, 34), (9.5, 0, 35)), "upper_arm.R": ((9.5, 0, 35), (9.5, 0, 27)),
        "forearm.R": ((9.5, 0, 27), (9.5, 0, 21)), "hand.R": ((9.5, 0, 21), (9.5, 0, 14)),
        "thigh.R": ((4, 0, 20), (4, 0, 11)), "shin.R": ((4, 0, 11), (4, 0, 3)),
        "foot.R": ((4, 0, 3), (4, 3, 1)), "toe.R": ((4, 3, 1), (4, 6, 1)),
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
    """Voxel volume with brick islands: c = {cell: slot}, isl = {cell: island id}.
    Every box() starts a new island unless `into` names an existing one."""

    _next = [1]

    def __init__(self):
        self.c, self.isl = {}, {}

    def box(self, x0, y0, z0, x1, y1, z1, slot, into=None):
        assert slot in SI, slot
        i = into if into is not None else self._new()
        for x in range(x0, x1):
            for y in range(y0, y1):
                for z in range(z0, z1):
                    self.c[(x, y, z)] = slot
                    self.isl[(x, y, z)] = i
        self.last = i
        return self

    def _new(self):
        Vol._next[0] += 1
        return Vol._next[0]

    def cut(self, x0, y0, z0, x1, y1, z1):
        for x in range(x0, x1):
            for y in range(y0, y1):
                for z in range(z0, z1):
                    self.c.pop((x, y, z), None)
                    self.isl.pop((x, y, z), None)
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
        self.cut(x1 - 1, y0, z0, x1, y0 + 1, z1).cut(x1 - 1, y1 - 1, z0, x1, y1, z1)
        return self

    def mirrored(self):
        m = Vol()
        m.c = {(-1 - x, y, z): s for (x, y, z), s in self.c.items()}
        m.isl = {(-1 - x, y, z): i for (x, y, z), i in self.isl.items()}
        return m

    def islands(self):
        out = {}
        for k, i in self.isl.items():
            out.setdefault(i, {})[k] = self.c[k]
        return list(out.values())

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

    def islands(self, fit=None):
        fit = fit or next(iter(self.fits))
        return sum(len(v.islands()) for v in self.fits[fit].values())

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
    out = {}
    for bone, v in vols_r.items():
        out[bone] = v
        if bone.endswith(".R"):
            out[bone[:-2] + ".L"] = v.mirrored()
    return out


# ======================================================================================== MANNEQUIN
BODY_SNAPSHOT = Path(__file__).resolve().parent / "crew_armor_body.json"
_BODY_CACHE = {}


def mannequin(variant="male"):
    """CHAR-BODY body volumes by layer region: {region: {bone: Vol}} for base, hands, head, suit,
    gear and hair, read from crew_armor_body.json (a snapshot of CHAR-BODY body.py made by
    crew_armor_body_snapshot.py). Used for the fit checks and as the render fallback."""
    if not _BODY_CACHE:
        _BODY_CACHE.update(json.loads(BODY_SNAPSHOT.read_text()))
    v = "female" if variant == "female" else "male"
    out = {}
    for region, bones in _BODY_CACHE["variants"][v].items():
        out[region] = {}
        for bone, runs in bones.items():
            vol = Vol()
            for x, y, z0, z1, slot in runs:
                vol.box(x, y, z0, x + 1, y + 1, z1, slot if slot in SI else SK, into=0)
            out[region][bone] = vol
    return out


# ============================================================================================= CHEST
# Body r002: chest x -7..7, y -5..5, z 28..36 (front details to y 7, back O2 port to y -6, collar
# x -4..4 to z 37); waist x -w..w, y -4..5, z 23..29; arms hang flush at x 7..12; head z 37+.
def torso_shell(c, w, tier, base_slot):
    """Vest: front and back shells (arms stay flush with the chest sides), shoulder straps, waist band."""
    ch, sp = Vol(), Vol()
    fy = 8 + (tier >= 3)                  # front face (body front details reach y = 7)
    by = -7                               # back face (packs mount behind y = -8)
    ch.box(-7, 5, 28, 7, fy, 36, base_slot)                                         # front shell
    ch.cut(-7, fy - 1, 28, -6, fy, 36).cut(6, fy - 1, 28, 7, fy, 36)                 # soften front corners only
    ch.cut(-4, 5, 35, 4, 6, 36)                                                      # collar notch (lapels show; chin clear)
    ch.box(-7, by, 28, 7, -5, 36, base_slot)                                         # back shell
    ch.cut(-7, by, 28, -6, by + 1, 36).cut(6, by, 28, 7, by + 1, 36)
    for x0 in (-7, 4):                                                                  # shoulder straps
        ch.box(x0, by + 1, 36, x0 + 3, fy - 1, 37, S2)
    sp.box(-w - 1, -5, 25, w + 1, 6, 28, base_slot).cut(-w - 1, 5, 25, -w, 6, 28).cut(w, 5, 25, w + 1, 6, 28)
    return ch, sp, fy, by


def chest_vols(c, w, tier, style):
    base_slot = S2 if style == "overalls" else P
    ch, sp, fy, by = torso_shell(c, w, tier, base_slot)
    vols = {"chest": ch, "spine": sp}
    if style == "overalls":
        ch.box(-4, fy, 28, 4, fy + 1, 34, P).box(-3, fy + 1, 29, 3, fy + 2, 32, D)      # bib + pocket
        ch.box(-2, fy + 1, 32, 2, fy + 2, 33, P)
        for x0 in (-6, 5):                                                              # braces + buckles
            ch.box(x0, fy, 32, x0 + 1, fy + 1, 36, P).box(x0, fy + 1, 33, x0 + 1, fy + 2, 34, M)
        sp.paint(-w - 1, -5, 25, w + 1, 6, 28, P)
        sp.box(-3, 6, 25, 3, 7, 27, D).paint(-2, 6, 25, 2, 7, 26, M)
        return vols
    if style in ("jacket", "coat", "labcoat", "flight"):
        ch.box(-1, fy, 28, 1, fy + 1, 36, D if style != "flight" else S2)             # placket / zip
        sp.box(-1, 6, 25, 1, 7, 28, D if style != "flight" else S2)
        sp.paint(-w - 1, -5, 25, w + 1, 6, 26, S2)                                      # hem band
        if style in ("jacket", "coat", "labcoat"):
            lap = AC if style == "coat" else S2
            for k in range(3):                                                          # stepped lapels (islands)
                ch.box(-3 - 2 * k, fy, 34 - 2 * k, -1 - 2 * k, fy + 1, 36 - 2 * k, lap)
                ch.box(1 + 2 * k, fy, 34 - 2 * k, 3 + 2 * k, fy + 1, 36 - 2 * k, lap)
        if style == "jacket":
            ch.box(-6, fy, 29, -3, fy + 1, 31, S2).box(-6, fy + 1, 31, -3, fy + 2, 32, AC)   # pocket + flap
            ch.box(3, fy, 29, 6, fy + 1, 31, S2).box(4, fy + 1, 31, 6, fy + 2, 32, EM)       # badge light
            sp.box(-w, 6, 25, -2, 7, 27, S2).box(2, 6, 25, w, 7, 27, S2)
        if style == "coat":
            for z in (29, 31, 33):
                ch.box(-4, fy + 1, z, -3, fy + 2, z + 1, M).box(3, fy + 1, z, 4, fy + 2, z + 1, M)
            ch.box(4, fy + 1, 34, 7, fy + 2, 35, AC).box(4, fy + 1, 33, 5, fy + 2, 34, EM)   # rank bar + pin
            ch.box(-7, fy - 1, 29, -6, fy + 1, 35, AC).box(6, fy - 1, 29, 7, fy + 1, 35, AC)  # braided edges
            sp.box(-w - 1, 6, 27, w + 1, 7, 28, AC)                                       # waist trim
            for x0 in (-7, 4):
                ch.paint(x0, by + 1, 36, x0 + 3, fy - 1, 37, AC)                            # gold shoulder boards
        if style == "labcoat":
            ch.box(-6, fy, 29, -3, fy + 1, 32, S2).box(-5, fy + 1, 31, -4, fy + 2, 34, AC)  # pocket + pen
            ch.box(3, fy, 32, 6, fy + 1, 34, EM)                                            # glowing ID
        if style == "flight":
            ch.box(-6, fy - 3, 36, 6, fy + 1, 37, S2).cut(-3, fy - 3, 36, 3, fy - 1, 37)    # ribbed jacket collar
            ch.box(-7, by, 36, 7, by + 2, 37, S2)
            ch.box(2, fy, 29, 6, fy + 1, 31, S2).box(2, fy + 1, 30, 6, fy + 2, 31, D)       # chest pocket + flap
            ch.paint(-7, by, 31, 7, fy, 33, AC)                                             # chest stripe
            ch.box(-6, fy, 30, -3, fy + 1, 34, S2).box(-5, fy + 1, 31, -4, fy + 2, 33, EM)  # comms unit
            for x0 in (-3, 2):
                ch.box(x0, fy, 28, x0 + 1, fy + 1, 36, D)                                   # harness straps
            sp.box(-2, 6, 25, 2, 8, 28, M).box(-1, 8, 26, 1, 9, 27, EM)                     # quick-release
            ch.box(4, fy, 34, 6, fy + 1, 35, AC)
        return vols

    ft = 1 if tier < 3 else 2
    plated = tier >= 2 or style in ("medic", "vest", "hazard")
    if plated:
        for x0, x1 in ((-6, -1), (1, 6)):                                                    # layered chest plates
            ch.box(x0, fy, 29, x1, fy + ft, 35, P)
            ch.box(x0 + 1, fy + ft, 30, x1 - 1, fy + ft + 1, 33, S2)                          # raised inner plate
        ch.box(-1, fy, 30, 1, fy + 1, 35, D)                                                  # centre spine
        ch.box(-5, by - 1, 29, 5, by, 34, P).box(-1, by - 1, 30, 1, by, 34, M)               # back plate + mount
        sp.box(-w, 6, 25, w, 7, 27, S2).box(-w + 1, 7, 25, w - 1, 8, 27, P)                  # abdomen plates
        ch.box(-6, fy, 28, 6, fy + 1, 29, D)                                                  # plate underside
    if tier >= 1:
        ch.box(3, fy + ft + (1 if plated else 0), 33, 5, fy + ft + 1 + (1 if plated else 0), 34, EM if tier >= 2 else AC)
    if tier >= 2:
        ch.box(-4, fy + ft, 29, 4, fy + ft + 1, 30, EM)                                       # light bar
        ch.box(-5, fy, 35, 5, fy + 1, 36, EM)                                                 # collar light bar
        for x0, x1 in ((-6, -1), (1, 6)):
            ch.paint(x0 + 1, fy + ft, 30, x1 - 1, fy + ft + 1, 31, EM)                        # plate glow seams
        ch.box(-5, fy + ft, 33, -3, fy + ft + 1, 34, M)                                       # bolts
        ch.paint(-1, by - 1, 30, 1, by, 34, EM)                                               # back mount glow
        sp.box(-3, 8, 25, 3, 9, 26, EM)                                                       # belly light strip
        for x in (-7, 6):
            ch.box(x, 5, 30, x + 1, fy, 32, EM)                                               # side glow ribs
    if tier >= 3:
        ch.box(-7, fy + ft - 1, 30, -5, fy + ft + 1, 36, S2).box(5, fy + ft - 1, 30, 7, fy + ft + 1, 36, S2)   # flanks
        ch.box(-2, fy + ft + 1, 31, 2, fy + ft + 2, 33, AC).box(-1, fy + ft + 2, 31, 1, fy + ft + 3, 33, EM)  # core
        ch.box(-4, fy + ft, 34, 4, fy + ft + 1, 35, EM)                                       # upper light bar
        ch.paint(-5, by - 1, 29, 5, by, 34, S2)                                               # back armour layer (flush)
    if style in ("harness", "tactical"):
        for x0 in (-4, 3):                                                                     # webbing
            ch.box(x0, fy, 28, x0 + 1, fy + 1, 36, D).box(x0, by - 1, 28, x0 + 1, by, 36, D)
            sp.box(x0, 6, 25, x0 + 1, 7, 28, D)
        ch.box(-7, fy, 31, 7, fy + 1, 32, D).box(-1, fy + 1, 31, 1, fy + 2, 32, M)            # chest strap + buckle
        sp.box(-w, 7, 25, -1, 9, 27, S2).box(1, 7, 25, w, 9, 27, S2)                          # belly pouches
        ch.box(-6, fy + 1, 32, -4, fy + 2, 35, S2).box(4, fy + 1, 32, 6, fy + 2, 35, S2)     # chest pouches
        if style == "tactical":
            for x0 in (-6, -2, 2):                                                             # magazine pouches
                ch.box(x0, fy + 1, 28, x0 + 3, fy + 3, 31, S2).box(x0, fy + 2, 30, x0 + 3, fy + 3, 31, D)
            ch.box(4, fy + 2, 33, 6, fy + 3, 35, EM).box(-6, fy + 2, 33, -4, fy + 3, 35, AC)
    if style == "medic":
        cy = fy + ft + 1                                                                      # big red cross, raised
        ch.box(-1, cy, 29, 1, cy + 1, 36, AC).box(-4, cy, 31, 4, cy + 1, 33, AC, into=ch.last)
        ch.box(-7, fy - 1, 28, 7, fy + 1, 29, AC)                                             # red hem band
        sp.box(-w, 8, 26, w, 9, 27, AC)
    if style == "vest":
        ch.box(-5, fy + ft, 32, -3, fy + ft + 1, 34, AC).box(-5, fy + ft + 1, 33, -4, fy + ft + 2, 34, M)   # badge
        ch.box(-7, fy - 1, 28, 7, fy + 1, 29, AC)                                             # hi-vis band
        sp.box(-w, 8, 26, w, 9, 27, AC)
    if style == "hazard":
        for x in range(-w, w, 2):
            sp.box(x, 7, 27, x + 1, 8, 28, AC)                                                # chevrons
        ch.box(-7, fy - 1, 34, 7, fy + 1, 35, AC)
        ch.box(-2, fy + ft + 1, 31, 2, fy + ft + 2, 33, D).box(-1, fy + ft + 2, 31, 1, fy + ft + 3, 33, EM)  # gauge
    return vols


def coat_tails(c, w, style):
    """Coat skirts on the hips (front/back panels) and on each thigh (swing with the legs). The outer
    thigh stays open above z 12 (pocket and the hanging hand)."""
    trim = AC if style == "coat" else S2
    hub = Vol().box(-8, 5, 18, 8, 6, 22, P).box(-8, -5, 18, 8, -4, 22, P)
    hub.box(-8, 6, 18, 8, 7, 19, trim)
    drop = 11
    tail = Vol()
    tail.box(0, 4, drop, 7, 5, 18, P).box(0, -4, drop, 7, -3, 18, P).box(0, -4, drop, 1, 5, 18, P)
    tail.box(7, -4, drop, 9, 5, 12, P)                                          # outer wrap below the pocket
    tail.box(0, -5, drop, 9, 6, drop + 1, trim)                                 # hem (flared, its own island)
    if style == "labcoat":
        tail.box(9, -2, 10, 10, 2, 12, S2)
    else:
        tail.box(0, 5, drop + 1, 1, 6, 17, trim)                                # front braid
    return {"pelvis": hub, **sided({"thigh.R": tail})}


# ========================================================================================= SHOULDERS
# Body sleeve cap (upper_arm.R): x 7..12, y -3..3, z 31..36 (outer top step at x 11, z 35); arm
# x 7..12 below. Chest shoulder straps occupy x <= 6 at z 36; the head overhangs x -9..9 from z 37.
def shoulder_vols(tier, style):
    ua = Vol()
    if style in ("cloth", "epaulette") or tier == 0:
        top = AC if style == "epaulette" else S2
        ua.box(8, -4, 30, 14, 4, 36, P if style == "epaulette" else S2).chamfer_outer(14, -4, 4, 30, 36)
        ua.box(7, -4, 36, 14, 4, 37, top).cut(13, -4, 36, 14, 4, 37)
        if style == "epaulette":
            for y in range(-4, 4, 2):
                ua.box(14, y, 29, 15, y + 1, 35, AC)                                   # fringe
            ua.box(10, -1, 37, 12, 1, 38, M)
        else:
            ua.box(14, -1, 31, 15, 1, 33, D)
        return sided({"upper_arm.R": ua})
    g = {1: 0, 2: 1, 3: 2}[tier]
    x1, y0, y1 = 14 + g, -4 - g, 4 + g
    low = 30
    ua.box(8, y0, low, x1, y1, 36, P).chamfer_outer(x1, y0, y1, low, 36)                 # cap
    ua.box(7, y0 + 1, 36, x1 - 1, y1 - 1, 37, P)                                          # top plate
    ua.box(11, y0 + 2, 37, x1 - 2, y1 - 2, 38 + (tier >= 2), S2)                          # stepped dome crown (clear of long hair)
    ua.box(8, y0 - (tier >= 3), low - 1, x1 + 1, y1 + (tier >= 3), low, S2)               # rim (own island)
    ua.box(x1, -2, low + 1, x1 + 1, 2, low + 2, EM)                                       # side light
    if tier >= 2:
        ua.box(x1, y0 + 1, 33, x1 + 1, y1 - 1, 34, EM)                                    # light strip
        ua.box(9, y1, 32, x1 - 1, y1 + 1, 33, EM).box(9, y0 - 1, 32, x1 - 1, y0, 33, EM)  # front/back glow
        ua.box(x1, y0 + 1, 35, x1 + 1, y0 + 2, 36, M).box(x1, y1 - 2, 35, x1 + 1, y1 - 1, 36, M)
    if tier >= 3:
        ua.box(x1, y0 + 1, low, x1 + 1, y1 - 1, 32, P)                                    # outer lame
        ua.box(x1 - 3, y0 + 1, 39, x1 - 1, y1 - 1, 40, S2)                                # ridge
        ua.box(x1 + 1, y0 + 1, low + 1, x1 + 2, y0 + 2, low + 2, M).box(x1 + 1, y1 - 2, low + 1, x1 + 2, y1 - 1, low + 2, M)
    if style == "flight":
        ua.box(x1, -2, 31, x1 + 1, 2, 33, AC).box(x1 + 1, -1, 31, x1 + 2, 1, 32, EM)       # mission patch
    return sided({"upper_arm.R": ua})


# ============================================================================================ GLOVES
# Body hand.R: fist x 7..13, y -3..3, z 14..19, thumb x 7..9, y 3..4, z 15..18 (hidden under gloves);
# cuff x 6..13, y -3..4, z 19..21; forearm x 7..12, y -2..3, z 21..26.
def glove_vols(tier, style):
    hd, fa = Vol(), Vol()
    palm = S2 if tier < 2 else D
    hd.box(7, -4, 15, 14, 4, 20, palm).chamfer_outer(14, -4, 4, 15, 20)            # fist
    for k, y in enumerate(range(-4, 4, 2)):                                          # four finger bricks
        hd.box(7, y, 13, 14 - (k % 2), y + 2, 15, palm)
    hd.box(7, 4, 15, 10, 6, 19, palm)                                                # thumb (front)
    hd.box(14, -3, 16, 15, 3, 19, P)                                                 # back-of-hand plate
    hd.box(6, -4, 19, 14, 5, 20, P if tier else S2).cut(6, -4, 19, 7, 5, 20)         # glove band over the cuff line
    if tier >= 1:
        hd.box(14, -4, 15, 15, 4, 16, M)                                             # knuckle bar
        hd.box(15, -1, 17, 16, 2, 18, EM if tier >= 2 else AC)
    if tier >= 3:
        hd.box(8, 6, 16, 11, 7, 19, P).box(14, -3, 19, 15, 3, 20, EM)                # thumb guard + wrist glow
    if tier >= 1 or style == "work":
        # bracer over the cuff line; its top stays below the belt top (z 24) beside the hips
        fa.box(6, -3, 21, 13, 4, 23, P if tier >= 2 else S2).chamfer_z(6, -3, 13, 4, 21, 23)
        fa.box(7, -4, 22, 13, 5, 23, AC)                                             # trim ring (island)
        if tier >= 2:
            ot = 25 + (tier >= 3)
            fa.box(12, -3, 23, 14, 4, ot, P)                                         # outer forearm plate
            fa.box(14, -2, 21, 15, 2, ot - 1, S2).box(14, -1, 22, 15, 1, 24, EM)     # wrist display
            fa.box(12, -3, ot, 14, 4, ot + 1, EM)
        if style == "work":
            fa.box(7, -5, 23, 14, 6, 24, D)                                          # flared gauntlet lip
    return sided({"hand.R": hd, **({"forearm.R": fa} if fa.c else {})})


# ============================================================================================= BOOTS
# Body feet (hidden under boots) x 1..8, y -5..7, z 0..3; the shin keeps the boot shaft x 1..8,
# y -4..5, z 3..7 with the trouser hem x 0..8, y -4..5, z 5..8 flared over it (trousers over boots).
def boot_vols(tier, style):
    ft, to, sh = Vol(), Vol(), Vol()
    sole = 1 + (tier >= 2)
    ft.box(0, -6, 0, 9, 4, sole, D)                                                  # chunky sole
    ft.box(0, -6, sole, 9, 4, 4, P).cut(0, -6, sole, 1, -5, 4).cut(8, -6, sole, 9, -5, 4)   # heel/instep
    ft.box(1, -7, 1, 8, -6, 3, S2)                                                   # heel tab
    to.box(0, 4, 0, 9, 9, sole, D)
    to.box(0, 4, sole, 9, 9, 4, P).cut(0, 8, sole, 1, 9, 4).cut(8, 8, sole, 9, 9, 4)   # toe box (encloses the suit toe)
    to.box(1, 9, 0, 8, 10, sole + 1, S2)                                             # toe bumper
    sh.box(0, -5, 4, 9, 4, 5, P)                                                     # ankle collar under the hem
    if style == "sneaker":
        ft.paint(0, -6, sole, 9, 4, sole + 1, AC)
        to.paint(0, 4, sole, 9, 9, sole + 1, AC)
        to.box(3, 7, 3, 6, 9, 4, S2)                                                 # laces
        return sided({"foot.R": ft, "toe.R": to, "shin.R": sh})
    if style != "dress":
        to.box(3, 7, 3 + (tier >= 2), 6, 9, 4 + (tier >= 2), D)                      # laces
    if style == "dress":
        to.paint(0, 4, sole, 9, 9, 4, P)
        sh.box(1, 6, 4, 8, 7, 5, M)                                                  # buckle strap
    if tier >= 2:
        sh.box(9, -2, 4, 10, 2, 5, EM)                                               # ankle light
        to.box(1, 10, 0, 8, 11, sole, M)                                             # toe guard
        to.paint(1, 9, 0, 8, 10, sole + 1, EM)                                       # glowing bumper
        ft.box(9, -3, sole, 10, 2, sole + 2, M)                                      # ankle bolt
        to.paint(1, 8, sole, 8, 9, sole + 1, EM)
    if tier >= 3:
        ft.box(0, -7, 0, 9, -6, 2, M)                                                # heel spur plate
        sh.box(2, 6, 3, 7, 7, 8, P).box(3, 7, 5, 6, 8, 7, EM)                        # shin guard in front of the hem
    if style == "flight":
        sh.paint(0, -5, 4, 9, 6, 5, AC)
    return sided({"foot.R": ft, "toe.R": to, "shin.R": sh})


# ============================================================================================== LEGS
# Body thigh.R x 1..7, y -3..4, z 10..19 (cargo pocket x 7..8, y -2..2, z 12..17); shin x 1..7,
# y -3..4, z 7..10 with the hem z 5..8 and knee panel x 2..6, y 4..5, z 8..11. Hands hang at
# x >= 7, z 13..19.
def legs_vols(tier, style):
    th, sh = Vol(), Vol()
    if tier == 0:
        th.box(1, 4, 14, 5, 5, 17, S2).box(1, 5, 16, 5, 6, 17, AC)                    # front pocket + flap
        th.box(2, 4, 11, 6, 5, 13, S2)                                                # knee patch
        return sided({"thigh.R": th})
    sh.box(1, 5, 8, 7, 7, 13, P).chamfer_z(1, 5, 7, 7, 8, 13)                         # knee guard
    sh.box(2, 7, 9, 6, 8, 12, S2)                                                     # guard boss
    if tier >= 2:
        sh.box(3, 8, 10, 5, 9, 11, EM)
        th.box(1, 4, 13, 7, 5, 18, P).box(2, 5, 14, 6, 6, 17, S2)                     # layered thigh plates
        th.box(3, 6, 15, 5, 7, 16, EM)
        th.box(8, -3, 10, 9, 3, 12, P).box(9, -1, 10, 10, 1, 11, EM)                  # outer plate below the pocket
    else:
        th.box(0, -4, 11, 9, 5, 12, D)                                                # thigh strap
        th.box(9, -2, 10, 10, 2, 12, S2).box(10, -1, 11, 11, 1, 12, AC)               # strap pouch
    if tier >= 3:
        th.box(1, 6, 13, 7, 7, 18, P).box(2, 7, 15, 6, 8, 17, EM)                    # heavy thigh plate
    vols = sided({"thigh.R": th, "shin.R": sh})
    if tier >= 3:
        pv = Vol()
        for x0, x1 in ((-7, -2), (2, 7)):                                             # front tassets under the belt
            pv.box(x0, 5, 18, x1, 7, 21, P).box(x0 + 1, 7, 18, x1 - 1, 8, 20, S2)
        vols["pelvis"] = pv
    return vols


# ============================================================================================== BELT
# Body pelvis x -7..7, y -4..5, z 18..23; belt x -7..7, y -5..6, z 22..24 (buckle/keeper to y 7);
# waist above. Hands and cuffs hang at x >= 6 for y -4..5, so the belt has arm notches.
def belt_vols(c, w, tier, style):
    p = Vol()
    band = AC if style == "sash" else D
    p.box(-8, -6, 21, 8, 8, 25, band).chamfer_z(-8, -6, 8, 8, 21, 25)
    p.cut(5, -5, 21, 8, 6, 24).cut(-8, -5, 21, -5, 6, 24)                       # arm notches (floor inside the hips)
    k = w - 1 if w >= 6 else w + 1
    p.cut(k, -5, 24, 8, 6, 25).cut(-8, -5, 24, -k, 6, 25)
    p.box(-2, 8, 21, 2, 9, 25, M if style != "sash" else AC)                     # buckle (island)
    p.box(-1, 9, 22, 1, 10, 24, EM if tier >= 1 else M)
    if style == "plain":
        p.box(3, 8, 22, 4, 9, 24, S2).box(-4, 8, 22, -3, 9, 24, S2)
        return {"pelvis": p}
    if style == "sash":
        p.box(-6, 8, 24, -4, 9, 27, AC).box(-6, 8, 18, -5, 9, 21, AC)
        p.box(3, 8, 22, 5, 9, 24, M)
        return {"pelvis": p}
    h = 3 if tier < 3 else 4
    for x0 in ([-6, 3] if tier <= 1 else [-6, -4, 2, 4]):
        wd = 3 if tier <= 1 else 2
        p.box(x0, 8, 25 - h, x0 + wd, 10, 25, S2).box(x0, 10, 24 - 1, x0 + wd, 11, 25, P)   # pouch + lid
    for x0 in (4, -8):
        p.box(x0, -8, 21, x0 + 4, -6, 25, S2).paint(x0, -8, 24, x0 + 4, -6, 25, P)        # hip pouches (back)
    p.box(-2, -8, 20, 2, -6, 25, S2)                                                        # back pouch
    if tier >= 2:
        p.paint(-8, 7, 22, 8, 8, 23, EM)                                                    # front glow line
        for x0 in ([-6, 3] if tier <= 1 else [-6, -4, 2, 4]):
            p.paint(x0, 10, 24, x0 + 2, 11, 25, EM)                                         # pouch status lights
    if style == "tool":
        p.box(7, -8, 13, 8, -7, 23, M).box(7, -9, 13, 8, -6, 15, M)                        # wrench
        p.box(-8, -8, 14, -7, -7, 22, AC).box(-8, -8, 22, -7, -7, 24, D)                   # screwdriver
        p.box(-3, 10, 22, -1, 11, 24, EM)
    if style == "medic":
        p.box(-6, 11, 22, -3, 12, 23, AC).box(-5, 11, 21, -4, 12, 24, AC)                  # red cross tab
    if style == "holster" or tier >= 2:
        p.box(7, -9, 13, 10, -6, 22, D).box(7, -9, 21, 10, -6, 22, M)                     # holster behind the arm
    if tier >= 3:
        p.paint(-8, -6, 21, 8, 8, 22, M)
        p.paint(-2, -8, 24, 2, -6, 25, EM)                                                  # back pouch light
    return {"pelvis": p}


# ============================================================================================== BACK
# Chest armour back face y = -7, bare body back y = -5 (O2 port -6). Packs mount at y = -8 on the
# chest bone with a harness plate that hides inside chest armour. Tops stay <= 36 (head from 37; the
# long hair falls behind the head at y <= -8 from z 36).
def back_vols(kind, tier):
    p = Vol()
    b0 = -8
    ex = []
    harness = lambda: p.box(-3, b0, 30, 3, -6, 35, D).box(-3, b0, 34, 3, -6, 35, M, into=p.last)   # noqa: E731
    if kind == "backpack":
        depth = {0: 4, 1: 5, 2: 6, 3: 7}[tier]
        W = {0: 5, 1: 6, 2: 6, 3: 7}[tier]
        top, bot = 36, {0: 27, 1: 26, 2: 24, 3: 22}[tier]
        yb = b0 - depth
        p.box(-W, yb, bot, W, b0, top - 2, P).chamfer_z(-W, yb, W, b0, bot, top - 2)
        p.box(-W, yb, top - 2, W, b0, top, S2).chamfer_z(-W, yb, W, b0, top - 2, top)      # lid
        p.box(-W + 1, yb - 1, bot + 1, W - 1, yb, top - 3, P)                                # outer panel
        p.box(-W + 2, yb - 2, bot + 2, W - 2, yb - 1, bot + 5, S2).box(-W + 2, yb - 2, bot + 5, W - 2, yb - 1, bot + 6, AC)
        for x0 in (-W, W - 1):
            p.box(x0, yb - 1, bot + 1, x0 + 1, yb, top - 3, D)                              # side straps
        harness()
        if tier >= 1:
            p.box(W, yb + 1, bot + 1, W + 2, b0 - 1, top - 3, D)                             # bottle
            p.box(-W - 1, yb + 1, bot + 2, -W, b0 - 1, top - 4, S2)
            p.box(-1, yb - 2, top - 5, 1, yb - 1, top - 4, EM)
        if tier >= 2:
            p.box(-W, yb, bot - 1, W, b0, bot, M)
            p.box(W - 3, yb - 3, top - 7, W - 1, yb - 2, top - 5, EM)                        # glow panel
            p.box(-W + 1, yb - 1, top - 3, W - 1, yb, top - 2, EM)                           # lid light edge
        if tier >= 3:
            p.box(-W - 1, yb - 1, bot - 2, W + 1, b0 - 1, bot - 1, D)
            p.box(-W + 1, yb - 3, bot + 7, W - 1, yb - 2, bot + 8, EM)
            p.box(W - 1, yb + 1, top, W, yb + 2, top + 8, M).box(W - 1, yb + 1, top + 8, W, yb + 2, top + 9, EM)
    elif kind == "oxygen":
        twin = tier >= 2
        for cx in ([-3, 3] if twin else [0]):
            r = 2 if twin else 3
            x0, x1, yb = cx - r, cx + r, b0 - 2 * r
            p.box(x0, yb, 25, x1, b0, 35, S2).chamfer_z(x0, yb, x1, b0, 25, 35)              # tank
            p.box(x0 + 1, yb + 1, 35, x1 - 1, b0 - 1, 36, M)                                  # valve
            band = EM if twin else AC
            p.box(x0, yb - 1, 27, x1, yb, 28, band).box(x0, yb - 1, 33, x1, yb, 34, band)    # bands
            p.box(cx - 1, yb - 1, 29, cx + 1, yb, 32, EM)                                    # gauge
        p.box(-6 if twin else -4, b0 - 1, 26, 6 if twin else 4, b0, 35, D)                    # frame plate
        harness()
    elif kind == "jetpack":
        W = 6 if tier < 3 else 7
        depth = 5 if tier < 3 else 6
        p.box(-W + 2, b0 - depth, 25, W - 2, b0, 36, P).chamfer_z(-W + 2, b0 - depth, W - 2, b0, 25, 36)
        p.box(-W + 3, b0 - depth - 1, 27, W - 3, b0 - depth, 34, S2)
        p.box(-1, b0 - depth - 2, 27, 1, b0 - depth - 1, 34, EM)
        for sx in (-1, 1):
            x0 = W - 3 if sx > 0 else -W
            x1 = x0 + 3
            p.box(x0, b0 - depth + 1, 23, x1, b0 - 1, 35, S2).chamfer_z(x0, b0 - depth + 1, x1, b0 - 1, 23, 35)
            p.box(x0, b0 - depth, 33, x1, b0 - 1, 35, AC)
            p.box(x0, b0 - depth + 1, 20, x1, b0 - 1, 23, M)                                  # nozzle bell
            p.box(x0 + 1, b0 - depth + 2, 19, x1 - 1, b0 - 2, 20, EM)                         # hot throat
            p.box(x0, b0 - depth, 29, x1, b0 - depth + 1, 30, EM)                             # glow ring
            ex.append(("chest", ((x0 + x1) / 2, (b0 - depth + 1 + b0 - 1) / 2, 19), 1.5))
        if tier >= 3:
            p.box(-W - 1, b0 - 3, 30, -W, b0 - 1, 36, D).box(W, b0 - 3, 30, W + 1, b0 - 1, 36, D)
        harness()
    elif kind == "medpack":
        p.box(-6, b0 - 5, 24, 6, b0, 36, AC).chamfer_z(-6, b0 - 5, 6, b0, 24, 36)
        p.box(-5, b0 - 6, 25, 5, b0 - 5, 34, S2)
        p.box(-1, b0 - 7, 26, 1, b0 - 6, 33, AC).box(-3, b0 - 7, 28, 3, b0 - 6, 31, AC)
        p.paint(-6, b0 - 5, 34, 6, b0, 36, M)
        p.box(3, b0 - 6, 32, 5, b0 - 5, 34, EM)
        harness()
    elif kind == "radio":
        p.box(-5, b0 - 5, 24, 5, b0, 36, P).chamfer_z(-5, b0 - 5, 5, b0, 24, 36)
        p.box(-4, b0 - 6, 26, 4, b0 - 5, 33, D).box(-3, b0 - 7, 31, -1, b0 - 6, 32, EM)
        p.box(3, b0 - 3, 36, 4, b0 - 2, 50, M).box(3, b0 - 3, 50, 4, b0 - 2, 51, EM)           # whip antenna
        p.box(-5, b0 - 6, 29, 5, b0 - 5, 30, AC)
        harness()
    elif kind == "toolpack":
        p.box(-6, b0 - 5, 23, 6, b0, 35, P).chamfer_z(-6, b0 - 5, 6, b0, 23, 35)
        p.box(-5, b0 - 6, 24, 5, b0 - 5, 29, D).box(-5, b0 - 7, 28, 5, b0 - 6, 29, AC)
        p.paint(-6, b0 - 5, 33, 6, b0, 35, S2)
        p.box(6, b0 - 5, 27, 8, b0 - 1, 37, M).box(6, b0 - 4, 37, 8, b0 - 2, 38, AC)           # torch rack
        p.box(-8, b0 - 4, 25, -6, b0 - 1, 33, AC).box(-8, b0 - 4, 28, -6, b0 - 1, 30, D)
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
HIDES = {"gloves": ["hands"]}   # CHAR-BODY regions a part replaces (every armour part also replaces "gear")
# The builders were authored on CHAR-BODY r002. r004 lifts everything from the knee up by one voxel and
# keeps the feet, boot shaft and trouser hem; LIFT applies that per slot and bone.
LIFT = {"default": 1, "foot": 0, "toe": 0}
SHIN_LIFT = {"boots": 0, "legs": 1}


LIGHTS = {"chest": 2, "back": 1, "belt": 1}      # small indicator lights kept per part (others: none)


def cap_lights(vols, slot):
    """Coordinator review r005: keep only a handful of 1-2 voxel indicator lights per figure. Emissive
    components larger than 2 cells (glow bars) become metal trims; the smallest lights are kept, up
    to LIGHTS[slot] per part (0 for paired limb parts)."""
    keep = LIGHTS.get(slot, 0)
    comps = []
    for bone, v in vols.items():
        seen = set()
        for c, sl in v.c.items():
            if sl != EM or c in seen:
                continue
            stack, comp = [c], []
            seen.add(c)
            while stack:
                x, y, z = stack.pop()
                comp.append((x, y, z))
                for d in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)):
                    n = (x + d[0], y + d[1], z + d[2])
                    if n not in seen and v.c.get(n) == EM:
                        seen.add(n)
                        stack.append(n)
            comps.append((len(comp), -max(p[2] for p in comp), bone, comp))
    comps.sort()
    kept = [c for c in comps if c[0] <= 2][:keep]
    for size, _z, bone, comp in comps:
        if (size, _z, bone, comp) in kept:
            continue
        for cell in comp:
            vols[bone].c[cell] = M
    return vols


def lifted(vols, slot):
    out = {}
    for bone, v in vols.items():
        b = bone.split(".")[0]
        dz = SHIN_LIFT.get(slot, 1) if b == "shin" else LIFT.get(b, LIFT["default"])
        if slot == "back":
            dz = -2                       # packs sit lower: r004 long hair falls to z 34 behind the head
        if not dz:
            out[bone] = v
            continue
        m = Vol()
        m.c = {(x, y, z + dz): sl for (x, y, z), sl in v.c.items()}
        m.isl = {(x, y, z + dz): i for (x, y, z), i in v.isl.items()}
        out[bone] = m
    return out
SOCKET = {"chest": "socket.chest", "shoulders": "socket.shoulder", "gloves": "socket.glove", "boots": "socket.foot",
          "legs": None, "belt": "socket.belt", "back": "socket.back"}


def build_catalog():
    parts = []

    def add(pid, slot, tier, style, name, fits, exhaust=()):
        fits = {fn: cap_lights(lifted(vols, slot), slot) for fn, vols in fits.items()}
        exhaust = [(b, (x, y, z - 2), r) for b, (x, y, z), r in exhaust]
        parts.append(Part(pid, slot, tier, style, name, fits, SOCKET[slot], MASS[slot][tier], GRID[slot], list(exhaust),
                          ["gear"] + list(HIDES.get(slot, ()))))

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
    "arctic": cw("#e4e0f2", "#343a6a", "#4f7cff", "#a3abc0", "#2a2b40", "#56c8ff", label="Arctic"),
    "crimson": cw("#c8263d", "#2e2735", "#f08a2a", "#a0a6b3", "#1b1820", "#ff5a4a", label="Crimson"),
    "cobalt": cw("#2f63e6", "#1c2548", "#e8ecf6", "#a8b2c6", "#161c33", "#5fd2ff", label="Cobalt"),
    "amber": cw("#f7a414", "#24222e", "#4c83ff", "#aeafb6", "#1c1b24", "#6fd6ff", label="Amber"),
    "moss": cw("#86b43c", "#2e3528", "#d4e05c", "#929c90", "#161a14", "#8dff5a", label="Moss"),
    "shadow": cw("#4d4864", "#2b283a", "#f08a2a", "#827f96", "#131219", "#ff9a3a", label="Shadow"),
    "captain": cw("#1f2d55", "#e3e8f1", "#f3bb3c", "#d0a84c", "#12182a", "#63c9ff", label="Command navy"),
    "engineer": cw("#f08c1e", "#2f2e3e", "#3f78ff", "#aeb2bd", "#1c1b25", "#46d6ff", label="Engineering orange"),
    "medic": cw("#f2f3f8", "#d8243a", "#e0253e", "#b7bfd2", "#23222e", "#35d6ff", label="Medical white"),
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
    {"id": "role.captain", "heads": {"male": ["acc.officer_cap", "hair.swept_quiff.cap"], "female": ["acc.officer_cap", "hair.long_gathered.cap"], "skin": "#e7a98a", "hair": "#7a4526", "source": "CHAR-HEADS v1 (PR #37)"}, "undersuit": {"suit_primary": "#1d2748", "suit_secondary": "#10152a"}, "name": "Captain", "colourway": "captain", "headPreset": "head.captain-cap",
     "parts": {"chest": "armor.chest.coat", "shoulders": "armor.shoulders.epaulette", "gloves": "armor.gloves.fabric",
               "belt": "armor.belt.sash", "boots": "armor.boots.dress"}},
    {"id": "role.engineer", "heads": {"male": ["acc.goggles_up", "hair.curly_top.full"], "female": ["acc.goggles_up", "hair.messy_bun.full"], "skin": "#c98a62", "hair": "#4a2f6e", "source": "CHAR-HEADS v1 (PR #37)"}, "undersuit": {"suit_primary": "#2d2b3f", "suit_secondary": "#1a1926"}, "name": "Engineer", "colourway": "engineer", "headPreset": "head.engineer-helmet",
     "parts": {"chest": "armor.chest.harness", "shoulders": "armor.shoulders.light", "gloves": "armor.gloves.work",
               "belt": "armor.belt.tool", "legs": "armor.legs.light", "boots": "armor.boots.light",
               "back": "armor.back.toolpack"}},
    {"id": "role.medic", "heads": {"male": ["acc.medic_cap", "hair.close_crop.cap"], "female": ["acc.medic_cap", "hair.blunt_bob.cap"], "skin": "#f3c2a2", "hair": "#2a2438", "source": "CHAR-HEADS v1 (PR #37)"}, "undersuit": {"suit_primary": "#2c2a3a", "suit_secondary": "#1b1a26"}, "name": "Medic", "colourway": "medic", "headPreset": "head.medic-helmet",
     "parts": {"chest": "armor.chest.medic", "shoulders": "armor.shoulders.standard", "gloves": "armor.gloves.light",
               "belt": "armor.belt.medic", "legs": "armor.legs.light", "boots": "armor.boots.standard",
               "back": "armor.back.medpack"}},
    {"id": "role.pilot", "heads": {"male": ["acc.headset", "hair.short_waves.full"], "female": ["acc.headset", "hair.high_bun.full"], "skin": "#e0a47f", "hair": "#6b3b1f", "source": "CHAR-HEADS v1 (PR #37)"}, "undersuit": {"suit_primary": "#233a8a", "suit_secondary": "#152255"}, "name": "Pilot", "colourway": "pilot", "headPreset": "head.pilot-helmet",
     "parts": {"chest": "armor.chest.flight", "shoulders": "armor.shoulders.flight", "gloves": "armor.gloves.light",
               "belt": "armor.belt.utility", "legs": "armor.legs.light", "boots": "armor.boots.flight",
               "back": "armor.back.oxygen-single"}},
    {"id": "role.security", "heads": {"male": ["acc.cap", "hair.close_crop.cap"], "female": ["acc.cap", "hair.straight_bob.cap"], "skin": "#8a5a3c", "hair": "#3a2a22", "source": "CHAR-HEADS v1 (PR #37)"}, "undersuit": {"suit_primary": "#1f2c63", "suit_secondary": "#121934"}, "name": "Security officer", "colourway": "security", "headPreset": "head.security-cap",
     "parts": {"chest": "armor.chest.vest", "shoulders": "armor.shoulders.standard", "gloves": "armor.gloves.standard",
               "belt": "armor.belt.holster", "legs": "armor.legs.standard", "boots": "armor.boots.standard",
               "back": "armor.back.backpack-t1"}},
    {"id": "role.marine", "heads": {"male": ["helmet.tactical", "visor.tactical.tinted"], "female": ["helmet.tactical", "visor.tactical.tinted"], "skin": "#b87955", "hair": "#241a14", "source": "CHAR-HEADS v1 (PR #37)"}, "undersuit": {"suit_primary": "#2e2934", "suit_secondary": "#1a171f"}, "name": "Heavy marine", "colourway": "marine", "headPreset": "head.marine-helmet",
     "parts": {"chest": "armor.chest.heavy", "shoulders": "armor.shoulders.heavy", "gloves": "armor.gloves.heavy",
               "belt": "armor.belt.heavy", "legs": "armor.legs.heavy", "boots": "armor.boots.heavy",
               "back": "armor.back.backpack-t3"}},
    {"id": "role.salvage", "heads": {"male": ["acc.goggles_down", "hair.flat_top.full"], "female": ["acc.goggles_down", "hair.side_undercut.full"], "skin": "#d99b78", "hair": "#7a4a1e", "source": "CHAR-HEADS v1 (PR #37)"}, "undersuit": {"suit_primary": "#3a3440", "suit_secondary": "#221f28"}, "name": "Salvage tech", "colourway": "salvage", "headPreset": "head.salvage-helmet",
     "parts": {"chest": "armor.chest.hazard", "shoulders": "armor.shoulders.standard", "gloves": "armor.gloves.work",
               "belt": "armor.belt.tool", "legs": "armor.legs.standard", "boots": "armor.boots.standard",
               "back": "armor.back.backpack-t3"}},
    {"id": "role.recon", "heads": {"male": ["acc.hood", "acc.scarf"], "female": ["acc.hood", "acc.scarf"], "skin": "#a8704e", "hair": "#2b3a1e", "source": "CHAR-HEADS v1 (PR #37)"}, "undersuit": {"suit_primary": "#34402c", "suit_secondary": "#1f261a"}, "name": "Recon scout", "colourway": "recon", "headPreset": "head.recon-goggles",
     "parts": {"chest": "armor.chest.tactical", "shoulders": "armor.shoulders.light", "gloves": "armor.gloves.light",
               "belt": "armor.belt.utility", "legs": "armor.legs.light", "boots": "armor.boots.light",
               "back": "armor.back.radio"}},
    {"id": "role.scientist", "heads": {"male": ["acc.round_glasses", "hair.afro.full"], "female": ["acc.round_glasses", "hair.silver_bob.full"], "skin": "#6e4630", "hair": "#c9c3d6", "source": "CHAR-HEADS v1 (PR #37)"}, "undersuit": {"suit_primary": "#5b3fa8", "suit_secondary": "#34245f"}, "name": "Scientist", "colourway": "scientist", "headPreset": "head.scientist-hair",
     "parts": {"chest": "armor.chest.labcoat", "gloves": "armor.gloves.fabric", "belt": "armor.belt.plain",
               "boots": "armor.boots.sneaker", "back": "armor.back.backpack-t0"}},
    {"id": "role.mechanic", "heads": {"male": ["acc.cap", "hair.short_spikes.cap"], "female": ["acc.cap", "hair.long_straight.cap"], "skin": "#f1b894", "hair": "#b8452a", "source": "CHAR-HEADS v1 (PR #37)"}, "undersuit": {"suit_primary": "#27305a", "suit_secondary": "#161b33"}, "name": "Mechanic", "colourway": "mechanic", "headPreset": "head.mechanic-cap",
     "parts": {"chest": "armor.chest.overalls", "shoulders": "armor.shoulders.cloth", "gloves": "armor.gloves.work",
               "belt": "armor.belt.tool", "legs": "armor.legs.cargo", "boots": "armor.boots.light",
               "back": "armor.back.toolpack"}},
    # stretch archetypes
    {"id": "role.civilian", "heads": {"male": ["hair.pompadour.full"], "female": ["hair.long_side_fringe.full"], "skin": "#e8b08e", "hair": "#5a3222", "source": "CHAR-HEADS v1 (PR #37)"}, "undersuit": {"suit_primary": "#3e5a86", "suit_secondary": "#26344f"}, "name": "Civilian", "colourway": "civilian", "headPreset": "head.civilian-hair",
     "parts": {"chest": "armor.chest.jacket", "belt": "armor.belt.plain", "legs": "armor.legs.cargo",
               "boots": "armor.boots.sneaker"}},
    {"id": "role.jet-trooper", "heads": {"male": ["helmet.closed", "visor.closed.hud"], "female": ["helmet.closed", "visor.closed.hud"], "skin": "#c4876a", "hair": "#2a2020", "source": "CHAR-HEADS v1 (PR #37)"}, "undersuit": {"suit_primary": "#232d4a", "suit_secondary": "#141a2c"}, "name": "Jet trooper", "colourway": "cobalt", "headPreset": "head.closed-helmet",
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
