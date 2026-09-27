"""Restore hash-pinned native inputs omitted from the loose Git file inventory."""
from pathlib import Path, PurePosixPath
import hashlib
import json
import os
import shutil
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = Path('assets/ci/native-inputs-r001.json')
SCHEMA = 'sidereal.ci-native-inputs.v1'
PRIVATE_FIXTURES = {
    'assets/art-library/designs/crew.animation.aim/revisions/r003/runtime-aim-space.json',
    'assets/art-library/designs/shipyard.structure.wayfarer-transition/revisions/r003/wayfarer-transition.glb',
}


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def valid_path(name):
    if not isinstance(name, str):
        return False
    p = PurePosixPath(name)
    return (isinstance(name, str) and str(p) == name and not p.is_absolute()
            and '..' not in p.parts and '\\' not in name
            and (name.startswith('assets/runtime/') or name in PRIVATE_FIXTURES))


def load_manifest(root):
    data = json.loads((root / MANIFEST).read_text())
    if data.get('schema') != SCHEMA or data.get('archive') != 'native-inputs-r001.tar.xz':
        raise ValueError('Unsupported native input manifest')
    members = data.get('members', [])
    paths = [m['path'] for m in members]
    if not members or len(paths) != len(set(paths)):
        raise ValueError('Empty or duplicate native input paths')
    for m in members:
        if (not valid_path(m['path']) or type(m['bytes']) is not int or m['bytes'] < 0
                or not isinstance(m['sha256'], str) or len(m['sha256']) != 64
                or any(c not in '0123456789abcdef' for c in m['sha256'])):
            raise ValueError('Invalid native input member')
    return data


def destination(root, name):
    path = root / name
    if not path.resolve().is_relative_to(root):
        raise ValueError('Native input destination escapes checkout')
    for parent in [path, *path.parents]:
        if parent == root:
            break
        if parent.is_symlink():
            raise ValueError('Native input destination contains a symlink')
    return path


def prepare(root=ROOT):
    root = Path(root).resolve()
    manifest = load_manifest(root)
    members = {m['path']: m for m in manifest['members']}
    missing = set()
    for name, entry in members.items():
        path = destination(root, name)
        if path.exists():
            if not path.is_file() or digest(path) != entry['sha256']:
                raise ValueError(f'Native input differs; refusing to overwrite: {name}')
        else:
            missing.add(name)
    if not missing:
        return {'verified': len(members), 'restored': 0}
    archive = root / MANIFEST.parent / manifest['archive']
    if not archive.is_file() or digest(archive) != manifest['archiveSha256']:
        raise ValueError('Native input bundle missing or changed. Run git lfs pull --include="assets/ci/**"')
    # Validate every member before populating the checkout; no partial publication
    # from an invalid archive, and no tarfile.extract path/link handling.
    with tempfile.TemporaryDirectory(prefix='sidereal-native-inputs-') as temporary:
        stage = Path(temporary)
        seen = set()
        with tarfile.open(archive, 'r:xz') as bundle:
            for member in bundle:
                if (not member.isfile() or member.name not in members or member.name in seen
                        or member.size != members[member.name]['bytes']):
                    raise ValueError('Unexpected, duplicate or non-file native archive member')
                seen.add(member.name)
                staged = stage / member.name
                staged.parent.mkdir(parents=True, exist_ok=True)
                with bundle.extractfile(member) as source, staged.open('xb') as output:
                    shutil.copyfileobj(source, output)
                if digest(staged) != members[member.name]['sha256']:
                    raise ValueError(f'Native archive member hash mismatch: {member.name}')
        if seen != set(members):
            raise ValueError('Native archive member inventory is incomplete')
        for name in sorted(missing):
            path = destination(root, name)
            path.parent.mkdir(parents=True, exist_ok=True)
            # Same-directory temporary file + link publishes a complete file
            # atomically and cannot overwrite a concurrently created local edit.
            temporary_path = None
            try:
                with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as output:
                    temporary_path = Path(output.name)
                    with (stage / name).open('rb') as source:
                        shutil.copyfileobj(source, output)
                temporary_path.chmod(0o644)
                try:
                    os.link(temporary_path, destination(root, name))
                except FileExistsError:
                    if digest(path) != members[name]['sha256']:
                        raise ValueError(f'Native input changed during preparation: {name}')
            finally:
                if temporary_path is not None:
                    temporary_path.unlink()
    return {'verified': len(members), 'restored': len(missing)}


if __name__ == '__main__':
    print(json.dumps(prepare()))
