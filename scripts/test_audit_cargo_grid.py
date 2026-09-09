import json
import math
from pathlib import Path
import struct
import tempfile
import unittest
from audit_cargo_grid import glb_bounds, proposed_reservation, multiply, node_matrix, transform, IDENTITY, ROOT


class CargoAuditTests(unittest.TestCase):
    def test_scene_transforms_and_author_axes_are_applied_to_vertices(self):
        vertices = struct.pack('<ffffff', 0, 0, 0, 1, 2, 3)
        scene = {'asset': {'version': '2.0'}, 'scene': 0,
                 'scenes': [{'nodes': [0]}],
                 'nodes': [{'translation': [10, 20, 30], 'children': [1]},
                           {'mesh': 0, 'scale': [2, 3, 4]}],
                 'meshes': [{'primitives': [{'attributes': {'POSITION': 0}}]}],
                 'accessors': [{'bufferView': 0, 'componentType': 5126, 'count': 2, 'type': 'VEC3'}],
                 'bufferViews': [{'buffer': 0, 'byteLength': len(vertices)}],
                 'buffers': [{'byteLength': len(vertices)}]}
        metadata = json.dumps(scene).encode()
        metadata += b' ' * (-len(metadata) % 4)
        data = struct.pack('<III', 0x46546c67, 2, 28+len(metadata)+len(vertices))
        data += struct.pack('<II', len(metadata), 0x4e4f534a)+metadata
        data += struct.pack('<II', len(vertices), 0x004e4942)+vertices
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'sample.glb'
            path.write_bytes(data)
            self.assertEqual(glb_bounds(path), {'min': [10, -42, 20], 'max': [12, -30, 26]})

    def test_quaternion_and_column_major_matrix_composition(self):
        rotate = node_matrix({'rotation': [0, 0, math.sqrt(.5), math.sqrt(.5)]})
        matrix = multiply(node_matrix({'translation': [3, 4, 5]}), rotate)
        p = transform(matrix, [1, 0, 0])
        for a, b in zip(p, [3, 5, 5]):
            self.assertAlmostEqual(a, b)
        self.assertEqual(multiply(IDENTITY, matrix), matrix)

    def test_half_metre_reservation_does_not_silently_fit_a_4_011m_visual_in_4m(self):
        self.assertEqual(proposed_reservation({'min': [-.9705, -2, 0], 'max': [.9705, 2.0111, 1.92]}), [2, 4.5])
        self.assertEqual(proposed_reservation({'min': [-.5, -.5, 0], 'max': [.5, .5, 1]}), [1, 1])
        with self.assertRaises(ValueError):
            proposed_reservation({'min': [0, 0, 0], 'max': [math.nan, 1, 1]})

    def test_committed_exact73_audit_makes_no_false_stacking_qualification(self):
        report = json.loads((ROOT/'docs/handoffs/cargo_grid_model_audit.json').read_text())
        rows = report['rows']
        self.assertEqual(len(rows), 73)
        self.assertEqual(len({r['assetId'] for r in rows}), 73)
        self.assertTrue(all(r['authoredValidationMaximumDeltaM'] < 1e-5 for r in rows))
        self.assertTrue(all(not r['authorityInterfaceQualified'] for r in rows))
        self.assertTrue(all(not r['filledStackingApproved'] for r in rows))
        self.assertTrue(all(not r['pitchFitsExisting32UnitsPerMetre'] for r in rows))


if __name__ == '__main__':
    unittest.main()
