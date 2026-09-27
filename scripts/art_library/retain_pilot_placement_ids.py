"""Correct r006 placed identities without changing any native GLB geometry/materials."""
from pathlib import Path
import json,hashlib,struct
root=Path(__file__).resolve().parents[2];out=root/'.runtime/art-library/hull/r006';new=json.loads((out/'new-placements.json').read_text());mapping={p['id']:p['id'].replace('pilot-r006-','pilot-r005-',1) for p in new}
record={'reason':'Art revisions replace reusable asset visuals, not placed-object identity. Preserve established r005 exterior instance IDs.','before':new,'mapping':mapping,'asset_ids_unchanged':True,'transforms_unchanged':True,'native_glb_sha256':{str(p.relative_to(out)):hashlib.sha256(p.read_bytes()).hexdigest() for c in json.loads((out/'components.json').read_text()) for p in (out/c['slug']).glob('*.glb')}}
(out/'placement-identity-correction.json').write_text(json.dumps(record,indent=2))
for filename in ['wayfarer.json','new-placements.json']:
 data=json.loads((out/filename).read_text());parts=data if isinstance(data,list) else data['parts']
 for p in parts:
  if p['id'] in mapping:p['id']=mapping[p['id']]
 (out/filename).write_text(json.dumps(data,indent=2))
# Review assembly node names/extras only; preserve binary geometry/material payload.
p=out/'assembly.glb';raw=p.read_bytes();length,kind=struct.unpack_from('<II',raw,12);g=json.loads(raw[20:20+length]);oldbinary=raw[20+length:]
def replace(v):
 if isinstance(v,str):
  for old,newid in mapping.items():v=v.replace(old,newid)
  return v
 if isinstance(v,list):return [replace(x) for x in v]
 if isinstance(v,dict):return {k:replace(x) for k,x in v.items()}
 return v
encoded=json.dumps(replace(g),separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4);p.write_bytes(raw[:8]+struct.pack('<I',20+len(encoded)+len(oldbinary))+struct.pack('<II',len(encoded),kind)+encoded+oldbinary)
