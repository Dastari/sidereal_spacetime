"""Native conservative walking-proxy qualification. No art/authority publication.
Only the pinned leaf-node rear partition is admitted. The proxy is the convex
cover of every native visual POSITION, not bounds metadata or sampled voxels.
"""
from pathlib import Path
import hashlib, json, struct
ROOT=Path(__file__).resolve().parents[1]
PATH='assets/runtime/assembly/hull/finish-r004/part-e7dddd4628bd6be8efb7/clean.glb'
SHA='53d58e142047665409aadeb232a83f0c5a1901da705234f2ffc8bda4f211e5c9'
OUTPUT=ROOT/'packages/content/src/wayfarer-cockpit-partition-proof.json'
def qualify():
 raw=(ROOT/PATH).read_bytes()
 assert hashlib.sha256(raw).hexdigest()==SHA,'Native revision changed'
 magic,version,total=struct.unpack_from('<4sII',raw);assert magic==b'glTF' and version==2 and total==len(raw)
 count,kind=struct.unpack_from('<I4s',raw,12);assert kind==b'JSON'
 g=json.loads(raw[20:20+count]);size,kind=struct.unpack_from('<I4s',raw,20+count);assert kind==b'BIN\x00'
 data=raw[28+count:28+count+size]
 assert g['scenes'][g.get('scene',0)]['nodes']==list(range(len(g['nodes'])))
 assert all(set(n)<= {'name','extras','mesh'} for n in g['nodes']), 'Transformed/instanced graph needs explicit adapter'
 assert sorted(n['mesh']for n in g['nodes'])==list(range(len(g['meshes'])))
 points=[];triangles=0
 for mesh in g['meshes']:
  for pr in mesh['primitives']:
   assert pr.get('mode',4)==4 and not pr.get('targets')
   a=g['accessors'][pr['attributes']['POSITION']];assert a['componentType']==5126 and a['type']=='VEC3' and 'sparse'not in a
   v=g['bufferViews'][a['bufferView']];assert v['buffer']==0
   offset=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',12)
   for i in range(a['count']):
    x,y,z=struct.unpack_from('<fff',data,offset+i*stride);points.append((x,-z,y))
   triangles+=g['accessors'][pr['indices']]['count']//3
 cross=lambda o,a,b:(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
 planar=sorted(set((x,y)for x,y,z in points));lower=[];upper=[]
 for p in planar:
  while len(lower)>1 and cross(lower[-2],lower[-1],p)<=0:lower.pop()
  lower.append(p)
 for p in reversed(planar):
  while len(upper)>1 and cross(upper[-2],upper[-1],p)<=0:upper.pop()
  upper.append(p)
 hull=lower[:-1]+upper[:-1]
 assert all(all(cross(hull[i],hull[(i+1)%len(hull)],p)>=-1e-10 for i in range(len(hull)))for p in planar)
 assert min(z for x,y,z in points)==0 and max(z for x,y,z in points)==2.4375
 proof={'schema':'sidereal.native-walking-cover.v1','assetId':'part-e7dddd4628bd6be8efb7','path':PATH,'sha256':SHA,'method':'Convex projection of all native POSITION accessors; conservative planar obstacle, not a pressure or structural rating','nativeVertices':len(points),'nativeTriangles':triangles,'heightM':[0,2.4375],'footprintM':hull,'qualifiedPurpose':'standing planar walking exclusion only','finalArtApproval':False}
 return proof
if __name__=='__main__':
 import sys
 result=json.dumps(qualify(),indent=2)+'\n'
 if '--write' in sys.argv:OUTPUT.write_text(result)
 else:assert OUTPUT.read_text()==result,'Reproduce and review changed proof explicitly'
 print(json.dumps({'status':'passed','nativeVertices':qualify()['nativeVertices'],'output':str(OUTPUT.relative_to(ROOT))}))
