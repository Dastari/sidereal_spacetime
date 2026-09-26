"""Crew voxel armour kit (armor-v1 r002, spec v2): Blender build, fit checks, GLB export, review sheets.

  blender -b --factory-startup -P scripts/art_library/crew_armor_kit.py -- \
      --out /tmp/armor [--export assets/runtime/crew/armor-v1 --content-json packages/content/src/crew-armor.json] \
      [--sheets progress,tiers,colourways,back,roles,roles-female,extras,loadouts,poses] [--check] \
      [--rig-blend CHAR-BODY.blend] [--refs DIR] [--samples 32]

Geometry comes from crew_armor_parts.py (voxel volumes per bone, rest-pose armature voxels, spec v2).
Each bone volume is meshed as its exposed surface with coplanar same-slot faces merged, then given a
soft bevel on the part (owner feedback 2026-09-25: plates read as smooth faces with softly bevelled
edges; no per-voxel grid lines or cell noise). The voxel read comes from stepped plate silhouettes and
chunky detail. Materials are one per slot (`crew.<slot>`, flat baseColorFactor + emissive), so
colourways and player colours are slot tables applied at runtime.

The rig and the mannequin body are CHAR-ARMOR's spec-v2 placeholder (crew_armor_parts.BODY) until
CHAR-BODY republishes CHARACTER_SPEC_BODY.json with spec_version 2; --rig-blend imports CHAR-BODY
actions for the clip check when they exist on a matching rig.

--check / --export write fit_report.json:
  zFight   visible same-normal coplanar faces (armour vs body, and between the parts of every preset);
  clip     armour voxels entering another bone's occupied cells in run / aim_rifle / crouch_idle / sit,
           minus rest-pose overlap, split into parent/child hinges and everything else, with the bare
           body's own figure as a floor;
  emissiveSurface  share of each part's visible faces in the emit slot.
"""
import argparse
import hashlib
import json
import math
import subprocess
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import crew_armor_fit as F  # noqa: E402
import crew_armor_parts as K  # noqa: E402

V = K.V
REFS = Path("/root/sidereal-progress/char-armor/ref-crops")


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--out", default="/tmp/crew_armor")
    p.add_argument("--rig-blend", default="")
    p.add_argument("--export", default="")
    p.add_argument("--content-json", default="")
    p.add_argument("--sheets", default="")
    p.add_argument("--check", action="store_true")
    p.add_argument("--refs", default=str(REFS))
    p.add_argument("--samples", type=int, default=32)
    p.add_argument("--bevel", type=float, default=0.009, help="plate edge bevel (m)")
    p.add_argument("--save-blend", action="store_true")
    return p.parse_args(argv)


def srgb_lin(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


# Character slots (skin/hair/eye) and the default undersuit (lavender-blue, spec v2)
BASE_THEME = {"skin": "#f2b48f", "hair": "#4b2f8a", "eye": "#15121c", "suit_primary": "#8c90d8",
              "suit_secondary": "#4c4f94", "accent": "#ff8fa0", "metal": "#b4bbd0", "dark": "#262640",
              "emit": "#5fd2ff", "glass": "#7fd8ff"}
SLOT_PBR = {"skin": (0.55, 0.0), "hair": (0.6, 0.0), "eye": (0.2, 0.0), "suit_primary": (0.5, 0.0),
            "suit_secondary": (0.55, 0.0), "accent": (0.45, 0.05), "metal": (0.32, 0.8), "dark": (0.6, 0.0),
            "emit": (0.4, 0.0), "glass": (0.05, 0.0)}   # roughness, metallic


def theme(colourway=None, undersuit=None):
    t = dict(BASE_THEME)
    if colourway:
        t.update({k: v for k, v in K.COLOURWAYS[colourway].items() if k in t})
    if undersuit:
        t.update(undersuit)
    return t


def slot_material(name, slot, hexcol, review=True):
    """One Principled material per slot. Review renders add a soft height gradient (the owner's
    'gradient and AO shading'); EEVEE fast-GI supplies AO. The GLB keeps a flat factor."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    col = (*srgb_lin(hexcol), 1)
    rough, metal = SLOT_PBR[slot]
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    b.inputs["Base Color"].default_value = col
    if slot == "emit":
        b.inputs["Emission Color"].default_value = col
        b.inputs["Emission Strength"].default_value = 5.0
    elif slot == "glass":
        b.inputs["Alpha"].default_value = 0.45
        m.surface_render_method = "BLENDED"
    elif review:
        tc = nt.nodes.new("ShaderNodeTexCoord")
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        mr = nt.nodes.new("ShaderNodeMapRange")
        mr.inputs["From Min"].default_value, mr.inputs["From Max"].default_value = 0.0, 1.8
        mr.inputs["To Min"].default_value, mr.inputs["To Max"].default_value = 0.82, 1.06
        rgb = nt.nodes.new("ShaderNodeRGB")
        rgb.outputs[0].default_value = col
        mul = nt.nodes.new("ShaderNodeVectorMath")
        mul.operation = "SCALE"
        nt.links.new(tc.outputs["Object"], sep.inputs[0])
        nt.links.new(sep.outputs["Z"], mr.inputs["Value"])
        nt.links.new(rgb.outputs[0], mul.inputs[0])
        nt.links.new(mr.outputs[0], mul.inputs["Scale"])
        nt.links.new(mul.outputs[0], b.inputs["Base Color"])
    return m


# ============================================================================================ BUILD
def placeholder_materials():
    mats = []
    for sl in K.SLOTS:
        m = bpy.data.materials.get(f"slot.{sl}") or bpy.data.materials.new(f"slot.{sl}")
        mats.append(m)
    return mats


DIRS = [((1, 0, 0), 0), ((-1, 0, 0), 0), ((0, 1, 0), 1), ((0, -1, 0), 1), ((0, 0, 1), 2), ((0, 0, -1), 2)]


def _face_quad(x, y, z, n):
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
    if nx < 0 or ny < 0 or nz < 0:
        q = q[::-1]
    return q


def mesh_volume(cells, name):
    """Exposed-surface mesh of {cell: slot}; coplanar same-slot faces dissolved (CHAR-BODY voxkit algorithm)."""
    vid, verts, faces, fm = {}, [], [], []

    def v(p):
        i = vid.get(p)
        if i is None:
            i = vid[p] = len(verts)
            verts.append((p[0] * V, p[1] * V, p[2] * V))
        return i

    for (x, y, z), s in cells.items():
        for n, _ax in DIRS:
            if (x + n[0], y + n[1], z + n[2]) in cells:
                continue
            faces.append([v(p) for p in _face_quad(x, y, z, n)])
            fm.append(K.SI[s])
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    for m in placeholder_materials():        # real slot materials so joins keep per-slot indices
        me.materials.append(m)
    me.polygons.foreach_set("material_index", fm)
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(1.0), use_dissolve_boundaries=False,
                             verts=bm.verts, edges=bm.edges, delimit={"MATERIAL"})
    bm.to_mesh(me)
    bm.free()
    return me


def bevelled_object(name, cells, bone, coll, bevel):
    """One bone volume: soft-bevelled plate edges, smooth shading with hardened normals, rigid weight."""
    ob = bpy.data.objects.new(name, mesh_volume(cells, name))
    coll.objects.link(ob)
    if bevel > 0:
        md = ob.modifiers.new("plate_bevel", "BEVEL")
        md.width, md.segments, md.limit_method, md.angle_limit = bevel, 2, "ANGLE", math.radians(40)
        md.use_clamp_overlap = True       # (MITER_ARC / harden_normals leave stray vertices at the origin)
        dg = bpy.context.evaluated_depsgraph_get()
        me2 = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
        old = ob.data
        ob.modifiers.clear()
        ob.data = me2
        bpy.data.meshes.remove(old)
        me2.name = name
    ob.data.polygons.foreach_set("use_smooth", [True] * len(ob.data.polygons))
    vg = ob.vertex_groups.new(name=bone)
    vg.add(list(range(len(ob.data.vertices))), 1.0, "REPLACE")
    return ob


def join(objs, name):
    if len(objs) == 1:
        objs[0].name = name
        return objs[0]
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    return ob


def build_armature(coll, name="crew_rig"):
    data = bpy.data.armatures.new(name)
    arm = bpy.data.objects.new(name, data)
    coll.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    for n, h, t, _p in K.rig_bones():
        b = data.edit_bones.new(n)
        b.head, b.tail = Vector(h) * V, Vector(t) * V
    for n, _h, _t, p in K.rig_bones():
        if p:
            data.edit_bones[n].parent = data.edit_bones[p]
    for b in data.edit_bones:
        d = (b.tail - b.head).normalized()
        b.align_roll(Vector((0, 1, 0)) if abs(d.y) < 0.9 else Vector((0, 0, 1)))
    bpy.ops.object.mode_set(mode="OBJECT")
    return arm


class Kit:
    """Template meshes: mannequin regions per variant, armour per part/fit (+ right-side item views)."""

    def __init__(self, bevel):
        self.coll = bpy.data.collections.new("TEMPLATES")
        bpy.context.scene.collection.children.link(self.coll)
        self.mats = {}
        self.arm = build_armature(self.coll, "TPL-crew_rig")
        self.parts = K.build_catalog()
        K.validate(self.parts)
        self.by_id = {p.id: p for p in self.parts}
        self.body = {}
        for variant in ("male", "female", "neutral"):
            for region, vols in K.mannequin(variant).items():
                objs = [bevelled_object(f"TPL.{variant}.{region}.{b}", v.c, b, self.coll, bevel * 0.8) for b, v in vols.items()]
                self.body[(variant, region)] = join(objs, f"TPL-crew-{region}-{variant}")
        self.tpl = {}
        for p in self.parts:
            for fit, vols in p.fits.items():
                objs = [bevelled_object(f"TPL.{p.id}.{fit}.{b}", v.c, b, self.coll, bevel) for b, v in vols.items()]
                ob = join(objs, f"TPL-{p.id}-{fit}")
                ob.data.name = f"GEO-armor-{p.id}-{fit}"
                self.tpl[(p.id, fit)] = ob
                if any(b.endswith(".L") for b in vols):
                    objs = [bevelled_object(f"TPL.{p.id}.{fit}.{b}.item", v.c, b, self.coll, bevel)
                            for b, v in vols.items() if not b.endswith(".L")]
                    self.tpl[(p.id, fit, "R")] = join(objs, f"ITEM-{p.id}-{fit}")
        for ob in self.coll.objects:
            ob.hide_render = True
            ob.hide_set(True)

    def material_set(self, key, table):
        if key not in self.mats:
            self.mats[key] = {s: slot_material(f"{key}.{s}", s, table[s]) for s in K.SLOTS}
        return self.mats[key]


def clone(tpl, arm, coll, mats):
    ob = tpl.copy()
    coll.objects.link(ob)
    ob.hide_render = False
    ob.hide_set(False)
    ob.parent = arm
    ob.matrix_parent_inverse = Matrix.Identity(4)
    for md in list(ob.modifiers):
        ob.modifiers.remove(md)
    md = ob.modifiers.new("crew_rig", "ARMATURE")
    md.object = arm
    for i, s in enumerate(K.SLOTS):
        ob.material_slots[i].link = "OBJECT"
        ob.material_slots[i].material = mats[s]
    return ob


FACE_YAW = 180.0     # review scenes: characters (facing +Y) turned to face the -Y camera


class Figure:
    def __init__(self, kit, part_ids, colourway, loc, coll, variant="male", body=True, pose="relaxed", yaw=0.0,
                 scale=1.0, preset=None, item_side=False):
        self.arm = build_armature(coll)
        self.arm.location = loc
        self.arm.rotation_euler = (0, 0, math.radians(FACE_YAW + yaw))
        self.arm.scale = (scale,) * 3
        self.objs = []
        parts = [kit.by_id[i] for i in part_ids]
        hidden = {h for p in parts for h in p.hides}
        if body:
            us = preset.get("undersuit") if preset else None
            bmats = kit.material_set("body." + (preset["id"] if us else "base"), theme(None, us))
            for region in K.BODY_REGIONS:
                if region in hidden or (region == "hair" and "head" in hidden):
                    continue
                self.objs.append(clone(kit.body[(variant, region)], self.arm, coll, bmats))
        mats = kit.material_set("cw." + colourway, theme(colourway))
        for p in parts:
            k = (p.id, p.fit_for(variant))
            tpl = kit.tpl.get(k + ("R",)) if item_side else None
            self.objs.append(clone(tpl or kit.tpl[k], self.arm, coll, mats))
        apply_pose(self.arm, pose)


# ============================================================================================ POSES
# Armature-space axis/angle per bone (applied parent-relative). flex = +X (swings a hanging limb
# forward; the character faces +Y); abduct = lift outward; twist = about +Z; roll = about +Y (tilt).
# "relaxed" is the review stance: weight on the right leg, hip tilt, arms off the body, elbows soft,
# hands turned in, head tilted. The others are placeholder key poses for the clip check until
# CHAR-BODY's actions exist.
POSES = {
    "rest": {},
    "relaxed": {"root": [("drop", 0.5)], "pelvis": [("roll", 4), ("twist", -4)], "spine": [("roll", -3)],
                "chest": [("roll", -2), ("twist", 5)], "head": [("roll", 6), ("flex", -4)],
                "thigh.R": [("abduct", 2)], "thigh.L": [("flex", 10), ("abduct", 6), ("twist", 10)],
                "shin.L": [("flex", -16)], "foot.L": [("flex", 6)],
                "upper_arm.R": [("abduct", 12), ("flex", 4)], "forearm.R": [("flex", 16)], "hand.R": [("twist", 18)],
                "upper_arm.L": [("abduct", 10), ("flex", -4)], "forearm.L": [("flex", 22)], "hand.L": [("twist", -18)]},
    "run": {"thigh.L": [("flex", 55)], "shin.L": [("flex", -85)], "foot.L": [("flex", 10)],
            "thigh.R": [("flex", -30)], "shin.R": [("flex", -50)],
            "upper_arm.L": [("flex", -40), ("abduct", 8)], "forearm.L": [("flex", 60)],
            "upper_arm.R": [("flex", 45), ("abduct", 8)], "forearm.R": [("flex", 85)],
            "spine": [("flex", 8)], "chest": [("twist", -8)], "root": [("drop", 1)]},
    "aim_rifle": {"upper_arm.R": [("flex", 70), ("abduct", -10)], "forearm.R": [("flex", 60)],
                  "upper_arm.L": [("flex", 75), ("abduct", -25)], "forearm.L": [("flex", 35)],
                  "chest": [("twist", 15)], "spine": [("flex", 6)],
                  "thigh.L": [("flex", 15)], "shin.L": [("flex", -15)], "thigh.R": [("flex", -8)]},
    "crouch_idle": {"thigh.L": [("flex", 100), ("abduct", 12)], "shin.L": [("flex", -130)], "foot.L": [("flex", 30)],
                    "thigh.R": [("flex", 70), ("abduct", 12)], "shin.R": [("flex", -110)], "foot.R": [("flex", 40)],
                    "spine": [("flex", 15)], "chest": [("flex", 8)],
                    "upper_arm.L": [("flex", 30), ("abduct", 10)], "forearm.L": [("flex", 55)],
                    "upper_arm.R": [("flex", 25), ("abduct", 10)], "forearm.R": [("flex", 65)], "root": [("drop", 7)]},
    "sit": {"thigh.L": [("flex", 88), ("abduct", 6)], "shin.L": [("flex", -88)],
            "thigh.R": [("flex", 88), ("abduct", 6)], "shin.R": [("flex", -88)],
            "upper_arm.L": [("flex", 20), ("abduct", 8)], "forearm.L": [("flex", 60)],
            "upper_arm.R": [("flex", 20), ("abduct", 8)], "forearm.R": [("flex", 60)], "root": [("drop", 8)]},
}
KEY_POSES = ["run", "aim_rifle", "crouch_idle", "sit"]


def apply_pose(arm, pose):
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
        pb.rotation_quaternion = Quaternion()
        pb.location = (0, 0, 0)
    arm.animation_data_clear()
    act = bpy.data.actions.get(pose)
    if act is not None and pose not in ("rest", "relaxed"):
        arm.animation_data_create().action = act
        f0, f1 = act.frame_range
        bpy.context.scene.frame_set(int(f0 + (f1 - f0) * 0.25))
        return
    for bn, ops in POSES[pose].items():
        pb = arm.pose.bones[bn]
        rest = pb.bone.matrix_local.to_3x3()
        q = Quaternion()
        side = 1 if bn.endswith(".R") else -1
        for kind, deg in ops:
            if kind == "drop":
                pb.location = rest.inverted() @ Vector((0, 0, -deg * V))
                continue
            axis = {"flex": Vector((1, 0, 0)), "abduct": Vector((0, -side, 0)), "twist": Vector((0, 0, side)),
                    "roll": Vector((0, 1, 0))}[kind]
            q = Quaternion(axis, math.radians(deg)) @ q
        pb.rotation_quaternion = (rest.inverted() @ q.to_matrix() @ rest).to_quaternion()
    bpy.context.view_layer.update()


# ======================================================================================= CLIP CHECK
def key(cells):
    a = np.asarray(cells, dtype=np.int64) + 512
    return (a[:, 0] << 20) | (a[:, 1] << 10) | a[:, 2]


def hinge_pairs():
    par = {n: p for n, _h, _t, p in K.rig_bones()}
    return {(a, b) for a, b in par.items() if b} | {(b, a) for a, b in par.items() if b}


def clip_report(arm, preset, variant, by_id):
    hinges = hinge_pairs()
    parts = [by_id[i] for i in preset["parts"].values()]
    occupied, sources = {}, []
    for (region, b), cells in F.body_for(variant, {h for p in parts for h in p.hides}).items():
        occupied.setdefault(b, set()).update(cells)
        sources.append(("body", "body", b, np.array(list(cells), dtype=np.float64)))
    for p in parts:
        for b, v in p.fits[p.fit_for(variant)].items():
            occupied.setdefault(b, set()).update(v.c)
            sources.append(("armour", p.id, b, np.array(list(v.c), dtype=np.float64)))
    occ_keys = {b: np.sort(key(list(c))) for b, c in occupied.items()}
    result, base = {}, None
    for pose in ["rest"] + KEY_POSES:
        apply_pose(arm, pose)
        D = {pb.name: np.array(pb.matrix @ pb.bone.matrix_local.inverted()) for pb in arm.pose.bones}
        inv = {b: np.linalg.inv(m) for b, m in D.items()}
        counts = {}
        for kind, pid, b, cells in sources:
            w = (cells + 0.5) * V @ D[b][:3, :3].T + D[b][:3, 3]
            for b2, keys2 in occ_keys.items():
                if b2 == b:
                    continue
                loc = np.floor((w @ inv[b2][:3, :3].T + inv[b2][:3, 3]) / V).astype(np.int64)
                hit = int(np.isin(key(loc), keys2).sum())
                if hit:
                    counts[(kind, pid, b, b2)] = hit
        if pose == "rest":
            base = counts
            continue
        new = {k: v - base.get(k, 0) for k, v in counts.items() if v - base.get(k, 0) > 0}
        arm_new = {k: v for k, v in new.items() if k[0] == "armour"}
        body_new = {k: v for k, v in new.items() if k[0] == "body"}
        split = lambda d, h: int(sum(v for k, v in d.items() if ((k[2], k[3]) in hinges) == h))  # noqa: E731
        result[pose] = {
            "penetratingVoxels": int(sum(arm_new.values())), "hinge": split(arm_new, True), "other": split(arm_new, False),
            "bodySelfHinge": split(body_new, True), "bodySelfOther": split(body_new, False),
            "worstOther": {f"{k[1]}@{k[2]} -> {k[3]}": v for k, v in sorted(
                ((k, v) for k, v in arm_new.items() if (k[2], k[3]) not in hinges), key=lambda kv: -kv[1])[:8]},
        }
    apply_pose(arm, "rest")
    return result


# ============================================================================================ EXPORT
def export_part(kit, part, outdir, mats):
    coll = bpy.data.collections.new(f"EXPORT-{part.id}")
    bpy.context.scene.collection.children.link(coll)
    arm = build_armature(coll, "crew_rig")
    objs, tris = [], {}
    for fit in part.fits:
        ob = clone(kit.tpl[(part.id, fit)], arm, coll, mats)
        ob.name = f"GEO-armor-{part.id}-{fit}"
        for i, s in enumerate(K.SLOTS):
            ob.material_slots[i].link = "DATA"
            ob.data.materials[i] = mats[s]
        ob["armor_part"], ob["armor_fit"] = part.id, fit
        ob.data.calc_loop_triangles()
        tris[fit] = len(ob.data.loop_triangles)
        objs.append(ob)
    for n, (bone, (x, y, z), r) in enumerate(part.exhaust):
        e = bpy.data.objects.new(f"EXHAUST-{part.id}-{n}", None)
        coll.objects.link(e)
        e.parent, e.parent_type, e.parent_bone = arm, "BONE", bone
        pb = arm.pose.bones[bone]
        bone_mw = arm.matrix_world @ pb.bone.matrix_local @ Matrix.Translation((0, pb.bone.length, 0))
        e.matrix_parent_inverse = Matrix.Identity(4)
        e.matrix_basis = bone_mw.inverted() @ Matrix.Translation(Vector((x, y, z)) * V)
        e["exhaust_radius_m"] = r * V
        objs.append(e)
    bpy.context.view_layer.update()
    path = outdir / "parts" / f"{part.id}.glb"
    bpy.ops.object.select_all(action="DESELECT")
    for o in [arm, *objs]:
        o.hide_set(False)
        o.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True, export_yup=True,
                              export_apply=False, export_skins=True, export_extras=True, export_materials="EXPORT",
                              export_texcoords=False, export_normals=True, export_tangents=False,
                              export_def_bones=False, export_rest_position_armature=True, export_animations=False)
    for o in [arm, *objs]:
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.collections.remove(coll)
    return path, tris


def export_kit(kit, outdir, fit_report):
    outdir = Path(outdir)
    (outdir / "parts").mkdir(parents=True, exist_ok=True)
    mats = {s: slot_material(f"crew.{s}", s, theme("arctic")[s], review=False) for s in K.SLOTS}
    entries = []
    for p in kit.parts:
        path, tris = export_part(kit, p, outdir, mats)
        fits = {}
        for fit, vols in p.fits.items():
            lo = [min(v.bounds()[0][i] for v in vols.values()) for i in range(3)]
            hi = [max(v.bounds()[1][i] for v in vols.values()) for i in range(3)]
            fits[fit] = {"mesh": f"GEO-armor-{p.id}-{fit}", "tris": tris[fit], "voxels": p.voxels(fit),
                         "boundsVox": {"min": lo, "max": hi}}
        entries.append({
            "id": p.id, "slot": p.slot, "tier": p.tier, "tierName": K.TIERS[p.tier], "style": p.style, "name": p.name,
            "glb": f"parts/{p.id}.glb", "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "bytes": path.stat().st_size,
            "fits": fits, "bones": p.bones(), "socket": p.socket, "hidesBodyRegions": p.hides, "slots": p.slots_used(),
            "massKg": p.mass_kg, "grid": list(p.grid),
            "emissiveSurface": round(F.emissive_surface_share(p), 3),
            **({"exhaust": [{"node": f"EXHAUST-{p.id}-{n}", "bone": b, "restVox": list(c), "radiusM": r * V,
                             "direction": [0, 0, -1]} for n, (b, c, r) in enumerate(p.exhaust)]} if p.exhaust else {}),
        })
    manifest = {
        "schema": "sidereal.crew.armor-manifest/1", "kit": K.KIT_ID, "revision": K.REVISION, "specVersion": K.SPEC_VERSION,
        "status": "proposal; not published; not owner-approved",
        "voxelMeters": V, "rig": "crew_rig",
        "body": "CHAR-ARMOR spec-v2 placeholder rig/body (crew_armor_parts.BODY) pending CHAR-BODY spec_version 2",
        "frame": "Blender Z up, character faces +Y, .R at +X; glTF = (x, z, -y)",
        "attach": ("Each GLB holds crew_rig plus one rigid-skinned mesh per fit (GEO-armor-<id>-<fit>). Parent the "
                   "meshes to the crew visual root and link each armour skeleton bone to the body's joint node of the "
                   "same name; recolour by setting albedo/emissive on the crew.<slot> materials from a colourway; hide "
                   "the body regions listed in hidesBodyRegions."),
        "fits": {k: v["variants"] for k, v in K.FITS.items()},
        "materialSlots": K.SLOTS, "equipmentSlots": K.EQUIPMENT_SLOTS, "tiers": {str(k): v for k, v in K.TIERS.items()},
        "colourways": K.COLOURWAYS, "sheetColourways": K.SHEET_COLOURWAYS, "presets": K.PRESETS,
        "legacyVisuals": K.legacy_visual_map(), "fitReport": fit_report, "parts": entries,
    }
    (outdir / "manifest.json").write_text(json.dumps(manifest, indent=1) + "\n")
    return manifest


def content_catalog(manifest):
    keep = ("id", "slot", "tier", "tierName", "style", "name", "glb", "sha256", "bones", "socket", "hidesBodyRegions",
            "slots", "massKg", "grid", "exhaust")
    return {
        "schema": 1, "kit": manifest["kit"], "revision": manifest["revision"], "specVersion": manifest["specVersion"],
        "status": manifest["status"], "assetBase": "/assets/crew/armor-v1", "rig": manifest["rig"],
        "fits": manifest["fits"], "materialSlots": manifest["materialSlots"], "equipmentSlots": manifest["equipmentSlots"],
        "tiers": manifest["tiers"], "colourways": manifest["colourways"], "sheetColourways": manifest["sheetColourways"],
        "presets": manifest["presets"], "legacyVisuals": manifest["legacyVisuals"],
        "parts": [{**{k: e[k] for k in keep if k in e},
                   "fits": {f: {"mesh": v["mesh"], "tris": v["tris"]} for f, v in e["fits"].items()}} for e in manifest["parts"]],
    }


# ============================================================================================ SCENE
def setup(sc, samples, res):
    sc.render.engine = "BLENDER_EEVEE_NEXT"
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.eevee.taa_render_samples = samples
    for attr, val in (("use_shadows", True), ("use_raytracing", False)):
        if hasattr(sc.eevee, attr):
            setattr(sc.eevee, attr, val)
    w = sc.world or bpy.data.worlds.new("World")
    sc.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position, ramp.color_ramp.elements[0].color = 0.0, (0.006, 0.01, 0.04, 1)
    ramp.color_ramp.elements[1].position, ramp.color_ramp.elements[1].color = 1.0, (0.05, 0.04, 0.16, 1)
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = 1.4
    wo = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(tc.outputs["Window"], sep.inputs[0])
    nt.links.new(sep.outputs["Y"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
    nt.links.new(bg.outputs[0], wo.inputs[0])
    sc.view_settings.view_transform, sc.view_settings.look = "AgX", "AgX - Base Contrast"
    sc.view_settings.exposure, sc.view_settings.gamma = 0.35, 1.1
    sc.use_nodes = True
    ct = sc.node_tree
    ct.nodes.clear()
    rl = ct.nodes.new("CompositorNodeRLayers")
    gl = ct.nodes.new("CompositorNodeGlare")
    gl.glare_type, gl.threshold, gl.size, gl.mix = "FOG_GLOW", 0.9, 7, -0.25
    hs = ct.nodes.new("CompositorNodeHueSat")
    hs.inputs["Saturation"].default_value = 1.3
    bc = ct.nodes.new("CompositorNodeBrightContrast")
    bc.inputs["Contrast"].default_value = -4.0
    comp = ct.nodes.new("CompositorNodeComposite")
    for a, b in ((rl, gl), (gl, hs), (hs, bc), (bc, comp)):
        ct.links.new(a.outputs["Image"], b.inputs["Image"])
    for name, energy, col, rot, ang in (("Key", 3.0, (1.0, 0.95, 0.9), (50, 0, 150), 20), ("Fill", 1.3, (0.6, 0.65, 1.0), (60, 0, -120), 30),
                                        ("Rim", 2.6, (0.65, 0.5, 1.0), (-55, 0, 165), 10), ("Top", 0.8, (1, 1, 1), (0, 0, 0), 40)):
        L = bpy.data.lights.new(name, "SUN")
        L.energy, L.color, L.angle = energy, col, math.radians(ang)
        ob = bpy.data.objects.new(name, L)
        sc.collection.objects.link(ob)
        ob.rotation_euler = [math.radians(a) for a in rot]
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    return cam


def aim_front(cam, target, ortho, elev=6.0, yaw=0.0, dist=30.0):
    """Camera in front of the review line (at -Y, looking +Y); figures are turned to face it.
    ortho is the width of the wider image dimension (Blender sensor fit)."""
    a, e = math.radians(yaw), math.radians(elev)
    off = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist
    cam.location = Vector(target) + off
    cam.rotation_euler = (Vector(target) - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.type, cam.data.ortho_scale = "ORTHO", ortho
    cam.data.clip_end = 200


def label_mat():
    m = bpy.data.materials.get("label") or bpy.data.materials.new("label")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    e = nt.nodes.new("ShaderNodeEmission")
    e.inputs["Color"].default_value = (0.45, 0.8, 1.0, 1)
    e.inputs["Strength"].default_value = 2.0
    o = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(e.outputs[0], o.inputs[0])
    return m


def text(s, loc, size, coll, align="CENTER"):
    cu = bpy.data.curves.new("lbl", "FONT")
    cu.body, cu.size, cu.align_x = s, size, align
    cu.materials.append(label_mat())
    ob = bpy.data.objects.new("lbl", cu)
    coll.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = (math.radians(90), 0, 0)
    return ob


def plinth(loc, coll, r=0.46):
    me = bpy.data.meshes.new("plinth")
    n = 40
    vs = [(r * math.cos(2 * math.pi * i / n), r * math.sin(2 * math.pi * i / n), z) for z in (-0.02, 0.0) for i in range(n)]
    fs = [tuple(range(n))[::-1], tuple(range(n, 2 * n))] + [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    me.from_pydata(vs, [], fs)
    ob = bpy.data.objects.new("plinth", me)
    coll.objects.link(ob)
    ob.location = loc
    m = bpy.data.materials.get("plinth") or bpy.data.materials.new("plinth")
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (0.02, 0.03, 0.07, 1)
    b.inputs["Emission Color"].default_value = (0.1, 0.35, 1.0, 1)
    b.inputs["Emission Strength"].default_value = 0.35
    me.materials.append(m)
    return ob


def world_bounds(objs):
    dg = bpy.context.evaluated_depsgraph_get()
    lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
    for ob in objs:
        ev = ob.evaluated_get(dg)
        me = ev.to_mesh()
        for v in me.vertices:
            w = ob.matrix_world @ v.co
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
        ev.to_mesh_clear()
    return lo, hi


def isolated(kit, pid, colourway, centre, coll, target=0.34, yaw=-35.0):
    fig = Figure(kit, [pid], colourway, (0, 0, 0), coll, body=False, yaw=yaw, item_side=True, pose="rest")
    bpy.context.view_layer.update()
    lo, hi = world_bounds(fig.objs)
    s = min(2.5, target / max(max(hi - lo), 1e-3))
    fig.arm.scale = (s, s, s)
    fig.arm.location = Vector(centre) - (lo + hi) / 2 * s
    bpy.context.view_layer.update()
    return fig


def render(sc, path):
    sc.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    print("RENDERED", path)


def fresh_scene(args, res):
    sc = bpy.context.scene
    for c in list(sc.collection.children):
        if c.name != "TEMPLATES":
            for o in list(c.objects):
                bpy.data.objects.remove(o, do_unlink=True)
            bpy.data.collections.remove(c)
    for o in list(sc.collection.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    cam = setup(sc, args.samples, res)
    coll = bpy.data.collections.new("SHEET")
    sc.collection.children.link(coll)
    return sc, cam, coll


def compare(render_png, refs, dest, height=None):
    """Render beside the matching reference crop(s), scaled to one height (ffmpeg hstack)."""
    refs = [Path(r) for r in refs if Path(r).exists()]
    if not refs:
        return
    h = height or 900
    inputs, filt = [], []
    for i, pth in enumerate([Path(render_png), *refs]):
        inputs += ["-i", str(pth)]
        filt.append(f"[{i}:v]scale=-2:{h}[v{i}]")
    n = len(refs) + 1
    fc = ";".join(filt) + ";" + "".join(f"[v{i}]" for i in range(n)) + f"hstack=inputs={n}[o]"
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *inputs, "-filter_complex", fc, "-map", "[o]", str(dest)], check=True)
    print("COMPARED", dest)


# ============================================================================================ SHEETS
ROWS4 = [("CHEST", "armor.chest.plate"), ("SHOULDERS", "armor.shoulders.standard"),
         ("GLOVES", "armor.gloves.standard"), ("BOOTS", "armor.boots.standard")]


def sheet_progress(args, kit, out):
    """First progress sheet: 4 rows x 4 colourways, plus an assembled medic in the relaxed stance."""
    sc, cam, coll = fresh_scene(args, (1900, 1200))
    cws = ["arctic", "crimson", "cobalt", "amber"]
    dx, dz = 0.55, 0.52
    for r, (label, pid) in enumerate(ROWS4):
        z = -r * dz
        text(label, (-0.42, 0, z - 0.03), 0.065, coll, align="RIGHT")
        for c, cwid in enumerate(cws):
            isolated(kit, pid, cwid, (c * dx, 0, z), coll, target=0.4)
    for c, cwid in enumerate(cws):
        text(K.COLOURWAYS[cwid]["label"].upper(), (c * dx, 0, 0.32), 0.05, coll)
    by = {p["id"]: p for p in K.PRESETS}
    pr = by["role.medic"]
    Figure(kit, list(pr["parts"].values()), pr["colourway"], (3.05, 0, -1.72), coll, preset=pr, yaw=-28)
    plinth((3.05, 0, -1.72), coll)
    text("MEDIC (role.medic)", (3.05, 0, 0.32), 0.07, coll)
    text("CREW ARMOUR r002 (spec v2 proposal)", (1.4, 0, 0.5), 0.075, coll)
    aim_front(cam, (1.55, 0, -0.75), 4.6, elev=12)
    render(sc, out / "armor_progress_r002.png")
    compare(out / "armor_progress_r002.png", [Path(args.refs) / "equip-armor-pieces-6-colourways.png",
                                              Path(args.refs) / "roster-male-03-medic.png"],
            out / "armor_progress_r002_vs_reference.png")


TIER_ROWS = [("CHEST", ["armor.chest.jacket", "armor.chest.harness", "armor.chest.plate", "armor.chest.heavy"]),
             ("SHOULDERS", ["armor.shoulders.cloth", "armor.shoulders.light", "armor.shoulders.standard", "armor.shoulders.heavy"]),
             ("GLOVES", ["armor.gloves.fabric", "armor.gloves.light", "armor.gloves.standard", "armor.gloves.heavy"]),
             ("LEGS", ["armor.legs.cargo", "armor.legs.light", "armor.legs.standard", "armor.legs.heavy"]),
             ("BOOTS", ["armor.boots.sneaker", "armor.boots.light", "armor.boots.standard", "armor.boots.heavy"]),
             ("BELT", ["armor.belt.plain", "armor.belt.utility", "armor.belt.standard", "armor.belt.heavy"]),
             ("BACKPACK", ["armor.back.backpack-t0", "armor.back.backpack-t1", "armor.back.backpack-t2", "armor.back.backpack-t3"])]
TIER_CW = ["civilian", "amber", "cobalt", "crimson"]


def sheet_tiers(args, kit, out):
    sc, cam, coll = fresh_scene(args, (1500, 2100))
    dx, dz = 0.62, 0.52
    for r, (label, ids) in enumerate(TIER_ROWS):
        z = -r * dz
        text(label, (-0.42, 0, z - 0.03), 0.07, coll, align="RIGHT")
        for c, pid in enumerate(ids):
            isolated(kit, pid, TIER_CW[c], (c * dx, 0, z), coll, target=0.40)
    for c, t in enumerate(["TIER 0 CIVILIAN", "TIER 1 LIGHT", "TIER 2 STANDARD", "TIER 3 HEAVY"]):
        text(t, (c * dx, 0, 0.3), 0.055, coll)
    y0 = -len(TIER_ROWS) * dz - 1.35
    for c in range(4):
        Figure(kit, [row[1][c] for row in TIER_ROWS], TIER_CW[c], (c * dx, 0, y0), coll, yaw=-20, scale=0.6)
    text("CREW ARMOUR TIERS (armor-v1 r002 proposal)", (0.93, 0, 0.45), 0.075, coll)
    aim_front(cam, (0.93, 0, -2.55), 7.6, elev=12)
    render(sc, out / "armor_tier_chart.png")
    compare(out / "armor_tier_chart.png", [Path(args.refs) / "roster-male-armor-tiers.png"], out / "armor_tier_chart_vs_reference.png")


def sheet_colourways(args, kit, out):
    sc, cam, coll = fresh_scene(args, (1672, 1180))
    dx, dz = 0.52, 0.5
    for r, (label, pid) in enumerate(ROWS4):
        z = -r * dz
        text(label, (-0.4, 0, z - 0.03), 0.065, coll, align="RIGHT")
        for c, cwid in enumerate(K.SHEET_COLOURWAYS):
            isolated(kit, pid, cwid, (c * dx, 0, z), coll, target=0.38)
    for c, cwid in enumerate(K.SHEET_COLOURWAYS):
        text(K.COLOURWAYS[cwid]["label"].upper(), (c * dx, 0, 0.3), 0.05, coll)
    text("ARMOUR PIECES: 6 COLOURWAYS, ONE GEOMETRY (material slots)", (1.2, 0, 0.45), 0.07, coll)
    aim_front(cam, (1.2, 0, -0.62), 3.95, elev=12)
    render(sc, out / "armor_colourway_grid.png")
    compare(out / "armor_colourway_grid.png", [Path(args.refs) / "equip-armor-pieces-6-colourways.png"],
            out / "armor_colourway_grid_vs_reference.png")


def sheet_back(args, kit, out):
    sc, cam, coll = fresh_scene(args, (1672, 1420))
    rows = [("BACKPACKS", [("armor.back.backpack-t0", "arctic"), ("armor.back.backpack-t1", "crimson"),
                           ("armor.back.backpack-t2", "cobalt"), ("armor.back.backpack-t3", "moss"),
                           ("armor.back.toolpack", "amber"), ("armor.back.radio", "shadow")]),
            ("OXYGEN PACKS", [("armor.back.oxygen-single", c) for c in ("arctic", "crimson", "cobalt")]
             + [("armor.back.oxygen-twin", c) for c in ("amber", "moss", "shadow")]),
            ("JETPACKS", [("armor.back.jetpack-light", c) for c in ("arctic", "amber", "shadow")]
             + [("armor.back.jetpack-heavy", c) for c in ("crimson", "cobalt", "moss")]),
            ("UTILITY BELTS", [("armor.belt.utility", "arctic"), ("armor.belt.utility", "crimson"), ("armor.belt.tool", "amber"),
                               ("armor.belt.medic", "medic"), ("armor.belt.holster", "cobalt"), ("armor.belt.heavy", "shadow")]),
            ("SPECIALIST", [("armor.back.medpack", "medic"), ("armor.belt.sash", "captain"), ("armor.belt.standard", "moss"),
                            ("armor.back.backpack-t2", "salvage"), ("armor.back.oxygen-twin", "salvage"),
                            ("armor.back.jetpack-heavy", "marine")])]
    dx, dz = 0.52, 0.5
    for r, (label, cells) in enumerate(rows):
        z = -r * dz
        text(label, (-0.4, 0, z - 0.03), 0.06, coll, align="RIGHT")
        for c, (pid, cwid) in enumerate(cells):
            isolated(kit, pid, cwid, (c * dx, 0, z), coll, target=0.40, yaw=150 if "back." in pid else -30)
    text("BACK & UTILITY: packs, belts, life support", (1.2, 0, 0.32), 0.07, coll)
    aim_front(cam, (1.2, 0, -1.0), 4.1, elev=12)
    render(sc, out / "back_utility_grid.png")
    compare(out / "back_utility_grid.png", [Path(args.refs) / "equip-back-and-utility.png"], out / "back_utility_grid_vs_reference.png")


def sheet_roles(args, kit, out, presets, name, variant="male", pose="relaxed", yaw=-28, ref=None):
    dx = 0.95
    width = max(3.4, len(presets) * dx)
    sc, cam, coll = fresh_scene(args, (2000, int(2000 * 2.3 / width)))
    for i, pr in enumerate(presets):
        x = i * dx
        Figure(kit, list(pr["parts"].values()), pr["colourway"], (x, 0, 0), coll, variant=variant, pose=pose, yaw=yaw, preset=pr)
        plinth((x, 0, 0), coll)
        text(pr["name"].upper(), (x, 0.6, 1.98), 0.075, coll)
        text(pr["id"], (x, 0.6, -0.16), 0.045, coll)
    aim_front(cam, ((len(presets) - 1) * dx / 2, 0, 0.92), width, elev=10)
    render(sc, out / name)
    if ref:
        compare(out / name, [Path(args.refs) / ref], out / name.replace(".png", "_vs_reference.png"), height=560)


def sheet_loadouts(args, kit, out):
    sc, cam, coll = fresh_scene(args, (1900, 860))
    by = {p["id"]: p for p in K.PRESETS}
    for i, rid in enumerate(["role.medic", "role.engineer", "role.security"]):
        pr = by[rid]
        x = i * 2.25
        Figure(kit, list(pr["parts"].values()), pr["colourway"], (x, 0, 0), coll, yaw=-30,
               pose="aim_rifle" if rid == "role.security" else "relaxed", preset=pr)
        plinth((x, 0, 0), coll)
        text(pr["name"].upper(), (x + 0.45, 0.6, 2.0), 0.11, coll)
        for k, (slot, pid) in enumerate(pr["parts"].items()):
            isolated(kit, pid, pr["colourway"], (x + 0.95, 0, 1.72 - k * 0.26), coll, target=0.21)
            text(slot, (x + 1.2, 0, 1.69 - k * 0.26), 0.04, coll, align="LEFT")
    aim_front(cam, (2.7, 0, 0.9), 7.2, elev=5)
    render(sc, out / "loadout_examples.png")
    compare(out / "loadout_examples.png", [Path(args.refs) / "equip-example-loadouts.png"], out / "loadout_examples_vs_reference.png")


def sheet_poses(args, kit, out, ids=("role.marine", "role.engineer", "role.captain", "role.scientist")):
    sc, cam, coll = fresh_scene(args, (1672, 1900))
    by = {p["id"]: p for p in K.PRESETS}
    poses = ["relaxed"] + KEY_POSES
    for r, rid in enumerate(ids):
        pr = by[rid]
        for c, pose in enumerate(poses):
            Figure(kit, list(pr["parts"].values()), pr["colourway"], (c * 1.05, 0, -r * 2.05), coll, yaw=-50,
                   pose=pose, variant="female" if r % 2 else "male", preset=pr)
            if r == 0:
                text(pose.replace("_", " ").upper(), (c * 1.05, 0.6, 2.0), 0.1, coll)
        text(pr["name"].upper(), (-0.75, 0.6, -r * 2.05 + 0.9), 0.08, coll, align="RIGHT")
    aim_front(cam, (1.7, 0, -2.2), 9.4, elev=10, yaw=-8)
    render(sc, out / "pose_fit_review.png")


# ============================================================================================== MAIN
def main():
    args = parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if args.rig_blend and Path(args.rig_blend).exists():
        with bpy.data.libraries.load(args.rig_blend) as (src, dst):
            dst.actions = list(src.actions)
    kit = Kit(args.bevel)
    summary = {"kit": K.KIT_ID, "revision": K.REVISION, "specVersion": K.SPEC_VERSION, "parts": len(kit.parts),
               "actions": sorted(a.name for a in bpy.data.actions)}
    fit = None
    if args.check or args.export:
        rep = F.report(kit.parts)
        fit = {"zFight": {k: rep[k] for k in ("zFightSingle", "zFightPresets", "totalSingle", "totalPresets")},
               "emissiveSurface": rep["emissiveSurface"], "clip": {},
               "poseSource": "CHAR-BODY actions" if bpy.data.actions else "CHAR-ARMOR placeholder key poses (spec v2 rig)"}
        for pr in K.PRESETS:
            for variant in ("male", "female"):
                fit["clip"][f"{pr['id']}@{variant}"] = clip_report(kit.arm, pr, variant, kit.by_id)
        (out / "fit_report.json").write_text(json.dumps(fit, indent=1))
        summary["zFight"] = [rep["totalSingle"], rep["totalPresets"]]
        summary["clip"] = {k: {p: [v["hinge"], v["other"], v["bodySelfHinge"], v["bodySelfOther"]] for p, v in r.items()}
                           for k, r in fit["clip"].items()}
    by = {p["id"]: p for p in K.PRESETS}
    for s in [s for s in args.sheets.split(",") if s]:
        if s == "progress":
            sheet_progress(args, kit, out)
        elif s == "tiers":
            sheet_tiers(args, kit, out)
        elif s == "colourways":
            sheet_colourways(args, kit, out)
        elif s == "back":
            sheet_back(args, kit, out)
        elif s == "roles":
            sheet_roles(args, kit, out, K.PRESETS[:10], "role_archetypes_male.png", ref="roster-male-10-archetypes.png")
        elif s == "roles-female":
            sheet_roles(args, kit, out, K.PRESETS[:10], "role_archetypes_female.png", variant="female",
                        ref="roster-female-10-archetypes.png")
        elif s == "extras":
            sheet_roles(args, kit, out, K.PRESETS[10:], "role_extras.png")
        elif s == "loadouts":
            sheet_loadouts(args, kit, out)
        elif s == "poses":
            sheet_poses(args, kit, out)
        elif s.startswith("role:"):
            sheet_roles(args, kit, out, [by[s[5:]]], f"{s[5:]}.png")
    if args.export:
        m = export_kit(kit, args.export, fit)
        if args.content_json:
            Path(args.content_json).write_text(json.dumps(content_catalog(m), indent=1) + "\n")
        summary["exported"] = len(m["parts"])
        summary["tris"] = {p["id"]: {f: v["tris"] for f, v in p["fits"].items()} for p in m["parts"]}
    if args.save_blend:
        bpy.ops.wm.save_as_mainfile(filepath=str(out / "crew_armor_kit.blend"))
    (out / "summary.json").write_text(json.dumps(summary, indent=1))
    print("SUMMARY", json.dumps({k: v for k, v in summary.items() if k not in ("tris", "clip")}))


if __name__ == "__main__":
    main()
