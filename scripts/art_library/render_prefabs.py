"""Owner-facing review renders of the developer prefab ships from the REAL TypeScript dresser output.

Evidence only: reads the JSON written by `scripts/prefab-dress-dump.ts`, the exported kit GLBs
(assets/runtime/ship-kit/r001) and the SHIPS-COMPONENTS GLBs (assets/art-library/ship-components/r001),
and writes PNGs. It never exports assets, publishes or touches database state.

Scene build per ship (prefab frame: +X fore, +Y port, +Z up, metres):
- kit placements: one imported GLB mesh per piece id, linked duplicates, rotated about +Z at the
  placement point (the GLB importer already restores the Z-up piece frame);
- generated boxes (texels): meshed with per-face slot material index, per-slot overlay inflation
  (like packages/render/src/prefab-ship/box-mesher.ts) and the prototype brick bevel;
- components: component GLB, authored-frame socket rotation, then quarter turns + anchor
  (mirrors packages/render/src/prefab-ship/frames.ts componentMatrix / mountRotation);
- presentation-only plumes on aft main engines, decals (name, number, emblem), deck room lights,
  translucent object-socket placeholders with an emissive frame, a nebula world, a 1 m grid and a
  1.8 m crew figure + bar as the scale cue.
Every dressed item carries view both|flight|deck; flight shots show both+flight, deck shots both+deck.

Usage (normally through `npm run prefab:render`):
  blender -b --factory-startup -P scripts/art_library/render_prefabs.py -- \
      --dumps DIR --out DIR [--only id,id] [--shots flight_top,flight_iso,deck_iso,deck_top]
      [--samples 32] [--scale 1.0] [--sheets] [--no-ships]
"""
import argparse
import json
import math
import os
import re
import sys
import time

import bpy
import numpy as np
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)
import ship_kit_prototype as P  # noqa: E402  (module import is side-effect free; main() is guarded)

T = 1.0 / 16.0
SLOTS = ["primary", "secondary", "accent", "trim", "metal", "dark", "emit_a", "emit_b", "glass"]
SHOTS = ["flight_top", "flight_iso", "deck_iso", "deck_top", "deck_walk"]
# Per-slot outward inflation (m) for generated boxes, as DEFAULT_SLOT_INFLATION in box-mesher.ts.
INFLATE = [0, 0, 0, 0.0005, 0.0005, 0.00025, 0.00075, 0.00075, -0.00025]
FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--dumps", default="/tmp/prefab-dump")
    p.add_argument("--out", default="/root/sidereal-progress/ships-prefabs/renders/blender")
    p.add_argument("--only", default="")
    p.add_argument("--shots", default=",".join(SHOTS))
    p.add_argument("--samples", type=int, default=32)
    p.add_argument("--scale", type=float, default=1.0, help="resolution multiplier (0.5 for quick previews)")
    p.add_argument("--sheets", action="store_true", help="also render lineup.png and starters.png")
    p.add_argument("--no-ships", action="store_true", help="skip per-ship shots (sheets only, reusing existing PNGs)")
    p.add_argument("--closeup", default="", help="id: extra hull close-up shot (cassette relief review)")
    return p.parse_args(argv)


# =========================================================================== materials
def slot_material(key, slot, s, theme, detail):
    """Theme slot material in the prototype's slot_material style, driven by SHIP_THEMES values."""
    m = bpy.data.materials.new(f"{key}.{slot}")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(b.outputs[0], out.inputs[0])
    col = tuple(s["colour"])
    if slot == "glass":
        b.inputs["Base Color"].default_value = (*col, 1)
        b.inputs["Roughness"].default_value = s.get("roughness", 0.04)
        b.inputs["Alpha"].default_value = s.get("alpha", 0.35)
        b.inputs["Emission Color"].default_value = (*col, 1)
        b.inputs["Emission Strength"].default_value = s.get("emissive", 0.9)
        m.surface_render_method = "BLENDED"
        return m
    if slot in ("emit_a", "emit_b"):
        b.inputs["Base Color"].default_value = (*col, 1)
        b.inputs["Emission Color"].default_value = (*col, 1)
        b.inputs["Emission Strength"].default_value = s.get("emissive", 7.0)
        return m
    rough, metal, bump = s["roughness"], s["metallic"], s["bump"]
    tc = nt.nodes.new("ShaderNodeTexCoord")
    base = nt.nodes.new("ShaderNodeRGB")
    base.outputs[0].default_value = (*col, 1)
    colour = base.outputs[0]
    if bump > 0:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image, tex.projection, tex.projection_blend = detail, "BOX", 0.2
        nt.links.new(tc.outputs["Object"], tex.inputs["Vector"])
        bp = nt.nodes.new("ShaderNodeBump")
        bp.inputs["Strength"].default_value = bump
        bp.inputs["Distance"].default_value = 0.004
        nt.links.new(tex.outputs["Color"], bp.inputs["Height"])
        nt.links.new(bp.outputs["Normal"], b.inputs["Normal"])
    wear = theme["wear"]
    if wear > 0 and slot != "dark":
        nz = nt.nodes.new("ShaderNodeTexNoise")
        nz.inputs["Scale"].default_value = 5.0
        nz.inputs["Detail"].default_value = 8
        nt.links.new(tc.outputs["Object"], nz.inputs["Vector"])
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.62 - 0.22 * wear
        ramp.color_ramp.elements[1].position = 0.70 - 0.20 * wear
        nt.links.new(nz.outputs["Fac"], ramp.inputs["Fac"])
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        nt.links.new(ramp.outputs["Color"], mix.inputs["Factor"])
        nt.links.new(colour, mix.inputs[6])
        mix.inputs[7].default_value = (*theme["wearColour"], 1)
        colour = mix.outputs[2]
        rmix = nt.nodes.new("ShaderNodeMix")
        rmix.data_type = "FLOAT"
        nt.links.new(ramp.outputs["Color"], rmix.inputs["Factor"])
        rmix.inputs[2].default_value = rough
        rmix.inputs[3].default_value = 0.85
        nt.links.new(rmix.outputs[0], b.inputs["Roughness"])
    else:
        b.inputs["Roughness"].default_value = rough
    nt.links.new(colour, b.inputs["Base Color"])
    b.inputs["Metallic"].default_value = metal
    return m


def emission_material(name, colour, strength, alpha=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    e = nt.nodes.new("ShaderNodeEmission")
    e.inputs["Color"].default_value = (*colour, 1)
    e.inputs["Strength"].default_value = strength
    o = nt.nodes.new("ShaderNodeOutputMaterial")
    if alpha is None:
        nt.links.new(e.outputs[0], o.inputs[0])
    else:
        tr = nt.nodes.new("ShaderNodeBsdfTransparent")
        mix = nt.nodes.new("ShaderNodeMixShader")
        mix.inputs[0].default_value = alpha
        nt.links.new(tr.outputs[0], mix.inputs[1])
        nt.links.new(e.outputs[0], mix.inputs[2])
        nt.links.new(mix.outputs[0], o.inputs[0])
        m.surface_render_method = "BLENDED"
    return m


def socket_fill_material(name, colour):
    """Translucent object-socket placeholder (r008 style): pale glassy fill with a faint glow."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*colour, 1)
    b.inputs["Roughness"].default_value = 0.15
    b.inputs["Alpha"].default_value = 0.28
    b.inputs["Emission Color"].default_value = (*colour, 1)
    b.inputs["Emission Strength"].default_value = 0.35
    m.surface_render_method = "BLENDED"
    return m


THEME_MATS = {}


def theme_materials(theme, detail):
    key = theme["id"]
    if key in THEME_MATS:
        return THEME_MATS[key]
    mats = {s: slot_material(key, s, theme["slots"][s], theme, detail) for s in SLOTS}
    plume = tuple(theme["plume"])
    mats["plume_outer"] = emission_material(f"{key}.plume.outer", plume, 3.0, 0.16)
    mats["plume_core"] = emission_material(f"{key}.plume.core", tuple(min(1.0, c * 0.6 + 0.4) for c in plume), 7.0, 0.5)
    ea = tuple(theme["slots"]["emit_a"]["colour"])
    mats["socket_fill"] = socket_fill_material(f"{key}.socket.fill", tuple(0.55 + 0.45 * c for c in ea))
    mats["socket_frame"] = emission_material(f"{key}.socket.frame", ea, 4.0)
    THEME_MATS[key] = mats
    return mats


# =========================================================================== decal masks
def text_mask(text, path, w=1024, h=256):
    """White text alpha mask (Eevee, few samples: it is a flat emission render)."""
    sc = bpy.data.scenes.new(f"decal_{text}")
    sc.render.engine = "BLENDER_EEVEE_NEXT"
    sc.eevee.taa_render_samples = 8
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.render.film_transparent = True
    sc.view_settings.view_transform = "Standard"
    cu = bpy.data.curves.new(f"txt_{text}", "FONT")
    cu.body, cu.align_x, cu.align_y, cu.space_character = text, "CENTER", "CENTER", 1.05
    cu.font = load_font()
    ob = bpy.data.objects.new(f"txt_{text}", cu)
    sc.collection.objects.link(ob)
    cu.materials.append(emission_material("decal_white", (1, 1, 1), 1.0))
    cam = bpy.data.objects.new(f"cam_{text}", bpy.data.cameras.new(f"cam_{text}"))
    sc.collection.objects.link(cam)
    cam.data.type, cam.data.ortho_scale = "ORTHO", max(3.8, 0.72 * len(text) + 0.6)
    cam.location = (0, 0, 5)
    sc.camera = cam
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True, scene=sc.name)
    return bpy.data.images.load(path)


def gear_mask(path, n=512):
    y, x = np.mgrid[0:n, 0:n].astype(np.float32)
    u, v = x - n / 2, y - n / 2
    r = np.hypot(u, v)
    a = np.arctan2(v, u)
    teeth = (np.cos(a * 10) > 0.25)
    m = ((r < 170) | ((r < 215) & teeth)) & (r > 70)
    img = bpy.data.images.new("emblem_gear", n, n, alpha=True)
    af = m.astype(np.float32)
    img.pixels.foreach_set(np.stack([np.ones_like(af)] * 3 + [af], -1).ravel())
    img.filepath_raw, img.file_format = path, "PNG"
    img.save()
    return img


FONTS = {}


def load_font():
    if "f" not in FONTS:
        FONTS["f"] = bpy.data.fonts.load(FONT_PATH) if os.path.exists(FONT_PATH) else None
    return FONTS["f"]


DECAL_MATS = {}


def decal_mats(dump, work):
    key = dump["id"]
    if key in DECAL_MATS:
        return DECAL_MATS[key]
    mk = dump["dressed"]["markings"]
    th = dump["theme"]
    safe = re.sub(r"[^a-z0-9]+", "_", key)
    name_img = text_mask(mk["name"], f"{work}/{safe}_name.png")
    num_img = text_mask(mk["number"], f"{work}/{safe}_number.png") if mk.get("number") else None
    emb = mk.get("emblem", "none")
    emb_img = None
    if emb == "gear":
        emb_img = gear_mask(f"{work}/emblem_gear.png")
    elif emb != "none":
        emb_img = P.emblem_mask(emb, f"{work}/emblem_{emb}.png")
    out = {"name": P.decal_material(f"{key}.decal.name", name_img, tuple(th["inkOnDark"]))}
    if num_img:
        out["number"] = P.decal_material(f"{key}.decal.number", num_img, tuple(th["inkOnLight"]))
    if emb_img:
        out["emblem_top"] = P.decal_material(f"{key}.decal.emblem", emb_img, tuple(th["inkOnDark"]))
        out["emblem_plate"] = P.decal_material(f"{key}.decal.emblem2", emb_img, tuple(th["inkOnLight"]))
    DECAL_MATS[key] = out
    return out


# =========================================================================== asset import
ASSETS = {}


def slot_of(name):
    base = name.split(".")[0]
    base = re.sub(r"^slot\d+_", "", base)
    return base if base in SLOTS else "primary"


def import_glb(path):
    """Import a GLB once; returns [(mesh, [slot per material index])] in the Z-up authoring frame."""
    if path in ASSETS:
        return ASSETS[path]
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    parts = []
    for o in new:
        if o.type == "MESH":
            me = o.data.copy()
            me.transform(o.matrix_world)
            parts.append((me, [slot_of(m.name) if m else "primary" for m in me.materials]))
    for o in new:
        bpy.data.objects.remove(o, do_unlink=True)
    ASSETS[path] = parts
    return parts


def link_parts(parts, name, matrix, mats, coll):
    obs = []
    for me, slots in parts:
        ob = bpy.data.objects.new(name, me)
        coll.objects.link(ob)
        ob.matrix_world = matrix
        for i, s in enumerate(slots):
            ob.material_slots[i].link = "OBJECT"
            ob.material_slots[i].material = mats[s]
        obs.append(ob)
    return obs


# =========================================================================== geometry builders
def box_mesh(name, boxes, inflate=True):
    """Texel boxes [x0,y0,z0,x1,y1,z1,slot] -> one mesh with per-face slot material index."""
    n = len(boxes)
    if not n:
        return None
    b = np.asarray(boxes, dtype=np.float64)
    lo = b[:, 0:3] * T
    hi = b[:, 3:6] * T
    slot = b[:, 6].astype(np.int64)
    if inflate:
        g = np.asarray(INFLATE)[slot][:, None]
        lo, hi = lo - g, hi + g
    corners = np.array([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], dtype=np.float64)
    verts = lo[:, None, :] + corners[None, :, :] * (hi - lo)[:, None, :]
    quads = np.array([[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]], dtype=np.int64)
    faces = (np.arange(n)[:, None, None] * 8 + quads[None, :, :]).reshape(-1, 4)
    me = bpy.data.meshes.new(name)
    me.vertices.add(n * 8)
    me.vertices.foreach_set("co", verts.reshape(-1).astype(np.float32))
    me.loops.add(n * 24)
    me.loops.foreach_set("vertex_index", faces.reshape(-1).astype(np.int32))
    me.polygons.add(n * 6)
    me.polygons.foreach_set("loop_start", (np.arange(n * 6) * 4).astype(np.int32))
    me.update()
    for _ in SLOTS:
        me.materials.append(None)
    me.polygons.foreach_set("material_index", np.repeat(slot, 6).astype(np.int32))
    return me


def bevel(ob, width=0.012):
    md = ob.modifiers.new("brick", "BEVEL")
    md.width, md.segments, md.limit_method, md.angle_limit = width, 1, "ANGLE", math.radians(30)
    md.harden_normals, md.use_clamp_overlap = True, True


def slot_object(name, me, mats, coll, matrix=None):
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    if matrix is not None:
        ob.matrix_world = matrix
    for i, s in enumerate(SLOTS):
        ob.material_slots[i].link = "OBJECT"
        ob.material_slots[i].material = mats[s]
    return ob


def quad(name, corners, mat, coll):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(c) for c in corners], [], [(0, 1, 2, 3)])
    lay = me.uv_layers.new()
    uv = [(0, 0), (1, 0), (1, 1), (0, 1)]
    for li, loop in enumerate(me.loops):
        lay.data[li].uv = uv[loop.vertex_index]
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    return ob


def basis(ex, ey, ez, t=(0, 0, 0)):
    """Column-vector 4x4 from basis images (same meaning as frames.ts basisMatrix)."""
    return Matrix(((ex[0], ey[0], ez[0], t[0]), (ex[1], ey[1], ez[1], t[1]), (ex[2], ey[2], ez[2], t[2]), (0, 0, 0, 1)))


C2P = basis((0, -1, 0), (1, 0, 0), (0, 0, 1))   # component +Y forward -> prefab +X fore


def mount_rotation(frame, socket):
    """Local copy of shipMountRotation (packages/content/src/ship-components.ts)."""
    if frame == "top" and socket == "bottom":
        return basis((-1, 0, 0), (0, 1, 0), (0, 0, -1))
    if frame == "top" and socket in ("face", "rear", "edge"):
        return basis((0, 0, -1), (1, 0, 0), (0, -1, 0))
    if frame == "face" and socket == "top":
        return basis((1, 0, 0), (0, 0, -1), (0, 1, 0))
    if frame == "face" and socket == "bottom":
        return basis((1, 0, 0), (0, 0, 1), (0, -1, 0))
    return Matrix.Identity(4)


def component_matrix(c):
    place = Matrix.Translation((c["anchor"][0], c["anchor"][1], c["anchorZ"])) @ Matrix.Rotation(math.radians(90 * c["quarterTurns"]), 4, "Z") @ C2P
    return place, place @ mount_rotation(c["authoredFrame"], c["socket"])


# =========================================================================== ship
class Ship:
    def __init__(self, dump, detail, work):
        self.d = dump
        self.id = dump["id"]
        self.root = bpy.data.objects.new(f"ship.{self.id}", None)
        self.colls = {}
        top = bpy.data.collections.new(f"S_{self.id}")
        bpy.context.scene.collection.children.link(top)
        self.top = top
        for tag in ("both", "flight", "deck", "plume_both", "plume_flight", "scale", "labels", "lights"):
            c = bpy.data.collections.new(f"S_{self.id}_{tag}")
            top.children.link(c)
            self.colls[tag] = c
        top.objects.link(self.root)
        self.mats = theme_materials(dump["theme"], detail)
        self.decals = decal_mats(dump, work)
        self.counts = {"kit": 0, "generated_boxes": 0, "components": 0, "decals": 0, "objects": 0, "lights": 0, "plumes": 0}
        t0 = time.time()
        self.build()
        self.build_seconds = time.time() - t0

    def add(self, ob, tag):
        ob.parent = self.root
        return ob

    def build(self):
        d = self.d["dressed"]
        kitdir = os.path.join(REPO, self.d["kitDir"])
        for k in d["kit"]:
            parts = import_glb(os.path.join(kitdir, f"{k['piece']}.glb"))
            m = Matrix.Translation((k["x"], k["y"], k["z"])) @ Matrix.Rotation(math.radians(k["rotDeg"]), 4, "Z")
            for ob in link_parts(parts, k["piece"], m, self.mats, self.colls[k["view"]]):
                self.add(ob, k["view"])
            self.counts["kit"] += 1
        for g in d["generated"]:
            me = box_mesh(g["id"], g["boxes"])
            if me is None:
                continue
            ob = slot_object(g["id"], me, self.mats, self.colls[g["view"]])
            bevel(ob, 0.012 if g["kind"] != "floor-slab" else 0.006)
            self.add(ob, g["view"])
            self.counts["generated_boxes"] += len(g["boxes"])
        for c in self.d["components"]:
            if not c["glb"]:
                continue
            place, m = component_matrix(c)
            for ob in link_parts(import_glb(os.path.join(REPO, c["glb"])), c["component"], m, self.mats, self.colls[c["view"]]):
                self.add(ob, c["view"])
            self.counts["components"] += 1
            if c["mainEngine"] and c["glbBoundsM"]:
                (x0, y0, z0), (x1, y1, z1) = c["glbBoundsM"]
                w = min(x1 - x0, z1 - z0)
                r = max(3, int(w * 16 * 0.32))
                length = int((x1 - x0) * 16 * 1.6)
                pl = bpy.data.objects.new(f"plume.{c['mount']}", P.plume_mesh((r, length), r, length))
                self.colls["plume_" + ("flight" if c["view"] == "flight" else "both")].objects.link(pl)
                pl.matrix_world = place @ Matrix.Translation((0, y0, (z0 + z1) / 2)) @ Matrix.Rotation(math.pi, 4, "Z")
                pl.material_slots[0].link = pl.material_slots[1].link = "OBJECT"
                pl.material_slots[0].material, pl.material_slots[1].material = self.mats["plume_outer"], self.mats["plume_core"]
                self.add(pl, "plume")
                self.counts["plumes"] += 1
        for i, dc in enumerate(d["decals"]):
            if dc["kind"] == "name":
                mat = self.decals["name"]
            elif dc["kind"] == "number":
                mat = self.decals.get("number")
            else:
                mat = self.decals.get("emblem_top" if dc["corners"][0][2] > 3.0 else "emblem_plate")
            if mat is None:
                continue
            self.add(quad(f"decal.{dc['kind']}.{i}", dc["corners"], mat, self.colls[dc["view"]]), dc["view"])
            self.counts["decals"] += 1
        ft = self.d["grammar"]["deck"]["floorTopTexels"] * T
        for i, s in enumerate(d["objects"]):
            h = s["heightTexels"]
            wx, wy = int(round(s["size"][0] * 16)), int(round(s["size"][1] * 16))
            boxes = [[0, 0, 0, wx, wy, h, 0]]
            fr = [[0, 0, h - 1, wx, 1, h, 0], [0, wy - 1, h - 1, wx, wy, h, 0], [0, 1, h - 1, 1, wy - 1, h, 0], [wx - 1, 1, h - 1, wx, wy - 1, h, 0]]
            m = Matrix.Translation((s["at"][0], s["at"][1], ft))
            fill = bpy.data.objects.new(f"socket.{s['designId']}", box_mesh("sock", boxes, inflate=False))
            fill.data.materials[0] = self.mats["socket_fill"]
            fill.matrix_world = m
            self.colls["deck"].objects.link(fill)
            frame = bpy.data.objects.new(f"socket.frame.{i}", box_mesh("sockf", [[b[0], b[1], b[2], b[3], b[4], b[5] + 0.02, 0] for b in fr], inflate=False))
            frame.data.materials[0] = self.mats["socket_frame"]
            frame.matrix_world = m
            self.colls["deck"].objects.link(frame)
            self.add(fill, "deck")
            self.add(frame, "deck")
            self.counts["objects"] += 1
        for i, l in enumerate(d["lights"]):
            area = max(4.0, (l["intensity"] - 0.25) / 0.04)
            pl = bpy.data.objects.new(f"room_light_{i}", bpy.data.lights.new(f"room_light_{self.id}_{i}", "POINT"))
            pl.data.energy, pl.data.color, pl.data.shadow_soft_size = 14 * area, tuple(l["colour"]), 1.0
            pl.data.use_shadow = False
            pl.location = tuple(l["at"])
            self.colls["lights"].objects.link(pl)
            self.add(pl, "lights")
            self.counts["lights"] += 1
        lab = label_material()
        for l in d["labels"]:
            cu = bpy.data.curves.new("lbl", "FONT")
            cu.body, cu.size, cu.align_x, cu.align_y = l["text"], 0.36, "CENTER", "CENTER"
            cu.font = load_font()
            cu.materials.append(lab)
            ob = bpy.data.objects.new(f"label.{l['text']}", cu)
            ob.location = (l["at"][0], l["at"][1], 2.9)
            self.colls["labels"].objects.link(ob)
            self.add(ob, "labels")

    def bounds(self, tags):
        lo = Vector((1e9, 1e9, 1e9))
        hi = Vector((-1e9, -1e9, -1e9))
        for t in tags:
            for ob in self.colls[t].all_objects:
                if ob.type != "MESH":
                    continue
                for c in ob.bound_box:
                    w = ob.matrix_world @ Vector(c)
                    lo = Vector(map(min, lo, w))
                    hi = Vector(map(max, hi, w))
        return lo, hi

    def add_scale_cue(self, grid_z, lo, hi):
        """1 m ground grid under the ship (5 m lines brighter) plus a 1.8 m crew figure and bar at the bow."""
        c = self.colls["scale"]
        x0, y0 = math.floor(lo.x) - 3, math.floor(lo.y) - 3
        x1, y1 = math.ceil(hi.x) + 3, math.ceil(hi.y) + 3
        minor, major = [], []
        for x in range(x0, x1 + 1):
            (major if x % 5 == 0 else minor).append((x - 0.012, y0, x + 0.012, y1))
        for y in range(y0, y1 + 1):
            (major if y % 5 == 0 else minor).append((x0, y - 0.012, x1, y + 0.012))
        for name, lines, mat in (("grid.minor", minor, grid_material(0.35)), ("grid.major", major, grid_material(0.9))):
            boxes = [[a * 16, b * 16, 0, cc * 16, dd * 16, 0.3, 0] for a, b, cc, dd in lines]
            me = box_mesh(name, boxes, inflate=False)
            ob = bpy.data.objects.new(name, me)
            ob.data.materials[0] = mat
            ob.location = (0, 0, grid_z)
            c.objects.link(ob)
            self.add(ob, "scale")
        crew = P.crew_figure()
        # crew figure (1.8 m) and a 1.8 m bar standing on the grid just off the bow, starboard side
        cx, cy = math.ceil(hi.x) + 1.0, lo.y + 0.5
        ob = bpy.data.objects.new("crew.1m8", P.piece_mesh(crew))
        c.objects.link(ob)
        ob.location = (cx, cy, grid_z)
        ob.rotation_euler = (0, 0, math.radians(90))
        for i, s in enumerate(P.SLOTS):
            ob.material_slots[i].link = "OBJECT"
            ob.material_slots[i].material = self.mats[s]
        self.add(ob, "scale")
        bar = [[0, 0, k * 8, 2, 2, k * 8 + 8, 0 if k % 2 == 0 else 5] for k in range(3)] + [[0, 0, 24, 2, 2, 29, 0]]
        bar = [[0, 0, 0, 2, 2, 9.6, 0], [0, 0, 9.6, 2, 2, 19.2, 5], [0, 0, 19.2, 2, 2, 28.8, 0], [-2, -2, 28.8, 4, 4, 29.3, 6]]
        me = box_mesh("crewbar", bar, inflate=False)
        ob = slot_object("crewbar.1m8", me, self.mats, c)
        ob.location = (cx, cy + 0.9, grid_z)
        self.add(ob, "scale")
        self.crew_at = (cx, cy)

    def add_deck_crew(self, floor_z):
        """A 1.8 m crew figure standing in the corridor/first room (deck scale cue)."""
        labels = self.d["dressed"]["labels"]
        pick = next((l for l in labels if l["text"] in ("CORRIDOR", "HALL", "SPINE", "PASSAGE", "NAVE", "GANGWAY")), labels[0] if labels else None)
        if not pick:
            return
        crew = P.crew_figure()
        ob = bpy.data.objects.new("crew.deck", P.piece_mesh(crew))
        self.colls["deck"].objects.link(ob)
        ob.location = (pick["at"][0] + 0.6, pick["at"][1] - 0.2, floor_z)
        ob.rotation_euler = (0, 0, math.radians(90))
        for i, s in enumerate(P.SLOTS):
            ob.material_slots[i].link = "OBJECT"
            ob.material_slots[i].material = self.mats[s]
        self.add(ob, "deck")

    def show(self, view, scale=True, labels=False):
        """view: flight | deck | none."""
        self.top.hide_render = view == "none"
        for tag, c in self.colls.items():
            if tag in ("both", "plume_both"):
                c.hide_render = False
            elif tag in ("flight", "plume_flight"):
                c.hide_render = view != "flight"
            elif tag in ("deck", "lights"):
                c.hide_render = view != "deck"
            elif tag == "scale":
                c.hide_render = not scale
            elif tag == "labels":
                c.hide_render = not (labels and view == "deck")


GRID_MATS = {}


def grid_material(strength):
    if strength not in GRID_MATS:
        GRID_MATS[strength] = emission_material(f"grid.{strength}", (0.25, 0.55, 1.0), strength)
    return GRID_MATS[strength]


def label_material():
    m = bpy.data.materials.get("room_label")
    if m:
        return m
    return emission_material("room_label", (0.75, 0.9, 1.0), 1.2)


# =========================================================================== scene / cameras / grading
def setup_scene(samples):
    sc = bpy.context.scene
    cam = P.setup(sc, samples)
    sc.eevee.use_shadows = True
    # grading as the r005-r008 prototype: glare bloom on emissives, saturation up, contrast down,
    # gamma slightly up (AgX base contrast + exposure)
    ct = sc.node_tree
    for n in ct.nodes:
        if n.bl_idname == "CompositorNodeGlare":
            n.glare_type, n.threshold, n.size, n.mix, n.quality = "FOG_GLOW", 1.0, 7, -0.55, "HIGH"
        if n.bl_idname == "CompositorNodeHueSat":
            n.inputs["Saturation"].default_value = 1.32
        if n.bl_idname == "CompositorNodeBrightContrast":
            n.inputs["Contrast"].default_value = -4.0
    sc.view_settings.exposure, sc.view_settings.gamma = 0.45, 1.1
    return sc, cam


def cam_top(cam, lo, hi, aspect, margin=1.12):
    cx, cy = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2
    w, h = hi.x - lo.x, hi.y - lo.y
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = max(w, h * aspect) * margin
    cam.data.clip_end = 500
    cam.location, cam.rotation_euler = (cx, cy, 120), (0, 0, 0)


def cam_iso(cam, lo, hi, aspect, elev_deg, az_deg, lens=40, fill=0.92):
    """Perspective 3/4 view; az measured from +X (fore) toward +Y (port)."""
    target = (lo + hi) / 2
    target.z = lo.z + (hi.z - lo.z) * 0.35
    el, az = math.radians(elev_deg), math.radians(az_deg)
    dirv = Vector((math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el)))
    cam.data.type, cam.data.lens, cam.data.clip_end = "PERSP", lens, 1000
    # fit: project the bbox corners in camera space, iterate distance
    corners = [Vector((x, y, z)) for x in (lo.x, hi.x) for y in (lo.y, hi.y) for z in (lo.z, hi.z)]
    rot = (-dirv).to_track_quat("-Z", "Y")
    R = rot.to_matrix()
    sensor = 36.0
    half_w = sensor / 2 / lens
    half_h = half_w / aspect
    dist = 10.0
    for _ in range(30):
        pos = target + dirv * dist
        need = 0.0
        for p in corners:
            q = R.transposed() @ (p - pos)
            z = -q.z
            if z <= 0.1:
                need = max(need, 2.0)
                continue
            need = max(need, abs(q.x) / z / (half_w * fill), abs(q.y) / z / (half_h * fill))
        dist *= need ** 0.7 if need > 0 else 1
    cam.location = target + dirv * dist
    cam.rotation_euler = rot.to_euler()


def walk_camera(cam, s, dlo, dhi):
    """Interior walk-through: a low third-person view from behind the deck crew figure, aft and
    to port, looking fore along the corridor toward the bridge (the reference 3d-rpg framing)."""
    crew = next((o for o in s.colls["deck"].all_objects if o.name.startswith("crew.deck")), None)
    target = crew.location.copy() if crew else (dlo + dhi) / 2
    target.x += 2.2
    target.z = 1.0
    cam.data.type, cam.data.lens, cam.data.clip_end = "PERSP", 26, 500
    cam.location = target + Vector((-6.5, 3.2, 5.6))
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()


def mask_and_stats(sc, path_png, hide_for_mask):
    """Silhouette mask via a quick Workbench pass (grid/plumes hidden), then VERIFY-style stats on
    the graded PNG: emissive share (max>0.85 & sat>0.45), mean saturation, luma p10/p90, dark share."""
    eng, trans, vt, look = sc.render.engine, sc.render.film_transparent, sc.view_settings.view_transform, sc.view_settings.look
    use_nodes = sc.use_nodes
    hidden = []
    for c in hide_for_mask:
        if not c.hide_render:
            c.hide_render = True
            hidden.append(c)
    sc.render.engine, sc.render.film_transparent, sc.use_nodes = "BLENDER_WORKBENCH", True, False
    sc.view_settings.view_transform = "Standard"
    mp = path_png.replace(".png", ".__mask.png")
    fp = sc.render.filepath
    sc.render.filepath = mp
    bpy.ops.render.render(write_still=True)
    sc.render.filepath = fp
    sc.render.engine, sc.render.film_transparent, sc.use_nodes = eng, trans, use_nodes
    sc.view_settings.view_transform, sc.view_settings.look = vt, look
    for c in hidden:
        c.hide_render = False
    mi = bpy.data.images.load(mp)
    ci = bpy.data.images.load(path_png)
    w, h = ci.size
    a = np.array(mi.pixels[:], dtype=np.float32).reshape(h, w, 4)[..., 3] > 0.5
    px = np.array(ci.pixels[:], dtype=np.float32).reshape(h, w, 4)[..., :3]
    bpy.data.images.remove(mi)
    bpy.data.images.remove(ci)
    os.remove(mp)
    if not a.any():
        return {}
    mx, mn = px.max(-1), px.min(-1)
    sat = np.where(mx > 1e-4, (mx - mn) / np.maximum(mx, 1e-4), 0)
    lum = px @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    f = a
    return {"silhouette_px": int(f.sum()), "emissive_frac": round(float(np.mean((mx[f] > 0.85) & (sat[f] > 0.45))), 4),
            "mean_sat": round(float(sat[f].mean()), 3), "luma_p10": round(float(np.percentile(lum[f], 10)), 3),
            "luma_p90": round(float(np.percentile(lum[f], 90)), 3), "dark_frac": round(float(np.mean(lum[f] < 0.12)), 4)}


def render(sc, path, res, scale):
    sc.render.resolution_x, sc.render.resolution_y = int(res[0] * scale), int(res[1] * scale)
    sc.render.filepath = path
    t0 = time.time()
    bpy.ops.render.render(write_still=True)
    return time.time() - t0


# =========================================================================== sheets
def image_plane(name, path, x, y, w, coll):
    img = bpy.data.images.load(path)
    iw, ih = img.size
    h = w * ih / iw
    me = bpy.data.meshes.new(name)
    me.from_pydata([(x, y - h, 0), (x + w, y - h, 0), (x + w, y, 0), (x, y, 0)], [], [(0, 1, 2, 3)])
    lay = me.uv_layers.new()
    for li, loop in enumerate(me.loops):
        lay.data[li].uv = [(0, 0), (1, 0), (1, 1), (0, 1)][loop.vertex_index]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    e = nt.nodes.new("ShaderNodeEmission")
    o = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(tex.outputs[0], e.inputs[0])
    nt.links.new(e.outputs[0], o.inputs[0])
    me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    return h


def sheet_text(body, x, y, size, coll, colour=(0.92, 0.94, 1.0), align="LEFT"):
    cu = bpy.data.curves.new("t", "FONT")
    cu.body, cu.size, cu.align_x = body, size, align
    cu.font = load_font()
    cu.materials.append(emission_material("sheet_text", colour, 1.0))
    ob = bpy.data.objects.new("t", cu)
    ob.location = (x, y, 0.01)
    coll.objects.link(ob)
    return ob


def stat_line(s):
    st = s["stats"]
    return (f"{st['lengthM']:.0f} x {st['beamM']:.0f} m  |  {st['massKg'] / 1000:.1f} t  |  {st['thrustN'] / 1000:.0f} kN  |  "
            f"{st['accelerationMs2']:.2f} m/s²  |  crew {st['crew']}  |  {st['rooms']} rooms  |  cargo {st['cargoCells']} m²")


def render_starters(dumps, out, scale):
    sc = bpy.data.scenes.new("starters")
    sc.render.engine = "BLENDER_EEVEE_NEXT"
    sc.eevee.taa_render_samples = 4
    sc.view_settings.view_transform, sc.view_settings.look = "Standard", "None"
    w = sc.world = bpy.data.worlds.new("sheet_bg")
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.012, 0.012, 0.03, 1)
    coll = sc.collection
    ids = [d["id"] for d in dumps if d["starter"]]
    ids = sorted(ids, key=lambda i: dumps_order(dumps).index(i))
    panel_w, gap = 10.0, 0.35
    cols = ["flight_top", "flight_iso", "deck_iso"]
    heads = ["FLIGHT VIEW (top-down, roofed)", "FLIGHT VIEW (3/4, front-port)", "DECK VIEW (cutaway, room lights)"]
    y = 0.0
    x0 = 0.0
    sheet_text("STARTER CANDIDATES  -  pick one", x0, y + 0.9, 0.95, coll)
    sheet_text("Real TypeScript dresser output (dressShip) + ship-kit r001 + ship-components r001 GLBs. Proposed art; not owner-approved. 1 m grid, 1.8 m crew bar.",
               x0, y + 0.2, 0.36, coll, (0.6, 0.7, 0.9))
    y -= 1.0
    for k, h in enumerate(heads):
        sheet_text(h, x0 + k * (panel_w + gap), y, 0.4, coll, (0.55, 0.8, 1.0))
    y -= 0.5
    for sid in ids:
        d = next(x for x in dumps if x["id"] == sid)
        sheet_text(f"{d['name'].upper()}   {d['id']}   {d['theme']['label']}  -  {d['role']}, size {d['sizeClass']}", x0, y, 0.62, coll)
        sheet_text(stat_line(d), x0, y - 0.72, 0.42, coll, (1.0, 0.78, 0.45))
        y -= 1.05
        hmax = 0
        for k, shot in enumerate(cols):
            p = os.path.join(out, f"{sid}_{shot}.png")
            if os.path.exists(p):
                hmax = max(hmax, image_plane(f"{sid}_{shot}", p, x0 + k * (panel_w + gap), y, panel_w, coll))
        y -= hmax + 0.8
    W = 3 * panel_w + 2 * gap
    Ht = -y + 2.0
    cam = bpy.data.objects.new("sheetcam", bpy.data.cameras.new("sheetcam"))
    coll.objects.link(cam)
    cam.data.type, cam.data.ortho_scale = "ORTHO", max(W + 1.0, (Ht) * (W + 1.0) / Ht)
    res_x = int(3000 * scale)
    res_y = int(res_x * Ht / (W + 1.0))
    cam.location = (W / 2, 2.0 - Ht / 2, 10)
    sc.camera = cam
    sc.render.resolution_x, sc.render.resolution_y = res_x, res_y
    sc.render.filepath = os.path.join(out, "starters.png")
    bpy.ops.render.render(write_still=True, scene=sc.name)


def dumps_order(dumps):
    starters = [d["id"] for d in dumps if d["starter"]]
    rest = [d["id"] for d in dumps if not d["starter"]]
    return starters + rest


# =========================================================================== main
def main():
    args = parse_args()
    t_start = time.time()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    os.makedirs(args.out, exist_ok=True)
    work = os.path.join(args.out, "_work")
    os.makedirs(work, exist_ok=True)
    index = json.load(open(os.path.join(args.dumps, "index.json")))
    order = [s["id"] for s in index["ships"] if s["starter"]] + [s["id"] for s in index["ships"] if not s["starter"]]
    only = [s for s in args.only.split(",") if s]
    if only:
        order = [i for i in order if i in only]
    dumps = [json.load(open(os.path.join(args.dumps, f"{i}.json"))) for i in order]
    shots = [s for s in args.shots.split(",") if s]
    sc, cam = setup_scene(args.samples)
    detail = P.detail_height(os.path.join(work, "detail_height.png"))
    report = {}
    rp = os.path.join(args.out, "render_stats.json")
    if os.path.exists(rp):
        report = json.load(open(rp))
    ships = []
    for d in dumps:
        s = Ship(d, detail, work)
        ships.append(s)
        for o in ships:
            o.show("none")
        bpy.context.view_layer.update()
        lo, hi = s.bounds(["both", "flight"])
        grid_z = min(lo.z, 0.0) - 0.4
        s.add_scale_cue(grid_z, lo, hi)
        s.add_deck_crew(d["grammar"]["deck"]["floorTopTexels"] * T)
        bpy.context.view_layer.update()
        slo, shi = s.bounds(["both", "flight", "scale"])
        print(f"[prefab-render] built {s.id} in {s.build_seconds:.1f}s {s.counts}", flush=True)
        if args.no_ships:
            continue
        entry = {"counts": s.counts, "build_s": round(s.build_seconds, 1), "shots": {}}
        for shot in shots:
            view = "flight" if shot.startswith("flight") else "deck"
            s.show(view, scale=shot != "deck_walk", labels=(shot == "deck_top"))
            aspect = 1.6
            dlo, dhi = s.bounds(["deck"])
            if shot == "deck_top":
                # Tight on the deck itself (floors, walls, crew), not the whole hull and plumes.
                cam_top(cam, Vector((dlo.x - 0.6, dlo.y - 0.6, 0)), Vector((dhi.x + 0.6, dhi.y + 0.6, 0)), aspect, margin=1.04)
            elif shot.endswith("_top"):
                cam_top(cam, Vector((slo.x, lo.y - 0.5, 0)), Vector((shi.x, hi.y + 0.5, 0)), aspect)
            elif shot == "flight_iso":
                cam_iso(cam, lo, hi, aspect, 35, 50)
            elif shot == "deck_walk":
                walk_camera(cam, s, dlo, dhi)
            else:
                cam_iso(cam, dlo, dhi, aspect, 50, 35, lens=45, fill=1.0)
            path = os.path.join(args.out, f"{s.id}_{shot}.png")
            secs = render(sc, path, (1600, 1000), args.scale)
            st = mask_and_stats(sc, path, [s.colls["scale"], s.colls["labels"], s.colls["plume_both"], s.colls["plume_flight"]])
            entry["shots"][shot] = {"seconds": round(secs, 1), **st}
            print(f"[prefab-render] {s.id} {shot}: {secs:.1f}s {st}", flush=True)
        if args.closeup == s.id or args.closeup == "all":
            s.show("flight", scale=False)
            c = Vector(((lo.x + hi.x) / 2, lo.y, 1.6))
            cam.data.type, cam.data.lens = "PERSP", 50
            cam.location = c + Vector((3.5, -7.5, 2.2))
            cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
            path = os.path.join(args.out, f"{s.id}_hull_closeup.png")
            render(sc, path, (1600, 1000), args.scale)
        s.show("none")
        report[s.id] = entry
        json.dump(report, open(rp, "w"), indent=1)
    if args.sheets:
        # lineup: all ships, flight view, common scale, starters first (top row), labelled
        for s in ships:
            s.show("flight", scale=False)
        rows = [[s for s in ships if s.d["starter"]], [s for s in ships if not s.d["starter"] and s.d["sizeClass"] in ("S", "M")],
                [s for s in ships if not s.d["starter"] and s.d["sizeClass"] not in ("S", "M")]]
        lab_coll = bpy.data.collections.new("lineup_labels")
        sc.collection.children.link(lab_coll)
        y = 0.0
        maxx = 0.0
        gap = 6.0
        for row in rows:
            if not row:
                continue
            x = 0.0
            row_h = 0.0
            for s in row:
                lo, hi = s.bounds(["both", "flight", "plume_both"])
                s.root.location = (x - lo.x, y - hi.y, 0)
                w, h = hi.x - lo.x, hi.y - lo.y
                tag = "STARTER  " if s.d["starter"] else ""
                t = sheet_text(f"{tag}{s.d['name'].upper()}  ({s.id}, {s.d['sizeClass']})", x, y - h - 1.6, 1.0, lab_coll,
                               (1.0, 0.8, 0.4) if s.d["starter"] else (0.85, 0.9, 1.0))
                t.data.materials[0] = emission_material("lineup_text", (1.0, 0.8, 0.4) if s.d["starter"] else (0.8, 0.88, 1.0), 2.0)
                sheet_text(f"{s.d['stats']['lengthM']:.0f} x {s.d['stats']['beamM']:.0f} m, {s.d['stats']['massKg'] / 1000:.0f} t", x, y - h - 2.8, 0.75, lab_coll).data.materials[0] = emission_material("lineup_text2", (0.6, 0.7, 0.9), 1.5)
                x += w + gap
                row_h = max(row_h, h)
            maxx = max(maxx, x - gap)
            y -= row_h + 6.5
        # 10 m scale bar
        bar = bpy.data.objects.new("scalebar", box_mesh("scalebar", [[0, 0, 0, 160, 6, 2, 0]], inflate=False))
        bar.data.materials[0] = emission_material("scalebar", (0.9, 0.9, 1.0), 2.0)
        bar.location = (0, y + 2.0, 0)
        lab_coll.objects.link(bar)
        sheet_text("10 m", 0, y + 2.6, 1.0, lab_coll).data.materials[0] = emission_material("lineup_text3", (0.9, 0.9, 1.0), 2.0)
        lo = Vector((-2, y, 0))
        hi = Vector((maxx + 2, 3, 0))
        cam_top(cam, lo, hi, 2400 / 1500, margin=1.04)
        secs = render(sc, os.path.join(args.out, "lineup.png"), (2400, 1500), args.scale)
        print(f"[prefab-render] lineup {secs:.1f}s", flush=True)
        for s in ships:
            s.root.location = (0, 0, 0)
        render_starters(dumps, args.out, args.scale)
        print("[prefab-render] starters sheet written", flush=True)
    print(f"[prefab-render] total {time.time() - t_start:.0f}s", flush=True)


if __name__ == "__main__":
    main()
