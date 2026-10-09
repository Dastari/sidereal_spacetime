#!/usr/bin/env python3
"""Import immutable crew-study runtime exports; the authoring tree is read-only."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[1]
    source = args.source.resolve()
    exports = source / "export"
    revision = "study-v2-r001"
    target = repo / "assets/runtime/crew" / revision
    manifest = json.loads((exports / "crew-manifest.json").read_text())
    commit = subprocess.check_output(["git", "-C", str(source), "rev-parse", "HEAD"], text=True).strip()
    files = {"crew-manifest.json", "anim/clips.json"}
    records = list(manifest["files"].values())
    for part in manifest["parts"].values():
        records.extend(part["files"].values())
    for item in manifest["items"].values():
        records.extend(item["files"].values())
    for record in records:
        path = exports / record["file"]
        if digest(path) != record["sha256"]:
            raise ValueError(f"Source manifest mismatch: {path}")
        files.add(record["file"])
    for face in manifest["face"].values():
        files.update((face["png"], face["json"]))
    before = {name: {"sha256": digest(exports / name), "bytes": (exports / name).stat().st_size} for name in sorted(files)}
    if target.exists():
        receipt = json.loads((target / "source-snapshot.json").read_text())
        if receipt["files"] != before:
            raise ValueError("Immutable revision already exists with different exports; use a new revision")
    for name in sorted(files):
        dest = target / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(exports / name, dest)
    for name, record in before.items():
        if digest(exports / name) != record["sha256"] or digest(target / name) != record["sha256"]:
            raise ValueError(f"Source changed during snapshot: {name}")
    if subprocess.check_output(["git", "-C", str(source), "rev-parse", "HEAD"], text=True).strip() != commit:
        raise ValueError("Source commit changed during snapshot")
    snapshot = {"schema": "sidereal.crew.source-snapshot/1", "revision": revision, "status": "provisional, not final owner art signoff", "sourceCommit": commit, "crewScale": manifest["crewScale"], "runtimeCrewScale": manifest["runtimeCrewScale"], "files": before}
    (target / "source-snapshot.json").write_text(json.dumps(snapshot, indent=2) + "\n")
    parts = {name: {key: part[key] for key in ["slot", "palette", "families", "covers", "covers_by_mode", "hair_mode", "files"] if key in part} for name, part in manifest["parts"].items()}
    clips = {clip["name"]: {key: clip[key] for key in ["loop", "frames", "fps", "nominalSpeed", "expressionTrack", "supportIK", "supportTarget", "sight", "grabFrame", "rootMotionM"] if key in clip} for clip in manifest["animation"]["clips"]}
    catalog = {"revision": revision, "sourceCommit": commit, "manifestSha256": before["crew-manifest.json"]["sha256"], "body": manifest["files"]["crew-body.glb"], "animation": manifest["files"]["anim/crew-anims.glb"], "parts": parts, "face": manifest["face"], "items": {name: {key: item[key] for key in ["class", "two_handed", "files", "palette", "families", "holster", "sightDeploy"] if key in item} for name, item in manifest["items"].items()}, "clips": clips, "holsters": manifest["animation"]["holsters"]}
    (repo / "packages/content/src/crew-study.catalog.json").write_text(json.dumps(catalog, separators=(",", ":")) + "\n")
    subprocess.run([str(repo / "node_modules/.bin/prettier"), "--write", str(repo / "packages/content/src/crew-study.catalog.json")], check=True)
    print(f"Pinned {len(files)} files, {sum(r['bytes'] for r in before.values())} bytes from {commit}")


if __name__ == "__main__":
    main()
