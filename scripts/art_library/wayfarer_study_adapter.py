"""Finite, private Wayfarer study capture. The external study is never modified.

Run through npm exec and the configured dev.toml Blender. Capture precedes sampling:
each final MB vertex group is a separate solid, including post-fit/merge changes.
No aggregate-mesh parity, source AABB approximation, or live catalog publication.
"""
from __future__ import annotations

import argparse
from collections import Counter
import contextlib
import hashlib
import inspect
import io
import json
import math
from pathlib import Path
import subprocess
import struct
import sys
import time
import tomllib

ROOT = Path(__file__).resolve().parents[2]
PIECE = "hull.bay.cluster.light.navy.louvre.w3.000.s0.k-2.35"
CELL = 1 / 16
SOURCE_COMMIT = "271a9fa176161a1ce00bc7571ba1db7ad52e02dd"
SNAPSHOT_SHA = "460e8546d835ae2e9549b57465f0922623a3da8ab4c236bb0031281e60d26de8"
CAPTURE_SHA = "8949456baa8ec37af5fb01937e8b3fa3b3e465fee856f60224c6b46c357ce882"
PRIMITIVES = {"box", "_sharp_box", "prism", "cyl", "prism_x"}
STAGE_ROLES = {"keel": "plate", "main": "plate", "upper": "frame", "rim": "frame"}
SOURCE_STAGES = {"backer": "backer", "_flush_keel": "keel", "keel": "keel",
                 "upper": "upper", "_rim": "rim", "rim": "rim",
                 "m_cluster": "main", "_fill_backing": "main"}
# These two non-theme surface names retain their actual palette entries in the
# artifact. The legacy slot is only the current compiler's dispatch classification.
SLOTS = {x: x for x in ("primary", "secondary", "accent", "trim", "metal", "dark", "emit_a", "emit_b", "glass")}
SLOTS.update(white="primary", yellow="accent")


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def frozen_snapshot(path: Path) -> dict:
    receipt = path / "SHA256.json"
    if digest(receipt) != SNAPSHOT_SHA:
        raise ValueError("Unexpected completed-study snapshot")
    pins = json.loads(receipt.read_text())["files"]
    for name, pin in pins.items():
        source = path / name
        if source.stat().st_size != pin["bytes"] or digest(source) != pin["sha256"]:
            raise ValueError("Changed snapshot input: " + name)
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


def capture(snapshot: Path, output: Path) -> dict:
    import bpy
    import numpy as np

    sys.path.insert(0, str(snapshot / "src"))
    from sr.mb import MB
    from sr import kit_hull as K, mats

    chunks = {}
    original_add = MB._add

    def observed_add(self, *args, **kwargs):
        before = len(self.verts)
        original_add(self, *args, **kwargs)
        stack = source_stack(snapshot)
        primitive = next((s["function"] for s in stack if s["function"] in PRIMITIVES), None)
        if primitive is None:
            raise ValueError("Unknown primitive operation: " + json.dumps(stack))
        stage = next((SOURCE_STAGES[s["function"]] for s in stack if s["function"] in SOURCE_STAGES), None)
        if stage is None:
            raise ValueError("Unclassified construction stage: " + json.dumps(stack))
        for co in self.verts[before:]:
            chunks[id(co)] = {"operation": primitive, "stage": stage, "sourceStack": stack}

    MB._add = observed_add
    log = io.StringIO()
    mb = MB(PIECE)
    try:
        with contextlib.redirect_stdout(log):
            K.bay(mb, 3, main="cluster", up="light", rim_kind="navy", keel_kind="louvre", seed=0, z_bot=-2.35)
    finally:
        MB._add = original_add
    messages = log.getvalue()
    if any(x in messages.lower() for x in ("falling back", "using the built-in", "failed", "error")):
        raise ValueError("Unexpected builder fallback; source log: " + messages)

    records, base, face_at, backers = [], 0, 0, 0
    for index, co in enumerate(mb.verts):
        info = chunks.get(id(co))
        if info is None:
            raise ValueError("Group lost across fit/merge")
        end = base + len(co)
        faces, materials = [], []
        while face_at < len(mb.faces) and min(mb.faces[face_at]) >= base:
            face = mb.faces[face_at]
            if min(face) >= end:
                break
            if max(face) >= end:
                raise ValueError("Face crosses separate primitive groups")
            faces.append([v - base for v in face])
            materials.append(mb.slots[mb.face_mat[face_at]])
            face_at += 1
        if not faces or not np.isfinite(co).all():
            raise ValueError("Empty/nonfinite source group")
        edges = Counter(tuple(sorted((f[j], f[(j + 1) % len(f)]))) for f in faces for j in range(len(f)))
        if not edges or any(n != 2 for n in edges.values()):
            raise ValueError(f"Open/nonmanifold structural group {index}")
        directed = Counter((f[j], f[(j + 1) % len(f)]) for f in faces for j in range(len(f)))
        if any(n != 1 or directed[(b, a)] != 1 for (a, b), n in directed.items()):
            raise ValueError(f"Inconsistent closed-group winding {index}")
        centre = co.mean(axis=0)
        signed_volume = sum(float(np.dot(co[f[0]] - centre,
            np.cross(co[f[j]] - centre, co[f[j + 1]] - centre))) / 6
            for f in faces for j in range(1, len(f) - 1))
        if not math.isfinite(signed_volume) or signed_volume <= 0:
            raise ValueError(f"Nonpositive closed-group volume {index}: {signed_volume}")
        if len(set(materials)) != 1 or materials[0] not in SLOTS or materials[0] == "glass":
            raise ValueError(f"Unclassified material/glass in opaque bay group {index}: {materials}")
        material = materials[0]
        if info["stage"] == "backer":
            role = "core" if backers == 0 else "plate"
            backers += 1
        else:
            role = STAGE_ROLES[info["stage"]]
        if material in ("emit_a", "emit_b"):
            role = "service"
        records.append({"id": f"{PIECE}:solid:{index}", **info, "role": role,
                        "sourceMaterial": material, "slot": SLOTS[material],
                        "vertices": co.tolist(), "faces": faces,
                        "loopNormals": mb.loop_normals[index].tolist(),
                        "loopUVs": mb.loop_uvs[index].tolist(),
                        "bounds": [*co.min(axis=0).tolist(), *co.max(axis=0).tolist()],
                        "edgeCount": len(edges), "oppositeDirectedEdges": True,
                        "signedVolumeMeters3": signed_volume, "closed": True})
        base = end
    if base != mb.nv or face_at != len(mb.faces) or backers != 2:
        raise ValueError("Incomplete final group census/backer duty")
    core = records[0]
    if core["role"] != "core" or not np.allclose(core["bounds"], [0, -1, -2.29, 3, -.3, 1.3], rtol=0, atol=1e-10):
        raise ValueError("Unexpected named CORE backer")

    # Preserve the actual complete authored source mesh as a comparison object.
    library = mats.build_library("federation")
    mesh = mb.mesh(library)
    mesh.calc_loop_triangles()
    source_triangles = [{"vertices": [list(mesh.vertices[v].co) for v in t.vertices],
                         "normals": [list(mesh.corner_normals[loop].vector) for loop in t.loops],
                         "uvs": [list(mesh.uv_layers.active.data[loop].uv) for loop in t.loops],
                         "material": mb.slots[t.material_index]} for t in mesh.loop_triangles]
    palette = {name: {"slot": slot, "sourceFamily": mats.SLOT_FAMILY[name] if name in mats.SLOT_FAMILY else mats.EXTRA[name][0],
                      "colour": list(mats.THEMES["federation"][name] if name in mats.SLOT_FAMILY else mats.EXTRA[name][1])}
               for name, slot in SLOTS.items() if name in mb.slots}
    return {"schema": "sidereal.wayfarer-study-capture.v1", "piece": PIECE,
            "sourceCommit": SOURCE_COMMIT, "snapshotManifestSha256": SNAPSHOT_SHA,
            "cellMeters": CELL, "placement": [-3, 6.5, 0], "presentationOnly": True,
            "groups": records, "palette": palette, "sourceTriangles": source_triangles,
            "builderMessages": messages, "fallback": False,
            "summary": {"groups": len(records), "vertices": mb.nv, "triangles": len(source_triangles),
                        "stages": dict(Counter(r["stage"] for r in records))}}


def actual_group_triangles(captured: dict):
    """Bind exact Blender triangulation to every original polygon/group."""
    def f32(p):
        return tuple(struct.unpack("<f", struct.pack("<f", x))[0] for x in p)
    cursor = 0
    result = []
    for group in captured["groups"]:
        triangles = []
        for face in group["faces"]:
            allowed = {f32(group["vertices"][i]) for i in face}
            count = len(face) - 2
            part = captured["sourceTriangles"][cursor:cursor + count]
            if len(part) != count or any(t["material"] != group["sourceMaterial"] or
                    any(tuple(p) not in allowed for p in t["vertices"]) for t in part):
                raise ValueError("Authored triangle/group membership mismatch: " + group["id"])
            triangles.extend(t["vertices"] for t in part)
            cursor += count
        result.append(triangles)
    if cursor != len(captured["sourceTriangles"]):
        raise ValueError("Incomplete actual triangulated source partition")
    return result


def sample(captured: dict) -> dict:
    import numpy as np

    cells, groups, visits = {}, [], 0
    origin = captured["placement"]
    triangulated = actual_group_triangles(captured)
    epsilon = 1e-10
    for index, (group, actual) in enumerate(zip(captured["groups"], triangulated)):
        # These are the ACTUAL indexed authored triangles, independently matched
        # to the old GLB; never a convex hull or alternate n-gon diagonal.
        triangles = np.asarray(actual, dtype=np.float64) + np.asarray(origin)
        vertices = triangles.reshape((-1, 3))
        bounds = [math.floor(min(p[a] for p in vertices) / CELL) for a in range(3)] + [math.ceil(max(p[a] for p in vertices) / CELL) for a in range(3)]
        visits += math.prod(bounds[a + 3] - bounds[a] for a in range(3))
        if visits > 8_000_000:
            raise ValueError("Finite per-solid sampling budget exceeded")
        a, b, c = triangles[:, 0], triangles[:, 1], triangles[:, 2]
        normals = np.cross(b - a, c - a)
        norm_length = np.linalg.norm(normals, axis=1)
        if np.any(norm_length <= 1e-14):
            raise ValueError("Degenerate actual indexed source triangle: " + group["id"])
        unit = normals / norm_length[:, None]
        convex = all(np.max((vertices - p) @ n) <= epsilon for p, n in zip(a, unit))
        axes = [np.arange(bounds[d], bounds[d + 3], dtype=np.int64) for d in range(3)]
        grid = np.stack(np.meshgrid(*axes, indexing="ij"), axis=-1).reshape((-1, 3))
        count, boundary_count = 0, 0
        # Bounded blocks also keep winding memory independent of source size.
        for start in range(0, len(grid), 512):
            keys = grid[start:start + 512]
            points = (keys + .5) * CELL
            if convex:
                distance = np.einsum("pti,ti->pt", points[:, None, :] - a, unit)
                inside = np.all(distance <= epsilon, axis=1)
                boundary = inside & np.any(np.abs(distance) <= epsilon, axis=1)
            else:
                # Closed-mesh generalized winding, independent of ray direction
                # and grazing/coincident edge hits. Numerical boundary is explicit.
                boundary = np.zeros(len(points), dtype=bool)
                for t, n in zip(triangles, unit):
                    v0, v1 = t[1] - t[0], t[2] - t[0]
                    v2 = points - t[0]
                    d00, d01, d11 = np.dot(v0, v0), np.dot(v0, v1), np.dot(v1, v1)
                    denominator = d00 * d11 - d01 * d01
                    if denominator <= 0:
                        raise ValueError("Degenerate boundary triangle")
                    d20, d21 = v2 @ v0, v2 @ v1
                    u = (d11 * d20 - d01 * d21) / denominator
                    v = (d00 * d21 - d01 * d20) / denominator
                    boundary |= ((np.abs(v2 @ n) <= epsilon) & (u >= -epsilon) &
                                 (v >= -epsilon) & (u + v <= 1 + epsilon))
                av, bv, cv = a - points[:, None, :], b - points[:, None, :], c - points[:, None, :]
                la, lb, lc = (np.linalg.norm(v, axis=2) for v in (av, bv, cv))
                numerator = np.einsum("pti,pti->pt", av, np.cross(bv, cv))
                denominator = (la * lb * lc + np.einsum("pti,pti->pt", av, bv) * lc +
                    np.einsum("pti,pti->pt", bv, cv) * la + np.einsum("pti,pti->pt", cv, av) * lb)
                winding = np.sum(2 * np.arctan2(numerator, denominator), axis=1) / (4 * math.pi)
                unambiguous = boundary | (np.abs(winding) <= 1e-7) | (np.abs(winding - 1) <= 1e-7)
                if not np.all(unambiguous):
                    raise ValueError(f"Ambiguous individual source winding {index}: {winding[~unambiguous].tolist()}")
                inside = boundary | (np.abs(winding - 1) <= 1e-7)
            boundary_count += int(np.count_nonzero(boundary))
            count += int(np.count_nonzero(inside))
            for key in keys[inside]:
                # Preserve last ordered source duty; union never subtracts.
                cells[tuple(int(v) for v in key)] = index
        groups.append({"id": group["id"], "occupiedCentres": count,
                       "boundaryCentres": boundary_count, "certifiedConvex": convex,
                       "predicate": "actual-triangle-halfspaces" if convex else "closed-triangle-winding",
                       "vanishedAtResolution": count == 0})
    if not cells:
        raise ValueError("No sampled bay")
    final_counts = Counter(cells.values())
    for index, group in enumerate(groups):
        group["finalOwnedCentres"] = final_counts[index]
        group["completelyOverwritten"] = group["occupiedCentres"] > 0 and not final_counts[index]
    # Exact per-X runs; the normal sampler reconstructs the sampled union without
    # changing topology or enlarging vanished subtexel geometry.
    rows = {}
    for (x, y, z), owner in cells.items():
        rows.setdefault((z, y), []).append((x, owner))
    runs = []
    for (z, y), xs in sorted(rows.items()):
        xs.sort()
        start, previous, owner = xs[0][0], xs[0][0], xs[0][1]
        for x, next_owner in xs[1:] + [(xs[-1][0] + 2, -1)]:
            if x != previous + 1 or next_owner != owner:
                runs.append([start, y, z, previous + 1, owner])
                start, owner = x, next_owner
            previous = x
    return {"schema": "sidereal.wayfarer-study-samples.v1", "piece": PIECE,
            "snapshotManifestSha256": SNAPSHOT_SHA,
            "captureSha256": hashlib.sha256(json.dumps(captured, separators=(",", ":")).encode()).hexdigest(),
            "cellMeters": CELL, "presentationOnly": True,
            "samplingRule": "global-cell-centres/actual-triangle-halfspaces-or-closed-winding/closed-boundary",
            "tolerances": {"planeAndBoundaryMeters": epsilon,
                           "boundaryBarycentric": epsilon, "winding": 1e-7},
            "boundaryPolicy": "numerically-qualified closed source boundary",
            "groups": groups,
            "duties": [{k: g[k] for k in ("id", "operation", "stage", "role", "sourceMaterial", "slot", "bounds")} for g in captured["groups"]],
            "palette": captured["palette"], "runs": runs,
            "summary": {"cells": len(cells), "runs": len(runs), "examined": visits,
                        "vanishedGroups": sum(g["vanishedAtResolution"] for g in groups)}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--stage", choices=("capture", "sample"), default="capture")
    parser.add_argument("--capture", type=Path)
    parser.add_argument("--inside-blender", action="store_true")
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)
    args.snapshot = args.snapshot.resolve()
    args.output = args.output.resolve()
    if args.output.is_relative_to(ROOT) or args.output.is_relative_to(Path("/root/sidereal-wayfarer-study")):
        raise ValueError("First prototype output must stay outside game and external study")
    if not args.inside_blender:
        cfg = tomllib.loads((ROOT / "dev.toml").read_text())
        command = [cfg["art"]["blender"], "--background", "--factory-startup", "--threads", "2", "--python-exit-code", "1", "--python", str(Path(__file__).resolve()), "--", *argv, "--inside-blender"]
        raise SystemExit(subprocess.run(command, cwd=ROOT).returncode)
    if args.output.exists():
        raise ValueError("Immutable phase output already exists; use a new path")
    pins = frozen_snapshot(args.snapshot)
    before = digest(Path(__file__))
    started = time.monotonic()
    try:
        if args.stage == "capture":
            result = capture(args.snapshot, args.output)
        else:
            if args.capture is None:
                raise ValueError("Sampling requires an admitted capture path")
            if digest(args.capture) != CAPTURE_SHA:
                raise ValueError("Unadmitted immutable source capture bytes")
            captured = json.loads(args.capture.read_text())
            if captured["schema"] != "sidereal.wayfarer-study-capture.v1" or captured["piece"] != PIECE or captured["snapshotManifestSha256"] != SNAPSHOT_SHA:
                raise ValueError("Unexpected capture inputs")
            capture_pin = digest(args.capture)
            result = sample(captured)
            result["captureFileSha256"] = capture_pin
            if digest(args.capture) != capture_pin:
                raise ValueError("Capture changed during sampling")
    except Exception as exc:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps({"complete": False, "phase": args.stage,
            "error": str(exc), "sourceInputs": pins, "adapterSha256": before,
            "runtimeSeconds": time.monotonic() - started}, indent=2) + "\n")
        raise
    result["sourceInputs"] = pins
    result["adapterSha256"] = before
    result["runtimeSeconds"] = time.monotonic() - started
    result["inputFreeze"] = frozen_snapshot(args.snapshot) == pins and digest(Path(__file__)) == before
    if not result["inputFreeze"]:
        raise ValueError("Changed phase inputs")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, separators=(",", ":")) + "\n")
    print(json.dumps({"complete": True, "phase": args.stage, "output": str(args.output),
                      "sha256": digest(args.output), "bytes": args.output.stat().st_size,
                      "runtimeSeconds": result["runtimeSeconds"], "summary": result["summary"]}))


if __name__ == "__main__":
    main()
