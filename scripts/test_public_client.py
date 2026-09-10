from pathlib import Path
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from public_client import command, validate_build


class PublicBuildTests(unittest.TestCase):
    def test_private_documents_reject_even_with_valid_index(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'index.html').write_text('game')
            (root / 'docs').mkdir()
            with self.assertRaisesRegex(RuntimeError, 'internal'):
                validate_build(root)

    def test_digest_detects_changed_runtime_bytes(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            page = root / 'index.html'
            page.write_text('first')
            first = validate_build(root)
            self.assertEqual(first, validate_build(root))
            page.write_text('second')
            self.assertNotEqual(first, validate_build(root))

    def test_links_cannot_escape_release(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'index.html').write_text('game')
            (root / 'outside').symlink_to('/etc')
            with self.assertRaisesRegex(RuntimeError, 'symlink'):
                validate_build(root)

    def test_stage_does_not_stop_or_replace_live_client(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'apps/client/dist').mkdir(parents=True)
            (root / 'apps/client/dist/index.html').write_text('candidate')
            calls = []
            lifecycle = SimpleNamespace(run=lambda _: calls.append('build'),
                down=lambda _: calls.append('stop'))
            cfg = {'public_client': {}, 'auth': {'client_origin': 'https://example.test'}}
            with patch('public_client.ROOT', root):
                command('stage', cfg, lifecycle)
            self.assertEqual(calls, ['build'])
            self.assertTrue((root / '.runtime/public-client/staged.json').is_file())
            self.assertFalse((root / '.runtime/public-client/current').exists())

    def test_tampered_stage_rejected_before_stopping_live_client(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'apps/client/dist').mkdir(parents=True)
            (root / 'apps/client/dist/index.html').write_text('candidate')
            calls = []
            lifecycle = SimpleNamespace(run=lambda _: None, down=lambda _: calls.append('stop'))
            cfg = {'public_client': {}, 'auth': {'client_origin': 'https://example.test'}}
            with patch('public_client.ROOT', root):
                command('stage', cfg, lifecycle)
                page = next((root / '.runtime/public-client/releases').glob('*/index.html'))
                page.write_text('tampered')
                with self.assertRaisesRegex(RuntimeError, 'verification'):
                    command('activate', cfg, lifecycle)
            self.assertEqual(calls, [])


class PrebuiltClientTests(unittest.TestCase):
    def test_exact_prebuilt_stage_never_builds_or_stops_and_rejects_tampering(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = root / 'isolated/dist'
            source.mkdir(parents=True)
            (source / 'index.html').write_text('pinned isolated client')
            digest = validate_build(source)
            calls = []
            lifecycle = SimpleNamespace(run=lambda _: calls.append('build'), down=lambda _: calls.append('stop'))
            cfg = {'public_client': {}, 'auth': {'client_origin': 'https://example.test'}}
            with patch('public_client.ROOT', root):
                command('stage', cfg, lifecycle, artifact=source, artifact_sha256=digest)
                self.assertEqual(calls, [])
                self.assertFalse((root / '.runtime/public-client/current').exists())
                staged = (root / '.runtime/public-client/staged.json').read_text()
                (source / 'index.html').write_text('later edit')
                with self.assertRaisesRegex(RuntimeError, 'digest mismatch'):
                    command('stage', cfg, lifecycle, artifact=source, artifact_sha256=digest)
                self.assertEqual((root / '.runtime/public-client/staged.json').read_text(), staged)
                with self.assertRaisesRegex(RuntimeError, 'stage only'):
                    command('activate', cfg, lifecycle, artifact=source, artifact_sha256=digest)
                self.assertEqual(calls, [])

    def test_prebuilt_symlink_directory_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = root / 'source'
            source.mkdir()
            (source / 'index.html').write_text('client')
            alias = root / 'alias'
            alias.symlink_to(source, target_is_directory=True)
            with patch('public_client.ROOT', root), self.assertRaisesRegex(RuntimeError, 'regular directory'):
                command('stage', {'public_client': {}}, SimpleNamespace(), artifact=alias, artifact_sha256=validate_build(source))
