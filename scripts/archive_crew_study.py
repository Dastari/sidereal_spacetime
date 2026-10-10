#!/usr/bin/env python3
"""Secure provisional crew sources outside git without modifying the study."""
import argparse
import fcntl
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def manifest_records(value):
    """Include body, animation, every fit/state/LOD and any future nested records."""
    if isinstance(value, dict):
        if all(key in value for key in ('file', 'sha256', 'bytes')):
            yield value
        for child in value.values():
            yield from manifest_records(child)
    elif isinstance(value, list):
        for child in value:
            yield from manifest_records(child)


def safe_file(root, name):
    path = root / name
    if Path(name).is_absolute() or '..' in Path(name).parts or path.is_symlink():
        raise ValueError(f'Unsafe source path: {name}')
    if not path.resolve().is_relative_to(root.resolve()) or not path.is_file():
        raise ValueError(f'Missing or unsafe source file: {name}')
    return path


def verify_export(exports):
    manifest = json.loads((exports / 'crew-manifest.json').read_text())
    count = 0
    for record in manifest_records(manifest):
        path = safe_file(exports, record['file'])
        if path.stat().st_size != record['bytes'] or digest(path) != record['sha256']:
            raise ValueError(f'Source manifest mismatch: {record["file"]}')
        count += 1
    if not count:
        raise ValueError('Export manifest contains no hash records')
    return count


def archive(source, archive_root):
    source, archive_root = source.resolve(), archive_root.resolve()
    if archive_root.is_relative_to(source) or source.is_relative_to(archive_root):
        raise ValueError('Archive and source must be separate directories')
    commit = subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip()
    count = verify_export(source / 'export')
    names = sorted(str(path.relative_to(source)) for path in (source / 'export').rglob('*') if path.is_file())
    names += ['tmp/anim/crew-anims.blend', 'MIGRATION.md', 'CREW_SPEC.md']
    records = {name: {'sha256': digest(safe_file(source, name)), 'bytes': safe_file(source, name).stat().st_size} for name in names}
    relative = Path('crew-study') / commit
    target = archive_root / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        actual = sorted(str(path.relative_to(target)) for path in target.rglob('*') if path.is_file())
        if actual != sorted(names):
            raise ValueError('Immutable archive has a different file inventory')
        for name, record in records.items():
            path = safe_file(target, name)
            if path.stat().st_size != record['bytes'] or digest(path) != record['sha256']:
                raise ValueError(f'Immutable archive differs: {name}')
    else:
        with tempfile.TemporaryDirectory(prefix='.crew-study-', dir=target.parent) as temporary:
            staged = Path(temporary) / 'snapshot'
            for name in names:
                dest = staged / name
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(safe_file(source, name), dest)
            for name, record in records.items():
                if digest(safe_file(staged, name)) != record['sha256'] or digest(safe_file(source, name)) != record['sha256']:
                    raise ValueError(f'Source changed during archive: {name}')
            verify_export(staged / 'export')
            if subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip() != commit:
                raise ValueError('Study commit changed during archive')
            staged.rename(target)
    receipt = {'schema': 'sidereal.crew.archive/1', 'status': 'provisional, not owner-approved',
               'sourceCommit': commit, 'path': str(relative), 'manifestRecordsVerified': count, 'files': records}
    # Serialize aggregate updates with other invocations of this archiver.
    with (archive_root / '.crew-archive.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        manifests = archive_root / 'manifests'
        manifests.mkdir(exist_ok=True)
        batch = 'crew-study-' + commit[:8]
        (manifests / (batch + '.sha256')).write_text(''.join(f'{record["sha256"]}  {relative}/{name}\n' for name, record in sorted(records.items())))
        (archive_root / ('manifest-' + batch + '.json')).write_text(json.dumps(receipt, indent=2) + '\n')
        (archive_root / 'MANIFEST.sha256').write_text(''.join(path.read_text() for path in sorted(manifests.glob('*.sha256'))))
    return receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--archive', type=Path, default=Path('/root/sidereal-art-archive'))
    args = parser.parse_args()
    receipt = archive(args.source, args.archive)
    print(f'Archived {len(receipt["files"])} files; verified {receipt["manifestRecordsVerified"]} export records at {receipt["path"]}')


if __name__ == '__main__':
    main()
