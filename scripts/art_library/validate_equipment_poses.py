"""Validate the exact staged Blender export without installing or publishing it."""
import hashlib,json,math,struct
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'assets/art-library/designs/crew.animation.aim/revisions/r002'
def glb(path):
 raw=path.read_bytes();magic,version,length=struct.unpack_from('<III',raw)
 assert magic==0x46546c67 and version==2 and length==len(raw),path
 size=struct.unpack_from('<I',raw,12)[0]
 return json.loads(raw[20:20+size]),raw[28+size:]
def values(g,data,index):
 a=g['accessors'][index];v=g['bufferViews'][a['bufferView']]
 fmt={5120:'b',5121:'B',5122:'h',5123:'H',5125:'I',5126:'f'}[a['componentType']]
 n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];size=struct.calcsize(fmt)*n
 start=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',size)
 return [struct.unpack_from('<'+fmt*n,data,start+i*stride) for i in range(a['count'])]
def clips(g,data):
 return {a['name']:{(g['nodes'][c['target']['node']]['name'],c['target']['path']):(values(g,data,a['samplers'][c['sampler']]['input']),values(g,data,a['samplers'][c['sampler']]['output'])) for c in a['channels']} for a in g['animations']}
old,ob=glb(ROOT/'assets/runtime/crew/frontier-crew.glb');new,nb=glb(OUT/'crew-poses.glb')
assert len(new['meshes'])==len(old['meshes'])==37
assert len(new['skins'][0]['joints'])==16
assert [new['nodes'][i]['name'] for i in new['skins'][0]['joints']]==[old['nodes'][i]['name'] for i in old['skins'][0]['joints']]
assert len(new['animations'])==75
assert {m['name']:m for m in new['materials']}=={m['name']:m for m in old['materials']},'Material/optical response changed'
old_clips,new_clips=clips(old,ob),clips(new,nb)
assert len(old_clips)==12
max_delta=0
for name,channels in old_clips.items():
 assert channels.keys()==new_clips[name].keys(),name
 for key,(times,poses) in channels.items():
  nt,np=new_clips[name][key];assert times==nt,(name,key,'timing');assert len(poses)==len(np)
  delta=max(abs(x-y) for a,b in zip(poses,np) for x,y in zip(a,b));max_delta=max(max_delta,delta)
  assert delta<1e-6,(name,key,delta)
for g,data in [(new,nb),*[glb(p) for p in sorted((OUT/'equipment').glob('*.glb'))]]:
 for i,a in enumerate(g['accessors']):
  assert all(math.isfinite(x) for row in values(g,data,i) for x in row)
 for mesh in g['meshes']:
  for primitive in mesh['primitives']:
   pos=values(g,data,primitive['attributes']['POSITION'])
   if 'indices' in primitive:assert max(v[0] for v in values(g,data,primitive['indices']))<len(pos)
   if 'WEIGHTS_0' in primitive['attributes']:assert all(abs(sum(w)-1)<1e-5 for w in values(g,data,primitive['attributes']['WEIGHTS_0']))
assert (ROOT/'assets/source/crew-astra.blend').read_bytes() and hashlib.sha256((ROOT/'assets/source/crew-astra.blend').read_bytes()).hexdigest()=='28ef2737ea6cbb53e1e45e8c00634459f9f4f008752f4d21bbe7776e9e69d440'
files=[OUT/'blender-source.blend',OUT/'crew-poses.glb',OUT/'runtime-aim-space.json',OUT/'equipment/handheld-source.blend',*sorted((OUT/'equipment').glob('*.glb'))]
result={'status':'pass','deformationBones':16,'meshSlots':37,'materialPrimitives':sum(len(m['primitives']) for m in new['meshes']),'clips':75,'unchangedOriginalClips':12,'maxOriginalClipDelta':max_delta,'materialsUnchanged':True,'finiteAccessors':True,'files':{str(p.relative_to(ROOT)):{'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size} for p in files}}
(OUT/'asset-validation.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
