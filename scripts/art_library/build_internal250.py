"""Native centered internal250 family; offline, fresh revisions only.

blender -b -t 2 --python scripts/art_library/build_internal250.py -- NEW_OUTPUT
"""
import bpy,bmesh,json,math,hashlib,struct,shutil,sys,subprocess
from pathlib import Path
from mathutils import Vector,Matrix
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(sys.argv[sys.argv.index('--')+1]).resolve()
assert not OUT.exists(),'Preserve existing revisions'
OUT.mkdir(parents=True)
SPEC=ROOT/'packages/content/src/ship-tileset-internal-spec.v1.json'
SOURCE=ROOT/'assets/art-library/designs/shipyard.hull.side-armor/revisions/r003/blender-source.blend'
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
assert sha(SPEC)=='f8dc612cf7ce856043431d98180a1f00d3cfac17031a2e1ca96e28118496f200'
assert sha(SOURCE)=='70c57b06a2c170c28840e0566f077d3561e0b40c4f5e978d36940273ceec1abd'
spec=json.loads(SPEC.read_text());shutil.copy2(SPEC,OUT/SPEC.name);shutil.copy2(__file__,OUT/'recipe.py')
bpy.ops.wm.read_factory_settings(use_empty=True)
S=bpy.context.scene;S.unit_settings.system='METRIC';S.unit_settings.scale_length=1
with bpy.data.libraries.load(str(SOURCE),link=False) as (src,dst):
    dst.materials=[n for n in src.materials if n.startswith('MAT-Frontier-side-hull-')]
roles=['pale','dark','steel','red','cyan'];mats=[bpy.data.materials['MAT-Frontier-side-hull-'+r] for r in roles]
cols={}
for name in ['GEO','SOCKETS','COLLISION','LOD']:
    c=bpy.data.collections.new(name);S.collection.children.link(c);cols[name]=c

def author(shape,height):
    lo=min(p[0] for p in shape['reservationPolygonM']);hi=max(p[0] for p in shape['reservationPolygonM'])
    sid=shape['id']+'-q'+str(round(height/.75));verts=[];ids={};faces=[];mi=[]
    def vertex(v):
        v=tuple(round(x,12) for x in v)
        if v not in ids:ids[v]=len(verts);verts.append(v)
        return ids[v]
    def loop(x0,x1,z0,z1,y):return [vertex(v) for v in [(x0,y,z0),(x1,y,z0),(x1,y,z1),(x0,y,z1)]]
    def face(indices,role):faces.append(indices);mi.append(roles.index(role))
    count=max(1,math.ceil(hi-lo));nz=round(height/.75)
    for ix in range(count):
        x0=lo+(hi-lo)*ix/count;x1=lo+(hi-lo)*(ix+1)/count
        for iz in range(nz):
            z0=iz*.75;z1=(iz+1)*.75
            front=loop(x0,x1,z0,z1,.125);back=loop(x0,x1,z0,z1,-.125)
            for i in range(4):
                j=(i+1)%4
                if (i==0 and iz==0) or (i==1 and ix==count-1) or (i==2 and iz==nz-1) or (i==3 and ix==0):
                    face([back[i],back[j],front[j],front[i]],'steel')
            for sign,outer in [(1,front),(-1,back)]:
                if shape['id']=='internal-core':
                    # Any cardinal side may be a branch contact. Every core side
                    # remains planar and full-depth; material detail has no recess.
                    face(outer,'pale');continue
                margin=min(.03125,(x1-x0)*.12)
                rim=loop(x0+margin,x1-margin,z0+.03125,z1-.03125,sign*.125)
                groove=loop(x0+margin*1.5,x1-margin*1.5,z0+.046875,z1-.046875,sign*.109375)
                panel=loop(x0+margin*2,x1-margin*2,z0+.0625,z1-.0625,sign*.12109375)
                for a,b,role in [(outer,rim,'pale'),(rim,groove,'dark'),(groove,panel,'pale')]:
                    for i in range(4):
                        j=(i+1)%4;face([a[i],a[j],b[j],b[i]],role)
                if shape['id'].startswith('internal-span') and iz==1 and ix==0:
                    cx=(x0+x1)/2;cz=(z0+z1)/2
                    patch=loop(cx-(x1-x0)*.12,cx+(x1-x0)*.12,cz-.1,cz+.1,sign*.12109375)
                    inset=loop(cx-(x1-x0)*.10,cx+(x1-x0)*.10,cz-.08,cz+.08,sign*.115234375)
                    for i in range(4):
                        j=(i+1)%4;face([panel[i],panel[j],patch[j],patch[i]],'pale')
                        face([patch[i],patch[j],inset[j],inset[i]],'cyan' if i==2 else 'dark')
                    face(inset,'red')
                else:face(panel,'pale')
    mesh=bpy.data.meshes.new('MESH-'+sid);mesh.from_pydata(verts,[],faces)
    for m in mats:mesh.materials.append(m)
    for f,m in zip(mesh.polygons,mi):f.material_index=m
    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    assert all(e.is_manifold for e in bm.edges),(sid,'manifold')
    volume=bm.calc_volume(signed=True);assert volume>0
    bm.to_mesh(mesh);bm.free();mesh.update()
    uv=mesh.uv_layers.new(name='UVMap')
    for f in mesh.polygons:
        axis=max(range(3),key=lambda a:abs(f.normal[a]));axes=[a for a in range(3) if a!=axis]
        for li in f.loop_indices:
            v=mesh.vertices[mesh.loops[li].vertex_index].co;uv.data[li].uv=(v[axes[0]],v[axes[1]])
    obj=bpy.data.objects.new('GEO-'+sid,mesh);cols['GEO'].objects.link(obj)
    obj['native_spec_sha256']=sha(SPEC);obj['art_approval']='unapproved';obj['reservation']='centered-internal-only'
    obj['placementFloorTopM']=.1875
    return sid,obj,[lo,-.125,0],[hi,.125,height],volume

objects={};interfaces={};validation={}
for shape in spec['shapes']:
    for height in spec['heightsM']:
        sid,obj,lo,hi,volume=author(shape,height);objects[sid]=obj
        interfaces[sid]={'reservationMinM':lo,'reservationMaxM':hi,'footprintM':shape['reservationPolygonM'],
            'heightM':height,'placementFloorTopM':.1875,'scope':'centered internal partition only',
            'contacts':{'startX':lo[0],'endX':hi[0],'coreCardinalFaces':shape['id']=='internal-core'},
            'bearing':{'bottomZ':0,'topZ':height,'qualification':'pending'},
            'collision':{'proxy':'separate conservative aabb','qualification':'pending'},
            'seal':{'continuousBackingThicknessM':.21875,'qualification':'pending'},
            'damage':{'sampling':'not-created','qualification':'pending'},'service':{'ports':[],'hatch':'decorative'}}
        bpy.ops.mesh.primitive_cube_add(size=1,location=tuple((a+b)/2 for a,b in zip(lo,hi)))
        p=bpy.context.object;p.name='PROXY-'+sid;p.dimensions=tuple(b-a for a,b in zip(lo,hi))
        bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
        for c in list(p.users_collection):c.objects.unlink(p)
        cols['COLLISION'].objects.link(p);p.hide_render=True;p.hide_set(True);p['qualification']='pending'
        for name,pos,normal in [('start',(lo[0],0,height/2),(-1,0,0)),('end',(hi[0],0,height/2),(1,0,0))]:
            e=bpy.data.objects.new('SOCK-'+sid+'-'+name,None);cols['SOCKETS'].objects.link(e);e.location=pos;e['normal']=normal
        bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
        bpy.ops.export_scene.gltf(filepath=str(OUT/(sid+'.glb')),export_format='GLB',use_selection=True,export_apply=True,
            export_extras=True,export_yup=True,export_tangents=True)
        validation[sid]={'manifold':True,'sourceVolumeM3':volume,'sourceVertices':len(obj.data.vertices),
            'sourceTriangles':sum(len(f.vertices)-2 for f in obj.data.polygons),'glbSha256':sha(OUT/(sid+'.glb'))}

def upstream(node):
    if node.type=='TEX_IMAGE':return node.image
    return next(upstream(i.links[0].from_node) for i in node.inputs if i.is_linked)
for sid,obj in objects.items():
    raw=(OUT/(sid+'.glb')).read_bytes();g=json.loads(raw[20:20+struct.unpack_from('<I',raw,12)[0]])
    assert all('uri' not in im for im in g.get('images',[]))
    before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(OUT/(sid+'.glb')))
    imported=set(bpy.data.objects)-before;nodes=[]
    for o in imported:
        if o.type!='MESH':continue
        vv=[o.matrix_world@v.co for v in o.data.vertices];lo=interfaces[sid]['reservationMinM'];hi=interfaces[sid]['reservationMaxM']
        assert all(math.isfinite(x) for v in vv for x in v)
        assert all(lo[a]-1e-6<=v[a]<=hi[a]+1e-6 for v in vv for a in range(3)),sid
        assert o.data.uv_layers
        for mat in o.data.materials:
            orig=next(m for m in mats if mat.name.startswith(m.name));a=next(n for n in orig.node_tree.nodes if n.type=='BSDF_PRINCIPLED');b=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
            gm=next(m for m in g['materials'] if m['name']==orig.name)
            assert abs(gm['pbrMetallicRoughness'].get('metallicFactor',1)-a.inputs['Metallic'].default_value)<1e-5
            for key in ['Base Color','Roughness','Emission Color','Emission Strength']:
                if a.inputs[key].is_linked:
                    assert b.inputs[key].is_linked
                    ai=upstream(a.inputs[key].links[0].from_node);bi=upstream(b.inputs[key].links[0].from_node)
                    av=list(ai.pixels);bv=list(bi.pixels);assert tuple(ai.size)==tuple(bi.size)
                    assert max(abs(av[i]-bv[i+1]) for i in range(0,len(av),4))<.005
                else:
                    av=a.inputs[key].default_value;bv=b.inputs[key].default_value
                    av=list(av) if hasattr(av,'__len__') else [av];bv=list(bv) if hasattr(bv,'__len__') else [bv]
                    assert all(abs(x-y)<1e-5 for x,y in zip(av,bv)),(sid,key)
            if a.inputs['Normal'].is_linked:
                an=a.inputs['Normal'].links[0].from_node;bn=b.inputs['Normal'].links[0].from_node
                assert an.type==bn.type=='NORMAL_MAP'
                assert abs(an.inputs['Strength'].default_value-bn.inputs['Strength'].default_value)<1e-5
                ai=upstream(an.inputs['Color'].links[0].from_node);bi=upstream(bn.inputs['Color'].links[0].from_node)
                assert tuple(ai.size)==tuple(bi.size);assert max(abs(x-y) for x,y in zip(ai.pixels,bi.pixels))<1e-5
        nodes.append({'name':o.name,'minM':[min(v[a] for v in vv) for a in range(3)],'maxM':[max(v[a] for v in vv) for a in range(3)],'triangles':sum(len(f.vertices)-2 for f in o.data.polygons)})
    assert nodes
    validation[sid].update(exportedNodes=nodes,allNodeContainment=True,pbrAndTexturePreservation=True,
        materialCount=len(g['materials']),primitiveCount=sum(len(m['primitives']) for m in g['meshes']),
        textureCount=len(g.get('textures',[])),embeddedImages=len(g.get('images',[])))
    for o in imported:bpy.data.objects.remove(o,do_unlink=True)

fixtures=[]
for q,height in enumerate(spec['heightsM'],1):
    for length in [1,2]:
        fixtures.append({'id':f'capped-{length}m-q{q}','heightM':height,'placements':[
            ['internal-end',0,0,0],['internal-span-'+str(length-.25),.125,0,0],['internal-end',length,0,2]]})
    for name,rays in [('corner',[(1,0,1),(0,1,2)]),('tee',[(-1,0,2),(1,0,2),(0,1,2)]),('cross',[(-1,0,2),(1,0,2),(0,1,2),(0,-1,2)])]:
        placements=[['internal-core',0,0,0]]
        for dx,dy,length in rays:
            turn={(1,0):0,(0,1):1,(-1,0):2,(0,-1):3}[(dx,dy)]
            placements.extend([['internal-span-'+str(length-.25),dx*.125,dy*.125,turn],['internal-end',dx*length,dy*length,(turn+2)%4]])
        fixtures.append({'id':f'{name}-q{q}','heightM':height,'placements':placements})

for o in objects.values():o.hide_render=True
S.render.engine='CYCLES';S.cycles.device='CPU';S.cycles.samples=16;S.cycles.use_denoising=False
S.render.resolution_x=900;S.render.resolution_y=900;S.render.resolution_percentage=100
S.render.image_settings.file_format='PNG';S.render.image_settings.color_mode='RGBA';S.render.film_transparent=False
S.view_settings.view_transform='AgX';S.world=bpy.data.worlds.new('Opaque neutral studio');S.world.use_nodes=True
S.world.node_tree.nodes['Background'].inputs[0].default_value=(.12,.15,.20,1)
S.world.node_tree.nodes['Background'].inputs[1].default_value=.5
for name,pos,power in [('key',(4,5,7),1400),('fill',(-4,2,5),1100),('rim',(2,-5,5),900)]:
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.size=5;o=bpy.data.objects.new('LIGHT-'+name,d);S.collection.objects.link(o);o.location=pos
    o.rotation_euler=(Vector((0,0,1.5))-o.location).to_track_quat('-Z','Y').to_euler()
cam=bpy.data.objects.new('CAMERA-review',bpy.data.cameras.new('review'));S.collection.objects.link(cam);S.camera=cam;cam.data.type='ORTHO';captures=[]
def capture(name,visible,top=False):
    vv=[o.matrix_world@v.co for o in visible for v in o.data.vertices]
    lo=Vector([min(v[a] for v in vv) for a in range(3)]);hi=Vector([max(v[a] for v in vv) for a in range(3)]);target=(lo+hi)/2
    el=math.radians(90 if top else 35.264);az=math.radians(55)
    cam.location=target+Vector((8*math.cos(el)*math.cos(az),8*math.cos(el)*math.sin(az),8*math.sin(el)))
    cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=max(hi-lo)*1.5
    S.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
    captures.append({'file':name+'.png','sha256':sha(OUT/(name+'.png')),'cameraM':list(cam.location),'targetM':list(target),
        'orthoScaleM':cam.data.ortho_scale,'visibleMeshes':[o.name for o in visible]})
for sid,o in objects.items():
    o.hide_render=False;bpy.context.view_layer.update();capture('individual-'+sid,[o]);o.hide_render=True
for fixture in fixtures:
    copies=[];q=round(fixture['heightM']/.75)
    for i,(part,x,y,turn) in enumerate(fixture['placements']):
        original=objects[part+f'-q{q}'];o=original.copy();o.data=original.data.copy();cols['GEO'].objects.link(o)
        o.name='GEO-fixture-'+fixture['id']+'-'+str(i);o.location=(x,y,0);o.rotation_euler.z=turn*math.pi/2;o.hide_render=False;copies.append(o)
    bpy.context.view_layer.update();capture('fixture-'+fixture['id'],copies)
    if q==4:capture('fixture-'+fixture['id']+'-top',copies,True)
    for o in copies:bpy.data.objects.remove(o,do_unlink=True)
objects['internal-span-2-q4'].hide_render=False
for o in objects.values():o.hide_set(o.name!='GEO-internal-span-2-q4')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'blender-source.blend'))
(OUT/'interfaces.json').write_text(json.dumps({'specSha256':sha(SPEC),'pieces':interfaces,'fixtures':fixtures,'approval':'unapproved'},indent=2)+'\n')
(OUT/'validation.json').write_text(json.dumps({'specSha256':sha(SPEC),'materialSourceSha256':sha(SOURCE),
    'nativeBlendSha256':sha(OUT/'blender-source.blend'),'pieces':validation,'approval':'unapproved','gameplayQualification':'pending'},indent=2)+'\n')
(OUT/'capture.json').write_text(json.dumps({'blenderVersion':bpy.app.version_string,'renderer':'Cycles CPU','samples':16,
    'viewportPx':[900,900],'opaque':True,'viewTransform':'AgX','head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'captures':captures},indent=2)+'\n')
print('INTERNAL250_COMPLETE',str(OUT))
