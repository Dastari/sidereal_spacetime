"""Actual Blender native roof and full current ship review; no live publication."""
from pathlib import Path
import sys,json,math,bpy
from mathutils import Vector,Matrix
R=Path(__file__).resolve().parents[2];O=Path(sys.argv[sys.argv.index('--')+1]);bpy.ops.wm.open_mainfile(filepath=str(O/'roof-kit.blend'));s=bpy.context.scene
cs=json.loads((O/'components.json').read_text());masters=bpy.data.collections['EDITABLE-ROOF-MASTERS'];s.cycles.samples=64;s.render.resolution_percentage=100
for o in masters.objects:o.hide_render=True
def aim(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
for name,loc,power,size in [('key',(-15,-18,23),4000,8),('fill',(14,10,18),1400,11)]:
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.name='LIGHT-roof-'+name;o.data.energy=power;o.data.shape='DISK';o.data.size=size;aim(o,(0,0,0))
bpy.ops.object.camera_add(location=(-18,25,26));cam=bpy.context.object;cam.name='CAM-roof-review';cam.data.type='ORTHO';s.camera=cam

def render(path,loc,target,scale,size=(1500,1300)):
 cam.location=loc;aim(cam,target);cam.data.ortho_scale=scale;s.render.resolution_x,s.render.resolution_y=size;s.render.filepath=str(path);bpy.ops.render.render(write_still=True)
# Component sheet and shared material evidence.
board=[]
for i,c in enumerate(cs):
 for name in c['objects']:
  src=bpy.data.objects[name];o=src.copy();o.data=src.data;s.collection.objects.link(o);o.location+=Vector(((i%4)*4.2,(i//4)*4.4,0));o.hide_render=False;board.append(o)
if not (O/'component-board.png').exists():render(O/'component-board.png',(22,-15,29),(6,6,0),24)
for o in board:o.hide_render=True
for c in cs:
 for name in c['objects']:bpy.data.objects[name].hide_render=False
 lo,hi=c['bounds']['min'],c['bounds']['max'];target=Vector([(a+b)/2 for a,b in zip(lo,hi)]);span=max(hi[i]-lo[i] for i in range(3))
 if not (O/c['slug']/'cutout.png').exists():render(O/c['slug']/'cutout.png',target+Vector((4,-5,6)),target,max(.8,span*1.6),(600,600))
 for name in c['objects']:bpy.data.objects[name].hide_render=True
catalog=json.loads((O/'ship-catalog.json').read_text());ship=json.loads((O/'ship-wayfarer.json').read_text());aids={a['id']:a for a in catalog['assets']};cache={};context=[]
def source_asset(a):
 visual=a.get('visual');url=visual['url'] if visual else '/assets/assembly/parts.glb'
 # Roofcontext uses actualimportedGLB, never the source masters.
 if url not in cache:
  p=O/'kit.glb' if url.endswith('roof-review/kit.glb') else R/'assets/runtime'/url.removeprefix('/assets/');before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(p));new=set(bpy.data.objects)-before;cache[url]=list(new)
  for o in new:o.hide_render=True
 objs=cache[url];prefix=visual.get('nodePrefix') if visual else None
 return [o for o in objs if o.type=='MESH' and (not visual and any(o.name.startswith(n) for n in a['nodes']) or visual and (not prefix or o.name.startswith(prefix)))]
for p in ship['parts']:
 a=aids[p['assetId']];sources=source_asset(a);mat=Matrix.Translation(Vector(p['position']))@Matrix.Rotation(p['rotation'],4,'Z')@Matrix.Diagonal((-1 if p['flipped'] else 1,1,1,1))
 for src in sources:
  o=src.copy();o.data=src.data;s.collection.objects.link(o);o.parent=None;o.matrix_world=mat@src.matrix_world;o.hide_render=False;o.name='PLACED-'+p['id']+'--'+src.name;o['placed_id']=p['id'];o['category']=a['category'];context.append(o)
fixture_objects=[]
for placement in ship['parts']:
 asset=aids[placement['assetId']]
 if asset['category']!='roof':continue
 transform=Matrix.Translation(Vector(placement['position']))@Matrix.Rotation(placement['rotation'],4,'Z')@Matrix.Diagonal((-1 if placement['flipped'] else 1,1,1,1))
 for i,fixture in enumerate(asset.get('lights',[])):
  data=bpy.data.lights.new('FIXTURE-'+placement['id']+'-'+str(i),'SPOT');data.energy=18*fixture['intensity'];data.color=fixture['color'];data.spot_size=fixture['angle'];data.spot_blend=.6
  ob=bpy.data.objects.new(data.name,data);s.collection.objects.link(ob);ob.location=transform@Vector(fixture['position']);direction=transform.to_3x3()@Vector(fixture['direction']);ob.rotation_euler=direction.to_track_quat('-Z','Y').to_euler();fixture_objects.append(ob)
sys.path.insert(0,str(R/'scripts/art_library'));from roof_example_decals import add_examples
examples=add_examples(O,s)
render(O/'blender-context-closed.png',(20,-27,34),(0,1,1),29,(1700,1400))
render(O/'blender-context-top.png',(0,1,40),(0,1,0),29,(1400,1700))
render(O/'blender-context-detail.png',(-10,10,20),(0,1,3),15,(1500,1400))
for o in fixture_objects:o.hide_render=True
for o in examples:o.hide_render=True
for o in context:
 if o['category']=='roof':o.hide_render=True
render(O/'blender-context-open.png',(20,-27,34),(0,1,1),29,(1700,1400))
for o in context:o.hide_render=False
for o in fixture_objects:o.hide_render=False
for o in examples:o.hide_render=False
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(O/'review-assembly.blend'))
print('ROOF_CONTEXT_COMPLETE',len(context),flush=True)
