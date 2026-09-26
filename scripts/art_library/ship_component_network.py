"""Network-port diagram render for a fitted reference ship (presentation only).

Reads the auto-wired diagram JSON written by
  npx tsx scripts/ship-components-export.ts --diagram /tmp/net.json [--fit balance.md-corvette]
places every component with its ship-frame basis (mount re-rotation + yaw),
and draws each logical connection as an orthogonal run in a utility layer
under the deck, colour-coded by channel (power red, data blue, coolant white,
fuel amber, air yellow), with risers to the actual port positions.

  blender -b --factory-startup --python-exit-code 1 -P scripts/art_library/ship_component_network.py -- \
      --data /tmp/net.json --out /tmp/network.png [--channels power,data,coolant] [--samples 32]
"""
import argparse
import json
import math
import os
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import ship_component_export as X  # noqa: E402  (loads the kit)
import ship_component_sheets as S  # noqa: E402

K = X.K
CH_ORDER = ["power", "data", "coolant", "fuel", "ventilation"]
CH_OFFSET = {c: 0.18 * i for i, c in enumerate(CH_ORDER)}
CH_LABEL = {"power": "POWER kW", "data": "DATA kbit/s", "coolant": "COOLANT L/s", "fuel": "FUEL L/s", "ventilation": "AIR m³/s"}


def args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--data", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--channels", default="power,data,coolant,fuel")
    p.add_argument("--samples", type=int, default=32)
    p.add_argument("--top", action="store_true")
    return p.parse_args(argv)


def bar(a, b, r, mat, coll):
    """Square-section tube between two points."""
    a, b = Vector(a), Vector(b)
    d = b - a
    if d.length < 1e-6:
        return None
    me = bpy.data.meshes.new("run")
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    ob = bpy.data.objects.new("run", me)
    coll.objects.link(ob)
    ob.location = (a + b) / 2
    ob.rotation_mode = "QUATERNION"
    ob.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    ob.scale = (r, r, d.length + r)
    return ob


def node(p, s, mat, coll):
    me = bpy.data.meshes.new("node")
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=s)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    ob = bpy.data.objects.new("node", me)
    coll.objects.link(ob)
    ob.location = p
    return ob


def floor_material():
    m = bpy.data.materials.new("deck")
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.05, 0.06, 0.09, 1)
    b.inputs["Roughness"].default_value = 0.7
    b.inputs["Alpha"].default_value = 0.55
    m.surface_render_method = "BLENDED"
    return m


def main():
    a = args()
    data = json.loads(Path(a.data).read_text())
    catalog = json.loads((X.ROOT / "packages/content/src/ship-components.v1.json").read_text())
    comps = {c["id"]: c for c in catalog["components"]}
    channels = [c for c in a.channels.split(",") if c]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    detail = K.detail_height(scratch_path("detail_height.png"))
    th = K.THEMES["federation"]
    theme_mats = {s: K.slot_material("federation", s, th, detail) for s in K.SLOTS}
    base = X.slot_materials()
    cam = K.setup(sc, a.samples)
    res = (2400, 1500)
    sc.render.resolution_x, sc.render.resolution_y = res
    lm = S.label_mats()
    coll = bpy.data.collections.new("net")
    sc.collection.children.link(coll)
    hull = data["fit"]["hull"]
    L, B, Hh = hull["lengthM"], hull["beamM"], hull["heightM"]
    # translucent deck plate and hull outline frame
    deck = bpy.data.objects.new("deck", bpy.data.meshes.new("deck"))
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bm.to_mesh(deck.data)
    bm.free()
    deck.data.materials.append(floor_material())
    coll.objects.link(deck)
    deck.scale = (B, L, 0.06)
    deck.location = (0, 0, -0.03)
    for (x0, y0), (x1, y1) in (((-B / 2, -L / 2), (B / 2, -L / 2)), ((B / 2, -L / 2), (B / 2, L / 2)),
                               ((B / 2, L / 2), (-B / 2, L / 2)), ((-B / 2, L / 2), (-B / 2, -L / 2))):
        for z in (0, Hh):
            bar((x0, y0, z), (x1, y1, z), 0.05, theme_mats["trim"], coll)
    for x, y in ((-B / 2, -L / 2), (B / 2, -L / 2), (B / 2, L / 2), (-B / 2, L / 2)):
        bar((x, y, 0), (x, y, Hh), 0.05, theme_mats["trim"], coll)
    objs = []
    for p in data["placements"]:
        c = comps[p["componentId"]]
        if not c["art"]["kitKey"]:
            continue
        ob, _, _ = X.component_object(c, base, coll, bevel=True)
        S.themed(ob, theme_mats)
        bx, by, bz = (Vector(v) for v in p["basis"])
        m = Matrix((
            (bx.x, by.x, bz.x, p["origin"][0]),
            (bx.y, by.y, bz.y, p["origin"][1]),
            (bx.z, by.z, bz.z, p["origin"][2]),
            (0, 0, 0, 1),
        ))
        ob.matrix_world = m
        objs.append(ob)
    # connection runs: riser down from each port to its channel layer, then x, then y, then riser up
    used = {c: 0 for c in channels}
    for c in data["connections"]:
        ch = c["channel"]
        if ch not in channels:
            continue
        used[ch] += 1
        mat = lm[ch]
        off = CH_OFFSET[ch]
        z = -0.35 - off
        pa, pb = Vector(c["a"]), Vector(c["b"])
        pa2 = Vector((pa.x + off, pa.y + off, z))
        pb2 = Vector((pb.x + off, pb.y + off, z))
        corner = Vector((pb2.x, pa2.y, z))
        pts = [pa, Vector((pa.x, pa.y, z)), Vector((pa2.x, pa2.y, z)), corner, pb2, Vector((pb.x, pb.y, z)), pb]
        for u, v in zip(pts, pts[1:]):
            bar(u, v, 0.045, mat, coll)
        node(pa, 0.14, mat, coll)
        node(pb, 0.14, mat, coll)
    rot = (math.radians(0 if a.top else 48), 0, math.radians(0 if a.top else -32))
    title = data["fit"]["name"].upper()
    lx = -B / 2 - 16                                   # legend column beside the hull
    S.text(title, (lx, L / 2 + 6, 0), 0.8, lm["title"], coll, rot).data.align_x = "LEFT"
    S.text(f"auto-wired utility networks  ·  compile status {data['status']}", (lx, L / 2 + 4.9, 0), 0.5,
           lm["label.dim"], coll, rot).data.align_x = "LEFT"
    y = L / 2 + 3.6
    for ch in channels:
        net = [n for n in data["networks"] if n["channel"] == ch]
        sup = sum(n["supply"] for n in net)
        dem = sum(n["demand"] for n in net)
        t = S.text(f"■ {CH_LABEL[ch]}  links {used[ch]}  supply {sup:g}  demand {dem:g}", (lx, y, 0), 0.5, lm[ch], coll, rot)
        t.data.align_x = "LEFT"
        y -= 1.0
    view = objs + [ob for ob in coll.objects if ob.type == "FONT"] + [deck]
    bpy.context.view_layer.update()
    S.iso_camera(cam, view, res, rot)
    sc.render.filepath = a.out
    bpy.ops.render.render(write_still=True)
    print(f"[network] {a.out}")


if __name__ == "__main__":
    main()


def scratch_path(name):
    """On-disk scratch (never /tmp, which is RAM-backed on the art host)."""
    d = Path(os.environ.get("SIDEREAL_SCRATCH", str(Path.home() / "sidereal-scratch" / "ship-components")))
    d.mkdir(parents=True, exist_ok=True)
    return str(d / name)
