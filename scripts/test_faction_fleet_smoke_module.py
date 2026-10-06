"""Isolation and dependency immutability gates for the real fleet SDK fixture."""
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest.mock import Mock, patch
import unittest

import faction_fleet_smoke_module as fleet


class FleetFixtureTests(unittest.TestCase):
    def test_rejects_live_remote_and_credential_targets_before_any_copy_or_publish(self):
        with TemporaryDirectory() as folder:
            root = Path(folder)
            for url in ['http://127.0.0.1:3100', 'http://example.test:3184',
                        'https://127.0.0.1:3184', 'http://secret@127.0.0.1:3184',
                        'http://127.0.0.1:3184/path', 'http://127.0.0.1:3184/?token=secret']:
                dev = SimpleNamespace(ROOT=root, DB_URL=url, cli=Mock(), run=Mock())
                with patch.object(fleet.prefab_smoke_module, 'publish') as publish:
                    with self.assertRaises(RuntimeError):
                        fleet.publish(dev, 'fleet-r0001-smoke', root / '.runtime/smoke-runs/run')
                    publish.assert_not_called()
                    dev.cli.assert_not_called()

    def test_rejects_non_smoke_and_outside_evidence_before_delegation(self):
        with TemporaryDirectory() as folder:
            root = Path(folder)
            dev = SimpleNamespace(ROOT=root, DB_URL='http://127.0.0.1:3184')
            for database, evidence in [('live', root / '.runtime/smoke-runs/run'),
                                       ('fleet-r0001-smoke', root / 'outside')]:
                with patch.object(fleet.prefab_smoke_module, 'publish') as publish:
                    with self.assertRaises(RuntimeError):
                        fleet.publish(dev, database, evidence)
                    publish.assert_not_called()

    def test_snapshots_content_and_sim_without_mutating_the_production_schema_or_admission(self):
        with TemporaryDirectory() as folder:
            root = Path(folder)
            evidence = root / '.runtime/smoke-runs/run'
            module = evidence / 'test-module/packages/world'
            (module / 'src').mkdir(parents=True)
            index = module / 'src/index.ts'
            index.write_text('const db = schema({});')
            production = root / 'packages/world/src/index.ts'
            production.parent.mkdir(parents=True)
            production.write_text('production schema')
            for name in ['content', 'sim']:
                source = root / 'packages' / name
                source.mkdir(parents=True)
                (source / 'pin.ts').write_text('exact original')
                (module.parent / name).symlink_to(source, target_is_directory=True)
            (root / 'assets').mkdir()
            (root / 'node_modules/third-party').mkdir(parents=True)
            (root / 'node_modules/@sidereal').mkdir()
            dev = SimpleNamespace(ROOT=root, CFG={}, DB_URL='http://127.0.0.1:3184',
                                  cli=Mock(), run=Mock())

            def copied_publish(wrapper, _database, _evidence):
                wrapper.cli('publish', 'fleet-r0001-smoke', '--module-path', str(module))
                return 'bindings'

            with patch.object(fleet.prefab_smoke_module, 'publish', side_effect=copied_publish):
                self.assertEqual(fleet.publish(dev, 'fleet-r0001-smoke', evidence), 'bindings')
            self.assertEqual(production.read_text(), 'production schema')
            self.assertIn(fleet.ADDON, index.read_text())
            for name in ['content', 'sim']:
                source = root / 'packages' / name / 'pin.ts'
                source.write_text('changed later')
                copied = module.parent / name
                self.assertFalse(copied.is_symlink())
                self.assertEqual((copied / 'pin.ts').read_text(), 'exact original')
                self.assertEqual((evidence / 'test-module/node_modules/@sidereal' / name).resolve(), copied)
            dev.cli.assert_called_once()


if __name__ == '__main__':
    unittest.main()
