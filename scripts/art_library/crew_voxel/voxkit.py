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
SLOTS = ["skin", "hair", "eye", "suit_primary", "suit_secondary", "accent", "metal", "dark", "emit", "glass", "face"]
SI = {s: i for i, s in enumerate(SLOTS)}

# default "base crew" slot table (linear RGB). Themes/roles/player colours are further tables.
def srgb(h):
    """'#rrggbb' -> linear RGB tuple."""
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(round(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4, 5) for v in c)


# r003 base palette: the reference "Crew" variant (character-animations-2): saturated orange suit over
# deep navy harness/plates, sky-blue pads and gloves, pale trims, warm peach skin, brown curls.
DEFAULT_THEME = {
    "skin": srgb("#f3a98d"),
    "hair": srgb("#6e3a1f"),
    "eye": srgb("#1a1424"),
    "suit_primary": srgb("#f06a22"),
    "suit_secondary": srgb("#27304f"),
    "accent": srgb("#3f8fe0"),
    "metal": srgb("#d9dde6"),
    "dark": srgb("#1c1f2b"),
    "emit": srgb("#38c8ff"),
    "glass": srgb("#7fd0ff"),
    "face": srgb("#f3a98d"),
}
# the r002 lavender base-rig palette, kept as a named theme
THEME_BASE_RIG = dict(DEFAULT_THEME, suit_primary=srgb("#a78db6"), suit_secondary=srgb("#6c5989"),
                      accent=srgb("#f08a2c"), metal=srgb("#e8e4f0"), dark=srgb("#2a2438"), hair=srgb("#5b2fb0"))
BLUSH = srgb("#e9a0a4")  # vertex-colour multiplier target for 'skin:blush' cells (relative to skin)
# (roughness, metallic, normal strength)
SLOT_PBR = {
    "skin": (0.6, 0.0, 0.15), "hair": (0.7, 0.0, 0.3), "eye": (0.2, 0.0, 0.0),
    "suit_primary": (0.62, 0.0, 0.3), "suit_secondary": (0.6, 0.0, 0.3), "accent": (0.5, 0.0, 0.3),
    "metal": (0.4, 0.35, 0.2), "dark": (0.7, 0.0, 0.3), "emit": (0.4, 0.0, 0.0), "glass": (0.05, 0.0, 0.0),
    "face": (0.6, 0.0, 0.0),
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
def voxel_textures(tint_path, normal_path, n=256, cells=16, seed=11):
    """r002: MAIN-BLOCK variation, not a fine-voxel grid. 16 cells per metre = 2 fine voxels.
    Tint: soft per-block brightness jitter (no rim lines). Normal: a faint pillow per block so
    lit faces break up into bricks without reading as graph paper."""
    px = n // cells
    rng = np.random.default_rng(seed)
    jitter = 1.0 - 0.06 * rng.random((cells, cells)).astype(np.float32)
    t = np.clip(np.kron(jitter, np.ones((px, px), np.float32)), 0, 1)
    img = bpy.data.images.new("voxel_tint", n, n, alpha=False)
    img.pixels.foreach_set(np.stack([t, t, t, np.ones_like(t)], -1)[::-1].ravel())
    img.filepath_raw, img.file_format = tint_path, "PNG"
    img.save()
    i = (np.arange(n) % px + 0.5) / px                             # 0..1 inside a block
    u, v = np.meshgrid(i, i)
    h = (np.sin(np.pi * u) * np.sin(np.pi * v)) ** 0.25            # flat top, soft falloff at the rim
    gy, gx = np.gradient(h)
    k = 1.2
    nx, ny, nz = -gx * k, gy * k, np.ones_like(h)
    L = np.sqrt(nx * nx + ny * ny + nz * nz)
    nrm = np.stack([nx / L * 0.5 + 0.5, ny / L * 0.5 + 0.5, nz / L * 0.5 + 0.5, np.ones_like(h)], -1)
    im2 = bpy.data.images.new("voxel_normal", n, n, alpha=False)
    im2.colorspace_settings.name = "Non-Color"
    im2.pixels.foreach_set(nrm[::-1].astype(np.float32).ravel())
    im2.filepath_raw, im2.file_format = normal_path, "PNG"
    im2.save()
    return img, im2


# --------------------------------------------------------------------------- brick islands (r002)
class Part:
    """A rigid part made of brick ISLANDS. Each island is a voxel volume meshed and bevelled on its
    own, so seams appear only between authored bricks (collar, pocket, cuff, hair clump), never
    between every fine voxel. Paint/cut act across all islands. Slots may carry a modifier
    ('skin:blush') that keeps the base material but multiplies a vertex colour."""

    def __init__(self):
        self.islands = []

    def brick(self, x0, y0, z0, x1, y1, z1, slot):
        v = Vol().box(x0, y0, z0, x1, y1, z1, slot)
        if v.c:
            self.islands.append(v)
        return v

    def island(self, vol):
        if vol.c:
            self.islands.append(vol)
        return vol

    def paint(self, *box):
        for v in self.islands:
            v.paint(*box)
        return self

    def cut(self, *box):
        for v in self.islands:
            v.cut(*box)
        self.islands = [v for v in self.islands if v.c]
        return self

    def mirrored(self):
        out = Part()
        for v in self.islands:
            m = Vol()
            m.c = {(-1 - x, y, z): s for (x, y, z), s in v.c.items()}
            out.islands.append(m)
        return out

    def shifted(self, dz=0, dy=0, dx=0):
        out = Part()
        for v in self.islands:
            m = Vol()
            m.c = {(x + dx, y + dy, z + dz): s for (x, y, z), s in v.c.items()}
            out.islands.append(m)
        return out

    def merged(self, other):
        out = Part()
        out.islands = self.islands + other.islands
        return out

    def bounds(self):
        b = [v.bounds() for v in self.islands]
        lo = [min(x[0][i] for x in b) for i in range(3)]
        hi = [max(x[1][i] for x in b) for i in range(3)]
        return lo, hi

    def slots(self):
        return sorted({s.split(":")[0] for v in self.islands for s in v.c.values()}, key=SI.get)

    def cells(self):
        return sum(len(v.c) for v in self.islands)


MODS = {"blush": BLUSH}


def mesh_part(part, name, mats=None, bevel=0.011, segments=2, seed=0, jitter=0.025):
    """Mesh every island separately (exposed faces, coplanar same-slot faces dissolved), chamfer its
    edges, give it a per-island colour jitter (vertex colour), then join. Flat shading."""
    import random
    rng = random.Random(seed)
    extra = {}                                   # 'slot:mod' -> temporary material index
    bm_all = bmesh.new()
    isl = bm_all.faces.layers.int.new("island")
    for k, vol in enumerate(part.islands):
        cells = vol.c
        vid, verts, faces, fm = {}, [], [], []

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
                if s not in SI and s not in extra:
                    extra[s] = len(SLOTS) + len(extra)
                fm.append(SI.get(s, extra.get(s)))
        bm = bmesh.new()
        bv = [bm.verts.new(c) for c in verts]
        for f, mi in zip(faces, fm):
            face = bm.faces.new([bv[i] for i in f])
            face.material_index = mi
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
        bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(1.0), use_dissolve_boundaries=False,
                                 verts=bm.verts, edges=bm.edges, delimit={"MATERIAL"})
        if bevel > 0:
            edges = [e for e in bm.edges if len(e.link_faces) == 2 and e.calc_face_angle(0) > math.radians(30)]
            if edges:
                old = set(bm.faces)
                res = bmesh.ops.bevel(bm, geom=edges, offset=bevel, offset_type="OFFSET", segments=segments,
                                      profile=0.5, affect="EDGES", clamp_overlap=True, material=-1)
                # bevel faces inherit the material of the largest original neighbour (no stray slot lines)
                for f in res["faces"]:
                    best, area = None, -1.0
                    for e in f.edges:
                        for g in e.link_faces:
                            if g in old and g.calc_area() > area:
                                best, area = g, g.calc_area()
                    if best is None:
                        for v in f.verts:
                            for g in v.link_faces:
                                if g in old and g.calc_area() > area:
                                    best, area = g, g.calc_area()
                    if best is not None:
                        f.material_index = best.material_index
        tmp = bpy.data.meshes.new("_isl")
        bm.to_mesh(tmp)
        bm.free()
        n0 = len(bm_all.faces)
        bm_all.from_mesh(tmp)
        bpy.data.meshes.remove(tmp)
        bm_all.faces.ensure_lookup_table()
        for f in bm_all.faces[n0:]:
            f[isl] = k
    me = bpy.data.meshes.new(name)
    bm_all.to_mesh(me)
    bm_all.free()
    for s in SLOTS:
        me.materials.append(mats[s] if mats else None)
    # per-island jitter + modifiers, then fold modifier material indices back onto base slots
    tone = [1.0 - jitter * rng.random() for _ in part.islands]
    inv = {i: s for s, i in extra.items()}
    col = me.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
    isl_attr = me.attributes["island"].data
    for p in me.polygons:
        t = tone[isl_attr[p.index].value]
        c = (t, t, t)
        if p.material_index in inv:
            base, mod = inv[p.material_index].split(":")
            m = MODS[mod]
            b = DEFAULT_THEME[base]
            c = tuple(t * min(1.0, m[i] / max(b[i], 1e-4)) for i in range(3))
            p.material_index = SI[base]
        for li in p.loop_indices:
            col.data[li].color = (*c, 1.0)
    me.attributes.remove(me.attributes["island"])
    me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
    box_uv(me)
    return me


def face_uv(me, skull):
    """Face canvas UV (FACE_ATLAS_SPEC): the flat front plane is a 16 x 16 px pixel canvas, 1 px = 1
    fine voxel. u = (x1 - x) / width (column 0 = character's right, i.e. viewer's left), v = (z - z0) / height."""
    x1, z0 = skull["x1"] * VOXEL, skull["z0"] * VOXEL
    wdt, hgt = (skull["x1"] - skull["x0"]) * VOXEL, (skull["z1"] - skull["z0"]) * VOXEL
    uv = me.uv_layers.get("UVMap") or me.uv_layers.new(name="UVMap")
    fi = SI["face"]
    for p in me.polygons:
        if p.material_index != fi:
            continue
        for li in p.loop_indices:
            c = me.vertices[me.loops[li].vertex_index].co
            uv.data[li].uv = (min(1, max(0, (x1 - c.x) / wdt)), min(1, max(0, (c.z - z0) / hgt)))


def soften(ob):
    """Big faces stay flat, bevels read as soft rounded edges: weighted (face-area) custom normals,
    baked into the mesh so glTF exports them."""
    md = ob.modifiers.new("soft", "WEIGHTED_NORMAL")
    md.mode, md.weight, md.keep_sharp = "FACE_AREA", 100, False
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    old = ob.data
    ob.modifiers.remove(md)
    ob.data = me
    bpy.data.meshes.remove(old)
    return ob


def slot_materials(theme, tint_img=None, normal_img=None, prefix="crew", face_img=None):
    """One glTF-exportable Principled material per slot: baseColorFactor x COLOR_0 (island tone,
    blush, baked AO). r002: no tiling texture or normal map (owner: no visible per-voxel grid)."""
    mats = {}
    for s in SLOTS:
        m = bpy.data.materials.new(f"{prefix}.{s}")
        m.use_nodes = True
        m.use_backface_culling = True
        nt = m.node_tree
        b = nt.nodes["Principled BSDF"]
        col = theme[s]
        rough, metal, _ = SLOT_PBR[s]
        b.inputs["Roughness"].default_value = rough
        b.inputs["Metallic"].default_value = metal
        if s == "glass":
            b.inputs["Base Color"].default_value = (*col, 1)
            b.inputs["Alpha"].default_value = 0.45
            m.surface_render_method = "BLENDED"
            mats[s] = m
            continue
        if s == "face" and face_img is not None:
            # animatable pixel face: runtime replaces this texture with the composed atlas state
            uvn = nt.nodes.new("ShaderNodeUVMap")
            uvn.uv_map = "UVMap"
            tex = nt.nodes.new("ShaderNodeTexImage")
            tex.name = "face_texture"
            tex.image = face_img
            tex.interpolation = "Closest"
            tex.extension = "EXTEND"
            nt.links.new(uvn.outputs["UV"], tex.inputs["Vector"])
            nt.links.new(tex.outputs["Color"], b.inputs["Base Color"])
            mats[s] = m
            continue
        rgb = nt.nodes.new("ShaderNodeRGB")
        rgb.outputs[0].default_value = (*col, 1)
        vc = nt.nodes.new("ShaderNodeVertexColor")
        vc.layer_name = "Col"
        mul = nt.nodes.new("ShaderNodeMix")
        mul.data_type, mul.blend_type = "RGBA", "MULTIPLY"
        mul.inputs["Factor"].default_value = 1.0
        nt.links.new(rgb.outputs[0], mul.inputs[6])
        nt.links.new(vc.outputs["Color"], mul.inputs[7])
        nt.links.new(mul.outputs[2], b.inputs["Base Color"])
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
