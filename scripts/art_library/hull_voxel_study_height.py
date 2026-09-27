"""Exact dimensional metadata for the private hull material/damage study.

This is an authoring helper, not a runtime hull qualification or authority schema.
The 1/16 m study tier accepts only exact multiples of that cell. A construction
height on the finer 1/32 m lattice must explicitly select the 1/32 m tier; it is
never rounded to fit. Both tiers retain the same physical cap/course dimensions.
"""

from fractions import Fraction
import json


PRIMARY_HEIGHTS = (0.75, 1.5, 2.25, 3.0)
INTERMEDIATE_HEIGHT = 1.8125
CONSTRUCTION_STEP = Fraction(1, 32)
STUDY_CELL = Fraction(1, 16)
PANEL_WIDTH = Fraction(2)
PANEL_DEPTH = Fraction(1, 4)
CAP_HEIGHT = Fraction(1, 8)
COURSE_HEIGHT = Fraction(1, 4)


def _fraction(value):
    try:
        return Fraction(str(value))
    except (ValueError, ZeroDivisionError) as exc:
        raise ValueError("Dimensions must be finite exact numbers.") from exc


def _cell_count(value, cell, name):
    count = value / cell
    if count.denominator != 1:
        raise ValueError(
            f"{name} {float(value)} m is not on the selected {float(cell)} m "
            "visual/damage grid; select the finer 1/32 m tier explicitly."
        )
    return int(count)


def panel_layout(height_m, cell_m=STUDY_CELL):
    """Return JSON-safe layout in local meters, X outward, Y across, Z up.

    Render each course at its given bounds; never scale an existing course mesh.
    Full courses repeat at 0.25 m, and any fill is a newly built plain strip.
    Map surface texture using local meter coordinates (1 UV unit per meter),
    including the fill, so details do not stretch as panel height changes.
    """
    height, cell = _fraction(height_m), _fraction(cell_m)
    if cell not in (STUDY_CELL, CONSTRUCTION_STEP):
        raise ValueError("The study supports explicit 1/16 m or 1/32 m cell tiers.")
    if height < 2 * CAP_HEIGHT:
        raise ValueError("Panel height must contain both fixed 0.125 m caps.")
    height_cells = _cell_count(height, cell, "Height")
    depth_cells = _cell_count(PANEL_DEPTH, cell, "Depth")
    width_cells = _cell_count(PANEL_WIDTH, cell, "Width")
    courses = []

    def course(kind, low, high):
        courses.append({
            "kind": kind,
            "z_min_m": float(low),
            "z_max_m": float(high),
            "height_m": float(high - low),
            "cell_start": _cell_count(low, cell, "Course base"),
            "cell_end": _cell_count(high, cell, "Course top"),
            "bounds_m": [[0.0, -1.0, float(low)],
                         [float(PANEL_DEPTH), 1.0, float(high)]],
            "texture_origin_m": [0.0, 0.0, 0.0],
            "texture_units_per_m": 1.0,
            "mesh_scale": [1.0, 1.0, 1.0],
        })

    course("bottom_cap", Fraction(0), CAP_HEIGHT)
    cursor = CAP_HEIGHT
    body_top = height - CAP_HEIGHT
    while cursor + COURSE_HEIGHT <= body_top:
        course("repeat", cursor, cursor + COURSE_HEIGHT)
        cursor += COURSE_HEIGHT
    if cursor < body_top:
        course("fill", cursor, body_top)
    course("top_cap", body_top, height)

    def frame(position, normal, tangent):
        return {"position_m": position, "normal": normal, "tangent": tangent}

    return {
        "purpose": "private_visual_study",
        "height_m": float(height),
        "width_m": float(PANEL_WIDTH),
        "depth_m": float(PANEL_DEPTH),
        "cell_m": float(cell),
        "cell_counts_xyz": [depth_cells, width_cells, height_cells],
        "cell_origin_m": [0.0, -1.0, 0.0],
        "bounds_m": [[0.0, -1.0, 0.0], [0.25, 1.0, float(height)]],
        "courses": courses,
        "course_boundaries_m": [courses[0]["z_min_m"]]
            + [entry["z_max_m"] for entry in courses],
        "fixed_cap_height_m": float(CAP_HEIGHT),
        "repeat_course_height_m": float(COURSE_HEIGHT),
        "texture_units_per_m": 1.0,
        "frames": {
            "attachment": frame([0.0, 0.0, 0.0], [1, 0, 0], [0, 0, 1]),
            "bottom": frame([0.0, 0.0, 0.0], [0, 0, -1], [0, 1, 0]),
            "top": frame([0.0, 0.0, float(height)], [0, 0, 1], [0, 1, 0]),
            "left_base": frame([0.0, -1.0, 0.0], [0, -1, 0], [0, 0, 1]),
            "right_base": frame([0.0, 1.0, 0.0], [0, 1, 0], [0, 0, 1]),
        },
        "height_transition_note": (
            "Different-height neighbors share the base and common side span; "
            "the remaining upper side is exposed and needs its own finished cap."
        ),
    }


def height_study_layouts(include_intermediate=True):
    """The four locked primary heights, followed by an optional 29-cell sample."""
    heights = PRIMARY_HEIGHTS + ((INTERMEDIATE_HEIGHT,) if include_intermediate else ())
    return [panel_layout(height) for height in heights]


if __name__ == "__main__":
    print(json.dumps(height_study_layouts(), indent=2))
