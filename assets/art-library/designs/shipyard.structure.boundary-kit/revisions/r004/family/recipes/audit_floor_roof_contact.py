import json,struct,math,sys,hashlib,copy
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path('.runtime/construction-boundary-kit/python-libs').resolve()))
from shapely.geometry import Polygon,LineString
from shapely.ops import unary_union
from shapely.affinity import rotate,translate
src=Path('.runtime/construction-boundary-kit/r004/validate_family.py').read_text();exec(src[src.index('class GLB:'):src.index('kit=GLB(')])
P=Path(sys.argv[1]);plan=json.loads((P/'family-plan.json').read_text());parts={p['id']:p for p in plan['parts']};kit=GLB(P/'kit.glb');floor=GLB('assets/runtime/assembly/floor/r002/kit.glb');roof=GLB('assets/art-library/designs/shipyard.structure.roof-kit/revisions/r001/kit.glb');km=dict(kit.meshes());fm=dict(floor.meshes());rm=dict(roof.meshes());defs=json.load(open('packages/content/src/construction-floor-interfaces.json'));by={p['id']:p for p in defs['parts']}
def project(groups,z,coreOnly=False):
 tris=np.concatenate([g['tris']for g in groups if not coreOnly or g['mat']=='MAT-boundary-r004-core']);polys=[]
 for t in tris:
  if np.max(abs(t[:,2]-z))>1e-7:continue
  p=Polygon(t[:,:2])
  if p.area>1e-12:polys.append(p)
 return unary_union(polys)
core={pid:project(km['GEO-boundary-r004-'+pid+'--surface'],.1875,p['kind']=='span')for pid,p in parts.items()};floortop={n:project(g,.1875)for n,g in fm.items()};roofbottom={n:project(g,0)for n,g in rm.items()}
def place(poly,p):return translate(rotate(poly,p.get('quarterTurns',0)*90,origin=(0,0)),p['originUnits'][0]/32,p['originUnits'][1]/32)
def components(p):return [p]if p.geom_type=='Polygon'else list(p.geoms)if hasattr(p,'geoms')else[]
def quarter(x,y):p=by['quarter-1m'];return {'partId':p['id'],'originUnits':[x*32,y*32],'quarterTurns':0,'native':p['native']}
fixtures=copy.deepcopy(plan['fixtures']);f=copy.deepcopy(next(f for f in fixtures if f['id']=='single-square-2m'));f['id']='audit-square-four-quarter-seams';f['nativeFloors']=[quarter(x,y)for x in range(2)for y in range(2)];fixtures.append(f);f=copy.deepcopy(next(f for f in fixtures if f['id']=='mixed-orthogonal-T'));f['id']='audit-T-eight-quarter-seams';f['nativeFloors']=[quarter(x,y)for x in range(4)for y in range(2)];fixtures.append(f)
reports=[]
for f in fixtures:
 wall=unary_union([place(core[p['partId']],p)for p in f['placements']]);nominalwall=unary_union([place(Polygon(parts[p['partId']]['corePolygonM']),p)for p in f['placements']]);fp=unary_union([place(floortop[p['native']['nodePrefix']],p)for p in f['nativeFloors']]);rp=unary_union([place(roofbottom['GEO-roof-'+p['partId']+'--surface'],p)for p in f['nativeFloors']]);nominal=Polygon(np.array(f['nominalPolygonUnits'])/32);rooms=[g for g in components(nominal.difference(nominalwall))if g.area>.0001];vacuum=nominal.buffer(2).difference(nominal)
 def audit(surface):
  contact=wall.intersection(surface);missing=wall.difference(surface);regions=[]
  for c in components(missing):
   if c.area<1e-8:continue
   # Contact-path detection is conservative at1micrometre geometric tolerance, not a flow solver.
   touched=[]
   for i,r in enumerate(rooms):
    length=c.buffer(1e-6).intersection(r.boundary).length
    if length>1e-4:touched.append({'roomIndex':i,'accessibleBoundaryLengthM':length})
   exterior=c.intersection(vacuum).area>1e-8
   if touched:regions.append({'unsupportedPlanAreaM2':c.area,'roomContacts':touched,'connectsOutsideNominalFloor':exterior,'potentialCrossRoomPath':len(touched)>1,'potentialVacuumPath':exterior,'boundsM':list(c.bounds)})
  return {'fullWallFaceAreaM2':wall.area,'nativeCoplanarContactAreaM2':contact.area,'unsupportedFaceAreaM2':missing.area,'contactFraction':contact.area/wall.area,'roomVoidComponents':regions,'potentialRoomToVacuumPaths':sum(r['potentialVacuumPath']for r in regions),'potentialCrossRoomPaths':sum(r['potentialCrossRoomPath']for r in regions),'certifiedSeal':False}
 bottom=audit(fp);top=audit(rp);reports.append({'fixture':f['id'],'floorPlacements':f['nativeFloors'],'floorWallBottom':bottom,'roofWallTop':top,'interiorRegions':len(rooms),'wallCoreFootprintAreaM2':wall.area})
# Actual source upper-face bevel values, excluding underside geometry.
sourceDepths={}
for p in defs['parts']:
 tris=np.concatenate([g['tris']for g in fm[p['native']['nodePrefix']]]);cross=np.cross(tris[:,1]-tris[:,0],tris[:,2]-tris[:,0]);up=tris[cross[:,2]>1e-12];sourceDepths[p['id']]={'highestSurfaceM':float(up[:,:,2].max()),'lowestUpwardBevelVertexM':float(up[:,:,2].min()),'maximumUpwardBevelDropM':.1875-float(up[:,:,2].min())}
report={'schema':'sidereal.native-boundary-contact-audit.v1','kitSha256':hashlib.sha256(kit.bytes).hexdigest(),'floorSha256':hashlib.sha256(floor.bytes).hexdigest(),'roofSha256':hashlib.sha256(roof.bytes).hexdigest(),'method':'Actual GLB horizontal triangle unions at floorZ.1875 and roof undersideZ0, placed at wall top3; intersect actual exported wall face polygons. Nominal room regions from structural footprints, not room labels. Unsupported-region connectivity flags conservative potential paths; no flow/pressure rating.','exportToleranceM':1e-6,'fixtures':reports,'floorBevelDepths':sourceDepths,'interpretation':['Partial full-face support alone does not prove a leak: centered perimeter walls extend outside the nominal floor. A continuous interior contact strip may still enclose a single tile; contact geometry and seam permeability require separate functional validation.','Multi-tile transverse bevel troughs can connect room space under perimeter/partition walls despite perfect planar wall joins. Positive path flags require a continuous native contact/base adapter, not a generic sealed=true flag.','Roof underside is flat over each exact footprint; outboard half of centered wall top is not covered by these roofs. Butt seam and continuous interior strip verification still require explicit approved contact definitions.','r003 door-strip insert is local and does not resolve arbitrary wall-base crossings.','No geometry-derived pressure strength, conductance, initial gas or material approval.']};(P/'floor-roof-contact-audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps([{'id':r['fixture'],'floorContactFraction':r['floorWallBottom']['contactFraction'],'floorVacuumPaths':r['floorWallBottom']['potentialRoomToVacuumPaths'],'floorCrossRoomPaths':r['floorWallBottom']['potentialCrossRoomPaths'],'roofContactFraction':r['roofWallTop']['contactFraction'],'roofVacuumPaths':r['roofWallTop']['potentialRoomToVacuumPaths']}for r in reports],indent=2))
