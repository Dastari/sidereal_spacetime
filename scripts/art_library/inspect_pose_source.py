import bpy,json
from mathutils import Vector
from pathlib import Path
root=Path(__file__).resolve().parents[2]
bpy.ops.wm.open_mainfile(filepath=str(root/'assets/source/crew-astra.blend'))
result={}
for obj in bpy.data.objects:
 if obj.type=='MESH' and any(t in str(obj.get('attachment','')) for t in ['helmet','visor','armor']):
  p=[obj.matrix_world@Vector(c) for c in obj.bound_box]
  result[obj.name]=[[round(min(v[a] for v in p),4),round(max(v[a] for v in p),4)] for a in range(3)]
print(json.dumps(result,indent=2))
