import bpy,json,sys,hashlib
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
root=Path('.runtime/construction-boundary-kit/r003/attempt-a001')
path=Path('assets/runtime/assembly/floor/r002/kit.glb')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(path.resolve()))
result={'source':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'parts':{}}
for ob in bpy.context.scene.objects:
 if ob.type!='MESH':continue
 ob.data.calc_loop_triangles();vs=[tuple(ob.matrix_world@v.co)for v in ob.data.vertices]
 tris=[[vs[i]for i in t.vertices]for t in ob.data.loop_triangles]
 result['parts'][ob.name]={'triangles':tris,'min':[min(v[i]for v in vs)for i in range(3)],'max':[max(v[i]for v in vs)for i in range(3)]}
(root/'floor-native-triangles.json').write_text(json.dumps(result))
print(json.dumps({k:{'min':v['min'],'max':v['max'],'triangles':len(v['triangles'])}for k,v in result['parts'].items()},indent=2))
