import unittest
from cleanup_test_accounts import plan_rows, literal

A, B = 'a' * 64, 'b' * 64

class CleanupTests(unittest.TestCase):
    def fixture(self):
        return {
            'ship': [{'id': 'ship-a', 'owner': ['0x' + A]}, {'id': 'ship-b', 'owner': ['0x' + B]}],
            'character': [{'id': 'char-a', 'owner': ['0x' + A], 'ship_id': 'ship-a'}, {'id': 'char-b', 'owner': ['0x' + B], 'ship_id': 'ship-b'}],
            'inventory_container': [{'id': 'box-a', 'character_id': 'char-a', 'parent_item_id': ''}, {'id': 'box-b', 'character_id': 'char-b', 'parent_item_id': ''}],
            'inventory_item': [{'id': 'item-a', 'container_id': 'box-a'}, {'id': 'item-b', 'container_id': 'box-b'}],
            'receipt': [{'id': 'receipt-a', 'result_id': 'ship-a'}, {'id': 'receipt-b', 'result_id': 'ship-b'}],
            'world_system': [{'id': 'shared-system'}],
        }

    def test_nested_inventory_and_receipts_without_crossing_empty_parent(self):
        rows = plan_rows(self.fixture(), [A], [B])
        self.assertEqual({r['row']['id'] for r in rows}, {'ship-a', 'char-a', 'box-a', 'item-a', 'receipt-a'})

    def test_cross_account_passenger_rejected(self):
        tables = self.fixture()
        tables['character'][1]['ship_id'] = 'ship-a'
        with self.assertRaisesRegex(ValueError, 'protected'):
            plan_rows(tables, [A], [B])

    def test_target_reference_to_protected_ship_rejected(self):
        tables = self.fixture()
        tables['receipt'][0].update(owner=['0x' + A], result_id='ship-b')
        with self.assertRaisesRegex(ValueError, 'protected'):
            plan_rows(tables, [A], [B])

    def test_account_must_own_ship_and_protected_list_required(self):
        for targets, protected in [([A], []), ([A], [A]), (['c' * 64], [B])]:
            with self.assertRaises(ValueError):
                plan_rows(self.fixture(), targets, protected)

    def test_quotes_are_literals(self):
        self.assertEqual(literal("a'b"), "'a''b'")
        self.assertEqual(literal(['0x' + A]), '0x' + A)

if __name__ == '__main__':
    unittest.main()
