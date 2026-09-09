"""Conservative native component boxes, separate from visuals and pressure cores."""
from pathlib import Path
import sys,json,struct,hashlib
import numpy as np
from qualify_wayfarer_airlock_attachment import triangles
ROOT=Path(__file__).resolve().parents[1]
directory=ROOT/sys.argv[1]
manifest=json.loads((directory/'delivery-manifest.json').read_text());rows=[]
for part in manifest['parts']:
 path=directory/part['file'];raw=path.read_bytes();assert hashlib.sha256(raw).hexdigest()==part['sha256']
 length=struct.unpack_from('<I',raw,12)[0];gltf=json.loads(raw[20:20+length]);components=[]
 for node in gltf['nodes']:
  if 'mesh' not in node:continue
  points=triangles(str(path.relative_to(ROOT)),part['sha256'],node['name']).reshape(-1,3)
  lo=points.min(0);hi=points.max(0)
  components.append({'nativeNode':node['name'],'minLocalM':(np.floor(lo*1e6)/1e6).tolist(),'maxLocalM':(np.ceil(hi*1e6)/1e6).tolist(),'method':'conservative evaluated native component AABB; outward1micrometre quantization'})
 rows.append({'partId':part['id'],'visualSha256':part['sha256'],'placementWorldM':part['worldPositionM'],'components':components})
report={'schema':'sidereal.native-inlet-collision-candidate.v1','status':'separate-unregistered-conservative-proxy','parts':rows,'bodySweepQualification':'native-qualification.json uses actual full native surfaces, not these AABBs','sealRepresentation':'contact-proxies.json identifies actual authored continuous cores; collision envelopes do not imply a pressure seal','authorityInstalled':False}
out=directory/'collision-proxies.json'
if out.exists():assert json.loads(out.read_text())==report,'Preserve prior candidate'
else:out.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'parts':len(rows),'components':sum(len(r['components']) for r in rows),'path':str(out)}))
