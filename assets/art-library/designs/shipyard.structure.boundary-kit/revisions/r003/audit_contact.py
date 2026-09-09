import json,math,hashlib
from pathlib import Path
P=Path('.runtime/construction-boundary-kit/r003/attempt-a001');d=json.loads((P/'floor-native-triangles.json').read_text());defs=json.load(open('packages/content/src/construction-floor-interfaces.json'))
TOP=.1875;patch=[(.365,-.0715),(1.635,-.0715),(1.635,-.0625),(.365,-.0625)]
def area(p):return abs(sum(a[0]*b[1]-a[1]*b[0]for a,b in zip(p,p[1:]+p[:1])))/2 if len(p)>2 else 0

def clip(p,a,b):
 def s(q):return (b[0]-a[0])*(q[1]-a[1])-(b[1]-a[1])*(q[0]-a[0])
 out=[]
 for u,v in zip(p,p[1:]+p[:1]):
  su,sv=s(u),s(v)
  if su>=-1e-12:out.append(u)
  if (su>=0)!=(sv>=0):
   t=su/(su-sv);out.append(tuple(u[i]+t*(v[i]-u[i])for i in range(2)))
 return out

def top_contact(tris):
 total=0
 for t in tris:
  if max(abs(v[2]-TOP)for v in t)>1e-7:continue
  pp=[v[:2]for v in t]
  for a,b in zip(patch,patch[1:]+patch[:1]):pp=clip(pp,a,b)
  total+=area(pp)
 return total

def shifted(name,dx,dy):return [[[v[0]+dx,v[1]+dy,v[2]]for v in t]for t in d['parts'][name]['triangles']]
quarter=next(x for x in defs['parts']if x['id']=='quarter-1m')['native']['nodePrefix'];square=defs['parts'][0]['native']['nodePrefix']
fixtures={'single-square':shifted(square,0,-2),'split-quarter-seam':shifted(quarter,0,-1)+shifted(quarter,1,-1)}
# Derive actual upper-envelope cross-section from exported triangles at y=-.067.
tris=fixtures['split-quarter-seam'];yy=-.067;segments=[]
for t in tris:
 cross=(t[1][0]-t[0][0])*(t[2][1]-t[0][1])-(t[1][1]-t[0][1])*(t[2][0]-t[0][0])
 if cross<=1e-12:continue
 ints=[]
 for a,b in zip(t,t[1:]+t[:1]):
  if (a[1]<=yy<=b[1]or b[1]<=yy<=a[1])and abs(b[1]-a[1])>1e-12:
   f=(yy-a[1])/(b[1]-a[1]);ints.append((a[0]+f*(b[0]-a[0]),a[2]+f*(b[2]-a[2])))
 if len(ints)>=2:segments.append((min(ints),max(ints)))
xs=sorted(set(round(v[0],11)for s in segments for v in s if .9959<=v[0]<=1.0041))
def height(x):
 zz=[]
 for a,b in segments:
  if a[0]-1e-9<=x<=b[0]+1e-9 and b[0]-a[0]>1e-12:zz.append(a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]))
 return max(zz)
profile=[]
for x in xs:
 z=height(x)
 if profile and abs(x-profile[-1][0])<1e-7:continue
 profile.append([x,z])
# Drop interior collinear triangle-split points, retain genuine bevel vertices.
changed=True
while changed:
 changed=False
 for i in range(1,len(profile)-1):
  a,b,c=profile[i-1:i+2]
  if abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))<1e-12:profile.pop(i);changed=True;break
report={'floorGlb':d['source'],'floorSha256':d['sha256'],'method':'Coplanar native triangle clipping against full gasket bottom polygon; upper-envelope cross-section from exported positive-Z triangles, not AABB or ideal plane.','patchM':patch,'patchAreaM2':area(patch),'fixtures':{n:{'contactAreaM2':top_contact(t),'uncoveredAreaM2':area(patch)-top_contact(t)}for n,t in fixtures.items()},'derivedSeamProfileXZ':profile,'maxGapM':TOP-min(z for x,z in profile),'limits':['Transverse orthogonal seam away from corner bevels; diagonal/corner intersections require independent profile adapters.','No material strength or pressure rating.']}
(P/'floor-contact-audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
