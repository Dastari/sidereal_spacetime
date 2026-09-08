"""Export the preserved original Blender ship study into a browser review asset."""
from pathlib import Path
import bpy,json,hashlib
ROOT=Path(__file__).resolve().parents[1]
source=ROOT/'assets/source/blender/ship_3d_study.blend'
bpy.ops.wm.open_mainfile(filepath=str(source))
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.duplicates_make_real(use_base_parent=True, use_hierarchy=True)
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
if not meshes: raise RuntimeError('No source meshes after realizing collection instances')
print('Source meshes:',len(meshes),'; names:',[o.name for o in meshes[:12]])
bpy.ops.object.select_all(action='DESELECT')
for obj in meshes:obj.select_set(True)
out=ROOT/'assets/runtime/wayfarer.glb';out.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_apply=True,export_cameras=False,export_lights=False,export_animations=True)
manifest={'source':str(source.relative_to(ROOT)),'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'output':str(out.relative_to(ROOT)),'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'meshes':len(meshes),'blender':bpy.app.version_string,'status':'review model, not a compiled functional modular assembly'}
(ROOT/'assets/runtime_manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest))
