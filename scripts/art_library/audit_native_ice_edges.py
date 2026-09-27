"""Sample actual exported shared-port wall profiles away from step discontinuities."""
from pathlib import Path
import json,sys
out=Path(sys.argv[1]);kit=json.loads((out/'kit.json').read_text());samples=[-.4475+i*.005 for i in range(180)]
def profile(v,port):
 axis=0 if port in[0,2] else 1;coord=.5 if port in[0,1] else -.5;taxis=1-axis
 points=[v['positions'][i:i+3] for i in range(0,len(v['positions']),3)];triangles=[]
 for i in range(0,len(v['indices']),3):
  p=[points[n] for n in v['indices'][i:i+3]]
  if all(abs(q[axis]-coord)<1e-6 for q in p):triangles.append(p)
 values=[]
 for t in samples:
  zs=[]
  for triangle in triangles:
   for a,b in zip(triangle,triangle[1:]+triangle[:1]):
    d=b[taxis]-a[taxis]
    if abs(d)>1e-10:
     alpha=(t-a[taxis])/d
     if 0<=alpha<=1:zs.append(a[2]+alpha*(b[2]-a[2]))
  values.append(max(zs) if zs else None)
 return values
ref=profile(kit['variants'][1],0);reports=[]
for v in kit['variants']:
 for port in v['ports']:
  values=profile(v,port);errors=[abs(a-b) for a,b in zip(ref,values) if a is not None and b is not None]
  reports.append({'variant':v['name'],'port':port,'missingSamples':sum(x is None for x in values),'maxHeightError':max(errors,default=None)})
report={'sampleCount':len(samples),'domain':[-.4475,.4475],'reference':'ravine-end E','boundaryTolerance':1e-6,'notes':'Samples offset from exact step edges to avoid floating-point side ambiguity. This tests port cross-section, not every possible global mesh intersection.','profiles':reports}
(out/'edge-profile-validation.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
if any(r['missingSamples'] or r['maxHeightError'] is None or r['maxHeightError']>1e-5 for r in reports):raise SystemExit('Shared-port profile mismatch')
