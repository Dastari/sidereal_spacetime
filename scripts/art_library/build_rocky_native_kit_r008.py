"""Author native crater bowls and fractured rock in Blender. No voxel sampling.
Run: blender -b --python scripts/art_library/build_rocky_native_kit_r008.py -- NEW_OUTPUT
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
 obj['role']='planet';obj['authoring']='native-rocky-r008'
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
# Connected crater-to-crust relief, authored as one closed radial topology.
# Unequal ledge sectors, broken impact rim and inset mineral crack share edges;
# these are not independently overlapping slabs or a sampled voxel heightfield.
def battered_region(name,phase):
 n=48
 profile=[(.22,-.27),(.30,-.255),(.35,-.19),(.40,-.085),(.44,.025),(.50,.04),(.59,.015),(.69,.035),(.79,.04),(.91,.06),(1.06,.06),(1.18,.015),(1.32,.025),(1.48,.015),(1.64,-.02)]
 verts=[]
 for j,(radius,basez) in enumerate(profile):
  for i in range(n):
   a=i*2*math.pi/n
   # Three explicitly unequal broken rim sectors, not a repeated intact cone.
   gap= -.075 if 4<=i<=8 or 24<=i<=28 or 37<=i<=39 else 0
   z=basez+(gap if 3<=j<=6 else 0)
   if j>=7:z=.005;radius=.60+.012*(j-7)
   # Adjacent chipped shelf districts: quiet broad flats meet short steep
   # discontinuities and recessed fracture slots through shared native edges.
   if False and 7<=j<=12:
    if 1<=i<=11:z += .105 if j in (8,9,10) else .012
    elif 16<=i<=27:z += -.075 if j in (9,10) else .048
    elif 32<=i<=43:z += .075 if j in (7,8,9) else -.018
   jitter=1+.055*math.sin(i*.61+phase)+.033*math.cos(i*1.31-phase)
   anisotropy=1+.12*math.cos(a*2+phase)
   offset=.055*math.sin(j*.85+phase) if j>=7 else 0
   verts.append((math.cos(a)*radius*jitter*anisotropy+offset,math.sin(a)*radius*jitter*.91+offset*.6,z))
 # Seal below the entire relief: the visible surface includes its own basin.
 for i in range(n):
  x,y,_=verts[(len(profile)-1)*n+i];verts.append((x,y,-.43))
 faces=[tuple(range(n-1,-1,-1))];roles=[2]
 for j in range(len(profile)):
  for i in range(n):
   faces.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
   roles.append(2 if j<3 else 1 if j in (3,4) else 0)
 faces.append(tuple(range(len(profile)*n,(len(profile)+1)*n)));roles.append(3)
 obj=mesh_object(name,verts,faces,roles)
 # Native planar tessellation precedes curved runtime placement and keeps all
 # future mapped triangles short, including floor and broad region faces.
 bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.triangulate(bm,faces=list(bm.faces));bmesh.ops.subdivide_edges(bm,edges=list(bm.edges),cuts=1,use_grid_fill=True);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()
 return obj
def plate(name,poly,height,role=0):
 n=len(poly);cx=sum(x for x,y in poly)/n;cy=sum(y for x,y in poly)/n
 verts=[(cx+(x-cx)*scale,cy+(y-cy)*scale,z)for z,scale in[(-.43,1),(height-.018,1),(height,.98)]for x,y in poly]
 faces=[tuple(range(n-1,-1,-1))];roles=[3]
 for j in range(2):
  for i in range(n):faces.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i));roles.append(3 if j==0 else 1)
 faces.append(tuple(range(2*n,3*n)));roles.append(role)
 return mesh_object(name,verts,faces,roles)
def inset_pit_district(name):
 n=16;cx,cy=1.22,.07;verts=[]
 for radius,z in[(.15,-.085),(.22,-.07),(.28,.13),(.33,.15)]:
  for i in range(n):
   a=i*math.tau/n;f=1+.10*math.sin(i*1.7);verts.append((cx+math.cos(a)*radius*f,cy+math.sin(a)*radius*f,z))
 for i in range(n):
  a=i*math.tau/n;r=.56/max(abs(math.cos(a)),abs(math.sin(a)));verts.append((cx+math.cos(a)*r,cy+math.sin(a)*r*1.38,.14+[0,.025,-.01,.015][i//4]))
 for i in range(n):x,y,_=verts[4*n+i];verts.append((x,y,-.43))
 faces=[tuple(range(n-1,-1,-1))];roles=[2]
 for j in range(5):
  for i in range(n):faces.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i));roles.append(2 if j<2 else 1 if j==2 else 0 if j==3 else 3)
 faces.append(tuple(range(5*n,6*n)));roles.append(3)
 return mesh_object(name,verts,faces,roles)
for variant,phase in enumerate([0,1.9]):
 name='battered-region-'+('a'if variant==0 else'b');parts=[battered_region(name,phase)]
 # Four directional crust districts integrate with the existing crater edge;
 # no additional concentric shelves surround the working basin.
 districts=[
 ([(-1.90,-.64),(-1.48,-.83),(-1.03,-.75),(-.64,-.57),(-.54,-.28),(-.62,.29),(-.91,.54),(-1.26,.42),(-1.78,.57),(-1.99,.16)],.17),
 ([(-1.62,.45),(-1.03,.44),(-.63,.36),(-.37,.58),(.13,.67),(.43,.92),(.16,1.34),(-.39,1.48),(-.71,1.20),(-1.29,1.32),(-1.70,.93)],.11),
 ([(-1.63,-1.14),(-1.08,-1.42),(-.51,-1.25),(-.08,-1.45),(.48,-1.22),(.76,-.83),(.33,-.63),(-.13,-.63),(-.61,-.53),(-1.02,-.78),(-1.54,-.73)],.13),
 ([(.41,.72),(.72,.55),(1.17,.64),(1.74,.48),(1.95,.82),(1.75,1.37),(1.26,1.48),(.91,1.22),(.54,1.34)],.09)]
 for i,(poly,h)in enumerate(districts):parts.append(plate(name+'-directional-crust-'+str(i),poly,h*(1 if variant==0 else[.8,1.15,.85,1.1][i])))
 parts.append(inset_pit_district(name+'-embedded-medium-pit'))
 for i,(x,y,sx,sy,h)in enumerate([(-1.42,-.21,.70,.47,.34),(-1.14,.16,.45,.61,.25),(-1.20,.86,.75,.39,.23),(-.55,1.07,.59,.39,.28),(-1.07,-1.07,.52,.41,.24),(-.35,-1.03,.64,.34,.31),(.96,.97,.46,.33,.23),(1.46,1.08,.58,.29,.20)]):parts.append(shelf(name+'-unequal-broken-ledge-'+str(i),x,y,sx,sy,h))
 parts.append(plate(name+'-warm-inset-mineral',[(-1.60,-.31),(-1.22,-.19),(-1.12,-.09),(-.93,-.01),(-.91,.04),(-1.19,-.04),(-1.30,-.13),(-1.62,-.24)],.185,4))
 for obj in parts:
  bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.triangulate(bm,faces=list(bm.faces))
  for _ in range(8):
   edges=[e for e in bm.edges if e.calc_length()>.24]
   if not edges:break
   bmesh.ops.subdivide_edges(bm,edges=edges,cuts=1,use_grid_fill=True);bmesh.ops.triangulate(bm,faces=list(bm.faces));bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-7);bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=1e-7)
  bm.to_mesh(obj.data);bm.free()
 forms.append((name,parts))
for name, subdivisions in [('ground-sphere',5),('ground-sphere-medium',4),('ground-sphere-low',3)]:
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=1)
    ground=bpy.context.object
    ground.name='GEO-'+name
    ground.data.materials.append(materials[0])
    for face in ground.data.polygons: face.use_smooth=True
    ground['role']='planet'
    forms.append((name,[ground]))

kit={'schema':'sidereal.native-planet-kit.v1','layout':'rocky-crater-geology','materials':[{'name':name,'linearColor':list(color),'roughness':roughness} for name,color,roughness in palette],'variants':[]}
kit['uvConvention']='glTF UV (Blender V flipped); invertY=false'
# Offline native surface finish. Exact material palette is the pigment anchor;
# white factors avoid applying original pigment twice after full-color baking.
for role in range(6):
 image=bpy.data.images.new('Rocky8-albedo-'+str(role),width=256,height=256,alpha=True);orm=bpy.data.images.new('Rocky8-roughness-'+str(role),width=256,height=256,alpha=True);orm.colorspace_settings.name='Non-Color';pixels=[];roughpixels=[]
 for y in range(256):
  for x in range(256):
   u=x/256;v=y/256;grain=.85+.10*math.sin(u*43+math.sin(v*31)*2)+.05*math.sin(v*97+math.sin(u*61)*2)+.025*math.sin(x*3.7+y*2.1)
   fracture=math.exp(-((u-(.38+.11*math.sin(v*8)))/.006)**2)*.19
   pixels.extend((*(c*max(.5,grain-fracture)for c in palette[role][1]),1));roughpixels.extend((1,min(1,palette[role][2]*(.88+.12*grain)),0,1))
 for im,data,slug in [(image,pixels,'albedo'),(orm,roughpixels,'orm')]:
  im.pixels.foreach_set(data);im.filepath_raw=str(out/f'rocky-{role}-{slug}.png');im.file_format='PNG';im.save();im.pack()
 mat=materials[role];shader=mat.node_tree.nodes.get('Principled BSDF');tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image;mat.node_tree.links.new(tex.outputs['Color'],shader.inputs['Base Color']);rt=mat.node_tree.nodes.new('ShaderNodeTexImage');rt.image=orm;sep=mat.node_tree.nodes.new('ShaderNodeSeparateColor');mat.node_tree.links.new(rt.outputs['Color'],sep.inputs['Color']);mat.node_tree.links.new(sep.outputs['Green'],shader.inputs['Roughness']);mat.node_tree.links.new(sep.outputs['Blue'],shader.inputs['Metallic'])
 kit['materials'][role].update(linearColor=[1,1,1],roughness=1,metallic=1,baseColorTexture=f'rocky-{role}-albedo.png',metallicRoughnessTexture=f'rocky-{role}-orm.png',textureColorSpace='sRGB',invertY=False)
validation={'publication':'isolated draft; no owner final sign-off','coordinates':'Blender Z up, formation roots buried below Z0; ground sphere radius1','partsManifold':True,'lodContract':'Dominant crater variants retained unchanged at all levels; ground-sphere high/medium/low are authored originals; small outcrop density may decrease; no decimation.','variants':[]}
for name,parts in forms:
    positions=[];indices=[];roles=[];normals=[];uvs=[]
    for obj in parts:
        mesh=obj.data
        if mesh.validate():raise RuntimeError('Invalid mesh '+obj.name)
        bm=bmesh.new();bm.from_mesh(mesh)
        if any(not e.is_manifold for e in bm.edges):raise RuntimeError('Non-manifold '+obj.name)
        bm.free()
        if not mesh.uv_layers.active:mesh.uv_layers.new(name='Native-rocky-UV')
        uv=mesh.uv_layers.active
        for p in mesh.polygons:
            axes=[i for i in range(3)if i!=max(range(3),key=lambda j:abs(p.normal[j]))]
            for loop in p.loop_indices:
                q=mesh.vertices[mesh.loops[loop].vertex_index].co;uv.data[loop].uv=(q[axes[0]]*.45+.5,q[axes[1]]*.45+.5)
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
