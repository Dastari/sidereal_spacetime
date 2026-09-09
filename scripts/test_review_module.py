import hashlib
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import Mock
import review_module

class ReviewArtifactTests(unittest.TestCase):
    def test_exact_js_staged_and_never_reset_or_published_to_main(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'source'; source.write_bytes(b'export const value = 1;')
            digest = hashlib.sha256(source.read_bytes()).hexdigest()
            lifecycle = SimpleNamespace(ROOT=root, CFG={'project': {'database': 'live'}}, DB_URL='http://127.0.0.1:3100', require_development=Mock(), cli=Mock())
            result = review_module.publish(lifecycle, 'old-private', source, digest)
            self.assertEqual(result['database'], 'live-review-old-private')
            args = lifecycle.cli.call_args.args
            self.assertIn('--delete-data=never', args)
            self.assertIn('--js-path', args)
            self.assertNotIn('--module-path', args)
            self.assertEqual(Path(args[args.index('--js-path') + 1]).read_bytes(), source.read_bytes())
            for suffix, hash_value in [('../live', digest), ('valid', '0' * 64), ('valid', None)]:
                lifecycle.cli.reset_mock()
                with self.assertRaises(ValueError): review_module.publish(lifecycle, suffix, source, hash_value)
                lifecycle.cli.assert_not_called()

    def test_wasm_uses_binary_path(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'source'; source.write_bytes(b'\x00asm\x01\x00\x00\x00')
            lifecycle = SimpleNamespace(ROOT=root, CFG={'project': {'database': 'live'}}, DB_URL='http://localhost', require_development=Mock(), cli=Mock())
            review_module.publish(lifecycle, 'old', source, hashlib.sha256(source.read_bytes()).hexdigest())
            self.assertIn('--bin-path', lifecycle.cli.call_args.args)

if __name__ == '__main__': unittest.main()
