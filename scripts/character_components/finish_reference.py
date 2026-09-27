"""Resume an authored source into a NEW output, preserving failed capture attempts."""
import bpy,json,sys,math,argparse,collections,hashlib,struct
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
p=argparse.ArgumentParser();p.add_argument('--finish-source',required=True);p.add_argument('--output',required=True);p.add_argument('--revision',type=int,default=3);p.add_argument('--renders',action='store_true')
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);OUT=(ROOT/a.output).resolve();SOURCE=(ROOT/a.finish_source).resolve();BASE=ROOT/'assets/art-library/designs/crew.base-and-outfits/revisions/r002/components'
assert OUT.is_relative_to(ROOT) and SOURCE.is_relative_to(ROOT) and not OUT.exists();OUT.mkdir(parents=True)
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));scene=bpy.context.scene;rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');manifest=json.loads(SOURCE.with_name('manifest.json').read_text());built=collections.defaultdict(list)
for o in bpy.data.objects:
 if o.type=='MESH' and o.get('component_id'):built[o['component_id']].append(o)
basegroups=manifest['baseGroups'];changed=set(manifest['focus']['updatedComponents']);(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
def bounds(objects):
 bpy.context.view_layer.update();v=[o.matrix_world@Vector(c) for o in objects for c in o.bound_box];lo=[min(p[i] for p in v) for i in range(3)];hi=[max(p[i] for p in v) for i in range(3)];return {'min':lo,'max':hi,'size':[hi[i]-lo[i] for i in range(3)]}
code=Path(__file__).with_name('reference_study.py').read_text().split('# Controlled capture protocol:')[1]
exec(compile('# Controlled capture protocol:'+code,'reference_study_capture_export','exec'))
