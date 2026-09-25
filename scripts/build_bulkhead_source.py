"""Reference-led reusable wall/airlock: flush mating edges, real metal solids.
64 samples per two-meter tile. Geometry, not a normal map, defines the relief.
"""
from pathlib import Path
import sys, json, math, hashlib
import bpy
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
from voxelize_blender import voxelize
PALETTE={1:'#344550',3:'#80939b',5:'#cf824c',7:'#6fcabd',13:'#393957',14:'#b8b9cf',15:'#8e345b',25:'#939bb7',26:'#aab2c9',27:'#ced0df'}
def linear(c):return c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4
for slug in ['bulkhead','airlock']:
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.preferences.filepaths.save_version=0
 materials={}
 for key,color in PALETTE.items():
  mat=bpy.data.materials.new(f'MAT-{key}');mat.use_nodes=True;mat['voxel_material_id']=key
  p=mat.node_tree.nodes.get('Principled BSDF');rgb=tuple(linear(int(color[i:i+2],16)/255)for i in (1,3,5))
  p.inputs['Base Color'].default_value=(*rgb,1);p.inputs['Metallic'].default_value=.75 if key in (3,5,25) else .35;p.inputs['Roughness'].default_value=.32 if key in (3,5,25)else .43
  if key==7:p.inputs['Emission Color'].default_value=(*rgb,1);p.inputs['Emission Strength'].default_value=3
  materials[key]=mat
 def box(name,x,y,z,w,d,h,material,bevel=.015,priority=0):
  bpy.ops.mesh.primitive_cube_add(size=1,location=(x,y,z+h/2));obj=bpy.context.object;obj.name='GEO-'+name;obj.dimensions=(w,d,h)
  bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);obj.data.materials.append(materials[material]);obj['voxel_priority']=priority
  if bevel:mod=obj.modifiers.new('Machined edge','BEVEL');mod.width=bevel;mod.segments=2
  return obj
 # Full flush side interfaces at ±1 m. Join two copies with a 2 m offset.
 for side in [-1,1]:
  box('structural-jamb-'+str(side),side*.875,0,0,.25,.375,2.5,13,0)
  for face in [-1,1]:
   for course in range(10):
    z=course*.25;shade=[14,26,27,14,25][(course+(1 if side>0 else 0))%5]
    box(f'jamb-block-{side}-{face}-{course}',side*.875,face*.23,z+.015625,.25,.09375,.21875,shade,.009,2)
 for z in [0,2.25]:box('continuous-rail-'+str(z),0,0,z,1.5,.375,.25,13,0)
 if slug=='bulkhead':
  box('solid-pressure-core',0,0,.25,1.5,.25,2,3,0)
  for face in [-1,1]:
   box('dark-panel-recess-'+str(face),0,face*.17,.25,1.5,.0625,2,13,.015,1)
   for col in [-1,1]:
    for row in range(2):
     box(f'enamel-panel-{face}-{col}-{row}',col*.375,face*.22,.34375+row*.9375,.6875,.09375,.8125,14,.03125,2)
     # Studless face courses are shallow relief over a continuous sealed core.
     # Each visible brick contains many fine damage cells, never an empty seam.
     for bx in range(3):
      for bz in range(4):
       shade=[14,26,14,27][(bx+bz+row)%4]
       box(f'face-brick-{face}-{col}-{row}-{bx}-{bz}',col*.375+(bx-1)*.21875,face*.28125,.375+row*.9375+bz*.1875,.1875,.03125,.15625,shade,0,3)
     box(f'inset-service-{face}-{col}-{row}',col*.375,face*.285,.50+row*.9375,.4375,.0625,.4375,25,.03125,3)
     for bolt in [-1,1]:box(f'fastener-{face}-{col}-{row}-{bolt}',col*.375+bolt*.25,face*.29,.40+row*.9375,.0625,.0625,.0625,3,.009,4)
   box('burgundy-access-'+str(face),.38,face*.325,.5625,.375,.0625,.3125,15,.02,4)
   for i in range(5):box(f'vent-{face}-{i}',-.375+i*.078125,face*.285,1.59375,.03125,.0625,.28125,13,0,4)
 else:
  # Leaf is a distinct closed solid. The opening/frame remain separately named
  # in Blender; operating door state will be a gameplay component, not opacity.
  for side in [-1,1]:
   box('pressure-door-leaf-'+str(side),side*.359375,0,.25,.71875,.1875,2,25,.02,1)
   for face in [-1,1]:
    box(f'door-face-{side}-{face}',side*.359375,face*.125,.4375,.53125,.0625,1.5,14,.025,2)
    box(f'door-sill-mark-{side}-{face}',side*.359375,face*.17,.25,.53125,.0625,.125,5,.008,3)
 for face in [-1,1]:
  # Instrument strip, frame recess and fasteners. Every detail spans >= one cell.
  box('lamp-recess-'+str(face),-.875,face*.30,.50,.15625,.0625,1.5,13,.012,3)
  box('emissive-strip-'+str(face),-.875,face*.34,.625,.0625,.0625,1.25,7,.009,4)
  box('status-housing-'+str(face),.875,face*.30,1.0625,.1875,.125,.4375,13,.02,3)
  box('status-screen-'+str(face),.875,face*.38,1.1875,.125,.0625,.1875,7,.008,4)
  for i in range(8):
   box(f'rail-block-{face}-{i}',-.875+i*.25,face*.23,2.25,.21875,.09375,.21875,14 if i%3 else 27,.009,2)
  for i in range(5):
   box(f'lower-conduit-{face}-{i}',-.55+i*.275,face*.24,.0625,.21875,.125,.09375,5,.025,3)
 bpy.context.view_layer.update();source=ROOT/f'assets/source/{slug}.blend'
 bpy.ops.wm.save_as_mainfile(filepath=str(source))
 bpy.ops.export_scene.gltf(filepath=str(ROOT/f'assets/runtime/voxels/{slug}-original.glb'),export_format='GLB',export_apply=True,export_extras=True,export_cameras=False,export_lights=False)
 sampled=voxelize(list(bpy.context.scene.objects),2/64)
 sampled['source']={'file':str(source.relative_to(ROOT)),'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'blender':bpy.app.version_string}
 (ROOT/f'.runtime/art/{slug}-samples.json').write_text(json.dumps(sampled))
 print(json.dumps({'asset':slug,'voxels':len(sampled['cells']),'solidParts':len(sampled['objects'])}))
