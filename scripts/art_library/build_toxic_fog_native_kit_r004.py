"""Native Toxic-only translucent fog banks. Reviewed Cloud2 remains untouched.
Run Blender headless -- NEW_OUTPUT. Closed smooth PBR surfaces, not a volume shader.
"""
import bpy,bmesh,json,math,sys,hashlib
import numpy as np
from pathlib import Path
from mathutils import Vector
out=Path(sys.argv[sys.argv.index('--')+1]).resolve();out.mkdir(parents=True,exist_ok=True)
if(out/'kit.blend').exists():raise RuntimeError('Preserve existing revision')
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);scene=bpy.context.scene
# Seam-periodic authored optical density. Irregular mottling leaves transparent
# gaps rather than a constant-opacity white solid.
width,height=512,256;rng=np.random.default_rng(3103);yy,xx=np.mgrid[0:height,0:width];u=(xx+.5)/width;v=(yy+.5)/height
field=np.zeros((height,width))
for nx,ny,weight in [(9,7,.65),(23,17,.25),(53,31,.10)]:
 grid=rng.uniform(0,1,(ny+1,nx));gx=u*nx;gy=v*ny;ix=np.floor(gx).astype(int);iy=np.floor(gy).astype(int);fx=gx-ix;fy=gy-iy;fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy)
 low=grid[iy,ix]*(1-fx)+grid[iy,(ix+1)%nx]*fx;high=grid[iy+1,ix]*(1-fx)+grid[iy+1,(ix+1)%nx]*fx;field+=(low*(1-fy)+high*fy)*weight
linear=np.clip(np.array([.105,.155,.032])[None,None,:]*(.83+field[:,:,None]*.32),0,1)
rgb=np.where(linear<=.0031308,linear*12.92,1.055*linear**(1/2.4)-.055)
alpha=np.clip((field-.22)/.56,0,1)**1.4*.40
# Top/bottom fringes taper softly. Their UVs remain on native smooth volumes.
alpha*=np.sin(v*math.pi)**.65
pixels=np.ones((height,width,4),dtype=np.float32);pixels[:,:,:3]=rgb;pixels[:,:,3]=alpha
image=bpy.data.images.new('Toxic-muted-olive-density',width=width,height=height,alpha=True);image.colorspace_settings.name='sRGB';image.pixels.foreach_set(pixels.reshape(-1));image.filepath_raw=str(out/'toxic-fog-density.png');image.file_format='PNG';image.save();image.pack()
mat=bpy.data.materials.new('toxic-muted-olive-fog');mat.use_nodes=True;mat.surface_render_method='DITHERED';mat.use_backface_culling=False;p=mat.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(1,1,1,1);p.inputs['Roughness'].default_value=.98;p.inputs['Metallic'].default_value=0
tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image;mat.node_tree.links.new(tex.outputs['Color'],p.inputs['Base Color']);mat.node_tree.links.new(tex.outputs['Alpha'],p.inputs['Alpha'])
layouts=[
 ('toxic-fog-low-bank',[(-.75,-.06,0,.62,1,.77,.34),(-.32,.10,.04,.78,1,.80,.41),(.20,.07,.02,.75,1,.74,.38),(.65,-.10,-.025,.54,1,.71,.27),(.97,-.20,-.03,.31,1,.68,.21)]),
 ('toxic-fog-vent-plume',[(-.20,0,-.04,.48,.80,.77,.64),(-.08,.04,.22,.59,.90,.84,.80),(.07,.05,.51,.62,1,.81,.70),(.28,.09,.73,.52,1,.77,.49),(.56,.12,.80,.34,1,.66,.32)]),
 ('toxic-fog-broken-wisp',[(-.78,.18,0,.41,1,.64,.23),(-.41,.11,.035,.57,1,.66,.27),(-.05,-.03,.01,.65,1,.70,.31),(.39,-.10,-.035,.48,1,.67,.25),(.76,.02,-.04,.32,1,.58,.20)])]
p.inputs['IOR'].default_value=1.0
materials=[]
for i,factor in enumerate([.30,.56,.85]):
 m=mat.copy();m.name='toxic-density-shell-'+str(i);node=m.node_tree.nodes.get('Principled BSDF');multiply=m.node_tree.nodes.new('ShaderNodeMath');multiply.operation='MULTIPLY';multiply.inputs[1].default_value=factor;m.node_tree.links.new(next(n for n in m.node_tree.nodes if n.type=='TEX_IMAGE').outputs['Alpha'],multiply.inputs[0]);m.node_tree.links.new(multiply.outputs[0],node.inputs['Alpha']);materials.append(m)
forms=[]
for name,layout in layouts:
 metaball=bpy.data.metaballs.new(name+'-native-field');metaball.resolution=.105;metaball.render_resolution=.105;metaball.threshold=.60;obj=bpy.data.objects.new('GEO-'+name,metaball);scene.collection.objects.link(obj)
 for x,y,z,r,sx,sy,sz in layout:
  element=metaball.elements.new();element.type='ELLIPSOID';element.co=(x,y,z);element.radius=r;element.size_x=sx;element.size_y=sy;element.size_z=sz; element.stiffness=2
 bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj;bpy.ops.object.convert(target='MESH');obj=bpy.context.object;obj.name='GEO-'+name;obj['role']='planet';obj['authoring']='native-toxic-fog-r004';obj.data.materials.append(mat)
 for poly in obj.data.polygons:poly.use_smooth=True
 center=sum((v.co for v in obj.data.vertices),Vector())/len(obj.data.vertices)
 shells=[]
 for shell,(factor,material) in enumerate(zip([1,.83,.64],materials)):
  part=obj.copy();part.data=obj.data.copy();scene.collection.objects.link(part);part.data.materials.clear();part.data.materials.append(material)
  for vertex in part.data.vertices:vertex.co=center+(vertex.co-center)*factor
  shells.append(part)
 bpy.data.objects.remove(obj,do_unlink=True);bpy.ops.object.select_all(action='DESELECT')
 for part in shells:part.select_set(True)
 bpy.context.view_layer.objects.active=shells[0];bpy.ops.object.join();obj=bpy.context.object;obj.name='GEO-'+name
 forms.append((name,obj))
kit={'schema':'sidereal.native-planet-kit.v1','layout':'toxic-fog-banks','uvConvention':'glTF corner UV; invertY=false','materials':[{'name':mat.name,'linearColor':[1,1,1],'roughness':.98,'metallic':0,'alpha':1,'alphaMode':'BLEND','doubleSided':True,'useTextureAlpha':True,'baseColorTexture':'toxic-fog-density.png','textureColorSpace':'sRGB','invertY':False,'emissiveColor':[0,0,0]}],'variants':[]}
kit['materials']=[dict(kit['materials'][0],name=m.name,alpha=f,ior=1.0) for m,f in zip(materials,[.30,.56,.85])]
for name,obj in forms:
 mesh=obj.data
 if mesh.validate():raise RuntimeError('Invalid native fog mesh')
 bm=bmesh.new();bm.from_mesh(mesh)
 if any(not e.is_manifold for e in bm.edges):raise RuntimeError('Non-manifold native fog')
 bm.free();uv=mesh.uv_layers.new(name='Native-density-UV');minimum=Vector([min(v.co[i]for v in mesh.vertices)for i in range(3)]);maximum=Vector([max(v.co[i]for v in mesh.vertices)for i in range(3)]);center=(minimum+maximum)/2;extent=(maximum-minimum)/2
 for polygon in mesh.polygons:
  values=[]
  for loop in polygon.loop_indices:
   p=mesh.vertices[mesh.loops[loop].vertex_index].co-center;q=Vector((p.x/extent.x,p.y/extent.y,p.z/extent.z)).normalized();values.append((math.atan2(q.y,q.x)/math.tau+.5,math.asin(max(-1,min(1,q.z)))/math.pi+.5))
  seam=max(v[0]for v in values)-min(v[0]for v in values)>.5
  for loop,value in zip(polygon.loop_indices,values):uv.data[loop].uv=(value[0]+(1 if seam and value[0]<.5 else 0),value[1])
 mesh.calc_loop_triangles();positions=[];normals=[];uvs=[];indices=[]
 for tri in mesh.loop_triangles:
  for vertex,loop in zip(tri.vertices,tri.loops):positions.extend(mesh.vertices[vertex].co);normals.extend(mesh.corner_normals[loop].vector);uvs.extend((uv.data[loop].uv.x,1-uv.data[loop].uv.y));indices.append(len(indices))
 kit['variants'].append({'name':name,'positions':positions,'normals':normals,'uvs':uvs,'indices':indices,'triangleMaterials':[t.material_index for t in mesh.loop_triangles]})
 bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj;bpy.ops.export_scene.gltf(filepath=str(out/(name+'.glb')),export_format='GLB',use_selection=True,export_extras=True)
sys.path.insert(0,str(Path('/root/sidereal_spacetime/scripts/art_library')))
from preserve_native_kit_ior import corrected_glb
raw_dir=out/'raw-native-exports';raw_dir.mkdir()
for glb in out.glob('*.glb'):
 raw=glb.read_bytes();(raw_dir/glb.name).write_bytes(raw);fixed,changes=corrected_glb(raw,{m['name']:m for m in kit['materials']});glb.write_bytes(fixed)
(out/'kit.json').write_text(json.dumps(kit,separators=(',',':')))
for i,(name,obj)in enumerate(forms):obj.location.y=i*1.65-1.65
scene.render.engine='CYCLES';scene.cycles.samples=64;scene.cycles.use_denoising=False;scene.render.film_transparent=True;scene.world.color=(.12,.12,.12);scene.render.resolution_x=1400;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
bpy.ops.object.camera_add(location=(4,-7,5));cam=bpy.context.object;cam.rotation_euler=(-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=6.0;scene.camera=cam
for loc,energy in[((-4,-3,8),1100),((3,2,4),550)]:
 bpy.ops.object.light_add(type='AREA',location=loc);light=bpy.context.object;light.data.energy=energy;light.data.shape='DISK';light.data.size=5;light.rotation_euler=(-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.wm.save_as_mainfile(filepath=str(out/'kit.blend'));scene.render.filepath=str(out/'kit-preview.png');bpy.ops.render.render(write_still=True)
(out/'validation.json').write_text(json.dumps({'nativeManifold':True,'alphaMin':float(alpha.min()),'alphaMax':float(alpha.max()),'alphaMean':float(alpha.mean()),'triangles':{v['name']:len(v['indices'])//3 for v in kit['variants']},'scope':'Toxic-only isolated native translucent surface approximation; no true volumetric scattering or acceptance','sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest()for p in out.iterdir()if p.is_file()}},indent=2));print('TOXIC_FOG_R004_DONE')
