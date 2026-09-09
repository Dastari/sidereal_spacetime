import copy
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))
from validate_cargo_carriers import ROOT, payload_fit, validate


class CarrierQualificationTests(unittest.TestCase):
    def setUp(self):
        self.directory = ROOT/'assets/art-library/designs/cargo.carrier.grid-support/revisions/r000/a003'
        self.interface = json.loads((self.directory/'carrier-1m-interface.json').read_text())
        self.rows = json.loads((ROOT/'docs/handoffs/cargo_grid_model_audit.json').read_text())['rows']

    def test_native_export_has_actual_flat_bearing_surfaces(self):
        report = validate(self.directory)
        self.assertEqual(report['compatibleAssetCount'], 13)
        self.assertEqual(len(report['payloads']), 73)
        self.assertTrue(all(a['contactGeometryQualified'] for a in report['assets']))
        self.assertFalse(report['gameplayLoadApproval'])

    def test_prior_status_light_protrusion_is_rejected(self):
        with self.assertRaises(AssertionError):
            validate(self.directory.parent/'a002')

    def test_small_closed_crate_fits_all_quarter_turns_without_scaling(self):
        row = next(r for r in self.rows if r['appearance'] == 'standard-small')
        result = payload_fit(row, self.interface)
        self.assertEqual(result['allowedQuarterTurns'], [0, 1, 2, 3])
        self.assertFalse(result['restraintQualified'])
        self.assertFalse(result['filledLoadApproved'])

    def test_footprint_alone_does_not_admit_fuel_or_tall_cargo(self):
        for name in ['fuel', 'standard-medium', 'reinforced-oversized']:
            row = next(r for r in self.rows if r['appearance'] == name)
            result = payload_fit(row, self.interface)
            self.assertFalse(result['closedEnvelopeFits'])
            self.assertGreater(result['heightExcessM'], 0)

    def test_center_uses_asymmetric_approved_bounds(self):
        row = next(r for r in self.rows if r['appearance'] == 'standard-small')
        result = payload_fit(row, self.interface)
        self.assertAlmostEqual(result['sourceCenterAuthorM'][1], -.03775, places=6)

    def test_rotation_obeys_rectangular_reserved_space(self):
        row = copy.deepcopy(next(r for r in self.rows if r['appearance'] == 'standard-small'))
        interface = {**self.interface, 'payloadCellInteriorM': [0, 0, .5, .7]}
        self.assertEqual(payload_fit(row, interface)['allowedQuarterTurns'], [1, 3])


if __name__ == '__main__':
    unittest.main()
