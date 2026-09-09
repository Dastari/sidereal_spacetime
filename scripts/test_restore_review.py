from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import hashlib
import io
import os
import socket
import tarfile
import tempfile
import unittest

from restore_review import REQUIRED, command, prepare, validate_members, require_review_port


class RestoreReviewTests(unittest.TestCase):
    def archive(self, root, extra=()):
        path = root / 'backup.tar'
        with tarfile.open(path, 'w') as archive:
            for name in sorted(REQUIRED):
                member = tarfile.TarInfo(name)
                data = b'fixture'
                member.size = len(data)
                archive.addfile(member, io.BytesIO(data))
            for member in extra:
                archive.addfile(member)
        return path, hashlib.sha256(path.read_bytes()).hexdigest()

    def lifecycle(self, root):
        calls = []
        lifecycle = SimpleNamespace(STATE=root, TOOLS=root / 'tools',
            CFG={'restore_review': {'host': '127.0.0.1', 'port': 3190},
                 'server': {'port': 3100}, 'project': {'spacetime_version': '2.10.0'}},
            load=lambda: {}, alive=lambda _: False,
            down=lambda name: calls.append(('stop', name)),
            port_free=lambda host, port: calls.append(('port', host, port)),
            launch=lambda name, argv: calls.append(('launch', name, argv)),
            ready=lambda url, name: calls.append(('ready', name, url)))
        return lifecycle, calls

    def test_private_restore_preserves_internal_hardlinks_and_refuses_overwrite(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            link = tarfile.TarInfo('database/copy')
            link.type = tarfile.LNKTYPE
            link.linkname = 'database/control-db/db'
            path, digest = self.archive(root, [link])
            lifecycle, calls = self.lifecycle(root)
            prepare(lifecycle, path, digest)
            home = root / 'recovery-review'
            self.assertEqual((home / 'cli-config/id_ecdsa').stat().st_mode & 0o777, 0o600)
            self.assertEqual((home / 'database/copy').stat().st_ino,
                             (home / 'database/control-db/db').stat().st_ino)
            self.assertEqual(calls, [])
            with self.assertRaisesRegex(RuntimeError, 'never overwrite'):
                prepare(lifecycle, path, digest)

    def test_invalid_hash_and_low_disk_never_create_restore_directory(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            path, digest = self.archive(root)
            lifecycle, _ = self.lifecycle(root)
            with self.assertRaisesRegex(RuntimeError, 'mismatch'):
                prepare(lifecycle, path, '0' * 64)
            with patch('restore_review.shutil.disk_usage', return_value=SimpleNamespace(free=1)):
                with self.assertRaisesRegex(RuntimeError, 'disk space'):
                    prepare(lifecycle, path, digest)
            self.assertFalse((root / 'recovery-review').exists())

    def test_paths_symlinks_and_external_hardlinks_are_rejected_before_extraction(self):
        for kind in ('traversal', 'symlink', 'external-link'):
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as folder:
                root = Path(folder)
                member = tarfile.TarInfo('database/../../escape' if kind == 'traversal' else 'database/bad')
                if kind == 'symlink':
                    member.type = tarfile.SYMTYPE
                    member.linkname = '/tmp'
                elif kind == 'external-link':
                    member.type = tarfile.LNKTYPE
                    member.linkname = '/etc/passwd'
                path, digest = self.archive(root, [member])
                lifecycle, _ = self.lifecycle(root)
                with self.assertRaises(RuntimeError):
                    prepare(lifecycle, path, digest)
                self.assertFalse((root / 'recovery-review').exists())

    def test_missing_signing_keys_are_rejected(self):
        with self.assertRaisesRegex(RuntimeError, 'signing keys'):
            validate_members([])

    def test_managed_restart_only_targets_restore_server_and_restored_keys(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            lifecycle, calls = self.lifecycle(root)
            (root / 'recovery-review').mkdir()
            (root / 'recovery-review/recovery.json').write_text('{}')
            with patch('restore_review.require_review_port'):
                command('restart', lifecycle)
            self.assertEqual(calls[0], ('stop', 'restore-review'))
            launch = next(row for row in calls if row[0] == 'launch')
            self.assertIn('127.0.0.1:3190', launch[2])
            self.assertIn(str(root / 'recovery-review/cli-config/id_ecdsa'), launch[2])
            self.assertNotIn(str(root / '.spacetime-data'), launch[2])

    def test_live_port_or_nonloopback_configuration_is_rejected(self):
        for host, port in [('0.0.0.0', 3190), ('127.0.0.1', 3100)]:
            with tempfile.TemporaryDirectory() as folder:
                root = Path(folder)
                lifecycle, calls = self.lifecycle(root)
                (root / 'recovery-review').mkdir()
                (root / 'recovery-review/recovery.json').write_text('{}')
                lifecycle.CFG['restore_review'] = {'host': host, 'port': port}
                with self.assertRaisesRegex(RuntimeError, 'loopback-only'):
                    command('up', lifecycle)
                self.assertEqual(calls, [])

    def test_port_probe_rejects_an_existing_listener_even_with_address_reuse(self):
        with socket.socket() as listener:
            listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            listener.bind(('127.0.0.1', 0))
            listener.listen()
            with self.assertRaises(OSError):
                require_review_port('127.0.0.1', listener.getsockname()[1])
