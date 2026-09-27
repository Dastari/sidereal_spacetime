# Active integration work — 2026-09-09

Integration owner: new `integration_continuation` agent. Root retains the plastic rendering assessment. Preserve all concurrent model sources and gameplay UUIDs.

## Completed in this continuation

- Generated current private identity-link bindings with the managed command.
- Coordinated IFCS's passing isolated authentication/persistence smoke and 292-test checkpoint; published the exact additive auth schema to the normal development database without reset. Existing sockets must reconnect.
- Created managed `auth-https-{setup,status,stop}` lifecycle commands. Installed independent tailnet HTTPS game8444 and dashboard8445 proxies, preserving the pre-existing443 service.
- Wired client Authorization Code/PKCE through `oidc-client-ts`, session-scoped OIDC storage, renewal/logout lifecycle, ID-token transport and explicit development identity fallback during migration. No OIDC token is written into the lab identity key.
- Added styled game login and an explicit two-session account-transfer panel. Target must accept; server preserves character/inventory/appearance UUIDs. Actual provider PKCE, two-session transfer,72-second continuity and logout/re-login passed.
- Created one dedicated provider review account; credentials remain private, never in documentation or source control.

## Required gates still open

1. Auth core gates passed, including genuine dashboard negative admission and real-token isolated transfer; foreign issuer has pure-policy coverage only. Occupied helm renewal and changed appearance/reload also passed.
2. Actual account-link/reconnect and controlled database process restart durable-state proof passed with IFCS; transient aged asteroid discovery is explicitly separate.
3. r002 functional gameplay matrix passed: physical muzzle, reversal, accepted recoil, swaps, corrected pistol, sprint/seating and hidden/disposal. Actual evidence and art limits are recorded in `combat_pose_integration.md`; this does not approve the art or real-time animation polish. A reproduced invalid transmission target is repaired without disabling the visor material.
4. Exact native Cinder r018 actual Observe/wheel/orbit/Return gate passed; planet browser closed. Planet/render iterations are paused.
5. Combined Escape/Graphics/compact-HUD browser review passed. Actual local-light choices All/8/4/Off produce27/8/4/0 active lights with shadow counts7/6/3/0 and no neutral-color postprocess. Equipment/lighting debug suppression and settled flight/deck restoration passed.
6. Latest combined `npm run check` passed85files/328tests, typecheck and71documents. Baseline build/art/hash recording passed before construction edits; a fresh aggregate gate is required for construction. No final art sign-off inferred.

## Important limits

- Login/migration now have actual end-to-end browser proof; production OIDC-only enforcement and visible shared-space multiplayer are not claimed.
- Multiple private concurrent fixtures do not establish visible shared-space multiplayer; no other-actor projection exists yet.
- Native floor, finish and planets remain working candidates where owner approval was not supplied.
- Pose art still has low stock/optic placement and acquisition/gait shortcomings.

## Next owner priority after auth/pose acceptance

First bounded authored-ship delivery slice: immutable validated blueprint publication and separate test-ship instantiation, using authored floor/partitions for planar collision and native placements for rendering. Preserve the current Wayfarer and inventories. Save draft, publish blueprint, spawn instance, refit live and capture live are distinct actions. One planar deck first; no inferred functional stats from appearance and no automatic authoring grant from ship ownership. Root is preparing the detailed acceptance brief; current Shipyard visual layout editing alone does not satisfy this gate.

## Owner supersession: construction acceptance expanded

After authentication and character model/rig integration, authored construction is the next highest priority; planet/render iteration is paused. The single planar test ship above is only an internal first slice, **not overall completion**. Overall scope now includes multiple floors; 2×2 m square/triangle/trapezoid floors and matching roofs; structure-derived sealed partitions and semantic room labels; operational pressure and airlocks including external airlocks; separate damageable external armor and faction shapes; external systems; interior decoration and cargo grids; bounded stacked-container support and room height/load checks; 3D power/fuel/data/coolant/ventilation routes including wall and vertical risers. Audit/convert required asset interfaces, recreate the current Wayfarer through semantic Shipyard authoring, then persist a spawnable template producing fresh item/container UUIDs per instance. The expanded scope and audit are in `docs/ship_construction_rebuild.md` and `docs/handoffs/ship_construction_asset_audit.json`; IFCS authority implementation plan is `docs/handoffs/ship_construction_authority_plan.md`. Do not claim a visual or single-deck preview completes this request.

## Construction work now active

The generic versioned tileset interface and fit validator are implemented in `packages/content/src/tileset-interfaces.ts` and `packages/sim/src/tileset-fit.ts`. Nine tests cover all twelve exact r002 floor polygons, complementary/subdivided joins, reflected transforms, invalid overlaps/profiles/datums and partial approved seals. The substitution fixture is mechanical test data, not a second approved Blender kit. Interfaces without physical definitions or native damage adapters remain unqualified for those capabilities. No new construction tables or gameplay spawn are published yet. NEW `construction_topology` owns isolated pure multi-deck compartment/pressure/airlock foundations; this integration owner retains catalogs, authority and editor wiring.

## Construction authority/Shipyard checkpoint

Private workspace grants, recoverable server drafts and immutable publication are staged. Server compiler validates exact native floor bindings and SHA256 canonical snapshots; no visual-only geometry can silently supply semantic floors. Full isolated smoke passed denial/privacy gates. Actual dedicated `sidereal-shipyard` PKCE, temporary provider-admin role → explicit scoped grant, UI workspace save/load and immutable publication passed on the isolated database. The provider review role was revoked immediately after grant setup; no permanent user role was assigned. Two-deck publication proof: `.runtime/authoring-two-deck-publish-ui.log`, blueprint `ddc2f22a-dbab-4317-90fb-f840748780c4`, SHA256 `06fa28d0268985d515ff820478426bb8c3de70af3655544cec13f5de0e1ea3db`. Browser routes override only the database name to the isolated suffix and add read-only handles. Normal database construction schema has not been published.

Real host testing found missing `structuredClone`; the server compiler now normalizes its owned JSON parse result and has a host compatibility regression. Explicit remote Load also needs the local recovery record’s expected revision, rather than pretending the existing record is new; this fix passed actual browser Load with no local recovery conflict. Evidence: `output/playwright/shipyard-two-deck-publication.png` and `.runtime/authoring-load-cas-proof.log`. Browser closed after review.

The construction agent delivered pure pressure, selected-deck swept collision, cargo support/load propagation and typed3D services foundations:56 focused tests. They remain unwired to live simulation. Next required integration: actual instance/deck/resource IDs, movement/render adapter, native boundary/roof interfaces, operational transitions/pressure/airlocks, cargo/services and localized structural damage, then full Wayfarer template and two independent playable spawns.

## Authored instance walking checkpoint

Implemented private `construction_instance`, `construction_deck` and `construction_location` rows. `spawnConstructionBlueprint` requires explicit workspace `draft.read` + `instance.spawn`, pins the immutable blueprint SHA and allocates fresh server UUIDs with source mappings. It never installs Wayfarer geometry, laboratory engine ratings or default equipment. Current floor-only walking reviews reject unbound object collision and inadequate standing height. Semantic floors drive swept-circle collision; a temporary explicit review transit stores the original ship/position and clears control/aim. Fresh visit IDs prevent stale return commands affecting later visits. Return remains available after grants expire. Unsupported construction-state identity migration now requires explicit review rather than orphaning rows.

Actual isolated browser evidence:
- Two independent instance IDs and eight disjoint floor placement IDs in `.runtime/construction-game-identity-proof.log` (created through actual Shipyard buttons).
- Actual native selected-deck renderer contains zero legacy Wayfarer meshes. WASD crosses the tile seam and stops at the perimeter: `.runtime/construction-walking-boundary-proof.log`, `output/playwright/construction-authored-floor-walking.png`.
- Page reload retained character position, visit ID, both instances, all seven items and appearance: `.runtime/construction-reconnect-proof.log`.
- Actual Return button restored original ship/local position; all item/container/appearance rows unchanged: `.runtime/construction-return-proof.log`.
- Temporary workspace grants expired and a subsequent entry was denied, preserving original location: `.runtime/construction-expired-entry-proof.log`. The second instance was persisted and inspected but was not entered before grant expiry; do not claim two independent complete gameplay sessions.

The named `authoring-proof` browser is closed; GPU released. Browser routes selected only the isolated database and added read-only diagnostic handles. Initial review-character creation/standing used ordinary authoritative reducers as test setup; spawn/enter/return used actual UI and movement used keyboard. Rendering was stepped under software GPU; no hardware FPS or real-time animation claim.

Latest aggregate checkpoint:94files/414tests, typecheck and71documents pass. Isolated smoke/build/art gates are continuing. Normal database construction schema remains uninstalled; temporary game review UI/subscriptions require `?constructionReview=1` until the coordinated release. Native boundaries are currently visibly marked guides, not a claimed complete ship. The NEW specialist is authoring a native Blender boundary/hinged-door companion kit using the audited interfaces; pressure, playable deck transitions, cargo, services, native localized damage, full Wayfarer and complete independent spawns remain required.

Final walking checkpoint:94files/415tests, typecheck/docs, full isolated smoke, build and art:check all passed. Additive normal schema published via `python3 scripts/dev.py publish` with delete-data=never; operator readback confirms zero normal construction instances/grants and retained21characters/21ships/117inventory items. Exact artifact hashes are in `docs/releases/construction-walking-2026-09-09.json`. Earlier notes saying normal schema uninstalled describe prior gates. Native boundary-kit work continues; full construction goal is not complete.

## Native boundary and door checkpoint — current

Exact native boundary r001 now renders validated module walls, node closures, door frames and physically hinged leaves. Optional pinned blueprint binding preserves historical floor-only documents. Private per-instance door rows drive server motion, reach/revision checks, swept obstruction and walking collision. Actual Shipyard save/publish/two spawns, game Enter/Open/Close, WASD blocked/open passage, obstruction/resume, reconnect and independent door state passed in a dedicated named review database. Final Return preserved all seven items, containers and appearance. Near perimeter walls cut away in interior view only; collision remains intact. Evidence and exact IDs/hashes are in `construction_boundary_integration.md`.

This extension passed450tests/100files, typecheck/73docs, full isolated smoke, aggregate build and art:check, and its additive schema is published normally without reset. No normal construction fixture/grant/door was seeded. Exact release hashes are in `docs/releases/construction-boundaries-2026-09-09.json`. Review browser is closed. Named `publish-review` is additive and project-scoped so disposable smoke fixtures cannot erase future browser reviews.

Next concrete work: integrate the delivered12-shape native roof r001; review the specialist's pure pressure-layout adapter; bind pressure coverage to actual certified surface/seal contracts, then operational airlocks and deck traversal. The current door has2mm gaps and no gasket, so it must not be marked pressure-sealed. Cargo/support,3D services, scoped damage, the complete semantic Wayfarer template and two complete independent gameplay instances remain required. No art approval or full construction completion is implied by the door gate.

## Matching roof checkpoint — completed history

Roof r001 is now integrated and its optional blueprint pin is published additively. Actual Shipyard Load/Save/Publish/Spawn created a third independent named-test instance; game Enter, interior/top-down roof visibility, reload and Return passed with all item/container/appearance/door rows unchanged. Native material/UV/tangent and all12 exact shape/rotation/upper-deck clearance checks pass. Construction cameras now frame the authored deck bounds; normal Wayfarer framing is retained. Combined474tests/103files, typecheck/73docs, isolated smoke, build, art:check,18 Python checks and zero-new-debt lint/format gates pass. See `construction_roof_integration.md`. Browser is closed.

Pressure-layout adapter is delivered and reviewed as a pure foundation;30 focused tests pass, no gas or live authority initialized. Boundary gasket r002 is delivered but uninstalled. Specialist r003 repairs a measured native floor seam under the gasket and is finishing evidence; diagonal wall/node families follow. These contact studies cannot silently certify airtight pressure or structural strength. Operational pressure/airlock/vertical traversal, cargo/services/damage and complete Wayfarer template remain the active acceptance work.

### Next pressure/seal checkpoint — local staging, not published

Five persistent-atmosphere helper tests, four retractable-seal motion tests and two real native-GLB loader tests pass. World atmosphere schema/helper is unregistered; renderer seal adapter is unconnected. Root source checkpoint must exclude these WIP files until their authority/native contact path is integrated. The geometry specialist is completing all-12-shape r004 boundaries and then physical floor-bevel closures; measured mixed layouts currently have paths beneath walls. See `construction_atmosphere_authority.md`. The completed roof release and its normal database remain unchanged.

## Shaped-room r004 checkpoint — current

The exact native r004 family now compiles all twelve floor shapes and four rotations, including explicit v2 clipped polygons. Native structural cores drive spawn/walking collision. Actual Shipyard save/publish/spawn/reload and game Enter/WASD/diagonal wall blocking/cutaway/roof/reconnect/Return passed. All seven items, containers, appearance and existing door rows were preserved. See `construction_boundary_family_integration.md`. The browser is closed and temporary provider role revoked.

Source expansion is frozen at this concrete gate for the parent checkpoint. The r004 path rejects openings/fittings until their native interfaces are integrated. r005 floor-bevel closures are delivered under `final-a004` but uninstalled. Atmosphere schema/helper, seal motion and native gasket adapter remain staged/unregistered/unwired, explicitly outside the completed source slice. Full pressure/airlock/deck/cargo/service/damage/Wayfarer acceptance remains open.
