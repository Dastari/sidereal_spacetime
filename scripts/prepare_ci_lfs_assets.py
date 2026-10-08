"""Hydrate tracked LFS pointers from a pinned ordinary release, never the LFS API."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import tarfile
import tempfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = Path('assets/ci/lfs-objects-r001.json')
SCHEMA = 'sidereal.ci-lfs-objects.v1'
POINTER = re.compile(rb'version https://git-lfs.github.com/spec/v1\noid sha256:([0-9a-f]{64})\nsize (0|[1-9][0-9]*)\n?')
HEX = re.compile(r'[0-9a-f]{64}')


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def inventory(root, revision=None):
    """Read authoritative Git blobs, not possibly edited working-tree files."""
    command = ['git', 'ls-tree', '-r', '-z', revision] if revision else ['git', 'ls-files', '--stage', '-z']
    entries = subprocess.check_output(command, cwd=root).split(b'\0')
    paths = {}
    for entry in entries:
        if not entry:
            continue
        header, name = entry.split(b'\t', 1)
        mode, value, third = header.split()
        oid = third if revision else value
        if not revision and third != b'0':
            raise ValueError('Unresolved Git index entries')
        if mode == b'160000':
            continue
        paths[name.decode()] = (oid.decode(), mode.decode())
    oids = sorted({v[0] for v in paths.values()})
    if not oids:
        return {}
    checked = subprocess.run(['git', 'cat-file', '--batch-check'], input=('\n'.join(oids)+'\n').encode(),
                             stdout=subprocess.PIPE, cwd=root, check=True).stdout.splitlines()
    small = [line.split()[0] for line in checked if line.split()[1] == b'blob' and int(line.split()[2]) <= 1024]
    if not small:
        return {}
    raw = subprocess.run(['git', 'cat-file', '--batch'], input=b'\n'.join(small)+b'\n',
                         stdout=subprocess.PIPE, cwd=root, check=True).stdout
    stream = io.BytesIO(raw)
    pointers = {}
    for _ in small:
        oid, kind, size = stream.readline().split()
        data = stream.read(int(size))
        if stream.read(1) != b'\n' or kind != b'blob':
            raise ValueError('Incomplete Git blob inventory')
        if not data.startswith(b'version https://git-lfs.github.com/spec/v1'):
            continue
        match = POINTER.fullmatch(data)
        if not match:
            raise ValueError('Unsupported or malformed Git LFS pointer')
        pointers[oid.decode()] = (match[1].decode(), int(match[2]), data)
    result = {}
    for name, (oid, mode) in paths.items():
        if oid in pointers:
            if mode not in ('100644', '100755'):
                raise ValueError('LFS pointer is not a regular tracked file')
            content_oid, size, pointer = pointers[oid]
            result[name] = {'sha256': content_oid, 'bytes': size, 'pointer': pointer, 'mode': int(mode, 8) & 0o777}
    return result


def destination(root, name):
    logical = PurePosixPath(name)
    if logical.is_absolute() or str(logical) != name or '..' in logical.parts or '\\' in name:
        raise ValueError('Invalid tracked LFS destination')
    path = root / name
    for parent in [path, *path.parents]:
        if parent == root:
            break
        if parent.is_symlink():
            raise ValueError('LFS destination contains a symlink')
    if not path.resolve().is_relative_to(root):
        raise ValueError('LFS destination escapes checkout')
    return path


def load_manifest(root):
    data = json.loads((root / MANIFEST).read_text())
    if data.get('schema') != SCHEMA or not re.fullmatch(r'[0-9a-f]{40}', data.get('sourceCommit', '')):
        raise ValueError('Unsupported LFS object manifest')
    archive = data.get('archive', {})
    if (archive.get('name') != 'public-main-lfs-objects.tar.xz' or not HEX.fullmatch(archive.get('sha256', ''))
            or type(archive.get('bytes')) is not int or not 0 < archive['bytes'] < 2**31
            or not re.fullmatch(r'https://github.com/Dastari/sidereal_spacetime/releases/download/ci-lfs-[0-9a-f]+-r[0-9]+/public-main-lfs-objects.tar.xz', archive.get('url', ''))):
        raise ValueError('Invalid ordinary release archive pin')
    objects = {}
    for row in data.get('objects', []):
        oid = row.get('sha256', '')
        if (not HEX.fullmatch(oid) or oid in objects or type(row.get('bytes')) is not int or row['bytes'] < 0):
            raise ValueError('Invalid or duplicate LFS object pin')
        objects[oid] = row['bytes']
    if not objects:
        raise ValueError('Empty LFS object manifest')
    return data, objects


def download(archive, pin):
    archive.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=archive.parent, delete=False) as out:
            temporary = Path(out.name)
            with urllib.request.urlopen(pin['url'], timeout=90) as response:
                length = response.headers.get('Content-Length')
                if length is not None and int(length) != pin['bytes']:
                    raise ValueError('Release archive Content-Length differs')
                remaining = pin['bytes'] + 1
                while remaining:
                    chunk = response.read(min(1024*1024, remaining))
                    if not chunk:
                        break
                    out.write(chunk)
                    remaining -= len(chunk)
        if temporary.stat().st_size != pin['bytes'] or digest(temporary) != pin['sha256']:
            raise ValueError('Ordinary release archive size/hash differs')
        temporary.replace(archive)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def prepare(root=ROOT, archive_path=None):
    root = Path(root).resolve()
    manifest, objects = load_manifest(root)
    tracked = inventory(root)
    missing = {}
    for name, entry in tracked.items():
        if objects.get(entry['sha256']) != entry['bytes']:
            raise ValueError('Tracked LFS object is absent from the pinned CI bundle; refresh the reviewed public-main cache: ' + name)
        path = destination(root, name)
        if path.is_file() and path.stat().st_size == entry['bytes'] and digest(path) == entry['sha256']:
            continue
        if path.exists() and (not path.is_file() or path.read_bytes() != entry['pointer']):
            raise ValueError('LFS file differs; refusing to overwrite local edits: ' + name)
        missing[name] = entry
    if not missing:
        return {'verified': len(tracked), 'restored': 0, 'gitLfsDownloads': 0}
    archive = Path(archive_path) if archive_path is not None else root / '.runtime/ci-lfs' / manifest['archive']['name']
    if not archive.is_file():
        if archive_path is not None:
            raise ValueError('Explicit LFS object archive missing')
        download(archive, manifest['archive'])
    if archive.stat().st_size != manifest['archive']['bytes'] or digest(archive) != manifest['archive']['sha256']:
        raise ValueError('Cached ordinary release archive size/hash differs')
    # Validate the full object inventory before changing any tracked destination.
    with tempfile.TemporaryDirectory(prefix='sidereal-ci-lfs-') as temporary:
        stage = Path(temporary)
        seen = set()
        with tarfile.open(archive, 'r:xz') as bundle:
            for member in bundle:
                oid = member.name.removeprefix('objects/')
                if (member.name != 'objects/'+oid or oid not in objects or oid in seen or not member.isfile()
                        or member.size != objects[oid]):
                    raise ValueError('Unexpected, duplicate, non-file or wrong-sized LFS archive member')
                seen.add(oid)
                path = stage / oid
                with bundle.extractfile(member) as source, path.open('xb') as out:
                    shutil.copyfileobj(source, out)
                if digest(path) != oid:
                    raise ValueError('LFS archive member hash differs')
        if seen != set(objects):
            raise ValueError('LFS object archive inventory is incomplete')
        for name, entry in sorted(missing.items()):
            path = destination(root, name)
            if path.exists() and path.read_bytes() != entry['pointer']:
                raise ValueError('LFS destination changed during preparation: ' + name)
            path.parent.mkdir(parents=True, exist_ok=True)
            temporary_path = None
            try:
                with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as out:
                    temporary_path = Path(out.name)
                    with (stage / entry['sha256']).open('rb') as source:
                        shutil.copyfileobj(source, out)
                temporary_path.chmod(entry['mode'])
                destination(root, name)
                if path.exists() and path.read_bytes() != entry['pointer']:
                    raise ValueError('LFS destination changed during preparation: ' + name)
                os.replace(temporary_path, path)
            finally:
                if temporary_path is not None:
                    temporary_path.unlink(missing_ok=True)
    return {'verified': len(tracked), 'restored': len(missing), 'gitLfsDownloads': 0}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=Path, help='Use a local exact-pinned archive without any download')
    args = parser.parse_args()
    print(json.dumps(prepare(archive_path=args.archive)))
