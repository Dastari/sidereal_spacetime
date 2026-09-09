# Semantic layout to pressure adapter

Status: bounded pure adapter implemented; no world persistence, gas initialization, damage or gameplay wiring. Owned files are `packages/sim/src/construction-pressure-layout.ts` and its focused test file. Updated 2026-09-09.

## API

`describePressureLayout(layout, instanceId, { floorTopUnitsByDeck })` validates the semantic layout and returns deterministic cells, surfaces and a SHA-256 geometry fingerprint. One gas cell corresponds to each floor tile. Floor-top datums are required explicitly for every deck; ceilings and deck elevations come from the validated document. Cell metadata includes polygon, absolute bottom/top planes and nominal prism volume, which is an upper bound rather than a certified free volume.

`buildLayoutPressure(layout, instanceId, options, contracts)` recomputes that description, checks all supplied contracts, and returns `{ geometry, structure, topology }`. `structure` directly satisfies the existing `PressureStructure` interface; `topology` comes from `compilePressureTopology`. Existing `remapCompartmentGas` and `stepCompartmentGas` consume it directly. There is no separate `buildPressureTopology` function in the existing foundation; `compilePressureTopology` is its actual export.

The adapter needs only the already available content export `@sidereal/content/ship-layout` and the sim package's existing `@noble/hashes` dependency. A future world adapter will need explicit sim package exports for `./construction-pressure-layout` and `./construction-topology`. This specialist did not edit package exports or shared indexes.

## Geometry and identity

Permanent, unobstructed shared floor edges form continuous volume. Original partition coverage and semantic opening endpoints split shared faces into independent wall/opening segments. A design-sealed partition needs explicit sealing evidence; an open divider retains permanent volume continuity. Room names, labels, room seeds and visual themes do not define pressure compartments.

The current semantic compiler requires partitions to follow shared floor edges. A partition cutting through a tile interior is rejected; this adapter does not silently treat the entire tile as one permeable cell, infer new geometry or invent subdivision IDs. Floor and roof surfaces independently face explicit external vacuum unless a supplied seal or explicit cross-deck link says otherwise. A missing surface contract rejects the whole proposal rather than defaulting to either sealed or open.

The descriptor's SHA-256 covers instance ID, stable cell geometry, surface geometry and requested roof coverage flags. It excludes room labels and presentation names. Cell IDs hash the instance identity and immutable source tile ID, so unchanged tiles preserve gas identity across partition edits, while two instances have disjoint IDs. Surface IDs hash their structural role and geometry, and output ordering is deterministic. They are pressure-model identities, not allocated gameplay entity UUIDs.

A split opening distributes the supplied whole-opening conductance across its planar segments by their length fractions. It does not multiply the conductance when one doorway spans a tile seam. Vertical header/sill area is not a separately discretized gas cell: the externally validated flow coefficient represents the actual aperture, and native solid displacement is excluded from the supplied free volume.

## Explicit physics contracts

Every gas cell requires `PressureFreeVolume` with the cell ID, free volume, excluded solid volume, `displacementAccounting: 'validated-native-solid-exclusion'` and a current geometry proof. Free plus excluded solid volume must equal the nominal prism volume. This is an accounting check, not calculation or approval of native wall displacement. The trusted adapter must derive those numbers from validated geometry, including wall cores and other solids; the helper does not estimate them from a GLB AABB or art dimensions.

Every non-continuous surface requires explicit coverage evidence and either a verified airtight seal or a positive exterior-vacuum flow coefficient. The latter is allowed only on an exterior surface. No generated material health, pressure rating, strength, mass or gas amount is introduced.

Every semantic opening requires explicit coverage and flow proofs, an actual open/closed state, and open/closed conductances. Open conductance is positive and cannot be below the closed residual. Ungasketed closures must retain positive closed flow and cannot attach an airtight claim. Zero closed flow requires a separately verified seal interface. The known boundary r001 GLB hash is explicitly rejected as the seal artifact: its 2 mm leaf fit gaps cannot certify themselves as airtight. A future, independently validated gasket/interface artifact can supply the necessary proof. Door state does not merge volumes: both open and closed states remain finite-flow boundaries.

Proof records carry a definition ID, revision, exact source SHA-256, validation record ID and the current geometry fingerprint. These records are **trusted upstream validation results**, never client assertions. This helper checks their identity, binding and numerical consistency; it does not authenticate their issuer or independently prove a native seal, volume or material property. It must not be called with client-created `validated: true` objects. No current unapproved wall/roof candidate gains pressure approval merely because this API exists.

## Multiple decks and apertures

Matching XY does not connect decks. An explicit traversal or vent link needs two distinct endpoint IDs, one covered floor and one covered roof on different decks, matching convex aperture polygons, correct surface planes, independent coverage proofs, remaining-surface seals and a proof for the enclosed span between them. The lower roof must be at or below the upper floor. The caller supplies the finite link conductance.

The current adapter allows at most one link per floor/roof surface and requires aligned planar aperture footprints. It rejects duplicate endpoint IDs, overlapping consumption of the same surface, mismatched footprints/planes, non-convex or self-intersecting aperture polygons, missing remaining-surface seals and missing enclosure evidence. Bent ducts, multiple holes in one tile, wall-mounted vents, external airlock mechanics and movement traversal are outside this bounded adapter. No stairs, teleport, enclosure tube or service-space capacity is inferred.

## Conservation and limits

The underlying solver is still the explicit fixed-temperature 293.15 K linear-conductance approximation with bounded substeps. Initial gas comes only from caller-owned authoritative state. Opening a door or adding a link does not create or instantly redistribute gas. Remapping retains stable-cell shares; new cells start empty and removed-cell gas returns as `removedMoles`, requiring a separate authoritative policy. Exterior loss is reported as `ventedMoles`.

Admission limits before geometry work: 256 tiles, 128 partitions and 128 openings. Further caps are 2,048 surfaces, 128 aperture links, and 262,144 edge/partition/opening checks. Each aperture has at most eight vertices. Existing layout and pressure topology limits also apply, including per-cell face limits, valid volumes and conductance bounds. These are bounded-work limits, not a performance certification.

## Validation

Focused command:

`npx vitest run packages/sim/src/construction-pressure-layout.test.ts packages/sim/src/construction-topology.test.ts`

**30 tests pass: 18 new adapter tests and 12 existing topology tests.** New coverage includes label irrelevance, stable/disjoint IDs, wall/door face splits, conductance distribution across a floor seam, residual closed-door leakage, finite open-door flow, explicit exterior loss, independent upper/lower decks, explicit cross-deck exchange, paired aperture validation, absent/unapproved/stale evidence rejection, solid displacement accounting, rejection of r001 airtight self-certification, partition split/merge conservation, removed-cell accounting, open-divider continuity, unknown/duplicate coverage and early bounds/interior-partition rejection.

Standalone TypeScript checking passes. Both new files were formatted with Prettier. Aggregate check/build/smoke and actual gameplay integration remain with the parent, who is freezing the separate native boundary checkpoint. No browser, service, schema, shared content, generated binding or publication changes were made for this adapter.
