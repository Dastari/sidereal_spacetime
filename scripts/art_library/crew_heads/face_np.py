"""Blender-side face canvas compositor (numpy). Mirrors composeFace() in packages/content/src/crew-heads.ts
and compose() in face_atlas.py, so review renders show exactly what the runtime composites."""
from __future__ import annotations

import json
import os

import bpy
import numpy as np

_ATLAS = {}


class FaceKit:
    def __init__(self, atlas_json, png_dir, catalog):
        self.meta = json.load(open(atlas_json))
        self.dir = png_dir
        self.cat = catalog
        self.cache = {}

    def atlas(self, vid):
        if vid not in _ATLAS:
            img = bpy.data.images.load(os.path.join(self.dir, self.meta["variants"][vid]["file"]), check_existing=True)
            w, h = img.size
            px = np.empty(w * h * 4, np.float32)
            img.pixels.foreach_get(px)
            # bpy pixels are bottom-up floats; flip to top-down bytes like the PNG
            _ATLAS[vid] = np.flipud((px.reshape(h, w, 4) * 255 + 0.5).astype(np.int32))
        return _ATLAS[vid]

    def frames(self, state, age_mark="none", mark="none", mouth_hidden=False):
        """Mirrors resolveFaceFrames(): look -1 = character right ('r'), +1 = character left ('l')."""
        m = self.meta
        ex = dict(m["expressions"][state.get("expression", "neutral")])
        eyes, iris = ex["eyes"], ex["iris"]
        if state.get("blink") and eyes not in m["blinkSuppressedEyes"]:
            eyes = iris = state["blink"]
        mouth = m["visemes"][state["viseme"]] if state.get("viseme") else ex["mouth"]
        look = m["looks"][str(state.get("look", 0))]
        ir = "none" if iris == "none" else f"{iris}@{look}"
        marks = "+".join(p for p in (age_mark, mark) if p and p != "none") or "none"
        return {"under": ex["under"], "marks": marks, "eyes": eyes, "iris": ir, "glint": ir, "brows": ex["brows"],
                "mouth": "none" if mouth_hidden else mouth, "over": ex["over"]}

    def compose(self, vid, frames, skin, eye, hair):
        """Returns a (16, 16, 3) uint8 array, row 0 = top, column 0 = character right."""
        m = self.meta
        N = m["cell"]
        at = self.atlas(vid)
        hx = lambda s: np.array([int(s.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4)], np.int32)  # noqa: E731
        out = np.broadcast_to(hx(skin).astype(np.float64), (N, N, 3)).copy()
        tints = {"iris": hx(eye), "brows": np.round(hx(hair) * m["browShade"]).astype(np.int32)}
        for row, layer in enumerate(m["layers"]):
            col = m["variants"][vid]["frames"][layer].index(frames[layer])
            f = at[row * N:(row + 1) * N, col * N:(col + 1) * N]
            rgb = f[..., :3]
            if layer in tints:
                rgb = rgb * tints[layer] // 255
            a = (f[..., 3:4] / 255.0)
            out = np.where(a > 0, np.round(out * (1 - a) + rgb * a), out)
        return out.astype(np.uint8)

    def image(self, vid, frames, skin, eye, hair, name=None):
        key = (vid, tuple(sorted(frames.items())), skin, eye, hair)
        if key in self.cache:
            return self.cache[key]
        rgb = self.compose(vid, frames, skin, eye, hair)
        N = rgb.shape[0]
        name = name or f"face.{len(self.cache):05d}"
        img = bpy.data.images.new(name, N, N, alpha=False)
        img.colorspace_settings.name = "sRGB"
        px = np.concatenate([np.flipud(rgb).astype(np.float32) / 255.0, np.ones((N, N, 1), np.float32)], 2)
        img.pixels.foreach_set(px.ravel())
        img.pack()
        self.cache[key] = img
        return img
