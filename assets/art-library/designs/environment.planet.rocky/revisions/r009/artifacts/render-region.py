import bpy
from mathutils import Vector
from pathlib import Path
out=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(out/'kit.blend'))
for obj in bpy.data.objects:
 if obj.type=='MESH':
  obj.hide_render=not obj.name.startswith('GEO-battered-region-a')
  if not obj.hide_render:obj.location=(0,0,0)
scene=bpy.context.scene;camera=scene.camera;camera.location=(4,-6,6);camera.rotation_euler=(Vector((0,0,0))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=4.7
scene.render.resolution_x=1100;scene.render.resolution_y=1000;scene.render.filepath=str(out/'regional-preview.png');bpy.ops.render.render(write_still=True)
