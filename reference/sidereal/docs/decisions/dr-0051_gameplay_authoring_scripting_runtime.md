# DR-0051: Gameplay Authoring Scripting Runtime

Status: Active
Lifecycle: source-of-truth
Category: decision
Last updated: 2026-06-17
Owners: scripting + gameplay simulation + replication + engine architecture
Scope: Commit to building the server-authoritative Lua gameplay runtime (lifecycle hooks, world/spatial queries, runtime spawn, generic component read) and place every new mechanism on the engine side of the DR-0045 boundary, with space vocabulary kept in content.
Source of truth: yes
Supersedes: n/a
Superseded by: n/a
Primary references:
- docs/features/proposed/gameplay_scripting_runtime_proposal.md
- docs/features/reference/scripting_support_reference.md
- docs/decisions/dr-0045_engine_content_separation_achieved.md

## DR-0051: Gameplay Authoring Scripting Runtime

- Status: Accepted
- Date: 2026-06-15
- Owners: scripting + gameplay simulation + replication + engine architecture

- Context:
  - The intent is to author most gameplay (entity definition, on-damage/on-destroy/on-hit reactions, spawn orchestration, proximity logic, entity queries) in Lua over the engine + `sidereal-game` backbone, rather than in Rust.
  - The target model is already specified — hybrid event-driven execution + read-only world queries + intent-only writes — in `docs/features/reference/scripting_support_reference.md` (§2.7, §5, §8) and locked by accepted DR-0020/0021/0022/0024/0025.
  - It is partially built: the combat→script bridge already emits `shot_fired`, `shot_impact`, `damage_applied`, `health_depleted`, `before_destroy`, `destroyed` (reference §11.5.4), but notification-only, opt-in per entity via `ScriptState.data.event_hooks`, with no override/spawn/audio intents; runtime `ctx` exposes only `find_entity` + three intents + `script_state`-only component access (§11.5.3, §11.5.5).
  - The default "asteroid shatters on death" is already a data-driven Rust path (`crates/sidereal-game/src/asteroid_field.rs` + `AsteroidFractureProfile`); Lua hooks are the escalation path for exceptional behaviour, not a place to re-implement defaults (reference §2.3.1).
  - The reference design predates the DR-0045 engine/content separation (2026-06-03): it places the runtime in `crates/sidereal-scripting`, which was renamed to `engine-script` and split into 17 project-agnostic `engine-*` crates vs. `sidereal-game` + `data/`. The reference still names the old crate and pre-boundary placement, so it actively misdirects implementers on *where* new code goes.

- Decision:
  - Build the gameplay scripting runtime as a first-class feature (`system.gameplay_scripting_runtime.v1`): full Rust→Lua event bridge (reference Phase C), runtime read/query/spawn/component API and widened intent set (Phase D non-quest parts), and the AI intent surface (Phase E), per the proposal.
  - Keep it strictly server-authoritative for V1 — no client-side scripting VM. Lua reads a per-tick snapshot and emits validated intents Rust applies in a controlled phase; hooks are not client-predicted, and client visuals/audio flow through replicated effect events (DR-0020, DR-0024).
  - Place every new *mechanism* on the engine side and every *named space concept* in content, per DR-0045 and the placement table in the proposal §5: event-bridge dispatch, read-only world API, spatial/range query layer, Reflect component bridge, intent-applier framework, and generic blueprint→spawn live in `engine-script` / `engine-gameplay` / `engine-spatial` / `engine-ecs`; concrete event emitters, space intent handlers, blueprints, and hook scripts live in `sidereal-game` + `data/scripts`. Generic event/intent kinds are content-registered (string-keyed registry validated against an allowlist, matching the component-kind pattern), never hardcoded in engine.
  - Treat the spatial partition plan (`docs/plans/proposed/spatial_partitioning_implementation_plan_2026-03-04.md`) as the dependency for efficient radius queries; ship `raycast` (Avian `cast_ray`, already used in combat) first and allow an interim Avian shape-query fallback for `entities_in_radius` behind the final Lua API, with the interim cost logged.
  - Treat quests, dialogue, inventory, map markers, trigger volumes, and player identity as **generic** RPG/MMO concepts and place their runtimes on the engine side (`engine-gameplay`/`engine-ui`/`engine-spatial`/`engine-ecs`), with space-specific quest/dialogue/item content in `data/scripts`. This extends the boundary call to surfaces the pre-DR-0045 reference left in `sidereal-scripting`/`sidereal-game`. Player quest progress is stored as owner-only-replicated, graph-persisted components on the player ECS entity (DR-0021) — no new storage substrate.
  - Do **not** move the IFCS flight stack into Lua (evaluation in proposal §10): the client runs the full IFCS simulation under `SimulationRuntimeRole::ClientPrediction`, gameplay scripts are server-only, and the solver is 60 Hz f64 hot-path math requiring rollback-stable determinism. This reaffirms DR-0034 (allocator/physics/render-ABI stay Rust). Lua's role in flight is authoring goals/profiles and emitting high-level navigation/goal intents, which this runtime widens. The core "GoHere" capability is already live: `ctx:emit_intent("set_navigation_target", …)` inserts `ScriptNavigationTarget` and flies the entity via IFCS (`runtime_scripting.rs:1033/898` → `flight.rs:607` → IFCS); planned `orbit`/`arrive_at_entity`/`fly_away_from` are goal-level extensions over the same kernel (proposal §10.1).
  - Define the event/intent surface as a **string-keyed registry of typed Rust structs** (the string is the Lua/wire name; the struct gives serde (de)serialization + the schema), registered via `#[script_event]`/`#[script_intent]` macros analogous to `#[sidereal_component]`. Generate a versioned `data/generated/script_api_schema.json` from those registries (plus a tested `ctx`-function manifest and the existing component-kind/editor-schema registries) so the dashboard script editor can lint and autocomplete from typed JSON without parsing Lua (upholds the WS1.5 guard). A CI test fails if the committed schema diverges from the runtime's registered surface, guaranteeing a lint-passing script deserializes/dispatches at runtime.
  - Make the typed registry + schema the **foundation workstream (WS0)**, not a trailing step: stand up the macros/registry/manifest, the `gen_script_api_schema` artifact, the gateway schema + `validate_script` endpoints, generated LuaCATS defs, and the anti-drift CI gate first, then port the current surface (combat events, the three live intents, current `ctx`) onto it; every later workstream extends the surface only through that path.
  - Reconcile dashboard linting with the no-dashboard-Lua-parsing guard: the **dashboard** does schema/form/payload linting + autocomplete only; **symbol-level** correctness (unknown `ctx`/intent/event/component) is caught **server/CI-side** by a `validate_script` path (sandboxed Lua analysis against the schema, allowed because the WS1.5 guard forbids *dashboard* Lua parsing, not server parsing) plus generated LuaCATS for an editor language server. The V1 claim is scoped accordingly.
  - Answer DR-0040 distribution for every new stateful surface (quest progression, active dialog, markers, script-spawned entities, trigger state) per proposal §6.1: owner by entity-root position / player-owning shard; state travels via the standard snapshot→persistence→hydrate handoff; owner-only-replicated progression is never ghosted; cross-shard script effects (spawn-elsewhere routes to the target shard; trigger/quest/dialog mutate only authoritatively-local players; cross-shard targeting) are rejected in V1 like native combat.
  - Gate script component access with `script_read`/`script_patch` metadata on `#[sidereal_component]` (default-deny, per-field allowlist, honouring redaction); identity/ownership/session/auth/motion-authority fields are never script-readable/patchable.
  - Require deterministic hook execution: `ctx.time` is simulation-tick time (never wall-clock; the sandbox already strips `os`); `ctx.rand` is a seeded, persisted-scope PRNG (world seed + content version + entity/quest/region key) — no ambient randomness.
  - Constrain `ctx:emit_event` to a namespaced (`script.<ns>.<name>`), next-tick-deferred, budgeted **local script bus** outside the typed registry; promote to a registered `#[script_event]` when schema/lint is needed.
  - Use generic names for engine-side surfaces (`get_controlled_entity`, `item_delivered`/`container_changed`); space names (`get_active_ship`, `cargo_*`, `docked`) are content aliases/labels.
  - Refresh/annotate `scripting_support_reference.md` to point at `engine-script` and this DR's placement as part of the first workstream so it stops naming the dead crate.

- Alternatives considered:
  - Add a client-side presentation scripting VM in V1: rejected — second runtime to sandbox/sync, and replicated effect events already deliver client visuals; revisit later as presentation-only (cannot mutate authoritative state).
  - Give Lua direct/live ECS access (`&mut World`, raw component writes): rejected — breaks single-writer motion, rollback safety, and the sandbox (consistent with DR-0024).
  - Re-implement asteroid fracture (and similar defaults) in Lua hooks: rejected — defaults stay data-driven in Rust for determinism/rollback; hooks are the exceptional path (reference §2.3.1).
  - Put the scripting machinery in `sidereal-game` "for now": rejected — it is provably generic (RPG test passes); building it engine-side from day one avoids a later extraction and keeps the deletion test green.
  - Move the IFCS flight stack into Lua: rejected — breaks client prediction parity (IFCS runs client-side under `ClientPrediction`; scripts are server-only), violates the 60 Hz hot-path/determinism budget, and contradicts the accepted DR-0034 boundary. Widen the Lua goal/profile seam instead (proposal §10).
  - Do symbol-level Lua linting in the dashboard frontend: rejected — violates the WS1.5 no-dashboard-Lua-parsing guard; run sandboxed Lua analysis server/CI-side (`validate_script`) + generated LuaCATS instead, dashboard does schema/form linting only.
  - Expose all reflected component fields to scripts by default: rejected — default-deny via `script_read`/`script_patch` metadata, so identity/session/auth fields can never leak or be patched.
  - Wall-clock time / ambient RNG in hooks: rejected — non-deterministic, breaks replay/rollback; simulation-tick time + seeded persisted-scope RNG only.
  - Treat this as already-covered by DR-0020…0025 and just implement: rejected — those decisions cover authority/quest/catalog but none commits to the gameplay-hook substrate or addresses post-DR-0045 placement; this DR fills that.

- Consequences:
  - Positive:
    - Most gameplay becomes Lua-authorable (entity blueprints, lifecycle reactions, spawn orchestration, queries) over a stable Rust kernel.
    - New machinery lands on the correct side of the boundary, so the engine stays reusable and the deletion test stays green.
    - Reuses the existing catalog/publish/sandbox substrate (DR-0025/0026) and already-emitted combat events.
  - Negative:
    - Per-event Lua dispatch cost at scale must be contained by opt-in handler binding + budgets + aggregation.
    - Efficient radius queries are gated on the spatial partition (interim Avian fallback carries a cost until it lands).
    - Promoting `ScriptState` engine-side touches persistence/replication registration and must be sequenced (or deferred to a later version).
    - The reference doc needs a correction pass to stop misdirecting placement.

- Follow-up:
  - Accept this DR and write the workstream plan (`docs/plans/proposed/`) following the proposal §7 sequencing (WS1 event bridge → WS5 AI intents).
  - WS1 also refreshes `scripting_support_reference.md` crate names + placement.
  - Event/intent kinds: resolved to a string-keyed registry of typed structs (see Decision).
  - Build the `gen_script_api_schema` artifact + gateway endpoint + dashboard `use-script-api-schema` hook + anti-drift CI test (proposal §11).
  - Decide `ScriptState` promotion timing (engine now vs. V2); decide whether the quest runtime is a new `engine-quest` crate or part of `engine-gameplay`.
  - Settle the script **mutation surface** for gameplay state: gameplay-significant mutations (inventory/health/quest/spawn/destruction/physics-impulse/loot) are exposed as **typed intents**, not direct component accessors; enumerate which fields (if any) are `script_patch`-safe under the per-field allowlist (identity/ownership/auth/session/transform/motion-authority/shard/visibility/persistence-routing never patchable). Tracked with content-authoring composition plan WS6 and the entity authoring proposal §5.1.

- Decision doc:
  - `docs/decisions/dr-0051_gameplay_authoring_scripting_runtime.md`

- References:
  - `docs/features/proposed/gameplay_scripting_runtime_proposal.md`
  - `docs/features/reference/scripting_support_reference.md`
  - `docs/features/active/scripting_support_contract.md`
  - `docs/decision_register.md` (DR-0020, DR-0024 — register-only entries)
  - `docs/decisions/dr-0025_runtime_script_catalog_authority.md`
  - `docs/decisions/dr-0045_engine_content_separation_achieved.md`
  - `docs/decisions/dr-0040_distribution_and_persistence_authority_model.md` and `AGENTS.md` §3.4
  - `docs/decisions/dr-0034_fly_by_wire_thrust_allocation_and_gnc_stack.md`
  - `docs/plans/proposed/spatial_partitioning_implementation_plan_2026-03-04.md`
  - `docs/plans/active/ifcs_navigation_and_thrust_allocation_implementation_plan_2026-04-27.md`
  - `crates/engine-script/src/lib.rs`, `crates/engine-gameplay/src/lib.rs`
  - `crates/sidereal-game/src/ifcs.rs`, `bins/sidereal-client/src/runtime/app_setup.rs`
  - `bins/sidereal-replication/src/replication/runtime_scripting.rs`
  - `crates/sidereal-game/src/combat.rs`, `crates/sidereal-game/src/asteroid_field.rs`
