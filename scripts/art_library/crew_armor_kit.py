"""Crew voxel armour kit v1: Blender build, fit checks, GLB export and review sheets (headless).

  blender -b --factory-startup -P scripts/art_library/crew_armor_kit.py -- \
      --out /tmp/armor [--body-kit DIR] [--export assets/runtime/crew/armor-v1] \
      [--sheets tiers,colourways,back,roles,extras,loadouts,poses] [--check] [--samples 32]

Geometry comes from crew_armor_parts.py (voxel volumes per bone, rest-pose armature voxels).
Meshing, rig, materials and the base body come from CHAR-BODY's kit so armour and body share one
contract: voxkit.mesh_volume (exposed faces, dissolved, chamfered, box UVs in rest-pose metres),
`crew.<slot>` materials with the shared voxel tint/normal textures, crew_rig with rigid weights.
--body-kit defaults to scripts/art_library/crew_voxel (CHAR-BODY branch) and falls back to the
shared review copy at /root/sidereal-progress/_shared/crew-body-r001/scripts.

--check writes fit_report.json:
  zFight      same-normal coplanar faces between armour and the body (every variant), and between
              the parts of each role preset, in the rest pose. Target 0 (ground-plane soles excluded).
  clip        voxels of worn armour that enter another bone's body/armour cells in key poses
              (run, aim_rifle, crouch_idle, sit), minus the rest-pose overlap. Uses CHAR-BODY's
              actions when the rig carries them, else the placeholder poses below.
"""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import crew_armor_parts as K  # noqa: E402

V = K.V
BODY_KIT_CANDIDATES = [HERE / "crew_voxel", Path("/root/sidereal-progress/_shared/crew-body-r001/scripts")]


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--out", default="/tmp/crew_armor")
    p.add_argument("--body-kit", default="")
    p.add_argument("--rig-blend", default="", help="CHAR-BODY crew-body.blend carrying actions (optional)")
    p.add_argument("--export", default="")
    p.add_argument("--content-json", default="", help="write the runtime content catalog (packages/content/src/crew-armor.json)")
    p.add_argument("--sheets", default="")
    p.add_argument("--check", action="store_true")
    p.add_argument("--samples", type=int, default=32)
    p.add_argument("--save-blend", action="store_true")
    return p.parse_args(argv)


def import_body_kit(path):
    for d in ([Path(path)] if path else []) + BODY_KIT_CANDIDATES:
        if (d / "voxkit.py").exists() and (d / "rig.py").exists():
            sys.path.insert(0, str(d))
            import voxkit, rig, body, build_body  # noqa: E401,E402
            return voxkit, rig, body, build_body, d
    raise SystemExit("CHAR-BODY kit (voxkit.py, rig.py, body.py, build_body.py) not found; pass --body-kit")


VK = RIG = BODY = BB = None


def srgb_lin(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def theme_for(colourway):
    """Armour slot table (linear) for a colourway; character slots keep CHAR-BODY defaults."""
    t = dict(VK.DEFAULT_THEME)
    for s, hx in K.COLOURWAYS[colourway].items():
        if s in t:
            t[s] = srgb_lin(hx)
    return t


def to_vk(vol):
    v = VK.Vol()
    v.c = dict(vol.c)
    return v


# ============================================================================================ BUILD
class Kit:
    """Template meshes: body per variant, armour per part/fit; figures copy objects and share mesh data."""

    def __init__(self, out):
        self.coll = bpy.data.collections.new("TEMPLATES")
        bpy.context.scene.collection.children.link(self.coll)
        self.tint, self.nrm = VK.voxel_textures(str(out / "voxel_tint.png"), str(out / "voxel_normal.png"))
        self.body_mats = VK.slot_materials(VK.DEFAULT_THEME, self.tint, self.nrm, prefix="crew")
        self.cw_mats = {}
        self.arm = BB.build_armature(self.coll)
        self.arm.name = "TPL-crew_rig"
        self.body_tpl, self.body_cells = {}, {}
        for variant in BODY.VARIANTS:
            parts, hair = BODY.build(variant)
            self.body_cells[variant] = {b: set(v.c) for b, v in parts.items()}
            objs = [BB.part_object(f"{variant}.{b}", v, b, self.coll, self.body_mats) for b, v in parts.items()]
            ob = BB.join(objs, f"TPL-crew-body-{variant}")
            VK.assign_materials(ob, self.body_mats)
            hob = BB.part_object(f"TPL-crew-hair-default-{variant}", hair, "head", self.coll, self.body_mats)
            VK.assign_materials(hob, self.body_mats)
            self.body_tpl[variant] = (ob, hob)
        self.parts = K.build_catalog()
        K.validate(self.parts)
        self.by_id = {p.id: p for p in self.parts}
        self.tpl = {}
        for p in self.parts:
            for fit, vols in p.fits.items():
                objs = [BB.part_object(f"{p.id}.{fit}.{b}", to_vk(v), b, self.coll, self.body_mats) for b, v in vols.items()]
                ob = BB.join(objs, f"TPL-{p.id}-{fit}") if len(objs) > 1 else objs[0]
                ob.name = f"TPL-{p.id}-{fit}"
                ob.data.name = f"GEO-armor-{p.id}-{fit}"
                VK.assign_materials(ob, self.body_mats)
                ob["armor_part"], ob["armor_fit"] = p.id, fit
                self.tpl[(p.id, fit)] = ob
                if any(b.endswith(".L") for b in vols):          # right-side-only copy for item views
                    objs = [BB.part_object(f"{p.id}.{fit}.{b}.R", to_vk(v), b, self.coll, self.body_mats)
                            for b, v in vols.items() if not b.endswith(".L")]
                    one = BB.join(objs, f"ITEM-{p.id}-{fit}") if len(objs) > 1 else objs[0]
                    VK.assign_materials(one, self.body_mats)
                    self.tpl[(p.id, fit, "R")] = one
        for ob in self.coll.objects:
            ob.hide_render = True
            ob.hide_set(True)

    def mats(self, colourway):
        if colourway not in self.cw_mats:
            self.cw_mats[colourway] = VK.slot_materials(theme_for(colourway), self.tint, self.nrm, prefix=f"cw.{colourway}")
        return self.cw_mats[colourway]


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
    for i, s in enumerate(VK.SLOTS):
        ob.material_slots[i].link = "OBJECT"
        ob.material_slots[i].material = mats[s]
    return ob


FACE_YAW = 180.0     # review scenes: characters (facing +Y) turned to face the -Y camera


def undersuit_mats(kit, preset):
    """Body undersuit tinted for a role preset (suit_primary/secondary only; skin/hair/eyes untouched)."""
    tint = preset.get("undersuit") if preset else None
    if not tint:
        return kit.body_mats
    key = "undersuit." + preset["id"]
    if key not in kit.cw_mats:
        t = dict(VK.DEFAULT_THEME)
        for s, hx in tint.items():
            t[s] = srgb_lin(hx)
        kit.cw_mats[key] = VK.slot_materials(t, kit.tint, kit.nrm, prefix=key)
    return kit.cw_mats[key]


class Figure:
    def __init__(self, kit, part_ids, colourway, loc, coll, variant="male", body=True, hair=True, pose="rest", yaw=0.0,
                 scale=1.0, preset=None, item_side=False):
        self.arm = BB.build_armature(coll)
        self.arm.location = loc
        self.arm.rotation_euler = (0, 0, math.radians(FACE_YAW + yaw))
        self.arm.scale = (scale,) * 3
        self.objs = []
        if body:
            ob, hob = kit.body_tpl[variant]
            self.objs.append(clone(ob, self.arm, coll, undersuit_mats(kit, preset)))
            if hair:
                self.objs.append(clone(hob, self.arm, coll, kit.body_mats))
        mats = kit.mats(colourway)
        for pid in part_ids:
            part = kit.by_id[pid]
            k = (pid, part.fit_for(variant))
            tpl = kit.tpl.get(k + ("R",)) if item_side else None
            self.objs.append(clone(tpl or kit.tpl[k], self.arm, coll, mats))
        apply_pose(self.arm, pose)


# ============================================================================================ POSES
# Placeholder key poses (armature-space axis/angle per bone, applied parent-relative) used until
# CHAR-BODY's actions exist. Axes: flex = +X (swings a hanging limb forward, character faces +Y),
# abduct = lift outward (about +Y for .R, -Y for .L), twist = about +Z.
POSES = {
    "rest": {},
    "run": {"thigh.L": [("flex", 55)], "shin.L": [("flex", -85)], "foot.L": [("flex", 10)],
            "thigh.R": [("flex", -30)], "shin.R": [("flex", -50)],
            "upper_arm.L": [("flex", -40), ("abduct", 6)], "forearm.L": [("flex", 60)],
            "upper_arm.R": [("flex", 45), ("abduct", 6)], "forearm.R": [("flex", 85)],
            "spine": [("flex", 8)], "chest": [("twist", -8)], "root": [("drop", 1)]},
    "aim_rifle": {"upper_arm.R": [("flex", 70), ("abduct", -15)], "forearm.R": [("flex", 60)],
                  "upper_arm.L": [("flex", 75), ("abduct", -30)], "forearm.L": [("flex", 35)],
                  "chest": [("twist", 15)], "spine": [("flex", 6)],
                  "thigh.L": [("flex", 15)], "shin.L": [("flex", -15)], "thigh.R": [("flex", -8)]},
    "crouch_idle": {"thigh.L": [("flex", 100), ("abduct", 12)], "shin.L": [("flex", -130)], "foot.L": [("flex", 30)],
                    "thigh.R": [("flex", 70), ("abduct", 12)], "shin.R": [("flex", -110)], "foot.R": [("flex", 40)],
                    "spine": [("flex", 15)], "chest": [("flex", 8)],
                    "upper_arm.L": [("flex", 30), ("abduct", 8)], "forearm.L": [("flex", 55)],
                    "upper_arm.R": [("flex", 25), ("abduct", 8)], "forearm.R": [("flex", 65)], "root": [("drop", 9)]},
    "sit": {"thigh.L": [("flex", 88), ("abduct", 6)], "shin.L": [("flex", -88)],
            "thigh.R": [("flex", 88), ("abduct", 6)], "shin.R": [("flex", -88)],
            "upper_arm.L": [("flex", 20), ("abduct", 6)], "forearm.L": [("flex", 60)],
            "upper_arm.R": [("flex", 20), ("abduct", 6)], "forearm.R": [("flex", 60)], "root": [("drop", 11)]},
}
KEY_POSES = ["run", "aim_rifle", "crouch_idle", "sit"]


def apply_pose(arm, pose):
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
        pb.rotation_quaternion = Quaternion()
        pb.location = (0, 0, 0)
    arm.animation_data_clear()
    act = bpy.data.actions.get(pose)
    if act is not None and pose != "rest":             # CHAR-BODY action: sample its key pose
        arm.animation_data_create().action = act
        f0, f1 = act.frame_range
        bpy.context.scene.frame_set(int(f0 + (f1 - f0) * 0.25))
        return
    for bn, ops in POSES[pose].items():
        pb = arm.pose.bones[bn]
        rest = pb.bone.matrix_local.to_3x3()
        q = Quaternion()
        for kind, deg in ops:
            if kind == "drop":
                pb.location = rest.inverted() @ Vector((0, 0, -deg * V))
                continue
            side = 1 if bn.endswith(".R") else -1
            axis = {"flex": Vector((1, 0, 0)), "abduct": Vector((0, -side, 0)), "twist": Vector((0, 0, 1))}[kind]
            q = Quaternion(axis, math.radians(deg)) @ q
        pb.rotation_quaternion = (rest.inverted() @ q.to_matrix() @ rest).to_quaternion()
    bpy.context.view_layer.update()


# ======================================================================================= FIT CHECKS
DIRS = [((1, 0, 0), 0, 1), ((-1, 0, 0), 0, -1), ((0, 1, 0), 1, 1), ((0, -1, 0), 1, -1), ((0, 0, 1), 2, 1), ((0, 0, -1), 2, -1)]


def faces(cells):
    """Exposed faces of a cell set as keys (boundary x, y, z, axis, sign)."""
    out = set()
    for c in cells:
        for n, ax, sg in DIRS:
            nb = (c[0] + n[0], c[1] + n[1], c[2] + n[2])
            if nb in cells:
                continue
            k = list(c)
            if sg > 0:
                k[ax] += 1
            out.add((k[0], k[1], k[2], ax, sg))
    return out


def ground(f):
    return f[3] == 2 and f[4] == -1 and f[2] == 0


def buried(f, occ):
    """The cell on the outward side of the face is occupied, so the face is hidden in the rest pose."""
    c = list(f[:3])
    if f[4] < 0:
        c[f[3]] -= 1
    return tuple(c) in occ


def zfight_report(kit):
    """Visible same-normal coplanar faces (rest pose): armour vs each body variant, and between the
    parts of every role preset (worn together on each variant). Hidden (buried) faces are ignored."""
    rep = {"armourVsBody": {}, "presetPartPairs": {}}
    cells = {(p.id, fit): set().union(*(set(v.c) for v in vols.values())) for p in kit.parts for fit, vols in p.fits.items()}
    pfaces = {(p.id, fit): set().union(*(faces(set(v.c)) for v in vols.values())) for p in kit.parts for fit, vols in p.fits.items()}
    bocc = {var: set().union(*c.values()) for var, c in kit.body_cells.items()}
    bfaces = {var: set().union(*(faces(c) for c in cs.values())) for var, cs in kit.body_cells.items()}
    for p in kit.parts:
        for var in kit.body_cells:
            k = (p.id, p.fit_for(var))
            occ = bocc[var] | cells[k]
            bad = sum(1 for f in pfaces[k] & bfaces[var] if not ground(f) and not buried(f, occ))
            if bad:
                rep["armourVsBody"][f"{p.id}@{var}"] = bad
    for pr in K.PRESETS:
        for var in ("male", "female"):
            ks = [(pid, kit.by_id[pid].fit_for(var)) for pid in pr["parts"].values()]
            occ = bocc[var].union(*(cells[k] for k in ks))
            for i, a in enumerate(ks):
                for b in ks[i + 1:]:
                    n = sum(1 for f in pfaces[a] & pfaces[b] if not ground(f) and not buried(f, occ))
                    if n:
                        rep["presetPartPairs"][f"{pr['id']}@{var}: {a[0]} x {b[0]}"] = n
    rep["totalArmourVsBody"] = sum(rep["armourVsBody"].values())
    rep["totalPresetPairs"] = sum(rep["presetPartPairs"].values())
    return rep


def key(cells):
    a = np.asarray(cells, dtype=np.int64) + 512
    return (a[:, 0] << 20) | (a[:, 1] << 10) | a[:, 2]


def hinge_pairs():
    par = {n: p for n, _h, _t, p in RIG.bones()}
    return {(a, b) for a, b in par.items() if b} | {(b, a) for a, b in par.items() if b}


def clip_report(kit, arm, preset, variant):
    """Cell-centre samples of worn armour entering another bone's occupied cells (body + worn armour)
    in each key pose, minus the rest-pose overlap. `hinge` = parent/child bone pairs (rigid voxel
    hinges overlap by construction); `other` = everything else (limb through torso, leg through leg).
    `bodySelf*` is the same measure for the bare body's own cells: the floor any armour inherits."""
    hinges = hinge_pairs()
    occupied = {}
    sources = []                                    # (kind, part id, bone, cells)
    for b, cells in kit.body_cells[variant].items():
        occupied.setdefault(b, set()).update(cells)
        sources.append(("body", "body", b, np.array(list(cells), dtype=np.float64)))
    for pid in preset["parts"].values():
        p = kit.by_id[pid]
        for b, v in p.fits[p.fit_for(variant)].items():
            occupied.setdefault(b, set()).update(v.c)
            sources.append(("armour", pid, b, np.array(list(v.c), dtype=np.float64)))
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
            "penetratingVoxels": int(sum(arm_new.values())),
            "hinge": split(arm_new, True), "other": split(arm_new, False),
            "bodySelfHinge": split(body_new, True), "bodySelfOther": split(body_new, False),
            "worstOther": {f"{k[1]}@{k[2]} -> {k[3]}": v for k, v in sorted(
                ((k, v) for k, v in arm_new.items() if (k[2], k[3]) not in hinges), key=lambda kv: -kv[1])[:8]},
        }
    apply_pose(arm, "rest")
    return result


# ============================================================================================ EXPORT
def export_part(kit, part, outdir):
    """GLB: crew_rig + one rigid-skinned mesh per fit (+ exhaust empties). Same settings as the body."""
    scene_coll = bpy.data.collections.new(f"EXPORT-{part.id}")
    bpy.context.scene.collection.children.link(scene_coll)
    arm = BB.build_armature(scene_coll)
    arm.name = "crew_rig"
    objs = []
    tris = {}
    for fit in part.fits:
        ob = clone(kit.tpl[(part.id, fit)], arm, scene_coll, kit.body_mats)
        ob.name = f"GEO-armor-{part.id}-{fit}"
        for i, s in enumerate(VK.SLOTS):            # data-level materials so the GLB carries crew.<slot>
            ob.material_slots[i].link = "DATA"
        ob["armor_part"], ob["armor_fit"] = part.id, fit
        tris[fit] = VK.tri_count(ob.data)
        objs.append(ob)
    for n, (bone, (x, y, z), r) in enumerate(part.exhaust):
        e = bpy.data.objects.new(f"EXHAUST-{part.id}-{n}", None)
        scene_coll.objects.link(e)
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
                              export_image_format="AUTO", export_texcoords=True, export_normals=True,
                              export_tangents=False, export_def_bones=False, export_rest_position_armature=True,
                              export_animations=False)
    for o in [arm, *objs]:
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.collections.remove(scene_coll)
    return path, tris


def export_kit(kit, outdir, fit_report, body_kit_dir):
    outdir = Path(outdir)
    (outdir / "parts").mkdir(parents=True, exist_ok=True)
    entries = []
    for p in kit.parts:
        path, tris = export_part(kit, p, outdir)
        bounds = {}
        for fit, vols in p.fits.items():
            lo = [min(v.bounds()[0][i] for v in vols.values()) for i in range(3)]
            hi = [max(v.bounds()[1][i] for v in vols.values()) for i in range(3)]
            bounds[fit] = {"minVox": lo, "maxVox": hi}
        entries.append({
            "id": p.id, "slot": p.slot, "tier": p.tier, "tierName": K.TIERS[p.tier], "style": p.style, "name": p.name,
            "glb": f"parts/{p.id}.glb", "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "bytes": path.stat().st_size,
            "fits": {fit: {"mesh": f"GEO-armor-{p.id}-{fit}", "tris": tris[fit], "voxels": p.voxels(fit),
                           "boundsVox": bounds[fit]} for fit in p.fits},
            "bones": p.bones(), "socket": p.socket, "slots": p.slots_used(), "massKg": p.mass_kg, "grid": list(p.grid),
            **({"exhaust": [{"node": f"EXHAUST-{p.id}-{n}", "bone": b, "restVox": list(c), "radiusM": r * V,
                             "direction": [0, 0, -1]} for n, (b, c, r) in enumerate(p.exhaust)]} if p.exhaust else {}),
        })
    spec = json.loads((body_kit_dir.parent / "body-spec.json").read_text()) if (body_kit_dir.parent / "body-spec.json").exists() else {}
    manifest = {
        "schema": "sidereal.crew.armor-manifest/1", "kit": K.KIT_ID, "revision": K.REVISION,
        "status": "proposal; not published; not owner-approved",
        "voxelMeters": V, "rig": "crew_rig", "bodyRevision": spec.get("revision", RIG.REVISION),
        "frame": "Blender Z up, character faces +Y, .R at +X; glTF = (x, z, -y)",
        "attach": ("Each GLB holds crew_rig plus one rigid-skinned mesh per fit (GEO-armor-<id>-<fit>). Parent the "
                   "meshes to the crew visual root and link each armour skeleton bone to the body's joint node of the "
                   "same name; recolour by setting albedo/emissive on the crew.<slot> materials from a colourway."),
        "fits": {k: v["variants"] for k, v in K.FITS.items()},
        "materialSlots": K.SLOTS, "equipmentSlots": K.EQUIPMENT_SLOTS, "tiers": {str(k): v for k, v in K.TIERS.items()},
        "colourways": K.COLOURWAYS, "sheetColourways": K.SHEET_COLOURWAYS, "presets": K.PRESETS,
        "legacyVisuals": K.legacy_visual_map(), "fitReport": fit_report, "parts": entries,
    }
    (outdir / "manifest.json").write_text(json.dumps(manifest, indent=1) + "\n")
    return manifest


def content_catalog(manifest):
    """Compact runtime catalog for packages/content (no fit report / bounds): ids, slots, tiers,
    fits, bones, sockets, colourways, presets and the legacy-item visual map."""
    keep = ("id", "slot", "tier", "tierName", "style", "name", "glb", "sha256", "bones", "socket", "slots", "massKg", "grid", "exhaust")
    return {
        "schema": 1, "kit": manifest["kit"], "revision": manifest["revision"], "status": manifest["status"],
        "assetBase": "/assets/crew/armor-v1", "rig": manifest["rig"], "bodyRevision": manifest["bodyRevision"],
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
    ramp.color_ramp.elements[0].position, ramp.color_ramp.elements[0].color = 0.0, (0.004, 0.008, 0.03, 1)
    ramp.color_ramp.elements[1].position, ramp.color_ramp.elements[1].color = 1.0, (0.03, 0.03, 0.12, 1)
    bg = nt.nodes.new("ShaderNodeBackground")
    wo = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(tc.outputs["Window"], sep.inputs[0])
    nt.links.new(sep.outputs["Y"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
    nt.links.new(bg.outputs[0], wo.inputs[0])
    sc.view_settings.view_transform, sc.view_settings.look = "AgX", "AgX - Base Contrast"
    sc.view_settings.exposure, sc.view_settings.gamma = 0.25, 1.05
    sc.use_nodes = True
    ct = sc.node_tree
    ct.nodes.clear()
    rl = ct.nodes.new("CompositorNodeRLayers")
    gl = ct.nodes.new("CompositorNodeGlare")
    gl.glare_type, gl.threshold, gl.size, gl.mix = "FOG_GLOW", 0.9, 7, -0.2
    hs = ct.nodes.new("CompositorNodeHueSat")
    hs.inputs["Saturation"].default_value = 1.25
    bc = ct.nodes.new("CompositorNodeBrightContrast")
    bc.inputs["Contrast"].default_value = -2.0
    comp = ct.nodes.new("CompositorNodeComposite")
    for a, b in ((rl, gl), (gl, hs), (hs, bc), (bc, comp)):
        ct.links.new(a.outputs["Image"], b.inputs["Image"])
    for name, energy, col, rot in (("Key", 3.2, (1.0, 0.95, 0.88), (50, 0, 145)), ("Fill", 1.1, (0.55, 0.6, 1.0), (60, 0, -110)),
                                   ("Rim", 2.4, (0.6, 0.45, 1.0), (-60, 0, 160))):
        L = bpy.data.lights.new(name, "SUN")
        L.energy, L.color, L.angle = energy, col, math.radians(8)
        ob = bpy.data.objects.new(name, L)
        sc.collection.objects.link(ob)
        ob.rotation_euler = [math.radians(a) for a in rot]
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    return cam


def aim_front(cam, target, ortho, elev=6.0, yaw=0.0, dist=30.0):
    """Camera in front of the review line (at -Y, looking +Y); figures are turned to face it."""
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


def text(s, loc, size, coll, align="CENTER", white=False):
    cu = bpy.data.curves.new("lbl", "FONT")
    cu.body, cu.size, cu.align_x = s, size, align
    cu.materials.append(label_mat())
    ob = bpy.data.objects.new("lbl", cu)
    coll.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = (math.radians(90), 0, 0)
    return ob


def plinth(loc, coll, r=0.42):
    me = bpy.data.meshes.new("plinth")
    n = 32
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
    b.inputs["Emission Strength"].default_value = 0.25
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


def isolated(kit, pid, colourway, centre, coll, target=0.34, yaw=-35.0, fit_variant="male"):
    fig = Figure(kit, [pid], colourway, (0, 0, 0), coll, variant=fit_variant, body=False, yaw=yaw, item_side=True)
    bpy.context.view_layer.update()
    lo, hi = world_bounds(fig.objs)
    size = max(hi - lo)
    s = min(2.5, target / max(size, 1e-3))
    c = (lo + hi) / 2
    fig.arm.scale = (s, s, s)
    fig.arm.location = Vector(centre) - c * s
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


# ============================================================================================ SHEETS
TIER_ROWS = [("CHEST", ["armor.chest.jacket", "armor.chest.harness", "armor.chest.plate", "armor.chest.heavy"]),
             ("SHOULDERS", ["armor.shoulders.cloth", "armor.shoulders.light", "armor.shoulders.standard", "armor.shoulders.heavy"]),
             ("GLOVES", ["armor.gloves.fabric", "armor.gloves.light", "armor.gloves.standard", "armor.gloves.heavy"]),
             ("LEGS", ["armor.legs.cargo", "armor.legs.light", "armor.legs.standard", "armor.legs.heavy"]),
             ("BOOTS", ["armor.boots.sneaker", "armor.boots.light", "armor.boots.standard", "armor.boots.heavy"]),
             ("BELT", ["armor.belt.plain", "armor.belt.utility", "armor.belt.standard", "armor.belt.heavy"]),
             ("BACKPACK", ["armor.back.backpack-t0", "armor.back.backpack-t1", "armor.back.backpack-t2", "armor.back.backpack-t3"])]
TIER_CW = ["civilian", "amber", "cobalt", "crimson"]


def sheet_tiers(args, kit, out):
    sc, cam, coll = fresh_scene(args, (1500, 1900))
    dx, dz = 0.62, 0.52
    for r, (label, ids) in enumerate(TIER_ROWS):
        z = -r * dz
        text(label, (-0.42, 0, z - 0.03), 0.07, coll, align="RIGHT")
        for c, pid in enumerate(ids):
            isolated(kit, pid, TIER_CW[c], (c * dx, 0, z), coll, target=0.40)
    for c, t in enumerate(["TIER 0 CIVILIAN", "TIER 1 LIGHT", "TIER 2 STANDARD", "TIER 3 HEAVY"]):
        text(t, (c * dx, 0, 0.3), 0.055, coll)
    # full-body tier line-up underneath
    y0 = -len(TIER_ROWS) * dz - 1.45
    for c in range(4):
        ids = [row[1][c] for row in TIER_ROWS]
        Figure(kit, ids, TIER_CW[c], (c * dx, 0, y0), coll, yaw=-20, scale=0.62)
    text("CREW ARMOUR TIERS  (armor-v1 r001 proposal)", (0.93, 0, 0.45), 0.075, coll)
    aim_front(cam, (0.93, 0, -2.45), 7.3, elev=14)
    render(sc, out / "armor_tier_chart.png")


def sheet_colourways(args, kit, out):
    sc, cam, coll = fresh_scene(args, (1672, 1180))
    rows = [("CHEST", "armor.chest.plate"), ("SHOULDERS", "armor.shoulders.standard"),
            ("GLOVES", "armor.gloves.standard"), ("BOOTS", "armor.boots.standard")]
    dx, dz = 0.52, 0.5
    for r, (label, pid) in enumerate(rows):
        z = -r * dz
        text(label, (-0.4, 0, z - 0.03), 0.065, coll, align="RIGHT")
        for c, cwid in enumerate(K.SHEET_COLOURWAYS):
            isolated(kit, pid, cwid, (c * dx, 0, z), coll, target=0.38)
    for c, cwid in enumerate(K.SHEET_COLOURWAYS):
        text(K.COLOURWAYS[cwid]["label"].upper(), (c * dx, 0, 0.3), 0.05, coll)
    text("ARMOUR PIECES: 6 COLOURWAYS, ONE GEOMETRY (material slots)", (1.2, 0, 0.45), 0.07, coll)
    aim_front(cam, (1.2, 0, -0.62), 3.95, elev=14)
    render(sc, out / "armor_colourway_grid.png")


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
    aim_front(cam, (1.2, 0, -1.0), 4.1, elev=14)
    render(sc, out / "back_utility_grid.png")


def sheet_roles(args, kit, out, presets, name, variant="male", pose="rest", yaw=-32):
    dx = 0.9
    width = max(3.4, len(presets) * dx)
    sc, cam, coll = fresh_scene(args, (2000, int(2000 * 2.55 / width)))
    for i, pr in enumerate(presets):
        x = i * dx
        Figure(kit, list(pr["parts"].values()), pr["colourway"], (x, 0, 0), coll, variant=variant, pose=pose, yaw=yaw,
               preset=pr)
        plinth((x, 0, 0), coll)
        text(pr["name"].upper(), (x, 0.6, 2.05), 0.075, coll)
        text(pr["id"], (x, 0.6, -0.18), 0.045, coll)
    aim_front(cam, ((len(presets) - 1) * dx / 2, 0, 0.98), width, elev=12)
    render(sc, out / name)


def sheet_loadouts(args, kit, out):
    sc, cam, coll = fresh_scene(args, (1900, 860))
    by = {p["id"]: p for p in K.PRESETS}
    for i, rid in enumerate(["role.medic", "role.engineer", "role.security"]):
        pr = by[rid]
        x = i * 2.25
        Figure(kit, list(pr["parts"].values()), pr["colourway"], (x, 0, 0), coll, yaw=-30,
               pose="aim_rifle" if rid == "role.security" else "rest", preset=pr)
        plinth((x, 0, 0), coll)
        text(pr["name"].upper(), (x + 0.45, 0.6, 2.08), 0.11, coll)
        items = list(pr["parts"].items())
        for k, (slot, pid) in enumerate(items):
            isolated(kit, pid, pr["colourway"], (x + 0.95, 0, 1.78 - k * 0.27), coll, target=0.21)
            text(slot, (x + 1.2, 0, 1.75 - k * 0.27), 0.04, coll, align="LEFT")
    aim_front(cam, (2.7, 0, 0.95), 7.2, elev=5)
    render(sc, out / "loadout_examples.png")


def sheet_poses(args, kit, out, ids=("role.marine", "role.engineer", "role.captain", "role.scientist")):
    sc, cam, coll = fresh_scene(args, (1672, 1900))
    by = {p["id"]: p for p in K.PRESETS}
    poses = ["rest"] + KEY_POSES
    for r, rid in enumerate(ids):
        pr = by[rid]
        for c, pose in enumerate(poses):
            Figure(kit, list(pr["parts"].values()), pr["colourway"], (c * 1.05, 0, -r * 2.15), coll, yaw=-55,
                   pose=pose, variant="female" if r % 2 else "male", preset=pr)
            if r == 0:
                text(pose.replace("_", " ").upper(), (c * 1.05, 0.6, 2.1), 0.1, coll)
        text(pr["name"].upper(), (-0.75, 0.6, -r * 2.15 + 0.9), 0.08, coll, align="RIGHT")
    aim_front(cam, (1.7, 0, -2.25), 9.6, elev=10, yaw=-8)
    render(sc, out / "pose_fit_review.png")


# ============================================================================================== MAIN
def main():
    global VK, RIG, BODY, BB
    args = parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    VK, RIG, BODY, BB, kit_dir = import_body_kit(args.body_kit)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if args.rig_blend and Path(args.rig_blend).exists():
        with bpy.data.libraries.load(args.rig_blend) as (src, dst):
            dst.actions = list(src.actions)
    kit = Kit(out)
    summary = {"kit": K.KIT_ID, "revision": K.REVISION, "bodyKit": str(kit_dir), "parts": len(kit.parts),
               "actionsFromBody": sorted(a.name for a in bpy.data.actions)}
    fit = None
    if args.check or args.export:
        fit = {"zFight": zfight_report(kit), "clip": {}, "poseSource": "CHAR-BODY actions" if bpy.data.actions else "placeholder key poses"}
        arm = kit.arm
        for pr in K.PRESETS:
            for variant in ("male", "female"):
                fit["clip"][f"{pr['id']}@{variant}"] = clip_report(kit, arm, pr, variant)
        (out / "fit_report.json").write_text(json.dumps(fit, indent=1))
        summary["zFight"] = {"armourVsBody": fit["zFight"]["totalArmourVsBody"], "presetPairs": fit["zFight"]["totalPresetPairs"]}
        summary["clip"] = {k: {p: [v["hinge"], v["other"], v["bodySelfHinge"], v["bodySelfOther"]] for p, v in r.items()}
                           for k, r in fit["clip"].items()}
    for s in [s for s in args.sheets.split(",") if s]:
        if s == "tiers":
            sheet_tiers(args, kit, out)
        elif s == "colourways":
            sheet_colourways(args, kit, out)
        elif s == "back":
            sheet_back(args, kit, out)
        elif s == "roles":
            sheet_roles(args, kit, out, K.PRESETS[:10], "role_archetypes_male.png")
        elif s == "roles-female":
            sheet_roles(args, kit, out, K.PRESETS[:10], "role_archetypes_female.png", variant="female")
        elif s == "extras":
            sheet_roles(args, kit, out, K.PRESETS[10:], "role_extras.png")
        elif s == "loadouts":
            sheet_loadouts(args, kit, out)
        elif s == "poses":
            sheet_poses(args, kit, out)
    if args.export:
        m = export_kit(kit, args.export, fit, kit_dir)
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
