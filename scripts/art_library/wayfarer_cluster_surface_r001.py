"""Pinned Wayfarer cluster bevel/chart method pilot; JSON dry run only.

Use the configured npm/art runner. This leaf never exports meshes, images, blend
files, or runtime selectors. The external study and its immutable source snapshot
remain read-only. A successful receipt qualifies chart preparation, not a bake,
MikkTSpace export, native appearance, performance, or default migration.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import contextlib
import hashlib
import inspect
import io
import json
import math
from pathlib import Path
import subprocess
import sys
import time
import tomllib

# The pinned procedural snapshot is a read-only input, including its directories.
# Never create __pycache__ there; existing cache files are not deleted or changed.
sys.dont_write_bytecode = True

ROOT = Path(__file__).resolve().parents[2]
PIECE = "hull.bay.cluster.light.navy.louvre.w3.000.s0.k-2.35"
SNAPSHOT_SHA = "460e8546d835ae2e9549b57465f0922623a3da8ab4c236bb0031281e60d26de8"
CAPTURE_SHA = "8949456baa8ec37af5fb01937e8b3fa3b3e465fee856f60224c6b46c357ce882"
SOURCE_COMMIT = "271a9fa176161a1ce00bc7571ba1db7ad52e02dd"
SELECTED = {9: "secondary", 25: "secondary", 123: "secondary", 128: "secondary",
            130: "secondary", 12: "trim", 43: "trim", 83: "trim", 117: "trim",
            122: "trim", 127: "trim", 19: "dark", 27: "dark", 105: "dark", 120: "primary"}
PRIMITIVES = {"box", "_sharp_box", "prism", "cyl", "prism_x"}
STAGES = {"backer": "backer", "_flush_keel": "keel", "keel": "keel",
          "upper": "upper", "_rim": "rim", "rim": "rim", "m_cluster": "main",
          "_fill_backing": "main"}
ATLAS_SIZE = 512
PIXELS_PER_METRE = 96
GUTTER = 8
AREA_EPSILON_M2 = 1e-12
JACOBIAN_EPSILON = 1e-14
GROUP_FIELDS = ("id", "operation", "stage", "sourceMaterial", "vertices", "faces",
                "loopNormals", "loopUVs", "bounds")


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def canonical(value) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()


def value_digest(value) -> str:
    return hashlib.sha256(canonical(value)).hexdigest()


def snapshot_pins(snapshot: Path) -> dict:
    receipt = snapshot / "SHA256.json"
    if digest(receipt) != SNAPSHOT_SHA:
        raise ValueError("Unknown completed-source snapshot")
    pins = json.loads(receipt.read_text())["files"]
    for name, pin in pins.items():
        path = (snapshot / name).resolve()
        if not path.is_relative_to(snapshot) or path.stat().st_size != pin["bytes"] or digest(path) != pin["sha256"]:
            raise ValueError("Changed/escaping source input: " + name)
    return pins


def source_stack(snapshot: Path) -> list[dict]:
    result = []
    frame = inspect.currentframe().f_back
    while frame:
        file = Path(frame.f_code.co_filename)
        if file.is_relative_to(snapshot / "src"):
            result.append({"file": str(file.relative_to(snapshot)), "function": frame.f_code.co_name,
                           "line": frame.f_lineno})
        frame = frame.f_back
    return result


def plain(value):
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return [[float(x) for x in row] for row in value]


def build(snapshot: Path, changed_calls: set[int]) -> dict:
    """Observe actual _add identities; fitting and merging keep their co arrays."""
    import numpy as np
    from sr.mb import MB
    from sr import kit_hull as K, mats

    original_add, original_box = MB._add, MB.box
    signature = inspect.signature(original_box)
    chunks, box_calls, active_box = {}, [], []
    creation_count = 0

    def observed_box(self, *args, **kwargs):
        bound = signature.bind(self, *args, **kwargs)
        bound.apply_defaults()
        ordinal = len(box_calls)
        original_args = {name: plain(value) for name, value in bound.arguments.items() if name != "self"}
        if ordinal in changed_calls:
            if bound.arguments["seg"] != 2 or bound.arguments["r"] <= 1e-5:
                raise ValueError("Selected call is not an original two-segment rounded box")
            bound.arguments["seg"] = 1
        record = {"boxCallOrdinal": ordinal, "originalArguments": original_args,
                  "effectiveArguments": {name: plain(value) for name, value in bound.arguments.items() if name != "self"},
                  "sourceStack": source_stack(snapshot)}
        box_calls.append(record)
        active_box.append(record)
        try:
            return original_box(*bound.args, **bound.kwargs)
        finally:
            active_box.pop()

    def observed_add(self, *args, **kwargs):
        nonlocal creation_count
        ordinal = creation_count
        creation_count += 1
        before = len(self.verts)
        original_add(self, *args, **kwargs)
        stack = source_stack(snapshot)
        primitive = next((s["function"] for s in stack if s["function"] in PRIMITIVES), None)
        stage = next((STAGES[s["function"]] for s in stack if s["function"] in STAGES), None)
        if primitive is None or stage is None or len(self.verts) != before + 1:
            raise ValueError("Unclassified/non-single source primitive: " + json.dumps(stack))
        co = self.verts[before]
        if id(co) in chunks:
            raise ValueError("Reused primitive array identity")
        # Retain even discarded scratch arrays: Python may otherwise reuse an id
        # after a source rollback, obscuring the original creation ordinal.
        chunks[id(co)] = {"array": co, "operation": primitive, "stage": stage, "creationOrdinal": ordinal,
                          "boxCall": active_box[-1] if active_box else None}

    MB._add, MB.box = observed_add, observed_box
    log = io.StringIO()
    mb = MB(PIECE)
    try:
        with contextlib.redirect_stdout(log):
            K.bay(mb, 3, main="cluster", up="light", rim_kind="navy", keel_kind="louvre", seed=0, z_bot=-2.35)
    finally:
        MB._add, MB.box = original_add, original_box
    messages = log.getvalue()
    if any(x in messages.lower() for x in ("falling back", "using the built-in", "failed", "error")):
        raise ValueError("Unexpected builder fallback: " + messages)

    groups, base, face_at, face_owners = [], 0, 0, []
    for index, co in enumerate(mb.verts):
        info = chunks.get(id(co))
        if info is None:
            raise ValueError("Primitive identity lost after fit/merge/rollback")
        end = base + len(co)
        faces, materials = [], []
        while face_at < len(mb.faces) and min(mb.faces[face_at]) >= base:
            face = mb.faces[face_at]
            if min(face) >= end:
                break
            if max(face) >= end:
                raise ValueError("Face crosses separate source solids")
            faces.append([v - base for v in face])
            materials.append(mb.slots[mb.face_mat[face_at]])
            face_owners.append(index)
            face_at += 1
        if (not faces or not np.isfinite(co).all() or len(set(materials)) != 1
                or not np.isfinite(mb.loop_normals[index]).all() or not np.isfinite(mb.loop_uvs[index]).all()
                or len(mb.loop_normals[index]) != sum(map(len, faces))
                or len(mb.loop_uvs[index]) != sum(map(len, faces))):
            raise ValueError("Empty/nonfinite/mixed-material solid")
        directed = Counter((f[j], f[(j + 1) % len(f)]) for f in faces for j in range(len(f)))
        if any(n != 1 or directed[(b, a)] != 1 for (a, b), n in directed.items()):
            raise ValueError("Nonclosed/inconsistent source winding")
        centre = co.mean(axis=0)
        volume = sum(float(np.dot(co[f[0]] - centre, np.cross(co[f[j]] - centre, co[f[j + 1]] - centre))) / 6
                     for f in faces for j in range(1, len(f) - 1))
        if not math.isfinite(volume) or volume <= 0:
            raise ValueError("Nonpositive source solid volume")
        groups.append({"id": f"{PIECE}:solid:{index}", "operation": info["operation"], "stage": info["stage"],
                       "sourceMaterial": materials[0], "vertices": co.tolist(), "faces": faces,
                       "loopNormals": mb.loop_normals[index].tolist(), "loopUVs": mb.loop_uvs[index].tolist(),
                       "bounds": [*co.min(axis=0).tolist(), *co.max(axis=0).tolist()],
                       "creationOrdinal": info["creationOrdinal"], "boxCall": info["boxCall"],
                       "positiveSignedVolumeMeters3": volume})
        base = end
    if base != mb.nv or face_at != len(mb.faces) or len(face_owners) != len(mb.faces):
        raise ValueError("Incomplete final group/face census")

    mesh_log = io.StringIO()
    with contextlib.redirect_stdout(mesh_log):
        mesh = mb.mesh(mats.build_library("federation"))
    if mesh_log.getvalue():
        raise ValueError("Unexpected source mesh/material warning: " + mesh_log.getvalue())
    mesh.calc_loop_triangles()
    triangles = []
    for t in mesh.loop_triangles:
        triangles.append({"vertices": [list(mesh.vertices[v].co) for v in t.vertices],
                          "normals": [list(mesh.corner_normals[v].vector) for v in t.loops],
                          "uvs": [list(mesh.uv_layers.active.data[v].uv) for v in t.loops],
                          "material": mb.slots[t.material_index], "group": face_owners[t.polygon_index],
                          "vertexIndices": list(t.vertices), "polygonIndex": t.polygon_index})
    return {"groups": groups, "triangles": triangles, "boxCalls": box_calls,
            "creationCount": creation_count, "builderMessages": messages, "fallback": False}


def fields(group: dict) -> dict:
    return {name: group[name] for name in GROUP_FIELDS}


def high_parity(high: dict, capture: dict) -> dict:
    if len(high["groups"]) != 317 or len(capture["groups"]) != 317 or len(high["triangles"]) != 12044:
        raise ValueError("Changed pinned high inventory")
    for index, (actual, expected) in enumerate(zip(high["groups"], capture["groups"])):
        if canonical(fields(actual)) != canonical(fields(expected)):
            raise ValueError(f"High post-fit array/material parity failed at group {index}")
    actual_triangles = [{k: t[k] for k in ("vertices", "normals", "uvs", "material")} for t in high["triangles"]]
    if canonical(actual_triangles) != canonical(capture["sourceTriangles"]):
        raise ValueError("High evaluated source triangle parity failed")
    return {"groups": 317, "triangles": 12044, "postFitGroupArraysExact": True,
            "evaluatedTrianglesExact": True, "groupsSha256": value_digest([fields(g) for g in high["groups"]]),
            "trianglesSha256": value_digest(actual_triangles)}


def selection(high: dict, low: dict) -> list[dict]:
    if len(low["groups"]) != 317 or high["creationCount"] != low["creationCount"]:
        raise ValueError("Low construction inventory changed")
    rows = []
    counts_high = Counter(t["group"] for t in high["triangles"])
    counts_low = Counter(t["group"] for t in low["triangles"])
    triangle_fields = ("vertices", "normals", "uvs", "material")
    triangles_high, triangles_low = defaultdict(list), defaultdict(list)
    for source, target in ((high, triangles_high), (low, triangles_low)):
        for t in source["triangles"]:
            target[t["group"]].append({k: t[k] for k in triangle_fields})
    for index, (a, b) in enumerate(zip(high["groups"], low["groups"])):
        if a["creationOrdinal"] != b["creationOrdinal"] or a["id"] != b["id"]:
            raise ValueError("Creation ordinal/final group mapping changed")
        if index not in SELECTED:
            if (canonical(fields(a)) != canonical(fields(b))
                    or canonical(triangles_high[index]) != canonical(triangles_low[index])):
                raise ValueError(f"Untouched source group changed: {index}")
            continue
        ac, bc = a["boxCall"], b["boxCall"]
        if a["operation"] != "box" or ac is None or bc is None or a["sourceMaterial"] != SELECTED[index]:
            raise ValueError("Selected source operation/material changed")
        expected = {**ac["originalArguments"], "seg": 1}
        if (ac["originalArguments"]["seg"] != 2 or ac["effectiveArguments"] != ac["originalArguments"]
                or bc["originalArguments"] != ac["originalArguments"] or bc["effectiveArguments"] != expected
                or bc["boxCallOrdinal"] != ac["boxCallOrdinal"] or counts_high[index] != 108):
            raise ValueError("Selected call delta is not exclusively seg2 to seg1")
        if a["bounds"] != b["bounds"] or a["stage"] != b["stage"] or a["sourceMaterial"] != b["sourceMaterial"]:
            raise ValueError("Selected original bounds/stage/material changed")
        rows.append({"finalGroup": index, "id": a["id"], "creationOrdinal": a["creationOrdinal"],
                     "boxCallOrdinal": ac["boxCallOrdinal"], "sourceStack": ac["sourceStack"],
                     "originalArguments": ac["originalArguments"], "lowArguments": bc["effectiveArguments"],
                     "highTriangles": counts_high[index], "lowTriangles": counts_low[index],
                     "highArraysSha256": value_digest(fields(a)), "lowArraysSha256": value_digest(fields(b)),
                     "bounds": a["bounds"], "sourceMaterial": a["sourceMaterial"]})
    if len(rows) != 15 or len(high["boxCalls"]) != len(low["boxCalls"]):
        raise ValueError("Incomplete named selection")
    selected_calls = {r["boxCallOrdinal"] for r in rows}
    for a, b in zip(high["boxCalls"], low["boxCalls"]):
        if a["boxCallOrdinal"] not in selected_calls and canonical(a) != canonical(b):
            raise ValueError("Unselected original box call changed")
    return rows


def signed_area(poly: list[list[float]]) -> float:
    return sum(a[0] * b[1] - a[1] * b[0] for a, b in zip(poly, poly[1:] + poly[:1])) / 2


def cross2(a, b) -> float:
    return a[0] * b[1] - a[1] * b[0]


def intersection_area(subject, clip) -> float:
    """Convex triangle intersection in physical chart metres; boundaries have zero area."""
    poly = [list(p) for p in subject]
    for a, b in zip(clip, clip[1:] + clip[:1]):
        edge = [b[k] - a[k] for k in range(2)]
        output = []
        if not poly:
            return 0.0
        p = poly[-1]
        dp = cross2(edge, [p[k] - a[k] for k in range(2)])
        for q in poly:
            dq = cross2(edge, [q[k] - a[k] for k in range(2)])
            if (dp >= 0) != (dq >= 0):
                alpha = dp / (dp - dq)
                output.append([p[k] + alpha * (q[k] - p[k]) for k in range(2)])
            if dq >= 0:
                output.append(q)
            p, dp = q, dq
        poly = output
    return abs(signed_area(poly)) if len(poly) >= 3 else 0.0


def prepare_charts(low: dict) -> list[dict]:
    import numpy as np

    buckets = defaultdict(list)
    for index, t in enumerate(low["triangles"]):
        if t["group"] not in SELECTED:
            continue
        p = np.asarray(t["vertices"], dtype=float)
        cross = np.cross(p[1] - p[0], p[2] - p[0])
        length = float(np.linalg.norm(cross))
        if not math.isfinite(length) or length <= AREA_EPSILON_M2:
            raise ValueError("Degenerate selected evaluated triangle")
        axis = max(range(3), key=lambda a: (abs(float(cross[a])), -a))
        sign = 1 if cross[axis] > 0 else -1
        # Cyclic U,V with signed V gives U cross V the selected outward direction.
        u, v = (axis + 1) % 3, (axis + 2) % 3
        projected = [[float(point[u]), float(point[v]) * sign] for point in p]
        if signed_area(projected) <= AREA_EPSILON_M2:
            raise ValueError("Nonpositive/degenerate projected triangle")
        buckets[(t["group"], axis, sign)].append({"triangle": index, "projection": projected,
                                                 "physicalArea": length / 2})

    charts = []
    for (group, axis, sign), entries in sorted(buckets.items()):
        edges = defaultdict(list)
        neighbours = defaultdict(set)
        for i, entry in enumerate(entries):
            vertices = low["triangles"][entry["triangle"]]["vertexIndices"]
            for a, b in zip(vertices, vertices[1:] + vertices[:1]):
                edges[tuple(sorted((a, b)))].append(i)
        for owners in edges.values():
            if len(owners) > 2:
                raise ValueError("Nonmanifold selected triangle edge")
            if len(owners) == 2:
                a, b = owners
                neighbours[a].add(b)
                neighbours[b].add(a)
        remaining = set(range(len(entries)))
        component = 0
        while remaining:
            todo, indices = [min(remaining)], []
            while todo:
                i = todo.pop()
                if i not in remaining:
                    continue
                remaining.remove(i)
                indices.append(i)
                todo.extend(sorted(neighbours[i], reverse=True))
            items = [entries[i] for i in sorted(indices)]
            all_points = [p for item in items for p in item["projection"]]
            bounds = [min(p[a] for p in all_points) for a in range(2)] + [max(p[a] for p in all_points) for a in range(2)]
            maximum_overlap, summed_overlap = 0.0, 0.0
            positive_overlap_pairs = 0
            for i, a in enumerate(items):
                for b in items[i + 1:]:
                    overlap = intersection_area(a["projection"], b["projection"])
                    maximum_overlap = max(maximum_overlap, overlap)
                    summed_overlap += overlap
                    positive_overlap_pairs += int(overlap > 0)
                    if overlap > AREA_EPSILON_M2:
                        raise ValueError("Noninjective chart: overlapping projected triangle interiors")
            width, height = [math.ceil((bounds[a + 2] - bounds[a]) * PIXELS_PER_METRE) for a in range(2)]
            if width <= 0 or height <= 0:
                raise ValueError("Empty chart extent")
            charts.append({"id": f"solid:{group}:axis:{axis}:sign:{sign}:component:{component}",
                           "group": group, "sourceMaterial": SELECTED[group], "axis": axis, "sign": sign,
                           "boundsMetres": bounds, "contentPixels": [width, height],
                           "paddedPixels": [width + 2 * GUTTER, height + 2 * GUTTER],
                           "physicalAreaMeters2": sum(item["physicalArea"] for item in items),
                           "projectedAreaMeters2": sum(signed_area(item["projection"]) for item in items),
                           "triangles": items, "maximumPairInteriorOverlapAreaMeters2": maximum_overlap,
                           "summedPairInteriorOverlapAreaMeters2": summed_overlap,
                           "positiveInteriorOverlapPairs": positive_overlap_pairs})
            component += 1
    expected = {i for i, t in enumerate(low["triangles"]) if t["group"] in SELECTED}
    admitted = [item["triangle"] for chart in charts for item in chart["triangles"]]
    if set(admitted) != expected or len(admitted) != len(expected):
        raise ValueError("Incomplete/duplicate actual triangle chart coverage")
    return charts


def pack(charts: list[dict]) -> None:
    free = [[0, 0, ATLAS_SIZE, ATLAS_SIZE]]
    ordered = sorted(charts, key=lambda c: (-max(c["paddedPixels"]),
                                          -math.prod(c["paddedPixels"]), c["id"]))
    for chart in ordered:
        width, height = chart["paddedPixels"]
        candidates = [(r[2] * r[3] - width * height, min(r[2] - width, r[3] - height), r[1], r[0], i)
                      for i, r in enumerate(free) if width <= r[2] and height <= r[3]]
        if not candidates:
            raise ValueError("Actual 512 atlas packing does not fit: " + chart["id"])
        index = min(candidates)[-1]
        x, y, fw, fh = free.pop(index)
        chart["rectanglePixels"] = [x, y, width, height]
        # Disjoint guillotine split; no placement rotation changes chart handedness.
        if fw - width > fh - height:
            additions = [[x + width, y, fw - width, fh], [x, y + height, width, fh - height]]
        else:
            additions = [[x + width, y, fw - width, height], [x, y + height, fw, fh - height]]
        free.extend(r for r in additions if r[2] > 0 and r[3] > 0)
    for i, a in enumerate(charts):
        x, y, w, h = a["rectanglePixels"]
        if min(x, y) < 0 or x + w > ATLAS_SIZE or y + h > ATLAS_SIZE:
            raise ValueError("Out-of-bounds atlas rectangle")
        for b in charts[i + 1:]:
            X, Y, W, H = b["rectanglePixels"]
            if x < X + W and X < x + w and y < Y + H and Y < y + h:
                raise ValueError("Overlapping padded atlas rectangles")


def chart_jacobians(charts: list[dict], low: dict) -> None:
    import numpy as np

    for chart in charts:
        x, y, _, _ = chart["rectanglePixels"]
        lo = chart["boundsMetres"]
        vertex_uv = {}
        for item in chart["triangles"]:
            t = low["triangles"][item["triangle"]]
            # Explicit glTF-style V-down chart; this changes tangent handedness.
            uv = np.asarray([[(x + GUTTER + (p[0] - lo[0]) * PIXELS_PER_METRE) / ATLAS_SIZE,
                              1 - (y + GUTTER + (p[1] - lo[1]) * PIXELS_PER_METRE) / ATLAS_SIZE]
                             for p in item["projection"]])
            p = np.asarray(t["vertices"], dtype=float)
            e = np.column_stack((p[1] - p[0], p[2] - p[0]))
            delta = np.column_stack((uv[1] - uv[0], uv[2] - uv[0]))
            determinant = float(np.linalg.det(delta))
            if not math.isfinite(determinant) or abs(determinant) <= JACOBIAN_EPSILON:
                raise ValueError("Degenerate actual UV Jacobian")
            jacobian = e @ np.linalg.inv(delta)
            normal = np.cross(e[:, 0], e[:, 1])
            normal /= np.linalg.norm(normal)
            tangent = jacobian[:, 0] - normal * np.dot(normal, jacobian[:, 0])
            tangent /= np.linalg.norm(tangent)
            handedness_value = float(np.dot(np.cross(normal, tangent), jacobian[:, 1]))
            if not np.isfinite(jacobian).all() or not np.isfinite(tangent).all() or abs(handedness_value) <= JACOBIAN_EPSILON:
                raise ValueError("Invalid proposed per-triangle tangent frame")
            for vertex, coords in zip(t["vertexIndices"], uv.tolist()):
                if vertex in vertex_uv and vertex_uv[vertex] != coords:
                    raise ValueError("Chart projection is not single-valued at shared vertex")
                vertex_uv[vertex] = coords
            item.update(uv=uv.tolist(), uvDeterminant=determinant, positionJacobian=jacobian.tolist(),
                        geometricNormal=normal.tolist(), tangent=tangent.tolist(),
                        handedness=1 if handedness_value > 0 else -1,
                        tangentNormalDot=float(np.dot(tangent, normal)))


def dry_run(snapshot: Path, capture: dict, progress: dict) -> dict:
    sys.path.insert(0, str(snapshot / "src"))
    high = build(snapshot, set())
    progress["highParity"] = high_parity(high, capture)
    changed_calls = set()
    for index, material in SELECTED.items():
        group = high["groups"][index]
        call = group["boxCall"]
        if call is None or group["operation"] != "box" or group["sourceMaterial"] != material:
            raise ValueError("Named high selection is not its pinned box/material")
        changed_calls.add(call["boxCallOrdinal"])
    if len(changed_calls) != 15:
        raise ValueError("Selected final solids share a source box call")
    low = build(snapshot, changed_calls)
    progress["selection"] = selection(high, low)
    progress["mapping"] = [{"finalGroup": i, "id": g["id"], "creationOrdinal": g["creationOrdinal"],
                            "boxCallOrdinal": g["boxCall"]["boxCallOrdinal"] if g["boxCall"] else None}
                           for i, g in enumerate(high["groups"])]
    progress["unchangedGroups"] = {"count": 302, "arraysExact": True, "evaluatedTriangleAttributesExact": True,
                                   "sha256": value_digest([fields(g) for i, g in enumerate(low["groups"]) if i not in SELECTED])}
    charts = prepare_charts(low)
    progress["chartsBeforePacking"] = charts
    pack(charts)
    chart_jacobians(charts, low)
    low_count = len(low["triangles"])
    area = sum(math.prod(c["paddedPixels"]) for c in charts)
    return {"schema": "sidereal.wayfarer-cluster-surface-dryrun.v1", "complete": True,
            "piece": PIECE, "sourceCommit": SOURCE_COMMIT, "snapshotManifestSha256": SNAPSHOT_SHA,
            "captureSha256": CAPTURE_SHA, "presentationOnly": True, "exportedArtifacts": [],
            "highParity": progress["highParity"], "selection": progress["selection"],
            "mapping": progress["mapping"], "unchangedGroups": progress["unchangedGroups"], "charts": charts,
            "atlas": {"size": [ATLAS_SIZE, ATLAS_SIZE], "pixelsPerMetre": PIXELS_PER_METRE, "gutterPixels": GUTTER,
                      "mips": False, "samplingProposal": "linear-no-mips", "paddedPixels": area,
                      "unallocatedPixels": ATLAS_SIZE ** 2 - area, "occupancy": area / ATLAS_SIZE ** 2,
                      "textureBytesPerRGBA8": ATLAS_SIZE ** 2 * 4, "twoTextureByteCap": 2 * ATLAS_SIZE ** 2 * 4},
            "numericalPolicy": {"triangleOverlapAreaToleranceMeters2": AREA_EPSILON_M2,
                                "chartInjectivity": "numerically qualified pair-interior overlap; not exact zero",
                                "uvJacobianDeterminantTolerance": JACOBIAN_EPSILON,
                                "dominantAxisTies": "X-then-Y-then-Z", "chartVConvention": "V-down",
                                "tangentQualification": "per-triangle Jacobian only; not MikkTSpace/export/native proof"},
            "summary": {"highTriangles": 12044, "lowTriangles": low_count, "selectedGroups": 15,
                        "unchangedGroups": 302, "charts": len(charts),
                        "selectedLowTriangles": sum(len(c["triangles"]) for c in charts),
                        "physicalAreaMeters2": sum(c["physicalAreaMeters2"] for c in charts),
                        "projectedAreaMeters2": sum(c["projectedAreaMeters2"] for c in charts),
                        "pieceTrianglesSaved": 12044 - low_count, "twoPlacementTrianglesSaved": 2 * (12044 - low_count),
                        "wholePlacedTriangleSavingsFraction": 2 * (12044 - low_count) / 796632}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", type=Path, required=True)
    parser.add_argument("--capture", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--inside-blender", action="store_true")
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)
    args.snapshot, args.capture, args.output = [p.resolve() for p in (args.snapshot, args.capture, args.output)]
    if args.output.is_relative_to(ROOT) or args.output.is_relative_to(Path("/root/sidereal-wayfarer-study")) or args.output.is_relative_to(args.snapshot):
        raise ValueError("Dry-run receipt must remain outside repository, source snapshot, and external study")
    if args.output.exists():
        raise ValueError("Immutable output already exists")
    if not args.inside_blender:
        cfg = tomllib.loads((ROOT / "dev.toml").read_text())
        command = [cfg["art"]["blender"], "--background", "--factory-startup", "--threads", "2",
                   "--python-exit-code", "1", "--python", str(Path(__file__).resolve()), "--", *argv, "--inside-blender"]
        raise SystemExit(subprocess.run(command, cwd=ROOT).returncode)
    pins = snapshot_pins(args.snapshot)
    if digest(args.capture) != CAPTURE_SHA:
        raise ValueError("Unexpected admitted capture bytes")
    capture = json.loads(args.capture.read_text())
    if capture["piece"] != PIECE or capture["sourceCommit"] != SOURCE_COMMIT or capture["snapshotManifestSha256"] != SNAPSHOT_SHA:
        raise ValueError("Unexpected capture identity")
    before, started, progress = digest(Path(__file__)), time.monotonic(), {}
    try:
        result = dry_run(args.snapshot, capture, progress)
    except Exception as exc:
        result = {"schema": "sidereal.wayfarer-cluster-surface-dryrun.v1", "complete": False,
                  "error": str(exc), "progress": progress}
    result.update(sourceInputs=pins, adapterSha256=before, captureSha256=CAPTURE_SHA,
                  runtimeSeconds=time.monotonic() - started)
    try:
        result["inputFreeze"] = snapshot_pins(args.snapshot) == pins and digest(args.capture) == CAPTURE_SHA and digest(Path(__file__)) == before
    except Exception as exc:
        result["inputFreeze"] = False
        result["freezeError"] = str(exc)
    if not result["inputFreeze"]:
        result["complete"] = False
        result["error"] = "Changed dry-run inputs"
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(canonical(result) + b"\n")
    print(json.dumps({"complete": result["complete"], "inputFreeze": result["inputFreeze"],
                      "output": str(args.output), "bytes": args.output.stat().st_size, "sha256": digest(args.output),
                      "runtimeSeconds": result["runtimeSeconds"], "summary": result.get("summary"), "error": result.get("error")}))
    if not result["complete"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
