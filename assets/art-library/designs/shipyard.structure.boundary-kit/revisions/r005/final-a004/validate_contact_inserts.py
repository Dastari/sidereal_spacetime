import json,struct,math,sys,hashlib
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path('.runtime/construction-boundary-kit/python-libs').resolve()))
from shapely.geometry import Polygon,LineString
from shapely.ops import unary_union
from shapely.affinity import rotate,translate
src=Path('.runtime/construction-boundary-kit/r004/validate_family.py').read_text();exec(src[src.index('class GLB:'):src.index('kit=GLB(')])
P=Path(sys.argv[1]);plan=json.load(open(P/'contact-plan.json'));kit=GLB(P/'kit.glb');km=dict(kit.meshes());floor=GLB('assets/runtime/assembly/floor/r002/kit.glb');fm=dict(floor.meshes());wall=GLB('assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r004/family/kit.glb');wm=dict(wall.meshes());boundary=json.load(open('assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r004/family/interfaces.json'));bp={p['id']:p for p in boundary['parts']};checks=[]
def ck(n,ok,d=None):checks.append({'name':n,'pass':bool(ok),'details':d})
def tris(gs):return np.concatenate([g['tris']for g in gs])
def project(ts,z):return unary_union([Polygon(t[:,:2])for t in ts if max(abs(t[:,2]-z))<1e-7 and Polygon(t[:,:2]).area>1e-12])
def place(poly,p):return translate(rotate(poly,p.get('quarterTurns',0)*90,origin=(0,0)),p['originUnits'][0]/32,p['originUnits'][1]/32)
def comps(p):return [p]if p.geom_type=='Polygon'else list(p.geoms)if hasattr(p,'geoms')else[]
tops={};reports=[]
for p in plan['parts']:
 name='GEO-boundary-r005-'+p['id']+'--surface';gs=km[name];t=tris(gs);top=project(t,.1875);tops[p['id']]=top;expected=unary_union([Polygon(np.array(q['bottomTriangleM'])[:,:2])for q in p['patches']]);volume=abs(float(np.einsum('ij,ij->i',t[:,0],np.cross(t[:,1],t[:,2])).sum()/6));err=top.symmetric_difference(expected).area
 ck(p['id']+' exact top footprint and unchanged walking datum',err<1e-6 and float(t[:,:,2].max())<=.1875+1e-7,err)
 ck(p['id']+' native closed wedge volume',abs(volume-p['volumeM3'])<2e-9,{'actualM3':volume,'expectedM3':p['volumeM3']})
 ck(p['id']+' native normal UV tangent attributes',all(all(k in g['attrs']for k in ['NORMAL','TANGENT','TEXCOORD_0'])for g in gs))
 edges={}
 for tri in t:
  for a,b in zip(tri,np.roll(tri,-1,axis=0)):
   av=tuple(round(float(x),8)for x in a);bv=tuple(round(float(x),8)for x in b)
   if av==bv:continue
   k=tuple(sorted((av,bv)));n,d=edges.get(k,(0,0));edges[k]=(n+1,d+(1 if av<bv else-1))
 ck(p['id']+' closed oriented native compound solids',all(n%2==0 and d==0 for n,d in edges.values()),{'badEdges':sum(n%2!=0 or d!=0 for n,d in edges.values()),'sharedInternalContactFaces':'retained; disjoint wedge interiors, no positive volume overlap'})

 # Every downward face must coincide with one actual source bevel triangle (not an ideal plane).
 ns=np.cross(t[:,1]-t[:,0],t[:,2]-t[:,0]);down=t[ns[:,2]<-np.linalg.norm(ns,axis=1)*.01];bad=[];maxdist=0
 for tri in down:
  found=False
  for q in p['patches']:
   st=np.array(q['nativeFloorTriangleVerticesM']);norm=np.cross(st[1]-st[0],st[2]-st[0]);norm/=np.linalg.norm(norm);dist=float(np.max(abs((tri-st[0])@norm)))
   if dist<2e-7 and Polygon(st[:,:2]).buffer(2e-7).covers(Polygon(tri[:,:2])):found=True;maxdist=max(maxdist,dist);break
  if not found:bad.append(tri.tolist())
 ck(p['id']+' bottom lies on actual native floor triangles',not bad,{'bad':len(bad),'maxPlaneDistanceM':maxdist})
 reports.append({'partId':p['id'],'triangles':len(t),'topAreaM2':top.area,'topMismatchM2':err,'volumeM3':volume,'bottomContactMaxPlaneDistanceM':maxdist})
ft={n:project(tris(gs),.1875)for n,gs in fm.items()};wt={n:project(tris(gs),.1875)for n,gs in wm.items()};frows=[]
for f in plan['fixtures']:
 wp=unary_union([place(wt['GEO-boundary-r004-'+p['partId']+'--surface'],p)for p in f['nativeWalls']]);fp=unary_union([place(ft[p['native']['nodePrefix']],p)for p in f['nativeFloors']]);it=unary_union([place(tops[p['partId']],p)for p in f['placements']]);nom=Polygon(np.array(f['nominalPolygonUnits'])/32);nominalwall=unary_union([place(Polygon(bp[p['partId']]['corePolygonM']),p)for p in f['nativeWalls']]);rooms=[r for r in comps(nom.difference(nominalwall))if r.area>1e-4];vac=nom.buffer(2).difference(nom)
 def paths(contact):
  missing=wp.difference(contact);out=[]
  for c in comps(missing):
   if c.area<1e-8:continue
   touched=[i for i,r in enumerate(rooms)if c.buffer(1e-6).intersection(r.boundary).length>1e-4];ext=c.intersection(vac).area>1e-8
   if touched and(ext or len(touched)>1):out.append({'rooms':touched,'vacuum':ext,'boundsM':list(c.bounds),'areaM2':c.area})
  return out
 before=paths(fp);after=paths(unary_union([fp,it]));ck(f['id']+' no remaining under-wall vacuum or cross-room path',not after,{'beforePaths':len(before),'afterPaths':after});frows.append({'fixture':f['id'],'before':before,'after':after,'insertTopAreaM2':it.area})
ck('exact library mesh count',len(km)==len(plan['parts']));ck('no added lights/cameras',not kit.g.get('cameras')and'KHR_lights_punctual'not in kit.g.get('extensions',{}))
report={'pass':all(c['pass']for c in checks),'checks':checks,'parts':reports,'fixtures':frows,'glbSha256':hashlib.sha256(kit.bytes).hexdigest(),'floorSha256':hashlib.sha256(floor.bytes).hexdigest(),'wallSha256':hashlib.sha256(wall.bytes).hexdigest(),'limits':['Native geometric contact proof only; parent supplies explicit game flow/seal definitions.','Interface exact signatures must be matched; unknown floors/core masks remain unsupported.','Roof material/butt seam definitions remain separate.']};(P/'validation.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'pass':report['pass'],'checks':len(checks),'failed':[c for c in checks if not c['pass']]},indent=2));raise SystemExit(0 if report['pass']else 1)
