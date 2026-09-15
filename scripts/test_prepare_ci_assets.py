"""Exercise the native bundle boundary without relying on the large real inputs."""
import hashlib
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest

from build_ci_assets import build
from prepare_ci_assets import MANIFEST, SCHEMA, digest, prepare


class NativeInputsTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.files = {'assets/runtime/a.glb': b'native a', 'assets/runtime/b.glb': b'native b'}
        self.manifest = {
            'schema': SCHEMA, 'archive': 'native-inputs-r001.tar.xz',
            'archiveSha256': '0' * 64,
            'members': [{'path': p, 'bytes': len(b), 'sha256': hashlib.sha256(b).hexdigest()}
                        for p, b in self.files.items()],
        }
        (self.root / MANIFEST).parent.mkdir(parents=True)

    def bundle(self, entries=None):
        archive = self.root / MANIFEST.parent / self.manifest['archive']
        with tarfile.open(archive, 'w:xz') as output:
            for name, data, kind in entries or [(p, b, tarfile.REGTYPE) for p, b in self.files.items()]:
                info = tarfile.TarInfo(name)
                info.type = kind
                info.size = len(data) if kind == tarfile.REGTYPE else 0
                if kind == tarfile.SYMTYPE:
                    info.linkname = '/tmp/forbidden'
                output.addfile(info, io.BytesIO(data) if info.isfile() else None)
        self.manifest['archiveSha256'] = digest(archive)
        self.save_manifest()
        return archive

    def save_manifest(self):
        (self.root / MANIFEST).write_text(json.dumps(self.manifest))

    def assert_nothing_restored(self):
        self.assertFalse((self.root / 'assets/runtime').exists())

    def test_restores_exact_bytes_and_is_idempotent(self):
        self.bundle()
        self.assertEqual(prepare(self.root), {'verified': 2, 'restored': 2})
        for name, data in self.files.items():
            self.assertEqual((self.root / name).read_bytes(), data)
        self.assertEqual(prepare(self.root), {'verified': 2, 'restored': 0})

    def test_rejects_archive_hash_mismatch(self):
        self.bundle().write_bytes(b'wrong bundle')
        with self.assertRaisesRegex(ValueError, 'git lfs pull'):
            prepare(self.root)
        self.assert_nothing_restored()

    def test_rejects_missing_extra_duplicate_link_and_corrupt_members_before_writing(self):
        valid = [(p, b, tarfile.REGTYPE) for p, b in self.files.items()]
        cases = [valid[:1], valid + [valid[0]],
                 valid + [('assets/runtime/extra.glb', b'x', tarfile.REGTYPE)],
                 valid + [('../../escape', b'x', tarfile.REGTYPE)],
                 [(valid[0][0], b'', tarfile.SYMTYPE), valid[1]],
                 [valid[0], (valid[1][0], b'corrupt!', tarfile.REGTYPE)]]
        for entries in cases:
            with self.subTest(entries=entries):
                self.bundle(entries)
                with self.assertRaises(ValueError):
                    prepare(self.root)
                self.assert_nothing_restored()

    def test_rejects_manifest_traversal(self):
        self.bundle()
        self.manifest['members'][0]['path'] = 'assets/runtime/../../escape'
        self.save_manifest()
        with self.assertRaises(ValueError):
            prepare(self.root)
        self.assert_nothing_restored()

    def test_preserves_local_edits_and_does_not_restore_other_missing_files(self):
        self.bundle()
        path = self.root / 'assets/runtime/b.glb'
        path.parent.mkdir(parents=True)
        path.write_bytes(b'local edit')
        with self.assertRaisesRegex(ValueError, 'refusing to overwrite'):
            prepare(self.root)
        self.assertEqual(path.read_bytes(), b'local edit')
        self.assertFalse((path.parent / 'a.glb').exists())

    def test_rejects_symlink_destination_inside_or_outside_checkout(self):
        self.bundle()
        for target in [self.root / 'redirected', self.root.parent]:
            with self.subTest(target=target):
                path = self.root / 'assets/runtime'
                path.symlink_to(target, target_is_directory=True)
                with self.assertRaises(ValueError):
                    prepare(self.root)
                path.unlink()

    def test_repacking_is_deterministic_and_bad_input_preserves_bundle(self):
        self.bundle()
        prepare(self.root)
        build(self.root, self.root)
        archive = self.root / MANIFEST.parent / self.manifest['archive']
        before = archive.read_bytes()
        before_manifest = (self.root / MANIFEST).read_bytes()
        build(self.root, self.root)
        self.assertEqual(archive.read_bytes(), before)
        (self.root / 'assets/runtime/b.glb').write_bytes(b'local edit')
        with self.assertRaises(ValueError):
            build(self.root, self.root)
        self.assertEqual(archive.read_bytes(), before)
        self.assertEqual((self.root / MANIFEST).read_bytes(), before_manifest)


if __name__ == '__main__':
    unittest.main()
