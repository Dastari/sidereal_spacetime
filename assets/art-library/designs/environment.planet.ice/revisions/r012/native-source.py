"""Native Blender terrain patch kit with compatible top boundaries. Review only."""
import bpy,bmesh,math,random,json,sys,hashlib
from pathlib import Path
from mathutils import Vector
OUT=Path(sys.argv[sys.argv.index('--')+1]);OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
colors=[(.92,.96,1.),(.20,.43,.76),(.004,.085,.42),(.005,.27,.72),(.002,.027,.11)]
materials=[]
for i,c in enumerate(colors):
 m=bpy.data.materials.new(['powder-snow','blue-snow-edge','cobalt-ice','cyan-ice-face','deep-ice'][i]);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*c,1);p.inputs['Roughness'].default_value=.78 if i==0 else .2 if i in [2,3] else .45;p.inputs['IOR'].default_value=1.31;materials.append(m)
variants=[]
def cube(name,loc,scale):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.scale=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return o
def stepped_crust(name,offset,variant):
 # Native authored patch surface, not a remeshed sphere. Flat powder shelves and
 # connected vertical steps are retained as editable faces through GLB export.
 N=16;heights=[]
 randoms=random.Random(913+variant)
 regions=[(randoms.uniform(-.4,.4),randoms.uniform(-.4,.4),randoms.choice([.035,.055,.09,.13])) for _ in range(6)]
 for y in range(N):
  row=[]
  for x in range(N):
   u=(x+.5)/N-.5;v=(y+.5)/N-.5
   if x in [0,N-1]:h=.06
   elif y in [0,N-1]:h=.06
   else:
    # Few unequal shelf regions rather than repeated isocontour rings.
    region=min(regions,key=lambda r:(u-r[0])**2+(v-r[1])**2)
    h=region[2]
    if min(x,y,N-1-x,N-1-y)==1:h=.06
   row.append(h)
  heights.append(row)
 # Avoid edge-only diagonal contacts in the closed native shelf volume.
 for repair in range(32):
  changed=False
  for y in range(N-1):
   for x in range(N-1):
    a,b,c,d=heights[y][x],heights[y][x+1],heights[y+1][x],heights[y+1][x+1]
    if min(a,d)>max(b,c):heights[y][x]=max(b,c);changed=True
    elif min(b,c)>max(a,d):heights[y][x+1]=max(a,d);changed=True
  if not changed:break
 levels=sorted(set([-.32]+[h for row in heights for h in row]))
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
    a=top[edge];b=top[(edge+1)%4]
    cuts=[z for z in levels if lower<=z<=h]
    for low,high in zip(cuts,cuts[1:]):face([(a[0],a[1],high),(a[0],a[1],low),(b[0],b[1],low),(b[0],b[1],high)])
   face([(x0,y1,-.32),(x1,y1,-.32),(x1,y0,-.32),(x0,y0,-.32)])
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

def ice_shaft(name,loc,width,depth,height,rng):
 # Authored irregular octagonal column with tapered, slanted cap.
 angle=rng.uniform(-.4,.4);outline=[]
 for i in range(8):
  a=2*math.pi*i/8+angle;outline.append((math.cos(a)*width*.5,math.sin(a)*depth*.5))
 ob=prism(name,outline,-height*.5,height*.5,loc)
 for v in ob.data.vertices:
  if v.co.z>0:
   v.co.x*=.66;v.co.y*=.66;v.co.z+=v.co.x*rng.uniform(.2,.6)
 return ob

def cut_outline(variant,width,layer):
 if variant==4:
  # Irregular curved basin, retaining a broad cyan stepped rim.
  return [(math.cos(a)*width*(.58+.08*math.sin(3*a))-.015, math.sin(a)*width*(.65+.06*math.cos(5*a))+.02) for a in [2*math.pi*i/18 for i in range(18)]]
 if variant==3:
  # A curved elbow built from nested quarter-circle boundaries, with exact
  # constant-width straight collars at both shared ports.
  radius=.34;half=width*.5
  outer=[(.62,-half),(.34,-half)]
  inner=[(.62,half),(.34,half)]
  for i in range(1,10):
   angle=-math.pi/2-math.pi/2*i/9
   outer.append((.34+(radius+half)*math.cos(angle),.34+(radius+half)*math.sin(angle)))
   inner.append((.34+max(.015,radius-half)*math.cos(angle),.34+max(.015,radius-half)*math.sin(angle)))
  outer.append((-half,.62));inner.append((half,.62))
  return outer+list(reversed(inner))
 start=-.62 if variant==2 else -.30
 xs=sorted(set([start,-.5,-.44,-.3,-.16,0,.16,.3,.44,.5,.62]))
 xs=[x for x in xs if x>=start]
 upper=[];lower=[]
 for i,x in enumerate(xs):
  edge=abs(x)>=.44;center=0 if edge else .035*math.sin(x*12+variant)
  half=width*.5*(1 if edge else .82+.12*math.sin(i*1.4+variant))
  upper.append((x,center+half));lower.append((x,center-half))
 return upper+list(reversed(lower))

for variant in range(7):
 rng=random.Random(131+variant);objects=[];offset=Vector((variant*1.35,0,0))
 body=stepped_crust('GEO-kit-%d-continuous-stepped-crust'%variant,offset,variant);objects.append(body)
 for m in materials:body.data.materials.append(m)
 cutters=[]
 if variant in [1,2,3,4,6]:
  # Shared ports E=0,N=1,W=2,S=3. Every port has the same nested depth/width profile.
  profiles=[(.78,.06),(.58,.16),(.40,.275)] if variant in [4,6] else [(.27,.06),(.17,.16),(.10,.275)]
  for layer,(width,depth) in enumerate(profiles):
   outlines=[cut_outline(4 if variant==6 else variant,width,layer)]
   if variant==6:outlines.append(cut_outline(1,[.27,.17,.10][layer],layer))
   for k,outline in enumerate(outlines):
    cut=prism('CUT-glacial-%d-%d-%d'%(variant,layer,k),outline,-depth,.26,offset)
    bpy.context.view_layer.objects.active=body;mod=body.modifiers.new('Native oval basin and medium crack','BOOLEAN');mod.operation='DIFFERENCE';mod.object=cut;mod.solver='EXACT';bpy.ops.object.modifier_apply(modifier=mod.name);cut.hide_render=True;cut.hide_set(True);cutters.append(cut)
  for face in body.data.polygons:
   z=sum(body.data.vertices[i].co.z for i in face.vertices)/len(face.vertices)
   face.material_index=0 if z>-.012 else 1 if z>-.045 else 3 if z>-.17 else 2 if z>-.23 else 4
  # Medium ledges/ribs cluster on cavity flanks. Different widths and heights.
  for j in range(20):
   side=-1 if j%2 else 1
   if variant in [4,6]:
    angle=(j%5)*.16+(0 if j<10 else math.pi);x=math.cos(angle)*rng.uniform(.23,.31);y=math.sin(angle)*rng.uniform(.25,.34)
   else:x=side*rng.uniform(.07,.14);y=rng.uniform(-.28,.28)
   width=rng.uniform(.025,.055);height=rng.uniform(.15,.29);top=rng.uniform(-.055,.06)
   ob=ice_shaft('GEO-kit-%d-wall-outcrop-%d'%(variant,j),offset+Vector((x,y,top-height/2)),width,rng.uniform(.025,.055),height,rng);ob.data.materials.append(materials[3 if j%3 else 2]);objects.append(ob)
   bevel=ob.modifiers.new('Faceted broad ice edge','BEVEL');bevel.width=.004;bevel.segments=1
  # Snow thickness varies only around fractures; the external patch boundary stays exact.
  for j in range(18):
   x=rng.choice([-1,1])*rng.uniform(.23,.35);y=rng.uniform(-.26,.26)
   ob=cube('GEO-kit-%d-broken-snow-lip-%d'%(variant,j),offset+Vector((x,y,.008)),(rng.uniform(.03,.08),rng.uniform(.025,.06),rng.uniform(.014,.046)));ob.data.materials.append(materials[0]);objects.append(ob)
 if variant==5:
  for j in range(10):
   x=rng.uniform(-.22,.22);y=rng.uniform(-.22,.22);height=rng.uniform(.12,.28)
   ob=ice_shaft('GEO-broad-blue-outcrop-%d'%j,offset+Vector((x,y,height/2-.035)),rng.uniform(.09,.17),rng.uniform(.07,.13),height,rng);ob.data.materials.append(materials[3 if j%3 else 2]);objects.append(ob)
   bevel=ob.modifiers.new('Large broken facet','BEVEL');bevel.width=.005;bevel.segments=1
   if j%3==0:
    cap=cube('GEO-outcrop-snow-cap-%d'%j,offset+Vector((x,y,height-.03)),(.052,.047,.016));cap.data.materials.append(materials[0]);objects.append(cap)
 # Grouped native snow fragments, with some fragments crossing unit boundaries.
 # Surface raycasts retain snow continuity while leaving actual cavity openings clear.
 centers=[(rng.uniform(-.46,.46),rng.uniform(-.46,.46)) for _ in range(7)]
 for j in range(125):
  cx,cy=centers[j%len(centers)];x=max(-.495,min(.495,cx+rng.gauss(0,.12)));y=max(-.495,min(.495,cy+rng.gauss(0,.12)))
  hit,point,normal,faceid=body.ray_cast(Vector((x,y,1)),Vector((0,0,-1)))
  if not hit or normal.z<.7 or body.data.polygons[faceid].material_index!=0:continue
  width=rng.uniform(.035,.082);depth=rng.uniform(.035,.075);height=rng.uniform(.025,.075)
  ob=cube('GEO-kit-%d-clustered-snow-%d'%(variant,j),offset+Vector((x,y,point.z+height*.5-.009-j*.00001)),(width,depth,height))
  ob.rotation_euler.z=rng.choice([0,0,math.pi/4,-math.pi/4]);ob.data.materials.append(materials[0]);objects.append(ob)
 edge_normals={}
 for polygon in body.data.polygons:
  for key in polygon.edge_keys:edge_normals.setdefault(tuple(sorted(key)),[]).append(polygon.normal.copy())
 weights=body.data.attributes.new('bevel_weight_edge','FLOAT','EDGE')
 for edge in body.data.edges:
  points=[body.data.vertices[i].co for i in edge.vertices]
  boundary=any(all(abs(point[axis]-side)<1e-6 for point in points) for axis in [0,1] for side in [-.5,.5])
  normals=edge_normals.get(tuple(sorted(edge.vertices)),[])
  corner=len(normals)==2 and normals[0].dot(normals[1])<.95
  weights.data[edge.index].value=1 if corner and not boundary else 0
 bevel=body.modifiers.new('Interior ice edge chamfer; exact shared collar','BEVEL');bevel.width=.001;bevel.segments=1;bevel.limit_method='WEIGHT' 
 variants.append(objects)
# Fail closed on invalid surface topology before exporting any review asset.
for objects in variants:
 body=objects[0]
 if body.data.validate(verbose=True):raise ValueError('Invalid native terrain mesh: '+body.name)
 bm=bmesh.new();bm.from_mesh(body.data)
 bad=sum(1 for e in bm.edges if not e.is_manifold);bm.free()
 if bad:raise ValueError('Nonmanifold native terrain edges: '+body.name+' '+str(bad))
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
 kit['variants'].append({'name':['quiet-crust','ravine-end','ravine-straight','ravine-bend','deep-crater','broad-blue-outcrop','basin-end'][index],'ports':[[],[0],[0,2],[0,1],[],[],[0]][index],'positions':vs,'normals':ns,'indices':indices,'triangleMaterials':roles})
 bpy.ops.object.select_all(action='DESELECT')
 for ob in objects:ob.select_set(True)
 bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.convert(target='MESH');bpy.ops.object.join();bpy.context.object.location.x-=index*1.35
 bpy.ops.export_scene.gltf(filepath=str(OUT/('variant-%d.glb'%index)),export_format='GLB',use_selection=True,export_apply=True)
(OUT/'kit.json').write_text(json.dumps(kit,separators=(',',':')))
(OUT/'validation.json').write_text(json.dumps({'triangles':[len(v['indices'])//3 for v in kit['variants']],'materials':5,'nativeSources':True,'legacyGeometryImported':False,'publication':'isolated draft only'},indent=2))
print('NATIVE_KIT_DONE',[(v['name'],len(v['indices'])//3) for v in kit['variants']])
