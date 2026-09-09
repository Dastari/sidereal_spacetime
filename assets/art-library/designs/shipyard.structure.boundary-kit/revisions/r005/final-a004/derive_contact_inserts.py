import json,sys,hashlib,math,copy,struct
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path('.runtime/construction-boundary-kit/python-libs').resolve()))
from shapely.geometry import Polygon
from shapely.ops import unary_union
from shapely.affinity import rotate,translate
from shapely import constrained_delaunay_triangles
src=Path('.runtime/construction-boundary-kit/r004/validate_family.py').read_text();exec(src[src.index('class GLB:'):src.index('kit=GLB(')])
OUT=Path('.runtime/construction-boundary-kit/r005/candidate-a001');R=Path('assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r004/family');plan=json.load(open(R/'interfaces.json'));audit=json.load(open(R/'floor-roof-contact-audit.json'));floor=GLB('assets/runtime/assembly/floor/r002/kit.glb');fm=dict(floor.meshes());parts={p['id']:p for p in plan['parts']};defs=json.load(open('packages/content/src/construction-floor-interfaces.json'));by={p['id']:p for p in defs['parts']}
def place(poly,p):return translate(rotate(poly,p.get('quarterTurns',0)*90,origin=(0,0)),p['originUnits'][0]/32,p['originUnits'][1]/32)
def local(poly,p):return rotate(translate(poly,-p['originUnits'][0]/32,-p['originUnits'][1]/32),-p.get('quarterTurns',0)*90,origin=(0,0))
def polys(p):return [p]if p.geom_type=='Polygon'else list(p.geoms)if hasattr(p,'geoms')else[]
fixtures=copy.deepcopy(plan['fixtures'])
for a in audit['fixtures'][16:]:
 f=copy.deepcopy(next(f for f in fixtures if f['id']==('single-square-2m'if a['fixture'].startswith('audit-square')else'mixed-orthogonal-T')));f['id']=a['fixture'];f['nativeFloors']=a['floorPlacements'];fixtures.append(f)
family={};maps=[]
for f in fixtures:
 wall=unary_union([place(Polygon(parts[p['partId']]['corePolygonM']),p)for p in f['placements']]);placements=[]
 for i,fp in enumerate(f['nativeFloors']):
  mask=local(wall,fp);tr=np.concatenate([g['tris']for g in fm[fp['native']['nodePrefix']]]);norm=np.cross(tr[:,1]-tr[:,0],tr[:,2]-tr[:,0]);bevel=tr[(norm[:,2]>np.linalg.norm(norm,axis=1)*.01)&(np.min(tr[:,:,2],axis=1)<.1875-1e-7)]
  patches=[]
  for ti,t in enumerate(bevel):
   poly=Polygon(t[:,:2]);area=poly.intersection(mask)
   if area.area<1e-12:continue
   coef=np.linalg.solve(np.column_stack((t[:,:2],np.ones(3))),t[:,2])
   for pp in polys(area):
    for ct in polys(constrained_delaunay_triangles(pp)):
     xy=list(ct.exterior.coords)[:-1]
     if len(xy)!=3 or ct.area<1e-12:continue
     xyz=[[x,y,min(.1875,float(coef[0]*x+coef[1]*y+coef[2]))]for x,y in xy]
     if max(.1875-p[2]for p in xyz)<1e-8:continue
     patches.append({'nativeFloorTriangle':ti,'nativeFloorTriangleVerticesM':t.tolist(),'bottomTriangleM':xyz,'topZ':.1875,'planAreaM2':ct.area,'volumeM3':ct.area*sum(.1875-p[2]for p in xyz)/3})
  # Canonical signature is exact native floor kind plus local under-wall core mask. Translation/rotation are explicit placement, no scale.
  region=unary_union([Polygon(np.array(p['bottomTriangleM'])[:,:2])for p in patches]);sig={'floorPartId':fp['partId'],'patches':[[[round(x,9)for x in v]for v in p['bottomTriangleM']]for p in patches]};key='base-'+hashlib.sha256(json.dumps(sig,sort_keys=True).encode()).hexdigest()[:16]
  if not patches:continue
  family.setdefault(key,{'id':key,'floorPartId':fp['partId'],'floorNativeSelector':fp['native']['nodePrefix'],'patches':patches,'underWallMaskWktM':mask.wkt,'planAreaM2':region.area,'volumeM3':sum(p['volumeM3']for p in patches),'patchOverlapM2':sum(p['planAreaM2']for p in patches)-region.area,'sourceSignature':sig})
  placements.append({'key':f['id']+'/floor-base/'+str(i),'partId':key,'originUnits':fp['originUnits'],'quarterTurns':fp['quarterTurns'],'sourceFloorIndex':i})
 maps.append({'id':f['id'],'nativeFloors':f['nativeFloors'],'nativeWalls':f['placements'],'nominalPolygonUnits':f['nominalPolygonUnits'],'placements':placements})
report={'schema':'sidereal.native-floor-wall-contact-kit.v1','revision':'r005','floorGlbSha256':hashlib.sha256(floor.bytes).hexdigest(),'boundaryInterfacesSha256':hashlib.sha256((R/'interfaces.json').read_bytes()).hexdigest(),'floorTopM':.1875,'maximumNativeBevelDropM':max(.1875-v[2]for p in family.values()for q in p['patches']for v in q['bottomTriangleM']),'parts':list(family.values()),'fixtures':maps,'limits':['Each exact source floor/mask signature is a bounded native authored family member; no generic floor-seal flag.','Physical inserts fill actual upward bevel faces clipped under core polygons only, retaining native floor and walk height.','No capacity, HP, pressure/flow or damage rating inferred.','Exact top-plane and bottom native triangle contact proof required after GLB export; this JSON alone is not proof.']}
(OUT/'contact-plan.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'parts':len(family),'patches':sum(len(p['patches'])for p in family.values()),'fixtures':len(maps),'maxDrop':report['maximumNativeBevelDropM'],'maxOverlap':max(p['patchOverlapM2']for p in family.values())}))
