"""Read-only native wall readiness must not confuse visual clearance with authority."""
from pathlib import Path
import sys
import unittest

import manifold3d as m
from shapely.geometry import Polygon, box

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from inspect_usable_wall_readiness import inspect, projection, containment, runtime_selects


class UsableWallReadinessTests(unittest.TestCase):
    def test_actual_pinned_candidate_reports_both_safe_coverage_and_real_loader_cost(self):
        report = inspect()
        summary = report['summary']
        self.assertEqual(report['changedPlacementCount'], 50)
        self.assertEqual(report['transformsChanged'], 0)
        self.assertEqual(summary['nativeCoverageAgainstAllCurrentColliders']['uncoveredAreaM2'], 0)
        self.assertEqual(summary['candidateEquipmentConflicts'], [])
        self.assertEqual(len(summary['rendererZeroSelectionIds']), 46)
        self.assertTrue(summary['dedicatedWholeFileSelectionValidForAll'])
        self.assertEqual(summary['oldNativeMeshGroups'], 152)
        self.assertEqual(summary['candidateNativeMeshGroups'], 570)
        self.assertGreater(summary['draftCoverReleasesBlockingFloorM2'], 12)
        self.assertIsNone(summary['currentPressureBinding'])
        self.assertTrue(all(c['openPaths'] for c in report['inheritedRoofLeakCoupons'][:4]))
        self.assertEqual(report['inheritedRoofLeakCoupons'][4]['openPaths'], [])
        self.assertTrue(all(not c['usesChangedPart'] for c in report['inheritedRoofLeakCoupons']))
        self.assertFalse(report['installed'])

    def test_projection_preserves_real_native_opening(self):
        ring = m.Manifold.cube([4, 4, 2]) - m.Manifold.cube([2, 2, 4]).translate([1, 1, -1])
        footprint = projection(ring)
        self.assertAlmostEqual(footprint.area, 12)
        self.assertEqual(footprint.intersection(box(1.25, 1.25, 2.75, 2.75)).area, 0)

    def test_positive_thin_crossing_is_not_normalized_away(self):
        accepted = box(0, 0, 1, 1)
        candidate = Polygon([(0.5, -0.000002), (1.5, 0.5), (0.5, 0.000002)])
        self.assertGreater(containment(candidate, accepted)['uncoveredAreaM2'], 0)
        self.assertEqual(containment(box(0.2, 0.2, 0.8, 0.8), accepted)['uncoveredAreaM2'], 0)

    def test_actual_prefix_rule_requires_explicit_dedicated_file_selection(self):
        self.assertFalse(runtime_selects('GEO-bay00-interior--native-00', 'GEO-bay00-interior--'))
        self.assertTrue(runtime_selects('GEO-bay00-interior--native-00', None))


if __name__ == '__main__':
    unittest.main()
