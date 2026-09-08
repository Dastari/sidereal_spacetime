# Building Blocks Phase 2: Installed Abilities, Utilities and Remote Control

Status: Proposed
Lifecycle: proposed
Category: plan
Last updated: 2026-09-07
Owners: gameplay + construction + replication + dashboard + content
Scope: Installed-component capability derivation, grid fuel/power connections, computer cores, AI remote control and direct device operation.
Source of truth: yes
Supersedes: n/a
Superseded by: n/a
Primary references:
- docs/features/active/ship_construction_blocks_contract.md
- docs/features/active/crew_interiors_contract.md
- docs/decisions/dr-0050_block_based_ship_construction.md
- docs/features/active/dashboard_game_authoring_runtime_contract.md
- docs/decisions/dr-0040_distribution_and_persistence_authority_model.md

## 0. Status and delivery boundary

2026-09-07 inventory integration proposal: `docs/features/proposed/character_inventory_and_interaction_proposal.md` defines the recommended shared item/container identity, portable canister refilling, cargo mass and installed-device transitions. Coordinate its reservoir and transaction schema with this plan; avoid separate consumable balances in cargo, crafting and utility networks. This link adds design guidance, not implemented behavior.

2026-09-07: User-approved direction; the work packages below are not implemented.
Finish the current E/TAB and occupied-station authority release first. This plan
is the next construction phase, not a claim that a cable layer or AI module already
works in the released game. Follow the architecture checklist's authority,
persistence and prediction prerequisites throughout.

The desired ship is an assembly of functioning installed equipment. Artwork,
category names, hull type and account ownership never confer a physical ability.
A control seat grants local piloting permission. An explicitly installed,
operational AI module can additionally grant **owner remote manual piloting and
navigation orders**. Utilities determine whether the permitted action can actually
run. Permission and device readiness are distinct checks; both are required.

## 1. Current code and gaps

| Area | Verified current implementation | Phase 2 change |
| --- | --- | --- |
| Compilation | `block_registry.rs`, `hull_compile.rs` compile linked components and stable mounted fitting identities. | Make installed capability providers exhaustive; reject unknown behavior payloads. |
| Flight computer | `hull_spawn.rs` currently adds a root `FlightComputer` and broad action capabilities to every ship. | Derive fly-by-wire from an installed, working computer core; eliminate automatic capability grants. |
| Propulsion | `hull_propulsion.rs` allocates only fitted directional thrusters and respects engine health/fuel. | Each engine consumes only fuel reachable through its connected network and satisfies its own power requirements. |
| Fuel | Fuel tanks are currently pooled by parent UUID; disconnected tanks are indistinguishable. | Isolated networks, finite flow and shared-supply allocation. No tank/content/path means no supplied fuel. |
| Power | `BlockPower` supports construction budgets, not runtime electrical delivery. | Explicit source/storage/cable/consumer operation, capacity, charge and brownout handling. |
| Weapons | `combat.rs` resolves real mounted weapons; visible weapon art is not a functioning weapon. | Compile supported weapon blocks into actual mounts and gate firing on health, ammunition and utilities. |
| Control | Shared `crew_control.rs` checks real station occupancy; server routing derives from it. | Add a typed AI-module permission source without weakening local station checks. |
| Editor/refits | Shipyard V2 has canvas layers/history and atomic owner-shard live refits. | Add utility routing and diagnostics to that same document/history and persistence transaction. |

Do not solve missing equipment by spawning a hidden engine, tank, core, generator
or weapon during login, hydration or control acquisition. Runtime root components
are derived execution state, not independent equipment inventories.

## 2. Ability and permission matrix

| Action | Permission source | Installed/operational requirements |
| --- | --- | --- |
| Local fly-by-wire | Unique occupied control station | Working powered computer core; only supplied engines enter allocation. |
| Remote manual piloting | Authenticated owner and live AI-module grant | Working powered AI module and computer core; supplied engines. |
| Remote go-to / stop / cancel | Same AI-module grant | Persisted owner-shard order; powered core and available propulsion. |
| Direct engine pulse | Authorized nearby character interacting with that engine, or a separately declared remote device capability | Real engine, fuel path and fuel; device-specific utilities. No computer core or ship-level fly-by-wire lease required. |
| Fire a weapon | Valid station/AI control grant or an explicit authorized local device interaction | Actual installed weapon, valid firing arc/mount, health, cooldown, ammunition and required power. |
| Store fuel | Authorized inventory/refuelling interaction | Installed compatible tank with free capacity. Fuel is contents, not capacity. |

No engines means zero commanded thrust/torque. No weapon means no projectile.
No tanks means no onboard fuel storage. No core means no automatic stabilization,
braking allocator or coordinated ship controls. A partial engine network can
produce limited/asymmetric thrust; do not require every engine to be online to
move. Report unavailable axes and reduced stopping/turning capability.

The direct-engine path is a deliberate **device interaction**, not a bypass that
gives an unseated player general ship control. A fuel-fed engine with a mechanical
local ignition mechanism can work without electrical power/core; devices that
declare powered pumps/ignition still need those supplied. Content declares this
distinction explicitly. Direct firing applies the actual mount force and torque;
it does not teleport or set the body's velocity.

## 3. Canonical construction and runtime data

Extend the block schema with typed capability providers and utility ports. A port
has a stable local key, medium/type, local grid anchor/facing, input/output/bidirectional
role, compatible resources and capacity. Installation resolves port positions
using the block's full footprint and rotation. A painted decal never counts as a
port or functioning device. Separate visual skins from functional definitions.

Add a **utilities layer** to the hull source document, with separate power and
fuel channels. Routing uses the existing grid convention, including its supported
subcell positions. Segments have stable placement keys, channel, path, capacity,
health and dry mass. Endpoints reference fitting UUID plus port key at runtime;
blueprints reference placement key plus port key. Junctions and valve/switch states
are explicit. Crossing lines do not connect unless the channel and junction rule
permit it. Fuel and power may occupy the same grid cell on distinct channels.

Proposed runtime component names are design vocabulary, not existing symbols:
`UtilityTopology`, `UtilityPort`, `FuelReservoir`, `PowerSource`, `PowerStorage`,
`ComputerCore`, `AiControlModule`, and derived `DeviceOperationalState`.
Retain stable fitting UUIDs; do not create an ECS entity for every tiny cable pixel.
Persist topology in the hull aggregate and stateful equipment on its fitting
entities. The generic graph/connectivity mechanism belongs in the engine; fuel,
electrical consumption, IFCS and space content decoders belong in Sidereal.

Persist reservoir amounts, battery energy, generator consumables, valve/switch
state, damage and active navigation orders. Rebuild connectivity caches and
readiness after hydration. Count stored fuel, equipment, cables and containers
once in mass, center of mass and inertia. Never duplicate fuel into an independent
ship-wide total; totals are derived views.

## 4. Fixed-tick utility simulation

1. Invalidate/rebuild affected connected networks on construction, damage,
   removal, valve or switch changes. Avoid a full topology traversal per engine.
2. Determine available source supply and device demand using fixed-step time.
3. Allocate electrical power deterministically across bounded networks, respecting
   source output, cable limits, battery charge/discharge and declared priorities.
   Define black-start behavior explicitly (charged battery or a self-starting
   source); generators must not receive free power to escape a dependency cycle.
4. Calculate demanded fuel from the accepted actuator commands, then allocate
   only reachable compatible fuel subject to tank/outlet/pipe limits. Multiple
   engines sharing a source must not each spend the same fuel. Stable-ID ordering
   and a documented fair allocation rule make contention deterministic.
5. Produce per-device delivered rates and availability. Debit actual consumed
   fuel/energy once, apply actual forces/shots, and update mass and output visuals.

The first version is a bounded network-flow model, not a fluid-pressure simulator.
Pipe capacity is kg/s; stored fuel is kg. Power is watts; battery energy is joules.
Document tolerances and conservation tests. Optional line-volume/pressure,
coolant and atmosphere systems are separate later scope.

A disconnected core immediately loses fly-by-wire. An empty battery/broken cable
can cause a brownout; unpowered devices neither execute queued actions nor grant
control. Define hysteresis only for presentation/status stability, never as free
energy or an interval of unauthorized control. Existing momentum remains physical.

## 5. AI remote control and direct interaction security

Represent the server's active grant as a typed source: occupied station or an
installed AI module UUID. The owner shard validates the actor identity, current
ownership, target/module membership, device health/readiness and current grant
generation. Revalidate both acquisition and consumption. Clients submit intent;
they cannot announce that a module is powered or request arbitrary component writes.

Removing, destroying or depowering the AI module, changing ownership, or losing
the route invalidates its remote manual lease and clears old input. A physically
seated pilot takes priority; remote control cannot silently steal that seat's
authority. Explicit handover/cancel commands serialize on the owner shard. NPC
station pilots follow the same occupancy and equipment checks as player pilots.
Keep the active actor/control source separate from the ship owner and transport
subscriber. Player input draining must not neutralize legitimate NPC/AI commands;
clear stale intent atomically whenever the actual controlling source changes.

Go-to orders have stable IDs, f64 destinations, issuer identity, expected revision,
status and cancellation semantics. Manual takeover cancels or explicitly pauses
the active order. Owner-issued autonomous orders may continue through owner
disconnect while the AI remains authorized and powered; remote manual inputs
expire under the normal watchdog. On AI power loss, pause the order and require
an explicit resume after power returns; never unexpectedly restart thrust.

Direct-engine commands reference one installed module UUID and carry a bounded
throttle/pulse duration, sequence and interaction generation. Verify actor access,
physical reach within the same frame, current module membership and available
fuel/required utilities at execution time. Expire held input, reject replay and
cap rate/duration. Local device interaction grants no permission to other engines,
weapons or the whole ship. Route it into the same actuator/fuel accounting path
as IFCS so simultaneous requests cannot duplicate force or resource consumption.

## 6. Shipyard V2 and live authoring

Keep the canvas, alpha checkerboard, detachable icon palette and existing full
undo history. Add a utilities layer toggle, power/fuel routing tools, port snapping,
rotate/delete/move operations, junction placement, valve/switch editing and
per-network visibility. A complete route drag is one undo action. Moving equipment
must either move compatible attached routes or report explicit dangling endpoints;
never silently reconnect through empty space.

Show meaningful diagnostics: “engine disconnected from fuel,” “tank empty,”
“core unpowered,” “cable capacity exceeded,” “no working core,” and “AI module
offline.” Highlight the relevant path and device on selection. Permit incomplete
designs to be saved as drafts; commissioning/spawn readiness is a separate check.
Disconnected equipment is a valid physical state with disabled abilities.

Use the existing owner-shard command, expected-value checks, application receipt
and persistence receipt for live refits. Include topology, equipment, contents,
crew/grant changes and permanent deletions in one aggregate persistence operation.
Hold ordinary snapshots and handoff behind its acknowledgement. Preserve module
identities and merge bases; never silently delete fuel, cargo or a seated character
because a wire or block was removed. Interior, exterior, fittings and utilities
remain independently editable layers of the same authoritative assembly.

## 7. Work packages and acceptance

| Order | Implementation | Required acceptance |
| --- | --- | --- |
| P2.1 | Canonical installed providers; computer-core fitting; remove unconditional root grants. | Remove each equipment type and prove its ability disappears; save/spawn/hydrate preserve the same result. |
| P2.2 | Typed ports, routing schema, compile/rotate validation, graph persistence and atomic refits. | Port alignment at every rotation, crossed-but-unjoined routes, dangling ports, edit races, rollback/undo and restart integrity. |
| P2.3 | Deterministic fuel networks and shared supply. | Disconnected/empty/wrong fuel, split networks, many engines sharing one tank, flow limits, conservation and mass parity. |
| P2.4 | Electrical networks, sources/storage, core readiness and brownouts. | Black start, isolation, overload, charge conservation, source failure and immediate IFCS loss without free braking. |
| P2.5 | Bounded direct device commands and client interaction UI. | Fuel-fed manual engine firing without a core; out-of-reach, forged module, replay and stale-hold rejection. |
| P2.6 | Powered AI-module grant, remote manual control and persisted navigation orders. | Owner/nonowner checks, seated-pilot priority, module/power loss, ownership change, disconnect/resume and handoff. |
| P2.7 | Utility canvas tools, connected starter design, live multiplayer acceptance. | Undo/redo all routing operations; fit/remove/reconnect while observed by two clients; matching native/WASM behavior and downloadable build. |

For schema cutovers update all canonical producers/consumers together; use the
documented explicit dev-world reset/reseed if needed, preserving accounts and
content. No compatibility aliases or automatic wire creation for existing ships.
Keep disconnected/incomplete assemblies loadable under the new canonical schema.

## 8. Distribution, privacy and validation

1. **Owner:** the hull owner shard owns equipment, utility solving, resource
   consumption, control grants and navigation execution. Player control/view
   state remains on the player ECS entity; accounts are authentication only.
2. **Handoff:** freeze the assembly and attached crew together; persist source
   topology, fitting identities, reservoirs, orders and deletion records before
   handoff. Rebuild derived graphs/readiness on the destination and issue fresh
   input generations. No simultaneous source/destination consumption or AI execution.
3. **Visibility:** private utility topology, fuel, power and grant internals stay
   in authorized owner/crew read models. Other shards/observers receive only the
   existing public body motion, hull appearance and actual exhaust/weapon effects.
   Ghosts do not run utility solvers. Remote owners obtain permitted state through
   the owning-shard route, never by giving private fittings public visibility.

Publish bounded operational summaries on change, rather than all cables every
tick. Native and WASM share simulation, readiness and actuator calculations;
prediction receives only the authorized state required for parity. Add bincode,
JSON and graph-hydration tests for every new replicated/persisted schema. Verify
fixed-step determinism, conservation, module removal during input, live refit
atomicity, two-client contention, and restart/handoff recovery. Keep the three
DR-0040 answers in each implementation change, not only this plan.


## 10. Room, envelope and installation topology clarification

2026-09-07 user direction: construction must distinguish compartments, interior
fixtures, edge attachments and roof hardpoints. This section is the Phase 2
implementation specification, not a claim that oxygen, internal partition editing,
roof sockets or routed utilities are operational. The current editor separates
these visual/editing domains, derives the exterior floor perimeter, and validates
floor support plus physical engine attachment/clearance. Implement the canonical
topology below before enabling independently overlapping installation planes.

| Domain | Canonical shape and placement rules |
| --- | --- |
| Rooms | Integer floor cells establish usable volume. Adding/removing floor recomputes exposed boundaries and room topology. Floors sharing an open edge join; solid partition edges separate rooms. Armor alone never creates habitable floor. |
| Walls, doors, airlocks | Store boundaries on canonical undirected grid edges with stable placement IDs. Auto perimeter walls follow floor changes. Authored internal walls occupy edges between floor cells, not the equipment plane. Doors replace a wall edge and declare aperture, approach/exit clearance, traversal and pressure-seal behavior. Airlocks are small compartments with independently operated doors, not a special teleport tile. |
| Interior equipment, cargo, stations | Full rotated footprint must be supported by room floor and remain inside its compartment. Occupancy and approach/service clearances cannot intersect doors, passage apertures, walls or another fixture. Cargo contents remain separate inventory state and contribute mass once. Control stations derive authority only from valid occupancy. |
| Outer armor/panels | Physical armor attaches to the envelope and contributes real mass/protection. Angled silhouettes remain independent of room boundaries. Cosmetic roof finish has no implied armor, pressure seal or device capability. Model physical attachment and render order separately. |
| Edge-mounted engines/devices | Typed rear/side mounting faces must match an exposed hull/room boundary socket. Exhaust faces cannot be mounting faces; the transformed exhaust clearance must face exterior space and avoid all relevant collision planes. Full footprint and nozzle-clearance geometry transform with rotation/reflection. |
| Roof-mounted hardpoints | Explicit supported exterior sockets admit declared compatible device classes (turret, tractor beam, etc.), footprints, load and arc/clearance limits. They can project above room interiors without consuming interior floor occupancy, but cannot overlap other roof installations. Installing visible art is insufficient to create a weapon or tractor capability. |
| Utilities | Device ports and routed power/fuel channels belong to the same hull document and owner-shard aggregate. Every compatible installed device may declare ports; routes validate medium, port direction, capacity, connection and reachability after moving/rotating/flipping. Devices cannot infer supply merely from sharing a room or touching a tank/generator. |

Build compartment topology using a reusable engine flood-fill over floor cells
and barrier edges, with stable room identities reconciled deterministically on
split/merge. Closed or open doors retain their identity as portals between
compartments; opening a door changes traversal/atmospheric flow, not room identity.
Oxygen/pressure/temperature and actual fluid transfer follow in their own phase.
When those arrive, splits/merges must conserve gas/resource mass and energy,
never copy a room's full contents into each new compartment. Breaches connect to
exterior space; exterior armor is not automatically an airtight wall.

Moving or replacing a floor/wall/device previews all resulting invalid supports,
blocked door approaches, detached hardpoints and dangling utility endpoints.
A live commit validates the entire topology on the owner shard and persists it
atomically with affected modules, occupant relocations and permanent deletions.
No partial room refit can escape through an ordinary snapshot or handoff.
Replace-in-editor is reversible document intent; it does not authorize deleting
another player's inventory or executing a live refit before server validation.

Blueprint placement IDs become stable fitting/portal identities at installation.
Topology caches are derived; persisted room/door/utility/device state belongs to
the existing frame aggregate, following its owning shard and handoff freeze.
Expose public roof silhouettes/device effects through existing visibility lanes.
Interior layout, compartments, utility paths, reservoir contents and cargo require
authorized crew/inspection access; being able to see a ship externally never
grants access to its internal topology. All player/NPC interactions still validate
actor identity, reach, permissions and device readiness on the owner shard.

Delivery order: canonical floor/edge/socket/port schema and migration/reset of dev
content; shared topology compiler plus parity fixtures; internal wall/door and
mount editor tools; atomic live-refit integration; power/fuel simulation and device
readiness; then atmosphere. Tests must cover split/merge, internal/external doors,
all rotations/reflections, unsupported/outward-facing devices, separate roof and
interior occupancy, route invalidation, gas/fuel conservation and unauthorized
cross-shard inspection/mutations.
