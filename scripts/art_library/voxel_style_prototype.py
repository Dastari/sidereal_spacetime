"""Shipyard voxel-structure prototype, revision r003 (design evidence, not a production exporter).

Owner feedback on r002 was "I don't really see it". r002 also had no answer for
the bow/cockpit, or for the top-down flight view players spend most time in.

r003 follows the reference layer stack (`modular-spaceship-design.png`):
hull base -> floor grid -> interior walls -> wall ring -> roof cap. On top of
that it adds authored hero modules (bridge/cockpit nose, engines) that snap
onto the grammar.

Surface detail now comes from a small library of DESIGNED CASSETTES, not
noise. A cassette is a relief stamp: a handful of boxes in texel units, each
with depth, colour and emission.
- Wall-ring cassettes are packed along the hull perimeter in two staggered tiers.
- Roof cassettes are laid out as spine, side modules, bow and engineering roofs.
- Placement is deterministic and world-seeded.
- Every cassette box becomes its own brick, a rounded island after the offline bevel.

Two views are generated from the same cells:
- flight: full roof, the top-down view players fly in
- deck: cut-away shell (~2.5 m) and partitions (~1.9 m) for walking

Pipeline: AUTHOR -> SAMPLE (1/16 m) -> STYLE (cassettes, bricks) -> MESH.
Glass is always a real optical mesh.

Usage:
  blender -b -P scripts/art_library/voxel_style_prototype.py -- \
      --out /tmp/voxel-proto [--res 1672x941] [--samples 48] [--views all|flight|deck] [--no-render]
"""
import argparse
import bisect
import math
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

REVISION = "r003"
S = 1.0 / 16.0            # voxel edge (m) = 2 lattice units
FT, WT = 0.1875, 3.1875   # floor top / wall top (approved 3.5 m deck profile)
K_TOP = 55                # last row of the 3.5 m deck (roof/ring top)
K_SHELL_CUT = 40          # deck-view cut of ring + exterior wall (~2.5 m)
K_CUT = 30                # deck-view cut of partitions (~1.9 m)
TIERS = [(5, 29), (29, 49)]  # wall-ring cassette tiers (rows); skirt below, rim rail above
R2 = math.sqrt(2.0)

LIGHT = (0.46, 0.455, 0.46); LIGHT2 = (0.56, 0.555, 0.56); MID = (0.26, 0.26, 0.28)
CHAR = (0.028, 0.032, 0.058); GUN = (0.06, 0.066, 0.092); CRIM = (0.40, 0.022, 0.045)
CAV = (0.010, 0.010, 0.018); AMBER = (1.0, 0.42, 0.07); CYAN = (0.08, 0.55, 1.0)
FLOOR = (0.085, 0.09, 0.11); FLOOR2 = (0.065, 0.07, 0.085); WHITE = (0.70, 0.70, 0.72)


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--out", default="/tmp/voxel-proto")
    p.add_argument("--res", default="1672x941")
    p.add_argument("--samples", type=int, default=48)
    p.add_argument("--views", default="all")
    p.add_argument("--no-render", action="store_true")
    p.add_argument("--shots", default="", help="comma list of shot names to render (default: all)")
    return p.parse_args(argv)


def H(*a):
    """Deterministic integer hash -> [0, 1), seeded by world cells, never RNG state."""
    h = 2166136261
    for v in a:
        h = ((h ^ (int(v) & 0xFFFFFFFF)) * 16777619) & 0xFFFFFFFF
        h ^= h >> 13
    return (h % 100000) / 100000.0


def shade(c, f):
    return (c[0] * f, c[1] * f, c[2] * f)


def tint(c, h, amt=0.08):
    return shade(c, 1.0 - amt / 2 + amt * h)


# --------------------------------------------------------------------------- 1. AUTHOR
def footprint(d):
    """Wayfarer-like 25 x 10 m floor on the 1 m grid with a faceted 45-degree bow
    (the cockpit module's socket), offset by d (+out / -in)."""
    return [(-d, -d), (22 + d * R2 - d, -d), (25 + d, 3 + d - d * R2),
            (25 + d, 7 - d + d * R2), (22 + d * R2 - d, 10 + d), (-d, 10 + d)]


class Author:
    """Ordered layers; every object gets an id. Props/modules carry explicit colour."""

    def __init__(self, collection):
        self.col, self.objs = collection, []

    def _link(self, name, bm, role, **kw):
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new(name, me)
        self.col.objects.link(ob)
        spec = {"ob": ob, "role": role, "rgb": None, "emit": 0.0, "axis": None, "split": None, "centre": None}
        spec.update(kw)
        self.objs.append(spec)
        return ob

    def prism(self, name, pts, z0, z1, role, **kw):
        bm = bmesh.new()
        b = [bm.verts.new((x, y, z0)) for x, y in pts]
        t = [bm.verts.new((x, y, z1)) for x, y in pts]
        bm.faces.new(list(reversed(b)))
        bm.faces.new(t)
        for i in range(len(pts)):
            j = (i + 1) % len(pts)
            bm.faces.new((b[i], b[j], t[j], t[i]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return self._link(name, bm, role, **kw)

    def box(self, name, x0, y0, z0, x1, y1, z1, role="prop", **kw):
        return self.prism(name, [(x0, y0), (x1, y0), (x1, y1), (x0, y1)], z0, z1, role, **kw)

    def slab(self, name, p0, p1, thick, z0, z1, role="prop", **kw):
        """Thin wall between two plan points (faceted canopy frames/glass)."""
        dx, dy = p1[0] - p0[0], p1[1] - p0[1]
        L = math.hypot(dx, dy)
        nx, ny = -dy / L * thick / 2, dx / L * thick / 2
        pts = [(p0[0] - nx, p0[1] - ny), (p1[0] - nx, p1[1] - ny), (p1[0] + nx, p1[1] + ny), (p0[0] + nx, p0[1] + ny)]
        return self.prism(name, pts, z0, z1, role, **kw)

    def cyl_x(self, name, x0, x1, cy, cz, r, role="prop", seg=40, **kw):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r, radius2=r, depth=x1 - x0)
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, "Y"))
        bmesh.ops.translate(bm, verts=bm.verts, vec=((x0 + x1) / 2, cy, cz))
        kw.setdefault("centre", (cy, cz))
        return self._link(name, bm, role, **kw)


PARTITIONS = [(3, 0, 3, 10), (20, 0, 20, 10), (3, 4, 20, 4), (3, 6, 20, 6),
              (7, 6, 7, 10), (11, 6, 11, 10), (15, 6, 15, 10), (8, 0, 8, 4), (12, 0, 12, 4), (16, 0, 16, 4)]
DOORS = [("x", 3, 4), ("x", 20, 4), ("y", 6, 4), ("y", 6, 8), ("y", 6, 12), ("y", 6, 17),
         ("y", 4, 5), ("y", 4, 9), ("y", 4, 13), ("y", 4, 17)]


def author_section(a):
    # hull base + wall ring (1 m outside the tile edge) + roof cap, floor, inward exterior wall
    a.prism("ring_skirt", footprint(0.6875), 0.0, 0.3125, "hull")
    a.prism("ring", footprint(1.0), 0.3125, 3.5, "hull")
    a.prism("ring_void", footprint(0.0), FT, 4.0, "void")
    a.prism("floor", footprint(0.0), 0.0, FT, "floor")
    a.prism("wall_ext", footprint(0.0), FT, WT, "wall")
    a.prism("wall_void", footprint(-0.25), FT, 4.0, "void")
    a.prism("roof", footprint(0.0), WT, 3.5, "roof")
    h = 0.125
    for x0, y0, x1, y1 in PARTITIONS:
        if y0 == y1:
            a.box(f"part_{x0}_{y0}_{x1}", x0, y0 - h, FT, x1, y0 + h, WT, "partition", axis="x")
        else:
            a.box(f"part_{x0}_{y0}_{y1}", x0 - h, y0, FT, x0 + h, y1, WT, "partition", axis="y")
    for ax, c, f0 in DOORS:           # 2 m door modules: pillar jambs + 1.25 m clear opening
        for u0, u1 in ((f0, f0 + 0.375), (f0 + 1.625, f0 + 2.0)):
            if ax == "y":
                a.box(f"jamb_{c}_{f0}_{u0}", u0, c - 0.1875, FT, u1, c + 0.1875, WT, "pillar")
            else:
                a.box(f"jamb_{c}_{f0}_{u0}", c - 0.1875, u0, FT, c + 0.1875, u1, WT, "pillar")
        if ax == "y":
            a.box(f"door_{c}_{f0}", f0 + 0.375, c - 0.3, FT, f0 + 1.625, c + 0.3, 2.4375, "void")
        else:
            a.box(f"door_{c}_{f0}", c - 0.3, f0 + 0.375, FT, c + 0.3, f0 + 1.625, 2.4375, "void")
    author_cockpit(a)
    author_props(a)
    author_engines(a)


def author_cockpit(a):
    """Bridge/cockpit nose module, snapping to the bow socket (x >= 20): faceted
    canopy glass in the ring, frames, glazed roof and a lit sill."""
    zb, zt = 1.0625, 2.9375
    a.box("canopy_cut", 22.3, -2.0, zb, 27.0, 12.0, zt, "shellvoid")
    a.box("skylight_cut", 21.25, 3.0, WT - 0.1, 24.0, 7.0, 3.7, "shellvoid")
    mid = [(22.507, -0.2), (25.5, 2.793), (25.5, 7.207), (22.507, 10.2)]   # facet line at the ring mid-depth
    for n in range(3):
        a.slab(f"canopy_glass_{n}", mid[n], mid[n + 1], 0.06, zb, zt, "glass")
    for n, p in enumerate(mid):
        a.box(f"canopy_post_{n}", p[0] - 0.14, p[1] - 0.14, zb, p[0] + 0.14, p[1] + 0.14, zt, rgb=CHAR)
    for n in range(3):
        p0, p1 = mid[n], mid[n + 1]
        c = ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2)
        a.box(f"canopy_mullion_{n}", c[0] - 0.09, c[1] - 0.09, zb, c[0] + 0.09, c[1] + 0.09, zt, rgb=CHAR)
        a.slab(f"canopy_sill_{n}", p0, p1, 0.5, zb - 0.0625, zb + 0.0625, rgb=CYAN, emit=5.0)
        a.slab(f"canopy_head_{n}", p0, p1, 0.5, zt - 0.0625, zt + 0.0625, rgb=CHAR)
    a.box("skylight_glass", 21.25, 3.0, 3.375, 24.0, 7.0, 3.4375, "glass")
    for n, y in enumerate((3.0, 5.0, 7.0)):
        a.box(f"sky_bar_y{n}", 21.25, y - 0.09, 3.3125, 24.0, y + 0.09, 3.5625, rgb=CHAR)
    for n, x in enumerate((21.25, 22.625, 24.0)):
        a.box(f"sky_bar_x{n}", x - 0.09, 3.0, 3.3125, x + 0.09, 7.0, 3.5625, rgb=CHAR)
    a.box("sky_glow_s", 21.25, 2.875, 3.5625, 24.0, 3.0, 3.625, rgb=CYAN, emit=5.0)
    a.box("sky_glow_n", 21.25, 7.0, 3.5625, 24.0, 7.125, 3.625, rgb=CYAN, emit=5.0)


def author_props(a):
    W_ = (0.62, 0.62, 0.64); BLUE = (0.02, 0.13, 0.55); SOFA = (0.45, 0.03, 0.05); PINK = (0.60, 0.25, 0.35)
    LEAF = (0.05, 0.30, 0.04); SCREEN = (0.10, 0.60, 1.0)

    def at(ox, oy):
        def B(name, x0, y0, z0, x1, y1, z1, **kw):
            a.box(f"{name}@{ox},{oy}", x0 + ox, y0 + oy, z0, x1 + ox, y1 + oy, z1, **kw)
        return B

    B = at(3, 2)                        # crew quarters (3-7, 6-10) and lounge (7-11, 6-10)
    for n, z in enumerate((FT, 1.1875)):
        B(f"bunk{n}", 0.375, 6.5, z, 2.5, 7.625, z + 0.3125, rgb=W_)
        B(f"bunk{n}_m", 0.5, 6.5625, z + 0.3125, 2.375, 7.5625, z + 0.5, rgb=W_)
        B(f"bunk{n}_b", 0.5, 6.5625, z + 0.3125, 1.8125, 7.5625, z + 0.5625, rgb=BLUE)
        B(f"bunk{n}_p", 1.9375, 6.6875, z + 0.5, 2.3125, 7.4375, z + 0.625, rgb=W_)
    B("bunk_post_a", 0.375, 6.5, FT, 0.5625, 6.6875, 1.875, rgb=CHAR)
    B("bunk_post_b", 2.3125, 6.5, FT, 2.5, 6.6875, 1.875, rgb=CHAR)
    for n in range(3):
        x = 2.75 + n * 0.375
        B(f"locker_{n}", x, 7.3125, FT, x + 0.3125, 7.75, 2.0625, rgb=LIGHT)
        B(f"locker_{n}_l", x + 0.0625, 7.25, 1.5, x + 0.25, 7.3125, 1.625, rgb=AMBER, emit=6.0)
    B("sofa_base", 4.4375, 6.9375, FT, 7.3125, 7.75, 0.4375, rgb=SOFA)
    for n in range(4):
        x = 4.5 + n * 0.6875
        B(f"sofa_seat_{n}", x, 7.0, 0.4375, x + 0.625, 7.4375, 0.5625, rgb=SOFA)
        B(f"sofa_back_{n}", x, 7.4375, 0.4375, x + 0.625, 7.6875, 1.0, rgb=SOFA)
    B("sofa_arm", 4.4375, 5.8125, FT, 5.1875, 6.9375, 0.4375, rgb=SOFA)
    B("sofa_arm_seat", 4.5, 5.875, 0.4375, 4.9375, 6.9375, 0.5625, rgb=SOFA)
    B("sofa_arm_back", 4.4375, 5.8125, 0.4375, 4.6875, 6.9375, 1.0, rgb=SOFA)
    B("table", 5.5625, 5.875, 0.4375, 6.8125, 6.625, 0.5625, rgb=PINK)
    B("table_base", 5.75, 6.0625, FT, 6.625, 6.4375, 0.4375, rgb=CHAR)
    B("plant_pot", 7.25, 5.4375, FT, 7.75, 5.9375, 0.625, rgb=W_)
    for n, (dx, dy, z) in enumerate(((0, 0, 0.625), (-0.125, 0.0625, 0.8125), (0.125, -0.0625, 0.9375), (0, 0, 1.125))):
        B(f"plant_{n}", 7.25 + dx, 5.4375 + dy, z, 7.75 + dx, 5.9375 + dy, z + 0.25, rgb=tint(LEAF, H(n, 3), 0.4))
    B("neon", 5.375, 7.6875, 1.375, 6.625, 7.75, 2.625, rgb=(0.35, 0.08, 0.9), emit=3.5)
    B = at(0, 0)
    B("med_bed", 11.5, 7.5, FT, 13.4375, 9.5, 0.6875, rgb=W_)           # medbay (11-15, 6-10)
    B("med_sheet", 11.5625, 7.5625, 0.6875, 12.9375, 9.4375, 0.8125, rgb=CRIM)
    B("med_cab", 13.75, 9.25, FT, 14.6875, 9.6875, 2.125, rgb=LIGHT)
    B("med_screen", 13.8125, 9.1875, 1.25, 14.625, 9.25, 1.75, rgb=SCREEN, emit=4.0)
    for n in range(2):                                                  # galley (15-20, 6-10)
        y = 7.25 + n * 1.5
        B(f"galley_table_{n}", 16.0, y, 0.6875, 18.5, y + 0.75, 0.8125, rgb=W_)
        B(f"galley_leg_{n}", 17.0, y + 0.25, FT, 17.5, y + 0.5, 0.6875, rgb=CHAR)
        for m in range(3):
            B(f"stool_{n}_{m}", 16.25 + m * 0.8, y - 0.375, FT, 16.625 + m * 0.8, y - 0.0625, 0.5, rgb=(0.06, 0.2, 0.62))
    B("galley_counter", 19.0, 6.5, FT, 19.6875, 9.6875, 1.0, rgb=GUN)
    B("galley_top", 18.9375, 6.4375, 1.0, 19.75, 9.75, 1.0625, rgb=W_)
    crates = [(3.5, 0.5, FT, AMBER), (4.25, 0.5, FT, (0.06, 0.18, 0.55)), (3.5, 0.5, 0.9375, (0.06, 0.18, 0.55)),
              (5.0, 0.5, FT, LIGHT), (3.5, 1.25, FT, AMBER), (6.0, 0.5, FT, AMBER), (6.0, 0.5, 0.9375, LIGHT),
              (16.5, 0.5, FT, LIGHT), (17.25, 0.5, FT, AMBER), (18.25, 0.5, FT, (0.06, 0.18, 0.55)),
              (16.5, 0.5, 0.9375, AMBER), (18.25, 1.25, FT, LIGHT)]
    for n, (x, y, z, col) in enumerate(crates):                         # cargo (3-8) and storage (16-20)
        B(f"crate_{n}", x + 0.0625, y + 0.0625, z, x + 0.6875, y + 0.6875, z + 0.6875, rgb=tint(col, H(n, 9), 0.2))
        B(f"crate_{n}_band", x, y, z + 0.25, x + 0.75, y + 0.75, z + 0.4375, rgb=CHAR)
        B(f"crate_{n}_l", x + 0.25, y + 0.6875, z + 0.5, x + 0.5, y + 0.75, z + 0.5625, rgb=CYAN, emit=5.0)
    B("bench", 8.5, 0.375, FT, 11.5, 1.125, 0.875, rgb=GUN)             # workshop (8-12, 0-4)
    B("bench_top", 8.4375, 0.3125, 0.875, 11.5625, 1.1875, 0.9375, rgb=LIGHT)
    B("bench_tool", 9.0, 0.5, 0.9375, 9.5, 0.875, 1.1875, rgb=AMBER)
    B("bench_screen", 10.5, 0.375, 0.9375, 11.125, 0.4375, 1.4375, rgb=SCREEN, emit=4.0)
    B("fab", 8.5, 2.75, FT, 9.5, 3.625, 1.5, rgb=LIGHT)
    B("fab_screen", 8.625, 2.6875, 0.9375, 9.375, 2.75, 1.3125, rgb=AMBER, emit=4.0)
    for r in range(2):                                                  # hydroponics (12-16, 0-4)
        y = 0.5 + r * 1.75
        B(f"tray_{r}", 12.5, y, FT, 15.5, y + 0.75, 0.625, rgb=W_)
        B(f"tray_light_{r}", 12.5, y, 1.4375, 15.5, y + 0.75, 1.5, rgb=(0.8, 1.0, 0.7), emit=3.0)
        for n in range(8):
            x = 12.625 + n * 0.3625
            B(f"tray_{r}_p{n}", x, y + 0.125, 0.625, x + 0.25, y + 0.625, 0.875 + 0.0625 * (n % 2), rgb=tint(LEAF, H(n, r), 0.5))
    for n, (x0, y0, x1, y1, face) in enumerate(((23.25, 3.5, 23.75, 6.5, "x"), (21.0, 1.25, 22.25, 1.8125, "y+"),
                                                (21.0, 8.1875, 22.25, 8.75, "y-"))):   # bridge (20-25)
        B(f"console_{n}", x0, y0, FT, x1, y1, 0.9375, rgb=GUN)
        B(f"console_{n}_top", x0 - 0.0625, y0 - 0.0625, 0.9375, x1 + 0.0625, y1 + 0.0625, 1.0, rgb=LIGHT)
        if face == "x":
            B(f"console_{n}_scr", x0 + 0.0625, y0 + 0.125, 1.0, x0 + 0.25, y1 - 0.125, 1.5625, rgb=SCREEN, emit=4.5)
        elif face == "y+":
            B(f"console_{n}_scr", x0 + 0.125, y0 + 0.375, 1.0, x1 - 0.125, y0 + 0.5, 1.5, rgb=SCREEN, emit=4.5)
        else:
            B(f"console_{n}_scr", x0 + 0.125, y1 - 0.5, 1.0, x1 - 0.125, y1 - 0.375, 1.5, rgb=SCREEN, emit=4.5)
    B("seat_base", 22.125, 4.625, FT, 22.625, 5.375, 0.5, rgb=CHAR)
    B("seat_cushion", 22.0625, 4.5625, 0.5, 22.6875, 5.4375, 0.6875, rgb=GUN)
    B("seat_back", 21.9375, 4.5625, 0.6875, 22.1875, 5.4375, 1.5625, rgb=GUN)
    a.cyl_x("reactor", 0.5, 2.5, 5.0, 1.25, 0.8, rgb=GUN)             # engineering (0-3)
    for n, x in enumerate((0.75, 1.375, 2.0)):
        a.cyl_x(f"reactor_ring_{n}", x, x + 0.125, 5.0, 1.25, 0.9, rgb=CYAN, emit=5.0)
    for n, y in enumerate((1.0, 8.25)):
        B(f"eng_cab_{n}", 0.5, y, FT, 2.5, y + 0.75, 2.0, rgb=LIGHT)
        ly = y + 0.75 if n == 0 else y - 0.0625
        B(f"eng_cab_{n}_l", 0.75, ly, 1.25, 2.25, ly + 0.0625, 1.375, rgb=AMBER, emit=5.0)
    for x in range(4, 20, 2):
        B(f"corr_l_s_{x}", x, 4.1875, FT, x + 0.5, 4.3125, 0.25, rgb=AMBER, emit=6.0)
        B(f"corr_l_n_{x}", x, 5.6875, FT, x + 0.5, 5.8125, 0.25, rgb=AMBER, emit=6.0)


def author_engines(a):
    """Engine modules on rear hardpoints: boxy housing, louvred top in an orange
    frame, crimson band, charcoal collar and a stepped nozzle bell."""
    for n, (cy, w, h, x0) in enumerate(((2.25, 2.75, 2.4, -5.0), (7.75, 2.75, 2.4, -5.0), (5.0, 1.5, 1.4, -4.0))):
        y0, y1, z0 = cy - w / 2, cy + w / 2, 0.35
        z1, zc = z0 + h, z0 + h / 2
        a.box(f"eng{n}_house", x0, y0, z0, -0.75, y1, z1, rgb=LIGHT, split=0.75)
        a.box(f"eng{n}_band", -2.0, y0 - 0.0625, z0 - 0.0625, -1.5, y1 + 0.0625, z1 + 0.0625, rgb=CRIM)
        a.box(f"eng{n}_louvre_bed", x0 + 0.5, y0 + 0.375, z1, -2.25, y1 - 0.375, z1 + 0.0625, rgb=CAV)
        for m in range(int((-2.25 - x0 - 0.5) / 0.1875)):
            x = x0 + 0.5625 + m * 0.1875
            a.box(f"eng{n}_slat_{m}", x, y0 + 0.4375, z1, x + 0.0625, y1 - 0.4375, z1 + 0.125, rgb=LIGHT2)
        for side, yy in (("a", y0 + 0.3125), ("b", y1 - 0.375)):
            a.box(f"eng{n}_frame_{side}", x0 + 0.4375, yy, z1, -2.1875, yy + 0.0625, z1 + 0.125, rgb=AMBER, emit=2.5)
        a.box(f"eng{n}_side_l", -2.75, y0 - 0.0625, zc - 0.25, -2.5, y0, zc + 0.25, rgb=AMBER, emit=6.0)
        a.box(f"eng{n}_side_r", -2.75, y1, zc - 0.25, -2.5, y1 + 0.0625, zc + 0.25, rgb=AMBER, emit=6.0)
        a.box(f"eng{n}_collar", x0 - 0.375, y0 - 0.1875, z0 - 0.1875, x0, y1 + 0.1875, z1 + 0.1875, rgb=CHAR)
        r = min(w, h) / 2 * 0.92
        a.cyl_x(f"eng{n}_bell", x0 - 1.25, x0 - 0.375, cy, zc, r, "nozzle")
        a.cyl_x(f"eng{n}_glow", x0 - 1.375, x0 - 1.25, cy, zc, r * 0.8, rgb=(0.15, 0.5, 1.0), emit=20.0)


# --------------------------------------------------------------------------- 2. SAMPLE
def voxelize(objs):
    dg = bpy.context.evaluated_depsgraph_get()
    occ = {}
    for oid, spec in enumerate(objs):
        role = spec["role"]
        if role == "glass":
            continue
        ob = spec["ob"]
        bm = bmesh.new()
        bm.from_object(ob, dg)
        bm.transform(ob.matrix_world)
        bvh = BVHTree.FromBMesh(bm)
        xs = [v.co.x for v in bm.verts]; ys = [v.co.y for v in bm.verts]; zs = [v.co.z for v in bm.verts]
        bm.free()
        under = role in ("partition", "pillar")       # interior structure never overrides the shell
        for i in range(math.floor(min(xs) / S), math.ceil(max(xs) / S)):
            x = (i + 0.5) * S
            for j in range(math.floor(min(ys) / S), math.ceil(max(ys) / S)):
                y = (j + 0.5) * S
                hits, oz = [], min(zs) - 0.25
                for _ in range(8):
                    loc, _n, _i, _d = bvh.ray_cast(Vector((x, y, oz)), Vector((0, 0, 1)), 50.0)
                    if loc is None:
                        break
                    hits.append(loc.z)
                    oz = loc.z + 1e-6
                for q in range(0, len(hits) - 1, 2):
                    za, zb = hits[q], hits[q + 1]
                    for k in range(math.floor(za / S), math.ceil(zb / S)):
                        if not za <= (k + 0.5) * S <= zb:
                            continue
                        p = (i, j, k)
                        prev = occ.get(p)
                        if role == "void":
                            occ.pop(p, None)
                        elif role == "shellvoid":
                            if prev is not None and objs[prev]["role"] in ("hull", "wall", "roof"):
                                del occ[p]
                        elif under:
                            if prev is None or objs[prev]["role"] not in ("hull", "wall"):
                                occ[p] = oid
                        else:
                            occ[p] = oid
    return occ


# --------------------------------------------------------------------------- 3. STYLE: cassettes
def cassette(kind, w, h, seed):
    """Designed wall-ring relief stamp, in texels: boxes (u0, v0, u1, v1, depth, rgb, emit).
    Later boxes win. depth = voxels proud of the surface (negative = recessed)."""
    col = LIGHT2 if H(seed, 1) < 0.4 else LIGHT
    if kind == "panel":
        return [(0, 0, w, h, 2, col, 0), (3, 3, w - 3, h - 3, 1, shade(col, 0.88), 0),
                (w - 6, h - 6, w - 4, h - 4, 3, GUN, 0), (4, h - 6, 6, h - 4, 3, GUN, 0)]
    if kind == "grille":
        g = min(w - 6, max(10, int(w * 0.6)))
        boxes = [(0, 0, w, h, 2, col, 0), (w - g - 3, 3, w - 3, h - 3, -1, CAV, 0)]
        boxes += [(w - g - 2, v, w - 4, v + 1, 1, CHAR, 0) for v in range(4, h - 4, 2)]
        if H(seed, 2) < 0.6:
            boxes.append((3, h - 7, 5, h - 5, 3, AMBER, 6.0))
        return boxes
    if kind == "hatch":
        return [(0, 0, w, h, 2, GUN, 0), (2, 1, w - 2, h - 1, 4, CRIM, 0), (4, 3, w - 4, h - 3, 3, shade(CRIM, 0.8), 0),
                (w // 2 - 4, h // 2 - 1, w // 2 + 4, h // 2 + 1, 5, GUN, 0), (5, h - 7, 7, h - 5, 5, AMBER, 7.0)]
    if kind == "light":
        lc = CYAN if H(seed, 3) < 0.55 else AMBER
        return [(0, 0, w, h, 2, CHAR, 0), (3, h // 2 - 3, w - 3, h // 2 + 3, 3, GUN, 0),
                (5, h // 2 - 1, w - 5, h // 2 + 1, 4, lc, 8.0)]
    if kind == "stack":
        return [(0, 0, w, h // 2, 3, col, 0), (0, h // 2, w, h, 2, shade(col, 0.9), 0),
                (w - 8, 3, w - 3, 8, 5, GUN, 0), (w - 7, 4, w - 4, 6, 6, AMBER, 6.0),
                (3, h // 2 + 3, max(6, w // 3), h - 3, 3, GUN, 0)]
    if kind == "logo":
        return [(0, 0, w, h, 2, CHAR, 0), (3, 3, w - 3, h - 3, 3, GUN, 0)]
    return [(0, 0, w, h, 2, GUN, 0), (3, 3, w - 3, h - 3, 1, CHAR, 0)]      # dark


RING_KINDS = {0: [("panel", .26), ("grille", .20), ("hatch", .12), ("light", .12), ("stack", .16), ("logo", .14)],
              1: [("panel", .30), ("grille", .14), ("light", .20), ("stack", .22), ("dark", .14)]}


def pick_kind(table, h, w):
    acc = 0.0
    for kind, wt in table:
        acc += wt
        if h < acc:
            return "panel" if (kind == "logo" and w < 32) else kind
    return table[0][0]


class Packer:
    """Deterministic 1D packing of cassette widths along a parameter (texels)."""

    def __init__(self, length, widths, seed, offset=0):
        self.starts, s = [], -offset - 64
        while s < length + 64:
            self.starts.append(s)
            s += widths[int(H(s + 1000, seed) * len(widths))]

    def at(self, t):
        ix = bisect.bisect_right(self.starts, t) - 1
        return ix, t - self.starts[ix], self.starts[ix + 1] - self.starts[ix]


class Perimeter:
    """Arc length and signed distance along the floor boundary: cassettes follow facets and curves."""

    def __init__(self, poly):
        self.segs, acc = [], 0.0
        for q in range(len(poly)):
            p, r = poly[q], poly[(q + 1) % len(poly)]
            L = math.hypot(r[0] - p[0], r[1] - p[1])
            self.segs.append((p, r, L, acc))
            acc += L
        self.length, self.cache = acc, {}

    def info(self, i, j):
        v = self.cache.get((i, j))
        if v is None:
            x, y = (i + 0.5) * S, (j + 0.5) * S
            best, bs, inside = 1e9, 0.0, True
            for p, r, L, a0 in self.segs:
                dx, dy = r[0] - p[0], r[1] - p[1]
                if dx * (y - p[1]) - dy * (x - p[0]) < 0:
                    inside = False
                t = max(0.0, min(1.0, ((x - p[0]) * dx + (y - p[1]) * dy) / (L * L)))
                dd = math.hypot(x - (p[0] + t * dx), y - (p[1] + t * dy))
                if dd < best:
                    best, bs = dd, a0 + t * L
            v = self.cache[(i, j)] = (bs, best if not inside else -best)
        return v


ROOF_SIDE = [("roofbox", .28), ("stack", .22), ("crimson", .14), ("greeble", .22), ("roofvent", .14)]


def roof_module(i, j, packers):
    """Roof cap layout for the top-down flight view, in texels: engineering roof,
    charcoal spine (logo, hazard row, vents), packed side modules, bow plates."""
    x, y = i * S, j * S
    if x >= 20.0:
        ix, u, w = packers["bow"].at(j + 16)
        return ("bow", ix), ("panel" if H(ix, 5) < 0.6 else "grille"), w, 48, u, i - 320
    if x < 3.0:
        ix, u, w = packers["eng"].at(j + 16)
        return ("eng", ix), ("roofvent" if H(ix, 6) < 0.55 else "dark"), w, 64, u, i + 16
    if 3.5 <= y < 6.5:
        ix, u, w = packers["spine"].at(i - 48)
        return ("spine", ix), "spine", w, 48, u, j - 56
    side = 0 if y < 3.5 else 1
    ix, u, w = packers[f"side{side}"].at(i + 16)
    v = (55 - j) if side == 0 else (j - 104)
    return (f"side{side}", ix), pick_kind(ROOF_SIDE, H(ix, side, 17), w), w, 72, u, v


def roof_cassette(kind, w, h, seed):
    if kind == "spine":
        boxes = [(0, 0, w, h, 0, CHAR, 0), (1, 1, w - 1, h - 1, 1, GUN if H(seed, 1) < 0.5 else CHAR, 0)]
        if H(seed, 2) < 0.5:
            boxes += [(4, 0, w - 4, 2, 1, CYAN, 6.0), (4, h - 2, w - 4, h, 1, CYAN, 6.0)]
        if H(seed, 3) < 0.35:
            boxes += [(u, 6, u + 5, 10, 2, WHITE, 0) for u in range(4, w - 6, 8)]           # hazard blocks
        if H(seed, 4) < 0.25:
            boxes += [(6, 14, w - 6, h - 14, -1, CAV, 0)] + [(7, v, w - 7, v + 1, 0, GUN, 0) for v in range(15, h - 15, 2)]
        elif H(seed, 5) < 0.45:                                                             # hatch / access plate
            boxes += [(8, 12, w - 8, h - 12, 2, GUN, 0), (10, 14, w - 10, h - 14, 1, CHAR, 0), (w - 12, h - 16, w - 10, h - 14, 3, AMBER, 5.0)]
        return boxes
    if kind == "logo":
        boxes = [(0, 0, w, h, 1, CHAR, 0)]
        cu, cv = w // 2, h // 2
        for u in range(w):                     # planet-and-ring mark, voxelised
            for v in range(h):
                du, dv = u - cu, v - cv
                ring = abs((du / 18.0) ** 2 + (dv / 7.0) ** 2 - 1.0) < 0.18 and (dv < -2 or abs(du) > 10)
                if du * du + dv * dv <= 100:
                    boxes.append((u, v, u + 1, v + 1, 2, WHITE, 0))
                elif ring:
                    boxes.append((u, v, u + 1, v + 1, 2, CRIM, 1.5))
        return boxes
    if kind == "roofbox":
        g = int(w * (0.45 if H(seed, 9) < 0.5 else 0.3))
        return [(1, 1, w - 1, h - 1, 3, LIGHT, 0), (w - g - 4, 8, w - 4, h - 10, 1, CAV, 0)] + \
               [(w - g - 3, v, w - 5, v + 1, 2, CHAR, 0) for v in range(9, h - 11, 2)] + \
               [(4, h - 5, 7, h - 3, 4, AMBER, 6.0), (4, 4, 12, 12, 5, LIGHT2, 0)]
    if kind == "crimson":
        return [(1, 1, w - 1, h - 1, 2, LIGHT, 0), (4, 6, w - 4, h - 12, 7, CRIM, 0),
                (6, 8, w - 6, h - 14, 6, shade(CRIM, 0.8), 0), (6, h - 8, 9, h - 5, 4, CYAN, 7.0)]
    if kind == "greeble":
        boxes = [(1, 1, w - 1, h - 1, 2, GUN, 0)]
        for n in range(6):
            u = 3 + int(H(seed, n, 1) * (w - 14)); v = 3 + int(H(seed, n, 2) * (h - 16))
            boxes.append((u, v, u + 5 + n % 3 * 2, v + 5 + n % 2 * 3, 3 + n % 4, LIGHT2 if n % 2 else LIGHT, 0))
        boxes += [(w // 2, h // 2, w // 2 + 2, h // 2 + 2, 10, CHAR, 0), (4, h - 5, 7, h - 3, 3, AMBER, 6.0)]
        return boxes
    if kind == "roofvent":
        return [(1, 1, w - 1, h - 1, 2, GUN, 0), (4, 6, w - 4, h - 10, -1, CAV, 0)] + \
               [(5, v, w - 5, v + 1, 1, CHAR, 0) for v in range(7, h - 11, 2)] + [(4, h - 5, 7, h - 3, 3, AMBER, 6.0)]
    return cassette(kind, w, h, seed)


def style(occ, objs, per, view):
    """Cell -> (r, g, b, emission, brick). view: 'flight' (roofed) or 'deck' (cut-away)."""
    deck = view == "deck"
    out, add, carve, cav = {}, {}, set(), {}
    ring_stamps, roof_stamps = {}, {}
    plen = int(per.length / S)
    ring_pack = [Packer(plen, [16, 32, 32, 48], 101), Packer(plen, [16, 24, 32, 48], 202, offset=8)]
    rim_pack = Packer(plen, [16, 16, 24], 303)
    packers = {"spine": Packer(400, [32, 32, 48], 404), "side0": Packer(400, [32, 48, 48, 64], 505),
               "side1": Packer(400, [32, 48, 48, 64], 606), "bow": Packer(200, [24, 32], 707), "eng": Packer(200, [32, 48], 808)}
    logo_ix = packers["spine"].at(int(11.5 / S) - 48)[0]

    def outward(i, j, k, sd):
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            if (i + dx, j + dy, k) not in occ and per.info(i + dx, j + dy)[1] > sd:
                return dx, dy
        return None

    def apply(hit, p, normal, brick, bed, cavkey):
        d, rgb, e, n = hit
        i, j, k = p
        nx, ny, nz = normal
        if d < 0:
            carve.add(p)
            cav[(i - nx, j - ny, k - nz)] = (*rgb, 0.0, cavkey)
            return
        out[p] = (*(rgb if d == 0 else CHAR), e if d == 0 else 0.0, brick if d == 0 else bed)
        for z in range(1, d + 1):
            add[(i + nx * z, j + ny * z, k + nz * z)] = (*rgb, e if z == d else 0.0, brick)

    def lookup(cache, key, maker, kind, w, h, u, v, seed):
        boxes = cache.get(key)
        if boxes is None:
            boxes = cache[key] = maker(kind, w, h, seed)
        hit = None
        for n, (u0, v0, u1, v1, d, rgb, e) in enumerate(boxes):
            if u0 <= u < u1 and v0 <= v < v1:
                hit = (d, rgb, e, n)
        return hit

    for (i, j, k), oid in occ.items():
        spec = objs[oid]
        role = spec["role"]
        if deck and (role in ("hull", "wall", "roof") or (role == "prop" and k > 52)) and k > K_SHELL_CUT:
            continue                                   # deck-view cut-away (presentation only)
        if role in ("hull", "roof") and not deck and k == K_TOP and (i, j, k + 1) not in occ:
            key, kind, w, h, u, v = roof_module(i, j, packers)
            if key == ("spine", logo_ix):
                kind = "logo"
            hit = lookup(roof_stamps, (key, kind), roof_cassette, kind, w, h, u, v, key[1] * 31 + len(key[0]))
            if hit is None:
                out[(i, j, k)] = (*CHAR, 0.0, ("roofgap", key))
            else:
                apply(hit, (i, j, k), (0, 0, 1), ("roof", key, hit[3]), ("roofbed", key), ("rcav", key))
            continue
        if role == "roof":
            out[(i, j, k)] = (*CHAR, 0.0, ("roofcore",))
            continue
        if role == "hull":
            s, sd = per.info(i, j)
            si = int(s / S)
            od = outward(i, j, k, sd)
            if deck and k == K_SHELL_CUT:              # rim rail at the cut
                ix, loc, w = rim_pack.at(si)
                col = LIGHT if H(ix, 61) < 0.3 else CHAR
                out[(i, j, k)] = (*tint(col, H(ix, 62), 0.3), 0.0, ("rail", ix))
                if 0.25 < sd < 0.75 and 2 <= loc < w - 2 and H(ix, 63) < 0.4:
                    lit = H(ix, 64) >= 0.8
                    add[(i, j, k + 1)] = (*(AMBER if lit else LIGHT2), 6.0 if lit else 0.0, ("railcap", ix))
                continue
            if k < TIERS[0][0]:
                out[(i, j, k)] = (*tint(CHAR, H(si // 16, 5), 0.3), 0.0, ("skirt", si // 16))
                continue
            if od is None:
                out[(i, j, k)] = (*CHAR, 0.0, ("ringcore",))
                continue
            tier = 0 if k < TIERS[0][1] else (1 if k < TIERS[1][1] else 2)
            if tier == 2:                              # rim rail band
                ix, loc, w = rim_pack.at(si)
                out[(i, j, k)] = (*tint(CHAR, H(ix, 65), 0.3), 0.0, ("rimside", ix))
                if k == TIERS[1][1] + 2 and 3 <= loc < 5 and H(ix, 66) < 0.35:
                    add[(i + od[0], j + od[1], k)] = (*AMBER, 7.0, ("riml", ix))
                continue
            ix, u, w = ring_pack[tier].at(si)
            t0, t1 = TIERS[tier]
            kind = pick_kind(RING_KINDS[tier], H(ix, tier, 17), w)
            hit = lookup(ring_stamps, (tier, ix), cassette, kind, w, t1 - t0, u, k - t0, ix * 7 + tier)
            if hit is None:
                out[(i, j, k)] = (*CHAR, 0.0, ("ringgap", tier, ix))
            else:
                apply(hit, (i, j, k), (od[0], od[1], 0), ("cas", tier, ix, hit[3]), ("casbed", tier, ix), ("cav", tier, ix))
        elif role == "wall":
            si = int(per.info(i, j)[0] / S)
            seg, m16 = si // 16, si % 16
            if k >= (K_SHELL_CUT - 2 if deck else 47):
                out[(i, j, k)] = (*CHAR, 0.0, ("wcap", seg)); continue
            if k <= 4:
                out[(i, j, k)] = (*CHAR, 0.0, ("wbase", seg)); continue
            band = 0 if k <= 16 else 1
            h = H(seg, 77)
            if band == 1 and 36 <= k <= 37 and 4 <= m16 < 12 and h < 0.4:
                out[(i, j, k)] = (*CYAN, 8.0, ("wl", seg)); continue
            if band == 1 and 0.4 <= h < 0.8 and 3 <= m16 < 13 and 20 <= k <= 32:
                lit = 4 <= m16 < 12 and 21 <= k <= 31
                out[(i, j, k)] = (*((0.08, 0.5, 0.95) if lit else CHAR), 3.5 if lit else 0.0, ("ws", seg, lit)); continue
            if band == 0 and k == 10 and 7 <= m16 < 9:
                out[(i, j, k)] = (*AMBER, 7.0, ("wa", seg)); continue
            out[(i, j, k)] = (*tint(MID if band == 0 else (0.36, 0.36, 0.38), H(seg, band, 9)), 0.0, ("wall", seg, band))
        elif role in ("partition", "pillar"):
            top = K_CUT if deck else K_TOP
            if k > top + (1 if role == "pillar" else 0):
                if deck and role == "pillar" and k == K_CUT + 2:
                    out[(i, j, k)] = (*CYAN, 2.5, ("pcap", oid))
                continue
            if role == "pillar":
                col = CHAR if k <= 4 else (GUN if k >= top else tint(LIGHT, H(oid, 3)))
                out[(i, j, k)] = (*col, 0.0, ("pillar", oid, k <= 4))
                continue
            seg = (i // 16) if spec["axis"] == "x" else (j // 16)
            if k >= top - 2:
                out[(i, j, k)] = (*CHAR, 0.0, ("pcapw", oid, seg))
                for dx, dy in (((0, 1), (0, -1)) if spec["axis"] == "x" else ((1, 0), (-1, 0))):
                    add[(i + dx, j + dy, k)] = (*CHAR, 0.0, ("pcapw", oid, seg))
                continue
            if k <= 4:
                out[(i, j, k)] = (*CHAR, 0.0, ("pbase", oid, seg)); continue
            band = 0 if k <= 14 else 1
            out[(i, j, k)] = (*tint(MID if band == 0 else LIGHT, H(oid, seg, band)), 0.0, ("part", oid, seg, band))
        elif role == "floor":
            ti, tj = i // 16, j // 16
            if k < 2:
                out[(i, j, k)] = (*CAV, 0.0, ("floorcore",)); continue
            corridor = 4 <= j * S < 6 and 3 <= i * S < 20
            grate = H(ti, tj, 9) < (0.35 if corridor else 0.12)
            li, lj = i % 16, j % 16
            if grate and 3 <= li < 13 and 3 <= lj < 13:
                if lj % 2 == 0:
                    carve.add((i, j, k)); cav[(i, j, k - 1)] = (*CAV, 0.0, ("grate", ti, tj))
                else:
                    out[(i, j, k)] = (*GUN, 0.0, ("slatf", ti, tj, lj))
                continue
            out[(i, j, k)] = (*tint(FLOOR2 if corridor else FLOOR, H(ti, tj, 3), 0.25), 0.0, ("tile", ti, tj))
        elif role == "nozzle":
            cy, cz = spec["centre"]
            ring = int(math.hypot((j + 0.5) * S - cy, (k + 0.5) * S - cz) / 0.1875)
            out[(i, j, k)] = (*(CHAR if ring % 2 else GUN), 0.0, ("noz", oid, ring, i // 4))
        else:                                           # authored props/modules: explicit colour
            col, e, sp = spec["rgb"], spec["emit"], spec["split"]
            if sp:
                n = int(sp / S)
                out[(i, j, k)] = (*tint(col, H(i // n, j // n, k // n, oid), 0.1), e, ("obj", oid, i // n, j // n, k // n))
            else:
                out[(i, j, k)] = (*col, e, ("obj", oid))
    for p in carve:
        out.pop(p, None)
    for p, v in cav.items():
        if p in out and out[p][3] == 0.0:
            out[p] = v
    for p, v in add.items():
        out.setdefault(p, v)
    return out


# --------------------------------------------------------------------------- 4. MESH
FACES = [((1, 0, 0), [(1, 0, 0), (1, 1, 0), (1, 1, 1), (1, 0, 1)]), ((-1, 0, 0), [(0, 0, 0), (0, 0, 1), (0, 1, 1), (0, 1, 0)]),
         ((0, 1, 0), [(0, 1, 0), (0, 1, 1), (1, 1, 1), (1, 1, 0)]), ((0, -1, 0), [(0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1)]),
         ((0, 0, 1), [(0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)]), ((0, 0, -1), [(0, 0, 0), (0, 1, 0), (1, 1, 0), (1, 0, 0)])]
D6 = [f[0] for f in FACES]


def build_mesh(name, out, material, collection):
    """Exposed faces + brick-boundary faces on the surface skin; no vertex sharing across bricks."""
    bid, vidx, verts, faces, fcol = {}, {}, [], [], []
    for p, v in out.items():
        i, j, k = p
        b = bid.setdefault(v[4], len(bid))
        on_skin = any((i + dx, j + dy, k + dz) not in out for dx, dy, dz in D6)
        for (dx, dy, dz), corners in FACES:
            nb = out.get((i + dx, j + dy, k + dz))
            if nb is not None and (not on_skin or nb[4] == v[4]):
                continue
            if nb is None and dz == -1 and k <= 0:
                continue
            f = []
            for a, bb, c in corners:
                key = (b, i + a, j + bb, k + c)
                ix = vidx.get(key)
                if ix is None:
                    ix = vidx[key] = len(verts)
                    verts.append(((i + a) * S, (j + bb) * S, (k + c) * S))
                f.append(ix)
            faces.append(f)
            fcol.append(v)
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    ca = me.color_attributes.new("col", "FLOAT_COLOR", "CORNER")
    ea = me.color_attributes.new("emit", "FLOAT_COLOR", "CORNER")
    cbuf, ebuf = [], []
    for v in fcol:
        cbuf.extend((v[0], v[1], v[2], 1.0) * 4)
        ebuf.extend((v[0] * v[3], v[1] * v[3], v[2] * v[3], 1.0) * 4)
    ca.data.foreach_set("color", cbuf)
    ea.data.foreach_set("color", ebuf)
    me.materials.append(material)
    me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
    ob = bpy.data.objects.new(name, me)
    collection.objects.link(ob)
    bev = ob.modifiers.new("brick_bevel", "BEVEL")   # offline stand-in for a runtime brick-edge shader term
    bev.width, bev.segments, bev.limit_method, bev.angle_limit = 0.022, 2, "ANGLE", math.radians(30)
    bev.harden_normals, bev.use_clamp_overlap = True, True
    return ob, len(faces), len(bid)


def vertex_color_material():
    m = bpy.data.materials.new("voxel_vertex_color")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    ac = nt.nodes.new("ShaderNodeAttribute"); ac.attribute_name = "col"
    ae = nt.nodes.new("ShaderNodeAttribute"); ae.attribute_name = "emit"
    nt.links.new(ac.outputs["Color"], b.inputs["Base Color"])
    nt.links.new(ae.outputs["Color"], b.inputs["Emission Color"])
    b.inputs["Emission Strength"].default_value = 1.0
    b.inputs["Roughness"].default_value = 0.38
    b.inputs["Specular IOR Level"].default_value = 0.6
    nt.links.new(b.outputs[0], out.inputs[0])
    return m


def glass_material():
    m = bpy.data.materials.new("canopy_glass")
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (0.25, 0.6, 1.0, 1)
    b.inputs["Roughness"].default_value = 0.05
    b.inputs["Alpha"].default_value = 0.35
    b.inputs["Emission Color"].default_value = (0.1, 0.45, 1.0, 1)
    b.inputs["Emission Strength"].default_value = 1.2
    m.surface_render_method = "BLENDED"
    return m


# --------------------------------------------------------------------------- scene
ROOM_LIGHTS = [((5.0, 8.0), (1.0, 0.78, 0.55), 80), ((9.0, 8.0), (1.0, 0.55, 0.75), 90), ((13.0, 8.0), (0.8, 0.9, 1.0), 70),
               ((17.5, 8.0), (1.0, 0.8, 0.6), 70), ((5.5, 2.0), (1.0, 0.8, 0.55), 70), ((10.0, 2.0), (1.0, 0.8, 0.6), 70),
               ((14.0, 2.0), (0.8, 1.0, 0.75), 70), ((18.0, 2.0), (1.0, 0.8, 0.6), 60), ((7.0, 5.0), (0.6, 0.8, 1.0), 50),
               ((14.0, 5.0), (0.6, 0.8, 1.0), 50), ((22.5, 5.0), (0.4, 0.7, 1.0), 140), ((1.5, 5.0), (0.4, 0.8, 1.0), 90)]


def world(sc, nebula):
    w = sc.world or bpy.data.worlds.new("World")
    sc.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    tc = nt.nodes.new("ShaderNodeTexCoord")
    noise = nt.nodes.new("ShaderNodeTexNoise"); noise.inputs["Scale"].default_value = 1.6; noise.inputs["Detail"].default_value = 6
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position, ramp.color_ramp.elements[0].color = 0.35, (0.002, 0.002, 0.008, 1)
    ramp.color_ramp.elements[1].position = 0.78
    ramp.color_ramp.elements[1].color = (0.10, 0.02, 0.22, 1) if nebula else (0.012, 0.008, 0.03, 1)
    vor = nt.nodes.new("ShaderNodeTexVoronoi"); vor.inputs["Scale"].default_value = 320
    lt = nt.nodes.new("ShaderNodeMath"); lt.operation = "LESS_THAN"; lt.inputs[1].default_value = 0.03
    mul = nt.nodes.new("ShaderNodeMath"); mul.operation = "MULTIPLY"; mul.inputs[1].default_value = 3.0
    add = nt.nodes.new("ShaderNodeMix"); add.data_type = "RGBA"; add.blend_type = "ADD"; add.inputs["Factor"].default_value = 1.0
    bg = nt.nodes.new("ShaderNodeBackground")
    wo = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(tc.outputs["Generated"], noise.inputs["Vector"])
    nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(tc.outputs["Generated"], vor.inputs["Vector"])
    nt.links.new(vor.outputs["Distance"], lt.inputs[0])
    nt.links.new(lt.outputs[0], mul.inputs[0])
    nt.links.new(ramp.outputs["Color"], add.inputs[6])
    nt.links.new(mul.outputs[0], add.inputs[7])
    nt.links.new(add.outputs[2], bg.inputs["Color"])
    nt.links.new(bg.outputs[0], wo.inputs[0])


def setup_scene(res, samples):
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE_NEXT"
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.eevee.taa_render_samples = samples
    for attr, val in (("use_raytracing", True), ("use_shadows", True), ("use_fast_gi", True),
                      ("fast_gi_distance", 1.5), ("shadow_ray_count", 2)):
        if hasattr(sc.eevee, attr):
            setattr(sc.eevee, attr, val)
    key = bpy.data.objects.new("Key", bpy.data.lights.new("Key", "SUN"))
    sc.collection.objects.link(key)
    key.data.energy, key.data.color, key.data.angle = 2.4, (1.0, 0.93, 0.85), math.radians(8)
    key.rotation_euler = (math.radians(36), math.radians(-10), math.radians(150))
    fill = bpy.data.objects.new("Fill", bpy.data.lights.new("Fill", "AREA"))
    sc.collection.objects.link(fill)
    fill.data.energy, fill.data.size, fill.data.color = 1400, 26, (0.55, 0.45, 1.0)
    fill.location = (10, 20, 12); fill.rotation_euler = (math.radians(-55), 0, math.radians(180))
    room = []
    for n, ((x, y), col, power) in enumerate(ROOM_LIGHTS):
        pl = bpy.data.objects.new(f"room_{n}", bpy.data.lights.new(f"room_{n}", "POINT"))
        sc.collection.objects.link(pl)
        pl.data.energy, pl.data.color, pl.data.shadow_soft_size = power * 0.35, col, 0.8
        pl.location = (x, y, 2.1)
        room.append(pl)
    for n, cy in enumerate((2.25, 7.75, 5.0)):
        pl = bpy.data.objects.new(f"exhaust_{n}", bpy.data.lights.new(f"exhaust_{n}", "POINT"))
        sc.collection.objects.link(pl)
        pl.data.energy, pl.data.color, pl.data.shadow_soft_size = 500, (0.2, 0.5, 1.0), 0.8
        pl.location = (-7.2 if n < 2 else -6.2, cy, 1.55)
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    # Owner grading note (2026-09-25): gamma up, contrast down, saturation up; bloom on emissives.
    sc.view_settings.view_transform, sc.view_settings.look = "AgX", "AgX - Base Contrast"
    sc.view_settings.exposure, sc.view_settings.gamma = 0.0, 1.08
    sc.use_nodes = True
    ct = sc.node_tree
    ct.nodes.clear()
    rl = ct.nodes.new("CompositorNodeRLayers")
    gl = ct.nodes.new("CompositorNodeGlare"); gl.glare_type, gl.threshold, gl.size, gl.mix = "FOG_GLOW", 0.8, 8, 0.0
    hs = ct.nodes.new("CompositorNodeHueSat"); hs.inputs["Saturation"].default_value = 1.35
    bc = ct.nodes.new("CompositorNodeBrightContrast"); bc.inputs["Contrast"].default_value = -3.0
    comp = ct.nodes.new("CompositorNodeComposite")
    ct.links.new(rl.outputs["Image"], gl.inputs["Image"])
    ct.links.new(gl.outputs["Image"], hs.inputs["Image"])
    ct.links.new(hs.outputs["Image"], bc.inputs["Image"])
    ct.links.new(bc.outputs["Image"], comp.inputs["Image"])
    return cam, room


def aim(cam, target, offset, lens, roll=0.0):
    cam.data.lens = lens
    cam.location = Vector(target) + Vector(offset)
    cam.rotation_euler = (Vector(target) - cam.location).to_track_quat("-Z", "Y").to_euler()
    if roll:
        cam.rotation_euler.rotate_axis("Z", math.radians(roll))


SHOTS = set()


def overhead(cam, target, tilt, heading, dist, lens):
    """Near-top-down flight camera: tilt from vertical, screen heading of the ship's +x axis."""
    cam.data.lens = lens
    cam.rotation_euler = (math.radians(tilt), 0.0, math.radians(-heading))
    fwd = cam.rotation_euler.to_matrix() @ Vector((0, 0, -1))
    cam.location = Vector(target) - fwd * dist


def render(path):
    name = path.rsplit("/", 1)[-1].split("_", 1)[-1].rsplit(".", 1)[0]
    if SHOTS and name not in SHOTS:
        return
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print(f"rendered {path}", flush=True)


def main():
    args = parse_args()
    SHOTS.update(x for x in args.shots.split(",") if x)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    authored = bpy.data.collections.new("AUTHORED_layers_and_modules"); sc.collection.children.link(authored)
    runtime = bpy.data.collections.new("VOXEL_runtime"); sc.collection.children.link(runtime)
    a = Author(authored)
    author_section(a)
    authored.hide_render = True
    gm = glass_material()
    glass = [s["ob"] for s in a.objs if s["role"] == "glass"]
    for g in glass:
        runtime.objects.link(g)
        g.data.materials.append(gm)
    occ = voxelize(a.objs)
    per = Perimeter(footprint(0.0))
    mat = vertex_color_material()
    meshes, stats = {}, []
    for view in ("flight", "deck"):
        if args.views not in ("all", view):
            continue
        styled = style(occ, a.objs, per, view)
        ob, faces, bricks = build_mesh(f"ship_{view}", styled, mat, runtime)
        meshes[view] = ob
        stats.append(f"{view}: cells={len(styled)} bricks={bricks} faces={faces}")
    print(f"voxel_style_prototype {REVISION}: authored_objects={len(a.objs)} sampled_cells={len(occ)} " + " | ".join(stats), flush=True)
    if args.no_render:
        return
    cam, room = setup_scene(tuple(int(v) for v in args.res.split("x")), args.samples)
    for view, ob in meshes.items():
        for other in meshes.values():
            other.hide_render = other is not ob
        for g in glass:
            if g.name == "skylight_glass":
                g.hide_render = view == "deck"
        sc.view_settings.exposure = 0.45 if view == "flight" else 0.0
        if view == "flight":
            world(sc, nebula=False)
            for pl in room:
                pl.hide_render = True
            overhead(cam, (8.5, 5.0, 1.2), 14, 145, 78, 50)
            render(f"{args.out}/{REVISION}_flight_topdown.png")
            world(sc, nebula=True)
            aim(cam, (10.0, 10.2, 1.6), (4.0, 10.0, 4.2), 32)
            render(f"{args.out}/{REVISION}_hull_side.png")
            aim(cam, (-3.0, 5.0, 2.0), (-5.0, -7.0, 9.0), 35)
            render(f"{args.out}/{REVISION}_engines.png")
        else:
            world(sc, nebula=True)
            for pl in room:
                pl.hide_render = False
            aim(cam, (11.0, 5.0, 0.4), (11.0, 16.0, 15.5), 30)
            render(f"{args.out}/{REVISION}_deck_view.png")
            aim(cam, (22.0, 5.0, 1.0), (7.0, 7.5, 6.5), 30)
            render(f"{args.out}/{REVISION}_cockpit.png")


main()
