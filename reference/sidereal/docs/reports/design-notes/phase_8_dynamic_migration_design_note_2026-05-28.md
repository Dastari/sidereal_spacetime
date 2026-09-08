# Phase 8 Dynamic Migration Design

Status: Archived
Lifecycle: historical-report
Category: report
Last updated: 2026-06-04
Owners: report author
Scope: Phase 8 Dynamic Migration Design.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

Date: 2026-05-28  
Status: read-only design kickoff  
Scope: Phase 8 migrate-only decomposition, alert shape, gateway coordinator, and first implementation slice.

No hard architecture conflict was found. The main implementation gap is that Phase 7 handoff is currently controlled-root-specific and only enabled when a shard owns one region (`bins/sidereal-replication/src/replication/handoff.rs:278`, `bins/sidereal-replication/src/replication/handoff.rs:290`, `bins/sidereal-replication/src/replication/handoff.rs:1339`). Phase 8 must generalize it before region migration can be real.

## 1. Sub-phase Decomposition

8.1: Shard load evaluator and alert protocol, observe-only. Add rolling 1 Hz trigger state from health inputs and publish `ShardLoadAlert`; document thresholds from the plan (`docs/plans/completed/distribution_scaling_and_single_shard_hardening_plan_2026-05-21.md:412`). This can land without changing route state.

8.2: Gateway load coordinator skeleton and capacity state. Add gateway shared coordinator state beside the existing route table/health monitor construction (`bins/sidereal-gateway/src/api.rs:126`, `bins/sidereal-gateway/src/api.rs:136`, `bins/sidereal-gateway/src/api.rs:680`) and collect per-shard capacity from health/alerts. No migration yet.

8.3: Region migration orchestration. Add a gateway migration job model, source/target commands, lease-state transitions, and generic per-root handoff. This depends on 8.1 alert input and 8.2 capacity state. It must address the one-lease-per-region route-table shape (`crates/sidereal-core/src/sharding.rs:313`) because in-flight migration needs both source and target lease context.

8.4: Cadence reduce plus admission control. Implement the second and third fallback after migrate, matching DR-0040 ordering (`docs/decisions/dr-0040_distribution_and_persistence_authority_model.md:101`). Admission touches world entry selection (`bins/sidereal-gateway/src/api.rs:543`) and route selection (`bins/sidereal-gateway/src/api.rs:590`), so it should follow the coordinator.

8.5: Degraded-mode UI contract and `shard_migrate_under_load`. Finalize canonical `shard_degraded_reasons` behavior (`bins/sidereal-replication/src/replication/health.rs:290`) and run/tune the full integration test against Phase 8 acceptance (`docs/plans/completed/distribution_scaling_and_single_shard_hardening_plan_2026-05-21.md:426`).

## 2. `ShardLoadAlert` Wire Shape

Recommendation, user decision point: make `ShardLoadAlert` an acked internal gateway HTTP POST, not ghost lane and not UDP bootstrap. Rationale: direction is shard-to-gateway, gateway already exposes internal HTTP for handoff tokens (`bins/sidereal-gateway/src/api.rs:184`, `bins/sidereal-gateway/src/api.rs:570`), while bootstrap UDP is fire-and-forget (`bins/sidereal-gateway/src/auth/bootstrap_dispatch.rs:157`) and too weak for load orchestration.

DTO location: `sidereal_core::gateway_dtos`, alongside handoff token DTOs already shared by gateway and replication (`bins/sidereal-gateway/src/api.rs:25`, `bins/sidereal-replication/src/replication/handoff.rs:396`). Endpoint landing point: add `/internal/v1/shard-load-alert` next to `/internal/v1/handoff-token` (`bins/sidereal-gateway/src/api.rs:182`). Shape:

- `protocol_version`, `alert_id`, `source_shard_id`, `lease_epochs_by_region`, `owned_regions`, `candidate_hot_region`.
- `generated_at_unix_ms`, `sample_window_s`, `consecutive_samples`.
- `triggered_conditions: [{ metric_key, observed_value, threshold, consecutive_samples }]` for the four Phase 8 thresholds (`docs/plans/completed/distribution_scaling_and_single_shard_hardening_plan_2026-05-21.md:413`).
- `capacity_snapshot`: connected clients, hot entities, input age, Lightyear queue depths, outbound bytes/client/s, fixed tick wall p95.

Delivery: acked, idempotent, and rate-limited. Publish on threshold crossing and then at most once per 30 s while still hot. Gateway deduplicates by `alert_id` and newest `generated_at_unix_ms`.

## 3. Region Migration vs Entity Handoff

The plan says per-entity reuse for all entities in the region (`docs/plans/completed/distribution_scaling_and_single_shard_hardening_plan_2026-05-21.md:419`), and DR-0040 says region migration uses the same Prepare/Commit shape scaled up (`docs/decisions/dr-0040_distribution_and_persistence_authority_model.md:101`). Treat that as N per-root handoffs, not a bulk binary transfer, for Phase 8.

Controlled player roots use Pattern A exactly as Phase 7: fresh client connection, gateway-signed route token, and target ready ack after first replication send (`docs/plans/completed/distribution_scaling_and_single_shard_hardening_plan_2026-05-21.md:381`, `bins/sidereal-replication/src/replication/handoff.rs:1092`). Non-player roots should reuse snapshot/hydrate/freeze/retire semantics but skip client route-token and ready-ack paths (`bins/sidereal-replication/src/replication/handoff.rs:380`, `bins/sidereal-replication/src/replication/handoff.rs:622`, `bins/sidereal-replication/src/replication/handoff.rs:1242`).

Do not run unbounded parallel handoffs. Current handoff queues are bounded (`bins/sidereal-replication/src/replication/ghost_lane.rs:81`, `bins/sidereal-replication/src/replication/ghost_lane.rs:231`) and write failures drop/reconnect (`bins/sidereal-replication/src/replication/ghost_lane.rs:689`). Estimate: with Phase 7 prepare-to-commit around 250 ms (`docs/plans/completed/distribution_scaling_and_single_shard_hardening_plan_2026-05-21.md:381`), sequential cost is about `N * 0.25s`. With a concurrency cap of 16, 100 roots is about 1.6 s before persistence and reconnect overhead; 1000 roots is about 16 s plus overhead.

## 4. Gateway Load Coordinator Architecture

Place the coordinator inside gateway API state, not `AuthService`. Gateway already owns canonical route state (`docs/decisions/dr-0040_distribution_and_persistence_authority_model.md:83`) and creates route-table shared state in `api.rs` (`bins/sidereal-gateway/src/api.rs:127`). Add `LoadCoordinatorState` as an `Extension` near `WorldEntryRoutingConfig` (`bins/sidereal-gateway/src/api.rs:137`).

Inputs: `POST /internal/v1/shard-load-alert` plus existing health polling. The current health probe only parses `status`, `shard_id`, and `shard_degraded` (`bins/sidereal-gateway/src/api.rs:80`), so 8.2 should either widen it or store metrics from alerts. Health polling remains useful for cooler-shard ranking and disconnect detection (`bins/sidereal-gateway/src/api.rs:680`).

State: latest shard capacity, alert history, in-flight migration jobs, per-region cooldowns, and admission queues. Route mutations must use the existing route lock path (`bins/sidereal-gateway/src/api.rs:748`) but preserve `Migrating`/`Draining`; current health updates only touch Active/Degraded leases (`bins/sidereal-gateway/src/api.rs:760`).

Actions: choose Migrate, then Cadence Reduce, then Admission Control in the documented order (`docs/plans/completed/distribution_scaling_and_single_shard_hardening_plan_2026-05-21.md:418`). Admission control should alter `enter_world` before token issuance (`bins/sidereal-gateway/src/api.rs:543`) and return queue metadata in the world-entry response surface (`bins/sidereal-gateway/src/api.rs:559`).

## 5. Oscillation Prevention

Thirty consecutive 1 Hz samples is necessary but not sufficient (`docs/plans/completed/distribution_scaling_and_single_shard_hardening_plan_2026-05-21.md:478`). Add: per-region cooldown after migration commit, target-cool requirement for at least 10 samples, a lower clear threshold before rearming, one in-flight migration per source and per target, and no admission reopen until the saturated shard reports clear health for a full window.

## 6. Pattern A Lesson Applied

Late transport assumptions to avoid:

- Gateway-to-shard migration commands must not rely on UDP bootstrap semantics; existing dispatch has no ack or retry contract (`bins/sidereal-gateway/src/auth/bootstrap_dispatch.rs:168`).
- Do not assume ordering across alert HTTP, health polling, gateway route mutations, and shard-to-shard handoff frames. Use `migration_id`, lease epoch, and idempotent phase transitions.
- Bulk migration will surface lifecycle contamination: target may already hold a ghost for the same GUID and currently despawns ghosts before hydrate (`bins/sidereal-replication/src/replication/handoff.rs:603`), while live non-ghost duplicates abort (`bins/sidereal-replication/src/replication/handoff.rs:610`). Test ghost-to-authoritative promotion and abort cleanup explicitly.

## 7. `shard_migrate_under_load` Test Scaffold

Base it on `transport_lightyear_e2e.rs`, which already starts persistence, gateway, two shards, BRP, and health endpoints (`bins/sidereal-replication/tests/transport_lightyear_e2e.rs:2591`, `bins/sidereal-replication/tests/transport_lightyear_e2e.rs:2638`, `bins/sidereal-replication/tests/transport_lightyear_e2e.rs:2657`). Generate load with a diagnostic, entity-bound fixed-step burn in one source-owned region, not process-global load, so moving the region can reduce source tick wall time. This diagnostic must be documented under the observability contract, which already requires diagnostics through `sidereal-observability` (`docs/features/active/server_observability_metrics_contract.md:197`).

Assert migration through gateway route snapshot (`bins/sidereal-gateway/src/api.rs:655`), shard health `shard_owned_region_keys` (`bins/sidereal-replication/src/replication/health.rs:280`), and BRP authoritative GUID counts, following the Phase 7 no-duplication pattern (`bins/sidereal-replication/tests/transport_lightyear_e2e.rs:2926`). Measure baseline and post-migration source `fixed_tick_last_wall_ms` p95 with the existing percentile style (`scripts/capture_phase0_dense_baseline.sh:407`) and require post <= 75% of baseline.

## 8. Risk Register

- In-flight route shape is under-modeled: `ShardRouteTable` has one lease per region (`crates/sidereal-core/src/sharding.rs:313`). Mitigate with explicit migration jobs carrying source and target leases.
- Handoff queue overload: bounded queues can drop (`bins/sidereal-replication/src/replication/ghost_lane.rs:568`). Mitigate with concurrency caps and retryable per-root state.
- Persistence bottleneck: every root snapshot/hydrate goes through the centralized service (`docs/decisions/dr-0040_distribution_and_persistence_authority_model.md:47`). Mitigate with batch limits and persistence p95 gates.
- Player reconnect herd: many controlled roots imply many fresh Pattern A clients (`docs/plans/completed/distribution_scaling_and_single_shard_hardening_plan_2026-05-21.md:389`). Mitigate with controlled-root waves.
- Health monitor race: current health loop can flip lease state while coordinator acts (`bins/sidereal-gateway/src/api.rs:704`). Mitigate by making coordinator own non-Active states.
- Gateway crash mid-migration: route-table state is in memory (`bins/sidereal-gateway/src/api.rs:135`). Mitigate with idempotent recovery from health plus lease epochs before persistence-backed routing.

## 9. First Concrete Slice: 8.1 Observe-only Load Alerts

Files: add DTOs to `crates/sidereal-core/src/gateway_dtos.rs`; add replication load evaluator under `bins/sidereal-replication/src/replication/` using health inputs (`bins/sidereal-replication/src/replication/health.rs:870`); add gateway alert endpoint/state in `bins/sidereal-gateway/src/api.rs` near handoff token (`bins/sidereal-gateway/src/api.rs:570`); update `docs/features/active/server_observability_metrics_contract.md` with thresholds and native/WASM impact (`docs/features/active/server_observability_metrics_contract.md:9`).

Expected commits: DTO/docs, replication evaluator/sender, gateway receiver/tests.

Acceptance: 30-sample trigger tests pass for all four thresholds; gateway accepts authenticated alerts and stores latest per shard; duplicate alert IDs are idempotent; no route-table mutation; no cadence reduction; no admission control; no migration orchestration; no client UI.
