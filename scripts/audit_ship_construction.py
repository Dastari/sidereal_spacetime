"""Read-only asset/interface inventory for the semantic Wayfarer rebuild.

Visual AABBs are measurements, NOT nominal fit, support, collision or ratings.
"""
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def audit():
    assembly_path = ROOT / 'assets/runtime/assembly/wayfarer.json'
    assembly = json.loads(assembly_path.read_text())
    result = {'schema': 'sidereal.construction-audit.v1',
              'measurementWarning': 'Visual AABBs only; never infer structural/support/pressure ratings from these dimensions.',
              'assembly': {'path': str(assembly_path.relative_to(ROOT)), 'sha256': digest(assembly_path),
                           'placementCount': len(assembly['parts'])}, 'families': {}}
    for family in ['floor', 'hull', 'equipment', 'cargo']:
        path = ROOT / f'assets/runtime/assembly/{family}-manifest.json'
        manifest = json.loads(path.read_text())
        entries = []
        for entry in manifest['entries']:
            asset = entry['asset']; visual = asset.get('visual', {})
            bounds = visual.get('bounds', asset.get('bounds', {}))
            extent = [round(b-a, 6) for a,b in zip(bounds.get('min', []), bounds.get('max', []))]
            entries.append({'id': asset['id'], 'label': asset['label'], 'category': asset['category'],
                            'visual': visual, 'visualExtentMeters': extent,
                            'placementIds': [p['id'] for p in entry.get('placements', [])],
                            'topLevelInterfaceFields': sorted(k for k in asset if any(term in k.lower() for term in ['socket','support','stack','nominal','pressure','mount','cargo']))})
        result['families'][family] = {'manifest': str(path.relative_to(ROOT)), 'sha256': digest(path),
                                      'assetCount': len(entries), 'placementCount': sum(len(e['placementIds']) for e in entries), 'entries': entries}
    return result

if __name__ == '__main__':
    print(json.dumps(audit(), indent=2))
