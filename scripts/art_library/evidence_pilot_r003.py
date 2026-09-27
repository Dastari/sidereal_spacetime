from pathlib import Path
import bpy,sys,json
from mathutils import Vector
out=Path(sys.argv[sys.argv.index('--')+1]);bpy.ops.wm.open_mainfile(filepath=str(out/'pilot-kit.blend'));s=bpy.context.scene;c=s.camera
for state in ['worn','damaged']:
 for suffix in [' hull paint',' nameplate']:
  mat=bpy.data.materials.get(state+suffix) or bpy.data.materials['clean'+suffix].copy();mat.name=state+suffix;mat.use_fake_user=True
  for node in mat.node_tree.nodes:
   if node.type=='TEX_IMAGE':
    filename=Path(node.image.filepath).name.replace('clean-',state+'-');node.image=bpy.data.images.load(str(out/'maps'/filename),check_existing=True);node.image.pack()
    if 'normal' in filename or 'roughness' in filename:node.image.colorspace_settings.name='Non-Color'
c.location=(-12,22,12);c.data.ortho_scale=14;c.rotation_euler=(Vector((0,10,1))-c.location).to_track_quat('-Z','Y').to_euler()
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
