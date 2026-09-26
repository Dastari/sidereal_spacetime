"""Headless Blender exporter for the proposed ship component catalog.

Builds one GLB per catalog component (component id + size) from the studless
construction-brick kit in ``ship_kit_prototype.py`` and new builders for kinds
the kit lacks, then writes a manifest with hashes, measured bounds, triangle
counts, material slots and typed port sockets.

Run (headless only):
  blender -b --factory-startup --python-exit-code 1 -P scripts/art_library/ship_component_export.py -- \
      --out assets/art-library/ship-components/r001 [--only id,id] [--sheets DIR] [--samples 32]

Conventions (see packages/content/src/ship-components.ts):
- Every GLB is authored in its catalog frame (top / face / interior) with the
  origin on the hardpoint centre or floor, metres, Blender Z up; the glTF
  exporter writes +Y up, so part (x, y, z) is glTF (x, z, -y).
- Nine material slots in fixed order, named ``slot<i>_<role>`` so runtime
  themes can swap colours without new geometry. glTF keeps only used slots;
  the manifest lists which were used.
- Port sockets are empties named ``port.<portId>`` with channel/direction extras.
- Plumes, labels and decals are presentation and are never exported.
All art here is a PROPOSAL; nothing is owner-approved or published.
"""
import argparse
import hashlib
import json
import math
import sys
import types
from pathlib import Path

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
KIT_PATH = HERE / "ship_kit_prototype.py"


def load_kit():
    src = KIT_PATH.read_text()
    head, sep, tail = src.rpartition("\nmain()")
    if not sep or tail.strip():
        raise RuntimeError("ship_kit_prototype.py no longer ends with an unguarded main() call")
    mod = types.ModuleType("ship_kit")
    mod.__file__ = str(KIT_PATH)
    exec(compile(head, str(KIT_PATH), "exec"), mod.__dict__)
    return mod


K = load_kit()
sys.path.insert(0, str(HERE))
import ship_component_art as A  # noqa: E402
A.install(K)
THEME = "orion"
Piece, T, SLOTS, SI = K.Piece, K.T, K.SLOTS, K.SI
EXPORT_REVISION = "r002"
BEVEL = 0.012


def args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--catalog", default=str(ROOT / "packages/content/src/ship-components.v1.json"))
    p.add_argument("--out", default=str(ROOT / "assets/art-library/ship-components" / EXPORT_REVISION))
    p.add_argument("--only", default="")
    p.add_argument("--no-glb", action="store_true")
    p.add_argument("--sheets", default="")
    p.add_argument("--samples", type=int, default=32)
    p.add_argument("--sheet-keys", default="", help="comma list: catalog keys, weapons-top, exploded-ion, exploded-weapons, damage, variants")
    return p.parse_args(argv)


# =============================================================================== helpers
def plate(p, x0, y0, x1, y1, z0, z1, slot, inset=1, top="secondary"):
    """Chunky block with an inset top plate in a contrasting slot."""
    p.b(x0, y0, z0, x1, y1, z1 - 1, slot)
    if x1 - x0 > 2 * inset and y1 - y0 > 2 * inset:
        p.b(x0 + inset, y0 + inset, z1 - 1, x1 - inset, y1 - inset, z1, top)
    return p


def bolts(p, x0, y0, x1, y1, z, s=1):
    for x, y in ((x0, y0), (x1 - s, y0), (x0, y1 - s), (x1 - s, y1 - s)):
        p.b(x, y, z, x + s, y + s, z + 1, "metal")


def plinth(p, w, d, h=2):
    """Floor plinth for interior equipment: dark base + trim band + corner feet."""
    p.b(1, 1, 0, w - 1, d - 1, h, "dark")
    p.b(0, 0, h - 1, w, d, h, "trim")
    for x, y in ((0, 0), (w - 2, 0), (0, d - 2), (w - 2, d - 2)):
        p.b(x, y, 0, x + 2, y + 2, h, "metal")
    return h


def vents(p, x0, x1, y, z0, z1, step=2, slot="dark", depth=1):
    for z in range(z0, z1 - 1, step):
        p.b(x0, y, z, x1, y + depth, z + 1, slot)


def status_lights(p, x0, y, z, n, slot="emit_a", gap=2):
    for i in range(n):
        p.b(x0 + i * gap, y, z, x0 + i * gap + 1, y + 1, z + 1, slot)


def hazard(p, x0, x1, y0, y1, z0, z1, axis="x", step=2):
    """Alternating trim/dark stripes (hazard band)."""
    if axis == "x":
        for i, x in enumerate(range(x0, x1, step)):
            p.b(x, y0, z0, min(x + step, x1), y1, z1, "trim" if i % 2 == 0 else "dark")
    else:
        for i, z in enumerate(range(z0, z1, step)):
            p.b(x0, y0, z, x1, y1, min(z + step, z1), "trim" if i % 2 == 0 else "dark")


# =============================================================================== interior builders
# Authored directly in the catalog interior frame: x in [0, w], y in [0, d] texels, z up, access side +Y.
def cells_px(m):
    return int(math.floor(m * 16 + 1e-6))


def reactor(w, d, h):
    p = Piece("x.reactor", "equipment", "interior", (w, d, h))
    z = plinth(p, w, d, 3)
    cx, cy = w // 2, d // 2
    r = min(w, d) // 2 - 4
    p.disc("z", cx, cy, r + 2, z, z + 3, "secondary")
    bands = max(3, (h - z - 10) // 6)
    zz = z + 3
    for i in range(bands):
        p.disc("z", cx, cy, r, zz, zz + 4, "primary" if i % 2 == 0 else "accent")
        p.disc("z", cx, cy, r + 1, zz + 4, zz + 6, "emit_a" if i == bands // 2 else "dark")
        zz += 6
    p.disc("z", cx, cy, r - 2, zz, zz + 3, "metal").disc("z", cx, cy, max(2, r // 2), zz + 3, zz + 5, "emit_a")
    for sx in (2, w - 5):                                               # frame posts
        for sy in (2, d - 5):
            p.b(sx, sy, z, sx + 3, sy + 3, zz + 2, "secondary")
            p.b(sx, sy, zz + 2, sx + 3, sy + 3, zz + 3, "emit_b")
    p.b(2, 2, zz + 3, w - 2, 5, zz + 4, "trim").b(2, d - 5, zz + 3, w - 2, d - 2, zz + 4, "trim")
    for sx in (-1, 1):                                                  # coolant pipes
        px = cx + sx * (r + 2)
        p.b(px - 1, 0, z + 2, px + 1, cy, z + 4, "metal")
    p.b(cx - 3, d - 2, z + 4, cx + 3, d, z + 12, "secondary")           # control panel
    p.b(cx - 2, d - 1, z + 6, cx + 2, d, z + 10, "emit_a")
    return p


def battery(w, d, h):
    p = Piece("x.battery", "equipment", "interior", (w, d, h))
    z = plinth(p, w, d)
    n = max(2, w // 7)
    cw = (w - 2) // n
    for i in range(n):
        x0 = 1 + i * cw
        plate(p, x0, 1, x0 + cw - 1, d - 1, z, h - 3, "primary", top="secondary")
        p.b(x0 + 1, d - 1, z + 2, x0 + 2, d, h - 6, "emit_a")          # charge bar
        p.b(x0 + cw // 2 - 1, d // 2 - 1, h - 3, x0 + cw // 2 + 1, d // 2 + 1, h - 1, "metal")   # terminal
        p.b(x0 + cw // 2 - 1, d // 2 - 1, h - 1, x0 + cw // 2 + 1, d // 2 + 1, h, "emit_b")
    p.b(0, d // 2 - 1, h - 4, w, d // 2 + 1, h - 3, "accent")          # bus bar
    return p


def capacitor(w, d, h):
    p = Piece("x.capacitor", "equipment", "interior", (w, d, h))
    z = plinth(p, w, d)
    n = max(1, w // 13)
    sp = w // n
    for i in range(n):
        cx = sp // 2 + i * sp
        r = min(sp, d) // 2 - 2
        p.disc("z", cx, d // 2, r, z, h - 3, "primary")
        for zz in range(z + 3, h - 6, 5):
            p.disc("z", cx, d // 2, r + 1, zz, zz + 1, "emit_a")
        p.disc("z", cx, d // 2, r - 1, h - 3, h - 1, "metal").disc("z", cx, d // 2, max(1, r // 2), h - 1, h, "emit_b")
    p.b(1, 0, z, w - 1, 2, z + 4, "accent")
    return p


def fuel_tank(w, d, h):
    p = Piece("x.fuel-tank", "equipment", "interior", (w, d, h))
    z = plinth(p, w, d, 2)
    r = min(h - z - 5, d) // 2
    cz = z + r
    for x0 in (2, w - 5):                                                # cradles
        p.b(x0, 1, z, x0 + 3, d - 1, cz, "secondary")
    p.disc("x", d // 2, cz, r, 1, w - 1, "primary")
    p.disc("x", d // 2, cz, r + 1, w // 2 - 1, w // 2 + 1, "accent")
    p.disc("x", d // 2, cz, r - 1, 0, 1, "metal").disc("x", d // 2, cz, r - 1, w - 1, w, "metal")
    hazard(p, 3, w - 3, d // 2 - 1, d // 2 + 1, cz + r, cz + r + 1)
    p.b(w // 2 - 2, d - 3, cz + r - 2, w // 2 + 2, d, cz + r + 2, "trim")   # valve
    p.b(w // 2 - 1, d - 1, cz + r + 2, w // 2 + 1, d, cz + r + 3, "emit_b")
    return p


def aux_generator(w, d, h):
    p = Piece("x.aux-generator", "equipment", "interior", (w, d, h))
    z = plinth(p, w, d)
    plate(p, 1, 1, w - 1, d - 1, z, h - 4, "primary")
    p.disc("y", w // 2, (z + h - 4) // 2, min(w, h) // 4, d - 1, d, "dark", rin=0)
    p.disc("y", w // 2, (z + h - 4) // 2, min(w, h) // 4 - 1, d - 1, d, "metal", rin=min(w, h) // 4 - 3)
    p.b(w - 5, 2, h - 4, w - 2, 5, h, "secondary").b(w - 4, 3, h - 1, w - 3, 4, h, "emit_b")   # exhaust stack
    status_lights(p, 2, d - 1, h - 6, 3)
    return p


def pump(w, d, h):
    p = Piece("x.coolant-pump", "equipment", "interior", (w, d, h))
    z = plinth(p, w, d)
    r = min(d, h) // 3
    p.disc("x", d // 2, z + r + 1, r, 1, w - 4, "primary")
    p.disc("x", d // 2, z + r + 1, r + 1, w // 2, w // 2 + 2, "emit_a")
    p.b(w - 4, 2, z, w - 1, d - 2, h - 2, "secondary")                  # motor housing
    vents(p, w - 4, w - 1, d - 2, z + 2, h - 3)
    for x in (2, w // 2 - 3):                                            # pipes up
        p.b(x, d // 2 - 1, z + 2 * r, x + 2, d // 2 + 1, h, "metal")
    return p


def heat_sink(w, d, h):
    p = Piece("x.heat-sink", "equipment", "interior", (w, d, h))
    z = plinth(p, w, d)
    p.b(1, 1, z, w - 1, d - 1, z + 3, "secondary")
    for x in range(2, w - 2, 2):                                         # fins
        p.b(x, 2, z + 3, x + 1, d - 2, h - 2, "metal")
    p.b(1, 1, h - 2, w - 1, 3, h, "trim").b(1, d - 3, h - 2, w - 1, d - 1, h, "trim")
    p.b(w // 2 - 1, d - 1, z + 1, w // 2 + 1, d, z + 3, "emit_b")
    return p


def magazine(kind):
    def build(w, d, h):
        p = Piece(f"x.magazine-{kind}", "equipment", "interior", (w, d, h))
        z = plinth(p, w, d)
        plate(p, 1, 1, w - 1, d - 1, z, h - 2, "secondary", top="primary")
        hazard(p, 1, w - 1, d - 1, d, z + 1, z + 3)
        if kind == "ballistic":
            for x in range(3, w - 4, 6):                                  # drum racks on the front
                p.disc("y", x + 2, (z + h) // 2, 2, d - 1, d, "trim")
        else:
            rr = 2 if kind == "missile" else 4
            for x in range(3 + rr, w - rr - 2, 2 * rr + 2):
                for zz in range(z + 4 + rr, h - rr - 3, 2 * rr + 2):
                    p.disc("y", x, zz, rr, d - 1, d, "dark").disc("y", x, zz, max(1, rr - 1), d - 1, d, "accent")
        p.b(w // 2 - 2, d // 2 - 2, h - 2, w // 2 + 2, d // 2 + 2, h, "metal")   # feed chute
        p.b(w // 2 - 1, d // 2 - 1, h - 1, w // 2 + 1, d // 2 + 1, h, "emit_b")
        return p
    return build


def shield_generator(w, d, h):
    p = Piece("x.shield-generator", "equipment", "interior", (w, d, h))
    z = plinth(p, w, d, 3)
    cx, cy = w // 2, d // 2
    r = min(w, d) // 2 - 3
    K.extrude(p, "z", cx, cy, K.section_rows(r, max(1, r // 3)), z, z + 3, "secondary")
    K.extrude(p, "z", cx, cy, K.section_rows(r - 2, max(1, r // 3)), z + 3, h - 4, "primary")
    for zz in range(z + 5, h - 6, 4):
        K.extrude(p, "z", cx, cy, K.section_rows(r - 1, max(1, r // 3)), zz, zz + 1, "emit_a")
    p.disc("z", cx, cy, max(2, r - 4), h - 4, h - 2, "metal").disc("z", cx, cy, max(1, r // 2), h - 2, h, "emit_a")
    p.b(cx - 3, d - 3, z, cx + 3, d, z + 8, "accent").b(cx - 2, d - 1, z + 2, cx + 2, d, z + 6, "emit_b")
    return p


def life_support(w, d, h):
    p = Piece("x.life-support", "equipment", "interior", (w, d, h))
    z = plinth(p, w, d)
    plate(p, 1, 1, w - 1, d - 1, z, h - 2, "primary")
    p.b(2, d - 1, z + 2, w // 2 - 1, d, h - 5, "glass")                 # tank window
    p.b(3, d - 1, z + 3, w // 2 - 2, d, z + 6, "emit_a")
    fr = min(w // 2, h) // 4
    p.disc("y", 3 * w // 4, h - fr - 5, fr, d - 1, d, "dark").disc("y", 3 * w // 4, h - fr - 5, fr - 1, d - 1, d, "metal", rin=max(1, fr - 3))
    vents(p, w // 2 + 1, w - 2, d - 1, z + 2, z + 10)
    p.b(0, d // 2 - 1, h - 3, w, d // 2 + 1, h, "accent")
    p.b(w // 2 - 1, 0, h - 1, w // 2 + 1, d, h, "emit_a")
    return p


def air_filter(w, d, h):
    p = Piece("x.air-filter", "equipment", "interior", (w, d, h))
    z = plinth(p, w, d)
    plate(p, 1, 1, w - 1, d - 1, z, h - 1, "primary")
    K.frame(p, 2, z + 2, w - 2, h - 3, d - 1, d, 1, "trim")
    vents(p, 3, w - 3, d - 1, z + 3, h - 4)
    p.b(w // 2 - 1, d - 1, h - 3, w // 2 + 1, d, h - 2, "emit_a")
    return p


def oxygen_tank(w, d, h):
    p = Piece("x.oxygen-tank", "equipment", "interior", (w, d, h))
    z = plinth(p, w, d)
    n = max(1, w // 13)
    for i in range(n):
        cx = w * (2 * i + 1) // (2 * n)
        r = min(w // n, d) // 2 - 1
        p.disc("z", cx, d // 2, r, z, h - 3, "primary")
        p.disc("z", cx, d // 2, r + 1, z + 3, z + 5, "secondary").disc("z", cx, d // 2, r + 1, h - 8, h - 6, "secondary")
        p.disc("z", cx, d // 2, max(1, r - 2), h - 3, h - 1, "metal").b(cx - 1, d // 2 - 1, h - 1, cx + 1, d // 2 + 1, h, "emit_a")
    return p


def hydroponics(w, d, h):
    p = Piece("x.hydroponics", "equipment", "interior", (w, d, h))
    z = plinth(p, w, d)
    for x in (1, w - 3):
        p.b(x, 1, z, x + 2, d - 1, h, "secondary")
    for zz in range(z + 2, h - 4, 9):
        p.b(3, 1, zz, w - 3, d - 1, zz + 2, "trim")                   # tray
        for x in range(4, w - 4, 3):
            p.b(x, 3, zz + 2, x + 2, d - 3, zz + 5, "accent")        # planters
        p.b(4, d // 2, zz + 7, w - 4, d // 2 + 1, zz + 8, "emit_b")   # grow light strip
    p.b(3, d - 1, z, w - 3, d, h - 2, "glass")
    return p


def gravity(w, d, h):
    p = Piece("x.gravity", "equipment", "interior", (w, d, h))
    z = plinth(p, w, d, 3)
    cx, cy = w // 2, d // 2
    r = min(w, d) // 2 - 2
    p.disc("z", cx, cy, r, z, z + 4, "secondary")
    for i, rr in enumerate(range(r - 2, 2, -4)):
        p.disc("z", cx, cy, rr, z + 4 + i * 2, z + 6 + i * 2, "emit_a" if i % 2 == 0 else "primary", rin=max(1, rr - 2))
    p.b(cx - 2, cy - 2, z, cx + 2, cy + 2, h, "metal").b(cx - 3, cy - 3, h - 2, cx + 3, cy + 3, h, "emit_b")
    return p


def computer_core(w, d, h):
    p = Piece("x.computer-core", "equipment", "interior", (w, d, h))
    z = plinth(p, w, d)
    plate(p, 1, 1, w - 1, d - 1, z, h - 1, "secondary", top="primary")
    for x0 in range(2, w - 4, 8):                                         # blade racks
        for zz in range(z + 2, h - 4, 4):
            p.b(x0, d - 1, zz, x0 + 6, d, zz + 3, "dark")
            p.b(x0 + 1, d - 1, zz + 1, x0 + 2, d, zz + 2, "emit_a" if (zz // 4 + x0) % 3 else "emit_b")
    p.b(0, 3, h - 3, w, 5, h - 2, "accent")
    return p


CONSOLE_STYLE = {
    "navigation": ("primary", "emit_a", True),
    "command": ("primary", "emit_a", False),
    "fire-control": ("accent", "emit_b", False),
    "engineering": ("trim", "emit_b", False),
    "sensor": ("secondary", "emit_a", False),
}


def console(kind):
    body, glow, seat = CONSOLE_STYLE[kind]

    def build(w, d, h):
        p = Piece(f"x.console-{kind}", "equipment", "interior", (w, d, h))
        z = plinth(p, w, d // 2 + 2, 2)
        dd = d // 2 + 2
        plate(p, 1, 1, w - 1, dd, z, 13, body)                         # desk
        p.b(1, dd - 2, 13, w - 1, dd + 1, 14, "trim")                  # desk lip
        p.b(2, 2, 13, w - 2, 4, h, "secondary")                        # screen stand
        p.b(3, 4, 14, w - 3, 5, h - 2, "dark")
        p.b(4, 5, 15, w - 4, 6, h - 3, glow)                           # screen
        if kind == "sensor":
            p.disc("y", w // 2, (15 + h - 3) // 2, min(w - 8, h - 18) // 2, 5, 6, "emit_b", rin=2)
        for x in range(3, w - 3, 3):                                   # keys
            p.b(x, dd - 5, 14, x + 2, dd - 3, 15, "emit_b" if kind == "fire-control" else "metal")
        if seat:
            sx0, sx1 = w // 2 - 4, w // 2 + 4
            p.b(sx0 + 2, d - 5, 0, sx1 - 2, d - 3, 6, "metal")        # seat post
            p.b(sx0, d - 8, 6, sx1, d - 1, 8, "secondary")
            p.b(sx0, d - 2, 8, sx1, d, 18, "secondary")
        return p
    return build


def crew_bunk(w, d, h):
    p = Piece("x.crew-bunk", "equipment", "interior", (w, d, h))
    for z0 in (2, h // 2 + 1):
        p.b(0, 0, z0, w, d, z0 + 2, "secondary")                       # frame
        p.b(1, 1, z0 + 2, w - 1, d - 1, z0 + 4, "accent")              # mattress
        p.b(1, 2, z0 + 4, 6, d - 2, z0 + 6, "primary")                 # pillow
    for x in (0, w - 2):
        for y in (0, d - 2):
            p.b(x, y, 0, x + 2, y + 2, h, "trim")
    p.b(w - 4, d - 1, h - 3, w - 2, d, h - 2, "emit_b")
    return p


def warp(w, d, h):
    p = Piece("x.warp", "equipment", "interior", (w, d, h))
    z = plinth(p, w, d, 4)
    r = min(w, h - z) // 2 - 1
    cz = z + r
    for y0 in (4, d - 8):                                               # cradles
        p.b(2, y0, z, w - 2, y0 + 4, cz - r // 2, "secondary")
    p.disc("y", w // 2, cz, r, 2, d - 2, "primary", rin=max(2, r - 5))
    for i, y in enumerate(range(6, d - 6, 6)):
        p.disc("y", w // 2, cz, r + 1, y, y + 1, "emit_b" if i % 3 == 0 else "accent", rin=max(2, r - 2))
    p.disc("y", w // 2, cz, max(2, r - 6), d // 2 - 2, d // 2 + 2, "emit_a")
    return p


def deck_hatch(w, d, h):
    p = Piece("x.hatch", "equipment", "interior", (w, d, h))
    K.frame_top(p, 0, 0, w, d, 0, h, 2, "secondary")
    p.disc("z", w // 2, d // 2, w // 2 - 3, 0, h - 1, "primary")
    p.b(w // 2 - 4, d // 2 - 1, h - 1, w // 2 + 4, d // 2 + 1, h, "metal")
    hazard(p, 0, w, 0, 1, h - 1, h)
    return p


# =============================================================================== top builders (kit top convention: barrels +X)
def top_base(p, W, z=0):
    """Hardpoint connector plate shared by the new top mounts."""
    t = max(2, W // 8)
    p.b(0, 0, z, W, W, z + t, "trim")
    K.frame_top(p, 2, 2, W - 2, W - 2, z + t, z + t + 1, 1, "emit_a")
    for x, y in ((0, 0), (W - 2, 0), (0, W - 2), (W - 2, W - 2)):
        p.b(x, y, z + t, x + 2, y + 2, z + t + 2, "metal")
    return z + t + 1


def plasma(sz):
    parts = K.mount_parts("laser", sz)
    n = K.SIZE_CELLS[sz]
    W = 16 * n
    c = W // 2
    p = Piece(f"x.plasma.{sz}", "mount", "top", parts[0].size)
    for q in parts[:3]:
        p.boxes += q.boxes
    z0 = max(bx[5] for bx in parts[1].boxes) + 2
    hh = max(8, int(W * 0.46))
    K.housing(p, c - int(W * 0.30), c + int(W * 0.16), c - int(W * 0.30), c + int(W * 0.30), z0, z0 + hh, "primary")
    ez = z0 + hh // 2
    cr = max(3, int(W * 0.20))
    p.disc("x", c, ez, cr, c + int(W * 0.16), c + int(W * 0.40), "secondary")      # chamber
    for x in range(c + int(W * 0.18), c + int(W * 0.40), max(2, n + 1)):
        p.disc("x", c, ez, cr + 1, x, x + 1, "emit_a")                               # plasma coils
    p.disc("x", c, ez, max(2, cr - 1), c + int(W * 0.40), c + int(W * 0.55), "metal", rin=max(1, cr - 3))
    p.disc("x", c, ez, max(1, cr - 3), c + int(W * 0.40), c + int(W * 0.56), "emit_b")  # emitter core
    p.b(c - int(W * 0.26), c - int(W * 0.30) - 1, z0 + 2, c, c - int(W * 0.30), z0 + hh - 2, "accent")
    p.size = (W, W, max(bx[5] for bx in p.boxes))
    return p


def mining_laser(sz):
    parts = K.mount_parts("laser", sz)
    n = K.SIZE_CELLS[sz]
    W = 16 * n
    c = W // 2
    p = Piece(f"x.mining-laser.{sz}", "mount", "top", parts[0].size)
    for q in parts[:3]:
        p.boxes += q.boxes
    z0 = max(bx[5] for bx in parts[1].boxes) + 2
    hh = max(6, int(W * 0.38))
    K.housing(p, c - int(W * 0.30), c + int(W * 0.20), c - int(W * 0.24), c + int(W * 0.24), z0, z0 + hh, "trim", top="primary")
    hazard(p, c - int(W * 0.30), c + int(W * 0.20), c - int(W * 0.24) - 1, c - int(W * 0.24), z0 + 1, z0 + 3)
    ez = z0 + hh // 2
    r = max(2, int(W * 0.12))
    x = c + int(W * 0.20)
    for i, (rr, L) in enumerate(((r + 1, int(W * 0.2)), (r, int(W * 0.25)), (max(1, r - 1), int(W * 0.25)))):
        p.disc("x", c, ez, rr, x, x + L, "metal" if i % 2 == 0 else "secondary")
        x += L
    p.disc("x", c, ez, max(1, r - 1), x, x + 2, "emit_b")                           # lens
    p.size = (W, W, max(bx[5] for bx in p.boxes))
    return p


def radar(sz):
    n = K.SIZE_CELLS[sz]
    W = 16 * n
    c = W // 2
    p = Piece(f"x.radar.{sz}", "mount", "top", (W, W, 0))
    z = top_base(p, W)
    K.extrude(p, "z", c, c, K.section_rows(int(W * 0.3), max(1, W // 10)), z, z + 3 * n, "secondary")
    z += 3 * n
    p.b(c - n, c - n, z, c + n, c + n, z + 4 * n, "metal")
    z += 4 * n
    aw, ah = int(W * 0.46), int(W * 0.28)                                # planar array faces +X
    p.b(c - 2, c - aw, z, c + 1, c + aw, z + ah, "primary")
    for yy in range(c - aw + 1, c + aw - 1, 3):
        for zz in range(z + 1, z + ah - 1, 3):
            p.b(c + 1, yy, zz, c + 2, yy + 2, zz + 2, "emit_a" if (yy + zz) % 4 else "dark")
    p.b(c - 3, c - aw - 1, z - 1, c - 2, c + aw + 1, z + ah + 1, "trim")
    p.size = (W, W, max(bx[5] for bx in p.boxes))
    return p


def scanner(sz):
    n = K.SIZE_CELLS[sz]
    W = 16 * n
    c = W // 2
    p = Piece(f"x.scanner.{sz}", "mount", "top", (W, W, 0))
    z = top_base(p, W)
    top = int(W * 1.75)
    p.b(c - 2 * n, c - 2 * n, z, c + 2 * n, c + 2 * n, z + 4 * n, "secondary")
    p.b(c - n, c - n, z, c + n, c + n, top, "metal")
    for i, zz in enumerate(range(z + 6 * n, top - 4 * n, 4 * n)):
        p.disc("z", c, c, 2 * n + 1 + (i % 2), zz, zz + n, "primary" if i % 2 else "accent")
    p.b(c - 3 * n, c - 2 * n, top - 3 * n, c + 3 * n, c + 2 * n, top, "primary")       # sensor head
    p.b(c + 3 * n, c - n, top - 2 * n, c + 3 * n + 1, c + n, top - n, "emit_a")
    p.b(c - n, c - n, top, c + n, c + n, top + n, "emit_b")
    p.size = (W, W, max(bx[5] for bx in p.boxes))
    return p


def radiator(sz):
    n = K.SIZE_CELLS[sz]
    W = 16 * n
    p = Piece(f"x.radiator.{sz}", "mount", "top", (W, W, 0))
    z = top_base(p, W)
    top = {1: 9, 2: 14, 3: 19}[n]
    p.b(1, 1, z, W - 1, 3, z + 3, "secondary").b(1, W - 3, z, W - 1, W - 1, z + 3, "secondary")   # manifolds
    for x in range(2, W - 2, 3):                                          # fins run along Y
        p.b(x, 2, z, x + 1, W - 2, top, "metal")
        p.b(x, 2, top - 1, x + 1, W - 2, top, "emit_b")                  # hot edge glow
    p.b(0, W // 2 - 1, z, W, W // 2 + 1, z + 2, "accent")
    p.size = (W, W, max(bx[5] for bx in p.boxes))
    return p


def solar(sz):
    n = K.SIZE_CELLS[sz]
    W = 16 * n
    p = Piece(f"x.solar.{sz}", "mount", "top", (W, W, 0))
    z = top_base(p, W)
    p.b(W // 2 - 1, W // 2 - 1, z, W // 2 + 1, W // 2 + 1, z + 3, "metal")
    p.b(0, 0, z + 3, W, W, z + 4, "trim")
    for x in range(1, W - 1, 4):
        for y in range(1, W - 1, 4):
            p.b(x, y, z + 4, x + 3, y + 3, z + 5, "glass")
    p.b(0, 0, z + 4, 1, W, z + 5, "emit_a")
    p.size = (W, W, max(bx[5] for bx in p.boxes))
    return p


def drone_bay(sz):
    n = K.SIZE_CELLS[sz]
    W = 16 * n
    p = Piece(f"x.drone-bay.{sz}", "mount", "top", (W, W, 0))
    z = top_base(p, W)
    top = z + int(W * 0.45)
    p.b(0, 0, z, W, W, top - 2, "primary")
    hazard(p, 0, W, 0, 1, z, z + 2)
    p.b(2, 2, top - 2, W // 2 - 1, W - 2, top - 1, "secondary").b(W // 2 + 1, 2, top - 2, W - 2, W - 2, top - 1, "secondary")   # doors
    p.b(W // 2 - 1, 2, top - 2, W // 2 + 1, W - 2, top - 1, "dark")
    for x, y in ((3, 3), (W - 4, 3), (3, W - 4), (W - 4, W - 4)):
        p.b(x, y, top - 1, x + 1, y + 1, top, "emit_a")
    p.b(W - 5, W // 2 - 2, top - 1, W - 2, W // 2 + 2, top + 2 * n, "accent")   # control dome
    p.size = (W, W, max(bx[5] for bx in p.boxes))
    return p


def vtol(sz):
    n = K.SIZE_CELLS[sz]
    W = 16 * n
    c = W // 2
    p = Piece(f"x.vtol.{sz}", "mount", "top", (W, W, 0))
    z = top_base(p, W)
    top = z + int(W * 0.45)
    r = W // 2 - 2
    p.disc("z", c, c, r, z, top - 3, "primary", rin=r - 2)
    p.disc("z", c, c, r - 2, z, z + 2, "dark")
    p.disc("z", c, c, max(2, r // 3), z + 2, top - 4, "metal")
    for a in range(0, 360, 45):                                           # fan blades
        x = c + int((r - 3) * math.cos(math.radians(a)) * 0.7)
        y = c + int((r - 3) * math.sin(math.radians(a)) * 0.7)
        p.b(min(c, x), min(c, y), top - 5, max(c, x) + 1, max(c, y) + 1, top - 4, "trim")
    p.disc("z", c, c, max(1, r // 4), top - 4, top - 3, "emit_a")
    p.size = (W, W, max(bx[5] for bx in p.boxes))
    return p


def hatch_exterior(sz):
    W = 16
    p = Piece("x.hatch-exterior.SM", "mount", "top", (W, W, 0))
    K.frame_top(p, 0, 0, W, W, 0, 3, 2, "secondary")
    p.disc("z", 8, 8, 6, 0, 4, "primary")
    p.disc("z", 8, 8, 4, 4, 5, "metal", rin=3)
    p.b(7, 4, 4, 9, 12, 5, "metal").b(4, 7, 4, 12, 9, 5, "metal")
    hazard(p, 0, W, 0, 1, 3, 4)
    p.b(14, 14, 3, 15, 15, 5, "emit_b")
    p.size = (W, W, 5)
    return p


# =============================================================================== face builders (kit face convention)
# x in [0, W] along the face, +Y outward from the mount plane, z up; engines centred at z = W/2.
def resonance(sz):
    n = K.SIZE_CELLS[sz]
    W = 16 * n
    L = int(K.ION_LEN[sz] * 0.85) + 6
    cx = cz = W // 2
    r = W // 2 - 2
    p = Piece(f"x.resonance.{sz}", "mount", "face", (W, L, W))
    p.b(0, 0, 0, W, 2, W, "trim")
    K.extrude(p, "y", cx, cz, K.section_rows(r, max(1, r // 2)), 2, 6, "secondary")
    y = 6
    seg = max(6, W // 3)
    i = 0
    while y + seg < L - 8:
        rr = max(3, r - i // 2)
        K.extrude(p, "y", cx, cz, K.section_rows(rr, max(1, rr // 2)), y, y + seg - 2, "primary" if i % 2 == 0 else "accent")
        K.extrude(p, "y", cx, cz, K.section_rows(rr - 1, max(1, rr // 2)), y + seg - 2, y + seg, "emit_a")
        for s in (-1, 1):                                                  # crystal fins
            p.b(cx + s * rr - (1 if s > 0 else 0), y + 1, cz - 1, cx + s * (rr + 2 + n), y + seg - 3, cz + 1, "glass")
        y += seg
        i += 1
    p.disc("y", cx, cz, max(2, r - 2), y, y + 3, "metal", rin=max(1, r - 4))
    p.disc("y", cx, cz, max(2, r - 3), y, y + 4, "glass")                   # resonance lens
    p.disc("y", cx, cz, max(1, r // 2), y + 2, y + 5, "emit_a")
    p.size = (W, max(bx[4] for bx in p.boxes), W)
    return p


def torpedo(sz):
    n = K.SIZE_CELLS[sz]
    W = 16 * n
    L = int(W * 2.0)
    Hh = int(W * 0.8)
    p = Piece(f"x.torpedo.{sz}", "mount", "face", (W, L, Hh))
    p.b(0, 0, 0, W, 3, Hh, "trim")
    K.housing(p, 1, W - 1, 3, L - 6, 1, Hh - 1, "primary", ch=max(1, n))
    hazard(p, 1, W - 1, L - 7, L - 6, 1, Hh - 1)
    p.b(0, L // 3, 0, W, L // 3 + 3, Hh, "accent")
    r = int(Hh * 0.32)
    p.disc("y", W // 2, Hh // 2, r + 2, L - 6, L, "secondary")               # tube muzzle
    p.disc("y", W // 2, Hh // 2, r, L - 6, L, "dark")
    p.disc("y", W // 2, Hh // 2, max(1, r - 2), L - 7, L - 6, "emit_b")
    for zz in (2, Hh - 4):
        p.b(W - 2, 6, zz, W, L - 10, zz + 2, "metal")
    return p


def salvage_arm(sz):
    n = K.SIZE_CELLS[sz]
    W = 16 * n
    L = int(W * 1.75)
    p = Piece(f"x.salvage-arm.{sz}", "mount", "face", (W, L, W))
    p.b(0, 0, 0, W, 3, W, "trim")
    c = W // 2
    p.disc("y", c, c, int(W * 0.35), 3, 3 + 4 * n, "secondary")              # shoulder
    s0 = 3 + 4 * n
    aw = max(2, int(W * 0.12))
    p.b(c - aw, s0, c - aw, c + aw, s0 + int(L * 0.45), c + aw, "primary")   # upper arm
    hazard(p, c - aw, c + aw, s0 + 2, s0 + int(L * 0.4), c + aw, c + aw + 1)
    e = s0 + int(L * 0.45)
    p.disc("x", e, c, aw + 1, c - aw - 1, c + aw + 1, "metal")                # elbow (axis x)
    p.b(c - aw + 1, e, c - aw + 1, c + aw - 1, L - 6, c + aw - 1, "secondary")   # forearm
    for x0 in (c - aw - 2, c + aw):                                            # claw jaws
        p.b(x0, L - 6, c - aw, x0 + 2, L, c + aw, "accent")
    p.b(c - 1, L - 5, c - 1, c + 1, L - 1, c + 1, "emit_b")                   # cutter
    return p


def cargo_door_w(width_m, height_m):
    W, Hh = int(width_m * 16), int(height_m * 16)
    p = Piece(f"x.cargo-door.{width_m}m", "mount", "face", (W, 5, Hh))
    K.frame(p, 0, 0, W, Hh, 0, 4, 4, "secondary")
    slats = max(3, (Hh - 8) // 8)
    sh = (Hh - 8) // slats
    for i in range(slats):
        z0 = 4 + i * sh
        p.b(4, 0, z0 + 1, W - 4, 2, z0 + sh, "primary")
        p.b(5, 2, z0 + sh - 2, W - 5, 3, z0 + sh - 1, "trim")
    hazard(p, 0, W, 3, 5, 0, 3, step=3)
    p.b(4, 2, 4, 5, 3, Hh - 4, "metal").b(W - 5, 2, 4, W - 4, 3, Hh - 4, "metal")
    p.b(1, 3, Hh - 3, 4, 5, Hh - 1, "emit_b").b(W - 4, 3, Hh - 3, W - 1, 5, Hh - 1, "emit_b")
    p.b(W // 2 - 2, 3, Hh - 3, W // 2 + 2, 5, Hh - 1, "emit_a")
    return p


def airlock_ext():
    W, Hh = 32, 44
    p = Piece("x.airlock-exterior.MD", "mount", "face", (W, 16, Hh))
    K.frame(p, 0, 0, W, Hh, 0, 12, 4, "secondary")                          # outer collar (protrudes)
    p.b(4, 0, 0, W - 4, 2, 4, "dark")
    K.frame(p, 4, 4, W - 4, Hh - 2, 10, 14, 2, "primary")
    p.b(6, 11, 4, W - 6, 13, Hh - 4, "metal")                               # outer door
    p.b(W // 2 - 1, 13, 6, W // 2 + 1, 14, Hh - 6, "dark")
    hazard(p, 0, W, 12, 14, 0, 3, step=3)
    p.disc("y", W // 2, Hh - 8, 3, 13, 15, "trim", rin=1)
    p.b(1, 12, Hh - 4, 3, 16, Hh - 2, "emit_b").b(W - 3, 12, Hh - 4, W - 1, 16, Hh - 2, "emit_a")
    return p


def airlock_int():
    W, Hh = 32, 44
    p = Piece("x.airlock-interior.SM", "mount", "face", (W, 8, Hh))
    K.frame(p, 0, 0, W, Hh, 0, 8, 3, "secondary")
    p.b(3, 2, 0, W - 3, 6, Hh - 3, "primary")
    p.b(W // 2 - 1, 5, 2, W // 2 + 1, 7, Hh - 5, "dark")
    hazard(p, 3, W - 3, 5, 7, 0, 2, step=3)
    p.b(W - 3, 7, 18, W - 1, 8, 24, "emit_a")
    return p


def docking_port(sz):
    n = {"MD": 2, "LG": 3}[sz]
    W, Hh = 16 * n, int((2.75 if sz == "MD" else 3.25) * 16)
    L = int((1.2 if sz == "MD" else 1.6) * 16)
    p = Piece(f"x.docking-port.{sz}", "mount", "face", (W, L, Hh))
    cz = Hh // 2
    r = min(W, Hh) // 2 - 1
    p.b(0, 0, 0, W, 2, Hh, "trim")
    p.disc("y", W // 2, cz, r, 2, L - 4, "secondary", rin=r - 4)            # collar
    p.disc("y", W // 2, cz, r - 4, 2, 4, "primary")                           # inner hatch
    p.disc("y", W // 2, cz, r + 1, L - 4, L - 2, "trim", rin=r - 3)
    p.disc("y", W // 2, cz, r, L - 2, L, "emit_a", rin=r - 2)                 # seal ring
    for a in range(4):                                                         # latches
        ang = a * math.pi / 2 + math.pi / 4
        x, z = W // 2 + int(r * 0.9 * math.cos(ang)), cz + int(r * 0.9 * math.sin(ang))
        p.b(x - 2, L - 6, z - 2, x + 2, L, z + 2, "accent")
    return p


# =============================================================================== registry and frames
INTERIOR = {
    "reactor": reactor, "battery": battery, "capacitor": capacitor, "fuel-tank": fuel_tank,
    "aux-generator": aux_generator, "coolant-pump": pump, "heat-sink": heat_sink,
    "magazine-ballistic": magazine("ballistic"), "magazine-missile": magazine("missile"),
    "magazine-torpedo": magazine("torpedo"), "shield-generator": shield_generator,
    "life-support": life_support, "air-filter": air_filter, "oxygen-tank": oxygen_tank,
    "hydroponics": lambda w, d, h: A.hydroponics(K, w, d, h), "gravity": gravity, "computer-core": computer_core,
    "console-navigation": A.console(K, "navigation"), "console-command": A.console(K, "command"),
    "console-fire-control": A.console(K, "fire-control"), "console-engineering": A.console(K, "engineering"),
    "console-sensor": A.console(K, "sensor"), "crew-bunk": crew_bunk, "warp": warp, "hatch": deck_hatch,
}
TOP = {"plasma": plasma, "mining-laser": mining_laser, "radar": radar, "scanner": scanner, "radiator": radiator,
       "solar": solar, "drone-bay": drone_bay, "vtol": vtol, "hatch-exterior": hatch_exterior}
FACE = {"resonance": resonance, "torpedo": torpedo, "salvage-arm": salvage_arm, "docking-port": docking_port}
EDGE = {"cargo-door": None, "airlock-exterior": None, "airlock-interior": None}
KIT_CACHE = K.Kit()


WEAPON_KEYS = {"wpn.pd": "pd", "wpn.autocannon": "autocannon", "wpn.laser": "laser", "wpn.railgun": "railgun",
               "wpn.missile": "missile", "wpn.flak": "flak", "x.plasma": "plasma"}
UTILITY_KEYS = {"wpn.shield": "shield", "wpn.tractor": "tractor", "wpn.sensor": "sensor", "wpn.clamp": "clamp",
                "wpn.beacon": "beacon"}
NO_GREEBLE = ("resonance", "vtol", "console-navigation", "console-command", "console-fire-control",
              "console-engineering", "console-sensor", "hydroponics", "crew-bunk")


def build_parts(component):
    """(parts, labels) for stacked top mounts (r002 weapons and utility mounts), else None."""
    base, _, sz = component["art"]["kitKey"].rpartition(".")
    if base in WEAPON_KEYS:
        return A.weapon(K, WEAPON_KEYS[base], sz)
    if base in UTILITY_KEYS:
        return A.remount(K, UTILITY_KEYS[base], sz)
    return None


def copy_piece(piece, pid=None):
    q = Piece(pid or piece.id, piece.family, piece.mount, piece.size)
    q.boxes = list(piece.boxes)
    return q


def build_piece(component):
    """Returns (piece in kit convention, convention, z-centre in texels) for a catalog component."""
    key = component["art"]["kitKey"]
    lo, hi = component["mount"]["envelopeM"]
    stacked = build_parts(component)
    if stacked:
        return A.union(K, "r2." + key, stacked[0]), "top", 0
    if not key.startswith("x."):
        piece = K.kit_piece(KIT_CACHE, key)
        conv = piece.mount                                               # "top" | "face"
        zc = piece.size[2] / 2 if conv == "face" else 0
        if key.startswith("cannon."):                                    # sponsons get the r002 detail pass
            piece = A.greeble(K, copy_piece(piece, "r2." + key), key, slots=("primary", "secondary", "accent"))
        return piece, conv, zc
    _, kind, size = key.split(".", 2)
    detail = kind not in NO_GREEBLE
    if kind in INTERIOR:
        w, d, h = (cells_px(hi[i] - lo[i]) for i in range(3))
        if not detail:
            return INTERIOR[kind](w, d, h), "interior", 0
        # build inset so the detail pass stays inside the footprint, then re-centre
        piece = A.greeble(K, INTERIOR[kind](w - 4, d - 4, h - 2), key, slots=("primary", "secondary"), lights=0.08)
        piece.boxes = [(x0 + 2, y0 + 2, z0, x1 + 2, y1 + 2, z1, s) for x0, y0, z0, x1, y1, z1, s in piece.boxes]
        piece.size = (w, d, h)
        return piece, "interior", 0
    if kind in TOP:
        piece = TOP[kind](size)
        if detail:
            A.greeble(K, piece, key, slots=("primary", "secondary"), lights=0.05)
        return piece, "top", 0
    if kind in FACE:
        piece = FACE[kind](size)
        if detail:
            A.greeble(K, piece, key, slots=("primary", "secondary"), lights=0.05, skip_top=True)
        zc = 0 if kind == "docking-port" else piece.size[2] / 2
        return piece, "face", zc
    if kind == "cargo-door":
        width = int(size.rstrip("m"))
        return cargo_door_w(width, hi[2]), "face", 0
    if kind == "airlock-exterior":
        return airlock_ext(), "face", 0
    if kind == "airlock-interior":
        return airlock_int(), "face", 0
    raise KeyError(key)


def to_catalog(piece, conv, zc):
    """Box list in catalog-frame texels (see module docstring)."""
    out = []
    W, D = piece.size[0], piece.size[1]
    for x0, y0, z0, x1, y1, z1, s in piece.boxes:
        if conv == "face":                       # rotate 180 about Z around the hardpoint centre; outward +Y -> -Y
            out.append((W / 2 - x1, -y1, z0 - zc, W / 2 - x0, -y0, z1 - zc, s))
        elif conv == "top":                      # centre, then rotate +90 about Z: barrels +X -> +Y
            X0, X1, Y0, Y1 = x0 - W / 2, x1 - W / 2, y0 - D / 2, y1 - D / 2
            out.append((-Y1, X0, z0, -Y0, X1, z1, s))
        else:                                    # interior: centre on the footprint
            out.append((x0 - W / 2, y0 - D / 2, z0, x1 - W / 2, y1 - D / 2, z1, s))
    return out


# =============================================================================== materials and objects
def slot_materials():
    th = K.THEMES[THEME]
    mats = []
    for i, s in enumerate(SLOTS):
        m = bpy.data.materials.new(f"slot{i}_{s}")
        m.use_nodes = True
        b = m.node_tree.nodes.get("Principled BSDF")
        if s in ("emit_a", "emit_b"):
            col, strength = th[s]
            b.inputs["Base Color"].default_value = (*col, 1)
            b.inputs["Emission Color"].default_value = (*col, 1)
            b.inputs["Emission Strength"].default_value = strength
        elif s == "glass":
            b.inputs["Base Color"].default_value = (*th["glass"], 1)
            b.inputs["Roughness"].default_value = 0.05
            b.inputs["Alpha"].default_value = 0.4
            b.inputs["Emission Color"].default_value = (*th["glass"], 1)
            b.inputs["Emission Strength"].default_value = 0.6
            m.surface_render_method = "BLENDED"
        else:
            rough, metal, _ = K.SLOT_PBR[s]
            b.inputs["Base Color"].default_value = (*th[s], 1)
            b.inputs["Roughness"].default_value = rough
            b.inputs["Metallic"].default_value = metal
        mats.append(m)
    return mats


def boxes_mesh(name, boxes):
    verts, faces, idx = [], [], []
    for x0, y0, z0, x1, y1, z1, slot in boxes:
        o = len(verts)
        verts += [(x * T, y * T, z * T) for x, y, z in
                  ((x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1))]
        faces += [(o, o + 3, o + 2, o + 1), (o + 4, o + 5, o + 6, o + 7), (o, o + 1, o + 5, o + 4),
                  (o + 1, o + 2, o + 6, o + 5), (o + 2, o + 3, o + 7, o + 6), (o + 3, o, o + 4, o + 7)]
        idx += [SI[slot]] * 6
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.polygons.foreach_set("material_index", idx)
    me.polygons.foreach_set("use_smooth", [True] * len(faces))
    return me


def component_object(component, mats, coll, bevel=True):
    piece, conv, zc = build_piece(component)
    boxes = to_catalog(piece, conv, zc)
    me = boxes_mesh(component["id"], boxes)
    for m in mats:
        me.materials.append(m)
    ob = bpy.data.objects.new(component["id"], me)
    coll.objects.link(ob)
    if bevel:
        md = ob.modifiers.new("brick", "BEVEL")
        md.width, md.segments, md.limit_method, md.angle_limit = BEVEL, 1, "ANGLE", math.radians(30)
        md.harden_normals, md.use_clamp_overlap = True, True
    return ob, boxes, conv


def port_empties(component, parent, coll):
    out = []
    for port in component["ports"]:
        e = bpy.data.objects.new(f"port.{port['id']}", None)
        e.empty_display_type, e.empty_display_size = "ARROWS", 0.1
        e.location = Vector(port["position"])
        for k in ("channel", "direction", "capacity", "medium", "connectorFamily"):
            e[k] = port[k]
        e["normal"] = list(port["normal"])
        coll.objects.link(e)
        e.parent = parent
        out.append(e)
    return out


def measure(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = ev.to_mesh()
    me.calc_loop_triangles()
    tris = len(me.loop_triangles)
    verts = len(me.vertices)
    xs = [v.co for v in me.vertices]
    lo = [min(c[i] for c in xs) for i in range(3)]
    hi = [max(c[i] for c in xs) for i in range(3)]
    used = sorted({p.material_index for p in me.polygons})
    ev.to_mesh_clear()
    return tris, verts, lo, hi, used


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def clear_collection(coll):
    for ob in list(coll.objects):
        data = ob.data
        bpy.data.objects.remove(ob, do_unlink=True)
        if data is not None and data.users == 0 and isinstance(data, bpy.types.Mesh):
            bpy.data.meshes.remove(data)


def export_all(catalog, a):
    out = Path(a.out)
    (out / "glb").mkdir(parents=True, exist_ok=True)
    only = {s for s in a.only.split(",") if s}
    sc = bpy.context.scene
    coll = bpy.data.collections.new("export")
    sc.collection.children.link(coll)
    mats = slot_materials()
    rows = []
    for c in catalog["components"]:
        if not c["art"]["kitKey"] or (only and c["id"] not in only):
            continue
        root = bpy.data.objects.new(f"component.{c['id']}", None)
        coll.objects.link(root)
        for k, v in (("componentId", c["id"]), ("sizeClass", c["sizeClass"]), ("schema", catalog["schema"]),
                     ("catalogRevision", catalog["revision"]), ("frame", c["mount"]["frame"]), ("status", "proposed")):
            root[k] = v
        ob, boxes, conv = component_object(c, mats, coll)
        ob.parent = root
        empties = port_empties(c, root, coll)
        tris, verts, lo, hi, used = measure(ob)
        glb = out / "glb" / f"{c['id']}.glb"
        if not a.no_glb:
            bpy.ops.object.select_all(action="DESELECT")
            for o in [root, ob, *empties]:
                o.select_set(True)
            bpy.context.view_layer.objects.active = root
            bpy.ops.export_scene.gltf(filepath=str(glb), export_format="GLB", use_selection=True, export_apply=True,
                                      export_extras=True, export_yup=True, export_cameras=False, export_lights=False,
                                      export_animations=False, export_materials="EXPORT")
        elo, ehi = c["mount"]["envelopeM"]
        over = max(max(elo[i] - lo[i], hi[i] - ehi[i]) for i in range(3))
        rows.append({
            "id": c["id"], "kitKey": c["art"]["kitKey"], "frame": c["mount"]["frame"], "kitConvention": conv,
            "glb": str(glb.relative_to(ROOT)) if glb.is_relative_to(ROOT) else str(glb),
            "sha256": sha256(glb) if glb.exists() and not a.no_glb else None,
            "bytes": glb.stat().st_size if glb.exists() and not a.no_glb else None,
            "boxes": len(boxes), "triangles": tris, "vertices": verts,
            "materialSlotsUsed": [f"slot{i}_{SLOTS[i]}" for i in used],
            "boundsM": [[round(v, 4) for v in lo], [round(v, 4) for v in hi]],
            "catalogEnvelopeM": [elo, ehi],
            "envelopeOverhangM": round(max(0.0, over), 4),
            "ports": [p["id"] for p in c["ports"]],
        })
        clear_collection(coll)
        print(f"[export] {c['id']:32s} tris={tris:6d} over={max(0.0, over):.3f} m")
    return rows


def main():
    a = args()
    catalog = json.loads(Path(a.catalog).read_text())
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rows = export_all(catalog, a)
    out = Path(a.out)
    manifest = {
        "schema": "sidereal.ship-component-art.v1",
        "revision": EXPORT_REVISION,
        "status": "proposed; not owner-approved; not published",
        "catalog": {"schema": catalog["schema"], "id": catalog["id"], "revision": catalog["revision"],
                    "sha256": sha256(a.catalog)},
        "generator": {"script": str(Path(__file__).resolve().relative_to(ROOT)), "sha256": sha256(__file__),
                      "kit": str(KIT_PATH.relative_to(ROOT)), "kitSha256": sha256(KIT_PATH),
                      "blender": bpy.app.version_string},
        "units": "metres; 1 texel = 1/16 m brick grid",
        "axes": "Blender Z-up part frame (+X starboard, +Y forward, +Z up); glTF is +Y up: (x, y, z) -> (x, z, -y)",
        "materialSlots": [f"slot{i}_{s}" for i, s in enumerate(SLOTS)],
        "bevel": {"widthM": BEVEL, "segments": 1, "angleLimitDeg": 30, "applied": True},
        "excluded": "plumes, labels, decals and damage-state variants (pristine only)",
        "components": rows,
    }
    if not a.only:
        (out / "manifest.json").write_text(json.dumps(manifest, indent=1) + "\n")
    print(f"[export] {len(rows)} components")
    if a.sheets:
        sys.path.insert(0, str(HERE))
        import ship_component_sheets
        ship_component_sheets.render(K, catalog, a, sys.modules[__name__])


if __name__ == "__main__":
    main()
