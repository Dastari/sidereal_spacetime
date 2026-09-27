"""Native receiver-side support-grip fit; preserve the immutable r002 pair.

Run with the Blender executable in dev.toml, background/CPU only, then -- OUTDIR.
This authors only a fresh private review directory. It does not publish assets.
"""
import bpy
import bmesh
import hashlib
import json
import struct
import sys
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree


ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'assets/art-library/designs/crew.animation.aim/revisions/r002'
OUT = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
EQUIPMENT = OUT / 'equipment'
if (EQUIPMENT / 'handheld-source.blend').exists():
    raise RuntimeError('Immutable r003 output already exists; use a fresh revision')
EQUIPMENT.mkdir(parents=True, exist_ok=True)
DEPENDENCIES = OUT / 'pairing-dependencies'
DEPENDENCIES.mkdir(exist_ok=True)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def immutable_bytes(path, data):
    if path.exists():
        raise RuntimeError(f'Refusing to overwrite {path}')
    path.write_bytes(data)


def immutable_json(path, value):
    immutable_bytes(path, (json.dumps(value, indent=2) + '\n').encode())


def gltf(co):
    return Vector((co.x, co.z, -co.y))


def native(co):
    return Vector((co[0], -co[2], co[1]))


def bounds(vertices):
    points = [gltf(v.co) for v in vertices]
    return [[min(p[i] for p in points) for i in range(3)],
            [max(p[i] for p in points) for i in range(3)]]


def islands(bm):
    seen = set()
    for vertex in bm.verts:
        if vertex in seen:
            continue
        todo = [vertex]
        found = {vertex}
        seen.add(vertex)
        while todo:
            current = todo.pop()
            for edge in current.link_edges:
                other = edge.other_vert(current)
                if other not in seen:
                    seen.add(other)
                    found.add(other)
                    todo.append(other)
        yield found


def vertex_hash(vertices):
    return hashlib.sha256(b''.join(struct.pack('<3f', *v.co)
                                  for v in sorted(vertices, key=lambda v: v.index))).hexdigest()


source = BASE / 'equipment/handheld-source.blend'
assert sha(source) == 'f25ff514cb2ecb07a1bc5a20ec40603f644d8fb362a583080cfb259c62fc47d6'
bpy.ops.wm.open_mainfile(filepath=str(source))
bpy.context.preferences.filepaths.save_version = 0
specs = {
    'carbine': {'socket': [-.10, .045, -.04], 'center_z': -.04},
    'long-rifle': {'socket': [-.10, .045, -.08], 'center_z': -.08},
}
validation = {}
for asset, spec in specs.items():
    root = bpy.data.objects[asset]
    mesh = next(child for child in root.children if child.type == 'MESH')
    bm = bmesh.new()
    bm.from_mesh(mesh.data)
    bm.verts.ensure_lookup_table()
    candidates = []
    for island in islands(bm):
        low, high = bounds(island)
        center = [(a + b) / 2 for a, b in zip(low, high)]
        materials = {mesh.data.materials[face.material_index].name
                     for v in island for face in v.link_faces}
        if (len(island) == 56 and materials == {'equipment.rubber'}
                and max(abs(a - b) for a, b in zip(center, [0, 0, -.23])) < 1e-5):
            candidates.append(island)
    assert len(candidates) == 1, (asset, 'Expected exactly one original foregrip island')
    island = candidates[0]
    original_bounds = bounds(island)
    remaining = set(bm.verts) - island
    before_other_vertices = vertex_hash(remaining)
    original_faces = [(tuple(v.index for v in f.verts), f.material_index) for f in bm.faces]
    # Relocate/reshape the original native beveled rubber island. The pad's inner
    # X edge overlaps the receiver 26 mm; the outer X face carries the support
    # palm. This stays outside the trigger/guard centerline and leaves the
    # magazine, primary grip, stock, barrel and optic vertices untouched.
    low = [-.10, -.01, spec['center_z'] - .06]
    high = [-.044, .065, spec['center_z'] + .06]
    for vertex in island:
        p = gltf(vertex.co)
        changed = [low[i] + (p[i] - original_bounds[0][i])
                   / (original_bounds[1][i] - original_bounds[0][i])
                   * (high[i] - low[i]) for i in range(3)]
        vertex.co = native(changed)
    bm.normal_update()
    assert vertex_hash(remaining) == before_other_vertices
    assert original_faces == [(tuple(v.index for v in f.verts), f.material_index) for f in bm.faces]
    assert all(edge.is_manifold for edge in bm.edges)
    nearest = BVHTree.FromBMesh(bm).find_nearest(native(spec['socket']))
    assert nearest and nearest[3] < 1e-6, (asset, 'Socket must touch actual native surface', nearest)
    native_bounds = bounds(island)
    indices = [v.index for v in island]
    bm.to_mesh(mesh.data)
    bm.free()
    group = mesh.vertex_groups.new(name='AUTHORING-offhand-palm-shelf-r003')
    group.add(indices, 1, 'REPLACE')
    root['pose_revision'] = 'r003'
    root['supportPalm'] = spec['socket']
    root['supportContactKind'] = 'receiver-side beveled rubber palm shelf'
    anchor = bpy.data.objects.new('Grip.Secondary.' + asset, None)
    bpy.context.collection.objects.link(anchor)
    anchor.parent = root
    anchor.location = native(spec['socket'])
    anchor.empty_display_type = 'PLAIN_AXES'
    anchor.empty_display_size = .04
    anchor['semanticSocket'] = 'Grip.Secondary'
    validation[asset] = {
        'native_mesh': mesh.name,
        'changed_vertex_count': len(indices),
        'original_support_bounds_gltf_m': original_bounds,
        'support_bounds_gltf_m': native_bounds,
        'socket_gltf_m': spec['socket'],
        'socket_surface_distance_m': nearest[3],
        'remaining_vertex_sha256_before_and_after': before_other_vertices,
        'remaining_vertex_count': len(mesh.data.vertices) - len(indices),
        'topology_and_material_assignments_unchanged': True,
        'all_edges_manifold': True,
        'trigger_access': 'Shelf inner X=-0.044 stays outside guard X=+-0.0135; 30.5 mm minimum gap',
        'receiver_attachment': '26 mm horizontal overlap with receiver; shelf upper Y=.065 overlaps receiver bottom Y=.025',
    }

bpy.ops.wm.save_as_mainfile(filepath=str(EQUIPMENT / 'handheld-source.blend'))
for asset in specs:
    root = bpy.data.objects[asset]
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    for child in root.children:
        child.select_set(True)
    path = EQUIPMENT / (asset + '.glb')
    if path.exists():
        raise RuntimeError(f'Refusing to overwrite {path}')
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB',
                              use_selection=True, export_extras=True,
                              export_cameras=False, export_lights=False)

# Paired dependencies are preserved byte-for-byte, never regenerated incidentally.
unchanged = ['compact-pistol', 'heavy-handgun', 'flashlight', 'plasma-cutter', 'sample-scanner']
for asset in unchanged:
    immutable_bytes(EQUIPMENT / (asset + '.glb'), (BASE / 'equipment' / (asset + '.glb')).read_bytes())
immutable_bytes(OUT / 'runtime-aim-space.json', (BASE / 'runtime-aim-space.json').read_bytes())
immutable_bytes(DEPENDENCIES / 'profile-socket-metadata.r002.json', (BASE / 'profile-socket-metadata.json').read_bytes())
immutable_bytes(DEPENDENCIES / 'equipment-manifest.r002.json', (BASE / 'equipment/manifest.json').read_bytes())

previous = json.loads((BASE / 'profile-socket-metadata.json').read_text())
metadata = {key: value for key, value in previous.items() if key != 'profiles'}
metadata['revision'] = 'r003'
metadata['profile_source'] = 'Runtime presentation profiles remain owned by packages/content/src/equipment-poses.ts; historical r002 values are archived in pairing-dependencies.'
metadata['source_r002_metadata_sha256'] = sha(BASE / 'profile-socket-metadata.json')
metadata['native_source_sha256'] = sha(EQUIPMENT / 'handheld-source.blend')
metadata['status'] = 'Unsigned native receiver-side support-grip candidate; gameplay integration and owner visual acceptance remain separate.'
for asset, spec in specs.items():
    item = metadata['items'][asset]
    item['sockets']['Grip.Secondary'] = spec['socket']
    item['clearance'].append({'name': 'offhand-palm-shelf',
                              'center': [-.072, .0275, spec['center_z']],
                              'half': [.028, .0375, .06]})
immutable_json(OUT / 'profile-socket-metadata.json', metadata)
manifest = json.loads((BASE / 'equipment/manifest.json').read_text())
manifest['status'] = 'Unsigned r003 native support-grip pair; presentation only'
for entry in manifest['entries']:
    if entry['id'] in specs:
        entry['anchors']['supportPalm'] = specs[entry['id']]['socket']
    entry['sha256'] = sha(EQUIPMENT / entry['file'])
immutable_json(EQUIPMENT / 'manifest.json', manifest)

records = {str(path.relative_to(OUT)): {'sha256': sha(path), 'bytes': path.stat().st_size}
           for path in [EQUIPMENT / 'handheld-source.blend', OUT / 'runtime-aim-space.json',
                        OUT / 'profile-socket-metadata.json', EQUIPMENT / 'manifest.json',
                        *[EQUIPMENT / (asset + '.glb') for asset in [*specs, *unchanged]]]}
immutable_json(OUT / 'equipment-native-validation.json', {
    'status': 'native geometry/contact validation pass; full rig/browser validation pending',
    'blender': bpy.app.version_string,
    'source': str(source.relative_to(ROOT)), 'source_sha256': sha(source),
    'generator_sha256': sha(Path(__file__)), 'files': records, 'assets': validation,
    'unchanged_paired_dependencies': unchanged + ['runtime-aim-space.json'],
    'remaining_scope': ['No owner art sign-off', 'No live publication',
                        'New palm shelf requires full rig sweep and actual browser review',
                        'Shoulder/stock/optic fit and extreme pitch remain integration work'],
})
immutable_json(OUT / 'equipment-delivery-manifest.json', {
    'revision': 'r003', 'publication': 'not published', 'owner_final_signoff': None,
    'files': records, 'validation_sha256': sha(OUT / 'equipment-native-validation.json'),
})
print('R003_NATIVE_DELIVERY=' + json.dumps(records))
