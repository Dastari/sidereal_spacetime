# DR-0050: Block-Based Ship & Station Construction Replaces Hardpoint Mounting

Status: Proposed
Lifecycle: source-of-truth
Category: decision
Last updated: 2026-06-13
Owners: architecture + gameplay simulation + content
Scope: DR-0050: Block-Based Ship & Station Construction Replaces Hardpoint Mounting.
Source of truth: yes
Supersedes: n/a
Superseded by: n/a
Primary references:
- docs/plans/proposed/ship_construction_blocks_system_v1_plan_2026-06-13.md

Date: 2026-06-13
Owners: architecture + gameplay simulation + content

## Context

- Ships are modelled by `system.modular_hierarchy.v1`: a hull root entity, a fan of `Hardpoint`
  child entities (`(ship)-[:HAS_HARDPOINT]->(hardpoint)`), and `MountedOn` module child entities,
  with the hull silhouette/collision coming from the **texture** and physics treating the hull as a
  uniform origin-centered rectangle. Module **placement does not affect physics** — center of gravity
  is always the entity origin and inertia is the whole-hull rectangle, regardless of where mass sits.
- The intended fantasy (per the design document and the fly-by-wire/IFCS direction) is an
  **explainable, customizable spacecraft** in the spirit of Cosmoteer / Starcom: Nexus / Starcom:
  Unknown Space — ships (and stations) **built from blocks on a grid**, where layout drives mass,
  balance, and thruster geometry.
- The fly-by-wire proposal (DR-0034) and the IFCS plan already want **directional thruster geometry**
  (Phase 5 "directional hardpoint allocation"); the current magic-engine torque budget is a placeholder
  precisely because there is no real engine geometry to allocate against.

## Decision

- Adopt a **block (grid-tile) construction system** for **all ships and stations**, in the spirit of
  Starcom: Nexus / Cosmoteer: a vessel is a **Hull** built around a single **bridge** core from
  **cell-aligned blocks of varying size**, where layout drives mass, **center of gravity**, handling,
  firepower coverage, **power budget**, and survivability. Blocks are the **universal substrate**:
  bridge, reactor, battery, thruster, mount, weapon-via-loadout, fuel, cargo, scanner, armor, hull,
  shield, jump drive, … (categories open-ended; new content needs no Rust enum change).
- The authored shape is a **`HullDefinition` = `HullSize` (grid bounds) + an array of `HullComponent`s**
  (`{ block_id, cell, facing }`), plus non-derived root stats and a default loadout. "Component
  mounting" becomes "a block placed at a cell, with its components fixed there."
- **Implement side-by-side, not in-place.** Add a **new entity/component type** (`Hull`) in
  `sidereal-game` with new systems gated on the `Hull` marker, running **alongside** the live
  hardpoint/`MountedOn` ships (`system.modular_hierarchy.v1`), which are left untouched during
  development. Cutover is the last step: re-author the starter ships as `HullDefinition`s, flip
  spawns, reset the starter world, then delete the old hardpoint components/systems/data. This turns
  a pervasive breaking change into an additive build with one late, reversible switch.
- Physical behaviour is **derived from the block layout**, server-side and deterministic: total mass,
  **center of gravity**, rotational inertia (parallel-axis about CoG), and collision footprint (from
  the union of occupied cells, not the texture).
- **There is no magic omnidirectional thruster.** Each thruster is a placed, directional block that
  applies its force **at its own position on the rigid body** (Avian `apply_force_at_point`), so
  translation and rotation are the emergent result of which thrusters fire about the true CoG. A
  **thrust allocation** layer (deterministic bounded non-negative least squares over a per-layout
  actuation matrix) chooses per-thruster throttles to best meet the flight computer's desired wrench.
  This is **V1**, and it realises the directional allocator of DR-0034 / the fly-by-wire proposal /
  the IFCS plan (the block layout supplies the geometry those need); the magic-engine bridge is retired.
- **Mounts are blocks; weapons are fitted to them by a separate system.** Turrets and fixed
  hardpoints are themselves hull blocks placed on cells by the construction system ("hardpoints are
  still real," now componentized as blocks); which weapon is installed on each is decided by a
  separate **loadout/fitting** system/UI. Turret mounts aim/fire in any direction within an authored
  arc (server-slewed `TurretState`, replicated aim); fixed hardpoints fire the fitted weapon along the
  mount's facing (railguns, fighter guns). This plan defines the mount blocks + the merge-at-spawn
  seam (and a blueprint default loadout so ships ship armed); the fitting UI/inventory is out of V1.
- This is a **Sidereal-game content feature**, not engine. All block/grid/construct/weapon/thruster/
  allocation semantics live in `sidereal-game` + `data/`. The **only** engine change is teaching the
  generic `engine-physics` mass seam (`DerivedMassContribution`) to honour a content-supplied
  **center-of-mass offset and explicit inertia** and sync them to Avian `CenterOfMass`/`AngularInertia`
  — name-neutral and reusable by any top-down game; per-thruster application uses stock Avian
  `apply_force_at_point`; the DR-0045 deletion test stays green.
- **Grid topology:** model behind a `GridKind` enum; ship **square** in V1 (clean cardinal thruster
  vectors, rectilinear hulls, simplest authoring), keeping **hex** (Starcom-style) addable later.
- **V1 scope:** exterior hull design + cell-aligned block placement (new side-by-side type), with
  block-derived mass/CoG/inertia/collision, **real per-thruster IFCS thrust allocation**, the
  **bridge-core** requirement, **turret + fixed mounts** with the loadout merge seam + default
  loadout, the open block substrate, ship-class `HullSize` **cap validation**, and **power data +
  build-time validation**. **Deferred:** runtime power brown-out, per-block damage layering/
  destruction, the weapon loadout/fitting UI + inventory, tech-research unlocks + build cost, hex,
  interiors/crew. Stations are supported structurally (static Hulls); station *services* are out of
  scope.
- Avian 0.6.1 natively supports a settable `CenterOfMass(Vec2)` and `Forces::apply_force_at_point`, so
  the off-center CoG and per-thruster force-at-point model are expressible directly in V1.

## Alternatives considered

- **Keep hardpoints, add a CoG field:** rejected — placement still wouldn't be the source of truth;
  authors would hand-maintain CoG/inertia that should be derived; no path to Cosmoteer-style building.
- **In-place replacement of the hardpoint ships (mutate the existing type):** rejected — pervasive,
  breaking, and undevelopable on a running game. The new Hull type is built **side-by-side** and the
  old path is deleted only at cutover.
- **Pure hull-owned data array (no child entities) vs entity-per-block:** the `HullDefinition` array
  is the source of truth, realised as a **hybrid** — functional blocks (thrusters, mounts, reactors)
  become child entities (per-entity actuator/aim/combat state, replication granularity), pure
  structural/armor cells stay data. Avoids an entity-per-tile blowup without losing functional-block
  state.
- **Make the block/grid system an engine feature:** rejected — block types, ship/station semantics, and
  combat/flight/allocation coupling are space content; only the generic off-center mass primitive is
  engine (default-deny per the engine-boundary rule).
- **Keep the magic aggregate thruster (defer real per-thruster physics):** rejected per design intent —
  there is no magic omnidirectional thrust; thrust is a geometric problem and the allocator is V1. The
  block layout *is* the directional geometry DR-0034 / the IFCS plan need, so V1 realises that allocator
  rather than re-deferring it; ownership of the request/guidance vs geometry/allocation split is
  reconciled with the IFCS plan in WS0.
- **Fixed-forward weapons as the default (defer turrets):** rejected — most ships use turrets that fire
  any direction; fixed mounts (railguns, fighter guns) are the minority path. Turret aiming is V1.

## Consequences

- Positive:
  - Ship layout becomes meaningful gameplay: balance, mass distribution, thruster placement (strafe/
    yaw authority), turret coverage, weapon arcs — the customization fantasy the design document calls for.
  - One construction model and one universal block substrate for ships, stations, and every future
    bolt-on system (shields, jump drives, cargo, power, tractor); collision matches the actual build.
  - Removes the hardpoint indirection, texture-derived collision, and the magic engine; *realises* the
    directional thrust allocator the fly-by-wire/IFCS stack needs from real thruster geometry.
  - Side-by-side build de-risks a large change: new systems mature behind the live hardpoint ships;
    one late, reversible cutover instead of a pervasive in-place rewrite.
- Negative:
  - Large surface: real per-thruster physics + a deterministic thrust allocator + turret aiming +
    power/class validation, plus a new entity type coexisting with the old one (temporary duplication)
    until cutover; couples to the IFCS plan.
  - The allocator must be deterministic across shards/clients and fit the 60 Hz authority budget.
  - Cutover is a breaking content + persistence change → starter-world reset (no live hardpoint-ship migration).
  - Real CoG/inertia + finite thrusters require per-ship flight re-tuning and adequately-thrustered
    starter ships.

## Follow-up

- Accept this DR and write the active feature contract (`ship_construction_blocks_contract.md`) in WS0.
- Execute the V1 plan workstreams WS0–WS7.
- Sequel decisions when they land: per-engine geometric thrust allocation (with the IFCS plan),
  per-block health/destruction, tractor-beam pull gameplay, station services.

## Decision doc

- `docs/decisions/dr-0050_block_based_ship_construction.md`

## References

- `docs/features/active/ship_construction_blocks_contract.md`
- `docs/plans/proposed/ship_construction_blocks_system_v1_plan_2026-06-13.md`
- `docs/features/active/shipyard_ship_authoring_contract.md`
- `docs/decisions/dr-0034_fly_by_wire_thrust_allocation_and_gnc_stack.md`
- `docs/plans/active/ifcs_navigation_and_thrust_allocation_implementation_plan_2026-04-27.md`
- `docs/decisions/dr-0040_distribution_and_persistence_authority_model.md`
- `docs/decisions/dr-0045_engine_content_separation_achieved.md`
- `docs/plans/active/unified_content_authoring_pipeline_plan_2026-06-12.md`
- `crates/sidereal-game/src/{ship_registry.rs,hierarchy.rs,mass.rs,flight.rs,combat.rs,persistence_schema.rs}`
- `crates/engine-physics/src/mass.rs`

## 2026-09-07 Phase 2 direction

The user confirmed that functioning installed blocks must determine all ship
abilities. Fuel and power require explicit grid connections; a powered computer
core provides fly-by-wire. A working AI module is the explicit owner remote-control
provider. Local direct engine operation remains possible without a core when its
fuel and device requirements are satisfied. This is planned work, not current
runtime behavior. See `docs/plans/proposed/building_blocks_phase_2_utilities_and_control_plan_2026-09-07.md` for sequencing and security/persistence acceptance.
