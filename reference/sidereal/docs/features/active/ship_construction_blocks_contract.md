# Ship Construction Blocks Contract

Status: Active
Lifecycle: source-of-truth
Category: feature
Last updated: 2026-09-07
Owners: gameplay simulation + content + replication + persistence + client rendering + dashboard
Scope: The durable data model and invariants for Sidereal's block (grid-tile) ship/station construction system — Hull entities authored as HullDefinition (HullSize + an array of HullComponents) where each block links Bevy components that either contribute to ship-level stat pools (armor, cargo, fuel, power, …) or drive behaviour (engine→IFCS thrust, turret), with multi-cell footprints, placement/connection rules, cost + capacity budgets gated by ship size class, block-derived mass/CoG/inertia/collision, real per-thruster IFCS thrust allocation, and turret/hardpoint mounts filled by a separate loadout system — built as a NEW side-by-side type that supersedes the hardpoint mounting system at cutover.
Source of truth: yes
Supersedes: n/a
Superseded by: n/a
Primary references:
- docs/decisions/dr-0050_block_based_ship_construction.md
- docs/plans/proposed/ship_construction_blocks_system_v1_plan_2026-06-13.md
- docs/features/proposed/dashboard_shipyard_v2_proposal.md
- docs/features/active/shipyard_ship_authoring_contract.md
- docs/features/proposed/fly_by_wire_thrust_allocation_proposal.md
- docs/plans/active/ifcs_navigation_and_thrust_allocation_implementation_plan_2026-04-27.md
- docs/features/proposed/resources_and_crafting_proposal.md
- docs/decisions/dr-0040_distribution_and_persistence_authority_model.md
- docs/decisions/dr-0045_engine_content_separation_achieved.md
- docs/decisions/dr-0046_lua_asset_registry_gateway_http_delivery.md

## 0. Implementation status

2026-09-07 roof update: Shipyard 2.13 uses continuous opaque skin with perimeter-only joins and separate markings. Existing live ships received guarded cosmetic updates with durable receipts and retained their editable sources after restart. The shared native/WASM sprite representation is unchanged; see “Continuous roof skin” below.

2026-09-07 Shipyard consolidation: `/shipyard` is the sole dashboard editor, with live modular refits at `/shipyard/entities/{uuid}`. The retired V1 editor and its exclusive dashboard APIs are removed. `/shipyard-v2` bookmarks redirect to the canonical route, preserving live entity UUIDs. The Parts window supports all eight floating resize handles and docked height resizing, with keyboard controls, workspace bounds and session persistence. Window layout is independent of ship history. This changes dashboard presentation/routing only; native/WASM gameplay, gateway registry formats, owner-shard authority and persistence receipts are unchanged.

2026-09-07 Phase 2 direction: installed functional blocks will be the exclusive
source of ship abilities. Add a separate fuel/power routing layer, a powered
computer core for fly-by-wire, bounded direct engine interaction, and an installed
powered AI module for owner remote manual control/navigation. These utilities and
AI grants are planned, not currently implemented. See
`docs/plans/proposed/building_blocks_phase_2_utilities_and_control_plan_2026-09-07.md` for the code audit, work order and acceptance gates.

2026-09-07 live authoring update: Shipyard 2.7 opens the selected explorer ship at
`/shipyard-v2/entities/{uuid}`. Canvas edits remain local until **Apply to live
ship** (or Ctrl/Cmd+S); this refits that UUID without publishing its shared hull
blueprint. See the live refit section below for validation and persistence.

2026-09-07 dashboard update: Shipyard 2.6 uses one icon-only part palette,
floating over the canvas or docked below it. Search matches name, ID, category
and tags; layer/category filters narrow the catalogue. Hover or keyboard focus
shows names and mass. Clicking a tile arms its placement layer in a hull;
double-clicking or the pencil action opens the block designer. The plus action
creates a block, and Back to hull restores the hull document and history. The
left library contains only ship classes and hulls. The floating header supports
pointer dragging and arrow-key movement (Shift increases the step), with bounds
clamped when the workspace resizes. Dock, position and collapsed state persist
in browser session storage, independently of document history. This is dashboard
presentation only; native/WASM runtime and replication are unchanged.

2026-09-06 crew update: blocks now author optional `interior` floor/fixture/seat
geometry. The compiler resolves it into a persisted `InteriorDeck`, validates the
chair exit, and character birth seats the player at the approved bridge chair.
See [crew interiors](crew_interiors_contract.md) for movement, privacy and native/
WASM presentation. Existing exterior mass/collision and fitting layers retain
their separate meanings.

**2026-09-06 modular runtime implementation:** the canonical block/hull packages now
compile to a persisted `HullAssembly` root, convex compound collider, public
`CompositeVisual`, owner-only `InteriorVisual`, and UUID-mounted fitting entities.
The Wayfarer starter retains the approved `ship_top.png` deck and half-cell bulkhead
placement, with added exterior armour, two rocket pods, six manoeuvring jets,
external airlock and fuel storage. Six faction palettes provide editable variants.
Shipyard 2.3 displays actual tile images, separate structure/equipment editing and
cutaway/exterior views. Source definitions remain in `data/content/`; the proposed
Lua paths and June milestone descriptions below are historical design vocabulary.

Every structural polygon contributes mass and inertia. Dry fittings, inventory and
fuel contribute once at their mount position; mass, centre of mass and planar
inertia are recalculated together. Compound collision preserves angled outlines
and gaps. Shared fixed-tick IFCS allocates real directional force and lever-arm
torque, consumes actual commanded fuel, and disables depleted/damaged engines.
`PropulsionVisual` exposes only nozzle geometry and actual output for animated
exhaust; client presentation does not author forces. Native and WASM share this
pipeline. The modular-flight cutover used protocol 19; the subsequent crew release is protocol 20 (96 replicated kinds). Cosmetic finish changes below do not alter that wire format.

Implemented publication gates include layer overlaps, structural connectivity,
rotated permitted attachment faces, floor support, exhaust/keep-clear space,
capacity, power, convex CCW collision geometry, and typed fitting payloads.
Physical behaviour is currently enabled for thrusters, fuel, inventory and scanners.
Other generator/shield/weapon art is available for authoring but does not yet imply
full runtime power distribution, shield simulation or a fitted weapon loadout.
The airlock has eight authored animation frames; runtime door interaction remains open; attached characters now walk on the compiled deck under the crew contract. Live structural rebuild/capture into a
baseline is also open; changing a blueprint does not rewrite existing ships.

Authority and distribution (DR-0040): the root's owning shard owns the assembly,
its fitting subtree, fuel and derived mass. Fittings retain UUIDs and `MountedOn` /
`ParentGuid` through the root's existing snapshot/handoff lane. `SimulationPaused`
blocks construction mass/thrust writes while a source root is frozen; ghosts do
not run those writers. On the receiving shard the persisted sources regenerate
colliders, mass and actuator state. Client prediction waits for the expected
fitting mounts before deriving mass. Public viewers receive the roof, collision
outline and exhaust; private interiors and whole fitting entities are owner-only,
including when the parent is public or faction-visible. Source edits require an
explicit future owner-shard structural command with expected revision and a durable
receipt; never replace that command with dashboard graph writes.

See `docs/plans/active/modular_space_assets_and_interiors_plan_2026-09-06.md` for
remaining station walking, moving-interior and live structural editing work.

**Not yet implemented (2026-06-14). Design in active flux.** This contract is the fully-fledged
feature doc and the design-locked build target for `system.ship_construction_blocks.v1`; it precedes
code. The implementation plan (`docs/plans/proposed/ship_construction_blocks_system_v1_plan_2026-06-13.md`)
is **pending revision** against this expanded contract (component-contribution model, placement
rules, cost/capacity budgets, Shipyard V2). Agents MUST NOT assume any symbol named here exists yet.

Built **side-by-side** with the live hardpoint system (`system.modular_hierarchy.v1`); supersedes it
only at cutover (plan WS11). Until cutover this contract adds; it changes no string-stable persisted
value. Authoring tooling is specified separately in the **Dashboard Shipyard V2** proposal.

## 1. System label

`system.ship_construction_blocks.v1` | `Ship Construction Blocks System V1`. Eventually supersedes
`system.modular_hierarchy.v1` (hardpoint/`MountedOn`). Its dashboard authoring surface is
`system.shipyard_authoring.v2` (the Shipyard V2 proposal), which evolves
`system.shipyard_ship_authoring.v1`.

## 2. Scope

In scope (V1):
- A new `Hull` entity type for **ships and stations**, authored as `HullDefinition`.
- **Hull components (blocks)** that link Bevy components which either (a) **contribute** to ship-level
  stat pools (armor, cargo, fuel, power, shield, …) or (b) **drive behaviour** (engine → IFCS thrust
  by mount geometry; turret with rotation; scanner). §7.
- **Multi-cell footprints** with rotateable arrangements; **placement & connection rules** (edge
  attachability, attach-to-type, clearance, bridge connectivity). §8.
- **Cost + capacity budgets** gated by **ship size class** (small/medium/large/capital → grid + budget
  caps). §9.
- Block-derived **mass / center of gravity / inertia / collision** (§10); **real per-thruster IFCS
  thrust allocation** (§11); bridge-core requirement; turret + fixed **mounts** filled by a separate
  **loadout** seam (§12).
- Authoring via Lua (source of truth) and **Dashboard Shipyard V2** (component designer + pixel
  painter + hull assembler), referenced separately.

Non-goals (V1; designed-for, deferred — see plan §11): runtime power brown-out and runtime armor/
shield damage layering / per-block destruction / hull splitting; the weapon loadout/fitting inventory
+ ownership + swap rules; tech-research unlocks of classes/blocks + the economy that prices build
cost; hex grid; turret geometric line-of-fire; shield/jump/cargo gameplay systems; interiors/crew;
in-world (non-dashboard) player build UI.

## 3. Vocabulary (locked)

- **Hull** — the assembled ship/station entity (the new type); carries `HullDefinition`.
- **HullDefinition** — authored blueprint: `kind`, `class`, `grid`, `HullSize`, `root`, the **array
  of `HullComponent`s**, and a default `loadout`.
- **HullSize** — grid bounds; capped by ship class.
- **HullComponent** — one **placed block**: `{ block_id, cell, facing }`.
- **Block** — a catalog entry for a placeable piece *type*; declares footprint, mass, cost, placement
  rules, and **linked components** (contributions + behaviours). Authored in Lua / Shipyard V2.
- **Linked component** — a Bevy component a block carries (`{ kind, properties }`). Either a
  **contribution** (adds to a stat pool) or a **behaviour** (drives a system), sometimes both.
- **Stat pool** — a ship-level aggregate (armor, cargo capacity, fuel capacity, power, shield, …)
  summed from contributions; stored in `HullStats`.
- **Bridge** — the mandatory command-core block; exactly one per hull; base battery.
- **Mount block** — a turret or fixed-hardpoint block; a weapon attachment point; carries no weapon.
- **Weapon (fitted equipment)** — not a grid block; installed on a mount by the loadout system.
- **Ship class** — `small | medium | large | capital`: a tier defining the grid cap and the capacity
  budget. Tech-unlock of classes is a separate (deferred) system.
- **Capacity budget** — the abstract build allowance a class permits; each block has a capacity cost;
  Σ ≤ class budget. Plus a per-block **credit cost** for the economy.
- **Placement rule** — a block's footprint, per-edge attachability, attach-to-type requirement, and
  clearance constraints. Enforced at authoring/validation time.
- **CoG** — mass-weighted block centroid → Avian `CenterOfMass`.
- **GridKind** — `square` (V1) or `hex` (deferred; abstracted behind this enum).

## 4. Grid model

- Integer `cell: IVec2` behind a `GridKind`. **V1 ships `square`** (`N/E/S/W`, `N=+Y` forward,
  `+X` starboard); `hex` MUST stay expressible without changing the data model; all cell↔local math
  goes through one `grid` module. `grid.cell_size_m` default `2.0`.
- `facing` sets thruster exhaust / fixed-mount muzzle / turret rest, rotates the tile, **and rotates
  the footprint + its edge profile** (§8).

## 5. Block catalog (content, Lua)

Files: `data/scripts/blocks/registry.lua` + `data/scripts/blocks/<slug>.lua` (one `BlockDefinition`).
Fields:

| Field | Type | Notes |
|---|---|---|
| `block_id` | string | Stable dotted id (`block.<category>.<name>`). |
| `display_name` | string | |
| `category` | string | `bridge`, `hull`, `armor`, `structure`, `reactor`, `battery`, `thruster`, `mount`, `fuel`, `cargo`, `scanner`, `shield`, `jump_drive`, …; unknown → `generic`. |
| `footprint` | `[[x,y], …]` | Occupied cells relative to anchor; rotates with `facing` (§8). |
| `mass_kg` | f32 | The block's own mass (→ physics §10). |
| `health` | f32 | Per-block hp (stored; V1 damage does not consume it). |
| `cost` | `{ credits, capacity }` | Economy price + capacity-budget cost (§9). |
| `placement` | table | Edge attachability, `attach_to`, `min_attachments`, `clearance` (§8). |
| `directional` | bool | Whether `facing` affects behaviour/tile. |
| `visual` | `{ tile_asset_id, … }` | Authored via Shipyard V2 (pixel painter / import). |
| `components` | `[{ kind, properties }]` | **Linked Bevy components** — contributions and/or behaviours (§7). Mount blocks carry **no** weapon components. |

## 6. HullDefinition blueprint (content, Lua)

Files: `data/scripts/ships/<slug>.lua`, `data/scripts/stations/<slug>.lua`. Fields: `hull_id`,
`bundle_id`, `kind` (`ship`|`station`), `class`, `display_name`, `grid` (`{ kind, cell_size_m }`),
`hull_size` (`{ width, length }`), `root` (non-derived stats), `visual` (`{ map_icon_asset_id }` — the
hull sprite is composed from block tiles), `components` (the array of `HullComponent`
`{ block_id, cell, facing }`), and `loadout` (`[{ mount_cell, weapon_id }]`). Mass/CoG/inertia/`SizeM`/
collision/stat-pools/cost/capacity are **derived, never authored**. See plan §4.2 for an example.

## 7. Component contribution model (the core data-driven layer)

A block links Bevy components (`{ kind, properties }`). The runtime classifies each linked kind via a
**component-role registry** (content) into two lanes; a kind may be in both:

### 7.1 Contribution lane — additive stat pools
Pure additive values aggregate into a ship-level `HullStats` map keyed by a **pool id**. Authoring
`armor = 100` on a block means the block links a contribution of `{ pool = "armor", value = 100 }`;
the aggregator sums every block's contributions per pool into `HullStats`. **One generic aggregator,
no per-pool code** — adding a new pool (e.g. `sensor_strength`, `tractor_power`) needs no new system,
only a new pool id and content that emits it. V1 pools include: `armor`, `cargo_capacity`,
`fuel_capacity`, `power_generation`, `power_storage`, `power_draw`, `shield_strength` (data),
`crew_capacity` (data), plus the budget aggregates `capacity_cost` and `credit_cost` (§9).

Two pools are **special and not generic scalars**:
- **Mass** → physics: each block's `mass_kg` feeds CoG/inertia by *position* (§10), via the engine seam.
- **Thrust** → geometry: engine blocks feed the **IFCS actuator set** by mount position + direction
  (§11), not a scalar pool.

### 7.2 Behaviour lane — typed components realized as child entities
Behavioural kinds (`engine`, `mount`/`turret`, `scanner`, future `shield_emitter`, `jump_drive`) are
realized as **child entities** of the hull (per-entity state, replication granularity, targeting) and
drive their systems. A behavioural block may also emit contributions (an engine emits `mass_kg` +
`power_draw`; a reactor emits `power_generation`; a turret emits `mass_kg` + `capacity_cost`).

### 7.3 Aggregation
Contribution sums are **derived from the `HullDefinition` array + block catalog** (no entity per
armor tile needed), recomputed deterministically on any structural change and at spawn, into
`HullStats`/`HullPower`/`TotalMassKg`. Behavioural blocks are spawned as entities. Aggregation is
**content-side** (`sidereal-game`); only mass uses the generic `engine-physics` seam (§10).

## 8. Placement & connection rules (authoring/validation-time)

Each `BlockDefinition.placement` declares how a block may be placed and what it must connect to. Rules
are enforced by the **validator** (shared by the Shipyard V2 editor for live feedback and by the
authoring gate at publish/spawn); the runtime trusts an already-valid layout.

- **Footprint & arrangement.** A block occupies its `footprint` cells; multi-cell blocks are
  first-class. The footprint (and its edge profile) **rotates with `facing`**, giving the different
  arrangements. Footprints MUST stay within `HullSize` and MUST NOT overlap another block.
- **Edge attachability.** Each footprint cell edge (per side, post-rotation) is an **attach face**
  (open) or **blocked**. Neighbours may connect only through mutually-open edges. *Worked example:* a
  "left-side angled hull" block marks its angled/left edge **blocked**, so nothing can mount to its
  left — exactly the requested rule. Blocks MAY also declare **keep-clear phantom cells** (e.g. the
  outer triangle of an angled hull) that no other block may occupy.
- **Attach-to-type.** `attach_to = { categories/tags }` + `min_attachments`: the block MUST touch at
  least `min_attachments` neighbours of an allowed type through open edges. *Examples:* a weapon mount
  attaches to `{ hull, armor, structure }`; a thruster attaches to structure and needs its exhaust
  edge clear; a delicate internal (reactor) may require being fully enclosed.
- **Clearance.** `clearance` names edges/cells that MUST be empty space (engine exhaust lane; turret
  over-cell), so thrust/plume and (later) line-of-fire are unobstructed.
- **Connectivity.** Every block MUST be edge-connected to the **bridge** through open edges (one
  connected structure). Disconnected blocks are rejected.

## 9. Cost, capacity & ship classes

Ships cannot grow without limit. A **ship class registry** (`data/scripts/ship_classes/registry.lua`)
defines, per class (`small`, `medium`, `large`, `capital`):
- `grid_cap` — max `HullSize` (cells), and
- `capacity_budget` — max total capacity cost the hull may contain.

Each block declares `cost = { credits, capacity }`. The hull aggregates `capacity_cost` and
`credit_cost` pools (§7.1). **Build-time validation (V1):** `HullSize ≤ class.grid_cap`;
`Σ capacity_cost ≤ class.capacity_budget`; power balance (§11). `credit_cost` is the build price for
the economy (resources/crafting proposal) — **carried as data in V1, not yet charged**. Tech-research
unlocking of classes/blocks is a separate deferred system; this contract only validates the chosen
class's caps.

## 10. Derived physics

Computed server-side, deterministically, at spawn and on any structural change (pure functions of the
`HullDefinition`; identical across shards; unit-tested). For blocks with mass `mᵢ`, footprint cells,
`cell_size_m = s`, block center `cᵢ = s · centroid(footprint)`:
- **Total mass** `M = Σ mᵢ` (+ cargo) → `TotalMassKg`.
- **Center of gravity (local)** `CoG = (Σ mᵢ·cᵢ)/M`.
- **Inertia about CoG** `Iz = Σ [ mᵢ·|cᵢ − CoG|² + mᵢ·(wᵢ²+hᵢ²)/12 ]` (parallel-axis).
- **Footprint outline + AABB + `SizeM`** from the union of occupied cells via the existing
  `engine-physics` RDP outline generator (fed the block polygon, not a texture).

**Engine seam (the only engine change):** extend generic `engine_physics::DerivedMassContribution`
with `center_of_mass_local_m: Option<Vec2>` and `inertia_kgm2: Option<f32>`; `engine-physics` sets
Avian `CenterOfMass`/`AngularInertia` from them when present. Name-neutral; deletion test stays green.
**Parity:** `TotalMassKg`↔`Mass`, `Iz`↔`AngularInertia`, `CoG`↔`CenterOfMass`, asserted by tests.

## 11. Propulsion — IFCS thrust allocation

No magic omnidirectional thruster. The allocator is the **IFCS directional stage fed real geometry**
(in `ifcs.rs`; this system supplies actuator data). Per thruster block: populate an IFCS
`PropulsionActuator` with `local_mount_position_m =` block center − CoG, unit thrust dir from
`thrust_face`+`facing` (push-only), max thrust `Tᵢ`. Throttle `uᵢ∈[0,1]` → wrench column
`uᵢ·Tᵢ·[dᵢ.x, dᵢ.y, (rᵢ×dᵢ)_z]`; columns stacked = the cached **actuation matrix** `A`. Allocation
per tick: `min ‖A·u − w*‖² + λ‖u‖², 0 ≤ u ≤ u_max(fuel, power, damage)` — deterministic bounded NNLS;
unmet demand (no lateral thrusters ⇒ no strafe) left as residual. Application: stock Avian
`Forces::apply_force_at_point` per thruster. `FlightEnvelopeProfile` is a request shaper; fuel
(`burn_rate·uᵢ`) and power (`draw_kw·uᵢ`) clamp `u_max`.

## 12. Mounts, weapons & loadout seam

2026-09-07: the implemented milestone uses pre-fitted roof turret blocks described
below. The separate interchangeable mount/loadout model in this section remains
proposed; the current fittings do not implement weapon swapping.


Construction places **mounts**; a separate **loadout** system fills them. A mount block (turret or
fixed hardpoint) carries `WeaponMount { mount_kind, mount_size, arc_deg, traverse_rate_deg_s,
fitted_weapon }` and no weapon of its own. Weapons are **fitted equipment**
(`data/scripts/weapons/<slug>.lua`, firing components + `size` class). **Loadout seam (V1):** at
spawn/re-fit, the assigned weapon's firing components (`ballistic_weapon`, `ammo_count`, `weapon_tag`)
are merged onto the mount entity after a `size` check. Turret mounts carry `TurretState` and slew to
aim (cursor/selected target/auto-track) within `arc_deg`; fixed mounts fire along `facing`. Aim is
replicated; clients never author it. The fitting UI/inventory/ownership/swap is deferred.

## 13. Authoring validation (the gate)

`lua_content.rs` decode + the authoring round-trip gate MUST reject, with a clear per-definition error:
unknown `block_id`/component kind; overlapping cells or footprint over a keep-clear cell; any cell
outside `HullSize`; `HullSize` over the `class.grid_cap`; `Σ capacity_cost` over `class.capacity_budget`;
a block violating its **placement rules** (no open-edge attachment, missing `attach_to` neighbour,
clearance not satisfied); a hull not edge-connected to its bridge; not exactly one bridge (ships); zero
thrusters (ships); a mount whose `mount_size` cannot accept its loadout weapon; steady-state power draw
over generation + storage. Validation runs in the Shipyard V2 editor (live), replication bundle-spawn,
gateway loaders, and CI.

## 14. Authoring surfaces

- **Lua** is the source of truth (block catalog, ship-class registry, HullDefinition, weapon catalog).
- **Dashboard Shipyard V2** (`docs/features/proposed/dashboard_shipyard_v2_proposal.md`) is the visual
  authoring surface: a **component designer** (define a block's footprint, edges, attach rules, linked
  components/contributions, cost) with a **pixel painter + image import/resize** for the block tile
  art (saved as content-addressed assets via the DR-0046 asset pipeline), and a **hull assembler**
  (place blocks on the grid with live validation and CoG / power / capacity / thrust preview). It reads
  decoded typed JSON from the gateway (never raw Lua), per the unified content authoring pipeline.
- **Registry resync** (DR-0049) extends to `block`/`hull`/`ship_class` registries.

## 15. Engine / content boundary (DR-0045)

All hull/block/contribution/rule/cost/weapon/thruster/allocation/grid semantics are **content**
(`sidereal-game` + `data/`). The **only** engine change is the generic `DerivedMassContribution`
center-of-mass + explicit-inertia → Avian sync (§10); per-thruster application uses stock
`apply_force_at_point`; the RDP outline generator is reused. Stat-pool aggregation, placement-rule
validation, and budget checks are all content. No block/ship vocabulary enters any `engine-*` crate;
the deletion test MUST stay green.

## 16. Persistence, replication & side-by-side coexistence (DR-0040)

- **Persist:** `HullDefinition`/`HullSize`/`HullStats`/`HullPower` on the hull + behavioural-block
  child records via the existing parent/child graph path. New schema strings (`hull_definition`,
  `weapon_mount`, `turret_state`, optional `HAS_BLOCK`) are **additive**; `HAS_HARDPOINT`/`mounted_on`
  are untouched until cutover. Regenerate `data/generated/persistence_schema_rules.json` (drift guard).
- **Replicate:** hull structure `Public` with sensitive-payload redaction; turret aim replicated.
  **Authority:** server only — clients never author hulls, loadout, or aim.
- **Side-by-side:** new systems gate on `Hull`; hardpoint systems are untouched; a Hull and a
  hardpoint ship coexist in one world. Cutover (plan WS11): re-author starter ships as `HullDefinition`s,
  flip spawns, reset the starter world, delete the old components/systems/data, retire `HAS_HARDPOINT`;
  this contract then supersedes `system.modular_hierarchy.v1` and Shipyard V2 replaces V1.

## 17. Acceptance criteria (V1 done)

1. A `HullDefinition` authored in Lua (and via Shipyard V2) spawns a `Hull` with behavioural-block
   child entities at correct cell transforms, coexisting with a hardpoint ship in one world.
2. Stat pools aggregate correctly: e.g. two `armor=100` blocks → `HullStats.armor = 200`; cargo/fuel/
   power pools sum; adding a new pool needs no new aggregator. Recompute is deterministic on edit.
3. Derived mass/CoG/inertia/collision match the layout; Avian `Mass`/`CenterOfMass`/`AngularInertia`
   agree; deterministic across runs/shards.
4. Placement rules are enforced: a block placed against a blocked edge / without a required `attach_to`
   neighbour / violating clearance / disconnected from the bridge is rejected with a clear error.
5. Budgets enforced: over-`grid_cap` `HullSize`, over-`capacity_budget` block set, and under-powered
   hulls are rejected; `credit_cost` aggregates as data.
6. A ship with opposed lateral thrusters strafes/yaws; a rear-only-drive ship cannot strafe; thrust
   acts about the true CoG; the allocator is deterministic and within the 60 Hz budget.
7. A turret mount tracks and fires at an off-bow target within arc; a fixed hardpoint fires along
   facing; a size-mismatched loadout is rejected; the client renders the barrel at replicated aim.
8. The hull persists and reloads (layout, stats, mounts, aim); a station `HullDefinition` spawns as a
   static Hull.
9. `cargo fmt`, `clippy -D warnings`, workspace `check`, wasm client build, the engine deletion test,
   and `scripts/siderealctl docs-check` all pass.

## 18. Open / deferred

Open (plan §15): grid topology (square V1 / hex later), runtime realization (hybrid), footprint
catalog + cell size, turret aim source, allocator solver, power-enforcement depth, loadout authority,
connectivity strictness, the exact V1 stat-pool + ship-class tables, and how rich the placement-rule
DSL needs to be for V1. Deferred systems: runtime power brown-out + armor/shield damage layering +
per-block destruction; loadout/fitting inventory + ownership; tech unlocks + economy pricing of
`credit_cost`; hex; shield/jump/cargo gameplay; interiors/crew. Authoring tooling depth is in the
Shipyard V2 proposal.

## Canvas authoring and exterior finishes — 2026-09-06

Shipyard 2.5 uses actual HTML canvases for hull assembly and block footprints,
with a Photoshop-style transparency checkerboard and nearest-filtered asset
previews. V selects/moves, B places, E erases, R rotates, Delete removes, Space or
middle-drag pans, the wheel zooms around the cursor, F fits the hull, and arrow
keys nudge. Shift selection, rectangle selection and Ctrl/Cmd+A select multiple
parts. Ctrl/Cmd+Z and Shift+Z/Y restore full document snapshots,
including properties, linked component payloads, collision shapes and markings.
Editing after undo creates a new branch. Histories survive switching documents
within the editor session; reloading the browser discards unpublished history.
Ctrl/Cmd+S publishes a valid hull through the existing typed publication gate.

`HullVisual.roof_theme` selects one of six authored faction finishes. The shared
compiler covers walkable structural cells with deterministic larger connected
plates (1×1 through 3×3 and 2×4/4×2), preserving every physical structural piece,
fixture, mass, collider and private interior. Cosmetic roof panels cannot be used
as structural support. Existing angled armour and physical engine attachments
retain their block geometry and render separately.

`HullVisual.markings` contains stable authoring IDs, a faction palette,
ship-local center/size in cells, CCW rotation in radians and either a decal motif
or text. Text accepts 1–24 characters from A–Z, 0–9, space, period and hyphen;
empty labels, non-finite/invalid dimensions, duplicate IDs, out-of-bounds markings
and more than 128 markings are rejected. Five decal motifs and rendered glyph
assets compile to ordinary `CompositeVisualPart`s, ordered above the armour and
hidden in cutaway. The client requires no new text-rendering protocol or asset
path convention. Both native and WASM use the existing component renderer.

The editor's **Apply published exterior** action requires an explicit live ship
UUID. The gateway compiles the published hull, verifies the existing physical
`HullAssembly` matches, validates all sprite assets, and queues a live authoring
operation. Both the old `CompositeVisual` and unchanged `HullAssembly` are
expected-value guards. The shard checks all expectations before applying anything;
`hull_assembly` is permitted in this lane only as an identical-value guard, never
as a structural edit. The UI distinguishes queued, applied, durable, conflict,
rejected and persistence retry states. Publishing a blueprint alone does not
rewrite live instances. Live structural rebuild remains separate future work.

DR-0040: the entity's owner shard applies the cosmetic component; it persists and
hands off with the root's normal snapshot without changing identity. Frozen or
non-owned entities reject the command; retry after the persisted owning-shard
assignment catches up.
`CompositeVisual` remains public across the existing visibility/replication lane;
interior visuals, equipment state and individual crew data retain their private
lanes. No new replicated component or gameplay persistence shape is introduced.

2026-09-06 live finish acceptance: all six Wayfarer source blueprints passed the
canonical publisher. Both existing character ships received the 42-part exterior
through durable owner-shard receipts, with physical assembly, mass, private deck
and crew state checked unchanged. Idempotent replay and stale-edit conflicts were
verified. A full stack restart retained both finishes; the native renderer showed
the new exterior on nearby ships while keeping the player's walking view private.

2026-09-06 browser acceptance: the checked-in Playwright tests cover tile move /
rotate / delete, full undo/redo and history across document switches, text and
decal edits, and block collider rotation/undo. The live finish test applies a
change, observes a durable receipt, restores the published finish, verifies
physical definitions/private interior unchanged, replays safely, rejects stale
expectations, rejects a mismatched hull and rejects an untrusted browser origin.
Runtime fuel burn may legitimately change loaded mass during these operations;
compiler tests prove that cosmetic edits do not change its physical inputs.

## Live instance refits — 2026-09-07

The explorer identifies modular ships by `hull_assembly` and opens the live V2
canvas. Legacy ships retain their existing editor. The gateway's authenticated
`GET/POST /admin/dashboard/entities/{uuid}/hull-editor` reads a source snapshot
or queues a dedicated refit using the existing authoring operation store. There
is no direct graph or BRP authoring mutation. Read requires
`dashboard:entity:read`; applying requires content write authorization. Dashboard
proxies retain exact-origin CSRF protection.

`HullAuthoringState` stores canonical blueprint/block/class JSON plus fitting
UUID bindings and the last refit's removed fitting IDs and request hash. It is
server-only, persisted through generated component hydration, and never replicated
to players. New hull births include it. An existing hull without this state may
open its published source only if resolved structure and every fitting's geometry
match exactly; the editor refuses to guess a divergent construction layout.
On every open it verifies resolved structure, fitting geometry and exterior. An
exterior applied through the older published-finish action is adopted only when
the published finish exactly reproduces the live visual; unknown visual overrides
must be reconciled before opening, so the canvas never silently replaces them.

The editor snapshots expected assembly, exterior and authoring source on open.
The gateway pins existing block and class definitions to that source, takes new block types
from the published catalogue, validates all assets/rules, and assigns fresh UUIDs
to new fittings. Editor-only placement keys survive undo/move/delete and are
stripped before either instance submission or blueprint publication. Existing
fitting UUIDs are retained through reordering and movement. Undoing a previously
saved removal creates a new fitting UUID; permanent deletion records are retained.

The owning shard validates the entire refit before mutation: expected values,
compiled geometry, unique fitting bindings, owner-shard residency, load completion,
and crew safety. It rejects removal of loaded fuel/cargo containers, occupied
seats, dependent fittings or an occupied/obstructed walking floor. Seated crew
follow retained seat identity when array indices change. Admitted players and
private interior delivery remain intact. Existing fitting health, fuel, inventory
and behavior state survive; new fittings use their published initial components.
Root UUID, owner, motion, control, personal name and runtime settings stay intact.
Derived mass, inertia and compound collision are rebuilt with the new aggregate.

An aggregate persistence barrier prevents periodic/critical snapshots and handoff
from splitting an unacknowledged refit. The operation persists root, fittings,
crew changes and permanent removal records as one graph mutation, then acknowledges
`durable`; ordinary persistence resumes afterward. Replay does not reapply inputs.
A rejected/stale command changes nothing. The applied receipt remains distinct
from the durable receipt. Reloading the editor discards unpublished local changes.

DR-0040: the root's owning shard owns the operation and all affected crew/fittings;
frozen roots, foreign/frozen fittings and crew reject it. Handoff waits for the
aggregate's persistence acknowledgement, then transfers source state and identities
in canonical snapshots. Source/receipts remain server-only, private fittings retain
whole-entity owner visibility, public exterior/collision changes use the existing
replication lane, and deck updates use the private crew lane. The client transport
schema is unchanged; the internal persistence service protocol advances to v3.
Windows and WASM use the same existing modular rendering/prediction components.

2026-09-07 acceptance: browser coverage opens the selected ship through the
explorer context menu, applies lettering, reconciles an older published finish,
removes/recreates an engine with permanent identity retirement, checks reduced
live mass, rejects stale expectations and untrusted origins, and verifies that
published hulls are unchanged. The fixture ship is restored after the test.
Owner-shard tests cover occupied floors/seats, loaded containers, retained state,
new physical thrusters, snapshot barriers and replay. An isolated graph test
checks atomic rollback and prevents delayed snapshots resurrecting removed IDs.
A full public stack restart preserved all 111 fixture placements and 20 fitting
UUIDs; BRP confirmed the owner shard rehydrated the exact authoring source.
Workspace formatting, strict Clippy, compile checks, Windows/WASM checks,
dashboard type/lint/build/unit checks and canvas browser regressions passed.


## Room boundaries, airlocks and editor layout — 2026-09-07

Shipyard 2.8 uses a vertical canvas tool strip and a right-drawer layer list
(markings, equipment, structure), with independent visibility and selection.
Undo/redo retains complete per-document snapshots without visible history lists.
All placement controls live in the floating Parts / Exterior finishes palette.
Dragging a part onto the canvas validates grid bounds and same-layer occupancy;
right-click selects the tile and offers rotation/deletion. Invalid construction
remains a draft and cannot publish.

Walkable block definitions may name a `wall_asset_prefix`. The compiler builds
one perimeter junction per lattice vertex from the union of walkable floor cells,
using NESW half-edge masks. Shared floor edges disappear, outer and reentrant
corners are single sprites, and holes remain enclosed. The dashboard uses the
same deterministic geometry. The Blender kit's existing square and multi-cell
angled armour assets are available as real construction blocks across all six
faction themes. Their footprint, collision geometry and mass compile normally.

An equipment block may define an eight-frame `interior.airlock` plus its intrinsic
rotation and travel duration. Horizontal and vertical variants include a walkable
threshold and compile into the hull's persisted `InteriorDoors`. Door details,
E actions, animation, obstruction and disclosure rules are in the crew contract.

Live refits normally retain pinned block definitions. The explicit gateway
`refresh_definitions: true` request uses current catalog definitions for the same
layout. It retains the standard expected-value checks and durable aggregate
receipt; it does not silently change existing ships when a catalog is edited.
Surviving airlocks retain openness and target state by fitting UUID, even when
component indexes change. Refits reject layouts trapping an occupant inside a
closed doorway, and persist root, fittings and affected crew atomically.

2026-09-07 editor duplication: hold Ctrl (or Cmd) before dragging a placed tile to copy the active-layer selection. The gesture preserves source placements, facing and authored mount loadouts, assigns fresh local editor keys, and commits once on release. Rotated footprints must fit the grid and avoid same-layer occupancy; invalid or cancelled drops leave document history unchanged. Copies become the current selection, with undo/redo through the existing document history. This copies authoring placements, not live entity UUIDs, crew, cargo or other runtime state. Live refits continue through the unchanged owner-shard command and persistence-receipt path. Native/WASM game clients and transport are unchanged.


2026-09-07 Shipyard 2.12 update (supersedes the preceding copy/drop occupancy rule):

- Palette, move and copy drops replace whole intersecting placements in the same editing domain, including rotated multi-cell footprints, as one undo step. Bounds and dragged-group self-overlap are still rejected. Ctrl-copy preserves its source; drops intersecting source placements are rejected. Mount loadouts move/copy with their placements; replaced mount loadouts are removed. Editor keys survive moves and flips; copies get new keys and never clone live fitting identities.
- Right-click cancels an active selection, drag or placement brush without making a document edit. With nothing selected, right-clicking a tile opens its rotate/flip/delete menu. Escape also cancels the brush. F reflects horizontally, Shift+F vertically; Home fits the view. Mirrored placement facings are `FN`, `FE`, `FS`, `FW`: local-X reflection followed by the named cardinal rotation. Attachment/clearance edge declarations remain cardinal `N/E/S/W` only. The compiler reflects footprint, polygon winding, interior offsets, nozzle offsets and force axes consistently. Dimensions of physics modules remain positive; signed visual-part scale and signed marking size encode image reflection. Rendering bounds use magnitude. No component/wire field is added.
- The editor separates rooms/walls (including walkable airlock fittings), interior equipment, hull/armor and exterior hardpoints, alongside exterior roof and markings. Selecting a room/equipment layer exposes the interior; selecting roof/markings/hardpoints exposes the exterior. Eye buttons control visibility, with no separate view toggle. These are editing domains over the existing physical `structure`/`equipment` schema. Independent overlapping roof hardpoint occupancy and edge-authored internal partitions require the Phase 2 topology schema below; editor rows do not claim those mechanics are implemented.
- Server and dashboard validation require room floor under every interior fixture cell, and keep physical directional engines outside the structural footprint. Existing rotated attachment and exhaust-clearance rules still apply. Ordinary fixture/airlock overlap remains rejected by equipment occupancy. These checks run through the canonical hull validator for publication and owner-shard live refits, not only the canvas.
- Live drafts use `sessionStorage` scoped by authenticated account UUID and live entity UUID. They contain authoring history, its cursor, the original expected-value baseline and editor-to-fitting bindings; no credentials/tokens are stored. Refresh and returning to the same ship restore the draft without applying it. The current server context still supplies catalog definitions. A changed world snapshot is flagged; restoration never rebases expected values automatically. Durable Apply clears a clean draft, while edits made during Apply remain protected against the newly acknowledged baseline. Discard draft and reload clears only that ship/account draft. Closing the tab ends ordinary session storage lifetime; this is not a cloud draft or world save.
- Storage quota fallback retains the current draft plus its conflict baseline/bindings while dropping only stored history, with a visible warning. If even the draft cannot be stored, the UI explicitly warns that refresh protection failed. Malformed/unknown-version storage is not used or overwritten automatically.

Distribution: the existing owning shard retains authority over hull/module/crew state. Refits continue through aggregate persistence receipts and handoff barriers; session drafts never cross that boundary until explicit Apply. Public exterior visuals and authorized private interior delivery keep their current redaction lanes. Native and WASM renderers already accept signed transform scale; no new replicated field or protocol version is required. Reflected authoring is compiled on the updated backend.

### Continuous roof skin — 2026-09-07 (Shipyard 2.13)

The public roof now consists of fully opaque, flush rectangular skin panels with
narrow butt seams, plus perimeter trim derived from the complete walkable deck
union (including walkable airlock fittings). The partition into large plates
never determines the perimeter. Shared edges receive no rim; the canonical
N/E/S/W + NE/SE/SW/NW neighbourhood selects one corner-owning overlay per boundary
cell. Diagonals count only when both adjacent side cells exist: 46 nonempty rim
variants, with the fully surrounded configuration omitted. Diagonal islands do
not connect. Inward corners and holes retain their proper trim, and no overlay
extends outside its covered cell. The dashboard preview matches the shared hull
compiler, independent of placement order and duplicate floor coverage.

Roof panels contain metal facets and narrow seams only. Identification paint,
hazard marks and lettering remain independently selectable, movable, rotatable,
flippable and deletable `HullVisual.markings` in the Markings layer. Disabling
that layer exposes a clean skin. There are no baked stripes, protruding coupling
teeth, repeated service vents or transparent gutters in the generated roof kit.
All six faction palettes share the same connection geometry. New art stays at
64 pixels per cell, with binary alpha and nearest sampling.

There is no new gameplay component or wire schema. The owning shard applies the
compiled public `CompositeVisual` via expected-value authoring commands and
canonical persistence receipts. It hands off with the root snapshot; visibility
across shards uses the existing public entity lane. Private interior/crew lanes
remain unchanged. Physics, fitting identities, cargo and source blueprint layouts
are independent of this cosmetic finish. Existing live visual snapshots require
an explicit guarded finish refresh when the compiler changes; restarting alone
must not silently rewrite them. Native and WASM use the existing sprite renderer.


## Roof turrets — 2026-09-07

Shipyard 2.14 adds the physical `roof` plane. Roof devices can overlap interior
fixtures, require complete structural support under every footprint cell, reject
angled partial-cell supports and airlocks, and cannot overlap another roof device.
They never bridge disconnected rooms. They contribute mass and inertia as actual
mounted modules, without adding interior walking obstacles.

Three pre-fitted guns are authored in each of the six palettes: light (240°/s),
twin (120°/s), heavy (45°/s). Their `TurretDrive` supplies traverse rate, arc,
muzzle offsets and firing tolerance. Twin guns alternate barrels. `BallisticWeapon` supplies RPM, damage, range,
projectile speed and audio; `AmmoCount` supplies finite magazines. A base image
and rotating head image are separate `TurretVisual` assets. `TurretState` holds
the authoritative angle relative to the immutable mount orientation. Artwork
is produced by `siderealctl art-turrets` through Blender MCP and the canonical
asset package pipeline. The old interior decorative turret is not a weapon.

The native and WASM clients send an optional f64 world cursor target in the
latest-wins input stream (wire version 23). Mouse-left or Space fires primary
weapons while piloting; mouse-left also retains existing target selection.
UI hover, console focus, unfocused windows and RPG/camera-only modes suppress
cursor aim. The server checks authenticated actor, target, control generation,
lease, freshness and live unique control-station occupancy. It turns barrels
only on fixed ticks and fires from their actual rotated muzzle when aligned,
healthy, off cooldown and loaded. Invalid or missing aim does not fire turrets.
Leaving a station clears transient aim. Client rendering never writes the pose;
client prediction does not spawn turret shots or consume their ammunition.
Projectile spawn notifications trigger immediate muzzle/audio effects without
duplicating the replicated projectile trail or replaying firing audio at impact.

A live refit uses the existing guarded aggregate operation and persistence receipt.
Moving/rotating a retained turret updates its physical mount and retains ammunition,
health, cooldown and angle; replacing it creates a new identity. Publishing a block
does not reset or silently refit existing ships. Power/fuel routing and powered
fire-control computers remain Phase 2 work; this milestone connects ship fire input.

DR-0040: the hull's owner shard owns turret pose, ammunition and firing. Fittings
freeze with their parent during handoff and travel in canonical snapshots with
stable UUIDs; transient aim is reacquired through a fresh valid input lease.
AOI delivery follows the visible parent. Public components expose the mount, art
and small changing angle; weapon configuration, drive settings and ammunition
are owner-only. Interior fixtures retain whole-entity owner-only visibility.
