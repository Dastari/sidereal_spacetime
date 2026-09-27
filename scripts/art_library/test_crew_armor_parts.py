"""Unit tests for the crew armour kit definitions and fit checks (pure python, no Blender)."""
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import crew_armor_fit as F  # noqa: E402
import crew_armor_parts as K  # noqa: E402


class CrewArmorKitTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.parts = K.build_catalog()
        cls.by = {p.id: p for p in cls.parts}

    def test_catalog_is_valid_and_covers_every_slot_and_tier(self):
        self.assertTrue(K.validate(self.parts))
        for slot in K.EQUIPMENT_SLOTS:
            tiers = {p.tier for p in self.parts if p.slot == slot}
            self.assertEqual(tiers, {0, 1, 2, 3}, slot)

    def test_ten_roster_roles_plus_stretch_presets(self):
        self.assertEqual(len(K.ROSTER_ROLES), 10)
        self.assertIn("role.civilian", {p["id"] for p in K.PRESETS})

    def test_paired_parts_are_exact_mirrors_and_stay_on_their_side(self):
        for p in self.parts:
            for vols in p.fits.values():
                for bone, v in vols.items():
                    if bone.endswith(".R"):
                        self.assertTrue(all(x >= 0 for x, _, _ in v.c), (p.id, bone))

    def test_no_visible_z_fighting_against_the_body_or_within_presets(self):
        rep = F.report(self.parts)
        self.assertEqual(rep["totalSingle"], 0, rep["zFightSingle"])
        self.assertEqual(rep["totalPresets"], 0, rep["zFightPresets"])

    def test_hanging_hand_zone_is_clear_of_torso_belt_and_leg_armour(self):
        hand = {(x, y, z) for x in range(7, 14) for y in range(-4, 5) for z in range(15, 22)}   # r004 fist + cuff
        for p in self.parts:
            if p.slot in ("chest", "belt", "legs"):
                for fit, vols in p.fits.items():
                    cells = set().union(*(set(v.c) for b, v in vols.items() if not b.endswith(".L")))
                    self.assertFalse(cells & hand, (p.id, fit))

    def test_armour_replaces_the_default_gear_and_gloves_replace_hands(self):
        for p in self.parts:
            self.assertIn("gear", p.hides, p.id)
            self.assertEqual("hands" in p.hides, p.slot == "gloves", p.id)

    def test_legacy_items_map_to_existing_parts(self):
        for key, v in K.legacy_visual_map().items():
            self.assertIn(v["part"], self.by, key)
            self.assertEqual(self.by[v["part"]].slot, key.rsplit("-", 1)[1])

    def test_heavy_tiers_carry_emissive_accents(self):
        for p in self.parts:
            if p.tier == 3:
                self.assertGreater(F.emissive_surface_share(p), 0.04, p.id)


if __name__ == "__main__":
    unittest.main()
