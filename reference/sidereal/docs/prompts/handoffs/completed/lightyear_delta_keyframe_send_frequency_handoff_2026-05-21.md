# Lightyear Delta Keyframe and Send Frequency Handoff - 2026-05-21

Status: Implemented
Lifecycle: handoff-completed
Category: prompt
Last updated: 2026-06-04
Owners: documentation
Scope: Lightyear Delta Keyframe and Send Frequency Handoff - 2026-05-21.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

## Goal

Patch the `Dastari/lightyear` fork so downstream projects can use lossless delta compression for Avian2D motion components, force periodic full-value delta keyframes, and rely on `ReplicationGroup::send_frequency` timers. Keep the changes generic and upstream-shaped.

2026-05-21 result: implemented in `Dastari/lightyear` commit `3f7c3d20694c6da7a3eeac9d3af4ce680b6341d5`, then carried forward in Sidereal's pinned fork revision `0192db9c9235f807f170c0f7400dd55099a41447`.

## Required Behavior

1. Add Avian2D `Diffable` implementations for:
   - `avian2d::prelude::LinearVelocity`
   - `avian2d::prelude::AngularVelocity`
2. Preserve f64 precision. The diff/apply round-trip must reconstruct exactly according to the component's existing f64 values; no quantization or Sidereal-specific scaling belongs in this patch.
3. Add a public delta-compression registration API that can force a full component value every N ticks. Suggested shape:
   - `add_delta_compression_with_keyframe_interval::<Delta>(NonZeroU16)`
   - Existing `add_delta_compression::<Delta>()` continues to mean current behavior with no forced interval.
4. When a forced interval is configured, the sender emits a base/full-value delta (`DeltaType::FromBase`) on that cadence even when an acknowledged previous tick exists. Non-keyframe ticks continue to use the existing acknowledged-tick diff path.
5. Enable `ReplicationGroup::send_frequency` timers in the replication send schedule. The existing public `ReplicationGroup::set_send_frequency(Duration)` API must actually throttle group update/action buffering at the configured interval.
6. Keep the API optional and backward compatible where possible. Existing Lightyear users that do not call the new keyframe API and do not configure `send_frequency` should retain current behavior.
7. Do not add Sidereal component names, shard concepts, visibility policy, gameplay classes, or environment variables to Lightyear.

## Suggested Implementation Notes

1. Avian2D velocity support likely belongs beside the existing `Position` and `Rotation` implementations in `lightyear_replication/src/impls/avian2d.rs`.
2. The forced keyframe setting likely belongs in the component delta metadata registered from `lightyear_replication/src/registry/registry.rs` / `lightyear_replication/src/registry/delta.rs`.
3. The send path should choose `DeltaType::FromBase` when the configured interval divides the current replication tick. Use Lightyear's existing tick type and avoid wall-clock timers for this part.
4. The `ReplicationGroup::send_frequency` timer systems are currently present but commented out in `lightyear_replication/src/send/plugin.rs`. Re-enable or replace them in the current schedule so timers tick before buffering and reset after buffering.

## Required Tests

1. Unit tests for Avian2D `LinearVelocity` and `AngularVelocity` `Diffable` round-trip, including non-zero, negative, and fractional f64 values.
2. Registry/send-path test proving a configured forced keyframe interval emits `DeltaType::FromBase` on the interval and normal deltas otherwise.
3. Regression test proving existing `add_delta_compression::<Delta>()` behavior is unchanged when no forced interval is configured.
4. Send-frequency test proving a replication group configured slower than the sender interval does not buffer updates/actions every sender tick and does buffer once the timer elapses.
5. Existing Lightyear replication tests remain green.

## Sidereal Validation Context

Sidereal currently depends on:

```toml
lightyear = { git = "https://github.com/Dastari/lightyear", rev = "0192db9c9235f807f170c0f7400dd55099a41447", default-features = false, features = ["udp", "raw_connection", "input_native", "replication", "prediction", "interpolation", "frame_interpolation", "avian2d", "webtransport", "webtransport_self_signed"] }
```

The current fork revision exposes `DeltaManager`, `Diffable`, `add_delta_compression`, Avian2D `Diffable` support for `Position`, `Rotation`, `LinearVelocity`, and `AngularVelocity`, forced motion keyframes, active send-frequency timers, the selected upstream input/sync fixes from #1471/#1479/#1473/#1474, and a lossless fallback when an acknowledged delta base has already aged out.

After this fork patch lands, Sidereal Phase 1.1 will:

1. Bump the Lightyear revision in `Cargo.toml`.
2. Insert a server-side `DeltaManager` on the Lightyear server entity.
3. Register lossless delta compression for Avian2D `Position`, `Rotation`, `LinearVelocity`, and `AngularVelocity`.
4. Configure a default motion keyframe interval of 60 ticks via `SIDEREAL_REPLICATION_MOTION_KEYFRAME_EVERY_N_TICKS`.
5. Enable per-class replication group send-frequency defaults only after validating Lightyear timers under load.
6. Bump Sidereal's `LIGHTYEAR_PROTOCOL_VERSION` and validate native + WASM client builds.

## Non-Goals

1. No lossy quantization.
2. No Sidereal `ShardRegion` or hard-zone logic.
3. No changes to Sidereal's gameplay contracts.
4. No app-specific observability counters beyond generic Lightyear behavior needed to test the feature.
