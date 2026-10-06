import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import ship_upgrade
import ship_wipe


class ChosenUpgradePlanTests(unittest.TestCase):
    def args(self):
        return SimpleNamespace(
            server='http://fixture.invalid', database='fixture', operation_id='upgrade-apply-0001',
            ship_id='fixture-ship', character_id=None, target_prefab_id='fed.m.wayfarer',
            from_dry_run='upgrade-plan-0001', confirm_database='fixture', backup=None,
            owner_waived_backup=True,
        )

    def plan(self, **summary):
        return {
            'kind': 'upgrade-prefab-dry-run',
            'request': {
                'shipId': 'fixture-ship', 'expectedSourceBlueprintSha256': 'source-pin',
                'expectedInstanceRevision': '6', 'targetPrefabId': 'fed.m.wayfarer',
                'expectedTargetBlueprintSha256': 'target-pin',
            },
            'summary': {'shipId': 'fixture-ship', 'refusals': [], **summary},
        }

    def test_dry_run_sends_no_apply_plan_association(self):
        args = self.args()
        with patch.object(ship_upgrade, 'expectations', return_value=(
            'fixture-ship', 'source-pin', 6, {'blueprintSha256': 'target-pin'},
        )), patch.object(ship_upgrade, 'call') as call, patch.object(
            ship_upgrade, 'ledger', return_value=self.plan(),
        ), patch('builtins.print'):
            ship_upgrade.dry_run(args)
        self.assertEqual(call.call_args.args, (
            args.server, args.database, 'operator_upgrade_prefab_ship', args.operation_id,
            True, 'fixture-ship', 'source-pin', 6, 'fed.m.wayfarer', 'target-pin', None,
        ))

    def test_apply_passes_exact_chosen_clean_plan_with_owner_waiver(self):
        args = self.args()
        with patch.object(ship_upgrade, 'ledger', side_effect=[self.plan(), {'kind': 'upgrade-prefab'}]) as ledger, \
                patch.object(ship_upgrade, 'call') as call, patch.object(ship_upgrade, 'load_backup') as load, \
                patch('builtins.print'):
            ship_upgrade.apply(args)
        self.assertEqual(ledger.call_args_list[0].args, (args.server, args.database, args.from_dry_run))
        self.assertEqual(call.call_args.args, (
            args.server, args.database, 'operator_upgrade_prefab_ship', args.operation_id,
            False, 'fixture-ship', 'source-pin', 6, 'fed.m.wayfarer', 'target-pin', {'some': args.from_dry_run},
        ))
        load.assert_not_called()

    def test_chosen_plan_reaches_cli_as_tagged_some_json(self):
        args = self.args()
        with patch.object(ship_upgrade, 'ledger', side_effect=[self.plan(), {'kind': 'upgrade-prefab'}]), \
                patch.object(ship_wipe, 'cli') as cli, patch('builtins.print'):
            ship_upgrade.apply(args)
        command = cli.call_args.args[0]
        self.assertEqual(command[:7], [
            'call', '--server', args.server, '--yes', '--no-config', args.database,
            'operator_upgrade_prefab_ship',
        ])
        self.assertEqual(json.loads(command[-1]), {'some': args.from_dry_run})

    def test_refused_plan_never_calls_apply(self):
        with patch.object(ship_upgrade, 'ledger', return_value=self.plan(refusals=['blocked furniture'])), \
                patch.object(ship_upgrade, 'call') as call:
            with self.assertRaises(SystemExit):
                ship_upgrade.apply(self.args())
        call.assert_not_called()


if __name__ == '__main__':
    unittest.main()
