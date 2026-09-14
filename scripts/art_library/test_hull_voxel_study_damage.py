"""Run with python3 -m unittest discover -s scripts/art_library -p test_hull_voxel_study_damage.py."""

from collections import Counter
import unittest

from hull_voxel_study_damage import CELL_SIZE, core_cells, damage_cells, mesh_cells


class HullStudyDamageTests(unittest.TestCase):
    def test_conservation_and_monotonic_damage(self):
        original = {cell: (cell[2] // 4) % 3 for cell in core_cells()}
        previous = set()
        for state in ("intact", "breach", "explosive"):
            result = damage_cells(original, state)
            self.assertFalse(result.retained.keys() & result.removed.keys())
            self.assertEqual(original, result.retained | result.removed)
            self.assertTrue(previous <= result.removed.keys())
            previous = result.removed.keys()
            self.assertEqual(result, damage_cells(original, state))

    def test_breach_is_through_thickness_with_real_core_faces(self):
        original = core_cells(material=2)
        damaged = damage_cells(original, "breach", (0, 24))
        for x in range(4):
            self.assertIn((x, 0, 24), damaged.removed)
        mesh = mesh_cells(damaged.retained, original, core_material=7)
        self.assertTrue(any(mesh.freshly_exposed))
        self.assertEqual({7}, {m for m, fresh in zip(mesh.material_indices, mesh.freshly_exposed) if fresh})
        self.assertEqual({2}, {m for m, fresh in zip(mesh.material_indices, mesh.freshly_exposed) if not fresh})
        self.assertTrue(all(m in (2, 7) for m in mesh.material_indices))

    def test_all_heights_closed_welded_and_exact_lattice(self):
        for height in (.75, 1.5, 2.25, 3.0):
            original = core_cells(height)
            for state in ("intact", "breach", "explosive"):
                with self.subTest(height=height, state=state):
                    retained = damage_cells(original, state).retained
                    mesh = mesh_cells(retained, original)
                    self.assertEqual(len(mesh.vertices), len(set(mesh.vertices)))
                    self.assertEqual(0, min(v[2] for v in mesh.vertices))
                    self.assertEqual(height, max(v[2] for v in mesh.vertices))
                    self.assertTrue(all(value / CELL_SIZE == round(value / CELL_SIZE) for v in mesh.vertices for value in v))
                    edges = Counter()
                    directed_edges = Counter()
                    unique_faces = set()
                    for face in mesh.faces:
                        key = tuple(sorted(face))
                        self.assertNotIn(key, unique_faces)
                        unique_faces.add(key)
                        for a, b in zip(face, face[1:] + face[:1]):
                            edges[tuple(sorted((a, b)))] += 1
                            directed_edges[(a, b)] += 1
                    self.assertEqual({2}, set(edges.values()))
                    self.assertTrue(all(directed_edges[(b, a)] == count for (a, b), count in directed_edges.items()))
                    self.assertLess(len(mesh.faces), 20_000)
                    signed_volume = 0.0
                    for face in mesh.faces:
                        a, b, c, d = [mesh.vertices[i] for i in face]
                        for p, q, r in ((a, b, c), (a, c, d)):
                            cross = (q[1] * r[2] - q[2] * r[1], q[2] * r[0] - q[0] * r[2], q[0] * r[1] - q[1] * r[0])
                            signed_volume += sum(p[i] * cross[i] for i in range(3)) / 6
                    self.assertAlmostEqual(len(retained) * CELL_SIZE ** 3, signed_volume)

    def test_fixed_cell_and_uv_scale_at_every_height(self):
        for height in (.75, 1.5, 2.25, 3.0):
            mesh = mesh_cells(core_cells(height))
            for uv in mesh.uvs:
                self.assertEqual(CELL_SIZE, max(v[0] for v in uv) - min(v[0] for v in uv))
                self.assertEqual(CELL_SIZE, max(v[1] for v in uv) - min(v[1] for v in uv))

    def test_rejects_unaligned_height_and_mutated_material(self):
        with self.assertRaises(ValueError):
            core_cells(.8)
        with self.assertRaises(ValueError):
            mesh_cells({(0, 0, 0): 2}, {(0, 0, 0): 1})
        with self.assertRaises(ValueError):
            mesh_cells(core_cells(), max_faces=10)


if __name__ == "__main__":
    unittest.main()
