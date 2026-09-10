from pathlib import Path
import json
import subprocess
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from public_client import command, validate_build
from public_delivery import launch_options


class DeliveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.home = self.root / '.runtime/public-client'
        self.live = self.home / 'releases/live'
        self.live.mkdir(parents=True)
        (self.live / 'index.html').write_text('unchanged application')
        self.record = {'release': str(self.live), 'sha256': validate_build(self.live)}
        (self.home / 'release.json').write_text(json.dumps(self.record))
        (self.home / 'current').symlink_to(self.live)
        (self.root / 'scripts').mkdir()
        for name in ('glb_delivery.mjs', 'public_client_preview.mjs'):
            (self.root / 'scripts' / name).write_text('exact delivery ' + name)
        self.calls = []
        self.cfg = {'public_client': {'host': '127.0.0.1', 'port': 9999},
            'auth': {'client_origin': 'https://example.test'},
            'client': {'allowed_hosts': ['example.test']}, 'server': {'host': '127.0.0.1', 'port': 3100}}
        self.lifecycle = SimpleNamespace(down=lambda name: self.calls.append(('stop', name)),
            load=lambda: {}, alive=lambda _: False, port_free=lambda *_: None,
            launch=lambda name, args, env: self.calls.append(('launch', name, args, env)), ready=lambda *_: None)

    def run_command(self, action):
        with patch('public_client.ROOT', self.root):
            command(action, self.cfg, self.lifecycle)

    def test_stage_activate_rollback_without_app_or_database_mutation(self):
        self.run_command('delivery-stage')
        self.assertEqual(self.calls, [])
        self.assertFalse((self.home / 'delivery.json').exists())
        self.run_command('delivery-activate')
        self.assertEqual(self.calls[0], ('stop', 'public-client'))
        launch = self.calls[1]
        self.assertIn('delivery-releases', launch[2][launch[2].index('--config') + 1])
        self.assertEqual(launch[3]['SIDEREAL_PUBLIC_ROOT'], str(self.live))
        self.assertEqual(launch[3]['SIDEREAL_PUBLIC_DATABASE_URL'], 'http://127.0.0.1:3100')
        self.run_command('delivery-rollback')
        self.assertFalse((self.home / 'delivery.json').exists())
        self.assertIn('apps/client/vite.config.ts', self.calls[-1][2])
        self.assertEqual(json.loads((self.home / 'release.json').read_text()), self.record)
        self.assertEqual(validate_build(self.live), self.record['sha256'])

    def test_changed_client_and_tampered_delivery_reject_before_stop(self):
        self.run_command('delivery-stage')
        staged = json.loads((self.home / 'delivery-staged.json').read_text())
        (Path(staged['release']) / 'glb_delivery.mjs').write_text('tampered')
        with self.assertRaisesRegex(RuntimeError, 'verification'):
            self.run_command('delivery-activate')
        self.assertEqual(self.calls, [])
        (self.live / 'index.html').write_text('concurrent release')
        with self.assertRaisesRegex(RuntimeError, 'verification'):
            self.run_command('delivery-activate')
        self.assertEqual(self.calls, [])

    def test_new_live_manifest_requires_restage_even_if_tree_valid(self):
        self.run_command('delivery-stage')
        (self.live / 'index.html').write_text('new app release')
        self.record['sha256'] = validate_build(self.live)
        (self.home / 'release.json').write_text(json.dumps(self.record))
        with self.assertRaisesRegex(RuntimeError, 'changed since staging'):
            self.run_command('delivery-activate')
        self.assertEqual(self.calls, [])

    def test_failed_launch_restores_previous_delivery_and_restarts_it(self):
        self.run_command('delivery-stage')
        original_launch = self.lifecycle.launch
        attempts = []
        def fail_once(*args):
            attempts.append(1)
            if len(attempts) == 1:
                raise RuntimeError('failed new service')
            original_launch(*args)
        self.lifecycle.launch = fail_once
        with self.assertRaisesRegex(RuntimeError, 'failed new service'):
            self.run_command('delivery-activate')
        self.assertFalse((self.home / 'delivery.json').exists())
        self.assertIn('apps/client/vite.config.ts', self.calls[-1][2])
        self.assertEqual(json.loads((self.home / 'release.json').read_text()), self.record)


class DeliveryHttpTests(unittest.TestCase):
    def test_native_http_protocol_and_managed_preview(self):
        subprocess.run(['node', '--test', 'scripts/glb_delivery.test.mjs'],
            cwd=Path(__file__).resolve().parents[1], check=True, capture_output=True, text=True)
