"""Independent binary GLB validation for semantic armor/liner exports."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import struct


def read_glb(path):
    data = Path(path).read_bytes()
    assert data[:4] == b'glTF' and struct.unpack_from('<II', data, 4) == (2, len(data))
    chunks, offset = {}, 12
    while offset < len(data):
        length, kind = struct.unpack_from('<II', data, offset)
        chunks[kind] = data[offset + 8:offset + 8 + length]
        offset += 8 + length
    assert offset == len(data)
    return data, json.loads(chunks[0x4E4F534A]), chunks[0x004E4942]


def accessor(doc, blob, index):
    a = doc['accessors'][index]; assert 'sparse' not in a
    view = doc['bufferViews'][a['bufferView']]; assert view.get('buffer', 0) == 0
    fmt, size = {5120: ('b', 1), 5121: ('B', 1), 5122: ('h', 2),
                 5123: ('H', 2), 5125: ('I', 4), 5126: ('f', 4)}[a['componentType']]
    components = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[a['type']]
    offset = view.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = view.get('byteStride', size * components)
    assert offset + max(0, a['count'] - 1) * stride + size * components <= view.get('byteOffset', 0) + view['byteLength']
    return [struct.unpack_from('<' + fmt * components, blob, offset + i * stride) for i in range(a['count'])]


def identity():
    return [[float(i == j) for j in range(4)] for i in range(4)]


def multiply(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def node_matrix(node):
    if 'matrix' in node:
        return [[node['matrix'][j * 4 + i] for j in range(4)] for i in range(4)]
    x, y, z, w = node.get('rotation', [0, 0, 0, 1])
    m = [[1 - 2*y*y - 2*z*z, 2*x*y - 2*z*w, 2*x*z + 2*y*w, 0],
         [2*x*y + 2*z*w, 1 - 2*x*x - 2*z*z, 2*y*z - 2*x*w, 0],
         [2*x*z - 2*y*w, 2*y*z + 2*x*w, 1 - 2*x*x - 2*y*y, 0], [0, 0, 0, 1]]
    for i, value in enumerate(node.get('translation', [0, 0, 0])): m[i][3] = value
    for j, value in enumerate(node.get('scale', [1, 1, 1])):
        for i in range(3): m[i][j] *= value
    return m


def scene_nodes(doc):
    nodes = []
    def visit(index, parent):
        node = doc['nodes'][index]; matrix = multiply(parent, node_matrix(node))
        nodes.append((node, matrix))
        for child in node.get('children', []): visit(child, matrix)
    for index in doc['scenes'][doc.get('scene', 0)]['nodes']: visit(index, identity())
    return nodes


def world_point(position, matrix):
    p = [sum(matrix[i][j] * (*position, 1)[j] for j in range(4)) for i in range(3)]
    return [p[0], -p[2], p[1]]


def polygon_area(points):
    return sum(a[0]*b[1]-b[0]*a[1] for a, b in zip(points, points[1:]+points[:1]))/2 if points else 0


def overlap_area(a, b):
    """Exact convex triangle clipping in the light-face projection plane."""
    orientation = 1 if polygon_area(b) > 0 else -1
    for start, end in zip(b, b[1:]+b[:1]):
        def side(p):
            return orientation*((end[0]-start[0])*(p[1]-start[1])-(end[1]-start[1])*(p[0]-start[0]))
        clipped = []
        for previous, current in zip(a[-1:]+a[:-1], a):
            p, c = side(previous), side(current)
            if (p >= 0) != (c >= 0):
                t = p/(p-c)
                clipped.append([previous[i]+t*(current[i]-previous[i]) for i in range(2)])
            if c >= 0: clipped.append(current)
        a = clipped
        if not a: return 0
    return abs(polygon_area(a))


def light_pocket_check(row, surfaces):
    axis, face = (0, .5) if row['family'] == 'side' else (1, .625)
    if row['family'] != 'side' and row['slug'] != 'front-bow-bumper': return None
    other_axes = [i for i in range(3) if i != axis]
    lenses, backing = [], []
    for cyan, triangle, cross in surfaces:
        if cross[axis] <= 1e-10 or max(p[axis] for p in triangle)-min(p[axis] for p in triangle) > 1e-7: continue
        plane = triangle[0][axis]
        projected = [[p[i] for i in other_axes] for p in triangle]
        if cyan and abs(plane-face) < 1e-7: lenses.append(projected)
        elif not cyan: backing.append((plane, projected))
    if row['family'] == 'side' and row['widthM'] < 1:
        assert not lenses
        return {'lensTriangles': 0, 'profile': 'narrow module omits rail light'}
    assert lenses, (row['slug'], 'Missing front-facing cyan lens')
    closest = math.inf
    for lens in lenses:
        for plane, triangle in backing:
            if overlap_area(lens, triangle) <= 1e-9: continue
            gap = face-plane
            assert gap >= .015625-1e-6, (row['slug'], 'Rail competes with cyan lens face', gap)
            closest = min(closest, gap)
    assert math.isfinite(closest), (row['slug'], 'Missing opaque light-pocket backing')
    return {'lensTriangles': len(lenses), 'minimumOpaqueBackingGapM': closest,
            'coplanarOpaqueOverlapAreaM2': 0, 'method': 'Every positive-facing opaque planar triangle projected against every cyan front triangle'}


def bow_mating_check(fronts):
    if set(fronts) != {'front-bow-bumper', 'front-diagonal-cheek'}: return None
    bumper, cheek = fronts['front-bow-bumper'], fronts['front-diagonal-cheek']
    # Exact inherited fixture placements: bumper(-2,13), cheek(1,11), and
    # the opposite cheek reflected in X at(-1,11). No placement is edited.
    contacts = []
    for side, plane, sign in [('right', 4, 1), ('left', 0, -1)]:
        a = [[[p[1], p[2]] for p in tri] for _, tri, cross in bumper
             if sign*cross[0] > 1e-9 and all(abs(p[0]-plane) < 1e-7 for p in tri)]
        b = [[[p[1]-2, p[2]] for p in tri] for _, tri, cross in cheek
             if cross[0] < -1e-9 and all(abs(p[0]-1) < 1e-7 for p in tri)]
        area = sum(overlap_area(x, y) for x in a for y in b)
        assert area >= .03125*1.5, (side, 'Missing fitted bow terminal contact', area)
        contacts.append({'side': side, 'sharedContactAreaM2': area})
    # Every cheek surface clipped to the bumper's Y>=13 half-space must
    # stay beyond the common X datum. This excludes positive-volume overlap.
    for _, tri, _ in cheek:
        clipped = []
        for a, b in zip(tri[-1:]+tri[:-1], tri):
            av, bv = a[1]-2, b[1]-2
            if (av >= 0) != (bv >= 0):
                t = av/(av-bv)
                clipped.append([a[i]+t*(b[i]-a[i]) for i in range(3)])
            if bv >= 0: clipped.append(b)
        assert all(p[0] >= 1-1e-6 for p in clipped), 'Cheek armor crosses bumper owning space'
    return {'contacts': contacts, 'positiveVolumeOverlap': False,
            'scope': 'Exact ARMOR triangles and frozen review placements; retained liner is separate.'}


def check(directory):
    base = Path(directory); manifest = json.loads((base / 'models.json').read_text())
    assert manifest['revision'] == 4
    assert hashlib.sha256((base / manifest['source']).read_bytes()).hexdigest() == manifest['sourceSha256']
    assert hashlib.sha256((base / 'recipe.py').read_bytes()).hexdigest() == manifest['recipeSha256']
    for dependency in manifest['sourceDependencies']:
        frozen = base / Path(dependency['path']).name
        assert hashlib.sha256(frozen.read_bytes()).hexdigest() == dependency['sha256'], dependency['path']
    for image in manifest['maps']:
        assert hashlib.sha256((base / image['path']).read_bytes()).hexdigest() == image['sha256']
    if manifest['stage'] == 'complete-family-independent-review-candidate':
        expected = {f'armor-{v}{role}-w200-h300{port}'
                    for v in ('plain', 'red-service', 'vent', 'utility', 'identity')
                    for role in ('', '-pair-left', '-pair-right') for port in ('', '-port')}
        expected.update(f'armor-plain-w{w}-h{h}{port}' for w, h in
                        [('100', '300'), ('050', '300'), ('200', '075'), ('200', '150'), ('200', '225')]
                        for port in ('', '-port'))
        interfaces = json.loads((base / 'armor_cassette_interfaces.json').read_text())
        expected.update(f['slug'] for f in interfaces['fronts'])
        assert {r['slug'] for r in manifest['models']} == expected and len(manifest['models']) == 46
        for interface in interfaces['fronts']:
            row = next(r for r in manifest['models'] if r['slug'] == interface['slug'])
            assert row['assetId'] == interface['assetId'] and row['existingBounds'] == interface['bounds']
    records, pair_rows, handed_geometry, front_surfaces = [], {}, {}, {}
    for row in manifest['models']:
        data, doc, blob = read_glb(base / row['path'])
        assert hashlib.sha256(data).hexdigest() == row['sha256']
        assert row['revision'] == 4 and not doc.get('animations') and not doc.get('skins')
        nodes = scene_nodes(doc); groups = {}; points = []; triangles = 0; surfaces = []
        armor_surfaces = []
        for node, matrix in nodes:
            assert all(abs(v - 1) < 1e-7 for v in node.get('scale', [1, 1, 1]))
            if 'mesh' not in node: continue
            assert node['name'] in [g['nodePrefix'] for g in row['renderGroups'].values()], node['name']
            local_points = []; group_triangles = 0
            for prim in doc['meshes'][node['mesh']]['primitives']:
                assert prim.get('mode', 4) == 4 and not prim.get('targets')
                positions = accessor(doc, blob, prim['attributes']['POSITION'])
                normals = accessor(doc, blob, prim['attributes']['NORMAL'])
                uv = accessor(doc, blob, prim['attributes']['TEXCOORD_0'])
                assert len(positions) == len(normals) == len(uv)
                assert all(math.isfinite(c) and -1e-6 <= c <= 1 + 1e-6 for vec in uv for c in vec)
                assert all(abs(sum(c*c for c in n) - 1) < 2e-4 for n in normals)
                transformed = [world_point(p, matrix) for p in positions]
                assert all(math.isfinite(c) for p in transformed for c in p)
                if row.get('variant') == 'identity':
                    atlas_start = 8 if row.get('pairRole') else 12
                    atlas_width = 4 if row.get('pairRole') else 2
                    bay_shift = 2 if row.get('pairRole') == 'right' else 0
                    for p, mapped_uv in zip(transformed, uv):
                        if abs(p[0]-.28125) < 1e-7:
                            u = p[1] + 1 + bay_shift
                            if row.get('mirroredExterior'): u = atlas_width-u
                            assert abs(mapped_uv[0]-(atlas_start+u)/16) < 2e-6, (row['slug'], 'Identity lettering U')
                            assert abs(mapped_uv[1]-(1-p[2]/16)) < 2e-6, (row['slug'], 'Identity lettering V')
                points.extend(transformed); local_points.extend(transformed)
                indices = [v[0] for v in accessor(doc, blob, prim['indices'])]
                assert len(indices) % 3 == 0
                for i in range(0, len(indices), 3):
                    a, b, c = [transformed[k] for k in indices[i:i + 3]]
                    ab, ac = [b[j] - a[j] for j in range(3)], [c[j] - a[j] for j in range(3)]
                    cross = [ab[1]*ac[2]-ab[2]*ac[1], ab[2]*ac[0]-ab[0]*ac[2], ab[0]*ac[1]-ab[1]*ac[0]]
                    assert sum(v*v for v in cross) > 1e-18, (row['slug'], 'Degenerate triangle')
                    surfaces.append(('cyan' in doc['materials'][prim['material']].get('name', ''), [a, b, c], cross))
                    if node['name'] == row['renderGroups']['armor']['nodePrefix']: armor_surfaces.append(surfaces[-1])
                group_triangles += len(indices) // 3
            groups[node['name']] = {'triangles': group_triangles,
                                    'bounds': {k: [fn(v[i] for v in local_points) for i in range(3)] for k, fn in [('min', min), ('max', max)]}}
            triangles += group_triangles
        assert len(groups) == 2, 'Exactly separate ARMOR and LINER render meshes required'
        assert triangles == row['triangles']
        measured = {k: [fn(v[i] for v in points) for i in range(3)] for k, fn in [('min', min), ('max', max)]}
        for k in measured:
            assert max(abs(a-b) for a, b in zip(measured[k], row['bounds'][k])) < 2e-6
        for group in row['renderGroups'].values():
            actual = groups[group['nodePrefix']]
            assert actual['triangles'] == group['triangles']
            for k in group['bounds']:
                assert max(abs(a-b) for a, b in zip(actual['bounds'][k], group['bounds'][k])) < 2e-6
        for name, socket in row['sockets'].items():
            found = [(n, m) for n, m in nodes if n.get('name') == name]
            assert len(found) == 1, (row['slug'], name)
            assert max(abs(a-b) for a, b in zip(world_point([0, 0, 0], found[0][1]), socket['position'])) < 1e-6
            assert found[0][0]['extras']['normal'] == socket['normal']
            assert all(abs(v * 32 - round(v * 32)) < 1e-6 for v in socket['position'])
        if row['family'] == 'side':
            width, height = row['widthM'], row['heightM']
            assert row['sockets'] == {
                'HULL_ATTACH': {'position': [0, 0, 0], 'normal': [1, 0, 0]},
                'HULL_EDGE_START': {'position': [0, -width/2, 0], 'normal': [0, -1, 0]},
                'HULL_EDGE_END': {'position': [0, width/2, 0], 'normal': [0, 1, 0]},
                'HULL_TOP': {'position': [0, 0, height], 'normal': [0, 0, 1]},
            }, (row['slug'], 'Changed attachment interface')
            expected = {'min': [0, -row['widthM']/2, 0], 'max': [.5, row['widthM']/2, row['heightM']]}
            for k in expected:
                assert max(abs(a-b) for a, b in zip(measured[k], expected[k])) < 2e-6
            handed_key = (row['variant'], row.get('pairRole'), width, height)
            fingerprint = hashlib.sha256(repr(sorted(set(tuple(round(c, 7) for c in p) for p in points))).encode()).hexdigest()
            handed_geometry.setdefault(handed_key, {})[row.get('mirroredExterior', False)] = fingerprint
            if row.get('pairRole'):
                key = (row['variant'], row['widthM'], row['heightM'], row.get('mirroredExterior', False))
                family = pair_rows.setdefault(key, {})
                assert row['pairRole'] not in family, ('Duplicate paired member', key, row['pairRole'])
                family[row['pairRole']] = measured
        else:
            for i in range(3):
                assert measured['min'][i] >= row['existingBounds']['min'][i] - .0001
                assert measured['max'][i] <= row['existingBounds']['max'][i] + .0001
        mapped = [m for m in doc['materials'] if 'normalTexture' in m]
        assert len(mapped) >= 1
        image_hashes = []
        for img in doc['images']:
            assert 'uri' not in img
            view = doc['bufferViews'][img['bufferView']]; offset = view.get('byteOffset', 0)
            payload = blob[offset:offset + view['byteLength']]
            assert payload[:8] == b'\x89PNG\r\n\x1a\n'
            image_hashes.append(hashlib.sha256(payload).hexdigest())
        expected_maps = {Path(m['path']).name: m['sha256'] for m in manifest['maps']}
        for material in mapped:
            assert 'baseColorTexture' in material['pbrMetallicRoughness']
            assert 'metallicRoughnessTexture' in material['pbrMetallicRoughness']
            for texture, expected_name in [(material['normalTexture'], 'armor-normal.png'),
                    (material['pbrMetallicRoughness']['baseColorTexture'], 'armor-basecolor.png')]:
                image_index = doc['textures'][texture['index']]['source']
                assert image_hashes[image_index] == expected_maps[expected_name], (row['slug'], expected_name)
        assert all(m.get('alphaMode', 'OPAQUE') == 'OPAQUE' for m in doc['materials'])
        if row['slug'] in ('front-bow-bumper', 'front-diagonal-cheek'):
            front_surfaces[row['slug']] = armor_surfaces
        records.append({'slug': row['slug'], 'status': 'pass', 'sha256': row['sha256'], 'bounds': measured,
                        'triangles': triangles, 'semanticGroups': groups, 'materials': len(doc['materials']),
                        'embeddedImages': len(doc['images']), 'normalMappedMaterials': len(mapped),
                        'lightPocket': light_pocket_check(row, surfaces)})
    for key, family in pair_rows.items():
        assert set(family) == {'left', 'right'}, ('Incomplete pair', key)
        # Every convex hull lies inside its half-space; this proves no volume
        # crosses the joined mating plane for any triangle, not just one face.
        half = key[1] / 2
        assert family['left']['max'][1] - half <= 1e-6
        assert family['right']['min'][1] + half >= -1e-6
    if manifest['stage'] == 'complete-family-independent-review-candidate':
        for key, pair in handed_geometry.items():
            assert set(pair) == {False, True} and pair[False] == pair[True], (key, 'Port variant changed geometry')
    return {'schema': 'sidereal.armor-cassette-native-check.v1', 'revision': 4, 'status': 'pass',
            'models': records, 'pairedFamiliesChecked': [list(key) for key in pair_rows],
            'bowMating': bow_mating_check(front_surfaces),
            'pairMating': 'Every variant/width/height/exterior-handedness pair is checked independently. Vertex half-spaces prove zero positive-volume overlap at the joined Y=0 plane.',
            'scope': 'Actual GLB geometry/UV/materials, exact bounds/sockets, distinct armor/liner groups and mating envelopes. Independent visual review and pressure/damage qualification remain separate.'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__); parser.add_argument('directory')
    args = parser.parse_args(); print(json.dumps(check(args.directory), indent=2))
