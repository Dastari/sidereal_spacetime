"""Editable Blender engine kit for the framed Wayfarer native revision.

Called by the managed art runner inside Blender: build_all(output_directory).
The visual envelope and physical exhaust sockets are retained from the installed
catalog and flight.ts. This module does not change gameplay or generate flames.
"""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
STEP = 1 / 32


def _sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def _finish_maps(directory):
    """Packed authored face finish, including recessed bolts and shallow seams."""
    directory.mkdir(parents=True, exist_ok=True)
    size = 256
    yy, xx = np.mgrid[0:size, 0:size]
    u, v = xx / (size - 1), yy / (size - 1)
    rng = np.random.default_rng(914)
    height = np.zeros((size, size), dtype=np.float32)
    # Small fasteners and an inset edge are texture detail, never faux openings.
    border = np.minimum.reduce((u, v, 1 - u, 1 - v))
    height[(border > .049) & (border < .057)] = -.18
    dark = np.zeros_like(height)
    dark[(border > .049) & (border < .057)] = .22
    for cx in (.095, .905):
        for cy in (.095, .905):
            distance = np.sqrt((u - cx) ** 2 + (v - cy) ** 2)
            height[distance < .014] = -.55
            dark[distance < .017] = .7
            height[(distance >= .014) & (distance < .021)] = .16
    dark[(u > .23) & (u < .47) & (v > .898) & (v < .91)] = .2
    noise = rng.normal(0, .008, height.shape)
    dx, dy = np.gradient(height)
    normal = np.stack((-dy * 2.8, -dx * 2.8, np.ones_like(height)), axis=-1)
    normal /= np.linalg.norm(normal, axis=-1)[:, :, None]
    normal = normal * .5 + .5
    result = {}

    def image(name, rgb, noncolor=False):
        rgba = np.concatenate((rgb, np.ones((*rgb.shape[:2], 1))), axis=-1)
        data = bpy.data.images.new(name, width=size, height=size, alpha=True)
        if noncolor:
            data.colorspace_settings.name = "Non-Color"
        data.pixels.foreach_set(rgba.astype(np.float32).ravel())
        data.filepath_raw = str(directory / f"{name}.png")
        data.file_format = "PNG"
        data.save()
        data.pack()
        return data

    result["normal"] = image("engine-finish-normal", normal, True)
    rough = np.clip(.54 + noise * 2 + dark * .15, 0, 1)
    result["roughness"] = image("engine-finish-roughness", np.repeat(rough[:, :, None], 3, axis=2), True)
    colors = {
        "pale": (.66, .69, .74),
        "red": (.34, .036, .049),
        "navy": (.043, .056, .088),
    }
    for name, color in colors.items():
        base = np.array(color)[None, None, :] * (1 - dark[:, :, None] * .9)
        base = np.clip(base + noise[:, :, None], 0, 1)
        result[name] = image(f"engine-{name}-finish", base)
    return result


def _materials(directory):
    maps = _finish_maps(directory)
    result = {}
    recipes = {
        "pale": ((.66, .69, .74), .17, .36),
        "red": ((.34, .036, .049), .13, .39),
        "navy": ((.043, .056, .088), .36, .46),
        "steel": ((.10, .13, .18), .75, .33),
        "core": ((.006, .014, .027), .28, .48),
        "cyan": ((.015, .5, .75), .08, .24),
        "amber": ((1, .25, .026), .05, .28),
    }
    for name, (color, metal, rough) in recipes.items():
        mat = bpy.data.materials.new(f"MAT-framed-engine-{name}")
        mat.use_nodes = True
        shader = mat.node_tree.nodes.get("Principled BSDF")
        shader.inputs["Base Color"].default_value = (*color, 1)
        shader.inputs["Metallic"].default_value = metal
        shader.inputs["Roughness"].default_value = rough
        if name in ("pale", "red", "navy"):
            for key, socket in ((name, "Base Color"), ("roughness", "Roughness")):
                node = mat.node_tree.nodes.new("ShaderNodeTexImage")
                node.image = maps[key]
                node.interpolation = "Linear"
                mat.node_tree.links.new(node.outputs["Color"], shader.inputs[socket])
            node = mat.node_tree.nodes.new("ShaderNodeTexImage")
            node.image = maps["normal"]
            normal = mat.node_tree.nodes.new("ShaderNodeNormalMap")
            normal.inputs["Strength"].default_value = .35
            mat.node_tree.links.new(node.outputs["Color"], normal.inputs["Color"])
            mat.node_tree.links.new(normal.outputs["Normal"], shader.inputs["Normal"])
        if name in ("cyan", "amber"):
            shader.inputs["Emission Color"].default_value = (*color, 1)
            shader.inputs["Emission Strength"].default_value = 2.2 if name == "cyan" else 2.8
        result[name] = mat
    return result


class Model:
    def __init__(self, asset, label, materials):
        self.asset = asset
        self.label = label
        self.materials = materials
        self.objects = []
        self.collection = bpy.data.collections.new(f"ENGINE-{asset}")
        bpy.context.scene.collection.children.link(self.collection)
        self.authoring = bpy.data.collections.new(f"AUTHORING-{asset}")
        self.collection.children.link(self.authoring)
        self.root = bpy.data.objects.new(f"ASSET-{asset}", None)
        self.collection.objects.link(self.root)
        self.root["asset_id"] = asset
        self.root["units"] = "metres; Blender X right, Y forward, Z up"
        self.root["authoring"] = "Native editable Blender surfaces; separate runtime collision/damage proxy retained"

    def mesh(self, name, vertices, faces, material, bevel=0):
        mesh = bpy.data.meshes.new(f"MESH-{self.asset}-{name}")
        mesh.from_pydata(vertices, [], faces)
        mesh.update()
        obj = bpy.data.objects.new(f"GEO-{self.asset}-{name}", mesh)
        self.authoring.objects.link(obj)
        obj.parent = self.root
        mesh.materials.append(self.materials[material])
        uv = mesh.uv_layers.new(name="PanelFinish")
        lows = [min(v[a] for v in vertices) for a in range(3)]
        highs = [max(v[a] for v in vertices) for a in range(3)]
        for poly in mesh.polygons:
            major = max(range(3), key=lambda a: abs(poly.normal[a]))
            axes = [a for a in range(3) if a != major]
            for loop in poly.loop_indices:
                vert = mesh.vertices[mesh.loops[loop].vertex_index].co
                uv.data[loop].uv = tuple((vert[a] - lows[a]) / max(highs[a] - lows[a], .001) for a in axes)
        if bevel:
            modifier = obj.modifiers.new("Authored highlight bevel", "BEVEL")
            modifier.width = bevel
            modifier.segments = 1
            modifier.affect = "EDGES"
        self.objects.append(obj)
        return obj

    def box(self, name, lo, hi, material, bevel=STEP / 4):
        x0, y0, z0 = lo
        x1, y1, z1 = hi
        vertices = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
                    (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
        faces = [(3, 2, 1, 0), (4, 5, 6, 7), (0, 1, 5, 4),
                 (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
        return self.mesh(name, vertices, faces, material, bevel)

    def socket(self, name, position, direction=None):
        obj = bpy.data.objects.new(f"{name}-{self.asset}", None)
        self.collection.objects.link(obj)
        obj.parent = self.root
        obj.location = position
        obj.empty_display_size = .2
        if direction:
            obj["outward_direction"] = list(direction)
        return obj


def _octagon(cx, cz, width, height, chamfer):
    x0, x1 = cx - width / 2, cx + width / 2
    z0, z1 = cz - height / 2, cz + height / 2
    c = min(chamfer, width / 3, height / 3)
    return [(x0 + c, z0), (x1 - c, z0), (x1, z0 + c), (x1, z1 - c),
            (x1 - c, z1), (x0 + c, z1), (x0, z1 - c), (x0, z0 + c)]


def _loft(model, name, sections, material, caps=True):
    # Each section is Y plus an ordered XZ polygon. Positive polygon winding has
    # normal -Y, so front/back caps and the swept skin use opposite winding.
    vertices = [(x, y, z) for y, polygon in sections for x, z in polygon]
    n = len(sections[0][1])
    faces = []
    for section in range(len(sections) - 1):
        for i in range(n):
            j = (i + 1) % n
            a, b = section * n, (section + 1) * n
            faces.append((a + i, b + i, b + j, a + j))
    if caps:
        faces.extend([tuple(range(n)), tuple(reversed(range((len(sections) - 1) * n, len(sections) * n)))])
    return model.mesh(name, vertices, faces, material)


def _ring(model, name, y0, y1, cx, cz, width, height, opening, material, chamfer=.25):
    outer = _octagon(cx, cz, width, height, chamfer)
    inner = _octagon(cx, cz, opening, opening, min(chamfer, opening / 6))
    vertices = [(x, y, z) for y in (y0, y1) for shape in (outer, inner) for x, z in shape]
    faces = []
    for i in range(8):
        j = (i + 1) % 8
        faces += [(i, 16 + i, 16 + j, j), (8 + j, 24 + j, 24 + i, 8 + i),
                  (i, j, 8 + j, 8 + i), (16 + j, 16 + i, 24 + i, 24 + j)]
    return model.mesh(name, vertices, faces, material)


def _nozzle(model, cx, cy, cz, outer, opening, depth):
    # A recessed throat, two metal octagonal collars and eight separate emitter
    # bars read as a physical nozzle with throttle absent. No flame geometry.
    _ring(model, "nozzle-outer-collar", cy, cy + depth * .22, cx, cz, outer, outer,
          opening, "steel", outer / 7)
    _ring(model, "nozzle-segmented-housing", cy + depth * .22, cy + depth * .78,
          cx, cz, outer * .96, outer * .96, opening * .99, "navy", outer / 7)
    _loft(model, "recessed-dark-throat", [
        (cy + depth * .74, _octagon(cx, cz, opening * .95, opening * .95, opening / 7)),
        (cy + depth, _octagon(cx, cz, opening * .91, opening * .91, opening / 7)),
    ], "core")
    # The emitter is behind the exact physical exit plane, never outside it.
    shape = _octagon(cx, cz, opening, opening, opening / 6)
    centre = Vector((cx, cz))
    for index in range(8):
        a, b = Vector(shape[index]), Vector(shape[(index + 1) % 8])
        mid = (a + b) * .5
        a, b = mid + (a - mid) * .64, mid + (b - mid) * .64
        av, bv = (a - centre).normalized(), (b - centre).normalized()
        width = .0375 if outer > 1 else .01875
        a2, b2 = a + av * width, b + bv * width
        vertices = [(p.x, y, p.y) for y in (cy + depth * .15, cy + depth * .20) for p in (a, b, b2, a2)]
        faces = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1),
                 (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
        model.mesh(f"nozzle-cyan-segment-{index:02d}", vertices,
                   [tuple(reversed(face)) for face in faces], "cyan")


def _main(model, bounds, nozzle, small=False):
    lo, hi = bounds["min"], bounds["max"]
    cx = (lo[0] + hi[0]) / 2
    width, height = hi[0] - lo[0], hi[2]
    cy, cz = nozzle[1], nozzle[2]
    # Native small variant keeps its own exact envelope; no object scaling.
    w = .75 if small else 1
    front, body_rear = hi[1], cy + (.75 if small else 1.25)
    _loft(model, "octagonal-pressure-case", [
        (body_rear - .16, _octagon(cx, height / 2, width - .25, height - .5, .25 * w)),
        (front - .55 * w, _octagon(cx, height / 2, width - .1875, height - .5, .25 * w)),
        (front, _octagon(cx, height / 2, width - .5, height - .5, .25 * w)),
    ], "navy")
    # Four long frame rails make the pod read as a framed assembly, not a barrel.
    for side in (-1, 1):
        x0 = lo[0] + .125 if side < 0 else hi[0] - .40625
        for z in (.1875, height - .40625):
            model.box(f"long-frame-{side}-{z}", (x0, body_rear + .125, z),
                      (x0 + .28125, front - .0625, z + .21875), "pale", .03125)
        # Broad side armor and a dark inset identity/service bay.
        x0, x1 = (lo[0], lo[0] + .1875) if side < 0 else (hi[0] - .1875, hi[0])
        y0, y1 = body_rear + .12, front - .52 * w
        z0, z1 = .4375 * w, height - .4375 * w
        bay_y = y0 + (y1 - y0) * .22
        # Separate pieces surround a genuinely recessed service bay. An overlay
        # on the same white face would cause z fighting and hide the lamp.
        field_x0, field_x1 = (x0 + .005, x1) if side < 0 else (x0, x1 - .005)
        model.box(f"side-main-armor-{side}", (field_x0, bay_y + .6 * w, z0),
                  (field_x1, y1, z1), "pale", .03125 * w)
        # Shallow native stamped badge: the orbit is actual authored geometry,
        # not a new texture/material/draw call. Kept inside the side frame bounds.
        badge_x = x0 + .002 if side < 0 else x1 - .002
        badge_y = (bay_y + .6 * w + y1) / 2
        badge_z = (z0 + z1) / 2 + .04
        radius = .245 * w
        disc = [(badge_x, badge_y + radius * math.cos(i * math.tau / 16),
                 badge_z + radius * math.sin(i * math.tau / 16)) for i in range(16)]
        model.mesh(f"planet-identity-stamp-{side}", disc,
                   [tuple(range(16)) if side > 0 else tuple(reversed(range(16)))], "core")
        tilt = -.32
        orbit = []
        for layer in (1, .89):
            for i in range(24):
                theta = i * math.tau / 24
                a, b = math.cos(theta) * radius * 1.52 * layer, math.sin(theta) * radius * .41 * layer
                orbit.append((badge_x - side * -.001, badge_y + a * math.cos(tilt) - b * math.sin(tilt),
                              badge_z + a * math.sin(tilt) + b * math.cos(tilt)))
        faces = [(i, (i + 1) % 24, 24 + (i + 1) % 24, 24 + i) for i in range(24)]
        if side < 0:
            faces = [tuple(reversed(f)) for f in faces]
        model.mesh(f"red-orbit-identity-stamp-{side}", orbit, faces, "red")
        model.box(f"side-leading-armor-{side}", (x0, y0, z0),
                  (x1, bay_y - .02, z1), "pale", .03125 * w)
        for za, zb in ((z0, z0 + .14), (z1 - .14, z1)):
            model.box(f"service-bay-frame-{side}-{za}", (x0, bay_y - .01, za),
                      (x1, bay_y + .61 * w, zb), "pale", .015625)
        px0, px1 = (x0 + .03, x0 + .05) if side < 0 else (x1 - .05, x1 - .03)
        model.box(f"side-navy-service-inset-{side}", (px0, bay_y, z0 + .14),
                  (px1, bay_y + .52 * w, z1 - .14), "navy", .025)
        case_x = (px0 - .009, px0 - .004) if side < 0 else (px1 + .004, px1 + .009)
        model.box(f"amber-lamp-case-{side}", (case_x[0], bay_y + .08, z0 + .24),
                  (case_x[1], bay_y + .19, z1 - .24), "steel", .002)
        # Lamps sit marginally proud of the bay, remaining within the bound.
        lamp_x = (lo[0] + .013, lo[0] + .019) if side < 0 else (hi[0] - .019, hi[0] - .013)
        for seg in range(3):
            start = z0 + .3 + seg * (z1 - z0 - .55) / 3
            model.box(f"amber-status-{side}-{seg}", (lamp_x[0], bay_y + .105, start),
                      (lamp_x[1], bay_y + .165, start + (z1 - z0 - .7) / 3), "amber", .003)
    # Front mounting bulkhead and toes reach retained exact Y and Z bounds.
    model.box("front-mount-beam", (cx - width * .32, front - .125, .375),
              (cx + width * .32, front, height - .375), "steel", .03125)
    for side in (-1, 1):
        mid = cx + side * width * .28
        model.box(f"mount-foot-{side}", (mid - .14, body_rear + .25, 0),
                  (mid + .14, front - .22, .25), "steel", .03125)
    # Cooling bay: actual depressed deck and six thick louvres, fine bolts mapped.
    top_y0, top_y1 = body_rear + .25, front - .625 * w
    model.box("top-cooling-well", (cx - width * .27, top_y0, height - .27),
              (cx + width * .27, top_y1, height - .16), "core", .015625)
    for i in range(6):
        y = top_y0 + .1 + i * (top_y1 - top_y0 - .2) / 6
        model.box(f"top-cooling-louvre-{i}", (cx - width * .265, y, height - .15625),
                  (cx + width * .265, y + .055 * w, height - .075), "steel", .008)
    for y, length in ((top_y0 - .13, .1875), (top_y1 - .02, .28125)):
        model.box(f"top-pale-bridge-{y}", (cx - width * .39, y, height - .1875),
                  (cx + width * .39, y + length, height), "pale", .03125)
    belt_y0 = body_rear - .26 * w
    _ring(model, "red-service-belt", belt_y0, body_rear + .125,
          cx, height / 2, width - .09375, height - .0625,
          min(width, height) * .68, "red", .25 * w)
    for side in (-1, 1):
        model.box(f"red-belt-latch-{side}",
                  (cx + side * (width / 2 - .19) - .065, belt_y0 + .06, height - .375),
                  (cx + side * (width / 2 - .19) + .065, body_rear + .06, height - .21875),
                  "steel", .012)
    outer = 1.5625 if small else 2.3125
    opening = 1.125 if small else 1.75
    # Small engine nozzle centre is higher than envelope centre. Its circular
    # collar must remain inside the approved top, so use the widest valid span.
    outer = min(outer, 2 * cz, 2 * (height - cz), 2 * (nozzle[0] - lo[0]), 2 * (hi[0] - nozzle[0]))
    depth = .56 if small else .875
    _loft(model, "nozzle-to-case-coupling", [
        (cy + depth * .68, _octagon(nozzle[0], cz, outer * .91, outer * .91, outer / 7)),
        (body_rear + .02, _octagon(cx, height / 2, width - .22, height - .22, .25 * w)),
    ], "steel")
    _nozzle(model, nozzle[0], cy, cz, outer, opening, depth)
    return opening


def _small_thruster(model, bounds, nozzle, family):
    """Author locally along -Y, then turn the editable meshes to the exit axis."""
    lo, hi = bounds["min"], bounds["max"]
    # Rotor-axis depth and nozzle origin are separate from the mounting slab.
    retro = family == "retro"
    width = .875 if retro else 1.0
    height = .9375
    opening = .625 if retro else .5625
    outer = .8125
    # Build about temporary canonical nozzle (0,-.5,z). Then rotate in XY.
    z = nozzle[2]
    _loft(model, "compact-angular-case", [
        (-.375, _octagon(0, .46875, width - .125, .8125, .125)),
        (.375, _octagon(0, .46875, width, .9375, .15625)),
    ], "navy")
    for side in (-1, 1):
        x = side * (width / 2 - .109375)
        model.box(f"compact-white-cheek-{side}", (x - .109375, -.3125, .21875),
                  (x + .109375, .3125, .78125), "pale", .03125)
    model.box("compact-roof-armor", (-width * .4, -.1875, .75),
              (width * .4, .34375, height), "pale", .03125)
    model.box("compact-red-service", (-width * .27, -.26, .8375),
              (width * .27, -.06, .9365), "red", .015625)
    model.box("compact-mount", (-width / 2, .3125, 0),
              (width / 2, .5, .625), "steel", .03125)
    _nozzle(model, 0, -.5, z, outer, opening, .3)
    # Orange and pale details are authored geometry; the inset hardware is mapped.
    model.box("compact-status-recess", (-.14, .03, .8975), (.14, .19, .933), "navy", .005)
    model.box("compact-status-emitter", (-.10, .075, .934), (.10, .125, .9365), "amber", .001)
    # Retro faces +Y; side jets face ±X. Authoritative nozzle is inside the
    # legacy front lip by .0625m, which is retained without moving its socket.
    angle = math.pi if retro else (-math.pi / 2 if family == "left" else math.pi / 2)
    c, s = math.cos(angle), math.sin(angle)
    for obj in model.objects:
        for vert in obj.data.vertices:
            x, y = vert.co.x, vert.co.y
            vert.co.x, vert.co.y = c * x - s * y, s * x + c * y
        obj.data.update()
    # The installed left/right envelopes differ by one 1/16m mounting flange.
    # A mounting pad at exact retained bounds is deliberate structure, no stretch.
    if retro:
        model.box("retained-retro-base", (lo[0], lo[1], 0), (hi[0], lo[1] + .125, .1875), "steel", .015625)
    else:
        inward_x = hi[0] if family == "left" else lo[0]
        model.box("retained-side-base", (inward_x - .125 if family == "left" else inward_x, lo[1], 0),
                  (inward_x if family == "left" else inward_x + .125, hi[1], .1875), "steel", .015625)
    return opening


def _export(model, out_dir, native_node):
    """Export a merged derivative while retaining all editable source pieces."""
    bpy.ops.object.select_all(action="DESELECT")
    copies = []
    for original in model.objects:
        copy = original.copy()
        copy.data = original.data.copy()
        model.collection.objects.link(copy)
        copy.select_set(True)
        bpy.context.view_layer.objects.active = copy
        for mod in list(copy.modifiers):
            bpy.ops.object.modifier_apply(modifier=mod.name)
        copies.append(copy)
    bpy.context.view_layer.objects.active = copies[0]
    bpy.ops.object.join()
    cooked = bpy.context.active_object
    cooked.name = native_node
    # Join deduplicates identical slots. Export one render mesh per engine.
    for source in model.objects:
        source.hide_render = True
        source.hide_set(True)
    bpy.ops.object.select_all(action="DESELECT")
    cooked.select_set(True)
    model.root.select_set(True)
    for obj in model.collection.objects:
        if obj.type == "EMPTY":
            obj.select_set(True)
    path = out_dir / f"{model.asset}.glb"
    bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True,
                             export_apply=True, export_extras=True, export_yup=True,
                             export_materials="EXPORT", export_normals=True,
                             export_texcoords=True, export_animations=False)
    coords = [cooked.matrix_world @ vert.co for vert in cooked.data.vertices]
    bounds = {"min": [min(v[a] for v in coords) for a in range(3)],
              "max": [max(v[a] for v in coords) for a in range(3)]}
    cooked.data.calc_loop_triangles()
    return path, bounds, len(cooked.data.loop_triangles), cooked


def build_all(out_dir):
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1
    materials = _materials(out_dir / "textures")
    catalog = json.loads((ROOT / "assets/runtime/assembly/catalog-shipyard-r005.json").read_text())
    entries = {a["id"]: a for a in catalog["assets"]}
    specs = [
        ("part-e8b51ac6443c73becfcb", "large-left", (.025, -2.4375, 1.25), (0, -1, 0)),
        ("part-4d754a140cc642ded990", "large-right", (-.025, -2.4375, 1.25), (0, -1, 0)),
        ("part-e15ef10ca93701b58ccb", "small-center", (0, -1.875, 1.1875), (0, -1, 0)),
        ("part-a9dcbf6707ca20039a5c", "left", (-.5, 0, .5), (-1, 0, 0)),
        ("part-a06cfaab58b430855803", "right", (.5, 0, .5), (1, 0, 0)),
        ("part-393498d8c8af6149ef28", "retro", (0, .5, .4375), (0, 1, 0)),
    ]
    records = []
    for asset, family, nozzle, direction in specs:
        entry = entries[asset]
        model = Model(asset, family, materials)
        model.socket("ENGINE_ATTACH", (0, 0, 0))
        model.socket("FX_EXHAUST", nozzle, direction)
        if family.startswith("large") or family == "small-center":
            opening = _main(model, entry["bounds"], nozzle, family == "small-center")
        else:
            opening = _small_thruster(model, entry["bounds"], nozzle, family)
        path, bounds, triangles, cooked = _export(model, out_dir, entry["nodes"][0])
        for key in ("min", "max"):
            for axis in range(3):
                delta = bounds[key][axis] - entry["bounds"][key][axis]
                if (key == "min" and delta < -1e-5) or (key == "max" and delta > 1e-5):
                    raise ValueError(f"{asset} exceeds retained {key}[{axis}] envelope: {bounds}")
        records.append({
            "assetId": asset, "family": family, "file": path.name, "glb": path.name,
            "sha256": _sha(path), "nativeNode": cooked.name, "bounds": bounds,
            "retainedEnvelope": entry["bounds"], "nozzle": list(nozzle),
            "exhaustDirection": list(direction), "nozzleOpeningWidthM": opening,
            "geometryTriangles": triangles, "materials": len(cooked.data.materials),
            "editableSolids": len(model.objects), "objectScale": [1, 1, 1],
        })
    blend = out_dir / "engines.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    report = {
        "schema": "sidereal.framed-engines.v1", "revision": 1,
        "source": blend.name, "sourceSha256": _sha(blend),
        "reference": "reference/art/3d-rpg-after.png",
        "concept": "assets/art-library/hull-voxel-study/wayfarer-layout-concept-r001/proposal.png",
        "recipeSha256": _sha(__file__), "models": records,
        "textureFiles": [{"file": str(p.relative_to(out_dir)), "sha256": _sha(p)}
                         for p in sorted((out_dir / "textures").glob("*.png"))],
        "preserved": ["asset IDs", "placed transforms", "nozzle world anchors", "force directions", "outer envelopes"],
        "limits": ["Native visual replacement only; collision, damage, mass and IFCS unchanged",
                   "Emissive nozzle hardware is static; no baked plume or throttle claim",
                   "Runtime optical plume is a separate achieved-output presentation"],
    }
    (out_dir / "models.json").write_text(json.dumps(report, indent=2) + "\n")
    return report
