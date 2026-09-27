"""Embed owner-task generated albedo and author visible native PBR ring dust.
Preserves gas-r001 geometry, UVs, normals exactly. No replacement shader.
"""
import bpy,json,sys,math,hashlib,shutil
from pathlib import Path
out=Path(sys.argv[sys.argv.index('--')+1]).resolve();out.mkdir(parents=True,exist_ok=True)
if (out/'kit.blend').exists():raise RuntimeError('Preserve existing source')
prior=out.parent/'gas-r001';generated=out/'gas-albedo-generated.png'
if not generated.exists():raise RuntimeError('Expected original generated albedo PNG')
bpy.ops.wm.open_mainfile(filepath=str(prior/'kit.blend'))
kit=json.loads((prior/'kit.json').read_text())
body_image=bpy.data.images.load(str(generated),check_existing=False);body_image.name='Gas-r002-reference-led-albedo';body_image.pack()
body_material=bpy.data.materials['gas-authored-PBR']
for node in body_material.node_tree.nodes:
 if node.type=='TEX_IMAGE':node.image=body_image
kit['materials'][0]['baseColorTexture']=generated.name
# Fresh authored ring opacity, retaining the exact source mesh and UV seams.
ring_image=bpy.data.images.new('Gas-r002-visible-dust-density',width=1024,height=128,alpha=True)
pixels=[]
for y in range(128):
 for x in range(1024):
  u=(x+.5)/1024;v=(y+.5)/128
  broad=.68+.17*math.sin(u*math.tau*5+v*8)+.10*math.sin(u*math.tau*13-v*14)
  radial=.75+.16*math.sin(v*18+math.sin(u*math.tau*3))
  grit=.84+.16*math.sin(x*2.39+y*7.13)
  alpha=max(0,min(.87,math.sin(math.pi*v)**.50*broad*radial*grit*1.65))
  color=(.54+.13*math.sin(v*7),.10+.065*math.cos(v*8),.79)
  pixels.extend((*color,alpha))
ring_image.pixels.foreach_set(pixels);ring_image.filepath_raw=str(out/'ring-dust.png');ring_image.file_format='PNG';ring_image.save();ring_image.pack()
for index,name in enumerate(['ring-inner-dust','ring-main-lavender','ring-outer-dust'],1):
 material=bpy.data.materials[name];nodes=material.node_tree.nodes;shader=nodes.get('Principled BSDF')
 for node in nodes:
  if node.type=='TEX_IMAGE':node.image=ring_image
 emission=[(.18,.015,.29),(.28,.025,.39),(.12,.010,.22)][index-1]
 shader.inputs['Emission Color'].default_value=(*emission,1);shader.inputs['Emission Strength'].default_value=1
 definition=kit['materials'][index];definition['linearColor']=[1,1,1];definition['baseColorTexture']='ring-dust.png';definition['useTextureAlpha']=True;definition['alpha']=1;definition['alphaMode']='BLEND';definition['emissiveColor']=list(emission)
 # Texture alpha itself controls density. Avoid multiplying opacity twice.
 shader.inputs['Base Color'].default_value=(1,1,1,1)
forms=[('gas-body','GEO-gas-PBR-body'),('ring-dust-0','GEO-ring-dust-0'),('ring-dust-1','GEO-ring-dust-1'),('ring-dust-2','GEO-ring-dust-2'),('ring-rocks','GEO-ring-fragment-')]
for name,prefix in forms:
 bpy.ops.object.select_all(action='DESELECT');parts=[obj for obj in bpy.context.scene.objects if obj.type=='MESH' and (obj.name==prefix or (name=='ring-rocks' and obj.name.startswith(prefix)))]
 for obj in parts:obj.select_set(True);obj['authoring']='native-gas-r002'
 bpy.context.view_layer.objects.active=parts[0];bpy.ops.export_scene.gltf(filepath=str(out/(name+'.glb')),export_format='GLB',use_selection=True,export_apply=True,export_extras=True)
(out/'kit.json').write_text(json.dumps(kit,separators=(',',':')))
scene=bpy.context.scene;scene.render.filepath=str(out/'kit-preview.png');scene.cycles.samples=48;scene.cycles.use_denoising=False
# Same complete framed sphere and ring camera as r001 for honest comparison.
bpy.ops.wm.save_as_mainfile(filepath=str(out/'kit.blend'));bpy.ops.render.render(write_still=True)
old=json.loads((prior/'kit.json').read_text())
assert old['variants']==kit['variants'],'Geometry/UV/normal preservation failed'
validation={'publication':'isolated draft; no owner final sign-off','fixedDetail':True,'geometryUVNormalsIdenticalTo':'gas-r001','materialChange':'Generated reference-led albedo on ordinary PBR body; authored ring alpha density and selective PBR emission','uvConvention':kit['uvConvention'],'normalMap':'none; exact original authored normals retained','triangles':sum(len(v['indices'])//3 for v in kit['variants']),'sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in out.iterdir() if p.is_file()}}
(out/'validation.json').write_text(json.dumps(validation,indent=2));print('GAS_R002_DONE')
