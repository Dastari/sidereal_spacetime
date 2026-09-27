"""Validate the published SHIPS-COMPONENTS runtime GLBs (run from scripts/check_art.py).

For every `ship-components/<rev>` entry in scripts/prepare_app.py PUBLISHED_RUNTIME:
- the manifest lists one GLB per component, and every id the prefab ships require
  (`requiredComponentIds`, written by the runtime export) has one, so no prefab component
  silently falls back to a procedural stand-in;
- each GLB is valid binary glTF 2.0 whose bytes match the manifest sha256, has triangles, and
  uses only the nine fixed material slots (`slot<i>_<role>`);
- the editable Blender source (.blend) named by the manifest exists and matches its sha256,
  and is not inside the published runtime tree.
"""
import hashlib
import json
import re
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SLOTS = ["primary", "secondary", "accent", "trim", "metal", "dark", "emit_a", "emit_b", "glass"]
SLOT_NAME = re.compile(r"^slot([0-8])_([a-z_]+)$")


def glb(path):
    data = path.read_bytes()
    magic, version, size = struct.unpack_from("<III", data)
    assert magic == 0x46546C67 and version == 2 and size == len(data), f"not a glTF 2.0 binary (LFS pointer?): {path}"
    length, kind = struct.unpack_from("<II", data, 12)
    assert kind == 0x4E4F534A, path
    return json.loads(data[20:20 + length])


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    source = (ROOT / "scripts/prepare_app.py").read_text()
    revisions = re.findall(r'"(ship-components/r\d+)"', source)
    assert revisions, "no ship-components entry in PUBLISHED_RUNTIME"
    for entry in revisions:
        folder = ROOT / "assets/runtime" / entry
        manifest = json.loads((folder / "manifest.json").read_text())
        rows = {r["id"]: r for r in manifest["components"]}
        missing = sorted(set(manifest.get("requiredComponentIds", [])) - set(rows))
        assert not missing, f"{entry}: prefab components without a published GLB (would render stand-ins): {missing}"
        blend = manifest.get("source", {}).get("blend")
        assert blend, f"{entry}: manifest names no .blend source"
        blend_path = ROOT / blend
        assert blend_path.exists() and not blend_path.is_relative_to(ROOT / "assets/runtime"), f"{entry}: source {blend}"
        assert sha(blend_path) == manifest["source"]["sha256"], f"{entry}: source .blend changed: {blend}"
        triangles = 0
        for cid, row in sorted(rows.items()):
            path = folder / f"{cid}.glb"
            assert path.exists(), f"{entry}: missing {path.name}"
            assert sha(path) == row["sha256"], f"{entry}: GLB bytes changed: {path.name}"
            model = glb(path)
            for m in model.get("materials", []):
                match = SLOT_NAME.match(m.get("name", ""))
                assert match and SLOTS[int(match.group(1))] == match.group(2), f"{path.name}: material {m.get('name')} is not a fixed slot"
            tris = sum(model["accessors"][p["indices"]]["count"] // 3 for mesh in model["meshes"] for p in mesh["primitives"])
            assert tris > 0, f"{path.name}: no triangles"
            triangles += tris
        print(json.dumps({"asset": entry, "components": len(rows), "required": len(manifest.get("requiredComponentIds", [])),
                          "triangles": triangles, "source": blend, "ship_components": "passed"}))


def objects():
    """Prefab interior object GLBs (`ship-objects/<rev>`): same rules, keyed by design id."""
    source = (ROOT / "scripts/prepare_app.py").read_text()
    for entry in re.findall(r'"(ship-objects/r\d+)"', source):
        folder = ROOT / "assets/runtime" / entry
        manifest = json.loads((folder / "manifest.json").read_text())
        rows = {r["designId"]: r for r in manifest["objects"]}
        missing = sorted(set(manifest.get("requiredObjectIds", [])) - set(rows))
        assert not missing, f"{entry}: object designs without a GLB: {missing}"
        blend_path = ROOT / manifest["source"]["blend"]
        assert blend_path.exists() and not blend_path.is_relative_to(ROOT / "assets/runtime"), entry
        assert sha(blend_path) == manifest["source"]["sha256"], f"{entry}: source .blend changed"
        for did, row in sorted(rows.items()):
            path = folder / f"{did}.glb"
            assert sha(path) == row["sha256"], f"{entry}: GLB bytes changed: {path.name}"
            model = glb(path)
            for m in model.get("materials", []):
                match = SLOT_NAME.match(m.get("name", ""))
                assert match and SLOTS[int(match.group(1))] == match.group(2), f"{path.name}: {m.get('name')}"
        print(json.dumps({"asset": entry, "objects": len(rows), "source": manifest["source"]["blend"], "ship_objects": "passed"}))


if __name__ == "__main__":
    main()
    objects()
