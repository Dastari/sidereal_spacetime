"""GLB export for the voxel crew body."""
import hashlib
import os

import bpy

import rig
import voxkit


def _sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        h.update(f.read())
    return h.hexdigest()


def _export(path, objs, animations):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.hide_set(False)
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    kw = dict(filepath=path, export_format="GLB", use_selection=True, export_yup=True, export_apply=False,
              export_skins=True, export_extras=True, export_materials="EXPORT", export_image_format="AUTO",
              export_texcoords=True, export_normals=True, export_tangents=False, export_def_bones=False,
              export_rest_position_armature=True, export_animations=animations)
    if animations:
        kw.update(export_animation_mode="ACTIONS", export_force_sampling=True, export_frame_step=1,
                  export_optimize_animation_size=True, export_anim_single_armature=True, export_reset_pose_bones=True,
                  export_anim_slide_to_zero=True, export_negative_frame="SLIDE")
    bpy.ops.export_scene.gltf(**kw)


def export_all(out, arm, bodies, socks, actions, stats):
    sock_objs = [bpy.data.objects[n] for n in socks]
    files = {}
    all_objs = [arm] + sock_objs
    for variant, b in bodies.items():
        objs = list(b["meshes"].values()) + [b["hair"]]
        path = f"{out}/crew-body-{variant}.glb"
        _export(path, [arm] + objs + sock_objs, bool(actions))
        files[os.path.basename(path)] = {"sha256": _sha(path), "bytes": os.path.getsize(path), "variant": variant}
        all_objs += objs
    path = f"{out}/crew-body.glb"
    _export(path, all_objs, bool(actions))
    files["crew-body.glb"] = {"sha256": _sha(path), "bytes": os.path.getsize(path), "variant": "all"}
    parts = []
    for variant, b in bodies.items():
        p, hair, hob = b["parts"], b["hairVol"], b["hair"]
        lo = [min(v.bounds()[0][i] for v in p.values()) for i in range(3)]
        hi = [max(v.bounds()[1][i] for v in p.values()) for i in range(3)]
        parts.append({"id": f"body.{variant}", "meshes": {r: o.name for r, o in b["meshes"].items()},
                      "tris": stats[variant]["tris"], "trisByRegion": stats[variant]["trisByRegion"],
                      "slots": sorted({s for v in p.values() for s in v.slots()}, key=voxkit.SI.get),
                      "boundsVox": [lo, hi], "bounds": [rig.m(lo), rig.m(hi)]})
        hlo, hhi = hair.bounds()
        parts.append({"id": f"hair.default.{variant}", "mesh": hob.name, "tris": stats[variant]["hairTris"], "bone": "head",
                      "slots": hair.slots(), "boundsVox": [hlo, hhi], "bounds": [rig.m(hlo), rig.m(hhi)]})
    return {
        "schema": "sidereal.crew.body-manifest/1",
        "revision": rig.REVISION,
        "family": "crew.body.voxel",
        "status": "proposal; not published; not owner-approved",
        "rig": "crew_rig",
        "sockets": sorted(socks),
        "materialSlots": voxkit.SLOTS,
        "parts": parts,
        "actions": actions,
        "files": files,
        "textures": {"voxel_tint.png": _sha(f"{out}/voxel_tint.png"), "voxel_normal.png": _sha(f"{out}/voxel_normal.png")},
    }
