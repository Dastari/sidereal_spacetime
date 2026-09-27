"""Geometry and incremental-damage tests for the offline layered study."""
import math
import unittest

from hull_layered_contract import CELL, damage_cells, panel_layout


def solid(width=2.0, height=3.0, interior=False):
    x0 = -4 if interior else 0
    return {
        (x, y, z): (0 if x == x0 else 1 if x < x0 + 4 else 2)
        for x in range(x0, x0 + 8)
        for y in range(int(width / CELL))
        for z in range(int(height / CELL))
    }


class LayoutTests(unittest.TestCase):
    def test_profiles_reassemble_exactly_without_scaling(self):
        for height in (0.75, 1.5, 1.8125, 1.84375, 2.25, 3.0):
            for width in (0.5, 1.0, 2.0, 1.03125):
                with self.subTest(width=width, height=height):
                    p = panel_layout(width, height)
                    courses = p['middle_courses']
                    self.assertEqual(0.125 + len(courses) * 0.25 + p['filler']['height_m'], height)
                    self.assertEqual(p['sockets']['HULL_EDGE_START'], [0, -width / 2, 0])
                    self.assertEqual(p['sockets']['HULL_EDGE_END'], [0, width / 2, 0])
                    self.assertEqual(p['sockets']['HULL_TOP'], [0, 0, height])
                    self.assertEqual(p['lattice_origin_m'][1] + p['width_cells'] * CELL, width / 2)
                    self.assertTrue(all(c['z_max'] - c['z_min'] == 0.25 for c in courses))
        self.assertEqual(panel_layout(2, 1.84375)['filler']['cells'], 7)

    def test_variable_width_adjacent_anchors_and_voxel_edges_match(self):
        a, b = panel_layout(2, 3), panel_layout(1.03125, 3)
        translate_y = a['sockets']['HULL_EDGE_END'][1] - b['sockets']['HULL_EDGE_START'][1]
        self.assertEqual(translate_y + b['lattice_origin_m'][1], 1.0)
        self.assertEqual(translate_y + b['sockets']['HULL_EDGE_START'][1], a['sockets']['HULL_EDGE_END'][1])
        # All B edges sit on the same physical lattice as A after snapping.
        for i in range(b['width_cells'] + 1):
            edge = translate_y + b['lattice_origin_m'][1] + i * CELL
            self.assertEqual(edge / CELL, int(edge / CELL))

    def test_internal_profile_is_centred_and_separate(self):
        p = panel_layout(1, 1.5, True)
        self.assertEqual(p['bounds']['min'][0], -0.125)
        self.assertEqual(p['bounds']['max'][0], 0.125)
        self.assertEqual(p['layers'][1]['x_max'] - p['layers'][1]['x_min'], 0.1875)

    def test_bad_dimensions_rejected_without_rounding(self):
        for value in (0, -1, 1.000000001, math.nan, math.inf, True, '2', 100):
            with self.subTest(value=value), self.assertRaises(ValueError):
                panel_layout(value, 3)
        with self.assertRaises(ValueError):
            panel_layout(2, CELL)
        with self.assertRaises(ValueError):
            panel_layout(2, 3, 'yes')


class DamageTests(unittest.TestCase):
    def test_crater_open_armor_and_penetration_have_different_depth(self):
        original = solid()
        results = {s: damage_cells(original, s, 2, 3) for s in ('intact', 'crater', 'armor_open', 'through')}
        self.assertEqual(results['intact'].retained, original)
        for state, min_x in [('crater', 6), ('armor_open', 3), ('through', 0)]:
            r = results[state]
            self.assertEqual(min(c[0] for c in r.removed), min_x)
            self.assertEqual(set(r.removed) | set(r.retained), set(original))
            self.assertFalse(set(r.removed) & set(r.retained))
            self.assertTrue(all(original[c] == mat for c, mat in r.retained.items()))
            self.assertTrue(all(original[c] == mat for c, mat in r.removed.items()))
        self.assertTrue(results['crater'].metadata['barrier_intact'])
        self.assertTrue(results['armor_open'].metadata['barrier_intact'])
        self.assertFalse(results['through'].metadata['barrier_intact'])
        r = results['through']
        self.assertGreater(sum(c[0] == 7 for c in r.removed), sum(c[0] == 0 for c in r.removed))

    def test_damage_accumulates_without_repair_or_duplicate_removed_cells(self):
        original = solid()
        crater = damage_cells(original, 'crater', 2, 3)
        armor = damage_cells(crater.retained, 'armor_open', 2, 3)
        through = damage_cells(armor.retained, 'through', 2, 3)
        direct = damage_cells(original, 'through', 2, 3)
        self.assertEqual(through.retained, direct.retained)
        self.assertEqual(set(crater.removed) | set(armor.removed) | set(through.removed), set(direct.removed))
        self.assertFalse(set(crater.removed) & set(armor.removed))
        unchanged = damage_cells(through.retained, 'intact', 2, 3)
        self.assertEqual(unchanged.retained, through.retained)
        self.assertFalse(unchanged.metadata['barrier_intact'])
        self.assertEqual(damage_cells(crater.retained, 'crater', 2, 3).removed, {})

    def test_cavity_removal_does_not_invent_material(self):
        original = {c: m for c, m in solid().items() if c[0] == 0 or c[0] >= 4 or c[1] in (0, 31, 32, 63)}
        open_armor = damage_cells(original, 'armor_open', 2, 3)
        self.assertTrue(open_armor.metadata['barrier_intact'])
        self.assertTrue(set(open_armor.removed) <= set(original))
        through = damage_cells(open_armor.retained, 'through', 2, 3)
        self.assertFalse(through.metadata['barrier_intact'])

    def test_internal_wall_and_small_custom_panels(self):
        for width, height, interior in ((2, 3, True), (0.5, 0.75, False), (1.03125, 1.84375, False), (CELL, 0.75, False)):
            original = solid(width, height, interior)
            crater = damage_cells(original, 'crater', width, height, interior)
            through = damage_cells(original, 'through', width, height, interior)
            self.assertTrue(crater.removed)
            self.assertTrue(crater.metadata['barrier_intact'])
            self.assertFalse(through.metadata['barrier_intact'])

    def test_existing_skin_hole_is_reported_even_without_new_impact(self):
        original = solid(0.5, 0.75)
        del original[(0, 0, 0)]
        r = damage_cells(original, 'intact', 0.5, 0.75)
        self.assertEqual(r.metadata['missing_inner_skin_cells'], 1)
        self.assertFalse(r.metadata['barrier_intact'])

    def test_malformed_occupancy_or_state_rejected(self):
        for occ in ({(8, 0, 0): 0}, {(0, -1, 0): 0}, {(0.0, 0, 0): 0}, {(0, 0, 0): True}, {(0, 0, 0): -1}, {'bad': 0}):
            with self.subTest(occ=occ), self.assertRaises(ValueError):
                damage_cells(occ, 'crater', 2, 3)
        with self.assertRaises(ValueError):
            damage_cells({}, 'dent', 2, 3)


if __name__ == '__main__':
    unittest.main()
