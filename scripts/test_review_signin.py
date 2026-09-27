import contextlib
import importlib.util
import io
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import json

spec = importlib.util.spec_from_file_location('review_signin', Path(__file__).with_name('review_signin.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class SignInTests(unittest.TestCase):
    def test_secret_uses_private_file_not_argv_or_output(self):
        password = 'sentinel-never-in-argv'
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            credential = home / '.local/share/sidereal-review/account.json'
            credential.parent.mkdir(parents=True)
            credential.write_text(json.dumps({'username': 'sidereal-development-review', 'managedBy': 'sidereal-development-review-v1', 'password': password}))
            credential.chmod(0o600)
            submitted = []
            def run(argv, **kwargs):
                self.assertNotIn(password, ' '.join(argv))
                filename = Path(argv[-1]); submitted.append(filename)
                self.assertEqual(filename.stat().st_mode & 0o777, 0o600)
                self.assertIn(password, filename.read_text())
                return SimpleNamespace(returncode=0, stdout='{"reviewSignInReturned":true}\n' + password, stderr=password)
            output = io.StringIO()
            with patch.object(m.Path, 'home', return_value=home), patch.object(m.subprocess, 'run', run), patch('sys.argv', ['review_signin.py', '--session', 'test', '--return-url', 'https://example.invalid/map']), contextlib.redirect_stdout(output):
                self.assertEqual(m.main(), 0)
            self.assertNotIn(password, output.getvalue())
            self.assertFalse(submitted[0].exists())


if __name__ == '__main__':
    unittest.main()
