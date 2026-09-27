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
# One native hero shelf unit; quiet coplanar top, deeply exposed connected blue walls.
# Concave orthogonal perimeter forms a glacial ravine mouth in the front (-Y).
from mathutils.geometry import tessellate_polygon
outline=[(-.58,.42),(-.27,.42),(-.27,.48),(.15,.48),(.15,.40),(.52,.40),(.52,.12),(.58,.12),(.58,-.23),(.43,-.23),(.43,-.35),(.26,-.35),(.26,-.15),(.19,-.15),(.19,.04),(.07,.04),(.07,.14),(-.08,.14),(-.08,.04),(-.18,.04),(-.18,-.16),(-.28,-.16),(-.28,-.36),(-.43,-.36),(-.43,-.42),(-.58,-.42)]
# Counterclockwise winding for outward top.
outline=list(reversed(outline))
vs=[];fs=[];mi=[];N=len(outline)
for z,scale in [(.24,1),(.20,1),(.175,.97),(-.16,.93),(-.23,.90)]:
 for x,y in outline:vs.append((x*scale,y*scale,z))
poly=[Vector(vs[i]) for i in range(N)]
for tri in tessellate_polygon([poly]):fs.append(tuple(v if isinstance(v,int) else min(range(N),key=lambda i:(poly[i]-v).length) for v in tri));mi.append(0)
for ring in range(4):
 for j in range(N):
  fs.append((ring*N+j,(ring+1)*N+j,(ring+1)*N+(j+1)%N,ring*N+(j+1)%N));mi.append(0 if ring==0 else 1 if ring==1 else 3 if j%4 else 2)
fs.append(tuple(reversed(range(4*N,5*N))));mi.append(4)
mesh('hero-white-overhang-blue-wall',vs,fs,materials,mi,.004)
# Medium vertical ice ribs cover canyon walls with a coherent layered glacier face.
for k in range(32):
 # Two wall clusters straddle central ravine; variation stays grouped, no uniform planet scatter.
 side=-1 if k<16 else 1;j=k%16
 x=side*(.19+.018*(j%4));y=-.29+(j//4)*.095
 width=rng.uniform(.027,.048);height=rng.uniform(.23,.42);z=.15-height/2
 bpy.ops.mesh.primitive_cube_add(size=1,location=(x,y,z));ob=bpy.context.object;ob.name='GEO-connected-glacial-wall-rib-%02d'%k
 ob.scale=(width,width*rng.uniform(.7,1.15),height);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);ob.data.materials.append(iceBright if k%3 else ice)
 mod=ob.modifiers.new('Ice facet chamfer','BEVEL');mod.width=.005;mod.segments=1
# Two edge tower groups emerge above the plateau, merging into exposed wall bases.
for group,(cx,cy) in enumerate([(-.43,-.25),(.39,.12)]):
 for j in range(8):
  x=cx+rng.uniform(-.06,.06);y=cy+rng.uniform(-.08,.08);height=rng.uniform(.22,.39)
  bpy.ops.mesh.primitive_cylinder_add(vertices=5 if j%2 else 6,radius=rng.uniform(.025,.047),depth=height,location=(x,y,.13+height/2))
  ob=bpy.context.object;ob.name='GEO-edge-ice-tower-%d-%d'%(group,j);ob.data.materials.append(iceBright if j%3 else ice)
# A few wide low snow shelves and chips cluster at fracture edges; leave the centre quiet.
for j in range(22):
 side=-1 if j%2 else 1;x=side*rng.uniform(.31,.51);y=rng.uniform(-.28,.28)
 bpy.ops.mesh.primitive_cube_add(size=1,location=(x,y,.25));ob=bpy.context.object;ob.name='GEO-snow-fracture-lip-%02d'%j
 ob.scale=(rng.uniform(.028,.072),rng.uniform(.025,.05),rng.uniform(.012,.035));bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);ob.data.materials.append(snow)
 mod=ob.modifiers.new('Powder lip chamfer','BEVEL');mod.width=.003;mod.segments=1
# Preserve authored pieces in source, material-batch only on exported duplicate meshes later.
geometry=[o for o in scene.objects if o.type=='MESH']
# Render camera aimed at the designed front (-Y); exported kit remains full 360-degree geometry.
bpy.ops.object.camera_add(location=(1.55,-2.4,1.6));cam=bpy.context.object;cam.name='Review-camera';cam.rotation_euler=(-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=1.7;scene.camera=cam
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
bpy.context.view_layer.objects.active=geometry[0]
bpy.ops.object.convert(target='MESH');bpy.ops.object.join();geometry=[bpy.context.object]
bpy.ops.export_scene.gltf(filepath=str(OUT/'planet.glb'),export_format='GLB',use_selection=True,export_apply=True)
triangles=0
for ob in geometry:
 ev=ob.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh();me.calc_loop_triangles();triangles+=len(me.loop_triangles);ev.to_mesh_clear()
(OUT/'validation.json').write_text(json.dumps({'seed':SEED,'source':'native Blender editable mesh; no legacy geometry imported','mesh_count':len(geometry),'triangles':triangles,'materials':len(materials),'radius_units':'1 metre draft, runtime scaled to authoritative body radius','publication':'draft only','glb_sha256':hashlib.sha256((OUT/'planet.glb').read_bytes()).hexdigest()},indent=2))
scene.render.filepath=str(OUT/'blender-close.png');bpy.ops.render.render(write_still=True)
print('PLANET_DRAFT_DONE',triangles)
