"""Profile contracts for the Blender-authored canopy family (no bpy required)."""
import unittest
import ship_kit_modules as m


class BowModuleTests(unittest.TestCase):
    def test_sloped_windscreen_and_rising_keel_on_every_height(self):
        for hc in m.G['heightClasses']:
            with self.subTest(height=hc):
                piece = m.canopy_straight(hc)
                _, top, bottom = m.class_z(hc)
                glass = [piece.verts[i] for f, slot in zip(piece.faces, piece.slots) if slot == 'glass' for i in f]
                self.assertTrue(glass)
                rear = max(glass, key=lambda p: p[2])
                front = min(glass, key=lambda p: p[2])
                # Straight face projects +Y. Upper windscreen is at the hull,
                # lower edge forward; never an upright rectangular pane.
                self.assertGreater(front[1] - rear[1], .5)
                self.assertGreater(rear[2] - front[2], .5)
                self.assertLessEqual(max(v[2] for v in piece.verts), top + 1e-6)
                self.assertGreaterEqual(min(v[2] for v in piece.verts), bottom - 1e-6)
                low = min(v[2] for v in piece.verts)
                tip = max(v[1] for v in piece.verts)
                self.assertGreater(min(v[2] for v in piece.verts if v[1] > tip - 2), low)
                self.assertTrue({'glass', 'accent', 'emit_a', 'dark'} <= set(piece.slots))
                self.assertTrue(set(piece.slots) <= set(m.SLOTS))

    def test_all_tile_chains_and_corner_connectors_have_finite_closed_faces(self):
        import math
        for shape in m.G['shapeTiles']:
            if shape == 'square':
                continue
            piece = m.canopy_module(shape, 'deck')
            self.assertTrue(piece.faces)
            self.assertTrue(all(math.isfinite(c) for v in piece.verts for c in v))
        for hc in m.G['heightClasses']:
            self.assertTrue(m.canopy_corner(hc).faces)


if __name__ == '__main__':
    unittest.main()
