"""Render the r001 inventory GRID icons: one transparent PNG per item at its grid footprint aspect.

  nice -n 15 blender -b --factory-startup --python-exit-code 1 -P scripts/art_library/crew_items/grid_icons.py -- \
      -t 2 [--out assets/runtime/crew/items/r001/icons/grid] [--px 96] [--samples 16] [--only pistol,rifle]

Each icon is `grid.width * px` x `grid.height * px` (footprint.py): the natural view of the item
(side view with the muzzle/front to the right, or front view for wide flat items) with a light 3/4
turn, fitted to the footprint so it fills its cells crisply in the inventory grid. The UI rotates
the image by 90 degrees for rotated placements. Built from the same authoring recipe as the runtime
GLBs (items.py), so the icon always matches the held model.
"""
import argparse
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))

import bpy  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

from crew_items import blend, body_frames, footprint, items as ITEMS, render as R  # noqa: E402


def args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--out", default=os.path.join(ROOT, "assets/runtime/crew/items/r001/icons/grid"))
    p.add_argument("--px", type=int, default=96, help="pixels per grid cell")
    p.add_argument("--samples", type=int, default=16)
    p.add_argument("--only", default="")
    return p.parse_args(argv)


def view_matrix(view):
    """Item frame -> camera frame. The ortho camera looks along +Y with +Z up (render.ortho_front).
    side: item +Y (forward) -> screen right; front: item +X -> screen right, its -Y face (screen,
    cross, cells) toward the camera.
    A light turn and tilt give the 3/4 read of the catalogue icons without losing the silhouette."""
    base = Matrix.Rotation(math.radians(-90), 4, "Z") if view == "side" else Matrix.Identity(4)
    turn = Matrix.Rotation(math.radians(-18 if view == "side" else 18), 4, "Z")
    tilt = Matrix.Rotation(math.radians(14), 4, "X")
    return tilt @ turn @ base


def fit(item, rot, width, height, margin=0.9):
    b = item.bounds()
    corners = [Vector(item.to_metres((x, y, z))) for x in (b[0], b[3]) for y in (b[1], b[4]) for z in (b[2], b[5])]
    rc = [rot.to_3x3() @ c for c in corners]
    xs, zs = [c.x for c in rc], [c.z for c in rc]
    s = margin * min(width / (max(xs) - min(xs)), height / (max(zs) - min(zs)))
    centre = Vector(((max(xs) + min(xs)) / 2, 0, (max(zs) + min(zs)) / 2))
    return Matrix.Translation(-centre * s) @ Matrix.Scale(s, 4) @ rot


def main():
    o = args()
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    spec_path = "/root/sidereal-progress/_shared/CHARACTER_SPEC_BODY.json"
    if os.path.exists(spec_path):
        import json
        body_frames.load_spec(json.load(open(spec_path)))
    items = ITEMS.build_all()
    only = set(filter(None, o.only.split(",")))
    os.makedirs(o.out, exist_ok=True)
    for it in items:
        if only and it.id not in only:
            continue
        b = it.bounds()
        grid = footprint.footprint([b[3] - b[0], b[4] - b[1], b[5] - b[2]])
        w, h = grid["width"] * o.px, grid["height"] * o.px
        sc, cam, coll = R.new_scene("grid-icons", w, h, o.samples, transparent=True)
        # Unit-wide ortho frame (the camera sits 20 units back): fit to 1 x (h / w).
        R.ortho_front(cam, 0, 0, 1.0)
        m = fit(it, view_matrix(grid["view"]), 1.0, h / w)
        blend.spawn(it, it.theme, m, coll)
        R.render(sc, os.path.join(o.out, f"{it.id}.png"))
        print(f"[grid-icon] {it.id} {grid['width']}x{grid['height']} {w}x{h}px view={grid['view']}")


main()
