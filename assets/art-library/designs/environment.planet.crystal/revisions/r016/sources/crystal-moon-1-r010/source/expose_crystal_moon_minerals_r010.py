"""Native material assignment only: expose selected traced short mineral shoulders."""
import bpy,json,hashlib,shutil,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'output/playwright/planet-reference-20260914'
moon=int(sys.argv[sys.argv.index('--')+1]);assert moon in (1,2)
old=BASE/f'crystal-moon-{moon}-r009';out=BASE/f'crystal-moon-{moon}-r010';assert not(out/'kit.blend').exists();out.mkdir(exist_ok=True)
# Stable part/polygon selections from actual default/angle2 screen rays.
selections={1:[(0,78,14,0,1),(0,78,14,0,3),(1,76,4,0,1),(1,73,3,0,1),(2,8,9,2,7),(1,11,2,0,4),(0,81,14,2,1),(1,52,7,2,1),(0,55,10,0,1),(0,81,15,1,4)],
            2:[(2,1,8,2,2),(1,2,4,0,1),(0,23,11,0,6),(0,23,14,2,1),(1,10,5,2,1),(0,21,10,0,1)]}[moon]
bpy.ops.wm.open_mainfile(filepath=str(old/'kit.blend'));kit=json.loads((old/'kit.json').read_text());variant=kit['variants'][0];objects={o.get('partId'):o for o in bpy.data.objects if o.type=='MESH'};changes=[]
for region,panel,section,band,polygon_index in selections:
 part_id=f'planets--crystal-moon-{moon}/regional-fracture-{region}/panel-{panel}/section-{section}/band-{band}';obj=objects[part_id];mesh=obj.data;mesh.calc_loop_triangles();part=next(p for p in kit['nativePartRanges']if p['partId']==part_id)
 assert len(mesh.loop_triangles)==part['triangleCount'];polygon=mesh.polygons[polygon_index];before=polygon.material_index;triangles=[]
 for local,triangle in enumerate(mesh.loop_triangles):
  if triangle.polygon_index!=polygon_index:continue
  index=part['firstTriangle']+local
  native=sorted(tuple(mesh.vertices[v].co)for v in triangle.vertices)
  cached=sorted(tuple(variant['positions'][i*3:i*3+3])for i in variant['indices'][index*3:index*3+3])
  assert all(max(abs(x-y)for x,y in zip(a,b))<1e-6 for a,b in zip(native,cached)),'Native evaluated triangle mapping drift'
  assert variant['triangleMaterials'][index]==before
  variant['triangleMaterials'][index]=7;triangles.append(index)
 assert triangles
 polygon.material_index=7
 if polygon_index==1:part['topMaterial']=7
 changes.append({'partId':part_id,'nativePolygon':polygon_index,'oldMaterial':before,'newMaterial':7,'area':polygon.area,'triangles':triangles,'intent':'Traced exposed short pale-pink mineral shoulder; geometry and illumination unchanged'})
kit['materialExposureRevision']={'revision':'r010','parent':'r009','selection':'Actual r009 hero/angle2 ray picks; native polygon assignments only','changes':changes}
(out/'kit.json').write_text(json.dumps(kit,separators=(',',':')));(out/'native-material-exposure.json').write_text(json.dumps(changes,indent=2))
for p in old.glob('material-*.png'):shutil.copy2(p,out/p.name)
for material in bpy.data.materials:
 if not material.use_nodes:continue
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
gltf['nodes'][0]['extras']['authoring'] = 'native-crystal-moon-r010-selected-fractures'
gltf['buffers'][0]['byteLength'] = len(binary)
payload = json.dumps(gltf,separators=(',',':')).encode()
payload += b' ' * (-len(payload)%4)
binary += b'\x00' * (-len(binary)%4)
(out/'connected-crystalline-body.glb').write_bytes(
    struct.pack('<III',0x46546c67,2,12+8+len(payload)+8+len(binary))+
    struct.pack('<II',len(payload),0x4e4f534a)+payload+
    struct.pack('<II',len(binary),0x004e4942)+binary)



bpy.ops.wm.save_as_mainfile(filepath=str(out/'kit.blend'));shutil.copy2(__file__,out/'source-builder.py')
validation={'moon':moon,'geometryUnchanged':True,'uvsUnchanged':True,'normalsUnchanged':True,'materialsAndMapsUnchanged':True,'selectedNativePolygons':len(changes),'changedTriangles':sum(len(c['triangles'])for c in changes),'selectedSurfaceArea':sum(c['area']for c in changes),'totalTriangles':len(roles)}
(out/'validation.json').write_text(json.dumps(validation,indent=2));print(json.dumps(validation))
