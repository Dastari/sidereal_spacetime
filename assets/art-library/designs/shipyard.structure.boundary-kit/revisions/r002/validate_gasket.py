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

g=json.loads((p/'geometry.json').read_text());base=Path('assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r001');boxes=json.loads((base/'draft-occupancy-boxes.json').read_text())['parts']
check('r001 dependency hash unchanged',hashlib.sha256((base/'kit.glb').read_bytes()).hexdigest()==g['dependencyGlbSha256'])
check('only two additive mesh selectors',sorted(n.get('name')for n in d['nodes']if 'mesh'in n)==['GEO-door-frame-seal-seat--surface','GEO-door-perimeter-seal--surface'])
node=next(n for n in d['nodes']if n.get('name')=='GEO-door-perimeter-seal--surface');mesh=d['meshes'][node['mesh']];check('inherited leaf bind preserved',node.get('translation')==[.3125,0,.0625]);check('named0to1 morph target retained',mesh.get('extras',{}).get('targetNames')==['SealRetracted']and mesh.get('weights')==[0]and all(len(q.get('targets',[]))==1 for q in mesh['primitives']))
prim=mesh['primitives'][0];ps=values(prim['attributes']['POSITION']);delta=values(prim['targets'][0]['POSITION']);morphed=[tuple(a[i]+b[i]for i in range(3))for a,b in zip(ps,delta)]
check('deployed export contact envelope',abs(min(v[0]for v in ps)-.0525)<1e-7 and abs(max(v[0]for v in ps)-1.3225)<1e-7 and abs(min(v[1]for v in ps)-.1875)<1e-7 and abs(max(v[1]for v in ps)-2.4475)<1e-7)
check('morph positions exported, not baked away',any(any(abs(x)>1e-6 for x in row)for row in delta))
check('retracted contour lies inside rigid leaf XZ silhouette',min(v[0]for v in morphed)>.0645 and max(v[0]for v in morphed)<1.3105 and min(v[1]for v in morphed)>.1895 and max(v[1]for v in morphed)<2.4355)
check('all materials single sided',all(not x.get('doubleSided',False)for x in d['materials']))

def gasket_boxes(fraction):
 outer=[[a[i]+(b[i]-a[i])*fraction for i in range(2)]for a,b in zip(g['deployedOuterXZ'],g['retractedOuterXZ'])];inner=g['innerXZ'];x0,z0=outer[0];x1,z1=outer[2];ix0,iz0=inner[0];ix1,iz1=inner[2];front=g['deployedFrontY']+(g['retractedFrontY']-g['deployedFrontY'])*fraction
 return [{'min':[a,front,c],'max':[b,0,d]}for a,b,c,d in [(x0,ix0,z0,z1),(ix1,x1,z0,z1),(ix0,ix1,z0,iz0),(ix0,ix1,iz1,z1)]]
def polygon(box,angle=0,pivot=(0,0)):
 co=math.cos(angle);si=math.sin(angle);lo=box['min'];hi=box['max'];return [(pivot[0]+x*co-y*si,pivot[1]+x*si+y*co)for x,y in [(lo[0],lo[1]),(hi[0],lo[1]),(hi[0],hi[1]),(lo[0],hi[1])]]
def overlap(a,b):
 for pts in [a,b]:
  for i in range(len(pts)):
   u,v=pts[i],pts[(i+1)%len(pts)];ax=(u[1]-v[1],v[0]-u[0]);pa=[x*ax[0]+y*ax[1]for x,y in a];pb=[x*ax[0]+y*ax[1]for x,y in b]
   if min(max(pa),max(pb))-max(min(pa),min(pb))<=1e-9:return False
 return True
collisions=[]
frame=boxes['door-frame-2m']+g['fixedSeatBoxes']
for fraction,angle in [(i/100,0)for i in range(101)]+[(1,-i*math.pi/720)for i in range(361)]:
 for box in gasket_boxes(fraction):
  a=polygon(box,angle,(.3125,-.0625))
  for fixed in frame:
   if min(box['max'][2],fixed['max'][2])-max(box['min'][2],fixed['min'][2])<=1e-9:continue
   if overlap(a,polygon(fixed)):collisions.append({'fraction':fraction,'angle':angle,'fixed':fixed.get('id')});break
  if box['min'][2]<.1875-1e-9:collisions.append({'floor':True})
check('101 seal poses and 361 hinge states avoid fixed frame/floor penetration',not collisions,collisions[:8])
self_overlap=[]
for fraction in [i/100 for i in range(101)]:
 for box in gasket_boxes(fraction):
  for rigid in boxes['door-leaf']:
   if all(min(box['max'][i],rigid['max'][i])-max(box['min'][i],rigid['min'][i])>1e-9 for i in range(3)):self_overlap.append(fraction)
check('gasket never retracts into rigid backing',not self_overlap)
openpolys=[polygon(b,-math.pi/2,(.3125,-.0625))for b in gasket_boxes(1)];check('open gasket preserves full 1.25m clear aperture',max(x for pp in openpolys for x,y in pp)<=.375+1e-9)
check('fixed seats remain outside clear aperture',all(min(b['max'][0],1.625)-max(b['min'][0],.375)<=1e-9 or min(b['max'][2],2.4375)-max(b['min'][2],.1875)<=1e-9 for b in g['fixedSeatBoxes']))

def rect_area(a,b):return max(0,min(a[2],b[2])-max(a[0],b[0]))*max(0,min(a[3],b[3])-max(a[1],b[1]))
rb=gasket_boxes(0);ringrects=[(b['min'][0]+.3125,b['min'][2],b['max'][0]+.3125,b['max'][2])for b in rb]
contacts={}
for b in g['fixedSeatBoxes']:
 rect=(b['min'][0],b['min'][2],b['max'][0],b['max'][2]);contacts[b['id']]=sum(rect_area(r,rect)for r in ringrects)
check('closed left/right/top frame contact patches have positive area',all(v>0 for v in contacts.values()),contacts)
leafrects=[(b['min'][0]+.3125,b['min'][2],b['max'][0]+.3125,b['max'][2])for b in boxes['door-leaf']if abs(b['min'][1])<1e-9]
contacts2d=[(max(a[0],b[0]),max(a[1],b[1]),min(a[2],b[2]),min(a[3],b[3]))for a in ringrects for b in leafrects if rect_area(a,b)>0]
xs2=sorted(set(x for r in contacts2d for x in [r[0],r[2]]));zs2=sorted(set(z for r in contacts2d for z in [r[1],r[3]]))
mountArea=sum((b-a)*(d-c)for a,b in zip(xs2,xs2[1:])for c,d in zip(zs2,zs2[1:])if any(r[0]<=(a+b)/2<=r[2]and r[1]<=(c+d)/2<=r[3]for r in contacts2d))
check('closed gasket has rigid leaf attachment contact area',mountArea>.08,{'m2':mountArea})
bottomWidth=ringrects[1][2]-ringrects[0][0];check('closed bottom lip reaches floor datum exactly',min(b['min'][2]for b in rb)==.1875,{'bottomPatchAreaM2':bottomWidth*.009})
# Exact axis interval subdivision proves projected aperture coverage, not pressure strength.
leafAll=[(b['min'][0]+.3125,b['min'][2],b['max'][0]+.3125,b['max'][2])for b in boxes['door-leaf']];rects=leafAll+ringrects;xs=sorted(set([.375,1.625]+[v for r in rects for v in [r[0],r[2]]if .375<v<1.625]));zs=sorted(set([.1875,2.4375]+[v for r in rects for v in [r[1],r[3]]if .1875<v<2.4375]));uncovered=[]
for a,b in zip(xs,xs[1:]):
 for c,dv in zip(zs,zs[1:]):
  x=(a+b)/2;z=(c+dv)/2
  if not any(r[0]<=x<=r[2]and r[1]<=z<=r[3]for r in rects):uncovered.append([a,b,c,dv])
check('closed projected aperture fully covered by native leaf and gasket',not uncovered,{'intervalCells':(len(xs)-1)*(len(zs)-1),'holes':uncovered[:8]})
check('no exported cameras/lights',not d.get('cameras')and'KHR_lights_punctual'not in d.get('extensions',{}))
report['contactAreasM2']={'frame':contacts,'leaf':mountArea,'floor':bottomWidth*.009};report['limits']=['Geometric contact only; no pressure/strength/material/actuator rating or owner art approval.','Shape key must be retracted before hinge motion; no seal deployment at a nonzero hinge angle.','Sampled rigid-envelope clearance is not an authoritative continuous sweep adapter.','Elastomer fold is a kinematic candidate, not a calibrated elastic/thermal/pressure deformation model.','Diagonal wall/node subfamilies remain separate required follow-up.']
report['kitSha256']=hashlib.sha256((p/'kit.glb').read_bytes()).hexdigest();report['pass']=not report['failures'];(p/'validation.json').write_text(json.dumps(report,indent=2));print(json.dumps({'checks':len(report['checks']),'failures':report['failures'],'triangles':triangles,'contacts':report['contactAreasM2']}))
if report['failures']:raise SystemExit(1)
