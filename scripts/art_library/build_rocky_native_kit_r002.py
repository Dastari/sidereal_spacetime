"""Author native crater bowls and fractured rock in Blender. No voxel sampling.
Run: blender -b --python scripts/art_library/build_rocky_native_kit_r002.py -- NEW_OUTPUT
Kit Z-up. Crater floors sit above substrate Z=0; keep dominant forms at all LOD.
"""
import bpy, bmesh, json, math, sys, hashlib
from pathlib import Path
from mathutils import Vector
out=Path(sys.argv[sys.argv.index('--')+1]).resolve()
out.mkdir(parents=True,exist_ok=True)
if (out/'kit.blend').exists(): raise RuntimeError('Revision already exists')
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
palette=[
 ('regolith-lilac',(.34,.29,.40),.91),
 ('sunlit-rim',(.53,.45,.60),.87),
 ('dark-cavity',(.033,.027,.052),.97),
 ('fractured-side',(.115,.083,.16),.92),
 ('warm-mineral',(.48,.16,.035),.78),
 ('pale-fracture',(.66,.57,.71),.85),
]
materials=[]
for name,color,roughness in palette:
 m=bpy.data.materials.new(name);m.use_nodes=True
 s=m.node_tree.nodes.get('Principled BSDF')
 s.inputs['Base Color'].default_value=(*color,1)
 s.inputs['Roughness'].default_value=roughness
 materials.append(m)
forms=[]
def mesh_object(name,verts,faces,roles):
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
 obj=bpy.data.objects.new('GEO-'+name,mesh);scene.collection.objects.link(obj)
 for m in materials:mesh.materials.append(m)
 for p,r in zip(mesh.polygons,roles):p.material_index=r
 bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(mesh);bm.free()
 obj['role']='planet';obj['authoring']='native-rocky-r002'
 return obj

# Explicit profiles cut a deep basin into a closed solid: no overlapping disc or
# ring illusion. Broad floor, near-vertical inner wall, broken raised crest and
# sloping external talus are retained exactly in every runtime detail level.
def crater(name,size,phase,broken=False):
 n=32
 rings=[(.0,.0)] # separately authored centre follows ring vertices below
 profile=[(.30,.035),(.34,.055),(.40,.10),(.44,.28),(.49,.34),(.57,.32),(.68,.18),(.91,.02),(1.0,-.14)]
 verts=[]
 for j,(radius,height) in enumerate(profile):
  for i in range(n):
   a=i*2*math.pi/n
   fracture=1+.052*math.sin(i*2.3+phase)+.035*math.cos(i*1.1-phase)
   # One explicit broken rim gap does not become a repeated tooth pattern.
   gap= .18 if broken and i in (3,4,5) and 3<=j<=6 else 0
   z=height-gap+(0 if j<2 else .025*math.sin(i*.9+phase))
   verts.append((size*radius*fracture*math.cos(a),size*radius*fracture*math.sin(a)*.89,size*z))
 faces=[tuple(range(n-1,-1,-1))];roles=[2]
 for j in range(len(profile)-1):
  for i in range(n):
   faces.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
   roles.append(2 if j<2 else 3 if j==2 else 1 if j in (3,4) else 0 if j>=6 else (5 if i in (8,9,10,20) else 0))
 faces.append(tuple(range((len(profile)-1)*n,len(profile)*n)));roles.append(3)
 return mesh_object(name,verts,faces,roles)
for name,size,phase,broken in [('crater-large',1,0,False),('crater-broken',.93,1.7,True),('crater-small',.52,3.1,True)]:
 forms.append((name,[crater(name,size,phase,broken)]))

outline=[(-.52,-.28),(-.18,-.28),(-.12,-.39),(.27,-.36),(.48,-.14),(.39,.21),(.16,.34),(-.11,.27),(-.40,.32)]
def shelf(name,x,y,sx,sy,h,role=0):
 verts=[]
 for z,scale in [(-.14,1.03),(h-.028,1),(h,.94)]:
  verts.extend((x+px*sx*scale,y+py*sy*scale,z) for px,py in outline)
 n=len(outline);faces=[tuple(range(n-1,-1,-1))];roles=[3]
 for j in range(2):
  for i in range(n):
   faces.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i));roles.append(3 if j==0 else 1)
 faces.append(tuple(range(2*n,3*n)));roles.append(role)
 return mesh_object(name,verts,faces,roles)
forms.append(('fractured-shelf',[shelf('shelf-a',-.32,.12,1.15,.91,.18),shelf('shelf-b',.43,.18,.79,.74,.26),shelf('shelf-c',.08,-.32,.63,.36,.07)]))
forms.append(('angular-outcrops',[shelf('outcrop-a',-.24,.06,.55,.52,.59),shelf('outcrop-b',.19,.04,.42,.43,.39),shelf('outcrop-c',.08,-.28,.36,.25,.21)]))
forms.append(('mineral-seam',[shelf('mineral-a',-.32,.05,.72,.14,.05,4),shelf('mineral-b',.19,-.01,.61,.12,.09,4),shelf('mineral-c',.38,.15,.17,.46,.03,4)]))
for name, subdivisions in [('ground-sphere',5),('ground-sphere-medium',4),('ground-sphere-low',3)]:
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=1)
    ground=bpy.context.object
    ground.name='GEO-'+name
    ground.data.materials.append(materials[0])
    for face in ground.data.polygons: face.use_smooth=True
    ground['role']='planet'
    forms.append((name,[ground]))

kit={'schema':'sidereal.native-planet-kit.v1','layout':'rocky-crater-geology','materials':[{'name':name,'linearColor':list(color),'roughness':roughness} for name,color,roughness in palette],'variants':[]}
validation={'publication':'isolated draft; no owner final sign-off','coordinates':'Blender Z up, formation roots buried below Z0; ground sphere radius1','partsManifold':True,'lodContract':'Dominant crater variants retained unchanged at all levels; ground-sphere high/medium/low are authored originals; small outcrop density may decrease; no decimation.','variants':[]}
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
print('ROCKY_NATIVE_KIT_DONE',json.dumps(validation['variants']))
