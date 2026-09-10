"""Source-pinned native wall/shoulder overlap qualification; no whole-hull claim."""
import json,hashlib,math,sys
import numpy as np
import manifold3d as m
from qualify_roof_closure import MAP,BASE
from qualify_wayfarer_airlock_inlet import ROOT,native_parts

def qualify():
 originals={p['sourcePlacedId']:p for p in json.loads(MAP.read_text())['preserveOriginalPlacements']};checks=[];pins=[]
 def check(name,value,detail=None):checks.append({'name':name,'pass':bool(value),'detail':detail})
 def old(key):
  p=originals[key];v=p['visual'];o=p['originalPlacement'];path=ROOT/'assets/runtime'/v['url'].removeprefix('/assets/')if v else ROOT/'assets/runtime/assembly/parts.glb';prefix=v.get('nodePrefix')if v else'GEO-'+p['assetId']+'--';sha=v['sha256']if v else hashlib.sha256(path.read_bytes()).hexdigest();assert hashlib.sha256(path.read_bytes()).hexdigest()==sha
  body,_=native_parts(path,prefix);body=body.scale([-1,1,1])if o['flipped']else body
  pins.append({'id':key,'path':str(path.relative_to(ROOT)),'sha256':sha,'prefix':prefix,'transform':o});return body.rotate([0,0,o['rotation']*180/math.pi]).translate(o['position'])
 def new(attempt,name):
  directory=BASE.parent/attempt;manifest=json.loads((directory/'delivery-manifest.json').read_text());p=next(p for p in manifest['parts']if p['id']==name);path=directory/p['file'];assert hashlib.sha256(path.read_bytes()).hexdigest()==p['sha256'];body,n=native_parts(path)
  check('Native closed authored '+name,body.status()==m.Error.NoError and body.volume()>0,{'triangles':n,'volumeM3':body.volume()});proxy=next(p for p in json.loads((directory/'contact-proxies.json').read_text())['boxes']if p['part']==name);core,count=native_parts(path,proxy['sourceObject']);box=m.Manifold.cube(np.subtract(proxy['maxM'],proxy['minM'])).translate(proxy['minM']);check('Separate proxy exactly matches native core '+name,count==12 and(core-box).volume()<1e-12 and(box-core).volume()<1e-12);pins.append({'newPart':name,'path':str(path.relative_to(ROOT)),'sha256':p['sha256']});return body
 seam=new('a002','wall-seam-2p5m').translate([3,-9,.1875]);walls=[old('wall-1--5'),old('wall-2--5')]
 check('Wall seam overlaps both original staggered rear panels',all((seam^p).volume()>1e-4 for p in walls),[(seam^p).volume()for p in walls])
 coupon=m.Manifold.cube([.08,.5,.14]).translate([2.96,-9.25,.93]);wall=m.Manifold.batch_boolean(walls,m.OpType.Add)
 def through(s):return[c.volume()for c in(coupon-s).decompose()if c.bounding_box()[1]<-9.24999 and c.bounding_box()[4]>-8.75001]
 check('Original rear wall midsection remains a sealed control',not through(wall),through(wall));check('Native wall companion closes that local path',not through(wall+seam),through(wall+seam))
 shoulder=new('a003','shoulder-panel-0p5m')
 for side,partition,buttress in [(-1,'pilot-r004-rear-partition-23','pilot-r004-corner-buttress-18'),(1,'pilot-r004-rear-partition-24','pilot-r004-corner-buttress-17')]:
  # Resolve actual recorded IDs rather than assume renamed revisions.
  assert partition in originals and buttress in originals
  panel=shoulder.translate([side*2.8125,9,.1875]);neighbors=[old(partition),old(buttress)];check('Shoulder overlaps original neighbors '+str(side),all((panel^p).volume()>1e-5 for p in neighbors),[(panel^p).volume()for p in neighbors])
 check('Central future doorway remains unobstructed',(shoulder.translate([-2.8125,9,.1875])^m.Manifold.cube([1.25,.8,1.8]).translate([-.625,8.6,.1875])).volume()==0 and(shoulder.translate([2.8125,9,.1875])^m.Manifold.cube([1.25,.8,1.8]).translate([-.625,8.6,.1875])).volume()==0)
 return {'schema':'sidereal.native-wall-closure-qualification.v1','pass':all(c['pass']for c in checks),'checks':checks,'pins':pins,'limits':['Local exact native overlap only; whole ship still requires finite closure validation.','Existing source placements and doorway preserved; no final art approval, ratings or runtime collision installation.']}
if __name__=='__main__':
 r=qualify();path=BASE.parent/'a003/wall-qualification-a002.json'
 if path.exists():assert json.loads(path.read_text())==json.loads(json.dumps(r))
 else:path.write_text(json.dumps(r,indent=2)+'\n')
 print(json.dumps(r));raise SystemExit(0 if r['pass']else 1)
