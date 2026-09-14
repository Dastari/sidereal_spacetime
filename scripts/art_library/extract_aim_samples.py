"""Extract runtime quaternions from the exact exported GLB, not guessed axis conversions."""
import json,struct
from pathlib import Path
root=Path(__file__).resolve().parents[2];folder=root/'assets/art-library/designs/crew.animation.aim/revisions/r002';raw=(folder/'crew-poses.glb').read_bytes();size=struct.unpack_from('<I',raw,12)[0];g=json.loads(raw[20:20+size]);binary=raw[28+size:]
def values(index):
 a=g['accessors'][index];v=g['bufferViews'][a['bufferView']];n={'SCALAR':1,'VEC3':3,'VEC4':4}[a['type']];offset=v.get('byteOffset',0)+a.get('byteOffset',0);return list(struct.unpack_from('<'+'f'*n,binary,offset))
data={'version':1,'space':'glTF linked-node local quaternion XYZW','profiles':{}}
for animation in g['animations']:
 if '.Aim.' not in animation['name']:continue
 profile,_,yaw,pitch=animation['name'].split('.');sample={}
 for channel in animation['channels']:
  if channel['target']['path']!='rotation':continue
  name=g['nodes'][channel['target']['node']]['name']
  if name in ['spine','head','upper_arm.L','upper_arm.R','forearm.L','forearm.R']:sample[name]=values(animation['samplers'][channel['sampler']]['output'])
 data['profiles'].setdefault(profile,[]).append({'yaw':float(yaw),'pitch':float(pitch),'bones':sample})
(folder/'runtime-aim-space.json').write_text(json.dumps(data,indent=2))
