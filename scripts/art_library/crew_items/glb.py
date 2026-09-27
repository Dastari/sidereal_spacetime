"""Minimal GLB reader for validation (pure Python)."""
import json
import struct


def read_glb_json(path):
    with open(path, "rb") as f:
        data = f.read()
    magic, version, length = struct.unpack_from("<III", data, 0)
    if magic != 0x46546C67 or version != 2 or length != len(data):
        raise ValueError(f"{path}: not a glTF 2.0 binary")
    chunk_len, chunk_type = struct.unpack_from("<II", data, 12)
    if chunk_type != 0x4E4F534A:
        raise ValueError(f"{path}: first chunk is not JSON")
    return json.loads(data[20:20 + chunk_len].decode("utf-8"))


def stats(path):
    g = read_glb_json(path)
    acc = g.get("accessors", [])
    tris = 0
    prims = 0
    for mesh in g.get("meshes", []):
        for p in mesh["primitives"]:
            prims += 1
            if "indices" in p:
                tris += acc[p["indices"]]["count"] // 3
            else:
                tris += acc[p["attributes"]["POSITION"]]["count"] // 3
    return {
        "triangles": tris,
        "primitives": prims,
        "nodes": sorted(n.get("name", "") for n in g.get("nodes", [])),
        "materials": sorted(m.get("name", "") for m in g.get("materials", [])),
        "animations": sorted(a.get("name", "") for a in g.get("animations", [])),
        "extensionsUsed": sorted(g.get("extensionsUsed", [])),
    }
