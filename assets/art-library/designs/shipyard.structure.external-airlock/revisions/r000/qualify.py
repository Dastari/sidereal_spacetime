"""New composite audit; never modifies source meshes or registers runtime state.
Use .runtime/construction-enclosure-python/bin/python from repository root.
"""
import sys,json,hashlib
from pathlib import Path
ROOT=next(p for p in Path(__file__).resolve().parents if (p/'PIVOT.md').is_file())
BASE=ROOT/'assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r006'
sys.path.insert(0,str(BASE))
from native_csg import solid,m,paths,scenes,rot,np,trimesh
import struct
from shapely.geometry import Polygon,box
original=json.loads((BASE/'qualification-a007/native-room-validation.json').read_text())
for name,pin in original['sourcePins'].items():
 path=Path(pin['path']);assert hashlib.sha256(path.read_bytes()).hexdigest()==pin['sha256'],name
placements=[]
for p in original['placements']:
 # Actual perpendicular perimeter span, not either corner post.
 if p['source']=='wall' and p['originM']==[4.,0.,0] and p['quarterTurns']==1:continue
 if p['source']=='wall' and 'node-ee493bf1352e' in p['nodePrefix'] and p['originM'][0]==4:
  p=dict(p);p['originM']=[6,p['originM'][1],p['originM'][2]]
 placements.append(p)
for p in original['placements']:
 if (p['source'] in ['floor','roof','contact'] and p['originM'][0] in [2,3]) or (p['source']=='wall' and 'span-' in p['nodePrefix'] and ((p['originM']==[2,0,0] and p['quarterTurns']==0) or (p['originM']==[4,2,0] and p['quarterTurns']==2))):
  q=dict(p);q['originM']=[p['originM'][0]+2,p['originM'][1],p['originM'][2]];placements.append(q)
for y in [0,2]:placements.append({'source':'wall','nodePrefix':'GEO-boundary-r004-node-a8148ac9f645--surface','originM':[4,y,0],'quarterTurns':0})
for x in [4,5]:placements.append({'source':'junction','nodePrefix':'GEO-floor-junction-interior-four-quarter--surface','originM':[x,1,0],'quarterTurns':0})
for p in original['placements']:
 if p['source'] in ['door','gasket']:
  q=dict(p);q['originM']=[6,2,p['originM'][2]];q['quarterTurns']=3;placements.append(q)
for p in original['placements']:
 if p['source']=='junction' and 'door-strip-reserved' in p['nodePrefix']:
  q=dict(p);q['originM']=[6,1,0];q['quarterTurns']=3;placements.append(q)
# Four actual floor modules form an unroofed exterior service landing. These
# are not included among sealed/free-volume cells.
for p in original['placements']:
 if p['source']=='floor' and p['originM'][0] in [2,3]:
  q=dict(p);q['originM']=[p['originM'][0]+4,p['originM'][1],p['originM'][2]];placements.append(q)
parts=[solid(p['source'],p['nodePrefix']).rotate([0,0,90*p['quarterTurns']]).translate(p['originM']) for p in placements]
structure=m.Manifold.batch_boolean(parts,m.OpType.Add)
checks=[]
def check(name,ok,detail=None):checks.append({'name':name,'pass':bool(ok),'detail':detail})
check('Native composite CSG valid',structure.status()==m.Error.NoError)
filled=Polygon()
for contour in structure.slice(.1875-1e-8).to_polygons():filled=filled.symmetric_difference(Polygon(contour))
for x in [2,6]:
 patch=box(2.0625,.365,2.0715,1.635) if x==2 else box(5.9285,.365,5.9375,1.635)
 area=patch.difference(filled.buffer(1e-6)).area
 check('Actual bottom gasket contact at x='+str(x),area<1e-10,{'missingM2':area})
contact=structure
for origin,q in [([2,0,-1e-8],1),([6,2,-1e-8],3)]:contact=contact+solid('gasket','GEO-door-perimeter-seal--surface').rotate([0,0,q*90]).translate(origin)
void=m.Manifold.cube([9,3,4]).translate([-.5,-.5,-.5])-contact
positive=[c for c in void.decompose() if c.volume()>.001]
interior=[c for c in positive if c.bounding_box()[0]>-.1 and c.bounding_box()[3]<6.2]
check('Two native cavities separated from exterior',len(interior)==2,[(c.volume(),c.bounding_box())for c in positive])
# Evaluate the actual exported SealRetracted morph target and accepted -90deg
# hinge transform, not an omitted leaf or invented Boolean aperture.
def morph_solid(prefix):
 raw=paths['gasket'].read_bytes();n=struct.unpack_from('<I',raw,12)[0];g=json.loads(raw[20:20+n]);b=raw[28+n:]
 def accessor(index):
  a=g['accessors'][index];v=g['bufferViews'][a['bufferView']];width={'SCALAR':1,'VEC3':3}[a['type']];dt={5126:np.float32,5125:np.uint32,5123:np.uint16}[a['componentType']]
  offset=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',np.dtype(dt).itemsize*width)
  return np.ndarray((a['count'],width),dtype=dt,buffer=b,offset=offset,strides=(stride,np.dtype(dt).itemsize)).copy()
 pieces=[]
 for node in g['nodes']:
  if not node.get('name','').startswith(prefix) or 'mesh' not in node:continue
  transform=rot@scenes['gasket'].graph[node['name']][0]
  for primitive in g['meshes'][node['mesh']]['primitives']:
   pos=accessor(primitive['attributes']['POSITION'])+accessor(primitive['targets'][0]['POSITION'])
   world=(np.c_[pos,np.ones(len(pos))]@transform.T)[:,:3]
   faces=accessor(primitive['indices']).reshape(-1,3)
   native=trimesh.Trimesh(vertices=np.round(world,6),faces=faces,process=False);native.merge_vertices(merge_tex=True,merge_norm=True)
   mesh=m.Manifold(m.Mesh64(np.asarray(native.vertices),np.asarray(native.faces,dtype=np.uint64)));assert mesh.status()==m.Error.NoError
   pieces.append(mesh)
 return m.Manifold.batch_boolean(pieces,m.OpType.Add)
retracted=morph_solid('GEO-door-perimeter-seal--surface')
check('Actual exported retracted gasket is closed valid native geometry',retracted.status()==m.Error.NoError and retracted.volume()>0)
for inner_open,outer_open,expected in [(True,False,1),(False,True,1),(True,True,0)]:
 active=[]
 for p in placements:
  opens=inner_open if p['originM'][0]==2 else outer_open if p['originM'][0]==6 else False
  moving=p['nodePrefix'] in ['GEO-door-leaf--surface','GEO-door-perimeter-seal--surface']
  part=retracted if opens and p['nodePrefix']=='GEO-door-perimeter-seal--surface' else solid(p['source'],p['nodePrefix'])
  if opens and moving:part=part.translate([-.3125,.0625,0]).rotate([0,0,-90]).translate([.3125,-.0625,0])
  active.append(part.rotate([0,0,90*p['quarterTurns']]).translate(p['originM']))
 for origin,q,opens in [([2,0,-1e-8],1,inner_open),([6,2,-1e-8],3,outer_open)]:
  if not opens:active.append(solid('gasket','GEO-door-perimeter-seal--surface').rotate([0,0,q*90]).translate(origin))
 open_structure=m.Manifold.batch_boolean(active,m.OpType.Add)
 components=(m.Manifold.cube([9,3,4]).translate([-.5,-.5,-.5])-open_structure).decompose()
 cavities=[c for c in components if c.volume()>.001 and c.bounding_box()[0]>-.1 and c.bounding_box()[3]<6.2]
 check(f'Actual hinge/morph portals inner={inner_open} outer={outer_open}',len(cavities)==expected,[(c.volume(),c.bounding_box())for c in cavities])
 # Full-height capsule-radius cylinder swept along the exact doorway centreline.
 # Hinge sweeps are separately reserved; this checks accepted fully-open travel.
 if inner_open and outer_open:
  body=m.Manifold.cylinder(1.8,.3/np.cos(np.pi/64),circular_segments=64).translate([0,1,.187501])
  swept=m.Manifold.batch_hull([body.translate([1,0,0]),body.translate([7,0,0])])
  worst=(open_structure ^ swept).volume()
  check('Accepted fully-open supported centreline clears native structure',worst<1e-10,{'maxIntersectionM3':worst,'radiusM':.3,'heightM':1.8,'pathM':[[1,1],[7,1]],'method':'continuous convex-hull sweep, circumscribed64-sided radius proxy'})


volumes=[]
for y in range(2):
 for x in range(6):
  prism=m.Manifold.cube([1,1,2.8125]).translate([x,y,.1875]);free=(prism-structure).volume();excluded=(prism^structure).volume()
  volumes.append({'x':x,'y':y,'freeM3':free,'excludedM3':excluded})
  check('Native volume accounting '+str((x,y)),0<free<2.8125 and abs(free+excluded-2.8125)<1e-8)
# Native actor waiting positions preserve distance from both conservative leaf
# sweep AABBs, derived from the published door contract, not inferred visually.
sweep=json.loads((ROOT/'packages/content/src/construction-boundary-interfaces.json').read_text())['door']['conservativeSweepAabbBlenderM']
from shapely.geometry import Point as ShapelyPoint
for label,x in [('interior',1),('chamber',4),('exterior',7)]:
 body=ShapelyPoint(x,1).buffer(.3)
 envelopes=[box(2-sweep['max'][1],sweep['min'][0],2-sweep['min'][1],sweep['max'][0]),box(6+sweep['min'][1],2-sweep['max'][0],6+sweep['max'][1],2-sweep['min'][0])]
 check('Supported waiting position clear of both leaf sweeps: '+label,all(not body.intersects(e)for e in envelopes),{'positionM':[x,1,.1875],'radiusM':.3})
for key,path in [('doorInterfaces',ROOT/'packages/content/src/construction-boundary-interfaces.json'),('csgHelper',BASE/'native_csg.py')]:original['sourcePins'][key]={'path':str(path.relative_to(ROOT)),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
report={'schema':'sidereal.native-external-airlock-composite-audit.v1','placements':placements,'sourcePins':original['sourcePins'],'baseAuditSha256':hashlib.sha256((BASE/'qualification-a007/native-room-validation.json').read_bytes()).hexdigest(),'geometry':{'metres':[8,2,3],'sealedFootprintM':[6,2],'chamberBoundsM':[[2,0,.1875],[6,2,3]],'exteriorLandingBoundsM':[[6,0,.1875],[8,2,.1875]],'floorTopM':.1875,'roofUndersideM':3},'freeVolumes':volumes,'checks':checks,'pass':all(c['pass']for c in checks),'limits':['New composite only; no inherited enclosure proof.','Exterior service landing has native floor support only; no railings, docking/EVA attachment, vacuum survival, authority registration, flow rating or final artistic acceptance.']}
out=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'.runtime/native-external-airlock-r000/audit-a006.json'
out.parent.mkdir(parents=True,exist_ok=True);payload=json.dumps(report,indent=2)+'\n'
if out.exists():assert out.read_text()==payload,'Refusing to overwrite a different audit revision'
else:out.write_text(payload)
print(json.dumps({'output':str(out),'pass':report['pass'],'failed':[c for c in checks if not c['pass']]}))
