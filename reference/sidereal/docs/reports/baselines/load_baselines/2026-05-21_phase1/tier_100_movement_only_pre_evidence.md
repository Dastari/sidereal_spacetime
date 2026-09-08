# Phase 1 Pre-Evidence Tier-100 Baseline - Movement Only - 20260521_174822

Status: Archived
Lifecycle: historical-report
Category: report
Last updated: 2026-06-04
Owners: report author
Scope: Phase 1 Pre-Evidence Tier-100 Baseline - Movement Only - 20260521_174822.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

## Run

- Git HEAD: `2c71348fae101eed775a7ae675b663f1256c810b`
- Worktree dirty during capture: `true`
- Raw artifact directory: `data/debug/mmo_synthetic_load_phase1_pre_evidence/20260521_174822_movement_only_100c`
- Source summary: `data/debug/mmo_synthetic_load_phase1_pre_evidence/20260521_174822_movement_only_100c/phase0_headless_summary_20260521_075042.txt`
- Gate summary: `data/debug/mmo_synthetic_load_phase1_pre_evidence/20260521_174822_movement_only_100c/mmo_load_gate_20260521_174822.txt`
- Workload: `movement_only`
- Client count target: `100`
- Duration seconds: `300`
- Cargo profile: `release`
- Auto-seeded extra characters: `true`
- Diagnostics: `standard,input=debug,sample.health_hz=1,sample.world_hz=1`

## Gate Result

The run is intentionally retained as a failed pre-evidence baseline. It establishes that the current single-process replication server on this host cannot satisfy the tier-100 SLO gate before the next compare-against optimization pass.

Failed gate items:

1. `baseline_complete=false`
2. `metrics_input_oldest_age_ms_p95=3355.569325000005` exceeded the `50 ms` SLO.
3. `metrics_fixed_ticks_last_update_p95=15` exceeded the `2` fixed-ticks/update SLO.
4. `metrics_fixed_tick_last_wall_ms_p95=28.522528299999944` exceeded the `8 ms` SLO.
5. `metrics_shard_degraded_p95=1` showed sustained degraded health.

## Metrics

| Metric | Value |
|---|---:|
| `required_session_ready` | `100` |
| `metrics_session_count` | `83` |
| `metrics_clients_with_recent_activity` | `100` |
| `metrics_shard_connected_clients` | `83` |
| `metrics_fixed_tick_max_wall_ms` | `292.194485` |
| `metrics_input_receive_to_drain_last_ms_p95` | `0` |
| `metrics_lightyear_replication_sent_payload_bytes_per_client_s` | `2425.3961` |
| `metrics_lightyear_replication_sent_payload_bytes_total` | `72761884` |
| `metrics_lightyear_replication_bandwidth_limited_messages_total` | `0` |
| `metrics_lightyear_replication_actions_queue_depth_max` | `1637` |
| `metrics_lightyear_replication_updates_queue_depth_max` | `255` |
| `metrics_persistence_pending_latest_age_s_p95` | `0` |
| `metrics_visibility_cell_dirty_worklist_entities_max` | `1574` |
| `metrics_tactical_contact_candidate_evaluations_max` | `117876` |
| `metrics_process_cpu_usage_percent_p95` | `66.36826934814452` |
| `metrics_host_cpu_global_usage_percent_p95` | `100` |

## Notes

- `metrics_lightyear_replication_bandwidth_limited_messages_total=0`, so this failed because the single process could not keep up with fixed-tick/input health under the 100-client workload, not because Lightyear reported bandwidth limiting.
- `metrics_persistence_pending_latest_age_s_p95=0`, so persistence backlog was not the limiting factor in this run.
- Phase 0 overlay-derived `phase0_post_authority_gap_*` and `phase0_stall_frame_*` fields were unavailable for this load run because the capture did not emit the Phase0A client status lines under the 100-client headless profile.

## Local GPU Follow-Up

When running the queued local GUI/native/WASM sessions after this baseline, inspect `fixed_tick_wall_ms_max`, `metrics_input_oldest_age_ms_p95`, and `metrics_lightyear_replication_actions_queue_depth_max` first. Those fields identify whether local perceptual rubber-banding is server tick pressure, input backlog, or replication queue pressure.
