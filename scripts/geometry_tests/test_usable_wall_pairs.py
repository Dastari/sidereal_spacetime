"""Actual native split bindings preserve original IDs and every surface."""
from pathlib import Path
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from qualify_usable_wall_pairs import qualify_pairs


class UsableWallPairTests(unittest.TestCase):
    def test_four_actual_legacy_pairs_preserve_ids_without_duplicate_outer_walls(self):
        report = qualify_pairs()
        self.assertTrue(report['pass'],[c for c in report['checks'] if not c['pass']])
        self.assertEqual(report['originalPlacementCount'],262)
        self.assertEqual(len(report['replacements']),8)
        self.assertEqual(report['originalTransformsChanged'],0)
        self.assertEqual(report['originalIdsRemoved'],[])
        self.assertFalse(report['fullWayfarerAdmissible'])
        surface_checks = [c for c in report['checks'] if c['name'].startswith('Every native surface triangle')]
        self.assertEqual(len(surface_checks),4)
        self.assertTrue(all(c['pass'] and c['detail']['nativeTriangleCount']==4020 for c in surface_checks))
        duplicate_checks = [c for c in report['checks'] if c['name'].startswith('Retaining old outer wall')]
        self.assertEqual(len(duplicate_checks),4)
        self.assertTrue(all(c['detail']['forbiddenDuplicateM3']>.1 for c in duplicate_checks))


if __name__=='__main__':
    unittest.main()
