"""Review renders for the crew item kit (Blender EEVEE, headless). Evidence only, not runtime data.

Sheets: panel (reference WEAPONS & TOOLS order), catalog (all items), variants (slot themes),
fx (effects library), anims (item part animation key frames), icons (runtime inventory icons),
held (items on the CHAR-BODY r001 rig in key poses, when the body source is available).
"""
import math
import os

import bpy
import numpy as np
from mathutils import Euler, Matrix, Vector

from . import blend
from .themes import VARIANT_ORDER

BG = (0.003, 0.005, 0.018)
TILE = (0.006, 0.013, 0.040)
LINE = (0.10, 0.45, 1.0)


def emission_mat(name, colour, strength=1.0):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    e = nt.nodes.new("ShaderNodeEmission")
    e.inputs["Color"].default_value = (*colour, 1)
    e.inputs["Strength"].default_value = strength
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(e.outputs[0], out.inputs[0])
    return m


def new_scene(name, width, height, samples, transparent=False):
    """Reuse the context scene (background renders only render the active scene): drop the
    previous sheet's objects and hide the export collection."""
    sc = bpy.context.scene
    for coll in list(sc.collection.children):
        if coll.name in ("EXPORT", "TEMPLATE"):
            bpy.context.view_layer.layer_collection.children[coll.name].exclude = True
            continue
        for ob in list(coll.objects):
            bpy.data.objects.remove(ob, do_unlink=True)
        sc.collection.children.unlink(coll)
        bpy.data.collections.remove(coll)
    for ob in list(sc.collection.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    sc.render.engine = "BLENDER_EEVEE_NEXT"
    sc.render.resolution_x, sc.render.resolution_y = width, height
    sc.render.film_transparent = transparent
    sc.eevee.taa_render_samples = samples
    for attr, val in (("use_shadows", True), ("use_raytracing", False)):
        if hasattr(sc.eevee, attr):
            setattr(sc.eevee, attr, val)
    w = bpy.data.worlds.new(name)
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.02, 0.025, 0.06, 1)
    w.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.6
    sc.world = w
    add_lights(sc, name)
    cam = bpy.data.objects.new(f"{name}.cam", bpy.data.cameras.new(f"{name}.cam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    # Standard (not AgX) keeps saturated emissive colours from rolling off to white (VERIFY batch 1).
    sc.view_settings.view_transform, sc.view_settings.look = "Standard", "None"
    sc.view_settings.exposure, sc.view_settings.gamma = 0.0, 1.0
    sc.use_nodes = True
    ct = sc.node_tree
    ct.nodes.clear()
    rl = ct.nodes.new("CompositorNodeRLayers")
    gl = ct.nodes.new("CompositorNodeGlare")
    gl.glare_type, gl.threshold, gl.size, gl.mix = "FOG_GLOW", 0.5, 8, 0.0
    hs = ct.nodes.new("CompositorNodeHueSat")
    hs.inputs["Saturation"].default_value = 1.25
    bc = ct.nodes.new("CompositorNodeBrightContrast")
    bc.inputs["Contrast"].default_value = -2.0
    comp = ct.nodes.new("CompositorNodeComposite")
    ct.links.new(rl.outputs["Image"], gl.inputs["Image"])
    ct.links.new(gl.outputs["Image"], hs.inputs["Image"])
    ct.links.new(hs.outputs["Image"], bc.inputs["Image"])
    ct.links.new(bc.outputs["Image"], comp.inputs["Image"])
    if transparent:
        ct.links.new(rl.outputs["Alpha"], comp.inputs["Alpha"])
    coll = bpy.data.collections.new(name)
    sc.collection.children.link(coll)
    return sc, cam, coll


TILT = 32


def add_lights(sc, name, tilt=TILT, yaw=0):
    """Lights defined for a virtual camera looking down `tilt` degrees at upright items, rotated
    into the sheet frame (items are tilted toward a level orthographic camera instead)."""
    rx = Matrix.Rotation(math.radians(yaw), 3, "Z") @ Matrix.Rotation(math.radians(tilt), 3, "X")
    for lname, energy, colour, travel in (("Key", 4.0, (1.0, 0.96, 0.9), (0.45, 0.75, -0.55)),
                                          ("Fill", 1.3, (0.55, 0.55, 1.0), (-0.7, 0.55, -0.15)),
                                          ("Rim", 2.2, (0.45, 0.75, 1.0), (0.1, -0.6, -0.8))):
        li = bpy.data.objects.new(f"{name}.{lname}", bpy.data.lights.new(f"{name}.{lname}", "SUN"))
        li.data.energy, li.data.color = energy, colour
        li.data.angle = math.radians(5)
        d = rx @ Vector(travel).normalized()
        li.rotation_euler = Vector((0, 0, -1)).rotation_difference(d).to_euler()
        sc.collection.objects.link(li)


def ortho_front(cam, cx, cz, width):
    cam.data.type, cam.data.ortho_scale, cam.data.sensor_fit = "ORTHO", width, "HORIZONTAL"
    cam.location = (cx, -20, cz)
    cam.rotation_euler = (math.radians(90), 0, 0)
    cam.data.clip_end = 100


def text(coll, body, loc, size, colour=(0.55, 0.85, 1.0), strength=2.2, align="CENTER"):
    cu = bpy.data.curves.new("t", "FONT")
    cu.body, cu.size, cu.align_x = body, size, align
    cu.materials.append(emission_mat(f"txt.{colour}.{strength}", colour, strength))
    ob = bpy.data.objects.new("t", cu)
    coll.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = (math.radians(90), 0, 0)
    return ob


def plane(coll, x0, z0, x1, z1, y, mat):
    me = bpy.data.meshes.new("p")
    me.from_pydata([(x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1)], [], [(0, 1, 2, 3)])
    me.materials.append(mat)
    ob = bpy.data.objects.new("p", me)
    coll.objects.link(ob)
    return ob


def tile(coll, cx, cz, w, h, label=None, sub=None):
    plane(coll, cx - w / 2, cz - h / 2, cx + w / 2, cz + h / 2, 1.0, emission_mat("tile", TILE, 1.0))
    t = 0.006 * w
    for x0, z0, x1, z1 in ((cx - w / 2, cz - h / 2, cx + w / 2, cz - h / 2 + t), (cx - w / 2, cz + h / 2 - t, cx + w / 2, cz + h / 2),
                           (cx - w / 2, cz - h / 2, cx - w / 2 + t, cz + h / 2), (cx + w / 2 - t, cz - h / 2, cx + w / 2, cz + h / 2)):
        plane(coll, x0, z0, x1, z1, 0.99, emission_mat("line", LINE, 1.3))
    if label:
        text(coll, label, (cx, 0.5, cz - h * 0.30), 0.085 * w)
    if sub:
        text(coll, sub, (cx, 0.5, cz - h * 0.40), 0.058 * w, colour=(0.2, 0.65, 1.0), strength=1.8)


# Items whose feature face is +Y (emitter front) turn it toward the camera in sheets.
DISPLAY_YAW = {"shield-emitter": 150}


def view_rotation(yaw=-58, tilt=TILT, roll=0):
    return Matrix.Rotation(math.radians(tilt), 4, "X") @ Matrix.Rotation(math.radians(roll), 4, "Y") @ Matrix.Rotation(math.radians(yaw), 4, "Z")


def fit_matrix(item, cx, cz, size, rot):
    """Scale/centre an item so its rotated bounds fit a size x size square centred at (cx, cz)."""
    b = item.bounds()
    corners = [Vector(item.to_metres((x, y, z))) for x in (b[0], b[3]) for y in (b[1], b[4]) for z in (b[2], b[5])]
    rc = [rot.to_3x3() @ c for c in corners]
    xs, zs = [c.x for c in rc], [c.z for c in rc]
    s = size / max(max(xs) - min(xs), max(zs) - min(zs))
    centre = Vector(((max(xs) + min(xs)) / 2, 0, (max(zs) + min(zs)) / 2))
    return Matrix.Translation(Vector((cx, 0, cz)) - centre * s) @ Matrix.Scale(s, 4) @ rot, s


def render(sc, path):
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print(f"[render] {path}")


def fit_fx(f, cx, cz, size, rot):
    b = f.bounds()
    corners = [Vector((x * f.voxel, y * f.voxel, z * f.voxel)) for x in (b[0], b[3]) for y in (b[1], b[4]) for z in (b[2], b[5])]
    rc = [rot.to_3x3() @ c for c in corners]
    xs, zs = [c.x for c in rc], [c.z for c in rc]
    s = size / max(max(xs) - min(xs), max(zs) - min(zs), 1e-3)
    centre = Vector(((max(xs) + min(xs)) / 2, 0, (max(zs) + min(zs)) / 2))
    return Matrix.Translation(Vector((cx, 0, cz)) - centre * s) @ Matrix.Scale(s, 4) @ rot


# ------------------------------------------------------------------------------ sheets
def sheet_panel(o, items, by_id, order, name, title, subtitle, cols=6):
    rows = (len(order) + cols - 1) // cols
    w, h = cols * 1.0 + 0.2, rows * 1.0 + 0.55
    px = 1720
    sc, cam, coll = new_scene(name, px, int(px * h / w), o.samples)
    plane(coll, -0.1, -h + 0.45, w - 0.1, 0.55, 1.2, emission_mat("bg", BG, 1.0))
    text(coll, title, (0.02, 0.5, 0.30), 0.15, align="LEFT", colour=(0.3, 0.8, 1.0), strength=2.6)
    text(coll, subtitle, (0.02, 0.5, 0.17), 0.065, align="LEFT", colour=(0.55, 0.85, 1.0), strength=1.6)
    for i, iid in enumerate(order):
        r, c = divmod(i, cols)
        cx, cz = 0.5 + c * 1.0, -0.55 - r * 1.0
        it = by_id[iid]
        tile(coll, cx, cz, 0.94, 0.94, it.meta["label"], it.meta["sub"])
        rot = view_rotation(yaw=DISPLAY_YAW.get(iid, -58))
        m, _ = fit_matrix(it, cx, cz + 0.11, 0.70, rot)
        blend.spawn(it, it.theme, m, coll)
    ortho_front(cam, w / 2 - 0.1, -h / 2 + 0.5, w)
    render(sc, os.path.join(o.renders, f"{name}.png"))


def sheet_catalog(o, items, by_id):
    groups = [("WEAPONS", "BALLISTIC • ENERGY • MELEE • THROWN",
               ["pistol", "smg", "compact-carbine", "rifle", "shotgun", "heavy-gun", "beam-rifle", "rail-rifle", "stun-gun", "baton", "grenade"]),
              ("MEDICAL & TOOLS", "HEAL • REPAIR • BUILD • EXTRACT",
               ["medgun", "medkit", "utility-cutter", "repair-tool", "welder", "multi-tool", "mining-drill", "wrench"]),
              ("UTILITY & CARRY", "SCAN • DEFEND • TRAVERSE • HAUL",
               ["scanner", "sample-scanner", "data-pad", "shield-emitter", "flashlight", "grapple", "drone", "cargo-box", "shield-pack"])]
    cols = 7
    layout, z = [], 0.0
    for title, sub, ids in groups:
        layout.append(("title", title, sub, z))
        z -= 0.45
        for i, iid in enumerate(ids):
            r, c = divmod(i, cols)
            layout.append(("item", iid, 0.5 + c * 1.0, z - 0.5 - r * 1.0))
        z -= 1.0 * ((len(ids) + cols - 1) // cols) + 0.1
    w, h = cols + 0.2, -z + 0.2
    px = 1800
    sc, cam, coll = new_scene("catalog", px, int(px * h / w), o.samples)
    plane(coll, -0.1, z - 0.1, w - 0.1, 0.3, 1.2, emission_mat("bg", BG, 1.0))
    for entry in layout:
        if entry[0] == "title":
            text(coll, entry[1], (0.02, 0.5, entry[3] - 0.16), 0.13, align="LEFT", colour=(0.3, 0.8, 1.0), strength=2.6)
            text(coll, entry[2], (0.02, 0.5, entry[3] - 0.30), 0.06, align="LEFT", colour=(0.55, 0.85, 1.0), strength=1.6)
        else:
            _, iid, cx, cz = entry
            it = by_id[iid]
            tile(coll, cx, cz, 0.94, 0.94, it.meta["label"], it.meta["sub"])
            m, _ = fit_matrix(it, cx, cz + 0.12, 0.62, view_rotation(yaw=DISPLAY_YAW.get(iid, -58)))
            blend.spawn(it, it.theme, m, coll)
    ortho_front(cam, w / 2 - 0.1, (z + 0.3) / 2, w)
    render(sc, os.path.join(o.renders, "catalog.png"))


def sheet_variants(o, by_id, name, ids):
    cols, rows = len(ids), len(VARIANT_ORDER)
    w, h = cols * 0.8 + 1.1, rows * 0.8 + 0.6
    px = 2000
    sc, cam, coll = new_scene(name, px, int(px * h / w), o.samples)
    plane(coll, -1.1, -h + 0.5, w - 1.1, 0.5, 1.2, emission_mat("bg", BG, 1.0))
    text(coll, "SLOT THEMES — SAME MESH, SWAPPED MATERIAL TABLE", (-1.05, 0.5, 0.25), 0.1, align="LEFT", colour=(0.3, 0.8, 1.0), strength=2.6)
    for c, iid in enumerate(ids):
        text(coll, by_id[iid].meta["label"], (0.4 + c * 0.8, 0.5, 0.02), 0.052)
    for r, theme in enumerate(VARIANT_ORDER):
        cz = -0.4 - r * 0.8
        text(coll, theme.upper(), (-1.02, 0.5, cz - 0.03), 0.075, align="LEFT")
        for c, iid in enumerate(ids):
            cx = 0.4 + c * 0.8
            plane(coll, cx - 0.38, cz - 0.38, cx + 0.38, cz + 0.38, 1.0, emission_mat("tile", TILE, 1.0))
            m, _ = fit_matrix(by_id[iid], cx, cz, 0.62, view_rotation(yaw=DISPLAY_YAW.get(iid, -58)))
            blend.spawn(by_id[iid], theme, m, coll)
    ortho_front(cam, w / 2 - 1.1, -h / 2 + 0.5, w)
    render(sc, os.path.join(o.renders, f"{name}.png"))


def sheet_fx(o, by_id, fxs):
    fx_by = {f.id: f for f in fxs}
    order = ["muzzle-flash", "laser-bolt", "plasma-bolt", "healing-beam", "scan-pulse", "shield-bubble",
             "impact-spark", "smoke-puff", "thruster-glow", "pickup-glow", "repair-sparks", "teleport",
             "tracer", "beam-lance", "stun-arc"]
    context = {"muzzle-flash": "pistol", "laser-bolt": "beam-rifle", "healing-beam": "medgun", "scan-pulse": "scanner",
               "shield-bubble": "shield-emitter", "repair-sparks": "repair-tool",
               "pickup-glow": "grenade", "beam-lance": "beam-rifle", "stun-arc": "stun-gun", "tracer": "rifle"}
    cols = 6
    rows = (len(order) + cols - 1) // cols
    w, h = cols + 0.2, rows + 0.55
    px = 1720
    sc, cam, coll = new_scene("fx", px, int(px * h / w), o.samples)
    plane(coll, -0.1, -h + 0.45, w - 0.1, 0.55, 1.2, emission_mat("bg", BG, 1.0))
    text(coll, "EFFECTS LIBRARY", (0.02, 0.5, 0.30), 0.15, align="LEFT", colour=(0.3, 0.8, 1.0), strength=2.6)
    text(coll, "PARTICLE & VFX ASSETS — VOXEL EMISSIVE MESHES + PLAYBACK SPEC (PRESENTATION ONLY)", (0.02, 0.5, 0.17), 0.055,
         align="LEFT", colour=(0.55, 0.85, 1.0), strength=1.6)
    for i, fid in enumerate(order):
        r, c = divmod(i, cols)
        cx, cz = 0.5 + c * 1.0, -0.55 - r * 1.0
        f = fx_by[fid]
        tile(coll, cx, cz, 0.94, 0.94, f.label, f.sub)
        rot = view_rotation(yaw=-100, tilt=18)
        if f.kind in ("pulse", "column", "shell") or fid == "teleport":
            rot = view_rotation(yaw=-30, tilt=28)
        iid = context.get(fid)
        if iid:
            it = by_id[iid]
            m, s = fit_matrix(it, cx - 0.2, cz + 0.02, 0.36, view_rotation(yaw=-100, tilt=18))
            if fid in ("scan-pulse", "shield-bubble", "pickup-glow"):
                m, s = fit_matrix(it, cx, cz + 0.02, 0.22, view_rotation(yaw=-30, tilt=28))
            blend.spawn(it, it.theme, m, coll)
            key = "muzzle" if "muzzle" in it.sockets else "emitter" if "emitter" in it.sockets else "grip"
            anchor = m @ Vector(it.to_metres(it.sockets[key]["position"]))
            if fid in ("scan-pulse", "shield-bubble", "pickup-glow"):
                fm = fit_fx(f, cx, cz + 0.1, 0.72, rot)
            elif fid == "thruster-glow":
                down = view_rotation(yaw=-100, tilt=18) @ Matrix.Rotation(math.radians(-90), 4, "X")
                for px in (1, 7):
                    blend.spawn_fx(f, Matrix.Translation(m @ Vector(it.to_metres((px, 4, 1)))) @ Matrix.Scale(s * 1.6, 4) @ down, coll)
                fm = None
            else:
                d = m.to_3x3() @ Vector((0, 1, 0))
                fm = Matrix.Translation(anchor) @ Matrix.Scale(s, 4) @ view_rotation(yaw=-100, tilt=18)
                if f.kind == "beam":
                    fm = fm @ Matrix.Diagonal((1, 0.45 / (s * f.length), 1, 1))
            if fm is not None:
                blend.spawn_fx(f, fm, coll)
        else:
            size = 0.42 if fid in ("plasma-bolt", "thruster-glow") else 0.62
            blend.spawn_fx(f, fit_fx(f, cx, cz + 0.08, size, rot), coll)
    ortho_front(cam, w / 2 - 0.1, -h / 2 + 0.5, w)
    render(sc, os.path.join(o.renders, "fx_library.png"))


def sheet_anims(o, by_id):
    rows = [(iid, anim, frames) for iid, anim, frames in (
        ("pistol", "fire", (0, 2, 4, 6)), ("compact-carbine", "reload", (0, 5, 14, 20)), ("shotgun", "fire", (0, 3, 6, 10)),
        ("heavy-gun", "reload", (0, 6, 16, 24)), ("beam-rifle", "reload", (0, 5, 14, 20)), ("grapple", "fire", (0, 3, 10, 14)),
        ("mining-drill", "use", (0, 3, 6, 9)), ("baton", "deploy", (0, 2, 4, 6)), ("grenade", "use", (0, 2, 4, 6)),
        ("drone", "idle", (0, 1, 2, 3)))]
    cols = 4
    w, h = cols * 1.0 + 1.3, len(rows) * 0.62 + 0.5
    px = 1500
    sc, cam, coll = new_scene("anims", px, int(px * h / w), o.samples)
    plane(coll, -1.3, -h + 0.45, w - 1.3, 0.5, 1.2, emission_mat("bg", BG, 1.0))
    text(coll, "ITEM PART ANIMATIONS (glTF clips, 24 fps)", (-1.25, 0.5, 0.2), 0.09, align="LEFT", colour=(0.3, 0.8, 1.0), strength=2.6)
    for r, (iid, anim, frames) in enumerate(rows):
        cz = -0.3 - r * 0.62
        text(coll, f"{by_id[iid].meta['label']}  ·  {anim}", (-1.25, 0.5, cz - 0.02), 0.06, align="LEFT")
        for c, fr in enumerate(frames):
            cx = 0.5 + c * 1.0
            plane(coll, cx - 0.48, cz - 0.29, cx + 0.48, cz + 0.29, 1.0, emission_mat("tile", TILE, 1.0))
            text(coll, f"f{fr}", (cx + 0.4, 0.5, cz - 0.26), 0.045, colour=(0.2, 0.65, 1.0))
            m, _ = fit_matrix(by_id[iid], cx, cz, 0.5, view_rotation())
            blend.spawn(by_id[iid], by_id[iid].theme, m, coll, pose=(anim, fr))
    ortho_front(cam, w / 2 - 1.3, -h / 2 + 0.45, w)
    render(sc, os.path.join(o.renders, "item_animations.png"))


def sheet_lineup(o, by_id):
    """True-scale line-up (no normalisation) against a 0.25 m grid with the spec-v2 chibi
    head-width (0.52 m) and shoulder-width (0.56 m) bars: VERIFY W3 scale evidence."""
    rows = [("WEAPONS", ["pistol", "stun-gun", "smg", "medgun", "compact-carbine", "rifle", "shotgun", "beam-rifle", "rail-rifle", "heavy-gun"]),
            ("TOOLS", ["repair-tool", "welder", "multi-tool", "sample-scanner", "scanner", "utility-cutter", "wrench", "baton", "mining-drill", "flashlight", "grapple"]),
            ("CARRY / UTILITY", ["data-pad", "medkit", "shield-emitter", "grenade", "drone", "cargo-box", "shield-pack"])]
    rot = view_rotation(yaw=-90, tilt=14)
    placed, z = [], 0.0
    width = 0.0
    for title, ids in rows:
        x, row_h = 0.0, 0.0
        for iid in ids:
            it = by_id[iid]
            b = it.bounds()
            corners = [rot.to_3x3() @ Vector(it.to_metres((cx, cy, cz))) for cx in (b[0], b[3]) for cy in (b[1], b[4]) for cz in (b[2], b[5])]
            xs, zs = [c.x for c in corners], [c.z for c in corners]
            wdt, hgt = max(xs) - min(xs), max(zs) - min(zs)
            placed.append((it, x - min(xs), z, rot, wdt))
            x += wdt + 0.12
            row_h = max(row_h, hgt)
        width = max(width, x)
        placed.append((title, 0, z, None, 0))
        z -= row_h + 0.28
    z -= 0.1
    w, h = width + 0.9, -z + 0.5
    px = 2400
    sc, cam, coll = new_scene("lineup", px, int(px * h / w), o.samples)
    plane(coll, -0.8, z - 0.2, w, 0.4, 1.2, emission_mat("bg", BG, 1.0))
    grid = emission_mat("grid", (0.02, 0.06, 0.16), 1.0)
    major = emission_mat("gridmajor", (0.04, 0.14, 0.35), 1.0)
    k = 0
    while k * 0.25 <= w + 0.8:
        gx = -0.8 + k * 0.25
        plane(coll, gx - 0.002, z - 0.2, gx + 0.002, 0.4, 1.1, major if k % 4 == 0 else grid)
        k += 1
    k = 0
    while k * 0.25 <= h + 0.4:
        gz = 0.4 - k * 0.25
        plane(coll, -0.8, gz - 0.002, w, gz + 0.002, 1.1, major if k % 4 == 0 else grid)
        k += 1
    for it, x0, ztop, r, wdt in placed:
        if r is None:
            text(coll, it, (-0.78, 0.5, ztop - 0.08), 0.07, align="LEFT", colour=(0.3, 0.8, 1.0), strength=2.6)
            continue
        m = Matrix.Translation(Vector((x0, 0, ztop - 0.02))) @ r
        corners = [r.to_3x3() @ Vector(it.to_metres((cx, cy, cz))) for cx in (it.bounds()[0], it.bounds()[3]) for cy in (it.bounds()[1], it.bounds()[4]) for cz in (it.bounds()[2], it.bounds()[5])]
        m = Matrix.Translation(Vector((0, 0, -max(c.z for c in corners)))) @ m
        blend.spawn(it, it.theme, m, coll)
        text(coll, it.meta["label"], (x0 + wdt / 2, 0.5, ztop - max(c.z for c in corners) + min(c.z for c in corners) - 0.1), 0.05)
    for label, length, zb in (("HEAD WIDTH 0.52 m (spec v2)", 0.52, 0.25), ("SHOULDER WIDTH 0.56 m", 0.56, 0.12)):
        plane(coll, 0.0, zb, length, zb + 0.025, 0.9, emission_mat("bar", (1.0, 0.45, 0.1), 2.0))
        text(coll, label, (length + 0.05, 0.5, zb - 0.005), 0.045, align="LEFT", colour=(1.0, 0.7, 0.4))
    text(coll, "TRUE SCALE — 0.25 m GRID, 1 m MAJOR", (1.4, 0.5, 0.2), 0.06, align="LEFT", colour=(0.3, 0.8, 1.0), strength=2.6)
    ortho_front(cam, (w - 0.8) / 2 - 0.0, (0.4 + z - 0.2) / 2, w + 0.8)
    render(sc, os.path.join(o.renders, "lineup_true_scale.png"))


def icons(o, items):
    out = os.path.join(o.out, "icons")
    os.makedirs(out, exist_ok=True)
    sc, cam, coll = new_scene("icons", 256, 256, max(16, o.samples // 2), transparent=True)
    ortho_front(cam, 0, 0, 1.0)
    for it in items:
        for ob in list(coll.objects):
            bpy.data.objects.remove(ob, do_unlink=True)
        m, _ = fit_matrix(it, 0, 0, 0.86, view_rotation(yaw=DISPLAY_YAW.get(it.id, -58)))
        blend.spawn(it, it.theme, m, coll)
        render(sc, os.path.join(out, f"{it.id}.png"))


def compose_comparison(o, crop_dir):
    """Reference WEAPONS & TOOLS panel crop stacked over the r001 panel render (review evidence)."""
    src = "/root/.t3/userdata/attachments/ad8dac06-c263-4449-938d-4cd5b1e17c74-8041da1d-0011-4874-bf9f-5cf811ee6b45.png"
    ours = os.path.join(o.renders, "weapons_tools_panel.png")
    if not (os.path.exists(src) and os.path.exists(ours)):
        return
    ref = bpy.data.images.load(src)
    rw, rh = ref.size
    rp = np.array(ref.pixels[:], dtype=np.float32).reshape(rh, rw, 4)[::-1]
    rp = rp[78:400, 603:1432]                 # exact WEAPONS & TOOLS panel pixels (top-left origin)
    img = bpy.data.images.load(ours)
    ow, oh = img.size
    op = np.array(img.pixels[:], dtype=np.float32).reshape(oh, ow, 4)[::-1]
    scale = ow / rp.shape[1]
    ys = (np.arange(int(rp.shape[0] * scale)) / scale).astype(int)
    xs = (np.arange(ow) / scale).astype(int).clip(0, rp.shape[1] - 1)
    rp = rp[ys][:, xs]
    out = np.concatenate([rp, np.full((12, ow, 4), (0.05, 0.05, 0.08, 1), np.float32), op], 0)
    h = out.shape[0]
    im = bpy.data.images.new("comparison", ow, h, alpha=True)
    im.pixels.foreach_set(out[::-1].ravel())
    im.filepath_raw, im.file_format = os.path.join(o.renders, "comparison_weapons_tools.png"), "PNG"
    im.save()
    print("[render] comparison_weapons_tools.png")


def run(o, items, fxs, data):
    os.makedirs(o.renders, exist_ok=True)
    by_id = {i.id: i for i in items}
    want = set(o.sheets.split(",")) if o.sheets != "all" else {"panel", "catalog", "variants", "fx", "lineup", "anims", "icons", "held"}
    from .items import REFERENCE_PANEL
    if "panel" in want:
        sheet_panel(o, items, by_id, REFERENCE_PANEL, "weapons_tools_panel", "WEAPONS & TOOLS", "SIMPLE. SWAPPABLE. CREW-READY.  (r003 voxel proposal)")
        compose_comparison(o, None)
    if "catalog" in want:
        sheet_catalog(o, items, by_id)
    if "variants" in want:
        sheet_variants(o, by_id, "variants_weapons", ["pistol", "smg", "compact-carbine", "rifle", "shotgun", "heavy-gun", "beam-rifle", "rail-rifle", "stun-gun", "baton"])
        sheet_variants(o, by_id, "variants_tools", ["medgun", "utility-cutter", "repair-tool", "welder", "multi-tool", "mining-drill", "scanner", "data-pad", "shield-emitter", "grapple"])
    if "fx" in want:
        sheet_fx(o, by_id, fxs)
    if "lineup" in want:
        sheet_lineup(o, by_id)
    if "anims" in want:
        sheet_anims(o, by_id)
    if "icons" in want:
        icons(o, items)
    if "held" in want and os.path.exists(o.body):
        from . import held
        held.run(o, items, by_id)
