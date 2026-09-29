"""CHAR-BODY r005 layer hygiene (pure python, no Blender): drawn islands never z-fight.

Owner 2026-09-29: "some kind of white plane cutting through the middle of the character when wearing
nothing ... z-fighting". Every brick island is its own bevelled mesh, so two islands of different
material slots that expose the same face (same cell boundary, same outward direction, nothing drawn in
front of it) z-fight in game. Checked for the layer sets the game draws: nothing equipped
(base + hands) and an equipped uniform (suit + hands), for islands on the same or jointed bones (rest-
pose contacts between unjointed bones, e.g. a hanging hand touching the thigh, move apart in play).
"""
from pathlib import Path
import sys
import types
import unittest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import crew_armor_body_snapshot as stub  # noqa: E402

DIRS = [(1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)]
DRAWN = {"nothing": ("base", "hands"), "uniform": ("suit", "hands")}
JOINTS = {("pelvis", "spine"), ("spine", "chest"), ("chest", "neck"), ("chest", "upper_arm"),
          ("upper_arm", "forearm"), ("forearm", "hand"), ("pelvis", "thigh"), ("thigh", "shin"),
          ("shin", "foot"), ("foot", "toe")}


def load_body():
    module = types.ModuleType("voxkit")
    module.Vol, module.Part = stub.Vol, stub.Part
    saved = {name: sys.modules.get(name) for name in ("voxkit", "body")}
    sys.modules["voxkit"] = module
    sys.modules.pop("body", None)
    sys.path.insert(0, str(HERE / "crew_voxel"))
    try:
        import body  # noqa: E402
        return body
    finally:
        sys.path.remove(str(HERE / "crew_voxel"))
        for name, value in saved.items():
            if value is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = value


def bone_name(bone):
    return bone[:-2] if bone.endswith((".L", ".R")) else bone


def jointed(a, b):
    if a[-2:] != b[-2:] and a.endswith((".L", ".R")) and b.endswith((".L", ".R")):
        return False
    a, b = bone_name(a), bone_name(b)
    return a == b or (a, b) in JOINTS or (b, a) in JOINTS


def z_fights(layers, regions):
    islands = [(bone, vol.c) for region in regions for bone, part in layers[region].items()
               for vol in part.islands]
    occupied = set()
    owners = {}
    for index, (_, cells) in enumerate(islands):
        occupied.update(cells)
        for cell in cells:
            owners.setdefault(cell, []).append(index)
    hits = []
    for cell, owned in owners.items():
        if len(owned) < 2:
            continue
        for d in DIRS:
            if (cell[0] + d[0], cell[1] + d[1], cell[2] + d[2]) in occupied:
                continue
            for i, a in enumerate(owned):
                for b in owned[i + 1:]:
                    (bone_a, cells_a), (bone_b, cells_b) = islands[a], islands[b]
                    if cells_a[cell] != cells_b[cell] and jointed(bone_a, bone_b):
                        hits.append((bone_a, cells_a[cell], bone_b, cells_b[cell], cell, d))
    return hits


class CrewBodyLayerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.body = load_body()

    def test_drawn_layers_expose_no_coincident_faces_of_different_slots(self):
        for variant in ("male", "female"):
            layers, _hair = self.body.build(variant)
            for name, regions in DRAWN.items():
                hits = z_fights(layers, regions)
                self.assertEqual(hits, [], f"{variant} {name}: {hits[:6]}")

    def test_waistband_sits_on_the_privacy_shorts(self):
        for variant in ("male", "female"):
            layers, _hair = self.body.build(variant)
            shorts, band = layers["base"]["pelvis"].islands[:2]
            self.assertEqual({s for s in band.c.values()}, {"metal"})
            self.assertFalse(set(shorts.c) & set(band.c), variant)
            self.assertEqual(max(z for _, _, z in shorts.c) + 1, min(z for _, _, z in band.c))


if __name__ == "__main__":
    unittest.main()
