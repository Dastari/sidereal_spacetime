"""Blender-native faceted crystal formations and dark fracture geology.
Run: blender -b --python scripts/art_library/build_crystal_native_kit_r009.py -- NEW_OUTPUT
"""
import bpy,bmesh,json,math,sys,hashlib
from pathlib import Path
from mathutils import Vector
out=Path(sys.argv[sys.argv.index('--')+1]).resolve();out.mkdir(parents=True,exist_ok=True)
if(out/'kit.blend').exists():raise RuntimeError('Preserve previous source revision')
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
palette=[('dark-lilac-crust',(.12,.08,.18),.90),('fracture-shadow',(.018,.010,.033),.95),('cliff-edge',(.28,.20,.35),.84),('crystal-violet',(.30,.006,.54),.17),('crystal-magenta',(.65,.015,.51),.19),('crystal-dark-facet',(.071,.003,.17),.22),('crystal-bright-edge',(.70,.09,.77),.15),('crystal-core-plane',(.95,.23,.62),.16),('geode-fracture-magenta',(.25,.018,.23),.55)]
materials=[]
for name,color,rough in palette:
 m=bpy.data.materials.new(name);m.use_nodes=True;s=m.node_tree.nodes.get('Principled BSDF');s.inputs['Base Color'].default_value=(*color,1);s.inputs['Roughness'].default_value=rough
 if name.startswith('crystal'):s.inputs['IOR'].default_value=1.48
 if name=='crystal-bright-edge':s.inputs['Emission Color'].default_value=(.52,.018,.8,1);s.inputs['Emission Strength'].default_value=.18
 if name=='crystal-core-plane':s.inputs['Emission Color'].default_value=(.75,.05,.42,1);s.inputs['Emission Strength'].default_value=1.25
 if name=='geode-fracture-magenta':s.inputs['Emission Color'].default_value=(.20,.002,.16,1);s.inputs['Emission Strength'].default_value=.25
 materials.append(m)
forms=[]
def make(name,verts,faces,roles):
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new('GEO-'+name,mesh);scene.collection.objects.link(o)
 for m in materials:mesh.materials.append(m)
 for p,r in zip(mesh.polygons,roles):p.material_index=r
 bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(mesh);bm.free();o['role']='planet';o['authoring']='native-planets--crystal-moon-1-r002';return o

def crystal(name,x,y,width,height,leanx=0,leany=0,phase=0):
 # Twelve-sided bevelled hexagonal section: broad reflective faces alternate
 # with narrow bright edge facets. One non-centred apex creates unequal faces.
 outline=[]
 for i in range(6):
  a=i*math.pi/3+phase
  for da in [-.045,.045]:outline.append((math.cos(a+da)*width,math.sin(a+da)*width))
 verts=[]
 for z,scale in [(-.14,.88),(height*.08,1),(height*(.66+.10*math.sin(phase)),.95)]:
  verts.extend((x+px*scale+leanx*z,y+py*scale+leany*z,z) for px,py in outline)
 apex=len(verts);verts.append((x+leanx*height+width*.18,y+leany*height-width*.09,height))
 n=len(outline);faces=[tuple(range(n-1,-1,-1))];roles=[5]
 for j in range(2):
  for i in range(n):
   faces.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i));roles.append(6 if i%2==0 else [3,7,5,3,4,5][i//2])
 for i in range(n):faces.append((2*n+i,2*n+(i+1)%n,apex));roles.append(6 if i%2==0 else [7,3,5,4,3,5][i//2])
 return make(name,verts,faces,roles)
layouts=[('colossal-cluster',[(-.04,.03,.40,1.64,.045,0,0),(-.43,.02,.24,1.02,-.18,.04,.3),(.39,.16,.21,.85,.24,.02,.1),(.16,-.35,.14,.74,.08,-.15,.4)]),('leaning-colossal-cluster',[(-.12,.05,.34,1.58,-.22,.02,.25),(.31,.13,.25,1.05,.16,.06,.1),(-.25,-.27,.16,.88,-.08,-.1,.4)]),('medium-cluster',[(-.15,.03,.17,1.03,-.035,0,.3),(.23,.11,.12,.72,.12,.05,0),(-.01,-.21,.11,.56,.01,-.1,.2)]),('single-crystal',[(0,0,.20,1.45,.09,.02,.2)])]
for name,layout in layouts:forms.append((name,[crystal(name+'-'+str(i),*v) for i,v in enumerate(layout)]))
outline=[(-.52,-.23),(-.46,-.30),(-.24,-.28),(-.19,-.20),(-.11,-.23),(-.12,-.39),(.16,-.37),(.27,-.31),(.30,-.20),(.43,-.17),(.48,-.08),(.39,.21),(.27,.22),(.20,.13),(.12,.17),(.16,.34),(-.11,.27),(-.31,.34),(-.40,.27)]
def shelf(name,x,y,sx,sy,h):
 verts=[]
 for z,scale in [(-.22,1.03),(h-.03,1),(h,.95)]:verts.extend((x+px*sx*scale,y+py*sy*scale,z)for px,py in outline)
 n=len(outline);faces=[tuple(range(n-1,-1,-1))];roles=[1]
 for j in range(2):
  for i in range(n):faces.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i));roles.append((1 if i%3==0 else 0)if j==0 else 2)
 faces.append(tuple(range(2*n,3*n)));roles.append(0);return make(name,verts,faces,roles)
forms.append(('fracture-cliffs',[shelf('fracture-a',-.38,.07,.81,.92,.32),shelf('fracture-b',.29,.19,.52,.77,.24),shelf('fracture-c',.12,-.31,.62,.31,.21)]))
forms.append(('low-fractured-shelf',[shelf('low-a',-.29,.02,.94,.97,.16),shelf('low-b',.39,.13,.67,.71,.22)]))
# Explicit reuse of retained native rocky source geometry. Material remapping
# defines crystal-family crust; it does not imply acceptance of either family.
rocky_path=Path('output/playwright/planet-reference-20260914/rocky-r010/kit.json')
rocky=json.loads(rocky_path.read_text());role_map=[0,2,1,0,8,2]
for source_name in ['battered-region-a','battered-region-b']:
 with bpy.data.libraries.load(str(rocky_path.parent/'kit.blend'),link=False) as (source,target):
  target.objects=[name for name in source.objects if name.startswith('GEO-'+source_name)]
 parts=[]
 for obj in target.objects:
  if obj is None or obj.type!='MESH':continue
  scene.collection.objects.link(obj);obj.location=(0,0,0)
  mesh=obj.data;source_roles=[next(i for i,m in enumerate(rocky['materials'])if slot.name.split('.')[0]==m['name'])for slot in mesh.materials]
  roles=[role_map[source_roles[p.material_index]]for p in mesh.polygons];mesh.materials.clear()
  for material in materials:mesh.materials.append(material)
  for polygon,role in zip(mesh.polygons,roles):polygon.material_index=role
  obj.name='GEO-crystal-'+obj.name;obj['role']='planet';obj['authoring']='native-planets--crystal-moon-1-r002';parts.append(obj)
 if not parts:raise RuntimeError('Missing native Blender region objects')
 forms.append(('crystal-'+source_name,parts))
for name, subdivisions in [('ground-sphere',5),('ground-sphere-medium',4),('ground-sphere-low',3)]:
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=1)
    ground=bpy.context.object
    ground.name='GEO-'+name
    ground.data.materials.append(materials[0])
    for face in ground.data.polygons: face.use_smooth=True
    ground['role']='planet'
    forms.append((name,[ground]))


for name,parts in forms:
 if name not in ('colossal-cluster','leaning-colossal-cluster','medium-cluster','single-crystal'):continue
 for obj in parts:
  for vertex in obj.data.vertices:
   vertex.co.z*=0.65
   vertex.co.x*=1.18;vertex.co.y*=1.18
  bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()


# Blunt irregular columns share low connected feet. Broad optical surfaces and
# narrow bevel lips replace dagger populations as the middle crystalline crust.
def lunar_prism(name,x,y,width,depth,height,phase):
 outline=[(-.48,-.31),(-.22,-.49),(.28,-.43),(.49,-.17),(.43,.29),(.12,.46),(-.34,.39),(-.51,.10)]
 verts=[]
 for z,scale in[(-.13,1.08),(height*.53,1.02),(height-.024,1),(height,.91)]:
  for px,py in outline:
   a=px*width;b=py*depth;verts.append((x+(a*math.cos(phase)-b*math.sin(phase))*scale,y+(a*math.sin(phase)+b*math.cos(phase))*scale,z))
 n=len(outline);faces=[tuple(range(n-1,-1,-1))];roles=[5]
 for layer in range(3):
  for j in range(n):
   faces.append((layer*n+j,layer*n+(j+1)%n,(layer+1)*n+(j+1)%n,(layer+1)*n+j))
   roles.append((6 if j in (1,5) else 3) if layer==2 else [5,3,4,5,3,4,5,3][j])
 faces.append(tuple(range(3*n,4*n)));roles.append(4 if phase>.25 else 3)
 return make(name,verts,faces,roles)
for form,scale in [('squat-crystal-district',1),('angular-crystal-district',1.55)]:
 layout=[(-.20,.02,.73,.53,.24,.1),(.21,.19,.49,.51,.35,.30),(.27,-.24,.43,.35,.20,-.15),(-.42,-.22,.31,.34,.15,.42)]
 parts=[lunar_prism('moon-district-'+form+'-'+str(i),x,y,w,d,h*scale,a) for i,(x,y,w,d,h,a) in enumerate(layout)]
 forms.append((form,parts))
# Crystalline cap regions use the existing authored violet/core optical roles.
# Keep dark cavity pigment and geometry; do not substitute painted bright holes.
for name,parts in forms:
 if not name.startswith('crystal-battered-region-'):continue
 for obj in parts:
  for face in obj.data.polygons:
   q=face.center
   if face.material_index in (0,2) and face.normal.z>.35 and q.z>.08:
    face.material_index=3 if q.x<.5 else 5

kit={'schema':'sidereal.native-planet-kit.v1','layout':'crystal-moon-geology','coveredReferenceIds':['planets--crystal-moon-1'],'compositionRecipe':{'referenceId': 'planets--crystal-moon-1', 'layoutSeed': 1973, 'scales': [0.36, 0.33, 0.37, 0.34, 0.36, 0.32, 0.37, 0.33, 0.36, 0.34], 'variantOffset': 1, 'hero': 0.16},'materials':[{'name':name,'linearColor':list(color),'roughness':roughness} for name,color,roughness in palette],'variants':[]}
kit['materials'][6].update({'emissiveColor':[.52,.018,.8],'emissiveStrength':.18})
for material in kit['materials'][3:8]:material['ior']=1.48
kit['materials'][7].update({'emissiveColor':[.75,.05,.42],'emissiveStrength':1.25})
kit['materials'][8].update({'emissiveColor':[.20,.002,.16],'emissiveStrength':.25})
# Offline native texture authoring: broad optical cores and fine unlit rock
# pigment. Images remain packed editable Blender material sources, not shaders.
kit['uvConvention']='glTF UV (Blender V flipped); invertY=false'
for role in [0,1,2,3,4,5,6,7]:
 rock=role<3;size=256;image=bpy.data.images.new('Crystal9-material-'+str(role),width=size,height=size,alpha=True);pixels=[]
 roughimage=bpy.data.images.new('Crystal9-roughness-'+str(role),width=size,height=size,alpha=True) if rock else None;roughpixels=[]
 color=palette[role][1]
 for y in range(size):
  for x in range(size):
   u=(x+.5)/size;v=(y+.5)/size
   if rock:
    grain=.76+.11*math.sin(u*27+math.sin(v*19)*2.8)+.07*math.sin(v*51+math.sin(u*37)*3)+.035*math.sin(x*2.13+y*4.67)
    fracture=math.exp(-((u-(.18+.11*math.sin(v*7)))/.007)**2)+math.exp(-((v-(.68+.08*math.sin(u*9)))/.009)**2)
    factor=max(.22,grain-fracture*.3);rough=max(.5,min(1,palette[role][2]*(.86+.14*grain)))
    rgb=[c*factor for c in color];roughpixels.extend((1,rough,0,1))
   else:
    core=math.exp(-((u-.48)/.29)**2)*(.25+.75*math.sin(math.pi*v)**.62)
    facet=.27+.73*core;rgb=[c*facet for c in color]
   # Palette is linear reflectance; PNG/glTF base color is sRGB encoded.
   rgb=[12.92*c if c<=.0031308 else 1.055*c**(1/2.4)-.055 for c in rgb]
   pixels.extend((*rgb,1))
 image.pixels.foreach_set(pixels);image.filepath_raw=str(out/f'material-{role}-albedo.png');image.file_format='PNG';image.save();image.pack()
 shader=materials[role].node_tree.nodes.get('Principled BSDF');tex=materials[role].node_tree.nodes.new('ShaderNodeTexImage');tex.image=image;materials[role].node_tree.links.new(tex.outputs['Color'],shader.inputs['Base Color'])
 definition=kit['materials'][role];definition.update(linearColor=[1,1,1],baseColorTexture=f'material-{role}-albedo.png',textureColorSpace='sRGB',invertY=False)
 if rock:
  roughimage.colorspace_settings.name='Non-Color';roughimage.pixels.foreach_set(roughpixels);roughimage.filepath_raw=str(out/f'material-{role}-orm.png');roughimage.file_format='PNG';roughimage.save();roughimage.pack()
  t=materials[role].node_tree.nodes.new('ShaderNodeTexImage');t.image=roughimage;sep=materials[role].node_tree.nodes.new('ShaderNodeSeparateColor');materials[role].node_tree.links.new(t.outputs['Color'],sep.inputs['Color']);materials[role].node_tree.links.new(sep.outputs['Green'],shader.inputs['Roughness']);materials[role].node_tree.links.new(sep.outputs['Blue'],shader.inputs['Metallic']);definition.update(roughness=1,metallic=1,metallicRoughnessTexture=f'material-{role}-orm.png')
 if role in [6,7]:
  materials[role].node_tree.links.new(tex.outputs['Color'],shader.inputs['Emission Color']);shader.inputs['Emission Strength'].default_value=.18 if role==6 else 1.25
  definition.update(emissiveColor=[1,1,1],emissiveTexture=f'material-{role}-albedo.png')
validation={'publication':'isolated draft; no owner final sign-off','coordinates':'Blender Z up, formation roots buried below Z0; ground sphere radius1','partsManifold':True,'variants':[]}
for name,parts in forms:
    positions=[];indices=[];roles=[];normals=[];uvs=[]
    for obj in parts:
        mesh=obj.data
        if mesh.validate():raise RuntimeError('Invalid mesh '+obj.name)
        bm=bmesh.new();bm.from_mesh(mesh)
        if any(not e.is_manifold for e in bm.edges):raise RuntimeError('Non-manifold '+obj.name)
        bm.free()
        if not mesh.uv_layers.active:mesh.uv_layers.new(name='Native-material-UV')
        uv=mesh.uv_layers.active
        for p in mesh.polygons:
            role=materials.index(mesh.materials[p.material_index]);coords=[mesh.vertices[v].co for v in p.vertices]
            if 3<=role<=7:
                direction=(coords[1]-coords[0]).normalized();center=sum(coords,Vector())/len(coords)
                # Broad face-local U and height V retain continuous core depth.
                axis=0 if max(v.x for v in coords)-min(v.x for v in coords)>max(v.y for v in coords)-min(v.y for v in coords) else 1
                lo=min(v[axis]for v in coords);hi=max(v[axis]for v in coords);zlo=min(v.co.z for v in mesh.vertices);zhi=max(v.co.z for v in mesh.vertices)
                for loop in p.loop_indices:
                    q=mesh.vertices[mesh.loops[loop].vertex_index].co;uv.data[loop].uv=((q[axis]-lo)/max(hi-lo,.001),(q.z-zlo)/max(zhi-zlo,.001))
            else:
                axes=[i for i in range(3)if i!=max(range(3),key=lambda j:abs(p.normal[j]))]
                for loop in p.loop_indices:
                    q=mesh.vertices[mesh.loops[loop].vertex_index].co;uv.data[loop].uv=(q[axes[0]]*.7+.5,q[axes[1]]*.7+.5)
        mesh.calc_loop_triangles()
        for tri in mesh.loop_triangles:
            for vertex,loop in zip(tri.vertices,tri.loops):
                positions.extend(obj.matrix_world@mesh.vertices[vertex].co);normals.extend((obj.matrix_world.to_3x3().inverted().transposed()@mesh.corner_normals[loop].vector).normalized());uvs.extend((uv.data[loop].uv.x,1-uv.data[loop].uv.y));indices.append(len(indices))
            roles.append(materials.index(mesh.materials[tri.material_index]))
    kit['variants'].append({'name':name,'positions':positions,'indices':indices,'triangleMaterials':roles,'normals':normals,'uvs':uvs})
    validation['variants'].append({'name':name,'vertices':len(positions)//3,'triangles':len(indices)//3,'bounds':[[min(positions[axis::3]),max(positions[axis::3])] for axis in range(3)]})
    bpy.ops.object.select_all(action='DESELECT')
    for obj in parts: obj.select_set(True)
    bpy.context.view_layer.objects.active=parts[0]
    bpy.ops.export_scene.gltf(filepath=str(out/(name+'.glb')),export_format='GLB',use_selection=True,export_extras=True)
    sys.path.insert(0,str(Path('scripts/art_library').resolve()))
    from preserve_native_kit_ior import corrected_glb
    raw=out/'blender-raw';raw.mkdir(exist_ok=True);path=out/(name+'.glb');(raw/path.name).write_bytes(path.read_bytes());corrected,_=corrected_glb(path.read_bytes(),{m['name']:m for m in kit['materials']});path.write_bytes(corrected)
kit['sourceReuse']={'path':str(rocky_path),'sha256':hashlib.sha256(rocky_path.read_bytes()).hexdigest(),'variants':['battered-region-a','battered-region-b'],'materialMap':role_map}
(out/'kit.json').write_text(json.dumps(kit,separators=(',',':')))

# Keep separate native objects editable and arrange them for a documented kit preview.
for i,(name,parts) in enumerate(forms):
    for obj in parts:
        obj.location+=Vector((i%4*2.3-3.45,i//4*2.6-1.3,0))
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
print('CRYSTAL_NATIVE_KIT_DONE',json.dumps(validation['variants']))
