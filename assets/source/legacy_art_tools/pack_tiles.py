"""Pack variable-size Blender frames and faction themes into review assets."""
from pathlib import Path
import hashlib
import json
import math

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]


def extrude(atlas, frame, x, y):
    w, h = frame.size
    atlas.paste(frame, (x, y))
    for offset in (1, 2):
        atlas.paste(frame.crop((0, 0, 1, h)), (x - offset, y))
        atlas.paste(frame.crop((w - 1, 0, w, h)), (x + w - 1 + offset, y))
        atlas.paste(frame.crop((0, 0, w, 1)), (x, y - offset))
        atlas.paste(frame.crop((0, h - 1, w, h)), (x, y + h - 1 + offset))
    for cx, cy, sx, sy in ((-2, -2, 0, 0), (w, -2, w - 1, 0), (-2, h, 0, h - 1), (w, h, w - 1, h - 1)):
        atlas.paste(Image.new("RGBA", (2, 2), frame.getpixel((sx, sy))), (x + cx, y + cy))


def export_channel(output, target, source, channel, source_file):
    original = Image.open(output / source_file).convert("RGBA")
    silhouette_source = Image.open(output / "source_albedo.png").convert("RGBA") if channel == "shaded" else original
    atlas = Image.new("RGBA", tuple(value // 2 for value in source["source_atlas_px"]))
    palette = original.convert("RGB").quantize(colors=48, dither=Image.Dither.NONE) if channel in ("albedo", "shaded") else None
    path = target / "tiles" / channel
    path.mkdir(parents=True, exist_ok=True)
    for tile in source["tiles"]:
        x, y, w, h = tile["source_frame_px"]
        frame = original.crop((x, y, x + w, y + h)).resize((w // 2, h // 2), Image.Resampling.NEAREST)
        alpha = silhouette_source.crop((x,y,x+w,y+h)).resize((w//2,h//2), Image.Resampling.NEAREST).getchannel("A").point(lambda value: 255 if value >= 128 else 0)
        if palette:
            frame = frame.convert("RGB").quantize(palette=palette, dither=Image.Dither.NONE).convert("RGBA")
        frame.putalpha(alpha)
        extrude(atlas, frame, x // 2, y // 2)
        frame.save(path / (tile["name"] + ".png"))
        tile["frame_px"] = {"x": x // 2, "y": y // 2, "width": w // 2, "height": h // 2}
    atlas.save(target / f"atlas_{channel}.png")
    return {"file": str((target / f"atlas_{channel}.png").relative_to(output)),
            "sha256": hashlib.sha256((target / f"atlas_{channel}.png").read_bytes()).hexdigest()}


def contact_sheet(output, source, tiles_root, filename, theme_name):
    columns, slot = 8, 144
    rows = math.ceil(len(source["tiles"]) / columns)
    sheet = Image.new("RGB", (columns * slot, rows * 158 + 100), "#0e1820")
    draw = ImageDraw.Draw(sheet)
    font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    small = ImageFont.truetype(font_path, 10)
    large = ImageFont.truetype(font_path, 23)
    draw.text((22, 16), "SIDEREAL / " + theme_name.upper(), fill="#c8dedc", font=large)
    draw.text((24, 53), f'{len(source["tiles"])} authored frames · 64 px / 2 m cell · sizes shown below each part', fill="#63cecb", font=small)
    for i, tile in enumerate(source["tiles"]):
        frame = Image.open(tiles_root / (tile["name"] + ".png")).convert("RGBA")
        if max(frame.size) > 108:
            # Whole-image nearest reduction for contact sheet only; assets retain physical scale.
            factor = 108 / max(frame.size)
            frame = frame.resize((round(frame.width * factor), round(frame.height * factor)), Image.Resampling.NEAREST)
        x, y = i % columns * slot, i // columns * 158 + 86
        draw.rounded_rectangle((x + 5, y, x + 137, y + 148), 5, fill="#182630")
        sheet.paste(frame, (x + (slot - frame.width) // 2, y + 5 + (108 - frame.height) // 2), frame)
        label = tile["name"]
        for row, line in enumerate([label[:23], label[23:]]):
            if line:
                draw.text((x + 9, y + 113 + row * 11), line, fill="#c1d2d6", font=small)
        draw.text((x + 9, y + 136), f'{tile["size_cells"][0]}×{tile["size_cells"][1]} cells', fill="#63b3b3", font=small)
    sheet.save(output / filename)


def pack(output, source):
    themes = json.loads((ROOT / "scripts/art/themes.json").read_text())["themes"]
    channels = {"normal": export_channel(output, output, source, "normal", "source_normal.png")}
    theme_exports = []
    for theme in themes:
        target = output if theme["id"] == "industrial" else output / "themes" / theme["id"]
        target.mkdir(parents=True, exist_ok=True)
        exported = {}
        for channel in ("albedo", "emission", "shaded"):
            exported[channel] = export_channel(output, target, source, channel, f'source_{theme["id"]}_{channel}.png')
        if theme["id"] == "industrial":
            channels.update(exported)
        theme_exports.append({**theme, "channels": exported})
        contact_sheet(output, source, target / "tiles/albedo", f'contact_{theme["id"]}.png', theme["name"])
        for family in ("airlock_single", "airlock_double"):
            frames = [Image.open(target / "tiles/albedo" / f"{family}_{i}.png").convert("RGBA") for i in range(8)]
            sequence = [frames[0]] * 6 + frames[1:] + [frames[-1]] * 6 + list(reversed(frames[:-1]))
            sequence[0].save(target / f"{family}_animation.png", save_all=True,
                             append_images=sequence[1:], duration=90, loop=0, disposal=1)
    animations = [{"name": family + "_open", "frames": [f"{family}_{i}" for i in range(8)], "duration_ms": 90,
                   "closed_frame": 0, "preview_passable_frame": 7,
                   "close_frames": [f"{family}_{i}" for i in reversed(range(8))]} for family in ("airlock_single", "airlock_double")]
    manifest = {
        "schema": "sidereal.art.prototype.v1", "status": "review_only",
        "projection": "orthographic_top_down", "world_axes": "+X east, +Y north, +Z up",
        "image_origin": "top_left", "normal_basis": "hull_local_xy_z_up; +Y green; linear RGB",
        "cell_size_m": 2.0, "pixels_per_cell": 64, "palette_colors_max": 48,
        "sampler": "nearest", "mipmaps": False, "extrusion_px": 2,
        "blender_version": source["blender_version"], "source": "industrial_kit.blend",
        "tiles": source["tiles"], "channels": channels, "themes": theme_exports, "animations": animations,
    }
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    (output / "themes.json").write_text(json.dumps({"themes": themes}, indent=2) + "\n")
    (output / "contact_sheet.png").write_bytes((output / "contact_industrial.png").read_bytes())
    # A compact faction comparison uses the same parts, so palette differences are clear.
    names = ["armor_bow_broad_N", "armor_wing_swept_E", "engine_plasma", "shield_generator_medium", "cargo_freight_large", "fuel_pod_large"]
    board = Image.new("RGB", (1200, 6 * 180 + 60), "#0c151e")
    draw = ImageDraw.Draw(board)
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 16)
    draw.text((24, 15), "SIDEREAL / SIX FACTION STARTING PALETTES", fill="#d4e4e3", font=font)
    for row, theme in enumerate(themes):
        target = output if theme["id"] == "industrial" else output / "themes" / theme["id"]
        y = 60 + row * 180
        draw.text((18, y), theme["name"], fill="#d4e4e3", font=font)
        for i, color in enumerate(theme["colors_srgb"].values()):
            draw.rectangle((20 + i * 12, y + 30, 30 + i * 12, y + 47), fill=color)
        for i, name in enumerate(names):
            frame = Image.open(target / "tiles/albedo" / (name + ".png")).convert("RGBA")
            frame.thumbnail((126, 126), Image.Resampling.NEAREST)
            board.paste(frame, (230 + i * 156 + (126 - frame.width) // 2, y + 20), frame)
    board.save(output / "theme_comparison.png")
    propulsion = {**source, "tiles": [tile for tile in source["tiles"] if tile["name"] in ("rocket_pod_small", "rocket_pod_medium", "rocket_pod_heavy", "fusion_drive_pod", "ion_drive_pod", "thruster_side_micro")]}
    contact_sheet(output, propulsion, output / "tiles/shaded", "propulsion_board.png", "Propulsion / rocket, fusion and ion pods")
    return manifest
