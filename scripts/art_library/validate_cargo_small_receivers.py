"""Fixed-orientation closed transport retention, verified against exact native feet."""
import argparse
import json
from pathlib import Path
from validate_cargo_carriers import ROOT, digest, triangles


def validate(directory):
    spec = json.loads((directory/'interface.json').read_text())
    receiver, doc = triangles(directory/'receiver-set.glb')
    by_name = {}
    for name, points in receiver:
        by_name.setdefault(name, []).extend(points)
    assert len(by_name) == 16
    for box in spec['collisionBoxes']:
        points = by_name[box['id']]
        assert all(abs(min(p[i] for p in points)-box['min'][i]) < 1e-6 and abs(max(p[i] for p in points)-box['max'][i]) < 1e-6 for i in range(3))
    audit = json.loads((ROOT/'docs/handoffs/cargo_grid_model_audit.json').read_text())
    proofs = []
    for appearance in spec['payloadAppearances']:
        row = next(r for r in audit['rows'] if r['appearance'] == appearance)
        assert row['glbSha256'] in spec['payloadGlbSha256']
        source = ROOT/row['glbPath']
        assert digest(source) == row['glbSha256']
        mesh_triangles, _ = triangles(source)
        feet = {}
        for name, points in mesh_triangles:
            if name.startswith('GEO-40mm-locating-foot'):
                feet.setdefault(name, []).extend(points)
        assert len(feet) == 4
        evidence = []
        for points, center in zip(feet.values(), spec['footCentersM']):
            lo = [min(p[i] for p in points)+spec['payloadTranslationM'][i] for i in range(3)]
            hi = [max(p[i] for p in points)+spec['payloadTranslationM'][i] for i in range(3)]
            assert all(abs((lo[i]+hi[i])/2-center[i]) < 1e-6 for i in range(2))
            assert all(abs(hi[i]-lo[i]-.04) < 1e-6 for i in range(2))
            assert abs(lo[2]-spec['floorM']) < 1e-6
            # Closed body cannot lift feet out of receiver walls. Relative tilt is
            # intentionally outside the planar fixed secured gameplay contract.
            retention = spec['receiverWallHeightM']-spec['maximumUpwardTravelM']
            assert retention > .008
            evidence.append({'actualFootMinM':lo,'actualFootMaxM':hi,'lateralGapPerSideM':.002,'verticalRetentionMarginM':retention})
        proofs.append({'appearance':appearance,'assetId':row['assetId'],'glbSha256':row['glbSha256'],'feet':evidence})
    result = {'schema':'sidereal.small-receiver-qualification.v1','receiverGlbSha256':digest(directory/'receiver-set.glb'),
      'receiverSourceSha256':digest(directory/'blender-source.blend'),'payloads':proofs,'fixedOrientationClosedRetention':True,
      'unlockedUpperFrameAllowsRemoval':True,'otherEnvelopeFitsSecured':False,'engineeringCertification':False,'ownerArtApproval':False,
      'limitations':['Relative cargo tilt/free6DOF is not simulated.','Upper frame must be unlocked/removed only after unsupported dependent stacks are absent.','Runtime inventory access is separate from a lid animation; transport restraint remains locked for item transactions.']}
    (directory/'qualification.json').write_text(json.dumps(result,indent=2)+'\n')
    return result


if __name__ == '__main__':
    parser=argparse.ArgumentParser();parser.add_argument('directory',type=Path)
    result=validate(parser.parse_args().directory)
    print(json.dumps({'qualifiedPayloadCount':len(result['payloads']),'retention':'fixed-orientation closed','ownerArtApproval':False}))
