"""Blender-native ocean island kit; main-world morphology, no publication.
Run: blender -b --python scripts/art_library/build_ocean_native_kit_r002.py -- NEW_OUTPUT
"""
import bpy,bmesh,json,math,sys,hashlib
from pathlib import Path
from mathutils import Vector
out=Path(sys.argv[sys.argv.index('--')+1]).resolve();out.mkdir(parents=True,exist_ok=True)
if (out/'kit.blend').exists():raise RuntimeError('Preserve existing revision')
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
palette=[('deep-cobalt',(.008,.105,.40),.34),('shelf-blue',(.014,.23,.49),.36),('shallow-turquoise',(.035,.58,.56),.38),('pale-beach',(.82,.65,.35),.84),('grey-coastal-rock',(.25,.24,.28),.89),('cliff-shadow',(.085,.13,.16),.93),('plateau-green',(.17,.37,.033),.88),('canopy-bright',(.25,.51,.028),.87),('canopy-dark',(.046,.22,.017),.93),('tree-bark',(.14,.065,.023),.93)]
materials=[]
for name,color,rough in palette:
 m=bpy.data.materials.new(name);m.use_nodes=True;s=m.node_tree.nodes.get('Principled BSDF');s.inputs['Base Color'].default_value=(*color,1);s.inputs['Roughness'].default_value=rough;materials.append(m)
forms=[]
def objmesh(name,verts,faces,roles):
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
 o=bpy.data.objects.new('GEO-'+name,mesh);scene.collection.objects.link(o)
 for m in materials:mesh.materials.append(m)
 for p,r in zip(mesh.polygons,roles):p.material_index=r
 bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(mesh);bm.free()
 o['role']='planet';o['authoring']='native-ocean-r002';return o
outline=[(-.83,-.32),(-.46,-.39),(-.28,-.63),(.01,-.57),(.19,-.36),(.50,-.39),(.78,-.13),(.70,.14),(.46,.28),(.41,.57),(.14,.63),(-.11,.40),(-.42,.49),(-.60,.22),(-.86,.12)]
def island(name,x,y,sx,sy,h,phase=0):
 # Broad outer blue apron, turquoise shelf, pale beach, steep rock walls and
 # green plateau are one closed stepped native mesh with no coincident caps.
 profile=[(1.16,-.32),(1.16,-.025),(1.01,.006),(.87,.024),(.79,.049),(.65,.059),(.65,h-.045),(.59,h)]
 verts=[]
 for j,(scale,z) in enumerate(profile):
  for i,(px,py) in enumerate(outline):
   jitter=1+.04*math.sin(i*1.9+phase)
   # Deliberate broad southern cove and narrow cliff-water edges elsewhere.
   # Every shoreline ring varies with its coast section instead of tracing an
   # equally spaced contour around the whole island.
   width=[.10,.16,.64,1.0,.82,.30,.08,.11,.32,.84,.70,.26,.09,.13,.08][i]
   if j<6:scale=.65+(scale-.65)*width
   verts.append((x+px*sx*scale*jitter,y+py*sy*scale*jitter,z))
 n=len(outline);faces=[tuple(range(n-1,-1,-1))];roles=[0]
 for j in range(len(profile)-1):
  for i in range(n):
   faces.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
   roles.append([1,1,2,3,3,4 if i%4<2 else 5,6][j])
 faces.append(tuple(range((len(profile)-1)*n,len(profile)*n)));roles.append(6)
 return objmesh(name,verts,faces,roles)
forms.append(('steep-island',[island('steep-island',0,0,1,1,.65,0)]))
forms.append(('long-island',[island('long-island',0,0,.61,1.48,.46,2.1)]))
forms.append(('archipelago',[island('archipelago-a',-.55,.21,.58,.66,.38,1),island('archipelago-b',.27,-.24,.47,.61,.56,3),island('archipelago-c',.61,.44,.32,.35,.21,4)]))
forms.append(('tiny-islet',[island('tiny-islet',0,0,.40,.49,.25,5)]))
# The atoll is an annular closed stepped coastal ring. Its lagoon floor lies
# below the water substrate, so water shows through the large central opening.
n=32;verts=[]
profile=[(.34,-.12),(.34,.012),(.42,.035),(.48,.079),(.51,.16),(.64,.16),(.69,.065),(.85,.033),(1,.012),(1,-.30)]
for radius,z in profile:
 for i in range(n):
  angle=i*2*math.pi/n;jitter=1+.052*math.sin(i*1.7)
  # Low southern arc and a single higher northern island; not a level doughnut.
  height=z*(.4+.6*max(0,math.sin(angle)))
  verts.append((math.cos(angle)*radius*jitter,math.sin(angle)*radius*jitter*.78,height))
faces=[tuple(range(n-1,-1,-1))];roles=[1]
for j in range(len(profile)-1):
 for i in range(n):
  faces.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i));roles.append([1,2,3,4,6,3,2,1,1][j])
faces.append(tuple(range((len(profile)-1)*n,len(profile)*n)));roles.append(0)
forms.append(('lagoon-atoll',[objmesh('lagoon-atoll',verts,faces,roles)]))
# Editable branching canopy groups. Rounded polygon clusters break the former
# identical block-row canopy, while retaining portable geometry and materials.
for group,layout in [('tree-grove',[(-.20,.0,.52),(.06,.13,.68),(.25,-.09,.44)]),('small-grove',[(-.12,0,.40),(.14,.12,.50)])]:
 parts=[]
 for i,(x,y,h) in enumerate(layout):
  bpy.ops.mesh.primitive_cone_add(vertices=7,radius1=.040,radius2=.025,depth=h,location=(x,y,h/2-.035));o=bpy.context.object;o.name='GEO-'+group+'-trunk-'+str(i);o.data.materials.append(materials[9]);o['role']='planet';parts.append(o)
  for branch,(dx,dy,dz,scale) in enumerate([(-.055,0,-.08,.16),(.07,.03,-.02,.18),(0,-.045,.095,.14)]):
   bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1,location=(x+dx,y+dy,h+dz));o=bpy.context.object;o.name='GEO-'+group+'-canopy-'+str(i)+'-'+str(branch);o.scale=(scale,scale*.89,scale*1.18);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(materials[7 if branch!=0 else 8]);o['role']='planet';parts.append(o)
 forms.append((group,parts))
for name, subdivisions in [('ground-sphere',5),('ground-sphere-medium',4),('ground-sphere-low',3)]:
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=1)
    ground=bpy.context.object
    ground.name='GEO-'+name
    ground.data.materials.append(materials[0])
    for face in ground.data.polygons: face.use_smooth=True
    ground['role']='planet'
    forms.append((name,[ground]))

kit={'schema':'sidereal.native-planet-kit.v1','layout':'ocean-island-geology','materials':[{'name':name,'linearColor':list(color),'roughness':roughness} for name,color,roughness in palette],'variants':[]}
validation={'publication':'isolated draft; no owner final sign-off','coordinates':'Blender Z up, formation roots buried below Z0; ground sphere radius1','partsManifold':True,'lodContract':'Keep dominant island and shoreline variants unchanged at all levels. Ground levels independently authored, no decimation. Worker compose and precompiled shared materials required.','variants':[]}
for name,parts in forms:
    positions=[]; indices=[]; roles=[]
    for obj in parts:
        if any(not math.isfinite(c) for v in obj.data.vertices for c in v.co): raise RuntimeError('Non-finite mesh '+obj.name)
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
