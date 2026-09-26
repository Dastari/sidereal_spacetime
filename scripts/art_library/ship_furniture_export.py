"""Headless Blender exporter for prefab-ship deck furniture (lockers, crates, seats, banks...).

Deck object sockets derived by ``packages/content/src/ship-prefab.ts`` (room types in
``construction-grammar.v1.json``) are drawn with these GLBs when no ship-component GLB fits
(see ``packages/content/src/ship-furniture.ts``). Same studless brick language, nine slot-named
materials and orion base palette as the SHIPS-COMPONENTS r002 export, whose helpers are reused.

Frame: interior convention of the component export, i.e. centred on the socket footprint, origin
on the floor, +X along the socket width, +Y out of the wall into the room (the "front"), +Z up.
Sizes are the grammar socket sizes in texels (1/16 m).

Run (headless only):
  nice -n 15 blender -b --factory-startup --python-exit-code 1 -t 2 \
      -P scripts/art_library/ship_furniture_export.py -- [--out assets/runtime/ship-furniture/r001] [--only id,id]

All art here is a PROPOSAL; nothing is owner-approved.
"""
import argparse
import json
import math
import sys
from pathlib import Path

import bpy

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import ship_component_export as E  # noqa: E402  (loads the kit + r002 art helpers; main() is guarded)

K, A = E.K, E.A
ROOT = E.ROOT
REVISION = "r001"


def locker(w, d, h):
    p = K.Piece("f.wall-locker", "equipment", "interior", (w, d, h))
    p.b(0, 0, 0, w, d - 1, 2, "dark")                                         # plinth
    p.b(0, 0, 2, w, d - 1, h - 1, "primary")                                  # body
    p.b(0, 0, h - 1, w, d, h, "secondary")                                    # cap
    half = w // 2
    for x0, x1 in ((1, half), (half, w - 1)):                                 # two doors, seam between
        p.b(x0, d - 1, 3, x1 - (1 if x0 == 1 else 0), d, h - 2, "secondary")
        p.b(x0 + 1, d - 1, h - 9, x1 - 1 - (1 if x0 == 1 else 0), d + 0, h - 5, "trim")
        for z in range(6, 14, 2):                                             # vent louvres
            p.b(x0 + 1, d - 1, z, x1 - 2, d, z + 1, "dark")
    p.b(half - 2, d, 14, half - 1, d + 1, 18, "metal").b(half + 1, d, 14, half + 2, d + 1, 18, "metal")  # handles
    p.b(1, d - 1, h - 3, 3, d, h - 2, "emit_a")                               # status light
    p.b(w - 3, d - 1, h - 3, w - 1, d, h - 2, "accent")
    return p


def crate(w, d, h):
    p = K.Piece("f.cargo-crate", "cargo", "interior", (w, d, h))
    p.b(1, 1, 1, w - 1, d - 1, h - 1, "primary")
    for (x0, x1) in ((0, 2), (w - 2, w)):                                     # corner posts
        for (y0, y1) in ((0, 2), (d - 2, d)):
            p.b(x0, y0, 0, x1, y1, h, "trim")
    for z0, z1 in ((0, 2), (h - 2, h)):                                       # edge rails
        p.b(0, 0, z0, w, 2, z1, "trim").b(0, d - 2, z0, w, d, z1, "trim")
        p.b(0, 0, z0, 2, d, z1, "trim").b(w - 2, 0, z0, w, d, z1, "trim")
    p.b(2, 0, h // 2 - 1, w - 2, d, h // 2 + 1, "accent")                     # band
    p.b(4, d - 1, 4, w - 4, d, 6, "secondary")
    p.b(w // 2 - 1, d - 1, h - 5, w // 2 + 1, d, h - 3, "emit_b")             # tag light
    return p


def fluid(w, d, h):
    p = K.Piece("f.cargo-fluid", "cargo", "interior", (w, d, h))
    p.b(0, 0, 0, w, d, 2, "trim")
    p.disc("z", w // 2, d // 2, w // 2 - 1, 2, h - 2, "primary")
    p.disc("z", w // 2, d // 2, w // 2, 5, 7, "secondary")
    p.disc("z", w // 2, d // 2, w // 2, h - 7, h - 5, "secondary")
    p.disc("z", w // 2, d // 2, w // 2 - 4, h - 2, h, "metal")
    for x0, y0 in ((0, 0), (w - 2, 0), (0, d - 2), (w - 2, d - 2)):
        p.b(x0, y0, 2, x0 + 2, y0 + 2, h - 1, "trim")
    p.b(w // 2 - 1, d - 2, h // 2, w // 2 + 1, d, h // 2 + 3, "emit_a")        # gauge
    return p


def bank(w, d, h):
    p = K.Piece("f.bridge-bank", "equipment", "interior", (w, d, h))
    p.b(0, 0, 0, w, d, 2, "dark")
    p.b(0, 0, 2, w, d - 2, 10, "primary")
    p.b(0, 0, 10, w, d, 11, "secondary")                                      # desk lip
    for x in range(2, w - 2, 4):
        p.b(x, d - 2, 11, x + 3, d, 12, "metal")                              # keys
    p.b(0, 0, 11, w, 2, h, "secondary")                                       # screen back
    for i, (x0, x1) in enumerate(((1, w // 3), (w // 3 + 1, 2 * w // 3), (2 * w // 3 + 1, w - 1))):
        A.screen(p, x0, x1, 1, 11, h, "emit_a" if i != 1 else "emit_b", ("bank", i), K)
    for x in (0, w - 1):
        p.b(x, 0, 2, x + 1, d - 2, 10, "secondary")
    A.greeble(K, p, ("bank",), slots=("primary",), min_face=7, lights=0.0, skip_top=True)
    return p


def seat(w, d, h):
    """Pilot seat: occupant faces +Y (fore when the socket faces fore)."""
    p = K.Piece("f.pilot-seat", "equipment", "interior", (w, d, h))
    c = w // 2
    p.b(c - 2, c - 2, 0, c + 2, c + 2, 1, "trim")                             # foot
    p.b(c - 1, c - 1, 1, c + 1, c + 1, 6, "metal")                            # post
    p.b(0, 1, 6, w, d, 8, "secondary")                                        # seat pan
    p.b(1, 2, 8, w - 1, d - 1, 9, "accent")                                   # cushion
    p.b(0, 0, 8, w, 2, h, "secondary")                                        # back
    p.b(1, 2, 10, w - 1, 3, h - 2, "accent")                                  # back cushion
    p.b(2, 0, h - 2, w - 2, 2, h, "primary")                                  # head rest
    p.b(-1, 3, 8, 0, d - 1, 11, "primary").b(w, 3, 8, w + 1, d - 1, 11, "primary")  # arm rests
    p.b(w, d - 2, 11, w + 1, d - 1, 12, "emit_a")                             # arm controls
    return p


def sofa(w, d, h):
    p = K.Piece("f.lounge-sofa", "equipment", "interior", (w, d, h))
    p.b(1, 1, 0, w - 1, d - 1, 2, "dark")
    p.b(0, 0, 2, w, d, 6, "secondary")
    for x in range(2, w - 2, (w - 4) // 3):                                   # three cushions
        p.b(x, 4, 6, x + (w - 4) // 3 - 1, d - 1, 8, "accent")
    p.b(0, 0, 6, w, 4, h, "secondary")                                        # back
    p.b(0, 0, 6, 2, d, 10, "primary").b(w - 2, 0, 6, w, d, 10, "primary")     # arms
    p.b(2, 0, 2, w - 2, 1, 3, "emit_b")                                       # underglow strip
    return p


def table(w, d, h):
    p = K.Piece("f.table", "equipment", "interior", (w, d, h))
    p.b(w // 2 - 2, d // 2 - 2, 0, w // 2 + 2, d // 2 + 2, 1, "trim")
    p.b(w // 2 - 1, d // 2 - 1, 1, w // 2 + 1, d // 2 + 1, h - 2, "metal")
    p.b(0, 0, h - 2, w, d, h - 1, "secondary")
    p.b(1, 1, h - 1, w - 1, d - 1, h, "primary")
    p.b(2, 2, h - 1, w - 2, 3, h, "emit_a")
    return p


def kitchen(w, d, h):
    """Galley counter, long axis along Y as the grammar socket (12 x 36)."""
    p = K.Piece("f.kitchen", "equipment", "interior", (w, d, h))
    p.b(0, 0, 0, w, d, 2, "dark")
    p.b(0, 0, 2, w, d, h - 1, "primary")
    p.b(0, 0, h - 1, w, d, h, "metal")                                        # worktop
    for y0 in range(2, d - 2, 8):                                             # drawer fronts
        p.b(w - 1, y0, 3, w, y0 + 6, h - 3, "secondary")
        p.b(w - 1, y0 + 2, h - 5, w, y0 + 4, h - 4, "metal")
    p.b(2, 4, h, w - 2, 12, h + 1, "dark")                                    # hob
    p.b(3, 6, h + 1, 5, 8, h + 2, "emit_b").b(7, 6, h + 1, 9, 8, h + 2, "emit_b")
    p.b(2, d - 12, h, w - 2, d - 4, h + 1, "trim")                            # sink
    return p


def medbed(w, d, h):
    p = K.Piece("f.medical-bed", "equipment", "interior", (w, d, h))
    p.b(2, 2, 0, w - 2, d - 2, 2, "trim")
    p.b(4, 4, 2, w - 4, d - 4, 7, "metal")
    p.b(0, 0, 7, w, d, 9, "primary")
    p.b(1, 1, 9, w - 6, d - 1, 11, "metal")  # mattress
    p.b(w - 6, 1, 9, w - 1, d - 1, 12, "secondary")                            # pillow end
    p.b(0, 0, 9, 1, d, h, "secondary")                                        # foot panel
    p.b(0, 3, h - 3, 1, d - 3, h - 1, "emit_a")                               # vitals strip
    return p


PIECES = {
    # id: (builder, (w, d, h) texels) -- matches the grammar socket sizes
    "wall-locker": (locker, (12, 8, 32)),
    "cargo-crate": (crate, (16, 16, 16)),
    "cargo-fluid": (fluid, (16, 16, 20)),
    "bridge-bank": (bank, (32, 8, 18)),
    "pilot-seat": (seat, (10, 10, 20)),
    "lounge-sofa": (sofa, (40, 14, 14)),
    "table": (table, (24, 16, 12)),
    "kitchen": (kitchen, (12, 36, 16)),
    "medical-bed": (medbed, (30, 16, 14)),
}


def args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--out", default=str(ROOT / "assets/runtime/ship-furniture" / REVISION))
    p.add_argument("--only", default="")
    return p.parse_args(argv)


def main():
    a = args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    only = {s for s in a.only.split(",") if s}
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    coll = bpy.data.collections.new("export")
    sc.collection.children.link(coll)
    mats = E.slot_materials()
    rows = []
    for pid, (builder, (w, d, h)) in PIECES.items():
        if only and pid not in only:
            continue
        piece = builder(w, d, h)
        boxes = E.to_catalog(piece, "interior", 0)
        me = E.boxes_mesh(pid, boxes)
        for m in mats:
            me.materials.append(m)
        ob = bpy.data.objects.new(pid, me)
        coll.objects.link(ob)
        md = ob.modifiers.new("brick", "BEVEL")
        md.width, md.segments, md.limit_method, md.angle_limit = E.BEVEL, 1, "ANGLE", math.radians(30)
        md.harden_normals, md.use_clamp_overlap = True, True
        ob["furnitureId"], ob["status"], ob["frame"] = pid, "proposed", "interior"
        tris, verts, lo, hi, used = E.measure(ob)
        glb = out / f"{pid}.glb"
        bpy.ops.object.select_all(action="DESELECT")
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.export_scene.gltf(filepath=str(glb), export_format="GLB", use_selection=True, export_apply=True,
                                  export_extras=True, export_yup=True, export_cameras=False, export_lights=False,
                                  export_animations=False, export_materials="EXPORT")
        rows.append({"id": pid, "sizeTexels": [w, d, h], "triangles": tris, "vertices": verts,
                     "boundsM": [[round(v, 4) for v in lo], [round(v, 4) for v in hi]],
                     "materialSlotsUsed": [f"slot{i}_{K.SLOTS[i]}" for i in used],
                     "bytes": glb.stat().st_size, "sha256": E.sha256(glb)})
        E.clear_collection(coll)
        print(f"[furniture] {pid:14s} tris={tris:5d}")
    if not only:
        manifest = {
            "schema": "sidereal.ship-furniture-art.v1", "revision": REVISION,
            "status": "proposed; not owner-approved",
            "generator": {"script": str(Path(__file__).resolve().relative_to(ROOT)), "sha256": E.sha256(__file__),
                          "blender": bpy.app.version_string},
            "frame": "interior: centred on the socket footprint, floor origin, +X width, +Y front (into the room), +Z up; glTF +Y up",
            "materialSlots": [f"slot{i}_{s}" for i, s in enumerate(K.SLOTS)],
            "pieces": rows,
        }
        (out / "manifest.json").write_text(json.dumps(manifest, indent=1) + "\n")


if __name__ == "__main__":
    main()
