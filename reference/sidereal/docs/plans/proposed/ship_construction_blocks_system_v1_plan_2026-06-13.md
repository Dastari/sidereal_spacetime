# Ship Construction Blocks System V1 Plan

Status: Proposed
Lifecycle: proposed
Category: plan
Last updated: 2026-06-14
Owners: gameplay simulation + content + replication + persistence + client rendering + dashboard
Scope: Build a Cosmoteer / Starcom: Nexus-style block construction system for Sidereal ships and stations as a NEW, side-by-side entity type (HullDefinition = HullSize + an array of HullComponents) — Lua-authored, with block-derived mass / center of gravity / inertia / collision, real per-thruster IFCS thrust allocation, turret/hardpoint mounts filled by a separate loadout system, and a bridge-core + power model — kept as Sidereal content (not engine), without disturbing the live hardpoint ships until cutover.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- docs/features/active/ship_construction_blocks_contract.md
- docs/features/proposed/dashboard_shipyard_v2_proposal.md
- docs/decisions/dr-0050_block_based_ship_construction.md
- docs/features/active/shipyard_ship_authoring_contract.md
- docs/features/proposed/fly_by_wire_thrust_allocation_proposal.md
- docs/plans/active/ifcs_navigation_and_thrust_allocation_implementation_plan_2026-04-27.md
- docs/decisions/dr-0034_fly_by_wire_thrust_allocation_and_gnc_stack.md
- docs/decisions/dr-0040_distribution_and_persistence_authority_model.md
- docs/decisions/dr-0045_engine_content_separation_achieved.md
- docs/features/proposed/resources_and_crafting_proposal.md
- docs/plans/active/unified_content_authoring_pipeline_plan_2026-06-12.md

Date: 2026-06-13
Owners: gameplay simulation + content + replication + persistence + client rendering + dashboard

> **Revision pending (2026-06-14).** The feature contract was expanded with the data-driven
> **component-contribution model** (blocks link Bevy components that aggregate into ship stat pools —
> armor/cargo/fuel/power — or drive behaviour), **placement & connection rules** (edge attachability,
> attach-to-type, clearance, multi-cell arrangements), **cost + capacity budgets gated by ship size
> class** (small/medium/large/capital), and **Dashboard Shipyard V2** (component designer + pixel
> painter + hull assembler). The workstreams below (WS0–WS11) predate that expansion and will be
> re-sequenced to add these surfaces before implementation starts. Treat
> `docs/features/active/ship_construction_blocks_contract.md` as the current design authority.
>
> **Authoring-first slice (2026-06-25).** A focused, frontend-led plan now carves out a TEMPORARY
> `/shipyard-v2` authoring route (a subset of WS1 schema/validate + all of WS9 + client-side preview,
> deferring the WS2–WS8/WS10/WS11 runtime to this plan):
> `docs/plans/proposed/shipyard_v2_block_authoring_route_plan_2026-06-25.md`. It produces validated
> `BlockDefinition`/`HullDefinition` packages this plan's runtime then consumes.

## 1. Goal & vision

Build ships and stations the way **Starcom: Nexus** and **Cosmoteer** do: a vessel is a grid of
snapped-together blocks (bridge, reactors, engines, armor, weapon mounts, fuel, cargo, scanners,
shields, …), and where each block sits determines the ship's mass, **center of gravity**, handling,
firepower coverage, power budget, and survivability. Layout *is* gameplay.

The **target model** (the V1/deferred split is in §11):
- **Bridge core.** Every hull is built around a single **bridge** block — the command core, base
  battery, and the thing a hull cannot exist without (Starcom's bridge).
- **Power.** Reactors generate power and batteries store it; weapons, shields, thrusters, and other
  active blocks **draw** power. Under-reactored ships brown out under sustained load.
- **Placement matters.** Weapon mounts on the exterior get clear lines of fire; reactors/batteries
  buried in the center behind armor bulkheads survive longer. (Damage layering is post-V1, but the
  *layout* that makes it matter is V1.)
- **Real thrusters, no magic drive.** Each thruster is a placed, directional block applying force at
  its own position; the ship maneuvers only as well as its thruster layout allows (§6).
- **Mounts vs weapons.** Turrets and fixed hardpoints are **hull blocks** (mounting points). Which
  weapon is fitted to each is decided by a **separate loadout/fitting system** (§8.2).
- **Ship classes & tech.** Larger ship classes raise the hull-size (cell/hex) cap; tech research
  unlocks classes, blocks, and weapons; building costs resources. (Progression/economy are separate
  systems; this plan respects their seams.)

This is **Sidereal-game content**, not engine. All hull/block/weapon/thruster/allocation semantics
live in `sidereal-game` + `data/`. The only engine touch is teaching the generic `engine-physics`
mass seam to honour a content-supplied **center-of-mass offset + explicit inertia**; per-thruster
force uses stock Avian `apply_force_at_point`. The DR-0045 **deletion test** stays green.

## 2. Implementation strategy: side-by-side, not in-place

**We do not mutate the existing hardpoint ships.** We add a **new entity/component type** in
`sidereal-game` — a **Hull** built from a `HullDefinition` — and build new systems for it that run
**alongside** the live `system.modular_hierarchy.v1` (hardpoint/`MountedOn`) ships. The current
corvette/rocinante keep running on the old path throughout development; nothing breaks while the new
system matures behind it.

Cutover is the *last* step: once the Hull path is proven, re-author the starter ships as
`HullDefinition`s, flip spawns, then delete the old hardpoint components/systems/data. This converts
the earlier "pervasive breaking change" into an additive build with a single, late, reversible
switch — far lower risk, and developable on a running game.

Concretely, side-by-side means:
- New components (`HullDefinition`, `HullSize`, `HullComponent` array, `WeaponMount`, …) coexist with
  `Hardpoint`/`MountedOn`; no string-stable persistence value changes (only additions) until cutover.
- New systems are gated on the `Hull` marker (or a `HullComponent` query) so they never touch
  hardpoint ships, and vice-versa.
- A Hull ship and a hardpoint ship can be spawned in the same world during development for A/B.

## 3. Vocabulary (locked by DR-0050 / WS0)

| Term | Meaning |
|---|---|
| **Hull** | The assembled ship/station entity (the new type). Carries a `HullDefinition`. |
| **HullDefinition** | The authored blueprint: kind (ship/station), grid, `HullSize`, root stats, the **array of `HullComponent`s**, and a default loadout. A typed Lua-decoded struct and the durable component on the hull entity. |
| **HullSize** | The grid bounds — `width × length` cells (square) or radius/bounds (hex). Caps come from ship class. |
| **HullComponent** | One **placed block** in the array: `{ block_id, cell, facing, … }`. Where a block sits in the hull. |
| **Block** | A catalog entry for a placeable piece *type* (`block.reactor.fission_mk1`) — bridge, reactor, battery, thruster, armor, hull, mount, fuel, cargo, scanner, shield, jump drive, …. Authored in Lua. (Informally "part/module".) |
| **Bridge** | The mandatory command-core block; exactly one per hull; base battery; the hull cannot exist without it. |
| **Mount block** | A turret or fixed-hardpoint **block** (a hull part on a cell) providing a weapon attachment point. Carries no weapon itself. ("Hardpoints are still real," now componentized as blocks.) |
| **Weapon (fitted equipment)** | Not a grid block — equipment installed onto a mount by the loadout system; carries the firing components + a size class. |
| **Loadout / fitting** | A **separate system/UI** assigning a weapon to each mount. This plan defines only the mount blocks + the merge-at-spawn seam. |
| **Cell / facing** | Integer grid coordinate; orientation in grid steps (square: `N/E/S/W`, `+Y` forward; hex: 6 steps). Thruster exhaust / fixed-mount muzzle / turret rest follow facing; tile rotates. |
| **GridKind** | `square` (V1 recommendation) or `hex` (Starcom-style; deferred/optional, §4.0). |
| **CoG** | Mass-weighted block centroid → Avian `CenterOfMass`; the point thruster torques and the IFCS allocator solve about. |
| **Ship class** | A tier with a `HullSize` cap (cell/hex limit). Tech research unlocks classes/blocks (separate system). |
| **Power** | Reactor generation + battery capacity vs active-block draw. V1 models the data + build-time validation; runtime brown-out is a scoped decision (§11). |

## 4. Data model

### 4.0 Grid topology — square vs hex (recommendation: square for V1)

Starcom: Nexus uses a **hex** grid; Cosmoteer uses **square**. For a top-down 2D space ARPG with
free-rotating, broadly rectangular warships and cardinal thrusters, **square is the better V1
default**:

| | Square (recommended V1) | Hex (Starcom-style) |
|---|---|---|
| Thruster facings | 4 cardinal (`N/E/S/W`) — clean force vectors, simple allocation | 6 directions — richer, but messier vectors/art |
| Hull shape / collision | Rectilinear footprint → trivial outline/AABB | Jagged edges → more outline work |
| Authoring & art | Simplest tiles; intuitive for warships | Organic/symmetric look; more tile variants |
| Coordinate math | `IVec2` | axial/cube coords |

Decision: model the grid behind a **`GridKind`** enum and write cell math through a small
`grid` module so **hex remains addable later** without reworking the data model, but ship **square**
in V1. (Open question §15 #1 — if the art/feel target is strongly Starcom-hex, we can flip the V1
default; the abstraction keeps the cost contained.)

### 4.1 Block catalog (content, Lua) — `data/scripts/blocks/`

New registry (the eventual replacement for `data/scripts/ship_modules/`, but it lands additively):

```text
data/scripts/blocks/registry.lua          -- index: block_id -> script + category + tags
data/scripts/blocks/<block_slug>.lua       -- one block definition per file
```

**Categories are open-ended** (the substrate must absorb every future system); V1 recognises
`bridge`, `hull`, `armor`, `reactor`, `battery`, `thruster`, `mount`, `fuel`, `cargo`, `scanner`,
`shield`, `jump_drive`, with a `generic` fallback (mass + visual + components only) so new content
never needs a Rust enum change. Example reactor + bridge:

```lua
-- data/scripts/blocks/bridge_mk1.lua
return {
  block_id = "block.bridge.mk1", display_name = "Bridge Mk1", category = "bridge",
  footprint = { { 0, 0 }, { 1, 0 }, { 0, 1 }, { 1, 1 } },  -- 2x2
  mass_kg = 1200.0, health = 1500.0,
  power = { battery_capacity_kj = 5000.0 },               -- base battery (Starcom bridge)
  visual = { tile_asset_id = "block_bridge_mk1" },
  components = { { kind = "flight_computer", properties = { profile = "basic_fly_by_wire" } } },
}

-- data/scripts/blocks/reactor_fission_mk1.lua
return {
  block_id = "block.reactor.fission_mk1", display_name = "Fission Reactor Mk1", category = "reactor",
  footprint = { { 0, 0 } }, mass_kg = 900.0, health = 700.0,
  power = { generation_kw = 1200.0 },
  visual = { tile_asset_id = "block_reactor_fission_mk1" },
}
```

Thruster and mount blocks are in §6 and §8.2. Active blocks declare `power.draw_kw` (V1 data; §11).

### 4.2 HullDefinition blueprint (content, Lua) — `data/scripts/ships/`, `data/scripts/stations/`

A ship `.lua` becomes a `HullDefinition`: `HullSize` + an **array of `HullComponent`s** + non-derived
root stats + a default loadout:

```lua
return {
  hull_id = "ship.corvette_v2",          -- NEW id; the v1 hardpoint ship.corvette is untouched
  bundle_id = "ship.corvette_v2",
  kind = "ship",                         -- "ship" | "station"
  class = "corvette",                    -- ship class -> HullSize cap (tech-gated unlock is separate)
  display_name = "Corvette",
  grid = { kind = "square", cell_size_m = 2.0 },
  hull_size = { width = 9, length = 15 },  -- cells; must be within the class cap

  -- Non-derivable hull stats (mass / CoG / inertia / size / collision are DERIVED from the layout).
  root = {
    health_pool = { current = 1000.0, maximum = 1000.0 },
    destructible = { destruction_profile_id = "explosion_burst", destroy_delay_s = 0.18 },
    flight_envelope_profile = { mode = "Combat", --[[ request-shaping caps; §6 ]] },
  },
  visual = { map_icon_asset_id = "map_icon_ship_svg" },  -- hull sprite is COMPOSED from block tiles

  -- The array of placed blocks. cell + facing replaces hardpoint offset + rotation.
  components = {
    { block_id = "block.bridge.mk1",            cell = {  0,  2 }, facing = "N" },  -- exactly one bridge
    { block_id = "block.reactor.fission_mk1",   cell = {  0,  0 }, facing = "N" },  -- buried center (survivable)
    { block_id = "block.thruster.main_mk1",     cell = {  0, -6 }, facing = "S" },  -- main drive
    { block_id = "block.thruster.maneuver_mk1", cell = { -3,  5 }, facing = "N" },  -- nose retro (port)
    { block_id = "block.thruster.maneuver_mk1", cell = {  3,  5 }, facing = "N" },  -- nose retro (stbd)
    { block_id = "block.thruster.maneuver_mk1", cell = { -4,  0 }, facing = "W" },  -- port -> push stbd (strafe/yaw)
    { block_id = "block.thruster.maneuver_mk1", cell = {  4,  0 }, facing = "E" },  -- stbd -> push port (strafe/yaw)
    { block_id = "block.armor.plate_1",         cell = { -4,  1 }, facing = "N" },  -- exterior bulkhead
    { block_id = "block.armor.plate_1",         cell = {  4,  1 }, facing = "N" },
    { block_id = "block.fuel.tank_1",           cell = { -2, -2 }, facing = "N", mirror_group = "fuel" },
    { block_id = "block.fuel.tank_1",           cell = {  2, -2 }, facing = "N", mirror_group = "fuel" },
    { block_id = "block.scanner.array_mk1",     cell = {  0,  4 }, facing = "N" },
    { block_id = "block.mount.turret_medium",   cell = {  0,  6 }, facing = "N" },  -- a mount; weapon by loadout
  },

  -- Default loadout: weapon fitted to each mount cell. Owned at runtime by the SEPARATE loadout
  -- system/UI (§8.2); authored here only so the ship ships armed.
  loadout = { { mount_cell = { 0, 6 }, weapon_id = "weapon.pdc_mk1" } },
}
```

### 4.3 New ECS components (content, `crates/sidereal-game/src/components/`)

Per the component rules (`#[sidereal_component(...)]`, one primary per file, persist + replicate +
visibility, hydration roundtrip + tests in the same change). All are **new**; none replace a
string-stable persisted value until cutover.

- **`Hull`** (marker) — gates every new system; distinguishes the new entity type from hardpoint ships.
- **`HullDefinition`** (hull) — `{ kind, class, grid: GridKind, components: Vec<HullComponent> }` where
  `HullComponent = { block_id, cell: IVec2, facing }`. The durable authored layout. `persist,
  replicate, visibility=[Public]`.
- **`HullSize`** (hull) — `{ width, length }` (square) — grid bounds; validated against the class cap.
- **`WeaponMount`** (mount blocks) — `{ mount_kind, mount_size, arc_deg, traverse_rate_deg_s,
  fitted_weapon: Option<String> }`; fitted weapon's components merged on at spawn (§8.2).
- **`TurretState`** (turret mounts) — `{ aim_angle_rad, commanded_aim_rad: Option<f32>, target:
  Option<Uuid> }`; replicated aim.
- **`HullPower`** (hull, V1 data) — `{ generation_kw, battery_capacity_kj, draw_kw, stored_kj }`
  aggregated from blocks; build-time validated; runtime brown-out scoped in §11.
- Substrate marker components (`ShieldEmitter`, `JumpDrive`, `CargoBay`, …) added as blocks need them;
  their *systems* are separate efforts.

**Runtime realization (hybrid, recommended).** The `HullDefinition` array is the source of truth.
At spawn, **functional blocks that need per-entity runtime state, replication granularity, or
independent targeting** — thrusters (`Engine` + actuator state), mounts (`WeaponMount`/`TurretState`),
reactors — are spawned as **child entities** of the hull (so the existing actuator/combat patterns
apply); **pure structural blocks** (hull/armor) stay as data in the array (no entity per armor tile).
This honours "an array of HullComponents" as the definition while keeping per-functional-block ECS
state where it's actually needed, and avoids an entity-per-tile blowup. (When per-block destruction
lands, armor cells gain health state in the array or get promoted; §11.)

### 4.4 Typed registry structs
`block_registry.rs` (`BlockDefinition` — footprint, mass, health, power, category, directional,
thruster/mount fields, components) and `hull_registry.rs` (`HullDefinition`, `HullComponent`,
loadout), decoded + validated by `lua_content.rs`. Additive; the existing `ship_registry.rs` stays.

## 5. Derived physics: mass, center of gravity, inertia, collision

Derived **server-side, deterministically**, at spawn and on structural edit. Pure functions of the
`HullDefinition` → identical across shards, unit-testable.

### 5.1 What is computed (`crates/sidereal-game/src/hull_physics.rs`)
Blocks have mass `mᵢ`, footprint cells, `cell_size_m = s`, block center `cᵢ = s·centroid`:
- **Total mass** `M = Σ mᵢ` (+ cargo). Feeds `TotalMassKg`.
- **Center of gravity (local)** `CoG = (Σ mᵢ·cᵢ)/M`.
- **Inertia about CoG** `Iz = Σ [ mᵢ·|cᵢ−CoG|² + mᵢ·(wᵢ²+hᵢ²)/12 ]` (parallel-axis).
- **Footprint outline + AABB + `SizeM`** from the union of occupied cells, RDP-simplified via the
  existing `engine-physics` outline generator (fed the block polygon, not the texture).

### 5.2 Engine seam (the only engine change)
Extend generic `engine_physics::DerivedMassContribution` with `center_of_mass_local_m: Option<Vec2>`
and `inertia_kgm2: Option<f32>`; `engine-physics` sets Avian `CenterOfMass`/`AngularInertia` from them
when present (else today's behaviour). Name-neutral → deletion test green. The hull-physics system
writes them (plus `contributed_mass_kg`) before the engine recompute, where
`accumulate_mass_contributions` writes today. `TotalMassKg`↔`Mass`, `Iz`↔`AngularInertia`,
`CoG`↔`CenterOfMass` parity asserted by tests.

## 6. Propulsion — real per-thruster force-at-point + IFCS allocation (V1 core)

**There is no magic thruster — and this is the whole reason IFCS exists.** A flight control system
that, given pilot intent and the real thrust data of every engine, computes what each engine must do.
`ifcs.rs` already models this — `PropulsionActuator { local_mount_position_m, … }`,
`DirectionalAllocationResult`, `ActuatorCommand`/`ActuatorState` — with `MagicActuatorLimits` as the
stand-in *until real engines with positions exist*. The Hull system supplies them; the allocator is
**the IFCS directional stage finally fed real geometry**, not a new module.

A thruster block (`data/scripts/blocks/thruster_maneuver_mk1.lua`) carries
`category = "thruster"`, `directional = true`, `thrust_face` (exhaust face → push opposite),
`thruster_role` (`main|retro|maneuver`), `power.draw_kw`, and an `engine` component.

- **Model.** Each thruster populates an IFCS `PropulsionActuator`: position `rᵢ` =
  `local_mount_position_m` = block center − CoG (now real); unit thrust dir `dᵢ` (from
  `thrust_face`+`facing`, push-only); max thrust `Tᵢ`. Throttle `uᵢ∈[0,1]` → wrench column
  `uᵢ·Tᵢ·[dᵢ.x, dᵢ.y, (rᵢ×dᵢ)_z]`. Columns stacked = **actuation matrix `A`** (3×N), cached per
  layout, rebuilt only on structural change. Application: stock
  `Forces::apply_force_at_point(uᵢ·Tᵢ·dᵢ_world, block_world_pos)` per thruster → Avian produces the
  torque about CoM from geometry. No hand-rolled torque.
- **Allocation (per tick).** The flight computer turns intent + `FlightEnvelopeProfile` into a desired
  wrench `w*=[Fx*,Fy*,Tz*]` about CoG; the IFCS allocator solves
  `min ‖A·u − w*‖² + λ‖u‖²,  0 ≤ u ≤ u_max(fuel, power, damage)` — **bounded non-negative least
  squares** (push-only), **deterministic** (fixed iteration order, warm-started). Achievability is
  emergent: no lateral thrusters ⇒ can't strafe (residual unmet) — the intended depth.
- **Envelope/fuel/power/plume/perf.** `FlightEnvelopeProfile` becomes a **request shaper** (caps what
  the computer asks for); thrusters are the authority. Fuel: `burn_rate·uᵢ` drains fuel blocks; power:
  `draw_kw·uᵢ` against `HullPower`; both clamp `u_max` to 0 when depleted. Plume reads
  `PropulsionActuatorState.uᵢ` per thruster block. Perf: cache `A`, re-solve on change, skip
  background ships, bench within the 60 Hz budget.
- **IFCS ownership.** The directional allocator + actuation upgrade lands **in `ifcs.rs`**; this plan
  supplies the actuator data + cached `A` + solver; `MagicActuatorLimits` is replaced for Hulls. WS0
  confirms with the IFCS plan owners so there is one allocator, not two.

## 8. Systems (new, gated on `Hull`)

Side-by-side: these are **new** systems keyed on the `Hull` marker; the old hardpoint systems are
untouched until cutover.

### 8.1 Placement / hierarchy
A `spawn_hull` path reads `HullDefinition` → spawns the hull entity + child entities for functional
blocks (§4.3), each at `cell_to_local(cell, facing)` via the `grid` module. Reuses the existing
`ParentGuid`/`ChildOf` hydration; child records carry their block identity + cell.

### 8.2 Mounts, weapons & loadout — two layers
**Construction places mounts; a separate loadout/fitting system fills them.** A mount block (turret
or fixed hardpoint) is a hull part carrying `WeaponMount`; weapons are **fitted equipment**
(`data/scripts/weapons/`) carrying firing components + a size class. This plan defines only the seam:
at spawn/re-fit, the fitted weapon's components (`ballistic_weapon`, `ammo_count`, `weapon_tag`) are
merged onto the mount entity after a `size` check.
- **Turret mounts** carry `TurretState`; a system slews `aim_angle_rad` toward the commanded
  aim/`target` at `traverse_rate_deg_s`, clamped to `arc_deg` about `facing`. Aim source: pilot
  cursor/selected target (ties into the active target selection system) or auto-track; AI same path.
  Muzzle = mount world pos + `aim_angle`; fire along aim; replicated aim → client renders the barrel.
- **Fixed hardpoint mounts** (`mount_kind="fixed"`: railgun, fighter gun): no turret; the fitted
  weapon fires along the mount `facing`. The minority path.
- Combat index keys by mount entity / `(hull, cell)`. Arc self-occlusion deferred (authored `arc_deg`
  only in V1). **The fitting UI/inventory/swap-rules/tech are a separate effort** (V1 ships the
  blueprint default loadout + the merge seam).

### 8.3 Thrusters / fuel / power
Engine query on hull-child thruster blocks → IFCS actuators → allocate (§6) → `apply_force_at_point`.
Fuel/`HullPower` aggregated per hull. Replaces the magic-engine path for Hulls only.

### 8.4 Mass / collision / substrate
`hull_physics` (§5) writes mass/CoG/inertia/outline. `scanner`/`shield`/`jump_drive`/`cargo` blocks +
components land as buildable substrate; their gameplay systems are existing/future separate efforts.
Visibility/redaction for Hull children mirrors the existing module redaction policy.

### 8.5 Client (`bins/sidereal-client/`)
Hull renders as the **composite of block tiles** (each functional-child + each data armor/hull cell
draws its tile at its cell, rotated by facing) — recommend per-block tiles for V1 (no bake). Turret
barrels at replicated `aim_angle_rad`; thruster plumes per thruster block from
`PropulsionActuatorState`. Debug overlay: cell + thruster-vector + CoG gizmos.

### 8.6 Persistence (DR-0040)
Hull layout persists: `HullDefinition` on the hull + functional-block child records (existing
parent/child graph path). Add new schema strings (`hull_definition`, `weapon_mount`, `turret_state`,
optional `HAS_BLOCK`) — **additive**; the string-stable `HAS_HARDPOINT`/`mounted_on` are untouched
until cutover deletes the old path. Regenerate `data/generated/persistence_schema_rules.json` (drift
guard). Three questions: **persist?** yes; **replicate?** yes, `Public` structure + sensitive-payload
redaction; **authority?** server only — clients never author hulls or aim (aim is a request).

### 8.7 Registry resync / authoring
Extend `RegistrySource` resync (DR-0049 / unified-authoring WS3) to `block`/`hull` registries.

## 9. Stations
`kind="station"`: same block catalog, bridge optional/replaced by a station-core block, no required
thrusters, spawns `RigidBody::Static`/`Kinematic`; CoG/inertia still derived. V1 = authoring +
spawning a station Hull; station **services** (docking, refining, markets) out of scope (resources/
crafting proposal).

## 10. Engine / content boundary (DR-0045)
- **Content (`sidereal-game` + `data/`):** block catalog + decoders; `Hull`/`HullDefinition`/
  `HullSize`/`HullComponent`/`WeaponMount`/`TurretState`/`HullPower` + substrate components; typed
  structs + validation; CoG/inertia/footprint derivation; the IFCS actuator-feed + allocator math;
  turret aiming; loadout merge seam; grid module; persistence rule **values**; dashboard editor; all
  `data/scripts/**`.
- **Engine (`engine-physics`):** *only* the generic `DerivedMassContribution` CoM-offset + explicit-
  inertia → Avian sync; per-thruster application uses stock `apply_force_at_point`; reuse the generic
  RDP outline generator. **Default-deny:** allocation + grid math stay in `sidereal-game` unless a
  non-space reuse is demonstrated. No block/ship vocabulary enters `engine-*`.

## 11. Scope: V1 vs the Starcom vision

**In V1:** new side-by-side Hull entity type; `HullDefinition` (square grid, `HullSize`, component
array); mass/CoG/inertia/collision from layout; real per-thruster IFCS allocation; bridge-core
requirement; turret + fixed mounts with the loadout merge seam + default loadout; the open block
substrate (reactor/battery/fuel/cargo/scanner/shield/jump as buildable blocks); ship-class
`HullSize` cap **validation**; **power data + build-time validation** (Σ draw vs generation/battery).

**Designed-for, deferred (with named owners/seams):**
- **Runtime power brown-out** (weapons/shields cut when battery depletes) — V1 *models* power and
  validates at build; live drain/recharge enforcement is a scoped fast-follow (open Q §15 #6).
- **Damage layering / per-block destruction** (exterior armor soaks hits, interior reactors die last,
  hull splits) — reuses the asteroid-V2 destructible/fracture precedent; V1 lays down `health` +
  the array so it isn't blocked.
- **Weapon loadout/fitting system + UI** — inventory/ownership, swap-while-docked, fit persistence.
- **Tech research progression** unlocking classes/blocks/weapons; **build cost / materials**
  (resources/crafting proposal). V1 honours the class cap; it does not implement unlocking or cost.
- **Hex grid** (kept addable behind `GridKind`); turret geometric line-of-fire; jump/shield/cargo
  gameplay systems; interiors/crew; player in-world build UI (V1 authoring = dashboard/Lua).

## 12. Workstreams & order

| WS | Title | Output | Depends on |
|---|---|---|---|
| **WS0** | Contract + decision | Accept DR-0050; ratify the feature contract `docs/features/active/ship_construction_blocks_contract.md` (drafted); confirm grid kind (§4.0); fix the power V1-scope line; reconcile the allocator with the IFCS plan; lock vocabulary + additive persist strings. | — |
| **WS1** | Block + hull Lua schema + decoders | `data/scripts/blocks/**` + `HullDefinition` shape; `block_registry.rs`/`hull_registry.rs`; `lua_content.rs` decode + validation (block resolvable, no cell overlap, in HullSize/class cap, connectivity, exactly one bridge, ≥1 thruster, power Σdraw ≤ gen+battery, mount size sane). Unit tests; no runtime change. | WS0 |
| **WS2** | New entity type + spawn + placement | `Hull`/`HullDefinition`/`HullSize`/`HullComponent`; `grid` module; `spawn_hull` (hull + functional child blocks at cell transforms); coexists with hardpoint ships. Spawn a Hull alongside a hardpoint ship. | WS1 |
| **WS3** | Derived physics + engine seam | `hull_physics.rs` (mass/CoG/inertia/footprint); extend `engine-physics` `DerivedMassContribution` (CoM + inertia) + Avian sync; outline from footprint. CoG-off-origin / inertia-vs-spread tests. | WS2 |
| **WS4** | Propulsion: feed IFCS + allocate | Populate IFCS `PropulsionActuator`s from thruster blocks; cached `A`; bounded-NNLS directional allocator in `ifcs.rs`; `apply_force_at_point` actuation; fuel + power clamps; plume state. Determinism + under-thrustered + perf tests. | WS3 |
| **WS5** | Mounts, weapons & loadout seam | `WeaponMount`/`TurretState`; weapon catalog (`data/scripts/weapons/`); merge fitted weapon → mount at spawn (size-checked); turret slew/arc/aim; fixed-hardpoint fire; combat for Hulls; replicated aim. (Full fitting UI separate.) | WS1, WS2 |
| **WS6** | Power + class caps (data) | `HullPower` aggregation; build-time Σdraw validation; ship-class `HullSize` cap table + validation. (Runtime brown-out per §11 decision.) | WS2 |
| **WS7** | Client rendering | Composite block-tile hull, turret barrels, per-thruster plumes, CoG/thruster gizmos for Hulls. | WS2, WS4, WS5 |
| **WS8** | Persistence + replication | `HullDefinition`/child records persist + hydrate roundtrip; additive schema strings + artifact regen; Public structure + redaction; resync. | WS2, WS5 |
| **WS9** | Dashboard hull editor | Cell paint/rotate/mirror/validate with live CoG + power + thrust-vector preview; gateway returns decoded block/hull JSON (unified-authoring WS1). | WS1, WS8 |
| **WS10** | Stations | `kind="station"` static Hull + `data/scripts/stations/` + spawn. | WS2, WS8 |
| **WS11** | Cutover | Re-author corvette/rocinante as `HullDefinition`s; flip starter spawns; reset starter world; delete `Hardpoint`/`MountedOn`/`ModuleTag` + old systems + `data/scripts/ship_modules/`; retire `HAS_HARDPOINT`. | WS3–WS8 |

## 13. Verification
- **WS1:** decoder tests (valid round-trip; overlap / unknown block / over-cap / disconnected /
  no-bridge / no-thruster / over-power / bad mount-size rejected); authoring round-trip gate accepts.
- **WS2:** a Hull spawns with child functional blocks at correct transforms **in the same world as a
  hardpoint ship**, neither system touching the other.
- **WS3:** asymmetric layout → CoG off-origin toward heavy side; `Iz` grows with spread; Avian
  `CenterOfMass`/`Mass`/`AngularInertia` match derived; determinism across runs/shards.
- **WS4:** opposed lateral thrusters strafe + yaw; rear-only-drive ship **cannot** strafe; thrust
  about the true CoG (rear-offset drive doesn't spuriously spin a balanced ship); allocator
  deterministic; fuel/power clamp throttle; perf within budget.
- **WS5:** a turret tracks + fires at an off-bow target within arc; over-arc target not engaged; a
  fixed railgun fires only along facing; barrel renders at replicated aim; size-mismatch fit rejected.
- **WS6:** under-reactored blueprint fails build validation; over-cap HullSize rejected.
- **WS8/WS11:** Hull persists + reloads (layout, aim); after cutover no `Hardpoint`/`MountedOn`
  remains and starter ships fly/fight on the Hull path.
- **WS10:** a station Hull spawns static, visible, collidable.
- **All:** `cargo fmt`, `clippy -D warnings`, workspace `check`, wasm client build, engine **deletion
  test** green, `scripts/siderealctl docs-check`.

## 14. Risks
- **Allocator determinism** across shards/clients (NNLS pivoting) → fixed-iteration solver, warm-start,
  golden tests.
- **Allocator perf** on the 60 Hz path → cache `A`, re-solve on change, skip background ships, bench.
- **Two systems coexisting** (Hull + hardpoint) → strict `Hull`-marker gating; the cost is temporary
  duplication, bought down by the much lower cutover risk.
- **Flight feel** with real CoG/inertia + finite thrusters → per-ship re-tuning; ensure starter Hulls
  are adequately thrustered before cutover.
- **Scope creep from the Starcom vision** (power/tech/cost/damage) → the §11 V1/deferred line is the
  contract; WS0 ratifies it.
- **Engine-boundary creep / persist-string immutability** → only CoM/inertia sync is engine; additive
  strings + drift guard; deletion test in CI.

## 15. Open questions (for design sign-off)
1. **Grid topology.** Square (recommended V1; hex kept addable behind `GridKind`) vs ship hex now to
   match Starcom's look/feel. Lead question — it shapes art, physics, and authoring.
2. **Runtime realization.** Hybrid (functional blocks = child entities, structural = data array;
   recommended) vs pure data array vs full child-entity-per-block.
3. **Footprint catalog & cell size.** Confirm size set (1×1, 1×2, 2×2, 2×3, bridge 2×2…) and
   `cell_size_m = 2.0`.
4. **Turret aim source.** Auto-track selected target, cursor aim, or both (recommended), server-slewed.
5. **Allocator solver.** Bounded NNLS (recommended) vs cached pseudo-inverse + clamp.
6. **Power enforcement in V1.** Data + build-time validation only (recommended) vs also runtime
   brown-out (weapons/shields cut when battery depletes).
7. **Loadout authority.** Blueprint default loadout for V1 with the fitting UI/inventory a separate
   effort; only weapons use the mount seam (recommended).
8. **Connectivity validation.** Require all blocks edge-connected to the bridge + exactly one bridge +
   ≥1 thruster for ships (recommended).
