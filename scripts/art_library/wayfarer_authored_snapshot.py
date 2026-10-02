"""Copy the immutable completed authored kit into the private review namespace.

No Blender, active-study reads, authority changes, or overwrite of prior outputs.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil

MANIFEST_SHA = "9afe368702b81891905165fe2adef6c860f23b0d3ce5672e5bf1b6ad93a4d855"
LAYOUT_SHA = "c4cd70c8742943f625d068be45f19d72ee14596483410f1bc9e11f70bab9cb34"
SNAPSHOT_SHA = "bd85308e7280eb61438d442fe24ddb43f7d8d14d294dc26f3e1a0ac3a89b51f7"
DEFAULT_SOURCE = Path("/root/sidereal-art-archive/wayfarer-study-kit-r001/completed-authored-export-initial-188")
DEFAULT_OUTPUT = Path(__file__).resolve().parents[2] / "assets/runtime/ship-study/wayfarer-authored-r001"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def checked_relative(root, value):
    relative = Path(value)
    if relative.is_absolute() or ".." in relative.parts:
        raise ValueError("Unsafe snapshot path")
    result = root / relative
    if not result.resolve().is_relative_to(root.resolve()):
        raise ValueError("Snapshot path leaves root")
    return result


def stage(source, output):
    if output.exists():
        raise ValueError("Private snapshot already exists; do not overwrite")
    receipt_bytes = (source / "SHA256.json").read_bytes()
    if digest(receipt_bytes) != SNAPSHOT_SHA:
        raise ValueError("Frozen snapshot receipt hash mismatch")
    receipt = json.loads(receipt_bytes)
    rows = receipt["files"]
    if len(rows) != 191 or len({r["path"] for r in rows}) != 191:
        raise ValueError("Incomplete frozen snapshot")
    verified = {}
    for row in rows:
        data = checked_relative(source, row["path"]).read_bytes()
        if len(data) != row["bytes"] or digest(data) != row["sha256"]:
            raise ValueError(f"Frozen snapshot byte mismatch: {row['path']}")
        verified[row["path"]] = row
    for path, expected in [("export/manifest.json", MANIFEST_SHA), ("export/layout.json", LAYOUT_SHA)]:
        if verified[path]["sha256"] != expected:
            raise ValueError("Metadata pin mismatch")
    manifest = json.loads((source / "export/manifest.json").read_bytes())
    pieces = manifest["pieces"] + manifest["unique"]
    if len(manifest["pieces"]) != 177 or len(manifest["unique"]) != 11:
        raise ValueError("Wrong completed kit cohort")
    glbs = {r["path"] for r in rows if r["path"].endswith(".glb")}
    if glbs != {"export/" + p["file"] for p in pieces} or len(glbs) != 188:
        raise ValueError("Unexpected or missing GLB")
    for piece in pieces:
        if verified["export/" + piece["file"]]["sha256"] != piece["sha256"]:
            raise ValueError("Manifest/actual GLB mismatch")
    # Capture is immutable; these old source hashes are provenance, not a
    # full188 source-to-export reproducibility certificate.
    audit_row = next(r for r in rows if r["path"].endswith("audit.json"))
    audit = json.loads(checked_relative(source, audit_row["path"]).read_bytes())
    source_pins = {p: r["sha256"] for p, r in audit["sources"].items()}
    output.mkdir(parents=True)
    copied = []
    for path in ["export/manifest.json", "export/layout.json", *sorted(glbs)]:
        destination = checked_relative(output, path.removeprefix("export/"))
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(checked_relative(source, path), destination)
        if digest(destination.read_bytes()) != verified[path]["sha256"]:
            raise ValueError(f"Copied byte mismatch: {path}")
        copied.append({"file": path.removeprefix("export/"), "sha256": verified[path]["sha256"], "bytes": verified[path]["bytes"]})
    descriptor = {
        "schema": "sidereal.wayfarer-authored-study.r001",
        "manifestSha256": MANIFEST_SHA,
        "layoutSha256": LAYOUT_SHA,
        "snapshotSha256": SNAPSHOT_SHA,
        "sourcePins": source_pins,
        "files": copied,
        "framePolicy": "author-zup-column-rows; reusable-selected-once; unique-node-baked-external-identity",
        "surfacePolicy": {"plastic-deck": "plastic-dark", "emission": "min-original-strength-1", "lights": "native-game-budget"},
        "scope": "Private authored intact-surface trial. No collision, damage, catalog or authority migration.",
    }
    (output / "descriptor.json").write_text(json.dumps(descriptor, indent=2) + "\n")
    # The entire original archive is checked again after copying.
    for row in rows:
        if digest(checked_relative(source, row["path"]).read_bytes()) != row["sha256"]:
            raise ValueError("Frozen input changed during copy")
    if digest((source / "SHA256.json").read_bytes()) != SNAPSHOT_SHA:
        raise ValueError("Frozen receipt changed during copy")
    return {"complete": True, "inputFreeze": True, "files": len(copied), "glbs": len(glbs), "bytes": sum(row["bytes"] for row in copied), "descriptorSha256": digest((output / "descriptor.json").read_bytes()), "output": str(output)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    print(json.dumps(stage(args.source, args.output)))
