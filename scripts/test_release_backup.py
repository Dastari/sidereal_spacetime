from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import json
import tempfile
import unittest

from release_backup import backup_database


class ReleaseBackupTests(unittest.TestCase):
    def fixture(self, folder):
        root = Path(folder)
        for name in ('.spacetime-data', '.tools/spacetime/config', '.runtime/public-client'):
            (root / name).mkdir(parents=True)
        (root / '.spacetime-data/state').write_text('retained state')
        (root / '.tools/spacetime/config/key').write_text('private fixture')
        (root / 'dev.toml').write_text('fixture')
        (root / '.runtime/public-client/release.json').write_text('{}')
        calls = []
        lifecycle = SimpleNamespace(ROOT=root, STATE=root / '.runtime',
            load=lambda: {'database': {'pid': 1}}, alive=lambda _: True,
            down=lambda name: calls.append(('stop', name)),
            database_up=lambda **kw: calls.append(('start', kw)))
        return lifecycle, calls

    def test_private_complete_archive_and_no_publish(self):
        with tempfile.TemporaryDirectory() as folder:
            lifecycle, calls = self.fixture(folder)
            backup_database(lifecycle)
            archive = next(lifecycle.STATE.glob('recovery-*.tar'))
            record = json.loads(archive.with_suffix('.json').read_text())
            self.assertEqual(archive.stat().st_mode & 0o777, 0o600)
            self.assertFalse(record['restoreTested'])
            self.assertEqual(calls, [('stop', 'database'), ('start', {'publish_module': False})])

    def test_failure_restarts_same_database_and_removes_partial(self):
        with tempfile.TemporaryDirectory() as folder:
            lifecycle, calls = self.fixture(folder)
            with patch('release_backup.tarfile.open', side_effect=OSError('archive failed')):
                with self.assertRaisesRegex(OSError, 'archive failed'):
                    backup_database(lifecycle)
            self.assertEqual(calls[-1], ('start', {'publish_module': False}))
            self.assertEqual(list(lifecycle.STATE.glob('recovery-*.tar')), [])
