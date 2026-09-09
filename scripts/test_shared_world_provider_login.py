"""Keep review credentials out of redirect targets and permissive files."""
import json
import os
from pathlib import Path
import tempfile
import unittest
from urllib.request import Request
from shared_world_provider_login import CALLBACK, CaptureCallback, LoginForm, private_json


class ProviderReviewBoundaries(unittest.TestCase):
    def test_only_exact_review_callback_is_captured(self):
        handler = CaptureCallback()
        callback = CALLBACK + '?state=test&code=opaque'
        self.assertIsNone(handler.redirect_request(Request('https://auth.dastari.net/'), None, 302, '', {}, callback))
        self.assertEqual(handler.callback_url, callback)
        for target in ['http://auth.dastari.net/login', 'https://auth.dastari.net.attacker.invalid/login', CALLBACK + '/unexpected']:
            with self.assertRaises(RuntimeError):
                CaptureCallback().redirect_request(Request('https://auth.dastari.net/'), None, 302, '', {}, target)

    def test_form_uses_only_hidden_fields_inside_login_form(self):
        form = LoginForm()
        form.feed('<input type="hidden" name="outside" value="bad"><form id="kc-form-login" action="https://auth.dastari.net/login?a=1&amp;b=2"><input type="hidden" name="csrf" value="proof"><input name="username" value="ignored"></form><input type="hidden" name="later" value="bad">')
        self.assertEqual(form.action, 'https://auth.dastari.net/login?a=1&b=2')
        self.assertEqual(form.fields, {'csrf': 'proof'})

    def test_existing_output_becomes_private_and_symlinks_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'tokens.json'
            path.write_text('old')
            path.chmod(0o644)
            private_json(path, {'id_token': 'synthetic-test-value'})
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(json.loads(path.read_text())['id_token'], 'synthetic-test-value')
            link = Path(directory) / 'link.json'
            link.symlink_to(path)
            with self.assertRaises(OSError):
                private_json(link, {})
            self.assertEqual(json.loads(path.read_text())['id_token'], 'synthetic-test-value')


if __name__ == '__main__':
    unittest.main()
