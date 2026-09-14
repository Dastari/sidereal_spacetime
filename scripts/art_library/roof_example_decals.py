"""Review-only alpha paint planes using exact runtime canvas pixels."""
from pathlib import Path
import bpy,shutil

def add_examples(out,scene):
 out=Path(out);(out/'example-decals').mkdir(exist_ok=True);source=out.parent/'decal-textures';result=[]
 for label,filename,center,size in [('wayfarer','wayfarer.png',(0,8.5,2.930),(5.3,1.35)),('registration','wf-01.png',(0,-1.35,3.554),(2.2,1.1)),('planet','frontier-planet.png',(0,.3,3.554),(3,1.5))]:
  path=out/'example-decals'/filename;shutil.copy2(source/filename,path);image=bpy.data.images.load(str(path));m=bpy.data.materials.new('MAT-review-decal-'+label);m.use_nodes=True;n=m.node_tree.nodes;p=n.get('Principled BSDF');p.inputs['Roughness'].default_value=.62;t=n.new('ShaderNodeTexImage');t.image=image;m.node_tree.links.new(t.outputs['Color'],p.inputs['Base Color']);m.node_tree.links.new(t.outputs['Alpha'],p.inputs['Alpha'])
  bpy.ops.mesh.primitive_plane_add(size=1,location=center);o=bpy.context.object;o.name='DECAL-EXAMPLE-'+label;o.scale=(size[0],size[1],1);o.data.materials.append(m);o['review_only']=True;result.append(o)
 return result
