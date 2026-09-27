"""Author editable toxic-world geology in Blender, retaining exact native surfaces.
Run: blender -b --python scripts/art_library/build_toxic_native_kit.py -- NEW_OUTPUT_DIR
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
    ('toxic-dark-plateau', (.045,.064,.033), .86),
    ('weathered-olive-rock', (.14,.18,.035), .85),
    ('chimney-wall', (.012,.026,.015), .80),
    ('deep-chemical-cleft', (.004,.011,.006), .87),
    ('chimney-cap', (.075,.095,.047), .79),
    ('chemical-crust', (.32,.48,.006), .55),
    ('chemical-liquid', (.11,.24,.008), .28),
    ('chemical-shallow', (.36,.62,.008), .26),
    ('chemical-active', (.78,.95,.006), .23),
]
materials = []
for name, color, roughness in palette:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color,1)
    shader.inputs['Roughness'].default_value = roughness
    if name in ('chemical-shallow','chemical-active'):
        shader.inputs['Emission Color'].default_value=(.12,.22,.001,1)
        shader.inputs['Emission Strength'].default_value=.45
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
    obj['authoring']='native-toxic-r002'
    return obj

# Strongly unequal heights/group sizes establish a focal macro hierarchy.
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
    obj['role']='planet';obj['authoring']='native-toxic-r002'
    return obj

# Broad irregular elevated regions, with canyon cuts entering from several
# edges. These are landmasses with interior area rather than thin cliff strips.
# CCW perimeter, materially different outlines per region.
regions=[
 [(-1.52,-.75),(-1.13,-.75),(-1.13,-1.11),(-.64,-1.11),(-.64,-.68),(-.43,-.68),(-.43,-.23),(-.11,-.23),(-.11,-.78),(.31,-.78),(.31,-1.01),(.76,-1.01),(.76,-.76),(1.31,-.76),(1.31,-.36),(.90,-.36),(.90,-.10),(1.49,-.10),(1.49,.46),(1.10,.46),(1.10,.88),(.60,.88),(.60,1.22),(.13,1.22),(.13,.87),(-.23,.87),(-.23,.46),(-.52,.46),(-.52,.97),(-1.08,.97),(-1.08,.62),(-1.46,.62),(-1.46,.13),(-1.14,.13),(-1.14,-.19),(-1.52,-.19)],
 [(-1.47,-.59),(-.99,-.59),(-.99,-.95),(-.39,-.95),(-.39,-.53),(-.06,-.53),(-.06,-.98),(.49,-.98),(.49,-.64),(1.17,-.64),(1.17,-.24),(.71,-.24),(.71,.17),(1.41,.17),(1.41,.68),(.94,.68),(.94,1.03),(.40,1.03),(.40,.74),(.02,.74),(.02,.29),(-.29,.29),(-.29,1.09),(-.84,1.09),(-.84,.70),(-1.32,.70),(-1.32,.28),(-.96,.28),(-.96,-.03),(-1.47,-.03)],
 [(-1.42,-.74),(-.90,-.74),(-.90,-1.02),(-.35,-1.02),(-.35,-.79),(.10,-.79),(.10,-.35),(.43,-.35),(.43,-.97),(1.08,-.97),(1.08,-.44),(1.39,-.44),(1.39,.04),(1.02,.04),(1.02,.49),(.69,.49),(.69,.95),(.14,.95),(.14,.53),(-.16,.53),(-.16,.93),(-.71,.93),(-.71,.63),(-1.24,.63),(-1.24,.19),(-.88,.19),(-.88,-.12),(-1.42,-.12)]
]
# Toxic-specific authoring: actual open basin interiors surrounded by broken
# annular crust sectors. Liquid is below the rim, never an elevated plateau cap.
for variant in range(3):
 name=['toxic-basin-group-a','toxic-basin-group-b','toxic-basin-group-c'][variant]
 parts=[]
 basins=[(-.47,.02,.72,.63),(.64,.23,.50,.43)] if variant!=1 else [(-.42,-.17,.61,.62),(.57,.31,.65,.46)]
 for basin,(cx,cy,rx,ry) in enumerate(basins):
    angles=[i*math.tau/10 for i in range(10)]
    inner=[(cx+math.cos(a)*rx*(1+.10*math.sin(i*2.1+variant)),cy+math.sin(a)*ry*(1+.08*math.cos(i*1.9))) for i,a in enumerate(angles)]
    outer=[(cx+(x-cx)*1.40,cy+(y-cy)*1.40) for x,y in inner]
    parts.append(cliff_solid(name+'-recessed-liquid-'+str(basin),inner,.025,bottom=-.23,cap=6))
    # A broad unequal shallow shelf and a smaller localized active patch create
    # chemical depth hierarchy without global fluorescence on the dark rock.
    shallow=[(cx+(x-cx)*.82,cy+(y-cy)*.82) for x,y in inner]
    parts.append(cliff_solid(name+'-shallow-shelf-'+str(basin),shallow,.031,bottom=-.21,cap=7))
    active=[(cx+(x-cx)*.39-.12,cy+(y-cy)*.46+.08) for x,y in inner]
    parts.append(cliff_solid(name+'-active-vent-pool-'+str(basin),active,.036,bottom=-.20,cap=8))
    for i in range(10):
      if i in ([0,5] if basin==0 else [4,7]):continue
      j=(i+1)%10
      quad=[outer[i],outer[j],inner[j],inner[i]]
      # Reverse if necessary: rim sectors follow the same outward face rule.
      area=sum(quad[k][0]*quad[(k+1)%4][1]-quad[(k+1)%4][0]*quad[k][1] for k in range(4))
      if area<0:quad.reverse()
      height=[.22,.38,.29,.17,.32][(i+variant+basin)%5]
      parts.append(cliff_solid(name+'-broken-basin-rim-'+str(basin)+'-'+str(i),quad,height,cap=0 if i%3 else 1))
      if i%3==1:
       ledge=[(cx+(x-cx)*.94,cy+(y-cy)*.94) for x,y in quad]
       parts.append(cliff_solid(name+'-inner-corrosion-step-'+str(basin)+'-'+str(i),ledge,.12,cap=5))
 # Two branching low fissure channels connect the basin gaps and leave the
 # patch boundary, so adjacent patches can become one chemical drainage region.
 channels=[ [(-.66,-.10),(.69,-.02),(.75,.13),(-.59,.11)],
    [(-.65,-.86),(-.38,-.82),(-.18,-.05),(-.35,.02)],
    [(.73,.20),(1.37,.52),(1.28,.73),(.63,.36)] ]
 for i,poly in enumerate(channels):
    area=sum(poly[k][0]*poly[(k+1)%len(poly)][1]-poly[(k+1)%len(poly)][0]*poly[k][1] for k in range(len(poly)))
    if area<0:poly.reverse()
    parts.append(cliff_solid(name+'-branching-chemical-fissure-'+str(i),poly,.019,bottom=-.24,cap=7 if i else 8))
 for group,(cx,cy) in enumerate([(-.91,.36),(.83,-.17)]):
    for i,(x,y,w,d,h) in enumerate([(-.11,.10,.19,.21,.74),(.09,.11,.17,.19,.59),(-.15,-.10,.16,.17,.47),(.05,-.10,.18,.18,.66),(.22,.01,.13,.16,.40)]):
      parts.append(pillar(name+'-rim-chimney-'+str(group)+'-'+str(i),cx+x,cy+y,w,d,h*[1,.82,.91][variant],0))
 forms.append((name,parts))

for name, subdivisions in [('ground-sphere',7),('ground-sphere-medium',6),('ground-sphere-low',5)]:
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=1)
    ground=bpy.context.object
    ground.name='GEO-'+name
    ground.data.materials.append(materials[6])
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

kit={'schema':'sidereal.native-planet-kit.v1','layout':'toxic-geology','materials':[{'name':name,'linearColor':list(color),'roughness':roughness,**({'emissiveColor':[.054,.099,.00045]} if name in ('chemical-shallow','chemical-active') else {})} for name,color,roughness in palette],'variants':[]}
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
