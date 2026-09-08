# Phase 1.1 Two-Headless Diagnostic — loss5_jitter50ms — 20260521_074130

Status: Archived
Lifecycle: historical-report
Category: report
Last updated: 2026-06-04
Owners: report author
Scope: Phase 1.1 Two-Headless Diagnostic — loss5_jitter50ms — 20260521_074130.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

## Run

- Git HEAD: `2c71348fae101eed775a7ae675b663f1256c810b`
- Worktree dirty during capture: `true`
- Raw artifact directory: `data/debug/phase1_headless_diagnostic/20260521_074130_loss5_jitter50ms`
- Source summary: `data/debug/phase1_headless_diagnostic/20260521_074130_loss5_jitter50ms/phase0_headless_summary_20260521_074626.txt`
- Capture duration seconds: `n/a`
- Cargo profile: `release`
- Baseline complete: `true`
- Extra headless clients: `1`

## Metrics

| Metric | Value |
|---|---:|
| `phase0_post_authority_gap_p95_observed` | `5` |
| `phase0_post_authority_gap_max_observed` | `7` |
| `phase0_post_authority_gap_samples_observed` | `165853` |
| `phase0_sidecar_to_history_delta_last_observed` | `n/a` |
| `phase0_prediction_to_sidecar_gap_last_observed` | `2` |
| `phase0_local_to_prediction_delta_last_observed` | `0` |
| `phase0_confirmed_history_tick_age_ms_last_observed` | `n/a` |
| `phase0_confirmed_sidecar_tick_age_ms_last_observed` | `2.9187500000062983` |
| `phase0_prediction_history_tick_age_ms_last_observed` | `15.649482000000603` |
| `phase0_stall_frame_update_delta_ms_last_observed` | `0.0` |
| `phase0_stall_frame_update_delta_ms_max_observed` | `0` |
| `phase0_stall_frame_sidecar_gap_last_observed` | `n/a` |
| `phase0_stall_frame_sidecar_gap_max_observed` | `n/a` |
| `phase0_stall_frame_post_authority_gap_last_observed` | `n/a` |
| `phase0_stall_frame_post_authority_gap_max_observed` | `n/a` |
| `phase0_stall_frame_gap_samples_observed` | `0` |
| `metrics_lightyear_replication_sent_payload_bytes_total` | `2969106` |
| `metrics_lightyear_replication_sent_payload_bytes_per_client_s` | `24742.5500` |
| `metrics_lightyear_replication_bandwidth_limited_messages_total` | `0` |
| `metrics_fixed_tick_max_wall_ms` | `4.016891` |
| `metrics_fixed_tick_last_wall_ms_p95` | `0.502012` |

## Local GPU Follow-Up

When running the queued GUI/native/WASM sessions locally, inspect `phase0_post_authority_gap_p95_observed`, then the Stage Age fields (`phase0_confirmed_sidecar_tick_age_ms_last_observed` first), then `phase0_stall_frame_*_max_observed`. Stop early if the p95/max gaps stay flat and Stage Age is not accumulating.
