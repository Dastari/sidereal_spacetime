"""Exact native local roof interface checks; never assumes entire-ship airtightness."""
import json,hashlib,math,sys
from pathlib import Path
import numpy as np,manifold3d as m
from shapely.geometry import Polygon,box
from qualify_wayfarer_airlock_inlet import native_parts,ROOT
BASE=ROOT/'assets/art-library/designs/shipyard.structure.roof-closure/revisions/r000/a001'
MAP=ROOT/'assets/art-library/designs/shipyard.structure.wayfarer-airlock-inlet/revisions/r000/a003/replacement-mapping.json'
def qualify():
 manifest=json.loads((BASE/'delivery-manifest.json').read_text());mapping=json.loads(MAP.read_text());source={p['sourcePlacedId']:p for p in mapping['preserveOriginalPlacements']};checks=[];pins=[];solids={}
 def check(name,passed,detail=None):checks.append({'name':name,'pass':bool(passed),'detail':detail})
 for p in manifest['parts']:
  file=BASE/p['file'];assert hashlib.sha256(file.read_bytes()).hexdigest()==p['sha256'];body,n=native_parts(file);solids[p['id']]=body;check('Native closed exported '+p['id'],body.status()==m.Error.NoError and body.volume()>0,{'triangles':n,'volumeM3':body.volume()})
 for proxy in json.loads((BASE/'contact-proxies.json').read_text())['boxes']:
  part=next(p for p in manifest['parts']if p['id']==proxy['part']);body,n=native_parts(BASE/part['file'],proxy['sourceObject']);expected=m.Manifold.cube(np.array(proxy['maxM'])-proxy['minM']).translate(proxy['minM']);check('Separate proxy equals authored native core '+part['id'],n==12 and (body-expected).volume()<1e-12 and(expected-body).volume()<1e-12)
 def old(id):
  p=source[id];v=p['visual'];file=ROOT/'assets/runtime'/v['url'].removeprefix('/assets/');assert hashlib.sha256(file.read_bytes()).hexdigest()==v['sha256'];body,n=native_parts(file,v['nodePrefix']);o=p['originalPlacement'];assert not o['flipped'];pins.append({'id':id,**v,'transform':o});return body.rotate([0,0,o['rotation']*180/math.pi]).translate(o['position'])
 panelids=['roof--2--1','roof--1--1','roof--2-0','roof--1-0'];panels=[old(id)for id in panelids];roof=m.Manifold.batch_boolean(panels,m.OpType.Add);plug=solids['junction-square'].translate([-3,-1,2.6875]);patched=roof+plug
 contacts=[(plug^p).volume()for p in panels];check('Four actual roof panels overlap native junction core',all(v>1e-6 for v in contacts),contacts)
 coupon=m.Manifold.cube([.1,.1,.24]).translate([-3.05,-1.05,2.61])
 def through(shape):
  return [c.volume() for c in (coupon-shape).decompose()if c.bounding_box()[2]<2.610001 and c.bounding_box()[5]>2.849999]
 check('Original native four-panel corner has a continuous leak path',bool(through(roof)),through(roof));check('New native junction closes local continuous leak path',not through(patched),through(patched))
 # Geometry sections must cover a positive-area square, not just zero-width seam rays.
 for z in [2.687499,2.69,2.70]:
  section=Polygon()
  for contour in patched.slice(z).to_polygons():section=section.symmetric_difference(Polygon(contour))
  check('Native corner contact atZ'+str(z),box(-3.04,-1.04,-2.96,-.96).difference(section).area<1e-10)
 high=old('roof--1-3');low=old('pilot-context-vestibule-roof-0');step=solids['step-rail-2m'].translate([-3,7,2.6875]);check('Native step rail contacts actual62.5mm roof datum change',(step^high).volume()>1e-5 and(step^low).volume()>1e-5,{'oldM3':(step^high).volume(),'lowerM3':(step^low).volume()})
 check('Minimum new underside remains above1.8m body on highest50mm threshold',min(s.bounding_box()[2]+2.625 for s in solids.values())>.1875+.05+1.8)
 return {'schema':'sidereal.roof-closure-native-qualification.v1','pass':all(c['pass']for c in checks),'checks':checks,'sourcePins':pins,'nativeKitManifestSha256':hashlib.sha256((BASE/'delivery-manifest.json').read_bytes()).hexdigest(),'originalMappingSha256':hashlib.sha256(MAP.read_bytes()).hexdigest(),'roundingM':.000001,'limits':['Local positive-area/native-connected-void interfaces only; no entire Wayfarer gas-volume authority claimed.','Old four-panel leak is an explicit negative control; no added or repaired old triangles.','Original roof/cockpit/armor/floor/equipment placements remain unchanged.','Damage/pressure ratings and final owner artistic signoff remain separate.']}
if __name__=='__main__':
 r=json.loads(json.dumps(qualify()));out=BASE/'native-qualification.json'
 if out.exists():assert json.loads(out.read_text())==r,'Do not overwrite changed qualification'
 else:out.write_text(json.dumps(r,indent=2)+'\n')
 print(json.dumps({'pass':r['pass'],'checks':len(r['checks']),'failed':[c for c in r['checks']if not c['pass']],'out':str(out)}));sys.exit(0 if r['pass']else 1)
