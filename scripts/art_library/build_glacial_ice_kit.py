"""Native Blender terrain patch kit with compatible top boundaries. Review only."""
import bpy,bmesh,math,random,json,sys,hashlib
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
def stepped_crust(name,offset,variant):
 # Native authored patch surface, not a remeshed sphere. Flat powder shelves and
 # connected vertical steps are retained as editable faces through GLB export.
 N=20;heights=[]
 randoms=random.Random(913+variant)
 regions=[(randoms.uniform(-.4,.4),randoms.uniform(-.4,.4),randoms.choice([.02,.05,.09,.14])) for _ in range(6)]
 for y in range(N):
  row=[]
  for x in range(N):
   u=(x+.5)/N-.5;v=(y+.5)/N-.5
   if x in [0,N-1]:h=.012*((min(y,N-1-y)//2)%3)
   elif y in [0,N-1]:h=.012*((min(x,N-1-x)//2)%3)
   else:
    # Few unequal shelf regions rather than repeated isocontour rings.
    region=min(regions,key=lambda r:(u-r[0])**2+(v-r[1])**2)
    h=region[2]
    if min(x,y,N-1-x,N-1-y)==1:h=min(h,.05)
   row.append(h)
  heights.append(row)
 verts=[];faces=[]
 def face(points):
  start=len(verts);verts.extend(points);faces.append(tuple(range(start,start+len(points))))
 for y in range(N):
  for x in range(N):
   x0=x/N-.5;x1=(x+1)/N-.5;y0=y/N-.5;y1=(y+1)/N-.5;h=heights[y][x]
   top=[(x0,y0,h),(x1,y0,h),(x1,y1,h),(x0,y1,h)];face(top)
   for edge,(dx,dy) in enumerate([(0,-1),(1,0),(0,1),(-1,0)]):
    nx=x+dx;ny=y+dy;lower=heights[ny][nx] if 0<=nx<N and 0<=ny<N else -.32
    if lower>=h:continue
    a=top[edge];b=top[(edge+1)%4];face([a,(a[0],a[1],lower),(b[0],b[1],lower),b])
 face([(-.5,.5,-.32),(.5,.5,-.32),(.5,-.5,-.32),(-.5,-.5,-.32)])
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();bm=bmesh.new();bm.from_mesh(me);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
 ob=bpy.data.objects.new(name,me);scene.collection.objects.link(ob);ob.location=offset
 return ob
def prism(name,outline,zbottom,ztop,offset):
 verts=[(x,y,z) for z in [zbottom,ztop] for x,y in outline];n=len(outline)
 faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]
 faces.extend((i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n))
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update()
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
 ob=bpy.data.objects.new(name,me);scene.collection.objects.link(ob);ob.location=offset;return ob

def cut_outline(variant,width,layer):
 if variant==4:
  # Irregular curved basin, retaining a broad cyan stepped rim.
  return [(math.cos(a)*width*(.58+.08*math.sin(3*a))-.015, math.sin(a)*width*(.65+.06*math.cos(5*a))+.02) for a in [2*math.pi*i/18 for i in range(18)]]
 if variant==3:
  centers=[(.62,0),(.46,0),(.29,.035),(.16,.13),(.045,.28),(0,.46),(0,.62)]
 else:
  start=-.62 if variant==2 else -.26
  centers=[]
  for i in range(13):
   x=start+(.62-start)*i/12
   envelope=max(0,1-(x/.49)**2)
   centers.append((x,envelope*(.06*math.sin(x*11+variant)+.022*math.cos(x*23))))
 left=[];right=[]
 for i,(x,y) in enumerate(centers):
  before=centers[max(0,i-1)];after=centers[min(len(centers)-1,i+1)];dx=after[0]-before[0];dy=after[1]-before[1];l=math.hypot(dx,dy);nx=-dy/l;ny=dx/l
  edge=max(abs(x),abs(y));variation=1 if edge>.44 else .82+.18*math.sin(i*1.7+variant)+.13*math.cos(i*.9)
  half=width*.5*variation
  left.append((x+nx*half,y+ny*half));right.append((x-nx*half,y-ny*half))
 return left+list(reversed(right))

for variant in range(6):
 rng=random.Random(131+variant);objects=[];offset=Vector((variant*1.35,0,0))
 body=stepped_crust('GEO-kit-%d-continuous-stepped-crust'%variant,offset,variant);objects.append(body)
 for m in materials:body.data.materials.append(m)
 cutters=[]
 if variant in [1,2,3,4]:
  # Shared ports E=0,N=1,W=2,S=3. Every port has the same nested depth/width profile.
  for layer,(width,depth) in enumerate([(.64,.055),(.50,.155),(.36,.275)]):
   outline=cut_outline(variant,width,layer)
   cut=prism('CUT-glacial-%d-%d'%(variant,layer),outline,-depth,.26,offset)
   bpy.context.view_layer.objects.active=body;mod=body.modifiers.new('Native irregular shared-port glacial cut','BOOLEAN');mod.operation='DIFFERENCE';mod.object=cut;mod.solver='EXACT';bpy.ops.object.modifier_apply(modifier=mod.name);cut.hide_render=True;cut.hide_set(True);cutters.append(cut)
  for face in body.data.polygons:
   z=sum(body.data.vertices[i].co.z for i in face.vertices)/len(face.vertices)
   face.material_index=0 if z>-.012 else 1 if z>-.045 else 3 if z>-.17 else 2 if z>-.23 else 4
  # Medium ledges/ribs cluster on cavity flanks. Different widths and heights.
  for j in range(25):
   side=-1 if j%2 else 1;x=side*rng.uniform(.15,.29);y=rng.uniform(-.20,.20)
   width=rng.uniform(.025,.055);height=rng.uniform(.19,.42);top=rng.uniform(-.03,.14)
   ob=cube('GEO-kit-%d-wall-outcrop-%d'%(variant,j),offset+Vector((x,y,top-height/2)),(width,rng.uniform(.025,.055),height));ob.data.materials.append(materials[3 if j%3 else 2]);objects.append(ob)
   bevel=ob.modifiers.new('Faceted broad ice edge','BEVEL');bevel.width=.004;bevel.segments=1
  # Snow thickness varies only around fractures; the external patch boundary stays exact.
  for j in range(8):
   x=rng.choice([-1,1])*rng.uniform(.23,.35);y=rng.uniform(-.26,.26)
   ob=cube('GEO-kit-%d-broken-snow-lip-%d'%(variant,j),offset+Vector((x,y,.008)),(rng.uniform(.03,.08),rng.uniform(.025,.06),rng.uniform(.012,.025)));ob.data.materials.append(materials[0]);objects.append(ob)
 if variant==5:
  for j in range(22):
   x=rng.uniform(-.22,.22);y=rng.uniform(-.22,.22);height=rng.uniform(.22,.48)
   ob=cube('GEO-broad-blue-outcrop-%d'%j,offset+Vector((x,y,height/2-.035)),(rng.uniform(.035,.078),rng.uniform(.035,.070),height));ob.data.materials.append(materials[3 if j%3 else 2]);objects.append(ob)
   bevel=ob.modifiers.new('Large broken facet','BEVEL');bevel.width=.005;bevel.segments=1
   if j%3==0:
    cap=cube('GEO-outcrop-snow-cap-%d'%j,offset+Vector((x,y,height-.03)),(.052,.047,.016));cap.data.materials.append(materials[0]);objects.append(cap)
 bevel=body.modifiers.new('Authored ice edge chamfer','BEVEL');bevel.width=.001;bevel.segments=1
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
