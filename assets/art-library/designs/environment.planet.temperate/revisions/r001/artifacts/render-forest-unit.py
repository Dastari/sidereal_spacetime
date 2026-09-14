import bpy
from pathlib import Path
from mathutils import Vector
out=Path(__file__).resolve().parent;bpy.ops.wm.open_mainfile(filepath=str(out/'kit.blend'));scene=bpy.context.scene
for obj in list(scene.objects):
 if obj.type=='MESH':obj.hide_render=obj.name!='GEO-continent-a'
continent=bpy.data.objects['GEO-continent-a'];continent.location=(0,0,0)
sources=[o for o in scene.objects if o.name.startswith('GEO-tree-grove-')]
plan=[(-1.02,-.18),(-.75,.18),(-.55,-.37),(-.33,.16),(-.10,-.34),(.12,.21),(.38,-.28),(.62,.15),(.88,-.17),(-.56,.46),(.17,.48),(.57,.46)]
for i,(x,y)in enumerate(plan):
 scale=(.15+[.015,.025,0,.020][i%4])/.55
 for source in sources:
  obj=source.copy();scene.collection.objects.link(obj);obj.hide_render=False;obj.name='PREVIEW-forest-'+str(i)+'-'+source.name;obj.location=(source.location-Vector((-1.15,1.3,0)))*scale+Vector((x,y,.38));obj.scale*=scale;obj['role']='planet'
scene.camera.location=(4,-6,4);scene.camera.rotation_euler=(Vector((0,0,.25))-scene.camera.location).to_track_quat('-Z','Y').to_euler();scene.camera.data.ortho_scale=5;scene.render.filepath=str(out/'forested-continent-preview.png');bpy.ops.render.render(write_still=True)
