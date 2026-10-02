"""Rebuild the finite private R26 canopy primitive table from original kit source.

No Blender export or scratch evidence is an input. These are positive original
construction solids sampled by the common ship lattice, with proposed roles.
The nonconvex corner eyebrow remains excluded. This table does not certify
clear cabin windows, pressure authority, collision, or owner art approval.
"""
import collections
import hashlib
import importlib.util
import json
import math
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = "scripts/art_library/ship_kit_modules.py"
PINS = {
    SOURCE: "b067ca505c3972b59f144a49760ed2675ec0756c6ad3d56db366a7c5ace0c725",
    "packages/content/src/construction-grammar.v1.json": "33f5226a142fa4687ee552ef14ed9e977ad13ddd3e1eaaf78a58d6bdccf89ea0",
}
SELECTED = {
    "canopy.slope1.deck": list(range(9)) + list(range(18, 25)),
    "canopy.corner45.deck": list(range(9)) + [11],
    "canopy.straight.w1.deck": list(range(9)) + list(range(16, 23)),
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0])


def clean(face):
    result = []
    for v in face:
        v = tuple(v)
        if not result or v != result[-1]:
            result.append(v)
    if result and result[0] == result[-1]:
        result.pop()
    return result


def faces(rings):
    n = len(rings[0])
    return [clean([rings[k][i], rings[k][(i + 1) % n],
                   rings[k + 1][(i + 1) % n], rings[k + 1][i]])
            for k in range(len(rings) - 1) for i in range(n)] + [
                clean(rings[0][::-1]), clean(rings[-1])]


def volume(fs):
    return sum(dot(f[0], cross(f[j], f[j + 1])) / 6
               for f in fs for j in range(1, len(f) - 1))


def certify(rings):
    """Exact oriented original faces, never a convex hull of an invalid loft."""
    fs = faces(rings)
    vertices = list(dict.fromkeys(tuple(p) for ring in rings for p in ring))
    if not all(math.isfinite(x) for p in vertices for x in p):
        raise ValueError("Nonfinite source rings")
    signed = volume(fs)
    if abs(signed) <= 1e-9:
        raise ValueError("Nonpositive source solid")
    orientation = 1 if signed > 0 else -1
    planes, actual_faces = [], []
    for f in fs:
        if len(f) < 3:
            continue
        nn = tuple(sum(cross(a, b)[i] for a, b in zip(f, f[1:] + f[:1]))
                   for i in range(3))
        length = math.sqrt(dot(nn, nn))
        if length <= 1e-9:
            continue
        normal = [orientation * x / length for x in nn]
        bound = dot(normal, f[0])
        if any(abs(dot(normal, p) - bound) > 1e-9 for p in f):
            raise ValueError("Nonplanar source face")
        if any(dot(normal, p) > bound + 1e-9 for p in vertices):
            raise ValueError("Nonconvex source loft")
        planes.append([*normal, bound])
        actual_faces.append(f)
    edge = collections.Counter((a, b) for f in actual_faces
                               for a, b in zip(f, f[1:] + f[:1]) if a != b)
    if any(n != 1 or edge[(b, a)] != 1 for (a, b), n in edge.items()):
        raise ValueError("Unclosed source face boundary")
    bounds = [min(p[i] for p in vertices) for i in range(3)] + [
        max(p[i] for p in vertices) for i in range(3)]
    return {"bounds": bounds, "planes": planes,
            "positiveVolumeTexels3": abs(signed)}


def duty(index, count):
    if index < 6:
        return "rising-keel-course", "core"
    if index == 6:
        return "waist-backbone", "frame"
    if index == 7:
        return "crimson-waist-cover", "plate"
    if index == 8:
        return "pale-crash-rail", "frame"
    if count == 12:
        if index == 11:
            return "lower-pressure-glass-sill", "frame"
    else:
        eyebrow = 18 if count == 29 else 16
        if index == eyebrow:
            return "upper-pressure-eyebrow", "frame"
        if index == eyebrow + 1:
            return "lower-pressure-glass-sill", "frame"
        if index in (eyebrow + 2, eyebrow + 3):
            return "pressure-glass-spar", "frame"
        if eyebrow + 4 <= index <= eyebrow + 6:
            return "stepped-armor-eyebrow", "plate"
    raise ValueError("Unknown selected source duty")


def main():
    for path, expected in PINS.items():
        if digest((ROOT / path).read_bytes()) != expected:
            raise ValueError(f"Unqualified original source: {path}")
    spec = importlib.util.spec_from_file_location("r026_original_canopy", ROOT / SOURCE)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    captured = collections.defaultdict(list)
    original = mod.MeshPiece.loft

    def capture(piece, rings, slot):
        captured[piece.id].append({"rings": rings, "slot": slot})
        return original(piece, rings, slot)

    mod.MeshPiece.loft = capture
    try:
        mod.canopy_module("slope1", "deck")
        mod.canopy_corner("deck", degrees=45)
        mod.canopy_straight("deck")
    finally:
        mod.MeshPiece.loft = original
    if [len(captured[p]) for p in SELECTED] != [29, 12, 27]:
        raise ValueError("Original source loft identities changed")
    pieces = {}
    for piece, ids in SELECTED.items():
        primitives = []
        for index in ids:
            part = captured[piece][index]
            name, role = duty(index, len(captured[piece]))
            rings = part["rings"]
            groups = [(None, rings)]
            if piece == "canopy.corner45.deck" and index not in (0, 6) and len(rings) > 2:
                groups = [(k, rings[k:k + 2]) for k in range(len(rings) - 1)]
                if abs(sum(volume(faces(g)) for _, g in groups) - volume(faces(rings))) > 1e-9:
                    raise ValueError("Adjacent-ring source partition changes volume")
            for segment, group in groups:
                identifier = f"{piece}:source-loft:{index}"
                if segment is not None:
                    identifier += f":segment:{segment}"
                primitives.append({"id": identifier, "duty": name, "role": role,
                                   "slot": part["slot"], **certify(group)})
        pieces[piece] = primitives
    if [len(pieces[p]) for p in SELECTED] != [16, 26, 16]:
        raise ValueError("Finite selected primitive cohort changed")
    output = {"schema": 1, "status": "proposal", "lattice": 16,
              "inputs": PINS,
              "excluded": ["canopy.corner45.deck:source-loft:10"],
              "pieces": pieces}
    target = ROOT / "packages/content/src/ship-canopy-source-r026.v1.json"
    data = (json.dumps(output, indent=2) + "\n").encode()
    target.write_bytes(data)
    # Use the repository-pinned formatter so regeneration passes its own checks.
    subprocess.run(["node", str(ROOT / "node_modules/prettier/bin/prettier.cjs"),
                    "--write", str(target)], cwd=ROOT, check=True)
    data = target.read_bytes()
    print(json.dumps({"output": str(target.relative_to(ROOT)), "bytes": len(data),
                      "sha256": digest(data), "primitiveCounts": {p: len(v) for p, v in pieces.items()}}))


if __name__ == "__main__":
    main()
