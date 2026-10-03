"""Independent geometric witnesses for the corrected authored post lens recesses."""
import hashlib
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('post_aperture', ROOT / 'scripts/art_library/wayfarer_post_aperture.py')
POST = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(POST)


def primitives(path):
    document, binary = POST.document(path.read_bytes())
    result = {}
    for primitive in document['meshes'][0]['primitives']:
        name = document['materials'][primitive['material']]['name']
        result[name] = (
            POST.accessor(document, binary, primitive['attributes']['POSITION']),
            POST.accessor(document, binary, primitive['attributes']['NORMAL']),
            [row[0] for row in POST.accessor(document, binary, primitive['indices'])],
        )
    return document, result


def axial_hits(geometry, x, y):
    """Intersect an outward-to-inward Z ray using independently projected barycentrics."""
    vertices, _, indices = geometry
    hits = []
    for i in range(0, len(indices), 3):
        a, b, c = [vertices[indices[i + k]] for k in range(3)]
        denominator = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(denominator) < 1e-12:
            continue
        u = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / denominator
        v = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / denominator
        if min(u, v, 1 - u - v) >= -1e-9:
            hits.append(u * a[2] + v * b[2] + (1 - u - v) * c[2])
    return hits


class PostAperture(unittest.TestCase):
    def test_all_caps_keep_source_materials_and_open_both_real_lenses(self):
        for cap, pin in POST.PINS.items():
            with self.subTest(cap=cap):
                old_path = ROOT / f'assets/runtime/ship-study/wayfarer-authored-r001/glb/int/post/int.post.{cap}.glb'
                new_path = ROOT / f'assets/runtime/ship-study/wayfarer-details-r001/int.post.{cap}.aperture.glb'
                self.assertEqual(hashlib.sha256(old_path.read_bytes()).hexdigest(), pin)
                old_doc, old = primitives(old_path)
                new_doc, new = primitives(new_path)
                self.assertEqual(new_doc['materials'], old_doc['materials'])
                self.assertEqual(new_doc['nodes'], old_doc['nodes'])
                for name in old.keys() - {'trim', 'dark'}:
                    self.assertEqual(new[name], old[name])
                # Witness the original coincident opaque surfaces which hid the lens.
                self.assertAlmostEqual(max(axial_hits(old['trim'], 0, 0.46)), 0.262, places=6)
                self.assertAlmostEqual(max(axial_hits(old['dark'], 0, 0.46)), 0.262, places=6)
                for x in (-0.018, 0, 0.018):
                    for y in (0.34, 0.46, 0.58):
                        self.assertEqual(axial_hits(new['trim'], x, y), [])
                        dark = axial_hits(new['dark'], x, y)
                        lens = axial_hits(new['emit_b'], x, y)
                        self.assertLess(max(dark), max(lens) - 0.005)
                        self.assertGreater(min(dark), min(lens) + 0.005)
                # Surrounding rails remain material geometry, not a render-depth offset.
                self.assertTrue(axial_hits(new['trim'], 0.06, 0.46))
                self.assertTrue(axial_hits(new['trim'], 0, 0.75))


if __name__ == '__main__':
    unittest.main()
