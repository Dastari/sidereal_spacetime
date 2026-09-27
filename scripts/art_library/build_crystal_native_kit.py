"""Blender-native faceted crystal formations and dark fracture geology.
Run: blender -b --python scripts/art_library/build_crystal_native_kit.py -- NEW_OUTPUT
"""
import bpy,bmesh,json,math,sys,hashlib
from pathlib import Path
from mathutils import Vector
out=Path(sys.argv[sys.argv.index('--')+1]).resolve();out.mkdir(parents=True,exist_ok=True)
if(out/'kit.blend').exists():raise RuntimeError('Preserve previous source revision')
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
palette=[('dark-lilac-crust',(.12,.08,.18),.90),('fracture-shadow',(.018,.010,.033),.95),('cliff-edge',(.28,.20,.35),.84),('crystal-violet',(.30,.006,.54),.17),('crystal-magenta',(.65,.015,.51),.19),('crystal-dark-facet',(.071,.003,.17),.22),('crystal-bright-edge',(.80,.12,.88),.15)]
materials=[]
for name,color,rough in palette:
 m=bpy.data.materials.new(name);m.use_nodes=True;s=m.node_tree.nodes.get('Principled BSDF');s.inputs['Base Color'].default_value=(*color,1);s.inputs['Roughness'].default_value=rough
 if name.startswith('crystal'):s.inputs['IOR'].default_value=1.48
 if name=='crystal-bright-edge':s.inputs['Emission Color'].default_value=(.52,.018,.8,1);s.inputs['Emission Strength'].default_value=.70
 materials.append(m)
forms=[]
def make(name,verts,faces,roles):
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new('GEO-'+name,mesh);scene.collection.objects.link(o)
 for m in materials:mesh.materials.append(m)
 for p,r in zip(mesh.polygons,roles):p.material_index=r
 bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(mesh);bm.free();o['role']='planet';o['authoring']='native-crystal-r001';return o

def crystal(name,x,y,width,height,leanx=0,leany=0,phase=0):
 # Twelve-sided bevelled hexagonal section: broad reflective faces alternate
 # with narrow bright edge facets. One non-centred apex creates unequal faces.
 outline=[]
 for i in range(6):
  a=i*math.pi/3+phase
  for da in [-.045,.045]:outline.append((math.cos(a+da)*width,math.sin(a+da)*width))
 verts=[]
 for z,scale in [(-.14,.88),(height*.08,1),(height*.80,.95)]:
  verts.extend((x+px*scale+leanx*z,y+py*scale+leany*z,z) for px,py in outline)
 apex=len(verts);verts.append((x+leanx*height+width*.18,y+leany*height-width*.09,height))
 n=len(outline);faces=[tuple(range(n-1,-1,-1))];roles=[5]
 for j in range(2):
  for i in range(n):
   faces.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i));roles.append(6 if i%2==0 else [3,4,5,3,4,5][i//2])
 for i in range(n):faces.append((2*n+i,2*n+(i+1)%n,apex));roles.append(6 if i%2==0 else [4,3,5,4,3,5][i//2])
 return make(name,verts,faces,roles)
layouts=[('colossal-cluster',[(-.04,.03,.30,2.25,.025,0,0),(-.43,.02,.19,1.36,-.14,.04,.3),(.39,.16,.16,1.10,.19,.02,.1),(.16,-.35,.14,.74,.08,-.15,.4)]),('leaning-colossal-cluster',[(-.12,.05,.27,1.92,-.19,.02,.25),(.31,.13,.20,1.40,.12,.06,.1),(-.25,-.27,.16,.88,-.08,-.1,.4)]),('medium-cluster',[(-.15,.03,.17,1.03,-.035,0,.3),(.23,.11,.12,.72,.12,.05,0),(-.01,-.21,.11,.56,.01,-.1,.2)]),('single-crystal',[(0,0,.20,1.45,.09,.02,.2)])]
for name,layout in layouts:forms.append((name,[crystal(name+'-'+str(i),*v) for i,v in enumerate(layout)]))
outline=[(-.52,-.28),(-.18,-.28),(-.12,-.39),(.27,-.36),(.48,-.14),(.39,.21),(.16,.34),(-.11,.27),(-.40,.32)]
def shelf(name,x,y,sx,sy,h):
 verts=[]
 for z,scale in [(-.22,1.03),(h-.03,1),(h,.95)]:verts.extend((x+px*sx*scale,y+py*sy*scale,z)for px,py in outline)
 n=len(outline);faces=[tuple(range(n-1,-1,-1))];roles=[1]
 for j in range(2):
  for i in range(n):faces.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i));roles.append((1 if i%3==0 else 0)if j==0 else 2)
 faces.append(tuple(range(2*n,3*n)));roles.append(0);return make(name,verts,faces,roles)
forms.append(('fracture-cliffs',[shelf('fracture-a',-.38,.07,.81,.92,.63),shelf('fracture-b',.29,.19,.52,.77,.45),shelf('fracture-c',.12,-.31,.62,.31,.21)]))
forms.append(('low-fractured-shelf',[shelf('low-a',-.29,.02,.94,.97,.16),shelf('low-b',.39,.13,.67,.71,.22)]))
for name, subdivisions in [('ground-sphere',5),('ground-sphere-medium',4),('ground-sphere-low',3)]:
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=1)
    ground=bpy.context.object
    ground.name='GEO-'+name
    ground.data.materials.append(materials[0])
    for face in ground.data.polygons: face.use_smooth=True
    ground['role']='planet'
    forms.append((name,[ground]))

kit={'schema':'sidereal.native-planet-kit.v1','layout':'crystal-geology','materials':[{'name':name,'linearColor':list(color),'roughness':roughness} for name,color,roughness in palette],'variants':[]}
kit['materials'][6].update({'emissiveColor':[.52,.018,.8],'emissiveStrength':.70})
for material in kit['materials'][3:]:material['ior']=1.48
validation={'publication':'isolated draft; no owner final sign-off','coordinates':'Blender Z up, formation roots buried below Z0; ground sphere radius1','partsManifold':True,'variants':[]}
for name,parts in forms:
    positions=[]; indices=[]; roles=[]
    for obj in parts:
        if any(not math.isfinite(c) for v in obj.data.vertices for c in v.co):raise RuntimeError('Non-finite '+obj.name)
        if obj.data.validate(): raise RuntimeError('Invalid mesh '+obj.name)
        bm=bmesh.new();bm.from_mesh(obj.data)
        if any(not edge.is_manifold for edge in bm.edges): raise RuntimeError('Non-manifold '+obj.name)
        bm.free()
        obj.data.calc_loop_triangles()
        base=len(positions)//3
        for vert in obj.data.vertices: positions.extend(obj.matrix_world@vert.co)
        for tri in obj.data.loop_triangles:
            indices.extend(base+i for i in tri.vertices)
            roles.append(next(i for i,m in enumerate(materials) if m==obj.data.materials[tri.material_index]))
    kit['variants'].append({'name':name,'positions':positions,'indices':indices,'triangleMaterials':roles})
    validation['variants'].append({'name':name,'vertices':len(positions)//3,'triangles':len(indices)//3,'bounds':[[min(positions[axis::3]),max(positions[axis::3])] for axis in range(3)]})
    bpy.ops.object.select_all(action='DESELECT')
    for obj in parts: obj.select_set(True)
    bpy.context.view_layer.objects.active=parts[0]
    bpy.ops.export_scene.gltf(filepath=str(out/(name+'.glb')),export_format='GLB',use_selection=True,export_extras=True)
(out/'kit.json').write_text(json.dumps(kit,separators=(',',':')))

# Keep separate native objects editable and arrange them for a documented kit preview.
for i,(name,parts) in enumerate(forms):
    for obj in parts:
        obj.location=(i%4*2.3-3.45,i//4*2.6-1.3,0)
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
