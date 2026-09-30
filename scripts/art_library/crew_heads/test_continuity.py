"""Inspect the exported candidate geometry, including splits introduced by bevel and GLB export."""
import json
import struct
import numpy as np
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def window_seals(path):
    from parts_gear import HELMETS
    from vox import fwd
    data = path.read_bytes()
    end = 20 + struct.unpack_from("<I", data, 12)[0]
    doc = json.loads(data[20:end])

    def channel(index):
        a = doc["accessors"][index]
        v = doc["bufferViews"][a["bufferView"]]
        width = {"SCALAR": 1, "VEC3": 3, "VEC4": 4}[a["type"]]
        kind = {5121: "u1", 5123: "<u2", 5125: "<u4", 5126: "<f4"}[a["componentType"]]
        return np.frombuffer(data, dtype=kind, count=a["count"] * width,
                             offset=end + 8 + v.get("byteOffset", 0) + a.get("byteOffset", 0)).reshape(-1, width)

    geometry = {}
    for n in doc["nodes"]:
        triangles = []
        for p in doc["meshes"][n["mesh"]]["primitives"]:
            positions = channel(p["attributes"]["POSITION"]) * .9
            indices = channel(p["indices"]).reshape(-1, 3)
            triangles.extend(positions[indices])
        geometry[n["name"]] = np.asarray(triangles)

    def hits(tris, x, y):
        origin = np.array([x, y, -2.])
        direction = np.array([0., 0., 1.])
        e1, e2 = tris[:, 1] - tris[:, 0], tris[:, 2] - tris[:, 0]
        h = np.cross(direction, e2)
        det = np.einsum("ij,ij->i", e1, h)
        valid = np.abs(det) > 1e-10
        invdet = np.divide(1., det, out=np.zeros_like(det), where=valid)
        s = origin - tris[:, 0]
        u = np.einsum("ij,ij->i", s, h) * invdet
        q = np.cross(s, e1)
        v = q[:, 2] * invdet
        t = np.einsum("ij,ij->i", e2, q) * invdet
        return sorted(t[valid & (u >= -1e-6) & (v >= -1e-6) & (u + v <= 1 + 1e-6) & (t > 0)])

    report = {}
    for hid, spec in HELMETS.items():
        if hid == "open":
            assert not any(n.startswith("visor.open.") for n in geometry)
            continue
        minimum = float("inf")
        samples = 0
        for x0, z0, x1, z1 in spec[-1]:
            points = []
            for f in np.linspace(.1, .9, 9):
                points.extend([(x0 + .1, z0 + (z1-z0)*f), (x1 - .1, z0 + (z1-z0)*f),
                               (x0 + (x1-x0)*f, z0 + .1), (x0 + (x1-x0)*f, z1 - .1)])
            for x, z in points:
                x, y = float(fwd(x, 0)) / 32 * .9, float(fwd(z, 2)) / 32 * .9
                shell = hits(geometry[f"helmet.{hid}"], x, y)
                pane = hits(geometry[f"visor.{hid}.clear"], x, y)
                assert len(shell) >= 2 and len(pane) >= 2, (hid, x, z, shell, pane)
                overlap = min(shell[-1], pane[-1]) - max(shell[0], pane[0])
                assert overlap > .001, (hid, x, z, overlap)
                minimum = min(minimum, overlap)
                samples += 1
        report[hid] = {"rays": samples, "minimumWindowOverlapMeters": minimum, "headScale": .9}
    return report


def components(path, prefix="hair."):
    data = path.read_bytes()
    end = 20 + struct.unpack_from("<I", data, 12)[0]
    doc = json.loads(data[20:end])
    binary = end + 8

    def channel(index):
        a = doc["accessors"][index]
        v = doc["bufferViews"][a["bufferView"]]
        width = {"SCALAR": 1, "VEC3": 3, "VEC4": 4}[a["type"]]
        kind = {5121: "B", 5123: "H", 5125: "I", 5126: "f"}[a["componentType"]]
        size = struct.calcsize(kind) * width
        start = binary + v.get("byteOffset", 0) + a.get("byteOffset", 0)
        return [struct.unpack_from("<" + kind * width, data, start + i * v.get("byteStride", size))
                for i in range(a["count"])]

    result = {}
    for node in doc["nodes"]:
        if "mesh" not in node or not node["name"].startswith(prefix):
            continue
        points, faces = [], []
        for p in doc["meshes"][node["mesh"]]["primitives"]:
            offset = len(points)
            points.extend(channel(p["attributes"]["POSITION"]))
            indices = [x[0] + offset for x in channel(p["indices"])]
            faces.extend(zip(indices[::3], indices[1::3], indices[2::3]))
        parents = list(range(len(points)))

        def root(i):
            while parents[i] != i:
                parents[i] = parents[parents[i]]
                i = parents[i]
            return i

        def join(i, j):
            parents[root(i)] = root(j)

        welded = {}
        for i, p in enumerate(points):
            key = tuple(round(x, 6) for x in p)
            if key in welded:
                join(i, welded[key])
            else:
                welded[key] = i
        for a, b, c in faces:
            join(a, b)
            join(a, c)
        groups = {}
        for i, p in enumerate(points):
            groups.setdefault(root(i), []).append(p)
        result[node["name"]] = [
            {"vertices": len(group), "min": [min(p[k] for p in group) for k in range(3)],
             "max": [max(p[k] for p in group) for k in range(3)]}
            for group in sorted(groups.values(), key=len, reverse=True)]
    return result


if __name__ == "__main__":
    failures = {}
    for path in (ROOT / "assets/runtime/crew/heads/refinement-r005/hair").glob("*.glb"):
        failures.update({name: groups for name, groups in components(path).items() if len(groups) != 1})
    print(json.dumps(failures, indent=2))
    print(json.dumps(window_seals(ROOT / "assets/runtime/crew/heads/refinement-r005/helmets.glb"), indent=2))
    raise SystemExit(bool(failures))
