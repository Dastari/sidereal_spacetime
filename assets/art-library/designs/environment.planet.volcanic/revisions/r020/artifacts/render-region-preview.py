import bpy
from mathutils import Vector
from pathlib import Path
out=Path('/root/sidereal_spacetime/output/playwright/planet-reference-20260914/volcanic-r020')
bpy.ops.wm.open_mainfile(filepath=str(out/'kit.blend'))
names=['volcanic-region-a','volcanic-region-b','volcanic-region-c']
for o in bpy.context.scene.objects:
 if o.type!='MESH':continue
 match=next((i for i,n in enumerate(names) if o.name.startswith('GEO-'+n)),None)
 o.hide_render=match is None
 if match is not None:o.location=(0,match*3.3-3.3,0)
c=bpy.context.scene.camera;c.location=(5,-8,6);c.rotation_euler=(Vector((0,0,.15))-c.location).to_track_quat('-Z','Y').to_euler();c.data.ortho_scale=12.5
bpy.context.scene.render.filepath=str(out/'regional-volcanic-preview.png');bpy.ops.render.render(write_still=True)
