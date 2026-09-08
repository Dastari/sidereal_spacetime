# Phase 8.4 Cadence Reduction and Admission Control Design

Status: Archived
Lifecycle: historical-report
Category: report
Last updated: 2026-06-04
Owners: report author
Scope: Phase 8.4 Cadence Reduction and Admission Control Design.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

Date: 2026-06-01
Status: implementation slice plan only
Scope: Phase 8.4 headless cadence-reduction fallback and gateway admission-control planning after Phase 8.3p. No runtime code is implemented by this report.

## 0. Required Anchors

This plan preserves the Phase 8 fallback order: migrate, split deferred, cadence reduce, then admission control (`docs/plans/completed/distribution_scaling_and_single_shard_hardening_plan_2026-05-21.md:418`, `docs/plans/completed/distribution_scaling_and_single_shard_hardening_plan_2026-05-21.md:421`, `docs/plans/completed/distribution_scaling_and_single_shard_hardening_plan_2026-05-21.md:422`). DR-0040 assigns canonical routing to the gateway (`docs/decisions/dr-0040_distribution_and_persistence_authority_model.md:83`) and says world entry routes through the gateway-owned lease for the player's authoritative region (`docs/decisions/dr-0040_distribution_and_persistence_authority_model.md:85`). DR-0040 also rejects TiDi and keeps the simulation tick constant while using migration, lane cadence reduction, admission, and degraded mode in order (`docs/decisions/dr-0040_distribution_and_persistence_authority_model.md:101`, `docs/decisions/dr-0040_distribution_and_persistence_authority_model.md:104`, `docs/decisions/dr-0040_distribution_and_persistence_authority_model.md:107`).

The previous Phase 8 design already reserved 8.4 for cadence reduce plus admission control after the coordinator, and reserved 8.5 for degraded-mode UI plus full `shard_migrate_under_load` tuning (`docs/reports/design-notes/phase_8_dynamic_migration_design_note_2026-05-28.md:17`, `docs/reports/design-notes/phase_8_dynamic_migration_design_note_2026-05-28.md:19`). The current Phase 8.3p observability ledger says 8.3p intentionally did not reduce cadence or queue/refuse admissions (`docs/features/active/server_observability_metrics_contract.md:11`, `docs/features/active/server_observability_metrics_contract.md:16`).

## 1. STOP Rules

STOP if any 8.4 implementation requires changing the Phase 8 decomposition or moving degraded UI / `shard_migrate_under_load` out of 8.5 (`docs/reports/design-notes/phase_8_dynamic_migration_design_note_2026-05-28.md:17`, `docs/reports/design-notes/phase_8_dynamic_migration_design_note_2026-05-28.md:19`).

STOP if admission control tries to redirect a client to a shard that does not own the region in the gateway route table. Gateway canonical routing is the only route source (`docs/decisions/dr-0040_distribution_and_persistence_authority_model.md:85`, `docs/decisions/dr-0040_distribution_and_persistence_authority_model.md:88`).

STOP if cadence reduction requires changing `SIM_TICK_HZ`, applying TiDi, or delaying input / physics / authoritative simulation. DR-0040 explicitly keeps authoritative time constant (`docs/decisions/dr-0040_distribution_and_persistence_authority_model.md:106`, `docs/decisions/dr-0040_distribution_and_persistence_authority_model.md:107`).

STOP if 8.4 needs route mutation beyond the existing 8.3 migration finalization path. Current route mutation is the route flip from source lease to target active lease after finalization (`bins/sidereal-gateway/src/api.rs:1213`, `bins/sidereal-gateway/src/api.rs:1245`, `bins/sidereal-gateway/src/api.rs:1247`).

STOP if the design needs gateway-proxied realtime transport or a Lightyear fork bump. DR-0040 V1 uses brief client retarget rather than gateway-proxied multi-shard transport (`docs/decisions/dr-0040_distribution_and_persistence_authority_model.md:79`), and 8.4 can use existing internal HTTP command/report patterns.

STOP if any new runtime command/report payload carries authoritative world coordinates with reduced precision. DR-0035/DR-0040 keep persistence, scripting, BRP, dashboard, server read models, and non-motion payload classes f64 (`docs/decisions/dr-0040_distribution_and_persistence_authority_model.md:116`, `docs/decisions/dr-0040_distribution_and_persistence_authority_model.md:124`, `docs/decisions/dr-0040_distribution_and_persistence_authority_model.md:128`).

## 2. Existing Gateway Decision State After 8.3p

The gateway already has enough raw state to decide that migration is blocked, but not enough explicit reason-state to drive ordered fallback without adding a small classification layer.

Existing capacity state:

- `LoadCoordinatorCapacityRecord` stores per-shard health/alert capacity: status, degraded flag, owned regions, lease epochs, connected clients, hot entities, input age, Lightyear action queue max, outbound bytes/client/s, fixed-tick p95, and triggered conditions (`bins/sidereal-gateway/src/load_coordinator.rs:41`, `bins/sidereal-gateway/src/load_coordinator.rs:56`).
- Health samples record cool-sample counters, latest health capacity, and latest capacity; alert samples record latest alert capacity and bounded alert history (`bins/sidereal-gateway/src/load_coordinator.rs:390`, `bins/sidereal-gateway/src/load_coordinator.rs:413`, `bins/sidereal-gateway/src/load_coordinator.rs:416`, `bins/sidereal-gateway/src/load_coordinator.rs:444`).
- Target-cool state is explicit: targets need ten consecutive cool health samples (`bins/sidereal-gateway/src/load_coordinator.rs:20`), and "cool" means non-degraded, status not degraded, fixed-tick p95 <= 12 ms, outbound <= 32 KiB/client/s, Lightyear actions queue <= 100, and input oldest age <= 250 ms (`bins/sidereal-gateway/src/load_coordinator.rs:1299`, `bins/sidereal-gateway/src/load_coordinator.rs:1313`).

Existing migration-unavailable / no-cool-target state:

- Planning returns `None` if it cannot select a source lease, if there is already an active job for that region/source, or if it cannot select a target route template (`bins/sidereal-gateway/src/load_coordinator.rs:1121`, `bins/sidereal-gateway/src/load_coordinator.rs:1133`, `bins/sidereal-gateway/src/load_coordinator.rs:1136`).
- Target selection filters out the source shard, shards below the cool-sample requirement, and shards with an active target job before taking the lowest fixed-tick p95 candidate (`bins/sidereal-gateway/src/load_coordinator.rs:1220`, `bins/sidereal-gateway/src/load_coordinator.rs:1249`). That is enough to infer "no cool target", but the current `Option` return loses the reason.

Existing cooldown state:

- A five-minute per-region cooldown constant exists (`bins/sidereal-gateway/src/load_coordinator.rs:21`).
- A `Retired` source route-retirement report inserts a `LoadCoordinatorRegionCooldown` keyed by region/source/target with `until_unix_ms` (`bins/sidereal-gateway/src/load_coordinator.rs:1033`, `bins/sidereal-gateway/src/load_coordinator.rs:1055`).
- Cooldowns are pruned before snapshots and before planning from a new alert (`bins/sidereal-gateway/src/load_coordinator.rs:1076`, `bins/sidereal-gateway/src/load_coordinator.rs:1093`), and source selection refuses a region while its cooldown is active (`bins/sidereal-gateway/src/load_coordinator.rs:1199`, `bins/sidereal-gateway/src/load_coordinator.rs:1214`).

Existing migration-failed state:

- Migration job state already distinguishes dispatch failures, preflight rejection, execution dispatch failure, execution failure, finalization rejection, route flip failure, source retirement dispatch failure, and source retirement rejection (`bins/sidereal-gateway/src/load_coordinator.rs:74`, `bins/sidereal-gateway/src/load_coordinator.rs:100`).
- Reports and dispatch failures store last error fields and terminal report payloads on `LoadCoordinatorMigrationJob` (`bins/sidereal-gateway/src/load_coordinator.rs:121`, `bins/sidereal-gateway/src/load_coordinator.rs:147`).
- Failed and rejected states intentionally continue blocking future planning until a retry/cleanup policy exists; only `SourceRetired` is not active (`bins/sidereal-gateway/src/load_coordinator.rs:1277`, `bins/sidereal-gateway/src/load_coordinator.rs:1279`). This is the exact "migration failed" signal 8.4 can treat as migration unavailable for fallback purposes.

Existing admission state:

- `LoadCoordinatorAdmissionQueue` and an `admission_queues` map exist, but only as inert snapshot/count state (`bins/sidereal-gateway/src/load_coordinator.rs:328`, `bins/sidereal-gateway/src/load_coordinator.rs:332`, `bins/sidereal-gateway/src/load_coordinator.rs:360`, `bins/sidereal-gateway/src/load_coordinator.rs:361`).
- Snapshots expose `admission_queue_count`, but there is no queue policy, queue entry DTO, queue position computation, or `/world/enter` hook yet (`bins/sidereal-gateway/src/load_coordinator.rs:334`, `bins/sidereal-gateway/src/load_coordinator.rs:345`, `bins/sidereal-gateway/src/load_coordinator.rs:1076`, `bins/sidereal-gateway/src/load_coordinator.rs:1088`).

## 3. Existing Shard Runtime Cadence Knobs

The shard has startup cadence knobs, not runtime cadence-reduction controls.

- `RuntimeLaneCadence` contains motion, visibility AOI, tactical stream, persistence, scripting, and diagnostics Hz plus budget fields (`bins/sidereal-replication/src/replication/runtime_lanes.rs:16`, `bins/sidereal-replication/src/replication/runtime_lanes.rs:30`).
- Defaults read environment variables: `REPLICATION_MOTION_REPLICATION_HZ`, `REPLICATION_VISIBILITY_AOI_HZ`, `REPLICATION_TACTICAL_STREAM_HZ`, `REPLICATION_PERSISTENCE_LANE_HZ`, `REPLICATION_SCRIPTING_LANE_HZ`, and `REPLICATION_DIAGNOSTICS_LANE_HZ` (`bins/sidereal-replication/src/replication/runtime_lanes.rs:32`, `bins/sidereal-replication/src/replication/runtime_lanes.rs:40`).
- The resource is inserted once at startup (`bins/sidereal-replication/src/replication/runtime_lanes.rs:124`, `bins/sidereal-replication/src/replication/runtime_lanes.rs:127`), but plugin scheduling also reads `RuntimeLaneCadence::default()` locally and installs `on_timer` run conditions with those startup values (`bins/sidereal-replication/src/plugins.rs:46`, `bins/sidereal-replication/src/plugins.rs:69`, `bins/sidereal-replication/src/plugins.rs:280`, `bins/sidereal-replication/src/plugins.rs:307`, `bins/sidereal-replication/src/plugins.rs:327`, `bins/sidereal-replication/src/plugins.rs:340`).
- Tactical stream currently includes asset catalog version messages, owner asset manifest messages, tactical resnapshot handling, contact cache maintenance, tactical snapshots, and tactical metrics (`bins/sidereal-replication/src/plugins.rs:255`, `bins/sidereal-replication/src/plugins.rs:271`).
- Diagnostics and tactical lane cadence are exposed in health as `runtime_lane_*_hz` (`bins/sidereal-replication/src/replication/health.rs:436`, `bins/sidereal-replication/src/replication/health.rs:441`, `bins/sidereal-replication/src/replication/health.rs:1686`, `bins/sidereal-replication/src/replication/health.rs:1691`).

Conclusion: 8.4 needs a real runtime cadence policy gate. Mutating `RuntimeLaneCadence` at runtime is not sufficient because existing `on_timer` conditions are built from startup values. First implementation should reduce only tactical stream and diagnostics by default. Scripting has a startup knob, but runtime script intervals/events can affect gameplay intent production; do not include scripting in the first command until a separate script-criticality policy exists.

## 4. DTOs and Endpoints Needed

New DTOs and endpoints are needed.

Existing shared gateway DTOs cover world entry, handoff token minting, shard load alerts, and migration command/report DTOs, but no cadence command or cadence report (`crates/sidereal-core/src/gateway_dtos.rs:188`, `crates/sidereal-core/src/gateway_dtos.rs:214`, `crates/sidereal-core/src/gateway_dtos.rs:243`, `crates/sidereal-core/src/gateway_dtos.rs:535`).

Existing gateway internal routes are `/internal/v1/handoff-token`, `/internal/v1/shard-load-alert`, and migration preflight/execution/finalization/route-retirement report routes (`bins/sidereal-gateway/src/api.rs:280`, `bins/sidereal-gateway/src/api.rs:301`). Existing shard internal command routes are migration-only (`bins/sidereal-replication/src/replication/health.rs:1129`, `bins/sidereal-replication/src/replication/health.rs:1148`).

Additive DTOs should live in `crates/sidereal-core/src/gateway_dtos.rs`:

- `ShardCadencePolicyCommand { protocol_version, command_id, source_alert_id, shard_id, policy_epoch, reason, tactical_stream_hz, diagnostics_hz, expires_at_unix_ms, generated_at_unix_ms }`.
- `ShardCadencePolicyCommandAck { command_id, shard_id, accepted, duplicate, reason }`.
- `ShardCadencePolicyReport { protocol_version, report_id, command_id, shard_id, policy_epoch, status, active_tactical_stream_hz, active_diagnostics_hz, expires_at_unix_ms, reason, generated_at_unix_ms }`.
- `ShardCadencePolicyReportAck { report_id, accepted, duplicate }`.

Additive endpoints should mirror the existing authenticated internal HTTP style:

- Gateway-to-shard: `POST /internal/v1/shard-cadence-policy-command` on the replication health/internal server, authenticated with `Authorization: Bearer <SIDEREAL_INTER_SHARD_AUTH_TOKEN>`, matching migration command receiver auth (`bins/sidereal-replication/src/replication/health.rs:1173`, `bins/sidereal-replication/src/replication/health.rs:1180`).
- Shard-to-gateway: `POST /internal/v1/shard-cadence-policy-report` on the gateway, authenticated with the existing internal mint secret header used by shard load alerts and migration reports (`bins/sidereal-gateway/src/api.rs:845`, `bins/sidereal-gateway/src/api.rs:853`).

No new endpoint may carry authoritative world positions. If a future cadence reason includes region context, use `ShardRegion` and metric values only.

## 5. Admission Control and `/world/enter`

Admission control must be gateway-side and must run before shard bootstrap dispatch and player token issuance.

Current `/world/enter` has two paths, `/world/enter` and `/auth/v1/world/enter`, both handled by `enter_world` (`bins/sidereal-gateway/src/api.rs:280`, `bins/sidereal-gateway/src/api.rs:281`). The handler currently passes a shard selector into `AuthService::enter_world_with_shard_selector`, which loads the player's persisted world-entry position, selects a shard, dispatches bootstrap to that shard, then issues player-scoped tokens (`bins/sidereal-gateway/src/api.rs:797`, `bins/sidereal-gateway/src/api.rs:821`; `bins/sidereal-gateway/src/auth/service.rs:735`, `bins/sidereal-gateway/src/auth/service.rs:760`). Route selection computes `ShardRegion` from f64 `WorldEntryPosition` values and returns the matching gateway lease or fallback lease (`bins/sidereal-gateway/src/api.rs:1251`, `bins/sidereal-gateway/src/api.rs:1280`).

8.4 admission must therefore refactor, not wrap after the fact:

1. Add an auth-service helper that validates the access token, ownership, and loads `WorldEntryPosition` without dispatching bootstrap or issuing world-entry tokens. This factors the existing work before `dispatch_to_shard` (`bins/sidereal-gateway/src/auth/service.rs:718`, `bins/sidereal-gateway/src/auth/service.rs:739`).
2. In `enter_world`, compute `(ShardRegion, ShardLease)` with the gateway route table before dispatch (`bins/sidereal-gateway/src/api.rs:1251`, `bins/sidereal-gateway/src/api.rs:1280`).
3. Ask `LoadCoordinatorState` whether that region/shard is admission-limited.
4. If admitted, call the existing bootstrap/token issuance tail.
5. If not admitted, return `EnterWorldResponse { accepted: false, tokens: None, admission: Some(...) }` and do not dispatch bootstrap.

First implementation should queue, not redirect, and should not hold the HTTP request open. The response should be a headless queue/refusal surface: `accepted=false`, `queue_position`, `retry_after_ms`, `region`, `shard_id`, and reason. This matches the Phase 8 "returns queue position" requirement (`docs/plans/completed/distribution_scaling_and_single_shard_hardening_plan_2026-05-21.md:422`) and DR-0040's tertiary queued admission policy (`docs/decisions/dr-0040_distribution_and_persistence_authority_model.md:105`) without introducing gateway-proxied realtime transport or incorrect cross-shard redirects.

Do not redirect in 8.4. Redirecting to a cool shard without a completed route flip would route the client away from the shard that owns the player region and would violate gateway canonical routing.

## 6. Deferred to 8.5

Leave these out of 8.4:

- Client degraded-mode notification and UI copy. Phase 8 explicitly names this as a separate UI ticket (`docs/plans/completed/distribution_scaling_and_single_shard_hardening_plan_2026-05-21.md:423`), and the previous Phase 8 design assigned it to 8.5 (`docs/reports/design-notes/phase_8_dynamic_migration_design_note_2026-05-28.md:19`).
- Native/WASM UI handling of queued/admission responses beyond preserving wire compatibility. Phase 8 native/WASM impact says both client targets must surface degraded notification, but that belongs to the client UI slice (`docs/plans/completed/distribution_scaling_and_single_shard_hardening_plan_2026-05-21.md:494`).
- Full `shard_migrate_under_load` acceptance/tuning, which the previous design assigns to 8.5 (`docs/reports/design-notes/phase_8_dynamic_migration_design_note_2026-05-28.md:64`, `docs/reports/design-notes/phase_8_dynamic_migration_design_note_2026-05-28.md:68`).
- Production link-conditioner or chaos-mode branching. Observability rules keep link conditioner diagnostic-only (`.claude/skills/sidereal-observability-net/SKILL.md:32`).
- Plan ledger/status flips. This report is planning only.

## 7. Proposed 8.4 Slices

### 8.4a - Explicit fallback classification, no behavior change

Prompt:

Implement gateway-only fallback classification in `LoadCoordinatorState`. Replace the private `Option<LoadCoordinatorMigrationJob>` planning result with a structured internal outcome that preserves the existing planned-job path and reports exact no-plan reasons: `cooldown_active`, `active_migration_for_region`, `active_migration_for_source`, `active_migration_for_target`, `no_eligible_source_region`, `no_cool_target`, and `migration_failed_blocking`. Expose the latest classification in `GET /admin/dashboard/load-coordinator` as diagnostics only. Do not dispatch cadence commands, do not mutate routes, and do not alter admission.

Relevant files:

- `bins/sidereal-gateway/src/load_coordinator.rs:1121` for current `plan_migration_job`.
- `bins/sidereal-gateway/src/load_coordinator.rs:1193` for source selection and cooldown checks.
- `bins/sidereal-gateway/src/load_coordinator.rs:1220` for target selection.
- `bins/sidereal-gateway/src/api.rs:845` for load-alert ingestion.

Tests:

- Unit-test each reason with targeted `LoadCoordinatorState` fixtures.
- Assert `SourceRetired` does not block, while `ExecutionFailed`, `FinalizationRejected`, `RouteFlipFailed`, and `SourceRetirementRejected` produce `migration_failed_blocking`.
- Assert accepted duplicate/stale alerts do not append a new classification.
- Run `CARGO_INCREMENTAL=0 cargo test -p sidereal-gateway load_coordinator`.

### 8.4b - Cadence command/report DTOs and HTTP plumbing

Prompt:

Add `ShardCadencePolicyCommand`, ack, report, and report-ack DTOs to `sidereal-core`. Add a gateway dispatcher that can send a cadence command to one shard over internal HTTP with the same bearer-token pattern as migration commands. Add a shard receiver that stages/dedupes cadence commands but does not yet change timers. Add a gateway report receiver and coordinator storage for the latest cadence report per shard. No admission behavior and no route mutation.

Relevant files:

- `crates/sidereal-core/src/gateway_dtos.rs:243` for current alert DTO placement and `crates/sidereal-core/src/gateway_dtos.rs:286` for migration command DTO placement.
- `bins/sidereal-gateway/src/migration_command_dispatch.rs:262` for the current gateway dispatcher pattern.
- `bins/sidereal-replication/src/replication/health.rs:1129` for shard internal routes.
- `bins/sidereal-gateway/src/api.rs:282` for existing internal gateway routes.

Tests:

- DTO serde round-trip tests in `sidereal-core`.
- Gateway dispatch validates missing endpoint, rejected ack, mismatched ack, and duplicate accepted ack.
- Shard receiver rejects missing/wrong bearer token and wrong shard ID, and dedupes retries.
- Gateway report receiver rejects bad auth/mismatched report and dedupes report IDs.

### 8.4c - Runtime cadence policy application

Prompt:

Implement a shard-local cadence policy resource that can reduce tactical stream and diagnostics cadence at runtime by default 50%, with an expiry/recovery path. Replace the affected constant `on_timer` scheduling with dynamic gates that consult the active policy, but leave authoritative fixed simulation, input receive/drain, physics, combat, persistence flush, visibility membership, and scripting unchanged in this first slice. Health must expose active cadence policy state and effective tactical/diagnostics Hz.

Relevant files:

- `bins/sidereal-replication/src/replication/runtime_lanes.rs:16` for current cadence fields.
- `bins/sidereal-replication/src/plugins.rs:255` for tactical stream systems.
- `bins/sidereal-replication/src/plugins.rs:58` and `bins/sidereal-replication/src/plugins.rs:309` for diagnostics systems.
- `bins/sidereal-replication/src/replication/health.rs:1686` for current reported lane Hz.

Tests:

- Unit-test effective Hz calculation and expiry.
- Schedule-level test proves tactical/diagnostics gates slow down under policy and recover after expiry.
- Health serialization test includes policy fields and effective Hz.
- Assert fixed/input systems are not gated by the cadence policy.

### 8.4d - Gateway ordered fallback to cadence reduce

Prompt:

When a new load alert cannot plan migration because migration is unavailable, failed-blocking, cooldown-active, or no-cool-target, issue at most one active cadence-reduction command per source shard/policy epoch. Store the pending/acked/reported cadence policy state in `LoadCoordinatorState` and expose it in `GET /admin/dashboard/load-coordinator`. Do not enter admission control until the cadence policy is acked/reported active and a later load alert still shows the shard hot.

Relevant files:

- `bins/sidereal-gateway/src/load_coordinator.rs:447` for alert-capacity plus planning.
- `bins/sidereal-gateway/src/api.rs:900` for recording an accepted alert and `bins/sidereal-gateway/src/api.rs:911` for spawning migration dispatch.
- `bins/sidereal-gateway/src/load_coordinator.rs:321` for cooldown state.
- `bins/sidereal-gateway/src/load_coordinator.rs:328` for existing inert admission queue state.

Tests:

- Alert with no cool target dispatches cadence once.
- Repeated hot alert while cadence command pending/active does not duplicate dispatch.
- Successful migration plan still dispatches migration, not cadence.
- Cooldown-active source dispatches cadence after fallback classification.
- Failed migration job blocks new migration and dispatches cadence fallback once.

### 8.4e - Headless admission control for `/world/enter`

Prompt:

Add gateway admission policy keyed by `ShardRegion` and shard ID. After cadence reduction is active and the region remains hot for a full follow-up alert window, gate `/world/enter` before bootstrap dispatch and token issuance. Return a backward-compatible `EnterWorldResponse` with `accepted=false`, `tokens=None`, and additive admission metadata containing queue position and retry-after. Do not redirect, do not mutate route leases, and do not hold the request open.

Relevant files:

- `bins/sidereal-gateway/src/api.rs:797` for `enter_world`.
- `bins/sidereal-gateway/src/auth/service.rs:735` for current world-position load before dispatch.
- `bins/sidereal-gateway/src/auth/service.rs:740` for bootstrap dispatch.
- `crates/sidereal-core/src/gateway_dtos.rs:203` for `EnterWorldResponse`.
- `bins/sidereal-gateway/src/api.rs:1251` for route selection.

Tests:

- Active admission limit returns `accepted=false`, no tokens, queue metadata present.
- The bootstrap dispatcher is not called when admission denies.
- The same player/world position still resolves through f64 region routing before admission.
- Non-limited active/degraded leases still enter normally.
- No redirect lease is returned for a different shard.

### 8.4f - Admission clear/reopen policy

Prompt:

Add admission reopening based on health-sampled cool windows, not alert absence. Reuse the existing cool-sample machinery where possible. A region should leave admission-limited state only after its owning shard reports cool for the configured full window and no active failed-blocking migration remains. Keep this headless; UI remains 8.5.

Relevant files:

- `bins/sidereal-gateway/src/load_coordinator.rs:1109` for cool health sample tracking.
- `bins/sidereal-gateway/src/api.rs:1430` for health polling.
- `bins/sidereal-gateway/src/api.rs:1537` for recording health capacity.
- `bins/sidereal-gateway/src/load_coordinator.rs:1299` for cool predicate thresholds.

Tests:

- Admission remains closed while health is degraded or over any cool threshold.
- Admission reopens after the required consecutive cool samples.
- A failed-blocking migration job keeps admission closed even if health cools, until an explicit cleanup/retry policy exists.
- Snapshot shows admission queue count and per-region admission state.

## 8. Validation for This Report

This task changes only documentation. Required validation is `git diff --check`. No cargo tests are required for this report-only commit.
