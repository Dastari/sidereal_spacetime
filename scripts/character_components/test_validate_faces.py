"""Fault-injection tests for the independent face export preservation gate."""
from collections import Counter
import json
import math
from pathlib import Path
import struct
import tempfile
import unittest
import zlib

from validate_faces import Glb, compare_surfaces, geometry, png, valid_data


class FaceValidationTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.serial = 0

    def asset(self, *, order=(0, 1, 2), reverse=False, shift=0, normal_x=0,
              uv_shift=0, material="original", weight_shift=0):
        self.serial += 1
        buffer = bytearray()
        views, accessors = [], []

        def accessor(rows, kind, component):
            buffer.extend(b"\0" * (-len(buffer) % 4))
            offset = len(buffer)
            code = {5121: "B", 5123: "H", 5126: "f"}[component]
            buffer.extend(b"".join(struct.pack("<" + code * len(row), *row) for row in rows))
            views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(buffer) - offset})
            accessors.append({"bufferView": len(views) - 1, "componentType": component, "count": len(rows), "type": kind})
            return len(accessors) - 1

        positions = [(0 + shift, 0, 0), (1, 0, 0), (0, 1, 0)]
        normals = [(normal_x, 0, math.sqrt(1 - normal_x ** 2)), (0, 0, 1), (0, 0, 1)]
        uvs = [(uv_shift, 0), (1, 0), (0, 1)]
        attributes = {
            "POSITION": accessor([positions[i] for i in order], "VEC3", 5126),
            "NORMAL": accessor([normals[i] for i in order], "VEC3", 5126),
            "TEXCOORD_0": accessor([uvs[i] for i in order], "VEC2", 5126),
            "JOINTS_0": accessor([(3, 2, 0, 0)] * 3, "VEC4", 5121),
            "WEIGHTS_0": accessor([(1 - weight_shift, weight_shift, 0, 0)] * 3, "VEC4", 5126),
        }
        original_indices = (0, 2, 1) if reverse else (0, 1, 2)
        indices = accessor([(order.index(i),) for i in original_indices], "SCALAR", 5123)
        document = {
            "asset": {"version": "2.0"}, "buffers": [{"byteLength": len(buffer)}],
            "bufferViews": views, "accessors": accessors,
            "nodes": [{"name": "head" if i == 3 else "joint-" + str(i)} for i in range(16)] + [
                {"name": "test-part", "mesh": 0, "extras": {"component_id": "test"}}],
            "skins": [{"joints": list(range(16))}],
            "materials": [{"name": material}],
            "meshes": [{"primitives": [{"attributes": attributes, "indices": indices, "material": 0}]}],
        }
        encoded = json.dumps(document).encode()
        encoded += b" " * (-len(encoded) % 4)
        buffer.extend(b"\0" * (-len(buffer) % 4))
        raw = struct.pack("<III", 0x46546C67, 2, 28 + len(encoded) + len(buffer))
        raw += struct.pack("<II", len(encoded), 0x4E4F534A) + encoded
        raw += struct.pack("<II", len(buffer), 0x004E4942) + buffer
        path = Path(self.directory.name) / f"test-{self.serial}.glb"
        path.write_bytes(raw)
        return Glb(path)

    def test_accessor_and_index_reordering_preserves_exact_surface(self):
        original = self.asset()
        reordered = self.asset(order=(2, 0, 1))
        self.assertEqual(valid_data(original)["triangles"], 1)
        result = compare_surfaces(geometry(original, "test"), geometry(reordered, "test"))
        self.assertTrue(result["exactDecodedEquality"])

    def test_mesh_name_suffix_does_not_change_component_placement(self):
        original, renamed = self.asset(), self.asset()
        renamed.components["test"]["name"] = "test-part.001"
        self.assertEqual(original.placement(original.components["test"]), renamed.placement(renamed.components["test"]))
        renamed.components["test"]["translation"] = [0, .01, 0]
        self.assertNotEqual(original.placement(original.components["test"]), renamed.placement(renamed.components["test"]))

    def test_explicit_roundoff_is_measured_without_claiming_exact_equality(self):
        result = compare_surfaces(geometry(self.asset(), "test"), geometry(self.asset(shift=5e-7, normal_x=1e-4), "test"))
        self.assertFalse(result["exactDecodedEquality"])
        self.assertAlmostEqual(result["maxPositionDisplacementM"], 5e-7, delta=1e-12)
        self.assertAlmostEqual(result["maxNormalVectorDelta"], 1e-4, delta=1e-9)
        self.assertTrue(result["orientedTrianglesAndFixedAttributesPreserved"])

    def test_flipped_winding_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "Oriented topology"):
            compare_surfaces(geometry(self.asset(), "test"), geometry(self.asset(reverse=True), "test"))

    def test_position_outside_allowance_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "drift exceeds"):
            compare_surfaces(geometry(self.asset(), "test"), geometry(self.asset(shift=2e-6), "test"))

    def test_normal_outside_allowance_is_rejected(self):
        changed = self.asset(normal_x=6e-4)
        valid_data(changed)  # The changed normals remain unit length.
        with self.assertRaisesRegex(ValueError, "drift exceeds"):
            compare_surfaces(geometry(self.asset(), "test"), geometry(changed, "test"))

    def test_material_uv_and_skin_weights_have_no_roundoff_allowance(self):
        for mutation in ({"material": "changed"}, {"uv_shift": 1e-9}, {"weight_shift": 1e-7}):
            with self.subTest(mutation=mutation), self.assertRaisesRegex(ValueError, "Oriented topology"):
                compare_surfaces(geometry(self.asset(), "test"), geometry(self.asset(**mutation), "test"))

    def test_duplicate_or_missing_triangle_is_rejected(self):
        source = geometry(self.asset(), "test")
        duplicated = Counter({key: 2 for key in source})
        with self.assertRaisesRegex(ValueError, "Triangle count changed"):
            compare_surfaces(source, duplicated)

    def test_png_decoder_checks_pixels_and_crc(self):
        pixels = bytes([10, 20, 30, 255, 40, 50, 60, 0])

        def chunk(kind, payload):
            return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload))

        raw = b"\x89PNG\r\n\x1a\n"
        raw += chunk(b"IHDR", struct.pack(">IIBBBBB", 2, 1, 8, 6, 0, 0, 0))
        raw += chunk(b"IDAT", zlib.compress(b"\0" + pixels)) + chunk(b"IEND", b"")
        self.assertEqual(png(raw), (2, 1, pixels))
        corrupted = bytearray(raw)
        corrupted[29] ^= 1
        with self.assertRaisesRegex(ValueError, "CRC mismatch"):
            png(bytes(corrupted))


if __name__ == "__main__":
    unittest.main()
