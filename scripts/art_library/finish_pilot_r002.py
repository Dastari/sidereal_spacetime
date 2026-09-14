from pathlib import Path
import bpy,sys,json,shutil
from mathutils import Vector
out=Path(sys.argv[sys.argv.index('--')+1]);archive=out/'attempt-03';archive.mkdir(exist_ok=True)
for name in ['pilot-kit.blend','wayfarer.json','placement-validation.json','cutout.png','blender-closed.png','blender-top.png','blender-side.png','assembly.glb']:shutil.copy2(out/name,archive/name)
bpy.ops.wm.open_mainfile(filepath=str(out/'pilot-kit.blend'))
s=bpy.context.scene;c=s.camera
p=json.loads((out/'wayfarer.json').read_text())
for part in p['parts']:
 if 'rear-partition' in part['id']:part['position'][1]=4.625;bpy.data.objects[part['id']].location.y=4.625
(out/'wayfarer.json').write_text(json.dumps(p,indent=2))
s.cycles.samples=64;c.data.ortho_scale=14
views=[('blender-closed.png',(-12,18,12),True),('cutout.png',(-12,18,12),False),('blender-top.png',(0,6,20),False),('blender-side.png',(-15,6,4),False)]
for filename,loc,roof in views:
 for o in s.objects:
  if o.parent and 'pilot-roof' in o.parent.name:o.hide_render=not roof
 c.location=loc;c.rotation_euler=(Vector((0,6,1))-c.location).to_track_quat('-Z','Y').to_euler();s.render.filepath=str(out/filename);bpy.ops.render.render(write_still=True)
bpy.ops.object.select_all(action='DESELECT')
for o in s.objects:
 if o.type=='MESH' and not o.hide_render:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(out/'assembly.glb'),export_format='GLB',use_selection=True,export_apply=True)
c.location=(-12,18,12);c.rotation_euler=(Vector((0,6,1))-c.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.wm.save_as_mainfile(filepath=str(out/'pilot-kit.blend'))
for state in ['worn','damaged']:
 for o in s.objects:
  if o.type=='MESH' and not o.hide_render:
   for slot in o.material_slots:
    if slot.material.name.startswith('clean'):slot.material=bpy.data.materials[state+(' nameplate' if 'nameplate' in slot.material.name else ' hull paint')]
 s.render.filepath=str(out/f'blender-{state}.png');bpy.ops.render.render(write_still=True)
 for o in s.objects:
  if o.type=='MESH':
   for slot in o.material_slots:
    if slot.material.name.startswith(state):slot.material=bpy.data.materials['clean'+(' nameplate' if 'nameplate' in slot.material.name else ' hull paint')]
for o in s.objects:
 if o.type=='MESH':o.hide_render=True
s.render.resolution_x=700;s.render.resolution_y=600;s.cycles.samples=32
for component in json.loads((out/'components.json').read_text()):
 col=bpy.data.collections[component['slug']];bounds=component['bounds'];target=Vector([(a+b)/2 for a,b in zip(bounds['min'],bounds['max'])]);c.data.ortho_scale=max(component['nominal_dimensions_m'])*1.8;c.location=target+Vector((-4,6,4));c.rotation_euler=(target-c.location).to_track_quat('-Z','Y').to_euler()
 for o in col.objects:o.hide_render=False;o.hide_set(False)
 s.render.filepath=str(out/component['slug']/'cutout.png');bpy.ops.render.render(write_still=True)
 for o in col.objects:o.hide_render=True;o.hide_set(True)
