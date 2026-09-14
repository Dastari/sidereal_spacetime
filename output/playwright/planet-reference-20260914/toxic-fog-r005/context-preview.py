import bpy
from pathlib import Path
from mathutils import Vector
root=Path('/root/sidereal_spacetime/output/playwright/planet-reference-20260914');bpy.ops.wm.open_mainfile(filepath=str(root/'toxic-fog-r005/kit.blend'));scene=bpy.context.scene
for obj in scene.objects:
 if obj.type=='MESH':obj.hide_render=obj.name!='GEO-toxic-fog-low-bank'
fog=bpy.data.objects['GEO-toxic-fog-low-bank'];fog.location=(0,0,.56)
with bpy.data.libraries.load(str(root/'toxic-r003/kit.blend'),link=False)as(a,b):b.objects=[n for n in a.objects if n.startswith('GEO-toxic-basin-group-a')]
for obj in b.objects:scene.collection.objects.link(obj);obj.location=(0,0,0)
scene.camera.location=(4,-6,3.8);scene.camera.rotation_euler=(Vector((0,0,.30))-scene.camera.location).to_track_quat('-Z','Y').to_euler();scene.camera.data.ortho_scale=4.5;scene.render.resolution_x=1000;scene.render.resolution_y=800;scene.render.filepath=str(root/'toxic-fog-r005/density-context-preview.png');bpy.ops.render.render(write_still=True)
