"""Author editable toxic-world geology in Blender, retaining exact native surfaces.
Run: blender -b --python scripts/art_library/build_toxic_native_kit.py -- NEW_OUTPUT_DIR
No runtime publication. Units are local kit units; formation roots lie below Z=0.
"""
import bpy, bmesh, json, math, sys, hashlib
import numpy as np
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
    ('toxic-dark-plateau', (.045,.064,.033), .64),
    ('weathered-olive-rock', (.14,.18,.035), .68),
    ('chimney-wall', (.012,.026,.015), .61),
    ('deep-chemical-cleft', (.004,.011,.006), .87),
    ('chimney-cap', (.075,.095,.047), .57),
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
    obj['authoring']='native-toxic-r003'
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
    obj['role']='planet';obj['authoring']='native-toxic-r003'
    return obj

# Broad irregular elevated regions, with canyon cuts entering from several
# edges. These are landmasses with interior area rather than thin cliff strips.
# CCW perimeter, materially different outlines per region.
regions=[
 [(-1.52,-.75),(-1.13,-.75),(-1.13,-1.11),(-.64,-1.11),(-.64,-.68),(-.43,-.68),(-.43,-.23),(-.11,-.23),(-.11,-.78),(.31,-.78),(.31,-1.01),(.76,-1.01),(.76,-.76),(1.31,-.76),(1.31,-.36),(.90,-.36),(.90,-.10),(1.49,-.10),(1.49,.46),(1.10,.46),(1.10,.88),(.60,.88),(.60,1.22),(.13,1.22),(.13,.87),(-.23,.87),(-.23,.46),(-.52,.46),(-.52,.97),(-1.08,.97),(-1.08,.62),(-1.46,.62),(-1.46,.13),(-1.14,.13),(-1.14,-.19),(-1.52,-.19)],
 [(-1.47,-.59),(-.99,-.59),(-.99,-.95),(-.39,-.95),(-.39,-.53),(-.06,-.53),(-.06,-.98),(.49,-.98),(.49,-.64),(1.17,-.64),(1.17,-.24),(.71,-.24),(.71,.17),(1.41,.17),(1.41,.68),(.94,.68),(.94,1.03),(.40,1.03),(.40,.74),(.02,.74),(.02,.29),(-.29,.29),(-.29,1.09),(-.84,1.09),(-.84,.70),(-1.32,.70),(-1.32,.28),(-.96,.28),(-.96,-.03),(-1.47,-.03)],
 [(-1.42,-.74),(-.90,-.74),(-.90,-1.02),(-.35,-1.02),(-.35,-.79),(.10,-.79),(.10,-.35),(.43,-.35),(.43,-.97),(1.08,-.97),(1.08,-.44),(1.39,-.44),(1.39,.04),(1.02,.04),(1.02,.49),(.69,.49),(.69,.95),(.14,.95),(.14,.53),(-.16,.53),(-.16,.93),(-.71,.93),(-.71,.63),(-1.24,.63),(-1.24,.19),(-.88,.19),(-.88,-.12),(-1.42,-.12)]
]
# One broad interlocking native crust per region, with actual boolean-cut
# recessed basins and connected channels. No circular independent rim walls.
for variant in range(3):
 name=['toxic-basin-group-a','toxic-basin-group-b','toxic-basin-group-c'][variant]
 footprint=regions[variant] if variant<2 else [(x*.94+y*.08,y*.96-x*.08)for x,y in regions[0]]
 crust=cliff_solid(name+'-continuous-corroded-crust',footprint,.22+variant*.035,bottom=-.30,cap=0)
 parts=[crust]
 basins=[ [(-1.06,-.42),(-.60,-.49),(-.23,-.30),(-.29,.02),(-.57,.24),(-.99,.12)],
          [(.02,.18),(.29,-.02),(.71,.08),(1.01,.34),(.83,.61),(.29,.67)] ]
 channels=[ [(-.60,-.10),(.32,.13),(.23,.32),(-.66,.09)],
            [(-.70,-1.02),(-.44,-.94),(-.36,-.21),(-.58,-.16)],
            [(.63,.34),(1.49,.47),(1.42,.68),(.54,.55)] ]
 for index,footprint in enumerate(basins+channels):
  area=sum(footprint[i][0]*footprint[(i+1)%len(footprint)][1]-footprint[(i+1)%len(footprint)][0]*footprint[i][1]for i in range(len(footprint)))
  if area<0:footprint.reverse()
  cutter=cliff_solid(name+'-basin-cut-'+str(index),footprint,1.2,bottom=-.16,cap=3)
  bpy.context.view_layer.objects.active=crust;modifier=crust.modifiers.new('Authored basin and drainage cut','BOOLEAN');modifier.operation='DIFFERENCE';modifier.solver='EXACT';modifier.object=cutter
  bpy.ops.object.modifier_apply(modifier=modifier.name);bpy.data.objects.remove(cutter,do_unlink=True)
  parts.append(cliff_solid(name+'-connected-chemical-liquid-'+str(index),footprint,-.095,bottom=-.15,cap=6 if index<2 else 7))
  if index<2:
   cx=sum(p[0]for p in footprint)/len(footprint);cy=sum(p[1]for p in footprint)/len(footprint)
   shallow=[(cx+(x-cx)*.70,cy+(y-cy)*.68)for x,y in footprint]
   parts.append(cliff_solid(name+'-olive-shallow-'+str(index),shallow,-.084,bottom=-.14,cap=7))
   active=[(cx+(x-cx)*.24+.08,cy+(y-cy)*.23-.025)for x,y in footprint]
   parts.append(cliff_solid(name+'-small-active-chemical-vent-'+str(index),active,-.076,bottom=-.13,cap=8))
 # Substantial irregular chimney masses emerge from the common crust rather
 # than occupying circular ring sectors. Their roots interlock below the cap.
 for group,(cx,cy)in enumerate([(-1.04,.52),(.60,-.63),(.13,.87)]):
  for i,(x,y,w,d,h)in enumerate([(-.11,.08,.30,.28,.81),(.12,.11,.23,.26,.62),(-.04,-.14,.25,.24,.51)]):
   parts.append(pillar(name+'-corroded-chimney-'+str(group)+'-'+str(i),cx+x,cy+y,w,d,h*[1,.86,.93][variant],.08*(group-1)))
 forms.append((name,parts))

for name, subdivisions in [('ground-sphere',6),('ground-sphere-medium',5),('ground-sphere-low',4)]:
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

kit={'schema':'sidereal.native-planet-kit.v1','layout':'connected-toxic-crust','uvConvention':'glTF corner UV; invertY=false','materials':[{'name':name,'linearColor':list(color),'roughness':roughness,**({'emissiveColor':[.054,.099,.00045]} if name in ('chemical-shallow','chemical-active') else {})} for name,color,roughness in palette],'variants':[]}
# Authored PBR corrosion finish. Large dark crust retains low/mid roughness;
# the fine surface response is material data, never a replacement shader.
size=256;rng=np.random.default_rng(3003);yy,xx=np.mgrid[0:size,0:size];u=(xx+.5)/size;v=(yy+.5)/size
noise=rng.uniform(-1,1,(size,size));grid=rng.uniform(-1,1,(14,17));gx=u*17;gy=v*13;ix=np.floor(gx).astype(int);iy=np.floor(gy).astype(int);fx=gx-ix;fy=gy-iy;fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy)
low=grid[iy,ix]*(1-fx)+grid[iy,(ix+1)%17]*fx;high=grid[iy+1,ix]*(1-fx)+grid[iy+1,(ix+1)%17]*fx;streak=(low*(1-fy)+high*fy)*.75+noise*.25
for role in [0,1,2,3,4,5]:
 definition=kit['materials'][role];mat=materials[role];nodes=mat.node_tree.nodes;links=mat.node_tree.links;p=nodes.get('Principled BSDF');color=np.array(definition['linearColor'])
 for kind in ['albedo','normal','orm']:
  image=bpy.data.images.new(f'Toxic3-corrosion-{role}-{kind}',width=size,height=size,alpha=True);image.colorspace_settings.name='sRGB'if kind=='albedo'else'Non-Color';pixels=np.ones((size,size,4),dtype=np.float32)
  if kind=='albedo':
   linear=np.clip(color[None,None,:]*(1+streak[:,:,None]*.34),0,1);pixels[:,:,:3]=np.where(linear<=.0031308,linear*12.92,1.055*linear**(1/2.4)-.055)
  elif kind=='orm':pixels[:,:,0]=1;pixels[:,:,1]=np.clip(palette[role][2]+streak*.13,.15,.98);pixels[:,:,2]=0
  else:
   nx=(np.roll(streak,-1,axis=1)-np.roll(streak,1,axis=1))*.085;ny=(np.roll(streak,-1,axis=0)-np.roll(streak,1,axis=0))*.065;pixels[:,:,0]=nx*.5+.5;pixels[:,:,1]=ny*.5+.5;pixels[:,:,2]=np.sqrt(np.maximum(.001,1-nx*nx-ny*ny))*.5+.5
  image.pixels.foreach_set(pixels.reshape(-1));filename=f'corrosion-{role}-{kind}.png';image.filepath_raw=str(out/filename);image.file_format='PNG';image.save();image.pack();tex=nodes.new('ShaderNodeTexImage');tex.image=image
  if kind=='albedo':links.new(tex.outputs['Color'],p.inputs['Base Color']);definition.update(linearColor=[1,1,1],baseColorTexture=filename,textureColorSpace='sRGB',invertY=False)
  elif kind=='normal':
   normal=nodes.new('ShaderNodeNormalMap');links.new(tex.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],p.inputs['Normal']);definition.update(normalTexture=filename,normalScale=1)
  else:
   separate=nodes.new('ShaderNodeSeparateColor');links.new(tex.outputs['Color'],separate.inputs['Color']);links.new(separate.outputs['Green'],p.inputs['Roughness']);links.new(separate.outputs['Blue'],p.inputs['Metallic']);definition.update(metallicRoughnessTexture=filename,metallic=1,roughness=1)
validation={'publication':'isolated draft; no owner final sign-off','coordinates':'Blender Z up, formation roots buried below Z0; ground sphere radius1','partsManifold':True,'variants':[]}
for name,parts in forms:
    positions=[]; normals=[]; uvs=[]; indices=[]; roles=[]
    for obj in parts:
        if obj.data.validate(): raise RuntimeError('Invalid mesh '+obj.name)
        bm=bmesh.new();bm.from_mesh(obj.data)
        if any(not edge.is_manifold for edge in bm.edges): raise RuntimeError('Non-manifold '+obj.name)
        bm.free()
        mesh=obj.data
        if not mesh.uv_layers.active:mesh.uv_layers.new(name='Native-material-UV')
        uv=mesh.uv_layers.active
        for poly in mesh.polygons:
            axis=max(range(3),key=lambda i:abs(poly.normal[i]));axes=[i for i in range(3)if i!=axis];values=[]
            for loop in poly.loop_indices:
                v=mesh.vertices[mesh.loops[loop].vertex_index].co
                values.append((math.atan2(v.y,v.x)/math.tau+.5,math.asin(max(-1,min(1,v.z)))/math.pi+.5)if name.startswith('ground-sphere')else(v[axes[0]]*.25+.5,v[axes[1]]*.25+.5))
            seam=name.startswith('ground-sphere')and max(v[0]for v in values)-min(v[0]for v in values)>.5
            for loop,value in zip(poly.loop_indices,values):uv.data[loop].uv=(value[0]+(1 if seam and value[0]<.5 else 0),value[1])
        mesh.calc_loop_triangles()
        for tri in mesh.loop_triangles:
            for vertex,loop in zip(tri.vertices,tri.loops):
                positions.extend(obj.matrix_world@mesh.vertices[vertex].co);normals.extend((obj.matrix_world.to_3x3().inverted().transposed()@mesh.corner_normals[loop].vector).normalized());uvs.extend((uv.data[loop].uv.x,1-uv.data[loop].uv.y));indices.append(len(indices))
            roles.append(next(i for i,m in enumerate(materials)if m==mesh.materials[tri.material_index]))
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
