"""Reproducible conservative walking qualification for the pinned Wayfarer.
No mesh mutation, art approval, pressure, load rating, or live refit. Requires
prepare_wayfarer_conversion.ts first. Exact native and retained legacy GLBs are
read, never substituted with their catalog AABBs or occupancy proxies.
"""
from pathlib import Path
import hashlib,json,math,struct
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
CANDIDATE='362f37217f63a44a470676f104c8368bd0973ca03f5e29eab190bc4d6df71340'
LEGACY='e45b79a8d40ca46124a51e4d5e24f89d0b00a0361989766e54b64deb8ad6999f'
LOW=.1875;HIGH=2.4375
OUT=ROOT/'packages/content/src/wayfarer-walking-proof.json'
def read(path):return json.loads(Path(path).read_text())
def cross(a,b,p):return (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])
def area(p):return abs(sum(a[0]*b[1]-a[1]*b[0]for a,b in zip(p,p[1:]+p[:1])))/2 if len(p)>2 else 0

def hull(points):
 points=sorted(set((float(p[0]),float(p[1]))for p in points));lo=[];hi=[]
 for p in points:
  while len(lo)>1 and cross(lo[-2],lo[-1],p)<=1e-12:lo.pop()
  lo.append(p)
 for p in reversed(points):
  while len(hi)>1 and cross(hi[-2],hi[-1],p)<=1e-12:hi.pop()
  hi.append(p)
 return lo[:-1]+hi[:-1]

def clip(subject,poly):
 out=subject
 for a,b in zip(poly,poly[1:]+poly[:1]):
  src=out;out=[]
  for p,q in zip(src,src[1:]+src[:1]):
   dp,dq=cross(a,b,p),cross(a,b,q)
   if dp>=0:out.append(p)
   if (dp>=0)!=(dq>=0):
    t=dp/(dp-dq);out.append((p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t))
 return out

def octagon(points):
 # Outward support lines, not a visual-AABB collider. The epsilon is an explicit
 # conservative numerical cover; all projected native vertices must lie inside.
 normals=[(math.cos(i*math.pi/4),math.sin(i*math.pi/4))for i in range(8)]
 ds=[max(x*n[0]+y*n[1]for x,y in points)+1e-6 for n in normals]
 poly=[]
 for i,n in enumerate(normals):
  j=(i+1)%8;m=normals[j];det=n[0]*m[1]-n[1]*m[0]
  poly.append(((ds[i]*m[1]-n[1]*ds[j])/det,(n[0]*ds[j]-ds[i]*m[0])/det))
 poly=hull(poly)
 assert all(all(cross(a,b,p)>=-1e-8 for a,b in zip(poly,poly[1:]+poly[:1]))for p in points)
 return poly

def transform(n):
 if 'matrix'in n:return np.array(n['matrix'],dtype=float).reshape((4,4),order='F')
 x,y,z,w=n.get('rotation',[0,0,0,1]);q=np.array([[1-2*y*y-2*z*z,2*x*y-2*z*w,2*x*z+2*y*w],[2*x*y+2*z*w,1-2*x*x-2*z*z,2*y*z-2*x*w],[2*x*z-2*y*w,2*y*z+2*x*w,1-2*x*x-2*y*y]])
 m=np.eye(4);m[:3,:3]=q@np.diag(n.get('scale',[1,1,1]));m[:3,3]=n.get('translation',[0,0,0]);return m
CACHE={}
def geometry(path,sha,prefix):
 key=(path,prefix)
 if key in CACHE:return CACHE[key]
 raw=(ROOT/path).read_bytes();assert hashlib.sha256(raw).hexdigest()==sha,path
 magic,version,total=struct.unpack_from('<4sII',raw);assert magic==b'glTF'and version==2 and total==len(raw)
 count,kind=struct.unpack_from('<I4s',raw,12);assert kind==b'JSON';g=json.loads(raw[20:20+count]);size,kind=struct.unpack_from('<I4s',raw,20+count);assert kind==b'BIN\x00';data=raw[28+count:28+count+size]
 assert not g.get('skins') and not g.get('animations'),'Articulated visuals need posed collision qualification'
 groups=[];seen=set()
 def visit(i,parent):
  assert i not in seen,'Multiple-parent native graph';seen.add(i);n=g['nodes'][i];matrix=parent@transform(n)
  name=n.get('name','');selected=prefix is None or name==prefix or name.startswith(prefix+'_') or name.startswith(prefix+'.') or (prefix.endswith('--') and name.startswith(prefix))
  if selected and 'mesh'in n:
   verts=[]
   for pr in g['meshes'][n['mesh']]['primitives']:
    assert not pr.get('targets') and pr.get('mode',4)==4
    a=g['accessors'][pr['attributes']['POSITION']];assert a['componentType']==5126 and a['type']=='VEC3'and 'sparse'not in a
    v=g['bufferViews'][a['bufferView']];assert v['buffer']==0
    for k in range(a['count']):
     xyz=struct.unpack_from('<fff',data,v.get('byteOffset',0)+a.get('byteOffset',0)+k*v.get('byteStride',12));p=matrix@np.array([*xyz,1]);verts.append([p[0],-p[2],p[1]])
   groups.append((name,np.array(verts)))
  for child in n.get('children',[]):visit(child,matrix)
 for i in g['scenes'][g.get('scene',0)]['nodes']:visit(i,np.eye(4))
 assert groups,'Missing exact asset mesh group '+str(prefix)
 CACHE[key]=groups;return groups

def qualify():
 folder=ROOT/'.runtime/wayfarer-semantic-candidate-r001';raw=(folder/'document.json').read_text().rstrip('\n');assert hashlib.sha256(raw.encode()).hexdigest()==CANDIDATE
 doc=json.loads(raw);placements=read(folder/'placements.json');floors=[[(x/32,y/32)for x,y in t['vertices']]for t in doc['layout']['tiles']]
 report=[];artifacts={}
 for p in placements:
  if p['representation']=='semantic-native-floor':continue
  original=p['originalPlacement'];assert not original['removedCells'];v=p['visual']
  path='assets/runtime/'+v['url'].removeprefix('/assets/') if v else 'assets/runtime/assembly/parts.glb';sha=v['sha256']if v else LEGACY
  prefix=v.get('nodePrefix')if v else 'GEO-'+p['assetId']+'--'
  groups=geometry(path,sha,prefix);artifacts[path]=sha
  c,s=math.cos(original['rotation']),math.sin(original['rotation']);points=[]
  for name,coords in groups:
   for x,y,z in coords:
    if original['flipped']:x=-x
    points.append((original['position'][0]+c*x-s*y,original['position'][1]+s*x+c*y,original['position'][2]+z))
  assert all(math.isfinite(v)for p in points for v in p)
  minimum=min(p[2]for p in points);maximum=max(p[2]for p in points)
  entry={'sourceObjectId':p['sourcePlacedId'],'assetId':p['assetId'],'assetSha256':sha,'role':p['role'],'heightRangeM':[minimum,maximum],'nativeVertices':len(points),'obstacles':[]}
  if minimum>=HIGH+1e-6 or maximum<=LOW-1e-6:
   entry.update(classification='outside-standing-height-slab',separationM=min(abs(minimum-HIGH),abs(maximum-LOW)))
  else:
   footprint=hull(points)
   # Degenerate exact planes still block: a conservative 1um support cover
   # gives collision geometry rather than silently accepting zero area.
   polygon=octagon(footprint if len(footprint)>1 else [(p[0],p[1])for p in points])
   overlaps=sum(area(clip(polygon,floor))for floor in floors)
   if overlaps<=1e-10:entry.update(classification='outside-supported-floor-union',projectedIntersectionAreaM2=overlaps,cover=polygon)
   else:
    entry.update(classification='conservative-standing-obstacle',projectedIntersectionAreaM2=overlaps,obstacles=[{'vertices':polygon}],coverExcessAreaM2=area(polygon)-area(footprint))
  report.append(entry)
 return {'schema':'sidereal.wayfarer-walking-proof.v1','documentSha256':CANDIDATE,'deckId':'wayfarer-main-deck','standingSlabM':[LOW,HIGH],'maximumBodyRadiusM':.3,'minimumBodyRadiusM':.3,'method':'Native vertex-derived outward octagonal support cover; whole object convex over-approximation, never inferred passable openings','functionalScope':'Conservative planar walking only; no step-over, structural load, seal, flight, or damage qualification','artifacts':artifacts,'bindings':report}
if __name__=='__main__':
 import sys,collections
 result=qualify();text=json.dumps(result,indent=2)+'\n'
 if '--write'in sys.argv:OUT.write_text(text)
 else:assert OUT.read_text()==text,'Qualification drift; review changed proof explicitly'
 print(json.dumps({'status':'passed','bindings':len(result['bindings']),'artifacts':len(result['artifacts']),'classes':dict(collections.Counter(x['classification']for x in result['bindings'])),'bytes':len(text)}))
