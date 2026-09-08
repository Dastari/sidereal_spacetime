# Lightyear Delta Ack-Tick Regression Handoff - 2026-05-23

Status: Active
Lifecycle: handoff-open
Category: prompt
Last updated: 2026-06-04
Owners: documentation
Scope: Lightyear Delta Ack-Tick Regression Handoff - 2026-05-23.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

## Goal

Patch the `Dastari/lightyear` fork so the per-(entity, component) acknowledged-tick used by the delta sender never regresses to an older tick when an out-of-order ack arrives. Today an older ack arriving after a newer ack rewinds the bookkeeping to a tick whose base value has already been purged from `DeltaManager`, which forces the sender into the base-value fallback path the next time that component changes.

## Background

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

The `insert` unconditionally overwrites the prior value. `DeltaManager::receive_ack` then purges every tick strictly older than the acked tick once `num_acks` for that tick reaches zero (`lightyear_replication/src/delta.rs::receive_ack`). Concretely:

1. Server sends entity `E` updates at ticks `T1 < T2`.
2. The ack for `T2` arrives first. `delta_ack_ticks[(E, K)] = T2`, `receive_ack(T2)` purges every retained base older than `T2`.
3. The ack for `T1` arrives second. `delta_ack_ticks[(E, K)] = T1` (regression). `receive_ack(T1)` is a no-op because `T1` was just purged.
4. Next outgoing update at `T3` calls `prepare_delta_component_update`, looks up `delta_ack_ticks[(E, K)] = T1`, and calls `delta_manager.get(E, T1, K)`. The base is gone, so the sender logs `Delta base from tick Tick(T1) was not retained; falling back to base-value diff` and emits a from-base diff instead.

This is purely a bookkeeping bug. The fallback is lossless, but the delta-compression win is lost for that tick. Under realistic mixed reliable + unreliable channel scheduling (entity-spawn ActionsChannel = reliable, entity-update UpdatesChannel = unreliable-with-acks) the message-ack arrival order routinely diverges from send order at connect time and during burst traffic, so the regression triggers in bursts.

## Required Behavior

1. `delta_ack_ticks` must be monotonically non-decreasing per `(entity, ComponentKind)`. An ack carrying a tick `T' <= existing` must be ignored for the purpose of updating `delta_ack_ticks`.
2. `DeltaManager::receive_ack` must still be called for the actual acked tick so its outstanding-ack accounting (`num_acks`) decrements correctly and the per-tick storage can be released when all clients have acknowledged it.
3. Behavior when no prior ack exists (first ack for the pair) must be unchanged: store the incoming tick.
4. Tick-wraparound math must use `Tick`'s wrapping-aware comparison (the existing `Tick - Tick` and `Tick` ordering helpers), not raw `u16` comparison, so the new monotonicity check is correct across the `u16` wrap.
5. No changes to the on-wire format. The fix is entirely in the sender's local bookkeeping.

## Suggested Implementation Notes

1. In `ReplicationSender::handle_acks`, replace the unconditional `insert` with a wrapping-aware compare-and-swap. Pseudocode (using the same idiom as Lightyear's existing tick comparisons):

   ```rust
   let entry = channel.delta_ack_ticks.entry((entity, component_kind));
   match entry {
       Entry::Occupied(mut occupied) => {
           if tick.is_newer_than(*occupied.get()) {
               *occupied.get_mut() = tick;
           }
       }
       Entry::Vacant(vacant) => {
           vacant.insert(tick);
       }
   }
   delta_manager
       .as_ref()
       .unwrap()
       .receive_ack(entity, tick, component_kind, component_registry);
   ```

   Use whichever wrapping comparison helper the fork already exposes (`Tick::is_newer_than`, `tick.cmp_wrapping`, etc.). Do not rely on `tick > existing` because `Tick` wraps at `u16::MAX`.
2. Keep the `receive_ack` call outside the monotonicity check so per-tick `num_acks` always decrements; otherwise an out-of-order older ack leaks an outstanding-ack count and the per-tick base value is retained forever.
3. The send path (`ReplicationSender::prepare_delta_component_update`) is unchanged. It already uses whatever `delta_ack_ticks` holds.

## Required Tests

1. Unit test exercising `handle_acks` directly with two interleaved acks for the same `(entity, kind)`: acks `[T2, T1]` arriving in that order must leave `delta_ack_ticks` at `T2`, must call `receive_ack` once for each tick, and must not panic.
2. Unit test for the tick-wrap edge case: acks `[u16::MAX - 5, u16::MAX + 10 (= 9 after wrap)]` arriving in that order must end with `delta_ack_ticks` at the wrapped-newer tick.
3. Integration test (extend the existing `lightyear_replication/src/send/sender.rs` tests) that drives a sender at ticks `T1..T10`, replays the resulting message-id acks in reverse order, and asserts the next outgoing delta uses `DeltaType::Normal` (not the fallback warn path) when the latest acked tick is still in `DeltaManager`.
4. Regression for the existing happy-path ack order so the change does not alter behavior when acks arrive in send order.

## Sidereal Validation Context

Sidereal currently depends on:

```toml
lightyear = { git = "https://github.com/Dastari/lightyear", rev = "0192db9c9235f807f170c0f7400dd55099a41447", default-features = false, features = ["udp", "raw_connection", "input_native", "replication", "prediction", "interpolation", "frame_interpolation", "avian2d", "webtransport", "webtransport_self_signed"] }
```

Sidereal-side measurements collected on 2026-05-23 with the existing pin and a single connected headless client (`scripts/run_mmo_synthetic_load_tier.sh` single-client variant; `RUST_LOG=info`; default `SIDEREAL_REPLICATION_MOTION_KEYFRAME_EVERY_N_TICKS=60`):

| Configuration | Duration | Total `was not retained` WARNs | WARN/s | Replication payload bytes/client/s |
| --- | --- | --- | --- | --- |
| keyframe=60 (default), idle | 30s | 24 (single burst at connect, tick 25) | 0.77 | n/a |
| keyframe=60 (default), forward_afterburner | 30s | 16 (single burst at connect) | 0.53 | 13262.43 |
| keyframe=60 (default), forward_afterburner | 60s | 0 | 0.00 | 15062.30 |
| keyframe=8, idle | 30s | 72 (single burst at connect) | 2.40 | n/a |
| keyframe=8, forward_afterburner | 30s | 8 (single burst at connect) | 0.27 | 13951.10 |
| keyframe=2, idle | 30s | 32 (single burst at connect) | 1.07 | n/a |

Observations:

1. In single-client steady state the warn is silent (0 WARN/s over 60s). All single-client warns occur in a one-second burst during the initial spawn-flood window, before the ack/send schedule reaches steady state. This is the moment when ActionsChannel inserts (reliable) interleave with UpdatesChannel updates (unreliable-with-acks) and the ack arrival order diverges from the send order — exactly the regression case described above.
2. Lowering the Sidereal-side keyframe interval is not a workaround. keyframe=8 used more bandwidth (13951 vs 13262 bytes/client/s) for an equivalent or worse warn count; keyframe=2 cut warns slightly but bandwidth would grow further. The keyframe path only forces `DeltaType::FromBase` once per N ticks; between keyframes the sender still reads `delta_ack_ticks` and still hits the regression.
3. In multi-client captures (100-client movement-only baseline `docs/reports/baselines/load_baselines/2026-05-21_phase1/tier_100_post_phase3/20260523_113036_movement_only_100c/phase0_headless_replication_20260523_013037.log`) the warn appears in bursts during staggered connects: peak 416 warns in one second across 100 clients, median single-second bucket at 8–16 warns. The pattern is consistent with per-client connect bursts compounded by stagger, not a steady-state leak.

The bandwidth impact of the fallback is bounded because the fallback path serializes a `Diffable::diff_from_base` payload, which for `Position`, `Rotation`, `LinearVelocity`, `AngularVelocity` is the same size as a normal delta on the first changed tick. The real cost is that we lose the delta chain across the boundary — every subsequent ack of an even-older tick re-arms the regression, which means a steady-state pathological client could oscillate in and out of fallback indefinitely. Fixing the monotonicity check eliminates the oscillation.

## Out of Scope

1. Do not change the wire format or message serialization.
2. Do not change `DeltaManager` retention policy. The per-tick storage is already correctly bounded by `num_acks` reaching zero; the only bug is the sender clobbering `delta_ack_ticks` with an older value.
3. Do not change `should_send_keyframe` or `add_delta_compression_with_keyframe_interval`. Those were added in `lightyear_delta_keyframe_send_frequency_handoff_2026-05-21.md` and are working as intended.
