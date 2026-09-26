"""Base heads (with the flat face-canvas plane), facial hair and facial detail overlays.

Head space (voxels, 1 v = 1/32 m): origin at the `head` bone rest head, centred under the skull;
+Z up; the face looks along -Y (glTF +Z after export); the character's right side is -X.
Skull envelope x -6..6, y -6..6, z 0..13. Features are quarter-voxel relief on the face plane y = -6.
"""
from __future__ import annotations

from vox import Grid

FRONT = -6.0
# Relief layers never share a front plane (no coplanar z-fighting between swappable parts):
#   0.125 markings (details) | 0.25 features + age relief | 0.375 stubble | 0.5+ beards
#   0.625 structural details (bandage, cyber, visor implant) | 0.875 eyepatch / monocle | >= 1 eyewear, masks
R = 0.25                  # face-feature relief (eyes, brows, mouth)
RD = 0.125                # decal-like markings
RS = 0.375                # stubble



# =========================================================================== base head
def skull(sex, age=None):
    """Base head: skin skull + ears. The flat front plane is the `face` slot: the animated pixel-art face
    canvas (FACE_ATLAS_SPEC). Eyes, brows, mouth, blush and age lines are face-atlas layers, not geometry."""
    g = Grid(f"head.{sex}")
    g.box(-6, -6, 0, 6, 6, 13, "skin")
    # soft block rounding (the baked bevel does the rest): vertical corners, top edges, jaw, nape
    g.cut(-6, 5, 0, -5, 6, 13, sym=True)
    g.cut(-6, -6, 0, -5.5, -5.5, 13, sym=True)
    g.cut(-6, -6, 12, -5, 6, 13, sym=True)
    g.cut(-6, 5, 12, 6, 6, 13)
    g.cut(-6, -6, 12.5, 6, -5.5, 13)
    g.cut(-6, -6, 0, -5, 6, 1, sym=True)
    g.cut(-6, 3.5, 0, 6, 6, 1.5)
    if sex == "female":
        g.cut(-5, -6, 0, -3.75, -1.5, 1, sym=True)          # narrower chin
        g.cut(-6, -6, 1, -5.5, -2.0, 2.5, sym=True)         # jaw taper
    # the face canvas: the outermost layer of the flat front plane
    g.paint(-6, FRONT, 0, 6, FRONT + 0.25, 13, "face")
    # ears stay 3D (the character's right is -X in design space)
    g.new().box(-6.75, -0.5, 3.75, -6, 1.25, 6.75, "skin", sym=True)
    g.cut(-6.75, -0.25, 4.5, -6.5, 0.75, 6.0, sym=True)       # inner-ear notch
    # neck plug so a short body neck never shows a gap (inside the body collar)
    g.new().box(-2, -1.5, -1.25, 2, 2.5, 0, "skin")
    return g


# =========================================================================== facial hair
MOUTH_HOLE = (-2.0, 1.25, 2.0, 2.75)     # x0, z0, x1, z1 kept clear for every mouth state


def _jaw(g, t_front, t_side, z_front_top, z_side_top, z_bottom=None, y_back=0.0, x_front=5.5, female=False):
    """Beard shell around jaw and chin. Front plate is proud of the face by t_front."""
    zb = -t_front if z_bottom is None else z_bottom
    g.box(-x_front, FRONT - t_front, zb, x_front, FRONT, z_front_top, "hair")
    g.box(-6 - t_side, FRONT, max(zb, -t_side), -6, y_back, z_side_top, "hair", sym=True)
    g.box(-6, FRONT, max(zb, -t_side), 6, y_back, 0, "hair")         # under the chin


def _mouth_hole(g, extra=0.0):
    x0, z0, x1, z1 = MOUTH_HOLE
    g.cut(x0 - extra, FRONT - 4, z0 - extra, x1 + extra, FRONT, z1)
    g.cut(-1.0, FRONT - 4, 2.75, 1.0, FRONT, 4.5)       # never cover the nose


def _moustache(g, t=0.5, width=2.25, droop=0.0, z0=2.75, z1=3.25):
    g.new().box(-width, FRONT - t, z0, width, FRONT, z1, "hair")
    g.cut(-0.25, FRONT - t, z1 - 0.25, 0.25, FRONT, z1)
    if droop:
        g.box(-width, FRONT - t, z0 - droop, -width + 0.5, FRONT, z0, "hair", sym=True)


def _jag(g, x0, x1, z, depth, t, seed, slot="hair"):
    """Jagged hanging edge: every half voxel column drops a little further."""
    k = 0
    x = x0
    while x < x1 - 1e-6:
        drop = ((seed * 7 + k * 13) % 3) * 0.25
        g.box(x, FRONT - t, z - depth - drop, x + 0.5, FRONT, z, slot)
        x += 0.5
        k += 1


FACIAL_HAIR = ["stubble", "short_beard", "full_beard", "goatee", "moustache", "handlebar", "sideburns", "soul_patch",
               "long_beard", "braided_beard", "chin_strap", "mutton_chops"]


def facial_hair(fid):
    g = Grid(f"facialhair.{fid}")
    if fid == "stubble":
        _jaw(g, RS, RS, 2.75, 5.0, y_back=-1.0)
        _mouth_hole(g)
        g.box(-1.75, FRONT - RS, 2.75, 1.75, FRONT, 3.0, "hair")
    elif fid == "short_beard":
        _jaw(g, 0.5, 0.5, 1.75, 5.5, y_back=-0.75)
        _mouth_hole(g)
        g.new().box(-2.25, FRONT - 0.5, 2.75, 2.25, FRONT, 3.25, "hair")
        g.box(-2.25, FRONT - 0.5, 1.25, -2.0, FRONT, 3.25, "hair", sym=True)
    elif fid == "full_beard":
        _jaw(g, 1.0, 0.75, 1.75, 6.0, z_bottom=-1.5, y_back=-0.5)
        _mouth_hole(g)
        g.new()
        _jag(g, -4.5, 4.5, -1.5, 0.75, 1.0, 3)
        _moustache(g, t=0.75, width=2.5, droop=1.0)
    elif fid == "goatee":
        g.box(-1.75, FRONT - 0.75, -0.75, 1.75, FRONT, 1.25, "hair")
        g.box(-1.25, FRONT - 0.75, -1.25, 1.25, FRONT, -0.75, "hair")
        g.box(-2.25, FRONT - 0.5, 1.25, -2.0, FRONT, 3.0, "hair", sym=True)
        _moustache(g, t=0.5, width=2.25)
    elif fid == "moustache":
        _moustache(g, t=0.5, width=2.25, droop=0.75)
    elif fid == "handlebar":
        _moustache(g, t=0.5, width=2.25)
        g.new().box(-3.0, FRONT - 0.5, 3.0, -2.25, FRONT, 3.25, "hair", sym=True)
        g.box(-3.25, FRONT - 0.5, 3.25, -2.75, FRONT, 4.0, "hair", sym=True)
    elif fid == "sideburns":
        g.box(-6.5, -3.5, 1.5, -6, -0.75, 7.0, "hair", sym=True)
        g.box(-6.5, -3.5, 1.25, -6, -1.5, 1.5, "hair", sym=True)
    elif fid == "soul_patch":
        g.box(-0.5, FRONT - R, 0.75, 0.5, FRONT, 1.25, "hair")
        g.box(-0.25, FRONT - R, 0.25, 0.25, FRONT, 0.75, "hair")
    elif fid == "long_beard":
        _jaw(g, 1.25, 1.0, 1.75, 6.5, z_bottom=-2.5, y_back=-0.25)
        _mouth_hole(g)
        g.new().box(-3.75, FRONT - 1.25, -3.75, 3.75, FRONT + 1.0, -2.5, "hair")
        g.new()
        _jag(g, -3.0, 3.0, -3.75, 1.0, 1.25, 5)
        _moustache(g, t=1.0, width=2.75, droop=1.25)
    elif fid == "braided_beard":
        _jaw(g, 0.75, 0.5, 1.75, 5.5, z_bottom=-1.0, y_back=-0.75)
        _mouth_hole(g)
        _moustache(g, t=0.75, width=2.25)
        for k in range(4):                                 # braid links, alternating bricks
            g.new().box(-0.75 + (k % 2) * 0.25, FRONT - 1.0, -1.0 - (k + 1) * 0.875, 0.75 - (k % 2) * 0.25, FRONT + 0.25,
                        -1.0 - k * 0.875, "hair")
        g.new().box(-0.5, FRONT - 1.0, -5.0, 0.5, FRONT + 0.0, -4.5, "metal")     # bead
    elif fid == "chin_strap":
        g.box(-6.25, -5.5, 0.0, -6, -1.0, 4.5, "hair", sym=True)
        g.box(-5.5, FRONT - R, -0.5, 5.5, FRONT, 0.5, "hair")
        g.box(-6, FRONT, -R, 6, -1.0, 0, "hair")
    elif fid == "mutton_chops":
        g.box(-6.75, -5.75, 0.5, -6, -0.75, 7.0, "hair", sym=True)
        g.box(-6, FRONT - 0.5, 1.0, -3.5, FRONT, 4.0, "hair", sym=True)
        _moustache(g, t=0.5, width=3.5)
        _mouth_hole(g)
    return g


# =========================================================================== facial details
DETAILS = ["freckles", "scars", "scratch", "tattoo", "bandage", "dirt", "warpaint", "cyber", "eyepatch", "monocle",
           "visor_scar", "birthmark"]


def details(did):
    g = Grid(f"detail.{did}")
    f0, f1 = FRONT - RD, FRONT

    def dot(x, z, slot, w=0.25, h=0.25, depth=RD):
        g.box(x, FRONT - depth, z, x + w, FRONT, z + h, slot)

    if did == "freckles":
        for x, z in ((-4.25, 3.25), (-3.5, 3.0), (-2.75, 3.5), (-3.75, 2.5), (-1.5, 3.25), (-2.25, 2.75)):
            dot(x, z, "accent")
            dot(-x - 0.25, z + (0.25 if x < -3 else 0), "accent")
    elif did == "scars":
        for k in range(6):                                  # diagonal gash down the character's left cheek
            dot(3.75 + k * 0.25, 6.25 - k * 0.625, "accent", w=0.5, h=0.5)
        for k in range(3):
            dot(3.5 + k * 0.5, 4.75 - k * 1.25, "accent", w=0.75, h=0.25)            # stitch bars
    elif did == "scratch":
        for k in range(4):
            dot(-5.0 + k * 0.25, 3.25 + k * 0.25, "accent")
            dot(-4.25 + k * 0.25, 2.5 + k * 0.25, "accent")
    elif did == "tattoo":
        for x, z, w, h in ((-5.5, 4.0, 0.25, 3.0), (-5.25, 7.0, 1.25, 0.25), (-5.25, 3.75, 1.0, 0.25), (-4.75, 2.75, 0.25, 1.0),
                           (-5.5, 7.75, 0.25, 1.25), (-4.25, 3.0, 0.75, 0.25)):
            dot(x, z, "accent", w=w, h=h)
    elif did == "bandage":
        g.box(-4.75, FRONT - 0.625, 3.0, -1.75, FRONT, 4.0, "suit_primary")      # plaster across the right cheek
        g.box(-1.75, FRONT - 0.625, 3.25, -0.75, FRONT, 3.75, "suit_primary")
        g.box(-4.0, FRONT - 0.75, 3.25, -3.0, FRONT - 0.625, 3.75, "accent")
    elif did == "dirt":
        for x, z, w, h in ((-5.0, 2.5, 1.0, 0.5), (-4.25, 3.0, 0.5, 0.5), (3.0, 1.75, 1.0, 0.5), (3.75, 2.5, 0.5, 0.25),
                           (-1.25, 0.25, 1.5, 0.5), (1.5, 9.25, 1.25, 0.5), (-3.0, 8.75, 0.75, 0.25), (-2.0, 0.75, 0.5, 0.25)):
            dot(x, z, "suit_secondary", w=w, h=h)
    elif did == "warpaint":
        for s in (-1, 1):
            a, b = sorted((s * 1.75, s * 5.5))
            g.box(a, f0, 3.25, b, f1, 3.75, "accent")
            a, b = sorted((s * 3.0, s * 5.5))
            g.box(a, f0, 2.5, b, f1, 3.0, "accent")
        g.box(-0.25, f0, 7.75, 0.25, f1, 9.5, "accent")
    elif did == "cyber":
        g.box(-5.25, FRONT - 0.625, 3.25, -1.5, FRONT, 7.75, "metal")             # plate around the right eye
        g.cut(-3.75, FRONT - 1, 3.75, -1.75, FRONT, 7.0)
        g.new().box(-3.75, FRONT - 0.5, 3.75, -1.75, FRONT, 7.0, "emit")          # glowing lens over the eye
        g.new().box(-6.25, -4.5, 5.0, -6, -2.0, 5.5, "metal").box(-6.25, -2.0, 4.25, -6, -1.5, 6.25, "emit")
    elif did == "eyepatch":
        g.box(-4.25, FRONT - 0.875, 3.75, -1.5, FRONT, 7.25, "dark")
        g.cut(-4.25, FRONT - 1, 3.75, -3.75, FRONT, 4.25)
        g.cut(-2.0, FRONT - 1, 3.75, -1.5, FRONT, 4.25)
        g.new()
        for k in range(8):                                  # strap up to the character's left temple
            x = -1.5 + k * 1.0
            z = 7.0 + k * 0.25
            g.box(x, FRONT - 0.5, z, x + 1.0, FRONT, z + 0.5, "dark")
        g.box(6, FRONT, 8.75, 6.25, 6, 9.25, "dark").box(-6.25, FRONT, 6.5, -6, 6, 7.0, "dark")
        g.box(-6, 6, 6.5, 6, 6.25, 9.25, "dark")
    elif did == "monocle":
        g.box(-4.5, FRONT - 0.875, 3.5, -1.25, FRONT - 0.25, 7.5, "metal")
        g.cut(-4.0, FRONT - 1, 4.0, -1.75, FRONT, 7.0)
        g.new().box(-4.0, FRONT - 0.625, 4.0, -1.75, FRONT - 0.5, 7.0, "glass")
        g.new()
        for k in range(6):                                  # chain
            g.box(-4.5 + (k % 2) * 0.25, FRONT - 0.5, 3.5 - (k + 1) * 0.5, -4.25 + (k % 2) * 0.25, FRONT - 0.25, 3.5 - k * 0.5, "metal")
    elif did == "visor_scar":
        g.box(-5.75, FRONT - 0.625, 3.75, 5.75, FRONT, 7.0, "metal")              # eye-band implant with a slit
        g.new().box(-4.5, FRONT - 0.875, 4.75, 4.5, FRONT - 0.625, 5.75, "emit")
        g.new()
        for k in range(4):
            g.box(2.5 + k * 0.25, FRONT - RD, 7.0 + k * 0.5, 2.75 + k * 0.25, FRONT, 7.5 + k * 0.5, "accent")
            g.box(-3.0 + k * 0.25, FRONT - RD, 3.75 - k * 0.5, -2.75 + k * 0.25, FRONT, 4.0 - k * 0.5, "accent")
    elif did == "birthmark":
        for x, z, w, h in ((-4.75, 2.5, 1.0, 0.75), (-4.5, 3.25, 0.5, 0.25), (-5.0, 2.25, 0.5, 0.25), (-3.75, 2.75, 0.25, 0.25)):
            dot(x, z, "accent", w=w, h=h)
    return g
