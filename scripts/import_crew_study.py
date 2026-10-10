#!/usr/bin/env python3
"""Import immutable crew-study runtime exports; the authoring tree is read-only."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

from archive_crew_study import safe_file, verify_export


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def import_study(source, repo, revision):
    if not re.fullmatch(r"study-v2-r[0-9]{3}", revision):
        raise ValueError("Revision must be an explicit study-v2-rNNN")
    source = source.resolve()
    exports = source / "export"
    target = repo / "assets/runtime/crew" / revision
    verify_export(exports)
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
        if path.stat().st_size != record["bytes"] or digest(path) != record["sha256"]:
            raise ValueError(f"Source manifest mismatch: {path}")
        files.add(record["file"])
    for face in manifest["face"].values():
        files.update((face["png"], face["json"]))
    before = {name: {"sha256": digest(safe_file(exports, name)), "bytes": safe_file(exports, name).stat().st_size} for name in sorted(files)}
    if target.exists():
        receipt = json.loads((target / "source-snapshot.json").read_text())
        if receipt["files"] != before or receipt["sourceCommit"] != commit:
            raise ValueError("Immutable revision already exists with different exports; use a new revision")
        for name, record in before.items():
            path = safe_file(target, name)
            if path.stat().st_size != record["bytes"] or digest(path) != record["sha256"]:
                raise ValueError(f"Immutable revision file differs: {name}")
    snapshot = {"schema": "sidereal.crew.source-snapshot/1", "revision": revision, "status": "provisional, not owner-approved", "sourceCommit": commit, "crewScale": manifest["crewScale"], "runtimeCrewScale": manifest["runtimeCrewScale"], "files": before}
    if not target.exists():
        target.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix=".crew-intake-", dir=target.parent) as temporary:
            staged = Path(temporary) / "snapshot"
            for name in sorted(files):
                dest = staged / name
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(safe_file(exports, name), dest)
            for name, record in before.items():
                if digest(safe_file(exports, name)) != record["sha256"] or digest(safe_file(staged, name)) != record["sha256"]:
                    raise ValueError(f"Source changed during snapshot: {name}")
            if subprocess.check_output(["git", "-C", str(source), "rev-parse", "HEAD"], text=True).strip() != commit:
                raise ValueError("Source commit changed during snapshot")
            (staged / "source-snapshot.json").write_text(json.dumps(snapshot, indent=2) + "\n")
            staged.rename(target)
    parts = {name: {key: part[key] for key in ["slot", "palette", "families", "covers", "covers_by_mode", "hair_mode", "files"] if key in part} for name, part in manifest["parts"].items()}
    clips = {clip["name"]: {key: clip[key] for key in ["loop", "frames", "fps", "nominalSpeed", "expressionTrack", "supportIK", "supportTarget", "sight", "grabFrame", "rootMotionM"] if key in clip} for clip in manifest["animation"]["clips"]}
    catalog = {"revision": revision, "sourceCommit": commit, "manifestSha256": before["crew-manifest.json"]["sha256"], "body": manifest["files"]["crew-body.glb"], "animation": manifest["files"]["anim/crew-anims.glb"], "parts": parts, "face": manifest["face"], "items": {name: {key: item[key] for key in ["class", "two_handed", "files", "palette", "families", "holster", "sightDeploy"] if key in item} for name, item in manifest["items"].items()}, "clips": clips, "holsters": manifest["animation"]["holsters"]}
    (repo / "packages/content/src/crew-study.catalog.json").write_text(json.dumps(catalog, separators=(",", ":")) + "\n")
    return snapshot


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--revision", required=True, help="New immutable revision, e.g. study-v2-r002")
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[1]
    snapshot = import_study(args.source, repo, args.revision)
    subprocess.run([str(repo / "node_modules/.bin/prettier"), "--write", str(repo / "packages/content/src/crew-study.catalog.json")], check=True)
    print(f"Pinned {len(snapshot['files'])} files, {sum(r['bytes'] for r in snapshot['files'].values())} bytes from {snapshot['sourceCommit']}")


if __name__ == "__main__":
    main()
