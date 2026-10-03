"""Byte/geometry qualification independent of Blender's authoring mesh state."""
import importlib.util
import json
import math
import struct
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("kit_builder", Path(__file__).with_name("build_authored_template_kit.py"))
BUILDER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BUILDER)
BASE = ROOT / "assets/runtime/ship-study/template-authored-r001"


def accessor(doc, binary, index):
    a = doc["accessors"][index]
    view = doc["bufferViews"][a["bufferView"]]
    width = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[a["type"]]
    fmt = {5121: "B", 5123: "H", 5125: "I", 5126: "f"}[a["componentType"]]
    packed = struct.Struct("<" + fmt * width)
    start = view.get("byteOffset", 0) + a.get("byteOffset", 0)
    stride = view.get("byteStride", packed.size)
    return [packed.unpack_from(binary, start + i * stride) for i in range(a["count"])]


def point_inside(point, polygon, epsilon=2e-5):
    x, y = point
    inside = False
    for a, b in zip(polygon, polygon[1:] + polygon[:1]):
        dx, dy = b[0] - a[0], b[1] - a[1]
        length2 = dx * dx + dy * dy
        t = max(0, min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / length2))
        if math.hypot(x - a[0] - t * dx, y - a[1] - t * dy) <= epsilon:
            return True
        if (a[1] > y) != (b[1] > y) and x < a[0] + (y - a[1]) * dx / dy:
            inside = not inside
    return inside


class NativeKitQualification(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = json.loads((BASE / "manifest.json").read_text())

    def test_source_manifest_and_mesh_pins(self):
        for folder, pin in BUILDER.PINS.items():
            self.assertEqual(BUILDER.sha(BUILDER.ARCHIVE / folder / "manifest.json"), pin)
        for piece in self.manifest["pieces"]:
            self.assertEqual(BUILDER.sha(BASE / piece["file"]), piece["sha256"])
            self.assertTrue(piece["source"])
            for source in piece["source"]:
                if source["collection"] == "wayfarer-details-r001":
                    path = ROOT / "assets/runtime/ship-study" / source["collection"] / source["file"]
                else:
                    path = BUILDER.ARCHIVE / source["collection"] / source["file"]
                self.assertEqual(BUILDER.sha(path), source["sha256"])

    def test_duplicate_source_slot_names_preserve_distinct_native_parameters(self):
        palette = {"secondary": {"family": "plastic-light", "kind": "slot", "colour": [.6, .6, .6], "strength": 0}}
        identical = {"pbrMetallicRoughness": {"baseColorFactor": [.6, .6, .6, 1], "roughnessFactor": .4}}
        distinct = {"pbrMetallicRoughness": {"baseColorFactor": [.2, .3, .6, 1], "roughnessFactor": .7}}
        doc = {"materials": [{"name": "secondary", **identical},
                             {"name": "secondary.001", **identical},
                             {"name": "secondary.002", **distinct}],
               "meshes": [{"primitives": [{"material": i} for i in range(3)]}]}
        BUILDER.canonical_materials(doc, {f"secondary{suffix}": "secondary" for suffix in ("", ".001", ".002")}, palette)
        self.assertEqual(len(doc["materials"]), 2)
        self.assertEqual([p["material"] for p in doc["meshes"][0]["primitives"]], [0, 0, 1])
        self.assertEqual(doc["materials"][0]["pbrMetallicRoughness"], identical["pbrMetallicRoughness"])
        self.assertEqual(doc["materials"][1]["pbrMetallicRoughness"], distinct["pbrMetallicRoughness"])
        self.assertNotEqual(doc["materials"][0]["name"], doc["materials"][1]["name"])
        self.assertEqual(palette[doc["materials"][1]["name"]]["sourceSlotName"], "secondary")

    def test_exported_geometry_is_finite_non_degenerate_and_within_shape(self):
        for piece in self.manifest["pieces"]:
            with self.subTest(piece=piece["id"]):
                doc, chunks = BUILDER.read_glb(BASE / piece["file"])
                binary = next(data for kind, data in chunks if kind == 0x004E4942)
                count = 0
                observed = []
                for mesh in doc["meshes"]:
                    for primitive in mesh["primitives"]:
                        self.assertEqual(primitive.get("mode", 4), 4)
                        positions = accessor(doc, binary, primitive["attributes"]["POSITION"])
                        normals = accessor(doc, binary, primitive["attributes"]["NORMAL"])
                        self.assertTrue(all(math.isfinite(v) for p in positions + normals for v in p))
                        self.assertTrue(all(.98 < math.hypot(*n) < 1.02 for n in normals))
                        self.assertIn("TEXCOORD_0", primitive["attributes"])
                        local = [(x, -z, y) for x, y, z in positions]
                        observed.extend(local)
                        if piece["family"] in ("floor", "roof"):
                            polygon = BUILDER.shape_polygon(piece["shape"])
                            self.assertTrue(all(point_inside(p[:2], polygon) for p in local))
                        indices = [x[0] for x in accessor(doc, binary, primitive["indices"])]
                        self.assertEqual(len(indices) % 3, 0)
                        for i in range(0, len(indices), 3):
                            a, b, c = (positions[n] for n in indices[i:i + 3])
                            u, v = [b[k] - a[k] for k in range(3)], [c[k] - a[k] for k in range(3)]
                            cross = (u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0])
                            self.assertGreater(math.hypot(*cross), 1e-15)
                        count += len(indices) // 3
                self.assertEqual(count, piece["triangles"])
                for axis in range(3):
                    self.assertAlmostEqual(min(p[axis] for p in observed), piece["boundsMin"][axis], places=5)
                    self.assertAlmostEqual(max(p[axis] for p in observed), piece["boundsMax"][axis], places=5)
                if piece["family"] == "wall":
                    self.assertGreaterEqual(piece["boundsMin"][1], -.125001)
                    self.assertLessEqual(piece["boundsMax"][1], .125001)
                if piece["id"].startswith("hull.arc"):
                    radius, concave = piece["radius"], piece["concave"]
                    distances = [math.hypot(p[0], p[1]) for p in observed]
                    if concave:
                        self.assertLessEqual(max(distances), radius + .25001)
                    else:
                        self.assertGreaterEqual(min(distances), radius - .25001)

    def test_native_materials_and_bounded_source_owned_light_descriptors(self):
        lighting = json.loads((BASE / "lighting.json").read_text())
        self.assertEqual(lighting, self.manifest["lighting"])
        by_id = {a["id"]: a for a in lighting["assets"]}
        for piece in self.manifest["pieces"]:
            doc, _ = BUILDER.read_glb(BASE / piece["file"])
            self.assertEqual(len({m["name"] for m in doc["materials"]}), len(doc["materials"]))
            for material in doc["materials"]:
                self.assertEqual(material["extras"]["family"], self.manifest["palette"][material["name"]]["family"])
            asset = by_id[piece["id"]]
            self.assertEqual(asset["sha256"], piece["sha256"])
            self.assertLessEqual(len(asset["sockets"]), 1)
            for socket in asset["sockets"]:
                self.assertLessEqual(socket["intensity"], .5)
                self.assertLessEqual(socket["range"], 2)
            self.assertEqual(piece["qualification"]["openBoundaryEdges"], 0)
            self.assertEqual(piece["qualification"]["zeroAreaTriangles"], 0)

    def test_roof_paint_variants_retain_native_shape_and_uv_coordinates(self):
        def native_vertex_uv(piece_id):
            doc, chunks = BUILDER.read_glb(BASE / f"{piece_id}.glb")
            binary = next(data for kind, data in chunks if kind == 0x004E4942)
            return {tuple(round(v, 6) for v in (*position, *uv))
                    for mesh in doc["meshes"] for primitive in mesh["primitives"]
                    for position, uv in zip(
                        accessor(doc, binary, primitive["attributes"]["POSITION"]),
                        accessor(doc, binary, primitive["attributes"]["TEXCOORD_0"]))}
        for shape in BUILDER.SHAPES:
            with self.subTest(shape=shape):
                original = native_vertex_uv(f"roof.{shape}.plate")
                self.assertEqual(native_vertex_uv(f"roof.{shape}.light"), original)
                self.assertEqual(native_vertex_uv(f"roof.{shape}.accent"), original)

    def test_light_and_service_paint_use_the_actual_pinned_source_pbr(self):
        source_manifest = json.loads((BUILDER.ARCHIVE / "export_flight/manifest.json").read_text())
        for piece_id, slot in [("roof.small.box", "primary"), ("roof.accent.w2.d2.v1", "accent")]:
            source = next(p for p in source_manifest["pieces"] if p["id"] == piece_id)
            source_doc, _ = BUILDER.read_glb(BUILDER.ARCHIVE / "export_flight" / source["file"])
            source_pbr = next(m for m in source_doc["materials"] if m["name"] == slot)["pbrMetallicRoughness"]
            for shape in BUILDER.SHAPES:
                finish = "light" if slot == "primary" else "accent"
                derived_doc, _ = BUILDER.read_glb(BASE / f"roof.{shape}.{finish}.glb")
                actual_pbr = next(m for m in derived_doc["materials"] if m["name"] == slot)["pbrMetallicRoughness"]
                self.assertEqual(actual_pbr, source_pbr)


if __name__ == "__main__":
    unittest.main()
