"""Snapshot CHAR-BODY's body volumes into crew_armor_body.json (pure python, no Blender).

  python3 scripts/art_library/crew_armor_body_snapshot.py /root/sidereal-progress/_shared/crew-body-r004/scripts r004

Runs CHAR-BODY's body.py against a pure-python stand-in for voxkit (Vol/Part cell sets only) and stores
the occupied cells per variant / layer region / bone. The armour fit checks and the mannequin fallback
read this file, so the repository's tests do not depend on the shared progress folder. Re-run it on
every CHAR-BODY revision, then refit and re-check the armour.
"""
import json
import sys
import types
from pathlib import Path

HERE = Path(__file__).resolve().parent


class Vol:
    def __init__(self):
        self.c = {}

    def box(self, x0, y0, z0, x1, y1, z1, slot):
        for x in range(x0, x1):
            for y in range(y0, y1):
                for z in range(z0, z1):
                    self.c[(x, y, z)] = slot
        return self

    def cut(self, x0, y0, z0, x1, y1, z1):
        for x in range(x0, x1):
            for y in range(y0, y1):
                for z in range(z0, z1):
                    self.c.pop((x, y, z), None)
        return self

    def paint(self, x0, y0, z0, x1, y1, z1, slot):
        for k in list(self.c):
            if x0 <= k[0] < x1 and y0 <= k[1] < y1 and z0 <= k[2] < z1:
                self.c[k] = slot
        return self

    def mirror_x(self, a, b):
        for (x, y, z), s in list(self.c.items()):
            if a <= x < b:
                self.c[(-1 - x, y, z)] = s
        return self

    def merge(self, other):
        self.c.update(other.c)
        return self

    def bounds(self):
        ks = list(self.c)
        return [min(k[i] for k in ks) for i in range(3)], [max(k[i] for k in ks) + 1 for i in range(3)]


class Part:
    def __init__(self):
        self.islands = []

    def brick(self, *a):
        v = Vol().box(*a)
        if v.c:
            self.islands.append(v)
        return v

    def island(self, vol):
        if vol.c:
            self.islands.append(vol)
        return vol

    def paint(self, *box):
        for v in self.islands:
            v.paint(*box)
        return self

    def cut(self, *box):
        for v in self.islands:
            v.cut(*box)
        self.islands = [v for v in self.islands if v.c]
        return self

    def mirrored(self):
        out = Part()
        for v in self.islands:
            m = Vol()
            m.c = {(-1 - x, y, z): s for (x, y, z), s in v.c.items()}
            out.islands.append(m)
        return out

    def merged(self, other):
        out = Part()
        out.islands = self.islands + other.islands
        return out

    def cells(self):
        out = {}
        for v in self.islands:
            out.update(v.c)
        return out


def runs(cells):
    """{(x, y, z): slot} -> [[x, y, z0, z1, slot], ...] vertical runs of one slot."""
    by = {}
    for (x, y, z), sl in cells.items():
        by.setdefault((x, y, sl.split(":")[0]), []).append(z)
    out = []
    for (x, y, sl), zs in sorted(by.items()):
        zs.sort()
        z0 = prev = zs[0]
        for z in zs[1:] + [None]:
            if z is not None and z == prev + 1:
                prev = z
                continue
            out.append([x, y, z0, prev + 1, sl])
            if z is not None:
                z0 = prev = z
    return out


def snapshot(scripts_dir, revision):
    stub = types.ModuleType("voxkit")
    stub.Vol, stub.Part = Vol, Part
    sys.modules["voxkit"] = stub
    sys.path.insert(0, str(scripts_dir))
    import body  # noqa: E402
    out = {"revision": revision, "source": "CHAR-BODY body.py", "variants": {}}
    for variant in ("male", "female"):
        layers, hair = body.build(variant)
        regions = {}
        for region, bones in layers.items():
            regions[region] = {}
            for bone, part in bones.items():
                cells = part.cells() if hasattr(part, "cells") and callable(part.cells) else part.c
                regions[region][bone] = runs(cells)
        hc = hair.cells() if hasattr(hair, "islands") else hair.c
        regions["hair"] = {"head": runs(hc)}
        out["variants"][variant] = regions
    return out


if __name__ == "__main__":
    data = snapshot(Path(sys.argv[1]), sys.argv[2])
    dest = HERE / "crew_armor_body.json"
    dest.write_text(json.dumps(data, separators=(",", ":")) + "\n")
    print(dest, dest.stat().st_size, {v: {r: len(b) for r, b in regs.items()} for v, regs in data["variants"].items()})
