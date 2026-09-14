import bpy,math
from mathutils import Matrix
from pathlib import Path
from mathutils import Vector
out=Path(__file__).resolve().parent;bpy.ops.wm.open_mainfile(filepath=str(out/'kit.blend'));scene=bpy.context.scene
for obj in list(scene.objects):
 if obj.type=='MESH':obj.hide_render=obj.name!='GEO-continent-a'
continent=bpy.data.objects['GEO-continent-a'];continent.location=(0,0,0)
sources=[o for o in scene.objects if o.name.startswith('GEO-tree-grove-')]
plan=[(-.89,.06,.10),(-.65,.12,.10),(-.76,.31,.10),(-.61,-.09,.10),(-.95,-.10,.10),(.03,.32,.16),(.21,.39,.16),(.28,.18,.16),(.03,.51,.16),(.74,-.13,.07),(.92,-.19,.07),(.75,-.34,.07),(-.33,-.38,0),(.43,-.37,0)]
for i,(x,y,raised)in enumerate(plan):
 scale=(.070+[.015,.027,0,.020,.010][i%5])/.38;angle=i*2.399;rotation=Matrix.Rotation(angle,4,'Z')
 for source in sources:
  obj=source.copy();scene.collection.objects.link(obj);obj.hide_render=False;obj.name='PREVIEW-forest-'+str(i)+'-'+source.name;obj.location=rotation@((source.location-Vector((-1.15,1.3,0)))*scale)+Vector((x,y,.22+raised));obj.scale*=scale;obj.rotation_euler.z+=angle;obj['role']='planet'
scene.camera.location=(4,-6,4);scene.camera.rotation_euler=(Vector((0,0,.25))-scene.camera.location).to_track_quat('-Z','Y').to_euler();scene.camera.data.ortho_scale=5;scene.render.filepath=str(out/'forested-continent-preview.png');bpy.ops.render.render(write_still=True)
