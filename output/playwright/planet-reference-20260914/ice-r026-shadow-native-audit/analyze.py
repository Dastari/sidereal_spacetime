import json,math,collections,hashlib
from pathlib import Path
base=Path('/root/sidereal_spacetime');path=base/'output/playwright/planet-reference-20260914/ice-r026/kit.json';kit=json.loads(path.read_text());results=[]
def sub(a,b):return tuple(x-y for x,y in zip(a,b))
def cross(a,b):return(a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
def dot(a,b):return sum(x*y for x,y in zip(a,b))
for mesh in kit['variants']:
 p=mesh['positions'];ns=mesh['normals'];idx=mesh['indices'];roles=mesh['triangleMaterials'];duplicates=collections.Counter();edges=collections.Counter();stats=collections.defaultdict(lambda:dict(triangles=0,degenerate=0,invertedCornerNormals=0,minNormalDot=1.));examples=[]
 for t in range(len(idx)//3):
  ids=idx[t*3:t*3+3];vs=[tuple(p[i*3:i*3+3])for i in ids];key=tuple(sorted(vs));duplicates[key]+=1
  for a,b in zip(vs,vs[1:]+vs[:1]):edges[tuple(sorted((a,b)))]+=1
  c=cross(sub(vs[1],vs[0]),sub(vs[2],vs[0]));length=math.sqrt(dot(c,c));s=stats[roles[t]];s['triangles']+=1
  if length<1e-12:s['degenerate']+=1;continue
  for i in ids:
   d=dot(c,ns[i*3:i*3+3])/length;s['minNormalDot']=min(s['minNormalDot'],d)
   if d<0:s['invertedCornerNormals']+=1
  if roles[t]==0 and len(examples)<4 and min(dot(c,ns[i*3:i*3+3])/length for i in ids)<.9:examples.append({'triangle':t,'positions':vs,'normals':[ns[i*3:i*3+3]for i in ids]})
 results.append({'variant':mesh['name'],'materialStats':stats,'duplicateTriangleExtras':sum(n-1 for n in duplicates.values()),'positionalBoundaryEdges':sum(n==1 for n in edges.values()),'positionalEdgesOverTwoFaces':sum(n>2 for n in edges.values()),'snowNormalMismatchExamples':examples})
output={'kitSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'note':'Exact-position diagnostic, does not modify topology; separate native overlaps can have shared positional edges. Normals compared with source geometric triangle plane, not smooth intended surface.','variants':results}
(path.parent.parent/'ice-r026-shadow-native-audit/report.json').write_text(json.dumps(output,indent=2));print(json.dumps(results,indent=2))
