# Lightyear Delta-Base Multi-Client Connect Burst Follow-Up - 2026-05-23

Status: Active
Lifecycle: handoff-open
Category: prompt
Last updated: 2026-06-04
Owners: documentation
Scope: Lightyear Delta-Base Multi-Client Connect Burst Follow-Up - 2026-05-23.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

## Context

Sidereal bumped `Dastari/lightyear` branch `sidereal/merge-local-third-party-patches` to commit `019048ca638cd3c2727054d6f3342a34f460753e`, which includes the monotonic `delta_ack_ticks` fix for out-of-order acks in `lightyear_replication::send::sender`.

The bump fixes the single-client repro but does not fully eliminate the `Delta base from tick Tick(N) was not retained; falling back to base-value diff` connect burst under multi-client fanout.

## Sidereal Evidence

Validation commands run from `/root/sidereal` after the bump:

```bash
CARGO_INCREMENTAL=0 cargo test -p sidereal-replication --test transport_lightyear_e2e single_client_delta_base_fallback_warns_stay_below_threshold -- --nocapture
SIDEREAL_MMO_LOAD_CLIENTS=1 SIDEREAL_MMO_LOAD_DURATION_S=30 SIDEREAL_MMO_LOAD_GATE_MODE=smoke SIDEREAL_MMO_LOAD_OUT_DIR=data/debug/mmo_synthetic_load_lightyear_ack_bump scripts/run_mmo_synthetic_load_tier.sh
SIDEREAL_MMO_LOAD_CLIENTS=10 SIDEREAL_MMO_LOAD_DURATION_S=30 SIDEREAL_MMO_LOAD_GATE_MODE=smoke SIDEREAL_MMO_LOAD_OUT_DIR=data/debug/mmo_synthetic_load_lightyear_ack_bump scripts/run_mmo_synthetic_load_tier.sh
```

Results:

1. Targeted e2e guard passed and printed `connect_burst_warns=0 steady_state_warns=0 window_secs=10 warns_after=0`.
2. One-client load-wrapper smoke passed with `session_ready=1`, `metrics_clients_with_recent_activity=1`, `metrics_input_accepted_total=2676`, and `0` fallback warnings in `data/debug/mmo_synthetic_load_lightyear_ack_bump/20260523_180032_movement_only_1c/phase0_headless_replication_20260523_080032.log`.
3. Ten-client load-wrapper smoke passed with `session_ready=10`, `metrics_clients_with_recent_activity=10`, `metrics_input_accepted_total=2615`, `metrics_input_drop_total=0`, `metrics_lightyear_replication_bandwidth_limited_messages_total=0`, but still emitted `3012` fallback warnings in `data/debug/mmo_synthetic_load_lightyear_ack_bump/20260523_175616_movement_only_10c/phase0_headless_replication_20260523_075616.log`.

Ten-client warning distribution:

```text
per-second buckets:
07:58:36 3004
07:59:11 8

per-ack-tick buckets:
55 8
61 704
62 1416
65 236
75 280
88 360
1638 8

unique_entities=70
warns=3012
```

The build log confirms the 10-client capture linked the new fork rev:

```text
Compiling lightyear_replication v0.26.4 (https://github.com/Dastari/lightyear?rev=019048ca638cd3c2727054d6f3342a34f460753e#019048ca)
```

## Suspected Remaining Path

The out-of-order ack overwrite path appears fixed for the direct single-client repro. The residual multi-client burst appears during spawn/fanout and is concentrated on the four motion component kinds.

Please investigate the reliable insert bookkeeping path in `lightyear_replication::send::sender`, especially `pending_delta_updates` handling that calls `GroupChannel::record_delta_ack_tick(entity, component_kind, tick)` after a reliable insert. Hypothesis to test: under multi-client connect/fanout, that path can advance `delta_ack_ticks` to an insert tick for a client/component whose base was not stored, or has already been released, in `DeltaManager`. The next update then selects `DeltaType::Normal { previous_tick }`, fails `delta_manager.get(entity, previous_tick, kind)`, and logs the fallback warning despite monotonic ack ordering.

This hypothesis may be wrong; treat the Sidereal artifacts above as the source of truth.

## Required Behavior

1. Older/equal out-of-order acks must still not regress `delta_ack_ticks`.
2. `DeltaManager::receive_ack` must still be called for every actual ack tick so retention accounting releases data.
3. Reliable insert/action bookkeeping must not record a per-entity/per-component delta ack tick unless the next normal delta can actually find a retained base for that tick, or the insert path must store the required base before advancing the ack tick.
4. No wire-format changes.
5. No Sidereal-specific component names, policy, or gameplay concepts.

## Required Tests

Add or extend Lightyear tests to cover:

1. Two clients connecting/acking the same entity/component fanout, where one client's insert/update bookkeeping cannot purge or point past the other client's retained base.
2. Reliable insert bookkeeping followed by an immediate component update for the same `(Entity, ComponentKind)`; the next delta must use a retained normal base or intentionally send `DeltaType::FromBase` without logging the missing-base warning.
3. The existing out-of-order stale ack tests from `019048ca` still pass.
4. Reversed ack replay still proves the next delta uses `DeltaType::Normal` when the retained base exists.

## Sidereal Validation After Fork Patch

After the fork patch lands, Sidereal should bump the rev again and rerun:

```bash
CARGO_INCREMENTAL=0 cargo test -p sidereal-replication --test transport_lightyear_e2e single_client_delta_base_fallback_warns_stay_below_threshold -- --nocapture
SIDEREAL_MMO_LOAD_CLIENTS=1 SIDEREAL_MMO_LOAD_DURATION_S=30 SIDEREAL_MMO_LOAD_GATE_MODE=smoke SIDEREAL_MMO_LOAD_OUT_DIR=data/debug/mmo_synthetic_load_lightyear_ack_bump scripts/run_mmo_synthetic_load_tier.sh
SIDEREAL_MMO_LOAD_CLIENTS=10 SIDEREAL_MMO_LOAD_DURATION_S=30 SIDEREAL_MMO_LOAD_GATE_MODE=smoke SIDEREAL_MMO_LOAD_OUT_DIR=data/debug/mmo_synthetic_load_lightyear_ack_bump scripts/run_mmo_synthetic_load_tier.sh
```

Acceptance for this follow-up: both one-client and ten-client load-wrapper replication logs contain zero `Delta base from tick` fallback warnings, or a documented non-zero count with a proven non-regression cause and a Sidereal-side decision on whether the warning should remain at `WARN`.
