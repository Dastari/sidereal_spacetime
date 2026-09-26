"""Catalog sheet and exploded-view renders for the ship component export.

Imported by ship_component_export.py when ``--sheets DIR`` is given; runs in the
same headless Blender session. Presentation only: themed kit materials with the
detail bump, standing labels with key stats, isometric orthographic cameras.
Nothing here feeds the exported GLBs or the catalog.
"""
import math
import os
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

CHANNEL_COLOUR = {  # reference sheet colours: power red, data blue, air yellow, coolant white, fuel amber
    "power": (1.0, 0.12, 0.08), "data": (0.1, 0.45, 1.0), "coolant": (0.85, 0.95, 1.0),
    "fuel": (1.0, 0.55, 0.05), "ventilation": (1.0, 0.9, 0.2), "ammo": (0.75, 0.2, 1.0),
}
SHEETS = [
    ("propulsion", "PROPULSION  ·  thrust, power, propellant", [
        ["ion-drive.sm", "ion-drive.md", "ion-drive.lg", "ion-drive.xl"],
        ["thrust-block.sm", "thrust-block.md", "thrust-block.lg", "thrust-block.xl"],
        ["ion-drive.salvaged.sm", "ion-drive.salvaged.md", "ion-drive.salvaged.lg", "ion-drive.salvaged.xl"],
        ["resonance-drive.aurelian.sm", "resonance-drive.aurelian.md", "resonance-drive.aurelian.lg", "rcs.sm", "rcs.md",
         "vtol-thruster.sm", "vtol-thruster.md"],
    ]),
    ("weapons", "WEAPONS  ·  damage, rate, range, feed", [
        ["point-defense.sm", "point-defense.md", "autocannon.sm", "autocannon.md", "autocannon.lg"],
        ["laser-cannon.sm", "laser-cannon.md", "laser-cannon.lg", "railgun.md", "railgun.lg"],
        ["missile-pod.sm", "missile-pod.md", "missile-pod.lg", "torpedo-launcher.md", "torpedo-launcher.lg"],
        ["flak-cannon.sm", "flak-cannon.md", "flak-cannon.lg", "plasma-turret.md", "plasma-turret.lg"],
        ["side-cannon.sm", "side-cannon.md", "side-cannon.lg", "magazine.ballistic.sm", "magazine.ballistic.md",
         "magazine.ballistic.lg", "magazine.missile.md", "magazine.missile.lg", "magazine.torpedo.lg"],
    ]),
    ("power-thermal-defense", "POWER · THERMAL · DEFENSE", [
        ["reactor.sm", "reactor.md", "reactor.lg", "aux-generator.sm", "solar-array.sm", "solar-array.md"],
        ["battery.sm", "battery.md", "battery.lg", "capacitor.sm", "capacitor.md", "capacitor.lg"],
        ["fuel-tank.sm", "fuel-tank.md", "fuel-tank.lg", "coolant-pump.sm", "coolant-pump.md", "coolant-pump.lg"],
        ["radiator.sm", "radiator.md", "radiator.lg", "heat-sink.sm", "heat-sink.md"],
        ["shield-generator.sm", "shield-generator.md", "shield-generator.lg", "shield-emitter.sm", "shield-emitter.md",
         "shield-emitter.lg"],
    ]),
    ("sensors-utility", "SENSORS · UTILITY", [
        ["sensor-dish.sm", "sensor-dish.md", "sensor-dish.lg", "radar-array.md", "radar-array.lg"],
        ["scanner-mast.sm", "scanner-mast.md", "relay-beacon.sm", "relay-beacon.md", "docking-clamp.md", "docking-clamp.lg"],
        ["tractor-projector.sm", "tractor-projector.md", "tractor-projector.lg", "mining-laser.sm", "mining-laser.md",
         "mining-laser.lg"],
        ["salvage-arm.md", "salvage-arm.lg", "drone-bay.md", "drone-bay.lg"],
    ]),
    ("structure-interior", "STRUCTURE · INTERIOR SYSTEMS", [
        ["cargo-door.2m", "cargo-door.4m", "cargo-door.6m", "airlock.exterior.md", "airlock.interior.sm"],
        ["docking-port.md", "docking-port.lg", "hatch.sm", "hatch.exterior.sm", "warp-drive.lg"],
        ["life-support.sm", "life-support.md", "life-support.lg", "air-filter.sm", "air-filter.md", "oxygen-tank.sm",
         "oxygen-tank.md", "hydroponics.sm"],
        ["computer-core.sm", "computer-core.md", "computer-core.lg", "gravity-unit.md", "gravity-unit.lg", "crew-bunk.sm"],
        ["console.navigation.sm", "console.command.sm", "console.fire-control.sm", "console.engineering.sm",
         "console.sensor.sm"],
    ]),
]


def fmt(v):
    return f"{v:g}" if isinstance(v, (int, float)) else str(v)


def key_stat(c):
    p, w = c.get("propulsion"), c.get("weapon")
    pw = c["power"]
    if p:
        if p["thrustKn"] <= 0:
            return f"{p['role']} (future)"
        fuel = c["fluids"]["fuelActiveLps"]
        return f"{fmt(p['thrustKn'])} kN · {fmt(pw['activeKw'])} kW" + (f" · {fmt(fuel)} L/s" if fuel else " · no fuel")
    if w:
        dps = w["damagePerShot"] * w["projectilesPerShot"] * w["shotsPerMinute"] / 60
        feed = w["ammoType"] or f"{fmt(w['energyPerShotKj'])} kJ/shot"
        return f"{dps:.0f} dps · {w['rangeM']} m · {feed}"
    if c.get("magazine"):
        return f"{c['magazine']['capacityKg']} kg {c['magazine']['ammoClass']}"
    if c.get("shield"):
        s = c["shield"]
        return f"{s['capacityHp']} hp · {s['rechargePerS']}/s" if s["role"] == "generator" else f"bubble r{s['radiusM']} m"
    if c.get("sensor"):
        s = c["sensor"]
        return f"comm {s['commRangeM'] // 1000} km" if s["kind"] == "relay" else f"{s['rangeM']} m · {s['arcDeg']}°"
    if c.get("tool"):
        t = c["tool"]
        return {"tractor": f"{t['forceKn']} kN · {t['rangeM']} m", "mining": f"{t['rateKgPerS']} kg/s",
                "salvage": f"{t['rateKgPerS']} kg/s cut", "clamp": f"≤{t['maxTargetMassKg'] // 1000} t",
                "drone-bay": f"{t['drones']} drones"}[t["kind"]]
    if c.get("access"):
        a = c["access"]
        return f"{fmt(a['openingWidthM'])}×{fmt(a['openingHeightM'])} m · {a['cycleS']} s"
    if c.get("control"):
        return f"grants {c['control']['grants']}"
    if c.get("gravity"):
        return f"{c['gravity']['areaM2']} m² g"
    f, h = c["fluids"], c["heat"]
    if pw["generationKw"]:
        return f"+{fmt(pw['generationKw'])} kW"
    if pw["storageKwh"]:
        return f"{fmt(pw['storageKwh'])} kWh · {fmt(pw['maxDischargeKw'])} kW"
    if f["fuelCapacityL"]:
        return f"{f['fuelCapacityL']} L fuel"
    if h["rejectionKw"]:
        return f"-{fmt(h['rejectionKw'])} kW heat"
    if f["coolantSupplyLps"]:
        return f"{fmt(f['coolantSupplyLps'])} L/s coolant"
    if h["storageMj"]:
        return f"{fmt(h['storageMj'])} MJ sink"
    if f["crewSupported"]:
        return f"{f['crewSupported']} crew"
    if f["reserveCrewHours"]:
        return f"{f['reserveCrewHours']} crew-h O₂"
    if c["data"]["supplyKbps"]:
        return f"{c['data']['controlSlots']} slots"
    if c["crew"]["berths"]:
        return f"{c['crew']['berths']} berths"
    return ""


def display_yaw(frame):
    return {"face": 0.0, "top": 135.0, "interior": 180.0}[frame]


def label_mats():
    out = {}
    for name, col, strength in (("label", (0.45, 0.8, 1.0), 2.4), ("label.dim", (0.9, 0.75, 0.45), 1.8),
                                ("title", (1.0, 1.0, 1.0), 3.0)):
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        nt = m.node_tree
        nt.nodes.clear()
        e = nt.nodes.new("ShaderNodeEmission")
        e.inputs["Color"].default_value = (*col, 1)
        e.inputs["Strength"].default_value = strength
        o = nt.nodes.new("ShaderNodeOutputMaterial")
        nt.links.new(e.outputs[0], o.inputs[0])
        out[name] = m
    for ch, col in CHANNEL_COLOUR.items():
        m = bpy.data.materials.new(f"port.{ch}")
        m.use_nodes = True
        b = m.node_tree.nodes.get("Principled BSDF")
        b.inputs["Base Color"].default_value = (*col, 1)
        b.inputs["Emission Color"].default_value = (*col, 1)
        b.inputs["Emission Strength"].default_value = 6.0
        out[ch] = m
    return out


def text(body, loc, size, mat, coll, rot):
    cu = bpy.data.curves.new("lbl", "FONT")
    cu.body, cu.size, cu.align_x = body, size, "CENTER"
    cu.materials.append(mat)
    ob = bpy.data.objects.new("lbl", cu)
    coll.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = rot
    return ob


def themed(ob, theme_mats):
    for i, name in enumerate(["primary", "secondary", "accent", "trim", "metal", "dark", "emit_a", "emit_b", "glass"]):
        ob.material_slots[i].link = "OBJECT"
        ob.material_slots[i].material = theme_mats[name]


def iso_camera(cam, objs, res, rot=None):
    """Orthographic isometric-style camera fitted to the given objects."""
    rot = rot or (math.radians(50), 0, math.radians(-14))
    cam.data.type = "ORTHO"
    cam.rotation_euler = rot
    mw = cam.rotation_euler.to_matrix()
    right, up, fwd = mw @ Vector((1, 0, 0)), mw @ Vector((0, 1, 0)), mw @ Vector((0, 0, -1))
    pts = [ob.matrix_world @ Vector(c) for ob in objs for c in ob.bound_box]
    us, vs = [p.dot(right) for p in pts], [p.dot(up) for p in pts]
    cu, cv = (min(us) + max(us)) / 2, (min(vs) + max(vs)) / 2
    width, height = max(us) - min(us), max(vs) - min(vs)
    aspect = res[0] / res[1]
    cam.data.ortho_scale = max(width, height * aspect) * 1.06
    centre = right * cu + up * cv
    cam.location = centre - fwd * 200
    cam.data.clip_end = 1000
    return rot


def render(K, catalog, a, exporter):
    out = Path(a.sheets)
    out.mkdir(parents=True, exist_ok=True)
    comps = {c["id"]: c for c in catalog["components"]}
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    import ship_component_views as V
    detail = K.detail_height(scratch_path("detail_height.png"))
    themes = V.Themes(K, detail)
    theme_mats = themes.get("orion")
    want = {k for k in getattr(a, "sheet_keys", "").split(",") if k}
    on = lambda k: not want or k in want
    base_mats = exporter.slot_materials()
    cam = K.setup(sc, a.samples)
    res = (2400, 1350)
    sc.render.resolution_x, sc.render.resolution_y = res
    lm = label_mats()
    cam_rot = (math.radians(50), 0, math.radians(-14))
    for key, title, rows in SHEETS:
        if not on(key) and not (key == "weapons" and on("weapons-top")):
            continue
        coll = bpy.data.collections.new(key)
        sc.collection.children.link(coll)
        objs, front = [], 0.0
        for row in rows:
            placed, heights = [], []
            for cid in row:                                   # build and orient, then measure world bounds
                c = comps[cid]
                ob, _, _ = exporter.component_object(c, base_mats, coll, bevel=True)
                ob.modifiers["brick"].segments = 2
                themes.apply(ob, "orion", cid)
                ob.rotation_euler = (0, 0, math.radians(display_yaw(c["mount"]["frame"])))
                bpy.context.view_layer.update()
                pts = [ob.matrix_world @ Vector(v) for v in ob.bound_box]
                placed.append((c, ob, min(p.x for p in pts), max(p.x for p in pts), min(p.y for p in pts), max(p.y for p in pts)))
                heights.append(max(p.z for p in pts))
            depth = max(y1 - y0 for _, _, _, _, y0, y1 in placed)
            tallest = max(heights)
            x = 0.0
            for c, ob, x0, x1, y0, y1 in placed:              # front edges on one line, labels in front of it
                slot = max(x1 - x0, 3.4)
                ob.location = (x + slot / 2 - (x0 + x1) / 2, front - y0, 0)
                objs.append(ob)
                text(c["name"].upper(), (x + slot / 2, front - 0.55, 0), 0.3, lm["label"], coll, cam_rot)
                text(key_stat(c), (x + slot / 2, front - 1.05, 0), 0.24, lm["label.dim"], coll, cam_rot)
                x += slot + 0.9
            front += depth + 1.8 + 1.2 * tallest              # next row behind, clear of this row's silhouette
        title_ob = text(title, (0, front + 0.5, 0), 0.8, lm["title"], coll, cam_rot)
        title_ob.data.align_x = "LEFT"
        objs.append(V.crew(K, themes, coll, (-1.2, 1.0, 0)))
        text("1.8 m crew · 1 m grid", (-1.2, -0.6, 0), 0.22, lm["label.dim"], coll, cam_rot)
        bpy.context.view_layer.update()
        xs = [(ob.matrix_world @ Vector(v)).x for ob in objs for v in ob.bound_box]
        V.grid(coll, -2.5, -1.5, max(xs) + 1, front, V.grid_material())
        view = objs + [ob for ob in coll.objects if ob.type == "FONT"]
        for other in sc.collection.children:
            other.hide_render = other is not coll
        if on(key):
            bpy.context.view_layer.update()
            iso_camera(cam, view, res)
            sc.render.filepath = str(out / f"catalog_{key}.png")
            bpy.ops.render.render(write_still=True)
            print(f"[sheet] {sc.render.filepath}")
        if key == "weapons" and on("weapons-top"):
            iso_camera(cam, view, res, (0, 0, 0))
            sc.render.filepath = str(out / "catalog_weapons_top-down.png")
            bpy.ops.render.render(write_still=True)
            print(f"[sheet] {sc.render.filepath}")
    base_mats = exporter.slot_materials()
    if on("exploded-ion"):
        exploded(K, comps, sc, cam, theme_mats, lm, out, res)
    if on("exploded-weapons"):
        V.exploded_weapons(K, exporter, comps, sc, cam, themes, base_mats, lm, out)
    if on("damage"):
        V.damage_row(K, exporter, comps, sc, cam, themes, base_mats, lm, out)
    if on("variants"):
        V.variants_row(K, exporter, comps, sc, cam, themes, base_mats, lm, out)


def exploded(K, comps, sc, cam, theme_mats, lm, out, res):
    """Exploded LG ion drive with its typed ports: flange, housing, conduit, nozzle."""
    coll = bpy.data.collections.new("exploded")
    sc.collection.children.link(coll)
    pivot = bpy.data.objects.new("pivot", None)
    coll.objects.link(pivot)
    pivot.rotation_euler = (0, 0, math.radians(-90))          # engine axis along world X, ports to the right
    for other in sc.collection.children:
        other.hide_render = other is not coll
    c = comps["ion-drive.lg"]
    parts, meta = K.ion_parts("LG")
    W = meta["W"]
    cam_rot = (math.radians(50), 0, math.radians(-14))
    names = {"flange": "MOUNT FLANGE", "housing": "ENGINE HOUSING", "conduit": "CONDUIT LAYER", "nozzle": "THRUSTER NOZZLE"}
    offsets = {"flange": (0.0, 0.0), "housing": (-1.4, 0.0), "conduit": (-1.4, 2.6), "nozzle": (-3.2, 0.0)}
    objs = []
    for piece in parts:
        part = piece.id.rsplit(".", 1)[1]
        pc = K.Piece(piece.id + ".cat", "engine-part", "face", piece.size)
        pc.boxes = [(W / 2 - x1, -y1, z0 - W / 2, W / 2 - x0, -y0, z1 - W / 2, s) for x0, y0, z0, x1, y1, z1, s in piece.boxes]
        dy, dz = offsets[part]
        ob = K.instance(pc, (0, 0, 0), 0, theme_mats, coll)
        ob.parent = pivot
        ob.location = (0, dy, dz)
        objs.append(ob)
        ends = [bx[1] for bx in pc.boxes] + [bx[4] for bx in pc.boxes]
        mid = (min(ends) + max(ends)) / 2 * K.T + dy
        lab = text(names[part], (0, mid, dz + 2.0 if part != "conduit" else dz + 1.5), 0.3, lm["label"], coll, cam_rot)
        lab.parent = pivot
        lab.rotation_euler = (math.radians(50), 0, math.radians(-14 + 90))
    # typed ports on the mount plane, pulled forward to read clearly
    for i, port in enumerate(c["ports"]):
        px, py, pz = port["position"]
        ch = port["channel"]
        me = bpy.data.meshes.new("port")
        import bmesh
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=0.22)
        bm.to_mesh(me)
        bm.free()
        me.materials.append(lm[ch])
        dot = bpy.data.objects.new(f"port.{port['id']}", me)
        coll.objects.link(dot)
        dot.parent = pivot
        dot.location = (px, py + 1.4, pz)
        stalk = bpy.data.objects.new(f"stalk.{port['id']}", bpy.data.meshes.new("stalk"))
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=(0.05, 1.4, 0.05), verts=bm.verts)
        bmesh.ops.translate(bm, vec=(0, 0.7, 0), verts=bm.verts)
        bm.to_mesh(stalk.data)
        bm.free()
        stalk.data.materials.append(lm[ch])
        coll.objects.link(stalk)
        stalk.parent = pivot
        stalk.location = (px, py, pz)
        cap = f"{port['id'].upper()}  {port['capacity']:g} {'kW' if ch == 'power' else 'kbit/s' if ch == 'data' else 'L/s'}"
        lab = text(cap, (px, py + 1.75, pz + 0.12), 0.2, lm[ch], coll, cam_rot)
        lab.data.align_x = "LEFT"
        lab.parent = pivot
        lab.rotation_euler = (math.radians(50), 0, math.radians(-14 + 90))
        objs.append(dot)
    p = c["propulsion"]
    text(f"ION DRIVE LG  ·  {p['thrustKn']:g} kN  ·  {c['power']['activeKw']:g} kW  ·  {c['heat']['activeKw']:g} kW heat  ·  "
         f"{c['fluids']['fuelActiveLps']:g} L/s  ·  {c['massKg']} kg", (-3.0, 0, 5.2), 0.34, lm["title"], coll, cam_rot)
    text("TYPED PORTS ON THE MOUNT PLANE  ·  power  data  coolant  fuel", (-3.0, 0, 4.7), 0.22, lm["label.dim"], coll, cam_rot)
    view = objs + [ob for ob in coll.objects if ob.type == "FONT"]
    bpy.context.view_layer.update()
    iso_camera(cam, view, res)
    sc.render.filepath = str(out / "exploded_ion-drive-lg_ports.png")
    bpy.ops.render.render(write_still=True)
    print(f"[sheet] {sc.render.filepath}")


def scratch_path(name):
    """On-disk scratch (never /tmp, which is RAM-backed on the art host)."""
    d = Path(os.environ.get("SIDEREAL_SCRATCH", str(Path.home() / "sidereal-scratch" / "ship-components")))
    d.mkdir(parents=True, exist_ok=True)
    return str(d / name)
