"""Contract checks for the exported prefab-ship kit (no Blender needed).

The exporter (ship_kit_export.py) runs inside Blender; these tests check its committed output against the
canonical TypeScript-owned piece list: every spec exported, manifest shape, hashes, triangle counts and
material names read straight from each GLB's JSON chunk.
"""
import hashlib
import json
import struct
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PIECES = ROOT / "packages/content/src/ship-kit-pieces.v1.json"
KIT = ROOT / "assets/runtime/ship-kit/r001"
SLOTS = ["primary", "secondary", "accent", "trim", "metal", "dark", "emit_a", "emit_b", "glass"]


def glb(path):
    data = path.read_bytes()
    if data.startswith(b"version https://git-lfs"):
        return None, data
    magic, _v, length = struct.unpack_from("<III", data, 0)
    assert magic == 0x46546C67 and length == len(data), f"{path.name}: not a complete GLB"
    clen, ctype = struct.unpack_from("<II", data, 12)
    assert ctype == 0x4E4F534A
    return json.loads(data[20:20 + clen]), data


@unittest.skipUnless((KIT / "manifest.json").exists() and PIECES.exists(), "ship kit not exported")
class ShipKitExportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.specs = json.loads(PIECES.read_text())
        cls.manifest = json.loads((KIT / "manifest.json").read_text())

    def test_manifest_header_matches_the_piece_list(self):
        m = self.manifest
        self.assertEqual(m["schema"], "sidereal.ship-kit-manifest.v1")
        self.assertEqual(m["revision"], self.specs["revision"])
        self.assertEqual(m["slots"], SLOTS)
        self.assertEqual(self.specs["slots"], SLOTS)
        self.assertIn("glTF Y-up", m["frame"])

    def test_every_spec_is_exported_once_and_nothing_else(self):
        ids = [p["id"] for p in self.specs["pieces"]]
        self.assertEqual(sorted(ids), sorted(self.manifest["pieces"]))
        self.assertEqual(list(self.manifest["pieces"]), sorted(self.manifest["pieces"]))
        self.assertEqual(sorted(p.name for p in KIT.glob("*.glb")), sorted(f"{i}.glb" for i in ids))

    def test_entries_are_well_formed_and_voxel_aligned(self):
        for pid, e in self.manifest["pieces"].items():
            with self.subTest(pid):
                self.assertEqual(e["file"], f"{pid}.glb")
                self.assertTrue(e["voxelAligned"])
                self.assertEqual(len(e["bounds"]), 6)
                self.assertTrue(all(e["bounds"][i] < e["bounds"][i + 3] for i in range(3)))
                self.assertTrue(e["slots"] and set(e["slots"]) <= set(SLOTS))
                self.assertEqual(e["slots"], sorted(e["slots"], key=SLOTS.index))
                for d in e["decals"]:
                    self.assertIn(d["plane"], ("face", "top"))
                    self.assertEqual(len(d["rect"]), 4)

    def test_glbs_match_hashes_triangles_and_slot_materials(self):
        for pid, e in self.manifest["pieces"].items():
            g, data = glb(KIT / e["file"])
            if g is None:
                self.skipTest("GLBs are Git LFS pointers in this checkout")
            with self.subTest(pid):
                self.assertEqual(hashlib.sha256(data).hexdigest(), e["sha256"])
                names = [m["name"] for m in g["materials"]]
                self.assertEqual(names, e["slots"])
                self.assertFalse(any(m.get("doubleSided") for m in g["materials"]))
                for key in ("cameras", "images", "textures", "animations", "skins"):
                    self.assertNotIn(key, g)
                self.assertEqual(len(g["meshes"]), 1)
                tris = 0
                for prim in g["meshes"][0]["primitives"]:
                    n = g["accessors"][prim["indices"]]["count"] // 3
                    self.assertGreater(n, 0)
                    tris += n
                self.assertEqual(tris, e["triangles"])


if __name__ == "__main__":
    unittest.main()
