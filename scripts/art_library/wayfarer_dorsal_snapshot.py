"""Stage the exact completed dorsal exterior without modifying the existing live deck."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import struct

MANIFEST_SHA = '03bede58180b1b24a0643dbab44bcff0ce882ab299c9d48bb5a39d39c637466d'
LAYOUT_SHA = '3c0175cd220661ab6b0a281dab5e0ce219922d997ff0d1eaff0623e6f838a48c'
ROLES = frozenset(('canopy', 'engine-pod', 'hull-bay', 'hull-corner', 'livery',
                   'nose', 'structure', 'hull-upper', 'roof-skin', 'roof-shoulder',
                   'roof-module', 'roof-plinth', 'roof-joint'))
DEFAULT_SOURCE = Path('/root/sidereal-art-archive/wayfarer-dorsal-r001/export_flight')
DEFAULT_OUTPUT = Path(__file__).resolve().parents[2] / 'assets/runtime/ship-study/wayfarer-dorsal-r001'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def checked_relative(root, value):
    relative = Path(value)
    if relative.is_absolute() or '..' in relative.parts or not relative.parts:
        raise ValueError('Unsafe dorsal asset path')
    result = root / relative
    if not result.resolve().is_relative_to(root.resolve()):
        raise ValueError('Dorsal asset path leaves root')
    return result


def stage(source, output):
    if output.exists():
        raise ValueError('Dorsal revision already exists; never overwrite')
    manifest_bytes = (source / 'manifest.json').read_bytes()
    layout_bytes = (source / 'layout.json').read_bytes()
    if digest(manifest_bytes) != MANIFEST_SHA or digest(layout_bytes) != LAYOUT_SHA:
        raise ValueError('Changed completed flight metadata')
    manifest, layout = json.loads(manifest_bytes), json.loads(layout_bytes)
    if len(manifest['pieces']) != 250 or len(manifest['unique']) != 11 or len(layout['placements']) != 951:
        raise ValueError('Incomplete completed flight export')
    all_pieces = manifest['pieces'] + manifest['unique']
    verified = {}
    for row in all_pieces:
        data = checked_relative(source, row['file']).read_bytes()
        if digest(data) != row['sha256']:
            raise ValueError(f"Changed completed flight GLB: {row['id']}")
        if len(data) < 28 or struct.unpack_from('<III', data) != (0x46546c67, 2, len(data)):
            raise ValueError('Invalid dorsal GLB container')
        length, kind = struct.unpack_from('<II', data, 12)
        if kind != 0x4e4f534a or 20 + length + 8 > len(data):
            raise ValueError('Invalid dorsal GLB JSON chunk')
        document = json.loads(data[20:20 + length])
        triangles = sum(document['accessors'][primitive['indices']]['count'] // 3
                        for mesh in document['meshes'] for primitive in mesh['primitives'])
        if triangles != row['triangles']:
            raise ValueError('Dorsal source triangle count changed')
        verified[row['file']] = data
    if len(verified) != 261 or {str(p.relative_to(source)) for p in source.rglob('*.glb')} != set(verified):
        raise ValueError('Missing or unexpected flight GLBs')
    placements = [r for r in layout['placements'] if r.get('role') in ROLES]
    ids = {r['piece'] for r in placements}
    pieces = [r for r in all_pieces if r['id'] in ids]
    if len(placements) != 533 or len(pieces) != 98:
        raise ValueError('Changed bounded flight exterior cohort')
    normalized_pieces = []
    for row in pieces:
        normalized_pieces.append({
            'id': row['id'], 'file': row['file'], 'sha256': row['sha256'],
            'triangles': row['triangles'], 'frame': 'ship-node-baked' if row['id'].startswith('unique.') else 'piece-local',
            'boundsMin': row['bounds_min'], 'boundsMax': row['bounds_max'], 'materials': row['materials'],
        })
    identity = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]
    normalized_placements = [{
        'object': r['object'], 'piece': r['piece'], 'role': r['role'], 'room': None,
        'matrix': identity if r['piece'].startswith('unique.') else r['matrix'],
        'originalMatrix': r['matrix'], 'frame': 'ship-node-baked' if r['piece'].startswith('unique.') else 'piece-local',
        'trueScale': False, 'mirrored': r.get('mirrored', False),
    } for r in placements]
    descriptor = {
        'schema': 'sidereal.wayfarer-authored-flight.r001',
        'sourceManifestSha256': MANIFEST_SHA, 'sourceLayoutSha256': LAYOUT_SHA,
        'pieces': normalized_pieces, 'instances': normalized_placements, 'palette': manifest['palette'],
        'scope': 'Pinned authored flight exterior only; existing deck and authority unchanged.',
        'framePolicy': 'author-zup-column-rows; unique-node-baked-external-identity',
    }
    # Validate all inputs before creating an output directory; cleanup partial writes.
    created = False
    try:
        output.mkdir(parents=True)
        created = True
        for piece in pieces:
            destination = checked_relative(output, piece['file'])
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(verified[piece['file']])
            if digest(destination.read_bytes()) != piece['sha256']:
                raise ValueError('Dorsal copy mismatch')
        descriptor_bytes = (json.dumps(descriptor, indent=2) + '\n').encode()
        (output / 'descriptor.json').write_bytes(descriptor_bytes)
        if (source / 'manifest.json').read_bytes() != manifest_bytes or (source / 'layout.json').read_bytes() != layout_bytes:
            raise ValueError('Dorsal metadata changed during stage')
        for row in all_pieces:
            if digest(checked_relative(source, row['file']).read_bytes()) != row['sha256']:
                raise ValueError('Dorsal inputs changed during stage')
    except BaseException:
        if created:
            shutil.rmtree(output)
        raise
    return {'complete': True, 'sourceGlbsVerified': 261, 'selectedGlbs': 98, 'placements': 533,
            'placedTriangles': sum(next(p['triangles'] for p in pieces if p['id'] == r['piece']) for r in placements),
            'glbBytes': sum(len(verified[p['file']]) for p in pieces), 'descriptorSha256': digest(descriptor_bytes)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, default=DEFAULT_SOURCE)
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    print(json.dumps(stage(args.source, args.output)))
