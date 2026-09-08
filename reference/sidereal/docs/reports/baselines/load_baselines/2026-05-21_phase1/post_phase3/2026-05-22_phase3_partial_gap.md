# Phase 3 Partial Baseline Gap — 2026-05-22

Status: Archived
Lifecycle: historical-report
Category: report
Last updated: 2026-06-04
Owners: report author
Scope: Phase 3 Partial Baseline Gap — 2026-05-22.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

Phase 3 persistence-service promotion has started but is not closed. The 2026-05-22 implementation slice adds:

- `sidereal-persistence-protocol` bincode frame types and lossless graph-record wire wrappers.
- `sidereal-persistence-service` with a centralized bounded writer queue, coalescing by graph `entity_id`, `ShardAssignment` route-table validation, and `/health`.
- Replication simulation persistence worker remote-service mode by default, with `SIDEREAL_REPLICATION_PERSISTENCE_INPROCESS=1` retained as a dev/test fallback.

The post-promotion tier-100 movement-only capture was not run for this slice because acceptance would be misleading before the remaining direct graph writes and hydrate reads are promoted or explicitly dev-gated. Open blockers before a real post-Phase-3 baseline:

1. Non-worker direct graph writes still exist in replication paths such as startup/admin, visibility sector flush, scripting/catalog, and notifications.
2. Hydration/read paths still call graph persistence directly instead of the persistence service.
3. The service-backed tier-100 run must start `sidereal-persistence-service`, set `SIDEREAL_PERSIST_WRITES=1`, keep `SIDEREAL_REPLICATION_PERSISTENCE_INPROCESS` unset, and compare `persistence_pending_latest_age_s_p95` plus `metrics_lightyear_replication_sent_payload_bytes_per_client_s` against `docs/reports/baselines/load_baselines/2026-05-21_phase1/tier_100_post_phase1/`.

No SLO acceptance is claimed by this note.

## 2026-05-23 Closure Attempt Update

Phase 3 closure work promoted the known non-worker replication graph read/write paths to the persistence-service client and added managed `sidereal-persistence-service` startup to the Phase 0 / MMO load capture wrapper. The service was started with a dynamic loopback endpoint and `SIDEREAL_REPLICATION_PERSISTENCE_INPROCESS` unset for the tier-100 attempts below.

The first post-promotion tier-100 movement-only attempt produced artifacts under `docs/reports/baselines/load_baselines/2026-05-21_phase1/tier_100_post_phase3/20260523_113036_movement_only_100c/`, but it is **not a valid movement baseline**:

- `managed_persistence=1`
- `metrics_clients_with_recent_activity=100`
- `metrics_session_count=1`
- `session_ready=107`
- `control_ack=1`
- `server_auth_bound=107`
- `metrics_input_accepted_total=0`
- `metrics_persistence_pending_latest_age_s_p95=0`
- `metrics_lightyear_replication_sent_payload_bytes_per_client_s=200.5711`
- `baseline_complete=false`

The invalid shape came from the existing same-player tier-100 load pattern: auxiliary clients connect as the same player and can become the selected control owner, so the input-producing primary client logged repeated `controlled runtime target ... has no Predicted clone yet` warnings and sent no accepted movement input. The payload and persistence numbers from this run prove the remote service path can start and serve the load harness, but they must not be used as the Phase 3 movement baseline.

A second attempt tried to avoid same-player ownership contention by setting `SIDEREAL_PHASE0_AUTO_SEED_EXTRA_CHARACTERS=1`. It did not reach the timed capture. Artifacts are under `docs/reports/baselines/load_baselines/2026-05-21_phase1/tier_100_post_phase3/20260523_113945_movement_only_100c/`; auto-seeding failed at extra character 19 with:

`starter world existing character check persistence service rejected load: persistence read failed: database error: postgres connect failed: db error`

## 2026-05-23 Closure Baseline Update

The baseline blockers above were narrowed and resolved for Phase 3 evidence:

- Extra-character auto-seeding now carries seeded account IDs directly from `seed_phase0_character`, avoiding the previous per-character account lookup bottleneck.
- The persistence-service client retries transient Postgres connect failures with bounded backoff.
- The movement-only load wrapper now defaults multi-client runs to distinct auto-seeded players and starts the input-producing primary client first, waiting for its control acknowledgement before launching passive auxiliary clients. This prevents a saturated startup burst from producing a false `metrics_input_accepted_total=0` run.

Final post-promotion artifacts:

`docs/reports/baselines/load_baselines/2026-05-21_phase1/tier_100_post_phase3/20260523_123200_movement_only_100c/`

Phase 3 acceptance metrics from that run:

- `managed_persistence=1`
- `SIDEREAL_REPLICATION_PERSISTENCE_INPROCESS` unset
- `wait_primary_control_ack_before_extras=1`
- `metrics_clients_with_recent_activity=100`
- `metrics_input_accepted_total=879`
- `control_ack=1`
- `metrics_persistence_pending_latest_age_s_p95=0`
- `metrics_lightyear_replication_sent_payload_bytes_per_client_s=1282.9846`
- `metrics_lightyear_replication_bandwidth_limited_messages_total=0`
- `metrics_host_cpu_global_usage_percent_p95=100`

Comparison against `docs/reports/baselines/load_baselines/2026-05-21_phase1/tier_100_post_phase1/`:

- Persistence backlog p95 stayed flat at `0s` and remains below the Phase 3 `<= 5s` acceptance threshold.
- Payload improved from `2313.8715` to `1282.9846` bytes/client/s, so it did not regress against the allowed `<= 2429.565075` bytes/client/s threshold.

The generic load wrapper still reports `baseline_complete=false` on this headless host because the known CPU saturation prevents the full session/tick gate from passing (`metrics_session_count=73`, `metrics_shard_connected_clients=73`, `metrics_shard_degraded_p95=1`, `metrics_fixed_tick_last_wall_ms_p95=32.946952`). This is the same host-limited shape as the committed Phase 1 tier-100 baseline (`baseline_complete=false`, `metrics_clients_with_recent_activity=100`, `metrics_session_count=83`, `metrics_host_cpu_global_usage_percent_p95=100`). It is not claimed as a clean tier-100 SLO pass; it is accepted only for the Phase 3 promotion criteria: service-backed persistence backlog and replication payload bytes on the same saturated host.
