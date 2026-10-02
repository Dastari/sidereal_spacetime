"""New immutable sealed-head proposal, measured against both indexed source skulls.

Run in Blender with --output pointing outside the repository. The early --styles tactical
iteration exports a diagnostic-only six-node manifest; full revision exports preserve all hair bytes.
Existing refinement-r005 source, artifacts, manifest and active pins are never rewritten.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import shutil
import struct
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SOURCE_HEAD_SHA = "d075155bf24d50851403dbc2d43e1417e732029651be8fb7a73c911ac01449f9"
PREVIOUS_MANIFEST_SHA = "5532242e63549c7182c4f28721f5da13cba48d4abfbdd2b4d07b40ca67a0fd11"
# Blender frame: X right, Y face-forward, Z up. All planes lie on the source paint lattice.
SUBSTRATE = {
    "outer": [[-0.3359375, -0.2734375, -0.03515625], [0.3359375, 0.28125, 0.578125]],
    "cavity": [[-0.296875, -0.23046875, -0.2], [0.296875, 0.234375, 0.51171875]],
}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_glb(path):
    raw = path.read_bytes()
    magic, version, size = struct.unpack_from("<III", raw)
    if magic != 0x46546C67 or version != 2 or size != len(raw):
        raise ValueError("Invalid or incomplete GLB")
    offset, document, binary = 12, None, None
    while offset < len(raw):
        count, kind = struct.unpack_from("<II", raw, offset)
        chunk = raw[offset + 8:offset + 8 + count]
        if len(chunk) != count:
            raise ValueError("Truncated GLB chunk")
        if kind == 0x4E4F534A:
            document = json.loads(chunk)
        elif kind == 0x004E4942:
            binary = chunk
        offset += count + 8
    if offset != len(raw) or document is None or binary is None:
        raise ValueError("Missing GLB document or binary")
    return document, binary


def accessor(document, binary, index):
    entry = document["accessors"][index]
    if "sparse" in entry:
        raise ValueError("Sparse accessor is outside this indexed-source contract")
    view = document["bufferViews"][entry["bufferView"]]
    components = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[entry["type"]]
    fmt = "<" + {5121: "B", 5123: "H", 5125: "I", 5126: "f"}[entry["componentType"]] * components
    stride = view.get("byteStride", struct.calcsize(fmt))
    base = view.get("byteOffset", 0) + entry.get("byteOffset", 0)
    return [struct.unpack_from(fmt, binary, base + i * stride) for i in range(entry["count"])]


def source_skulls(path):
    if digest(path) != SOURCE_HEAD_SHA:
        raise ValueError("Actual indexed skull source pin changed")
    document, binary = read_glb(path)
    result = {}
    for node in document["nodes"]:
        if node.get("name") not in ("head.male", "head.female"):
            continue
        if any(key in node for key in ("matrix", "translation", "rotation", "scale")):
            raise ValueError("Unexpected skull node transform")
        primitives = document["meshes"][node["mesh"]]["primitives"]
        skin = [p for p in primitives if document["materials"][p["material"]]["name"] == "crew.skin"]
        if len(skin) != 1:
            raise ValueError("Expected one actual indexed skin primitive per skull")
        primitive = skin[0]
        positions = accessor(document, binary, primitive["attributes"]["POSITION"])
        indices = [i[0] for i in accessor(document, binary, primitive["indices"])]
        used = sorted(set(indices))
        bounds = [[min(positions[i][a] for i in used) for a in range(3)],
                  [max(positions[i][a] for i in used) for a in range(3)]]
        if bounds[0] != [-0.28515625, -0.0585937537252903, -0.2109375] or bounds[1] != [0.28515625, 0.5, 0.21875]:
            raise ValueError("Actual source skull bounds changed; revise the wiki contract first")
        # Source export is Y-up, -Z-forward; authoring is Z-up, +Y-forward.
        blender_positions = [(x, -z, y) for x, y, z in positions]
        result[node["name"]] = {"positions": blender_positions, "indices": indices,
                                "indexedVertices": used, "boundsGltfM": bounds}
    if set(result) != {"head.male", "head.female"}:
        raise ValueError("Both actual indexed skulls are required")
    return result


def raw_box(grid, bounds, operation, slot=None):
    """Specify exact Blender metres without the legacy nominal design-skull assumption."""
    from vox import V, inv
    lo, hi = bounds
    args = [float(inv(-hi[0] / V, 0)), float(inv(-hi[1] / V, 1)), float(inv(lo[2] / V, 2)),
            float(inv(-lo[0] / V, 0)), float(inv(-lo[1] / V, 1)), float(inv(hi[2] / V, 2))]
    return getattr(grid, operation)(*args, *([slot] if slot else []))


def repaired_helmet(hid, visor_ids):
    import numpy as np
    import parts_gear
    from vox import Grid, V, fwd, snapv
    shell, visors = parts_gear.helmet(hid, visor_ids, continuous=True)
    if hid == "open":
        return shell, visors, [], {"intentionalOpenHelmet": True}
    substrate = Grid(f"GEO-pressure-substrate.{hid}")
    substrate.continuous = True
    raw_box(substrate, SUBSTRATE["outer"], "box", "dark")
    raw_box(substrate, SUBSTRATE["cavity"], "cut")
    aperture = []
    for x0, z0, x1, z1 in parts_gear.HELMETS[hid][-1]:
        # Exact old continuous clear-ray aperture, including its existing 1/4 design-unit inset.
        xmin = -snapv(fwd(x1 - 0.25, 0)) * V
        xmax = -snapv(fwd(x0 + 0.25, 0)) * V
        zmin = snapv(fwd(z0 + 0.25, 2)) * V
        zmax = snapv(fwd(z1 - 0.25, 2)) * V
        aperture.append([xmin, zmin, xmax, zmax])
        raw_box(substrate, [[xmin, 0.20, zmin], [xmax, 0.40, zmax]], "cut")
    # Keep authored plate/seat/boot slots. New substrate fills empty volume only; the mesher emits
    # the combined occupied envelope, never internal faces or separate exactly-abutting panels.
    old_occupied = shell.isl > 0
    old_slots = shell.slot[old_occupied].copy()
    overlap = int(np.count_nonzero(old_occupied & (substrate.isl > 0)))
    added = int(np.count_nonzero(~old_occupied & (substrate.isl > 0)))
    shell.merge(substrate)
    provenance = {"originalOccupiedCells": int(np.count_nonzero(old_occupied)),
                  "substratePositiveOverlapCells": overlap, "newSubstrateCells": added,
                  "originalOccupiedSlotsPreserved": bool(np.array_equal(old_slots, shell.slot[old_occupied])),
                  "continuousUnionEnvelope": shell.continuous}
    if overlap <= 0 or added <= 0 or not provenance["originalOccupiedSlotsPreserved"]:
        raise ValueError("Substrate lacks positive union overlap or changed existing authored plate duties")
    return shell, visors, aperture, provenance


def add_uvs(mesh):
    """Finite neutral UVs for downstream tooling; no texture or palette baked into the shell."""
    uv = mesh.uv_layers.new(name="UVMap")
    for polygon in mesh.polygons:
        axis = max(range(3), key=lambda i: abs(polygon.normal[i]))
        axes = [i for i in range(3) if i != axis]
        for loop in polygon.loop_indices:
            vertex = mesh.vertices[mesh.loops[loop].vertex_index].co
            uv.data[loop].uv = (vertex[axes[0]] + 0.5, vertex[axes[1]] + 0.5)


def seal_metrics(mesh, skulls, apertures):
    import bmesh
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    mesh.calc_loop_triangles()
    triangles = [tuple(t.vertices) for t in mesh.loop_triangles]
    tree = BVHTree.FromPolygons([v.co for v in mesh.vertices], triangles, all_triangles=True)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    topology = {"boundaryEdges": sum(e.is_boundary for e in bm.edges),
                "nonManifoldEdges": sum(not e.is_manifold for e in bm.edges),
                "vertices": len(bm.verts), "triangles": len(triangles)}
    bm.free()
    result = {"actualExportedOpaqueTopology": topology, "skulls": {}}
    clear_rays, blocked = 0, []
    for xmin, zmin, xmax, zmax in apertures:
        for ix in range(9):
            for iz in range(9):
                # Interior points span the aperture while staying 1 mm away from its exact boundary.
                x = xmin + 0.001 + (xmax - xmin - 0.002) * ix / 8
                z = zmin + 0.001 + (zmax - zmin - 0.002) * iz / 8
                hit, _, _, _ = tree.ray_cast(Vector((x, 0.21875, z)), Vector((0, 1, 0)), 1.0)
                clear_rays += 1
                if hit is not None:
                    blocked.append([x, z])
    result["intentionalFaceAperture"] = {"samples": clear_rays, "opaqueBlocked": len(blocked),
                                         "blockedExamples": blocked[:8]}
    directions = {"crown": Vector((0, 0, 1)), "rear": Vector((0, -1, 0)),
                  "left": Vector((-1, 0, 0)), "right": Vector((1, 0, 0)), "nonWindowFront": Vector((0, 1, 0))}
    for name, skull in skulls.items():
        vertices, indices = skull["positions"], skull["indices"]
        points = [Vector(vertices[i]) for i in skull["indexedVertices"]]
        points += [sum((Vector(vertices[i]) for i in indices[k:k + 3]), Vector()) / 3
                   for k in range(0, len(indices), 3)]
        report = {"boundsGltfM": skull["boundsGltfM"], "indexedVertices": len(skull["indexedVertices"]),
                  "triangleCentroids": len(indices) // 3, "directions": {}}
        for label, direction in directions.items():
            distances, thicknesses, misses, skipped, outward_first = [], [], [], 0, 0
            for point in points:
                if label == "nonWindowFront" and any(a[0] <= point.x <= a[2] and a[1] <= point.z <= a[3] for a in apertures):
                    skipped += 1
                    continue
                hit, normal, triangle, distance = tree.ray_cast(point + direction * 0.000001, direction, 2.0)
                if hit is None:
                    misses.append(list(point))
                    continue
                distances.append(distance + 0.000001)
                outward_first += int(normal.dot(direction) >= -0.1)
                # First cavity entry then the next outward intersection measures actual positive wall
                # thickness. Intersections of existing plates may add later crossings, never erase this one.
                exit_hit, _, _, exit_distance = tree.ray_cast(hit + direction * 0.00001, direction, 2.0)
                if exit_hit is not None and normal.dot(direction) < -0.1:
                    thicknesses.append(exit_distance + 0.00001)
            report["directions"][label] = {
                "samples": len(points) - skipped, "intentionalWindowSkipped": skipped,
                "hits": len(distances), "misses": len(misses), "missExamples": misses[:8],
                "minimumOutwardGapM": min(distances, default=None), "maximumOutwardGapM": max(distances, default=None),
                "firstIntersectionFacingOutwards": outward_first,
                "wallThicknessSamples": len(thicknesses), "minimumMeasuredWallThicknessM": min(thicknesses, default=None)}
        result["skulls"][name] = report
    return result


def validate_export(path):
    document, binary = read_glb(path)
    result = {}
    for node in document["nodes"]:
        if "mesh" not in node:
            continue
        primitives = []
        for primitive in document["meshes"][node["mesh"]]["primitives"]:
            attributes = primitive["attributes"]
            for attribute in ("POSITION", "NORMAL", "TEXCOORD_0", "COLOR_0"):
                if attribute not in attributes:
                    raise ValueError(f"Missing exported {attribute} in {node['name']}")
                values = accessor(document, binary, attributes[attribute])
                if not all(math.isfinite(v) for row in values for v in row):
                    raise ValueError(f"Nonfinite exported {attribute}")
            positions = accessor(document, binary, attributes["POSITION"])
            indices = [i[0] for i in accessor(document, binary, primitive["indices"])]
            used = [positions[i] for i in indices]
            normals = accessor(document, binary, attributes["NORMAL"])
            lengths = [math.sqrt(sum(v * v for v in row)) for row in normals]
            if not all(0.99 <= length <= 1.01 for length in lengths):
                raise ValueError("Non-unit exported normal")
            material = document["materials"][primitive["material"]]["name"]
            if node["name"].startswith("helmet.") and material in ("crew.skin", "crew.face", "crew.hair"):
                raise ValueError("Shell accidentally acquired a non-helmet material slot")
            primitives.append({"material": material, "vertices": len(positions), "indices": len(indices),
                               "boundsGltfM": [[min(p[a] for p in used) for a in range(3)],
                                               [max(p[a] for p in used) for a in range(3)]]})
        result[node["name"]] = primitives
    return result


def exported_shell_mesh(path, name):
    """Reconstruct actual exported indexed opaque geometry, then weld attribute/slot splits."""
    import bpy
    import bmesh
    document, binary = read_glb(path)
    node = next(n for n in document["nodes"] if n.get("name") == name)
    positions, triangles = [], []
    for primitive in document["meshes"][node["mesh"]]["primitives"]:
        base = len(positions)
        positions.extend((x, -z, y) for x, y, z in accessor(document, binary, primitive["attributes"]["POSITION"]))
        indices = [base + row[0] for row in accessor(document, binary, primitive["indices"])]
        triangles.extend(tuple(indices[k:k + 3]) for k in range(0, len(indices), 3))
    mesh = bpy.data.meshes.new("GEO-actual-export-proof")
    mesh.from_pydata(positions, [], triangles)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=0.0000001)
    bm.to_mesh(mesh)
    bm.free()
    return mesh


def main():
    started = time.monotonic()
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--styles", default="tactical")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    out = Path(args.output).resolve()
    if out == ROOT or ROOT in out.parents or out.exists():
        raise ValueError("Use a new immutable output directory outside the repository")
    previous = ROOT / "assets/runtime/crew/heads/refinement-r005"
    if digest(previous / "manifest.json") != PREVIOUS_MANIFEST_SHA:
        raise ValueError("Previous proposal pin changed")
    cat = json.loads((ROOT / "packages/content/src/crew-heads.v1.json").read_text())
    selected = args.styles.split(",") if args.styles else [h["id"] for h in cat["helmets"]]
    if len(selected) != len(set(selected)) or not set(selected) <= {h["id"] for h in cat["helmets"]}:
        raise ValueError("Invalid or duplicate requested helmet identity")
    if len(selected) != len(cat["helmets"]) and selected != ["tactical"]:
        raise ValueError("Early diagnostic manifest is explicitly Tactical-only")
    skulls = source_skulls(ROOT / "assets/runtime/crew/heads/v1/heads.glb")
    # Blender and numpy work begins only after complete source pins and bounded output validation.
    import bpy
    sys.path.insert(0, str(HERE))
    import kit
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # Library builds the complete generic slot table; its unused face slot still needs an image.
    # No face primitive is authored or exported, and no existing face resource is regenerated.
    bpy.data.images.new("crew.face.default", width=16, height=16, alpha=True)
    lib = kit.Library()
    metrics, all_apertures, provenance = {}, {}, {}
    visor_ids = [v["id"] for v in cat["visors"]]
    for hid in selected:
        shell, visors, apertures, provenance[hid] = repaired_helmet(hid, visor_ids)
        ob = lib.add(f"helmet.{hid}", "helmet", "helmets", shell)
        add_uvs(ob.data)
        if hid != "open":
            all_apertures[hid] = apertures
        del shell
        for vid, grid in visors.items():
            visor = lib.add(f"visor.{hid}.{vid}", "visor", "helmets", grid)
            add_uvs(visor.data)
        del visors
        print(f"Built new sealed {hid}; elapsed {time.monotonic() - started:.1f}s", flush=True)
    out.mkdir(parents=True)
    bpy.ops.object.select_all(action="DESELECT")
    for ob in lib.objects.values():
        ob.hide_set(False)
        ob.select_set(True)
    path = out / "helmets.glb"
    bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True,
                             export_apply=True, export_yup=True, export_texcoords=True,
                             export_normals=True, export_materials="EXPORT", export_extras=False,
                             export_cameras=False, export_lights=False, export_animations=False,
                             export_vertex_color="ACTIVE")
    exported = validate_export(path)
    expected = {f"helmet.{hid}" for hid in selected}
    expected.update(f"visor.{hid}.{vid}" for hid in selected if hid != "open" for vid in visor_ids)
    if set(exported) != expected:
        raise ValueError("Exported cosmetic identities differ from the bounded selection")
    for hid, apertures in all_apertures.items():
        actual_mesh = exported_shell_mesh(path, f"helmet.{hid}")
        metrics[hid] = seal_metrics(actual_mesh, skulls, apertures)
        metrics[hid]["clearRayAperturesBlenderXZ"] = apertures
        bpy.data.meshes.remove(actual_mesh)
    source = out / "crew-helmets-sealed-r006.blend"
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(source), compress=True)
    prior_manifest = json.loads((previous / "manifest.json").read_text())
    complete = len(selected) == len(cat["helmets"])
    manifest = prior_manifest if complete else {
        "schema": "sidereal.crew-head-seal-diagnostic.v1", "id": "sealed-r006-tactical",
        "status": "diagnostic-only-not-complete-release", "catalogRevision": cat["revision"],
        "headScale": 0.9, "space": cat["space"], "voxelMeters": cat["voxelMeters"],
        "helmets": selected, "visors": visor_ids, "files": {}, "nodes": {}, "sources": {},
    }
    manifest.update({"helmetRevision": 9, "iterationStyles": selected,
                     "completeNewHelmetRevision": complete, "previousManifestSha256": PREVIOUS_MANIFEST_SHA})
    if complete:
        manifest.update({"id": "refinement-r006", "status": "proposal"})
    preserved = []
    for key, entry in list(prior_manifest["files"].items()):
        if key == "helmets":
            continue
        src = previous / entry["path"]
        if digest(src) != entry["sha256"]:
            raise ValueError("Prior resource checksum mismatch")
        if complete:
            dest = out / entry["path"]
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(src, dest)
            if digest(dest) != entry["sha256"]:
                raise ValueError("Byte preservation failed")
        preserved.append({"path": entry["path"], "sha256": entry["sha256"], "bytes": src.stat().st_size,
                          "copiedIntoCompleteRevision": complete})
    manifest["files"]["helmets"] = {"path": path.name, "sha256": digest(path), "bytes": path.stat().st_size,
                                         "nodes": list(lib.objects)}
    manifest["nodes"].update(lib.stats())
    manifest["sources"]["helmets"] = {"path": source.name, "sha256": digest(source)}
    manifest["authoring"] = {p.name: digest(p) for p in (HERE / "parts_gear.py", HERE / "vox.py", HERE / "kit.py", HERE / "look.py", Path(__file__))}
    manifest["sealedSkullSource"] = {"path": "assets/runtime/crew/heads/v1/heads.glb", "sha256": SOURCE_HEAD_SHA}
    manifest["sources"]["helmets"]["scope"] = selected
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    receipt = {"status": "proposal-native-review-required", "substrateBlenderM": SUBSTRATE,
               "sourceHeadSha256": SOURCE_HEAD_SHA, "previousManifestSha256": PREVIOUS_MANIFEST_SHA,
               "newGlbSha256": digest(path), "newGlbBytes": path.stat().st_size,
               "editableSourceSha256": digest(source), "newManifestSha256": digest(out / "manifest.json"),
               "exportedPrimitiveChecks": exported, "geometry": metrics, "unionProvenance": provenance,
               "preservedHairResources": preserved,
               "elapsedSeconds": time.monotonic() - started}
    (out / "geometry-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
    failures = [f"{hid}/{sex}/{direction}" for hid, report in metrics.items()
                for sex, body in report["skulls"].items() for direction, proof in body["directions"].items() if proof["misses"]]
    if failures or any(report["actualExportedOpaqueTopology"]["nonManifoldEdges"] or
                       report["intentionalFaceAperture"]["opaqueBlocked"] for report in metrics.values()):
        raise ValueError(f"Actual sealed-shell geometry prerequisites failed: {failures}; retain this iteration unchanged")
    print(json.dumps({"output": str(out), "glbSha256": digest(path), "elapsedSeconds": receipt["elapsedSeconds"],
                      "scope": selected, "nativeAcceptance": "pending"}), flush=True)


if __name__ == "__main__":
    main()
