"""Operator CLI tests use no running database and never invoke live reducers."""
import unittest
from types import SimpleNamespace
from unittest.mock import patch
import ship_replace as tool

class ReplacementToolTests(unittest.TestCase):
    def args(self, **over):
        return SimpleNamespace(server='http://127.0.0.1:3391',database='isolated-review',
                               confirm_database='isolated-review',discard_ship_storage=True,
                               from_dry_run='replace-dry-0001',backup='/private/backup.json',
                               operation_id='replace-apply-0001',**over)
    def request(self):
        return dict(characterId='actor',shipId='ship',expectedSourceBlueprintSha256='source',
                    expectedInstanceRevision={'$bigint':'5'},targetPrefabId='fed.m.wayfarer',
                    expectedTargetCatalogRevision='ship-components-v1@4',
                    expectedTargetBlueprintSha256='target',discardShipStorage=True)
    def backup(self):
        return {'server':'http://127.0.0.1:3391','tables':{'construction_instance':[dict(id='ship',blueprint_sha_256='source',revision=5)],
                          'character':[dict(id='actor',ship_id='ship')]}}
    def test_apply_uses_pinned_dry_run_not_newly_resolved_state(self):
        with patch.object(tool,'ledger',return_value={'kind':'replace-prefab-dry-run','request':self.request()}), patch.object(tool,'load_backup',return_value=self.backup()), patch.object(tool,'invoke',return_value={'ok':True}) as invoke:
            self.assertEqual(tool.apply(self.args()),{'ok':True})
            self.assertEqual(invoke.call_args.args[1]['expectedInstanceRevision'],5)
            self.assertEqual(invoke.call_args.args[1]['shipId'],'ship')
            self.assertFalse(invoke.call_args.args[2])
    def test_database_confirmation_and_loss_flag_are_required_before_mutation(self):
        for attr,value in [('confirm_database','other'),('discard_ship_storage',False)]:
            args=self.args();setattr(args,attr,value)
            with patch.object(tool,'invoke') as invoke:
                with self.assertRaises(RuntimeError):tool.apply(args)
                invoke.assert_not_called()
    def test_backup_must_match_exact_source_revision(self):
        backup=self.backup();backup['tables']['construction_instance'][0]['revision']=6
        with patch.object(tool,'ledger',return_value={'kind':'replace-prefab-dry-run','request':self.request()}), patch.object(tool,'load_backup',return_value=backup), patch.object(tool,'invoke') as invoke:
            with self.assertRaisesRegex(RuntimeError,'pinned source'):tool.apply(self.args())
            invoke.assert_not_called()
    def test_foreign_operation_kind_and_unapproved_loss_are_refused(self):
        for prior in [{'kind':'upgrade-prefab-dry-run','request':self.request()}, {'kind':'replace-prefab-dry-run','request':{**self.request(),'discardShipStorage':False}}]:
            with patch.object(tool,'ledger',return_value=prior),patch.object(tool,'invoke') as invoke:
                with self.assertRaises(RuntimeError):tool.apply(self.args())
                invoke.assert_not_called()

if __name__=='__main__':unittest.main()
