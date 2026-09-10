"""Exact native end export reservations and unchanged-neighbor diagnostics."""
import hashlib,json
import numpy as np
import manifold3d as m
from qualify_usable_boundary_wall import ROOT,triangles,clipped_area,qualify_points
from qualify_usable_wall_side_bays import signature
from qualify_wayfarer_placement_interfaces import MAP,shape
from qualify_wayfarer_airlock_inlet import native_parts
DIRECTORY=ROOT/'assets/art-library/designs/shipyard.structure.usable-boundary-wall/revisions/r000/a009'

def qualify(directory=DIRECTORY):
 manifest=json.loads((directory/'delivery-manifest.json').read_text());checks=[];new=[];complete=[]
 plan=json.loads((directory/'end-plan.json').read_text())
 pocket_dir=ROOT/'assets/art-library/designs/shipyard.hull.shoulder-construction-interface/revisions/r000/a003'
 pocket_manifest=json.loads((pocket_dir/'delivery-manifest.json').read_text()) if plan.get('shoulderStructuralPockets') else None
 originals={p['sourcePlacedId']:p for p in json.loads(MAP.read_text())['preserveOriginalPlacements']}
 assert manifest['sourceMappingSha256']==hashlib.sha256(MAP.read_bytes()).hexdigest()
 oldfaces,_=triangles(ROOT/'assets/runtime/assembly/parts.glb')
 def check(name,ok,detail=None):checks.append({'name':name,'pass':bool(ok),'detail':detail})
 for part in manifest['parts']:
  path=directory/part['file'];assert hashlib.sha256(path.read_bytes()).hexdigest()==part['sha256']
  faces,_=triangles(path);position=part['originalPlacement']['position']
  check('Original placed frame retained '+part['id'],part['originalPlacement']==originals[part['sourcePlacedId']]['originalPlacement'])
  for component in part['components']:
   inverse=np.linalg.inv(np.array(component['sourceFrame']))
   native=[(name,face) for name,face in faces if name.startswith(component['nodePrefix'])]
   canonical=[(name,[(inverse@np.array([*p,1]))[:3] for p in face]) for name,face in native]
   corner='corner' in component['source']
   tx=.1875 if component['source']=='aft-corner-port' else .25
   ty=.1875 if component['source']=='aft-corner-starboard' else .25
   footprint=[[-tx,-ty],[.0625,-ty],[.0625,.0625],[-tx,.0625]] if corner else [[0,-.25],[2,-.25],[2,.0625],[0,.0625]]
   qualify_points((p for _,face in canonical for p in face),footprint,0,2.75)
   check('Complete native component reservation '+component['nodePrefix'],True)
   area=sum(clipped_area(face,[1e-6,1e-6,.187501] if corner else [-1,1e-6,.187501],[3,3,2.687499]) for _,face in canonical)
   check('New source component leaves usable side clear '+component['nodePrefix'],area<1e-12,area)
   new.append(native_parts(path,component['nodePrefix'])[0].translate(position))
  for index,name in enumerate(part['preservePartitionNodes']):
   before=[row for row in oldfaces if row[0]==name]
   after=[row for row in faces if row[0]==f"GEO-{part['id']}--retained-partition-{index:02}"]
   check('Historical interior partition geometry unchanged '+part['id'],bool(before) and signature(before)==signature(after))
  complete.append(native_parts(path)[0].translate(position))
 new=m.Manifold.batch_boolean(new,m.OpType.Add);complete=m.Manifold.batch_boolean(complete,m.OpType.Add)
 check('All new outer geometry outside nominal main usable floor',(new^m.Manifold.cube([10,18,2.499998]).translate([-5,-9,.187501])).volume()<1e-10)
 conflicts=[];contacts=[]
 for ident,p in originals.items():
  is_equipment=ident.startswith(('equipment-','cargo-'))
  is_armor=ident.startswith('superstructure-') or ident.startswith('pilot-r005-outer-')
  is_pilot=ident.startswith('pilot-') and not is_armor
  if not (is_equipment or is_armor or is_pilot):continue
  if pocket_manifest and ident.startswith(('pilot-r005-outer-shoulder-transition-','pilot-r005-outer-roof-collar-')):
   kind='shoulder' if 'shoulder-transition' in ident else 'collar'
   asset=next(a for a in pocket_manifest['exports'] if a['id']==kind);path=pocket_dir/asset['file']
   assert hashlib.sha256(path.read_bytes()).hexdigest()==asset['sha256']
   other=native_parts(path)[0]
   if p['originalPlacement']['flipped']:other=other.scale([-1,1,1])
   assert p['originalPlacement']['rotation']==0
   other=other.translate(p['originalPlacement']['position'])
   pin={'path':str(path.relative_to(ROOT)),'sha256':asset['sha256'],'placedFrameUnchanged':p['originalPlacement']}
  else:other,pin=shape(p)
  if (new.bounding_box()[3]<other.bounding_box()[0] or new.bounding_box()[0]>other.bounding_box()[3]):continue
  overlap=(complete^other).volume()
  if is_equipment or is_armor:
   label='Candidate armor at unchanged frame ' if pocket_manifest and ident.startswith('pilot-r005-') else 'Unchanged '+('equipment ' if is_equipment else 'armor ')
   check(label+ident+' clear',overlap<1e-9,overlap)
   if overlap>1e-9:conflicts.append({'sourcePlacedId':ident,'overlapM3':overlap,'sourcePin':pin})
  elif overlap>1e-9:
   contact={'sourcePlacedId':ident,'overlapM3':overlap,'sourcePin':pin,'status':'Native contact requiring role/mating qualification; not automatically accepted.'}
   if pocket_manifest and ident in ['pilot-r004-corner-buttress-17','pilot-r004-corner-buttress-18']:
    sign=1 if ident.endswith('-17') else -1
    low=[4.9375 if sign>0 else -5.115,9,.1875];high=[5.115 if sign>0 else -4.9375,9.25,2.75]
    patch=m.Manifold.cube([b-a for a,b in zip(low,high)]).translate(low)
    spill=((complete^other)-patch).volume()
    check('Native structural contact confined to declared shoulder mate '+ident,spill<1e-10 and overlap>1e-5,{'nativeOverlapM3':overlap,'outsideMateM3':spill,'mateMinM':low,'mateMaxM':high,'allowedRoles':['outward-structural-corner','native-R006-structural-buttress'],'strengthRating':None})
    contact.update(status='Qualified geometric contact for these exact native source pins only; no general overlap exemption or strength rating.',mateMinM=low,mateMaxM=high)
   contacts.append(contact)
 # Combined existing/corrected source contacts, not nominal room labels.
 for x,y in [(-2,-4),(2,-4),(-2,4),(2,4),(-1,-4),(0,-4),(1,-4)]:
  for kind in ['floor','roof']:
   ident=f'{kind}-{x}-{y}';surface,pin=shape(originals[ident]);overlap=(new^surface).volume()
   check('Actual unchanged '+kind+' bearing '+ident,overlap>1e-5,{'nativeOverlapM3':overlap,'sourcePin':pin})
 if json.loads((directory/'end-plan.json').read_text()).get('reuseUnchangedNativeShoulderBoundaries'):
  for sign,ident in [(1,'pilot-r004-corner-buttress-17'),(-1,'pilot-r004-corner-buttress-18')]:
   shoulder,pin=shape(originals[ident]);x=3 if sign>0 else -5
   coupon=m.Manifold.cube([2,.10,2.49]).translate([x,8.97,.1975])
   def paths(body):
    return [c for c in (coupon-body).decompose() if c.bounding_box()[1]<8.970001 and c.bounding_box()[4]>9.069999]
   check('Exact unchanged R006 shoulder closes front boundary '+ident,not paths(shoulder),{'sourcePin':pin})
   check('Removing R006 shoulder leaves genuine opening '+ident,bool(paths(m.Manifold())))
   # Around the actual perpendicular side-wall/buttress interface: a path
   # from interiorX to exteriorX must not appear at their native Y=9 join.
   seam=m.Manifold.cube([.4,.08,2.48]).translate([4.9 if sign>0 else -5.3,8.96,.2])
   def seam_paths(body):
    left=4.9 if sign>0 else -5.3
    return [c for c in (seam-body).decompose() if c.bounding_box()[0]<left+1e-6 and c.bounding_box()[3]>left+.4-1e-6]
   check('Corrected side joins exact R006 shoulder '+ident,not seam_paths(new+shoulder))
   if pocket_manifest:
    gap=m.Manifold.cube([.4,.002,2.48]).translate([4.9 if sign>0 else -5.3,9.001,.2])
    check('Actual2mm gap through shoulder connector remains open '+ident,bool(seam_paths((new+shoulder)-gap)))
   else:
    check('Positive2mm shoulder separation remains open '+ident,bool(seam_paths(new+shoulder.translate([0,.002,0]))))
 return {'schema':'sidereal.usable-wall-end-qualification.v1','pass':all(c['pass'] for c in checks),'checks':checks,'conflicts':conflicts,'pilotContacts':contacts,'placedTransformsChanged':0,'wholeHullSealed':False,'installed':False,'remaining':['Qualify floor/roof/corner/end surface joins and all reported native pilot contacts.','Retained partial-height partitions remain separate closure work.']}
if __name__=='__main__':
 result=qualify();p=DIRECTORY/'qualification-a002.json'
 if p.exists():assert json.loads(p.read_text())==result
 else:p.write_text(json.dumps(result,indent=2)+'\n')
 print(json.dumps({'pass':result['pass'],'checks':len(result['checks']),'failures':[c for c in result['checks'] if not c['pass']],'pilotContacts':result['pilotContacts']}))
