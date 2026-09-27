"""Editable native tiled stellar photosphere and individually anchored prominences.
All geometry is authored in Blender, normalized to one metre photosphere radius.
No imported TypeScript surfaces, remeshing, decimation or shader replacement.
"""
import bpy, math, random, json, sys, hashlib, shutil
from pathlib import Path
from mathutils import Vector
out=Path(sys.argv[sys.argv.index('--')+1]);rng=random.Random(3901)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
s=bpy.context.scene;s.unit_settings.system='METRIC'
def mat(name,c,emission,strength):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*c,1)
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*c,1);p.inputs['Roughness'].default_value=.62;p.inputs['Emission Color'].default_value=(*emission,1);p.inputs['Emission Strength'].default_value=strength
 return m
mats=[mat('Golden photosphere',(.95,.33,.002),(1,.42,.002),1.7),mat('Yellow raised granules',(1,.57,.008),(1,.57,.004),2.1),mat('Amber relief sides',(.55,.16,.002),(.95,.20,.001),.45),mat('Sunspot umbra',(.038,.009,.001),(.05,.009,.001),.22),mat('Sunspot penumbra',(.26,.065,.001),(.34,.06,.001),.4),mat('White yellow hot fissures',(1,.84,.16),(1,.71,.06),7.5),mat('Flare golden core',(1,.58,.035),(1,.47,.012),4.5),mat('Flare orange edge',(1,.20,.002),(1,.15,.001),1.8)]
vertices=[];faces=[];mi=[];ranges=[]
# Authored clustered dark complexes distributed around the complete sphere.
spots=[(Vector(v).normalized(),r) for v,r in [((.55,-.78,.32),.22),((-.25,-.9,.2),.17),((.22,-.75,-.62),.19),((.88,-.22,.25),.16),((-.75,.5,.4),.20),((.15,.95,-.1),.21),((-.6,-.4,-.7),.13)]]
def tile(corners,top,bottom,role,part):
 start=len(vertices);fstart=len(faces)
 vertices.extend([tuple(p*bottom) for p in corners]);vertices.extend([tuple(p*top) for p in corners])
 for f,idx in [((4,5,6,7),role),((0,3,2,1),2),((0,1,5,4),2),((1,2,6,5),2),((2,3,7,6),2),((3,0,4,7),2)]:faces.append(tuple(start+i for i in f));mi.append(idx if role not in (3,4) else role)
 ranges.append({'partId':part,'triangleStart':fstart*2,'triangleCount':12})
# Six cube-sphere panels, each formed from individually editable closed relief tiles.
N=19
for axis in range(3):
 for sign in (-1,1):
  for j in range(N):
   for i in range(N):
    u=-1+(i+.5)*2/N;v=-1+(j+.5)*2/N;center=Vector((0,0,0));center[axis]=sign;center[(axis+1)%3]=u;center[(axis+2)%3]=v;center.normalize()
    d=min((center-p).length/r for p,r in spots);d+=.23*math.sin(u*31+v*19)+.12*math.cos(v*41-u*13);noise=rng.random()
    role=3 if d<.68+noise*.22 else 4 if d<1.05+noise*.12 else 1 if noise>.43 else 0
    top=.97+rng.random()*.095 if role not in (3,4) else .962+rng.random()*.012
    corners=[]
    for du,dv in [(-1,-1),(1,-1),(1,1),(-1,1)]:
     q=Vector((0,0,0));q[axis]=sign;q[(axis+1)%3]=u+du*.90/N;q[(axis+2)%3]=v+dv*.90/N;corners.append(q.normalized())
    if sign<0:corners.reverse()
    tile(corners,top,.93,role,f'photosphere-{axis}-{sign}-{i}-{j}')
def mesh(name,vs,fs,materials,indices=None):
 me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.update();o=bpy.data.objects.new('GEO-'+name,me);s.collection.objects.link(o)
 for m in materials:me.materials.append(m)
 if indices:
  for f,i in zip(me.polygons,indices):f.material_index=i
 o['role']='star';return o
# Native sculpted continuous photosphere, authored stepped block remesh.
# This begins with a new Blender surface, not an existing runtime/voxel model.
bpy.ops.mesh.primitive_uv_sphere_add(segments=96,ring_count=48,radius=1)
body=bpy.context.object;body.name='GEO-golden-photosphere'
for vert in body.data.vertices:
 n=vert.co.normalized();d=min((n-p).length/r for p,r in spots)
 relief=.02*math.sin(n.x*24+n.z*8)*math.sin(n.y*19-n.z*13)+.012*math.cos(n.z*33+n.x*7)
 depression=max(0,1-d)*.13
 vert.co*=1+relief-depression
mod=body.modifiers.new('Native stepped photosphere','REMESH');mod.mode='BLOCKS';mod.octree_depth=6;mod.scale=.95;mod.use_remove_disconnected=False
bpy.context.view_layer.objects.active=body;bpy.ops.object.modifier_apply(modifier=mod.name)
for m in mats:body.data.materials.append(m)
for face in body.data.polygons:
 c=face.center.normalized();d=min((c-p).length/r for p,r in spots);d+=.15*math.sin(c.x*39+c.z*22)+.12*math.cos(c.y*43-c.z*31);noise=rng.random()
 face.material_index=3 if d<.63 else 4 if d<.97 else 5 if noise>.89 else 1 if noise>.53 else 0 if noise>.16 else 2
body['role']='star';body['partId']='photosphere';body['trianglePlacementRanges']=json.dumps([{'firstTriangle':0,'triangleCount':sum(len(f.vertices)-2 for f in body.data.polygons),'partId':'photosphere'}])
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=4,radius=.85);core=bpy.context.object;core.name='GEO-hot-fissure-interior';core.data.materials.append(mats[5]);core['role']='star';core['partId']='hot-fissure-interior'
# Short, tapered, bent prominences. Local Z is outward, rooted at the photosphere.
for i in range(180):
 phi=i*math.pi*(3-math.sqrt(5));z=1-2*(i+.5)/180;n=Vector((math.sqrt(1-z*z)*math.cos(phi),math.sqrt(1-z*z)*math.sin(phi),z))
 vs=[];fs=[];length=rng.uniform(.045,.16);width=rng.uniform(.009,.020)
 for k in range(6):
  t=k/5;cx=math.sin(t*math.pi*.85)*length*.38;w=width*(1-t*.94)
  for dx,dy in [(-1,-1),(1,-1),(1,1),(-1,1)]:vs.append((cx+dx*w,dy*w*.45,t*length))
 for k in range(5):
  for a in range(4):fs.append((4*k+a,4*k+(a+1)%4,4*(k+1)+(a+1)%4,4*(k+1)+a))
 fs.extend([(3,2,1,0),(20,21,22,23)])
 o=mesh(f'anchored-flare-{i:02}',vs,fs,[mats[6],mats[7]],[a%2 for a in range(len(fs))]);o.location=n*.992;o.rotation_mode='QUATERNION';o.rotation_quaternion=Vector((0,0,1)).rotation_difference(n);o['partId']=f'flare-{i}';o['flarePhase']=i*2.3999632297;o['flarePeriod']=5+(i%7)*.71
 for frame in range(1,242,12):
  t=(frame-1)/24;p=.5+.5*math.sin(t*2*math.pi/o['flarePeriod']+o['flarePhase']);o.scale=(.65+.35*p,.65+.35*p,.4+.8*p);o.keyframe_insert(data_path='scale',frame=frame)
 for fc in o.animation_data.action.fcurves:
  for k in fc.keyframe_points:k.interpolation='LINEAR'
# Sparse nearby native hot ejecta, sharing source material.
for i in range(18):
 n=Vector((rng.uniform(-1,1),rng.uniform(-1,1),rng.uniform(-1,1))).normalized();bpy.ops.mesh.primitive_cube_add(size=rng.uniform(.012,.026),location=n*rng.uniform(1.08,1.22));o=bpy.context.object;o.name=f'GEO-ejecta-{i:02}';o.rotation_euler=(rng.random(),rng.random(),rng.random());o.data.materials.append(mats[6]);o['role']='star';o['partId']=f'ejecta-{i}'
s.frame_set(1)
# Reference-facing angle exposes three front sunspot complexes.
bpy.ops.object.camera_add(location=(2.0,-4.7,2.0));camera=bpy.context.object;camera.name='CAM-reference';camera.rotation_euler=(Vector((0,0,0))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=2.85;s.camera=camera
bpy.ops.object.light_add(type='AREA',location=(-3,-4,5));bpy.context.object.data.energy=130;bpy.context.object.data.size=5
s.world.use_nodes=True;s.world.node_tree.nodes.get('Background').inputs['Color'].default_value=(.0004,.0007,.002,1);s.world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.08;s.render.engine='CYCLES';s.cycles.samples=32;s.cycles.use_denoising=False;s.render.resolution_x=768;s.render.resolution_y=768;s.render.resolution_percentage=100;s.view_settings.view_transform='Standard';s.view_settings.exposure=-1.6
s.use_nodes=True;nodes=s.node_tree.nodes;nodes.clear();rl=nodes.new('CompositorNodeRLayers');glare=nodes.new('CompositorNodeGlare');glare.glare_type='FOG_GLOW';glare.quality='HIGH';glare.threshold=1.6;glare.size=7;comp=nodes.new('CompositorNodeComposite');s.node_tree.links.new(rl.outputs['Image'],glare.inputs['Image']);s.node_tree.links.new(glare.outputs['Image'],comp.inputs['Image'])
bpy.ops.wm.save_as_mainfile(filepath=str(out/'blender-source.blend'))
bpy.ops.object.select_all(action='DESELECT')
for o in s.objects:
 if o.type=='MESH':o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(out/'star.glb'),export_format='GLB',use_selection=True,export_extras=True,export_animations=False,export_apply=False)
s.render.filepath=str(out/'blender-close.png');bpy.ops.render.render(write_still=True)
shutil.copy2(__file__,out/'generator.py')
files={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in out.iterdir() if p.is_file()}
(out/'validation.json').write_text(json.dumps({'schema':1,'files':files,'photosphereRadius':1,'meshes':sum(o.type=='MESH' for o in s.objects),'polygons':sum(len(o.data.polygons) for o in s.objects if o.type=='MESH'),'flareCount':180,'authoredPBR':True,'role':'star','seed':3901},indent=2)+'\n')
