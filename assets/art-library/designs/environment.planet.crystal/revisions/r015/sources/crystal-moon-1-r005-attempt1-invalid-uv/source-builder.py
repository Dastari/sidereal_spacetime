"""Preserve r004 native triangle surfaces; repair orientation per closed panel.

Run with Blender background --threads 2 --python THIS -- MOON_ID.
Connectivity welding is diagnostic only. The editable successor freezes existing
loop triangles (including ngon diagonals) before reversing inconsistent faces.
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

# Preserve exactly Blender's original ngon triangulation, UV corner assignment,
# and corner shading directions, reversing only orientation and signed normals.
faces, corner_uvs, corner_normals, roles, source_faces = [], [], [], [], []
for vertices, loops, polygon, material in triangles:
    order = [0, 2, 1] if polygon in flips else [0, 1, 2]
    sign = -1 if polygon in flips else 1
    faces.append([vertices[i] for i in order])
    corner_uvs.extend(tuple(source_uv.data[loops[i]].uv) for i in order)
    corner_normals.extend(tuple(sign*x for x in source_normals[loops[i]]) for i in order)
    roles.append(material)
    source_faces.append(polygon)
repaired = bpy.data.meshes.new(mesh.name + '-outward-r005')
repaired.from_pydata(source_positions, [], faces)
for material in mesh.materials:
    repaired.materials.append(material)
uv = repaired.uv_layers.new(name=source_uv.name)
for loop, value in zip(uv.data, corner_uvs):
    loop.uv = value
for polygon, role in zip(repaired.polygons, roles):
    polygon.material_index = role
    polygon.use_smooth = True
repaired.normals_split_custom_set(corner_normals)
for name, values in [('r004_source_polygon', source_faces),
                     ('native_panel', [face_panel[i] for i in source_faces])]:
    attribute = repaired.attributes.new(name=name, type='INT', domain='FACE')
    for datum, value in zip(attribute.data, values):
        datum.value = value
obj.data = repaired
obj['authoring'] = 'native-crystal-moon-r005-outward-orientation'
obj['orientationRepair'] = 'Existing r004 loop triangles; positional connectivity diagnostic only; no source welding'
assert [tuple(v.co) for v in repaired.vertices] == source_positions

kit = json.loads((old/'kit.json').read_text())
variant = kit['variants'][0]
positions, normals, uvs, indices = [], [], [], []
for polygon in repaired.polygons:
    for loop in polygon.loop_indices:
        positions.extend(repaired.vertices[repaired.loops[loop].vertex_index].co)
        normals.extend(repaired.corner_normals[loop].vector)
        uvs.extend((uv.data[loop].uv.x, 1-uv.data[loop].uv.y))
        indices.append(len(indices))
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
bpy.ops.export_scene.gltf(filepath=str(out/'connected-crystalline-body.glb'),
    export_format='GLB', use_selection=True, export_extras=True)
sys.path.insert(0, str(ROOT/'scripts/art_library'))
from preserve_native_kit_ior import corrected_glb
path = out/'connected-crystalline-body.glb'
(out/'blender-raw').mkdir(exist_ok=True)
shutil.copy2(path, out/'blender-raw'/path.name)
data, _ = corrected_glb(path.read_bytes(), {m['name']:m for m in kit['materials']})
path.write_bytes(data)
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
