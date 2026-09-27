"""The private native inputs remain the exact saved originals, not summaries."""
import unittest
from gas_preservation_fixtures import verify_fixture


class GasFixtureTests(unittest.TestCase):
    def test_exact_archive_member_and_source_pins(self):
        data = verify_fixture()
        self.assertEqual(len(data['aliases']), 28)
        self.assertEqual(
            {alias.split('/')[0] for alias in data['aliases']},
            {'gas-r003', 'gas-r004', 'gas-r005'},
        )
        for entry in data['members']:
            self.assertEqual(
                sorted(entry['sources']),
                sorted('output/playwright/planet-reference-20260914/' + alias
                       for alias, path in data['aliases'].items() if path == entry['path']),
            )
