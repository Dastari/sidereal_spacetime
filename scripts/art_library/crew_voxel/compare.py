"""Render one saved crew .blend revision with the shared review camera/lighting (for matched
side-by-sides across revisions).

  blender -b --factory-startup -P compare.py -- --blend crew-body.blend --out front.png [--az -25]
      [--variant male] [--closeup] [--label r002]
"""
import argparse
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render  # noqa: E402


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    p = argparse.ArgumentParser()
    p.add_argument("--blend", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--az", type=float, default=-25)
    p.add_argument("--variant", default="male")
    p.add_argument("--closeup", action="store_true")
    p.add_argument("--samples", type=int, default=32)
    a = p.parse_args(argv)
    bpy.ops.wm.open_mainfile(filepath=a.blend)
    sc = bpy.context.scene
    for ob in list(sc.objects):
        if ob.type in ("LIGHT", "CAMERA") or ob.name.startswith("review_floor"):
            bpy.data.objects.remove(ob)
    cam = render.setup(sc, samples=a.samples, res=(640, 900))
    arm = bpy.data.objects.get("crew_rig")
    if arm and "idle" in bpy.data.actions:
        arm.animation_data_create()
        arm.animation_data.action = bpy.data.actions["idle"]
        sc.frame_set(0)
    for ob in sc.objects:
        if ob.type == "EMPTY":
            ob.hide_render = True
        if ob.type == "MESH" and ob.name.startswith("GEO-"):
            ob.hide_render = not ob.name.endswith(f"-{a.variant}") or bool(ob.get("hiddenByGear")) or bool(ob.get("defaultHidden"))
        elif ob.type == "MESH" and not ob.name.startswith("review_floor"):
            ob.hide_render = True
    if arm:
        arm.hide_render = True
    if a.closeup:
        render.aim(cam, a.az, elev=4, dist=6, target=(0, 0, 0.9), ortho=0.85)
    else:
        render.aim(cam, a.az, elev=8, dist=6, target=(0, 0, 0.9), ortho=2.25)
    render.still(a.out)


main()
