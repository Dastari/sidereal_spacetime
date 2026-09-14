"""Read-only native unit preview; does not alter saved source or exports."""
import bpy,sys
from pathlib import Path
from mathutils import Vector
out=Path(sys.argv[sys.argv.index('--')+1]).resolve();bpy.ops.wm.open_mainfile(filepath=str(out/'kit.blend'));scene=bpy.context.scene
# Exact authored successor names, only for this offline source presentation.
parts=[o for o in scene.objects if o.type=='MESH' and (o.name.endswith('-hot-edge') or o.name=='GEO-battered-region-b-edge-exposed-hot-fracture-0')]
assert parts
for o in scene.objects:
 if o.type=='MESH':o.hide_render=o not in parts
corners=[o.matrix_world@Vector(v)for o in parts for v in o.bound_box];center=Vector(tuple((min(p[i]for p in corners)+max(p[i]for p in corners))/2 for i in range(3)))
scene.camera.location=center+Vector((-3,4,4));scene.camera.rotation_euler=(center-scene.camera.location).to_track_quat('-Z','Y').to_euler();scene.camera.data.ortho_scale=4.6
scene.render.resolution_x=650;scene.render.resolution_y=650;scene.render.resolution_percentage=100;scene.render.filepath=str(out/'native-hot-edge-preview.png');bpy.ops.render.render(write_still=True)
