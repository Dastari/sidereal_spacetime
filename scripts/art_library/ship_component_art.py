"""Ship component art revision r002 builders (proposal art, not approved).

Addresses VERIFY review ships-components batch 1:
1. Turret silhouette stack as in reference/art/weapons-turrets.png and
   more-turrents-missiles-guns.png: hardpoint connector -> stepped bevelled
   plinth with inset lights -> rotation ring -> yoke -> housing -> real
   barrels / emitters (+ ammo drum / targeting module). Every weapon returns
   its parts separately for exploded views.
2. Reference palette ("orion"): lavender-grey body, charcoal-navy darks,
   crimson accent, saturated cyan/amber emissives kept below clipping.
3. Deterministic surface detail pass (panel seams, corner bolts, vents,
   indicator lights) and big multi-panel console screens with chairs.

All builders emit boxes on the 1/16 m brick grid in the kit's conventions:
top mounts x, y in [0, W] with barrels along +X; interior x in [0, w],
y in [0, d] with the access side +Y. Material slots stay the fixed nine.
"""
import math


def install(K):
    """Registers the r002 theme on the loaded kit module and returns helpers."""
    K.THEMES["orion"] = dict(
        # linear RGB; renders to roughly #ad93cd / #2f2551 / #d42d4f under the kit grade
        primary=(0.46, 0.28, 0.72), secondary=(0.034, 0.020, 0.115), accent=(0.66, 0.022, 0.075),
        trim=(0.060, 0.048, 0.25), metal=(0.56, 0.44, 0.74), dark=(0.010, 0.006, 0.026),
        emit_a=((0.03, 0.42, 1.0), 3.2), emit_b=((1.0, 0.36, 0.035), 3.0), glass=(0.25, 0.55, 1.0),
        wear=0.0, wear_col=(0.05, 0.04, 0.05), on_dark=(0.85, 0.82, 0.92), on_light=(0.06, 0.05, 0.12),
        name="ORION", number="OC-01", emblem="planet")
    K.THEMES["orion-worn"] = dict(K.THEMES["orion"], wear=0.45, wear_col=(0.09, 0.06, 0.05))
    return K


def H(K, *a):
    """Kit hash over strings/ints; other values (tuples, floats) hash by their repr."""
    return K.H(*[v if isinstance(v, (str, int)) else repr(v) for v in a])


# =============================================================================== surface detail
def greeble(K, p, seed, slots=("primary", "secondary", "accent", "trim"), min_face=6, lights=0.10, skip_top=False):
    """Adds panel plates with seams, corner bolts, vents and small lights to exposed box faces.

    Works on the boxes present when called. A face gets detail only when the region just outside
    it is free of other boxes, so nothing is buried. Deterministic by (seed, box index, face)."""
    boxes = list(p.boxes)

    def inside(x, y, z):
        for b in boxes:
            if b[0] < x < b[3] and b[1] < y < b[4] and b[2] < z < b[5]:
                return True
        return False

    faces = [(0, 1), (0, -1), (1, 1), (1, -1), (2, 1)]
    if skip_top:
        faces = faces[:4]
    for bi, (x0, y0, z0, x1, y1, z1, slot) in enumerate(boxes):
        if slot not in slots:
            continue
        lo, hi = (x0, y0, z0), (x1, y1, z1)
        for axis, sign in faces:
            u, v = [a for a in (0, 1, 2) if a != axis]
            du, dv = hi[u] - lo[u], hi[v] - lo[v]
            if du < min_face or dv < min_face:
                continue
            plane = hi[axis] if sign > 0 else lo[axis]
            probe = []
            for fu, fv in ((0.5, 0.5), (0.2, 0.2), (0.8, 0.2), (0.2, 0.8), (0.8, 0.8)):
                q = [0, 0, 0]
                q[axis] = plane + 0.5 * sign
                q[u] = lo[u] + fu * du
                q[v] = lo[v] + fv * dv
                probe.append(q)
            if any(inside(*q) for q in probe):
                continue
            h = H(K, seed, bi, axis, sign)

            def box(a0, a1, b0, b1, t0, t1, s):
                c0, c1 = [0, 0, 0], [0, 0, 0]
                c0[u], c1[u] = a0, a1
                c0[v], c1[v] = b0, b1
                if sign > 0:
                    c0[axis], c1[axis] = plane + t0, plane + t1
                else:
                    c0[axis], c1[axis] = plane - t1, plane - t0
                p.b(c0[0], c0[1], c0[2], c1[0], c1[1], c1[2], s)

            if h < 0.22 and dv >= 5 and du >= 6:
                # vent: trim frame with dark slats
                a0, a1 = lo[u] + 2, hi[u] - 2
                b0, b1 = lo[v] + max(1, dv // 4), lo[v] + max(4, dv // 2)
                box(a0, a1, b0, b1, 0, 1, "trim")
                for bb in range(b0 + 1, b1 - 1, 2):
                    box(a0 + 1, a1 - 1, bb, bb + 1, 1, 2, "dark")
                continue
            # panel plates split into cells of ~10 texels with 1-texel seams
            nu = max(1, round((du - 2) / 11))
            nv = max(1, round((dv - 2) / 11))
            cu = (du - 2) / nu
            cv = (dv - 2) / nv
            pslot = slot if H(K, seed, bi, axis, 7) < 0.7 else ("secondary" if slot == "primary" else "primary")
            for i in range(nu):
                for j in range(nv):
                    a0 = int(lo[u] + 1 + round(i * cu)) + (1 if i else 0)
                    a1 = int(lo[u] + 1 + round((i + 1) * cu))
                    b0 = int(lo[v] + 1 + round(j * cv)) + (1 if j else 0)
                    b1 = int(lo[v] + 1 + round((j + 1) * cv))
                    if a1 - a0 < 3 or b1 - b0 < 3:
                        continue
                    box(a0, a1, b0, b1, 0, 1, pslot)
                    if a1 - a0 >= 6 and b1 - b0 >= 5:
                        for aa, bb in ((a0 + 1, b0 + 1), (a1 - 2, b0 + 1), (a0 + 1, b1 - 2), (a1 - 2, b1 - 2)):
                            box(aa, aa + 1, bb, bb + 1, 1, 2, "metal")
            if H(K, seed, bi, axis, 11) < lights and du >= 8:
                s = "emit_a" if H(K, seed, bi, axis, 13) < 0.6 else "emit_b"
                box(hi[u] - 4, hi[u] - 2, lo[v] + 2, lo[v] + 3, 1, 2, s)
    return p


# =============================================================================== turret stack
def _octa(K, p, c, r, z0, z1, slot):
    K.extrude(p, "z", c, c, K.section_rows(r, max(1, r // 3)), z0, z1, slot)


def stack_base(K, sz, prefix):
    """Connector, stepped plinth, rotation ring and yoke. Returns (parts, top z, W, c, k)."""
    n = K.SIZE_CELLS[sz]
    W, c, k = 16 * n, 8 * n, n
    P = lambda name: K.Piece(f"{prefix}.{sz}.{name}", "mount-part", "top", (W, W, 0))
    con, pl, ring, yoke = P("connector"), P("plinth"), P("ring"), P("yoke")
    # hardpoint connector: navy plate with a lavender inset top, corner bolts, edge lights
    t = k + 1
    con.b(1, 1, 0, W - 1, W - 1, t - 1, "trim").b(2, 2, t - 1, W - 2, W - 2, t, "secondary")
    for x, y in ((0, 0), (W - 3, 0), (0, W - 3), (W - 3, W - 3)):
        con.b(x, y, 0, x + 3, y + 3, t + 1, "metal")
    for (x0, y0, x1, y1) in ((c - 2, 0, c + 2, 1), (c - 2, W - 1, c + 2, W), (0, c - 2, 1, c + 2), (W - 1, c - 2, W, c + 2)):
        con.b(x0, y0, 1, x1, y1, t - 1, "emit_a")
    z = t
    # plinth step 1: navy octagon, lavender cap, inset side lights in dark recesses
    r1 = int(W * 0.46)
    h1 = 2 * k + 1
    _octa(K, pl, c, r1, z, z + h1 - 1, "secondary")
    _octa(K, pl, c, r1, z + h1 - 1, z + h1, "primary")
    for (x0, y0, x1, y1) in ((c - 2 * k, c - r1 - 1, c + 2 * k, c - r1), (c - 2 * k, c + r1, c + 2 * k, c + r1 + 1),
                             (c - r1 - 1, c - 2 * k, c - r1, c + 2 * k), (c + r1, c - 2 * k, c + r1 + 1, c + 2 * k)):
        pl.b(x0, y0, z + 1, x1, y1, z + h1 - 2, "dark")
    for (x0, y0, x1, y1) in ((c - k, c - r1 - 1, c + k, c - r1), (c - k, c + r1, c + k, c + r1 + 1),
                             (c - r1 - 1, c - k, c - r1, c + k), (c + r1, c - k, c + r1 + 1, c + k)):
        pl.b(x0, y0, z + 2, x1, y1, z + h1 - 3 if h1 > 4 else z + 3, "emit_a")
    z += h1
    # plinth step 2: lavender octagon with navy vent band
    r2 = int(W * 0.37)
    h2 = 2 * k + 1
    _octa(K, pl, c, r2, z, z + h2, "primary")
    _octa(K, pl, c, r2 + 1, z + 1, z + 2, "trim")
    for x in range(c - r2 + 3, c + r2 - 3, 2):
        pl.b(x, c - r2 - 1, z + 2, x + 1, c - r2, z + h2 - 1, "dark")
    z += h2
    # rotation ring: dark ring with blue dots
    r3 = int(W * 0.30)
    hr = max(2, k + 1)
    ring.disc("z", c, c, r3, z, z + hr, "dark")
    ring.disc("z", c, c, r3 - 1, z + hr, z + hr + 1, "secondary")
    for a in range(8):
        ang = a * math.pi / 4 + math.pi / 8
        x, y = c + int(round(r3 * math.cos(ang))), c + int(round(r3 * math.sin(ang)))
        ring.b(x - 1, y - 1, z + 1, x, y, z + 2, "emit_a")
    z += hr + 1
    return [con, pl, ring, yoke], z, W, c, k


def yoke_cheeks(p, c, hy, z, gh, k, W):
    gt = max(2, k + 1)
    gx = max(2, int(W * 0.14))
    for y0, y1 in ((c - hy - gt, c - hy), (c + hy, c + hy + gt)):
        p.b(c - gx, y0, z, c + gx, y1, z + gh, "primary")
        p.b(c - gx + 1, y0 - (1 if y0 < c else 0), z + 1, c + gx - 1, y1 + (1 if y1 > c else 0), z + gh - 1, "secondary")
    p.b(c - 1, c - hy - gt - 1, z + gh // 2 - 1, c + 1, c + hy + gt + 1, z + gh // 2 + 1, "metal")


def housing_box(K, p, x0, x1, y0, y1, z0, z1, k):
    """Chunky housing: lavender body, chamfered navy top rim, navy side cheeks, crimson band."""
    ch = max(1, k)
    p.b(x0, y0, z0, x1, y1, z1 - ch, "primary")
    p.b(x0 + ch, y0 + ch, z1 - ch, x1 - ch, y1 - ch, z1, "primary")
    p.b(x0, y0 - 1, z0 + 1, x0 + (x1 - x0) // 3, y1 + 1, z1 - ch - 1, "secondary")
    return p


def barrel(p, x0, x1, y, z, bw, slot="metal"):
    p.b(x0, y - bw, z - bw, x1, y + bw, z + bw, slot)


def weapon(K, kind, sz):
    """Returns (ordered parts, part labels) for a turret weapon in kit top convention."""
    parts, z, W, c, k = stack_base(K, sz, f"w2.{kind}")
    yoke = parts[3]
    P = lambda name: K.Piece(f"w2.{kind}.{sz}.{name}", "mount-part", "top", (W, W, 0))
    hou, pay, ext = P("housing"), P("payload"), P("extras")
    labels = ["HARDPOINT CONNECTOR", "STEPPED PLINTH", "ROTATION RING", "YOKE / GIMBAL"]
    hy = int(W * 0.34)
    zh = z + 1
    gh = 2 * k + 3
    yoke_cheeks(yoke, c, hy, z, gh, k, W)
    if kind == "pd":
        hh = int(W * 0.40)
        x0, x1 = c - int(W * 0.30), c + int(W * 0.22)
        housing_box(K, hou, x0, x1, c - hy + 1, c + hy - 1, zh, zh + hh, k)
        bw = max(1, k // 2 + (1 if k > 1 else 0))
        zc = zh + hh // 2
        hou.b(x1, c - 3 * bw - 1, zc - 3 * bw - 1, x1 + 2 * k + 1, c + 3 * bw + 1, zc + 3 * bw + 1, "trim")  # shroud
        for dy in (-1, 1):
            for dz in (-1, 1):
                y, zz = c + dy * (bw + 1), zc + dz * (bw + 1)
                barrel(pay, x1 + 2 * k + 1, x1 + int(W * 0.55), y, zz, bw)
                pay.b(x1 + int(W * 0.52), y - bw, zz - bw, x1 + int(W * 0.58), y + bw, zz + bw, "trim")
        ext.b(x0 + 2, c + hy - 1, zh + hh - 4 * k, x0 + 2 + 2 * k + 2, c + hy + 1, zh + hh - 2, "emit_a")   # tracker lens
        labels += ["TURRET HEAD", "QUAD BARREL", "TRACKER"]
    elif kind == "autocannon":
        hh = int(W * 0.42)
        x0, x1 = c - int(W * 0.34), c + int(W * 0.24)
        housing_box(K, hou, x0, x1, c - hy + 1, c + hy - 1, zh, zh + hh, k)
        hou.b(x1 - 3 * k, c - hy, zh + 1, x1 - 2 * k, c + hy, zh + hh - k - 1, "accent")
        bw = max(1, k)
        zc = zh + hh // 2
        for y in (c - int(W * 0.13), c + int(W * 0.13)):
            pay.b(x1, y - bw - 1, zc - bw - 1, x1 + int(W * 0.28), y + bw + 1, zc + bw + 1, "secondary")   # recoil sleeve
            pay.b(x1 + 2, y - bw - 1, zc + bw + 1, x1 + int(W * 0.24), y + bw + 1, zc + bw + 2, "metal")
            barrel(pay, x1 + int(W * 0.28), x1 + int(W * 0.98), y, zc, bw)
            pay.b(x1 + int(W * 0.90), y - bw - 1, zc - bw - 1, x1 + int(W * 1.02), y + bw + 1, zc + bw + 1, "trim")  # muzzle brake
            pay.b(x1 + int(W * 0.94), y - bw - 1, zc - bw - 1, x1 + int(W * 0.96), y + bw + 1, zc + bw + 1, "dark")
        # ammo drum (-Y side) and targeting module on top
        rd = max(3, int(W * 0.16))
        ext.disc("y", c - int(W * 0.08), zh + rd, rd, c - hy - 2 * k - 1, c - hy + 1, "trim")
        ext.disc("y", c - int(W * 0.08), zh + rd, rd - 1, c - hy - 2 * k - 2, c - hy - 2 * k - 1, "accent")
        ext.b(c - int(W * 0.10), c - 2 * k, zh + hh, c + int(W * 0.08), c + 2 * k, zh + hh + 2 * k + 1, "secondary")
        ext.b(c + int(W * 0.08), c - k, zh + hh + 1, c + int(W * 0.08) + 1, c + k, zh + hh + 2 * k, "emit_a")
        labels += ["BARREL HOUSING", "TWIN BARRELS", "AMMO DRUM + TARGETING"]
    elif kind == "laser":
        hh = int(W * 0.40)
        x0, x1 = c - int(W * 0.30), c + int(W * 0.14)
        housing_box(K, hou, x0, x1, c - hy + 1, c + hy - 1, zh, zh + hh, k)
        hou.b(c - 2 * k, c - hy, zh, c, c + hy, zh + hh - k, "accent")
        er = max(2, int(W * 0.13))
        zc = zh + hh // 2
        L = int(W * 0.46)
        for i, xx in enumerate(range(x1, x1 + L, max(2, k + 1))):
            pay.disc("x", c, zc, er + (1 if i % 2 == 0 else 0), xx, xx + max(1, k), "metal" if i % 2 == 0 else "secondary")
        pay.disc("x", c, zc, er, x1, x1 + L, "secondary")
        lx = x1 + L
        ls = max(3, int(W * 0.16))
        pay.b(lx, c - ls, zc - ls, lx + 2 * k + 2, c + ls, zc + ls, "primary")        # lens housing
        pay.b(lx + 1, c - ls - 1, zc - ls - 1, lx + 2 * k + 1, c + ls + 1, zc - ls + 1, "accent")
        pay.disc("x", c, zc, ls - 1, lx + 2 * k + 2, lx + 2 * k + 3, "dark")
        pay.disc("x", c, zc, max(1, ls - 2), lx + 2 * k + 2, lx + 2 * k + 4, "emit_a")
        ext.b(x0 + 1, c + hy - 1, zh + hh - 3 * k - 1, x0 + 3 * k + 2, c + hy + 1, zh + hh - 1, "emit_a")
        labels += ["HOUSING", "COOLING JACKET + LENS", "CHARGE CELL"]
    elif kind == "railgun":
        hh = int(W * 0.36)
        x0, x1 = c - int(W * 0.30), c + int(W * 0.08)
        housing_box(K, hou, x0, x1, c - hy + 1, c + hy - 1, zh, zh + hh, k)
        rw, rh = max(3, int(W * 0.16)), max(3, int(W * 0.12))
        zc = zh + hh // 2
        L = int(W * 1.15)
        pay.b(x1, c - rw, zc - rh, x1 + L, c + rw, zc - rh + max(1, k), "secondary")       # lower rail frame
        pay.b(x1, c - rw, zc + rh - max(1, k), x1 + L, c + rw, zc + rh, "primary")          # top cover
        pay.b(x1, c - rw, zc - rh, x1 + L, c - rw + max(1, k), zc + rh, "metal")            # rails
        pay.b(x1, c + rw - max(1, k), zc - rh, x1 + L, c + rw, zc + rh, "metal")
        for xx in range(x1 + 3 * k, x1 + L - 3 * k, max(4, 3 * k + 1)):                     # coils in the slot
            pay.b(xx, c - rw + max(1, k), zc - 1, xx + max(1, k), c + rw - max(1, k), zc + 1, "emit_a")
        pay.b(x1 + L - 3 * k, c - rw - 1, zc - rh - 1, x1 + L, c + rw + 1, zc + rh + 1, "trim")  # muzzle block
        pay.disc("x", c, zc, max(1, rh - 2), x1 + L, x1 + L + 1, "emit_a")
        ext.b(x0 - 2 * k - 2, c - int(W * 0.14), zh + 1, x0, c + int(W * 0.14), zh + hh - 2, "trim")   # power junction
        ext.b(x0 - 2 * k - 3, c - 2, zh + 2, x0 - 2 * k - 2, c + 2, zh + hh // 2, "emit_b")
        labels += ["COIL HOUSING", "RAIL BARREL", "POWER JUNCTION"]
    elif kind == "missile":
        hh = int(W * 0.56)
        x0, x1 = c - int(W * 0.32), c + int(W * 0.28)
        hy2 = int(W * 0.31)
        housing_box(K, hou, x0, x1, c - hy2, c + hy2, zh, zh + hh, k)
        hou.b(x0 + 1, c - hy2 + 1, zh + hh, x1 - 1, c + hy2 - 1, zh + hh + 1, "secondary")
        cols = {1: 2, 2: 3, 3: 3, 4: 4}[k]
        rows = {1: 2, 2: 2, 3: 3, 4: 3}[k]
        cw = (2 * hy2 - 2) // cols
        chh = (hh - 3) // rows
        for i in range(cols):
            for j in range(rows):
                ya, za = c - hy2 + 1 + i * cw, zh + 2 + j * chh
                pay.b(x1, ya, za, x1 + 1, ya + cw - 1, za + chh - 1, "dark")
                m = max(1, (cw - 1) // 3)
                pay.b(x1, ya + m, za + m, x1 + 2, ya + cw - 1 - m, za + chh - 1 - m, "accent")   # tube caps
        ext.b(x0 - 2 * k - 1, c - 2 * k, zh + 2, x0, c + 2 * k, zh + hh // 2, "trim")          # guidance unit
        ext.b(x0 - 2 * k - 2, c - 1, zh + 3, x0 - 2 * k - 1, c + 1, zh + 5, "emit_a")
        labels += ["POD HOUSING", "LAUNCH TUBES", "GUIDANCE UNIT"]
    elif kind == "flak":
        hh = int(W * 0.42)
        x0, x1 = c - int(W * 0.26), c + int(W * 0.18)
        housing_box(K, hou, x0, x1, c - hy + 1, c + hy - 1, zh, zh + hh, k)
        bw = max(1, k // 2 + (1 if k > 1 else 0))
        zc = zh + hh // 2
        hou.b(x1, c - 4 * bw - 2, zc - 3 * bw - 2, x1 + 2 * k, c + 4 * bw + 2, zc + 3 * bw + 2, "trim")
        for i in (-1, 0, 1):
            for j in (-1, 1):
                y, zz = c + i * (2 * bw + 1), zc + j * (bw + 1)
                barrel(pay, x1 + 2 * k, x1 + int(W * 0.62), y, zz, bw)
        pay.b(x1 + int(W * 0.56), c - 4 * bw - 2, zc - 3 * bw - 1, x1 + int(W * 0.64), c + 4 * bw + 2, zc + 3 * bw + 1, "trim")
        rd = max(3, int(W * 0.18))
        ext.disc("y", c - int(W * 0.06), zh + rd, rd, c + hy - 1, c + hy + 2 * k + 1, "trim")
        ext.disc("y", c - int(W * 0.06), zh + rd, max(1, rd - 2), c + hy + 2 * k + 1, c + hy + 2 * k + 2, "emit_b")
        labels += ["FEED MECHANISM", "FLAK BARRELS", "AMMO DRUM"]
    elif kind == "plasma":
        hh = int(W * 0.50)
        x0, x1 = c - int(W * 0.28), c + int(W * 0.10)
        hy2 = int(W * 0.30)
        housing_box(K, hou, x0, x1, c - hy2, c + hy2, zh, zh + hh, k)
        for s in (-1, 1):                                                        # side coils
            y = c + s * hy2 - (1 if s > 0 else 0)
            for zz in range(zh + 2, zh + hh - 2, max(2, k + 1)):
                hou.b(x0 + 2, y, zz, x1 - 2, y + 1, zz + 1, "emit_a")
        zc = zh + hh // 2
        r = max(3, int(W * 0.22))
        L = int(W * 0.30)
        for i, xx in enumerate(range(x1, x1 + L, max(2, k + 1))):
            pay.disc("x", c, zc, r - (i % 2), xx, xx + max(1, k), "primary" if i % 2 == 0 else "secondary")
        pay.disc("x", c, zc, max(2, r - 2), x1, x1 + L, "dark")
        pay.disc("x", c, zc, max(1, r - 3), x1 + L, x1 + L + 1, "emit_a")
        pay.disc("x", c, zc, max(1, r // 2), x1 + L - 1, x1 + L + 2, "emit_b")
        labels += ["CONTAINMENT HOUSING", "EMITTER + COOLING RINGS", "PLASMA COILS"]
    else:
        raise KeyError(kind)
    parts += [hou, pay, ext]
    top = max((bx[5] for pc in parts for bx in pc.boxes), default=W)
    for i, pc in enumerate(parts):
        greeble(K, pc, (kind, sz, i), slots=("primary", "secondary"), min_face=6, lights=0.06)
        pc.size = (W, W, top)
    return parts, labels


def remount(K, kind, sz):
    """Kit utility mount (shield, tractor, sensor, clamp, beacon) on the r002 plinth stack."""
    old = K.mount_parts(kind, sz)
    parts, z, W, c, k = stack_base(K, sz, f"u2.{kind}")
    base_top = max(bx[5] for bx in old[1].boxes)
    dz = z - base_top
    labels = ["HARDPOINT CONNECTOR", "STEPPED PLINTH", "ROTATION RING"]
    parts = parts[:3]
    for name, pc in (("GIMBAL", old[2]), ("HEAD", old[3]), ("PAYLOAD", old[4])):
        if not pc.boxes:
            continue
        q = K.Piece(pc.id.replace("mount.", "u2."), "mount-part", "top", pc.size)
        q.boxes = [(x0, y0, z0 + dz, x1, y1, z1 + dz, s) for x0, y0, z0, x1, y1, z1, s in pc.boxes]
        parts.append(q)
        labels.append(name)
    top = max(bx[5] for pc in parts for bx in pc.boxes)
    for i, pc in enumerate(parts):
        greeble(K, pc, (kind, sz, i), slots=("primary", "secondary"), min_face=6, lights=0.05)
        pc.size = (W, W, top)
    return parts, labels


def union(K, pid, parts):
    p = K.Piece(pid, "mount", "top", parts[0].size)
    for q in parts:
        p.boxes += q.boxes
    return p


# =============================================================================== interior upgrades
CONSOLE = {
    "navigation": ("emit_a", True, 3), "command": ("emit_a", True, 3), "fire-control": ("emit_b", True, 2),
    "engineering": ("emit_b", True, 2), "sensor": ("emit_a", True, 3),
}


def screen(p, x0, x1, y0, z0, z1, glow, seed, K):
    """Bright multi-cell screen: navy bezel, emissive cells split by 1-texel gaps, UI bars."""
    p.b(x0, y0, z0, x1, y0 + 2, z1, "secondary")
    w, h = x1 - x0 - 2, z1 - z0 - 2
    cols = 2 if w >= 10 else 1
    rows = 2 if h >= 8 else 1
    cw, rh = w // cols, h // rows
    for i in range(cols):
        for j in range(rows):
            a0, b0 = x0 + 1 + i * cw, z0 + 1 + j * rh
            a1, b1 = a0 + cw - 1, b0 + rh - 1
            if a1 - a0 < 2 or b1 - b0 < 2:
                continue
            s = glow if (i + j + int(H(K, seed, i, j) * 3)) % 3 else ("emit_b" if glow == "emit_a" else "emit_a")
            p.b(a0, y0 + 2, b0, a1, y0 + 3, b1, s)
            for bb in range(b0 + 1, b1 - 1, 2):                                   # UI bars
                ln = int((a1 - a0 - 2) * (0.35 + 0.6 * H(K, seed, i, j, bb)))
                if ln >= 1:
                    p.b(a0 + 1, y0 + 3, bb, a0 + 1 + ln, y0 + 4, bb + 1, "dark")


def console(K, kind):
    glow, seat, _ = CONSOLE[kind]

    def build(w, d, h):
        p = K.Piece(f"x2.console-{kind}", "equipment", "interior", (w, d, h))
        dd = d // 2 + 1
        # chunky desk: navy plinth, lavender body with navy cheek panels, bright desk strip
        p.b(1, 1, 0, w - 1, dd, 2, "dark")
        p.b(0, 0, 2, w, dd, 11, "primary")
        p.b(0, 1, 3, 1, dd - 1, 10, "secondary").b(w - 1, 1, 3, w, dd - 1, 10, "secondary")
        p.b(0, 0, 11, w, dd + 1, 12, "secondary")
        p.b(2, dd - 3, 12, w - 2, dd - 1, 13, glow)                               # keyboard glow
        for x in range(2, w - 2, 3):
            p.b(x, dd - 5, 12, x + 2, dd - 4, 13, "metal")
        # screen stack: big main screen, side screen, header strip
        p.b(w // 2 - 1, 1, 12, w // 2 + 1, 3, 14, "trim")
        screen(p, 0, w, 1, 14, h - 1, glow, (kind, 1), K)
        p.b(1, 1, h - 1, w - 1, 3, h, "trim")
        p.b(3, 3, h - 1, w - 3, 4, h, "emit_a" if glow == "emit_b" else "emit_b")
        if seat:
            sx0, sx1 = w // 2 - 4, w // 2 + 4
            p.b(w // 2 - 1, d - 6, 0, w // 2 + 1, d - 4, 5, "metal")             # post
            p.b(sx0 + 1, d - 7, 0, sx1 - 1, d - 3, 1, "trim")                    # foot
            p.b(sx0, d - 8, 5, sx1, d - 2, 7, "secondary")                       # seat
            p.b(sx0, d - 2, 7, sx1, d, 17, "secondary")                          # back
            p.b(sx0 + 1, d - 3, 9, sx1 - 1, d - 2, 16, "accent")
            p.b(sx0 - 1, d - 6, 7, sx0, d - 3, 9, "primary").b(sx1, d - 6, 7, sx1 + 1, d - 3, 9, "primary")
        greeble(K, p, ("console", kind), slots=("primary",), min_face=7, lights=0.0, skip_top=True)
        return p
    return build


def hydroponics(K, w, d, h):
    """Rack with trays, voxel plants (accent slot: themes give hydroponics a green accent) and grow lights."""
    p = K.Piece("x2.hydroponics", "equipment", "interior", (w, d, h))
    p.b(1, 1, 0, w - 1, d - 1, 2, "dark")
    for x in (0, w - 2):
        p.b(x, 0, 0, x + 2, d, h, "primary")
    p.b(0, 0, h - 2, w, d, h, "secondary")
    for tz in range(3, h - 6, 9):
        p.b(2, 1, tz, w - 2, d - 1, tz + 2, "trim")                               # tray
        for i, x in enumerate(range(3, w - 4, 3)):
            ph = 2 + int(H(K, "plant", tz, x) * 4)
            p.b(x + 1, d // 2 - 1, tz + 2, x + 2, d // 2 + 1, tz + 2 + ph, "accent")       # stem
            p.b(x, 2, tz + 2 + ph - 2, x + 3, d - 2, tz + 2 + ph, "accent")                # leaf clump
            if H(K, "leaf", tz, x) < 0.5:
                p.b(x + 1, 1, tz + 3, x + 2, 3, tz + 4, "accent")
        p.b(3, d // 2, tz + 8, w - 3, d // 2 + 1, tz + 9, "emit_b")               # grow light strip
    p.b(2, d - 1, 2, w - 2, d, h - 3, "glass")
    return p


# =============================================================================== damage states
def damage_boxes(K, boxes, state, seed):
    """Presentation damage variants on catalog-frame boxes (proposal; authority unchanged)."""
    if state in ("pristine", "scuffed"):
        return list(boxes)
    frac = {"damaged": 0.10, "destroyed": 0.38}[state]
    out = []
    for i, (x0, y0, z0, x1, y1, z1, s) in enumerate(boxes):
        vol = (x1 - x0) * (y1 - y0) * (z1 - z0)
        h = H(K, seed, state, i)
        if vol < 400 and h < frac:
            continue                                                               # knocked-off detail
        if s in ("emit_a", "emit_b") and (state == "destroyed" or h < 0.5):
            s = "dark"                                                             # dead lights
        elif s in ("primary", "metal") and H(K, seed, "char", i) < (0.18 if state == "damaged" else 0.5):
            s = "dark"                                                             # scorch
        if state == "destroyed" and H(K, seed, "sag", i) < 0.25 and vol < 2000:
            out.append((x0, y0, z0 - 1, x1, y1, z1 - 1, s))                       # buckled
            continue
        out.append((x0, y0, z0, x1, y1, z1, s))
    return out
