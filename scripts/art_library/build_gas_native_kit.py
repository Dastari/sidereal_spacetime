"""Authored gas-band/vortex PBR study with broad dusty native rings.
The native kit extends variants with uvs and materials with albedoTexture/alpha.
No runtime shader or live publication. Blender's editable UV sphere is source.
"""
import bpy,bmesh,json,sys,math,hashlib,random
from pathlib import Path
from mathutils import Vector
out=Path(sys.argv[sys.argv.index('--')+1]).resolve();out.mkdir(parents=True,exist_ok=True)
if (out/'kit.blend').exists():raise RuntimeError('Preserve existing source')
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);scene=bpy.context.scene
# Deliberate latitude art direction. Unequal broad zones include warmer salmon
# currents and blue-violet shadow bands, unlike the old magenta pinstripe field.
palette=[(.09,.035,.32),(.21,.07,.48),(.41,.17,.61),(.68,.35,.75),(.40,.08,.49),(.67,.08,.51),(.76,.24,.29),(.33,.055,.35),(.70,.38,.72)]
breaks=[0,.11,.19,.32,.38,.49,.64,.73,.85,1]
def mix(a,b,t):return tuple(x+(y-x)*t for x,y in zip(a,b))
def smooth(t):t=max(0,min(1,t));return t*t*(3-2*t)
def gas_color(u,v):
 # Broad low frequency flow bent strongly around two storms. Smaller flow
 # perturbations terminate inside broad zones instead of making equal stripes.
 lat=v+math.sin(math.pi*v)*(.012*math.sin(u*math.tau*3+v*19)+.006*math.sin(u*math.tau*9-v*23))
 for cx,cy,rx,ry,strength in [(.62,.44,.145,.075,2.8),(.24,.68,.08,.042,2.4)]:
  dx=((u-cx+.5)%1-.5)/rx;dy=(v-cy)/ry;r=math.hypot(dx,dy)
  if r<1.8:
   angle=math.atan2(dy,dx)+strength*math.exp(-r*r*.6)
   warped=cy+math.sin(angle)*r*ry
   lat=lat*(1-smooth((1.8-r)/.8))+warped*smooth((1.8-r)/.8)
 idx=next((i for i in range(len(breaks)-1) if lat<breaks[i+1]),len(palette)-1)
 idx=max(0,min(len(palette)-1,idx));base=palette[idx]
 detail=.90+.08*math.sin(lat*117+math.sin(u*math.tau*5)*2.2)+.045*math.sin(math.floor(u*450)*13.71+math.floor(v*360)*5.13)
 base=tuple(c*detail for c in base)
 for cx,cy,rx,ry,strength in [(.62,.44,.145,.075,2.8),(.24,.68,.08,.042,2.4)]:
  dx=((u-cx+.5)%1-.5)/rx;dy=(v-cy)/ry;r=math.hypot(dx,dy)
  if r<1:
   a=math.atan2(dy,dx);rings=.5+.5*math.sin(r*27-a*2+r*r*5+.8*math.sin(a*3+r*8))
   storm=mix((.22,.008,.39),(.83,.19,.79),rings)
   if r<.14:storm=mix((.035,.008,.14),storm,r/.14)
   base=mix(base,storm,smooth((1-r)/.13))
 return (*base,1)
width,height=2048,1024
image=bpy.data.images.new('Authored-Gas-Bands-and-Vortices',width=width,height=height,alpha=True)
pixels=[]
for y in range(height):
 for x in range(width):pixels.extend(gas_color((x+.5)/width,(y+.5)/height))
image.pixels.foreach_set(pixels);image.filepath_raw=str(out/'gas-albedo.png');image.file_format='PNG';image.save();image.pack()
# Native dust albedo/opacity: broad uneven density and soft feathered edges.
ring_image=bpy.data.images.new('Authored-Ring-Dust-Density',width=1024,height=128,alpha=True)
ring_pixels=[]
for y in range(128):
 for x in range(1024):
  u=(x+.5)/1024;v=(y+.5)/128
  broad=.52+.22*math.sin(u*math.tau*5+v*8)+.12*math.sin(u*math.tau*13-v*14)
  radial=.60+.20*math.sin(v*18+math.sin(u*math.tau*3))
  grit=.75+.25*math.sin(x*2.39+y*7.13)
  alpha=max(0,min(1,math.sin(math.pi*v)**.65*broad*radial*grit*1.7))
  ring_pixels.extend((.54,.30,.67,alpha))
ring_image.pixels.foreach_set(ring_pixels);ring_image.filepath_raw=str(out/'ring-dust.png');ring_image.file_format='PNG';ring_image.save();ring_image.pack()
materials=[];definitions=[]
def material(name,color,roughness,alpha=1,texture=None):
 m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=roughness;p.inputs['Alpha'].default_value=alpha
 if alpha<1:m.surface_render_method='DITHERED'
 d={'name':name,'linearColor':list(color),'roughness':roughness,'alpha':alpha,'alphaMode':'BLEND' if alpha<1 else 'OPAQUE','metallic':0,'doubleSided':True}
 if texture:
  tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=ring_image if texture=='ring' else image;m.node_tree.links.new(tex.outputs['Color'],p.inputs['Base Color']);d['baseColorTexture']='ring-dust.png' if texture=='ring' else 'gas-albedo.png';d['textureColorSpace']='sRGB';d['invertY']=False
  if texture=='ring':m.node_tree.links.new(tex.outputs['Alpha'],p.inputs['Alpha']);d['useTextureAlpha']=True
 materials.append(m);definitions.append(d);return m
bodymat=material('gas-authored-PBR',(1,1,1),.66,texture=True)
material('ring-inner-dust',(.30,.07,.38),.90,.65,texture='ring')
material('ring-main-lavender',(.42,.18,.52),.86,.85,texture='ring')
material('ring-outer-dust',(.26,.07,.36),.93,.50,texture='ring')
material('ring-dark-fragment',(.025,.012,.045),.83)
material('ring-pale-fragment',(.25,.12,.31),.85)
forms=[]
bpy.ops.mesh.primitive_uv_sphere_add(segments=128,ring_count=64,radius=1);body=bpy.context.object;body.name='GEO-gas-PBR-body';body.data.materials.append(bodymat)
for p in body.data.polygons:p.use_smooth=True
forms.append(('gas-body',[body]))
for index,(inner,outer,role) in enumerate([(1.19,1.34,1),(1.40,1.65,2),(1.72,1.86,3)]):
 verts=[];faces=[];segments=256
 for j in range(segments):
  a=j*math.tau/segments
  for r in [inner,outer]:
   radius=r+.006*math.sin(a*7+index)+.004*math.sin(a*19)
   verts.append((math.cos(a)*radius,math.sin(a)*radius,0))
 for j in range(segments):
  # Deliberate broad broken density areas, with fine debris retaining continuity.
  if False:continue
  faces.append((j*2,((j+1)%segments)*2,((j+1)%segments)*2+1,j*2+1))
 mesh=bpy.data.meshes.new('Ring-dust-'+str(index));mesh.from_pydata(verts,[],faces);mesh.uv_layers.new(name='Dust-UV')
 for polygon in mesh.polygons:
  for loop in polygon.loop_indices:
   vertex=mesh.loops[loop].vertex_index;u=(vertex//2)/segments
   if polygon.index==segments-1 and vertex<2:u=1
   mesh.uv_layers.active.data[loop].uv=(u,vertex%2)
 mesh.materials.append(materials[role]);obj=bpy.data.objects.new('GEO-ring-dust-'+str(index),mesh);scene.collection.objects.link(obj);forms.append(('ring-dust-'+str(index),[obj]))
rng=random.Random(1047);debris=[]
for i in range(112):
 a=rng.random()*math.tau;r=rng.uniform(1.24,1.80)
 bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1,location=(math.cos(a)*r,math.sin(a)*r,rng.uniform(-.018,.025)));obj=bpy.context.object;obj.name='GEO-ring-fragment-'+str(i)
 size=rng.uniform(.006,.022)*(1.8 if i%19==0 else 1);obj.scale=(size,size*rng.uniform(.6,1.4),size*rng.uniform(.6,1.5));obj.rotation_euler=(rng.random(),rng.random(),rng.random());bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);obj.data.materials.append(materials[4 if i%4 else 5]);debris.append(obj)
forms.append(('ring-rocks',debris))
kit={'schema':'sidereal.native-planet-kit.v1','layout':'gas-bands-and-rings','uvConvention':'glTF UV (Blender V flipped); invertY=false','materials':definitions,'variants':[]}
validation={'publication':'isolated draft','fixedDetail':True,'coordinates':'Blender Z up; body radius1, ring planeXY; all exports keep origin at body centre','variants':[]}
for name,parts in forms:
 positions=[];indices=[];roles=[];uvs=[];normals=[]
 for obj in parts:
  obj['role']='planet';obj['authoring']='native-gas-r001';mesh=obj.data;mesh.calc_loop_triangles();uv=mesh.uv_layers.active
  # Corner-expanded arrays retain the exact UV seam and native surface normals.
  for tri in mesh.loop_triangles:
   for vert,loop in zip(tri.vertices,tri.loops):
    positions.extend(obj.matrix_world@mesh.vertices[vert].co);normals.extend((obj.matrix_world.to_3x3().inverted().transposed()@mesh.corner_normals[loop].vector).normalized());uvs.extend((uv.data[loop].uv.x,1-uv.data[loop].uv.y) if uv else (0,0));indices.append(len(indices))
   roles.append(materials.index(mesh.materials[tri.material_index]))
 kit['variants'].append({'name':name,'positions':positions,'indices':indices,'triangleMaterials':roles,'uvs':uvs,'normals':normals})
 validation['variants'].append({'name':name,'triangles':len(indices)//3})
 bpy.ops.object.select_all(action='DESELECT')
 for obj in parts:obj.select_set(True)
 bpy.context.view_layer.objects.active=parts[0];bpy.ops.export_scene.gltf(filepath=str(out/(name+'.glb')),export_format='GLB',use_selection=True,export_apply=True,export_extras=True)
(out/'kit.json').write_text(json.dumps(kit,separators=(',',':')))
scene.render.engine='CYCLES';scene.cycles.samples=40;scene.cycles.use_denoising=False;scene.render.film_transparent=True;scene.world.color=(.1,.1,.1)
scene.render.resolution_x=1400;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
bpy.ops.object.camera_add(location=(3,-5,3));camera=bpy.context.object;camera.name='CAM-gas-reference';camera.rotation_euler=(-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=4.1;scene.camera=camera
for loc,power,size in [((-3,-4,5),850,4),((4,1,1),200,3)]:
 bpy.ops.object.light_add(type='AREA',location=loc);light=bpy.context.object;light.data.energy=power;light.data.shape='DISK';light.data.size=size;light.rotation_euler=(-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.wm.save_as_mainfile(filepath=str(out/'kit.blend'));scene.render.filepath=str(out/'kit-preview.png');bpy.ops.render.render(write_still=True)
validation['sha256']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in out.iterdir() if p.is_file()};(out/'validation.json').write_text(json.dumps(validation,indent=2));print('NATIVE_GAS_KIT_DONE',validation['variants'])
