"""Pack already-local public-main LFS objects, with no network or art regeneration."""
import argparse
import hashlib
import json
import lzma
from pathlib import Path
import subprocess
import tarfile
import tempfile

from prepare_ci_lfs_assets import ROOT, SCHEMA, digest, inventory


def build(root, revision, output):
    root = Path(root).resolve()
    source_commit = subprocess.check_output(['git', 'rev-parse', revision+'^{commit}'], cwd=root, text=True).strip()
    subprocess.run(['git', 'merge-base', '--is-ancestor', source_commit, 'origin/main'], cwd=root, check=True)
    files = inventory(root, source_commit)
    objects = {}
    for name, entry in sorted(files.items()):
        oid, size = entry['sha256'], entry['bytes']
        if oid in objects and objects[oid] != size:
            raise ValueError('Inconsistent public-main LFS object size')
        objects[oid] = size
    common = Path(subprocess.check_output(['git', 'rev-parse', '--git-common-dir'], cwd=root, text=True).strip())
    if not common.is_absolute():
        common = root / common
    sources = {oid: common/'lfs/objects'/oid[:2]/oid[2:4]/oid for oid in objects}
    for oid, source in sources.items():
        if not source.is_file() or source.stat().st_size != objects[oid] or digest(source) != oid:
            raise ValueError('Required public-main object is not available locally: ' + oid)
    output.mkdir(parents=True, exist_ok=True)
    archive_name = 'public-main-lfs-objects.tar.xz'
    with tempfile.TemporaryDirectory(dir=output) as temporary:
        archive = Path(temporary)/archive_name
        with lzma.open(archive, 'wb', preset=6) as compressed, tarfile.open(fileobj=compressed, mode='w|') as bundle:
            for oid, size in objects.items():
                member = tarfile.TarInfo('objects/'+oid)
                member.size, member.mode, member.mtime = size, 0o644, 0
                with sources[oid].open('rb') as stream:
                    bundle.addfile(member, stream)
        remaining = objects.copy()
        with tarfile.open(archive, 'r:xz') as bundle:
            for member in bundle:
                oid = member.name.removeprefix('objects/')
                if member.name != 'objects/'+oid or member.size != remaining.pop(oid):
                    raise ValueError('Packed object inventory differs')
                with bundle.extractfile(member) as stream:
                    if hashlib.file_digest(stream, 'sha256').hexdigest() != oid:
                        raise ValueError('Local object changed during packing')
        if remaining:
            raise ValueError('Packed object inventory is incomplete')
        pin = {'schema': SCHEMA, 'sourceCommit': source_commit,
               'archive': {'name': archive_name, 'bytes': archive.stat().st_size, 'sha256': digest(archive),
                           'url': 'https://github.com/Dastari/sidereal_spacetime/releases/download/ci-lfs-'+source_commit[:9]+'-r001/'+archive_name},
               'objects': [{'sha256': oid, 'bytes': size} for oid, size in sorted(objects.items())]}
        manifest = Path(temporary)/'lfs-objects-r001.json'
        manifest.write_text(json.dumps(pin, indent=2)+'\n')
        archive.replace(output/archive_name)
        manifest.replace(output/manifest.name)
    return {'paths': len(files), 'objects': len(objects), 'objectBytes': sum(objects.values()), 'archive': pin['archive']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--revision', default='origin/main')
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    print(json.dumps(build(ROOT, args.revision, args.output.resolve()), indent=2))
