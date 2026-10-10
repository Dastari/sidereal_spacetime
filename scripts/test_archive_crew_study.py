"""Archival must reject bad source data and preserve immutable snapshots."""
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

from archive_crew_study import archive, verify_export


class CrewArchiveTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.source = self.root / 'study'
        self.source.mkdir()
        subprocess.run(['git', 'init', '-q', str(self.source)], check=True)
        subprocess.run(['git', '-C', str(self.source), '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-qm', 'fixture'], check=True)
        for name in ['export/parts/groom/hair.glb', 'tmp/anim/crew-anims.blend', 'MIGRATION.md', 'CREW_SPEC.md']:
            path = self.source / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b'source')
        record = {'file': 'parts/groom/hair.glb', 'sha256': hashlib.sha256(b'source').hexdigest(), 'bytes': 6}
        (self.source / 'export/crew-manifest.json').write_text(json.dumps({'parts': {'groom.test': {'files': {'all#full': record}}}}))

    def test_complete_read_only_copy_and_replay(self):
        before = {str(p.relative_to(self.source)): p.read_bytes() for p in self.source.rglob('*') if p.is_file()}
        receipt = archive(self.source, self.root / 'archive')
        self.assertEqual(receipt['manifestRecordsVerified'], 1)
        self.assertEqual(len(receipt['files']), 5)
        self.assertEqual(archive(self.source, self.root / 'archive'), receipt)
        self.assertEqual(before, {str(p.relative_to(self.source)): p.read_bytes() for p in self.source.rglob('*') if p.is_file()})

    def test_bad_manifest_fails_before_archive(self):
        (self.source / 'export/parts/groom/hair.glb').write_bytes(b'bad')
        with self.assertRaisesRegex(ValueError, 'manifest mismatch'):
            archive(self.source, self.root / 'archive')
        self.assertFalse((self.root / 'archive').exists())

    def test_archive_is_immutable(self):
        receipt = archive(self.source, self.root / 'archive')
        (self.root / 'archive' / receipt['path'] / 'MIGRATION.md').write_bytes(b'bad')
        with self.assertRaisesRegex(ValueError, 'Immutable archive differs'):
            archive(self.source, self.root / 'archive')

    def test_traversal_record_is_rejected(self):
        path = self.source / 'export/crew-manifest.json'
        path.write_text(json.dumps({'file': '../MIGRATION.md', 'bytes': 6, 'sha256': hashlib.sha256(b'source').hexdigest()}))
        with self.assertRaisesRegex(ValueError, 'Unsafe source'):
            verify_export(path.parent)


if __name__ == '__main__':
    unittest.main()
