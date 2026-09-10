"""Native composite expansion must preserve partitions while fixing outer walls."""
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from qualify_usable_wall_side_bays import qualify

class UsableWallSideBayTests(unittest.TestCase):
    def test_actual14bays_preserve_partitions_all_six_lockers_and_real_seams(self):
        result=qualify()
        self.assertTrue(result['pass'],[c for c in result['checks'] if not c['pass']])
        checks=result['checks']
        for prefix,count in [('Unchanged complete locker clear',6),('Actual native neighboring seam closed',12),('Positive2mm seam gap remains open',12),('Original placement identity/frame unchanged',28)]:
            self.assertEqual(len([c for c in checks if c['name'].startswith(prefix)]),count)
        self.assertGreater(len([c for c in checks if c['name'].startswith('Exact historical partition triangles retained')]),0)
        self.assertFalse(result['installed'])
        self.assertFalse(result['wholeShipPressureQualified'])
        self.assertIsNone(result['ownerFinalSignoff'])

if __name__=='__main__':unittest.main()
