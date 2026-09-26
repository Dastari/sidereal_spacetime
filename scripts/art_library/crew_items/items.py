"""Crew handheld / carried / worn item designs r001 (1/32 m voxels, pure Python).

Each builder paints an Item in authoring voxel coordinates (x right, y forward, z up; all boxes on
integer grid lines) and declares sockets. The grip socket is the item origin: the centre of the
cross-section the right hand closes around (socket.hand.R target). The support socket is the same
for the left hand (socket.hand.L). Muzzle / emitter sockets point along +Y unless stated.

Reference tiles: scripts/art_library/crew_items_reference_crops.json (ids in `refs`).
Colour/material roles are SLOTS; themes are slot tables (see themes.py).
"""
from .voxel import Item

# Holster presets: item forward/up expressed in the CHARACTER body frame (Blender: +X right,
# +Y forward, +Z up) plus an offset in metres from the named character socket.
HOLSTERS = {
    "hip.R": {"socket": "socket.hip.R", "forward": (0, 0, -1), "up": (0, 1, 0), "offset": (0.08, 0.0, -0.02)},
    "hip.L": {"socket": "socket.hip.L", "forward": (0, 0, -1), "up": (0, 1, 0), "offset": (-0.08, 0.0, -0.02)},
    "back": {"socket": "socket.back", "forward": (-0.5, 0, 0.866), "up": (0, -1, 0), "offset": (0.0, -0.07, -0.08)},
    "back.tool": {"socket": "socket.back", "forward": (0.5, 0, 0.866), "up": (0, -1, 0), "offset": (0.0, -0.07, -0.12)},
    "belt": {"socket": "socket.belt", "forward": (0, 0, -1), "up": (0, -1, 0), "offset": (0.2, -0.12, 0.0)},
    "belt.back": {"socket": "socket.belt", "forward": (0, 1, 0), "up": (0, 0, 1), "offset": (0.0, -0.2, -0.02)},
    "worn.back": {"socket": "socket.back", "forward": (0, 1, 0), "up": (0, 0, 1), "offset": (0.0, 0.0, 0.0)},
    "none": None,
}


def meta(it, *, label, sub, refs, profile, holster, fx=None, two_handed=False, replaces=None,
         support_mode=None, notes=""):
    it.meta.update(label=label, sub=sub, refs=list(refs), pose_profile=profile, holster=holster,
                   fx=dict(fx or {}), two_handed=two_handed, replaces=replaces,
                   support_mode=support_mode or ("foregrip" if two_handed else "free"), notes=notes)
    return it


# ============================================================================ helpers
def sides(it, x0, x1, y0, z0, y1, z1, slot, depth=1):
    """Paint only the two outer side layers of a body spanning x0..x1 (side decals / vents)."""
    it.box(x0, y0, z0, x0 + depth, y1, z1, slot)
    it.box(x1 - depth, y0, z0, x1, y1, z1, slot)
    return it


def pistol_grip(it, x0, x1, y_back, z_top, slot="grip", back="primary", base="secondary"):
    """Raked pistol grip below z_top: 3 rows stepping back; pale back strap; base cap."""
    it.box(x0, y_back + 1, z_top - 2, x1, y_back + 4, z_top, slot)
    it.box(x0, y_back, z_top - 4, x1, y_back + 3, z_top - 2, slot)
    it.box(x0, y_back - 1, z_top - 5, x1, y_back + 2, z_top - 4, slot)
    it.box(x0, y_back + 1, z_top - 2, x1, y_back + 2, z_top, back)
    it.box(x0, y_back, z_top - 4, x1, y_back + 1, z_top - 2, back)
    it.box(x0, y_back - 1, z_top - 6, x1, y_back + 2, z_top - 5, base)


def trigger(it, x0, x1, y_back, z_bottom_of_receiver, length=4):
    """Trigger guard + trigger just ahead of a pistol_grip(y_back) under a receiver bottom."""
    y = y_back + 4
    it.box(x0, y, z_bottom_of_receiver - 2, x1, y + length, z_bottom_of_receiver - 1, "secondary")
    it.box(x0, y + length - 1, z_bottom_of_receiver - 1, x1, y + length, z_bottom_of_receiver, "secondary")
    it.box(x0, y + 1, z_bottom_of_receiver - 1, x1, y + 2, z_bottom_of_receiver, "metal")


# ============================================================================ BALLISTIC
def pistol():
    it = Item("pistol", "Pistol", "ballistic", "pistol")
    X0, X1 = 0, 4
    pistol_grip(it, 1, 3, 3, 7)
    it.box(1, 6, 4, 3, 7, 6, "emit_a")                               # status light on the grip front
    trigger(it, 1, 3, 3, 7)
    it.box(X0, 2, 7, X1, 15, 8, "secondary")                          # frame under the slide
    it.box(X0, 13, 7, X1, 15, 8, "accent")
    s = it.part("slide", (2, 8, 9))
    it.box(X0, 0, 8, X1, 17, 12, "primary")
    it.box(X0, 0, 8, X1, 3, 12, "secondary")                          # charcoal rear block
    for y in (4, 6):
        sides(it, X0, X1, y, 9, y + 1, 11, "dark")                    # serrations
    it.box(1, 7, 11, 3, 12, 12, "dark")                               # top groove / ejection port
    sides(it, X0, X1, 11, 9, 13, 10, "trim")                          # side panel
    it.box(X0, 15, 8, X1, 17, 9, "accent")                            # red nose
    it.box(1, 16, 9, 3, 17, 11, "dark")                               # bore
    it.box(0, 0, 12, 1, 1, 13, "dark").box(3, 0, 12, 4, 1, 13, "dark").box(1, -1, 10, 3, 0, 12, "accent")
    it.box(1, 15, 12, 3, 16, 13, "dark")                              # front sight
    s.key("fire", 0).key("fire", 2, (0, -2, 0)).key("fire", 6)
    m = it.part("mag", (2, 3.5, 0.5))
    it.box(1, 2, 0, 3, 5, 1, "dark")
    m.key("reload", 0).key("reload", 5, (0, 0, -7)).key("reload", 14, (0, 0, -7)).key("reload", 20)
    it.main()
    it.socket("grip", (2, 4.5, 4)).socket("muzzle", (2, 17, 10)).socket("support", (2, 3, 2))
    it.socket("sight", (2, 15.5, 13))
    return meta(it, label="PISTOL", sub="SIDEARM", refs=["wt.pistol", "lo.pistol"], profile="PISTOL_ONE_HAND",
                holster="hip.R", fx={"fire": "muzzle-flash", "projectile": "tracer", "impact": "impact-spark"},
                replaces="compact-pistol")


def smg():
    it = Item("smg", "SMG", "ballistic", "pistol")
    X0, X1 = 0, 4
    it.box(X0, 0, 6, X1, 13, 11, "secondary")                                   # receiver 4x5
    it.box(X0, 8, 7, X1, 13, 11, "primary")                                     # pale front shell
    it.box(X0, 6, 6, X1, 7, 11, "accent")                                       # red band
    sides(it, X0, X1, 1, 7, 5, 10, "primary")
    sides(it, X0, X1, 2, 8, 4, 9, "dark")
    sides(it, X0, X1, 11, 9, 12, 10, "emit_a").box(1, 9, 11, 3, 12, 12, "dark")
    sides(it, X0, X1, 9, 7, 11, 8, "dark")
    it.box(X0, -2, 6, X1, 0, 11, "trim").cut(1, -2, 7, 3, 0, 10).box(1, -1, 7, 3, 0, 10, "dark")   # orange rear ring
    it.box(1, 1, 11, 3, 5, 12, "dark").box(1, 1, 12, 3, 2, 14, "dark").box(1, 4, 12, 3, 5, 14, "dark")
    it.box(1, 2, 12, 3, 4, 13, "emit_a")                                        # sight lens
    it.box(1, 13, 7, 3, 17, 10, "dark").box(0, 16, 6, 4, 18, 11, "secondary").box(1, 17, 8, 3, 18, 9, "dark")
    # grip / trigger / fore grip (2 wide, centred)
    pistol_grip(it, 1, 3, 3, 6)
    it.box(1, 3, 0, 3, 5, 1, "emit_a")
    trigger(it, 1, 3, 3, 6)
    it.box(1, 14, 1, 3, 16, 6, "grip").box(1, 14, 1, 3, 16, 2, "emit_a")
    b = it.part("bolt", (4.5, 9, 9.5))
    it.box(4, 8, 9, 5, 10, 10, "metal")
    b.key("fire", 0).key("fire", 1, (0, -2, 0)).key("fire", 3)
    m = it.part("mag", (2, 12, 2))
    it.box(1, 11, 0, 3, 13, 6, "dark").box(1, 11, 0, 3, 13, 1, "trim").box(1, 11, 3, 3, 13, 4, "secondary")
    m.key("reload", 0).key("reload", 5, (0, 0, -7)).key("reload", 14, (0, 0, -7)).key("reload", 20)
    it.main()
    it.socket("grip", (2, 5, 3)).socket("support", (2, 15, 3.5)).socket("muzzle", (2, 18, 8.5))
    it.socket("stock", (2, -2, 8.5), (0, -1, 0)).socket("sight", (2, 3, 13.5))
    return meta(it, label="SMG", sub="RAPID FIRE", refs=["wt.smg"], profile="PISTOL_TWO_HAND", holster="hip.R",
                fx={"fire": "muzzle-flash", "projectile": "tracer", "impact": "impact-spark"},
                two_handed=True, support_mode="foregrip", replaces="heavy-handgun")


def long_gun(it, length, grip_y, stock_len, receiver_end, *, receiver="primary", shell="secondary"):
    """Shared long-gun skeleton (W=4): stock, raked grip, trigger, receiver. Returns key y positions."""
    X0, X1 = 0, 4
    it.box(X0, 0, 4, X1, 2, 11, "grip")                                              # butt pad
    it.box(X0, 2, 8, X1, stock_len, 11, receiver).box(1, 2, 4, 3, stock_len, 6, shell)
    it.box(1, stock_len - 1, 4, 3, stock_len, 8, shell)
    sides(it, X0, X1, 0, 6, 2, 8, "emit_a")
    it.box(X0, stock_len, 6, X1, receiver_end, 11, receiver)
    pistol_grip(it, 1, 3, grip_y, 6)
    trigger(it, 1, 3, grip_y, 6)
    return X0, X1


def compact_carbine():
    it = Item("compact-carbine", "Compact carbine", "ballistic", "rifle")
    X0, X1 = long_gun(it, 29, 8, 7, 20)
    it.box(1, 0, 11, 3, 3, 12, "accent")
    it.box(X0, 7, 6, X1, 8, 11, "accent")
    sides(it, X0, X1, 12, 7, 18, 10, "dark")
    sides(it, X0, X1, 13, 8, 17, 9, "emit_a")
    sides(it, X0, X1, 9, 9, 11, 10, "dark")
    it.box(1, 16, 4, 3, 20, 6, "secondary")                                          # mag well
    it.box(1, 8, 11, 3, 19, 12, "dark")                                              # top rail
    it.box(1, 9, 12, 3, 13, 14, "secondary").box(1, 9, 12, 3, 10, 14, "glass").box(1, 12, 12, 3, 13, 14, "glass")
    it.box(X0, 20, 6, X1, 25, 10, "secondary")                                       # hand guard
    for y in (21, 23):
        sides(it, X0, X1, y, 7, y + 1, 9, "dark")
    it.box(1, 20, 10, 3, 25, 11, "dark").box(1, 24, 10, 3, 25, 11, "emit_a")
    it.box(1, 25, 7, 3, 28, 9, "metal").box(X0, 27, 6, X1, 29, 10, "secondary").box(1, 28, 7, 3, 29, 9, "dark")
    b = it.part("bolt", (4.5, 15, 9.5))
    it.box(4, 14, 9, 5, 16, 10, "metal")
    b.key("fire", 0).key("fire", 1, (0, -2, 0)).key("fire", 3)
    m = it.part("mag", (2, 17.5, 2))
    it.box(1, 16, 0, 3, 19, 4, "dark").box(1, 16, 1, 3, 19, 2, "trim")
    m.key("reload", 0).key("reload", 5, (0, -1, -7)).key("reload", 14, (0, -1, -7)).key("reload", 20)
    it.main()
    it.socket("grip", (2, 9.5, 3)).socket("support", (2, 20, 8)).socket("muzzle", (2, 29, 8))
    it.socket("stock", (2, 0, 8), (0, -1, 0)).socket("sight", (2, 11, 13)).socket("eye", (2, 5, 13))
    return meta(it, label="COMPACT CARBINE", sub="VERSATILE", refs=["wt.compact-carbine", "oa.reload"],
                profile="RIFLE", holster="back", two_handed=True, replaces="carbine",
                fx={"fire": "muzzle-flash", "projectile": "tracer", "impact": "impact-spark"})


def rifle():
    it = Item("rifle", "Rifle", "ballistic", "rifle")
    X0, X1 = long_gun(it, 29, 9, 7, 19)
    it.box(X0, 3, 8, X1, 7, 9, "trim")
    sides(it, X0, X1, 3, 9, 7, 10, "dark")
    it.box(X0, 7, 6, X1, 8, 11, "accent")
    sides(it, X0, X1, 13, 7, 18, 9, "dark").box(X0, 14, 7, X0 + 1, 16, 8, "emit_a").box(X1 - 1, 14, 7, X1, 16, 8, "emit_a")
    sides(it, X0, X1, 10, 9, 13, 10, "dark")
    it.box(1, 17, 4, 3, 21, 6, "secondary")                                          # mag well
    it.box(1, 8, 11, 3, 18, 12, "dark")                                              # top rail
    it.box(1, 9, 12, 3, 16, 14, "secondary").box(1, 9, 12, 3, 10, 14, "glass").box(1, 15, 12, 3, 16, 14, "glass")
    it.box(1, 11, 14, 3, 13, 15, "dark").box(0, 11, 12, 1, 12, 13, "metal")
    it.box(X0, 19, 6, X1, 25, 10, "dark").box(1, 19, 10, 3, 25, 11, "secondary")     # hand guard
    for y in (20, 22):
        sides(it, X0, X1, y, 7, y + 1, 9, "secondary")
    it.box(1, 25, 7, 3, 28, 9, "metal").box(X0, 27, 6, X1, 29, 10, "secondary").box(1, 28, 7, 3, 29, 9, "dark")
    b = it.part("bolt", (4.5, 15, 9.5))
    it.box(4, 14, 9, 5, 16, 10, "metal")
    b.key("fire", 0).key("fire", 1, (0, -2, 0)).key("fire", 3)
    m = it.part("mag", (2, 18.5, 2))
    it.box(1, 17, 1, 3, 20, 4, "dark").box(1, 16, -1, 3, 19, 1, "dark").box(1, 17, 2, 3, 20, 3, "trim")
    m.key("reload", 0).key("reload", 5, (0, -1, -7)).key("reload", 14, (0, -1, -7)).key("reload", 20)
    it.main()
    it.socket("grip", (2, 10.5, 3)).socket("support", (2, 21.5, 8)).socket("muzzle", (2, 29, 8))
    it.socket("stock", (2, 0, 8), (0, -1, 0)).socket("sight", (2, 15.5, 13)).socket("eye", (2, 7, 13))
    return meta(it, label="RIFLE", sub="STANDARD ISSUE", refs=["lo.rifle", "role.security-rifle", "an.shoot", "an.equipped"],
                profile="RIFLE", holster="back", two_handed=True,
                fx={"fire": "muzzle-flash", "projectile": "tracer", "impact": "impact-spark"})


def shotgun():
    it = Item("shotgun", "Shotgun", "ballistic", "rifle")
    X0, X1 = 0, 4
    it.box(X0, 0, 4, X1, 1, 11, "dark").box(X0, 1, 5, X1, 6, 11, "accent").box(1, 1, 4, 3, 6, 5, "accent")
    sides(it, X0, X1, 2, 6, 5, 9, "secondary")
    pistol_grip(it, 1, 3, 7, 6)
    trigger(it, 1, 3, 7, 6)
    it.box(X0, 6, 6, X1, 16, 12, "primary")                                         # receiver
    sides(it, X0, X1, 8, 7, 14, 11, "dark")
    sides(it, X0, X1, 11, 8, 12, 10, "emit_b").box(X0, 9, 8, X0 + 1, 12, 9, "emit_b").box(X1 - 1, 9, 8, X1, 12, 9, "emit_b")
    it.box(X0, 6, 6, X1, 7, 12, "secondary").box(1, 7, 12, 3, 15, 13, "dark")
    it.box(X0, 16, 8, X1, 28, 12, "primary").box(X0, 16, 11, X1, 28, 12, "accent")    # barrel shroud
    sides(it, X0, X1, 18, 9, 26, 10, "secondary")
    it.box(1, 16, 6, 3, 28, 8, "metal").cut(1, 16, 6, 3, 22, 8)                     # tube magazine
    it.box(X0, 27, 5, X1, 29, 12, "accent").box(1, 28, 9, 3, 29, 11, "dark").box(1, 28, 6, 3, 29, 7, "dark")
    it.box(1, 12, 13, 3, 13, 14, "dark").box(1, 26, 12, 3, 27, 13, "dark")
    p = it.part("pump", (2, 19, 5))
    it.box(X0, 16, 4, X1, 22, 8, "accent")
    for y in (17, 19, 21):
        sides(it, X0, X1, y, 4, y + 1, 7, "dark")
    p.key("fire", 0).key("fire", 3).key("fire", 6, (0, -3, 0)).key("fire", 10)
    p.key("reload", 0).key("reload", 4, (0, -3, 0)).key("reload", 8).key("reload", 12, (0, -3, 0)).key("reload", 16)
    it.main()
    it.socket("grip", (2, 8.5, 3)).socket("support", (2, 19, 5.5)).socket("muzzle", (2, 29, 10))
    it.socket("stock", (2, 0, 7.5), (0, -1, 0)).socket("sight", (2, 26.5, 13.5)).socket("eye", (2, 5, 13.5))
    return meta(it, label="SHOTGUN", sub="CLOSE RANGE", refs=["wt.shotgun", "lo.shotgun"], profile="RIFLE",
                holster="back", two_handed=True,
                fx={"fire": "muzzle-flash", "projectile": "tracer", "impact": "impact-spark", "after": "smoke-puff"})


def heavy_gun():
    it = Item("heavy-gun", "Heavy gun", "ballistic", "rifle", theme="orion")
    X0, X1 = 0, 6
    it.box(X0, 0, 6, X1, 4, 13, "secondary").box(X0, 0, 7, X1, 1, 12, "dark")
    pistol_grip(it, 2, 4, 6, 6)
    trigger(it, 2, 4, 6, 6)
    it.box(X0, 4, 6, X1, 18, 14, "primary")
    it.box(X0, 4, 13, X1, 10, 14, "accent").box(X0, 4, 6, X1, 5, 14, "accent")
    sides(it, X0, X1, 11, 8, 17, 12, "trim")
    sides(it, X0, X1, 12, 9, 13, 11, "emit_b").box(X0, 15, 9, X0 + 1, 16, 11, "emit_b").box(X1 - 1, 15, 9, X1, 16, 11, "emit_b")
    sides(it, X0, X1, 6, 8, 10, 12, "dark")
    it.box(2, 6, 14, 4, 7, 16, "secondary").box(2, 6, 16, 4, 16, 17, "secondary").box(2, 15, 14, 4, 16, 16, "secondary")
    it.box(X0, 18, 5, X1, 20, 15, "secondary")
    it.box(2, 18, 1, 4, 21, 5, "grip").box(2, 18, 1, 4, 21, 2, "dark")
    g = it.part("barrels", (3, 23, 10))
    it.disc("y", 3, 10, 3, 20, 29, "metal")
    it.box(2, 20, 9, 4, 30, 11, "dark").box(2, 29, 9, 4, 30, 11, "emit_b")
    it.box(1, 26, 7, 5, 27, 13, "secondary")
    g.key("fire", 0).key("fire", 4, rot=(0, 90, 0)).key("fire", 8, rot=(0, 180, 0))
    m = it.part("mag", (3, 16, 3))
    it.box(1, 14, 0, 5, 18, 6, "secondary").box(1, 14, 4, 5, 18, 5, "trim").box(2, 15, 1, 4, 17, 2, "dark")
    m.key("reload", 0).key("reload", 6, (0, 0, -8)).key("reload", 16, (0, 0, -8)).key("reload", 24)
    it.main()
    it.socket("grip", (3, 8, 3)).socket("support", (3, 19.5, 3)).socket("muzzle", (3, 30, 10))
    it.socket("stock", (3, 0, 9.5), (0, -1, 0)).socket("sight", (3, 11, 17.5)).socket("eye", (3, 4, 17))
    return meta(it, label="HEAVY GUN", sub="SUPPRESSION", refs=["lo.heavy-gun", "role.heavy-marine-gun"],
                profile="RIFLE", holster="back", two_handed=True,
                fx={"fire": "muzzle-flash", "projectile": "tracer", "impact": "impact-spark", "after": "smoke-puff"},
                notes="Hip-carried heavy stance: r003 HEAVY_WEAPON profile is not on main; RIFLE used until ported.")


# ============================================================================ ENERGY
def beam_rifle():
    it = Item("beam-rifle", "Beam rifle", "energy", "rifle")
    X0, X1 = 0, 4
    it.box(X0, 0, 5, X1, 5, 11, "primary").box(X0, 0, 5, X1, 1, 11, "dark")
    sides(it, X0, X1, 1, 6, 4, 8, "emit_a")
    pistol_grip(it, 1, 3, 6, 6)
    trigger(it, 1, 3, 6, 6)
    it.box(X0, 4, 5, X1, 18, 11, "secondary").box(X0, 5, 10, X1, 18, 11, "primary")
    it.box(X0, 4, 5, X1, 5, 11, "accent")
    sides(it, X0, X1, 11, 6, 17, 9, "dark")
    sides(it, X0, X1, 12, 7, 16, 8, "emit_a")
    it.box(X0, 5, 5, X1, 17, 6, "emit_a")
    it.box(1, 7, 11, 3, 10, 12, "dark").box(1, 15, 11, 3, 16, 12, "dark").box(1, 8, 12, 3, 9, 13, "emit_a")
    it.box(1, 18, 6, 3, 27, 10, "secondary")
    for y in (19, 21, 23):
        it.box(X0, y, 5, X1, y + 1, 11, "emit_a")
    it.box(X0, 25, 5, X1, 27, 11, "accent").box(1, 26, 7, 3, 27, 9, "emit_a")
    c = it.part("cell", (4.5, 11.5, 8.5))
    it.box(4, 9, 7, 5, 14, 10, "metal").box(4, 10, 8, 5, 13, 9, "emit_a")
    c.key("reload", 0).key("reload", 5, (3, 0, 3)).key("reload", 14, (3, 0, 3)).key("reload", 20)
    it.main()
    it.socket("grip", (2, 7.5, 3)).socket("support", (2, 18, 8)).socket("muzzle", (2, 27, 8))
    it.socket("stock", (2, 0, 8), (0, -1, 0)).socket("sight", (2, 8.5, 13)).socket("eye", (2, 3, 13))
    return meta(it, label="BEAM RIFLE", sub="ENERGY", refs=["wt.beam-rifle", "role.recon-scout-rifle"], profile="RIFLE",
                holster="back", two_handed=True,
                fx={"fire": "muzzle-flash", "projectile": "beam-lance", "impact": "impact-spark"})


def rail_rifle():
    it = Item("rail-rifle", "Rail rifle", "energy", "rifle")
    X0, X1 = long_gun(it, 30, 9, 7, 17, receiver="primary", shell="secondary")
    it.box(X0, 2, 8, X1, 7, 11, "secondary").box(X0, 0, 4, X1, 2, 11, "dark")
    it.box(X0, 9, 10, X1, 13, 11, "accent")
    sides(it, X0, X1, 13, 7, 16, 9, "dark")
    it.box(X0, 7, 6, X1, 8, 11, "secondary")
    it.box(X0, 17, 9, X1, 28, 11, "secondary").box(X0, 17, 5, X1, 28, 7, "secondary").box(1, 17, 7, 3, 28, 9, "dark")
    for y in (19, 22):
        it.box(1, y, 7, 3, y + 1, 9, "emit_a")
    it.box(X0, 25, 4, X1, 26, 12, "emit_a")
    it.box(X0, 28, 5, X1, 30, 11, "secondary").box(1, 29, 7, 3, 30, 9, "emit_a")
    it.box(1, 9, 11, 3, 16, 13, "dark").box(1, 9, 11, 3, 10, 13, "glass").box(1, 15, 11, 3, 16, 13, "glass")
    it.box(1, 11, 13, 3, 13, 14, "secondary")
    m = it.part("mag", (2, 18, 3))
    it.box(1, 17, 1, 3, 19, 5, "dark").box(1, 17, 2, 3, 19, 3, "emit_a")
    m.key("reload", 0).key("reload", 5, (0, 0, -6)).key("reload", 14, (0, 0, -6)).key("reload", 20)
    it.main()
    it.socket("grip", (2, 10.5, 3)).socket("support", (2, 20.5, 8)).socket("muzzle", (2, 30, 8))
    it.socket("stock", (2, 0, 7.5), (0, -1, 0)).socket("sight", (2, 15.5, 12)).socket("eye", (2, 7, 12))
    return meta(it, label="RAIL RIFLE", sub="HIGH IMPACT", refs=["wt.rail-rifle"], profile="LONG_RIFLE",
                holster="back", two_handed=True, replaces="long-rifle",
                fx={"fire": "muzzle-flash", "projectile": "plasma-bolt", "impact": "impact-spark"})


def stun_gun():
    it = Item("stun-gun", "Stun gun", "energy", "pistol", overrides={"emit_a": ((0.12, 1.0, 0.25), 9.0)})
    X0, X1 = 0, 4
    pistol_grip(it, 1, 3, 2, 6)
    trigger(it, 1, 3, 2, 6)
    it.box(X0, 0, 6, X1, 11, 11, "primary").box(X0, 0, 6, X1, 1, 11, "secondary")
    sides(it, X0, X1, 2, 7, 8, 10, "dark")
    sides(it, X0, X1, 3, 8, 4, 9, "emit_a").box(X0, 5, 8, X0 + 1, 7, 9, "accent").box(X1 - 1, 5, 8, X1, 7, 9, "accent")
    it.box(1, 2, 11, 3, 3, 12, "emit_a").box(1, 5, 11, 3, 6, 12, "emit_a").box(1, 8, 11, 3, 9, 12, "dark")
    it.box(-1, 11, 5, 5, 13, 12, "dark").box(0, 12, 6, 4, 13, 11, "emit_a")
    it.main()
    it.socket("grip", (2, 3.5, 3)).socket("muzzle", (2, 13, 8.5)).socket("support", (2, 2, 1.5))
    return meta(it, label="STUN GUN", sub="NON-LETHAL", refs=["lo.stun-gun"], profile="PISTOL_ONE_HAND", holster="hip.L",
                fx={"fire": "muzzle-flash", "projectile": "stun-arc", "impact": "impact-spark"})


def baton():
    it = Item("baton", "Baton", "energy", "melee")
    it.box(-1, 0, -1, 3, 2, 3, "primary").box(-1, 1, -1, 3, 2, 3, "metal")
    it.box(0, 2, 0, 2, 8, 2, "grip").box(0, 3, 0, 2, 4, 2, "dark").box(0, 5, 0, 2, 6, 2, "dark")
    it.box(-1, 8, -1, 3, 9, 3, "accent").box(-1, 9, -1, 3, 10, 3, "secondary")
    b = it.part("blade", (1, 10, 1))
    it.box(0, 10, 0, 2, 20, 2, "emit_a").box(-1, 10, 0, 3, 11, 2, "secondary").box(0, 20, 0, 2, 21, 2, "primary")
    b.key("deploy", 0, (0, -10, 0)).key("deploy", 4, (0, 1, 0)).key("deploy", 6)
    it.main()
    it.socket("grip", (1, 5, 1)).socket("emitter", (1, 21, 1))
    return meta(it, label="BATON", sub="NON-LETHAL", refs=["wt.baton", "oa.melee", "an.melee"], profile=None,
                holster="hip.L", fx={"hit": "stun-arc", "impact": "impact-spark"})


def grenade():
    it = Item("grenade", "Grenade", "ballistic", "throw")
    it.box(0, 0, 0, 4, 4, 4, "secondary")
    for x in (0, 3):
        for y in (0, 3):
            for z in (0, 3):
                it.box(x, y, z, x + 1, y + 1, z + 1, "trim")
    it.box(0, 1, 1, 4, 3, 3, "dark").box(1, 0, 1, 3, 4, 3, "dark")
    it.box(0, 1, 2, 4, 2, 3, "emit_b").box(1, 0, 1, 2, 4, 2, "emit_b")
    p = it.part("pin", (2, 2, 4))
    it.box(1, 1, 4, 3, 3, 5, "metal").box(3, 1, 4, 4, 3, 6, "accent")
    p.key("use", 0).key("use", 3, (0, 0, 3)).key("use", 6, (2, 0, 6))
    it.main()
    it.socket("grip", (2, 2, 2))
    return meta(it, label="GRENADE", sub="THROWN", refs=["oa.throw"], profile=None, holster="belt",
                fx={"impact": "impact-spark", "after": "smoke-puff"})


# ============================================================================ MEDICAL
def medgun():
    it = Item("medgun", "Medgun", "medical", "pistol", theme="medic")
    X0, X1 = 0, 4
    pistol_grip(it, 1, 3, 4, 6, back="secondary")
    trigger(it, 1, 3, 4, 6)
    it.box(X0, 0, 6, X1, 11, 15, "primary").box(X0, 0, 6, X1, 1, 15, "secondary")
    it.box(X0, 1, 6, X1, 10, 7, "secondary")
    sides(it, X0, X1, 4, 8, 6, 14, "accent")
    sides(it, X0, X1, 2, 10, 8, 12, "accent")
    it.box(1, 1, 14, 3, 2, 15, "emit_a")
    it.box(1, 11, 8, 3, 13, 13, "secondary").box(X0, 13, 8, X1, 14, 13, "dark").box(1, 13, 9, 3, 14, 12, "emit_b")
    c = it.part("canister", (2, 5.5, 16))
    it.box(1, 3, 15, 3, 4, 17, "secondary").box(1, 4, 15, 3, 7, 17, "emit_a").box(1, 7, 15, 3, 8, 17, "secondary")
    c.key("fire", 0).key("fire", 6, rot=(0, 20, 0)).key("fire", 12)
    it.main()
    it.socket("grip", (2, 5.5, 3)).socket("muzzle", (2, 14, 10.5)).socket("support", (2, 4, 1.5))
    return meta(it, label="MEDGUN", sub="HEALING", refs=["wt.medgun"], profile="PISTOL_ONE_HAND", holster="hip.R",
                fx={"fire": "healing-beam", "projectile": "healing-beam", "impact": "pickup-glow"})


def medkit():
    it = Item("medkit", "Med kit", "medical", "carry", theme="medic")
    it.box(0, 0, 0, 10, 4, 8, "primary").box(0, 0, 0, 10, 4, 1, "secondary").box(0, 0, 7, 10, 4, 8, "secondary")
    for y0 in (0, 3):
        it.box(2, y0, 1, 8, y0 + 1, 7, "accent").box(4, y0, 2, 6, y0 + 1, 6, "primary").box(3, y0, 3, 7, y0 + 1, 5, "primary")
    it.box(-1, 1, 2, 0, 3, 6, "dark").box(10, 1, 2, 11, 3, 6, "dark")
    it.box(3, 1, 8, 4, 3, 10, "accent").box(6, 1, 8, 7, 3, 10, "accent").box(3, 1, 10, 7, 3, 11, "accent")
    it.socket("grip", (5, 2, 10.5)).socket("emitter", (5, 4, 4))
    return meta(it, label="MED KIT", sub="FIRST AID", refs=["lo.med-kit", "th.medkit", "role.medic-kit-scanner"],
                profile=None, holster="belt.back", fx={"use": "healing-beam", "impact": "pickup-glow"},
                replaces="medkit")


# ============================================================================ TOOLS
def utility_cutter():
    it = Item("utility-cutter", "Utility cutter", "tool", "melee", theme="engineer")
    it.box(0, 0, 0, 4, 3, 4, "trim").box(0, 0, 0, 4, 1, 4, "emit_b").box(1, 0, 1, 3, 1, 3, "trim").box(1, -1, 1, 3, 0, 3, "emit_a")
    it.box(0, 3, 0, 4, 12, 4, "primary")
    it.box(0, 5, 0, 4, 10, 4, "grip")
    for y in (6, 8):
        it.box(0, y, 0, 4, y + 1, 4, "dark")
    it.box(0, 4, 3, 4, 5, 4, "dark").box(0, 10, 3, 4, 11, 4, "dark")
    it.box(-1, 11, -1, 5, 13, 5, "secondary").box(1, 12, 5, 3, 13, 6, "dark")
    b = it.part("blade", (2, 13, 2))
    it.box(1, 13, -1, 3, 15, 5, "metal").box(1, 15, 0, 3, 17, 5, "metal").box(1, 17, 1, 3, 19, 5, "metal")
    it.box(1, 19, 2, 3, 20, 5, "metal").box(1, 20, 3, 3, 21, 5, "metal").box(1, 13, 4, 3, 20, 5, "primary")
    b.key("use", 0).key("use", 2, (0, 1, 0)).key("use", 4).key("use", 6, (0, 1, 0)).key("use", 8)
    it.main()
    it.socket("grip", (2, 7.5, 2)).socket("emitter", (2, 21, 3.5))
    return meta(it, label="UTILITY CUTTER", sub="MELEE • UTILITY", refs=["wt.utility-cutter"], profile="TOOL",
                holster="hip.L", fx={"use": "repair-sparks", "impact": "impact-spark"}, replaces="plasma-cutter")


def repair_tool():
    it = Item("repair-tool", "Repair tool", "tool", "tool", theme="engineer")
    X0, X1 = 0, 4
    pistol_grip(it, 1, 3, 2, 7, slot="secondary", back="primary", base="primary")
    it.box(1, 1, 0, 3, 5, 2, "primary")
    it.box(1, 4, 3, 3, 5, 5, "emit_a")
    trigger(it, 1, 3, 2, 7)
    it.box(X0, 0, 7, X1, 11, 13, "secondary")
    it.box(X0, 5, 7, X1, 10, 13, "primary").box(X0, 7, 7, X1, 8, 13, "accent")
    sides(it, X0, X1, 1, 8, 5, 12, "secondary").box(X0, 2, 9, X0 + 1, 4, 11, "emit_a").box(X1 - 1, 2, 9, X1, 4, 11, "emit_a")
    it.box(1, 1, 13, 3, 9, 14, "primary").box(1, 2, 13, 3, 3, 14, "dark").box(1, 6, 13, 3, 7, 14, "emit_a")
    it.box(1, 11, 8, 3, 13, 12, "metal")
    e = it.part("emitter", (2, 14.5, 10))
    it.box(X0, 13, 8, X1, 16, 12, "emit_a").box(1, 13, 9, 3, 14, 11, "glass")
    e.key("use", 0).key("use", 6, rot=(0, 90, 0)).key("use", 12, rot=(0, 180, 0))
    it.main()
    it.socket("grip", (2, 3.5, 4)).socket("emitter", (2, 16, 10)).socket("support", (2, 2, 1.5))
    return meta(it, label="REPAIR TOOL", sub="ENGINEERING", refs=["wt.repair-tool", "th.repair-tool", "an.use-repair"],
                profile="TOOL", holster="hip.R", fx={"use": "repair-sparks", "beam": "healing-beam"})


def welder():
    it = Item("welder", "Welder", "tool", "tool", theme="engineer")
    X0, X1 = 0, 4
    pistol_grip(it, 1, 3, 2, 7, slot="grip", back="primary", base="primary")
    trigger(it, 1, 3, 2, 7)
    it.box(X0, 0, 7, X1, 8, 12, "secondary")
    for y in (1, 4, 7):
        it.box(X0, y, 7, X1, y + 1, 12, "primary")
    it.box(1, 1, 12, 3, 7, 14, "primary").box(1, 2, 14, 3, 6, 15, "metal").box(1, 6, 12, 3, 7, 14, "dark")
    it.box(1, 8, 8, 3, 14, 11, "metal").box(X0, 9, 7, X1, 10, 12, "primary").box(X0, 11, 7, X1, 12, 12, "primary")
    it.box(1, 14, 8, 3, 15, 11, "dark").box(1, 15, 9, 3, 16, 10, "emit_b")
    it.socket("grip", (2, 3.5, 4.5)).socket("emitter", (2, 16, 9.5)).socket("support", (2, 2, 1.5))
    return meta(it, label="WELDER", sub="FABRICATION", refs=["lo.welder", "th.welder", "role.mechanic-welder"],
                profile="TOOL", holster="hip.R", fx={"use": "repair-sparks", "glow": "muzzle-flash"})


def multi_tool():
    it = Item("multi-tool", "Multi-tool", "tool", "tool", theme="security")
    X0, X1 = 0, 4
    pistol_grip(it, 1, 3, 2, 6, slot="trim", back="metal", base="dark")
    trigger(it, 1, 3, 2, 6)
    it.box(X0, 0, 6, X1, 11, 12, "accent")
    sides(it, X0, X1, 2, 8, 9, 11, "dark")
    sides(it, X0, X1, 3, 9, 8, 10, "emit_a")
    it.box(1, 1, 12, 3, 9, 13, "emit_a").box(1, 0, 12, 3, 1, 13, "dark").box(X0, 0, 6, X1, 1, 12, "secondary")
    it.box(4, 5, 8, 5, 7, 10, "metal")
    h = it.part("head", (2, 12, 9))
    it.box(1, 11, 8, 3, 13, 11, "metal").box(1, 13, 8, 2, 15, 9, "metal").box(2, 13, 10, 3, 15, 11, "metal")
    it.box(1, 13, 9, 3, 14, 10, "emit_a")
    h.key("use", 0).key("use", 4, rot=(0, 120, 0)).key("use", 8, rot=(0, 240, 0)).key("use", 12, rot=(0, 360, 0))
    it.main()
    it.socket("grip", (2, 3.5, 3)).socket("emitter", (2, 15, 9.5)).socket("support", (2, 2, 1.5))
    return meta(it, label="MULTI-TOOL", sub="UTILITY", refs=["lo.multi-tool"], profile="TOOL", holster="hip.R",
                fx={"use": "repair-sparks"})


def mining_drill():
    it = Item("mining-drill", "Mining drill", "tool", "tool", theme="salvage")
    X0, X1 = 0, 6
    it.box(X0, 0, 4, X1, 1, 13, "grip").box(X0, 1, 4, X1, 12, 12, "primary")
    for y in (2, 4, 6):
        sides(it, X0, X1, y, 5, y + 1, 11, "dark")
    sides(it, X0, X1, 8, 6, 11, 9, "emit_b").box(X0, 1, 11, X1, 12, 12, "accent")
    pistol_grip(it, 2, 4, 3, 4, slot="grip", back="secondary", base="dark")
    it.box(2, 3, 12, 4, 4, 14, "secondary").box(2, 3, 14, 4, 10, 15, "grip").box(2, 9, 12, 4, 10, 14, "secondary")
    it.box(1, 12, 5, 5, 14, 11, "metal").box(0, 12, 6, 6, 13, 10, "secondary")
    b = it.part("bit", (3, 14, 8))
    it.box(1, 14, 5, 5, 16, 11, "trim").box(1, 14, 6, 5, 15, 10, "dark")
    it.box(2, 16, 6, 4, 19, 10, "metal").box(2, 17, 6, 4, 18, 7, "trim").box(2, 18, 9, 4, 19, 10, "trim")
    it.box(2, 19, 7, 4, 22, 9, "metal").box(2, 20, 7, 3, 21, 8, "trim").box(2, 22, 7, 4, 23, 9, "emit_b")
    b.key("use", 0).key("use", 3, rot=(0, 120, 0)).key("use", 6, rot=(0, 240, 0)).key("use", 9, rot=(0, 360, 0))
    it.main()
    it.socket("grip", (3, 4.5, 1)).socket("support", (3, 6.5, 14.5)).socket("emitter", (3, 23, 8))
    it.socket("stock", (3, 0, 8.5), (0, -1, 0)).socket("sight", (3, 8, 13)).socket("eye", (3, 2, 15))
    return meta(it, label="MINING DRILL", sub="EXTRACTION", refs=["th.mining-drill"], profile="RIFLE",
                holster="back.tool", two_handed=True, fx={"use": "repair-sparks", "after": "smoke-puff"},
                notes="Two-handed hip tool; drives the RIFLE aim profile until a heavy-tool profile lands on main.")


def wrench():
    it = Item("wrench", "Wrench", "tool", "melee", theme="orion")
    it.box(0, 0, 0, 2, 13, 3, "primary").box(0, 0, 0, 2, 2, 3, "trim").box(0, 0, 1, 2, 1, 2, "emit_b")
    it.box(0, 4, 0, 2, 5, 3, "trim").box(0, 8, 0, 2, 9, 3, "secondary").box(0, 5, 1, 2, 8, 2, "dark")
    it.box(0, 12, -3, 2, 21, 6, "metal").cut(0, 14, -1, 2, 19, 4).cut(0, 19, 0, 2, 21, 3)
    it.box(0, 13, 3, 2, 14, 4, "emit_a").box(0, 13, -1, 2, 14, 0, "emit_a")
    it.socket("grip", (1, 3.5, 1.5)).socket("emitter", (1, 20, 1.5))
    return meta(it, label="WRENCH", sub="MAINTENANCE", refs=["lo.wrench", "role.engineer-wrench"], profile="TOOL",
                holster="hip.L", fx={"use": "repair-sparks", "impact": "impact-spark"})


# ============================================================================ UTILITY / DEVICES
def scanner():
    it = Item("scanner", "Scanner", "utility", "device", overrides={"emit_a": ((0.2, 1.0, 0.3), 8.0)})
    it.box(1, 2, 0, 4, 4, 6, "grip").box(1, 2, 0, 4, 4, 2, "accent").box(1, 1, 1, 4, 2, 5, "dark")
    it.box(0, 0, 6, 5, 6, 12, "primary").box(0, 0, 6, 5, 6, 7, "secondary")
    it.box(1, 0, 7, 4, 1, 11, "dark").box(2, 0, 7, 3, 1, 10, "emit_a").box(1, 0, 8, 4, 1, 9, "emit_a")
    it.box(0, 1, 10, 1, 3, 11, "emit_a")
    it.box(1, 6, 7, 4, 7, 11, "secondary").box(2, 6, 8, 3, 7, 10, "emit_a")
    it.box(4, 3, 12, 5, 4, 14, "metal")
    it.socket("grip", (2.5, 3, 3)).socket("emitter", (2.5, 7, 9)).socket("display", (2.5, 0, 9), (0, -1, 0))
    return meta(it, label="SCANNER", sub="INTEL", refs=["wt.scanner"], profile="HANDHELD_DEVICE", holster="belt",
                fx={"use": "scan-pulse"}, replaces="sample-scanner")


def sample_scanner():
    it = Item("sample-scanner", "Sample scanner", "utility", "tool", theme="orion")
    it.box(0, 1, 0, 2, 4, 6, "primary").box(0, 1, 0, 2, 4, 1, "dark").box(0, 3, 2, 2, 4, 5, "secondary")
    it.box(-1, 0, 6, 3, 7, 11, "secondary").box(-1, 2, 7, 3, 6, 10, "glass").box(0, 3, 7, 2, 5, 10, "emit_a")
    it.box(0, 1, 11, 2, 6, 12, "dark").box(0, 2, 11, 2, 5, 12, "emit_a")
    it.box(0, 7, 7, 2, 10, 10, "primary").box(0, 10, 7, 1, 12, 8, "metal").box(1, 10, 9, 2, 12, 10, "metal")
    it.box(0, 10, 8, 2, 11, 9, "emit_a")
    it.box(0, 4, 4, 2, 7, 5, "secondary").box(0, 4, 5, 2, 5, 6, "metal")
    it.socket("grip", (1, 2.5, 3.5)).socket("emitter", (1, 12, 8.5)).socket("support", (1, 1, 1))
    return meta(it, label="SAMPLE SCANNER", sub="SCIENCE", refs=["lo.sample-scanner", "role.medic-kit-scanner"],
                profile="TOOL", holster="belt", fx={"use": "scan-pulse", "beam": "healing-beam"})


def data_pad():
    it = Item("data-pad", "Data pad", "utility", "device", theme="orion")
    it.box(0, 0, 0, 10, 2, 7, "primary").box(0, 1, 0, 10, 2, 7, "secondary")
    it.box(1, 0, 1, 9, 1, 6, "emit_a")
    for x, z in ((2, 2), (3, 2), (2, 4), (5, 4), (6, 4), (6, 3), (7, 2), (4, 3)):
        it.box(x, 0, z, x + 1, 1, z + 1, "dark")
    it.box(10, 0, 2, 11, 2, 4, "accent").box(-1, 0, 4, 0, 2, 5, "dark")
    it.socket("grip", (10, 1, 3)).socket("support", (0, 1, 3)).socket("display", (5, 0, 3.5), (0, -1, 0))
    return meta(it, label="DATA PAD", sub="TABLET", refs=["lo.data-pad", "th.tablet", "role.captain-pad"],
                profile="HANDHELD_DEVICE", holster="belt.back", fx={"use": "scan-pulse"})


def shield_emitter():
    it = Item("shield-emitter", "Shield emitter", "utility", "device", theme="orion")
    it.box(2, 2, 0, 4, 4, 5, "grip").box(2, 2, 0, 4, 4, 1, "secondary")
    it.box(0, 0, 5, 6, 6, 11, "secondary")
    for x in (0, 5):
        for z in (5, 10):
            it.box(x, 0, z, x + 1, 6, z + 1, "primary")
    it.box(-1, 1, 6, 7, 5, 10, "primary").box(1, 1, 4, 5, 5, 12, "primary")
    it.box(-1, 2, 7, 0, 4, 9, "dark").box(6, 2, 7, 7, 4, 9, "dark")
    it.box(2, 2, 12, 4, 4, 13, "emit_a")
    r = it.part("ring", (3, 6.5, 8))
    it.box(1, 6, 6, 5, 7, 10, "emit_a").box(2, 6, 7, 4, 7, 9, "dark")
    r.key("use", 0).key("use", 6, rot=(0, 90, 0)).key("use", 12, rot=(0, 180, 0))
    it.main()
    it.socket("grip", (3, 3, 2.5)).socket("emitter", (3, 7, 8))
    return meta(it, label="SHIELD EMITTER", sub="DEFENSE", refs=["wt.shield-emitter"], profile="FLASHLIGHT",
                holster="belt", fx={"use": "shield-bubble"})


def flashlight():
    it = Item("flashlight", "Flashlight", "utility", "tool", theme="orion", overrides={"emit_b": ((1.0, 0.55, 0.12), 12.0)})
    it.box(0, 0, 0, 2, 7, 2, "secondary").box(0, 0, 0, 2, 1, 2, "dark")
    it.box(0, 2, 0, 2, 3, 2, "dark").box(0, 4, 0, 2, 5, 2, "dark").box(0, 5, 2, 1, 6, 3, "accent")
    it.box(-1, 7, -1, 3, 10, 3, "metal").box(0, 9, 0, 2, 10, 2, "emit_b").box(-1, 7, -1, 3, 8, 3, "secondary")
    it.socket("grip", (1, 3, 1)).socket("emitter", (1, 10, 1))
    return meta(it, label="FLASHLIGHT", sub="ILLUMINATION", refs=["lo.flashlight"], profile="FLASHLIGHT", holster="belt",
                fx={"use": "pickup-glow"})


def grapple():
    it = Item("grapple", "Grapple", "utility", "pistol", theme="orion")
    it.box(0, 1, 2, 2, 4, 6, "secondary").box(0, 0, 0, 2, 4, 2, "trim")
    it.box(-1, 0, 6, 3, 10, 10, "secondary").box(-1, 3, 7, 3, 8, 9, "dark").box(-1, 4, 7, 3, 7, 8, "emit_a")
    it.box(0, 1, 10, 2, 7, 11, "primary").box(-1, 0, 6, 3, 1, 10, "trim")
    it.box(0, 10, 7, 2, 12, 9, "metal").box(3, 2, 7, 4, 7, 9, "metal")
    it.box(0, 4, 4, 2, 7, 5, "secondary").box(0, 4, 5, 2, 5, 6, "metal")
    it.box(-1, 12, 6, 3, 14, 10, "trim")
    u = it.part("jaw.upper", (1, 14, 9))
    it.box(0, 14, 9, 2, 16, 10, "trim").box(0, 16, 8, 2, 17, 10, "trim").box(0, 16, 8, 2, 17, 9, "metal")
    lo = it.part("jaw.lower", (1, 14, 7))
    it.box(0, 14, 6, 2, 16, 7, "trim").box(0, 16, 6, 2, 17, 8, "trim").box(0, 16, 7, 2, 17, 8, "metal")
    for part, sign in ((u, -1), (lo, 1)):
        part.key("fire", 0).key("fire", 3, rot=(sign * 35, 0, 0)).key("fire", 10, rot=(sign * 35, 0, 0)).key("fire", 14)
    it.main()
    it.socket("grip", (1, 2.5, 4)).socket("muzzle", (1, 17, 8)).socket("support", (1, 1, 1))
    return meta(it, label="GRAPPLE", sub="TRAVERSAL", refs=["lo.grapple", "role.salvage-grapple"],
                profile="PISTOL_ONE_HAND", holster="hip.L", fx={"fire": "muzzle-flash", "projectile": "stun-arc"})


def drone():
    it = Item("drone", "Drone", "utility", "throw", theme="security", overrides={"emit_b": ((0.2, 1.0, 0.35), 7.0)})
    it.box(2, 2, 2, 6, 6, 6, "primary").box(3, 3, 6, 5, 5, 7, "primary").box(2, 2, 2, 6, 6, 3, "secondary")
    it.box(3, 6, 3, 5, 7, 5, "emit_a").box(3, 1, 3, 5, 2, 5, "dark")
    it.box(3, 3, 1, 5, 5, 2, "trim")
    for x0 in (0, 6):
        it.box(x0, 2, 1, x0 + 2, 6, 4, "trim").box(x0, 6, 2, x0 + 2, 7, 3, "emit_b").box(x0, 2, 1, x0 + 2, 3, 4, "secondary")
    for name, cx in (("rotor.L", 1), ("rotor.R", 7)):
        r = it.part(name, (cx, 4, 4.5))
        it.box(cx - 1, 3, 4, cx + 1, 5, 5, "metal").box(cx - 1, 1, 5, cx + 1, 7, 6, "dark")
        r.key("idle", 0).key("idle", 3, rot=(0, 0, 90)).key("idle", 6, rot=(0, 0, 180))
    it.main()
    it.socket("grip", (4, 4, 1.5)).socket("emitter", (4, 7, 4))
    return meta(it, label="DRONE", sub="COMPANION", refs=["lo.drone"], profile=None, holster="back",
                fx={"use": "thruster-glow", "idle": "thruster-glow", "arrive": "teleport"})


def cargo_box():
    it = Item("cargo-box", "Cargo box", "utility", "carry", theme="salvage")
    it.box(0, 0, 0, 16, 12, 12, "primary")
    for x0 in (0, 15):
        for y0 in (0, 11):
            it.box(x0, y0, 0, x0 + 1, y0 + 1, 12, "metal")
    for z0 in (0, 11):
        it.box(0, 0, z0, 16, 1, z0 + 1, "metal").box(0, 11, z0, 16, 12, z0 + 1, "metal")
        it.box(0, 0, z0, 1, 12, z0 + 1, "metal").box(15, 0, z0, 16, 12, z0 + 1, "metal")
    it.box(1, 5, 0, 15, 7, 12, "dark")
    it.box(5, 0, 4, 11, 1, 8, "accent").box(6, 0, 5, 10, 1, 7, "secondary")
    it.box(0, 4, 7, 1, 8, 9, "dark").box(15, 4, 7, 16, 8, 9, "dark")
    it.socket("grip", (16, 6, 8)).socket("support", (0, 6, 8))
    return meta(it, label="CARGO BOX", sub="HAULING", refs=["th.cargo-box", "oa.carry"], profile=None, holster="none",
                two_handed=True, support_mode="carry", fx={"pickup": "pickup-glow"})


def shield_pack():
    it = Item("shield-pack", "Shield pack", "utility", "worn", theme="orion")
    it.box(0, 0, 0, 10, 4, 14, "secondary").box(0, 3, 1, 10, 4, 13, "dark")
    it.box(1, 0, 1, 9, 1, 6, "emit_a").box(1, 0, 8, 9, 1, 13, "emit_a")
    for x, z in ((3, 2), (4, 2), (5, 3), (6, 4), (3, 4), (2, 10), (3, 10), (6, 9), (6, 11), (7, 11), (4, 11)):
        it.box(x, 0, z, x + 1, 1, z + 1, "secondary")
    it.box(-1, 1, 5, 0, 3, 9, "trim").box(10, 1, 5, 11, 3, 9, "trim").box(2, 1, 14, 8, 3, 15, "primary")
    it.socket("grip", (5, 4, 7), (0, -1, 0)).socket("emitter", (5, 0, 7), (0, -1, 0))
    return meta(it, label="SHIELD PACK", sub="LIFE SUPPORT", refs=["lo.shield-pack"], profile=None, holster="worn.back",
                fx={"use": "shield-bubble"},
                notes="Worn on socket.back: grip socket is the mounting face centre, -Y outward.")


ALL = [
    pistol, smg, compact_carbine, rifle, shotgun, heavy_gun, beam_rifle, rail_rifle, stun_gun, baton, grenade,
    medgun, medkit,
    utility_cutter, repair_tool, welder, multi_tool, mining_drill, wrench,
    scanner, sample_scanner, data_pad, shield_emitter, flashlight, grapple, drone, cargo_box, shield_pack,
]

# Exact order of the reference WEAPONS & TOOLS panel (2 x 6) for side-by-side comparison.
REFERENCE_PANEL = ["utility-cutter", "pistol", "smg", "compact-carbine", "shotgun", "beam-rifle",
                   "rail-rifle", "medgun", "repair-tool", "shield-emitter", "scanner", "baton"]


def build_all():
    return [f() for f in ALL]
