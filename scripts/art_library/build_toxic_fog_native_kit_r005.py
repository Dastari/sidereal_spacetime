"""Native Toxic-only translucent fog banks. Reviewed Cloud2 remains untouched.
Run Blender headless -- NEW_OUTPUT. Open native PBR alpha cards, not a volume shader.
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
# Elliptical density tapers to zero on every native card perimeter.
distance=((u-.5)/.48)**2+((v-.5)/.45)**2
alpha=np.clip((1-distance),0,1)**1.8*np.clip((field-.20)/.55,0,1)*.46
pixels=np.ones((height,width,4),dtype=np.float32);pixels[:,:,:3]=rgb;pixels[:,:,3]=alpha
image=bpy.data.images.new('Toxic-muted-olive-density',width=width,height=height,alpha=True);image.colorspace_settings.name='sRGB';image.pixels.foreach_set(pixels.reshape(-1));image.filepath_raw=str(out/'toxic-fog-density.png');image.file_format='PNG';image.save();image.pack()
mat=bpy.data.materials.new('toxic-muted-olive-fog');mat.use_nodes=True;mat.surface_render_method='DITHERED';mat.use_backface_culling=False;p=mat.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(1,1,1,1);p.inputs['Roughness'].default_value=.98;p.inputs['Metallic'].default_value=0
tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image;mat.node_tree.links.new(tex.outputs['Color'],p.inputs['Base Color']);mat.node_tree.links.new(tex.outputs['Alpha'],p.inputs['Alpha'])
p.inputs['IOR'].default_value=1.0
layouts=[
 ('toxic-fog-low-bank',[(-.75,-.06,0,.62,1,.77,.34),(-.32,.10,.04,.78,1,.80,.41),(.20,.07,.02,.75,1,.74,.38),(.65,-.10,-.025,.54,1,.71,.27),(.97,-.20,-.03,.31,1,.68,.21)]),
 ('toxic-fog-vent-plume',[(-.20,0,-.04,.48,.80,.77,.64),(-.08,.04,.22,.59,.90,.84,.80),(.07,.05,.51,.62,1,.81,.70),(.28,.09,.73,.52,1,.77,.49),(.56,.12,.80,.34,1,.66,.32)]),
 ('toxic-fog-broken-wisp',[(-.78,.18,0,.41,1,.64,.23),(-.41,.11,.035,.57,1,.66,.27),(-.05,-.03,.01,.65,1,.70,.31),(.39,-.10,-.035,.48,1,.67,.25),(.76,.02,-.04,.32,1,.58,.20)])]
forms=[]
for name,layout in layouts:
 vertices=[];faces=[];uv_values=[]
 # Native crossed density cards remain independent of camera rotation.
 # Fine quad lattice has explicit optical UVs and transparent perimeter.
 for card,angle in enumerate([0,math.pi/3,math.pi*2/3]):
  start=len(vertices);cols=12;rows=8
  for row in range(rows+1):
   for col in range(cols+1):
    u0=col/cols;v0=row/rows;x=(u0-.5)*2.4;y=.08*math.sin(u0*math.pi*2+card);z=(v0-.5)*(1.6 if 'plume' in name else .85)+.18*math.sin(u0*math.pi)
    if 'wisp' in name:z+=x*.17
    vertices.append((x*math.cos(angle)-y*math.sin(angle),x*math.sin(angle)+y*math.cos(angle),z));uv_values.append((u0,v0))
  for row in range(rows):
   for col in range(cols):
    i=start+row*(cols+1)+col;faces.append((i,i+1,i+cols+2,i+cols+1))
 mesh=bpy.data.meshes.new(name+'-native-density-cards');mesh.from_pydata(vertices,[],faces);mesh.update();obj=bpy.data.objects.new('GEO-'+name,mesh);scene.collection.objects.link(obj);obj['role']='planet';obj['authoring']='native-toxic-fog-r005';obj.data.materials.append(mat)
 uv=mesh.uv_layers.new(name='Native-density-UV')
 for poly in mesh.polygons:
  poly.use_smooth=True
  for loop in poly.loop_indices:uv.data[loop].uv=uv_values[mesh.loops[loop].vertex_index]
 forms.append((name,obj))
kit={'schema':'sidereal.native-planet-kit.v1','layout':'toxic-fog-banks','uvConvention':'glTF corner UV; invertY=false','materials':[{'name':mat.name,'linearColor':[1,1,1],'roughness':.98,'metallic':0,'alpha':1,'alphaMode':'BLEND','doubleSided':True,'useTextureAlpha':True,'baseColorTexture':'toxic-fog-density.png','textureColorSpace':'sRGB','invertY':False,'emissiveColor':[0,0,0],'ior':1.0}],'variants':[]}
for name,obj in forms:
 mesh=obj.data
 if mesh.validate():raise RuntimeError('Invalid native fog mesh')
 uv=mesh.uv_layers.active
 mesh.calc_loop_triangles();positions=[];normals=[];uvs=[];indices=[]
 for tri in mesh.loop_triangles:
  for vertex,loop in zip(tri.vertices,tri.loops):positions.extend(mesh.vertices[vertex].co);normals.extend(mesh.corner_normals[loop].vector);uvs.extend((uv.data[loop].uv.x,1-uv.data[loop].uv.y));indices.append(len(indices))
 kit['variants'].append({'name':name,'positions':positions,'normals':normals,'uvs':uvs,'indices':indices,'triangleMaterials':[0]*(len(indices)//3)})
 bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj;bpy.ops.export_scene.gltf(filepath=str(out/(name+'.glb')),export_format='GLB',use_selection=True,export_extras=True)
sys.path.insert(0,'/root/sidereal_spacetime/scripts/art_library')
from preserve_native_kit_ior import corrected_glb
raw_dir=out/'raw-native-exports';raw_dir.mkdir()
for glb in out.glob('*.glb'):
 raw=glb.read_bytes();(raw_dir/glb.name).write_bytes(raw);fixed,_=corrected_glb(raw,{m['name']:m for m in kit['materials']});glb.write_bytes(fixed)
(out/'kit.json').write_text(json.dumps(kit,separators=(',',':')))
for i,(name,obj)in enumerate(forms):obj.location.y=i*1.65-1.65
scene.render.engine='CYCLES';scene.cycles.samples=64;scene.cycles.use_denoising=False;scene.render.film_transparent=True;scene.world.color=(.12,.12,.12);scene.render.resolution_x=1400;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
bpy.ops.object.camera_add(location=(4,-7,5));cam=bpy.context.object;cam.rotation_euler=(-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=6.0;scene.camera=cam
for loc,energy in[((-4,-3,8),1100),((3,2,4),550)]:
 bpy.ops.object.light_add(type='AREA',location=loc);light=bpy.context.object;light.data.energy=energy;light.data.shape='DISK';light.data.size=5;light.rotation_euler=(-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.wm.save_as_mainfile(filepath=str(out/'kit.blend'));scene.render.filepath=str(out/'kit-preview.png');bpy.ops.render.render(write_still=True)
(out/'validation.json').write_text(json.dumps({'nativeOpenCards':True,'boundaryReason':'Intentional alpha density cards; no closed-solid claim','alphaMin':float(alpha.min()),'alphaMax':float(alpha.max()),'alphaMean':float(alpha.mean()),'triangles':{v['name']:len(v['indices'])//3 for v in kit['variants']},'scope':'Toxic-only isolated native alpha card approximation; no true volumetric scattering or acceptance','sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest()for p in out.iterdir()if p.is_file()}},indent=2));print('TOXIC_FOG_R005_DONE')
