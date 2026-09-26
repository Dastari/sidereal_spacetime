"""Crew head kit v1: build every catalogued head part, export GLBs + manifest, render review sheets.

Usage (headless only):
  blender -b --factory-startup -P scripts/art_library/crew_heads/build.py -- \
      --catalog packages/content/src/crew-heads.v1.json --out assets/runtime/crew/heads/v1 \
      --review /root/sidereal-progress/char-heads/r001 [--only heads,hair] [--no-export] [--sheets a,b] [--samples 24]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bpy  # noqa: E402

import kit  # noqa: E402
import parts_face as pf  # noqa: E402


def args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--catalog", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--review", default="")
    p.add_argument("--only", default="")
    p.add_argument("--sheets", default="")
    p.add_argument("--samples", type=int, default=24)
    p.add_argument("--no-export", action="store_true")
    return p.parse_args(argv)


def build_parts(cat, lib, only):
    def want(k):
        return not only or k in only

    t = time.time()
    if want("heads"):
        for bf in cat["baseFaces"]:
            sex, age = bf["sex"], bf["age"]
            lib.add(f"head.{bf['id']}", "head", "heads", pf.skull(sex, age))
            for st in cat["faceFeatures"]["eyes"]:
                lib.add(f"face.{bf['id']}.eyes.{st}", "face", "heads", pf.eyes(sex, age, st))
            for st in cat["faceFeatures"]["brows"]:
                lib.add(f"face.{bf['id']}.brows.{st}", "face", "heads", pf.brows(sex, age, st))
            for st in cat["faceFeatures"]["mouth"]:
                lib.add(f"face.{bf['id']}.mouth.{st}", "face", "heads", pf.mouth(sex, age, st))
        print(f"heads built {time.time() - t:.1f}s", flush=True)
    if want("facialhair"):
        for fh in cat["facialHair"]:
            lib.add(f"facialhair.{fh['id']}", "facialhair", "facial-hair", pf.facial_hair(fh["id"]))
    if want("details"):
        for d in cat["details"]:
            lib.add(f"detail.{d['id']}", "detail", "details", pf.details(d["id"]))
    if want("hair") or want("gear"):
        import parts_hair as ph
        import parts_gear as pg
        if want("hair"):
            for h in cat["hairStyles"]:
                for mode, grid in ph.hair_variants(h["id"]).items():
                    lib.add(f"hair.{h['id']}.{mode}", "hair", "hair", grid)
        if want("gear"):
            for a in cat["accessories"]:
                lib.add(f"acc.{a['id']}", "acc", "accessories", pg.accessory(a["id"]))
            for hm in cat["helmets"]:
                shell, visors = pg.helmet(hm["id"], [v["id"] for v in cat["visors"]])
                lib.add(f"helmet.{hm['id']}", "helmet", "helmets", shell)
                for vid, grid in visors.items():
                    lib.add(f"visor.{hm['id']}.{vid}", "visor", "helmets", grid)
            for m in cat["masks"]:
                lib.add(f"mask.{m['id']}", "mask", "masks", pg.mask(m["id"]))
    print(f"parts built: {len(lib.objects)} in {time.time() - t:.1f}s", flush=True)


def export(lib, out):
    os.makedirs(out, exist_ok=True)
    groups = {}
    for name, meta in lib.meta.items():
        groups.setdefault(meta["glb"], []).append(name)
    files = {}
    for glb, names in sorted(groups.items()):
        bpy.ops.object.select_all(action="DESELECT")
        lib.coll.hide_viewport = False
        for n in names:
            lib.objects[n].hide_set(False)
            lib.objects[n].select_set(True)
        path = os.path.join(out, f"{glb}.glb")
        bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True,
                                  export_yup=True, export_texcoords=False, export_normals=True, export_materials="EXPORT",
                                  export_extras=False, export_cameras=False, export_lights=False, export_animations=False)
        files[glb] = f"{glb}.glb"
    return files


def main():
    a = args()
    cat = json.load(open(a.catalog))
    only = {s for s in a.only.split(",") if s}
    bpy.ops.wm.read_factory_settings(use_empty=True)
    lib = kit.Library()
    build_parts(cat, lib, only)
    meta = lib.stats()
    if not a.no_export:
        files = export(lib, a.out)
        man = {"schema": "sidereal.crew-heads.manifest.v1", "catalogRevision": cat["revision"], "voxelMeters": cat["voxelMeters"],
               "space": cat["space"], "files": files, "nodes": dict(sorted(meta.items()))}
        with open(os.path.join(a.out, "crew-heads.manifest.json"), "w") as fh:
            json.dump(man, fh, indent=1)
            fh.write("\n")
        print("exported", files, flush=True)
    if a.review:
        import review
        review.render_all(cat, lib, a.review, {s for s in a.sheets.split(",") if s}, a.samples)


main()
