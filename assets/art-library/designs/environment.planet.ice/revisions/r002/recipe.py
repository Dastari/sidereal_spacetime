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
# Native closed body with intentionally authored CSG canyon volumes.
# Blender BLOCKS remeshing makes the new CSG surface stepped; no legacy voxel input.
bpy.ops.mesh.primitive_uv_sphere_add(segments=64,ring_count=32,radius=1.035)
body=bpy.context.object;body.name='GEO-continuous-carved-ice-crust'
for m in materials:body.data.materials.append(m)
cutters=[]
# Three hero canyons, each a connected zigzag of overlapping carved shelves.
for group,(lon,lat,angle) in enumerate([(-1.02,.28,.25),(-2.10,.50,-.6),(-1.80,-.60,.8),(.30,.1,.3),(2.15,.0,-.4)]):
 n=direction(lon,lat);u,v=frame(n)
 for j in range(5):
  along=(j-2)*.115; across=.035*math.sin(j*1.6+group)
  p=(n+u*(along*math.cos(angle)+across)+v*(along*math.sin(angle))).normalized()
  bpy.ops.mesh.primitive_cube_add(size=1,location=p*1.015)
  ob=bpy.context.object;ob.name='CUT-canyon-%d-%d'%(group,j)
  ob.rotation_mode='QUATERNION';ob.rotation_quaternion=Vector((0,0,1)).rotation_difference(p)
  ob.scale=(.18 if j%2 else .22,.22,.46+.07*math.sin(j+group));bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
  cutters.append(ob)
# A few deep angular craters give rest regions readable macro cavities.
for k,(lon,lat,size) in enumerate([(-1.6,.1,.15),(-.55,-.35,.12),(-2.4,-.2,.12),(.8,.6,.15)]):
 n=direction(lon,lat)
 bpy.ops.mesh.primitive_cylinder_add(vertices=7,radius=size,depth=.45,location=n*1.015)
 ob=bpy.context.object;ob.name='CUT-shaft-%d'%k;ob.rotation_mode='QUATERNION';ob.rotation_quaternion=Vector((0,0,1)).rotation_difference(n);cutters.append(ob)
# Apply separately: overlapping cutters are deliberately allowed and create connected voids.
for cutter in cutters:
 bpy.context.view_layer.objects.active=body
 mod=body.modifiers.new('Authored canyon '+cutter.name,'BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter
 bpy.ops.object.modifier_apply(modifier=mod.name)
 cutter.hide_render=True;cutter.hide_set(True)
# The original CSG cutters remain editable in the source, outside exported geometry.
remesh=body.modifiers.new('Stepped native ice surface','REMESH');remesh.mode='BLOCKS';remesh.octree_depth=7;remesh.scale=.96;remesh.use_remove_disconnected=False
bpy.context.view_layer.objects.active=body;bpy.ops.object.modifier_apply(modifier=remesh.name)
# Depth separates snow planes, glossy cyan walls and deep indigo cavity floors.
for face in body.data.polygons:
 radius=face.center.length
 # centre is refreshed below by mesh.update
body.data.update()
for face in body.data.polygons:
 c=sum((body.data.vertices[i].co for i in face.vertices),Vector())/len(face.vertices);r=c.length
 face.material_index=0 if r>1.006 else (1 if r>.986 else 3 if r>.93 else 2 if r>.87 else 4)
bevel=body.modifiers.new('Small ice edge chamfer','BEVEL');bevel.width=.0014;bevel.segments=1
# Grouped pillars rise inside the canyon walls, never a uniform all-globe spire array.
for group,(lon,lat) in enumerate([(-1.02,.28),(-2.10,.50),(-1.80,-.60),(.30,.1),(2.15,0)]):
 n=direction(lon,lat);u,v=frame(n)
 for j in range(18):
  p=(n+u*rng.uniform(-.25,.25)+v*rng.uniform(-.11,.11)).normalized()
  width=rng.uniform(.018,.04);base=.80;top=rng.uniform(.98,1.075)
  bpy.ops.mesh.primitive_cylinder_add(vertices=5 if j%2 else 6,radius=width,depth=top-base,location=p*((top+base)/2))
  ob=bpy.context.object;ob.name='GEO-connected-blue-column-%d-%d'%(group,j);ob.rotation_mode='QUATERNION';ob.rotation_quaternion=Vector((0,0,1)).rotation_difference(p)
  ob.data.materials.append(iceBright if j%3 else ice)
# Preserve authored pieces in source, material-batch only on exported duplicate meshes later.
geometry=[o for o in scene.objects if o.type=='MESH' and o.name.startswith('GEO-')]
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
