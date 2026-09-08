# Phase 1.3 Chaos Report - 2026-05-22

Status: Archived
Lifecycle: historical-report
Category: report
Last updated: 2026-06-04
Owners: report author
Scope: Phase 1.3 Chaos Report - 2026-05-22.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

Primary references:
- `docs/decisions/dr-0040_distribution_and_persistence_authority_model.md`
- `docs/plans/completed/distribution_scaling_and_single_shard_hardening_plan_2026-05-21.md`
- `docs/reports/baselines/phase1_uplink_conditioned_baseline_2026-05-22.md`
- `docs/reports/baselines/load_baselines/2026-05-21_phase1/diagnostic/20260522_003304_transport_lightyear_e2e_10run.md`
- `docs/reports/baselines/load_baselines/2026-05-21_phase1/diagnostic/20260522_145233_visibility_chaos_caps.md`
- `docs/prompts/handoffs/open/lightyear_link_conditioner_server_outbound_handoff_2026-05-22.md`

## 0. Status Notes

2026-05-22 status note:

1. The default-off replication link-conditioner diagnostic exists and is observable through health/summary metrics.
2. The captured diagnostic evidence is uplink-only because Sidereal currently installs Lightyear's receive-path conditioner on replication-server link entities.
3. The Phase 1.3 packet-loss CI acceptance criteria are now met for the current headless server receive-path scope: the explicit packet-loss integration tests have landed in `bins/sidereal-replication/tests/transport_lightyear_e2e.rs`, the full serial transport e2e suite passed once, and a 10-run serial flake audit passed 10/10.
4. The Phase 1.2 observer-candidate hard-cap drop/accounting path now has tier-100 uplink-chaos evidence: caps-off reported zero hard-capped clients/totals, while caps-on with budgets `25` entities and `4` cells reported `80` capped clients and totals of `103850` entity candidates plus `21101` cell candidates capped.
5. Both hard-cap captures reported `baseline_complete=false` and `mmo_load_host_cpu_global_usage_percent_p95=100`, so they are accounting evidence only, not SLO or throughput acceptance.
6. Server-outbound/downlink conditioning remains a Lightyear fork follow-up and is not part of this Sidereal-side Phase 1.3 acceptance.
7. Native/WASM impact: diagnostics/reporting only. No gameplay, protocol, persistence, or client transport behavior changes are declared complete by this report.

## 1. Evidence Available

Available report:

- `docs/reports/baselines/phase1_uplink_conditioned_baseline_2026-05-22.md`

Available baseline artifacts:

- Clean tier-100 run: `docs/reports/baselines/load_baselines/2026-05-21_phase1/clean/20260522_075724_movement_only_100c/`
- Uplink-conditioned tier-100 run: `docs/reports/baselines/load_baselines/2026-05-21_phase1/uplink_lossy/20260522_080701_movement_only_100c/`
- Rolling-join churn diagnostic: `docs/reports/baselines/load_baselines/2026-05-21_phase1/rolling_join_chaos/20260521_230213_rolling_join_headless.md`
- 10-run transport e2e flake audit: `docs/reports/baselines/load_baselines/2026-05-21_phase1/diagnostic/20260522_003304_transport_lightyear_e2e_10run.md`
- Visibility hard-cap chaos capture: `docs/reports/baselines/load_baselines/2026-05-21_phase1/diagnostic/20260522_145233_visibility_chaos_caps.md`

Key finding: the receive-path conditioner activates and records configured loss/latency/jitter, and the observer-candidate hard-cap counters now move under tier-100 uplink chaos. The evidence is useful for verifying diagnostic wiring, uplink behavior, and cap-drop accounting; it is not sufficient to validate downlink rubber-banding or tier performance SLOs.

## 2. Acceptance Status

| Phase 1.3 acceptance item | Status | Notes |
|---|---|---|
| `two_clients_visibility_under_packet_loss` in `cargo test -p sidereal-replication` | Landed; one-run pass | Added to `transport_lightyear_e2e.rs` with 5% loss + 50 ms jitter using the replication receive-path conditioner. Validation: `CARGO_INCREMENTAL=0 cargo test -p sidereal-replication --test transport_lightyear_e2e --no-run` passed; filtered DB-backed headless run `two_clients_visibility_under_packet_loss` passed once on 2026-05-22. |
| `controlled_motion_under_packet_loss` in `cargo test -p sidereal-replication` | Landed; one-run pass | Added to `transport_lightyear_e2e.rs`; enables headless Phase 0 capture and asserts post-authority gap p95 plus confirmed sidecar age thresholds from client logs. Validation: `CARGO_INCREMENTAL=0 cargo test -p sidereal-replication --test transport_lightyear_e2e --no-run` passed; filtered DB-backed headless run `controlled_motion_under_packet_loss` passed once on 2026-05-22. |
| Existing two-headless diagnostic augmented with a 1% loss smoke path | Landed; one-run pass | Added `two_headless_clients_receive_remote_motion_diagnostics_with_one_percent_uplink_loss` as a server receive-path smoke gate. Filtered DB-backed headless run passed once on 2026-05-22. |
| Full `transport_lightyear_e2e` serial run | Passed once | `CARGO_INCREMENTAL=0 cargo test -p sidereal-replication --test transport_lightyear_e2e -- --test-threads=1 --nocapture` passed 6/6 on 2026-05-22 in 56.75 s test time. The file now shares the shell-out binary build through `OnceLock`, so the internal `cargo build -p sidereal-replication -p sidereal-client` cost is paid once per test process. |
| 10 consecutive deterministic runs without flake | Passed | `docs/reports/baselines/load_baselines/2026-05-21_phase1/diagnostic/20260522_003304_transport_lightyear_e2e_10run.md` records 10/10 passing serial runs. Raw log: `data/debug/phase1_chaos_flake_audit/20260522_003304_transport_lightyear_e2e_10run.log`. |
| Test-suite runtime regression <= 30 seconds | Accepted with caveat | Warm full-suite test time settled around 21-23 s after the first cold run. No pre-change serial runtime measurement exists in this report for a strict delta, but the shared `OnceLock` binary-build helper keeps the new packet-loss cases from adding repeated shell-out build cost within one test process. |
| Observer-candidate hard-cap accounting under tier-100 chaos | Captured with caveat | `docs/reports/baselines/load_baselines/2026-05-21_phase1/diagnostic/20260522_145233_visibility_chaos_caps.md` compares caps-off vs caps-on. Caps-on used `SIDEREAL_VISIBILITY_OBSERVER_CANDIDATE_ENTITY_HARD_BUDGET=25` and `SIDEREAL_VISIBILITY_OBSERVER_CANDIDATE_CELL_HARD_BUDGET=4`; capped-client and capped-total metrics advanced. Both runs CPU-saturated and had `baseline_complete=false`, so this validates accounting, not SLO throughput. |

## 3. Remaining Work

1. Keep the current link-conditioner hook as-is for Phase 1 evidence; do not expand it in Sidereal unless it cannot emit required metrics.
2. If CI wall-clock budget regresses, compare against a pre-change serial runtime or move the packet-loss cases behind a dedicated CI job.
3. Let the Lightyear fork own server-outbound/downlink conditioning when that evidence becomes necessary.
4. Keep rearm-rate validation categorized as inconclusive until a controlled same-conditions before/after workload is captured.
