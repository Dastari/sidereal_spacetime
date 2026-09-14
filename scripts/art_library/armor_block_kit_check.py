"""Strict exact GLB and assembly ownership validation for the r005 native kit."""
from __future__ import annotations
import argparse,collections,hashlib,importlib.util,json,math
from pathlib import Path
plan=None # Loaded from each immutable candidate below; never from the live helper.
ROOT=Path(__file__).resolve().parents[2]
READER=ROOT/'assets/art-library/framed-wayfarer/r004/hull/final-03/check_armor_cassette_hull.py'
spec=importlib.util.spec_from_file_location('frozen_glb_reader',READER);reader=importlib.util.module_from_spec(spec);spec.loader.exec_module(reader)
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def cross3(a,b):return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
def dot3(a,b):return sum(x*y for x,y in zip(a,b))
def sub(a,b):return [x-y for x,y in zip(a,b)]
def transformed(p,place):
 a=place['rotationZRad'];c,s=math.cos(a),math.sin(a);x,y=p[:2];q=place['position'];return [x*c-y*s+q[0],x*s+y*c+q[1]]
def triangulate(poly):
 poly=plan.clean(poly);indices=list(range(len(poly)));result=[]
 while len(indices)>3:
  found=False
  for k,b in enumerate(indices):
   a,c=indices[k-1],indices[(k+1)%len(indices)];tri=[poly[a],poly[b],poly[c]]
   if plan.area(tri)<=1e-12:continue
   def inside(p):return all(plan.cross(sub(tri[(j+1)%3],tri[j]),sub(p,tri[j]))>=-1e-10 for j in range(3))
   if any(inside(poly[i]) for i in indices if i not in (a,b,c)):continue
   result.append(tri);indices.pop(k);found=True;break
  if not found:
   # Remove redundant collinear points, while retaining polygon footprint.
   for k,b in enumerate(indices):
    a,c=indices[k-1],indices[(k+1)%len(indices)]
    if abs(plan.cross(sub(poly[b],poly[a]),sub(poly[c],poly[b])))<1e-10:indices.pop(k);found=True;break
   assert found,('UNTRIANGULATABLE_POLYGON',poly)
 result.append([poly[i] for i in indices]);return result

def point_inside(p,poly,tol=2e-6):
 inside=False
 for a,b in zip(poly,poly[1:]+poly[:1]):
  ab=sub(b,a);ap=sub(p,a);length=math.hypot(*ab)
  if length and abs(plan.cross(ab,ap))/length<tol and -tol<=plan.dot(ap,ab)/(length*length)<=1+tol:return True
  if (a[1]>p[1])!=(b[1]>p[1]):
   x=a[0]+(p[1]-a[1])*(b[0]-a[0])/(b[1]-a[1])
   if p[0]<x:inside=not inside
 return inside

def envelope(p):
 if p['kind']=='span':
  return [[0,0],[0,-p['backingDepthM']-.25],[p['lengthM'],-p['backingDepthM']-.25],[p['lengthM'],0]]
 return plan.corner_band(p['turnRadians'],p['cutbackM'],0,1)

def check(base):
 global plan
 base=Path(base);manifest=json.loads((base/'models.json').read_text());assert manifest['revision']==5
 frozen_spec=importlib.util.spec_from_file_location('candidate_frozen_planner',base/'armor_block_kit_plan.py');plan=importlib.util.module_from_spec(frozen_spec);frozen_spec.loader.exec_module(plan)
 assert sha(base/manifest['source'])==manifest['sourceSha256'];assert sha(base/'recipe.py')==manifest['recipeSha256'];assert sha(base/'armor_block_kit_plan.py')==manifest['plannerSha256']
 for rec in manifest['maps']:assert sha(base/rec['path'])==rec['sha256']
 for rec in manifest['sourceDependencies']:assert sha(ROOT/rec['path'])==rec['sha256']
 models={m['modelId']:m for m in manifest['models']};checks=[]
 for rec in models.values():
  assert plan.part_id(rec['parameters'])==rec['modelId'];data,doc,blob=reader.read_glb(base/rec['glb']);assert hashlib.sha256(data).hexdigest()==rec['sha256']
  owned=envelope(rec['parameters']);solids={s['object']:s for s in rec['backingSolids']};nodes=[];bounds=[];groups=set();totalvol=0.;sockets={}
  for node,matrix in reader.scene_nodes(doc):
   if 'socket_name' in node.get('extras',{}):
    sockets[node['extras']['socket_name']]=reader.world_point((0,0,0),matrix)
   if 'mesh' not in node:continue
   group=node.get('extras',{}).get('render_group');assert group in ('BACKING','FINISH'),node;groups.add(group)
   verts=[];tris=[];normals=[]
   for prim in doc['meshes'][node['mesh']]['primitives']:
    assert prim.get('mode',4)==4;positions=reader.accessor(doc,blob,prim['attributes']['POSITION']);nrm=reader.accessor(doc,blob,prim['attributes']['NORMAL']);normals+=nrm
    world=[reader.world_point(v,matrix) for v in positions];verts+=world;bounds+=world;indices=[x[0] for x in reader.accessor(doc,blob,prim['indices'])]
    assert len(indices)%3==0
    for i in range(0,len(indices),3):tris.append([world[j] for j in indices[i:i+3]])
   assert all(math.isfinite(c) for v in verts for c in v)
   assert all(abs(math.sqrt(dot3(n,n))-1)<2e-4 for n in normals),(node['name'],'NON_NORMALIZED_NORMAL')
   assert all(point_inside(v[:2],owned) for v in verts),(node['name'],'OUTSIDE_OWNED_ENVELOPE')
   edges=collections.Counter();volume=0.
   for tri in tris:
    a,b,c=tri;cr=cross3(sub(b,a),sub(c,a));assert math.sqrt(dot3(cr,cr))/2>1e-12,(node['name'],'ZERO_AREA_TRIANGLE')
    volume+=dot3(a,cross3(b,c))/6
    keys=[tuple(round(v,6) for v in p) for p in tri]
    for i in range(3):edges[tuple(sorted((keys[i],keys[(i+1)%3])))]+=1
   if group=='BACKING':
    s=solids[node['name']];assert all(v==2 for v in edges.values()),(node['name'],'NON_MANIFOLD_BACKING')
    assert abs(volume-s['expectedVolumeM3'])<2e-5,(node['name'],'VOLUME_MISMATCH',volume,s['expectedVolumeM3'])
    assert all(s['z0']-2e-6<=v[2]<=s['z1']+2e-6 and point_inside(v[:2],s['footprint']) for v in verts),(node['name'],'BACKING_ESCAPES_OWNERSHIP')
    top=[t for t in tris if all(abs(v[2]-s['z1'])<2e-6 for v in t)]
    toparea=sum(abs(plan.area([v[:2] for v in t])) for t in top)
    assert abs(toparea-plan.area(s['footprint']))<2e-5,(node['name'],'MISSING_BACKING_COVERAGE')
    totalvol+=volume
   nodes.append({'name':node['name'],'group':group,'triangles':len(tris),'finite':True,'unitNormals':True,'volumeM3':volume,'closedWeldedBacking':group=='BACKING'})
  assert groups=={'BACKING','FINISH'}
  for name,socket in rec['contacts'].items():assert math.dist(sockets[name],socket['position'])<2e-5,(rec['modelId'],'SOCKET_MISMATCH',name)
  measured={'min':[min(v[i] for v in bounds) for i in range(3)],'max':[max(v[i] for v in bounds) for i in range(3)]}
  assert all(abs(measured[k][i]-rec['bounds'][k][i])<2e-5 for k in measured for i in range(3)),(rec['modelId'],'BOUNDS_MISMATCH')
  assert abs(totalvol-rec['backingVolumeM3'])<2e-5
  images=[]
  for im in doc.get('images',[]):
   view=doc['bufferViews'][im['bufferView']];raw=blob[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']];images.append({'name':im.get('name'),'sha256':hashlib.sha256(raw).hexdigest(),'byteLength':len(raw)})
  assert len(images)>=3
  checks.append({'modelId':rec['modelId'],'glbSha256':rec['sha256'],'bounds':measured,'backingVolumeM3':totalvol,'nodes':nodes,'embeddedImages':images,'socketsMatched':True,'allGeometryInsideOwningEnvelope':True})
 assemblies=[]
 for name,assembly in manifest['assemblies'].items():
  placed=[]
  for p in assembly['placements']:
   assert p['scale']==[1,1,1]
   model=models[p['modelId']];poly=[transformed(v,p) for v in envelope(model['parameters'])];par=model['parameters'];height=par['heightM'] if par['kind']=='span' else max(par['incomingHeightM'],par['outgoingHeightM'])
   placed.append({'placement':p,'polygon':poly,'triangles':triangulate(poly),'z0':p['position'][2],'z1':p['position'][2]+height})
  comparisons=0;maxoverlap=0.
  for i,a in enumerate(placed):
   for b in placed[i+1:]:
    if min(a['z1'],b['z1'])-max(a['z0'],b['z0'])<1e-7:continue
    ap,bp=a['polygon'],b['polygon']
    if any(max(v[k] for v in ap)<=min(v[k] for v in bp)+1e-7 or max(v[k] for v in bp)<=min(v[k] for v in ap)+1e-7 for k in range(2)):continue
    overlap=sum(reader.overlap_area(t,u) for t in a['triangles'] for u in b['triangles']);comparisons+=1;maxoverlap=max(maxoverlap,overlap)
    assert overlap<2e-6,(name,'POSITIVE_VOLUME_OWNERSHIP_OVERLAP',a['placement']['placementId'],b['placement']['placementId'],overlap)
  # Each closed boundary edge exactly partitions endpoint-to-endpoint after its registered cuts.
  for edge in assembly.get('edges',[]):
   total=edge['startCutbackM']+sum(edge['nativeSpanLengthsM'])+edge['endCutbackM'];assert abs(total-edge['nominalLengthM'])<1e-9
   assert all(x>0 for x in edge['nativeSpanLengthsM'])
  assemblies.append({'name':name,'placementCount':len(placed),'unitScale':True,'ownershipComparisons':comparisons,'maximumIntersectionAreaM2':maxoverlap,'positiveVolumeOverlap':False,'exactEdgePartitions':len(assembly.get('edges',[]))})
 # Intentional rejection probes are geometry-level, independent of art/visual passing state.
 rejected=[]
 for label,points in [('short-reentrant',[(0,0),(4,0),(4,4),(3.5,4),(3.5,3.5),(3,3.5),(3,4),(0,4)]),('unsupported-direction',[(0,0),(3,2),(3,4),(0,4)])]:
  try:plan.Planner().boundary(label,[[round(x*32),round(y*32)] for x,y in points])
  except ValueError as e:rejected.append({'fixture':label,'reason':str(e)})
  else:raise AssertionError('REJECTION_PROBE_ACCEPTED '+label)
 try:plan.corner_cut(math.atan2(1,2)-math.atan2(1,4))
 except ValueError as e:rejected.append({'fixture':'unsupported-turn-between-qualified-directions','reason':str(e)})
 else:raise AssertionError('REJECTION_PROBE_ACCEPTED unsupported turn')
 result={'schema':'sidereal.native-armor-block-strict-validation.v1','status':'pass','manifestSha256':sha(base/'models.json'),'sourceSha256':manifest['sourceSha256'],'validatorSha256':sha(__file__),'binaryReaderDependency':{'path':str(READER.relative_to(ROOT)),'sha256':sha(READER)},'models':checks,'assemblies':assemblies,'rejectionProbes':rejected,'directionCount':len(manifest['directionPalette']),'limitations':['All actual GLB surfaces contained by disjoint analytic ownership envelopes. Backing coverage independently checks exported closed meshes, projected cap area and signed volume.','Map hashes/embedding presence checked; this does not claim pixel-level roughness repack parity.','No collision, pressure, mount clearance or authority qualification implied.']}
 dest=base/'validation.json';assert not dest.exists(),('IMMUTABLE_OUTPUT',str(dest));dest.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'status':'pass','models':len(checks),'assemblies':len(assemblies),'rejections':rejected}))
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('directory');a=p.parse_args();check(a.directory)
