"""Pure, offline modular panel and depth damage contract.

Blender local axes: +X outside, +Y span, +Z up. Cells use Y indices
0..width_cells-1 and an explicit local mesh offset -width/2. This preserves
exact centred sockets even for odd-cell spans, without rounding dimensions.
This is not a pressure solver or an authoritative gameplay damage API.
"""
from dataclasses import dataclass
from math import hypot, isfinite
from typing import Mapping

CELL = 0.03125
CAP_HEIGHT = 0.0625
COURSE_HEIGHT = 0.25
Cell = tuple[int, int, int]
Occupancy = dict[Cell, int]


def _cells(value: float, label: str, minimum: int = 1) -> int:
    if isinstance(value, bool) or not isinstance(value, (float, int)):
        raise ValueError(f"{label} must be a finite lattice dimension")
    if not isfinite(value) or value / CELL != int(value / CELL):
        raise ValueError(f"{label} must be an exact multiple of {CELL} m")
    count = int(value / CELL)
    if count < minimum or count > 1024:
        raise ValueError(f"{label} is outside the study dimension bounds")
    return count


def panel_layout(width: float, height: float, interior: bool = False) -> dict:
    """Describe exact modular geometry; residuals are filler, never scale."""
    if type(interior) is not bool:
        raise ValueError("interior must be boolean")
    w, h = _cells(width, "width"), _cells(height, "height", 4)
    if w * h * 8 > 250_000:
        raise ValueError("Panel exceeds the study cell budget")
    middle = h - 4
    courses, remainder = divmod(middle, 8)
    x0 = -0.125 if interior else 0.0
    layers = (
        [
            {"role": "back_skin", "x_min": -0.125, "x_max": -0.09375},
            {"role": "rib_cavity", "x_min": -0.09375, "x_max": 0.09375},
            {"role": "front_skin", "x_min": 0.09375, "x_max": 0.125},
        ]
        if interior else [
            {"role": "inner_pressure_skin", "x_min": 0.0, "x_max": CELL},
            {"role": "rib_cavity", "x_min": CELL, "x_max": 0.125},
            {"role": "outer_armor", "x_min": 0.125, "x_max": 0.25},
        ]
    )
    return {
        "cell_size_m": CELL,
        "width_m": width,
        "height_m": height,
        "width_cells": w,
        "height_cells": h,
        "interior": interior,
        "bounds": {"min": [x0, -width / 2, 0.0], "max": [x0 + 0.25, width / 2, height]},
        "cell_mesh_offset": [0.0, -width / 2, 0.0],
        "lattice_origin_m": [0.0, -width / 2, 0.0],
        "sockets": {
            "HULL_ATTACH": [0.0, 0.0, 0.0],
            "HULL_EDGE_START": [0.0, -width / 2, 0.0],
            "HULL_EDGE_END": [0.0, width / 2, 0.0],
            "HULL_TOP": [0.0, 0.0, height],
        },
        "caps": [{"z_min": 0.0, "z_max": CAP_HEIGHT}, {"z_min": height - CAP_HEIGHT, "z_max": height}],
        "middle_courses": [
            {"z_min": CAP_HEIGHT + n * COURSE_HEIGHT, "z_max": CAP_HEIGHT + (n + 1) * COURSE_HEIGHT}
            for n in range(courses)
        ],
        "filler": {
            "z_min": CAP_HEIGHT + courses * COURSE_HEIGHT,
            "z_max": height - CAP_HEIGHT,
            "height_m": remainder * CELL,
            "cells": remainder,
        },
        "layers": layers,
        "pressure_note": "Panel seal evidence only; room connectivity requires the room boundary graph.",
        "dimension_status": "Offline proposed panel profile; not a production hull thickness approval.",
    }


@dataclass(frozen=True)
class LayeredDamageResult:
    retained: Occupancy
    removed: Occupancy
    metadata: dict


def _validate_occupancy(occupancy: Mapping[Cell, int], layout: dict) -> None:
    if not isinstance(occupancy, Mapping) or len(occupancy) > 250_000:
        raise ValueError("Invalid occupancy or study cell budget exceeded")
    x_start = -4 if layout["interior"] else 0
    for cell, material in occupancy.items():
        if not isinstance(cell, tuple) or len(cell) != 3 or any(type(v) is not int for v in cell):
            raise ValueError("Cell coordinates must be three integers")
        if not (x_start <= cell[0] < x_start + 8 and 0 <= cell[1] < layout["width_cells"] and 0 <= cell[2] < layout["height_cells"]):
            raise ValueError("Cell lies outside the panel contract")
        if type(material) is not int or material < 0:
            raise ValueError("Material roles must be nonnegative integer indices")


def damage_cells(occupancy: Mapping[Cell, int], state: str, width: float, height: float, interior: bool = False) -> LayeredDamageResult:
    """Subtract a depth-limited stepped bowl from +X, preserving material IDs.

    Passing an earlier result's retained cells accumulates damage. Removed cells
    are only those removed in this call; existing holes are never filled. The
    crater is material loss, not plastic deformation. No energy model is implied.
    """
    layout = panel_layout(width, height, interior)
    _validate_occupancy(occupancy, layout)
    depth_cells = {"intact": 0, "crater": 2, "armor_open": 5, "through": 8}
    if not isinstance(state, str) or state not in depth_cells:
        raise ValueError("Unknown panel damage state")
    x_start = -4 if interior else 0
    radius = min(0.45, width * 0.35, height * 0.35)
    retained, removed = {}, {}
    for cell, material in occupancy.items():
        x, y, z = cell
        depth = x_start + 7 - x
        # A fixed bowl allows states to deepen monotonically without changing
        # or refilling the previous crater. The inner mouth is 35% of the outer.
        radius_at_depth = radius * (1.0 - 0.65 * depth / 7)
        distance = hypot((y + 0.5) * CELL - width / 2, (z + 0.5) * CELL - height / 2)
        # Keep at least the nearest centre cells addressable on tiny residual
        # spans; damage remains bounded by the actual occupied panel cells.
        hit = depth < depth_cells[state] and distance <= max(radius_at_depth, CELL * 0.75)
        (removed if hit else retained)[cell] = material
    seal_x = x_start
    missing_seal_cells = sum(
        (seal_x, y, z) not in retained
        for y in range(layout["width_cells"])
        for z in range(layout["height_cells"])
    )
    return LayeredDamageResult(retained, removed, {
        "state": state,
        "cell_size_m": CELL,
        "maximum_cut_depth_m": depth_cells[state] * CELL,
        "outer_radius_m": radius,
        "removed_cells": len(removed),
        "removed_volume_m3": len(removed) * CELL ** 3,
        "barrier_intact": missing_seal_cells == 0,
        "missing_inner_skin_cells": missing_seal_cells,
        "seal_plane_x_m": seal_x * CELL,
        "pressure_scope": "Inner skin occupancy only; not a room-pressure or connectivity result.",
        "deformation": False,
    })
