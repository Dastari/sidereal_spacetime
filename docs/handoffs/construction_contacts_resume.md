# Construction contact integration resumed

Status: pure native contact matcher implemented and tested; no pressure gameplay enabled.
Updated: 2026-09-09. Owner: construction_resume, coordinated with root.

## Delivered and verified

The earlier agents' delivered work is preserved. The installed checkpoint remains the r004 shaped-room boundary family with native rendering, collision, editor publication/spawn, roofs and no-loss return. Persistent atmosphere, semantic pressure layout and retracting door-seal helpers remain staged.

`packages/sim/src/construction-native-contacts.ts` consumes exact private/content-owned r005 final-a004 interface, native GLB and validation bytes. It hashes all three before creating a privately owned catalog. Its matcher accepts a server-compiled complete deck assembly: native floor placements and their asset/selector/source-transform pins, native r004 wall placements, geometry fingerprint, deck identity/datums and actual opening list. It qualifies only one of the 18 measured no-opening fixture configurations, allowing rigid quarter turns and lattice translations. It does not infer a wall mask from the floor shape alone.

The output pins the actual selected contact mesh groups, per-floor instance identities, deck-origin elevation, unit scale and native solid volume. Insert coordinates already contain the 0.1875 m floor height, so rendering adds only deck elevation. The insert lies below the walk datum; its solid volume is not subtracted again from the above-floor gas prism. Floor and equipment UUIDs are untouched. Changing instance or deck produces independent derived contact identities; input ordering does not.

Unknown whole masks, changed or missing walls, wrong floor dependencies/selectors/transforms, duplicates, reflections, non-quarter turns and any opening reject. Current exact fixture bounds are eight floors and thirteen walls; general Wayfarer assemblies require a validated per-floor mask matcher or additional authored fixture qualifications. A local fixture must never qualify a subset while ignoring extra adjacent walls or openings.

The qualification is explicitly `native-floor-wall-contact-only`. It is not a `VerifiedPressureSeal`, wall/roof coverage proof, pressure rating, damage definition, gameplay resource or art approval. Keep that distinction through serialization and authority wiring.

Fresh revalidation ran the delivered native validator against copied r005 inputs in `.runtime/construction-resume-contact-check`, leaving frozen canonical evidence unchanged. All 130 checks pass. All 18 configurations have no remaining measured under-wall room-to-vacuum or cross-room path. The eight-quarter T fixture previously had one path touching two rooms and vacuum. This is actual native triangle contact evidence at the declared tolerance; a cosmetic floor side seam is not used as proof either way.

Seven new tests cover all 18 actual fixtures, transformed mixed-T placement, instance/deck isolation, stable ordering, missing/changed wall masks, duplicates, reflected or shifted floor sources, opening rejection and all exact artifact hashes. Combined contact, pressure-layout, seal-motion and atmosphere tests: 34 pass. Full TypeScript check passes. Root owns the combined source/build checkpoint; no shared exports, schema, bindings, catalogs, services or browser slot were mutated here.

## Next authority and native wiring

1. Project a bounded runtime contact catalog from the exact pinned interfaces at content publication time, retaining hashes and editable source provenance privately. Add a sim package export only after root releases the source checkpoint. Supply catalog bytes from trusted package content, never reducer arguments or editable client documents.
2. Derive floors and walls from the accepted instance blueprint's native compiler. Bind qualification to the same semantic geometry fingerprint used by `describePressureLayout`. Root should reconcile floor IDs/source transforms with `FamilyPlacement` and derive stable insert placements. Load native GLB once and select the exact group; do not synthesize wedges or stretch to unknown masks.
3. Validate all remaining physical interfaces independently: wall-to-wall core joints, roof underside/butt seams, floor seams exposed to room interiors, sloped/custom canopy contacts, any openings and penetrations. R005 solves only its declared wall-base paths. Generic room sealing must remain rejected when any required physical interface is missing. Native floor-to-floor butt evidence is separate from under-wall closure.
4. Compute per-cell actual free volume with validated native solid exclusion. Current contact wedges add zero volume above the walk plane; wall cores, fittings, sloped ceilings and canopy intrusions still need union/clipping accounting without double subtraction. Do not substitute visual AABB volume or nominal prism volume.
5. Feed the existing `buildLayoutPressure` only complete trusted coverage/free-volume contracts plus explicit game seal/flow definitions. Room labels remain irrelevant. Conductance, source gas and material ratings are server game definitions, never inferred from native color or mesh height. Initial allocation defaults to vacuum; a charged test fixture requires a separately authorized resource transaction.
6. Register private `construction_atmosphere`, admission-filtered projections, spawn initialization and bounded fixed-tick stepping. Keep model edits, gas disposition, operation receipts and layout revision checks atomic. The existing adapter preserves inventory/instance state; reconnect never refills gas. Use named additive review databases and preserve review rows, never reset a smoke database to stand in for gameplay evidence.
7. Door work uses separately pinned r001 frame, r002 retracting gasket and r003 threshold after overlap/contact validation. Persist seal phase and hinge state from the existing solver, retract before hinge movement, close before deployment, check power/obstructions, then derive residual conductance from accepted physical state. A deployed morph target alone never proves sealing. External airlocks also require interlocks, vent/pump resource policy and valid egress/reentry.
8. Review actual game pressure change, finite equalization, no gas creation, obstruction and power failure, reload and independent instance state. Run combined check/build/art and isolated authoritative smoke after wiring. Retain voxel damage for structure/exterior and health-only interior equipment as already scoped.

## Current cockpit adaptation audit

`current_cockpit_construction_audit.json` pins the actual installed hull, floor and Wayfarer assembly files and records consumed native assets/placements. The latest combination is pilot R006 with polymer-04 finish, Frontier roof r004 and side armor r003. Legacy `pilot-r004-*` and `pilot-r005-*` placement IDs are intentional; they must not select older geometry or create duplicate parts.

There are twenty installed pilot hull/glass placements across thirteen assets. The forward deck uses four 2×2 m squares and two matching triangles (20 m² nominal); an additional retained 2×2 m connector sits at [-1,7]. The forward polygon is [-3,9], [3,9], [3,11], [1,13], [-1,13], [-3,11] metres. Walk datum is 0.1875 m. The manifest placement offset has already been applied; adding its [0,4,0] again would reproduce the earlier misplaced bow. Existing helm is [0,10.25], console [0,11.25].

Keep the swept canopy and latest exterior joins. The current semantic rectangular gas prism and generic vertical r004 wall family cannot silently replace this geometry. Existing lab collision samples the canopy at 2.25 m with explicit crew radius and a conservative inward offset; it is valid implementation history, not a reusable sealed-volume definition. Derive a proper height-dependent clearance/collision proxy and native enclosed gas volume for the actual sloped shell before claiming the reconstructed bridge is operational.

Concrete model/interface gaps to commission if not available from the current sources:

- Exact pilot shell base/glass/post/roof interface and native physical closure definitions, preserving the current hull shape and floor datum. Add a narrow Blender repair only where the contact audit finds real holes.
- A compatible working door leaf, frame gasket and threshold for the retained 1.25 m rear opening. The legacy name `airlock-frame-22` describes a future mount, not an airlock chamber or functioning sealed door.
- Roof underside closure interfaces for the installed Frontier r004 pieces, including the canopy joins. Keep the current roof artwork and identify pressure structure separately from armor/decorative panels.
- Per-asset voxel damage/collision transforms and pressure-breach response for structural hull/glazing. Interior consoles/seats remain entity-health assets. Decorative armor is not assumed to be the pressure envelope.

Do not replace the latest cockpit with a generic square test room to bypass these tasks. Existing fitting/container IDs and live crew/cargo state remain preserved by a separately validated refit; fresh Wayfarer template spawns get independent IDs.
