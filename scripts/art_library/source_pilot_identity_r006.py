from pathlib import Path
import bpy,json
root=Path(__file__).resolve().parents[2];out=root/'.runtime/art-library/hull/r006';mapping=json.loads((out/'placement-identity-correction.json').read_text())['mapping'];bpy.ops.wm.open_mainfile(filepath=str(out/'pilot-kit.blend'))
for o in bpy.data.objects:
 if o.name in mapping:o.name=mapping[o.name]
 if o.get('placed_object_id') in mapping:o['placed_object_id']=mapping[o['placed_object_id']]
bpy.ops.wm.save_as_mainfile(filepath=str(out/'pilot-kit.blend'))
