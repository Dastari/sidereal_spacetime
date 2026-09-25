"""Package additive Blender visuals for Shipyard; leaves immutable authority kit unchanged."""
from pathlib import Path
import argparse
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--walls-revision', required=True)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    if not args.walls_revision.startswith('r') or not args.walls_revision[1:].isdigit():
        raise ValueError('Invalid native revision')
    parts, copies, pins = [], {}, {}
    floor = ROOT/'assets/art-library/designs/shipyard.structure.legacy-trapezoid-floor/revisions/r001'
    roof = floor.parent/'r002'
    walls = ROOT/'assets/art-library/designs/shipyard.structure.complex-perimeter/revisions'/args.walls_revision
    for source in [floor/'manifest.json', roof/'manifest.json', walls/'delivery-manifest.json', walls/'validation.json']:
        pins[str(source.relative_to(ROOT))] = sha(source)
    floor_manifest = json.loads((floor/'manifest.json').read_text())
    for p in floor_manifest['profiles']:
        path = floor/p['glb']
        assert sha(path) == p['sha256'] and p['floorContactIntegrated'] and p['floorTopM'] == .1875
        name = 'legacy-trapezoid-r001/'+p['glb']
        copies[name] = path
        parts.append(dict(key='legacy-trapezoid-r001/'+p['id'], family='legacy-trapezoid-r001', profileId=p['id'], kind='floor', url='/assets/construction/complex-preview-r000/'+name, sha256=p['sha256'], footprintM=p['footprintM'], heightM=.1875))
    for p in json.loads((roof/'manifest.json').read_text())['profiles']:
        if p['kind'] != 'roof':
            continue
        path = roof/p['glb']
        assert sha(path) == p['sha256'] and p['closedManifold'] and p['allExportedVerticesContained']
        assert p['roofBottomM'] == 0 and p['roofTopM'] == .125 and p['undersideCoverageM2'] == 3
        name = 'legacy-roof-r002/'+p['glb']
        copies[name] = path
        parts.append(dict(key='legacy-roof-r002/'+p['id'],family='legacy-roof-r002',profileId=p['floorId'],kind='roof',url='/assets/construction/complex-preview-r000/'+name,sha256=p['sha256'],footprintM=p['footprintM'],heightM=.125))
    manifest = json.loads((walls/'delivery-manifest.json').read_text())
    interfaces = json.loads((walls/'interfaces.json').read_text())['pieces']
    validation = json.loads((walls/'validation.json').read_text())
    assert validation['exportToleranceM'] == 1e-6
    family = 'complex-'+args.walls_revision
    for entry in manifest['files']:
        if not entry['path'].startswith('profiles/') or not entry['path'].endswith('.glb'):
            continue
        path = walls/entry['path']
        stem = path.stem
        info = interfaces[stem]
        audit = validation['profiles'][stem]
        assert sha(path) == entry['sha256'] == audit['glbSha256']
        assert audit['sourceClosedManifold'] and audit['exportClosedManifold']
        q = int(stem.rsplit('-q',1)[1])
        assert info['heightM'] == q*.75 and info['placementFloorTopM'] == .1875
        name = family+'/'+path.name
        copies[name] = path
        parts.append(dict(key=family+'/'+stem, family=family, profileId=info['profileId'], kind='wall', quarterHeight=q, url='/assets/construction/complex-preview-r000/'+name, sha256=entry['sha256'], footprintM=info['reservationPolygonM'], heightM=info['heightM']))
    assert len(parts) == len(interfaces)+4 and len({p['key'] for p in parts}) == len(parts)
    metadata = dict(schema='sidereal.complex-preview-kit.v1', revision='r000', artApproval='unapproved', physicalQualification='unqualified', sourcePins=pins, parts=sorted(parts,key=lambda p:p['key']))
    payload = json.dumps(metadata,indent=2)+'\n'
    content = ROOT/'packages/content/src/construction-complex-visuals.json'
    targets = [ROOT/'assets/runtime/construction/complex-preview-r000',ROOT/'apps/dashboard/public/assets/construction/complex-preview-r000']
    if args.check:
        assert content.read_text() == payload
        for target in targets:
            assert (target/'manifest.json').read_text() == payload
            for name, source in copies.items():
                assert sha(target/name) == sha(source)
    else:
        content.write_text(payload)
        for target in targets:
            target.mkdir(parents=True,exist_ok=True)
            (target/'manifest.json').write_text(payload)
            for name, source in copies.items():
                dest = target/name
                dest.parent.mkdir(parents=True,exist_ok=True)
                dest.write_bytes(source.read_bytes())
    print(json.dumps({'parts':len(parts),'sha256':sha(content),'authorityKitChanged':False,'check':args.check}))


if __name__ == '__main__':
    main()
