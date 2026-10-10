"""Explicit crew revisions must pin every fit/state/LOD without altering prior intake."""
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

from import_crew_study import import_study


class CrewIntakeTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.source, self.repo = self.root / 'study', self.root / 'game'
        self.source.mkdir()
        (self.repo / 'packages/content/src').mkdir(parents=True)
        subprocess.run(['git', 'init', '-q', str(self.source)], check=True)
        subprocess.run(['git', '-C', str(self.source), '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-qm', 'fixture'], check=True)
        names = ['crew-body.glb', 'anim/crew-anims.glb', 'anim/clips.json', 'parts/groom/test@all#full.glb', 'face/test.json', 'face/test.png']
        for name in names:
            path = self.source / 'export' / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b'fixture')
        def record(name):
            return {'file': name, 'sha256': hashlib.sha256(b'fixture').hexdigest(), 'bytes': 7}
        self.manifest = {'crewScale': 1, 'runtimeCrewScale': .9,
                         'files': {n: record(n) for n in names[:2]},
                         'parts': {'groom.test': {'slot': 'hair', 'covers': [], 'files': {'all#full': record(names[3])}}},
                         'items': {}, 'face': {'test': {'json': names[4], 'png': names[5]}},
                         'animation': {'clips': [], 'holsters': {}}}
        self.write_manifest()

    def write_manifest(self):
        (self.source / 'export/crew-manifest.json').write_text(json.dumps(self.manifest))

    def test_revision_and_groom_are_exact_and_source_is_read_only(self):
        before = {str(p): p.read_bytes() for p in (self.source / 'export').rglob('*') if p.is_file()}
        receipt = import_study(self.source, self.repo, 'study-v2-r002')
        self.assertEqual(len(receipt['files']), 7)
        self.assertEqual(receipt['crewScale'], 1)
        self.assertEqual(receipt['runtimeCrewScale'], .9)
        self.assertEqual(import_study(self.source, self.repo, 'study-v2-r002'), receipt)
        self.assertEqual(before, {str(p): p.read_bytes() for p in (self.source / 'export').rglob('*') if p.is_file()})
        self.assertEqual(json.loads((self.repo / 'packages/content/src/crew-study.catalog.json').read_text())['revision'], 'study-v2-r002')

    def test_previous_revision_cannot_change(self):
        import_study(self.source, self.repo, 'study-v2-r001')
        self.manifest['runtimeCrewScale'] = .8
        self.write_manifest()
        with self.assertRaisesRegex(ValueError, 'Immutable revision already exists'):
            import_study(self.source, self.repo, 'study-v2-r001')
        import_study(self.source, self.repo, 'study-v2-r002')
        self.assertEqual(json.loads((self.repo / 'assets/runtime/crew/study-v2-r001/source-snapshot.json').read_text())['runtimeCrewScale'], .9)

    def test_corrupted_snapshot_is_not_silently_repaired(self):
        import_study(self.source, self.repo, 'study-v2-r002')
        path = self.repo / 'assets/runtime/crew/study-v2-r002/crew-body.glb'
        path.write_bytes(b'bad')
        with self.assertRaisesRegex(ValueError, 'Immutable revision file differs'):
            import_study(self.source, self.repo, 'study-v2-r002')
        self.assertEqual(path.read_bytes(), b'bad')

    def test_invalid_revision_and_bad_manifest_fail_before_write(self):
        with self.assertRaisesRegex(ValueError, 'explicit'):
            import_study(self.source, self.repo, '../r002')
        self.manifest['files']['crew-body.glb']['bytes'] = 999
        self.write_manifest()
        with self.assertRaisesRegex(ValueError, 'manifest mismatch'):
            import_study(self.source, self.repo, 'study-v2-r002')
        self.assertFalse((self.repo / 'assets/runtime').exists())


if __name__ == '__main__':
    unittest.main()
