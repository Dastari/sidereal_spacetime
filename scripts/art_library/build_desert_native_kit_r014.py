"""Author editable desert-world geology in Blender, retaining exact native surfaces.
Run: blender -b --python scripts/art_library/build_desert_native_kit.py -- NEW_OUTPUT_DIR
No runtime publication. Units are local kit units; formation roots lie below Z=0.
"""
import bpy, bmesh, json, math, sys, hashlib, shutil
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
pillar_outline = [(-.50,-.38),(-.12,-.38),(-.12,-.49),(.31,-.49),(.31,-.30),(.49,-.30),(.49,.19),(.30,.19),(.30,.41),(-.18,.41),(-.18,.30),(-.50,.30)]
forms = []
def pillar(name, x, y, width, depth, height, rotation=0, pale=False):
    rings = [(-.18,1.09),(height*.48,1.09),(height*.48,1.02),(height-.012,1.02),(height,.98)]
    verts=[]
    for z, scale in rings:
        for px,py in pillar_outline:
            px,py=px*width*scale,py*depth*scale
            verts.append((x+px*math.cos(rotation)-py*math.sin(rotation),y+px*math.sin(rotation)+py*math.cos(rotation),z))
    n=len(pillar_outline)
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
    obj['authoring']='native-desert-r014'
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
    rings=[(bottom,1),(top-.012,1),(top,.985)]
    n=len(footprint);cx=sum(x for x,y in footprint)/n;cy=sum(y for x,y in footprint)/n
    verts=[(cx+(x-cx)*factor,cy+(y-cy)*factor,z) for z,factor in rings for x,y in footprint]
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
    obj['role']='planet';obj['authoring']='native-desert-r014'
    return obj

# Broad irregular elevated regions, with canyon cuts entering from several
# edges. These are landmasses with interior area rather than thin cliff strips.
# CCW perimeter, materially different outlines per region.
regions=[
 [(-1.52,-.75),(-1.13,-.75),(-1.13,-1.11),(-.64,-1.11),(-.64,-.68),(-.43,-.68),(-.43,-.23),(-.11,-.23),(-.11,-.78),(.31,-.78),(.31,-1.01),(.76,-1.01),(.76,-.76),(1.31,-.76),(1.31,-.36),(.90,-.36),(.90,-.10),(1.49,-.10),(1.49,.46),(1.10,.46),(1.10,.88),(.60,.88),(.60,1.22),(.13,1.22),(.13,.87),(-.23,.87),(-.23,.46),(-.52,.46),(-.52,.97),(-1.08,.97),(-1.08,.62),(-1.46,.62),(-1.46,.13),(-1.14,.13),(-1.14,-.19),(-1.52,-.19)],
 [(-1.47,-.59),(-.99,-.59),(-.99,-.95),(-.39,-.95),(-.39,-.53),(-.06,-.53),(-.06,-.98),(.49,-.98),(.49,-.64),(1.17,-.64),(1.17,-.24),(.71,-.24),(.71,.17),(1.41,.17),(1.41,.68),(.94,.68),(.94,1.03),(.40,1.03),(.40,.74),(.02,.74),(.02,.29),(-.29,.29),(-.29,1.09),(-.84,1.09),(-.84,.70),(-1.32,.70),(-1.32,.28),(-.96,.28),(-.96,-.03),(-1.47,-.03)],
 [(-1.42,-.74),(-.90,-.74),(-.90,-1.02),(-.35,-1.02),(-.35,-.79),(.10,-.79),(.10,-.35),(.43,-.35),(.43,-.97),(1.08,-.97),(1.08,-.44),(1.39,-.44),(1.39,.04),(1.02,.04),(1.02,.49),(.69,.49),(.69,.95),(.14,.95),(.14,.53),(-.16,.53),(-.16,.93),(-.71,.93),(-.71,.63),(-1.24,.63),(-1.24,.19),(-.88,.19),(-.88,-.12),(-1.42,-.12)]
]
# Explicit designer plan: unequal contiguous regional terrace polygons.
# Coordinates form staggered joins, five height tiers and deliberate low erosion
# pockets. This is authored Blender geology, not a runtime voxel generator.
# x-left, x-right, y-front, y-back, cap-height, cap-material.
terraces=[
 (-1.48,-.94,-.98,-.38,.24,5),(-.94,-.28,-1.05,-.41,.37,0),(-.28,.16,-.94,-.43,.19,4),
 (.16,.78,-1.02,-.31,.29,0),(.78,1.39,-.85,-.35,.16,5),
 (-1.39,-.80,-.38,.13,.34,0),(-.80,-.32,-.41,.22,.45,5),(-.32,.36,-.43,.06,.08,1),
 (.36,.91,-.31,.24,.21,5),(.91,1.48,-.35,.17,.33,0),
 (-1.46,-.98,.13,.57,.18,4),(-.98,-.48,.22,.65,.33,0),(-.48,.05,.06,.47,.12,5),
 (.05,.59,.06,.55,.09,0),(.59,1.13,.24,.68,.39,5),(1.13,1.42,.17,.72,.25,0),
 (-1.21,-.61,.65,1.03,.27,0),(-.61,-.10,.47,1.14,.19,5),(-.10,.54,.55,1.02,.32,0),
 (.54,1.09,.68,1.10,.46,4),(-1.55,-1.24,-.24,.30,.11,1),(1.37,1.64,-.11,.35,.12,4),
]
# Selective authored subdivision plan: retain five quiet broad sand caps,
# refine most cliff-bearing regions into unequal nested medium/small ledges.
# Ratios and heights differ by group; no global repeating cube grid.
expanded=[]
for i,(left,right,front,back,top,role) in enumerate(terraces):
 if i in (2,7,12,13,17):
    expanded.append((left,right,front,back,top,role));continue
 w=right-left;d=back-front
 sx=left+w*[.29,.62,.43,.71][i%4];sy=front+d*[.37,.69,.48][i%3]
 if i%3==0:
    cells=[(left,sx,front,back,top-.035,0),(sx,right,front,sy,top+.085,4),(sx,right,sy,back,top+.025,5)]
 elif i%3==1:
    cells=[(left,right,front,sy,top-.05,5),(left,sx,sy,back,top+.045,0),(sx,right,sy,back,top+.13,4)]
 else:
    cells=[(left,sx,front,sy,top-.025,1),(sx,right,front,sy,top+.09,0),(left,sx,sy,back,top+.055,5),(sx,right,sy,back,top-.06,0)]
 expanded.extend(cells)
terraces=expanded
for variant in range(3):
 name=['regional-cliff-head','regional-cliff-continuation','regional-cliff-end'][variant]
 parts=[]
 for i,(left,right,front,back,top,role) in enumerate(terraces):
    # A short unequal erosion bite alters a different edge on each terrace.
    # Keep most joins overlapping: exposed gaps are intentional low pockets.
    w=right-left;d=back-front;notch=min(w,d)*[.32,.42,.27][i%3]
    outline=[(left-.012,front-.012),(right-.012,front-.012),(right+.012,back-notch),
       (right-notch,back-notch),(right-notch,back+.012),(left-.012,back+.012)]
    # Only selected broad cliff caps gain asymmetrical erosional bites.
    # Chamfered mouths and offset buttresses break the repeated square-notch
    # silhouette without peppering every existing quiet horizontal surface.
    if i in (3,9,18,29,42,51) and min(w,d)>.12:
       outline=[(left-.012,front+.04*d),(left+.12*w,front-.012),
          (left+.46*w,front-.012),(left+.51*w,front+.19*d),
          (left+.65*w,front+.23*d),(left+.72*w,front+.02*d),
          (right-.02*w,front+.02*d),(right+.012,front+.17*d),
          (right+.012,back-.29*d),(right-.17*w,back-.24*d),
          (right-.22*w,back+.012),(left+.18*w,back+.012),(left-.012,back-.13*d)]
    if i%3==1:
       outline=[(left+right-x,front+back-y) for x,y in outline]
    if variant==1:
       outline=[(y*1.08,-x*.92) for x,y in outline]
       top=top*[.83,1.12,.94,1.04][i%4]
    elif variant==2:
       outline=[(-x,y) for x,y in reversed(outline)]
       top=top*[1.04,.77,1.10,.91][i%4]
    parts.append(cliff_solid(name+'-authored-terrace-'+str(i),outline,top,cap=role))
 # Short offset erosion shelves at selected taller cliff feet supply a middle
 # scale; they never form a complete perimeter or repeated concentric stack.
 for i,(x,y,w,d,top) in enumerate([(-.79,-.42,.51,.16,.25),(.75,.17,.20,.52,.19),(-.94,.56,.47,.14,.15),(.44,.71,.17,.48,.25)]):
    if variant==1:x,y=y,-x
    if variant==2:x=-x
    parts.append(pillar(name+'-connected-foot-ledge-'+str(i),x,y,w,d,top,0,pale=True))
 # Only one region has a monumental head. Secondary region keeps a short
 # subordinate bundle; third region is connected mid/low terrain only.
 specs=[(-.24,.13,.48,.47,.68),(.10,.14,.53,.48,.78),(.37,.07,.40,.41,.64),
      (-.26,-.19,.45,.42,.57),(.06,-.19,.49,.45,.70),(.35,-.24,.37,.39,.58)]
 if variant<2:
    cx,cy=(-.67,-.05) if variant==0 else (.0,.65)
    parts.append(pillar(name+'-compact-shared-massif-foot',cx,cy,1.16,1.00,.48 if variant==0 else .32,0))
 for i,(x,y,w,d,h) in enumerate(specs[:6 if variant==0 else 4 if variant==1 else 0]):
    cx,cy=(-.67,-.05) if variant==0 else (.0,.65)
    parts.append(pillar(name+'-restricted-head-'+str(i),cx+x,cy+y,w,d,h if variant==0 else h*.57,0))
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

# UV-authored PBR finish, loaded from supplied reference-led albedo images.
# Geometry remains Blender-authored; textures contain no baked scene shadows.
args=sys.argv[sys.argv.index('--')+1:]
if len(args)<3: raise RuntimeError('Provide output directory, cap albedo PNG and wall albedo PNG')
for original,filename in [(Path(args[1]),'desert-cap-albedo.png'),(Path(args[2]),'desert-wall-albedo.png')]:
    if original.resolve()!=(out/filename).resolve():shutil.copy2(original,out/filename)
cap_image=bpy.data.images.load(str(out/'desert-cap-albedo.png'),check_existing=False);cap_image.pack()
wall_image=bpy.data.images.load(str(out/'desert-wall-albedo.png'),check_existing=False);wall_image.pack()
# White factors avoid double-multiplying authored colored textures. Only deep
# cavity material retains a deliberate dark burgundy multiplier.
factors=[(1,1,1),(1,1,1),(1,1,1),palette[3][1],(1,1,1),(1,1,1)]
for i,m in enumerate(materials):
    if i==3:continue # Original untextured deep burgundy remains authored palette.
    shader=m.node_tree.nodes.get('Principled BSDF');tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=cap_image if i in (0,4,5) else wall_image
    multiply=m.node_tree.nodes.new('ShaderNodeMixRGB');multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1;multiply.inputs[2].default_value=(*factors[i],1)
    m.node_tree.links.new(tex.outputs['Color'],multiply.inputs[1]);m.node_tree.links.new(multiply.outputs['Color'],shader.inputs['Base Color'])
for name,parts in forms:
    for obj in parts:
        mesh=obj.data;mesh.uv_layers.new(name='Authored-Cap-Wall-UV')
        for poly in mesh.polygons:
            top=abs(poly.normal.z)>.6
            for loop in poly.loop_indices:
                p=obj.matrix_world@mesh.vertices[mesh.loops[loop].vertex_index].co
                u=(p.x+1.75)/3.5 if top else (p.x+p.y+3)/6
                v=(p.y+1.35)/2.7 if top else (p.z+.24)/1.25
                mesh.uv_layers.active.data[loop].uv=(u,v)
kit={'schema':'sidereal.native-planet-kit.v1','layout':'desert-geology','uvConvention':'glTF UV (Blender V flipped); invertY=false','materials':[{'name':name,'linearColor':list(factors[i]),'roughness':roughness,**({'baseColorTexture':'desert-cap-albedo.png' if i in (0,4,5) else 'desert-wall-albedo.png','textureColorSpace':'sRGB','invertY':False} if i!=3 else {})} for i,(name,color,roughness) in enumerate(palette)],'variants':[]}
validation={'publication':'isolated draft; no owner final sign-off','coordinates':'Blender Z up, formation roots buried below Z0; ground sphere radius1','partsManifold':True,'variants':[]}
for name,parts in forms:
    positions=[]; indices=[]; roles=[];uvs=[];normals=[]
    for obj in parts:
        if obj.data.validate(): raise RuntimeError('Invalid mesh '+obj.name)
        bm=bmesh.new();bm.from_mesh(obj.data)
        if any(not edge.is_manifold for edge in bm.edges): raise RuntimeError('Non-manifold '+obj.name)
        bm.free()
        obj.data.calc_loop_triangles()
        mesh=obj.data
        for tri in mesh.loop_triangles:
            for vertex,loop in zip(tri.vertices,tri.loops):
                positions.extend(obj.matrix_world@mesh.vertices[vertex].co)
                normals.extend((obj.matrix_world.to_3x3().inverted().transposed()@mesh.corner_normals[loop].vector).normalized())
                uv=mesh.uv_layers.active.data[loop].uv;uvs.extend((uv.x,1-uv.y));indices.append(len(indices))
            roles.append(next(i for i,m in enumerate(materials) if m==mesh.materials[tri.material_index]))
    kit['variants'].append({'name':name,'positions':positions,'indices':indices,'triangleMaterials':roles,'uvs':uvs,'normals':normals})
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
