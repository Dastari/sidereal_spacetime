"""Rebuild the bundled head-kit helmets after an armour silhouette revision.

blender -b -t 2 --factory-startup -P scripts/art_library/crew_armor_helmet.py -- \
  --out assets/runtime/crew/heads/v1 --source assets/source/crew-helmets-r007.blend
Uses the existing head-kit catalog, mesher, slots and node names; leaves other head bundles intact.
"""
import argparse
import json
import sys
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).with_name("crew_heads")))
import kit
import look
from vox import SLOTS
import parts_gear


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--source", required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    cat = json.loads((ROOT / "packages/content/src/crew-heads.v1.json").read_text())
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # The shared material library expects its face texture even for a helmet-only bundle.
    import face_np
    faces = face_np.FaceKit(str(ROOT / "packages/content/src/crew-face-atlas.v1.json"),
                            str(ROOT / "assets/runtime/crew/heads/v1/face"), cat)
    faces.image("m_classic", faces.frames({"expression": "neutral"}), "#c08968", "#6b3f22", "#4d3024",
                name="crew.face.default")
    lib = kit.Library()
    for helmet in cat["helmets"]:
        hid = helmet["id"]
        shell, visors = parts_gear.helmet(hid, [v["id"] for v in cat["visors"]])
        lib.add(f"helmet.{hid}", "helmet", "helmets", shell)
        for vid, grid in visors.items():
            lib.add(f"visor.{hid}.{vid}", "visor", "helmets", grid)
        # Bake the catalog colourway into shared crew.<slot> materials. The runtime still
        # applies its molded finish by slot, including to suffixed material instances.
        if hid == "tactical":
            for name, ob in lib.objects.items():
                if name == f"helmet.{hid}" or name.startswith(f"visor.{hid}."):
                    palette = {**helmet["slotDefaults"], "glass": "dark"}
                    for i, slot in enumerate(SLOTS):
                        if slot in palette:
                            ob.material_slots[i].link = "OBJECT"
                            ob.material_slots[i].material = look.slot_material(slot, palette[slot], name=f"crew.{slot}")
        print("Built", hid, flush=True)
    out = Path(args.out)
    bpy.ops.object.select_all(action="DESELECT")
    for ob in lib.objects.values():
        ob.hide_set(False)
        ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(out / "helmets.glb"), export_format="GLB", use_selection=True,
                             export_apply=True, export_yup=True, export_texcoords=False, export_normals=True,
                             export_materials="EXPORT", export_extras=False, export_cameras=False,
                             export_lights=False, export_animations=False, export_vertex_color="ACTIVE")
    manifest_path = out / "crew-heads.manifest.json"
    manifest = json.loads(manifest_path.read_text())
    manifest["nodes"].update(lib.stats())
    manifest["catalogRevision"] = cat["revision"]
    manifest_path.write_text(json.dumps(manifest, indent=1) + "\n")
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(Path(args.source).resolve()), compress=True)


if __name__ == "__main__":
    main()
