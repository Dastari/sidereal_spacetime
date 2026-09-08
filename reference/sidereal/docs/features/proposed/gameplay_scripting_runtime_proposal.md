# Gameplay Scripting Runtime Proposal

Status: Proposed
Lifecycle: proposed
Category: feature
Last updated: 2026-06-15
Owners: scripting + gameplay simulation + replication + engine architecture
Scope: A first-class server-authoritative Lua gameplay runtime — lifecycle/proximity/interaction/combat hooks, read-only world + spatial/range queries, entity identity access, runtime spawning, quest + dialogue + inventory/marker authoring, and generic component access — so most gameplay can be authored in Lua over the engine + sidereal-game backbone, with every new mechanism placed on the correct side of the DR-0045 engine/content boundary. Includes an evaluation of whether the IFCS flight stack should move into Lua (conclusion: no).
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- docs/features/reference/scripting_support_reference.md
- docs/features/active/scripting_support_contract.md
- docs/decisions/dr-0051_gameplay_authoring_scripting_runtime.md
- docs/decisions/dr-0045_engine_content_separation_achieved.md
- docs/decisions/dr-0040_distribution_and_persistence_authority_model.md
- docs/decisions/dr-0025_runtime_script_catalog_authority.md
- docs/decisions/dr-0034_fly_by_wire_thrust_allocation_and_gnc_stack.md
- docs/plans/proposed/spatial_partitioning_implementation_plan_2026-03-04.md
- docs/plans/active/ifcs_navigation_and_thrust_allocation_implementation_plan_2026-04-27.md
- docs/decision_register.md

Date: 2026-06-15

## 1. Goal & system label

`system.gameplay_scripting_runtime.v1` — turn the existing intent-only AI-handler
prototype into a full gameplay authoring runtime so content authors can write most
gameplay in Lua (entity behaviour, on-damage/on-destroy reactions, proximity
triggers, quests, dialogue, spawn/loot orchestration, weapon-platform logic),
relying on the engine + `sidereal-game` only for the simulation kernel (physics,
replication, persistence, rendering, damage/destruction lifecycle, flight/IFCS).

Author-facing pillars:

1. **Author an entity in Lua** — define any entity (asteroid, trigger volume, turret)
   with its visual/shader and any registered components + values.
2. **React via hooks** — lifecycle, proximity, interaction, combat, quest, dialogue.
3. **Inspect the world** — find entities by GUID / radius / filter, read identity
   (is this a player? whose?), components, quest + inventory state.
4. **Drive content** — spawn entities/items, grant cargo, run quests + dialogue
   trees, set map markers, command NPC/turret targeting — all intent-validated.

## 2. Why this is a proposal and not a fresh design

This capability is **already designed** and partially built — this proposal commits
to finishing it and fixes the one thing the existing design predates.

- The model (hybrid event-driven execution + read-only queries + intent-only writes),
  the event allowlist, the quest model (§8.6), the trigger-volume + blocking dialogue
  model (§8.8), and the runtime API (§8) are specified in
  `docs/features/reference/scripting_support_reference.md` and locked by accepted
  decisions **DR-0020/0021/0022/0024/0025**.
- The combat→script bridge **already emits** `damage_applied`, `health_depleted`,
  `before_destroy`, `destroyed` (reference §11.5.4) — but notification-only, opt-in
  per entity, with no act-on intents.
- Runtime `ctx` today is minimal (reference §11.5.3/§11.5.5): `find_entity` +
  `set_navigation_target`/`stop`/`set_script_state`, `script_state`-only component
  access.
- The default "asteroid shatters on death" is already a data-driven Rust path
  (`AsteroidFractureProfile`); hooks are the **escalation path for exceptional
  behaviour**, not where defaults are re-implemented (reference §2.3.1).

**The gap**: the full event bridge (Phase C), the runtime query/spawn/identity/
component API + widened intents (Phase D), quests/dialogue/markers (Phase D1 + §8.8),
and the AI/combat intent surface (Phase E) are unbuilt — and the reference predates
DR-0045 (2026-06-03), so it places everything in `crates/sidereal-scripting`, a
crate that was renamed to `engine-script` when the workspace split into 17
project-agnostic `engine-*` crates vs. `sidereal-game` + `data/`. This proposal's
primary new contribution is **§5: the engine/content placement** for every piece —
including quests, dialogue, inventory, and markers, which the pre-boundary reference
never assigned — so the work lands clean and the deletion test stays green.

## 3. Scope

In scope (V1):

- Full Rust→Lua event bridge: declarative handler registration, per-tick
  `ScriptEventQueue`, dispatcher with per-handler budget + isolation + observability.
- Inbound hook catalog (§4.1): lifecycle, proximity/trigger-volume, interaction,
  perception, combat/threat, quest lifecycle, dialogue response, session/world.
- Read API (§4.2): entity identity (player vs NPC + owner), generic component read,
  spatial/range queries, distance, raycast, time, RNG, quest + inventory reads.
- Command set (§4.3): spawn/despawn, apply_damage/heal, play_sound/spawn_effect,
  apply_impulse, set/patch_component, grant/consume/transfer item, quest + dialogue
  + marker intents, NPC/turret targeting + nav intents.
- Quest + player-progression data model (§8) and dialogue/conversation system (§9).
- Distribution authority per DR-0040 for every new stateful surface (§6.1) and
  deterministic simulation-time + seeded-RNG semantics (§6.2).
- The engine/content placement (§5) applied throughout.

Out of scope (deferred / separate):

- The spatial partition grid itself (a **hard dependency** of radius/trigger-volume
  queries) — `docs/plans/proposed/spatial_partitioning_implementation_plan_2026-03-04.md`.
- Modding/publish pipeline, hot-reload tooling, dashboard script editor (reference
  F/G/I; catalog substrate already exists, DR-0025/0026).
- Client-side presentation scripting — rejected for V1; all hooks run
  server-authoritative (§6). Visuals/audio/dialog/markers reach clients via
  replicated payloads.
- Moving the IFCS flight stack into Lua — evaluated and rejected (§10).

## 4. The expansive hook & API catalog

Status legend: **[live]** today, **[partial]** prototype exists, **[new]** to build.
Concrete payloads for already-specified items live in reference §5.4, §8, §8.6, §8.8.

### 4.1 Inbound hooks (events dispatched into Lua)

Each fires only for entities/handlers that declare it (opt-in keeps the 60 Hz path
free). "Source" names a real system today where one exists.

| Hook (Lua fn) | Status | Source / trigger |
|---|---|---|
| `on_spawn` | [new] | post-spawn bridge |
| `on_damage` (`damage_applied`) | [partial] | `apply_damage_from_shot_impacts` (`sidereal-game/src/combat.rs`) |
| `on_hit` (`shot_impact`) | [partial] | `resolve_shot_impacts` / projectile raycast |
| `on_destroy` pre/post (`health_depleted`/`before_destroy`/`destroyed`) | [partial] | destructible lifecycle (`engine-gameplay`) |
| `on_collision` | [new] | Avian contact bridge |
| `on_enter_range` / `on_leave_range` | [new] | proximity system (needs spatial index, §12) |
| `enter_script_trigger` / `exit_script_trigger` (player-scoped) | [new] | trigger-volume system, per-player dedupe (reference §8.8.2/§8.8.4) |
| `on_interact` (`interaction_completed`) | [new] | interaction system |
| `on_gain_entity_visibility` / `on_lose_entity_visibility` | [new] | visibility/scanner (AI perception) |
| `on_tick` | [live] | interval scheduler (`runtime_scripting.rs`) |
| quest: `on_accept` / `on_event` / `on_tick` / `can_complete` / `on_complete` / `on_fail` | [new] | quest runtime (§8, reference §8.6.2) |
| `on_dialog_response_submitted` | [new] | dialogue runtime (§9, reference §8.8.3) |
| inventory (engine-generic): `inventory_changed`, `item_collected`, `item_delivered`, `container_changed` | [new] | inventory framework (`engine-gameplay`) |
| docking/economy (content): `docked`/`undocked`, `cargo_*` aliases | [new] | space dock/economy systems (`sidereal-game`) |
| session/world: `world_boot`, `player_session_start`/`end`, `system_enter`/`exit` | [partial] | startup/session/1 Hz context |
| custom (local script bus): `ctx:emit_event("script.<ns>.<name>", payload)` | [new] | script-defined; namespaced, **deferred to next tick**, budgeted (depth/fan-out cap), **not** part of the typed registry — see note below |

**`ctx:emit_event` guardrails.** Custom events are a *local script bus*, distinct
from the typed engine/content events that drive the API schema. They must be (1)
**namespaced** (`script.<ns>.<name>`) so they can never collide with registered
event kinds; (2) **deferred** — enqueued and dispatched on the next tick, never
synchronously re-entrant; (3) **budgeted** — a per-tick fan-out/recursion-depth cap
prevents script-event storms (a handler that emits an event that re-triggers it). A
custom event that needs schema/lint/cross-tool support must be promoted to a
registered `#[script_event]` (§11); the local bus is for transient script-to-script
signalling only.

### 4.2 Read access (what we expose to scripts)

All reads are point-in-time snapshots; no live ECS handles cross the boundary
(DR-0024). This is the "what access scripts need" surface, with placement.

| Capability | Surface | Status | Side |
|---|---|---|---|
| Entity identity: `guid()`, `labels()`, `is_player()`, `owner_player_id()`, `faction()` | `ScriptEntity` | [partial] — runtime already distinguishes player vs NPC (reference §11.5.6); expose it | engine (Account/Character is generic, DR-0001) |
| Kinematics: `position()`, `velocity()`, `rotation()` | `ScriptEntity` | [partial] (`position` live) | engine |
| Component read: `get(kind)`, `has(kind)`, `components()` via Reflect — **gated by `script_read` registry metadata (default-deny), honouring the kind's redaction/visibility policy** | `ScriptEntity` | [partial] — `script_state` only today | engine (`engine-ecs`/`engine-script`); policy on `#[sidereal_component]` |
| Spatial: `entities_in_radius(pos,r)`, `query_nearby(pos,r,filter)`, `nearest`, `get_entities_in_range(guid,r,filter)` | `ctx.world` | [new] | engine (`engine-spatial`/`engine-script`); **needs §12 index** |
| Raycast: `raycast(origin,dir,max)` | `ctx.world` | [new] (wraps Avian `cast_ray`, already used in combat) | engine |
| Distance: `distance(a,b)`, `distance_to_point(guid,pos)` | `ctx.world` | [new] (O(1) GUID lookup) | engine |
| Filters: `has`/`has_any`/`not_has`/`labels`/`faction`/`not_faction`/`limit` | query arg | [new] | engine (faction is generic, `VisibilityScope::Faction`) |
| Time (**simulation-tick, never wall-clock** — §6.2): `now_s()`, `world_accumulated_s()`, `player_accumulated_s(player_id)` | `ctx.time` | [new] | engine |
| Determinism (**seeded/persisted RNG scopes** — §6.2): `ctx.rand:next_*`, `ctx.state:ensure_once`/`cooldown_ready`, `mark_region_seeded` | `ctx` | [new] | engine |
| Quest reads: `get_player_active_quests`, `get_quest_instance`, `quest_objective_progress`, `has_quest(player,template)` | `ctx.world` | [new] | engine (quests are generic; see §8) |
| Inventory reads: `get_inventory`, `get_item_count`, `get_controlled_entity(player_id)` | `ctx.world` | [new] | engine (inventory + controlled-entity model are generic; `get_active_ship` is a content alias) |
| Mission/quest-scoped state: `ctx.mission:set/get/set_ref/get_ref`, `quest.data` | `ctx` | [partial-design] | engine |

### 4.3 Commands (outbound, intent-only — validated in Rust, DR-0024)

| Command | Status | Notes / placement |
|---|---|---|
| `set_navigation_target`, `stop`, `set_script_state` | [live] | current three |
| `spawn(blueprint, overrides)` / `despawn(guid, reason)` | [new] | despawn policy-gated; engine mechanism, content blueprints |
| `apply_damage` / `heal` | [new] | same `HealthPool` path as weapons (engine-gameplay) |
| `play_sound(profile,opts)` / `spawn_effect(profile,at)` | [new] | emits replicated effect/sound event; engine mechanism |
| `apply_impulse` / privileged `teleport_entity` / `batch_move_entities` | [new] | one-shot Avian override, audited (DR-0024) |
| `set_component` / `patch_component` / `remove_component` | [new] | gated by `script_patch` registry metadata (default-deny, per-field allowlist); identity/ownership/session/auth/motion-authority fields always denied |
| inventory: `grant_inventory_item` / `consume_inventory_item` / `transfer_inventory_item` | [new] | atomic, fail-closed (engine inventory framework) |
| quest: `offer_quest` / `accept_quest` / `abandon_quest` / `advance_quest_objective` / `complete_quest` / `fail_quest` | [new] | §8; engine quest runtime, content templates |
| dialogue: `start_dialog` (blocking/non-blocking) | [new] | §9; engine dialogue runtime, content node trees |
| markers: `set_quest_marker` / `clear_quest_marker` / `add_map_marker` | [new] | replicated marker payload to client UI (engine-ui mechanism, content binding) |
| combat/AI: `fire_weapons` / `set_target` / `set_ai_mode` / `orbit` / `fly_away_from` / `scanner_ping` | [new] | content intents (space weapons/flight) over engine intent framework |

## 5. Engine / content placement (the new architectural contribution)

RPG test (DR-0045, sidereal-engine-boundary): would a top-down RPG reuse this
unchanged? The *mechanism* almost always says yes (→ engine); the *named space
vocabulary* says no (→ content). Crucially, **quests, dialogue, inventory, markers,
triggers, and player identity are all generic RPG/MMO concepts → engine** (the
pre-DR-0045 reference put them vaguely in `sidereal-scripting`/`sidereal-game`).

| Piece | Side | Where |
|---|---|---|
| Event-bridge dispatch; intent-applier + allowlist framework | engine | `engine-script` |
| Read-only world API + `ScriptEntity` (incl. identity/`is_player`) | engine | `engine-script` (identity model from DR-0001 is generic) |
| Spatial/range/trigger-volume + proximity hooks | engine | `engine-spatial` + `engine-script` |
| Reflect component read/patch bridge + `script_read`/`script_patch` access metadata | engine | `engine-ecs` / `engine-script`; flags on `#[sidereal_component]` |
| Generic lifecycle events (spawn/damage/destroy) | engine | `engine-gameplay` |
| Generic blueprint→spawn (registered components, replicate/persist) | engine | `engine-script` + `#[sidereal_component]` registry |
| **Quest runtime** (template/instance components, objective counters, hooks) | engine | `engine-gameplay` (or new `engine-quest`); generic per RPG test |
| **Dialogue runtime** (`ActiveDialog`, node state, blocking input-gate, replicated tickets) | engine | `engine-gameplay` + `engine-ui` |
| **Inventory framework** + item-delivery tracking primitives | engine | `engine-gameplay`/`engine-ecs` (boundary doc lists inventory as engine) |
| **Map/quest markers** (replicated UI marker payload) | engine | `engine-ui` mechanism |
| Time/RNG/idempotency helpers | engine | `engine-script` |
| `ScriptState` generic component | engine | promote `sidereal_game::ScriptState` → `engine-ecs`/`engine-gameplay` |
| Space event *emitters* (`shot_fired`, fracture, loot, cargo, dock, scanner) | content | `sidereal-game` ("message catalog is content") |
| Space intent *handlers* (`fire_weapons`, `scanner_ping`, nav→IFCS) | content | `sidereal-game` |
| Item/weapon/quest/dialogue **content** (templates, node trees, blueprints, profiles) | content | `data/scripts/**` |
| Solar-system scoping; space-specific filters | content | `sidereal-game` |

Hard rule (DR-0045): no `engine-*` crate may depend on `sidereal-game` or name a
space concept. Generic event/intent/quest/objective *kinds* are content-registered
(string-keyed registry validated against an allowlist, matching the component-kind
pattern), never hardcoded in engine. The deletion test must stay green.

## 6. Authority & determinism model (server-authoritative only)

Decided for V1: **all gameplay hooks run on the authoritative replication host**
(DR-0020). No client-side scripting VM. Lua reads a per-tick snapshot and emits
validated intents Rust applies in a controlled phase (reference §2.7, §11.5.7);
hooks are not client-predicted; client visuals/audio/dialog/markers flow through
replicated payloads the client already renders. Budgets (instruction/memory/
wall-time/per-event) extend to the new surface; spatial queries get hard guardrails
(reference §8.2, §13). This server-only stance is exactly why IFCS cannot move to
Lua (§10).

### 6.1 Distribution authority (DR-0040)

AGENTS.md §3.4 requires every new stateful surface to answer: (1) which shard owns
it, (2) handoff behaviour, (3) cross-shard visibility + redaction — even now in the
single-shard milestone, so single-shard assumptions are not baked into the API.

| New state | Shard owner | On `ShardRegion` handoff | Cross-shard visibility / redaction |
|---|---|---|---|
| Quest instance / player progression (components on player entity) | shard owning the player (character) entity root | travels with the player via the standard final-snapshot → persistence → hydrate path | owner-only (`VisibilityScope::OwnerOnly`); never ghosted to other players/shards |
| Active dialog (`ActiveDialog` + dialog ticket) | shard owning the player | carried in the handoff sidecar so the blocking input-gate survives; else resolves to `default_choice_id` on retire | owner-only; the input-gate is re-asserted authoritatively on the target shard, never client-trusted |
| Map/quest markers | derived from player quest state → shard owning the player | re-derived from quest state after hydrate (not separately persisted) | owner-only; a marker may *point at* a position/entity in another shard (resolved via ghost / last-known) — a UI hint, not authority |
| Script-spawned entity | by the spawned entity's **root world position** (standard rule), not the calling script's shard | standard entity handoff | standard ghost lane + `Authorization → Delivery → Payload` redaction |
| Trigger entity + per-player dedupe/cooldown (`ScriptState`) | shard owning the trigger entity's region | travels with the trigger entity (persisted `ScriptState`) | trigger acts only on players **authoritatively owned by the same shard**; ghost-only players are ignored until handoff (mirrors "no cross-shard combat in V1", DR-0040 §2.4) |

Consequences baked into the API: (a) `spawn` resolves owner by spawn position and
routes a cross-region spawn to the **target** shard, not the caller; (b) trigger/
quest/dialog intents that mutate a player take effect only while that player is
authoritatively local; (c) cross-shard targeting/combat from scripts is rejected in
V1, exactly like native combat.

### 6.2 Deterministic time & RNG

Gameplay hooks must be replay/rollback-safe:

- `ctx.time:*` is **simulation time** (accumulated FixedUpdate tick time), never
  wall-clock. No `Date`/system-clock is exposed (the sandbox already strips `os`);
  wall-clock-derived behaviour in a hook is a bug.
- `ctx.rand` is a **seeded, persisted-scope** PRNG. Scopes are keyed by stable inputs
  (world seed + content version + a scope key: `entity` guid, `quest_instance` id, or
  `region` coords), so a scope yields the same stream across restart and
  re-evaluation. No global/ambient randomness is available, which makes procedural
  spawns and proc-chance triggers idempotent together with
  `mark_region_seeded`/`ensure_once`.

## 7. Worked scenario: trigger zone → quest → dialogue → delivery → weapons platform

This is the user's end-to-end example, mapped step-by-step to the surface above.
Most of it is already designed; the **gaps** are called out in §7.1.

| # | Author intent | Surface used | Status |
|---|---|---|---|
| 1 | Invisible entity that fires when something enters range | spawn a trigger blueprint (no visual); `on_tick` + `get_entities_in_range`, or `enter_script_trigger` event | [new] (reference §8.8.2A pattern) |
| 2 | Know the specific entity + whether it's a player | `entity:guid()`, `entity:is_player()`, `entity:owner_player_id()`, `labels()` | [partial] — identity exists internally; expose it |
| 3 | If player, check whether already on a quest | `ctx.world:get_player_active_quests(pid)` / `has_quest(pid, template)` | [new] (reference §8.7.1) |
| 4 | Trigger / offer a quest for that player | `offer_quest` / `accept_quest` intent | [new] |
| 5 | Launch the quest's Lua | quest module `data/scripts/quests/*.lua` with `on_accept`/`on_event`/… | [new] (reference §8.6.2, D1.5) |
| 6 | Read/store player quest progress | quest template/instance, persisted on player entity, replicated owner-only (§8) | [new] — decided by DR-0021; **placement decided here (engine)** |
| 7 | Dialogue interaction w/ conversation tree + multi-choice | `start_dialog{ nodes, choices, blocking }` → `on_dialog_response_submitted` | [new] (reference §8.8.3) |
| 8 | Update quest progress + add map markers | `advance_quest_objective` + `set_quest_marker` | [new] (advance designed; **marker intent is a new gap**) |
| 9 | Spawn items into cargo, or into the world | `grant_inventory_item(entity,…)` / `spawn(item_blueprint, {position})` | [new] |
| 10 | Track items delivered to a location | `deliver_item` objective + `item_delivered` (engine) / `docked` (content) events | [new] (reference §8.6.1/§8.6.4) |
| 11 | Weapons platform that targets players | static turret blueprint + `on_tick`/threat hooks + `get_entities_in_range` then `is_player()` / content labels (e.g. `Ship`) + `fire_weapons`/`set_target` | [new] (reference §8.6.6 threat-memory AI) |

Illustrative sketch (ties steps 1–8 together):

```lua
-- data/scripts/triggers/derelict_distress.lua
local T = { handler_name = "derelict_distress", tick_interval_seconds = 1.0 }

function T.on_tick(ctx, ev)
  for _, who in ipairs(ctx.world:get_entities_in_range(ev.entity_id, 2500, { limit = 64 })) do
    if who:is_player() then
      local pid = who:owner_player_id()
      if not ctx.world:has_quest(pid, "quest.derelict_distress")
         and ctx.state:cooldown_ready(ev.entity_id, "offer:" .. pid, 600) then
        ctx:emit_intent("start_dialog", {                    -- step 7: blocking tree
          player_id = pid, dialog_id = "derelict_intro", blocking = true,
          timeout_s = 45, default_choice_id = "decline",
          nodes = { { id = "root", text = "...mayday...will you help?",
            choices = { { id = "accept", text = "We'll help." },
                        { id = "decline", text = "No." } } } },
        })
      end
    end
  end
end

function T.on_dialog_response_submitted(ctx, ev)            -- step 4/5: launch quest
  if ev.dialog_id == "derelict_intro" and ev.choice_id == "accept" then
    ctx:emit_intent("accept_quest", { player_id = ev.player_id,
                                      quest_template_id = "quest.derelict_distress" })
  end
end
return T
```

```lua
-- data/scripts/quests/derelict_distress.lua  (step 6/8/9/10)
local Q = { template_id = "quest.derelict_distress" }
function Q.on_accept(ctx, q)
  ctx:emit_intent("advance_quest_objective", { quest_instance_id = q.id,
    objective_id = "deliver_medkit", set_value = { current = 0, required = 1 } })
  ctx:emit_intent("grant_inventory_item", { entity_id = ctx.world:get_controlled_entity(q.owner):guid(),
    item_id = "item.medkit", quantity = 1, reason = "quest:" .. q.id })   -- spawn into cargo
  ctx:emit_intent("set_quest_marker", { quest_instance_id = q.id,
    objective_id = "deliver_medkit", position = q.data.dropoff })          -- map marker
end
function Q.on_event(ctx, q, ev)                                            -- delivery tracking
  if ev.type == "item_delivered" and ev.item_id == "item.medkit"
     and ev.destination_entity_id == q.data.station then
    ctx:emit_intent("complete_quest", { quest_instance_id = q.id,
      rewards = { credits = 1500 } })
  end
end
return Q
```

### 7.1 New gaps this scenario exposes (not covered by the pre-DR-0045 reference)

1. **Player-identity exposure** on `ScriptEntity` (`is_player`/`owner_player_id`). The
   runtime already knows it (§11.5.6 guard); make it readable. → engine.
2. **Map/quest marker intent + replicated marker payload** (`set_quest_marker`,
   `add_map_marker`). Reference only mentions "waypoint hints" — no concrete
   surface. → engine-ui mechanism, content binding.
3. **Quest + dialogue + inventory runtime placement.** DR-0021 decided the quest
   *model*; this proposal decides they are **engine** (generic RPG concepts), with
   space content in `data/scripts`. This is the substantive new placement call.
4. **Trigger-volume system** (per-player enter/exit dedupe) as a generic
   `engine-spatial` capability, gated on the spatial index.

## 8. Quest & player-progression data model

Locked by DR-0021/0022; this proposal adds the DR-0045 placement.

- **QuestTemplate** — immutable, script-authored (`data/scripts/quests/*.lua`):
  `quest_template_id`, objective graph, reward rules, branch conditions. *Content.*
- **QuestInstance** — per-player runtime state: `quest_instance_id`, owner
  (`player_entity_id`), per-objective `current/required/completed`, status
  (`active`/`completed`/`failed`/`abandoned`), entity refs by UUID. *Engine runtime
  components.*
- **Storage** — quest journal/progress persists as **components on the player ECS
  entity** (project rule: player-scoped state lives on the player entity), via the
  existing graph persistence + `#[sidereal_component]` path, **replicated
  owner-only** (`VisibilityScope::OwnerOnly`). Survives restart; same template
  accepted by N players → N isolated instances (DR-0021).
- **Objective kinds (v1)**: `visit_entity`/`visit_region`, `collect_item`,
  `deliver_item`, `interact_with_entity`, `kill_target` (reference §8.6.1). Counters
  replicate for UI strings ("Collect 5/10").
- **Authority**: scripts propose progress/turn-in via intents; Rust validates
  ownership/range/quantity and final completion (`can_complete` gate + authoritative
  re-check). `consume_inventory_item` fails closed (reference §8.6.5).
- **Reads for scripts**: `get_player_active_quests`, `get_quest_instance`,
  `quest_objective_progress`, `has_quest` (§4.2).

This is the answer to "how do we store player quest data/progress": engine quest
components on the player entity, owner-only replicated, graph-persisted, intent-
mutated. No new storage substrate is needed — it reuses the component/persistence
machinery that already exists.

## 9. Dialogue / conversation-tree system

Locked direction by reference §3.1.1 + §8.8.3; placement decided here (engine).

- Lua emits `start_dialog { player_id, dialog_id, nodes, blocking?, timeout_s?,
  default_choice_id? }`. A node has `{ id, text, speaker?, portrait_asset_id?,
  choices = [{ id, text, hotkey? }] }` — a full multi-choice tree (branching handled
  in the quest/dialogue Lua across successive `start_dialog` calls keyed by the
  prior `choice_id`).
- Rust creates authoritative `ActiveDialog` state, replicates a **dialog ticket** to
  the owning client; the native `engine-ui`/`sidereal-ui` layer renders it (the
  client decides *how*, never *what*).
- **Blocking** gates: while a blocking dialog is active, Rust rejects the configured
  gameplay intents (move/fire/interact) for that player; timeout resolves to
  `default_choice_id`.
- The client sends a selection request; Rust validates it for the current dialog
  state and emits `dialog_response_submitted` back into Lua, which advances the
  branch / emits gameplay intents.
- Authority preserved: Lua authors *what to show* and *what a choice does*; it never
  mutates client UI directly (reference §3.1.1).

## 10. Evaluation: should the IFCS flight stack move into Lua?

**Recommendation: No — keep the IFCS allocator/control/physics in Rust. Widen the
existing Lua *goal/profile* seam instead.** This is both the right call and already
the accepted boundary (DR-0034). The viable, valuable Lua role in flight is
authoring goals and profiles and emitting high-level navigation intents — which this
runtime already extends.

Why not move the IFCS math itself:

1. **Client prediction parity (decisive).** The client runs the *full* shared
   simulation — including IFCS/flight — under `SimulationRuntimeRole::ClientPrediction`
   (`bins/sidereal-client/src/runtime/app_setup.rs:185`; the same systems run on
   server `ServerAuthority` and client `ClientPrediction` in
   `crates/sidereal-game/src/lib.rs`). Gameplay scripts are **server-only**
   (DR-0020, §6). Moving IFCS to Lua means either the client can no longer predict
   flight (rubber-banding on every input) or we must ship a second, bit-deterministic
   client-side Lua VM running identical math — which V1 explicitly rejects.
2. **Hot path / performance.** IFCS is ~1045 lines of f64 control math
   (`crates/sidereal-game/src/ifcs.rs`: velocity/heading error → desired wrench →
   allocation) running every FixedUpdate for every actively-simulated entity. Lua is
   ~20–50× slower and content scripts are budgeted for 1–10 Hz, not the 60 Hz hot
   path; the reference explicitly lists "thrust/fuel/mass" and "client
   prediction/reconciliation" as *stay-in-Rust* (§3.2, §13).
3. **Rollback determinism.** Prediction/rollback requires exact-equality f64 results
   across client and server; Lua numerics, table iteration order, and GC pauses
   jeopardize bit-stability and would inflate rollbacks.
4. **It's already decided.** DR-0034 keeps "allocator math, physics application, and
   render ABI Rust-owned" and has Lua "author validated actuator/profile/effect
   data and emit high-level motion/navigation intents." DR-0050 likewise requires
   the per-thruster allocator to be deterministic and fit the 60 Hz budget.

What Lua *should* do for flight (the viable seam — widen, don't relocate):

- Emit **goals**: `set_navigation_target`, `stop`, plus new `orbit`,
  `fly_away_from`, `set_ai_mode` (Phase E). The AI/weapons-platform scenarios (§7
  step 11) need exactly this — "go here / engage that" — and IFCS turns it into wrench
  → allocation → Avian forces.
- **Author** (declarative content) flight envelope/tuning profiles, actuator/effect
  references, and which profile an entity uses — already the model
  (`flight_envelope_profile`, reference 2026-03-13 note).
- **React** to flight-relevant events (arrival, stuck, damage) via hooks and re-issue
  goals.

### 10.1 The "GoHere" seam (already live — keep and extend)

A Lua-issued "GoHere" movement already exists end-to-end and routes through IFCS;
this proposal guarantees it stays the canonical seam and widens it. Verified path:

1. Lua: `ctx:emit_intent("set_navigation_target", { entity_id = guid, target_position = { x, y } })`
   — parsed and validated (finite f64) in
   `bins/sidereal-replication/src/replication/runtime_scripting.rs:1033`.
2. Applied: the script-intent system inserts `ScriptNavigationTarget { target_position }`
   on the entity (`runtime_scripting.rs:898`; `ctx:emit_intent("stop", …)` removes it,
   `:914`), in the FixedUpdate phase *before* flight runs (reference §11.5.7).
3. IFCS: `apply_navigation_targets_to_desired_motion` reads `ScriptNavigationTarget`
   → writes shared `RuntimeDesiredMotion` (`crates/sidereal-game/src/flight.rs:607`),
   then the documented chain `RuntimeDesiredMotion → IFCS → Engine → fuel check →
   Forces.apply_force()` (`flight.rs:4`) flies the entity with full envelope/arrival
   handling. Scheduled at `crates/sidereal-game/src/lib.rs:263`.

So no new work is required for basic GoHere — it is **[live]**. Two notes:

- **Current restriction (intended):** scripts may steer only non-player/NPC-owned
  entities (the safety guard, reference §11.5.6) — correct for AI ships and weapon
  platforms. Player-owned steering would need an explicit, separately-gated path.
- **Planned extensions (WS7), all goal-level over the same IFCS kernel:**
  `arrive_at_entity(guid)` (follow a moving target), `orbit(center, radius)`,
  `fly_away_from(pos)`, and `stop` (live). These compile to navigation goals /
  `RuntimeDesiredMotion`; none touch the solver.

Net: the IFCS *kernel* stays Rust; Lua gains richer *guidance* over it — and the
core "GoHere" already works today. That gives authors full control of flight
*behaviour* without paying the determinism/perf/prediction costs of relocating the
solver.

## 11. Introspectable API schema (for dashboard linting)

Goal: a single machine-readable description of **every hook, intent, `ctx`
function, component kind, and enum/vocabulary** so the dashboard script editor can
lint (flag unknown names, missing/mistyped payload fields, unknown component kinds,
unknown asset/blueprint ids) and autocomplete — **without the dashboard parsing
Lua** (upholds the WS1.5 CI guard forbidding dashboard-side Lua parsing).

**Single source of truth (the non-negotiable):** generate the schema from the *same*
typed registries the runtime uses to dispatch and validate, so it cannot drift. This
mirrors the existing generated-artifact pattern (`data/generated/*.json` emitted by
`gen_*` bins) and the Reflect→editor-schema inference (`engine-ecs/src/editor_schema.rs`)
that already drives the dashboard component editors.

How each surface becomes describable:

1. **Events** → typed Rust structs registered by a `#[script_event(name = "…")]`
   macro (inventory-collected, exactly like `#[sidereal_component]`). The emitter
   builds the typed struct (replacing today's ad-hoc table construction); the
   generator reflects its fields into the payload schema.
2. **Intents** → typed structs registered by `#[script_intent(name = "…")]`; the
   runtime parser becomes `serde::Deserialize<T>` instead of the hand-rolled
   `payload.x` plucking in `runtime_scripting.rs` (also a robustness win). Schema =
   the struct's fields + metadata (authority gate, privileged?, valid target labels).
3. **`ctx` functions** → a declarative manifest (a `const` table: `path`, `args`,
   `returns`, `doc`) co-located with where the functions are installed, plus a test
   asserting registered-vs-manifest parity (closures can't be reflected, so this is
   the SoT for the function surface and the test is what prevents drift).
4. **Component kinds** (for `entity:get(kind)` and component authoring) → reuse the
   existing `GeneratedComponentRegistry` + editor-schema inference already served to
   the dashboard.
5. **Enums/vocabularies** → reflect Rust enums (`damage_type`, `severity`,
   `objective_kind`, `ai_mode`); pull content vocabularies (`asset_id`,
   `blueprint_id`, audio profiles, `quest_template_id`) from the decoded registries
   the gateway already serves.

**Artifact + delivery:** a versioned `data/generated/script_api_schema.json` emitted
by a `gen_script_api_schema` bin (mirrors `gen_persistence_schema_rules.rs`; the bin
links `sidereal-game` so it captures both engine-generic and space-registered
events/intents). The gateway serves it like the other decoded-registry/shader
schemas; the dashboard fetches it via a `use-script-api-schema.ts` hook (mirror of
`dashboard/src/features/shaders/use-shader-schemas.ts`) and consumes typed JSON only.

**Linting fidelity — split by *where* analysis runs.** A JSON schema alone cannot
flag a free-form `ctx.world:typo()` buried in arbitrary Lua; something must analyse
the Lua. The WS1.5 guard forbids Lua parsing **in the dashboard frontend**, not on
the server/CI — so the symbol-level analysis lives server-side:

- **Dashboard (browser), V1 — schema/form/payload lint only.** From the JSON, using
  the existing Zod/typed-JSON stack: validate intent/event *payloads* in structured
  forms, offer name autocomplete + hover docs, and flag unknown enum/asset/blueprint
  ids. It deliberately does **not** claim to catch arbitrary mistyped `ctx`/symbol
  calls inside free Lua. No Lua is parsed in the browser.
- **Server/CI, V1 — symbol-level analysis (the real lint).** A gateway
  `validate_script` endpoint (and the same check in CI) loads the script in a
  sandboxed Lua and statically checks called `ctx` paths / intent names / event names
  / component kinds against the generated schema, returning typed-JSON diagnostics
  the dashboard renders inline. Server-side Lua analysis is allowed; the dashboard
  still parses no Lua. This is the authoritative publish-time gate.
- **LuaCATS defs, V1 (additive).** Emit a generated `.d.lua` (LuaCATS) from the same
  schema so an in-editor Lua language server gives live symbol completion/typecheck,
  and so the server analyser has a typed surface to check against. Same SoT.

Net V1 claim, stated precisely: the **dashboard** does schema/form/payload linting +
autocomplete; **symbol-level correctness** (unknown `ctx`/intent/event/component) is
caught by the **server/CI `validate_script`** path. Both consume the same generated
schema, so they cannot disagree with the runtime.

**Anti-drift guarantee (the payoff):** because the schema is generated from the
registries the runtime executes, *a script that passes the dashboard lint will
deserialize and dispatch at runtime*. A CI test asserts every emit-able event is
registered, every parser-accepted intent is registered, every installed `ctx`
function is in the manifest, and the committed artifact matches a fresh regen (same
check used for the other `data/generated/` artifacts).

**Placement (DR-0045):** the macros, the generator, and the generic registrations
are engine (`engine-script`); space events/intents are registered by content
(`sidereal-game`); the artifact under `data/generated/` is a documented data output
(consistent with `engine-render`'s `include_str!` of a generated layout); the
gateway endpoints (schema fetch + `validate_script`) + dashboard hook are app/content.
Symbol-level Lua analysis runs server/CI-side, so the dashboard renders diagnostics
without ever parsing Lua itself — reinforcing the WS1.5 guard.

This resolves the §13 open question on event/intent kinds: use a **string-keyed
registry of typed structs** — the string is the wire/Lua name, the struct gives the
schema and the runtime (de)serialization.

## 12. Dependencies & sequencing

Reuses the reference's Phase C/D/D1/E checklists; ordered so each WS is shippable.
The schema/typed-registry is the **foundation (WS0), not a trailing step** — it is
the anti-drift mechanism, so it lands first and every later WS extends the surface
only through it.

0. **WS0 — Typed API registry + schema harness (foundation, lands first).** Stand up
   the `#[script_event]`/`#[script_intent]` macros + string-keyed registry, the
   `ctx`-function manifest + parity test, the `gen_script_api_schema` artifact, the
   gateway schema + `validate_script` endpoints, the generated LuaCATS defs, and the
   anti-drift CI gate — then port the **current** surface onto it (the combat events
   already emitted, the three live intents `set_navigation_target`/`stop`/
   `set_script_state`, and the current `ctx`). From here, no event/intent/`ctx`
   function may be added except through this path.
1. **WS1 — Event bridge (Phase C).** Promote combat events to the full declarative
   bridge; add `on_spawn`; build per-handler context/budget/isolation/observability.
   Engine dispatch in `engine-script`; content emitters in `sidereal-game`. Also
   refresh the reference doc crate names/placement. Unblocks pillar 2.
2. **WS2 — Identity + component read + core commands (Phase D).** Expose
   `is_player`/`owner_player_id`/`faction`/generic `get`; add `spawn`/`despawn`/
   `apply_damage`/`play_sound`/`apply_impulse`/`patch_component`. Unblocks pillars
   1–2 end-to-end (Lua spawns + reacts).
3. **WS3 — Spatial/range + trigger volumes (Phase D spatial).** **Blocked on** the
   spatial partition plan; ship `raycast` first (no dependency), then radius/nearest
   + `enter/exit_script_trigger` + proximity hooks once the index lands (interim
   Avian shape-query fallback behind the final API, cost logged). Completes pillar 3.
4. **WS4 — Inventory + items.** Engine inventory framework + `grant/consume/transfer`
   intents + generic `item_collected`/`item_delivered`/`container_changed` events;
   space `cargo_*`/`docked` aliases + item blueprints in content.
5. **WS5 — Quest runtime (Phase D1).** Engine quest components on the player entity,
   owner-only replicated; quest intents + lifecycle hooks; `data/scripts/quests/*`;
   vertical-slice mission + restart/multi-player isolation tests.
6. **WS6 — Dialogue + markers (§8.8/§9).** `ActiveDialog` + blocking gate + dialog
   tickets (engine-ui); `set_quest_marker`/`add_map_marker` replicated payload.
7. **WS7 — AI/combat intent surface (Phase E).** `fire_weapons`/`set_target`/
   `set_ai_mode`/`orbit`/`fly_away_from`/`scanner_ping`; threat-memory AI + static
   weapons-platform example (reference §8.6.6). Widens the IFCS goal seam (§10).
Cross-cutting (every WS): each WS that adds an event/intent/`ctx` function registers
it through the WS0 typed path, so the `gen_script_api_schema` artifact + gateway
`validate_script`/schema endpoints + dashboard `use-script-api-schema` hook grow with
the surface and the WS0 anti-drift CI gate keeps them honest. Each WS also answers
the DR-0040 distribution questions (§6.1) for any state it adds.

## 13. Risks & open questions

- **Per-event cost at scale.** Many projectiles × rocks × players × Lua dispatch.
  Mitigated by opt-in handler binding, budgets, and high-frequency aggregation
  (reference §5.3). Keep combat/proximity hooks opt-in, never global.
- **Default vs. escalation.** Steer authors to data-driven Rust defaults
  (fracture/loot/destruction profiles) and reserve hooks for the exceptional
  (reference §2.3.1).
- **Reference-doc staleness.** It names `crates/sidereal-scripting` and pre-boundary
  placement throughout; WS1 must refresh it to point at `engine-script` + §5 here.
- **Quest/dialogue/inventory engine-promotion** touches persistence/replication
  registration; sequence carefully (default-deny into engine favours care, but they
  pass the RPG test cleanly).
- **Blocking-dialog input gate** interacts with client prediction (the client must
  also honour the gate or reconcile); define the gate as authoritative reject +
  replicated dialog state, not client-trusted.
- **Component-access policy granularity.** `script_read`/`script_patch` per-kind vs.
  per-field; how reads honour redaction for fields a script arguably shouldn't see.
  Default-deny is the safe starting point.
- **Active-dialog handoff.** Carry `ActiveDialog` in the handoff sidecar vs.
  cancel-and-resume on shard handoff (§6.1) — a UX/complexity tradeoff.
- **Open:** `ScriptState` promotion timing; whether the quest runtime is a new
  `engine-quest` crate or part of `engine-gameplay`. (Resolved: event/intent kinds
  use a string-keyed registry of typed structs, §11; linting locus split
  dashboard/server, §11; distribution per §6.1.)

## 14. Acceptance criteria

1. An invisible trigger blueprint detects a player within radius, reads
   `is_player()`/`owner_player_id()`, and offers a quest only if the player is not
   already on it.
2. Accepting via a blocking multi-choice dialogue launches a quest Lua module; quest
   progress persists on the player entity (owner-only replicated) and survives
   restart; two players run the same template in isolation.
3. The quest grants an item into the player's cargo, sets a map marker, and completes
   on delivery to a tracked location — driven entirely from Lua.
4. A static weapons-platform blueprint acquires/targets a player in range and fires
   via `fire_weapons`, with no flight.
5. Deletion test stays green: removing `sidereal-game` + `data/` leaves the engine
   crates (incl. quest/dialogue/inventory runtimes) compiling with no space
   vocabulary (DR-0045).
6. IFCS remains Rust-owned; an AI/turret script moves an NPC entity purely through
   the already-live `set_navigation_target` ("GoHere") intent, which flies it via
   IFCS, plus the planned `orbit`/`arrive_at_entity`/`fly_away_from` goal intents
   (§10.1).
7. Per-handler budget/error isolation proven: a runaway/erroring hook is aborted and
   logged without stalling the 60 Hz sim.
8. The dashboard script editor flags an unknown hook/intent/`ctx` function, an
   unknown component kind, and a malformed intent payload — driven solely by the
   generated `script_api_schema.json` (no Lua parsing). A CI test fails if the
   committed schema diverges from the runtime's registered events/intents/functions.

## 15. References

- `docs/features/reference/scripting_support_reference.md` — model, event allowlist
  (§5.4), runtime API (§8), quests (§8.6), triggers + dialogue (§8.8), implemented
  state (§11), phase plan (§12).
- `docs/features/active/scripting_support_contract.md` — active scripting contract.
- `docs/decisions/dr-0051_gameplay_authoring_scripting_runtime.md` — the decision.
- `docs/decision_register.md` — DR-0020/0021/0022/0024/0025 (scripting authority,
  quest model, privileged mutation, catalog authority; DR-0025 has a detail doc).
- `docs/decisions/dr-0045_engine_content_separation_achieved.md` and
  `.claude/skills/sidereal-engine-boundary/SKILL.md` — placement rule.
- `AGENTS.md` §3.4 and
  `docs/decisions/dr-0040_distribution_and_persistence_authority_model.md` —
  the distribution authority questions answered per state in §6.1.
- `docs/decisions/dr-0034_fly_by_wire_thrust_allocation_and_gnc_stack.md` and
  `docs/plans/active/ifcs_navigation_and_thrust_allocation_implementation_plan_2026-04-27.md`
  — flight/IFCS boundary (§10).
- `docs/plans/proposed/spatial_partitioning_implementation_plan_2026-03-04.md` —
  spatial index (WS3 dependency).
- Code: `crates/engine-script/src/lib.rs`,
  `bins/sidereal-replication/src/replication/runtime_scripting.rs`,
  `bins/sidereal-replication/src/replication/scripting/`,
  `crates/sidereal-game/src/combat.rs`, `crates/sidereal-game/src/asteroid_field.rs`,
  `crates/sidereal-game/src/ifcs.rs`, `crates/sidereal-game/src/flight.rs`,
  `crates/engine-gameplay/src/lib.rs`, `bins/sidereal-client/src/runtime/app_setup.rs`.
