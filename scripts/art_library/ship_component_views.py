"""r002 presentation renders for the ship component catalog (presentation only).

- per-weapon "complete + exploded" views with part labels (reference weapons-turrets.png layout)
- damage-state rows (pristine / scuffed / damaged / destroyed)
- theme variant rows through the nine material slots
- a 1 m grid and a 1.8 m crew figure for scale in every view
Everything is rendered from the same builders the GLB exporter uses.
"""
import math
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

import ship_component_sheets as S

ISO = (math.radians(56), 0, math.radians(-38))          # ~34 deg elevation, front-right like the reference
TOP_YAW = 70.0                                           # barrels toward screen-left and slightly toward the viewer
WEAPON_VIEWS = [("point-defense.md", "POINT-DEFENSE TURRET", "ANTI-FIGHTER · HIGH RATE"),
                ("autocannon.md", "TWIN AUTOCANNON", "BALLISTIC · VERSATILE"),
                ("laser-cannon.md", "LASER CANNON", "ENERGY · PRECISION"),
                ("railgun.lg", "RAILGUN MOUNT", "KINETIC · LONG RANGE"),
                ("missile-pod.md", "MISSILE POD", "MULTI-TARGET · LOCK ON"),
                ("flak-cannon.md", "FLAK CANNON", "ANTI-FIGHTER · BURST"),
                ("plasma-turret.md", "PLASMA TURRET", "AREA DENIAL · HIGH DAMAGE"),
                ("shield-emitter.md", "SHIELD EMITTER", "DEFENSE · FIELD PROJECTION"),
                ("tractor-projector.md", "TRACTOR PROJECTOR", "UTILITY · TOW")]


class Themes:
    """Per-theme slot materials (orion default), plus a green accent for hydroponics."""

    def __init__(self, K, detail):
        self.K, self.detail, self.cache = K, detail, {}

    def get(self, name):
        if name not in self.cache:
            th = self.K.THEMES[name]
            self.cache[name] = {s: self.K.slot_material(name, s, th, self.detail) for s in self.K.SLOTS}
        return self.cache[name]

    def apply(self, ob, name="orion", component_id=""):
        mats = dict(self.get(name))
        if component_id.startswith("hydroponics"):
            if "leaf" not in self.cache:
                m = bpy.data.materials.new("leaf")
                m.use_nodes = True
                b = m.node_tree.nodes.get("Principled BSDF")
                b.inputs["Base Color"].default_value = (0.05, 0.42, 0.06, 1)
                b.inputs["Roughness"].default_value = 0.6
                self.cache["leaf"] = m
            mats["accent"] = self.cache["leaf"]
        for i, s in enumerate(self.K.SLOTS):
            ob.material_slots[i].link = "OBJECT"
            ob.material_slots[i].material = mats[s]


def grid(coll, x0, y0, x1, y1, mat, z=-0.01):
    """1 m floor grid made of thin bars (scale reference)."""
    me = bpy.data.meshes.new("grid")
    bm = bmesh.new()
    for x in range(int(math.floor(x0)), int(math.ceil(x1)) + 1):
        bmesh.ops.create_cube(bm, size=1.0, matrix=_m((x, (y0 + y1) / 2, z), (0.02, y1 - y0, 0.01)))
    for y in range(int(math.floor(y0)), int(math.ceil(y1)) + 1):
        bmesh.ops.create_cube(bm, size=1.0, matrix=_m(((x0 + x1) / 2, y, z), (x1 - x0, 0.02, 0.01)))
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    ob = bpy.data.objects.new("grid", me)
    coll.objects.link(ob)
    return ob


def _m(loc, scale):
    from mathutils import Matrix
    return Matrix.Translation(loc) @ Matrix.Diagonal((*scale, 1))


def grid_material():
    m = bpy.data.materials.get("grid") or bpy.data.materials.new("grid")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    e = nt.nodes.new("ShaderNodeEmission")
    e.inputs["Color"].default_value = (0.20, 0.30, 0.75, 1)
    e.inputs["Strength"].default_value = 0.6
    o = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(e.outputs[0], o.inputs[0])
    return m


def crew(K, themes, coll, loc):
    ob = K.instance(K.crew_figure(), loc, 0, themes.get("orion"), coll)
    return ob


def place_catalog_boxes(exporter, boxes, name, base_mats, coll):
    me = exporter.boxes_mesh(name, boxes)
    for m in base_mats:
        me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    md = ob.modifiers.new("brick", "BEVEL")
    md.width, md.segments, md.limit_method, md.angle_limit = exporter.BEVEL, 2, "ANGLE", math.radians(30)
    md.harden_normals, md.use_clamp_overlap = True, True
    return ob


def isolate(sc, coll):
    for other in sc.collection.children:
        other.hide_render = other is not coll


def shoot(sc, cam, coll, objs, res, path, rot=ISO):
    isolate(sc, coll)
    sc.render.resolution_x, sc.render.resolution_y = res
    bpy.context.view_layer.update()
    S.iso_camera(cam, objs, res, rot)
    sc.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    print(f"[view] {path}")


def exploded_weapons(K, exporter, comps, sc, cam, themes, base_mats, lm, out):
    """One image per weapon: complete (left) and exploded parts with labels (right)."""
    files = []
    for cid, title, sub in WEAPON_VIEWS:
        c = comps[cid]
        parts, labels = exporter.build_parts(c)
        coll = bpy.data.collections.new("xw." + cid)
        sc.collection.children.link(coll)
        objs = []
        whole = K.Piece("whole", "mount", "top", parts[0].size)
        for q in parts:
            whole.boxes += q.boxes
        ob = place_catalog_boxes(exporter, exporter.clip_boxes(exporter.to_catalog(whole, "top", 0), c["mount"]["envelopeM"]), cid, base_mats, coll)
        themes.apply(ob)
        ob.rotation_euler = (0, 0, math.radians(TOP_YAW))
        W = K.SIZE_CELLS[c["sizeClass"]]
        ob.location = (0, 0, 0)
        objs.append(ob)
        # exploded: parts lifted along z, stacked at x = +2.6 W
        ex = 2.3 * W + 0.8
        z = 0.0
        for q, label in zip(parts, labels):
            if not q.boxes:
                continue
            zs = [b[2] for b in q.boxes] + [b[5] for b in q.boxes]
            z0, z1 = min(zs), max(zs)
            po = place_catalog_boxes(exporter, exporter.clip_boxes(exporter.to_catalog(q, "top", 0), c["mount"]["envelopeM"]), q.id, base_mats, coll)
            themes.apply(po)
            po.rotation_euler = (0, 0, math.radians(TOP_YAW))
            po.location = (ex, 0, z - z0 * K.T)
            objs.append(po)
            mid = z + (z1 - z0) * K.T / 2
            lab = S.text(label, (ex + 0.9 * W + 0.2, -0.4 * W, mid), 0.12 * W + 0.1, lm["label"], coll, ISO)
            lab.data.align_x = "LEFT"
            z += (z1 - z0) * K.T + 0.22 * W + 0.1
        S.text("COMPLETE", (0, -1.0 * W - 0.2, 0), 0.14 * W + 0.12, lm["label.dim"], coll, ISO)
        S.text("EXPLODED VIEW", (ex, -1.0 * W - 0.2, 0), 0.14 * W + 0.12, lm["label.dim"], coll, ISO)
        t = S.text(f"{title}  {c['sizeClass']}", (-1.0 * W, 0.8 * W, z + 0.2), 0.22 * W + 0.1, lm["title"], coll, ISO)
        t.data.align_x = "LEFT"
        t2 = S.text(sub + "  ·  " + S.key_stat(c), (-1.0 * W, 0.8 * W, z - 0.2 * W), 0.12 * W + 0.08, lm["label.dim"], coll, ISO)
        t2.data.align_x = "LEFT"
        g = grid(coll, -1.1 * W, -0.9 * W, ex + 0.8 * W, 0.9 * W, grid_material())
        objs.append(crew(K, themes, coll, (-1.0 * W - 0.4, 0.4 * W, 0)))
        objs += [o for o in coll.objects if o.type == "FONT"] + [g]
        path = out / f"exploded_{c['kind']}.png"
        shoot(sc, cam, coll, objs, (1600, 1000), path)
        files.append(path)
    return files


def damage_row(K, exporter, comps, sc, cam, themes, base_mats, lm, out, ids=("autocannon.md", "ion-drive.md", "reactor.md")):
    coll = bpy.data.collections.new("damage")
    sc.collection.children.link(coll)
    objs = []
    states = ("pristine", "scuffed", "damaged", "destroyed")
    y = 0.0
    for cid in ids:
        c = comps[cid]
        boxes, conv = exporter.catalog_boxes(c)
        lo, hi = c["mount"]["envelopeM"]
        span = max(hi[0] - lo[0], hi[1] - lo[1]) + 1.6
        for i, st in enumerate(states):
            ob = place_catalog_boxes(exporter, A_damage(K, boxes, st, cid), f"{cid}.{st}", base_mats, coll)
            themes.apply(ob, "orion" if st == "pristine" else "orion-worn")
            ob.rotation_euler = (0, 0, math.radians(TOP_YAW if conv == "top" else 0))
            ob.location = (i * span, y, 0)
            objs.append(ob)
            if cid == ids[0]:
                S.text(st.upper(), (i * span, y - span / 2 - 0.3, 0), 0.3, lm["label"], coll, ISO)
        S.text(c["name"].upper(), (-span * 0.9, y, 0), 0.26, lm["label.dim"], coll, ISO).data.align_x = "RIGHT"
        y += span + 0.8
    t = S.text("DAMAGE STATES  ·  entity-health presentation (proposal)", (-2, y + 0.4, 0), 0.4, lm["title"], coll, ISO)
    t.data.align_x = "LEFT"
    g = grid(coll, -3, -2.5, 4 * 5.5, y, grid_material())
    objs += [o for o in coll.objects if o.type == "FONT"] + [g]
    shoot(sc, cam, coll, objs, (2000, 1250), out / "damage_states.png")


def A_damage(K, boxes, state, seed):
    import ship_component_art as A
    return A.damage_boxes(K, boxes, state, seed)


def variants_row(K, exporter, comps, sc, cam, themes, base_mats, lm, out, cid="autocannon.md"):
    coll = bpy.data.collections.new("variants")
    sc.collection.children.link(coll)
    objs = []
    c = comps[cid]
    boxes, conv = exporter.catalog_boxes(c)
    names = ("orion", "federation", "riftjack", "aurelian")
    for i, th in enumerate(names):
        ob = place_catalog_boxes(exporter, boxes, f"{cid}.{th}", base_mats, coll)
        themes.apply(ob, th)
        ob.rotation_euler = (0, 0, math.radians(TOP_YAW))
        ob.location = (i * 4.2, 0, 0)
        objs.append(ob)
        S.text(th.upper(), (i * 4.2, -2.3, 0), 0.3, lm["label"], coll, ISO)
    t = S.text(f"{c['name'].upper()}  ·  SAME GEOMETRY, NINE MATERIAL SLOTS, FOUR THEMES", (-2, 2.8, 0), 0.34, lm["title"], coll, ISO)
    t.data.align_x = "LEFT"
    g = grid(coll, -2.5, -2.5, 15, 2.5, grid_material())
    objs += [o for o in coll.objects if o.type == "FONT"] + [g]
    shoot(sc, cam, coll, objs, (2000, 900), out / "variants_autocannon-md.png")
