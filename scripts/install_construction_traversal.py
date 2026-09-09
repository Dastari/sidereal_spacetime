"""Verify or stage the exact native ladder candidate; never publish runtime assets."""
from pathlib import Path
import argparse
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
REVISION = ROOT / 'assets/art-library/designs/shipyard.structure.traversal-ladder/revisions/r000/a003'
AUDIT_SHA = 'a41e28d065833c1be30ae1e1e5a4a49832b0771157e6a80b1343f82ccec9e714'
KIT_SHA = 'f4fb453f44fe84f577107d72fad15459e6e59ec9ad2ed122bceadead5b855625'
STAGING = ROOT / '.runtime/art-library/traversal/r000-a003'

def sha(data):
    return hashlib.sha256(data).hexdigest()

def verify(stage=False):
    audit_bytes = (REVISION / 'traversal-audit.json').read_bytes()
    assert sha(audit_bytes) == AUDIT_SHA, 'Traversal audit changed'
    audit = json.loads(audit_bytes)
    delivery = json.loads((REVISION / 'delivery.json').read_text())
    validation = json.loads((REVISION / 'validation.json').read_text())
    assert delivery['auditSha256'] == AUDIT_SHA and delivery['status'] == 'native-geometry-qualified'
    assert validation['pass'] and all(check['pass'] for check in validation['checks'])
    assert validation['glbSha256'] == KIT_SHA and len(audit['parts']) == 28
    assert sha((REVISION / 'blender-source.blend').read_bytes()) == validation['sourceBlendSha256']
    outputs = {'traversal-audit.json': audit_bytes}
    manifest = {'schema': 'sidereal.staged-native-traversal.v1', 'adapterId': audit['adapterId'],
                'revision': audit['revision'], 'auditSha256': AUDIT_SHA, 'sources': {},
                'publication': 'not-published', 'ownerFinalSignoff': None}
    for key, pin in delivery['sources'].items():
        source = ROOT / pin['path']
        data = source.read_bytes()
        assert sha(data) == pin['sha256'], 'Changed native source ' + key
        assert source.suffix == '.glb'
        outputs[key + '.glb'] = data
        manifest['sources'][key] = {'file': key + '.glb', 'sha256': pin['sha256']}
    assert manifest['sources']['ladder-kit']['sha256'] == KIT_SHA
    outputs['manifest.json'] = (json.dumps(manifest, indent=2) + '\n').encode()
    if stage:
        # This private staging directory is outside both runtime and app public.
        # Refuse an altered prior stage rather than overwrite retained evidence.
        STAGING.mkdir(parents=True, exist_ok=True)
        for name, data in outputs.items():
            target = STAGING / name
            if target.exists():
                assert target.read_bytes() == data, 'Preserve changed staged file ' + name
            else:
                target.write_bytes(data)
    elif STAGING.exists():
        for name, data in outputs.items():
            assert (STAGING / name).read_bytes() == data, 'Changed staged file ' + name
    print(json.dumps({'verifiedSources': len(manifest['sources']), 'placements': len(audit['parts']),
                      'nativeChecks': len(validation['checks']), 'staged': stage,
                      'published': False, 'auditSha256': AUDIT_SHA}))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--check', action='store_true', help='Read-only source and optional stage verification (default)')
    mode.add_argument('--stage', action='store_true', help='Write only the private .runtime/art-library staging package')
    verify(parser.parse_args().stage)
