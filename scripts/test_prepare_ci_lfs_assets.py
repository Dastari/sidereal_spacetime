"""Exercise the LFS-free cold bootstrap and its fail-before-write boundaries."""
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch

from build_ci_lfs_assets import build
from prepare_ci_lfs_assets import MANIFEST, SCHEMA, digest, inventory, prepare


class LfsAssetsTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.git('init', '-q')
        self.git('config', 'user.name', 'CI fixture')
        self.git('config', 'user.email', 'ci@example.invalid')
        self.files = {'assets/a.glb': b'public native a', 'assets/b.png': b'public native b',
                      'assets/alias.glb': b'public native a'}
        self.objects = {hashlib.sha256(data).hexdigest(): data for data in self.files.values()}
        for name, data in self.files.items():
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(self.pointer(data))
        self.git('add', 'assets')
        self.git('commit', '-qm', 'Public fixture')
        self.commit = self.git('rev-parse', 'HEAD').strip()
        self.git('update-ref', 'refs/remotes/origin/main', self.commit)
        self.manifest = {'schema': SCHEMA, 'sourceCommit': self.commit,
                         'archive': {'name': 'public-main-lfs-objects.tar.xz', 'bytes': 1,
                                     'sha256': '0'*64,
                                     'url': 'https://github.com/Dastari/sidereal_spacetime/releases/download/ci-lfs-'+self.commit[:9]+'-r001/public-main-lfs-objects.tar.xz'},
                         'objects': [{'sha256': oid, 'bytes': len(data)} for oid, data in sorted(self.objects.items())]}
        (self.root / MANIFEST).parent.mkdir(parents=True, exist_ok=True)

    def git(self, *args):
        return subprocess.check_output(['git', *args], cwd=self.root, text=True)

    @staticmethod
    def pointer(data):
        return ('version https://git-lfs.github.com/spec/v1\noid sha256:'+hashlib.sha256(data).hexdigest()+'\nsize '+str(len(data))+'\n').encode()

    def bundle(self, entries=None):
        self.archive = self.root / 'outside.tar.xz'
        if entries is None:
            entries = [('objects/'+oid, data, tarfile.REGTYPE) for oid, data in sorted(self.objects.items())]
        with tarfile.open(self.archive, 'w:xz') as bundle:
            for name, data, kind in entries:
                member = tarfile.TarInfo(name)
                member.type = kind
                member.size = len(data) if kind == tarfile.REGTYPE else 0
                member.linkname = '/tmp/forbidden' if kind == tarfile.SYMTYPE else ''
                bundle.addfile(member, io.BytesIO(data) if member.isfile() else None)
        self.manifest['archive'].update(bytes=self.archive.stat().st_size, sha256=digest(self.archive))
        self.save()
        return self.archive

    def save(self):
        (self.root / MANIFEST).write_text(json.dumps(self.manifest))

    def assert_pointers(self):
        for name, data in self.files.items():
            self.assertEqual((self.root / name).read_bytes(), self.pointer(data))

    def test_cold_hydration_deduplicates_and_validates_without_lfs_store(self):
        archive = self.bundle()
        self.assertFalse((self.root / '.git/lfs').exists())
        self.assertEqual(prepare(self.root, archive), {'verified': 3, 'restored': 3, 'gitLfsDownloads': 0})
        for name, data in self.files.items():
            self.assertEqual((self.root / name).read_bytes(), data)
        archive.unlink()
        self.assertEqual(prepare(self.root), {'verified': 3, 'restored': 0, 'gitLfsDownloads': 0})

    def test_cold_ordinary_release_download_is_hash_pinned(self):
        payload = self.bundle().read_bytes()
        response = io.BytesIO(payload)
        response.headers = {'Content-Length': str(len(payload))}
        with patch('prepare_ci_lfs_assets.urllib.request.urlopen', return_value=response) as opener:
            self.assertEqual(prepare(self.root)['restored'], 3)
            opener.assert_called_once_with(self.manifest['archive']['url'], timeout=90)
        self.assertFalse((self.root / '.git/lfs').exists())

    def test_corrupt_download_does_not_publish_cache_or_write_destinations(self):
        self.bundle()
        response = io.BytesIO(b'corrupt')
        response.headers = {}
        with patch('prepare_ci_lfs_assets.urllib.request.urlopen', return_value=response):
            with self.assertRaisesRegex(ValueError, 'size/hash'):
                prepare(self.root)
        self.assert_pointers()
        self.assertFalse((self.root / '.runtime/ci-lfs/public-main-lfs-objects.tar.xz').exists())

    def test_rejects_corrupt_cache_and_incomplete_extra_duplicate_links_or_hashes_before_write(self):
        valid = [('objects/'+oid, data, tarfile.REGTYPE) for oid, data in sorted(self.objects.items())]
        cases = [valid[:1], valid+[valid[0]], valid+[('objects/'+'f'*64, b'x', tarfile.REGTYPE)],
                 valid+[('../../escape', b'x', tarfile.REGTYPE)],
                 [(valid[0][0], b'', tarfile.SYMTYPE), valid[1]],
                 [(valid[0][0], b'!'*len(valid[0][1]), tarfile.REGTYPE), valid[1]]]
        for entries in cases:
            with self.subTest(entries=entries):
                with self.assertRaises(ValueError):
                    prepare(self.root, self.bundle(entries))
                self.assert_pointers()
        archive = self.bundle()
        archive.write_bytes(b'wrong archive')
        with self.assertRaisesRegex(ValueError, 'size/hash'):
            prepare(self.root, archive)
        self.assert_pointers()

    def test_unknown_pointer_fails_without_network_and_local_edits_are_preserved(self):
        archive = self.bundle()
        del self.manifest['objects'][0]
        self.save()
        with patch('prepare_ci_lfs_assets.download') as downloader:
            with self.assertRaisesRegex(ValueError, 'absent'):
                prepare(self.root)
            downloader.assert_not_called()
        self.assert_pointers()
        self.bundle()
        self.manifest['objects'] = [{'sha256': oid, 'bytes': len(data)} for oid, data in sorted(self.objects.items())]
        self.save()
        (self.root / 'assets/b.png').write_bytes(b'local edits')
        with self.assertRaisesRegex(ValueError, 'local edits'):
            prepare(self.root, archive)
        self.assertEqual((self.root / 'assets/b.png').read_bytes(), b'local edits')
        self.assertEqual((self.root / 'assets/a.glb').read_bytes(), self.pointer(self.files['assets/a.glb']))

    def test_symlink_destination_is_rejected(self):
        archive = self.bundle()
        path = self.root / 'assets/b.png'
        path.unlink()
        path.symlink_to(self.root / 'assets/a.glb')
        with self.assertRaisesRegex(ValueError, 'symlink'):
            prepare(self.root, archive)

    def test_builder_uses_only_local_public_main_objects_and_preserves_good_cache(self):
        for oid, data in self.objects.items():
            path = self.root / '.git/lfs/objects' / oid[:2] / oid[2:4] / oid
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        output = self.root / 'bundle'
        result = build(self.root, 'origin/main', output)
        self.assertEqual((result['paths'], result['objects']), (3, 2))
        archive = output / 'public-main-lfs-objects.tar.xz'
        original = archive.read_bytes()
        manifest = (output / MANIFEST.name).read_bytes()
        build(self.root, 'origin/main', output)
        self.assertEqual(archive.read_bytes(), original)
        oid = next(iter(self.objects))
        (self.root / '.git/lfs/objects' / oid[:2] / oid[2:4] / oid).write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError, 'locally'):
            build(self.root, 'origin/main', output)
        self.assertEqual(archive.read_bytes(), original)
        self.assertEqual((output / MANIFEST.name).read_bytes(), manifest)
        (self.root / 'new.txt').write_text('draft')
        self.git('add', 'new.txt')
        self.git('commit', '-qm', 'Unpublished draft')
        with self.assertRaises(subprocess.CalledProcessError):
            build(self.root, 'HEAD', output)


if __name__ == '__main__':
    unittest.main()
