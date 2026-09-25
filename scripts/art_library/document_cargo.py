"""Checkpoint immutable per-design evidence, retaining failed iterations honestly."""
from pathlib import Path
from argparse import Namespace
import sys,json,struct,hashlib,math,shutil
from PIL import Image
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'scripts'));import art_catalog as ac
rev=int(sys.argv[1]);BASE=ROOT/f'.runtime/art-library/cargo/r{rev:03}';jobs=json.loads((BASE/'jobs.json').read_text())
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def validate(d):
 raw=(d/'glb.glb').read_bytes();magic,version,total=struct.unpack_from('<III',raw);assert (magic,version,total)==(0x46546c67,2,len(raw));length,kind=struct.unpack_from('<II',raw,12);assert kind==0x4e4f534a;gl=json.loads(raw[20:20+length]);binstart=28+length;binary=raw[binstart:]
 assert not gl.get('cameras');assert not any('uri'in b for b in gl.get('buffers',[]));assert 'KHR_lights_punctual' not in gl.get('extensions',{})
 def values(i):
  a=gl['accessors'][i];v=gl['bufferViews'][a['bufferView']];fmt,width={5126:('f',4),5125:('I',4),5123:('H',2),5121:('B',1)}[a['componentType']];n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];start=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',width*n)
  return [struct.unpack_from('<'+fmt*n,binary,start+k*stride) for k in range(a['count'])]
 tris=0;primitives=0;normal_error=0
 for mesh in gl['meshes']:
  for p in mesh['primitives']:
   primitives+=1;assert p.get('mode',4)==4;positions=values(p['attributes']['POSITION']);normals=values(p['attributes']['NORMAL']);assert all(math.isfinite(v) for row in positions+normals for v in row);normal_error=max(normal_error,max(abs(math.sqrt(sum(v*v for v in n))-1) for n in normals));indices=values(p['indices']);assert len(indices)%3==0 and max(v[0] for v in indices)<len(positions);tris+=len(indices)//3
 assert normal_error<.01
 materials=json.loads((d/'materials.json').read_text());gm={m['name']:m for m in gl['materials']}
 for m in materials:
  p=gm[m['name']]['pbrMetallicRoughness'];assert abs(p.get('metallicFactor',1)-m['metallic'])<1e-5;assert abs(p.get('roughnessFactor',1)-m['roughness'])<1e-5;assert all(abs(a-b)<1e-5 for a,b in zip(p.get('baseColorFactor',[1]*4),m['base_color']))
 for name in ['cutout.png','blender-close.png','blender-top.png','runtime-close.png','runtime-top.png','comparison.png']:
  with Image.open(d/name) as im:
   im.load()
   if name=='cutout.png':assert im.mode=='RGBA' and im.getextrema()[3][0]==0 and im.getextrema()[3][1]>0
 v=json.loads((d/'validation-blender.json').read_text());v.update({'glb_sha256':digest(d/'glb.glb'),'source_sha256':digest(d/'blender-source.blend'),'glb_triangles':tris,'glb_primitives':primitives,'glb_materials':len(gm),'glb_textures':len(gl.get('textures',[])),'portable_PBR_preserved':True,'max_normal_length_error':normal_error,'finite_accessors_indices_valid':True,'external_resources':False,'real_alpha':True,'validation_scope':'Mesh/index/normal/PBR/hash/image checks, not physical certification or fleet optimization'})
 (d/'validation.json').write_text(json.dumps(v,indent=2)+'\n')
 return v
refresh=ac.refresh;ac.refresh=lambda:None
with ac.locked():
 for j in jobs:
  d=Path(j['output']);design=j['design_id'];ledger=ac.read(ac.design_path(design))
  if rev>1 and ledger['current_revision']==rev-1:
   ac.mutate(Namespace(command='start',design=design,covers=j['specification']['reference_ids'],agent='cargo-authoring',change=('Stationary rear hinge saddle ears connect every hand-lid pin to the fixed frame.' if rev==3 else 'Respond to Astra review: distinct clipped pods, real opening assemblies and seals, supported frame hardware, matched stack interfaces, measured capacity and clearance.'),hypothesis='Family-specific shells and mechanically coherent openings make the collection recognizable and reviewable without relying on color or labels.'))
  if any(e['role']=='validation' for e in ac.read(ac.design_path(design))['revisions'][-1]['evidence']):continue
  v=validate(d)
  log=ROOT/'output/playwright'/('cargo' if rev==1 else f'cargo-r{rev:03}')/(j['slug']+'-capture.log');content=log.read_text();actual=json.loads(content.split('### Result\n',1)[1].split('\n###',1)[0]);capture={'actual':actual,'glb_sha256':v['glb_sha256'],'source_sha256':v['source_sha256'],'revision':rev,'kind':'Actual Shipyard, unsigned catalog through isolated Playwright routes; no publication or live installed item','camera_top':'Explicit overhead override beta=.0001; not native flight mode','commit':__import__('subprocess').check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'renderer':'Babylon WebGL2, Chromium SwiftShader','publication':False};(d/'capture.json').write_text(json.dumps(capture,indent=2)+'\n')
  context=json.dumps(capture)
  recipe=ROOT/'scripts/art_library'/('build_cargo.py' if rev==1 else f'build_cargo_r{rev:03}.py')
  for role,file in [('blender-source',d/'blender-source.blend'),('glb',d/'glb.glb'),('cutout',d/'cutout.png'),('blender-close',d/'blender-close.png'),('blender-top',d/'blender-top.png'),('runtime-close',d/'runtime-close.png'),('runtime-top',d/'runtime-top.png'),('comparison',d/'comparison.png'),('specification',d/'specification.json'),('validation',d/'validation.json'),('capture-record',d/'capture.json'),('recipe',recipe)]:
   ac.mutate(Namespace(command='evidence',design=design,revision=rev,role=role,file=str(file),notes='Unsigned cargo draft; exact asset revision; source proposals are not live stats.',context=context if role.startswith('runtime') else None))
  target=ac.design_path(design).parent/'revisions'/f'r{rev:03}'
  for name in ['materials.json','validation-blender.json','blender-open.png','blender-half-open.png','blender-underside.png','blender-stack-carrier.png','stack-carrier.blend','fit.json']:
   if (d/name).exists():shutil.copy2(d/name,target/name)
  if rev>=2:shutil.copy2(ROOT/'scripts/art_library/cargo_mechanics_fix.py',target/'cargo_mechanics_fix.py')
  led=ac.read(ac.design_path(design));registered={e['path'] for e in led['revisions'][-1]['evidence']}
  for extra in target.iterdir():
   if not extra.is_file() or str(extra.relative_to(ac.LIB)) in registered:continue
   role='blender-source' if extra.suffix=='.blend' else 'blender-close' if extra.suffix=='.png' else 'recipe' if extra.suffix=='.py' else 'specification'
   led['revisions'][-1]['evidence'].append(dict(role=role,path=str(extra.relative_to(ac.LIB)),sha256=digest(extra),bytes=extra.stat().st_size,notes='Supplemental exact-revision source, mechanical fit or material evidence; see filename.',capture_context=None,recorded_at=ac.now()))
  ac.write(ac.design_path(design),led)
  if (d/'attempts').exists():shutil.copytree(d/'attempts',target/'attempts',dirs_exist_ok=False)
  notes='Astra r001 review failed: generic family silhouettes; blocked access and lower shell gaps; unparented mechanisms; floating tank hardware; mismatched stack/unsupported mounts; grip interference; capacity and hatch corrections. r002 required. No owner feedback/sign-off.' if rev==1 else f'r{rev:03} physical and visual evidence awaiting independent Astra re-review; not accepted until feedback is resolved.'
  (target/'review.md').write_text(notes+'\n');ac.mutate(Namespace(command='feedback',design=design,revision=rev,author='agent',text=notes,message_reference=None));ac.mutate(Namespace(command='review',design=design,revision=rev,outcome='fail',notes=notes))
 ac.refresh=refresh;ac.refresh()
print('Checkpointed',len(jobs),'cargo designs revision',rev)
