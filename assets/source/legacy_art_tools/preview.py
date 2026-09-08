"""Self-contained, offline art review board. Movement here is a visual mock-up."""
import base64
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


def sample_layouts():
    station = set()
    for left, top, width, height in ((1, 1, 6, 5), (10, 1, 7, 5), (3, 9, 12, 4), (6, 3, 5, 2), (8, 4, 2, 6)):
        station.update((x, y) for x in range(left, left + width) for y in range(top, top + height))
    ship = set()
    for y in range(1, 16):
        half = 1 if y < 3 else 2 if y < 6 else 3 if y < 12 else 2
        ship.update((x, y) for x in range(5 - half, 6 + half))
    frigate = set()
    exterior = []
    # A continuous arrowhead hull: diagonal edge modules close each stair step.
    for y in range(3, 10):
        left = 13 - y
        right = 21 - left
        frigate.update((x, y) for x in range(left, right + 1))
        exterior.extend([[left - 1, y, "armor_diagonal_45_W"], [right + 1, y, "armor_diagonal_45_N"]])
    frigate.update((x, y) for x in range(3, 19) for y in range(10, 19))
    for y in range(19, 26):
        left = y - 16
        right = 21 - left
        frigate.update((x, y) for x in range(left, right + 1))
        exterior.extend([[left - 1, y, "armor_diagonal_45_S"], [right + 1, y, "armor_diagonal_45_E"]])
    for left in (1, 18):
        frigate.update((x, y) for x in range(left, left + 3) for y in range(17, 26))
    exterior.extend([
        [10,2,"armor_bow_broad_N"],
        [1,16,"armor_nacelle_shoulder_N"], [18,16,"armor_nacelle_shoulder_N"],
        [10,10,"bridge_canopy"], [10,6,"armor_backbone"],
        [7,11,"armor_flank_port"], [13,11,"armor_flank_starboard"],
        [4,16,"armor_flank_port"], [16,16,"armor_flank_starboard"],
        [7,18,"armor_backbone"], [13,18,"armor_backbone"],
        [8,23,"armor_flank_port"], [12,23,"armor_flank_starboard"],
        [1,22,"armor_flank_port"], [19,22,"armor_plate_long"],
        [10,15,"generator_fusion_medium"], [10,19,"shield_generator_medium"],
        [5,13,"turret_heavy"], [15,13,"turret_heavy"],
        [6,19,"turret"], [15,19,"turret"],
        [4,21,"cargo_secure_large"], [16,21,"fuel_cryogenic"],
        [10,23,"airlock_double_0"],
        [1,28,"engine_frigate_nacelle"], [18,28,"engine_frigate_nacelle"],
        [10,27,"engine_chemical_medium"],
    ])
    return {
        "station": {"width": 19, "height": 15, "floor": sorted(station), "start": [4, 3],
                    "props": [[2, 2, "console"], [4, 1, "server"], [6, 1, "medical"],
                              [12, 2, "reactor"], [15, 2, "battery"], [15, 4, "tank"],
                              [4, 10, "cargo_amber"], [5, 11, "cargo_green"], [12, 11, "cargo_amber"],
                              [13, 10, "cargo_green"], [11, 4, "console"]]},
        "ship": {"width": 11, "height": 18, "floor": sorted(ship), "start": [5, 5],
                 "props": [[5, 2, "bridge"], [5, 8, "reactor"], [3, 10, "cargo_amber"],
                           [7, 10, "cargo_green"], [4, 14, "thruster"], [6, 14, "thruster"],
                           [3, 6, "turret"], [7, 6, "turret"], [6, 12, "battery"]]},
        "frigate": {"width": 22, "height": 30, "floor": sorted(frigate), "start": [11, 17],
                    "presentation": "exterior", "name": "Kestrel Patrol Frigate", "props": exterior},
    }


def build_preview(output: Path, manifest):
    uri = "data:image/png;base64," + base64.b64encode((output / "atlas_albedo.png").read_bytes()).decode()
    template = Path(__file__).with_name("preview.html").read_text()
    content = template.replace("__ATLAS__", uri).replace("__MANIFEST__", json.dumps(manifest))
    content = content.replace("__LAYOUTS__", json.dumps(sample_layouts()))
    theme_images = {theme["id"]: "data:image/png;base64," + base64.b64encode(
        (output / theme["channels"]["albedo"]["file"]).read_bytes()).decode() for theme in manifest["themes"]}
    content = content.replace("__THEME_IMAGES__", json.dumps(theme_images))
    for name in ("comparison_top", "comparison_angle", "ship_top", "ship_angle", "frigate_top", "frigate_angle"):
        file = output / f"{name}.png"
        encoded = "data:image/png;base64," + base64.b64encode(file.read_bytes()).decode() if file.exists() else ""
        content = content.replace("__" + name.upper() + "__", encoded)
    (output / "index.html").write_text(content)
    (output / "sample_layouts.json").write_text(json.dumps(sample_layouts(), indent=2) + "\n")
    layout = sample_layouts()["frigate"]
    tile_by_name = {tile["name"]: tile for tile in manifest["tiles"]}
    occupied = {tuple(cell) for cell in layout["floor"]}
    fleet = Image.new("RGB", (1500, 1400), "#0b151d")
    draw = ImageDraw.Draw(fleet)
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 20)
    draw.text((24, 16), "SIDEREAL / FACTION PALETTE STUDY", fill="#d2e2e1", font=font)
    for index, theme in enumerate(manifest["themes"]):
        atlas = Image.open(output / theme["channels"]["albedo"]["file"]).convert("RGBA")
        canvas = Image.new("RGBA", (layout["width"] * 64, layout["height"] * 64))

        def put(name, x, y):
            tile = tile_by_name[name]
            rect = tile["frame_px"]
            frame = atlas.crop((rect["x"], rect["y"], rect["x"] + rect["width"], rect["y"] + rect["height"]))
            canvas.alpha_composite(frame, (x * 64 + 32 - tile["pivot_px"][0], y * 64 + 32 - tile["pivot_px"][1]))

        for x, y in layout["floor"]:
            mask = sum(bit for dx, dy, bit in ((0, -1, 1), (1, 0, 2), (0, 1, 4), (-1, 0, 8)) if (x + dx, y + dy) in occupied)
            put("hull_" + str(mask), x, y)
        for x, y, name in layout["props"]:
            put(name, x, y)
        canvas.save(output / ("frigate_" + theme["id"] + ".png"))
        canvas.thumbnail((450, 570), Image.Resampling.NEAREST)
        x, y = index % 3 * 500, index // 3 * 660 + 65
        draw.text((x + 22, y), theme["name"], fill="#d2e2e1", font=font)
        fleet.paste(canvas, (x + (500 - canvas.width) // 2, y + 45), canvas)
    fleet.save(output / "faction_frigates.png")
