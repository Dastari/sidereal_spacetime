# Wayfarer native threshold stepping

Status: registered native collision/movement/support projection; two existing-instance real-provider journeys passed on the isolated Wayfarer database. Coordinator client/browser review is next; this threshold revision has not been published to the normal world.
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

## Runtime wiring and client contract

1. Applied: import `qualifiedWayfarerThresholdBinding` into the trusted `wayfarer-walking-bindings.ts` provider. After exact canonical SHA verification, replace only the frame binding for body height ≤1.8 m. All other 210 bindings remain unchanged. The reconstructed instance collision path uses the same choice, retaining the saved UUID-map and document-drift validation. Existing 98-obstacle expectations become 99 because one whole-frame cover becomes two jamb covers.
2. Applied: in `construction-instances.ts::stepActor`, keep the current full XY collision sweep and permission/reservation gates. For a qualified Wayfarer instance, validate the resulting bounded motion with `qualifyWayfarerThresholdMotion` before writing accepted XY. Do not modify stairs, ladders, review entry/exit, grant checks, input leases or idle-write guards.
3. Applied and bindings regenerated: add `standingElevationM: t.f64()` to the **keyed own-location projection only**, without a new table or stored row field. Derive the value from the actor's accepted XY and the immutable qualified instance; generic decks use their actual deck datum plus native floor top. The private instance/actual deck must match the actor/visit. No input-supplied Z or mesh value is accepted. Existing active stair/traversal projections continue to own their more specific accepted XYZ.
4. Coordinator: carry `ownConstructionLocation.standingElevationM` into an optional `SceneState.constructionSupportElevation` field. In renderer update use it for a standing construction actor when there is no active stair/traversal accepted pose; otherwise retain the active solver's elevation. This is a presentation mapping of server-accepted support, not a client movement write. Leaving review restores the normal ship elevation.
5. Reconnect/grant-loss: XY and visit already persist. Support reconstruction at the same XY must give the same elevation without reseeding, a clock or extra idle row writes. Grant loss still freezes ordinary review movement and permits only the existing safe review exit; adding height never restores workspace reads/interactions. No new egress geometry is needed for this shallow static support.
6. Isolated proof: update only the named Wayfarer database; repeat two-instance normal input travel through the sill to `(0,9.35)`, stop on threshold and marker, reverse, reconnect while supported, then return to the original ship. Verify unchanged UUIDs/inventory. Reject jamb crossing, higher bodies and wrong source pins. Coordinate generated binding regeneration; run check/build/art and corrected standard named smoke before any normal release.

No frame art change or new art sign-off is needed for this measured source-preserving adapter. Final visual pose/foot contact review still belongs to the actual browser test rather than the numerical clearance assertion alone.


## 2026-09-10 authority integration evidence

`construction-standing-support.ts` supplies a bounded immutable-proof cache and checks accepted actor → visit → instance → deck identity. Exact document or UUID-map changes invalidate the cache and re-run native qualification. Only the scalar `standingElevationM` leaves the private adapter. Generic deck rows already use meters; their support is `deck.elevation + 6/32`. Exact Wayfarer support is the native value above, not an extra offset added to that value. The existing active stair/traversal projection remains the more specific XYZ authority.

The four support tests cover stopped/reconnected reconstruction, no saved-state mutation, altered documents and missing maps after a warm cache, cross-actor/instance/deck mismatch and generic deck units. The registered world test drives normal intent through the sill and marker, verifies zero character/location writes over twenty idle calls, blocks ordinary movement after grant loss, confirms full private instance/deck views disappear, and preserves the original actor/ship/XY through safe review exit. Together with threshold and walking-provider tests, 21 focused tests pass. The combined check/build checkpoint passed 977 tests in 163 files (that aggregate ran before the last registered journey assertion was added); generated own-location/types include the additive scalar.

Real provider PKCE journeys passed against **both existing instances**, without reseeding, in `sidereal-spacetime-dev-wayfarer-semantic-20260910-smoke`:

- `421ace6c-20a6-48f4-b68a-7382d20c2219`
- `d2d1d0ca-f8e9-4335-8c53-8260778795e1`

Both walked normally to the threshold and marker, stopped stably, disconnected/reconnected to identical visit/XY/support, reversed to the floor and crossed again to the cockpit seat approach at Y≈9.349. The seat still blocks at Y≈9.455; this does not confer piloting. Both returned actor `babceca2-d1d9-455e-8902-94248434a6db` to original ship `b57b30c3-6fc7-485d-9c2e-1006b27b4e67` at `(0,10.25)` with unchanged inventory. Evidence: `.runtime/wayfarer-authority-review/threshold-journey.json` and `threshold-run.log`. Temporary provider administrator role was revoked, a fresh token failed the administrator grant reducer, the helper's own provider session was logged out (204), and temporary token files were deleted; `threshold-cleanup.json` records cleanup.

The reused-database generic smoke reached its asteroid-collision scenario but timed out because additional lab actors start at different shared berths (ship X100 versus fixture rock X0). This is a generic test fixture assumption, not a threshold assertion; the release coordinator is running a new named baseline while preserving this existing review database. Do not report that generic run as passing.
