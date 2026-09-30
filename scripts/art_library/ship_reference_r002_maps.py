"""Shared r002 machining relief; silhouettes and deep casing remain sampled geometry."""
from pathlib import Path
import argparse
import numpy as np
import struct
import zlib


def save_png(path, data, colour):
    height, width = data.shape[:2]

    def chunk(name, payload):
        return (struct.pack(">I", len(payload)) + name + payload
                + struct.pack(">I", zlib.crc32(name + payload) & 0xffffffff))

    raw = b"".join(b"\0" + row.tobytes() for row in data)
    path.write_bytes(b"\x89PNG\r\n\x1a\n"
                     + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, colour, 0, 0, 0))
                     + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def make_height():
    height = np.full((256, 256), 128, dtype=np.float32)
    yy, xx = np.mgrid[:256, :256]

    def clipped_box(x0, y0, x1, y1, cut):
        # Coarse clipped ends belong to a local manufactured part, never a tile-border grid.
        return ((xx >= x0) & (xx < x1) & (yy >= y0) & (yy < y1)
                & (xx + yy >= x0 + y0 + cut)
                & (xx - yy < x1 - y0 - cut)
                & (yy - xx < y1 - x0 - cut)
                & (xx + yy < x1 + y1 - cut))

    # One recessed service seat with a shallow molded lip and two stepped inner courses.
    # Coordinates share the existing metre-based face charts; no per-part material or atlas.
    height[clipped_box(40, 32, 132, 116, 12)] = 140
    height[clipped_box(42, 34, 130, 114, 11)] = 124
    height[clipped_box(45, 37, 127, 111, 10)] = 112
    height[clipped_box(48, 40, 124, 108, 9)] = 108
    for y in (62, 78):
        height[y:y + 3, 57:115] = 96
        height[y + 3:y + 5, 61:111] = 116

    # Offset short cooling/tooling group, separated from the service seat by a calm field.
    height[clipped_box(154, 163, 224, 205, 8)] = 136
    height[clipped_box(157, 166, 221, 202, 7)] = 112
    for y in (175, 185, 195):
        height[y:y + 3, 166:213] = 92
        height[y + 3:y + 5, 170:209] = 120
    height[193:196, 38:82] = 112
    height[193:196, 91:115] = 112

    # Slots and seating rings affect normals only, rather than painting black dots in albedo.
    for cx, cy in ((49, 45), (122, 45), (49, 103), (122, 103), (147, 170), (231, 198)):
        radius2 = (xx - cx) ** 2 + (yy - cy) ** 2
        height[(radius2 >= 16) & (radius2 < 36)] = 144
        height[radius2 < 16] = 104
        height[(radius2 < 9) & (abs(yy - cy) < 1)] = 88
    return height


def make_normal(height):
    dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) / 48
    dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) / 48
    normal = np.dstack((-dx, -dy, np.ones_like(height)))
    normal /= np.linalg.norm(normal, axis=2, keepdims=True)
    return normal


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    height = make_height()
    normal = make_normal(height)
    rgba = np.dstack(((normal * .5 + .5) * 255, height)).astype(np.uint8)
    save_png(out / "panel-normal.png", rgba, 6)
    save_png(out / "panel-height.png", height.astype(np.uint8)[:, :, None], 0)


if __name__ == "__main__":
    main()
