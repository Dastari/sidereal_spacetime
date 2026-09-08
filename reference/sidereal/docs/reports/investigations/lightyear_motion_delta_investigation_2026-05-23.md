# Lightyear Motion Delta Retention Diagnostic - 2026-05-23

Status: Archived
Lifecycle: historical-report
Category: report
Last updated: 2026-06-04
Owners: report author
Scope: Lightyear Motion Delta Retention Diagnostic - 2026-05-23.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

## Working hypothesis vs. evidence

The original brief proposed:

> Lightyear's send-side keeps a bounded per-tick value history. With keyframe interval 60 and a much smaller history retention window, ack-old ticks routinely fall outside the window. This effectively disables delta compression for motion components.

**The hypothesis is wrong.** The fork at the pinned revision `0192db9c9235f807f170c0f7400dd55099a41447` does not bound the per-tick history by a fixed window. `DeltaManager::store` (`lightyear_replication/src/delta.rs`) inserts an entry per send tick with a `num_acks` counter. `DeltaManager::receive_ack` decrements the counter on the acked tick and, when it hits zero, purges every tick strictly older than the acked tick (`group_data.data = group_data.data.split_off(&tick)`, which keeps `>= tick`). There is no time-bounded eviction. Per-tick storage is bounded only by ack delivery.

Lowering `SIDEREAL_REPLICATION_MOTION_KEYFRAME_EVERY_N_TICKS` does not eliminate the warn, because the keyframe path only forces `DeltaType::FromBase` once per N ticks. Between keyframes, the sender still reads `delta_ack_ticks` and still hits the regression.

## Actual root cause

Out-of-order acks regress `delta_ack_ticks` to an older tick whose base has already been purged.

`lightyear_replication/src/send/sender.rs::ReplicationSender::handle_acks` does:

```rust
for (entity, component_kind) in delta {
    channel
        .delta_ack_ticks
        .insert((entity, component_kind), tick);
    delta_manager
        .as_ref()
        .unwrap()
        .receive_ack(entity, tick, component_kind, component_registry);
}
```

The `insert` is unconditional. When the ack for `T2` arrives before the ack for `T1` (`T1 < T2`):

1. `delta_ack_ticks[(E, K)] = T2`; `receive_ack(T2)` purges every retained base older than `T2`.
2. `delta_ack_ticks[(E, K)] = T1` (regression); `receive_ack(T1)` is a no-op (`T1` is gone).
3. Next outgoing update at `T3` looks up `delta_ack_ticks[(E, K)] = T1`, calls `delta_manager.get(E, T1, K)`, hits `None`, emits the warn, and falls back to a base-value diff.

This pattern is most common at connect time, where ActionsChannel (reliable) inserts interleave with UpdatesChannel (unreliable-with-acks) entity updates and the ack arrival order legitimately diverges from the send order.

## Measurements (2026-05-23, single connected headless client, loopback, debug build)

Capture harness: `scripts/run_mmo_synthetic_load_tier.sh`-equivalent single-client invocation against an in-process persistence service. Replication-side env: `SIDEREAL_REPLICATION_PERSISTENCE_INPROCESS=1`, `RUST_LOG=info`. Client-side env: `SIDEREAL_CLIENT_HEADLESS=1` with the indicated input script. Bandwidth read from the `/health` endpoint's `lightyear_replication_sent_payload_bytes_total` gauge across the capture window.

| Configuration | Input | Duration | Total fallback WARNs | WARN/s avg | Distribution | Bytes/client/s |
| --- | --- | --- | --- | --- | --- | --- |
| keyframe=60 (default) | idle | 30s | 24 | 0.77 | single 1s burst at connect | n/a (no longer-running observability flush) |
| keyframe=60 (default) | `forward_afterburner:60.0` | 30s | 16 | 0.53 | single 1s burst at connect | 13262.43 |
| keyframe=60 (default) | `forward_afterburner:120.0` | 60s | 0 | 0.00 | n/a | 15062.30 |
| keyframe=8 | idle | 30s | 72 | 2.40 | single 1s burst at connect | n/a |
| keyframe=8 | `forward_afterburner:60.0` | 30s | 8 | 0.27 | single 1s burst at connect | 13951.10 |
| keyframe=2 | idle | 30s | 32 | 1.07 | single 1s burst at connect | n/a |

Observations:

1. In single-client steady state, the warn is silent. 60s of `forward_afterburner` motion produced zero fallback warns.
2. All single-client warns occur in a one-second burst during the initial spawn-flood window. The cause matches the ack-regression analysis above.
3. Lowering the keyframe interval did not reduce the steady-state warn rate (it is already zero) and increased steady-state bandwidth (keyframe=8 used ~5% more wire than keyframe=60 with movement). The keyframe knob is not the right lever for this problem.
4. The prompt's measurement of "~430 WARN/s for one connected client" over a 57s window is not reproducible with a single connected client on this host. The historic 100-client log `docs/reports/baselines/load_baselines/2026-05-21_phase1/tier_100_post_phase3/20260523_113036_movement_only_100c/phase0_headless_replication_20260523_013037.log` peaks at 416 warns in a single second across all 100 clients (≈4 warns/client/s during staggered connect bursts), and median per-second buckets are 8–16 warns. The pattern is consistent with per-client connect bursts compounded by stagger, not a steady-state leak.

## Changes landed

1. `docs/prompts/handoffs/open/lightyear_delta_ack_tick_regression_handoff_2026-05-23.md` — precise fork-side change request for `Dastari/lightyear`. The fix is monotonicity-preserving `delta_ack_ticks` updates in `ReplicationSender::handle_acks` (compare-and-swap on `Tick::is_newer_than`). Documented including required tests and tick-wrap edge case.
2. `bins/sidereal-replication/tests/transport_lightyear_e2e.rs::single_client_delta_base_fallback_warns_stay_below_threshold` — regression guard. Connects one headless client with `forward_afterburner` input, lets the initial connect burst drain for 3s, asserts the connect-burst warning count stays near zero, then measures fallback warns over the next 10s and asserts steady-state warns/s < 10. The steady-state threshold is intentionally above the observed 0 to absorb host noise and any future incremental load.
3. No change to `SIDEREAL_REPLICATION_MOTION_KEYFRAME_EVERY_N_TICKS` (still 60). Empirically the keyframe knob does not fix the regression; changing the default would cost bandwidth for no warn reduction.

## What was deliberately NOT changed

1. The fallback path itself (`registry.serialize_diff_from_base_value` in `lightyear_replication/src/send/sender.rs:606`). It is lossless and is the correct safety net when a base is missing; the bug is upstream of it.
2. The warn message text and level. Per the brief, the goal is the underlying path actually working, not silencing the warn.
3. The Phase 4 single-process handoff harness work in progress under `crates/sidereal-core/src/handoff.rs` and `crates/sidereal-core/tests/handoff.rs`. Coordinated lane separation as required.
4. The persistence service crates. Not on the critical path for this diagnostic.

## Follow-up

2026-05-23 update: the fork-side change from `lightyear_delta_ack_tick_regression_handoff_2026-05-23.md` landed in `Dastari/lightyear` commit `019048ca638cd3c2727054d6f3342a34f460753e`, and Sidereal now pins that revision.

Post-bump validation:

1. `CARGO_INCREMENTAL=0 cargo test -p sidereal-replication --test transport_lightyear_e2e single_client_delta_base_fallback_warns_stay_below_threshold -- --nocapture` passed and printed `delta-base fallback guard: connect_burst_warns=0 steady_state_warns=0 window_secs=10 warns_after=0`.
2. One-client load-wrapper smoke passed with zero fallback warnings: `SIDEREAL_MMO_LOAD_CLIENTS=1 SIDEREAL_MMO_LOAD_DURATION_S=30 SIDEREAL_MMO_LOAD_GATE_MODE=smoke SIDEREAL_MMO_LOAD_OUT_DIR=data/debug/mmo_synthetic_load_lightyear_ack_bump scripts/run_mmo_synthetic_load_tier.sh`; replication log `data/debug/mmo_synthetic_load_lightyear_ack_bump/20260523_180032_movement_only_1c/phase0_headless_replication_20260523_080032.log`; summary values `session_ready=1`, `metrics_clients_with_recent_activity=1`, `metrics_input_accepted_total=2676`, `metrics_input_drop_total=0`.
3. Ten-client load-wrapper smoke passed its smoke gate but still emitted `3012` fallback warnings: `SIDEREAL_MMO_LOAD_CLIENTS=10 SIDEREAL_MMO_LOAD_DURATION_S=30 SIDEREAL_MMO_LOAD_GATE_MODE=smoke SIDEREAL_MMO_LOAD_OUT_DIR=data/debug/mmo_synthetic_load_lightyear_ack_bump scripts/run_mmo_synthetic_load_tier.sh`; replication log `data/debug/mmo_synthetic_load_lightyear_ack_bump/20260523_175616_movement_only_10c/phase0_headless_replication_20260523_075616.log`; summary values `session_ready=10`, `metrics_clients_with_recent_activity=10`, `metrics_input_accepted_total=2615`, `metrics_input_drop_total=0`, `metrics_lightyear_replication_bandwidth_limited_messages_total=0`.
4. Ten-client warning buckets: per-second `07:58:36=3004`, `07:59:11=8`; per-ack-tick `55=8`, `61=704`, `62=1416`, `65=236`, `75=280`, `88=360`, `1638=8`; `unique_entities=70`.

Conclusion: the `019048ca` fork revision fixes the direct single-client stale-ack regression but does not fully fix Sidereal's multi-client connect/fanout warning burst. A follow-up Lightyear-fork prompt is filed at `docs/prompts/handoffs/open/lightyear_delta_base_multi_client_connect_burst_handoff_2026-05-23.md`.

Original follow-up criteria remain:

1. The connect-time burst drops to ~0 warns (the only remaining source would be genuine base-value first sends, which do not log this warn).
2. The 100-client baseline `metrics_lightyear_replication_sent_payload_bytes_per_client_s` improves modestly (the connect-burst fallbacks currently bloat the per-tick payload for affected entities; the chain is recovered on the very next ack, so the impact in steady-state aggregate bandwidth is small but non-zero).
