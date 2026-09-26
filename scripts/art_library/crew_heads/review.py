"""Review renders: contact sheets laid out like the reference sheets (Blender side).

Each sheet renders one image of a grid of assembled heads and writes <sheet>.layout.json with the pixel
box of every tile, so compose.py (Pillow) can add labels and exact reference crops side by side.
"""
from __future__ import annotations

import json
import math
import os

import bpy

import kit
import look
from vox import V

HAIR_ORDER = ["full", "cap", "fringe", "hidden"]
BROW_SHADE = 0.6          # keep in step with BROW_SHADE in packages/content/src/crew-heads.ts


def shade(hexstr, f):
    n = int(hexstr.lstrip("#"), 16)
    return "#" + "".join(f"{round(((n >> s) & 255) * f):02x}" for s in (16, 8, 0))


def mix(a, b, t):
    na, nb = int(a.lstrip("#"), 16), int(b.lstrip("#"), 16)
    return "#" + "".join(f"{round(((na >> s) & 255) * (1 - t) + ((nb >> s) & 255) * t):02x}" for s in (16, 8, 0))


def by_id(items):
    return {i["id"]: i for i in items}


def palette_hex(cat, kind, pid, fallback):
    for p in cat["palettes"][kind]:
        if p["id"] == pid:
            return ("emit:" + p["hex"]) if p.get("emissive") else p["hex"]
    return fallback


def resolve(cat, spec):
    """Mirror of resolveHeadLoadout() in packages/content/src/crew-heads.ts (review only)."""
    acc = by_id(cat["accessories"])
    hel = by_id(cat["helmets"])
    msk = by_id(cat["masks"])
    det = by_id(cat["details"])
    base = spec.get("baseFace", "male_adult")
    expr = by_id(cat["expressions"])[spec.get("expression", "neutral")]
    wearing = [acc[a] for a in spec.get("accessories", [])]
    if spec.get("helmet"):
        wearing.append(hel[spec["helmet"]])
    if spec.get("mask"):
        wearing.append(msk[spec["mask"]])
    mode = "full"
    hides = set()
    for w in wearing:
        m = w.get("hairMode", "full")
        if HAIR_ORDER.index(m) > HAIR_ORDER.index(mode):
            mode = m
        hides |= set(w.get("hides", []))
    skin = palette_hex(cat, "skin", spec.get("skin", "tan"), "#b8774f")
    hair = palette_hex(cat, "hair", spec.get("hairColor", "dark_brown"), "#4d3024")
    fh = palette_hex(cat, "hair", spec.get("facialHairColor") or spec.get("hairColor", "dark_brown"), hair)
    eye = palette_hex(cat, "eye", spec.get("eyes", "brown"), "#6b3f22")
    base_pal = {"skin": skin, "hair": hair, "eye": eye}
    face_pal = {**base_pal, "emit": "soft:" + cat["faceSlotDefaults"]["emit"],
                "accent": mix(skin, cat["blush"]["hex"], cat["blush"]["amount"])}
    theme = spec.get("theme", {})
    nodes = [(f"head.{base}", face_pal)]
    nodes.append((f"face.{base}.eyes.{expr['eyes']}", face_pal))
    nodes.append((f"face.{base}.brows.{expr['brows']}", {**face_pal, "hair": shade(fh, BROW_SHADE)}))
    if "mouth" not in hides:
        nodes.append((f"face.{base}.mouth.{expr['mouth']}", face_pal))
    if spec.get("hair") and mode != "hidden":
        nodes.append((f"hair.{spec['hair']}.{mode}", base_pal))
    if spec.get("facialHair") and "facialHair" not in hides:
        nodes.append((f"facialhair.{spec['facialHair']}", {**base_pal, "hair": fh}))
    for d in spec.get("details", []):
        nodes.append((f"detail.{d}", {**base_pal, **det[d].get("slotDefaults", {})}))
    for a in spec.get("accessories", []):
        nodes.append((f"acc.{a}", {**base_pal, **acc[a].get("slotDefaults", {}), **theme}))
    if spec.get("helmet"):
        h = hel[spec["helmet"]]
        nodes.append((f"helmet.{h['id']}", {**base_pal, **h.get("slotDefaults", {}), **theme}))
        if spec.get("visor") and spec["visor"] in h["visors"]:
            v = by_id(cat["visors"])[spec["visor"]]
            nodes.append((f"visor.{h['id']}.{v['id']}", {**base_pal, **h.get("slotDefaults", {}), **theme, "glass": v["glass"]}))
    if spec.get("mask"):
        m = msk[spec["mask"]]
        nodes.append((f"mask.{m['id']}", {**base_pal, **m.get("slotDefaults", {}), **theme}))
    return nodes


def place(cat, lib, coll, spec, loc, rot_z, collar=True, tilt=(0.0, 0.0)):
    obs = []
    for node, pal in resolve(cat, spec):
        if node in lib.objects:
            obs.append(lib.inst(node, coll, loc, rot_z, pal, tilt))
    if collar:
        kit.collar(coll, loc, rot_z)
    return obs


# =========================================================================== sheet rendering
def render_sheet(cat, lib, out, name, rows, samples, tile=(0.84, 1.24), px=150, yaw=24.0, pitch=14.0, collar=True, dist=12):
    """rows: [(row_label, [(tile_label, spec), ...]), ...]. Heads face the camera turned `yaw` degrees."""
    sc = bpy.context.scene
    coll = bpy.data.collections.new(f"SHEET_{name}")
    sc.collection.children.link(coll)
    ncol = max(len(r[1]) for r in rows)
    tw, th = tile
    placed = []
    for r, (rlabel, tiles) in enumerate(rows):
        for c, (tlabel, spec) in enumerate(tiles):
            x, z = c * tw, -r * th
            # a slight, varied head tilt so portraits feel alive (preview only; the rig owns real poses)
            k = (r * 7 + c * 3) % 5 - 2
            tilt = (math.radians(-3.0 + (c % 2) * 2.0), math.radians(k * 2.5))
            place(cat, lib, coll, spec, (x, 0, z), math.radians(yaw + 180.0 + k * 3.0), collar=collar, tilt=tilt)   # parts face +Y
            placed.append((r, c, tlabel, (x, 0, z), spec.get("_ref")))
    cam = sc.camera
    width_m, height_m = ncol * tw, len(rows) * th
    sc.render.resolution_x = int(ncol * px)
    sc.render.resolution_y = int(len(rows) * px * th / tw)
    cx, cz = (ncol - 1) * tw / 2, -(len(rows) - 1) * th / 2 + 0.22
    p = math.radians(pitch)
    look.aim(cam, (cx, 0, cz), (0, -dist * math.cos(p), dist * math.sin(p)), ortho=max(width_m, height_m * sc.render.resolution_x / sc.render.resolution_y))
    for other in sc.collection.children:
        if other.name.startswith("SHEET_"):
            other.hide_render = other is not coll
    sc.eevee.taa_render_samples = samples
    path = os.path.join(out, f"{name}.raw.png")
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    layout = {"image": f"{name}.raw.png", "size": [sc.render.resolution_x, sc.render.resolution_y], "rows": [r[0] for r in rows],
              "tiles": []}
    for r, c, tlabel, (x, y, z), ref in placed:
        cxp, cyp = kit.project(sc, cam, (x, 0, z + 0.22))
        w = px
        h = px * th / tw
        layout["tiles"].append({"row": r, "col": c, "label": tlabel, "ref": ref, "box": [cxp - w / 2, cyp - h / 2, cxp + w / 2, cyp + h / 2]})
    with open(os.path.join(out, f"{name}.layout.json"), "w") as fh:
        json.dump(layout, fh, indent=1)
    print(f"rendered sheet {name}", flush=True)
    return layout


# Reference tile -> native combination (hair style, hair colour, skin) for the base-face rows.
BASE_MALE = [("spiked_quiff", "violet", "rose"), ("side_undercut", "copper", "porcelain"), ("close_crop", "black", "brown"),
             ("pompadour", "crimson", "porcelain"), ("broad_spikes", "blonde", "sand"), ("short_waves", "espresso", "bronze"),
             ("short_spikes", "black", "tan"), ("flat_top", "chestnut", "sand"), ("swept_quiff", "silver", "rose"),
             ("short_waves", "plum", "deep"), ("curly_top", "ginger", "porcelain"), ("broad_spikes", "grey", "bronze")]
BASE_FEMALE = [("side_bob", "black", "tan"), ("blunt_bob", "navy", "brown"), ("layered_bob", "crimson", "porcelain"),
               ("long_side_fringe", "blonde", "rose"), ("side_bob", "violet", "deep"), ("gathered_fringe", "purple", "porcelain"),
               ("long_bob", "pink", "porcelain"), ("high_bun", "black", "brown"), ("messy_bun", "auburn", "tan"),
               ("silver_bob", "silver", "porcelain"), ("long_gathered", "crimson", "rose"), ("long_straight", "plum", "bronze")]
HAIR_COLOUR = {"spiked_quiff": "black", "swept_quiff": "blonde", "pompadour": "espresso", "short_spikes": "black",
               "pointed_quiff": "auburn", "short_waves": "navy", "close_crop": "black", "tall_crest": "black", "mohawk": "crimson",
               "side_undercut": "honey", "hanging_locks": "black", "flat_top": "chestnut", "broad_spikes": "espresso",
               "curly_top": "chestnut", "afro": "black", "side_bob": "violet", "layered_bob": "auburn", "straight_bob": "black",
               "long_side_fringe": "blonde", "high_bun": "black", "long_gathered": "crimson", "gathered_fringe": "purple",
               "long_bob": "pink", "messy_bun": "copper", "blunt_bob": "navy", "long_straight": "plum", "silver_bob": "white",
               "topknot_sweep": "chestnut"}
HAIR_SKIN = ["rose", "porcelain", "tan", "sand", "porcelain", "bronze", "brown", "sand", "porcelain", "rose", "brown", "sand", "rose",
             "tan", "deep"]
FEMALE_GROUPS = ("medium", "long", "updo")


def sheets(cat):
    """Sheet definitions keyed by name, arranged like the reference sheet sections. Specs use catalog ids only."""
    s = {}
    helmet_visors = ["clear", "tinted", "hud", "mirrored", "ar", "clear", "hud", "tinted"]
    s["00_progress"] = [
        ("Base faces", [(b["label"], {"baseFace": b["id"], "hair": h, "hairColor": c, "skin": k, "expression": e})
                        for b, (h, c, k), e in zip(cat["baseFaces"], BASE_MALE[:4] + BASE_FEMALE[:4],
                                                  ["neutral", "happy", "determined", "neutral", "happy", "neutral", "wink", "neutral"])]),
        ("Hair A", [(f"{h} / {c}", {"baseFace": "male_adult", "hair": h, "hairColor": c, "skin": k}) for h, c, k in BASE_MALE[4:12]]),
        ("Hair B", [(f"{h} / {c}", {"baseFace": "female_adult", "hair": h, "hairColor": c, "skin": k}) for h, c, k in BASE_FEMALE[4:12]]),
        ("Helmets", [(f"{h['label']} / {v if h['visors'] else 'open'}", {"baseFace": "male_adult", "hair": "short_waves", "hairColor": "espresso",
                      "skin": "sand", "helmet": h["id"], "visor": v if h["visors"] else None})
                     for h, v in zip(cat["helmets"][:8], helmet_visors)]),
    ]
    s["01_base_faces"] = [
        ("Male", [(f"M{i + 1:02d}", {"baseFace": "male_adult", "hair": h, "hairColor": c, "skin": k}) for i, (h, c, k) in enumerate(BASE_MALE)]),
        ("Female", [(f"F{i + 1:02d}", {"baseFace": "female_adult", "hair": h, "hairColor": c, "skin": k}) for i, (h, c, k) in enumerate(BASE_FEMALE)]),
    ]
    s["02_age"] = [
        ("Male", [("Young", {"baseFace": "male_young", "hair": "short_spikes", "hairColor": "chestnut", "skin": "tan"}),
                  ("Adult", {"baseFace": "male_adult", "hair": "swept_quiff", "hairColor": "blonde", "skin": "sand"}),
                  ("Middle aged", {"baseFace": "male_middle", "hair": "swept_quiff", "hairColor": "grey", "skin": "rose", "facialHair": "moustache"}),
                  ("Older", {"baseFace": "male_older", "hair": "close_crop", "hairColor": "white", "skin": "rose", "facialHair": "short_beard"})]),
        ("Female", [("Young", {"baseFace": "female_young", "hair": "straight_bob", "hairColor": "espresso", "skin": "porcelain"}),
                    ("Adult", {"baseFace": "female_adult", "hair": "long_side_fringe", "hairColor": "copper", "skin": "rose"}),
                    ("Middle aged", {"baseFace": "female_middle", "hair": "long_straight", "hairColor": "silver", "skin": "porcelain"}),
                    ("Older", {"baseFace": "female_older", "hair": "high_bun", "hairColor": "white", "skin": "rose"})]),
    ]
    s["03_skin"] = [("Skin tones", [(p["label"], {"baseFace": "male_adult", "hair": "short_waves", "hairColor": "espresso", "skin": p["id"]})
                                    for p in cat["palettes"]["skin"]])]
    s["04_eyes"] = [("Eye colours", [(p["label"], {"baseFace": "male_adult", "hair": "short_waves", "hairColor": "espresso", "skin": "tan",
                                                   "eyes": p["id"]}) for p in cat["palettes"]["eye"]])]
    male = [h for h in cat["hairStyles"] if h["group"] not in FEMALE_GROUPS]
    female = [h for h in cat["hairStyles"] if h["group"] in FEMALE_GROUPS]
    s["05_hair_short"] = [("Short styles", [(h["label"], {"baseFace": "male_adult", "hair": h["id"], "hairColor": HAIR_COLOUR[h["id"]],
                                                          "skin": HAIR_SKIN[i % len(HAIR_SKIN)]}) for i, h in enumerate(male)])]
    s["06_hair_long"] = [("Medium / long / updo", [(h["label"], {"baseFace": "female_adult", "hair": h["id"], "hairColor": HAIR_COLOUR[h["id"]],
                                                                 "skin": HAIR_SKIN[(i + 3) % len(HAIR_SKIN)]}) for i, h in enumerate(female)])]
    fh = [("Clean", {"baseFace": "male_adult", "hair": "short_waves", "hairColor": "dark_brown", "skin": "tan"})]
    for f in cat["facialHair"]:
        spec = {"baseFace": "male_adult", "hair": "short_waves", "hairColor": "dark_brown", "skin": "tan", "facialHair": f["id"]}
        if f["id"] == "long_beard":
            spec.update(baseFace="male_older", hairColor="silver", skin="rose", hair="swept_quiff")
        fh.append((f["label"], spec))
    fh.append(("Grey (colour)", {"baseFace": "male_older", "hair": "close_crop", "hairColor": "grey", "skin": "bronze", "facialHair": "full_beard"}))
    s["07_facial_hair"] = [("Facial hair", fh)]
    s["08_details"] = [("Facial details", [(d["label"], {"baseFace": "male_adult", "hair": "short_waves", "hairColor": "chestnut", "skin": "sand",
                                                         "details": [d["id"]]}) for d in cat["details"]])]
    s["09_accessories"] = [("Accessories", [(a["label"], {"baseFace": "male_adult", "hair": "short_waves", "hairColor": "espresso",
                                                          "skin": HAIR_SKIN[i % len(HAIR_SKIN)], "accessories": [a["id"]]})
                                            for i, a in enumerate(cat["accessories"])])]
    s["10_specialty"] = [("Specialty looks", [(p["label"], dict(p["look"])) for p in cat["presets"]])]
    s["11_expressions"] = [("Expressions", [(e["label"], {"baseFace": "male_adult", "hair": "short_waves", "hairColor": "espresso", "skin": "sand",
                                                          "expression": e["id"]}) for e in cat["expressions"]]),
                           ("Female", [(e["label"], {"baseFace": "female_adult", "hair": "side_bob", "hairColor": "violet", "skin": "rose",
                                                     "expression": e["id"]}) for e in cat["expressions"]])]
    closed = [h for h in cat["helmets"] if h["visors"]]
    rows = [("Helmets", [(h["label"], {"baseFace": "male_adult", "hair": "short_waves", "hairColor": "espresso", "skin": "sand",
                                       "helmet": h["id"], "visor": "clear" if h["visors"] else None}) for h in cat["helmets"]])]
    for v in cat["visors"]:
        rows.append((v["label"], [(h["label"], {"baseFace": "male_adult", "skin": "sand", "helmet": h["id"], "visor": v["id"]}) for h in closed]))
    theme_rows = [("#e8e6ef", "#3a4466"), ("#6b8fd8", "#27325a"), ("#e86a2a", "#2a2e3c"), ("#2d6ee6", "#1c2548"), ("#a8d22a", "#2c3a18"),
                  ("#f0f0f6", "#d8285a"), ("#d84ad8", "#3a1a48"), ("#3a3e4c", "#e0283c")]
    rows.append(("Colourways", [(f"theme {i + 1}", {"baseFace": "male_adult", "skin": "sand", "helmet": "closed", "visor": "tinted" if i % 2 else "clear",
                                                   "theme": {"suit_primary": p, "suit_secondary": q}}) for i, (p, q) in enumerate(theme_rows)]))
    rows.append(("Masks", [("Oxygen mask", {"baseFace": "male_adult", "hair": "short_waves", "hairColor": "espresso", "skin": "sand", "mask": "oxygen_mask"}),
                           ("Rebreather", {"baseFace": "female_adult", "hair": "side_bob", "hairColor": "violet", "skin": "rose", "mask": "rebreather"}),
                           ("Open + oxygen", {"baseFace": "male_adult", "hair": "short_waves", "hairColor": "espresso", "skin": "tan", "helmet": "open",
                                              "mask": "oxygen_mask"}),
                           ("Open + rebreather", {"baseFace": "female_adult", "hair": "long_bob", "hairColor": "pink", "skin": "porcelain",
                                                  "helmet": "open", "mask": "rebreather"})]))
    s["12_helmets"] = rows
    s["13_hair_under_headwear"] = [(h, [(m, {"baseFace": "female_adult" if h in ("long_bob", "high_bun") else "male_adult", "hair": h,
                                             "hairColor": HAIR_COLOUR[h], "skin": "tan", **({"accessories": [a]} if a else {}),
                                             **({"helmet": hm, "visor": "clear"} if hm else {})})
                                        for m, a, hm in (("Full", None, None), ("Cap", "cap", None), ("Beanie", "beanie", None),
                                                         ("Cowboy", "cowboy_hat", None), ("Hood", "hood", None), ("Open helmet", None, "open"),
                                                         ("Closed helmet", None, "closed"))])
                                   for h in ("spiked_quiff", "afro", "long_bob", "high_bun")]
    return s


LAYOUT = {  # tile size (m) and pixels per tile column
    "04_eyes": dict(tile=(0.7, 1.05), px=190),
    "09_accessories": dict(tile=(0.98, 1.3), px=140),
    "10_specialty": dict(tile=(0.94, 1.3), px=150),
    "12_helmets": dict(tile=(0.9, 1.26), px=140),
    "13_hair_under_headwear": dict(tile=(0.98, 1.3), px=150),
}


def render_all(cat, lib, out, only, samples):
    os.makedirs(out, exist_ok=True)
    sc = bpy.context.scene
    look.stage(sc, samples)
    for name, rows in sheets(cat).items():
        if only and name not in only:
            continue
        render_sheet(cat, lib, out, name, rows, samples, **LAYOUT.get(name, {}))
