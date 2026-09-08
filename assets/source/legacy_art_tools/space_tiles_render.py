ROWS = math.ceil(len(TILES) / COLUMNS)
ATLAS_HEIGHT_M = PACK["y"] + PACK["row_height"]
bpy.ops.object.camera_add(location=(ATLAS_WIDTH_M / 2, -ATLAS_HEIGHT_M / 2, 50))
camera = bpy.context.object
camera.name = "CAM-orthographic-atlas"
camera.data.type = "ORTHO"
camera.data.ortho_scale = max(ATLAS_WIDTH_M, ATLAS_HEIGHT_M)
scene.camera = camera
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 1
scene.cycles.use_denoising = False
scene.render.threads_mode = "FIXED"
scene.render.threads = 4
scene.render.resolution_x = round(ATLAS_WIDTH_M * 64)
scene.render.resolution_y = round(ATLAS_HEIGHT_M * 64)
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.image_settings.color_depth = "8"
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "None"
scene.view_settings.exposure = 0
scene.view_settings.gamma = 1
scene.render.filepath = OUTPUT + "/source_albedo.png"
bpy.ops.render.render(write_still=True)

# Preserve albedo materials in the authoring .blend. Other passes temporarily
# replace the material output, retaining original nodes for editable source.
bpy.ops.wm.save_as_mainfile(filepath=OUTPUT + "/industrial_kit.blend")
for mat in MATERIALS.values():
    nodes = mat.node_tree.nodes
    output = next(n for n in nodes if n.type == "OUTPUT_MATERIAL")
    geo = nodes.new("ShaderNodeNewGeometry")
    scale = nodes.new("ShaderNodeVectorMath")
    scale.operation = "MULTIPLY_ADD"
    scale.inputs[1].default_value = (.5, .5, .5)
    scale.inputs[2].default_value = (.5, .5, .5)
    emit = nodes.new("ShaderNodeEmission")
    mat.node_tree.links.new(geo.outputs["Normal"], scale.inputs[0])
    mat.node_tree.links.new(scale.outputs[0], emit.inputs[0])
    mat.node_tree.links.new(emit.outputs[0], output.inputs["Surface"])
scene.view_settings.view_transform = "Raw"
scene.render.filepath = OUTPUT + "/source_normal.png"
bpy.ops.render.render(write_still=True)
for name, mat in MATERIALS.items():
    nodes = mat.node_tree.nodes
    output = next(n for n in nodes if n.type == "OUTPUT_MATERIAL")
    emit = nodes.new("ShaderNodeEmission")
    emit.inputs[0].default_value = (*COLORS[name], 1) if name == "cyan" else (0, 0, 0, 1)
    mat.node_tree.links.new(emit.outputs[0], output.inputs["Surface"])
scene.view_settings.view_transform = "Standard"
scene.render.filepath = OUTPUT + "/source_emission.png"
bpy.ops.render.render(write_still=True)
print("SIDEREAL_TILES=" + json.dumps({"tiles": TILES, "columns": COLUMNS, "rows": ROWS,
    "cell_size_m": CELL, "pixels_per_cell": PIXELS,
    "source_atlas_px": [scene.render.resolution_x, scene.render.resolution_y],
    "blender_version": bpy.app.version_string}))

# Re-render albedo/emission in each named theme. Geometry and normals are shared.
def linear_channel(value):
    value /= 255
    return value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4


for theme in THEMES:
    for channel in ("albedo", "emission"):
        for name, mat in MATERIALS.items():
            color = theme["colors_srgb"][name].lstrip("#")
            rgb = tuple(linear_channel(int(color[i:i + 2], 16)) for i in (0, 2, 4))
            mat.node_tree.nodes.clear()
            output = mat.node_tree.nodes.new("ShaderNodeOutputMaterial")
            emit = mat.node_tree.nodes.new("ShaderNodeEmission")
            emit.inputs[0].default_value = (*rgb, 1) if channel == "albedo" or name == "cyan" else (0, 0, 0, 1)
            mat.node_tree.links.new(emit.outputs[0], output.inputs["Surface"])
        scene.render.filepath = OUTPUT + "/source_" + theme["id"] + "_" + channel + ".png"
        bpy.ops.render.render(write_still=True)
    print("SIDEREAL_THEME=" + theme["id"])

