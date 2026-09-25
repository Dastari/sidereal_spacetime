"""Preserve R001 geometry and correct export node identity delimiter only."""
from pathlib import Path
import json,struct,shutil
O=Path(__file__).resolve().parents[2]/'.runtime/art-library/roof/r001';a=O/'attempts'/'original-node-delimiter';a.mkdir(parents=True,exist_ok=True)
p=O/'kit.glb';shutil.copy2(p,a/'kit.glb');shutil.copy2(O/'components.json',a/'components.json')
b=p.read_bytes();jn=struct.unpack_from('<I',b,12)[0];g=json.loads(b[20:20+jn]);cs=json.loads((O/'components.json').read_text())
for c in cs:
 old=c['node_prefix'];new=old[:-2]
 for n in g['nodes']:
  if n.get('name','').startswith(old):n['name']=new+'_'+n['name'][len(old):]
 c['node_prefix']=new
j=json.dumps(g,separators=(',',':')).encode();j+=b' '*((-len(j))%4);tail=b[20+jn:];p.write_bytes(struct.pack('<III',0x46546c67,2,20+len(j)+len(tail))+struct.pack('<II',len(j),0x4e4f534a)+j+tail);(O/'components.json').write_text(json.dumps(cs,indent=2));(a/'repair.json').write_text(json.dumps({'change':'Node delimiter identity only; untouched binary geometry/material payload','original_binary_bytes':len(tail),'geometry_changed':False},indent=2))
