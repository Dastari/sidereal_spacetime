# Shaded sprite channel keeps the editable albedo/normal/emission source separate.
# A broad directional key and ambient fill make chambers and pipework readable in 2D.
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs[0].default_value = (.65, .72, .80, 1)
scene.world.node_tree.nodes["Background"].inputs[1].default_value = .65
light_data = bpy.data.lights.new("sprite-key", "SUN")
light_data.energy = 2.0
light_data.angle = .25
light = bpy.data.objects.new("sprite-key", light_data)
scene.collection.objects.link(light)
light.rotation_euler = (.45, -.55, -.35)
scene.cycles.samples = 32
for theme in THEMES:
    for name, mat in MATERIALS.items():
        color = theme["colors_srgb"][name].lstrip("#")
        rgb = tuple(linear_channel(int(color[i:i + 2], 16)) for i in (0, 2, 4))
        mat.node_tree.nodes.clear()
        output = mat.node_tree.nodes.new("ShaderNodeOutputMaterial")
        surface = mat.node_tree.nodes.new("ShaderNodeEmission" if name == "cyan" else "ShaderNodeBsdfDiffuse")
        surface.inputs[0].default_value = (*rgb, 1)
        mat.node_tree.links.new(surface.outputs[0], output.inputs["Surface"])
    scene.render.filepath = OUTPUT + "/source_" + theme["id"] + "_shaded.png"
    bpy.ops.render.render(write_still=True)
bpy.data.objects.remove(light, do_unlink=True)
