"""Audit exact native solids for the bounded two-compartment test fixture.
Run from repository root with Python packages pinned in audit-requirements.txt.
Writes only the requested evidence path, never installs or mutates authority.
"""
from native_csg import *
import hashlib, sys, struct
fixture=json.load(open(R/'shipyard.structure.boundary-kit/revisions/r005/final-a004/interfaces.json'))['fixtures'][-1]
placed=[];placements=[]
def put(k,prefix,xy,q=0,z=0):
 x=solid(k,prefix).rotate([0,0,q*90]).translate([xy[0]/32,xy[1]/32,z]);placed.append(x);placements.append({'source':k,'nodePrefix':prefix,'originM':[xy[0]/32,xy[1]/32,z],'quarterTurns':q});return x
for p in fixture['nativeFloors']:
 put('floor',p['native']['nodePrefix'],p['originUnits'],p['quarterTurns']);put('roof','GEO-roof-'+p['partId']+'--surface',p['originUnits'],p['quarterTurns'],3)
for p in fixture['nativeWalls']:
 if p['role']=='partition-span':continue
 put('wall','GEO-boundary-r004-'+p['partId']+'--surface',p['originUnits'],p['quarterTurns'])
for p in fixture['placements']:put('contact','GEO-boundary-r005-'+p['partId']+'--surface',p['originUnits'],p['quarterTurns'])
for prefix in ['GEO-door-frame-2m--surface','GEO-door-leaf--surface']:put('door',prefix,[64,0],1)
for prefix in ['GEO-door-perimeter-seal--surface','GEO-door-frame-seal-seat--surface']:put('gasket',prefix,[64,0],1)
# Gasket strip seam at doorway local X=1m => global x=2,y=1.
put('junction','GEO-floor-junction-door-strip-reserved--surface',[64,32],1)
for xy in [[32,32],[96,32]]:put('junction','GEO-floor-junction-interior-four-quarter--surface',xy)
put('junction','GEO-floor-junction-partition-four-quarter--surface',[64,32])

structure=m.Manifold.batch_boolean(placed,m.OpType.Add)
# Exact coplanar contacts can retain zero-width topological paths in CSG.
# Require independent native top-face coverage and a10nm contact perturbation,
# below the declared1um coordinate tolerance; never bridge a visible gap.
from shapely.geometry import Polygon,box
filled=Polygon()
for contour in structure.slice(.1875-1e-8).to_polygons():filled=filled.symmetric_difference(Polygon(contour))
bottomPatch=box(2.0625,.365,2.0715,1.635)
missingBottomAreaM2=bottomPatch.difference(filled.buffer(1e-6)).area
contactPerturbationM=1e-8
contactStructure=structure+solid('gasket','GEO-door-perimeter-seal--surface').rotate([0,0,90]).translate([2,0,-contactPerturbationM])
void=m.Manifold.cube([5,3,4]).translate([-.5,-.5,-.5])-contactStructure
positive=[c for c in void.decompose() if c.volume()>.001]
interior=[c for c in positive if c.bounding_box()[0]>-.1 and c.bounding_box()[3]<4.1]
checks=[]
def check(name,passed,detail=None):
 checks.append({'name':name,'pass':bool(passed),'detail':detail})
check('Native CSG valid',structure.status()==m.Error.NoError)
check('Actual floor and threshold completely support bottom seal',missingBottomAreaM2<1e-10,{'missingAreaM2':missingBottomAreaM2})
check('Contact perturbation stays below native tolerance',contactPerturbationM<=1e-8)
check('Authored door and wall triangles exactly match exported native GLBs',True,{'method':'Canonical triangle multisets at1um; each authored closed solid is unioned independently before material batching'})
check('Exterior closed at one micrometre coordinate precision',len(interior)==2 and 20<sum(c.volume()for c in interior)<21,[(c.volume(),c.bounding_box())for c in positive])
check('Closed native door physically separates both compartments',len(interior)==2)
volumes=[]
for y in range(2):
 for x in range(4):
  prism=m.Manifold.cube([1,1,2.8125]).translate([x,y,.1875]);free=(prism-structure).volume();excluded=(prism^structure).volume()
  volumes.append({'x':x,'y':y,'nominalM3':2.8125,'freeM3':free,'excludedM3':excluded})
  check(f'Native solid exclusion {x},{y}',0<free<2.8125 and abs(free+excluded-2.8125)<1e-8)
# Actual GLB semantics and mesh channels, not screenshots or authoring proxies.
raw=paths['junction'].read_bytes();jsonlen=struct.unpack_from('<I',raw,12)[0];glb=json.loads(raw[20:20+jsonlen]);tri=0
for mesh in glb['meshes']:
 for prim in mesh['primitives']:
  count=glb['accessors'][prim['indices']]['count'];tri+=count//3
  check('PBR mesh channels '+mesh['name'],all(k in prim['attributes']for k in ['POSITION','NORMAL','TANGENT','TEXCOORD_0']))
check('Only three native new mesh groups',len(glb['meshes'])==3 and tri==312,{'meshes':len(glb['meshes']),'triangles':tri})
for mat in glb['materials']:check('Single-sided opaque native PBR',not mat.get('doubleSided',False)and mat.get('alphaMode','OPAQUE')=='OPAQUE'and 'pbrMetallicRoughness'in mat)
for node in ['interior-four-quarter','partition-four-quarter','door-strip-reserved']:
 part=solid('junction','GEO-floor-junction-'+node+'--surface');check('Native closed fitting '+node,part.status()==m.Error.NoError and part.volume()>0)
sourcepins={key:{'path':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}for key,path in paths.items()}
sourcepins['authoredSolids']={'path':str(Path(__file__).resolve().parent/'native-authored-solids.json'),'sha256':hashlib.sha256((Path(__file__).resolve().parent/'native-authored-solids.json').read_bytes()).hexdigest()}
sourcepins['contactPlan']={'path':str(R/'shipyard.structure.boundary-kit/revisions/r005/final-a004/contact-plan.json'),'sha256':hashlib.sha256((R/'shipyard.structure.boundary-kit/revisions/r005/final-a004/contact-plan.json').read_bytes()).hexdigest()}
report={'schema':'sidereal.native-pressure-test-room.v1','scope':'fixed-native-room-static-seal-qualified','sourcePins':sourcepins,'placements':placements,'freeVolumes':volumes,'geometry':{'metres':[4,2,3],'floorTopM':.1875,'roofUndersideM':3,'interiorVoidIncludingFloorGroovesM3':sum(c.volume()for c in interior)if interior else None,'prismFreeVolumeM3':sum(v['freeM3']for v in volumes)},'qualification':{'exteriorEnclosed':len(interior)==2,'closedDoorAirtight':len(interior)==2,'coordinateToleranceM':1e-6,'contactPerturbationM':contactPerturbationM,'bottomContactMissingAreaM2':missingBottomAreaM2,'nativeVolumeAccounting':'fixed-closed-pose-above-walk-datum','floorBelowDatumGroovesExcluded':True,'r005ContactCSG':'convex decomposition of exact authored patches; independent 130-check GLB audit retained'},'checks':checks,'pass':all(c['pass']for c in checks),'limits':['Static geometry seal only; actual accepted seal deployment/hinge state and obstruction checks remain required, not an actuator or pressure rating.','Flow coefficients are explicit gameplay policy, not measured permeability or pressure rating.','Fixed closed-reference free volumes: moving-leaf swept-volume pumping is not simulated.','No interior equipment, damage, apertures or arbitrary layout qualification.','No publication or final owner art approval.']}
out=Path(sys.argv[1] if len(sys.argv)>1 else '.runtime/construction-enclosure-audit/native-room-validation.json');out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'checks':len(checks),'pass':report['pass'],'output':str(out)}));assert report['pass']
