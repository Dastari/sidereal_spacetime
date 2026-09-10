"""Diagnostic connected native free-surface path; no qualification or geometry edits."""
import heapq,json
import numpy as np
import manifold3d as m
import trimesh
from inspect_wayfarer_native_enclosure import inspect,ROOF

def cube(lo,hi):return m.Manifold.cube(np.subtract(hi,lo)).translate(lo)
def run():
 shell=inspect(True)
 caps=[]
 void=cube([-7,-11,-2],[15,15,6])-(shell+m.Manifold.batch_boolean(caps,m.OpType.Add))
 from shapely.geometry import Polygon,box
 def section(shape,z):
  r=Polygon()
  for p in shape.slice(z).to_polygons():r=r.symmetric_difference(Polygon(p))
  return r
 for z in [2.68,2.69,2.70,2.72]:
  mask=box(-4.799,-8.499,4.799,5.499)
  print('SECTION',z,'shellMissing',mask.difference(section(shell,z)).area,'voidInside',mask.intersection(section(void,z)).area,flush=True)
 outer=void
 native=outer.to_mesh64();mesh=trimesh.Trimesh(vertices=np.asarray(native.vert_properties)[:,:3],faces=np.asarray(native.tri_verts),process=False)
 mesh.update_faces(mesh.area_faces>0)
 centers=mesh.triangles_center;source=int(np.argmin(np.linalg.norm(centers-[0,0,.2],axis=1)))
 targets=set(np.nonzero((centers[:,2]>2.85)&(np.abs(centers[:,0])<4.8)&(centers[:,1]<6))[0].tolist())
 graph=[[]for _ in centers]
 for a,b in mesh.face_adjacency:
  d=float(np.linalg.norm(centers[a]-centers[b]));graph[a].append((b,d));graph[b].append((a,d))
 dist={source:0};prev={};queue=[(0,source)];found=None
 while queue:
  cost,node=heapq.heappop(queue)
  if cost!=dist[node]:continue
  if node in targets:found=node;break
  for neighbor,delta in graph[node]:
   value=cost+delta
   if value<dist.get(neighbor,float('inf')):dist[neighbor]=value;prev[neighbor]=node;heapq.heappush(queue,(value,neighbor))
 path=[]
 if found is not None:
  while found!=source:path.append(found);found=prev[found]
  path.append(source);path.reverse()
 points=centers[path].tolist();print('DEGENERATES',json.dumps([{'point':centers[i].tolist(),'area':mesh.area_faces[i],'triangle':mesh.triangles[i].tolist()}for i in path if mesh.area_faces[i]<1e-10]),flush=True);print('PATH',json.dumps(points),flush=True)
 return {'diagnosticOnly':True,'surfacePathNotFreeBodyRoute':True,'faceCount':len(path),'pointsM':points,'sourceTriangle':mesh.triangles[source].tolist()}
if __name__=='__main__':
 r=run();(ROOF/'closure-surface-path-a012.json').write_text(json.dumps(r,indent=2)+'\n')
