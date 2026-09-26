"""Compose labelled contact sheets and reference-vs-native comparisons from review renders (Pillow).

Run with the art environment (Pillow): .tools/art/bin/python scripts/art_library/crew_heads/compose.py \
    --review DIR --catalog packages/content/src/crew-heads.v1.json --refs DIR_WITH_EXACT_CROPS --revision r001
The reference crops are exact copies of the art-library crops (see ref_crops/tiles/INDEX.json).
"""
from __future__ import annotations

import argparse
import json
import os

from PIL import Image, ImageDraw, ImageFont

BG = (8, 16, 40)
PANEL = (14, 28, 64)
EDGE = (40, 110, 200)
TEXT = (210, 230, 255)
DIM = (130, 160, 210)
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_R = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

TITLES = {
    "00_progress": "PROGRESS: FACES, HAIR, HELMETS + VISORS",
    "01_base_faces": "1. BASE FACES", "02_age": "2. AGE VARIATIONS", "03_skin": "3. SKIN TONES", "04_eyes": "4. EYE COLOURS",
    "05_hair_short": "5. HAIRSTYLES (SHORT / MALE ROW)", "06_hair_long": "6. HAIRSTYLES (MEDIUM, LONG, UPDO / FEMALE ROW)",
    "07_facial_hair": "7. FACIAL HAIR", "08_details": "8. FACIAL DETAILS", "09_accessories": "9. ACCESSORIES",
    "10_specialty": "10. SPECIALTY / BACKGROUND STYLES", "11_expressions": "11. EXPRESSIONS",
    "12_helmets": "HELMETS, VISORS, MASKS", "14_face_variants": "FACE VARIANTS x AGES (animated pixel-art face canvas)", "13_hair_under_headwear": "HAIR UNDER HEADWEAR (full / cap / fringe / hidden)",
}


def font(size, bold=True):
    return ImageFont.truetype(FONT if bold else FONT_R, size)


def by_label(items):
    return {i["label"]: i for i in items}


def ref_for(cat, name, row, col, label):
    """Exact reference crop id for a native tile (None when the reference sheet has no counterpart)."""
    if name == "00_progress":
        if row == 0:
            v = (cat["faceVariants"] + cat["faceVariants"][:2])[col]
            return f"base-{v['sex']}-head-{col + 1:02d}"
        if row in (1, 2):
            return f"base-{'male' if row == 1 else 'female'}-head-{col + 5:02d}"
        return cat["helmets"][col]["reference"][0]
    if name == "01_base_faces":
        return f"base-{'male' if row == 0 else 'female'}-head-{col + 1:02d}"
    if name == "02_age":
        return f"head-age-{['young', 'adult', 'middle-aged', 'older'][col]}-{'upper' if row == 0 else 'lower'}-row"
    if name == "03_skin":
        p = cat["palettes"]["skin"][col]
        return p["reference"][0] if p.get("reference") else None
    if name == "04_eyes":
        return cat["palettes"]["eye"][col]["reference"][0]
    if name in ("05_hair_short", "06_hair_long"):
        h = by_label(cat["hairStyles"]).get(label)
        return h["reference"][0] if h else None
    if name == "07_facial_hair":
        if label == "Clean":
            return "facial-hair-clean"
        if label.startswith("Grey"):
            return "facial-hair-grey"
        f = by_label(cat["facialHair"]).get(label)
        return f["reference"][0] if f and f["reference"] else None
    if name == "08_details":
        return by_label(cat["details"])[label]["reference"][0]
    if name == "09_accessories":
        return by_label(cat["accessories"])[label]["reference"][0]
    if name == "10_specialty":
        return by_label(cat["presets"])[label]["reference"][0]
    if name == "11_expressions":
        e = by_label(cat["expressions"]).get(label)
        return e["reference"][0] if (e and e["reference"]) else None
    if name == "14_face_variants":
        v = cat["faceVariants"][row]
        return f"head-age-{['young', 'adult', 'middle-aged', 'older'][col]}-{'upper' if v['sex'] == 'male' else 'lower'}-row"
    if name == "12_helmets":
        if row == 0:
            return by_label(cat["helmets"])[label]["reference"][0]
        vis = [v for v in cat["visors"]]
        if 1 <= row <= len(vis):
            return vis[row - 1]["reference"][0] if col == 0 else None
        if row == len(vis) + 1:
            return f"anim--helmet-variant-{col + 1}"
        if row == len(vis) + 2:
            return {0: "eq--oxygen-mask", 1: "eq--rebreather"}.get(col)
    return None


def find_ref(refs, rid):
    if not rid:
        return None
    for f in sorted(os.listdir(refs)):
        if f.startswith(rid) and f.endswith(".png"):
            return os.path.join(refs, f)
    return None


def tiles_of(review, name):
    lay = json.load(open(os.path.join(review, f"{name}.layout.json")))
    img = Image.open(os.path.join(review, lay["image"])).convert("RGB")
    return lay, img


def header(draw, x, y, w, title, sub=None):
    draw.rectangle([x, y, x + w, y + 40], fill=PANEL, outline=EDGE)
    draw.rectangle([x, y, x + 6, y + 40], fill=EDGE)
    draw.text((x + 16, y + 8), title, font=font(20), fill=TEXT)
    if sub:
        tw = draw.textlength(sub, font=font(13, False))
        draw.text((x + w - tw - 12, y + 13), sub, font=font(13, False), fill=DIM)


def labelled(review, name, revision, cat=None, refs=None, compare=False):
    lay, img = tiles_of(review, name)
    rows = lay["rows"]
    ncol = max(t["col"] for t in lay["tiles"]) + 1
    t0 = lay["tiles"][0]["box"]
    tw, th = int(t0[2] - t0[0]), int(t0[3] - t0[1])
    lab_w, lab_h, pad = 150, 22, 6
    ref_h = th if compare else 0
    row_h = th + lab_h + pad + (ref_h + pad if compare else 0)
    W = lab_w + ncol * (tw + pad) + pad
    H = 56 + len(rows) * row_h + 10
    sheet = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(sheet)
    header(d, 0, 0, W - 1, TITLES.get(name, name), f"native {revision} (proposal, unsigned)" + ("  |  top: exact reference crop" if compare else ""))
    for t in lay["tiles"]:
        r, c = t["row"], t["col"]
        x = lab_w + pad + c * (tw + pad)
        y = 50 + r * row_h
        if compare:
            d.rectangle([x, y, x + tw, y + ref_h], fill=(4, 10, 26), outline=(30, 60, 110))
            p = find_ref(refs, ref_for(cat, name, r, c, t["label"]))
            if p:
                ri = Image.open(p).convert("RGB")
                s = min(tw / ri.width, ref_h / ri.height)
                ri = ri.resize((max(1, int(ri.width * s)), max(1, int(ri.height * s))), Image.NEAREST)
                sheet.paste(ri, (x + (tw - ri.width) // 2, y + (ref_h - ri.height) // 2))
            else:
                d.text((x + 8, y + ref_h // 2 - 8), "no reference", font=font(11, False), fill=(90, 110, 150))
            y += ref_h + pad
        crop = img.crop(tuple(int(v) for v in t["box"]))
        d.rectangle([x - 1, y - 1, x + tw, y + th], outline=(26, 52, 100))
        sheet.paste(crop, (x, y))
        lbl = t["label"].upper()
        f = font(11)
        while d.textlength(lbl, font=f) > tw - 4 and f.size > 7:
            f = font(f.size - 1)
        d.text((x + (tw - d.textlength(lbl, font=f)) / 2, y + th + 4), lbl, font=f, fill=TEXT)
    for r, rl in enumerate(rows):
        y = 50 + r * row_h
        if compare:
            d.text((10, y + ref_h // 2 - 8), "REFERENCE", font=font(12), fill=DIM)
            d.text((10, y + ref_h + pad + th // 2 - 8), rl.upper()[:16], font=font(13), fill=TEXT)
        else:
            d.text((10, y + th // 2 - 8), rl.upper()[:16], font=font(13), fill=TEXT)
    return sheet


def library(sheets, revision):
    """Arrange the section sheets like characters-facial-assets.png."""
    rows = [["01_base_faces", "02_age"], ["03_skin", "04_eyes"], ["05_hair_short"], ["06_hair_long"], ["07_facial_hair"],
            ["08_details"], ["09_accessories"], ["10_specialty"], ["11_expressions"]]
    W = 2600
    parts = []
    for row in rows:
        ims = [sheets[n] for n in row if n in sheets]
        if not ims:
            continue
        total = sum(i.width for i in ims) + 12 * (len(ims) - 1)
        s = min(1.0, W / total)
        ims = [i.resize((int(i.width * s), int(i.height * s)), Image.LANCZOS) for i in ims]
        parts.append(ims)
    H = 90 + sum(max(i.height for i in p) + 14 for p in parts)
    out = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(out)
    d.text((24, 18), "SIDEREAL  CREW FACE LIBRARY", font=font(34), fill=TEXT)
    d.text((26, 60), f"Voxel head kit {revision}. 1/32 m voxels, 10 material slots, swappable parts. Proposal: not approved, not live.",
           font=font(15, False), fill=DIM)
    y = 90
    for p in parts:
        x = 0
        for i in p:
            out.paste(i, (x, y))
            x += i.width + 12
        y += max(i.height for i in p) + 14
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--review", required=True)
    ap.add_argument("--catalog", required=True)
    ap.add_argument("--refs", required=True)
    ap.add_argument("--revision", default="r001")
    a = ap.parse_args()
    cat = json.load(open(a.catalog))
    names = sorted(f[:-12] for f in os.listdir(a.review) if f.endswith(".layout.json"))
    plain = {}
    for n in names:
        plain[n] = labelled(a.review, n, a.revision)
        plain[n].save(os.path.join(a.review, f"{n}.png"))
        if n != "13_hair_under_headwear":
            labelled(a.review, n, a.revision, cat, a.refs, compare=True).save(os.path.join(a.review, f"{n}.compare.png"))
        print("composed", n)
    library(plain, a.revision).save(os.path.join(a.review, "head_library.png"))
    print("composed head_library")


if __name__ == "__main__":
    main()
