"""Native glacial shafts under thick irregular snow. Isolated r021 only.
Run: blender -b --python scripts/art_library/build_ice_native_kit_r021.py -- NEW_OUTPUT
"""
import bpy,bmesh,json,math,sys,hashlib,struct,shutil,random
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
 bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bmesh.ops.triangulate(bm,faces=list(bm.faces));bmesh.ops.subdivide_edges(bm,edges=list(bm.edges),cuts=1,use_grid_fill=True);bm.to_mesh(mesh);bm.free();o['role']='planet';o['authoring']='native-ice-r021';return o

def shaft(name,phase,elongation):
 n=48;profile=[(.20,-.62),(.30,-.60),(.38,-.48),(.39,-.05),(.45,.10),(.48,.17),(.62,.21),(.92,.21),(1.30,.15),(1.50,-.02)]
 verts=[]
 for j,(radius,z)in enumerate(profile):
  for i in range(n):
   a=i*math.tau/n;shape=1+.065*math.sin(i*.73+phase)+.055*math.cos(i*.39-phase)+(.15*math.sin(a*3+.6)+.11*math.cos(a*2) if j>=6 else 0)
   # Grouped unequal ribs are part of the shaft wall rather than broad radial
   # fan cards. Adjacent long facets share the same closed glacial substrate.
   rib=(.035 if i%4 in(0,1)else-.018) if 2<=j<=4 else 0
   height=z
   if j>=5:height+=.016*math.sin(math.floor(i/6)*1.7+phase)
   if j in(3,4):height+=.055*math.sin(i*.61+phase)
   # The outer snowbank opens into a broad off-centre glacial cut. Keep the
   # inner shaft lip closed; the cut starts beyond it and exits the region.
   delta=abs(math.atan2(math.sin(a+.42),math.cos(a+.42)))
   cut=1 if delta<.64 else 0
   if j>=7:height=height*(1-cut)-.47*cut
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
   roles.append(role);smooth.append(False)
 faces.append(tuple(range(len(profile)*n,(len(profile)+1)*n)));roles.append(4);smooth.append(False)
 return mesh_object(name,verts,faces,roles,smooth)
region=shaft('snow-cut-region',0,1.17)

def buttress(name,x,y,r,h,phase,sides=5):
 # Closed angular ice with unequal four/six-sided section; vertical walls and
 # narrow offset snow cornice share a genuine volume, never a radial card.
 n=sides;verts=[]
 for z,scale in[(-.62,1.04),(h-.052,1),(h-.038,1.13),(h,1.08)]:
  for i in range(n):
   a=i*math.tau/n+phase;f=1+[.08,-.09,.04,-.03,.10,-.05][i]
   verts.append((x+math.cos(a)*r*scale*f,y+math.sin(a)*r*scale*.90*f,z+(.012*math.sin(i*1.7+phase)if z>h-.05 else 0)))
 faces=[tuple(range(n-1,-1,-1))];roles=[4]
 for j in range(3):
  for i in range(n):
   faces.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
   roles.append((4 if i==2 else 2 if i%3==0 else 3)if j==0 else 0)
 faces.append(tuple(range(3*n,4*n)));roles.append(0)
 return mesh_object(name,verts,faces,roles)

def snow_shelf(name,outline,z,thickness):
 n=len(outline);cx=sum(x for x,y in outline)/n;cy=sum(y for x,y in outline)/n
 verts=[(cx+(x-cx)*scale,cy+(y-cy)*scale,height) for height,scale in[(z-thickness,.96),(z-.025,1),(z,.985)]for x,y in outline]
 faces=[tuple(range(n-1,-1,-1))];roles=[1]
 for j in range(2):
  for i in range(n):faces.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i));roles.append(0)
 faces.append(tuple(range(2*n,3*n)));roles.append(0)
 return mesh_object(name,verts,faces,roles)
parts=[region,
 buttress('hero-blue-column',.77,-.43,.14,.70,.15,5),
 buttress('blue-column-companion',1.02,-.17,.13,.55,.42,6),
 buttress('blue-column-short',.59,-.75,.14,.39,.70,4),
 buttress('blue-column-mid-a',.94,-.61,.105,.61,.4,5),
 buttress('blue-column-mid-b',1.20,-.36,.115,.45,.3,6),
 buttress('blue-column-mid-c',.74,-.87,.095,.29,.1,4),
 # Unequal attached vertical open-cut wall members, separated by dark gaps.
 buttress('cut-wall-buttress-a',1.32,.11,.17,.23,.1,5),
 buttress('cut-wall-buttress-b',1.54,.02,.14,.12,.3,4),
 buttress('cut-wall-buttress-c',.53,-1.12,.18,.15,.2,6),
 snow_shelf('thick-upper-snow-lobe',[(-1.1,.36),(-.68,.35),(-.63,.48),(-.36,.46),(-.29,.76),(-.45,1.04),(-.91,1.03),(-1.24,.77)],.35,.18),
 snow_shelf('chipped-lower-snow-lobe',[(-1.20,-.75),(-.92,-.97),(-.64,-1.01),(-.46,-.79),(-.60,-.55),(-.53,-.42),(-.83,-.44),(-1.16,-.39)],.29,.15),
 snow_shelf('asymmetric-snow-overhang',[(.65,.42),(.95,.33),(1.16,.44),(1.28,.73),(1.02,.81),(.95,.68),(.74,.70)],.34,.13)]
forms.append(('snow-cut-region',parts))
# Native elongated open gorge, deliberately no circular shaft or bowl.
def gorge_solid(name,outline,top,role):
 n=len(outline);verts=[(x,y,z)for z in[-.84,top]for x,y in outline]
 faces=[tuple(range(n-1,-1,-1))];roles=[4]
 for i in range(n):faces.append((i,(i+1)%n,(i+1)%n+n,i+n));roles.append(2 if i%3 else 3)
 faces.append(tuple(range(n,2*n)));roles.append(role)
 return mesh_object(name,verts,faces,roles)
path=[(-1.82,-.13),(-1.37,-.02),(-1.04,-.19),(-.61,-.11),(-.19,.16),(.27,.12),(.61,-.08),(1.01,.06),(1.48,.21),(1.83,.09)]
upper=[(x,y+.25+[.02,-.04,.05][i%3])for i,(x,y)in enumerate(path)];lower=[(x,y-.27-[.02,-.03,.04][i%3])for i,(x,y)in enumerate(path)]
gorgeparts=[gorge_solid('gorge-deep-open-floor',lower+list(reversed(upper)),-.40,4),
 gorge_solid('gorge-north-snowplain',upper+[(1.88,.69),(1.27,.92),(.72,.77),(.18,1.02),(-.36,.83),(-.89,1.03),(-1.52,.82),(-1.90,.63)],.20,0),
 gorge_solid('gorge-south-snowplain',list(reversed(lower))+[(-1.88,-.73),(-1.24,-.98),(-.78,-.76),(-.21,-1.03),(.43,-.89),(1.03,-1.02),(1.58,-.72),(1.87,-.61)],.14,0),
 snow_shelf('gorge-selective-cornice',[(-1.1,.25),(-.81,.14),(-.50,.22),(-.44,.51),(-.89,.63),(-1.20,.46)],.28,.14),
 snow_shelf('gorge-thick-offset-lobe',[(.29,-.81),(.88,-.85),(1.17,-.62),(.98,-.39),(.61,-.35),(.22,-.49)],.26,.16)]
for i,(x,y,r,h)in enumerate([(-1.22,.22,.13,.55),(-.89,.12,.10,.37),(-.63,.25,.115,.62),(.36,-.20,.13,.46),(.63,-.38,.10,.32),(.92,-.19,.12,.51)]):gorgeparts.append(buttress('gorge-unequal-column-'+str(i),x,y,r,h,.2*i,4+i%3))
for obj in gorgeparts:
 bm=bmesh.new();bm.from_mesh(obj.data)
 for _ in range(8):
  edges=[e for e in bm.edges if e.calc_length()>.25]
  if not edges:break
  bmesh.ops.subdivide_edges(bm,edges=edges,cuts=1,use_grid_fill=True);bmesh.ops.triangulate(bm,faces=list(bm.faces));bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-7);bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=1e-7)
 bm.to_mesh(obj.data);bm.free()
forms.append(('snow-open-gorge',gorgeparts))

# Small, closed snow-covered glacial flakes authored on the native cap surfaces.
# Ray placement is offline Blender authoring; no runtime generation or LOD pop.
for fi,(region_name,region_parts)in enumerate(forms):
 rng=random.Random(21000+fi)
 originals=list(region_parts)
 for k in range(180):
  x,y=rng.uniform(-1.6,1.6),rng.uniform(-1.1,1.1)
  hits=[]
  for obj in originals:
   hit,loc,normal,face=obj.ray_cast(Vector((x,y,2)),Vector((0,0,-1)))
   if hit and normal.z>.75 and loc.z>.12 and obj.data.polygons[face].material_index==0:hits.append(loc.z)
  if not hits:continue
  z=max(hits);w=rng.uniform(.04,.16);d=rng.uniform(.035,.13);h=rng.uniform(.018,.075)
  outline=[(x-w*.5,y-d*.5),(x+w*.35,y-d*.5),(x+w*.5,y-d*.1),(x+w*.45,y+d*.5),(x-w*.5,y+d*.45)]
  n=len(outline);verts=[(px,py,zz)for zz in[z-.012,z+h]for px,py in outline]
  faces=[tuple(range(n-1,-1,-1))]+[(i,(i+1)%n,(i+1)%n+n,i+n)for i in range(n)]+[tuple(range(n,2*n))]
  mesh=bpy.data.meshes.new(region_name+'-snow-fracture-'+str(k));mesh.from_pydata(verts,[],faces);mesh.update()
  obj=bpy.data.objects.new('GEO-'+mesh.name,mesh);scene.collection.objects.link(obj)
  for mat in materials:mesh.materials.append(mat)
  for i,p in enumerate(mesh.polygons):p.material_index=0 if i==len(faces)-1 else 1 if k%4 else 3
  bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
  obj['role']='planet';obj['authoring']='native-ice-r021';region_parts.append(obj)

for name,subdivisions in[('ground-sphere',5),('ground-sphere-medium',4),('ground-sphere-low',3)]:
 bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions,radius=1);o=bpy.context.object;o.name='GEO-'+name;o.data.materials.append(materials[0]);o['role']='planet';o['authoring']='native-ice-r021'
 for p in o.data.polygons:p.use_smooth=True
 forms.append((name,[o]))
kit={'schema':'sidereal.native-planet-kit.v1','layout':'single-glacial-cut-diagnostic','uvConvention':'glTF corner UV, Blender V flipped; invertY=false','materials':definitions,'variants':[]}
# Native powder and facet optical finish remains ordinary PBR.
for role in range(5):
 image=bpy.data.images.new('Ice21-albedo-'+str(role),width=256,height=256,alpha=True);orm=bpy.data.images.new('Ice21-roughness-'+str(role),width=256,height=256,alpha=True);orm.colorspace_settings.name='Non-Color';pixels=[];rp=[]
 for y in range(256):
  for x in range(256):
   u=x/256;v=y/256
   if role==0:factor=.965+.018*math.sin(x*2.73+y*3.71)+.012*math.sin(u*51+v*37);rough=.81+.08*(.5+.5*math.sin(x*2.1+y*4.7))
   else:factor=.60+.27*math.sin(math.pi*v)**.7+.12*math.cos(u*math.pi*2+.5);rough=palette[role][2]*(.75+.50*(.5+.5*math.sin(u*9+v*4)))
   rgb=[c*factor for c in palette[role][1]];rgb=[12.92*c if c<=.0031308 else 1.055*c**(1/2.4)-.055 for c in rgb];pixels.extend((*rgb,1));rp.extend((1,rough,0,1))
 for im,data,slug in[(image,pixels,'albedo'),(orm,rp,'orm')]:
  im.pixels.foreach_set(data);im.filepath_raw=str(out/f'ice-{role}-{slug}.png');im.file_format='PNG';im.save();im.pack()
 mat=materials[role];shader=mat.node_tree.nodes.get('Principled BSDF');tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image;mat.node_tree.links.new(tex.outputs['Color'],shader.inputs['Base Color']);rt=mat.node_tree.nodes.new('ShaderNodeTexImage');rt.image=orm;sep=mat.node_tree.nodes.new('ShaderNodeSeparateColor');mat.node_tree.links.new(rt.outputs['Color'],sep.inputs['Color']);mat.node_tree.links.new(sep.outputs['Green'],shader.inputs['Roughness']);mat.node_tree.links.new(sep.outputs['Blue'],shader.inputs['Metallic']);definitions[role].update(linearColor=[1,1,1],roughness=1,metallic=1,baseColorTexture=f'ice-{role}-albedo.png',metallicRoughnessTexture=f'ice-{role}-orm.png',textureColorSpace='sRGB',invertY=False)
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
validation['sha256']={p.name:hashlib.sha256(p.read_bytes()).hexdigest()for p in out.iterdir()if p.is_file()};(out/'validation.json').write_text(json.dumps(validation,indent=2));print('ICE_R020_DONE',validation['variants'])
