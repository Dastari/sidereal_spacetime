"""Concrete native boundary ray witnesses after proposed roof joints; diagnostic only."""
import json,sys,hashlib
import numpy as np
from inspect_wayfarer_pressure_gaps import inspect,transformed,load
from qualify_wayfarer_airlock_attachment import ray_hits
from qualify_wayfarer_airlock_inlet import ROOT
ROOF=ROOT/'assets/art-library/designs/shipyard.structure.roof-closure/revisions/r000/a001'
MAP=ROOT/'assets/art-library/designs/shipyard.structure.wayfarer-airlock-inlet/revisions/r000/a003/replacement-mapping.json'
def run():
 mapping=json.loads(MAP.read_text());roles={p['sourcePlacedId']:p['role']for p in mapping['preserveOriginalPlacements']};groups=[p for p in inspect(True)if roles.get(p['id'],'structural-floor')in ['structural-wall-unqualified','structural-floor','roof-visual','interior-partition-unqualified']]
 for p in json.loads((ROOF/'whole-ship-enclosure-inspection-a002.json').read_text())['proposedNewRoofPlacements']:
  source=p['source'];t=transformed(load(str((ROOF/source['file']).relative_to(ROOT)),source['sha256'],source['nodePrefix']),p['originM']);groups.append({'id':p['id'],'triangles':t,'bounds':[t.reshape(-1,3).min(0),t.reshape(-1,3).max(0)]})
 results={};xs=sorted(set([float(x)for x in range(-4,5)]+[x+d for x in [-3,-1,1,3]for d in[-.006,-.002,.002,.006]]));ys=sorted(set([float(y)for y in range(-8,7)]+[y+d for y in [-7,-5,-3,-1,1,3,5]for d in[-.006,-.002,.002,.006]]))
 def test(name,start,end):
  results.setdefault(name,{'tested':0,'clear':[]});results[name]['tested']+=1;near=[]
  for p in groups:
   lo,hi=p['bounds']
   if any(max(start[j],end[j])<lo[j]-1e-8 or min(start[j],end[j])>hi[j]+1e-8 for j in range(3)):continue
   near.append(p['id'])
   if ray_hits(p['triangles'],start,end):return
  results[name]['clear'].append({'fromM':start,'toM':end,'sourceCandidates':near})
 for x in xs:
  for y in ys:
   test('roof',[x,y,1.95],[x,y,5]);test('floor',[x,y,.35],[x,y,-1])
 for side in [-1,1]:
  for y in ys:
   for z in [.22,.35,1,1.8,2.6]:test('side-wall',[side*4.5,y,z],[side*7,y,z])
 for x in xs:
  for z in [.22,.35,1,1.8,2.6]:test('rear-wall',[x,-8.5,z],[x,-11,z])
 return {'schema':'sidereal.wayfarer-native-closure-paths.v1','scope':'Known rectangular main-body interior only; excludes ambiguous sloped canopy exterior samples','results':results,'qualification':'Native triangle path witnesses; not a substitute for finite connected volume'}
if __name__=='__main__':
 result=run();out=ROOF/'closure-paths-a001.json'
 if out.exists():assert json.loads(out.read_text())==result
 else:out.write_text(json.dumps(result,indent=2)+'\n')
 print(json.dumps({k:{'tested':v['tested'],'clear':len(v['clear']),'first':v['clear'][:8]}for k,v in result['results'].items()}))
