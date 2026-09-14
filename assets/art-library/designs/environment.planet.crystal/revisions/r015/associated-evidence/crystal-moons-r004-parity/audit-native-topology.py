import bpy,bmesh,json,sys
from pathlib import Path
root=Path('/root/sidereal_spacetime/output/playwright/planet-reference-20260914');reports=[]
for id in[1,2]:
 bpy.ops.wm.open_mainfile(filepath=str(root/f'crystal-moon-{id}-r004/kit.blend'))
 obj=next(o for o in bpy.data.objects if o.type=='MESH');bm=bmesh.new();bm.from_mesh(obj.data)
 originalFaces=len(bm.faces);originalVertices=len(bm.verts);originalBoundary=sum(e.is_boundary for e in bm.edges)
 bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
 bm.faces.ensure_lookup_table();bm.faces.index_update();before={f.index:(f.normal.copy(),f.material_index,list(f.calc_center_median()))for f in bm.faces}
 boundary=sum(e.is_boundary for e in bm.edges);nonmanifold=sum(not e.is_manifold for e in bm.edges);volumeBefore=bm.calc_volume(signed=True)
 bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));flips=[{'face':f.index,'material':before[f.index][1],'center':before[f.index][2],'dot':f.normal.dot(before[f.index][0])}for f in bm.faces if f.normal.dot(before[f.index][0])<-.99]
 reports.append({'id':id,'nativeFaces':originalFaces,'nativeVertices':originalVertices,'nativeBoundaryEdges':originalBoundary,'geometricallyWeldedVertices':len(bm.verts),'weldedBoundaryEdges':boundary,'weldedNonManifoldEdges':nonmanifold,'signedVolumeBefore':volumeBefore,'signedVolumeConsistentAfter':bm.calc_volume(signed=True),'facesWithInconsistentWinding':len(flips),'flips':flips});bm.free()
(root/'crystal-moons-r004-parity/native-topology-audit.json').write_text(json.dumps(reports,indent=2));print(json.dumps([{k:v for k,v in r.items()if k!='flips'}for r in reports],indent=2))
