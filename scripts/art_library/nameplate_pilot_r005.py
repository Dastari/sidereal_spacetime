from pathlib import Path
import bpy,json,shutil,sys
from mathutils import Vector
out=Path(sys.argv[sys.argv.index('--')+1]);a=out/'attempt-03';a.mkdir(exist_ok=True);shutil.copy2(out/'pilot-kit.blend',a/'pilot-kit.blend');shutil.copytree(out/'outer-bow-bumper',a/'outer-bow-bumper',dirs_exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(out/'pilot-kit.blend'));col=bpy.data.collections['outer-bow-bumper']
for o in col.objects:
 if o.name.startswith('GEO-Forward upper armor') and min(v.co.x for v in o.data.vertices)>1.3 and max(v.co.x for v in o.data.vertices)<2.7:
  o.data.materials[0]=bpy.data.materials['clean nameplate']
  for f in o.data.polygons:
   if f.normal.y>.5:
    for idx in f.loop_indices:o.data.uv_layers.active.data[idx].uv.x=1-o.data.uv_layers.active.data[idx].uv.x
for state in ['clean','worn','damaged']:
 bpy.ops.object.select_all(action='DESELECT')
 for o in col.objects:
  o.hide_set(False);o.select_set(True)
  for slot in o.material_slots:
   if slot.material.name.startswith(('clean','worn','damaged')):slot.material=bpy.data.materials[state+(' nameplate' if 'nameplate' in slot.material.name else ' hull paint')]
 bpy.context.view_layer.objects.active=list(col.objects)[0];bpy.ops.export_scene.gltf(filepath=str(out/'outer-bow-bumper'/(state+'.glb')),export_format='GLB',use_selection=True,export_apply=True)
for o in col.objects:
 o.hide_set(True)
 for slot in o.material_slots:
  if slot.material.name.startswith(('clean','worn','damaged')):slot.material=bpy.data.materials['clean'+(' nameplate' if 'nameplate' in slot.material.name else ' hull paint')]
s=bpy.context.scene;c=s.camera;c.location=(-12,23,13);c.data.ortho_scale=15;c.rotation_euler=(Vector((0,10,1))-c.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.select_all(action='DESELECT')
for o in s.objects:
 if o.type=='MESH' and not o.hide_render:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(out/'assembly.glb'),export_format='GLB',use_selection=True,export_apply=True)
bpy.ops.wm.save_as_mainfile(filepath=str(out/'pilot-kit.blend'))
for filename,roof in [('cutout.png',False),('blender-closed.png',True)]:
 for o in s.objects:
  if o.parent and ('pilot-roof' in o.parent.name or 'vestibule-roof' in o.parent.name):o.hide_render=not roof
 s.render.filepath=str(out/filename);bpy.ops.render.render(write_still=True)
