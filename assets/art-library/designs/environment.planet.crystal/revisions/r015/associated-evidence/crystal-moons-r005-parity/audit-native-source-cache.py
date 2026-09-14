import bpy,bmesh,json,collections,math
from pathlib import Path
root=Path('/root/sidereal_spacetime/output/playwright/planet-reference-20260914')
reports=[]
for moon in (1,2):
 out=root/f'crystal-moon-{moon}-r005'
 bpy.ops.wm.open_mainfile(filepath=str(out/'kit.blend'))
 obj=next(o for o in bpy.data.objects if o.type=='MESH');m=obj.data;m.calc_loop_triangles()
 cache=json.loads(bpy.data.texts['r005-exact-native-triangle-export-cache.json'].as_string())
 validation=json.loads((out/'orientation-validation.json').read_text())
 prior=json.loads((root/f'crystal-moon-{moon}-r004/kit.json').read_text())['variants'][0]
 uv=m.uv_layers.active
 max_normal_delta=0
 for i,(vertices,polygon) in enumerate(zip(cache['sourceVertexTriangles'],cache['sourcePolygonPerTriangle'])):
  face=m.polygons[polygon]
  authored={m.loops[loop].vertex_index:tuple(uv.data[loop].uv)for loop in face.loop_indices}
  for k,vertex in enumerate(vertices):
   assert vertex in authored
   assert tuple(cache['cornerUVs'][i*3+k])==authored[vertex]
   max_normal_delta=max(max_normal_delta,math.dist(cache['signedCornerNormals'][i*3+k],tuple(face.normal)))
  assert cache['triangleMaterials'][i]==face.material_index
 assert max_normal_delta<1e-4  # Existing native attribute audit tolerance; export normals remain exact.
 current=collections.Counter(tuple(sorted(t.vertices))for t in m.loop_triangles)
 frozen=collections.Counter(tuple(sorted(t))for t in cache['sourceVertexTriangles'])
 delta=sum((current-frozen).values())
 bm=bmesh.new();bm.from_mesh(m);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
 bm.faces.ensure_lookup_table();before=[f.normal.copy()for f in bm.faces]
 assert all(e.is_manifold for e in bm.edges)
 bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
 reversed_count=sum(f.normal.dot(n)<-.99 for f,n in zip(bm.faces,before))
 assert reversed_count==0
 bm.free()
 reports.append({'moon':moon,'nativePolygons':len(m.polygons),'allCacheCornersMatchSourcePolygonPositionUVNormalMaterial':True,
  'nativeNormalTolerance':1e-4,'maximumNativeNormalCacheDelta':max_normal_delta,'nativeDiagnosticRecalcReversals':reversed_count,'sourceEvaluatedTriangles':len(m.loop_triangles),
  'frozenExportTriangles':len(cache['sourceVertexTriangles']),'evaluatedTriangulationDifferences':delta})
(root/'crystal-moons-r005-parity/native-source-cache-audit.json').write_text(json.dumps(reports,indent=2))
print(json.dumps(reports,indent=2))
