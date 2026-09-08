# Server Observability Metrics Contract

Status: Active
Lifecycle: source-of-truth
Category: feature
Last updated: 2026-06-04
Owners: feature owners
Scope: Server Observability Metrics Contract.
Source of truth: yes
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

## 0. Implementation Status

2026-06-02 Phase 8.5e closure evidence:

- Final Phase 8 validation reran `controlled_root_handoff_e2e`, `generalized_entity_handoff_e2e`, `shard_migrate_under_load`, client admission/notification tests, gateway admission tests, the multi-package check, and `git diff --check`; detailed evidence is recorded in `docs/reports/reconciliation/phase_8_dynamic_load_migration_closure_2026-06-02.md`.
- Corrected controlled-root handoff evidence is non-skipping and self-contained: the e2e refreshes and selects deterministic auth/graph fixtures directly and the final run printed `handoffs=100`, `cutovers=100`, `entity_loss=0`, `entity_duplication=0`, `input_drop_total=0`, `stale_lease_epoch_drop_total=0`, `cutover_p95_ms=137.186`, and `prepare_to_commit_p95_ms=79.608`.
- `shard_migrate_under_load` closes on structural relief: gateway route `(0,0)` flipped to target shard 12 epoch 8, source retirement/cooldown completed, source authoritative count became 0, target authoritative count became 1, and source no longer owned `(0,0)` with the synthetic load inactive. The rerun recorded baseline p95 `33.396` ms and post-retirement rolling shard p95 `17.552` ms; the closure interpretation remains structural rather than a strict per-region p95 SLO.
- Native/WASM impact: evidence/documentation only. This slice adds no runtime, protocol, gateway route, cadence/admission, client, or Lightyear behavior change.

2026-06-01 Phase 8.5d blocker migration-aware persistence snapshots:

- Persistence handoff snapshot requests now carry explicit optional migration context (`migration_id`, `migration_region`, and `target_region`) and the persistence IPC protocol version is bumped because the bincode request shape changed.
- Ordinary non-migration handoff snapshots keep the previous validator rule: the target shard/lease epoch must already be an active route-table lease. Migration snapshots use a narrower transient rule for pre-route-flip execution: the source route for the migration region must still map to the source shard/epoch and may be `active` or `degraded`; target shard/epoch does not need to be active yet.
- Migration snapshot validation still requires all records to be stamped with the target shard. Position-bearing records must resolve via f64 world position to the migration region; player/session-tag records without position remain allowed only when target-stamped. Records outside the region, stale source shard/epoch, or non-target assignments are rejected.
- Native/WASM impact: server-side persistence/replication IPC only. This adds no client behavior, Lightyear lane, gateway route mutation, admission/cadence policy change, production chaos branch, or WASM-specific path.

2026-06-01 Phase 8.5c diagnostic region load hook:

- Replication shards now support a disabled-by-default, diagnostics-only fixed-tick synthetic load hook for Phase 8 migration evidence. It is enabled only through `SIDEREAL_DIAGNOSTICS` filters: `filter.phase8_load.region=x:y`, `filter.phase8_load.fixed_tick_ms=<ms>`, and optional `filter.phase8_load.max_entities=<n>`. The region separator is `:` because commas separate diagnostics directives.
- The hook runs only when the configured `ShardRegion` is locally owned and at least one local non-ghost entity with f64 `WorldPosition` or Avian `Position` is in that region. It never mutates entities, route tables, ownership, persistence, handoff state, cadence policy, or admission state.
- Safety bounds: missing filters keep the hook disabled; invalid filters disable it with one warning; `fixed_tick_ms` must be finite and positive and is capped to 50 ms total per fixed tick; `max_entities` must be positive and is bounded. Health snapshots expose `phase8_synthetic_load_*` fields for active state, region, matched entity count, target ms, and last burn ms.
- Native/WASM impact: replication-server diagnostics only. This adds no client behavior, protocol bump, Lightyear lane, gateway route change, link-conditioner behavior, or production chaos branch.

2026-06-01 Phase 8.5b server-authored degraded notifications:

- When a replication shard has an active cadence policy, it now fans out one warning `ServerNotificationMessage` per currently bound player through the existing notification lane. The message uses event type `shard_degraded`, reason `cadence_reduced`, bottom-right placement, and a finite warning auto-dismiss; the body is `Server region is under heavy load - some features reduced.`
- The fanout deduplicates by player, shard, cadence-policy command ID, and policy epoch, so repeated ticks do not spam players while newly bound players still receive the active degraded warning once. A new command ID or policy epoch is eligible for a new warning.
- Native/WASM impact: existing client notification transport only. This slice adds no Lightyear protocol version bump, gateway route changes, admission behavior, migration orchestration, link-conditioner or chaos-mode production branch, or new realtime transport lane.

2026-06-01 Phase 8.4f admission clear/reopen policy:

- Gateway admission limits now reopen only from shard health samples, never from alert absence or elapsed wall time. For each limited `(ShardRegion, ShardId)`, `record_health_capacity` advances clear progress only when the reporting shard still owns the limited region and the same Phase 8 cool thresholds used for migration target selection are satisfied.
- Admission stays closed and resets cool progress when health is degraded or exceeds any cool threshold, when health omits ownership of the limited region, or when a failed-blocking migration exists for the same region or source shard. Reopening removes the admission-limit record and its queued player list; no client push notification is emitted.
- `GET /admin/dashboard/load-coordinator` admission-limit entries now include additive reopening fields: `consecutive_cool_health_samples`, `required_clear_sample_count`, `last_health_sample_unix_ms`, and `reopen_blocked_reason`.
- Native/WASM impact: headless gateway control-plane behavior only. This slice does not add client degraded UI, admission queue push notifications, route redirects, route or owned-region mutation, shard runtime changes, gateway-proxied realtime transport, Lightyear/protocol dependency changes, or plan ledger flips.

2026-06-01 Phase 8.4e headless admission control:

- Gateway `/world/enter` and `/auth/v1/world/enter` now run admission control after token/ownership validation and f64 `WorldEntryPosition` route selection, but before shard bootstrap dispatch and world-entry token issuance. Denied admission returns `accepted=false`, `tokens=null`, canonical selected `shard_region`/`shard_lease`, and additive `admission` metadata with queue position, retry-after, region, shard ID, and reason.
- Admission limits are keyed by concrete `(ShardRegion, ShardId)`. A limit activates only when a matching gateway-created cadence-policy command record for that source shard and source region is already `active`, and a later accepted, non-duplicate hot load alert arrives for the same source shard and region. Latest per-shard cadence reports alone are not admission proof.
- Admission queues unique players by stable player entity ID. Repeated denied world-entry attempts by the same player for the same limited region return the same queue position and do not call the bootstrap dispatcher or mint world-entry tokens.
- `GET /admin/dashboard/load-coordinator` now exposes additive `admission_limits` entries with region, shard ID, queued count, reason, activation timestamp, latest alert ID, and active cadence command ID. Admission reopening/clearing remains deferred to 8.4f.
- Native/WASM impact: DTO compatibility only. This slice does not add client degraded UI, route redirects, route or owned-region mutation, shard runtime changes, gateway-proxied realtime transport, Lightyear/protocol dependency changes, or plan ledger flips.

2026-06-01 Phase 8.4d gateway ordered fallback to cadence reduce:

- Gateway shard health parsing now preserves configured `runtime_lane_tactical_stream_hz` and `runtime_lane_diagnostics_hz` as optional capacity fields. Cadence fallback commands are built only from finite positive configured health baselines for the hot source shard; effective cadence fields are not used and missing baselines do not fabricate defaults.
- When an accepted, non-duplicate shard load alert cannot plan migration for `cooldown_active`, `active_migration_for_region`, `active_migration_for_source`, `active_migration_for_target`, `no_cool_target`, or `migration_failed_blocking`, the load coordinator creates one cadence-policy command for the source shard with 50% tactical/diagnostics hz and a bounded 120 second expiry. `no_eligible_source_region` remains a stale/unroutable fallback classification and does not dispatch cadence.
- `GET /admin/dashboard/load-coordinator` now exposes additive `cadence_policy_commands` entries with command payload, source shard, source alert, fallback reason, policy epoch, dispatch/report state, ack/report payloads, timestamps, attempts, and last dispatch error. Repeated hot alerts do not create another command while a source shard has a pending, dispatching, acked, or active cadence policy.
- Gateway dispatches cadence-policy commands through `SIDEREAL_SHARD_CADENCE_POLICY_ENDPOINTS` using `Authorization: Bearer <SIDEREAL_INTER_SHARD_AUTH_TOKEN>` after releasing the load coordinator write lock. Dispatch failure records `dispatch_failed` on the command record without admission-control behavior.
- Incoming cadence-policy reports still update latest per-shard report storage and now also transition matching command records to `active`, `rejected`, or `expired`.
- Native/WASM impact: gateway headless control-plane only. This slice does not add admission control or `/world/enter` changes, client degraded UI, route or owned-region mutation, migration finalization changes, shard runtime cadence changes, gateway-proxied realtime transport, or Lightyear/protocol dependency changes.

2026-06-01 Phase 8.4c runtime cadence-policy application:

- Replication shards now drain staged `ShardCadencePolicyCommand` records from Bevy `Update`, validate shard identity, finite positive hz values, baseline hz ceilings, future expiry, and monotonic `policy_epoch`, then apply valid policies as shard-local runtime state. `RuntimeLaneCadence` remains the configured baseline and is not mutated.
- Active cadence policies reduce only the tactical stream lane and diagnostics lane effective hz. Motion replication, visibility AOI, persistence, scripting, fixed simulation, input, physics, combat, handoff scheduling, route ownership, and owned-region state are unchanged.
- Shards publish nonblocking `ShardCadencePolicyReport` records with `active`, `rejected`, or `expired` status to gateway `POST /internal/v1/shard-cadence-policy-report`. The publisher uses `SIDEREAL_GATEWAY_BASE_URL` then `GATEWAY_PUBLIC_BASE_URL`, authenticates with `x-sidereal-handoff-mint-secret` from `SIDEREAL_GATEWAY_HANDOFF_MINT_SECRET` then `GATEWAY_JWT_SECRET`, and uses a bounded synchronous queue plus background blocking HTTP worker so the Bevy main loop does not wait on gateway I/O.
- Shard health snapshots keep existing configured `runtime_lane_*_hz` fields and add `cadence_policy_active`, `cadence_policy_command_id`, `cadence_policy_source_alert_id`, `cadence_policy_epoch`, `cadence_policy_reason`, `cadence_policy_expires_at_unix_ms`, `cadence_policy_effective_tactical_stream_hz`, and `cadence_policy_effective_diagnostics_hz`.
- While an unexpired cadence policy is active, shard health reports `shard_degraded=true` and includes `cadence_reduced` in `shard_degraded_reasons`. Expiry clears the active policy, restores effective tactical/diagnostics hz to the configured baseline, and emits one `expired` report.
- Native/WASM impact: replication-server runtime diagnostics only. This slice does not dispatch gateway fallback classifications, add admission control, mutate routes or owned regions, change scripting/persistence/physics/input/combat/visibility AOI/motion replication cadence, add client/UI behavior, proxy realtime transport, or bump Lightyear/protocol dependencies.

2026-06-01 Phase 8.4b cadence-policy command/report plumbing:

- `engine-core` defines cadence-policy DTO protocol version `1` for `ShardCadencePolicyCommand`, `ShardCadencePolicyCommandAck`, `ShardCadencePolicyReport`, and `ShardCadencePolicyReportAck`. Command/report reasons reuse the Phase 8.4 fallback classification vocabulary: `cooldown_active`, `active_migration_for_region`, `active_migration_for_source`, `active_migration_for_target`, `no_eligible_source_region`, `no_cool_target`, and `migration_failed_blocking`.
- Replication shards expose `POST /internal/v1/shard-cadence-policy-command` on the existing health/internal HTTP server. Auth uses `Authorization: Bearer <SIDEREAL_INTER_SHARD_AUTH_TOKEN>`, matching migration command receivers. Valid commands are staged in an in-memory inbox keyed by `command_id`; duplicate command IDs return `accepted=true, duplicate=true` without replacing the staged command. Unsupported protocol versions and commands addressed to a different shard return rejected acks.
- The gateway cadence-policy dispatcher is configured with `SIDEREAL_SHARD_CADENCE_POLICY_ENDPOINTS=shard_id,http://host:port/internal/v1/shard-cadence-policy-command;...` and sends JSON commands with the same inter-shard bearer token and retry/ack validation pattern as migration command dispatch. Duplicate accepted command acks are treated as successful. This dispatcher is not hooked to load-alert fallback classifications in this slice.
- Gateway receives shard cadence-policy reports at `POST /internal/v1/shard-cadence-policy-report` using the existing `x-sidereal-handoff-mint-secret` auth contract shared by shard load alerts and migration reports. The load coordinator deduplicates by `report_id`, stores the latest report per shard, and exposes additive `cadence_policy_reports` entries in `GET /admin/dashboard/load-coordinator`.
- Native/WASM impact: internal diagnostics/control-plane plumbing only. This slice does not apply runtime cadence reduction, change `RuntimeLaneCadence` scheduling, alter shard degraded reasons, dispatch from load-alert fallback classification, add admission control, mutate routes or owned regions, proxy realtime transport, change client/UI behavior, or bump Lightyear/protocol dependencies.

2026-06-01 Phase 8.4a load-coordinator fallback classification diagnostics:

- When an accepted shard load alert records capacity but does not produce a migration job, the gateway load coordinator now records the latest fallback classification keyed by source shard. `GET /admin/dashboard/load-coordinator` includes additive `fallback_classifications` entries with `alert_id`, `source_shard_id`, `candidate_hot_region`, `reason`, and `classified_at_unix_ms`.
- The fallback `reason` values are `cooldown_active`, `active_migration_for_region`, `active_migration_for_source`, `active_migration_for_target`, `no_eligible_source_region`, `no_cool_target`, and `migration_failed_blocking`. Failed, rejected, or dispatch-failed migration jobs classify as `migration_failed_blocking` instead of the generic active-migration blockers; `source_retired` jobs remain nonblocking.
- Duplicate or stale shard load alerts continue to return idempotent duplicate acks before coordinator planning, so they do not update fallback classifications. Successful migration planning clears any previous fallback classification for that source shard and still dispatches migration commands only from a real planned job.
- Native/WASM impact: gateway diagnostics only. This slice does not add cadence command DTOs or endpoints, shard command dispatch, admission control, route mutation, owned-region mutation, client UI behavior, realtime transport proxying, or Lightyear protocol changes.

2026-06-01 Phase 8.3p terminal migration cooldown and active-job semantics:

- When the gateway records a `Retired` source route-retirement report, the load coordinator now starts a five-minute per-region migration cooldown keyed by the migrated `ShardRegion`, source shard, and target shard. Cooldowns are pruned before planning from a new load alert and before `GET /admin/dashboard/load-coordinator` snapshots are generated.
- Completed `source_retired` jobs stay in `planned_migration_jobs` for dashboard/history visibility but no longer count as active in `in_flight_migration_job_count` and no longer block future region/source/target planning by themselves. Failed and rejected migration states continue to block because no retry or cleanup policy is defined yet.
- `GET /admin/dashboard/load-coordinator` now includes additive `region_cooldowns`, sorted by region/source/target, while retaining `cooldown_count`. The planner refuses a new migration for a region while its cooldown is active; after expiry, planning uses the current canonical route table.
- Native/WASM impact: gateway diagnostics and planning policy only. This slice does not mutate routes, send shard commands, mutate shard-owned regions, reduce cadence, queue/refuse admissions, add persistence/hydration paths, change client protocol files, or change client UI/runtime behavior.

2026-05-29 Phase 8.3o source shard retirement after gateway route flip:

- After a migration job reaches `route_flip_committed`, the gateway sends a source-only `ShardMigrationRouteRetirementCommand` to `POST /internal/v1/shard-migration-route-retirement-command` using `Authorization: Bearer <SIDEREAL_INTER_SHARD_AUTH_TOKEN>`. Gateway dispatch is configured with `SIDEREAL_SHARD_MIGRATION_ROUTE_RETIREMENT_ENDPOINTS=shard_id,http://host:port/internal/v1/shard-migration-route-retirement-command;...`, retries with the same migration-command dispatch style, treats duplicate accepted acks as success, and records `source_retirement_dispatching`, `source_retirement_command_acked`, or `source_retirement_dispatch_failed`.
- Replication shards stage the command in memory, then process it from Bevy after migration finalization processing. The source shard validates local shard identity, current source owned-region membership, the local source route epoch/state, target lease region/shard context, and that no eligible authoritative controlled or non-controlled roots remain in the migrated region. On success it removes the region from `ReplicationShardRuntimeConfig.owned_regions`, installs the target lease as `active` in the local `HandoffRouteTable`, and publishes a `Retired` report. On validation failure it publishes a `Rejected` report with a concrete reason.
- Source retirement reports are published nonblocking to gateway `POST /internal/v1/shard-migration-route-retirement-report` with the existing `x-sidereal-handoff-mint-secret` auth contract. The gateway deduplicates by `report_id`, validates migration/job identity, source/target shards, region, source and target epochs, and retirement command ID, then records `source_retired` or `source_retirement_rejected`.
- Native/WASM impact: replication/gateway orchestration metadata and shard-local compute ownership only. This slice does not perform any additional gateway route flip beyond 8.3n, mutate persistence or hydration paths, reduce cadence, queue/refuse admissions, add gateway-proxied transport, or change client UI/runtime behavior.

2026-05-29 Phase 8.3n gateway canonical migration route flip:

- After source and target finalization reports move a migration job to `finalization_ready_for_route_flip`, the gateway now flips the canonical `ShardRouteTable` entry for the migrated region from the source lease to the target lease with state `active`. The flip requires the current route to still match the source shard and source epoch; an already-flipped target `active` lease with the target epoch is treated as idempotent success.
- `GET /admin/dashboard/load-coordinator` exposes route-flip metadata in each migration job: `route_flipped_at_unix_ms`, `route_flip_error`, and terminal states `route_flip_committed` or `route_flip_failed`.
- Health polling continues to update only `active`/`degraded` leases for the shard currently owning a route entry, so source shard health does not overwrite the migrated region after the canonical route points at the target shard.
- Native/WASM impact: gateway routing metadata only. This slice mutates the gateway canonical route table but does not remove source shard `owned_regions`, send shard route-retirement commands, reduce cadence, queue/refuse admissions, add persistence/hydration paths, or change client UI/runtime behavior.

2026-05-29 Phase 8.3m migration finalization reports and target activation:

- `engine-core` now defines acked shard-to-gateway finalization report DTOs: `ShardMigrationFinalizationReport`, `ShardMigrationFinalizationReportStatus::{Ready, Rejected}`, `ShardMigrationFinalizationReportAck`, and protocol version `SHARD_MIGRATION_FINALIZATION_REPORT_PROTOCOL_VERSION = 1`.
- Replication shards now drain staged finalization commands from Bevy systems. Target-role finalization validates the `Migrating` target lease, adds the migrated region to local `ReplicationShardRuntimeConfig.owned_regions` if needed, and installs an `Active` target lease in the local shard `HandoffRouteTable` before publishing `Ready`. Source-role finalization validates source ownership and route lease epoch and publishes `Ready` only when no eligible authoritative roots remain in the region; it does not remove the source-owned region or flip the source local route table.
- Finalization reports are published nonblocking to gateway `POST /internal/v1/shard-migration-finalization-report` with the existing `x-sidereal-handoff-mint-secret` auth contract and `SIDEREAL_GATEWAY_HANDOFF_MINT_SECRET` / `GATEWAY_JWT_SECRET` fallback. The gateway deduplicates by `report_id`, validates migration/job identity, source/target shards, role, region, source/target lease epochs, and finalization command ID, then stores source/target reports.
- `GET /admin/dashboard/load-coordinator` exposes stored finalization report payloads and terminal pre-route-flip states. Any rejected report moves the job to `finalization_rejected`; both ready reports move it to `finalization_ready_for_route_flip`.
- Native/WASM impact: replication/gateway orchestration metadata only. This slice can activate the target shard locally before the gateway route flip, but it does not mutate the gateway route table, remove source-owned regions, finalize/flip the canonical route, reduce cadence, queue/refuse admissions, add persistence/hydration paths, or change client UI/runtime behavior.

2026-05-29 Phase 8.3l migration finalization command barrier:

- `engine-core` now defines the acked migration finalization command DTOs: `ShardMigrationFinalizationCommand`, `ShardMigrationFinalizationCommandAck`, and protocol version `SHARD_MIGRATION_FINALIZATION_COMMAND_PROTOCOL_VERSION = 1`. Commands carry source/target lease context, command role, region, and the completed execution report ID.
- Replication shards expose receiver/staging only at `POST /internal/v1/shard-migration-finalization-command` on the existing replication health/internal HTTP server. The route uses `Authorization: Bearer <SIDEREAL_INTER_SHARD_AUTH_TOKEN>`, validates role-to-local-shard addressing, stages valid commands in memory keyed by `(migration_id, role)`, and returns accepted duplicate acks idempotently.
- Gateway load-coordinator jobs now include finalization dispatch states `finalization_dispatching`, `finalization_commands_acked`, and `finalization_dispatch_failed`, plus source/target finalization acks, attempt count, last dispatch timestamp, and concise last error fields in `planned_migration_jobs` returned by `GET /admin/dashboard/load-coordinator`.
- Gateway finalization dispatch is enabled by `SIDEREAL_SHARD_MIGRATION_FINALIZATION_ENDPOINTS=shard_id,http://host:port/internal/v1/shard-migration-finalization-command;...`. When a job records a `Completed` execution report, the gateway sends source and target JSON finalization commands with the same inter-shard bearer-token contract, retries up to three times, treats accepted duplicate acks as success, and records `finalization_dispatch_failed` for missing endpoints, HTTP failures, rejected acks, or mismatched acks.
- Follow-up note: commit `0e7c6d0` extended 8.3k source `Failed` execution reports to invalid source drain and progress-unavailable failures so accepted staged execution commands do not leave gateway jobs stuck in `execution_command_acked`.
- Native/WASM impact: internal replication/gateway orchestration metadata only. This slice does not process finalization commands in Bevy, flip routes, mutate shard-owned regions, finalize migration, reduce cadence, queue/refuse admissions, add persistence/hydration paths, or change client UI/runtime behavior.

2026-05-29 Phase 8.3k migration execution completion reporting:

- `engine-core` now defines terminal source execution report DTOs: `ShardMigrationExecutionReport`, `ShardMigrationExecutionReportStatus::{Completed, Failed}`, `ShardMigrationExecutionReportAck`, and protocol version `SHARD_MIGRATION_EXECUTION_REPORT_PROTOCOL_VERSION = 1`. Reports carry the execution command ID, source/target lease epochs, expected and completed root counts, optional failed root GUID, and a concise failure reason.
- Source shards track in-memory migration execution progress keyed by `migration_id` after validating a staged execution command and before queueing per-root source handoffs. A `Completed` report is published only after every expected migration root has received commit ack through the existing handoff flow. A `Failed` report is published once on the first migration root abort, timeout, source lease/pre-prepare failure, token mint failure, snapshot failure, or prepare-send failure. Duplicate execution command delivery does not create a second progress record or report.
- Reports are published nonblocking to gateway `POST /internal/v1/shard-migration-execution-report` with the existing `x-sidereal-handoff-mint-secret` auth contract and `SIDEREAL_GATEWAY_HANDOFF_MINT_SECRET` / `GATEWAY_JWT_SECRET` fallback. The gateway deduplicates by `report_id`, validates migration/job identity, source/target shards, region, source/target lease epochs, execution command ID, and root counts, then transitions load-coordinator jobs from `execution_command_acked` to `execution_completed` or `execution_failed`.
- `GET /admin/dashboard/load-coordinator` exposes the new terminal states and stored execution report payloads through the existing additive planned-migration job details. These states are reporting-only in this slice; they do not flip routes, mutate shard-owned regions, finalize migration, reduce cadence, or queue/refuse admissions.
- Native/WASM impact: replication/gateway orchestration metadata only. This slice observes existing handoff completion/failure paths and adds internal reporting; it does not add a new persistence/hydration path or change client UI/runtime behavior.

2026-05-29 Phase 8.3j source migration execution handoff drain:

- Migration-aware `POST /internal/v1/handoff-token` now requires the load-coordinator migration job to be `execution_command_acked`, superseding the 8.3h `preflight_ready` mint gate. Normal route-table token minting is unchanged and still accepts only `active` or `degraded` route leases from the canonical `ShardRouteTable`.
- Source shards now drain staged `ShardMigrationExecutionCommand` records from Bevy systems, validate them against the ready source preflight record, deterministic source preflight report ID, source route lease epoch/state, expected root counts, and `Migrating` target lease context, then submit existing `SourceHandoffRequest` values with migration context through the normal source handoff path.
- The existing replication health fields `handoffs_in_flight`, `handoffs_in_flight_high_water`, and `handoffs_queued` include migration roots once execution drain submits them. No new migration-specific handoff counters are added in this slice.
- Native/WASM impact: replication/gateway orchestration only. This slice may start the existing handoff flow for preflight roots after gateway execution ack, but does not mutate routes, mutate shard-owned regions, mark migration complete, retire source regions, add persistence/hydration paths outside existing handoff, reduce cadence, queue/refuse admissions, or change client UI/runtime behavior.

2026-05-29 Phase 8.3i gateway-authorized migration execution command:

- `engine-core` now defines the source-only migration execution command DTOs: `ShardMigrationExecutionCommand`, `ShardMigrationExecutionCommandAck`, and protocol version `SHARD_MIGRATION_EXECUTION_COMMAND_PROTOCOL_VERSION = 1`. The command carries source/target lease context, source/target preflight report IDs, and expected root counts from source preflight.
- Replication shards expose authenticated receiver/staging only at `POST /internal/v1/shard-migration-execution-command` on the existing replication health/internal HTTP server. The route uses the same `Authorization: Bearer <SIDEREAL_INTER_SHARD_AUTH_TOKEN>` contract as `POST /internal/v1/shard-migration-command`, rejects unsupported protocol versions and commands not addressed to the local source shard, and stages valid commands in an in-memory source-shard inbox keyed by migration ID. Duplicate staged migrations return `accepted=true, duplicate=true`.
- Gateway load-coordinator jobs now include execution dispatch states `execution_dispatching`, `execution_command_acked`, and `execution_dispatch_failed`, plus source execution ack, attempt count, last dispatch timestamp, and concise last error fields in `planned_migration_jobs` returned by `GET /admin/dashboard/load-coordinator`. When a job transitions to `preflight_ready`, the gateway marks it `execution_dispatching` before spawning nonblocking HTTP dispatch to prevent duplicate preflight reports from starting duplicate execution dispatches.
- Gateway execution dispatch is enabled by `SIDEREAL_SHARD_MIGRATION_EXECUTION_ENDPOINTS=shard_id,http://host:port/internal/v1/shard-migration-execution-command;...`. Dispatch sends one JSON `ShardMigrationExecutionCommand` to the source shard with `Authorization: Bearer <SIDEREAL_INTER_SHARD_AUTH_TOKEN>`, retries up to three times, treats duplicate accepted acks as idempotent success, and records `execution_dispatch_failed` for missing endpoints, HTTP failures, rejected acks, or mismatched acks.
- Native/WASM impact: internal replication/gateway orchestration metadata only. This slice adds a gateway-authorized execution barrier but does not itself queue source handoff requests, freeze roots, send `EntityHandoffPrepare`, execute handoff, mutate routes, mutate shard-owned regions, add persistence/hydration paths, reduce cadence, queue/refuse admissions, or change client UI/runtime behavior.

2026-05-29 Phase 8.3h shard migration preflight reports:

- `engine-core` now defines acked shard-to-gateway migration preflight report DTOs: `ShardMigrationPreflightReport`, `ShardMigrationPreflightReportStatus`, `ShardMigrationPreflightReportAck`, and protocol version `SHARD_MIGRATION_PREFLIGHT_REPORT_PROTOCOL_VERSION = 1`.
- Replication shards publish one nonblocking internal HTTP report to gateway `POST /internal/v1/shard-migration-preflight-report` whenever source or target migration command preflight reaches `preflight_ready` or `preflight_rejected`. Reports use `x-sidereal-handoff-mint-secret` with the same `SIDEREAL_GATEWAY_HANDOFF_MINT_SECRET` / `GATEWAY_JWT_SECRET` fallback as shard load alerts and handoff-token minting. Local report IDs are deterministic per `(migration_id, role)` and the publisher keeps an in-memory sent-key set so the same terminal record is not requeued every frame.
- Gateway validates protocol version, migration/job identity, role shard, region, source lease epoch, and target lease epoch before mutating a migration job. Duplicate `report_id` values return `accepted=true, duplicate=true`. A single ready report leaves the job `commands_acked`; both ready reports transition to `preflight_ready`; any rejected report transitions to `preflight_rejected`.
- Migration-aware `POST /internal/v1/handoff-token` required a load-coordinator migration job in `preflight_ready` state for this slice; the later 8.3j update above supersedes this with the `execution_command_acked` gate. Normal route-table token minting remains unchanged.
- Native/WASM impact: internal replication/gateway orchestration metadata only. This slice does not start source migration handoffs, execute migration commands, mutate routes, mutate shard-owned regions, add persistence/hydration paths, reduce cadence, queue/refuse admissions, or change client UI/runtime behavior.

2026-05-29 Phase 8.3e migration-aware handoff token mint:

- Gateway `POST /internal/v1/handoff-token` now accepts optional `migration_id` and `target_region` fields in `HandoffTokenMintRequest`. Existing non-migration handoff requests send both fields as `None` and still resolve target endpoints only from the canonical `ShardRouteTable`, accepting only `active` or `degraded` route leases.
- When `migration_id` is present, the gateway resolves the target lease from the in-memory `LoadCoordinatorState` migration job instead of the route table. As of the 8.3j update above, the job must be `execution_command_acked`, match the requested target shard and lease epoch, carry a `migrating` target lease, and match `target_region` when provided.
- Native/WASM impact: internal gateway-to-shard handoff-token mint contract only. This slice does not execute handoff, send prepare/commit/abort, mutate routes, mutate shard-owned regions, hydrate or persist entities, reduce cadence, queue/refuse admissions, or add client UI behavior.

2026-05-29 Phase 8.3d shard-side region migration preflight:

- Replication shards now consume staged `ShardMigrationCommand` records from Bevy systems, not from the HTTP receiver thread, and record shard-local in-memory preflight records keyed by `(migration_id, role)` with `staged`, `preflight_ready`, or `preflight_rejected` state.
- Source-role preflight validates local shard identity, owned-region membership, source/target lease context, target `Migrating` lease state, and the local read-only `HandoffRouteTable` source lease epoch/state before inventorying roots in the migrating `ShardRegion`. Root inventory follows the existing handoff filters: controlled roots require `SimulatedControlledEntity` plus `EntityGuid` and f64 world position; non-controlled roots exclude controlled, frozen, ghost, mounted, child, and player-record entities.
- Target-role preflight validates local target identity and source/target lease context, then records `preflight_ready` with zero local roots. It does not hydrate, spawn, claim ownership, or start handoff.
- Replication health now exposes `migration_preflight_records`, `migration_preflight_staged`, `migration_preflight_ready`, `migration_preflight_rejected`, `migration_preflight_controlled_root_count`, and `migration_preflight_non_controlled_root_count` as aggregate preflight diagnostics.
- Native/WASM impact: replication-server orchestration diagnostics only. This slice does not mutate routes, mutate shard-owned regions, execute handoff, send prepare/commit/abort, hydrate or persist entities, reduce cadence, queue/refuse admissions, or change gateway/client behavior.

2026-05-29 Phase 8.3c gateway migration command dispatch:

- Gateway migration jobs now track command dispatch state (`planned`, `dispatching`, `commands_acked`, `dispatch_failed`) plus source/target `ShardMigrationCommandAck` payloads, dispatch attempt count, last dispatch timestamp, and concise last error text in the additive `planned_migration_jobs` details returned by `GET /admin/dashboard/load-coordinator`.
- Gateway dispatch is enabled by `SIDEREAL_GATEWAY_SHARD_MIGRATION_COMMAND_ENDPOINTS=shard_id,http://host:port/internal/v1/shard-migration-command;...`. Entries must map each shard ID unambiguously to one command URL. Dispatch uses JSON `ShardMigrationCommand` over HTTP with `Authorization: Bearer <SIDEREAL_INTER_SHARD_AUTH_TOKEN>`, retries each source/target command up to three times, and treats `accepted=true` duplicate acks as idempotent success after validating `migration_id`, `shard_id`, and command `role`.
- Alert ingestion remains nonblocking: accepted load alerts may create a planned job and queue gateway-side command dispatch, but the alert response does not wait for shard delivery. A job reaches `commands_acked` only after both source and target shard command receivers ack the staged command.
- Native/WASM impact: gateway orchestration metadata and internal HTTP command dispatch only. This slice does not mutate `ShardRouteTable`, mutate shard-owned regions, execute handoff, move entities, write persistence, reduce cadence, queue/refuse admissions, or change client/runtime transport behavior.

2026-05-29 Phase 8.3b shard migration command receiver:

- `engine-core` defines the acked gateway-to-shard migration command DTOs: `ShardMigrationCommand`, `ShardMigrationCommandRole`, `ShardMigrationCommandAck`, and protocol version `SHARD_MIGRATION_COMMAND_PROTOCOL_VERSION = 1`.
- Replication shards expose authenticated receiver/staging only at `POST /internal/v1/shard-migration-command` on the existing replication health/internal HTTP server. The route requires `Authorization: Bearer <SIDEREAL_INTER_SHARD_AUTH_TOKEN>`; an unset or mismatched token is rejected instead of opening an unauthenticated internal command path.
- Valid commands are staged in a shard-local in-memory inbox keyed by `(migration_id, role)`. Retries for the same key return `accepted=true, duplicate=true`. The receiver validates protocol version and role-to-local-shard match before staging.
- Native/WASM impact: replication-server internal orchestration metadata only. This slice does not dispatch commands from gateway jobs, mutate `ShardRouteTable`, mutate `ReplicationShardRuntimeConfig.owned_regions`, execute entity handoff, write persistence, reduce cadence, queue/refuse admissions, or change client/runtime transport behavior.

2026-05-29 Phase 8.3a gateway migration planning dry run:

- Gateway `LoadCoordinatorState` now performs deterministic dry-run migration planning when a non-duplicate `ShardLoadAlert` is accepted. Planning may create gateway-local `Planned` migration job records carrying `migration_id`, `triggering_alert_id`, source/target shards, the selected `ShardRegion`, source and target `ShardLease` context, timestamps, and triggered-condition reason details.
- Target selection is driven only by health-sampled capacity. A target shard must report 10 consecutive cool health samples before it is eligible; cool means non-degraded, `fixed_tick_wall_ms_p95 <= 12.0`, `outbound_estimated_bytes_per_client_s <= 32 * 1024`, `lightyear_replication_actions_queue_depth_max <= 100`, and `shard_input_oldest_age_ms <= 250.0`. Alert records do not increment cool-sample counters.
- Planning uses the current one-lease-per-region `ShardRouteTable` only as read-only input. Candidate region selection honors `candidate_hot_region` only when the source owns it and the route table maps it to the source; otherwise the planner chooses the first source-owned route region sorted by `x,y`. The future target lease in the job uses the selected target shard endpoints and `source_lease.epoch + 1`.
- `GET /admin/dashboard/load-coordinator` now includes additive `planned_migration_jobs` details while preserving the existing count fields.
- Native/WASM impact: gateway diagnostics/orchestration metadata only. This slice does not send shard commands, mutate `ShardRouteTable`, move entities, write ghost/handoff shadow persistence, reduce cadence, queue/refuse admissions, or change client/runtime transport behavior.

2026-05-29 Phase 8.2 shard load alert idempotency follow-up:

- Gateway shard load alert ingestion classifies recent duplicate `alert_id` values and stale per-shard timestamps before mutating `ShardLoadAlertStore` or `LoadCoordinatorState`. A retry of an earlier alert after a newer same-shard alert is accepted returns `accepted=true, duplicate=true` and leaves both latest-alert storage and coordinator history/capacity on the newer alert.
- Native/WASM impact: gateway diagnostics only. No route-table mutation, migration orchestration, cadence reduction, admission control, client/runtime transport, persistence, or authoritative gameplay behavior change.

2026-05-29 Phase 8.2 gateway load coordinator capacity state:

- Gateway API state now includes `LoadCoordinatorState`, a bounded observe-only coordinator model keyed by `ShardId`. It records the latest per-shard capacity from accepted shard load alerts and from configured shard health polling.
- Capacity records preserve source (`health` or `alert`), observed time, health status/degraded state where available, owned regions, alert-backed lease epochs by region, connected clients, hot entities, input oldest age, Lightyear actions queue-depth max, outbound estimated bytes per client per second, fixed-tick wall p95, and alert triggered conditions. Alert history is globally bounded and duplicate recent `alert_id` values do not append a second history entry.
- The coordinator includes inert skeleton fields for future in-flight migration jobs, per-region cooldowns, and admission queues. Phase 8.2 does not choose target shards, issue migration or handoff commands, reduce cadence, queue admissions, or mutate `ShardRouteTable` from load alerts/capacity. Existing health polling still only flips `Active`/`Degraded` leases and preserves `Migrating`, `Draining`, and `Retired`.
- Gateway exposes `GET /admin/dashboard/load-coordinator` for read-only diagnostics guarded by the same gateway-admin `metrics:read` authorization pattern as `GET /admin/dashboard/shard-routes`. The response contains `generated_at_unix_ms`, `shard_count`, sorted `latest_capacity_records`, `alert_history_count`, `in_flight_migration_job_count`, `cooldown_count`, and `admission_queue_count`.
- Native/WASM impact: gateway diagnostics only. No client/runtime transport impact, no persistence shape change, no migration orchestration, and no authoritative gameplay behavior change.

2026-05-28 Phase 8.1 observe-only shard load alerts:

- Replication shards sample load-trigger health once per second and publish `ShardLoadAlert` only after one of the Phase 8 load conditions remains above threshold for 30 consecutive samples: `fixed_tick_wall_ms_p95 > 12.0`, `outbound_estimated_bytes_per_client_s > 32 * 1024`, `lightyear_replication_actions_queue_depth_max > 100`, or `shard_input_oldest_age_ms > 250.0`.
- Alert transport is internal HTTP JSON: `POST /internal/v1/shard-load-alert` with a `ShardLoadAlert` body. The endpoint uses the same internal mint secret as `/internal/v1/handoff-token`, supplied in `x-sidereal-handoff-mint-secret` and resolved from `SIDEREAL_GATEWAY_HANDOFF_MINT_SECRET` with the existing `GATEWAY_JWT_SECRET` fallback. The response body is `ShardLoadAlertAck` with `accepted` and `duplicate` flags.
- The gateway keeps observe-only state in `ShardLoadAlertStore`, a latest-alert-per-`source_shard_id` map. A repeated `alert_id` for the same shard is idempotent and returns `duplicate=true`; new alerts replace the stored entry. This store does not mutate `ShardRouteTable`, start migration, rank capacity, or coordinate handoff. A future admin/debug endpoint may expose the store for operators.
- Native/WASM impact: replication-server and gateway diagnostics only. No client runtime, transport payload, persistence, route-table mutation, migration, or authoritative gameplay behavior changes.

2026-05-28 Phase 8.1 load-trigger health metric prerequisite:

- Replication runtime health now exposes `fixed_tick_wall_ms_p95`, computed as nearest-rank p95 over the recent in-memory fixed-step wall-time sample buffer.
- Replication runtime health now exposes `outbound_estimated_bytes_per_client_s`, computed from `outbound_estimated_bytes_total` deltas divided by elapsed health-sample seconds and `clients_with_recent_activity` when nonzero, otherwise `shard_connected_clients`.
- Native/WASM impact: replication-server diagnostics only. No client runtime, transport payload, persistence, or authoritative gameplay behavior changes.

2026-05-28 Pattern A handoff metric update:

- Replication health now exposes `handoff_prepare_to_commit_p95_ms`, sourced from `HandoffMetrics::prepare_to_commit_p95_ms()`, so Phase 7.1 fresh-connection handoff captures can inspect target prepare-to-commit latency through `/health` and the existing flattened observability exporter.
- Native/WASM impact: replication-server diagnostics only. No client runtime, transport payload, prediction, persistence, or authoritative gameplay behavior changes.

2026-05-28 Phase 8.0 handoff concurrency health update:

- Replication health exposes `handoffs_in_flight`, the current count of in-flight per-root handoffs at the source shard, sourced from `SourceHandoffs::in_flight_count()` in `bins/sidereal-replication/src/replication/handoff.rs`.
- Replication health exposes `handoffs_in_flight_high_water`, the maximum source-side in-flight handoff count observed since shard start, sourced from `SourceHandoffs::in_flight_high_water()` in `bins/sidereal-replication/src/replication/handoff.rs`.
- Replication health exposes `handoffs_queued`, the current count of source-side handoff requests queued beyond `HANDOFF_CONCURRENCY_CAP`, sourced from `SourceHandoffs::queued_count()` in `bins/sidereal-replication/src/replication/handoff.rs`.
- Replication health exposes `handoff_concurrency_cap`, the source-side cap on concurrent in-flight handoffs per shard, sourced from `SourceHandoffs::concurrency_cap()` in `bins/sidereal-replication/src/replication/handoff.rs`; it is currently 8 and Phase 8.3 migration orchestration tunes against this ceiling.
- Native/WASM impact: replication-server diagnostics only. No client runtime, transport payload, prediction, persistence, or authoritative gameplay behavior changes.

2026-05-23 DR-0040 Phase 3 load-capture update:

- Phase 0 and MMO synthetic load captures start a managed `sidereal-persistence-service` by default when `SIDEREAL_REPLICATION_PERSISTENCE_INPROCESS` is unset. The capture summary records `managed_persistence`, `persistence_endpoint`, `persistence_health_bind`, and `persistence_log`; the MMO gate artifact mirrors these as `mmo_load_managed_persistence`, `mmo_load_persistence_endpoint`, and `mmo_load_persistence_health_bind`.
- This keeps post-Phase-3 baseline captures on the same default remote-persistence path as normal runtime startup. Setting `SIDEREAL_REPLICATION_PERSISTENCE_INPROCESS=1` still disables managed persistence and selects the explicit dev/test fallback.
- Native/WASM impact: backend load scripts only. Client runtime and transport payloads are unchanged.

2026-05-22 DR-0040 Phase 3 persistence-service metrics update:

- `sidereal-persistence-service` exposes `/health` on `SIDEREAL_PERSISTENCE_HEALTH_BIND` (default `127.0.0.1:15717`; `127.0.0.1:15716` remains the replication diagnostics default). The persistence-service health payload owns the durable-writer backlog fields `persistence_pending_latest_age_s`, `persistence_pending_latest_records`, `persistence_coalesced_replacements`, and `persistence_coalesced_records`, plus the existing enqueue/full/disconnect/worker counters and service fields `persistence_service_pending_writes`, `persistence_service_connected_shards`, `persistence_service_write_durations_p95_ms`, and `persistence_service_hydrate_durations_p95_ms`.
- Replication health keeps client-side persistence backpressure visible with `persistence_client_queue_depth` and `persistence_client_last_ack_age_s`. During the Phase 3 transition, replication still exposes the legacy `persistence_pending_*` / `persistence_coalesced_*` keys for compatibility; those keys describe the replication-side client queue when remote persistence is enabled and should be treated as service-authoritative only on the persistence-service `/health` endpoint.
- Native/WASM impact: backend diagnostics only. Client runtime and transport payloads are unchanged.

2026-05-22 observer candidate hard-cap metrics update:

- Replication health now exposes observer candidate hard-cap settings and outcomes: `visibility_observer_candidate_entity_hard_budget`, `visibility_observer_candidate_cell_hard_budget`, `visibility_observer_candidate_entity_hard_cap_clients`, `visibility_observer_candidate_cell_hard_cap_clients`, `visibility_observer_candidate_entities_hard_capped_total`, and `visibility_observer_candidate_cells_hard_capped_total`.
- Phase 0 capture summaries parse the visibility summary-log `observer_hard_cap[entity/cell/entity_clients/cell_clients/entity_dropped/cell_dropped]` block into matching `visibility_observer_candidate_*_last` fields.
- Soft observer budget fields remain pre-hard-cap pressure telemetry for their stage; hard-cap fields record actual work dropped by `SIDEREAL_VISIBILITY_OBSERVER_CANDIDATE_*_HARD_BUDGET`.
- Native/WASM impact: replication-server health/log summary and load scripts only. No client runtime, protocol, persistence, or authoritative gameplay behavior changes.

2026-05-22 replication link-conditioner diagnostics update:

- Replication can install a default-off Lightyear receive-path link conditioner from `SIDEREAL_REPLICATION_LINK_CONDITIONER_LOSS_RATIO`, `SIDEREAL_REPLICATION_LINK_CONDITIONER_LATENCY_MS`, `SIDEREAL_REPLICATION_LINK_CONDITIONER_JITTER_MS`, and `SIDEREAL_REPLICATION_LINK_CONDITIONER_DROP_PATTERN`.
- When any link-conditioner env var is present, replication emits a startup warning that the mode is diagnostic-only and must not be used in production. `DROP_PATTERN=off` leaves the conditioner disabled; unset `DROP_PATTERN` defaults to `uniform` when any other conditioner env var is present. `burst` is accepted as a requested pattern but V1 uses Lightyear's existing uniform loss model underneath.
- Replication health/observability now expose `link_conditioner_enabled`, `link_conditioner_loss_ratio`, `link_conditioner_latency_ms`, and `link_conditioner_jitter_ms`. Health JSON also exposes `link_conditioner_drop_pattern`, `link_conditioner_direction`, and `link_conditioner_transports`.
- Phase 0 capture summaries and MMO load gate artifacts record both the caller-provided conditioner env values and the observability-backed health fields so lossy/jittered diagnostic runs remain comparable to clean runs. The MMO load wrapper writes the existing key/value gate artifact plus a JSON companion with the same fields.
- Current transport coverage is server inbound receive conditioning on Lightyear `Link` entities. This covers packets arriving at the replication server for both UDP and WebTransport link entities; server outbound and client-side asymmetric conditioning are not installed in V1.
- Native/WASM impact: replication-server diagnostics and load scripts only. No client-side hook, protocol payload, prediction, visibility, persistence, or authoritative gameplay behavior changes.

2026-05-21 visibility role-rearm metrics update:

- Replication health now exposes role-rearm counters for controlled-entity replication topology changes: `visibility_role_rearm_queued_roots_last`, `visibility_role_rearm_rearmed_entities_last`, `visibility_role_rearm_rearmed_visible_clients_last`, `visibility_role_rearm_queued_loss_passes_last`, `visibility_role_rearm_pending_loss_passes`, `visibility_role_rearm_queued_roots_total`, `visibility_role_rearm_rearmed_entities_total`, and `visibility_role_rearm_queued_loss_passes_total`.
- Replication health also exposes the Phase 1.2 reconcile gate metrics `reconcile_control_replication_roles_last_wall_ms`, `reconcile_control_replication_roles_max_wall_ms`, `reconcile_control_replication_roles_skipped_last`, and `reconcile_control_replication_roles_skipped_total`.
- These fields distinguish legitimate owner/control handoff role rearm from unrelated observer join churn when investigating missing ships or visibility-loss spikes.
- Native/WASM impact: replication-server diagnostics only. No client protocol, prediction, browser transport, or authoritative gameplay behavior changes.

2026-05-14 load baseline profile update:

- Phase 0 dense captures now accept `SIDEREAL_PHASE0_ASTEROID_FIELD_COUNT` for the `multi_sector_far_fields` scenario and record `phase0_asteroid_field_count` plus `dense_asteroid_members` in the summary. `scripts/run_mmo_synthetic_load_tier.sh` exposes the same knob as `SIDEREAL_MMO_LOAD_ASTEROID_FIELD_COUNT` and copies the configured count/member total into the MMO gate artifact.
- MMO load gate artifacts now copy client stall-frame pacing samples from the Phase 0 summary as `mmo_load_phase0_stall_frame_update_delta_ms_max_observed` and `mmo_load_phase0_stall_frame_gap_samples_observed`. The optional gate `SIDEREAL_MMO_LOAD_MAX_PHASE0_STALL_FRAME_UPDATE_DELTA_MS` can fail a run when the observed max stall-frame update delta exceeds a configured threshold.
- Phase 0 summaries now include client-side duplicate visual suppression evidence when native Phase 0a capture logs are present: `duplicate_winner_swaps_*_observed`, `duplicate_suppressed_entities_max_observed`, and per-reason max fields for controlled-GUID, player-tag, non-winner, and unknown suppression. MMO load artifacts copy these as `mmo_load_duplicate_*` fields; headless transport captures that do not install visual presentation systems report these fields as `n/a`.
- Phase 0 captures support `SIDEREAL_PHASE0_ISOLATED_DATABASE_MODE=empty` to create a fresh isolated database without cloning the active local `sidereal` database. MMO load tiers default to this mode and to `SIDEREAL_PHASE0_AUTO_SEED_CHARACTER=1`, which seeds a Phase 0 account/character through `seed_phase0_character` when no player is available.
- Phase 0 captures can start a managed local gateway automatically when no explicit `SIDEREAL_GATEWAY_URL` / `GATEWAY_URL` is provided. Summaries record `auto_seed_character`, `managed_gateway`, `gateway_url`, and `gateway_log`; MMO gate artifacts copy the corresponding fields as `mmo_load_auto_seed_character`, `mmo_load_managed_gateway`, and `mmo_load_gateway_url`.
- MMO load gates support `SIDEREAL_MMO_LOAD_GATE_MODE=slo` (default) and `SIDEREAL_MMO_LOAD_GATE_MODE=smoke`. `slo` enforces the production p95 input, receive-to-drain, fixed-tick, persistence, visibility, and degraded-shard thresholds. `smoke` still requires a complete baseline, observability samples, accepted input, and zero input drops, but skips the production latency/degraded-health SLO checks so short debug runs can validate harness wiring.
- This keeps client-count, entity-count, input-age, fixed-tick debt, accepted-input, outbound-byte, visibility churn, tactical/read-model, client frame-pacing, gateway, and seed evidence in one comparable artifact.
- Native/WASM impact: native load scripts and replication/client diagnostics only. No protocol, visibility authorization, prediction ownership, transport, browser runtime behavior, or authoritative state path changed.

2026-05-09 scripting snapshot metrics:

- Runtime scripting snapshot maintenance now reports `lua_runtime.snapshot_refresh_runs`, `lua_runtime.snapshot_dirty_updates_last`, `lua_runtime.snapshot_dirty_updates_total`, `lua_runtime.snapshot_removed_last`, and `lua_runtime.snapshot_entities_last` through replication health/observability. Phase 0 summaries copy dirty-update, removal, and entity-count fields as `metrics_lua_runtime_snapshot_*`.
- Runtime scripting stale-event tracking reports `lua_runtime.event_queue_stale_dropped_last`, `lua_runtime.event_queue_stale_dropped_total`, and `lua_runtime.event_queue_oldest_age_s`; Phase 0 summaries copy total stale drops and oldest event age.
- These counters distinguish dirty script-visible entity updates from full scripting lane runtime, so load captures can verify script snapshot churn without adding console summary logs.
- Native/WASM impact: replication-server diagnostics only. No client protocol, prediction, visibility, or browser runtime behavior changes.

2026-05-09 persistence worker backpressure metrics:

- Persistence worker progress now reports `persistence_worker_busy`, `persistence_worker_latest_write_ms`, and `persistence_worker_failed_write_attempts` through replication health/observability. Phase 0 summaries copy these as `metrics_persistence_worker_*`.
- These fields complement queue/coalescing age metrics by showing whether the worker has an incomplete write, how long the latest write attempt took, and whether transactional graph writes have failed/retried.
- Native/WASM impact: replication-server persistence diagnostics only. Persistence schema, graph record shape, client protocol, and client runtime behavior are unchanged.

2026-05-09 visibility cell-dirty worklist validation metrics:

- Phase 0 summaries now include observability-backed `metrics_visibility_cell_dirty_worklist_enabled`, `metrics_visibility_cell_dirty_worklist_dirty_cells_max`, `metrics_visibility_cell_dirty_worklist_dirty_entities_max`, and `metrics_visibility_cell_dirty_worklist_entities_max` fields. These are available even when debug visibility summary logs are disabled.
- MMO load gate artifacts now copy those fields as `mmo_load_visibility_cell_dirty_worklist_*` and support gates `SIDEREAL_MMO_LOAD_MAX_VISIBILITY_CELL_DIRTY_WORKLIST_ENTITIES` and `SIDEREAL_MMO_LOAD_MAX_VISIBILITY_CELL_DIRTY_WORKLIST_DIRTY_ENTITIES`.
- The cell-dirty worklist is the default visibility apply path. `SIDEREAL_VISIBILITY_USE_CELL_DIRTY_WORKLIST=0`, `false`, or `off` rolls back to the broad apply worklist for comparison captures. The MMO load-tier wrapper records `mmo_load_visibility_use_cell_dirty_worklist`. Configured numeric gates reject missing, `NaN`, or infinite metric values.
- Native/WASM impact: replication-server diagnostics and load scripts only. Visibility authorization, delivery narrowing, payload redaction, protocol shape, and client runtime behavior are unchanged.

2026-05-09 replication group send-frequency validation metadata:

- MMO load gate artifacts now record the configured `SIDEREAL_REPLICATION_GROUP_*_SEND_HZ` class send-frequency overrides as `mmo_load_replication_group_*_send_hz`.
- These overrides are disabled by default and are intended for controlled validation runs comparing Lightyear component replication bytes/client/sec, queue depths, and owner correction behavior against class-level group throttling.
- Native/WASM impact: load metadata and replication-server Lightyear group policy only. No default replication cadence, protocol, client runtime, or visibility behavior changes.

2026-05-22 typed shard health metadata:

- Replication health now treats `shard_id` as the numeric typed `ShardId` used by DR-0040 Phase 2. `SIDEREAL_REPLICATION_SHARD_ID` must parse as `u32`; unset or invalid values fall back to local shard `0`.
- Replication health exposes `shard_owned_regions` and `shard_owned_region_keys` so captures record the compute-authority `ShardRegion` set owned by this process. `SIDEREAL_REPLICATION_OWNED_REGIONS=x,y;x,y;...` configures the set; unset defaults to the single-shard origin region `(0,0)`.
- `SIDEREAL_SHARD_REGION_SIZE_M` is validated at gateway/replication startup against the active visibility sector size after visibility's sector-vs-cell clamp: unset defaults to `8 * active_visibility_sector_size_m`, and explicit values must be finite, positive, at least the active visibility sector size, and an integer multiple of that sector size.
- Replication health exposes `shard_region_size_m`, `shard_region_visibility_sector_size_m`, and `shard_region_visibility_sectors_per_axis` so captures record the grid scale used to interpret `ShardRegion` keys.
- Phase 0 summaries copy the scalar owned-region count as `metrics_shard_owned_regions` and the sizing fields as `metrics_shard_region_size_m`, `metrics_shard_region_visibility_sector_size_m`, and `metrics_shard_region_visibility_sectors_per_axis`; region keys remain in `/health` for direct diagnostics.
- `shard_region_*_m` bounds remain as legacy/local operator metadata for current single-process diagnostics, but `ShardRegion` ownership is the DR-0040 authority surface for new multi-shard work.
- Native/WASM impact: replication-server diagnostics and load captures only. Client runtime behavior and transport protocol are unchanged by these health fields.

2026-05-23 DR-0040 Phase 5 multi-process routing health:

- Gateway route-table health polling consumes each configured replication shard `/health` payload through `SIDEREAL_GATEWAY_SHARD_HEALTH_ENDPOINTS=shard_id,http://host:port/health;...`. A degraded shard health payload, unreachable endpoint, or mismatched `shard_id` marks that shard's gateway `ShardLease` entries `Degraded`; healthy payloads restore them to `Active`.
- Gateway exposes `GET /admin/dashboard/shard-routes` for admin/dashboard diagnostics. The payload includes `generated_at_unix_ms`, `route_count`, and sorted `routes` containing the current `ShardLease` values, including lease state and transport endpoints. The dashboard proxy route is `GET /api/routing/shard-routes`.
- Phase 5 validation treats per-shard `shard_owned_regions` and `shard_connected_clients` as required multi-process health evidence. The `two_process_shards_idle_session` integration test asserts both shards report one owned region and one connected client.
- Native/WASM impact: backend diagnostics and dashboard proxy only. Native and WASM clients continue to use the existing world-entry response transport endpoints.

2026-05-08 visibility deferred-queue age metric:

- Replication health/observability now expose `visibility_deferred_membership_oldest_pending_gain_age_s`, the oldest pending visibility membership gain age in seconds. Phase 0 log summaries also parse the expanded deferred-membership debug line, including max age, oldest pending age, expired releases, and expanded lifetime totals.
- Visibility apply worklist pressure now has a soft budget knob, `SIDEREAL_VISIBILITY_APPLY_WORKLIST_SOFT_BUDGET`, and health fields `visibility_apply_worklist_soft_budget`, `visibility_apply_worklist_budget_exceeded`, and `visibility_apply_worklist_over_budget_entities`.
- Authorized deferred membership gains can now be bounded with `SIDEREAL_VISIBILITY_MEMBERSHIP_DEFERRED_GAIN_MAX_AGE_S`. Health exposes `visibility_deferred_membership_max_gain_age_s`, `visibility_deferred_membership_expired_released_gains`, and `visibility_deferred_membership_expired_released_gains_total` so captures can identify forced releases caused by stale deferred gain queues.
- Shared combat hot-path indexes now expose `gameplay_combat_index_*` health fields. `gameplay_combat_index_*_scanned_last` should be zero in stable scenes after the index is initialized; nonzero values indicate GUID, weapon mount, or hardpoint topology changed and the combat read model rebuilt.
- Runtime scripting budgets can now defer interval handlers, event queue drains, and intent application with `SIDEREAL_SCRIPT_INTERVAL_HANDLER_BUDGET_PER_RUN`, `SIDEREAL_SCRIPT_EVENT_QUEUE_DRAIN_BUDGET_PER_RUN`, and `SIDEREAL_SCRIPT_INTENT_APPLY_BUDGET_PER_RUN`. Lua health exposes deferred interval/event/intent counters on `lua_runtime`.
- Persistence backpressure health now exposes `persistence_coalesced_replacements`, `persistence_coalesced_records`, `persistence_pending_latest_records`, and `persistence_pending_latest_age_s` alongside existing enqueue/full/disconnect counters. When the bounded worker queue is full, the latest pending batch coalesces by graph `entity_id`: newer records replace older records for the same entity while unrelated dirty entities remain queued.
- `scripts/run_mmo_synthetic_load_tier.sh` wraps the native headless capture path into workload/tier gates for `1`, `10`, `50`, `100`, `250`, `500`, and `1000` configured clients. It records commit/env metadata and fails when p95 input age, p95 last receive-to-drain latency, p95 fixed catch-up, p95 visibility deferred age, p95 persistence pending age, or p95 shard degraded status exceed configured SLOs. Continuous workload input scripts default to 30 seconds longer than the capture window so final health samples do not measure stale input after scripted motion has ended. The Phase 0 summary records p95 fields for those gates plus runtime lane p95 wall times, while lifetime `*_max` fields remain available as worst-case context.
- MMO load tiers default to `SIDEREAL_PHASE0_CARGO_PROFILE=release` through `SIDEREAL_MMO_LOAD_CARGO_PROFILE` so SLO gates measure optimized server/client binaries. Direct Phase 0 captures still default to debug unless `SIDEREAL_PHASE0_CARGO_PROFILE=release` is set explicitly.
- Auxiliary clients in MMO load tiers default to `SIDEREAL_CLIENT_HEADLESS_DISABLE_INPUT=1` through `SIDEREAL_MMO_LOAD_EXTRA_CLIENT_DISABLE_INPUT` so connection/session load does not inject duplicate same-player input into the authoritative input-drop gate. Runs with distinct controlled players can set `SIDEREAL_MMO_LOAD_EXTRA_CLIENT_DISABLE_INPUT=0` and provide `SIDEREAL_PHASE0_EXTRA_PLAYER_ENTITY_IDS` / control targets.
- Phase 0 minimum observability assertions count either unique `session_count` or `clients_with_recent_activity` toward the configured headless client count. This keeps same-player auxiliary connection coverage visible while still requiring session-ready/auth log assertions for every process; strict movement-tier input-drop gates still require distinct controlled players for every input-producing client.
- The MMO load wrapper defaults `SIDEREAL_DIAGNOSTICS` to `standard,input=debug,sample.health_hz=1,sample.world_hz=1` unless explicitly overridden through `SIDEREAL_MMO_LOAD_DIAGNOSTICS` or `SIDEREAL_DIAGNOSTICS`. This keeps load validation from turning on debug/trace visibility or motion-replication log spam by accident; direct Phase 0 captures may still opt into more verbose diagnostics.
- Replication health now reports single-shard operational metadata through `shard_id`, optional `shard_region_*_m` bounds, and explicit `shard_connected_clients`, `shard_active_sectors`, `shard_hot_entities`, and `shard_input_oldest_age_ms` counters. Operators can set `SIDEREAL_REPLICATION_SHARD_ID` and `SIDEREAL_REPLICATION_SHARD_REGION_BOUNDS=min_x,min_y,max_x,max_y`.
- Shard health status now changes from `ok` to `degraded` when explicit shard SLO thresholds are exceeded. Health exposes `shard_degraded`, `shard_degraded_reasons`, `shard_input_age_slo_ms`, `shard_fixed_ticks_last_update_slo`, `shard_persistence_pending_age_slo_s`, and `shard_visibility_deferred_gain_age_slo_s`; the corresponding environment knobs are `SIDEREAL_REPLICATION_INPUT_AGE_SLO_MS`, `SIDEREAL_REPLICATION_FIXED_TICKS_LAST_UPDATE_SLO`, `SIDEREAL_REPLICATION_PERSISTENCE_PENDING_AGE_SLO_S`, and `SIDEREAL_REPLICATION_VISIBILITY_DEFERRED_GAIN_AGE_SLO_S`.
- Sidereal-authored outbound server messages now report successful send counters and estimated serialized payload bytes through `outbound_*_messages_total` and `outbound_*_estimated_bytes_total`. Current classes are `control`, `combat_event`, `tactical_snapshot`, `tactical_delta`, `owner_manifest`, `asset_notice`, and `notification`; `outbound_messages_total` and `outbound_estimated_bytes_total` aggregate those classes. These estimates are message payload bytes before Lightyear transport framing.
- Lightyear component replication send metrics are now installed through the `ReplicationSendMetricsObserver` API added in the `Dastari/lightyear` fork at `c2db90da93c16383d1e886b253db790acb0fbb18`. Replication health exposes `lightyear_replication_queued_*`, `lightyear_replication_sent_*`, `lightyear_replication_*_queue_depth_*`, and `lightyear_replication_bandwidth_limited_messages_total` fields for component replication payload bytes, message/entity/component counts, actions vs updates channels, queue depths, and bandwidth-limited selections. These byte counts are serialized replication payload bytes and do not include full packet overhead.
- Lightyear replicated entities now keep per-entity replication groups and receive conservative entity-class priorities for bandwidth-limited sends. Priority order is controlled entities, projectiles, dynamic physics entities, player runtime entities, generic replicated entities, then static world entities. This does not lower send frequency yet; send-frequency reduction remains a later validation step.
- Phase 0 capture summaries now include `metrics_outbound_estimated_bytes_total`, per-class outbound estimated byte totals, `metrics_outbound_estimated_bytes_per_client_s`, `metrics_lightyear_replication_sent_payload_bytes_total`, `metrics_lightyear_replication_sent_payload_bytes_per_client_s`, `metrics_lightyear_replication_sent_component_count_total`, `metrics_lightyear_replication_bandwidth_limited_messages_total`, and Lightyear actions/updates max queue depths so load tiers can compare read-model/event traffic and component replication traffic separately.
- Phase 0 and MMO load summaries now include host/process resource evidence from observability: `metrics_process_cpu_usage_percent_p95`, `metrics_process_cpu_usage_percent_max`, `metrics_process_memory_rss_bytes_max`, `metrics_process_memory_rss_bytes_per_client`, `metrics_process_memory_virtual_bytes_max`, `metrics_host_cpu_global_usage_percent_p95`, `metrics_host_cpu_global_usage_percent_max`, and `metrics_host_memory_used_bytes_max`. The MMO wrapper copies the key CPU, RSS, RSS/client, host CPU, host memory, and outbound bytes/client/sec fields into its gate file.
- Phase 0 summaries record `sector_lifecycle_mode` and observability-backed `metrics_visibility_sector_lifecycle_*` / `metrics_visibility_sector_simulation_*` counts. The MMO load wrapper records `mmo_load_sector_lifecycle_mode` plus those sector lifecycle/simulation tier counts in its gate artifact. The `sector_crossing` workload defaults to `SIDEREAL_SECTOR_LIFECYCLE_MODE=preflight` to collect sector residency preflight evidence without destructive runtime removal unless the operator explicitly selects `active`.
- Server transform projection now runs only for source-dirty Avian `Position`/`Rotation` rows and source-dirty static `WorldPosition`/`WorldRotation` rows. `transform_sync_physics_entities` and `transform_sync_world_entities` therefore mean source-dirty candidates considered in the last pass, and should be zero in stable scenes; update/no-op counters remain churn diagnostics for changed sources whose f32 `Transform` already matched or needed projection.
- Planar physics sanitization now runs only for source-dirty Avian motion components instead of scanning every `RigidBody` on every fixed tick. Health exposes `planar_motion_sanitizer_candidates`, `planar_motion_sanitizer_candidates_max`, and reset counters for non-finite position, velocity, rotation, and angular velocity repair. Stable scenes should report near-zero sanitizer candidates after initialization unless physics or gameplay actually changed authoritative motion.
- Phase 0 summaries now include p95/max source-dirty transform-sync candidates, max transform-sync updates, and p95/max planar sanitizer candidates/reset counters as `metrics_transform_sync_*` and `metrics_planar_motion_sanitizer_*` fields so changed-source projection and sanitizer work can be checked from the normal metrics capture even when debug log summaries are disabled.
- Phase 0 summaries now include observability-backed tactical authoring/contact-index and owner-manifest read-model counters as `metrics_tactical_*` and `metrics_owner_manifest_read_model_*` fields. These values come from replication health metrics rather than debug tactical/owner log lines, so normal standard-diagnostics load captures can still identify tactical full rebuilds, replicated-entity scans, contact-index full-scan fallbacks, contact candidate evaluation volume, and owner-manifest no-op/dirty candidate churn.
- MMO load tiers now support optional resource, bandwidth, sanitizer-work, tactical/read-model churn, and client prediction-gap gates. The defaults are disabled with `n/a`; configured runs can fail on `SIDEREAL_MMO_LOAD_MAX_PROCESS_CPU_P95_PERCENT`, `SIDEREAL_MMO_LOAD_MAX_PROCESS_CPU_PERCENT`, `SIDEREAL_MMO_LOAD_MAX_HOST_CPU_P95_PERCENT`, `SIDEREAL_MMO_LOAD_MAX_PROCESS_RSS_BYTES`, `SIDEREAL_MMO_LOAD_MAX_PROCESS_RSS_BYTES_PER_CLIENT`, `SIDEREAL_MMO_LOAD_MAX_OUTBOUND_ESTIMATED_BYTES_PER_CLIENT_S`, `SIDEREAL_MMO_LOAD_MAX_LIGHTYEAR_REPLICATION_SENT_PAYLOAD_BYTES_PER_CLIENT_S`, `SIDEREAL_MMO_LOAD_MAX_LIGHTYEAR_REPLICATION_ACTIONS_QUEUE_DEPTH`, `SIDEREAL_MMO_LOAD_MAX_LIGHTYEAR_REPLICATION_UPDATES_QUEUE_DEPTH`, `SIDEREAL_MMO_LOAD_MAX_PLANAR_MOTION_SANITIZER_CANDIDATES_P95`, `SIDEREAL_MMO_LOAD_MAX_TACTICAL_AUTHORING_FULL_REBUILDS`, `SIDEREAL_MMO_LOAD_MAX_TACTICAL_REPLICATED_ENTITY_SCANS`, `SIDEREAL_MMO_LOAD_MAX_TACTICAL_CONTACT_FULL_SCAN_FALLBACKS`, `SIDEREAL_MMO_LOAD_MAX_TACTICAL_CONTACT_CANDIDATE_EVALUATIONS`, `SIDEREAL_MMO_LOAD_MAX_OWNER_MANIFEST_READ_MODEL_DIRTY_CANDIDATES`, `SIDEREAL_MMO_LOAD_MAX_OWNER_MANIFEST_READ_MODEL_NOOPS`, and `SIDEREAL_MMO_LOAD_MAX_PHASE0_POST_AUTHORITY_GAP`. Configured numeric gates reject missing, `NaN`, or infinite metric values instead of treating them as zero.
- Reason: visibility/AOI membership budgeting and persistence isolation need queue-age, queue-size, and worklist-pressure signals so load captures can fail on stale deferred gains, stale persistence snapshots, or oversized apply passes instead of only counting pending work.
- Native/WASM impact: replication-server diagnostics, load scripts, and optional visibility gain-budget behavior only. Visibility authorization, delivery narrowing, payload disclosure, transport protocol, and client prediction/interpolation behavior are unchanged.

2026-05-07 MMO lane/input restructure update:

- Realtime client input receive now records fixed-lane receive polls separately from total receive runs, and the hot receive loop collapses valid per-client messages to the highest tick without staging all messages in temporary `Vec` collections.
- Replication health/observability now expose `input_fixed_receive_runs`, `input_latest_wins_collapsed_*`, `input_accepted_to_applied_tick_gap_last`, and `input_stale_control_generation_drop_total` so captures can distinguish fresh polling, latest-wins collapse pressure, and accepted-vs-applied tick drift.
- Noncritical replication work has explicit cadence-gated lanes: motion diagnostics (`REPLICATION_MOTION_REPLICATION_HZ`, default `20`), visibility/AOI membership (`REPLICATION_VISIBILITY_AOI_HZ`, default `10`), tactical/owner/asset streaming (`REPLICATION_TACTICAL_STREAM_HZ`, default `2`), persistence/residency (`REPLICATION_PERSISTENCE_LANE_HZ`, default `2`), runtime scripting intervals/events (`REPLICATION_SCRIPTING_LANE_HZ`, default `10`), and diagnostics snapshots (`REPLICATION_DIAGNOSTICS_LANE_HZ`, default `2`). Health exposes these configured lane cadences as `runtime_lane_*_hz`.
- Each noncritical lane now records run count, last wall time, max wall time, budget, and over-budget totals through `runtime_lane_*_(runs|last_ms|max_ms|budget_ms|over_budget_total)`. Budget knobs are `REPLICATION_MOTION_REPLICATION_BUDGET_MS` default `2`, `REPLICATION_VISIBILITY_AOI_BUDGET_MS` default `4`, `REPLICATION_TACTICAL_STREAM_BUDGET_MS` default `2`, `REPLICATION_PERSISTENCE_LANE_BUDGET_MS` default `4`, `REPLICATION_SCRIPTING_LANE_BUDGET_MS` default `3`, and `REPLICATION_DIAGNOSTICS_LANE_BUDGET_MS` default `3`.
- The authoritative fixed lane keeps input receive/drain, gameplay input application, physics, combat post-processing, dirty marking, and script-intent application. Visibility membership, tactical streams, persistence flush/residency services, script snapshot/interval/event execution, and spatial diagnostics no longer run on every fixed tick.
- Runtime scripting snapshots are published as immutable shared maps for interval/event lane consumers, avoiding a full snapshot-map clone for each scripting pass. Persistence dirty markers now retain a dirty GUID-to-ECS-entity side index so ordinary incremental flushes can avoid a broad `(Entity, EntityGuid)` scan; `persistence_collect_scanned_entities` remains the regression signal and may be nonzero for full snapshots or fallback recovery.
- Native impact: server scheduling and health/metrics behavior only. Prediction/reconciliation ownership remains Lightyear-owned and client transforms remain non-authoritative. WASM impact: no platform-specific branch or protocol split; future WASM clients observe the same server cadence behavior.

2026-05-07 replication scheduling correction:

- The replication Bevy `Update` runner is uncapped by default again. `REPLICATION_UPDATE_CAP_HZ` remains available as an explicit operator opt-in, but local dense-field metrics showed fixed ticks entering catch-up bursts when the default runner cap was active and fixed-tick wall time approached the 60 Hz budget.
- Reason: transport/input draining and fixed simulation must not bunch behind scheduler sleep during native stabilization. A cap may still be useful for idle CPU profiling, but it must be validated against `fixed_ticks_last_update`, `fixed_tick_over_budget_total`, and `input_oldest_age_ms` before being used in gameplay repros.
- 2026-05-07 update: realtime input receive now also runs at the front of the authoritative fixed tick, before action-queue drain, while retaining the existing `Update` receive pass for Lightyear transport stages that surface messages there. Replication health metrics now expose receive/drain timings and counts (`input_receive_*`, `input_drain_*`, `input_received_messages_*`, `input_accepted_latest_*`, `input_action_queue_applies_*`, `input_receive_to_drain_*`) plus transform projection churn (`transform_sync_*`) so dense multi-client rubberbanding captures can distinguish network ingress delay, fixed-step backlog, and broad presentation-transform dirtying.
- Authoritative simulation DB writeback is enabled by default (2026-06-15; previously disabled via a temporary `SIDEREAL_PERSIST_WRITES=off` default during native-stabilization repro isolation). Periodic simulation snapshots, critical control/disconnect snapshots, shutdown simulation flushes, and sector lifecycle flush starts now write runtime state back to Postgres unless `SIDEREAL_PERSIST_WRITES=off` is set; an unrecognized value warns and falls back to `on`. Startup hydration reads from graph persistence regardless of this toggle. Setting `SIDEREAL_PERSIST_WRITES=off` remains available to isolate whether DB writeback or persistence collection is contributing to fixed-tick debt.
- Periodic simulation persistence now exposes collection counters: `persistence_collect_runs`, `persistence_collect_last_ms`, `persistence_collect_max_ms`, `persistence_collect_full_snapshot`, `persistence_collect_dirty_entities`, `persistence_collect_scanned_entities`, and `persistence_collect_records`. These distinguish broad full-snapshot work from incremental dirty-entity collection when investigating fixed-tick stalls.
- Replication health now exposes `persistence_writes_enabled` so captures can prove which persistence mode was active.
- Native impact: replication responsiveness returns to the previous uncapped default without changing protocol, prediction/reconciliation ownership, persistence schema, or client authority. The persistence write toggle is server-only (now defaulting on; the `off` setting is retained as a diagnostic opt-out). WASM impact: none.

2026-05-06 idle-replication CPU update:

- Metrics from the 2026-05-05 idle replication run showed `process.cpu.usage_percent` near 150%, `fixed_tick_last_wall_ms` around 4 ms, `gameplay_mass_dirty_roots=150`, and `gameplay_mass_clean_fast_skips_total=0`.
- Superseded on 2026-05-07: replication briefly capped the Bevy `Update` runner to 120 Hz by default while keeping the 60 Hz fixed simulation cadence. The cap is now explicit opt-in through `REPLICATION_UPDATE_CAP_HZ`.
- Shared mass recomputation now consumes and removes `MassDirty` after a successful recompute so stable roots return to the clean fast path instead of recomputing every fixed tick.
- Native impact: replication idle CPU should drop substantially without changing authoritative fixed-tick simulation, transport protocol, persistence schema, or client behavior. WASM impact: none.

2026-05-05 physics-runtime diagnostics update:

- Implemented: replication health snapshots now expose Avian physics phase metrics for dense-area repros: `physics_collision_broad_phase_ms`, `physics_collision_narrow_phase_ms`, `physics_collision_contact_count`, `physics_solver_solve_constraints_ms`, and `physics_solver_contact_constraint_count`.
- Reason: fixed-tick wall time alone could show the server falling behind, but it did not separate collision broad/narrow-phase or solver work from Sidereal gameplay, visibility, persistence, and streaming systems.
- Native/WASM impact: replication-server diagnostics only. No gameplay, collision policy, prediction, transform authority, client runtime, or browser behavior changes.

2026-05-05:

- Implemented: shared `engine-observability` crate with `SIDEREAL_DIAGNOSTICS` parsing, metric/event models, host metrics collection, bounded PostgreSQL writer, schema creation, async gateway query/prune helpers, and basic tests.
- Implemented: replication exports the existing `ReplicationHealthSnapshot` as structured database metrics through a bounded writer and exports host/process metrics. The exporter flattens current health/TUI fields so newly added numeric snapshot fields are captured without per-field wiring.
- Implemented: gateway creates the observability schema, records request count/duration metrics by route family, records host/process metrics, and exposes secured `/admin/metrics/v1/*` catalog/sample/event/summary/export/prune/reset-series endpoints.
- Implemented: gateway metrics endpoints require gateway-issued access tokens with admin/dev role, verified MFA, and route-specific `metrics:read`, `metrics:export`, or `metrics:prune` scopes.
- Implemented: authenticated bounded client diagnostic aggregate upload endpoint at `POST /diagnostics/v1/client-samples`; values are untrusted diagnostics only.
- Implemented: dashboard `/metrics` route provides an admin-only operational metrics UI with catalog browsing, time-range/domain/service filters, ECharts time-series panels, event inspection, sample table views, polling with hidden-tab pause behavior, and JSON export through dashboard `/api/metrics/*` proxy routes. Browser code calls only dashboard proxy routes; gateway bearer tokens remain server-side.
- 2026-05-05 update: the dashboard event-log browser route is `/api/ops/log-entries`, which still server-side proxies to gateway `GET /admin/metrics/v1/events`. This keeps the gateway metrics contract unchanged while avoiding browser extension filters that block telemetry-looking `/metrics/events` URLs.
- 2026-05-14 update: gateway exposes `GET /admin/metrics/v1/dashboard` as a read-only aggregate payload for the dashboard metrics route. It returns catalog, summary, bounded samples, and bounded events in one authenticated `metrics:read` request so browser refreshes do not fan out across every selected domain.
- Remaining: declarative table partitioning, rollup workers, prune/reset UI, and deeper domain-specific labels for selected high-value metrics.
- Native impact: native clients can upload bounded aggregate diagnostics when wired to the endpoint; no authoritative gameplay behavior changes.
- WASM impact: browser clients can use the same HTTP endpoint after client-side wiring; no transport/runtime behavior change in this step.

2026-05-05 drop-pressure update:

- Standard observability now samples flattened replication health metrics at `sample.health_hz=0.2` by default to keep local PostgreSQL-backed metric volume bounded. Dense capture/debug runs may still opt into higher rates, for example `sample.health_hz=2`.
- The writer persists each metric batch in one PostgreSQL transaction and upserts each catalog key at most once per batch. This avoids per-row autocommit pressure when a health snapshot contains hundreds of numeric fields.
- `observability.writer.dropped_samples` and `observability.writer.dropped_batches` report drops since the previous writer-metric report. Lifetime totals are exposed separately as `observability.writer.dropped_samples_total` and `observability.writer.dropped_batches_total`.
- Native/WASM impact: backend and dashboard diagnostics only. No gameplay, replication, prediction, transport, or browser runtime behavior changes.

2026-05-05 logging-audit update:

- Backend Makefile defaults no longer set legacy diagnostic spam variables.
- Replication health/world snapshot cadence now reads `SIDEREAL_DIAGNOSTICS` sample rates instead of `REPLICATION_HEALTH_SNAPSHOT_HZ` / `REPLICATION_WORLD_SNAPSHOT_HZ`.
- Former per-frame/per-summary backend diagnostics are debug-level only and remain off normal console/file output; structured metrics are the primary diagnostic path.
- Replication BRP defaults now match the local backend Makefile target so `cargo run -p sidereal-replication` starts with the same local BRP defaults unless explicitly overridden.
- Gateway attempts to derive the default WebTransport certificate SHA-256 from the default local dev certificate path when no explicit digest is supplied, matching the Makefile path when the certificate exists.
- `scripts/capture_phase0_dense_baseline.sh` now treats observability metrics as required capture evidence and fails if replication does not emit enough metric samples, session/fixed-tick/input metrics, or if the observability writer drops samples.

2026-06-04 client telemetry pipeline (DR-0048):

This slice adds both **client runtime behavior** (the client now emits structured
telemetry) and a **new gateway route** — state explicitly, unlike prior
backend-only slices.

- `engine-observability` now gates its Postgres writer/store and `sysinfo` host
  metrics behind a default-on `postgres-backend` feature so the pure-serde
  `model`/`config` compile for `wasm32-unknown-unknown`. Backend bins keep default
  features; the client links the crate with `default-features = false`.
- New session-authenticated ingest route `POST /client/telemetry/v1/ingest`
  (under `/client/...`, validated like `client_release_manifest` —
  `extract_bearer_token` → `service.me`; NOT an admin scope). The gateway stamps
  trusted `source="client"`, `account_id` (token `sub`), and `session_id`
  (token `jti`) labels over the batch, overwriting client-supplied identity. The
  client may assert only `build_version`, `platform`, `os`, `gpu`, and a
  per-process `instance_id`.
- Ingest is rate-limited (≤ 2 batches/s per account, one-second windows) and
  bounded (≤ 256 samples / ≤ 64 events per batch, metric/event key ≤ 96 chars,
  label values ≤ 128 chars) with a `metric_key` allowlist (the shared
  `client_metric_catalog()`); over-limit/invalid input is dropped and counted,
  never a 5xx. A dedicated client-ingest `MetricsWriterHandle` isolates client
  volume from gateway-metric writes. Telemetry writes only `observability_*`,
  never gameplay tables.
- New client telemetry metric keys (all under `service="sidereal-client"`, with
  identity + `build_version` labels), grouped by domain/kind/unit:
  - `host`: `client.fps` (gauge, count), `client.frame_time_ms` (gauge, ms),
    `client.update_ms` (gauge, ms), `client.fixed_steps_per_frame` (gauge, count),
    `client.stall_gap_ms` (gauge, ms), `client.window_focused` (gauge, count).
  - `prediction`: `client.prediction_rollbacks_per_s` (gauge, count),
    `client.prediction_rollback_depth_avg` (gauge, ticks),
    `client.prediction_tick_gap` (gauge, ticks),
    `client.prediction_hard_resync_total` (counter, count),
    `client.prediction_focus_recovery_total` (counter, count),
    `client.prediction_controlled_heading_error_rad` (gauge, count),
    `client.prediction_controlled_position_error_m` (gauge, count).
  - `input`: `client.input_send_age_ms` (gauge, ms),
    `client.input_messages_sent_per_s` (gauge, count).
  - `interpolation`: `client.interpolation_delay_ms` (gauge, ms),
    `client.interpolation_buffer_snapshots` (gauge, count).
  - `assets`: `client.layer_recompute_per_s` (gauge, count),
    `client.asset_rebuilds_total` (counter, count).
  - event key: `client.runtime_event` (event), payload-carried.
- New gateway ingest health gauges (under `service="sidereal-gateway"`, domain
  `gateway`): `client_telemetry_ingest_batches_total`,
  `client_telemetry_ingest_samples_total`, `client_telemetry_ingest_events_total`,
  `client_telemetry_ingest_rejected_total`,
  `client_telemetry_ingest_rate_limited_total`,
  `client_telemetry_ingest_bytes_total`.
- Persistence: no new core schema — client samples use
  `observability_metric_samples`/`_events`. Added a GIN index on `labels_json`
  (`observability_metric_samples_labels_gin_idx`), a `service`+time index, and a
  per-`service` retention prune lane (`MetricsPruneRequest.service`) so
  `service="sidereal-client"` rows can be pruned on a shorter TTL than server
  rows.
- Client collection is gated behind the shared `SIDEREAL_DIAGNOSTICS` db sink
  plus `SIDEREAL_CLIENT_TELEMETRY` (`=log` for Phase 0 structured-log only) and is
  off by default; when off the collection/flush systems early-return.
- Native impact: native and WASM clients emit a ~1 Hz structured telemetry rollup
  (Phase 0) and, when enabled, flush bounded batches over the existing gateway
  HTTP path; no authoritative gameplay, transport-protocol, or prediction
  ownership change. WASM impact: same model and HTTP flush path via the existing
  fetch boundary; `wasm32-unknown-unknown` (`bevy/webgpu`) and
  `x86_64-pc-windows-gnu` cross-checks remain green.

## 1. Contract

Backend diagnostics must use `engine-observability` rather than new ad hoc logging or debug environment variables.

Console and default file logs are reserved for:

- startup and configuration summaries,
- warnings and errors,
- player connection/disconnection and authentication lifecycle events,
- concise operational lifecycle events.

Spammy counters, timing data, queue pressure, packet/input diagnostics, visibility churn, prediction/interpolation diagnostics, and host/process metrics belong in database-backed observability metrics.

## 2. Configuration

`SIDEREAL_DIAGNOSTICS` is the single diagnostics verbosity variable.

Example:

```bash
SIDEREAL_DIAGNOSTICS=standard,console=info,input=debug,visibility=trace,sample.health_hz=2,sample.world_hz=5
```

Rules:

- First bare token is the default profile: `off`, `minimal`, `standard`, `debug`, or `trace`.
- Domain overrides use `domain=level`.
- Sink overrides use `console=level`, `file=level`, and `db=level`.
- Sample rates use `sample.<name>_hz=value`.
- Focus filters use `filter.<name>=value`.

Legacy diagnostic env vars are ignored for runtime behavior and should emit a startup warning when present.

## 3. Persistence

The observability schema is relational PostgreSQL, not graph persistence:

- `observability_metric_catalog`
- `observability_metric_samples`
- `observability_events`
- `observability_metric_rollups_1m`
- `observability_metric_rollups_1h`
- `observability_rollup_watermarks`
- `observability_admin_actions`

Metric producers must emit through `MetricEmitter`/`MetricsWriterHandle`. Producers must not know table names or write SQL directly.

## 4. Gateway APIs

Gateway endpoints live under `/admin/metrics/v1`.

Read endpoints:

- `GET /admin/metrics/v1/catalog`
- `GET /admin/metrics/v1/samples`
- `GET /admin/metrics/v1/events`
- `GET /admin/metrics/v1/summary`
- `GET /admin/metrics/v1/dashboard`

Export endpoint:

- `GET /admin/metrics/v1/export`

Maintenance endpoints:

- `POST /admin/metrics/v1/prune`
- `POST /admin/metrics/v1/reset-series`

Client upload endpoints:

- `POST /diagnostics/v1/client-samples`
- `POST /client/telemetry/v1/ingest` (DR-0048)

The client upload endpoints require a normal authenticated player session (NOT an
admin scope) and accept only bounded aggregate telemetry. They must not accept raw
packet captures or authoritative state writes. `POST /client/telemetry/v1/ingest`
accepts a bounded `MetricBatch`, derives identity from the session token, stamps
trusted `account_id`/`session_id` labels over the rows, enforces a per-account
rate limit plus samples/events/key-length bounds and a `metric_key` allowlist, and
writes via a dedicated client-ingest writer to `service="sidereal-client"` rows.
See DR-0048 (`docs/decisions/dr-0048_client_telemetry_ingest_contract.md`).

Authorization:

- read requires `metrics:read`;
- export requires `metrics:export`;
- prune/reset requires `metrics:prune`;
- all require admin/dev role and verified MFA in token session context.

Destructive requests must include `confirmation: "prune observability metrics"` and write an `observability_admin_actions` audit row.

## 5. Sensitive Data

Metrics must not store raw passwords, refresh tokens, access tokens, TOTP secrets, email login codes, password reset tokens, or full email bodies.

Raw emails and raw remote IP addresses should not be metric labels by default. Prefer account IDs, player entity IDs, route families, status classes, and bounded diagnostic categories.

## 6. Open Follow-Up

1. Add dashboard graphing/search UI backed by the gateway endpoints.
2. Wire native/WASM clients to upload prediction/interpolation/network aggregates.
3. Add rollup workers and retention pruning defaults.
4. Replace remaining console summary log paths with direct metrics and delete the legacy env-var names from user docs.
5. Add focused labels for high-value networking paths once the first metric corpus is reviewed.
