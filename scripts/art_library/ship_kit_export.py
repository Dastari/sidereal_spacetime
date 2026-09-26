"""Export the prefab-ship structure kit (docs/shipyard_player_builder_design.md §12) as one GLB per piece.

Reads the canonical piece list written by packages/content/src/ship-kit.ts
(`ship-kit-pieces.v1.json`: `{id, family, mount, builder, args}`), calls the named builder in
`ship_kit_prototype.py` and exports its boxes. It never publishes, never touches a database and never
changes builder geometry.

Per piece:
- One mesh from the builder's boxes (same vertex/face layout as `ship_kit_prototype.piece_mesh`), in
  metres (texels x 1/16) in the piece-local frame: prototype +X/+Y plan, +Z up. The glTF exporter
  converts Blender Z-up to glTF Y-up, so glTF (x, y, z) = (x, z, -y).
- Exactly nine material slots in the fixed order of SLOTS, each material named by its slot, so the
  runtime swaps themes by material name. Defaults are the Federation theme. Only used slots emit
  glTF primitives/materials; the manifest lists them.
- A 1-segment chamfer bevel per box (0.012 m, 30 degree angle limit, hardened normals, clamped
  overlap), applied at export, for the studless brick edge without shader work.
- Coplanar faces resolve by the authoring rule "later boxes win": before the bevel, each opaque box grows
  outward by 0.25 mm per overlay level (capped at 0.75 mm), where a box's level is 1 + the highest level
  among the earlier boxes whose exposed coplanar face it shares (0 if none; glass counts as -1). Glass
  boxes instead shrink by 0.25 mm. Every remaining different-slot coplanar pair is thus >= 0.25 mm apart,
  enough for a 24-bit depth buffer at gameplay range. Faces lying entirely
  inside another opaque box of the same piece (or behind a later box's coplanar face) are dropped.
  Manifest bounds stay the un-inflated texel boxes.

Outputs `<out>/<id>.glb` and `<out>/manifest.json` (`sidereal.ship-kit-manifest.v1`), then re-imports
every GLB to verify triangles, material names and bounds. `--sheet` renders a labelled contact sheet
from the exported GLBs.

Usage:
  blender -b --factory-startup --python-exit-code 1 -P scripts/art_library/ship_kit_export.py -- \
    --pieces packages/content/src/ship-kit-pieces.v1.json --out assets/runtime/ship-kit/r001 \
    [--sheet /path/sheet.png] [--only id,id] [--skip-export]
"""
import argparse
import hashlib
import json
import math
import struct
import sys
import time
from pathlib import Path

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
import ship_kit_prototype as proto  # noqa: E402  (importable: main() is guarded)

SCHEMA = "sidereal.ship-kit-manifest.v1"
FRAME = "piece-local metres: prototype +X/+Y plan, +Z up; glTF Y-up (x, z, -y)"
SLOTS = list(proto.SLOTS)
T = proto.T
BEVEL = dict(width=0.012, segments=1, angle_deg=30.0)
EMIT = {"emit_a", "emit_b"}
PBR_DEFAULT = {"emit_a": (0.40, 0.0), "emit_b": (0.40, 0.0), "glass": (0.05, 0.0)}   # rough, metal
GLASS_ALPHA = 0.35
INFLATE_M, INFLATE_CAP_M, GLASS_SHRINK_M = 0.00025, 0.00075, 0.00025   # per level, cap, glass
# Box face order used by piece_object: (axis, side) for -z, +z, -y, +x, +y, -x.
FACE_AXES = ((2, -1), (2, 1), (1, -1), (0, 1), (1, 1), (0, -1))


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--pieces", default=str(ROOT / "packages/content/src/ship-kit-pieces.v1.json"))
    p.add_argument("--out", default=str(ROOT / "assets/runtime/ship-kit/r001"))
    p.add_argument("--sheet", default="")
    p.add_argument("--only", default="")
    p.add_argument("--skip-export", action="store_true", help="verify / render existing GLBs only")
    p.add_argument("--sheet-samples", type=int, default=16)
    return p.parse_args(argv)


def resolve(path):
    q = Path(path)
    return q if q.is_absolute() else (ROOT / q)


# ------------------------------------------------------------------------------ materials
def slot_materials(theme="federation"):
    th = proto.THEMES[theme]
    mats = []
    for s in SLOTS:
        m = bpy.data.materials.get(s) or bpy.data.materials.new(s)
        m.use_nodes = True
        nt = m.node_tree
        nt.nodes.clear()
        bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
        rough, metal = proto.SLOT_PBR[s][:2] if s in proto.SLOT_PBR else PBR_DEFAULT[s]
        if s in EMIT:
            col, strength = th[s]
            bsdf.inputs["Base Color"].default_value = (*[c * 0.25 for c in col], 1.0)
            bsdf.inputs["Emission Color"].default_value = (*col, 1.0)
            bsdf.inputs["Emission Strength"].default_value = strength
        else:
            col = th[s]
            bsdf.inputs["Base Color"].default_value = (*col, 1.0)
        if s == "glass":
            bsdf.inputs["Alpha"].default_value = GLASS_ALPHA
            if hasattr(m, "surface_render_method"):
                m.surface_render_method = "BLENDED"
            if hasattr(m, "blend_method"):
                m.blend_method = "BLEND"
        bsdf.inputs["Roughness"].default_value = rough
        bsdf.inputs["Metallic"].default_value = metal
        m.use_backface_culling = True   # closed boxes: glTF doubleSided false
        mats.append(m)
    return mats


# ------------------------------------------------------------------------------ pieces
def build_piece(spec):
    piece = getattr(proto, spec["builder"])(*spec["args"])
    piece.id = spec["id"]
    if not piece.boxes:
        raise ValueError(f"{spec['id']}: builder {spec['builder']}{tuple(spec['args'])} produced no boxes")
    return piece


def box_levels(boxes):
    """Overlay level per box: 1 + max level of the earlier boxes it meets in a live (unculled) coplanar
    different-slot conflict; 0 when it overlays nothing. Glass is -1 (it shrinks instead)."""
    drop = hidden_faces(boxes)
    below = {}
    for i, f, j, g in coplanar_conflicts(boxes):
        if (i, f) not in drop and (j, g) not in drop:
            below.setdefault(j, []).append(i)
    level = []
    for j, b in enumerate(boxes):
        level.append(-1 if b[6] == "glass" else 1 + max([level[i] for i in below.get(j, [])], default=-1))
    return level


def box_offsets(boxes):
    """Outward offset per box in metres: later boxes win by whole levels; glass shrinks inside its frame."""
    return [-GLASS_SHRINK_M if b[6] == "glass" else min(INFLATE_M * lv, INFLATE_CAP_M)
            for b, lv in zip(boxes, box_levels(boxes))]


def face_rect(b, ax):
    u, v = [a for a in range(3) if a != ax]
    return u, v, (b[u], b[v], b[u + 3], b[v + 3])


def hidden_faces(boxes):
    """(box, face) pairs to drop, judged on the exact texel boxes: the face lies entirely inside another
    opaque box's closed volume and either faces into it, is strictly inside, or sits on that box's
    same-facing coplanar face while being the earlier box (the later box wins). Glass never hides."""
    drop = set()
    for i, a in enumerate(boxes):
        for f, (ax, sd) in enumerate(FACE_AXES):
            c = a[ax + 3] if sd > 0 else a[ax]
            u, v, (u0, v0, u1, v1) = face_rect(a, ax)
            for j, b in enumerate(boxes):
                if j == i or b[6] == "glass":
                    continue
                if not (b[u] <= u0 and u1 <= b[u + 3] and b[v] <= v0 and v1 <= b[v + 3] and b[ax] <= c <= b[ax + 3]):
                    continue
                on = 1 if c == b[ax + 3] else -1 if c == b[ax] else 0
                if on == 0 or on != sd or i < j:
                    drop.add((i, f))
                    break
    return drop


def coplanar_conflicts(boxes):
    """Exposed same-facing coplanar face overlaps between different slots (the z-fight candidates of the
    raw texel boxes), as (i, fi, j, fj) with i < j."""
    faces = [(i, f, ax, sd, (b[ax + 3] if sd > 0 else b[ax])) for i, b in enumerate(boxes) for f, (ax, sd) in enumerate(FACE_AXES)]
    out = []
    for k, (i, f, ax, sd, c) in enumerate(faces):
        for (j, g, ax2, sd2, c2) in faces[k + 1:]:
            if j == i or ax2 != ax or sd2 != sd or c2 != c or boxes[i][6] == boxes[j][6]:
                continue
            u, v, ra = face_rect(boxes[i], ax)
            _, _, rb = face_rect(boxes[j], ax)
            r = (max(ra[0], rb[0]), max(ra[1], rb[1]), min(ra[2], rb[2]), min(ra[3], rb[3]))
            if r[2] <= r[0] or r[3] <= r[1]:
                continue
            p = [0.0, 0.0, 0.0]
            p[u], p[v], p[ax] = (r[0] + r[2]) / 2, (r[1] + r[3]) / 2, c + sd * 0.25
            if any(q[0] <= p[0] <= q[3] and q[1] <= p[1] <= q[4] and q[2] <= p[2] <= q[5] for q in boxes):
                continue   # the shared patch is buried under another box
            out.append((i, f, j, g))
    return out


def conflict_report(boxes):
    """Raw conflicts, and after resolution: dropped by face culling, or separated by the offsets (mm)."""
    raw = coplanar_conflicts(boxes)
    drop, off = hidden_faces(boxes), box_offsets(boxes)
    seps = [abs(off[i] - off[j]) * 1000.0 for i, f, j, g in raw if (i, f) not in drop and (j, g) not in drop]
    return dict(raw=len(raw), culled=len(raw) - len(seps), unresolved=sum(1 for s in seps if s == 0.0),
                min_sep_mm=min(seps) if seps else None, seps=seps)


def piece_object(piece, mats):
    """ship_kit_prototype.piece_mesh vertex/face layout with the coplanar offsets, culled hidden faces
    and the per-box chamfer bevel."""
    verts, faces, mat_idx = [], [], []
    drop = hidden_faces(piece.boxes)
    for i, (bx, e) in enumerate(zip(piece.boxes, box_offsets(piece.boxes))):
        x0, y0, z0, x1, y1, z1 = (v * T + (e if k >= 3 else -e) for k, v in enumerate(bx[:6]))
        o = len(verts)
        quads = [(o, o + 3, o + 2, o + 1), (o + 4, o + 5, o + 6, o + 7), (o, o + 1, o + 5, o + 4),
                 (o + 1, o + 2, o + 6, o + 5), (o + 2, o + 3, o + 7, o + 6), (o + 3, o, o + 4, o + 7)]
        kept = [q for f, q in enumerate(quads) if (i, f) not in drop]
        if not kept:
            continue   # fully buried box: no loose vertices
        verts += [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
        faces += kept
        mat_idx += [proto.SI[bx[6]]] * len(kept)
    me = bpy.data.meshes.new(piece.id)
    me.from_pydata(verts, [], faces)
    for m in mats:
        me.materials.append(m)
    me.polygons.foreach_set("material_index", mat_idx)
    me.polygons.foreach_set("use_smooth", [True] * len(faces))
    me.update()
    ob = bpy.data.objects.new(piece.id, me)
    bpy.context.scene.collection.objects.link(ob)
    md = ob.modifiers.new("brick", "BEVEL")
    md.width, md.segments = BEVEL["width"], BEVEL["segments"]
    md.limit_method, md.angle_limit = "ANGLE", math.radians(BEVEL["angle_deg"])
    md.harden_normals, md.use_clamp_overlap = True, True
    return ob


def export_glb(ob, path):
    for o in bpy.context.scene.objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    kw = dict(filepath=str(path), export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
              export_cameras=False, export_lights=False, export_materials="EXPORT", export_normals=True,
              export_texcoords=False, export_tangents=False, export_extras=False, export_animations=False,
              export_skins=False, export_morph=False)
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    for k, v in (("export_image_format", "NONE"), ("export_vertex_color", "NONE"), ("export_attributes", False),
                 ("export_shared_accessors", False), ("export_try_sparse_sk", False)):
        if k in props:
            kw[k] = v
    bpy.ops.export_scene.gltf(**kw)


def glb_json(path):
    data = Path(path).read_bytes()
    magic, _version, _length = struct.unpack_from("<III", data, 0)
    assert magic == 0x46546C67, f"{path}: not a GLB"
    clen, ctype = struct.unpack_from("<II", data, 12)
    assert ctype == 0x4E4F534A
    return json.loads(data[20:20 + clen]), data


def glb_stats(path):
    g, data = glb_json(path)
    tris, used, empty = 0, set(), 0
    names = [m.get("name") for m in g.get("materials", [])]
    for mesh in g.get("meshes", []):
        for prim in mesh["primitives"]:
            n = g["accessors"][prim["indices"]]["count"] // 3 if "indices" in prim else g["accessors"][prim["attributes"]["POSITION"]]["count"] // 3
            if n == 0:
                empty += 1
            tris += n
            if "material" in prim:
                used.add(names[prim["material"]])
    extra = {k: len(g.get(k, [])) for k in ("cameras", "images", "textures", "animations", "skins")}
    return dict(triangles=tris, materials=sorted(used, key=SLOTS.index) if used <= set(SLOTS) else sorted(used),
                empty_primitives=empty, bytes=len(data), sha256=hashlib.sha256(data).hexdigest(), extra=extra,
                material_names=names)


def export_all(specs, out, only, prior):
    mats = slot_materials()
    entries, failures = dict(prior), []
    for spec in specs:
        if only and spec["id"] not in only:
            continue
        try:
            piece = build_piece(spec)
        except Exception as e:  # report every failing builder, don't stop the kit
            failures.append(f"{spec['id']}: {type(e).__name__}: {e}")
            continue
        ob = piece_object(piece, mats)
        path = out / f"{spec['id']}.glb"
        export_glb(ob, path)
        me = ob.data
        used = sorted({SLOTS[p.material_index] for p in me.polygons}, key=SLOTS.index)
        bpy.data.objects.remove(ob)
        bpy.data.meshes.remove(me)
        st = glb_stats(path)
        if st["materials"] != used:
            failures.append(f"{spec['id']}: GLB materials {st['materials']} != used slots {used}")
        if st["empty_primitives"]:
            failures.append(f"{spec['id']}: {st['empty_primitives']} empty primitives")
        bx = piece.boxes
        entries[spec["id"]] = {
            "file": f"{spec['id']}.glb",
            "sha256": st["sha256"],
            "triangles": st["triangles"],
            "bounds": [min(b[0] for b in bx), min(b[1] for b in bx), min(b[2] for b in bx),
                       max(b[3] for b in bx), max(b[4] for b in bx), max(b[5] for b in bx)],
            "slots": used,
            "decals": [{"kind": k, "rect": list(r), "plane": pl} for k, r, pl in piece.decals],
            "voxelAligned": piece.aligned(),
        }
    return entries, failures


def coplanar_summary(specs):
    per = {s["id"]: conflict_report(build_piece(s).boxes) for s in specs}
    seps = [r["min_sep_mm"] for r in per.values() if r["min_sep_mm"] is not None]
    return {"piecesWithRaw": sum(1 for r in per.values() if r["raw"]), "raw": sum(r["raw"] for r in per.values()),
            "culled": sum(r["culled"] for r in per.values()), "unresolved": sum(r["unresolved"] for r in per.values()),
            "unresolvedPieces": sorted(k for k, r in per.items() if r["unresolved"]),
            "offsetPairs": sum(len(r["seps"]) for r in per.values()),
            "offsetPairsBelow0p25mm": sum(1 for r in per.values() for x in r["seps"] if x < 0.25 - 1e-9),
            "maxOffsetMm": max(max(box_offsets(build_piece(s).boxes)) for s in specs) * 1000.0,
            "minSeparationMm": round(min(seps), 5) if seps else None}


def write_manifest(out, revision, entries):
    manifest = {"schema": SCHEMA, "revision": revision, "frame": FRAME, "slots": SLOTS,
                "pieces": {k: entries[k] for k in sorted(entries)}}
    (out / "manifest.json").write_text(json.dumps(manifest, indent=1, sort_keys=True) + "\n")
    return manifest


# ------------------------------------------------------------------------------ verification
def clear_scene():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob)
    for me in list(bpy.data.meshes):
        bpy.data.meshes.remove(me)


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    return [o for o in bpy.data.objects if o not in before]


def verify(out, manifest, specs):
    """Re-import every GLB: triangle count, material names and bounds (in Blender Z-up) must match."""
    problems = []
    for spec in specs:
        e = manifest["pieces"].get(spec["id"])
        if e is None:
            problems.append(f"{spec['id']}: missing from manifest")
            continue
        path = out / e["file"]
        if hashlib.sha256(path.read_bytes()).hexdigest() != e["sha256"]:
            problems.append(f"{spec['id']}: sha256 mismatch")
        obs = [o for o in import_glb(path) if o.type == "MESH"]
        if len(obs) != 1:
            problems.append(f"{spec['id']}: {len(obs)} mesh objects")
        else:
            me = obs[0].data
            me.calc_loop_triangles()
            if len(me.loop_triangles) != e["triangles"]:
                problems.append(f"{spec['id']}: re-import {len(me.loop_triangles)} tris != {e['triangles']}")
            names = sorted({m.name.split(".")[0] for m in me.materials if m}, key=SLOTS.index)
            if names != e["slots"]:
                problems.append(f"{spec['id']}: re-import materials {names} != {e['slots']}")
            mw = obs[0].matrix_world
            cs = [mw @ Vector(c) for c in obs[0].bound_box]
            got = [min(c[i] for c in cs) for i in range(3)] + [max(c[i] for c in cs) for i in range(3)]
            want = [v * T for v in e["bounds"]]
            if max(abs(a - b) for a, b in zip(got, want)) > INFLATE_CAP_M + 1e-4:   # offsets move faces < 0.5 mm
                problems.append(f"{spec['id']}: re-import bounds {[round(v, 4) for v in got]} != {want}")
        clear_scene()
    return problems


# ------------------------------------------------------------------------------ contact sheet
def label_material():
    m = bpy.data.materials.new("sheet-label")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (0.92, 0.93, 0.96, 1.0)
    em.inputs["Strength"].default_value = 1.0
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(em.outputs[0], out.inputs[0])
    return m


def render_sheet(out, manifest, specs, sheet_path, samples, cols=10, sx=5.0, sy=6.2, elev_deg=40.0, width=2400):
    clear_scene()
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE_NEXT"
    sc.eevee.taa_render_samples = samples
    for attr, val in (("use_shadows", True), ("use_raytracing", False)):
        if hasattr(sc.eevee, attr):
            setattr(sc.eevee, attr, val)
    sc.view_settings.view_transform = "AgX"
    world = bpy.data.worlds.new("sheet") if sc.world is None else sc.world
    sc.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.055, 0.06, 0.075, 1.0)
    world.node_tree.nodes["Background"].inputs[1].default_value = 1.0
    for name, energy, rot, col in (("Key", 3.4, (38, -14, -35), (1.0, 0.95, 0.88)), ("Fill", 0.9, (60, 10, 150), (0.6, 0.55, 1.0))):
        L = bpy.data.objects.new(name, bpy.data.lights.new(name, "SUN"))
        sc.collection.objects.link(L)
        L.data.energy, L.data.color = energy, col
        L.rotation_euler = tuple(math.radians(v) for v in rot)
    e = math.radians(elev_deg)
    fwd = Vector((0.0, -math.cos(e), -math.sin(e)))
    rot = fwd.to_track_quat("-Z", "Y")
    right = rot @ Vector((1, 0, 0))
    up = rot @ Vector((0, 1, 0))
    lab = label_material()
    pts = []
    for n, spec in enumerate(specs):
        r, c = divmod(n, cols)
        cx, cy = -c * sx, r * sy
        obs = [o for o in import_glb(out / manifest["pieces"][spec["id"]]["file"]) if o.type == "MESH"]
        b = manifest["pieces"][spec["id"]]["bounds"]
        mx, my = (b[0] + b[3]) / 2 * T, (b[1] + b[4]) / 2 * T
        for o in obs:
            o.location = Vector((cx - mx, cy - my, 0.0)) + o.location
        bpy.context.view_layer.update()
        pts += [o.matrix_world @ Vector(k) for o in obs for k in o.bound_box]
        cu = bpy.data.curves.new(f"lab-{spec['id']}", "FONT")
        cu.body, cu.size, cu.align_x = spec["id"], 0.30, "CENTER"
        t = bpy.data.objects.new(f"lab-{spec['id']}", cu)
        t.data.materials.append(lab)
        sc.collection.objects.link(t)
        t.rotation_euler = rot.to_euler()
        base = Vector((cx, cy + sy * 0.42, 0.0))
        t.location = base - fwd * 60.0          # toward the (orthographic) camera: never hidden by nearer rows
        pts.append(base - up * 0.4)
    cam = bpy.data.objects.new("SheetCam", bpy.data.cameras.new("SheetCam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.data.type, cam.data.sensor_fit = "ORTHO", "HORIZONTAL"
    us = [p.dot(right) for p in pts]
    vs = [p.dot(up) for p in pts]
    pad = 1.0
    u0, u1, v0, v1 = min(us) - pad, max(us) + pad, min(vs) - pad, max(vs) + pad
    centre = right * ((u0 + u1) / 2) + up * ((v0 + v1) / 2)
    cam.location = centre - fwd * 200.0
    cam.rotation_euler = rot.to_euler()
    cam.data.ortho_scale = u1 - u0
    cam.data.clip_end = 1000.0
    sc.render.resolution_x = width
    sc.render.resolution_y = int(math.ceil(width * (v1 - v0) / (u1 - u0)))
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "PNG"
    sc.render.filepath = str(sheet_path)
    Path(sheet_path).parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.render.render(write_still=True)
    return sc.render.resolution_x, sc.render.resolution_y


# ------------------------------------------------------------------------------ main
def main():
    a = parse_args()
    t0 = time.time()
    doc = json.loads(resolve(a.pieces).read_text())
    assert doc["schema"] == "sidereal.ship-kit-pieces.v1", doc["schema"]
    assert list(doc["slots"]) == SLOTS, f"slot order mismatch: {doc['slots']} != {SLOTS}"
    specs = doc["pieces"]
    ids = [s["id"] for s in specs]
    assert len(ids) == len(set(ids)), "duplicate piece ids"
    only = {s for s in a.only.split(",") if s}
    unknown = only - set(ids)
    assert not unknown, f"--only ids not in the piece list: {sorted(unknown)}"
    out = resolve(a.out)
    out.mkdir(parents=True, exist_ok=True)
    clear_scene()
    mpath = out / "manifest.json"
    prior = json.loads(mpath.read_text())["pieces"] if mpath.exists() and (only or a.skip_export) else {}
    prior = {k: v for k, v in prior.items() if k in set(ids)}
    failures = []
    if a.skip_export:
        manifest = json.loads(mpath.read_text())
    else:
        entries, failures = export_all(specs, out, only, prior)
        if not only:
            for stale in sorted(set(p.name for p in out.glob("*.glb")) - {f"{i}.glb" for i in ids}):
                (out / stale).unlink()
        manifest = write_manifest(out, doc["revision"], entries)
    t_export = time.time() - t0
    check = [s for s in specs if not only or s["id"] in only]
    problems = failures + verify(out, manifest, check)
    t_verify = time.time() - t0 - t_export
    fam = {}
    for s in specs:
        e = manifest["pieces"].get(s["id"])
        if e:
            f = fam.setdefault(s["family"], [0, 0, 0])
            f[0] += 1
            f[1] += e["triangles"]
            f[2] += (out / e["file"]).stat().st_size
    summary = {
        "pieces": len(manifest["pieces"]), "specs": len(specs),
        "triangles": sum(e["triangles"] for e in manifest["pieces"].values()),
        "glbBytes": sum((out / e["file"]).stat().st_size for e in manifest["pieces"].values()),
        "voxelAligned": sum(1 for e in manifest["pieces"].values() if e["voxelAligned"]),
        "families": {k: {"pieces": v[0], "triangles": v[1], "bytes": v[2]} for k, v in sorted(fam.items())},
        "maxTriangles": max(((e["triangles"], k) for k, e in manifest["pieces"].items()), default=None),
        "coplanar": coplanar_summary(specs),
        "exportSeconds": round(t_export, 1), "verifySeconds": round(t_verify, 1), "problems": problems,
    }
    if a.sheet:
        t1 = time.time()
        summary["sheet"] = {"path": a.sheet, "resolution": render_sheet(out, manifest, specs, resolve(a.sheet), a.sheet_samples),
                            "seconds": round(time.time() - t1, 1)}
    print("SHIP_KIT_SUMMARY " + json.dumps(summary, sort_keys=True))
    if problems:
        print("\n".join("PROBLEM " + p for p in problems))
        sys.exit(1)


if __name__ == "__main__":
    main()
