# Construction pressure topology foundation

Status: pure simulation foundation implemented and tested, 2026-09-09. This does not implement live pressure gameplay, multi-deck traversal or a complete construction system.

## Owned files and validation

- `packages/sim/src/construction-topology.ts`
- `packages/sim/src/construction-topology.test.ts`

Focused Vitest suite: 12 tests pass. `npm run typecheck` passes. Tests include deterministic input ordering, connected deck volumes, gradual hatch flow, high-conductance equilibrium, sealed boundaries, explicit breaches, 200 split/merge cycles, removed/new/resized cells, 300 steps of a 20-cell leak network, admission bounds, invalid gas rows and airlock interlocks. Aggregate checks/build and real authority smoke remain the integration owner's release gates. No world tables, shared exports, assets, browser sessions or services were changed by this subtask.

## API

`compilePressureTopology(structure)` accepts immutable source cells (`id`, `deckId`, volume in m³, named faces) and explicitly paired boundary endpoints. Every face must be assigned once. A null second endpoint means exterior vacuum; omission is an error. The upstream structural compiler must establish geometry, face matching and actual rated definitions. An ID string here is not certification of a visual asset's pressure capability.

Boundary kinds:

- `sealed`: requires an explicit pressure-definition ID. It does not transport gas.
- `continuous`: joins cells of a permanently unpartitioned volume, including connected decks. It cannot join vacuum.
- `flow`: carries a functional-definition ID and nonnegative conductance in mol/(s·Pa). Doors, hatches, vents, leaks and breaches use these boundaries. Open portals retain finite-volume solver nodes and transport gas gradually; opening a door must not be translated into a `continuous` merge. Zero conductance closes the gas connection. Closed-door leakage is an explicitly supplied nonzero conductance.

Compartment IDs use the smallest immutable source cell ID with a `volume:` prefix. Arrays and traversal are ordered deterministically. Room labels and decorative armor do not participate. A topology revision must update persisted gas rows atomically because derived compartment identities can change.

`remapCompartmentGas(previous, next, gas)` apportions each old compartment's gas by its old source-cell volumes. Merging sums those shares; splitting does not duplicate pressure. Retained source cells keep their share when resized, corresponding to compression/expansion. Added cells start empty. Deleted-cell shares are returned as `removedMoles`: the authority adapter must reject the edit, capture that gas or explicitly account for expulsion. This helper never discards that amount silently. Geometric subdivision/replacement with new cell identities requires a future explicit overlap mapping; this implementation does not invent one.

`stepCompartmentGas(topology, gas, seconds)` returns fresh gas rows, explicit `ventedMoles`, and signed net transfers per flow boundary. It uses a fixed 293.15 K temperature and the ideal-gas pressure relation `P = nRT/V`. Exact pairwise exponential transfers keep each exchange nonnegative and prevent pairwise pressure overshoot. Sixteen symmetric forward/reverse sweeps provide a bounded operator-splitting approximation. This is a linear-conductance game model, not compressible-fluid or sonic-flow simulation. Pressure and volume determine flow; exterior vacuum never supplies gas.

`pressurePascals(moles, volumeM3)` computes that same fixed-temperature relation.

`transitionAirlock(state, pressure, intent, emergencyAuthorized)` validates open/close/start-pump/stop-pump requests. Normal opening checks power, obstruction, opposing-door state, pump inactivity, remaining seals and configured differential pressure. Pumping requires power, both doors closed and intact chamber/seals. Authorized emergency manual operation can bypass power/interlock/differential checks and explicitly reports potential exposure; obstruction still rejects. Input state is not mutated. Power-supply changes must call the adapter's stop-pump transition so a rejected actor request cannot leave stale pumping active.

## Bounds and integration responsibilities

At most 2,048 cells, 8,192 boundaries, 64 faces per cell, and 128 characters per source ID. Cell volume is 10⁻⁶–10⁹ m³. Total gas is at most 10¹⁵ mol. Conductance is at most 10⁶ mol/(s·Pa). A call advances 0–1 s using 16 symmetric substeps; larger elapsed intervals require a separately bounded server scheduling policy. These are admission bounds, not a measured server throughput claim.

Topology objects are trusted products of `compilePressureTopology`, not untrusted client JSON. Gas rows must cover every compartment exactly once. The authority layer still needs bounded JSON decoding, permission/revision validation, pinned approved definitions, topology revision invalidation, and atomic persistence.

Not implemented here:

- Actual construction compiler-to-cell geometry/face/vertical-opening adapter, geometric overlap remapping, or native collision/damage coupling.
- SpacetimeDB tables, persistence, reducer scheduling, access control, actual multi-client/restart proof or UI.
- Actual pump reservoir/supply/vent transfers and power consumption; selecting a pump target creates no gas.
- Oxygen species, thermal energy, life-support reserves, injuries, sonic flow or full airlock cycling automation.
- Deck traversal, pressure-door motion/clearance geometry, EVA or exterior frame transfer.

The integration must obtain door/breach/power states from authority and use actual pressure compartments independently of room labels. A cutaway or armor-only damage must not alter pressure-shell topology. The same published structural adapter should drive enclosure, collision, and damage-derived exposure.
