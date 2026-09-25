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
    p.add_argument("--shots", default="")
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


def part_object(name, vol, bone, coll, mats):
    me = voxkit.mesh_volume(vol, name, mats=mats)
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    vg = ob.vertex_groups.new(name=bone)
    vg.add(list(range(len(me.vertices))), 1.0, "REPLACE")
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


def build_bodies(arm, mats, coll):
    bodies, stats = {}, {}
    for variant in body.VARIANTS:
        parts, hair = body.build(variant)
        objs = [part_object(f"{variant}.{bone}", vol, bone, coll, mats) for bone, vol in parts.items()]
        ob = join(objs, f"GEO-crew-body-{variant}")
        voxkit.assign_materials(ob, mats)
        skin(ob, arm)
        ob["crew_part"] = f"body.{variant}"
        hob = part_object(f"GEO-crew-hair-default-{variant}", hair, "head", coll, mats)
        voxkit.assign_materials(hob, mats)
        skin(hob, arm)
        hob["crew_part"] = f"hair.default.{variant}"
        bodies[variant] = (ob, hob, parts, hair)
        stats[variant] = {"tris": voxkit.tri_count(ob.data), "hairTris": voxkit.tri_count(hob.data),
                          "voxels": sum(len(v.c) for v in parts.values()), "hairVoxels": len(hair.c)}
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
    for variant, (ob, hob, parts, hair) in bodies.items():
        for bone, vol in parts.items():
            lo, hi = vol.bounds()
            seg.setdefault(bone, {})[variant] = {"minVox": lo, "maxVox": hi,
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
        "schema": "sidereal.crew.body-spec/1",
        "revision": rig.REVISION,
        "status": "proposal (not owner-approved); binding interface for character agents",
        "owner": "CHAR-BODY",
        "voxelSize": VOXEL,
        "units": "metres",
        "frame": {
            "blender": "Z up, character faces +Y, character RIGHT = +X (.R bones at +X), origin = feet centre on ground",
            "gltf": "Y up; gltf = (x, z, -y); character faces -Z in glTF. Babylon runtime rotates the visual by PI so it faces the gameplay heading.",
        },
        "proportions": {
            "headTopVox": 58, "headTop": 58 * VOXEL, "hairMaxVox": 61, "headHeightVox": 14, "headWidthVox": 14,
            "headDepthVox": 12, "neckVox": [42, 44], "shoulderLineVox": 42, "crotchVox": 23, "hipJointVox": 25,
            "kneeVox": 13, "ankleVox": 3, "beltVox": [27, 29], "elbowVox": 32, "wristVox": 24, "fingertipVox": 20,
            "torsoHalfWidthVox": {v: body.VARIANTS[v]["chest"] for v in body.VARIANTS},
            "armCentreXVox": 10, "legCentreXVox": 4, "limbWidthVox": {"upperArm": 4, "forearm": 4, "thigh": 6, "shin": 6},
            "headsTall": round(58 / 14, 2),
        },
        "armature": {"name": "crew_rig", "boneOrder": rig.BONE_ORDER, "rigidSkinning": "every vertex weight 1.0 to one bone"},
        "bones": bones,
        "sockets": sk,
        "socketConvention": "local -Y = outward/forward direction of the socket; hand sockets: origin = grip centre, +X along the barrel, +Z toward the top of the weapon. Author parts in rest-pose world space and parent with keep-transform, or place them at socket-local coordinates using matrixWorld.",
        "segments": seg,
        "segmentGroups": rig.SEGMENTS,
        "equipmentSlots": rig.EQUIPMENT_SLOTS,
        "materialSlots": SLOTS,
        "defaultTheme": {k: [round(c, 4) for c in v] for k, v in voxkit.DEFAULT_THEME.items()},
        "materialConvention": "one Principled material per slot named <prefix>.<slot>; baseColorFactor = slot colour; baseColorTexture = shared voxel_tint.png (UV 1 unit = 1 m = 32 cells, box-projected in rest-pose metres); normalTexture = shared voxel_normal.png. Parts built with voxkit.mesh_volume get this for free.",
        "variants": list(body.VARIANTS),
        "stats": stats,
        "animations": actions,
        "animationsPlanned": rig.ACTIONS,
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
    tint, nrm = voxkit.voxel_textures(f"{out}/voxel_tint.png", f"{out}/voxel_normal.png")
    mats = voxkit.slot_materials(voxkit.DEFAULT_THEME, tint, nrm)
    arm = build_armature(coll)
    bodies, stats = build_bodies(arm, mats, coll)
    socks = build_sockets(arm, coll)
    actions = []
    if not args.no_anim:
        import anims
        actions = anims.build_actions(arm, sc)
    seg = segment_bounds(bodies)
    spec = spec_json(arm, socks, seg, stats, actions)
    with open(f"{out}/body-spec.json", "w") as f:
        json.dump(spec, f, indent=1)
    if args.spec:
        with open(args.spec, "w") as f:
            json.dump(spec, f, indent=1)
    bpy.ops.wm.save_as_mainfile(filepath=f"{out}/crew-body.blend")
    import export
    manifest = export.export_all(out, arm, bodies, socks, actions, stats)
    with open(f"{out}/manifest.json", "w") as f:
        json.dump(manifest, f, indent=1)
    if not args.no_render:
        import render
        render.turnaround(out, arm, bodies, args)
    print("CREW_BODY_DONE", json.dumps(stats))


if __name__ == "__main__":
    main()
