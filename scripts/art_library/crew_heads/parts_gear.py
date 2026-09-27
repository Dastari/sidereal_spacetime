"""Accessories, helmets (+ per-helmet visor variants) and breathing masks.

All in head space voxels (face at -Y, character right = -X). Hats that use hair mode `cap` sit on the
skull from z 9.5 up; the cap hair variant is cut at exactly that plane.
"""
from __future__ import annotations

import numpy as np

from vox import Grid

FRONT = -6.0


def rounded_box(g, x0, y0, z0, x1, y1, z1, slot, r=1.5, rz_top=None, rz_bottom=0.0, q=2.0):
    """Box with 45-degree stepped chamfers on vertical edges (r) and top edges (rz_top)."""
    rt = r if rz_top is None else rz_top

    def inset(X, Y, k):
        ex = np.maximum(np.maximum(x0 + k - X, X - (x1 - k)), 0)
        ey = np.maximum(np.maximum(y0 + k - Y, Y - (y1 - k)), 0)
        return ex, ey

    def fn(X, Y, Z):
        ex, ey = inset(X, Y, r)
        ok = (ex + ey <= r)
        if rt:
            tx, ty = inset(X, Y, rt)
            ok = ok & (np.maximum(tx, ty) + np.maximum(Z - (z1 - rt), 0) <= rt)
        if rz_bottom:
            bx, by = inset(X, Y, rz_bottom)
            ok = ok & (np.maximum(bx, by) + np.maximum(z0 + rz_bottom - Z, 0) <= rz_bottom)
        return ok & (X > x0) & (X < x1) & (Y > y0) & (Y < y1) & (Z > z0) & (Z < z1)

    g.region(x0, y0, z0, x1, y1, z1, fn, slot, q=q)
    return g


def ring_band(g, r_out, r_in, z0, z1, slot, rc=1.0):
    """Horizontal band around the head (square ring with chamfered corners)."""
    def fn(X, Y, Z):
        ax, ay = np.abs(X), np.abs(Y)
        outer = (ax < r_out) & (ay < r_out) & (np.maximum(ax - (r_out - rc), 0) + np.maximum(ay - (r_out - rc), 0) <= rc)
        inner = (ax < r_in) & (ay < r_in)
        return outer & ~inner & (Z >= z0) & (Z < z1)

    g.region(-r_out, -r_out, z0, r_out, r_out, z1, fn, slot, q=0.25)
    return g


def lens_pair(g, x_in, x_out, z0, z1, y_front, depth, frame_slot, lens_slot, frame=0.5, bridge=True):
    for s in (-1, 1):
        a, b = sorted((s * x_in, s * x_out))
        g.new().box(a, y_front, z0, b, y_front + depth, z1, frame_slot)
        if lens_slot:
            g.cut(a + frame, y_front, z0 + frame, b - frame, y_front + depth, z1 - frame)
            g.new().box(a + frame, y_front + 0.25, z0 + frame, b - frame, y_front + depth - 0.125, z1 - frame, lens_slot)
        else:
            g.cut(a + frame, y_front, z0 + frame, b - frame, y_front + depth, z1 - frame)
    if bridge:
        g.new().box(-x_in, y_front + 0.125, z1 - frame - 0.5, x_in, y_front + depth - 0.125, z1 - frame, frame_slot)
    return g


# =========================================================================== accessories
def acc_cap():
    g = Grid("acc.cap")
    rounded_box(g, -6.75, -6.75, 9.5, 6.75, 6.75, 14.25, "suit_primary", r=1.5, rz_top=1.5)
    g.paint(-7, -7, 9.5, 7, 7, 10.25, "suit_secondary")
    g.new().box(-5.0, -10.0, 9.5, 5.0, -6.75, 10.25, "suit_secondary")                 # bill
    g.cut(-5.0, -10.0, 9.5, -4.0, -9.0, 10.25, sym=True)
    g.new().box(-1.0, -7.0, 11.0, 1.0, -6.75, 12.75, "accent")                         # badge
    g.new().box(-0.5, -0.5, 14.25, 0.5, 0.5, 14.75, "suit_secondary")
    return g


def acc_beanie():
    g = Grid("acc.beanie")
    rounded_box(g, -7.0, -7.0, 10.5, 7.0, 7.0, 15.5, "suit_primary", r=2.0, rz_top=2.5)
    g.new()
    ring_band(g, 7.5, 6.0, 9.25, 11.25, "suit_secondary", rc=1.0)                       # folded cuff
    for x in np.arange(-7.0, 7.0, 1.0):                                               # knit ribs
        g.cut(x, -7.5, 9.25, x + 0.25, -7.25, 11.25)
        g.cut(x, 7.25, 9.25, x + 0.25, 7.5, 11.25)
    g.new().box(-1.0, -1.0, 15.5, 1.0, 1.0, 16.5, "suit_secondary")                    # pompom stub
    return g


def acc_headband():
    g = Grid("acc.headband")
    ring_band(g, 7.25, 6.0, 9.25, 10.75, "accent", rc=1.0)
    g.new().box(-1.0, 7.0, 9.0, 1.0, 8.25, 11.0, "suit_secondary")                     # knot
    g.new().box(-1.5, 7.5, 6.0, -0.5, 8.0, 9.0, "accent").box(0.5, 7.5, 6.5, 1.5, 8.0, 9.0, "accent")
    return g


def acc_pilot_hat():
    g = Grid("acc.pilot_hat")
    rounded_box(g, -7.0, -6.75, 9.75, 7.0, 7.0, 14.75, "suit_primary", r=1.5, rz_top=2.0)
    g.box(-7.0, -3.5, 2.5, -6.0, 5.5, 10.0, "suit_primary", sym=True)                 # ear flaps
    g.box(-7.0, 5.5, 3.0, 7.0, 7.0, 10.0, "suit_primary")
    g.cut(-7.0, -3.5, 2.5, -6.0, -2.5, 4.0, sym=True)
    g.new().box(-7.25, -2.5, 1.5, -6.25, 0.5, 3.0, "accent", sym=True)                # chin strap ends
    g.new().box(-6.25, -6.5, 1.25, 6.25, -5.75, 1.75, "accent")
    g.cut(-5.5, -6.5, 1.25, 5.5, -5.75, 1.75)
    lens_pair(g, 0.75, 3.75, 10.25, 12.75, -8.25, 1.5, "metal", "glass", frame=0.5)    # goggles on the brow
    g.new().box(-7.25, -6.75, 10.75, 7.25, -6.5, 11.75, "accent")
    return g


def acc_beret():
    g = Grid("acc.beret")
    ring_band(g, 6.75, 5.5, 9.5, 10.5, "suit_primary", rc=1.0)
    g.new()
    rounded_box(g, -7.0, -7.0, 10.5, 8.5, 6.75, 12.75, "suit_primary", r=2.0, rz_top=1.0)  # slouches to +X
    g.new().box(-2.0, -7.25, 10.75, 0.0, -6.75, 12.25, "accent")
    g.new().box(-0.5, -0.5, 12.75, 0.5, 0.5, 13.25, "suit_primary")
    return g


def acc_cowboy_hat():
    g = Grid("acc.cowboy_hat")
    rounded_box(g, -6.75, -6.5, 9.5, 6.75, 6.5, 16.0, "suit_primary", r=1.5, rz_top=1.0)
    g.cut(-0.75, -7, 15.0, 0.75, 7, 16.0)                                              # crown crease
    g.new()
    rounded_box(g, -10.5, -9.75, 9.5, 10.5, 9.75, 10.25, "suit_primary", r=3.0, rz_top=0)
    g.new().box(-10.5, -6.0, 10.25, -9.0, 6.0, 11.25, "suit_primary", sym=True)        # upturned sides
    g.new()
    ring_band(g, 7.0, 6.5, 10.25, 11.0, "dark", rc=1.0)
    return g


def acc_pirate_hat():
    g = Grid("acc.pirate_hat")
    rounded_box(g, -7.0, -7.0, 9.5, 7.0, 7.0, 14.0, "suit_primary", r=1.5, rz_top=1.5)
    g.new()
    for k in range(12):                                                                # front brim, peaked
        x0 = -8.5 + k * 1.5
        h = 16.5 - abs(x0 + 0.75) * 0.45
        g.box(x0, -8.5, 10.0, x0 + 1.5, -7.25, h, "suit_primary")
        g.box(x0, -8.75, h - 0.5, x0 + 1.5, -7.0, h, "accent")                         # gold edge
    g.new()
    for k in range(12):
        x0 = -8.5 + k * 1.5
        h = 15.0 - abs(x0 + 0.75) * 0.35
        g.box(x0, 7.0, 10.0, x0 + 1.5, 8.25, h, "suit_primary")
    g.new()                                                                            # skull & crossbones
    g.box(-1.25, -9.0, 12.5, 1.25, -8.5, 14.5, "metal").box(-0.75, -9.0, 12.0, 0.75, -8.5, 12.5, "metal")
    g.cut(-0.75, -9.0, 13.25, -0.25, -8.5, 13.75).cut(0.25, -9.0, 13.25, 0.75, -8.5, 13.75)
    g.box(-2.25, -9.0, 11.25, -1.25, -8.5, 11.75, "metal", sym=True).box(-2.25, -9.0, 14.75, -1.5, -8.5, 15.25, "metal", sym=True)
    return g


def acc_hood():
    g = Grid("acc.hood")
    rounded_box(g, -7.75, -7.5, -1.0, 7.75, 8.0, 16.0, "suit_secondary", r=2.5, rz_top=3.0)
    g.cut(-6.25, -6.75, -1.0, 6.25, 7.0, 13.75)                                          # hollow
    g.cut(-5.25, -8.0, -1.0, 5.25, -5.5, 10.25)                                          # face opening
    g.cut(-4.25, -8.0, 10.25, 4.25, -5.5, 11.0)
    g.new().box(-7.25, 7.5, 10.0, 7.25, 8.75, 16.75, "suit_secondary")                  # peak / drape
    g.cut(-7.25, 7.5, 15.5, -5.0, 8.75, 16.75, sym=True)
    g.new().box(-8.25, -5.0, -2.5, 8.25, 5.0, -1.0, "suit_secondary")                   # neck drape
    g.cut(-6.0, -5.0, -2.5, 6.0, 4.0, -1.0)
    return g


def _goggles(g, z0, z1, y0, strap_z, strap_r=7.25):
    lens_pair(g, 0.75, 4.25, z0, z1, y0, 1.5, "metal", "glass", frame=0.625)
    g.new()
    ring_band(g, strap_r, strap_r - 0.75, strap_z, strap_z + 1.0, "dark", rc=1.0)
    g.cut(-4.5, -strap_r - 1, strap_z, 4.5, -5.5, strap_z + 1.0)
    return g


def acc_goggles_up():
    g = Grid("acc.goggles_up")
    return _goggles(g, 10.0, 12.75, -8.5, 10.75, strap_r=7.5)


def acc_goggles_down():
    g = Grid("acc.goggles_down")
    return _goggles(g, 3.5, 7.5, -7.75, 5.0, strap_r=7.0)


def _frames(g, x_in, x_out, z0, z1, slot, lens=None, round_=False):
    y = FRONT - 1.0
    lens_pair(g, x_in, x_out, z0, z1, y, 0.5, slot, lens, frame=0.375)
    if round_:
        for s in (-1, 1):
            for xx in (x_in, x_out - 0.375):
                a, b = sorted((s * xx, s * (xx + 0.375)))
                g.cut(a, y, z0, b, y + 0.5, z0 + 0.375)
                g.cut(a, y, z1 - 0.375, b, y + 0.5, z1)
    g.new().box(-6.25, y + 0.25, z1 - 0.75, -6.0, 1.0, z1 - 0.375, slot, sym=True)       # temples to the ears
    g.box(-6.25, y + 0.25, z1 - 0.75, -x_out, y + 0.5, z1 - 0.375, slot, sym=True)
    return g


def acc_glasses():
    return _frames(Grid("acc.glasses"), 1.25, 4.5, 3.5, 7.25, "dark")


def acc_sunglasses():
    return _frames(Grid("acc.sunglasses"), 1.0, 4.75, 3.75, 7.0, "dark", lens="glass")


def acc_round_glasses():
    return _frames(Grid("acc.round_glasses"), 1.5, 4.25, 3.75, 7.0, "metal", round_=True)


def acc_headset():
    g = Grid("acc.headset")
    for s in (-1, 1):
        a, b = sorted((s * 6.5, s * 8.0))
        g.new().box(a, -2.0, 3.0, b, 2.0, 7.5, "suit_primary")
        a2, b2 = sorted((s * 7.75, s * 8.25))
        g.box(a2, -1.25, 3.75, b2, 1.25, 6.75, "dark")
    g.new()
    for k in range(10):                                                                # arched band
        z = 7.5 + k * 0.9
        x = 7.25 - max(0, k - 5) * 1.0
        g.box(-x - 0.75, -0.75, z, -x, 0.75, z + 0.9, "dark").box(x, -0.75, z, x + 0.75, 0.75, z + 0.9, "dark")
    g.box(-2.25, -0.75, 16.0, 2.25, 0.75, 16.75, "dark")
    g.box(-3.5, -0.75, 15.5, -2.25, 0.75, 16.25, "dark", sym=True)
    g.new().box(-7.25, -6.25, 3.5, -6.75, -2.0, 4.0, "dark")                           # mic boom
    g.box(-6.75, -6.75, 2.5, -4.25, -6.25, 3.0, "dark")
    g.new().box(-4.25, -7.0, 2.25, -3.25, -6.25, 3.25, "emit")
    return g


def acc_earring():
    g = Grid("acc.earring")
    g.box(6.25, 0.0, 2.25, 6.75, 0.75, 3.5, "metal")
    g.cut(6.25, 0.25, 2.5, 6.75, 0.5, 3.25)
    g.new().box(6.25, 0.25, 3.5, 6.75, 0.5, 3.75, "metal")
    return g


def acc_nose_ring():
    g = Grid("acc.nose_ring")
    g.box(0.25, -6.75, 2.75, 1.0, -6.25, 3.5, "metal")
    g.cut(0.5, -6.75, 3.0, 0.75, -6.25, 3.25)
    return g


def acc_cigar():
    g = Grid("acc.cigar")
    g.box(0.75, -7.25, 1.5, 4.0, -6.5, 2.25, "suit_secondary")
    g.new().box(4.0, -7.375, 1.375, 4.75, -6.375, 2.375, "dark")
    g.new().box(4.75, -7.25, 1.5, 5.0, -6.5, 2.25, "emit")
    g.new().box(1.5, -7.375, 1.375, 2.0, -6.375, 2.375, "accent")
    return g


def acc_mask():
    g = Grid("acc.mask")
    g.box(-5.25, FRONT - 1.0, 0.25, 5.25, FRONT, 4.25, "suit_primary")
    g.cut(-5.25, FRONT - 1.0, 0.25, -4.5, FRONT - 0.5, 1.0, sym=True)
    for z in (1.25, 2.25, 3.25):                                                       # pleats
        g.paint(-4.5, FRONT - 1.0, z, 4.5, FRONT - 0.75, z + 0.25, "suit_secondary")
    g.new().box(-6.25, -5.5, 3.25, -6.0, 0.5, 3.75, "suit_secondary", sym=True)         # ear loops
    g.box(-6.25, -5.5, 1.0, -6.0, -3.5, 3.25, "suit_secondary", sym=True)
    return g


def acc_respirator():
    g = Grid("acc.respirator")
    g.box(-3.75, FRONT - 1.25, 0.0, 3.75, FRONT, 4.25, "dark")
    g.cut(-3.75, FRONT - 1.25, 0.0, -2.75, FRONT - 0.5, 1.0, sym=True)
    g.new().box(-1.25, FRONT - 2.0, 0.75, 1.25, FRONT - 1.25, 2.75, "metal")           # front valve
    for z in (1.0, 1.75, 2.5):
        g.cut(-1.0, FRONT - 2.0, z, 1.0, FRONT - 1.75, z + 0.25)
    for s in (-1, 1):                                                                  # filter canisters
        a, b = sorted((s * 3.0, s * 5.25))
        g.new().box(a, FRONT - 2.25, -0.25, b, FRONT - 0.25, 2.25, "suit_secondary")
        a, b = sorted((s * 3.25, s * 5.0))
        g.new().box(a, FRONT - 2.5, 0.0, b, FRONT - 2.25, 2.0, "metal")
    g.new().box(-6.25, -5.5, 2.5, -6.0, 3.0, 3.25, "dark", sym=True)
    g.box(-6.0, 6.0, 2.5, 6.0, 6.25, 3.25, "dark")
    return g


def acc_scarf():
    g = Grid("acc.scarf")
    ring_band(g, 7.25, 3.0, -2.5, 0.75, "accent", rc=2.0)
    g.new()
    ring_band(g, 7.0, 3.0, 0.75, 1.5, "suit_secondary", rc=2.0)
    g.cut(-7.5, -7.5, 0.75, 7.5, -4.0, 1.5)
    g.new().box(2.0, -8.25, -6.0, 4.0, -7.0, -1.0, "accent")                          # hanging tail
    g.box(2.0, -8.25, -6.5, 2.5, -7.0, -6.0, "suit_secondary").box(3.0, -8.25, -6.5, 3.5, -7.0, -6.0, "suit_secondary")
    g.new().box(1.25, -8.0, -1.5, 4.25, -6.75, 0.5, "accent")                          # knot
    return g


def acc_officer_cap():
    g = Grid("acc.officer_cap")
    ring_band(g, 6.75, 5.5, 9.5, 11.75, "dark", rc=1.0)
    g.new()
    rounded_box(g, -7.75, -8.0, 11.75, 7.75, 7.25, 14.0, "suit_primary", r=2.0, rz_top=0.75)
    g.new().box(-5.0, -9.75, 9.5, 5.0, -6.75, 10.25, "dark")                           # peak
    g.cut(-5.0, -9.75, 9.5, -4.0, -9.0, 10.25, sym=True)
    g.new().box(-1.25, -8.25, 12.0, 1.25, -7.75, 13.75, "accent")                      # emblem
    g.new().box(-4.0, -7.0, 10.5, 4.0, -6.75, 11.0, "accent")                          # chin cord
    return g


def acc_hard_hat():
    g = Grid("acc.hard_hat")
    rounded_box(g, -7.0, -7.0, 10.25, 7.0, 7.0, 15.5, "suit_primary", r=2.0, rz_top=2.5)
    g.new().box(-1.0, -7.25, 13.0, 1.0, 7.25, 16.0, "suit_primary")                    # crest ridge
    g.cut(-1.0, -7.25, 15.5, 1.0, -6.25, 16.0).cut(-1.0, 6.25, 15.5, 1.0, 7.25, 16.0)
    g.new()
    ring_band(g, 8.0, 6.5, 9.5, 10.25, "suit_primary", rc=2.0)                          # brim
    g.new().box(-1.75, -9.0, 11.0, 1.75, -7.0, 13.5, "metal")                          # lamp
    g.new().box(-1.25, -9.25, 11.5, 1.25, -9.0, 13.0, "emit")
    return g


def acc_medic_cap():
    g = Grid("acc.medic_cap")
    rounded_box(g, -6.75, -6.75, 9.5, 6.75, 6.75, 13.75, "suit_primary", r=1.5, rz_top=1.5)
    g.new().box(-4.75, -7.25, 9.5, 4.75, -6.75, 11.0, "suit_primary")                  # front band
    g.new().box(-0.5, -7.5, 11.25, 0.5, -7.25, 13.75, "accent").box(-1.5, -7.5, 12.0, 1.5, -7.25, 13.0, "accent")
    return g


def acc_antennae():
    g = Grid("acc.antennae")
    for s in (-1, 1):
        a, b = sorted((s * 2.25, s * 2.75))
        g.new().box(a, -0.25, 12.5, b, 0.25, 17.0, "suit_secondary")
        a, b = sorted((s * 2.0, s * 3.0))
        g.new().box(a, -0.5, 17.0, b, 0.5, 18.0, "emit")
    return g


# =========================================================================== helmets
def helmet_shell(g, W=8.0, front=8.0, back=8.0, top=16.5, bottom=-0.5, r=2.5, rt=3.0, slot="suit_primary"):
    rounded_box(g, -W, -front, bottom, W, back, top, slot, r=r, rz_top=rt, rz_bottom=1.0)
    g.cut(-6.75, -front + 1.25, bottom - 1, 6.75, 7.0, 14.0)           # hollow so clear visors show the face
    g.new()
    ring_band(g, 6.75, 4.5, bottom - 0.75, bottom + 0.5, "metal", rc=1.5)   # neck seal
    return g


def window(g, rects, front):
    for x0, z0, x1, z1 in rects:
        g.cut(x0, -front - 1, z0, x1, -front + 1.5, z1)


def frame(g, rects, front, slot="accent", t=0.5, proud=0.25):
    g.new()
    for x0, z0, x1, z1 in rects:
        g.box(x0 - t, -front - proud, z0 - t, x1 + t, -front + 0.5, z1 + t, slot)
    for x0, z0, x1, z1 in rects:
        g.cut(x0, -front - proud - 0.1, z0, x1, -front + 0.5, z1)


HELMETS = {
    #            W     front back  top   bottom r    rt   window rects (x0, z0, x1, z1)
    "open":     (7.75, 7.75, 7.75, 16.0, 1.0, 2.5, 3.0, [(-5.5, 0.0, 5.5, 10.5)]),
    "closed":   (8.0, 8.0, 8.0, 16.5, -0.5, 3.0, 3.5, [(-5.0, 2.5, 5.0, 10.0)]),
    "tactical": (7.75, 8.0, 8.0, 16.0, -0.5, 1.5, 2.0, [(-5.0, 7.0, 5.0, 9.5), (-1.25, 3.5, 1.25, 7.0)]),
    "hazmat":   (8.5, 8.5, 8.0, 17.0, -0.5, 3.5, 4.0, [(-5.5, 1.5, 5.5, 10.5)]),
    "pilot":    (8.0, 8.25, 8.0, 16.75, -0.5, 2.5, 3.5, [(-5.5, 3.0, 5.5, 10.0)]),
    "mining":   (8.0, 8.0, 8.0, 16.5, -0.5, 2.5, 3.0, [(-5.0, 2.5, 5.0, 9.5)]),
    "security": (8.0, 8.0, 8.0, 16.25, -0.5, 2.0, 2.5, [(-4.5, 4.0, 4.5, 9.0)]),
    "explorer": (8.75, 8.75, 8.5, 17.5, -0.5, 4.0, 4.5, [(-5.5, 1.5, 5.5, 11.0)]),
    "engineer": (8.0, 8.0, 8.0, 16.5, -0.5, 2.5, 3.0, [(-5.0, 3.0, 5.0, 9.5)]),
}


def helmet(hid, visor_ids):
    W, front, back, top, bottom, r, rt, rects = HELMETS[hid]
    g = Grid(f"helmet.{hid}")
    helmet_shell(g, W, front, back, top, bottom, r, rt)
    if hid == "open":
        g.cut(-5.5, -front - 1, bottom - 1, 5.5, -3.0, 10.5)                           # open face
        g.cut(-6.75, -front - 1, bottom - 2, 6.75, -3.0, 2.0)
        for s in (-1, 1):                                                              # ear pods
            a, b = sorted((s * W, s * (W + 0.75)))
            g.new().box(a, -1.75, 3.5, b, 1.75, 7.5, "suit_secondary")
            a, b = sorted((s * (W + 0.75), s * (W + 1.0)))
            g.new().box(a, -1.0, 4.25, b, 1.0, 6.75, "accent")
        g.new().box(-1.25, -front + 1.5, top - 1.0, 1.25, back - 1.5, top + 0.25, "accent")   # crown stripe
        return g, {}
    window(g, rects, front)
    frame(g, rects, front, "accent" if hid in ("hazmat", "explorer", "tactical") else "suit_secondary",
          t=0.75 if hid == "hazmat" else 0.5, proud=0.5 if hid == "hazmat" else 0.25)
    if hid == "closed":
        g.new().box(-1.5, -6.0, top - 0.5, 1.5, 6.0, top + 0.25, "suit_secondary")
        for s in (-1, 1):
            a, b = sorted((s * W, s * (W + 0.5)))
            g.new().box(a, -2.0, 5.0, b, 2.0, 8.5, "suit_secondary")
            a, b = sorted((s * (W + 0.5), s * (W + 0.75)))
            g.new().box(a, -0.75, 6.0, b, 0.75, 7.5, "emit")
    elif hid == "tactical":
        for s in (-1, 1):
            a, b = sorted((s * (W - 0.25), s * (W + 1.0)))
            g.new().box(a, -3.0, 1.0, b, 3.0, 9.5, "suit_secondary")                  # comms blocks
            a, b = sorted((s * (W + 1.0), s * (W + 1.25)))
            g.new().box(a, -2.0, 7.5, b, -0.5, 8.5, "accent")
            a, b = sorted((s * 1.75, s * 6.5))
            g.new().box(a, -front - 0.75, 0.5, b, -front + 0.5, 3.5, "suit_secondary")  # cheek guards
        g.new().box(-2.0, -front - 0.5, 10.25, 2.0, 2.0, top - 0.5, "suit_secondary")
        g.new().box(-0.75, -front - 0.75, 11.0, 0.75, -front - 0.5, 12.0, "accent")
    elif hid == "hazmat":
        for s in (-1, 1):
            a, b = sorted((s * 3.5, s * 6.0))
            g.new().box(a, -front - 1.5, -0.5, b, -front + 1.0, 1.75, "accent")         # chin filters
            a, b = sorted((s * 4.0, s * 5.5))
            g.new().box(a, -front - 1.75, -0.25, b, -front - 1.5, 1.5, "metal")
    elif hid == "pilot":
        g.new().box(-2.0, -front - 0.25, 11.0, 2.0, back + 0.25, top + 0.25, "accent")   # racing stripe
        g.cut(-2.0, -front - 0.25, top - 0.75, 2.0, -front + 1.5, top + 0.25)
        for s in (-1, 1):
            a, b = sorted((s * 5.0, s * 7.25))
            g.new().box(a, -front - 0.75, 0.0, b, -front + 1.0, 2.5, "suit_secondary")   # oxygen ports
            a, b = sorted((s * 5.5, s * 6.75))
            g.new().box(a, -front - 1.0, 0.5, b, -front - 0.75, 2.0, "metal")
    elif hid == "mining":
        g.new().box(-2.0, -front - 1.75, 11.25, 2.0, -front + 1.0, 14.75, "suit_secondary")  # lamp housing
        g.new().box(-1.5, -front - 2.0, 11.75, 1.5, -front - 1.75, 14.25, "emit")
        ring_band(g.new(), W + 0.5, W - 0.5, 10.25, 11.0, "suit_secondary", rc=r)
        for s in (-1, 1):
            a, b = sorted((s * W, s * (W + 0.75)))
            g.new().box(a, -1.5, 4.0, b, 1.5, 7.0, "accent")
    elif hid == "security":
        g.new().box(-1.75, -front + 0.5, top - 0.75, 1.75, back - 0.5, top + 1.5, "accent")  # crest
        g.new().box(-1.25, -front + 0.25, top + 0.5, 1.25, -front + 1.0, top + 1.25, "emit")
        for s in (-1, 1):
            a, b = sorted((s * 2.0, s * 6.75))
            g.new().box(a, -front - 0.75, 0.0, b, -front + 0.5, 3.5, "suit_secondary")
            a, b = sorted((s * W, s * (W + 0.75)))
            g.new().box(a, -2.0, 4.5, b, 1.0, 8.0, "accent")
    elif hid == "explorer":
        g.new().box(-0.25, 2.0, top - 0.5, 0.25, 2.5, top + 2.5, "metal")              # antenna
        g.new().box(-0.5, 1.75, top + 2.5, 0.5, 2.75, top + 3.0, "emit")
        for s in (-1, 1):
            a, b = sorted((s * (W - 0.25), s * (W + 0.5)))
            g.new().box(a, -2.0, 4.0, b, 2.0, 8.0, "accent")
    elif hid == "engineer":
        for s in (-1, 1):
            a, b = sorted((s * W, s * (W + 1.25)))
            g.new().box(a, -2.25, 3.5, b, 2.25, 8.5, "suit_secondary")                  # ear muffs
            a, b = sorted((s * (W + 1.25), s * (W + 1.5)))
            g.new().box(a, -1.25, 5.0, b, 1.25, 7.0, "emit")
        for k in range(4):
            g.new().box(-2.5, -3.0 + k * 1.5, top - 0.25, 2.5, -2.5 + k * 1.5, top + 0.25, "metal")
    visors = {}
    for vid in visor_ids:
        v = Grid(f"visor.{hid}.{vid}")
        pane_y0, pane_y1 = -front + 0.25, -front + 0.625
        for x0, z0, x1, z1 in rects:
            v.box(x0, pane_y0, z0, x1, pane_y1, z1, "glass")
        x0, z0, x1, z1 = rects[0]
        if vid == "hud":
            v.new()
            for k in range(3):
                v.box(x0 + 1.0, pane_y0 - 0.125, z1 - 1.5 - k * 1.0, x0 + 1.0 + 2.5 - k * 0.75, pane_y0, z1 - 1.25 - k * 1.0, "emit")
            v.box(x1 - 3.0, pane_y0 - 0.125, z0 + 1.0, x1 - 1.0, pane_y0, z0 + 1.25, "emit")
            v.box(x1 - 3.0, pane_y0 - 0.125, z0 + 1.0, x1 - 2.75, pane_y0, z0 + 2.75, "emit")
            v.box(x1 - 1.25, pane_y0 - 0.125, z0 + 1.0, x1 - 1.0, pane_y0, z0 + 2.75, "emit")
        elif vid == "ar":
            v.new()
            cx, cz = x1 - 2.5, (z0 + z1) / 2 + 0.5
            v.box(cx - 1.25, pane_y0 - 0.125, cz - 1.25, cx + 1.25, pane_y0, cz - 1.0, "emit")
            v.box(cx - 1.25, pane_y0 - 0.125, cz + 1.0, cx + 1.25, pane_y0, cz + 1.25, "emit")
            v.box(cx - 1.25, pane_y0 - 0.125, cz - 1.0, cx - 1.0, pane_y0, cz + 1.0, "emit")
            v.box(cx + 1.0, pane_y0 - 0.125, cz - 1.0, cx + 1.25, pane_y0, cz + 1.0, "emit")
            v.box(cx - 0.25, pane_y0 - 0.125, cz - 0.25, cx + 0.25, pane_y0, cz + 0.25, "emit")
            v.box(x0 + 1.0, pane_y0 - 0.125, z0 + 1.0, x0 + 1.5, pane_y0, z0 + 1.5, "emit")
            v.box(x0 + 2.0, pane_y0 - 0.125, z0 + 1.0, x0 + 2.5, pane_y0, z0 + 1.5, "emit")
        visors[vid] = v
    return g, visors


# =========================================================================== masks
def mask(mid):
    g = Grid(f"mask.{mid}")
    if mid == "oxygen_mask":
        g.box(-3.0, FRONT - 1.5, 0.5, 3.0, FRONT, 4.5, "suit_primary")                  # cup over mouth & nose
        g.cut(-3.0, FRONT - 1.5, 0.5, -2.25, FRONT - 0.75, 1.25, sym=True)
        g.cut(-3.0, FRONT - 1.5, 3.75, -2.25, FRONT - 0.75, 4.5, sym=True)
        g.new().box(-3.25, FRONT - 1.0, 0.25, 3.25, FRONT - 0.5, 1.0, "accent")
        g.new().box(-1.0, FRONT - 2.5, 1.0, 1.0, FRONT - 1.5, 3.0, "metal")             # valve
        g.new().box(-0.75, FRONT - 2.75, 0.0, 0.75, FRONT - 1.5, 1.0, "dark")           # hose to the left
        for k in range(5):
            g.box(0.75 + k * 1.0, FRONT - 2.5 + k * 0.5, -0.75 - k * 0.5, 1.75 + k * 1.0, FRONT - 1.25 + k * 0.5, 0.5 - k * 0.5, "dark")
        g.new().box(5.5, -3.0, -3.5, 7.5, 0.0, -1.0, "accent")                          # small canister
        g.new().box(-6.25, -5.5, 3.5, -6.0, 2.0, 4.25, "dark", sym=True)
        g.box(-6.0, 6.0, 3.5, 6.0, 6.25, 4.25, "dark")
    elif mid == "rebreather":
        g.box(-4.0, FRONT - 1.75, 0.0, 4.0, FRONT, 4.75, "suit_primary")
        g.cut(-4.0, FRONT - 1.75, 0.0, -3.0, FRONT - 0.75, 1.0, sym=True)
        g.new().box(-1.75, FRONT - 2.75, 0.5, 1.75, FRONT - 1.75, 3.5, "dark")           # grille
        for z in (1.0, 1.75, 2.5):
            g.cut(-1.25, FRONT - 2.75, z, 1.25, FRONT - 2.5, z + 0.25)
        for s in (-1, 1):                                                              # twin cylinders
            a, b = sorted((s * 4.0, s * 7.0))
            g.new().box(a, FRONT - 3.0, -0.5, b, FRONT - 0.5, 2.5, "metal")
            a, b = sorted((s * 4.5, s * 6.5))
            g.new().box(a, FRONT - 3.25, 0.0, b, FRONT - 3.0, 2.0, "dark")
            a, b = sorted((s * 5.0, s * 6.0))
            g.new().box(a, FRONT - 3.5, 0.5, b, FRONT - 3.25, 1.5, "emit")
        g.new().box(-6.5, -5.5, 3.0, -6.0, 2.0, 4.0, "dark", sym=True)
        g.box(-6.0, 6.0, 3.0, 6.0, 6.5, 4.0, "dark")
    return g


ACCESSORIES = {k[4:]: v for k, v in globals().items() if k.startswith("acc_")}


def accessory(aid):
    return ACCESSORIES[aid]()
