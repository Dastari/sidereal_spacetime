"""Native Gas3 ring-only refinement; Gas2 body and texture remain exact."""
import bpy,json,sys,math,hashlib,shutil,random
from pathlib import Path
out=Path(sys.argv[sys.argv.index('--')+1]).resolve();out.mkdir(parents=True,exist_ok=True)
if (out/'kit.blend').exists():raise RuntimeError('Preserve previous native source')
prior=out.parent/'gas-r002';old=json.loads((prior/'kit.json').read_text());kit=json.loads((prior/'kit.json').read_text())
bpy.ops.wm.open_mainfile(filepath=str(prior/'kit.blend'));scene=bpy.context.scene
shutil.copy(prior/'gas-albedo-generated.png',out/'gas-albedo-generated.png')
materials=[bpy.data.materials[m['name']] for m in kit['materials']]
# Two contiguous unequal outer zones, one substantial inner/main gap. Geometry
# never changes with LOD; softer partial subdivisions are native image density.
for index,(inner,outer) in enumerate([(1.16,1.37),(1.43,1.73),(1.73,1.88)]):
 obj=bpy.data.objects['GEO-ring-dust-'+str(index)]
 for v in obj.data.vertices:
  angle=math.atan2(v.co.y,v.co.x);radius=[inner,outer][v.index%2]+.003*math.sin(angle*5+index)
  v.co.x=math.cos(angle)*radius;v.co.y=math.sin(angle)*radius
 image=bpy.data.images.new('Gas3-broad-dust-zone-'+str(index),width=1024,height=256,alpha=True);pixels=[]
 for y in range(256):
  for x in range(1024):
   u=(x+.5)/1024;v=(y+.5)/256;a=u*math.tau
   edge=math.sin(math.pi*v)**(.32 if index==0 else .23)
   # Broad irregular dusty arcs and one partial soft density depression.
   broad=.74+.13*math.sin(a*2+.8)+.08*math.sin(a*5+v*2)
   partial=math.exp(-((v-(.59+.065*math.sin(a*3)))/.08)**2)*max(0,math.sin(a+.6))*.35
   grain=.83+.12*math.sin(x*2.39+y*7.13)+.05*math.sin(x*13.17-y*3.71)
   alpha=max(0,min(.89,edge*(broad-partial)*grain*(1.2 if index==1 else .98)))
   tint=[(.45,.15,.65),(.61,.24,.75),(.45,.18,.62)][index]
   light=.88+.11*math.sin(v*math.pi+.3)+.04*math.sin(a*3+v*7)
   pixels.extend((*(c*light for c in tint),alpha))
 image.pixels.foreach_set(pixels);image.filepath_raw=str(out/f'ring-dust-{index}.png');image.file_format='PNG';image.save();image.pack()
 mat=materials[index+1];shader=mat.node_tree.nodes.get('Principled BSDF')
 for node in mat.node_tree.nodes:
  if node.type=='TEX_IMAGE':node.image=image
 emission=[(.018,.002,.028),(.040,.006,.052),(.012,.002,.023)][index]
 shader.inputs['Emission Color'].default_value=(*emission,1);shader.inputs['Emission Strength'].default_value=1
 kit['materials'][index+1].update(baseColorTexture=f'ring-dust-{index}.png',emissiveColor=list(emission),alpha=1,alphaMode='BLEND',linearColor=[1,1,1],useTextureAlpha=True)
# Preserve individual native fragments, regroup into authored unequal arcs with
# quiet intervals and a small number of larger aggregates.
fragments=sorted([o for o in scene.objects if o.type=='MESH' and o.name.startswith('GEO-ring-fragment-')],key=lambda o:int(o.name.rsplit('-',1)[1]));rng=random.Random(3019)
arcs=[(.30,.34,1.57), (1.65,.20,1.78), (3.33,.52,1.49), (5.30,.18,1.81)]
for i,obj in enumerate(fragments):
 center,width,r=arcs[[0,0,0,1,2,2,2,2,3][i%9]];angle=center+rng.uniform(-width,width);radius=r+rng.uniform(-.045,.045)
 obj.location=(math.cos(angle)*radius,math.sin(angle)*radius,rng.uniform(-.012,.029));factor=(1.75 if i%13==0 else .75+rng.random()*.65);obj.scale=(factor,factor,factor)
 obj['role']='planet';obj['authoring']='native-gas-r003'
forms=[('gas-body',[bpy.data.objects['GEO-gas-PBR-body']])]+[(f'ring-dust-{i}',[bpy.data.objects[f'GEO-ring-dust-{i}']]) for i in range(3)]+[('ring-rocks',fragments)]
scene.view_layers.update();kit['variants']=[]
for name,parts in forms:
 positions=[];indices=[];roles=[];uvs=[];normals=[]
 for obj in parts:
  obj['role']='planet';mesh=obj.data;mesh.calc_loop_triangles();uv=mesh.uv_layers.active
  for tri in mesh.loop_triangles:
   for vert,loop in zip(tri.vertices,tri.loops):
    positions.extend(obj.matrix_world@mesh.vertices[vert].co);normals.extend((obj.matrix_world.to_3x3().inverted().transposed()@mesh.corner_normals[loop].vector).normalized());uvs.extend((uv.data[loop].uv.x,1-uv.data[loop].uv.y) if uv else (0,0));indices.append(len(indices))
   roles.append(materials.index(mesh.materials[tri.material_index]))
 variant={'name':name,'positions':positions,'indices':indices,'triangleMaterials':roles,'uvs':uvs,'normals':normals}
 if name=='gas-body':
  assert variant==old['variants'][0],'Body geometry/UV/normal changed';variant=old['variants'][0]
 kit['variants'].append(variant)
 bpy.ops.object.select_all(action='DESELECT')
 for obj in parts:obj.select_set(True)
 bpy.context.view_layer.objects.active=parts[0];bpy.ops.export_scene.gltf(filepath=str(out/(name+'.glb')),export_format='GLB',use_selection=True,export_apply=True,export_extras=True)
(out/'kit.json').write_text(json.dumps(kit,separators=(',',':')))
scene.render.filepath=str(out/'kit-preview.png');bpy.ops.wm.save_as_mainfile(filepath=str(out/'kit.blend'));bpy.ops.render.render(write_still=True)
validation={'bodyExactGas2':kit['variants'][0]==old['variants'][0],'bodyTextureExactGas2':(out/'gas-albedo-generated.png').read_bytes()==(prior/'gas-albedo-generated.png').read_bytes(),'fixedDetail':True,'triangles':sum(len(v['indices'])//3 for v in kit['variants']),'uvConvention':kit['uvConvention'],'ringDesign':'Unequal broad density zones, one main gap, soft partial subgap, four clustered debris arcs, reduced baseline PBR emission','publication':'isolated draft only','sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in out.iterdir() if p.is_file()}}
(out/'validation.json').write_text(json.dumps(validation,indent=2));print('GAS_R003_DONE')
