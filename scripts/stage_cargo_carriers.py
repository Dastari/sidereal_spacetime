"""Stage exact qualified visual inputs outside app-public/runtime directories.

The integration owner copies the resulting package during a matched release.
This command does not publish services or implicitly ship draft source/evidence.
"""
from pathlib import Path
import argparse
import hashlib
import json
import shutil
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent/"art_library"))
from validate_reserved_envelope import qualify_glb

ROOT = Path(__file__).resolve().parents[1]
INPUTS = [
    ('carrier-1m.glb', 'assets/art-library/designs/cargo.carrier.grid-support/revisions/r000/a003/carrier-1m.glb', 'faa8a7b7786c4e92cfeb6ec5b25d43739ad070e202d4e2f1ee1dc98ca6877f78'),
    ('carrier-2m.glb', 'assets/art-library/designs/cargo.carrier.grid-support/revisions/r000/a003/carrier-2m.glb', '5e42e6ab46b00674129ffafe136affefa6586325c1149e838bf9ff693b9769fd'),
    ('receiver-set.glb', 'assets/art-library/designs/cargo.restraint.standard-small/revisions/r000/a001/receiver-set.glb', 'dac3fd3c6cca793929f9deaae8030b867ad214081cd5719cbc21778133d83044'),
]


def stage(output):
    output = output.resolve()
    allowed = (ROOT/'.runtime/release-inputs').resolve()
    if allowed not in output.parents:
        raise ValueError('Stage only under private .runtime/release-inputs; activation belongs to release owner')
    output.mkdir(parents=True, exist_ok=True)
    rows = []
    qualifications = []
    for name, relative, expected in INPUTS:
        source = ROOT/relative
        actual = hashlib.sha256(source.read_bytes()).hexdigest()
        if actual != expected:
            raise ValueError('Pinned native asset changed: '+relative)
        width = 2 if name == 'carrier-2m.glb' else 1
        qualification = qualify_glb(source, [[0,0],[width,0],[width,width],[0,width]], 0, .6875)
        qualifications.append({'file':name, **qualification})
        target = output/name
        if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest() != expected:
            raise ValueError('Preserve prior staged package; choose a new output')
        shutil.copy2(source, target)
        rows.append({'file':name,'sha256':actual,'source':relative,'bytes':source.stat().st_size,
                     'publicUrl':'/assets/assembly/cargo-carriers/r000-a003/'+name})
    manifest = {'schema':'sidereal.native-cargo-carrier-package.v1','revision':'r000-a003-small-receiver-a001',
                'runtimeDestination':'assets/runtime/assembly/cargo-carriers/r000-a003',
                'files':rows,'reservedEnvelopeQualifications':qualifications,'ownerArtApproval':False,'provisionalGameplayAuthorization':'Parent task authorizes implementation/deployment using explicit provisional balance.',
                'activationStatus':'staged-only','sourceAndEvidencePublic':False,
                'qualifiedPayloads': []}
    # Resolve the payload pins from the reviewed report, avoiding a second hand-maintained mapping.
    audit=json.loads((ROOT/'docs/handoffs/cargo_grid_model_audit.json').read_text())
    manifest['qualifiedPayloads']=[{'assetId':r['assetId'],'sha256':r['glbSha256'],'appearance':r['appearance']} for r in audit['rows'] if r['appearance'] in ['standard-small','standard-small-red']]
    (output/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    return manifest


if __name__ == '__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,default=ROOT/'.runtime/release-inputs/cargo-carriers-r000-a003')
    result=stage(parser.parse_args().output)
    print(json.dumps({'files':len(result['files']),'status':result['activationStatus']}))
