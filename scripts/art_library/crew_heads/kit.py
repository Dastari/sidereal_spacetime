"""Part library: grids -> Blender meshes (library objects for export) and review instances."""
from __future__ import annotations

import math

import bmesh
import bpy
import numpy as np
from mathutils import Vector

import look
from vox import FACE_PLUS_Y, SLOTS, V, mesh_from_grid

BEVEL = {  # (width m, segments): soft rounded part edges, no per-voxel grooves (owner feedback 2026-09-25)
    "head": (0.016, 3), "face": (0.0011, 1), "facialhair": (0.004, 2), "detail": (0.0010, 1), "hair": (0.0055, 1),
    "acc": (0.005, 2), "helmet": (0.013, 3), "visor": (0.003, 2), "mask": (0.005, 2), "hair_lod": (0.0, 0)}


TONE = {  # COLOR_0 per-island tone range: hair clumps vary most, the face canvas stays neutral
    "head": (0.99, 1.0), "hair": (0.82, 1.0), "hair_lod": (0.93, 0.93), "facialhair": (0.86, 1.0), "acc": (0.93, 1.0), "helmet": (0.95, 1.0)}


class Library:
    def __init__(self):
        self.coll = bpy.data.collections.new("LIBRARY")
        bpy.context.scene.collection.children.link(self.coll)
        self.coll.hide_render = True
        self.objects = {}
        self.meta = {}
        self.mats = look.export_materials()

    def add(self, name, category, glb, grid, bevel_kind=None):
        if grid.empty():
            raise ValueError(f"part {name} is empty")
        me = mesh_from_grid(grid, bpy, bmesh, name, tone=TONE.get(category, (0.95, 1.0)))
        for s in SLOTS:
            me.materials.append(self.mats[s])
        ob = bpy.data.objects.new(name, me)
        self.coll.objects.link(ob)
        width, segs = BEVEL[bevel_kind or category]
        if width > 0:
            look.bevel(ob, width, segs)
        # bake the bevel once: instances share the evaluated mesh (memory/time), export needs no modifiers
        dg = bpy.context.evaluated_depsgraph_get()
        baked = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
        baked.name = name
        if "brick" in ob.modifiers:
            ob.modifiers.remove(ob.modifiers["brick"])
        old = ob.data
        ob.data = baked
        bpy.data.meshes.remove(old)
        lo, hi = grid.bounds_vox()
        if FACE_PLUS_Y:
            lo, hi = [-hi[0], -hi[1], lo[2]], [-lo[0], -lo[1], hi[2]]
        self.objects[name] = ob
        self.meta[name] = {"node": name, "category": category, "glb": glb, "slots": grid.slots_used(),
                           "boundsM": [[round(v * V, 5) for v in lo], [round(v * V, 5) for v in hi]]}
        return ob

    def stats(self):
        for name, ob in self.objects.items():
            ob.data.calc_loop_triangles()
            self.meta[name]["triangles"] = len(ob.data.loop_triangles)
        return self.meta

    # ------------------------------------------------------------------ review instances
    def inst(self, name, coll, loc, rot_z, palette, tilt=(0.0, 0.0)):
        src = self.objects[name]
        ob = bpy.data.objects.new(name + ".i", src.data)
        coll.objects.link(ob)
        ob.location = Vector(loc)
        ob.rotation_mode = "ZXY"
        ob.rotation_euler = (tilt[0], tilt[1], rot_z)
        look.apply_palette(ob, palette)
        return ob


_COLLAR = {}


def collar(coll, loc, rot_z, colour="#aab4f0", trim="#4a55b0"):
    """Render-only torso stub under a portrait head (not exported)."""
    from vox import Grid
    key = (colour, trim)
    if "mesh" not in _COLLAR:
        g = Grid("review.collar")
        g.box(-7.5, -4, -7, 7.5, 4.5, -2.25, "suit_primary")
        g.cut(-7.5, -4, -3.5, -6.25, 4.5, -2.25, sym=True)
        g.new().box(-3.5, -3.5, -2.5, 3.5, 3.5, -1.0, "suit_primary").cut(-2.25, -2.5, -2.5, 2.25, 2.5, -1.0)
        g.new().box(-1.0, -4.25, -7, 1.0, -4, -2.75, "suit_secondary")
        g.new().box(-6.25, -4.25, -6.5, -3.0, -4, -5.75, "suit_secondary", sym=True)
        me = mesh_from_grid(g, bpy, bmesh, "review.collar")
        for s in SLOTS:
            me.materials.append(look.slot_material(s))
        _COLLAR["mesh"] = me
    ob = bpy.data.objects.new("collar", _COLLAR["mesh"])
    coll.objects.link(ob)
    ob.location, ob.rotation_euler = Vector(loc), (0, 0, rot_z)
    look.apply_palette(ob, {"suit_primary": colour, "suit_secondary": trim})
    look.bevel(ob, 0.004)
    return ob


def project(sc, cam, point):
    from bpy_extras.object_utils import world_to_camera_view
    co = world_to_camera_view(sc, cam, Vector(point))
    return co.x * sc.render.resolution_x, (1 - co.y) * sc.render.resolution_y


def rad(d):
    return math.radians(d)


def np_bool(a):
    return bool(np.asarray(a).any())
