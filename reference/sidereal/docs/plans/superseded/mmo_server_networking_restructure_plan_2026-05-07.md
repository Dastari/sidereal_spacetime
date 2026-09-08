# MMO Server Networking Restructure Plan - 2026-05-07

Status: Superseded
Lifecycle: superseded
Category: plan
Last updated: 2026-06-04
Owners: implementation owners
Scope: MMO Server Networking Restructure Plan - 2026-05-07.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

Primary references:

- `AGENTS.md`
- `docs/architecture/sidereal_design_document.md`
- `docs/decision_register.md`
- `docs/features/active/visibility_replication_contract.md`
- `docs/features/proposed/background_world_simulation_proposal.md`
- `docs/features/active/server_observability_metrics_contract.md`
- `docs/features/reference/prediction_runtime_tuning_and_validation_reference.md`
- `docs/features/reference/lightyear_upstream_issue_snapshot_reference.md`
- `docs/plans/completed/runtime_optimization_scalability_plan_2026-04-29.md`
- `docs/plans/superseded/multiplayer_prediction_interpolation_reliability_plan_2026-03-15.md`
- `docs/plans/proposed/spatial_partitioning_implementation_plan_2026-03-04.md`
- `docs/plans/completed/control_handoff_input_prediction_stabilization_plan_2026-04-27.md`

## 0. Status Notes

2026-05-07:

1. This plan was created from a read-only backend audit and the latest available replication metrics after the user reported persistent local-client rubberbanding after 1-2 minutes.
2. No code changes are included in this document change.
3. The current observed failure is not packet loss: the latest audited run accepted realtime inputs with zero input drops, but fixed-step catch-up reached 15 fixed ticks in one app update and the oldest input age exceeded 300 ms.
4. The required restructuring direction is to keep the authoritative 60 Hz lane small, deterministic, and input-first, while moving visibility, tactical streaming, scripting, persistence, diagnostics, and world residency work into lower-rate, budgeted, or asynchronous lanes.
5. Native impact: future implementation work primarily affects the native replication server and native client validation harness. Client prediction/reconciliation behavior must remain Lightyear-owned and must be validated on native first.
6. WASM impact: future shared client/runtime changes must keep WASM parity recoverable. No platform-specific gameplay, prediction, or reconciliation branches should be introduced.

2026-05-08 implementation update:

1. Continued Phase 4 telemetry work by adding deferred visibility membership queue age as `visibility_deferred_membership_oldest_pending_gain_age_s`.
2. Added `SIDEREAL_VISIBILITY_APPLY_WORKLIST_SOFT_BUDGET` telemetry fields so captures can report oversized visibility apply passes before hard caps or deferral semantics are introduced.
3. Added optional `SIDEREAL_VISIBILITY_MEMBERSHIP_DEFERRED_GAIN_MAX_AGE_S` enforcement. When configured, a still-authorized deferred membership gain is released after its max age even if the per-client gain budget remains exhausted; no-longer-authorized pending gains are still dropped.
4. Started Phase 5 residency hardening by treating pending deferred visibility membership gains as unresolved visibility interest for sector lifecycle flush/demotion decisions.
5. Started Phase 6 shared combat indexing. Combat now maintains a persistent GUID, weapon mount, and hardpoint read model and uses it for weapon fire/projectile/hitscan lookup instead of rebuilding GUID/hardpoint maps inside those hot systems every tick.
6. Health exposes `gameplay_combat_index_*` fields so stable scenes can confirm combat index scans fall to zero after initialization.
7. Started Phase 7 script budgets. Runtime scripting now supports default-unlimited per-run interval handler, event queue drain, and intent apply budgets, with deferred work remaining queued for later scripting lane passes.
8. Continued Phase 8 persistence isolation telemetry. Bounded persistence writes now report latest-pending record count, latest-pending age, and coalesced replacements through replication health so backlog freshness is visible without moving persistence back onto the fixed lane.
9. Started Phase 9 load harness integration. `scripts/run_mmo_synthetic_load_tier.sh` wraps the existing native headless Phase 0 capture path into configured client tiers/workloads and SLO gates, and the capture summary now records the new input-age, lane, visibility deferred-age, combat-index, script-backlog, and persistence-backlog metrics, including p95 fields for the primary timing/backlog gates.
10. Recorded Phase 10 shard/overload contract in `docs/architecture/sidereal_design_document.md`: one process is one authoritative shard, thousands connected requires explicit shard/zone routing, overload must degrade noncritical lanes first, and input SLO breaches must surface as unhealthy state.
11. Added Phase 10 single-shard runtime metadata and health fields: `SIDEREAL_REPLICATION_SHARD_ID`, optional `SIDEREAL_REPLICATION_SHARD_REGION_BOUNDS`, and explicit `shard_connected_clients`, `shard_active_sectors`, `shard_hot_entities`, and `shard_input_oldest_age_ms` counters.
12. Added Phase 10 degraded shard health status. Health status changes to `degraded` with `shard_degraded_reasons` when input age, fixed catch-up, persistence pending age, or visibility deferred gain age exceeds configured SLO thresholds.
13. Continued Phase 8 behavior by coalescing the latest pending persistence batch by graph `entity_id` when the bounded worker queue is full. Newer records replace older records for the same entity while unrelated dirty entities remain queued, and health/capture summaries expose `persistence_coalesced_records`.
14. Continued Phase 3/9 replication payload telemetry. Replication health and Phase 0 summaries now expose successful Sidereal-authored outbound message counters and estimated serialized payload bytes for control, combat-event, tactical snapshot, tactical delta, owner manifest, asset notice, and notification classes, plus aggregate estimated bytes/client/sec in the capture summary.
15. Continued Phase 9 load-harness evidence. Phase 0 summaries now include process CPU p95/max, host CPU p95/max, max RSS, max virtual memory, host memory, and RSS/client. The MMO load wrapper copies CPU, memory, RSS/client, and outbound bytes/client/sec into the tier gate file.
16. Continued Phase 5/9 sector residency validation. Added `SIDEREAL_SECTOR_LIFECYCLE_MODE=observe|preflight|active`; default `observe` preserves non-destructive metrics, `preflight` enables removal/hydration readiness metrics, and `active` enables the flush/hydration/removal executors unless their specific enabled overrides are set. The MMO `sector_crossing` workload defaults this mode to `preflight`.
17. This gives load captures explicit stale-queue, forced-release, worklist-pressure, residency-blocker, combat-index rebuild, script-backlog, persistence-backlog, shard-health, host/process resource, sector lifecycle preflight, and read-model/event payload signals for budgeted AOI/combat/script/persistence work.
18. Continued Phase 6 transform-sync work. Replication server transform projection now narrows Avian-to-`Transform` and static `WorldPosition`/`WorldRotation` projection to source-dirty candidates, so stable scenes no longer scan unchanged physics/static transform sources every fixed post-update pass.
19. Continued Phase 9 load-harness gates. `scripts/run_mmo_synthetic_load_tier.sh` now supports optional disabled-by-default resource, outbound-byte, and client post-authority prediction-gap thresholds so long/manual tiers can enforce CPU, RSS/client, bandwidth/client/sec, and prediction-gap budgets once workload-specific limits are agreed. The gate artifact also copies observability-backed sector lifecycle and simulation-tier counts so hot/warm/cold residency evidence is present without enabling debug logs or opening the larger Phase 0 summary.
20. Fixed Phase 9 capture parsing for expanded deferred visibility-membership debug summaries. Phase 0 text summaries now extract max deferred age, oldest pending age, expired releases, and the expanded totals from the current log format instead of returning `n/a` for those log-derived fields.
21. Phase 0 summaries now include `metrics_transform_sync_*` p95/max fields from observability so changed-source transform projection can be validated without enabling debug visibility logs.
22. Integrated the Lightyear fork send-metrics patch at `Dastari/lightyear` commit `c2db90da93c16383d1e886b253db790acb0fbb18`. Sidereal now installs `ReplicationSendMetricsObserver` on the replication server and exposes Lightyear component replication queued/sent payload bytes, message/entity/component counts, actions/updates channel totals, queue depths, and bandwidth-limited counts through health, observability, Phase 0 summaries, and MMO load gate artifacts.
23. Continued Phase 3 replication policy work by applying conservative Lightyear entity replication-group priorities on the replication server. Controlled entities, projectiles, dynamic physics entities, player runtime entities, generic replicated entities, and static world entities now receive separate priorities while preserving per-entity groups. Send-frequency reduction remains deferred until longer native owner-correction and remote-interpolation captures validate safe limits.
24. Continued Phase 6 transform hot-path work. Replication-server planar physics sanitization now runs only for added/changed Avian motion components instead of scanning every physics body each fixed tick, while preserving non-finite position, velocity, rotation, and angular-velocity repair. Health and Phase 0 summaries expose planar sanitizer candidate and reset counters.
25. Continued Phase 9 tactical/read-model validation. Phase 0 summaries and MMO load gate artifacts now include observability-backed tactical authoring/contact-index churn and owner-manifest read-model churn fields, plus disabled-by-default gates for tactical full rebuilds, replicated-entity scans, contact-index full-scan fallbacks, contact candidate evaluation volume, owner-manifest dirty candidates, and owner-manifest no-ops. Configured MMO gate comparisons now reject missing, `NaN`, or infinite metric values instead of passing them as zero.
26. Continued Phase 4/9 cell-owned AOI validation. The cell-dirty visibility apply worklist now includes runtime policy dirty entities so non-movement changes such as `ControlledBy` or runtime world visual stack changes still re-enter the authorization/delivery/payload evaluation path. Phase 0 summaries and MMO load artifacts expose observability-backed cell-dirty worklist enabled/dirty/worklist counts plus worklist size gates. Short native headless release runs with the cell-dirty path enabled passed the MMO load gate with zero input drops, including the default-on validation summary at `data/debug/mmo_synthetic_load/20260509_152139_movement_only_1c/phase0_headless_summary_20260509_052139.txt`.
27. Continued Phase 3 replication payload policy work. Lightyear entity replication groups now support disabled-by-default class send-frequency overrides through `SIDEREAL_REPLICATION_GROUP_CONTROLLED_SEND_HZ`, `SIDEREAL_REPLICATION_GROUP_PROJECTILE_SEND_HZ`, `SIDEREAL_REPLICATION_GROUP_DYNAMIC_SEND_HZ`, `SIDEREAL_REPLICATION_GROUP_PLAYER_RUNTIME_SEND_HZ`, `SIDEREAL_REPLICATION_GROUP_STATIC_SEND_HZ`, and `SIDEREAL_REPLICATION_GROUP_GENERIC_SEND_HZ`; unset defaults preserve current cadence. The MMO load artifact records the configured class send rates for bandwidth/correction comparisons.
28. Continued Phase 6/8 persistence hot-path work. Critical control/disconnect snapshots that persist a root plus mounted component tree now use a server-maintained `EntityGuid`/`MountedOn` relationship index instead of scanning all mounted entities level by level. The index is updated from `EntityGuid`/`MountedOn` adds, changes, and removals before control/auth processing in `Update`.
29. Continued Phase 7 scripting hot-path work. Runtime scripting snapshots are now dirty-maintained from script-visible entity add/change/removal events instead of rebuilding the whole script-visible map on every scripting lane pass; health/observability exposes dirty update, removal, refresh, and entity-count counters under `lua_runtime`. Script event backlog work now also has disabled-by-default wall-time and stale-age budgets plus stale-drop/oldest-age metrics.
30. Continued Phase 8 persistence backpressure telemetry. Persistence worker progress now exposes worker busy state, latest transactional write attempt duration, and failed write attempts through health/observability and Phase 0 summaries, alongside existing queue/coalescing/pending-age fields.
31. Continued Phase 5 sector demotion cleanup. Runtime removal now purges removed entities from tactical contact indexes, owner manifest read models, deferred visibility queues, visibility caches/spatial indexes, and persistence relationship indexes in the same step that despawns ECS entities and marks verified sectors `ColdPersisted`.
32. Continued Phase 4 default promotion. The validated cell-dirty apply worklist is now the default visibility AOI apply path; `SIDEREAL_VISIBILITY_USE_CELL_DIRTY_WORKLIST=0`, `false`, or `off` remains available for rollback/comparison captures.
33. Continued Phase 7 test hardening. Runtime scripting now has unit coverage for event wall-budget deferral and parser rejection of direct authoritative transform/position/velocity mutation intents.
34. Native/WASM impact: shared gameplay combat indexing and shared headless input parsing plus replication-server visibility budgeting/default worklist selection, sector residency/demotion cleanup, scripting lane budgets, dirty script snapshot maintenance, persistence health telemetry, persistence worker backpressure telemetry, outbound-message health telemetry, Lightyear component replication send telemetry, shard health metadata, host/process load telemetry, changed-source transform projection, changed-source planar sanitization, Lightyear replication-group priority/send-frequency policy, tactical/read-model load telemetry, persistence relationship indexing, and load scripts; no protocol or client runtime branch.

2026-05-07 implementation update:

1. Started Phase 1/2 implementation. Realtime input receive now avoids staging per-client messages and valid claims in temporary `Vec` collections, records latest-wins collapse counts, tracks fixed receive polls, and exposes accepted-to-applied tick gap metrics.
2. Introduced explicit runtime lane sets and cadence-gated Update lanes for visibility/AOI membership, motion diagnostics, tactical/owner/asset streams, persistence/residency, scripting snapshot/interval/event work, and diagnostics.
3. The fixed lane still receives and drains input before authoritative gameplay, applies script intents before gameplay systems, and runs critical physics/combat/dirty-marking work. Noncritical lane cadence defaults and health fields are documented in `docs/features/active/server_observability_metrics_contract.md`.
4. Runtime scripting interval/event passes now share immutable snapshot maps instead of cloning the full script-observable map per pass. Incremental persistence dirty collection now uses dirty marker GUID-to-entity indexing before falling back to a broad scan.
5. Runtime lanes now expose run counts, last/max wall time, budget, and over-budget totals so load captures can attribute pressure to a lane instead of only observing fixed-tick debt.
6. Started Phase 3 audit documentation in `docs/features/active/visibility_replication_contract.md`: replicated payloads are classified into owner correction/prediction, remote dynamic motion, combat/projectile, spawn/config, hierarchy/identity, static presentation, visibility/disclosure, and tactical/read-model streams before any component-rate throttling is enabled.
7. Native impact: replication-server scheduling and diagnostics only. WASM impact: no protocol split or platform-specific gameplay branch.

## 1. Executive Summary

Sidereal already has the correct high-level authority model:

1. clients send input intent,
2. the shard sim validates and applies it authoritatively,
3. replication distributes authorized state,
4. persistence records durable state.

The immediate failure is that too much noncritical work shares timing-critical schedules with input and physics. In the latest audited run, the server did not drop input, but it bunched fixed ticks and allowed input age to grow. That creates the exact symptom the user sees: the client predicts locally, the server applies older intent late, reconciliation corrects back, and the player sees rubberbanding even on localhost.

The long-term MMO failure would be the same issue at larger scale. A single process cannot run all connected players, all sectors, all visibility checks, all scripts, all tactical summaries, all persistence serialization, all physics bodies, and all replication sends at 60 Hz. The target architecture must be a shard/zone runtime where only active local interaction bubbles run full physics at high rate, while far sectors and noncritical streams use lower cadence, abstract simulation, budgets, and asynchronous workers.

The core restructuring goal:

1. make the 60 Hz authoritative lane input-first and bounded,
2. decouple network input polling from Bevy `Update` cadence,
3. split server work into explicit rate lanes,
4. turn visibility/AOI into cell-owned dirty work,
5. activate sector residency so unloaded sectors do not consume full runtime cost,
6. replace repeated hot-path scans with persistent indexes,
7. add synthetic load tests that fail when input age or fixed catch-up regresses.

## 2. Read Before Editing

A fresh implementation agent must read these files before making changes:

1. `AGENTS.md`
2. `docs/features/active/visibility_replication_contract.md`
3. `docs/features/proposed/background_world_simulation_proposal.md`
4. `docs/features/active/server_observability_metrics_contract.md`
5. `docs/features/reference/prediction_runtime_tuning_and_validation_reference.md`
6. `docs/features/reference/lightyear_upstream_issue_snapshot_reference.md`
7. `docs/plans/completed/runtime_optimization_scalability_plan_2026-04-29.md`
8. `docs/plans/superseded/multiplayer_prediction_interpolation_reliability_plan_2026-03-15.md`
9. `bins/sidereal-replication/src/main.rs`
10. `bins/sidereal-replication/src/plugins.rs`
11. `bins/sidereal-replication/src/replication/input.rs`
12. `bins/sidereal-replication/src/replication/visibility/membership.rs`
13. `bins/sidereal-replication/src/replication/visibility/spatial_index.rs`
14. `bins/sidereal-replication/src/replication/persistence.rs`
15. `bins/sidereal-replication/src/replication/runtime_scripting.rs`
16. `crates/sidereal-game/src/lib.rs`
17. `crates/sidereal-game/src/flight.rs`
18. `crates/sidereal-game/src/combat.rs`
19. `crates/sidereal-net/src/lightyear_protocol/registration.rs`

If any implementation step changes an enforceable behavior, update the relevant feature contract in the same change. Do not leave new runtime contracts implicit in code.

## 3. Non-Negotiable Guardrails

1. Preserve server authority: `client input -> shard sim -> replication/distribution -> persistence`.
2. Clients never authoritatively set world transforms, velocities, ownership, health, inventory, control target, or persistent runtime state.
3. Realtime player input remains intent only. The server validates session binding, player identity, control generation, target entity, rate limits, and action payload bounds.
4. Client prediction and reconciliation remain Lightyear-owned. Do not add Sidereal transform repair loops, resync hacks, or client-side authoritative overrides.
5. Remote entities interpolate from replicated server state. Do not make remote clients simulate authoritative outcomes for other entities.
6. Authoritative world positions and velocities remain f64. Do not downcast server, persistence, replication protocol, or dashboard data boundaries.
7. Visibility preserves `Authorization -> Delivery -> Payload`.
8. AOI/spatial indexing may narrow candidate work only. It must not widen authorization or payload disclosure.
9. Visibility and residency are distinct. Visibility decides what a client receives; residency decides whether an actor exists as full runtime ECS or abstract persisted state.
10. Gameplay, prediction, and shared runtime math must remain in shared crates where applicable.
11. Backend diagnostics must use `sidereal-observability` and `SIDEREAL_DIAGNOSTICS`; do not add ad hoc noisy logging.
12. Large runtime refactors must split mixed concerns into domain modules instead of growing `main.rs`, `plugins.rs`, or large monolithic replication modules.

## 4. Current Backend Shape

### 4.1 Main Replication App

Important current scheduling points:

1. `bins/sidereal-replication/src/main.rs`
   - `REPLICATION_UPDATE_CAP_HZ` is currently opt-in. Uncapped `Update` is the correct default until load tests prove an idle cap cannot cause fixed catch-up.
   - `SiderealGamePlugin`, Avian `PhysicsPlugins`, Lightyear server plugins, and `Time::<Fixed>::from_hz(SIM_TICK_HZ)` are all wired into the same app.
   - Network/auth/control/input message receives run in `Update`.
   - `simulation_entities::enforce_planar_motion` runs in `FixedUpdate`.
2. `bins/sidereal-replication/src/plugins.rs`
   - `ReplicationInputPlugin` drains latest realtime inputs into action queues in `FixedUpdate`.
   - `ReplicationRuntimeScriptingPlugin` refreshes script snapshots, runs intervals/events, and applies script intents in `FixedUpdate`.
   - `ReplicationVisibilityPlugin` runs transform sync, observer anchors, visibility range computation, entity cache refresh, spatial index refresh, landmark discovery, visibility membership, and streaming in `FixedPostUpdate`.
   - `ReplicationPersistencePlugin` runs dirty marking, sector lifecycle services, periodic persistence flushing, spatial partition snapshots, and fixed-step diagnostics in `FixedPostUpdate`.

This means a long fixed-step catch-up burst can run many simulation/post-simulation systems before the next `Update` receive pass. That is incompatible with a low-latency input loop.

### 4.2 Input Pipeline

Current strengths:

1. `receive_latest_realtime_input_messages` drains Lightyear message receivers.
2. Inputs are bound to authenticated client/player identity.
3. Spoofed player IDs, stale control generations, future ticks, duplicates, rate-limit failures, and oversized packets are tracked.
4. The system keeps only the latest input by tick per player/control stream, avoiding unbounded backlog.
5. `drain_realtime_player_inputs_to_action_queue` applies input only to the current authoritative control target.

Current weaknesses:

1. Receive is scheduled in `Update`, not guaranteed before each fixed tick.
2. If fixed catch-up runs repeatedly, the server may apply old latest input for multiple fixed ticks before polling new input.
3. The receive path currently collects per-client messages into `Vec<ClientRealtimeInputMessage>` and then another `Vec` for valid claims. This is acceptable for one client but avoidable hot-path allocation at MMO scale.
4. Freshness is measured, but no current gate fails the server when input age grows beyond a gameplay SLO.

### 4.3 Shared Gameplay Simulation

`crates/sidereal-game/src/lib.rs` correctly centralizes shared fixed-step gameplay systems. The server-authoritative lane includes input validation, character movement, navigation target conversion, flight actions, weapons, projectiles, damage, destruction, mass recomputation, and engine thrust.

Current strengths:

1. Gameplay logic is shared and deterministic enough to support prediction/reconciliation contracts.
2. Flight and mass systems already have fast paths and metrics.
3. Current metrics indicate flight, mass, Lua, tactical, and visibility are not individually expensive in the latest one-client run.

Current weaknesses:

1. Some systems still build per-tick indexes instead of maintaining persistent dirty read models.
2. Combat/projectile code rebuilds `EntityGuid -> Entity` and hardpoint/weapon lookup state on hot paths.
3. Transform sync and planar enforcement scan broad physics/static sets each fixed tick.

### 4.4 Visibility, AOI, Tactical, and Sector Lifecycle

Current strengths:

1. The project already has `VisibilitySpatialIndex`, entity cache, cell/sector/region telemetry, migration events, dirty-cell worklist scaffolding, sector lifecycle state, default-off flush/removal/hydration executors, tactical read-model improvements, and owner manifest read models.
2. These are the right foundations and must be reused.

Current weaknesses:

1. Visibility membership still runs inside `FixedPostUpdate`.
2. The default path can still evaluate broad apply work against per-client state.
3. Tactical and owner-manifest streaming are logically lower cadence but still scheduled in the fixed post-update chain.
4. Sector lifecycle remains mostly default-off/scaffolded and does not yet enforce production residency tiers.

### 4.5 Persistence

Current strengths:

1. Persistence uses graph records and transactional graph writes.
2. Periodic writes are queued to a worker thread.
3. Dirty entity tracking and fingerprinting avoid many unnecessary writes.

Current weaknesses:

1. `flush_simulation_state_persistence` is an exclusive system in `FixedPostUpdate`.
2. Dirty incremental collection still scans all `(Entity, EntityGuid)` rows to map dirty GUIDs back to ECS entities.
3. Critical snapshot helpers can still walk mounted trees by scanning mounted entities.
4. Serialization and collection should not share timing with the input/physics critical path.

### 4.6 Gateway

The gateway should remain auth, assets, admin/bootstrap, and metrics surface. It should not become the live game-state arbitration bus. MMO scale should come from shard runtime structure, load balancing, asset caching/CDN behavior, and token validation efficiency, not from pushing authoritative world state through the gateway.

## 5. Evidence From Latest Audited Run

Source: local observability metrics in database table `observability_metric_samples`, latest audited replication run on 2026-05-07.

Key values:

1. `input_drop_total`: p50 0, p95 0, max 0, last 0.
2. `input_accepted_total`: last/max 9148.
3. `fixed_ticks_last_update`: p50 1, p95 15, max 15, last 15.
4. `input_oldest_age_ms`: p50 0, p95 about 248 ms, max about 312 ms, last about 277 ms.
5. `fixed_tick_last_wall_ms`: p50 about 8.5 ms, p95 about 14.1 ms, max about 18.1 ms.
6. `fixed_tick_over_budget_total`: last 238.
7. `process.cpu.usage_percent`: p50 about 136%, p95 about 150%, max about 157%.
8. `visibility_query_ms`: p95 about 2.1 ms.
9. `visibility_apply_ms`: p95 about 1.5 ms.
10. `gameplay_apply_engine_last_ms`: p95 about 0.23 ms.
11. `gameplay_mass_recompute_last_ms`: p95 about 0.06 ms.
12. `lua_runtime.last_interval_run_ms`: p95 about 0.10 ms.
13. `tactical_stream_last_ms`: p95 about 0.04 ms.

Interpretation:

1. The current rubberband symptom is not explained by dropped input.
2. The server is allowing input to age while it catches up fixed work.
3. Even systems that are cheap individually become dangerous if they are tied to a catch-up path that can run 15 times before fresh input polling.
4. The first fix must target scheduling and input cadence before deeper micro-optimizations.

## 6. Target Architecture

### 6.1 Scale Model

Sidereal should target thousands of connected clients across a physical server fleet or host group, not thousands of players inside one unbounded 60 Hz Avian physics bubble.

Recommended target model:

1. Gateway process:
   - authentication,
   - session/token issuance,
   - asset delivery,
   - bootstrap/admin APIs,
   - shard routing metadata.
2. Replication shard process:
   - owns authoritative ECS for loaded runtime sectors,
   - owns realtime input validation,
   - owns physics/gameplay for hot sectors,
   - owns AOI and replication delivery,
   - owns promotion/demotion decisions for its shard.
3. Persistence:
   - durability only,
   - not the live arbitration bus between competing authoritative writers.
4. Background/abstract simulation:
   - initially inside the replication host as lower-rate domain plugins,
   - can be extracted only after `LoadedRuntime` vs `AbstractOnly` ownership is explicit.

Single-shard practical goal:

1. support hundreds of connected clients when they are spatially distributed and mostly not in the same high-action AOI,
2. support a bounded dense local combat scene with predictable degradation,
3. preserve owner prediction and remote interpolation under load,
4. fail load tests early when input age grows instead of silently rubberbanding.

Fleet/zone practical goal:

1. support thousands of connected clients by running multiple shard/zone processes,
2. route players by sector/region,
3. migrate or hand off sessions at explicit boundaries later,
4. keep all authority single-writer per loaded entity.

### 6.2 Runtime Rate Lanes

The replication server must be reorganized into explicit runtime lanes.

#### Lane A: Realtime Network/Input Front Door

Cadence: as often as possible; must run before each authoritative fixed tick.  
Purpose:

1. poll Lightyear/transport receivers,
2. validate session/player binding,
3. collapse input to latest intent per player/control stream,
4. expose input freshness metrics,
5. never wait for visibility, persistence, tactical, Lua, or diagnostics work.

#### Lane B: Authoritative 60 Hz Simulation

Cadence: 60 Hz while the shard is healthy.  
Allowed work:

1. drain latest validated input to action queues,
2. apply authoritative gameplay input,
3. run controlled entity movement,
4. run active Avian physics for hot-sector dynamic bodies,
5. resolve essential combat/projectile/damage/destruction,
6. update minimal server-side state needed for immediate corrections.

Disallowed work:

1. broad visibility membership scans,
2. tactical full snapshots,
3. owner manifest streaming,
4. persistence serialization,
5. script full-world snapshot rebuilds,
6. dashboard world snapshot generation,
7. full static transform sync for unchanged entities.

#### Lane C: Motion Replication

Cadence: initially 20-30 Hz for remote interpolated entities; owner corrections may remain higher if required by validation.  
Purpose:

1. send motion deltas for visible dynamic entities,
2. prioritize controlled owner corrections,
3. prioritize nearby threats/projectiles,
4. throttle low-importance remote motion.

#### Lane D: Visibility/AOI Membership

Cadence: 5-10 Hz, plus event-driven immediate work for control handoff/spawn/despawn/sector crossing.  
Purpose:

1. update observer cells,
2. process dirty entity cells,
3. compute gain/loss sets under budget,
4. enforce visibility authorization before delivery,
5. queue replication visibility changes.

#### Lane E: Tactical, Owner Manifest, Asset Notice Streams

Cadence: 0.5-2 Hz or event-driven.  
Purpose:

1. tactical contact snapshots/deltas,
2. owner asset manifest snapshots/deltas,
3. asset catalog version notices,
4. notification streams.

These streams should be priority/budgeted and must not delay input or physics.

#### Lane F: Persistence and Sector Residency

Cadence: asynchronous or low-rate budgeted.  
Purpose:

1. mark dirty entities cheaply,
2. collect graph snapshots from dirty entity IDs without broad world scans,
3. enqueue coalesced writes,
4. flush/demote cold sectors,
5. hydrate/promote interested sectors.

Persistence backpressure must degrade persistence freshness, not input freshness.

#### Lane G: Runtime Scripting

Cadence: script-declared intervals with server-enforced minimums and CPU/intent budgets.  
Purpose:

1. run intent-only Lua handlers,
2. maintain dirty script-observable snapshots,
3. cap per-frame script work,
4. queue validated intents into the authoritative sim.

Scripts must not directly mutate transforms, velocities, ownership, health, or persistence.

#### Lane H: Diagnostics and Dashboard Snapshots

Cadence: low-rate snapshots, never on critical input path.  
Purpose:

1. health JSON,
2. observability metric export,
3. spatial partition dashboard data,
4. load-test summaries.

## 7. Phase 0: Freeze Baseline and Define Gates

Goal: Make the failure measurable before changing architecture.

Primary files:

1. `bins/sidereal-replication/src/main.rs`
2. `bins/sidereal-replication/src/replication/health.rs`
3. `bins/sidereal-replication/src/replication/observability.rs`
4. `docs/features/active/server_observability_metrics_contract.md`
5. `scripts/`

Tasks:

1. Confirm `REPLICATION_UPDATE_CAP_HZ` is unset for baseline captures.
2. Record whether the server is running uncapped, capped, or default runner in health/metrics.
3. Add or verify metrics for:
   - `fixed_ticks_last_update`,
   - `fixed_tick_last_wall_ms`,
   - `fixed_tick_over_budget_total`,
   - `input_oldest_age_ms`,
   - `input_receive_last_ms`,
   - `input_receive_to_drain_last_ms`,
   - Lightyear send queue depth if available,
   - bytes/client/sec if available,
   - per-lane wall time after lanes exist.
4. Define hard SLOs:
   - `fixed_ticks_last_update p95 <= 2`,
   - `input_oldest_age_ms p95 < 50 ms`,
   - `receive_to_drain_last_ms p95 < 25 ms`,
   - `fixed_tick_last_wall_ms p95 < 8 ms` at 60 Hz,
   - zero sustained input drops under supported client send rates.
5. Add a baseline capture script that records:
   - server DB metrics,
   - server health JSON,
   - client prediction/reconciliation diagnostics,
   - CPU and memory,
   - exact env vars.

Acceptance criteria:

1. A fresh agent can reproduce the one-client rubberband baseline.
2. The baseline clearly distinguishes packet loss, input validation drops, input age, fixed catch-up, and client presentation delay.
3. The SLOs are documented in `docs/features/active/server_observability_metrics_contract.md`.

## 8. Phase 1: Decouple Input Polling From Bevy Update

Goal: Fresh validated input must be available before every authoritative fixed tick.

Primary files:

1. `bins/sidereal-replication/src/main.rs`
2. `bins/sidereal-replication/src/plugins.rs`
3. `bins/sidereal-replication/src/replication/input.rs`
4. Lightyear fork files if upstream scheduling support is required.

Tasks:

1. Investigate the safest way to pump Lightyear/transport receivers before each fixed tick:
   - preferred: a dedicated server network/input front door independent of Bevy `Update` cadence,
   - acceptable first step: schedule a pre-fixed input pump that is guaranteed to run before every fixed tick and can safely access Lightyear receivers,
   - if Lightyear prevents this cleanly, write a dedicated handoff prompt for the `Dastari/lightyear` fork rather than adding a Sidereal-specific workaround.
2. Keep `receive_latest_realtime_input_messages` semantics:
   - session-bound player ID,
   - canonical player ID validation,
   - control generation validation,
   - controlled target validation,
   - future/duplicate/rate/size validation,
   - latest tick wins.
3. Remove avoidable hot-path allocations:
   - process receiver iterators in one pass,
   - track best valid message without collecting all messages into `Vec`,
   - reuse action buffers where practical,
   - keep payload bounds explicit.
4. Store input in a bounded latest-value resource keyed by:
   - client entity,
   - player runtime ID,
   - controlled runtime ID,
   - control generation.
5. Drain latest input before authoritative gameplay systems every fixed tick.
6. If the server is catching up multiple fixed ticks, poll/drain fresh input between ticks where possible.
7. Add metrics:
   - input pump runs per real second,
   - fixed ticks run without fresh input poll,
   - oldest latest-input age at tick start,
   - latest accepted tick to applied tick gap,
   - messages discarded by latest-wins collapse.

Acceptance criteria:

1. In the one-client localhost repro, `input_oldest_age_ms p95 < 50 ms`.
2. Fixed catch-up does not cause repeated use of stale input when newer input is already available.
3. Input validation/security behavior is unchanged.
4. Unit tests cover spoofed player ID, stale generation, target mismatch, duplicate/out-of-order tick, and latest-wins collapse.
5. A native multiplayer validation capture confirms prediction/reconciliation does not regress.

## 9. Phase 2: Introduce Explicit Server Runtime Lanes

Goal: Remove noncritical work from the 60 Hz critical path.

Primary files:

1. `bins/sidereal-replication/src/plugins.rs`
2. `bins/sidereal-replication/src/main.rs`
3. `bins/sidereal-replication/src/replication/health.rs`
4. `bins/sidereal-replication/src/replication/observability.rs`
5. new `bins/sidereal-replication/src/replication/runtime_lanes.rs` or equivalent module

Tasks:

1. Define explicit runtime lane sets/resources:
   - `RealtimeInputLane`,
   - `AuthoritativeSimLane`,
   - `MotionReplicationLane`,
   - `VisibilityAoiLane`,
   - `TacticalStreamLane`,
   - `PersistenceLane`,
   - `ScriptingLane`,
   - `DiagnosticsLane`.
2. Add per-lane timers and budgets:
   - target cadence,
   - max work items per run,
   - max wall time per run,
   - over-budget counters,
   - skipped/deferred work counters.
3. Move these systems out of every fixed post-update pass:
   - `visibility::update_network_visibility`,
   - `tactical::stream_tactical_snapshot_messages`,
   - `owner_manifest::stream_owner_asset_manifest_messages`,
   - `assets::stream_asset_catalog_version_messages`,
   - `persistence::flush_simulation_state_persistence`,
   - `visibility::update_spatial_partition_snapshot`,
   - `runtime_scripting::refresh_script_world_snapshot`,
   - `runtime_scripting::run_script_intervals`,
   - `runtime_scripting::run_script_events`.
4. Keep only minimal data production in fixed sim:
   - dirty position/cell flags,
   - combat events,
   - control handoff events,
   - entity spawn/despawn/change notifications.
5. Ensure fixed-step diagnostics measure the true critical lane, not every noncritical lane.
6. Add lane metrics to health and observability.

Acceptance criteria:

1. With visibility/tactical/persistence/scripting enabled, the authoritative fixed lane stays within SLO for one client.
2. Under synthetic load, low-priority lanes defer work instead of causing input age growth.
3. Health output shows which lane is over budget when load increases.
4. No visibility, persistence, scripting, or tactical behavior changes are hidden by the move; all behavior changes are documented.

## 10. Phase 3: Motion Replication Rate and Priority Audit

Goal: Replicate the right data at the right rate for prediction/interpolation.

Primary files:

1. `bins/sidereal-replication/src/replication/lifecycle.rs`
2. `crates/sidereal-net/src/lightyear_protocol/registration.rs`
3. `crates/sidereal-game/src/components/`
4. `bins/sidereal-replication/src/replication/control.rs`
5. `bins/sidereal-replication/src/replication/visibility/membership.rs`

Tasks:

1. Audit every replicated component:
   - high-frequency motion,
   - medium-frequency combat/gameplay status,
   - low-frequency static/config data,
   - owner-only data,
   - spawn-only or rare-update data.
2. Do not remove functionality. Instead assign cadence/priority policy for each replicated class.
3. Keep controlled owner prediction/correction reliable enough for reconciliation.
4. Move remote entity motion toward 20-30 Hz snapshots plus interpolation buffers where validation allows.
5. Prioritize replication by:
   - owned controlled entity,
   - entities currently interacting with the player,
   - nearby threats/projectiles,
   - nearby dynamic entities,
   - nearby static entities,
   - far tactical-only summaries.
6. Investigate Lightyear support for:
   - per-entity/component priority,
   - send frequency control,
   - visibility group priority,
   - bandwidth budget/backpressure,
   - explicit "since last ack" behavior under large AOI.
7. If Lightyear lacks generic required support, prefer a small project-agnostic fork improvement.

Acceptance criteria:

1. A component cadence table is added to the relevant docs.
2. Remote interpolation remains smooth at reduced motion send rates.
3. Owner prediction corrections remain timely.
4. Bandwidth/client/sec is measured and bounded in load tests.
5. Static/config components do not consume steady 60 Hz bandwidth.

## 11. Phase 4: Cell-Owned AOI and Visibility Budgets

Goal: Replace broad visibility work with dirty cell/observer processing.

Primary files:

1. `bins/sidereal-replication/src/replication/visibility/spatial_index.rs`
2. `bins/sidereal-replication/src/replication/visibility/membership.rs`
3. `bins/sidereal-replication/src/replication/visibility/context_cache.rs`
4. `bins/sidereal-replication/src/replication/visibility/policy.rs`
5. `docs/features/active/visibility_replication_contract.md`

Tasks:

1. Graduate the previously default-off cell dirty worklist through validation instead of building a parallel system.
   - Current implementation: the cell-dirty worklist is the default AOI apply path with an explicit `SIDEREAL_VISIBILITY_USE_CELL_DIRTY_WORKLIST=0|false|off` rollback override.
2. Make cell membership primary for AOI work:
   - `cell -> entities`,
   - `entity -> cell`,
   - `client -> interested cells`,
   - `cell -> interested clients`,
   - `client -> visible entities`,
   - `entity -> visible clients`.
3. Process work from:
   - dirty entity cells,
   - dirty observer cells,
   - entity spawn/despawn,
   - control handoff,
   - visibility range changes,
   - faction/public/ownership policy changes,
   - sector promotion/demotion.
4. Add per-run budgets:
   - max dirty cells,
   - max observers,
   - max gain/loss operations,
   - max policy evaluations,
   - max deferred queue age.
5. Add priority classes:
   - mandatory owner/control visibility,
   - combat-threatening entities,
   - projectiles,
   - nearby dynamic bodies,
   - nearby static landmarks,
   - far/static low-priority entities.
6. Preserve exact authorization:
   - AOI narrows candidate sets only,
   - policy still decides authorization,
   - payload redaction still follows authorization.
7. Add hysteresis to reduce visibility gain/loss churn where already supported by the visibility contract.
8. Add tests for:
   - entity crosses cell,
   - observer crosses cell,
   - range changes,
   - entity despawns,
   - policy changes without movement,
   - owner mandatory visibility,
   - no disclosure outside policy.

Acceptance criteria:

1. Visibility work scales with changed cells/observers, not all replicated entities times all clients.
2. `visibility_apply_ms` and policy evaluation counts stay bounded in dense synthetic tests.
3. Deferred visibility queue age is visible in metrics and remains below configured limits.
4. The visibility contract is updated with the final budget/priority behavior.

## 12. Phase 5: Sector Residency and Background Simulation

Goal: Stop paying full runtime cost for cold sectors.

Primary files:

1. `docs/features/proposed/background_world_simulation_proposal.md`
2. `bins/sidereal-replication/src/replication/visibility/sector_lifecycle.rs`
3. `bins/sidereal-replication/src/replication/visibility/spatial_index.rs`
4. `bins/sidereal-replication/src/replication/persistence.rs`
5. `bins/sidereal-replication/src/replication/simulation_entities.rs`

Tasks:

1. Promote the existing sector lifecycle scaffolding from diagnostic/default-off to validated staged behavior:
   - `Hot`,
   - `Warm`,
   - `ColdPendingFlush`,
   - `ColdPersisted`,
   - `Hydrating`.
2. Define runtime simulation tiers:
   - `FullRuntime`: full ECS/Avian/replication participation,
   - `ReducedCadence`: loaded but low-rate abstract/cold processing,
   - `PersistedCold`: not loaded into authoritative ECS,
   - `Hydrating`: transition state.
3. Enforce blockers:
   - player anchor,
   - controlled entity,
   - projectile/combat in progress,
   - mission/story pin,
   - cross-sector hierarchy,
   - in-flight persistence write,
   - unresolved visibility interest.
4. Ensure only `FullRuntime` hot sectors have active Avian bodies for ordinary gameplay physics.
5. Static non-physics bodies must stay on the `WorldPosition` / `WorldRotation` lane unless actually simulated.
6. Hydration must:
   - load graph records,
   - preserve UUID identities,
   - rebuild hierarchy/mount relationships deterministically,
   - restore f64 world positions,
   - apply offline progression only through explicit abstract simulation rules.
7. Demotion must:
   - serialize durable state,
   - verify write completion,
   - remove ECS entities,
   - purge visibility/tactical/physics indexes,
   - mark sector `ColdPersisted`.
   - Current implementation: verified runtime removal purges visibility, tactical, owner-manifest, deferred-membership, and persistence relationship indexes synchronously with ECS despawn; Avian physics state is removed by entity despawn.
8. Add synthetic sector-crossing tests.

Acceptance criteria:

1. Cold sectors no longer appear in full physics queries.
2. Hot sector promotion/hydration does not hitch the input lane.
3. Demotion never removes a player-controlled, mission-pinned, combat-active, or cross-sector hierarchy entity.
4. Load tests prove entity count can grow globally without growing hot-lane cost linearly.

## 13. Phase 6: Persistent Hot-Path Indexes

Goal: Remove repeated broad scans and per-tick map rebuilding from gameplay/server hot paths.

Primary files:

1. `crates/sidereal-game/src/combat.rs`
2. `crates/sidereal-game/src/flight.rs`
3. `crates/sidereal-game/src/mass.rs`
4. `bins/sidereal-replication/src/replication/persistence.rs`
5. `bins/sidereal-replication/src/replication/simulation_entities.rs`
6. new shared index modules where appropriate

Indexes to add or formalize:

1. `EntityGuid -> Entity`.
2. `Entity -> EntityGuid`.
3. root entity -> mounted modules.
4. root entity -> weapons.
5. root entity -> hardpoints.
6. root entity -> fuel tanks.
7. root entity -> mass contributors.
8. active controlled roots.
9. active projectiles.
10. script-observable entities.
11. persistable dirty entity IDs -> ECS entities.

Implementation rules:

1. Update indexes from `Added<T>`, `Changed<T>`, removals, hierarchy/mount changes, hydration, and runtime removal.
2. Avoid rebuilding large maps every fixed tick.
3. Keep indexes generic over entities where behavior is generic.
4. Keep gameplay-core indexes in shared crates only when client prediction also needs them.
5. Keep server-only indexes inside replication modules when they include transport, persistence, visibility, or database concerns.

Specific hot-path replacements:

1. Combat:
   - replace per-shot hardpoint map rebuild with a dirty hardpoint read model,
   - replace per-shooter scan over all weapons with root-indexed weapon lists,
   - replace per-projectile tick GUID map rebuild with a persistent GUID index,
   - keep projectile active set bounded and measured.
2. Flight:
   - maintain dirty root -> module/fuel/thrust read models,
   - avoid scanning unrelated bodies/modules when no root owns simulation authority.
3. Mass:
   - preserve dirty-root behavior,
   - share mounted/inventory graph indexes instead of rebuilding equivalent maps.
4. Persistence:
   - use persistent GUID index for dirty collection,
   - remove broad `(Entity, EntityGuid)` scan in incremental flush,
   - use a maintained `EntityGuid`/`MountedOn` relationship index for critical mounted-tree snapshots.
5. Transform sync:
   - sync only active/changed physics bodies where possible,
   - avoid syncing static `WorldPosition` transforms every fixed tick when unchanged.
6. Planar enforcement:
   - apply to active full-runtime physics bodies,
   - consider changed/active filters if Avian exposes enough state,
   - keep NaN protection for authoritative simulation.

Acceptance criteria:

1. Hot-path allocations decrease under profiling.
2. Gameplay behavior remains unchanged.
3. Broad-scan counters exist and are near zero in stable scenes.
4. Combat and projectile dense tests do not rebuild full-world maps every tick.

## 14. Phase 7: Runtime Scripting Cadence and Budgets

Goal: Keep Lua useful without letting scripts consume the sim lane.

Primary files:

1. `bins/sidereal-replication/src/replication/runtime_scripting.rs`
2. `docs/features/reference/scripting_support_reference.md`
3. `docs/features/proposed/background_world_simulation_proposal.md`

Tasks:

1. Replace full snapshot rebuild every fixed tick with dirty snapshot maintenance:
   - script-observable entity added/removed,
   - position changed,
   - script state changed,
   - relevant relationship changed.
   - Current implementation: `ScriptWorldSnapshot` is dirty-maintained from `EntityGuid`, position, `Transform`, and `ScriptState` add/change/removal events on the scripting lane.
2. Do not clone the entire script snapshot for every interval/event pass.
3. Run interval handlers only at declared cadence with a server minimum interval.
4. Add script budgets:
   - max handlers per lane run,
   - max wall time,
   - max intents emitted,
   - max queued events,
   - max stale queue age.
   - Current implementation: handler/event/intent count budgets, interval/event wall-time budgets, and stale event queue age are all optional environment-configured limits; unset defaults preserve existing behavior.
5. Ensure script intents enter authoritative systems through validated intent queues only.
6. Split script categories:
   - combat/event immediate intents,
   - low-rate NPC/world intents,
   - background/abstract simulation intents.
7. Add metrics:
   - script snapshot dirty updates,
   - script handlers run,
   - skipped/deferred handlers,
   - intent count,
   - over-budget count.

Acceptance criteria:

1. No full-world script snapshot rebuild occurs on every 60 Hz tick.
2. Script over-budget behavior defers script work instead of delaying input/physics.
3. Scripts remain intent-only.
4. Tests verify scripts cannot directly authoritatively mutate transforms/velocities.

## 15. Phase 8: Persistence Isolation and Backpressure

Goal: Persistence durability must not cause realtime rubberbanding.

Primary files:

1. `bins/sidereal-replication/src/replication/persistence.rs`
2. `crates/sidereal-persistence/src/lib.rs`
3. `docs/features/proposed/background_world_simulation_proposal.md`
4. `docs/features/active/server_observability_metrics_contract.md`

Tasks:

1. Keep dirty marking cheap in the sim lane.
2. Move dirty entity collection/serialization to a low-rate or async lane.
3. Use persistent GUID indexes so dirty IDs map directly to ECS entities.
4. Keep persistence worker channels bounded.
5. Coalesce high-churn records by entity ID; latest durable snapshot wins before write.
6. Report and enforce backpressure:
   - queued batches,
   - records queued,
   - records coalesced,
   - oldest pending write age,
   - worker busy duration,
   - failed writes.
7. Ensure shutdown/admin persistence remains explicitly blocking only at shutdown/admin boundaries.
8. Prevent sector demotion until persistence write verification completes.

Acceptance criteria:

1. Persistence queue growth does not increase input age.
2. Incremental dirty flush does not scan all entities.
3. Sector flush/demotion remains correct and durable.
4. Persistence failures surface through health/observability without corrupting authority.

## 16. Phase 9: Headless Synthetic Client Load Harness

Goal: Validate the architecture with repeatable load, not manual observation.

Primary locations:

1. `scripts/`
2. `bins/` or `crates/` for a headless test client if needed
3. `docs/features/active/server_observability_metrics_contract.md`

Harness requirements:

1. Spawn configurable synthetic clients:
   - 1,
   - 10,
   - 50,
   - 100,
   - 250,
   - 500,
   - 1000.
2. Support workloads:
   - idle connected,
   - movement only,
   - movement plus control handoff,
   - dense local combat,
   - projectile spam within configured gameplay limits,
   - sector crossing,
   - visibility churn,
   - tactical scanner load,
   - persistence churn.
3. Produce summary output:
   - accepted inputs/sec,
   - input drops by reason,
   - input age percentiles,
   - receive-to-drain percentiles,
   - fixed tick wall percentiles,
   - fixed catch-up percentiles,
   - lane wall times,
   - visibility work counts,
   - replication bytes/client/sec,
   - send queue/backpressure metrics,
   - CPU/core utilization,
   - memory/client,
   - sector hot/warm/cold counts.
4. Support failure thresholds:
   - fail if input age exceeds SLO,
   - fail if fixed catch-up exceeds SLO,
   - fail if queue age grows without bound,
   - fail if client prediction gap grows beyond contract.

Acceptance criteria:

1. The one-client localhost repro becomes a passing regression test.
2. The harness can run without rendering.
3. Load results are saved with env vars and git commit metadata.
4. CI or nightly jobs can run smaller tiers; manual/long-running jobs can run larger tiers.

## 17. Phase 10: Shard and Operational Scale

Goal: Prepare for thousands of clients through shard/zone processes.

Tasks:

1. Define shard identity and routing metadata:
   - shard ID,
   - region bounds,
   - sector ownership,
   - player session assignment,
   - handoff state for future work.
2. Keep single-writer authority per loaded entity.
3. Do not introduce dual authoritative DB writers.
4. Add gateway routing support only after shard contracts are explicit.
5. Add operational metrics:
   - connected clients per shard,
   - hot entities per shard,
   - active sectors per shard,
   - per-shard CPU/memory,
   - per-shard input age,
   - per-shard replication bandwidth.
6. Define overload behavior:
   - reduce noncritical lane budgets first,
   - lower far-entity replication rates,
   - defer tactical/manifest updates,
   - restrict new dense-sector entry if needed,
   - never silently delay authoritative input beyond SLO without surfacing unhealthy state.

Acceptance criteria:

1. The architecture document explains that thousands connected means multi-shard/zone operation.
2. A single shard has explicit supported dense-scene limits.
3. Overload behavior is deterministic and observable.

## 18. Code-Level Task Checklist

Use this checklist to break implementation into PR-sized changes.

### 18.1 Input

1. Add input front-door metrics and SLO fields.
2. Remove receive-path `Vec` collections where possible.
3. Add pre-fixed or independent network input pump.
4. Prove fresh input before each fixed tick.
5. Add input security and latest-wins tests.

### 18.2 Scheduling

1. Introduce runtime lane resources/sets.
2. Move scripting out of fixed update.
3. Move visibility membership to lane cadence.
4. Move tactical/owner/asset streams to low-rate lane.
5. Move persistence collection to persistence lane.
6. Add lane budget/defer metrics.

### 18.3 Visibility

1. Validate and promote the previously default-off cell dirty worklist.
2. Add dirty observer/entity work queues.
3. Add gain/loss budgets.
4. Add policy-change invalidation.
5. Default to cell-owned AOI once tests and captures pass.

### 18.4 Sector Residency

1. Validate flush executor.
2. Validate removal executor.
3. Validate hydration executor.
4. Add tiered runtime cadence.
5. Ensure cold sectors leave full physics and visibility hot indexes.

### 18.5 Gameplay

1. Add shared/server indexes.
2. Refactor combat hardpoint/weapon lookups.
3. Refactor projectile GUID lookup.
4. Refactor flight module/fuel caches if profiling requires.
5. Refactor transform sync and planar enforcement to active/changed sets where safe.

### 18.6 Scripting

1. Dirty script snapshot.
2. No full clone per interval pass.
3. Script CPU/intent budgets.
4. Script cadence validation.
5. Tests for intent-only authority.

### 18.7 Persistence

1. Persistent GUID index for dirty collection.
2. Async/low-rate serialization.
3. Coalesced bounded worker queue.
4. Backpressure metrics.
5. Sector demotion write verification.
6. Indexed mounted-tree critical snapshots.

### 18.8 Replication Payload

1. Component cadence audit.
2. Motion snapshot rate validation.
3. Bandwidth metrics.
4. Priority policy.
5. Lightyear fork prompts for missing generic features.

## 19. Validation Matrix

Every phase that touches runtime behavior must run the relevant subset of this matrix.

### 19.1 Correctness

1. Login/auth/session binding.
2. Player entity hydration.
3. Control target assignment.
4. Client prediction starts after control.
5. Server reconciliation corrects invalid prediction.
6. Remote interpolation works for other clients.
7. Visibility gain sends correct initial state for stationary entities.
8. Visibility loss removes or hides entities correctly.
9. Sector demotion never removes controlled entities.
10. Sector hydration restores f64 positions and hierarchy.

### 19.2 Performance

1. One local client for 5 minutes.
2. One local client with continuous movement for 5 minutes.
3. Two clients watching each other.
4. Dense asteroid/landmark scene.
5. Dense combat/projectiles.
6. 100 synthetic clients distributed across sectors.
7. 100 synthetic clients concentrated in one combat sector.
8. 500 synthetic idle/distributed clients.
9. 1000 synthetic idle/distributed clients.

### 19.3 Metrics Gates

1. `input_drop_total == 0` under valid synthetic input.
2. `input_oldest_age_ms p95 < 50 ms`.
3. `receive_to_drain_last_ms p95 < 25 ms`.
4. `fixed_ticks_last_update p95 <= 2`.
5. `fixed_tick_last_wall_ms p95 < 8 ms` for 60 Hz.
6. Visibility deferred queue age below configured maximum.
7. Persistence queue age below configured maximum during normal operation.
8. Scripting over-budget count does not correlate with input age growth.
9. Bandwidth/client/sec within defined budget for each workload.

## 20. What Not To Do

1. Do not solve rubberbanding by trusting client transforms.
2. Do not add client-side transform repair loops that fight Lightyear reconciliation.
3. Do not reintroduce legacy motion mirror components for runtime simulation or replication.
4. Do not make the database the live synchronization path between competing authoritative writers.
5. Do not run all visibility, tactical, persistence, scripting, and diagnostics work at 60 Hz.
6. Do not make spatial candidate generation a substitute for visibility authorization.
7. Do not default to WebSocket for future WASM transport work.
8. Do not add server log spam or ad hoc debug env vars outside `SIDEREAL_DIAGNOSTICS`.
9. Do not optimize by deleting required gameplay functionality; add rate, priority, budget, and residency instead.
10. Do not claim MMO readiness from manual one-client testing.

## 21. Recommended First Implementation Slice

The first implementation slice should be narrow and should not attempt the whole MMO restructure at once.

Order:

1. Add/confirm metrics and SLO reporting for update cap mode, input age, receive-to-drain, and fixed catch-up.
2. Refactor input receive to avoid per-client message `Vec` allocation while preserving exact validation behavior.
3. Make input polling happen before every authoritative fixed tick or create a Lightyear fork handoff if the current integration prevents that cleanly.
4. Move runtime scripting out of the 60 Hz fixed path or gate it behind a lower-rate lane with budgets.
5. Move visibility/tactical/persistence streaming out of every fixed post-update pass into explicit lanes.
6. Run the one-client localhost repro for at least 5 minutes and prove:
   - zero valid input drops,
   - `input_oldest_age_ms p95 < 50 ms`,
   - `fixed_ticks_last_update p95 <= 2`,
   - no sustained reconciliation rubberband.

Only after this slice passes should the project move on to AOI cell ownership, sector residency defaults, and large synthetic client counts.

## 22. Documentation Updates Required During Implementation

Update these docs as behavior becomes enforceable:

1. `docs/features/active/server_observability_metrics_contract.md`
   - SLOs,
   - lane metrics,
   - load-test metrics,
   - unhealthy-state definitions.
2. `docs/features/active/visibility_replication_contract.md`
   - cell-owned AOI worklist,
   - visibility budgets,
   - priority/defer behavior,
   - no-disclosure guarantees.
3. `docs/features/proposed/background_world_simulation_proposal.md`
   - sector residency default behavior,
   - promotion/demotion triggers,
   - reduced-cadence simulation rules.
4. `docs/features/reference/prediction_runtime_tuning_and_validation_reference.md`
   - any changed prediction/reconciliation validation gates.
5. `docs/features/reference/lightyear_upstream_issue_snapshot_reference.md`
   - any Lightyear limitation found during input pump or replication priority work.
6. `docs/architecture/sidereal_design_document.md`
   - final shard/rate-lane/residency architecture once implemented.

Each update must include dated `YYYY-MM-DD` status notes.

## 23. Completion Definition

This restructure is complete only when:

1. one local native client can run for at least 10 minutes with no sustained rubberband from server input aging,
2. two native clients can observe each other with correct owner prediction and remote interpolation,
3. synthetic distributed client tests pass at the agreed tier,
4. dense-sector tests fail gracefully through budget/defer mechanisms instead of corrupting input cadence,
5. cold sectors do not consume full physics/runtime cost,
6. visibility remains policy-correct under AOI budgets,
7. persistence backpressure cannot delay realtime input,
8. all new critical behavior is documented,
9. quality gates pass for touched code,
10. WASM impact is documented for any shared runtime changes.
