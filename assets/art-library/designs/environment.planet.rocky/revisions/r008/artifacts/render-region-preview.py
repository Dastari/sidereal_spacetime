import bpy
from mathutils import Vector
from pathlib import Path
out=Path('/root/sidereal_spacetime/output/playwright/planet-reference-20260914/rocky-r008')
bpy.ops.wm.open_mainfile(filepath=str(out/'kit.blend'))
names=['battered-region-a','battered-region-b']
for o in bpy.context.scene.objects:
 if o.type!='MESH':continue
 match=next((i for i,n in enumerate(names) if o.name.startswith('GEO-'+n)),None)
 o.hide_render=match is None
 if match is not None:o.location=(0,match*3.5-1.75,0)
c=bpy.context.scene.camera;c.location=(5,-8,6);c.rotation_euler=(Vector((0,0,.15))-c.location).to_track_quat('-Z','Y').to_euler();c.data.ortho_scale=10
bpy.context.scene.render.filepath=str(out/'regional-rocky-preview.png');bpy.ops.render.render(write_still=True)
