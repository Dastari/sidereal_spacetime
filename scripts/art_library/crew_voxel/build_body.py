"""Build the voxel crew base body, crew_rig, sockets and (optionally) the animation library.

Usage (headless only):
  blender -b --factory-startup -P scripts/art_library/crew_voxel/build_body.py -- \
      --out /tmp/crew_body [--no-anim] [--no-render] [--spec path.json] [--samples 32]

Outputs in --out:
  crew-body-<variant>.glb   rig + one body variant + default hair + sockets (+ actions)
  crew-body.glb             runtime bundle: rig + all variants + hairs + sockets + actions
  crew-body.blend           editable source (rig, bodies, sockets, actions)
  voxel_tint.png, voxel_normal.png
  body-spec.json            CHARACTER_SPEC_BODY (bones, sockets, segments, slots, voxel size)
  manifest.json             ids, sockets, slots, tri counts, bounds, actions
  renders (turnaround, comparison sheet) unless --no-render
"""
import argparse
import json
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import anims  # noqa: E402
import body  # noqa: E402
import rig  # noqa: E402
import voxkit  # noqa: E402
from voxkit import SLOTS, VOXEL  # noqa: E402


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--out", default="/tmp/crew_body")
    p.add_argument("--no-anim", action="store_true")
    p.add_argument("--no-render", action="store_true")
    p.add_argument("--spec", default="")
    p.add_argument("--samples", type=int, default=32)
    p.add_argument("--shots", default="", help="comma list: turnaround,anim")
    p.add_argument("--only", default="", help="comma list of action names to build (iteration)")
    p.add_argument("--no-export", action="store_true")
    return p.parse_args(argv)


def V(v):
    return Vector((v[0] * VOXEL, v[1] * VOXEL, v[2] * VOXEL))


def build_armature(coll):
    arm_data = bpy.data.armatures.new("crew_rig")
    arm = bpy.data.objects.new("crew_rig", arm_data)
    coll.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm_data.edit_bones
    for name, h, t, parent in rig.bones():
        b = eb.new(name)
        b.head, b.tail = V(h), V(t)
        b.roll = 0.0
    for name, h, t, parent in rig.bones():
        if parent:
            eb[name].parent = eb[parent]
            eb[name].use_connect = False
    # deterministic rolls: bones' local Z points forward (+Y) for vertical bones, up for horizontal
    for b in eb:
        d = (b.tail - b.head).normalized()
        ref = Vector((0, 1, 0)) if abs(d.y) < 0.9 else Vector((0, 0, 1))
        b.align_roll(ref)
    bpy.ops.object.mode_set(mode="OBJECT")
    arm.show_in_front = True
    return arm


def part_object(name, part, bone, coll, mats):
    me = voxkit.mesh_part(part, name, mats=mats, seed=sum(map(ord, name)),
                          jitter=0.06 if "hair" in name else 0.025)
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    voxkit.soften(ob)
    vg = ob.vertex_groups.new(name=bone)
    vg.add(list(range(len(ob.data.vertices))), 1.0, "REPLACE")
    return ob


def join(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    ob.data.name = name
    return ob


def skin(ob, arm):
    ob.parent = arm
    md = ob.modifiers.new("crew_rig", "ARMATURE")
    md.object = arm


REGIONS = {  # separate meshes so heads / gloves / boots can hide the base segment they replace
    "head": ["head"],
    "hands": ["hand.L", "hand.R"],
    "feet": ["foot.L", "foot.R", "toe.L", "toe.R"],
}


def region_of(bone):
    for r, bones in REGIONS.items():
        if bone in bones:
            return r
    return "body"


def build_bodies(arm, mats, coll):
    bodies, stats = {}, {}
    for variant in body.VARIANTS:
        parts, hair = body.build(variant)
        meshes = {}
        for region in ("body", "head", "hands", "feet"):
            objs = [part_object(f"{variant}.{bone}", part, bone, coll, mats)
                    for bone, part in parts.items() if region_of(bone) == region and part.islands]
            ob = join(objs, f"GEO-crew-{region}-{variant}")
            voxkit.assign_materials(ob, mats)
            skin(ob, arm)
            ob["crew_part"] = f"{region}.{variant}"
            meshes[region] = ob
        hob = part_object(f"GEO-crew-hair-default-{variant}", hair, "head", coll, mats)
        voxkit.assign_materials(hob, mats)
        skin(hob, arm)
        hob["crew_part"] = f"hair.default.{variant}"
        bodies[variant] = {"meshes": meshes, "hair": hob, "parts": parts, "hairVol": hair}
        stats[variant] = {"tris": sum(voxkit.tri_count(o.data) for o in meshes.values()),
                          "trisByRegion": {r: voxkit.tri_count(o.data) for r, o in meshes.items()},
                          "hairTris": voxkit.tri_count(hob.data),
                          "voxels": sum(p.cells() for p in parts.values()), "hairVoxels": hair.cells(),
                          "islands": sum(len(p.islands) for p in parts.values()), "hairIslands": len(hair.islands)}
    return bodies, stats


def build_sockets(arm, coll):
    socks = {}
    for name, (bone, loc, xa, ya, za) in rig.sockets().items():
        e = bpy.data.objects.new(name, None)
        e.empty_display_type, e.empty_display_size = "ARROWS", 0.06
        coll.objects.link(e)
        mw = Matrix((
            (xa[0], ya[0], za[0], loc[0] * VOXEL),
            (xa[1], ya[1], za[1], loc[1] * VOXEL),
            (xa[2], ya[2], za[2], loc[2] * VOXEL),
            (0, 0, 0, 1)))
        e.parent = arm
        e.parent_type = "BONE"
        e.parent_bone = bone
        # bone-parented objects are relative to the bone TAIL in bone space
        pb = arm.pose.bones[bone]
        bone_mw = arm.matrix_world @ pb.bone.matrix_local @ Matrix.Translation((0, pb.bone.length, 0))
        e.matrix_parent_inverse = Matrix.Identity(4)
        e.matrix_basis = bone_mw.inverted() @ mw
        socks[name] = (bone, mw)
    bpy.context.view_layer.update()
    return socks


def segment_bounds(bodies):
    seg = {}
    for variant, b in bodies.items():
        parts, hair = b["parts"], b["hairVol"]
        for bone, part in parts.items():
            if not part.islands:
                continue
            lo, hi = part.bounds()
            seg.setdefault(bone, {})[variant] = {"region": region_of(bone), "minVox": lo, "maxVox": hi,
                                                 "min": rig.m(lo), "max": rig.m(hi)}
        lo, hi = hair.bounds()
        seg.setdefault("hair.default", {})[variant] = {"bone": "head", "minVox": lo, "maxVox": hi,
                                                       "min": rig.m(lo), "max": rig.m(hi)}
    return seg


def spec_json(arm, socks, seg, stats, actions):
    bones = []
    for name, h, t, parent in rig.bones():
        b = arm.data.bones[name]
        bones.append({
            "name": name, "parent": parent, "headVox": list(h), "tailVox": list(t),
            "head": rig.m(h), "tail": rig.m(t), "headGltf": rig.gltf(rig.m(h)), "tailGltf": rig.gltf(rig.m(t)),
            "restMatrix": [[round(c, 6) for c in row] for row in b.matrix_local],
        })
    sk = []
    for name, (bone, mw) in socks.items():
        loc = mw.to_translation()
        q = mw.to_quaternion()
        x, y, z = (mw.col[i].xyz for i in range(3))
        # glTF: C = (x, z, -y)
        C = Matrix(((1, 0, 0), (0, 0, 1), (0, -1, 0)))
        rg = C @ mw.to_3x3() @ C.transposed()
        qg = rg.to_quaternion()
        sk.append({
            "name": name, "bone": bone,
            "locationVox": [round(c / VOXEL, 3) for c in loc], "location": [round(c, 6) for c in loc],
            "quaternionWXYZ": [round(c, 6) for c in q],
            "axes": {"x": [round(c, 4) for c in x], "y": [round(c, 4) for c in y], "z": [round(c, 4) for c in z]},
            "outward": [round(-c, 4) for c in y],
            "matrixWorld": [[round(c, 6) for c in row] for row in mw],
            "gltf": {"location": rig.gltf(list(loc)), "quaternionXYZW": [round(qg.x, 6), round(qg.y, 6), round(qg.z, 6), round(qg.w, 6)]},
        })
    return {
        "schema": "sidereal.crew.body-spec/2",
        "spec_version": rig.SPEC_VERSION,
        "revision": rig.REVISION,
        "status": "proposal (not owner-approved); binding interface for character agents",
        "owner": "CHAR-BODY",
        "voxelSize": VOXEL,
        "units": "metres",
        "frame": {
            "blender": "Z up, character faces +Y, character RIGHT = +X (.R bones at +X), origin = feet centre on ground",
            "gltf": "Y up; gltf = (x, z, -y); character faces -Z in glTF, which is gameplay forward (no runtime flip).",
        },
        "proportions": {
            "headsTall": round(58 / 21, 2), "headPlusHairFraction": round(21 / 58, 3),
            "skullVox": {"min": [-9, -8, 37], "max": [9, 8, 55]}, "skullTop": 55 * VOXEL, "hairTopVox": 58,
            "hairTop": 58 * VOXEL, "helmetMaxTopVox": 60, "neckVox": [35, 38], "shoulderLineVox": 36,
            "shoulderJointVox": [9.5, 0, 34], "beltVox": [22, 24], "crotchVox": 18, "hipJointVox": [4, 0, 19],
            "kneeVox": 10, "ankleVox": 3, "elbowVox": 26, "wristVox": 20, "handVox": [13, 19],
            "torsoVox": {"chest": [-7, 7], "waist": {v: body.VARIANTS[v]["waist"] for v in body.VARIANTS}, "hips": [-7, 7],
                         "depth": [-5, 5]},
            "limbsVox": {"arm": "x 7..12 (5x5), cuff x 6..13", "hand": "x 6..13, y -3..4, z 13..19 (7x7x6 cube)",
                         "leg": "x 1..7 (6 wide, 7 deep), legs gap 2", "boot": "x 1..8, y -5..7, z 0..7"},
            "outerArmSpanVox": 24, "headWidthOverArmSpan": round(18 / 24, 2), "headWithHairOverArmSpan": round(20 / 24, 2),
            "mainBlockVox": 2, "note": "CHARACTER_SPEC v2 chibi (reference ~2.8 heads). Legs measured from the reference are ~6.3 vox; spec v2 said ~8, 6 keeps a 2-vox gap inside a 14-vox torso.",
        },
        "armature": {"name": "crew_rig", "boneOrder": rig.BONE_ORDER, "rigidSkinning": "every vertex weight 1.0 to one bone"},
        "bones": bones,
        "sockets": sk,
        "socketConvention": "local -Y = outward/forward direction of the socket; hand sockets: origin = grip centre, +X along the barrel, +Z toward the top of the weapon. Author parts in rest-pose world space and parent with keep-transform, or place them at socket-local coordinates using matrixWorld.",
        "segments": seg,
        "headSpace": {
            "originVox": [0, 0, 37], "note": "head bone rest head (neck/skull joint), voxels relative to it; axes = armature axes (x right, y forward, z up)",
            "skullVox": {"min": [-9, -8, 0], "max": [9, 8, 18]}, "jawVox": {"min": [-8, -7, 0], "max": [8, 7, 1]},
            "faceFrontYVox": 8, "eyesVox": {"L": {"min": [-6, 7, 4], "max": [-3, 8, 8]}, "R": {"min": [3, 7, 4], "max": [6, 8, 8]}},
            "eyeHighlight": "1 vox at the eye's upper-left corner, slot metal (pale) in the blank", "eyeLineVox": 6,
            "browsVox": 9, "mouthVox": {"min": [-1, 7, 2], "max": [1, 8, 3]},
            "blushVox": {"L": {"min": [-8, 7, 3], "max": [-6, 8, 4]}, "R": {"min": [6, 7, 3], "max": [8, 8, 4]}},
            "blushSlot": "skin with vertex colour multiplier (COLOR_0), no extra material",
            "earsVox": {"L": {"min": [-10, -1, 4], "max": [-9, 2, 8]}, "R": {"min": [9, -1, 4], "max": [10, 2, 8]}},
            "hairEnvelopeVox": {"min": [-10, -12, -3], "max": [10, 10, 21]}, "helmetEnvelopeVox": {"min": [-11, -10, -1], "max": [11, 11, 23]},
        },
        "hand": {"fistVox": {"min": [6, -3, 13], "max": [13, 4, 19]}, "thumbVox": {"min": [6, 4, 15], "max": [8, 5, 18]},
                 "gripThicknessVox": 2, "gripAxis": "vertical through the fist centre (socket.hand.R at (9.5, 0.5, 16))",
                 "note": ".R values; .L mirrors x (x -> -1 - x for cell ranges)."},
        "itemFrame": {
            "charWeapons": "item-local (Blender): origin = primary grip centre, +Y barrel/forward, +Z up, +X right",
            "toHandSocket": "item-local -> socket.hand.R local = rotation of -90 deg about socket Z (item +Y -> socket +X)",
            "runtime": "voxel-crew exposes itemSockets.R/L: children of socket.hand.* carrying this adapter; parent item roots there",
        },
        "segmentGroups": rig.SEGMENTS,
        "bodyMeshRegions": {"body": "GEO-crew-body-<variant>", "head": "GEO-crew-head-<variant>",
                            "hands": "GEO-crew-hands-<variant>", "feet": "GEO-crew-feet-<variant>",
                            "hair": "GEO-crew-hair-default-<variant>",
                            "note": "armour/heads declare hidesBodyRegions from {head, hands, feet, hair}; the core body mesh is never hidden, so shells stay >= 1 vox proud"},
        "equipmentSlots": rig.EQUIPMENT_SLOTS,
        "materialSlots": SLOTS,
        "defaultTheme": {k: [round(c, 4) for c in v] for k, v in voxkit.DEFAULT_THEME.items()},
        "materialConvention": "one Principled material per slot named <prefix>.<slot>; baseColorFactor = slot colour; COLOR_0 multiplies it (per-brick-island tone 0.975..1, blush, later baked AO). No tiling texture / normal map: surfaces are big smooth faces with softly rounded brick edges (2-segment bevel ~0.35 vox + face-area weighted normals). Build parts with voxkit.Part (brick islands) + voxkit.mesh_part + voxkit.soften.",
        "styleRules": ["silhouette steps in 2-voxel main blocks; single voxels only for detail (eyes, pins, seams, lights)",
                       "no per-fine-voxel outlines, grooves or cell colour noise (owner 2026-09-25: you should not see each block)",
                       "the voxel read comes only from stepped silhouettes and chunky detail pieces; clothing layers overlap softly",
                       "hair = clumped stepped shells, each clump its own island; no stud grid",
                       "saturated palette: lavender suit #a78db6 / #6c5989, peach skin #f3a98d with blush"],
        "variants": list(body.VARIANTS),
        "stats": stats,
        "animations": actions,
        "animationsPlanned": rig.ACTIONS,
        "gripProfiles": anims.GRIP_PROFILES,
        "animationConvention": "Blender actions on crew_rig, 24 fps, names exact; weapon actions assume the item follows socket.hand.R and the support hand sits on the item's support grip (hand.L).",
        "reuse": "scripts/art_library/crew_voxel/{voxkit,rig,body}.py on the CHAR-BODY branch: voxkit.Vol + mesh_volume + slot_materials build parts on the same grid/material contract.",
    }


def main():
    args = parse_args()
    out = args.out.rstrip("/")
    os.makedirs(out, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.fps = 24
    coll = sc.collection
    mats = voxkit.slot_materials(voxkit.DEFAULT_THEME)
    arm = build_armature(coll)
    bodies, stats = build_bodies(arm, mats, coll)
    socks = build_sockets(arm, coll)
    actions = []
    if not args.no_anim:

        actions = anims.build_actions(arm, sc, only=set(a for a in args.only.split(",") if a) or None)
    seg = segment_bounds(bodies)
    spec = spec_json(arm, socks, seg, stats, actions)
    with open(f"{out}/body-spec.json", "w") as f:
        json.dump(spec, f, indent=1)
    if args.spec:
        with open(args.spec, "w") as f:
            json.dump(spec, f, indent=1)
    if not args.no_export:
        bpy.ops.wm.save_as_mainfile(filepath=f"{out}/crew-body.blend")
        import export
        manifest = export.export_all(out, arm, bodies, socks, actions, stats)
        manifest["gripProfiles"] = spec.get("gripProfiles")
        with open(f"{out}/manifest.json", "w") as f:
            json.dump(manifest, f, indent=1)
    if not args.no_render:
        import render
        shots = set(s for s in args.shots.split(",") if s) or {"turnaround", "anim"}
        if "turnaround" in shots:
            render.turnaround(out, arm, bodies, args)
        if "anim" in shots and actions:
            render.contact_sheets(out, arm, bodies, actions, mats, args)
    print("CREW_BODY_DONE", json.dumps(stats))


if __name__ == "__main__":
    main()
