"""Editable native volume forms for a seeded glacial shell, not warped cap plates."""
import bpy,bmesh,math,json,sys,random
from pathlib import Path
from mathutils import Vector
out=Path(sys.argv[sys.argv.index('--')+1]);out.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);scene=bpy.context.scene
colors=[(.94,.975,1.),(.27,.56,.88),(.004,.075,.34),(.008,.40,.92),(.002,.018,.075)];names=['powder-snow','pale-ice-edge','cobalt-ice','cyan-ice-face','deep-ice'];materials=[]
for i,c in enumerate(colors):
 m=bpy.data.materials.new(names[i]);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*c,1);p.inputs['Roughness'].default_value=.82 if i==0 else .23;p.inputs['IOR'].default_value=1.31
 if i in [1,2,3]:p.inputs['Coat Weight'].default_value=.22;p.inputs['Coat Roughness'].default_value=.18
 materials.append(m)
def box(name,center,size,role=0):
 bpy.ops.mesh.primitive_cube_add(size=1,location=center);o=bpy.context.object;o.name=name;o.scale=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(materials[role]);return o
def prism(name,center,width,depth,height,angle,variant):
 # Six irregular vertical facets, tapered unequal-height cap; substantial foot.
 points=[]
 for level in [0,1]:
  for i in range(6):
   a=i*math.pi/3+angle;factor=(1 if level==0 else .78)*(1+.08*math.sin(i*2.1+variant));points.append((math.cos(a)*width*.5*factor,math.sin(a)*depth*.5*factor,(-.65 if level==0 else height)+(.08*math.sin(i+variant) if level else 0)))
 faces=[tuple(range(5,-1,-1)),tuple(range(6,12))]+[(i,(i+1)%6,(i+1)%6+6,i+6) for i in range(6)]
 me=bpy.data.meshes.new(name);me.from_pydata(points,[],faces);me.update();o=bpy.data.objects.new(name,me);scene.collection.objects.link(o);o.location=center
 for m in materials:me.materials.append(m)
 for f in me.polygons:f.material_index=3 if f.index%3 else 2
 return o
forms=[]
for variant in range(3):
 offset=Vector((variant*3.,0,0));parts=[]
 parts.append(box('GEO-thick-snow-base-%d'%variant,offset+Vector((0,0,-.22)),(1.12,1.04,.95)))
 parts.append(box('GEO-broken-snow-crown-%d'%variant,offset+Vector(([-.18,.19,.1][variant],[.14,-.13,.19][variant],.38)),([.73,.86,.68][variant],[.83,.68,.90][variant],[.57,.68,.54][variant])))
 forms.append(parts)
for variant in range(3):
 offset=Vector(((variant+3)*3.,0,0));parts=[]
 height=[2.3,2.8,1.25][variant]
 parts.append(prism('GEO-glacial-bluff-main-%d'%variant,offset+Vector((-.15,.05,0)),.95,.91,height,.18+variant*.3,variant))
 parts.append(prism('GEO-glacial-bluff-step-%d'%variant,offset+Vector((.37,-.13,0)),.72,.74,height*.64,-.12+variant*.2,variant+1))
 parts.append(box('GEO-embedded-snow-crown-%d'%variant,offset+Vector((-.12,.04,height+.02)),(.55,.60,.18)))
 forms.append(parts)
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1,location=(18,0,0));core=bpy.context.object;core.name='GEO-hidden-sealing-core';core.data.materials.append(materials[4]);forms.append([core])
for parts in forms:
 for obj in parts:
  if obj.data.validate(verbose=True):raise ValueError('Invalid authored form '+obj.name)
  bm=bmesh.new();bm.from_mesh(obj.data)
  if any(not e.is_manifold for e in bm.edges):raise ValueError('Open authored form '+obj.name)
  bm.free()
bpy.ops.wm.save_as_mainfile(filepath=str(out/'kit.blend'))
kit={'schema':'sidereal.native-planet-kit.v1','layout':'clustered-glaciers','authoringAxes':'BlenderZ-up local reusable volume forms; no visible quarterplates','materials':[{'name':n,'linearColor':list(c),'roughness':.82 if i==0 else .23} for i,(n,c) in enumerate(zip(names,colors))],'variants':[]}
for index,parts in enumerate(forms):
 positions=[];indices=[];roles=[]
 for obj in parts:
  me=obj.data;me.calc_loop_triangles();base=len(positions)//3
  for v in me.vertices:
   p=obj.matrix_world@v.co;p.x-=index*3.;positions.extend(p)
  for triangle in me.loop_triangles:
   indices.extend(base+i for i in triangle.vertices);roles.append(names.index(me.materials[triangle.material_index].name))
 kit['variants'].append({'name':['snow-cluster-a','snow-cluster-b','snow-cluster-c','ice-bluff-a','ice-bluff-b','ice-canyon','sealing-core'][index],'positions':positions,'indices':indices,'triangleMaterials':roles})
 bpy.ops.object.select_all(action='DESELECT')
 for obj in parts:obj.select_set(True)
 bpy.context.view_layer.objects.active=parts[0]
 if len(parts)>1:bpy.ops.object.join()
 bpy.context.object.location.x-=index*3.
 bpy.ops.export_scene.gltf(filepath=str(out/('form-%d.glb'%index)),export_format='GLB',use_selection=True,export_apply=True)
(out/'kit.json').write_text(json.dumps(kit,separators=(',',':')));(out/'validation.json').write_text(json.dumps({'nativeForms':7,'allPartsManifold':True,'triangles':[len(v['indices'])//3 for v in kit['variants']],'noVisibleCapPlate':True,'publication':'isolated draft only'},indent=2))
print('CLUSTER_KIT_DONE',[len(v['indices'])//3 for v in kit['variants']])
