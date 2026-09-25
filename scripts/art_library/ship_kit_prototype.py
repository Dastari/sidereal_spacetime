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

REVISION = "r005"
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


def raster_poly(poly, bands, colour):
    """Even-odd scanline raster of any plan polygon into per-1 m-cell stepped boxes (2-texel rows)."""
    ys = [p[1] for p in poly]
    y0 = int(math.floor(min(ys) * 8)) * 2
    y1 = int(math.ceil(max(ys) * 8)) * 2
    cells = {}
    for yt in range(y0, y1, 2):
        yc = (yt + 1) * T
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
        for yt in range(cy * 16, cy * 16 + 16, 2):
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
    ya0, yb0 = int(math.floor((min(ys) - 0.5) * 8)) * 2, int(math.ceil((max(ys) + 0.5) * 8)) * 2
    cols = {}                                              # (yt) -> list of (xt, panel, dist_texels)
    for yt in range(ya0, yb0, 2):
        for xt in range(xa0, xb0, 2):
            cx, cy = (xt + 1) * T, (yt + 1) * T
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

    for yt in range(ya0, yb0 + 2, 2):
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
        mounts=[("engine.20.18.32", 0, 0.25, "face", 90, 8), ("engine.20.18.32", 0, 1.5, "face", 90, 8),
                ("cannon", 2, -2, "face", 180, 10 - 4), ("cannon", 1, 5, "face", 0, 10 - 4), ("sky.32.16", 5, 1, "top", 0, 0)]))
    D.append(dict(id="courier", name="COURIER  shuttle", theme="federation", size="14 x 5 m", volumes=[
        dict(poly=[(0, 0), (8, 0)] + arc(8, 2, 2, -90, 0, 8)[1:] + arc(8, 3, 2, 0, 90, 8) + [(0, 5)], z=(5, 46), kind="hull")],
        mounts=[("engine.24.22.40", 0, 0.5, "face", 90, 10), ("engine.24.22.40", 0, 3.0, "face", 90, 10),
                ("cargo", 7, 0, "face", 180, 5), ("airlock", 4, 5, "face", 0, 6), ("sky.32.48", 7, 1, "top", 0, 0)]))
    D.append(dict(id="corvette", name="WAYFARER  corvette", theme="federation", size="30 x 16 m", volumes=[
        dict(poly=[(0, 1), (20, 1), (24, 5), (24, 7), (20, 11), (0, 11)], z=full(), kind="hull", spine=True),
        dict(poly=[(4, 11), (12, 11), (9, 14), (4, 14)], z=(12, 30), kind="plate"),
        dict(poly=[(4, -2), (9, -2), (12, 1), (4, 1)], z=(12, 30), kind="plate")],
        mounts=[("engine.48.36.64", 0, 2, "face", 90, 9), ("engine.48.36.64", 0, 7, "face", 90, 9), ("engine.32.26.48", 0, 5, "face", 90, 14),
                ("cannon", 5, 14, "face", 0, 14), ("cannon", 7, -2, "face", 180, 14), ("thruster", 4, 12, "face", 90, 15),
                ("thruster", 4, -1, "face", 90, 15), ("cargo", 16, 1, "face", 180, 6), ("airlock", 14, 11, "face", 0, 8),
                ("turret", 6, 2, "top", 0, 0), ("turret", 13, 8, "top", 0, 0), ("sky.32.32", 20, 5, "top", 0, 0), ("dish", 2, 7, "top", 0, 0)]))
    D.append(dict(id="frigate", name="ORION CREST  frigate", theme="federation", size="42 x 16 m", volumes=[
        dict(poly=[(0, 0), (30, 0), (36, 3), (36, 7), (30, 10), (0, 10)], z=full(), kind="hull", spine=True),
        dict(poly=[(8, -3), (21, -3), (24, 0), (8, 0)], z=(9, 50), kind="hull", logo=False),
        dict(poly=[(8, 10), (24, 10), (21, 13), (8, 13)], z=(9, 50), kind="hull", logo=False),
        dict(poly=[(24, -2), (28, -2), (30, 0), (24, 0)], z=(14, 30), kind="plate"),
        dict(poly=[(24, 10), (30, 10), (28, 12), (24, 12)], z=(14, 30), kind="plate")],
        mounts=[("engine.40.36.64", 0, 0, "face", 90, 9), ("engine.40.36.64", 0, 2.5, "face", 90, 9),
                ("engine.40.36.64", 0, 5, "face", 90, 9), ("engine.40.36.64", 0, 7.5, "face", 90, 9),
                ("engine.32.30.48", 8, -2.5, "face", 90, 14), ("engine.32.30.48", 8, 10.5, "face", 90, 14),
                ("turret", 4, 1, "top", 0, 0), ("turret", 4, 7, "top", 0, 0), ("turret", 26, 1, "top", 0, 0), ("turret", 26, 7, "top", 0, 0),
                ("turret", 12, -2.5, "top", 0, 0), ("turret", 12, 10.5, "top", 0, 0), ("dish", 17, 10.5, "top", 0, 0),
                ("sky.48.32", 31, 4, "top", 0, 0), ("tractor", 34, 4, "top", 0, 0),
                ("cargo", 18, -3, "face", 180, 9), ("cargo", 12, 13, "face", 0, 9), ("airlock", 29, 0, "face", 180, 12)]))
    D.append(dict(id="marauder", name="RIFTJACK MARAUDER  raider", theme="riftjack", size="28 x 12 m", volumes=[
        dict(poly=[(0, 0), (18, 0), (22, 2), (22, 4), (18, 6), (0, 6)], z=full(), kind="hull", spine=True),
        dict(poly=[(4, 6), (15, 6), (12, 9), (4, 9)], z=(5, 50), kind="hull", logo=False),
        dict(poly=[(6, -2), (10, -2), (12, 0), (6, 0)], z=(12, 30), kind="plate"),
        dict(poly=[(22, 2), (24, 3), (22, 4)], z=(16, 28), kind="plate")],
        mounts=[("engine.48.36.64", 0, 0.5, "face", 90, 9), ("engine.32.30.48", 0, 3.75, "face", 90, 14),
                ("engine.24.22.40", 4, 6.5, "face", 90, 14), ("cannon", 7, -2, "face", 180, 14), ("cannon", 9, -2, "face", 180, 14),
                ("turret", 10, 6.75, "top", 0, 0), ("turret", 14, 2, "top", 0, 0), ("cargo", 8, 9, "face", 0, 6)]))
    pod = arc(6, 0, 3, -180, 180, 24)[:-1]
    D.append(dict(id="crescent", name="AURELIAN CRESCENT  explorer", theme="aurelian", size="20 x 18 m", volumes=[
        dict(poly=pod, z=(5, 46), kind="hull", spine=False, logo=False),
        dict(poly=[(1, -2), (4, -2), (4, 2), (1, 2)], z=(9, 40), kind="hull", logo=False),
        dict(poly=arc(6, 0, 8, 95, 175, 12) + arc(6, 0, 5.5, 175, 95, 10), z=(10, 32), kind="plate"),
        dict(poly=arc(6, 0, 8, -175, -95, 12) + arc(6, 0, 5.5, -95, -175, 10), z=(10, 32), kind="plate"),
        dict(poly=[(8.8, -1), (12, 0), (8.8, 1)], z=(20, 30), kind="plate")],
        mounts=[("engine.24.22.40", 1, -1.75, "face", 90, 12), ("engine.24.22.40", 1, 0.25, "face", 90, 12), ("sky.32.32", 5, -1, "top", 0, 0)]))
    hub = [(-2, -4), (2, -4), (4, -2), (4, 2), (2, 4), (-2, 4), (-4, 2), (-4, -2)]
    arms = [[(4, -1), (10, -1), (10, 1), (4, 1)], [(-10, -1), (-4, -1), (-4, 1), (-10, 1)],
            [(-1, 4), (1, 4), (1, 10), (-1, 10)], [(-1, -10), (1, -10), (1, -4), (-1, -4)]]
    D.append(dict(id="station", name="HUB STATION  module", theme="federation", size="20 x 20 m", volumes=[
        dict(poly=hub, z=full(), kind="hull", face_style="windows", logo=False)] + [dict(poly=a, z=(9, 46), kind="hull", logo=False) for a in arms],
        mounts=[("airlock", 10, 1, "face", -90, 8), ("airlock", -10, -1, "face", 90, 8), ("airlock", -1, 10, "face", 0, 8),
                ("airlock", 1, -10, "face", 180, 8), ("dish", -1, -1, "top", 0, 0), ("turret", 6, -1, "top", 0, 0), ("turret", -8, -1, "top", 0, 0)]))
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
            if ob.name.startswith("decal"):
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
        ("MOUNTS", [kit_piece(kit, "turret"), kit_piece(kit, "cannon"), kit_piece(kit, "engine.48.36.64"), kit_piece(kit, "engine.32.26.48"),
                    kit_piece(kit, "engine.20.18.32"), kit_piece(kit, "thruster"), kit_piece(kit, "tractor"), kit_piece(kit, "dish"),
                    kit_piece(kit, "cargo"), kit_piece(kit, "airlock")]),
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
            if pc.mount == "face" and not pc.id.startswith("mount.engine") and pc.id != "mount.cannon.side.1x1":
                ob = instance(pc, (x, y, 0.0), 0, mats, coll)
                ob.rotation_euler = (math.radians(90), 0, 0)
                ext, dep = w, h
            elif pc.id.startswith("mount.engine") or pc.id == "mount.cannon.side.1x1":
                instance(pc, (x, y - d, 0), 0, mats, coll)
                ext, dep = w, d
            else:
                instance(pc, (x, y - d, 0), 0, mats, coll)
                ext, dep = w, d
            text(pc.id.split(".", 1)[1], (x, y - dep - 0.55, 0.02), 0.3, lab, coll)
            x += max(ext, 1.2, 0.17 * len(pc.id)) + 1.0
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


def main():
    args = parse_args()
    shots = {s for s in args.shots.split(",") if s}
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    out = args.out.rstrip("/")
    detail = detail_height(f"{out}/{REVISION}_detail_height.png")
    kit = Kit()
    theme_mats = {tn: {s: slot_material(tn, s, th, detail) for s in SLOTS} for tn, th in THEMES.items()}
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
    pieces = [p for p in kit.p.values() if isinstance(p, Piece)]
    manifest = {"revision": REVISION, "texel_m": T, "slots": SLOTS, "themes": list(THEMES),
                "unique_meshes": len(MESHES), "placements": PLACEMENTS["count"], "designs": stats,
                "pieces": [{"id": p.id, "family": p.family, "mount": p.mount, "size_m": [v * T for v in p.size],
                            "slots": p.slots(), "boxes": len(p.boxes), "decal_sockets": [d[0] for d in p.decals],
                            "voxel_aligned": p.aligned()} for p in sorted(pieces, key=lambda q: (q.family, q.id))]}
    with open(f"{out}/kit_{REVISION}.json", "w") as fh:
        json.dump(manifest, fh, indent=1)
    gen = [m for k, m in MESHES.items() if k.startswith("gen.")]
    print(f"ship_kit_prototype {REVISION}: kit_pieces={len(pieces)} unique_meshes={len(MESHES)} (generated={len(gen)}) "
          f"placements={PLACEMENTS['count']} all_kit_voxel_aligned={all(p.aligned() for p in pieces)} designs={stats}", flush=True)
    if args.no_render:
        return
    cam = setup(sc, args.samples)
    labels = [c for c in sc.collection.children if c.name.startswith("L_")]
    everything = [ships, shapes, sheet] + labels

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
    look(cam, (46, 44, 1.2), (10, -14, 11), 32)
    shot("crescent_curves", [ships])
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
        ortho_top(cam, 318, bottom / 2 + 0.5, 60)
        shot("blueprint_components", [sheet], (2400, 1500))


main()
