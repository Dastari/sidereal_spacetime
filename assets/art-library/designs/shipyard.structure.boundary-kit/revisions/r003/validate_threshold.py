import json,struct,math,sys,hashlib
from pathlib import Path
P=Path(sys.argv[1]);floor=json.load(open('.runtime/construction-boundary-kit/r003/attempt-a001/floor-native-triangles.json'));audit=json.load(open('.runtime/construction-boundary-kit/r003/attempt-a001/floor-contact-audit.json'))
b=(P/'kit.glb').read_bytes();n=struct.unpack_from('<I',b,12)[0];g=json.loads(b[20:20+n]);off=20+n;bn=struct.unpack_from('<I',b,off)[0];buf=b[off+8:off+8+bn]
def values(i):
 a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];fmt={5126:'f',5125:'I',5123:'H',5121:'B'}[a['componentType']];w={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];stride=v.get('byteStride',struct.calcsize(fmt)*w);start=v.get('byteOffset',0)+a.get('byteOffset',0);return [struct.unpack_from('<'+fmt*w,buf,start+k*stride)for k in range(a['count'])]
checks=[]
def ck(name,ok,details=None):checks.append({'name':name,'pass':bool(ok),'details':details})
node=next(n for n in g['nodes']if'mesh'in n);m=g['meshes'][node['mesh']];triangles=[]
ck('single explicit additive selector',node['name']=='GEO-door-flush-seam-contact--surface'and len(g['meshes'])==1)
ck('identity source node transform',not any(k in node for k in ['translation','rotation','scale','matrix']))
for p in m['primitives']:
 a=p['attributes'];ck('native normal UV tangent attributes',all(k in a for k in ['POSITION','NORMAL','TEXCOORD_0','TANGENT']));vs=[(v[0]+1,-v[2],v[1])for v in values(a['POSITION'])];idx=[v[0]for v in values(p['indices'])];triangles.extend([[vs[idx[i+j]]for j in range(3)]for i in range(0,len(idx),3)])
def signed(p):return sum(a[0]*b[1]-a[1]*b[0]for a,b in zip(p,p[1:]+p[:1]))/2 if len(p)>2 else 0

def intersect(p,q):
 if signed(q)<0:q=q[::-1]
 for a,b in zip(q,q[1:]+q[:1]):
  def dist(v):return (b[0]-a[0])*(v[1]-a[1])-(b[1]-a[1])*(v[0]-a[0])
  out=[]
  for u,v in zip(p,p[1:]+p[:1]):
   du,dv=dist(u),dist(v)
   if du>=-1e-12:out.append(u)
   if (du>=0)!=(dv>=0):
    f=du/(du-dv);out.append(tuple(u[k]+f*(v[k]-u[k])for k in range(2)))
  p=out
 return p

def height(t,x,y):
 a,b,c=t;det=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);u=((x-a[0])*(c[1]-a[1])-(y-a[1])*(c[0]-a[0]))/det;v=((b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0]))/det;return a[2]+u*(b[2]-a[2])+v*(c[2]-a[2])
quarter='GEO-part-0b833a4f3016609e9b96--floor';ft=[[[v[0]+x,v[1]-1,v[2]]for v in t]for x in [0,1]for t in floor['parts'][quarter]['triangles']];ftop=[t for t in ft if signed([p[:2]for p in t])>1e-12];under=[t for t in triangles if signed([p[:2]for p in t])< -1e-12]
contactArea=0;maxDeviation=0;intersections=0
for t in under:
 for f in ftop:
  pp=intersect([v[:2]for v in t],[v[:2]for v in f]);ar=abs(signed(pp))
  if ar<1e-14:continue
  contactArea+=ar;intersections+=1
  maxDeviation=max(maxDeviation,max(abs(height(t,*p)-height(f,*p))for p in pp))
underArea=sum(abs(signed([v[:2]for v in t]))for t in under)
ck('entire actual underside contacts native floor triangle union',abs(contactArea-underArea)<1e-10,{'projectedContactM2':contactArea,'projectedUndersideM2':underArea,'triangleOverlayPolygons':intersections})
ck('no gap or penetration at exact affine triangle intersections',maxDeviation<1e-7,{'maximumAbsoluteDeviationM':maxDeviation,'toleranceM':1e-7})
patch=audit['patchM'];top=[t for t in triangles if min(v[2]for v in t)>.1875-1e-8];newArea=sum(abs(signed(intersect([v[:2]for v in t],patch)))for t in top);prior=audit['fixtures']['split-quarter-seam']['contactAreaM2'];ck('gasket contact patch closed by native floor plus exported insert triangles',abs(newArea+prior-audit['patchAreaM2'])<1e-10,{'beforeContactM2':prior,'insertContactM2':newArea,'combinedM2':newArea+prior,'requiredM2':audit['patchAreaM2']})
ck('flush floor datum and no walking step',abs(max(v[2]for t in triangles for v in t)-.1875)<1e-9)
ck('full 1.25m aperture unchanged',all(v[2]<=.1875+1e-9 for t in triangles for v in t))
ck('preserved exact floor GLB',hashlib.sha256(Path(floor['source']).read_bytes()).hexdigest()==audit['floorSha256'])
ck('single sided PBR, no lights cameras',len(g['materials'])==1 and not g['materials'][0].get('doubleSided',False)and not g.get('cameras')and'KHR_lights_punctual'not in g.get('extensions',{}))
edges={};deg=0
for t in triangles:
 u=[t[1][i]-t[0][i]for i in range(3)];v=[t[2][i]-t[0][i]for i in range(3)];cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
 if sum(q*q for q in cross)<1e-20:deg+=1
 for a,c in zip(t,t[1:]+t[:1]):
  key=tuple(sorted((tuple(round(x,8)for x in a),tuple(round(x,8)for x in c))));edges[key]=edges.get(key,0)+1
ck('closed nondegenerate native solid',deg==0 and all(v==2 for v in edges.values()),{'triangles':len(triangles),'degenerate':deg})
# Cross-check the same insert against each exact axis-aligned rectangular source family pair.
defs=json.load(open('packages/content/src/construction-floor-interfaces.json'));rects=[x for x in defs['parts']if x['id']in ['square-2m','half-2x1','quarter-1m','strip-4x1']];pairResults=[]
for left in rects:
 for right in rects:
  native=[]
  for part,side in [(left,'left'),(right,'right')]:
   width=max(v[0]for v in part['footprint'])/32;depth=max(v[1]for v in part['footprint'])/32;dx=1-width if side=='left'else 1
   native += [[[v[0]+dx,v[1]-depth,v[2]]for v in t]for t in floor['parts'][part['native']['nodePrefix']]['triangles']]
  topfaces=[t for t in native if signed([p[:2]for p in t])>1e-12];coverage=0;dev=0
  for t in under:
   for f in topfaces:
    pp=intersect([v[:2]for v in t],[v[:2]for v in f]);ar=abs(signed(pp))
    if ar<1e-14:continue
    coverage+=ar;dev=max(dev,max(abs(height(t,*p)-height(f,*p))for p in pp))
  pairResults.append({'left':left['id'],'right':right['id'],'projectedContactM2':coverage,'maximumDeviationM':dev,'pass':abs(coverage-underArea)<1e-8 and dev<1e-6})
ck('16 rectangular family pairs nominally compatible within1micrometre export tolerance; exact fit certified only for quarter fixture',all(x['pass']for x in pairResults),pairResults)
report={'checks':checks,'pass':all(c['pass']for c in checks),'kitSha256':hashlib.sha256(b).hexdigest(),'floorSha256':audit['floorSha256'],'limits':['Native rectangular square/half/quarter/strip straight seam pairs verified; rotations, diagonal and corner profiles need equivalent native triangle contact validation.','Geometry fit only, no pressure/strength or authoritative continuous movement certification.','Existing hinge/seal swept volume remains parent-owned; insert never exceeds floorTop6.']};(P/'validation.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2));raise SystemExit(0 if report['pass']else 1)
