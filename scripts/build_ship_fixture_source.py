"""Editable warm wall strip → evaluated bevelled solids → 6.25cm matter cells.

Canonical art:voxels invokes this before meshing. No decorative voxel skin:
closed Blender solids are scan-converted by voxelize_blender.voxelize.
"""
from pathlib import Path
import json, sys, hashlib
import bpy
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from voxelize_blender import voxelize
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version=0
bpy.context.scene.unit_settings.system='METRIC'
materials={}
for key,color,metal,rough in [(13,'393957',0,.38),(27,'ced0df',0,.32),(3,'80939b',.8,.3),(31,'ffd7a1',0,.28)]:
    material=bpy.data.materials.new('MAT-ship-fixture-'+str(key));material.use_nodes=True;material['voxel_material_id']=key
    rgb=tuple((int(color[i:i+2],16)/255/12.92 if int(color[i:i+2],16)/255<=.04045 else ((int(color[i:i+2],16)/255+.055)/1.055)**2.4) for i in (0,2,4))
    p=material.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*rgb,1)
    p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    if key==31:p.inputs['Emission Color'].default_value=(*rgb,1);p.inputs['Emission Strength'].default_value=2.5
    materials[key]=material

def box(name,x,y,z,w,d,h,key,bevel=.03125):
    bpy.ops.mesh.primitive_cube_add(size=1,location=(x,y,z+h/2));obj=bpy.context.object;obj.name='GEO-'+name;obj.dimensions=(w,d,h)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    obj.data.materials.append(materials[key])
    if bevel:
        mod=obj.modifiers.new('Manufactured chamfer','BEVEL');mod.width=bevel;mod.segments=1
    return obj
# Local +X faces into the room; backplane 0.125m thick, broad chamfered shoulders.
box('sealed-mount',0,0,0,.125,1.375,.375,13)
box('pale-shoulder',.0625,0,.0625,.125,1.25,.3125,27)
box('dark-recess',.125,0,.125,.125,1.0625,.1875,13,.015625)
box('warm-diffuser',.1875,0,.1875,.0625,.8125,.0625,31,.008)
for y in [-.5625,.5625]:box('steel-end-clip-'+str(y),.15625,y,.125,.0625,.125,.1875,3,.008)
source=ROOT/'assets/source/ship_wall_fixture.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(source))
sampled=voxelize(list(bpy.context.scene.objects),.0625)
folder=ROOT/'assets/runtime/voxels';folder.mkdir(parents=True,exist_ok=True)
out=folder/'ship-wall-fixture.voxels.json';out.write_text(json.dumps(sampled,separators=(',',':')))
original=folder/'ship-wall-fixture-original.glb'
bpy.ops.export_scene.gltf(filepath=str(original),export_format='GLB',export_apply=True,export_cameras=False,export_lights=False)
manifest={'schema':'sidereal.ship-fixture-source.v1','cellMeters':.0625,'occupied':len(sampled['cells']),'status':'Blender solid sampled and stamped into Wayfarer cutaway layers','outputs':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [source,out,original]},'tools':{str(p):hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in ['scripts/build_ship_fixture_source.py','scripts/voxelize_blender.py']}}
(folder/'ship-wall-fixture-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'ship_fixture_cells':len(sampled['cells']),'source':str(source)}))
