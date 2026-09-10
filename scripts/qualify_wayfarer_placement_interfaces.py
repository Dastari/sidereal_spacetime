"""Read-only, source-pinned structural/equipment fit audit. Never edits live transforms."""
import json,hashlib,math
from pathlib import Path
import manifold3d as m
from qualify_wayfarer_airlock_inlet import ROOT,native_parts
MAP=ROOT/'assets/art-library/designs/shipyard.structure.wayfarer-airlock-inlet/revisions/r000/a003/replacement-mapping.json'
cache={}
def shape(p):
 v=p['visual'];o=p['originalPlacement'];path=ROOT/'assets/runtime'/v['url'].removeprefix('/assets/')if v else ROOT/'assets/runtime/assembly/parts.glb';prefix=v.get('nodePrefix')if v else'GEO-'+p['assetId']+'--';sha=v['sha256']if v else hashlib.sha256(path.read_bytes()).hexdigest();key=(str(path),prefix,sha)
 if key not in cache:
  assert hashlib.sha256(path.read_bytes()).hexdigest()==sha
  cache[key]=native_parts(path,prefix)[0]
 body=cache[key];body=body.scale([-1,1,1])if o['flipped']else body
 return body.rotate([0,0,o['rotation']*180/math.pi]).translate(o['position']),{'path':str(path.relative_to(ROOT)),'sha256':sha,'nodePrefix':prefix}
def overlap_bounds(a,b):return all(min(a[i+3],b[i+3])-max(a[i],b[i])>1e-7 for i in range(3))
def audit():
 mapping=json.loads(MAP.read_text());parts=mapping['preserveOriginalPlacements'];walls=[];equipment=[];pins=[]
 for p in parts:
  if p['role']not in ['structural-wall-unqualified','interior-partition-unqualified','interior-equipment','cargo-container']:continue
  body,pin=shape(p);entry={'placedId':p['sourcePlacedId'],'assetId':p['assetId'],'role':p['role'],'body':body,'boundsM':body.bounding_box(),'source':pin,'transform':p['originalPlacement']}
  (equipment if p['role']in['interior-equipment','cargo-container']else walls).append(entry)
 reports=[]
 for item in equipment:
  conflicts=[]
  for wall in walls:
   if not overlap_bounds(item['boundsM'],wall['boundsM']):continue
   shared=item['body']^wall['body'];volume=shared.volume()
   if volume>1e-7:conflicts.append({'structuralPlacedId':wall['placedId'],'nativeIntersectionVolumeM3':volume,'intersectionBoundsM':shared.bounding_box(),'structuralBoundsM':wall['boundsM'],'structuralSource':wall['source'],'classification':'equipment-penetration-needs-corrected-authored-envelope-and-mating-socket'})
  p={k:v for k,v in item.items()if k!='body'};p['conflicts']=conflicts
  p['minimumSignedClearanceFromNominalPortStarboardEdgeM']=min(item['boundsM'][0]+5,5-item['boundsM'][3])
  reports.append(p)
 return {'schema':'sidereal.wayfarer-placement-interface-audit.v1','sourceMappingSha256':hashlib.sha256(MAP.read_bytes()).hexdigest(),'originalPlacementCount':len(parts),'transformsChanged':0,'currentNominalMainFloorBoundaryM':{'minX':-5,'maxX':5,'aftY':-9,'foreShoulderY':9,'moduleM':2,'deckTopM':.1875},'policy':{'structuralOverlap':'Allowed only at explicit hidden source-qualified floor/wall/roof contacts. It is not equipment clearance permission.','equipment':'Actual native mesh penetration is invalid without an explicit type-compatible attachment socket. An AABB/contact-only test is insufficient.','visibleCoplanarity':'Requires separate same-facing native face/decal-layer analysis; this volumetric audit must not claim z-fighting validation.','armor':'Separate outward-facing mounting layer; must not silently redefine interior wall clearance.','migration':'Correct native asset revisions and reserved envelopes at unchanged placement datums first. No inward-offset compensation. Preserve stable placed IDs and all live state; later refit uses expected revisions.'},'equipment':reports,'placementCompensationRejected':True,'invalidEquipmentPlacedIds':[p['placedId']for p in reports if p['conflicts']],'publishedFitQualified':not any(p['conflicts']for p in reports)}
if __name__=='__main__':
 r=audit();out=ROOT/'.runtime/wayfarer-placement-interface-audit.json';out.write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({'equipment':len(r['equipment']),'invalidEquipmentPlacedIds':r['invalidEquipmentPlacedIds'],'lockers':[p for p in r['equipment']if'locker'in p['placedId']],'out':str(out)}))
