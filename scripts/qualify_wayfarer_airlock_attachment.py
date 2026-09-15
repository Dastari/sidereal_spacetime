"""Read-only attachment feasibility from exact native triangles and nominal floors.
No asset mutation, no collision authorization, no live assembly/refit/publication.
"""
from native_source_paths import checkout_source_path
import hashlib,json,math,struct,sys
from pathlib import Path
import numpy as np
from shapely.geometry import Polygon,box,LineString
from shapely.ops import unary_union
import qualify_wayfarer_walking as native
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/handoffs/wayfarer_airlock_attachment_candidate.json'
AUDIT='assets/art-library/designs/shipyard.structure.external-airlock/revisions/r000/audit-a007.json'
AUDIT_SHA='eb7eab8523d68906a302a84cf06a5b2a507229d15e89fb96f66d1ade8b6e0aa6'
def digest(data):return hashlib.sha256(data).hexdigest()
def triangles(path,sha,prefix):
 raw=(ROOT/path).read_bytes();assert digest(raw)==sha
 n,kind=struct.unpack_from('<I4s',raw,12);assert kind==b'JSON';g=json.loads(raw[20:20+n]);size,kind=struct.unpack_from('<I4s',raw,20+n);assert kind==b'BIN\0';data=raw[28+n:28+n+size];out=[]
 def accessor(index):
  a=g['accessors'][index];v=g['bufferViews'][a['bufferView']];assert 'sparse'not in a and v['buffer']==0
  fmt,width={5126:('f',4),5125:('I',4),5123:('H',2),5121:('B',1)}[a['componentType']];count={'VEC3':3,'SCALAR':1}[a['type']]
  return np.array([struct.unpack_from('<'+fmt*count,data,v.get('byteOffset',0)+a.get('byteOffset',0)+i*v.get('byteStride',width*count))for i in range(a['count'])])
 def walk(i,parent):
  node=g['nodes'][i];m=parent@native.transform(node);name=node.get('name','');match=prefix is None or name==prefix or name.startswith(prefix+'_')or name.startswith(prefix+'.')or(prefix.endswith('--')and name.startswith(prefix))
  if match and'mesh'in node:
   for primitive in g['meshes'][node['mesh']]['primitives']:
    assert primitive.get('mode',4)==4
    p=accessor(primitive['attributes']['POSITION']);p=np.column_stack([p,np.ones(len(p))])@m.T;p=np.column_stack([p[:,0],-p[:,2],p[:,1]])
    indices=accessor(primitive['indices']).reshape(-1).astype(int)if'indices'in primitive else np.arange(len(p));out.append(p[indices.reshape(-1,3)])
  for child in node.get('children',[]):walk(child,m)
 for i in g['scenes'][g.get('scene',0)]['nodes']:walk(i,np.eye(4))
 assert out,'Missing native mesh selector';return np.concatenate(out)
def placed(p):
 v=p['visual'];path='assets/runtime/'+v['url'].removeprefix('/assets/')if v else'assets/runtime/assembly/parts.glb';sha=v['sha256']if v else native.LEGACY;prefix=v.get('nodePrefix')if v else'GEO-'+p['assetId']+'--';t=triangles(path,sha,prefix);o=p['originalPlacement'];c,s=math.cos(o['rotation']),math.sin(o['rotation']);t[:,:,0]*=-1 if o['flipped']else 1;t=t@np.array([[c,s,0],[-s,c,0],[0,0,1]])+np.array(o['position']);return t,{'path':path,'sha256':sha,'nodePrefix':prefix,'sourcePlacedId':p['sourcePlacedId'],'originalPlacement':o}
def ray_hits(t,start,end):
 # Exact native face intersections, not conservative cover/AABB inference.
 origin=np.array(start);direction=np.array(end)-origin;e1=t[:,1]-t[:,0];e2=t[:,2]-t[:,0];h=np.cross(np.broadcast_to(direction,e2.shape),e2);a=np.einsum('ij,ij->i',e1,h);valid=np.abs(a)>1e-10;inv=np.divide(1,a,out=np.zeros_like(a),where=valid);s=origin-t[:,0];u=inv*np.einsum('ij,ij->i',s,h);q=np.cross(s,e1);v=inv*(q@direction);distance=inv*np.einsum('ij,ij->i',e2,q);mask=valid&(u>=-1e-8)&(v>=-1e-8)&(u+v<=1+1e-8)&(distance>=0)&(distance<=1);return sorted(set(round(float(x),9)for x in distance[mask]))
def qualify():
 docraw=(ROOT/'.runtime/wayfarer-semantic-candidate-r001/document.json').read_text().rstrip('\n');assert digest(docraw.encode())==native.CANDIDATE
 doc=json.loads(docraw);placements=json.loads((ROOT/'.runtime/wayfarer-semantic-candidate-r001/placements.json').read_text());byid={p['sourcePlacedId']:p for p in placements};auditraw=(ROOT/AUDIT).read_bytes();assert digest(auditraw)==AUDIT_SHA;audit=json.loads(auditraw)
 for pin in audit['sourcePins'].values():assert digest(checkout_source_path(pin['path'], ROOT).read_bytes())==pin['sha256']
 floor=unary_union([Polygon([(x/32,y/32)for x,y in t['vertices']])for t in doc['layout']['tiles']]);proof=json.loads((ROOT/'packages/content/src/wayfarer-walking-proof.json').read_text());bindings={p['sourceObjectId']:p for p in proof['bindings']}
 scans=[]
 for side in [-1,1]:
  for y in [-8,-6,-4,-2,0,2,4,6,8]:
   route=LineString([(side*3.4,y),(side*7,y)]).buffer(.3);hits=[]
   for p in placements:
    b=bindings.get(p['sourcePlacedId']);polys=b['obstacles']or([{'vertices':b['cover']}]if'cover'in b else[])if b else[]
    if any(Polygon(poly['vertices']).intersects(route)for poly in polys):hits.append({'id':p['sourcePlacedId'],'role':p['role']})
   scans.append({'side':'port'if side<0 else'starboard','bayCenterY':y,'conservativeRouteBlockers':hits})
 selected=['wall-2--2','wall-3--2','superstructure-3--2'];details=[]
 for id in selected:
  t,pin=placed(byid[id]);rays=[]
  for y in [-4.5,-4.25,-4,-3.75,-3.5]:
   for z in [.4,1,1.8,2.1]:
    hits=ray_hits(t,[3.4,y,z],[7,y,z]);rays.append({'y':y,'z':z,'hitCount':len(hits),'x':[round(3.4+3.6*h,6)for h in hits]})
  details.append({**pin,'nativeTriangles':len(t),'boundsM':[t.reshape(-1,3).min(0).tolist(),t.reshape(-1,3).max(0).tolist()],'blockedRayCount':sum(bool(r['hitCount'])for r in rays),'rays':rays})
 floortri,floorpin=placed(byid['floor-2--2']);rooftri,roofpin=placed(byid['roof-2--2']);edgetri,edgepin=placed(byid['roof-3--2']);floor_top=float(floortri[:,:,2].max());roof_bottom=float(rooftri[:,:,2].min());assert floor_top==.1875
 candidates=[]
 for name,origin in [('compact-existing-interior',[3,-5,0]),('extended-new-vestibule',[5,-5,0])]:
  footprint=box(origin[0],origin[1],origin[0]+8,origin[1]+2);newparts=[{**p,'id':f'candidate-{name}-native-{i}','sha256':audit['sourcePins'][p['source']]['sha256'],'sourcePartIndex':i,'originM':[p['originM'][j]+origin[j]for j in range(3)]}for i,p in enumerate(audit['placements'])]
  protected=[]
  for placement in placements:
   if placement['role']in['interior-equipment','cargo-container','external-system']or placement['sourcePlacedId'].startswith('pilot-'):
    b=bindings.get(placement['sourcePlacedId']);polys=b['obstacles']or([{'vertices':b['cover']}]if'cover'in b else[])if b else[]
    overlap=sum(Polygon(poly['vertices']).intersection(footprint).area for poly in polys)
    if overlap>1e-8:protected.append({'sourcePlacedId':placement['sourcePlacedId'],'conservativeOverlapM2':overlap})
  candidates.append({'protectedSourceCoverOverlaps':protected,'id':name,'status':'blocked-attachment-study-only','originM':origin,'quarterTurns':0,'nativePlacements':newparts,'nominalFootprintM':[origin[:2],[origin[0]+8,origin[1]+2]],'overlapExistingFloorM2':floor.intersection(footprint).area,'sharedFloorEdgeM':floor.boundary.intersection(footprint.boundary).length,'floorTopM':floor_top,'nativeAirlockRoofUndersideM':3,'preserveAllOriginalPlacedIds':True,'activationAllowed':False})
 return {'schema':'sidereal.wayfarer-airlock-attachment-candidate.v1','status':'blocked-native-interfaces-required','sourceBlueprintSha256':native.CANDIDATE,'airlockAudit':{'path':AUDIT,'sha256':AUDIT_SHA},'selectedBay':{'side':'starboard','centerY':-4,'nominalSpanY':[-5,-3],'nominalSideX':5,'reason':'2m aligned bay avoids cockpit/cargo and external-thruster centerlines; extended option avoids equipment, compact full fixture overlaps crew-bed cover and must omit its interior test-room pieces'},'sourceNativeBarriers':details,'bayScan':scans,'interfaces':{'floor':floorpin,'roof':roofpin,'roofEdge':edgepin,'oldFloorTopM':floor_top,'newFloorTopM':.1875,'oldRoofUndersideM':roof_bottom,'newRoofUndersideM':3,'roofUndersideMismatchM':3-roof_bottom},'candidates':candidates,'checks':{'exactNativeSourceHashes':True,'exact2mNominalFloorAndVerticalDatum':True,'existingBarrierNativeRayHits':all(d['blockedRayCount']>0 for d in details),'currentAperturePassable':False,'compactPlacementDuplicatesExistingFloor':candidates[0]['overlapExistingFloorM2']>0,'extendedPlacementNoFloorAreaOverlap':candidates[1]['overlapExistingFloorM2']==0,'extendedPlacementAvoidsProtectedEquipmentCovers':not candidates[1]['protectedSourceCoverOverlaps'],'roofInterfaceMatches':roof_bottom==3,'attachedSealQualified':False,'readyForCompilerOrRuntime':False},'requiredAdaptations':[{'kind':'native-side-structural-aperture','sourcePlacedIds':['wall-2--2','wall-3--2'],'requirement':'Authored native 2m port with >=1.25m clear opening and >=1.8m supported body height; preserve or separately replace old under-deck backing, never delete the floor tile or assign empty collision.'},{'kind':'native-external-armor-aperture','sourcePlacedIds':['superstructure-3--2'],'requirement':'Matching 2m faction armor collar with actual through-aperture; preserve independent penetrable armor representation. No pressure/strength inferred from appearance.'},{'kind':'native-roof-transition','sourcePlacedIds':['roof-2--2','roof-3--2'],'requirement':'312.5mm stepped sealed header/roof collar, matching existing2.6875m underside and new3m underside without scaling either source.'},{'kind':'native-floor-and-inlet-transition','sourcePlacedIds':['floor-2--2'],'requirement':'Compact option omits four NEW duplicate quarter floors and inlet-room pieces, then requalifies actual full2m floor edge/door support/contact solids; extended option must replace airlock back wall source index26 with real open inlet and account hull thickness. Neither existing70part proof certifies these modifications.'},{'kind':'actual-gas-neighbor-interface','sourcePlacedIds':[],'requirement':'Do not treat entire Wayfarer as sealed. Requalify chamber/interface free volumes and boundaries, attach inner port only to an accepted compartment/gas store; no free gas allocation.'}], 'preservation':{'originalPlacementCount':len(placements),'cockpitIds':[p['sourcePlacedId']for p in placements if p['sourcePlacedId'].startswith('pilot-')],'cargoIds':[p['sourcePlacedId']for p in placements if p['role']=='cargo-container'],'allOriginalSourcesAndTransformsUnchanged':True},'limits':['Native ray hits prove tested paths obstructed, not a full closed-mesh pressure proof.','Conservative bay scan may reject real subcomponent gaps; it never authorizes passage.','No art edit, no compiled template, no live refit and no final artistic approval.']}
if __name__=='__main__':
 result=qualify();text=json.dumps(result,indent=2)+'\n'
 if '--write'in sys.argv:OUT.write_text(text)
 else:assert OUT.read_text()==text,'Attachment study drift: inspect source changes explicitly'
 print(json.dumps({'status':result['status'],'selectedBay':result['selectedBay'],'nativeBarrierRays':[{'id':r['sourcePlacedId'],'blocked':r['blockedRayCount']}for r in result['sourceNativeBarriers']],'checks':result['checks'],'report':str(OUT.relative_to(ROOT))}))
