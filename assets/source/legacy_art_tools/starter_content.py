"""Lower the approved Blender study into canonical editable content packages.

Does not publish or mutate a live world. Gateway content publication owns that step.
"""
import json
import shutil
from pathlib import Path
from preview import sample_layouts
from starter_preview import render_starter

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / "artifacts/space_tiles"
CONTENT = ROOT / "data/content"


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n")


def package(kind, folder, identifier, definition, entry=None):
    package_id = identifier.replace(".", "__")
    directory = CONTENT / folder / package_id
    value = definition if kind == "asset" else {"ordinal": 100, "entry": entry, "definition": definition}
    manifest_path = directory / "manifest.json"
    definition_path = directory / "definition.json"
    revision = json.loads(manifest_path.read_text())["revision"] if manifest_path.exists() else 1
    if definition_path.exists() and json.loads(definition_path.read_text()) != value:
        revision += 1
    write_json(directory / "manifest.json", {"schema_version": 1, "package_id": package_id,
        "kind": kind, "primary_blueprint": package_id, "files": ["definition.json"], "revision": revision})
    write_json(directory / "definition.json", value)


def asset_id(theme, tile):
    return f"tile.{theme}.{tile}"


def main():
    manifest = json.loads((ART / "manifest.json").read_text())
    tiles = {tile["name"]: tile for tile in manifest["tiles"]}
    layout = sample_layouts()["ship"]
    floor_cells = {tuple(cell) for cell in layout["floor"]}
    directions = ((0, -1, 1, "N"), (1, 0, 2, "E"), (0, 1, 4, "S"), (-1, 0, 8, "W"))
    for theme in manifest["themes"]:
        palette = theme["id"]
        for tile in tiles:
            identifier = asset_id(palette, tile)
            destination = ROOT / "data/sprites/tiles" / palette / f"{tile}.png"
            destination.parent.mkdir(parents=True, exist_ok=True)
            source = ART if palette == "industrial" else ART / "themes" / palette
            shutil.copyfile(source / "tiles/shaded" / f"{tile}.png", destination)
            package("asset", "assets", identifier, {"asset_id": identifier, "source_path": str(destination.relative_to(ROOT / "data")),
                "content_type": "image/png", "bootstrap_required": False, "startup_required": False,
                "dependencies": [], "editor_preview": None, "editor_schema": None, "shader_family": None})

        definitions = {}
        components = []

        def define(name, tile, category, layer="equipment", mass=100, interior=False, support=True,
                   behaviour=None, edges=None, clearance=None, polygon=None, overlays=None, interior_tile=None, power=None, airlock=None):
            identifier = f"block.{palette}.{name}"
            footprint = tiles[tile]["footprint_cells"]
            definitions[identifier] = {"block_id": identifier, "display_name": theme["name"] + " / " + name.replace("_", " ").title(),
                "category": category, "layer": layer, "footprint": footprint, "mass_kg": mass, "health": 400.0,
                "collision_polygon": polygon or [], "cost": {"capacity": 0.25 if layer == "structure" else 1.0, "credits": mass * 2},
                "power": power, "directional": True,
                "placement": {"attach_edges": edges or ["N", "E", "S", "W"], "requires_support": support if layer == "equipment" else False,
                    "attach_to": ["hull", "armor"], "min_attachments": 1, "clearance": clearance or [], "keep_clear": []},
                "visual": {"tile_asset_id": None if interior else asset_id(palette, tile),
                    "interior_asset_id": asset_id(palette, tile) if interior else asset_id(palette, interior_tile) if interior_tile else None,
                    "visible_in_cutaway": (not interior and layer != "structure" or category == "armor") and airlock is None,
                    "interior_overlays": overlays or []},
                "interior": {"walkable": (layer == "structure" or airlock is not None) and interior_tile is not None,
                    "obstacle_half_extents_cells": [.38, .38] if interior else None,
                    "control_seat": category == "bridge", "wall_asset_prefix": asset_id(palette, "wall_") if interior_tile else None,
                    "airlock": airlock} if interior or interior_tile else None,
                "components": behaviour or []}
            return identifier

        def place(identifier, x, y, facing="N"):
            # Exact study coordinates -> grid centered around the original interior.
            components.append({"block_id": identifier, "cell": [x - 5, 8 - y], "facing": facing})

        for x, y in sorted(floor_cells):
            mask = sum(bit for dx, dy, bit, _ in directions if (x + dx, y + dy) in floor_cells)
            style = 1 if (x * 7 + y * 11) % 19 == 0 else 0
            name = f"deck_{mask}_{style}"
            identifier = define(name, "hull_15", "hull", layer="structure", mass=160,
                interior_tile=f"floor_{style}")
            place(identifier, x, y)

        define("room_floor", "hull_15", "hull", layer="structure", mass=160, interior_tile="floor_0")
        define("armor_square", "hull_15", "armor", layer="structure", mass=160)
        # Publish the full existing Blender armor kit, including long/mirrored wedges.
        for tile, spec in tiles.items():
            if not tile.startswith("armor_"):
                continue
            cells = spec["footprint_cells"]
            center = [(min(c[i] for c in cells)+max(c[i] for c in cells))/2 for i in (0,1)]
            polygon = [[p[i]/2+center[i] for i in (0,1)] for p in spec.get("collision_polygon_local_m", [])]
            if "notch_inner" in tile:
                # This outline is concave: three whole cells express its exact L shape.
                def inside(x, y):
                    hit = False
                    for a,b in zip(polygon,polygon[1:]+polygon[:1]):
                        if (a[1]>y)!=(b[1]>y) and x < (b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]: hit = not hit
                    return hit
                cells = [c for c in cells if inside(*c)]
                polygon = []
            identifier = define(tile,tile,"armor",layer="structure",mass=140*len(cells),
                edges=spec.get("attach_edges"),polygon=polygon)
            definitions[identifier]["footprint"] = cells

        for x, y, tile in layout["props"]:
            category = {"bridge": "bridge", "reactor": "reactor", "battery": "battery", "turret": "mount"}.get(tile, "cargo" if "cargo" in tile else "utility")
            behaviour = [{"kind": "inventory", "properties": {"entries": []}}] if category == "cargo" else []
            power = {"generation_kw": 800, "draw_kw": 0, "battery_capacity_kj": 0} if tile == "reactor" else None
            identifier = define("interior_" + tile, tile, category, mass=350 if tile == "reactor" else 100,
                interior=True, behaviour=behaviour, power=power)
            place(identifier, x, y)

        # Full-cell armor wedges wrap the stepped hull without changing its interior.
        for x, y, orientation in [(3, 1, "W"), (7, 1, "N"), (2, 3, "W"), (8, 3, "N"),
                                  (1, 6, "W"), (9, 6, "N"), (2, 12, "S"), (8, 12, "E")]:
            tile = "armor_diagonal_45_" + orientation
            spec = tiles[tile]
            identifier = define(tile, tile, "armor", layer="structure", mass=90, support=False,
                edges=spec["attach_edges"], polygon=[[px / 2, py / 2] for px, py in spec["collision_polygon_local_m"]])
            place(identifier, x, y)

        engine = define("main_engine", "rocket_pod_small", "thruster", mass=400, support=False,
            edges=["N"], clearance=["S"], behaviour=[{"kind": "directional_thruster", "properties":
                {"force_axis": [0, 1], "max_force_n": 220000.0, "burn_rate_kg_s": 0.12, "enabled": True, "nozzle_offset_m": [0,-1.88],
                 "plume_width_m": .9, "plume_length_m": 7.0, "plume_color_rgb": [1.0,.34,.08]}}])
        for pod, dry, thrust, burn in [("rocket_pod_medium",900,520000,.30), ("rocket_pod_heavy",2200,1250000,.70),
                                        ("fusion_drive_pod",1200,750000,.12), ("ion_drive_pod",300,95000,.015)]:
            width,length=tiles[pod]["size_cells"]
            define(pod,pod,"thruster",mass=dry,support=False,edges=["N"],clearance=["S"],
                behaviour=[{"kind":"directional_thruster","properties":{"force_axis":[0,1],"max_force_n":thrust,
                    "burn_rate_kg_s":burn,"enabled":True,"nozzle_offset_m":[0,-length*.94],
                    "plume_width_m":width*.9,"plume_length_m":length*3.5,
                    "plume_color_rgb":[1,.34,.08] if "rocket" in pod else [.15,.65,1]}}])
        place(engine, 4, 17)
        place(engine, 6, 17)
        jet = define("side_thruster", "thruster_side_micro", "thruster", mass=45, support=False,
            edges=["N"], clearance=["S"], behaviour=[{"kind": "directional_thruster", "properties":
                {"force_axis": [0, 1], "max_force_n": 65000.0, "burn_rate_kg_s": 0.025, "enabled": True, "nozzle_offset_m": [0,-.60],
                 "plume_width_m": .30, "plume_length_m": 2.4, "plume_color_rgb": [.15,.65,1.0]}}])
        # Opposing side pairs, plus two forward-mounted braking jets.
        for x, y, facing in [(2, 4, "E"), (8, 4, "W"), (2, 14, "E"), (8, 14, "W"), (4, 0, "S"), (6, 0, "S")]:
            place(jet, x, y, facing)
        tank = define("fuel_pod", "fuel_pod_small", "fuel", mass=80, interior=True,
            behaviour=[{"kind": "fuel_tank", "properties": {"fuel_kg": 300.0}}])
        # Contents on the deck layer, kept clear of the original props and central walkway.
        place(tank, 3, 13)
        place(tank, 7, 13)
        frames = [asset_id(palette,f"airlock_single_{i}") for i in range(8)]
        for name,angle in (("airlock_horizontal",0.0),("airlock_vertical",1.5707963267948966)):
            define(name,"airlock_single_0","airlock",mass=140,support=False,interior_tile="floor_0",
                airlock={"frames":frames,"rotation_rad":angle,"travel_seconds":.63})
        airlock = define("external_airlock", "airlock_single_0", "airlock", mass=140, support=False,
            interior_tile="floor_0", airlock={"frames":frames,"rotation_rad":1.5707963267948966,"travel_seconds":.63})
        place(airlock, 9, 9)

        for definition in definitions.values():
            package("block", "blocks", definition["block_id"], definition,
                {"block_id": definition["block_id"], "script": "", "tags": [palette, definition["category"]]})
        hull_id = f"ship.wayfarer_{palette}"
        package("hull", "hulls", hull_id, {"hull_id": hull_id, "bundle_id": hull_id, "kind": "ship", "class": "medium",
            "display_name": "Wayfarer / " + theme["name"], "grid": {"kind": "square", "cell_size_m": 2.0},
            "hull_size": {"width": 11, "length": 19}, "root": {}, "visual": {"map_icon_asset_id": "map_icon_ship_svg", "roof_theme": palette, "markings": [
                {"id": "registry", "content": {"kind": "text", "text": "WAYFARER"}, "theme": palette,
                 "center_cells": [0, 3.5], "size_cells": [2.4, .55], "rotation_rad": -1.5707963267948966},
                {"id": "bow_badge", "content": {"kind": "decal", "motif": "roundel"}, "theme": palette,
                 "center_cells": [0, 6], "size_cells": [1.25, 1.25], "rotation_rad": 0},
                {"id": "port_stripes", "content": {"kind": "decal", "motif": "chevron"}, "theme": palette,
                 "center_cells": [-2.5, 0], "size_cells": [1.6, 2.2], "rotation_rad": 0},
                {"id": "starboard_stripes", "content": {"kind": "decal", "motif": "chevron"}, "theme": palette,
                 "center_cells": [2.5, 0], "size_cells": [1.6, 2.2], "rotation_rad": 0},
                {"id": "stern_warning", "content": {"kind": "decal", "motif": "hazard"}, "theme": palette,
                 "center_cells": [0, -7], "size_cells": [1.5, .5], "rotation_rad": 0}
            ]},
            "components": components, "loadout": []}, {"hull_id": hull_id, "bundle_id": hull_id, "script": "", "spawn_enabled": True,
                "tags": ["starter", "modular", palette]})
        if palette == "industrial":
            envelope = json.loads((CONTENT / "hulls" / hull_id.replace(".", "__") / "definition.json").read_text())
            render_starter(ROOT, ART, envelope["definition"], definitions)
    print("Wrote six editable Wayfarer blueprints using the approved interior, exterior armor, engines and side jets.")


if __name__ == "__main__":
    main()
