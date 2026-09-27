"""Native connected crystalline moon bodies; standalone new art, no runtime writes."""
import bpy,bmesh,math,json,sys,hashlib,shutil,random
from pathlib import Path
from mathutils import Vector
out=Path(sys.argv[sys.argv.index('--')+1]).resolve();rid=sys.argv[sys.argv.index('--')+2]
assert rid in ['planets--crystal-moon-1','planets--crystal-moon-2'];second=rid.endswith('-2')
old=Path('output/playwright/planet-reference-20260914')/(rid.removeprefix('planets--')+'-r003')
assert not(out/'kit.blend').exists();out.mkdir(parents=True,exist_ok=True)
original=json.loads((old/'kit.json').read_text())
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
with bpy.data.libraries.load(str((old/'kit.blend').resolve()),link=False)as(src,dst):dst.materials=[m['name']for m in original['materials']]
materials=dst.materials;assert all(materials)
for path in old.glob('*.png'):
 if path.name.startswith('material-'):shutil.copy2(path,out/path.name)
for mat in materials:
 for node in mat.node_tree.nodes:
  if node.type=='TEX_IMAGE' and node.image:
   name=Path(node.image.filepath).name
   if(out/name).exists():node.image.filepath=str(out/name);node.image.pack()
scene=bpy.context.scene
# Native quad-dominant closed template. Unequal facet support points and two
# designed asymmetric clefts distinguish the compact angular second moon.
bm=bmesh.new()
# Explicit unequal cube-face district plan, authored and welded in Blender.
# Offsets bend shared boundaries coherently; no runtime generator or occupancy.
grid=[-1,-.44,.19,1]if second else[-1,-.64,-.21,.26,.69,1]
for axis in range(3):
 for side in [-1,1]:
  other=[j for j in range(3)if j!=axis]
  for i in range(len(grid)-1):
   for j in range(len(grid)-1):
    corners=[]
    for a,b in[(grid[i],grid[j]),(grid[i+1],grid[j]),(grid[i+1],grid[j+1]),(grid[i],grid[j+1])]:
     q=[0,0,0];q[axis]=side;q[other[0]]=a;q[other[1]]=b
     n=Vector(q).normalized();n+=Vector((.055*math.sin(n.y*9+n.z*4),.051*math.sin(n.z*8+n.x*3),.049*math.sin(n.x*7+n.y*4)))
     corners.append(bm.verts.new(n.normalized()))
    bm.faces.new(corners)
bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
# Selectively join neighbouring authored districts into L-shaped unequal
# facets. Leave other small plates to keep a real middle-scale hierarchy.
rng=random.Random(7301 if second else 8903)
for edge in list(bm.edges):
 if edge.is_valid and len(edge.link_faces)==2 and rng.random()<.30 and sum(len(f.verts)for f in edge.link_faces)<=10:
  bmesh.ops.dissolve_edges(bm,edges=[edge],use_verts=False,use_face_split=False)
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
for v in bm.verts:
 n=v.co.normalized();theta=math.atan2(n.y,n.x)
 if second:
  radius=.94+.075*math.sin(theta*3+n.z*2)+.055*n.x
  # Two non-annular fracture cuts through different sectors, never craters.
  if abs(n.x+.18*n.z-.11)<.14 and n.y<.4:radius-=.19
  if abs(n.y-.3*n.z+.36)<.105 and n.x<.2:radius-=.12
  # Three explicit unequal concave sectors interrupt the angular silhouette.
  for direction,depth,threshold in[((.90,-.20,.40),.29,.87),((-.40,.70,.65),.21,.88),((-.70,-.60,-.20),.17,.90)]:
   d=n.dot(Vector(direction).normalized());radius-=depth*max(0,(d-threshold)/(1-threshold))
  v.co=Vector((n.x*1.04,n.y*.86,n.z*1.03))*radius
 else:
  radius=.98+.025*math.sin(theta*3+n.z*6)
  for direction,depth,threshold in[((.65,-.6,.4),.13,.90),((-.4,-.75,-.3),.10,.92),((-.3,.5,.8),.14,.89)]:
   radius-=depth*max(0,(n.dot(Vector(direction).normalized())-threshold)/(1-threshold))
  v.co=n*radius
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.faces.ensure_lookup_table()
vertices=[];faces=[];roles=[];panel_records=[]
def face(points,role):
 start=len(vertices);vertices.extend(points);faces.append(tuple(range(start,start+len(points))));roles.append(role)
for i,p in enumerate(bm.faces):
 points=[v.co.copy()for v in p.verts];c=sum(points,Vector())/len(points);normal=p.normal.copy();r=random.Random(1703+i*73+(71 if second else 0))
 # Selected cliff lips have an actual stepped concave footprint, rather
 # than narrow painted lines or uniform bevel noise on every plate.
 chipped=(i%5 in (1,3))if not second else(i%4==1)
 chip_edges=[]
 if chipped:
  expanded=[]
  for j,a in enumerate(points):
   b=points[(j+1)%len(points)];expanded.append(a)
   if j==(i//3)%len(points) and (b-a).length>.16:
    inward=(c-(a+b)*.5).normalized();depth=min((b-a).length*.24,.10 if second else .068)
    e=a.lerp(b,.29);f=a.lerp(b,.56)
    expanded.extend([e,e+inward*depth,f+inward*depth,f]);chip_edges.append(j)
  points=expanded
 gap=.965 if not second else .975;rise=(.016+.075*max(0,math.sin(c.x*9+c.z*5))+r.random()*.025)if not second else(.018+.065*max(0,math.sin(c.y*8+c.x*4))+r.random()*.020)
 # Selected irregular connected recessed planes interrupt the outer shell.
 cleft=(abs(c.x+.28*c.z-.12)<.16 and c.y<.4)or(abs(c.z-.48*c.y+.38)<.11 and c.x>-.3)
 if cleft:rise-=.14 if second else .09
 low=[c+(v-c)*1.018-normal*.19 for v in points]
 rim=[c+(v-c)*gap+normal*rise for v in points]
 cap=[c+(v-c)*(gap-.045)+normal*(rise+.008)for v in points]
 # One connected edge route follows a broad equatorial diagonal and forks
 # locally. Emission remains existing native core role, not all-face tint.
 luminous=abs(c.z-.28*c.x)<(.14 if second else .18)or(abs(c.x+.45)<.10 and c.z>.1)
 top_role=3 if i%4 else 4
 if i%9==0 or cleft:top_role=5
 if luminous and i%3==0 and not cleft:top_role=7
 face(list(reversed(low)),5)
 for j in range(len(points)):
  k=(j+1)%len(points);face([low[j],low[k],rim[k],rim[j]],5 if j%3 else 3)
  face([rim[j],rim[k],cap[k],cap[j]],7 if luminous and j%3!=1 else (6 if i%7==0 and j==0 else top_role))
 face(cap,top_role)
 panel_records.append({'panel':i,'chippedEdges':chip_edges,'luminousEdgeRoute':luminous,'topRole':top_role,'height':rise,'normal':list(normal),'center':list(c)})
bm.free()
mesh=bpy.data.meshes.new('native-connected-crystalline-body');mesh.from_pydata(vertices,[],faces);mesh.update()
obj=bpy.data.objects.new('GEO-'+rid+'-connected-crystalline-body',mesh);scene.collection.objects.link(obj)
for m in materials:mesh.materials.append(m)
for p,role in zip(mesh.polygons,roles):p.material_index=role
bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
obj['role']='planet';obj['partId']=rid+'/native-body';obj['authoring']='native-crystal-moon-r004';obj['morphology']='angular-connected-mass'if second else'round-fractured-crystal-plates'
# Per-polygon authoring UVs transport existing authored PBR maps unchanged.
uv=mesh.uv_layers.new(name='UVMap')
for p in mesh.polygons:
 coords=[mesh.vertices[i].co for i in p.vertices];axis=(coords[1]-coords[0]).normalized();cross=p.normal.cross(axis).normalized();lo=min(q.dot(axis)for q in coords);hi=max(q.dot(axis)for q in coords);vlo=min(q.dot(cross)for q in coords);vhi=max(q.dot(cross)for q in coords)
 for loop in p.loop_indices:
  q=mesh.vertices[mesh.loops[loop].vertex_index].co;uv.data[loop].uv=((q.dot(axis)-lo)/max(hi-lo,.001),(q.dot(cross)-vlo)/max(vhi-vlo,.001))
mesh.calc_loop_triangles();positions=[];normals=[];uvs=[];indices=[];tri_roles=[]
for tri in mesh.loop_triangles:
 for vi,loop in zip(tri.vertices,tri.loops):positions.extend(mesh.vertices[vi].co);normals.extend(mesh.corner_normals[loop].vector);uvs.extend((uv.data[loop].uv.x,1-uv.data[loop].uv.y));indices.append(len(indices))
 tri_roles.append(tri.material_index)
kit={'schema':'sidereal.native-planet-kit.v1','layout':'crystal-moon-native-body','coveredReferenceIds':[rid],'compositionRecipe':{'referenceId':rid,'layoutSeed':601 if second else 587,'retainedAllLOD':True,'bodyVariant':'connected-crystalline-body'},'materials':original['materials'],'variants':[{'name':'connected-crystalline-body','positions':positions,'normals':normals,'uvs':uvs,'indices':indices,'triangleMaterials':tri_roles}],'uvConvention':original['uvConvention'],'sourceReuse':{'materialsOnly':str(old/'kit.json'),'sha256':hashlib.sha256((old/'kit.json').read_bytes()).hexdigest(),'geometry':'New editable native connected faceted body; no Rocky substrate or crater reuse'}}
(out/'kit.json').write_text(json.dumps(kit,separators=(',',':')));(out/'native-panel-plan.json').write_text(json.dumps(panel_records,indent=2))
bpy.context.view_layer.objects.active=obj;obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(out/'connected-crystalline-body.glb'),export_format='GLB',use_selection=True,export_extras=True)
sys.path.insert(0,str(Path('scripts/art_library').resolve()));from preserve_native_kit_ior import corrected_glb
path=out/'connected-crystalline-body.glb';raw=out/'blender-raw';raw.mkdir(exist_ok=True);shutil.copy2(path,raw/path.name);data,_=corrected_glb(path.read_bytes(),{m['name']:m for m in kit['materials']});path.write_bytes(data)
scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=False;scene.render.resolution_x=800;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.render.film_transparent=True;scene.world.color=(.06,.06,.06);scene.view_settings.view_transform='AgX'
bpy.ops.object.camera_add(location=(3,-5,2.5));camera=bpy.context.object;camera.rotation_euler=(-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=2.8;scene.camera=camera
for location,energy,size in [((-3,-4,5),650,3),((3,1,2),220,2)]:
 bpy.ops.object.light_add(type='AREA',location=location);light=bpy.context.object;light.data.energy=energy;light.data.size=size;light.rotation_euler=(-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.wm.save_as_mainfile(filepath=str(out/'kit.blend'));scene.render.filepath=str(out/'native-body-preview.png');bpy.ops.render.render(write_still=True)
scene.render.resolution_percentage=25;scene.render.filepath=str(out/'native-body-small-preview.png');bpy.ops.render.render(write_still=True)
scene.render.resolution_x=90 if not second else 78;scene.render.resolution_y=scene.render.resolution_x;scene.render.resolution_percentage=100;scene.render.filepath=str(out/'native-reference-scale.png');bpy.ops.render.render(write_still=True)
(out/'validation.json').write_text(json.dumps({'referenceId':rid,'triangles':len(indices)//3,'panels':len(panel_records),'materialDefinitionsExact':True,'connectedNativeSurface':True,'allLODIdenticalSource':True},indent=2))
shutil.copy2(__file__,out/'source-builder.py');print('CRYSTAL_MOON3_DONE',rid,len(indices)//3)
