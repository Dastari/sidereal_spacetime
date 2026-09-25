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

REVISION = "r004"
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
BODY = [(0, 1), (20, 1), (24, 5), (24, 7), (20, 11), (0, 11)]
WING_S = [(4, 11), (12, 11), (9, 14), (4, 14)]
WING_P = [(4, -2), (9, -2), (12, 1), (4, 1)]


class Kit:
    def __init__(self):
        self.p = {}

    def get(self, key, maker, *args):
        if key not in self.p:
            self.p[key] = maker(*args)
        return self.p[key]


def ship_structure_pieces(kit):
    """The generated structure (hull cells) is itself a Piece shared by every theme copy."""
    body = Piece("gen.body.corvette", "generated", "plan", (384, 192, 54))

    def body_col(cx, cy, b):
        return ("trim", "secondary", "primary", "primary")[b]
    for bx in raster_cells(BODY, [0, 5, 29, 49, 54], body_col):
        if bx[2] == 0:        # skirt inset by 1/4 m
            x0, y0, z0, x1, y1, z1, s = bx
            if y0 < 16 + 4 or y1 > 176 - 4:
                continue
            bx = (max(x0, 4), y0, z0, x1 - 4, y1, z1, s)
        body.b(*bx)
    wings = Piece("gen.wings.corvette", "generated", "plan", (192, 256, 30))

    def wing_col(cx, cy, b):
        h = H(cx, cy, 44)
        if cy in (13, -2):
            return "secondary"
        return "primary" if h < 0.62 else ("secondary" if h < 0.82 else "accent")
    for poly in (WING_S, WING_P):
        for bx in raster_cells(poly, [12, 30], wing_col):
            wings.b(*bx)
    return body, wings


def face_edges():
    """Straight hull faces that take cassettes: (start, dir, length, z_tiers, reservations {tier: [(u0,u1)]}, fixed)."""
    t2 = [(BODY_Z[0], BODY_Z[1]), (BODY_Z[1], BODY_Z[2])]
    return [
        ("port", (0, 1), (1, 0), 20, t2, {0: [(4, 12), (12, 16)], 1: [(12, 16), (17, 20)]}, {1: [(17, 20, "logo")]}),
        ("stbd", (20, 11), (-1, 0), 20, t2, {0: [(4, 6), (8, 16)], 1: [(4, 6), (0, 3)]}, {1: [(0, 3, "logo")]}),
        ("rear", (0, 11), (0, -1), 10, t2, {0: [(1, 9)], 1: [(1, 9)]}, {}),
        ("bow", (24, 5), (0, 1), 2, t2, {}, {0: [(0, 2, "panel")], 1: [(0, 2, "window")]}),
        ("wingS", (9, 14), (-1, 0), 5, [(12, 30)], {0: [(3, 4)]}, {}),
        ("wingP", (4, -2), (1, 0), 5, [(12, 30)], {0: [(2, 3)]}, {}),
        ("wingSr", (4, 14), (0, -1), 3, [(12, 30)], {0: [(1, 2)]}, {}),
        ("wingPr", (4, 1), (0, -1), 3, [(12, 30)], {0: [(1, 2)]}, {}),
    ]


def cassette_for(kit, kind, wm, h):
    w = wm * 16
    makers = {"panel": cas_panel, "split": cas_split, "grille": cas_grille, "hatch": cas_hatch, "light": cas_light,
              "stack": cas_stack, "logo": cas_logo}
    if kind == "window":
        return kit.get(("win", w, h), cas_window, w, h, "band")
    if kind == "port":
        return kit.get(("port", w, h), cas_port, w, h)
    return kit.get((kind, w, h), makers[kind], w, h)


def choose(kind_seed, wm, tier, upper):
    h = H(*kind_seed)
    if wm == 1:
        return ("grille", "light", "stack", "port" if upper else "grille")[int(h * 4)]
    if wm == 2:
        return ("panel", "split", "hatch", "window" if upper else "panel", "split")[int(h * 5)]
    return ("panel", "split")[int(h * 2)]


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


def build_ship(kit, theme, off, mats, decals, coll):
    ox, oy = off
    body, wings = kit.get("body", ship_structure_pieces, kit)
    for pc in (body, wings):
        instance(pc, (ox, oy, 0), 0, mats, coll, bevel=0.01)
    # --- face cassettes on straight faces
    for name, start, d, length, tiers, holes, fixed in face_edges():
        rot = math.degrees(math.atan2(d[1], d[0])) + 180
        for ti, (z0, z1) in enumerate(tiers):
            h = z1 - z0
            items = [(u0, u1 - u0, k) for (u0, u1, k) in fixed.get(ti, [])]
            for seg in subtract(0, length, holes.get(ti, [])):
                for u, wm in pack(seg, sum(map(ord, name)) + ti * 13):
                    items.append((u, wm, choose((name, ti, u, 5), wm, ti, ti == 1)))
            for u, wm, kind in items:
                pc = cassette_for(kit, kind, wm, h)
                org = (start[0] + d[0] * (u + wm) + ox, start[1] + d[1] * (u + wm) + oy, z0 * T)
                instance(pc, org, rot, mats, coll)
                for sock in pc.decals:
                    decal_quad(f"decal.{name}.{u}", pc, sock, decals["name"], org, rot, coll, 4.0)
        if len(tiers) == 2:                       # rim band on body faces
            for u in range(length):
                pc = kit.get(("rim", u % 3 == 1), cas_rim, 16, BODY_Z[3] - BODY_Z[2], u % 3 == 1)
                org = (start[0] + d[0] * (u + 1) + ox, start[1] + d[1] * (u + 1) + oy, BODY_Z[2] * T)
                instance(pc, org, rot, mats, coll)
    # --- roof: rim plates, grid modules, spine, bow
    zt = BODY_Z[3] * T
    rim_cells = [(x, 1) for x in range(20)] + [(x, 10) for x in range(20)] + [(0, y) for y in range(2, 10)] + [(19, y) for y in range(2, 10)]
    for x, y in rim_cells:
        kind = ("plain", "bump", "lit", "vent", "plain")[int(H(x, y, 3) * 5)]
        instance(kit.get(("rim", kind), roof_rim, kind), (x + ox, y + oy, zt), 0, mats, coll)
    for col in range(1, 19, 2):
        for y0, dm in ((2, 3), (7, 3)):
            if col == 1 and y0 == 2:
                instance(kit.get("dish", dish), (col + ox, y0 + 0.5 + oy, zt), 0, mats, coll)
                continue
            kind = "vent" if col == 1 else ("box", "vent", "hatch", "greeble", "box")[int(H(col, y0, 9) * 5)]
            pc = {"box": lambda: kit.get(("rbox", 32, 48), roof_box, 32, 48), "vent": lambda: kit.get(("rvent", 32, 48), roof_vent, 32, 48),
                  "hatch": lambda: kit.get(("rhatch", 32, 48), roof_hatch, 32, 48),
                  "greeble": lambda: kit.get(("rgreeble", col % 3), roof_greeble, 32, 48, col % 3)}[kind]()
            instance(pc, (col + ox, y0 + oy, zt), 0, mats, coll)
            if kind == "greeble":
                deco_at(kit, theme, (col + 0.5 + ox, y0 + 1.2 + oy, zt + 2 * T), mats, coll)
        if col in (5, 13):
            instance(kit.get("turret", turret_top), (col + ox, 5 + oy, zt), 0, mats, coll)
        elif col == 9:
            pc = kit.get("rlogo", roof_logo, 64, 32)
            instance(pc, (col + ox, 5 + oy, zt), 0, mats, coll)
            decal_quad("decal.roof.emblem", pc, pc.decals[0], decals["emblem"], (col + ox, 5 + oy, zt), 0, coll, 1.0)
        elif col != 11:
            instance(kit.get("rspine", roof_spine, 32, 32), (col + ox, 5 + oy, zt), 0, mats, coll)
    instance(kit.get("sky", roof_skylight, 32, 48), (20 + ox, 4.5 + oy, zt), 0, mats, coll)
    instance(kit.get("tractor", tractor), (22 + ox, 5 + oy, zt), 0, mats, coll)
    # --- mounts: engines, cannons, thrusters, cargo door, airlock
    for y0, w, h, L, z in ((2, 48, 36, 64, 9), (7, 48, 36, 64, 9)):
        instance(kit.get(("eng", w), engine, f"mount.engine.w{w // 16}", w, h, L), (ox, y0 + oy, z * T), 90, mats, coll)
    instance(kit.get(("eng", 32), engine, "mount.engine.w2", 32, 26, 48), (ox, 5 + oy, 14 * T), 90, mats, coll)
    instance(kit.get("cannon", side_cannon), (5 + ox, 14 + oy, 14 * T), 0, mats, coll)
    instance(kit.get("cannon", side_cannon), (7 + ox, -2 + oy, 14 * T), 180, mats, coll)
    for y in (12, -1):
        instance(kit.get("thr", thruster), (4 + ox, y + oy, 15 * T), 90, mats, coll)
    instance(kit.get("cargo", cargo_door), (16 + ox, 1 + oy, 6 * T), 180, mats, coll)
    instance(kit.get("airlock", airlock), (14 + ox, 11 + oy, 8 * T), 0, mats, coll)
    # --- wing decals and wing-tip decorators
    top_decal("decal.wing.number", decals["number"], 4.6 + ox, 12.2 + oy, 8.6 + ox, 13.2 + oy, 30 * T + 0.003, coll)
    top_decal("decal.wing.emblem", decals["emblem_small"], 5.2 + ox, -1.6 + oy, 6.8 + ox, 0.0 + oy, 30 * T + 0.003, coll)
    if theme == "riftjack":
        for x, y in rim_cells[::3]:
            instance(kit.get("spike", decorator, "spike"), (x + 0.3 + ox, y + 0.3 + oy, zt + 2 * T), 0, mats, coll)
        for x in (5, 7):
            instance(kit.get("spike", decorator, "spike"), (x + ox, 13.3 + oy, 30 * T), 0, mats, coll)
            instance(kit.get("spike", decorator, "spike"), (x + ox, -1.7 + oy, 30 * T), 0, mats, coll)
    elif theme == "aurelian":
        for x in (5, 7):
            instance(kit.get("crystal", decorator, "crystal"), (x + ox, 13.3 + oy, 30 * T), 0, mats, coll)
            instance(kit.get("crystal", decorator, "crystal"), (x + ox, -1.7 + oy, 30 * T), 0, mats, coll)


def deco_at(kit, theme, loc, mats, coll):
    kind = {"federation": "antenna", "riftjack": "spike", "aurelian": "crystal"}[theme]
    instance(kit.get(kind, decorator, kind), loc, 0, mats, coll)


# =========================================================================== KIT SHEET
def build_sheet(kit, mats, coll, origin):
    ox, oy = origin
    rows = [
        ("HULL SHAPES", [kit.get("h.block", hull_tile, "block.1x1", [(0, 0), (1, 0), (1, 1), (0, 1)]),
                         kit.get("h.s11", hull_tile, "slope.1-1", [(0, 0), (1, 0), (0, 1)]),
                         kit.get("h.s12", hull_tile, "slope.1-2", [(0, 0), (2, 0), (0, 1)]),
                         kit.get("h.arc", hull_tile, "arc.r2", [(0, 0)] + [(2 * math.cos(a), 2 * math.sin(a)) for a in [i * math.pi / 16 for i in range(9)]]),
                         kit.get("floor", floor_tile)]),
        ("FACE CASSETTES", [cassette_for(kit, k, w, 24) for k, w in (("panel", 2), ("split", 2), ("hatch", 2), ("logo", 3), ("grille", 1), ("light", 1), ("stack", 1))]),
        ("GLAZING", [kit.get(("win", 32, 20), cas_window, 32, 20, "band"), kit.get(("winfull", 48, 44), cas_window, 48, 44, "full"),
                     kit.get(("port", 16, 20), cas_port, 16, 20), kit.get("sky", roof_skylight, 32, 48)]),
        ("ROOF MODULES", [kit.get(("rbox", 32, 48), roof_box, 32, 48), kit.get(("rvent", 32, 48), roof_vent, 32, 48),
                          kit.get(("rhatch", 32, 48), roof_hatch, 32, 48), kit.get(("rgreeble", 1), roof_greeble, 32, 48, 1),
                          kit.get("rspine", roof_spine, 32, 32)]),
        ("EXTERNAL MOUNTS", [kit.get("turret", turret_top), kit.get("cannon", side_cannon), kit.get(("eng", 48), engine, "mount.engine.w3", 48, 36, 64),
                             kit.get("thr", thruster), kit.get("tractor", tractor), kit.get("dish", dish), kit.get("cargo", cargo_door), kit.get("airlock", airlock)]),
        ("INTERIOR EDGES + DECORATORS", [kit.get("wfull", edge_wall, "full"), kit.get("wglazed", edge_wall, "glazed"), kit.get("whalf", edge_wall, "half"),
                                         kit.get("door", edge_door), kit.get("spike", decorator, "spike"), kit.get("crystal", decorator, "crystal"),
                                         kit.get("antenna", decorator, "antenna")]),
    ]
    lab = label_material()
    y = oy
    for title, pieces in rows:
        x = ox
        text(title, (ox - 7.5, y - 1.0, 0.01), 0.42, lab, coll)
        depth = 0
        for pc in pieces:
            w, d, h = (v * T for v in pc.size)
            if pc.mount == "face":            # stands on the ground, outward toward the camera (-y)
                instance(pc, (x + w, y, 0), 180, mats, coll)
                depth = max(depth, d)
                ext = w
            elif pc.id.startswith("mount.engine"):
                instance(pc, (x, y, 0), 0, mats, coll)
                ext = w
            else:
                instance(pc, (x, y - d, 0), 0, mats, coll)
                depth = max(depth, d)
                ext = w
            text(pc.id, (x, y - max(d, 0.4) - 0.55, 0.01), 0.16, lab, coll)
            x += ext + 1.0
        y -= max(depth, 1.5) + 2.6


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


# =========================================================================== SCENE
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
    cam.data.lens = lens
    cam.location = Vector(target) + Vector(offset)
    cam.rotation_euler = (Vector(target) - cam.location).to_track_quat("-Z", "Y").to_euler()


def overhead(cam, target, tilt, heading, dist, lens):
    cam.data.lens = lens
    cam.rotation_euler = (math.radians(tilt), 0.0, math.radians(-heading))
    fwd = cam.rotation_euler.to_matrix() @ Vector((0, 0, -1))
    cam.location = Vector(target) - fwd * dist


def main():
    args = parse_args()
    shots = {s for s in args.shots.split(",") if s}
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    out = args.out.rstrip("/")
    detail = detail_height(f"{out}/{REVISION}_detail_height.png")
    kit = Kit()
    ships, sheet = {}, bpy.data.collections.new("KIT_SHEET")
    sc.collection.children.link(sheet)
    theme_mats = {}
    for tn, th in THEMES.items():
        theme_mats[tn] = {s: slot_material(tn, s, th, detail) for s in SLOTS}
    for n, (tn, th) in enumerate(THEMES.items()):
        name_img = text_mask(th["name"], f"{out}/{REVISION}_decal_{th['name'].lower()}.png")
        num_img = text_mask(th["number"], f"{out}/{REVISION}_decal_{th['number'].lower()}.png")
        emb_img = emblem_mask(th["emblem"], f"{out}/{REVISION}_emblem_{th['emblem']}.png")
        dec = {"name": decal_material(f"{tn}.decal.name", name_img, th["on_dark"]),
               "number": decal_material(f"{tn}.decal.number", num_img, th["on_light"]),
               "emblem": decal_material(f"{tn}.decal.emblem", emb_img, th["on_dark"]),
               "emblem_small": decal_material(f"{tn}.decal.emblem2", emb_img, th["on_light"])}
        coll = bpy.data.collections.new(f"SHIP_{tn}")
        sc.collection.children.link(coll)
        build_ship(kit, tn, (0, n * 20), theme_mats[tn], dec, coll)
        ships[tn] = coll
    build_sheet(kit, theme_mats["federation"], sheet, (100, 0))
    pieces = [p for p in kit.p.values() if isinstance(p, Piece)]
    manifest = {"revision": REVISION, "texel_m": T, "slots": SLOTS, "themes": list(THEMES),
                "unique_meshes": len(MESHES), "placements": PLACEMENTS["count"],
                "pieces": [{"id": p.id, "family": p.family, "mount": p.mount, "size_m": [v * T for v in p.size],
                            "slots": p.slots(), "boxes": len(p.boxes), "decal_sockets": [d[0] for d in p.decals],
                            "voxel_aligned": p.aligned()} for p in sorted(pieces, key=lambda q: (q.family, q.id))]}
    with open(f"{out}/kit_{REVISION}.json", "w") as fh:
        json.dump(manifest, fh, indent=1)
    tris = sum(len(me.polygons) * 2 for me in MESHES.values())
    print(f"ship_kit_prototype {REVISION}: pieces={len(pieces)} unique_meshes={len(MESHES)} placements={PLACEMENTS['count']} "
          f"unique_tris={tris} all_voxel_aligned={all(p.aligned() for p in pieces)}", flush=True)
    if args.no_render:
        return
    cam = setup(sc, args.samples)

    def shot(name, visible):
        if shots and name not in shots:
            return
        for c in list(ships.values()) + [sheet]:
            c.hide_render = c not in visible
        sc.render.filepath = f"{out}/{REVISION}_{name}.png"
        bpy.ops.render.render(write_still=True)
        print(f"rendered {name}", flush=True)

    allships = list(ships.values())
    overhead(cam, (9.5, 22.0, 1.5), 10, 90, 92, 50)
    shot("themes_topdown", allships)
    look(cam, (10.0, 5.0, 1.2), (17.0, -24.0, 18.0), 42)
    shot("federation_hero", [ships["federation"]])
    look(cam, (10.0, 25.0, 1.2), (14.0, -30.0, 22.0), 26)
    shot("themes_lineup", allships)
    look(cam, (14.5, 0.6, 1.6), (2.5, -8.5, 2.2), 32)
    shot("detail_closeup", [ships["federation"]])
    look(cam, (11.0, 21.0, 1.8), (6.0, -10.0, 6.0), 32)
    shot("riftjack_closeup", [ships["riftjack"]])
    look(cam, (8.0, 45.0, 2.5), (-9.0, 8.0, 7.0), 36)
    shot("aurelian_closeup", [ships["aurelian"]])
    sc.render.resolution_x, sc.render.resolution_y = 2400, 1350
    look(cam, (107.0, -15.0, 0.0), (0.0, -16.0, 44.0), 30)
    shot("kit_sheet", [sheet])


main()
