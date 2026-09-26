"""Default crew face atlas (pure Python, no Blender) in the FACE_ATLAS_SPEC layout.

CHAR-BODY owns the face canvas/UV and runtime API; CHAR-HEADS authors the production atlases and
per-head variants. This module produces the DEFAULT atlas used until those land, plus the
reference compositor that the TypeScript runtime mirrors (packages/content/src/crew-voxel-face.ts).

Canvas: 16 x 16 px, 1 px = 1 fine voxel; column 0 = character's RIGHT (viewer's left), row 0 = top.
Atlas PNG: one ROW per layer (under, marks, eyes, iris, glint, brows, mouth, over), one COLUMN per
frame, 16 x 16 px cells, RGBA8, straight alpha.

  python3 face_atlas.py OUT_DIR     -> face-default.png, face-atlas.json, face-neutral.png, previews
"""
import json
import os
import struct
import sys
import zlib

N = 16
LAYERS = ["under", "marks", "eyes", "iris", "glint", "brows", "mouth", "over"]
EYES = ((2, 4), (11, 13))                   # inclusive column ranges (char right eye, char left eye)
DARK = (26, 20, 36, 255)
WHITE = (255, 255, 255, 255)
GREY = (200, 200, 200, 255)                 # tinted layers are authored greyscale
MOUTH = (120, 48, 56, 255)
TEETH = (250, 246, 240, 255)
BLUSH = (236, 120, 130, 110)
BLUSH2 = (236, 90, 110, 170)
SWEAT = (140, 210, 255, 230)
TEAR = (90, 170, 255, 230)
ANGER = (230, 40, 50, 255)
ZZZ = (235, 240, 255, 230)
SWIRL = (255, 220, 90, 255)


def blank():
    return [[(0, 0, 0, 0)] * N for _ in range(N)]


def put(img, cols, rows, c):
    for r in rows:
        for q in cols:
            if 0 <= r < N and 0 <= q < N:
                img[r][q] = c
    return img


def both_eyes(fn):
    img = blank()
    for side, (c0, c1) in enumerate(EYES):
        fn(img, c0, c1, side)
    return img


# ----------------------------------------------------------------------------- frames
def eyes_frames():
    f = {}
    f["open"] = both_eyes(lambda im, a, b, s: put(im, range(a, b + 1), range(7, 11), DARK))
    f["half"] = both_eyes(lambda im, a, b, s: put(im, range(a, b + 1), range(9, 11), DARK))
    f["closed"] = both_eyes(lambda im, a, b, s: put(im, range(a, b + 1), [10], DARK))
    f["wide"] = both_eyes(lambda im, a, b, s: put(im, range(a, b + 1), range(6, 11), DARK))
    f["narrow"] = both_eyes(lambda im, a, b, s: put(im, range(a, b + 1), range(8, 10), DARK))

    def happy(im, a, b, s):                  # ^ ^ arcs
        put(im, [a, b], [9], DARK)
        put(im, [a + 1], [8], DARK)
    f["happy"] = both_eyes(happy)

    def sad(im, a, b, s):
        put(im, range(a, b + 1), range(8, 11), DARK)
        put(im, [a if s == 1 else b], [8], (0, 0, 0, 0))            # outer top corner drops
    f["sad"] = both_eyes(sad)

    def tight(im, a, b, s):                  # > <
        if s == 0:
            put(im, [a], [8, 10], DARK)
            put(im, [a + 1], [9], DARK)
            put(im, [b], [9], DARK)
        else:
            put(im, [b], [8, 10], DARK)
            put(im, [b - 1], [9], DARK)
            put(im, [a], [9], DARK)
    f["tight"] = both_eyes(tight)

    def ko(im, a, b, s):                     # x x
        put(im, [a, b], [8, 10], DARK)
        put(im, [a + 1], [9], DARK)
    f["ko"] = both_eyes(ko)

    def sleepy(im, a, b, s):
        put(im, range(a, b + 1), [10], DARK)
        put(im, range(a, b + 1), [9], (60, 50, 70, 120))
    f["sleepy"] = both_eyes(sleepy)

    def wink(im, a, b, s):
        if s == 0:
            put(im, range(a, b + 1), range(7, 11), DARK)
        else:
            happy(im, a, b, s)
    f["wink"] = both_eyes(wink)
    return f


def iris_frames():
    f = {"none": blank()}
    for look, dx in (("c", 1), ("l", 0), ("r", 2)):
        # 'l' / 'r' are the character's left / right; column 0 is the character's right
        dx = {"c": 1, "l": 2, "r": 0}[look]
        f[f"open@{look}"] = both_eyes(lambda im, a, b, s, d=dx: put(im, [a + d], [9, 10], GREY))
        f[f"wide@{look}"] = both_eyes(lambda im, a, b, s, d=dx: put(im, [a + d], [8, 9, 10], GREY))
    return f


def glint_frames():
    f = {"none": blank()}
    for look in ("c", "l", "r"):
        d = {"c": 0, "l": 1, "r": 0}[look]
        f[f"open@{look}"] = both_eyes(lambda im, a, b, s, d=d: put(im, [a + d], [7], WHITE))
        f[f"wide@{look}"] = both_eyes(lambda im, a, b, s, d=d: put(im, [a + d], [6, 7], WHITE))
    return f


def brows_frames():
    f = {"none": blank()}
    f["neutral"] = both_eyes(lambda im, a, b, s: put(im, range(a - 1, b + 1) if s == 0 else range(a, b + 2), [5], GREY))
    f["raised"] = both_eyes(lambda im, a, b, s: put(im, range(a - 1, b + 1) if s == 0 else range(a, b + 2), [4], GREY))

    def angry(im, a, b, s):                  # inner ends down
        if s == 0:
            put(im, [a - 1, a], [4], GREY)
            put(im, [a + 1, b], [5], GREY)
            put(im, [b + 1], [6], GREY)
        else:
            put(im, [b, b + 1], [4], GREY)
            put(im, [a, b - 1], [5], GREY)
            put(im, [a - 1], [6], GREY)
    f["angry"] = both_eyes(angry)

    def sad(im, a, b, s):                    # inner ends up
        if s == 0:
            put(im, [a - 1, a], [6], GREY)
            put(im, [a + 1, b], [5], GREY)
            put(im, [b + 1], [4], GREY)
        else:
            put(im, [b, b + 1], [6], GREY)
            put(im, [a, b - 1], [5], GREY)
            put(im, [a - 1], [4], GREY)
    f["sad"] = both_eyes(sad)
    f["confused"] = both_eyes(lambda im, a, b, s: put(im, range(a - 1, b + 1) if s == 0 else range(a, b + 2), [5 if s == 0 else 3], GREY))
    f["smug"] = both_eyes(lambda im, a, b, s: put(im, range(a - 1, b + 1) if s == 0 else range(a, b + 2), [5 if s == 0 else 4], GREY))
    return f


def mouth_frames():
    f = {}
    f["neutral"] = put(blank(), [7, 8], [12], MOUTH)
    f["small"] = put(blank(), [7, 8], [12], MOUTH)
    f["smile"] = put(put(blank(), [7, 8], [13], MOUTH), [6, 9], [12], MOUTH)
    im = put(blank(), range(6, 10), [12, 13], MOUTH)
    f["grin"] = put(im, range(6, 10), [12], TEETH)
    f["frown"] = put(put(blank(), [7, 8], [12], MOUTH), [6, 9], [13], MOUTH)
    f["flat"] = put(blank(), range(6, 10), [12], MOUTH)
    f["grit"] = put(put(blank(), range(6, 10), [12, 13], MOUTH), range(6, 10), [12], TEETH)
    f["smug"] = put(put(blank(), [7, 8], [12], MOUTH), [9], [11], MOUTH)
    f["wavy"] = put(put(blank(), [6, 8], [12], MOUTH), [7, 9], [13], MOUTH)
    f["o_small"] = put(blank(), [7, 8], [12, 13], MOUTH)
    # talk visemes
    f["v_closed"] = put(blank(), [7, 8], [12], MOUTH)
    f["v_A"] = put(put(blank(), range(6, 10), [12, 13, 14], MOUTH), range(6, 10), [12], TEETH)
    f["v_E"] = put(put(blank(), range(6, 10), [12, 13], MOUTH), range(6, 10), [12], TEETH)
    f["v_O"] = put(blank(), [7, 8], [12, 13, 14], MOUTH)
    f["v_MB"] = put(blank(), range(6, 10), [12], (100, 40, 48, 255))
    return f


def under_frames():
    return {"none": blank(),
            "blush": put(put(blank(), [1, 2, 3], [11], BLUSH), [12, 13, 14], [11], BLUSH),
            "blush_strong": put(put(blank(), [1, 2, 3], [11, 12], BLUSH2), [12, 13, 14], [11, 12], BLUSH2)}


def over_frames():
    f = {"none": blank()}
    f["sweat"] = put(put(blank(), [14], [3, 4], SWEAT), [13], [5], SWEAT)
    f["tears"] = put(put(blank(), [3], [11, 12, 13], TEAR), [12], [11, 12, 13], TEAR)
    f["anger"] = put(put(blank(), [12, 14], [2], ANGER), [13], [1, 3], ANGER)
    f["zzz"] = put(put(put(blank(), [12, 13, 14], [1], ZZZ), [13], [2], ZZZ), [12, 13, 14], [3], ZZZ)
    f["swirl"] = put(put(put(blank(), [5, 6, 7, 8, 9, 10], [1], SWIRL), [4, 11], [2], SWIRL), [6, 7, 8, 9], [3], SWIRL)
    return f


def build_atlas():
    layers = {"under": under_frames(), "marks": {"none": blank()}, "eyes": eyes_frames(), "iris": iris_frames(),
              "glint": glint_frames(), "brows": brows_frames(), "mouth": mouth_frames(), "over": over_frames()}
    frames = {k: list(v.keys()) for k, v in layers.items()}
    E = lambda eyes, brows, mouth, iris="open", under="blush", over="none": dict(  # noqa: E731
        eyes=eyes, iris=iris, brows=brows, mouth=mouth, under=under, over=over)
    expressions = {
        "neutral": E("open", "neutral", "neutral"),
        "happy": E("happy", "raised", "smile", iris="none", under="blush_strong"),
        "sad": E("sad", "sad", "frown", over="tears"),
        "angry": E("narrow", "angry", "flat", iris="none", over="anger"),
        "surprised": E("wide", "raised", "o_small", iris="wide"),
        "confused": E("open", "confused", "wavy", over="sweat"),
        "hurt": E("tight", "sad", "grit", iris="none", over="sweat"),
        "determined": E("narrow", "angry", "flat", iris="none"),
        "scared": E("wide", "sad", "o_small", iris="wide", over="sweat"),
        "smug": E("half", "smug", "smug", iris="none"),
        "sleepy": E("sleepy", "neutral", "small", iris="none", over="zzz"),
        "knocked_out": E("ko", "none", "o_small", iris="none", under="none", over="swirl"),
        "wink": E("wink", "raised", "smile", iris="open", under="blush_strong"),
        "grin": E("happy", "raised", "grin", iris="none", under="blush_strong"),
    }
    return {
        "schema": "sidereal.crew.face-atlas/1",
        "status": "DEFAULT atlas by CHAR-BODY (placeholder until CHAR-HEADS publishes production atlases)",
        "cell": N, "layers": LAYERS, "frames": frames,
        "expressions": expressions,
        "visemes": {"closed": "v_closed", "A": "v_A", "E": "v_E", "O": "v_O", "MB": "v_MB"},
        "blink": [{"eyes": "half", "seconds": 1 / 24}, {"eyes": "closed", "seconds": 1 / 24}, {"eyes": "half", "seconds": 1 / 24}],
        "blinkSuppressedEyes": ["closed", "happy", "sleepy", "ko", "tight", "wink"],
        "looks": {"-1": "r", "0": "c", "1": "l"},
        "tints": {"iris": "eye", "brows": "hair*0.6"},
        "animationExpressions": {
            "emote_happy": "happy", "emote_sad": "sad", "emote_angry": "angry", "emote_confused": "confused",
            "hurt": "hurt", "death": "knocked_out", "knocked_out": "knocked_out", "revive": "sleepy",
            "cheer": "grin", "celebrate": "grin", "wave": "happy", "thumbs_up": "wink", "point": "determined",
            "aim_rifle": "determined", "aim_pistol": "determined", "shoot_rifle": "determined",
            "shoot_pistol": "determined", "melee_swing": "angry", "throw": "determined", "repair_loop": "determined",
            "jetpack_hover": "surprised", "sit_idle": "neutral",
        },
    }, layers


def frame_name(state_layer, expr, look):
    return expr


def compose(atlas, layers, state, skin=(243, 169, 141), eye=(70, 110, 200), hair=(110, 58, 31)):
    """Reference compositor (mirrored in TS). state: expression, viseme (or None), blinkEyes (or None), look."""
    ex = atlas["expressions"][state.get("expression", "neutral")]
    look = atlas["looks"][str(state.get("look", 0))]
    pick = dict(ex)
    if state.get("viseme"):
        pick["mouth"] = atlas["visemes"][state["viseme"]]
    blinking = state.get("blinkEyes") and ex["eyes"] not in atlas["blinkSuppressedEyes"]
    if blinking:
        pick["eyes"] = state["blinkEyes"]
    out = [[(*skin, 255) for _ in range(N)] for _ in range(N)]
    for layer in LAYERS:
        if layer == "marks":
            name = "none"
        elif layer in ("iris", "glint"):
            name = "none" if blinking or pick.get("iris", "open") == "none" else f"{pick.get('iris', 'open')}@{look}"
        else:
            name = pick.get(layer, "none")
        fr = layers[layer].get(name)
        if fr is None:
            continue
        tint = (1, 1, 1)
        if layer == "iris":
            tint = tuple(c / 255 for c in eye)
        elif layer == "brows":
            tint = tuple(c / 255 * 0.6 / (200 / 255) for c in hair)
        for r in range(N):
            for q in range(N):
                cr, cg, cb, ca = fr[r][q]
                if ca == 0:
                    continue
                a = ca / 255
                src = (min(255, cr * tint[0]), min(255, cg * tint[1]), min(255, cb * tint[2]))
                d = out[r][q]
                out[r][q] = tuple(round(src[i] * a + d[i] * (1 - a)) for i in range(3)) + (255,)
    return out


def write_png(path, rows):
    h, w = len(rows), len(rows[0])
    raw = b"".join(b"\x00" + bytes(c for px in row for c in px) for row in rows)

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def atlas_image(atlas, layers):
    cols = max(len(v) for v in atlas["frames"].values())
    img = [[(0, 0, 0, 0)] * (cols * N) for _ in range(len(LAYERS) * N)]
    for li, layer in enumerate(LAYERS):
        for fi, name in enumerate(atlas["frames"][layer]):
            fr = layers[layer][name]
            for r in range(N):
                for q in range(N):
                    img[li * N + r][fi * N + q] = fr[r][q]
    return img


def upscale(rows, k):
    return [[px for px in row for _ in range(k)] for row in rows for _ in range(k)]


def main(out):
    os.makedirs(out, exist_ok=True)
    atlas, layers = build_atlas()
    write_png(f"{out}/face-default.png", atlas_image(atlas, layers))
    with open(f"{out}/face-atlas.json", "w") as f:
        json.dump(atlas, f, indent=1)
    write_png(f"{out}/face-neutral.png", compose(atlas, layers, {"expression": "neutral"}))
    # review sheet: every expression + visemes, 8x upscaled
    tiles = [compose(atlas, layers, {"expression": e}) for e in atlas["expressions"]]
    tiles += [compose(atlas, layers, {"expression": "neutral", "viseme": v}) for v in atlas["visemes"]]
    tiles += [compose(atlas, layers, {"expression": "neutral", "blinkEyes": "closed"}),
              compose(atlas, layers, {"expression": "neutral", "look": -1}),
              compose(atlas, layers, {"expression": "neutral", "look": 1})]
    per = 8
    gap = [(11, 21, 48, 255)] * 2
    rows = []
    for i in range(0, len(tiles), per):
        chunk = tiles[i:i + per]
        while len(chunk) < per:
            chunk.append([[(11, 21, 48, 255)] * N for _ in range(N)])
        for r in range(N):
            line = []
            for t in chunk:
                line += t[r] + gap
            rows.append(line)
        rows.append([(11, 21, 48, 255)] * len(rows[-1]))
        rows.append([(11, 21, 48, 255)] * len(rows[-1]))
    write_png(f"{out}/face-expressions-preview.png", upscale(rows, 8))
    return atlas


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else ".")
