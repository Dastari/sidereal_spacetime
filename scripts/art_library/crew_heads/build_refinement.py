"""Immutable review candidate: coherent hair r005 and helmet seals r008.

nice -n 10 blender -b -t 2 --factory-startup --python-exit-code 1 -P
scripts/art_library/crew_heads/build_refinement.py -- --kind hair|helmets

Legacy head-kit files/catalog and live pins are never rewritten. Each invocation saves an editable
Blender source; manifest hashes bind exported bytes to their source and the existing head-space frame.
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE))
import kit
import face_np
import parts_hair
import parts_gear


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--kind", required=True, choices=["hair", "helmets"])
    ap.add_argument("--styles", default="", help="iteration subset; not a complete release manifest")
    ap.add_argument("--from-source", action="store_true", help="re-export the complete editable candidate after material-only changes")
    a = ap.parse_args(sys.argv[sys.argv.index("--") + 1:])
    cat = json.loads((ROOT / "packages/content/src/crew-heads.v1.json").read_text())
    out = ROOT / "assets/runtime/crew/heads/refinement-r005"
    out.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    face = face_np.FaceKit(str(ROOT / "packages/content/src/crew-face-atlas.v1.json"),
                          str(ROOT / "assets/runtime/crew/heads/v1/face"), cat)
    face.image("m_classic", face.frames({"expression": "neutral"}), "#c08968", "#6b3f22", "#4d3024",
               name="crew.face.default")
    lib = kit.Library()
    if a.from_source:
        source = ROOT / f"assets/source/{'crew-hair-r005' if a.kind == 'hair' else 'crew-helmets-r008'}.blend"
        bpy.ops.wm.open_mainfile(filepath=str(source))
        import look
        look._CACHE.clear()
        existing = json.loads((out / "manifest.json").read_text())
        lib = kit.Library()
        for name, meta in existing["nodes"].items():
            if (meta["category"] in ("hair", "hair_lod")) != (a.kind == "hair"):
                continue
            ob = bpy.data.objects[name]
            if a.kind == "hair":
                from vox import SI
                for poly in ob.data.polygons:
                    poly.material_index = SI["hair"]
            lib.objects[name], lib.meta[name] = ob, meta
    elif a.kind == "hair":
        wanted = set(a.styles.split(",")) if a.styles else None
        if wanted:
            source = ROOT / "assets/source/crew-hair-r005.blend"
            existing = json.loads((out / "manifest.json").read_text())
            bpy.ops.wm.open_mainfile(filepath=str(source))
            import look
            look._CACHE.clear()
            lib = kit.Library()
            for name, meta in existing["nodes"].items():
                if meta["category"] not in ("hair", "hair_lod"):
                    continue
                ob = bpy.data.objects[name]
                if name.split(".")[1] in wanted:
                    bpy.data.objects.remove(ob, do_unlink=True)
                else:
                    lib.objects[name], lib.meta[name] = ob, meta
        for h in cat["hairStyles"]:
            hid = h["id"]
            if wanted and hid not in wanted:
                continue
            for mode, grid in parts_hair.hair_variants(hid, cohesive=True).items():
                lib.add(f"hair.{hid}.{mode}", "hair", f"hair/{hid}", grid)
                lib.add(f"hair.{hid}.{mode}.lod1", "hair_lod", f"hair/{hid}", grid)
            print("Built coherent", hid, flush=True)
        source = ROOT / "assets/source/crew-hair-r005.blend"
    else:
        for h in cat["helmets"]:
            shell, visors = parts_gear.helmet(h["id"], [v["id"] for v in cat["visors"]], continuous=True)
            lib.add(f"helmet.{h['id']}", "helmet", "helmets", shell)
            for vid, grid in visors.items():
                lib.add(f"visor.{h['id']}.{vid}", "visor", "helmets", grid)
            print("Built sealed", h["id"], flush=True)
        source = ROOT / "assets/source/crew-helmets-r008.blend"
    groups = {}
    for name, meta in lib.meta.items():
        groups.setdefault(meta["glb"], []).append(name)
    files = {}
    for key, names in groups.items():
        bpy.ops.object.select_all(action="DESELECT")
        for n in names:
            lib.objects[n].hide_set(False)
            lib.objects[n].select_set(True)
        path = out / (key + ".glb")
        path.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True,
                                 export_apply=True, export_yup=True, export_texcoords=False,
                                 export_normals=True, export_materials="EXPORT", export_extras=False,
                                 export_cameras=False, export_lights=False, export_animations=False,
                                 export_vertex_color="ACTIVE")
        files[key] = {"path": key + ".glb", "sha256": digest(path), "bytes": path.stat().st_size,
                      "nodes": names}
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(source), compress=True)
    manifest_path = out / "manifest.json"
    man = json.loads(manifest_path.read_text()) if manifest_path.exists() else {
        "schema": "sidereal.crew-head-art.v1", "id": "refinement-r005", "status": "proposal",
        "legacyCatalogRevision": cat["revision"], "hairRevision": 5, "helmetRevision": 8,
        "voxelMeters": cat["voxelMeters"], "space": cat["space"], "headScale": 0.9,
        "hairStyles": [h["id"] for h in cat["hairStyles"]], "hairModes": ["full", "cap", "fringe"],
        "helmets": [h["id"] for h in cat["helmets"]], "visors": [v["id"] for v in cat["visors"]],
        "intentionalOpenHelmets": ["open"], "maps": {}, "files": {}, "nodes": {}, "sources": {}}
    man["files"].update(files)
    man["nodes"].update(lib.stats())
    man["sources"][a.kind] = {"path": str(source.relative_to(ROOT)), "sha256": digest(source)}
    man["authoring"] = {p.name: digest(p) for p in (HERE / "parts_hair.py", HERE / "parts_gear.py",
                                                  HERE / "vox.py", HERE / "kit.py", Path(__file__))}
    manifest_path.write_text(json.dumps(man, indent=2) + "\n")


if __name__ == "__main__":
    main()
