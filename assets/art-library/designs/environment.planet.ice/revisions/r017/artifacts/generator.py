"""Native glacial shafts under thick irregular snow. Isolated r017 only.
Run: blender -b --python scripts/art_library/build_ice_native_kit_r017.py -- NEW_OUTPUT
"""
import bpy,bmesh,json,math,sys,hashlib,struct,shutil
from pathlib import Path
from mathutils import Vector
out=Path(sys.argv[sys.argv.index('--')+1]).resolve();out.mkdir(parents=True,exist_ok=True)
if(out/'kit.blend').exists():raise RuntimeError('Preserve earlier revision')
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
palette=[('powder-snow',(.94,.975,1),.83),('pale-ice-edge',(.27,.56,.88),.15),('cobalt-ice',(.004,.075,.34),.15),('cyan-ice-face',(.008,.40,.92),.15),('deep-ice',(.002,.018,.075),.19)]
materials=[];definitions=[]
for i,(name,color,roughness)in enumerate(palette):
 m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=roughness;p.inputs['IOR'].default_value=1.31
 definition={'name':name,'linearColor':list(color),'roughness':roughness,'ior':1.31,'metallic':0}
 if i>0:p.inputs['Coat Weight'].default_value=.42;p.inputs['Coat Roughness'].default_value=.10;definition.update({'clearcoatFactor':.42,'clearcoatRoughnessFactor':.10})
 materials.append(m);definitions.append(definition)
forms=[]
def mesh_object(name,verts,faces,roles,smooth=None):
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new('GEO-'+name,mesh);scene.collection.objects.link(o)
 for m in materials:mesh.materials.append(m)
 for index,(p,r)in enumerate(zip(mesh.polygons,roles)):p.material_index=r;p.use_smooth=bool(smooth and smooth[index])
 bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bmesh.ops.triangulate(bm,faces=list(bm.faces));bmesh.ops.subdivide_edges(bm,edges=list(bm.edges),cuts=1,use_grid_fill=True);bm.to_mesh(mesh);bm.free();o['role']='planet';o['authoring']='native-ice-r017';return o

def shaft(name,phase,elongation):
 n=48;profile=[(.20,-.62),(.30,-.60),(.38,-.48),(.39,-.05),(.45,.10),(.47,.18),(.60,.24),(.92,.26),(1.30,.20),(1.50,-.02)]
 verts=[]
 for j,(radius,z)in enumerate(profile):
  for i in range(n):
   a=i*math.tau/n;shape=1+.065*math.sin(i*.73+phase)+.055*math.cos(i*.39-phase)+(.15*math.sin(a*3+.6)+.11*math.cos(a*2) if j>=6 else 0)
   # Grouped unequal ribs are part of the shaft wall rather than broad radial
   # fan cards. Adjacent long facets share the same closed glacial substrate.
   rib=(.035 if i%4 in(0,1)else-.018) if 2<=j<=4 else 0
   height=z
   if j>=5:height+=.028*math.sin(i*.41+phase)+.012*math.cos(i*.9)
   if j in(3,4):height+=.055*math.sin(i*.61+phase)
   # The outer snowbank opens into a broad off-centre glacial cut. Keep the
   # inner shaft lip closed; the cut starts beyond it and exits the region.
   delta=abs(math.atan2(math.sin(a+.42),math.cos(a+.42)))
   cut=max(0,min(1,(.72-delta)/.20))
   if j>=7:height=height*(1-cut)+(-.42-.08*math.sin(a*2+1))*cut
   if j==6:height-=.06*cut
   verts.append((math.cos(a)*(radius*shape+rib)*elongation,math.sin(a)*(radius*shape+rib),height))
 for i in range(n):x,y,_=verts[(len(profile)-1)*n+i];verts.append((x,y,-.84))
 faces=[tuple(range(n-1,-1,-1))];roles=[4];smooth=[False]
 for j in range(len(profile)):
  for i in range(n):
   faces.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
   a=(i+.5)*math.tau/n;delta=abs(math.atan2(math.sin(a+.42),math.cos(a+.42)))
   role=4 if j<2 else (2 if math.sin(a+.5)<.25 else 3)if j==2 else (1 if .45<a<.8 else 2 if math.sin(a+.5)<.15 else 3)if j==3 else 0
   if j>=6 and delta<.92:role=2 if delta>.55 else 3
   if j==9:role=2 if delta<1.1 else 1
   roles.append(role);smooth.append(5<=j<=8 and role==0)
 faces.append(tuple(range(len(profile)*n,(len(profile)+1)*n)));roles.append(4);smooth.append(False)
 return mesh_object(name,verts,faces,roles,smooth)
region=shaft('snow-cut-region',0,1.17)

def buttress(name,x,y,r,h,phase):
 n=8;verts=[]
 for z,scale in[(-.62,1.07),(h-.16,1),(h-.06,.91),(h,.80)]:
  for i in range(n):
   a=i*math.tau/n+phase;verts.append((x+math.cos(a)*r*scale,y+math.sin(a)*r*scale*.79,z+.018*math.sin(i+phase)))
 faces=[tuple(range(n-1,-1,-1))];roles=[4];smooth=[False]
 for j in range(3):
  for i in range(n):faces.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i));roles.append((2 if i%3==0 else 3)if j==0 else 0);smooth.append(j==2)
 faces.append(tuple(range(3*n,4*n)));roles.append(0);smooth.append(True)
 return mesh_object(name,verts,faces,roles,smooth)
forms.append(('snow-cut-region',[region,
 buttress('hero-blue-column',.86,-.56,.23,1.02,.15),
 buttress('blue-column-companion',1.21,-.25,.19,.74,.42),
 buttress('blue-column-short',.67,-.90,.25,.48,.70)]))
for name,subdivisions in[('ground-sphere',5),('ground-sphere-medium',4),('ground-sphere-low',3)]:
 bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions,radius=1);o=bpy.context.object;o.name='GEO-'+name;o.data.materials.append(materials[0]);o['role']='planet';o['authoring']='native-ice-r017'
 for p in o.data.polygons:p.use_smooth=True
 forms.append((name,[o]))
kit={'schema':'sidereal.native-planet-kit.v1','layout':'single-glacial-cut-diagnostic','uvConvention':'glTF corner UV, Blender V flipped; invertY=false','materials':definitions,'variants':[]}
validation={'publication':'isolated draft; existing ice-r015 untouched','sourceComponentsManifold':True,'attributes':'Corner-expanded native normals and UVs preserve authored hard edges, snow smoothing and seams','variants':[]}
def preserve_authored_ior(path):
 # Blender may omit IOR on opaque materials. Preserve its raw export, then
 # explicitly carry the source Principled IOR into the standard glTF extension.
 raw=out/'blender-raw';raw.mkdir(exist_ok=True);shutil.copy2(path,raw/path.name)
 data=path.read_bytes();length,kind=struct.unpack_from('<II',data,12);gltf=json.loads(data[20:20+length]);tail=data[20+length:]
 for material in gltf['materials']:
  source=next(d for d in definitions if d['name']==material['name']);material.setdefault('extensions',{})['KHR_materials_ior']={'ior':source['ior']}
 used=gltf.setdefault('extensionsUsed',[])
 if 'KHR_materials_ior'not in used:used.append('KHR_materials_ior')
 encoded=json.dumps(gltf,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4)
 path.write_bytes(struct.pack('<III',0x46546c67,2,20+len(encoded)+len(tail))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+tail)
for name,parts in forms:
 positions=[];normals=[];uvs=[];indices=[];roles=[]
 for obj in parts:
  mesh=obj.data
  if mesh.validate():raise RuntimeError('Invalid '+obj.name)
  bm=bmesh.new();bm.from_mesh(mesh)
  if any(not e.is_manifold for e in bm.edges):raise RuntimeError('Non-manifold '+obj.name)
  bm.free()
  if not mesh.uv_layers.active:mesh.uv_layers.new(name='Native-surface-UV')
  uv=mesh.uv_layers.active
  for polygon in mesh.polygons:
   axis=max(range(3),key=lambda i:abs(polygon.normal[i]));axes=[i for i in range(3)if i!=axis]
   for loop in polygon.loop_indices:
    v=mesh.vertices[mesh.loops[loop].vertex_index].co;uv.data[loop].uv=(v[axes[0]]*.25+.5,v[axes[1]]*.25+.5)
  mesh.calc_loop_triangles()
  for tri in mesh.loop_triangles:
   for vertex,loop in zip(tri.vertices,tri.loops):
    p=obj.matrix_world@mesh.vertices[vertex].co;n=(obj.matrix_world.to_3x3().inverted().transposed()@mesh.corner_normals[loop].vector).normalized()
    if not all(math.isfinite(x)for x in[*p,*n]):raise RuntimeError('Non-finite attributes')
    positions.extend(p);normals.extend(n);uvs.extend((uv.data[loop].uv.x,1-uv.data[loop].uv.y));indices.append(len(indices))
   roles.append(materials.index(mesh.materials[tri.material_index]))
 kit['variants'].append({'name':name,'positions':positions,'normals':normals,'uvs':uvs,'indices':indices,'triangleMaterials':roles})
 validation['variants'].append({'name':name,'triangles':len(indices)//3,'normalCount':len(normals)//3,'uvCount':len(uvs)//2,'bounds':[[min(positions[a::3]),max(positions[a::3])]for a in range(3)]})
 bpy.ops.object.select_all(action='DESELECT')
 for o in parts:o.select_set(True)
 bpy.context.view_layer.objects.active=parts[0];bpy.ops.export_scene.gltf(filepath=str(out/(name+'.glb')),export_format='GLB',use_selection=True,export_extras=True)
 preserve_authored_ior(out/(name+'.glb'))
(out/'kit.json').write_text(json.dumps(kit,separators=(',',':')))
# Layout is preview only; exported kit stays local-origin and fully editable.
for i,(name,parts)in enumerate(forms):
 for o in parts:
  if i:o.hide_render=True

scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=False;scene.render.film_transparent=True;scene.world.color=(.08,.08,.08);scene.view_settings.view_transform='AgX';scene.render.resolution_x=1500;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
bpy.ops.object.camera_add(location=(4,-6,5));camera=bpy.context.object;camera.name='CAM-ice-kit';camera.rotation_euler=(Vector((0,0,.1))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=5.2;scene.camera=camera
for name,loc,power,size in[('KEY',(-4,-5,9),1400,6),('FILL',(4,2,6),700,5)]:
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.name=name;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.wm.save_as_mainfile(filepath=str(out/'kit.blend'));scene.render.filepath=str(out/'kit-preview.png');bpy.ops.render.render(write_still=True)
validation['sha256']={p.name:hashlib.sha256(p.read_bytes()).hexdigest()for p in out.iterdir()if p.is_file()};(out/'validation.json').write_text(json.dumps(validation,indent=2));print('ICE_R017_DONE',validation['variants'])
