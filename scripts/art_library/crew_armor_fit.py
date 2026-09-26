"""Pure-python fit checks for the crew armour kit (no bpy): z-fighting and surface statistics.

z-fight = a same-normal coplanar face that two meshes both expose in the rest pose. Voxel faces are
keyed (boundary x, y, z, axis, sign); a face is ignored when the cell on its outward side is occupied
by any worn geometry (it cannot be seen), and ground-plane soles are ignored.
"""
from __future__ import annotations

import crew_armor_parts as K

DIRS = [((1, 0, 0), 0, 1), ((-1, 0, 0), 0, -1), ((0, 1, 0), 1, 1), ((0, -1, 0), 1, -1), ((0, 0, 1), 2, 1), ((0, 0, -1), 2, -1)]


def faces(cells, with_cell=False):
    out = {} if with_cell else set()
    for c in cells:
        for n, ax, sg in DIRS:
            if (c[0] + n[0], c[1] + n[1], c[2] + n[2]) in cells:
                continue
            k = list(c)
            if sg > 0:
                k[ax] += 1
            key = (k[0], k[1], k[2], ax, sg)
            if with_cell:
                out[key] = c
            else:
                out.add(key)
    return out


def ground(f):
    return f[3] == 2 and f[4] == -1 and f[2] == 0


def buried(f, occ):
    c = list(f[:3])
    if f[4] < 0:
        c[f[3]] -= 1
    return tuple(c) in occ


def body_for(variant, hidden=()):
    """Visible body volumes {bone: set(cells)} of the v2 placeholder, minus hidden regions."""
    out = {}
    for region, vols in K.mannequin(variant).items():
        if region in hidden or (region == "hair" and "head" in hidden):
            continue
        for b, v in vols.items():
            out.setdefault((region, b), set()).update(v.c)
    return out


def part_cells(p, variant):
    return {b: set(v.c) for b, v in p.fits[p.fit_for(variant)].items()}


def zfight(parts_worn, variant):
    """[(label_a, label_b, count)] of visible coincident faces among the body and the worn parts."""
    hidden = {h for p in parts_worn for h in p.hides}
    meshes = [(f"body:{r}:{b}", c) for (r, b), c in body_for(variant, hidden).items()]
    meshes += [(f"{p.id}:{b}", c) for p in parts_worn for b, c in part_cells(p, variant).items()]
    occ = set().union(*(c for _, c in meshes))
    fs = [(label, faces(c)) for label, c in meshes]
    out = []
    for i, (la, fa) in enumerate(fs):
        for lb, fb in fs[i + 1:]:
            if la.startswith("body") and lb.startswith("body"):
                continue                  # body-vs-body is CHAR-BODY's concern
            n = sum(1 for f in fa & fb if not ground(f) and not buried(f, occ))
            if n:
                out.append((la, lb, n))
    return out


def emissive_surface_share(p, variant="male"):
    """Share of the part's exposed (unburied) faces that use the emit slot."""
    vols = p.fits[p.fit_for(variant)]
    allc = set().union(*(set(v.c) for v in vols.values()))
    tot = em = 0
    for v in vols.values():
        for f, c in faces(set(v.c), with_cell=True).items():
            if buried(f, allc):
                continue
            tot += 1
            em += v.c[c] == K.EM
    return em / max(tot, 1)


def report(parts):
    by = {p.id: p for p in parts}
    single = {}
    for p in parts:
        for var in ("male", "female"):
            hits = zfight([p], var)
            if hits:
                single[f"{p.id}@{var}"] = sum(n for _, _, n in hits)
    presets = {}
    for pr in K.PRESETS:
        for var in ("male", "female"):
            hits = zfight([by[i] for i in pr["parts"].values()], var)
            if hits:
                presets[f"{pr['id']}@{var}"] = sum(n for _, _, n in hits)
    emissive = {p.id: round(emissive_surface_share(p), 3) for p in parts}
    return {"zFightSingle": single, "zFightPresets": presets,
            "totalSingle": sum(single.values()), "totalPresets": sum(presets.values()), "emissiveSurface": emissive}


if __name__ == "__main__":
    import json
    import sys
    ps = K.build_catalog()
    want = sys.argv[1:]
    if want:
        by = {p.id: p for p in ps}
        for pid in want:
            for var in ("male", "female"):
                for a, b, n in zfight([by[pid]], var):
                    print(var, a, b, n)
    else:
        r = report(ps)
        print(json.dumps({k: v for k, v in r.items() if k != "emissiveSurface"}, indent=1))
        for p in ps:
            if p.tier >= 2:
                print(p.id, round(emissive_surface_share(p) * 100, 1), "% emissive surface")
