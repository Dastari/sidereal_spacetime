"""Native reusable roof joint rails. Editable meshes, separate contact cores; no installation."""
import bpy,json,sys,hashlib,math
from pathlib import Path
from mathutils import Vector,Matrix
ROOT=Path(__file__).resolve().parents[2];OUT=Path(sys.argv[sys.argv.index('--')+1]);OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24;scene.cycles.use_denoising=False
scene.render.resolution_x=1400;scene.render.resolution_y=1000;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
source=ROOT/'assets/art-library/designs/shipyard.hull.side-armor/revisions/r003/blender-source.blend'
with bpy.data.libraries.load(str(source),link=False)as(src,dst):dst.materials=list(src.materials)
mats={}
for role in ['dark','steel','black','pale']:
 matches=[m for m in dst.materials if m and(m.name==role or m.name.endswith('-'+role)or m.name.lower().startswith(role))]
 assert matches,role;mats[role]=matches[0]
parts={k:[]for k in ['rail-2m','junction-square','step-rail-2m','wall-seam-2p5m','shoulder-panel-0p5m']};cores=[]
def box(part,name,lo,hi,role='dark',bevel=0,core=False):
 bpy.ops.mesh.primitive_cube_add(size=1,location=tuple((a+b)/2 for a,b in zip(lo,hi)));o=bpy.context.object;o.name='GEO-roof-closure-'+part+'--'+name;o.dimensions=tuple(b-a for a,b in zip(lo,hi));bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mats[role]);parts[part].append(o)
 if bevel:
  mod=o.modifiers.new('Authored edge bevel','BEVEL');mod.width=bevel;mod.segments=3;mod=o.modifiers.new('Weighted planar normals','WEIGHTED_NORMAL');mod.keep_sharp=True
 if core:cores.append({'part':part,'sourceObject':o.name,'minM':lo,'maxM':hi,'kind':'actual-authored-continuous-contact-core'})
 return o
for part,bottom in [('rail-2m',-.015625),('step-rail-2m',-.078125)]:
 box(part,'continuous-contact',[0,-.05,bottom],[2,.05,.03125],'steel',0,True)
 box(part,'underside-enamel',[.002,-.042,bottom-.011],[1.998,.042,bottom+.001],'dark',.004)
 box(part,'recess-line',[.075,-.008,bottom-.0125],[1.925,.008,bottom-.0095],'black',.001)
 for x in [.125,1.875]:
  box(part,'service-fastener-'+str(x),[x-.016,-.017,bottom-.015],[x+.016,.017,bottom-.010],'pale',.003)
box('junction-square','continuous-contact',[-.08,-.08,-.015625],[.08,.08,.03125],'steel',0,True)
box('junction-square','underside-enamel',[-.071,-.071,-.030625],[.071,.071,-.014625],'dark',.006)
for x in [-.042,.042]:
 for y in [-.042,.042]:box('junction-square','fastener-'+str((x,y)),[x-.009,y-.009,-.034],[x+.009,y+.009,-.029],'pale',.002)
# A structural overlap core closes measured rounded/staggered rear-wall joins.
# Z0 is the existing deck-top datum; overlap tails do not alter the floor surface.
box('wall-seam-2p5m','continuous-contact',[-.0625,-.09375,-.03125],[.0625,.09375,2.53125],'steel',0,True)
box('wall-seam-2p5m','enamel-front',[-.055,.09175,.015625],[.055,.10575,2.484375],'dark',.005)
box('wall-seam-2p5m','service-recess',[-.009,.10475,.15],[.009,.10775,2.35],'black',.002)
for z in [.09375,1.25,2.40625]:
 box('wall-seam-2p5m','fastener-'+str(z),[-.021,.10575,z-.018],[.021,.11275,z+.018],'pale',.003)
box('shoulder-panel-0p5m','continuous-contact',[-.25,-.09375,-.03125],[.25,.09375,2.53125],'steel',0,True)
box('shoulder-panel-0p5m','enamel-front',[-.24,.09175,.015625],[.24,.10575,2.484375],'dark',.006)
for x in [-.17,.17]:
 for z in [.09375,2.40625]:
  box('shoulder-panel-0p5m','fastener-'+str((x,z)),[x-.018,.10575,z-.018],[x+.018,.11275,z+.018],'pale',.003)
box('shoulder-panel-0p5m','recessed-service-band',[-.17,.10475,.40],[.17,.10775,.46],'black',.002)
proxy=bpy.data.collections.new('Separate pressure contact proxies');scene.collection.children.link(proxy)
for p in cores:
 source_obj=bpy.data.objects[p['sourceObject']];o=source_obj.copy();o.data=source_obj.data.copy();o.name='PROXY-'+p['sourceObject'];proxy.objects.link(o);o.hide_render=True;o.hide_set(True);o.display_type='WIRE'
for name,objects in parts.items():
 collection=bpy.data.collections.new('Native '+name);scene.collection.children.link(collection)
 for o in objects:
  for c in list(o.users_collection):c.objects.unlink(o)
  collection.objects.link(o)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'blender-source.blend'))
manifest=[]
for name,objects in parts.items():
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 path=OUT/(name+'.glb');bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_apply=True,export_texcoords=True,export_normals=True,export_tangents=True)
 manifest.append({'id':name,'file':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'nodePrefix':'GEO-roof-closure-'+name+'--','editableComponents':len(objects),'nominalLengthM':.5 if name=='shoulder-panel-0p5m'else 2.5 if name=='wall-seam-2p5m'else 2 if name!='junction-square'else.16})
(OUT/'contact-proxies.json').write_text(json.dumps({'schema':'sidereal.roof-closure-contact-proxies.v1','frame':'Blender XYZ metres; nominal roof underside Z0','boxes':cores,'qualification':'Compare exact exported source before using as pressure/collision representation'},indent=2)+'\n')
(OUT/'delivery-manifest.json').write_text(json.dumps({'schema':'sidereal.native-roof-closure-candidate.v1','status':'awaiting-native-interface-qualification','ownerFinalSignoff':None,'sourceMaterialBlend':str(source.relative_to(ROOT)),'sourceMaterialSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'parts':manifest,'nominalGridM':2,'mainRoofUndersideM':2.6875,'cockpitRoofUndersideM':2.625,'originalPlacementChanges':0,'scope':'New structural joint overlays only; original visible panels/source transforms unchanged; no strength/gas approval'},indent=2)+'\n')
scene.world=bpy.data.worlds.new('Blue studio');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.08,.10,.16,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.4
for name,loc,power,color in [('Key',(1,-3,-4),1200,(.85,.92,1)),('Fill',(-4,1,-2),900,(.65,.75,1)),('Rim',(4,4,3),1600,(1,.85,.7))]:
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.size=4;d.color=color;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((1,0,0))-o.location).to_track_quat('-Z','Y').to_euler()
d=bpy.data.cameras.new('Actual native review');camera=bpy.data.objects.new('Actual native review',d);scene.collection.objects.link(camera);scene.camera=camera;d.type='ORTHO'
def capture(name,loc,target,scale):
 camera.location=loc;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler();d.ortho_scale=scale;scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True);return {'path':name+'.png','cameraM':loc,'targetM':target,'orthographicScaleM':scale,'renderer':'Cycles CPU24samples','kind':'actual native Blender source; not installed-game evidence'}
for i,(name,objects)in enumerate(parts.items()):
 for o in objects:o.location.y+=i*.55
captures=[capture('native-kit',(5,-6,4),(1,.8,.7),4.7)]
for i,(name,objects)in enumerate(parts.items()):
 for o in objects:o.location.y-=i*.55;o.hide_render=True
# Four actual panels at a measured12mm corner leak, unchanged native source.
mapping=json.loads((ROOT/'assets/art-library/designs/shipyard.structure.wayfarer-airlock-inlet/revisions/r000/a003/replacement-mapping.json').read_text());sourceparts={p['sourcePlacedId']:p for p in mapping['preserveOriginalPlacements']};pins=[]
origin=Vector((-3,-1,2.6875))
for id in ['roof--2--1','roof--1--1','roof--2-0','roof--1-0']:
 p=sourceparts[id];v=p['visual'];path=ROOT/'assets/runtime'/v['url'].removeprefix('/assets/');assert hashlib.sha256(path.read_bytes()).hexdigest()==v['sha256'];before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(path));imported=set(bpy.data.objects)-before;keep=[o for o in imported if o.type=='MESH'and o.name.startswith(v['nodePrefix'])];assert keep;transform=Matrix.Translation(Vector(p['originalPlacement']['position'])-origin)@Matrix.Rotation(p['originalPlacement']['rotation'],4,'Z')
 for o in keep:mat=o.matrix_world.copy();o.parent=None;o.matrix_world=transform@mat;o.name='CONTEXT-'+id+'--'+o.name
 for o in imported-set(keep):bpy.data.objects.remove(o,do_unlink=True)
 pins.append({'sourcePlacedId':id,**v,'transform':p['originalPlacement']})
captures.append(capture('joint-original',(.55,-.7,-.7),(0,0,0),.38))
for o in parts['junction-square']:o.hide_render=False
captures.append(capture('joint-with-native-plug',(.55,-.7,-.7),(0,0,0),.38))
(OUT/'capture-context.json').write_text(json.dumps({'captures':captures,'sourcePanels':pins,'sourceTransformsUnchanged':True},indent=2)+'\n')
print(json.dumps({'parts':len(parts),'components':sum(map(len,parts.values())),'cores':len(cores),'output':str(OUT)}))
