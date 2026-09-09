# Wayfarer airlock inlet · r000/a003

This is an isolated Blender-authored candidate, not installed art or final owner approval.

- Bay: starboard world X=5, Y=-5..-3. Frame in metres: Blender XYZ, world origin [5,-5,0].
- Clear inlet: 1.25m wide, 2.25m above the0.1875m deck. The original inner airlock door remains at worldX=7.
- Roof underside: existing2.6875m → new3.0m. The312.5mm transition uses actual continuous native riser/laps; existing roof meshes are unchanged.
- Exact replacement IDs: wall-2--2, wall-3--2, superstructure-3--2. Their three original position/rotation/mirror transforms remain identical.
- New independent groups: stepped roof and flush threshold/seam strips. Existing new-airlock backwall sourcePartIndex26 is omitted; all other69 native parts retain their source hashes.
- Native materials are appended from the exact side-armor r003 editable source, including normal and packed material textures.
-50 editable visual components, five nativeGLBs,19 explicit contact cores. Separate contact proxies are not the exported visual representation or gameplay ratings.
- Existing262 source placements are preserved verbatim in replacement-mapping.json. A proposed visual substitution does not rewrite live item/container/crew state.
-21 new native checks pass. This proves local inlet support/contact and bounded closed chamber geometry, not a pressurized/sealed whole Wayfarer, free gas, powered pump or unrestricted vacuum travel.

## Evidence and reproduction

`python3 scripts/art_library/run_airlock_inlet.py --attempt N` creates a NEW attempt through the configured Blender binary. Never reuse a previous attempt.

`python3 scripts/art_library/run_airlock_inlet.py --attempt N --stage attachment` captures actual assembled native surfaces, with roof cutaway explicitly presentation-only.

`.runtime/construction-enclosure-python/bin/python scripts/qualify_wayfarer_airlock_inlet.py assets/art-library/designs/shipyard.structure.wayfarer-airlock-inlet/revisions/r000/a003` reproduces the qualified report.

The CSG audit reassembles GLB material primitives into actual source meshes; it does not synthesize missing triangles. Closed-volume checks use1µm source-coordinate rounding and the pre-existing10nm gasket-contact rounding. An exact native contact-core proof avoids an observed manifold3d3.2.1 crash when Boolean-testing decorative coplanar roof skins; native full visual geometry remains included in route and assembled-cavity checks.

Floor seam strips in a003 fix the failed actual supported-area test preserved undera002. Both native door leaves remain closed in attachment captures; no animation claim is made from these stills. Full combined hinge-envelope checks remain an integration gate.
