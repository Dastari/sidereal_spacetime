import bpy
from pathlib import Path
from mathutils import Vector
out=Path(__file__).resolve().parent;bpy.ops.wm.open_mainfile(filepath=str(out/'kit.blend'));scene=bpy.context.scene
for obj in scene.objects:
 if obj.type=='MESH':obj.hide_render=not obj.name.startswith('GEO-gorge-')
scene.camera.location=(4,-6,4);scene.camera.rotation_euler=(Vector((0,0,.03))-scene.camera.location).to_track_quat('-Z','Y').to_euler();scene.camera.data.ortho_scale=5.3;scene.render.filepath=str(out/'gorge-preview.png');bpy.ops.render.render(write_still=True)
