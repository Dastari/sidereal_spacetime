"""FX library r001: voxel emissive presentation meshes + runtime playback spec (pure Python).

FX are PRESENTATION ONLY. They never decide hits, healing, shields or damage; runtime callers
spawn them from already accepted events (or local previews) at a physical socket.

Frame: origin at the anchor (muzzle / emitter / impact point / actor feet), +Y forward along
the shot or beam, +Z up. Each FX declares its own voxel size (small FX use the 1/32 m character
grid, room-scale FX a coarser grid) and one Grid per material layer.
"""
import math

from .voxel import Grid

C32, C16, C8 = 1 / 32, 1 / 16, 1 / 8


class Fx:
    def __init__(self, fx_id, label, sub, category, kind, anchor, grid, duration, *, loop=False, tint="fixed",
                 blend="additive", keys=None, speed=None, length=None, light=None, refs=()):
        self.id, self.label, self.sub, self.category, self.kind, self.anchor = fx_id, label, sub, category, kind, anchor
        self.voxel, self.duration, self.loop, self.tint, self.blend = grid, duration, loop, tint, blend
        self.keys = keys or [{"t": 0, "scale": [1, 1, 1], "opacity": 1, "emissive": 1},
                             {"t": 1, "scale": [1, 1, 1], "opacity": 0, "emissive": 0}]
        self.speed, self.length, self.light, self.refs = speed, length, light, list(refs)
        self.layers = {}        # name -> (Grid, material dict)

    def layer(self, name, color, strength=6.0, alpha=1.0, lit=False):
        if name not in self.layers:
            # VERIFY batch 1: strengths ~1/3 of r001 so glows stay saturated instead of clipping white.
            self.layers[name] = (Grid(), {"color": list(color), "emissiveStrength": 0.0 if lit else round(min(3.0, strength * 0.2), 3),
                                          "alpha": alpha, "lit": lit})
        return self.layers[name][0]

    def box(self, layer, *b):
        self.layers[layer][0].paint(*b, layer_slot(layer))
        return self

    def bounds(self):
        bs = [g.bounds() for g, _ in self.layers.values() if g.bounds()]
        return (min(b[0] for b in bs), min(b[1] for b in bs), min(b[2] for b in bs),
                max(b[3] for b in bs), max(b[4] for b in bs), max(b[5] for b in bs))


def layer_slot(_layer):
    # FX grids reuse the item Grid; the slot name only has to be valid. Materials are per layer.
    return "emit_a"


def _rng(seed):
    state = [seed & 0xFFFFFFFF or 1]

    def r():
        state[0] = (1103515245 * state[0] + 12345) & 0x7FFFFFFF
        return state[0] / 0x7FFFFFFF
    return r


def flash_keys(peak=1.15):
    return [{"t": 0, "scale": [0.55, 0.55, 0.55], "opacity": 1, "emissive": 1.4},
            {"t": 0.25, "scale": [peak, peak, peak], "opacity": 1, "emissive": 1},
            {"t": 1, "scale": [1.3, 1.3, 1.3], "opacity": 0, "emissive": 0}]


def steady_keys():
    return [{"t": 0, "scale": [1, 1, 1], "opacity": 1, "emissive": 1}, {"t": 1, "scale": [1, 1, 1], "opacity": 1, "emissive": 1}]


# ---------------------------------------------------------------------------- builders
def muzzle_flash():
    f = Fx("muzzle-flash", "MUZZLE FLASH", "FIREARM", "firearm", "flash", "muzzle", C32, 0.07, tint="fixed",
           keys=flash_keys(), light={"color": [1.0, 0.6, 0.2], "intensity": 4.0, "rangeM": 3.0}, refs=["fx.muzzle-flash"])
    f.layer("core", (1.0, 0.92, 0.6), 14)
    f.layer("glow", (1.0, 0.45, 0.05), 9, 0.85)
    f.box("core", -1, 0, -1, 2, 3, 2)
    f.box("glow", -2, 0, -2, 3, 2, 3)
    for y0, y1, h in ((3, 5, 1), (5, 8, 0)):
        f.box("glow", -h, y0, -h, h + 1, y1, h + 1)
    f.box("core", 0, 3, 0, 1, 6, 1)
    for dx, dz in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        for i in range(2, 5):
            f.box("glow", dx * i, 1, dz * i, dx * i + 1, 2, dz * i + 1)
    for dx, dz in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
        f.box("glow", dx * 3, 3, dz * 3, dx * 3 + 1, 4, dz * 3 + 1)
    return f


def tracer():
    f = Fx("tracer", "TRACER", "KINETIC", "firearm", "projectile", "muzzle", C32, 0.35, speed=90.0, keys=steady_keys(),
           refs=[])
    f.layer("core", (1.0, 0.9, 0.55), 12)
    f.layer("glow", (1.0, 0.40, 0.04), 7, 0.7)
    f.box("core", 0, 0, 0, 1, 12, 1)
    f.box("glow", -1, 2, 0, 2, 11, 1).box("glow", 0, 2, -1, 1, 11, 2)
    return f


def laser_bolt():
    f = Fx("laser-bolt", "LASER BOLT", "ENERGY", "energy", "projectile", "muzzle", C32, 0.5, tint="emit_b", speed=60.0,
           keys=steady_keys(), light={"color": [1.0, 0.1, 0.2], "intensity": 1.5, "rangeM": 1.5}, refs=["fx.laser-bolt"])
    f.layer("core", (1.0, 0.85, 0.9), 14)
    f.layer("glow", (1.0, 0.08, 0.18), 9, 0.8)
    f.box("core", 0, 0, 0, 1, 16, 1)
    f.box("glow", -1, 1, -1, 2, 15, 2)
    f.box("glow", 0, -1, 0, 1, 1, 1).box("glow", 0, 16, 0, 1, 17, 1)
    return f


def plasma_bolt():
    f = Fx("plasma-bolt", "PLASMA BOLT", "PLASMA", "plasma", "projectile", "muzzle", C32, 0.6, tint="emit_a", speed=40.0,
           keys=[{"t": 0, "scale": [1, 1, 1], "opacity": 1, "emissive": 1}, {"t": 0.5, "scale": [1.1, 1.0, 1.1], "opacity": 1, "emissive": 1.2},
                 {"t": 1, "scale": [1, 1, 1], "opacity": 1, "emissive": 1}],
           light={"color": [0.2, 0.5, 1.0], "intensity": 2.5, "rangeM": 2.0}, refs=["fx.plasma-bolt"])
    f.layer("core", (0.40, 0.75, 1.0), 14)
    f.layer("glow", (0.06, 0.38, 1.0), 9, 0.75)
    f.layer("tail", (0.03, 0.20, 1.0), 6, 0.45)
    for z in range(-2, 2):
        q = z + 0.5
        half = int(math.floor(math.sqrt(max(0, 4 - q * q)) + 0.5))
        f.box("glow", -half, 11, z, half, 16, z + 1)
    f.box("core", -1, 12, -1, 1, 15, 1)
    for y0, y1, h in ((7, 11, 1), (3, 7, 0)):
        f.box("tail", -h, y0, -h, h + 1 if h else 1, y1, h + 1 if h else 1)
    r = _rng(11)
    for _ in range(6):
        x, y, z = int(r() * 6) - 3, int(r() * 9) + 2, int(r() * 6) - 3
        f.box("glow", x, y, z, x + 1, y + 1, z + 1)
    return f


def beam_lance():
    f = Fx("beam-lance", "BEAM LANCE", "CONTINUOUS", "energy", "beam", "muzzle", C32, 0.25, tint="emit_a", loop=True,
           length=1.0, keys=steady_keys(), light={"color": [0.2, 0.6, 1.0], "intensity": 2.0, "rangeM": 2.0})
    f.layer("core", (0.45, 0.85, 1.0), 14)
    f.layer("glow", (0.08, 0.45, 1.0), 8, 0.65)
    f.box("core", 0, 0, 0, 1, 32, 1)
    for y in range(0, 32, 4):
        f.box("glow", -1, y, -1, 2, y + 3, 2)
    return f


def healing_beam():
    f = Fx("healing-beam", "HEALING BEAM", "MEDICAL", "medical", "beam", "emitter", C32, 0.4, tint="fixed", loop=True,
           length=1.0, keys=steady_keys(), light={"color": [0.2, 1.0, 0.4], "intensity": 1.5, "rangeM": 2.0},
           refs=["fx.healing-beam"])
    f.layer("core", (0.40, 1.0, 0.55), 12)
    f.layer("glow", (0.12, 1.0, 0.30), 8, 0.7)
    f.box("core", 0, 0, 0, 1, 32, 1)
    f.box("glow", -1, 0, 0, 2, 32, 1)
    for y, z in ((8, 3), (18, 4), (27, 2)):
        f.box("glow", -1, y, z, 2, y + 1, z + 1).box("glow", 0, y, z - 1, 1, y + 1, z + 2)
    return f


def stun_arc():
    f = Fx("stun-arc", "STUN ARC", "ELECTRIC", "energy", "beam", "muzzle", C32, 0.18, tint="fixed", length=1.0,
           keys=[{"t": 0, "scale": [1, 1, 1], "opacity": 1, "emissive": 1.3}, {"t": 0.5, "scale": [1, 1, -1], "opacity": 1, "emissive": 1},
                 {"t": 1, "scale": [1, 1, 1], "opacity": 0, "emissive": 0}], refs=[])
    f.layer("core", (0.45, 0.95, 1.0), 14)
    f.layer("glow", (0.1, 0.7, 1.0), 8, 0.7)
    x, z = 0, 0
    r = _rng(5)
    for y in range(0, 32, 2):
        nx, nz = max(-3, min(3, x + int(r() * 3) - 1)), max(-3, min(3, z + int(r() * 3) - 1))
        f.box("core", min(x, nx), y, min(z, nz), max(x, nx) + 1, y + 2, max(z, nz) + 1)
        if y % 6 == 0:
            f.box("glow", nx - 1, y, nz, nx + 2, y + 1, nz + 1)
        x, z = nx, nz
    return f


def scan_pulse():
    f = Fx("scan-pulse", "SCAN PULSE", "SCANNING", "scanning", "pulse", "actor", C16, 1.1, tint="emit_a",
           keys=[{"t": 0, "scale": [0.15, 0.15, 1], "opacity": 1, "emissive": 1.2}, {"t": 0.6, "scale": [1, 1, 1], "opacity": 0.8, "emissive": 1},
                 {"t": 1, "scale": [1.4, 1.4, 1], "opacity": 0, "emissive": 0}], refs=["fx.scan-pulse"])
    f.layer("ring", (0.15, 0.65, 1.0), 7, 0.85)
    f.layer("core", (0.5, 0.85, 1.0), 10)
    for r_out, r_in in ((13, 12), (9, 8), (5, 4)):
        for y in range(-r_out, r_out):
            q = y + 0.5
            ho = int(math.floor(math.sqrt(max(0, r_out * r_out - q * q)) + 0.5))
            hi = int(math.floor(math.sqrt(max(0, r_in * r_in - q * q)) + 0.5)) if abs(q) < r_in else 0
            if hi:
                f.box("ring", -ho, y, 0, -hi, y + 1, 1).box("ring", hi, y, 0, ho, y + 1, 1)
            else:
                f.box("ring", -ho, y, 0, ho, y + 1, 1)
    f.box("core", -1, -1, 0, 1, 1, 2)
    return f


def shield_bubble():
    f = Fx("shield-bubble", "SHIELD BUBBLE", "DEFENSE", "defense", "shell", "actor", C8, 0.6, tint="emit_a", loop=True,
           keys=[{"t": 0, "scale": [1, 1, 1], "opacity": 0.8, "emissive": 1}, {"t": 0.5, "scale": [1.02, 1.02, 1.02], "opacity": 1, "emissive": 1.2},
                 {"t": 1, "scale": [1, 1, 1], "opacity": 0.8, "emissive": 1}],
           light={"color": [0.2, 0.5, 1.0], "intensity": 1.0, "rangeM": 3.0}, refs=["fx.shield-bubble"])
    f.layer("hex", (0.05, 0.30, 1.0), 3, 0.16)
    f.layer("edge", (0.10, 0.55, 1.0), 7, 0.6)
    R = 9.5
    for x in range(-10, 10):
        for y in range(-10, 10):
            for z in range(0, 10):
                cx, cy, cz = x + 0.5, y + 0.5, z + 0.5
                d = math.sqrt(cx * cx + cy * cy + cz * cz)
                if R - 1 <= d < R:
                    lat = math.degrees(math.asin(min(1.0, cz / d)))
                    lon = math.degrees(math.atan2(cy, cx)) + (15 if int(lat // 20) % 2 else 0)
                    edge = z == 0 or abs(lat % 20) < 5 or abs(lon % 30) < 5
                    f.box("edge" if edge else "hex", x, y, z, x + 1, y + 1, z + 1)
    return f


def impact_spark():
    f = Fx("impact-spark", "IMPACT SPARK", "HIT EFFECT", "hit", "burst", "impact", C32, 0.25, keys=flash_keys(1.0),
           light={"color": [1.0, 0.7, 0.3], "intensity": 2.0, "rangeM": 1.5}, refs=["fx.impact-spark"])
    f.layer("core", (1.0, 0.95, 0.8), 14)
    f.layer("spark", (1.0, 0.55, 0.06), 9)
    f.box("core", -1, -1, -1, 2, 2, 2)
    for dx, dy, dz in ((1, 0, 0), (-1, 0, 0), (0, 0, 1), (0, 0, -1), (0, -1, 0), (1, -1, 1), (-1, -1, 1), (1, -1, -1), (-1, -1, -1)):
        for i in range(2, 6):
            f.box("spark", dx * i, dy * i, dz * i, dx * i + 1, dy * i + 1, dz * i + 1)
    r = _rng(3)
    for _ in range(10):
        x, y, z = int(r() * 14) - 7, -int(r() * 7), int(r() * 14) - 7
        f.box("spark", x, y, z, x + 1, y + 1, z + 1)
    return f


def smoke_puff():
    f = Fx("smoke-puff", "SMOKE PUFF", "ENVIRONMENT", "environment", "puff", "impact", C16, 1.4, blend="alpha",
           keys=[{"t": 0, "scale": [0.4, 0.4, 0.4], "opacity": 0.9, "emissive": 0}, {"t": 0.3, "scale": [1, 1, 1], "opacity": 0.8, "emissive": 0},
                 {"t": 1, "scale": [1.5, 1.5, 1.8], "opacity": 0, "emissive": 0}], refs=["fx.smoke-puff"])
    f.layer("light", (0.36, 0.34, 0.42), lit=True, alpha=0.85)
    f.layer("dark", (0.16, 0.15, 0.20), lit=True, alpha=0.85)
    for (x, y, z, s, layer) in ((0, 0, 0, 4, "light"), (3, 1, 2, 3, "dark"), (-3, 0, 1, 3, "light"), (1, -2, 3, 3, "light"),
                                (-1, 2, 4, 3, "dark"), (2, 0, 5, 2, "light"), (-2, -1, 5, 2, "dark"), (0, 1, 7, 2, "light"),
                                (4, -1, 0, 2, "light"), (-4, 2, 3, 2, "dark")):
        f.box(layer, x - s // 2, y - s // 2, z, x - s // 2 + s, y - s // 2 + s, z + s)
    return f


def thruster_glow():
    f = Fx("thruster-glow", "THRUSTER GLOW", "MOVEMENT", "movement", "plume", "emitter", C32, 0.2, tint="emit_a", loop=True,
           keys=[{"t": 0, "scale": [1, 1, 1], "opacity": 1, "emissive": 1}, {"t": 0.5, "scale": [0.9, 1.15, 0.9], "opacity": 0.9, "emissive": 1.2},
                 {"t": 1, "scale": [1, 1, 1], "opacity": 1, "emissive": 1}],
           light={"color": [0.3, 0.6, 1.0], "intensity": 1.5, "rangeM": 1.5}, refs=["fx.thruster-glow"])
    f.layer("core", (0.35, 0.80, 1.0), 12)
    f.layer("glow", (0.06, 0.35, 1.0), 8, 0.6)
    for y0, y1, h in ((0, 3, 2), (3, 6, 2), (6, 9, 1)):
        f.box("glow", -h, -y1, -h, h, -y0, h)
    for y0, y1, h in ((0, 4, 1), (4, 8, 0)):
        f.box("core", -h - 1 if h else 0, -y1, -h - 1 if h else 0, h + 1, -y0, h + 1)
    return f


def pickup_glow():
    f = Fx("pickup-glow", "PICKUP GLOW", "INTERACT", "interact", "column", "item", C32, 1.2, tint="fixed", loop=True,
           keys=[{"t": 0, "scale": [1, 1, 1], "opacity": 0.8, "emissive": 1}, {"t": 0.5, "scale": [1, 1, 1.06], "opacity": 1, "emissive": 1.3},
                 {"t": 1, "scale": [1, 1, 1], "opacity": 0.8, "emissive": 1}],
           light={"color": [0.2, 1.0, 0.4], "intensity": 1.0, "rangeM": 1.5}, refs=["fx.pickup-glow"])
    f.layer("edge", (0.25, 1.0, 0.40), 8)
    f.layer("column", (0.12, 1.0, 0.30), 4, 0.35)
    s, z0 = 12, 4
    for x in (-6, 5):
        for y in (-6, 5):
            f.box("edge", x, y, z0, x + 1, y + 1, z0 + s)
    for z in (z0, z0 + s - 1):
        f.box("edge", -6, -6, z, 6, -5, z + 1).box("edge", -6, 5, z, 6, 6, z + 1)
        f.box("edge", -6, -6, z, -5, 6, z + 1).box("edge", 5, -6, z, 6, 6, z + 1)
    for z0c, z1c, h in ((0, 10, 3), (10, 22, 2), (22, 32, 1)):
        f.box("column", -h, -h, z0c, h, h, z1c)
    for x, y, z in ((-8, 2, 6), (7, -3, 12), (-4, 7, 18), (6, 6, 3)):
        f.box("edge", x, y, z, x + 1, y + 1, z + 1)
    return f


def repair_sparks():
    f = Fx("repair-sparks", "REPAIR SPARKS", "ENGINEERING", "engineering", "burst", "emitter", C32, 0.35, loop=True,
           keys=[{"t": 0, "scale": [0.7, 0.7, 0.7], "opacity": 1, "emissive": 1.3}, {"t": 0.5, "scale": [1.1, 1.1, 1.1], "opacity": 1, "emissive": 1},
                 {"t": 1, "scale": [0.8, 0.8, 0.8], "opacity": 1, "emissive": 1.2}],
           light={"color": [1.0, 0.6, 0.2], "intensity": 2.0, "rangeM": 1.5}, refs=["fx.repair-sparks"])
    f.layer("core", (1.0, 0.95, 0.75), 14)
    f.layer("spark", (1.0, 0.50, 0.05), 9)
    f.layer("plus", (0.25, 1.0, 0.35), 7)
    f.box("core", -1, -1, -1, 1, 1, 1)
    r = _rng(21)
    for _ in range(22):
        a, e, d = r() * math.tau, r() * 1.2 - 0.2, 2 + r() * 7
        x, y, z = int(math.cos(a) * d * math.cos(e)), int(-abs(math.sin(a)) * d * 0.6), int(math.sin(e) * d)
        f.box("spark", x, y, z, x + 1, y + 1, z + 1)
    for x, z in ((-7, 6), (6, 8)):
        f.box("plus", x - 1, 0, z, x + 2, 1, z + 1).box("plus", x, 0, z - 1, x + 1, 1, z + 2)
    return f


def teleport():
    f = Fx("teleport", "TELEPORT FX", "ARRIVAL", "arrival", "column", "ground", C16, 1.6, tint="fixed",
           keys=[{"t": 0, "scale": [0.3, 0.3, 0.1], "opacity": 1, "emissive": 1.4}, {"t": 0.35, "scale": [1, 1, 1], "opacity": 1, "emissive": 1.2},
                 {"t": 1, "scale": [1.15, 1.15, 1.3], "opacity": 0, "emissive": 0}],
           light={"color": [0.6, 0.25, 1.0], "intensity": 3.0, "rangeM": 3.0}, refs=["fx.teleport"])
    f.layer("ring", (0.55, 0.20, 1.0), 8, 0.9)
    f.layer("column", (0.65, 0.35, 1.0), 5, 0.4)
    f.layer("core", (0.70, 0.45, 1.0), 12)
    for r_out, r_in in ((12, 11), (8, 7)):
        for y in range(-r_out, r_out):
            q = y + 0.5
            ho = int(math.floor(math.sqrt(max(0, r_out * r_out - q * q)) + 0.5))
            hi = int(math.floor(math.sqrt(max(0, r_in * r_in - q * q)) + 0.5)) if abs(q) < r_in else 0
            if hi:
                f.box("ring", -ho, y, 0, -hi, y + 1, 1).box("ring", hi, y, 0, ho, y + 1, 1)
            else:
                f.box("ring", -ho, y, 0, ho, y + 1, 1)
    for k in range(10):
        a = k * math.tau / 10
        x, y = int(round(math.cos(a) * 9.5)), int(round(math.sin(a) * 9.5))
        f.box("column", x, y, 1, x + 1, y + 1, 8 + (k * 7) % 14)
    for z0, z1, h in ((1, 12, 4), (12, 24, 3), (24, 34, 2)):
        f.box("column", -h, -h, z0, h, h, z1)
    f.box("core", -1, -1, 1, 1, 1, 30)
    return f


ALL = [muzzle_flash, laser_bolt, plasma_bolt, healing_beam, scan_pulse, shield_bubble,
       impact_spark, smoke_puff, thruster_glow, pickup_glow, repair_sparks, teleport,
       tracer, beam_lance, stun_arc]

# Order of the reference EFFECTS LIBRARY panel (2 x 6).
REFERENCE_PANEL = ["muzzle-flash", "laser-bolt", "plasma-bolt", "healing-beam", "scan-pulse", "shield-bubble",
                   "impact-spark", "smoke-puff", "thruster-glow", "pickup-glow", "repair-sparks", "teleport"]


def build_all():
    return [f() for f in ALL]
