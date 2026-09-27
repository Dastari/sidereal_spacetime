"""Interior object builders (prefab deck furniture) in the studless brick style, r001.

These replace the translucent placeholder boxes the prefab renderer draws for art-library object
sockets (`DerivedSocket.designId`). Canonical sizes come from packages/content/src/
construction-grammar.v1.json socket entries `[designId, w, d, h]` (texels): w runs along the wall
(local +X), d is depth with the front / access side at local +Y, z up, origin on the floor.
Materials are the nine fixed slots. Proposal art; not owner-approved.
"""
import ship_component_art as A

# design id -> (w, d, h) texels, mirrored from construction-grammar.v1.json
OBJECT_SIZES = {
    "cargo.fluid.medium": (16, 16, 20),
    "cargo.standard.medium": (16, 16, 16),
    "pale-studless.console.standard": (24, 10, 16),
    "pale-studless.kitchen.standard": (12, 36, 16),
    "pale-studless.table.standard": (24, 16, 12),
    "shipyard.equipment.bridge-bank": (32, 8, 18),
    "shipyard.equipment.command-console": (24, 10, 16),
    "shipyard.equipment.crew-bunk": (32, 16, 20),
    "shipyard.equipment.hydroponics": (44, 12, 12),
    "shipyard.equipment.lounge-sofa": (40, 14, 14),
    "shipyard.equipment.medical-bed": (30, 16, 14),
    "shipyard.equipment.pilot-seat": (10, 10, 20),
    "shipyard.equipment.reactor": (30, 30, 36),
    "shipyard.equipment.wall-locker": (12, 8, 32),
}


def crate(K, w, d, h):
    p = K.Piece("o.cargo.standard", "object", "interior", (w, d, h))
    p.b(1, 1, 0, w - 1, d - 1, h - 1, "primary")
    for x in (0, w - 2):                                       # corner posts (reinforced frame)
        for y in (0, d - 2):
            p.b(x, y, 0, x + 2, y + 2, h, "trim")
    p.b(0, 0, h - 2, w, d, h, "secondary")                     # lid rim
    p.b(2, 2, h - 1, w - 2, d - 2, h, "trim")
    y = d - 1                                                  # front panel: hazard band, latch, label light
    for i, x in enumerate(range(2, w - 2, 2)):
        p.b(x, y, 2, x + 2, y + 1, 4, "trim" if i % 2 == 0 else "dark")
    p.b(w // 2 - 2, y, h // 2 - 1, w // 2 + 2, y + 1, h // 2 + 2, "metal")
    p.b(w - 5, y, h - 5, w - 3, y + 1, h - 3, "emit_b")
    p.b(0, d // 2 - 1, 5, 1, d // 2 + 1, h - 5, "accent").b(w - 1, d // 2 - 1, 5, w, d // 2 + 1, h - 5, "accent")
    return p


def fluid_tank(K, w, d, h):
    p = K.Piece("o.cargo.fluid", "object", "interior", (w, d, h))
    p.b(0, 0, 0, w, d, 2, "trim")
    for x in (0, w - 2):
        for y in (0, d - 2):
            p.b(x, y, 0, x + 2, y + 2, h, "secondary")
    r = min(w, d) // 2 - 2
    p.disc("z", w // 2, d // 2, r, 2, h - 2, "primary")
    for z in (5, h - 6):
        p.disc("z", w // 2, d // 2, r + 1, z, z + 1, "accent", rin=r - 1)
    p.disc("z", w // 2, d // 2, max(2, r - 3), h - 2, h - 1, "metal")
    p.b(w // 2 - 1, d - 2, h // 2, w // 2 + 1, d, h // 2 + 4, "emit_a")          # level gauge
    p.b(0, 0, h - 1, w, 2, h, "trim").b(0, d - 2, h - 1, w, d, h, "trim")
    return p


def wall_locker(K, w, d, h):
    p = K.Piece("o.wall-locker", "object", "interior", (w, d, h))
    half = w // 2
    p.b(0, 0, 0, w, d - 1, h, "secondary")
    for x0, x1 in ((1, half), (half, w - 1)):                  # two doors: vent slots and a handle
        p.b(x0, d - 1, 1, x1, d, h - 2, "primary")
        for z in range(h - 9, h - 4, 2):
            p.b(x0 + 1, d - 1, z, x1 - 1, d, z + 1, "dark")
        hx = x1 - 2 if x0 == 1 else x0 + 1
        p.b(hx, d - 1, h // 2 - 2, hx + 1, d, h // 2 + 2, "metal")
    p.b(half - 1, d - 1, 3, half + 1, d, 6, "emit_a")          # status light
    p.b(0, 0, h - 2, w, d, h, "trim")
    return p


def bridge_bank(K, w, d, h):
    """Wall console bank: chunky base, three big bright multi-cell screens leaning back."""
    p = K.Piece("o.bridge-bank", "object", "interior", (w, d, h))
    p.b(0, 0, 0, w, d, 2, "dark")
    p.b(0, 0, 2, w, d, 8, "primary")
    p.b(0, 0, 8, w, d, 9, "secondary")
    p.b(1, d - 2, 9, w - 1, d, 10, "emit_b")                   # desk light strip
    panels = 3
    pw = (w - 2) // panels
    for i in range(panels):
        x0 = 1 + i * pw
        for j, z in enumerate(range(10, h - 1, 2)):            # terraced screen, one texel back per row
            y1 = max(2, d - 2 - j)
            p.b(x0, 0, z, x0 + pw - 1, y1 - 1, z + 2, "secondary")
            glow = "emit_b" if (i == 1 and j == 0) else "emit_a"
            p.b(x0 + 1, y1 - 1, z, x0 + pw - 2, y1, z + 2, glow)
        p.b(x0, 0, h - 1, x0 + pw - 1, 2, h, "trim")
    return p


def sofa(K, w, d, h):
    p = K.Piece("o.lounge-sofa", "object", "interior", (w, d, h))
    p.b(1, 1, 0, w - 1, d - 1, 2, "dark")
    p.b(0, 0, 2, w, d, 6, "secondary")                          # base
    n = 3
    cw = (w - 4) // n
    for i in range(n):                                         # seat cushions
        x0 = 2 + i * cw
        p.b(x0, 3, 6, x0 + cw - 1, d, 8, "accent")
        p.b(x0, 0, 6, x0 + cw - 1, 4, h - 1, "accent")         # back cushions
    p.b(0, 0, 2, 2, d, 11, "secondary").b(w - 2, 0, 2, w, d, 11, "secondary")   # arms
    p.b(0, 0, h - 1, w, 2, h, "trim")
    return p


def medical_bed(K, w, d, h):
    p = K.Piece("o.medical-bed", "object", "interior", (w, d, h))
    p.b(2, 2, 0, w - 2, d - 2, 4, "secondary")                  # pedestal
    p.b(0, 0, 4, w, d, 6, "trim")                               # frame
    p.b(1, 1, 6, w - 6, d - 1, 8, "primary")                    # white mattress
    p.b(2, 2, 8, 7, d - 2, 9, "primary")                        # pillow
    p.b(w - 6, 1, 6, w - 1, d - 1, 7, "accent")                 # red blanket foot
    p.b(0, 0, 6, 2, d, h, "secondary")                          # headboard with monitor
    p.b(0, 3, 9, 1, d - 3, h - 1, "emit_a")
    p.b(1, d // 2 - 1, h - 3, 2, d // 2 + 1, h - 1, "emit_b")
    return p


def table(K, w, d, h):
    p = K.Piece("o.table", "object", "interior", (w, d, h))
    p.b(w // 2 - 2, d // 2 - 2, 0, w // 2 + 2, d // 2 + 2, h - 2, "metal")
    p.b(w // 2 - 5, d // 2 - 4, 0, w // 2 + 5, d // 2 + 4, 1, "trim")
    p.b(0, 0, h - 2, w, d, h - 1, "secondary")
    p.b(1, 1, h - 1, w - 1, d - 1, h, "primary")
    return p


def kitchen(K, w, d, h):
    """Galley counter (w along wall is short here; runs along local Y)."""
    p = K.Piece("o.kitchen", "object", "interior", (w, d, h))
    p.b(0, 0, 0, w, d, 10, "primary")
    for y in range(1, d - 2, 6):                                # cabinet doors
        p.b(w - 1, y, 1, w, y + 5, 9, "secondary")
        p.b(w - 1, y + 2, 7, w, y + 3, 8, "metal")
    p.b(0, 0, 10, w, d, 11, "trim")                             # counter top
    p.disc("z", w // 2, 7, 2, 11, 12, "emit_b")                 # hob
    p.disc("z", w // 2, 13, 2, 11, 12, "emit_b")
    p.b(1, d - 12, 11, w - 1, d - 4, 12, "dark")                # sink
    p.b(0, 0, 11, 2, d, h, "secondary")                         # splash wall with shelves
    p.b(0, 4, h - 3, 3, d - 4, h - 2, "trim")
    return p


def pilot_seat(K, w, d, h):
    p = K.Piece("o.pilot-seat", "object", "interior", (w, d, h))
    p.b(w // 2 - 1, d // 2 - 1, 0, w // 2 + 1, d // 2 + 1, 6, "metal")
    p.b(1, 1, 0, w - 1, d - 1, 1, "trim")
    p.b(0, 1, 6, w, d - 1, 8, "secondary")                      # seat
    p.b(0, 0, 8, w, 2, h, "secondary")                          # back
    p.b(1, 1, 9, w - 1, 2, h - 2, "accent")
    p.b(0, 2, 8, 1, d - 2, 11, "primary").b(w - 1, 2, 8, w, d - 2, 11, "primary")   # arm rests
    p.b(w - 1, d - 3, 11, w, d - 1, 12, "emit_a")               # arm console light
    return p


def builders(K, X):
    console = A.console(K, "command", seat=False)            # seats are separate pilot-seat objects
    nav = A.console(K, "navigation", seat=False)
    return {
        "cargo.fluid.medium": lambda w, d, h: fluid_tank(K, w, d, h),
        "cargo.standard.medium": lambda w, d, h: crate(K, w, d, h),
        "pale-studless.console.standard": lambda w, d, h: nav(w, d, h),
        "pale-studless.kitchen.standard": lambda w, d, h: kitchen(K, w, d, h),
        "pale-studless.table.standard": lambda w, d, h: table(K, w, d, h),
        "shipyard.equipment.bridge-bank": lambda w, d, h: bridge_bank(K, w, d, h),
        "shipyard.equipment.command-console": lambda w, d, h: console(w, d, h),
        "shipyard.equipment.crew-bunk": lambda w, d, h: X.crew_bunk(w, d, h),
        "shipyard.equipment.hydroponics": lambda w, d, h: A.hydroponics(K, w, d, h),
        "shipyard.equipment.lounge-sofa": lambda w, d, h: sofa(K, w, d, h),
        "shipyard.equipment.medical-bed": lambda w, d, h: medical_bed(K, w, d, h),
        "shipyard.equipment.pilot-seat": lambda w, d, h: pilot_seat(K, w, d, h),
        "shipyard.equipment.reactor": lambda w, d, h: X.reactor(w, d, h),
        "shipyard.equipment.wall-locker": lambda w, d, h: wall_locker(K, w, d, h),
    }
