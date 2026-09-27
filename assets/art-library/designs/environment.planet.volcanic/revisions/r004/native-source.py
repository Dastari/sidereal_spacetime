"""Native editable basalt forms and molten-core mesh for seeded volcanic composition."""
import bpy,bmesh,math,json,sys
from pathlib import Path
from mathutils import Vector
out=Path(sys.argv[sys.argv.index('--')+1]);out.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);scene=bpy.context.scene
names=['basalt-dark','basalt-cliff','basalt-top','molten-core','sealed-rock'];colors=[(.010,.006,.018),(.028,.017,.039),(.043,.037,.058),(.35,.018,.001),(.003,.006,.014)];materials=[]
for i,(name,color) in enumerate(zip(names,colors)):
 m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=.36 if i<3 else .42;p.inputs['Metallic'].default_value=.18 if i<3 else 0
 if i==3:p.inputs['Emission Color'].default_value=(1,.12,.004,1);p.inputs['Emission Strength'].default_value=3
 materials.append(m)
def mass(name,offset,width,depth,height,variant):
 corners=[(-.58,-.43),(-.35,-.57),(.40,-.57),(.59,-.30),(.58,.38),(.31,.55),(-.42,.52),(-.60,.19)]
 verts=[]
 for z,factor in [(-.9,1), (height-.035,1),(height,.94)]:
  for x,y in corners:verts.append((x*width*factor,y*depth*factor,z))
 n=8;faces=[tuple(range(7,-1,-1)),tuple(range(16,24))]
 for layer in range(2):
  for j in range(n):faces.append((layer*n+j,layer*n+(j+1)%n,(layer+1)*n+(j+1)%n,(layer+1)*n+j))
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(name,me);scene.collection.objects.link(o);o.location=offset
 for m in materials:me.materials.append(m)
 for f in me.polygons:f.material_index=2 if f.index==1 else 0 if f.index==0 else 1 if f.index%3 else 0
 return o
def block(name,location,size,role=0):
 bpy.ops.mesh.primitive_cube_add(size=1,location=location);o=bpy.context.object;o.name=name;o.scale=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(materials[role]);return o
forms=[]
for variant in range(3):
 offset=Vector((variant*4.,0,0));parts=[mass('GEO-basalt-plateau-%d'%variant,offset,1.25,1.2,[.15,.38,.22][variant],variant)]
 if variant==1:
  parts.append(block('GEO-local-basalt-step',offset+Vector((-.17,.12,.46)),(.62,.72,.24),2))
  parts.append(mass('GEO-low-broken-side-shelf',offset+Vector((.24,-.24,-.18)),1.30,1.18,.03,variant))
 forms.append(parts)
offset=Vector((12,0,0));forms.append([mass('GEO-buried-volcanic-pillar',offset+Vector((-.15,.04,0)),.95,.94,.85,0),mass('GEO-attached-short-basalt-column',offset+Vector((.38,-.13,0)),.80,.74,.52,1)])
# Irregular broken crater lip, open core rather than fragile Boolean-cut caps.
offset=Vector((16,0,0));parts=[]
for i,(x,y,w,d,h) in enumerate([(-.5,-.12,.43,1.0,.62),(.46,.03,.47,.80,.38),(-.03,.48,.87,.35,.75),(.15,-.48,.71,.34,.27)]):parts.append(mass('GEO-broken-crater-lip-%d'%i,offset+Vector((x,y,0)),w,d,h,i))
forms.append(parts)
for index,subdiv,name,role in [(5,4,'GEO-native-molten-core',3),(6,2,'GEO-hidden-sealing-core',4)]:
 bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdiv,radius=1,location=(index*4.,0,0));o=bpy.context.object;o.name=name;o.data.materials.append(materials[role]);forms.append([o])
# Reusable authored cliff shelf with an attached thin molten fall.
offset=Vector((28,0,0));forms.append([mass('GEO-basalt-fall-ledge',offset,1.25,1.2,.22,0),block('GEO-narrow-molten-fall',offset+Vector((.725,-.04,-.20)),(.025,.16,.82),3)])
for parts in forms:
 for o in parts:
  if o.data.validate():raise ValueError('Invalid native mesh')
  bm=bmesh.new();bm.from_mesh(o.data)
  if any(not e.is_manifold for e in bm.edges):raise ValueError('Non-manifold native form')
  bm.free()
bpy.ops.wm.save_as_mainfile(filepath=str(out/'kit.blend'))
kit={'schema':'sidereal.native-planet-kit.v1','layout':'volcanic-geology','materials':[{'name':n,'linearColor':list(c),'roughness':.36 if i<3 else .42} for i,(n,c) in enumerate(zip(names,colors))],'variants':[]}
for index,parts in enumerate(forms):
 positions=[];indices=[];roles=[]
 for o in parts:
  me=o.data;me.calc_loop_triangles();base=len(positions)//3
  for v in me.vertices:
   p=o.matrix_world@v.co;p.x-=index*4.;positions.extend(p)
  for tri in me.loop_triangles:indices.extend(base+i for i in tri.vertices);roles.append(names.index(me.materials[tri.material_index].name))
 kit['variants'].append({'name':['basalt-a','basalt-b','basalt-c','basalt-pillar','basalt-crater','molten-core','sealing-core','basalt-fall'][index],'positions':positions,'indices':indices,'triangleMaterials':roles})
 bpy.ops.object.select_all(action='DESELECT')
 for o in parts:o.select_set(True)
 bpy.context.view_layer.objects.active=parts[0]
 if len(parts)>1:bpy.ops.object.join()
 bpy.context.object.location.x-=index*4.
 bpy.ops.export_scene.gltf(filepath=str(out/('form-%d.glb'%index)),export_format='GLB',use_selection=True,export_apply=True)
(out/'kit.json').write_text(json.dumps(kit,separators=(',',':')));(out/'validation.json').write_text(json.dumps({'partsManifold':True,'triangles':[len(v['indices'])//3 for v in kit['variants']],'publication':'isolated draft'},indent=2));print('VOLCANIC_KIT_DONE')
