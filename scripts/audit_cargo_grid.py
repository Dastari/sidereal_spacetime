"""Read-only exact approved cargo artifact audit. No model edits or publication.

GLB neutral scene bounds are measured from actual POSITION vertices after node
transforms, then converted back to author XYZ (metres; Z is deck height).
Reservations are fitting proposals, not collision, mass or stacking authority.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import struct

ROOT = Path(__file__).resolve().parents[1]
IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]


def multiply(a, b):
    return [sum(a[k * 4 + row] * b[col * 4 + k] for k in range(4))
            for col in range(4) for row in range(4)]


def node_matrix(node):
    if 'matrix' in node:
        return node['matrix']
    x, y, z, w = node.get('rotation', [0, 0, 0, 1])
    sx, sy, sz = node.get('scale', [1, 1, 1])
    tx, ty, tz = node.get('translation', [0, 0, 0])
    return [(1-2*(y*y+z*z))*sx, 2*(x*y+z*w)*sx, 2*(x*z-y*w)*sx, 0,
            2*(x*y-z*w)*sy, (1-2*(x*x+z*z))*sy, 2*(y*z+x*w)*sy, 0,
            2*(x*z+y*w)*sz, 2*(y*z-x*w)*sz, (1-2*(x*x+y*y))*sz, 0,
            tx, ty, tz, 1]


def transform(matrix, point):
    p = [*point, 1]
    return [sum(matrix[k*4+i]*p[k] for k in range(4)) for i in range(3)]


def glb_bounds(path):
    data = path.read_bytes()
    magic, version, length = struct.unpack_from('<III', data)
    if magic != 0x46546C67 or version != 2 or length != len(data):
        raise ValueError('Invalid GLB header')
    offset, document, binary = 12, None, None
    while offset < len(data):
        size, kind = struct.unpack_from('<II', data, offset)
        chunk = data[offset+8:offset+8+size]
        if kind == 0x4E4F534A:
            document = json.loads(chunk)
        elif kind == 0x004E4942:
            binary = chunk
        offset += size+8
    if not document or binary is None:
        raise ValueError('Embedded GLB scene/buffer required')
    lo, hi, count = [math.inf]*3, [-math.inf]*3, 0
    def walk(index, parent, ancestors):
        nonlocal count
        if index in ancestors:
            raise ValueError('Cyclic GLB scene')
        node = document['nodes'][index]
        matrix = multiply(parent, node_matrix(node))
        if 'skin' in node:
            raise ValueError('Cargo audit needs separate skinned-bounds policy')
        if 'mesh' in node:
            for primitive in document['meshes'][node['mesh']]['primitives']:
                if primitive.get('targets'):
                    raise ValueError('Cargo morph targets need separate envelope policy')
                accessor = document['accessors'][primitive['attributes']['POSITION']]
                if accessor['componentType'] != 5126 or accessor['type'] != 'VEC3' or 'sparse' in accessor:
                    raise ValueError('Unsupported cargo position accessor')
                view = document['bufferViews'][accessor['bufferView']]
                if view.get('buffer', 0) != 0:
                    raise ValueError('External cargo buffer unsupported')
                start = view.get('byteOffset', 0)+accessor.get('byteOffset', 0)
                stride = view.get('byteStride', 12)
                for i in range(accessor['count']):
                    p = transform(matrix, struct.unpack_from('<fff', binary, start+i*stride))
                    author = [p[0], -p[2], p[1]]
                    if not all(math.isfinite(v) for v in author):
                        raise ValueError('Nonfinite visual vertex')
                    for j in range(3):
                        lo[j] = min(lo[j], author[j]); hi[j] = max(hi[j], author[j])
                    count += 1
        for child in node.get('children', []):
            walk(child, matrix, ancestors | {index})
    scene = document['scenes'][document.get('scene', 0)]
    for root in scene['nodes']:
        walk(root, IDENTITY, set())
    if not count:
        raise ValueError('Cargo scene has no vertices')
    return {'min': lo, 'max': hi}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def proposed_reservation(bounds, step=.5):
    if not math.isfinite(step) or step <= 0:
        raise ValueError('Positive reservation step required')
    size = [b-a for a, b in zip(bounds['min'], bounds['max'])]
    if not all(math.isfinite(v) and v > 0 for v in size):
        raise ValueError('Finite positive bounds required')
    return [math.ceil((n-1e-6)/step)*step for n in size[:2]]


def audit():
    library = ROOT/'assets/art-library'
    approval = json.loads((library/'cargo-collection/approval/owner-approval.json').read_text())
    manifest_path = library/'cargo-collection/current/manifest.json'
    if digest(manifest_path) != approval['manifest_sha256']:
        raise ValueError('Exact owner-approved manifest changed')
    manifest = json.loads(manifest_path.read_text())
    rows = []
    for record in manifest['entries']:
        base = library/'designs'/record['design_id']/'revisions'/f"r{record['revision']:03}"
        candidates = [base/'glb.glb', *base.glob('appearances/**/glb.glb')]
        source = next((p for p in candidates if p.is_file() and digest(p) == record['glb_sha256']), None)
        if source is None or digest(source.parent/'blender-source.blend') != record['source_sha256']:
            raise ValueError('Exact paired approved source missing: '+record['appearance'])
        validation = json.loads((source.parent/'validation-blender.json').read_text())
        measured = glb_bounds(source)
        delta = max(abs(measured[k][i]-validation['bounds_m'][k][i]) for k in ['min', 'max'] for i in range(3))
        fit_path = source.parent/'fit.json'
        fit = json.loads(fit_path.read_text()) if fit_path.exists() else {}
        stack = validation.get('stacking', {})
        pitch = stack.get('pitch_m', fit.get('stack_pitch_m'))
        width = [measured['max'][i]-measured['min'][i] for i in range(3)]
        rows.append({
            'assetId': 'part-'+hashlib.sha256(('approved-cargo/'+record['design_id']+'/'+record['appearance']).encode()).hexdigest()[:20],
            'designId': record['design_id'], 'appearance': record['appearance'], 'revision': record['revision'],
            'glbPath': str(source.relative_to(ROOT)), 'glbSha256': record['glb_sha256'],
            'blendSha256': record['source_sha256'], 'visualBoundsAuthorM': measured,
            'visualDimensionsM': width, 'authoredValidationMaximumDeltaM': delta,
            'proposedHalfMetreReservationM': proposed_reservation(measured),
            'neutralHeightPlusHandlingM': width[2]+.15,
            'reportedStacking': stack, 'reportedEmptyStackPitchM': pitch,
            'pitchFitsExisting32UnitsPerMetre': bool(pitch and abs(pitch*32-round(pitch*32)) < 1e-5),
            'filledStackingApproved': fit.get('filled_stacking_approved') is True,
            'authorityInterfaceQualified': False,
            'interfaceGap': 'Visual approval does not qualify load ratings, mixed-size bearing coverage or a grid-aligned stacking carrier.',
        })
    if len(rows) != 73 or len({r['assetId'] for r in rows}) != 73:
        raise ValueError('Expected all73 distinct approved appearances')
    return {'version': 1, 'approvedManifestSha256': digest(manifest_path), 'assetCount': len(rows),
            'units': 'metres; author XY deck plane, Z height; visual GLB XYZ converts to X/-Z/Y',
            'status': 'Exact visual audit; reservation proposals only; no authority stacking interface approved by this report',
            'rows': rows}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    result = json.dumps(audit(), indent=2)+'\n'
    if args.output:
        args.output.write_text(result)
    else:
        print(result, end='')
