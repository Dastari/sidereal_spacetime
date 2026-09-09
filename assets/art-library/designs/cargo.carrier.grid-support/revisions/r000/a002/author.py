"""Native Blender carrier kit. Visual surfaces, bearing patches and colliders stay separate."""
import bpy
from mathutils import Vector
import math
import json
import hashlib
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[2]
OUT=Path(sys.argv[sys.argv.index('--')+1])
H=22/32
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=64
scene.cycles.use_denoising=False;scene.render.threads_mode='FIXED';scene.render.threads=2
scene.render.resolution_x=1100;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
scene.view_settings.view_transform='AgX'
scene.world.color=(.035,.045,.065)

def material(name,color,metal=0,rough=.35,emit=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 if emit:p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emit
 return m
M={'frame':material('MAT-indigo-structural-frame',(.035,.055,.085),.35,.32),
 'shell':material('MAT-pale-enamel',(.61,.7,.76),.15,.27),
 'pad':material('MAT-machined-bearing-pad',(.18,.24,.28),.7,.29),
 'red':material('MAT-wine-red-service',(.29,.034,.055),.1,.32),
 'amber':material('MAT-restraint-amber',(.92,.32,.045),.15,.3),
 'cyan':material('MAT-status-cyan',(.01,.55,.8),0,.22,.8),
 'black':material('MAT-polymer-grip',(.014,.023,.035),0,.52)}

def collection(name):
 c=bpy.data.collections.new(name);scene.collection.children.link(c);return c
COL=collection('GEO-CARRIER-KIT');SOCK=collection('SOCKETS');PROXY=collection('COLLISION');PROXY.hide_render=True
LOD=collection('LOD');LOD.hide_render=True
roots={};visual={};colliders={};interfaces={}

def box(name,lo,hi,mat,col=COL,bevel=.006,parent=None):
 bpy.ops.mesh.primitive_cube_add(size=1,location=tuple((a+b)/2 for a,b in zip(lo,hi)))
 o=bpy.context.object;o.name='GEO-'+name;o.data.name='MESH-'+name;o.dimensions=tuple(b-a for a,b in zip(lo,hi));bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 for c in list(o.users_collection):c.objects.unlink(o)
 col.objects.link(o)
 if mat:o.data.materials.append(mat)
 if bevel:
  m=o.modifiers.new('Authored edge bevel','BEVEL');m.width=bevel;m.segments=2
  n=o.modifiers.new('Weighted planar normals','WEIGHTED_NORMAL');n.keep_sharp=True;n.weight=50
 if parent:o.parent=parent
 return o

def empty(name,location,parent=None):
 o=bpy.data.objects.new(name,None);SOCK.objects.link(o);o.location=location;o.empty_display_size=.06
 if parent:o.parent=parent
 return o

def create_carrier(w):
 tag=f'carrier-{w}m';root=empty('ASSET-'+tag,(0,0,0));root['authorOrigin']='lower-left bottom bearing plane';root['nominalSizeM']=[w,w,H]
 objects=[];proxies=[];patches=[];roots[tag]=root
 def part(name,lo,hi,mat,bevel=.006,collision=True):
  o=box(tag+'-'+name,lo,hi,mat,bevel=bevel,parent=root);objects.append(o)
  if collision:proxies.append({'id':name,'min':lo,'max':hi})
  return o
 part('lower-deck',[0,0,.03125],[w,w,.09375],M['frame'],.008)
 part('upper-deck',[0,0,H-.0625],[w,w,H-.03125],M['frame'],.005)
 for x in range(w):
  for y in range(w):
   rect=[x+.125,y+.125,x+.875,y+.875]
   part(f'BEARING-bottom-{x}-{y}',[rect[0],rect[1],0],[rect[2],rect[3],.03125],M['pad'],0)
   part(f'BEARING-top-{x}-{y}',[rect[0],rect[1],H-.03125],[rect[2],rect[3],H],M['pad'],0)
   patches.append({'id':f'cell-{x}-{y}','rectM':rect,'bottomPlaneM':0,'topPlaneM':H,
     'bottomMesh':f'GEO-{tag}-BEARING-bottom-{x}-{y}','topMesh':f'GEO-{tag}-BEARING-top-{x}-{y}'})
   empty(f'SOCK-{tag}-payload-{x}-{y}',(x+.5,y+.5,.09375),root)
   # Recessed fastening strips sit beside the contact patch, never above its plane.
   for yy in [y+.045,y+.94]:
    part(f'top-restraint-{x}-{y}-{yy}',[x+.125,yy,H-.029],[x+.875,yy+.015,H-.014],M['amber'],.003,False)
 for x in [0,w-.09375]:
  for y in [0,w-.09375]:
   part(f'corner-post-{x}-{y}',[x,y,.078125],[x+.09375,y+.09375,H-.046875],M['frame'],.008)
   part(f'corner-shell-{x}-{y}',[x+.015,y+.0125,.16],[x+.08,y+.08,H-.125],M['shell'],.009)
 for y in [0,w-.0625]:
  part(f'front-rail-{y}',[.075,y,.1],[w-.075,y+.0625,.165],M['shell'],.008)
  for x in [.15,w-.35]:
   part(f'latch-{x}-{y}',[x,y-.0,.185],[x+.2,y+.05,.31],M['red'],.012)
   part(f'latch-grip-{x}-{y}',[x+.055,y+.0,.22],[x+.145,y+.06,.245],M['pad'],.003)
  part(f'status-{y}',[w*.5-.055,y+.003,.123],[w*.5+.055,y+.065,.141],M['cyan'],.003,False)
 for x in [0,w-.0625]:
  part(f'side-lower-rail-{x}',[x,.075,.105],[x+.0625,w-.075,.155],M['shell'],.007)
  part(f'side-upper-rail-{x}',[x,.075,H-.16],[x+.0625,w-.075,H-.1],M['shell'],.007)
 # For2m, edge middle posts transfer each1m pad load into the continuous decks.
 if w==2:
  for x,y in [(0,.953125),(1.90625,.953125),(.953125,0),(.953125,1.90625)]:
   part(f'intermediate-post-{x}-{y}',[x,y,.078125],[x+.09375,y+.09375,H-.046875],M['frame'],.006)
 for i,c in enumerate(proxies):box(tag+'-PROXY-'+str(i),c['min'],c['max'],None,col=PROXY,bevel=0,parent=root)
 visual[tag]=objects;colliders[tag]=proxies
 interfaces[tag]={'schema':'sidereal.cargo-carrier-interface.v1','assetId':tag,'origin':'author lower-left; XY deck;Z up',
  'nominalSizeM':[w,w,H],'nominalSizeUnits':[w*32,w*32,22],'bearingFamily':'carrier-pad-075-grid1m-r000',
  'contactGeometryQualified':False,'loadApproval':False,'bearingPatches':patches,'quarterTurns':[0,1,2,3],
  'payloadFloorM':.09375,'payloadCeilingM':H-.0625,'payloadCellInteriorM':[.09375,.09375,.90625,.90625],
  'openingRule':'Closed transport envelope only; remove top assembly/unload before opening payload lids.',
  'collisionBoxes':proxies}
 return root
for w in [1,2]:create_carrier(w)

# Export one independently addressable native asset per size; no proxy meshes in visual GLB.
for tag,objects in visual.items():
 bpy.ops.object.select_all(action='DESELECT')
 roots[tag].select_set(True)
 for o in objects:o.select_set(True)
 for o in SOCK.objects:
  if o.parent==roots[tag]:o.select_set(True)
 bpy.ops.export_scene.gltf(filepath=str(OUT/(tag+'.glb')),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,
   export_extras=True,export_materials='EXPORT')
 (OUT/(tag+'-interface.json')).write_text(json.dumps(interfaces[tag],indent=2)+'\n')
# Editable sources preserve native modifiers/materials and separate hidden proxy collection.
for o in PROXY.objects:o.hide_render=True;o.hide_set(True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'blender-source.blend'))

# Review rig: CPU Cycles only, neutral backdrop, orthographic calibration.
def aim(o,target):o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
def camera(location,target,scale):
 bpy.ops.object.camera_add(location=location);o=bpy.context.object;o.name='REVIEW-camera';aim(o,target);o.data.type='ORTHO';o.data.ortho_scale=scale;scene.camera=o;return o
for name,loc,power,size,color in [('key',(1,-4,6),650,5,(1,.89,.76)),('fill',(-4,0,3),430,4,(.66,.8,1)),('rim',(3,5,5),800,3,(.55,.8,1))]:
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.name='REVIEW-'+name;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.data.color=color;aim(o,(1,1,.7))
cam=camera((4,-5,4),(1,.7,.6),4.1)
# Individual carrier PNGs preserve true transparency.
scene.render.film_transparent=True
for tag,root in roots.items():
 for other,objects in visual.items():
  for o in objects:o.hide_render=other!=tag
 w=1 if tag=='carrier-1m' else 2;cam.location=(w*2,-w*2,w*1.8);aim(cam,(w/2,w/2,H/2));cam.data.ortho_scale=w*1.7
 scene.render.filepath=str(OUT/(tag+'-cutout.png'));bpy.ops.render.render(write_still=True)
# Independent placements from native carrier geometry, not merged identities.
for objects in visual.values():
 for o in objects:o.hide_render=True
fixture=collection('REVIEW-MIXED-STACK');placements=[('base','carrier-2m',(0,0,.1875)),
 *[(f'middle-{x}-{y}','carrier-1m',(x,y,.1875+H)) for x in [0,1] for y in [0,1]],
 ('top','carrier-2m',(0,0,.1875+2*H))]
for instance,tag,offset in placements:
 for source in visual[tag]:
  o=source.copy();o.data=source.data.copy();fixture.objects.link(o);o.parent=None;o.matrix_world=source.matrix_world.copy();o.location+=Vector(offset);o.hide_render=False;o.name='GEO-FIXTURE-'+instance+'-'+source.name
 # sockets/placement records intentionally preserve distinct instance identity.
# Native approved small crates fit at centered cell positions with no scale change.
manifest=json.loads((ROOT/'docs/handoffs/cargo_grid_model_audit.json').read_text())
payloads=[]
for i,(instance,tag,offset) in enumerate(placements):
 appearance=['standard-small','standard-small-red'][i%2]
 record=next(r for r in manifest['rows'] if r['appearance']==appearance)
 before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(ROOT/record['glbPath']))
 imported=set(bpy.data.objects)-before
 cx=offset[0]+.5;cy=offset[1]+.5
 bounds=record['visualBoundsAuthorM'];shift=Vector((cx-(bounds['min'][0]+bounds['max'][0])/2,cy-(bounds['min'][1]+bounds['max'][1])/2,offset[2]+.09375-bounds['min'][2]))
 for o in imported:
  if o.parent not in imported:o.location+=shift
  o.name='PAYLOAD-'+instance+'-'+o.name
 payloads.append({'instanceId':instance,'assetId':record['assetId'],'glbSha256':record['glbSha256'],'appearance':appearance,
    'translationAuthorM':list(shift),'scale':[1,1,1],'visualDimensionsM':record['visualDimensionsM']})
# Review floor and transparent roof gauge; geometry itself has real deck datum.
floor=box('REVIEW-floor',[-.5,-.5,.05],[2.5,2.5,.1875],M['frame'],bevel=.01)
for x in [-.375,2.375]:
 for y in [-.375,2.375]:box(f'REVIEW-height-gauge-{x}-{y}',[x-.015,y-.015,.1875],[x+.015,y+.015,2.5625],M['amber'],bevel=.003)
for y in [-.375,2.375]:box('REVIEW-roof-datum-'+str(y),[-.375,y-.01,2.55],[2.375,y+.01,2.5625],M['amber'],bevel=0)
scene.render.film_transparent=False;scene.render.resolution_x=1400;scene.render.resolution_y=1100
cam.location=(4.8,-6.2,4.2);aim(cam,(1,1,1.2));cam.data.ortho_scale=4.35
scene.render.filepath=str(OUT/'mixed-stack.png');bpy.ops.render.render(write_still=True)
cam.location=(1,1,7);aim(cam,(1,1,0));cam.data.ortho_scale=3.5;scene.render.filepath=str(OUT/'mixed-stack-top.png');bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'stack-fixture.blend'))
(OUT/'fixture.json').write_text(json.dumps({'schema':'sidereal.carrier-fixture.v1','deckTopM':.1875,'roofUndersideM':2.5625,
 'carrierHeightM':H,'stackTopM':.1875+3*H,'handlingClearanceM':.15,'placements':placements,'payloads':payloads,
 'reviewOnly':True,'loadApproval':False,'ownerArtApproval':False},indent=2)+'\n')
print(json.dumps({'carrierAssets':list(visual),'output':str(OUT),'device':'CPU','threads':2,'samples':64}))
