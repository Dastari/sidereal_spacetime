"""Shipyard reusable hull-component kit prototype, revision r004 (design evidence, not production).

Owner direction (2026-09-25): build the pieces in Blender with more detail, and make them:
- re-colourable and re-themeable through swappable materials
- decal-capable for names, logos and numbers
- detail-mapped (bump/normal) for metal and rivets
They must snap together under rotations and sizes across fighters, frigates, pirates, aliens and stations.

What this script demonstrates:
- KIT: 59 authored pieces in 7 families: hull shape tiles, face cassettes, glazing, roof modules,
  external mounts, interior edges, and faction decorators. Every piece is built from boxes on the 1/16 m
  brick grid, so voxelising it for destruction is lossless. Glass is kept as optical meshes.
- SLOTS: each piece uses the same 9 material slots (primary, secondary, accent, trim, metal, dark,
  emit_a, emit_b, glass). A THEME is only a slot -> material table. Three themes (Federation,
  Riftjack, Aurelian) render the SAME mesh datablocks with object-level material overrides.
- DETAIL: a generated, tiling height map (panel seams + rivets + fine noise). It is box-projected in
  object space and drives Bump. Theme wear (grime/rust) is a noise-masked colour/roughness mix.
- DECALS: text is rendered to alpha masks and emblems are generated as masks. A decal is
  mask x theme colour, placed at a piece's decal socket (the same model as the existing HullDecal).
- SOCKETS: face cassettes mount on hull faces (local X along the face, +Y outward, +Z up), roof modules
  and top mounts on roof cells, engines/cannons/thrusters on face hardpoints, and decorators on
  decorator sockets. Theme decorators change the silhouette without new base geometry.

Outputs, in --out: kit sheet, three-theme top-down, hero shots, detail close-up,
kit_r004.json (the manifest), detail_height.png and the decal masks.

Usage:
  blender -b -P scripts/art_library/ship_kit_prototype.py -- --out /tmp/kit [--samples 48] [--no-render] [--shots a,b]
"""
import argparse
import json
import math
import sys

import bpy
import numpy as np
from mathutils import Vector

REVISION = "r007"
T = 1.0 / 16.0
SLOTS = ["primary", "secondary", "accent", "trim", "metal", "dark", "emit_a", "emit_b", "glass"]
SI = {s: i for i, s in enumerate(SLOTS)}
BODY_Z = (5, 29, 49, 54)      # hull tiers in texels: skirt | lower | upper | rim ; roof plane at 54 (3.375 m)


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--out", default="/tmp/kit")
    p.add_argument("--samples", type=int, default=48)
    p.add_argument("--no-render", action="store_true")
    p.add_argument("--shots", default="")
    return p.parse_args(argv)


def H(*a):
    h = 2166136261
    for v in a:
        for w in ([ord(c) for c in v] if isinstance(v, str) else [int(v)]):
            h = ((h ^ (w & 0xFFFFFFFF)) * 16777619) & 0xFFFFFFFF
            h ^= h >> 13
    return (h % 100000) / 100000.0


# =========================================================================== KIT PIECES
class Piece:
    """A reusable kit piece: boxes in texels (local frame), decal sockets, attachment socket kind."""

    def __init__(self, pid, family, mount, size):
        self.id, self.family, self.mount, self.size = pid, family, mount, size   # size = (w, d, h) texels
        self.boxes, self.decals = [], []

    def b(self, x0, y0, z0, x1, y1, z1, slot):
        if x1 > x0 and y1 > y0 and z1 > z0:
            self.boxes.append((x0, y0, z0, x1, y1, z1, slot))
        return self

    def disc(self, axis, c1, c2, r, a0, a1, slot, rin=0):
        """Stepped (brick) disc/ring extruded along axis from a0 to a1; c1, c2 are the centre in the
        other two axes (x,z for axis y; x,y for axis z; y,z for axis x). Rows are merged."""
        rows = []
        for k in range(-r, r):
            q = k + 0.5
            half = int(math.floor(math.sqrt(max(0.0, r * r - q * q)) + 0.5))
            hin = int(math.floor(math.sqrt(max(0.0, rin * rin - q * q)) + 0.5)) if rin and abs(q) < rin else 0
            rows.append((k, half, hin))
        runs, start = [], 0
        for n in range(1, len(rows) + 1):
            if n == len(rows) or rows[n][1:] != rows[start][1:]:
                runs.append((rows[start][0], rows[n - 1][0] + 1, rows[start][1], rows[start][2]))
                start = n
        for k0, k1, half, hin in runs:
            spans = [(c1 - half, c1 + half)] if not hin else [(c1 - half, c1 - hin), (c1 + hin, c1 + half)]
            for u0, u1 in spans:
                if axis == "y":
                    self.b(u0, a0, c2 + k0, u1, a1, c2 + k1, slot)
                elif axis == "z":
                    self.b(u0, c2 + k0, a0, u1, c2 + k1, a1, slot)
                else:
                    self.b(a0, u0, c2 + k0, a1, u1, c2 + k1, slot)
        return self

    def decal(self, kind, rect, plane):
        """Decal socket. plane 'face' -> rect (x0, z0, x1, z1) at y; plane 'top' -> rect (x0, y0, x1, y1) at z."""
        self.decals.append((kind, rect, plane))
        return self

    def aligned(self):
        return all(float(v).is_integer() for bx in self.boxes for v in bx[:6])

    def slots(self):
        return sorted({bx[6] for bx in self.boxes}, key=SI.get)


def frame(p, x0, z0, x1, z1, y0, y1, t, slot):
    p.b(x0, y0, z0, x1, y1, z0 + t, slot).b(x0, y0, z1 - t, x1, y1, z1, slot)
    p.b(x0, y0, z0 + t, x0 + t, y1, z1 - t, slot).b(x1 - t, y0, z0 + t, x1, y1, z1 - t, slot)


# --- face cassettes: local X along the face, +Y outward from the mount plane, +Z up
def cas_panel(w, h):
    p = Piece(f"cas.panel.w{w // 16}.h{h}", "cassette", "face", (w, 4, h))
    p.b(0, 0, 0, w, 1, h, "trim").b(1, 0, 1, w - 1, 3, h - 1, "primary")
    if w >= 32 and h >= 18:
        p.b(4, 3, 4, w - 4, 4, h - 4, "primary")
    for x, z in ((2, 2), (w - 4, 2), (2, h - 4), (w - 4, h - 4)):
        p.b(x, 3, z, x + 2, 4, z + 2, "metal")
    if w >= 16:
        p.b(5, 3, 2, 11, 4, 3, "secondary").b(w - 8, 3, h - 7, w - 5, 4, h - 6, "emit_b")
    return p


def cas_split(w, h):
    p = Piece(f"cas.split.w{w // 16}.h{h}", "cassette", "face", (w, 4, h))
    m = h // 2
    p.b(0, 0, 0, w, 1, h, "trim").b(1, 0, 1, w - 1, 3, m, "primary").b(1, 0, m + 1, w - 1, 2, h - 1, "primary")
    for i in range(3):
        z = m + 3 + i * 3
        if z + 1 < h - 1:
            p.b(3, 2, z, min(w - 3, 12), 3, z + 1, "dark")
    p.b(w - 6, 3, 3, w - 3, 4, 5, "emit_a" if w >= 32 else "emit_b")
    return p


def cas_grille(w, h):
    p = Piece(f"cas.grille.w{w // 16}.h{h}", "cassette", "face", (w, 3, h))
    p.b(0, 0, 0, w, 1, h, "dark")
    frame(p, 0, 0, w, h, 0, 3, 2, "primary")
    for z in range(3, h - 3, 2):
        p.b(2, 1, z, w - 2, 2, z + 1, "metal")
    return p


def cas_hatch(w, h):
    p = Piece(f"cas.hatch.w{w // 16}.h{h}", "cassette", "face", (w, 6, h))
    p.b(0, 0, 0, w, 1, h, "trim")
    frame(p, 0, 0, w, h, 1, 3, 2, "secondary")
    p.b(2, 1, 2, w // 2, 4, h - 2, "accent").b(w // 2, 1, 2, w - 2, 4, h - 2, "accent")
    p.b(w // 2 - 3, 4, h // 2 - 1, w // 2 + 3, 5, h // 2 + 1, "metal")
    p.b(3, 4, h - 5, 5, 5, h - 3, "emit_b").b(w - 5, 4, h - 5, w - 3, 5, h - 3, "emit_b")
    p.b(3, 4, 3, 5, 5, 8, "metal").b(w - 5, 4, 3, w - 3, 5, 8, "metal")
    return p


def cas_light(w, h):
    p = Piece(f"cas.light.w{w // 16}.h{h}", "cassette", "face", (w, 5, h))
    c = h // 2
    p.b(0, 0, 0, w, 2, h, "secondary").b(2, 2, c - 3, w - 2, 4, c + 3, "trim").b(3, 4, c - 1, w - 3, 5, c + 1, "emit_a")
    p.b(1, 2, 1, 3, 3, 3, "metal").b(w - 3, 2, 1, w - 1, 3, 3, "metal")
    return p


def cas_stack(w, h):
    p = Piece(f"cas.stack.w{w // 16}.h{h}", "cassette", "face", (w, 6, h))
    m = h // 2
    p.b(0, 0, 0, w, 3, m, "primary").b(1, 0, m, w - 1, 2, h, "primary")
    p.b(w - 7, 3, 2, w - 2, 5, 7, "metal").b(w - 6, 5, 3, w - 3, 6, 5, "emit_b")
    for i in range(3):
        z = m + 3 + i * 3
        if z + 1 < h - 1:
            p.b(2, 2, z, 8, 3, z + 1, "trim")
    return p


def cas_logo(w, h):
    p = Piece(f"cas.logo.w{w // 16}.h{h}", "cassette", "face", (w, 3, h))
    p.b(0, 0, 0, w, 2, h, "secondary")
    frame(p, 0, 0, w, h, 2, 3, 1, "trim")
    p.decal("name", (3, 3, w - 3, h - 3), "face")
    return p


def cas_window(w, h, kind):
    p = Piece(f"cas.window.{kind}.w{w // 16}.h{h}", "glazing", "face", (w, 4, h))
    frame(p, 0, 0, w, h, 0, 3, 3 if kind != "full" else 2, "secondary")
    p.b(2, 0, 2, w - 2, 1, h - 2, "dark").b(2, 1, 2, w - 2, 2, h - 2, "glass")
    for x in range(16, w, 16):
        p.b(x - 1, 0, 2, x + 1, 3, h - 2, "secondary")
    if kind == "full":
        p.b(2, 0, h // 2 - 1, w - 2, 3, h // 2 + 1, "secondary")
    p.b(2, 3, 2, w - 2, 4, 3, "emit_a")
    return p


def cas_port(w, h):
    p = Piece(f"cas.window.port.w{w // 16}.h{h}", "glazing", "face", (w, 4, h))
    p.b(0, 0, 0, w, 1, h, "secondary").disc("y", w // 2, h // 2, 4, 1, 2, "glass")
    p.disc("y", w // 2, h // 2, 6, 1, 4, "trim", rin=4)
    return p


def cas_rim(w, h, lit):
    p = Piece(f"cas.rim.w{w // 16}.h{h}{'.lit' if lit else ''}", "cassette", "face", (w, 3, h))
    p.b(0, 0, 0, w, 2, h, "secondary").b(3, 2, 1, 7, 3, h - 1, "metal")
    if lit:
        p.b(10, 2, 1, 13, 3, h - 2, "emit_b")
    return p


# --- roof modules: plan X, Y; +Z up from the roof plane
def roof_box(w, d):
    p = Piece(f"roof.box.{w // 16}x{d // 16}", "roof", "top", (w, d, 7))
    p.b(0, 0, 0, w, d, 1, "trim").b(1, 1, 1, w - 1, d - 1, 4, "primary")
    gx0, gx1, gy0, gy1 = 4, w - 4, d // 2, d - 4
    p.b(gx0 - 1, gy0 - 1, 4, gx1 + 1, gy0, 6, "primary").b(gx0 - 1, gy1, 4, gx1 + 1, gy1 + 1, 6, "primary")
    p.b(gx0 - 1, gy0, 4, gx0, gy1, 6, "primary").b(gx1, gy0, 4, gx1 + 1, gy1, 6, "primary")
    p.b(gx0, gy0, 4, gx1, gy1, 5, "dark")
    for y in range(gy0 + 1, gy1 - 1, 2):
        p.b(gx0, y, 5, gx1, y + 1, 6, "metal")
    p.b(3, 3, 4, 11, 11, 7, "primary").b(w - 8, 3, 4, w - 5, 6, 5, "emit_b")
    return p


def roof_vent(w, d):
    p = Piece(f"roof.vent.{w // 16}x{d // 16}", "roof", "top", (w, d, 4))
    p.b(0, 0, 0, w, d, 2, "secondary")
    p.b(2, 2, 2, w - 2, 3, 4, "trim").b(2, d - 3, 2, w - 2, d - 2, 4, "trim")
    p.b(2, 3, 2, 3, d - 3, 4, "trim").b(w - 3, 3, 2, w - 2, d - 3, 4, "trim")
    p.b(3, 3, 2, w - 3, d - 3, 3, "dark")
    for y in range(4, d - 4, 2):
        p.b(3, y, 3, w - 3, y + 1, 4, "metal")
    p.b(1, 1, 2, 3, 3, 4, "emit_b")
    return p


def roof_hatch(w, d):
    p = Piece(f"roof.hatch.{w // 16}x{d // 16}", "roof", "top", (w, d, 9))
    p.b(0, 0, 0, w, d, 3, "primary").b(4, 6, 3, w - 4, d - 6, 7, "accent").b(6, 8, 7, w - 6, d - 8, 8, "accent")
    p.b(w // 2 - 3, d // 2 - 1, 8, w // 2 + 3, d // 2 + 1, 9, "metal")
    p.b(4, 2, 3, 7, 4, 4, "emit_a").b(w - 7, 2, 3, w - 4, 4, 4, "emit_a")
    return p


def roof_greeble(w, d, seed):
    p = Piece(f"roof.greeble.{w // 16}x{d // 16}.s{seed}", "roof", "top", (w, d, 10))
    p.b(0, 0, 0, w, d, 2, "secondary").b(2, d // 2, 2, w - 2, d // 2 + 2, 4, "metal")
    for n in range(7):
        x = 2 + int(H(seed, n, 1) * (w - 12)); y = 2 + int(H(seed, n, 2) * (d - 12))
        sw, sd, sh = 5 + n % 3 * 2, 5 + n % 2 * 3, 3 + n % 4
        p.b(x, y, 2, x + sw, y + sd, 2 + sh, ("primary", "metal", "trim", "primary")[n % 4])
    p.b(w // 2, 3, 2, w // 2 + 2, 5, 10, "metal").b(3, d - 5, 2, 6, d - 3, 4, "emit_b")
    return p


def roof_spine(w, d):
    p = Piece(f"roof.spine.{w // 16}x{d // 16}", "roof", "top", (w, d, 3))
    p.b(0, 0, 0, w, d, 1, "secondary").b(1, 1, 1, w - 1, d - 1, 2, "secondary")
    for x in range(2, w - 3, 6):
        p.b(x, 4, 2, x + 3, 7, 3, "trim").b(x, d - 7, 2, x + 3, d - 4, 3, "trim")
    p.b(4, 1, 2, w - 4, 2, 3, "emit_a").b(4, d - 2, 2, w - 4, d - 1, 3, "emit_a")
    p.b(w // 2 - 5, d // 2 - 4, 2, w // 2 + 5, d // 2 + 4, 3, "trim")
    return p


def roof_logo(w, d):
    p = Piece(f"roof.logo.{w // 16}x{d // 16}", "roof", "top", (w, d, 3))
    p.b(0, 0, 0, w, d, 2, "secondary")
    frame_top(p, 0, 0, w, d, 2, 3, 1, "trim")
    p.decal("emblem", (3, 3, w - 3, d - 3), "top")
    return p


def frame_top(p, x0, y0, x1, y1, z0, z1, t, slot):
    p.b(x0, y0, z0, x1, y0 + t, z1, slot).b(x0, y1 - t, z0, x1, y1, z1, slot)
    p.b(x0, y0 + t, z0, x0 + t, y1 - t, z1, slot).b(x1 - t, y0 + t, z0, x1, y1 - t, z1, slot)


def roof_skylight(w, d):
    p = Piece(f"roof.skylight.{w // 16}x{d // 16}", "glazing", "top", (w, d, 4))
    p.b(0, 0, 0, w, d, 1, "dark")
    frame_top(p, 0, 0, w, d, 0, 3, 2, "secondary")
    p.b(w // 2 - 1, 2, 0, w // 2 + 1, d - 2, 3, "secondary").b(2, d // 2 - 1, 0, w - 2, d // 2 + 1, 3, "secondary")
    p.b(2, 2, 1, w - 2, d - 2, 2, "glass")
    p.b(2, 0, 3, w - 2, 1, 4, "emit_a").b(2, d - 1, 3, w - 2, d, 4, "emit_a")
    return p


def roof_rim(kind):
    p = Piece(f"roof.rim.{kind}", "roof", "top", (16, 16, 4))
    p.b(0, 0, 0, 16, 16, 2, "primary")
    if kind == "bump":
        p.b(5, 5, 2, 11, 11, 3, "metal")
    elif kind == "lit":
        p.b(6, 6, 2, 10, 10, 3, "trim").b(7, 7, 3, 9, 9, 4, "emit_b")
    elif kind == "vent":
        p.b(3, 3, 2, 13, 13, 3, "dark")
        for y in range(4, 12, 2):
            p.b(3, y, 3, 13, y + 1, 4, "metal")
    return p


# --- external mounts
def turret_top():
    p = Piece("mount.turret.top.2x2", "mount", "top", (32, 32, 15))
    p.disc("z", 16, 16, 15, 0, 2, "trim").disc("z", 16, 16, 12, 2, 4, "secondary")
    p.b(6, 7, 4, 24, 25, 11, "primary").b(20, 6, 4, 26, 26, 10, "accent").b(8, 9, 11, 22, 23, 12, "primary")
    p.b(26, 11, 6, 50, 14, 9, "metal").b(26, 18, 6, 50, 21, 9, "metal")
    p.b(48, 10, 5, 52, 15, 10, "trim").b(48, 17, 5, 52, 22, 10, "trim")
    p.b(8, 20, 11, 13, 25, 14, "secondary").b(9, 21, 14, 12, 24, 15, "emit_a")
    return p


def side_cannon():
    p = Piece("mount.cannon.side.1x1", "mount", "face", (16, 34, 14))
    p.b(0, 0, 0, 16, 6, 14, "secondary").b(1, 6, 1, 15, 8, 13, "primary").b(4, 8, 4, 12, 12, 10, "accent")
    p.b(6, 12, 5, 10, 32, 9, "metal").b(5, 30, 4, 11, 34, 10, "trim").b(2, 8, 11, 4, 9, 13, "emit_b")
    return p


def engine(pid, w, h, L):
    p = Piece(pid, "mount", "face", (w, L + 8, h))
    e = max(3, w // 8)
    p.b(0, 0, 0, w, L // 2, h, "primary").b(0, L // 2, 0, w, L - 4, h, "primary")
    p.b(-1, L // 2 - 3, -1, w + 1, L // 2 + 3, h + 1, "accent")
    for y0, y1 in ((3, L // 2 - 3), (L // 2 + 4, L - 6)):
        p.b(e, y0, h, w - e, y1, h + 1, "dark")
        for y in range(y0 + 1, y1 - 1, 2):
            p.b(e + 1, y, h + 1, w - e - 1, y + 1, h + 2, "metal")
        p.b(e - 1, y0 - 1, h, e, y1 + 1, h + 2, "emit_b").b(w - e, y0 - 1, h, w - e + 1, y1 + 1, h + 2, "emit_b")
    p.b(-1, L - 12, h // 2 - 4, 0, L - 8, h // 2 + 4, "emit_b").b(w, L - 12, h // 2 - 4, w + 1, L - 8, h // 2 + 4, "emit_b")
    p.b(-2, L - 4, -2, w + 2, L, h + 2, "secondary")
    r = min(w, h) // 2 - 2
    p.disc("y", w // 2, h // 2, r, L, L + 6, "metal").disc("y", w // 2, h // 2, r - 3, L + 5, L + 7, "dark")
    p.disc("y", w // 2, h // 2, r - 5, L + 6, L + 8, "emit_a")
    return p


def thruster():
    p = Piece("mount.thruster.s", "mount", "face", (12, 9, 12))
    p.b(0, 0, 0, 12, 4, 12, "secondary").disc("y", 6, 6, 4, 4, 8, "metal").disc("y", 6, 6, 3, 8, 9, "emit_a")
    return p


def tractor():
    p = Piece("mount.tractor.2x2", "mount", "top", (32, 32, 11))
    p.disc("z", 16, 16, 14, 0, 2, "trim").b(12, 12, 2, 20, 20, 8, "metal")
    p.disc("z", 16, 16, 8, 8, 10, "accent", rin=5).disc("z", 16, 16, 5, 8, 11, "emit_a")
    return p


def dish():
    p = Piece("mount.dish.2x2", "mount", "top", (32, 32, 23))
    p.b(10, 10, 0, 22, 22, 3, "secondary").b(15, 15, 3, 17, 17, 10, "metal")
    p.disc("z", 16, 16, 6, 10, 11, "primary").disc("z", 16, 16, 10, 11, 12, "primary", rin=5)
    p.disc("z", 16, 16, 13, 12, 13, "primary", rin=9).disc("z", 16, 16, 15, 13, 14, "primary", rin=12)
    p.b(15, 15, 14, 17, 17, 22, "metal").b(14, 14, 22, 18, 18, 23, "emit_b")
    return p


def cargo_door():
    p = Piece("edge.cargo-door.4m", "mount", "face", (64, 4, 40))
    frame(p, 0, 0, 64, 40, 0, 3, 4, "secondary")
    for i in range(4):
        z0 = 5 + i * 8
        p.b(5, 0, z0, 59, 2, z0 + 7, "primary")
    for x in range(0, 64, 6):
        p.b(x, 3, 0, x + 3, 4, 3, "trim")
    p.b(4, 2, 4, 5, 3, 36, "metal").b(59, 2, 4, 60, 3, 36, "metal")
    p.b(1, 3, 37, 4, 4, 39, "emit_b").b(60, 3, 37, 63, 4, 39, "emit_b")
    return p


def airlock():
    p = Piece("edge.airlock.2m", "mount", "face", (32, 7, 40))
    p.b(0, 0, 0, 32, 2, 40, "secondary").disc("y", 16, 20, 14, 2, 6, "trim", rin=10)
    p.disc("y", 16, 20, 10, 1, 3, "metal").b(15, 3, 11, 17, 4, 29, "dark").b(14, 6, 34, 18, 7, 36, "emit_a")
    return p


# --- interior edges (plan X along the edge, thickness Y, Z up from floor top): pressure semantics differ
def edge_wall(kind):
    p = Piece(f"edge.wall.{kind}", "interior-edge", "edge", (16, 4, 48))
    if kind == "full":            # seals
        p.b(0, 0, 0, 16, 4, 4, "trim").b(0, 0, 4, 16, 4, 16, "secondary").b(0, 0, 16, 16, 4, 46, "primary")
        p.b(0, 0, 46, 16, 4, 48, "trim").b(4, 4, 36, 12, 5, 37, "emit_a")
    elif kind == "glazed":        # half wall + glass to the ceiling: seals
        p.b(0, 0, 0, 16, 4, 16, "primary").b(0, 0, 16, 16, 4, 18, "trim")
        p.b(0, 0, 18, 2, 4, 48, "trim").b(14, 0, 18, 16, 4, 48, "trim").b(0, 0, 46, 16, 4, 48, "trim")
        p.b(2, 1, 18, 14, 3, 46, "glass")
    else:                         # true half wall / railing: never seals
        p.b(0, 0, 0, 16, 4, 16, "primary").b(0, 0, 16, 16, 4, 18, "trim").b(1, 1, 18, 2, 3, 26, "metal")
        p.b(14, 1, 18, 15, 3, 26, "metal").b(0, 1, 26, 16, 3, 27, "metal")
    return p


def edge_door():
    p = Piece("edge.door.2m", "interior-edge", "edge", (32, 4, 48))
    p.b(0, 0, 0, 6, 4, 48, "primary").b(26, 0, 0, 32, 4, 48, "primary").b(6, 0, 38, 26, 4, 48, "secondary")
    p.b(6, 1, 0, 12, 3, 38, "metal").b(8, 4, 40, 24, 5, 42, "emit_a").b(6, 0, 0, 26, 4, 1, "trim")
    return p


def floor_tile():
    p = Piece("plan.floor.1x1", "hull-shape", "plan", (16, 16, 3))
    p.b(0, 0, 0, 16, 16, 2, "trim")
    for x, y in ((1, 1), (8, 1), (1, 8), (8, 8)):
        p.b(x, y, 2, x + 7, y + 7, 3, "secondary")
    return p


# --- hull shape tiles (plan cells on the 1 m grid, stepped at 1/8 m)
def raster_cells(poly, bands, colour):
    """Rasterise a convex plan polygon (metres) into per-1 m-cell stepped boxes (2-texel rows),
    split into z bands. colour(cx, cy, band) -> slot. Returns boxes in texels."""
    xs = [p[0] for p in poly]; ys = [p[1] for p in poly]
    boxes = []

    def span(yc):
        pts = []
        n = len(poly)
        for a in range(n):
            (x0, y0), (x1, y1) = poly[a], poly[(a + 1) % n]
            if (y0 <= yc < y1) or (y1 <= yc < y0):
                pts.append(x0 + (yc - y0) * (x1 - x0) / (y1 - y0))
        return (min(pts), max(pts)) if len(pts) >= 2 else None

    for cy in range(int(math.floor(min(ys))), int(math.ceil(max(ys)))):
        for cx in range(int(math.floor(min(xs))), int(math.ceil(max(xs)))):
            rows = []
            for r in range(8):
                yc = cy + (2 * r + 1) * T
                sp = span(yc)
                if sp is None:
                    rows.append(None)
                    continue
                xa = max(cx * 16, int(round(sp[0] * 8)) * 2)
                xb = min(cx * 16 + 16, int(round(sp[1] * 8)) * 2)
                rows.append((xa, xb) if xb > xa else None)
            r = 0
            while r < 8:
                if rows[r] is None:
                    r += 1
                    continue
                r1 = r
                while r1 + 1 < 8 and rows[r1 + 1] == rows[r]:
                    r1 += 1
                xa, xb = rows[r]
                for bi in range(len(bands) - 1):
                    boxes.append((xa, cy * 16 + 2 * r, bands[bi], xb, cy * 16 + 2 * r1 + 2, bands[bi + 1], colour(cx, cy, bi)))
                r = r1 + 1
    return boxes


def hull_tile(name, poly):
    p = Piece(f"hull.{name}", "hull-shape", "plan", (16 * math.ceil(max(x for x, _ in poly)), 16 * math.ceil(max(y for _, y in poly)), 54))
    for bx in raster_cells(poly, BODY_Z[:1] + BODY_Z[1:], lambda cx, cy, b: ("secondary", "primary", "primary")[b]):
        p.b(*bx)
    return p


def decorator(kind):
    if kind == "spike":
        p = Piece("deco.spike", "decorator", "top", (6, 6, 14))
        p.b(0, 0, 0, 6, 6, 3, "trim").b(1, 1, 3, 5, 5, 7, "metal").b(2, 2, 7, 4, 4, 14, "metal")
    elif kind == "crystal":
        p = Piece("deco.crystal", "decorator", "top", (6, 6, 20))
        p.b(0, 0, 0, 6, 6, 4, "trim").b(1, 1, 4, 5, 5, 13, "emit_a").b(2, 2, 13, 4, 4, 20, "emit_a")
    else:
        p = Piece("deco.antenna", "decorator", "top", (4, 4, 18))
        p.b(0, 0, 0, 4, 4, 2, "secondary").b(1, 1, 2, 3, 3, 17, "metal").b(1, 1, 17, 3, 3, 18, "emit_b")
    return p


# =========================================================================== MATERIALS / THEMES
THEMES = {
    "federation": dict(primary=(0.62, 0.61, 0.60), secondary=(0.035, 0.04, 0.07), accent=(0.42, 0.02, 0.045),
                       trim=(0.075, 0.08, 0.10), metal=(0.36, 0.37, 0.40), dark=(0.008, 0.008, 0.012),
                       emit_a=((0.10, 0.55, 1.0), 8.0), emit_b=((1.0, 0.45, 0.08), 7.0), glass=(0.3, 0.65, 1.0),
                       wear=0.0, wear_col=(0.05, 0.045, 0.04), on_dark=(0.85, 0.84, 0.80), on_light=(0.05, 0.05, 0.08),
                       name="WAYFARER", number="WF-01", emblem="planet"),
    "riftjack": dict(primary=(0.24, 0.21, 0.19), secondary=(0.025, 0.022, 0.022), accent=(0.40, 0.025, 0.02),
                     trim=(0.70, 0.45, 0.02), metal=(0.25, 0.23, 0.22), dark=(0.006, 0.005, 0.005),
                     emit_a=((1.0, 0.28, 0.04), 8.0), emit_b=((1.0, 0.05, 0.03), 7.0), glass=(0.9, 0.45, 0.2),
                     wear=0.35, wear_col=(0.11, 0.045, 0.018), on_dark=(0.80, 0.78, 0.70), on_light=(0.80, 0.78, 0.70),
                     name="RIFTJACK", number="RJ-66", emblem="skull"),
    "aurelian": dict(primary=(0.58, 0.52, 0.68), secondary=(0.05, 0.025, 0.10), accent=(0.70, 0.50, 0.12),
                     trim=(0.16, 0.07, 0.26), metal=(0.55, 0.48, 0.62), dark=(0.01, 0.004, 0.02),
                     emit_a=((0.85, 0.15, 1.0), 9.0), emit_b=((0.15, 0.85, 1.0), 7.0), glass=(0.6, 0.35, 1.0),
                     wear=0.0, wear_col=(0.1, 0.1, 0.1), on_dark=(0.90, 0.80, 1.0), on_light=(0.20, 0.08, 0.30),
                     name="SYNOD", number="AS-07", emblem="crystal"),
}
SLOT_PBR = {"primary": (0.48, 0.10, 0.35), "secondary": (0.42, 0.20, 0.30), "accent": (0.40, 0.10, 0.35),
            "trim": (0.40, 0.45, 0.30), "metal": (0.30, 0.85, 0.12), "dark": (0.80, 0.0, 0.0)}   # rough, metal, bump


def detail_height(path, n=512):
    """Tiling 1 m detail height: 0.5 m panel seams, rivet rows beside them, fine noise."""
    y, x = np.mgrid[0:n, 0:n].astype(np.float32)
    rng = np.random.default_rng(7)
    noise = np.kron(rng.standard_normal((n // 8, n // 8)).astype(np.float32), np.ones((8, 8), np.float32))
    for _ in range(4):
        noise = (noise + np.roll(noise, 1, 0) + np.roll(noise, -1, 0) + np.roll(noise, 1, 1) + np.roll(noise, -1, 1)) / 5
    h = 0.55 + 0.05 * noise
    s = n // 2
    for axis in (x, y):
        d = np.minimum(axis % s, s - axis % s)
        h -= 0.35 * np.clip(1 - d / 3.0, 0, 1)
    step = n // 16
    for c in range(step // 2, n, step):
        for o in (9, s - 9, s + 9, n - 9):
            for rx, ry in ((c, o), (o, c)):
                h += 0.28 * np.clip(1 - (np.hypot(x - rx, y - ry) / 4.5) ** 2, 0, 1)
    for k in range(10):                                   # a few light scratches
        a = rng.uniform(0, math.pi); cx, cy = rng.uniform(0, n, 2); L = rng.uniform(30, 120)
        t = (x - cx) * math.cos(a) + (y - cy) * math.sin(a)
        dd = np.abs(-(x - cx) * math.sin(a) + (y - cy) * math.cos(a))
        h -= 0.06 * ((dd < 0.8) & (np.abs(t) < L)).astype(np.float32)
    h = np.clip(h, 0, 1)
    img = bpy.data.images.new("detail_height", n, n, alpha=False)
    img.colorspace_settings.name = "Non-Color"
    rgba = np.stack([h, h, h, np.ones_like(h)], -1).astype(np.float32)
    img.pixels.foreach_set(rgba.ravel())
    img.filepath_raw, img.file_format = path, "PNG"
    img.save()
    return img


def slot_material(theme_name, slot, th, detail):
    m = bpy.data.materials.new(f"{theme_name}.{slot}")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(b.outputs[0], out.inputs[0])
    if slot == "glass":
        b.inputs["Base Color"].default_value = (*th["glass"], 1)
        b.inputs["Roughness"].default_value = 0.04
        b.inputs["Alpha"].default_value = 0.35
        b.inputs["Emission Color"].default_value = (*th["glass"], 1)
        b.inputs["Emission Strength"].default_value = 0.9
        m.surface_render_method = "BLENDED"
        return m
    if slot in ("emit_a", "emit_b"):
        col, strength = th[slot]
        b.inputs["Base Color"].default_value = (*col, 1)
        b.inputs["Emission Color"].default_value = (*col, 1)
        b.inputs["Emission Strength"].default_value = strength
        return m
    rough, metal, bump = SLOT_PBR[slot]
    tc = nt.nodes.new("ShaderNodeTexCoord")
    tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = detail; tex.projection = "BOX"; tex.projection_blend = 0.2
    nt.links.new(tc.outputs["Object"], tex.inputs["Vector"])
    bp = nt.nodes.new("ShaderNodeBump"); bp.inputs["Strength"].default_value = bump; bp.inputs["Distance"].default_value = 0.004
    nt.links.new(tex.outputs["Color"], bp.inputs["Height"])
    nt.links.new(bp.outputs["Normal"], b.inputs["Normal"])
    base = nt.nodes.new("ShaderNodeRGB"); base.outputs[0].default_value = (*th[slot], 1)
    colour = base.outputs[0]
    if th["wear"] > 0 and slot != "dark":
        nz = nt.nodes.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 5.0; nz.inputs["Detail"].default_value = 8
        nt.links.new(tc.outputs["Object"], nz.inputs["Vector"])
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.62 - 0.22 * th["wear"]
        ramp.color_ramp.elements[1].position = 0.70 - 0.20 * th["wear"]
        nt.links.new(nz.outputs["Fac"], ramp.inputs["Fac"])
        mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"
        nt.links.new(ramp.outputs["Color"], mix.inputs["Factor"])
        nt.links.new(colour, mix.inputs[6])
        mix.inputs[7].default_value = (*th["wear_col"], 1)
        colour = mix.outputs[2]
        rmix = nt.nodes.new("ShaderNodeMix"); rmix.data_type = "FLOAT"
        nt.links.new(ramp.outputs["Color"], rmix.inputs["Factor"])
        rmix.inputs[2].default_value = rough; rmix.inputs[3].default_value = 0.85
        nt.links.new(rmix.outputs[0], b.inputs["Roughness"])
    else:
        b.inputs["Roughness"].default_value = rough
    nt.links.new(colour, b.inputs["Base Color"])
    b.inputs["Metallic"].default_value = metal
    return m


def decal_material(name, image, colour):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = image
    b.inputs["Base Color"].default_value = (*colour, 1)
    b.inputs["Roughness"].default_value = 0.62
    nt.links.new(tex.outputs["Alpha"], b.inputs["Alpha"])
    m.surface_render_method = "BLENDED"
    return m


def text_mask(text, path, w=1024, h=256):
    sc = bpy.data.scenes.new(f"decal_{text}")
    sc.render.engine = "BLENDER_EEVEE_NEXT"
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.render.film_transparent = True
    sc.view_settings.view_transform = "Standard"
    cu = bpy.data.curves.new(f"txt_{text}", "FONT")
    cu.body, cu.align_x, cu.align_y, cu.space_character = text, "CENTER", "CENTER", 1.05
    ob = bpy.data.objects.new(f"txt_{text}", cu)
    sc.collection.objects.link(ob)
    em = bpy.data.materials.new("decal_white"); em.use_nodes = True
    nt = em.node_tree; nt.nodes.clear()
    e = nt.nodes.new("ShaderNodeEmission"); e.inputs["Color"].default_value = (1, 1, 1, 1)
    o = nt.nodes.new("ShaderNodeOutputMaterial"); nt.links.new(e.outputs[0], o.inputs[0])
    cu.materials.append(em)
    cam = bpy.data.objects.new(f"cam_{text}", bpy.data.cameras.new(f"cam_{text}"))
    sc.collection.objects.link(cam)
    cam.data.type, cam.data.ortho_scale = "ORTHO", max(3.8, 0.68 * len(text) + 0.6)
    cam.location = (0, 0, 5)
    sc.camera = cam
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True, scene=sc.name)
    img = bpy.data.images.load(path)
    return img


def emblem_mask(kind, path, n=512):
    y, x = np.mgrid[0:n, 0:n].astype(np.float32)
    y = n - 1 - y
    c = n / 2
    u, v = x - c, y - c
    if kind == "planet":
        disc = u * u + v * v <= 140 ** 2
        a = math.radians(-18)
        ru, rv = u * math.cos(a) - v * math.sin(a), u * math.sin(a) + v * math.cos(a)
        e = (ru / 235) ** 2 + (rv / 62) ** 2
        ring = (np.abs(e - 1) < 0.16)
        front = rv < 0
        gap = (np.abs(e - 1) < 0.34) & disc & front
        m = (disc & ~gap) | (ring & (front | ~disc))
    elif kind == "skull":
        head = (u * u + (v - 30) ** 2 <= 150 ** 2)
        jaw = (np.abs(u) < 90) & (v > -170) & (v < -60)
        eyes = ((u - 55) ** 2 + (v - 30) ** 2 <= 40 ** 2) | ((u + 55) ** 2 + (v - 30) ** 2 <= 40 ** 2)
        nose = (np.abs(u) < 18 - (30 - v) * 0.4) & (v < -10) & (v > -55)
        teeth = (np.abs(u) < 90) & (v > -170) & (v < -110) & ((np.abs(u) % 30) < 6)
        bars = ((np.abs(u - v) < 22) | (np.abs(u + v) < 22)) & (np.abs(u) < 230) & (np.abs(v) < 230)
        m = ((head | jaw) & ~eyes & ~nose & ~teeth) | (bars & ~(head | jaw))
    else:
        m = np.zeros_like(u, dtype=bool)
        for cx, w, h in ((0, 70, 220), (-120, 45, 140), (120, 45, 140)):
            m |= (np.abs(u - cx) / w + np.abs(v) / h) <= 1
        m &= ~((np.abs(u) / 70 + np.abs(v) / 220 <= 1) & (np.abs(u) < 4))
    a = m.astype(np.float32)
    img = bpy.data.images.new(f"emblem_{kind}", n, n, alpha=True)
    img.pixels.foreach_set(np.stack([np.ones_like(a), np.ones_like(a), np.ones_like(a), a], -1).ravel())
    img.filepath_raw, img.file_format = path, "PNG"
    img.save()
    return img


# =========================================================================== MESHES / PLACEMENT
MESHES = {}
PLACEMENTS = {"count": 0}


def piece_mesh(piece):
    me = MESHES.get(piece.id)
    if me is not None:
        return me
    verts, faces, mats = [], [], []
    for x0, y0, z0, x1, y1, z1, slot in piece.boxes:
        o = len(verts)
        verts += [(x * T, y * T, z * T) for x, y, z in
                  ((x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1))]
        faces += [(o, o + 3, o + 2, o + 1), (o + 4, o + 5, o + 6, o + 7), (o, o + 1, o + 5, o + 4),
                  (o + 1, o + 2, o + 6, o + 5), (o + 2, o + 3, o + 7, o + 6), (o + 3, o, o + 4, o + 7)]
        mats += [SI[slot]] * 6
    me = bpy.data.meshes.new(piece.id)
    me.from_pydata(verts, [], faces)
    for s in SLOTS:
        me.materials.append(None)
    me.polygons.foreach_set("material_index", mats)
    me.polygons.foreach_set("use_smooth", [True] * len(faces))
    MESHES[piece.id] = me
    return me


def instance(piece, loc, rot_deg, theme_mats, coll, bevel=0.012):
    ob = bpy.data.objects.new(piece.id, piece_mesh(piece))
    coll.objects.link(ob)
    ob.location, ob.rotation_euler = Vector(loc), (0, 0, math.radians(rot_deg))
    for i, s in enumerate(SLOTS):
        ob.material_slots[i].link = "OBJECT"
        ob.material_slots[i].material = theme_mats[s]
    md = ob.modifiers.new("brick", "BEVEL")
    md.width, md.segments, md.limit_method, md.angle_limit = bevel, 2, "ANGLE", math.radians(30)
    md.harden_normals, md.use_clamp_overlap = True, True
    PLACEMENTS["count"] += 1
    if getattr(piece, "plumes", None) and "plume_outer" in theme_mats:
        attach_plumes(piece, ob, theme_mats, coll)
    return ob


def decal_quad(name, piece, sock, mat, loc, rot_deg, coll, aspect):
    kind, (a0, b0, a1, b1), plane = sock
    sw, sh = (a1 - a0) * T, (b1 - b0) * T
    w = min(sw, sh * aspect); h = w / aspect
    ca, cb = (a0 + a1) / 2 * T, (b0 + b1) / 2 * T
    if plane == "face":
        y = max(bx[4] for bx in piece.boxes) * T + 0.003
        v = [(ca - w / 2, y, cb - h / 2), (ca - w / 2, y, cb + h / 2), (ca + w / 2, y, cb + h / 2), (ca + w / 2, y, cb - h / 2)]
        uv = [(1, 0), (1, 1), (0, 1), (0, 0)]
    else:
        z = max(bx[5] for bx in piece.boxes) * T + 0.003
        v = [(ca - w / 2, cb - h / 2, z), (ca + w / 2, cb - h / 2, z), (ca + w / 2, cb + h / 2, z), (ca - w / 2, cb + h / 2, z)]
        uv = [(0, 0), (1, 0), (1, 1), (0, 1)]
    me = bpy.data.meshes.new(name)
    me.from_pydata(v, [], [(0, 1, 2, 3)])
    lay = me.uv_layers.new()
    for li, loop in enumerate(me.loops):
        lay.data[li].uv = uv[loop.vertex_index]
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    ob.location, ob.rotation_euler = Vector(loc), (0, 0, math.radians(rot_deg))
    return ob


def top_decal(name, mat, x0, y0, x1, y1, z, coll):
    me = bpy.data.meshes.new(name)
    me.from_pydata([(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)], [], [(0, 1, 2, 3)])
    lay = me.uv_layers.new()
    uv = [(0, 0), (1, 0), (1, 1), (0, 1)]
    for li, loop in enumerate(me.loops):
        lay.data[li].uv = uv[loop.vertex_index]
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    return ob


# =========================================================================== SHIP BLUEPRINT (grammar output)

class Kit:
    def __init__(self):
        self.p = {}

    def get(self, key, maker, *args):
        if key not in self.p:
            self.p[key] = maker(*args)
        return self.p[key]



def pack(interval, seed):
    a, b = interval
    out, u = [], a
    while u < b:
        wm = min(b - u, (1, 2, 2, 3)[int(H(u, seed) * 4)])
        out.append((u, wm))
        u += wm
    return out



def subtract(a, b, holes):
    segs = [(a, b)]
    for h0, h1 in holes:
        nxt = []
        for s0, s1 in segs:
            if h1 <= s0 or h0 >= s1:
                nxt.append((s0, s1))
            else:
                if s0 < h0:
                    nxt.append((s0, h0))
                if h1 < s1:
                    nxt.append((h1, s1))
        segs = nxt
    return segs



def label_material():
    m = bpy.data.materials.get("label") or bpy.data.materials.new("label")
    m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    e = nt.nodes.new("ShaderNodeEmission"); e.inputs["Color"].default_value = (0.45, 0.8, 1.0, 1); e.inputs["Strength"].default_value = 2.5
    o = nt.nodes.new("ShaderNodeOutputMaterial"); nt.links.new(e.outputs[0], o.inputs[0])
    return m



def text(body, loc, size, mat, coll):
    cu = bpy.data.curves.new("lbl", "FONT"); cu.body, cu.size = body, size
    cu.materials.append(mat)
    ob = bpy.data.objects.new("lbl", cu); coll.objects.link(ob); ob.location = loc
    return ob



def world(sc):
    w = sc.world or bpy.data.worlds.new("World")
    sc.world = w
    w.use_nodes = True
    nt = w.node_tree; nt.nodes.clear()
    tc = nt.nodes.new("ShaderNodeTexCoord")
    noise = nt.nodes.new("ShaderNodeTexNoise"); noise.inputs["Scale"].default_value = 1.4; noise.inputs["Detail"].default_value = 6
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position, ramp.color_ramp.elements[0].color = 0.4, (0.002, 0.002, 0.008, 1)
    ramp.color_ramp.elements[1].position, ramp.color_ramp.elements[1].color = 0.8, (0.07, 0.015, 0.16, 1)
    vor = nt.nodes.new("ShaderNodeTexVoronoi"); vor.inputs["Scale"].default_value = 320
    lt = nt.nodes.new("ShaderNodeMath"); lt.operation = "LESS_THAN"; lt.inputs[1].default_value = 0.03
    mul = nt.nodes.new("ShaderNodeMath"); mul.operation = "MULTIPLY"; mul.inputs[1].default_value = 3.0
    add = nt.nodes.new("ShaderNodeMix"); add.data_type = "RGBA"; add.blend_type = "ADD"; add.inputs["Factor"].default_value = 1.0
    bg = nt.nodes.new("ShaderNodeBackground"); wo = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(tc.outputs["Generated"], noise.inputs["Vector"]); nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(tc.outputs["Generated"], vor.inputs["Vector"]); nt.links.new(vor.outputs["Distance"], lt.inputs[0])
    nt.links.new(lt.outputs[0], mul.inputs[0]); nt.links.new(ramp.outputs["Color"], add.inputs[6])
    nt.links.new(mul.outputs[0], add.inputs[7]); nt.links.new(add.outputs[2], bg.inputs["Color"]); nt.links.new(bg.outputs[0], wo.inputs[0])




# =========================================================================== r005: DENSER PIECES
def cas_armor(w, h):
    p = Piece(f"cas.armor.w{w // 16}.h{h}", "cassette", "face", (w, 4, h))
    p.b(0, 0, 0, w, 1, h, "trim").b(1, 0, 1, w - 1, 2, h - 1, "primary")
    p.b(2, 2, 2, (w * 2) // 3, 3, h // 2, "primary").b(w // 2, 2, h // 2, w - 2, 3, h - 2, "secondary")
    p.b(3, 3, 3, w // 3, 4, h // 2 - 2, "primary")
    for x in range(3, w - 2, 5):
        p.b(x, 2, h - 3, x + 1, 3, h - 2, "metal").b(x, 2, 1, x + 1, 3, 2, "metal")
    p.b(w - 6, 3, h // 2 + 2, w - 4, 4, h // 2 + 4, "emit_b")
    return p


def cas_pipes(w, h):
    p = Piece(f"cas.pipes.w{w // 16}.h{h}", "cassette", "face", (w, 4, h))
    p.b(0, 0, 0, w, 1, h, "secondary")
    rows = [z for z in (3, 7, 11, 15, 19) if z + 2 < h - 1]
    for n, z in enumerate(rows):
        p.b(0, 1, z, w, 3, z + 2, "metal" if n % 2 == 0 else "trim")
    for x in range(2, w, 6):
        p.b(x, 1, 1, x + 1, 4, h - 1, "trim")
    if w >= 16:
        p.b(w // 2 - 2, 2, rows[0] - 1 if rows else 2, w // 2 + 2, 4, (rows[0] + 3) if rows else 5, "accent")
    p.b(w - 4, 1, h - 3, w - 2, 2, h - 2, "emit_a")
    return p


def cas_module(w, h):
    p = Piece(f"cas.module.w{w // 16}.h{h}", "cassette", "face", (w, 5, h))
    p.b(0, 0, 0, w, 1, h, "dark")
    cw, ch = w // 2, h // 2
    kinds = [("primary", 3), ("metal", 2), ("secondary", 2), ("primary", 4)]
    for n, (x0, z0) in enumerate(((0, 0), (cw, 0), (0, ch), (cw, ch))):
        slot, dep = kinds[(n + w + h) % 4]
        p.b(x0 + 1, 1, z0 + 1, x0 + cw - 1, dep, z0 + ch - 1, slot)
    for z in range(ch + 2, h - 2, 2):
        p.b(cw + 2, 2, z, w - 2, 3, z + 1, "dark")
    p.b(2, 3, 2, 4, 4, 4, "emit_b").b(cw - 3, 3, h - 4, cw - 1, 5, h - 2, "metal")
    return p


def cas_beacon(w, h):
    p = Piece(f"cas.beacon.w{w // 16}.h{h}", "cassette", "face", (w, 6, h))
    p.b(0, 0, 0, w, 2, h, "secondary").b(2, 2, 2, w - 2, 4, h - 6, "primary")
    p.b(w // 2 - 3, 2, h - 6, w // 2 + 3, 5, h - 2, "trim").b(w // 2 - 2, 5, h - 5, w // 2 + 2, 6, h - 3, "emit_b")
    p.b(3, 4, 3, 5, 5, 5, "metal").b(w - 5, 4, 3, w - 3, 5, 5, "metal")
    return p


def roof_pipes(w, d):
    p = Piece(f"roof.pipes.{w // 16}x{d // 16}", "roof", "top", (w, d, 6))
    p.b(0, 0, 0, w, d, 1, "secondary")
    for n, y in enumerate(range(3, d - 3, 5)):
        p.b(0, y, 1, w, y + 3, 4 if n % 2 == 0 else 3, "metal" if n % 2 == 0 else "trim")
    for x in range(2, w, 8):
        p.b(x, 1, 1, x + 2, d - 1, 5, "trim")
    p.b(w // 2 - 3, d // 2 - 3, 1, w // 2 + 3, d // 2 + 3, 6, "accent").b(1, 1, 1, 3, 3, 3, "emit_b")
    return p


def roof_radiator(w, d):
    p = Piece(f"roof.radiator.{w // 16}x{d // 16}", "roof", "top", (w, d, 6))
    p.b(0, 0, 0, w, d, 1, "trim")
    frame_top(p, 0, 0, w, d, 1, 3, 1, "secondary")
    for y in range(2, d - 2, 2):
        p.b(2, y, 1, w - 2, y + 1, 5, "primary")
    p.b(w - 4, 1, 3, w - 2, 3, 4, "emit_a")
    return p


def roof_tanks(w, d):
    p = Piece(f"roof.tanks.{w // 16}x{d // 16}", "roof", "top", (w, d, 12))
    p.b(0, 0, 0, w, d, 1, "secondary")
    n = max(1, d // 12)
    r = min(d // (2 * n) - 1, 7)
    for k in range(n):
        cy = (2 * k + 1) * d // (2 * n)
        p.disc("x", cy, r + 1, r, 2, w - 2, "primary")
        p.b(1, cy - r + 1, 1, 3, cy + r - 1, 2 * r, "trim").b(w - 3, cy - r + 1, 1, w - 1, cy + r - 1, 2 * r, "trim")
        p.b(w // 2 - 1, cy - r - 1, 1, w // 2 + 1, cy + r + 1, 2 * r + 1, "accent")
    p.b(2, 1, 1, 4, 3, 3, "emit_b")
    return p


def roof_cargo(w, d):
    p = Piece(f"roof.cargo.{w // 16}x{d // 16}", "roof", "top", (w, d, 10))
    p.b(0, 0, 0, w, d, 1, "trim")
    slots = ("accent", "primary", "secondary", "primary")
    for i, x in enumerate(range(1, w - 6, 8)):
        for j, y in enumerate(range(1, d - 6, 8)):
            hgt = 4 + (i + j) % 2 * 4
            p.b(x, y, 1, x + 7, y + 7, 1 + hgt, slots[(i + 2 * j) % 4])
            p.b(x, y + 3, 1 + hgt - 1, x + 7, y + 4, 1 + hgt, "metal")
    return p


def roof_small(kind):
    """1x1 dense fillers."""
    p = Piece(f"roof.s.{kind}", "roof", "top", (16, 16, 8))
    p.b(0, 0, 0, 16, 16, 2, "primary")
    if kind == "box":
        p.b(3, 3, 2, 13, 13, 5, "primary").b(5, 5, 5, 11, 11, 6, "metal").b(12, 2, 2, 14, 4, 4, "emit_b")
    elif kind == "vent":
        p.b(2, 2, 2, 14, 14, 3, "dark")
        for y in range(3, 13, 2):
            p.b(2, y, 3, 14, y + 1, 4, "metal")
    elif kind == "fan":
        p.disc("z", 8, 8, 6, 2, 3, "dark").disc("z", 8, 8, 7, 2, 4, "trim", rin=6).b(7, 2, 3, 9, 14, 4, "metal").b(2, 7, 3, 14, 9, 4, "metal")
    elif kind == "sensor":
        p.b(5, 5, 2, 11, 11, 4, "secondary").b(7, 7, 4, 9, 9, 8, "metal").b(6, 6, 8, 10, 10, 9, "emit_a")
    elif kind == "hatch":
        p.b(2, 2, 2, 14, 14, 4, "accent").b(6, 7, 4, 10, 9, 5, "metal")
    return p


def roof_module(w, d, kind):
    makers = {"box": roof_box, "vent": roof_vent, "hatch": roof_hatch, "pipes": roof_pipes, "radiator": roof_radiator,
              "tanks": roof_tanks, "cargo": roof_cargo, "spine": roof_spine}
    if kind == "greeble":
        return roof_greeble(w, d, (w + d) % 3)
    return makers[kind](w, d)


def skylight(w, d):
    return roof_skylight(w, d)


# =========================================================================== r006: SIZE-CLASS MOUNTS
# Hardpoint footprints are whole cells so the grammar can reserve them: SM 1x1, MD 2x2, LG 3x3, XL 4x4 (metres).
# A 3.5 m deck face hosts up to LG; XL is rear-only and may overhang the hull height (vertically centred).
SIZE_CELLS = {"SM": 1, "MD": 2, "LG": 3, "XL": 4}
ION_LEN = {"SM": 34, "MD": 56, "LG": 80, "XL": 112}       # body length in texels (2.1 / 3.5 / 5 / 7 m)


def oct_rows(r, ch, rin=0, chin=0):
    """Rows (k, half, hin) of a chamfered-square (octagonal) section of half-size r, chamfer ch."""
    rows = []
    for k in range(-r, r):
        q = abs(k + 0.5)
        half = r if q <= r - ch else int(round(r - (q - (r - ch))))
        hin = 0
        if rin and q < rin:
            hin = rin if q <= rin - chin else max(0, int(round(rin - (q - (rin - chin)))))
        rows.append((k, half, hin))
    return rows


def tube(p, cx, cz, r, ch, y0, y1, slot, rin=0, chin=0):
    """Octagonal tube along +Y centred on (cx, cz); merged rows. rin > 0 makes it hollow."""
    rows = oct_rows(r, ch, rin, chin)
    start = 0
    for n in range(1, len(rows) + 1):
        if n == len(rows) or rows[n][1:] != rows[start][1:]:
            k0, k1, half, hin = rows[start][0], rows[n - 1][0] + 1, rows[start][1], rows[start][2]
            spans = [(cx - half, cx + half)] if not hin else [(cx - half, cx - hin), (cx + hin, cx + half)]
            for u0, u1 in spans:
                p.b(u0, y0, cz + k0, u1, y1, cz + k1, slot)
            start = n
    return p


def ion_parts(sz):
    """Round, segmented ion-drive pod (reference 'Engine Assembly'): flange, housing bands with raised
    plates, conduit layer, stepped nozzle bell with a glowing core. Returns ordered parts + metadata."""
    W = 16 * SIZE_CELLS[sz]
    L = ION_LEN[sz]
    r = W // 2 - 2
    ch = max(2, int(r * 0.5))
    cx = cz = W // 2
    base = f"mount.engine.ion.{sz}"
    fl, ho, co, no = (Piece(f"{base}.{k}", "engine-part", "face", (W, 0, W)) for k in ("flange", "housing", "conduit", "nozzle"))
    # mounting flange: square plate + bolt ring, sized to the hardpoint
    fl.b(0, 0, 0, W, 2, W, "trim")
    tube(fl, cx, cz, r + 1, ch, 2, 5, "secondary")
    for x, z in ((1, 1), (W - 3, 1), (1, W - 3), (W - 3, W - 3)):
        fl.b(x, 2, z, x + 2, 3, z + 2, "metal")
    # housing: segmented bands; slot pattern echoes the reference (navy / white / crimson / white ...)
    seg = max(8, (W // 3) & ~1)
    n = max(3, (L - 6) // seg)
    pattern = ["secondary", "primary", "primary", "accent", "primary", "secondary", "primary", "accent"]
    y = 5
    for i in range(n):
        y0, y1 = y, y + seg
        slot = pattern[(i + SIZE_CELLS[sz]) % len(pattern)]
        gap = "emit_a" if i == n // 2 else "dark"                      # reactor ring glows mid-body
        extrude(ho, "y", cx, cz, section_rows(r - 1, round_=True), y0, y1, gap)   # recessed gap ring between bands
        extrude(ho, "y", cx, cz, section_rows(r, round_=True), y0 + 1, y1 - 1, slot)
        cs = max(2, r // 4)                                             # chunky blocks on the diagonals
        for s1 in (-1, 1):
            for s2 in (-1, 1):
                bx0, bz0 = cx + s1 * int(r * 0.62), cz + s2 * int(r * 0.62)
                if H(sz, i, s1, s2, 9) < 0.75:
                    ho.b(bx0 - cs // 2, y0 + 2, bz0 - cs // 2, bx0 + cs - cs // 2, y1 - 2, bz0 + cs - cs // 2,
                         "secondary" if (i + s1 + s2) % 3 else "primary")
        pw = max(2, int(r * 0.42))                                      # raised armour plates on the flats
        dep = 1 + int(H(sz, i, 3) * 2)
        pslot = "secondary" if slot != "secondary" else "primary"
        if H(sz, i, 1) < 0.7:
            ho.b(cx - pw, y0 + 2, cz + int(r * 0.85), cx + pw, y1 - 2, cz + r + dep, pslot)   # top
            ho.b(cx - pw, y0 + 2, cz - r - dep, cx + pw, y1 - 2, cz - int(r * 0.85), pslot)   # bottom
        if H(sz, i, 2) < 0.6:
            ho.b(cx + int(r * 0.85), y0 + 2, cz - pw, cx + r + dep, y1 - 2, cz + pw, pslot)   # sides
            ho.b(cx - r - dep, y0 + 2, cz - pw, cx - int(r * 0.85), y1 - 2, cz + pw, pslot)
        h = H(sz, i, 5)
        if h < 0.35 and seg >= 10:                                     # amber status lights
            ho.b(cx + r, y0 + 3, cz + 1, cx + r + 1, y0 + 5, cz + 3, "emit_b")
            ho.b(cx - r - 1, y0 + 3, cz + 1, cx - r, y0 + 5, cz + 3, "emit_b")
        elif h < 0.6 and pw >= 3:                                      # side vents
            for zz in range(cz - pw + 1, cz + pw - 1, 2):
                ho.b(cx + r, y0 + 2, zz, cx + r + 1, y1 - 2, zz + 1, "dark")
                ho.b(cx - r - 1, y0 + 2, zz, cx - r, y1 - 2, zz + 1, "dark")
        y = y1
    body_end = y
    extrude(fl, "y", cx, cz, section_rows(r + 1, rin=r - 2, round_=True), 5, 7, "metal")    # bolted front cap
    for a in range(8):
        ang = a * math.pi / 4 + math.pi / 8
        bx0, bz0 = cx + int(round((r - 0.5) * math.cos(ang))), cz + int(round((r - 0.5) * math.sin(ang)))
        fl.b(bx0 - 1, 7, bz0 - 1, bx0 + 1, 8, bz0 + 1, "trim")
    # conduit layer: fuel / power pipes along the chamfers with clamps and a power coupling
    pr = max(1, r // 8)
    off = r - ch // 2 - pr
    for sx, slot in ((1, "metal"), (-1, "accent")):                  # two pipes on the upper chamfers
        px, pz = cx + sx * off, cz + off
        co.b(px - pr, 6, pz - pr, px + pr, body_end - 2, pz + pr, slot)
        for yy in range(5 + seg, body_end - 4, seg * 2):
            co.b(px - pr - 1, yy, pz - pr - 1, px + pr + 1, yy + 2, pz + pr + 1, "trim")
    co.b(cx - 2, body_end - 6, cz + r, cx + 2, body_end - 3, cz + r + 2, "emit_a")
    # nozzle: collar, stepped bell (dark ribbed), inner cavity and glowing core
    extrude(no, "y", cx, cz, section_rows(r + 1, round_=True), body_end, body_end + 3, "secondary")
    steps = 4 + 2 * SIZE_CELLS[sz]
    yb = body_end + 3
    for k in range(steps):
        rb = int(r * 0.72 + (r * 0.34) * k / max(1, steps - 1))
        slot = "metal" if k % 2 == 0 else "trim"
        no.disc("y", cx, cz, rb, yb, yb + 2, slot, rin=max(1, rb - 2))
        yb += 2
    no.disc("y", cx, cz, int(r * 0.72), body_end + 3, body_end + 4, "dark")
    no.disc("y", cx, cz, int(r * 0.55), body_end + 4, body_end + 6, "emit_a")
    total = yb
    for pc in (fl, ho, co, no):
        pc.size = (W, total, W)
    meta = {"W": W, "total": total, "plumes": [(cx, cz, int(r * 0.62), body_end + 5, W)]}
    return [fl, ho, co, no], meta


def block_engine(sz):
    """Boxy thrust block (industrial): louvred top in an amber frame, crimson band, collar,
    one nozzle (SM-LG) or twin nozzles (XL)."""
    W = 16 * SIZE_CELLS[sz]
    Hh = max(12, int(W * 0.78)) & ~1
    L = {"SM": 30, "MD": 48, "LG": 64, "XL": 80}[sz]
    p = Piece(f"mount.engine.block.{sz}", "mount", "face", (W, L + 8, Hh))
    e = max(2, W // 8)
    z0 = (W - Hh) // 2
    zt = z0 + Hh
    p.b(0, 0, z0, W, L // 2, zt, "primary").b(0, L // 2, z0, W, L - 4, zt, "primary")
    p.b(-1, L // 2 - 3, z0 - 1, W + 1, L // 2 + 3, zt + 1, "accent")
    for ya, yb in ((3, L // 2 - 3), (L // 2 + 4, L - 6)):
        p.b(e, ya, zt, W - e, yb, zt + 1, "dark")
        for yy in range(ya + 1, yb - 1, 2):
            p.b(e + 1, yy, zt + 1, W - e - 1, yy + 1, zt + 2, "metal")
        p.b(e - 1, ya - 1, zt, e, yb + 1, zt + 2, "emit_b").b(W - e, ya - 1, zt, W - e + 1, yb + 1, zt + 2, "emit_b")
    for side in (-1, W):
        p.b(side, 4, z0 + 2, side + 1, L // 2 - 4, z0 + Hh // 3, "secondary")
        p.b(side, L - 12, z0 + Hh // 2 - 2, side + 1, L - 8, z0 + Hh // 2 + 2, "emit_b")
    p.b(-2, L - 4, z0 - 2, W + 2, L, zt + 2, "secondary")
    nozzles = [W // 2] if sz != "XL" else [W // 4, 3 * W // 4]
    r = (min(W // len(nozzles), Hh) // 2) - 2
    plumes = []
    for nx in nozzles:
        p.disc("y", nx, z0 + Hh // 2, r, L, L + 6, "metal")
        p.disc("y", nx, z0 + Hh // 2, r - 2, L + 5, L + 7, "dark")
        p.disc("y", nx, z0 + Hh // 2, max(2, r - 4), L + 6, L + 8, "emit_a")
        plumes.append((nx, z0 + Hh // 2, max(2, r - 3), L + 8, W))
    p.size = (W, L + 8, W)
    p.plumes = plumes
    return p


def ion_engine(sz):
    parts, meta = ion_parts(sz)
    p = Piece(f"mount.engine.ion.{sz}", "mount", "face", (meta["W"], meta["total"], meta["W"]))
    for q in parts:
        p.boxes += q.boxes
    p.plumes = meta["plumes"]
    return p


def rcs(sz):
    k = {"SM": 1, "MD": 2}[sz]
    p = Piece(f"mount.rcs.{sz}", "mount", "face", (8 * k + 4, 8 * k, 8 * k + 4))
    c = 4 * k + 2
    p.b(0, 0, 0, 8 * k + 4, 3, 8 * k + 4, "secondary").b(1, 3, 1, 8 * k + 3, 4 * k + 2, 8 * k + 3, "primary")
    p.disc("y", c, c, 3 * k, 4 * k + 2, 8 * k, "metal").disc("y", c, c, 2 * k, 8 * k - 1, 8 * k, "emit_a")
    p.plumes = [(c, c, max(1, 2 * k - 1), 8 * k, 8 * k)]
    return p


def turret(sz):
    """Top turret: SM single barrel on a 1x1 ring, MD twin on 2x2, LG armoured triple on 3x3."""
    n = SIZE_CELLS[sz]
    W = 16 * n
    c = W // 2
    p = Piece(f"mount.turret.{sz}", "mount", "top", (W, W, 8 + 5 * n))
    p.disc("z", c, c, c - 1, 0, 2, "trim").disc("z", c, c, c - 3, 2, 4, "secondary")
    hw, hd = int(W * 0.30), int(W * 0.26)
    top = 4 + 4 * n
    p.b(c - hw, c - hd, 4, c + hw, c + hd, top, "primary")
    p.b(c + hw - 2 * n, c - hd - 1, 4, c + hw + 1, c + hd + 1, top - 1, "accent")
    p.b(c - hw + 2, c - hd + 2, top, c + hw - 3, c + hd - 2, top + 1, "primary")
    barrels = {1: [0], 2: [-3, 3], 3: [-6, 0, 6]}[n]
    blen = 10 + 12 * n
    bw = 1 + n // 2
    for off in barrels:
        z = 4 + 2 * n
        p.b(c + hw, c + off - bw, z, c + hw + blen, c + off + bw, z + 2 * bw, "metal")
        p.b(c + hw + blen - 3, c + off - bw - 1, z - 1, c + hw + blen, c + off + bw + 1, z + 2 * bw + 1, "trim")
    p.b(c - hw + 2, c + hd - 4, top, c - hw + 5, c + hd - 1, top + 2, "secondary")
    p.b(c - hw + 3, c + hd - 3, top + 2, c - hw + 4, c + hd - 2, top + 3, "emit_a")
    if n == 3:                                                          # armoured shield plates
        p.b(c - hw - 2, c - hd - 2, 4, c + hw - 4, c - hd, top - 2, "secondary")
        p.b(c - hw - 2, c + hd, 4, c + hw - 4, c + hd + 2, top - 2, "secondary")
    return p


def cannon(sz):
    """Side sponson cannon: SM 1 cell, MD 1 cell heavy, LG 2 cells twin."""
    n = {"SM": 1, "MD": 1, "LG": 2}[sz]
    k = {"SM": 1, "MD": 1.5, "LG": 2}[sz]
    W = 16 * n
    Hh = int(10 * k) // 2 * 2
    p = Piece(f"mount.cannon.{sz}", "mount", "face", (W, int(34 * k), Hh + 4))
    p.b(0, 0, 0, W, int(6 * k), Hh + 4, "secondary").b(1, int(6 * k), 1, W - 1, int(9 * k), Hh + 3, "primary")
    p.b(2, int(9 * k), 2, W - 2, int(14 * k), Hh + 2, "accent")
    bar = [W // 2] if n == 1 else [W // 4, 3 * W // 4]
    bw = max(1, int(2 * k))
    for bx in bar:
        p.b(bx - bw, int(14 * k), Hh // 2 + 2 - bw, bx + bw, int(32 * k), Hh // 2 + 2 + bw, "metal")
        p.b(bx - bw - 1, int(30 * k), Hh // 2 + 1 - bw, bx + bw + 1, int(34 * k), Hh // 2 + 3 + bw, "trim")
    p.b(2, int(9 * k), Hh + 2, 4, int(11 * k), Hh + 4, "emit_b")
    return p


def crew_figure():
    p = Piece("ref.crew.1m8", "reference", "top", (8, 5, 29))
    p.b(1, 1, 0, 3, 4, 13, "secondary").b(5, 1, 0, 7, 4, 13, "secondary")
    p.b(0, 0, 13, 8, 5, 23, "primary").b(0, 0, 18, 8, 5, 20, "accent")
    p.b(-2, 1, 14, 0, 4, 22, "primary").b(8, 1, 14, 10, 4, 22, "primary")
    p.b(1, 0, 23, 7, 5, 29, "primary").b(2, -1, 25, 6, 0, 28, "emit_a")
    return p


def plume_mesh(key, r, length):
    """Stepped exhaust plume along +Y (presentation only): outer sleeve + bright core."""
    me = MESHES.get(("plume",) + key)
    if me is not None:
        return me
    verts, faces, mats = [], [], []
    steps = 6
    for layer, (rad0, slot) in enumerate(((r * 1.0, 0), (r * 0.55, 1))):
        for s in range(steps):
            rr = rad0 * (1 - s / steps) ** 1.3
            y0, y1 = length * s / steps, length * (s + 1) / steps
            rr = max(rr, 0.5) * T
            o = len(verts)
            for y in (y0 * T, y1 * T):
                for a in range(8):
                    ang = math.pi / 8 + a * math.pi / 4
                    verts.append((rr * math.cos(ang), y, rr * math.sin(ang)))
            for a in range(8):
                b = (a + 1) % 8
                faces.append((o + a, o + b, o + 8 + b, o + 8 + a)); mats.append(slot)
            faces.append(tuple(o + 8 + a for a in range(8))); mats.append(slot)
    me = bpy.data.meshes.new(f"plume.{key}")
    me.from_pydata(verts, [], faces)
    me.materials.append(None); me.materials.append(None)
    me.polygons.foreach_set("material_index", mats)
    MESHES[("plume",) + key] = me
    return me


def plume_materials(theme_name, th):
    col, _ = th["emit_a"]
    out = []
    for name, strength, alpha in (("outer", 3.0, 0.16), ("core", 7.0, 0.5)):
        m = bpy.data.materials.new(f"{theme_name}.plume.{name}")
        m.use_nodes = True
        nt = m.node_tree; nt.nodes.clear()
        e = nt.nodes.new("ShaderNodeEmission"); e.inputs["Color"].default_value = (*col, 1); e.inputs["Strength"].default_value = strength
        tr = nt.nodes.new("ShaderNodeBsdfTransparent")
        mix = nt.nodes.new("ShaderNodeMixShader"); mix.inputs[0].default_value = alpha
        o = nt.nodes.new("ShaderNodeOutputMaterial")
        nt.links.new(tr.outputs[0], mix.inputs[1]); nt.links.new(e.outputs[0], mix.inputs[2]); nt.links.new(mix.outputs[0], o.inputs[0])
        m.surface_render_method = "BLENDED"
        out.append(m)
    return out


def attach_plumes(piece, ob, theme_mats, coll):
    for n, (cx, cz, r, y_exit, W) in enumerate(getattr(piece, "plumes", [])):
        length = int(W * 1.6)
        pl = bpy.data.objects.new(f"plume.{piece.id}.{n}", plume_mesh((r, length), r, length))
        coll.objects.link(pl)
        pl.parent = ob
        pl.location = (cx * T, y_exit * T, cz * T)
        pl.material_slots[0].link = pl.material_slots[1].link = "OBJECT"
        pl.material_slots[0].material, pl.material_slots[1].material = theme_mats["plume_outer"], theme_mats["plume_core"]


# =========================================================================== r007: MODULAR MOUNT ASSEMBLIES
# Every weapon / utility mount follows the reference 'ship mounted systems' stack:
#   hardpoint connector -> rotation base -> gimbal (yoke) -> head (housing) -> payload (barrels / emitter / pod)
# Parts are separate pieces (swappable, exploded view) and form one assembled piece. Barrels point +X.
MOUNT_KINDS = ["pd", "autocannon", "laser", "railgun", "missile", "flak", "shield", "tractor", "sensor", "clamp", "beacon"]
MOUNT_LABEL = {"pd": "POINT DEFENSE", "autocannon": "TWIN AUTOCANNON", "laser": "LASER CANNON", "railgun": "RAILGUN",
               "missile": "MISSILE POD", "flak": "FLAK TURRET", "shield": "SHIELD EMITTER", "tractor": "TRACTOR PROJECTOR",
               "sensor": "SENSOR DISH", "clamp": "DOCKING CLAMP", "beacon": "RELAY BEACON"}


def section_rows(r, ch=0, rin=0, chin=0, round_=False):
    rows = []
    for k in range(-r, r):
        q = abs(k + 0.5)
        if round_:
            half = int(math.floor(math.sqrt(max(0.0, r * r - q * q)) + 0.5))
        else:
            half = r if q <= r - ch else int(round(r - (q - (r - ch))))
        hin = 0
        if rin and q < rin:
            if round_:
                hin = int(math.floor(math.sqrt(max(0.0, rin * rin - q * q)) + 0.5))
            else:
                hin = rin if q <= rin - chin else max(0, int(round(rin - (q - (rin - chin)))))
        rows.append((k, half, hin))
    return rows


def extrude(p, axis, c1, c2, rows, a0, a1, slot):
    """Extrude a section (rows along the second in-plane axis) along axis x|y|z."""
    start = 0
    for n in range(1, len(rows) + 1):
        if n == len(rows) or rows[n][1:] != rows[start][1:]:
            k0, k1, half, hin = rows[start][0], rows[n - 1][0] + 1, rows[start][1], rows[start][2]
            spans = [(c1 - half, c1 + half)] if not hin else [(c1 - half, c1 - hin), (c1 + hin, c1 + half)]
            for u0, u1 in spans:
                if axis == "y":
                    p.b(u0, a0, c2 + k0, u1, a1, c2 + k1, slot)
                elif axis == "z":
                    p.b(u0, c2 + k0, a0, u1, c2 + k1, a1, slot)
                else:
                    p.b(a0, u0, c2 + k0, a1, u1, c2 + k1, slot)
            start = n
    return p


def housing(p, x0, x1, y0, y1, z0, z1, slot, ch=1, top="secondary"):
    """Chunky box with a chamfered (stepped) top edge in a contrasting slot."""
    p.b(x0, y0, z0, x1, y1, z1 - ch, slot)
    p.b(x0 + ch, y0 + ch, z1 - ch, x1 - ch, y1 - ch, z1, top)
    return p


def mount_parts(kind, sz):
    n = SIZE_CELLS[sz]
    W = 16 * n
    c = W // 2
    k = n
    base = f"mount.{kind}.{sz}"
    con, bas, gim, hed, pay = (Piece(f"{base}.{part}", "mount-part", "top", (W, W, 0))
                               for part in ("connector", "base", "gimbal", "head", "payload"))
    # ---- hardpoint connector (shared by every mount of this size)
    t = 2 * k
    con.b(0, 0, 0, W, W, t, "trim")
    con.b(2, 2, t, W - 2, W - 2, t + 1, "secondary")
    frame_top(con, 3, 3, W - 3, W - 3, t + 1, t + 2, 1, "emit_a")
    for x, y in ((0, 0), (W - 2, 0), (0, W - 2), (W - 2, W - 2)):
        con.b(x, y, t, x + 2, y + 2, t + 2, "metal")
    z = t + 1
    # ---- rotation base: stepped octagonal pedestal with status lights
    r1, r2 = int(W * 0.40), int(W * 0.31)
    h1 = h2 = 2 * k
    extrude(bas, "z", c, c, section_rows(r1, max(1, r1 // 3)), z, z + h1, "secondary")
    extrude(bas, "z", c, c, section_rows(r2, max(1, r2 // 3)), z + h1, z + h1 + h2, "primary")
    lz = z + max(1, h1 // 2)
    for (x0, y0, x1, y1) in ((c + r1, c - 1, c + r1 + 1, c + 1), (c - r1 - 1, c - 1, c - r1, c + 1),
                             (c - 1, c + r1, c + 1, c + r1 + 1), (c - 1, c - r1 - 1, c + 1, c - r1)):
        bas.b(x0, y0, z, x1, y1, lz, "emit_a")
    z += h1 + h2
    top_of_base = z
    gy = int(W * 0.32)
    hy = gy - 1
    head_z0 = z + 2
    turret_kinds = ("pd", "autocannon", "laser", "railgun", "missile", "flak", "tractor")
    if kind in turret_kinds:
        # ---- gimbal: turntable ring + two yoke cheeks + axle
        extrude(gim, "z", c, c, section_rows(r2 - 1, max(1, r2 // 3)), z, z + 1, "trim")
        gt, gh, gx = max(1, k), 2 * k + 3, max(2, int(W * 0.12))
        gim.b(c - gx, c - gy - gt, z + 1, c + gx, c - gy, z + 1 + gh, "secondary")
        gim.b(c - gx, c + gy, z + 1, c + gx, c + gy + gt, z + 1 + gh, "secondary")
        gim.b(c - 1, c - gy - gt - 1, z + gh // 2, c + 1, c + gy + gt + 1, z + gh // 2 + 2, "metal")
    # ---- head + payload per kind
    if kind == "pd":
        hh = max(5, int(W * 0.38))
        housing(hed, c - int(W * 0.22), c + int(W * 0.18), c - hy, c + hy, head_z0, head_z0 + hh, "primary")
        hed.b(c - int(W * 0.16), c - hy - 1, head_z0 + 1, c + int(W * 0.10), c - hy, head_z0 + hh - 2, "accent")
        lr = max(1, int(W * 0.07))
        pay.disc("x", c + hy // 2, head_z0 + hh - lr - 1, lr, c + int(W * 0.18), c + int(W * 0.18) + 2, "emit_a")
        bw = max(1, int(1.5 * k))
        bz = head_z0 + hh // 2 - bw
        pay.b(c + int(W * 0.18), c - hy // 2 - bw, bz, c + int(W * 0.66), c - hy // 2 + bw, bz + 2 * bw, "metal")
        pay.b(c + int(W * 0.60), c - hy // 2 - bw - 1, bz - 1, c + int(W * 0.68), c - hy // 2 + bw + 1, bz + 2 * bw + 1, "trim")
    elif kind == "autocannon":
        hh = max(6, int(W * 0.44))
        housing(hed, c - int(W * 0.30), c + int(W * 0.22), c - hy, c + hy, head_z0, head_z0 + hh, "primary")
        hed.b(c - int(W * 0.24), c - hy - 1, head_z0 + 1, c + int(W * 0.14), c - hy, head_z0 + hh - 2, "accent")
        hed.b(c - int(W * 0.24), c + hy, head_z0 + 1, c + int(W * 0.14), c + hy + 1, head_z0 + hh - 2, "secondary")
        hed.disc("y", c - int(W * 0.12), head_z0 + hh, max(2, int(W * 0.12)), c - hy + 1, c + hy - 1, "trim")   # ammo drum
        hed.b(c + int(W * 0.10), c - 2, head_z0 + hh, c + int(W * 0.18), c + 2, head_z0 + hh + 2, "emit_b")  # targeting light
        bw = max(1, int(1.5 * k))
        bz = head_z0 + hh // 2 - bw
        for by in (c - int(W * 0.11), c + int(W * 0.11)):
            pay.b(c + int(W * 0.22), by - bw - 1, bz - 1, c + int(W * 0.40), by + bw + 1, bz + 2 * bw + 1, "secondary")   # recoil sleeve
            pay.b(c + int(W * 0.40), by - bw, bz, c + int(W * 0.86), by + bw, bz + 2 * bw, "metal")
            pay.b(c + int(W * 0.80), by - bw - 1, bz - 1, c + int(W * 0.90), by + bw + 1, bz + 2 * bw + 1, "trim")  # muzzle brake
    elif kind == "laser":
        hh = max(6, int(W * 0.40))
        x0, x1 = c - int(W * 0.30), c + int(W * 0.30)
        housing(hed, x0, x1, c - hy, c + hy, head_z0, head_z0 + hh, "primary")
        hed.b(c - 2 * k, c - hy - 1, head_z0, c + 2 * k, c + hy + 1, head_z0 + hh, "accent")                  # crimson band
        for x in range(x0 + 2, c - 2 * k - 1, 2):                                                            # cooling fins
            hed.b(x, c - hy + 1, head_z0 + hh, x + 1, c + hy - 1, head_z0 + hh + 1 + k // 2, "metal")
        er = max(2, int(W * 0.16))
        ez = head_z0 + hh // 2
        pay.disc("x", c, ez, er + 1, x1, x1 + 2 * k + 2, "secondary")                                        # emitter housing
        pay.disc("x", c, ez, er, x1 + 2 * k + 2, x1 + 2 * k + 3, "trim", rin=max(1, er - 1))               # focus ring
        pay.disc("x", c, ez, max(1, er - 1), x1 + 2 * k + 1, x1 + 2 * k + 3, "emit_a")                      # lens
        hed.b(x0 + 1, c + hy, head_z0 + hh - 3, x0 + 3, c + hy + 1, head_z0 + hh - 1, "emit_a")
    elif kind == "railgun":
        hh = max(6, int(W * 0.36))
        housing(hed, c - int(W * 0.28), c + int(W * 0.12), c - hy, c + hy, head_z0, head_z0 + hh, "primary")
        hed.b(c - int(W * 0.22), c - hy - 1, head_z0 + 1, c + int(W * 0.06), c - hy, head_z0 + hh - 1, "secondary")
        rz0, rz1 = head_z0 + hh // 2 - max(2, k * 2), head_z0 + hh // 2 + max(2, k * 2)
        gap = max(1, k)
        x0, x1 = c + int(W * 0.12), c + int(W * 1.10)
        pay.b(x0, c - gap - max(1, k), rz0, x1, c - gap, rz1, "metal")
        pay.b(x0, c + gap, rz0, x1, c + gap + max(1, k), rz1, "metal")
        for x in range(x0 + 2 * k, x1 - 3 * k, max(4, int(W * 0.18))):
            pay.b(x, c - gap - max(1, k) - 1, rz0 - 1, x + max(1, k), c + gap + max(1, k) + 1, rz1 + 1, "emit_a")   # coils
        pay.b(x1 - 2 * k, c - gap - max(1, k) - 1, rz0 - 1, x1, c + gap + max(1, k) + 1, rz1 + 1, "trim")
    elif kind == "missile":
        hh = max(8, int(W * 0.58))
        x0, x1 = c - int(W * 0.30), c + int(W * 0.30)
        housing(hed, x0, x1, c - hy, c + hy, head_z0, head_z0 + hh, "primary", ch=max(1, k))
        hed.b(x0 + 1, c - hy + 1, head_z0 + hh, x1 - 1, c + hy - 1, head_z0 + hh + 1, "secondary")          # pod cover
        cols = {1: 2, 2: 3, 3: 3}[n]
        rows_ = {1: 2, 2: 2, 3: 3}[n]
        cw = (2 * hy - 2) // cols
        chh = (hh - 2) // rows_
        for i in range(cols):
            for j in range(rows_):
                ya, za = c - hy + 1 + i * cw, head_z0 + 1 + j * chh
                pay.b(x1, ya, za, x1 + 1, ya + cw - 1, za + chh - 1, "dark")
                pay.b(x1, ya + 1, za + 1, x1 + 2, ya + cw - 2, za + chh - 2, "accent")                      # tube caps
        hed.b(x0 - 2, c - 2, head_z0 + 2, x0, c + 2, head_z0 + 2 + max(2, hh // 3), "secondary")           # control module
    elif kind == "flak":
        hh = max(6, int(W * 0.44))
        housing(hed, c - int(W * 0.24), c + int(W * 0.20), c - hy, c + hy, head_z0, head_z0 + hh, "primary")
        hed.disc("y", c - int(W * 0.08), head_z0 + hh // 2, max(2, int(W * 0.16)), c + hy, c + hy + max(2, 2 * k), "trim")  # ammo drum
        bw = max(1, k // 2 + (1 if k > 1 else 0))
        for i in (-1, 0, 1):
            for j in (0, 1):
                by, bz = c + i * (2 * bw + 1), head_z0 + 2 + j * (2 * bw + 1)
                pay.b(c + int(W * 0.20), by - bw, bz, c + int(W * 0.62), by + bw, bz + 2 * bw, "metal")
        pay.b(c + int(W * 0.58), c - 3 * bw - 2, head_z0 + 1, c + int(W * 0.64), c + 3 * bw + 2, head_z0 + 4 * bw + 4, "trim")
    elif kind == "tractor":
        hh = max(6, int(W * 0.38))
        housing(hed, c - int(W * 0.22), c + int(W * 0.10), c - hy, c + hy, head_z0, head_z0 + hh, "primary")
        er = max(3, int(W * 0.30))
        ez = head_z0 + hh // 2 + 1
        x1 = c + int(W * 0.10)
        pay.disc("x", c, ez, er, x1, x1 + 2 * k, "accent", rin=max(1, er - 2 * k))
        pay.disc("x", c, ez, max(1, er - 2 * k), x1, x1 + 1, "emit_a")
        pay.disc("x", c, ez, max(1, er - 3 * k), x1 + 1, x1 + 2, "emit_a")
    elif kind == "shield":
        cr = int(W * 0.30)
        hh = int(W * 0.50)
        extrude(hed, "z", c, c, section_rows(cr, max(1, cr // 3)), z, z + hh, "primary")
        for j in range(3):                                                                                # field coils
            zz = z + 2 + j * (hh - 4) // 2
            extrude(hed, "z", c, c, section_rows(cr + 1, max(1, cr // 3)), zz, zz + max(1, k), "emit_a")
        for (x0, y0, x1, y1) in ((c + cr, c - 2, c + cr + 2, c + 2), (c - cr - 2, c - 2, c - cr, c + 2),
                                 (c - 2, c + cr, c + 2, c + cr + 2), (c - 2, c - cr - 2, c + 2, c - cr)):
            hed.b(x0, y0, z + 2, x1, y1, z + hh - 2, "secondary")
        extrude(pay, "z", c, c, section_rows(cr - 1, max(1, cr // 3)), z + hh, z + hh + 2, "secondary")  # shield cap
        extrude(pay, "z", c, c, section_rows(max(1, cr // 2), max(1, cr // 6)), z + hh + 2, z + hh + 3, "emit_a")
    elif kind == "sensor":
        hed.b(c - 1 - k // 2, c - 1 - k // 2, z, c + 1 + k // 2, c + 1 + k // 2, z + 4 * k, "metal")          # mast
        hed.b(c - 2, c - 2, z + 2 * k, c + 2, c + 2, z + 3 * k, "emit_b")
        dz = z + 4 * k
        rr = int(W * 0.46)
        for i in range(4):                                                                                 # stepped bowl
            ro = max(2, int(rr * (0.45 + 0.18 * i)))
            pay.disc("z", c, c, ro, dz + i * max(1, k), dz + (i + 1) * max(1, k), "primary", rin=max(1, ro - 2 * k) if i else 0)
        pay.b(c - 1, c - 1, dz, c + 1, c + 1, dz + 6 * k, "metal").b(c - 2, c - 2, dz + 6 * k, c + 2, c + 2, dz + 6 * k + 2, "emit_a")
    elif kind == "clamp":
        hed.b(c - int(W * 0.18), c - int(W * 0.18), z, c + int(W * 0.18), c + int(W * 0.18), z + 3 * k, "secondary")  # actuator
        jz = z + 3 * k
        jw = max(2, int(W * 0.10))
        for s in (-1, 1):
            y0 = c - int(W * 0.30) if s < 0 else c + int(W * 0.30) - jw
            pay.b(c - jw, y0, jz, c + jw, y0 + jw, jz + int(W * 0.50), "primary")                          # jaw arm
            pay.b(c - jw, y0 + (jw if s < 0 else -jw), jz + int(W * 0.40), c + jw, y0 + (2 * jw if s < 0 else 0), jz + int(W * 0.50), "primary")
            for m in range(0, int(W * 0.40), 2 * max(1, k)):                                               # hazard stripes
                pay.b(c + jw, y0, jz + m, c + jw + 1, y0 + jw, jz + m + max(1, k), "trim")
        pay.b(c - 2, c - 2, jz, c + 2, c + 2, jz + 2, "emit_b")
    elif kind == "beacon":
        mh = int(W * 0.9)
        hed.b(c - 2 * k, c - 2 * k, z, c + 2 * k, c + 2 * k, z + 4 * k, "secondary")
        hed.b(c - k, c - k, z + 4 * k, c + k, c + k, z + mh, "metal")
        for j, zz in enumerate(range(z + 5 * k, z + mh - 2, max(3, 3 * k))):
            s = max(1, k) + j % 2
            hed.b(c - k - s, c - k - s, zz, c + k + s, c + k + s, zz + max(1, k), "primary")
        for dx in (-1, 1):
            pay.b(c + dx * 3 * k - k, c - k, z + mh - 4 * k, c + dx * 3 * k + k, c + k, z + mh, "metal")
            pay.b(c + dx * 3 * k - k, c - k, z + mh, c + dx * 3 * k + k, c + k, z + mh + max(1, k), "emit_b")
        pay.b(c - k, c - k, z + mh, c + k, c + k, z + mh + 2 * k, "emit_a")
    parts = [con, bas, gim, hed, pay]
    top = max((bx[5] for pc in parts for bx in pc.boxes), default=W)
    for pc in parts:
        pc.size = (W, W, top)
    return parts


def mount_union(kind, sz):
    parts = mount_parts(kind, sz)
    p = Piece(f"mount.{kind}.{sz}", "mount", "top", parts[0].size)
    for q in parts:
        p.boxes += q.boxes
    return p


def face_variant(piece):
    """Same mount on a hull face: top-frame up (z) becomes face-frame outward (y); barrels stay along X."""
    p = Piece(piece.id + ".face", piece.family, "face", (piece.size[0], piece.size[2], piece.size[1]))
    p.boxes = [(x0, z0, y0, x1, z1, y1, s) for (x0, y0, z0, x1, y1, z1, s) in piece.boxes]
    return p


def scrap_ion(sz):
    """Riftjack salvaged ion drive: same sockets and envelope, but exposed frame bands, offset patch
    plates, a hazard-striped patch and an external bypass pipe (geometry variant, not just a theme)."""
    parts, meta = ion_parts(sz)
    W, total = meta["W"], meta["total"]
    r = W // 2 - 2
    cx = cz = W // 2
    p = Piece(f"mount.engine.ion.{sz}.scrap", "mount", "face", (W, total, W))
    seg = max(8, (W // 3) & ~1)
    cut = []
    for i, y0 in enumerate(range(5, total, seg)):
        if H("scrap", sz, i) < 0.35 and 0 < i < (total - 5) // seg - 2:
            cut.append((y0 + 1, y0 + seg - 1))
    for bx in parts[0].boxes + parts[2].boxes + parts[3].boxes:
        p.boxes.append(bx)
    for bx in parts[1].boxes:
        if any(a <= bx[1] and bx[4] <= b for a, b in cut) and bx[6] != "dark":
            continue                                                            # stripped band
        p.boxes.append(bx)
    for a, b in cut:                                                            # exposed cage over the stripped band
        for sx, sz_ in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
            px, pz = cx + sx * int(r * 0.7), cz + sz_ * int(r * 0.7)
            p.b(px - 1, a, pz - 1, px + 1, b, pz + 1, "trim")
        p.b(cx - r + 2, a + 1, cz - 1, cx + r - 2, a + 2, cz + 1, "metal")
    for i in range(4):                                                          # offset patch plates
        y0 = 5 + int(H("patch", sz, i) * (total - 20))
        side = i % 2
        w = max(3, int(r * (0.4 + 0.3 * H("pw", sz, i))))
        zc = cz + int((H("pz", sz, i) - 0.5) * r)
        if side:
            p.b(cx + r, y0, zc - w // 2, cx + r + 2, y0 + w + 2, zc + w // 2, "accent" if i < 2 else "primary")
        else:
            p.b(cx - w // 2 + 2, y0, cz + r, cx + w // 2 + 2, y0 + w, cz + r + 2, "primary")
    y0 = 5 + seg
    for m in range(0, max(4, r), 2):                                            # hazard-striped patch
        p.b(cx - r - 2, y0 + m, cz - r // 2, cx - r, y0 + m + 1, cz + r // 2, "trim" if m % 4 == 0 else "dark")
    p.b(cx - r - 3, 6, cz + r // 2, cx - r - 1, total - 8, cz + r // 2 + 2, "metal")   # external bypass pipe
    p.plumes = meta["plumes"]
    return p


# =========================================================================== r005: GENERIC HULL DRESSER
def signed_area(poly):
    return 0.5 * sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1] for i in range(len(poly)))


def ccw(poly):
    return poly if signed_area(poly) > 0 else list(reversed(poly))


def inside(poly, x, y):
    c, n = False, len(poly)
    for i in range(n):
        (x0, y0), (x1, y1) = poly[i], poly[(i + 1) % n]
        if (y0 > y) != (y1 > y) and x < x0 + (y - y0) * (x1 - x0) / (y1 - y0):
            c = not c
    return c


def spans(poly, yc):
    xs = []
    n = len(poly)
    for i in range(n):
        (x0, y0), (x1, y1) = poly[i], poly[(i + 1) % n]
        if (y0 <= yc < y1) or (y1 <= yc < y0):
            xs.append(x0 + (yc - y0) * (x1 - x0) / (y1 - y0))
    xs.sort()
    return [(xs[k], xs[k + 1]) for k in range(0, len(xs) - 1, 2)]


ROW = 4          # plan raster row height in texels (0.25 m)


def raster_poly(poly, bands, colour):
    """Even-odd scanline raster of any plan polygon into per-1 m-cell stepped boxes (2-texel rows)."""
    ys = [p[1] for p in poly]
    y0 = int(math.floor(min(ys) * 4)) * 4
    y1 = int(math.ceil(max(ys) * 4)) * 4
    cells = {}
    for yt in range(y0, y1, ROW):
        yc = (yt + ROW / 2) * T
        for a, b in spans(poly, yc):
            xa, xb = int(round(a * 8)) * 2, int(round(b * 8)) * 2
            if xb <= xa:
                continue
            for cx in range(xa // 16, (xb - 1) // 16 + 1):
                sa, sb = max(xa, cx * 16), min(xb, cx * 16 + 16)
                if sb > sa:
                    cells.setdefault((cx, yt // 16), {}).setdefault(yt, []).append((sa, sb))
    boxes = []
    for (cx, cy), rows in cells.items():
        open_runs = {}
        for yt in range(cy * 16, cy * 16 + 16, ROW):
            segs = set(rows.get(yt, []))
            for seg in list(open_runs):
                if seg not in segs:
                    ya = open_runs.pop(seg)
                    for bi in range(len(bands) - 1):
                        boxes.append((seg[0], ya, bands[bi], seg[1], yt, bands[bi + 1], colour(cx, cy, bi)))
            for seg in segs:
                open_runs.setdefault(seg, yt)
        for seg, ya in open_runs.items():
            for bi in range(len(bands) - 1):
                boxes.append((seg[0], ya, bands[bi], seg[1], cy * 16 + 16, bands[bi + 1], colour(cx, cy, bi)))
    return boxes


def vol_tiers(v):
    z0, z1 = v["z"]
    h = z1 - z0
    if h >= 40:
        return [(z0, z0 + 24), (z0 + 24, z1 - 5)], (z1 - 5, z1)
    if h >= 16:
        return [(z0, z1 - 4)], (z1 - 4, z1)
    return [(z0, z1)], None


def skin_piece(name, chain, v, seed):
    """Stepped panel skin following a chain of non-axis edges (slopes or arcs). Panels run along the chain's
    arc length, each tier gets a plate/vent/light treatment, and the depth is 2-4 texels outward."""
    tiers, rim = vol_tiers(v)
    segs, acc = [], 0.0
    for p, q in chain:
        dx, dy = q[0] - p[0], q[1] - p[1]
        L = math.hypot(dx, dy)
        segs.append((p, (dx / L, dy / L), (dy / L, -dx / L), L, acc))
        acc += L
    breaks, s = [], 0.0
    while s < acc + 2:
        breaks.append(s)
        s += (0.75, 1.0, 1.0, 1.25, 1.5)[int(H(seed, int(s * 8)) * 5)]
    D = 5
    xs = [c for p, q in chain for c in (p[0], q[0])]; ys = [c for p, q in chain for c in (p[1], q[1])]
    xa0, xb0 = int(math.floor((min(xs) - 0.5) * 8)) * 2, int(math.ceil((max(xs) + 0.5) * 8)) * 2
    ya0, yb0 = int(math.floor((min(ys) - 0.5) * 4)) * 4, int(math.ceil((max(ys) + 0.5) * 4)) * 4
    cols = {}                                              # (yt) -> list of (xt, panel, dist_texels)
    for yt in range(ya0, yb0, ROW):
        for xt in range(xa0, xb0, 2):
            cx, cy = (xt + 1) * T, (yt + ROW / 2) * T
            best = None
            for p, dh, n, L, a0 in segs:
                rx, ry = cx - p[0], cy - p[1]
                t = rx * dh[0] + ry * dh[1]
                if -0.01 <= t <= L + 0.01:
                    dist = rx * n[0] + ry * n[1]
                    if 0 <= dist * 16 < D and (best is None or dist < best[1]):
                        best = (a0 + t, dist)
            if best is None or inside(v["poly"], cx, cy):
                continue
            panel = max(0, __import__("bisect").bisect_right(breaks, best[0]) - 1)
            cols.setdefault(yt, []).append((xt, panel, best[1] * 16))
    layers = []                                            # (panel, z0, z1, slot, depth)

    def plan(panel):
        out = []
        for ti, (t0, t1) in enumerate(tiers):
            h = H(seed, panel, ti, 3)
            dep = 2 + int(H(seed, panel, ti, 4) * 3)
            if h < 0.16 and t1 - t0 >= 10:                # vent
                for z in range(t0 + 1, t1 - 1):
                    out.append((z, z + 1, "metal" if z % 2 else "dark", dep - (0 if z % 2 else 1)))
                out.append((t0, t0 + 1, "trim", dep)); out.append((t1 - 1, t1, "trim", dep))
            else:
                slot = ("primary", "primary", "secondary", "accent", "primary")[int(H(seed, panel, ti, 5) * 5)]
                if ti == 0 and len(tiers) > 1 and slot == "primary":
                    slot = "secondary"
                out.append((t0 + 1, t1 - 1, slot, dep))
                if H(seed, panel, ti, 6) < 0.3 and t1 - t0 >= 10:
                    out.append((t1 - 5, t1 - 4, "emit_a" if H(seed, panel, 7) < 0.5 else "emit_b", dep + 1))
                if H(seed, panel, ti, 8) < 0.35:
                    out.append((t0 + 2, t0 + 4, "metal", dep + 1))
        if rim:
            out.append((rim[0], rim[1], "secondary", 3))
        return out

    plans = {}
    runs = {}
    p = Piece(name, "generated.skin", "plan", (0, 0, 0))

    def emit(key, ya, yb):
        panel, li, xa, xb = key
        z0, z1, slot, dep = plans[panel][li]
        p.b(xa, ya, z0, xb, yb, z1, slot)

    for yt in range(ya0, yb0 + ROW, ROW):
        cur = set()
        row = sorted(cols.get(yt, []))
        for panel in {c[1] for c in row}:
            plans.setdefault(panel, plan(panel))
            for li, (z0, z1, slot, dep) in enumerate(plans[panel]):
                xs_in = [c[0] for c in row if c[1] == panel and c[2] < dep]
                if not xs_in:
                    continue
                start = prev = xs_in[0]
                for xt in xs_in[1:] + [None]:
                    if xt is not None and xt == prev + 2:
                        prev = xt
                        continue
                    cur.add((panel, li, start, prev + 2))
                    if xt is not None:
                        start = prev = xt
        for key in list(runs):
            if key not in cur:
                emit(key, runs.pop(key), yt)
        for key in cur:
            runs.setdefault(key, yt)
    return p


def dress(design, kit, mats, decals, theme, coll, origin):
    """Turn a grammar-level design (volumes + mounts) into kit placements."""
    ox, oy = origin
    vols = design["volumes"]
    for v in vols:
        v["poly"] = ccw(v["poly"])
    mounts = design.get("mounts", [])
    stats = {"cassettes": 0, "roof": 0, "skins": 0}

    def other_covers(v, x, y, z0, z1):
        for w in vols:
            if w is v:
                continue
            if w["z"][0] < z1 and z0 < w["z"][1] and inside(w["poly"], x, y):
                return True
        return False

    top_taken = {}
    for m in mounts:
        if m[3] == "top":
            key, x, y = m[0], m[1], m[2]
            pc = kit_piece(kit, key)
            for cx in range(int(math.floor(x)), int(math.ceil(x + pc.size[0] * T))):
                for cy in range(int(math.floor(y)), int(math.ceil(y + pc.size[1] * T))):
                    top_taken[(cx, cy)] = True
    for vi, v in enumerate(vols):
        tiers, rim = vol_tiers(v)
        z0, z1 = v["z"]
        if v["kind"] == "hull":
            bands = [max(0, z0 - 5), z0] + [t[1] for t in tiers] + ([rim[1]] if rim else [])
            bands = sorted(set(bands))

            def colour(cx, cy, bi, nb=len(bands)):
                return "trim" if bi == 0 else ("secondary" if bi == 1 and nb > 3 else "primary")
        else:
            bands = [z0, z1]

            def colour(cx, cy, bi, vi=vi):
                h = H(cx, cy, vi, 44)
                return "primary" if h < 0.62 else ("secondary" if h < 0.84 else "accent")
        body = Piece(f"gen.{design['id']}.v{vi}", "generated", "plan", (0, 0, 0))
        for bx in raster_poly(v["poly"], bands, colour):
            body.b(*bx)
        instance(body, (ox, oy, 0), 0, mats, coll, bevel=0.01)
        # ---- faces
        poly = v["poly"]
        n = len(poly)
        chain, chains = [], []
        axis_edges = []
        for i in range(n):
            p, q = poly[i], poly[(i + 1) % n]
            if abs(p[0] - q[0]) < 1e-6 or abs(p[1] - q[1]) < 1e-6:
                if chain:
                    chains.append(chain); chain = []
                axis_edges.append((p, q))
            else:
                chain.append((p, q))
        if chain:
            if chains and chains[0][0][0] == chain[-1][1]:
                chains[0] = chain + chains[0]
            else:
                chains.append(chain)
        for ci, ch in enumerate(chains):
            sk = skin_piece(f"gen.{design['id']}.v{vi}.skin{ci}", ch, v, H(design["id"], vi, ci) * 1e5)
            if sk.boxes:
                instance(sk, (ox, oy, 0), 0, mats, coll, bevel=0.008)
                stats["skins"] += 1
        long_axis = sorted(axis_edges, key=lambda e: -math.hypot(e[1][0] - e[0][0], e[1][1] - e[0][1]))[:2]
        for p, q in axis_edges:
            L = int(round(math.hypot(q[0] - p[0], q[1] - p[1])))
            if L < 1 or abs(p[0] - round(p[0])) > 1e-6 or abs(p[1] - round(p[1])) > 1e-6:
                continue
            d = ((q[0] - p[0]) / L, (q[1] - p[1]) / L)
            nrm = (d[1], -d[0])
            rot = math.degrees(math.atan2(d[1], d[0])) + 180
            logo = v["kind"] == "hull" and len(tiers) == 2 and (p, q) in long_axis and L >= 6 and v.get("logo", True)
            for ti, (t0, t1) in enumerate(tiers):
                h = t1 - t0
                if h < 10:
                    continue
                holes = []
                for u in range(L):
                    px, py = p[0] + d[0] * (u + 0.5) + nrm[0] * 0.3, p[1] + d[1] * (u + 0.5) + nrm[1] * 0.3
                    if other_covers(v, px, py, t0, t1):
                        holes.append((u, u + 1))
                for m in mounts:
                    if m[3] != "face":
                        continue
                    key, mx, my, _, rotm, mz = m[:6]
                    pc = kit_piece(kit, key)
                    r = math.radians(rotm)
                    out_n = (-math.sin(r), math.cos(r))
                    if abs(out_n[0] - nrm[0]) > 1e-3 or abs(out_n[1] - nrm[1]) > 1e-3:
                        continue
                    if abs((mx - p[0]) * nrm[0] + (my - p[1]) * nrm[1]) > 0.05:
                        continue
                    if not (mz < t1 and t0 < mz + pc.size[2]):
                        continue
                    xdir = (math.cos(r), math.sin(r))
                    ua = (mx - p[0]) * d[0] + (my - p[1]) * d[1]
                    ub = (mx + xdir[0] * pc.size[0] * T - p[0]) * d[0] + (my + xdir[1] * pc.size[0] * T - p[1]) * d[1]
                    holes.append((math.floor(min(ua, ub) + 1e-6), math.ceil(max(ua, ub) - 1e-6)))
                items = []
                if logo and ti == 1:
                    for lu in sorted(range(0, L - 2), key=lambda u: abs(u + 1.5 - L / 2)):
                        if not any(a < lu + 3 and lu < b for a, b in holes):
                            items.append((lu, 3, "logo"))
                            holes.append((lu, lu + 3))
                            break
                for seg in subtract(0, L, holes):
                    for u, wm in pack(seg, sum(map(ord, design["id"])) + vi * 7 + ti * 13 + int(p[0] * 3 + p[1] * 5)):
                        items.append((u, wm, None))
                for u, wm, kind in items:
                    org = (p[0] + d[0] * (u + wm) + ox, p[1] + d[1] * (u + wm) + oy, t0 * T)
                    seed = (design["id"], vi, int(p[0]), int(p[1]), ti, u)
                    if kind is None and wm <= 2 and h >= 20 and H(*seed, 91) < 0.4:
                        h1 = h // 2
                        for k, (za, hh) in enumerate(((t0, h1), (t0 + h1, h - h1))):
                            kk = pick_small(seed + (k,), v)
                            pc = kit.get(("cas", kk, wm, hh), CAS[kk], wm * 16, hh)
                            instance(pc, (org[0], org[1], za * T), rot, mats, coll)
                            stats["cassettes"] += 1
                        continue
                    kind = kind or pick_face(seed, wm, ti == len(tiers) - 1 and len(tiers) > 1, v)
                    pc = kit.get(("cas", kind, wm, h), CAS[kind], wm * 16, h) if kind not in ("window", "full", "port") else \
                        kit.get(("win", kind, wm, h), WIN[kind], wm * 16, h)
                    instance(pc, org, rot, mats, coll)
                    stats["cassettes"] += 1
                    for sock in pc.decals:
                        decal_quad(f"decal.{design['id']}.{vi}.{u}", pc, sock, decals["name"], org, rot, coll, 4.0)
            if rim:
                for u in range(L):
                    px, py = p[0] + d[0] * (u + 0.5) + nrm[0] * 0.3, p[1] + d[1] * (u + 0.5) + nrm[1] * 0.3
                    if other_covers(v, px, py, rim[0], rim[1]):
                        continue
                    lit = H(design["id"], vi, u, int(p[0] + p[1]), 5) < 0.3
                    pc = kit.get(("rim", rim[1] - rim[0], lit), cas_rim, 16, rim[1] - rim[0], lit)
                    instance(pc, (p[0] + d[0] * (u + 1) + ox, p[1] + d[1] * (u + 1) + oy, rim[0] * T), rot, mats, coll)
        # ---- roof
        zt = z1 * T
        if v["kind"] == "hull":
            cells = set()
            xs = [pt[0] for pt in poly]; ys = [pt[1] for pt in poly]
            for cx in range(int(math.floor(min(xs))), int(math.ceil(max(xs)))):
                for cy in range(int(math.floor(min(ys))), int(math.ceil(max(ys)))):
                    pts = [(cx + a, cy + b) for a in (0.02, 0.98) for b in (0.02, 0.98)] + [(cx + 0.5, cy + 0.5)]
                    if all(inside(poly, *pt) for pt in pts) and not any(other_covers(v, cx + 0.5, cy + 0.5, z1, z1 + 20) for _ in (0,)):
                        cells.add((cx, cy))
            free = {c for c in cells if c not in top_taken}
            rimc = {c for c in free if any((c[0] + a, c[1] + b) not in cells for a in (-1, 0, 1) for b in (-1, 0, 1))}
            interior = free - rimc
            placed = []
            if v.get("spine") and interior:
                cyv = [c[1] for c in interior]
                mid = int(round((min(cyv) + max(cyv) + 1) / 2)) - 1
                sp = sorted(c for c in interior if c[1] in (mid, mid + 1))
                xs_sp = sorted({c[0] for c in sp})
                logo_x = None
                if len(xs_sp) >= 8:
                    logo_x = xs_sp[len(xs_sp) // 2 - 2]
                x = xs_sp[0] if xs_sp else 0
                while xs_sp and x <= xs_sp[-1]:
                    if logo_x is not None and x == logo_x and all((x + a, mid + b) in interior for a in range(4) for b in (0, 1)):
                        pc = kit.get("rlogo", roof_logo, 64, 32)
                        instance(pc, (x + ox, mid + oy, zt), 0, mats, coll)
                        decal_quad(f"decal.{design['id']}.emblem", pc, pc.decals[0], decals["emblem"], (x + ox, mid + oy, zt), 0, coll, 1.0)
                        for a in range(4):
                            interior.discard((x + a, mid)); interior.discard((x + a, mid + 1))
                        x += 4
                        continue
                    if all((x + a, mid + b) in interior for a in (0, 1) for b in (0, 1)):
                        instance(kit.get(("roof", "spine", 32, 32), roof_module, 32, 32, "spine"), (x + ox, mid + oy, zt), 0, mats, coll)
                        for a in (0, 1):
                            interior.discard((x + a, mid)); interior.discard((x + a, mid + 1))
                        x += 2
                    else:
                        x += 1
            for c in sorted(interior):
                if c not in interior:
                    continue
                order = [(3, 2), (2, 3), (2, 2), (2, 1), (1, 2)]
                k0 = int(H(design["id"], vi, c[0], c[1], 17) * len(order))
                order = order[k0:] + order[:k0]
                for w_, d_ in order + [(1, 1)]:
                    cover = [(c[0] + a, c[1] + b) for a in range(w_) for b in range(d_)]
                    if all(cc in interior for cc in cover):
                        break
                for cc in cover:
                    interior.discard(cc)
                if (w_, d_) == (1, 1):
                    kind = ("box", "vent", "fan", "sensor", "hatch", "box")[int(H(design["id"], c[0], c[1], 19) * 6)]
                    pc = kit.get(("rs", kind), roof_small, kind)
                else:
                    big = ("box", "vent", "hatch", "greeble", "pipes", "radiator", "tanks", "cargo")
                    thin = ("pipes", "vent", "radiator", "box")
                    pool = big if min(w_, d_) >= 2 else thin
                    kind = pool[int(H(design["id"], c[0], c[1], 23) * len(pool))]
                    pc = kit.get(("roof", kind, w_ * 16, d_ * 16), roof_module, w_ * 16, d_ * 16, kind)
                    if kind == "greeble":
                        deco_at(kit, theme, (c[0] + 0.4 + ox, c[1] + 0.4 + oy, zt + 2 * T), mats, coll)
                instance(pc, (c[0] + ox, c[1] + oy, zt), 0, mats, coll)
                stats["roof"] += 1
            for k, c in enumerate(sorted(rimc)):
                kind = ("plain", "bump", "lit", "vent", "plain")[int(H(design["id"], c[0], c[1], 3) * 5)]
                instance(kit.get(("rim", kind), roof_rim, kind), (c[0] + ox, c[1] + oy, zt), 0, mats, coll)
                if theme == "riftjack" and k % 3 == 0:
                    instance(kit.get("spike", decorator, "spike"), (c[0] + 0.3 + ox, c[1] + 0.3 + oy, zt + 2 * T), 0, mats, coll)
        else:
            xs = [pt[0] for pt in poly]; ys = [pt[1] for pt in poly]
            if theme == "aurelian":
                for k in range(0, len(poly), max(1, len(poly) // 3)):
                    x, y = poly[k]
                    cx, cy = sum(xs) / len(xs), sum(ys) / len(ys)
                    px, py = x + (cx - x) * 0.25, y + (cy - y) * 0.25
                    instance(kit.get("crystal", decorator, "crystal"), (px + ox, py + oy, zt), 0, mats, coll)
    # ---- mounts
    for m in mounts:
        key, x, y, kind, rot, z = m[:6]
        zz = z if kind == "face" else None
        if kind == "top":
            host = max((w["z"][1] for w in vols if inside(w["poly"], x + 0.5, y + 0.5)), default=54)
            zz = host
        instance(kit_piece(kit, key), (x + ox, y + oy, zz * T), rot, mats, coll)
    # ---- plate decals
    plates = [w for w in vols if w["kind"] == "plate"]
    for k, w in enumerate(plates[:2]):
        xs = [pt[0] for pt in w["poly"]]; ys = [pt[1] for pt in w["poly"]]
        cx, cy = sum(xs) / len(xs), sum(ys) / len(ys)
        span_x, span_y = (max(xs) - min(xs)) * 0.45, (max(ys) - min(ys)) * 0.35
        mat = decals["number"] if k == 0 else decals["emblem_small"]
        hw = min(span_x, span_y * 3.5) if k == 0 else min(span_x, span_y)
        hh = hw / 3.5 if k == 0 else hw
        if hw > 0.3:
            top_decal(f"decal.{design['id']}.plate{k}", mat, cx - hw + ox, cy - hh + oy, cx + hw + ox, cy + hh + oy, w["z"][1] * T + 0.003, coll)
    return stats


CAS = {"panel": cas_panel, "split": cas_split, "grille": cas_grille, "hatch": cas_hatch, "light": cas_light, "stack": cas_stack,
       "logo": cas_logo, "armor": cas_armor, "pipes": cas_pipes, "module": cas_module, "beacon": cas_beacon}
WIN = {"window": lambda w, h: cas_window(w, h, "band"), "full": lambda w, h: cas_window(w, h, "full"), "port": cas_port}


def pick_face(seed, wm, upper, v):
    h = H(*seed, 1)
    if v.get("face_style") == "windows" and upper:
        return "full" if wm >= 2 else "port"
    if wm == 1:
        return ("grille", "light", "stack", "module", "pipes", "beacon", "port" if upper else "armor")[int(h * 7)]
    if wm == 2:
        return ("panel", "split", "hatch", "armor", "module", "pipes", "window" if upper else "panel")[int(h * 7)]
    return ("armor", "panel", "split", "pipes")[int(h * 4)]


def pick_small(seed, v):
    return ("grille", "light", "pipes", "module", "stack", "beacon")[int(H(*seed, 2) * 6)]


def kit_piece(kit, key):
    table = {
        "turret": lambda: kit.get("turret", turret_top), "cannon": lambda: kit.get("cannon", side_cannon),
        "thruster": lambda: kit.get("thr", thruster), "tractor": lambda: kit.get("tractor", tractor),
        "dish": lambda: kit.get("dish", dish), "cargo": lambda: kit.get("cargo", cargo_door),
        "airlock": lambda: kit.get("airlock", airlock),
    }
    if key in table:
        return table[key]()
    if key.startswith("ion.") and key.endswith(".scrap"):
        sz = key.split(".")[1]
        return kit.get(("ionscrap", sz), scrap_ion, sz)
    if key.startswith(("wpn.", "wf.")):
        _, kind, sz = key.split(".")
        pc = kit.get(("wpn", kind, sz), mount_union, kind, sz)
        return pc if key.startswith("wpn.") else kit.get(("wf", kind, sz), face_variant, pc)
    fam, _, sz = key.partition(".")
    sized = {"ion": ion_engine, "block": block_engine, "turret": turret, "cannon": cannon, "rcs": rcs}
    if fam in sized and sz in SIZE_CELLS:
        return kit.get((fam, sz), sized[fam], sz)
    if key == "crew":
        return kit.get("crew", crew_figure)
    if key.startswith("engine"):                     # engine.W.H.L in texels
        _, w, h, L = key.split(".")
        return kit.get(("eng", w, h, L), engine, f"mount.engine.w{w}.h{h}", int(w), int(h), int(L))
    if key.startswith("sky"):                        # sky.W.D texels
        _, w, d = key.split(".")
        return kit.get(("sky", w, d), roof_skylight, int(w), int(d))
    raise KeyError(key)


def deco_at(kit, theme, loc, mats, coll):
    kind = {"federation": "antenna", "riftjack": "spike", "aurelian": "crystal"}[theme]
    instance(kit.get(kind, decorator, kind), loc, 0, mats, coll)


def arc(cx, cy, r, a0, a1, n):
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)), cy + r * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]


def full(z0=5):
    return (z0, 54)


# ---- designs: grammar data only (volumes on the 1 m grid, mounts on sockets). x is forward.
def designs():
    D = []
    D.append(dict(id="razor", name="RAZOR  fighter", theme="federation", size="9 x 7 m", volumes=[
        dict(poly=[(0, 0), (6, 0), (8, 1), (8, 2), (6, 3), (0, 3)], z=(6, 32), kind="hull", logo=False),
        dict(poly=[(1, -2), (2, -2), (4, 0), (1, 0)], z=(10, 16), kind="plate"),
        dict(poly=[(1, 3), (4, 3), (2, 5), (1, 5)], z=(10, 16), kind="plate")],
        mounts=[("ion.SM", 0, 0.5, "face", 90, 11), ("ion.SM", 0, 1.5, "face", 90, 11),
                ("cannon.SM", 2, -2, "face", 180, 7), ("cannon.SM", 1, 5, "face", 0, 7), ("sky.32.16", 5, 1, "top", 0, 0)]))
    D.append(dict(id="courier", name="COURIER  shuttle", theme="federation", size="14 x 5 m", volumes=[
        dict(poly=[(0, 0), (8, 0)] + arc(8, 2, 2, -90, 0, 8)[1:] + arc(8, 3, 2, 0, 90, 8) + [(0, 5)], z=(5, 46), kind="hull")],
        mounts=[("block.MD", 0, 0.5, "face", 90, 9), ("block.MD", 0, 2.5, "face", 90, 9),
                ("cargo", 7, 0, "face", 180, 5), ("airlock", 4, 5, "face", 0, 6), ("sky.32.48", 7, 1, "top", 0, 0)]))
    D.append(dict(id="corvette", name="WAYFARER  corvette", theme="federation", size="30 x 16 m", volumes=[
        dict(poly=[(0, 1), (20, 1), (24, 5), (24, 7), (20, 11), (0, 11)], z=full(), kind="hull", spine=True),
        dict(poly=[(4, 11), (12, 11), (9, 14), (4, 14)], z=(12, 30), kind="plate"),
        dict(poly=[(4, -2), (9, -2), (12, 1), (4, 1)], z=(12, 30), kind="plate")],
        mounts=[("ion.LG", 0, 1.5, "face", 90, 5), ("ion.LG", 0, 7.5, "face", 90, 5), ("ion.MD", 0, 5, "face", 90, 13),
                ("cannon.MD", 5, 14, "face", 0, 13), ("cannon.MD", 7, -2, "face", 180, 13), ("rcs.MD", 4, 12.25, "face", 90, 15),
                ("rcs.MD", 4, -1.75, "face", 90, 15), ("cargo", 16, 1, "face", 180, 6), ("airlock", 14, 11, "face", 0, 8),
                ("wpn.autocannon.MD", 6, 2, "top", 0, 0), ("wpn.laser.MD", 13, 8, "top", 0, 0), ("sky.32.32", 20, 5, "top", 0, 0),
                ("wpn.sensor.MD", 2, 7, "top", 0, 0), ("wpn.pd.SM", 17, 3, "top", 0, 0)]))
    D.append(dict(id="frigate", name="ORION CREST  frigate", theme="federation", size="42 x 16 m", volumes=[
        dict(poly=[(0, 0), (30, 0), (36, 3), (36, 7), (30, 10), (0, 10)], z=full(), kind="hull", spine=True),
        dict(poly=[(8, -3), (21, -3), (24, 0), (8, 0)], z=(9, 50), kind="hull", logo=False),
        dict(poly=[(8, 10), (24, 10), (21, 13), (8, 13)], z=(9, 50), kind="hull", logo=False),
        dict(poly=[(24, -2), (28, -2), (30, 0), (24, 0)], z=(14, 30), kind="plate"),
        dict(poly=[(24, 10), (30, 10), (28, 12), (24, 12)], z=(14, 30), kind="plate")],
        mounts=[("ion.XL", 0, 0.5, "face", 90, -3), ("ion.XL", 0, 5.5, "face", 90, -3),
                ("block.MD", 8, -2.5, "face", 90, 13), ("block.MD", 8, 10.5, "face", 90, 13),
                ("wpn.railgun.LG", 4, 0.5, "top", 0, 0), ("wpn.railgun.LG", 4, 6.5, "top", 0, 0), ("wpn.missile.MD", 26, 1, "top", 0, 0), ("wpn.missile.MD", 26, 7, "top", 0, 0),
                ("wpn.flak.MD", 12, -2.5, "top", 0, 0), ("wpn.pd.MD", 12, 10.5, "top", 0, 0), ("wpn.sensor.MD", 17, 10.5, "top", 0, 0),
                ("wpn.shield.MD", 15, 4, "top", 0, 0), ("wpn.beacon.SM", 20, 1, "top", 0, 0),
                ("cannon.LG", 21, -3, "face", 180, 20), ("cannon.LG", 17, 13, "face", 0, 20),
                ("sky.48.32", 31, 4, "top", 0, 0), ("wpn.tractor.MD", 34, 4, "top", 0, 0),
                ("cargo", 18, -3, "face", 180, 9), ("cargo", 12, 13, "face", 0, 9), ("airlock", 29, 0, "face", 180, 12)]))
    D.append(dict(id="marauder", name="RIFTJACK MARAUDER  raider", theme="riftjack", size="28 x 12 m", volumes=[
        dict(poly=[(0, 0), (18, 0), (22, 2), (22, 4), (18, 6), (0, 6)], z=full(), kind="hull", spine=True),
        dict(poly=[(4, 6), (15, 6), (12, 9), (4, 9)], z=(5, 50), kind="hull", logo=False),
        dict(poly=[(6, -2), (10, -2), (12, 0), (6, 0)], z=(12, 30), kind="plate"),
        dict(poly=[(22, 2), (24, 3), (22, 4)], z=(16, 28), kind="plate")],
        mounts=[("block.LG", 0, 0, "face", 90, 5), ("ion.MD.scrap", 0, 3.5, "face", 90, 13), ("ion.SM.scrap", 4, 7, "face", 90, 19),
                ("cannon.MD", 7, -2, "face", 180, 13), ("cannon.MD", 9, -2, "face", 180, 13), ("cannon.LG", 4, 9, "face", 0, 16),
                ("wpn.missile.MD", 10, 6.75, "top", 0, 0), ("wpn.autocannon.LG", 5, 1.5, "top", 0, 0), ("wpn.flak.SM", 14, 2.5, "top", 0, 0),
                ("wpn.clamp.MD", 16, 1.5, "top", 0, 0),
                ("cargo", 8, 9, "face", 0, 6)]))
    pod = arc(6, 0, 3, -180, 180, 24)[:-1]
    D.append(dict(id="crescent", name="AURELIAN CRESCENT  explorer", theme="aurelian", size="20 x 18 m", volumes=[
        dict(poly=pod, z=(5, 46), kind="hull", spine=False, logo=False),
        dict(poly=[(1, -2), (4, -2), (4, 2), (1, 2)], z=(9, 40), kind="hull", logo=False),
        dict(poly=arc(6, 0, 8, 95, 175, 12) + arc(6, 0, 5.5, 175, 95, 10), z=(10, 32), kind="plate"),
        dict(poly=arc(6, 0, 8, -175, -95, 12) + arc(6, 0, 5.5, -95, -175, 10), z=(10, 32), kind="plate"),
        dict(poly=[(8.8, -1), (12, 0), (8.8, 1)], z=(20, 30), kind="plate")],
        mounts=[("ion.SM", 1, -1.5, "face", 90, 16), ("ion.SM", 1, 0.5, "face", 90, 16), ("sky.32.32", 5, -1, "top", 0, 0)]))
    hub = [(-2, -4), (2, -4), (4, -2), (4, 2), (2, 4), (-2, 4), (-4, 2), (-4, -2)]
    arms = [[(4, -1), (10, -1), (10, 1), (4, 1)], [(-10, -1), (-4, -1), (-4, 1), (-10, 1)],
            [(-1, 4), (1, 4), (1, 10), (-1, 10)], [(-1, -10), (1, -10), (1, -4), (-1, -4)]]
    D.append(dict(id="station", name="HUB STATION  module", theme="federation", size="20 x 20 m", volumes=[
        dict(poly=hub, z=full(), kind="hull", face_style="windows", logo=False)] + [dict(poly=a, z=(9, 46), kind="hull", logo=False) for a in arms],
        mounts=[("airlock", 10, 1, "face", -90, 8), ("airlock", -10, -1, "face", 90, 8), ("airlock", -1, 10, "face", 0, 8),
                ("airlock", 1, -10, "face", 180, 8), ("wpn.sensor.MD", -1, -1, "top", 0, 0), ("wpn.pd.SM", 6, -0.5, "top", 0, 0), ("wpn.pd.SM", -7, -0.5, "top", 0, 0),
                ("wpn.shield.MD", -3, 1, "top", 0, 0), ("wpn.beacon.MD", 1, 1, "top", 0, 0), ("wpn.clamp.SM", -0.5, 7, "top", 0, 0),
                ("rcs.SM", 10, -0.9, "face", -90, 20), ("rcs.SM", -10, 0.9, "face", 90, 20)]))
    return D


# ---- shape-tile library (slopes and curves, dressed)
def shape_library():
    L = []
    L.append(("square 1x1", [(0, 0), (2, 0), (2, 2), (0, 2)]))
    for k in (1, 2, 3, 4):
        L.append((f"slope 1:{k}", [(0, 0), (k * 2, 0), (0, 2)]))
    for r in (2, 3, 4):
        L.append((f"arc r{r}", [(0, 0)] + arc(0, 0, r, 0, 90, 4 * r)))
    L.append(("concave r2", [(0, 0), (3, 0)] + arc(3, 3, 2, 270, 180, 8) + [(0, 3)]))
    L.append(("chamfer 1", [(0, 0), (3, 0), (3, 1), (2, 2), (0, 2)]))
    L.append(("nose 1:2", [(0, 0), (2, 0), (4, 1), (2, 2), (0, 2)]))
    L.append(("round nose", [(0, 0), (1, 0)] + arc(1, 1.5, 1.5, -90, 90, 10) + [(0, 3)]))
    L.append(("swept wing", [(0, 0), (2, 0), (4, 2), (4, 3), (0, 3)]))
    L.append(("notch", [(0, 0), (3, 0), (3, 1), (2, 1), (2, 2), (3, 2), (3, 3), (0, 3)]))
    return L


# =========================================================================== BLUEPRINT
def blueprint_material():
    m = bpy.data.materials.new("blueprint_fill")
    m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ"); nt.links.new(geo.outputs["Position"], sep.inputs[0])
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["From Min"].default_value, mr.inputs["From Max"].default_value = 0.0, 4.0
    mr.inputs["To Min"].default_value, mr.inputs["To Max"].default_value = 0.0, 1.0
    nt.links.new(sep.outputs["Z"], mr.inputs["Value"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.010, 0.045, 0.14, 1)
    ramp.color_ramp.elements[1].color = (0.05, 0.22, 0.48, 1)
    nt.links.new(mr.outputs[0], ramp.inputs["Fac"])
    e = nt.nodes.new("ShaderNodeEmission"); nt.links.new(ramp.outputs["Color"], e.inputs["Color"])
    o = nt.nodes.new("ShaderNodeOutputMaterial"); nt.links.new(e.outputs[0], o.inputs[0])
    return m


def blueprint_grid(coll, cx, cy, size):
    me = bpy.data.meshes.new("bp_grid")
    me.from_pydata([(cx - size, cy - size, -0.05), (cx + size, cy - size, -0.05), (cx + size, cy + size, -0.05), (cx - size, cy + size, -0.05)], [], [(0, 1, 2, 3)])
    m = bpy.data.materials.new("bp_grid")
    m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ"); nt.links.new(tc.outputs["Object"], sep.inputs[0])
    acc = None
    for axis in ("X", "Y"):
        for period, width, weight in ((1.0, 0.025, 0.35), (5.0, 0.05, 1.0)):
            md = nt.nodes.new("ShaderNodeMath"); md.operation = "PINGPONG"; md.inputs[1].default_value = period / 2
            nt.links.new(sep.outputs[axis], md.inputs[0])
            lt = nt.nodes.new("ShaderNodeMath"); lt.operation = "LESS_THAN"; lt.inputs[1].default_value = width
            nt.links.new(md.outputs[0], lt.inputs[0])
            mul = nt.nodes.new("ShaderNodeMath"); mul.operation = "MULTIPLY"; mul.inputs[1].default_value = weight
            nt.links.new(lt.outputs[0], mul.inputs[0])
            if acc is None:
                acc = mul.outputs[0]
            else:
                mx = nt.nodes.new("ShaderNodeMath"); mx.operation = "MAXIMUM"
                nt.links.new(acc, mx.inputs[0]); nt.links.new(mul.outputs[0], mx.inputs[1]); acc = mx.outputs[0]
    mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"
    nt.links.new(acc, mix.inputs["Factor"])
    mix.inputs[6].default_value = (0.004, 0.018, 0.06, 1); mix.inputs[7].default_value = (0.06, 0.20, 0.42, 1)
    e = nt.nodes.new("ShaderNodeEmission"); nt.links.new(mix.outputs[2], e.inputs["Color"])
    o = nt.nodes.new("ShaderNodeOutputMaterial"); nt.links.new(e.outputs[0], o.inputs[0])
    me.materials.append(m)
    ob = bpy.data.objects.new("bp_grid", me)
    coll.objects.link(ob)
    return ob


def blueprint_lines(sc, crease, thickness):
    ls = sc.view_layers[0].freestyle_settings.linesets[0]
    ls.select_crease = crease
    sc.render.line_thickness = thickness


def blueprint_mode(sc, colls, bp_mat):
    """Swap every placed piece to the flat blueprint fill, drop bevels/decals, enable Freestyle lines."""
    objs = [ob for c in colls for ob in list(c.all_objects)]   # snapshot: editing invalidates the live iterator
    for ob in objs:
        if True:
            if ob.type != "MESH" or ob.name.startswith("bp_grid"):
                continue
            if ob.name.startswith(("decal", "plume")):
                ob.hide_render = True
                continue
            for s in ob.material_slots:
                s.link = "OBJECT"
                s.material = bp_mat
            for md in ob.modifiers:
                md.show_render = False
    sc.render.use_freestyle = True
    sc.render.line_thickness_mode = "ABSOLUTE"
    sc.render.line_thickness = 1.1
    vl = sc.view_layers[0]
    vl.use_freestyle = True
    fs = vl.freestyle_settings
    fs.crease_angle = math.radians(134)
    ls = fs.linesets[0] if len(fs.linesets) else fs.linesets.new("bp")
    ls.select_by_visibility = True
    ls.select_silhouette = ls.select_border = ls.select_crease = True
    ls.linestyle = ls.linestyle or bpy.data.linestyles.new("bp")
    ls.linestyle.color = (0.75, 0.93, 1.0)
    sc.view_settings.view_transform, sc.view_settings.look = "Standard", "None"
    sc.view_settings.exposure, sc.view_settings.gamma = 0.0, 1.0
    sc.node_tree.nodes.clear()
    rl = sc.node_tree.nodes.new("CompositorNodeRLayers"); comp = sc.node_tree.nodes.new("CompositorNodeComposite")
    sc.node_tree.links.new(rl.outputs["Image"], comp.inputs["Image"])
    w = sc.world
    w.node_tree.nodes.clear()
    bg = w.node_tree.nodes.new("ShaderNodeBackground"); bg.inputs[0].default_value = (0.004, 0.018, 0.06, 1)
    wo = w.node_tree.nodes.new("ShaderNodeOutputWorld"); w.node_tree.links.new(bg.outputs[0], wo.inputs[0])


# =========================================================================== SHEETS
def component_sheet(kit, mats, coll, origin):
    """Every kit piece laid out in plan (face pieces lie on their backs so their face reads from above)."""
    ox, oy = origin
    lab = label_material()
    rows = [
        ("FACE CASSETTES", [cassette_for_sheet(kit, k, w, 24) for k, w in (("panel", 2), ("split", 2), ("hatch", 2), ("armor", 2), ("module", 2),
                                                                             ("pipes", 2), ("logo", 3), ("grille", 1), ("light", 1), ("stack", 1),
                                                                             ("beacon", 1), ("module", 1), ("pipes", 1))]),
        ("GLAZING", [kit.get(("win", "window", 2, 20), WIN["window"], 32, 20), kit.get(("win", "full", 3, 44), WIN["full"], 48, 44),
                     kit.get(("win", "port", 1, 20), WIN["port"], 16, 20), kit_piece(kit, "sky.32.32"), kit_piece(kit, "sky.48.32"), kit_piece(kit, "sky.32.48")]),
        ("ROOF MODULES", [kit.get(("roof", k, 32, 48), roof_module, 32, 48, k) for k in ("box", "vent", "hatch", "greeble", "pipes", "radiator", "tanks", "cargo")]
         + [kit.get(("roof", "spine", 32, 32), roof_module, 32, 32, "spine"), kit.get("rlogo", roof_logo, 64, 32)]),
        ("ROOF FILLERS + RIM", [kit.get(("rs", k), roof_small, k) for k in ("box", "vent", "fan", "sensor", "hatch")]
         + [kit.get(("rim", k), roof_rim, k) for k in ("plain", "bump", "lit", "vent")]),
        ("ENGINES  SM / MD / LG / XL", [kit_piece(kit, f"ion.{z}") for z in SIZE_CELLS] + [kit_piece(kit, f"block.{z}") for z in SIZE_CELLS]
                                         + [kit_piece(kit, "rcs.SM"), kit_piece(kit, "rcs.MD")]),
        ("WEAPONS  (MD)", [kit_piece(kit, f"wpn.{k}.MD") for k in MOUNT_KINDS[:6]] + [kit_piece(kit, f"cannon.{z}") for z in ("SM", "MD", "LG")]),
        ("UTILITY  (MD)", [kit_piece(kit, f"wpn.{k}.MD") for k in MOUNT_KINDS[6:]] + [kit_piece(kit, "cargo"), kit_piece(kit, "airlock"),
                                                                                    kit_piece(kit, "ion.LG.scrap")]),
        ("INTERIOR EDGES + DECORATORS", [kit.get("wfull", edge_wall, "full"), kit.get("wglazed", edge_wall, "glazed"), kit.get("whalf", edge_wall, "half"),
                                         kit.get("door", edge_door), kit.get("floor", floor_tile), kit.get("spike", decorator, "spike"),
                                         kit.get("crystal", decorator, "crystal"), kit.get("antenna", decorator, "antenna")]),
    ]
    y = oy
    for title, pieces in rows:
        text(title, (ox - 10.0, y - 1.2, 0.02), 0.6, lab, coll)
        x, rowd = ox, 0
        for pc in pieces:
            w, d, h = (v * T for v in pc.size)
            laid = pc.id.startswith(("mount.engine", "mount.cannon", "mount.rcs"))
            if pc.mount == "face" and not laid:
                ob = instance(pc, (x, y, 0.0), 0, mats, coll)
                ob.rotation_euler = (math.radians(90), 0, 0)
                ext, dep = w, h
            elif laid:
                instance(pc, (x, y - d, 0), 0, mats, coll)
                ext, dep = w, d
            else:
                instance(pc, (x, y - d, 0), 0, mats, coll)
                ext, dep = max(w, max(bx[3] for bx in pc.boxes) * T), d
            text(pc.id.split(".", 1)[1], (x, y - dep - 0.6, 0.02), 0.36, lab, coll)
            x += max(ext, 1.2, 0.2 * len(pc.id)) + 1.0
            rowd = max(rowd, dep)
        y -= rowd + 2.2
    return y


def cassette_for_sheet(kit, kind, wm, h):
    return kit.get(("cas", kind, wm, h), CAS[kind], wm * 16, h)


# =========================================================================== SCENE / MAIN
def setup(sc, samples):
    sc.render.engine = "BLENDER_EEVEE_NEXT"
    sc.render.resolution_x, sc.render.resolution_y = 1672, 941
    sc.eevee.taa_render_samples = samples
    for attr, val in (("use_raytracing", True), ("use_shadows", True), ("use_fast_gi", True), ("fast_gi_distance", 1.5)):
        if hasattr(sc.eevee, attr):
            setattr(sc.eevee, attr, val)
    world(sc)
    key = bpy.data.objects.new("Key", bpy.data.lights.new("Key", "SUN")); sc.collection.objects.link(key)
    key.data.energy, key.data.color, key.data.angle = 3.2, (1.0, 0.95, 0.88), math.radians(6)
    key.rotation_euler = (math.radians(38), math.radians(-14), math.radians(-35))
    fill = bpy.data.objects.new("Fill", bpy.data.lights.new("Fill", "SUN")); sc.collection.objects.link(fill)
    fill.data.energy, fill.data.color = 0.8, (0.55, 0.45, 1.0)
    fill.rotation_euler = (math.radians(60), math.radians(10), math.radians(150))
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam")); sc.collection.objects.link(cam); sc.camera = cam
    sc.view_settings.view_transform, sc.view_settings.look = "AgX", "AgX - Base Contrast"
    sc.view_settings.exposure, sc.view_settings.gamma = 0.35, 1.08
    sc.use_nodes = True
    ct = sc.node_tree; ct.nodes.clear()
    rl = ct.nodes.new("CompositorNodeRLayers")
    gl = ct.nodes.new("CompositorNodeGlare"); gl.glare_type, gl.threshold, gl.size, gl.mix = "FOG_GLOW", 0.8, 8, 0.0
    hs = ct.nodes.new("CompositorNodeHueSat"); hs.inputs["Saturation"].default_value = 1.3
    bc = ct.nodes.new("CompositorNodeBrightContrast"); bc.inputs["Contrast"].default_value = -3.0
    comp = ct.nodes.new("CompositorNodeComposite")
    ct.links.new(rl.outputs["Image"], gl.inputs["Image"]); ct.links.new(gl.outputs["Image"], hs.inputs["Image"])
    ct.links.new(hs.outputs["Image"], bc.inputs["Image"]); ct.links.new(bc.outputs["Image"], comp.inputs["Image"])
    return cam


def look(cam, target, offset, lens):
    cam.data.type = "PERSP"
    cam.data.lens = lens
    cam.location = Vector(target) + Vector(offset)
    cam.rotation_euler = (Vector(target) - cam.location).to_track_quat("-Z", "Y").to_euler()


def ortho_top(cam, cx, cy, scale):
    cam.data.type, cam.data.ortho_scale = "ORTHO", scale
    cam.location, cam.rotation_euler = (cx, cy, 80), (0, 0, 0)


# layout of the design sheet: (design id) -> world origin
LAYOUT = {"razor": (0, 44), "courier": (14, 45), "crescent": (40, 44), "station": (68, 44),
          "corvette": (0, 16), "marauder": (36, 18), "frigate": (0, -14)}


def engine_showcase(kit, theme_mats, lab, sc):
    """Engine size classes side by side (nozzles toward +x) with a crew figure for scale, an exploded
    XL ion drive (flange / conduits / housing / nozzle) and a weapons row."""
    coll = bpy.data.collections.new("ENGINES"); sc.collection.children.link(coll)
    fm = theme_mats["federation"]
    y = 0.0
    for fam in ("ion", "block", "scrap"):
        for sz in SIZE_CELLS:
            pc = kit_piece(kit, f"{fam}.{sz}" if fam != "scrap" else f"ion.{sz}.scrap")
            W = pc.size[0] * T
            y += W
            instance(pc, (500.0, y, 0.0), -90, fm if fam != "scrap" else theme_mats["riftjack"], coll)   # outward -> +x
            text(f"{fam} {sz}", (497.2, y - W / 2 - 0.25, 0.02), 0.5, lab, coll)
            y += 1.3
        y += 2.0
    instance(kit_piece(kit, "crew"), (498.2, -1.4, 0.0), 0, fm, coll)
    text("crew 1.8 m", (496.8, -2.4, 0.02), 0.4, lab, coll)
    parts, meta = kit.get(("ionparts", "XL"), ion_parts, "XL")
    x0, y0 = 530.0, 6.0
    names = {"nozzle": "THRUSTER NOZZLE", "housing": "ENGINE HOUSING", "conduit": "CONDUIT LAYER", "flange": "MOUNT FLANGE"}
    W = meta["W"] * T
    place = {"flange": (-5.0, 0.0), "housing": (0.0, 0.0), "conduit": (0.0, 5.2), "nozzle": (4.5, 0.0)}
    label_at = {"flange": (-6.2, 4.6), "housing": (1.0, -1.1), "conduit": (1.0, 6.2), "nozzle": (9.2, 4.6)}
    for pc in parts:
        k = pc.id.rsplit(".", 1)[1]
        dx, dz = place[k]
        instance(pc, (x0 + dx, y0, dz), -90, fm, coll)
        lx, lz = label_at[k]
        t = text(names[k], (x0 + lx, y0 - W - 0.3, lz), 0.55, lab, coll)
        t.rotation_euler = (math.radians(90), 0, 0)
    instance(kit_piece(kit, "ion.XL"), (x0, y0 + 7.0, 0.0), -90, fm, coll)
    t = text("ASSEMBLED  ION DRIVE XL  (4 x 4 m hardpoint)", (x0 - 1.0, y0 + 3.0 - 0.3, W + 0.5), 0.5, lab, coll)
    t.rotation_euler = (math.radians(90), 0, 0)
    return coll, (x0 + meta["total"] * T / 2, y0, 2.5)


def weapon_showcase(kit, theme_mats, lab, sc):
    """Mount catalog (every kind at MD), size ladder (SM / MD / LG) + one mount in three themes,
    and an exploded LG autocannon: connector / base / gimbal / head / payload."""
    coll = bpy.data.collections.new("WEAPONS"); sc.collection.children.link(coll)
    fm = theme_mats["federation"]
    for i, kind in enumerate(MOUNT_KINDS):
        x, y = 600.0 + (i % 6) * 5.0, 0.0 - (i // 6) * 6.0
        instance(kit_piece(kit, f"wpn.{kind}.MD"), (x + 0.3, y + 1.8, 0.0), -55, fm, coll)
        text(MOUNT_LABEL[kind], (x - 0.4, y - 1.2, 0.02), 0.34, lab, coll)
    x = 600.0
    for kind in ("autocannon", "missile", "laser"):
        for sz in ("SM", "MD", "LG"):
            pc = kit_piece(kit, f"wpn.{kind}.{sz}")
            instance(pc, (x, -22.0 + pc.size[0] * T * 0.8, 0.0), -55, fm, coll)
            text(f"{kind} {sz}", (x - 0.2, -23.3, 0.02), 0.3, lab, coll)
            x += max(bx[3] for bx in pc.boxes) * T + 1.2
        x += 1.0
    for j, tn in enumerate(THEMES):
        instance(kit_piece(kit, "wpn.autocannon.MD"), (x + j * 3.6, -20.4, 0.0), -55, theme_mats[tn], coll)
        text(tn, (x + j * 3.6, -23.3, 0.02), 0.3, lab, coll)
    parts = kit.get(("wpnparts", "autocannon", "LG"), mount_parts, "autocannon", "LG")
    ex, ey = 690.0, 0.0
    names = ["HARDPOINT CONNECTOR", "ROTATION BASE", "GIMBAL / ELEVATION", "HEAD / AMMO DRUM", "BARRELS"]
    for kk, pc in enumerate(parts):
        dz = kk * 1.5
        instance(pc, (ex, ey, dz), 0, fm, coll)
        zc = min(bx[2] for bx in pc.boxes) * T + dz
        t = text(names[kk], (ex + 5.2, ey + 1.5, zc + 0.1), 0.4, lab, coll)
        t.rotation_euler = (math.radians(90), 0, 0)
    instance(kit_piece(kit, "wpn.autocannon.LG"), (ex - 6.0, ey, 0.0), 0, fm, coll)
    t = text("COMPLETE", (ex - 5.4, ey + 1.5, 3.0), 0.45, lab, coll)
    t.rotation_euler = (math.radians(90), 0, 0)
    t = text("EXPLODED  (twin autocannon LG, 3 x 3 m hardpoint)", (ex - 1.0, ey + 1.5, 9.2), 0.45, lab, coll)
    t.rotation_euler = (math.radians(90), 0, 0)
    return coll


def main():
    args = parse_args()
    shots = {s for s in args.shots.split(",") if s}
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    out = args.out.rstrip("/")
    detail = detail_height(f"{out}/{REVISION}_detail_height.png")
    kit = Kit()
    theme_mats = {tn: {s: slot_material(tn, s, th, detail) for s in SLOTS} for tn, th in THEMES.items()}
    for tn, th in THEMES.items():
        theme_mats[tn]["plume_outer"], theme_mats[tn]["plume_core"] = plume_materials(tn, th)
    decal_sets = {}
    for tn, th in THEMES.items():
        name_img = text_mask(th["name"], f"{out}/{REVISION}_decal_{th['name'].lower()}.png")
        num_img = text_mask(th["number"], f"{out}/{REVISION}_decal_{th['number'].lower()}.png")
        emb_img = emblem_mask(th["emblem"], f"{out}/{REVISION}_emblem_{th['emblem']}.png")
        decal_sets[tn] = {"name": decal_material(f"{tn}.decal.name", name_img, th["on_dark"]),
                          "number": decal_material(f"{tn}.decal.number", num_img, th["on_light"]),
                          "emblem": decal_material(f"{tn}.decal.emblem", emb_img, th["on_dark"]),
                          "emblem_small": decal_material(f"{tn}.decal.emblem2", emb_img, th["on_light"])}
    lab = label_material()
    ships = bpy.data.collections.new("DESIGNS"); sc.collection.children.link(ships)
    stats = {}
    for dsg in designs():
        ox, oy = LAYOUT[dsg["id"]]
        c = bpy.data.collections.new(f"D_{dsg['id']}"); ships.children.link(c)
        stats[dsg["id"]] = dress(dsg, kit, theme_mats[dsg["theme"]], decal_sets[dsg["theme"]], dsg["theme"], c, (ox, oy))
        ys = [p[1] for v in dsg["volumes"] for p in v["poly"]]
        xs = [p[0] for v in dsg["volumes"] for p in v["poly"]]
        lbl = bpy.data.collections.new(f"L_{dsg['id']}"); sc.collection.children.link(lbl)
        text(dsg["name"], (ox + min(xs) - 6, oy + min(ys) - 2.6, 0.02), 1.5, lab, lbl)
        text(f"{dsg['size']}  |  {dsg['theme']}", (ox + min(xs) - 6, oy + min(ys) - 4.2, 0.02), 1.0, lab, lbl)
    shapes = bpy.data.collections.new("SHAPES"); sc.collection.children.link(shapes)
    x0 = 150.0
    for k, (nm, poly) in enumerate(shape_library()):
        x0 += 0 if k == 0 else 0
        dress(dict(id=f"shape{k}", volumes=[dict(poly=poly, z=full(), kind="hull", logo=False)], mounts=[]), kit,
              theme_mats["federation"], decal_sets["federation"], "federation", shapes, (x0, 0))
        text(nm, (x0, -1.8, 0.02), 0.6, lab, shapes)
        x0 += max(p[0] for p in poly) + 3.5
    shapes_cx = (150.0 + x0 - 3.5) / 2
    sheet = bpy.data.collections.new("COMPONENTS"); sc.collection.children.link(sheet)
    bottom = component_sheet(kit, theme_mats["federation"], sheet, (300, 0))
    engines, ex_mid = engine_showcase(kit, theme_mats, lab, sc)
    weapons = weapon_showcase(kit, theme_mats, lab, sc)
    pieces = [p for p in kit.p.values() if isinstance(p, Piece)]
    manifest = {"revision": REVISION, "texel_m": T, "slots": SLOTS, "themes": list(THEMES),
                "unique_meshes": len(MESHES), "placements": PLACEMENTS["count"], "designs": stats,
                "hardpoint_cells": SIZE_CELLS, "ion_body_texels": ION_LEN,
                "pieces": [{"id": p.id, "family": p.family, "mount": p.mount, "size_m": [v * T for v in p.size],
                            "slots": p.slots(), "boxes": len(p.boxes), "decal_sockets": [d[0] for d in p.decals],
                            "voxel_aligned": p.aligned()} for p in sorted(pieces, key=lambda q: (q.family, q.id))]}
    with open(f"{out}/kit_{REVISION}.json", "w") as fh:
        json.dump(manifest, fh, indent=1)
    gen = [m for k, m in MESHES.items() if isinstance(k, str) and k.startswith("gen.")]
    print(f"ship_kit_prototype {REVISION}: kit_pieces={len(pieces)} unique_meshes={len(MESHES)} (generated={len(gen)}) "
          f"placements={PLACEMENTS['count']} all_kit_voxel_aligned={all(p.aligned() for p in pieces)} designs={stats}", flush=True)
    if args.no_render:
        return
    cam = setup(sc, args.samples)
    labels = [c for c in sc.collection.children if c.name.startswith("L_")]
    everything = [ships, shapes, sheet, engines, weapons] + labels

    def shot(name, visible, res=(1672, 941)):
        if shots and name not in shots:
            return
        for c in everything:
            c.hide_render = c not in visible
        sc.render.resolution_x, sc.render.resolution_y = res
        sc.render.filepath = f"{out}/{REVISION}_{name}.png"
        bpy.ops.render.render(write_still=True)
        print(f"rendered {name}", flush=True)

    # ---- colour renders
    ortho_top(cam, 36, 18, 136)
    shot("designs_topdown", [ships], (2400, 1350))
    look(cam, (36, 18, 0), (-6, -70, 50), 28)
    shot("designs_lineup", [ships], (2400, 1350))
    look(cam, (18, -9, 1.5), (26, -24, 20), 35)
    shot("frigate_hero", [ships])
    look(cam, (33.5, -9, 1.8), (6, -9, 4.5), 30)
    shot("frigate_bow_slopes", [ships])
    look(cam, (1.5, -9, 1.5), (-16, -15, 9), 30)
    shot("frigate_rear_engines", [ships])
    look(cam, (38, 21, 1.5), (-13, -11, 7), 30)
    shot("marauder_rear", [ships])
    look(cam, (507, 17, 1.2), (21, -26, 17), 34)
    shot("engines_lineup", [engines])
    look(cam, (ex_mid[0], ex_mid[1] + 2.0, ex_mid[2]), (9.0, -24, 12.0), 32)
    shot("engine_exploded", [engines])
    look(cam, (613.5, -3.5, 0.6), (-2, -23, 16), 31)
    shot("weapons_catalog", [weapons])
    look(cam, (617, -21, 0.6), (-1, -15, 9), 36)
    shot("weapon_sizes_themes", [weapons])
    look(cam, (691.0, 1.5, 3.8), (2, -21, 4.0), 34)
    shot("weapon_exploded", [weapons])
    look(cam, (12, 46.5, 1.0), (4, -12, 9), 32)
    shot("razor_courier", [ships])
    look(cam, (shapes_cx, 1.5, 1.0), (-4, -38, 26), 28)
    shot("shape_tiles", [shapes])
    look(cam, (12, 17, 1.5), (4, -10, 4), 32)
    shot("corvette_side_density", [ships])
    # ---- blueprints
    bp = blueprint_material()
    if not shots or any(s.startswith("blueprint") for s in shots):
        blueprint_grid(ships, 36, 18, 80)
        blueprint_grid(shapes, shapes_cx, 0, 60)
        blueprint_grid(sheet, 322, bottom / 2, 60)
        blueprint_mode(sc, [ships, shapes, sheet], bp)
        blueprint_lines(sc, False, 0.8)
        ortho_top(cam, 36, 16, 136)
        shot("blueprint_designs", [ships] + labels, (2400, 1350))
        blueprint_lines(sc, True, 0.9)
        ortho_top(cam, shapes_cx, 1.0, (shapes_cx - 150) * 2 + 8)
        shot("blueprint_shapes", [shapes], (2400, 900))
        ortho_top(cam, 318, bottom / 2 + 0.5, 64)
        shot("blueprint_components", [sheet], (2400, 2100))


main()
