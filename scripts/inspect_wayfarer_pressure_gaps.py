"""Read-only native ray witnesses of concrete whole-ship closure gaps.
A clear ray is an opening witness, not a claim that the rest of the hull seals.
"""
import json,hashlib,math,sys
from pathlib import Path
import numpy as np
from shapely.geometry import Polygon,Point
from shapely.ops import unary_union
import qualify_wayfarer_airlock_attachment as native
ROOT=Path(__file__).resolve().parents[1]
KIT=ROOT/'assets/art-library/designs/shipyard.structure.wayfarer-airlock-inlet/revisions/r000/a003'
CACHE={}
def load(path,sha,prefix):
 key=(path,sha,prefix)
 if key not in CACHE:CACHE[key]=native.triangles(path,sha,prefix)
 return CACHE[key].copy()
def transformed(triangles,position,angle=0,flipped=False):
 triangles[:,:,0]*=-1 if flipped else 1
 c,s=math.cos(angle),math.sin(angle)
 return triangles@np.array([[c,s,0],[-s,c,0],[0,0,1]])+np.array(position)

def inspect(return_groups=False):
 mapping=json.loads((KIT/'replacement-mapping.json').read_text());old=mapping['preserveOriginalPlacements'];replaced={p['sourcePlacedId'] for p in mapping['replacements']};groups=[]
 def add(id,t,pin):
  bounds=[t.reshape(-1,3).min(0),t.reshape(-1,3).max(0)];groups.append({'id':id,'triangles':t,'bounds':bounds,'pin':pin})
 for p in old:
  if p['sourcePlacedId'] in replaced:continue
  v=p['visual'];path='assets/runtime/'+v['url'].removeprefix('/assets/') if v else 'assets/runtime/assembly/parts.glb';sha=v['sha256'] if v else native.native.LEGACY;prefix=v.get('nodePrefix') if v else 'GEO-'+p['assetId']+'--';o=p['originalPlacement']
  add(p['sourcePlacedId'],transformed(load(path,sha,prefix),o['position'],o['rotation'],o['flipped']),{'path':path,'sha256':sha,'nodePrefix':prefix,'originalTransform':o})
 for p in mapping['replacements']+mapping['additions']:
  v=p['nativeVisual'];o=p['placement'];add(p['sourcePlacedId'],transformed(load(v['path'],v['sha256'],v['nodePrefix']),o['position'],o['rotation'],o['flipped']),v)
 audit=json.loads((ROOT/'assets/art-library/designs/shipyard.structure.external-airlock/revisions/r000/audit-a007.json').read_text())
 for p in mapping['attachedNativeParts']:
  pin=audit['sourcePins'][p['source']]
  add(p['id'],transformed(load(pin['path'],pin['sha256'],p['nodePrefix']),p['originM'],p['quarterTurns']*math.pi/2),{**pin,'nodePrefix':p['nodePrefix'],'originM':p['originM'],'quarterTurns':p['quarterTurns']})
 if return_groups:return groups
 source=json.loads((ROOT/'packages/content/src/wayfarer-starter-r001.json').read_text());floor=unary_union([Polygon([(x/32,y/32) for x,y in t['vertices']]) for t in source['layout']['tiles']]);witnesses=[];tested=0
 # Inside floor-plan polygon; zero-width seam is not enough: sample both sides
 # and finite offsets, retain positive-width adjacent ray bands as witnesses.
 xs=sorted(set([float(x) for x in range(-4,5)]+[x+d for x in [-3,-1,1,3] for d in [-.006,-.002,.002,.006]]))
 ys=sorted(set([float(y) for y in range(-8,14)]+[y+d for y in [-7,-5,-3,-1,1,3,5,7,9,11] for d in [-.006,-.002,.002,.006]]))
 for x in xs:
  for y in ys:
   if not floor.contains(Point(x,y)):continue
   start=[x,y,1.95];end=[x,y,8];hits=[];near=[];tested+=1
   for p in groups:
    lo,hi=p['bounds']
    if hi[2]<1.95 or lo[2]>8:continue
    if lo[0]-.02<=x<=hi[0]+.02 and lo[1]-.02<=y<=hi[1]+.02:near.append(p['id'])
    if not(lo[0]-1e-8<=x<=hi[0]+1e-8 and lo[1]-1e-8<=y<=hi[1]+1e-8):continue
    intersections=native.ray_hits(p['triangles'],start,end)
    if intersections:hits.append({'id':p['id'],'firstZ':1.95+6.05*intersections[0]})
   if not hits:witnesses.append({'fromM':start,'toM':end,'nearbySourcePlacedIds':near})
 radial=[];radial_tested=0
 polygon=floor if isinstance(floor,Polygon) else max(floor.geoms,key=lambda p:p.area)
 coords=list(polygon.exterior.coords);ccw=polygon.exterior.is_ccw
 for a,b in zip(coords,coords[1:]):
  a=np.array(a);b=np.array(b);delta=b-a;length=float(np.linalg.norm(delta))
  if length<.02:continue
  outward=np.array([delta[1],-delta[0]])/length*(1 if ccw else -1)
  for fraction in [.006/length,.5,1-.006/length]:
   edge=a+delta*fraction;inner=edge-outward*1.0;outer=edge+outward*6
   if not floor.contains(Point(inner)):continue
   for z in [.4,1.5,2.4,2.64]:
    start=[float(inner[0]),float(inner[1]),z];end=[float(outer[0]),float(outer[1]),z];radial_tested+=1;hits=[];near=[]
    for p in groups:
     lo,hi=p['bounds']
     if not lo[2]-1e-8<=z<=hi[2]+1e-8:continue
     if all(lo[j]-.35<=edge[j]<=hi[j]+.35 for j in [0,1]):near.append(p['id'])
     if any(max(start[j],end[j])<lo[j]-1e-8 or min(start[j],end[j])>hi[j]+1e-8 for j in [0,1]):continue
     if native.ray_hits(p['triangles'],start,end):hits.append(p['id'])
    if not hits:radial.append({'fromM':start,'toM':end,'nominalEdgeM':[a.tolist(),b.tolist()],'nearbySourcePlacedIds':near})
 return {'schema':'sidereal.wayfarer-native-pressure-gap-witnesses.v1','status':'read-only-gap-inspection-not-enclosure-approval','sourceBlueprintSha256':mapping['sourceBlueprintSha256'],'attachmentMappingSha256':hashlib.sha256((KIT/'replacement-mapping.json').read_bytes()).hexdigest(),'sourceVisualPlacements':len(groups),'nativeTriangles':sum(len(p['triangles']) for p in groups),'verticalRaysTested':tested,'clearVerticalWitnesses':witnesses,'radialStartInwardM':1.0,'radialRaysTested':radial_tested,'clearRadialWitnesses':radial,'sourcePins':[{'id':p['id'],**p['pin']} for p in groups],'limits':['Ray witnesses identify tested open paths; absence of witnesses would not certify watertight volume.','No whole-ship gas-volume allocation or simulation mutation.','Finite body-height slab projection is not being reused as pressure proof.','Connectivity to an accepted compartment and exact seal-patch geometry require native enclosure qualification.']}
if __name__=='__main__':
 report=inspect();out=KIT/'whole-ship-gap-witnesses-a003.json'
 if out.exists():assert json.loads(out.read_text())==report,'Preserve original inspection'
 else:out.write_text(json.dumps(report,indent=2)+'\n')
 print(json.dumps({'tested':report['verticalRaysTested'],'clearWitnesses':len(report['clearVerticalWitnesses']),'radialTested':report['radialRaysTested'],'radialClear':len(report['clearRadialWitnesses']),'placements':report['sourceVisualPlacements'],'triangles':report['nativeTriangles'],'first':report['clearVerticalWitnesses'][:6],'out':str(out)}))
