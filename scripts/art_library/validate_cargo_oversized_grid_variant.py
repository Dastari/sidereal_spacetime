"""Prove the new fitting variant changes only two native lever translations."""
import argparse
import json
from pathlib import Path
from validate_cargo_carriers import ROOT, digest, triangles, glb_bounds


def validate(directory):
    original = ROOT/'assets/art-library/designs/cargo.reinforced.oversized/revisions/r002'
    old, old_doc = triangles(original/'glb.glb')
    new, new_doc = triangles(directory/'glb.glb')
    assert len(old) == len(new)
    old_group, new_group = {}, {}
    for group, rows in [(old_group, old), (new_group, new)]:
        for name, points in rows:
            group.setdefault(name, []).extend(points)
    assert old_group.keys() == new_group.keys()
    modified = []
    maximum_delta = 0
    for name, points in old_group.items():
        expected = [0, .025, 0] if name.startswith('GEO-lock-lever') else [0, 0, 0]
        if expected[1]:
            modified.append(name)
        assert len(points) == len(new_group[name])
        delta = max(abs(b[i]-a[i]-expected[i]) for a, b in zip(points, new_group[name]) for i in range(3))
        maximum_delta = max(maximum_delta, delta)
        assert delta < 1e-6, (name, delta)
    assert len(modified) == 2
    assert sorted(old_doc['materials'], key=lambda m: m['name']) == sorted(new_doc['materials'], key=lambda m: m['name'])
    old_sockets = {n['name']: n for n in old_doc['nodes'] if n['name'].startswith(('SOCK_', 'FX_'))}
    new_sockets = {n['name']: n for n in new_doc['nodes'] if n['name'].startswith(('SOCK_', 'FX_'))}
    assert old_sockets == new_sockets and len(old_sockets) == 12
    bounds = glb_bounds(directory/'glb.glb')
    dims = [b-a for a,b in zip(bounds['min'], bounds['max'])]
    assert dims[0] <= 2 and dims[1] <= 4 and dims[2] <= 2
    report = {'schema': 'sidereal.cargo-variant-validation.v1', 'sourceOriginalSha256': digest(original/'blender-source.blend'),
              'sourceVariantSha256': digest(directory/'blender-source.blend'), 'glbVariantSha256': digest(directory/'glb.glb'),
              'modifiedMeshes': modified, 'worldDeltaM': [0, .025, 0], 'maximumVertexDeviationFromSpecifiedChangeM': maximum_delta,
              'triangles': len(new), 'unchangedMeshCount': len(new_group)-2, 'preservedMaterialCount': len(new_doc['materials']),
              'preservedSocketCount': len(new_sockets), 'boundsAuthorM': bounds, 'dimensionsM': dims, 'nominalReservationM': [2, 4],
              'oldSourcesUntouched': True, 'scaleApplied': False, 'ownerArtApproval': False, 'filledStackingApproved': False,
              'limitations': ['Closed envelope only. Door movement and authoritative occupancy require a separate qualification.', 'Does not fit the low cargo carrier height.']}
    (directory/'validation.json').write_text(json.dumps(report, indent=2)+'\n')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('directory', type=Path)
    result = validate(parser.parse_args().directory)
    print(json.dumps({'dimensionsM': result['dimensionsM'], 'modifiedMeshes': result['modifiedMeshes'], 'preservedSocketCount': result['preservedSocketCount']}))
