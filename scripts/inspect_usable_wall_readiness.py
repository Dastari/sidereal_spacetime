"""Read-only 50-ID wall candidate integration audit; never emits runtime bindings.

Native projection and published planar obstacle coverage are different measures.
This reports both, preserving exact source pins and all original placements.
"""
import hashlib
import json
import math
from pathlib import Path

import manifold3d as m
import numpy as np
from shapely.geometry import Polygon
from shapely.ops import unary_union

from qualify_usable_wall_combined_mapping import plan, ROOT, MAP
from qualify_wayfarer_placement_interfaces import shape
from qualify_wayfarer_airlock_inlet import native_parts
from qualify_wayfarer_walking import geometry, hull, octagon

SOURCE = ROOT / 'packages/content/src/wayfarer-starter-r001.json'
PROOF = ROOT / 'packages/content/src/wayfarer-walking-proof.json'
THRESHOLD = ROOT / 'packages/content/src/wayfarer-threshold-proof.json'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def runtime_selects(name, prefix):
    """Current loadConstructionAuthoredAssembly selector, not a proposed fix."""
    return prefix is None or name == prefix or name.startswith(prefix + '_') or name.startswith(prefix + '.')


def projection(body):
    """Contour parity retains genuine holes rather than filling every ring."""
    result = Polygon()
    for contour in body.project().to_polygons():
        result = result.symmetric_difference(Polygon(contour))
    return result


def polygon_union(obstacles):
    return unary_union([Polygon(o['vertices']) for o in obstacles])


def containment(candidate, accepted):
    outside = candidate.difference(accepted)
    return {'uncoveredAreaM2': outside.area,
            'uncoveredBoundsM': list(outside.bounds) if not outside.is_empty else None}


def roof_coupons(original, replacements):
    """Actual positive-area paths through candidate structure at known roof joins.

    This local negative proof does not allocate gas or infer a full enclosure.
    All structural roles participate so another wall cannot be ignored as a cap.
    """
    structure = []
    for ident, part in original.items():
        if part['role'] not in ('structural-wall-unqualified', 'structural-floor',
                                'roof-visual', 'interior-partition-unqualified'):
            continue
        body, pin = shape(part)
        if ident in replacements:
            body = replacements[ident]
        structure.append((ident, body, pin))
    reports = []
    for x, y in [(-3, -7), (-1, -5), (1, -3), (3, 1), (0, 0)]:
        coupon = m.Manifold.cube([.04, .04, .9]).translate([x - .02, y - .02, 2.55])
        nearby = [(ident, body, pin) for ident, body, pin in structure
                  if (body ^ coupon).volume() > 1e-12]
        solid = m.Manifold.batch_boolean([body for _, body, _ in nearby], m.OpType.Add)
        paths = [c for c in (coupon - solid).decompose()
                 if c.bounding_box()[2] < 2.550001 and c.bounding_box()[5] > 3.449999]
        reports.append({'probeM': [x, y], 'zRangeM': [2.55, 3.45],
                        'structuralSourceIds': [ident for ident, _, _ in nearby],
                        'usesChangedPart': any(ident in replacements for ident, _, _ in nearby),
                        'openPaths': [{'volumeM3': p.volume(), 'boundsM': list(p.bounding_box())} for p in paths]})
    return reports


def inspect():
    document = json.loads(SOURCE.read_text())
    proof = json.loads(PROOF.read_text())
    threshold = json.loads(THRESHOLD.read_text())
    for path, expected in proof['artifacts'].items():
        assert digest(ROOT / path) == expected, path
    assert hashlib.sha256(json.dumps(document, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest() == proof['documentSha256']
    candidate = plan()  # Rechecks every exact GLB/proof/placement pin.
    original = {p['sourcePlacedId']: p for p in json.loads(MAP.read_text())['preserveOriginalPlacements']}
    parts = {p['id']: p for p in document['layout']['assembly']['parts']}
    catalog = {p['id']: p for p in json.loads((ROOT / 'assets/runtime/assembly/catalog.json').read_text())['assets']}
    old_bindings = {p['sourceObjectId']: p for p in proof['bindings']}
    ids = {p['sourcePlacedId'] for p in candidate['bindings']}
    assert len(ids) == 50 and ids <= parts.keys()
    assert threshold['sourcePlacedId'] not in ids
    old_polygons = {ident: polygon_union(threshold['sideObstacles'] if ident == threshold['sourcePlacedId'] else p['obstacles'])
                    for ident, p in old_bindings.items()}
    old_all = unary_union(list(old_polygons.values()))
    floor = unary_union([Polygon([(x / 32, y / 32) for x, y in t['vertices']]) for t in document['layout']['tiles']])
    # This is an offline exact positive-height slab projection, not a new collider.
    low, high = proof['standingSlabM']
    slab = m.Manifold.cube([200, 200, high - low - 1e-6]).translate([-100, -100, low + 1e-6])
    entries = []
    new_bodies = {}
    native_floor_projections = []
    proposed_covers = {}
    for binding in candidate['bindings']:
        ident = binding['sourcePlacedId']
        placement = binding['originalPlacement']
        assert placement == parts[ident]
        old, old_pin = shape(original[ident])
        visual = binding['candidateNativeVisual']
        path = ROOT / visual['path']
        assert digest(path) == visual['sha256']
        groups = geometry(visual['path'], visual['sha256'], visual['nodePrefix'])
        whole_file_groups = geometry(visual['path'], visual['sha256'], None)
        original_groups = geometry(old_pin['path'], old_pin['sha256'], old_pin['nodePrefix'])
        new = native_parts(path, visual['nodePrefix'])[0]
        if placement['flipped']:
            new = new.scale([-1, 1, 1])
        new = new.rotate([0, 0, placement['rotation'] * 180 / math.pi]).translate(placement['position'])
        new_bodies[ident] = new
        standing = new ^ slab
        native_xy = projection(standing) if standing.volume() > 1e-12 else Polygon()
        native_in_floor = native_xy.intersection(floor)
        native_floor_projections.append(native_in_floor)
        # An explicit draft over-cover shows consequences of the existing method;
        # it is not installed and cannot be mistaken for qualified passable gaps.
        if not native_xy.is_empty:
            points = np.asarray(standing.to_mesh64().vert_properties)[:, :2]
            cover = Polygon(octagon(hull(points)))
        else:
            cover = Polygon()
        proposed_covers[ident] = cover
        accepted = old_polygons[ident]
        entries.append({
            'sourcePlacedId': ident, 'oldAssetId': placement['assetId'],
            'unchangedPlacement': placement, 'oldNativeSource': old_pin, 'candidateNativeSource': visual,
            'proposedCatalogBinding': {
                'id': 'part-usablewall-' + visual['sha256'][:20],
                'category': catalog[placement['assetId']]['category'],
                'visualUrl': '/assets/assembly/usable-boundary-wall/r000-682a59cd/' + visual['sha256'] + '/glb.glb',
                'sha256': visual['sha256'], 'nodePrefix': None,
                'status': 'offline proposed immutable namespace; not installed or published',
            },
            'oldNativeBoundsM': list(old.bounding_box()), 'candidateNativeBoundsM': list(new.bounding_box()),
            'currentCategory': catalog[placement['assetId']]['category'],
            'currentProxyClassification': old_bindings[ident]['classification'],
            'currentObstacleCount': len(old_bindings[ident]['obstacles']),
            'currentObstacleVertices': old_bindings[ident]['obstacles'],
            'candidateNativeStandingFootprintInFloorM2': native_in_floor.area,
            'nativeOutsideOwnOldColliderInFloor': containment(native_in_floor, accepted),
            'nativeOutsideAllCurrentCollidersInFloor': containment(native_in_floor, old_all),
            'candidateConservativeSlabCover': list(cover.exterior.coords) if not cover.is_empty else [],
            'draftCoverExtraBlockingInFloorM2': cover.difference(old_all).intersection(floor).area,
            'oldColliderExcessOverDraftCoverInFloorM2': accepted.difference(cover).intersection(floor).area,
            'nativeSelectedMeshGroups': len(groups),
            'oldNativeMeshGroups': len(original_groups),
            'safeDedicatedWholeFileSelection': len(whole_file_groups) == len(groups) and
                {name for name, _ in whole_file_groups} == {name for name, _ in groups},
            'currentRendererWouldSelectGroups': sum(runtime_selects(name, visual['nodePrefix']) for name, _ in groups),
            'nativeSurfaceNames': [name for name, _ in groups],
        })
    equipment = []
    for ident, p in original.items():
        if p['role'] not in ('interior-equipment', 'cargo-container'):
            continue
        body, pin = shape(p)
        contacts = []
        for wall_id, wall in new_bodies.items():
            a, b = body.bounding_box(), wall.bounding_box()
            if any(min(a[i+3], b[i+3]) - max(a[i], b[i]) <= 1e-7 for i in range(3)):
                continue
            volume = (body ^ wall).volume()
            if volume > 1e-7:
                contacts.append({'wallId': wall_id, 'nativeIntersectionM3': volume})
        equipment.append({'sourcePlacedId': ident, 'sourcePin': pin, 'candidateIntersections': contacts})
    proposed_all = unary_union([p for ident, p in old_polygons.items() if ident not in ids] + list(proposed_covers.values()))
    native_union = unary_union(native_floor_projections)
    return {
        'schema': 'sidereal.usable-wall-integration-readiness.v1',
        'status': 'offline comparative evidence; no installed bindings, no complete enclosure qualification',
        'canonicalSha256': proof['documentSha256'], 'walkingProofFileSha256': digest(PROOF),
        'thresholdProofFileSha256': digest(THRESHOLD),
        'replacementMappingSha256': digest(ROOT / 'assets/art-library/designs/shipyard.structure.usable-boundary-wall/revisions/r000/a009/combined-replacement-mapping.json'),
        'implementationInputs': {path: digest(ROOT / path) for path in (
            'packages/render/src/construction-authored-assembly.ts',
            'packages/sim/src/wayfarer-walking-bindings.ts',
            'packages/sim/src/wayfarer-threshold.ts',
            'packages/world/src/construction-instances.ts')},
        'changedPlacementCount': len(entries), 'transformsChanged': 0, 'placedIdsAddedOrRemoved': 0,
        'standingSlabM': [low + 1e-6, high],
        'slabScope': '1um removes zero-height bearing contact only. Separate floor support remains required; no positive aperture normalization.',
        'entries': entries, 'equipment': equipment,
        'inheritedRoofLeakCoupons': roof_coupons(original, new_bodies),
        'summary': {
            'rendererZeroSelectionIds': [e['sourcePlacedId'] for e in entries if e['currentRendererWouldSelectGroups'] == 0],
            'dedicatedWholeFileSelectionValidForAll': all(e['safeDedicatedWholeFileSelection'] for e in entries),
            'oldNativeMeshGroups': sum(e['oldNativeMeshGroups'] for e in entries),
            'candidateNativeMeshGroups': sum(e['nativeSelectedMeshGroups'] for e in entries),
            'oldAssetIds': len({e['oldAssetId'] for e in entries}),
            'uniqueCandidateNativeFiles': len({e['candidateNativeSource']['sha256'] for e in entries}),
            'nativeCoverageAgainstAllCurrentColliders': containment(native_union, old_all),
            'draftCoverAddsBlockingFloorM2': proposed_all.difference(old_all).intersection(floor).area,
            'draftCoverReleasesBlockingFloorM2': old_all.difference(proposed_all).intersection(floor).area,
            'candidateEquipmentConflicts': [p for p in equipment if p['candidateIntersections']],
            'changedRoofIds': [e['sourcePlacedId'] for e in entries if e['currentCategory'] == 'roof'],
            'currentSemanticOpenings': len(document['layout']['openings']),
            'currentSemanticPartitions': len(document['layout']['partitions']),
            'currentPressureBinding': document.get('pressureRoom'),
            'currentNativeAirlockBinding': document.get('airlockRoom'),
        },
        'preservedThresholdSourceId': threshold['sourcePlacedId'],
        'localJoinProofs': candidate['proofs'],
        'notQualified': ['Whole-ship gas enclosure/finite volumes', 'Room sealing through retained partial-height partitions',
                         'Complete assembly visible face coplanarity', 'Armor mounting strength or voxel damage mapping',
                         'Accepted actor/item state during live refit', 'Installed renderer/cutaway/browser performance'],
        'installed': False,
    }


if __name__ == '__main__':
    result = inspect()
    destination = ROOT / '.runtime/usable-wall-integration-readiness.json'
    destination.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'report': str(destination), 'summary': result['summary']}))
