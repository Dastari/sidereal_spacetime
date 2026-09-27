"""Blender-native ocean island kit; main-world morphology, no publication.
Run: blender -b --python scripts/art_library/build_ocean_native_kit_r006.py -- NEW_OUTPUT
"""
import bpy,bmesh,json,math,sys,hashlib
import numpy as np
from pathlib import Path
from mathutils import Vector
out=Path(sys.argv[sys.argv.index('--')+1]).resolve();out.mkdir(parents=True,exist_ok=True)
if (out/'kit.blend').exists():raise RuntimeError('Preserve existing revision')
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
palette=[('deep-cobalt',(.006,.070,.36),1.0),('shelf-blue',(.010,.26,.62),.30),('shallow-turquoise',(.027,.66,.64),.32),('pale-beach',(.82,.65,.35),.84),('grey-coastal-rock',(.25,.24,.28),.89),('cliff-shadow',(.085,.13,.16),.93),('plateau-green',(.17,.37,.033),.88),('canopy-bright',(.25,.51,.028),.87),('canopy-dark',(.046,.22,.017),.93),('tree-bark',(.14,.065,.023),.93)]
materials=[]
for name,color,rough in palette:
 m=bpy.data.materials.new(name);m.use_nodes=True;s=m.node_tree.nodes.get('Principled BSDF');s.inputs['Base Color'].default_value=(*color,1);s.inputs['Roughness'].default_value=rough
 if name in ('deep-cobalt','shelf-blue','shallow-turquoise'):
  s.inputs['Coat Weight'].default_value=.30;s.inputs['Coat Roughness'].default_value=.22
 materials.append(m)
# Authored seamless physical water finish, carried as normal/ORM/albedo PNGs
# through the standard Principled/glTF material; no painted light or shader replacement.
water_images={}
# Periodic irregular capillary finish avoids an authored diamond/grid pattern.
rng=np.random.default_rng(6006);noise=np.zeros((256,512))
for nx,ny,weight in [(17,9,.55),(43,23,.28),(97,51,.17)]:
 grid=rng.uniform(-1,1,(ny+1,nx));ux=np.arange(512)/512*nx;vy=np.arange(256)/256*ny
 ix=np.floor(ux).astype(int);iy=np.floor(vy).astype(int);fx=ux-ix;fy=vy-iy;fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy)
 lower=grid[iy[:,None],ix[None,:]]*(1-fx)+grid[iy[:,None],(ix[None,:]+1)%nx]*fx
 upper=grid[(iy+1)[:,None],ix[None,:]]*(1-fx)+grid[(iy+1)[:,None],(ix[None,:]+1)%nx]*fx
 noise+=weight*(lower*(1-fy[:,None])+upper*fy[:,None])
noise_x=np.roll(noise,-1,axis=1)-np.roll(noise,1,axis=1)
noise_y=np.roll(noise,-1,axis=0)-np.roll(noise,1,axis=0)
for kind in ['albedo','normal','orm']:
 image=bpy.data.images.new('Ocean6-'+kind,width=512,height=256,alpha=True)
 image.colorspace_settings.name='sRGB' if kind=='albedo' else 'Non-Color'
 pixels=[]
 for iy in range(256):
  v=(iy+.5)/256
  for ix in range(512):
   u=(ix+.5)/512;a=math.tau*u;b=math.pi*v
   broad=.5+.20*math.sin(a*3+math.sin(b*4))+.15*math.cos(a*7-b*3)
   wave=float(noise[iy,ix])
   if kind=='albedo':color=(.075+.025*broad,.24+.055*broad,.57+.09*broad,1)
   elif kind=='orm':color=(1,.32+.025*math.sin(a*11+b*9)+.085*wave,0,1)
   else:
    x=float(noise_x[iy,ix])*.85*math.sin(b)
    y=float(noise_y[iy,ix])*.85*math.sin(b)
    z=math.sqrt(max(.001,1-x*x-y*y));color=(x*.5+.5,y*.5+.5,z*.5+.5,1)
   pixels.extend(color)
 image.pixels.foreach_set(pixels);image.filepath_raw=str(out/('water-'+kind+'.png'));image.file_format='PNG';image.save();image.pack();water_images[kind]=image
water=materials[0];nodes=water.node_tree.nodes;links=water.node_tree.links;principled=nodes.get('Principled BSDF')
principled.inputs['Base Color'].default_value=(1,1,1,1)
for kind in water_images:
 tex=nodes.new('ShaderNodeTexImage');tex.image=water_images[kind]
 if kind=='albedo':links.new(tex.outputs['Color'],principled.inputs['Base Color'])
 elif kind=='normal':
  normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=1;links.new(tex.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],principled.inputs['Normal']);links.new(normal.outputs['Normal'],principled.inputs['Coat Normal'])
 else:
  separate=nodes.new('ShaderNodeSeparateColor');links.new(tex.outputs['Color'],separate.inputs['Color']);links.new(separate.outputs['Green'],principled.inputs['Roughness']);links.new(separate.outputs['Blue'],principled.inputs['Metallic'])
forms=[]
def objmesh(name,verts,faces,roles):
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
 o=bpy.data.objects.new('GEO-'+name,mesh);scene.collection.objects.link(o)
 for m in materials:mesh.materials.append(m)
 for p,r in zip(mesh.polygons,roles):p.material_index=r
 bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.triangulate(bm,faces=list(bm.faces));bmesh.ops.subdivide_edges(bm,edges=list(bm.edges),cuts=2,use_grid_fill=True);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(mesh);bm.free()
 o['role']='planet';o['authoring']='native-ocean-r006';return o
outline=[(-.83,-.32),(-.46,-.39),(-.28,-.63),(.01,-.57),(.19,-.36),(.50,-.39),(.78,-.13),(.70,.14),(.46,.28),(.41,.57),(.14,.63),(-.11,.40),(-.42,.49),(-.60,.22),(-.86,.12)]
def island(name,x,y,sx,sy,h,phase=0):
 h *= .50
 # Broad outer blue apron, turquoise shelf, pale beach, steep rock walls and
 # green plateau are one closed stepped native mesh with no coincident caps.
 profile=[(1.16,-.32),(1.16,-.055),(1.01,.010),(.87,.028),(.79,.049),(.65,.059),(.68,max(.065,h*.42)),(.57,max(.07,h*.48)),(.60,max(.075,h-.035)),(.54,h),(.30,h)]
 verts=[]
 for j,(scale,z) in enumerate(profile):
  for i,(px,py) in enumerate(outline):
   jitter=1+.04*math.sin(i*1.9+phase)
   # Deliberate broad southern cove and narrow cliff-water edges elsewhere.
   # Every shoreline ring varies with its coast section instead of tracing an
   # equally spaced contour around the whole island.
   width=[.30,.42,1.90,2.40,1.55,.66,.15,.27,1.05,1.85,2.15,.76,.23,.52,.32][i]
   width*=1+.16*math.sin(phase+i*.67) if j<3 else 1
   vertex_scale=.65+(scale-.65)*width if j<6 else scale
   # Lower/taper the end of every broad shoal beneath open water; selected
   # cliff notches interrupt terrace edges without lowering quiet central caps.
   height=z
   if j==1:height-=.018*(.5+.5*math.sin(i*1.73+phase))
   if 6<=j<=9:
    notch=.025*(1 if i in(2,3,10) else 0)
    vertex_scale*=1-.06*(1 if i in(2,10) else 0);height-=notch
   verts.append((x+px*sx*vertex_scale*jitter,y+py*sy*vertex_scale*jitter,height))
 n=len(outline);faces=[tuple(range(n-1,-1,-1))];roles=[0]
 for j in range(len(profile)-1):
  for i in range(n):
   faces.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
   roles.append([1,1,2,3,3,4 if i%4<2 else 5,4,5 if i in(2,3,10)else 4,6,6][j])
 faces.append(tuple(range((len(profile)-1)*n,len(profile)*n)));roles.append(6)
 return objmesh(name,verts,faces,roles)
forms.append(('steep-island',[island('steep-island',0,0,1,1,.65,0)]))
forms.append(('long-island',[island('long-island',0,0,.61,1.48,.46,2.1)]))
forms.append(('archipelago',[island('archipelago-a',-.55,.21,.58,.66,.38,1),island('archipelago-b',.27,-.24,.47,.61,.56,3),island('archipelago-c',.61,.44,.32,.35,.21,4),island('archipelago-d',-.35,-.54,.36,.40,.30,6),island('archipelago-e',.68,-.27,.28,.34,.18,7)]))
forms.append(('tiny-islet',[island('tiny-islet',0,0,.40,.49,.25,5)]))
# Unequal closed crescent islands: curved inner/outer coasts meet at narrow
# submerged tips, never at a radial rectangular cut plane.
atoll_parts=[]
for section,(start,stop) in enumerate([(6,139),(175,274),(311,351)]):
 n=32;verts=[];mid=math.radians((start+stop)/2);span=math.radians(stop-start)
 profile=[(.39,1.06,-.25),(.39,1.06,-.045),(.31,1.00,.012),(.23,.92,.028),(.17,.83,.052),(.13,.76,.10),(.075,.68,.10)]
 for j,(width,length,z) in enumerate(profile):
  for i in range(n):
   t=i*math.tau/n;angle=mid+span*.5*length*math.cos(t)
   radial=.72+width*math.sin(t)*(1+.12*math.sin(angle*5+section))
   taper=.28+.72*abs(math.sin(t))**.45
   height=z if j==0 else z*taper-.045*(1-taper)
   verts.append((math.cos(angle)*radial,math.sin(angle)*radial*.76,height))
 faces=[tuple(range(n-1,-1,-1))];roles=[0]
 for j in range(len(profile)-1):
  for i in range(n):faces.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i));roles.append([1,1,2,3,4,6][j])
 faces.append(tuple(range((len(profile)-1)*n,len(profile)*n)));roles.append(6)
 atoll_parts.append(objmesh('lagoon-crescent-'+str(section),verts,faces,roles))
forms.append(('lagoon-atoll',atoll_parts))
# Editable branching canopy groups. Rounded polygon clusters break the former
# identical block-row canopy, while retaining portable geometry and materials.
for group,layout in [('tree-grove',[(-.25,.04,.46),(-.10,.19,.63),(.09,.13,.55),(.25,.02,.43),(.09,-.12,.59),(-.14,-.15,.49),(-.31,-.15,.34),(.29,.24,.36)]),('small-grove',[(-.16,0,.35),(.03,.14,.47),(.19,.02,.31),(.01,-.16,.40)])]:
 parts=[]
 for i,(x,y,h) in enumerate(layout):
  bpy.ops.mesh.primitive_cone_add(vertices=7,radius1=.040,radius2=.025,depth=h,location=(x,y,h/2-.035));o=bpy.context.object;o.name='GEO-'+group+'-trunk-'+str(i);o.data.materials.append(materials[9]);o['role']='planet';parts.append(o)
  for branch,(dx,dy,dz,scale) in enumerate([(-.073,0,-.10,.16),(.083,.04,-.028,.19),(0,-.065,.098,.15),(-.04,.096,.016,.17),(.085,-.076,-.06,.14)]):
   bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1,location=(x+dx,y+dy,h+dz));o=bpy.context.object;o.name='GEO-'+group+'-canopy-'+str(i)+'-'+str(branch);o.scale=(scale*(1+.12*math.sin(i)),scale*(.88+.10*math.cos(i)),scale*(.95+.25*math.sin(i+branch)));bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(materials[7 if branch!=0 else 8]);o['role']='planet';parts.append(o)
 forms.append((group,parts))
for name, subdivisions in [('ground-sphere',5),('ground-sphere-medium',4),('ground-sphere-low',3)]:
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=1)
    ground=bpy.context.object
    ground.name='GEO-'+name
    ground.data.materials.append(materials[0])
    for face in ground.data.polygons: face.use_smooth=True
    ground['role']='planet'
    forms.append((name,[ground]))

kit={'schema':'sidereal.native-planet-kit.v1','layout':'ocean-island-geology','materials':[{'name':name,'linearColor':list(color),'roughness':roughness,**({'clearcoatFactor':.30,'clearcoatRoughnessFactor':.22} if name in ('deep-cobalt','shelf-blue','shallow-turquoise') else {})} for name,color,roughness in palette],'variants':[]}
kit['uvConvention']='glTF corner UV; invertY=false'
kit['materials'][0].update(linearColor=[1,1,1],baseColorTexture='water-albedo.png',normalTexture='water-normal.png',clearcoatNormalTexture='water-normal.png',metallicRoughnessTexture='water-orm.png',normalScale=1,textureColorSpace='sRGB',invertY=False,metallic=1)
validation={'publication':'isolated draft; no owner final sign-off','coordinates':'Blender Z up, formation roots buried below Z0; ground sphere radius1','partsManifold':True,'lodContract':'Keep dominant island and shoreline variants unchanged at all levels. Ground levels independently authored, no decimation. Worker compose and precompiled shared materials required.','variants':[]}
for name,parts in forms:
    positions=[]; normals=[]; uvs=[]; indices=[]; roles=[]
    for obj in parts:
        if any(not math.isfinite(c) for v in obj.data.vertices for c in v.co): raise RuntimeError('Non-finite mesh '+obj.name)
        if obj.data.validate(): raise RuntimeError('Invalid mesh '+obj.name)
        bm=bmesh.new();bm.from_mesh(obj.data)
        if any(not edge.is_manifold for edge in bm.edges): raise RuntimeError('Non-manifold '+obj.name)
        bm.free()
        mesh=obj.data
        if not mesh.uv_layers.active:mesh.uv_layers.new(name='Native-surface-UV')
        uv=mesh.uv_layers.active
        for polygon in mesh.polygons:
            axes=[i for i in range(3)if i!=max(range(3),key=lambda j:abs(polygon.normal[j]))]
            values=[]
            for loop in polygon.loop_indices:
                v=mesh.vertices[mesh.loops[loop].vertex_index].co
                values.append((math.atan2(v.y,v.x)/math.tau+.5,math.asin(max(-1,min(1,v.z)))/math.pi+.5)if name.startswith('ground-sphere') else(v[axes[0]]*.25+.5,v[axes[1]]*.25+.5))
            seam=name.startswith('ground-sphere') and max(v[0]for v in values)-min(v[0]for v in values)>.5
            for loop,value in zip(polygon.loop_indices,values):uv.data[loop].uv=(value[0]+(1 if seam and value[0]<.5 else 0),value[1])
        mesh.calc_loop_triangles()
        for tri in mesh.loop_triangles:
            for vertex,loop in zip(tri.vertices,tri.loops):
                positions.extend(obj.matrix_world@mesh.vertices[vertex].co)
                normals.extend((obj.matrix_world.to_3x3().inverted().transposed()@mesh.corner_normals[loop].vector).normalized())
                uvs.extend((uv.data[loop].uv.x,1-uv.data[loop].uv.y));indices.append(len(indices))
            roles.append(next(i for i,m in enumerate(materials) if m==obj.data.materials[tri.material_index]))
    kit['variants'].append({'name':name,'positions':positions,'normals':normals,'uvs':uvs,'indices':indices,'triangleMaterials':roles})
    validation['variants'].append({'name':name,'vertices':len(positions)//3,'triangles':len(indices)//3,'bounds':[[min(positions[axis::3]),max(positions[axis::3])] for axis in range(3)]})
    bpy.ops.object.select_all(action='DESELECT')
    for obj in parts: obj.select_set(True)
    bpy.context.view_layer.objects.active=parts[0]
    bpy.ops.export_scene.gltf(filepath=str(out/(name+'.glb')),export_format='GLB',use_selection=True,export_extras=True)
(out/'kit.json').write_text(json.dumps(kit,separators=(',',':')))

# Keep separate native objects editable and arrange them for a documented kit preview.
for i,(name,parts) in enumerate(forms):
    for obj in parts:
        obj.location += Vector((i%4*2.3-3.45,i//4*2.6-1.3,0))
        if name.startswith('ground-sphere'): obj.scale=(.70,.70,.70)
scene.world.color=(.08,.08,.08)
scene.render.engine='CYCLES'
scene.cycles.samples=32
scene.cycles.use_denoising=False
scene.render.resolution_x=1500;scene.render.resolution_y=850;scene.render.resolution_percentage=100
scene.render.film_transparent=True
scene.view_settings.view_transform='AgX'
bpy.ops.object.camera_add(location=(6,-10,9))
camera=bpy.context.object;camera.name='CAM-kit-review';camera.rotation_euler=(Vector((0,.65,.15))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=12.5
scene.camera=camera
for name,location,energy,size in [('KEY',(-4,-4,8),1600,6),('FILL',(4,1,6),900,5)]:
    bpy.ops.object.light_add(type='AREA',location=location)
    light=bpy.context.object;light.name=name;light.data.energy=energy;light.data.shape='DISK';light.data.size=size;light.rotation_euler=(-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.wm.save_as_mainfile(filepath=str(out/'kit.blend'))
scene.render.filepath=str(out/'kit-preview.png');bpy.ops.render.render(write_still=True)
validation['sha256']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in out.iterdir() if p.is_file()}
(out/'validation.json').write_text(json.dumps(validation,indent=2))
print('OCEAN_NATIVE_KIT_DONE',json.dumps(validation['variants']))
