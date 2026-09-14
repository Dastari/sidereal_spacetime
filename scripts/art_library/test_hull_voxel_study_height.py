"""Standalone exact geometry tests; no Blender or running services needed."""

from fractions import Fraction
import unittest

from hull_voxel_study_height import height_study_layouts, panel_layout


class HeightStudyTests(unittest.TestCase):
    def test_primary_heights_cover_each_cell_exactly(self):
        layouts = height_study_layouts(False)
        self.assertEqual([p["height_m"] for p in layouts], [0.75, 1.5, 2.25, 3.0])
        self.assertEqual([p["cell_counts_xyz"] for p in layouts],
                         [[4, 32, 12], [4, 32, 24], [4, 32, 36], [4, 32, 48]])
        for layout in layouts:
            covered = []
            for course in layout["courses"]:
                covered.extend(range(course["cell_start"], course["cell_end"]))
                for boundary in (course["z_min_m"], course["z_max_m"]):
                    self.assertEqual((Fraction(boundary) / Fraction(layout["cell_m"])).denominator, 1)
            self.assertEqual(covered, list(range(layout["cell_counts_xyz"][2])))
            self.assertEqual(layout["course_boundaries_m"][0], 0)
            self.assertEqual(layout["course_boundaries_m"][-1], layout["height_m"])

    def test_cap_detail_and_texture_dimensions_do_not_scale(self):
        for layout in height_study_layouts():
            self.assertEqual(layout["courses"][0]["height_m"], 0.125)
            self.assertEqual(layout["courses"][-1]["height_m"], 0.125)
            for course in layout["courses"]:
                self.assertEqual(course["mesh_scale"], [1, 1, 1])
                self.assertEqual(course["texture_units_per_m"], 1)
                self.assertEqual(course["texture_origin_m"], [0, 0, 0])
                if course["kind"] == "repeat":
                    self.assertEqual(course["height_m"], 0.25)

    def test_intermediate_height_has_exact_new_fill_not_stretched_course(self):
        layout = panel_layout(1.8125)
        self.assertEqual(layout["cell_counts_xyz"][2], 29)
        fill = [course for course in layout["courses"] if course["kind"] == "fill"]
        self.assertEqual(len(fill), 1)
        self.assertEqual(fill[0]["height_m"], 0.0625)
        self.assertEqual(fill[0]["cell_end"] - fill[0]["cell_start"], 1)

    def test_common_frames_mate_adjacent_and_stacked_panels(self):
        for a in height_study_layouts():
            self.assertEqual(a["frames"]["attachment"]["position_m"], [0, 0, 0])
            for b in height_study_layouts():
                right = a["frames"]["right_base"]
                left = b["frames"]["left_base"]
                translated_left = [left["position_m"][0], left["position_m"][1] + 2,
                                   left["position_m"][2]]
                self.assertEqual(right["position_m"], translated_left)
                self.assertEqual(right["normal"], [-v for v in left["normal"]])
                top = a["frames"]["top"]["position_m"]
                bottom = b["frames"]["bottom"]["position_m"]
                self.assertEqual(top, [bottom[0], bottom[1], bottom[2] + a["height_m"]])
                # Every shared side voxel row has identical physical Z boundaries.
                rows = min(a["cell_counts_xyz"][2], b["cell_counts_xyz"][2])
                self.assertEqual([i * a["cell_m"] for i in range(rows + 1)],
                                 [i * b["cell_m"] for i in range(rows + 1)])

    def test_half_cell_height_requires_explicit_finer_tier(self):
        with self.assertRaisesRegex(ValueError, "select the finer 1/32 m tier explicitly"):
            panel_layout(1.78125)
        fine = panel_layout(1.78125, cell_m=1 / 32)
        self.assertEqual(fine["height_m"], 1.78125)
        self.assertEqual(fine["cell_counts_xyz"], [8, 64, 57])
        with self.assertRaises(ValueError):
            panel_layout(1.8, cell_m=1 / 32)
        with self.assertRaises(ValueError):
            panel_layout(1.5, cell_m=0.1)
        with self.assertRaises(ValueError):
            panel_layout(float("nan"))


if __name__ == "__main__":
    unittest.main()
