"""Render the actual voxel union; preserve all original editable source solids."""
import bpy
import json
import hashlib
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
jobs=json.loads(Path(sys.argv[sys.argv.index("--")+1]).read_text())
for job in jobs:
    out=ROOT/job["output"];data=json.loads((out/"mesh.json").read_text())
    if (out/"cutout.png").exists():raise ValueError("Never overwrite an existing render revision")
    bpy.ops.wm.open_mainfile(filepath=str(ROOT/job["sampled_from"] / "blender-source.blend"))
    scene=bpy.context.scene;scene.cycles.use_denoising=False;scene.cycles.samples=64
    source_collection=bpy.data.collections.new("AUTHORING-CLOSED-SOLIDS");scene.collection.children.link(source_collection)
    for o in list(scene.objects):
        if o.type!="MESH":continue
        for collection in list(o.users_collection):collection.objects.unlink(o)
        source_collection.objects.link(o);o.hide_render=True;o.hide_set(True)
    mesh=bpy.data.meshes.new("Voxel union");mesh.from_pydata(data["vertices"],[],data["faces"]);mesh.update()
    obj=bpy.data.objects.new("GEO-"+data["id"]+"--voxel",mesh);scene.collection.objects.link(obj)
    for descriptor in data["palette"][1:]:
        mat=bpy.data.materials.new("COOKED-"+descriptor["name"]);mat.use_nodes=True
        p=mat.node_tree.nodes.get("Principled BSDF")
        for field,socket in [("color","Base Color"),("metallic","Metallic"),("roughness","Roughness"),("emission","Emission Color"),("emissionStrength","Emission Strength")]:
            p.inputs[socket].default_value=(*descriptor[field],1) if field in ["color","emission"] else descriptor[field]
        mat["voxel_material_id"]=descriptor["voxelMaterialId"];mesh.materials.append(mat)
    for face,material in zip(mesh.polygons,data["materials"]):face.material_index=material-1
    obj["cell_meters"]=data["cellMeters"];obj["design_id"]=job["design_id"];obj["reference_id"]=job["reference_id"]
    scene["design_revision"]=job["revision"];scene["status"]="Unsigned material-preserving voxel reconstruction"
    bpy.ops.object.select_all(action="DESELECT");obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.export_scene.gltf(filepath=str(out/"voxel.glb"),export_format="GLB",use_selection=True,export_extras=True,export_cameras=False,export_lights=False)
    bpy.ops.wm.save_as_mainfile(filepath=str(out/"blender-source.blend"))
    scene.render.filepath=str(out/"cutout.png");bpy.ops.render.render(write_still=True)
    scene.camera.location=(0,0,10);scene.camera.rotation_euler=(0,0,0);scene.camera.data.ortho_scale=3.5
    scene.render.filepath=str(out/"blender-top.png");bpy.ops.render.render(write_still=True)
    previous=json.loads((ROOT/job["sampled_from"]/"validation.json").read_text())
    previous.update(status="draft-unapproved",revision=job["revision"],source_revision_directory=job["sampled_from"],triangles=len(data["faces"])*2,rendered_geometry="Actual opaque voxel union from packages/sim/src/voxels.ts; editable source solids retained hidden in AUTHORING-CLOSED-SOLIDS",correction="Removed coplanar solid artifacts through the active priority-preserving volume union. No material or geometry claimed approved.",files={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in out.iterdir() if p.is_file()})
    (out/"validation.json").write_text(json.dumps(previous,indent=2)+"\n")
    print(json.dumps({"completed":job["design_id"],"revision":job["revision"]}),flush=True)

# Review-only export for the existing Shipyard renderer; never publish it.
bpy.ops.wm.read_factory_settings(use_empty=True)
for job in jobs:bpy.ops.import_scene.gltf(filepath=str(ROOT/job["output"]/"voxel.glb"))
bpy.ops.export_scene.gltf(filepath=str(ROOT/".runtime/art-library/assembly-review/parts.glb"),export_format="GLB",export_extras=True,export_cameras=False,export_lights=False)
