"""Operator invariants; no services or real database calls."""
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import faction_fleet as tool


class FleetToolTests(unittest.TestCase):
    def request(self):
        return {'operationId': 'fleet-test-0001', 'characterId': 'actor',
                'expectedShipId': 'original', 'expectedInstanceRevision': 7,
                'expectedFleetPinSet': 'a' * 64}

    def fixture(self, folder):
        args = SimpleNamespace(server='http://127.0.0.1:3391', database='isolated-review',
                               character_name='Captain', operation_id='fleet-test-0001',
                               plan=str(Path(folder) / 'plan.json'), backup='/private/backup.json')
        record = {'format': 'sidereal-additive-fleet-plan-v1', 'server': args.server,
                  'database': args.database, 'request': self.request()}
        backup = {'server': args.server, 'tables': {
            'character': [{'id': 'actor', 'ship_id': 'original'}],
            'construction_instance': [{'id': 'original', 'revision': 7}]}}
        return args, record, backup

    def test_ambiguous_name_cannot_create_plan_or_invoke_reducer(self):
        with tempfile.TemporaryDirectory() as folder:
            args, _, _ = self.fixture(folder)
            with patch.object(tool, 'sql', return_value=[{'id': 'one'}, {'id': 'two'}]), patch.object(tool, 'call') as call:
                with self.assertRaises(RuntimeError):
                    tool.plan(args)
                self.assertFalse(Path(args.plan).exists())
                call.assert_not_called()

    def test_plan_is_private_and_cannot_overwrite_an_existing_plan(self):
        with tempfile.TemporaryDirectory() as folder:
            args, _, _ = self.fixture(folder)
            with patch.object(tool, 'sql', side_effect=[
                [{'id': 'actor', 'ship_id': 'original'}], [{'revision': 7}]] * 2), patch.object(tool, 'fleet_pin', return_value='a' * 64), patch.object(tool, 'call') as call:
                tool.plan(args)
                self.assertEqual(Path(args.plan).stat().st_mode & 0o777, 0o600)
                with self.assertRaises(FileExistsError):
                    tool.plan(args)
                call.assert_not_called()

    def test_wrong_backup_revision_refuses_before_any_mutation(self):
        with tempfile.TemporaryDirectory() as folder:
            args, record, backup = self.fixture(folder)
            Path(args.plan).write_text(json.dumps(record))
            backup['tables']['construction_instance'][0]['revision'] = 8
            with patch.object(tool, 'fleet_pin', return_value='a' * 64), patch.object(tool, 'load_backup', return_value=backup), patch.object(tool, 'call') as call:
                with self.assertRaises(RuntimeError):
                    tool.apply(args)
                call.assert_not_called()

    def test_apply_and_replay_use_identical_pinned_arguments(self):
        with tempfile.TemporaryDirectory() as folder:
            args, record, backup = self.fixture(folder)
            Path(args.plan).write_text(json.dumps(record))
            receipt = [{'kind': 'install-faction-fleet', 'summary_json': json.dumps({'installed': [{}] * 6})}]
            with patch.object(tool, 'fleet_pin', return_value='a' * 64), patch.object(tool, 'load_backup', return_value=backup), patch.object(tool, 'sql', return_value=receipt), patch.object(tool, 'call') as call:
                self.assertEqual(tool.apply(args)['additionalShips'], 6)
                tool.apply(args)
                self.assertEqual(call.call_args_list[0], call.call_args_list[1])
                self.assertEqual(call.call_args.args[-1], 'a' * 64)

    def test_owner_waiver_checks_live_revision_without_exporting_backup(self):
        with tempfile.TemporaryDirectory() as folder:
            args, record, snapshot = self.fixture(folder)
            args.backup = None
            args.owner_waived_backup = True
            Path(args.plan).write_text(json.dumps(record))
            for revision in (8, 7):
                with patch.object(tool, 'fleet_pin', return_value='a' * 64), patch.object(tool, 'load_backup') as backup, patch.object(tool, 'sql', side_effect=[
                    snapshot['tables']['character'],
                    [{'id': 'original', 'revision': revision}],
                    [{'kind': 'install-faction-fleet', 'summary_json': json.dumps({'installed': [{}] * 6})}],
                ]), patch.object(tool, 'call') as call:
                    if revision == 8:
                        with self.assertRaises(RuntimeError):
                            tool.apply(args)
                        call.assert_not_called()
                    else:
                        self.assertEqual(tool.apply(args)['additionalShips'], 6)
                        call.assert_called_once()
                    backup.assert_not_called()


if __name__ == '__main__':
    unittest.main()
