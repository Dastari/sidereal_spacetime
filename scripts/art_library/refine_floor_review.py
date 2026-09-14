"""Preserve r001 and reuse its actual Blender bakes in a new tangent-safe revision."""
from pathlib import Path
import bpy
import hashlib
import json
import shutil
import sys

OUT=Path(sys.argv[sys.argv.index('--')+1]);REV=int(OUT.name[1:]);PREV=OUT.parent/f'r{REV-1:03}'
if (OUT/'floor-kit.blend').exists():raise ValueError('Refusing to overwrite source revision')
bpy.ops.wm.open_mainfile(filepath=str(PREV/'floor-kit.blend'))
shutil.copytree(PREV/'maps',OUT/'maps',dirs_exist_ok=True)
components=json.loads((PREV/'components.json').read_text())
recipe_hash=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
masters=bpy.data.collections['RUNTIME-MASTERS']
for im in bpy.data.images:
    if im.filepath and Path(im.filepath).name in [p.name for p in (OUT/'maps').iterdir()]:
        im.filepath=str(OUT/'maps'/Path(im.filepath).name)
for m in bpy.data.materials:m.use_backface_culling=True
def export(objects,path):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.hide_set(False);o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_apply=True,
       export_yup=True,export_materials='EXPORT',export_tangents=True)
for c in components:
    o=bpy.data.objects[c['node_prefix']]
    o.modifiers.new('Explicit triangles for tangent export','TRIANGULATE')
    asset_id='part-'+hashlib.sha256((c['id']+recipe_hash+str(REV)).encode()).hexdigest()[:20]
    o.name='GEO-'+asset_id+'--floor';o['asset_id']=asset_id;o['revision']=REV
    c.update(id=asset_id,node_prefix=o.name,source_mesh='floor-kit.blend / RUNTIME-MASTERS / '+o.name)
    evaluated=o.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh();evaluated.calc_loop_triangles()
    c['runtime_triangles']=len(evaluated.loop_triangles)
    o.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh_clear()
    d=OUT/c['slug'];d.mkdir(exist_ok=True);export([o],d/'model.glb')
export(list(masters.objects),OUT/'kit.glb')
for o in masters.objects:o.hide_set(True);o.hide_render=True
(OUT/'components.json').write_text(json.dumps(components,indent=2)+'\n')
spec=json.loads((PREV/'specification.json').read_text());spec.update(revision=REV,components=components,
 change='Triangulate evaluated perimeter mesh before exporting tangents; enable backface culling for closed floor solids.',
 map_provenance={'source_revision':REV-1,'source_blend_sha256':hashlib.sha256((PREV/'floor-kit.blend').read_bytes()).hexdigest(),
 'maps':'Byte-identical real Cycles bakes copied from prior source revision; no resampling or invented generation.'})
(OUT/'specification.json').write_text(json.dumps(spec,indent=2)+'\n')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'floor-kit.blend'))
print('FLOOR_REFINEMENT_COMPLETE',flush=True)
