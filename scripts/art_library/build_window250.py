"""Frozen fixed-window native study. Preflight retained exported contacts before authoring.

python3 scripts/art_library/build_window250.py --preflight --revision 0
Every attempt is immutable; this file never edits shared content or publishes assets.
"""
from pathlib import Path
import argparse
import hashlib
import json
import struct

ROOT = Path(__file__).resolve().parents[2]
DESIGN = ROOT / "assets/art-library/designs/shipyard.structure.window250"
SPEC = ROOT / "packages/content/src/ship-tileset-window-spec.v1.json"
SPEC_HASH = "ae9bb7c41779f426c26ec838f6b849f361f80210fd752bfbc2714cbcaafca797"
TOL = 1e-6


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def cross(a, b, c):
    return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])


def area(poly):
    return sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(poly,poly[1:]+poly[:1])) / 2


def intersection_area(a, b):
    clipped = list(a)
    if area(b) < 0:
        b = list(reversed(b))
    for v,w in zip(b,b[1:]+b[:1]):
        old, clipped = clipped, []
        if not old:
            return 0.0
        for p,q in zip(old,old[1:]+old[:1]):
            dp,dq = cross(v,w,p),cross(v,w,q)
            if dp >= 0:
                clipped.append(p)
            if (dp < 0) != (dq < 0):
                t=dp/(dp-dq)
                clipped.append([p[j]+t*(q[j]-p[j]) for j in range(2)])
    return abs(area(clipped)) if len(clipped)>2 else 0.0


def glb_triangles(path, prefix):
    """Decode actual exported mesh triangles in source Blender XYZ (not ideal planes)."""
    raw=Path(path).read_bytes()
    length=struct.unpack_from("<I",raw,12)[0]
    doc=json.loads(raw[20:20+length]); data=raw[28+length:]
    def accessor(index):
        a=doc["accessors"][index];v=doc["bufferViews"][a["bufferView"]]
        fmt={5126:"f",5123:"H",5125:"I"}[a["componentType"]]
        count={"VEC3":3,"SCALAR":1}[a["type"]]
        offset=v.get("byteOffset",0)+a.get("byteOffset",0)
        stride=v.get("byteStride",struct.calcsize(fmt)*count)
        return [struct.unpack_from("<"+fmt*count,data,offset+k*stride) for k in range(a["count"])]
    triangles=[];nodes=[]
    for node in doc["nodes"]:
        if "mesh" not in node or not node.get("name","").startswith(prefix):continue
        assert not any(key in node for key in ["matrix","translation","rotation","scale"]), "Preflight requires applied native transforms"
        nodes.append(node["name"])
        for primitive in doc["meshes"][node["mesh"]]["primitives"]:
            assert primitive.get("mode",4)==4
            vertices=[(v[0],-v[2],v[1]) for v in accessor(primitive["attributes"]["POSITION"])]
            indices=[x[0]for x in accessor(primitive["indices"])]
            triangles.extend([[vertices[i]for i in indices[k:k+3]]for k in range(0,len(indices),3)])
    assert nodes, (path,prefix)
    return triangles,nodes


def preflight(out):
    spec=json.loads(SPEC.read_text())
    assert sha(SPEC)==SPEC_HASH
    for source in spec["sources"]:assert sha(ROOT/source["path"])==source["sha256"]
    floor=ROOT/spec["fixture"]["retainedNativeFamilies"]["floor"]/"glb.glb"
    roof=ROOT/spec["fixture"]["retainedNativeFamilies"]["roof"]/"square-2m.glb"
    patch=[(1,0),(3,0),(3,.25),(1,.25)]
    checks=[]
    for name,path,prefix,z,normal in [("floor",floor,"GEO-part-a3f5c1c3caa171a94d6c--floor",.1875,1),("roof",roof,"GEO",0,-1)]:
        triangles,nodes=glb_triangles(path,prefix)
        cap=[[(v[0],v[1])for v in t]for t in triangles if all(abs(v[2]-z)<=TOL for v in t)]
        coverage=sum(intersection_area([(x+dx,y)for x,y in t],patch)for t in cap for dx in [0,2])
        wrong_normal=sum(intersection_area([(x+dx,y)for x,y in t],patch)for t in cap if area(t)*normal<=0 for dx in [0,2])
        checks.append({"dependency":name,"path":str(path.relative_to(ROOT)),"sha256":sha(path),"nodes":nodes,"nativePlaneZ":z,"capTriangles":len(cap),"capPolygons":cap,"requestedFrameContactPatchXY":patch,"expectedAreaM2":.5,"actualContactAreaM2":coverage,"missingAreaM2":.5-coverage,"wrongNormalContactAreaM2":wrong_normal,"pass":abs(coverage-.5)<=TOL*4.5 and wrong_normal==0})
    report={"schema":"sidereal.window250-native-preflight.v1","specSha256":SPEC_HASH,"distanceToleranceM":TOL,"measurement":"Actual exported coplanar triangle intersection against requested frame bottom/top contact patch; both retained 2m modules placed at X0 and X2. No ideal floor or roof substitute.","checks":checks,"pass":all(c["pass"]for c in checks),"physicalQualification":"unqualified","artApproval":"unapproved"}
    out.mkdir(parents=True,exist_ok=False)
    (out/"preflight.json").write_text(json.dumps(report,indent=2)+"\n")
    (out/SPEC.name).write_bytes(SPEC.read_bytes())
    (out/"recipe.py").write_bytes(Path(__file__).read_bytes())
    print(json.dumps(report,indent=2))


def ears(poly):
    """Deterministic double-precision ear clipping; concave caps stay concave."""
    assert area(poly) > 0
    remaining = list(range(len(poly))); result = []
    while len(remaining) > 3:
        for i, b in enumerate(remaining):
            a, c = remaining[i-1], remaining[(i+1)%len(remaining)]
            if cross(poly[a],poly[b],poly[c]) <= 1e-14:
                continue
            if len(remaining)==4 and abs(area([poly[j]for j in remaining if j!=b]))<=1e-14:
                continue
            if any(all(cross(poly[x],poly[y],poly[j]) >= -1e-14 for x,y in [(a,b),(b,c),(c,a)])
                   for j in remaining if j not in (a,b,c)):
                continue
            result.append([a,b,c]); remaining.pop(i); break
        else:
            raise AssertionError(('Cannot triangulate profile', poly))
    result.append(remaining)
    return result

def native_mesh(profile, height, name):
    poly=profile['reservationPolygonM']; vertices=[];faces=[];mat_ids=[]; shared={}
    def face(points, role):
        indices=[]
        for p in points:
            key=tuple(p)
            if key not in shared:
                shared[key]=len(vertices); vertices.append(key)
            indices.append(shared[key])
        faces.append(indices);mat_ids.append(roles.index(role))
    for tri in ears(poly):
        face([(poly[i][0],poly[i][1],0) for i in reversed(tri)],'steel')
        face([(poly[i][0],poly[i][1],height) for i in tri],'steel')
    for a,b in zip(poly,poly[1:]+poly[:1]):
        length=math.dist(a,b);u=[(b[i]-a[i])/length for i in range(2)];normal=[-u[1],u[0]]
        is_end=any(abs(sum((a[i]-e['pointM'][i])*e['normal'][i] for i in range(2)))<1e-9 and
                   abs(sum((b[i]-e['pointM'][i])*e['normal'][i] for i in range(2)))<1e-9 for e in profile['endProfiles'])
        if 'lengthM' in profile:
            interior=abs(a[1]-.25)<1e-9 and abs(b[1]-.25)<1e-9
        else:
            exterior=any(abs(cross([0,0],ray,a))<1e-9 and abs(cross([0,0],ray,b))<1e-9 for ray in profile['rays'])
            interior=not exterior and not is_end
        if not interior or length<.08:
            face([(a[0],a[1],0),(b[0],b[1],0),(b[0],b[1],height),(a[0],a[1],height)], 'steel' if is_end or not interior else 'pale')
            continue
        nx=max(1,math.ceil(length));nz=round(height/.75)
        def loop(s0,s1,z0,z1,depth):
            return [(a[0]+u[0]*s+normal[0]*depth,a[1]+u[1]*s+normal[1]*depth,z)
                    for s,z in [(s0,z0),(s1,z0),(s1,z1),(s0,z1)]]
        # One continuous editable skin: structural edge stays fixed; authored
        # bevel/recess topology moves inward only. Small spans get narrower rims.
        for ix in range(nx):
            for iz in range(nz):
                s0,s1=length*ix/nx,length*(ix+1)/nx;z0,z1=.75*iz,.75*(iz+1)
                inset=min(.03125,(s1-s0)/8)
                outer=loop(s0,s1,z0,z1,0)
                rim=loop(s0+inset,s1-inset,z0+.03125,z1-.03125,0)
                groove=loop(s0+inset*1.5,s1-inset*1.5,z0+.046875,z1-.046875,.015625)
                panel=loop(s0+inset*2,s1-inset*2,z0+.0625,z1-.0625,.003125)
                for aa,bb,role in [(outer,rim,'pale'),(rim,groove,'dark'),(groove,panel,'pale')]:
                    for i in range(4):
                        j=(i+1)%4
                        face([aa[i],aa[j],bb[j],bb[i]],'cyan' if aa is groove and i==2 and iz==0 else role)
                face(panel,'red' if iz==1 else 'pale')
    # Subdivided side boundaries must share cap/end vertices; split existing
    # edges at authored collinear vertices, avoiding T junctions without nudges.
    mesh=bpy.data.meshes.new('MESH-'+name);mesh.from_pydata(vertices,[],faces)
    for material in materials:mesh.materials.append(material)
    for polygon,material in zip(mesh.polygons,mat_ids):polygon.material_index=material
    bm=bmesh.new();bm.from_mesh(mesh)
    # Use explicit all-face edge splitting to reconcile side-course subdivisions.
    # Each coordinate already has a unique source vertex; face loops are rebuilt
    # below to include boundary vertices on the same segment exactly.
    bm.free()
    newfaces=[]
    for face_ids in faces:
        revised=[]
        for ai,bi in zip(face_ids,face_ids[1:]+face_ids[:1]):
            a,b=vertices[ai],vertices[bi];delta=[b[j]-a[j] for j in range(3)]
            norm=sum(x*x for x in delta); inserts=[]
            for vi,p in enumerate(vertices):
                if vi in (ai,bi):continue
                t=sum((p[j]-a[j])*delta[j] for j in range(3))/norm
                if 1e-10<t<1-1e-10 and sum((p[j]-a[j]-t*delta[j])**2 for j in range(3))<1e-20:
                    inserts.append((t,vi))
            revised.extend([ai]+[vi for _,vi in sorted(inserts)])
        newfaces.append(revised)
    # Explicit triangulation retains every collinear contact-boundary vertex.
    # Blender's generic n-gon tessellator can emit a zero-area cap triangle when
    # a course split lands on a cap edge; never export that degenerate face.
    triangles=[];triangle_materials=[]
    for face_ids,material in zip(newfaces,mat_ids):
        points=[vertices[i]for i in face_ids]
        normal=[sum((a[(j+1)%3]-b[(j+1)%3])*(a[(j+2)%3]+b[(j+2)%3])for a,b in zip(points,points[1:]+points[:1]))for j in range(3)]
        drop=max(range(3),key=lambda j:abs(normal[j]));axes=[j for j in range(3)if j!=drop]
        projected=[[p[j]for j in axes]for p in points]
        if area(projected)<0:
            face_ids=list(reversed(face_ids));projected=list(reversed(projected))
        for tri in ears(projected):
            triangles.append([face_ids[i]for i in tri]);triangle_materials.append(material)
    mesh.clear_geometry();mesh.from_pydata(vertices,[],triangles)
    for polygon,material in zip(mesh.polygons,triangle_materials):polygon.material_index=material
    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    assert all(e.is_manifold for e in bm.edges),(name,'nonmanifold')
    volume=bm.calc_volume(signed=True);assert volume>0
    bm.to_mesh(mesh);bm.free();mesh.update()
    uv=mesh.uv_layers.new(name='UVMap')
    for polygon in mesh.polygons:
        axis=max(range(3),key=lambda j:abs(polygon.normal[j]));axes=[j for j in range(3) if j!=axis]
        for li in polygon.loop_indices:
            p=mesh.vertices[mesh.loops[li].vertex_index].co;uv.data[li].uv=[p[j] for j in axes]
    obj=bpy.data.objects.new('GEO-inset250-'+name,mesh);collections['GEO'].objects.link(obj)
    obj['profile_id']=profile['id'];obj['height_m']=height;obj['spec_sha256']=SPEC_HASH
    obj['geometry_role']='authored-visible-surface';obj['approval']='unapproved'
    obj['physical_qualification']='pending; visual mesh grants no pressure/collision/damage'
    obj.hide_render=True
    return obj,volume

def author(out):
    global bpy,bmesh,Vector,Matrix,materials,roles,collections
    import bpy
    import bmesh
    from mathutils import Vector,Matrix
    global math
    import math
    spec=json.loads(SPEC.read_text());assert sha(SPEC)==SPEC_HASH
    for source in spec['sources']:assert sha(ROOT/source['path'])==source['sha256']
    out.mkdir(parents=True,exist_ok=False)
    (out/'profiles').mkdir();(out/'renders').mkdir()
    (out/SPEC.name).write_bytes(SPEC.read_bytes());(out/'recipe.py').write_bytes(Path(__file__).read_bytes())
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.render.engine='CYCLES'
    scene.cycles.device='CPU';scene.cycles.samples=24;scene.cycles.use_denoising=False;scene.render.threads_mode='FIXED';scene.render.threads=2
    scene.render.film_transparent=False;scene.render.image_settings.color_mode='RGB';scene.render.image_settings.file_format='PNG'
    scene.render.resolution_x=1000;scene.render.resolution_y=800;scene.render.resolution_percentage=100
    scene.view_settings.view_transform='AgX'
    with bpy.data.libraries.load(str(ROOT/spec['sources'][1]['path']),link=False)as(src,dst):
        dst.materials=[n for n in src.materials if n.startswith('MAT-Frontier-side-hull-')]
    with bpy.data.libraries.load(str(ROOT/spec['sources'][2]['path']),link=False)as(src,dst):
        dst.materials=['Blue laminated glazing']
    roles=['pale','dark','steel','red','cyan'];materials=[bpy.data.materials['MAT-Frontier-side-hull-'+r]for r in roles]
    glass=bpy.data.materials['Blue laminated glazing'];collections={}
    for name in ['GEO','EXPORTED-REVIEW']:
        c=bpy.data.collections.new(name);scene.collection.children.link(c);collections[name]=c
    vertices=[];faces=[];ids=[];shared={}
    def face(points,material):
        indices=[]
        for p in points:
            p=tuple(p)
            if p not in shared:shared[p]=len(vertices);vertices.append(p)
            indices.append(shared[p])
        faces.append(indices);ids.append(material)
    xs=[0,.25,1.75,2];zs=[0,.75,2.25,3]
    for ix in range(3):
        for iz in range(3):
            if ix==iz==1:continue
            x0,x1=xs[ix:ix+2];z0,z1=zs[iz:iz+2]
            for y,direction in [(0,1),(.25,-1)]:
                def ring(inset,depth):return [(x,y+direction*depth,z)for x,z in [(x0+inset,z0+inset),(x1-inset,z0+inset),(x1-inset,z1-inset),(x0+inset,z1-inset)]]
                outer=ring(0,0);rim=ring(.03125,0);groove=ring(.046875,.015625);panel=ring(.0625,.003125)
                for a,b,mi in [(outer,rim,0),(rim,groove,1),(groove,panel,0)]:
                    for k in range(4):face([a[k],a[(k+1)%4],b[(k+1)%4],b[k]],4 if a is groove and k==2 and iz==0 else mi)
                face(panel,3 if iz==0 and ix==1 else 0)
            for axis,constant,a,b in [('x',x0,z0,z1),('x',x1,z0,z1),('z',z0,x0,x1),('z',z1,x0,x1)]:
                exterior=(axis=='x'and constant in [0,2])or(axis=='z'and constant in [0,3])
                aperture=(axis=='x'and constant in [.25,1.75]and iz==1)or(axis=='z'and constant in [.75,2.25]and ix==1)
                if exterior or aperture:
                    points=[(constant,y,z)for y,z in [(0,a),(.25,a),(.25,b),(0,b)]]if axis=='x'else[(x,y,constant)for x,y in [(a,0),(b,0),(b,.25),(a,.25)]]
                    face(points,2)
    def finish(name,verts,polys,material_ids,mats):
        mesh=bpy.data.meshes.new('MESH-'+name);mesh.from_pydata(verts,[],polys)
        for m in mats:mesh.materials.append(m)
        for f,mi in zip(mesh.polygons,material_ids):f.material_index=mi
        bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bmesh.ops.triangulate(bm,faces=list(bm.faces))
        assert all(e.is_manifold for e in bm.edges),name
        assert all(f.calc_area()>1e-12 for f in bm.faces),name
        volume=bm.calc_volume(signed=True);assert volume>0
        bm.to_mesh(mesh);bm.free();mesh.update()
        uv=mesh.uv_layers.new(name='UVMap')
        for poly in mesh.polygons:
            drop=max(range(3),key=lambda i:abs(poly.normal[i]));axes=[i for i in range(3)if i!=drop]
            for li in poly.loop_indices:uv.data[li].uv=[mesh.vertices[mesh.loops[li].vertex_index].co[i]for i in axes]
        obj=bpy.data.objects.new('GEO-'+name,mesh);collections['GEO'].objects.link(obj)
        obj['spec_sha256']=SPEC_HASH;obj['approval']='unapproved';obj['physical_qualification']='unqualified'
        return obj,volume
    frame,volume=finish('window-frame-2m',vertices,faces,ids,materials)
    mn=spec['pane']['minM'];mx=spec['pane']['maxM']
    pv=[(x,y,z)for x in [mn[0],mx[0]]for y in [mn[1],mx[1]]for z in [mn[2],mx[2]]]
    pf=[[0,1,3,2],[4,6,7,5],[0,4,5,1],[2,3,7,6],[0,2,6,4],[1,5,7,3]]
    pane,panevolume=finish('window-pane-1.5m',pv,pf,[0]*6,[glass])
    objects={'window-frame-2m':frame,'window-pane-1.5m':pane}
    volumes={'window-frame-2m':volume,'window-pane-1.5m':panevolume}
    for q in range(1,5):
        name=f'window-companion-span-q{q}'
        profile={'id':name,'lengthM':.75,'reservationPolygonM':[[0,0],[.75,0],[.75,.25],[0,.25]],'endProfiles':[{'pointM':[0,0],'normal':[-1,0]},{'pointM':[.75,0],'normal':[1,0]}]}
        obj,v=native_mesh(profile,q*.75,name);objects[name]=obj;volumes[name]=v
    exports={};proof=[]
    for name,obj in objects.items():
        bpy.ops.object.select_all(action='DESELECT');obj.hide_set(False);obj.select_set(True);bpy.context.view_layer.objects.active=obj
        path=out/'profiles'/(name+'.glb')
        bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_apply=True,export_extras=True,export_yup=True)
        exports[name]={'path':str(path.relative_to(ROOT)),'sha256':sha(path),'sourceVolumeM3':volumes[name]}
        triangles,_=glb_triangles(path,'GEO');bm=bmesh.new();vs={}
        for tri in triangles:
            indices=[]
            for p in tri:
                key=tuple(round(v,7)for v in p)
                if key not in vs:vs[key]=bm.verts.new(p)
                indices.append(vs[key])
            bm.faces.new(indices)
        bm.normal_update();assert all(e.is_manifold for e in bm.edges),(name,'export manifold')
        assert all(f.calc_area()>1e-12 for f in bm.faces)
        v=bm.calc_volume(signed=True);assert v>0 and abs(v-volumes[name])<1e-6
        bm.free();exports[name]['exportVolumeM3']=v;exports[name]['triangles']=len(triangles)
        bounds=[(min(p[a]for t in triangles for p in t),max(p[a]for t in triangles for p in t))for a in range(3)]
        exports[name]['boundsM']=bounds
        obj.hide_render=True
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'blender-source.blend'))
    (out/'exports.json').write_text(json.dumps(exports,indent=2)+'\n')
    # Full retained-native fixture is assembled from reimported delivery meshes.
    def imported(path,prefix=None):
        before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(path));nodes=list(set(bpy.data.objects)-before)
        result=[]
        for o in nodes:
            if o.type=='MESH'and(prefix is None or o.name.startswith(prefix)):result.append(o)
            else:bpy.data.objects.remove(o,do_unlink=True)
        for o in result:o.hide_render=True
        return result
    fixture=[];roofnodes=[];dependencies=[]
    def add(path,origin=(0,0,0),angle=0,prefix=None):
        nodes=imported(path,prefix);matrix=Matrix.Translation(Vector(origin))@Matrix.Rotation(angle,4,'Z')
        for o in nodes:o.matrix_world=matrix@o.matrix_world
        dependencies.append({'path':str(path.relative_to(ROOT)),'sha256':sha(path),'originM':origin,'yawRadians':angle,'nodes':[o.name for o in nodes]})
        fixture.extend(nodes);return nodes
    floors=ROOT/spec['fixture']['retainedNativeFamilies']['floor']/'glb.glb'
    roofs=ROOT/spec['fixture']['retainedNativeFamilies']['roof']/'square-2m.glb'
    for x in [0,2]:
        add(floors,(x,0,0),prefix='GEO-part-a3f5c1c3caa171a94d6c--floor')
        roofnodes.extend(add(roofs,(x,0,3.1875)))
    for name in ['window-frame-2m','window-pane-1.5m']:add(out/'profiles'/(name+'.glb'),(1,0,.1875))
    for origin in spec['fixture']['companionOriginsM']:add(out/'profiles/window-companion-span-q4.glb',origin)
    convex=ROOT/spec['fixture']['retainedNativeFamilies']['convex'];corner_spec=json.loads((ROOT/'packages/content/src/ship-tileset-corner-spec.v1.json').read_text())
    for corner in spec['fixture']['corners']:add(convex/'profiles'/(corner['profileId']+'-q4.glb'),(*corner['originM'],.1875))
    for span in spec['fixture']['remainingSpans']:
        profile=next(p for p in corner_spec['profiles']if p.get('lengthM')==span['lengthM'])
        add(convex/'profiles'/(profile['id']+'-q4.glb'),(*span['originM'],.1875),span['quarterTurns']*math.pi/2)
    (out/'dependencies.json').write_text(json.dumps(dependencies,indent=2)+'\n')
    scene.world=bpy.data.worlds.new('Opaque neutral environment');scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.18,.20,.24,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.6
    camera=bpy.data.objects.new('CAMERA-window-review',bpy.data.cameras.new('Window review'));scene.collection.objects.link(camera);scene.camera=camera;camera.data.type='ORTHO'
    lights=[]
    for i,offset in enumerate([(1,-4,7),(-3,4,6),(5,4,5)]):
        data=bpy.data.lights.new('AREA-'+str(i),'AREA');data.energy=1100;data.size=5
        o=bpy.data.objects.new(data.name,data);scene.collection.objects.link(o);o.location=offset;lights.append(o)
    def render(name,nodes,target,offset,scale):
        for o in list(objects.values())+fixture:o.hide_render=True
        for o in nodes:o.hide_render=False
        camera.location=Vector(target)+Vector(offset);camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler()
        camera.data.type='PERSP' if name=='fixture-roof-off-interior' else 'ORTHO';camera.data.lens=14;camera.data.clip_start=.01
        bpy.context.view_layer.update()
        points=[o.matrix_world@Vector(v)for o in nodes for v in o.bound_box]
        rotation=camera.rotation_euler.to_matrix().transposed();projected=[rotation@(v-Vector(target))for v in points]
        width=max(v.x for v in projected)-min(v.x for v in projected);height=max(v.y for v in projected)-min(v.y for v in projected)
        camera.data.ortho_scale=max(scale,width*1.15,height*scene.render.resolution_x/scene.render.resolution_y*1.15)
        for o in lights:o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath=str(out/'renders'/(name+'.png'));bpy.ops.render.render(write_still=True)
        proof.append({'id':name,'path':'renders/'+name+'.png','sha256':sha(out/'renders'/(name+'.png')),'opaqueBackground':True,'nativeGlassMaterialUnchanged':True})
    render('frame-pane-exterior',[frame,pane],(1,.125,1.5),(4,-8,3),4.5)
    render('frame-pane-interior',[frame,pane],(1,.125,1.5),(-4,8,3),4.5)
    render('fixture-roof-off-exterior',[o for o in fixture if o not in roofnodes],(2,1,1.5),(5,-9,6),7)
    render('fixture-roof-off-interior',[o for o in fixture if o not in roofnodes],(2,0,1.6875),(0,1.65,0),3.6)
    render('fixture-roof-on',fixture,(2,1,1.5),(5,-9,6),7)
    for q in range(1,5):
        render(f'companion-q{q}',[objects[f'window-companion-span-q{q}']],(.375,.125,.375*q),(4,8,4),max(1.5,.9*q))
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'review-scene.blend'))
    (out/'captures.json').write_text(json.dumps(proof,indent=2)+'\n')


if __name__=="__main__":
    import sys
    if "--" in sys.argv:
        author(Path(sys.argv[sys.argv.index("--")+1]))
    else:
        parser=argparse.ArgumentParser(description=__doc__)
        parser.add_argument("--preflight",action="store_true")
        parser.add_argument("--revision",type=int,required=True)
        args=parser.parse_args();assert args.revision>=0
        out=DESIGN/"revisions"/f"r{args.revision:03}"
        assert not out.exists(), "Never overwrite a native iteration"
        if args.preflight:preflight(out)
        else:
            import tomllib
            sys.path.insert(0,str(ROOT))
            from scripts.dev import run
            cfg=tomllib.loads((ROOT/"dev.toml").read_text())
            run([cfg["art"]["blender"],"--background","--threads","2","--python-exit-code","1","--python",str(Path(__file__).resolve()),"--",str(out)])
