import bpy
from mathutils import Vector
from pathlib import Path
out=Path('/root/sidereal_spacetime/output/playwright/planet-reference-20260914/gas-r003')
bpy.ops.wm.open_mainfile(filepath=str(out/'kit.blend'))
scene=bpy.context.scene;c=scene.camera;c.location=(3.6,4.8,-2.5);c.rotation_euler=(-c.location).to_track_quat('-Z','Y').to_euler()
for obj in scene.objects:
 if obj.type=='LIGHT':obj.location.z=-abs(obj.location.z);obj.rotation_euler=(-obj.location).to_track_quat('-Z','Y').to_euler()
scene.render.filepath=str(out/'kit-preview-storm.png');bpy.ops.render.render(write_still=True)
