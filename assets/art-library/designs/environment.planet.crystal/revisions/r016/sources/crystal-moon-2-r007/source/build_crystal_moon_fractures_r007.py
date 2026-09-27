"""Native r007: replace selected panel districts with connected bent fracture runs."""
import bpy,bmesh,json,math,shutil,hashlib,sys,struct
from pathlib import Path
from mathutils import Vector
from mathutils.geometry import tessellate_polygon
ROOT=Path('/root/sidereal_spacetime');BASE=ROOT/'output/playwright/planet-reference-20260914'
moon=int(sys.argv[sys.argv.index('--')+1]);assert moon in (1,2)
old=BASE/f'crystal-moon-{moon}-r005';out=BASE/f'crystal-moon-{moon}-r007';assert not(out/'kit.blend').exists();out.mkdir(exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(old/'kit.blend'));body=next(o for o in bpy.data.objects if o.type=='MESH');materials=list(body.data.materials)
kit=json.loads((old/'kit.json').read_text());original=json.loads((old/'kit.json').read_text())['variants'][0]
parent=json.loads((old/'orientation-validation.json').read_text());panels=parent['panels'];records=[]
# Three independently placed regional fractures, shared across adjacent districts.
regions=[{'axis':(1,-.82,.14),'run':(.05,.18,1),'anchor':(1,1,.35),'offset':.12,'width':.095},
         {'axis':(.18,1,-.51),'run':(1,-.12,.12),'anchor':(.15,.4,1),'offset':.03,'width':.083},
         {'axis':(.58,.22,1),'run':(-.3,1,.1),'anchor':(-1,-.3,.2),'offset':-.08,'width':.073}]
selected=[]
for panel in panels:
 face=body.data.polygons[max(panel['sourcePolygons'])];points=[body.data.vertices[i].co.copy()for i in face.vertices];center=sum(points,Vector())/len(points);normal=face.normal.normalized()
 options=[]
 for index,region in enumerate(regions):
  axis=Vector(region['axis']).normalized();anchor=Vector(region['anchor']).normalized();values=[p.dot(axis)-region['offset'] for p in points]
  if center.normalized().dot(anchor)>.35 and min(values)<region['width']+.06 and max(values)>-region['width']-.06:
   options.append((abs(center.dot(axis)-region['offset']),index))
 if options:selected.append((panel,min(options)[1],points,center,normal))
removed=set(i for panel,*_ in selected for i in panel['sourcePolygons'])
variant={k:[] for k in ['positions','normals','uvs','indices','triangleMaterials']};variant['name']='connected-crystalline-body'
for triangle,source_polygon in enumerate(parent['sourcePolygonPerTriangle']):
 if source_polygon in removed:continue
 for k in range(3):
  i=original['indices'][triangle*3+k];variant['positions'].extend(original['positions'][i*3:i*3+3]);variant['normals'].extend(original['normals'][i*3:i*3+3]);variant['uvs'].extend(original['uvs'][i*2:i*2+2]);variant['indices'].append(len(variant['indices']))
 variant['triangleMaterials'].append(original['triangleMaterials'][triangle])
base_triangles=len(variant['indices'])//3
# Source edit: remove only the selected panel shells; keep all other source
# coordinates/corner attributes. Native polygon identity survives renumbering.
bm=bmesh.new();bm.from_mesh(body.data);bm.faces.ensure_lookup_table();layer=bm.faces.layers.int.new('r005_source_polygon')
for i,f in enumerate(bm.faces):f[layer]=i
bmesh.ops.delete(bm,geom=[bm.faces[i]for i in sorted(removed)],context='FACES_ONLY');bm.to_mesh(body.data);bm.free()
cache=bpy.data.texts.get('r005-exact-native-triangle-export-cache.json')
if cache:
 data=json.loads(cache.as_string());keep=[i for i,p in enumerate(data['sourcePolygonPerTriangle'])if p not in removed]
 data['sourceVertexTriangles']=[data['sourceVertexTriangles'][i]for i in keep];data['sourcePolygonPerTriangle']=[data['sourcePolygonPerTriangle'][i]for i in keep];data['triangleMaterials']=[data['triangleMaterials'][i]for i in keep]
 for key in ['cornerUVs','signedCornerNormals']:data[key]=[v for i in keep for v in data[key][i*3:i*3+3]]
 data['source']='r005 unselected native polygons only; original polygon IDs retained in face attribute';cache.clear();cache.write(json.dumps(data))

def clip(points,axis,limit,greater):
 if not points:return []
 result=[]
 for a,b in zip(points,points[1:]+points[:1]):
  da=a.dot(axis)-limit;db=b.dot(axis)-limit;ia=da>=-1e-8 if greater else da<=1e-8;ib=db>=-1e-8 if greater else db<=1e-8
  if ia:result.append(a)
  if ia!=ib:result.append(a.lerp(b,da/(da-db)))
 return result
for panel,region_id,points,center,normal in selected:
 region=regions[region_id];axis=Vector(region['axis']).normalized();run=Vector(region['run']).normalized();u=(points[1]-points[0]).normalized();v=normal.cross(u).normalized()
 # The selected native cap district is explicitly reauthored as one broad
 # planar fracture surface; its predecessor is removed, never hidden beneath.
 footprint=[center+(p-center).dot(u)*u+(p-center).dot(v)*v for p in points]
 footprint=[center+(p-center)*1.043 for p in footprint]
 source_tris=tessellate_polygon([footprint]);serial=0
 for section,(low,high,shift)in enumerate([(-10,-.22,-.045),(-.22,.29,.072),(.29,10,-.025)]):
  for band,(lower,upper,height)in enumerate([(-10,-region['width'],-.014),(-region['width'],region['width'],-.090),(region['width'],10,[.040,.092,.055][section])]):
   topmesh=bmesh.new()
   for triangle in source_tris:
    poly=[footprint[i].copy() if isinstance(i,int) else i.copy() for i in triangle]
    for direction,limit,greater in [(run,low,True),(run,high,False),(axis,lower+region['offset']+shift,True),(axis,upper+region['offset']+shift,False)]:poly=clip(poly,direction,limit,greater)
    if len(poly)<3:continue
    try:topmesh.faces.new([topmesh.verts.new(p)for p in poly])
    except ValueError:continue
   if not topmesh.faces:topmesh.free();continue
   bmesh.ops.remove_doubles(topmesh,verts=list(topmesh.verts),dist=1e-6)
   for edge in list(topmesh.edges):
    if edge.is_valid and len(edge.link_faces)==2:
     try:bmesh.ops.dissolve_edges(topmesh,edges=[edge],use_verts=False,use_face_split=False)
     except ValueError:pass
   contours=[[vert.co.copy()for vert in face.verts]for face in topmesh.faces if face.calc_area()>1e-8];topmesh.free()
   if not contours:continue
   vertices=[];faces=[];topfaces=[]
   for contour in contours:
    start=len(vertices);n=len(contour);vertices.extend([p-normal*.23 for p in contour]);vertices.extend([p+normal*height for p in contour]);faces.append([start+i for i in reversed(range(n))]);topfaces.append(len(faces));faces.append([start+n+i for i in range(n)])
    faces.extend([[start+i,start+(i+1)%n,start+n+(i+1)%n,start+n+i]for i in range(n)])
   mesh=bpy.data.meshes.new(f'native-regional-fracture-{region_id}-panel-{panel["panel"]}-section-{section}-band-{band}');mesh.from_pydata(vertices,[],faces);mesh.update()
   obj=bpy.data.objects.new('GEO-'+mesh.name,mesh);bpy.context.scene.collection.objects.link(obj)
   for material in materials:mesh.materials.append(material)
   bright=band==2 and section==1 and region_id in ([0,1]if moon==2 else [1]) and center.z>.10
   top_role=5 if band==1 else(6 if bright else(4 if panel['panel']%7==0 else 3))
   for p in mesh.polygons:p.material_index=top_role if p.index in topfaces else(7 if band==1 and p.index%3==0 else(5 if p.index%2==0 else 3))
   bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));assert all(e.is_manifold for e in bm.edges);assert bm.calc_volume(signed=True)>0;bm.to_mesh(mesh);bm.free()
   uv=mesh.uv_layers.new(name='UVMap')
   for face in mesh.polygons:
    for loop in face.loop_indices:
     p=mesh.vertices[mesh.loops[loop].vertex_index].co;uv.data[loop].uv=(p.dot(u)*1.4+.5,p.dot(v)*1.4+.5)
   mesh.calc_loop_triangles();first=len(variant['indices'])//3
   for tri in mesh.loop_triangles:
    for vertex,loop in zip(tri.vertices,tri.loops):
     variant['positions'].extend(mesh.vertices[vertex].co);variant['normals'].extend(mesh.corner_normals[loop].vector);variant['uvs'].extend((uv.data[loop].uv.x,1-uv.data[loop].uv.y));variant['indices'].append(len(variant['positions'])//3-1)
    variant['triangleMaterials'].append(tri.material_index)
   part=f'planets--crystal-moon-{moon}/regional-fracture-{region_id}/panel-{panel["panel"]}/section-{section}/band-{band}';obj['partId']=part;obj['role']='planet'
   records.append({'partId':part,'region':region_id,'sourcePanel':panel['panel'],'section':section,'band':band,'height':height,'firstTriangle':first,'triangleCount':len(mesh.loop_triangles),'topMaterial':top_role})
kit['variants']=[variant];kit['nativePartRanges']=[{'partId':f'planets--crystal-moon-{moon}/native-body','firstTriangle':0,'triangleCount':base_triangles}]+records
kit['sourceReuse']={'parent':str(old/'kit.blend'),'parentSha256':hashlib.sha256((old/'kit.blend').read_bytes()).hexdigest(),'geometry':'Unselected r005 native panels unchanged; selected shells removed and reauthored as continuous bent regional fracture runs'}
(out/'kit.json').write_text(json.dumps(kit,separators=(',',':')));(out/'native-fracture-plan.json').write_text(json.dumps({'regions':regions,'removedSourcePolygons':sorted(removed),'parts':records},indent=2))
for p in old.glob('material-*.png'):shutil.copy2(p,out/p.name)
for material in materials:
 for node in material.node_tree.nodes:
  if node.type=='TEX_IMAGE'and node.image:
   p=out/Path(node.image.filepath).name
   if p.exists():node.image.filepath=str(p);node.image.pack()
positions,normals,uvs,roles=variant['positions'],variant['normals'],variant['uvs'],variant['triangleMaterials']

import struct
sys.path.insert(0, str(ROOT/'scripts/art_library'))
from audit_native_kit_attributes import read_glb
gltf, binary = read_glb(old/'connected-crystalline-body.glb')
binary = bytearray(binary)
def accessor(values, width, kind):
    while len(binary) % 4: binary.append(0)
    offset = len(binary)
    binary.extend(struct.pack('<' + ('f' if kind == 5126 else 'I') * len(values), *values))
    view = len(gltf['bufferViews'])
    gltf['bufferViews'].append({'buffer':0, 'byteOffset':offset, 'byteLength':len(binary)-offset})
    index = len(gltf['accessors'])
    item = {'bufferView':view, 'componentType':kind, 'count':len(values)//width,
            'type':{1:'SCALAR',2:'VEC2',3:'VEC3'}[width]}
    if width == 3:
        item['min'] = [min(values[axis::3]) for axis in range(3)]
        item['max'] = [max(values[axis::3]) for axis in range(3)]
    gltf['accessors'].append(item)
    return index
primitives = []
for material_index, material in enumerate(gltf['materials']):
    role = next(i for i, m in enumerate(kit['materials']) if m['name'] == material['name'])
    corners = [t*3+k for t, r in enumerate(roles) if r == role for k in range(3)]
    if not corners: continue
    p = [v for i in corners for v in (positions[i*3], positions[i*3+2], -positions[i*3+1])]
    n = [v for i in corners for v in (normals[i*3], normals[i*3+2], -normals[i*3+1])]
    u = [v for i in corners for v in uvs[i*2:i*2+2]]
    primitives.append({'attributes':{'POSITION':accessor(p,3,5126),
        'NORMAL':accessor(n,3,5126), 'TEXCOORD_0':accessor(u,2,5126)},
        'indices':accessor(list(range(len(corners))),1,5125), 'material':material_index})
gltf['meshes'][0]['primitives'] = primitives
gltf['nodes'][0]['extras']['authoring'] = 'native-crystal-moon-r007-selected-fractures'
gltf['buffers'][0]['byteLength'] = len(binary)
payload = json.dumps(gltf,separators=(',',':')).encode()
payload += b' ' * (-len(payload)%4)
binary += b'\x00' * (-len(binary)%4)
(out/'connected-crystalline-body.glb').write_bytes(
    struct.pack('<III',0x46546c67,2,12+8+len(payload)+8+len(binary))+
    struct.pack('<II',len(payload),0x4e4f534a)+payload+
    struct.pack('<II',len(binary),0x004e4942)+binary)


bpy.ops.wm.save_as_mainfile(filepath=str(out/'kit.blend'))
shutil.copy2(__file__,out/'source-builder.py')
(out/'validation.json').write_text(json.dumps({'moon':moon,'unselectedParentTrianglesPreserved':base_triangles,'removedParentPolygons':sorted(removed),'totalTriangles':len(roles),'selectedPanelDistricts':len(selected),'nativeFractureParts':len(records),'allAddedPartsClosedOutward':True,'sourceMaterialDefinitionsUnchanged':True},indent=2))
print('R007_DONE',moon,'districts',len(selected),'parts',len(records),'triangles',len(roles))
