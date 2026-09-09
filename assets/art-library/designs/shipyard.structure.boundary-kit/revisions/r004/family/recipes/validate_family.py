import json,struct,math,sys,hashlib
from pathlib import Path
sys.path.insert(0,str(Path('.runtime/construction-boundary-kit/python-libs').resolve()))
from shapely.geometry import Polygon,LineString
from shapely.ops import unary_union
from shapely.affinity import rotate,translate
import numpy as np
P=Path(sys.argv[1]);plan=json.loads((P/'family-plan.json').read_text());parts={p['id']:p for p in plan['parts']};checks=[]
def ck(n,ok,d=None):checks.append({'name':n,'pass':bool(ok),'details':d})
class GLB:
 def __init__(self,path):
  self.path=Path(path);self.bytes=self.path.read_bytes();n=struct.unpack_from('<I',self.bytes,12)[0];self.g=json.loads(self.bytes[20:20+n]);off=20+n;ln=struct.unpack_from('<I',self.bytes,off)[0];self.buf=self.bytes[off+8:off+8+ln]
 def vals(self,i):
  a=self.g['accessors'][i];v=self.g['bufferViews'][a['bufferView']];fmt={5126:'f',5125:'I',5123:'H',5121:'B'}[a['componentType']];w={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];stride=v.get('byteStride',struct.calcsize(fmt)*w);start=v.get('byteOffset',0)+a.get('byteOffset',0);return [struct.unpack_from('<'+fmt*w,self.buf,start+k*stride)for k in range(a['count'])]
 def meshes(self):
  for node in self.g['nodes']:
   if'mesh'not in node:continue
   assert not any(k in node for k in ['translation','rotation','scale','matrix']),(self.path,node)
   groups=[]
   for p in self.g['meshes'][node['mesh']]['primitives']:
    attrs=p['attributes'];vs=np.array([(v[0],-v[2],v[1])for v in self.vals(attrs['POSITION'])]);idx=np.array([v[0]for v in self.vals(p['indices'])]);tris=vs[idx].reshape((-1,3,3));groups.append({'mat':self.g['materials'][p['material']]['name'],'tris':tris,'attrs':attrs})
   yield node['name'],groups
kit=GLB(P/'kit.glb');meshes=dict(kit.meshes());ck('all exact named part mesh groups',len(meshes)==len(parts) and all('GEO-boundary-r004-'+pid+'--surface'in meshes for pid in parts));ck('single sided materials without cameras/lights',all(not m.get('doubleSided',False)for m in kit.g['materials'])and not kit.g.get('cameras')and'KHR_lights_punctual'not in kit.g.get('extensions',{}))
core={};visual={};metrics=[];ports=[];alltris=0;badtri=0;badframes=0
for pid,p in parts.items():
 groups=meshes['GEO-boundary-r004-'+pid+'--surface'];cg=[g for g in groups if p['kind']=='node'or g['mat']=='MAT-boundary-r004-core'];ct=np.concatenate([g['tris']for g in cg]);core[pid]=ct;vt=np.concatenate([g['tris']for g in groups]);visual[pid]=vt;alltris+=len(vt)
 for group in groups:
  a=group['attrs'];ck(pid+' native normal UV tangent attributes',all(k in a for k in ['POSITION','NORMAL','TEXCOORD_0','TANGENT']));tr=group['tris'];cross=np.cross(tr[:,1]-tr[:,0],tr[:,2]-tr[:,0]);badtri+=int(np.count_nonzero(np.sum(cross*cross,axis=1)<1e-20))
  ns=np.array(kit.vals(a['NORMAL']));ts=np.array(kit.vals(a['TANGENT']));badframes+=int(np.count_nonzero((abs(np.linalg.norm(ns,axis=1)-1)>.003)|(abs(np.sum(ns*ts[:,:3],axis=1))>.003)))
 edges={}
 for t in ct:
  for a,b in zip(t,np.roll(t,-1,axis=0)):
   k=tuple(sorted((tuple(round(v,7)for v in a),tuple(round(v,7)for v in b))));edges[k]=edges.get(k,0)+1
 ck(pid+' closed native core manifold',all(v==2 for v in edges.values()))
 ck(pid+' exact vertical datums',abs(float(ct[:,:,2].min())-.1875)<1e-7 and abs(float(ct[:,:,2].max())-3)<1e-7)
 for port in p['ports']:
  n=np.array(port['normalOut']);pos=np.array(port['positionM']);dist=np.einsum('ijk,k->ij',ct[:,:,:2]-pos,n);on=np.max(abs(dist),axis=1)<1e-6;chosen=ct[on];area=float(np.linalg.norm(np.cross(chosen[:,1]-chosen[:,0],chosen[:,2]-chosen[:,0]),axis=1).sum()/2);expected=port['nominalContactAreaM2'];ok=abs(area-expected)<3e-6
  ports.append({'partId':pid,'positionM':port['positionM'],'nativeTriangleContactAreaM2':area,'nominalM2':expected,'triangleCount':len(chosen),'pass':ok})
metrics.append({'triangles':alltris});ck('all native exported contact planes retain full declared area',all(p['pass']for p in ports),{'ports':len(ports),'failed':[p for p in ports if not p['pass']]});ck('all native triangles nondegenerate',badtri==0,badtri);ck('all normal/tangent frames finite orthogonal',badframes==0,badframes)

def projection(tris,z=None):
 pp=[]
 for t in tris:
  if z is not None and np.max(abs(t[:,2]-z))>1e-6:continue
  poly=Polygon(t[:,:2]);
  if poly.area>1e-12:pp.append(poly)
 return unary_union(pp)
corePoly={pid:projection(t,.1875)for pid,t in core.items()};visPoly={pid:projection(t)for pid,t in visual.items()}
def placed(poly,p):return translate(rotate(poly,p['quarterTurns']*90,origin=(0,0)),p['originUnits'][0]/32,p['originUnits'][1]/32)
fixtureReport=[]
for f in plan['fixtures']:
 cps=[placed(corePoly[p['partId']],p)for p in f['placements']];vps=[placed(visPoly[p['partId']],p)for p in f['placements']];cu=unary_union(cps);vu=unary_union(vps);shape=Polygon(np.array(f['nominalPolygonUnits'])/32);h=.046875;expected=shape.buffer(h,join_style='mitre',mitre_limit=1000).difference(shape.buffer(-h,join_style='mitre',mitre_limit=1000))
 if f['partitionsUnits']:expected=unary_union([expected]+[LineString(np.array(e)/32).buffer(h,cap_style='flat')for e in f['partitionsUnits']])
 diff=cu.symmetric_difference(expected).area;overlap=sum(x.area for x in cps)-cu.area;visoverlap=sum(x.area for x in vps)-vu.area
 # Cross-part visible footprint overlap must remain below exported float area tolerance.
 ok=diff<1e-5 and overlap<1e-5 and visoverlap<1e-5;ck(f['id']+' actual exported closed loop and no cross-part overlap',ok,{'coreMismatchM2':diff,'coreOverlapM2':overlap,'visualOverlapM2':visoverlap});fixtureReport.append({'id':f['id'],'coreMismatchM2':diff,'coreOverlapM2':overlap,'visualOverlapM2':visoverlap,'pass':ok})
report={'pass':all(c['pass']for c in checks),'checks':checks,'parts':len(parts),'triangles':alltris,'nativeContactPlanes':ports,'fixtures':fixtureReport,'kitSha256':hashlib.sha256(kit.bytes).hexdigest(),'tolerances':{'nativeContactPlaneDistanceM':1e-6,'nativeContactAreaM2':3e-6,'fixtureAreaM2':1e-5},'limits':['Native core/visual planar joining only; no material capacity, floor/roof sealing certification, damage clipping or owner art acceptance.','Supported node and span signatures are explicit finite grammar; unlisted signatures reject.','No implied body collision or pressure/world authority integration.']};(P/'validation.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'pass':report['pass'],'checks':len(checks),'parts':len(parts),'triangles':alltris,'failed':[c for c in checks if not c['pass']]},indent=2));raise SystemExit(0 if report['pass']else 1)
