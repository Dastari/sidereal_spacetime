# Native roof closure kit r000/a001

Three new editable Blender modules preserve all original visible roof panels and transforms. They use existing side-hull materials and normal/packed textures. These are isolated candidates, not installed assets or final owner approval.

- Grid module2m. Rail localX0..2; common seamY0; localZ0 is nominal roof underside.
- Standard core width100mm; Z-15.625..31.25mm. Junction core160mm square at the same datum.
- Step rail spans the measured62.5mm main/cockpit underside difference; Z-78.125..31.25mm relative to the higher2.6875m roof datum.
- Contact cores remain continuous. Decorative beveled underside skins/fasteners do not define or expand the pressure interface. Three hidden wire proxies are separate from exported visuals.
- ThreeGLBs,16editable visual components,3explicit contact cores. Four existing native roofs appear unchanged in same-camera original/plug images.
-14native gates pass: exported closed solids, exact proxy/core equivalence, positive overlap with all4panels, original connected leak negative control, new closed local path, positive-area sections, actual roof datum step and body headroom.

## Qualification boundary

The local four-panel coupon does not certify the whole ship. The native whole-assembly audit now also uses the previously qualified authored airlock constituents (verified against exact GLB triangle signatures), preserving its closed chamber. Main interior closure remains under investigation. It has no allocated gas, inferred armor rating, power or pressure-ready flag.

All original262source placements/cockpit/floors/equipment remain intact. Only new candidate joint placements are proposed; native pressure/damage/collision authority and final artistic approval remain separate.

## Reproduce

`python3 scripts/art_library/run_roof_closure.py --attempt N` creates a new preserved attempt with configured Blender, native GLBs and actual CPU renders.

`.runtime/construction-enclosure-python/bin/python scripts/qualify_roof_closure.py` runs the exact pinned native interface checks. The declared geometry environment is required; no skipped checks or synthetic missing-face repair.
