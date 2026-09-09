# Complete game scope carried into the pivot

Status: Accepted direction; implementation staged
Last updated: 2026-09-08
Owners: Sidereal project

Implementation distinction (2026-09-09): this document specifies target gameplay. E operates current supported seats/devices; operational doors/airlocks and full pressure/traversal are construction work in progress, not implied by the control description below. See [current verification](verification.md).

## Product and scope status

A persistent multiplayer space RPG about inhabiting, building, operating and fighting with modular ships, exploring a galaxy, working industrial production chains and interacting with players, NPCs and factions. One authoritative server is the deployment target. The following is the retained destination scope; only the foundation listed in `implementation_plan.md` is scaffolded today.

### Characters, accounts and interaction

Accounts support multiple independently persistent characters. Retain account registration/login/recovery, sessions, MFA, admin roles/scopes and character selection/creation. Persist character progression, equipment, selections, control intent and local settings separately from accounts. Characters and NPCs are physical actors with local-frame poses, collision, appearance and action capabilities. TAB switches space-sim and RPG views; E operates a highlighted nearby seat, door, airlock or device, and exits an occupied seat. Actions have concise reach/permission/supply tooltips. View switching never grants control. RPG keeps the bow left and rotates the background consistently. A single interpolated parent transform drives cabin, actor and camera.

Health, stamina, carrying capacity, injuries/resistances, equipment-derived modifiers, engineering/medicine/weapon/piloting proficiency, oxygen, suit integrity and energy are staged features. Define downed/death/recovery/loot policy before enabling lethal combat; preserve player identity. Equipment includes helmet/head, suit/torso, hands, legs, feet, back, primary/secondary weapons and utility mounts. Pressure suits may occupy multiple slots; appearance derives from actual equipment, with cosmetic skin/hair/faction colors separate. Animation needs idle, walk/run, seated, use, tool/weapon aim, fire, reload, hurt/downed and later EVA thrust.

### Ships, stations and construction

Everything functional is installed content. No engine gives no thrust; no weapon gives no shooting; no tank gives no fuel storage. Ship and station architecture uses rooms/floors generating compartments and exterior walls, internal walls and horizontal/vertical doors/airlocks, equipment on valid floor, exterior armor and roof panels, surface hardpoints, independent markings, and utility routes. Angled/chamfered/long triangular/solid square hull shapes and correctly formed corners must connect without overlapping wall junctions. Roof skin joins across neighbors; seams and decals are independent. Equipment cannot overlap doors. Engines connect only by valid mounting faces, never the exhaust end. Surface turrets need supported mounts. Rotations/reflections transform footprints, clearance, ports, pivots and thrust vectors together.

Retain actual component mass, cargo/fuel/crew loads, center of mass and inertia. Moving cargo aboard conserves total mass while changing distribution. Stateful fittings/items retain UUID and damage/ammo/contents when moved or refitted. Assets include rocket and sci-fi engine pods in multiple sizes, side thrusters, airlocks, reactors, batteries, shield generators, computer cores, AI modules, scanners, turrets, tractors, cargo racks, crates, fluid/gas containers and external pods. Walkable multiplayer stations and ships use the same construction model. Boarding, docking, EVA, suits and multi-deck/vertical transitions are later milestones with explicit frame transitions.

### Control, flight and utility networks

An occupied live control station grants a character or NPC ship-control authority. Validate unique occupancy, actor/frame/station membership, liveness and current authority both on acquisition and input execution. Exit, death, destruction or disconnect revokes control and clears stale intent. A future powered AI module grants explicit owner remote manual control and go-to/stop/cancel orders, with a seated pilot taking precedence. Orders persist; manual intent expires. Losing AI power pauses orders and must not unexpectedly restart thrust.

Retain fly-by-wire thrust allocation, desired acceleration/rotation, attainable-axis reporting, force/torque from actual mounts, fuel consumption and conservation, boost/afterburner costs, braking/navigation and collision. Momentum remains when control or supply is lost. Fuel pipes and power cables are separate grid channels with typed ports, flow limits, junctions, valves/switches, capacity, damage and dry mass. Crossing routes connect only by explicit rules. Fuel is finite typed reservoir contents, power in watts, battery energy in joules. Graphs rebuild when topology changes. Deterministic allocation prevents two engines spending the same fuel. Black-start and brownout behavior are explicit. A powered computer core enables coordinated fly-by-wire; an authorized nearby actor can pulse a supplied engine locally without gaining general ship authority. Initial utilities are bounded flow networks, not a pressure/fluid solver.

### Combat, weapons and damage

External turrets mount above roofs, aim toward cursor-derived world targets, traverse at authored rates, and fire only within permitted arc/alignment, supply, health, ammo and cooldown rules. Retain light/twin/heavy families, recoil/impact/exhaust effects, projectile collision, damage, shields, armor and destruction/salvage. Personal weapons use actor-local origins and interior collision, never ship-target authority. Firing/reloading/repairing spends actual resources. NPCs obey the same action/control rules. Projectile visuals and sound may predict, while authoritative hits and damage remain server outcomes. Fair PvP latency behavior, friendly fire, loot ownership and combat logging need explicit decisions before public combat.

### Inventory, cargo and ownership

One canonical item instance/location model covers carried, equipped, installed, ground, free-space and crafting-escrow states. Definitions carry mass, stack policy, rectangular inventory footprint, allowed storage, equipment/installation/ground capabilities and pinned revision. Items may occupy different grid sizes and rotate. Inventory dimensions are distinct from physical world footprint. There is no persistent mouse-cursor item: a drag is a pending intent. Moves/splits/merges/swaps validate revisions and commit atomically; merging retires the emptied identity. Bags/crates have grids, payload limits, tag restrictions and bounded nesting; reject cycles and ancestor overload. Full containers retain contents through equip, carry, install and drop.

Loose liquids/gases exist in typed reservoirs; dispensing requires a compatible container and conserves mass. Filled canisters, batteries and loaded weapons initially do not stack. Large engines need freight storage/handling, not ordinary backpacks. Structural kits may be consumed into placements with material provenance; dismantling uses explicit salvage yields. Ship cargo summaries aggregate installed containers, never magic capacity. Equipment, inventories and reservoir contents contribute exactly once to actor/frame mass.

Ownership is character/NPC/faction based with explicit grants for discover, inspect, deposit, withdraw, rearrange, equip, install, operate, manage and transfer ownership. Reach and current frame access still apply. Faction membership/role and expiring session grants are checked at transaction time; revoke views on loss of access. Cargo scans grant disclosed knowledge, not withdrawal permission. Public appearance/equipped-weapon summaries do not reveal private inventories. Concurrent looting/trading/crafting must prove no duplication or loss.

### Industry, resources, crafting and economy

Preserve the full material and facility ladders in the original [resources contract](../reference/sidereal/docs/features/proposed/resources_and_crafting_proposal.md), including its exact item taxonomy and open policy questions. Extraction sources include asteroids, ice, wrecks, stations and anomalies. Depletion and inventory output commit together. Mining fracture is not automatically a free resource mint. Stages: mining/salvage/pumping → refining/chemistry → alloys/composites/synthetics → subassemblies → ships, modules, weapons, upgrades, ammunition, drones and faction gear.

Tier 0 includes iron/nickel/copper/titanium/bauxite/tungsten/chromite/cobalt/silica/carbon/sulfur/lithium/uraninite/rare-earth inputs, water/methane/ammonia ice, hydrogen/helium-3/nitrogen/brines/hydrocarbons, and Aetherite/Void Salt/Graviton Shale/Sunspine Coral/Phase Quartz/Neutron Dust/Mycelium Bloom/Cryoflora Resin. Preserve all tier 1 refined forms, tier 2–3 alloys/composites, tier 3–4 Voidsteel/Aetherium/Gravimetal/Phase Nickel/Sunforged/Neutronium and biotech families, and tier 5 Shadow Hull Plating/Arc-Circuit Assembly/Inertial Core Housing/Stellar Engine Casing/Citadel Armor/Symbiotic Ship Tissue. These are proposed content, not seeded economy claims.

Facilities have authored capabilities, inputs/outputs, recipes, duration, power/fuel, unlocks and queues. Pin recipe revisions for jobs; reserve inputs in escrow and make completion/cancel/recovery idempotent. Decide output-blocked behavior, quality, waste, partial refund and offline advancement. Short common chains and deeper faction chains remain the progression goal. Include trade goods, currencies with exact integer accounting, vendors/markets, player exchange/escrow, hauling, resource prices, faction recipe access and economy audit/anti-dupe tests. Prices and faction politics are authorable content, not hardcoded UI assumptions.

### Factions and NPC life

Separate visual families from political factions. Preserve six visual starting points: Frontier Industrial, Aegis Naval, Helix Research, Corsair Salvage, Verdant Logistics and Umbra Syndicate. The source themes record palette and shape language. Faction gameplay includes membership, roles, relationships/reputation, ownership, access to storage/ships/stations, trade and recipe unlocks, hostile/friendly/unknown disclosure, and NPC crews/fleets. Exact lore, diplomacy and standing thresholds remain authoring decisions.

NPC simulation uses hot/warm/cold fidelity based on authoritative relevance, combat and pending operations. Cold means less simulation, never deleting durable NPCs. Persist behavior/orders/progression/inventory; use reproducible coarse advancement where defined. Crew tasks, piloting, engineering, trading, patrol/mining and combat consume the same permissions and equipment as players. Script-generated actions pass normal validation.

### Galaxy, exploration and tactical instruments

Retain a continuous f64 galaxy plane, systems/stars/planets/moons/stations/belts/anomalies, inter-system travel, authored zones and procedural background/celestial appearance. System membership is a reference rather than a transform parent; ship interiors are actual local frames. Discovery and explored fog persist; live visibility expires. Asteroid fields use deterministic generation, bounded activation, mutable damage/depletion, procedural meshes and staged destructible/voxel fracture. Planet/asteroid material tools remain part of authoring.

The M tactical map supports pan/zoom, meaningful scales, known landmarks, own fleet, current selection/focus, waypoints/orders, stale last-known contacts, exploration fog, authorized faction relationships, and gravity-well grid effects for disclosed bodies. A lightweight scanner ring is separate; assign a new rebindable key because TAB is view switching. Scanners are installed capabilities. Preserve Basic/IFF/Classified/Telemetry disclosure, signal strength/quality, unknown contact identities, density/direction capability, active scans, countermeasure resistance, field-specific grants and expiry. Camera movement never widens authority. An unknown contact must not expose true UUID/type/location precision/affiliation through another table. An owned-fleet locator need not imply full remote interior access or piloting permission.

### UI, communications, audio and accessibility

Create new dedicated components: HUD instruments, target/intel panel, tactical map/ring, ship/system status, action prompt, fleet/crew roster, inventory grids, drag ghosts, equipment paper doll, contextual actions, tooltip/reason, crafting queues, recipes, cargo/trade views, chat, dialogs, notifications, progress, text/number inputs, trees, tabs, dockable/resizable panels and editor tools. Share behavior and tokens between game and dashboard while allowing different density. Keep focus/input arbitration, keyboard navigation, rebinding, touch targets, contrast, reduced motion, color-independent signals, UI scale and gamepad planning. Avoid permanent help frames and visible undo history; retain undo capability.

Proximity text chat is server-recipient filtered by distance/frame, with explicit local/ship/faction/party channels, moderation/rate limits and retention policy. Ship radios and intercom can be later installed capabilities. Audio retains buses, positional sounds, music, engine loops, weapon cues, transitions, surface/interior occlusion and authorable cue metadata. Audio/subtitles must not leak hidden entities. Streaming, texture/mesh caches, preloading, quality controls and error recovery are product features.

### Dashboard, live authoring and operations

Rebuild every route family listed in [authoring.md](authoring.md): accounts/admin/security, live world explorer, baseline Firmament, Genesis, Shipyard, entity instances, Foundry, asset/Blender Atelier, material/shader workshop, Sound Studio, scripts/lifecycle, metrics and settings. Preserve live versus baseline separation, permanent deletion provenance, revision conflicts, dry-run validation, receipts and audit. The whole project includes an AI/MCP asset pipeline, preview/validation/publish, independent developer tools, deployment/recovery, versioned assets/schema, telemetry and acceptance fixtures.

## Source map

All originals are under `reference/sidereal/docs`. Principal retained documents:

| Domain | Source paths relative to legacy docs |
| --- | --- |
| Product, coordinates, authority | `architecture/sidereal_design_document.md`, `decisions/dr-0035_f64_world_coordinates.md` |
| Crew/control | `features/active/crew_interiors_contract.md` |
| Construction | `features/active/ship_construction_blocks_contract.md`, `features/active/shipyard_ship_authoring_contract.md` |
| Utilities/AI | `plans/proposed/building_blocks_phase_2_utilities_and_control_plan_2026-09-07.md` |
| Inventory/equipment/sharing | `features/proposed/character_inventory_and_interaction_proposal.md` |
| Crafting/resources | `features/proposed/resources_and_crafting_proposal.md` |
| Factions/AI | `features/proposed/npc_simulation_lifecycle_proposal.md`, `features/proposed/background_world_simulation_proposal.md` |
| Flight | `decisions/dr-0034_fly_by_wire_thrust_allocation_and_gnc_stack.md`, `features/proposed/fly_by_wire_thrust_allocation_proposal.md` |
| Map/scanners/intel | `features/active/tactical_and_owner_lane_protocol_contract.md`, `features/active/target_intel_and_scanner_disclosure_contract.md`, `features/active/visibility_system_v2_signal_detection_contract.md`, `decisions/dr-0018_fog_of_war_and_intel_memory_model.md` |
| Universe/asteroids | `features/proposed/galaxy_world_structure_proposal.md`, `features/active/asteroid_field_system_v2_contract.md`, `decisions/dr-0052_destructible_voxel_asteroid_bodies.md` |
| Authoring/baselines | `features/active/dashboard_game_authoring_runtime_contract.md`, `decisions/dr-0054_universe_baseline_vs_evolved_world_separation.md`, `systems/dashboard_systems_catalog_v1.md` |
| Scripts/assets/audio | `features/active/scripting_support_contract.md`, `features/active/asset_delivery_contract.md`, `features/active/audio_runtime_contract.md`, `guides/blender_space_asset_pipeline.md` |
| Complete remainder | [Every document and its preserved status](source_inventory.md) |

Earlier implementation status stays historical. Engine-specific completed plans are reference, not gameplay deletions. Original open design questions remain open unless this pivot explicitly decides them.
