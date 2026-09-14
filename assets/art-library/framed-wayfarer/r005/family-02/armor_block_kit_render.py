"""Four-thread exact-GLB neutral native evidence for r005; immutable renders."""
from pathlib import Path
import argparse,hashlib,json,subprocess,sys,tomllib
ROOT=Path(__file__).resolve().parents[2]
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def render(base):
 import bpy,math
 from mathutils import Vector
 base=Path(base);target=base/'renders';target.mkdir(exist_ok=False);manifest=json.loads((base/'models.json').read_text());models={m['modelId']:m for m in manifest['models']}
 shots=[('joined-bay','joined-bay','all',(3,-.4,1.5),(7,-10,6),8),('solid-section','solid-section','backing',(1,-.4,1.5),(5,-7,5),4.8),('exploded-section','solid-section','explode',(1,-1,1.5),(5,-8,5),6.4),('convex-45-half-height','convex-45-half-height','all',(0,-.15,.8),(4,-9,7),6.7),('concave-90','concave-90','all',(-1.1,-1.1,1.5),(-7,-8,9),7),('concave-90-top','concave-90','all',(-1.1,-1.1,1.5),(0,0,12),6)]
 if manifest['stage']=='family':
  shots += [('junction-registry','junction-registry','all',(7.5,4,0),(0,-1,25),23),('heights','heights','all',(6,-.4,1.5),(7,-14,9),16),('bulkheads','bulkheads','all',(4,-.15,1.5),(5,-12,8),12),('directions-32','directions-32','all',(14,6,0),(0,-1,40),35),('wayfarer-kit','wayfarer','all',(0,2,1),(17,28,25),34),('wayfarer-backing','wayfarer','backing',(0,2,1),(17,28,25),34),('wayfarer-bow','wayfarer','all',(0,10.2,1.3),(10,14,11),12),('alternate-station','alternate-station','all',(0,3,1.5),(20,-25,35),33),('alternate-tug','alternate-tug','all',(5,4,1.5),(15,-20,24),17)]
 captures=[]
 for name,assembly,mode,center,offset,scale in shots:
  bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.data.orphans_purge(do_recursive=True)
  instances=manifest['assemblies'][assembly]['placements'];cache={}
  for place in instances:
   ident=place['modelId'];record=models[ident]
   if ident not in cache:
    before=set(bpy.context.scene.objects);bpy.ops.import_scene.gltf(filepath=str(base/record['glb']));objects=list(set(bpy.context.scene.objects)-before)
    roots=[o for o in objects if o.parent not in objects];cache[ident]=(objects,roots)
   else:
    source,sourceroots=cache[ident];mapping={}
    for o in source:
     copy=o.copy();bpy.context.collection.objects.link(copy);mapping[o]=copy
    for o,copy in mapping.items():copy.parent=mapping.get(o.parent)
    objects=list(mapping.values());roots=[mapping[o] for o in sourceroots]
   for root in roots:root.location=place['position'];root.rotation_mode='XYZ';root.rotation_euler=(0,0,place['rotationZRad'])
   for obj in objects:
    group=obj.get('render_group','')
    if mode=='backing' and group=='FINISH':obj.hide_render=True
    if mode=='finish' and group=='BACKING':obj.hide_render=True
    if mode=='explode' and group=='FINISH':obj.location.y-=1.2
  # Neutral pressure datum block only in section views, clearly distinct from exported armor.
  if assembly=='solid-section':
   bpy.ops.mesh.primitive_cube_add(size=1,location=(1,.125,1.5));datum=bpy.context.object;datum.name='EVIDENCE-structural-datum-250mm';datum.dimensions=(2,.25,3)
   mat=bpy.data.materials.new('Evidence datum neutral');mat.diffuse_color=(.38,.43,.49,1);datum.data.materials.append(mat)
  center=Vector(center);bpy.ops.object.camera_add(location=center+Vector(offset));cam=bpy.context.object;cam.name='CAMERA-exact-glb-native'
  cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=scale
  scene=bpy.context.scene;scene.camera=cam;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=64;scene.cycles.use_denoising=False
  scene.render.resolution_x=1200;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.render.film_transparent=False
  scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
  scene.world.use_nodes=True;bg=scene.world.node_tree.nodes['Background'];bg.inputs['Color'].default_value=(.095,.12,.17,1);bg.inputs['Strength'].default_value=.5
  for i,(loc,energy,size) in enumerate([((4,-5,8),1700,7),((-5,3,7),1300,6),((6,6,4),900,5)]):
   bpy.ops.object.light_add(type='AREA',location=center+Vector(loc));lamp=bpy.context.object;lamp.name=f'LIGHT-neutral-{i}';lamp.data.energy=energy*(max(scale,6)/6)**2;lamp.data.shape='DISK';lamp.data.size=size*(max(scale,6)/6);lamp.rotation_euler=(center-lamp.location).to_track_quat('-Z','Y').to_euler()
  file=target/(name+'.png');scene.render.filepath=str(file);bpy.ops.render.render(write_still=True)
  captures.append({'name':name,'assembly':assembly,'path':str(file.relative_to(base)),'sha256':sha(file),'mode':mode,'explosionOutwardM':1.2 if mode=='explode' else 0,'manifestSha256':sha(base/'models.json'),'sourceSha256':manifest['sourceSha256'],'modelGlbHashes':{p['modelId']:models[p['modelId']]['sha256'] for p in instances},'cameraPosition':list(cam.location),'cameraTarget':list(center),'orthographicScaleM':scale,'viewport':[1200,900],'renderer':f'Blender {bpy.app.version_string} Cycles CPU 64 samples no denoising AgX medium-high','scope':'Fresh exact GLB imports. Gray 250mm datum in section views is evidence-only and not an exported kit part.'})
  (target/'captures.json').write_text(json.dumps(captures,indent=2)+'\n')
if __name__=='__main__':
 if '--' in sys.argv:render(sys.argv[sys.argv.index('--')+1])
 else:
  ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('directory');a=ap.parse_args();base=Path(a.directory).resolve();cfg=tomllib.loads((ROOT/'dev.toml').read_text());cmd=[cfg['art']['blender'],'--background','--factory-startup','--threads','4','--python-exit-code','1','--python',str(Path(__file__).resolve()),'--',str(base)]
  with (base/'render.log').open('w') as log:r=subprocess.run(cmd,cwd=ROOT,stdout=log,stderr=subprocess.STDOUT)
  print((base/'render.log').read_text()[-3000:]);raise SystemExit(r.returncode)
