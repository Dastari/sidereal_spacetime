# Reusable backed armor kit r005

Current candidate: **family-03 / library-02 / browser final-02**, passed independent Astra review with16 native and21 browser images. Exact owner sign-off and live installation remain pending.

The new kit uses actual closed 0.75 m backing solids between the unchanged structure datum and the 0.25 m decorative frame/face. This new family reserves 1 m outward. Inward structural walls remain 250 mm. Native heights are 0.75, 1.5, 2.25 and 3 m. Source Blender geometry, maps and contacts remain distinct from gameplay collision, pressure and damage.

## How a player would build with this kit

1. Select an exposed structural boundary or connected set of runs.
2. Choose the armor family, quarter-height course and face style.
3. The boundary planner computes exact directed lengths, reserves the junction intervals and selects matching native spans and corner blocks. The preview shows the entire result, including any unsupported or too-short join.
4. Confirm placement as one construction intent; the eventual authority adapter must validate each native interface and reservation. Decorative face changes preserve the underlying backing and placement identity. Equipment attaches to a declared exterior mounting face.

The native planner implements the geometric selection and assembly recipe for the finite review family. The simplified player interaction, atomic authority operation, qualified equipment adapters and live installation are future integration work. No manually resized mesh or arbitrary-angle placement is used to make this demonstration fit.

## Construction rules

All assemblies use rigid rotation and translation with unit scale. Directions come from floor endpoints on the 1/32 m lattice; diagonal lengths retain their exact derived distance. Junctions own material between named contact planes, and adjacent spans terminate at those planes. The native validator rejects intersecting ownership envelopes, unsupported turns and short reentrant runs. Direction coverage is separate from corner-pair coverage.

Straight bays, convex/concave joins and height terminations share geometry-parameter IDs, never Wayfarer placement IDs. Wayfarer and alternate station/tug footprints exercise the same recipes. The 250 mm-backed bulkhead examples are a separate visual family, not a replacement qualified pressure wall.

Large shoulders, connectors, deep vent louvers and closed backing are geometry. Seams, fasteners, service markings and shallow surface relief use portable color, normal and roughness maps. BACKING and FINISH mesh groups make the solid intermediate volume independently inspectable.

## Preserved attempts

- proof-01: native geometry exported; this Blender build lacked OpenImageDenoise, so capture failed.
- proof-02: exported geometry retained; native review assembly rotation was wrong because imported quaternion mode ignored Euler assignment.
- proof-03: corrected native capture rotations and visible lens pockets; first proof passed independent review for propagation.
- family-01: quarter-height shoulder profile produced a duplicate vertex and zero-area triangle; rejected and retained.
- family-02 / browser final-01: full geometry and bulk pass; identity artwork clipped at bay edge. Private review also incorrectly restored initially hidden source prototypes. Both issues corrected for the next exact capture.

See [specification](../../../../docs/handoffs/armor_block_kit_spec_20260914.md) and [independent first proof review](../armor-block-review-20260914/first-proof-review.md). Earlier r004 source, failures and evidence remain preserved.

## Review and reproduction

- [Whole Wayfarer](browser/final-02/wayfarer-concept-whole.png)
- [Exposed backing](browser/final-02/wayfarer-concept-backing.png) and [exploded layers](browser/final-02/wayfarer-exploded-exploded.png)
- [Height courses](browser/final-02/heights-front-whole.png), [alternate station](browser/final-02/alternate-station-alternate-whole.png) and [tug](browser/final-02/alternate-tug-fixture-whole.png)
- [Independent final review](../armor-block-review-20260914/final-review.md)
- [Exact check-in and remaining gates](../../../../docs/handoffs/wayfarer_armor_block_kit_checkin_20260914.md)

Run `python3 scripts/art_library/armor_block_kit.py --out NEW_DIRECTORY --full` through its dev.toml-managed Blender wrapper. The output must be fresh. Run `armor_block_kit_check.py NEW_DIRECTORY`, `armor_block_kit_contacts.py NEW_DIRECTORY`, then `pack_armor_block_review.py NEW_DIRECTORY NEW_LIBRARY_DIRECTORY`. The GLBs in models.tar.xz extract beneath the native directory with their original paths. Validation receipts are immutable; rerun against a fresh extracted copy. Blender source preserves editable meshes/materials/sockets; the packed GLB preserves every exported geometry/material byte while sharing repeated textures.

The browser helper requires an explicitly selected compatible game source candidate and the preserved qualified document. Build with `node scripts/art_library/build_armor_block_review.mjs --source GAME_CANDIDATE --review PRIVATE_REVIEW_DIRECTORY`; the capture scripts record private asset routing and camera choices. This review route is not a production Shipyard feature.
