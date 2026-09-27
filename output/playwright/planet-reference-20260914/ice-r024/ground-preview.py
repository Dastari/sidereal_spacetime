import bpy
from pathlib import Path
from mathutils import Vector
out=Path('/root/sidereal_spacetime/output/playwright/planet-reference-20260914/ice-r024');bpy.ops.wm.open_mainfile(filepath=str(out/'kit.blend'));scene=bpy.context.scene
for o in scene.objects:
 if o.type=='MESH':o.hide_render=not (o.name=='GEO-ground-sphere' or o.get('groundPlacementId'))
scene.camera.location=(2,-3,2);scene.camera.rotation_euler=(-scene.camera.location).to_track_quat('-Z','Y').to_euler();scene.camera.data.ortho_scale=2.7;scene.render.filepath=str(out/'ground-native-preview.png');bpy.ops.render.render(write_still=True)
