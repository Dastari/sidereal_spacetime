"""Validate native component skinning, animation compatibility and source accounting."""
import json,struct,math,hashlib,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/(sys.argv[1] if len(sys.argv)>1 else '.runtime/character-components/r001')
def read(path):
 raw=path.read_bytes();magic,v,length=struct.unpack_from('<III',raw);assert magic==0x46546c67 and v==2 and length==len(raw)
 n=struct.unpack_from('<I',raw,12)[0];return json.loads(raw[20:20+n]),raw[28+n:]
def values(g,data,i):
 a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];fmt={5120:'b',5121:'B',5122:'h',5123:'H',5125:'I',5126:'f'}[a['componentType']];n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];size=struct.calcsize(fmt)*n
 return [struct.unpack_from('<'+fmt*n,data,v.get('byteOffset',0)+a.get('byteOffset',0)+j*v.get('byteStride',size)) for j in range(a['count'])]
def bind(g,data):
 skin=g['skins'][0];return dict(zip([g['nodes'][i]['name'] for i in skin['joints']],values(g,data,skin['inverseBindMatrices'])))
def clips(g,data):
 return {a['name']:{(g['nodes'][c['target']['node']]['name'],c['target']['path']):(values(g,data,a['samplers'][c['sampler']]['input']),values(g,data,a['samplers'][c['sampler']]['output'])) for c in a['channels']} for a in g.get('animations',[])}
base,bb=read(ROOT/'assets/runtime/crew/frontier-crew.glb');baseline=bind(base,bb);original_clips=clips(base,bb)
manifest=json.loads((OUT/'manifest.json').read_text());audit=manifest['sourceAudit']
assert len(audit)==550 and len({p['object'] for p in audit})==550
assert set(manifest['sets'])==set(json.loads((ROOT/'packages/content/src/crew-looks.json').read_text()))
assert all(set(c['bodyTypes'])=={'male','female'} for c in manifest['components'])
assert len({c['id'] for c in manifest['components']})==90
source_names={p['object'] for p in audit};assigned={n for c in manifest['components'] for n in c['sourceObjects']}
assert assigned=={p['object'] for p in audit if p['slot'] not in ['hair','face','weapon']},'Unassigned equipment source part'
count=0;max_delta=0
for file in [OUT/'modular-crew.glb',*sorted(OUT.glob('*.glb'))]:
 g,data=read(file);b=bind(g,data);assert set(b)==set(baseline),file
 assert all(max(abs(x-y) for x,y in zip(b[k],baseline[k]))<1e-6 for k in b),('bind pose',file)
 for i,a in enumerate(g['accessors']):assert all(math.isfinite(x) for row in values(g,data,i) for x in row),(file,i)
 for mesh in g['meshes']:
  for p in mesh['primitives']:
   a=p['attributes'];assert 'JOINTS_0' in a and 'WEIGHTS_0' in a
   assert all(abs(sum(v)-1)<1e-5 for v in values(g,data,a['WEIGHTS_0']))
   assert all(0<=x<16 for v in values(g,data,a['JOINTS_0']) for x in v)
   assert max(v[0] for v in values(g,data,p['indices']))<g['accessors'][a['POSITION']]['count']
 for name,channels in clips(g,data).items():
  assert name in original_clips and channels.keys()==original_clips[name].keys()
  for key,(times,poses) in channels.items():
   ot,op=original_clips[name][key];assert times==ot
   delta=max(abs(x-y) for a,b in zip(poses,op) for x,y in zip(a,b));max_delta=max(max_delta,delta);assert delta<1e-6,(name,key,delta)
 count+=1
staged=ROOT/'assets/art-library/designs/crew.animation.aim/revisions/r002/crew-poses.glb'
if staged.exists():
 g,data=read(staged);assert bind(g,data)==baseline,'Draft combat rig is incompatible'
for c in manifest['components']:
 assert (OUT/c['glb']).exists() and (OUT/c['image']).exists()
 assert c['massKg']>0 and all(x>0 for x in c['boundsMeters']['size'])
for sex in ['male','female']:
 for look in manifest['sets']:assert (OUT/f'{sex}-{look}.png').exists()
 assert (OUT/f'base-{sex}.png').exists()
assert hashlib.sha256((ROOT/manifest['source']).read_bytes()).hexdigest()==manifest['sourceSha256']
report={'passed':True,'glbsChecked':count,'sourceObjectsAudited':550,'equipmentComponents':90,'allOriginalEquipmentAssigned':True,'originalSourceUnchanged':True,'sharedBindMatricesExact':True,'sharedClipMaxDelta':max_delta,'normalizedFiniteWeights':True,'stagedCombatRigCompatible':staged.exists(),'bothBodyTypesAllTenSetsRendered':True,'ownerFinalSignoff':None}
(OUT/'component-validation.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
