"""Read exact private native regression inputs without extracting the archive."""
from pathlib import Path
from functools import lru_cache
import hashlib
import json
import tarfile


ROOT = Path(__file__).resolve().parents[2]
DIRECTORY = ROOT / 'assets/ci/fixtures'
MANIFEST = DIRECTORY / 'gas-preservation-r003-r005.json'


def manifest():
    data = json.loads(MANIFEST.read_text())
    if (data['schema'] != 'sidereal.ci-gas-preservation-fixtures.v1'
            or data['archive'] != 'gas-preservation-r003-r005.tar.xz'):
        raise ValueError('Unsupported gas preservation fixture manifest')
    return data


@lru_cache(maxsize=1)
def _load_fixture():
    """Verify once, reading the 65 MB bounded fixture inventory sequentially."""
    data = manifest()
    archive = DIRECTORY / data['archive']
    with archive.open('rb') as stream:
        actual = hashlib.file_digest(stream, 'sha256').hexdigest()
    if archive.stat().st_size != data['archiveBytes'] or actual != data['archiveSha256']:
        raise ValueError('Gas native fixture archive differs; hydrate its pinned Git LFS file')
    members = {entry['path']: entry for entry in data['members']}
    if len(members) != len(data['members']):
        raise ValueError('Duplicate gas fixture manifest member')
    if set(data['aliases'].values()) != set(members):
        raise ValueError('Gas fixture aliases do not cover the exact member inventory')
    payloads = {}
    with tarfile.open(archive, 'r|xz') as bundle:
        for member in bundle:
            entry = members.get(member.name)
            if (entry is None or member.name in payloads or not member.isfile()
                    or member.size != entry['bytes']):
                raise ValueError('Gas fixture archive inventory differs')
            with bundle.extractfile(member) as source:
                raw = source.read()
            if len(raw) != entry['bytes'] or hashlib.sha256(raw).hexdigest() != entry['sha256']:
                raise ValueError('Gas fixture member bytes differ: ' + member.name)
            payloads[member.name] = raw
    if set(payloads) != set(members):
        raise ValueError('Gas fixture archive inventory is incomplete')
    return data, payloads


def verify_fixture():
    """Verify the whole archive, unique entries, aliases and original byte pins."""
    return _load_fixture()[0]


class PinnedGasFile:
    """Minimal read-only file interface accepted by the existing GLB parser."""
    def __init__(self, revision, name):
        self.alias = revision + '/' + name

    def read_bytes(self):
        data, payloads = _load_fixture()
        return payloads[data['aliases'][self.alias]]

    def read_text(self):
        return self.read_bytes().decode('utf-8')


class GasRevision:
    def __init__(self, revision):
        self.revision = revision

    def __truediv__(self, name):
        return PinnedGasFile(self.revision, name)
