"""Install the authorized, frozen r009 visual bundle after independent review.

All candidate validation and staging finish before runtime replacement. A failed
commit restores changed files from already-existing immutable authoring sources;
no backup, database operation, service change or public deployment occurs.
"""
from pathlib import Path
import argparse
import copy
import datetime
import fcntl
import json
import math
import os
import shutil
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT / 'scripts') not in sys.path:
    sys.path.insert(0, str(ROOT / 'scripts'))
from character_components.publication_validation import (
    CHANGED_FILES, COMPONENTS, HAIR, PREVIOUS_CATALOG, PREVIOUS_MANIFEST,
    R009, RUNTIME, digest, path_under, r008_lineage, read, require, validate_report,
)
from character_components.validate_faces import png

CATALOG = 'packages/content/src/character-components.json'
PUBLICATION = 'assets/art-library/character-components/publications/r009'
SCOPE = ['base-male', 'base-female', *('hair-' + style for style in HAIR)]
FINAL_SOURCE_SHA = 'd48a56102afb03cbc9b7fb1990054f28f9b1bc808d3f26c98cb6a8d4f4d48334'
FINAL_GLB_SHA = '7c7de06aec3e9482d786fb72723ff36675c170cf94b0fc38046fa806de64f89a'


def write(path, value):
    with path.open('x') as stream:
        json.dump(value, stream, indent=2, allow_nan=False)
        stream.write('\n')


def candidate_evidence(root, candidate, receipt):
    """Bind all delivered files to the actual reviewed source/report/provenance."""
    require(receipt['sourceSha256'] == FINAL_SOURCE_SHA, 'Unreviewed native source')
    require(receipt['runtimeSha256'] == FINAL_GLB_SHA, 'Unreviewed combined GLB')
    report = validate_report(root, receipt)
    native = report['checks']['nativePreservation']['evidence']
    require(native['passed'] is True and native['errors'] == [] and
            native['candidateSha256'] == receipt['sourceSha256'] and native['objectsCompared'] == 1139 and
            native['maxNativeVertexDisplacementM'] == native['maxNativeCornerNormalDelta'] == 0,
            'Native preservation/source evidence mismatch')
    require(report['checks'].get('femaleHeadAndJawProportions', {}).get('passed') is True,
            'Missing reviewed female head/jaw proportions')
    topology_path = candidate / 'hair-topology-validation.json'
    topology = read(topology_path)
    require(topology['passed'] is True and topology['sourceSha256'] == receipt['sourceSha256'] and
            topology['glbSha256'] == receipt['runtimeSha256'], 'Hair topology source/export mismatch')
    require(set(topology['hair']) == {'hair-' + style for style in HAIR}, 'Incomplete hair topology evidence')
    for key, value in topology['hair'].items():
        require(value['passed'] is True and value['native']['passed'] is True and value['exported']['passed'] is True,
                f'Failed hair topology: {key}')
        for part, fields in [('native', ('boundaryEdges', 'nonManifoldEdges', 'nonContiguousEdges', 'wireEdges', 'tinyFaces')),
                             ('exported', ('boundaryEdges', 'nonManifoldEdges', 'inconsistentlyOrientedEdges', 'collapsedTriangles', 'zeroAreaTriangles'))]:
            require(all(value[part][field] == 0 for field in fields), f'Open/degenerate hair surface: {key}')
        require(value['native']['allRetainedInputsHidden'] is True, f'Visible retained hair inputs: {key}')
    repair_path = candidate / 'repair-record.json'
    repair = read(repair_path)
    require(repair['passed'] is True and repair['nativeSourceSha256'] == receipt['sourceSha256'],
            'Repair/native source mismatch')
    bounds = repair['croppedAfterBoundsM']
    require(bounds == repair['croppedBeforeBoundsM'] and len(bounds) == 3 and
            all(len(axis) == 2 and all(math.isfinite(v) for v in axis) and axis[0] < axis[1] for axis in bounds),
            'Cropped repair bounds changed/invalid')
    seven = set(HAIR) - {'cropped'}
    require(set(repair['sevenNativeHairHashesBefore']) == seven and
            repair['sevenNativeHairHashesBefore'] == repair['sevenNativeHairHashesAfter'],
            'Other seven hairstyles changed during G repair')
    require(all(repair['sevenNativeHairHashesAfter'][style] == topology['hair']['hair-' + style]['native']['nativeSurfaceSha256']
                for style in seven), 'Repair/topology native surfaces mismatch')
    thumbnail_path = candidate / 'thumbnail-provenance.json'
    thumbnails = read(thumbnail_path)['files']
    require(set(thumbnails) == {key + '.png' for key in COMPONENTS}, 'Thumbnail provenance scope mismatch')
    for name, evidence in thumbnails.items():
        source = path_under(root, evidence['source'])
        require(source.is_relative_to(root / R009), f'Thumbnail outside r009: {name}')
        require(evidence['sha256'] == receipt['files'][name]['sha256'] == digest(source),
                f'Thumbnail provenance/source mismatch: {name}')
        width, height, pixels = png((candidate / name).read_bytes())
        require(width > 0 and height > 0 and any(pixels[3::4]), f'Empty/transparent thumbnail: {name}')
    return {key: {'path': str(path.relative_to(root)), 'sha256': digest(path)} for key, path in
            [('topology', topology_path), ('repairBounds', repair_path), ('thumbnails', thumbnail_path)]}


def prepare(root, candidate, validation):
    """Read-only plan; usable by the integration owner before running installer."""
    root = root.resolve()
    candidate = path_under(root, str(candidate.relative_to(root)))
    validation = path_under(root, str(validation.relative_to(root)))
    require(candidate.is_relative_to(root / R009) and validation.parent == candidate,
            'Candidate/validation must belong to the same r009 delivery')
    publication = path_under(root, PUBLICATION)
    require(not publication.exists(), 'Preserve prior publication; reconcile explicitly')
    out = path_under(root, RUNTIME)
    before, catalog, historical_sources = r008_lineage(root)
    require(read(out / 'manifest.json') == before and read(path_under(root, CATALOG)) == catalog,
            'Current installation differs from preserved r008 metadata')
    actual = {path.relative_to(out).as_posix() for path in out.rglob('*') if path.is_file()}
    require(actual == set(before['files']) | {'manifest.json'}, 'Unexpected current runtime file')
    for name, expected in before['files'].items():
        require(digest(path_under(root, RUNTIME + '/' + name)) == expected, f'Current runtime changed: {name}')
    require(len(catalog['components']) == 90, 'Existing equipment contract count changed')
    files = {name: path_under(root, str((candidate / name).relative_to(root))) for name in sorted(CHANGED_FILES)}
    require(len(files) == 21, 'Unexpected r009 replacement scope')
    after_catalog = copy.deepcopy(catalog)
    after_catalog['revision'] = 9
    for key in SCOPE:
        after_catalog['visualRevisions'][key] = 9
    source = path_under(root, str((candidate / 'blender-source.blend').relative_to(root)))
    receipt = {
        'schema': 'sidereal.character-visual-publication.v2', 'revision': 9, 'previousRevision': 8,
        'recordedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'source': str(source.relative_to(root)), 'sourceSha256': digest(source),
        'runtimeSha256': digest(files['modular-crew.glb']), 'installedComponents': SCOPE, 'pairedPoseRevision': 3,
        'authorization': {
            'ownerQuote': "I'm happy to confirm all art, you can push all changes to the live game please.",
            'messageReference': 'Owner standing live-game publication authorization in this character/UI conversation, followed by the 2026-09-10 neon hair and facial-reference improvement request.',
            'scope': 'Publish the requested validated head/hair/face update in the normal game; new r009 final artistic approval remains pending.',
            'finalArtSignoff': False,
        },
        'files': {name: {'source': str(path.relative_to(root)), 'sha256': digest(path),
                         'previousSha256': before['files'][name]} for name, path in files.items()},
        'unchangedRuntimeFiles': {name: sha for name, sha in before['files'].items() if name not in files},
        'previousManifest': dict(PREVIOUS_MANIFEST), 'previousCatalog': dict(PREVIOUS_CATALOG),
        'validation': {'path': str(validation.relative_to(root)), 'sha256': digest(validation)},
        'backup': 'None created, as explicitly instructed. Existing immutable art/release sources are retained.',
        'inventoryContractsPreserved': 90, 'rigBones': 16, 'originalAnimationClips': 12, 'ownerFinalSignoff': None,
    }
    receipt['deliveryEvidence'] = candidate_evidence(root, candidate, receipt)
    after = copy.deepcopy(before)
    after.update(revision=9, blenderSource=receipt['source'], sourceSha256=receipt['sourceSha256'],
                 publication=PUBLICATION + '/publication.json', componentRevisions=after_catalog['visualRevisions'], ownerFinalSignoff=None)
    after['files'].update({name: evidence['sha256'] for name, evidence in receipt['files'].items()})
    return {'root': root, 'candidate': candidate, 'validation': validation, 'files': files, 'before': before,
            'catalogBefore': catalog, 'after': after, 'catalogAfter': after_catalog, 'receipt': receipt,
            'historicalSources': historical_sources}


def stage(plan, folder):
    """Every potentially failing source copy/JSON serialization precedes commit."""
    runtime = folder / 'runtime'
    publication = folder / 'publication'
    runtime.mkdir()
    publication.mkdir()
    for name, source in plan['files'].items():
        shutil.copy2(source, runtime / name)
        require(digest(runtime / name) == plan['receipt']['files'][name]['sha256'], f'Staged file changed: {name}')
    write(runtime / 'manifest.json', plan['after'])
    write(folder / 'character-components.json', plan['catalogAfter'])
    write(publication / 'publication.json', plan['receipt'])
    write(publication / 'installed-manifest.json', plan['after'])
    write(publication / 'installed-character-components.json', plan['catalogAfter'])


def commit(plan, folder):
    """Per-file atomic replacements; existing immutable sources recover errors.

This is a local working-tree install, not an atomic public client activation.
Managed immutable client builds provide the separate public release boundary.
"""
    root = plan['root']
    operations = [(folder / 'runtime' / name, root / RUNTIME / name, plan['historicalSources'][name]) for name in plan['files']]
    operations += [(folder / 'runtime/manifest.json', root / RUNTIME / 'manifest.json', root / PREVIOUS_MANIFEST['path']),
                   (folder / 'character-components.json', root / CATALOG, root / PREVIOUS_CATALOG['path'])]
    applied = []
    try:
        for staged, target, original in operations:
            os.replace(staged, target)
            applied.append((target, original))
        # Receipt becomes visible only after every delivered file and pointer.
        os.rename(folder / 'publication', root / PUBLICATION)
    except Exception as error:
        failures = []
        for number, (target, original) in enumerate(reversed(applied)):
            try:
                temporary = folder / ('restore-' + str(number))
                shutil.copy2(original, temporary)
                os.replace(temporary, target)
            except Exception as restore_error:
                failures.append(f'{target.relative_to(root)}: {restore_error}')
        if failures:
            raise RuntimeError('Installation failed; restoring existing immutable sources also failed: ' + '; '.join(failures)) from error
        raise


def install(root, candidate, validation):
    root = root.resolve()
    out = path_under(root, RUNTIME)
    # Lock the existing directory; no persistent lock file or backup is created.
    descriptor = os.open(out, os.O_RDONLY | os.O_DIRECTORY)
    try:
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        plan = prepare(root, candidate, validation)
        for directory in (root / CATALOG, root / PUBLICATION):
            require(directory.parent.stat().st_dev == out.parent.stat().st_dev, 'Install targets must share a filesystem')
        with tempfile.TemporaryDirectory(prefix='.r009-stage-', dir=out.parent) as temporary:
            folder = Path(temporary)
            stage(plan, folder)
            # Recheck source/runtime identities after staging, before mutation.
            refreshed = prepare(root, candidate, validation)
            require(refreshed['receipt']['files'] == plan['receipt']['files'] and
                    refreshed['receipt']['sourceSha256'] == plan['receipt']['sourceSha256'] and
                    refreshed['receipt']['validation'] == plan['receipt']['validation'] and
                    refreshed['receipt']['deliveryEvidence'] == plan['receipt']['deliveryEvidence'],
                    'Candidate changed during staging')
            commit(plan, folder)
        return {'installedRevision': 9, 'files': len(plan['files']), 'components': len(SCOPE),
                'runtimeSha256': plan['receipt']['runtimeSha256'], 'ownerFinalSignoff': None, 'backup': False}
    finally:
        os.close(descriptor)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--candidate', required=True)
    parser.add_argument('--validation', required=True)
    args = parser.parse_args()
    candidate = ROOT / args.candidate
    validation = ROOT / args.validation
    print(json.dumps(install(ROOT, candidate, validation)))


if __name__ == '__main__':
    main()
