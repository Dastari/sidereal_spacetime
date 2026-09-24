"""Shipyard voxel-structure prototype (design evidence, not a production exporter).

Pipeline demonstrated (see docs/shipyard_player_builder_design.md):

  1. AUTHOR  - ordered, role-tagged primitive layers on the 1 m build grid
               (boxes, footprint prisms with a 45-degree slope and an r=3 m arc,
               cylinders). Later layers win; role "void" carves. No voxel
               awareness is required from the author (human or agent).
  2. SAMPLE  - scanline ray casting at 1/16 m (62.5 mm) cell centres on the
               global ship lattice, so adjacent tiles always share one grid.
  3. STYLE   - deterministic, world-seeded faction style pass: hull panel
               seams, raised plates, vents, running lights, rim greebles,
               two-tone interior walls, floor grating. Identical inputs always
               give identical cells; panels continue across tile seams.
  4. MESH    - exposed faces only, one material, colour + emission in
               face-corner attributes (one draw call per chunk).
  5. DAMAGE  - optional: spherical impacts remove cells (the authoritative
               part) and scorch the crater lip (presentation).

Usage (headless):
  blender -b -P scripts/art_library/voxel_style_prototype.py -- \
      --out /tmp/voxel-proto [--res 1672x941] [--samples 32] [--no-render]

Outputs overview.png, damaged.png, damage_closeup.png and prints cell/face
statistics. Glass is kept as a real optical mesh and is never voxelised.
"""
import argparse
import bisect
import math
import sys
from collections import Counter

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

S = 1.0 / 16.0  # voxel edge (m); 2 lattice units of the 1/32 m construction lattice
FT, WT = 0.1875, 3.1875  # floor top and wall top datums of the approved 3.5 m deck profile
ROLES = [
    "void", "hull", "floor", "wall", "partition", "doorframe", "light_cyan", "light_amber",
    "bedframe", "blanket", "sofa", "table", "console", "screen", "crate_a", "crate_b",
    "plant", "pot", "engine", "glow", "enginering", "poster", "seat", "medred",
]
RID = {r: i for i, r in enumerate(ROLES)}
R2 = math.sqrt(2.0)


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--out", default="/tmp/voxel-proto")
    p.add_argument("--res", default="1672x941")
    p.add_argument("--samples", type=int, default=32)
    p.add_argument("--no-render", action="store_true")
    return p.parse_args(argv)


# --------------------------------------------------------------------------- 1. AUTHOR
def footprint(d, arc_seg=48):
    """14 x 8 m floor on the 1 m grid, offset by d (outward +, inward -).

    Starboard bow is a 45-degree slope (11,0)->(14,3); port bow is a quarter
    arc of radius 3 m centred on (11,5)."""
    pts = [(-d, -d), (11 + d * R2 - d, -d), (14 + d, 3 + d - d * R2)]
    r = 3 + d
    for s in range(arc_seg + 1):
        a = (math.pi / 2) * s / arc_seg
        pts.append((11 + r * math.cos(a), 5 + r * math.sin(a)))
    pts.append((-d, 8 + d))
    return pts


class Author:
    def __init__(self, collection):
        self.col = collection
        self.order = 0

    def _link(self, name, bm, role):
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new(name, me)
        self.col.objects.link(ob)
        ob["role"] = role
        ob["order"] = self.order
        self.order += 1
        return ob

    def prism(self, name, pts, z0, z1, role):
        bm = bmesh.new()
        b = [bm.verts.new((x, y, z0)) for x, y in pts]
        t = [bm.verts.new((x, y, z1)) for x, y in pts]
        bm.faces.new(list(reversed(b)))
        bm.faces.new(t)
        for i in range(len(pts)):
            j = (i + 1) % len(pts)
            bm.faces.new((b[i], b[j], t[j], t[i]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return self._link(name, bm, role)

    def box(self, name, x0, y0, z0, x1, y1, z1, role):
        return self.prism(name, [(x0, y0), (x1, y0), (x1, y1), (x0, y1)], z0, z1, role)

    def cyl_x(self, name, x0, x1, cy, cz, r, role, seg=40):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg,
                              radius1=r, radius2=r, depth=x1 - x0)
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, "Y"))
        bmesh.ops.translate(bm, verts=bm.verts, vec=((x0 + x1) / 2, cy, cz))
        return self._link(name, bm, role)


def author_section(a):
    a.prism("hull_outer", footprint(1.0), 0.0, 3.375, "hull")      # 1 m armor cells outside the tile edge
    a.prism("hull_void", footprint(0.0), FT, 4.0, "void")
    a.prism("floor", footprint(0.0), 0.0, FT, "floor")
    a.prism("wall_ext", footprint(0.0), FT, WT, "wall")            # 250 mm inward exterior wall
    a.prism("wall_void", footprint(-0.25), FT, 4.0, "void")
    a.box("canopy_void", 13.0, 2.6, 1.05, 15.5, 5.4, 2.85, "void")
    h = 0.125                                                       # partitions centred on cell edges
    for x0, y0, x1, y1 in [(0, 5 - h, 10, 5 + h), (0, 3 - h, 10, 3 + h), (4 - h, 5, 4 + h, 8), (8 - h, 5, 8 + h, 8),
                           (4 - h, 0, 4 + h, 3), (7 - h, 0, 7 + h, 3), (10 - h, 0, 10 + h, 8)]:
        a.box(f"partition_{x0}_{y0}", x0, y0, FT, x1, y1, WT, "partition")
    for ax, c, f0 in [("y", 5, 1), ("y", 5, 5), ("y", 3, 1), ("y", 3, 5), ("y", 3, 8), ("x", 10, 3)]:
        # 2 m door module: 0.375 m jambs, 1.25 m clear, 2.25 m high
        spans = [(f0, f0 + 0.375, FT, 2.625, "doorframe"), (f0 + 1.625, f0 + 2, FT, 2.625, "doorframe"),
                 (f0 + 0.375, f0 + 1.625, 2.4375, 2.625, "light_cyan")]
        for n, (u0, u1, z0, z1, role) in enumerate(spans):
            if ax == "y":
                a.box(f"door_{c}_{f0}_{n}", u0, c - 0.1875, z0, u1, c + 0.1875, z1, role)
            else:
                a.box(f"door_{c}_{f0}_{n}", c - 0.1875, u0, z0, c + 0.1875, u1, z1, role)
        if ax == "y":
            a.box(f"door_{c}_{f0}_void", f0 + 0.375, c - 0.3, FT, f0 + 1.625, c + 0.3, 2.4375, "void")
        else:
            a.box(f"door_{c}_{f0}_void", c - 0.3, f0 + 0.375, FT, c + 0.3, f0 + 1.625, 2.4375, "void")
    props = [
        ("bed1", 0.375, 6.625, FT, 2.375, 7.625, 0.625, "bedframe"), ("blanket1", 0.4375, 6.6875, 0.625, 1.875, 7.5625, 0.75, "blanket"),
        ("pillow1", 1.875, 6.75, 0.625, 2.3125, 7.5, 0.8125, "bedframe"), ("bed2", 0.375, 6.625, 1.375, 2.375, 7.625, 1.5625, "bedframe"),
        ("blanket2", 0.4375, 6.6875, 1.5625, 1.875, 7.5625, 1.6875, "blanket"), ("bedpost", 0.375, 6.625, 0.625, 0.5, 6.75, 1.375, "console"),
        ("locker", 3.0, 7.25, FT, 3.75, 7.75, 2.25, "console"), ("locker_light", 3.125, 7.1875, 1.5, 3.625, 7.25, 1.625, "light_amber"),
        ("sofa_base", 4.5, 7.0, FT, 7.25, 7.75, 0.625, "sofa"), ("sofa_back", 4.5, 7.5, 0.625, 7.25, 7.75, 1.125, "sofa"),
        ("sofa_arm", 4.5, 6.0, FT, 5.125, 7.75, 0.625, "sofa"), ("table", 5.5, 6.0, FT, 6.75, 6.75, 0.5625, "table"),
        ("pot", 7.25, 5.5, FT, 7.75, 6.0, 0.5625, "pot"), ("plant", 7.125, 5.375, 0.5625, 7.875, 6.125, 1.3125, "plant"),
        ("poster", 5.25, 7.6875, 1.5, 6.5, 7.75, 2.5, "poster"),
        ("crateA", 0.5, 0.5, FT, 1.25, 1.25, 0.9375, "crate_a"), ("crateB", 1.375, 0.5, FT, 2.125, 1.25, 0.9375, "crate_b"),
        ("crateC", 0.5, 0.5, 0.9375, 1.25, 1.25, 1.6875, "crate_b"), ("crateD", 2.75, 0.5, FT, 3.5, 1.25, 0.9375, "crate_a"),
        ("crateE", 0.5, 1.5, FT, 1.25, 2.25, 0.6875, "crate_a"),
        ("medbed", 4.5, 0.5, FT, 5.5, 2.375, 0.75, "bedframe"), ("medsheet", 4.5625, 0.5625, 0.75, 5.4375, 1.9375, 0.8125, "medred"),
        ("medcab", 6.0, 0.4375, FT, 6.625, 0.875, 2.0, "bedframe"), ("medscreen", 6.0625, 0.875, 1.25, 6.5625, 0.9375, 1.75, "screen"),
        ("bench", 7.5, 0.4375, FT, 9.5, 1.1875, 1.0, "console"), ("tool", 8.0, 0.625, 1.0, 8.625, 1.0, 1.25, "crate_a"),
        ("trays", 7.5, 2.0, FT, 9.5, 2.5625, 0.6875, "pot"), ("greens", 7.5625, 2.0625, 0.6875, 9.4375, 2.5, 0.9375, "plant"),
        ("seat", 11.5, 3.5, FT, 12.25, 4.5, 1.25, "seat"), ("consoleA", 12.75, 2.25, FT, 13.25, 5.75, 1.0, "console"),
        ("screenA", 12.8125, 2.375, 1.0, 13.1875, 5.625, 1.125, "screen"), ("consoleB", 10.75, 0.875, FT, 12.0, 1.5, 1.0, "console"),
        ("screenB", 10.8125, 1.4375, 1.0, 11.9375, 1.5, 1.5, "screen"), ("consoleC", 10.75, 6.5, FT, 12.0, 7.125, 1.0, "console"),
        ("screenC", 10.8125, 6.5, 1.0, 11.9375, 6.5625, 1.5, "screen"),
    ]
    for p in props:
        a.box(*p)
    for x in range(1, 10, 2):
        a.box(f"corr_light_{x}", x, 3.1875, FT, x + 0.5, 3.3125, 0.25, "light_amber")
        a.box(f"corr_lightN_{x}", x, 4.6875, FT, x + 0.5, 4.8125, 0.25, "light_amber")
    for n, cy in [("P", 2.0), ("S", 6.0)]:
        a.cyl_x(f"engine_{n}", -4.0, 0.5, cy, 1.5, 1.3, "engine")
        a.cyl_x(f"engine_ring_{n}", -3.0, -2.625, cy, 1.5, 1.4375, "enginering")
        a.cyl_x(f"engine_bell_{n}", -4.5, -4.0, cy, 1.5, 1.125, "enginering")
        a.cyl_x(f"engine_glow_{n}", -4.625, -4.5, cy, 1.5, 0.9375, "glow")
    a.box("canopy_glass", 14.125, 2.6, 1.05, 14.25, 5.4, 2.85, "glass")


# --------------------------------------------------------------------------- 2. SAMPLE
def voxelize(objects):
    dg = bpy.context.evaluated_depsgraph_get()
    occ = {}
    for ob in sorted((o for o in objects if o["role"] != "glass"), key=_order):
        rid = RID[ob["role"]]
        bm = bmesh.new()
        bm.from_object(ob, dg)
        bm.transform(ob.matrix_world)
        bvh = BVHTree.FromBMesh(bm)
        xs = [v.co.x for v in bm.verts]
        ys = [v.co.y for v in bm.verts]
        zs = [v.co.z for v in bm.verts]
        bm.free()
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
                for a in range(0, len(hits) - 1, 2):
                    za, zb = hits[a], hits[a + 1]
                    for k in range(math.floor(za / S), math.ceil(zb / S)):
                        if za <= (k + 0.5) * S <= zb:
                            if rid == 0:
                                occ.pop((i, j, k), None)
                            else:
                                occ[(i, j, k)] = rid
    return occ


def _order(ob):
    return ob["order"]


# --------------------------------------------------------------------------- 3. STYLE
def H(*a):
    """Deterministic integer hash -> [0, 1). Seeded by world cells, never by RNG state."""
    h = 2166136261
    for v in a:
        h = ((h ^ (v & 0xFFFFFFFF)) * 16777619) & 0xFFFFFFFF
        h ^= h >> 13
    return (h % 100000) / 100000.0


WHITE = (0.80, 0.80, 0.85); LGREY = (0.52, 0.53, 0.60); NAVY = (0.055, 0.06, 0.15)
SLATE = (0.14, 0.15, 0.24); RED = (0.60, 0.025, 0.07); SEAM = (0.03, 0.03, 0.06)
AMBER = (1.0, 0.42, 0.06); CYAN = (0.05, 0.6, 1.0)
HULL_PALETTE = [(WHITE, 0.50), (LGREY, 0.14), (NAVY, 0.22), (RED, 0.09), (SLATE, 0.05)]
EMIT = {"light_cyan": (CYAN, 9.0), "light_amber": (AMBER, 9.0), "screen": ((0.1, 0.7, 1.0), 5.0),
        "poster": ((0.55, 0.12, 1.0), 5.0), "glow": ((0.15, 0.55, 1.0), 22.0)}
FLAT = {"doorframe": NAVY, "bedframe": (0.82, 0.82, 0.86), "blanket": (0.03, 0.16, 0.75), "sofa": (0.62, 0.03, 0.06),
        "table": (0.8, 0.2, 0.4), "console": (0.08, 0.09, 0.2), "crate_a": (0.9, 0.48, 0.02), "crate_b": (0.06, 0.2, 0.62),
        "plant": (0.08, 0.48, 0.06), "pot": (0.8, 0.8, 0.84), "seat": (0.05, 0.05, 0.09), "medred": (0.7, 0.02, 0.05),
        "enginering": NAVY}
BANDS = [0, 10, 26, 42, 51, 56]  # hull panel bands in voxel rows
TOPK = 53                        # top hull row (3.375 m)


def pick(h):
    acc = 0.0
    for c, w in HULL_PALETTE:
        acc += w
        if h < acc:
            return c
    return WHITE


def tint(c, h):
    f = 0.95 + 0.09 * h
    return (c[0] * f, c[1] * f, c[2] * f)


class Perimeter:
    """Arc-length and signed distance along the floor boundary, so panel layout
    follows slopes and curves instead of the axis the cell happens to face."""

    def __init__(self, poly):
        self.segs, acc = [], 0.0
        for a in range(len(poly)):
            p, q = poly[a], poly[(a + 1) % len(poly)]
            L = math.hypot(q[0] - p[0], q[1] - p[1])
            self.segs.append((p, q, L, acc))
            acc += L
        self.length = acc
        self.cache = {}
        self.breaks, s = [], 0
        while s * S < self.length + 2:
            self.breaks.append(s)
            s += [8, 12, 16, 16, 24][int(H(s, 7) * 5)]

    def info(self, i, j):
        v = self.cache.get((i, j))
        if v is not None:
            return v
        x, y = (i + 0.5) * S, (j + 0.5) * S
        best, bs, inside = 1e9, 0.0, True
        for p, q, L, a0 in self.segs:
            dx, dy = q[0] - p[0], q[1] - p[1]
            if dx * (y - p[1]) - dy * (x - p[0]) < 0:
                inside = False
            t = max(0.0, min(1.0, ((x - p[0]) * dx + (y - p[1]) * dy) / (L * L)))
            dd = math.hypot(x - (p[0] + t * dx), y - (p[1] + t * dy))
            if dd < best:
                best, bs = dd, a0 + t * L
        v = (bs, best if not inside else -best)
        self.cache[(i, j)] = v
        return v

    def panel(self, si):
        ix = bisect.bisect_right(self.breaks, si) - 1
        return ix, si - self.breaks[ix], self.breaks[ix + 1] - self.breaks[ix]


def band(k):
    for b in range(len(BANDS) - 1):
        if BANDS[b] <= k < BANDS[b + 1]:
            return b, BANDS[b]
    return len(BANDS) - 2, BANDS[-2]


def style(occ, per):
    out, add, carve, darken = {}, {}, set(), set()
    d4 = [(1, 0), (-1, 0), (0, 1), (0, -1)]
    for (i, j, k), r in occ.items():
        role = ROLES[r]
        if role == "hull":
            s, sd = per.info(i, j)
            pidx, loc, w = per.panel(int(s / S))
            b, bs = band(k)
            hp = H(pidx, b, 11)
            if b == 4:
                h4 = H(pidx, 3)
                base = LGREY if h4 < 0.22 else (RED if h4 < 0.3 else NAVY)
            elif b == 0:
                base = SLATE if H(pidx, 5) < 0.6 else NAVY
            else:
                base = pick(hp)
            c, e = tint(base, H(pidx, b, 2)), 0.0
            if k == TOPK and (i, j, k + 1) not in occ:          # rim seams + greebles
                if loc == 0:
                    carve.add((i, j, k)); darken.add((i, j, k - 1))
                else:
                    ht = H(pidx, 61)
                    if ht < 0.45 and 2 <= loc < w - 2 and 0.25 < sd < 0.75:
                        add[(i, j, k + 1)] = (*tint(LGREY if ht < 0.15 else SLATE, H(pidx, 62)), 0.0)
                    elif ht > 0.9 and 3 <= loc < 5 and 0.4 < sd < 0.6:
                        add[(i, j, k + 1)] = (*AMBER, 9.0)
            outd = None
            for dx, dy in d4:
                if (i + dx, j + dy, k) not in occ and per.info(i + dx, j + dy)[1] > sd:
                    outd = (dx, dy)
                    break
            if outd is not None and b in (1, 2, 3):              # outer skin
                back = (i - outd[0], j - outd[1], k)
                if loc == 0 or k == bs:
                    carve.add((i, j, k)); darken.add(back)
                elif H(pidx, b, 31) < 0.22 and 3 <= loc < 6 and bs + 3 <= k < bs + 5:
                    c, e = (AMBER if H(pidx, b, 41) < 0.7 else CYAN), 9.0
                    add[(i + outd[0], j + outd[1], k)] = (*c, 9.0)
                elif w >= 12 and H(pidx, b, 51) < 0.2 and 2 <= loc < w - 2 and bs + 2 <= k < BANDS[b + 1] - 2:
                    if (k - bs) % 2 == 0:
                        carve.add((i, j, k)); darken.add(back)
                    else:
                        c = tint(NAVY, 0.5)
                elif hp < 0.30:
                    add[(i + outd[0], j + outd[1], k)] = (*c, 0.0)
            out[(i, j, k)] = (*c, e)
        elif role in ("wall", "partition"):
            if k >= 49 or k <= 4:
                c = NAVY
            else:
                if role == "wall":
                    si = int(per.info(i, j)[0] / S)
                else:
                    si = i + j
                m32 = si % 32
                if m32 < 2 and k >= 5:
                    c = SLATE
                elif k <= 16:
                    c = (0.36, 0.37, 0.45) if role == "wall" else (0.40, 0.40, 0.50)
                elif k == 17:
                    c = NAVY
                else:
                    c = (0.68, 0.68, 0.74) if role == "wall" else (0.62, 0.61, 0.72)
                if role == "wall":
                    if 36 <= k <= 37 and 8 <= m32 < 20:
                        out[(i, j, k)] = (*CYAN, 9.0); continue
                    if k == 8 and 14 <= m32 < 16:
                        out[(i, j, k)] = (*AMBER, 7.0); continue
                    hw = H(si // 32, 77)
                    if hw < 0.3 and 21 <= k <= 31 and 8 <= m32 < 22:
                        c = (0.07, 0.08, 0.18)
                        if 23 <= k <= 29 and 10 <= m32 < 20 and hw < 0.15:
                            out[(i, j, k)] = (0.08, 0.55, 0.95, 3.5); continue
            out[(i, j, k)] = (*c, 0.0)
        elif role == "floor":
            if i % 16 == 0 or j % 16 == 0:
                c = (0.07, 0.075, 0.1)
            else:
                c = tint((0.2, 0.21, 0.27), H(i // 16, j // 16, 3))
                if k == 2 and H(i // 16, j // 16, 9) < 0.2 and (i + j) % 2 == 0:
                    carve.add((i, j, k)); darken.add((i, j, k - 1))
            out[(i, j, k)] = (*c, 0.0)
        elif role == "engine":
            h = H(i // 8, j // 40, 5)
            out[(i, j, k)] = (*tint(RED if h < 0.15 else (NAVY if h < 0.45 else WHITE), H(i // 8, 1)), 0.0)
        elif role in EMIT:
            c, e = EMIT[role]
            out[(i, j, k)] = (*c, e)
        else:
            out[(i, j, k)] = (*FLAT.get(role, (1, 0, 1)), 0.0)
    for p in carve:
        out.pop(p, None)
    for p in darken:
        if p in out and out[p][3] == 0.0:
            out[p] = (*SEAM, 0.0)
    for p, v in add.items():
        out.setdefault(p, v)
    return out


# --------------------------------------------------------------------------- 5. DAMAGE
IMPACTS = [((6.2, 9.05, 1.7), 0.95), ((2.6, 9.1, 2.5), 0.6), ((9.3, 8.6, 3.35), 0.7), ((12.6, -0.3, 1.4), 0.8)]


def damage(out, impacts):
    """Remove cells inside jittered spheres (the part authority would own), then
    scorch the lip and leave sparse embers (pure presentation)."""
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
                    if d < rad + jit:
                        del out[p]
                        removed += 1
                    elif d < rad + 0.12 + jit and H(i, j, k, 7) < 0.35:
                        out[p] = (2.4 / 6, 0.75 / 6, 0.08 / 6, 6.0) if H(i, j, k, 13) > 0.82 else (0.035, 0.03, 0.035, 0.0)
                    elif d < r2 + jit and out[p][3] == 0.0:
                        v, f = out[p], 0.18 + 0.5 * (d - rad) / 0.35
                        out[p] = (v[0] * f, v[1] * f, v[2] * f * 0.9, 0.0)
    return removed


# --------------------------------------------------------------------------- 4. MESH
DIRS = [((1, 0, 0), [(1, 0, 0), (1, 1, 0), (1, 1, 1), (1, 0, 1)]), ((-1, 0, 0), [(0, 0, 0), (0, 0, 1), (0, 1, 1), (0, 1, 0)]),
        ((0, 1, 0), [(0, 1, 0), (0, 1, 1), (1, 1, 1), (1, 1, 0)]), ((0, -1, 0), [(0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1)]),
        ((0, 0, 1), [(0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)]), ((0, 0, -1), [(0, 0, 0), (0, 1, 0), (1, 1, 0), (1, 0, 0)])]


def build_mesh(name, out, material, collection):
    vidx, verts, faces, fcol = {}, [], [], []
    for (i, j, k), v in out.items():
        for (dx, dy, dz), corners in DIRS:
            if (i + dx, j + dy, k + dz) in out or (dz == -1 and k <= 0):
                continue
            f = []
            for a, b, c in corners:
                key = (i + a, j + b, k + c)
                ix = vidx.get(key)
                if ix is None:
                    ix = vidx[key] = len(verts)
                    verts.append((key[0] * S, key[1] * S, key[2] * S))
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
    ob = bpy.data.objects.new(name, me)
    collection.objects.link(ob)
    bev = ob.modifiers.new("brick_bevel", "BEVEL")  # molded studless edge, geometry cells unchanged
    bev.width, bev.segments, bev.limit_method, bev.angle_limit = 0.012, 2, "ANGLE", math.radians(35)
    return ob, len(faces)


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
    b.inputs["Roughness"].default_value = 0.42
    nt.links.new(b.outputs[0], out.inputs[0])
    return m


def glass_material():
    m = bpy.data.materials.new("canopy_glass")
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (0.3, 0.7, 1.0, 1)
    b.inputs["Roughness"].default_value = 0.05
    b.inputs["Alpha"].default_value = 0.35
    b.inputs["Emission Color"].default_value = (0.1, 0.5, 1.0, 1)
    b.inputs["Emission Strength"].default_value = 0.6
    m.surface_render_method = "BLENDED"
    return m


# --------------------------------------------------------------------------- scene
def setup_scene(res, samples):
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE_NEXT"
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.eevee.taa_render_samples = samples
    sc.eevee.use_raytracing = True
    w = sc.world or bpy.data.worlds.new("World")
    sc.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.010, 0.004, 0.028, 1)
    for name, kind, energy, color in [("Key", "SUN", 2.6, (0.9, 0.9, 1.0)), ("Fill", "AREA", 700, (1.0, 0.92, 0.85)),
                                      ("Rim", "AREA", 500, (0.6, 0.4, 1.0))]:
        ob = bpy.data.objects.new(name, bpy.data.lights.new(name, kind))
        sc.collection.objects.link(ob)
        ob.data.energy, ob.data.color = energy, color
    bpy.data.objects["Key"].rotation_euler = (math.radians(38), math.radians(-18), math.radians(160))
    fill = bpy.data.objects["Fill"]; fill.data.size = 14; fill.location = (5, 4, 9)
    rim = bpy.data.objects["Rim"]; rim.data.size = 10; rim.location = (4, -8, 4); rim.rotation_euler = (math.radians(-70), 0, 0)
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    # Owner grading note (2026-09-25): gamma up, contrast down, saturation up.
    sc.view_settings.view_transform, sc.view_settings.look = "Standard", "None"
    sc.view_settings.exposure, sc.view_settings.gamma = -0.15, 1.06
    sc.use_nodes = True
    ct = sc.node_tree
    ct.nodes.clear()
    rl = ct.nodes.new("CompositorNodeRLayers")
    gl = ct.nodes.new("CompositorNodeGlare"); gl.glare_type, gl.threshold, gl.size, gl.mix = "FOG_GLOW", 0.9, 7, 0.0
    hs = ct.nodes.new("CompositorNodeHueSat"); hs.inputs["Saturation"].default_value = 1.3
    bc = ct.nodes.new("CompositorNodeBrightContrast"); bc.inputs["Contrast"].default_value = -4.0
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


def main():
    args = parse_args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    authored = bpy.data.collections.new("AUTHORED_simple_shapes"); sc.collection.children.link(authored)
    runtime = bpy.data.collections.new("VOXEL_runtime"); sc.collection.children.link(runtime)
    author_section(Author(authored))
    authored.hide_render = True
    glass = bpy.data.objects["canopy_glass"]
    runtime.objects.link(glass)
    glass.data.materials.append(glass_material())

    occ = voxelize(list(authored.objects))
    per = Perimeter(footprint(0.0))
    styled = style(occ, per)
    mat = vertex_color_material()
    clean, clean_faces = build_mesh("section_voxel", dict(styled), mat, runtime)
    removed = damage(styled, IMPACTS)
    hurt, hurt_faces = build_mesh("section_damaged", styled, mat, runtime)
    counts = Counter(ROLES[r] for r in occ.values())
    print(f"voxel_style_prototype: cells={len(occ)} faces={clean_faces} damaged_faces={hurt_faces} "
          f"removed={removed} roles={dict(counts.most_common())}")
    if args.no_render:
        return
    res = tuple(int(v) for v in args.res.split("x"))
    cam = setup_scene(res, args.samples)
    aim(cam, (5.2, 4.0, 0.3), (9.0, 13.0, 21.0), 38)
    hurt.hide_render = True
    render(f"{args.out}/overview.png")
    clean.hide_render, hurt.hide_render = True, False
    render(f"{args.out}/damaged.png")
    aim(cam, (6.2, 8.9, 1.8), (1.5, 7.5, 3.2), 45)
    render(f"{args.out}/damage_closeup.png")


main()
