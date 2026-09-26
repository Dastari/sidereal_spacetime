"""Layered pixel-art face atlases (FACE_ATLAS_SPEC draft v1): 16x16 px canvas, 1 px = 1/32 m voxel.

Run with the art environment (Pillow):
  .tools/art/bin/python scripts/art_library/crew_heads/face_atlas.py --out assets/runtime/crew/heads/v1/face

Writes face-<variant>.png (rows = layers, columns = frames) and face-atlas.json (frame names, expressions,
visemes, blink, looks, per-variant anchors). Canvas orientation is "as seen from the front": column 0 is the
character's RIGHT side, row 0 is the top. Features are drawn for the viewer-left eye/brow and mirrored.
Greyscale layers (iris, brows) are tinted at composite time; everything else carries final colours.
"""
from __future__ import annotations

import argparse
import json
import os

from PIL import Image

N = 16
LAYERS = ["under", "marks", "eyes", "iris", "glint", "brows", "mouth", "over"]   # CHAR-BODY r004 schema
LOOKS = ["c", "l", "r"]          # internal: viewer-left / viewer-right
LOOK_NAME = {"c": "c", "l": "r", "r": "l"}   # published names: r = character right (= viewer-left), l = character left
SCHEMA = "sidereal.crew.face-atlas/1"

DARK = (20, 14, 24, 255)
LID = (40, 24, 30, 255)
SHADE = (70, 30, 30, 70)          # nose / under-hair shadow (translucent)
SHADE2 = (70, 30, 30, 38)
WHITE = (246, 242, 240, 255)
GREY = (255, 255, 255, 255)          # tint mask value
GLINT = (255, 252, 246, 255)
MOUTH = (78, 28, 40, 255)
LIP = (196, 78, 98, 255)
TEETH = (250, 246, 240, 255)
TONGUE = (222, 96, 112, 255)
BLUSH = (255, 84, 110, 120)
BLUSH2 = (255, 70, 100, 175)
TEAR = (120, 196, 255, 230)
SWEAT = (160, 216, 255, 235)
VEIN = (226, 40, 64, 255)
STAR = (255, 226, 96, 255)
ZZ = (236, 240, 255, 235)
LINE = (120, 60, 50, 90)             # age lines (translucent darker skin)
FRECKLE = (150, 72, 48, 150)
PAINT = (36, 52, 120, 220)
SCAR = (176, 60, 64, 200)
DIRT = (74, 52, 38, 120)

# ---------------------------------------------------------------------------------------------- variants
# eye: x = viewer-left eye outer column, w/h size, top row. brow: len, thick, row, arch. mouth: width, row, lip.
VARIANTS = {   # r003: features fill the face like the reference (3x4 eyes, 2 px brows on the eyes, wide mouths)
    "m_classic": dict(label="Masculine, classic", sex="male", eye=dict(x=2, w=3, h=4, top=7, lash=False),
                      brow=dict(x=1, len=4, t=2, row=4, arch=False), mouth=dict(w=2, row=12, lip=False)),
    "m_bold": dict(label="Masculine, bold", sex="male", eye=dict(x=2, w=3, h=3, top=8, lash=False),
                   brow=dict(x=1, len=5, t=2, row=5, arch=False), mouth=dict(w=3, row=12, lip=False)),
    "m_bright": dict(label="Masculine, bright-eyed", sex="male", eye=dict(x=2, w=3, h=5, top=6, lash=False, iris2=True),
                     brow=dict(x=1, len=4, t=2, row=3, arch=False), mouth=dict(w=2, row=12, lip=False)),
    "f_classic": dict(label="Feminine, classic", sex="female", eye=dict(x=2, w=3, h=4, top=7, lash=True),
                      brow=dict(x=2, len=3, t=2, row=4, arch=True), mouth=dict(w=2, row=12, lip=True)),
    "f_bright": dict(label="Feminine, bright-eyed", sex="female", eye=dict(x=2, w=3, h=5, top=6, lash=True, iris2=True),
                     brow=dict(x=2, len=3, t=2, row=3, arch=True), mouth=dict(w=2, row=12, lip=True)),
    "f_sharp": dict(label="Feminine, sharp", sex="female", eye=dict(x=2, w=3, h=3, top=8, lash=True, almond=True),
                    brow=dict(x=1, len=4, t=2, row=5, arch=False), mouth=dict(w=3, row=12, lip=True)),

}

EYE_FRAMES = ["open", "half", "closed", "happy", "wide", "narrow", "sad", "scared", "sleepy", "smug", "hurt", "ko", "wink",
              "confused"]
IRIS_EYES = ["open", "half", "wide", "narrow", "sad", "sleepy", "smug", "wink", "confused"]
BROW_FRAMES = ["neutral", "raised", "raised_high", "angry", "sad", "determined", "confused", "smug", "scared", "sleepy"]
MOUTH_FRAMES = ["none", "neutral", "smile", "grin", "frown", "open", "grimace", "flat", "wavy", "scared", "smug", "small_o", "ko",
                "viseme_A", "viseme_E", "viseme_O", "viseme_MB"]
UNDER_FRAMES = ["none", "blush", "blush_strong"]
AGE_FRAMES = ["none", "middle", "older"]
MARK_FRAMES = ["none", "freckles", "warpaint", "tattoo", "scars", "scratch", "dirt", "birthmark"]
OVER_FRAMES = ["none", "sweat", "tears", "ko", "vein", "zz"]

EXPRESSIONS = {  # eyes, brows, mouth, under, over
    "neutral": ("open", "neutral", "neutral", "blush", "none"),
    "happy": ("open", "raised", "smile", "blush_strong", "none"),
    "sad": ("sad", "sad", "frown", "blush", "tears"),
    "angry": ("narrow", "angry", "grimace", "none", "vein"),
    "surprised": ("wide", "raised_high", "open", "blush", "none"),
    "confused": ("confused", "confused", "wavy", "blush", "sweat"),
    "hurt": ("hurt", "angry", "grimace", "none", "sweat"),
    "determined": ("narrow", "determined", "flat", "none", "none"),
    "scared": ("scared", "scared", "scared", "none", "sweat"),
    "smug": ("smug", "smug", "smug", "blush", "none"),
    "sleepy": ("sleepy", "sleepy", "small_o", "blush", "zz"),
    "knocked_out": ("ko", "sleepy", "ko", "none", "ko"),
    "wink": ("wink", "neutral", "smile", "blush", "none"),
    "grin": ("happy", "raised", "grin", "blush_strong", "none"),
}
VISEMES = {"closed": "neutral", "A": "viseme_A", "E": "viseme_E", "O": "viseme_O", "MB": "viseme_MB"}
BLINK = [{"eyes": "half", "seconds": 1 / 24}, {"eyes": "closed", "seconds": 1 / 24}, {"eyes": "half", "seconds": 1 / 24}]
NO_BLINK = ["happy", "closed", "hurt", "ko", "sleepy", "wink"]


class Canvas:
    def __init__(self):
        self.px = [[(0, 0, 0, 0)] * N for _ in range(N)]

    def set(self, c, r, col):
        if 0 <= c < N and 0 <= r < N:
            self.px[r][c] = col

    def rect(self, c0, r0, w, h, col):
        for r in range(r0, r0 + h):
            for c in range(c0, c0 + w):
                self.set(c, r, col)

    def get(self, c, r):
        return self.px[r][c] if 0 <= c < N and 0 <= r < N else (0, 0, 0, 0)

    def mirrored_copy_from_left(self):
        """Mirror columns 0..7 onto 15..8 (symmetric frames)."""
        for r in range(N):
            for c in range(8):
                if self.px[r][c][3]:
                    self.px[r][15 - c] = self.px[r][c]
        return self


def mirror(c):
    return 15 - c


# ---------------------------------------------------------------------------------------------- eyes
def eye_cells(e, frame, side):
    """Cells of one eye (viewer-left eye = character's right; mirrored for the other).
    r003 reference style: a tall dark block with a white sclera column on the outer side, a dark lid row
    on top, iris in the lower inner pixels and a 1 px glint (see iris_and_glint)."""
    x, w, h, top = e["x"], e["w"], e["h"], e["top"]
    cells = {}

    def put(c, r, col=DARK):
        cells[(c, r)] = col

    def rect(c0, r0, ww, hh, col=DARK):
        for r in range(r0, r0 + hh):
            for c in range(c0, c0 + ww):
                put(c, r, col)

    def block(r0, hh, sclera=True):
        rect(x, r0, w, hh)
        if sclera and hh >= 2:
            for r in range(r0 + 1, r0 + hh):
                put(x, r, WHITE)

    inner = x + w - 1
    if frame == "open":
        block(top, h)
        if e.get("almond"):
            put(x, top, (0, 0, 0, 0))
    elif frame == "half":
        block(top + h // 2, h - h // 2)
        rect(x - 1, top + h // 2, 1, 1)
    elif frame == "closed":
        rect(x - 1, top + h - 2, w + 1, 1)
    elif frame == "happy":
        rect(x, top + 1, w, 1)
        put(x - 1, top + 2)
        put(x + w, top + 2)
    elif frame == "wide":
        block(top - 1, h + 1)
    elif frame == "narrow":
        block(top + 1, max(2, h - 2))
        put(inner, top)
        put(inner - 1, top)
    elif frame == "sad":
        block(top + 1, h - 1)
        put(inner, top + 1, WHITE)
        put(x, top)
    elif frame == "scared":
        rect(x, top - 1, w, h + 1, WHITE)
        rect(x, top - 1, w, 1)
        put(x + 1, top + h // 2)
        put(x + 1, top + h // 2 + 1)
    elif frame == "sleepy":
        rect(x - 1, top + h - 2, w + 1, 1, LID)
        rect(x, top + h - 1, w, 1)
    elif frame == "smug":
        rect(x - 1, top + h // 2, w + 1, 1, LID)
        block(top + h // 2 + 1, h - h // 2 - 1, sclera=False)
    elif frame == "hurt":
        mid = top + h // 2
        put(x, mid - 1)
        put(x + 1, mid - 1)
        put(x + w - 1, mid)
        put(x, mid + 1)
        put(x + 1, mid + 1)
    elif frame == "ko":
        mid = top + h // 2
        for c, r in ((x, mid - 1), (x + w - 1, mid - 1), (x + 1, mid), (x, mid + 1), (x + w - 1, mid + 1)):
            put(c, r)
    elif frame == "wink":
        if side == "L":
            block(top, h)
        else:
            rect(x, top + 1, w, 1)
            put(x - 1, top + 2)
            put(x + w, top + 2)
    elif frame == "confused":
        if side == "L":
            block(top, h)
        else:
            block(top + 1, max(2, h - 2))
    if e["lash"] and frame in ("open", "wide", "sad", "narrow", "wink", "confused", "smug", "half") \
            and not (frame in ("wink", "confused") and side == "R"):
        first = min((r for (c, r), col in cells.items() if col[3]), default=top)
        put(x - 1, first)
        if frame in ("open", "wide"):
            put(x - 1, first - 1)
    return {k: v for k, v in cells.items() if v[3]}


def draw_eyes(v, frame):
    cv = Canvas()
    e = v["eye"]
    for side in ("L", "R"):
        cells = eye_cells(e, frame, side)
        for (c, r), col in cells.items():
            cv.set(c if side == "L" else mirror(c), r, col)
    return cv


def iris_and_glint(v, frame, look):
    """Iris: lower dark pixels of each eye at viewer-left (l), viewer-right (r) or inner (c) columns.
    Glint: 1 px at the top-left dark pixel below the lid (the reference highlight)."""
    e = v["eye"]
    iris, glint = Canvas(), Canvas()
    for side in ("L", "R"):
        cells = {(c if side == "L" else mirror(c), r) for (c, r), col in eye_cells(e, frame, side).items() if col == DARK}
        if not cells or frame not in IRIS_EYES:
            continue
        rows = sorted({r for _, r in cells})
        body = [r for r in rows[1:]] or rows            # below the lid row
        cols = sorted({c for c, r in cells if r in body})
        if len(body) >= 2 and cols:
            iw = 2 if (e.get("iris2") and len(cols) >= 2) else 1
            if look == "l":
                start = cols[0]
            elif look == "r":
                start = cols[-iw]
            else:
                start = cols[-iw] if side == "L" else cols[0]
            for r in body[-2:]:
                for c in range(start, start + iw):
                    if (c, r) in cells:
                        iris.set(c, r, GREY)
        if len(body) >= 2 and cols:
            gr = body[0]
            gc = min(c for c, r in cells if r == gr)
            glint.set(gc, gr, GLINT)
    return iris, glint


def draw_brows(v, frame):
    b = v["brow"]
    cv = Canvas()
    L, t, row, x0 = b["len"], b["t"], b["row"], b["x"]

    def brow(side, shape):
        # shape: list of row offsets from outer (index 0) to inner (index L-1)
        for i, dr in enumerate(shape):
            c = x0 + i
            for k in range(t):
                r = max(1 + k, row + dr + k)          # stay on the flat face plane (rows >= 1)
                cv.set(c if side == "L" else mirror(c), r, GREY)

    def flat(d=0):
        return [d] * L

    arch = [0] + [-1] * (L - 2) + [0] if b["arch"] and L >= 3 else [0] * L
    shapes = {
        "neutral": (arch, arch),
        "raised": ([a - 1 for a in arch],) * 2,
        "raised_high": ([a - 2 for a in arch],) * 2,
        "angry": ([-1] + [0] * (L - 2) + [1],) * 2,
        "sad": ([1] + [0] * (L - 2) + [-1],) * 2,
        "determined": (flat(1), flat(1)),
        "confused": ([a - 1 for a in arch], [-1] + [0] * (L - 2) + [1]),
        "smug": (arch, [a - 1 for a in arch]),
        "scared": ([0] + [-1] * (L - 2) + [-2],) * 2,
        "sleepy": (flat(1), flat(1)),
    }
    left, right = shapes[frame]
    brow("L", left)
    brow("R", right)
    if frame == "determined" and t == 1:
        brow("L", flat(2)[:L - 1] + [1])
        brow("R", flat(2)[:L - 1] + [1])
    return cv


# ---------------------------------------------------------------------------------------------- mouth
def draw_mouth(v, frame):
    """r003: closed mouths 2-3 px, open mouths 4-6 px wide, teeth/tongue inside, lips for feminine faces."""
    m = v["mouth"]
    cv = Canvas()
    w, row = m["w"], m["row"]
    line = LIP if m["lip"] else MOUTH
    c0 = 8 - (w + 1) // 2 if w % 2 else 8 - w // 2
    c1 = c0 + w - 1

    def box(x0, y0, ww, hh, col):
        cv.rect(x0, y0, ww, hh, col)

    if frame == "neutral":
        box(c0, row, w, 1, line)
    elif frame == "smile":
        box(c0, row, w, 1, line)
        cv.set(c0 - 1, row - 1, line)
        cv.set(c1 + 1, row - 1, line)
    elif frame == "grin":                       # 6 wide, teeth over mouth
        box(5, row, 6, 2, MOUTH)
        box(6, row, 4, 1, TEETH)
        cv.set(4, row - 1, line)
        cv.set(11, row - 1, line)
        cv.set(5, row + 1, (0, 0, 0, 0))
        cv.set(10, row + 1, (0, 0, 0, 0))
    elif frame == "frown":
        box(c0, row, w, 1, line)
        cv.set(c0 - 1, row + 1, line)
        cv.set(c1 + 1, row + 1, line)
    elif frame == "open":                       # surprised "o": 4 x 2
        box(6, row, 4, 2, MOUTH)
        box(7, row + 1, 2, 1, TONGUE)
        cv.set(6, row, (0, 0, 0, 0))
        cv.set(9, row, (0, 0, 0, 0))
    elif frame == "grimace":                    # 6 wide gritted teeth
        box(5, row, 6, 2, MOUTH)
        box(6, row, 4, 1, TEETH)
        box(6, row + 1, 4, 1, TEETH)
        cv.set(7, row + 1, MOUTH)
    elif frame == "flat":
        box(6, row, 4, 1, MOUTH)
    elif frame == "wavy":
        cv.set(5, row + 1, line)
        cv.set(6, row, line)
        cv.set(7, row, line)
        cv.set(8, row + 1, line)
        cv.set(9, row + 1, line)
        cv.set(10, row, line)
    elif frame == "scared":                     # 6 wide, wobbly, teeth
        box(5, row, 6, 2, MOUTH)
        box(6, row, 4, 1, TEETH)
        cv.set(5, row, (0, 0, 0, 0))
        cv.set(10, row + 1, (0, 0, 0, 0))
    elif frame == "smug":
        box(c0, row, w + 1, 1, line)
        cv.set(c0 + w + 1, row - 1, line)
    elif frame == "small_o":
        box(7, row, 2, 1, MOUTH)
    elif frame == "ko":
        box(6, row, 4, 2, MOUTH)
        box(8, row + 1, 2, 1, TONGUE)
    elif frame == "viseme_A":                   # 4 x 3 open
        box(6, row - 1, 4, 3, MOUTH)
        box(7, row + 1, 2, 1, TONGUE)
        box(7, row - 1, 2, 1, TEETH)
    elif frame == "viseme_E":                   # 6 x 2 wide, teeth
        box(5, row, 6, 2, MOUTH)
        box(5, row, 6, 1, TEETH)
    elif frame == "viseme_O":                   # 4 x 3 ring
        box(6, row - 1, 4, 3, MOUTH)
        cv.set(6, row - 1, (0, 0, 0, 0))
        cv.set(9, row - 1, (0, 0, 0, 0))
        cv.set(6, row + 1, (0, 0, 0, 0))
        cv.set(9, row + 1, (0, 0, 0, 0))
    elif frame == "viseme_MB":
        box(6, row, 4, 1, LIP if m["lip"] else (140, 60, 64, 255))
    return cv


def draw_under(v, frame):
    """Face shading under every expression: under-hair shadow, nose shadow, cheek blush (r003)."""
    cv = Canvas()
    e = v["eye"]
    for c in range(1, 15):
        cv.set(c, 3, SHADE)
        cv.set(c, 4, SHADE2)
    cv.set(8, 10, SHADE2)                        # nose: soft shadow right of centre (key light from the left)
    cv.set(8, 11, SHADE)
    cv.set(7, 11, SHADE2)
    r = e["top"] + e["h"]
    col = {"none": (255, 110, 120, 60), "blush": BLUSH, "blush_strong": BLUSH2}[frame]
    for c in range(1, 4):
        cv.set(c, min(r, 11), col)
        cv.set(mirror(c), min(r, 11), col)
    if frame == "blush_strong":
        for c in range(1, 4):
            cv.set(c, min(r, 11) + 1, BLUSH)
            cv.set(mirror(c), min(r, 11) + 1, BLUSH)
    return cv


def draw_marks(v, frame):
    cv = Canvas()
    e = v["eye"]
    under = e["top"] + e["h"]
    if frame == "freckles":
        for c, r in ((e["x"] - 1, under + 1), (e["x"] + 1, under + 1), (e["x"], under + 2), (7, under), (e["x"] + 2, under + 2)):
            cv.set(c, r, FRECKLE)
            cv.set(mirror(c), r + (1 if c == e["x"] else 0), FRECKLE)
    elif frame in ("age_middle", "age_older"):
        for c in range(e["x"], e["x"] + e["w"]):
            cv.set(c, under, LINE)
            cv.set(mirror(c), under, LINE)
        if frame == "age_older":
            for r in range(under + 1, under + 3):
                cv.set(5, r, LINE)
                cv.set(mirror(5), r, LINE)
            for c in range(5, 11):
                cv.set(c, 3, LINE)
    elif frame == "warpaint":
        for c in range(1, 5):
            cv.set(c, under + 1, PAINT)
            cv.set(mirror(c), under + 1, PAINT)
        for c in range(1, 4):
            cv.set(c, under + 2, PAINT)
            cv.set(mirror(c), under + 2, PAINT)
    elif frame == "tattoo":
        for c, r in ((13, 5), (13, 6), (14, 7), (13, 8), (12, 9), (13, 10)):
            cv.set(c, r, PAINT)
    elif frame == "scars":
        for k in range(4):
            cv.set(12 + (k % 2), 6 + k, SCAR)
        cv.set(11, 8, SCAR)
        cv.set(14, 8, SCAR)
    elif frame == "scratch":
        for k in range(3):
            cv.set(1 + k, under + 2 - k, SCAR)
    elif frame == "dirt":
        for c, r in ((1, under + 1), (2, under + 2), (13, under + 2), (12, 14), (6, 14), (10, 4)):
            cv.set(c, r, DIRT)
    elif frame == "birthmark":
        cv.set(2, under + 2, FRECKLE)
        cv.set(3, under + 2, FRECKLE)
    return cv


def draw_over(v, frame):
    cv = Canvas()
    e = v["eye"]
    if frame == "sweat":
        cv.set(14, 4, SWEAT)
        cv.set(14, 5, SWEAT)
        cv.set(13, 5, SWEAT)
        cv.set(14, 6, SWEAT)
        cv.set(13, 6, (230, 246, 255, 255))
    elif frame == "tears":
        for r in range(e["top"] + e["h"], e["top"] + e["h"] + 3):
            cv.set(e["x"], r, TEAR)
            cv.set(mirror(e["x"]), r, TEAR)
    elif frame == "ko":
        for c, r in ((1, 4), (4, 3), (7, 4), (11, 3), (14, 4)):
            cv.set(c, r, STAR)
        cv.set(8, 3, (255, 255, 255, 255))
    elif frame == "vein":
        for c, r in ((12, 3), (14, 3), (13, 4), (12, 5), (14, 5)):
            cv.set(c, r, VEIN)
    elif frame == "zz":
        for c, r in ((12, 2), (13, 2), (14, 2), (13, 3), (12, 4), (13, 4), (14, 4)):
            cv.set(c, r, ZZ)
    return cv


# ---------------------------------------------------------------------------------------------- atlas
def marks_name(age, mark):
    """`marks` frames combine the age treatment and one marking (CHAR-BODY has one static marks layer)."""
    parts = [p for p in (age if age != "none" else "", mark if mark != "none" else "") if p]
    return "+".join(parts) or "none"


def draw_marks_combo(v, age, mark):
    cv = Canvas()
    for layer in ([draw_marks(v, "age_" + age)] if age != "none" else []) + [draw_marks(v, mark)]:
        for r in range(N):
            for c in range(N):
                if layer.px[r][c][3]:
                    cv.px[r][c] = layer.px[r][c]
    return cv


def build_variant(vid):
    v = VARIANTS[vid]
    frames = {
        "under": [(f, draw_under(v, f)) for f in UNDER_FRAMES],
        "marks": [(marks_name(a, m), draw_marks_combo(v, a, m)) for a in AGE_FRAMES for m in MARK_FRAMES],
        "eyes": [(f, draw_eyes(v, f)) for f in EYE_FRAMES],
        "brows": [(f, draw_brows(v, f)) for f in BROW_FRAMES],
        "mouth": [(f, draw_mouth(v, f)) for f in MOUTH_FRAMES],
        "over": [(f, draw_over(v, f)) for f in OVER_FRAMES],
    }
    iris, glint = [("none", Canvas())], [("none", Canvas())]
    for f in EYE_FRAMES:
        for look in LOOKS:
            i, g = iris_and_glint(v, f, look)
            iris.append((f"{f}@{LOOK_NAME[look]}", i))
            glint.append((f"{f}@{LOOK_NAME[look]}", g))
    frames["iris"] = iris
    frames["glint"] = glint
    # CHAR-BODY r004: only columns 1..14 and rows 1..14 lie on the flat face plane
    bad = [(layer, name) for layer, fs in frames.items() for name, cv in fs
           if any(cv.px[r][c][3] for r in range(N) for c in range(N) if r in (0, N - 1) or c in (0, N - 1))]
    if bad:
        raise SystemExit(f"{vid}: pixels on the chamfer ring (keep to cols/rows 1..14): {bad}")
    return frames


def expressions_table():
    return {k: {"eyes": e, "iris": e if e in IRIS_EYES else "none", "brows": b, "mouth": m, "under": u, "over": o}
            for k, (e, b, m, u, o) in EXPRESSIONS.items()}


# ---------------------------------------------------------------------------------------------- compositor
def _hex(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def resolve_state(meta, state):
    """Frame name per layer for a face state (mirrors resolveFaceFrames() in crew-heads.ts).
    state: expression, viseme?, blink?, look? (-1 character right, 0, 1 character left), age?, mark?, mouthHidden?"""
    ex = dict(meta["expressions"][state.get("expression", "neutral")])
    eyes, iris = ex["eyes"], ex["iris"]
    if state.get("blink") and eyes not in meta["blinkSuppressedEyes"]:
        eyes = iris = state["blink"]
    mouth = meta["visemes"][state["viseme"]] if state.get("viseme") else ex["mouth"]
    look = meta["looks"][str(state.get("look", 0))]
    ir = "none" if iris == "none" else f"{iris}@{look}"
    return {"under": ex["under"], "marks": marks_name(state.get("age", "none"), state.get("mark", "none")), "eyes": eyes,
            "iris": ir, "glint": ir, "brows": ex["brows"], "mouth": "none" if state.get("mouthHidden") else mouth, "over": ex["over"]}


def compose(atlas, meta, state, skin, eye, hair):
    """Reference compositor (mirrors composeFace() in crew-heads.ts). Returns a 16x16 RGBA image."""
    pick = resolve_state(meta, state)
    brow = tuple(round(v * meta["browShade"]) for v in _hex(hair))
    tint = {"iris": _hex(eye), "brows": brow}
    out = [[list(_hex(skin)) for _ in range(N)] for _ in range(N)]
    for row, layer in enumerate(meta["layers"]):
        col = meta["frames"][layer].index(pick[layer])
        t = tint.get(layer)
        for r in range(N):
            for c in range(N):
                pr, pg, pb, pa = atlas.getpixel((col * N + c, row * N + r))
                if not pa:
                    continue
                if t:
                    pr, pg, pb = pr * t[0] // 255, pg * t[1] // 255, pb * t[2] // 255
                a = pa / 255
                o = out[r][c]
                out[r][c] = [round(o[0] * (1 - a) + pr * a), round(o[1] * (1 - a) + pg * a), round(o[2] * (1 - a) + pb * a)]
    img = Image.new("RGBA", (N, N))
    for r in range(N):
        for c in range(N):
            img.putpixel((c, r), (*out[r][c], 255))
    return img


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="output directory: face-<variant>.png + face-<variant>.json")
    ap.add_argument("--json", default="", help="combined contract for @sidereal/content (default: <out>/face-atlases.json)")
    ap.add_argument("--catalog", default="", help="crew-heads catalog, for animationExpressions")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    anim = json.load(open(a.catalog))["animationExpressions"] if a.catalog else {}
    common = {"schema": SCHEMA, "cell": N, "pxMeters": 1 / 32, "layers": LAYERS, "expressions": expressions_table(), "visemes": VISEMES,
              "blink": BLINK, "blinkSuppressedEyes": NO_BLINK, "looks": {"-1": "r", "0": "c", "1": "l"},
              "tints": {"iris": "eye", "brows": "hair*0.45"}, "browShade": 0.45, "animationExpressions": anim,
              "canvasHeadSpace": {"x": [8, -8], "z": [16, 0], "flat": {"cols": [1, 14], "rows": [1, 14]},
                                  "note": "column 0 = character right (x=+8), row 0 = top (z=16)"},
              "marksCompose": {"ages": AGE_FRAMES, "marks": MARK_FRAMES, "name": "<age>+<mark>, 'none' parts omitted"}}
    combined = {**common, "variants": {}}
    for vid, v in VARIANTS.items():
        frames = build_variant(vid)
        cols = max(len(fs) for fs in frames.values())
        img = Image.new("RGBA", (cols * N, len(LAYERS) * N), (0, 0, 0, 0))
        names = {}
        for row, layer in enumerate(LAYERS):
            names[layer] = []
            for col, (name, cv) in enumerate(frames[layer]):
                names[layer].append(name)
                for r in range(N):
                    for c in range(N):
                        if cv.px[r][c][3]:
                            img.putpixel((col * N + c, row * N + r), cv.px[r][c])
        img.save(os.path.join(a.out, f"face-{vid}.png"))
        per = {**common, "status": "CHAR-HEADS production atlas proposal (unsigned)", "variant": vid, "label": v["label"],
               "sex": v["sex"], "image": f"face-{vid}.png", "size": [cols * N, len(LAYERS) * N], "frames": names,
               "params": {k: v[k] for k in ("eye", "brow", "mouth")}}
        with open(os.path.join(a.out, f"face-{vid}.json"), "w") as fh:
            json.dump(per, fh, indent=1)
            fh.write("\n")
        combined["variants"][vid] = {"label": v["label"], "sex": v["sex"], "file": f"face-{vid}.png", "json": f"face-{vid}.json",
                                     "size": per["size"], "frames": names}
    with open(a.json or os.path.join(a.out, "face-atlases.json"), "w") as fh:
        json.dump(combined, fh, indent=1)
        fh.write("\n")
    print("face atlases:", list(VARIANTS), "->", a.out)


if __name__ == "__main__":
    main()
