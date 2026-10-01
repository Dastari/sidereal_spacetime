"""Isolated R22 bridge-bank display correction; all R21 assets remain immutable.

The upper instrument is near its lip; the lower machine bays keep their depth.
Export only --objects to NEW equipment-r022 runtime/source directories.
"""
import hashlib
import importlib.util
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
BASE = HERE / "ship_reference_r021_equipment.py"
BASE_SHA = "8e007da11e4ed04263a304a23050997e9f27d8c0bee002439cd334e482b5f192"
if hashlib.sha256(BASE.read_bytes()).hexdigest() != BASE_SHA:
    raise RuntimeError("R22 requires the exact immutable R21 equipment helper")
spec = importlib.util.spec_from_file_location("reference_r022_equipment_base", BASE)
B = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = B
spec.loader.exec_module(B)
E, K, O = B.E, B.K, B.O
DESIGN_ID = "shipyard.equipment.bridge-bank"


def bridge_bank(w, d, h):
    h -= 1
    p = K.Piece("reference.r022.bridge-bank", "object", "interior", (w, d, h))
    b = p.b
    b(0, 0, 0, w, d, 1.2, "dark")  # exact original contact base
    # Unequal joined lower service cases, with open backed fronts and the same
    # centre clearance. Back plates sit 0.34 m behind their original front plane.
    for x, X in ((0, 7.5), (w-7, w)):
        b(x, 0, 1, X, d, 9.5, "primary.equipment-frame")
        b(x+1.3, .9, 2.3, X-1.3, 1.6, 8.2, "dark")
        b(x+1.6, 1.6, 3, X-1.6, 2.2, 5.8, "trim")
    b(7, 0, 2, w-6.5, 1.5, 9.5, "secondary")
    b(0, 0, 9, w, d, 10, "trim")
    b(1, 3.5, 10, w-1, d-.5, 10.55, "primary")
    # The deep LOWER machine bays remain intact. Instruments instead occupy
    # the upper enclosure lip: front Y=6.1 versus housing Y=6.6, a .03125m
    # setback. Lowering the aperture sill enlarges the useful display without
    # moving the exact original host envelope or floor contact.
    b(0, 0, 9.5, w, 1.3, h, "primary.equipment-cover")
    # Broader upper shoulders contain the clipped-corner opening at both
    # oblique azimuths; the first keyboard correction exposed a corner shadow.
    b(0, 1, 9.0, 24.0, 6.6, h-.4, "primary.equipment-frame")
    b(1.95, 5.4, 10.35, 22.05, 5.7, h-1.7, "dark")
    b(2.15, 5.9, 10.9, 21.85, 6.1, 14.5, "emit_a")
    # The narrower supply field shares the common rear enclosure; it retains
    # a genuinely backed mouth instead of acquiring another instrument face.
    b(24.5, 1, 10.4, w-.7, 6.6, h-.4, "trim.equipment-frame")
    b(25.8, 1.4, 11.7, w-2.0, 2.0, h-1.7, "dark")
    b(26.1, 2.0, 12.0, w-2.3, 3.1, h-2.0, "metal")
    # Low-profile keycaps terminate below screen Z=10.9; the first export
    # correctly failed when the old raised keyboard occluded the lower field.
    for x, X in ((2, 13.5), (18, 29.5)):
        b(x, 4.4, 10.25, X, 7.4, 10.75, "secondary")
        b(x+.7, 4.8, 10.5, X-.7, 6.8, 10.85, "metal")
        b(X-2.4, 6.8, 10.5, X-1.1, 7.2, 10.85, "accent")
    b(1.5, d-.5, 8.1, 5.5, d-.2, 8.55, "emit_b")
    return p


if __name__ == "__main__":
    args = E.args()
    if not args.objects:
        raise RuntimeError("This isolated exporter supports only --objects")
    O.OBJECT_SIZES = {DESIGN_ID: O.OBJECT_SIZES[DESIGN_ID]}
    O.builders = lambda _kit, _exporter: {DESIGN_ID: bridge_bank}
    E.OBJECTS_REVISION = "equipment-r022"
    E.boxes_mesh = B.equipment_mesh
    E.export_objects(args)
    manifest = Path(args.out) / "manifest.json"
    data = json.loads(manifest.read_text())
    data["generator"]["candidateBuilder"] = "scripts/art_library/ship_reference_r022_equipment.py"
    data["generator"]["candidateBuilderSha256"] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    data["generator"]["equipmentHelper"] = "scripts/art_library/ship_reference_r021_equipment.py"
    data["generator"]["equipmentHelperSha256"] = BASE_SHA
    data["generator"]["housingHelperSha256"] = hashlib.sha256(Path(B.A.__file__).read_bytes()).hexdigest()
    data["requiredObjectIds"] = [DESIGN_ID]
    data["status"] = "isolated opt-in near-lip display proposal; default art and navigation unchanged"
    manifest.write_text(json.dumps(data, indent=2) + "\n")
