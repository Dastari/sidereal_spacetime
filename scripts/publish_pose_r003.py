"""Install the exact paired r003 handheld namespace after integration review.

This is a local asset installation, not a service/public-client deployment. It
never updates the living design ledger, r002, modular crew or canonical equipment.
The integrating agent records the receipt/evidence in the ledger separately.
"""
from pathlib import Path
import argparse
import datetime
import fcntl
import hashlib
import json
import os
import shutil
import struct
import tempfile

ROOT = Path(__file__).resolve().parents[1]
FAMILY = ROOT / "assets/art-library/designs/crew.animation.aim"
SOURCE = FAMILY / "revisions/r003"
OUT = ROOT / "assets/runtime/crew/poses/r003"
PUBLICATION = FAMILY / "publications/r003"
PUBLIC_BASE = "/assets/crew/poses/r003/"
ITEMS = ("carbine", "compact-pistol", "flashlight", "heavy-handgun",
         "long-rifle", "plasma-cutter", "sample-scanner")
PINNED = {
    "runtime-aim-space.json": "ec269e27b11673dc9080da6114d51ddfdfff26f8acad773c4e0951c4168e1885",
    "profile-socket-metadata.json": "f9f35de6789cdc6c37373368c57b181d48e07643206e06922b58ff0939a0bc03",
    "equipment/manifest.json": "d68ea8798b56eb0b29f086ba295aa1661aebdbb809c94a675960cf254b7d43f1",
    "equipment/carbine.glb": "394d9577d078c21b1066743ab9dd5760d63fb9f6a161e4e823ae2ebbec25f983",
    "equipment/compact-pistol.glb": "5a6516f85126486d37ffb0ecf9d12bfeac25f28a0b35976d7d7128aa98b4bbbb",
    "equipment/flashlight.glb": "6ebe55855b087ca2b983c0856a440d4d984d26d390ae88ec076183e3fdf46643",
    "equipment/heavy-handgun.glb": "329cd64ccbdeba1e12e6df85c8ecd331c3e8b3781e95a3cb434f5b61834e36e9",
    "equipment/long-rifle.glb": "1aff2054ef80836d2e13624dca342fa99e1c43518ef0c9cfe180fddefdd96031",
    "equipment/plasma-cutter.glb": "1fdc536778e0726a88ca1eb0d569524c8de0176607d9d31ee993e9df1e4f0371",
    "equipment/sample-scanner.glb": "8e1a9a64f22f41bc9e171dbe63c93b9605dbc9582f5987029741c6cd586fee74",
}
NATIVE = {
    "equipment/handheld-source.blend": "649dd3b63d2f1cfe07eadd49de7e33968386dd0a7d41d09f5c2f890be7395f3f",
}
VALIDATION_INPUTS = {
    "equipment-delivery-manifest.json": "fdf3b0df9d4b73ba96d5c5962da403d6fa90cb575a7dc1173604bf1113f1c6de",
    "equipment-native-validation.json": "0b3455a3b1f5bb44321318725470f27e0ffcc221b64861f5b19d0239c7e843c7",
    "equipment-export-validation.json": "5a34a8a34255e771e301991ffe6e93ca83b5b261ea321745b25879445982e99d",
}
CREW = "assets/runtime/crew/components/modular-crew.glb"
CREW_SHA = "ae4a7e12096bd9aaac0bdfb178354d899b89af15cbc20293815c301871694150"
CREW_MANIFEST = "assets/runtime/crew/components/manifest.json"
CREW_MANIFEST_SHA = "d9d407260ebd6b989ef0adecf4b4c72a4249a8ae5d3b35fa28f8f68326d02840"
PRIOR_RECEIPT = "assets/art-library/designs/crew.animation.aim/publications/r002/publication.json"
PRIOR_RECEIPT_SHA = "1cf5dce47508957e3b3319b858773a415c452acf43f0a8ed02cdc0782fb9b3e6"
QUOTE = "You can make the live normal game use all the new models and poses etc... Don't need to gat e it."
MESSAGE = ("Standing owner authorization in the shared character/combat integration conversation on "
           "2026-09-09, followed by the owner's seven specific combat-pose correction requests on "
           "2026-09-10. This permits normal-game integration; it is not final artistic approval.")
CORRECTIONS = [
    "Immediate movement-facing outside combat while carrying a weapon.",
    "Shouldered rifle stance; preserve the former heavy-tool/minigun stance for suitable equipment.",
    "Cursor-driven vertical aiming through the physical rig and muzzle, with clipped beam direction.",
    "A visible combat-mode cursor.",
    "A non-combat low-ready rifle pose.",
    "A relaxed free left arm with one-handed weapons.",
    "Forward-bending knees without sideways combat-leg deformation.",
]
PRESERVED_TREES = (
    "assets/runtime/equipment", "assets/runtime/crew/components",
    "assets/runtime/crew/poses/r002",
    "assets/art-library/designs/crew.animation.aim/publications/r002",
)
PRESERVED_FILES = (
    "assets/source/equipment-kit.blend", "scripts/publish_pose_runtime.py",
    "scripts/validate_installed_poses.py",
)


def require(value, reason):
    """Publication guards must remain enabled under python -O."""
    if not value:
        raise ValueError(reason)


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def digest(path):
    require(path.is_file() and not path.is_symlink(), f"Missing/non-regular artifact: {path}")
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def write(path, data):
    with path.open("x", encoding="utf-8") as stream:
        stream.write(json.dumps(data, indent=2) + "\n")
        stream.flush()
        os.fsync(stream.fileno())


def tree_files(directory):
    require(directory.is_dir() and not directory.is_symlink(), f"Missing/non-regular directory: {directory}")
    paths = list(directory.rglob("*"))
    require(not any(path.is_symlink() for path in paths), f"Symlink in artifact namespace: {directory}")
    return sorted(path for path in paths if path.is_file())


def validate_runtime(directory):
    """Exact ten-file byte set plus independently checked manifest/socket pairing."""
    require({p.relative_to(directory).as_posix() for p in tree_files(directory)} == set(PINNED),
            "Runtime namespace must contain exactly the ten paired files")
    for name, expected in PINNED.items():
        require(digest(directory / name) == expected, f"Runtime hash mismatch: {name}")
    metadata = read(directory / "profile-socket-metadata.json")
    manifest = read(directory / "equipment/manifest.json")
    require(metadata["revision"] == "r003" and set(metadata["items"]) == set(ITEMS), "r003 item metadata mismatch")
    require(len(manifest["entries"]) == len(ITEMS) and {e["id"] for e in manifest["entries"]} == set(ITEMS),
            "Equipment manifest must contain each paired item once")
    for entry in manifest["entries"]:
        item = entry["id"]
        require(entry["file"] == item + ".glb" and entry["sha256"] == PINNED["equipment/" + entry["file"]],
                f"Equipment manifest/file pairing mismatch: {item}")
        sockets = metadata["items"][item]
        require(sockets["assetId"] == item, f"Equipment socket identity mismatch: {item}")
        aim = sockets["sockets"].get("Aim.Muzzle", sockets["sockets"].get("Aim.Direction"))
        require(entry["anchors"]["muzzle"] == aim, f"Physical aim/muzzle metadata mismatch: {item}")
        # Historical pistol manifests retain an optional offhand anchor, but
        # r003 one-handed metadata intentionally omits the secondary constraint.
        support = sockets["sockets"].get("Grip.Secondary", sockets["sockets"].get("SupportHandContact"))
        if support is not None:
            require(entry["anchors"].get("supportPalm") == support,
                    f"Support socket metadata mismatch: {item}")
        raw = (directory / "equipment" / entry["file"]).read_bytes()
        require(len(raw) >= 20 and raw[:4] == b"glTF" and struct.unpack_from("<II", raw, 4) == (2, len(raw)),
                f"Invalid GLB header/length: {item}")
        size, kind = struct.unpack_from("<II", raw, 12)
        require(kind == 0x4E4F534A and 20 + size <= len(raw), f"Invalid GLB JSON chunk: {item}")
        gltf = json.loads(raw[20:20 + size])
        require(gltf.get("meshes") and gltf.get("materials") and gltf.get("buffers"), f"Incomplete GLB: {item}")
        require(not any("uri" in b for b in gltf["buffers"]) and
                not any("uri" in image for image in gltf.get("images", [])), f"External GLB dependency: {item}")
        if item in ("carbine", "long-rifle"):
            nodes = [n for n in gltf["nodes"] if n.get("extras", {}).get("semanticSocket") == "Grip.Secondary"]
            expected = sockets["sockets"]["Grip.Secondary"]
            require(len(nodes) == 1 and len(nodes[0].get("translation", [])) == 3 and
                    all(abs(a - b) < 1e-6 for a, b in zip(nodes[0]["translation"], expected)),
                    f"Native support socket export mismatch: {item}")


def validate_source():
    for name, expected in VALIDATION_INPUTS.items():
        require(digest(SOURCE / name) == expected, f"Pinned validation record mismatch: {name}")
    delivery = read(SOURCE / "equipment-delivery-manifest.json")
    native = read(SOURCE / "equipment-native-validation.json")
    export = read(SOURCE / "equipment-export-validation.json")
    require(delivery["revision"] == "r003" and delivery["owner_final_signoff"] is None,
            "Staged delivery revision/sign-off mismatch")
    require(delivery["validation_sha256"] == VALIDATION_INPUTS["equipment-native-validation.json"],
            "Delivery/native validation mismatch")
    require(native["status"] == "native geometry/contact validation pass; full rig/browser validation pending" and
            export["status"] == "pass", "Native/export acceptance state changed")
    expected_files = {**PINNED, **NATIVE}
    require(set(delivery["files"]) == set(native["files"]) == set(expected_files), "Source delivery file set mismatch")
    for name, expected in expected_files.items():
        path = SOURCE / name
        require(digest(path) == expected == delivery["files"][name]["sha256"] == native["files"][name]["sha256"],
                f"Source/native/delivery hash mismatch: {name}")
        require(path.stat().st_size == delivery["files"][name]["bytes"] == native["files"][name]["bytes"],
                f"Source byte count mismatch: {name}")
    for item in ("carbine", "long-rifle"):
        record = export["assets"][item]
        require(record["sha256"] == PINNED[f"equipment/{item}.glb"] and
                record["unchanged_triangle_indices"] and record["all_material_definitions_unchanged"] and
                record["all_changed_vertices_match_native_foregrip_affine_edit"] and
                record["max_native_export_delta_m"] < 1e-6, f"Native GLB verification failed: {item}")
    metadata = read(SOURCE / "profile-socket-metadata.json")
    require(metadata["native_source_sha256"] == NATIVE["equipment/handheld-source.blend"], "Native socket source mismatch")
    require(digest(ROOT / native["source"]) == native["source_sha256"], "Preserved prior native source changed")
    return native


def preservation_snapshot():
    """Read-only snapshot of the prior namespace, canonical kit and whole r008 kit."""
    require(digest(ROOT / PRIOR_RECEIPT) == PRIOR_RECEIPT_SHA, "Prior r002 receipt changed")
    require(digest(ROOT / CREW) == CREW_SHA and digest(ROOT / CREW_MANIFEST) == CREW_MANIFEST_SHA,
            "Installed paired r008 crew changed")
    prior = read(ROOT / PRIOR_RECEIPT)
    for name, record in prior["files"].items():
        require(digest(ROOT / prior["runtimeRoot"] / name) == record["sha256"], f"Prior paired r002 file changed: {name}")
    paths = [path for name in PRESERVED_TREES for path in tree_files(ROOT / name)]
    paths += [ROOT / name for name in PRESERVED_FILES]
    paths += [ROOT / name for name in prior["preservedNativeSources"]]
    for name, record in prior["files"].items():
        path = ROOT / prior["sourceRoot"] / name
        require(digest(path) == record["sha256"], f"Prior r002 source artifact changed: {name}")
        paths.append(path)
    for name, expected in prior["validationInputs"].items():
        path = ROOT / prior["sourceRoot"] / name
        require(digest(path) == expected, f"Prior r002 validation input changed: {name}")
        paths.append(path)
    for name, expected in prior["preservedNativeSources"].items():
        require(digest(ROOT / name) == expected, f"Prior native source changed: {name}")
    crew = read(ROOT / CREW_MANIFEST)
    require(crew["revision"] == 8 and digest(ROOT / crew["blenderSource"]) == crew["sourceSha256"],
            "Native r008 crew provenance changed")
    paths += [ROOT / crew["blenderSource"], ROOT / crew["publication"]]
    return {path.relative_to(ROOT).as_posix(): digest(path) for path in sorted(set(paths))}


def receipt_for(snapshot, timestamp):
    return {
        "schema": "sidereal.pose-runtime-publication.v1", "revision": "r003", "recordedAt": timestamp,
        "publicBaseUrl": PUBLIC_BASE, "runtimeRoot": OUT.relative_to(ROOT).as_posix(),
        "sourceRoot": SOURCE.relative_to(ROOT).as_posix(),
        "authorization": {"ownerQuote": QUOTE, "messageReference": MESSAGE,
                          "scope": "Standing normal-game model/pose activation plus the seven requested corrections.",
                          "finalArtSignoff": False},
        "requestedCorrections": CORRECTIONS,
        "files": {name: {"sha256": expected, "bytes": (SOURCE / name).stat().st_size}
                  for name, expected in PINNED.items()},
        "preservedNativeSources": {(SOURCE / name).relative_to(ROOT).as_posix(): expected for name, expected in NATIVE.items()},
        "validationInputs": VALIDATION_INPUTS,
        "pairedCrew": {"runtime": CREW, "revision": "r008", "sha256": CREW_SHA,
                       "compatibility": "Installed modular male/female bodies, original shared 16-bone rig; no historical crew-poses.glb replacement."},
        "previousPairedPublication": {"path": PRIOR_RECEIPT, "sha256": PRIOR_RECEIPT_SHA},
        "rollback": {"mode": "Select preserved r002 paired runtime/controller configuration; this installer overwrites no existing namespace.",
                     "canonicalSnapshot": (PUBLICATION / "canonical-before.json").relative_to(ROOT).as_posix(),
                     "canonicalSnapshotSha256": snapshot},
        "ownerFinalSignoff": None,
        "limits": [
            "Source manifests and native-validation pending-browser labels are immutable historical bytes; this receipt records installation authorization only.",
            "The seven corrections require matching runtime controller integration and recorded visual/numeric tests; this installer does not certify their behavior.",
            "Native geometry/contact/export checks do not establish final shoulder, optic, mixed-armor or extreme-pitch visual acceptance.",
            "Actual live browser playback, release evidence and remaining fit limitations are maintained by the integrating agent in the living ledger.",
            "Inventory, permissions, canonical transforms and combat authority are unchanged by asset installation.",
        ],
    }


def commit_staged(runtime_stage, receipt_stage, validate_installed):
    """Commit only fully validated staging directories; do not overwrite paths.
    This small helper also permits fault testing on isolated temporary fixtures.
    """
    require(not os.path.lexists(OUT) and not os.path.lexists(PUBLICATION),
            "Another r003 namespace appeared during staging")
    runtime_moved = receipt_moved = False
    try:
        runtime_stage.rename(OUT)
        runtime_moved = True
        receipt_stage.rename(PUBLICATION)
        receipt_moved = True
        return validate_installed()
    except BaseException:
        # These paths were newly created by this invocation, never prior work.
        if receipt_moved:
            PUBLICATION.rename(receipt_stage)
        if runtime_moved:
            OUT.rename(runtime_stage)
        raise


def install():
    """No public directory receives individual copies. Both completed directories
    are staged on their destination filesystem and atomically renamed. Ordinary
    second-rename errors roll back the first; interruption leaves a complete but
    unreceipted namespace which subsequent calls refuse, rather than repairing it.
    """
    # A stable lock inode avoids concurrent installers bypassing a removed lock.
    # It lives outside the ten-file runtime namespace and the art revision.
    lock_root = ROOT / ".runtime"
    lock_root.mkdir(exist_ok=True)
    with (lock_root / "pose-r003-install.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if os.path.lexists(OUT) or os.path.lexists(PUBLICATION):
            require(OUT.is_dir() and PUBLICATION.is_dir(), "Incomplete existing r003 publication; preserve it for integration review")
            from validate_installed_poses_r003 import validate
            validate()
            return {"revision": "r003", "alreadyInstalled": True, "ownerFinalSignoff": None}
        validate_source()
        preserved = preservation_snapshot()
        OUT.parent.mkdir(parents=True, exist_ok=True)
        PUBLICATION.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix=".r003-runtime-", dir=OUT.parent) as runtime_temp, \
                tempfile.TemporaryDirectory(prefix=".r003-receipt-", dir=PUBLICATION.parent) as receipt_temp:
            runtime_stage = Path(runtime_temp) / "r003"
            receipt_stage = Path(receipt_temp) / "r003"
            runtime_stage.mkdir()
            receipt_stage.mkdir()
            for name in PINNED:
                target = runtime_stage / name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(SOURCE / name, target)
                with target.open("rb") as stream:
                    os.fsync(stream.fileno())
            validate_runtime(runtime_stage)
            write(receipt_stage / "canonical-before.json", preserved)
            receipt = receipt_for(digest(receipt_stage / "canonical-before.json"),
                                  datetime.datetime.now(datetime.timezone.utc).isoformat())
            write(receipt_stage / "publication.json", receipt)
            # Detect source/preserved-file changes while copies were staged.
            validate_source()
            require(preservation_snapshot() == preserved, "Preserved artifacts changed during staging")
            from validate_installed_poses_r003 import validate
            return commit_staged(runtime_stage, receipt_stage, validate)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--validate-source", action="store_true", help="Read-only preflight; does not install or create publication paths")
    args = parser.parse_args()
    if args.validate_source:
        validate_source()
        preserved = preservation_snapshot()
        print(json.dumps({"revision": "r003", "sourcePreflight": "pass", "runtimeFiles": len(PINNED),
                          "preservedFiles": len(preserved), "installed": False, "ownerFinalSignoff": None}))
    else:
        print(json.dumps(install()))


if __name__ == "__main__":
    main()
