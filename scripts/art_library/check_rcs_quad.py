"""Validate exported RCS proposal geometry and nozzle frames, using only stdlib.

Run: python3 scripts/art_library/check_rcs_quad.py
Walks the actual default-scene hierarchy and decodes vertex/index buffers, rather
than trusting accessor bounds or the builder's input. Exported vertex counts
include normal/material splits. Positions reported in both kit and glTF frames.
"""
import hashlib
import json
import math
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RUNTIME = ROOT / "assets/runtime/ship-components/r004"
ART = ROOT / "assets/art-library/ship-components/r004"
IDENTITY = [[float(i == j) for j in range(4)] for i in range(4)]


def multiply(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def transform(m, p, w=1):
    return [sum(m[i][j] * (*p, w)[j] for j in range(4)) for i in range(3)]


def matrix(node):
    if "matrix" in node:
        return [[node["matrix"][j * 4 + i] for j in range(4)] for i in range(4)]
    x, y, z, w = node.get("rotation", [0, 0, 0, 1])
    rotation = [[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
                [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
                [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]]
    scale = node.get("scale", [1, 1, 1])
    translation = node.get("translation", [0, 0, 0])
    return [[rotation[i][j] * scale[j] for j in range(3)] + [translation[i]]
            for i in range(3)] + [[0, 0, 0, 1]]


def read(path):
    data = path.read_bytes()
    assert struct.unpack_from("<III", data) == (0x46546c67, 2, len(data)), path
    length, kind = struct.unpack_from("<II", data, 12)
    assert kind == 0x4e4f534a
    model = json.loads(data[20:20 + length])
    binary_length, kind = struct.unpack_from("<II", data, 20 + length)
    assert kind == 0x004e4942
    binary = data[28 + length:28 + length + binary_length]
    return model, binary


def accessor(model, binary, index):
    a = model["accessors"][index]
    assert "sparse" not in a
    view = model["bufferViews"][a["bufferView"]]
    width = {"SCALAR": 1, "VEC3": 3}[a["type"]]
    fmt = "<" + {5126: "f", 5125: "I", 5123: "H", 5121: "B"}[a["componentType"]] * width
    stride = view.get("byteStride", struct.calcsize(fmt))
    start = view.get("byteOffset", 0) + a.get("byteOffset", 0)
    return [struct.unpack_from(fmt, binary, start + i * stride) for i in range(a["count"])]


def kit(p):
    return [p[0], -p[2], p[1]]


def near(a, b, tolerance=1e-6):
    return all(abs(x-y) <= tolerance for x, y in zip(a, b))


def validate(size):
    cid = "rcs." + size
    path = RUNTIME / (cid + ".glb")
    model, binary = read(path)
    extent, depth, y, limit = (.375, .5, -.35, 700) if size == "sm" else (.625, 1, -.7, 1200)
    expected = {"nozzle.out": ((0, -depth, 0), (0, -1, 0)),
                "nozzle.xpos": ((extent, y, 0), (1, 0, 0)),
                "nozzle.xneg": ((-extent, y, 0), (-1, 0, 0)),
                "nozzle.zpos": ((0, y, extent), (0, 0, 1)),
                "nozzle.zneg": ((0, y, -extent), (0, 0, -1))}
    world = {}

    def walk(index, parent):
        assert index not in world, "duplicate or cyclic scene node"
        node = model["nodes"][index]
        world[index] = multiply(parent, matrix(node))
        for child in node.get("children", []):
            walk(child, world[index])

    for index in model["scenes"][model.get("scene", 0)]["nodes"]:
        walk(index, IDENTITY)
    points, nozzle_report, triangles, vertices, material_ids = [], {}, 0, 0, []
    slot_points = {}
    for index, m in world.items():
        node = model["nodes"][index]
        name = node.get("name", "")
        if name.startswith("nozzle."):
            assert name in expected and name not in nozzle_report, name
            assert "mesh" not in node, name
            position = transform(m, (0, 0, 0))
            direction = transform(m, (0, 1, 0), w=0)
            assert near(kit(position), expected[name][0], .03), (name, kit(position))
            # Exact authoring is intentional; the contract allows 3cm but we need no slack.
            assert near(kit(position), expected[name][0]), (name, kit(position))
            assert near(kit(direction), expected[name][1]), (name, kit(direction))
            nozzle_report[name] = {"kitPosition": kit(position), "gltfPosition": position,
                                   "gltfDirection": direction}
        if "mesh" not in node:
            continue
        for primitive in model["meshes"][node["mesh"]]["primitives"]:
            assert primitive.get("mode", 4) == 4
            local = accessor(model, binary, primitive["attributes"]["POSITION"])
            assert all(math.isfinite(v) for p in local for v in p)
            transformed = [kit(transform(m, p)) for p in local]
            points.extend(transformed)
            slot = model["materials"][primitive["material"]]["name"]
            slot_points.setdefault(slot, []).extend(transformed)
            indices = [i[0] for i in accessor(model, binary, primitive["indices"])]
            assert len(indices) % 3 == 0 and all(0 <= i < len(local) for i in indices)
            for offset in range(0, len(indices), 3):
                a, b, c = (local[i] for i in indices[offset:offset+3])
                u, v = [b[j]-a[j] for j in range(3)], [c[j]-a[j] for j in range(3)]
                cross = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]]
                assert sum(x*x for x in cross) > 1e-16, "degenerate triangle"
            triangles += len(indices) // 3
            vertices += len(local)
            material_ids.append(primitive["material"])
    assert set(nozzle_report) == set(expected)
    assert len(model["meshes"]) == 1 and len(material_ids) == len(set(material_ids))
    bounds = [[f(p[j] for p in points) for j in range(3)] for f in (min, max)]
    assert near(bounds[0], (-extent, -depth, -extent))
    assert near(bounds[1], (extent, 0, extent)), bounds
    assert 0 < triangles <= limit, triangles
    # Measure the actual mesh rims on the five datum planes, independent of
    # builder metadata. The main nozzle must be larger than four equal jets.
    radii = {}
    for name, (centre, direction) in expected.items():
        axis = next(j for j in range(3) if direction[j])
        rim = [p for p in points if abs(p[axis]-centre[axis]) < 1e-6]
        assert len(rim) >= 16, (name, "missing open rim")
        radii[name] = max(abs(p[j]-centre[j]) for p in rim for j in range(3) if j != axis)
        radius = ((.08125 if size == "sm" else .121875) if name == "nozzle.out"
                  else (.06875 if size == "sm" else .105))
        radius *= 1.25  # r003 mouths, measured from exported geometry.
        assert abs(radii[name]-radius) < 1e-6, (name, radii[name], radius)
    assert radii["nozzle.out"] > max(r for n, r in radii.items() if n != "nozzle.out")
    # White is confined to the mount/collar; the head's structural faces are navy.
    assert min(p[1] for p in slot_points["slot0_primary"]) >= (-.1875 if size == "sm" else -.3125) - 1e-6
    navy = slot_points["slot1_secondary"]
    head_bounds = ((-.3125, -.4375, -.3125), (.3125, -.1875, .3125)) if size == "sm" else (
        (-.5, -.9375, -.5), (.5, -.4375, .5))
    assert near([min(p[j] for p in navy) for j in range(3)], head_bounds[0])
    assert near([max(p[j] for p in navy) for j in range(3)], head_bounds[1])
    # Each mouth contains a broad recessed emissive annulus, not a filled dot.
    for name, (centre, direction) in expected.items():
        axis = next(j for j in range(3) if direction[j])
        length = (.1 if name == "nozzle.out" else .125) if size == "sm" else (
            .125 if name == "nozzle.out" else .25)
        ring_depth = min(length * .4, radii[name] * .45)
        plane = centre[axis] - direction[axis] * ring_depth
        ring = [p for p in slot_points["slot6_emit_a"] if abs(p[axis] - plane) < 1e-6]
        assert len(ring) >= 16, (name, "missing emissive ring")
        ring_radii = [max(abs(p[j]-centre[j]) for j in range(3) if j != axis) for p in ring]
        assert near((min(ring_radii), max(ring_radii)), (radii[name]*.42, radii[name]*.66))
    slots = sorted(m["name"] for m in model["materials"])
    assert slots == ["slot0_primary", "slot1_secondary", "slot2_accent", "slot4_metal", "slot5_dark", "slot6_emit_a"]
    donor, _ = read(RUNTIME / "thrust-block.sm.glb")
    donor_slots = {m["name"]: m for m in donor["materials"]}
    assert all(m == donor_slots[m["name"]] for m in model["materials"]), "kit material changed"
    ports = [n for n in model["nodes"] if n.get("name", "").startswith("port.")]
    assert len(ports) == 3
    assert {n["name"].split(".")[1] for n in ports} == {"power-in", "data-in", "fuel-in"}
    root = next(n for n in model["nodes"] if n.get("name") == "component." + cid)
    assert root["extras"]["status"] == "proposed"
    assert root["extras"]["artRevision"] == "rcs-quad-r003"
    assert (ROOT / root["extras"]["artSource"]).is_file()
    for folder in (RUNTIME, ART):
        row = next(r for r in json.loads((folder / "manifest.json").read_text())["components"] if r["id"] == cid)
        assert row["sha256"] == hashlib.sha256(path.read_bytes()).hexdigest()
        assert row["bytes"] == path.stat().st_size
        assert row["triangles"] == triangles and row["vertices"] == vertices
        assert row["boxes"] == root["extras"]["boxCount"]
        assert row["materialSlotsUsed"] == slots
        assert all(near(a, b) for a, b in zip(bounds, row["boundsM"]))
        assert all(near(a, b) for a, b in zip(bounds, row["catalogEnvelopeM"]))
        assert row["envelopeOverhangM"] == 0
    assert path.read_bytes() == (ART / "glb" / path.name).read_bytes()
    print(json.dumps({"component": cid, "boundsKitM": bounds, "triangles": triangles,
                      "vertices": vertices, "exitDiametersM": {n: 2*r for n,r in radii.items()}, "nozzles": nozzle_report, "rcs_quad": "passed"}))


if __name__ == "__main__":
    for size in ("sm", "md"):
        validate(size)
