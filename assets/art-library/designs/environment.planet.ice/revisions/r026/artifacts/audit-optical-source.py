"""Read-only exact selected native optical GLB/JSON parity audit, including raw exports."""
from pathlib import Path
import json,struct,math,hashlib
out=Path(__file__).resolve().parent;k=json.loads((out/'kit.json').read_text());report={'source':'Ice26 selected tall shard sides only','policy':k['opticalPolicy'],'materials':[],'geometrySha256':hashlib.sha256((out/'kit.json').read_bytes()).hexdigest(),'checks':[]}
for path in list(out.glob('*.glb'))+list((out/'blender-raw').glob('*.glb')):
 data=path.read_bytes();size=struct.unpack_from('<I',data,12)[0];g=json.loads(data[20:20+size]);checked=[]
 for material in g['materials']:
  definition=next(d for d in k['materials']if d['name']==material['name']);e=material.get('extensions',{})
  if definition.get('transmissionFactor',0):
   fields={'transmissionFactor':e['KHR_materials_transmission']['transmissionFactor'],'ior':e['KHR_materials_ior']['ior'],**e['KHR_materials_volume']}
   for key in ['transmissionFactor','ior','thicknessFactor','attenuationDistance']:assert math.isclose(fields[key],definition[key],abs_tol=1e-6),(path,key,fields[key],definition[key])
   assert all(math.isclose(a,b,abs_tol=1e-6)for a,b in zip(fields['attenuationColor'],definition['attenuationColor']))
   assert material.get('alphaMode','OPAQUE')=='OPAQUE';checked.append(dict(name=material['name'],**fields))
  else:assert not e.get('KHR_materials_transmission',{}).get('transmissionFactor',0)
 report['checks'].append({'file':str(path.relative_to(out)),'opticalMaterials':checked})
old=json.loads((out.parent/'ice-r025/kit.json').read_text());counts={}
for before,after in zip(old['variants'],k['variants']):
 for key in ['positions','normals','uvs','indices']:assert before[key]==after[key]
 for i,r in enumerate(after['triangleMaterials']):
  if before['triangleMaterials'][i]==0:assert r==0
 counts[after['name']]={str(role):after['triangleMaterials'].count(role)for role in range(7)}
report['triangleRoles']=counts;report['geometryAttributesExactlyIce25']=True;report['snowCapsExactlyOpaque']=True
(out/'optical-source-validation.json').write_text(json.dumps(report,indent=2));print(json.dumps({'checks':len(report['checks']),'triangleRoles':counts},indent=2))
