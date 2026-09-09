"""Install exact qualified native stair runtime bytes. Never publish a service/refit."""
from pathlib import Path
import argparse
import hashlib
import json
import stage_construction_stairs_runtime as staged

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'assets/runtime/construction/stairs-r000-a003'


def install(check=False):
    staged.stage(check=True)
    delivery = json.loads((staged.SOURCE / 'delivery.json').read_text())
    sources, outputs = {}, {}
    for key, source in delivery['sources'].items():
        data = (ROOT / source['path']).read_bytes()
        assert hashlib.sha256(data).hexdigest() == staged.SOURCE_SHAS[key]
        sources[key] = {'url': f'/assets/construction/stairs-r000-a003/{key}.glb', 'sha256': source['sha256'], 'bytes': len(data)}
        outputs[TARGET / f'{key}.glb'] = data
    manifest = {
        'schema': 'sidereal.native-stair-runtime.v1',
        'pin': {'id': delivery['adapterId'], 'revision': delivery['revision'], 'sha256': staged.AUDIT_SHA},
        'sources': sources,
        'provenance': {key: {'source': value['path'], 'sha256': value['sha256']} for key, value in delivery['sources'].items()},
        'sourceAudit': {'path': str((staged.SOURCE / 'stair-audit.json').relative_to(ROOT)), 'sha256': staged.AUDIT_SHA},
        'installer': {'path': str(Path(__file__).relative_to(ROOT)), 'sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest()},
        'authorization': {'recordedDate': '2026-09-10', 'source': 'Owner authorized all remaining integration/deployment; root specifically requested installing the exact three stair GLBs and manifest.', 'scope': 'Runtime artifact installation for native stair integration; not final art approval.'},
        'placements': 60,
        'status': 'Installed runtime source artifacts; actual gameplay depends on shared world/client wiring and browser acceptance.',
        'ownerFinalArtSignoff': None,
        'servicePublication': False,
    }
    outputs[TARGET / 'manifest.json'] = (json.dumps(manifest, indent=2) + '\n').encode()
    for path, data in outputs.items():
        if check:
            assert path.read_bytes() == data, path
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
    print(json.dumps({'installedSources': 3, 'placements': 60, 'check': check, 'servicePublished': False}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    install(parser.parse_args().check)
