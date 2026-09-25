"""Measured stacking/carrier review and common-scale Blender/Babylon scene."""
from pathlib import Path
import bpy,json,sys,math
from mathutils import Vector
JOBS=json.loads(Path(sys.argv[sys.argv.index('--')+1]).read_text());BASE=Path(JOBS[0]['output']).parent

def box(name,loc,dim,material):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name='REVIEW-'+name;o.dimensions=dim;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(material);b=o.modifiers.new('Edge','BEVEL');b.width=.006;b.segments=2;return o

def material(name,color):
 m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=.5;return m

def gauge(x,y):
 grey=material('Review scale gauge',(.22,.30,.40));pale=material('Review gauge helmet',(.72,.76,.80));made=[]
 for xx in [-.105,.105]:
  made.append(box('gauge-foot',(x+xx,y-.055,.065),(.12,.25,.13),grey));made.append(box('gauge-leg',(x+xx,y,.52),(.13,.14,.83),grey))
 made.append(box('gauge-pelvis',(x,y,.94),(.34,.19,.20),grey));made.append(box('gauge-torso',(x,y,1.245),(.40,.22,.48),pale))
 for xx in [-.27,.27]:
  made.append(box('gauge-arm',(x+xx,y,1.24),(.11,.14,.48),grey));made.append(box('160mm-glove-gauge',(x+xx,y,.93),(.16,.10,.18),pale))
 bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,radius=1,location=(x,y,1.65));o=bpy.context.object;o.name='REVIEW-1.8m-crew-scale-gauge';o.scale=(.13,.115,.15);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(pale);made.append(o)
 return made

def camera(scene,loc,target,scale):
 c=scene.camera;c.location=loc;c.rotation_euler=(Vector(target)-c.location).to_track_quat('-Z','Y').to_euler();c.data.type='ORTHO';c.data.ortho_scale=scale

for j in JOBS:
 out=Path(j['output'])
 if (out/'stack-carrier.blend').exists():continue
 bpy.ops.wm.open_mainfile(filepath=str(out/'blender-source.blend'));scene=bpy.context.scene;s=j['specification'];w,d,h=s['dimensions_m'];objs=[o for o in scene.objects if o.type=='MESH' and o.name.startswith('GEO-') and not o.hide_render];deps=bpy.context.evaluated_depsgraph_get()
 # Copy evaluated neutral geometry only for authored matching stack interfaces.
 stacking=not s['family'].startswith('fluid-') and s.get('size') not in ['narrow','tiny']
 # Copy evaluated neutral geometry; no identity/authority reuse claim.
 for o in (objs if stacking else []):
  mesh=bpy.data.meshes.new_from_object(o.evaluated_get(deps));mesh.transform(o.matrix_world);cp=bpy.data.objects.new('REVIEW-empty-stack-'+o.name,mesh);scene.collection.objects.link(cp);cp.location.z=h-.016
 deck=material('Review 2m carrier',(.055,.08,.12));line=material('Review bay edging',(.22,.39,.50));depth=4 if d>2 else 2
 box('2m-carrier',(0,0,-.075),(2,depth,.15),deck)
 for x in [-.985,.985]:box('2m-bay-outline',(x,0,.003),(.014,depth,.006),line)
 for y in [-depth/2+.015,depth/2-.015]:box('2m-bay-outline',(0,y,.003),(2,.014,.006),line)
 if depth==4:box('2m-interface',(0,0,.003),(2,.014,.006),line)
 gauge(1.6,-.1);scene.render.film_transparent=False;scene.render.resolution_x=1200;scene.render.resolution_y=1000;scene.world.color=(.07,.08,.10)
 top=(2*h-.016 if stacking else h)+.12;camera(scene,(6,-8,6),(0.45,0,top*.48),max(4.8,depth*1.75,top*1.7));scene.render.filepath=str(out/'blender-stack-carrier.png');bpy.ops.render.render(write_still=True)
 scene['stack_scope']='Empty mechanical mating review only, not loaded-stack or certified handling' if stacking else 'One-high carrier footprint only; no stacking interface authored';scene['carrier']='2 m construction carrier; 4 m depth only for oversized';bpy.ops.wm.save_as_mainfile(filepath=str(out/'stack-carrier.blend'))
 (out/'fit.json').write_text(json.dumps({'carrier_dimensions_m':[2,depth,.15],'stack_pitch_m':h-.016 if stacking else None,'foot_m':.04 if stacking else None,'receiver_void_m':.044 if stacking else None,'insertion_m':.016 if stacking else None,'crew_gauge_height_m':1.8,'crew_gauge_is_actual_rig':False,'filled_stacking_approved':False,'source_sha256':__import__('hashlib').sha256((out/'blender-source.blend').read_bytes()).hexdigest()},indent=2))
 print('FIT_COMPLETE',j['slug'],flush=True)
if '--no-common' in sys.argv:sys.exit(0)
# Four standard sizes at one scale, with 2 m bays and a1.8 m humanoid gauge.
bpy.ops.wm.open_mainfile(filepath=str(Path(JOBS[0]['output'])/'blender-source.blend'))
for o in list(bpy.data.objects):bpy.data.objects.remove(o,do_unlink=True)
scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
for i,j in enumerate(JOBS[:4]):
 before=set(scene.objects);bpy.ops.import_scene.gltf(filepath=str(Path(j['output'])/'glb.glb'));new=set(scene.objects)-before;w,d,h=j['specification']['dimensions_m'];offset=Vector((-5+i*2,-1.88+d/2,0))
 for o in new:
  if o.parent not in new:o.location+=offset
 deck=material('2m common scale deck '+str(i),(.055,.08,.12));line=material('2m common scale marking '+str(i),(.25,.42,.53));depth=4 if i==3 else 2;yc=0 if i==3 else -1
 box('bay-'+str(i),(-5+i*2,yc,-.075),(1.99,depth-.01,.15),deck)
 for x in [-6+i*2+.015,-4+i*2-.015]:box('2m-tile-edge',(x,yc,.003),(.014,depth-.03,.006),line)
box('crew-scale-deck',(-7,-1,-.075),(1.99,1.99,.15),material('Gauge deck',(.055,.08,.12)))
gauge(-6.7,-1.45)
bpy.context.view_layer.update();export=[];deps=bpy.context.evaluated_depsgraph_get()
for o in list(scene.objects):
 if o.type!='MESH':continue
 mesh=bpy.data.meshes.new_from_object(o.evaluated_get(deps));mesh.transform(o.matrix_world);cp=bpy.data.objects.new('REVIEW-common-scale-'+o.name,mesh);scene.collection.objects.link(cp);export.append(cp);o.hide_render=True
bpy.ops.object.select_all(action='DESELECT')
for o in export:o.select_set(True)
bpy.context.view_layer.objects.active=export[0];bpy.ops.export_scene.gltf(filepath=str(BASE/'common-scale.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=True)
bpy.ops.object.camera_add();scene.camera=bpy.context.object;camera(scene,(8,-16,11),(-2.2,-.2,.75),12.0)
for loc,power,sz in [((0,-5,10),4500,8),((-8,-1,6),2500,6),((2,5,7),3500,6)]:
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.size=sz;o.rotation_euler=(Vector((-2,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
scene.render.resolution_x=1800;scene.render.resolution_y=1000;scene.render.film_transparent=False;scene.render.filepath=str(BASE/'blender-common-scale.png');bpy.ops.wm.save_as_mainfile(filepath=str(BASE/'common-scale.blend'));bpy.ops.render.render(write_still=True)
