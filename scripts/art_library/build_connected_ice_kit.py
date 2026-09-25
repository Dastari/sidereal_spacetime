"""Native Blender terrain patch kit with compatible top boundaries. Review only."""
import bpy,math,random,json,sys,hashlib
from pathlib import Path
from mathutils import Vector
OUT=Path(sys.argv[sys.argv.index('--')+1]);OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
colors=[(.78,.86,.97),(.40,.65,.88),(.012,.24,.57),(.025,.49,.83),(.002,.027,.11)]
materials=[]
for i,c in enumerate(colors):
 m=bpy.data.materials.new(['powder-snow','blue-snow-edge','cobalt-ice','cyan-ice-face','deep-ice'][i]);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*c,1);p.inputs['Roughness'].default_value=.78 if i==0 else .2 if i in [2,3] else .45;p.inputs['IOR'].default_value=1.31;materials.append(m)
variants=[]
def cube(name,loc,scale):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.scale=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return o
for variant in range(6):
 rng=random.Random(131+variant);objects=[];offset=Vector((variant*1.35,0,0))
 body=cube('GEO-kit-%d-continuous-crust'%variant,offset+Vector((0,0,-.16)),(1,1,.32));objects.append(body)
 # Native subdivision retains enough domain samples for later sphere deformation.
 bpy.context.view_layer.objects.active=body;bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.subdivide(number_cuts=9);bpy.ops.object.mode_set(mode='OBJECT')
 for m in materials:body.data.materials.append(m)
 cutters=[]
 if variant in [1,2,3,4]:
  # Shared ports E=0,N=1,W=2,S=3. Every port has the same nested depth/width profile.
  for layer,(width,depth) in enumerate([(.46,.055),(.36,.155),(.27,.275)]):
   if variant==1: rectangles=[(.25,0,.75,width)]
   elif variant==2:rectangles=[(0,0,1.2,width)]
   elif variant==3:rectangles=[(.25,0,.75,width),(0,.25,width,.75)]
   else:rectangles=[(-.07,.03,width*.95,width*.9),(.1,-.08,width*.7,width*.8)]
   for k,(cx,cy,wx,wy) in enumerate(rectangles):
    cut=cube('CUT-kit-%d-%d-%d'%(variant,k,layer),offset+Vector((cx,cy,(.15-depth)/2)),(wx,wy,.15+depth))
    bpy.context.view_layer.objects.active=body;mod=body.modifiers.new('Native shared-port stepped ravine','BOOLEAN');mod.operation='DIFFERENCE';mod.object=cut;mod.solver='EXACT';bpy.ops.object.modifier_apply(modifier=mod.name);cut.hide_render=True;cut.hide_set(True);cutters.append(cut)
  for face in body.data.polygons:
   z=sum(body.data.vertices[i].co.z for i in face.vertices)/len(face.vertices)-.16
   face.material_index=0 if z>-.012 else 1 if z>-.045 else 3 if z>-.17 else 2 if z>-.23 else 4
  # Medium ledges/ribs cluster on cavity flanks. Different widths and heights.
  for j in range(14):
   side=-1 if j%2 else 1;x=side*rng.uniform(.18,.29);y=rng.uniform(-.20,.20)
   width=rng.uniform(.025,.068);height=rng.uniform(.12,.31);top=rng.uniform(-.04,.09)
   ob=cube('GEO-kit-%d-wall-outcrop-%d'%(variant,j),offset+Vector((x,y,top-height/2)),(width,rng.uniform(.035,.085),height));ob.data.materials.append(materials[3 if j%3 else 2]);objects.append(ob)
   bevel=ob.modifiers.new('Faceted broad ice edge','BEVEL');bevel.width=.004;bevel.segments=1
  # Snow thickness varies only around fractures; the external patch boundary stays exact.
  for j in range(8):
   x=rng.choice([-1,1])*rng.uniform(.23,.35);y=rng.uniform(-.26,.26)
   ob=cube('GEO-kit-%d-broken-snow-lip-%d'%(variant,j),offset+Vector((x,y,.008)),(rng.uniform(.03,.08),rng.uniform(.025,.06),rng.uniform(.012,.025)));ob.data.materials.append(materials[0]);objects.append(ob)
 if variant==5:
  for j in range(12):
   x=rng.uniform(-.22,.22);y=rng.uniform(-.22,.22);height=rng.uniform(.12,.30)
   ob=cube('GEO-broad-blue-outcrop-%d'%j,offset+Vector((x,y,height/2-.035)),(rng.uniform(.09,.19),rng.uniform(.07,.16),height));ob.data.materials.append(materials[3 if j%3 else 2]);objects.append(ob)
   bevel=ob.modifiers.new('Large broken facet','BEVEL');bevel.width=.009;bevel.segments=1
   if j%3==0:
    cap=cube('GEO-outcrop-snow-cap-%d'%j,offset+Vector((x,y,height-.03)),(.11,.09,.015));cap.data.materials.append(materials[0]);objects.append(cap)
 bevel=body.modifiers.new('Authored ice edge chamfer','BEVEL');bevel.width=.0015;bevel.segments=1
 variants.append(objects)
# Editable source preserves individual native parts and CSG cutters.
if not (OUT/'kit.blend').exists():bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'kit.blend'))
kit={'schema':'sidereal.native-planet-kit.v1','authoringAxes':'Blender Z-up; local domain x/y[-.5,.5], topz0','layout':'connected-ravines','materials':[{'name':m.name,'linearColor':list(c),'roughness':.78 if i==0 else .2 if i in [2,3] else .45} for i,(m,c) in enumerate(zip(materials,colors))],'variants':[]}
for index,objects in enumerate(variants):
 vs=[];ns=[];indices=[];roles=[];deps=bpy.context.evaluated_depsgraph_get()
 for ob in objects:
  ev=ob.evaluated_get(deps);me=ev.to_mesh();me.calc_loop_triangles();base=len(vs)//3
  for v in me.vertices:
   p=ob.matrix_world@v.co;p.x-=index*1.35;vs.extend(p);ns.extend(v.normal)
  for tri in me.loop_triangles:
   indices.extend(base+i for i in tri.vertices);m=me.materials[tri.material_index];roles.append([v.name for v in materials].index(m.name))
  ev.to_mesh_clear()
 kit['variants'].append({'name':['quiet-crust','ravine-end','ravine-straight','ravine-bend','deep-crater','broad-blue-outcrop'][index],'ports':[[],[0],[0,2],[0,1],[],[]][index],'positions':vs,'normals':ns,'indices':indices,'triangleMaterials':roles})
 bpy.ops.object.select_all(action='DESELECT')
 for ob in objects:ob.select_set(True)
 bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.convert(target='MESH');bpy.ops.object.join();bpy.context.object.location.x-=index*1.35
 bpy.ops.export_scene.gltf(filepath=str(OUT/('variant-%d.glb'%index)),export_format='GLB',use_selection=True,export_apply=True)
(OUT/'kit.json').write_text(json.dumps(kit,separators=(',',':')))
(OUT/'validation.json').write_text(json.dumps({'triangles':[len(v['indices'])//3 for v in kit['variants']],'materials':5,'nativeSources':True,'legacyGeometryImported':False,'publication':'isolated draft only'},indent=2))
print('NATIVE_KIT_DONE',[(v['name'],len(v['indices'])//3) for v in kit['variants']])
