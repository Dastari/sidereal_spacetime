"""Render the same kit as a roofless 3D station; appended to the MCP build."""
from mathutils import Vector

kit_scene = scene
assembly = bpy.data.scenes.new(ASSEMBLY_NAME + " / 3D presentation study")
bpy.context.window.scene = assembly
for name, mat in MATERIALS.items():
    nodes = mat.node_tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    surface = nodes.new("ShaderNodeBsdfPrincipled")
    surface.inputs["Base Color"].default_value = (*COLORS[name], 1)
    surface.inputs["Roughness"].default_value = .65
    surface.inputs["Metallic"].default_value = .35
    if name == "cyan":
        surface.inputs["Emission Color"].default_value = (*COLORS[name], 1)
        surface.inputs["Emission Strength"].default_value = .8
    mat.node_tree.links.new(surface.outputs[0], output.inputs["Surface"])

tile_index = {tile["name"]: index for index, tile in enumerate(TILES)}


def place(name, x, y):
    index = tile_index[name]
    source = bpy.data.collections["TILE-" + name]
    ox, oy = TILES[index]["source_origin_m"]
    instance = bpy.data.objects.new("INSTANCE-" + name, None)
    instance.instance_type = "COLLECTION"
    instance.instance_collection = source
    width, height = TILES[index]["size_cells"]
    instance.location = (x * CELL + (width - 1) * CELL / 2 - ox,
                         -y * CELL + (height - 1) * CELL / 2 - oy, 0)
    assembly.collection.objects.link(instance)


layout = ASSEMBLY_LAYOUT
cells = {tuple(cell) for cell in layout["floor"]}
walls = []
directions = ((0, -1, 1), (1, 0, 2), (0, 1, 4), (-1, 0, 8))
for x, y in sorted(cells):
    mask = sum(bit for dx, dy, bit in directions if (x + dx, y + dy) in cells)
    tile = "hull_" + str(mask) if layout.get("presentation") == "exterior" else "floor_" + str(1 if (x * 7 + y * 11) % 19 == 0 else 0)
    place(tile, x, y)
    for dx, dy, bit in directions:
        if (x + dx, y + dy) not in cells:
            # Bulkheads sit on cell edges, not in the next cell's centre.
            walls.append((x + dx / 2, y + dy / 2, 10 if dy else 5))
if layout.get("presentation") != "exterior":
    for x, y, mask in walls:
        place("wall_" + str(mask), x, y)
for x, y, name in layout["props"]:
    place(name, x, y)
if layout.get("presentation") != "exterior":
    place("crew_0", *layout["start"])

data = bpy.data.cameras.new("CAM-station-orthographic")
data.type = "ORTHO"
data.ortho_scale = max(layout["width"] * CELL, layout["height"] * CELL * 1100 / 850) + 2
camera = bpy.data.objects.new("CAM-station-orthographic", data)
assembly.collection.objects.link(camera)
cx, cy = (layout["width"] - 1) * CELL / 2, -(layout["height"] - 1) * CELL / 2
camera.location = (cx, cy, 50)
assembly.camera = camera
world = bpy.data.worlds.new("World / neutral studio")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (.32, .40, .46, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = .5
assembly.world = world
sun_data = bpy.data.lights.new("LIGHT-key", "SUN")
sun_data.energy = 2.0
sun_data.angle = .10
sun = bpy.data.objects.new("LIGHT-key", sun_data)
assembly.collection.objects.link(sun)
sun.rotation_euler = (.42, -.55, -.4)
assembly.render.engine = "CYCLES"
assembly.cycles.samples = 32
# The distro Blender build has no OpenImageDenoise; direct samples work on CPU.
assembly.cycles.use_denoising = False
assembly.render.threads_mode = "FIXED"
assembly.render.threads = 4
assembly.render.resolution_x = 1100
assembly.render.resolution_y = 850
assembly.render.resolution_percentage = 100
assembly.render.film_transparent = True
assembly.render.image_settings.file_format = "PNG"
assembly.render.image_settings.color_mode = "RGBA"
assembly.view_settings.view_transform = "AgX"
assembly.render.filepath = OUTPUT + "/" + ASSEMBLY_PREFIX + "_top.png"
bpy.ops.render.render(write_still=True)
camera.location = (cx, cy - 28, 43)
camera.rotation_euler = (Vector((cx, cy, 0)) - camera.location).to_track_quat("-Z", "Y").to_euler()
assembly.render.filepath = OUTPUT + "/" + ASSEMBLY_PREFIX + "_angle.png"
bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=OUTPUT + "/" + ASSEMBLY_NAME + "_3d_study.blend")
print("SIDEREAL_3D_STUDY=complete")
