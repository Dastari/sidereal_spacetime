"""Guarded provider edits preserve authority settings and unrelated clients."""
import copy
import importlib.util
import hashlib
import io
import json
from pathlib import Path
import tempfile
import tarfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('configure_theme', Path(__file__).with_name('configure-theme.py'))
theme = importlib.util.module_from_spec(spec)
spec.loader.exec_module(theme)
REVISION = 'sidereal-' + 'a' * 16
OPERATION = 'b' * 32


class Provider:
    def __init__(self):
        self.clients = {
            'game': {'id': 'game', 'clientId': 'sidereal-game', 'publicClient': True, 'standardFlowEnabled': True,
                'implicitFlowEnabled': False, 'directAccessGrantsEnabled': False,
                'redirectUris': ['https://sidereal.dastari.net/auth/callback'],
                'attributes': {'pkce.code.challenge.method': 'S256', 'existing': 'preserve'}},
            'other': {'id': 'other', 'clientId': 'other-app', 'attributes': {'login_theme': 'another-theme'}},
        }
        self.realm = {'realm': 'dastari', 'loginTheme': 'keycloak.v2', 'registrationAllowed': True}
        self.writes = []
        self.corrupt = False

    def __call__(self, path, method='GET', value=None):
        if not path:
            return copy.deepcopy(self.realm)
        if path == 'clients':
            return copy.deepcopy(list(self.clients.values()))
        client = self.clients[path.split('/')[1]]
        if method == 'PUT':
            self.writes.append(copy.deepcopy(value))
            client.update(copy.deepcopy(value))
            if self.corrupt and len(self.writes) == 1:
                client['redirectUris'] = ['https://unexpected.example/auth/callback']
            return None
        return copy.deepcopy(client)


class ThemeChanges(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.private = Path(self.directory.name)
        self.provider = Provider()

    def tearDown(self):
        self.directory.cleanup()

    def activate(self, expected=theme.DEFAULT):
        return theme.change_theme(self.provider, REVISION, expected, OPERATION, private=self.private)

    def test_activation_only_sets_game_login_theme_and_has_private_rollback(self):
        before = copy.deepcopy(self.provider.clients)
        result = self.activate()
        self.assertEqual(self.provider.clients['other'], before['other'])
        self.assertEqual(theme.without_theme(self.provider.clients['game']), before['game'])
        self.assertEqual(self.provider.clients['game']['attributes']['login_theme'], REVISION)
        self.assertEqual(self.provider.writes, [{'attributes': {'pkce.code.challenge.method': 'S256', 'existing': 'preserve', 'login_theme': REVISION}}])
        receipt = Path(result['rollbackReceipt'])
        self.assertEqual(receipt.stat().st_mode & 0o777, 0o600)
        self.assertEqual(json.loads(receipt.read_text())['previousTheme'], theme.DEFAULT)

    def test_stale_expected_revision_does_not_write_or_prepare_a_receipt(self):
        self.provider.clients['game']['attributes']['login_theme'] = 'changed-by-another-operator'
        with self.assertRaisesRegex(RuntimeError, 'changed since review'):
            self.activate()
        self.assertEqual(self.provider.writes, [])
        self.assertEqual(list(self.private.iterdir()), [])

    def test_same_operation_retry_does_not_write_again(self):
        self.activate()
        result = self.activate()
        self.assertTrue(result['alreadyActivated'])
        self.assertEqual(len(self.provider.writes), 1)

    def test_rollback_removes_override_preserving_other_attributes(self):
        self.activate()
        result = theme.change_theme(self.provider, REVISION, REVISION, OPERATION, rollback=True, private=self.private)
        self.assertEqual(result['theme'], theme.DEFAULT)
        self.assertNotIn('login_theme', self.provider.clients['game']['attributes'])
        self.assertEqual(self.provider.clients['game']['attributes']['existing'], 'preserve')

    def test_rollback_does_not_overwrite_a_newer_operator_theme(self):
        self.activate()
        self.provider.clients['game']['attributes']['login_theme'] = 'newer-theme'
        with self.assertRaisesRegex(RuntimeError, 'changed since review'):
            theme.change_theme(self.provider, REVISION, REVISION, OPERATION, rollback=True, private=self.private)
        self.assertEqual(len(self.provider.writes), 1)

    def test_failed_verification_restores_previous_theme_attributes(self):
        self.provider.corrupt = True
        with self.assertRaisesRegex(RuntimeError, 'beyond the requested theme'):
            self.activate()
        self.assertEqual(len(self.provider.writes), 2)
        self.assertNotIn('login_theme', self.provider.clients['game']['attributes'])

    def test_insecure_client_refuses_theme_mutation(self):
        self.provider.clients['game']['directAccessGrantsEnabled'] = True
        with self.assertRaisesRegex(RuntimeError, 'security configuration'):
            self.activate()
        self.assertEqual(self.provider.writes, [])


class ThemeInstallation(unittest.TestCase):
    def test_archive_escape_is_rejected_before_extraction(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            version = root / 'version.txt'
            version.write_text('26.7.3')
            archive = root / 'bad.tar.gz'
            with tarfile.open(archive, 'w:gz') as package:
                entry = tarfile.TarInfo('../escaped')
                entry.size = 3
                package.addfile(entry, io.BytesIO(b'bad'))
            digest = hashlib.sha256(archive.read_bytes()).hexdigest()
            with patch.object(theme, 'THEMES', root), patch.object(theme, 'VERSION', version):
                with self.assertRaisesRegex(RuntimeError, 'Unsafe member'):
                    theme.install_theme(archive, digest, REVISION)
            self.assertFalse((root.parent / 'escaped').exists())
            self.assertFalse((root / (REVISION + '.installing')).exists())

    def test_installed_file_tampering_rejects_an_otherwise_valid_manifest(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'login').mkdir()
            css = root / 'login/theme.properties'
            css.write_text('parent=keycloak.v2')
            digest = hashlib.sha256(css.read_bytes()).hexdigest()
            (root / 'sidereal-manifest.json').write_text(json.dumps({'archiveSha256': 'reviewed', 'files': {'login/theme.properties': digest}}))
            theme.verify_installed(root, 'reviewed')
            css.write_text('parent=unreviewed')
            with self.assertRaisesRegex(RuntimeError, 'differs from the reviewed package'):
                theme.verify_installed(root, 'reviewed')


if __name__ == '__main__':
    unittest.main()
