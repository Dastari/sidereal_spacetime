"""Pinned native convex inset family; offline, immutable attempts, no publication.

python3 scripts/art_library/build_convex_inset_boundary.py --revision 0
The wrapper uses dev.toml and scripts.dev.run; Blender is restricted to two threads.
"""
from pathlib import Path
import argparse
import hashlib
import json
import math
import shutil
import struct
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
DESIGN = ROOT / 'assets/art-library/designs/shipyard.structure.convex-inset-boundary'
SPEC = ROOT / 'packages/content/src/ship-tileset-corner-spec.v1.json'
# Exact owner-frozen request, never adjusted by the native author.
SPEC_HASH = '3c94dbaba8dfa33c466c23eb83b6b2a10637d27683b8ce055327000e94be2ac4'
MATERIAL_SOURCE = ROOT / 'assets/art-library/designs/shipyard.structure.inset-boundary-wall/revisions/r005/blender-source.blend'
MATERIAL_HASH = 'ace164e457aa433cc161f318c09f627ae0633c542d41f7d384c5b976707e4b4a'
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()

if 'bpy' not in sys.modules:
    try:
        import bpy
    except ImportError:
        import tomllib
        parser = argparse.ArgumentParser(description=__doc__)
        parser.add_argument('--revision', type=int, required=True)
        args = parser.parse_args()
        assert args.revision >= 0
        out = DESIGN / 'revisions' / f'r{args.revision:03}'
        assert not out.exists(), 'Never overwrite an existing native iteration'
        sys.path.insert(0, str(ROOT))
        from scripts.dev import run
        cfg = tomllib.loads((ROOT / 'dev.toml').read_text())
        run([cfg['art']['blender'], '--background', '--threads', '2', '--python-exit-code', '1',
             '--python', str(Path(__file__).resolve()), '--', str(out)])
        raise SystemExit(0)

import bpy
import bmesh
from mathutils import Vector, Matrix

OUT = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
assert OUT.parent == DESIGN / 'revisions' and not OUT.exists()
assert sha(SPEC) == SPEC_HASH and sha(MATERIAL_SOURCE) == MATERIAL_HASH
OUT.mkdir(parents=True)
(OUT / 'profiles').mkdir()
(OUT / 'fixtures').mkdir()
shutil.copy2(SPEC, OUT / SPEC.name)
shutil.copy2(__file__, OUT / 'recipe.py')
spec = json.loads(SPEC.read_text())
profiles = {p['id']: p for p in spec['profiles']}
TOL = spec['exportToleranceMeters']


def write(name, data):
    (OUT / name).write_text(json.dumps(data, indent=2) + '\n')


def cross(a, b, c):
    return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])


def area(poly):
    return sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(poly,poly[1:]+poly[:1])) / 2


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


def intersection_area(a, b):
    """Convex polygon clipping, used on triangle pairs only."""
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


def point_inside(point, poly, tolerance=TOL):
    # Boundary-inclusive winding; tolerance is distance, not unscaled cross product.
    inside = False
    for a,b in zip(poly,poly[1:]+poly[:1]):
        length=math.dist(a,b)
        if abs(cross(a,b,point)) <= tolerance*length and all(min(a[j],b[j])-tolerance<=point[j]<=max(a[j],b[j])+tolerance for j in range(2)):
            return True
        if (a[1]>point[1]) != (b[1]>point[1]) and point[0] < (b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0]:
            inside = not inside
    return inside


def segment_inside(a, b, poly):
    breaks=[0.0,1.0]
    for c,d in zip(poly,poly[1:]+poly[:1]):
        u=[b[i]-a[i] for i in range(2)]; v=[d[i]-c[i] for i in range(2)]
        det=u[0]*v[1]-u[1]*v[0]
        if abs(det)<1e-14:
            continue
        w=[c[i]-a[i] for i in range(2)]
        t=(w[0]*v[1]-w[1]*v[0])/det
        s=(w[0]*u[1]-w[1]*u[0])/det
        if 0<t<1 and 0<=s<=1:
            breaks.append(t)
    breaks.sort()
    return all(point_inside([a[j]+(b[j]-a[j])*(lo+hi)/2 for j in range(2)],poly)
               for lo,hi in zip(breaks,breaks[1:]))


def audit_polygon_triangle(triangle, poly, cover):
    assert all(point_inside(p,poly) for p in triangle), ('vertex escapes',triangle,poly)
    assert all(segment_inside(a,b,poly) for a,b in zip(triangle,triangle[1:]+triangle[:1])), ('edge bridges notch',triangle,poly)
    actual=abs(area(triangle))
    if actual > 1e-12:
        covered=sum(intersection_area(triangle,t) for t in cover)
        perimeter=sum(math.dist(a,b) for a,b in zip(triangle,triangle[1:]+triangle[:1]))
        assert abs(actual-covered) <= TOL*perimeter, ('face bridges notch',actual,covered)


bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
scene.unit_settings.system='METRIC'
scene.render.engine='CYCLES'
scene.cycles.device='CPU'
scene.cycles.samples=24
scene.cycles.use_denoising=False
scene.render.threads_mode='FIXED';scene.render.threads=2
scene.render.image_settings.file_format='PNG'
scene.render.image_settings.color_mode='RGB'
scene.render.film_transparent=False
scene.view_settings.view_transform='AgX'
with bpy.data.libraries.load(str(MATERIAL_SOURCE),link=False) as (src,dst):
    dst.materials=[n for n in src.materials if n.startswith('MAT-Frontier-side-hull-')]
roles=['pale','dark','steel','red','cyan']
materials=[bpy.data.materials['MAT-Frontier-side-hull-'+r] for r in roles]
collections={}
for name in ['GEO','SOCKETS','COLLISION','LOD','EXPORTED-REVIEW']:
    c=bpy.data.collections.new(name);scene.collection.children.link(c);collections[name]=c


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


def export(obj,path):
    bpy.ops.object.select_all(action='DESELECT');obj.hide_set(False);obj.select_set(True)
    bpy.context.view_layer.objects.active=obj
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_apply=True,export_extras=True,export_yup=True)


def import_glb(path):
    before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(path))
    return list(set(bpy.data.objects)-before)


material_signatures={}; imported_materials={}; results={}; objects={}; exported={}; interfaces={}; captures=[]; fixtures=[]


def audit_export(name,profile,height,source_volume):
    path=OUT/'profiles'/(name+'.glb');raw=path.read_bytes()
    gltf=json.loads(raw[20:20+struct.unpack_from('<I',raw,12)[0]])
    def texture_payloads(data):
        json_length=struct.unpack_from('<I',data,12)[0];doc=json.loads(data[20:20+json_length]);binary=data[28+json_length:]
        def digest(index):
            image=doc['images'][doc['textures'][index]['source']];view=doc['bufferViews'][image['bufferView']]
            start=view.get('byteOffset',0)
            return hashlib.sha256(binary[start:start+view['byteLength']]).hexdigest()
        return {m['name']:{kind:digest(slot['index'])for kind,slot in [
            ('normal',m.get('normalTexture')),('roughnessMetallic',m.get('pbrMetallicRoughness',{}).get('metallicRoughnessTexture'))]if slot}
            for m in doc['materials']}
    target_textures=texture_payloads(raw)
    pinned_textures=texture_payloads((MATERIAL_SOURCE.parent/'straight-2m-q4.glb').read_bytes())
    for key,value in target_textures.items():assert value==pinned_textures[key],(name,key,'texture payload mismatch')
    assert not any('uri' in b for b in gltf.get('buffers',[]))
    assert not any('uri' in i for i in gltf.get('images',[]))
    for material in gltf['materials']:
        material_name=material['name'];assert material_name in [m.name for m in materials]
        assert material.get('alphaMode','OPAQUE')=='OPAQUE'
        sig=json.dumps({k:v for k,v in material.items() if k!='name'},sort_keys=True)
        # Texture indices may differ by material subset; compare physical factors.
        signature={k:v for k,v in material.get('pbrMetallicRoughness',{}).items() if 'Texture' not in k}
        signature.update({k:v for k,v in material.items() if k in ['emissiveFactor','extensions']})
        original=next(m for m in materials if m.name==material_name)
        bsdf=next(n for n in original.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
        assert abs(signature.get('metallicFactor',1)-bsdf.inputs['Metallic'].default_value)<1e-5
        base=signature.get('baseColorFactor',[1,1,1,1]);assert all(abs(a-b)<1e-5 for a,b in zip(base,bsdf.inputs['Base Color'].default_value))
        assert ('normalTexture' in material)==bsdf.inputs['Normal'].is_linked
        assert ('metallicRoughnessTexture' in material['pbrMetallicRoughness'])==bsdf.inputs['Roughness'].is_linked
        if not bsdf.inputs['Roughness'].is_linked:
            assert abs(signature.get('roughnessFactor',1)-bsdf.inputs['Roughness'].default_value)<1e-5
        if material_name in material_signatures:assert signature==material_signatures[material_name]
        material_signatures[material_name]=signature
    nodes=import_glb(path);poly=profile['reservationPolygonM'];cover=[[poly[i]for i in t]for t in ears(poly)]
    top=[];triangles=0;report=[];allpoints=[];source_points=[]
    for node in nodes:
        if node.type!='MESH':continue
        points=[node.matrix_world@v.co for v in node.data.vertices];allpoints.extend(points)
        assert node.data.uv_layers
        assert all(all(math.isfinite(c)for c in p) and -TOL<=p.z<=height+TOL for p in points)
        node.data.calc_loop_triangles()
        for triangle in node.data.loop_triangles:
            pts=[points[i]for i in triangle.vertices];planar=[[p.x,p.y]for p in pts]
            audit_polygon_triangle(planar,poly,cover)
            assert triangle.area>0 and all(math.isfinite(c)for c in triangle.normal)
            if all(abs(p.z-height)<=TOL for p in pts):top.append(planar)
        triangles+=len(node.data.loop_triangles)
        # GLB vertices may split for UV/normal seams; weld for manifold audit only.
        bm=bmesh.new();welded={}
        for triangle in node.data.loop_triangles:
            loop=[]
            for index in triangle.vertices:
                point=points[index];key=tuple(round(v,7)for v in point)
                if key not in welded:welded[key]=bm.verts.new(point)
                loop.append(welded[key])
            bm.faces.new(loop)
        assert all(e.is_manifold for e in bm.edges),(name,'export manifold')
        vol=bm.calc_volume(signed=True);bm.free()
        assert abs(vol-source_volume)<=TOL*max(1,source_volume)*20,(name,'export volume',vol,source_volume)
        report.append({'name':node.name,'triangles':len(node.data.loop_triangles),'volumeM3':vol})
        for slot in node.material_slots:
            rootname=next(m.name for m in materials if slot.material.name.startswith(m.name))
            if rootname in imported_materials:slot.material=imported_materials[rootname]
            else:imported_materials[rootname]=slot.material
        for col in list(node.users_collection):col.objects.unlink(node)
        collections['EXPORTED-REVIEW'].objects.link(node);node.hide_render=True
    assert report
    top_area=sum(abs(area(t))for t in top)
    assert abs(top_area-area(poly))<TOL*max(1,sum(math.dist(a,b)for a,b in zip(poly,poly[1:]+poly[:1])))
    cap_overlap=sum(intersection_area(a,b)for i,a in enumerate(top)for b in top[:i])
    assert cap_overlap<1e-7,(name,'cap overlap',cap_overlap)
    results[name]={'profileId':profile['id'],'heightM':height,'sourceClosedManifold':True,'exportClosedManifold':True,
        'sourceVolumeM3':source_volume,'glbSha256':sha(path),'exportedNodes':report,'triangles':triangles,
        'allExportedFacesAndEdgesInsideProfile':True,'capAreaM2':top_area,'capTriangleOverlapM2':cap_overlap,
        'materialPreservation':'pinned r005 source PBR factors, texture slots, UVs and exact embedded normal/roughness-metallic image payload hashes',
        'texturePayloadSha256':target_textures}
    return nodes,top


scene.world=bpy.data.worlds.new('Neutral opaque world');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.18,.20,.24,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.5
camera=bpy.data.objects.new('CAMERA-native-proof',bpy.data.cameras.new('Native proof'))
scene.collection.objects.link(camera);scene.camera=camera;camera.data.type='ORTHO'
lights=[]
for name,power,size in [('Key',1700,6),('Fill',1100,5),('Rim',1300,4)]:
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size
    o=bpy.data.objects.new('LIGHT-'+name,data);scene.collection.objects.link(o);lights.append(o)


def render(name,nodes,top=False,board=False):
    for obj in scene.objects:
        if obj.type=='MESH':obj.hide_render=True
    for obj in nodes:obj.hide_render=False
    points=[o.matrix_world@Vector(c)for o in nodes if o.type=='MESH'for c in o.bound_box]
    lo=Vector([min(p[i]for p in points)for i in range(3)]);hi=Vector([max(p[i]for p in points)for i in range(3)])
    center=(lo+hi)/2
    if top:camera.location=center+Vector((0,0,20))
    else:camera.location=center+Vector((5,-8,11))
    camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler()
    scene.render.resolution_x=1600 if board else 760;scene.render.resolution_y=1200 if board else 760
    scene.render.resolution_percentage=100
    rotation=camera.rotation_euler.to_matrix().transposed()
    framed=[rotation@(p-center)for p in points]
    width=max(p.x for p in framed)-min(p.x for p in framed)
    height=max(p.y for p in framed)-min(p.y for p in framed)
    camera.data.ortho_scale=max(width,height*(scene.render.resolution_x/scene.render.resolution_y))*1.15
    for light,offset in zip(lights,[(2,-4,8),(-5,-1,6),(3,6,7)]):
        light.location=center+Vector(offset);light.rotation_euler=(center-light.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
    captures.append({'path':name+'.png','sha256':sha(OUT/(name+'.png')),'opaque':True,'kind':'actual Blender render of imported candidate GLBs',
        'cameraM':list(camera.location),'cameraTargetM':list(center),'orthoScaleM':camera.data.ortho_scale,
        'viewportPx':[scene.render.resolution_x,scene.render.resolution_y], 'nodes':[o.name for o in nodes]})
    for obj in nodes:obj.hide_render=True


def inset(poly,thickness):
    lines=[]
    for a,b in zip(poly,poly[1:]+poly[:1]):
        length=math.dist(a,b);n=[-(b[1]-a[1])/length,(b[0]-a[0])/length]
        lines.append((n,sum(n[i]*a[i]for i in range(2))+thickness))
    points=[]
    for i,(a,c)in enumerate(lines):
        b,d=lines[i-1];det=a[0]*b[1]-a[1]*b[0]
        points.append([(c*b[1]-a[1]*d)/det,(a[0]*d-c*b[0])/det])
    return points


floor_nodes={};floor_records={}
for fixture in spec['fixtures']:
    path=ROOT/'assets/art-library/shipyard-floor/r002/variants'/fixture['id']/'model.glb'
    floor_nodes[fixture['id']]=import_glb(path)
    floor_records[fixture['id']]={'path':str(path.relative_to(ROOT)),'sha256':sha(path)}
    for obj in floor_nodes[fixture['id']]:obj.hide_render=True


def make_fixture(fixture,q):
    nodes=[];placed_caps=[];placements=[]
    for kind in ['corners','spans']:
        for index,p in enumerate(fixture[kind]):
            name=p['profileId']+f'-q{q}';protos,caps=exported[name]
            ux,uy=p.get('tangent',[1,0]);x,y=p['originM']
            matrix=Matrix(((ux,-uy,0,x),(uy,ux,0,y),(0,0,1,spec['placementFloorTopM']),(0,0,0,1)))
            for source in protos:
                if source.type!='MESH':continue
                obj=source.copy();obj.name=f'GEO-fixture-{fixture["id"]}-q{q}-{kind}-{index}'
                collections['EXPORTED-REVIEW'].objects.link(obj);obj.matrix_world=matrix@source.matrix_world;obj.hide_render=True;nodes.append(obj)
            transformed=[[[x+ux*a-uy*b,y+uy*a+ux*b]for a,b in tri]for tri in caps]
            placed_caps.append(transformed)
            placements.append({'profileId':p['profileId'],'glbSha256':results[name]['glbSha256'],'transform':list(map(list,matrix))})
    poly=[[x/32,y/32]for x,y in fixture['footprintUnits']];inner=inset(poly,.25)
    overlap=0
    for i,aa in enumerate(placed_caps):
        for bb in placed_caps[:i]:overlap+=sum(intersection_area(a,b)for a in aa for b in bb)
    actual=sum(abs(area(t))for group in placed_caps for t in group);expected=area(poly)-area(inner)
    inner_cover=[[inner[i]for i in tri]for tri in ears(inner)]
    inner_intrusion=sum(intersection_area(t,i)for group in placed_caps for t in group for i in inner_cover)
    assert overlap<1e-6,(fixture['id'],q,'overlap',overlap)
    assert inner_intrusion<1e-6,(fixture['id'],q,'inner intrusion',inner_intrusion)
    assert abs(actual-expected)<1e-6,(fixture['id'],q,'closure',actual,expected)
    outer_cover=[[poly[i]for i in tri]for tri in ears(poly)]
    for triangles in placed_caps:
        for triangle in triangles:audit_polygon_triangle(triangle,poly,outer_cover)
    for source in floor_nodes[fixture['id']]:
        if source.type!='MESH':continue
        obj=source.copy();obj.name=f'GEO-fixture-{fixture["id"]}-q{q}-native-floor';collections['EXPORTED-REVIEW'].objects.link(obj);obj.hide_render=True;nodes.append(obj)
    fixtures.append({'id':fixture['id'],'quarterHeight':q,'heightM':q*.75,'floor':floor_records[fixture['id']],
        'parts':placements,'exportedCapUnionAreaM2':actual,'expectedInsetBandAreaM2':expected,'positiveOverlapM2':overlap,
        'closureAreaErrorM2':actual-expected,'innerIntrusionM2':inner_intrusion,'allExportedFacesInsideFixedFloor':True,
        'qualification':'isolated convex fixture geometry only; no live pressure/collision grant'})
    return nodes


for q in [4,1,2,3]:
    for profile in spec['profiles']:
        name=profile['id']+f'-q{q}';obj,volume=native_mesh(profile,q*.75,name);objects[name]=obj
        export(obj,OUT/'profiles'/(name+'.glb'))
        exported[name]=audit_export(name,profile,q*.75,volume)
        interfaces[name]={'profileId':profile['id'],'heightM':q*.75,'reservationPolygonM':profile['reservationPolygonM'],
            'endProfiles':profile['endProfiles'],'placementFloorTopM':spec['placementFloorTopM'],
            'collision':{'representation':'polygon-prism reservation','qualification':'pending'},
            'bearing':{'bottomZ':0,'topZ':q*.75,'qualification':'pending'},
            'seal':{'qualification':'pending','visualClosedManifold':True},
            'damage':{'qualification':'pending','sampling':'not-created'},'services':{'ports':[],'cyan':'decorative-only'}}
        for i,end in enumerate(profile['endProfiles']):
            empty=bpy.data.objects.new('SOCK-'+name+f'-end{i}',None);collections['SOCKETS'].objects.link(empty)
            empty.location=(*end['pointM'],0);empty['normal']=end['normal'];empty['depthDirection']=end['depthDirection'];empty['heightM']=q*.75
    board=[]
    for i,fixture in enumerate(spec['fixtures']):
        nodes=make_fixture(fixture,q)
        if q==4:render('fixtures/'+fixture['id']+'-q4-close',nodes)
        # Board spacing is presentation-only, never written into mating metadata.
        for node in nodes:node.location+=Vector(((i%4)*5.5,(i//4)*5.5,0))
        board.extend(nodes)
        bpy.ops.object.text_add(location=((i%4)*5.5,(i//4)*5.5-.48,.01))
        label=bpy.context.object;label.name=f'GEO-REVIEW-LABEL-{fixture["id"]}-q{q}'
        label.data.body=fixture['id']+f'  /  {q*.75:g} m';label.data.size=.18
        label.data.materials.append(materials[0]);bpy.ops.object.convert(target='MESH')
        board.append(bpy.context.object)
    render(f'blender-loops-q{q}-top',board,top=True,board=True)
    write('validation-progress.json',{'completedQuarterHeights':[x for x in [4,1,2,3]if x==q or f'{spec["profiles"][0]["id"]}-q{x}'in results], 'profilesCompleted':len(results),'fixturesCompleted':len(fixtures)})
    if q==4:
        bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'full-height-proof.blend'))
        print('FULL_HEIGHT_12_LOOP_PROOF_COMPLETE',flush=True)

# Persistent separate reservation representation in the editable source. It is
# metadata-only, deliberately not passed off as collision or damage geometry.
for name,data in interfaces.items():
    empty=bpy.data.objects.new('PROXY-RESERVATION-'+name,None);collections['COLLISION'].objects.link(empty)
    empty['qualification']='pending';empty['reservation_json']=json.dumps(data)
for obj in scene.objects:
    if obj.type=='MESH':obj.hide_set(not obj.name.startswith('GEO-inset250-span-9f29a130438b-q4'))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'blender-source.blend'))
write('interfaces.json',{'schema':'sidereal.native-convex-inset-interface.v1','specSha256':SPEC_HASH,'pieces':interfaces,'physicalQualification':'pending'})
write('validation.json',{'schema':'sidereal.native-convex-inset-validation.v1','specSha256':SPEC_HASH,'sourceBlendSha256':sha(OUT/'blender-source.blend'),
    'materialSourceSha256':MATERIAL_HASH,'recipeSha256':sha(OUT/'recipe.py'),'exportToleranceM':TOL,'profiles':results,'fixtures':fixtures,
    'materialFactors':material_signatures,'runtimeEvidence':'not captured; no browser slot','ownerApproval':None})
write('capture.json',{'blenderVersion':bpy.app.version_string,'renderer':'Cycles CPU','threads':2,'samples':24,'viewTransform':'AgX','bloom':False,
    'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'specSha256':SPEC_HASH,'captures':captures})
write('delivery-manifest.json',{'approval':'unapproved','files':[{'path':str(p.relative_to(OUT)),'bytes':p.stat().st_size,'sha256':sha(p)}for p in sorted(OUT.rglob('*'))if p.is_file()]})
print('CONVEX_INSET_NATIVE_COMPLETE',str(OUT),flush=True)
