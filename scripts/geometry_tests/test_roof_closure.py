"""Native contact tests. Passing does not assert whole-ship pressure closure."""
from pathlib import Path
import hashlib
import json
import math
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import manifold3d as m
from qualify_roof_closure import qualify, BASE, MAP
from qualify_wayfarer_airlock_inlet import native_parts, ROOT
from native_void_components import components_without_zero_area_bridges
from qualify_wall_closure import qualify as qualify_walls


class NativeClosureTest(unittest.TestCase):
    def test_wall_and_shoulder_use_actual_neighbor_contacts(self):
        result = qualify_walls()
        self.assertTrue(result['pass'], result['checks'])
        self.assertTrue(all(c['pass'] for c in result['checks'] if 'overlap' in c['name'].lower()))
        self.assertEqual(len([p for p in result['pins'] if p.get('newPart')]), 2)

    def test_roof_negative_control_and_native_interfaces(self):
        result = qualify()
        self.assertTrue(result['pass'], result['checks'])
        checks = {c['name']: c for c in result['checks']}
        self.assertTrue(checks['Original native four-panel corner has a continuous leak path']['detail'])
        self.assertEqual(checks['New native junction closes local continuous leak path']['detail'], [])
        self.assertEqual(len(result['sourcePins']), 6)

    def test_underfloor_joint_closes_real_native_corner_without_changing_deck_top(self):
        mapping = json.loads(MAP.read_text())
        originals = {p['sourcePlacedId']: p for p in mapping['preserveOriginalPlacements']}
        parts = []
        for key in ['floor--2--1', 'floor--1--1', 'floor--2-0', 'floor--1-0']:
            p = originals[key]
            v = p['visual']
            path = ROOT / 'assets/runtime' / v['url'].removeprefix('/assets/')
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), v['sha256'])
            body, _ = native_parts(path, v['nodePrefix'])
            o = p['originalPlacement']
            self.assertFalse(o['flipped'])
            parts.append(body.rotate([0, 0, o['rotation']*180/math.pi]).translate(o['position']))
        floor = m.Manifold.batch_boolean(parts, m.OpType.Add)
        plug, _ = native_parts(BASE / 'junction-square.glb')
        plug = plug.translate([-3, -1, .015625])
        self.assertLess(plug.bounding_box()[5], .1875)
        self.assertTrue(all((plug ^ p).volume() > 1e-6 for p in parts))
        coupon = m.Manifold.cube([.1, .1, .25]).translate([-3.05, -1.05, -.025])
        def through(shape):
            return [c for c in (coupon-shape).decompose()
                    if c.bounding_box()[2] < -.024999 and c.bounding_box()[5] > .224999]
        self.assertTrue(through(floor), 'Native rounded floor corner must remain an explicit negative control')
        self.assertFalse(through(floor + plug))

    def test_zero_area_processing_keeps_a_real_native_roof_opening_open(self):
        originals = {p['sourcePlacedId']: p for p in json.loads(MAP.read_text())['preserveOriginalPlacements']}
        panels = []
        for key in ['roof--2--1', 'roof--1--1', 'roof--2-0', 'roof--1-0']:
            p = originals[key]
            v, o = p['visual'], p['originalPlacement']
            body, _ = native_parts(ROOT / 'assets/runtime' / v['url'].removeprefix('/assets/'), v['nodePrefix'])
            panels.append(body.rotate([0, 0, o['rotation']*180/math.pi]).translate(o['position']))
        roof = m.Manifold.batch_boolean(panels, m.OpType.Add)
        coupon = m.Manifold.cube([.1, .1, .24]).translate([-3.05, -1.05, 2.61])
        plug = native_parts(BASE / 'junction-square.glb')[0].translate([-3, -1, 2.6875])
        for shape, expected in [(roof, True), (roof + plug, False)]:
            parts, proof = components_without_zero_area_bridges(coupon-shape)
            self.assertGreater(proof['removedZeroAreaFaces'], 0)
            self.assertEqual(proof['verticesMoved'], 0)
            self.assertEqual(proof['positiveAreaFacesAdded'], 0)
            self.assertLess(proof['signedVolumeDifferenceM3'], 1e-15)
            self.assertEqual(any(p.bounding_box()[2] < 2.610001 and p.bounding_box()[5] > 2.849999 for p in parts), expected)


if __name__ == '__main__':
    unittest.main()
