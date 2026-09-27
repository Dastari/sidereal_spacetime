"""Offline native 125 mm roof family, preserving every output revision.

blender -b -t 2 --python scripts/art_library/build_roof125.py -- NEW_DIRECTORY
"""
import bpy, bmesh, json, math, hashlib, struct, shutil, sys, subprocess
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[2]
OUT=Path(sys.argv[sys.argv.index('--')+1]).resolve()
assert not OUT.exists(), 'Use a new revision; never overwrite'
OUT.mkdir(parents=True)
SPEC=ROOT/'packages/content/src/ship-tileset-roof-spec.v1.json'
SOURCE=ROOT/'assets/art-library/designs/shipyard.structure.roof-kit/revisions/r001/roof-kit.blend'
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
assert sha(SPEC)=='134749324f164c65eadbc979cf52472687a0e988a31970d4bea810874e02195c'
assert sha(SOURCE)=='e3ff6410c70fcef0dc2015beff2dda942c24ead86b09c19e41d342f75adeba7c'
spec=json.loads(SPEC.read_text())
shutil.copy2(SPEC,OUT/SPEC.name);shutil.copy2(__file__,OUT/'recipe.py')
bpy.ops.wm.read_factory_settings(use_empty=True)
S=bpy.context.scene;S.unit_settings.system='METRIC';S.unit_settings.scale_length=1
with bpy.data.libraries.load(str(SOURCE),link=False) as (src,dst):
    dst.materials=[n for n in src.materials if n.startswith('MAT-roof-')]
roles=['structural-core','pale-enamel','dark-service','wine-paint','steel','cyan','ceiling']
mats=[bpy.data.materials['MAT-roof-'+r] for r in roles]
collections={}
for name in ['GEO','SOCKETS','COLLISION','LOD']:
    c=bpy.data.collections.new(name);S.collection.children.link(c);collections[name]=c

def area(p):return sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(p,p[1:]+p[:1]))/2
def cross(a,b,p):return (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])
def clip(p,a,b):
    out=[]
    for u,v in zip(p,p[1:]+p[:1]):
        du=cross(a,b,u);dv=cross(a,b,v)
        if du>=-1e-12:out.append(u)
        if (du>0 and dv<0) or (du<0 and dv>0):
            t=du/(du-dv);out.append((u[0]+t*(v[0]-u[0]),u[1]+t*(v[1]-u[1])))
    cleaned=[]
    for q in out:
        q=tuple(round(v,12) for v in q)
        if not cleaned or math.dist(cleaned[-1],q)>1e-10:cleaned.append(q)
    if len(cleaned)>1 and math.dist(cleaned[0],cleaned[-1])<1e-10:cleaned.pop()
    return cleaned

def author(shape):
    polygon=[tuple(v/32 for v in xy) for xy in shape['footprintUnits']]
    verts=[];indices={};faces=[];material_ids=[]
    def loop(poly,z,scale=1):
        cx=sum(v[0] for v in poly)/len(poly);cy=sum(v[1] for v in poly)/len(poly)
        result=[]
        for x,y in poly:
            v=(round(cx+(x-cx)*scale,12),round(cy+(y-cy)*scale,12),z)
            if v not in indices:indices[v]=len(verts);verts.append(v)
            result.append(indices[v])
        return result
    def face(ids,role):faces.append(ids);material_ids.append(roles.index(role))
    def band(a,b,role,cyan=False):
        for i in range(len(a)):
            j=(i+1)%len(a);face([a[i],a[j],b[j],b[i]],'cyan' if cyan and i==0 else role)
    # Fresh surface topology for the 4u roof, not a vertical scaling of the old6u roof.
    # Each clipped course has inward decorative grooves above a continuous backing.
    service_authored=False
    for ix in range(math.ceil(max(p[0] for p in polygon))):
        for iy in range(math.ceil(max(p[1] for p in polygon))):
            p=[(ix,iy),(ix+1,iy),(ix+1,iy+1),(ix,iy+1)]
            for a,b in zip(polygon,polygon[1:]+polygon[:1]):
                p=clip(p,a,b)
                if not p:break
            if len(p)<3 or area(p)<1e-9:continue
            back=loop(p,0);edge=loop(p,.125)
            rim=loop(p,.125,.94);groove=loop(p,.109375,.90);panel=loop(p,.12109375,.87)
            face(back[::-1],'ceiling')
            for i,(a,b) in enumerate(zip(p,p[1:]+p[:1])):
                if any(abs(cross(u,v,a))<1e-10 and abs(cross(u,v,b))<1e-10 for u,v in zip(polygon,polygon[1:]+polygon[:1])):
                    j=(i+1)%len(p);face([back[i],back[j],edge[j],edge[i]],'structural-core')
            band(edge,rim,'steel');band(rim,groove,'dark-service');band(groove,panel,'pale-enamel')
            if not service_authored and area(p)>.18:
                # Shallow inset maintenance hatch, an enclosed part of the same surface.
                patch=loop(p,.12109375,.30);lip=loop(p,.115234375,.27);hatch=loop(p,.119140625,.24)
                band(panel,patch,'pale-enamel');band(patch,lip,'dark-service',cyan=True)
                band(lip,hatch,'wine-paint');face(hatch,'wine-paint');service_authored=True
            else:face(panel,'pale-enamel')
    mesh=bpy.data.meshes.new('MESH-roof125-'+shape['id']);mesh.from_pydata(verts,[],faces)
    for m in mats:mesh.materials.append(m)
    for f,m in zip(mesh.polygons,material_ids):f.material_index=m
    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    assert all(e.is_manifold for e in bm.edges),(shape['id'],'nonmanifold')
    volume=bm.calc_volume(signed=True);assert volume>0
    bm.to_mesh(mesh);bm.free();mesh.update()
    uv=mesh.uv_layers.new(name='UVMap')
    for f in mesh.polygons:
        axis=max(range(3),key=lambda a:abs(f.normal[a]));axes=[a for a in range(3) if a!=axis]
        for li in f.loop_indices:
            co=mesh.vertices[mesh.loops[li].vertex_index].co
            uv.data[li].uv=(co[axes[0]],co[axes[1]])
    obj=bpy.data.objects.new('GEO-roof125-'+shape['id'],mesh);collections['GEO'].objects.link(obj)
    obj['native_spec_sha256']=sha(SPEC);obj['art_approval']='unapproved';obj['placement_underside_m']=3.1875
    obj['source_frame']='Blender XY footprint; Z up; metres'
    return obj,polygon,volume

objects={};polygons={};validation={};interfaces={}
for shape in spec['shapes']:
    sid=shape['id'];obj,p,volume=author(shape);objects[sid]=obj;polygons[sid]=p
    n=len(p);pv=[(x,y,z) for z in [0,.125] for x,y in p]
    pf=[list(range(n-1,-1,-1)),list(range(n,n*2))]+[[i,(i+1)%n,(i+1)%n+n,i+n] for i in range(n)]
    pm=bpy.data.meshes.new('PROXY-'+sid);pm.from_pydata(pv,[],pf)
    po=bpy.data.objects.new('PROXY-roof125-'+sid,pm);collections['COLLISION'].objects.link(po)
    po.hide_render=True;po.hide_set(True);po['qualification']='pending conservative polygon extrusion'
    contacts=[]
    for i,(a,b) in enumerate(zip(p,p[1:]+p[:1])):
        dx=b[0]-a[0];dy=b[1]-a[1];length=math.hypot(dx,dy);normal=[dy/length,-dx/length,0]
        e=bpy.data.objects.new(f'SOCK-{sid}-edge-{i}',None);collections['SOCKETS'].objects.link(e)
        e.location=((a[0]+b[0])/2,(a[1]+b[1])/2,.0625);e['normal']=normal;e['profile']=spec['profiles']['edge']
        contacts.append({'id':i,'startM':[*a,0],'endM':[*b,0],'heightM':.125,'normal':normal,'profile':spec['profiles']['edge']})
    interfaces[sid]={'footprintM':p,'reservationZ':[0,.125],'placementUndersideM':3.1875,'edgeContacts':contacts,
        'bearing':{'zM':0,'normal':[0,0,-1],'profile':spec['profiles']['bearing'],'coverage':'full footprint'},
        'top':{'zM':.125,'profile':spec['profiles']['top']},
        'seal':{'continuousBackingMinHeightM':.109375,'compartmentQualification':'pending'},
        'collision':{'proxy':'conservative polygon extrusion','qualification':'pending'},
        'damage':{'sampling':'not-created','qualification':'pending'},'service':{'ports':[],'hatch':'decorative-only'}}
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.export_scene.gltf(filepath=str(OUT/(sid+'.glb')),export_format='GLB',use_selection=True,
        export_apply=True,export_extras=True,export_yup=True,export_tangents=True)
    validation[sid]={'sourceVertices':len(obj.data.vertices),'sourceTriangles':sum(len(f.vertices)-2 for f in obj.data.polygons),
        'closedManifold':True,'volumeM3':volume,'glbSha256':sha(OUT/(sid+'.glb'))}

def image_upstream(node):
    if node.type=='TEX_IMAGE':return node.image
    return next(image_upstream(i.links[0].from_node) for i in node.inputs if i.is_linked)

for sid,obj in objects.items():
    raw=(OUT/(sid+'.glb')).read_bytes();g=json.loads(raw[20:20+struct.unpack_from('<I',raw,12)[0]])
    assert all('uri' not in image for image in g.get('images',[]))
    before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(OUT/(sid+'.glb')))
    imported=set(bpy.data.objects)-before;nodes=[];material_checks=[]
    for o in imported:
        if o.type!='MESH':continue
        points=[o.matrix_world@v.co for v in o.data.vertices]
        for v in points:
            assert all(math.isfinite(x) for x in v)
            assert -1e-6<=v.z<=.125+1e-6,(sid,'height',list(v))
            for a,b in zip(polygons[sid],polygons[sid][1:]+polygons[sid][:1]):
                assert cross(a,b,v)>=-1e-6*math.dist(a,b),(sid,'footprint',list(v))
        assert o.data.uv_layers
        nodes.append({'name':o.name,'vertices':len(points),'triangles':sum(len(f.vertices)-2 for f in o.data.polygons),
            'minM':[min(v[i] for v in points) for i in range(3)],'maxM':[max(v[i] for v in points) for i in range(3)]})
        for m in o.data.materials:
            original=next(x for x in mats if m.name.startswith(x.name))
            a=next(x for x in original.node_tree.nodes if x.type=='BSDF_PRINCIPLED')
            b=next(x for x in m.node_tree.nodes if x.type=='BSDF_PRINCIPLED')
            gm=next(x for x in g['materials'] if x['name']==original.name)
            assert abs(gm['pbrMetallicRoughness'].get('metallicFactor',1)-a.inputs['Metallic'].default_value)<1e-5
            for key in ['Base Color','Roughness','Emission Color','Emission Strength']:
                if a.inputs[key].is_linked:
                    assert b.inputs[key].is_linked
                    ai=image_upstream(a.inputs[key].links[0].from_node);bi=image_upstream(b.inputs[key].links[0].from_node)
                    assert tuple(ai.size)==tuple(bi.size)
                    av=list(ai.pixels);bv=list(bi.pixels)
                    if key=='Roughness':assert max(abs(av[i]-bv[i+1]) for i in range(0,len(av),4))<.005
                    else:assert max(abs(x-y) for x,y in zip(av,bv))<.005
                else:
                    av=a.inputs[key].default_value;bv=b.inputs[key].default_value
                    av=list(av) if hasattr(av,'__len__') else [av];bv=list(bv) if hasattr(bv,'__len__') else [bv]
                    assert all(abs(x-y)<1e-5 for x,y in zip(av,bv)),(sid,key,av,bv)
            if a.inputs['Normal'].is_linked:
                an=a.inputs['Normal'].links[0].from_node;bn=b.inputs['Normal'].links[0].from_node
                assert an.type==bn.type=='NORMAL_MAP'
                assert abs(an.inputs['Strength'].default_value-bn.inputs['Strength'].default_value)<1e-5
                ai=image_upstream(an.inputs['Color'].links[0].from_node);bi=image_upstream(bn.inputs['Color'].links[0].from_node)
                assert tuple(ai.size)==tuple(bi.size)
                assert max(abs(x-y) for x,y in zip(ai.pixels,bi.pixels))<1e-5
            material_checks.append(original.name)
    assert nodes
    validation[sid].update(allExportedNodeContainment=True,exportedNodes=nodes,materialsVerified=sorted(set(material_checks)),
        primitiveCount=sum(len(m['primitives']) for m in g['meshes']),materialCount=len(g['materials']),
        textureCount=len(g.get('textures',[])),embeddedImages=len(g.get('images',[])),externalResources=False)
    for o in imported:bpy.data.objects.remove(o,do_unlink=True)

for o in objects.values():o.hide_render=True
S.render.engine='CYCLES';S.cycles.device='CPU';S.cycles.samples=24;S.cycles.use_denoising=False
S.render.resolution_x=900;S.render.resolution_y=900;S.render.resolution_percentage=100
S.render.image_settings.file_format='PNG';S.render.image_settings.color_mode='RGBA';S.render.film_transparent=False
S.view_settings.view_transform='AgX'
S.world=bpy.data.worlds.new('Neutral opaque studio');S.world.use_nodes=True
S.world.node_tree.nodes['Background'].inputs[0].default_value=(.12,.15,.20,1)
S.world.node_tree.nodes['Background'].inputs[1].default_value=.5
lights=[]
for name,pos,power,size in [('key',(2,-4,7),1300,5),('fill',(-3,4,5),800,4),('underside',(2,-3,-6),1000,5)]:
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size
    o=bpy.data.objects.new('LIGHT-'+name,d);S.collection.objects.link(o);o.location=pos
    o.rotation_euler=(Vector((1,1,.0625))-o.location).to_track_quat('-Z','Y').to_euler()
    lights.append({'name':name,'positionM':pos,'power':power,'sizeM':size})
cam=bpy.data.objects.new('CAMERA-review',bpy.data.cameras.new('review'));S.collection.objects.link(cam);S.camera=cam
cam.data.type='ORTHO';captures=[]
def capture(name,target,extent,elevation=50):
    el=math.radians(elevation);az=math.radians(-60);t=Vector(target)
    cam.location=t+Vector((8*math.cos(el)*math.cos(az),8*math.cos(el)*math.sin(az),8*math.sin(el)))
    cam.rotation_euler=(t-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=extent*1.5
    S.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
    captures.append({'file':name+'.png','sha256':sha(OUT/(name+'.png')),'cameraM':list(cam.location),
        'targetM':target,'elevationDeg':elevation,'azimuthDeg':-60,'orthoScaleM':cam.data.ortho_scale,
        'visibleMeshes':[o.name for o in S.objects if o.type=='MESH' and not o.hide_render]})
for sid,obj in objects.items():
    obj.hide_render=False;p=polygons[sid];cx=(min(v[0] for v in p)+max(v[0] for v in p))/2
    cy=(min(v[1] for v in p)+max(v[1] for v in p))/2;extent=max(max(v[0] for v in p)-min(v[0] for v in p),max(v[1] for v in p)-min(v[1] for v in p))
    capture('individual-'+sid,[cx,cy,.0625],extent)
    capture('top-'+sid,[cx,cy,.0625],extent,90)
    capture('underside-'+sid,[cx,cy,.0625],extent,-55)
    obj.hide_render=True
seams=[]
for name,first,second,translation,rotation,target,extent,edge in [
    ('square','square-2m','square-2m',(2,0,0),0,[2,1,.0625],4,[[2,0],[2,2]]),
    ('diagonal','triangle-45','triangle-45',(2,2,0),math.pi,[1,1,.0625],2,[[2,0],[0,2]]),
    ('taper','taper-4m','square-2m',(0,-2,0),0,[1,1,.0625],6,[[0,0],[2,0]])]:
    a=objects[first];a.hide_render=False;b=objects[second].copy();b.data=objects[second].data.copy()
    b.name='GEO-seam-'+name+'-second';collections['GEO'].objects.link(b);b.hide_render=False
    b.location=translation;b.rotation_euler.z=rotation
    capture('seam-'+name+'-oblique',target,extent)
    capture('seam-'+name+'-top',target,extent,90)
    seams.append({'id':name,'first':first,'second':second,'translationM':translation,'rotationRad':rotation,
        'contactEdgeXYM':edge,'nominalGapM':0,'nominalOverlapM3':0,'qualification':'native contact study only'})
    a.hide_render=True;bpy.data.objects.remove(b,do_unlink=True)
objects['square-2m'].hide_render=False
for o in objects.values():o.hide_set(o.name!='GEO-roof125-square-2m')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'blender-source.blend'))
(OUT/'interfaces.json').write_text(json.dumps({'schema':'sidereal.roof125-native-study.v1','specSha256':sha(SPEC),'pieces':interfaces,'seams':seams},indent=2)+'\n')
(OUT/'validation.json').write_text(json.dumps({'specSha256':sha(SPEC),'materialSource':str(SOURCE.relative_to(ROOT)),
    'materialSourceSha256':sha(SOURCE),'nativeBlendSha256':sha(OUT/'blender-source.blend'),'recipeSha256':sha(OUT/'recipe.py'),
    'exportToleranceM':1e-6,'pieces':validation,'approval':'unapproved','gameplayQualification':'pending'},indent=2)+'\n')
(OUT/'capture.json').write_text(json.dumps({'blenderVersion':bpy.app.version_string,'renderer':'Cycles CPU','samples':24,
    'viewportPx':[900,900],'opaqueBackground':True,'viewTransform':'AgX','lights':lights,
    'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'captures':captures},indent=2)+'\n')
print('ROOF125_COMPLETE',str(OUT))
