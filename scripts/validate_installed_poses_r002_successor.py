"""Validate preserved r002 handhelds alongside the strictly receipted r009 crew.

The historical r002 validator is itself pinned by r003, so it remains untouched.
This read-only successor keeps every original receipt/snapshot/asset byte and
resolves only the authorized character replacement through exact r008 lineage.
"""
from pathlib import Path
import json
import struct

from publish_pose_runtime import ROOT, PINNED, NATIVE, ITEMS, QUOTE, MESSAGE
from character_components.publication_validation import (
    RUNTIME as CHARACTER_RUNTIME, CHANGED_FILES, PREVIOUS_MANIFEST,
    digest, path_under, read, require, validate_r009,
)

RUNTIME = 'assets/runtime/crew/poses/r002'
SOURCE = 'assets/art-library/designs/crew.animation.aim/revisions/r002'
PUBLICATION = 'assets/art-library/designs/crew.animation.aim/publications/r002'
RECEIPT_SHA = '1cf5dce47508957e3b3319b858773a415c452acf43f0a8ed02cdc0782fb9b3e6'
# Exact historical namespace also preserved by r003 canonical-before.json.
PUBLICATION_FILES = {
    'README.md': 'fd6f27986f84acd2ac67e4a257bf25f07a18adb7eae818d83a3e841c24160797',
    'canonical-before.json': 'd4d5b9b7ec335bc9628f1d7bd615f915e0af6a627f2967df1bff3cf6a8402139',
    'canonical-equipment-manifest.json': 'd936ddd40ff7f987f365f13d32656ea10d00d103638a77f38266b5ab810ca2b9',
    'installed-validation.json': '2d61e188192ded65dc6720e321920fdf7906367d08600ef7f76d4496aaab25b2',
    'publication.json': RECEIPT_SHA,
}
HISTORICAL_VALIDATOR = 'scripts/validate_installed_poses.py'
HISTORICAL_VALIDATOR_SHA = 'fc676e5ae50a82e790e9a7f26791598ddd8d9064d094980e7936be32d3fb8af1'
CREW = CHARACTER_RUNTIME + '/modular-crew.glb'
CREW_MANIFEST = CHARACTER_RUNTIME + '/manifest.json'
EQUIPMENT = 'assets/runtime/equipment'
NATIVE_EQUIPMENT = 'assets/source/equipment-kit.blend'


def files_under(root, name):
    directory = path_under(root, name)
    files = {path.relative_to(root).as_posix() for path in directory.rglob('*') if path.is_file()}
    for file in files:
        path_under(root, file)  # Reject symlink escapes, including intermediate directories.
    return files


def validate_successor_snapshot(root, snapshot):
    manifest = read(path_under(root, CREW_MANIFEST))
    catalog = read(path_under(root, 'packages/content/src/character-components.json'))
    receipt = read(path_under(root, manifest['publication']))
    previous, sources = validate_r009(root, manifest, catalog, receipt)
    # r002 originally captured canonical equipment plus only two crew pointers.
    # Full223 character membership and exact21 successor replacements are checked
    # by validate_r009; do not invent entries in the immutable32-path snapshot.
    expected = files_under(root, EQUIPMENT) | {NATIVE_EQUIPMENT, CREW, CREW_MANIFEST}
    require(set(snapshot) == expected, 'r002 canonical snapshot membership changed')
    require(snapshot[CREW_MANIFEST] == PREVIOUS_MANIFEST['sha256'], 'Historical r008 manifest identity changed')
    for name, expected_sha in snapshot.items():
        if name == CREW:
            require(expected_sha == previous['files']['modular-crew.glb'] == digest(sources['modular-crew.glb']),
                    'Historical r008 crew source changed')
        elif name == CREW_MANIFEST:
            require(digest(path_under(root, PREVIOUS_MANIFEST['path'])) == expected_sha,
                    'Historical r008 manifest changed')
        else:
            require(digest(path_under(root, name)) == expected_sha, f'Non-character canonical artifact changed: {name}')
    return {'canonicalFilesPreserved': len(snapshot) - 2, 'preservationSnapshotEntries': len(snapshot),
            'historicalCharacterFilesPreservedAtSources': len(sources), 'validatedSuccessorCharacterFiles': len(CHANGED_FILES)}


def validate(root=ROOT):
    root = root.resolve()
    out, source, publication = (path_under(root, name) for name in (RUNTIME, SOURCE, PUBLICATION))
    require(digest(path_under(root, HISTORICAL_VALIDATOR)) == HISTORICAL_VALIDATOR_SHA,
            'Pinned historical r002 validator changed')
    require(digest(publication / 'publication.json') == RECEIPT_SHA, 'Historical r002 receipt changed')
    receipt = read(publication / 'publication.json')
    require(receipt['schema'] == 'sidereal.pose-runtime-publication.v1' and receipt['revision'] == 'r002' and
            receipt['runtimeRoot'] == RUNTIME and receipt['sourceRoot'] == SOURCE and
            receipt['publicBaseUrl'] == '/assets/crew/poses/r002/', 'Historical r002 identity mismatch')
    require(receipt['authorization']['ownerQuote'] == QUOTE and receipt['authorization']['messageReference'] == MESSAGE and
            receipt['authorization']['finalArtSignoff'] is False and receipt['ownerFinalSignoff'] is None,
            'Historical publication authorization changed')
    require(files_under(root, PUBLICATION) == {PUBLICATION + '/' + name for name in PUBLICATION_FILES},
            'Historical r002 publication namespace changed')
    for name, expected in PUBLICATION_FILES.items():
        require(digest(publication / name) == expected, f'Historical r002 publication artifact changed: {name}')
    require(files_under(root, RUNTIME) == {RUNTIME + '/' + name for name in PINNED}, 'r002 runtime membership changed')
    require(set(receipt['files']) == set(PINNED), 'Historical r002 file accounting changed')
    for name, expected in PINNED.items():
        require(digest(out / name) == digest(source / name) == receipt['files'][name]['sha256'] == expected,
                f'r002 paired artifact changed: {name}')
        require(receipt['files'][name]['bytes'] == (out / name).stat().st_size, f'r002 artifact size changed: {name}')
    require(receipt['preservedNativeSources'] == {SOURCE + '/' + name: sha for name, sha in NATIVE.items()},
            'Historical r002 native accounting changed')
    for name, expected in NATIVE.items():
        require(digest(source / name) == expected, f'r002 native source changed: {name}')
    for name, expected in receipt['validationInputs'].items():
        require(digest(path_under(root, SOURCE + '/' + name)) == expected, f'r002 validation input changed: {name}')
    require(receipt['rollback']['canonicalSnapshot'] == PUBLICATION + '/canonical-before.json',
            'Historical r002 snapshot location changed')
    snapshot_path = publication / 'canonical-before.json'
    require(digest(snapshot_path) == receipt['rollback']['canonicalSnapshotSha256'], 'Historical r002 snapshot changed')
    snapshot = read(snapshot_path)
    require(digest(publication / 'canonical-equipment-manifest.json') == snapshot[EQUIPMENT + '/manifest.json'],
            'Preserved canonical equipment manifest changed')
    preserved = validate_successor_snapshot(root, snapshot)
    metadata = read(out / 'profile-socket-metadata.json')
    require(set(metadata['items']) == set(ITEMS), 'r002 socket metadata item membership changed')
    for name in ITEMS:
        raw = (out / 'equipment' / (name + '.glb')).read_bytes()
        require(raw[:4] == b'glTF' and struct.unpack_from('<II', raw, 4) == (2, len(raw)), f'Invalid r002 GLB: {name}')
        size, kind = struct.unpack_from('<II', raw, 12)
        require(kind == 0x4E4F534A and 20 + size <= len(raw), f'Invalid r002 GLB JSON: {name}')
        gltf = json.loads(raw[20:20 + size])
        require(gltf['meshes'] and gltf['materials'] and not any('uri' in buffer for buffer in gltf['buffers']),
                f'Invalid/external r002 GLB: {name}')
        require(metadata['items'][name]['assetId'] == name, f'r002 socket metadata identity changed: {name}')
    require(not (out / 'crew-poses.glb').exists(), 'Historical pose crew must not be published')
    return {'pairedRuntimeRevision': 'r002', 'pairedEquipment': len(ITEMS), 'publishedFiles': len(PINNED),
            'sourceAndDeliveryHashes': 'pass', **preserved, 'nativeSourcesPreserved': len(NATIVE),
            'normalCrew': 'r009 modular crew through exact r008 lineage; historical r002 handhelds and original validator remain unchanged',
            'ownerFinalSignoff': None}


if __name__ == '__main__':
    print(json.dumps(validate()))
