"""Native editable dogleg stair. Separate visuals, support patches and collision evidence."""
import bpy, json, math, hashlib, sys, gzip
from pathlib import Path
from mathutils import Vector, Matrix
OUT=Path(sys.argv[sys.argv.index('--')+1]);OUT.mkdir(parents=True,exist_ok=False);ROOT=Path.cwd()
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=32;scene.cycles.use_denoising=False
scene.render.resolution_x=1400;scene.render.resolution_y=1150;scene.render.resolution_percentage=100;scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=True;scene.world.color=(.13,.13,.13)
def collection(name):
 c=bpy.data.collections.new(name);scene.collection.children.link(c);return c
auth=collection('AUTHORING-NATIVE-MESHES');exports=collection('GEO');context=collection('REVIEW-EXACT-NATIVE-PANELS');proxies=collection('AUDIT-SEPARATE-PROXIES');sockets=collection('SOCKETS')
def material(name,c,metal=0,rough=.38):
 m=bpy.data.materials.new(name);m.diffuse_color=(*c,1);m.use_nodes=True;m.use_backface_culling=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*c,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;return m
mats={'enamel':material('MAT-pale-enamel',(.68,.73,.76),.12),'frame':material('MAT-indigo-frame',(.06,.085,.13),.55),'steel':material('MAT-tread-steel',(.28,.35,.40),.78),'grip':material('MAT-traction-inlay',(.045,.055,.065),.05,.8),'hazard':material('MAT-amber-nosing',(.88,.38,.05),.1),'service':material('MAT-burgundy-access',(.32,.045,.07),.1)}
objects=[];supports=[]
def move(o,col):
 for c in list(o.users_collection):c.objects.unlink(o)
 col.objects.link(o)
def finish(o,group,name,mat,bevel=.006):
 o.name='GEO-'+group+'--'+name;o['native_group']=group;o.data.materials.append(mats[mat]);move(o,auth)
 if bevel:
  b=o.modifiers.new('Authored formed edge','BEVEL');b.width=bevel;b.segments=3;b.affect='EDGES'
  b=o.modifiers.new('Weighted native normals','WEIGHTED_NORMAL');b.keep_sharp=True
 objects.append(o);return o
def box(group,name,lo,hi,mat,bevel=.006):
 bpy.ops.mesh.primitive_cube_add(size=1,location=tuple((a+b)/2 for a,b in zip(lo,hi)));o=bpy.context.object;o.dimensions=tuple(b-a for a,b in zip(lo,hi));bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return finish(o,group,name,mat,bevel)
def beam(group,name,a,b,width,depth,mat):
 a=Vector(a);b=Vector(b);o=box(group,name,(-width/2,-depth/2,-(b-a).length/2),(width/2,depth/2,(b-a).length/2),mat,min(width,depth)*.15);o.location=(a+b)/2;o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o
def profile(group,name,x0,x1,yz,mat,bevel=.004):
 verts=[(x,y,z) for x in [x0,x1] for y,z in yz];n=len(yz);faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)];me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(name,me);auth.objects.link(o);return finish(o,group,name,mat,bevel)
def patch(id,part,x0,x1,y0,y1,z,role):
 supports.append({'sourceTreadId':id,'sourcePartId':part,'supportPolygonM':[[x0,y0],[x1,y0],[x1,y1],[x0,y1]],'topZM':z,'role':role,'nextTreadIds':[]})
# Native closed folded treads and risers, not a visual ramp.
for flight,count,x0,x1,base,direction in [('a',8,.20,1.80,.1875,1),('b',7,2.20,3.80,1.875,-1)]:
 group='stair-flight-'+flight
 for k in range(1,count+1):
  y0=1.6875+(k-1)*.3125 if direction==1 else 4.1875-k*.3125;y1=y0+.3125;z=base+k*.1875
  box(group,f'tread-{k:02}',(x0,y0,z-.0625),(x1,y1,z),'steel',.004)
  front=y0 if direction==1 else y1-.03125
  box(group,f'riser-{k:02}',(x0,front,z-.1875),(x1,front+.03125,z-.03125),'enamel',.003)
  mark=y0+.016 if direction==1 else y1-.052
  box(group,f'nosing-{k:02}',(x0+.025,mark,z-.009),(x1-.025,mark+.036,z),'hazard',.002)
  # Flush traction inlays preserve the measured support top, with structural tread below.
  for stripe in range(3):
   yy=y0+.095+stripe*.0625
   box(group,f'grip-{k:02}-{stripe}',(x0+.09,yy,z-.006),(x1-.09,yy+.024,z),'grip',.001)
  patch(f'flight-{flight}-tread-{k:02}',group,x0+.05,x1-.05,y0+.008,y1-.008,z,'tread')
 # Final vertical riser meets actual intermediate landing or native upper floor.
 lastY=4.1875 if direction==1 else 2-.03125
 top=1.875 if flight=='a' else 3.375
 box(group,'final-riser',(x0,lastY,top-.1875),(x1,lastY+.03125,top),'enamel',.003)
# Intermediate supported pan landing; no duplicate lower/upper floor surface.
box('stair-midlanding','bearing-pan',(.08,4.1875,1.71875),(3.92,5.98,1.875),'steel',.005)
for j in range(4):
 box('stair-midlanding',f'flush-grip-{j}',(.30,4.45+j*.3125,1.869),(3.70,4.49+j*.3125,1.875),'grip',.001)
patch('midlanding','stair-midlanding',.25,3.75,4.1955,5.80,1.875,'intermediate-landing')
patch('lower-landing','lower-floor-2-2',.25,1.75,.25,1.6795,.1875,'lower-landing')
patch('upper-landing','upper-floor-4-2',2.25,3.75,.25,1.992,3.375,'upper-landing')
# Side stringers bear directly under each tread, with real brackets and feet.
for flight,xs,y0,y1,z0,z1 in [('a',[.15,1.85],1.6875,4.1875,.3125,1.8125),('b',[2.15,3.85],2,4.1875,3.125,1.8125)]:
 for j,x in enumerate(xs):
  beam('stair-frame',f'{flight}-stringer-{j}',(x,y0,z0-.08),(x,y1,z1-.08),.16,.23,'frame')
  for k in range(5):
   yy=y0+(y1-y0)*k/4;zz=z0+(z1-z0)*k/4
   box('stair-frame',f'{flight}-bearing-{j}-{k}',(x-.1,yy-.07,zz-.08),(x+.1,yy+.07,zz+.025),'steel',.004)
for i,(x,y) in enumerate([(.16,4.32),(3.84,4.32),(.16,5.78),(3.84,5.78)]):
 box('stair-frame',f'landing-post-{i}',(x-.07,y-.07,.1875),(x+.07,y+.07,1.78),'frame',.008)
 box('stair-frame',f'landing-foot-{i}',(x-.15,y-.15,.1875),(x+.15,y+.15,.25),'enamel',.007)
beam('stair-frame','landing-cross-beam-front',(.12,4.35,1.67),(3.88,4.35,1.67),.16,.16,'frame')
beam('stair-frame','landing-cross-beam-back',(.12,5.78,1.67),(3.88,5.78,1.67),.16,.16,'frame')
# Physical underflight/service closure, retaining editable wall shells.
for flight,xs,y0,y1,z0,z1 in [('a',[.205,1.755],1.6875,4.1875,.25,1.75),('b',[2.205,3.755],2,4.1875,3.12,1.81)]:
 for j,x in enumerate(xs):
  profile('stair-enclosure',f'{flight}-closed-side-{j}',x,x+.04,[(y0,.1875),(y1,.1875),(y1,z1),(y0,z0)],'enamel')
box('stair-enclosure','return-front-service',(2.2,2.03,.1875),(3.8,2.07,3.10),'frame',.006)
box('stair-enclosure','return-front-service-cover',(2.42,2.015,.40),(3.58,2.034,2.65),'enamel',.014)
box('stair-enclosure','service-identity',(2.52,2.002,2.25),(2.64,2.017,2.52),'service',.004)
for x in [.09,3.87]:box('stair-enclosure',f'landing-side-{x}',(x,4.25,.1875),(x+.04,5.96,1.71875),'enamel',.004)
box('stair-enclosure','landing-back',(.09,5.94,.1875),(3.91,5.98,1.72),'enamel',.004)
# Rails outside the full clear1.5m flight tread strip. Formed upright posts and two rails.
for flight,xs,ys,zs in [('a',[.125,1.875],[1.6875,2.9375,4.1875],[.375,1.125,1.875]),('b',[2.125,3.875],[2,3.09375,4.1875],[3.375,2.625,1.875])]:
 for side,x in enumerate(xs):
  for k,(y,z) in enumerate(zip(ys,zs)):
   box('stair-guard',f'{flight}-post-{side}-{k}',(x-.035,y-.035,z-.1),(x+.035,y+.035,z+1.06),'frame',.007)
   box('stair-guard',f'{flight}-shoe-{side}-{k}',(x-.075,y-.075,z-.10),(x+.075,y+.075,z+.02),'enamel',.006)
  for height in [.53,1.06]:beam('stair-guard',f'{flight}-rail-{side}-{height}',(x,ys[0],zs[0]+height),(x,ys[-1],zs[-1]+height),.08,.08,'enamel')
 # Opaque slim toe fascia follows stringer; lower edge remains under nosings.
 for side,x in enumerate(xs):
  beam('stair-guard',f'{flight}-toe-{side}',(x,ys[0],zs[0]+.06),(x,ys[-1],zs[-1]+.06),.05,.15,'frame')
# Clear U-turn behind center rail terminal; side and rear guards are real.
for side,x in [('left',.125),('right',3.875)]:
 for height in [.53,1.06]:beam('stair-guard',f'mid-{side}-{height}',(x,4.1875,1.875+height),(x,5.875,1.875+height),.08,.08,'enamel')
 box('stair-guard',f'mid-{side}-back-post',(x-.035,5.84,1.82),(x+.035,5.91,2.935),'frame',.007)
for height in [.53,1.06]:beam('stair-guard',f'mid-back-{height}',(.125,5.875,1.875+height),(3.875,5.875,1.875+height),.08,.08,'enamel')
box('stair-guard','mid-back-toe',(.08,5.84,1.875),(3.92,5.91,2.025),'frame',.006)
# Upper aperture guard surrounds actual hole, with only the return-flight landing open.
for side,x in [('left',.08),('right',3.92)]:
 for k,y in enumerate([2.05,4.0,5.92]):
  box('stair-upper-guard',f'{side}-post-{k}',(x-.035,y-.035,3.375),(x+.035,y+.035,4.435),'frame',.007)
 for height in [.53,1.06]:beam('stair-upper-guard',f'{side}-rail-{height}',(x,2.05,3.375+height),(x,5.92,3.375+height),.08,.08,'enamel')
for height in [.53,1.06]:
 beam('stair-upper-guard',f'back-{height}',(.08,5.92,3.375+height),(3.92,5.92,3.375+height),.08,.08,'enamel')
 beam('stair-upper-guard',f'front-left-{height}',(.08,1.96,3.375+height),(2.125,1.96,3.375+height),.08,.08,'hazard')
for x in [.08,2.125]:box('stair-upper-guard',f'front-post-{x}',(x-.035,1.925,3.375),(x+.035,1.995,4.435),'frame',.007)
for side,x in [('left',0),('right',3.96875)]:box('stair-aperture-edge',side,(x,2,3),(x+.03125,6,3.375),'frame',0)
for side,y in [('front',1.96875),('back',5.96875)]:box('stair-aperture-edge',side,(0,y,3),(4,y+.03125,3.375),'frame',0)
# The front fascia is in the retained slab, not across the last tread.
# Exact adjacency, with lower/mid/upper native supports separate identities.
chain=['lower-landing']+[f'flight-a-tread-{k:02}' for k in range(1,9)]+['midlanding']+[f'flight-b-tread-{k:02}' for k in range(1,8)]+['upper-landing']
for s in supports:
 i=chain.index(s['sourceTreadId']);s['nextTreadIds']=chain[max(0,i-1):i]+chain[i+1:i+2]
for name,p in [('LOWER',(1,.75,.1875)),('MID-A',(1,5.0625,1.875)),('MID-B',(3,5.0625,1.875)),('UPPER',(3,.75,3.375))]:
 o=bpy.data.objects.new('SOCK-STAIR-'+name,None);sockets.objects.link(o);o.location=p;o.empty_display_size=.08
# Capture evaluated native per-object triangles and bounds before batching.
def triangles(o):
 e=o.evaluated_get(bpy.context.evaluated_depsgraph_get());me=e.to_mesh();me.calc_loop_triangles();ts=[[[float(v) for v in e.matrix_world@me.vertices[i].co] for i in t.vertices] for t in me.loop_triangles];e.to_mesh_clear();return ts
def bounds(ts):return {'min':[min(p[i] for t in ts for p in t) for i in range(3)],'max':[max(p[i] for t in ts for p in t) for i in range(3)]}
source=[];triangle_groups={}
for o in objects:
 ts=triangles(o);source.append({'name':o.name,'group':o['native_group'],'boundsM':bounds(ts),'trianglesM':ts});triangle_groups.setdefault(o['native_group'],[]).extend(ts)
for group in sorted(triangle_groups):
 copies=[]
 for o in objects:
  if o['native_group']!=group:continue
  mesh=bpy.data.meshes.new_from_object(o.evaluated_get(bpy.context.evaluated_depsgraph_get()));c=bpy.data.objects.new(o.name+'--export',mesh);exports.objects.link(c);c.matrix_world=o.matrix_world;copies.append(c)
 bpy.ops.object.select_all(action='DESELECT')
 for o in copies:o.select_set(True)
 bpy.context.view_layer.objects.active=copies[0];bpy.ops.object.join();o=bpy.context.object;o.name='GEO-'+group+'--surface';bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
for o in objects:o.hide_render=True;o.hide_set(True)
pins={'floor':{'path':'assets/runtime/assembly/floor/r002/kit.glb','prefix':next(p['native']['nodePrefix'] for p in json.loads((ROOT/'packages/content/src/construction-floor-interfaces.json').read_text())['parts'] if p['id']=='square-2m')},'roof':{'path':'assets/art-library/designs/shipyard.structure.roof-kit/revisions/r001/kit.glb','prefix':'GEO-roof-square-2m--surface'}}
context_objects=[];placements=[];omitted={(0,2),(2,2),(0,4),(2,4)}
for kind,pin in pins.items():
 pin['sha256']=hashlib.sha256((ROOT/pin['path']).read_bytes()).hexdigest();before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(ROOT/pin['path']));added=set(bpy.data.objects)-before
 chosen=[o for o in added if o.type=='MESH' and (o.name==pin['prefix'] or o.name.startswith(pin['prefix']+'_') or o.name.startswith(pin['prefix']+'.'))];assert chosen
 for role,z in ([('lower-floor',0),('upper-floor',3.1875)] if kind=='floor' else [('lower-roof',3)]):
  for x in range(-2,6,2):
   for y in range(-2,8,2):
    if role!='lower-floor' and (x,y) in omitted:continue
    part=f'{role}-{x+2}-{y+2}';placements.append({'id':part,'sourceId':kind,'nodePrefix':pin['prefix'],'originM':[x+2,y+2,z],'quarterTurns':0})
    for original in chosen:
     o=original.copy();o.data=original.data;context.objects.link(o);o.parent=None;o.matrix_world=Matrix.Translation((x,y,z))@original.matrix_world;o.name='REVIEW-'+part+'--'+original.name;context_objects.append(o);ts=triangles(o);source.append({'name':o.name,'group':role,'sourcePartId':part,'boundsM':bounds(ts),'trianglesM':ts})
 for o in added:bpy.data.objects.remove(o,do_unlink=True)
for group in sorted(triangle_groups):placements.append({'id':group,'sourceId':'stair-kit','nodePrefix':'GEO-'+group+'--surface','originM':[2,2,0],'quarterTurns':0})
# Proxy archive is distinct from the visual source/export and can retain concavity.
(OUT/'native-collision-triangles.json.gz').write_bytes(gzip.compress(json.dumps(source,separators=(',',':')).encode(),mtime=0))
(OUT/'authored-triangles.json.gz').write_bytes(gzip.compress(json.dumps(triangle_groups,separators=(',',':')).encode(),mtime=0))
measure={'schema':'sidereal.native-stair-measurement.v1','status':'staged','coordinateFrame':'kit-local XYZ metres; fixture placements use board origin kit+[2,2,0]','nativeSolidBounds':[{k:v for k,v in s.items() if k!='trianglesM'} for s in source],'supportPatches':supports,'contextSources':pins,'parts':placements,'body':{'radiusM':.3,'heightM':1.8},'kitOriginOnBoardM':[2,2,0],'referencePathM':[[1,.75,.1875],[1,5.0625,1.875],[3,5.0625,1.875],[3,.75,3.375]],'sourceObjectCount':len(objects),'nativeGroups':sorted(triangle_groups)}
(OUT/'native-measurements.json').write_text(json.dumps(measure,indent=2)+'\n');(OUT/'author.py').write_bytes(Path(__file__).read_bytes())
bpy.ops.object.select_all(action='DESELECT')
for o in exports.objects:o.select_set(True)
for o in sockets.objects:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'kit.glb'),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_cameras=False,export_lights=False,export_extras=True)
# Neutral actual model and context reviews; no proxy is exported or rendered.
for name,loc,power,size in [('key',(0,-5,10),2200,7),('fill',(8,1,7),1400,5),('rim',(2,9,9),2000,5)]:
 d=bpy.data.lights.new('REVIEW-'+name,'AREA');d.energy=power;d.size=size;o=bpy.data.objects.new('REVIEW-'+name,d);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((2,3,2))-o.location).to_track_quat('-Z','Y').to_euler()
c=bpy.data.cameras.new('REVIEW-camera');cam=bpy.data.objects.new('REVIEW-camera',c);scene.collection.objects.link(cam);scene.camera=cam;c.type='ORTHO';captures=[]
def capture(name,pos,target,scale,mode):
 for o in context_objects:o.hide_render=mode=='cutout' or (mode=='lower' and not o.name.startswith('REVIEW-lower-floor'))
 cam.location=pos;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();c.ortho_scale=scale;scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True);captures.append({'file':name+'.png','cameraM':list(pos),'targetM':list(target),'orthographicScaleM':scale,'contextMode':mode})
# Save source with all context visible; camera shot retained in capture metadata.
cam.location=(10,-8,8);cam.rotation_euler=(Vector((2,3,2))-cam.location).to_track_quat('-Z','Y').to_euler();c.ortho_scale=9
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'blender-source.blend'))
capture('cutout',(10,-8,8),(2,3,2.15),9,'cutout')
capture('blender-lower',(11,-10,10),(2,3,1.8),12,'lower')
capture('blender-context',(12,-11,13),(2,3,2),14,'all')
capture('blender-top',(2,3,16),(2,3,0),11.5,'all')
(OUT/'capture.json').write_text(json.dumps({'blenderVersion':bpy.app.version_string,'renderer':'Cycles CPU','samples':32,'captures':captures,'sourceBlendSha256':hashlib.sha256((OUT/'blender-source.blend').read_bytes()).hexdigest(),'glbSha256':hashlib.sha256((OUT/'kit.glb').read_bytes()).hexdigest()},indent=2)+'\n')
print(json.dumps({'output':str(OUT),'objects':len(objects),'groups':len(triangle_groups),'parts':len(placements),'supportPatches':len(supports)}))
