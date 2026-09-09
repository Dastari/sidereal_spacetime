"""Exact native inlet CSG and attachment checks. No authority/assembly mutation."""
import sys, json, hashlib, re
from pathlib import Path
import numpy as np, trimesh, manifold3d as m
from shapely.geometry import Polygon, box
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r006'))
from native_csg import solid
from qualify_wayfarer_airlock_attachment import placed
ROT=np.array([[1,0,0,0],[0,0,-1,0],[0,1,0,0],[0,0,0,1]])
def native_parts(path,prefix=None):
 scene=trimesh.load(path,force='scene');pieces=[];triangles=0;groups={}
 for name in scene.graph.nodes_geometry:
  if prefix and not name.startswith(prefix):continue
  matrix,geometry=scene.graph[name];mesh=scene.geometry[geometry].copy();mesh.apply_transform(ROT@matrix);triangles+=len(mesh.faces)
  groups.setdefault(re.sub(r'_[0-9a-f]{6}$','',name),[]).append(mesh)
 for name,fragments in groups.items():
  mesh=trimesh.util.concatenate(fragments)
  # Same micrometre rounding policy as existing native boundary qualification.
  mesh.vertices=np.round(mesh.vertices,6);mesh.merge_vertices(merge_tex=True,merge_norm=True)
  part=m.Manifold(m.Mesh64(np.asarray(mesh.vertices),np.asarray(mesh.faces,dtype=np.uint64)))
  if part.status()==m.Error.NoError:pieces.append(part)
  else:
   # Native legacy GLBs join disconnected authored meshes in one draw group.
   # Split by native face adjacency without adding/filling any geometry.
   parent=list(range(len(mesh.faces)))
   def find(i):
    while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
    return i
   for a,b in mesh.face_adjacency:parent[find(int(a))]=find(int(b))
   groups={}
   for i in range(len(mesh.faces)):groups.setdefault(find(i),[]).append(i)
   for ids in groups.values():
    faces=np.asarray(mesh.faces)[ids];vertices,inverse=np.unique(faces,return_inverse=True)
    part=m.Manifold(m.Mesh64(np.asarray(mesh.vertices)[vertices],np.asarray(inverse.reshape(-1,3),dtype=np.uint64)))
    if part.status()!=m.Error.NoError:
     points=np.asarray(mesh.vertices)[vertices]
     assert np.linalg.matrix_rank(points-points[0],tol=1e-7)<=2,(name,len(ids),part.status())
     # Coplanar native decal/surface, no enclosed volume; cannot certify a seal.
     continue
    pieces.append(part)
 return m.Manifold.batch_boolean(pieces,m.OpType.Add),triangles

def qualify(directory):
 manifest=json.loads((directory/'delivery-manifest.json').read_text());audit_path=ROOT/'assets/art-library/designs/shipyard.structure.external-airlock/revisions/r000/audit-a007.json'
 assert hashlib.sha256(audit_path.read_bytes()).hexdigest()=='eb7eab8523d68906a302a84cf06a5b2a507229d15e89fb96f66d1ade8b6e0aa6'
 audit=json.loads(audit_path.read_text());checks=[];pins=[];new={}
 def check(name,ok,detail=None):checks.append({'name':name,'pass':bool(ok),'detail':detail})
 for p in manifest['parts']:
  path=directory/p['file'];assert hashlib.sha256(path.read_bytes()).hexdigest()==p['sha256']
  body,tri=native_parts(path);new[p['id']]=body.translate(p['anchorCommonM']);pins.append({**p,'nativeTriangleCount':tri})
 source=json.loads((ROOT/'.runtime/wayfarer-semantic-candidate-r001/placements.json').read_text());byid={p['sourcePlacedId']:p for p in source}
 check('Exactly three replacements keep original transforms',all(p['worldPositionM']==byid[p['replacesSourcePlacedId']]['originalPlacement']['position'] and p['rotation']==byid[p['replacesSourcePlacedId']]['originalPlacement']['rotation'] and p['flipped']==byid[p['replacesSourcePlacedId']]['originalPlacement']['flipped'] for p in pins if p['replacesSourcePlacedId']) and len([p for p in pins if p['replacesSourcePlacedId']])==3)
 check('Original262 placement records preserved',len(source)==262)
 replaced={p['replacesSourcePlacedId'] for p in pins if p['replacesSourcePlacedId']}
 check('Cockpit floor roof cargo unchanged',all(not id.startswith(('pilot-','floor-','roof-','cargo-')) for id in replaced))
 kit=m.Manifold.batch_boolean(list(new.values()),m.OpType.Add)
 check('All native visual meshes are valid solids',kit.status()==m.Error.NoError)
 # Supported route through inlet; door mechanism at x2 remains separately governed.
 body=m.Manifold.cylinder(1.8,.3/np.cos(np.pi/64),circular_segments=64).translate([0,1,.187501])
 route=m.Manifold.batch_hull([body.translate([-1.4,0,0]),body.translate([1.35,0,0])])
 check('Continuous radius300mm height1800mm inlet body sweep', (kit^route).volume()<1e-10,{'intersectionM3':(kit^route).volume(),'fromM':[-1.4,1,.1875],'toM':[1.35,1,.1875]})
 # Robust negative control: reinstating the old candidate back wall must obstruct.
 back=audit['placements'][26];assert back['source']=='wall' and back['originM']==[0,2,0]
 oldback=solid(back['source'],back['nodePrefix']).rotate([0,0,90*back['quarterTurns']]).translate(back['originM'])
 check('Original closed backwall negative control blocks inlet',((kit+oldback)^route).volume()>.01)
 original_parts=[solid(p['source'],p['nodePrefix']).rotate([0,0,90*p['quarterTurns']]).translate(p['originM']) for i,p in enumerate(audit['placements']) if i!=26]
 attached=m.Manifold.batch_boolean(original_parts+list(new.values()),m.OpType.Add)
 # Existing floor/roof surfaces, exact source hash checked by placed(). Convert
 # triangles to separate disconnected native solids before union (overlaps allowed).
 source_pins=[];surfaces=[]
 for id in ['floor-2--2','roof-2--2','roof-3--2']:
  _,pin=placed(byid[id]);original=byid[id]['originalPlacement'];assert not original['flipped']
  shape,_=native_parts(ROOT/pin['path'],pin['nodePrefix'])
  shape=shape.rotate([0,0,original['rotation']*180/np.pi]).translate(np.array(original['position'])-np.array([5,-5,0]))
  surfaces.append(shape);source_pins.append(pin)
 attached=m.Manifold.batch_boolean([attached]+surfaces,m.OpType.Add)
 check('Body route clear with actual unchanged floor and roofs',(attached^route).volume()<1e-10,{'intersectionM3':(attached^route).volume()})
 floor=Polygon()
 for contour in attached.slice(.1875-1e-8).to_polygons():floor=floor.symmetric_difference(Polygon(contour))
 corridor=box(-1.4,.7,1.35,1.3)
 check('Continuous actual floor support across old/new seam',corridor.difference(floor.buffer(1e-6)).area<1e-10,{'unsupportedM2':corridor.difference(floor.buffer(1e-6)).area,'boundsM':list(corridor.difference(floor.buffer(1e-6)).bounds),'geometry':corridor.difference(floor.buffer(1e-6)).wkt})
 # Native physical riser covers full312.5mm offset across2m width.
 riser,tri=native_parts(directory/'stepped-roof.glb','GEO-inlet-stepped-roof--sealed-height-riser')
 check('Actual312.5mm roof step contact core',tri==12 and np.allclose(riser.bounding_box(),[-.0625,0,2.6875,.0625,2,3.125],atol=1e-8) and abs(riser.volume()-.125*2*.4375)<1e-10,{'boundsM':riser.bounding_box(),'nativeTriangles':tri,'volumeM3':riser.volume()})
 check('Missing transition negative control cannot reach new roof',new['structural-aperture'].bounding_box()[5]<3)
 # Source floor/roof are preserved; overlap is intentional contact not changed
 # geometry. Volumetric roof overlaps cannot establish whole-ship sealing.
 roof_contact=[]
 for suffix in ['sealed-height-riser','lower-contact-lap','upper-contact-lap']:
  shape,_=native_parts(directory/'stepped-roof.glb','GEO-inlet-stepped-roof--'+suffix);roof_contact.append(shape)
 roof_contact=m.Manifold.batch_boolean(roof_contact,m.OpType.Add)
 oldroof=m.Manifold.batch_boolean(surfaces[1:],m.OpType.Add)
 check('Native roof transition contacts old roof',(oldroof^roof_contact).volume()>1e-5,{'contactM3':(oldroof^roof_contact).volume()})
 newroof=m.Manifold.batch_boolean([solid(p['source'],p['nodePrefix']).rotate([0,0,90*p['quarterTurns']]).translate(p['originM']) for p in audit['placements'] if p['source']=='roof'],m.OpType.Add)
 check('Native roof transition contacts new roof',(newroof^roof_contact).volume()>1e-5,{'contactM3':(newroof^roof_contact).volume()})
 # Both closed doors: only the bounded chamber must remain sealed, as inlet is
 # deliberately open to an as-yet-unqualified Wayfarer interior.
 closed=attached
 for origin,q in [([2,0,-1e-8],1),([6,2,-1e-8],3)]:closed=closed+solid('gasket','GEO-door-perimeter-seal--surface').rotate([0,0,q*90]).translate(origin)
 void=m.Manifold.cube([12,4,5]).translate([-3,-1,-1])-closed
 cavities=[c for c in void.decompose() if c.volume()>.001 and c.bounding_box()[0]>1.5 and c.bounding_box()[3]<6.2]
 check('New composed native chamber remains sealed',len(cavities)==1,[{'volumeM3':c.volume(),'boundsM':c.bounding_box()} for c in cavities])
 # Derive fresh cell volumes after changes, never reuse old fixture volume.
 volumes=[]
 for y in range(2):
  for x in range(2,6):
   prism=m.Manifold.cube([1,1,2.8125]).translate([x,y,.1875]);free=(prism-attached).volume();excluded=(prism^attached).volume()
   volumes.append({'x':x,'y':y,'freeM3':free,'excludedM3':excluded})
   check('New native chamber volume accounting '+str((x,y)),0<free<2.8125 and abs(free+excluded-2.8125)<1e-8)
 return {'schema':'sidereal.wayfarer-airlock-inlet-qualification.v1','status':'qualified-local-native-candidate' if all(c['pass'] for c in checks) else 'failed-local-native-candidate','pass':all(c['pass'] for c in checks),'newParts':pins,'oldSourcePins':source_pins,'airlockAuditSha256':hashlib.sha256(audit_path.read_bytes()).hexdigest(),'omittedNewAirlockParts':[26],'chamberFreeVolumes':volumes,'checks':checks,'coordinateRoundingM':.000001,'gasketContactRoundingM':.00000001,'limitations':['No whole Wayfarer pressure seal or gas-neighbor authority qualification.','No final artistic approval, runtime registration, installed browser evidence or live refit.','Visual material response confers no armor/strength/power rating.','Full hinge-sweep combination and external landing egress authority remain separately governed by native airlock contract.']}
if __name__=='__main__':
 directory=ROOT/sys.argv[1];report=json.loads(json.dumps(qualify(directory)));output=directory/'native-qualification.json'
 if output.exists():assert json.loads(output.read_text())==report,'Do not overwrite a changed qualification'
 else:output.write_text(json.dumps(report,indent=2)+'\n')
 print(json.dumps({'pass':report['pass'],'checks':len(report['checks']),'failed':[c for c in report['checks'] if not c['pass']],'output':str(output)}))
 if not report['pass']:raise SystemExit(1)
