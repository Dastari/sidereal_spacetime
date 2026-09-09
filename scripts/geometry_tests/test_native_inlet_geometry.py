"""Execute native CSG and full-angle motion proofs in the declared environment."""
from pathlib import Path
import sys
import json
import subprocess
import unittest
from shapely.geometry import Polygon, box
from shapely.ops import unary_union
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import qualify_wayfarer_airlock_inlet as inlet
import qualify_wayfarer_airlock_inlet_motion as motion
import qualify_wayfarer_airlock_walking as walking


class NativeAirlockGeometryTests(unittest.TestCase):
    def test_actual_attached_native_seal_support_and_continuous_door_motion(self):
        # Manifold3.2.1 is an offline native tool. Keep independent large CSG
        # audits in fresh interpreters; a nonzero exit is always a failed gate.
        subprocess.run([sys.executable, str(inlet.ROOT/'scripts/qualify_wayfarer_airlock_inlet.py'), str(motion.KIT.relative_to(inlet.ROOT))], cwd=inlet.ROOT, check=True, stdout=subprocess.DEVNULL)
        closed = json.loads((motion.KIT/'native-qualification.json').read_text())
        self.assertTrue(closed['pass'], [c for c in closed['checks'] if not c['pass']])
        self.assertEqual(len(closed['checks']), 21)
        subprocess.run([sys.executable, str(inlet.ROOT/'scripts/qualify_wayfarer_airlock_inlet_motion.py')], cwd=inlet.ROOT, check=True, stdout=subprocess.DEVNULL)
        moved = json.loads((motion.KIT/'native-motion-neighbor-qualification.json').read_text())
        self.assertTrue(moved['pass'], [c for c in moved['checks'] if not c['pass']])
        self.assertEqual(len(moved['checks']), 8)
        self.assertFalse(moved['neighborBoundary']['installablePressurizedNeighbor'])

    def test_conservative_native_projection_preserves_aperture_and_authority_budget(self):
        subprocess.run([sys.executable, str(inlet.ROOT/'scripts/qualify_wayfarer_airlock_walking.py')], cwd=inlet.ROOT, check=True, stdout=subprocess.DEVNULL)
        result = json.loads((motion.KIT/'native-walking-projection-v2.json').read_text())
        self.assertEqual(len(result['rows']), 74)
        self.assertTrue(all(len(row['obstacles']) <= 32 for row in result['rows']))
        shapes = [Polygon(o['vertices']) for row in result['rows'] for o in row['obstacles']]
        cover = unary_union(shapes)
        # Same centerline/body envelope that was tested on actual native solids.
        self.assertLess(cover.intersection(box(3.3, -4.3, 6.65, -3.7)).area, 1e-10)
        # Wider actor must hit physical jambs: aperture proof isn't empty collision.
        self.assertGreater(cover.intersection(box(3.3, -4.7, 6.65, -3.3)).area, .01)


if __name__ == '__main__':
    unittest.main()
