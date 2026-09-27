"""Offline native inward wall study. Fresh output directory required; never publishes.

blender -b -t 2 --python scripts/art_library/build_inset_boundary_wall.py -- OUTPUT
"""
import bpy
import bmesh
import hashlib
import json
import math
import shutil
import subprocess
import struct
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
OPAQUE = '--opaque' in sys.argv
assert not OUT.exists(), 'Preserve every existing revision; use a fresh directory'
OUT.mkdir(parents=True)
SPEC = ROOT / 'packages/content/src/ship-tileset-wall-spec.v1.json'
SOURCE = ROOT / 'assets/art-library/designs/shipyard.hull.side-armor/revisions/r003/blender-source.blend'
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
assert sha(SPEC) == 'c7c8fadc1f6a33f2f4a0338902f3c84e85040f7689dda67b9736d3040b3d89d2'
assert sha(SOURCE) == '70c57b06a2c170c28840e0566f077d3561e0b40c4f5e978d36940273ceec1abd'
spec = json.loads(SPEC.read_text())
shutil.copy2(SPEC, OUT / SPEC.name)
shutil.copy2(__file__, OUT / 'recipe.py')
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 24
scene.cycles.use_denoising = False
scene.render.resolution_x = 1000
scene.render.resolution_y = 1000
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.film_transparent = not OPAQUE
scene.view_settings.view_transform = 'AgX'
with bpy.data.libraries.load(str(SOURCE), link=False) as (src, dst):
    dst.materials = [n for n in src.materials if n.startswith('MAT-Frontier-side-hull-')]
roles = ['pale', 'dark', 'steel', 'red', 'cyan']
mats = [bpy.data.materials['MAT-Frontier-side-hull-' + r] for r in roles]
geo = bpy.data.collections.new('GEO'); scene.collection.children.link(geo)
proxy = bpy.data.collections.new('COLLISION'); scene.collection.children.link(proxy)
socket = bpy.data.collections.new('SOCKETS'); scene.collection.children.link(socket)
lod = bpy.data.collections.new('LOD'); scene.collection.children.link(lod)


def native_wall(shape):
    length = shape['lengthUnits'] / 32
    height = shape['heightUnits'] / 32
    verts, faces, materials = [], [], []
    def loop(x0, x1, z0, z1, y):
        ids = list(range(len(verts), len(verts) + 4))
        verts.extend([(x0,y,z0),(x1,y,z0),(x1,y,z1),(x0,y,z1)])
        return ids
    def face(ids, material):
        faces.append(ids); materials.append(roles.index(material))
    # Complete closed mesh: each 1 m x .75 m course has a recessed bevel,
    # with an uninterrupted outer backing plane and exact full-depth ends.
    # These are authored topology loops, not scaled legacy or voxel geometry.
    for ix in range(round(length)):
        for iz in range(round(height / .75)):
            x0, x1, z0, z1 = ix, ix+1, iz*.75, (iz+1)*.75
            back = loop(x0,x1,z0,z1,0)
            front = loop(x0,x1,z0,z1,.25)
            rim = loop(x0+.03125,x1-.03125,z0+.03125,z1-.03125,.25)
            groove = loop(x0+.046875,x1-.046875,z0+.046875,z1-.046875,.234375)
            panel = loop(x0+.0625,x1-.0625,z0+.0625,z1-.0625,.246875)
            face(back[::-1], 'steel')
            for i in range(4):
                j=(i+1)%4
                if (i==0 and iz==0) or (i==1 and ix==round(length)-1) or (i==2 and iz==round(height/.75)-1) or (i==3 and ix==0):
                    face([back[i],back[j],front[j],front[i]], 'steel')
                for a,b,role in [(front,rim,'pale'),(rim,groove,'dark'),(groove,panel,'pale')]:
                    # A restrained continuous status line, physically recessed.
                    if a is groove and i==2 and iz==0:
                        role='cyan'
                    face([a[i],a[j],b[j],b[i]],role)
            face(panel,'red' if iz==1 else 'pale')
    shared={}; unique=[]; remap=[]
    for vertex in verts:
        if vertex not in shared:
            shared[vertex]=len(unique); unique.append(vertex)
        remap.append(shared[vertex])
    faces=[[remap[i] for i in face] for face in faces]
    mesh=bpy.data.meshes.new('MESH-'+shape['id']); mesh.from_pydata(unique,[],faces)
    for mat in mats: mesh.materials.append(mat)
    for p,m in zip(mesh.polygons,materials): p.material_index=m
    bm=bmesh.new(); bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    assert all(e.is_manifold for e in bm.edges), (shape['id'],[(tuple(e.verts[0].co),tuple(e.verts[1].co),len(e.link_faces)) for e in bm.edges if not e.is_manifold])
    volume=bm.calc_volume(signed=True); assert volume>0
    bm.to_mesh(mesh); bm.free(); mesh.update()
    uv=mesh.uv_layers.new(name='UVMap')
    for poly in mesh.polygons:
        axis=max(range(3),key=lambda a:abs(poly.normal[a]))
        axes=[a for a in range(3) if a!=axis]
        for li in poly.loop_indices:
            co=mesh.vertices[mesh.loops[li].vertex_index].co
            uv.data[li].uv=(co[axes[0]],co[axes[1]])
    obj=bpy.data.objects.new('GEO-inset250-'+shape['id'],mesh); geo.objects.link(obj)
    obj['asset_shape']=shape['id']; obj['native_spec_sha256']=sha(SPEC)
    obj['origin_convention']=spec['modelOrigin']; obj['art_approval']='unapproved'
    obj['geometry_role']='authored-visible-surface'
    obj['placement_floor_top_m']=.1875
    return obj, volume


objects={}; results={}; interfaces={}
for shape in spec['shapes']:
    sid=shape['id']; obj,volume=native_wall(shape); objects[sid]=obj
    length=shape['lengthUnits']/32; height=shape['heightUnits']/32
    # Proxy is a separate conservative bound, NOT the visible mesh or a
    # claim of qualified collision, damage, pressure, or runtime availability.
    bpy.ops.mesh.primitive_cube_add(size=1,location=(length/2,.125,height/2))
    p=bpy.context.object; p.name='PROXY-reservation-'+sid
    p.dimensions=(length,.25,height)
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    for c in list(p.users_collection): c.objects.unlink(p)
    proxy.objects.link(p); p.hide_render=True; p.hide_set(True)
    p['qualification']='pending'; p['geometry_role']='conservative-reservation-only'
    contacts=[('start',[0,0,0],[0,.25,height],[-1,0,0],'end'),
              ('end',[length,0,0],[length,.25,height],[1,0,0],'end'),
              ('exterior',[0,0,0],[length,0,height],[0,-1,0],'exterior'),
              ('bottom',[0,0,0],[length,.25,0],[0,0,-1],'floor'),
              ('top',[0,0,height],[length,.25,height],[0,0,1],'top')]
    planes=[]
    for name,lo,hi,normal,profile in contacts:
        e=bpy.data.objects.new('SOCK-'+sid+'-'+name,None); socket.objects.link(e)
        e.location=tuple((a+b)/2 for a,b in zip(lo,hi)); e.empty_display_size=.06
        e['normal']=normal; e['profile']=spec['profiles'][profile]
        planes.append(dict(id=name,minM=lo,maxM=hi,normal=normal,profile=spec['profiles'][profile]))
    interfaces[sid]={'reservation':{'minM':[0,0,0],'maxM':[length,.25,height]},
        'contactPlanes':planes,'collision':{'kind':'conservative-aabb','qualification':'pending'},
        'seal':{'backingDepthM':.234375,'closedWallBandOnly':True,'compartmentQualification':'pending'},
        'damage':{'mode':'voxel','sampling':'not-created','authorityQualification':'pending'},
        'service':{'ports':[],'statusStrip':'decorative-only'}}
    bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True)
    bpy.context.view_layer.objects.active=obj
    bpy.ops.export_scene.gltf(filepath=str(OUT/(sid+'.glb')),export_format='GLB',use_selection=True,
        export_apply=True,export_extras=True,export_yup=True)
    results[sid]={'sourceVertices':len(obj.data.vertices),'sourcePolygons':len(obj.data.polygons),
        'sourceTriangles':sum(len(f.vertices)-2 for f in obj.data.polygons),
        'sourceVolumeM3':volume,'sourceClosedManifold':True,'glbSha256':sha(OUT/(sid+'.glb'))}

# Validate every reimported mesh/node and material, not just root bounds.
for sid,obj in objects.items():
    raw=(OUT/(sid+'.glb')).read_bytes()
    gltf=json.loads(raw[20:20+struct.unpack_from('<I',raw,12)[0]])
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(OUT/(sid+'.glb')))
    imported=set(bpy.data.objects)-before
    points=[]; nodes=[]; used_materials=set(); triangle_count=0
    for node in imported:
        if node.type!='MESH': continue
        # Blender import reverses glTF Y-up conversion into original source frame.
        vv=[node.matrix_world@v.co for v in node.data.vertices]; points+=vv
        lo=[min(v[a] for v in vv) for a in range(3)]; hi=[max(v[a] for v in vv) for a in range(3)]
        maximum=interfaces[sid]['reservation']['maxM']
        assert all(math.isfinite(v) for p in vv for v in p)
        assert all(lo[a]>=-1e-6 and hi[a]<=maximum[a]+1e-6 for a in range(3)),(sid,node.name,lo,hi)
        for material in node.data.materials:
            # Importer may append numeric suffix to avoid source-name conflict.
            assert any(material.name.startswith(m.name) for m in mats),material.name
            used_materials.add(material.name.split('.')[0])
            assert node.data.uv_layers, 'Texture UVs missing'
            original=next(m for m in mats if material.name.startswith(m.name))
            a=next(n for n in original.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
            b=next(n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
            for key in ['Base Color','Metallic','Roughness','Emission Color','Emission Strength']:
                if a.inputs[key].is_linked:
                    assert b.inputs[key].is_linked,(sid,key,'lost texture')
                    original_image=a.inputs[key].links[0].from_node.image
                    def upstream_image(node):
                        if node.type=='TEX_IMAGE': return node.image
                        return next(upstream_image(i.links[0].from_node) for i in node.inputs if i.is_linked)
                    imported_image=upstream_image(b.inputs[key].links[0].from_node)
                    assert tuple(original_image.size)==tuple(imported_image.size)
                    op=list(original_image.pixels); ip=list(imported_image.pixels)
                    assert max(abs(op[i]-ip[i+1]) for i in range(0,len(op),4))<.005,(sid,key,'texture channel mismatch')
                    continue
                if key=='Metallic' and b.inputs[key].is_linked:
                    gm=next(m for m in gltf['materials'] if m['name']==original.name)
                    assert abs(gm['pbrMetallicRoughness'].get('metallicFactor',1)-a.inputs[key].default_value)<1e-5
                    continue
                av=a.inputs[key].default_value; bv=b.inputs[key].default_value
                av=list(av) if hasattr(av,'__len__') else [av]
                bv=list(bv) if hasattr(bv,'__len__') else [bv]
                assert all(abs(x-y)<1e-5 for x,y in zip(av,bv)),(sid,key,av,bv)
        tris=sum(len(f.vertices)-2 for f in node.data.polygons); triangle_count+=tris
        nodes.append({'name':node.name,'minM':lo,'maxM':hi,'triangles':tris})
    assert nodes
    lo=[min(v[a] for v in points) for a in range(3)]; hi=[max(v[a] for v in points) for a in range(3)]
    assert all(abs(lo[a])<=1e-6 and abs(hi[a]-interfaces[sid]['reservation']['maxM'][a])<=1e-6 for a in range(3))
    results[sid].update(exportedNodes=nodes,exportedTriangles=triangle_count,
        exportedMaterialCount=len(used_materials),materialPreservation='verified reimport PBR inputs',
        allExportedNodeContainment=True,exportedBounds={'minM':lo,'maxM':hi})
    for node in imported: bpy.data.objects.remove(node,do_unlink=True)

for obj in objects.values(): obj.hide_render=True
scene.world=bpy.data.worlds.new('Neutral studio world'); scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.16,.18,.23,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.4
for name,location,power,size in [('key',(2,5,6),1000,5),('fill',(-4,2,3),650,4),('rim',(3,-3,4),900,3)]:
    data=bpy.data.lights.new(name,'AREA'); data.energy=power; data.shape='DISK'; data.size=size
    o=bpy.data.objects.new('LIGHT-'+name,data); scene.collection.objects.link(o); o.location=location
    o.rotation_euler=(Vector((1,.125,1.5))-o.location).to_track_quat('-Z','Y').to_euler()
camera=bpy.data.objects.new('CAMERA-review',bpy.data.cameras.new('review')); scene.collection.objects.link(camera)
scene.camera=camera; camera.data.type='ORTHO'
captures=[]
def render(name,length,height,azimuth=65,elevation=35.264):
    target=Vector((length/2,.125,height/2))
    az=math.radians(azimuth); el=math.radians(elevation)
    camera.location=target+Vector((math.cos(az)*8,math.sin(az)*8,math.tan(el)*8))
    camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.ortho_scale=max(height*1.35,length*1.35,1.4)
    scene.render.filepath=str(OUT/(name+'.png')); bpy.ops.render.render(write_still=True)
    captures.append({'file':name+'.png','filmTransparent':not OPAQUE,
        'visibleObjects':[o.name for o in scene.objects if o.type=='MESH' and not o.hide_render],
        'azimuthDeg':azimuth,'elevationDeg':elevation,
        'orthographicScaleM':camera.data.ortho_scale,'cameraLocationM':list(camera.location),
        'sha256':sha(OUT/(name+'.png'))})
for sid,obj in objects.items():
    obj.hide_render=False; maximum=interfaces[sid]['reservation']['maxM']
    render(sid,maximum[0],maximum[2]); obj.hide_render=True
for q in range(1,5):
    obj=objects[f'straight-1m-q{q}']; obj.hide_render=False
    twin=obj.copy(); twin.data=obj.data.copy(); geo.objects.link(twin); twin.location.x=1
    render(f'joined-two-1m-q{q}',2,q*.75)
    bpy.data.objects.remove(twin,do_unlink=True); obj.hide_render=True
    # Exact zero nominal gap at X=1 with opposing normal and full depth.
    results[f'straight-1m-q{q}']['joinedPair']={'translationM':[1,0,0],'gapM':0,
        'overlapM3':0,'sameExteriorEnvelopeAs2m':True,'internalContactFaces':'coincident opposing; hidden inside assembly'}
objects['straight-2m-q4'].hide_render=False
render('blender-exterior',2,3,azimuth=-65)
render('blender-top',2,3,azimuth=65,elevation=80)
for obj in objects.values(): obj.hide_set(obj.name != 'GEO-inset250-straight-2m-q4')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'blender-source.blend'))
(OUT/'interfaces.json').write_text(json.dumps({'schema':'sidereal.inset-wall-native-study.v1','specSha256':sha(SPEC),
    'frame':'Blender X run, Y inward, Z up','placementFloorTopM':.1875,'pieces':interfaces},indent=2)+'\n')
(OUT/'validation.json').write_text(json.dumps({'schema':'sidereal.inset-wall-native-validation.v1',
    'specSha256':sha(SPEC),'sourceMaterialBlendSha256':sha(SOURCE),'nativeBlendSha256':sha(OUT/'blender-source.blend'),
    'recipeSha256':sha(OUT/'recipe.py'),'exportToleranceM':1e-6,'pieces':results,
    'qualification':'native straight study only; runtime/browser/game, full family and owner review pending'},indent=2)+'\n')
(OUT/'capture.json').write_text(json.dumps({'blenderVersion':bpy.app.version_string,'renderer':'Cycles CPU',
    'samples':24,'viewportPx':[1000,1000],'viewTransform':'AgX','bloom':False,
    'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
    'source':str(SOURCE.relative_to(ROOT)),'sourceSha256':sha(SOURCE),'captures':captures},indent=2)+'\n')
print('INSET_WALL_COMPLETE',str(OUT))
