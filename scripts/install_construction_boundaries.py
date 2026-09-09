"""Install exact r001 native boundary candidate for explicitly opted-in construction reviews.

No live assembly, database, approval ledger or existing asset is replaced.
"""
import hashlib
import json
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r001'
PINS = {
    'kit.glb': '4c631ad5517bf6d6cc88af29aba4a6890808c33effeed4205acb26a022758426',
    'interfaces.json': '33347b32b1675fee00d36046a05de37013fa32eca6e2a4d671464da3499972d9',
    'boundary-kit.blend': 'f20cc7da6fbf8e2165805e04a81f00feafd96e3cc2b5d7200e4188de785e3491',
}
for name, digest in PINS.items():
    if hashlib.sha256((SOURCE / name).read_bytes()).hexdigest() != digest:
        raise SystemExit(f'Pinned boundary artifact mismatch: {name}')
interfaces = json.loads((SOURCE / 'interfaces.json').read_text())
assert len(interfaces['parts']) == 8 and interfaces['revision'] == 'r001'
for target in [ROOT / 'assets/runtime/construction/boundary-r001',
               ROOT / 'apps/client/public/assets/construction/boundary-r001',
               ROOT / 'apps/dashboard/public/assets/construction/boundary-r001']:
    target.mkdir(parents=True, exist_ok=True)
    for name in ['kit.glb', 'interfaces.json']:
        shutil.copyfile(SOURCE / name, target / name)
    (target / 'manifest.json').write_text(json.dumps({
        'schema': 'sidereal.construction-boundary-runtime.v1',
        'designId': interfaces['designId'], 'revision': 'r001', 'pins': PINS,
        'status': 'working candidate; no final art, seal or damage approval',
        'installedBy': 'integration_continuation',
        'scope': 'explicit construction boundaryKit only; no live Wayfarer replacement',
    }, indent=2) + '\n')
shutil.copyfile(SOURCE / 'interfaces.json', ROOT / 'packages/content/src/construction-boundary-interfaces.json')
print('Installed exact r001 boundary candidate in independent app asset directories; no database changes.')
