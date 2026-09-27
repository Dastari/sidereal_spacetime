"""Native r006 medium fracture terraces appended to preserved outward r005 bodies."""
import bpy,bmesh,json,math,random,shutil,hashlib,sys,struct
from pathlib import Path
from mathutils import Vector
ROOT=Path('/root/sidereal_spacetime');BASE=ROOT/'output/playwright/planet-reference-20260914'
moon=int(sys.argv[sys.argv.index('--')+1]);assert moon in (1,2)
old=BASE/f'crystal-moon-{moon}-r005';out=BASE/f'crystal-moon-{moon}-r006';assert not(out/'kit.blend').exists();out.mkdir(exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(old/'kit.blend'));body=next(o for o in bpy.data.objects if o.type=='MESH');materials=list(body.data.materials)
kit=json.loads((old/'kit.json').read_text());variant=kit['variants'][0];base_triangles=len(variant['indices'])//3
panels=json.loads((old/'orientation-validation.json').read_text())['panels'];candidates=[]
for panel in panels:
 face=body.data.polygons[max(panel['sourcePolygons'])];points=[body.data.vertices[i].co.copy()for i in face.vertices];center=sum(points,Vector())/len(points)
 candidates.append((face.area,panel['panel'],face,points,center))
# Selected large districts in unequal connected groups. Quiet primary facets remain.
ranked=sorted(candidates,reverse=True,key=lambda x:x[0]);selected=ranked[:(22 if moon==1 else 12)]
plans=[ [(-.50,-.44),(.09,-.44),(.09,-.34),(.50,-.34),(.50,.10),(.31,.10),(.31,.43),(-.35,.43),(-.35,.28),(-.50,.28)],
 [(-.5,-.4),(.38,-.4),(.5,-.25),(.5,.23),(.12,.23),(.12,.46),(-.5,.46)],
 [(-.46,-.5),(.22,-.5),(.22,-.28),(.5,-.28),(.5,.4),(-.18,.4),(-.18,.21),(-.46,.21)],
 [(-.5,-.32),(-.12,-.32),(-.12,-.5),(.5,-.5),(.5,.25),(.30,.44),(-.5,.44)] ]
records=[]
for rank,(_,panel_id,face,points,center) in enumerate(selected):
 rng=random.Random(65000+moon*911+panel_id*73);normal=face.normal.normalized();edge=max([(points[(i+1)%len(points)]-p)for i,p in enumerate(points)],key=lambda e:e.length);u=edge.normalized();v=normal.cross(u).normalized()
 width=max(p.dot(u)for p in points)-min(p.dot(u)for p in points);depth=max(p.dot(v)for p in points)-min(p.dot(v)for p in points)
 width*=.62+rng.random()*.13;depth*=.52+rng.random()*.15
 if rank%4==1:u,v=v,-u;width,depth=depth,width
 anchor=center+u*width*(.04 if rank%2 else -.10)+v*depth*(.15 if rank%3 else -.15)
 heights=[.050+rng.random()*.035,.098+rng.random()*.037]
 if rank%4==0:heights.append(.151+rng.random()*.025)
 if moon==2:heights=[h*1.12 for h in heights]
 for tier,height in enumerate(heights):
  scale=[1,.61,.32][tier];offset=u*width*(.13*tier)+v*depth*(-.075*tier)
  footprint=plans[(panel_id+tier)%len(plans)];bottom=-.065 if tier==0 else heights[tier-1]-.055
  lower=[anchor+offset+u*(a*width*scale)+v*(b*depth*scale)+normal*bottom for a,b in footprint]
  upper=[anchor+offset+u*(a*width*scale*.96)+v*(b*depth*scale*.96)+normal*(height+.009*a-.007*b)for a,b in footprint]
  vertices=lower+upper;n=len(footprint);faces=[list(reversed(range(n))),list(range(n,2*n))]+[[i,(i+1)%n,(i+1)%n+n,i+n]for i in range(n)]
  mesh=bpy.data.meshes.new(f'native-panel-{panel_id}-fracture-tier-{tier}');mesh.from_pydata(vertices,[],faces);mesh.update()
  obj=bpy.data.objects.new(f'GEO-crystal-moon-{moon}-fracture-panel-{panel_id}-tier-{tier}',mesh);bpy.context.scene.collection.objects.link(obj)
  for material in materials:mesh.materials.append(material)
  bright=(moon==2 and tier==len(heights)-1 and(rank in [0,3,5,8]))or(moon==1 and tier==len(heights)-1 and rank in [2,8,14])
  top_role=6 if bright else(4 if(rank+tier)%5==0 else 3)
  for p in mesh.polygons:p.material_index=top_role if p.index==1 else(5 if p.index==0 or p.index%3==0 else(7 if rank%5==2 and p.index%3==1 else 3))
  bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));assert all(e.is_manifold for e in bm.edges);assert bm.calc_volume(signed=True)>0;bm.to_mesh(mesh);bm.free()
  uv=mesh.uv_layers.new(name='UVMap')
  for p in mesh.polygons:
   coords=[mesh.vertices[i].co for i in p.vertices];x=(coords[1]-coords[0]).normalized();y=p.normal.cross(x).normalized();lo=min(q.dot(x)for q in coords);hi=max(q.dot(x)for q in coords);vl=min(q.dot(y)for q in coords);vh=max(q.dot(y)for q in coords)
   for loop in p.loop_indices:
    q=mesh.vertices[mesh.loops[loop].vertex_index].co;uv.data[loop].uv=((q.dot(x)-lo)/max(hi-lo,.001),(q.dot(y)-vl)/max(vh-vl,.001))
  mesh.calc_loop_triangles();first=len(variant['indices'])//3
  for tri in mesh.loop_triangles:
   for vertex,loop in zip(tri.vertices,tri.loops):
    variant['positions'].extend(mesh.vertices[vertex].co);variant['normals'].extend(mesh.corner_normals[loop].vector);variant['uvs'].extend((uv.data[loop].uv.x,1-uv.data[loop].uv.y));variant['indices'].append(len(variant['positions'])//3-1)
   variant['triangleMaterials'].append(tri.material_index)
  part=f'planets--crystal-moon-{moon}/fracture-panel-{panel_id}/tier-{tier}';obj['partId']=part;obj['role']='planet';obj['parentNativePanel']=panel_id
  records.append({'partId':part,'sourcePanel':panel_id,'tier':tier,'firstTriangle':first,'triangleCount':len(mesh.loop_triangles),'topMaterial':top_role,'height':height,'baseEmbeddedBelowParentSurface':True})
kit['nativePartRanges']=[{'partId':f'planets--crystal-moon-{moon}/native-body','firstTriangle':0,'triangleCount':base_triangles}]+records
kit['sourceReuse']={'parent':str(old/'kit.blend'),'parentSha256':hashlib.sha256((old/'kit.blend').read_bytes()).hexdigest(),'geometry':'Exact r005 native body export inventory plus selected newly authored native fracture terraces'}
(out/'kit.json').write_text(json.dumps(kit,separators=(',',':')));(out/'native-fracture-plan.json').write_text(json.dumps(records,indent=2))
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
gltf['nodes'][0]['extras']['authoring'] = 'native-crystal-moon-r006-selected-fractures'
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
(out/'validation.json').write_text(json.dumps({'moon':moon,'parentTrianglesPreserved':base_triangles,'totalTriangles':len(roles),'selectedPanelDistricts':len(selected),'nativeFractureParts':len(records),'allAddedPartsClosedOutward':True,'sourceMaterialDefinitionsUnchanged':True},indent=2))
print('R006_DONE',moon,'parts',len(records),'triangles',len(roles))
