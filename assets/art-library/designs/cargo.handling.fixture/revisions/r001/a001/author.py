"""Native 8x6m floor / 6x4m cargo handling fixture. No art sources are rescaled."""
from pathlib import Path
import bpy,json,hashlib,sys
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(sys.argv[sys.argv.index('--')+1]);OUT.mkdir(parents=True,exist_ok=True)
source=ROOT/'assets/art-library/designs/cargo.carrier.grid-support/revisions/r000/a003/stack-fixture.blend'
bpy.ops.wm.open_mainfile(filepath=str(source))
scene=bpy.context.scene
for o in bpy.data.objects:
 if o.name.startswith(('REVIEW-floor','REVIEW-height-gauge','REVIEW-roof-datum')):o.hide_render=True
placements=[('base',(0,0,.1875)),('middle-0-0',(0,0,.875)),('middle-1-0',(1,0,.875)),('middle-0-1',(0,1,.875)),('middle-1-1',(1,1,.875)),('top',(0,0,1.5625))]
for name,_ in placements:
 for o in bpy.data.objects:
  if o.name.startswith(('GEO-FIXTURE-'+name+'-','PAYLOAD-'+name+'-')):o['handlingInstance']=name
receivers=ROOT/'assets/art-library/designs/cargo.restraint.standard-small/revisions/r000/a001/receiver-set.glb'
for name,offset in placements:
 before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(receivers));new=set(bpy.data.objects)-before
 for o in new:
  o['handlingInstance']=name;o.name='RECEIVER-'+name+'-'+o.name
  if o.parent not in new:o.location+=Vector(offset)
floor=ROOT/'assets/art-library/shipyard-floor/r002/kit.glb'
before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(floor));imported=set(bpy.data.objects)-before
selected=[o for o in imported if o.type=='MESH' and o.name.startswith('GEO-part-a3f5c1c3caa171a94d6c--floor')]
if not selected:raise RuntimeError('Exact native square floor group missing')
for o in imported:o.hide_render=True
for x in [-1,1,3,5]:
 for y in [-1,1,3]:
  for original in selected:
   o=original.copy();o.data=original.data;scene.collection.objects.link(o);o.parent=None;o.matrix_world=original.matrix_world.copy();o.location+=Vector((x,y,0));o.hide_render=False;o.name=f'NATIVE-FLOOR-{x}-{y}-'+original.name
scene.render.resolution_x=1200;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=16;scene.cycles.use_denoising=False
scene.render.threads_mode='FIXED';scene.render.threads=2
cam=scene.camera;cam.location=(10,-10,10);cam.rotation_euler=(Vector((3,1.6,.5))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=10
for o in bpy.data.objects:
 if o.type=='LIGHT':o.data.energy*=3;o.data.size*=1.5
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'stacked-fixture.blend'))
scene.render.filepath=str(OUT/'stacked-native-floor.png');bpy.ops.render.render(write_still=True)
targets={'top':(3,0,.1875),'middle-0-0':(0,3,.1875),'middle-1-0':(1,3,.1875),'middle-0-1':(2,3,.1875),'middle-1-1':(3,3,.1875)}
for name,origin in placements:
 if name not in targets:continue
 delta=Vector(targets[name])-Vector(origin)
 for o in bpy.data.objects:
  if o.get('handlingInstance')==name and (not o.parent or o.parent.get('handlingInstance')!=name):o.location+=delta
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'unstacked-fixture.blend'))
scene.render.filepath=str(OUT/'unstacked-native-floor.png');bpy.ops.render.render(write_still=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
(OUT/'evidence.json').write_text(json.dumps({'schema':'sidereal.cargo-handling-native-evidence.v1','sourceStack':str(source.relative_to(ROOT)),'sourceStackSha256':sha(source),'floorKitSha256':sha(floor),'receiverSha256':sha(receivers),'floorRectangleM':[-1,-1,7,5],'cargoZoneM':[0,0,6,4],'nativeFloorModules':12,'nativeFloorTopM':.1875,'pairedRoofUndersideM':3,'roofRender':'cutaway; paired native roof is pinned in construction document','stackTopM':2.25,'payloadScaling':'none','stacked':placements,'unstacked':targets,'notApproval':'Technical handling evidence, not art approval or engineered load certification'},indent=2)+'\n')
