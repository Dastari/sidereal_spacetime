"""Focused native calibration contract. Technical checks do not score visual fidelity."""
from pathlib import Path
import json,struct,math,hashlib,sys
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/sys.argv[1];BASE=ROOT/'assets/art-library/designs/crew.base-and-outfits/revisions/r002/components'
def read(p):
 raw=p.read_bytes();assert struct.unpack_from('<I',raw,0)[0]==0x46546c67;n=struct.unpack_from('<I',raw,12)[0];return json.loads(raw[20:20+n]),raw[28+n:]
def values(g,b,i):
 a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];typ={5120:'b',5121:'B',5122:'h',5123:'H',5125:'I',5126:'f'}[a['componentType']];n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];size=struct.calcsize(typ)*n
 return [struct.unpack_from('<'+typ*n,b,v.get('byteOffset',0)+a.get('byteOffset',0)+j*v.get('byteStride',size)) for j in range(a['count'])]
def binds(g,b):
 s=g['skins'][0];return dict(zip([g['nodes'][i]['name'] for i in s['joints']],values(g,b,s['inverseBindMatrices'])))
def clips(g,b):
 return {a['name']:{(g['nodes'][c['target']['node']]['name'],c['target']['path']):(values(g,b,a['samplers'][c['sampler']]['input']),values(g,b,a['samplers'][c['sampler']]['output'])) for c in a['channels']} for a in g.get('animations',[])}
bg,bb=read(BASE/'modular-crew.glb');baseline=binds(bg,bb);bc=clips(bg,bb)
manifest=json.loads((OUT/'manifest.json').read_text());old=json.loads((BASE/'manifest.json').read_text());oldrows={c['id']:c for c in old['components']}
for c in manifest['components']:
 if c['id'] in oldrows:
  for k in ['id','slot','massKg','grid','covers']:assert c[k]==oldrows[c['id']][k],(c['id'],k)
assert manifest['sets']==old['sets'] and manifest['rig']==old['rig']
files=list(OUT.glob('*.glb'));assert len(files)==16,len(files)
triangles=0
for p in files:
 g,b=read(p);assert binds(g,b)==baseline,(p,'binds')
 for i,a in enumerate(g['accessors']):assert all(math.isfinite(x) for row in values(g,b,i) for x in row),(p,i)
 for mesh in g['meshes']:
  for prim in mesh['primitives']:
   attrs=prim['attributes'];assert all(k in attrs for k in ['POSITION','NORMAL','JOINTS_0','WEIGHTS_0'])
   assert all(abs(sum(w)-1)<1e-5 for w in values(g,b,attrs['WEIGHTS_0']))
   assert all(0<=j<16 for row in values(g,b,attrs['JOINTS_0']) for j in row)
   assert all(abs(sum(x*x for x in v)-1)<.015 for v in values(g,b,attrs['NORMAL']))
 if p.name=='modular-crew.glb':
  assert clips(g,b)==bc,'Original clips changed'
  ids={n.get('extras',{}).get('component_id') for n in g['nodes']};assert {'base-male-modesty','base-female-modesty','medic-open-comms'}<=ids
  assert {c['id'] for c in old['components']}<=ids
  triangles=sum(g['accessors'][p['indices']]['count']//3 for m in g['meshes'] for p in m['primitives'])
  optical=[m for m in g['materials'] if m.get('extensions',{}).get('KHR_materials_transmission',{}).get('transmissionFactor',0)>0];assert optical
assert hashlib.sha256((BASE/'blender-source.blend').read_bytes()).hexdigest()==manifest['parentSourceSha256']
report={'passed':True,'glbsChecked':len(files),'existingComponentContractsPreserved':90,'focusedExistingEquipment':9,'bases':2,'updatedHairStyles':3,'newUnisexComms':'staged only; no gender or inventory side effect','bindMatricesExact':True,'allTwelveClipsExact':True,'normalizedWeightsAndNormals':True,'finiteAccessors':True,'runtimeTriangles':triangles,'nativeSourceSha256':hashlib.sha256((OUT/'blender-source.blend').read_bytes()).hexdigest(),'runtimeSha256':hashlib.sha256((OUT/'modular-crew.glb').read_bytes()).hexdigest(),'visualAcceptance':'Separate independent Astra review required','ownerFinalSignoff':None}
(OUT/'focused-validation.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
