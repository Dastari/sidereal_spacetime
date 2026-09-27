"""Validate exact installed r003 pairing/provenance, independent of art approval.

Callable through validate() or runpy.run_path(..., run_name='__main__'). Importing
this module performs no installation, validation, publication or ledger writes.
"""
import json
from publish_pose_r003 import (
    ROOT, OUT, SOURCE, PUBLICATION, PUBLIC_BASE, PINNED, NATIVE, ITEMS,
    VALIDATION_INPUTS, CREW, CREW_SHA, PRIOR_RECEIPT, PRIOR_RECEIPT_SHA,
    QUOTE, MESSAGE, CORRECTIONS, digest, read, require, tree_files,
    preservation_snapshot, validate_source, validate_runtime,
    PRESERVED_TREES, PRESERVED_FILES, CREW_MANIFEST,
)
from character_components.publication_validation import (
    RUNTIME as CHARACTER_RUNTIME, CHANGED_FILES, validate_r009,
)

# Separately authorised public-release evidence added after the immutable two-file
# installer receipt. It does not rewrite the original pose/art acceptance record.
PUBLIC_RELEASE_EVIDENCE = {
    'live-20260910': '602481d0b14a716ad8c1314a9f36bf0bc3f1ddcf0e321382fba01edf71b6149f',
}


def validate_publication_namespace():
    allowed = {'publication.json', 'canonical-before.json'}
    for name, expected in PUBLIC_RELEASE_EVIDENCE.items():
        directory = PUBLICATION / name
        if not directory.exists():
            continue
        release_path = directory / 'release.json'
        require(digest(release_path) == expected, f'Public-release evidence manifest changed: {name}')
        release = read(release_path)
        captures = release['captureHashes']
        require(release['publicBrowserRecord'] == 'browser-record.json' and 'browser-record.json' in captures,
                'Public-release browser record missing')
        require(all('/' not in file and file not in ('.', '..', 'release.json') for file in captures),
                'Invalid public-release capture path')
        for file, sha in captures.items():
            require(digest(directory / file) == sha, f'Public-release capture changed: {name}/{file}')
        require({path.name for path in tree_files(directory)} == {'release.json', *captures},
                f'Unexpected/incomplete public-release evidence: {name}')
        allowed.update(name + '/' + file for file in {'release.json', *captures})
    require({path.relative_to(PUBLICATION).as_posix() for path in tree_files(PUBLICATION)} == allowed,
            'Unexpected/incomplete r003 publication receipt set')


def validate_successor_snapshot(snapshot):
    """Permit only receipted r009 face/hair files; keep the original snapshot intact."""
    manifest = read(ROOT / CREW_MANIFEST)
    catalog = read(ROOT / 'packages/content/src/character-components.json')
    require(manifest['revision'] == 9, 'Unsupported successor crew revision')
    publication = read(ROOT / manifest['publication'])
    previous, sources = validate_r009(ROOT, manifest, catalog, publication)
    require(snapshot[CREW] == CREW_SHA == previous['files']['modular-crew.glb'], 'Historical paired crew identity changed')
    prefix = CHARACTER_RUNTIME + '/'
    previous_ref = publication['previousManifest']
    require(snapshot[CREW_MANIFEST] == previous_ref['sha256'], 'Historical runtime manifest identity changed')
    expected_character = {prefix + name for name in previous['files']} | {CREW_MANIFEST}
    require({name for name in snapshot if name.startswith(prefix)} == expected_character, 'Character preservation namespace changed')
    for name, expected in snapshot.items():
        if name == CREW_MANIFEST:
            require(digest(ROOT / previous_ref['path']) == expected, 'Preserved original manifest changed')
        elif name.startswith(prefix):
            file = name[len(prefix):]
            require(previous['files'][file] == expected == digest(sources[file]), f'Preserved character source changed: {file}')
            if file not in CHANGED_FILES:
                require(digest(ROOT / name) == expected, f'Unrelated character artifact changed: {file}')
        else:
            require(digest(ROOT / name) == expected, f'Canonical/prior artifact changed: {name}')
    # Preserve membership checks as well as per-file hashes: no extra kit or
    # prior namespace files may hide outside the original 287-path snapshot.
    prior = read(ROOT / PRIOR_RECEIPT)
    paths = [path for name in PRESERVED_TREES for path in tree_files(ROOT / name)]
    paths += [ROOT / name for name in PRESERVED_FILES]
    paths += [ROOT / name for name in prior['preservedNativeSources']]
    paths += [ROOT / prior['sourceRoot'] / name for name in prior['files']]
    paths += [ROOT / prior['sourceRoot'] / name for name in prior['validationInputs']]
    paths += [ROOT / previous['blenderSource'], ROOT / previous['publication']]
    require({path.relative_to(ROOT).as_posix() for path in paths} == set(snapshot), 'Prior/canonical namespace membership changed')
    return {'canonicalAndPriorFilesPreserved': len(snapshot) - len(CHANGED_FILES) - 1,
            'preservationSnapshotEntries': len(snapshot), 'historicalCharacterFilesPreservedAtSources': len(sources),
            'validatedSuccessorCharacterFiles': len(CHANGED_FILES),
            'normalCrew': 'r009 modular male/female crew through validated r008 lineage; exact shared binds and original clips; r003 handhelds unchanged'}


def validate():
    validate_publication_namespace()
    receipt = read(PUBLICATION / "publication.json")
    require(receipt["schema"] == "sidereal.pose-runtime-publication.v1" and receipt["revision"] == "r003",
            "Wrong runtime publication revision/schema")
    require(receipt["runtimeRoot"] == OUT.relative_to(ROOT).as_posix() and
            receipt["sourceRoot"] == SOURCE.relative_to(ROOT).as_posix() and receipt["publicBaseUrl"] == PUBLIC_BASE,
            "Publication source/runtime/public path mismatch")
    require(receipt["authorization"]["ownerQuote"] == QUOTE and receipt["authorization"]["messageReference"] == MESSAGE and
            receipt["authorization"]["finalArtSignoff"] is False and receipt["ownerFinalSignoff"] is None,
            "Normal-use authorization must remain separate from final art approval")
    require(receipt["requestedCorrections"] == CORRECTIONS, "Requested integration scope changed")
    require(set(receipt["files"]) == set(PINNED), "Publication file set mismatch")
    validate_source()
    validate_runtime(OUT)
    for name, expected in PINNED.items():
        require(receipt["files"][name] == {"sha256": expected, "bytes": (OUT / name).stat().st_size},
                f"Publication file evidence mismatch: {name}")
    require(receipt["validationInputs"] == VALIDATION_INPUTS, "Validation provenance pin mismatch")
    require(receipt["preservedNativeSources"] == {
        (SOURCE / name).relative_to(ROOT).as_posix(): expected for name, expected in NATIVE.items()
    }, "Native authoring provenance mismatch")
    require(receipt["pairedCrew"]["runtime"] == CREW and receipt["pairedCrew"]["revision"] == "r008" and
            receipt["pairedCrew"]["sha256"] == CREW_SHA, "Paired modular crew changed")
    require(receipt["previousPairedPublication"] == {"path": PRIOR_RECEIPT, "sha256": PRIOR_RECEIPT_SHA},
            "Previous paired namespace provenance changed")
    snapshot_path = PUBLICATION / "canonical-before.json"
    require(receipt["rollback"]["canonicalSnapshot"] == snapshot_path.relative_to(ROOT).as_posix() and
            digest(snapshot_path) == receipt["rollback"]["canonicalSnapshotSha256"], "Preservation snapshot changed")
    snapshot = read(snapshot_path)
    if read(ROOT / CREW_MANIFEST)['revision'] == 8:
        require(snapshot == preservation_snapshot(), "Prior r002, r008 or canonical artifacts changed")
        preserved = {'canonicalAndPriorFilesPreserved': len(snapshot),
                     'normalCrew': 'r008 modular male/female crew; no historical pose crew GLB published'}
    else:
        preserved = validate_successor_snapshot(snapshot)
    return {
        "pairedRuntimeRevision": "r003", "pairedEquipment": len(ITEMS), "publishedFiles": len(PINNED),
        "publicBaseUrl": PUBLIC_BASE, "sourceAndDeliveryHashes": "pass",
        **preserved, "nativeSourcesPreserved": len(NATIVE),
        "ownerFinalSignoff": None,
    }


def main():
    print(json.dumps(validate()))


if __name__ == "__main__":
    main()
