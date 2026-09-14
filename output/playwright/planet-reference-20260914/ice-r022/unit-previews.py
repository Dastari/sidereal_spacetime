import bpy
from pathlib import Path
from mathutils import Vector
out=Path('/root/sidereal_spacetime/output/playwright/planet-reference-20260914/ice-r022');bpy.ops.wm.open_mainfile(filepath=str(out/'kit.blend'));scene=bpy.context.scene
scene.camera.location=(-4,5,4);scene.camera.rotation_euler=(Vector((0,0,.1))-scene.camera.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(out/'kit-angle2.png');bpy.ops.render.render(write_still=True)
for o in scene.objects:
 if o.type=='MESH':o.hide_render=not ('gorge-' in o.name or 'snow-open-gorge' in o.name)
scene.camera.location=(4,-6,5);scene.camera.rotation_euler=(Vector((0,0,.1))-scene.camera.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(out/'gorge-native-preview.png');bpy.ops.render.render(write_still=True)
