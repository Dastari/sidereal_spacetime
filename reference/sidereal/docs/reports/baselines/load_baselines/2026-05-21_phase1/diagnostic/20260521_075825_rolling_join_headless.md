# Phase 1.2 Rolling-Join Headless Diagnostic — 20260521_075825

Status: Archived
Lifecycle: historical-report
Category: report
Last updated: 2026-06-04
Owners: report author
Scope: Phase 1.2 Rolling-Join Headless Diagnostic — 20260521_075825.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

## Run

- Git HEAD: `2c71348fae101eed775a7ae675b663f1256c810b`
- Worktree dirty during capture: `true`
- Raw artifact directory: `data/debug/phase1_rolling_join/20260521_075825_rolling_join`
- Source summary: `data/debug/phase1_rolling_join/20260521_075825_rolling_join/phase0_headless_summary_20260521_075827.txt`
- Baseline complete: `true`
- Extra client cycle: `1`
- Extra client logs: `data/debug/phase1_rolling_join/20260521_075825_rolling_join/phase0_headless_client_extra_1_20260521_075827.log`

## Metrics

| Metric | Value |
|---|---:|
| `session_ready` | `11` |
| `server_auth_bound` | `11` |
| `metrics_clients_with_recent_activity` | `11` |
| `metrics_fixed_tick_max_wall_ms` | `6.803143` |
| `metrics_fixed_tick_last_wall_ms_p95` | `0.5183985` |
| `metrics_visibility_role_rearm_queued_roots_total` | `48` |
| `metrics_visibility_role_rearm_rearmed_entities_total` | `117` |
| `metrics_visibility_role_rearm_queued_loss_passes_total` | `117` |
| `metrics_reconcile_control_replication_roles_max_wall_ms` | `3.710126` |
| `metrics_reconcile_control_replication_roles_skipped_total` | `951186` |
| `metrics_visibility_visible_gains` | `1` |
| `metrics_visibility_visible_losses` | `1` |
| `metrics_lightyear_replication_sent_payload_bytes_total` | `11753125` |
| `metrics_lightyear_replication_bandwidth_limited_messages_total` | `0` |

## Local GPU Follow-Up

For local GUI sessions after this headless churn pass, look first at `metrics_reconcile_control_replication_roles_skipped_total` and `metrics_reconcile_control_replication_roles_max_wall_ms`, then `metrics_visibility_role_rearm_queued_loss_passes_total`. Only continue into longer visual feel-testing if the skip count climbs during steady periods and role rearm totals match actual join/leave churn.
