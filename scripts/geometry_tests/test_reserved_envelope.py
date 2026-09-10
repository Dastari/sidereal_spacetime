import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'art_library'))
from validate_reserved_envelope import qualify_points, qualify_glb
ROOT=Path(__file__).resolve().parents[2]

class ReservedEnvelopeTests(unittest.TestCase):
    def test_exact_native_carriers_include_all_handles_and_bevels(self):
        base=ROOT/'assets/art-library/designs/cargo.carrier.grid-support/revisions/r000/a003'
        for size in (1,2):
            report=qualify_glb(base/f'carrier-{size}m.glb',[[0,0],[size,0],[size,size],[0,size]],0,.6875)
            self.assertGreater(report['verticesChecked'],9000)
            self.assertFalse(report['placementRepairApplied'])
    def test_two_metres_cannot_mean_two_point_zero_four(self):
        with self.assertRaisesRegex(ValueError,'footprint'):
            qualify_points([[2.04,1,.1]],[[0,0],[2,0],[2,2],[0,2]],0,.2)
    def test_bevel_or_handle_below_declared_base_rejects(self):
        with self.assertRaisesRegex(ValueError,'height'):
            qualify_points([[1,1,-.001]],[[0,0],[2,0],[2,2],[0,2]],0,.2)
    def test_triangular_empty_half_is_not_a_reserved_square(self):
        with self.assertRaisesRegex(ValueError,'footprint'):
            qualify_points([[1.8,1.8,.1]],[[0,0],[2,0],[0,2]],0,.2)
        self.assertEqual(qualify_points([[.3,.3,.1]],[[0,0],[2,0],[0,2]],0,.2)['verticesChecked'],1)
    def test_original_pivot_is_not_recentered_to_fit(self):
        with self.assertRaisesRegex(ValueError,'footprint'):
            qualify_points([[-.02,1,.1],[1.98,1,.1]],[[0,0],[2,0],[2,2],[0,2]],0,.2)
    def test_concave_or_nonfinite_metadata_fails_closed(self):
        with self.assertRaisesRegex(ValueError,'convex'):
            qualify_points([[0,0,.1]],[[0,0],[2,0],[1,1],[2,2],[0,2]],0,.2)
        with self.assertRaisesRegex(ValueError,'Non-finite'):
            qualify_points([[float('nan'),0,0]],[[0,0],[2,0],[0,2]],0,.2)

if __name__=='__main__':unittest.main()
