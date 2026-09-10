"""Actual expanded native side-wall exports; retained partitions are not seal claims."""
from collections import Counter
import hashlib
import json
import numpy as np
import manifold3d as m
from qualify_usable_boundary_wall import ROOT, triangles, clipped_area, qualify_points
from qualify_wayfarer_placement_interfaces import MAP, shape
from qualify_wayfarer_airlock_inlet import native_parts

DIRECTORY=ROOT/'assets/art-library/designs/shipyard.structure.usable-boundary-wall/revisions/r000/a006'

def signature(faces):
    return Counter(tuple(sorted(tuple(round(v,6) for v in point) for point in face)) for _,face in faces)

def qualify():
    manifest=json.loads((DIRECTORY/'delivery-manifest.json').read_text())
    plan=json.loads((DIRECTORY/'side-bay-plan.json').read_text())
    assert hashlib.sha256(MAP.read_bytes()).hexdigest()==manifest['sourceMappingSha256']
    original={p['sourcePlacedId']:p for p in json.loads(MAP.read_text())['preserveOriginalPlacements']}
    legacy=ROOT/manifest['legacyPartitionsSource']
    assert hashlib.sha256(legacy.read_bytes()).hexdigest()==manifest['legacyPartitionsSha256']
    legacy_faces,legacy_doc=triangles(legacy)
    checks=[]; bodies={}; new_bodies={}
    def check(name,ok,detail=None): checks.append({'name':name,'pass':bool(ok),'detail':detail})
    for part in manifest['parts']:
        path=DIRECTORY/part['file']; assert hashlib.sha256(path.read_bytes()).hexdigest()==part['sha256']
        faces,doc=triangles(path)
        inverse=np.linalg.inv(np.array(part['sourceFrame']))
        new=[(name,[(inverse@np.array([*p,1]))[:3] for p in face]) for name,face in faces if '--native-' in name]
        qualify_points((p for _,face in new for p in face),[[0,-.25],[2,-.25],[2,.0625],[0,.0625]],0,2.75)
        check('New complete surfaces fit reserved source frame '+part['id'],True)
        area=sum(clipped_area(face,[-1,1e-6,.187501],[3,3,2.687499]) for _,face in new)
        check('New native faces leave usable floor clear '+part['id'],area<1e-12,area)
        for retained in part['preservedPartitions']:
            old=[row for row in legacy_faces if row[0]==retained['sourceNode']]
            current=[row for row in faces if row[0]==retained['exportNode']]
            check('Exact historical partition triangles retained '+part['id'],len(old)>0 and signature(old)==signature(current),{'original':len(old),'new':len(current)})
            oldnode=next(n for n in legacy_doc['nodes'] if n['name']==retained['sourceNode'])
            newnode=next(n for n in doc['nodes'] if n['name']==retained['exportNode'])
            oldm={legacy_doc['materials'][p['material']]['name'] for p in legacy_doc['meshes'][oldnode['mesh']]['primitives']}
            newm={doc['materials'][p['material']]['name'] for p in doc['meshes'][newnode['mesh']]['primitives']}
            check('Historical partition material roles retained '+part['id'],oldm==newm,{'original':sorted(oldm),'new':sorted(newm)})
        placement=part['originalPlacement']
        check('Original placement identity/frame unchanged '+part['id'],placement==original[part['sourcePlacedId']]['originalPlacement'])
        assert placement['rotation']==0 and not placement['flipped']
        bodies[part['sourcePlacedId']]=native_parts(path)[0].translate(placement['position'])
        new_bodies[part['sourcePlacedId']]=native_parts(path,part['nodePrefix']+'native-')[0].translate(placement['position'])
    for pair in plan['pairs']:
        ids=[pair['exteriorId'],pair['interiorId']]
        body=bodies[ids[0]]+bodies[ids[1]]
        new=new_bodies[ids[0]]+new_bodies[ids[1]]
        for role in ['Floor','Roof']:
            unchanged,_=shape(original[pair['unchanged'+role]])
            overlap=(new^unchanged).volume()
            check('Native '+role.lower()+' contact '+ids[0],overlap>1e-4,overlap)
        armor,_=shape(original[pair['unchangedArmor']])
        check('Unchanged armor clear '+ids[0],(body^armor).volume()<1e-10)
        x,y,_=pair['originalInteriorPlacement']['position']
        locker_id=f'equipment-locker-{-4.7 if x<0 else 4.7:g}-{y:g}'
        if locker_id in original:
            locker,_=shape(original[locker_id]); overlap=(body^locker).volume()
            check('Unchanged complete locker clear '+locker_id,overlap<1e-10,{'overlapM3':overlap,'gapM':body.min_gap(locker,.1)})
    # Native end faces must close actual straight-bay seams. Positive gaps
    # remain an explicit failed-control: no geometric gap bridging is allowed.
    for side in range(2):
        for index in range(6):
            left,right=plan['pairs'][side*7+index:side*7+index+2]
            a=new_bodies[left['exteriorId']]; b=new_bodies[right['exteriorId']]
            y=(left['originalInteriorPlacement']['position'][1]+right['originalInteriorPlacement']['position'][1])/2
            x=-5.30 if side==0 else 4.90
            coupon=m.Manifold.cube([.4,.08,1]).translate([x,y-.04,.7])
            def leaks(walls):
                return [v.volume() for v in (coupon-walls).decompose()
                        if v.bounding_box()[0]<x+1e-6 and v.bounding_box()[3]>x+.4-1e-6]
            check('Actual native neighboring seam closed '+left['exteriorId'],not leaks(a+b))
            check('Positive2mm seam gap remains open '+left['exteriorId'],bool(leaks(a+b.translate([0,.002,0]))))
    check('28 unique replacement identities retain262 originals',len(bodies)==28 and len(original)==262)
    return {'schema':'sidereal.usable-wall-side-qualification.v1','pass':all(c['pass'] for c in checks),'checks':checks,
            'installed':False,'ownerFinalSignoff':None,'wholeShipPressureQualified':False,
            'remaining':['End groups, shoulder junctions, native internal partition interfaces and full closure remain required.','No gameplay collision or damage registration; retained partition geometry remains historical.']}

if __name__=='__main__':
    result=qualify();path=DIRECTORY/'qualification-a002.json'
    if path.exists(): assert json.loads(path.read_text())==result
    else: path.write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({'pass':result['pass'],'checks':len(result['checks']),'failures':[c for c in result['checks'] if not c['pass']]}))
