import json,numpy as np,manifold3d as m
import native_csg
native_csg.CSG_FLOAT32=True  # Original a006 authoring operand precision, retained for reproducibility.
from native_csg import *
floor=solid('floor','GEO-part-0b833a4f3016609e9b96--floor')
fs=m.Manifold.batch_boolean([floor.translate([x,y,0])for x,y in [(-1,-1),(-1,0),(0,-1),(0,0)]],m.OpType.Add)
plug=m.Manifold.cube([.012,.012,.1875]).translate([-.006,-.006,0])-fs
fixture=json.load(open(R/'shipyard.structure.boundary-kit/revisions/r005/final-a004/interfaces.json'))['fixtures'][-1]
contacts=m.Manifold.batch_boolean([solid('contact','GEO-boundary-r005-'+p['partId']+'--surface').rotate([0,0,p['quarterTurns']*90]).translate([p['originUnits'][0]/32-2,p['originUnits'][1]/32-1,0])for p in fixture['placements']],m.OpType.Add)
variants={'interior-four-quarter':plug,'partition-four-quarter':plug-contacts}
res={}
for name,part in variants.items():
 part=part.simplify(1e-7);assert part.status()==m.Error.NoError,(name,part.status());mesh=part.to_mesh();res[name]={'vertices':mesh.vert_properties[:,:3].tolist(),'triangles':mesh.tri_verts.tolist(),'volumeM3':part.volume(),'status':str(part.status()),'boundsM':part.bounding_box()};print(name,part.volume(),part.num_tri(),flush=True)
Path('.runtime/construction-enclosure-audit/rederived-junction-raw.json').write_text(json.dumps(res,indent=2)+'\n')
strip=solid('strip','GEO-door-flush-seam-contact--surface')
reserved=strip-contacts.rotate([0,0,-90])
print('strip overlap before', (strip^contacts.rotate([0,0,-90])).volume(), 'after', (reserved^contacts.rotate([0,0,-90])).volume())
variants['door-strip-reserved']=reserved
res={}
for name,part in variants.items():
 for i in range(3):
  part=part.simplify(5e-7);mesh=part.to_mesh();part=m.Manifold(m.Mesh(np.array(mesh.vert_properties,dtype=np.float32,order='C'),np.array(mesh.tri_verts,dtype=np.uint32,order='C')))
 assert part.status()==m.Error.NoError,(name,part.status());mesh=part.to_mesh();res[name]={'vertices':mesh.vert_properties[:,:3].tolist(),'triangles':mesh.tri_verts.tolist(),'volumeM3':part.volume(),'status':str(part.status()),'boundsM':part.bounding_box()};print(name,part.volume(),part.num_tri(),flush=True)
Path('.runtime/construction-enclosure-audit/rederived-junction-clean.json').write_text(json.dumps(res,indent=2)+'\n')
