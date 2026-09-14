from pathlib import Path
import bpy,sys,json,math
from mathutils import Vector
R=Path(__file__).resolve().parents[2];O=Path(sys.argv[sys.argv.index('--')+1]);bpy.ops.wm.open_mainfile(filepath=str(O/'side-hull-kit.blend'));s=bpy.context.scene;s.cycles.samples=24;s.cycles.use_denoising=False;s.render.resolution_percentage=100
cs=json.loads((O/'components.json').read_text());masters=bpy.data.collections['EDITABLE-SIDE-HULL-MASTERS']
for ob in masters.objects:ob.hide_render=True
for ob in bpy.data.collections['NATIVE-EXPORT-DERIVED'].objects:ob.hide_render=True

def aim(ob,p):ob.rotation_euler=(Vector(p)-ob.location).to_track_quat('-Z','Y').to_euler()
for name,loc,power,size in [('key',(14,8,14),2800,9),('fill',(-10,-8,8),1300,8)]:
 bpy.ops.object.light_add(type='AREA',location=loc);ob=bpy.context.object;ob.name='LIGHT-'+name;ob.data.energy=power;ob.data.size=size;aim(ob,(5,0,1))
bpy.ops.object.camera_add();cam=bpy.context.object;cam.name='CAM-side-hull-review';cam.data.type='ORTHO';s.camera=cam

def render(path,loc,target,scale,size):
 cam.location=loc;aim(cam,target);cam.data.ortho_scale=scale;s.render.resolution_x,s.render.resolution_y=size;s.render.filepath=str(path);bpy.ops.render.render(write_still=True)
for k in cs:
 for name in k['objects']:bpy.data.objects[name].hide_render=False
 side=k['side'];lo,hi=k['bounds']['min'],k['bounds']['max'];t=Vector([(a+b)/2 for a,b in zip(lo,hi)])
 render(O/k['slug']/'cutout.png',t+Vector((side*5,3.5,3)),t,4.5,(480,480))
 for name in k['objects']:bpy.data.objects[name].hide_render=True
# Actual exported surfaces reimported into their unchanged ship placements.
pre=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(O/'kit.glb'));imported=list(set(bpy.data.objects)-pre)
for ob in imported:ob.hide_render=True
parts=json.loads((R/'.runtime/art-library/side-hull/inventory.json').read_text())['parts'];context=[]
for p in parts:
 if p['position'][0]<0:continue
 for src in imported:
  if src.type=='MESH' and src.name.startswith('GEO-'+p['assetId']+'--surface'):
   ob=src.copy();ob.data=src.data;s.collection.objects.link(ob);ob.parent=None;ob.location+=Vector(p['position']);ob.hide_render=False;context.append(ob)
render(O/'blender-close.png',(28,12,15),(5.5,0,1.2),22,(1800,1000))
render(O/'blender-top.png',(19,0,35),(5.5,0,1),21,(1800,900))
render(O/'blender-detail.png',(15,2,7),(5.5,1,1.2),8,(1400,1000))
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(O/'review-strip.blend'))
