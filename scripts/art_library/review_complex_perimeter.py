"""Immutable review companion: exact r004 GLB bytes, imported assembly and honest capture provenance."""
from pathlib import Path
import sys,json,hashlib,shutil,math
ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'assets/art-library/designs/shipyard.structure.complex-perimeter/revisions'
SOURCE=BASE/'r004';OUT=BASE/'r005'
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
if 'bpy' not in sys.modules:
 try:import bpy
 except ImportError:
  import tomllib
  sys.path.insert(0,str(ROOT));from scripts.dev import run
  cfg=tomllib.loads((ROOT/'dev.toml').read_text())
  run([cfg['art']['blender'],'--background','--threads','2','--python-exit-code','1','--python',str(Path(__file__).resolve())]);raise SystemExit(0)
import bpy
from mathutils import Vector,Matrix
assert not OUT.exists()
assert (SOURCE/'delivery-manifest.json').exists()
shutil.copytree(SOURCE,OUT)
shutil.copy2(__file__,OUT/'review-recipe.py')
shutil.copy2(ROOT/'.runtime/shipyard-completion/complex-review-fixture.json',OUT/'fixture-request.json')
bpy.ops.wm.open_mainfile(filepath=str(SOURCE/'blender-source.blend'))
scene=bpy.context.scene;camera=scene.camera
bpy.context.preferences.filepaths.save_version=0
for obj in scene.objects:
 if obj.type=='MESH':obj.hide_render=True
lights=[bpy.data.objects['LIGHT-'+n]for n in ['Key','Fill','Rim']]
capture=json.loads((OUT/'capture.json').read_text())
for c in capture['captures']:c['kind']='actual Blender render of editable native source meshes; not an imported-GLB image'
capture['sourceRevision']='r004';capture['sourceManifestSha256']=sha(SOURCE/'delivery-manifest.json')
fixture=json.loads((OUT/'fixture-request.json').read_text())
board=[];full=[]
for item in fixture['heights']:
 q=item['quarterHeight'];assert item['ok']
 for i,p in enumerate(item['placements']):
  path=SOURCE/'profiles'/(p['profileId']+f'-q{q}.glb')
  before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(path))
  nodes=list(set(bpy.data.objects)-before)
  x,y=p['originUnits'];a=p.get('yawRadians',p['quarterTurns']*math.pi/2)
  matrix=Matrix.Translation(Vector((x/32+(q-1)*6,y/32,.1875)))@Matrix.Rotation(a,4,'Z')
  for obj in nodes:
   obj.matrix_world=matrix@obj.matrix_world;obj.name=f'GEO-review-user-perimeter-q{q}-{i}';obj.hide_render=True
   if obj.type=='MESH':board.append(obj)
   if obj.type=='MESH' and q==4:full.append(obj)

def render(name,nodes,top=False,transparent=False):
 for obj in scene.objects:
  if obj.type=='MESH':obj.hide_render=True
 for obj in nodes:obj.hide_render=False;obj.hide_set(False)
 bpy.context.view_layer.update()
 points=[o.matrix_world@Vector(c)for o in nodes for c in o.bound_box]
 lo=Vector([min(p[i]for p in points)for i in range(3)]);hi=Vector([max(p[i]for p in points)for i in range(3)]);center=(lo+hi)/2
 camera.location=center+Vector((0,0,20)if top else(5,-8,11));camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler()
 scene.render.resolution_x=1600;scene.render.resolution_y=1200;scene.render.resolution_percentage=100
 rotation=camera.rotation_euler.to_matrix().transposed();framed=[rotation@(p-center)for p in points]
 width=max(p.x for p in framed)-min(p.x for p in framed);height=max(p.y for p in framed)-min(p.y for p in framed)
 camera.data.ortho_scale=max(width,height*4/3)*1.18
 for light,offset in zip(lights,[(2,-4,8),(-5,-1,6),(3,6,7)]):light.location=center+Vector(offset);light.rotation_euler=(center-light.location).to_track_quat('-Z','Y').to_euler()
 scene.render.film_transparent=transparent;scene.render.image_settings.color_mode='RGBA'if transparent else'RGB';scene.render.filepath=str(OUT/(name+'.png'))
 bpy.ops.render.render(write_still=True)
 capture['captures'].append({'path':name+'.png','sha256':sha(OUT/(name+'.png')),'opaque':not transparent,'kind':'actual Blender render of imported exact r004 GLB meshes; source unchanged','cameraM':list(camera.location),'cameraTargetM':list(center),'orthoScaleM':camera.data.ortho_scale,'viewportPx':[1600,1200],'fixtureRequestSha256':sha(OUT/'fixture-request.json'),'nodes':[o.name for o in nodes]})
 for obj in nodes:obj.hide_render=True
render('blender-user-perimeter-close',full)
render('blender-user-perimeter-top',full,top=True)
render('cutout',full,transparent=True)
render('blender-four-heights',board)
scene.render.film_transparent=False;scene.render.image_settings.color_mode='RGB'
for obj in full:obj.hide_render=False
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'blender-source.blend'))
(OUT/'capture.json').write_text(json.dumps(capture,indent=2)+'\n')
validation=json.loads((OUT/'validation.json').read_text());validation['sourceBlendSha256']=sha(OUT/'blender-source.blend');validation['reviewRecipeSha256']=sha(OUT/'review-recipe.py');validation['sourceRevision']='r004';validation['sourceManifestSha256']=sha(SOURCE/'delivery-manifest.json');validation['glbBytesUnchanged']=True
(OUT/'validation.json').write_text(json.dumps(validation,indent=2)+'\n')
(OUT/'review.md').write_text('Exact native r004 GLB bytes retained. r005 corrects inherited source-render provenance and adds actual imported-GLB user-perimeter captures at all four approved heights, plus RGBA cutout. Native visual support is validated; pressure/collision/damage qualification and exact-candidate browser/game evidence remain pending. Art is unapproved.\n')
manifest={'approval':'unapproved','files':[{'path':str(p.relative_to(OUT)),'bytes':p.stat().st_size,'sha256':sha(p)}for p in sorted(OUT.rglob('*'))if p.is_file() and p.name!='delivery-manifest.json']}
(OUT/'delivery-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('COMPLEX_PERIMETER_REVIEW_COMPLETE',sha(OUT/'delivery-manifest.json'),flush=True)
