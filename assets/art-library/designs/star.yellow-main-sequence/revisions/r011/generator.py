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
mats=[mat('Golden photosphere',(1,.22,.002),(1,.16,.001),2.4),mat('Yellow raised granules',(1,.39,.006),(1,.32,.004),3.4),mat('Amber relief sides',(.92,.16,.001),(1,.11,.001),1.8),mat('Sunspot umbra',(.038,.009,.001),(.05,.009,.001),.22),mat('Sunspot penumbra',(.72,.13,.001),(.9,.10,.001),1.1),mat('White yellow hot fissures',(1,.82,.22),(1,.74,.24),11),mat('Flare golden core',(1,.58,.035),(1,.57,.06),6),mat('Flare orange edge',(1,.26,.002),(1,.24,.002),2.3)]
for m,alpha in [(mats[6],.55),(mats[7],.19)]:
 m.surface_render_method='DITHERED';m.use_backface_culling=False;m.node_tree.nodes.get('Principled BSDF').inputs['Alpha'].default_value=alpha
# Dual of a native Blender icosphere: hexagonal cells with twelve necessary
# pentagons. Each closed prism remains editable; its UV stores the shared tile
# direction for rigid GPU convection, not per-frame geometry reconstruction.
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=5,radius=1)
base=bpy.context.object
centers=[v.co.normalized() for v in base.data.vertices]
adj=[[] for _ in centers]
for f in base.data.polygons:
 c=f.center.normalized()
 for vi in f.vertices:adj[vi].append(c.copy())
bpy.data.objects.remove(base,do_unlink=True)
vertices=[];faces=[];mi=[];tile_uv=[]
for ti,(n,around) in enumerate(zip(centers,adj)):
 tangent=n.cross(Vector((0,0,1)) if abs(n.z)<.95 else Vector((0,1,0))).normalized()
 bitangent=n.cross(tangent)
 around.sort(key=lambda q:math.atan2(q.dot(bitangent),q.dot(tangent)))
 corners=[(n+(q-n)*.98).normalized() for q in around]
 count=len(corners);start=len(vertices)
 top=1+.008*math.sin(n.x*29+n.y*17)*math.sin(n.z*31-n.x*11)
 vertices.extend([tuple(q*.93) for q in corners]+[tuple(q*top) for q in corners])
 # Exporter flips V; encode in source coordinates to recover the same center.
 uv=(math.atan2(n.y,n.x)/(2*math.pi)+.5,math.acos(n.z)/math.pi)
 tile_uv.extend([uv]*(2*count))
 flow=math.sin(n.x*11+2*math.sin(n.z*6))+math.sin(n.y*13+1.7*math.sin(n.x*7))+.55*math.sin(n.z*17+n.y*4)
 hot=abs(flow)<.13 and (n.z>.06 or n.x>.48)
 grain=math.sin(n.x*57+n.z*17)*math.sin(n.y*61-n.x*13)
 faces.append(tuple(start+count+i for i in range(count)));mi.append(5 if hot else 1 if grain>.1 else 0)
 faces.append(tuple(start+i for i in reversed(range(count))));mi.append(2)
 for i in range(count):
  j=(i+1)%count;faces.append((start+i,start+j,start+count+j,start+count+i));mi.append(2)
me=bpy.data.meshes.new('Editable hexagonal photosphere');me.from_pydata(vertices,[],faces);me.update()
body=bpy.data.objects.new('GEO-golden-photosphere',me);s.collection.objects.link(body)
for m in mats:
 m['stellarSurface']=True
 me.materials.append(m)
uvlayer=me.uv_layers.new(name='ConvectionTileCenter')
for face,idx in zip(me.polygons,mi):
 face.material_index=idx
 for li in face.loop_indices:uvlayer.data[li].uv=tile_uv[me.loops[li].vertex_index]
body['role']='star';body['partId']='photosphere';body['stellarSurface']='hexagonal-convection-v1'
body['trianglePlacementRanges']=json.dumps([{'firstTriangle':0,'triangleCount':sum(len(f.vertices)-2 for f in me.polygons),'partId':'photosphere'}])
# r011 retires the old permanently sculpted spot basins and needle actors.
# Material emission/darkening and rigid tile displacement share one evolving
# field at runtime; the complete native tile mesh is retained at every distance.
def mesh(name,vs,fs,materials,indices=None):
 me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.update();o=bpy.data.objects.new('GEO-'+name,me);s.collection.objects.link(o)
 for m in materials:me.materials.append(m)
 if indices:
  for f,i in zip(me.polygons,indices):f.material_index=i
 o['role']='star';return o
# Short, tapered, bent prominences. Local Z is outward, rooted at the photosphere.
flare_shared=None
for i in range(0):
 phi=i*math.pi*(3-math.sqrt(5));z=1-2*(i+.5)/180;n=Vector((math.sqrt(1-z*z)*math.cos(phi),math.sqrt(1-z*z)*math.sin(phi),z))
 vs=[];fs=[];length=rng.uniform(.045,.16);width=rng.uniform(.009,.020)
 for k in range(6):
  t=k/5;cx=math.sin(t*math.pi*.85)*length*.38;w=width*(1-t*.94)
  for dx,dy in [(-1,-1),(1,-1),(1,1),(-1,1)]:vs.append((cx+dx*w,dy*w*.45,t*length))
 for k in range(5):
  for a in range(4):fs.append((4*k+a,4*k+(a+1)%4,4*(k+1)+(a+1)%4,4*(k+1)+a))
 fs.extend([(3,2,1,0),(20,21,22,23)])
 o=mesh(f'anchored-flare-{i:02}',vs,fs,[mats[6],mats[7]],[a%2 for a in range(len(fs))]);o.location=n*.992;o.rotation_mode='QUATERNION';o.rotation_quaternion=Vector((0,0,1)).rotation_difference(n);o['partId']=f'flare-{i}';o['flarePhase']=i*2.3999632297;o['flarePeriod']=5+(i%7)*.71
 if flare_shared is None:flare_shared=(o.data,width,length)
 else:
  unused=o.data;o.data=flare_shared[0];bpy.data.meshes.remove(unused)
 base=(width/flare_shared[1],width/flare_shared[1],length/flare_shared[2]);o['flareBaseScale']=list(base)
 for frame in range(1,242,12):
  t=(frame-1)/24;p=.5+.5*math.sin(t*2*math.pi/o['flarePeriod']+o['flarePhase']);o.scale=(base[0]*(.65+.35*p),base[1]*(.65+.35*p),base[2]*(.4+.8*p));o.keyframe_insert(data_path='scale',frame=frame)
 for fc in o.animation_data.action.fcurves:
  for k in fc.keyframe_points:k.interpolation='LINEAR'
# Sparse nearby native hot ejecta, sharing source material.
for i in range(0):
 n=Vector((rng.uniform(-1,1),rng.uniform(-1,1),rng.uniform(-1,1))).normalized();bpy.ops.mesh.primitive_cube_add(size=rng.uniform(.012,.026),location=n*rng.uniform(1.08,1.22));o=bpy.context.object;o.name=f'GEO-ejecta-{i:02}';o.rotation_euler=(rng.random(),rng.random(),rng.random());o.data.materials.append(mats[6]);o['role']='star';o['partId']=f'ejecta-{i}'
s.frame_set(1)
# Reference-facing angle exposes three front sunspot complexes.
bpy.ops.object.camera_add(location=(2.0,-4.7,2.0));camera=bpy.context.object;camera.name='CAM-reference';camera.rotation_euler=(Vector((0,0,0))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=2.85;s.camera=camera
bpy.ops.object.light_add(type='AREA',location=(-3,-4,5));bpy.context.object.data.energy=130;bpy.context.object.data.size=5
s.world.use_nodes=True;s.world.node_tree.nodes.get('Background').inputs['Color'].default_value=(.0004,.0007,.002,1);s.world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.08;s.render.engine='CYCLES';s.cycles.samples=32;s.cycles.use_denoising=False;s.render.resolution_x=768;s.render.resolution_y=768;s.render.resolution_percentage=100;s.view_settings.view_transform='Standard';s.view_settings.exposure=-1.6
s.use_nodes=True;nodes=s.node_tree.nodes;nodes.clear();rl=nodes.new('CompositorNodeRLayers');glare=nodes.new('CompositorNodeGlare');glare.glare_type='FOG_GLOW';glare.quality='HIGH';glare.threshold=1.6;glare.size=8;comp=nodes.new('CompositorNodeComposite');s.node_tree.links.new(rl.outputs['Image'],glare.inputs['Image']);s.node_tree.links.new(glare.outputs['Image'],comp.inputs['Image'])
bpy.ops.wm.save_as_mainfile(filepath=str(out/'blender-source.blend'))
bpy.ops.object.select_all(action='DESELECT')
for o in s.objects:
 if o.type=='MESH':o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(out/'star.glb'),export_format='GLB',use_selection=True,export_extras=True,export_animations=False,export_apply=False)
s.render.filepath=str(out/'blender-close.png');bpy.ops.render.render(write_still=True)
shutil.copy2(__file__,out/'generator.py')
files={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in out.iterdir() if p.is_file()}
(out/'validation.json').write_text(json.dumps({'schema':1,'files':files,'photosphereRadius':1,'meshes':sum(o.type=='MESH' for o in s.objects),'polygons':sum(len(o.data.polygons) for o in s.objects if o.type=='MESH'),'flareCount':0,'tiles':len(centers),'convectionUV':True,'authoredPBR':True,'role':'star','seed':3901},indent=2)+'\n')
