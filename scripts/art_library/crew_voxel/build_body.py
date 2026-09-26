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
    p.add_argument("--loops", default="", help="comma list of loop clips (loops.LOOPS names)")
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


LAYER_ORDER = ("base", "hands", "head", "suit", "gear")
# presentation default = the crew look (suit + gear): base skin body and bare hands are hidden
DEFAULT_HIDDEN = {"base", "hands"}


def region_of(bone):
    return {"head": "head", "hand.L": "hands", "hand.R": "hands"}.get(bone, "base")


def build_bodies(arm, mats, coll):
    bodies, stats = {}, {}
    for variant in body.VARIANTS:
        layers, hair = body.build(variant)
        meshes = {}
        for region in LAYER_ORDER:
            objs = [part_object(f"{variant}.{region}.{bone}", part, bone, coll, mats)
                    for bone, part in layers[region].items() if part.islands]
            ob = join(objs, f"GEO-crew-{region}-{variant}")
            voxkit.assign_materials(ob, mats)
            if region == "head":
                voxkit.face_uv(ob.data, body.SKULL)
            skin(ob, arm)
            ob["crew_part"] = f"{region}.{variant}"
            if region in DEFAULT_HIDDEN:
                ob["defaultHidden"] = True
                ob.hide_render = True
            meshes[region] = ob
        hob = part_object(f"GEO-crew-hair-default-{variant}", hair, "head", coll, mats)
        voxkit.assign_materials(hob, mats)
        skin(hob, arm)
        hob["crew_part"] = f"hair.default.{variant}"
        parts = dict(layers["base"])
        parts.update(layers["hands"])
        parts.update(layers["head"])
        bodies[variant] = {"meshes": meshes, "hair": hob, "parts": parts, "hairVol": hair, "layers": layers}
        stats[variant] = {"trisByRegion": {r: voxkit.tri_count(o.data) for r, o in meshes.items()},
                          "hairTris": voxkit.tri_count(hob.data),
                          "trisDefaultLook": sum(voxkit.tri_count(o.data) for r, o in meshes.items() if r not in DEFAULT_HIDDEN)
                          + voxkit.tri_count(hob.data),
                          "islands": {r: sum(len(p.islands) for p in layers[r].values()) for r in LAYER_ORDER},
                          "hairIslands": len(hair.islands)}
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
        for layer in ("suit", "gear"):
            for bone, part in b["layers"][layer].items():
                if part.islands:
                    glo, ghi = part.bounds()
                    seg.setdefault(layer, {}).setdefault(bone, {})[variant] = {"minVox": glo, "maxVox": ghi}
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
    hair_top = max(v["maxVox"][2] for v in seg["hair.default"].values())
    measured = {v: {"hairTopVox": h["maxVox"][2], "headPlusHairFraction": round((h["maxVox"][2] - 39) / h["maxVox"][2], 3),
                    "hairWidthVox": h["maxVox"][0] - h["minVox"][0]} for v, h in seg["hair.default"].items()}
    return {
        "schema": "sidereal.crew.body-spec/2",
        "measured": {"note": "from the exported default hair + skull (chin z 39)", "hairTopMaxVox": hair_top,
                     "byVariant": measured},
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
            "headsTall": round(58 / 19, 2), "headPlusHairFraction": round(19 / 58, 3),
            "skullVox": {"min": [-8, -7, 39], "max": [8, 7, 55]}, "skullMetres": [0.5, 0.4375, 0.5],
            "skullTop": 55 * VOXEL, "hairTopVox": 58, "hairTop": 58 * VOXEL, "helmetMaxTopVox": 60,
            "neckVox": [37, 39], "shoulderLineVox": 37, "shoulderJointVox": [9.5, 0, 35], "beltVox": [23, 25],
            "crotchVox": 19, "hipJointVox": [4, 0, 20], "kneeVox": 11, "ankleVox": 3, "elbowVox": 27,
            "wristVox": 21, "handVox": [15, 21],
            "torsoVox": {"chest": [-7, 7], "waist": {v: body.VARIANTS[v]["waist"] for v in body.VARIANTS}, "hips": [-7, 7],
                         "depth": [-5, 5]},
            "limbsVox": {"arm": "x 7..12 (5x5)", "hand": "x 7..13, y -3..3, z 15..21 (6x6x6) + thumb", "leg": "x 1..7 (6 wide, 7 deep), gap 2",
                         "suitBoot": "x 1..8, y -5..7, z 0..7", "bareFoot": "x 1..7, y -4..6, z 0..3"},
            "outerArmSpanVox": 24, "headWidthOverArmSpan": round(16 / 24, 2), "headWidthOverTorsoWidth": round(16 / 14, 2),
            "mainBlockVox": 2,
            "note": "OWNER round 2: head ~10 % smaller than r002 (skull 16 wide x 14 deep x 16 tall = 0.50 x 0.44 x 0.50 m); total height unchanged (1.81 m to hair top).",
        },
        "armature": {"name": "crew_rig", "boneOrder": rig.BONE_ORDER, "rigidSkinning": "every vertex weight 1.0 to one bone"},
        "bones": bones,
        "sockets": sk,
        "socketConvention": "local -Y = outward/forward direction of the socket; hand sockets: origin = grip centre, +X along the barrel, +Z toward the top of the weapon. Author parts in rest-pose world space and parent with keep-transform, or place them at socket-local coordinates using matrixWorld.",
        "segments": seg,
        "headSpace": {
            "originVox": [0, 0, 39], "note": "head bone rest head (neck/skull joint), voxels relative to it; axes = armature axes (x right, y forward, z up)",
            "skullVox": {"min": [-8, -7, 0], "max": [8, 7, 16]}, "crownStep": "z 15..16 inset 1", "jawStep": "z 0..1 inset 1",
            "verticalEdgeChamfer": 1, "faceFrontYVox": 7,
            "faceCanvas": {"spec": "_shared/FACE_ATLAS_SPEC.md", "px": 16, "pxPerVoxel": 1, "xVox": [-8, 8], "zVox": [0, 16],
                           "uv": "u = (8 - x) / 16 (column 0 = character's right), v = z / 16 (Blender; glTF v = 1 - z/16)",
                           "visiblePixels": "columns 1..14, rows 1..14 (outer ring is chamfer / crown / jaw, skin)",
                           "material": "crew.face (11th slot), nearest sampling; texture = composed atlas state"},
            "earsVox": {"L": {"min": [-9, -1, 4], "max": [-8, 2, 8]}, "R": {"min": [8, -1, 4], "max": [9, 2, 8]}},
            "noNose": True,
            "hairEnvelopeVox": {"min": [-10, -13, -5], "max": [10, 10, 19]}, "helmetEnvelopeVox": {"min": [-10, -9, -1], "max": [10, 9, 21]},
        },
        "hand": {"fistVox": {"min": [7, -3, 15], "max": [13, 3, 21]}, "thumbVox": {"min": [7, 3, 16], "max": [9, 4, 19]},
                 "gripThicknessVox": 2, "gripAxis": "vertical through the fist centre (socket.hand.R at (9.5, 0.5, 18))",
                 "note": ".R values; .L mirrors x (x -> -1 - x for cell ranges)."},
        "itemFrame": {
            "charWeapons": "item-local (Blender): origin = primary grip centre, +Y barrel/forward, +Z up, +X right",
            "toHandSocket": "item-local -> socket.hand.R local = rotation of -90 deg about socket Z (item +Y -> socket +X)",
            "runtime": "voxel-crew exposes itemSockets.R/L: children of socket.hand.* carrying this adapter; parent item roots there",
        },
        "segmentGroups": rig.SEGMENTS,
        "bodyMeshRegions": {
            "base": "GEO-crew-base-<variant>: skin body + privacy shorts (+ sports bra, feminine); underwear always on the base mesh",
            "hands": "GEO-crew-hands-<variant>: bare hands",
            "head": "GEO-crew-head-<variant>: skull + ears; front plane = crew.face",
            "suit": "GEO-crew-suit-<variant>: default jumpsuit + boots (wardrobe layer, same volume as base; hides base)",
            "gear": "GEO-crew-gear-<variant>: default crew harness, pads, gloves (hide hands), pouches",
            "hair": "GEO-crew-hair-default-<variant>",
            "defaultLook": "suit + gear + head + hair (base and hands hidden)",
            "rules": "an outfit layer hides the regions it replaces: suit/uniforms hide base; gloves hide hands; boots hide base feet (in base); helmets may hide hair; armour replaces gear. Shells must be >= 1 vox proud of whatever stays visible underneath; the base underwear is never hidden unless a suit/uniform replaces the whole base.",
        },
        "equipmentSlots": rig.EQUIPMENT_SLOTS,
        "materialSlots": SLOTS,
        "defaultTheme": {k: [round(c, 4) for c in v] for k, v in voxkit.DEFAULT_THEME.items()},
        "materialConvention": "one Principled material per slot named <prefix>.<slot>; baseColorFactor = slot colour; COLOR_0 multiplies it (per-brick-island tone 0.975..1, blush, later baked AO). No tiling texture / normal map: surfaces are big smooth faces with softly rounded brick edges (2-segment bevel ~0.35 vox + face-area weighted normals). Build parts with voxkit.Part (brick islands) + voxkit.mesh_part + voxkit.soften.",
        "styleRules": ["silhouette steps in 2-voxel main blocks; single voxels only for detail (eyes, pins, seams, lights)",
                       "no per-fine-voxel outlines, grooves or cell colour noise (owner 2026-09-25: you should not see each block)",
                       "the voxel read comes only from stepped silhouettes and chunky detail pieces; clothing layers overlap softly",
                       "hair = clumped stepped shells, each clump its own island; no stud grid",
                       "saturated palette: lavender suit #a78db6 / #6c5989, peach skin #f3a98d with blush"],
        "variants": {k: v["label"] for k, v in body.VARIANTS.items()},
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
    import face_atlas
    face_atlas.main(f"{out}/face")
    face_img = bpy.data.images.load(f"{out}/face/face-neutral.png")
    face_img.name = "crew_face"
    face_img.pack()
    mats = voxkit.slot_materials(voxkit.DEFAULT_THEME, face_img=face_img)
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
        if "poses" in shots and actions:
            render.pose_sheet(out, arm, bodies, mats, args)
        if "wardrobe" in shots:
            render.wardrobe_sheet(out, arm, bodies, args)
        if "loops" in shots and actions:
            import loops
            loops.loops(out, arm, bodies, mats, actions, args,
                        only=set(x for x in args.loops.split(",") if x) or None)
    print("CREW_BODY_DONE", json.dumps(stats))


if __name__ == "__main__":
    main()
