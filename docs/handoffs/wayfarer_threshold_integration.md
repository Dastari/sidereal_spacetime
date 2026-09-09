# Wayfarer native threshold stepping

Status: pure native qualification and five tests passed; runtime wiring staged behind the coordinator's current publication freeze.
Updated: 2026-09-10.

## Measured interface

The exact installed frame GLB is `assets/runtime/assembly/hull/finish-r004/part-70c422bca2d395c35ecb/clean.glb`, SHA-256 `825a836cb96f74363c83c1d5be4efc1a11df0ef71bbdafff8b2abb222cebdad6`. Source placement is `pilot-r004-airlock-frame-22`, at `(1,9,0.1875)`, rotated π. The authored source and visual mesh are unchanged.

The main threshold rises 31.25 mm, to Z=0.21875 m. Five small amber marker meshes rise approximately 50 mm, to Z=0.2375 m. The actual header underside is Z=2.3125 m. The qualifier retains the two full-height jamb groups and their seals/control protrusions, separates the header, and extracts 468 upward-facing native triangles for the threshold/marker upper surfaces.

The bounded policy applies only to the existing review capsule: radius 0.3 m, height at most 1.8 m, maximum low-step rise/drop 0.0625 m. It permits the normal low-obstacle stepping contact within that height; accepted foot-reference elevation follows the actual native top triangles at accepted XY. It is not a general climbing, jump, stair, foot-IK or structural-load solver. Taller bodies keep the previous conservative closed-frame collider until separately qualified.

## New pure files

- `scripts/qualify_wayfarer_threshold.py`: reads exact native accessors/indices and checks the committed proof; `--write` explicitly reproduces it.
- `packages/content/src/wayfarer-threshold-proof.json`: immutable source pin, two jamb covers, support triangles, measured header and actor envelope.
- `packages/sim/src/wayfarer-threshold.ts`: exact-snapshot binding selection, native triangle contact elevation, and bounded movement support checks including intermediate samples. A sprint command cannot skip a raised contact merely because both endpoint heights equal the floor.
- `packages/sim/src/wayfarer-threshold.test.ts`: measured threshold/marker elevations; reversal, idle/marker support and reconnect reconstruction; central passage while jambs/partitions/seat remain blocked; valid `(0,9.35)` seat approach; higher-body rejection; nonfinite/oversized movement; altered/missing proof rejection.

The unchanged seat center `(0,10.25)` is occupied equipment and remains a walking obstacle. This qualifies its approach only; it does not create a station or pilot control grant.

## Narrow runtime wiring after the pinned release

1. Construction specialist: import `qualifiedWayfarerThresholdBinding` into the trusted `wayfarer-walking-bindings.ts` provider. After exact canonical SHA verification, replace only the frame binding for body height ≤1.8 m. All other 210 bindings remain unchanged. The reconstructed instance collision path uses the same choice, retaining the saved UUID-map and document-drift validation. Existing 98-obstacle expectations become 99 because one whole-frame cover becomes two jamb covers.
2. Construction specialist: in `construction-instances.ts::stepActor`, keep the current full XY collision sweep and permission/reservation gates. For a qualified Wayfarer instance, validate the resulting bounded motion with `qualifyWayfarerThresholdMotion` before writing accepted XY. Do not modify stairs, ladders, review entry/exit, grant checks, input leases or idle-write guards.
3. Construction specialist, coordinated generated-binding slot: add `standingElevationM: t.f64()` to the **keyed own-location projection only**, without a new table or stored row field. Derive the value from the actor's accepted XY and the immutable qualified instance; generic decks use their actual deck datum plus native floor top. The private instance/actual deck must match the actor/visit. No input-supplied Z or mesh value is accepted. Existing active stair/traversal projections continue to own their more specific accepted XYZ.
4. Coordinator: carry `ownConstructionLocation.standingElevationM` into an optional `SceneState.constructionSupportElevation` field. In renderer update use it for a standing construction actor when there is no active stair/traversal accepted pose; otherwise retain the active solver's elevation. This is a presentation mapping of server-accepted support, not a client movement write. Leaving review restores the normal ship elevation.
5. Reconnect/grant-loss: XY and visit already persist. Support reconstruction at the same XY must give the same elevation without reseeding, a clock or extra idle row writes. Grant loss still freezes ordinary review movement and permits only the existing safe review exit; adding height never restores workspace reads/interactions. No new egress geometry is needed for this shallow static support.
6. Isolated proof: update only the named Wayfarer database; repeat two-instance normal input travel through the sill to `(0,9.35)`, stop on threshold and marker, reverse, reconnect while supported, then return to the original ship. Verify unchanged UUIDs/inventory. Reject jamb crossing, higher bodies and wrong source pins. Coordinate generated binding regeneration; run check/build/art and corrected standard named smoke before any normal release.

No frame art change or new art sign-off is needed for this measured source-preserving adapter. Final visual pose/foot contact review still belongs to the actual browser test rather than the numerical clearance assertion alone.
