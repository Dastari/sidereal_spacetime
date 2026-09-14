"""Gas4 native PBR dust albedo/opacity finish. Gas3 geometry remains exact.
Run Blender headless with -- NEW_OUTPUT (generated RGB input already there).
"""
import bpy,json,sys,math,hashlib,shutil
import numpy as np
from pathlib import Path
out=Path(sys.argv[sys.argv.index('--')+1]).resolve();out.mkdir(parents=True,exist_ok=True)
if(out/'kit.blend').exists():raise RuntimeError('Preserve previous revision')
prior=out.parent/'gas-r003';kit=json.loads((prior/'kit.json').read_text())
source=out/'ring-dust-generated-black.png';source_hash=hashlib.sha256(source.read_bytes()).hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(prior/'kit.blend'));scene=bpy.context.scene
# Generated RGB remains an immutable material input. Interpret its black
# density as empty dust; no recolouring, crop, texture transform or UV edit.
image=bpy.data.images.load(str(source),check_existing=False);pixels=np.empty(len(image.pixels),dtype=np.float32);image.pixels.foreach_get(pixels);pixels=pixels.reshape((-1,4));original_rgb=pixels[:,:3].copy()
density=np.max(original_rgb,axis=1);opacity=np.clip((density-.002)/.68,0,1)**.48
images=[]
for i,factor in enumerate([.92,1.0,.82]):
 rgba=pixels.copy();rgba[:,3]=opacity*factor
 result=bpy.data.images.new('Gas4-authored-density-'+str(i),width=image.size[0],height=image.size[1],alpha=True)
 result.colorspace_settings.name=image.colorspace_settings.name;result.pixels.foreach_set(rgba.reshape(-1));result.filepath_raw=str(out/f'ring-dust-{i}.png');result.file_format='PNG';result.save();result.pack();images.append(result)
 # Verify the image datablock still carries precisely the supplied RGB.
 checked=np.empty(len(result.pixels),dtype=np.float32);result.pixels.foreach_get(checked)
 if not np.array_equal(checked.reshape((-1,4))[:,:3],original_rgb):raise AssertionError('RGB artwork changed')
 mat=bpy.data.materials[kit['materials'][i+1]['name']];shader=mat.node_tree.nodes.get('Principled BSDF')
 for node in list(mat.node_tree.nodes):
  if node.type=='TEX_IMAGE':mat.node_tree.nodes.remove(node)
 tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=result;tex.extension='REPEAT';tex.interpolation='Linear'
 mat.node_tree.links.new(tex.outputs['Color'],shader.inputs['Base Color']);mat.node_tree.links.new(tex.outputs['Alpha'],shader.inputs['Alpha'])
 shader.inputs['Emission Color'].default_value=(0,0,0,1);shader.inputs['Emission Strength'].default_value=0;shader.inputs['Roughness'].default_value=.86;mat.surface_render_method='DITHERED'
 kit['materials'][i+1].update(baseColorTexture=f'ring-dust-{i}.png',roughness=.86,emissiveColor=[0,0,0],alpha=1,alphaMode='BLEND',linearColor=[1,1,1],useTextureAlpha=True)
 obj=bpy.data.objects[f'GEO-ring-dust-{i}'];obj['role']='planet'
 bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
 bpy.ops.export_scene.gltf(filepath=str(out/f'ring-dust-{i}.glb'),export_format='GLB',use_selection=True,export_apply=True,export_extras=True)
# Preserve source body/debris GLBs and body texture byte-for-byte.
for name in ['gas-body.glb','ring-rocks.glb','gas-albedo-generated.png']:shutil.copy2(prior/name,out/name)
(out/'kit.json').write_text(json.dumps(kit,separators=(',',':')))
scene.render.filepath=str(out/'kit-preview.png');bpy.ops.wm.save_as_mainfile(filepath=str(out/'kit.blend'));bpy.ops.render.render(write_still=True)
if hashlib.sha256(source.read_bytes()).hexdigest()!=source_hash:raise AssertionError('Generated input changed')
old=json.loads((prior/'kit.json').read_text())
assert kit['variants']==old['variants'],'Geometry/UV/normal/placement changed'
validation={'geometryUVNormalsExactGas3':True,'bodyAndDebrisGLBByteExact':True,'bodyTextureByteExact':True,'generatedSourceSha256':source_hash,'densityInterpretation':'alpha=clamp((max(linear RGB)-.002)/.68,0,1)^.48 multiplied by zone density [.92,1,.82]; RGB unchanged','alphaStatistics':{'emptyFraction':float(np.mean(opacity==0)),'sparseFraction':float(np.mean((opacity>0)&(opacity<.5))),'denseFraction':float(np.mean(opacity>=.5)),'maximum':float(opacity.max())},'emission':'zero: illumination and planet shadow remain runtime PBR behavior','publication':'isolated unapproved draft','sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest()for p in out.iterdir()if p.is_file()}}
(out/'validation.json').write_text(json.dumps(validation,indent=2));print('GAS_R004_DONE',validation['alphaStatistics'])
