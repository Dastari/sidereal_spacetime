"""Offline native-solid CSG audit, never a visual replacement or runtime dependency."""
import trimesh, manifold3d as m, numpy as np, json, math, collections
from pathlib import Path
R=Path('assets/art-library/designs');cache={}; CSG_FLOAT32=False
paths={'wall':R/'shipyard.structure.boundary-kit/revisions/r004/family/kit.glb','floor':Path('assets/runtime/assembly/floor/r002/kit.glb'),'roof':R/'shipyard.structure.roof-kit/revisions/r001/kit.glb','contact':R/'shipyard.structure.boundary-kit/revisions/r005/final-a004/kit.glb','door':R/'shipyard.structure.boundary-kit/revisions/r001/kit.glb','gasket':R/'shipyard.structure.boundary-kit/revisions/r002/kit.glb','strip':R/'shipyard.structure.boundary-kit/revisions/r003/kit.glb'}
paths['junction']=Path(__file__).resolve().parent/'final-a006/kit.glb'
scenes={k:trimesh.load(p,force='scene')for k,p in paths.items()}
rot=np.array([[1,0,0,0],[0,0,-1,0],[0,1,0,0],[0,0,0,1]])
def solid(k,prefix):
 key=(k,prefix)
 if key in cache:return cache[key]
 pieces=[]
 if k=='contact':
  plan=json.load(open(R/'shipyard.structure.boundary-kit/revisions/r005/final-a004/contact-plan.json'));part=next(p for p in plan['parts']if prefix=='GEO-boundary-r005-'+p['id']+'--surface');wedges=[]
  for patch in part['patches']:
   b=np.round(np.array(patch['bottomTriangleM']),6);top=b.copy();top[:,2]=.1875;wedges.append(m.Manifold.hull_points(np.concatenate([b,top])))
  a=m.Manifold.batch_boolean(wedges,m.OpType.Add);cache[key]=a;return a
 for name in scenes[k].graph.nodes_geometry:
  if name==prefix or name.startswith(prefix+'_'):
   t,g=scenes[k].graph[name];v=scenes[k].geometry[g].copy();v.apply_transform(rot@t);pieces.append(v)
 assert pieces,key
 authored=json.loads((Path(__file__).resolve().parent/'native-authored-solids.json').read_text())
 if prefix in authored and not CSG_FLOAT32:
  def signature(triangles):return collections.Counter(tuple(sorted(tuple(round(float(n),6)for n in v)for v in tri))for tri in triangles)
  expected=[];native_solids=[]
  for part in authored[prefix]:
   vs=np.array(part['vertices']);fs=np.array(part['triangles']);expected.extend(vs[fs]);a=m.Manifold(m.Mesh64(np.round(vs,6),np.asarray(fs,dtype=np.uint64)));assert a.status()==m.Error.NoError,part['name'];native_solids.append(a)
  actual=[tri for mesh in pieces for tri in mesh.triangles]
  assert signature(actual)==signature(expected),('Authored native triangles differ from actual GLB',key)
  a=m.Manifold.batch_boolean(native_solids,m.OpType.Add);cache[key]=a;print('authored solid',key,a.num_tri(),a.volume(),flush=True);return a
 mesh=trimesh.util.concatenate(pieces);mesh.vertices=np.round(mesh.vertices,6);mesh.merge_vertices(merge_tex=True,merge_norm=True);a=m.Manifold((m.Mesh(np.asarray(mesh.vertices,dtype=np.float32),np.asarray(mesh.faces,dtype=np.uint32)) if CSG_FLOAT32 else m.Mesh64(np.asarray(mesh.vertices,dtype=np.float64),np.asarray(mesh.faces,dtype=np.uint64))));assert a.status()==m.Error.NoError,(key,a.status());a=m.Manifold.batch_boolean(a.decompose(),m.OpType.Add);assert a.status()==m.Error.NoError,(key,a.status());cache[key]=a;print('solid',key,a.num_tri(),a.volume(),flush=True);return a
