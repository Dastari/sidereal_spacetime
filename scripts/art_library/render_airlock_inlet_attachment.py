"""Actual native attachment evidence; sources copied in memory, never modified."""
import bpy,json,sys,hashlib,math
from pathlib import Path
from mathutils import Matrix,Vector
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(sys.argv[sys.argv.index('--')+1])
bpy.ops.wm.open_mainfile(filepath=str(OUT/'blender-source.blend'))
scene=bpy.context.scene;scene.cycles.device='CPU';scene.cycles.use_denoising=False;scene.cycles.samples=40
scene.render.resolution_x=1800;scene.render.resolution_y=1200;scene.render.resolution_percentage=100
cache={};instances=[];pins=[]
def source(path,prefix):
 key=str(path)
 if key not in cache:
  before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(path));objects=set(bpy.data.objects)-before
  shapes=[]
  for o in objects:
   if o.type=='MESH':
    mat=o.matrix_world.copy();o.parent=None;o.matrix_world=mat;o.hide_render=True;o.hide_set(True);shapes.append(o)
  cache[key]=shapes
 selected=[o for o in cache[key] if o.name.startswith(prefix)]
 assert selected,(path,prefix)
 return selected

def place(path,prefix,origin,turns,label,role):
 transform=Matrix.Translation(Vector(origin))@Matrix.Rotation(turns*math.pi/2,4,'Z')
 for src in source(path,prefix):
  o=src.copy();o.name='CONTEXT-'+label+'--'+src.name;scene.collection.objects.link(o);o.matrix_world=transform@src.matrix_world;o.hide_set(False);o.hide_render=False;instances.append((o,role))

raw=(ROOT/'assets/art-library/designs/shipyard.structure.external-airlock/revisions/r000/audit-a007.json').read_bytes()
assert hashlib.sha256(raw).hexdigest()=='eb7eab8523d68906a302a84cf06a5b2a507229d15e89fb96f66d1ade8b6e0aa6'
audit=json.loads(raw)
for i,p in enumerate(audit['placements']):
 if i==26:continue
 pin=audit['sourcePins'][p['source']];path=ROOT/pin['path'];assert hashlib.sha256(path.read_bytes()).hexdigest()==pin['sha256']
 place(path,p['nodePrefix'],p['originM'],p['quarterTurns'],'native-'+str(i),p['source'])
 pins.append({'sourcePartIndex':i,**p,'sha256':pin['sha256']})
placements=json.loads((ROOT/'.runtime/wayfarer-semantic-candidate-r001/placements.json').read_text())
for p in placements:
 if p['sourcePlacedId'] not in ['floor-2--2','roof-2--2','roof-3--2']:continue
 v=p['visual'];path=ROOT/'assets/runtime'/v['url'].removeprefix('/assets/');assert hashlib.sha256(path.read_bytes()).hexdigest()==v['sha256']
 origin=Vector(p['originalPlacement']['position'])-Vector((5,-5,0))
 place(path,v['nodePrefix'],origin,0,p['sourcePlacedId'],'old-roof' if p['sourcePlacedId'].startswith('roof-') else 'old-floor')

def point(o,target):o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
for name,loc,power,size,color in [('Key',(5,-5,11),2000,7,(.8,.9,1)),('Fill',(-5,3,6),1400,6,(.65,.72,1)),('Rim',(8,7,8),1700,5,(1,.85,.7))]:
 light=bpy.data.lights.new(name,'AREA');light.energy=power;light.shape='DISK';light.size=size;light.color=color;o=bpy.data.objects.new(name,light);scene.collection.objects.link(o);o.location=loc;point(o,(2.5,1,1.5))
data=bpy.data.cameras.new('Attachment review camera');camera=bpy.data.objects.new('Attachment review camera',data);scene.collection.objects.link(camera);scene.camera=camera;data.type='ORTHO';data.ortho_scale=12
camera.location=(12,-10,11);point(camera,(2.6,1,1.4))
evidence=[]
for name,cutaway in [('attachment-closed',False),('attachment-cutaway',True)]:
 for o,role in instances:o.hide_render=cutaway and role in ['roof','old-roof']
 for o in bpy.data.objects:
  if o.get('part_id')=='stepped-roof' and o.name.startswith('GEO-'):o.hide_render=cutaway
 scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
 evidence.append({'path':name+'.png','engine':'Cycles CPU','samples':40,'cameraM':list(camera.location),'targetM':[2.6,1,1.4],'orthographicScaleM':12,'role':'actual native69part attachment plus5newpart groups and unchanged old floor/roofs','roofCutawayPresentationOnly':cutaway,'doorState':'both native doors closed/sealed; no fake opened leaf'})
(OUT/'attachment-capture.json').write_text(json.dumps({'sourcePins':pins,'captures':evidence,'runtimeInstalled':False},indent=2)+'\n')
