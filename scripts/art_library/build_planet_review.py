"""Native editable ice geology draft. No legacy TS geometry is imported or sampled.
A connected blue interior, large irregular snow shelves and grouped shaft kits.
All values normalized to 1m authoring radius; body authority supplies runtime scale.
"""
import bpy, math, random, json, sys, hashlib
from pathlib import Path
from mathutils import Vector
OUT=Path(sys.argv[sys.argv.index('--')+1]); OUT.mkdir(parents=True,exist_ok=True)
SEED=131
rng=random.Random(SEED)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene; scene.unit_settings.system='METRIC'
def mat(name,color,rough=.5,metal=0):
 m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1); p.inputs['Roughness'].default_value=rough; p.inputs['Metallic'].default_value=metal
 return m
snow=mat('Snow | powder white',(.72,.84,.95),.8)
snowShade=mat('Snow | blue shaded crust',(.39,.59,.83),.7)
ice=mat('Ice | rich cyan body',(.012,.25,.58),.22)
iceBright=mat('Ice | clear blue edge',(.026,.51,.86),.17)
iceDeep=mat('Ice | deep cobalt cleft',(.003,.025,.105),.32)
for m in (ice,iceBright):
 p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['IOR'].default_value=1.31; p.inputs['Coat Weight'].default_value=.3
 # Opaque optical baseline: preserve depth silhouette; full transmission is a separate gate.
materials=[snow,snowShade,ice,iceBright,iceDeep]
def mesh(name,vs,fs,mats,indices=None,bevel=0):
 me=bpy.data.meshes.new(name); me.from_pydata(vs,[],fs); me.update()
 ob=bpy.data.objects.new('GEO-'+name,me); scene.collection.objects.link(ob)
 for m in mats: me.materials.append(m)
 if indices:
  for p,i in zip(me.polygons,indices): p.material_index=i
 if bevel:
  mod=ob.modifiers.new('Authored edge chamfer','BEVEL');mod.width=bevel;mod.segments=1
  mod.affect='EDGES'
 return ob
def direction(lon,lat): return Vector((math.cos(lat)*math.cos(lon),math.cos(lat)*math.sin(lon),math.sin(lat)))
def frame(n):
 u=n.cross(Vector((0,0,1)))
 if u.length<.01:u=n.cross(Vector((0,1,0)))
 u.normalize();return u,n.cross(u).normalized()
# Native low-frequency core: deliberately quiet and hidden beneath crust except ravines.
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=4,radius=.925)
core=bpy.context.object;core.name='GEO-deep-connected-ice-interior';core.data.materials.append(iceDeep)
for p in core.data.polygons:p.use_smooth=True
# Irregular thick plates authored around eight explicit macro centres. Gaps form long blue chasms.
centres=[(-1.57,.75,.56,.40),(-1.58,-.10,.49,.45),(-.6,.31,.41,.57),(-2.48,.15,.48,.51),(-1.18,-.84,.60,.34),(.52,.67,.61,.40),(1.9,.10,.62,.65),(.45,-.70,.56,.40)]
for k,(lon,lat,wx,wy) in enumerate(centres):
 n=direction(lon,lat);u,v=frame(n);vs=[];fs=[];mi=[]
 # Polygonal patch authored in rings; squared/chipped outer contour, broad quiet interior.
 N=40;RINGS=6
 boundary=[]
 for j in range(N):
  a=2*math.pi*j/N
  boundary.append(1+.10*math.sin(a*5+k*2)+.06*math.cos(a*9+k)+rng.uniform(-.025,.025))
 vs.append(tuple(n*1.045))
 for ring in range(1,RINGS+1):
  t=ring/RINGS
  for j in range(N):
   a=2*math.pi*j/N;edge=boundary[j]
   p=(n+u*(math.cos(a)*wx*t*edge)+v*(math.sin(a)*wy*t*edge)).normalized()
   h=1.042+.008*round((math.sin(a*3+k)+math.cos(t*7+k))*2)
   vs.append(tuple(p*h))
 for j in range(N):fs.append((0,1+j,1+(j+1)%N));mi.append(0)
 for ring in range(1,RINGS):
  for j in range(N):
   a=1+(ring-1)*N+j;b=1+(ring-1)*N+(j+1)%N;c=1+ring*N+(j+1)%N;d=1+ring*N+j
   fs.append((a,b,c,d));mi.append(0)
 # Thick stratified edge bands, each lower band pulled slightly inward.
 prev=list(range(1+(RINGS-1)*N,1+RINGS*N))
 for band,radius in enumerate([1.016,.985,.94]):
  new=[]
  for j,top in enumerate(prev):
   p=Vector(vs[top]).normalized();new.append(len(vs));vs.append(tuple(p*radius))
  for j in range(N):fs.append((prev[j],new[j],new[(j+1)%N],prev[(j+1)%N]));mi.append(1 if band==0 else 2)
  prev=new
 fs.append(tuple(reversed(prev)));mi.append(2)
 mesh('snow-crust-mass-%02d'%k,vs,fs,[snow,snowShade,ice],mi,.002)
 # Local crust chips clustered near perimeter, not evenly tiled over whole globe.
 for c in range(36):
  a=rng.uniform(0,2*math.pi);t=rng.uniform(.75,1.03)
  p=(n+u*(math.cos(a)*wx*t)+v*(math.sin(a)*wy*t)).normalized()
  size=rng.uniform(.018,.044)
  bpy.ops.mesh.primitive_cube_add(size=1,location=p*rng.uniform(1.04,1.07))
  ob=bpy.context.object;ob.name='GEO-snow-edge-chip-%02d-%03d'%(k,c)
  ob.rotation_mode='QUATERNION';ob.rotation_quaternion=Vector((0,0,1)).rotation_difference(p)
  ob.scale=(size,size*rng.uniform(.7,1.4),size*.6);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
  ob.data.materials.append(snow)
# Three hero ravine groups: long thin faceted shafts grow from blue core to white crust.
# Explicit composition centres prioritize readable grouped vertical geology over uniform noise.
groups=[(-1.03,.3,18),(-2.05,.52,15),(-1.9,-.50,14),(-.25,-.05,12),(.9,.4,10),(2.6,-.4,12)]
for group,(lon,lat,count) in enumerate(groups):
 normal=direction(lon,lat);u,v=frame(normal)
 for j in range(count):
  n=(normal+u*rng.uniform(-.18,.18)+v*rng.uniform(-.20,.20)).normalized();a,b=frame(n)
  width=rng.uniform(.026,.065);base=.90;top=rng.uniform(1.04,1.19)
  vs=[];fs=[];mi=[];sides=5 if j%3 else 6
  for radius,scale in [(base,1),(top-.024,.8),(top,.62)]:
   for s in range(sides):
    ang=2*math.pi*s/sides;vs.append(tuple(n*radius+a*math.cos(ang)*width*scale+b*math.sin(ang)*width*scale))
  fs.append(tuple(reversed(range(sides))));mi.append(0)
  for r in range(2):
   for s in range(sides):fs.append((r*sides+s,r*sides+(s+1)%sides,(r+1)*sides+(s+1)%sides,(r+1)*sides+s));mi.append(1 if s%3==0 else 0)
  fs.append(tuple(range(sides*2,sides*3)));mi.append(2 if j%4==0 else 1)
  mesh('ice-shaft-group-%02d-%02d'%(group,j),vs,fs,[ice,iceBright,snow],mi,.0015)
# Preserve authored pieces in source, material-batch only on exported duplicate meshes later.
geometry=[o for o in scene.objects if o.type=='MESH']
# Render camera aimed at the designed front (-Y); exported kit remains full 360-degree geometry.
bpy.ops.object.camera_add(location=(2.45,-4.3,2.1));cam=bpy.context.object;cam.name='Review-camera';cam.rotation_euler=(-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=2.8;scene.camera=cam
world=bpy.data.worlds.new('Purple blue weak fill');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.07,.09,.22,1);world.node_tree.nodes['Background'].inputs[1].default_value=.35;scene.world=world
for name,loc,color,power,size in [('Sun-key',(-3,-4,6),(1,.91,.83),850,3),('Ice-backlight',(2,3,2),(.15,.62,1),1000,2.5)]:
 bpy.ops.object.light_add(type='AREA',location=loc);ob=bpy.context.object;ob.name=name;ob.data.energy=power;ob.data.color=color;ob.data.shape='DISK';ob.data.size=size;ob.rotation_euler=(-ob.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=32;scene.cycles.use_denoising=False
scene.render.resolution_x=768;scene.render.resolution_y=768;scene.render.resolution_percentage=100;scene.render.film_transparent=True
scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'planet.blend'))
# Export authored surfaces, no voxel sampling; native object transforms preserved.
bpy.ops.object.select_all(action='DESELECT')
for ob in geometry:ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'planet.glb'),export_format='GLB',use_selection=True,export_apply=True)
triangles=0
for ob in geometry:
 ev=ob.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh();me.calc_loop_triangles();triangles+=len(me.loop_triangles);ev.to_mesh_clear()
(OUT/'validation.json').write_text(json.dumps({'seed':SEED,'source':'native Blender editable mesh; no legacy geometry imported','mesh_count':len(geometry),'triangles':triangles,'materials':len(materials),'radius_units':'1 metre draft, runtime scaled to authoritative body radius','publication':'draft only','glb_sha256':hashlib.sha256((OUT/'planet.glb').read_bytes()).hexdigest()},indent=2))
scene.render.filepath=str(OUT/'blender-close.png');bpy.ops.render.render(write_still=True)
print('PLANET_DRAFT_DONE',triangles)
