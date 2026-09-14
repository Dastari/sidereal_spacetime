"""Validate actual exported engine GLBs and render them with managed Blender."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import struct
import subprocess
import sys
import tomllib


ROOT = Path(__file__).resolve().parents[2]


def validate(directory):
    report = json.loads((directory / "models.json").read_text())
    results = []
    for record in report["models"]:
        raw = (directory / record["glb"]).read_bytes()
        assert hashlib.sha256(raw).hexdigest() == record["sha256"]
        magic, version, length = struct.unpack_from("<4sII", raw)
        assert magic == b"glTF" and version == 2 and length == len(raw)
        size, kind = struct.unpack_from("<II", raw, 12)
        assert kind == 0x4e4f534a
        gltf = json.loads(raw[20:20 + size])
        offset = 20 + size
        _, kind = struct.unpack_from("<II", raw, offset)
        assert kind == 0x004e4942
        binary = raw[offset + 8:]
        positions = []
        triangles = 0
        for node in gltf["nodes"]:
            assert all(abs(a - b) < 1e-7 for a, b in zip(node.get("scale", [1, 1, 1]), [1, 1, 1]))
            assert "matrix" not in node and "rotation" not in node
            if "mesh" not in node:
                continue
            assert all(abs(v) < 1e-7 for v in node.get("translation", [0, 0, 0]))
            for primitive in gltf["meshes"][node["mesh"]]["primitives"]:
                accessor = gltf["accessors"][primitive["attributes"]["POSITION"]]
                assert accessor["componentType"] == 5126 and accessor["type"] == "VEC3"
                view = gltf["bufferViews"][accessor["bufferView"]]
                start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
                for index in range(accessor["count"]):
                    x, y, z = struct.unpack_from("<fff", binary, start + index * view.get("byteStride", 12))
                    positions.append((x, -z, y))
                triangles += gltf["accessors"][primitive["indices"]]["count"] // 3
        bounds = {"min": [min(v[a] for v in positions) for a in range(3)],
                  "max": [max(v[a] for v in positions) for a in range(3)]}
        for key in ("min", "max"):
            for axis in range(3):
                assert math.isclose(bounds[key][axis], record["bounds"][key][axis], abs_tol=1e-5)
                actual, permitted = bounds[key][axis], record["retainedEnvelope"][key][axis]
                assert actual >= permitted - 1e-5 if key == "min" else actual <= permitted + 1e-5
        nozzle_node = next(n for n in gltf["nodes"] if n["name"] == f"FX_EXHAUST-{record['assetId']}")
        x, y, z = nozzle_node.get("translation", [0, 0, 0])
        assert all(math.isclose(a, b, abs_tol=1e-6) for a, b in zip((x, -z, y), record["nozzle"]))
        assert nozzle_node["extras"]["outward_direction"] == record["exhaustDirection"]
        images = gltf.get("images", [])
        assert len(images) >= 5
        for image in images:
            assert image.get("mimeType") == "image/png" and "uri" not in image
            view = gltf["bufferViews"][image["bufferView"]]
            assert binary[view.get("byteOffset", 0):][:8] == b"\x89PNG\r\n\x1a\n"
        mapped = [mat for mat in gltf["materials"] if "normalTexture" in mat]
        assert len(mapped) == 3
        assert triangles == record["geometryTriangles"]
        results.append({"assetId": record["assetId"], "bounds": bounds, "nozzle": [x, -z, y],
                        "triangles": triangles, "embeddedMaps": len(images), "mappedMaterials": len(mapped),
                        "pass": True})
    (directory / "validation.json").write_text(json.dumps({"scope": "Actual GLB accessor bounds, nodes, exact nozzle sockets, embedded PNG maps and triangles", "models": results}, indent=2) + "\n")


def render(directory):
    import bpy
    from mathutils import Vector

    report = json.loads((directory / "models.json").read_text())
    out = directory / "renders"
    out.mkdir(exist_ok=True)
    captures = []
    shots = [
        ("large-rear", [(0, (0, 0, 0))], (-7, -8, 6), (0, 0, 1.2), 6.5),
        ("large-forward", [(1, (0, 0, 0))], (7, 8, 7), (0, .1, 1.2), 6.5),
        ("compact-kit", [(2, (-1.7, 0, 0)), (3, (1.5, -.9, 0)), (4, (1.5, .7, 0)), (5, (1.5, 2.2, 0))], (-7, -10, 8), (0, .1, .9), 7.5),
    ]
    for name, entries, position, target, scale in shots:
        bpy.ops.object.select_all(action="SELECT")
        bpy.ops.object.delete(use_global=False)
        for index, placement in entries:
            before = set(bpy.context.scene.objects)
            bpy.ops.import_scene.gltf(filepath=str(directory / report["models"][index]["glb"]))
            imported = set(bpy.context.scene.objects) - before
            for obj in imported:
                if obj.parent not in imported:
                    obj.location += Vector(placement)
        scene = bpy.context.scene
        scene.render.engine = "CYCLES"
        scene.cycles.device = "CPU"
        scene.cycles.samples = 64
        scene.cycles.use_denoising = False
        scene.render.resolution_x, scene.render.resolution_y = 1200, 900
        scene.render.resolution_percentage = 100
        scene.render.image_settings.file_format = "PNG"
        scene.render.image_settings.color_mode = "RGBA"
        scene.render.film_transparent = True
        scene.world.use_nodes = True
        scene.world.node_tree.nodes["Background"].inputs[0].default_value = (.14, .17, .22, 1)
        scene.world.node_tree.nodes["Background"].inputs[1].default_value = .45
        scene.view_settings.view_transform = "AgX"
        for light_name, location, energy, size, color in [
            ("Key", (-4, -5, 9), 2200, 6, (1, .92, .84)),
            ("Fill", (5, -2, 5), 1600, 5, (.72, .84, 1)),
            ("Rim", (2, 6, 7), 2600, 5, (.78, .85, 1)),
        ]:
            data = bpy.data.lights.new(light_name, "AREA")
            data.energy, data.size, data.color = energy, size, color
            obj = bpy.data.objects.new(light_name, data)
            scene.collection.objects.link(obj)
            obj.location = location
            obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()
        camera = bpy.data.objects.new("CAM-engine-review", bpy.data.cameras.new("CAM-engine-review"))
        scene.collection.objects.link(camera)
        camera.location = position
        camera.rotation_euler = (Vector(target) - camera.location).to_track_quat("-Z", "Y").to_euler()
        camera.data.type = "ORTHO"
        camera.data.ortho_scale = scale
        scene.camera = camera
        scene.render.filepath = str(out / f"{name}.png")
        bpy.ops.render.render(write_still=True)
        captures.append({"image": f"renders/{name}.png", "actualGlbs": [report["models"][i]["sha256"] for i, _ in entries],
                         "position": position, "target": target, "orthographicScale": scale,
                         "renderer": "Cycles CPU", "samples": 64, "denoise": False,
                         "blenderVersion": bpy.app.version_string, "viewport": [1200, 900]})
    (directory / "captures.json").write_text(json.dumps(captures, indent=2) + "\n")


if __name__ == "__main__":
    if "--" in sys.argv:
        render(Path(sys.argv[sys.argv.index("--") + 1]))
    else:
        parser = argparse.ArgumentParser(description=__doc__)
        parser.add_argument("--revision", type=int, required=True)
        parser.add_argument("--validate-only", action="store_true")
        args = parser.parse_args()
        directory = ROOT / "assets/art-library/framed-wayfarer" / f"r{args.revision:03}" / "engines"
        validate(directory)
        if not args.validate_only:
            config = tomllib.loads((ROOT / "dev.toml").read_text())
            subprocess.run([config["art"]["blender"], "--background", "--factory-startup", "--threads", "8",
                            "--python-exit-code", "1", "--python", str(Path(__file__).resolve()), "--", str(directory)], check=True)
