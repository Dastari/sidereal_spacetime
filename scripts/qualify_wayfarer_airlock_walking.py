"""Native3D body-slab silhouettes for a conservative source-qualified adapter."""
from native_source_paths import checkout_source_path
import sys,json,hashlib
import numpy as np,manifold3d as m
import shapely
from shapely.geometry import Polygon
from shapely.ops import unary_union
from qualify_wayfarer_airlock_inlet import ROOT,native_parts
sys.path.insert(0,str(ROOT/'assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r006'))
from native_csg import solid
KIT=ROOT/'assets/art-library/designs/shipyard.structure.wayfarer-airlock-inlet/revisions/r000/a003'
slab=m.Manifold.cube([20,10,1.8-1e-6]).translate([-5,-4,.187501])
def project(shape):
 occupied=shape^slab
 if occupied.is_empty():return [],0
 outlines=m.CrossSection(occupied.project().to_polygons(),m.FillRule.Positive).to_polygons()
 polygon=Polygon()
 for contour in outlines:polygon=polygon.symmetric_difference(Polygon(contour))
 assert polygon.is_valid
 # Each connected component becomes its convex cover. This is conservative:
 # detail concavities may reject extra space, but disconnected door jambs never
 # merge across the aperture. Verify containment before serialization.
 components=[polygon] if isinstance(polygon,Polygon) else list(polygon.geoms)
 covers=[part.convex_hull for part in components if part.area>1e-12]
 actual=unary_union(covers) if covers else Polygon()
 assert polygon.difference(actual.buffer(1e-10)).area<1e-10
 assert len(covers)<=32,('Native source exceeds existing authority shape budget',len(covers))
 return [[[float(x+5),float(y-5)] for x,y in list(part.exterior.coords)[:-1]] for part in covers],float(polygon.area)

def qualify():
 rows=[];pins=[]
 for p in json.loads((KIT/'delivery-manifest.json').read_text())['parts']:
  path=KIT/p['file'];assert hashlib.sha256(path.read_bytes()).hexdigest()==p['sha256'];shape,_=native_parts(path);shape=shape.translate(p['anchorCommonM']);triangles,area=project(shape)
  rows.append({'sourcePlacedId':p['replacesSourcePlacedId'] or 'candidate-wayfarer-airlock-inlet-'+p['id'],'role':p['id'],'nativeSourceSha256':p['sha256'],'classification':'native-body-slab-obstacle' if triangles else 'proved-outside-body-slab','areaM2':area,'obstacles':[{'vertices':t} for t in triangles],'nativeBoundsCommonM':list(shape.bounding_box()),'dynamicDoorPart':False})
  pins.append({'path':str(path.relative_to(ROOT)),'sha256':p['sha256']})
 audit_path=ROOT/'assets/art-library/designs/shipyard.structure.external-airlock/revisions/r000/audit-a007.json';assert hashlib.sha256(audit_path.read_bytes()).hexdigest()=='eb7eab8523d68906a302a84cf06a5b2a507229d15e89fb96f66d1ade8b6e0aa6';audit=json.loads(audit_path.read_text())
 for i,p in enumerate(audit['placements']):
  if i==26:continue
  pin=audit['sourcePins'][p['source']];assert hashlib.sha256(checkout_source_path(pin['path'], ROOT).read_bytes()).hexdigest()==pin['sha256'];shape=solid(p['source'],p['nodePrefix']).rotate([0,0,90*p['quarterTurns']]).translate(p['originM']);triangles,area=project(shape)
  rows.append({'sourcePlacedId':f'candidate-extended-new-vestibule-native-{i}','role':p['source'],'sourcePartIndex':i,'nativeSourceSha256':pin['sha256'],'classification':'native-body-slab-obstacle' if triangles else 'proved-outside-body-slab','areaM2':area,'obstacles':[{'vertices':t} for t in triangles],'nativeBoundsCommonM':list(shape.bounding_box()),'dynamicDoorPart':p['nodePrefix'] in ['GEO-door-leaf--surface','GEO-door-perimeter-seal--surface']})
  if pin not in pins:pins.append(pin)
 return {'schema':'sidereal.wayfarer-airlock-native-walking.v1','status':'qualified-isolated-source-projection-not-registered','bodyRadiusM':.3,'bodyHeightM':1.8,'bodySlabCommonM':[.187501,1.9875],'sourcePins':pins,'rows':rows,'method':'Actual native solid intersection with accepted body slab, positive-fill XY silhouette, separate connected-component convex covers with containment check; disjoint jambs remain separate. Existing source wall/floor precision policy unchanged.','dynamicPolicy':'Closed leaf/gasket projections are spawn-state only; replace all four dynamic parts from accepted physical hinge/morph state on every door change. Never omit a moving leaf merely because opening.passable becomes true.','limits':['Caller-supplied colliders are not accepted; authority must pin exact document and this proof.','Negative clearance is conservative around visible shallow details; no fitted-collider shrink.','No whole-ship sealing or damage qualification.']}
if __name__=='__main__':
 report=qualify();out=KIT/'native-walking-projection-v2.json'
 if out.exists():assert json.loads(out.read_text())==report,'Preserve native qualification history'
 else:out.write_text(json.dumps(report,indent=2)+'\n')
 print(json.dumps({'rows':len(report['rows']),'obstacles':sum(len(r['obstacles']) for r in report['rows']),'dynamicParts':sum(r['dynamicDoorPart'] for r in report['rows']),'out':str(out)}))
