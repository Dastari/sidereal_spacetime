"""Second immutable Tactical diagnostic: joined armor outside the held opaque seal.

The first e2ca builder and aa3 source/export remain unchanged. Run only after a serialized
CPU grant, with --output naming a new directory outside the repository. This is not a release.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
HELD_HELPER_SHA = "e2caac4a1a22c75a8357bff03bc0005facb06a96094ecea2fd348cece6de44d5"
PREVIOUS_DIAGNOSTIC_SHA = "0a0acf52f11ab0ef583586abb607ae733fc81457e79f15e5aa2dd149d4e6f31d"
PREVIOUS_GLB_SHA = "aa3ef2033c43fd70ecb2ffa8fb4cf60546ed5f71e2750f93537a567373b4ddef"
DIAGNOSTIC_ID = "sealed-r006-tactical-outer-002"
WHOLE_BOUNDS_GLTF = [[-0.390625, -0.15234375, -0.3046875], [0.390625, 0.62890625, 0.3125]]
STEP = 0.015625
CASE_DUTIES = {
    "main": [[-0.375, -0.3125, -0.046875], [0.375, 0.296875, 0.5703125]],
    "crownShoulder": [[-0.359375, -0.296875, 0.5625], [0.359375, 0.296875, 0.6015625]],
    "crownCap": [[-0.328125, -0.265625, 0.59375], [0.328125, 0.265625, 0.625]],
    "crest": [[-0.09375, -0.21875, 0.6171875], [0.09375, 0.21875, 0.62890625]],
    "jawReturn": [[-0.3359375, -0.28125, -0.0625], [0.3359375, 0.3046875, 0.203125]],
    "browReturn": [[-0.28125, 0.28125, 0.1875], [0.28125, 0.3046875, 0.43359375]],
    "positiveEar": [[0.34765625, -0.15625, 0.15625], [0.390625, 0.125, 0.453125]],
}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def held_helper():
    path = HERE / "sealed_refinement.py"
    if digest(path) != HELD_HELPER_SHA:
        raise ValueError("Held first-revision helper changed")
    spec = importlib.util.spec_from_file_location("held_seal_refinement", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def mirrored(bounds):
    lo, hi = bounds
    return [[-hi[0], lo[1], lo[2]], [-lo[0], hi[1], hi[2]]]


def corner_layer(seal, bounds, slot, steps=0):
    """One or two explicit 16 mm corner-return courses, not fine repeated surface grooves."""
    from vox import Grid
    layer = Grid("GEO-joined-case-course")
    layer.continuous = True
    seal.raw_box(layer, bounds, "box", slot)
    lo, hi = bounds
    for corner_x in (-1, 1):
        for corner_y in (-1, 1):
            for i in range(steps):
                xa, xb = (lo[0] + i * STEP, lo[0] + (i + 1) * STEP) if corner_x < 0 else (
                    hi[0] - (i + 1) * STEP, hi[0] - i * STEP)
                ya, yb = (lo[1], lo[1] + (steps - i) * STEP) if corner_y < 0 else (
                    hi[1] - (steps - i) * STEP, hi[1])
                seal.raw_box(layer, [[xa, ya, lo[2]], [xb, yb, hi[2]]], "cut")
    return layer


def authored_outer_case(seal, visor_ids):
    import numpy as np
    from vox import Grid, SI
    old, visors, apertures, old_provenance = seal.repaired_helmet("tactical", visor_ids)
    keep = (old.isl > 0) & ((old.slot == SI["dark"]) | (old.slot == SI["metal"]))
    retained_slots = old.slot[keep].copy()
    retained_mask_sha = hashlib.sha256(keep.tobytes()).hexdigest()
    shell = Grid("helmet.tactical")
    shell.continuous = True
    shell.isl[keep] = old.isl[keep]
    shell.slot[keep] = retained_slots
    removed = int(np.count_nonzero((old.isl > 0) & ~keep))
    del old
    case = Grid("GEO-joined-Marine-outer-case")
    case.continuous = True
    for name, steps, slot in (("main", 2, "suit_primary"), ("crownShoulder", 1, "suit_primary"),
                              ("crownCap", 1, "suit_primary"), ("crest", 0, "accent"),
                              ("jawReturn", 1, "suit_primary"), ("browReturn", 0, "suit_primary")):
        case.merge(corner_layer(seal, CASE_DUTIES[name], slot, steps))
    for bounds in (CASE_DUTIES["positiveEar"], mirrored(CASE_DUTIES["positiveEar"])):
        case.merge(corner_layer(seal, bounds, "suit_primary", 1))
    # The existing cavity and exact window are geometric VOID duties, not skin/material hiding.
    seal.raw_box(case, seal.SUBSTRATE["cavity"], "cut")
    for xmin, zmin, xmax, zmax in apertures:
        seal.raw_box(case, [[xmin, 0.2, zmin], [xmax, 0.4, zmax]], "cut")
    # Broad pale case shoulders, ear return and cheek/jaw fields are connected surface duties.
    pale = [
        [[0.25, -0.296875, 0.5625], [0.359375, 0.296875, 0.6015625]],
        [[0.203125, -0.234375, 0.59375], [0.328125, 0.234375, 0.625]],
        [[0.37109375, -0.15625, 0.421875], [0.390625, 0.125, 0.453125]],
        [[0.296875, 0.125, 0.046875], [0.375, 0.296875, 0.1875]],
    ]
    for bounds in pale:
        seal.raw_box(case, bounds, "paint", "accent")
        seal.raw_box(case, mirrored(bounds), "paint", "accent")
    seal.raw_box(case, [[-0.3359375, 0.28125, -0.0625], [0.3359375, 0.3046875, 0.03125]], "paint", "accent")
    seal.raw_box(case, [[-0.28125, 0.296875, 0.1875], [0.28125, 0.3046875, 0.203125]], "paint", "accent")
    # Three shallow rear recesses and bilateral ear recesses end in finite navy floors. Cuts affect
    # only the new case grid, so the retained seal and metal interface cannot be perforated.
    rear_bands = [(0.265625, 0.296875), (0.328125, 0.359375), (0.390625, 0.421875)]
    for z0, z1 in rear_bands:
        seal.raw_box(case, [[-0.15625, -0.3125, z0], [0.15625, -0.30078125, z1]], "cut")
        seal.raw_box(case, [[-0.15625, -0.30078125, z0], [0.15625, -0.296875, z1]], "paint", "suit_secondary")
    ear_bands = [(0.234375, 0.265625), (0.28125, 0.3125), (0.328125, 0.359375)]
    for z0, z1 in ear_bands:
        cut = [[0.37890625, -0.09375, z0], [0.390625, 0.0625, z1]]
        floor = [[0.375, -0.09375, z0], [0.37890625, 0.0625, z1]]
        for bounds in (cut, mirrored(cut)):
            seal.raw_box(case, bounds, "cut")
        for bounds in (floor, mirrored(floor)):
            seal.raw_box(case, bounds, "paint", "suit_secondary")
    positive_overlap = int(np.count_nonzero(keep & (case.isl > 0)))
    case_cells = int(np.count_nonzero(case.isl > 0))
    shell.merge(case)
    retained = (shell.isl[keep] > 0).all() and np.array_equal(shell.slot[keep], retained_slots)
    if not retained or positive_overlap <= 0:
        raise ValueError("New case changed retained backing duties or lacks positive attachment")
    provenance = {"heldSealGridProvenance": old_provenance, "retainedBackingMaskSha256": retained_mask_sha,
                  "retainedBackingAndMetalCells": int(np.count_nonzero(keep)),
                  "retainedBackingAndMetalSlotsUnchanged": bool(retained), "removedOldOuterCaseCells": removed,
                  "newCaseOccupiedCells": case_cells, "positiveCaseBackingOverlapCells": positive_overlap,
                  "ventCutsAffectOnlyNewCase": True, "caseDutiesBlenderM": CASE_DUTIES,
                  "newUnionBevelM": 0.006, "newUnionBevelSegments": 2,
                  "rearVentZBands": rear_bands, "earVentZBands": ear_bands}
    return shell, visors, apertures, provenance


def main():
    started = time.monotonic()
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    out = Path(args.output).resolve()
    if out.exists() or out == ROOT or ROOT in out.parents:
        raise ValueError("Use a new immutable output directory outside the repository")
    seal = held_helper()
    previous = Path("/root/sidereal-scratch/sealed-head-r006-tactical-001")
    if digest(previous / "manifest.json") != PREVIOUS_DIAGNOSTIC_SHA or digest(previous / "helmets.glb") != PREVIOUS_GLB_SHA:
        raise ValueError("First diagnostic source/export pin changed")
    prior_manifest = ROOT / "assets/runtime/crew/heads/refinement-r005/manifest.json"
    if digest(prior_manifest) != seal.PREVIOUS_MANIFEST_SHA:
        raise ValueError("Old proposal pin changed")
    cat = json.loads((ROOT / "packages/content/src/crew-heads.v1.json").read_text())
    skulls = seal.source_skulls(ROOT / "assets/runtime/crew/heads/v1/heads.glb")
    import bpy
    sys.path.insert(0, str(HERE))
    import kit
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.data.images.new("crew.face.default", width=16, height=16, alpha=True)
    kit.BEVEL["sealed_outer"] = (0.006, 2)
    lib = kit.Library()
    visor_ids = [v["id"] for v in cat["visors"]]
    shell, visors, apertures, provenance = authored_outer_case(seal, visor_ids)
    helmet = lib.add("helmet.tactical", "helmet", "helmets", shell, bevel_kind="sealed_outer")
    seal.add_uvs(helmet.data)
    del shell
    for vid, grid in visors.items():
        visor = lib.add(f"visor.tactical.{vid}", "visor", "helmets", grid)
        seal.add_uvs(visor.data)
    del visors
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
    exported = seal.validate_export(path)
    expected = {"helmet.tactical", *(f"visor.tactical.{v}" for v in visor_ids)}
    if set(exported) != expected:
        raise ValueError("New diagnostic must preserve all six Tactical cosmetic identities")
    primitives = exported["helmet.tactical"]
    actual_bounds = [[min(p["boundsGltfM"][0][a] for p in primitives) for a in range(3)],
                     [max(p["boundsGltfM"][1][a] for p in primitives) for a in range(3)]]
    if any(abs(actual_bounds[i][a] - WHOLE_BOUNDS_GLTF[i][a]) > 0.000001 for i in range(2) for a in range(3)):
        raise ValueError(f"New case escaped or failed to retain exact aa3 overall bounds: {actual_bounds}")
    actual_mesh = seal.exported_shell_mesh(path, "helmet.tactical")
    metrics = seal.seal_metrics(actual_mesh, skulls, apertures)
    bpy.data.meshes.remove(actual_mesh)
    metrics["clearRayAperturesBlenderXZ"] = apertures
    metrics["actualWholeBoundsGltfM"] = actual_bounds
    source = out / "crew-helmets-sealed-outer-r006-002.blend"
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(source), compress=True)
    authoring = {p.name: digest(p) for p in (Path(__file__), HERE / "sealed_refinement.py", HERE / "parts_gear.py",
                                            HERE / "vox.py", HERE / "kit.py", HERE / "look.py")}
    manifest = {
        "schema": "sidereal.crew-head-seal-diagnostic.v1", "id": DIAGNOSTIC_ID,
        "status": "diagnostic-only-not-complete-release", "catalogRevision": cat["revision"], "headScale": 0.9,
        "space": cat["space"], "voxelMeters": cat["voxelMeters"], "helmets": ["tactical"], "visors": visor_ids,
        "files": {"helmets": {"path": path.name, "sha256": digest(path), "bytes": path.stat().st_size,
                                "nodes": list(lib.objects)}}, "nodes": lib.stats(),
        "sources": {"helmets": {"path": source.name, "sha256": digest(source), "scope": ["tactical"]}},
        "previousDiagnosticSha256": PREVIOUS_DIAGNOSTIC_SHA, "previousGlbSha256": PREVIOUS_GLB_SHA,
        "previousManifestSha256": seal.PREVIOUS_MANIFEST_SHA, "authoring": authoring,
        "sealedSkullSource": {"path": "assets/runtime/crew/heads/v1/heads.glb", "sha256": seal.SOURCE_HEAD_SHA},
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    receipt = {"status": "diagnostic-source-prerequisites-native-review-required", "id": DIAGNOSTIC_ID,
               "newGlbSha256": digest(path), "newGlbBytes": path.stat().st_size,
               "newManifestSha256": digest(out / "manifest.json"), "editableSourceSha256": digest(source),
               "heldHelperSha256": HELD_HELPER_SHA, "previousGlbSha256": PREVIOUS_GLB_SHA,
               "sourceHeadSha256": seal.SOURCE_HEAD_SHA, "expectedWholeBoundsGltfM": WHOLE_BOUNDS_GLTF,
               "exportedPrimitiveChecks": exported, "geometry": {"tactical": metrics}, "unionProvenance": provenance,
               "authoring": authoring, "elapsedSeconds": time.monotonic() - started,
               "nativeReviewRequired": ["front", "rear", "leftThreeQuarter", "rightThreeQuarter"],
               "nativeBodiesRequired": ["male", "female"], "fullSkullClearance": "not-established-by-coverage-rays"}
    (out / "geometry-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
    failed_directions = [f"{body}/{direction}" for body, report in metrics["skulls"].items()
                         for direction, proof in report["directions"].items() if proof["misses"]]
    if failed_directions or metrics["actualExportedOpaqueTopology"]["nonManifoldEdges"] or metrics["intentionalFaceAperture"]["opaqueBlocked"]:
        raise ValueError(f"New outer-case geometry prerequisites failed: {failed_directions}; retain this iteration unchanged")
    print(json.dumps({"output": str(out), "id": DIAGNOSTIC_ID, "glbSha256": digest(path),
                      "manifestSha256": digest(out / "manifest.json"), "elapsedSeconds": receipt["elapsedSeconds"],
                      "nativeAcceptance": "pending"}), flush=True)


if __name__ == "__main__":
    main()
