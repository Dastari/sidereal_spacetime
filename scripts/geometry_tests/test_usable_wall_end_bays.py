"""End revisions must retain real failed armor/seam evidence before activation."""
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from qualify_usable_wall_end_bays import DIRECTORY,qualify

class UsableWallEndBayTests(unittest.TestCase):
    def test_first_end_candidate_exposes_all_six_native_armor_conflicts(self):
        report=qualify(DIRECTORY.parent/'a007')
        self.assertFalse(report['pass'])
        self.assertEqual(len(report['conflicts']),6)
        self.assertTrue(any(c['sourcePlacedId'].startswith('pilot-r005-') for c in report['conflicts']))
        self.assertTrue(any(c['sourcePlacedId'].startswith('superstructure-') for c in report['conflicts']))
    def test_narrower_end_candidate_clears_armor_but_does_not_hide_real_shoulder_gaps(self):
        report=qualify(DIRECTORY.parent/'a008')
        self.assertFalse(report['pass'])
        self.assertEqual(report['conflicts'],[])
        failed=[c['name'] for c in report['checks'] if not c['pass']]
        self.assertEqual(len(failed),2)
        self.assertTrue(all(name.startswith('Corrected side joins exact R006 shoulder') for name in failed))
        self.assertEqual(len([c for c in report['checks'] if c['name'].startswith('Actual unchanged') and c['pass']]),14)
        self.assertFalse(report['wholeHullSealed'])
        self.assertFalse(report['installed'])

if __name__=='__main__':unittest.main()
