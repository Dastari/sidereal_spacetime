"""Create a preserved successor export carrying explicitly authored opaque IOR.
Geometry/BIN and kit JSON stay byte-identical. Never overwrites a revision.
"""
import argparse, hashlib, json, shutil, struct
from pathlib import Path
from audit_native_kit_attributes import read_glb

def corrected_glb(data,definitions):
 magic,version,total=struct.unpack_from('<III',data)
 if magic!=0x46546c67 or version!=2 or total!=len(data):raise ValueError('Invalid GLB')
 length,kind=struct.unpack_from('<II',data,12)
 if kind!=0x4e4f534a:raise ValueError('First chunk must be JSON')
 g=json.loads(data[20:20+length]);tail=data[20+length:];changes=[]
 for m in g.get('materials',[]):
  expected=definitions.get(m.get('name'),{})
  if 'ior' not in expected:continue
  previous=m.get('extensions',{}).get('KHR_materials_ior',{}).get('ior',1.5)
  if previous==expected['ior']:continue
  m.setdefault('extensions',{})['KHR_materials_ior']={'ior':expected['ior']}
  changes.append({'material':m['name'],'before':previous,'after':expected['ior']})
 if not changes:return data,changes
 used=g.setdefault('extensionsUsed',[])
 if 'KHR_materials_ior' not in used:used.append('KHR_materials_ior')
 encoded=json.dumps(g,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4)
 return struct.pack('<III',magic,version,20+len(encoded)+len(tail))+struct.pack('<II',len(encoded),kind)+encoded+tail,changes

def successor(source,destination):
 if destination.exists():raise FileExistsError('Preserve existing revision: '+str(destination))
 kit=json.loads((source/'kit.json').read_text());definitions={m['name']:m for m in kit['materials']}
 destination.mkdir(parents=True);records=[]
 for p in source.iterdir():
  if p.is_file() and (p.suffix in {'.blend','.glb'} or p.name in {'kit.json','kit-preview.png'}):
   raw=p.read_bytes();result,changes=corrected_glb(raw,definitions)if p.suffix=='.glb' else(raw,[])
   (destination/p.name).write_bytes(result)
   record={'file':p.name,'sourceSha256':hashlib.sha256(raw).hexdigest(),'successorSha256':hashlib.sha256(result).hexdigest(),'changes':changes}
   if p.suffix=='.glb':
    before=read_glb(p)[1];after=read_glb(destination/p.name)[1]
    if before!=after:raise AssertionError('BIN changed')
    record['binByteIdentical']=True
   records.append(record)
 (destination/'ior-preservation.json').write_text(json.dumps({'source':str(source),'action':'Only explicit source IOR is corrected; original exports remain untouched. No visual acceptance claimed.','files':records},indent=2))
 shutil.copy2(__file__,destination/'preserve_native_kit_ior.py')
 return records
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('destination',type=Path);a=p.parse_args();records=successor(a.source,a.destination);print(json.dumps({'files':len(records),'materialCorrections':sum(len(r['changes'])for r in records)}))
