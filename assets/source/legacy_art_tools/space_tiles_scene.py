"""Original industrial kit. Executed inside Blender through MCP safe mode.

The caller supplies OUTPUT. XY metres are the construction plane; +Y is north.
Meshes/materials remain editable in the saved .blend. No external assets used.
"""
import bpy
import math
import json

PIXELS = 64
CELL = 2.0
STRIDE = 2.5
COLUMNS = 10
ATLAS_WIDTH_M = 48.0
PACK = {"x": 0.0, "y": 0.0, "row_height": 0.0}
TILES = []
MATERIALS = {}
CURRENT = {"origin": (0, 0), "collection": None}
COLORS = {
    "void": (0.035, 0.047, 0.063), "seam": (0.070, 0.094, 0.121),
    "dark": (0.13, 0.18, 0.22), "steel": (0.24, 0.32, 0.37),
    "panel": (0.36, 0.44, 0.48), "edge": (0.51, 0.60, 0.61),
    "light": (0.68, 0.73, 0.69), "cyan": (0.12, 0.78, 0.78),
    "screen": (0.06, 0.27, 0.31), "amber": (0.96, 0.49, 0.13),
    "yellow": (0.96, 0.73, 0.22), "red": (0.66, 0.20, 0.18),
    "green": (0.38, 0.64, 0.32), "blue": (0.22, 0.38, 0.55),
}


def palette_color(hex_color):
    values = [int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4 for value in values)


COLORS = {name: palette_color(color) for name, color in THEMES[0]["colors_srgb"].items()}


def material(color):
    if color in MATERIALS:
        return MATERIALS[color]
    mat = bpy.data.materials.new("MAT-" + color)
    mat.use_nodes = True
    mat.diffuse_color = (*COLORS[color], 1)
    mat.node_tree.nodes.clear()
    out = mat.node_tree.nodes.new("ShaderNodeOutputMaterial")
    emission = mat.node_tree.nodes.new("ShaderNodeEmission")
    emission.inputs["Color"].default_value = (*COLORS[color], 1)
    mat.node_tree.links.new(emission.outputs[0], out.inputs["Surface"])
    MATERIALS[color] = mat
    return mat


def attach(obj, name, color):
    obj.name = "GEO-" + TILES[-1]["name"] + "-" + name
    for collection in list(obj.users_collection):
        collection.objects.unlink(obj)
    CURRENT["collection"].objects.link(obj)
    obj.data.materials.append(material(color))
    return obj


def box(name, x, y, z, w, h, d, color="panel", bevel=0.025, angle=0):
    ox, oy = CURRENT["origin"]
    verts = [(-w/2, -h/2, -d/2), (w/2, -h/2, -d/2), (w/2, h/2, -d/2), (-w/2, h/2, -d/2),
             (-w/2, -h/2, d/2), (w/2, -h/2, d/2), (w/2, h/2, d/2), (-w/2, h/2, d/2)]
    mesh = bpy.data.meshes.new("MESH-" + name)
    mesh.from_pydata(verts, [], [(3,2,1,0), (4,5,6,7), (0,1,5,4), (1,2,6,5), (2,3,7,6), (3,0,4,7)])
    mesh.update()
    obj = attach(bpy.data.objects.new("GEO-" + name, mesh), name, color)
    obj.location = (ox + x, oy + y, z)
    obj.rotation_euler.z = angle
    if bevel:
        modifier = obj.modifiers.new("Machined rim", "BEVEL")
        modifier.width = bevel
        modifier.segments = 1
    return obj


def cylinder(name, x, y, z, radius, depth, color="steel", vertices=12):
    ox, oy = CURRENT["origin"]
    verts = [(radius * math.cos(i * math.tau / vertices), radius * math.sin(i * math.tau / vertices), dz)
             for dz in (-depth / 2, depth / 2) for i in range(vertices)]
    faces = [tuple(reversed(range(vertices))), tuple(range(vertices, vertices * 2))]
    faces += [(i, (i + 1) % vertices, (i + 1) % vertices + vertices, i + vertices) for i in range(vertices)]
    mesh = bpy.data.meshes.new("MESH-" + name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = attach(bpy.data.objects.new("GEO-" + name, mesh), name, color)
    obj.location = (ox + x, oy + y, z)
    return obj


def begin(name, layer, walkable=False, size=(1, 1), **extra):
    index = len(TILES)
    width, height = size[0] * CELL, size[1] * CELL
    if PACK["x"] + width + .5 > ATLAS_WIDTH_M:
        PACK["x"] = 0
        PACK["y"] += PACK["row_height"]
        PACK["row_height"] = 0
    ox, oy = PACK["x"] + .25 + width / 2, -(PACK["y"] + .25 + height / 2)
    collection = bpy.data.collections.new("TILE-" + name)
    bpy.context.scene.collection.children.link(collection)
    CURRENT["collection"] = collection
    CURRENT["origin"] = (ox, oy)
    TILES.append({"name": name, "layer": layer, "walkable_preview": walkable,
                  "footprint_cells": [[x, y] for y in range(size[1]) for x in range(size[0])],
                  "size_cells": list(size), "pivot_px": [32, size[1] * 64 - 32],
                  "source_origin_m": [ox, oy],
                  "source_frame_px": [round((PACK["x"] + .25) * 64), round((PACK["y"] + .25) * 64),
                                      round(width * 64), round(height * 64)], **extra})
    PACK["x"] += width + .5
    PACK["row_height"] = max(PACK["row_height"], height + .5)


def bolts(extent=0.77, z=0.17):
    for x in (-extent, extent):
        for y in (-extent, extent):
            cylinder("fastener", x, y, z, 0.047, 0.025, "dark", 8)


def floor(style=0):
    box("substrate", 0, 0, 0, 2, 2, 0.08, "seam", 0)
    box("deck", 0, 0, 0.06, 1.89, 1.89, 0.10,
        "panel" if style != 5 else "dark", 0.035)
    bolts()
    if style in (1, 2):
        count = 8 if style == 1 else 4
        for i in range(count):
            y = -0.64 + i * 1.28 / (count - 1)
            box("drain", 0, y, 0.13, 1.26, 0.045, 0.02, "seam", 0)
        if style == 2:
            for x in (-0.55, 0.55):
                box("brace", x, 0, 0.15, 0.065, 1.44, 0.025, "edge", 0)
    elif style == 3:
        box("service-line", 0, 0, 0.13, 0.12, 2, 0.02, "amber", 0)
        box("line-border", -0.13, 0, 0.13, 0.035, 2, 0.02, "dark", 0)
    elif style == 4:
        for y in (-0.48, 0, 0.48):
            box("hazard", -0.10, y, 0.13, 0.80, 0.15, 0.02, "yellow", 0,
                math.pi / 4)
    elif style == 6:
        box("hatch-rim", 0, 0, 0.14, 1.22, 1.22, 0.05, "seam")
        box("hatch", 0, 0, 0.18, 1.06, 1.06, 0.04, "steel")
        box("handle", 0, 0, 0.22, 0.4, 0.1, 0.05, "edge")
    elif style == 7:
        for x, y in ((-0.4, 0.5), (0.24, -0.32), (0.6, 0.3)):
            box("wear", x, y, 0.13, 0.22, 0.035, 0.02, "dark", 0, 0.4)


def hull(mask, damaged=False):
    box("hull-base", 0, 0, 0.05, 2, 2, 0.20, "dark", 0)
    box("armor", 0, 0, 0.2, 1.9, 1.9, 0.2, "steel", 0.06)
    box("armor-inset", 0, 0, 0.32, 1.50, 1.50, 0.06, "panel", 0.05)
    bolts(0.61, 0.38)
    for bit, x, y, w, h in ((1, 0, .91, 2, .18), (2, .91, 0, .18, 2),
                             (4, 0, -.91, 2, .18), (8, -.91, 0, .18, 2)):
        if not mask & bit:
            box("perimeter", x, y, .38, w, h, .18, "edge", .025)
    if damaged:
        for i in range(4):
            box("fracture", -.4 + .22 * i, .4 - .22 * i, .4,
                .5, .06, .03, "void", 0, -.65)


def wall(mask):
    cylinder("junction", 0, 0, .34, .28, .65, "steel", 8)
    for bit, x, y, w, h in ((1, 0, .5, .45, 1), (2, .5, 0, 1, .45),
                             (4, 0, -.5, .45, 1), (8, -.5, 0, 1, .45)):
        if mask & bit:
            box("bulkhead", x, y, .30, w, h, .6, "dark", .02)
            box("cap", x, y, .63, w * .70 if w < 1 else w,
                h * .70 if h < 1 else h, .12, "edge", .02)
    cylinder("junction-cap", 0, 0, .74, .18, .06, "panel", 8)


def equipment(name):
    box("equipment-foot", 0, 0, .10, 1.65, 1.65, .2, "seam", .08)
    if name.startswith("cargo"):
        color = "amber" if name == "cargo_amber" else "green"
        box("crate", 0, 0, .35, 1.4, 1.4, .5, color, .1)
        for x in (-.43, .43):
            box("strap", x, 0, .65, .12, 1.48, .10, "dark")
        box("label", 0, .16, .64, .4, .3, .04, "light", 0)
    elif name in ("reactor", "shield", "scanner", "tank"):
        color = {"reactor": "cyan", "shield": "blue", "scanner": "green", "tank": "amber"}[name]
        cylinder("housing", 0, 0, .3, .72, .4, "steel")
        cylinder("ring", 0, 0, .53, .58, .1, "dark")
        cylinder("core", 0, 0, .61, .42, .1, color)
        cylinder("cap", 0, 0, .69, .2, .06, "light")
        for i in range(8):
            angle = i * math.pi / 4
            box("fin", .70 * math.sin(angle), .70 * math.cos(angle), .59,
                .15, .24, .13, "edge", .02, -angle)
    elif name in ("console", "bridge", "medical"):
        box("cabinet", 0, .1, .35, 1.55, 1.3, .45, "steel", .1)
        box("screen-bezel", 0, .3, .61, 1.34, .60, .06, "seam")
        box("screen", 0, .3, .65, 1.15, .44, .02, "screen", .015)
        for i in range(3):
            box("readout", -.3 + i * .3, .3, .67, .15, .04 + .07 * i, .02, "cyan", 0)
        for x in (-.42, -.14, .14, .42):
            box("key", x, -.2, .61, .12, .09, .03, "light", .01)
        if name == "bridge":
            box("chair", 0, -.65, .30, .55, .5, .4, "dark", .08)
        if name == "medical":
            box("cross", 0, -.63, .4, .45, .12, .05, "red", 0)
            box("cross", 0, -.63, .4, .12, .45, .05, "red", 0)
    elif name in ("thruster", "thruster_small"):
        box("motor", 0, .3, .35, 1.3, 1.25, .5, "steel", .12)
        for x in (-.42, 0, .42):
            box("cooling", x, .3, .65, .10, .8, .08, "dark")
        box("nozzle", 0, -.55, .28, 1.55, .55, .40, "dark", .04)
        box("throat", 0, -.68, .50, 1.14, .13, .05, "cyan", .01)
        for x in (-.69, .69):
            box("nozzle-rib", x, -.55, .56, .12, .64, .08, "edge")
    elif name in ("mount", "turret"):
        cylinder("mount", 0, 0, .3, .74, .40, "steel", 16)
        cylinder("turntable", 0, 0, .55, .57, .1, "dark", 16)
        cylinder("bearing", 0, 0, .62, .30, .10, "edge", 12)
        if name == "turret":
            box("receiver", 0, -.1, .72, .60, .74, .2, "panel", .06)
            for x in (-.20, .20):
                box("barrel", x, .55, .70, .15, .85, .12, "dark", .02)
    elif name in ("battery", "fuel", "server"):
        for x in (-.42, .42):
            box("bank", x, 0, .36, .60, 1.48, .50, "dark", .06)
            for y in (-.48, -.16, .16, .48):
                box("cell", x, y, .66, .44, .16, .05,
                    "green" if name == "battery" else "amber" if name == "fuel" else "cyan")
    elif name == "vent":
        for y in (-.6, -.4, -.2, 0, .2, .4, .6):
            box("slat", 0, y, .4, 1.45, .09, .30, "steel")
    elif name == "solar":
        box("frame", 0, 0, .2, 1.9, 1.9, .15, "edge")
        for x in (-.62, 0, .62):
            for y in (-.62, 0, .62):
                box("photovoltaic", x, y, .30, .55, .55, .05, "blue", 0)
    elif name == "pipe":
        for x in (-.4, .4):
            box("conduit", x, 0, .3, .22, 2, .25, "steel", .06)
            for y in (-.65, .65):
                box("clamp", x, y, .45, .37, .13, .1, "edge")
    elif name == "window":
        box("frame", 0, 0, .3, 1.85, .8, .4, "edge", .05)
        box("glass", 0, 0, .53, 1.55, .5, .05, "screen", .04)
        box("reflection", 0, .12, .57, 1.25, .045, .02, "cyan", 0)
    elif name == "airlock":
        box("chamber", 0, 0, .3, 1.88, 1.85, .4, "steel", .06)
        box("seal", 0, 0, .53, 1.25, 1.55, .06, "seam")
        box("hatch", 0, 0, .58, 1.10, 1.42, .06, "amber")
        box("split", 0, 0, .63, .05, 1.42, .02, "dark", 0)


bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene["sidereal_theme_catalog"] = json.dumps(THEMES)
scene.unit_settings.system = "METRIC"
scene.unit_settings.scale_length = 1
for style in range(8):
    begin("floor_" + str(style), "floor", True)
    floor(style)
for mask in range(16):
    begin("wall_" + str(mask), "wall", adjacency_nesw=mask)
    wall(mask)
for mask in range(16):
    begin("hull_" + str(mask), "roof", adjacency_nesw=mask)
    hull(mask)
for name in ("cargo_amber", "cargo_green", "reactor", "shield", "scanner", "tank",
             "console", "bridge", "medical", "thruster", "thruster_small", "mount",
             "turret", "battery", "fuel", "server", "vent", "solar", "pipe", "window", "airlock"):
    begin(name, "equipment")
    equipment(name)
for frame in range(4):
    begin("door_" + str(frame), "door", frame == 3, animation_frame=frame, duration_ms=100)
    for x in (-.86, .86):
        box("jamb", x, 0, .3, .28, .65, .6, "edge")
        box("status", x, -.12, .65, .10, .15, .03, "cyan" if frame == 3 else "amber")
    if frame < 3:
        width = .71 * (1 - frame / 3)
        for side in (-1, 1):
            box("leaf", side * (.71 - width / 2), 0, .28,
                width, .46, .5, "amber", .02)
for mask in (3, 6, 12, 15):
    begin("hull_damaged_" + str(mask), "damage")
    hull(mask, True)
for frame in range(4):
    begin("crew_" + str(frame), "actor", animation_frame=frame, duration_ms=140)
    for side in (-1, 1):
        y = .10 * math.sin(frame * math.pi / 2) * side
        box("boot", side * .12, -.25 + y, .10, .19, .32, .15, "dark", .04)
        box("arm", side * .28, y, .25, .15, .40, .20, "amber", .04)
    box("suit", 0, 0, .3, .45, .45, .3, "amber", .06)
    cylinder("helmet", 0, .20, .55, .22, .20, "light", 12)
    box("visor", 0, .33, .66, .30, .13, .08, "cyan", .025)
