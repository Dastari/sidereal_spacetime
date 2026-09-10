"""Native authoring correction must restore usable space without moving items."""
from pathlib import Path
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from qualify_usable_boundary_wall import DIRECTORY, clipped_area, qualify


class UsableBoundaryWallTests(unittest.TestCase):
    def test_actual_native_wall_corner_and_unchanged_locker(self):
        result = qualify()
        self.assertTrue(result['pass'], [c for c in result['checks'] if not c['pass']])
        self.assertEqual(result['originalPlacementChanges'],0)
        checks = {c['name']:c for c in result['checks']}
        self.assertGreater(checks['Original unchanged locker intersection is a real negative control']['detail']['nativeM3'],.0004)
        self.assertEqual(checks['Corrected source clears unchanged locker']['detail']['nativeM3'],0)
        self.assertGreaterEqual(checks['Corrected source clears unchanged locker']['detail']['minimumNativeGapM'],.0625)

    def test_surface_crossing_usable_quadrant_is_detected_without_inside_vertices(self):
        triangle = [[-1,2,1],[2,-1,1],[-1,-1,1]]
        self.assertGreater(clipped_area(triangle,[0,0,0],[3,3,2]),.49)

    def test_old_visible_coplanar_contact_ear_is_a_real_negative_control(self):
        result = qualify(DIRECTORY.parent/'a002')
        checks = {c['name']:c for c in result['checks']}
        self.assertFalse(checks['Separate modules have no overlapping visible top faces']['pass'])
        self.assertGreater(checks['Separate modules have no overlapping visible top faces']['detail']['samePlaneSameFacingOverlapM2'],0)

    def test_initial_thick_body_is_rejected_against_unchanged_native_armor(self):
        result = qualify(DIRECTORY.parent/'a003')
        check = next(c for c in result['checks'] if c['name']=='Unchanged outer armor has separate nonoverlapping reservation')
        self.assertFalse(check['pass'])
        self.assertGreater(check['detail']['nativeM3'],3)


if __name__ == '__main__':
    unittest.main()
