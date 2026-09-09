import json,struct,sys,math,hashlib
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path('.runtime/construction-boundary-kit/python-libs').resolve()))
from shapely.geometry import Polygon
from shapely.ops import unary_union
from shapely import constrained_delaunay_triangles
P=Path(sys.argv[1]);plan=json.loads((P/'family-plan.json').read_text());src=Path('.runtime/construction-boundary-kit/r004/validate_family.py').read_text();exec(src[src.index('class GLB:'):src.index('kit=GLB(')]);kit=GLB(P/'kit.glb');meshes=dict(kit.meshes());rows=[]
def coords(p):
 q=list(p.exterior.coords)[:-1]
 if sum(a[0]*b[1]-a[1]*b[0]for a,b in zip(q,q[1:]+q[:1]))<0:q=q[::-1]
 idx=min(range(len(q)),key=lambda i:q[i]);return [list(v)for v in q[idx:]+q[:idx]]
for p in plan['parts']:
 poly=Polygon(p['corePolygonM']);pieces=[poly]if abs(poly.convex_hull.area-poly.area)<1e-12 else list(constrained_delaunay_triangles(poly).geoms);union=unary_union(pieces);areaDiff=union.symmetric_difference(poly).area;overlap=sum(t.area for t in pieces)-union.area;convex=all(t.area>1e-12 and abs(t.convex_hull.area-t.area)<1e-12 for t in pieces)
 groups=meshes['GEO-boundary-r004-'+p['id']+'--surface'];native=[]
 for g in groups:
  if p['kind']=='span'and g['mat']!='MAT-boundary-r004-core':continue
  for t in g['tris']:
   if np.max(abs(t[:,2]-.1875))<1e-7:
    q=Polygon(t[:,:2])
    if q.area>1e-12:native.append(q)
 nativeDiff=unary_union(native).symmetric_difference(poly).area;ok=convex and areaDiff<1e-12 and abs(overlap)<1e-12 and nativeDiff<1e-6
 rows.append({'partId':p['id'],'role':'structural-core','sourceCorePolygonM':p['corePolygonM'],'convexPolygonsM':sorted([coords(t)for t in pieces]),'bottomM':.1875,'topM':3,'proof':{'sourceAreaM2':poly.area,'proxyUnionAreaM2':union.area,'symmetricDifferenceM2':areaDiff,'positiveOverlapM2':max(0,overlap),'allConvex':convex,'nativeExportSymmetricDifferenceM2':nativeDiff,'pass':ok}})
r={'schema':'sidereal.native-boundary-collision-proxy.v1','revision':'r004','nativeGlbSha256':hashlib.sha256(kit.bytes).hexdigest(),'source':'Explicit nominal structural core polygons validated against actual native GLB; convex decomposition is a separate authority proxy, not visual source','coreThicknessM':.09375,'decorativeStraightEnvelopeM':.125,'decorativeSkinIncluded':False,'acuteNodeMiterExtentsIncluded':True,'units':'metres in exact part-local BlenderXY; apply placement quarterTurns and origin once, preserve deck identity','parts':rows,'pass':all(r['proof']['pass']for r in rows),'limits':['Does not include decorative wall skin thickness outside structural core; renderer outer skin is up to.125m nominal width while core is.09375m.','Core union equality is nominal exact within1e-12m²; actual float32 native fit within1e-6m².','Authority adapter must use all polygons and explicit deck/height; no live collision changes made here.','Door leaf/seal and floor/roof collision are separate definitions.']};(P/'collision-proxies.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({'pass':r['pass'],'parts':len(rows),'polygons':sum(len(r['convexPolygonsM'])for r in rows),'maxNativeDiff':max(r['proof']['nativeExportSymmetricDifferenceM2']for r in rows)},indent=2));raise SystemExit(0 if r['pass']else 1)
