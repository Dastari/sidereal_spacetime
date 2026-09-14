"""Publish the explicitly authorized r008 visual calibration, preserving rollback.

This is deliberately bounded to the owner's reviewed bundle. It changes no item
contracts, grants, authority state or art sign-off. Later revisions need their own
reviewed publication inputs rather than repurposing this receipt.
"""
from pathlib import Path
import copy
import datetime
import hashlib
import json
import shutil

ROOT = Path(__file__).resolve().parents[2]
LIB = ROOT / 'assets/art-library/character-components'
FAMILY = ROOT / 'assets/art-library/designs/crew.base-and-outfits'
CANDIDATE = FAMILY / 'revisions/r008/candidate'
OUT = ROOT / 'assets/runtime/crew/components'
CATALOG = ROOT / 'packages/content/src/character-components.json'
PUBLICATION = LIB / 'publications/r008'
SCOPE = ['base-male', 'base-female', 'hair-swept', 'hair-crest', 'hair-ponytail'] + [
    'medic-' + slot for slot in ['helmet', 'visor', 'chest', 'shoulders', 'gloves', 'belt', 'legs', 'boots', 'back']
]
MODEL_SHA = 'ae4a7e12096bd9aaac0bdfb178354d899b89af15cbc20293815c301871694150'
SOURCE_SHA = '6b17eab686f9c82c67f7dd87a6b460e9c0311f29d954e43728cf93d875157f61'
QUOTE = 'Confrimed that looks a lot bette.r Happy to initiate the swap over.'
MESSAGE = 'Owner message in this character reference calibration conversation, following the r008 comparison gallery viewing instructions and before the combat pose integration request, 2026-09-09.'


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n')


def contract(catalog):
    """Bounds/revision describe visuals; all actual existing item fields survive."""
    return {
        'rigId': catalog['rigId'], 'bodyTypes': catalog['bodyTypes'],
        'hairStyles': catalog['hairStyles'], 'sets': catalog['sets'],
        'components': [{k: v for k, v in c.items() if k != 'boundsMeters'} for c in catalog['components']],
    }


def main():
    before = read(OUT / 'manifest.json')
    if before['revision'] == 8:
        assert (PUBLICATION / 'publication.json').is_file(), 'Missing publication receipt'
        assert sha(OUT / 'modular-crew.glb') == MODEL_SHA
        print('r008 is already installed; preserved existing publication receipt.')
        return
    assert before['revision'] == 2, 'Reconcile any later installation before publication'
    assert not PUBLICATION.exists(), 'Never overwrite an existing publication attempt'
    catalog = read(CATALOG)
    assert catalog['revision'] == 2 and len(catalog['components']) == 90
    for name, expected in before['files'].items():
        assert sha(OUT / name) == expected, f'Existing runtime changed: {name}'
    assert sha(ROOT / before['blenderSource']) == before['sourceSha256']
    assert sha(CANDIDATE / 'modular-crew.glb') == MODEL_SHA
    assert sha(CANDIDATE / 'blender-source.blend') == SOURCE_SHA
    validation = read(CANDIDATE / 'focused-validation.json')
    assert validation['passed'] and validation['runtimeSha256'] == MODEL_SHA
    assert validation['nativeSourceSha256'] == SOURCE_SHA
    assert validation['bindMatricesExact'] and validation['allTwelveClipsExact']
    candidate = read(CANDIDATE / 'manifest.json')
    candidate_rows = {c['id']: c for c in candidate['components']}
    for row in catalog['components']:
        source = candidate_rows[row['id']]
        assert all(source[k] == v for k, v in row.items() if k != 'boundsMeters'), row['id']
    ledger = read(LIB / 'ledger.json')
    by_id = {c['id']: c for c in ledger['components']}
    files = {'modular-crew.glb': CANDIDATE / 'modular-crew.glb'}
    for component_id in SCOPE:
        rev = by_id[component_id]['revisions'][-1]
        assert rev['revision'] == 8 and rev['state'] == 'awaiting-owner', component_id
        for extension, role in [('glb', 'model'), ('png', 'image')]:
            name = component_id + '.' + extension
            evidence = next(e for e in rev['evidence'] if e['role'] == role)
            assert sha(CANDIDATE / name) == evidence['sha256'], name
            files[name] = CANDIDATE / name
    # The reviewed outward pack render is the useful inventory-facing view.
    files['medic-back.png'] = CANDIDATE / 'medic-back-outward.png'
    for path in files.values():
        assert path.is_file()
        if path.suffix == '.png':
            raw = path.read_bytes()
            assert raw[:8] == b'\x89PNG\r\n\x1a\n' and raw[25] == 6, path
    updated_catalog = copy.deepcopy(catalog)
    updated_catalog['revision'] = 8
    updated_catalog['visualRevisions'] = {c['id']: (8 if c['id'] in SCOPE else 2)
                                          for c in ledger['components'] if c['id'] != 'medic-open-comms'}
    for row in updated_catalog['components']:
        if row['id'] in SCOPE:
            row['boundsMeters'] = candidate_rows[row['id']]['boundsMeters']
    assert contract(updated_catalog) == contract(catalog)

    # All validation precedes mutation. Keep exact overwritten files and metadata.
    rollback = PUBLICATION / 'rollback-r002'
    rollback.mkdir(parents=True)
    shutil.copy2(OUT / 'manifest.json', rollback / 'manifest.json')
    shutil.copy2(CATALOG, rollback / 'character-components.json')
    for name in files:
        shutil.copy2(OUT / name, rollback / name)
    timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
    receipt = {
        'schema': 'sidereal.character-visual-publication.v1', 'revision': 8,
        'recordedAt': timestamp, 'previousRevision': 2, 'installedComponents': SCOPE,
        'authorization': {'ownerQuote': QUOTE, 'messageReference': MESSAGE,
                          'scope': 'Publish reviewed r008 normal character visuals and matching existing item images.',
                          'finalArtSignoff': False},
        'source': str((CANDIDATE / 'blender-source.blend').relative_to(ROOT)),
        'sourceSha256': SOURCE_SHA, 'runtimeSha256': MODEL_SHA,
        'files': {name: {'source': str(path.relative_to(ROOT)), 'sha256': sha(path),
                         'previousSha256': before['files'][name]} for name, path in files.items()},
        'unchangedRuntimeFiles': {name: digest for name, digest in before['files'].items() if name not in files},
        'inventoryContractsPreserved': 90, 'rigBones': 16, 'originalAnimationClips': 12,
        'rollback': str(rollback.relative_to(ROOT)),
        'rollbackManifestSha256': sha(rollback / 'manifest.json'),
        'rollbackCatalogSha256': sha(rollback / 'character-components.json'),
        'ownerFinalSignoff': None,
        'remaining': ['86 existing component designs retain r002.',
                      'medic-open-comms remains unissued; its hidden mesh is retained in the exact reviewed combined bundle.',
                      'Combat pose r002 assets are separate development review inputs, not this publication.',
                      'Finer hair/helmet contours, knuckle contrast and lighting remain design refinements.',
                      'Prior fixture screenshots remain historical evidence; installed browser verification is recorded separately.'],
    }
    write(PUBLICATION / 'publication.json', receipt)
    for name, path in files.items():
        shutil.copy2(path, OUT / name)
    after = copy.deepcopy(before)
    after.update(revision=8, blenderSource=receipt['source'], sourceSha256=SOURCE_SHA,
                 publication=str((PUBLICATION / 'publication.json').relative_to(ROOT)),
                 componentRevisions=updated_catalog['visualRevisions'], ownerFinalSignoff=None)
    after['files'].update({name: sha(path) for name, path in files.items()})
    write(OUT / 'manifest.json', after)
    write(CATALOG, updated_catalog)
    write(PUBLICATION / 'installed-manifest.json', after)
    write(PUBLICATION / 'installed-character-components.json', updated_catalog)

    ledger['integrationRevision'] = 8
    ledger['updatedAt'] = timestamp
    ledger['calibration'].update(installedRevision=8, published=True,
                                 installedScope=SCOPE, stagedScope=['medic-open-comms'],
                                 publication=after['publication'], ownerFinalSignoff=None)
    for entry in ledger['components']:
        entry['installedRevision'] = updated_catalog['visualRevisions'].get(entry['id'])
        if entry['id'] in SCOPE:
            entry['publication'] = after['publication']
            entry['revisions'][-1]['feedback'].append({
                'author': 'owner', 'text': QUOTE, 'messageReference': MESSAGE,
                'recordedAt': timestamp, 'scope': 'Runtime visual swap authorized; final art sign-off remains pending.',
            })
    write(LIB / 'ledger.json', ledger)
    family = read(FAMILY / 'design.json')
    family.setdefault('publications', []).append({
        'revision': 8, 'path': after['publication'], 'sha256': sha(PUBLICATION / 'publication.json'),
        'installed_components': SCOPE, 'recorded_at': timestamp,
    })
    family['approvals'].append({
        'revision': 8, 'scope': 'Runtime publication of 14 reviewed existing components and their images; not final art sign-off.',
        'owner_quote': QUOTE, 'message_reference': MESSAGE,
        'evidence_sha256': {'blender-source': SOURCE_SHA, 'glb': MODEL_SHA}, 'recorded_at': timestamp,
    })
    write(FAMILY / 'design.json', family)
    print(json.dumps({'publishedRevision': 8, 'changedRuntimeFiles': len(files),
                      'installedComponents': len(SCOPE), 'inventoryContractsPreserved': 90,
                      'runtimeSha256': MODEL_SHA, 'ownerFinalSignoff': None}))


if __name__ == '__main__':
    main()
