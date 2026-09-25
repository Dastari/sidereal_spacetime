"""Voxel character kit (headless Blender helpers).

Adapted from the construction-brick approach of scripts/art_library/ship_kit_prototype.py
(branch docs/shipyard-player-builder-design): parts are authored as boxes on a fixed grid,
colour/role lives in material SLOTS, themes are slot tables, a tiling detail map gives the
brick/voxel read, edges get a small bevel.

Character-specific differences:
- grid is 1/32 m (VOXEL) instead of 1/16 m;
- a part is a voxel VOLUME (dict cell -> slot) so detail can be painted into surfaces
  (seams, trims, eyes) without z-fighting; the exposed surface is meshed, coplanar faces of
  the same slot are dissolved, then silhouette edges are chamfered;
- UVs are a per-face box projection in rest-pose metres, so a 1 m tiling texture with 32
  cells lines up exactly with the voxel grid. glTF-portable: one shared "voxel tint"
  base-colour texture (per-cell jitter + cell edge darkening) multiplies each slot's
  baseColorFactor, and one shared normal map carves a shallow groove between cells.
  Runtime recolouring therefore only changes baseColorFactor (albedoColor in Babylon).
"""
import math

import bmesh
import bpy
import numpy as np

VOXEL = 1.0 / 32.0
SLOTS = ["skin", "hair", "eye", "suit_primary", "suit_secondary", "accent", "metal", "dark", "emit", "glass"]
SI = {s: i for i, s in enumerate(SLOTS)}

# default "base crew" slot table (linear RGB). Themes/roles/player colours are further tables.
DEFAULT_THEME = {
    "skin": (0.80, 0.50, 0.34),
    "hair": (0.10, 0.045, 0.25),
    "eye": (0.018, 0.016, 0.024),
    "suit_primary": (0.50, 0.47, 0.62),
    "suit_secondary": (0.26, 0.24, 0.36),
    "accent": (0.90, 0.36, 0.06),
    "metal": (0.55, 0.56, 0.60),
    "dark": (0.030, 0.030, 0.045),
    "emit": (0.10, 0.60, 1.00),
    "glass": (0.35, 0.70, 1.00),
}
# (roughness, metallic, normal strength)
SLOT_PBR = {
    "skin": (0.62, 0.0, 0.25), "hair": (0.72, 0.0, 0.5), "eye": (0.25, 0.0, 0.0),
    "suit_primary": (0.66, 0.0, 0.4), "suit_secondary": (0.62, 0.0, 0.4), "accent": (0.5, 0.05, 0.4),
    "metal": (0.34, 0.85, 0.4), "dark": (0.78, 0.0, 0.4), "emit": (0.4, 0.0, 0.0), "glass": (0.05, 0.0, 0.0),
}
EMISSIVE = {"emit": 6.0}


class Vol:
    """Integer voxel volume. Cells are (x, y, z) with the cell spanning [x, x+1) * VOXEL etc."""

    def __init__(self):
        self.c = {}

    def box(self, x0, y0, z0, x1, y1, z1, slot):
        for x in range(x0, x1):
            for y in range(y0, y1):
                for z in range(z0, z1):
                    self.c[(x, y, z)] = slot
        return self

    def cut(self, x0, y0, z0, x1, y1, z1):
        for x in range(x0, x1):
            for y in range(y0, y1):
                for z in range(z0, z1):
                    self.c.pop((x, y, z), None)
        return self

    def paint(self, x0, y0, z0, x1, y1, z1, slot):
        """Recolour existing cells only (seams, trims)."""
        for x in range(x0, x1):
            for y in range(y0, y1):
                for z in range(z0, z1):
                    if (x, y, z) in self.c:
                        self.c[(x, y, z)] = slot
        return self

    def mirror_x(self, src_x0, src_x1):
        """Copy cells with x in [src_x0, src_x1) to the mirrored side (x -> -1 - x)."""
        for (x, y, z), s in list(self.c.items()):
            if src_x0 <= x < src_x1:
                self.c[(-1 - x, y, z)] = s
        return self

    def pixels(self, rows, x0, z_top, y0, y1, palette, axis="y"):
        """Paint a character map. axis 'y': rows run down in z, columns run +x, cells span y0..y1.
        axis 'x': columns run +y instead, cells span x0..x1 given as (y0, y1) = x range, x0 = y start."""
        for r, row in enumerate(rows):
            z = z_top - 1 - r
            for k, ch in enumerate(row):
                if ch == " ":
                    continue
                slot = palette.get(ch)
                for d in range(y0, y1):
                    cell = (x0 + k, d, z) if axis == "y" else (d, x0 + k, z)
                    if slot is None:
                        self.c.pop(cell, None)
                    else:
                        self.c[cell] = slot
        return self

    def merge(self, other):
        self.c.update(other.c)
        return self

    def bounds(self):
        if not self.c:
            return None
        a = np.array(list(self.c.keys()))
        return a.min(0).tolist(), (a.max(0) + 1).tolist()

    def slots(self):
        return sorted(set(self.c.values()), key=SI.get)


_DIRS = [((1, 0, 0), 0), ((-1, 0, 0), 0), ((0, 1, 0), 1), ((0, -1, 0), 1), ((0, 0, 1), 2), ((0, 0, -1), 2)]


def _face_quad(x, y, z, n):
    """Corner cells of the face of cell (x,y,z) with outward normal n, CCW seen from outside."""
    nx, ny, nz = n
    if nx:
        X = x + (1 if nx > 0 else 0)
        q = [(X, y, z), (X, y + 1, z), (X, y + 1, z + 1), (X, y, z + 1)]
    elif ny:
        Y = y + (1 if ny > 0 else 0)
        q = [(x, Y, z), (x, Y, z + 1), (x + 1, Y, z + 1), (x + 1, Y, z)]
    else:
        Z = z + (1 if nz > 0 else 0)
        q = [(x, y, Z), (x + 1, y, Z), (x + 1, y + 1, Z), (x, y + 1, Z)]
    if (nx < 0) or (ny < 0) or (nz < 0):
        q = q[::-1]
    return q


def mesh_volume(vol, name, bevel=0.0, dissolve=True, mats=None):
    """Exposed-surface mesh of a volume with per-face material slots; coplanar same-slot faces
    dissolved; silhouette edges chamfered (single segment, hardened normals)."""
    cells = vol.c
    vid, verts, faces, fmats = {}, [], [], []

    def v(p):
        i = vid.get(p)
        if i is None:
            i = vid[p] = len(verts)
            verts.append((p[0] * VOXEL, p[1] * VOXEL, p[2] * VOXEL))
        return i

    for (x, y, z), s in cells.items():
        for n, _ax in _DIRS:
            if (x + n[0], y + n[1], z + n[2]) in cells:
                continue
            faces.append([v(p) for p in _face_quad(x, y, z, n)])
            fmats.append(SI[s])
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    for s in SLOTS:
        me.materials.append(mats[s] if mats else None)
    me.polygons.foreach_set("material_index", fmats)
    me.polygons.foreach_set("use_smooth", [False] * len(faces))
    bm = bmesh.new()
    bm.from_mesh(me)
    if dissolve:
        bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(1.0), use_dissolve_boundaries=False,
                                 verts=bm.verts, edges=bm.edges, delimit={"MATERIAL"})
    bm.to_mesh(me)
    bm.free()
    if bevel > 0:
        ob = bpy.data.objects.new("_tmp_" + name, me)
        bpy.context.scene.collection.objects.link(ob)
        md = ob.modifiers.new("brick", "BEVEL")
        md.width, md.segments, md.limit_method, md.angle_limit = bevel, 1, "ANGLE", math.radians(30)
        md.harden_normals, md.use_clamp_overlap = True, True
        md.miter_outer = "MITER_ARC"
        dg = bpy.context.evaluated_depsgraph_get()
        me2 = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
        bpy.data.objects.remove(ob)
        bpy.data.meshes.remove(me)
        me2.name = name
        me = me2
    box_uv(me)
    return me


def box_uv(me):
    """Per-face planar UV from rest-pose metres: 1 UV unit = 1 m = 32 voxel cells."""
    uv = me.uv_layers.get("UVMap") or me.uv_layers.new(name="UVMap")
    co = [v.co for v in me.vertices]
    for p in me.polygons:
        n = p.normal
        a = max(range(3), key=lambda i: abs(n[i]))
        for li in p.loop_indices:
            c = co[me.loops[li].vertex_index]
            if a == 0:
                u, w = (c.y if n.x > 0 else -c.y), c.z
            elif a == 1:
                u, w = (-c.x if n.y > 0 else c.x), c.z
            else:
                u, w = c.x, (c.y if n.z > 0 else -c.y)
            uv.data[li].uv = (u, w)


# --------------------------------------------------------------------------- textures
def voxel_textures(tint_path, normal_path, n=512, cells=32, seed=11):
    """Tint: per-cell brightness jitter with slightly darker cell rims. Normal: shallow groove
    between cells + a faint per-cell bevel, packed as an OpenGL (glTF) tangent-space normal map."""
    px = n // cells
    rng = np.random.default_rng(seed)
    jitter = 1.0 - 0.07 * rng.random((cells, cells)).astype(np.float32)
    tint = np.kron(jitter, np.ones((px, px), np.float32))
    i = np.arange(n) % px
    d = np.minimum(i, px - 1 - i).astype(np.float32)             # distance to cell edge in px
    dx, dy = np.meshgrid(d, d)
    edge = np.minimum(dx, dy)
    tint *= np.where(edge < 1, 0.94, 1.0)
    t = np.clip(tint, 0, 1)
    img = bpy.data.images.new("voxel_tint", n, n, alpha=False)
    img.pixels.foreach_set(np.stack([t, t, t, np.ones_like(t)], -1)[::-1].ravel())
    img.filepath_raw, img.file_format = tint_path, "PNG"
    img.save()
    # height: 1 inside, ramps down over 2 px to the cell edge
    h = np.clip(edge / 2.0, 0, 1) ** 0.7
    gy, gx = np.gradient(h)
    k = 1.6
    nx, ny, nz = -gx * k, gy * k, np.ones_like(h)
    L = np.sqrt(nx * nx + ny * ny + nz * nz)
    nrm = np.stack([nx / L * 0.5 + 0.5, ny / L * 0.5 + 0.5, nz / L * 0.5 + 0.5, np.ones_like(h)], -1)
    im2 = bpy.data.images.new("voxel_normal", n, n, alpha=False)
    im2.colorspace_settings.name = "Non-Color"
    im2.pixels.foreach_set(nrm[::-1].astype(np.float32).ravel())
    im2.filepath_raw, im2.file_format = normal_path, "PNG"
    im2.save()
    return img, im2


def slot_materials(theme, tint_img, normal_img, prefix="crew"):
    """One glTF-exportable Principled material per slot."""
    mats = {}
    for s in SLOTS:
        m = bpy.data.materials.new(f"{prefix}.{s}")
        m.use_nodes = True
        m.use_backface_culling = True
        nt = m.node_tree
        b = nt.nodes["Principled BSDF"]
        col = theme[s]
        rough, metal, nstr = SLOT_PBR[s]
        b.inputs["Roughness"].default_value = rough
        b.inputs["Metallic"].default_value = metal
        if s == "glass":
            b.inputs["Base Color"].default_value = (*col, 1)
            b.inputs["Alpha"].default_value = 0.45
            m.surface_render_method = "BLENDED"
            mats[s] = m
            continue
        uvn = nt.nodes.new("ShaderNodeUVMap")
        uvn.uv_map = "UVMap"
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = tint_img
        tex.interpolation = "Closest"
        nt.links.new(uvn.outputs["UV"], tex.inputs["Vector"])
        rgb = nt.nodes.new("ShaderNodeRGB")
        rgb.outputs[0].default_value = (*col, 1)
        mul = nt.nodes.new("ShaderNodeMix")
        mul.data_type, mul.blend_type = "RGBA", "MULTIPLY"
        mul.inputs["Factor"].default_value = 1.0
        nt.links.new(tex.outputs["Color"], mul.inputs[6])
        nt.links.new(rgb.outputs[0], mul.inputs[7])
        nt.links.new(mul.outputs[2], b.inputs["Base Color"])
        if nstr > 0:
            ntex = nt.nodes.new("ShaderNodeTexImage")
            ntex.image = normal_img
            nt.links.new(uvn.outputs["UV"], ntex.inputs["Vector"])
            nm = nt.nodes.new("ShaderNodeNormalMap")
            nm.inputs["Strength"].default_value = nstr
            nt.links.new(ntex.outputs["Color"], nm.inputs["Color"])
            nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
        if s in EMISSIVE:
            b.inputs["Emission Color"].default_value = (*col, 1)
            b.inputs["Emission Strength"].default_value = EMISSIVE[s]
        mats[s] = m
    return mats


def assign_materials(ob, mats):
    for i, s in enumerate(SLOTS):
        ob.material_slots[i].material = mats[s]


def tri_count(me):
    me.calc_loop_triangles()
    return len(me.loop_triangles)
