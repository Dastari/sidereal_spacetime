"""Additional actual native evidence; prior attempt images remain unchanged."""
import bpy,json,sys,hashlib
from pathlib import Path
from mathutils import Vector,Matrix
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'assets/art-library/designs/shipyard.structure.roof-closure/revisions/r000/a002'
bpy.ops.wm.open_mainfile(filepath=str(OUT/'blender-source.blend'))
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=32;scene.cycles.use_denoising=False
scene.render.resolution_x=1200;scene.render.resolution_y=1000;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
scene.world=bpy.data.worlds.new('Closure studio');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.09,.11,.16,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.35
for label,loc,power in [('Key',(2,4,4),1300),('Fill',(-3,1,2),800),('Rim',(1,-3,4),1200)]:
 data=bpy.data.lights.new(label,'AREA');data.energy=power;data.size=3;obj=bpy.data.objects.new(label,data);scene.collection.objects.link(obj);obj.location=loc;obj.rotation_euler=(Vector((0,0,1))-obj.location).to_track_quat('-Z','Y').to_euler()
data=bpy.data.cameras.new('Closure inspection');cam=bpy.data.objects.new('Closure inspection',data);scene.collection.objects.link(cam);scene.camera=cam;data.type='ORTHO'
def capture(name,loc,target,scale):
 path=OUT/(name+'.png');assert not path.exists(),'Preserve earlier image';cam.location=loc;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();data.ortho_scale=scale;scene.render.filepath=str(path);bpy.ops.render.render(write_still=True);return {'path':path.name,'cameraM':loc,'targetM':target,'scaleM':scale,'renderer':'Cycles CPU32samples'}
parts={name:[o for o in bpy.data.objects if o.type=='MESH'and o.name.startswith('GEO-roof-closure-'+name+'--')]for name in ['rail-2m','junction-square','step-rail-2m','wall-seam-2p5m']}
for index,objects in enumerate(parts.values()):
 for o in objects:o.location.y+=index*.55
captures=[capture('native-kit-framed',(5,6,5),(.8,.8,1.1),6.1)]
for index,(name,objects)in enumerate(parts.items()):
 for o in objects:o.location.y-=index*.55;o.hide_render=True
mapping=json.loads((ROOT/'assets/art-library/designs/shipyard.structure.wayfarer-airlock-inlet/revisions/r000/a003/replacement-mapping.json').read_text());pins=[]
for p in mapping['preserveOriginalPlacements']:
 if p['sourcePlacedId']not in ['wall-1--5','wall-2--5']:continue
 v=p['visual'];path=ROOT/'assets/runtime/assembly/parts.glb';prefix='GEO-'+p['assetId']+'--';sha=hashlib.sha256(path.read_bytes()).hexdigest();before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(path));imported=set(bpy.data.objects)-before;keep=[o for o in imported if o.type=='MESH'and o.name.startswith(prefix)];assert keep
 transform=Matrix.Translation(Vector(p['originalPlacement']['position'])-Vector((3,-9,.1875)))@Matrix.Rotation(p['originalPlacement']['rotation'],4,'Z')
 for o in keep:world=o.matrix_world.copy();o.parent=None;o.matrix_world=transform@world;o.name='CONTEXT-'+p['sourcePlacedId']+'--'+o.name
 for o in imported-set(keep):bpy.data.objects.remove(o,do_unlink=True)
 pins.append({'sourcePlacedId':p['sourcePlacedId'],'path':str(path.relative_to(ROOT)),'sha256':sha,'nodePrefix':prefix,'transform':p['originalPlacement']})
captures.append(capture('rear-seam-original',(1.4,3.2,2.1),(0,0,1.25),3.2))
for o in parts['wall-seam-2p5m']:o.hide_render=False
captures.append(capture('rear-seam-with-native-closure',(1.4,3.2,2.1),(0,0,1.25),3.2))
(OUT/'wall-capture-context.json').write_text(json.dumps({'captures':captures,'sourcePanels':pins,'sourceTransformsUnchanged':True,'originalNativeKitImage':'native-kit.png remains preserved; it clipped the vertical rail and is superseded for framing only'},indent=2)+'\n')
