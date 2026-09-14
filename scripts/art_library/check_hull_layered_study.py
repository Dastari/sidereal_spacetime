"""Read-only validation of actual GLB bytes for the layered hull study.

This checks geometry and panel skin coverage, not authority or room pressure.
"""
import argparse
from collections import Counter
import hashlib
import json
import math
from pathlib import Path
import struct

from check_hull_voxel_study import (
    accessor, buffer_view, cells, cross, identity, multiply, node_matrix,
    read_glb, require, scene_meshes,
)
from hull_layered_contract import CELL, damage_cells, panel_layout

ROLES = ('inner_skin', 'rib', 'outer_armor', 'fracture')


def source_frame(point):
    return point[0], -point[2], point[1]


def scene_sockets(gltf):
    found = {}
    def visit(index, parent, ancestors):
        require(index not in ancestors, 'Node cycle')
        node = gltf['nodes'][index]
        local = node_matrix(node)
        # No inherited object scaling may hide a stretched lattice or texture.
        for i in range(3):
            require(math.isclose(sum(local[j][i] ** 2 for j in range(3)), 1, abs_tol=1e-7), 'Scaled node transform')
            for k in range(i):
                require(abs(sum(local[j][i] * local[j][k] for j in range(3))) < 1e-7, 'Sheared node transform')
        matrix = multiply(parent, local)
        name = node.get('extras', {}).get('interface_name')
        if name:
            require(name.startswith('HULL_') and node.get('name', '').startswith(name), 'Socket name/metadata mismatch')
            require(name not in found, 'Duplicate interface socket')
            found[name] = source_frame(tuple(matrix[i][3] for i in range(3)))
        for child in node.get('children', []):
            visit(child, matrix, ancestors | {index})
    for root in gltf['scenes'][gltf.get('scene', 0)]['nodes']:
        visit(root, identity(), set())
    return found


def validate_specimen(base, meta):
    raw, gltf, binary = read_glb(base / meta['glb'])
    require(hashlib.sha256(raw).hexdigest() == meta['glb_sha256'], 'GLB digest mismatch')
    source = json.loads((base / 'panels' / (meta['slug'] + '.occupancy.json')).read_text())
    original, retained, removed = [cells(source[k]) for k in ('original', 'retained', 'removed')]
    require(not retained.keys() & removed.keys() and retained | removed == original, 'Cell/material conservation failed')
    require(len(original) == meta['original_cells'] and len(removed) == meta['removed_cells'], 'Cell count differs from manifest')
    w, h, interior = meta['width_m'], meta['height_m'], meta['interior']
    layout = panel_layout(w, h, interior)
    require(meta['layout'] == layout, 'Layout contract differs from manifest')
    require(meta['cell_m'] == source['cell_m'] == CELL, 'Wrong damage/visual lattice')
    require(meta['lattice_origin_m'] == layout['lattice_origin_m'], 'Wrong centred lattice origin')
    damage = damage_cells(original, meta['state'], w, h, interior)
    require(damage.retained == retained and damage.removed == removed, 'Depth mask differs from actual removed cells')
    sockets = scene_sockets(gltf)
    require(set(sockets) == set(layout['sockets']), 'Required socket set differs')
    for name, expected in layout['sockets'].items():
        require(all(math.isclose(a, b, abs_tol=1e-8) for a, b in zip(sockets[name], expected)), 'Actual socket position differs: ' + name)
        require(list(expected) == meta['sockets_m'][name], 'Manifest socket differs: ' + name)
    normal_count = sum('normalTexture' in m for m in gltf.get('materials', []))
    require(normal_count > 0, 'Missing mapped finish normals')
    image_sizes = []
    for image in gltf.get('images', []):
        require('uri' not in image and 'bufferView' in image, 'Unbundled texture')
        data = buffer_view(gltf, binary, image['bufferView'])
        require(data[:8] == b'\x89PNG\r\n\x1a\n', 'Expected embedded PNG')
        image_sizes.append(list(struct.unpack_from('>II', data, 16)))
    require(image_sizes and all(size == [512, 384] for size in image_sizes), 'Wrong fixed-scale material maps')
    edges, directed, faces = Counter(), Counter(), set()
    vertices = set()
    triangles = fracture_triangles = 0
    volume = back_area = 0.0
    xmin = -4 if interior else 0
    for mesh, transform in scene_meshes(gltf):
        for primitive in mesh['primitives']:
            require(primitive.get('mode', 4) == 4, 'Expected triangles')
            positions = []
            for position in accessor(gltf, binary, primitive['attributes']['POSITION']):
                point = source_frame(tuple(sum(transform[i][j] * (*position, 1)[j] for j in range(4)) for i in range(3)))
                lattice = (point[0] / CELL, (point[1] + w / 2) / CELL, point[2] / CELL)
                require(all(math.isfinite(v) and abs(v - round(v)) < 1e-6 for v in lattice), 'Actual GLB point off declared lattice')
                key = tuple(round(v) for v in lattice)
                positions.append(key)
                vertices.add(key)
            indices = [r[0] for r in accessor(gltf, binary, primitive['indices'])]
            require(len(indices) % 3 == 0, 'Incomplete triangle')
            material = gltf['materials'][primitive['material']]
            for offset in range(0, len(indices), 3):
                triangle = tuple(positions[i] for i in indices[offset:offset+3])
                require(len(set(triangle)) == 3, 'Degenerate triangle')
                face_key = tuple(sorted(triangle))
                require(face_key not in faces, 'Duplicate coplanar face')
                faces.add(face_key)
                a, b, c = triangle
                normal = cross(tuple(b[i]-a[i] for i in range(3)), tuple(c[i]-a[i] for i in range(3)))
                require(sum(v != 0 for v in normal) == 1, 'Non-axis-aligned or degenerate surface')
                unit = tuple(0 if v == 0 else 1 if v > 0 else -1 for v in normal)
                center = tuple(sum(p[i] for p in triangle) / 3 for i in range(3))
                inside = tuple(math.floor(center[i] - unit[i] * 1e-6) for i in range(3))
                outside = tuple(math.floor(center[i] + unit[i] * 1e-6) for i in range(3))
                require(inside in retained and outside not in retained, 'Face does not bound retained material')
                expected_role = ROLES[3 if outside in original else retained[inside]]
                require(expected_role in material['name'], 'Fresh fracture/original layer role mismatch')
                fracture_triangles += int(outside in original)
                if all(p[0] == xmin for p in triangle) and normal[0] < 0:
                    back_area += abs(normal[0]) / 2 * CELL ** 2
                for p, q in ((a,b),(b,c),(c,a)):
                    edges[tuple(sorted((p,q)))] += 1
                    directed[(p,q)] += 1
                bc = cross(b,c)
                volume += sum(a[i]*bc[i] for i in range(3)) / 6 * CELL ** 3
                triangles += 1
    require(all(n == 2 for n in edges.values()), 'Unclosed/nonmanifold GLB edge')
    require(all(directed[(q,p)] == count for (p,q),count in directed.items()), 'Inconsistent outward winding')
    require(volume > 0 and math.isclose(volume, len(retained)*CELL**3, abs_tol=1e-8), 'Actual remaining volume mismatch')
    require(triangles == meta['triangles'], 'Triangle metadata mismatch')
    bounds = [[min(p[i] for p in vertices)*CELL for i in range(3)], [max(p[i] for p in vertices)*CELL for i in range(3)]]
    for end in bounds:
        end[1] -= w/2
    require(bounds == [layout['bounds']['min'], layout['bounds']['max']], 'Panel width/height/depth bounds mismatch')
    missing = damage.metadata['missing_inner_skin_cells']
    require(math.isclose(back_area, w*h - missing*CELL**2, abs_tol=1e-8), 'Actual GLB back surface does not match skin occupancy')
    if meta['state'] != 'through':
        require(damage.metadata['barrier_intact'], 'Partial damage unexpectedly perforates inner skin')
    else:
        require(not damage.metadata['barrier_intact'] and back_area < w*h, 'Through damage lacks actual back-skin hole')
    return {
        'slug': meta['slug'], 'glb_sha256': meta['glb_sha256'], 'triangles': triangles,
        'original_cells': len(original), 'retained_cells': len(retained), 'removed_cells': len(removed),
        'closed_and_consistently_wound': True, 'volume_m3': volume,
        'fresh_fracture_triangles': fracture_triangles, 'bounds_m': bounds,
        'normal_mapped_materials': normal_count, 'embedded_image_sizes': image_sizes,
        'actual_sockets_m': sockets, 'actual_back_skin_area_m2': back_area,
        'barrier_intact': damage.metadata['barrier_intact'], 'missing_inner_skin_cells': missing,
    }, original, retained, faces


def validate(base):
    specs = json.loads((base/'specimens.json').read_text())
    reports, geometry_groups = [], {}
    for meta in specs:
        try:
            report, original, retained, faces = validate_specimen(base, meta)
        except Exception as error:
            raise ValueError(f"{meta['slug']}: {error}") from error
        reports.append(report)
        key = (meta['width_m'], meta['height_m'], meta['interior'], meta['state'])
        geometry_groups.setdefault(key, []).append((meta['finish'], original, retained, faces))
    swap_groups = []
    for key, rows in geometry_groups.items():
        if len(rows) < 2:
            continue
        reference = rows[0]
        require(all(r[1:] == reference[1:] for r in rows[1:]), 'Finish swap changes original cells, damage or actual surface geometry')
        swap_groups.append({'width_m':key[0], 'height_m':key[1], 'state':key[3], 'finishes':[r[0] for r in rows]})
    require(len(swap_groups) >= 4, 'Missing three-finish damage comparison coverage')
    # Actual exported sockets compose into exact adjacent spans and aligned grids.
    anchor_report = []
    intact = [r for r in reports if r['slug'].startswith('explorer-') and r['slug'].endswith('-intact')]
    for a in intact:
        for b in intact:
            sa, sb = a['actual_sockets_m'], b['actual_sockets_m']
            translation = tuple(sa['HULL_EDGE_END'][i]-sb['HULL_EDGE_START'][i] for i in range(3))
            actual = tuple(translation[i]+sb['HULL_EDGE_START'][i] for i in range(3))
            require(all(math.isclose(actual[i],sa['HULL_EDGE_END'][i],abs_tol=1e-8) for i in range(3)), 'Adjacent socket composition mismatch')
            require(all(abs(v/CELL-round(v/CELL))<1e-7 for v in actual), 'Joined edge is off lattice')
            anchor_report.append({'a':a['slug'], 'b':b['slug'], 'translate_b_m':translation})
    return {
        'schema':'sidereal.hull-layered-study.glb-validation.v1', 'passed':True,
        'directory':str(base), 'cell_size_m':CELL, 'specimens':reports,
        'identical_geometry_finish_groups':swap_groups, 'adjacent_socket_pairs':anchor_report,
        'scope':'Offline model geometry and inner-skin coverage only. No game authority, room connectivity or pressure simulation claim.',
        'checks':['actual GLB buffers, transformed geometry and sockets', '31.25 mm local lattice with centred width offset',
                  'closed edges, consistent winding and positive retained volume', 'depth-limited damage and material conservation',
                  'fresh fracture faces retain dedicated bare material role', 'actual back-skin surface distinguishes partial and through cuts',
                  'no node scaling; declared span, depth and height bounds', 'swappable finishes preserve cells and exported triangle geometry',
                  'embedded normal/color/roughness maps', 'adjacent exported socket alignment'],
    }


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--revision',type=int,default=3)
    args=parser.parse_args()
    base=Path(__file__).resolve().parents[2]/'assets/art-library/hull-voxel-study'/f'review-r{args.revision:03d}'
    print(json.dumps(validate(base),indent=2))
