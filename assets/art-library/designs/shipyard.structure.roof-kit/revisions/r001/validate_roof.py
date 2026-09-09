import json,struct,math,sys,hashlib
from pathlib import Path
p=Path(sys.argv[1]);report={'scope':'isolated native geometry; no runtime, pressure rating or damage certification','checks':[],'failures':[]}
def check(name,ok,details=None):
 report['checks'].append({'name':name,'pass':bool(ok),'details':details})
 if not ok:report['failures'].append(name)
b=(p/'kit.glb').read_bytes();n=struct.unpack_from('<I',b,12)[0];d=json.loads(b[20:20+n]);off=20+n;bn,kind=struct.unpack_from('<II',b,off);buf=b[off+8:off+8+bn]
check('glTF2 binary version',b[:4]==b'glTF'and struct.unpack_from('<I',b,4)[0]==2)
def values(i):
 a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];formats={5126:'f',5125:'I',5123:'H',5121:'B'};fmt=formats[a['componentType']];width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];stride=v.get('byteStride',struct.calcsize(fmt)*width);start=v.get('byteOffset',0)+a.get('byteOffset',0)
 return [struct.unpack_from('<'+fmt*width,buf,start+j*stride)for j in range(a['count'])]
triangles=0;badtri=0;badframes=0
for mesh in d['meshes']:
 for prim in mesh['primitives']:
  a=prim['attributes'];check(mesh['name']+' carries position/normal/UV/tangent',all(x in a for x in ['POSITION','NORMAL','TEXCOORD_0','TANGENT']))
  ps=values(a['POSITION']);ns=values(a['NORMAL']);ts=values(a['TANGENT']);idx=[x[0]for x in values(prim['indices'])];triangles+=len(idx)//3
  for normal,tangent in zip(ns,ts):
   if any(not math.isfinite(x)for x in normal+tangent)or abs(sum(x*x for x in normal)-1)>.003 or abs(sum(normal[i]*tangent[i]for i in range(3)))>.003:badframes+=1
  for q in range(0,len(idx),3):
   a,b,c=(ps[idx[q+k]]for k in range(3));u=[b[k]-a[k]for k in range(3)];v=[c[k]-a[k]for k in range(3)];cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
   if sum(x*x for x in cross)<1e-20:badtri+=1
check('nondegenerate triangles',badtri==0,{'triangles':triangles,'degenerate':badtri});check('finite orthogonal normal/tangent frames',badframes==0,badframes)

floor=json.loads(Path('packages/content/src/construction-floor-interfaces.json').read_text())
meshNodes=[n for n in d['nodes']if 'mesh'in n]
check('twelve exact independent selectors',len(meshNodes)==12 and len(set(n.get('name')for n in meshNodes))==12)
check('all material roles single sided',all(not m.get('doubleSided',False)for m in d['materials']))
check('no exported cameras or lights',not d.get('cameras')and'KHR_lights_punctual'not in d.get('extensions',{}))
check('normal textures embedded',len(d.get('images',[]))>=3 and all('bufferView'in im for im in d.get('images',[])) and sum('normalTexture'in m for m in d['materials'])>=3)
for part in floor['parts']:
 slug=part['id'];node=next(n for n in meshNodes if n.get('name')=='GEO-roof-'+slug+'--surface');mesh=d['meshes'][node['mesh']]
 check(slug+' identity source transform',not node.get('matrix')and node.get('translation',[0,0,0])==[0,0,0]and node.get('scale',[1,1,1])==[1,1,1]and node.get('rotation',[0,0,0,1])==[0,0,0,1])
 poly=[(x/32,y/32)for x,y in part['footprint']];outside=[];badheight=0;undersideArea=0;sideArea=[0]*len(poly)
 def area3(a,b,c):
  u=[b[i]-a[i]for i in range(3)];v=[c[i]-a[i]for i in range(3)];cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];return math.sqrt(sum(x*x for x in cross))/2
 for prim in mesh['primitives']:
  pts=[(x,-z,y)for x,y,z in values(prim['attributes']['POSITION'])];idx=[v[0]for v in values(prim['indices'])]
  for q in pts:
   if q[2]<-1e-6 or q[2]>.1875+1e-6:badheight+=1
   if any((b[0]-a[0])*(q[1]-a[1])-(b[1]-a[1])*(q[0]-a[0]) < -1e-6 for a,b in zip(poly,poly[1:]+poly[:1])):outside.append(q)
  for j in range(0,len(idx),3):
   tri=[pts[idx[j+k]]for k in range(3)];area=area3(*tri)
   if all(abs(v[2])<1e-7 for v in tri):undersideArea+=area
   for i,(a,b)in enumerate(zip(poly,poly[1:]+poly[:1])):
    if all(abs((b[0]-a[0])*(v[1]-a[1])-(b[1]-a[1])*(v[0]-a[0]))<1e-7 and -1e-7<=v[2]<=.125+1e-7 for v in tri):sideArea[i]+=area
 target=abs(sum(a[0]*b[1]-b[0]*a[1]for a,b in zip(poly,poly[1:]+poly[:1])))/2
 check(slug+' exact nominal envelope',not outside and badheight==0,{'outside':outside[:3],'badHeightVertices':badheight})
 check(slug+' continuous underside area',abs(undersideArea-target)<1e-6,{'expectedM2':target,'actualM2':undersideArea})
 check(slug+' complete butt contact faces',all(abs(sideArea[i]-math.dist(a,b)*.125)<1e-6 for i,(a,b)in enumerate(zip(poly,poly[1:]+poly[:1]))),sideArea)
report['limits']=['Exact visual footprint and candidate contact geometry only, no pressure/material/voxel damage certification.','No roof traversal apertures, utility penetrations or service capacity inferred.','CPU source stills, not installed client browser evidence.']
report['kitSha256']=hashlib.sha256((p/'kit.glb').read_bytes()).hexdigest();report['pass']=not report['failures'];(p/'validation.json').write_text(json.dumps(report,indent=2));print(json.dumps({'checks':len(report['checks']),'failures':report['failures'],'triangles':triangles}))
if report['failures']:raise SystemExit(1)
