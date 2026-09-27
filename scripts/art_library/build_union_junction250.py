"""Native union junction250 family; offline, fresh revisions only.

blender -b -t 2 --python scripts/art_library/build_union_junction250.py -- NEW_OUTPUT
"""
import bpy,bmesh,json,math,hashlib,struct,shutil,sys,subprocess
from pathlib import Path
from mathutils import Vector,Matrix
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(sys.argv[sys.argv.index('--')+1]).resolve()
assert not OUT.exists(),'Preserve existing revisions'
OUT.mkdir(parents=True)
SPEC=ROOT/'packages/content/src/ship-tileset-union-junction-spec.v1.json'
SOURCE=ROOT/'assets/art-library/designs/shipyard.hull.side-armor/revisions/r003/blender-source.blend'
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
assert sha(SPEC)=='46b06de54bfd81993716e0acea0d840ded94a6bcf45a0cc13a610ba0bddac6c4'
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


for dep in spec['nativeDependencies']:assert sha(ROOT/dep['path'])==dep['sha256'],dep['path']
def inside(p,poly):
    x,y=p;on=False
    for a,b in zip(poly,poly[1:]+poly[:1]):
        if abs((b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0]))<1e-8 and min(a[0],b[0])-1e-8<=x<=max(a[0],b[0])+1e-8 and min(a[1],b[1])-1e-8<=y<=max(a[1],b[1])+1e-8:return True
        if (a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:on=not on
    return on

def author(shape,height):
    poly=shape['reservationPolygonM'];sid=shape['id']+'-q'+str(round(height/.75))
    xs=sorted(set(p[0] for p in poly)|set(p[k][0] for p in shape['contacts'] for k in ['a','b']))
    ys=sorted(set(p[1] for p in poly)|set(p[k][1] for p in shape['contacts'] for k in ['a','b']))
    cells={(i,j) for i in range(len(xs)-1) for j in range(len(ys)-1) if inside(((xs[i]+xs[i+1])/2,(ys[j]+ys[j+1])/2),poly)}
    verts=[];ids={};faces=[];mi=[]
    def vertex(v):
        v=tuple(round(x,12) for x in v)
        if v not in ids:ids[v]=len(verts);verts.append(v)
        return ids[v]
    def face(v,role):faces.append([vertex(p) for p in v]);mi.append(roles.index(role))
    for i,j in cells:
        x0,x1=xs[i:i+2];y0,y1=ys[j:j+2]
        for z in [0,height]:face([(x0,y0,z),(x1,y0,z),(x1,y1,z),(x0,y1,z)],'steel')
        for di,dj,a,b in [(-1,0,(x0,y1),(x0,y0)),(1,0,(x1,y0),(x1,y1)),(0,-1,(x0,y0),(x1,y0)),(0,1,(x1,y1),(x0,y1))]:
            if (i+di,j+dj) in cells:continue
            L=math.dist(a,b);u=((b[0]-a[0])/L,(b[1]-a[1])/L);inward=(-u[1],u[0])
            mid=((a[0]+b[0])/2,(a[1]+b[1])/2)
            contact=any(abs((c['b'][0]-c['a'][0])*(mid[1]-c['a'][1])-(c['b'][1]-c['a'][1])*(mid[0]-c['a'][0]))<1e-9 and min(c['a'][0],c['b'][0])-1e-9<=mid[0]<=max(c['a'][0],c['b'][0])+1e-9 and min(c['a'][1],c['b'][1])-1e-9<=mid[1]<=max(c['a'][1],c['b'][1])+1e-9 for c in shape['contacts'])
            for iz in range(round(height/.75)):
                z0=iz*.75;z1=z0+.75
                def loop(m,d):return [(a[0]+u[0]*t+inward[0]*d,a[1]+u[1]*t+inward[1]*d,z) for t,z in [(m,z0+m),(L-m,z0+m),(L-m,z1-m),(m,z1-m)]]
                outer=loop(0,0)
                if contact or L<.2 or shape['id']=='exterior-t':face(outer,'dark' if shape['id']=='exterior-t' and abs(mid[1])<1e-9 else 'pale');continue
                margin=min(.025,L*.1);rim=loop(margin,0);groove=loop(margin*1.5,.015625);panel=loop(margin*2,.00390625)
                for aa,bb,role in [(outer,rim,'pale'),(rim,groove,'dark'),(groove,panel,'pale')]:
                    for k in range(4):face([aa[k],aa[(k+1)%4],bb[(k+1)%4],bb[k]],role)
                if iz==1 and shape['id'].startswith('internal'):
                    def patch(frac,zh,depth):
                        return [(a[0]+u[0]*t+inward[0]*depth,a[1]+u[1]*t+inward[1]*depth,z) for t,z in [(L*(.5-frac),(z0+z1)/2-zh),(L*(.5+frac),(z0+z1)/2-zh),(L*(.5+frac),(z0+z1)/2+zh),(L*(.5-frac),(z0+z1)/2+zh)]]
                    rim=patch(.12,.1,.00390625);inset=patch(.10,.08,.009765625)
                    for k in range(4):
                        face([panel[k],panel[(k+1)%4],rim[(k+1)%4],rim[k]],'pale')
                        face([rim[k],rim[(k+1)%4],inset[(k+1)%4],inset[k]],'cyan' if k==2 else 'dark')
                    face(inset,'red')
                else:face(panel,'pale')
    mesh=bpy.data.meshes.new('MESH-'+sid);mesh.from_pydata(verts,[],faces)
    for m in mats:mesh.materials.append(m)
    for f,m in zip(mesh.polygons,mi):f.material_index=m
    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    assert all(e.is_manifold for e in bm.edges),(sid,'manifold')
    volume=bm.calc_volume(signed=True);assert volume>0
    bm.to_mesh(mesh);bm.free();mesh.update();mesh.calc_loop_triangles()
    for t in mesh.loop_triangles:
        vv=[mesh.vertices[k].co for k in t.vertices];assert (vv[1]-vv[0]).cross(vv[2]-vv[0]).length>1e-12
        for v in vv+[sum(vv,Vector())/3]+[(vv[k]+vv[(k+1)%3])/2 for k in range(3)]:assert inside(v[:2],poly),(sid,'notch')
    uv=mesh.uv_layers.new(name='UVMap')
    for f in mesh.polygons:
        axis=max(range(3),key=lambda a:abs(f.normal[a]));axes=[a for a in range(3) if a!=axis]
        for li in f.loop_indices:
            v=mesh.vertices[mesh.loops[li].vertex_index].co;uv.data[li].uv=(v[axes[0]],v[axes[1]])
    obj=bpy.data.objects.new('GEO-'+sid,mesh);cols['GEO'].objects.link(obj)
    obj['native_spec_sha256']=sha(SPEC);obj['art_approval']='unapproved';obj['placementFloorTopM']=.1875
    return sid,obj,[min(xs),min(ys),0],[max(xs),max(ys),height],volume
objects={};interfaces={};validation={}
for shape in spec['shapes']:
    for height in spec['heightsM']:
        sid,obj,lo,hi,volume=author(shape,height);objects[sid]=obj
        interfaces[sid]={'reservationMinM':lo,'reservationMaxM':hi,'footprintM':shape['reservationPolygonM'],'heightM':height,'placementFloorTopM':.1875,'contacts':shape['contacts'],'physicalQualification':'pending','collision':{'proxy':'separate unqualified native surface mesh','qualification':'pending'},'seal':{'qualification':'pending'},'damage':{'qualification':'pending'},'support':{'qualification':'pending'}}
        proxy=obj.copy();proxy.data=obj.data.copy();proxy.name='PROXY-'+sid;cols['COLLISION'].objects.link(proxy);proxy.hide_render=True;proxy.hide_set(True);proxy['qualification']='pending'
        for ci,c in enumerate(shape['contacts']):
            e=bpy.data.objects.new('SOCK-'+sid+'-'+str(ci),None);cols['SOCKETS'].objects.link(e);e.location=((c['a'][0]+c['b'][0])/2,(c['a'][1]+c['b'][1])/2,height/2);e['normal']=c['outwardNormal']+[0];e['qualification']='pending'
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
        o.data.calc_loop_triangles()
        poly=interfaces[sid]['footprintM']
        for t in o.data.loop_triangles:
            tv=[vv[k] for k in t.vertices];assert (tv[1]-tv[0]).cross(tv[2]-tv[0]).length>1e-12
            for v in tv+[sum(tv,Vector())/3]+[(tv[k]+tv[(k+1)%3])/2 for k in range(3)]:assert inside(v[:2],poly),(sid,'export-notch')
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

for o in objects.values():o.hide_render=True
S.render.engine='CYCLES';S.cycles.device='CPU';S.cycles.samples=12;S.cycles.use_denoising=False
S.render.resolution_x=720;S.render.resolution_y=720;S.render.resolution_percentage=100
S.render.image_settings.file_format='PNG';S.render.image_settings.color_mode='RGBA';S.render.film_transparent=False
S.view_settings.view_transform='AgX';S.world=bpy.data.worlds.new('Opaque neutral studio');S.world.use_nodes=True
S.world.node_tree.nodes['Background'].inputs[0].default_value=(.12,.15,.20,1)
S.world.node_tree.nodes['Background'].inputs[1].default_value=.5
for name,pos,power in [('key',(4,5,7),1400),('fill',(-4,2,5),1100),('rim',(2,-5,5),720)]:
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

# Render fixtures from reimported exact candidates and pinned native GLBs.
def import_meshes(path):
    before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(path));return [o for o in set(bpy.data.objects)-before if o.type=='MESH']
for fixture in spec['fixtures']:
    for q in [1,4]:
        visible=[]
        for pi,p in enumerate(fixture['pieces']):
            sid=p['profileId']+f'-q{q}'
            if p['family']=='new':path=OUT/(sid+'.glb')
            else:
                base=ROOT/spec['nativeFamilies'][p['family']]
                path=base/('profiles' if p['family']=='convex-r004' else '')/(sid+'.glb')
            for o in import_meshes(path):
                o.name='FIX-'+fixture['id']+'-'+str(pi)+'-'+sid;o.matrix_world=Matrix.Translation(Vector((*p['originM'],.1875)))@Matrix.Rotation(p['quarterTurns']*math.pi/2,4,'Z')@o.matrix_world;o.hide_render=False;visible.append(o)
        bpy.context.view_layer.update();capture('fixture-'+fixture['id']+f'-q{q}',visible)
        if q==1:capture('fixture-'+fixture['id']+f'-q{q}-top',visible,True)
        for o in visible:bpy.data.objects.remove(o,do_unlink=True)
objects['concave-90-q4'].hide_render=False
for o in objects.values():o.hide_set(o.name!='GEO-concave-90-q4')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'blender-source.blend'))
(OUT/'interfaces.json').write_text(json.dumps({'specSha256':sha(SPEC),'pieces':interfaces,'fixtures':spec['fixtures'],'approval':'unapproved'},indent=2)+'\n')
(OUT/'validation.json').write_text(json.dumps({'specSha256':sha(SPEC),'materialSourceSha256':sha(SOURCE),'nativeBlendSha256':sha(OUT/'blender-source.blend'),'pieces':validation,'approval':'unapproved','gameplayQualification':'pending'},indent=2)+'\n')
(OUT/'capture.json').write_text(json.dumps({'blenderVersion':bpy.app.version_string,'renderer':'Cycles CPU','samples':12,'viewportPx':[720,720],'opaque':True,'captures':captures},indent=2)+'\n')
print('UNION_JUNCTION250_COMPLETE',str(OUT))
