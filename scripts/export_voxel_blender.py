"""Build editable Blender geometry and GLB from the exact chunk-meshed voxel source."""
from pathlib import Path
import json, hashlib, sys
import bpy
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
from voxel_visual_surface import welded_surface, bevel_surface
from ship_materials import create_polymer, ship_surface_slot, preserve_polymer_ior
assembly='--assembly' in sys.argv
staged='--staged-plastic' in sys.argv
data=json.loads((ROOT/('.runtime/art/assembly-meshes.json' if assembly else '.runtime/art/voxel-meshes.json')).read_text())
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.unit_settings.system='METRIC'
normal_image=bpy.data.images.load(str(ROOT/'assets/runtime/materials/brushed-normal.png'));normal_image.colorspace_settings.name='Non-Color'
rough_image=bpy.data.images.load(str(ROOT/'assets/runtime/materials/brushed-roughness.png'));rough_image.colorspace_settings.name='Non-Color'
def surface(name,metallic,roughness,textured=True):
 mat=bpy.data.materials.new(name);mat.use_nodes=True;nodes=mat.node_tree.nodes;links=mat.node_tree.links
 attribute=nodes.new('ShaderNodeVertexColor');attribute.layer_name='palette'
 bsdf=nodes.get('Principled BSDF');bsdf.inputs['Roughness'].default_value=roughness;bsdf.inputs['Metallic'].default_value=metallic
 links.new(attribute.outputs['Color'],bsdf.inputs['Base Color'])
 if textured:
  normal=nodes.new('ShaderNodeTexImage');normal.image=normal_image
  normal_map=nodes.new('ShaderNodeNormalMap');normal_map.inputs['Strength'].default_value=.45
  links.new(normal.outputs['Color'],normal_map.inputs['Color']);links.new(normal_map.outputs['Normal'],bsdf.inputs['Normal'])
  grain=nodes.new('ShaderNodeTexImage');grain.image=rough_image
  separate=nodes.new('ShaderNodeSeparateColor');links.new(grain.outputs['Color'],separate.inputs['Color']);links.new(separate.outputs['Green'],bsdf.inputs['Roughness'])
 return mat
mat=surface('MAT-structural-polymer',0,.36,False)
mat.node_tree.nodes.get('Principled BSDF').inputs['Coat Weight'].default_value=.08
mid_polymer=create_polymer(surface,'mid')
light_polymer=create_polymer(surface,'light')
dark_polymer=create_polymer(surface,'dark')
accent_polymer=create_polymer(surface,'accent')
steel=surface('MAT-exposed-steel',.8,.3)
soft=surface('MAT-soft-furnishings',0,.82,False)
rubber=surface('MAT-rubber',0,.68,False)
botanical=surface('MAT-botanical-polymer',0,.66,False)
soil=surface('MAT-potting-soil',0,.88,False)
def emitter(name,color,strength):
 mat=bpy.data.materials.new(name);mat.use_nodes=True;p=mat.node_tree.nodes.get('Principled BSDF')
 p.inputs['Base Color'].default_value=(*color,1);p.inputs['Emission Color'].default_value=(*color,1)
 p.inputs['Emission Strength'].default_value=strength;p.inputs['Roughness'].default_value=.28
 return mat
glow_mat=emitter('MAT-Cyan-instruments',(.015,.52,.65),2.5)
warm_mat=emitter('MAT-Warm-fixtures',(1,.57,.24),2.5)
blue_mat=emitter('MAT-Blue-instruments',(.025,.35,.8),2.5)
purple_mat=emitter('MAT-Purple-instruments',(.45,.055,.7),2)
def linear(c):return c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4
palette=[tuple(linear(int(h[i:i+2],16)/255) for i in (1,3,5))+(1.,) for h in data['palette']]
surface_metrics=[]
for part in data['meshes']:
 mesh=bpy.data.meshes.new('GEO-'+part['name']);vertices,faces=welded_surface(part);mesh.from_pydata(vertices,[],faces);mesh.update()
 obj=bpy.data.objects.new('GEO-'+part['name'],mesh);bpy.context.collection.objects.link(obj);mesh.materials.append(mat);mesh.materials.append(glow_mat);mesh.materials.append(steel);mesh.materials.append(soft);mesh.materials.append(warm_mat);mesh.materials.append(blue_mat);mesh.materials.append(rubber);mesh.materials.append(purple_mat);mesh.materials.append(botanical);mesh.materials.append(soil);mesh.materials.append(light_polymer);mesh.materials.append(dark_polymer);mesh.materials.append(accent_polymer);mesh.materials.append(mid_polymer)
 mesh.uv_layers.new(name='material-meters')
 mesh.color_attributes.new(name='palette',type='FLOAT_COLOR',domain='CORNER')
 # Adding a custom-data layer can invalidate prior RNA layer references.
 # Reacquire BOTH after allocation; otherwise UV writes corrupt vertex colors.
 uv=mesh.uv_layers['material-meters'];colors=mesh.color_attributes['palette']
 for polygon,material in zip(mesh.polygons,part['materials']):
  polygon.material_index=ship_surface_slot(material,part['name'],assembly)
  axis=max(range(3),key=lambda a:abs(polygon.normal[a]));u=(axis+1)%3;v=(axis+2)%3
  for loop in polygon.loop_indices:
   colors.data[loop].color=palette[material]
   point=mesh.vertices[mesh.loops[loop].vertex_index].co;uv.data[loop].uv=(point[u]*2,point[v]*2)
 obj['sidereal_layer']=part['name'];obj['voxel_cell_meters']=part.get('cellMeters',.0625)
 if 'room-hydroponics-tray-' in part['name']:obj['botanical_visual']='authored Blender surface over immutable solid samples'
 surface_metrics.append(bevel_surface(obj,part.get('cellMeters',.0625)))
surface_path=ROOT/('assets/runtime/assembly/surface-metrics.json' if assembly else 'assets/runtime/voxels/surface-metrics.json')
if staged:surface_path=ROOT/'.runtime/art/plastic-surface-metrics.json'
surface_path.write_text(json.dumps(surface_metrics,indent=2)+'\n')
(ROOT/('.runtime/art/assembly-surfaces.json' if assembly else '.runtime/art/ship-surfaces.json')).write_text(json.dumps(surface_metrics,indent=2))
print(json.dumps({'visual_triangles':sum(m['triangles'] for m in surface_metrics),'beveled_edges':sum(m['beveledEdges'] for m in surface_metrics),'nonmanifold_edges':sum(m['nonmanifoldEdges'] for m in surface_metrics)}))
out=ROOT/('assets/runtime/assembly/parts.glb' if assembly else 'assets/runtime/voxels/wayfarer.glb')
source=ROOT/('assets/source/modular_parts.blend' if assembly else 'assets/source/voxel_wayfarer.blend')
if staged:
 out=ROOT/'.runtime/art/wayfarer-plastic.glb';source=ROOT/'.runtime/art/wayfarer-plastic.blend'
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(source))
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',export_apply=True,export_cameras=False,export_lights=False,export_extras=True)
preserve_polymer_ior(out)
if staged:
 print(json.dumps({'staged_glb':str(out),'staged_source':str(source)}));sys.exit(0)
if assembly:
 paths=[source]+sorted(p for p in (ROOT/'assets/runtime/assembly').rglob('*') if p.is_file() and p.name!='manifest.json')
 manifest={'schema':'sidereal.assembly-assets.v1','blender':bpy.app.version_string,'outputs':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}}
 (ROOT/'assets/runtime/assembly/manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
 print(json.dumps({'part_catalog':str(out),'mesh_layers':len(data['meshes'])}))
 sys.exit(0)
manifest={'schema':'sidereal.voxel-asset.v1','blender':bpy.app.version_string,'date':'2026-09-08','status':'visual and meshing study; damage authority pending','sources':['packages/content/src/voxel-wayfarer.ts','packages/content/src/voxel-wayfarer-shell.ts','packages/content/src/voxel-wayfarer-interior.ts','assets/source/ship_wall_fixture.blend','scripts/build_ship_fixture_source.py','scripts/voxelize_blender.py','packages/sim/src/voxels.ts','scripts/build_voxel.ts','scripts/build_metal_materials.py','scripts/export_voxel_blender.py','scripts/ship_materials.py','scripts/voxel_visual_surface.py','packages/content/src/voxel-ownership.ts','packages/content/src/voxel-wayfarer-props.ts','scripts/build_interior_prop_source.py','assets/source/interior_hydroponics.blend'],'outputs':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [source,out,ROOT/'assets/runtime/voxels/wayfarer.voxels.json',surface_path]}}
(ROOT/'assets/runtime/voxels/manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'blender_saved':str(source),'glb':str(out),'objects':len(data['meshes'])}))

# Export an independent reusable voxel asteroid without changing the ship source.
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version=0
part=json.loads((ROOT/'.runtime/art/asteroid-mesh.json').read_text())
mesh=bpy.data.meshes.new('GEO-asteroid');mesh.from_pydata(part['vertices'],[],part['faces']);mesh.update()
obj=bpy.data.objects.new('GEO-asteroid',mesh);bpy.context.collection.objects.link(obj)
stone=bpy.data.materials.new('MAT-asteroid');stone.use_nodes=True
attr=stone.node_tree.nodes.new('ShaderNodeVertexColor');attr.layer_name='palette'
shader=stone.node_tree.nodes.get('Principled BSDF');shader.inputs['Roughness'].default_value=1
stone.node_tree.links.new(attr.outputs['Color'],shader.inputs['Base Color']);mesh.materials.append(stone)
colors=mesh.color_attributes.new(name='palette',type='FLOAT_COLOR',domain='CORNER')
for polygon,material in zip(mesh.polygons,part['materials']):
 for loop in polygon.loop_indices:colors.data[loop].color=palette[material]
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/source/voxel_asteroid.blend'))
bpy.ops.export_scene.gltf(filepath=str(ROOT/'assets/runtime/voxels/asteroid.glb'),export_format='GLB',export_cameras=False,export_lights=False)
