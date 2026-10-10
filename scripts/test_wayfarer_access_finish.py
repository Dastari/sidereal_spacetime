"""The fixed r002 finish preserves admitted geometry and immutable moving bytes."""
import hashlib
import json
import math
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'assets/runtime/wayfarer-access/r001'
FINISH = ROOT / 'assets/runtime/wayfarer-access/r002'


class WayfarerAccessFinish(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base = json.loads((BASE / 'descriptor.json').read_text())
        cls.finish = json.loads((FINISH / 'descriptor.json').read_text())
        cls.base_pack = json.loads((BASE / 'doors.json').read_text())
        cls.pack = json.loads((FINISH / 'doors.json').read_text())
        cls.pieces = {p['id']: p for p in cls.finish['pieces']}
        cls.base_pieces = {p['id']: p for p in cls.base['pieces']}

    def test_gameplay_support_openings_and_variants_are_exact(self):
        changed = {'revision', 'pieces', 'sourceSha256', 'finishBase', 'finishSha256'}
        self.assertEqual({k: v for k, v in self.base.items() if k not in changed},
                         {k: v for k, v in self.finish.items() if k not in changed})
        self.assertEqual({k: v for k, v in self.base_pack.items() if k not in {'revision', 'pieces'}},
                         {k: v for k, v in self.pack.items() if k not in {'revision', 'pieces'}})
        self.assertEqual(self.finish['approval'], 'proposal')

    def test_all_four_moving_leaves_are_byte_identical_and_original_source_is_pinned(self):
        leaves = ['personnel.leaf', 'personnel.reverse.leaf', 'cargo.4m.left', 'cargo.4m.right']
        for name in leaves:
            with self.subTest(leaf=name):
                a, b = self.base_pieces[name], self.pieces[name]
                self.assertEqual(a, b)
                self.assertEqual((BASE / a['file']).read_bytes(), (FINISH / b['file']).read_bytes())
                self.assertEqual(hashlib.sha256((FINISH / b['file']).read_bytes()).hexdigest(), b['sha256'])
        original = ROOT / 'assets/source/wayfarer-access/r001/profile.blend'
        self.assertEqual(hashlib.sha256(original.read_bytes()).hexdigest(), self.finish['finishBase']['sourceSha256'])
        self.assertEqual(hashlib.sha256((BASE / 'descriptor.json').read_bytes()).hexdigest(), self.finish['finishBase']['descriptorSha256'])

    def test_fixed_bounds_cannot_expand_and_detail_budget_is_bounded(self):
        added = 0
        for name, piece in self.pieces.items():
            base = self.base_pieces[name]
            for axis in range(3):
                self.assertGreaterEqual(piece['boundsMin'][axis], base['boundsMin'][axis] - 2e-5)
                self.assertLessEqual(piece['boundsMax'][axis], base['boundsMax'][axis] + 2e-5)
            added += piece['triangles'] - base['triangles']
        self.assertGreater(added, 0)
        self.assertLessEqual(added, 12000)

    def test_provenance_is_pinned_and_every_detail_stays_inside_original_solid(self):
        raw = (FINISH / 'finish.json').read_bytes()
        self.assertEqual(hashlib.sha256(raw).hexdigest(), self.finish['finishSha256'])
        proof = json.loads(raw)
        self.assertEqual(proof['schema'], 'sidereal.wayfarer-access-finish/v1')
        self.assertEqual(proof['revision'], self.finish['revision'])
        self.assertEqual(proof['base'], self.finish['finishBase'])
        details = proof['details']
        self.assertGreater(len(details), 0)
        self.assertEqual(len({p['id'] for p in details}), len(details))
        fixed = {'personnel.frame', 'personnel.reverse.frame', 'cargo.4m.frame', 'native.deck', 'native.flight'}
        for piece in details:
            with self.subTest(detail=piece['id']):
                self.assertIn(piece['group'], fixed)
                for key in ['baseMin', 'baseMax', 'min', 'max']:
                    self.assertEqual(len(piece[key]), 3)
                    self.assertTrue(all(math.isfinite(x) for x in piece[key]))
                for axis in range(3):
                    self.assertGreaterEqual(piece['min'][axis], piece['baseMin'][axis] - 2e-6)
                    self.assertLessEqual(piece['max'][axis], piece['baseMax'][axis] + 2e-6)
                    self.assertLess(piece['min'][axis], piece['max'][axis])
        source = ROOT / 'assets/source/wayfarer-access/r002/profile.blend'
        self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), self.finish['sourceSha256'])


if __name__ == '__main__':
    unittest.main()
