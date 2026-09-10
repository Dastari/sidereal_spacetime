"""Actual export checks plus oversized/diagonal/height negative controls."""
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from qualify_wayfarer_authored_envelopes import floor_exports, locker_export, qualify_points
from qualify_wayfarer_placement_interfaces import audit as placement_audit


class AuthoredEnvelopeTests(unittest.TestCase):
    def test_all_twelve_actual_floor_exports_fit_their_reserved_shapes(self):
        report = floor_exports()
        self.assertEqual(len(report['assets']), 12)
        self.assertTrue(report['allExportedGeometryAssigned'])
        self.assertTrue(report['allReservedEnvelopesPass'], report['assets'])

    def test_two_meter_reservation_rejects_oversized_handle(self):
        with self.assertRaisesRegex(ValueError, 'footprint'):
            qualify_points([[0, 0, 0], [2.04, 1, .1]], [[0, 0], [2, 0], [2, 2], [0, 2]], 0, .1875)

    def test_actual_locker_body_fits_without_claiming_its_mount_is_qualified(self):
        report = locker_export()
        self.assertTrue(report['fitsExistingDeclaredBodyEnvelope'])
        self.assertIn('proposed', report['socketStatus'])

    def test_actual_six_wall_locker_intersections_fail_without_auto_relocation(self):
        report = placement_audit()
        expected = {f'equipment-locker-{x}-{y}' for x in ['-4.7', '4.7'] for y in ['-6', '-2', '2']}
        self.assertEqual(set(report['invalidEquipmentPlacedIds']), expected)
        self.assertFalse(report['publishedFitQualified'])
        self.assertTrue(report['placementCompensationRejected'])
        self.assertEqual(report['transformsChanged'], 0)
        self.assertNotIn('reviewOnlyLockerMigration', report)

    def test_triangle_must_fit_polygon_not_just_its_bounding_box(self):
        with self.assertRaisesRegex(ValueError, 'footprint'):
            qualify_points([[1.1, 1.1, .1]], [[0, 0], [2, 0], [0, 2]], 0, .1875)

    def test_geometry_above_reserved_height_is_not_a_decorative_exception(self):
        with self.assertRaisesRegex(ValueError, 'height'):
            qualify_points([[1, 1, .2]], [[0, 0], [2, 0], [2, 2], [0, 2]], 0, .1875)

    def test_smaller_geometry_keeps_its_declared_origin(self):
        result = qualify_points([[.02, .02, .01], [1.98, 1.98, .18]], [[0, 0], [2, 0], [2, 2], [0, 2]], 0, .1875)
        self.assertEqual(result['nativeBoundsM']['min'], [.02, .02, .01])


if __name__ == '__main__':
    unittest.main()
