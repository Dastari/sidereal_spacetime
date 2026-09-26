"""Slot materials, palettes-as-materials and the review render stage (Blender only)."""
from __future__ import annotations

import math

import bpy
from mathutils import Vector

from vox import SLOTS

# Default slot values: neutral enough that exported GLBs read correctly before a theme is applied.
DEFAULTS = {
    "skin": "#e0a080", "hair": "#3a2a26", "eye": "#6b4428", "suit_primary": "#e6e3dc", "suit_secondary": "#3a4258",
    "accent": "#d8a13a", "metal": "#9aa3ae", "dark": "#1b1418", "emit": "#39d5ff", "glass": "#6fc4ff",
}
PBR = {  # roughness, metallic
    "skin": (0.62, 0.0), "hair": (0.55, 0.0), "eye": (0.25, 0.0), "suit_primary": (0.5, 0.0), "suit_secondary": (0.55, 0.0),
    "accent": (0.42, 0.05), "metal": (0.32, 0.85), "dark": (0.6, 0.0), "emit": (0.4, 0.0), "glass": (0.05, 0.0),
}
GLASS_PRESETS = {  # visor / lens glass slot presets: colour, alpha, metallic, emission strength
    "clear": ("#7fd0ff", 0.30, 0.0, 0.6), "tinted": ("#d6247f", 0.72, 0.0, 0.5), "hud": ("#4fb8ff", 0.42, 0.0, 0.8),
    "mirrored": ("#ffb52e", 1.0, 0.9, 0.2), "ar": ("#8d6bff", 0.45, 0.0, 0.8), "dark": ("#141820", 0.88, 0.2, 0.0),
    "lens": ("#9fe8ff", 0.4, 0.0, 0.4),
}


def lin(hexstr):
    h = hexstr.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


_CACHE = {}


def slot_material(slot, value=None, name=None, emit_strength=6.0):
    """A glTF-friendly Principled material for one slot. `value` is a hex colour or, for glass, a preset id."""
    value = value or (("clear" if slot == "glass" else DEFAULTS[slot]))
    key = (slot, value, name)
    if key in _CACHE:
        return _CACHE[key]
    m = bpy.data.materials.new(name or f"{slot}")
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    rough, metal = PBR[slot]
    if slot == "glass":
        col, alpha, met, em = GLASS_PRESETS[value] if value in GLASS_PRESETS else (value, 0.4, 0.0, 0.5)
        b.inputs["Base Color"].default_value = (*lin(col), 1)
        b.inputs["Alpha"].default_value = alpha
        b.inputs["Metallic"].default_value = met
        b.inputs["Roughness"].default_value = 0.08 if met < 0.5 else 0.18
        b.inputs["Emission Color"].default_value = (*lin(col), 1)
        b.inputs["Emission Strength"].default_value = em
        if alpha < 1:
            m.surface_render_method = "BLENDED"
            m.use_transparency_overlap = False
    elif slot == "emit" or (slot == "eye" and value.startswith("emit:")):
        col = value.split(":")[-1]
        b.inputs["Base Color"].default_value = (*lin(col), 1)
        b.inputs["Emission Color"].default_value = (*lin(col), 1)
        # 'soft:' = catchlight/teeth strength (catalog faceEmitStrength), otherwise a lit emitter
        b.inputs["Emission Strength"].default_value = 0.8 if value.startswith("soft:") else emit_strength
    else:
        b.inputs["Base Color"].default_value = (*lin(value), 1)
        b.inputs["Roughness"].default_value = rough
        b.inputs["Metallic"].default_value = metal
        if slot == "skin":
            b.inputs["Subsurface Weight"].default_value = 0.08
            b.inputs["Subsurface Radius"].default_value = (0.6, 0.25, 0.15)
            b.inputs["Subsurface Scale"].default_value = 0.01
    _CACHE[key] = m
    return m


def export_materials():
    """Materials named exactly after the slots (the runtime binds slot tables by material name)."""
    return {s: slot_material(s, name=s) for s in SLOTS}


def apply_palette(ob, palette):
    """Object-level material override: palette maps slot -> hex (or glass preset)."""
    for i, s in enumerate(SLOTS):
        if i >= len(ob.material_slots):
            break
        ob.material_slots[i].link = "OBJECT"
        ob.material_slots[i].material = slot_material(s, palette.get(s))


def bevel(ob, width, segments=1):
    md = ob.modifiers.new("brick", "BEVEL")
    md.width, md.segments, md.limit_method, md.angle_limit = width, segments, "ANGLE", math.radians(30)
    md.harden_normals, md.use_clamp_overlap = True, True
    return md


# =========================================================================== stage
def world(sc, top="#10224e", bottom="#050a1c"):
    w = sc.world or bpy.data.worlds.new("World")
    sc.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (*lin(bottom), 1)
    ramp.color_ramp.elements[1].color = (*lin(top), 1)
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["From Min"].default_value, mr.inputs["From Max"].default_value = -0.4, 0.6
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = 0.9
    out = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(tc.outputs["Generated"], sep.inputs[0])
    nt.links.new(sep.outputs["Z"], mr.inputs["Value"])
    nt.links.new(mr.outputs["Result"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
    nt.links.new(bg.outputs[0], out.inputs[0])


def stage(sc, samples=24):
    sc.render.engine = "BLENDER_EEVEE_NEXT"
    sc.eevee.taa_render_samples = samples
    for attr, val in (("use_shadows", True), ("use_raytracing", False), ("use_gtao", True), ("gtao_distance", 0.25),
                      ("use_fast_gi", True), ("fast_gi_distance", 0.4)):
        if hasattr(sc.eevee, attr):
            setattr(sc.eevee, attr, val)
    world(sc)

    def sun(name, energy, colour, rot):
        ob = bpy.data.objects.new(name, bpy.data.lights.new(name, "SUN"))
        sc.collection.objects.link(ob)
        ob.data.energy, ob.data.color = energy, colour
        ob.data.angle = math.radians(8)
        ob.rotation_euler = tuple(math.radians(a) for a in rot)
        return ob

    sun("Key", 3.4, (1.0, 0.94, 0.86), (52, 0, -38))
    sun("Fill", 1.0, (0.7, 0.78, 1.0), (70, 0, 140))
    sun("Rim", 1.6, (0.72, 0.72, 1.0), (-60, 0, 20))
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    sc.view_settings.view_transform, sc.view_settings.look = "AgX", "AgX - Base Contrast"
    sc.view_settings.exposure, sc.view_settings.gamma = 0.25, 1.06
    sc.render.film_transparent = False
    sc.use_nodes = True
    ct = sc.node_tree
    ct.nodes.clear()
    rl = ct.nodes.new("CompositorNodeRLayers")
    gl = ct.nodes.new("CompositorNodeGlare")
    gl.glare_type, gl.threshold, gl.size, gl.mix = "FOG_GLOW", 0.9, 6, -0.2
    hs = ct.nodes.new("CompositorNodeHueSat")
    hs.inputs["Saturation"].default_value = 1.22
    bc = ct.nodes.new("CompositorNodeBrightContrast")
    bc.inputs["Contrast"].default_value = -2.0
    comp = ct.nodes.new("CompositorNodeComposite")
    ct.links.new(rl.outputs["Image"], gl.inputs["Image"])
    ct.links.new(gl.outputs["Image"], hs.inputs["Image"])
    ct.links.new(hs.outputs["Image"], bc.inputs["Image"])
    ct.links.new(bc.outputs["Image"], comp.inputs["Image"])
    return cam


def aim(cam, target, direction, ortho=None, lens=50):
    """Point the camera at target from target + direction."""
    cam.location = Vector(target) + Vector(direction)
    cam.rotation_euler = (Vector(target) - cam.location).to_track_quat("-Z", "Y").to_euler()
    if ortho:
        cam.data.type, cam.data.ortho_scale = "ORTHO", ortho
    else:
        cam.data.type, cam.data.lens = "PERSP", lens
    cam.data.clip_start, cam.data.clip_end = 0.05, 400
