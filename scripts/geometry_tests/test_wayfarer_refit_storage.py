import sys
from pathlib import Path
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from qualify_wayfarer_refit_storage import qualify

class RefitStorageGeometryTest(unittest.TestCase):
    def test_exact_native_geometry_separates_from_proposed_tank(self):
        proof=qualify()
        self.assertTrue(proof['nativeVolumeSeparation'])
        self.assertTrue(proof['nominalFloorCoverage'])
        self.assertGreater(proof['checkedNativeGroups'],1000)
        self.assertTrue(proof['doesNotAuthorizeLiveRefit'])
    def test_existing_abstract_tank_position_is_not_safe_physical_placement(self):
        with self.assertRaises(AssertionError):
            qualify((-3.1,-6))

if __name__=='__main__':unittest.main()
