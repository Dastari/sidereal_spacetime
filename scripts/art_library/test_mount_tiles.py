"""Binary GLB contract tests; standard library only, no Blender dependency.

Run: python3 -m unittest scripts.art_library.test_mount_tiles
Reads actual POSITION/index buffers, not just exporter-supplied bounds.
"""

import hashlib
import json
import math
from pathlib import Path
import struct
import unittest

ROOT = Path(__file__).resolve().parents[2]
DIRECTORY = ROOT / "assets/runtime/ship-kit/r002"
SPECS = {
    "mount.fixed.sm": (1, 0.25, 1500),
    "mount.fixed.md": (2, 0.25, 1500),
    "mount.fixed.lg": (3, 0.25, 3000),
    "mount.fixed.xl": (4, 0.25, 3000),
    "mount.turret.md": (2, 0.375, 1500),
    "mount.turret.lg": (3, 0.375, 3000),
    "mount.turret.xl": (4, 0.375, 3000),
}
SLOTS = ["primary", "secondary", "accent", "trim", "metal", "dark", "emit_a", "emit_b", "glass"]
EPSILON = 1e-6


class MountTileTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.raw = (DIRECTORY / "mount-tiles.glb").read_bytes()
        magic, version, length = struct.unpack_from("<4sII", cls.raw)
        assert (magic, version, length) == (b"glTF", 2, len(cls.raw))
        json_length, chunk_type = struct.unpack_from("<II", cls.raw, 12)
        assert chunk_type == 0x4E4F534A
        cls.doc = json.loads(cls.raw[20:20+json_length])
        binary_length, binary_type = struct.unpack_from("<II", cls.raw, 20+json_length)
        assert binary_type == 0x004E4942
        cls.binary = cls.raw[28+json_length:28+json_length+binary_length]
        assert len(cls.binary) == binary_length
        cls.entries = json.loads((DIRECTORY / "manifest.json").read_text())["pieces"]
        cls.nodes = {n["name"]: n for n in cls.doc["nodes"]}

    def accessor(self, index):
        acc = self.doc["accessors"][index]
        self.assertNotIn("sparse", acc)
        self.assertFalse(acc.get("normalized", False))
        view = self.doc["bufferViews"][acc["bufferView"]]
        self.assertEqual(view["buffer"], 0)
        code = {5121: "B", 5123: "H", 5125: "I", 5126: "f"}[acc["componentType"]]
        width = {"SCALAR": 1, "VEC3": 3}[acc["type"]]
        fmt = "<"+code*width
        stride = view.get("byteStride", struct.calcsize(fmt))
        offset = view.get("byteOffset", 0)+acc.get("byteOffset", 0)
        end = offset + (acc["count"]-1)*stride + struct.calcsize(fmt)
        self.assertLessEqual(end, view.get("byteOffset", 0)+view["byteLength"])
        return [struct.unpack_from(fmt, self.binary, offset+i*stride) for i in range(acc["count"])]

    def primitives(self, name):
        return self.doc["meshes"][self.nodes[name]["mesh"]]["primitives"]

    def test_bundle_structure_and_identity_frames(self):
        self.assertEqual(set(self.nodes), set(SPECS))
        self.assertEqual(len(self.doc["nodes"]), 7)
        self.assertEqual(len(self.doc["meshes"]), 7)
        self.assertEqual(set(self.doc["scenes"][self.doc.get("scene", 0)]["nodes"]), set(range(7)))
        self.assertLess(len(self.raw), 1_000_000)
        self.assertFalse(self.doc.get("images"))
        self.assertFalse(self.doc.get("textures"))
        for node in self.nodes.values():
            self.assertIn("mesh", node)
            self.assertFalse(node.get("children"))
            self.assertEqual(node.get("translation", [0, 0, 0]), [0, 0, 0])
            self.assertEqual(node.get("rotation", [0, 0, 0, 1]), [0, 0, 0, 1])
            self.assertEqual(node.get("scale", [1, 1, 1]), [1, 1, 1])
            self.assertEqual(node.get("matrix", [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
                             [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])

    def test_material_slots(self):
        names = [m["name"] for m in self.doc["materials"]]
        self.assertEqual(len(names), len(set(names)))
        self.assertTrue(set(names) <= set(SLOTS))
        for name in SPECS:
            used = {names[p["material"]] for p in self.primitives(name)}
            self.assertIn("emit_a", used)
            self.assertIn("accent", used)
            self.assertEqual(self.entries[name]["slots"], sorted(used, key=SLOTS.index))

    def test_geometry_bounds_budgets_and_interface(self):
        for name, (size, top, budget) in SPECS.items():
            with self.subTest(piece=name):
                positions, triangles, top_area = [], 0, 0.0
                for primitive in self.primitives(name):
                    self.assertEqual(primitive.get("mode", 4), 4)
                    vertices = self.accessor(primitive["attributes"]["POSITION"])
                    self.assertTrue(all(math.isfinite(c) for v in vertices for c in v))
                    indices = [v[0] for v in self.accessor(primitive["indices"])]
                    self.assertEqual(len(indices) % 3, 0)
                    self.assertLess(max(indices), len(vertices))
                    positions.extend(vertices)
                    triangles += len(indices)//3
                    for i in range(0, len(indices), 3):
                        a, b, c = [vertices[j] for j in indices[i:i+3]]
                        if all(abs(v[1]-top) < EPSILON for v in (a, b, c)):
                            top_area += abs((b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]))/2
                lo = [min(p[i] for p in positions) for i in range(3)]
                hi = [max(p[i] for p in positions) for i in range(3)]
                # glTF frame: X right, Y up, -Z is front.
                for axis in (0, 2):
                    self.assertGreaterEqual(lo[axis], -size/2-EPSILON)
                    self.assertLessEqual(hi[axis], size/2+EPSILON)
                    self.assertAlmostEqual(lo[axis], -size/2, places=5)
                    self.assertAlmostEqual(hi[axis], size/2, places=5)
                self.assertAlmostEqual(lo[1], 0, places=6)
                self.assertAlmostEqual(hi[1], top, places=6)
                self.assertGreater(top_area, size*size*0.15, "missing usable flat interface")
                self.assertGreater(triangles, 0)
                self.assertLessEqual(triangles, budget)
                entry = self.entries[name]
                self.assertEqual(entry["triangles"], triangles)
                actual = [v*16 for v in (lo[0], -hi[2], lo[1], hi[0], -lo[2], hi[1])]
                for expected, value in zip(entry["bounds"], actual):
                    self.assertAlmostEqual(expected, value, places=5)

    def test_direction_cues_point_to_positive_blender_y(self):
        for name, (size, _, _) in SPECS.items():
            with self.subTest(piece=name):
                for primitive in self.primitives(name):
                    slot = self.doc["materials"][primitive["material"]]["name"]
                    vertices = self.accessor(primitive["attributes"]["POSITION"])
                    if slot == "accent":
                        # The only accent is the front chevron; +Y -> glTF -Z.
                        self.assertTrue(all(v[2] < 0 for v in vertices))
                    if slot == "emit_a" and ".fixed." in name:
                        self.assertTrue(all(v[2] <= -size/2 + 1/16 + EPSILON for v in vertices))

    def test_manifest_hash_and_node_mapping(self):
        sha = hashlib.sha256(self.raw).hexdigest()
        for name in SPECS:
            with self.subTest(piece=name):
                entry = self.entries[name]
                self.assertEqual(entry["node"], name)
                self.assertEqual(entry["sha256"], sha)
                self.assertEqual(entry["file"], "mount-tiles.glb")
                self.assertEqual(entry["decals"], [])
                self.assertIs(entry["voxelAligned"], False)
                self.assertEqual(set(entry), {"bounds", "decals", "file", "node", "sha256", "slots", "triangles", "voxelAligned"})


if __name__ == "__main__":
    unittest.main()
