"""Safety gates for the copied capacity module, independent of database services."""
import hashlib
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import Mock

import capacity_smoke_module as capacity
import fresh_smoke


class CapacityModuleTests(unittest.TestCase):
    def lifecycle(self, root, port=3151):
        root = Path(root)
        return SimpleNamespace(ROOT=root, STATE=root / '.runtime', DB_URL=f'http://127.0.0.1:{port}',
                               CFG={'project': {'database': 'live'}, 'server': {'host': '127.0.0.1', 'port': port}},
                               load=Mock(return_value={}), alive=Mock(return_value=True), run=Mock(), cli=Mock())

    def source(self, root):
        root = Path(root)
        (root / 'tsconfig.json').write_text('{}')
        (root / 'package-lock.json').write_text('{}')
        (root / 'node_modules' / 'third-party').mkdir(parents=True)
        (root / 'node_modules' / 'third-party' / 'package.json').write_text('{"version":"1"}')
        sdk = root / 'node_modules/spacetimedb'
        sdk.mkdir()
        (sdk / 'package.json').write_text('{"name":"spacetimedb","version":"2.10.2"}')
        (sdk / 'adapter.ts').write_text('export const ordered = true;')
        for name in capacity.PACKAGES:
            package = root / 'packages' / name
            (package / 'src').mkdir(parents=True)
            (package / 'package.json').write_text('{"name":"@sidereal/' + name + '"}')
            (package / 'tsconfig.json').write_text('{}')
            (package / 'src' / 'pin.ts').write_text('export const pin = 1;')
        (root / 'packages/world/src/index.ts').write_text('const db = schema({\n});')
        (root / 'packages/world/src/ship-feature-qualification.ts').write_text(
            'export function shipFeatureQualified(_feature:string,_blueprintSha256:string) {\n  return false;\n}')

    def reservation(self, dev):
        return fresh_smoke.reserve(dev, 'capacity', lambda *_: False)

    def test_failed_driver_runs_still_verify_sources_and_preserve_measurements(self):
        with TemporaryDirectory() as root:
            root = Path(root)
            source = root / 'driver.ts'
            source.write_text('exact candidate')
            hashes = {'driver.ts': hashlib.sha256(source.read_bytes()).hexdigest()}
            result = root / 'capacity-result.json'
            result.write_text(json.dumps({'status': 'failed', 'failure': 'CAPACITY_OFFERED_LOAD_NOT_SUSTAINED', 'confirmed': 700}))
            self.assertEqual(capacity.finalize_driver_run(root, root, hashes, driver_failed=True), (True, 'failed'))
            self.assertEqual(json.loads(result.read_text()), {'status': 'failed', 'failure': 'CAPACITY_OFFERED_LOAD_NOT_SUSTAINED', 'confirmed': 700, 'driverSourcesUnchanged': True})
            source.write_text('mutated candidate')
            self.assertEqual(capacity.finalize_driver_run(root, root, hashes, driver_failed=True), (False, 'failed'))
            self.assertEqual(json.loads(result.read_text())['failure'], 'CAPACITY_DRIVER_CHANGED_DURING_RUN')
            self.assertEqual(result.stat().st_mode & 0o777, 0o600)
            source.unlink()
            self.assertEqual(capacity.finalize_driver_run(root, root, hashes, driver_failed=False), (False, 'failed'))
            self.assertEqual(json.loads(result.read_text())['status'], 'failed')

    def test_zero_exit_without_valid_receipt_fails_closed(self):
        with TemporaryDirectory() as root:
            root = Path(root)
            self.assertEqual(capacity.finalize_driver_run(root, root, {}, driver_failed=False), (True, 'failed'))
            path = root / 'capacity-result.json'
            self.assertEqual(json.loads(path.read_text())['failure'], 'CAPACITY_DRIVER_EXIT')
            path.write_text(json.dumps({'status': 'running'}))
            self.assertEqual(capacity.finalize_driver_run(root, root, {}, driver_failed=False), (True, 'failed'))
            self.assertEqual(json.loads(path.read_text())['failure'], 'CAPACITY_DRIVER_INVALID_RESULT')
            path.write_text(json.dumps({'status': 'passed'}))
            self.assertEqual(capacity.finalize_driver_run(root, root, {}, driver_failed=False), (True, 'passed'))

    def test_server_gate_rejects_main_remote_credentials_and_live_reuse_before_start(self):
        with TemporaryDirectory() as root:
            dev = self.lifecycle(root)
            capacity.validate_target(dev)
            for url in ['http://127.0.0.1:3100', 'http://example.test:3151',
                        'http://secret@127.0.0.1:3151', 'https://127.0.0.1:3151',
                        'http://127.0.0.1:3151/?token=secret', 'http://127.0.0.1:3151/path',
                        'http://127.0.0.1:secret']:
                dev.DB_URL = url
                with self.assertRaises(ValueError):
                    capacity.validate_target(dev)
            dev.DB_URL = 'http://127.0.0.1:3151'
            dev.load.return_value = {'database': {'private': 'never printed'}}
            with self.assertRaises(ValueError):
                capacity.validate_target(dev)
            dev.run.assert_not_called()
            dev.cli.assert_not_called()

    def test_publish_gate_requires_exact_unused_reservation_but_accepts_just_started_server(self):
        with TemporaryDirectory() as root:
            dev = self.lifecycle(root)
            receipt = self.reservation(dev)
            dev.load.return_value = {'database': {'private': 'never printed'}}
            capacity.validate_target(dev, receipt['database'], receipt['evidenceDirectory'])
            for database, folder in [('live', receipt['evidenceDirectory']),
                                     (receipt['database'], root), ('other-r0001-smoke', root)]:
                with self.assertRaises(ValueError):
                    capacity.validate_target(dev, database, folder)
            path = Path(receipt['evidenceDirectory']) / 'reservation.json'
            path.write_text(json.dumps({'database': receipt['database'], 'state': 'already-exists'}))
            with self.assertRaises(ValueError):
                capacity.validate_target(dev, receipt['database'], receipt['evidenceDirectory'])

    def test_stage_snapshots_workspace_resolution_and_keeps_production_schema_unchanged(self):
        with TemporaryDirectory() as root:
            self.source(root)
            dev = self.lifecycle(root)
            receipt = self.reservation(dev)
            original = capacity.source_hashes(dev.ROOT)
            stage = capacity.stage_module(dev, receipt['database'], receipt['evidenceDirectory'])
            self.assertEqual(capacity.source_hashes(dev.ROOT), original)
            copied = stage / 'packages/content/src/pin.ts'
            (dev.ROOT / 'packages/content/src/pin.ts').write_text('export const pin = 2;')
            self.assertEqual(copied.read_text(), 'export const pin = 1;')
            self.assertEqual((stage / 'node_modules/@sidereal/content').resolve(), stage / 'packages/content')
            self.assertFalse((stage / 'packages/content/src').is_symlink())
            manifest = json.loads((Path(receipt['evidenceDirectory']) / 'capacity-module-manifest.json').read_text())
            self.assertEqual(manifest['sourceFiles'], original)
            self.assertEqual(manifest['stagedFiles'], capacity.source_hashes(stage))
            self.assertEqual(manifest['fixturePassengerQualification'], 'exact-wren-only')
            self.assertEqual(manifest['sdkVersion'], '2.10.2')
            self.assertEqual(manifest['sdkFiles'], capacity.sdk_hashes(stage / 'node_modules/spacetimedb'))
            self.assertFalse((stage / 'node_modules/spacetimedb').is_symlink())
            (dev.ROOT / 'node_modules/spacetimedb/adapter.ts').write_text('export const ordered = false;')
            self.assertEqual((stage / 'node_modules/spacetimedb/adapter.ts').read_text(), 'export const ordered = true;')
            self.assertIn('public:false', (stage / 'packages/world/src/index.ts').read_text())
            dev.cli.assert_not_called()

    def test_existing_stage_never_republishes_or_overwrites(self):
        with TemporaryDirectory() as root:
            self.source(root)
            dev = self.lifecycle(root)
            receipt = self.reservation(dev)
            stage = capacity.stage_module(dev, receipt['database'], receipt['evidenceDirectory'])
            before = capacity.source_hashes(stage)
            with self.assertRaises(ValueError):
                capacity.publish(dev, receipt['database'], receipt['evidenceDirectory'])
            self.assertEqual(capacity.source_hashes(stage), before)
            dev.run.assert_not_called()
            dev.cli.assert_not_called()

    def test_schema_and_qualification_markers_fail_closed(self):
        for source in ['', 'const db = schema({ const db = schema({', 'capacityHost;const db = schema({']:
            with self.assertRaises(ValueError):
                capacity.integrate_index(source)
        for source in ['', 'function shipFeatureQualified(){return true;}',
                       'function shipFeatureQualified(){\n  return false;\n  return false;}']:
            with self.assertRaises(ValueError):
                capacity.qualify_passengers(source)
        qualified = capacity.qualify_passengers(
            'function shipFeatureQualified(){\n  return false;\n}')
        self.assertIn('_feature === "passengers" && _blueprintSha256 === "' + capacity.WREN_SHA256 + '"', qualified)

    def test_publish_typechecks_snapshot_then_publishes_non_destructively_and_generates(self):
        with TemporaryDirectory() as root:
            self.source(root)
            dev = self.lifecycle(root)
            receipt = self.reservation(dev)
            binding = capacity.publish(dev, receipt['database'], receipt['evidenceDirectory'])
            self.assertTrue(binding.endswith('/capacity-module/generated/index.ts'))
            self.assertIn('capacity-module/packages/world/tsconfig.json', dev.run.call_args.args[0][-1])
            self.assertEqual(dev.cli.call_count, 2)
            publish = dev.cli.call_args_list[0].args
            self.assertEqual(publish[:2], ('publish', receipt['database']))
            self.assertIn('--delete-data=never', publish)
            self.assertNotIn('--delete-data=always', publish)
            self.assertEqual(dev.cli.call_args_list[1].args[0], 'generate')


if __name__ == '__main__':
    unittest.main()
