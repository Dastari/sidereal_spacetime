"""Bake merged export object datums without changing authored world geometry."""
from pathlib import Path
import bpy,json,sys,shutil
O=Path(sys.argv[sys.argv.index('--')+1]);archive=O/'attempts'/'pre-baked-export-origin';archive.mkdir(parents=True,exist_ok=False)
for name in ['kit.glb','roof-kit.blend','components.json','validation.json']:shutil.copy2(O/name,archive/name)
cs=json.loads((O/'components.json').read_text());bpy.ops.wm.open_mainfile(filepath=str(O/'roof-kit.blend'));ex=bpy.data.collections['NATIVE-EXPORT-DERIVED']
for c in cs:
 p=O/c['slug']/'model.glb';(archive/c['slug']).mkdir();shutil.copy2(p,archive/c['slug']/'model.glb')
 bpy.ops.object.select_all(action='DESELECT');ob=bpy.data.objects[c['node_prefix']];ob.hide_set(False);ob.select_set(True);bpy.context.view_layer.objects.active=ob;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 bpy.ops.export_scene.gltf(filepath=str(p),use_selection=True,export_format='GLB',export_apply=True,export_tangents=True)
bpy.ops.object.select_all(action='DESELECT')
for ob in ex.objects:ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(O/'kit.glb'),use_selection=True,export_format='GLB',export_apply=True,export_tangents=True)
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(O/'roof-kit.blend'))
(archive/'repair.json').write_text(json.dumps({'reason':'Runtime prototype instancing expects geometry in asset datum with identity mesh transform','authored_geometry_changed':False,'action':'Bake mergedobject matrix into meshcoordinates beforeexport; editable source masters untouched'},indent=2))
