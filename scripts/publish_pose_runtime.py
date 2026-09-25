"""Install the owner-authorized exact r002 paired handheld/pose assets.

Keep this namespace separate from canonical equipment and the r008 modular crew.
The original Blender sources and historical review records stay in the library.
"""
from pathlib import Path
import datetime
import hashlib
import json
import shutil

ROOT = Path(__file__).resolve().parents[1]
FAMILY = ROOT / 'assets/art-library/designs/crew.animation.aim'
SOURCE = FAMILY / 'revisions/r002'
OUT = ROOT / 'assets/runtime/crew/poses/r002'
PUBLICATION = FAMILY / 'publications/r002'
QUOTE = "You can make the live normal game use all the new models and poses etc... Don't need to gat e it."
MESSAGE = 'Owner message in the current shared character/combat integration conversation on 2026-09-09, following r008 publication and combat pose integration review; explicitly supersedes the earlier development-only pose restriction.'
ITEMS = ['carbine', 'compact-pistol', 'flashlight', 'heavy-handgun', 'long-rifle', 'plasma-cutter', 'sample-scanner']
FILES = ['runtime-aim-space.json', 'profile-socket-metadata.json', 'equipment/manifest.json'] + ['equipment/' + item + '.glb' for item in ITEMS]
PINNED = {
    'runtime-aim-space.json': 'ec269e27b11673dc9080da6114d51ddfdfff26f8acad773c4e0951c4168e1885',
    'profile-socket-metadata.json': 'fbbb44d1eeca3bb1d9c769ea6999463994c52a883ea6d5291603afa79b278a49',
    'equipment/manifest.json': '70f3270d67250da8ea3a2064b43341a06fc4bcf5b8c832ea6a9edeb23d3c5807',
    'equipment/carbine.glb': 'aba632e370f18a0be48e8f082c425e0da7f9978e3700ac7211ae1b11efa8e118',
    'equipment/compact-pistol.glb': '5a6516f85126486d37ffb0ecf9d12bfeac25f28a0b35976d7d7128aa98b4bbbb',
    'equipment/flashlight.glb': '6ebe55855b087ca2b983c0856a440d4d984d26d390ae88ec076183e3fdf46643',
    'equipment/heavy-handgun.glb': '329cd64ccbdeba1e12e6df85c8ecd331c3e8b3781e95a3cb434f5b61834e36e9',
    'equipment/long-rifle.glb': '57457e19003fcb6bbe6543dfef3fa2ee317ae9029dad88cbbe19d42889080039',
    'equipment/plasma-cutter.glb': '1fdc536778e0726a88ca1eb0d569524c8de0176607d9d31ee993e9df1e4f0371',
    'equipment/sample-scanner.glb': '8e1a9a64f22f41bc9e171dbe63c93b9605dbc9582f5987029741c6cd586fee74',
}
NATIVE = {'blender-source.blend': '750487414860372dd6e1a6648050fa87c1c1935955766f59318a776b19e5741a',
          'equipment/handheld-source.blend': 'f25ff514cb2ecb07a1bc5a20ec40603f644d8fb362a583080cfb259c62fc47d6'}


def read(path):
    return json.loads(path.read_text())


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write(path, data):
    path.write_text(json.dumps(data, indent=2) + '\n')


def main():
    if OUT.exists():
        assert (PUBLICATION / 'publication.json').is_file(), 'Missing publication receipt'
        for name, expected in PINNED.items():
            assert digest(OUT / name) == expected, name
        print('Exact paired r002 namespace already installed; preserving receipt.')
        return
    assert not PUBLICATION.exists(), 'Never overwrite an existing publication attempt'
    validation = read(SOURCE / 'asset-validation.json')
    delivery = read(SOURCE / 'delivery-manifest.json')
    assert validation['status'] == 'pass' and validation['deformationBones'] == 16
    assert validation['unchangedOriginalClips'] == 12 and validation['maxOriginalClipDelta'] == 0
    for name, expected in {**PINNED, **NATIVE}.items():
        assert digest(SOURCE / name) == expected == delivery['artifacts'][name], name
        key = str((SOURCE / name).relative_to(ROOT))
        if key in validation['files']:
            assert expected == validation['files'][key]['sha256'], name
    metadata = read(SOURCE / 'profile-socket-metadata.json')
    equipment = read(SOURCE / 'equipment/manifest.json')
    assert set(metadata['items']) == set(ITEMS)
    assert {entry['id'] for entry in equipment['entries']} == set(ITEMS)
    assert all(item['assetId'] == key for key, item in metadata['items'].items())
    preserved = list((ROOT / 'assets/runtime/equipment').rglob('*')) + [
        ROOT / 'assets/source/equipment-kit.blend',
        ROOT / 'assets/runtime/crew/components/modular-crew.glb',
        ROOT / 'assets/runtime/crew/components/manifest.json',
    ]
    canonical = {str(path.relative_to(ROOT)): digest(path) for path in preserved if path.is_file()}
    assert canonical['assets/runtime/crew/components/modular-crew.glb'] == 'ae4a7e12096bd9aaac0bdfb178354d899b89af15cbc20293815c301871694150'
    timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
    PUBLICATION.mkdir(parents=True)
    write(PUBLICATION / 'canonical-before.json', canonical)
    shutil.copy2(ROOT / 'assets/runtime/equipment/manifest.json', PUBLICATION / 'canonical-equipment-manifest.json')
    receipt = {
        'schema': 'sidereal.pose-runtime-publication.v1', 'revision': 'r002', 'recordedAt': timestamp,
        'publicBaseUrl': '/assets/crew/poses/r002/', 'runtimeRoot': str(OUT.relative_to(ROOT)),
        'sourceRoot': str(SOURCE.relative_to(ROOT)),
        'authorization': {'ownerQuote': QUOTE, 'messageReference': MESSAGE,
                          'scope': 'Normal-game use of the new models and poses; no development query gate required.',
                          'finalArtSignoff': False},
        'files': {name: {'sha256': expected, 'bytes': (SOURCE / name).stat().st_size} for name, expected in PINNED.items()},
        'preservedNativeSources': {str((SOURCE / name).relative_to(ROOT)): expected for name, expected in NATIVE.items()},
        'validationInputs': {name: digest(SOURCE / name) for name in ['asset-validation.json', 'delivery-manifest.json']},
        'pairedCrew': {'runtime': 'assets/runtime/crew/components/modular-crew.glb', 'revision': 'r008',
                       'sha256': canonical['assets/runtime/crew/components/modular-crew.glb'],
                       'compatibility': 'Parent integration verifies the original shared 16-bone rig and uses authored aim-space data; historical crew-poses.glb is not published.'},
        'rollback': {'mode': 'Select the preserved canonical equipment/previous controller configuration; no existing canonical file was overwritten.',
                     'canonicalSnapshot': str((PUBLICATION / 'canonical-before.json').relative_to(ROOT)),
                     'canonicalSnapshotSha256': digest(PUBLICATION / 'canonical-before.json')},
        'ownerFinalSignoff': None,
        'limits': ['Source manifest review labels are preserved as historical bytes; this receipt records subsequent publication authorization.',
                   'Low rifle stock placement, scope-eye separation, acquisition/gait polish and uninterrupted playback remain art/animation work.',
                   'Normal-game integration and browser acceptance are validated separately; numerical clearance does not establish final visual acceptance.',
                   'Inventory, combat authority and canonical transforms are unchanged by this publication.'],
    }
    write(PUBLICATION / 'publication.json', receipt)
    for name in FILES:
        target = OUT / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(SOURCE / name, target)
    assert all(digest(ROOT / name) == expected for name, expected in canonical.items())
    family = read(FAMILY / 'design.json')
    family.setdefault('publications', []).append({
        'revision': 2, 'path': str((PUBLICATION / 'publication.json').relative_to(ROOT)),
        'sha256': digest(PUBLICATION / 'publication.json'), 'recorded_at': timestamp,
        'scope': 'Seven paired handheld GLBs and exact authored aim-space/socket metadata used with the installed r008 modular crew.',
    })
    family['approvals'].append({'revision': 2, 'owner_quote': QUOTE, 'message_reference': MESSAGE,
                               'scope': 'Normal-game runtime publication; unresolved art work and final sign-off remain separate.',
                               'recorded_at': timestamp, 'evidence_hashes': PINNED})
    write(FAMILY / 'design.json', family)
    print(json.dumps({'publicBaseUrl': receipt['publicBaseUrl'], 'files': FILES,
                      'canonicalFilesPreserved': len(canonical), 'ownerFinalSignoff': None}))


if __name__ == '__main__':
    main()
