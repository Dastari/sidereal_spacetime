"""Run with Blender --background --python; verify saved optical data, not defaults."""
import bpy,json,unittest
from pathlib import Path
ROOT=Path('/root/sidereal_spacetime/output/playwright/planet-reference-20260914/toxic-fog-r005')
class DensityTests(unittest.TestCase):
 def test_saved_alpha_has_soft_zero_perimeter_and_nonuniform_interior(self):
  image=bpy.data.images.load(str(ROOT/'toxic-fog-density.png'));width,height=image.size;values=list(image.pixels);alpha=values[3::4]
  boundary=[alpha[y*width+x]for y in range(height)for x in range(width)if x in(0,width-1)or y in(0,height-1)]
  self.assertEqual(max(boundary),0);self.assertGreater(max(alpha),.4);self.assertLess(max(alpha),.5);self.assertGreater(len(set(alpha)),90);self.assertLess(sum(alpha)/len(alpha),.09)
 def test_saved_albedo_retains_authored_linear_olive(self):
  image=bpy.data.images.load(str(ROOT/'toxic-fog-density.png'));values=list(image.pixels)
  rgb=values[:3];linear=[x/12.92 if x<=.04045 else((x+.055)/1.055)**2.4 for x in rgb]
  self.assertAlmostEqual(linear[0]/linear[1],.105/.155,delta=.04);self.assertAlmostEqual(linear[2]/linear[1],.032/.155,delta=.025)
if __name__=='__main__':
 result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(DensityTests));
 if not result.wasSuccessful():raise RuntimeError('Saved density export validation failed')
