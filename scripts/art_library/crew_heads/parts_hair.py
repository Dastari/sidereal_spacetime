"""Hairstyles as voxel brick islands around the shared skull (x -6..6, y -6..6, z 0..13; face at -Y).

Every style is a thin shell plus separately bevelled tufts, spikes, fringe strands and curtains, so the
bevel grooves between islands give the stepped strand read of the reference sheet. Each style exports
four variants, chosen at runtime by the most restrictive equipped headwear:
  full    - no headwear
  cap     - everything above z 9.5 removed (caps, hats, beanies sit on the skull from z 9.5 up)
  fringe  - only the forehead fringe (hoods, open helmets, pilot caps)
  (hidden - closed helmets: no hair node)
"""
from __future__ import annotations

import numpy as np

from vox import Grid

CAP_Z = 9.5


# =========================================================================== helpers
def hsh(*vals):
    v = np.int64(0x2545F491)
    for a in vals:
        v = (v ^ (np.asarray(a, dtype=np.int64) * np.int64(0x9E3779B1))) & np.int64(0x7FFFFFFF)
        v = (v * np.int64(1103515245) + np.int64(12345)) & np.int64(0x7FFFFFFF)
    return v


def jag(X, Y, amp, seed, step=1.0):
    """Per-column deterministic drop in {0, step, .., amp}."""
    if amp <= 0:
        return 0.0
    n = int(round(amp / step)) + 1
    ix = np.floor(X / step).astype(np.int64)
    iy = np.floor(Y / step).astype(np.int64)
    return (hsh(ix, iy, seed) >> 7) % n * step


def snap(v, s=0.25):
    return round(v / s) * s


def shell(g, t=1.0, top=1.25, front=10.0, side=7.25, back=3.0, burn=None, r=1.5, amp=0.5, seed=1, front_fn=None,
          side_t=None, back_t=None):
    """Hair cap hugging the skull. front/side/back are the hairline heights; burn the sideburn height."""
    st = t if side_t is None else side_t
    bt = t if back_t is None else back_t
    ztop = 13 + top + 0.5          # a little extra crown volume on every style

    def fn(X, Y, Z):
        ax, ay = np.abs(X), np.abs(Y)
        wx = 6 + st
        wy_back, wy_front = 6 + bt, 6 + t
        inside = (ax < wx) & (Y > -wy_front) & (Y < wy_back) & (Z < ztop)
        outside_skull = (ax > 6) | (ay > 6) | (Z > 13)
        ex = np.maximum(ax - (wx - r), 0)
        ey = np.maximum(np.where(Y < 0, -Y - (wy_front - r), Y - (wy_back - r)), 0)
        ez = np.maximum(Z - (ztop - r), 0)
        rounded = (ex + ey <= r) & (ex + ez <= r) & (ey + ez <= r)
        fz = front_fn(X) if front_fn else front
        zl = np.where(Y < -4.5, fz, np.where(Y < -1.25, burn if burn is not None else side,
                                             np.where(Y < 2.0, np.maximum(side, 7.0), back)))
        zl = zl + jag(X, Y, amp, seed)
        return inside & outside_skull & rounded & (Z >= zl)

    g.region(-6 - st, -6 - t, min(back, side, front) - 1, 6 + st, 6 + bt, ztop, fn, "hair", q=2.0)
    return g


def spike(g, cx, cy, z0, w, h, lean=(0.0, 0.0), d=None, taper=0.6, step=0.5):
    """Stepped tuft/spike: a stack of shrinking boxes, one brick island."""
    g.new()
    d = w if d is None else d
    n = max(1, int(round(h / step)))
    for k in range(n):
        f = k / n
        ww, dd = max(0.5, w * (1 - f * taper)), max(0.5, d * (1 - f * taper))
        x, y = cx + lean[0] * f * h, cy + lean[1] * f * h
        g.box(snap(x - ww / 2), snap(y - dd / 2), z0 + k * step, snap(x + ww / 2), snap(y + dd / 2), z0 + (k + 1) * step, "hair")
    return g


def tuft(g, x0, y0, z0, x1, y1, z1):
    g.new().box(snap(x0), snap(y0), snap(z0), snap(x1), snap(y1), snap(z1), "hair")
    return g


def fringe(g, cols, depth=0.75, top=13.0, y=-6.0):
    """Forehead strands: cols = [(x0, x1, z_bottom), ...], each its own island."""
    for x0, x1, zb in cols:
        g.new().box(snap(x0), y - depth, snap(zb), snap(x1), y, top, "hair")
    return g


def curtain(g, t, zbot, sides=True, back=True, front_y=-5.0, amp=1.0, seed=2, split=1.5, flare=0.0, ztop=12.5):
    """Hanging hair beside and behind the head, split into strand islands `split` voxels wide."""
    base = int(g.isl.max()) + 1

    def fn(X, Y, Z):
        ax = np.abs(X)
        tt = t + flare * np.clip((ztop - Z) / max(1e-6, ztop - zbot), 0, 1)
        side = sides & (ax >= 6) & (ax < 6 + tt) & (Y > front_y) & (Y < 6 + tt)
        bk = back & (Y >= 6) & (Y < 6 + tt) & (ax < 6 + tt)
        return (side | bk) & (Z >= zbot + jag(X, Y, amp, seed)) & (Z < ztop)

    g.region(-6 - t - flare, front_y, zbot - 1, 6 + t + flare, 6 + t + flare, ztop, fn, "hair")
    # relabel into strand islands so bevel grooves separate the strands
    sl = g._sl(-6 - t - flare, front_y, zbot - 1, 6 + t + flare, 6 + t + flare, ztop)
    sub = g.isl[sl]
    m = sub == g.cur
    X, Y, Z = g_centres(sl)
    col = np.where(np.abs(np.broadcast_to(X, sub.shape)) >= 6, np.floor(np.broadcast_to(Y, sub.shape) / split),
                   np.floor(np.broadcast_to(X, sub.shape) / split) + 100)
    sub[m] = (base + (col[m].astype(np.int64) % 97 + 97) % 97 + (np.sign(np.broadcast_to(X, sub.shape)[m]) > 0) * 200).astype(np.int16)
    g.cur = int(g.isl.max()) + 1
    return g


def g_centres(sl):
    """Design-unit centres of the cells in a slice."""
    from vox import LO, SUB, inv
    ax = [inv(LO[a] + (np.arange(sl[a].start, sl[a].stop) + 0.5) / SUB, a) for a in range(3)]
    return np.ix_(*ax)


def locs(g, spots, w=0.75):
    """Dreadlocks: (x, y, z_top, z_bottom) hanging columns, each its own island with a segment step."""
    for x, y, zt, zb in spots:
        g.new().box(snap(x - w / 2), snap(y - w / 2), snap(zb), snap(x + w / 2), snap(y + w / 2), snap(zt), "hair")
        mid = snap((zt + zb) / 2)
        g.box(snap(x - w / 2 - 0.25), snap(y - w / 2 - 0.25), mid, snap(x + w / 2 + 0.25), snap(y + w / 2 + 0.25), mid + 0.5, "hair")
    return g


def bun(g, cx, cy, z0, w, h):
    g.new().box(cx - w / 2, cy - w / 2, z0, cx + w / 2, cy + w / 2, z0 + h, "hair")
    g.cut(cx - w / 2, cy - w / 2, z0 + h - 0.5, cx - w / 2 + 0.5, cy + w / 2, z0 + h)
    g.cut(cx + w / 2 - 0.5, cy - w / 2, z0 + h - 0.5, cx + w / 2, cy + w / 2, z0 + h)
    g.cut(cx - w / 2, cy - w / 2, z0 + h - 0.5, cx + w / 2, cy - w / 2 + 0.5, z0 + h)
    g.cut(cx - w / 2, cy + w / 2 - 0.5, z0 + h - 0.5, cx + w / 2, cy + w / 2, z0 + h)
    g.new().box(cx - w / 2 + 0.5, cy - w / 2 - 0.25, z0 + 0.5, cx + w / 2 - 0.5, cy + w / 2 + 0.25, z0 + h - 0.75, "hair")
    return g


def curls(g, cells, size=1.5):
    """Curl blobs: small cubes, each an island, for curly textures."""
    for x, y, z in cells:
        g.new().box(snap(x - size / 2), snap(y - size / 2), snap(z - size / 2), snap(x + size / 2), snap(y + size / 2), snap(z + size / 2), "hair")
    return g


def curl_field(g, r_out, zmin, zmax, face_z, seed, size=1.5, pitch=1.5, top=None):
    """Scatter curl blobs over a rounded volume around the skull, keeping the face open."""
    pts = []
    top = top if top is not None else 13 + r_out - 6
    for ix in np.arange(-r_out, r_out + 1e-6, pitch):
        for iy in np.arange(-r_out, r_out + 1e-6, pitch):
            for iz in np.arange(zmin, top + 1e-6, pitch):
                # keep a shell: outer skin of a superellipsoid
                ex = abs(ix) / r_out
                ey = abs(iy) / r_out
                ez = max(0.0, (iz - 9.0)) / max(1e-6, top - 9.0)
                d = (ex ** 3 + ey ** 3 + ez ** 3)
                if not (0.55 < d <= 1.0):
                    continue
                if iy < -4.5 and iz < face_z and abs(ix) < 6.5:
                    continue
                if abs(ix) < 6.0 and iy < 6.0 and iz < 7.0 and iy > -1.5:
                    continue                                        # clear the ears
                h = int(hsh(int(ix * 4), int(iy * 4), int(iz * 4), seed) % 3)
                pts.append((ix + (h - 1) * 0.25, iy, iz + (h % 2) * 0.25))
    return curls(g, pts, size)


# =========================================================================== styles
def s_spiked_quiff():
    g = Grid("hair.spiked_quiff")
    shell(g, t=1.0, top=1.0, front=10.25, side=7.5, back=4.0, burn=6.5, seed=11)
    for k, (x, y, h, lx, ly) in enumerate([(-3.5, -4.5, 3.0, -0.2, -0.35), (-1.0, -5.0, 3.5, 0.0, -0.4), (1.5, -4.75, 3.25, 0.15, -0.35),
                                            (3.75, -4.25, 2.5, 0.3, -0.3), (-2.5, -1.5, 2.5, -0.1, 0.1), (0.5, -1.75, 2.75, 0.0, 0.1),
                                            (3.0, -1.0, 2.25, 0.2, 0.15), (-1.0, 1.5, 2.0, -0.1, 0.3), (2.0, 2.0, 1.75, 0.2, 0.35)]):
        spike(g, x, y, 13.5, 2.5, h, lean=(lx, ly))
    fringe(g, [(-4.5, -3.0, 9.5), (-3.0, -1.5, 10.0), (2.5, 4.0, 9.75)], depth=0.75)
    return g


def s_swept_quiff():
    g = Grid("hair.swept_quiff")
    shell(g, t=1.0, top=1.0, front=10.25, side=7.5, back=4.0, burn=7.0, seed=12, side_t=0.75)
    for k in range(5):                      # layered blades swept up and to the character's left (+X)
        x0 = -5.5 + k * 1.75
        tuft(g, x0, -7.25 + k * 0.25, 12.0 + k * 0.5, x0 + 3.0, -1.5, 14.75 + k * 0.4)
    spike(g, 4.0, -5.0, 14.5, 3.0, 2.0, lean=(0.5, -0.2))
    tuft(g, -6.25, -6.0, 13.0, 6.25, 6.25, 14.5)
    return g


def s_pompadour():
    g = Grid("hair.pompadour")
    shell(g, t=1.0, top=1.0, front=10.5, side=8.0, back=4.0, burn=6.5, seed=13, side_t=0.5)
    tuft(g, -5.5, -7.25, 12.0, 5.5, -2.5, 16.0)             # the roll
    g.cut(-5.5, -7.25, 15.5, 5.5, -6.75, 16.0)
    g.cut(-5.5, -7.25, 12.0, 5.5, -6.75, 12.5)
    tuft(g, -5.0, -2.5, 13.0, 5.0, 2.5, 15.25)
    tuft(g, -5.25, 2.5, 12.5, 5.25, 6.5, 14.5)
    spike(g, -2.0, -6.0, 16.0, 2.0, 1.0, lean=(0, -0.3))
    return g


def s_short_spikes():
    g = Grid("hair.short_spikes")
    shell(g, t=1.0, top=1.0, front=10.5, side=7.5, back=4.0, burn=6.5, seed=14)
    pts = [(x, y) for x in (-4.0, -1.5, 1.0, 3.5) for y in (-4.5, -1.5, 1.5, 4.25)]
    for i, (x, y) in enumerate(pts):
        h = 1.5 + (i * 7 % 4) * 0.5
        spike(g, x + (i % 2) * 0.5, y, 13.5, 2.0, h, lean=(0.15 * ((i % 3) - 1), -0.2 if y < 0 else 0.2))
    return g


def s_pointed_quiff():
    g = Grid("hair.pointed_quiff")
    shell(g, t=1.0, top=1.25, front=10.5, side=7.75, back=4.0, burn=6.5, seed=15)
    for x, h, lx in ((-3.5, 3.0, -0.3), (-0.75, 3.75, -0.05), (2.25, 3.25, 0.2), (4.5, 2.25, 0.4)):
        spike(g, x, -5.25, 14.0, 2.0, h, lean=(lx, -0.45), taper=0.75)
    tuft(g, -5.5, -3.0, 13.5, 5.5, 5.0, 15.0)
    return g


def s_short_waves():
    g = Grid("hair.short_waves")
    shell(g, t=1.25, top=1.25, front=10.0, side=7.5, back=3.5, burn=6.25, seed=16)
    for i, x in enumerate((-4.5, -2.0, 0.5, 3.0)):
        tuft(g, x - 0.25, -7.0, 13.0 + (i % 2) * 0.5, x + 2.25, -3.0, 15.0 + (i % 2) * 0.5)
        tuft(g, x, -3.0, 13.5, x + 2.25, 1.5, 15.0 - (i % 2) * 0.5)
    fringe(g, [(-5.0, -3.0, 9.5), (-3.0, -0.5, 10.0), (-0.5, 2.0, 9.75), (2.0, 4.5, 10.25)], depth=0.5)
    return g


def s_close_crop():
    g = Grid("hair.close_crop")
    shell(g, t=0.5, top=0.75, front=10.5, side=7.75, back=4.5, burn=7.0, amp=0.0, seed=17, r=1.0)
    tuft(g, -5.0, -6.5, 12.5, 5.0, 5.5, 14.0)
    g.cut(-5.0, -6.5, 13.75, 5.0, -6.0, 14.0)
    return g


def s_tall_crest():
    g = Grid("hair.tall_crest")
    shell(g, t=0.5, top=0.75, front=10.5, side=8.0, back=4.5, burn=7.0, amp=0.25, seed=18, r=1.0)
    for i, (y, h) in enumerate(((-5.25, 4.0), (-3.0, 4.5), (-0.5, 4.0), (2.0, 3.25), (4.25, 2.25))):
        spike(g, (-0.5 if i % 2 else 0.5), y, 13.25, 3.5, h, lean=(0.1 * (1 if i % 2 else -1), -0.15), d=2.5)
    return g


def s_mohawk():
    g = Grid("hair.mohawk")
    shell(g, t=0.25, top=0.25, front=10.5, side=8.0, back=4.5, burn=6.5, amp=0.0, seed=19, r=0.5)      # shaved sides
    for i, (y, h) in enumerate(((-5.5, 4.0), (-3.25, 5.0), (-1.0, 5.25), (1.25, 4.75), (3.5, 4.0), (5.5, 2.5))):
        spike(g, 0.0, y, 13.0, 2.0, h, d=2.0, taper=0.35, lean=(0, -0.05))
    return g


def s_side_undercut():
    g = Grid("hair.side_undercut")
    shell(g, t=0.25, top=0.25, front=10.5, side=8.0, back=4.5, amp=0.0, seed=20, r=0.5)
    tuft(g, -6.5, -7.0, 12.0, 7.0, 6.0, 14.5)                     # long top swept to the character's left (+X)
    for k in range(4):
        tuft(g, -5.5 + k * 3.0, -7.25, 13.0 + k * 0.5, -2.5 + k * 3.0, 2.0, 15.25 + k * 0.25)
    tuft(g, 5.5, -7.0, 9.0, 7.25, 1.0, 13.0)                      # overhang on the swept side
    fringe(g, [(2.0, 4.0, 9.75), (4.0, 6.0, 9.0)], depth=0.75, top=12.5, y=-7.0)
    return g


def s_hanging_locks():
    g = Grid("hair.hanging_locks")
    shell(g, t=1.0, top=1.5, front=10.0, side=7.5, back=4.0, seed=21)
    spots = []
    for i, x in enumerate(np.arange(-6.5, 6.6, 1.25)):
        spots.append((x, 6.75, 12.0, -2.5 - (i % 3) * 0.75))                      # back
    for i, y in enumerate(np.arange(-4.5, 6.0, 1.25)):
        for s in (-1, 1):
            spots.append((s * 6.75, y, 11.5, -1.0 - ((i + (s > 0)) % 3) * 0.75))  # sides
    for i, x in enumerate((-5.25, -4.0, 4.0, 5.25)):
        spots.append((x, -6.5, 11.5, 5.0 - (i % 2)))                               # face framing
    locs(g, spots, w=1.0)
    for i, x in enumerate(np.arange(-5.0, 5.1, 1.25)):
        tuft(g, x - 0.5, -6.75, 12.5 + (i % 2) * 0.5, x + 0.5, 6.0, 14.75 + (i % 2) * 0.5)
    return g


def s_flat_top():
    g = Grid("hair.flat_top")
    shell(g, t=0.5, top=0.75, front=10.5, side=8.0, back=4.5, burn=7.0, amp=0.0, seed=22, r=1.0)
    tuft(g, -6.0, -6.75, 12.0, 6.0, 6.0, 16.5)
    g.cut(-6.0, -6.75, 16.0, -5.5, 6.0, 16.5).cut(5.5, -6.75, 16.0, 6.0, 6.0, 16.5)
    for x in (-4.5, -1.5, 1.5, 4.5):                               # textured top ridges
        tuft(g, x - 1.0, -6.5, 16.5, x + 0.75, 5.5, 17.0)
    return g


def s_broad_spikes():
    g = Grid("hair.broad_spikes")
    shell(g, t=1.25, top=1.0, front=10.25, side=7.5, back=4.0, burn=6.5, seed=23)
    specs = [(-5.5, -3.0, -0.6, 0.0), (5.5, -3.0, 0.6, 0.0), (-5.0, 1.5, -0.6, 0.2), (5.0, 1.5, 0.6, 0.2), (-3.0, -5.0, -0.2, -0.4),
             (0.0, -5.25, 0.0, -0.45), (3.0, -5.0, 0.2, -0.4), (-2.0, -1.5, -0.2, 0.0), (2.0, -1.5, 0.2, 0.0), (0.0, 2.5, 0.0, 0.4),
             (-3.0, 4.0, -0.2, 0.5), (3.0, 4.0, 0.2, 0.5)]
    for i, (x, y, lx, ly) in enumerate(specs):
        spike(g, x, y, 13.25, 2.5, 2.25 + (i % 3) * 0.5, lean=(lx, ly))
    return g


def s_curly_top():
    g = Grid("hair.curly_top")
    shell(g, t=1.0, top=1.0, front=10.25, side=7.5, back=4.0, burn=6.5, seed=24, side_t=0.75)
    pts = []
    for ix in np.arange(-5.25, 5.3, 1.75):
        for iy in np.arange(-5.5, 5.6, 1.75):
            h = int(hsh(int(ix * 4), int(iy * 4), 24) % 3)
            pts.append((ix, iy, 14.5 + h * 0.5))
    for ix in np.arange(-4.5, 4.6, 1.5):
        pts.append((ix, -6.75, 12.0 + (int(ix * 2) % 2) * 0.5))
    curls(g, pts, 1.75)
    return g


def s_afro():
    g = Grid("hair.afro")
    shell(g, t=1.5, top=1.5, front=10.0, side=7.0, back=3.5, burn=6.0, seed=25)
    curl_field(g, 8.5, 5.0, 18.0, 10.0, 25, size=2.25, pitch=2.25, top=18.0)
    return g


# ----------------------------------------------------------------- medium / long / updo
def _bangs(g, pattern, depth=0.75, y=-6.0):
    fringe(g, pattern, depth=depth, top=12.75, y=y)


def s_side_bob():
    g = Grid("hair.side_bob")
    shell(g, t=1.0, top=1.25, front=10.0, side=4.0, back=2.0, burn=4.0, seed=31)
    curtain(g, 1.25, 2.5, front_y=-5.5, amp=1.0, seed=31, flare=0.5)
    _bangs(g, [(-5.75, -4.0, 8.0), (-4.0, -2.25, 8.75), (-2.25, -0.5, 9.25), (-0.5, 1.5, 9.75), (1.5, 3.5, 10.25), (3.5, 5.75, 9.0)])
    return g


def s_layered_bob():
    g = Grid("hair.layered_bob")
    shell(g, t=1.25, top=1.5, front=10.0, side=4.0, back=2.0, burn=4.0, seed=32)
    curtain(g, 1.0, 3.0, front_y=-5.25, amp=0.5, seed=32)
    curtain(g, 1.75, 6.0, front_y=-4.0, amp=1.0, seed=33, ztop=12.0)
    _bangs(g, [(-5.75, -3.75, 8.5), (-3.75, -1.0, 9.5), (1.0, 3.75, 9.5), (3.75, 5.75, 8.5)])
    return g


def s_straight_bob():
    g = Grid("hair.straight_bob")
    shell(g, t=1.0, top=1.25, front=10.0, side=4.0, back=2.0, burn=4.0, seed=34)
    curtain(g, 1.25, 1.5, front_y=-5.75, amp=0.5, seed=34)
    _bangs(g, [(-5.75, -3.5, 7.75), (-3.5, -1.25, 9.0), (-1.25, 1.0, 9.5), (1.0, 5.75, 10.25)])
    return g


def s_long_side_fringe():
    g = Grid("hair.long_side_fringe")
    shell(g, t=1.0, top=1.25, front=10.0, side=4.0, back=0.0, burn=4.0, seed=35)
    curtain(g, 1.25, -2.0, front_y=-5.75, amp=1.5, seed=35, flare=0.25)
    curtain(g, 1.25, -5.0, sides=False, amp=1.5, seed=36)
    _bangs(g, [(-5.75, -4.0, 6.5), (-4.0, -2.0, 8.0), (-2.0, 0.0, 9.0), (0.0, 2.25, 9.75), (2.25, 5.75, 10.5)])
    return g


def s_high_bun():
    g = Grid("hair.high_bun")
    shell(g, t=0.75, top=0.75, front=10.25, side=7.0, back=3.5, burn=6.0, amp=0.25, seed=37)
    bun(g, 0.0, 2.5, 13.25, 4.5, 3.5)
    locs(g, [(-5.75, -5.75, 10.5, 4.0), (5.75, -5.75, 10.5, 4.5)], w=0.75)
    _bangs(g, [(-4.5, -2.5, 9.75), (2.5, 4.5, 9.75)], depth=0.5)
    return g


def s_long_gathered():
    g = Grid("hair.long_gathered")
    shell(g, t=1.0, top=1.0, front=10.25, side=6.0, back=3.0, burn=5.0, seed=38)
    bun(g, 0.0, 3.5, 12.5, 4.0, 3.0)
    curtain(g, 1.0, 0.0, sides=False, amp=1.5, seed=38)
    locs(g, [(-6.0, -5.5, 11.0, 1.0), (-5.0, -6.25, 11.0, 3.0), (6.0, -5.5, 11.0, 0.5), (5.0, -6.25, 11.0, 2.5)], w=1.0)
    _bangs(g, [(-4.25, -2.0, 8.75), (-2.0, 0.25, 9.5), (0.25, 3.0, 9.25)])
    return g


def s_gathered_fringe():
    g = Grid("hair.gathered_fringe")
    shell(g, t=1.25, top=1.25, front=10.0, side=5.0, back=1.0, burn=4.5, seed=39)
    bun(g, -3.25, 3.0, 12.5, 3.5, 3.0)
    bun(g, 3.25, 3.0, 12.5, 3.5, 3.0)
    curtain(g, 1.25, -1.5, front_y=-4.5, amp=1.5, seed=39, flare=0.5)
    _bangs(g, [(-5.75, -3.25, 7.5), (-3.25, -0.75, 8.75), (-0.75, 1.75, 9.25), (1.75, 5.75, 8.25)])
    return g


def s_long_bob():
    g = Grid("hair.long_bob")
    shell(g, t=1.5, top=1.5, front=10.0, side=3.0, back=1.0, burn=3.0, seed=40)
    curtain(g, 1.5, 0.5, front_y=-5.5, amp=1.0, seed=40, flare=0.75)
    _bangs(g, [(-5.75, -3.75, 8.25), (-3.75, -1.25, 9.25), (-1.25, 1.25, 8.75), (1.25, 3.75, 9.25), (3.75, 5.75, 8.25)], depth=1.0)
    return g


def s_messy_bun():
    g = Grid("hair.messy_bun")
    shell(g, t=1.0, top=1.0, front=10.25, side=6.5, back=3.5, burn=5.5, seed=41)
    bun(g, 0.0, 0.5, 13.5, 4.5, 3.0)
    for x, y, h, lx in ((-1.5, -0.5, 1.5, -0.3), (1.75, 1.5, 1.25, 0.3), (0.25, 2.0, 1.5, 0.0)):
        spike(g, x, y, 16.25, 1.5, h, lean=(lx, 0.2))
    locs(g, [(-5.75, -5.5, 10.5, 3.0), (-4.75, -6.25, 10.5, 6.0), (5.75, -5.5, 10.5, 3.5)], w=0.75)
    _bangs(g, [(-4.0, -1.5, 9.0), (1.0, 3.5, 9.5)])
    return g


def s_blunt_bob():
    g = Grid("hair.blunt_bob")
    shell(g, t=1.25, top=1.25, front=10.0, side=3.0, back=1.5, burn=3.0, amp=0.0, seed=42)
    curtain(g, 1.25, 2.0, front_y=-6.0, amp=0.0, seed=42, split=2.0)
    _bangs(g, [(-5.75, -2.0, 9.0), (-2.0, 2.0, 9.0), (2.0, 5.75, 9.0)], depth=0.75)
    return g


def s_long_straight():
    g = Grid("hair.long_straight")
    shell(g, t=1.0, top=1.25, front=10.5, side=4.0, back=0.0, burn=4.0, seed=43)
    curtain(g, 1.25, -1.0, front_y=-5.75, amp=1.0, seed=43)
    curtain(g, 1.25, -4.5, sides=False, amp=1.0, seed=44)
    g.cut(-0.25, -7.5, 13.5, 0.25, 0.0, 15.0)                     # centre parting
    _bangs(g, [(-5.75, -3.0, 7.0), (3.0, 5.75, 7.0)])
    return g


def s_silver_bob():
    g = Grid("hair.silver_bob")
    shell(g, t=1.5, top=1.5, front=10.0, side=3.0, back=1.0, burn=3.0, seed=45)
    curtain(g, 1.5, 2.5, front_y=-5.5, amp=1.0, seed=45, flare=1.25)
    for s in (-1, 1):                                              # flicked-out ends
        for y in (-4.0, -1.0, 2.0, 5.0):
            a, b = sorted((s * 7.5, s * 8.75))
            tuft(g, a, y, 2.5, b, y + 1.75, 3.5)
    _bangs(g, [(-5.75, -3.5, 8.0), (-3.5, -1.0, 9.0), (-1.0, 1.5, 9.5), (1.5, 5.75, 8.5)], depth=1.0)
    return g


def s_topknot_sweep():
    g = Grid("hair.topknot_sweep")
    shell(g, t=0.75, top=0.75, front=10.5, side=7.5, back=4.0, burn=6.5, seed=46, side_t=0.5)
    bun(g, 0.5, 1.0, 13.25, 3.5, 3.0)
    tuft(g, -6.25, -7.0, 11.5, 2.5, -2.0, 14.25)
    fringe(g, [(-5.75, -3.5, 8.75), (-3.5, -1.25, 9.5)], depth=0.75, top=12.0, y=-6.75)
    return g


STYLES = {k[2:]: v for k, v in globals().items() if k.startswith("s_")}
NO_STRANDS = {"curly_top", "afro", "hanging_locks"}


def strandify(g, width=1.5, top_width=2.0, band=0.0, seed=7, lift_every=3):
    """Split the hair volume into strand bricks and lift some strands a quarter voxel outwards.

    Sides run vertical strands (binned along Y), front/back vertical strands binned along X, the crown
    is tiled. Every strand becomes its own bevelled island, so grooves read as locks of hair; lifted
    strands add the stepped, layered relief of the reference sheet.
    """
    from vox import LO, SUB, inv
    occ = g.isl > 0
    idx = np.argwhere(occ)
    if not len(idx):
        return g
    X, Y, Z = (inv(LO[a] + (idx[:, a] + 0.5) / SUB, a) for a in range(3))
    top = Z > 12.75
    side = ~top & (np.abs(X) - 0.5 >= np.abs(Y))
    fb = ~top & ~side
    bx = np.floor(X / width).astype(np.int64)
    by = np.floor(Y / width).astype(np.int64)
    tx = np.floor(X / top_width).astype(np.int64)
    ty = np.floor(Y / top_width).astype(np.int64)
    bz = np.floor(Z / band).astype(np.int64) if band else np.zeros_like(bx)
    sid = np.where(top, 1000 + tx * 37 + ty * 11, np.where(side, 5000 + by * 13 + np.sign(X).astype(np.int64) * 3 + bz * 101,
                                                           9000 + bx * 17 + np.sign(Y).astype(np.int64) * 5 + bz * 101))
    old = g.isl[occ].astype(np.int64)
    key = old * 100003 + sid
    _, inv = np.unique(key, return_inverse=True)
    g.isl[occ] = (inv + 1).astype(np.int16)
    # lift every n-th strand outwards by a quarter voxel (2 sub-cells), only into empty space
    lifted = (hsh(sid, seed) % lift_every) == 0
    step = SUB // 2
    for cond, axis, sgn in ((top, 2, 1), (side & (X > 0), 0, 1), (side & (X < 0), 0, -1), (fb & (Y > 0), 1, 1), (fb & (Y < 0) & (Z > 9.0), 1, -1)):
        sel = idx[lifted & cond].copy()
        if not len(sel):
            continue
        labels = g.isl[tuple(sel.T)]
        sel[:, axis] += sgn * step
        ok = (sel[:, axis] >= 0) & (sel[:, axis] < g.isl.shape[axis])
        sel, labels = sel[ok], labels[ok]
        free = g.isl[tuple(sel.T)] == 0
        sel, labels = sel[free], labels[free]
        g.isl[tuple(sel.T)] = labels
        g.slot[tuple(sel.T)] = 1
    g.cur = int(g.isl.max()) + 1
    return g


def puff(g, cells=4):
    """Grow every hair island outward by `cells` paint cells (0.5 voxel for 4) into empty space, keeping the skull
    and the face canvas clear: chunkier clumps, same silhouettes (owner: chunky clumped hair, not a thin slab)."""
    from vox import LO, SUB, inv
    for _ in range(cells):
        isl = g.isl
        grow = np.zeros_like(isl)
        for axis in range(3):
            for sh in (1, -1):
                src = np.roll(isl, sh, axis)
                take = (isl == 0) & (grow == 0) & (src > 0)
                grow[take] = src[take]
        idx = np.argwhere(grow > 0)
        if not len(idx):
            break
        X, Y, Z = (inv(LO[a] + (idx[:, a] + 0.5) / SUB, a) for a in range(3))
        inside_skull = (np.abs(X) < 6) & (np.abs(Y) < 6) & (Z > 0) & (Z < 13)
        face = (Y < -5.9) & (Z < 9.75) & (np.abs(X) < 5.9)
        keep = ~inside_skull & ~face
        idx = idx[keep]
        g.isl[tuple(idx.T)] = grow[tuple(idx.T)]
        g.slot[tuple(idx.T)] = 1
    return g


def hair_variants(hid):
    g = STYLES[hid]()
    puff(g)
    if hid not in NO_STRANDS:
        strandify(g, seed=len(hid))
    cap = g.copy(f"hair.{hid}.cap")
    cap.region(-12, -12, CAP_Z, 12, 12, 20, lambda X, Y, Z: Z > CAP_Z, "hair", cut=True)
    fr = g.copy(f"hair.{hid}.fringe")
    fr.region(-12, -12, -8, 12, 12, 20, lambda X, Y, Z: ~((Y < -5.5) & (Z < 11.5) & (np.abs(X) < 5.75)), "hair", cut=True)
    if fr.empty():
        fr.box(-4.5, -6.5, 10.0, 4.5, -6.0, 11.5, "hair")
    out = {"full": g, "cap": cap, "fringe": fr}
    for k, v in out.items():
        v.name = f"hair.{hid}.{k}"
    if cap.empty():
        cap.box(-6.25, -6.25, 8.75, 6.25, 6.25, 9.5, "hair")
    return out
