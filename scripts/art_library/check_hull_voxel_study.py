"""Independently validate the actual private study GLB bytes with stdlib only.

Prints JSON; never rewrites an existing evidence record or any asset.
"""

import argparse
from collections import Counter
import hashlib
import json
import math
from pathlib import Path
import struct

from hull_voxel_study_damage import CELL_SIZE, damage_cells


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read_glb(path):
    data = path.read_bytes()
    require(struct.unpack_from('<4sII', data) == (b'glTF', 2, len(data)), 'Invalid GLB header')
    chunks = {}
    offset = 12
    while offset < len(data):
        size, kind = struct.unpack_from('<II', data, offset)
        offset += 8
        require(offset + size <= len(data), 'Truncated GLB chunk')
        require(kind not in chunks, 'Duplicate GLB chunk')
        chunks[kind] = data[offset:offset + size]
        offset += size
    gltf = json.loads(chunks[0x4e4f534a])
    binary = chunks[0x004e4942]
    require(len(gltf['buffers']) == 1, 'Expected one embedded buffer')
    require('uri' not in gltf['buffers'][0], 'External buffer is not bundled')
    require(gltf['buffers'][0]['byteLength'] <= len(binary), 'Truncated buffer')
    return data, gltf, binary


def buffer_view(gltf, binary, index):
    view = gltf['bufferViews'][index]
    require(view.get('buffer', 0) == 0, 'Unbundled buffer view')
    offset = view.get('byteOffset', 0)
    require(offset + view['byteLength'] <= len(binary), 'Buffer view out of bounds')
    return binary[offset:offset + view['byteLength']]


def accessor(gltf, binary, index):
    entry = gltf['accessors'][index]
    require('sparse' not in entry, 'Sparse accessors not supported by this study validator')
    components = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[entry['type']]
    code = {5120: 'b', 5121: 'B', 5122: 'h', 5123: 'H', 5125: 'I', 5126: 'f'}[entry['componentType']]
    fmt = '<' + code * components
    item_size = struct.calcsize(fmt)
    view = gltf['bufferViews'][entry['bufferView']]
    data = buffer_view(gltf, binary, entry['bufferView'])
    stride = view.get('byteStride', item_size)
    offset = entry.get('byteOffset', 0)
    require(stride >= item_size, 'Invalid accessor stride')
    require(offset + max(0, entry['count'] - 1) * stride + item_size <= len(data), 'Accessor out of bounds')
    return [struct.unpack_from(fmt, data, offset + n * stride) for n in range(entry['count'])]


def identity():
    return [[int(i == j) for j in range(4)] for i in range(4)]


def multiply(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def node_matrix(node):
    if 'matrix' in node:
        return [[node['matrix'][j * 4 + i] for j in range(4)] for i in range(4)]
    x, y, z, w = node.get('rotation', [0, 0, 0, 1])
    sx, sy, sz = node.get('scale', [1, 1, 1])
    tx, ty, tz = node.get('translation', [0, 0, 0])
    return [
        [(1 - 2*y*y - 2*z*z)*sx, (2*x*y - 2*z*w)*sy, (2*x*z + 2*y*w)*sz, tx],
        [(2*x*y + 2*z*w)*sx, (1 - 2*x*x - 2*z*z)*sy, (2*y*z - 2*x*w)*sz, ty],
        [(2*x*z - 2*y*w)*sx, (2*y*z + 2*x*w)*sy, (1 - 2*x*x - 2*y*y)*sz, tz],
        [0, 0, 0, 1],
    ]


def scene_meshes(gltf):
    found = []

    def visit(index, parent, ancestors):
        require(index not in ancestors, 'Node cycle')
        node = gltf['nodes'][index]
        transform = multiply(parent, node_matrix(node))
        if 'mesh' in node:
            found.append((gltf['meshes'][node['mesh']], transform))
        for child in node.get('children', []):
            visit(child, transform, ancestors | {index})

    for root in gltf['scenes'][gltf.get('scene', 0)]['nodes']:
        visit(root, identity(), set())
    return found


def cross(a, b):
    return (a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0])


def cells(rows):
    result = {tuple(row[:3]): row[3] for row in rows}
    require(len(result) == len(rows), 'Duplicate occupancy cell')
    require(all(len(row) == 4 and all(type(v) is int for v in row) for row in rows), 'Noninteger material cell')
    return result


def validate_specimen(base, specimen):
    raw, gltf, binary = read_glb(base / specimen['glb'])
    require(hashlib.sha256(raw).hexdigest() == specimen['glb_sha256'], 'GLB hash differs from manifest')
    source = json.loads((base / specimen['occupancy']).read_text())
    original, retained, removed = [cells(source[k]) for k in ('original', 'retained', 'removed')]
    require(not (retained.keys() & removed.keys()) and retained | removed == original, 'Material cell conservation failed')
    require(len(original) == specimen['original_cells'] and len(removed) == specimen['removed_cells'], 'Count metadata mismatch')
    original_digest = hashlib.sha256(json.dumps([[*k, v] for k, v in sorted(original.items())], separators=(',', ':')).encode()).hexdigest()
    require(original_digest == source['occupancy_sha256'], 'Original occupancy hash mismatch')
    damage = damage_cells(original, specimen['state'], (0, round(specimen['height_m'] / CELL_SIZE) // 2))
    require(damage.retained == retained and damage.removed == removed, 'Exported occupancy differs from common damage mask')
    require(source['cell_size_m'] == CELL_SIZE == specimen['cell_m'], 'Cell lattice differs')
    normal_count = sum('normalTexture' in material for material in gltf.get('materials', []))
    require((normal_count > 0) == (specimen['style'] != 'voxel'), 'Normal mapping differs from declared technology')
    image_sizes = []
    for image in gltf.get('images', []):
        require('uri' not in image and 'bufferView' in image, 'External image is not bundled')
        data = buffer_view(gltf, binary, image['bufferView'])
        require(data[:8] == b'\x89PNG\r\n\x1a\n', 'Expected bundled PNG image')
        image_sizes.append(list(struct.unpack_from('>II', data, 16)))
    if specimen['style'] == 'voxel':
        require(image_sizes and all(size == [32, 12] for size in image_sizes), 'Voxel finish must use 32 x 12 pixel maps')
        for texture in gltf['textures']:
            sampler = gltf['samplers'][texture['sampler']]
            require(sampler.get('magFilter') == 9728 and sampler.get('minFilter') in (9728, 9984), 'Voxel texture uses interpolating filter')
    edges, directed, faces = Counter(), Counter(), set()
    vertices = set()
    volume = 0.0
    triangles = 0
    fracture_triangles = 0
    meshes = scene_meshes(gltf)
    for mesh, transform in meshes:
        for primitive in mesh['primitives']:
            require(primitive.get('mode', 4) == 4, 'Expected GLB triangles')
            position_data = accessor(gltf, binary, primitive['attributes']['POSITION'])
            positions = []
            for position in position_data:
                point = tuple(sum(transform[i][j] * (*position, 1)[j] for j in range(4)) for i in range(3))
                require(all(math.isfinite(v) and abs(v / CELL_SIZE - round(v / CELL_SIZE)) < 1e-6 for v in point), 'Exported position off cell lattice')
                # Convert glTF Y-up coordinates back to the Blender source frame.
                point = (point[0], -point[2], point[1])
                key = tuple(round(v / CELL_SIZE) for v in point)
                positions.append(key)
                vertices.add(key)
            indices = [row[0] for row in accessor(gltf, binary, primitive['indices'])]
            require(len(indices) % 3 == 0, 'Incomplete triangle')
            for offset in range(0, len(indices), 3):
                triangle = tuple(positions[i] for i in indices[offset:offset + 3])
                require(len(set(triangle)) == 3, 'Degenerate triangle vertices')
                face_key = tuple(sorted(triangle))
                require(face_key not in faces, 'Duplicate coplanar triangle')
                faces.add(face_key)
                a, b, c = triangle
                ab = tuple(b[i] - a[i] for i in range(3))
                ac = tuple(c[i] - a[i] for i in range(3))
                normal = cross(ab, ac)
                require(sum(v != 0 for v in normal) == 1, 'Expected nondegenerate axis-aligned lattice face')
                center = tuple(sum(p[i] for p in triangle) / 3 for i in range(3))
                unit = tuple(0 if v == 0 else (1 if v > 0 else -1) for v in normal)
                inside = tuple(math.floor(center[i] - unit[i] * 1e-6) for i in range(3))
                outside = tuple(math.floor(center[i] + unit[i] * 1e-6) for i in range(3))
                require(inside in retained and outside not in retained, 'Exported face does not bound retained occupancy')
                material_name = gltf['materials'][primitive['material']]['name']
                expected_role = source['roles'][0 if outside in original else retained[inside]]
                require(expected_role in material_name, 'Exported face material does not match original finish or exposed core')
                fracture_triangles += int(outside in original)
                for p, q in ((a, b), (b, c), (c, a)):
                    edges[tuple(sorted((p, q)))] += 1
                    directed[(p, q)] += 1
                bc = cross(b, c)
                volume += sum(a[i] * bc[i] for i in range(3)) / 6 * CELL_SIZE ** 3
                triangles += 1
    require(all(count == 2 for count in edges.values()), 'Non-manifold or unclosed welded GLB edges')
    require(all(directed[(q, p)] == count for (p, q), count in directed.items()), 'Inconsistent outward GLB winding')
    expected_volume = len(retained) * CELL_SIZE ** 3
    require(volume > 0 and math.isclose(volume, expected_volume, abs_tol=1e-8), 'Exported volume differs from remaining material')
    require(triangles == specimen['triangles'], 'Export triangle metadata mismatch')
    bounds = [[min(p[i] for p in vertices) * CELL_SIZE for i in range(3)], [max(p[i] for p in vertices) * CELL_SIZE for i in range(3)]]
    require(bounds == specimen['bounds_m'], 'Exported bounds differ from manifest')
    require(bounds[0][2] == 0 and bounds[1][2] == specimen['height_m'], 'Height endpoint mismatch')
    if specimen['style'] == 'mapped' and specimen['state'] == 'intact':
        require(triangles == 12, 'Mapped intact panel should be a six-face cuboid')
    return ({'slug': specimen['slug'], 'glb_sha256': specimen['glb_sha256'], 'original_cells': len(original),
             'removed_cells': len(removed), 'retained_cells': len(retained), 'triangles': triangles,
             'welded_vertices': len(vertices), 'volume_m3': volume, 'expected_volume_m3': expected_volume,
             'fresh_core_triangles': fracture_triangles,
             'normal_mapped_materials': normal_count, 'embedded_image_sizes': image_sizes,
             'closed_and_consistently_wound': True, 'surface_matches_remaining_cells': True}, original)


def validate(base):
    specimens = json.loads((base / 'specimens.json').read_text())
    reports, originals = [], {}
    for specimen in specimens:
        try:
            report, original = validate_specimen(base, specimen)
        except Exception as error:
            raise ValueError(f"{specimen['slug']}: {error}") from error
        reports.append(report)
        originals[specimen['slug']] = original
    stepped = originals['stepped-h300-intact']
    voxel = originals['voxel-h300-intact']
    require(stepped.keys() != voxel.keys(), 'Stepped and sampled-voxel geometry must differ')
    return {'schema': 'sidereal.hull-voxel-study.glb-validation.v1', 'directory': str(base),
            'passed': True, 'specimens': reports, 'stepped_vs_voxel_different_cells': len(stepped.keys() ^ voxel.keys()),
            'checks': ['actual GLB buffers and transformed positions', 'same damage masks and material conservation',
                       '62.5 mm lattice and exact height bounds', 'closed welded edges and consistent outward winding',
                       'every triangle bounds retained occupancy and preserves surface/core material', 'positive remaining-cell volume',
                       'bundled textures and correct normal/nearest-filter technology']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--revision', type=int, default=2)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    folder = root / 'assets/art-library/hull-voxel-study' / f'review-r{args.revision:03d}'
    print(json.dumps(validate(folder), indent=2))
