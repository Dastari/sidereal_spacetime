"""Broaden native annulus UV density support; preserve geometry and textures."""
import bpy,json,sys,shutil
from pathlib import Path
out=Path(sys.argv[sys.argv.index('--')+1]).resolve();out.mkdir(parents=True,exist_ok=True)
if (out/'kit.blend').exists():raise RuntimeError('Preserve prior source')
prior=out.parent/'gas-r004';kit=json.loads((prior/'kit.json').read_text());bpy.ops.wm.open_mainfile(filepath=str(prior/'kit.blend'))
for name in ['gas-body.glb','ring-rocks.glb','gas-albedo-generated.png','ring-dust-0.png','ring-dust-1.png','ring-dust-2.png']:shutil.copy2(prior/name,out/name)
for i,(offset,span) in enumerate([(.22,.56),(.25,.50),(.12,.76)]):
 obj=bpy.data.objects[f'GEO-ring-dust-{i}'];obj['role']='planet'
 for uv in obj.data.uv_layers.active.data:uv.uv.y=offset+span*uv.uv.y
 variant=next(v for v in kit['variants'] if v['name']==f'ring-dust-{i}')
 for j in range(1,len(variant['uvs']),2):variant['uvs'][j]=offset+span*variant['uvs'][j]
 bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
 bpy.ops.export_scene.gltf(filepath=str(out/f'ring-dust-{i}.glb'),export_format='GLB',use_selection=True,export_apply=True,export_extras=True)
for im in bpy.data.images:
 if im.source=='FILE' and not im.packed_file:
  try: im.pack()
  except RuntimeError: pass
(out/'kit.json').write_text(json.dumps(kit,separators=(',',':')))
bpy.ops.wm.save_as_mainfile(filepath=str(out/'kit.blend'))
scene=bpy.context.scene;scene.cycles.samples=24;scene.render.filepath=str(out/'kit-preview.png');bpy.ops.render.render(write_still=True)
(out/'revision-notes.md').write_text('Gas r005 changes annulus radial UV support only. Body, geometry, normals, materials and texture bytes remain r004. Ordinary PBR two-sided lighting parity is required. No publication or final sign-off.\n')
