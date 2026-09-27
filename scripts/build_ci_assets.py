"""Repack the explicit native input inventory without regenerating any geometry."""
from pathlib import Path
import argparse
import json
import hashlib
import tempfile
import tarfile
from prepare_ci_assets import ROOT, MANIFEST, digest, load_manifest


def build(source_root, output_root):
    manifest = load_manifest(output_root)
    archive = output_root / MANIFEST.parent / manifest['archive']
    # Never truncate the last good bundle when a source is absent or edited.
    with tempfile.TemporaryDirectory(dir=archive.parent) as temporary:
        candidate = Path(temporary) / archive.name
        with tarfile.open(candidate, 'w:xz', format=tarfile.PAX_FORMAT, preset=6) as bundle:
            for entry in sorted(manifest['members'], key=lambda m: m['path']):
                source = source_root / entry['path']
                if source.stat().st_size != entry['bytes'] or digest(source) != entry['sha256']:
                    raise ValueError('Native source pin differs: ' + entry['path'])
                info = tarfile.TarInfo(entry['path'])
                info.size = entry['bytes']
                info.mode = 0o644
                info.mtime = 0
                with source.open('rb') as stream:
                    bundle.addfile(info, stream)
        # Verify captured bytes, including changes between source hash and read.
        pins = {entry['path']: entry for entry in manifest['members']}
        with tarfile.open(candidate, 'r:xz') as bundle:
            for member in bundle:
                with bundle.extractfile(member) as stream:
                    actual = hashlib.file_digest(stream, 'sha256').hexdigest()
                if actual != pins.pop(member.name)['sha256']:
                    raise ValueError('Native source changed during packing: ' + member.name)
        if pins:
            raise ValueError('Incomplete native input bundle')
        manifest['archiveSha256'] = digest(candidate)
        candidate_manifest = Path(temporary) / MANIFEST.name
        candidate_manifest.write_text(json.dumps(manifest, indent=2) + '\n')
        candidate.replace(archive)
        candidate_manifest.replace(output_root / MANIFEST)
    print(json.dumps({'files': len(manifest['members']), 'archiveBytes': archive.stat().st_size,
                      'archiveSha256': manifest['archiveSha256']}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', type=Path, default=ROOT)
    args = parser.parse_args()
    build(args.source_root.resolve(), ROOT)
