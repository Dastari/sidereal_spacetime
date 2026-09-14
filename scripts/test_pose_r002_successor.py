"""The r002 successor resolves crew lineage without exempting other artifacts."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import validate_installed_poses_r002_successor as validator


class PoseR002SuccessorTests(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.root = Path(folder.name)
        self.previous_manifest_path = validator.PREVIOUS_MANIFEST['path']
        self.write(self.previous_manifest_path, b'original r008 manifest')
        self.write('historical/modular-crew.glb', b'original r008 crew')
        self.old_crew_sha = self.sha('historical/modular-crew.glb')
        self.write(validator.CREW, b'new r009 crew, separately validated')
        self.manifest = {'revision': 9, 'publication': 'new/publication.json'}
        self.write(validator.CREW_MANIFEST, json.dumps(self.manifest).encode())
        self.write('packages/content/src/character-components.json', b'{"revision":9}')
        self.write('new/publication.json', b'{"revision":9}')
        self.equipment = validator.EQUIPMENT + '/carbine.glb'
        self.write(self.equipment, b'unchanged canonical carbine')
        self.write(validator.NATIVE_EQUIPMENT, b'unchanged native equipment source')
        self.snapshot = {self.equipment: self.sha(self.equipment), validator.NATIVE_EQUIPMENT: self.sha(validator.NATIVE_EQUIPMENT),
                         validator.CREW: self.old_crew_sha, validator.CREW_MANIFEST: self.sha(self.previous_manifest_path)}
        self.previous = {'files': {'modular-crew.glb': self.old_crew_sha}}
        self.sources = {'modular-crew.glb': self.root / 'historical/modular-crew.glb'}
        lineage = patch.object(validator, 'validate_r009', return_value=(self.previous, self.sources))
        self.lineage = lineage.start()
        self.addCleanup(lineage.stop)
        previous = patch.object(validator, 'PREVIOUS_MANIFEST', {'path': self.previous_manifest_path,
                               'sha256': self.sha(self.previous_manifest_path)})
        previous.start()
        self.addCleanup(previous.stop)

    def write(self, name, value):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(value)

    def sha(self, name):
        return hashlib.sha256((self.root / name).read_bytes()).hexdigest()

    def validate(self):
        return validator.validate_successor_snapshot(self.root, self.snapshot)

    def test_character_pointer_uses_strict_shared_lineage(self):
        result = self.validate()
        self.assertEqual(result['preservationSnapshotEntries'], 4)
        self.assertEqual(result['validatedSuccessorCharacterFiles'], 21)
        self.lineage.assert_called_once_with(self.root, self.manifest, {'revision': 9}, {'revision': 9})

    def test_shared_lineage_failure_cannot_be_bypassed(self):
        self.lineage.side_effect = ValueError('unrelated character replacement')
        with self.assertRaisesRegex(ValueError, 'unrelated character replacement'):
            self.validate()

    def test_noncharacter_hash_change_fails(self):
        self.write(self.equipment, b'changed canonical carbine')
        with self.assertRaisesRegex(ValueError, 'Non-character canonical artifact changed'):
            self.validate()

    def test_added_or_removed_namespace_file_fails(self):
        extra = validator.EQUIPMENT + '/unlisted.glb'
        self.write(extra, b'unexpected file')
        with self.assertRaisesRegex(ValueError, 'snapshot membership changed'):
            self.validate()
        (self.root / extra).unlink()
        (self.root / self.equipment).unlink()
        with self.assertRaisesRegex(ValueError, 'snapshot membership changed'):
            self.validate()

    def test_historical_source_and_manifest_stay_exact(self):
        self.write('historical/modular-crew.glb', b'altered historical crew')
        with self.assertRaisesRegex(ValueError, 'Historical r008 crew source changed'):
            self.validate()
        self.write('historical/modular-crew.glb', b'original r008 crew')
        self.write(self.previous_manifest_path, b'altered historical manifest')
        with self.assertRaisesRegex(ValueError, 'Historical r008 manifest changed'):
            self.validate()

    def test_snapshot_cannot_be_rewritten_to_new_crew_hash(self):
        self.snapshot[validator.CREW] = self.sha(validator.CREW)
        with self.assertRaisesRegex(ValueError, 'Historical r008 crew source changed'):
            self.validate()


if __name__ == '__main__':
    unittest.main()
