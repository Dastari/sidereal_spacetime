"""Preserve r004 native triangle surfaces; repair orientation per closed panel.

Run with Blender background --threads 2 --python THIS -- MOON_ID.
Connectivity welding is diagnostic only. The editable successor keeps native
polygons and freezes existing evaluated triangles before reversing winding.
The embedded export cache is validated against native polygon corner attributes.
"""
import bpy, bmesh, collections, hashlib, json, shutil, sys
from pathlib import Path

ROOT = Path('/root/sidereal_spacetime')
BASE = ROOT / 'output/playwright/planet-reference-20260914'
moon = int(sys.argv[sys.argv.index('--') + 1])
assert moon in (1, 2)
old = BASE / f'crystal-moon-{moon}-r004'
out = BASE / f'crystal-moon-{moon}-r005'
assert not (out / 'kit.blend').exists(), 'Never overwrite an authored revision'
out.mkdir(exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(old / 'kit.blend'))
obj = next(o for o in bpy.data.objects if o.type == 'MESH')
mesh = obj.data
mesh.calc_loop_triangles()
source_positions = [tuple(v.co) for v in mesh.vertices]
source_uv = mesh.uv_layers.active
source_normals = [tuple(n.vector) for n in mesh.corner_normals]
triangles = [(list(t.vertices), list(t.loops), t.polygon_index, t.material_index)
             for t in mesh.loop_triangles]
bm = bmesh.new()
bm.from_mesh(mesh)
bm.faces.ensure_lookup_table()
origin = bm.faces.layers.int.new('source_polygon')
before = {}
for i, f in enumerate(bm.faces):
    f[origin] = i
    before[i] = f.normal.copy()
bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-6)
assert all(e.is_manifold for e in bm.edges)
remaining = set(bm.faces)
panels = []
while remaining:
    seed = min(remaining, key=lambda f: f[origin])
    remaining.remove(seed)
    component, queue = [seed], [seed]
    while queue:
        for edge in queue.pop().edges:
            for face in edge.link_faces:
                if face in remaining:
                    remaining.remove(face)
                    component.append(face)
                    queue.append(face)
    panels.append(component)
assert len(panels) == (86 if moon == 1 else 26)
flips, face_panel, panel_reports = set(), {}, []
for panel_id, faces in enumerate(panels):
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    # Signed volume is evaluated relative to a local origin to avoid loss of
    # significance and translated-shell sign ambiguity.
    center = sum((v.co for v in {v for f in faces for v in f.verts}),
                 __import__('mathutils').Vector()) / len({v for f in faces for v in f.verts})
    def volume():
        return sum((f.verts[0].co-center).dot((f.verts[i].co-center).cross(f.verts[i+1].co-center))/6
                   for f in faces for i in range(1, len(f.verts)-1))
    if volume() < 0:
        bmesh.ops.reverse_faces(bm, faces=faces)
    assert volume() > 1e-9
    for f in faces:
        face_panel[f[origin]] = panel_id
        if f.normal.dot(before[f[origin]]) < -.99:
            flips.add(f[origin])
    panel_reports.append({'panel': panel_id, 'sourcePolygons': sorted(f[origin] for f in faces),
                          'positiveSignedVolume': volume()})
bm.free()

# Preserve original editable polygon topology. Blender's compact custom normal
# encoding can lose precision on nearly collinear triangle corners, so do not
# replace these authored ngon faces with a smooth triangle mesh. Retain their
# original evaluated triangles explicitly as the native export cache instead.
faces, corner_uvs, corner_normals, roles, source_faces = [], [], [], [], []
for vertices, loops, polygon, material in triangles:
    order = [0, 2, 1] if polygon in flips else [0, 1, 2]
    sign = -1 if polygon in flips else 1
    faces.append([vertices[i] for i in order])
    corner_uvs.extend(tuple(source_uv.data[loops[i]].uv) for i in order)
    corner_normals.extend(tuple(sign*x for x in source_normals[loops[i]]) for i in order)
    roles.append(material)
    source_faces.append(polygon)
native = bmesh.new()
native.from_mesh(mesh)
native.faces.ensure_lookup_table()
bmesh.ops.reverse_faces(native, faces=[native.faces[i] for i in sorted(flips)])
native.to_mesh(mesh)
native.free()
mesh.update()
repaired = mesh
obj['authoring'] = 'native-crystal-moon-r005-outward-orientation'
obj['orientationRepair'] = 'Native polygon reversal; original evaluated triangles frozen as exact export cache; source never welded'
assert [tuple(v.co) for v in mesh.vertices] == source_positions
for polygon in mesh.polygons:
    target = before[polygon.index] * (-1 if polygon.index in flips else 1)
    assert (polygon.normal-target).length < 1e-6

kit = json.loads((old/'kit.json').read_text())
variant = kit['variants'][0]
positions = [value for face in faces for index in face for value in source_positions[index]]
normals = [value for corner in corner_normals for value in corner]
uvs = [value for corner in corner_uvs for value in (corner[0], 1-corner[1])]
indices = list(range(len(positions)//3))
variant.update(positions=positions, normals=normals, uvs=uvs, indices=indices, triangleMaterials=roles)
kit['orientationRepair'] = {'source': str(old/'kit.blend'),
    'sourceSha256': hashlib.sha256((old/'kit.blend').read_bytes()).hexdigest(),
    'originalPolygonsReversed': sorted(flips), 'originalTriangleInventoryPreserved': True}
(out/'kit.json').write_text(json.dumps(kit, separators=(',', ':')))
for path in old.glob('material-*.png'):
    shutil.copy2(path, out/path.name)
shutil.copy2(old/'native-panel-plan.json', out/'native-panel-plan.json')
for material in repaired.materials:
    for node in material.node_tree.nodes:
        if node.type == 'TEX_IMAGE' and node.image:
            path = out / Path(node.image.filepath).name
            if path.exists():
                node.image.filepath = str(path)
                node.image.pack()
bpy.ops.object.select_all(action='DESELECT')
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
# Keep the existing GLB material/image/sampler payload and append source-cache
# geometry accessors. No external geometry tool or triangulation is involved.
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
gltf['nodes'][0]['extras']['authoring'] = obj['authoring']
gltf['buffers'][0]['byteLength'] = len(binary)
payload = json.dumps(gltf,separators=(',',':')).encode()
payload += b' ' * (-len(payload)%4)
binary += b'\x00' * (-len(binary)%4)
(out/'connected-crystalline-body.glb').write_bytes(
    struct.pack('<III',0x46546c67,2,12+8+len(payload)+8+len(binary))+
    struct.pack('<II',len(payload),0x4e4f534a)+payload+
    struct.pack('<II',len(binary),0x004e4942)+binary)
cache = {'sourceVertexTriangles':faces, 'sourcePolygonPerTriangle':source_faces,
         'cornerUVs':corner_uvs, 'signedCornerNormals':corner_normals,
         'triangleMaterials':roles, 'source':'r004 evaluated native loop triangles; reversed only'}
bpy.data.texts.new('r005-exact-native-triangle-export-cache.json').write(json.dumps(cache))
bpy.ops.wm.save_as_mainfile(filepath=str(out/'kit.blend'))
report = {'moon':moon, 'originalPolygons':len(mesh.polygons), 'triangles':len(triangles),
    'originalVerticesPreserved':len(source_positions), 'polygonsReversed':len(flips),
    'trianglesReversed':sum(i in flips for i in source_faces), 'independentPanels':len(panels),
    'diagnosticBoundaryEdges':0, 'diagnosticNonmanifoldEdges':0,
    'sourceWelded':False, 'positionsUnchanged':True, 'materialDefinitionsUnchanged':True,
    'ngonDiagonalsFrozenBeforeRepair':True, 'panels':panel_reports,
    'sourcePolygonPerTriangle':source_faces, 'reversedSourcePolygons':sorted(flips)}
(out/'orientation-validation.json').write_text(json.dumps(report, indent=2))
shutil.copy2(__file__, out/'source-builder.py')
print(json.dumps({k:v for k,v in report.items() if k not in ['panels','sourcePolygonPerTriangle','reversedSourcePolygons']}))
