"""Blender helpers for the crew item kit: slot materials, voxel box meshes, item assembly,
part animation (NLA tracks -> glTF animations) and render instancing. Requires bpy."""
import math

import bpy
from mathutils import Euler, Matrix, Quaternion, Vector

from .themes import SLOT_PBR, THEMES, slot_value
from .voxel import ITEM_SLOTS

BEVEL_WIDTH = 0.0075       # metres; ~24 % of a 1/32 m voxel: soft rounded part edges
FPS = 24
MATS = {}
MESHES = {}



# ------------------------------------------------------------------------------ materials
def material_tag(item, theme, slot):
    if theme == item.theme and slot in item.overrides:
        return f"{theme}+{item.id}"
    return theme


def slot_material(theme, slot, item=None):
    """Principled material for one slot of one theme (item overrides apply on its default theme).
    Name: 'slot:<slot>@<tag>' so runtimes can key material swaps by slot."""
    tag = material_tag(item, theme, slot) if item else theme
    name = f"slot:{slot}@{tag}"
    if name in MATS:
        return MATS[name]
    value = slot_value(theme, slot, item.overrides if item and theme == item.theme else None)
    rough, metal = SLOT_PBR[slot]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if slot.startswith("emit"):
        col, strength = value
        b.inputs["Base Color"].default_value = (*col, 1)
        b.inputs["Emission Color"].default_value = (*col, 1)
        b.inputs["Emission Strength"].default_value = strength
    elif slot == "glass":
        b.inputs["Base Color"].default_value = (*value, 1)
        b.inputs["Emission Color"].default_value = (*value, 1)
        b.inputs["Emission Strength"].default_value = 0.3
        b.inputs["Alpha"].default_value = 0.55
        m.surface_render_method = "BLENDED"
    if slot != "glass":
        # Owner feedback 2026-09-25: smooth part faces, no per-voxel grid. Shading gradient comes
        # from a baked per-part vertex colour (top light -> lower shade, AO on down faces) that
        # multiplies the slot colour; runtimes recolour baseColorFactor only.
        nt = m.node_tree
        col = value[0] if slot.startswith("emit") else value
        ca = nt.nodes.new("ShaderNodeVertexColor")
        ca.layer_name = "shade"
        rgb = nt.nodes.new("ShaderNodeRGB")
        rgb.outputs[0].default_value = (*col, 1)
        mul = nt.nodes.new("ShaderNodeMix")
        mul.data_type, mul.blend_type = "RGBA", "MULTIPLY"
        mul.inputs["Factor"].default_value = 1.0
        nt.links.new(ca.outputs["Color"], mul.inputs[6])
        nt.links.new(rgb.outputs[0], mul.inputs[7])
        nt.links.new(mul.outputs[2], b.inputs["Base Color"])
    MATS[name] = m
    return m


def fx_material(fx, layer, spec):
    name = f"fx:{layer}@{fx.id}"
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*spec["color"], 1)
    b.inputs["Roughness"].default_value = 0.6 if spec["lit"] else 0.3
    if not spec["lit"]:
        b.inputs["Emission Color"].default_value = (*spec["color"], 1)
        b.inputs["Emission Strength"].default_value = spec["emissiveStrength"]
    if spec["alpha"] < 1:
        b.inputs["Alpha"].default_value = spec["alpha"]
        m.surface_render_method = "BLENDED"
        m.use_backface_culling = False
    MATS[name] = m
    return m


# ------------------------------------------------------------------------------ meshes
def boxes_mesh(name, boxes, origin, voxel, slots):
    """Closed box per greedy box; vertices in metres relative to origin (voxel units).
    `slots` is the ordered list of slot names present -> material index."""
    index = {s: i for i, s in enumerate(slots)}
    verts, faces, mats = [], [], []
    ox, oy, oz = origin
    for x0, y0, z0, x1, y1, z1, slot in boxes:
        o = len(verts)
        verts += [((x - ox) * voxel, (y - oy) * voxel, (z - oz) * voxel) for x, y, z in
                  ((x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1))]
        faces += [(o, o + 3, o + 2, o + 1), (o + 4, o + 5, o + 6, o + 7), (o, o + 1, o + 5, o + 4),
                  (o + 1, o + 2, o + 6, o + 5), (o + 2, o + 3, o + 7, o + 6), (o + 3, o, o + 4, o + 7)]
        mats += [index[slot]] * 6
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.polygons.foreach_set("material_index", mats)
    me.polygons.foreach_set("use_smooth", [True] * len(faces))
    me.update()
    shade(me)
    return me


DIRS = ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1))


def region_mesh(name, cells, origin, voxel, slots):
    """Surface mesh per colour region (VERIFY batch-1 fix): faces are emitted only where a voxel
    borders empty space or another slot, coplanar faces are dissolved into single panels, so a
    part is one solid island with one soft bevel; seams only appear at colour/part boundaries.
    Shading = baked per-part vertical ramp x voxel corner ambient occlusion (recess depth)."""
    import bmesh
    index = {s: i for i, s in enumerate(slots)}
    bm = bmesh.new()
    verts = {}
    ox, oy, oz = origin

    def vert(slot, p):
        key = (slot, p)
        v = verts.get(key)
        if v is None:
            v = verts[key] = bm.verts.new(((p[0] - ox) * voxel, (p[1] - oy) * voxel, (p[2] - oz) * voxel))
        return v
    for (x, y, z), slot in cells.items():
        for d in DIRS:
            if cells.get((x + d[0], y + d[1], z + d[2])) == slot:
                continue
            axis = next(i for i in range(3) if d[i])
            u, w = [i for i in range(3) if i != axis]
            base = [x, y, z]
            if d[axis] > 0:
                base[axis] += 1
            quad = []
            for du, dw in ((0, 0), (1, 0), (1, 1), (0, 1)):
                p = list(base)
                p[u] += du
                p[w] += dw
                quad.append(tuple(p))
            a, b, c = (Vector(q) for q in quad[:3])
            if (b - a).cross(c - a).dot(Vector(d)) < 0:
                quad.reverse()
            f = bm.faces.new([vert(slot, q) for q in quad])
            f.material_index = index[slot]
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(1), use_dissolve_boundaries=False,
                             verts=list(bm.verts), edges=list(bm.edges), delimit={"MATERIAL"})
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
    shade(me, cells, origin, voxel)
    return me


def shade(me, cells=None, origin=(0, 0, 0), voxel=1.0):
    """Corner colour 'shade' (glTF COLOR_0): soft vertical ramp across the part, darker downward
    faces, and voxel-corner AO from the 8 cells around each vertex (concave recesses darken,
    convex edges brighten slightly)."""
    zs = [v.co.z for v in me.vertices]
    z0, z1 = (min(zs), max(zs)) if zs else (0.0, 1.0)
    span = max(z1 - z0, 1e-6)
    attr = me.color_attributes.new("shade", "BYTE_COLOR", "CORNER")
    occ = {}
    for p in me.polygons:
        down = 0.78 if p.normal.z < -0.5 else (1.0 if p.normal.z > 0.5 else 0.92)
        for li in p.loop_indices:
            vi = me.loops[li].vertex_index
            co = me.vertices[vi].co
            t = (co.z - z0) / span
            k = (0.82 + 0.18 * t) * down
            if cells is not None:
                if vi not in occ:
                    g = tuple(int(round(co[i] / voxel + origin[i])) for i in range(3))
                    occ[vi] = sum((g[0] - i, g[1] - j, g[2] - l) in cells for i in (0, 1) for j in (0, 1) for l in (0, 1))
                n = occ[vi]
                k *= 1.0 - 0.13 * max(0, n - 4) + 0.04 * max(0, 4 - n)
            k = min(1.0, k)
            attr.data[li].color = (k, k, k, 1.0)


def add_bevel(ob, width=BEVEL_WIDTH):
    md = ob.modifiers.new("brick", "BEVEL")
    md.width, md.segments, md.limit_method, md.angle_limit = width, 2, "ANGLE", math.radians(30)
    md.profile = 0.6
    md.harden_normals, md.use_clamp_overlap = True, True
    return md


def item_meshes(item):
    """Build (once) the body and part meshes of an item. Returns {grid_name: (mesh, slots, location_m)}."""
    if item.id in MESHES:
        return MESHES[item.id]
    out = {}
    origin = item.origin()
    for gname, grid, pivot in item.grids():
        cells = {k: v[0] for k, v in grid.cells.items()}
        slots = [s for s in ITEM_SLOTS if s in set(cells.values())]
        base = origin if gname == "body" else pivot
        me = region_mesh(f"{item.id}.{gname}", cells, base, item.voxel, slots)
        loc = (0.0, 0.0, 0.0) if gname == "body" else item.to_metres(pivot)
        out[gname] = (me, slots, loc)
    MESHES[item.id] = out
    for me, slots, _ in out.values():
        for slot in slots:
            me.materials.append(slot_material(item.theme, slot, item))
    return out


def link_theme(ob, item, slots, theme):
    for i, s in enumerate(slots):
        ob.material_slots[i].link = "OBJECT"
        ob.material_slots[i].material = slot_material(theme, s, item)


# ------------------------------------------------------------------------------ assembly
def socket_empty(name, pos, direction, up, coll, parent):
    """Socket empty following the project convention: local -Y = outward (direction), +Z = up."""
    e = bpy.data.objects.new(name, None)
    e.empty_display_type, e.empty_display_size = "ARROWS", 0.03
    coll.objects.link(e)
    e.parent = parent
    d = Vector(direction).normalized()
    u = Vector(up).normalized()
    y = -d
    x = y.cross(u).normalized()
    z = x.cross(y).normalized()
    m = Matrix((x, y, z)).transposed().to_4x4()
    m.translation = Vector(pos)
    e.matrix_parent_inverse = Matrix.Identity(4)
    e.matrix_basis = m
    return e


def assemble_export(item, coll, bevel=True):
    """Export assembly: root empty, body + part meshes with default-theme data materials,
    socket empties and part animations on NLA tracks."""
    meshes = item_meshes(item)
    root = bpy.data.objects.new(f"item.{item.id}", None)
    root.empty_display_type, root.empty_display_size = "PLAIN_AXES", 0.05
    coll.objects.link(root)
    root["sidereal_item"] = item.id
    root["voxel_size"] = item.voxel
    objs = {}
    for gname, (me, slots, loc) in meshes.items():
        ob = bpy.data.objects.new(f"{item.id}.{gname}" if gname == "body" else f"part.{gname}", me)
        coll.objects.link(ob)
        ob.parent = root
        ob.location = loc
        if bevel:
            add_bevel(ob)
        objs[gname] = ob
    for sname, s in item.sockets.items():
        socket_empty(f"socket.{sname}", item.to_metres(s["position"]), s["direction"], s["up"], coll, root)
    for part in item.parts.values():
        animate_part(item, part, objs[part.name])
    return root, objs


def animate_part(item, part, ob):
    base = ob.location.copy()
    ob.rotation_mode = "XYZ"
    ob.animation_data_create()
    for anim, keys in part.tracks.items():
        action = bpy.data.actions.new(f"{item.id}.{part.name}.{anim}")
        ob.animation_data.action = action
        for frame, loc, rot in keys:
            ob.location = base + Vector(loc) * item.voxel
            ob.rotation_euler = Euler(tuple(math.radians(r) for r in rot), "XYZ")
            ob.keyframe_insert("location", frame=frame)
            ob.keyframe_insert("rotation_euler", frame=frame)
        for fc in action.fcurves:
            for kp in fc.keyframe_points:
                kp.interpolation = "LINEAR"
        track = ob.animation_data.nla_tracks.new()
        track.name = anim
        track.strips.new(anim, int(keys[0][0]), action)
        ob.animation_data.action = None
    ob.location = base
    ob.rotation_euler = (0, 0, 0)


def sample_track(keys, frame):
    """Linear sample of a part track at frame -> (loc voxels, rot degrees)."""
    if frame <= keys[0][0]:
        return keys[0][1], keys[0][2]
    for (f0, l0, r0), (f1, l1, r1) in zip(keys, keys[1:]):
        if f0 <= frame <= f1:
            t = (frame - f0) / max(1, f1 - f0)
            return tuple(a + (b - a) * t for a, b in zip(l0, l1)), tuple(a + (b - a) * t for a, b in zip(r0, r1))
    return keys[-1][1], keys[-1][2]


def spawn(item, theme, matrix, coll, pose=None, bevel=True, name=None):
    """Render instance sharing mesh data; theme via object-linked materials. pose: (anim, frame)."""
    meshes = item_meshes(item)
    root = bpy.data.objects.new(name or f"inst.{item.id}.{theme}", None)
    coll.objects.link(root)
    root.matrix_world = matrix
    for gname, (me, slots, loc) in meshes.items():
        ob = bpy.data.objects.new(f"{root.name}.{gname}", me)
        coll.objects.link(ob)
        ob.parent = root
        ob.location = loc
        if gname != "body" and pose:
            keys = item.parts[gname].tracks.get(pose[0])
            if keys:
                dl, dr = sample_track(keys, pose[1])
                ob.location = Vector(loc) + Vector(dl) * item.voxel
                ob.rotation_euler = Euler(tuple(math.radians(r) for r in dr), "XYZ")
        link_theme(ob, item, slots, theme)
        if bevel:
            add_bevel(ob)
    return root


def spawn_fx(fx, matrix, coll, name=None, scale=1.0):
    root = bpy.data.objects.new(name or f"fx.{fx.id}", None)
    coll.objects.link(root)
    root.matrix_world = matrix @ Matrix.Scale(scale, 4)
    for layer, (grid, spec) in fx.layers.items():
        key = f"fx.{fx.id}.{layer}"
        me = MESHES.get(key)
        if me is None:
            me = boxes_mesh(key, grid.boxes(merge=True), (0, 0, 0), fx.voxel, ["emit_a"])
            me.materials.append(fx_material(fx, layer, spec))
            MESHES[key] = me
        ob = bpy.data.objects.new(f"{root.name}.{layer}", me)
        coll.objects.link(ob)
        ob.parent = root
    return root


def quat(wxyz):
    return Quaternion(wxyz)
