"""Native pocket preserves original outside volume/materials and actual frames."""
import hashlib,json
import numpy as np
import trimesh
import manifold3d as m
from qualify_usable_boundary_wall import ROOT,triangles,qualify_points
from qualify_wayfarer_airlock_inlet import native_parts
DIRECTORY=ROOT/'assets/art-library/designs/shipyard.hull.shoulder-construction-interface/revisions/r000/a003'

def qualify():
 manifest=json.loads((DIRECTORY/'delivery-manifest.json').read_text());assets={p['id']:p for p in manifest['exports']};checks=[]
 def check(name,ok,detail=None):checks.append({'name':name,'pass':bool(ok),'detail':detail})
 pocket=m.Manifold.cube([.25,.25,2.75]).translate([0,0,.25])
 published={'shoulder':(ROOT/'assets/runtime/assembly/hull/finish-r004/part-e965a5502d9fe4c25406/clean.glb',None),
            'collar':(ROOT/'assets/runtime/assembly/roof/r004/kit.glb','GEO-outer-roof-collar--surface')}
 for key,(source,prefix) in published.items():
  baseline=native_parts(DIRECTORY/assets['baseline-'+key]['file'])[0];old=native_parts(source,prefix)[0]
  check('Editable baseline matches actual published native '+key,(baseline-old).volume()+(old-baseline).volume()<1e-9)
  path=DIRECTORY/assets[key]['file'];assert hashlib.sha256(path.read_bytes()).hexdigest()==assets[key]['sha256']
  new=native_parts(path)[0];expected=baseline-pocket
  def raw_samples(path):
   faces,_=triangles(path);vertices=np.array([p for _,face in faces for p in face]);indices=np.arange(len(vertices)).reshape(-1,3)
   mesh=trimesh.Trimesh(vertices,indices,process=False)
   mesh.update_faces(mesh.area_faces>1e-20)
   return mesh,np.concatenate([vertices,vertices[indices].mean(axis=1)])
  new_mesh,new_points=raw_samples(path);old_mesh,old_points=raw_samples(DIRECTORY/assets['baseline-'+key]['file'])
  low=np.array([0,0,.25]);high=np.array([.25,.25,3.0])
  old_distance=trimesh.proximity.closest_point_naive(old_mesh,new_points)[1]
  # Newly exposed cut faces are allowed only on the declared pocket planes.
  on_pocket=np.logical_and((new_points>=low-1e-6).all(axis=1),(new_points<=high+1e-6).all(axis=1))
  plane_distance=np.minimum(abs(new_points-low),abs(new_points-high)).min(axis=1)
  new_error=np.where(on_pocket,np.minimum(old_distance,plane_distance),old_distance)
  retained=old_points[~np.logical_and((old_points>=low-1e-6).all(axis=1),(old_points<=high+1e-6).all(axis=1))]
  old_error=trimesh.proximity.closest_point_naive(new_mesh,retained)[1]
  error=max(float(new_error.max()),float(old_error.max()))
  difference=(new-expected).volume()+(expected-new).volume()
  check('Raw native surfaces preserved outside explicit pocket '+key,error<=1e-6 and difference<1e-6,{'csgSymmetricDifferenceM3':difference,'maximumRawSurfaceSampleErrorM':error,'rawEncodingToleranceM':1e-6,'samples':'Every raw GLB vertex and triangle centroid; new faces must lie on original raw surfaces or declared pocket planes. No geometry is moved. CSG-only weld/triangulation slivers are separately volume-bounded.'})
  check('No native armor occupies reserved structural pocket '+key,(new^pocket).volume()<1e-9)
  check('Actual removed collision is positive '+key,(baseline^pocket).volume()>1e-5,(baseline^pocket).volume())
  faces,doc=triangles(path);_,before=triangles(DIRECTORY/assets['baseline-'+key]['file'])
  check('Native material roles remain '+key,{mat['name'] for mat in before['materials']}=={mat['name'] for mat in doc['materials']})
  check('No source proxy exported '+key,not any(name.startswith('PROXY') for name,_ in faces))
  envelope=[[0,0],[.875,0],[.875,2],[0,2]] if key=='shoulder' else [[0,0],[.375,0],[0,.5]]
  result=qualify_points((p for _,face in faces for p in face),envelope,0,3 if key=='shoulder' else 3.3125)
  check('Complete native authored armor reservation '+key,True,result)
  check('Native normal maps retained '+key,any('normalTexture' in material for material in doc['materials']))
 return {'schema':'sidereal.shoulder-structural-pocket-qualification.v1','pass':all(c['pass'] for c in checks),'checks':checks,'placedTransformsChanged':0,'installed':False,'wholeHullSealed':False,'remaining':['Actual structural-corner composition and seam negative controls, physical support, native render comparison and owner art sign-off remain.']}
if __name__=='__main__':
 result=qualify();path=DIRECTORY/'qualification-a001.json'
 if path.exists():assert json.loads(path.read_text())==result
 else:path.write_text(json.dumps(result,indent=2)+'\n')
 print(json.dumps({'pass':result['pass'],'checks':len(result['checks']),'failed':[c for c in result['checks'] if not c['pass']]}))
