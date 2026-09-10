"""Native export/authoring evidence at unchanged source pivots and placements.

No collider simplification, model resizing, live refit or placement repair.
Containment consumes raw exported vertices, including non-volumetric surfaces.
"""
import hashlib
import json
from pathlib import Path
import sys

import manifold3d as m
import trimesh

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts/art_library'))
from validate_reserved_envelope import qualify_points
from qualify_wayfarer_airlock_inlet import ROT
from qualify_wayfarer_placement_interfaces import MAP, shape


def floor_exports():
    specification = ROOT / 'assets/art-library/shipyard-floor/r002/specification.json'
    source = json.loads(specification.read_text())
    path = ROOT / 'assets/runtime/assembly/floor/r002/kit.glb'
    pinned_hash = '138b483f6052f01e23883b8d8b48bb72cdbace44727c8e717b1e6351c3593585'
    assert hashlib.sha256(path.read_bytes()).hexdigest() == pinned_hash
    scene = trimesh.load(path, force='scene')
    reports = []
    assigned = set()
    for component in source['components']:
        points = []
        nodes = []
        for name in scene.graph.nodes_geometry:
            if not name.startswith(component['node_prefix']):
                continue
            assert name not in assigned, 'Ambiguous asset node ownership'
            assigned.add(name)
            matrix, geometry = scene.graph[name]
            mesh = scene.geometry[geometry].copy()
            mesh.apply_transform(ROT @ matrix)
            points.extend(mesh.vertices.tolist())
            nodes.append(name)
        try:
            result = qualify_points(points, component['polygon_xy_m'], 0, source['thickness_m'])
            failure = None
        except ValueError as error:
            result = {}
            failure = str(error)
        reports.append({
            'assetId': component['id'], 'slug': component['slug'],
            'exportedNodes': nodes, 'reservedPolygonM': component['polygon_xy_m'],
            'reservedHeightM': [0, source['thickness_m']], 'pass': failure is None,
            'failure': failure, **result,
        })
    assert assigned == set(scene.graph.nodes_geometry), 'Unqualified extra exported geometry'
    return {
        'source': str(path.relative_to(ROOT)), 'sha256': pinned_hash,
        'specificationSha256': hashlib.sha256(specification.read_bytes()).hexdigest(),
        'allExportedGeometryAssigned': True, 'assets': reports,
        'allReservedEnvelopesPass': all(row['pass'] for row in reports),
    }


def boundary_intrusions():
    # Exact rectangular main-deck nominal union, before the separately authored
    # cockpit extension. Test only source pieces explicitly named exterior wall.
    # Partitions may consume their own explicitly reserved strip, not this test.
    usable = m.Manifold.cube([10, 18, 1.8]).translate([-5, -9, .1875])
    rows = []
    for part in json.loads(MAP.read_text())['preserveOriginalPlacements']:
        if part['role'] != 'structural-wall-unqualified' or not part['sourcePlacedId'].startswith('wall-'):
            continue
        body, pin = shape(part)
        bounds = body.bounding_box()
        if not (bounds[0] <= -5 + 1e-7 or bounds[3] >= 5 - 1e-7 or bounds[1] <= -9 + 1e-7):
            continue
        intersection = usable ^ body
        if intersection.volume() <= 1e-9:
            continue
        rows.append({
            'placedId': part['sourcePlacedId'], 'assetId': part['assetId'],
            'source': pin, 'sourceTransform': part['originalPlacement'],
            'nativeIntersectionM3': intersection.volume(),
            'intersectionBoundsM': intersection.bounding_box(),
            'verdict': 'Boundary-bearing asset overlaps usable deck; separate any integrated partition geometry and correct exterior authoring datum',
        })
    return {
        'testedUsableMainDeckPrismM': {'min': [-5, -9, .1875], 'max': [5, 9, 1.9875]},
        'intrusions': rows,
        'scope': 'Native wall groups touching port/starboard/aft nominal boundary; groups may also contain integrated partitions. Does not certify full cockpit, overhead or z-fighting.',
    }


def locker_export():
    specification = ROOT / 'assets/art-library/designs/shipyard.equipment.wall-locker/revisions/r005/specification.json'
    source = json.loads(specification.read_text())
    variant = source['variants'][0]
    path = ROOT / 'assets/runtime/assembly/equipment/part-c03ec0260cd7329050a8/glb.glb'
    pinned_hash = 'f527af1e44fc1570355c2268055b7b31343c45849a807b40993cf516c263093a'
    assert hashlib.sha256(path.read_bytes()).hexdigest() == pinned_hash
    scene = trimesh.load(path, force='scene')
    points = []
    for name in scene.graph.nodes_geometry:
        matrix, geometry = scene.graph[name]
        mesh = scene.geometry[geometry].copy()
        mesh.apply_transform(ROT @ matrix)
        points.extend(mesh.vertices.tolist())
    lo, hi = variant['bounds_m']['min'], variant['bounds_m']['max']
    result = qualify_points(points, [[lo[0], lo[1]], [hi[0], lo[1]], [hi[0], hi[1]], [lo[0], hi[1]]], lo[2], hi[2])
    return {
        'assetId': variant['asset_id'], 'source': str(path.relative_to(ROOT)),
        'sha256': pinned_hash, 'specificationSha256': hashlib.sha256(specification.read_bytes()).hexdigest(),
        'fitsExistingDeclaredBodyEnvelope': True, **result,
        'socketStatus': 'Source SOCK_MOUNT/POWER/DATA remain proposed; no qualified mating contact/normal/clearance envelope',
        'limitation': 'Body envelope conformance does not certify the wall-recess placement or a 2m-grid mounting interface',
    }


def audit():
    return {
        'schema': 'sidereal.wayfarer-authored-envelope-audit.v1',
        'sourceMappingSha256': hashlib.sha256(MAP.read_bytes()).hexdigest(),
        'floorKit': floor_exports(), 'locker': locker_export(), 'structuralDatums': boundary_intrusions(),
        'placementTransformsChanged': 0, 'assetSourcesChanged': 0,
        'publicationQualified': False,
        'requiredCorrection': 'New native structural/equipment interface revisions at stable placement datums. Do not repair asset nonconformance through per-placement compensation.',
    }


if __name__ == '__main__':
    report = audit()
    output = ROOT / '.runtime/wayfarer-authored-envelope-audit.json'
    output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'output': str(output), 'floorShapes': len(report['floorKit']['assets']),
                      'floorEnvelopesPass': report['floorKit']['allReservedEnvelopesPass'],
                      'wallIntrusions': len(report['structuralDatums']['intrusions'])}))
