"""Author editable desert-world geology in Blender, retaining exact native surfaces.
Run: blender -b --python scripts/art_library/build_desert_native_kit.py -- NEW_OUTPUT_DIR
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
palette = [
    ('sand-cream', (.79,.49,.25), .88),
    ('sand-peach', (.62,.30,.14), .90),
    ('mesa-rust', (.47,.145,.065), .84),
    ('canyon-burgundy', (.18,.039,.040), .88),
    ('mesa-cap', (.83,.43,.20), .83),
    ('sandstone-light', (.93,.61,.30), .85),
]
materials = []
for name, color, roughness in palette:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color,1)
    shader.inputs['Roughness'].default_value = roughness
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
    obj['authoring']='native-desert-r007'
    return obj

# Strongly unequal heights/group sizes establish a focal macro hierarchy.
layouts=[
 ('mesa-group-a',[(-.30,.02,.92,.81,.49,0),(.26,.14,.57,.65,.89,0),(.19,-.30,.36,.38,.64,0),(-.60,.19,.30,.34,.28,0)]),
 ('mesa-group-b',[(-.33,.12,.67,.92,.74,0),(.25,.15,.54,.56,.48,0),(.39,-.28,.37,.51,.93,0),(-.11,-.36,.25,.29,.30,0)]),
 ('mesa-group-c',[(-.44,.04,.53,.80,.48,0),(.03,.25,.46,.50,.80,0),(.37,.01,.41,.54,.65,0),(.18,-.36,.60,.31,.29,0)]),
 ('tower-group',[(-.18,.02,.34,.40,1.12,0),(.18,.10,.30,.36,.83,0),(.05,-.27,.22,.27,.60,0),(-.40,.10,.24,.28,.41,0)]),
 ('broken-cliff-shelves',[(-.54,.12,.49,.78,.36,0),(-.16,.12,.48,.72,.29,0),(.23,.15,.36,.66,.44,0),(.55,.21,.29,.44,.25,0),(.03,-.27,.43,.24,.10,0)]),
 ('tiny-rock-group',[(-.25,.03,.25,.26,.19,0),(.05,-.13,.19,.23,.27,0),(.25,.14,.22,.17,.11,0)]),
 ('sand-plateau',[(-.12,.0,1.23,1.07,.06,0),(.47,.13,.53,.72,.02,0)]),
]
# Rooted mesa mass hierarchy: sand terrace, rust shoulder, capped tower.
# Separate closed solids overlap deeply; source retains each editable formation.
layouts.extend([
 ('broad-shelf-a',[(-.35,.0,1.40,.99,.035,0),(.44,.20,.98,.77,.09,0),(.66,-.24,.58,.58,.035,0)]),
 ('broad-shelf-b',[(-.36,.05,1.03,1.20,.06,0),(.26,-.21,1.04,.76,.02,0),(.53,.28,.64,.71,.13,0)])
])
for name,layout in layouts:
    is_low=name in ('sand-plateau','broad-shelf-a','broad-shelf-b')
    if name.startswith('mesa-group'):
        # Large sand cap footprints connect the columns and bury their lowest walls.
        parts=[pillar(name+'-sand-apron',-.10,.0,2.0,1.70,.035,pale=True),
               pillar(name+'-mid-terrace',-.09,.02,1.62,1.33,.13,pale=True),
               pillar(name+'-rust-shoulder',-.03,.05,1.20,1.06,.21,pale=False)]
        parts += [pillar(name+'-'+str(i),x,y,w,d,h*.64,r,pale=False) for i,(x,y,w,d,h,r) in enumerate(layout)]
    elif name=='tower-group':
        parts=[pillar(name+'-wide-foot',-.10,.01,1.43,1.18,.055,pale=True),
               pillar(name+'-shoulder',-.11,.01,1.01,.87,.16,pale=False)]
        parts += [pillar(name+'-'+str(i),x,y,w,d,h*.69,r,pale=False) for i,(x,y,w,d,h,r) in enumerate(layout)]
    elif name=='broken-cliff-shelves':
        parts=[pillar(name+'-sand-foot',0,.02,1.88,1.36,.025,pale=True)]
        parts += [pillar(name+'-'+str(i),x,y,w,d,h*.64,r,pale=True) for i,(x,y,w,d,h,r) in enumerate(layout)]
    else:
        parts=[pillar(name+'-'+str(i),*values,pale=is_low) for i,values in enumerate(layout)]
    forms.append((name,parts))
# Regional terrain pieces: long eroded shelf fronts, never concentric plinths.
def cliff_solid(name, footprint, top, bottom=-.24, cap=0):
    # Outline is counter-clockwise; preserve planar cap and exposed strata.
    rings=[(bottom,1),(top-.022,1),(top,1)]
    n=len(footprint);verts=[(x,y,z) for z,_ in rings for x,y in footprint]
    faces=[tuple(range(n-1,-1,-1))];roles=[3]
    for layer in range(2):
        for j in range(n):
            faces.append((layer*n+j,layer*n+(j+1)%n,(layer+1)*n+(j+1)%n,(layer+1)*n+j))
            roles.append(4 if layer==1 else (3 if j%7 in (3,4) else 2))
    faces.append(tuple(range(2*n,3*n)));roles.append(cap)
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    obj=bpy.data.objects.new('GEO-'+name,mesh);scene.collection.objects.link(obj)
    for mat in materials:mesh.materials.append(mat)
    for poly,role in zip(mesh.polygons,roles):poly.material_index=role
    obj['role']='planet';obj['authoring']='native-desert-r007'
    return obj

# Broad irregular elevated regions, with canyon cuts entering from several
# edges. These are landmasses with interior area rather than thin cliff strips.
# CCW perimeter, materially different outlines per region.
regions=[
 [(-1.52,-.75),(-1.13,-.75),(-1.13,-1.11),(-.64,-1.11),(-.64,-.68),(-.43,-.68),(-.43,-.23),(-.11,-.23),(-.11,-.78),(.31,-.78),(.31,-1.01),(.76,-1.01),(.76,-.76),(1.31,-.76),(1.31,-.36),(.90,-.36),(.90,-.10),(1.49,-.10),(1.49,.46),(1.10,.46),(1.10,.88),(.60,.88),(.60,1.22),(.13,1.22),(.13,.87),(-.23,.87),(-.23,.46),(-.52,.46),(-.52,.97),(-1.08,.97),(-1.08,.62),(-1.46,.62),(-1.46,.13),(-1.14,.13),(-1.14,-.19),(-1.52,-.19)],
 [(-1.47,-.59),(-.99,-.59),(-.99,-.95),(-.39,-.95),(-.39,-.53),(-.06,-.53),(-.06,-.98),(.49,-.98),(.49,-.64),(1.17,-.64),(1.17,-.24),(.71,-.24),(.71,.17),(1.41,.17),(1.41,.68),(.94,.68),(.94,1.03),(.40,1.03),(.40,.74),(.02,.74),(.02,.29),(-.29,.29),(-.29,1.09),(-.84,1.09),(-.84,.70),(-1.32,.70),(-1.32,.28),(-.96,.28),(-.96,-.03),(-1.47,-.03)],
 [(-1.42,-.74),(-.90,-.74),(-.90,-1.02),(-.35,-1.02),(-.35,-.79),(.10,-.79),(.10,-.35),(.43,-.35),(.43,-.97),(1.08,-.97),(1.08,-.44),(1.39,-.44),(1.39,.04),(1.02,.04),(1.02,.49),(.69,.49),(.69,.95),(.14,.95),(.14,.53),(-.16,.53),(-.16,.93),(-.71,.93),(-.71,.63),(-1.24,.63),(-1.24,.19),(-.88,.19),(-.88,-.12),(-1.42,-.12)]
]
for variant,perimeter in enumerate(regions):
    name=['regional-cliff-head','regional-cliff-continuation','regional-cliff-end'][variant]
    height=[.42,.33,.37][variant]
    parts=[cliff_solid(name+'-broad-backing',perimeter,height)]
    # Add only broken exposed front/left aprons; no nested enclosing plinth.
    for section,(start,end,drop) in enumerate([(0,9,.18),(10,17,.14),(len(perimeter)-8,len(perimeter),.20)]):
        path=perimeter[start:end]
        # Offset radially away from backing outline. Unequal shelf width avoids
        # a repeated machine-like contour. Deep overlap seals the internal join.
        edge=[(x*(1.12+.025*math.sin(i*1.7)),y*(1.12+.025*math.cos(i))) for i,(x,y) in enumerate(path)]
        foot=edge+list(reversed([(x*.98,y*.98) for x,y in path]))
        parts.append(cliff_solid(name+'-branch-shelf-'+str(section),foot,height-drop,cap=5))
    # Unequal adjoining sandstone heads rise from the broad cap. No dedicated
    # rectangular platform or full peripheral ring beneath the head cluster.
    clusters=[
      [(-.81,.25,.43,.42,.92,0),(-.50,.20,.37,.36,.71,0),(-.75,-.09,.29,.31,.64,0),(.64,.43,.34,.43,.57,0)],
      [(.89,.41,.37,.39,.76,0),(.57,.48,.30,.32,.58,0),(.75,.16,.26,.28,.46,0),(-.62,-.47,.43,.34,.48,0)],
      [(-.82,.23,.38,.42,.81,0),(-.51,.30,.31,.33,.63,0),(-.65,.03,.29,.25,.53,0),(.80,-.61,.31,.32,.51,0)]
    ][variant]
    for i,values in enumerate(clusters):parts.append(pillar(name+'-unequal-head-'+str(i),*values))
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

kit={'schema':'sidereal.native-planet-kit.v1','layout':'desert-geology','materials':[{'name':name,'linearColor':list(color),'roughness':roughness} for name,color,roughness in palette],'variants':[]}
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
camera=bpy.context.object;camera.name='CAM-kit-review';camera.rotation_euler=(Vector((0,2.0,.15))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=17
scene.camera=camera
for name,location,energy,size in [('KEY',(-4,-4,8),1600,6),('FILL',(4,1,6),900,5)]:
    bpy.ops.object.light_add(type='AREA',location=location)
    light=bpy.context.object;light.name=name;light.data.energy=energy;light.data.shape='DISK';light.data.size=size;light.rotation_euler=(-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.wm.save_as_mainfile(filepath=str(out/'kit.blend'))
scene.render.filepath=str(out/'kit-preview.png');bpy.ops.render.render(write_still=True)
validation['sha256']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in out.iterdir() if p.is_file()}
(out/'validation.json').write_text(json.dumps(validation,indent=2))
print('DESERT_NATIVE_KIT_DONE',json.dumps(validation['variants']))
