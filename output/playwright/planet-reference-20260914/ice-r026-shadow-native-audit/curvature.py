import json,math
from pathlib import Path
b=Path('/root/sidereal_spacetime/output/playwright/planet-reference-20260914');k=json.loads((b/'ice-r026/kit.json').read_text());reports=[]
def sub(a,b):return [x-y for x,y in zip(a,b)]
def cross(a,b):return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
def dot(a,b):return sum(x*y for x,y in zip(a,b))
def unit(v):
 n=math.sqrt(dot(v,v));return[x/n for x in v]
for name in ['snow-cut-region','snow-open-gorge']:
 m=next(v for v in k['variants']if v['name']==name);s=.38;offsets=[];angles=[];examples=[]
 def f(v):return[x*(1+s*v[2])for x in unit([s*v[0],s*v[1],1])]
 for t,role in enumerate(m['triangleMaterials']):
  if role!=0:continue
  vs=[m['positions'][i*3:i*3+3]for i in m['indices'][t*3:t*3+3]];ps=[f(v)for v in vs];ng=unit(cross(sub(ps[1],ps[0]),sub(ps[2],ps[0])));mid=[sum(v[a]for v in vs)/3 for a in range(3)];pm=f(mid);delta=abs(dot(sub(pm,ps[0]),ng));offsets.append(delta)
  for source_id,point in zip(m['indices'][t*3:t*3+3],vs):
   normal=m['normals'][source_id*3:source_id*3+3];u=unit(cross([1,0,0]if abs(normal[1])>.9 else[0,1,0],normal));v=cross(normal,u);e=1e-4
   du=sub(f([x+e*d for x,d in zip(point,u)]),f([x-e*d for x,d in zip(point,u)]));dv=sub(f([x+e*d for x,d in zip(point,v)]),f([x-e*d for x,d in zip(point,v)]));nn=unit(cross(du,dv));angles.append(math.degrees(math.acos(max(-1,min(1,dot(nn,ng))))))
  if delta>.0005 and len(examples)<6:examples.append({'triangle':t,'curvedMidpointVsPlanarTriangleDistance':delta,'source':vs})
 offsets.sort();reports.append({'variant':name,'regionScale':s,'snowTriangles':len(offsets),'maxShadowOffsetNormalAngleDegrees':max(angles),'p99ShadowOffsetNormalAngleDegrees':sorted(angles)[int(len(angles)*.99)],'medianSagitta':offsets[len(offsets)//2],'p99Sagitta':offsets[int(len(offsets)*.99)],'maxSagitta':offsets[-1],'aboveBodyDistance0005':sum(d>.0005 for d in offsets),'examples':examples})
(b/'ice-r026-shadow-native-audit/curvature.json').write_text(json.dumps(reports,indent=2));print(json.dumps([{k:v for k,v in r.items()if k!='examples'}for r in reports],indent=2))
