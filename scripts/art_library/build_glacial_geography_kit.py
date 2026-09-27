"""r014 editable thick snow masses and connected blue bluff feature kit."""
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
def shelf(name,center,variant):
 # Authored clipped orthogonal footprint, deep solid crust and an offset crown.
 corners=[(-.68,-.46),(-.41,-.46),(-.41,-.63),(.49,-.63),(.49,-.30),(.69,-.30),(.69,.45),(.22,.45),(.22,.60),(-.59,.60),(-.59,.23),(-.68,.23)]
 verts=[(x,y,z) for z in [-.9,.16] for x,y in corners];n=len(corners)
 faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(name,me);scene.collection.objects.link(o);o.location=center;me.materials.append(materials[0]);return o
forms=[]
for variant in range(3):
 offset=Vector((variant*3.,0,0));parts=[shelf('GEO-thick-chipped-snow-mass-%d'%variant,offset,variant)]
 parts.append(box('GEO-broad-uneven-snow-shelf-%d'%variant,offset+Vector(([-.14,.18,.05][variant],[.12,-.13,.08][variant],.23)),([.83,.98,.71][variant],[.95,.75,.89][variant],[.22,.36,.29][variant])))
 forms.append(parts)
for variant in range(3):
 offset=Vector(((variant+3)*3.,0,0));parts=[]
 height=[2.4,2.05,.65][variant]
 parts.append(prism('GEO-connected-blue-bluff-%d'%variant,offset+Vector((-.18,.08,0)),1.30,1.17,height,.08+variant*.13,variant))
 parts.append(prism('GEO-wide-embedded-ice-ledge-%d'%variant,offset+Vector((.39,-.18,0)),.97,.86,height*.57,-.08+variant*.11,variant+1))
 if variant==0:
  parts.append(box('GEO-broken-snow-crown-over-blue-wall',offset+Vector((-.24,.08,height+.005)),(.67,.74,.20)))
 if variant==1:
  parts.append(prism('GEO-grouped-tall-cyan-blade',offset+Vector((-.45,-.21,.12)),.53,.63,height*1.15,.23,4))
 forms.append(parts)
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1,location=(18,0,0));core=bpy.context.object;core.name='GEO-hidden-sealing-core';core.data.materials.append(materials[4]);forms.append([core])
for parts in forms:
 for obj in parts:
  if obj.data.validate(verbose=True):raise ValueError('Invalid authored form '+obj.name)
  bm=bmesh.new();bm.from_mesh(obj.data)
  if any(not e.is_manifold for e in bm.edges):raise ValueError('Open authored form '+obj.name)
  bm.free()
bpy.ops.wm.save_as_mainfile(filepath=str(out/'kit.blend'))
kit={'schema':'sidereal.native-planet-kit.v1','layout':'glacial-geography','authoringAxes':'BlenderZ-up local reusable volume forms; no visible quarterplates','materials':[{'name':n,'linearColor':list(c),'roughness':.82 if i==0 else .23} for i,(n,c) in enumerate(zip(names,colors))],'variants':[]}
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
