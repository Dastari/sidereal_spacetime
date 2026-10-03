#!/usr/bin/env python3
"""Produce a new immutable, source-pinned object lighting descriptor; never edit study assets."""
import argparse
import hashlib
import json
import math
import struct
from pathlib import Path


def glb(path):
    data = path.read_bytes()
    size = struct.unpack_from('<I', data, 12)[0]
    document = json.loads(data[20:20 + size])
    offset = 20 + size
    binary_size = struct.unpack_from('<I', data, offset)[0]
    return data, document, data[offset + 8:offset + 8 + binary_size]


def accessor(document, binary, index):
    row = document['accessors'][index]
    view = document['bufferViews'][row['bufferView']]
    code, width = {5121: ('B', 1), 5123: ('H', 2), 5125: ('I', 4), 5126: ('f', 4)}[row['componentType']]
    count = {'SCALAR': 1, 'VEC3': 3}[row['type']]
    stride = view.get('byteStride', width * count)
    offset = view.get('byteOffset', 0) + row.get('byteOffset', 0)
    return [struct.unpack_from('<' + code * count, binary, offset + i * stride) for i in range(row['count'])]


def lens_centroid(document, binary, names):
    sums = [0.0, 0.0, 0.0]
    total = 0.0
    for node in document['nodes']:
        if 'mesh' not in node:
            continue
        if any(key in node for key in ['matrix', 'translation', 'rotation', 'scale']):
            raise ValueError('Fixture socket producer requires identity exported nodes')
        for primitive in document['meshes'][node['mesh']]['primitives']:
            if document['materials'][primitive['material']]['name'] not in names:
                continue
            vertices = accessor(document, binary, primitive['attributes']['POSITION'])
            indices = [x[0] for x in accessor(document, binary, primitive['indices'])]
            for i in range(0, len(indices), 3):
                a, b, c = [vertices[k] for k in indices[i:i + 3]]
                u = [b[j] - a[j] for j in range(3)]
                v = [c[j] - a[j] for j in range(3)]
                cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
                area = math.hypot(*cross) / 2
                total += area
                for j in range(3):
                    sums[j] += area * (a[j] + b[j] + c[j]) / 3
    if not total:
        raise ValueError('Fixture has no measured lens surface')
    return [x / total for x in sums]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    if args.out.exists():
        raise ValueError('Immutable lighting revision already exists')
    manifest_bytes = (args.source / 'manifest.json').read_bytes()
    layout_bytes = (args.source / 'layout.json').read_bytes()
    manifest = json.loads(manifest_bytes)
    layout = json.loads(layout_bytes)
    fixtures = {
        'prop.props_bridge.wall_light_cyan_v': ('emit_a', 0.35, 1.6),
        'prop.props_walls.walls_hall_lampcol': ('emit_a', 0.35, 1.6),
        'prop.props_workrooms.wall_lamp_amber': ('emit_b', 0.35, 1.6),
        'prop.props_quarters.locker_lit': ('emit_a@high', 0.25, 1.2),
    }
    assets = []
    for piece in manifest['pieces']:
        if piece['role'] != 'room-content' and piece['id'] != 'engine.pod.w2.4.l5.z-0.75_1.6':
            continue
        data, document, binary = glb(args.source / piece['file'])
        pin = hashlib.sha256(data).hexdigest()
        if pin != piece['sha256']:
            raise ValueError('Source pin mismatch: ' + piece['id'])
        emissions = {}
        for material in document['materials']:
            factor = material.get('emissiveFactor', [0, 0, 0])
            if any(factor):
                emissions[material['name']] = {'factor': factor, 'strength': material.get('extensions', {}).get('KHR_materials_emissive_strength', {}).get('emissiveStrength', 1)}
        if not emissions:
            continue
        sockets = []
        if piece['id'] in fixtures:
            name, intensity, reach = fixtures[piece['id']]
            sockets.append({'id': 'lens', 'position': lens_centroid(document, binary, [name]), 'color': emissions[name]['factor'], 'intensity': intensity, 'range': reach, 'provenance': {'kind': 'area-weighted-exported-lens-centroid', 'material': name, 'gameCalibration': 'bounded shadowless real-time local proxy'}})
        elif piece['id'] == 'engine.pod.w2.4.l5.z-0.75_1.6':
            source_light = next(x for x in layout['lights'] if x['name'] == 'LT_engine_mid')
            placement = next(x for x in layout['placements'] if x['object'] == 'ENGINE_pod_mid')
            local = [source_light['location'][i] - placement['matrix'][i][3] for i in range(3)]
            sockets.append({'id': 'aperture', 'position': [local[0], local[2], -local[1]], 'color': source_light['colour'], 'intensity': 1.2, 'range': 2.4, 'provenance': {'kind': 'authored-layout-engine-socket', 'sourceNames': ['LT_engine_far', 'LT_engine_mid', 'LT_engine_near'], 'watts': source_light['watts'], 'radius': source_light['radius'], 'gameCalibration': 'bounded1.2 intensity; Blender watts are not Babylon intensity units'}})
        if piece['id'] in fixtures and piece['id'] != 'prop.props_quarters.locker_lit':
            sockets[0]['direction'] = [0, 0, -1]
            sockets[0]['angle'] = math.pi * 0.8
        assets.append({'id': piece['id'], 'sha256': pin, 'emissions': emissions, 'sockets': sockets})
    payload = {'schema': 'authored-asset-lighting/v1', 'frame': 'glTF-Y-up', 'producer': {'file': 'scripts/art_library/wayfarer_asset_lighting.py', 'sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}, 'sources': {'manifestSha256': hashlib.sha256(manifest_bytes).hexdigest(), 'layoutSha256': hashlib.sha256(layout_bytes).hexdigest()}, 'assets': assets}
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, indent=2) + '\n')
    print(hashlib.sha256(args.out.read_bytes()).hexdigest(), len(assets), 'emissive reusable assets')


if __name__ == '__main__':
    main()
