"""Validate the exported artifact contract, without starting Blender."""
from pathlib import Path
import hashlib
import json
import sys

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import devenv


def main():
    config = devenv.expand(devenv.load_config(), "blender-art", raw_cert=True, use_dotenv=False)
    output = ROOT / config["SIDEREAL_ART_OUTPUT"]
    manifest = json.loads((output / "manifest.json").read_text())
    names = [tile["name"] for tile in manifest["tiles"]]
    assert len(names) == len(set(names)), "duplicate tile IDs"
    assert manifest["cell_size_m"] == 2.0 and manifest["pixels_per_cell"] == 64
    for prefix in ("hull_", "wall_"):
        assert all(prefix + str(mask) in names for mask in range(16)), "missing connection mask"
    atlases = {}
    for channel, info in manifest["channels"].items():
        payload = (output / info["file"]).read_bytes()
        assert hashlib.sha256(payload).hexdigest() == info["sha256"], "checksum mismatch"
        atlases[channel] = Image.open(output / info["file"])
        assert atlases[channel].mode == "RGBA"
    assert len({image.size for image in atlases.values()}) == 1
    palette = set()
    rects = []
    for tile in manifest["tiles"]:
        rect = tile["frame_px"]
        x, y, width, height = (rect[key] for key in ("x", "y", "width", "height"))
        assert (width, height) == tuple(value * 64 for value in tile["size_cells"])
        assert x >= 2 and y >= 2
        assert x + width + 2 <= atlases["albedo"].width
        assert y + height + 2 <= atlases["albedo"].height
        bounds = (x, y, x + width, y + height)
        for left, top, right, bottom in rects:
            assert x >= right or x + width <= left or y >= bottom or y + height <= top, "overlapping frames"
        rects.append(bounds)
        masks = []
        for channel, atlas in atlases.items():
            frame = Image.open(output / "tiles" / channel / (tile["name"] + ".png"))
            assert frame.size == (width, height) and frame.mode == "RGBA"
            assert frame.tobytes() == atlas.crop(bounds).tobytes(), "frame/atlas mismatch"
            alpha = frame.getchannel("A")
            assert set(alpha.get_flattened_data()) <= {0, 255}, "non-pixel alpha"
            assert alpha.getbbox(), "empty frame"
            masks.append(alpha.tobytes())
            assert atlas.crop((x - 1, y, x, y + height)).tobytes() == frame.crop((0, 0, 1, height)).tobytes()
            if channel == "albedo":
                palette.update(pixel[:3] for pixel in frame.get_flattened_data() if pixel[3])
        assert len(set(masks)) == 1, "channel silhouettes differ"
    assert len(palette) <= manifest["palette_colors_max"], "palette exceeds declared budget"
    assert len(manifest["themes"]) == 6
    assert len({tuple(theme["colors_srgb"].values()) for theme in manifest["themes"]}) == 6
    for theme in manifest["themes"]:
        for channel, info in theme["channels"].items():
            assert hashlib.sha256((output / info["file"]).read_bytes()).hexdigest() == info["sha256"]
            themed = Image.open(output / info["file"])
            assert themed.size == atlases[channel].size
            assert themed.getchannel("A").tobytes() == atlases[channel].getchannel("A").tobytes()
    angled = [tile for tile in manifest["tiles"] if tile.get("family") == "angled_armor"]
    assert len(angled) == 52
    for tile in angled:
        w, h = tile["size_cells"]
        points = tile["collision_polygon_local_m"]
        assert all(abs(x) <= w and abs(y) <= h for x, y in points)
        area = sum(points[i][0] * points[(i + 1) % len(points)][1] - points[(i + 1) % len(points)][0] * points[i][1] for i in range(len(points)))
        assert area > 0, "polygon winding must be counterclockwise"
    for animation in manifest["animations"]:
        assert len(animation["frames"]) == 8
        assert animation["close_frames"] == list(reversed(animation["frames"]))
        assert all(frame in names for frame in animation["frames"])
    normal = Image.open(output / "tiles/normal/floor_0.png").getpixel((32, 32))
    assert all(abs(value - expected) <= 1 for value, expected in zip(normal[:3], (128, 128, 255))), normal
    proof = json.loads((output / "mcp-verification.json").read_text())
    assert proof["scene_probe"]["isError"] is False
    for file in ("industrial_kit.blend", "station_3d_study.blend", "comparison_top.png", "comparison_angle.png", "index.html"):
        assert (output / file).stat().st_size > 1000, file
    print(f"Verified {len(names)} tiles: IDs, masks, bounds, channels, alpha, palette, extrusion, hashes, MCP and 3D outputs.")


if __name__ == "__main__":
    main()
    from verify_exterior import verify
    verify()
