"""Shipyard voxel-structure prototype, revision r002 (design evidence, not a production exporter).

Pipeline demonstrated (see docs/shipyard_player_builder_design.md):

  1. AUTHOR  - ordered primitive layers on the 1 m build grid. Each box carries
               a role (structure) or a colour/emission (props). Later layers
               win; role "void" carves. The author never thinks about voxels.
  2. SAMPLE  - scanline ray casts at 1/16 m cell centres on the global ship
               lattice. Each cell keeps (object id, role).
  3. STYLE   - deterministic, world-seeded faction style kit. It assigns every
               surface cell a colour, an emission and a BRICK id: kitbash hull
               modules (plates, vents, hatches, light boxes, recesses) with real
               depth, rim caps, wall bands and caps, junction pillars, floor
               tiles and grates. Large authored boxes are split into 0.5-0.75 m
               bricks.
  4. MESH    - exposed faces plus brick-boundary faces on the surface skin.
               Vertices are never shared across bricks, so each brick is its own
               island. The offline bevel then rounds every brick edge; at
               runtime this becomes a brick-edge shader term, not geometry. One
               material; colour and emission live in face-corner attributes.
  5. DAMAGE  - spherical impacts remove cells (the part authority would own)
               and scorch the lip (presentation only).

r002 responds to owner feedback on r001 ("not close yet"). It adds per-brick
bevels, deep hull relief, the reference palette, capped cut-away partitions
with light-topped pillars, boxy engines, multi-part props, room lighting and a
nebula backdrop.

Usage:
  blender -b -P scripts/art_library/voxel_style_prototype.py -- \
      --out /tmp/voxel-proto [--res 1672x941] [--samples 48] [--views all|overview] [--no-render]
"""
import argparse
import bisect
import math
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

REVISION = "r002"
S = 1.0 / 16.0            # voxel edge (m) = 2 lattice units
FT, WT = 0.1875, 3.1875   # floor top / wall top of the approved 3.5 m deck profile
K_FLOOR_TOP = 2           # last floor row
K_WALL_TOP = 50           # last wall row (3.1875 m)
K_CUT = 30                # cut-away height for partitions and pillars in deck view (~1.9 m)
TOPK = 53                 # last hull row (3.375 m) in flight view
K_SHELL_CUT = 40          # deck-view cut-away of hull + exterior wall (~2.5 m); rim is restyled at the cut
R2 = math.sqrt(2.0)

# palette: linear RGB tuned to the reference (warm light grey, charcoal navy, muted crimson)
LIGHT = (0.46, 0.455, 0.46); LIGHT2 = (0.56, 0.555, 0.56); MID = (0.26, 0.26, 0.28)
CHAR = (0.030, 0.034, 0.060); GUN = (0.065, 0.07, 0.095); CRIM = (0.40, 0.022, 0.045)
CAV = (0.012, 0.012, 0.02); AMBER = (1.0, 0.42, 0.07); CYAN = (0.08, 0.55, 1.0)
FLOOR = (0.085, 0.09, 0.11); FLOOR2 = (0.065, 0.07, 0.085)


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--out", default="/tmp/voxel-proto")
    p.add_argument("--res", default="1672x941")
    p.add_argument("--samples", type=int, default=48)
    p.add_argument("--views", default="all")
    p.add_argument("--no-render", action="store_true")
    return p.parse_args(argv)


def H(*a):
    """Deterministic integer hash -> [0, 1), seeded by world cells, never RNG state."""
    h = 2166136261
    for v in a:
        h = ((h ^ (v & 0xFFFFFFFF)) * 16777619) & 0xFFFFFFFF
        h ^= h >> 13
    return (h % 100000) / 100000.0


def tint(c, h, amt=0.08):
    f = 1.0 - amt / 2 + amt * h
    return (c[0] * f, c[1] * f, c[2] * f)


# --------------------------------------------------------------------------- 1. AUTHOR
def footprint(d, arc_seg=48):
    """14 x 8 m floor on the 1 m grid, offset by d (+out/-in): 45-degree starboard
    bow slope (11,0)->(14,3) and an r=3 m port bow arc about (11,5)."""
    pts = [(-d, -d), (11 + d * R2 - d, -d), (14 + d, 3 + d - d * R2)]
    r = 3 + d
    for s in range(arc_seg + 1):
        a = (math.pi / 2) * s / arc_seg
        pts.append((11 + r * math.cos(a), 5 + r * math.sin(a)))
    pts.append((-d, 8 + d))
    return pts


class Author:
    """Collects ordered layers. Every object gets an id; props carry colour/emission."""

    def __init__(self, collection):
        self.col, self.objs = collection, []

    def _link(self, name, bm, role, rgb=None, emit=0.0, axis=None, split=None):
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new(name, me)
        self.col.objects.link(ob)
        self.objs.append({"ob": ob, "role": role, "rgb": rgb, "emit": emit, "axis": axis, "split": split})
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

    def cyl_x(self, name, x0, x1, cy, cz, r, role="prop", seg=40, **kw):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r, radius2=r, depth=x1 - x0)
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, "Y"))
        bmesh.ops.translate(bm, verts=bm.verts, vec=((x0 + x1) / 2, cy, cz))
        return self._link(name, bm, role, **kw)


PARTITIONS = [  # (x0, y0, x1, y1) centre lines on 1 m cell edges
    (0, 5, 10, 5), (0, 3, 10, 3), (4, 5, 4, 8), (8, 5, 8, 8), (4, 0, 4, 3), (7, 0, 7, 3), (10, 0, 10, 8)]
DOORS = [("y", 5, 1), ("y", 5, 5), ("y", 3, 1), ("y", 3, 5), ("y", 3, 8), ("x", 10, 3)]


def author_section(a):
    # --- structure: hull wrap (stepped skirt), floor, inward exterior wall
    a.prism("hull_skirt", footprint(0.6875), 0.0, 0.3125, "hull")
    a.prism("hull_outer", footprint(1.0), 0.3125, 3.375, "hull")
    a.prism("hull_void", footprint(0.0), FT, 4.0, "void")
    a.prism("floor", footprint(0.0), 0.0, FT, "floor")
    a.prism("wall_ext", footprint(0.0), FT, WT, "wall")
    a.prism("wall_void", footprint(-0.25), FT, 4.0, "void")
    a.box("canopy_void", 13.0, 2.5, 0.8125, 15.5, 5.5, 2.9375, "void")
    # --- partitions centred on edges, derived junction pillars (vertex lattice)
    h = 0.125
    for x0, y0, x1, y1 in PARTITIONS:
        if y0 == y1:
            a.box(f"partition_{x0}_{y0}_{x1}", x0, y0 - h, FT, x1, y0 + h, WT, "partition", axis="x")
        else:
            a.box(f"partition_{x0}_{y0}_{y1}", x0 - h, y0, FT, x0 + h, y1, WT, "partition", axis="y")
    ends = set()
    for x0, y0, x1, y1 in PARTITIONS:
        ends.add((x0, y0)); ends.add((x1, y1))
    for x0, y0, x1, y1 in PARTITIONS:           # T/cross junctions along other partitions
        for ex, ey in list(ends):
            if y0 == y1 and x0 < ex < x1 and ey == y0:
                ends.add((ex, ey))
    for ex, ey in sorted(ends):
        if ex == 0 or ey in (0, 8):                     # joins the exterior wall: no free-standing pillar
            continue
        p = 0.1875
        a.box(f"pillar_{ex}_{ey}", ex - p, ey - p, FT, ex + p, ey + p, 4.0, "pillar")
    # --- 2 m door modules: pillar jambs with light caps, 1.25 m clear
    for ax, c, f0 in DOORS:
        for u0, u1 in ((f0, f0 + 0.375), (f0 + 1.625, f0 + 2.0)):
            if ax == "y":
                a.box(f"jamb_{c}_{f0}_{u0}", u0, c - 0.1875, FT, u1, c + 0.1875, 4.0, "pillar")
            else:
                a.box(f"jamb_{c}_{f0}_{u0}", c - 0.1875, u0, FT, c + 0.1875, u1, 4.0, "pillar")
        if ax == "y":
            a.box(f"door_{c}_{f0}", f0 + 0.375, c - 0.3, FT, f0 + 1.625, c + 0.3, 4.0, "void")
        else:
            a.box(f"door_{c}_{f0}", c - 0.3, f0 + 0.375, FT, c + 0.3, f0 + 1.625, 4.0, "void")
    author_props(a)
    author_engines(a)
    a.box("canopy_glass", 14.3125, 2.5, 0.8125, 14.4375, 5.5, 2.9375, "glass")
    for n, (y0, y1) in enumerate(((2.375, 2.625), (3.875, 4.125), (5.375, 5.625))):
        a.box(f"canopy_mullion_{n}", 14.25, y0, 0.8125, 14.5, y1, 2.9375, "prop", rgb=CHAR)
    a.box("canopy_sill", 14.25, 2.5, 0.75, 14.5, 5.5, 0.875, "prop", rgb=CYAN, emit=6.0)


def author_props(a):
    B, C = a.box, None
    W_ = (0.62, 0.62, 0.64); BLUE = (0.02, 0.13, 0.55); SOFA = (0.45, 0.03, 0.05); PINK = (0.60, 0.25, 0.35)
    LEAF = (0.05, 0.30, 0.04); WOOD = (0.25, 0.12, 0.04); SCREEN = (0.10, 0.60, 1.0)
    # crew quarters (0-4, 5-8): bunk bed, lockers, poster
    for n, z in enumerate((FT, 1.1875)):
        B(f"bunk{n}_frame", 0.375, 6.5, z, 2.5, 7.625, z + 0.3125, rgb=W_)
        B(f"bunk{n}_mattress", 0.5, 6.5625, z + 0.3125, 2.375, 7.5625, z + 0.5, rgb=W_)
        B(f"bunk{n}_blanket", 0.5, 6.5625, z + 0.3125, 1.8125, 7.5625, z + 0.5625, rgb=BLUE)
        B(f"bunk{n}_pillow", 1.9375, 6.6875, z + 0.5, 2.3125, 7.4375, z + 0.625, rgb=W_)
    B("bunk_post_a", 0.375, 6.5, FT, 0.5625, 6.6875, 1.875, rgb=CHAR)
    B("bunk_post_b", 2.3125, 6.5, FT, 2.5, 6.6875, 1.875, rgb=CHAR)
    for n in range(3):
        x = 2.75 + n * 0.375
        B(f"locker_{n}", x, 7.3125, FT, x + 0.3125, 7.75, 2.0625, rgb=LIGHT)
        B(f"locker_{n}_light", x + 0.0625, 7.25, 1.5, x + 0.25, 7.3125, 1.625, rgb=AMBER, emit=6.0)
    B("poster_q", 0.875, 7.6875, 2.0, 1.625, 7.75, 2.625, rgb=(0.1, 0.2, 0.8), emit=2.5)
    # lounge (4-8, 5-8): sectional sofa with cushions, table, plant, neon sign, shelves
    B("sofa_base", 4.4375, 6.9375, FT, 7.3125, 7.75, 0.4375, rgb=SOFA)
    for n in range(4):
        x = 4.5 + n * 0.6875
        B(f"sofa_seat_{n}", x, 7.0, 0.4375, x + 0.625, 7.4375, 0.5625, rgb=SOFA)
        B(f"sofa_back_{n}", x, 7.4375, 0.4375, x + 0.625, 7.6875, 1.0, rgb=SOFA)
    B("sofa_arm_base", 4.4375, 5.8125, FT, 5.1875, 6.9375, 0.4375, rgb=SOFA)
    B("sofa_arm_seat", 4.5, 5.875, 0.4375, 4.9375, 6.9375, 0.5625, rgb=SOFA)
    B("sofa_arm_back", 4.4375, 5.8125, 0.4375, 4.6875, 6.9375, 1.0, rgb=SOFA)
    B("table_top", 5.5625, 5.875, 0.4375, 6.8125, 6.625, 0.5625, rgb=PINK)
    B("table_base", 5.75, 6.0625, FT, 6.625, 6.4375, 0.4375, rgb=CHAR)
    for n, (x, y) in enumerate(((5.75, 6.0), (6.3125, 6.25))):
        B(f"table_pot_{n}", x, y, 0.5625, x + 0.1875, y + 0.1875, 0.75, rgb=W_)
        B(f"table_leaf_{n}", x - 0.0625, y - 0.0625, 0.75, x + 0.25, y + 0.25, 0.9375, rgb=LEAF)
    B("plant_pot", 7.25, 5.4375, FT, 7.75, 5.9375, 0.625, rgb=W_)
    for n, (dx, dy, z) in enumerate(((0, 0, 0.625), (-0.125, 0.0625, 0.8125), (0.125, -0.0625, 0.9375), (0, 0, 1.125))):
        B(f"plant_leaf_{n}", 7.25 + dx, 5.4375 + dy, z, 7.75 + dx, 5.9375 + dy, z + 0.25, rgb=tint(LEAF, H(n, 3), 0.4))
    B("neon_sign", 5.375, 7.6875, 1.375, 6.625, 7.75, 2.625, rgb=(0.35, 0.08, 0.9), emit=3.5)
    B("neon_frame", 5.3125, 7.6875, 1.3125, 6.6875, 7.72, 2.6875, rgb=(1.0, 0.25, 0.6), emit=2.0)
    # cargo (0-4, 0-3): stacked crates with frames
    crates = [(0.5, 0.5, FT, AMBER), (1.25, 0.5, FT, (0.06, 0.18, 0.55)), (0.5, 0.5, 0.9375, (0.06, 0.18, 0.55)),
              (2.0, 0.5, FT, LIGHT), (0.5, 1.25, FT, AMBER), (2.875, 0.5, FT, AMBER), (2.875, 0.5, 0.9375, LIGHT)]
    for n, (x, y, z, col) in enumerate(crates):
        B(f"crate_{n}", x + 0.0625, y + 0.0625, z, x + 0.6875, y + 0.6875, z + 0.6875, rgb=tint(col, H(n, 9), 0.2))
        B(f"crate_{n}_band", x, y, z + 0.25, x + 0.75, y + 0.75, z + 0.4375, rgb=CHAR)
        B(f"crate_{n}_light", x + 0.25, y, z + 0.5, x + 0.5, y + 0.0625, z + 0.5625, rgb=CYAN, emit=5.0)
    # medbay (4-7, 0-3)
    B("med_bed", 4.5, 0.5, FT, 5.5, 2.4375, 0.6875, rgb=W_)
    B("med_sheet", 4.5625, 0.5625, 0.6875, 5.4375, 1.9375, 0.8125, rgb=CRIM)
    B("med_pillow", 4.625, 2.0, 0.6875, 5.375, 2.375, 0.875, rgb=W_)
    B("med_cab", 6.0, 0.375, FT, 6.6875, 0.8125, 2.125, rgb=LIGHT)
    B("med_screen", 6.0625, 0.8125, 1.25, 6.625, 0.875, 1.75, rgb=SCREEN, emit=4.0)
    B("med_cross", 6.25, 0.8125, 1.8125, 6.4375, 0.875, 2.0, rgb=(1.0, 0.05, 0.08), emit=4.0)
    # workshop (7-10, 0-3): bench with tools, hydroponic trays
    B("bench", 7.5, 0.375, FT, 9.5, 1.125, 0.875, rgb=GUN)
    B("bench_top", 7.4375, 0.3125, 0.875, 9.5625, 1.1875, 0.9375, rgb=LIGHT)
    B("bench_tool", 8.0, 0.5, 0.9375, 8.5, 0.875, 1.1875, rgb=AMBER)
    B("bench_screen", 8.75, 0.375, 0.9375, 9.375, 0.4375, 1.4375, rgb=SCREEN, emit=4.0)
    B("tray", 7.5, 1.9375, FT, 9.5, 2.625, 0.625, rgb=W_)
    B("tray_light", 7.5, 1.9375, 1.4375, 9.5, 2.625, 1.5, rgb=(0.8, 1.0, 0.7), emit=3.0)
    for n in range(6):
        x = 7.625 + n * 0.3125
        B(f"tray_plant_{n}", x, 2.0625, 0.625, x + 0.25, 2.5, 0.875 + 0.0625 * (n % 2), rgb=tint(LEAF, H(n, 7), 0.5))
    # bridge (10-14): consoles with screens, pilot seat
    for n, (x0, y0, x1, y1, face) in enumerate(((12.75, 2.5, 13.25, 5.5, "x"), (10.625, 0.75, 12.0, 1.3125, "y+"),
                                                (10.625, 6.6875, 12.0, 7.25, "y-"))):
        B(f"console_{n}", x0, y0, FT, x1, y1, 0.9375, rgb=GUN)
        B(f"console_{n}_top", x0 - 0.0625, y0 - 0.0625, 0.9375, x1 + 0.0625, y1 + 0.0625, 1.0, rgb=LIGHT)
        if face == "x":
            B(f"console_{n}_screen", x0 + 0.0625, y0 + 0.125, 1.0, x0 + 0.25, y1 - 0.125, 1.5625, rgb=SCREEN, emit=4.5)
        elif face == "y+":
            B(f"console_{n}_screen", x0 + 0.125, y0 + 0.375, 1.0, x1 - 0.125, y0 + 0.5, 1.5, rgb=SCREEN, emit=4.5)
        else:
            B(f"console_{n}_screen", x0 + 0.125, y1 - 0.5, 1.0, x1 - 0.125, y1 - 0.375, 1.5, rgb=SCREEN, emit=4.5)
    B("seat_base", 11.625, 3.625, FT, 12.125, 4.375, 0.5, rgb=CHAR)
    B("seat_cushion", 11.5625, 3.5625, 0.5, 12.1875, 4.4375, 0.6875, rgb=GUN)
    B("seat_back", 11.4375, 3.5625, 0.6875, 11.6875, 4.4375, 1.5625, rgb=GUN)
    # corridor floor lights
    for x in range(1, 10, 2):
        B(f"corr_light_s_{x}", x, 3.1875, FT, x + 0.5, 3.3125, 0.25, rgb=AMBER, emit=6.0)
        B(f"corr_light_n_{x}", x, 4.6875, FT, x + 0.5, 4.8125, 0.25, rgb=AMBER, emit=6.0)


def author_engines(a):
    for n, cy in (("P", 2.0), ("S", 6.0)):
        y0, y1 = cy - 1.25, cy + 1.25
        a.box(f"eng_{n}_core", -4.25, y0, 0.375, 0.5, y1, 2.625, "engine")
        a.box(f"eng_{n}_collar", -1.25, y0 - 0.125, 0.25, -0.25, y1 + 0.125, 2.75, "engine")
        a.box(f"eng_{n}_band", -3.1875, y0 - 0.1875, 0.1875, -2.5625, y1 + 0.1875, 2.8125, "prop", rgb=CRIM, split=0.5)
        a.box(f"eng_{n}_top_vent", -2.25, cy - 0.625, 2.625, -1.375, cy + 0.625, 2.8125, "prop", rgb=GUN)
        a.box(f"eng_{n}_side_light", -2.0, y0 - 0.0625, 1.25, -1.875, y0, 1.875, "prop", rgb=AMBER, emit=7.0)
        a.box(f"eng_{n}_side_light2", -2.0, y1, 1.25, -1.875, y1 + 0.0625, 1.875, "prop", rgb=AMBER, emit=7.0)
        a.cyl_x(f"eng_{n}_nozzle", -4.875, -4.25, cy, 1.5, 1.125, "nozzle")
        a.cyl_x(f"eng_{n}_nozzle_lip", -5.0, -4.875, cy, 1.5, 1.0, "nozzle")
        a.cyl_x(f"eng_{n}_glow", -5.125, -5.0, cy, 1.5, 0.875, "prop", rgb=(0.15, 0.5, 1.0), emit=20.0)


# --------------------------------------------------------------------------- 2. SAMPLE
def voxelize(objs):
    dg = bpy.context.evaluated_depsgraph_get()
    occ = {}
    for oid, spec in enumerate(objs):
        if spec["role"] == "glass":
            continue
        ob = spec["ob"]
        bm = bmesh.new()
        bm.from_object(ob, dg)
        bm.transform(ob.matrix_world)
        bvh = BVHTree.FromBMesh(bm)
        xs = [v.co.x for v in bm.verts]; ys = [v.co.y for v in bm.verts]; zs = [v.co.z for v in bm.verts]
        bm.free()
        carve = spec["role"] == "void"
        under = spec["role"] in ("partition", "pillar")   # interior structure never overrides the shell
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
                        if za <= (k + 0.5) * S <= zb:
                            if carve:
                                occ.pop((i, j, k), None)
                            elif under:
                                prev = occ.get((i, j, k))
                                if prev is None or objs[prev]["role"] not in ("hull", "wall"):
                                    occ[(i, j, k)] = oid
                            else:
                                occ[(i, j, k)] = oid
    return occ


# --------------------------------------------------------------------------- 3. STYLE
class Perimeter:
    """Arc length and signed distance along the floor boundary: panel layout
    follows slopes and curves, not whichever axis a cell happens to face."""

    def __init__(self, poly):
        self.segs, acc = [], 0.0
        for q in range(len(poly)):
            p, r = poly[q], poly[(q + 1) % len(poly)]
            L = math.hypot(r[0] - p[0], r[1] - p[1])
            self.segs.append((p, r, L, acc))
            acc += L
        self.length, self.cache, self.breaks, s = acc, {}, [], 0
        while s * S < self.length + 2:
            self.breaks.append(s)
            s += [8, 12, 12, 16, 20, 24][int(H(s, 7) * 6)]

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

    def panel(self, si):
        ix = bisect.bisect_right(self.breaks, si) - 1
        return ix, si - self.breaks[ix], self.breaks[ix + 1] - self.breaks[ix]


HULL_BANDS = [5, 16, 27, 37, 41]   # module rows above the skirt (deck-view cut); last band is the rim
D6 = [(1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)]
D4 = [(1, 0), (-1, 0), (0, 1), (0, -1)]


def hull_band(k):
    if k < HULL_BANDS[0]:
        return -1, 0, HULL_BANDS[0]
    for b in range(len(HULL_BANDS) - 1):
        if HULL_BANDS[b] <= k < HULL_BANDS[b + 1]:
            return b, HULL_BANDS[b], HULL_BANDS[b + 1]
    return len(HULL_BANDS) - 2, HULL_BANDS[-2], HULL_BANDS[-1]


def module_kind(pidx, b):
    """Hull kitbash module per (panel, band): plate / vent / hatch / lightbox / recess."""
    h = H(pidx, b, 11)
    if b == 3:
        return "rim"
    if h < 0.13:
        return "vent"
    if h < 0.20 and b in (0, 1):
        return "hatch"
    if h < 0.32:
        return "lightbox"
    if h < 0.40:
        return "recess"
    return "plate"


def plate_colour(pidx, b):
    h = H(pidx, b, 21)
    if h < 0.55:
        return tint(LIGHT, H(pidx, b, 2))
    if h < 0.72:
        return tint(LIGHT2, H(pidx, b, 2))
    if h < 0.93:
        return tint(CHAR, H(pidx, b, 2), 0.3)
    return tint(CRIM, H(pidx, b, 2))


def style(occ, objs, per):
    """Return cell -> (r, g, b, emission, brick). Bricks are hashable tuples."""
    out, add, carve, cav = {}, {}, set(), {}

    def outward(i, j, k, sd):
        for dx, dy in D4:
            if (i + dx, j + dy, k) not in occ and per.info(i + dx, j + dy)[1] > sd:
                return dx, dy
        return None

    for (i, j, k), oid in occ.items():
        spec = objs[oid]
        role = spec["role"]
        if role in ("hull", "wall") and k > K_SHELL_CUT:
            continue                                      # deck-view cut-away (presentation only)
        if role == "hull":
            s, sd = per.info(i, j)
            pidx, loc, w = per.panel(int(s / S))
            b, b0, b1 = hull_band(k)
            od = outward(i, j, k, sd)
            core = ("hullcore",)
            if b == -1:                                   # stepped skirt
                out[(i, j, k)] = (*tint(CHAR, H(pidx, 5), 0.3), 0.0, ("skirt", pidx))
                continue
            if k == K_SHELL_CUT:                          # rim top at the cut: charcoal segments, raised caps, lights
                ht = H(pidx, 61)
                brick = ("rim", pidx)
                col = tint(GUN if H(pidx, 63) < 0.5 else CHAR, H(pidx, 62), 0.3)
                out[(i, j, k)] = (*col, 0.0, brick)
                if 1 <= loc < w - 1 and 0.2 < sd < 0.8:
                    if ht < 0.45:
                        add[(i, j, k + 1)] = (*tint(LIGHT, H(pidx, 64)), 0.0, ("rimcap", pidx))
                        if ht < 0.18 and 2 <= loc < w - 2 and 0.3 < sd < 0.7:
                            add[(i, j, k + 2)] = (*tint(LIGHT2, H(pidx, 65)), 0.0, ("rimcap2", pidx))
                    elif ht > 0.82 and 2 <= loc < 4 and 0.4 < sd < 0.6:
                        add[(i, j, k + 1)] = (*(AMBER if ht > 0.94 else (1.0, 0.1, 0.1)), 7.0, ("rimlight", pidx))
                continue
            if od is None:
                # inner rim face above the wall, or hull core
                col = tint(CHAR, H(pidx, 66), 0.3)
                out[(i, j, k)] = (*col, 0.0, ("rimin", pidx) if k > K_SHELL_CUT - 4 else core)
                continue
            kind = module_kind(pidx, b)
            brick = ("mod", pidx, b)
            base = plate_colour(pidx, b)
            lo, hi = 1, w - 1                             # 1-voxel margin inside each module
            inner = lo <= loc < hi and b0 + 1 <= k < b1 - 1
            ox, oy = od
            if kind == "rim":
                col = tint(CHAR, H(pidx, 67), 0.3)
                out[(i, j, k)] = (*col, 0.0, ("rimside", pidx))
                continue
            if kind == "plate":
                depth = int(H(pidx, b, 31) * 3)           # 0..2 voxels proud
                out[(i, j, k)] = (*base, 0.0, brick)
                inset = w >= 12 and b1 - b0 >= 9 and H(pidx, b, 35) < 0.55
                ring = inset and ((loc in (2, w - 3) and b0 + 2 <= k <= b1 - 3) or
                                  (k in (b0 + 2, b1 - 3) and 2 <= loc <= w - 3))
                face = depth
                if ring:                                  # inset panel: one-voxel groove inside the plate
                    if depth == 0:
                        carve.add((i, j, k))
                        cav[(i - ox, j - oy, k)] = (base[0] * 0.35, base[1] * 0.35, base[2] * 0.35, 0.0, ("groove", pidx, b))
                        continue
                    face = depth - 1
                for d in range(1, face + 1):
                    add[(i + ox * d, j + oy * d, k)] = (*base, 0.0, brick)
                gh = H(pidx, b, loc // 3, k // 3, 37)
                if not ring and gh < 0.07 and inner and loc % 3 != 2 and k % 3 != 2:
                    add[(i + ox * (face + 1), j + oy * (face + 1), k)] = (
                        *tint(GUN if gh < 0.04 else LIGHT2, gh), 0.0, ("greeble", pidx, b, loc // 3, k // 3))
                if face and inner and not ring and H(pidx, b, 33) < 0.35 and loc == lo + 1 and b0 + 2 <= k < b0 + 4:
                    add[(i + ox * (face + 1), j + oy * (face + 1), k)] = (*AMBER, 7.0, ("pl", pidx, b))
            elif kind == "vent":
                frame = not inner
                out[(i, j, k)] = (*GUN, 0.0, brick)
                if frame:
                    add[(i + ox, j + oy, k)] = (*GUN, 0.0, brick)
                else:
                    carve.add((i, j, k))
                    cav[(i - ox, j - oy, k)] = (*CAV, 0.0, ("cav", pidx, b))
                    if (k - b0) % 2 == 0:                  # slats
                        out[(i, j, k)] = (*CHAR, 0.0, ("slat", pidx, b, k))
                        carve.discard((i, j, k))
            elif kind == "hatch":
                col = tint(CRIM, H(pidx, b, 4))
                out[(i, j, k)] = (*col, 0.0, brick)
                add[(i + ox, j + oy, k)] = (*col, 0.0, brick)
                if not (2 <= loc < w - 2 and b0 + 2 <= k < b1 - 2):
                    add[(i + ox * 2, j + oy * 2, k)] = (*col, 0.0, ("hframe", pidx, b))
                if loc == 2 and k == b1 - 4:
                    add[(i + ox * 2, j + oy * 2, k)] = (*AMBER, 7.0, ("hl", pidx, b))
            elif kind == "lightbox":
                out[(i, j, k)] = (*tint(CHAR, H(pidx, b, 5), 0.3), 0.0, brick)
                add[(i + ox, j + oy, k)] = (*tint(CHAR, H(pidx, b, 5), 0.3), 0.0, brick)
                lx0 = 2 + int(H(pidx, b, 6) * max(1, w - 8))
                if lx0 <= loc < lx0 + 4 and b0 + 3 <= k < b0 + 6:
                    lc = CYAN if H(pidx, b, 41) < 0.45 else AMBER
                    add[(i + ox * 2, j + oy * 2, k)] = (*CHAR, 0.0, ("lb", pidx, b))
                    add[(i + ox * 3, j + oy * 3, k)] = (*lc, 8.0, ("lbl", pidx, b))
            else:  # recess
                if inner:
                    carve.add((i, j, k))
                    cav[(i - ox, j - oy, k)] = (*tint(GUN, H(pidx, b, 7), 0.3), 0.0, ("rec", pidx, b))
                else:
                    out[(i, j, k)] = (*GUN, 0.0, brick)
                    continue
                out[(i, j, k)] = (*GUN, 0.0, brick)
        elif role == "wall":
            si = int(per.info(i, j)[0] / S)
            seg, m16 = si // 16, si % 16
            if k >= K_SHELL_CUT - 2:
                out[(i, j, k)] = (*CHAR, 0.0, ("wcap", seg))
                continue
            if k <= 4:
                out[(i, j, k)] = (*CHAR, 0.0, ("wbase", seg))
                continue
            band = 0 if k <= 16 else 1
            col = tint(MID if band == 0 else (0.36, 0.36, 0.38), H(seg, band, 9))
            brick = ("wall", seg, band)
            h = H(seg, 77)
            if band == 1 and 36 <= k <= 37 and 4 <= m16 < 12 and h < 0.55:
                out[(i, j, k)] = (*CYAN, 8.0, ("wl", seg)); continue
            if band == 1 and h >= 0.45 and h < 0.85 and 3 <= m16 < 13 and 20 <= k <= 32:
                emissive = 4 <= m16 < 12 and 23 <= k <= 31
                out[(i, j, k)] = (*((0.08, 0.5, 0.95) if emissive else CHAR), 3.5 if emissive else 0.0, ("ws", seg, emissive))
                continue
            if band == 0 and k == 10 and 7 <= m16 < 9:
                out[(i, j, k)] = (*AMBER, 7.0, ("wa", seg)); continue
            out[(i, j, k)] = (*col, 0.0, brick)
        elif role in ("partition", "pillar"):
            if k > K_CUT + (1 if role == "pillar" else 0):
                if role == "pillar" and k == K_CUT + 2:
                    out[(i, j, k)] = (*CYAN, 2.5, ("pcap", oid))   # light strip on top of pillars/jambs
                continue                                           # cut-away (presentation)
            if role == "pillar":
                col = CHAR if k <= 4 else (GUN if k >= K_CUT else tint(LIGHT, H(oid, 3)))
                out[(i, j, k)] = (*col, 0.0, ("pillar", oid, k <= 4))
                continue
            seg = (i // 16) if spec["axis"] == "x" else (j // 16)
            if k >= K_CUT - 2:
                out[(i, j, k)] = (*CHAR, 0.0, ("pcap_wall", oid, seg))
                for dx, dy in (((0, 1), (0, -1)) if spec["axis"] == "x" else ((1, 0), (-1, 0))):
                    add[(i + dx, j + dy, k)] = (*CHAR, 0.0, ("pcap_wall", oid, seg))
                continue
            if k <= 4:
                out[(i, j, k)] = (*CHAR, 0.0, ("pbase", oid, seg)); continue
            band = 0 if k <= 14 else 1
            out[(i, j, k)] = (*tint(MID if band == 0 else LIGHT, H(oid, seg, band)), 0.0, ("part", oid, seg, band))
        elif role == "floor":
            ti, tj = i // 16, j // 16
            corridor = 3 <= (j * S) < 5 and (i * S) < 10
            if k < K_FLOOR_TOP:
                out[(i, j, k)] = (*CAV, 0.0, ("floorcore",)); continue
            col = tint(FLOOR2 if corridor else FLOOR, H(ti, tj, 3), 0.25)
            grate = H(ti, tj, 9) < (0.35 if corridor else 0.12)
            li, lj = i % 16, j % 16
            if grate and 3 <= li < 13 and 3 <= lj < 13:
                if lj % 2 == 0:
                    carve.add((i, j, k))
                    cav[(i, j, k - 1)] = (*CAV, 0.0, ("grate", ti, tj))
                else:
                    out[(i, j, k)] = (*GUN, 0.0, ("slatf", ti, tj, lj))
                continue
            out[(i, j, k)] = (*col, 0.0, ("tile", ti, tj))
        elif role in ("engine", "nozzle"):
            if role == "nozzle":
                ring = int(math.hypot((j + 0.5) * S - (2.0 if j * S < 4 else 6.0), (k + 0.5) * S - 1.5) / 0.25)
                col = CHAR if ring % 2 else GUN
                out[(i, j, k)] = (*col, 0.0, ("noz", oid, ring))
                continue
            bi, bj, bk = i // 12, j // 12, k // 12
            h = H(bi, bj, bk, oid)
            col = tint(LIGHT, h) if h < 0.62 else (tint(CHAR, h, 0.3) if h < 0.92 else tint(CRIM, h))
            out[(i, j, k)] = (*col, 0.0, ("eng", oid, bi, bj, bk))
        else:  # prop: authored colour, brick per object (split large boxes)
            col, e = spec["rgb"], spec["emit"]
            sp = spec["split"]
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


# --------------------------------------------------------------------------- 5. DAMAGE
IMPACTS = [((6.2, 9.1, 1.7), 0.95), ((2.6, 9.15, 2.5), 0.6), ((9.3, 8.6, 3.35), 0.7), ((12.6, -0.35, 1.4), 0.8)]


def damage(out, impacts):
    removed = 0
    for (cx, cy, cz), rad in impacts:
        r2 = rad + 0.35
        for i in range(int((cx - r2) / S) - 1, int((cx + r2) / S) + 2):
            for j in range(int((cy - r2) / S) - 1, int((cy + r2) / S) + 2):
                for k in range(max(0, int((cz - r2) / S) - 1), int((cz + r2) / S) + 2):
                    p = (i, j, k)
                    if p not in out:
                        continue
                    d = math.sqrt(((i + .5) * S - cx) ** 2 + ((j + .5) * S - cy) ** 2 + ((k + .5) * S - cz) ** 2)
                    jit = (H(i, j, k, 99) - 0.5) * 0.22
                    v = out[p]
                    if d < rad + jit:
                        del out[p]
                        removed += 1
                    elif d < rad + 0.12 + jit and H(i, j, k, 7) < 0.35:
                        hot = H(i, j, k, 13) > 0.82
                        out[p] = ((0.4, 0.125, 0.013) if hot else (0.035, 0.03, 0.035)) + ((6.0,) if hot else (0.0,)) + (v[4],)
                    elif d < r2 + jit and v[3] == 0.0:
                        f = 0.18 + 0.5 * (d - rad) / 0.35
                        out[p] = (v[0] * f, v[1] * f, v[2] * f * 0.9, 0.0, v[4])
    return removed


# --------------------------------------------------------------------------- 4. MESH
FACES = [((1, 0, 0), [(1, 0, 0), (1, 1, 0), (1, 1, 1), (1, 0, 1)]), ((-1, 0, 0), [(0, 0, 0), (0, 0, 1), (0, 1, 1), (0, 1, 0)]),
         ((0, 1, 0), [(0, 1, 0), (0, 1, 1), (1, 1, 1), (1, 1, 0)]), ((0, -1, 0), [(0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1)]),
         ((0, 0, 1), [(0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)]), ((0, 0, -1), [(0, 0, 0), (0, 1, 0), (1, 1, 0), (1, 0, 0)])]


def build_mesh(name, out, material, collection):
    """Exposed faces + brick-boundary faces on the surface skin; no vertex sharing across bricks."""
    bid, vidx, verts, faces, fcol = {}, {}, [], [], []
    surface = set()
    for (i, j, k) in out:
        for dx, dy, dz in D6:
            if (i + dx, j + dy, k + dz) not in out:
                surface.add((i, j, k))
                break
    for p, v in out.items():
        i, j, k = p
        b = bid.setdefault(v[4], len(bid))
        on_skin = p in surface
        for (dx, dy, dz), corners in FACES:
            q = (i + dx, j + dy, k + dz)
            nb = out.get(q)
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
    bev = ob.modifiers.new("brick_bevel", "BEVEL")  # offline stand-in for the runtime brick-edge shader
    bev.width, bev.segments, bev.limit_method, bev.angle_limit = 0.028, 2, "ANGLE", math.radians(30)
    bev.harden_normals = True
    bev.use_clamp_overlap = True
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
    b.inputs["Base Color"].default_value = (0.3, 0.7, 1.0, 1)
    b.inputs["Roughness"].default_value = 0.05
    b.inputs["Alpha"].default_value = 0.3
    b.inputs["Emission Color"].default_value = (0.1, 0.5, 1.0, 1)
    b.inputs["Emission Strength"].default_value = 0.8
    m.surface_render_method = "BLENDED"
    return m


# --------------------------------------------------------------------------- scene
ROOM_LIGHTS = [((2.0, 6.5), (1.0, 0.78, 0.55), 90), ((6.0, 6.5), (1.0, 0.55, 0.75), 110), ((9.0, 6.5), (1.0, 0.8, 0.6), 70),
               ((2.0, 1.5), (1.0, 0.8, 0.55), 90), ((5.5, 1.5), (0.8, 0.9, 1.0), 90), ((8.5, 1.5), (0.8, 1.0, 0.75), 90),
               ((2.5, 4.0), (0.6, 0.8, 1.0), 60), ((7.0, 4.0), (0.6, 0.8, 1.0), 60), ((12.0, 4.0), (0.4, 0.7, 1.0), 160)]


def nebula_world(sc):
    w = sc.world or bpy.data.worlds.new("World")
    sc.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    tc = nt.nodes.new("ShaderNodeTexCoord")
    noise = nt.nodes.new("ShaderNodeTexNoise"); noise.inputs["Scale"].default_value = 1.6; noise.inputs["Detail"].default_value = 6
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position, ramp.color_ramp.elements[0].color = 0.35, (0.004, 0.003, 0.02, 1)
    ramp.color_ramp.elements[1].position, ramp.color_ramp.elements[1].color = 0.75, (0.10, 0.02, 0.22, 1)
    vor = nt.nodes.new("ShaderNodeTexVoronoi"); vor.inputs["Scale"].default_value = 320
    lt = nt.nodes.new("ShaderNodeMath"); lt.operation = "LESS_THAN"; lt.inputs[1].default_value = 0.035
    mul = nt.nodes.new("ShaderNodeMath"); mul.operation = "MULTIPLY"; mul.inputs[1].default_value = 3.0
    add = nt.nodes.new("ShaderNodeMix"); add.data_type = "RGBA"; add.blend_type = "ADD"; add.inputs["Factor"].default_value = 1.0
    bg = nt.nodes.new("ShaderNodeBackground"); bg.inputs["Strength"].default_value = 1.0
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
    nebula_world(sc)
    key = bpy.data.objects.new("Key", bpy.data.lights.new("Key", "SUN"))
    sc.collection.objects.link(key)
    key.data.energy, key.data.color, key.data.angle = 2.4, (1.0, 0.93, 0.85), math.radians(8)
    key.rotation_euler = (math.radians(36), math.radians(-10), math.radians(150))
    fill = bpy.data.objects.new("Fill", bpy.data.lights.new("Fill", "AREA"))
    sc.collection.objects.link(fill)
    fill.data.energy, fill.data.size, fill.data.color = 900, 18, (0.55, 0.45, 1.0)
    fill.location = (4, 16, 10); fill.rotation_euler = (math.radians(-55), 0, math.radians(180))
    for n, ((x, y), col, power) in enumerate(ROOM_LIGHTS):
        pl = bpy.data.objects.new(f"room_{n}", bpy.data.lights.new(f"room_{n}", "POINT"))
        sc.collection.objects.link(pl)
        pl.data.energy, pl.data.color, pl.data.shadow_soft_size = power * 0.3, col, 0.8
        pl.location = (x, y, 2.1)
    for n, cy in enumerate((2.0, 6.0)):
        pl = bpy.data.objects.new(f"exhaust_{n}", bpy.data.lights.new(f"exhaust_{n}", "POINT"))
        sc.collection.objects.link(pl)
        pl.data.energy, pl.data.color, pl.data.shadow_soft_size = 400, (0.2, 0.5, 1.0), 0.8
        pl.location = (-5.8, cy, 1.5)
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
    return cam


def aim(cam, target, offset, lens):
    cam.data.lens = lens
    cam.location = Vector(target) + Vector(offset)
    cam.rotation_euler = (Vector(target) - cam.location).to_track_quat("-Z", "Y").to_euler()


def render(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print(f"rendered {path}", flush=True)


def main():
    args = parse_args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    authored = bpy.data.collections.new("AUTHORED_simple_shapes"); sc.collection.children.link(authored)
    runtime = bpy.data.collections.new("VOXEL_runtime"); sc.collection.children.link(runtime)
    a = Author(authored)
    author_section(a)
    authored.hide_render = True
    glass = bpy.data.objects["canopy_glass"]
    runtime.objects.link(glass)
    glass.data.materials.append(glass_material())

    occ = voxelize(a.objs)
    styled = style(occ, a.objs, Perimeter(footprint(0.0)))
    mat = vertex_color_material()
    clean, clean_faces, bricks = build_mesh("section_voxel", dict(styled), mat, runtime)
    removed = damage(styled, IMPACTS)
    hurt, hurt_faces, _ = build_mesh("section_damaged", styled, mat, runtime)
    print(f"voxel_style_prototype {REVISION}: authored_objects={len(a.objs)} cells={len(occ)} "
          f"styled_cells={len(styled) + removed} bricks={bricks} faces={clean_faces} "
          f"damaged_faces={hurt_faces} removed={removed}", flush=True)
    if args.no_render:
        return
    cam = setup_scene(tuple(int(v) for v in args.res.split("x")), args.samples)
    hurt.hide_render = True
    aim(cam, (4.4, 4.0, 0.5), (9.5, 13.5, 13.0), 30)
    render(f"{args.out}/{REVISION}_overview.png")
    if args.views == "overview":
        return
    aim(cam, (6.0, 8.9, 1.5), (2.8, 7.0, 3.2), 45)
    render(f"{args.out}/{REVISION}_hull_closeup.png")
    aim(cam, (5.4, 5.8, 0.6), (4.2, 5.6, 4.6), 32)
    render(f"{args.out}/{REVISION}_interior_closeup.png")
    clean.hide_render, hurt.hide_render = True, False
    aim(cam, (4.4, 4.0, 0.5), (9.5, 13.5, 13.0), 30)
    render(f"{args.out}/{REVISION}_damaged.png")


main()
