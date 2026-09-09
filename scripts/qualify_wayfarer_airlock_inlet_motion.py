"""Fresh native attached-door motion and pressure-neighbor proof; no publication."""
import sys,json,hashlib,math,struct
from pathlib import Path
import numpy as np
import manifold3d as m
import trimesh
from qualify_wayfarer_airlock_inlet import native_parts, ROOT
sys.path.insert(0,str(ROOT/'assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r006'))
from native_csg import solid,paths,scenes,rot
KIT=ROOT/'assets/art-library/designs/shipyard.structure.wayfarer-airlock-inlet/revisions/r000/a003'

def retracted_gasket():
 raw=paths['gasket'].read_bytes();n=struct.unpack_from('<I',raw,12)[0];g=json.loads(raw[20:20+n]);data=raw[28+n:]
 def accessor(index):
  a=g['accessors'][index];v=g['bufferViews'][a['bufferView']];width={'SCALAR':1,'VEC3':3}[a['type']];dt={5126:np.float32,5125:np.uint32,5123:np.uint16}[a['componentType']];offset=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',np.dtype(dt).itemsize*width)
  return np.ndarray((a['count'],width),dtype=dt,buffer=data,offset=offset,strides=(stride,np.dtype(dt).itemsize)).copy()
 pieces=[]
 for node in g['nodes']:
  if not node.get('name','').startswith('GEO-door-perimeter-seal--surface') or 'mesh' not in node:continue
  transform=rot@scenes['gasket'].graph[node['name']][0]
  for primitive in g['meshes'][node['mesh']]['primitives']:
   pos=accessor(primitive['attributes']['POSITION'])+accessor(primitive['targets'][0]['POSITION']);world=(np.c_[pos,np.ones(len(pos))]@transform.T)[:,:3];faces=accessor(primitive['indices']).reshape(-1,3)
   mesh=trimesh.Trimesh(vertices=np.round(world,6),faces=faces,process=False);mesh.merge_vertices(merge_tex=True,merge_norm=True)
   part=m.Manifold(m.Mesh64(np.asarray(mesh.vertices),np.asarray(mesh.faces,dtype=np.uint64)));assert part.status()==m.Error.NoError;pieces.append(part)
 return m.Manifold.batch_boolean(pieces,m.OpType.Add)

def full_interval_bounds(points):
 """Exact extrema of every rotating native vertex for angles[-90,0]degrees.
 Triangle interiors are convex combinations, so enclosing vertices encloses all
 native faces throughout the complete angle interval, not just sampled frames.
 """
 pivot=np.array([.3125,-.0625,0]);points=points-pivot;lo=np.array([float('inf')]*3);hi=-lo
 for x,y,z in points:
  angles=[-math.pi/2,0]
  for base in [math.atan2(-y,x),math.atan2(x,y)]:
   for k in [-2,-1,0,1,2]:
    a=base+k*math.pi
    if -math.pi/2<=a<=0:angles.append(a)
  values=np.array([[x*math.cos(a)-y*math.sin(a),x*math.sin(a)+y*math.cos(a),z] for a in angles])+pivot
  lo=np.minimum(lo,values.min(0));hi=np.maximum(hi,values.max(0))
 return lo,hi

def qualify():
 audit_path=ROOT/'assets/art-library/designs/shipyard.structure.external-airlock/revisions/r000/audit-a007.json';raw=audit_path.read_bytes();assert hashlib.sha256(raw).hexdigest()=='eb7eab8523d68906a302a84cf06a5b2a507229d15e89fb96f66d1ade8b6e0aa6';audit=json.loads(raw)
 pins=[];parts=[]
 for part in json.loads((KIT/'delivery-manifest.json').read_text())['parts']:
  path=KIT/part['file'];assert hashlib.sha256(path.read_bytes()).hexdigest()==part['sha256'];shape,_=native_parts(path);parts.append(shape.translate(part['anchorCommonM']));pins.append(part)
 kit=m.Manifold.batch_boolean(parts,m.OpType.Add);gasket=retracted_gasket();leaf=solid('door','GEO-door-leaf--surface');vertices=np.concatenate([gasket.to_mesh64().vert_properties[:,:3],leaf.to_mesh64().vert_properties[:,:3]])
 lower,upper=full_interval_bounds(vertices);envelope=m.Manifold.cube(upper-lower).translate(lower);checks=[]
 def check(name,passed,detail=None):checks.append({'name':name,'pass':bool(passed),'detail':detail})
 for label,origin,q in [('inner',[2,0,0],1),('outer',[6,2,0],3)]:
  swept=envelope.rotate([0,0,90*q]).translate(origin)
  overlap=(kit^swept).volume()
  check('Complete native hinge interval clear of new inlet: '+label,overlap<1e-10,{'intersectionM3':overlap,'localEnvelopeM':[lower.tolist(),upper.tolist()],'method':'analytic trigonometric extrema for every actual leaf and retracted-gasket vertex; continuous[-90,0]degrees'})
 # Each legal portal state gets a new combined support and free-volume proof.
 results=[]
 for inner_open,outer_open in [(False,False),(True,False),(False,True)]:
  active=list(parts)
  for i,p in enumerate(audit['placements']):
   if i==26:continue
   opened=inner_open if p['originM'][0]==2 else outer_open if p['originM'][0]==6 else False
   moving=p['nodePrefix'] in ['GEO-door-leaf--surface','GEO-door-perimeter-seal--surface']
   shape=gasket if opened and p['nodePrefix']=='GEO-door-perimeter-seal--surface' else solid(p['source'],p['nodePrefix'])
   if opened and moving:shape=shape.translate([-.3125,.0625,0]).rotate([0,0,-90]).translate([.3125,-.0625,0])
   active.append(shape.rotate([0,0,90*p['quarterTurns']]).translate(p['originM']))
  assembled=m.Manifold.batch_boolean(active,m.OpType.Add)
  closed=assembled
  for origin,q,opened in [([2,0,-1e-8],1,inner_open),([6,2,-1e-8],3,outer_open)]:
   if not opened:closed=closed+solid('gasket','GEO-door-perimeter-seal--surface').rotate([0,0,90*q]).translate(origin)
  void=m.Manifold.cube([12,4,5]).translate([-3,-1,-1])-closed
  cavities=[c for c in void.decompose() if c.volume()>.001 and c.bounding_box()[0]>1.5 and c.bounding_box()[3]<6.2]
  expected=0 if inner_open or outer_open else 1
  check(f'Actual attached chamber topology inner={inner_open} outer={outer_open}',len(cavities)==expected,{'boundedChamberCount':len(cavities),'expected':expected})
  results.append({'innerOpen':inner_open,'outerOpen':outer_open,'boundedChamberCount':len(cavities),'neighborInterpretation':'when inner opens chamber joins unqualified/open ship-side neighbor; when outer opens joins exterior vacuum'})
  if inner_open or outer_open:
   start,end=(.65,4) if inner_open else (4,7)
   body=m.Manifold.cylinder(1.8,.3/np.cos(np.pi/64),circular_segments=64).translate([0,1,.187501]);route=m.Manifold.batch_hull([body.translate([start,0,0]),body.translate([end,0,0])])
   check(f'Accepted native body clearance inner={inner_open} outer={outer_open}',(assembled^route).volume()<1e-10,{'intersectionM3':(assembled^route).volume(),'routeM':[[start,1],[end,1]],'heightM':1.8,'radiusM':.3})
 # Parent's requested neighbor conclusion is deliberately evidence-bound:
 # opening toward an unsealed source cannot install a fabricated pressure cell.
 check('Unqualified ship-side inlet is connected to exterior in tested composition',results[1]['boundedChamberCount']==0)
 return {'schema':'sidereal.wayfarer-native-airlock-motion-neighbor.v1','pass':all(c['pass'] for c in checks),'checks':checks,'newSourcePins':pins,'sourceAirlockAuditSha256':hashlib.sha256(raw).hexdigest(),'closedReportSha256':hashlib.sha256((KIT/'native-qualification.json').read_bytes()).hexdigest(),'portalStates':results,'neighborBoundary':{'status':'unqualified-open-ship-side','wholeWayfarerSealed':False,'installablePressurizedNeighbor':False,'initialCandidatePolicy':'vacuum-only independent fixture; do not allocate/refill gas or overwrite any pre-existing compartment state','requiresBeforePressurizedAttachment':['Qualified full connected Wayfarer compartment geometry including roofs/windows/cockpit and utility penetrations','Accepted free-volume mapping and immutable source/document proof','Server-conserved gas transfer and validated inner boundary connection']},'limits':['Continuous hinge proof checks new inlet against actual moving leaf/gasket; original enclosure clearances retain their separately hash-pinned source qualification.','Not a new approval of exterior survival, docking, pumps, ventilation routing or whole-ship enclosure.']}
if __name__=='__main__':
 report=qualify();output=KIT/'native-motion-neighbor-qualification.json'
 if output.exists():assert json.loads(output.read_text())==report,'Preserve qualification history'
 else:output.write_text(json.dumps(report,indent=2)+'\n')
 print(json.dumps({'pass':report['pass'],'checks':len(report['checks']),'failed':[c for c in report['checks'] if not c['pass']],'output':str(output)}))
 if not report['pass']:raise SystemExit(1)
