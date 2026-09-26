"""Pure-Python voxel authoring core for crew handheld items and FX (no bpy import).

Authoring model
---------------
* Integer voxel grid; items use V = 1/32 m (character grid), FX declare their own grid.
* Frame: +X right, +Y forward (barrel / emitter / away from the holder), +Z up (Blender).
  glTF export converts this to +X right, +Y up, -Z forward, matching EquipmentPoseItem.
* Boxes are PAINTED into a grid in call order: a later box overwrites earlier voxels, so bands,
  vents and emissive windows are authored as overpaint (no coplanar duplicate faces).
* Every paint call is a component. The mesher greedily merges voxels that share
  (slot, component) into boxes; each box becomes one bevelled brick island, so seams only
  appear where the author changed colour/part or overpainted.
* Moving parts (slide, magazine, drill bit ...) are separate grids with a pivot.
"""
import math

ITEM_SLOTS = ["primary", "secondary", "accent", "trim", "metal", "dark", "grip", "emit_a", "emit_b", "glass"]
SLOT_INDEX = {s: i for i, s in enumerate(ITEM_SLOTS)}
EMISSIVE_SLOTS = ("emit_a", "emit_b")


class Grid:
    def __init__(self):
        self.cells = {}          # (x, y, z) -> (slot, component)
        self.component = 0

    def paint(self, x0, y0, z0, x1, y1, z1, slot):
        if slot is not None and slot not in SLOT_INDEX:
            raise ValueError(f"unknown slot {slot}")
        lo = [min(a, b) for a, b in ((x0, x1), (y0, y1), (z0, z1))]
        hi = [max(a, b) for a, b in ((x0, x1), (y0, y1), (z0, z1))]
        for v in lo + hi:
            if not float(v).is_integer():
                raise ValueError(f"off-grid box {(x0, y0, z0, x1, y1, z1)}")
        self.component += 1
        for x in range(int(lo[0]), int(hi[0])):
            for y in range(int(lo[1]), int(hi[1])):
                for z in range(int(lo[2]), int(hi[2])):
                    if slot is None:
                        self.cells.pop((x, y, z), None)
                    else:
                        self.cells[(x, y, z)] = (slot, self.component)

    def boxes(self, merge=False):
        """Greedy decomposition into (x0, y0, z0, x1, y1, z1, slot) per (slot, component).
        merge=True ignores components (used for FX, which have no brick seams)."""
        done = set()
        out = []
        cells = {k: (v[0], 0) for k, v in self.cells.items()} if merge else self.cells
        for key in sorted(cells, key=lambda k: (k[2], k[1], k[0])):
            if key in done:
                continue
            tag = cells[key]
            x, y, z = key

            def ok(cx, cy, cz):
                c = (cx, cy, cz)
                return c not in done and cells.get(c) == tag
            x1 = x + 1
            while ok(x1, y, z):
                x1 += 1
            y1 = y + 1
            while all(ok(i, y1, z) for i in range(x, x1)):
                y1 += 1
            z1 = z + 1
            while all(ok(i, j, z1) for i in range(x, x1) for j in range(y, y1)):
                z1 += 1
            for i in range(x, x1):
                for j in range(y, y1):
                    for k in range(z, z1):
                        done.add((i, j, k))
            out.append((x, y, z, x1, y1, z1, tag[0]))
        return out

    def bounds(self):
        if not self.cells:
            return None
        xs, ys, zs = zip(*self.cells)
        return (min(xs), min(ys), min(zs), max(xs) + 1, max(ys) + 1, max(zs) + 1)

    def slots(self):
        return sorted({s for s, _ in self.cells.values()}, key=SLOT_INDEX.get)

    def filled(self, x, y, z):
        return (x, y, z) in self.cells


class Part:
    """A separately animated sub-grid. Pivot in voxel units (item authoring coordinates)."""

    def __init__(self, name, pivot):
        self.name, self.pivot, self.grid = name, tuple(float(v) for v in pivot), Grid()
        self.tracks = {}    # animation name -> [(frame, (dx, dy, dz) voxels, (rx, ry, rz) degrees)]

    def key(self, anim, frame, loc=(0, 0, 0), rot=(0, 0, 0)):
        self.tracks.setdefault(anim, []).append((int(frame), tuple(float(v) for v in loc), tuple(float(v) for v in rot)))
        return self


class Item:
    """Authored handheld item: body grid, moving parts, sockets and gameplay-facing metadata."""

    def __init__(self, item_id, name, category, animation_set, *, theme="orion", overrides=None, grid=1 / 32):
        self.id, self.name, self.category, self.animation_set = item_id, name, category, animation_set
        self.theme, self.overrides, self.voxel = theme, dict(overrides or {}), grid
        self.body = Grid()
        self.parts = {}
        self.sockets = {}    # name -> {"position": (x,y,z) voxels, "direction": (x,y,z), "up": (x,y,z)}
        self._target = self.body
        self.meta = {}

    # ---------------------------------------------------------------- painting
    def box(self, x0, y0, z0, x1, y1, z1, slot, mirror_x=None):
        self._target.paint(x0, y0, z0, x1, y1, z1, slot)
        if mirror_x is not None:
            self._target.paint(2 * mirror_x - x1, y0, z0, 2 * mirror_x - x0, y1, z1, slot)
        return self

    def cut(self, x0, y0, z0, x1, y1, z1):
        self._target.paint(x0, y0, z0, x1, y1, z1, None)
        return self

    def disc(self, axis, c1, c2, r, a0, a1, slot, rin=0):
        """Stepped disc/ring along axis (from the ship kit prototype). c1, c2: centre in the other two
        axes (x,z for axis y; x,y for axis z; y,z for axis x). r in voxels; centre on a grid line."""
        rows = []
        for k in range(-r, r):
            q = k + 0.5
            half = int(math.floor(math.sqrt(max(0.0, r * r - q * q)) + 0.5))
            hin = int(math.floor(math.sqrt(max(0.0, rin * rin - q * q)) + 0.5)) if rin and abs(q) < rin else 0
            rows.append((k, half, hin))
        for k, half, hin in rows:
            spans = [(c1 - half, c1 + half)] if not hin else [(c1 - half, c1 - hin), (c1 + hin, c1 + half)]
            for u0, u1 in spans:
                if u1 <= u0:
                    continue
                if axis == "y":
                    self.box(u0, a0, c2 + k, u1, a1, c2 + k + 1, slot)
                elif axis == "z":
                    self.box(u0, c2 + k, a0, u1, c2 + k + 1, a1, slot)
                else:
                    self.box(a0, u0, c2 + k, a1, u1, c2 + k + 1, slot)
        return self

    def part(self, name, pivot=(0, 0, 0)):
        if name not in self.parts:
            self.parts[name] = Part(name, pivot)
        self._target = self.parts[name].grid
        return self.parts[name]

    def main(self):
        self._target = self.body
        return self

    def socket(self, name, position, direction=(0, 1, 0), up=(0, 0, 1)):
        self.sockets[name] = {"position": tuple(float(v) for v in position),
                              "direction": tuple(float(v) for v in direction), "up": tuple(float(v) for v in up)}
        return self

    # ---------------------------------------------------------------- queries
    def grids(self):
        yield "body", self.body, (0.0, 0.0, 0.0)
        for p in self.parts.values():
            yield p.name, p.grid, p.pivot

    def bounds(self):
        bs = [g.bounds() for _, g, _ in self.grids() if g.bounds()]
        return (min(b[0] for b in bs), min(b[1] for b in bs), min(b[2] for b in bs),
                max(b[3] for b in bs), max(b[4] for b in bs), max(b[5] for b in bs))

    def origin(self):
        return self.sockets["grip"]["position"]

    def slots(self):
        used = set()
        for _, g, _ in self.grids():
            used.update(g.slots())
        return sorted(used, key=SLOT_INDEX.get)

    def to_metres(self, p):
        """Authoring voxel point -> item frame metres (origin at grip), Blender axes."""
        o = self.origin()
        return tuple(round((p[i] - o[i]) * self.voxel, 6) for i in range(3))


def blender_to_gltf(v):
    """Blender (x, y, z) Z-up -> glTF (x, z, -y) Y-up; +Y forward becomes -Z forward."""
    x, y, z = v
    return (x, z, -y if y != 0 else 0.0)

