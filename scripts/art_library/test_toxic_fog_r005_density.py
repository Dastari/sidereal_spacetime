"""Verify saved native optical data with Pillow; no Blender install is required."""
from pathlib import Path
import unittest
from PIL import Image

DENSITY = Path(__file__).resolve().parents[2] / 'assets/ci/fixtures/toxic-fog-r005-density.png'


class DensityTests(unittest.TestCase):
    def test_saved_alpha_has_soft_zero_perimeter_and_nonuniform_interior(self):
        with Image.open(DENSITY) as image:
            width, height = image.size
            alpha = [value / 255 for value in image.getchannel('A').get_flattened_data()]
        boundary = [alpha[y * width + x] for y in range(height) for x in range(width)
                    if x in (0, width - 1) or y in (0, height - 1)]
        self.assertEqual(max(boundary), 0)
        self.assertGreater(max(alpha), .4)
        self.assertLess(max(alpha), .5)
        self.assertGreater(len(set(alpha)), 90)
        self.assertLess(sum(alpha) / len(alpha), .09)

    def test_saved_albedo_retains_authored_linear_olive(self):
        # Blender's first pixel is bottom-left; PNG row order starts at the top.
        with Image.open(DENSITY) as image:
            rgb = [value / 255 for value in image.getpixel((0, image.height - 1))[:3]]
        linear = [x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4 for x in rgb]
        self.assertAlmostEqual(linear[0] / linear[1], .105 / .155, delta=.04)
        self.assertAlmostEqual(linear[2] / linear[1], .032 / .155, delta=.025)


if __name__ == '__main__':
    unittest.main()
