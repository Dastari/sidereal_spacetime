"""Inventory grid footprint of a crew item, derived from its voxel bounds (pure Python, no Blender).

Rule (mirrored by `crewItemGridFootprint` in packages/content/src/crew-items.ts and checked by its
tests): the item is laid in the grid showing its two largest faces in its natural icon view.

- The view looks along the item's thinnest horizontal axis: side view (screen X = +Y forward) when
  width X <= length Y, else front view (screen X = X). Screen Y is always the item's up axis Z.
- One grid cell is CELL_VOXELS voxels (8 x 1/32 m = 0.25 m). A span of v voxels takes
  max(1, ceil((v - OVERHANG_VOXELS) / CELL_VOXELS)) cells: a single-voxel trim may overhang.
- The footprint is (columns, rows) of that view: width = horizontal cells, height = vertical cells.
  Rotation in the grid swaps them (the item's `rotated` flag); icons are drawn to match.

Usage: python3 scripts/art_library/crew_items/footprint.py [--write] packages/content/src/crew-items-r001.json
"""
import json
import math
import os
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))

CELL_VOXELS = 8
OVERHANG_VOXELS = 1


def cells(voxels):
    return max(1, math.ceil((voxels - OVERHANG_VOXELS) / CELL_VOXELS))


def icon_view(size_voxels):
    """'side' (screen X = item +Y) or 'front' (screen X = item X)."""
    x, y, _ = size_voxels
    return "side" if x <= y else "front"


def footprint(size_voxels):
    x, y, z = size_voxels
    horizontal = y if icon_view(size_voxels) == "side" else x
    return {"width": cells(horizontal), "height": cells(z), "view": icon_view(size_voxels)}


def prettier(path):
    """Format a written JSON file like the repository format check (best effort, needs npm deps)."""
    try:
        subprocess.run(["npx", "prettier", "--write", path], cwd=ROOT, check=True, capture_output=True)
    except (OSError, subprocess.CalledProcessError) as error:
        print(f"[footprint] prettier unavailable ({error}); run npm run format on {path}")


def main(argv):
    write = "--write" in argv
    paths = [a for a in argv if not a.startswith("--")]
    path = paths[0] if paths else "packages/content/src/crew-items-r001.json"
    with open(path) as f:
        data = json.load(f)
    changed = 0
    for item in data["items"]:
        grid = footprint(item["sizeVoxels"])
        if item.get("grid") != grid:
            changed += 1
            item["grid"] = grid
        print(f"{item['id']:16s} {item['sizeVoxels']} -> {grid['width']}x{grid['height']} ({grid['view']})")
    if write and changed:
        with open(path, "w") as f:
            json.dump(data, f, indent=1)
            f.write("\n")
        prettier(path)
        # The runtime manifest pins the content JSON by hash (build.py writes both).
        import hashlib
        manifest_path = os.path.join(ROOT, "assets/runtime/crew/items", data["revision"], "manifest.json")
        with open(manifest_path) as f:
            manifest = json.load(f)
        with open(path, "rb") as f:
            manifest["contentSha256"] = hashlib.sha256(f.read()).hexdigest()
        with open(manifest_path, "w") as f:
            json.dump(manifest, f, indent=1)
            f.write("\n")
    print(f"{changed} item(s) {'updated' if write else 'differ'}")


if __name__ == "__main__":
    main(sys.argv[1:])
