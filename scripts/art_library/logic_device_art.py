"""Wall logic proposal export using the existing ship object/kit pipeline.

Headless entry point: ship_component_export.py -- --only logic.button.wall.
No catalog registration or publication; the status lens is the only non-slot
material. See the generated manifest for the placement and tint contract.
"""
import json
import math
from pathlib import Path

import bpy
import ship_object_art as O

DESIGN_ID = "logic.button.wall"
STATUS = "proposed, not owner-approved"
FRAME = ("wall: origin at centre of BACK face (wall plane), +X along wall, "
         "+Y out of wall/front, +Z up; glTF (x, y, z) -> (x, z, -y); "
         "runtime places centre 1.25 m above floor; height is not baked in")


def export(a, X):
    if a.no_glb or a.ids_file or a.sheets:
        raise ValueError("logic.button.wall exports one GLB; omit --no-glb, --ids-file and --sheets")
    out = Path(a.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    coll = bpy.data.collections.new(DESIGN_ID)
    scene.collection.children.link(coll)
    root = bpy.data.objects.new(f"object.{DESIGN_ID}", None)
    coll.objects.link(root)
    root["designId"], root["frame"], root["status"] = DESIGN_ID, FRAME, STATUS
    mats = X.slot_materials()
    status = bpy.data.materials.new("status_light")
    status.use_nodes = True
    status.diffuse_color = (1, 1, 1, 1)
    shader = status.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (1, 1, 1, 1)
    shader.inputs["Emission Color"].default_value = (1, 1, 1, 1)
    shader.inputs["Emission Strength"].default_value = 1.0
    shader.inputs["Roughness"].default_value = 0.3
    pieces = O.logic_button_wall(X.K)
    objects, measurements = [], []
    for piece in pieces:
        # No coarse hidden_faces() occupancy: it quantizes to half texels,
        # which is larger than this equipment's lens and trim details.
        mesh = X.boxes_mesh(piece.id, piece.boxes)
        is_lens = piece.id == "status_light"
        for material in ([status] if is_lens else mats):
            mesh.materials.append(material)
        if is_lens:
            for polygon in mesh.polygons:
                polygon.material_index = 0
        ob = bpy.data.objects.new(piece.id, mesh)
        coll.objects.link(ob)
        ob.parent = root
        bevel = ob.modifiers.new("brick", "BEVEL")
        bevel.width = .001 if is_lens else .0025
        bevel.segments, bevel.limit_method = 1, "ANGLE"
        bevel.angle_limit = math.radians(30)
        bevel.harden_normals, bevel.use_clamp_overlap = True, True
        objects.append(ob)
        measurements.append(X.measure(ob))
    triangles = sum(m[0] for m in measurements)
    bounds = [[round(min(m[2][i] for m in measurements), 6) for i in range(3)],
              [round(max(m[3][i] for m in measurements), 6) for i in range(3)]]
    assert triangles < 2000, triangles
    assert bounds == [[-.14, 0.0, -.18], [.14, .06, .18]], bounds
    bpy.ops.object.select_all(action="DESELECT")
    for ob in [root, *objects]:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = root
    glb = out / f"{DESIGN_ID}.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(glb), export_format="GLB", use_selection=True, export_apply=True,
        export_extras=True, export_yup=True, export_cameras=False, export_lights=False,
        export_animations=False, export_materials="EXPORT")

    def relative(path):
        return str(path.relative_to(X.ROOT)) if path.is_relative_to(X.ROOT) else str(path)

    used = [f"slot{i}_{X.SLOTS[i]}" for i in measurements[0][4]]
    manifest = {
        "schema": "sidereal.ship-object-art.v1", "revision": "r001", "status": STATUS,
        "frame": FRAME, "units": "metres; authored 5 mm detail grid in kit texel coordinates",
        "materialSlots": [f"slot{i}_{s}" for i, s in enumerate(X.SLOTS)],
        "statusLight": {"material": "status_light", "node": "status_light",
                        "primitiveCount": 1, "baseColorFactor": [1, 1, 1, 1],
                        "emissiveFactor": [1, 1, 1],
                        "note": "Separate primitive/material, outside theme slots. Runtime must tint both base and emission per instance; off sets emission to zero and lens colour dim. No state colours baked into GLB."},
        "bevel": {"bodyWidthM": .0025, "lensWidthM": .001, "segments": 1},
        "generator": {"script": relative(Path(X.__file__).resolve()), "sha256": X.sha256(X.__file__),
                      "builders": relative(Path(O.__file__).resolve()), "buildersSha256": X.sha256(O.__file__),
                      "adapter": relative(Path(__file__).resolve()), "adapterSha256": X.sha256(__file__),
                      "kit": relative(X.KIT_PATH), "kitSha256": X.sha256(X.KIT_PATH),
                      "blender": bpy.app.version_string},
        "requiredObjectIds": [DESIGN_ID],
        "objects": [{"designId": DESIGN_ID, "glb": relative(glb), "sha256": X.sha256(glb),
                     "bytes": glb.stat().st_size, "triangles": triangles,
                     "boxes": sum(len(p.boxes) for p in pieces), "boundsM": bounds,
                     "boundsFrame": "authored Blender wall frame",
                     "gltfBoundsM": [[-.14, -.18, -.06], [.14, .18, 0.0]],
                     "sizeM": [.28, .06, .36], "materialSlotsUsed": used,
                     "specialMaterialsUsed": ["status_light"]}],
    }
    if a.save_blend:
        blend = Path(a.save_blend).resolve()
        blend.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(blend), compress=True, check_existing=False)
        manifest["source"] = {"blend": relative(blend), "sha256": X.sha256(blend),
                              "bytes": blend.stat().st_size,
                              "note": "Editable housing and separate neutral lens; no review scene or floor offset"}
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"[logic] {DESIGN_ID}: {triangles} triangles, {glb.stat().st_size} bytes, bounds={bounds}")
