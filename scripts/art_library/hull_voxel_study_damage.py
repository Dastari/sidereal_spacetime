"""Deterministic material-cell damage for the offline hull visual study.

Coordinates are integer cell minima; Blender axes are X outward, Y span, Z up.
No production asset, collision or authority contract imports this study module.
"""

from dataclasses import dataclass
from math import isclose
from typing import Mapping

CELL_SIZE = 0.0625
Cell = tuple[int, int, int]
Occupancy = dict[Cell, int]


@dataclass(frozen=True)
class DamageResult:
    retained: Occupancy
    removed: Occupancy


@dataclass(frozen=True)
class MeshData:
    vertices: list[tuple[float, float, float]]
    faces: list[tuple[int, int, int, int]]
    material_indices: list[int]
    uvs: list[tuple[tuple[float, float], ...]]
    freshly_exposed: list[bool]


def _validate(occupancy: Mapping[Cell, int]) -> None:
    if len(occupancy) > 250_000:
        raise ValueError("Study occupancy exceeds 250,000 cells")
    for cell, material in occupancy.items():
        if len(cell) != 3 or any(type(v) is not int for v in cell):
            raise ValueError("Cell coordinates must be three integers")
        if type(material) is not int or material < 0:
            raise ValueError("Material index must be a nonnegative integer")


def core_cells(height: float = 3.0, material: int = 0) -> Occupancy:
    """A 2 m wide, 250 mm thick core with exact, unstretched cell courses."""
    courses = round(height / CELL_SIZE)
    if courses < 1 or not isclose(courses * CELL_SIZE, height, abs_tol=1e-9):
        raise ValueError("Height must be a positive multiple of the cell size")
    result = {
        (x, y, z): material
        for x in range(4)
        for y in range(-16, 16)
        for z in range(courses)
    }
    _validate(result)
    return result


def damage_cells(
    occupancy: Mapping[Cell, int],
    state: str = "intact",
    center_yz: tuple[int, int] | None = None,
) -> DamageResult:
    """Subtract a connected stepped mask through every occupied X course.

    The explosive mask contains the small breach mask. Shapes are deliberately
    made from integer cell rows, not a smooth Boolean or a shader alpha cutout.
    Pass the same center_yz to compare differently detailed versions of a panel.
    """
    _validate(occupancy)
    if state not in ("intact", "breach", "explosive"):
        raise ValueError("Unknown damage state")
    if not occupancy or state == "intact":
        return DamageResult(dict(occupancy), {})
    if center_yz is None:
        center_yz = (
            (min(c[1] for c in occupancy) + max(c[1] for c in occupancy) + 1) // 2,
            (min(c[2] for c in occupancy) + max(c[2] for c in occupancy) + 1) // 2,
        )
    if len(center_yz) != 2 or any(type(v) is not int for v in center_yz):
        raise ValueError("Damage center must be two integer cell coordinates")
    # Each row intersects its neighbors; asymmetric explosive steps suggest
    # spall without introducing isolated diagonally touching solid fragments.
    widths = (
        [1, 2, 3, 3, 3, 2, 1]
        if state == "breach"
        else [1, 3, 4, 6, 6, 7, 8, 8, 9, 8, 8, 7, 7, 5, 4, 3, 1]
    )
    radius_z = len(widths) // 2
    retained, removed = {}, {}
    for cell, material in occupancy.items():
        row = cell[2] - center_yz[1] + radius_z
        hit = 0 <= row < len(widths) and abs(cell[1] - center_yz[0]) <= widths[row]
        (removed if hit else retained)[cell] = material
    return DamageResult(retained, removed)


# Counterclockwise faces viewed from outside. Adjacent solid cells emit no face.
_SIDES = (
    ((1, 0, 0), ((1, 0, 0), (1, 1, 0), (1, 1, 1), (1, 0, 1))),
    ((-1, 0, 0), ((0, 0, 0), (0, 0, 1), (0, 1, 1), (0, 1, 0))),
    ((0, 1, 0), ((0, 1, 0), (0, 1, 1), (1, 1, 1), (1, 1, 0))),
    ((0, -1, 0), ((0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1))),
    ((0, 0, 1), ((0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1))),
    ((0, 0, -1), ((0, 0, 0), (0, 1, 0), (1, 1, 0), (1, 0, 0))),
)


def mesh_cells(
    occupancy: Mapping[Cell, int],
    original: Mapping[Cell, int] | None = None,
    core_material: int = 0,
    max_faces: int = 20_000,
) -> MeshData:
    """Build welded boundary quads, including real faces through breach depth.

    Original exterior faces retain their cell's finish index. Faces newly exposed
    by removing an original neighbor use core_material. Per-loop UVs are world
    projected in meters so a taller panel never stretches its surface texture.
    Welded vertices do not imply smooth normals: use flat faces in Blender.
    """
    _validate(occupancy)
    if type(core_material) is not int or core_material < 0:
        raise ValueError("Core material must be a nonnegative integer")
    if original is None:
        original = occupancy
    else:
        _validate(original)
        if any(original.get(cell) != material for cell, material in occupancy.items()):
            raise ValueError("Retained cells must preserve original material")
    vertices, faces, materials, uvs, fresh = [], [], [], [], []
    vertex_lookup = {}
    for cell, material in sorted(occupancy.items()):
        for direction, corners in _SIDES:
            neighbor = tuple(cell[i] + direction[i] for i in range(3))
            if neighbor in occupancy:
                continue
            if len(faces) >= max_faces:
                raise ValueError("Study boundary exceeds face budget")
            face, face_uv = [], []
            axes = (1, 2) if direction[0] else (0, 2) if direction[1] else (0, 1)
            for corner in corners:
                integer_vertex = tuple(cell[i] + corner[i] for i in range(3))
                if integer_vertex not in vertex_lookup:
                    vertex_lookup[integer_vertex] = len(vertices)
                    vertices.append(tuple(v * CELL_SIZE for v in integer_vertex))
                face.append(vertex_lookup[integer_vertex])
                face_uv.append(tuple(integer_vertex[a] * CELL_SIZE for a in axes))
            exposed = neighbor in original
            faces.append(tuple(face))
            materials.append(core_material if exposed else material)
            uvs.append(tuple(face_uv))
            fresh.append(exposed)
    return MeshData(vertices, faces, materials, uvs, fresh)
