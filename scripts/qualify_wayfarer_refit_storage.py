"""Read-only qualification of a proposed extra preserved fuel-root placement.
Native vertex convex covers conservatively prove separation, not load ratings.
Never changes the exact Wayfarer source, installed art, or database.
"""
from pathlib import Path
import hashlib,json,math
from shapely.geometry import Polygon,box
from shapely.ops import unary_union
from qualify_wayfarer_walking import geometry, ROOT, CANDIDATE, LEGACY

FUEL_PATH='assets/art-library/designs/cargo.fluid-fuel.medium/revisions/r001/appearances/fuel/glb.glb'
FUEL_SHA='a2f9fca902c7df08f3e8bad348d09034df8f26d9c248d0d912558886aa2eecf6'

def qualify(position=(-3.0,7.0)):
 x0,y0=position
 folder=ROOT/'.runtime/wayfarer-semantic-candidate-r001'
 raw=(folder/'document.json').read_text().rstrip('\n')
 assert hashlib.sha256(raw.encode()).hexdigest()==CANDIDATE
 doc=json.loads(raw);placements=json.loads((folder/'placements.json').read_text())
 floor=unary_union([Polygon([(x/32,y/32)for x,y in t['vertices']])for t in doc['layout']['tiles']])
 reservation=box(x0-.5,y0-.5,x0+.5,y0+.5)
 assert floor.covers(reservation),'Proposed reservation lacks complete nominal floor support'
 fuel=geometry(FUEL_PATH,FUEL_SHA,None)
 fuel_points=[(x+x0,y+y0,z+.1875)for _,vs in fuel for x,y,z in vs]
 lo=min(p[2]for p in fuel_points);hi=max(p[2]for p in fuel_points)
 footprint=Polygon([(x,y)for x,y,z in fuel_points]).convex_hull
 assert reservation.covers(footprint),'Fuel visual exceeds conservative reservation'
 collisions=[]; artifacts={FUEL_PATH:FUEL_SHA};checked=0
 for p in placements:
  original=p['originalPlacement'];v=p['visual']
  path='assets/runtime/'+v['url'].removeprefix('/assets/') if v else 'assets/runtime/assembly/parts.glb'
  sha=v['sha256']if v else LEGACY;prefix=v.get('nodePrefix')if v else 'GEO-'+p['assetId']+'--'
  groups=geometry(path,sha,prefix);artifacts[path]=sha
  c,s=math.cos(original['rotation']),math.sin(original['rotation'])
  for name,coords in groups:
   pts=[]
   for x,y,z in coords:
    if original['flipped']:x=-x
    pts.append((original['position'][0]+c*x-s*y,original['position'][1]+s*x+c*y,original['position'][2]+z))
   checked+=1
   if min(p[2]for p in pts)>=hi-1e-6 or max(p[2]for p in pts)<=lo+1e-6:continue
   projected=Polygon([(x,y)for x,y,z in pts]).convex_hull
   if projected.intersection(footprint).area>1e-10:collisions.append({'placement':p['sourcePlacedId'],'mesh':name})
 assert not collisions, f'Native conservative overlap: {collisions}'
 return {'schema':'sidereal.refit-fuel-layout-proof.v1','baseSha256':CANDIDATE,'assetSha256':FUEL_SHA,'positionM':[x0,y0,.1875],
  'reservationM':[1,1],'approachM':[-1.875,7],'nativeHeightRangeM':[lo,hi], 'checkedNativeGroups':checked,
  'nativeVolumeSeparation':True,'nominalFloorCoverage':True,'artifacts':artifacts,
  'pending':['mount/support load interface','authoritative liquid attachment and transfer','actual browser placement/reach review'],
  'doesNotAuthorizeLiveRefit':True}
if __name__=='__main__':
 import argparse
 parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path);args=parser.parse_args()
 proof=qualify();text=json.dumps(proof,indent=2)+'\n'
 if args.output:args.output.write_text(text)
 print(json.dumps({k:v for k,v in proof.items()if k!='artifacts'}))
