import bpy,math
from pathlib import Path
from mathutils import Vector
P=Path('.runtime/construction-boundary-kit/r004/candidate-a006');bpy.ops.wm.open_mainfile(filepath=str((P/'boundary-kit.blend').resolve()));S=bpy.context.scene
for ob in S.objects:
 if ob.type=='MESH':ob.hide_render=not ob.name.startswith('REVIEW-single-square-2m')or'-roof'in ob.name
cam=S.camera;cam.location=(7,-8,10);cam.rotation_euler=(Vector((1,1,1.4))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=5.3;S.render.resolution_x=1100;S.render.resolution_y=1000;S.render.resolution_percentage=100;S.render.film_transparent=True;S.render.image_settings.color_mode='RGBA';S.render.filepath=str(P/'native-family-cutout.png');bpy.ops.render.render(write_still=True)
print('FINAL_CUTOUT_COMPLETE')
