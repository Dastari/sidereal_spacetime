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

    def test_low_space_refuses_before_stopping_live_writer(self):
        with tempfile.TemporaryDirectory() as folder:
            lifecycle, calls = self.fixture(folder)
            with patch('release_backup.shutil.disk_usage', return_value=SimpleNamespace(free=1)):
                with self.assertRaisesRegex(RuntimeError, 'safety reserve'):
                    backup_database(lifecycle)
            self.assertEqual(calls, [])
            self.assertEqual(list(lifecycle.STATE.glob('recovery-*.tar')), [])

    def test_partial_archive_is_removed_before_failure_restart(self):
        with tempfile.TemporaryDirectory() as folder:
            lifecycle, calls = self.fixture(folder)
            def restart(**kwargs):
                self.assertEqual(list(lifecycle.STATE.glob('recovery-*.tar')), [])
                calls.append(('start', kwargs))
            lifecycle.database_up = restart
            with patch('release_backup.tarfile.open', side_effect=OSError('disk pressure')):
                with self.assertRaisesRegex(OSError, 'disk pressure'):
                    backup_database(lifecycle)
            self.assertEqual(calls[-1], ('start', {'publish_module': False}))

    def test_archive_stream_rechecks_actual_free_blocks(self):
        from release_backup import BoundedArchiveWriter
        import io
        stream = io.BytesIO()
        writer = BoundedArchiveWriter(stream, Path('.'))
        writer.write(b'x' * (4 * 1024 ** 2))
        with patch('release_backup.shutil.disk_usage', return_value=SimpleNamespace(free=1)):
            with self.assertRaisesRegex(RuntimeError, 'safety reserve'):
                writer.write(b'must-not-append')
        self.assertEqual(len(stream.getvalue()), 4 * 1024 ** 2)
