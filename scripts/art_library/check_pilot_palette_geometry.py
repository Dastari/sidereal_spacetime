import json,struct,hashlib
from pathlib import Path
out=Path(__file__).resolve().parents[2]/'.runtime/art-library/hull/r006'
def geometry(p):
 raw=p.read_bytes();n=struct.unpack_from('<I',raw,12)[0];g=json.loads(raw[20:20+n]);binary=raw[28+n:];sizes={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};components={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
 def accessor(i):
  a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];size=sizes[a['componentType']]*components[a['type']];start=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',size);data=b''.join(binary[start+j*stride:start+j*stride+size] for j in range(a['count']));return (a['componentType'],a['type'],a['count'],hashlib.sha256(data).hexdigest())
 return [(m.get('name'),[(accessor(p['indices']),{k:accessor(v) for k,v in sorted(p['attributes'].items())}) for p in m['primitives']]) for m in g['meshes']]
result={state:geometry(out/'attempt-palette-before/outer-diagonal-cheek'/(state+'.glb'))==geometry(out/'outer-diagonal-cheek'/(state+'.glb')) for state in ['clean','worn','damaged']}
(out/'palette-geometry-proof.json').write_text(json.dumps({'mesh_indices_positions_normals_uvs_identical':result},indent=2));print(result)
assert all(result.values())
