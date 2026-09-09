from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import gzip
import hashlib
import json
import tempfile
import unittest

from compress_recovery import compress_archive
import test_restore_review
from restore_review import prepare


class CompressionTests(unittest.TestCase):
    def test_verified_replacement_is_directly_restorable_and_private(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            helper = test_restore_review.RestoreReviewTests()
            source, digest = helper.archive(root)
            original = source.read_bytes()
            record = compress_archive(source, digest, replace=True, reserve_bytes=0)
            compressed = Path(record['archive'])
            self.assertFalse(source.exists())
            self.assertEqual(gzip.decompress(compressed.read_bytes()), original)
            self.assertEqual(record['decompressedSha256'], digest)
            self.assertEqual(compressed.stat().st_mode & 0o777, 0o600)
            self.assertEqual(compressed.with_suffix('.gz.json').stat().st_mode & 0o777, 0o600)
            lifecycle, calls = helper.lifecycle(root)
            prepare(lifecycle, compressed, record['sha256'])
            self.assertEqual(calls, [])
            self.assertEqual((root / 'recovery-review/database/control-db/db').read_bytes(), b'fixture')

    def test_wrong_hash_or_tiny_budget_preserves_raw_and_removes_partial(self):
        for failure in ('hash', 'budget'):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as folder:
                root = Path(folder)
                source, digest = test_restore_review.RestoreReviewTests().archive(root)
                with self.assertRaises(RuntimeError):
                    compress_archive(source, '0' * 64 if failure == 'hash' else digest,
                                     max_output_bytes=1 if failure == 'budget' else 1024**2,
                                     reserve_bytes=0, replace=True)
                self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), digest)
                self.assertFalse(source.with_suffix('.tar.gz').exists())

    def test_no_overwrite_or_low_space(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source, digest = test_restore_review.RestoreReviewTests().archive(root)
            with patch('compress_recovery.shutil.disk_usage', return_value=SimpleNamespace(free=0)):
                with self.assertRaisesRegex(RuntimeError, 'reserve'):
                    compress_archive(source, digest)
            destination = source.with_suffix('.tar.gz')
            destination.write_bytes(b'retained')
            with self.assertRaisesRegex(RuntimeError, 'overwrite'):
                compress_archive(source, digest)
            self.assertEqual(destination.read_bytes(), b'retained')
            self.assertTrue(source.exists())
