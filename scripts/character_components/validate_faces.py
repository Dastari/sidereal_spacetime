"""Independent r009 export preservation gate; never imports authoring scripts.

Usage: python3 scripts/character_components/validate_faces.py <candidate-folder>
Writes a new faces-validation.json (or --report name) inside that candidate.
Optional --native opens both Blender sources read-only in the configured tool.
No publication, runtime asset or database mutation is performed.
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
import math
from pathlib import Path
import struct
import subprocess
import sys
import zlib

ROOT = Path(__file__).resolve().parents[2]
REVISION = ROOT / "assets/art-library/designs/crew.base-and-outfits/revisions"
BASE = REVISION / "r008/candidate"
PINS = {
    "modular-crew.glb": "ae4a7e12096bd9aaac0bdfb178354d899b89af15cbc20293815c301871694150",
    "manifest.json": "f7a9846f5d238dec6745171cbf49f638697510482cd70c15b647426b494ac39c",
    "blender-source.blend": "6b17eab686f9c82c67f7dd87a6b460e9c0311f29d954e43728cf93d875157f61",
}
HAIR = ("swept", "cropped", "crest", "scientist", "bob", "ponytail", "bun", "braids")
ROLES = ("age", "detail", "facialHair", "eyes", "brows", "mouth", "iris")
ENUMS = {
    "expressions": ["neutral", "happy", "stern", "sad", "surprised", "wink", "grin", "determined"],
    "details": ["none", "freckles", "scar", "scratch", "tattoo", "bandage", "dirt", "warpaint", "cyber", "birthmark"],
    "facialHair": ["none", "stubble", "short", "full", "goatee", "moustache", "handlebar", "sideburns"],
    "ages": ["young", "adult", "mature", "elder"],
}
COMPONENT_FORMAT = {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}
ARITY = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT2": 4, "MAT3": 9, "MAT4": 16}
# Explicit integration-owner allowance for Blender rejoin/export roundoff.
# Never round stored evidence or call this byte-identical preservation.
POSITION_TOLERANCE_M = 1e-6
NORMAL_TOLERANCE = 5e-4


def require(value, message):
    if not value:
        raise ValueError(message)


def digest(value):
    return hashlib.sha256(value).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


def transform(node):
    return {"matrix": node["matrix"]} if "matrix" in node else {
        "translation": node.get("translation", [0, 0, 0]),
        "rotation": node.get("rotation", [0, 0, 0, 1]),
        "scale": node.get("scale", [1, 1, 1]),
    }


class Glb:
    def __init__(self, path):
        self.path = Path(path)
        self.raw = self.path.read_bytes()
        magic, version, length = struct.unpack_from("<III", self.raw)
        require((magic, version, length) == (0x46546C67, 2, len(self.raw)), f"{path}: invalid GLB header")
        chunks, offset = {}, 12
        while offset < length:
            count, kind = struct.unpack_from("<II", self.raw, offset)
            require(kind not in chunks and offset + 8 + count <= length, "Invalid GLB chunk")
            chunks[kind] = self.raw[offset + 8:offset + 8 + count]
            offset += 8 + count
        self.g = json.loads(chunks[0x4E4F534A])
        self.bin = chunks[0x004E4942]
        require(len(self.g["buffers"]) == 1 and "uri" not in self.g["buffers"][0], "External GLB buffer")
        self.cache = {}
        self.parents = {child: i for i, node in enumerate(self.g["nodes"]) for child in node.get("children", [])}
        self.components = {}
        for node in self.g["nodes"]:
            key = node.get("extras", {}).get("component_id")
            if key and "mesh" in node:
                require(key not in self.components, f"Duplicate component {key}")
                self.components[key] = node

    def values(self, index):
        if index in self.cache:
            return self.cache[index]
        accessor = self.g["accessors"][index]
        require("sparse" not in accessor, "Sparse accessor requires an explicit validation implementation")
        view = self.g["bufferViews"][accessor["bufferView"]]
        require(view.get("buffer", 0) == 0, "External accessor buffer")
        code = COMPONENT_FORMAT[accessor["componentType"]]
        fmt = "<" + code * ARITY[accessor["type"]]
        size = struct.calcsize(fmt)
        stride = view.get("byteStride", size)
        start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
        end = start + max(0, accessor["count"] - 1) * stride + (size if accessor["count"] else 0)
        require(stride >= size and end <= view.get("byteOffset", 0) + view["byteLength"] <= len(self.bin), "Accessor exceeds buffer bounds")
        result = [struct.unpack_from(fmt, self.bin, start + i * stride) for i in range(accessor["count"])]
        if accessor.get("normalized"):
            maximum = {5120: 127, 5121: 255, 5122: 32767, 5123: 65535}[accessor["componentType"]]
            result = [tuple(max(-1, v / maximum) for v in row) for row in result]
        self.cache[index] = result
        return result

    def primitives(self, key):
        return self.g["meshes"][self.components[key]["mesh"]]["primitives"]

    def placement(self, node):
        index = next(i for i, value in enumerate(self.g["nodes"]) if value is node)
        path, seen = [], set()
        while index is not None:
            require(index not in seen, "Cyclic node hierarchy")
            seen.add(index)
            value = self.g["nodes"][index]
            # Blender may append .001 to an exported leaf while the admitted
            # component_id remains stable. Bone/armature names remain exact.
            component_id = value.get("extras", {}).get("component_id")
            identity = "component:" + component_id if component_id else value.get("name")
            path.append((identity, transform(value)))
            index = self.parents.get(index)
        return path

    def image(self, index):
        image = self.g["images"][index]
        require(image.get("mimeType") == "image/png" and "uri" not in image and "bufferView" in image, "Atlas must be an embedded PNG")
        view = self.g["bufferViews"][image["bufferView"]]
        return self.bin[view.get("byteOffset", 0):view.get("byteOffset", 0) + view["byteLength"]]

    def material(self, index):
        # Resolve texture indices to actual image content and sampler state.
        def resolve(value):
            if isinstance(value, dict):
                return {key: (texture(child) if key.endswith("Texture") else resolve(child)) for key, child in value.items()}
            return [resolve(v) for v in value] if isinstance(value, list) else value

        def texture(info):
            t = self.g["textures"][info["index"]]
            return {
                **{key: value for key, value in info.items() if key != "index"},
                "imageSha256": digest(self.image(t["source"])),
                "sampler": self.g.get("samplers", [])[t["sampler"]] if "sampler" in t else {},
            }
        return resolve(self.g["materials"][index])

    def rig(self):
        require(len(self.g.get("skins", [])) == 1, "Expected exactly one shared skin")
        skin = self.g["skins"][0]
        names = [self.g["nodes"][i]["name"] for i in skin["joints"]]
        require(len(names) == len(set(names)) == 16, "Expected 16 distinct joints")
        matrices = self.values(skin["inverseBindMatrices"])
        require(len(matrices) == 16, "Expected 16 bind matrices")
        result = {}
        for index, name, matrix in zip(skin["joints"], names, matrices):
            parent = self.parents.get(index)
            result[name] = {"bind": matrix, "rest": transform(self.g["nodes"][index]),
                            "parent": self.g["nodes"][parent]["name"] if parent is not None else None,
                            "ancestorPlacement": self.placement(self.g["nodes"][index])}
        return result

    def clips(self):
        result = {}
        for animation in self.g.get("animations", []):
            require(animation["name"] not in result, "Duplicate animation name")
            channels = {}
            for channel in animation["channels"]:
                sampler = animation["samplers"][channel["sampler"]]
                key = (self.g["nodes"][channel["target"]["node"]]["name"], channel["target"]["path"])
                require(key not in channels, "Duplicate animation channel")
                channels[key] = (sampler.get("interpolation", "LINEAR"), self.values(sampler["input"]), self.values(sampler["output"]))
            result[animation["name"]] = channels
        return result


def triangle_key(vertices):
    """Index/order invariant while preserving vertex association and winding."""
    return min(tuple(vertices[i:] + vertices[:i]) for i in range(3))


def geometry(asset, key, *, below_head=False, head_only=False, material=True):
    rows = Counter()
    head_joint = [asset.g["nodes"][i]["name"] for i in asset.g["skins"][0]["joints"]].index("head")
    for primitive in asset.primitives(key):
        require(primitive.get("mode", 4) == 4, f"Non-triangle primitive: {key}")
        attributes = {name: asset.values(i) for name, i in primitive["attributes"].items()}
        if below_head:
            # Additional face-only UV channels from a join are irrelevant to
            # lower-body geometry; retain original primary UVs and skin weights.
            attributes = {k: v for k, v in attributes.items() if k in ("POSITION", "NORMAL", "TEXCOORD_0", "JOINTS_0", "WEIGHTS_0")}
        semantic = tuple(sorted(attributes))
        vertices = [tuple((name, attributes[name][i]) for name in semantic) for i in range(len(attributes["POSITION"]))]
        indices = [row[0] for row in asset.values(primitive["indices"])]
        require(len(indices) % 3 == 0, "Triangle index count must be divisible by three")
        material_key = canonical(asset.material(primitive["material"])) if material else ""
        for i in range(0, len(indices), 3):
            triangle = indices[i:i + 3]
            selected = [any(joint == head_joint and weight > 0 for joint, weight in zip(attributes["JOINTS_0"][v], attributes["WEIGHTS_0"][v])) for v in triangle]
            if below_head and any(selected):
                continue
            if head_only and not all(selected):
                continue
            rows[(material_key, triangle_key([vertices[j] for j in triangle]))] += 1
    return rows


def geometry_difference(before, after):
    missing, added = before - after, after - before
    return {"beforeTriangles": sum(before.values()), "afterTriangles": sum(after.values()),
            "missingTriangles": sum(missing.values()), "addedTriangles": sum(added.values())}


def compare_surfaces(before, after):
    result = geometry_difference(before, after)
    result.update({"exactDecodedEquality": before == after, "maxPositionDisplacementM": 0.0,
                   "maxNormalVectorDelta": 0.0, "maxNormalAngleDegrees": 0.0,
                   "positionToleranceM": POSITION_TOLERANCE_M, "normalVectorTolerance": NORMAL_TOLERANCE})
    require(result["beforeTriangles"] == result["afterTriangles"], f"Triangle count changed: {result}")
    if before == after:
        return result
    # Remove exact matches first, then match only the remaining oriented
    # triangles. Fixed attributes/materials remain exact; only positions and
    # normals receive the explicit bounded export-roundoff allowance.
    common = before & after
    old, new = before - common, after - common
    cell_size = POSITION_TOLERANCE_M * 4

    def unpack(key):
        material, triangle = key
        vertices = [dict(v) for v in triangle]
        fixed = tuple(sorted(tuple((k, v) for k, v in row.items() if k not in ("POSITION", "NORMAL")) for row in vertices))
        centroid = [sum(v["POSITION"][axis] for v in vertices) / 3 for axis in range(3)]
        cell = tuple(math.floor(x / cell_size) for x in centroid)
        return material, vertices, fixed, cell

    buckets = {}
    for key, count in new.items():
        material, vertices, fixed, cell = unpack(key)
        buckets.setdefault((material, fixed, cell), []).append([vertices, count])
    unmatched = 0
    for key, count in old.items():
        material, original, fixed, cell = unpack(key)
        candidates = []
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    candidates.extend(buckets.get((material, fixed, (cell[0] + dx, cell[1] + dy, cell[2] + dz)), []))
        for _ in range(count):
            best = None
            for entry in candidates:
                if not entry[1]:
                    continue
                for shift in range(3):
                    candidate = entry[0][shift:] + entry[0][:shift]
                    maximum_position = maximum_normal = maximum_angle = 0.0
                    for left, right in zip(original, candidate):
                        if any(left[k] != right[k] for k in left if k not in ("POSITION", "NORMAL")):
                            break
                        position = math.dist(left["POSITION"], right["POSITION"])
                        normal = math.dist(left["NORMAL"], right["NORMAL"])
                        if position > POSITION_TOLERANCE_M or normal > NORMAL_TOLERANCE:
                            break
                        dot = sum(a * b for a, b in zip(left["NORMAL"], right["NORMAL"]))
                        lengths = math.sqrt(sum(x * x for x in left["NORMAL"]) * sum(x * x for x in right["NORMAL"]))
                        angle = math.degrees(math.acos(max(-1, min(1, dot / lengths))))
                        maximum_position = max(maximum_position, position)
                        maximum_normal = max(maximum_normal, normal)
                        maximum_angle = max(maximum_angle, angle)
                    else:
                        score = maximum_position / POSITION_TOLERANCE_M + maximum_normal / NORMAL_TOLERANCE
                        if best is None or score < best[0]:
                            best = (score, entry, maximum_position, maximum_normal, maximum_angle)
            if best is None:
                unmatched += 1
                continue
            best[1][1] -= 1
            result["maxPositionDisplacementM"] = max(result["maxPositionDisplacementM"], best[2])
            result["maxNormalVectorDelta"] = max(result["maxNormalVectorDelta"], best[3])
            result["maxNormalAngleDegrees"] = max(result["maxNormalAngleDegrees"], best[4])
    remaining = sum(entry[1] for entries in buckets.values() for entry in entries)
    require(not unmatched and not remaining, f"Oriented topology/material/UV/weight preservation failed or drift exceeds tolerance: {unmatched} unmatched old, {remaining} unmatched new; {result}")
    result["orientedTrianglesAndFixedAttributesPreserved"] = True
    return result


def geometry_bytes(asset, key, head_only=False):
    """Attributed referenced geometry payload, excluding headers/animation/images."""
    total = 0
    head = [asset.g["nodes"][i]["name"] for i in asset.g["skins"][0]["joints"]].index("head")
    for primitive in asset.primitives(key):
        attrs = primitive["attributes"]
        indices = [v[0] for v in asset.values(primitive["indices"])]
        selected = []
        joints, weights = asset.values(attrs["JOINTS_0"]), asset.values(attrs["WEIGHTS_0"])
        for i in range(0, len(indices), 3):
            triangle = indices[i:i + 3]
            if not head_only or all(any(j == head and w > 0 for j, w in zip(joints[v], weights[v])) for v in triangle):
                selected.extend(triangle)
        def width(index):
            a = asset.g["accessors"][index]
            return struct.calcsize(COMPONENT_FORMAT[a["componentType"]]) * ARITY[a["type"]]
        total += len(set(selected)) * sum(width(index) for index in attrs.values()) + len(selected) * width(primitive["indices"])
    return total


def png(raw):
    require(raw[:8] == b"\x89PNG\r\n\x1a\n", "Invalid PNG")
    width, height, depth, color, compression, filtering, interlace = struct.unpack_from(">IIBBBBB", raw, 16)
    require((depth, color, compression, filtering, interlace) == (8, 6, 0, 0, 0), "Expected non-interlaced RGBA8 atlas")
    offset, compressed = 8, bytearray()
    while offset < len(raw):
        size = struct.unpack_from(">I", raw, offset)[0]
        kind, content = raw[offset + 4:offset + 8], raw[offset + 8:offset + 8 + size]
        require(zlib.crc32(kind + content) == struct.unpack_from(">I", raw, offset + 8 + size)[0], "PNG CRC mismatch")
        if kind == b"IDAT":
            compressed.extend(content)
        offset += size + 12
    packed, stride = zlib.decompress(compressed), width * 4
    require(len(packed) == (stride + 1) * height, "PNG pixel buffer mismatch")
    output, previous = bytearray(), bytearray(stride)
    for y in range(height):
        kind = packed[y * (stride + 1)]
        require(0 <= kind <= 4, "Unsupported PNG filter")
        row = bytearray(packed[y * (stride + 1) + 1:(y + 1) * (stride + 1)])
        for x in range(stride):
            left, up, corner = row[x - 4] if x >= 4 else 0, previous[x], previous[x - 4] if x >= 4 else 0
            if kind == 1: predictor = left
            elif kind == 2: predictor = up
            elif kind == 3: predictor = (left + up) // 2
            elif kind == 4:
                p = left + up - corner
                predictor = min(((abs(p - left), 0, left), (abs(p - up), 1, up), (abs(p - corner), 2, corner)))[2]
            else: predictor = 0
            row[x] = (row[x] + predictor) & 255
        output.extend(row)
        previous = row
    return width, height, bytes(output)


def linear(hex_color):
    def channel(value):
        return value / 12.92 if value < .04045 else ((value + .055) / 1.055) ** 2.4
    return [channel(int(hex_color[i:i + 2], 16) / 255) for i in (1, 3, 5)]


def atlas_check(asset, candidate):
    images = asset.g.get("images", [])
    require(len(images) == 7, f"Expected exactly seven embedded atlases; found {len(images)}")
    report = {}
    for role in ROLES:
        materials = [(i, m) for i, m in enumerate(asset.g["materials"]) if m.get("name") == "crew.face." + role]
        require(len(materials) == 1, f"Missing/duplicate face material {role}")
        material_id, material = materials[0]
        info = material.get("pbrMetallicRoughness", {}).get("baseColorTexture")
        require(info is not None, f"Missing texture binding for {role}")
        texture = asset.g["textures"][info["index"]]
        raw = asset.image(texture["source"])
        width, height, pixels = png(raw)
        require((width, height) == (1024, 64), f"{role}: expected 16 x 64px cells")
        require(png((candidate / "textures" / (role + ".png")).read_bytes()) == (width, height, pixels), f"{role}: exported pixels differ from editable atlas")
        require(images[texture["source"]].get("name") == role, f"Wrong atlas image bound to {role}")
        meta = material.get("extras", {}).get("faceAtlas", {})
        require(meta == {"columns": 16, "cellPixels": 64, "role": role}, f"{role}: atlas metadata mismatch")
        require(material.get("alphaMode") in ("BLEND", "MASK"), f"{role}: opaque face rectangle")
        sampler = asset.g["samplers"][texture["sampler"]]
        require(sampler.get("magFilter") == 9728 and sampler.get("minFilter") in (9728, 9984, 9986), f"{role}: atlas does not use nearest pixel sampling")
        transform_info = info.get("extensions", {}).get("KHR_texture_transform", {})
        require(not transform_info or all(k == "texCoord" for k in transform_info), f"{role}: unexpected atlas transform")
        uv_channel = transform_info.get("texCoord", info.get("texCoord", 0))
        uses, uv_ranges = 0, []
        for mesh in asset.g["meshes"]:
            for primitive in mesh["primitives"]:
                if primitive.get("material") != material_id:
                    continue
                name = "TEXCOORD_" + str(uv_channel)
                require(name in primitive["attributes"], f"{role}: selected UV channel {name} is absent")
                uv = asset.values(primitive["attributes"][name])
                bounds = [min(v[0] for v in uv), max(v[0] for v in uv), min(v[1] for v in uv), max(v[1] for v in uv)]
                require(all(abs(x - y) < 1e-6 for x, y in zip(bounds, [0, 1 / 16, 0, 1])), f"{role}: selected {name} does not span the first complete atlas cell: {bounds}")
                indices = [v[0] for v in asset.values(primitive["indices"])]
                for i in range(0, len(indices), 3):
                    a, b, c = (uv[j] for j in indices[i:i + 3])
                    area = abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]))
                    require(area > 1e-9, f"{role}: collapsed selected UV triangle")
                uses += 1
                uv_ranges.append(bounds)
        expected_uses = 2 if asset.path.name == "modular-crew.glb" else 1
        require(uses == expected_uses, f"{role}: expected {expected_uses} facial surfaces, found {uses}")
        factor = material.get("pbrMetallicRoughness", {}).get("baseColorFactor", [1, 1, 1, 1])
        expected = [v * {"iris": 1, "brows": .5, "facialHair": .72}[role] for v in linear("#754c2b" if role == "iris" else "#353047")] + [1] if role in ("iris", "brows", "facialHair") else [1, 1, 1, 1]
        require(all(abs(a - b) < 2e-6 for a, b in zip(factor, expected)), f"{role}: exported baseColorFactor {factor} does not preserve authored tint {expected}")
        cells = []
        for cell in range(16):
            tile = b"".join(pixels[(y * width + cell * 64) * 4:(y * width + (cell + 1) * 64) * 4] for y in range(64))
            cells.append({"index": cell, "sha256": digest(tile), "nontransparentPixels": sum(a > 0 for a in tile[3::4])})
        require(any(c["nontransparentPixels"] for c in cells), f"{role}: completely blank atlas")
        count = 4 if role == "age" else 10 if role == "detail" else 8
        require(all(c["nontransparentPixels"] == 0 for c in cells[count:]), f"{role}: undeclared cells contain art")
        report[role] = {"imageSha256": digest(raw), "pixelSha256": digest(pixels), "dimensions": [width, height],
                        "uvChannel": uv_channel, "uvBounds": uv_ranges, "baseColorFactor": factor,
                        "alphaMode": material["alphaMode"], "sampler": sampler, "cells": cells}
    require(len({row["imageSha256"] for row in report.values()}) == 7, "Atlas roles alias identical images")
    return report


def valid_data(asset):
    require(asset.g.get("extensionsRequired", []) == [], "Compressed/required extensions need explicit validation")
    for i in range(len(asset.g["accessors"])):
        require(all(math.isfinite(v) for row in asset.values(i) for v in row), f"Non-finite accessor {i}")
    triangles = vertices = 0
    for mesh in asset.g["meshes"]:
        for primitive in mesh["primitives"]:
            attrs = primitive["attributes"]
            require(set(("POSITION", "NORMAL", "JOINTS_0", "WEIGHTS_0")) <= attrs.keys(), "Missing skinned surface attribute")
            size = len(asset.values(attrs["POSITION"]))
            require(all(len(asset.values(i)) == size for i in attrs.values()), "Attribute vertex counts differ")
            require(all(abs(sum(x * x for x in row) - 1) < .015 for row in asset.values(attrs["NORMAL"])), "Non-unit normals")
            require(all(all(0 <= w <= 1 for w in row) and abs(sum(row) - 1) < 1e-5 for row in asset.values(attrs["WEIGHTS_0"])), "Invalid normalized skin weights")
            require(all(all(0 <= j < 16 and int(j) == j for j in row) for row in asset.values(attrs["JOINTS_0"])), "Invalid skin joint index")
            require(primitive.get("mode", 4) == 4, "Non-triangle mode")
            indices = asset.values(primitive["indices"])
            require(len(indices) % 3 == 0 and all(0 <= row[0] < size and int(row[0]) == row[0] for row in indices), "Invalid triangle indices")
            triangles += len(indices) // 3
            vertices += size
    return {"accessors": len(asset.g["accessors"]), "vertices": vertices, "triangles": triangles, "bytes": len(asset.raw), "sha256": digest(asset.raw)}


def head_width(asset, body, low, high):
    points = []
    head = [asset.g["nodes"][i]["name"] for i in asset.g["skins"][0]["joints"]].index("head")
    for primitive in asset.primitives("base-" + body + "-core"):
        if asset.g["materials"][primitive["material"]]["name"] != "crew.skin.modular":
            continue
        attrs = primitive["attributes"]
        for position, joints, weights in zip(*(asset.values(attrs[k]) for k in ("POSITION", "JOINTS_0", "WEIGHTS_0"))):
            if low <= position[1] <= high and any(j == head and w > 0 for j, w in zip(joints, weights)):
                points.append(position)
    require(points, f"No head skin samples in {low}..{high}m")
    return max(p[0] for p in points) - min(p[0] for p in points)


def validate(candidate):
    report = {"schema": 1, "passed": False, "candidate": str(candidate.relative_to(ROOT)),
              "validator": {"path": str(Path(__file__).resolve().relative_to(ROOT)), "sha256": digest(Path(__file__).read_bytes())},
              "baseline": {"path": str(BASE.relative_to(ROOT)), "files": PINS}, "checks": {}, "errors": [],
              "scope": "Decoded exported surfaces, rig, clips, atlases and catalog metadata. Optional --native adds a separately recorded read-only native object comparison. Visible fit, texture readability, animation playback and GPU performance require separate review.",
              "ownerFinalSignoff": None}

    def check(name, operation):
        try:
            result = operation()
            report["checks"][name] = {"passed": True, "evidence": result}
            return result
        except Exception as error:
            report["checks"][name] = {"passed": False, "error": str(error)}
            report["errors"].append(f"{name}: {error}")
            return None

    for name, expected in PINS.items():
        require(digest((BASE / name).read_bytes()) == expected, f"Pinned r008 baseline changed: {name}")
    baseline = Glb(BASE / "modular-crew.glb")
    original_manifest = json.loads((BASE / "manifest.json").read_text())
    manifest = json.loads((candidate / "manifest.json").read_text())
    expected_files = {"modular-crew.glb", "base-male.glb", "base-female.glb", *("hair-" + style + ".glb" for style in HAIR)}
    check("elevenStandaloneAndCombinedFiles", lambda: require({p.name for p in candidate.glob("*.glb")} == expected_files, "Expected exactly one combined, two base and eight hair GLBs"))
    files = {name: check("read/" + name, lambda name=name: Glb(candidate / name)) for name in sorted(expected_files)}
    # Glb objects are internal only; replace the read evidence with file identity.
    for name, asset in files.items():
        if asset:
            report["checks"]["read/" + name]["evidence"] = {"sha256": digest(asset.raw), "bytes": len(asset.raw)}
    combined = files.get("modular-crew.glb")
    require(combined is not None, "Missing readable combined GLB")
    old_rig, old_clips = baseline.rig(), baseline.clips()
    require(len(old_clips) == 12, "Pinned baseline must have twelve clips")
    for name, asset in files.items():
        if not asset:
            continue
        check("data/" + name, lambda asset=asset: valid_data(asset))
        check("rig/" + name, lambda asset=asset: require(asset.rig() == old_rig, "Joint names, hierarchy, rest transforms or inverse binds changed"))
        if name.startswith("hair-"):
            check("clips/" + name, lambda asset=asset: require(not asset.clips(), "Static hair unexpectedly contains animation clips"))
        else:
            check("clips/" + name, lambda asset=asset: require(asset.clips() == old_clips, "Original twelve clips/channels/samplers changed"))
            check("atlases/" + name, lambda asset=asset: atlas_check(asset, candidate))

    def contracts():
        for key in ("rig", "sets", "hairStyles", "baseGroups", "components"):
            require(manifest[key] == original_manifest[key], f"Catalog {key} changed")
        require(manifest["revision"] == 9 and manifest["parentSourceSha256"] == PINS["blender-source.blend"], "Incorrect revision/source provenance")
        require(manifest["facialAtlas"]["columns"] == 16 and manifest["facialAtlas"]["cellPixels"] == 64, "Atlas layout mismatch")
        require(all(manifest["facialAtlas"][key] == value for key, value in ENUMS.items()), "Atlas enum order mismatch")
        require(set(combined.components) == set(baseline.components), "Component identity set changed")
        rows = original_manifest["components"]
        require(len(rows) == 91 and sum(row["id"] != "medic-open-comms" for row in rows) == 90, "Expected 90 inventory definitions and retained draft comms")
        return {"inventoryEquipmentIds": 90, "additionalRetainedDraft": "medic-open-comms", "totalVisualGroups": len(combined.components)}
    check("catalogAndIdentityPreservation", contracts)

    def preserve(key, below=False):
        require(baseline.placement(baseline.components[key]) == combined.placement(combined.components[key]), f"{key}: mesh/ancestor placement transform changed")
        before = geometry(baseline, key, below_head=below, material=not below)
        after = geometry(combined, key, below_head=below, material=not below)
        return compare_surfaces(before, after)
    for row in original_manifest["components"]:
        check("equipment/" + row["id"], lambda row=row: preserve(row["id"]))
    def skin_material():
        def find(asset):
            return next(asset.material(i) for i, m in enumerate(asset.g["materials"]) if m["name"] == "crew.skin.modular")
        require(find(baseline) == find(combined), "Shared skin material changed below the authored head region")
        return find(combined)
    check("unchangedSharedSkinMaterial", skin_material)
    for body in ("male", "female"):
        for key in original_manifest["baseGroups"][body]:
            check("belowHead/" + key, lambda key=key: preserve(key, True))
        standalone = files.get("base-" + body + ".glb")
        if standalone:
            def base_matches(body=body, standalone=standalone):
                keys = set(original_manifest["baseGroups"][body])
                require(set(standalone.components) == keys, "Standalone base contains wrong groups")
                for key in keys:
                    require(standalone.placement(standalone.components[key]) == combined.placement(combined.components[key]), f"{key}: standalone placement changed")
                    require(geometry(standalone, key) == geometry(combined, key), f"{key}: standalone surfaces differ")
            check("standalone/base-" + body, base_matches)
    costs = {}
    for style in HAIR:
        key = "hair-" + style
        standalone = files.get(key + ".glb")
        if standalone:
            def hair_matches(key=key, standalone=standalone):
                require(set(standalone.components) == {key}, "Standalone hair contains wrong groups")
                require(standalone.placement(standalone.components[key]) == combined.placement(combined.components[key]), "Standalone hair placement changed")
                require(geometry(standalone, key) == geometry(combined, key), "Standalone hair differs from combined mesh")
            check("standalone/" + key, hair_matches)
        old_count = sum(geometry(baseline, key).values())
        new_count = sum(geometry(combined, key).values())
        costs[key] = {"beforeTriangles": old_count, "afterTriangles": new_count, "ratio": new_count / old_count,
                      "beforeGeometryPayloadBytes": geometry_bytes(baseline, key), "afterGeometryPayloadBytes": geometry_bytes(combined, key),
                      "beforeStandaloneBytes": (BASE / (key + ".glb")).stat().st_size if (BASE / (key + ".glb")).exists() else None,
                      "afterStandaloneBytes": len(standalone.raw) if standalone else None}
    for body in ("male", "female"):
        key = "base-" + body + "-core"
        old_count = sum(geometry(baseline, key, head_only=True).values())
        new_count = sum(geometry(combined, key, head_only=True).values())
        costs[body + "-head"] = {"beforeTriangles": old_count, "afterTriangles": new_count, "ratio": new_count / old_count,
                                 "beforeGeometryPayloadBytes": geometry_bytes(baseline, key, True), "afterGeometryPayloadBytes": geometry_bytes(combined, key, True),
                                 "beforeBaseStandaloneBytes": (BASE / ("base-" + body + ".glb")).stat().st_size,
                                 "afterBaseStandaloneBytes": len(files["base-" + body + ".glb"].raw)}
    report["costs"] = {"parts": costs, "combinedBytes": {"before": len(baseline.raw), "after": len(combined.raw), "delta": len(combined.raw) - len(baseline.raw)},
                       "combinedTriangles": {"before": valid_data(baseline)["triangles"], "after": valid_data(combined)["triangles"]},
                       "note": "Triangle/export-byte costs only; no GPU frame-time or draw-call acceptance. Unchanged-style r008 standalone hair files absent from its candidate are reported as null."}

    def proportions():
        result = {}
        for label, band, expected in (("upperHead", (1.62, 1.73), .98), ("jaw", (1.314, 1.319), .94)):
            widths = {body: head_width(combined, body, *band) for body in ("male", "female")}
            ratio = widths["female"] / widths["male"]
            require(abs(ratio - expected) <= .003, f"{label}: female/male width ratio {ratio}, expected {expected} ±0.003")
            result[label] = {"sampleHeightBandM": band, "widthM": widths, "femaleToMaleRatio": ratio,
                             "targetRatio": expected, "absoluteRatioTolerance": .003}
        return result
    check("femaleHeadAndJawProportions", proportions)
    report["nativeSourceSha256"] = digest((candidate / "blender-source.blend").read_bytes())
    preservation = [row["evidence"] for name, row in report["checks"].items() if row["passed"] and name.startswith(("equipment/", "belowHead/"))]
    report["exportPrecision"] = {"exactDecodedGroups": sum(row["exactDecodedEquality"] for row in preservation),
                                "groupsWithinExplicitRoundoffAllowance": sum(not row["exactDecodedEquality"] for row in preservation),
                                "maxPositionDisplacementM": max((row["maxPositionDisplacementM"] for row in preservation), default=0),
                                "maxNormalVectorDelta": max((row["maxNormalVectorDelta"] for row in preservation), default=0),
                                "maxNormalAngleDegrees": max((row["maxNormalAngleDegrees"] for row in preservation), default=0),
                                "allowanceReason": "Integration owner explicitly permits Blender rejoin/export position drift <=1e-6m and normal-vector drift <=5e-4; materials, UVs, weights and oriented topology stay exact. This is not byte-identical exported geometry."}
    report["passed"] = not report["errors"]
    return report


def native_worker(candidate, output):
    """Runs only inside Blender, opening both sources read-only, without saving."""
    import bpy
    require(digest((BASE / "blender-source.blend").read_bytes()) == PINS["blender-source.blend"], "Native source pin changed")
    require(not output.exists(), "Refuse to overwrite native evidence")
    catalog = json.loads((BASE / "manifest.json").read_text())
    equipment = {row["id"] for row in catalog["components"]}
    keys = equipment | {key for group in catalog["baseGroups"].values() for key in group}

    def collect(path):
        bpy.ops.wm.open_mainfile(filepath=str(path), load_ui=False, use_scripts=False)
        result = {}
        for obj in bpy.data.objects:
            key = obj.get("component_id")
            if obj.type != "MESH" or key not in keys:
                continue
            head_index = next((g.index for g in obj.vertex_groups if g.name == "head"), None)
            if key in ("base-male-core", "base-female-core") and head_index is not None:
                if any(any(g.group == head_index and g.weight > 0 for g in vertex.groups) for vertex in obj.data.vertices):
                    continue
            mesh = obj.data
            positions = [tuple(vertex.co) for vertex in mesh.vertices]
            normals = [tuple(normal.vector) for normal in mesh.corner_normals]
            geometry_data = {
                "positions": positions, "cornerNormals": normals,
                "polygons": [(tuple(face.vertices), face.material_index, face.use_smooth) for face in mesh.polygons],
                "weights": [[(obj.vertex_groups[group.group].name, group.weight) for group in vertex.groups] for vertex in mesh.vertices],
                "uv": {layer.name: [tuple(v.uv) for v in layer.data] for layer in mesh.uv_layers},
                "materialSlots": [m.name if m else None for m in mesh.materials],
                "matrixBasis": [tuple(row) for row in obj.matrix_basis],
                "matrixParentInverse": [tuple(row) for row in obj.matrix_parent_inverse],
                "parent": obj.parent.name if obj.parent else None,
                "modifiers": [(m.name, m.type, m.object.name if m.type == "ARMATURE" and m.object else None,
                               m.show_viewport, m.show_render) for m in obj.modifiers],
            }
            material_data = []
            for material in mesh.materials:
                values = {"name": material.name, "diffuse": tuple(material.diffuse_color),
                          "surfaceRenderMethod": material.surface_render_method, "nodes": []}
                if material.use_nodes:
                    for node in material.node_tree.nodes:
                        inputs = {}
                        for socket in node.inputs:
                            value = getattr(socket, "default_value", None)
                            if value is None or isinstance(value, (str, bool, int, float)):
                                inputs[socket.identifier] = value
                            elif hasattr(value, "__iter__"):
                                inputs[socket.identifier] = tuple(value)
                        values["nodes"].append((node.name, node.type, inputs))
                    values["links"] = sorted((link.from_node.name, link.from_socket.identifier,
                                               link.to_node.name, link.to_socket.identifier) for link in material.node_tree.links)
                material_data.append(values)
            result[obj.name] = {"componentId": key, "geometrySha256": digest(canonical(geometry_data).encode()),
                                "materialsSha256": digest(canonical(material_data).encode()),
                                "positions": positions, "normals": normals,
                                "vertices": len(mesh.vertices), "polygons": len(mesh.polygons)}
        return result

    before = collect(BASE / "blender-source.blend")
    after = collect(candidate / "blender-source.blend")
    errors = []
    if set(before) != set(after):
        errors.append({"missingObjects": sorted(set(before) - set(after)), "addedObjects": sorted(set(after) - set(before))})
    max_position = max_normal = 0.0
    summaries = {}
    for name in sorted(set(before) & set(after)):
        old, new = before[name], after[name]
        same_geometry = old["geometrySha256"] == new["geometrySha256"]
        same_materials = old["materialsSha256"] == new["materialsSha256"]
        if len(old["positions"]) == len(new["positions"]):
            max_position = max(max_position, max((math.dist(a, b) for a, b in zip(old["positions"], new["positions"])), default=0))
        if len(old["normals"]) == len(new["normals"]):
            max_normal = max(max_normal, max((math.dist(a, b) for a, b in zip(old["normals"], new["normals"])), default=0))
        if not same_geometry or not same_materials:
            errors.append({"object": name, "geometryExact": same_geometry, "materialsExact": same_materials})
        summaries.setdefault(old["componentId"], {"objects": 0, "vertices": 0, "polygons": 0})
        row = summaries[old["componentId"]]
        for field in ("vertices", "polygons"):
            row[field] += old[field]
        row["objects"] += 1
    missing_equipment = equipment - set(summaries)
    if missing_equipment:
        errors.append({"missingEquipmentComponents": sorted(missing_equipment)})
    report = {"passed": not errors, "errors": errors, "sourceSha256": PINS["blender-source.blend"],
              "candidateSha256": digest((candidate / "blender-source.blend").read_bytes()),
              "objectsCompared": len(set(before) & set(after)), "components": summaries,
              "maxNativeVertexDisplacementM": max_position, "maxNativeCornerNormalDelta": max_normal,
              "method": "Read-only Blender source comparison by stable object name: exact original mesh coordinates, corner normals, oriented polygons/material slots, UV layers, named skin weights, local/parent matrices, modifier settings and material shader inputs/links. Head-bound base objects and authored hair excluded; no source file saved.",
              "ownerFinalSignoff": None}
    with output.open("x") as stream:
        stream.write(json.dumps(report, indent=2, allow_nan=False) + "\n")
    return 0 if report["passed"] else 1


def run_native(candidate, report_name):
    sys.path.insert(0, str(ROOT / "scripts"))
    from dev import CFG
    output = candidate / (Path(report_name).stem + "-native.json")
    require(not output.exists(), "Preserve prior native evidence; choose another --report name")
    command = [CFG["art"]["blender"], "--background", "--threads", "2", "--factory-startup",
               "--python-exit-code", "1", "--python", str(Path(__file__).resolve()), "--",
               "--native-worker", str(candidate), str(output)]
    result = subprocess.run(command, capture_output=True, text=True, timeout=180, cwd=ROOT)
    require(output.exists(), "Native inspection failed: " + result.stdout[-2000:] + result.stderr[-2000:])
    evidence = json.loads(output.read_text())
    evidence["path"] = str(output.relative_to(ROOT))
    evidence["processExitCode"] = result.returncode
    return evidence


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("candidate", type=Path)
    parser.add_argument("--report", default="faces-validation.json", help="New report basename inside candidate; existing evidence is never overwritten")
    parser.add_argument("--native", action="store_true", help="Also compare untouched editable Blender objects read-only using the configured managed Blender binary")
    args = parser.parse_args()
    candidate = args.candidate.resolve()
    require(candidate.is_relative_to(REVISION / "r009") and candidate.is_dir(), "Expected an existing r009 candidate directory")
    require(Path(args.report).name == args.report and args.report.endswith(".json"), "Report must be a JSON basename")
    output = candidate / args.report
    require(not output.exists(), "Preserve prior validation: select a new --report name")
    try:
        report = validate(candidate)
        if args.native:
            native = run_native(candidate, args.report)
            report["checks"]["nativePreservation"] = {"passed": native["passed"], "evidence": native}
            if not native["passed"]:
                report["errors"].append("nativePreservation: unchanged native objects or materials differ; see native evidence")
            report["passed"] = not report["errors"]
    except Exception as error:
        report = {"passed": False, "candidate": str(candidate.relative_to(ROOT)), "errors": [str(error)], "ownerFinalSignoff": None}
    with output.open("x") as stream:
        stream.write(json.dumps(report, indent=2, allow_nan=False) + "\n")
    print(json.dumps({"passed": report["passed"], "report": str(output.relative_to(ROOT)), "errors": report.get("errors", []), "costs": report.get("costs")}, indent=2))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    if "--native-worker" in sys.argv:
        index = sys.argv.index("--native-worker")
        sys.exit(native_worker(Path(sys.argv[index + 1]), Path(sys.argv[index + 2])))
    sys.exit(main())
