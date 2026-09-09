"""Qualify exported carrier contact geometry and unchanged closed payload envelopes.

This is dimensional evidence, never a strength or publication approval.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import struct
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'scripts'))
from audit_cargo_grid import IDENTITY, multiply, node_matrix, transform, glb_bounds


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def triangles(path):
    raw = path.read_bytes()
    magic, version, length = struct.unpack_from('<III', raw)
    assert magic == 0x46546c67 and version == 2 and length == len(raw)
    offset = 12
    while offset < len(raw):
        size, kind = struct.unpack_from('<II', raw, offset)
        chunk = raw[offset+8:offset+8+size]
        if kind == 0x4e4f534a:
            doc = json.loads(chunk)
        elif kind == 0x004e4942:
            blob = chunk
        offset += size+8

    def accessor(index):
        a = doc['accessors'][index]
        assert 'sparse' not in a
        view = doc['bufferViews'][a['bufferView']]
        assert view.get('buffer', 0) == 0
        fmt = {5126: 'f', 5125: 'I', 5123: 'H', 5121: 'B'}[a['componentType']]
        width = {'SCALAR': 1, 'VEC3': 3}[a['type']]
        size = struct.calcsize('<'+fmt*width)
        start = view.get('byteOffset', 0)+a.get('byteOffset', 0)
        return [struct.unpack_from('<'+fmt*width, blob, start+i*view.get('byteStride', size)) for i in range(a['count'])]

    def walk(index, parent):
        node = doc['nodes'][index]
        matrix = multiply(parent, node_matrix(node))
        if 'mesh' in node:
            for primitive in doc['meshes'][node['mesh']]['primitives']:
                assert primitive.get('mode', 4) == 4
                vertices = []
                for point in accessor(primitive['attributes']['POSITION']):
                    p = transform(matrix, point)
                    vertices.append((p[0], -p[2], p[1]))
                indices = [p[0] for p in accessor(primitive['indices'])] if 'indices' in primitive else list(range(len(vertices)))
                assert len(indices) % 3 == 0
                for i in range(0, len(indices), 3):
                    yield node['name'], [vertices[j] for j in indices[i:i+3]]
        for child in node.get('children', []):
            yield from walk(child, matrix)
    result = list(t for root in doc['scenes'][doc.get('scene', 0)]['nodes'] for t in walk(root, IDENTITY))
    return result, doc


def payload_fit(row, interface):
    lo, hi = row['visualBoundsAuthorM']['min'], row['visualBoundsAuthorM']['max']
    size = [b-a for a, b in zip(lo, hi)]
    area = interface['payloadCellInteriorM']
    width, depth = area[2]-area[0], area[3]-area[1]
    height = interface['payloadCeilingM']-interface['payloadFloorM']
    turns = [q for q in range(4) if size[q % 2] <= width+1e-6 and size[1-q % 2] <= depth+1e-6 and size[2] <= height+1e-6]
    return {'assetId': row['assetId'], 'appearance': row['appearance'], 'revision': row['revision'],
            'glbSha256': row['glbSha256'], 'blendSha256': row['blendSha256'],
            'dimensionsM': size, 'closedEnvelopeFits': bool(turns), 'allowedQuarterTurns': turns,
            'heightExcessM': max(0, size[2]-height), 'footprintExcessM': max(0, max(size[:2])-width),
            'sourceCenterAuthorM': [(a+b)/2 for a, b in zip(lo[:2], hi[:2])],
            'placementRule': 'Rotate about measured closed-bounds XY center, translate center to carrier cell center; source bottom to payloadFloorM; scale exactly1.',
            'restraintQualified': False, 'filledLoadApproved': False}


def validate(directory):
    assets = []
    for tag in ['carrier-1m', 'carrier-2m']:
        interface = json.loads((directory/(tag+'-interface.json')).read_text())
        tris, doc = triangles(directory/(tag+'.glb'))
        assert not any('PROXY' in name or 'COLLISION' in name for name, _ in tris)
        bounds = glb_bounds(directory/(tag+'.glb'))
        assert all(abs(bounds['min'][i]) < 1e-6 and abs(bounds['max'][i]-interface['nominalSizeM'][i]) < 1e-6 for i in range(3))
        evidence = []
        for patch in interface['bearingPatches']:
            rect = patch['rectM']
            for side, direction in [('bottom', -1), ('top', 1)]:
                plane = patch[side+'PlaneM']
                faces = [points for name, points in tris if name == patch[side+'Mesh'] and all(abs(p[2]-plane) < 1e-6 for p in points)]
                assert len(faces) == 2, (tag, patch['id'], side, len(faces))
                area = 0
                for a, b, c in faces:
                    nz = (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
                    assert nz*direction > 0
                    assert all(rect[0]-1e-6 <= p[0] <= rect[2]+1e-6 and rect[1]-1e-6 <= p[1] <= rect[3]+1e-6 for p in [a, b, c])
                    area += abs(nz)/2
                assert abs(area-(rect[2]-rect[0])*(rect[3]-rect[1])) < 1e-6
                evidence.append({'patchId': patch['id'], 'side': side, 'triangleCount': len(faces), 'actualAreaM2': area, 'planeM': plane})
        # Every collision box remains inside the exact nominal envelope.
        assert all(all(-1e-6 <= a < b <= interface['nominalSizeM'][i]+1e-6 for i, (a, b) in enumerate(zip(box['min'], box['max']))) for box in interface['collisionBoxes'])
        # Actual collision-enabled native vertices must lie within their authored proxy.
        for box in interface['collisionBoxes']:
            points = [p for name, points in tris if name == 'GEO-'+tag+'-'+box['id'] for p in points]
            assert points and all(all(box['min'][i]-1e-6 <= p[i] <= box['max'][i]+1e-6 for i in range(3)) for p in points)
        assets.append({'assetId': tag, 'glbSha256': digest(directory/(tag+'.glb')), 'interfaceSha256': digest(directory/(tag+'-interface.json')),
                       'boundsM': bounds, 'triangles': len(tris), 'materialCount': len(doc['materials']), 'bearingEvidence': evidence,
                       'contactGeometryQualified': True, 'collisionRepresentation': 'Conservative component boxes; bevel clearance is intentionally not walkable.', 'loadApproval': False})
    audit = json.loads((ROOT/'docs/handoffs/cargo_grid_model_audit.json').read_text())
    rows = [payload_fit(row, interface) for row in audit['rows']]
    fixture = json.loads((directory/'fixture.json').read_text())
    assert fixture['stackTopM']+fixture['handlingClearanceM'] <= fixture['roofUndersideM']
    assert all(next(r for r in rows if r['assetId'] == p['assetId'])['closedEnvelopeFits'] and p['scale'] == [1, 1, 1] for p in fixture['payloads'])
    result = {'schema': 'sidereal.carrier-qualification.v1', 'approvedCargoManifestSha256': audit['approvedManifestSha256'],
              'sourceSha256': digest(directory/'blender-source.blend'), 'fixtureSourceSha256': digest(directory/'stack-fixture.blend'),
              'assets': assets, 'payloadCellM': [.8125, .8125, .53125], 'compatibleAssetCount': sum(r['closedEnvelopeFits'] for r in rows),
              'payloads': rows, 'fixtureClearancePassed': True, 'ownerArtApproval': False, 'gameplayLoadApproval': False,
              'limitations': ['Closed envelope fit does not qualify individual payload restraints.', 'Taller/oversized payloads need different-height or larger carriers.', 'No lid opening while covered by an upper carrier.', 'No live publication or cargo-grid registration.']}
    (directory/'qualification.json').write_text(json.dumps(result, indent=2)+'\n')
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('directory', type=Path)
    report = validate(parser.parse_args().directory)
    print(json.dumps({'carrierCount': len(report['assets']), 'compatible': report['compatibleAssetCount'], 'total': len(report['payloads']), 'bearingGeometry': 'passed'}))
