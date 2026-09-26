"""Voxel painting grid and brick-island mesher for the crew head kit.

Authoring units are character voxels (1 v = 1/32 m, CHARACTER_SPEC.md). Painting snaps to a
sub-grid of SUB cells per voxel (1/128 m), so primary shapes stay on the 1/32 m grid while face
relief/decals can be a quarter voxel proud of the skin. The mesher emits only exposed cell faces per
*island* (a brick), dissolves coplanar faces per material and leaves the islands disconnected, so the
bevel modifier turns every island into a slightly bevelled studless brick (the ship-kit look from
scripts/art_library/ship_kit_prototype.py, without its interior box faces).
"""
from __future__ import annotations

import numpy as np

V = 1.0 / 32.0            # metres per character voxel
SUB = 8                   # paint cells per voxel -> 1/256 m (relief layers never share a front plane)
CELL = V / SUB
LO = np.array([-17.0, -17.0, -16.0])   # grid origin in fine voxels (head space)
HI = np.array([17.0, 17.0, 28.0])
SHAPE = tuple(int(v) for v in (HI - LO) * SUB)

SLOTS = ["skin", "hair", "eye", "suit_primary", "suit_secondary", "accent", "metal", "dark", "emit", "glass", "face"]
# "face" = the flat front face region carrying the animated pixel-art face texture (FACE_ATLAS_SPEC)
SI = {s: i for i, s in enumerate(SLOTS)}

# --------------------------------------------------------------------------- design -> spec v2 mapping
# Parts are authored in *design units* around a compact design skull (x -6..6, y -6..6, z 0..13, face at
# -Y). Spec v2 (chibi) wants a skull of about 17 x 16 x 18 fine voxels (0.52 x 0.50 x 0.56 m). The map is
# piecewise linear per axis: inside the design skull it stretches to the v2 skull; outside it keeps
# thicknesses (relief layers in front of the face are preserved exactly, so swappable face layers never
# share a front plane; hair/hat/helmet volume elsewhere grows by KO).
SKULL_D = (6.0, 6.0, 13.0)      # design half-width x, half-depth y, height z
SKULL_V = (8.0, 7.0, 16.0)      # spec v2 round 2 (head ~10 % smaller): 16 x 14 x 16 fine voxels
FACE_CANVAS = (16, 16)          # face canvas px = fine voxels (width, height): x -8..8, z 0..16
KO = 1.5                        # outside-skull thickness factor (hair, hats, helmets; helmets stay inside the r004 envelope)
KO_FRONT = 1.0                  # in front of the face plane (face relief layers)
SNAP = 0.125                    # mapped box corners snap to the paint cell
FACE_PLUS_Y = True              # export frame: armature axes, face +Y (authoring keeps face at -Y)


def fwd(v, axis):
    """Design units -> v2 fine voxels (vectorised)."""
    v = np.asarray(v, dtype=np.float64)
    if axis == 2:
        h, H = SKULL_D[2], SKULL_V[2]
        return np.where(v > h, H + (v - h) * KO, np.where(v < 0, v * KO, v * H / h))
    h, H = SKULL_D[axis], SKULL_V[axis]
    a = np.abs(v)
    ko = KO_FRONT if axis == 1 else KO
    out = np.where(a <= h, a * H / h, H + (a - h) * np.where((axis == 1) & (v < 0), ko, KO))
    return np.sign(v) * out


def inv(v, axis):
    """v2 fine voxels -> design units (vectorised)."""
    v = np.asarray(v, dtype=np.float64)
    if axis == 2:
        h, H = SKULL_D[2], SKULL_V[2]
        return np.where(v > H, h + (v - H) / KO, np.where(v < 0, v / KO, v * h / H))
    h, H = SKULL_D[axis], SKULL_V[axis]
    a = np.abs(v)
    k = np.where((axis == 1) & (v < 0), KO_FRONT, KO)
    out = np.where(a <= H, a * h / H, h + (a - H) / k)
    return np.sign(v) * out


def snapv(v):
    return float(np.round(np.asarray(v) / SNAP) * SNAP)


def _idx(v, axis):
    """Design coordinate -> paint cell index (after the v2 map)."""
    return int(round((snapv(fwd(v, axis)) - LO[axis]) * SUB))


class Grid:
    """Island-labelled voxel paint grid. `isl` 0 = empty; `slot` = material slot index."""

    def __init__(self, name):
        self.name = name
        self.isl = np.zeros(SHAPE, np.int16)
        self.slot = np.zeros(SHAPE, np.int8)
        self.cur = 1

    # ------------------------------------------------------------------ painting
    def new(self):
        """Start a new brick island (a separate bevelled piece)."""
        self.cur = int(self.isl.max()) + 1 if self.isl.any() else max(self.cur, 1)
        return self

    def _sl(self, x0, y0, z0, x1, y1, z1):
        xa, xb = sorted((x0, x1))
        ya, yb = sorted((y0, y1))
        za, zb = sorted((z0, z1))
        return (slice(max(0, _idx(xa, 0)), max(0, _idx(xb, 0))), slice(max(0, _idx(ya, 1)), max(0, _idx(yb, 1))),
                slice(max(0, _idx(za, 2)), max(0, _idx(zb, 2))))

    def box(self, x0, y0, z0, x1, y1, z1, slot, sym=False, isl=None):
        s = self._sl(x0, y0, z0, x1, y1, z1)
        self.isl[s] = self.cur if isl is None else isl
        self.slot[s] = SI[slot]
        if sym:
            self.box(-x1, y0, z0, -x0, y1, z1, slot, isl=isl)
        return self

    def fill(self, x0, y0, z0, x1, y1, z1, slot, sym=False):
        """Paint only empty cells (keeps earlier islands intact)."""
        s = self._sl(x0, y0, z0, x1, y1, z1)
        empty = self.isl[s] == 0
        self.isl[s][empty] = self.cur
        self.slot[s][empty] = SI[slot]
        if sym:
            self.fill(-x1, y0, z0, -x0, y1, z1, slot)
        return self

    def cut(self, x0, y0, z0, x1, y1, z1, sym=False):
        s = self._sl(x0, y0, z0, x1, y1, z1)
        self.isl[s] = 0
        self.slot[s] = 0
        if sym:
            self.cut(-x1, y0, z0, -x0, y1, z1)
        return self

    def paint(self, x0, y0, z0, x1, y1, z1, slot, sym=False):
        """Recolour occupied cells only (stripes/trim on a surface without a new brick)."""
        s = self._sl(x0, y0, z0, x1, y1, z1)
        occ = self.isl[s] > 0
        self.slot[s][occ] = SI[slot]
        if sym:
            self.paint(-x1, y0, z0, -x0, y1, z1, slot)
        return self

    def region(self, x0, y0, z0, x1, y1, z1, fn, slot, q=1.0, only_empty=False, cut=False):
        """Paint cells in a (design-unit) bounding box where fn(X, Y, Z) is true in design units. Cells are
        quantised to q *fine voxels* in v2 space first, so procedural shapes step on the 1/32 m grid
        (q = 1) or the 2-voxel main-block grid (q = 2), then tested at their design-space position."""
        s = self._sl(x0, y0, z0, x1, y1, z1)
        ax = [LO[a] + (np.arange(s[a].start, s[a].stop) + 0.5) / SUB for a in range(3)]
        ax = [inv((np.floor(a / q) + 0.5) * q, i) for i, a in enumerate(ax)]
        X, Y, Z = np.ix_(*ax)
        m = np.broadcast_to(fn(X, Y, Z), (len(ax[0]), len(ax[1]), len(ax[2])))
        if only_empty:
            m = m & (self.isl[s] == 0)
        if cut:
            self.isl[s][m] = 0
            self.slot[s][m] = 0
        else:
            self.isl[s][m] = self.cur
            self.slot[s][m] = SI[slot]
        return self

    def mask_cut(self, mask):
        self.isl[mask] = 0
        self.slot[mask] = 0
        return self

    def centers(self):
        """Design-unit coordinates of every cell centre, as broadcastable open-grid arrays."""
        axes = [inv(LO[a] + (np.arange(SHAPE[a]) + 0.5) / SUB, a) for a in range(3)]
        return np.ix_(*axes)

    def copy(self, name):
        g = Grid(name)
        g.isl = self.isl.copy()
        g.slot = self.slot.copy()
        g.cur = self.cur
        return g

    def merge(self, other):
        """Overlay another grid's islands (relabelled) into this one where this is empty."""
        occ = (other.isl > 0) & (self.isl == 0)
        base = int(self.isl.max())
        self.isl[occ] = other.isl[occ] + base
        self.slot[occ] = other.slot[occ]
        self.cur = int(self.isl.max()) + 1
        return self

    def empty(self):
        return not self.isl.any()

    def bounds_vox(self):
        occ = np.argwhere(self.isl > 0)
        if not len(occ):
            return None
        lo = occ.min(0) / SUB + LO
        hi = (occ.max(0) + 1) / SUB + LO
        return lo.tolist(), hi.tolist()

    def slots_used(self):
        return [SLOTS[i] for i in sorted(set(np.unique(self.slot[self.isl > 0]).tolist()))]

    # ------------------------------------------------------------------ meshing
    def surface(self):
        """Exposed faces per island. Returns (verts[m], faces[n,4] vertex indices, material index per face)."""
        occ = np.argwhere(self.isl > 0)
        if not len(occ):
            return np.zeros((0, 3)), np.zeros((0, 4), np.int64), np.zeros(0, np.int64), np.zeros(0, np.int64), np.zeros(0, np.int64)
        lo, hi = occ.min(0), occ.max(0) + 1
        crop = tuple(slice(a, b) for a, b in zip(lo, hi))
        isl = np.pad(self.isl[crop], 1)
        slot = np.pad(self.slot[crop], 1)
        quads, mats, ups = [], [], []
        core = (slice(1, -1),) * 3
        for axis in range(3):
            u, v = (axis + 1) % 3, (axis + 2) % 3
            for sign in (1, -1):
                sh = [slice(1, -1)] * 3
                sh[axis] = slice(1 + sign, isl.shape[axis] - 1 + sign)
                nb = isl[tuple(sh)]
                me = isl[core]
                face = (me > 0) & (nb != me)
                cells = np.argwhere(face)
                if not len(cells):
                    continue
                labels = me[face].astype(np.int64)
                mats.append(slot[core][face].astype(np.int64))
                ups.append(np.full(len(cells), sign if axis == 2 else 0, np.int64))
                base = cells.copy()
                if sign > 0:
                    base[:, axis] += 1
                    order = ((0, 0), (1, 0), (1, 1), (0, 1))
                else:
                    order = ((0, 0), (0, 1), (1, 1), (1, 0))
                corners = []
                for du, dv in order:
                    c = base.copy()
                    c[:, u] += du
                    c[:, v] += dv
                    corners.append(c)
                q = np.stack(corners, 1)                            # n,4,3
                quads.append((q, labels))
        if not quads:
            return np.zeros((0, 3)), np.zeros((0, 4), np.int64), np.zeros(0, np.int64), np.zeros(0, np.int64), np.zeros(0, np.int64)
        allq = np.concatenate([q for q, _ in quads])
        lab = np.concatenate([np.repeat(l[:, None], 4, 1) for _, l in quads])
        key = (lab << 30) | (allq[..., 0] << 20) | (allq[..., 1] << 10) | allq[..., 2]
        uniq, inv = np.unique(key.ravel(), return_inverse=True)
        faces = inv.reshape(-1, 4)
        coords = np.stack([(uniq >> 20) & 1023, (uniq >> 10) & 1023, uniq & 1023], 1).astype(np.float64) + lo
        verts = (coords / SUB + LO) * V
        if FACE_PLUS_Y:            # spec v2 / CHAR-BODY: character faces +Y, right = +X (a 180 deg turn, winding kept)
            verts[:, 0] *= -1
            verts[:, 1] *= -1
        return verts, faces, np.concatenate(mats), lab[:, 0], np.concatenate(ups)


def island_tone(labels, ups, tone):
    """Per-face COLOR_0 value: a deterministic per-island tone (clumps read as separate strands/bricks,
    like CHAR-BODY's per-island tone) plus a soft top-light / under-shade by face direction."""
    lo, hi = tone
    h = (labels * 2654435761) % 1000 / 999.0
    t = lo + (hi - lo) * h + 0.05 * (ups > 0) - 0.08 * (ups < 0)
    return np.clip(t, 0.0, 1.0)


def mesh_from_grid(grid, bpy, bmesh, name=None, tone=(0.96, 1.0)):
    """Build a bpy mesh with the slot material indices and COLOR_0 tones, dissolved per island and material."""
    verts, faces, mats, labels, ups = grid.surface()
    me = bpy.data.meshes.new(name or grid.name)
    me.from_pydata(verts.tolist(), [], faces.tolist())
    me.polygons.foreach_set("material_index", mats.astype(np.int32))
    col = me.color_attributes.new(name="Col", type="BYTE_COLOR", domain="CORNER")
    t = np.repeat(island_tone(labels, ups, tone), 4)
    col.data.foreach_set("color", np.stack([t, t, t, np.ones_like(t)], 1).ravel().astype(np.float32))
    if (mats == SI["face"]).any():
        # face canvas UV (FACE_ATLAS_SPEC): u = (8 - x) / 16, v = z / 16 in head-space fine voxels (x = character right)
        uv = me.uv_layers.new(name="UVMap")
        co = verts / V
        loops = np.zeros(len(me.loops), np.int64)
        me.loops.foreach_get("vertex_index", loops)
        u = (FACE_CANVAS[0] / 2 - co[loops, 0]) / FACE_CANVAS[0]
        v = co[loops, 2] / FACE_CANVAS[1]
        uv.data.foreach_set("uv", np.stack([u, v], 1).ravel().astype(np.float32))
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.dissolve_limit(bm, angle_limit=0.001, use_dissolve_boundaries=False, verts=bm.verts[:], edges=bm.edges[:],
                               delimit={"MATERIAL"})
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    return me
