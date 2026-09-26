"""Build the crew handheld item + FX kit r001 (Blender headless).

  blender -b --factory-startup --python-exit-code 1 -P scripts/art_library/crew_items/build.py -- \
      [--out assets/runtime/crew/items/r001] [--content packages/content/src/crew-items-r001.json] \
      [--source assets/source/crew-items-r001.blend] [--renders DIR] [--sheets a,b] [--samples 32] [--no-export]

Outputs (runtime, proposal art - not owner approved, not published):
  <out>/<item>.glb        LOD0: bevelled brick islands, part nodes + glTF animations, socket nodes
  <out>/<item>.lod1.glb   LOD1: same boxes without bevel (crowd distance)
  <out>/fx/<fx>.glb       FX presentation meshes (emissive / blended layers)
  <out>/manifest.json     ids, files, SHA-256, triangle counts, bounds, materials, animations
  <content>               gameplay-facing item/FX/theme data consumed by packages/content
"""
import argparse
import hashlib
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))

import bpy  # noqa: E402

from crew_items import blend, body_frames, fx as FX, items as ITEMS, themes as TH  # noqa: E402
from crew_items.glb import stats  # noqa: E402
from crew_items.voxel import ITEM_SLOTS, blender_to_gltf  # noqa: E402

REVISION = "r001"
ANIM_FPS = 24
CROPS = "scripts/art_library/crew_items_reference_crops.json"


def args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--out", default=os.path.join(ROOT, "assets/runtime/crew/items", REVISION))
    p.add_argument("--content", default=os.path.join(ROOT, "packages/content/src/crew-items-r001.json"))
    p.add_argument("--source", default=os.path.join(ROOT, "assets/source/crew-items-r001.blend"))
    p.add_argument("--renders", default="")
    p.add_argument("--sheets", default="all")
    p.add_argument("--samples", type=int, default=32)
    p.add_argument("--no-export", action="store_true")
    p.add_argument("--holds", default=os.path.join(ROOT, "packages/content/src/crew-items-r001-holds.json"))
    p.add_argument("--armed", action="store_true", help="bake + render the armed animation layer")
    p.add_argument("--armed-clips", default="")
    p.add_argument("--no-armed-render", action="store_true")
    p.add_argument("--body", default="/root/sidereal-progress/_shared/crew-body-r004/crew-body.blend")
    return p.parse_args(argv)


def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        h.update(f.read())
    return h.hexdigest()


def r6(v):
    return [round(float(c), 6) + 0.0 for c in v]


def gl(v):
    return r6(blender_to_gltf(v))


def clean_scene():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for coll in list(bpy.data.collections):
        bpy.data.collections.remove(coll)


# ------------------------------------------------------------------------------ data
def clearance(item):
    """Conservative presentation clearance boxes (glTF frame metres) for the pose solver."""
    cells = []
    for _, grid, _ in item.grids():
        cells.extend(grid.cells)
    o = item.origin()
    ys = [c[1] for c in cells]
    length = max(ys) + 1 - min(ys)
    regions = {"stock": [], "receiver": [], "barrel": []} if item.meta["pose_profile"] in ("RIFLE", "LONG_RIFLE") else {"device-body": []}
    for c in cells:
        if "stock" in regions:
            key = "stock" if c[1] + 0.5 < o[1] - 2 else ("barrel" if c[1] + 0.5 > o[1] + length * 0.45 else "receiver")
        else:
            key = "device-body"
        regions[key].append(c)
    out = []
    for name, cs in regions.items():
        if not cs:
            continue
        lo = [min(c[i] for c in cs) for i in range(3)]
        hi = [max(c[i] for c in cs) + 1 for i in range(3)]
        centre = item.to_metres([(a + b) / 2 for a, b in zip(lo, hi)])
        half = [(b - a) / 2 * item.voxel for a, b in zip(lo, hi)]
        out.append({"name": name, "center": gl(centre), "half": r6((half[0], half[2], half[1]))})
    return out


def item_record(item):
    b = item.bounds()
    lo, hi = item.to_metres(b[:3]), item.to_metres(b[3:])
    anims = {}
    for part in item.parts.values():
        for name, keys in part.tracks.items():
            anims[name] = max(anims.get(name, 0), max(k[0] for k in keys))
    sockets = {}
    for name, s in item.sockets.items():
        p = item.to_metres(s["position"])
        sockets[name] = {"position": r6(p), "direction": r6(s["direction"]), "up": r6(s["up"]),
                         "gltfPosition": gl(p), "gltfDirection": gl(s["direction"]), "gltfUp": gl(s["up"])}
    holster = ITEMS.HOLSTERS[item.meta["holster"]]
    m = item.meta
    return {
        "id": item.id, "name": item.name, "label": m["label"], "subLabel": m["sub"],
        "category": item.category, "animationSet": item.animation_set, "poseProfile": m["pose_profile"],
        "twoHanded": m["two_handed"], "supportMode": m["support_mode"],
        "holster": {"preset": m["holster"], **body_frames.holster_local(holster)} if holster else None,
        "fx": m["fx"], "references": m["refs"], "replacesLegacyAsset": m["replaces"],
        "defaultTheme": item.theme,
        "slotOverrides": {k: {"color": list(v[0]), "emissiveStrength": v[1]} if isinstance(v[0], (tuple, list)) else {"color": list(v)}
                          for k, v in item.overrides.items()},
        "slots": item.slots(),
        "voxelSize": item.voxel,
        "sizeVoxels": [b[3] - b[0], b[4] - b[1], b[5] - b[2]],
        "boundsMin": gl((lo[0], hi[1], lo[2])), "boundsMax": gl((hi[0], lo[1], hi[2])),
        "sockets": sockets,
        "parts": sorted(item.parts),
        "itemAnimations": [{"name": n, "frames": f, "durationS": round(f / ANIM_FPS, 4)} for n, f in sorted(anims.items())],
        "clearance": clearance(item),
        "files": {"lod0": f"{item.id}.glb", "lod1": f"{item.id}.lod1.glb", "icon": f"icons/{item.id}.png"},
        "notes": m["notes"],
    }


def fx_record(f):
    b = f.bounds()
    return {
        "id": f.id, "label": f.label, "subLabel": f.sub, "category": f.category, "kind": f.kind, "anchor": f.anchor,
        "voxelSize": f.voxel, "durationS": f.duration, "loop": f.loop, "tint": f.tint, "blend": f.blend,
        "keys": f.keys, "speedMps": f.speed, "lengthM": f.length, "light": f.light, "references": f.refs,
        "layers": [{"name": n, **{k: v for k, v in spec.items()}} for n, (_, spec) in f.layers.items()],
        "sizeM": r6([(b[3] - b[0]) * f.voxel, (b[5] - b[2]) * f.voxel, (b[4] - b[1]) * f.voxel]),
        "file": f"fx/{f.id}.glb",
    }


# ------------------------------------------------------------------------------ export
def select_tree(root):
    bpy.ops.object.select_all(action="DESELECT")
    stack = [root]
    while stack:
        ob = stack.pop()
        ob.select_set(True)
        stack.extend(ob.children)
    bpy.context.view_layer.objects.active = root


def export_glb(root, path, animations=True):
    select_tree(root)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True,
                              export_yup=True, export_extras=True, export_animations=animations,
                              export_animation_mode="NLA_TRACKS", export_cameras=False, export_lights=False,
                              export_materials="EXPORT", export_vertex_color="MATERIAL")


def export_all(o, items, fxs):
    os.makedirs(os.path.join(o.out, "fx"), exist_ok=True)
    sc = bpy.context.scene
    sc.render.fps = ANIM_FPS
    coll = bpy.data.collections.new("EXPORT")
    sc.collection.children.link(coll)
    manifest = {"schema": "sidereal.crew.items/1", "revision": REVISION, "status": "proposal (not owner-approved, unpublished)",
                "generator": "scripts/art_library/crew_items/build.py", "items": [], "fx": []}
    for item in items:
        root, objs = blend.assemble_export(item, coll, bevel=True)
        entry = {"id": item.id, "files": {}}
        for lod, bevel in (("lod0", True), ("lod1", False)):
            for ob in objs.values():
                for md in ob.modifiers:
                    md.show_viewport = md.show_render = bevel
            path = os.path.join(o.out, f"{item.id}.glb" if lod == "lod0" else f"{item.id}.lod1.glb")
            export_glb(root, path)
            st = stats(path)
            entry["files"][lod] = {"file": os.path.basename(path), "sha256": sha(path), "bytes": os.path.getsize(path), **st}
        manifest["items"].append(entry)
        # Object names are global in a .blend: prefix this item's nodes now so the next item's
        # socket/part nodes export with their exact glTF names (socket.grip, part.mag, ...).
        stack = list(root.children)
        while stack:
            ob = stack.pop()
            stack.extend(ob.children)
            ob.name = f"{item.id}:{ob.name}"
        print(f"[items] {item.id}: lod0 {entry['files']['lod0']['triangles']} tris, lod1 {entry['files']['lod1']['triangles']} tris,"
              f" anims {entry['files']['lod0']['animations']}")
    for f in fxs:
        root = bpy.data.objects.new(f"fx.{f.id}", None)
        coll.objects.link(root)
        root["sidereal_fx"] = f.id
        for layer, (grid, spec) in f.layers.items():
            me = blend.boxes_mesh(f"fx.{f.id}.{layer}", grid.boxes(merge=True), (0, 0, 0), f.voxel, ["emit_a"])
            me.materials.append(blend.fx_material(f, layer, spec))
            ob = bpy.data.objects.new(f"layer.{layer}", me)
            coll.objects.link(ob)
            ob.parent = root
        path = os.path.join(o.out, "fx", f"{f.id}.glb")
        export_glb(root, path, animations=False)
        for ob in list(root.children):
            ob.name = f"{f.id}:{ob.name}"
        st = stats(path)
        manifest["fx"].append({"id": f.id, "file": f"fx/{f.id}.glb", "sha256": sha(path), "bytes": os.path.getsize(path), **st})
        print(f"[fx] {f.id}: {st['triangles']} tris")
    manifest["totals"] = {
        "items": len(items), "fx": len(fxs),
        "lod0Triangles": sum(e["files"]["lod0"]["triangles"] for e in manifest["items"]),
        "lod1Triangles": sum(e["files"]["lod1"]["triangles"] for e in manifest["items"]),
        "fxTriangles": sum(e["triangles"] for e in manifest["fx"]),
        "bytes": sum(e["files"][k]["bytes"] for e in manifest["items"] for k in ("lod0", "lod1")) + sum(e["bytes"] for e in manifest["fx"]),
    }
    return manifest


def content_json(items, fxs):
    return {
        "schema": "sidereal.crew.items/1", "revision": REVISION,
        "status": "proposal (not owner-approved); presentation data only - confers no inventory, combat or equip rights",
        "assetBase": f"/assets/crew/items/{REVISION}/",
        "voxelSize": 1 / 32, "animationFps": ANIM_FPS,
        "bodySpec": {"schema": "sidereal.crew.body-spec/1", "revision": body_frames.BODY_SPEC_REVISION},
        "itemFrame": "Blender +X right, +Y forward, +Z up; glTF +X right, +Y up, -Z forward. Origin = primary grip centre.",
        "socketConvention": "item socket nodes: local -Y = outward/forward, +Z = item up (project socket convention).",
        "handSocketRotationWXYZ": r6(body_frames.ITEM_TO_HAND_SOCKET_WXYZ),
        "slots": ITEM_SLOTS, "variants": TH.VARIANT_ORDER, "themes": TH.theme_json(),
        "characterSlotLink": TH.CHARACTER_SLOT_LINK,
        "items": [item_record(i) for i in items],
        "fx": [fx_record(f) for f in fxs],
    }


def main():
    o = args()
    clean_scene()
    # Refit to the published body spec BEFORE building items: support grips follow its grip profiles.
    spec_path = "/root/sidereal-progress/_shared/CHARACTER_SPEC_BODY.json"
    if os.path.exists(spec_path):
        spec = json.load(open(spec_path))
        for issue in body_frames.validate_against(spec):
            print("[body] refit from published spec:", issue)
        body_frames.load_spec(spec)
        print(f"[body] using CHARACTER_SPEC_BODY.json revision {body_frames.BODY_SPEC_REVISION}")
    items = ITEMS.build_all()
    fxs = FX.build_all()
    data = content_json(items, fxs)
    if not o.no_export:
        manifest = export_all(o, items, fxs)
        manifest["content"] = os.path.relpath(o.content, ROOT)
        manifest["referenceCrops"] = CROPS
        with open(o.content, "w") as fh:
            json.dump(data, fh, indent=1)
            fh.write("\n")
        manifest["contentSha256"] = sha(o.content)
        with open(os.path.join(o.out, "manifest.json"), "w") as fh:
            json.dump(manifest, fh, indent=1)
            fh.write("\n")
        os.makedirs(os.path.dirname(o.source), exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=o.source, compress=True)
        print(f"[source] {o.source}")
    if o.renders:
        from crew_items import render
        render.run(o, items, fxs, data)
    if o.armed:
        from crew_items import armed_render
        armed_render.run(o, items, {i.id: i for i in items})


if __name__ == "__main__":
    main()
