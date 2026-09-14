"""Author editable volcanic regional geology in Blender, retaining exact native surfaces.
Run: blender -b --python scripts/art_library/build_volcanic_native_kit_r019.py -- NEW_OUTPUT_DIR
No runtime publication. Units are local kit units; formation roots lie below Z=0.
"""
import bpy, bmesh, json, math, sys, hashlib
from pathlib import Path
from mathutils import Vector

out = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
out.mkdir(parents=True, exist_ok=True)
if (out / 'kit.blend').exists():
    raise RuntimeError('Preserve previous revisions: output already contains a source')
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
prior_kit=json.loads(Path('assets/art-library/designs/environment.planet.volcanic/revisions/r018/recipe.json').read_text())
palette=[(m['name'],tuple(m['linearColor']),m['roughness']) for m in prior_kit['materials']]
materials = []
for name, color, roughness in palette:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color,1)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = .18 if name in ('basalt-dark','basalt-cliff','basalt-top') else 0
    if name in ('molten-core','hot-vent'):
        shader.inputs['Emission Color'].default_value=(1,.12,.004,1) if name=='molten-core' else (1,.65,.10,1)
        shader.inputs['Emission Strength'].default_value=2.2 if name=='molten-core' else 4.0
    materials.append(material)

# Not a voxel volume: authored closed polygon extrusions with deliberate stepped
# outlines, vertical exposed strata, inset shoulders and capped bevels.
outline = [(-.50,-.38),(-.12,-.38),(-.12,-.49),(.31,-.49),(.31,-.30),(.49,-.30),(.49,.19),(.30,.19),(.30,.41),(-.18,.41),(-.18,.30),(-.50,.30)]
forms = []
def pillar(name, x, y, width, depth, height, rotation=0, pale=False):
    rings = [(-.18,1.09),(height*.48,1.09),(height*.48,1.02),(height-.012,1.02),(height,.98)]
    verts=[]
    for z, scale in rings:
        for px,py in outline:
            px,py=px*width*scale,py*depth*scale
            verts.append((x+px*math.cos(rotation)-py*math.sin(rotation),y+px*math.sin(rotation)+py*math.cos(rotation),z))
    n=len(outline)
    faces=[tuple(range(n-1,-1,-1))]
    roles=[3]
    for ring in range(len(rings)-1):
        for j in range(n):
            faces.append((ring*n+j,ring*n+(j+1)%n,(ring+1)*n+(j+1)%n,(ring+1)*n+j))
            roles.append((1 if pale else 2) if ring==1 else (5 if pale else 4) if ring==3 else (3 if j%6==4 else 2))
    faces.append(tuple(range((len(rings)-1)*n,len(rings)*n)))
    roles.append(5 if pale else 4)
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(verts,[],faces)
    mesh.update()
    obj=bpy.data.objects.new('GEO-'+name,mesh)
    scene.collection.objects.link(obj)
    for mat in materials: mesh.materials.append(mat)
    for poly,role in zip(mesh.polygons,roles): poly.material_index=role
    obj['role']='planet'
    obj['authoring']='native-volcanic-r019'
    return obj

# Strongly unequal heights/group sizes establish a focal macro hierarchy.
# Regional terrain pieces: long eroded shelf fronts, never concentric plinths.
def cliff_solid(name, footprint, top, bottom=-.24, cap=2):
    # Outline is counter-clockwise; preserve planar cap and exposed strata.
    rings=[(bottom,1),(top-.022,1),(top,1)]
    n=len(footprint);verts=[(x,y,z) for z,_ in rings for x,y in footprint]
    faces=[tuple(range(n-1,-1,-1))];roles=[3]
    for layer in range(2):
        for j in range(n):
            faces.append((layer*n+j,layer*n+(j+1)%n,(layer+1)*n+(j+1)%n,(layer+1)*n+j))
            roles.append(2 if layer==1 else (0 if j%5 in (2,3) else 1))
    faces.append(tuple(range(2*n,3*n)));roles.append(cap)
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    obj=bpy.data.objects.new('GEO-'+name,mesh);scene.collection.objects.link(obj)
    for mat in materials:mesh.materials.append(mat)
    for poly,role in zip(mesh.polygons,roles):poly.material_index=role
    obj['role']='planet';obj['authoring']='native-volcanic-r019'
    return obj

# Broad irregular elevated regions, with canyon cuts entering from several
# edges. These are landmasses with interior area rather than thin cliff strips.
# CCW perimeter, materially different outlines per region.
regions=[
 [(-1.52,-.75),(-1.13,-.75),(-1.13,-1.11),(-.64,-1.11),(-.64,-.68),(-.43,-.68),(-.43,-.23),(-.11,-.23),(-.11,-.78),(.31,-.78),(.31,-1.01),(.76,-1.01),(.76,-.76),(1.31,-.76),(1.31,-.36),(.90,-.36),(.90,-.10),(1.49,-.10),(1.49,.46),(1.10,.46),(1.10,.88),(.60,.88),(.60,1.22),(.13,1.22),(.13,.87),(-.23,.87),(-.23,.46),(-.52,.46),(-.52,.97),(-1.08,.97),(-1.08,.62),(-1.46,.62),(-1.46,.13),(-1.14,.13),(-1.14,-.19),(-1.52,-.19)],
 [(-1.47,-.59),(-.99,-.59),(-.99,-.95),(-.39,-.95),(-.39,-.53),(-.06,-.53),(-.06,-.98),(.49,-.98),(.49,-.64),(1.17,-.64),(1.17,-.24),(.71,-.24),(.71,.17),(1.41,.17),(1.41,.68),(.94,.68),(.94,1.03),(.40,1.03),(.40,.74),(.02,.74),(.02,.29),(-.29,.29),(-.29,1.09),(-.84,1.09),(-.84,.70),(-1.32,.70),(-1.32,.28),(-.96,.28),(-.96,-.03),(-1.47,-.03)],
 [(-1.42,-.74),(-.90,-.74),(-.90,-1.02),(-.35,-1.02),(-.35,-.79),(.10,-.79),(.10,-.35),(.43,-.35),(.43,-.97),(1.08,-.97),(1.08,-.44),(1.39,-.44),(1.39,.04),(1.02,.04),(1.02,.49),(.69,.49),(.69,.95),(.14,.95),(.14,.53),(-.16,.53),(-.16,.93),(-.71,.93),(-.71,.63),(-1.24,.63),(-1.24,.19),(-.88,.19),(-.88,-.12),(-1.42,-.12)]
]
# Broad volcanic slabs are separated by authored connected recessed channels.
# Material indices retain r018: 0dark,1cliff,2cap,3molten,4seal,5hotcore.
for variant in range(3):
 name=['volcanic-region-a','volcanic-region-b','volcanic-region-c'][variant]
 parts=[]
 path=[(-1.50,-.10),(-1.16,-.02),(-.91,-.17),(-.54,-.11),(-.25,.08),(.05,.13),(.29,-.06),(.58,-.13),(.83,.05),(1.12,.13),(1.50,.06)]
 path=[(x,y+.08*math.sin(i*1.2+variant)) for i,(x,y) in enumerate(path)]
 left=[(x,y+.12+.02*math.sin(i)) for i,(x,y) in enumerate(path)]
 right=[(x,y-.12-.02*math.cos(i)) for i,(x,y) in enumerate(path)]
 # One upper region is split by a branch; large caps intentionally remain quiet.
 west=left[:6]+[(.05,.46),(-.18,.46),(-.18,.94),(-.63,.94),(-.63,.78),(-1.18,.78),(-1.18,.53),(-1.50,.53)]
 east=left[6:]+[(1.50,.70),(1.20,.70),(1.20,.93),(.74,.93),(.74,.78),(.34,.78),(.34,.42),(.29,.42)]
 south=list(reversed(right))+[(-1.50,-.68),(-1.10,-.68),(-1.10,-.94),(-.55,-.94),(-.55,-.75),(-.20,-.75),(-.20,-.91),(.34,-.91),(.34,-.74),(.84,-.74),(.84,-.88),(1.31,-.88),(1.31,-.58),(1.50,-.58)]
 for i,poly in enumerate([west,east,south]):
  parts.append(cliff_solid(name+'-quiet-basalt-plateau-'+str(i),poly,[.34,.26,.30][(i+variant)%3],cap=2))
 def channel(slug,points,width,top,role):
  upper=[];lower=[]
  for i,(x,y) in enumerate(points):
   p=points[max(0,i-1)];q=points[min(len(points)-1,i+1)];dx,dy=q[0]-p[0],q[1]-p[1];length=math.hypot(dx,dy)
   nx,ny=-dy/length,dx/length;w=width*(1+.16*math.sin(i*2.3+variant))
   upper.append((x+nx*w,y+ny*w));lower.append((x-nx*w,y-ny*w))
  poly=lower+list(reversed(upper))
  parts.append(cliff_solid(name+'-'+slug,poly,top,bottom=-.27,cap=role))
 channel('deep-molten-trunk',path,.115,.032,3)
 channel('white-hot-trunk-core',path,.032,.041,5)
 branch=[(.16,.12),(.19,.39),(.12,.59),(.22,.81),(.16,1.05)]
 channel('recessed-molten-branch',branch,.083,.029,3)
 channel('hot-branch-core',branch,.022,.038,5)
 # Compact medium fracture ledges interrupt selected cliff stretches only.
 for i,(x,y,w,d,h) in enumerate([(-1.05,.25,.34,.23,.45),(-.66,.30,.29,.30,.40),(-.47,-.33,.37,.25,.42),(.53,-.35,.30,.28,.39),(.99,.31,.29,.26,.40),(.79,.56,.25,.26,.36)]):
  obj=pillar(name+'-fracture-buttress-'+str(i),x,y,w,d,h,0)
  for face in obj.data.polygons:face.material_index=2 if face.normal.z>.5 else 0 if face.index%3 else 1
  parts.append(obj)
 if variant!=2:
  cx,cy=(-.70,.59) if variant==0 else (.96,-.54)
  # Broken vent rim is native closed segments around a recessed hot throat.
  for i in range(8):
   if i==5:continue
   a=i*math.tau/8;b=(i+1)*math.tau/8
   poly=[(cx+math.cos(a)*.24,cy+math.sin(a)*.24),(cx+math.cos(b)*.24,cy+math.sin(b)*.24),(cx+math.cos(b)*.11,cy+math.sin(b)*.11),(cx+math.cos(a)*.11,cy+math.sin(a)*.11)]
   parts.append(cliff_solid(name+'-breached-vent-rim-'+str(i),poly,.49+.11*math.sin(i*1.9),cap=1))
  throat=[(cx+math.cos(i*math.tau/12)*.12,cy+math.sin(i*math.tau/12)*.12) for i in range(12)]
  parts.append(cliff_solid(name+'-deep-hot-vent',throat,.35,cap=5))
 forms.append((name,parts))

for name, subdivisions in [('ground-sphere',7),('ground-sphere-medium',6),('ground-sphere-low',5)]:
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=1)
    ground=bpy.context.object
    ground.name='GEO-'+name
    ground.data.materials.append(materials[0])
    for face in ground.data.polygons: face.use_smooth=True
    ground['role']='planet'
    forms.append((name,[ground]))

# Preserve native planar surfaces while adding deformation support vertices.
# Global conforming edge subdivision retains watertight closed solids, unlike
# splitting only cap triangles and leaving hanging edge vertices on cliff walls.
for name, parts in forms:
    if name.startswith('ground-sphere'):
        continue
    for obj in parts:
        bm=bmesh.new();bm.from_mesh(obj.data)
        bmesh.ops.triangulate(bm, faces=list(bm.faces))
        # Split only long edges, retaining original dense cliff/summit detail.
        # Each bounded pass halves those edges; conforming face retriangulation
        # keeps exact planar geometry and material assignments.
        for _ in range(8):
            long_edges=[edge for edge in bm.edges if edge.calc_length()>.30]
            if not long_edges: break
            bmesh.ops.subdivide_edges(bm, edges=long_edges, cuts=1, use_grid_fill=True)
            bmesh.ops.triangulate(bm, faces=list(bm.faces))
            bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-7)
            bmesh.ops.dissolve_degenerate(bm, edges=list(bm.edges), dist=1e-7)
        bm.to_mesh(obj.data);obj.data.update();bm.free()

kit={'schema':'sidereal.native-planet-kit.v1','layout':'volcanic-regional-geology','materials':[{'name':name,'linearColor':list(color),'roughness':roughness,'metallic':.18 if name in ('basalt-dark','basalt-cliff','basalt-top') else 0,**({'emissiveColor':[2.2,.264,.0088]} if name=='molten-core' else {'emissiveColor':[4,2.6,.4]} if name=='hot-vent' else {})} for name,color,roughness in palette],'variants':[]}
validation={'publication':'isolated draft; no owner final sign-off','coordinates':'Blender Z up, formation roots buried below Z0; ground sphere radius1','partsManifold':True,'variants':[]}
for name,parts in forms:
    positions=[]; indices=[]; roles=[]
    for obj in parts:
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
camera=bpy.context.object;camera.name='CAM-kit-review';camera.rotation_euler=(Vector((0,.1,.15))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=12.5
scene.camera=camera
for name,location,energy,size in [('KEY',(-4,-4,8),1600,6),('FILL',(4,1,6),900,5)]:
    bpy.ops.object.light_add(type='AREA',location=location)
    light=bpy.context.object;light.name=name;light.data.energy=energy;light.data.shape='DISK';light.data.size=size;light.rotation_euler=(-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.wm.save_as_mainfile(filepath=str(out/'kit.blend'))
scene.render.filepath=str(out/'kit-preview.png');bpy.ops.render.render(write_still=True)
validation['sha256']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in out.iterdir() if p.is_file()}
(out/'validation.json').write_text(json.dumps(validation,indent=2))
print('DESERT_NATIVE_KIT_DONE',json.dumps(validation['variants']))
