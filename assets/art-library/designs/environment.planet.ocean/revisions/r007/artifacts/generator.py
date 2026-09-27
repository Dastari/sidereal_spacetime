"""Ocean7 island-only material/UV finish; exact Ocean6 water, reef and placement."""
import bpy,bmesh,json,sys,math,shutil,hashlib
import numpy as np
from pathlib import Path
from mathutils import Vector
out=Path(sys.argv[sys.argv.index('--')+1]).resolve();out.mkdir(parents=True,exist_ok=True)
if(out/'kit.blend').exists():raise RuntimeError('Preserve prior revision')
prior=out.parent/'ocean-r006';old=json.loads((prior/'kit.json').read_text());kit=json.loads((prior/'kit.json').read_text())
bpy.ops.wm.open_mainfile(filepath=str(prior/'kit.blend'));scene=bpy.context.scene
for file in prior.iterdir():
 if file.suffix=='.glb' or file.name in ['water-albedo.png','water-normal.png','water-orm.png']:shutil.copy2(file,out/file.name)
original=[bpy.data.materials[m['name']]for m in kit['materials']];material_map={}
size=256;rng=np.random.default_rng(7007);grain=rng.uniform(-1,1,(size,size));yy,xx=np.mgrid[0:size,0:size];u=(xx+.5)/size;v=(yy+.5)/size
coarse=np.sin(u*math.tau*7+np.sin(v*math.tau*5))*.35+np.cos(u*math.tau*11-v*math.tau*3)*.2+grain*.45
for role in range(1,7):
 definition=json.loads(json.dumps(old['materials'][role]));definition['name']='island-finish-'+definition['name'];mat=original[role].copy();mat.name=definition['name'];material_map[role]=len(kit['materials']);kit['materials'].append(definition)
 nodes=mat.node_tree.nodes;links=mat.node_tree.links;p=nodes.get('Principled BSDF')
 for node in list(nodes):
  if node.type not in ['BSDF_PRINCIPLED','OUTPUT_MATERIAL']:nodes.remove(node)
 color=np.array(definition['linearColor']);linear=np.clip(color[None,None,:]*(1+coarse[:,:,None]*(.08 if role<3 else .18)),0,1)
 # Preserve physical base hue; export the baked RGB in sRGB.
 rgb=np.where(linear<=.0031308,linear*12.92,1.055*linear**(1/2.4)-.055)
 alpha=np.ones((size,size))
 if role<3:
  edge=.70+.065*np.sin(u*math.tau*7+.8)+.035*np.sin(u*math.tau*17)+.018*np.cos(u*math.tau*31)
  alpha=np.clip((v-edge)/.085,0,1);alpha=alpha*alpha*(3-2*alpha)
 for kind in ['albedo','normal','orm']:
  image=bpy.data.images.new(f'Ocean7-{role}-{kind}',width=size,height=size,alpha=True);image.colorspace_settings.name='sRGB' if kind=='albedo'else'Non-Color'
  pixels=np.ones((size,size,4),dtype=np.float32)
  if kind=='albedo':pixels[:,:,:3]=rgb;pixels[:,:,3]=alpha
  elif kind=='orm':pixels[:,:,0]=1;pixels[:,:,1]=np.clip(definition['roughness']+coarse*(.035 if role<3 else .075),.05,1);pixels[:,:,2]=0
  else:
   nx=(np.roll(coarse,-1,axis=1)-np.roll(coarse,1,axis=1))*(.035 if role<3 else .065);ny=(np.roll(coarse,-1,axis=0)-np.roll(coarse,1,axis=0))*(.035 if role<3 else .065)
   pixels[:,:,0]=nx*.5+.5;pixels[:,:,1]=ny*.5+.5;pixels[:,:,2]=np.sqrt(np.maximum(.001,1-nx*nx-ny*ny))*.5+.5
  image.pixels.foreach_set(pixels.reshape(-1));filename=f'island-{role}-{kind}.png';image.filepath_raw=str(out/filename);image.file_format='PNG';image.save();image.pack()
  tex=nodes.new('ShaderNodeTexImage');tex.image=image;tex.extension='REPEAT'
  if kind=='albedo':
   links.new(tex.outputs['Color'],p.inputs['Base Color']);definition.update(baseColorTexture=filename,linearColor=[1,1,1],textureColorSpace='sRGB',invertY=False)
   if role<3:links.new(tex.outputs['Alpha'],p.inputs['Alpha']);mat.surface_render_method='DITHERED';definition.update(alpha=1,alphaMode='BLEND',useTextureAlpha=True)
  elif kind=='normal':
   normal=nodes.new('ShaderNodeNormalMap');links.new(tex.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],p.inputs['Normal']);definition.update(normalTexture=filename,normalScale=1)
  else:
   separate=nodes.new('ShaderNodeSeparateColor');links.new(tex.outputs['Color'],separate.inputs['Color']);links.new(separate.outputs['Green'],p.inputs['Roughness']);links.new(separate.outputs['Blue'],p.inputs['Metallic']);definition.update(metallicRoughnessTexture=filename,roughness=1,metallic=1)
forms=[]
for index,name in enumerate(['steep-island','long-island','archipelago','tiny-islet']):
 parts=[o for o in scene.objects if o.type=='MESH' and(o.name=='GEO-'+name or o.name.startswith('GEO-'+name+'-'))]
 offset=Vector((index%4*2.3-3.45,index//4*2.6-1.3,0))
 for obj in parts:
  obj.location-=offset;mesh=obj.data
  for role in range(1,7):mesh.materials[role]=bpy.data.materials[kit['materials'][material_map[role]]['name']]
  max_z=max(v.co.z for v in mesh.vertices);top=[v.co for v in mesh.vertices if v.co.z>max_z-.006];cx=sum(p.x for p in top)/len(top);cy=sum(p.y for p in top)/len(top)
  # A few selected native edge notches; the central plateau and roots retain
  # authored height and all objects retain their original placement transforms.
  for vertex in mesh.vertices:
   p=vertex.co;angle=math.atan2(p.y-cy,p.x-cx);distance=abs(math.atan2(math.sin(angle-2.2),math.cos(angle-2.2)))
   if .065<p.z<max_z-.025 and distance<.20:
    amount=.035*(1-distance/.20);p.x=cx+(p.x-cx)*(1-amount);p.y=cy+(p.y-cy)*(1-amount)
  mesh.update();bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
  uv=mesh.uv_layers.active
  for polygon in mesh.polygons:
   if polygon.material_index not in (1,2):continue
   values=[]
   for loop in polygon.loop_indices:
    p=mesh.vertices[mesh.loops[loop].vertex_index].co;values.append((math.atan2(p.y-cy,p.x-cx)/math.tau+.5,max(1/256,min(255/256,(p.z+.055)/.083))))
   seam=max(p[0]for p in values)-min(p[0]for p in values)>.5
   for loop,p in zip(polygon.loop_indices,values):uv.data[loop].uv=(p[0]+(1 if seam and p[0]<.5 else 0),p[1])
  obj['role']='planet';obj['authoring']='native-ocean-r007'
 forms.append((name,parts))
bpy.context.view_layer.update()
for name,parts in forms:
 positions=[];normals=[];uvs=[];indices=[];roles=[]
 for obj in parts:
  mesh=obj.data
  if mesh.validate():raise RuntimeError('Invalid mesh')
  bm=bmesh.new();bm.from_mesh(mesh)
  if any(not e.is_manifold for e in bm.edges):raise RuntimeError('Non-manifold')
  bm.free();mesh.calc_loop_triangles();uv=mesh.uv_layers.active
  for tri in mesh.loop_triangles:
   for vertex,loop in zip(tri.vertices,tri.loops):
    positions.extend(obj.matrix_world@mesh.vertices[vertex].co);normals.extend((obj.matrix_world.to_3x3().inverted().transposed()@mesh.corner_normals[loop].vector).normalized());uvs.extend((uv.data[loop].uv.x,1-uv.data[loop].uv.y));indices.append(len(indices))
   role=tri.material_index;roles.append(material_map.get(role,role))
 kit['variants'][next(i for i,v in enumerate(kit['variants'])if v['name']==name)]={'name':name,'positions':positions,'normals':normals,'uvs':uvs,'indices':indices,'triangleMaterials':roles}
 bpy.ops.object.select_all(action='DESELECT')
 for obj in parts:obj.select_set(True)
 bpy.context.view_layer.objects.active=parts[0];bpy.ops.export_scene.gltf(filepath=str(out/(name+'.glb')),export_format='GLB',use_selection=True,export_extras=True)
(out/'kit.json').write_text(json.dumps(kit,separators=(',',':')))
# Restore existing preview arrangement; unchanged reef/water remain where Gas6 saved them.
for index,(name,parts)in enumerate(forms):
 for obj in parts:obj.location+=Vector((index%4*2.3-3.45,index//4*2.6-1.3,0))
scene.render.filepath=str(out/'kit-preview.png');bpy.ops.wm.save_as_mainfile(filepath=str(out/'kit.blend'));bpy.ops.render.render(write_still=True)
validation={'preservedOcean6':['water material/maps/GLBs','atoll geometry/materials/GLB','groves','island placement and footprint'],'islandMaterialMap':material_map,'sourceTopologyCounts':{v['name']:len(v['indices'])//3 for v in kit['variants']},'publication':'isolated draft','sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest()for p in out.iterdir()if p.is_file()}}
(out/'validation.json').write_text(json.dumps(validation,indent=2));print('OCEAN_R007_DONE')
