"""Package pinned native visuals for an opt-in local candidate; never publish a live release."""
from pathlib import Path
import argparse
import hashlib
import json
import shutil

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'assets/art-library/designs'
FAMILIES = {
    'convex-r004': ('shipyard.structure.convex-inset-boundary/revisions/r004', 'cafa3d5dbc13b63786415bf2c489a85cd19133658304a69dc39bf993ebc572cb'),
    'internal-r000': ('shipyard.structure.internal250/revisions/r000', '74564ff85482f4ecd1422ea2f34b2b1e29f1808cc9b827747e0bcdc500b54d84'),
    'union-r001': ('shipyard.structure.union-junction250/revisions/r001', 'faef895a5350ec27d1d987939d0c2fc473d43c3c1972d8fb54a6b3ee32af89cb'),
    'roof-r000': ('shipyard.structure.roof125/revisions/r000', '5e7c8582d0b21d698a50a205c0e9e96a56d77a488426a2c8909b07e57af8ca26'),
}
REQUESTS = {
    'corner': '3c94dbaba8dfa33c466c23eb83b6b2a10637d27683b8ce055327000e94be2ac4',
    'internal': 'f8dc612cf7ce856043431d98180a1f00d3cfac17031a2e1ca96e28118496f200',
    'union-junction': '46b06de54bfd81993716e0acea0d840ded94a6bcf45a0cc13a610ba0bddac6c4',
    'floor-contact': 'a9b8f3a2b9d361ff9084e953666a66b3cd99ab907c946b8f0f02a866a0b14d33',
}
sha = lambda b: hashlib.sha256(b).hexdigest()
encoded = lambda x: (json.dumps(x, indent=2, ensure_ascii=False) + '\n').encode()


def build():
    pins, parts, copies = {}, [], {}

    def read(path, expected=None):
        data = path.read_bytes()
        actual = sha(data)
        if expected and actual != expected:
            raise ValueError('Source pin mismatch: ' + str(path))
        pins[path.relative_to(ROOT).as_posix()] = actual
        return json.loads(data)

    for name, expected in REQUESTS.items():
        read(ROOT/f'packages/content/src/ship-tileset-{name}-spec.v1.json', expected)
    for family, (folder, expected) in FAMILIES.items():
        directory = BASE/folder
        manifest = read(directory/'delivery-manifest.json', expected)
        interfaces = read(directory/'interfaces.json')
        files = manifest['files']
        records = files.items() if isinstance(files, dict) else [(p.get('path', p.get('file')), p) for p in files]
        native = {name: p['sha256'] for name, p in records if name.endswith('.glb')}
        for name, digest in sorted(native.items()):
            path = directory/name
            if sha(path.read_bytes()) != digest:
                raise ValueError('Native export changed: '+str(path))
            stem = Path(name).stem
            info = interfaces['pieces'][stem]
            roof = family == 'roof-r000'
            target = family+'/'+stem+'.glb'
            copies[target] = path
            part = {
                'key': family+'/'+stem, 'family': family,
                'profileId': stem if roof else stem.rsplit('-q', 1)[0],
                'kind': 'roof' if roof else 'wall',
                'url': '/assets/construction/inset250-r000/'+target,
                'sha256': digest,
                'footprintM': info.get('reservationPolygonM', info.get('footprintM')),
                'heightM': .125 if roof else info['heightM'],
            }
            if not roof:
                part['quarterHeight'] = int(stem.rsplit('-q', 1)[1])
                if part['heightM'] != part['quarterHeight']*.75 or info['placementFloorTopM'] != .1875:
                    raise ValueError('Native wall datum changed')
            if not part['footprintM']:
                raise ValueError('Missing native footprint: '+stem)
            parts.append(part)
    filler = BASE/'shipyard.structure.floor-contact250/revisions/r011'
    audit = read(filler/'export-audit.json', '92c2f5a907e7272636a33ef176f1198dbbc818ca767ae2bb3ada37b55a6401a3')
    floor = read(ROOT/'packages/content/src/construction-floor-interfaces.json', audit['source']['interfaceSha256'])
    if not audit['pass'] or audit['distanceToleranceM'] != 1e-6:
        raise ValueError('Unaccepted floor-contact geometry')
    for p in audit['profiles']:
        path = filler/(p['floorId']+'.glb')
        if sha(path.read_bytes()) != p['glbSha256']:
            raise ValueError('Floor adapter changed')
        target = 'floor-contact-r011/'+p['floorId']+'.glb'
        copies[target] = path
        nominal = next(f for f in floor['parts'] if f['id'] == p['floorId'])
        parts.append({'key': 'floor-contact-r011/'+p['floorId'], 'family': 'floor-contact-r011', 'profileId': p['floorId'], 'kind': 'floor-contact', 'url': '/assets/construction/inset250-r000/'+target, 'sha256': p['glbSha256'], 'footprintM': [[x/32,y/32] for x,y in nominal['footprint']], 'heightM': .1875})
    parts.sort(key=lambda p: p['key'])
    if len(parts) != 228 or len({p['key'] for p in parts}) != 228:
        raise ValueError('Unexpected native part coverage')
    data = {'schema': 'sidereal.inset-native-visual-kit.v1', 'id': 'shipyard.structure.inset250', 'revision': 'r000', 'latticePerMeter': 32, 'floorThicknessUnits': 6, 'artApproval': 'unapproved', 'physicalQualification': 'unqualified', 'sourcePins': dict(sorted(pins.items())), 'parts': parts}
    return data, copies


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    data, copies = build()
    payload = encoded(data)
    digest = sha(payload)
    module = ('import data from "./construction-inset-visuals.json";\n'
              'export const CONSTRUCTION_INSET_VISUALS = data;\n'
              'export const CONSTRUCTION_INSET_VISUAL_PIN = Object.freeze({\n'
              '  id: "shipyard.structure.inset250", revision: "r000",\n'
              f'  sha256: "{digest}",\n'
              '});\n')
    content = ROOT/'packages/content/src/construction-inset-visuals.json'
    code = ROOT/'packages/content/src/construction-inset-visuals.ts'
    targets = [ROOT/'assets/runtime/construction/inset250-r000', ROOT/'apps/client/public/assets/construction/inset250-r000', ROOT/'apps/dashboard/public/assets/construction/inset250-r000']
    if args.check:
        if content.read_bytes() != payload or digest not in code.read_text():
            raise ValueError('Generated kit metadata changed')
        for target in targets:
            if (target/'manifest.json').read_bytes() != payload:
                raise ValueError('Local native manifest mismatch')
            for name, path in copies.items():
                if sha((target/name).read_bytes()) != sha(path.read_bytes()):
                    raise ValueError('Local native asset mismatch: '+name)
    else:
        if any(p.exists() for p in [content, code, *targets]):
            raise ValueError('Preserve existing package; use --check or author a new version')
        content.write_bytes(payload)
        code.write_text(module)
        for target in targets:
            target.mkdir(parents=True)
            (target/'manifest.json').write_bytes(payload)
            for name, path in copies.items():
                destination = target/name
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(path, destination)
    print(json.dumps({'parts': len(data['parts']), 'metadataSha256': digest, 'mode': 'check' if args.check else 'local candidate only', 'normalReleaseChanged': False}))


if __name__ == '__main__':
    main()
