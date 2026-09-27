import bpy,sys
from pathlib import Path
from mathutils import Vector
out=Path(sys.argv[sys.argv.index('--')+1]).resolve();bpy.ops.wm.open_mainfile(filepath=str(out/'kit.blend'));scene=bpy.context.scene
objects=[o for o in scene.objects if o.type=='MESH' and 'moon-district-' in o.name]
for o in scene.objects:
 if o.type=='MESH':o.hide_render=o not in objects
for o in objects:o.location=(0 if 'squat' in o.name else 1.5,0,0)
scene.camera.location=(2,-3,2.3);scene.camera.rotation_euler=(Vector((.75,0,.18))-scene.camera.location).to_track_quat('-Z','Y').to_euler();scene.camera.data.ortho_scale=3.4
scene.render.resolution_x=1000;scene.render.resolution_y=650;scene.render.filepath=str(out/'native-district-preview.png');bpy.ops.render.render(write_still=True)
