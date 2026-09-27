"""Contract checks for the exported prefab-ship kit (no Blender needed).

The exporter (ship_kit_export.py) runs inside Blender; these tests check its committed output against the
canonical TypeScript-owned piece list: every spec exported, manifest shape, hashes, triangle counts and
material names read straight from each GLB's JSON chunk.

Kit r002 stores two kinds of piece:
- one GLB per piece (file == "<id>.glb"), hashed per file;
- the Blender bow family (family "bow"), stored as named nodes inside a few bundle GLBs
  (entry "file" is the bundle, entry "node" is the piece id), hashed per bundle.
Grid snap (voxelAligned) is mandatory except for Blender-authored geometry: the bow family and the
swept Blender module builders (ship_kit_modules.BUILDERS and their "_upright" variants).
"""
import hashlib
import json
import struct
import unittest
from pathlib import Path

import ship_kit_modules

ROOT = Path(__file__).resolve().parents[2]
PIECES = ROOT / "packages/content/src/ship-kit-pieces.v1.json"
KIT = ROOT / "assets/runtime/ship-kit/r002"
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


BLENDER_BUILDERS = set(ship_kit_modules.BUILDERS) | {b + "_upright" for b in ship_kit_modules.BUILDERS}


def primitives_triangles_and_materials(g, mesh_index):
    tris, used = 0, []
    for prim in g["meshes"][mesh_index]["primitives"]:
        n = g["accessors"][prim["indices"]]["count"] // 3
        assert n > 0, "empty primitive"
        tris += n
        name = g["materials"][prim["material"]]["name"]
        if name not in used:
            used.append(name)
    return tris, used


@unittest.skipUnless((KIT / "manifest.json").exists() and PIECES.exists(), "ship kit not exported")
class ShipKitExportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.specs = json.loads(PIECES.read_text())
        cls.manifest = json.loads((KIT / "manifest.json").read_text())
        cls.by_id = {p["id"]: p for p in cls.specs["pieces"]}
        cls.bundled = {pid: e for pid, e in cls.manifest["pieces"].items() if "node" in e}
        cls.single = {pid: e for pid, e in cls.manifest["pieces"].items() if "node" not in e}

    def test_manifest_header_matches_the_piece_list(self):
        m = self.manifest
        self.assertEqual(m["schema"], "sidereal.ship-kit-manifest.v1")
        self.assertEqual(m["revision"], self.specs["revision"])
        self.assertEqual(KIT.name, self.specs["revision"])
        self.assertEqual(m["slots"], SLOTS)
        self.assertEqual(self.specs["slots"], SLOTS)
        self.assertIn("glTF Y-up", m["frame"])

    def test_every_spec_is_exported_once_and_nothing_else(self):
        ids = [p["id"] for p in self.specs["pieces"]]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(sorted(ids), sorted(self.manifest["pieces"]))
        self.assertEqual(list(self.manifest["pieces"]), sorted(self.manifest["pieces"]))
        bundles = {e["file"] for e in self.bundled.values()}
        expected = {f"{pid}.glb" for pid in self.single} | bundles
        self.assertEqual(sorted(p.name for p in KIT.glob("*.glb")), sorted(expected))

    def test_only_the_bow_family_is_bundled(self):
        for pid, e in self.manifest["pieces"].items():
            with self.subTest(pid):
                if self.by_id[pid]["family"] == "bow":
                    self.assertEqual(e.get("node"), pid)
                    self.assertRegex(e["file"], r"^bow-[a-z]+\.glb$")
                else:
                    self.assertNotIn("node", e)
                    self.assertEqual(e["file"], f"{pid}.glb")

    def test_entries_are_well_formed_and_voxel_aligned(self):
        for pid, e in self.manifest["pieces"].items():
            spec = self.by_id[pid]
            with self.subTest(pid):
                if spec["family"] != "bow" and spec["builder"] not in BLENDER_BUILDERS:
                    self.assertTrue(e["voxelAligned"], "grid snap is mandatory for non-Blender pieces")
                self.assertEqual(len(e["bounds"]), 6)
                self.assertTrue(all(e["bounds"][i] < e["bounds"][i + 3] for i in range(3)))
                self.assertTrue(e["slots"] and set(e["slots"]) <= set(SLOTS))
                self.assertEqual(e["slots"], sorted(e["slots"], key=SLOTS.index))
                self.assertGreater(e["triangles"], 0)
                for d in e["decals"]:
                    self.assertIn(d["plane"], ("face", "top"))
                    self.assertEqual(len(d["rect"]), 4)

    def assert_clean_gltf(self, g):
        self.assertFalse(any(m.get("doubleSided") for m in g["materials"]))
        for key in ("cameras", "images", "textures", "animations", "skins"):
            self.assertNotIn(key, g)

    def test_single_piece_glbs_match_hashes_triangles_and_slot_materials(self):
        for pid, e in self.single.items():
            g, data = glb(KIT / e["file"])
            if g is None:
                self.skipTest("GLBs are Git LFS pointers in this checkout")
            with self.subTest(pid):
                self.assertEqual(hashlib.sha256(data).hexdigest(), e["sha256"])
                names = [m["name"] for m in g["materials"]]
                if self.by_id[pid]["builder"] in BLENDER_BUILDERS:
                    # Blender orders material slots itself; membership must still match exactly.
                    self.assertEqual(len(names), len(set(names)))
                    self.assertEqual(sorted(names, key=SLOTS.index), e["slots"])
                else:
                    self.assertEqual(names, e["slots"])
                self.assert_clean_gltf(g)
                self.assertEqual(len(g["meshes"]), 1)
                tris, _used = primitives_triangles_and_materials(g, 0)
                self.assertEqual(tris, e["triangles"])

    def test_bundles_match_hashes_and_every_catalog_node(self):
        by_file = {}
        for pid, e in self.bundled.items():
            by_file.setdefault(e["file"], {})[pid] = e
        for file, entries in sorted(by_file.items()):
            g, data = glb(KIT / file)
            if g is None:
                self.skipTest("GLBs are Git LFS pointers in this checkout")
            with self.subTest(file):
                digest = hashlib.sha256(data).hexdigest()
                self.assertEqual({e["sha256"] for e in entries.values()}, {digest})
                self.assert_clean_gltf(g)
                nodes = {n["name"]: n for n in g["nodes"] if "name" in n}
                self.assertEqual(len(nodes), len(g["nodes"]), "every bundle node is named")
                missing = sorted(set(entries) - set(nodes))
                self.assertEqual(missing, [], "catalog bow pieces missing from the bundle")
                self.assertEqual(sorted(set(nodes) - set(entries)), [], "bundle nodes not in the catalog")
            for pid, e in entries.items():
                with self.subTest(pid):
                    node = nodes.get(pid)
                    self.assertIsNotNone(node)
                    self.assertIn("mesh", node)
                    tris, used = primitives_triangles_and_materials(g, node["mesh"])
                    self.assertEqual(tris, e["triangles"])
                    self.assertEqual(sorted(used, key=SLOTS.index), e["slots"])


if __name__ == "__main__":
    unittest.main()
