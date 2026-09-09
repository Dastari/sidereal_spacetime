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
check('eight unique native part selectors',len([n for n in d['nodes']if 'mesh'in n])==8)
check('shared seven PBR material roles',len(d['materials'])==7)
check('no exported lights or camera',not d.get('cameras')and'KHR_lights_punctual'not in d.get('extensions',{}))
check('native emission strength retained',any(m.get('extensions',{}).get('KHR_materials_emissive_strength',{}).get('emissiveStrength',0)>2 for m in d['materials']))
leaf=next(n for n in d['nodes']if n.get('name')=='GEO-door-leaf--surface');check('GLB hinge pivot translation uses X/Z/-Y',leaf.get('translation')==[.3125,0,.0625],leaf)
boxes=json.loads((p/'draft-occupancy-boxes.json').read_text())['parts']
def polygon(box,angle=0,pivot=(0,0)):
 a=angle*math.pi/180;c=math.cos(a);s=math.sin(a);lo=box['min'];hi=box['max'];pts=[(lo[0],lo[1]),(hi[0],lo[1]),(hi[0],hi[1]),(lo[0],hi[1])];return[(pivot[0]+x*c-y*s,pivot[1]+x*s+y*c)for x,y in pts]
def overlap(a,b):
 for pts in [a,b]:
  for i in range(len(pts)):
   u,v=pts[i],pts[(i+1)%len(pts)];axis=(u[1]-v[1],v[0]-u[0]);pa=[x*axis[0]+y*axis[1]for x,y in a];pb=[x*axis[0]+y*axis[1]for x,y in b]
   if min(max(pa),max(pb))-max(min(pa),min(pb))<=1e-8:return False
 return True
collisions=[]
for q in range(361):
 angle=-q/4
 for leafbox in boxes['door-leaf']:
  a=polygon(leafbox,angle,(.3125,-.0625))
  for framebox in boxes['door-frame-2m']:
   if min(leafbox['max'][2],framebox['max'][2])-max(leafbox['min'][2],framebox['min'][2])<=1e-7:continue
   if overlap(a,polygon(framebox)):
    collisions.append({'degrees':angle,'leaf':leafbox['id'],'frame':framebox['id']});break
check('361 sampled swing states avoid frame authoring boxes',not collisions,{'testedAngles':361,'firstCollisions':collisions[:8]})
body=[x for x in boxes['door-leaf']if 'hinge-strap'not in x['id']]
lo=[min(b['min'][i]for b in body)for i in range(3)];hi=[max(b['max'][i]for b in body)for i in range(3)]
check('physical rigid leaf fit tolerances',abs((hi[0]-lo[0])-1.246)<1e-6 and abs((hi[2]-lo[2])-2.246)<1e-6,{'localMin':lo,'localMax':hi,'opening':[1.25,2.25],'sideGapM':.002})
openpolys=[polygon(b,-90,(.3125,-.0625))for b in boxes['door-leaf']];check('full1.25m aperture clear at90deg',max(x for poly in openpolys for x,y in poly)<=.375+1e-7)
for name,L in [('wall-2m',2),('wall-1m',1)]:
 core=next(x for x in boxes[name]if'pressure-backing'in x['id']);check(name+' exact full-height closed backing',core['min']==[.0625,-.046875,.1875]and core['max']==[L-.0625,.046875,3])
 check(name+' contacts shared node on exact end faces',core['min'][0]==.0625 and core['max'][0]==L-.0625)
for name in ['closure-end','closure-corner','closure-t','join-straight']:
 b=boxes[name][0];check(name+' exact node volume',b['min']==[-.0625,-.0625,.1875]and b['max']==[.0625,.0625,3])
report['limits']=['Swing validation samples0.25-degree states against conservative source boxes; authority needs continuous collision/sweep and obstruction checks.','2mm rigid leaf fit gap needs a separately specified seal/gasket mechanism. No pressure seal certification.','No native clipping/voxel damage adapter, new roof adapters, diagonal closure families or airlock simulation.','Normals/UVs and scalar PBR materials only; no baked detail maps or runtime browser fidelity/performance evidence.']
report['kitSha256']=hashlib.sha256((p/'kit.glb').read_bytes()).hexdigest();report['pass']=not report['failures'];(p/'validation.json').write_text(json.dumps(report,indent=2));print(json.dumps({'checks':len(report['checks']),'failures':report['failures'],'triangles':triangles,'sweepCollisions':collisions[:8]}))
if report['failures']:raise SystemExit(1)
