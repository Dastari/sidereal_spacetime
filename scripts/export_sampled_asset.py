"""Export the sampled engine with its original PBR/emissive material identities."""
import bpy, json, hashlib, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
slug=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'engine-pod'
if slug not in ('engine-pod','bulkhead','airlock'):raise ValueError('Unknown asset')
data=json.loads((ROOT/f'.runtime/art/{slug}-mesh.json').read_text())
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version=0
mesh=bpy.data.meshes.new('GEO-'+slug);mesh.from_pydata(data['vertices'],[],data['faces']);mesh.update()
obj=bpy.data.objects.new('GEO-'+slug,mesh);bpy.context.collection.objects.link(obj)
for descriptor in data['palette'][1:]:
    material=bpy.data.materials.new(descriptor['name']);material.use_nodes=True
    p=material.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*descriptor['color'],1)
    p.inputs['Metallic'].default_value=descriptor['metallic'];p.inputs['Roughness'].default_value=descriptor['roughness']
    p.inputs['Emission Color'].default_value=(*descriptor['emission'],1)
    p.inputs['Emission Strength'].default_value=descriptor['emissionStrength']
    mesh.materials.append(material)
for face,material in zip(mesh.polygons,data['materials']):face.material_index=material-1
obj['cell_meters']=data['cellMeters'];obj['source']=slug.replace('-','_')+'.blend'
source=ROOT/f'assets/source/{slug.replace(chr(45),chr(95))}_voxel.blend';out=ROOT/f'assets/runtime/voxels/{slug}.glb'
bpy.ops.wm.save_as_mainfile(filepath=str(source))
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',export_extras=True,export_cameras=False,export_lights=False)
paths=[source,out,ROOT/f'assets/source/{slug.replace(chr(45),chr(95))}.blend',ROOT/f'assets/runtime/voxels/{slug}-original.glb',ROOT/f'assets/runtime/voxels/{slug}.voxels.json']
manifest={'schema':'sidereal.mesh-to-voxel.v1','blender':bpy.app.version_string,'cellMeters':data['cellMeters'],'outputs':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},'tools':{p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in ['scripts/voxelize_blender.py',('scripts/build_engine_source.py' if slug=='engine-pod' else 'scripts/build_bulkhead_source.py'),'scripts/mesh_sampled_asset.ts','scripts/export_sampled_asset.py']}}
(ROOT/f'assets/runtime/voxels/{slug}-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'exported':str(out),'materials':len(mesh.materials)}))
