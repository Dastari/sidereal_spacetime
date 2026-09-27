"""Universal hull modules for the prefab-ship kit (r002), built in Blender by ship_kit_export.py.

Every grammar shape tile (square, slope1-4, arc1-4, arc2c-4c) gets Blender-authored modules in its
own unrotated tile frame (texels; tile bounding box [0, w*16] x [0, h*16], +Z up). The dresser places
them with the tile's quarter turns and mirror, so any volume made of tiles (hulls, pods, nacelle
fairings, turret housings, blisters, station modules) is dressed by the same modules:

- hull.<shape>.<class>          body: dark core, inset light roof plate, keel plate
- face.<shape>.<class>[.cut]    angled outer face along the tile's non-axis edge: cassette panels in
                                tiers with relief, vents, trims, lights, a roof-to-face chamfer and a
                                keel chamfer (".cut": deck-view variant capped at the shell cut)
- canopy.<shape>.<class>[.cut]  projecting sloped windscreen, stepped rising keel, armor eyebrow,
                                crash rail, crimson band and instrument consoles
- canopy.corner{5,45,90}.<class>[.cut]  convex wraparound joins at a hull vertex
- canopy.nav.<class>           twin navigation lenses on the same one-metre face socket
- canopy.straight.w1.<class>[.cut]  one metre of straight canopy glass
- shellwall.<shape>             deck-view thick exterior wall along the angled edge (inner cassettes,
                                light strips, dark cap)
- shell.straight                deck-view outer wall band for one metre of straight edge
- post.hull.<class>[.cut]       corner post for outline vertices (covers every face-to-face join)
- int.floorpart.<shape>         deck plates for the tile's partial cells

Geometry is closed solids (lofted cross-sections swept along mitred chains) with a real bevel
modifier; normals are recalculated outward. Nothing here is TypeScript-generated.
"""
import json
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
G = json.loads((ROOT / "packages/content/src/construction-grammar.v1.json").read_text())
SLOTS = ["primary", "secondary", "accent", "trim", "metal", "dark", "emit_a", "emit_b", "glass"]


def h01(*parts):
    """FNV-1a style deterministic hash in [0, 1) (module-local; seeds only choose details)."""
    h = 2166136261
    for ch in "|".join(str(p) for p in parts):
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF
    h ^= h >> 13
    h = (h * 0x5BD1E995) & 0xFFFFFFFF
    h ^= h >> 15
    return h / 4294967296.0


# ------------------------------------------------------------------------------ grammar
def snap(v):
    return round(v * 32) / 32


def arc_points(cx, cy, r, a0, a1, n):
    return [(snap(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n))), snap(cy + r * math.sin(math.radians(a0 + (a1 - a0) * i / n)))) for i in range(n + 1)]


def area(poly):
    return sum(p[0] * q[1] - q[0] * p[1] for p, q in zip(poly, poly[1:] + poly[:1])) / 2


def ccw(poly):
    return poly if area(poly) > 0 else poly[::-1]


def tile_polygon(shape):
    """CCW polygon (cells) of a shape tile in its unrotated local frame; mirrors construction-grammar.ts."""
    spec = G["shapeTiles"][shape]
    if spec["kind"] == "polygon":
        return ccw([tuple(p) for p in spec["points"]])
    r = spec["radius"]
    n = G["arcSegmentsPerRadius"] * r
    if not spec["concave"]:
        return ccw([(0, 0)] + arc_points(0, 0, r, 0, 90, n))
    arc = arc_points(0, 0, r, 90, 0, n)[1:-1]
    return ccw([(r, 0), (r, r), (0, r)] + arc)


def is_axis(p, q):
    return abs(p[0] - q[0]) < 1e-9 or abs(p[1] - q[1]) < 1e-9


def angled_chain(poly):
    """The tile's non-axis edges as one ordered run of points (CCW order), in cells."""
    n = len(poly)
    edges = [(poly[i], poly[(i + 1) % n]) for i in range(n)]
    start = next(i for i in range(n) if not is_axis(*edges[i]) and is_axis(*edges[i - 1]))
    pts = [edges[start][0]]
    i = start
    while not is_axis(*edges[i % n]):
        pts.append(edges[i % n][1])
        i += 1
    return pts


def volume_tiers(z0, z1):
    r = G["tierRule"]
    h = z1 - z0
    if h >= r["twoTierMinTexels"]:
        return [(z0, z0 + r["lowerTierTexels"]), (z0 + r["lowerTierTexels"], z1 - r["twoTierRimTexels"])], (z1 - r["twoTierRimTexels"], z1)
    if h >= r["oneTierMinTexels"]:
        return [(z0, z1 - r["oneTierRimTexels"])], (z1 - r["oneTierRimTexels"], z1)
    return [(z0, z1)], None


def class_z(hc):
    z0, z1 = G["heightClasses"][hc]["z"]
    hull = "hull" in G["heightClasses"][hc]["kinds"]
    zb = max(0, z0 - G["tierRule"]["skirtTexels"]) if hull else z0
    return z0, z1, zb


# ------------------------------------------------------------------------------ mesh building
class MeshPiece:
    """Closed solids with a material slot per face; texel units, tile-local frame."""

    def __init__(self, pid):
        self.id = pid
        self.verts, self.faces, self.slots, self.decals = [], [], [], []
        self.boxes = []          # kit compatibility (box pieces only)

    def aligned(self):
        return False

    def loft(self, rings, slot):
        """Rings: k >= 2 rings of n points each (a swept convex or planar cross-section)."""
        n = len(rings[0])
        base = len(self.verts)
        for r in rings:
            self.verts += r
        for k in range(len(rings) - 1):
            for i in range(n):
                a, b = base + k * n + i, base + k * n + (i + 1) % n
                self.faces.append((a, b, b + n, a + n))
                self.slots.append(slot)
        self.faces.append(tuple(base + i for i in range(n))[::-1])
        self.slots.append(slot)
        last = base + (len(rings) - 1) * n
        self.faces.append(tuple(last + i for i in range(n)))
        self.slots.append(slot)

    def prism(self, poly, z0, z1, slot):
        if z1 - z0 < 1e-6 or abs(area(poly)) < 1e-6:
            return
        self.loft([[(x, y, z0) for x, y in poly], [(x, y, z1) for x, y in poly]], slot)

    def bounds(self):
        xs, ys, zs = zip(*self.verts)
        return [min(xs), min(ys), min(zs), max(xs), max(ys), max(zs)]


class Chain:
    """Polyline (texels) with mitred offsets; side=+1 offsets to the right of travel (outward for a CCW
    ring). before/after: neighbouring edge directions for mitred ends; None = square ends."""

    def __init__(self, pts, side=1, before=None, after=None, closed=False):
        self.pts = list(pts) + ([pts[0]] if closed else [])
        segs = list(zip(self.pts, self.pts[1:]))
        dirs = [self._norm((q[0] - p[0], q[1] - p[1])) for p, q in segs]
        nrm = (lambda d: (d[1], -d[0])) if side > 0 else (lambda d: (-d[1], d[0]))
        ns = [nrm(d) for d in dirs]
        if closed:
            nb, na = ns[-1], ns[0]
        else:
            nb = nrm(self._norm(before)) if before else ns[0]
            na = nrm(self._norm(after)) if after else ns[-1]
        full = [nb] + ns + [na]
        self.miter = []
        for j in range(len(self.pts)):
            a, b = full[j], full[j + 1]
            k = 1 + a[0] * b[0] + a[1] * b[1]
            self.miter.append(b if k < 0.3 else ((a[0] + b[0]) / k, (a[1] + b[1]) / k))
        self.acc = [0.0]
        for p, q in segs:
            self.acc.append(self.acc[-1] + math.hypot(q[0] - p[0], q[1] - p[1]))
        self.length = self.acc[-1]

    @staticmethod
    def _norm(v):
        l = math.hypot(*v) or 1.0
        return (v[0] / l, v[1] / l)

    def at(self, s, d):
        i = 0
        while i < len(self.pts) - 2 and s > self.acc[i + 1]:
            i += 1
        L = (self.acc[i + 1] - self.acc[i]) or 1.0
        t = min(1.0, max(0.0, (s - self.acc[i]) / L))
        a, b, ma, mb = self.pts[i], self.pts[i + 1], self.miter[i], self.miter[i + 1]
        pa = (a[0] + ma[0] * d, a[1] + ma[1] * d)
        pb = (b[0] + mb[0] * d, b[1] + mb[1] * d)
        return (pa[0] + t * (pb[0] - pa[0]), pa[1] + t * (pb[1] - pa[1]))

    def cuts(self, s0, s1):
        return [s0] + [a for a in self.acc if s0 + 1e-6 < a < s1 - 1e-6] + [s1]


def sweep(piece, chain, s0, s1, profile, slot):
    """Sweep a convex (d, z) cross-section (texels, d outward) along chain[s0, s1]."""
    if s1 - s0 < 0.05:
        return
    rings = [[(*chain.at(s, d), z) for d, z in profile] for s in chain.cuts(s0, s1)]
    piece.loft(rings, slot)


def rect(d0, d1, z0, z1):
    return [(d0, z0), (d1, z0), (d1, z1), (d0, z1)]


def band(piece, chain, s0, s1, d0, d1, z0, z1, slot, zcap=None):
    if zcap is not None:
        z1 = min(z1, zcap)
    if z1 - z0 > 1e-6 and abs(d1 - d0) > 1e-6:
        sweep(piece, chain, s0, s1, rect(min(d0, d1), max(d0, d1), z0, z1), slot)


def panels(length, target=16.0):
    n = max(1, round(length / target))
    return [(length * i / n, length * (i + 1) / n) for i in range(n)]


# ------------------------------------------------------------------------------ modules
def canopy_sill(hc):
    z0, z1, _ = class_z(hc)
    tiers, _ = volume_tiers(z0, z1)
    return tiers[0][0] + max(6, (tiers[0][1] - tiers[0][0]) // 2)


def hull_body(shape, hc, cockpit=False):
    """Body of one tile: dark core with an inset light roof plate and a keel plate. The cockpit variant
    (tiles behind canopy glass) is hollow between the sill and a thin roof, with a dark cockpit
    interior set back from the glass and console lights, so the canopy reads as glass, not a wall."""
    z0, z1, zb = class_z(hc)
    poly = [(x * 16, y * 16) for x, y in tile_polygon(shape)]
    p = MeshPiece(f"hull.{shape}.{hc}{'.cockpit' if cockpit else ''}")
    inner = Chain(poly, side=-1, closed=True)
    inset = [inner.at(a, 0.75) for a in inner.acc[:-1]]
    if not cockpit:
        p.prism(poly, zb + 1, z1 - 1, "trim")
    else:
        sill = canopy_sill(hc)
        p.prism(poly, zb + 1, sill, "trim")
        p.prism(poly, z1 - 3, z1 - 1, "secondary")                                    # thin roof
        deep = [inner.at(a, 7.0) for a in inner.acc[:-1]]
        if abs(area(deep)) > 16:
            p.prism(ccw(deep), sill, z1 - 3, "dark")                                   # cockpit interior
    p.prism(inset, z1 - 1, z1, "primary")
    p.prism(inset, zb, zb + 1, "secondary")
    return p


def outer_chain(shape):
    """Angled edge of the tile as an outward chain (texels), square ends (corner posts cover joins)."""
    return Chain([(x * 16, y * 16) for x, y in angled_chain(tile_polygon(shape))], side=1)


def face_module(shape, hc, cut=None):
    z0, z1, zb = class_z(hc)
    tiers, rim = volume_tiers(z0, z1)
    ch = outer_chain(shape)
    L = ch.length
    p = MeshPiece(f"face.{shape}.{hc}{'.cut' if cut else ''}")
    cap = cut
    band(p, ch, 0, L, 0, 1.5, zb, z1 if rim is None else rim[0], "dark", cap)           # backing
    if z0 > zb:                                                                        # keel chamfer
        sweep(p, ch, 0, L, [(0, zb), (1.0, zb), (3.0, z0), (0, z0)], "trim")
    for pi, (a, b) in enumerate(panels(L)):
        s0, s1 = a + 0.5, b - 0.5
        w = s1 - s0
        for ti, (t0, t1) in enumerate(tiers):
            if cap is not None and t0 >= cap:
                continue
            dep = 2.5 + (1 if h01(shape, pi, ti, "d") < 0.5 else 0)
            if h01(shape, pi, ti, "k") < 0.18 and t1 - t0 >= 10:                        # vent stack
                band(p, ch, s0, s1, 1.5, dep - 0.5, t0 + 1, t1 - 1, "dark", cap)
                zz = t0 + 2
                while zz < t1 - 2:
                    band(p, ch, s0 + 1, s1 - 1, 1.5, dep, zz, zz + 1, "metal", cap)
                    zz += 2
                band(p, ch, s0, s1, 1.5, dep + 0.5, t0, t0 + 1, "trim", cap)
                band(p, ch, s0, s1, 1.5, dep + 0.5, t1 - 1, t1, "trim", cap)
                continue
            slot = ["primary", "primary", "secondary", "primary", "accent"][int(h01(shape, pi, ti, "s") * 5)]
            if ti == 0 and len(tiers) > 1 and slot == "accent":
                slot = "secondary"
            band(p, ch, s0, s1, 1.5, dep, t0 + 0.5, t1 - 0.5, slot, cap)
            if w > 7 and t1 - t0 >= 8:                                                 # relief plate
                inset = min(2.5, w * 0.18)
                band(p, ch, s0 + inset, s1 - inset, dep, dep + 0.75, t0 + 2.5, t1 - 2.5,
                     "secondary" if slot == "primary" and h01(shape, pi, ti, "r") < 0.3 else slot, cap)
            if t1 - t0 >= 10 and h01(shape, pi, ti, "l") < 0.5:                        # light strip
                band(p, ch, s0 + w * 0.25, s0 + w * 0.75, dep, dep + 1.25, t1 - 5, t1 - 4,
                     "emit_a" if h01(shape, pi, "e") < 0.6 else "emit_b", cap)
            if h01(shape, pi, ti, "m") < 0.4:                                          # kick strip
                band(p, ch, s0 + 1, s1 - 1, dep, dep + 1, t0 + 2, t0 + 3.5, "metal", cap)
    if rim and (cap is None or rim[0] < cap):
        r0, r1 = rim
        if cap is None:                                                                 # roof-to-face chamfer
            sweep(p, ch, 0, L, [(0, r0), (3.5, r0), (3.5, r0 + 1), (0.5, r1), (0, r1)], "secondary")
            band(p, ch, 0, L, 3.5, 4.0, r0, r0 + 1, "trim")
        else:
            band(p, ch, 0, L, 0, 3.5, r0, min(r1, cap), "secondary")
    if cap is not None:                                                                 # dark cap at the cut
        band(p, ch, 0, L, -1.5, 4, cap - 2, cap, "dark")
    return p


def canopy_face(ch, hc, pid, cut=None, frame_step=24.0, joint=False):
    """Projecting windscreen / cheek / rising-keel shell. Attachment stays at d=0;
    positive d is outside the host. Height never exceeds the host roof. The 1 m face
    and tile chains share the same profile, as does the radial corner connector.
    This is visual envelope only, not added walkable space or a control socket.
    """
    z0, z1, zb = class_z(hc)
    height = z1 - zb
    if height < 30:
        # Thin fairings share the authored profile without inverted panes or
        # instrument blocks protruding through their roof.
        scale = height / 43
        class DepthChain:
            length = ch.length
            @staticmethod
            def at(s, d):
                return ch.at(s, d * scale)
            @staticmethod
            def cuts(a, b):
                return ch.cuts(a, b)
        p = canopy_face(DepthChain(), "deck", pid, None, frame_step, joint)
        p.verts = [(x, y, zb + z * scale) for x, y, z in p.verts]
        return p
    nose = round(zb + height * .40)
    chin = round(zb + height * .23)
    reach = round(min(24, height * .58))
    L = ch.length
    p = MeshPiece(pid)
    top = min(z1, cut) if cut is not None else z1

    # Six stacked bevelled courses describe the rising keel, not a vertical slab.
    for i in range(6):
        a, b = reach * i / 6, reach * (i + 1) / 6
        bottom = round(zb + (chin - zb) * i / 5)
        band(p, ch, 0, L, a, b + .125, bottom, nose - 3,
             "secondary" if i < 2 else "primary")
    band(p, ch, 0, L, 0, reach + 1, nose - 3, nose + 1, "dark")
    # Crimson waist and broad pale crash rail, split into cassettes at real seams.
    for i, (a, b) in enumerate(panels(L, 16)):
        gap = 0 if joint else .3
        band(p, ch, a + gap, b - gap, reach - 2, reach + 1.5, nose - 2, nose, "accent")
        band(p, ch, a + gap, b - gap, reach - 1, reach + 2, nose, nose + 3, "primary")
        if not joint and b - a > 7:
            band(p, ch, a + 2, b - 2, reach + 1.5, reach + 2.25, nose - 5, nose - 3, "dark")
            for u in range(3, int(b - a) - 2, 3):
                band(p, ch, a + u, a + u + 1, reach + 2, reach + 2.5, nose - 5, nose - 3, "metal")
            # A red lens in its crimson bezel; cyan instrument lights are inside.
            band(p, ch, a + 2, a + 5, reach + 2, reach + 2.6, nose + .5, nose + 2.5, "accent")

    # Pressure glazing slopes DOWN AND OUT; no transom / bedroom-window grid.
    low = nose + 3
    if cut is None:
        glass_profile = [(1, z1 - 3), (reach - 1, low + 1), (reach - .5, low + 1.5), (1.5, z1 - 3)]
        sweep(p, ch, 0, L, glass_profile, "glass")
        sweep(p, ch, 0, L, [(-1, z1 - 4), (3, z1 - 4), (3, z1 - 1), (-1, z1)], "secondary")
        band(p, ch, 0, L, reach - 2, reach + 1, low, low + 1.5, "secondary")
        if not joint:
            n = max(1, round(L / frame_step))
            for i in range(n + 1):
                u = L * i / n
                sweep(p, ch, max(0, u - 1.15), min(L, u + 1.15),
                      [(-1, z1 - 2), (reach, low), (reach + 1, low + 2), (1, z1)], "secondary")
            # Stepped armor eyebrow around the windscreen perimeter. Mullions
            # remain strong dark spars instead of striped ladder-like rails.
            for step in range(3):
                band(p, ch, 0, L, step * 2, step * 2 + 2.1, z1 - step * 2 - 2, z1 - step * 2, "primary")
            # Readable console faces below the windscreen. Separate blocks/screens,
            # not an emissive band. Authored here and pooled into the same 9 slots.
            for a, b in panels(L, 16):
                sweep(p, ch, a + 2, b - 2, [(4, nose + 1), (12, nose + 1), (12, nose + 6), (5, nose + 9)], "dark")
                sweep(p, ch, a + 4, b - 4, [(6, nose + 8.85), (8, nose + 8), (8, nose + 8.25), (6, nose + 9.1)], "emit_a")
                band(p, ch, a + 3, a + 5, 12, 13, nose + 3, nose + 4, "emit_b")
                band(p, ch, a + 6, b - 3, 12, 13, nose + 3, nose + 3.5, "metal")
    else:
        band(p, ch, 0, L, -1, 3, top - 2, top, "secondary")
    return p


def canopy_nav(hc):
    """Twin red navigation lenses; same one-metre face socket and nine kit slots.
    The runtime gives this emitter the navigation finish without recolouring
    the host's amber equipment lights. No gameplay or lamp entity is created.
    """
    _, z1, zb = class_z(hc)
    height = z1 - zb
    reach = round(min(24, height * .58))
    nose = round(zb + height * .40)
    p = MeshPiece(f"canopy.nav.{hc}")
    ch = Chain([(16, 0), (0, 0)])
    band(p, ch, 4, 12, reach + 2, reach + 3, nose, nose + 3, "dark")
    for u in (5, 9):
        band(p, ch, u - .5, u + 2.5, reach + 3, reach + 3.5, nose + .25, nose + 2.75, "accent")
        band(p, ch, u, u + 2, reach + 3.5, reach + 4, nose + .75, nose + 2.25, "emit_b")
    return p


def canopy_corner(hc, cut=None, degrees=5):
    """Universal 5/45/90-degree convex joining sectors; dresser rotates them
    through the actual outline turn. Origin is the hull vertex, +X outward at start.
    No ship-specific dimensions, material, generated runtime geometry or sockets.
    """
    class RadialChain:
        length = 16
        @staticmethod
        def at(s, d):
            angle = math.radians(degrees * s / 16)
            return d * math.cos(angle), d * math.sin(angle)
        @staticmethod
        def cuts(a, b):
            n = max(1, math.ceil(degrees / 15))
            return [a + (b - a) * i / n for i in range(n + 1)]
    return canopy_face(RadialChain(), hc, f"canopy.corner{degrees}.{hc}{'.cut' if cut else ''}", cut, joint=True)


def canopy_module(shape, hc, cut=None):
    return canopy_face(outer_chain(shape), hc, f"canopy.{shape}.{hc}{'.cut' if cut else ''}", cut)


def canopy_straight(hc, cut=None):
    """One metre of canopy in the cassette frame: local +X along face, +Y outward."""
    ch = Chain([(16, 0), (0, 0)], side=1)   # travel -X; right of travel is +Y
    return canopy_face(ch, hc, f"canopy.straight.w1.{hc}{'.cut' if cut else ''}", cut)


def shellwall(shape):
    """Deck-view exterior wall along the tile's angled edge (inward of it), capped at the shell cut."""
    return shell_along(outer_chain(shape), f"shellwall.{shape}")


def shell_straight():
    return shell_along(Chain([(16, 0), (0, 0)], side=1), "shell.straight")


def shell_along(ch, pid):
    z0, _, _ = class_z("deck")
    ft = G["deck"]["floorTopTexels"]
    cut = G["deck"]["shellCutTexels"]
    W = G["deck"]["exteriorWallTexels"]
    L = ch.length
    p = MeshPiece(pid)
    band(p, ch, 0, L, -W, 2, 0, ft, "trim")
    band(p, ch, 0, L, -W, 2, ft, cut - 2, "secondary")
    band(p, ch, 0, L, -(W + 1.5), 3, cut - 2, cut, "dark")
    band(p, ch, 0, L, -(W + 1), -W, ft, ft + 3, "dark")                                   # footing
    for pi, (a, b) in enumerate(panels(L, 14.0)):
        s0, s1 = a + 0.5, b - 0.5
        band(p, ch, s0, s1, -(W + 0.75), -W, ft + 4, cut - 4, "primary")
        if pi % 2 == 0:
            band(p, ch, s0 + (s1 - s0) * 0.2, s1 - (s1 - s0) * 0.2, -(W + 1.25), -(W + 0.75), cut - 7, cut - 6, "emit_a")
        else:
            band(p, ch, s0 + 1.5, s1 - 1.5, -(W + 1.25), -(W + 0.75), ft + 8, cut - 9, "secondary")
    return p


def corner_post(hc, cut=None):
    """Slim charcoal corner trim (covers face-to-face joins) flush with the rim, no lamp band."""
    z0, z1, zb = class_z(hc)
    top = min(z1, cut) if cut else z1
    p = MeshPiece(f"post.hull.{hc}{'.cut' if cut else ''}")
    oct_ = lambda r: [(r * math.cos(math.radians(22.5 + 45 * i)), r * math.sin(math.radians(22.5 + 45 * i))) for i in range(8)]
    p.prism(oct_(4.0), zb, top - 1, "secondary")
    p.prism(oct_(4.25), top - 1, top, "dark" if cut else "trim")
    return p


def clip(poly, x0, y0, x1, y1):
    """Sutherland-Hodgman clip of a polygon against an axis rectangle."""
    def edge(pts, inside, inter):
        out = []
        for i, cur in enumerate(pts):
            prev = pts[i - 1]
            if inside(cur):
                if not inside(prev):
                    out.append(inter(prev, cur))
                out.append(cur)
            elif inside(prev):
                out.append(inter(prev, cur))
        return out

    def ix(x):
        return lambda a, b: (x, a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]))

    def iy(y):
        return lambda a, b: (a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]), y)

    pts = list(poly)
    for inside, inter in ((lambda p: p[0] >= x0, ix(x0)), (lambda p: p[0] <= x1, ix(x1)),
                          (lambda p: p[1] >= y0, iy(y0)), (lambda p: p[1] <= y1, iy(y1))):
        if not pts:
            break
        pts = edge(pts, inside, inter)
    return pts


def floor_part(shape):
    """Deck plates for the tile's partial cells (full cells get the regular 1 m floor tiles)."""
    poly = tile_polygon(shape)
    w, h = G["shapeTiles"][shape]["size"]
    ft = G["deck"]["floorTopTexels"]
    p = MeshPiece(f"int.floorpart.{shape}")
    for cx in range(w):
        for cy in range(h):
            part = clip(poly, cx, cy, cx + 1, cy + 1)
            if len(part) < 3 or abs(area(part)) < 1e-4 or abs(area(part) - 1) < 1e-6:
                continue
            tp = [(x * 16, y * 16) for x, y in ccw(part)]
            p.prism(tp, 0, ft - 1, "dark")
            inner = Chain(tp, side=-1, closed=True)
            inset = [inner.at(a, 0.75) for a in inner.acc[:-1]]
            if abs(area(inset)) > 4:
                p.prism(ccw(inset), ft - 1, ft, "trim")
    return p


BUILDERS = {
    "hull_body": hull_body,
    "hull_cockpit": lambda shape, hc: hull_body(shape, hc, True),
    "face_module": face_module,
    "canopy_module": canopy_module,
    "canopy_straight": canopy_straight,
    "canopy_corner": canopy_corner,
    "canopy_nav": canopy_nav,
    "shellwall": shellwall,
    "shell_straight": shell_straight,
    "corner_post": corner_post,
    "floor_part": floor_part,
}
