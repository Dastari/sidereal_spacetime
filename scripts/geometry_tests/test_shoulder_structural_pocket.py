"""Actual native shoulder derivation and composed corner interface controls."""
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from qualify_shoulder_structural_pocket import qualify as qualify_pocket
from qualify_usable_wall_end_bays import qualify as qualify_ends
from qualify_usable_wall_combined_mapping import plan
from qualify_usable_wall_current_template import qualify as qualify_current

class ShoulderStructuralPocketTests(unittest.TestCase):
    def test_native_pocket_preserves_published_surfaces_and_reservation(self):
        result=qualify_pocket()
        self.assertTrue(result['pass'],[c for c in result['checks'] if not c['pass']])
        self.assertEqual(len(result['checks']),16)
        self.assertFalse(result['installed'])
        self.assertFalse(result['wholeHullSealed'])
    def test_combined_native_mapping_preserves_all262_ids_without_equipment_moves(self):
        result=plan()
        self.assertEqual(len(result['bindings']),50)
        self.assertEqual(len(result['preservedOriginalPlacementIds']),262)
        self.assertEqual(result['sourceTransformsChanged'],0)
        self.assertEqual(result['removedPlacedIds'],[])
        self.assertFalse(any(p['sourcePlacedId'].startswith(('equipment-','cargo-','floor-')) for p in result['bindings']))
        self.assertFalse(result['wholeTemplateAdmissible'])
    def test_current362f_is_exact_source_and_six_cabinets_clear_without_moves(self):
        result=qualify_current()
        self.assertTrue(result["pass"])
        self.assertEqual(len(result["cabinetFindings"]),6)
        self.assertEqual(len(result["replacementSourcePlacedIds"]),50)
        self.assertEqual(result["sourceTransformsChanged"],0)
        for item in result["cabinetFindings"]:
            self.assertGreater(item["currentIntersectionM3"],1e-7)
            self.assertLess(item["candidateIntersectionM3"],1e-10)
        self.assertFalse(result["installed"])
        self.assertFalse(result["wholeTemplateAdmissible"])
    def test_exact_corner_buttress_mates_close_but_real_gaps_do_not(self):
        result=qualify_ends()
        self.assertTrue(result['pass'],[c for c in result['checks'] if not c['pass']])
        self.assertEqual(result['conflicts'],[])
        checks=result['checks']
        for prefix in ['Native structural contact confined to declared shoulder mate','Corrected side joins exact R006 shoulder','Actual2mm gap through shoulder connector remains open']:
            self.assertEqual(len([c for c in checks if c['name'].startswith(prefix) and c['pass']]),2)
        self.assertFalse(result['wholeHullSealed'])
        self.assertFalse(result['installed'])

if __name__=='__main__':unittest.main()
