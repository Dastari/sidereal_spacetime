"""Read-only maximum bipartite corner matching at the original strict tolerances."""
import sys,json,math,collections,hashlib
from pathlib import Path
sys.path.insert(0,str(Path.cwd()/'scripts/art_library'))
from audit_native_kit_attributes import read_glb,glb_corners,rotate
out=Path(__file__).resolve().parent;raw=(out/'kit.json').read_bytes();kit=json.loads(raw);v=next(x for x in kit['variants']if x['name']=='ground-sphere');expected=[]
for t,role in enumerate(v['triangleMaterials']):
 for k in range(3):
  i=v['indices'][t*3+k];expected.append((kit['materials'][role]['name'],rotate(v['positions'][i*3:i*3+3]),rotate(v['normals'][i*3:i*3+3]),tuple(v['uvs'][i*2:i*2+2])))
g,b=read_glb(out/'ground-sphere.glb');actual,_=glb_corners(g,b);bins=collections.defaultdict(list)
def key(c):return(c[0],*(math.floor(x/1e-5)for x in c[1]))
for i,c in enumerate(actual):bins[key(c)].append(i)
edges=[]
for c in expected:
 k=key(c);found=[]
 for dx in(-1,0,1):
  for dy in(-1,0,1):
   for dz in(-1,0,1):
    for j in bins.get((k[0],k[1]+dx,k[2]+dy,k[3]+dz),[]):
     a=actual[j]
     if math.dist(c[1],a[1])<=1e-5 and math.dist(c[2],a[2])<=1e-4 and math.dist(c[3],a[3])<=1e-5:found.append(j)
 edges.append(found)
matched={}
def augment(i,seen):
 for j in edges[i]:
  if j in seen:continue
  seen.add(j)
  if j not in matched or augment(matched[j],seen):matched[j]=i;return True
 return False
missing=[i for i in sorted(range(len(edges)),key=lambda x:len(edges[x]))if not augment(i,set())]
report={'method':'Maximum bipartite matching, preserves corner multiplicity/material boundaries; original strict tolerances unchanged','kitSha256':hashlib.sha256(raw).hexdigest(),'variant':'ground-sphere','expectedCorners':len(expected),'actualCorners':len(actual),'matchedCorners':len(matched),'unmatchedExpected':missing,'unmatchedActual':len(actual)-len(matched),'positionTolerance':1e-5,'normalTolerance':1e-4,'uvTolerance':1e-5,'maximumNormalDelta':max(math.dist(expected[i][2],actual[j][2])for j,i in matched.items()),'kitUnchanged':raw==(out/'kit.json').read_bytes()}
(out/'ground-sphere-exact-normal-audit.json').write_text(json.dumps(report,indent=2));print(report);assert not missing and len(matched)==len(actual)
