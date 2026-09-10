"""Export corrected native side walls and exact retained historical partitions."""
import bpy
import hashlib
import json
import math
from pathlib import Path
import sys
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(sys.argv[sys.argv.index('--')+1])
plan_path = ROOT/'.runtime/usable-wall-side-expansion.json'
plan = json.loads(plan_path.read_text())
source = OUT.parent/'a005/blender-source.blend'
bpy.ops.wm.open_mainfile(filepath=str(source))
canonical = list(bpy.data.collections['NATIVE-straight-2m'].objects)
assert len(canonical)==22
source_objects = set(bpy.data.objects)
legacy = ROOT/'assets/runtime/assembly/parts.glb'
expected = {n['sourceSha256'] for p in plan['pairs'] for n in p['preservedPartitionNodes']}
assert expected=={hashlib.sha256(legacy.read_bytes()).hexdigest()}
bpy.ops.import_scene.gltf(filepath=str(legacy))
imported = set(bpy.data.objects)-source_objects
by_name = {o.name:o for o in imported}
parts=[]
for pair_index,pair in enumerate(plan['pairs']):
    rotation = Matrix.Rotation(pair['canonicalSourceQuarterTurns']*math.pi/2,4,'Z')
    for exterior in [True,False]:
        role = 'exterior' if exterior else 'interior'
        ident = pair[role+'Id']
        key = f'bay{pair_index:02}-{role}'
        objects=[]; retained=[]
        transform = Matrix.Translation(Vector(pair['nativeSourceFrame'+role.title()+'TranslationM']))@rotation
        for index,original in enumerate(canonical):
            if original.name.endswith('--continuous-body')!=exterior:
                continue
            obj=original.copy(); obj.data=original.data.copy()
            obj.name=f'GEO-{key}--native-{index:02}'
            obj['source_name']=original.name
            obj['interface_role']='new-outward-structure' if exterior else 'new-outward-facing'
            bpy.context.scene.collection.objects.link(obj)
            obj.matrix_world=transform@original.matrix_world
            objects.append(obj)
        if not exterior:
            for index,record in enumerate(pair['preservedPartitionNodes']):
                original=by_name[record['sourceNode']]
                assert original.type=='MESH'
                obj=original.copy(); obj.data=original.data.copy()
                obj.name=f'GEO-{key}--retained-partition-{index:02}'
                obj['source_name']=original.name
                obj['interface_role']='preserved-historical-partition-not-pressure-qualified'
                bpy.context.scene.collection.objects.link(obj)
                obj.matrix_world=original.matrix_world.copy()
                objects.append(obj)
                retained.append({**record,'exportNode':obj.name})
        collection=bpy.data.collections.new('CANDIDATE-'+key)
        bpy.context.scene.collection.children.link(collection)
        for obj in objects:
            for old in list(obj.users_collection): old.objects.unlink(obj)
            collection.objects.link(obj)
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:
            obj.hide_set(False);obj.hide_render=False;obj.select_set(True)
        path=OUT/(key+'.glb')
        bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,
                                export_apply=True,export_texcoords=True,export_normals=True,export_tangents=True)
        parts.append({'id':key,'file':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
            'nodePrefix':'GEO-'+key+'--','sourcePlacedId':ident,'originalPlacement':pair['original'+role.title()+'Placement'],
            'preservedPartitions':retained,'sourceFrame':[list(row) for row in transform],
            'newSurfaceRole':'outward-structure' if exterior else 'outward-facing','pressureReady':False})
# Preserve only authored canonical source, its editable hidden operands/proxies,
# and new candidate objects. Imported legacy objects are retained only as copies
# with explicit role/provenance above, never bulk-exported into replacement art.
for obj in imported: bpy.data.objects.remove(obj,do_unlink=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'blender-source.blend'))
manifest={'schema':'sidereal.usable-wall-side-bays.v1','parts':parts,
    'sourceBlend':str(source.relative_to(ROOT)),'sourceBlendSha256':hashlib.sha256(source.read_bytes()).hexdigest(),
    'legacyPartitionsSource':str(legacy.relative_to(ROOT)),'legacyPartitionsSha256':next(iter(expected)),
    'sourceMappingSha256':plan['sourceMappingSha256'],'originalPlacementCount':262,
    'placedTransformsChanged':0,'originalIdsRemoved':[],'installed':False,'ownerFinalSignoff':None,
    'status':'native-export-awaiting-qualification','limits':plan['limits']}
(OUT/'delivery-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
(OUT/'side-bay-plan.json').write_text(json.dumps(plan,indent=2)+'\n')
print(json.dumps({'parts':len(parts),'output':str(OUT)}))
