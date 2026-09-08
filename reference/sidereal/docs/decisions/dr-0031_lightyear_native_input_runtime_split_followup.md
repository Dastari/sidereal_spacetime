# DR-0031: Lightyear Native Input Runtime Split Follow-Up

Status: Active
Lifecycle: source-of-truth
Category: decision
Last updated: 2026-06-04
Owners: architecture
Scope: DR-0031: Lightyear Native Input Runtime Split Follow-Up.
Source of truth: yes
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

- Status: Accepted
- Date: 2026-03-08
- Owners: networking / replication runtime

## 0. Status Notes

2026-05-30 Phase 3 landed (supersedes the "current intent" wording in the clarification note below):

- The "open work" the clarification note describes — making the custom realtime lane's rollback replay tick-accurate — has been implemented per `docs/plans/completed/client_server_physics_desync_fix_plan_2026-05-30.md` §5 (Finding B). The decision to keep the authoritative server lane custom is unchanged.
- **B2 (client):** `apply_predicted_input_to_action_queue` (`bins/sidereal-client/src/runtime/motion.rs`) no longer replays *current* intent during rollback. It records the predicted intent each normal `FixedUpdate` tick into a new `ClientPredictedInputHistory` ring buffer keyed by `LocalTimeline::tick()` (sized to `max_rollback_ticks`), and during rollback re-simulation replays the input **recorded for the tick being re-simulated**, falling back to current intent only when a tick predates the buffer.
- **B1 (wire/client):** `ClientRealtimeInputMessage.tick` now carries the predicted simulation tick (an unwrapped monotonic value derived from the wrapping `LocalTimeline` tick) instead of a per-send counter. The authoritative server keeps **latest-wins application timing** (no added input-buffering latency — the `#1200`/`#1283` no-latency rationale is preserved); the server uses `tick` only as a per-stream monotonic ordering key, so the change is wire-compatible and needs **no `LIGHTYEAR_PROTOCOL_VERSION` bump**. `accepted_to_applied_tick_gap` is now a real sim-tick lag.
- **Option chosen:** latest-wins + tick-stamp (preserves no-latency), explicitly over server-side tick-indexed *buffered* apply (which would reintroduce input latency). If under-load divergence persists after windowed validation, the next lever is a no-added-latency reconciliation (server echoes the authoritative applied-tick; client aligns rollback replay to server timing) — **not** buffered apply.
- Validation: `cargo test -p sidereal-client --lib` green; controlled-motion e2e (clean + 1% uplink loss) and `controlled_root_handoff_e2e` (100/100 handoffs, all server input-rejection counters 0) pass. Windowed-client runtime/visual A/B is still owed (the headless harness does not schedule the predicted-trajectory apply chain).

2026-05-30 clarification (doc/code reconciliation):

- Re-verified upstream `#1200` and `#1283` are still open via the GitHub API; the runtime split below remains current. See `docs/features/reference/lightyear_upstream_issue_snapshot_reference.md` (2026-05-30 note).
- Correcting drift in the 2026-04-27 rollback follow-up wording: that note says the client keeps Lightyear native input "for `ActionState<PlayerInput>` and rollback replay input history." In the **current implementation**, Lightyear input rollback (`Rollback::FromInputs`) is disabled (`bins/sidereal-client/src/runtime/replication/prediction.rs:45`) and the client does **not** replay per-tick historical input during rollback. `apply_predicted_input_to_action_queue` (`bins/sidereal-client/src/runtime/motion.rs:95-135`) intentionally replays the **current** local intent for every re-simulated tick, while Lightyear state rollback (`Check`) re-simulates component state from `PredictionHistory`.
- Consequence: the fork patch that raises retained client input history to 512 ticks (upstream snapshot 2026-04-27 note) was sized for Lightyear's native input rollback, which Sidereal disabled; it does **not** drive the custom realtime-input replay path and should not be cited as the rollback-convergence mechanism for that path.
- This drift is the subject of Finding B in `docs/reports/investigations/client_server_physics_desync_investigation_2026-05-30.md`. The decision to keep the authoritative server lane custom is unchanged; the open work is making that lane's rollback replay tick-accurate (per-tick input history aligned to the predicted simulation tick), not re-enabling Lightyear native server input.

2026-05-07 scheduling correction:

- The 2026-05-06 default 120 Hz replication `Update` cap has been reverted to an explicit opt-in. `REPLICATION_UPDATE_CAP_HZ` still enables `ScheduleRunnerPlugin::run_loop`, but the default runner is uncapped again so authenticated input drain and fixed simulation do not bunch behind scheduler sleep during native motion-stability repros.

2026-05-06 idle-runtime follow-up:

- Superseded on 2026-05-07: the replication server briefly capped Bevy `Update` at 120 Hz by default through `ScheduleRunnerPlugin::run_loop`, with `REPLICATION_UPDATE_CAP_HZ` available as the operator override.
- This removes the intentional uncapped idle spin that was contributing to long-run change-tick warnings and high idle CPU while preserving the 60 Hz fixed simulation cadence and the protocol-only Lightyear native input registration described by this decision.

2026-04-26 status note:

- Implemented on the replication server: `NativeInputPlugin<PlayerInput>` is no longer installed in `bins/sidereal-replication`.
- Replication now registers only `lightyear::input::native::input_message::NativeStateSequence<PlayerInput>` through Lightyear's backend `InputPlugin` so legacy/in-flight native input packets remain protocol-compatible without running `lightyear_inputs::server::receive_input_message`.
- Authoritative gameplay input remains Sidereal's authenticated `ClientRealtimeInputMessage` lane. `controlled_entity_id` mismatches are rejected after canonical player-anchor/self-control normalization, even when `control_generation` matches.
- Native client behavior is unchanged for local prediction: the client still installs Lightyear native input for `ActionState<PlayerInput>` / `InputMarker<PlayerInput>`.
- WASM impact: no browser transport/runtime behavior change; the server-side split only removes a native server input receive system from replication.

2026-04-26 prediction parity follow-up:

- Sidereal now keeps the Lightyear server-native input runtime disabled while adding shared client/server fixed-step simulation scheduling through `SiderealSharedSimulationPlugin`.
- Server authority and client prediction both convert current input snapshots into `ActionQueue` through the same helper API.
- Re-enabling Lightyear server-native input remains blocked on generic upstream support for target authorization, tracked by Lightyear issue `#1283`, plus the existing `#1200` panic fix.
- Sidereal-specific authenticated session binding and control-generation checks remain outside Lightyear.

2026-04-27 rollback follow-up:

- Because replication still does not run Lightyear's native server input receiver, the native client disables Lightyear input-based rollback (`Rollback::FromInputs`) and relies on Lightyear state rollback/correction for authoritative reconciliation.
- The client still keeps Lightyear native input locally for `ActionState<PlayerInput>` and rollback replay input history; only the server-confirmation trigger from Lightyear's native input path is disabled.
- Authoritative server simulation remains driven by Sidereal's authenticated realtime input lane.

2026-04-28 control-lease follow-up:

- Replication server startup now aliases the protocol-only `lightyear::input::plugin::InputPlugin<NativeStateSequence<PlayerInput>>` as `LightyearInputProtocolPlugin` to make the runtime split explicit in code.
- Do not replace it with `lightyear::input::native::InputPlugin<PlayerInput>` on replication; that native plugin installs the server receive/update path blocked by this decision.
- Control handoff cleanup continues to clear Sidereal realtime input state through Sidereal's authenticated lane rather than relying on Lightyear native server input confirmation.

## Context

- The replication server accumulates long-running Bevy warnings such as:
  - `lightyear_inputs::client::* has not run for 3258167296 ticks`
  - `lightyear_replication::host::HostServerPlugin::add_prediction_interpolation_components has not run ...`
- We also hit a direct upstream Lightyear input failure tracked in `docs/features/reference/lightyear_upstream_issue_snapshot_reference.md` as issue `#1200`, `Panic: subtract with overflow`, in `lightyear_inputs::server::receive_input_message`.
- Sidereal already has an explicit authenticated authoritative input lane on the replication server via `ClientRealtimeInputMessage`, player/session binding, and `LatestRealtimeInputsByPlayer`.
- The client still needs Lightyear native input locally for predicted `ActionState<PlayerInput>` / `InputMarker<PlayerInput>` behavior.

## Decision

Sidereal will temporarily split runtime usage this way:

- client runtime keeps Lightyear native input enabled for local prediction/runtime `ActionState<PlayerInput>` behavior,
- replication server keeps only the Lightyear native input protocol registration needed for wire compatibility with native clients, but does not run the upstream native server receive/update systems,
- authoritative server-side input continues through Sidereal's authenticated `ClientRealtimeInputMessage` path only.

We still want the upstream Lightyear runtime split/fix, but Sidereal will not keep the replication server on the crashing upstream native-input path while `#1200` remains unresolved.

## Required upstream change

The preferred Lightyear fix is one of:

1. Expose the native input sequence type cleanly and allow explicit runtime-specific registration.
2. Add distinct native plugins:
   - client-only native input plugin
   - server-only native input plugin
3. Or make `lightyear_inputs_native::plugin::InputPlugin<A>` role-configurable so it does not unconditionally install both sides.

Sidereal should then reevaluate whether the replication server needs Lightyear native server input at all, or whether the authenticated Sidereal realtime input lane remains the cleaner authoritative path.

## Why keep this local mitigation?

- It does not duplicate Lightyear native-input internals; it only avoids the crashing upstream server receive/update path while keeping protocol registration intact.
- It preserves the existing authoritative Sidereal input contract instead of routing server authority through two parallel input systems.
- It avoids a known upstream overflow panic on the replication server while keeping the client-side prediction path intact.

## Consequences

### Positive

- Replication no longer depends on the upstream native server receive/update path that is currently panicking.
- Sidereal keeps one authoritative server input source: authenticated realtime intent messages.
- Client prediction still keeps the existing native Lightyear `ActionState<PlayerInput>` path.

### Negative

- Sidereal still carries Lightyear native input protocol registration on replication for compatibility, even though authoritative server input does not use that runtime path.
- The longer-term Lightyear runtime split follow-up is still useful, but it is no longer a blocker for Sidereal replication stability.

## Follow-up

1. Track upstream Lightyear issue `#1200` and retest when a fix lands.
2. Reassess whether Sidereal should ever re-enable Lightyear's native server input runtime after upstream fixes land; the current authoritative path intentionally remains Sidereal realtime input.
3. Remove the remaining overnight warning sources we own locally:
   - dormant hierarchy rebuild system registration
   - unnecessary replication-side asset/scene runtime plugins if still present

## References

- `/home/toby/dev/lightyear/lightyear_inputs_native/src/plugin.rs`
- `/home/toby/.cargo/git/checkouts/lightyear-cdfa8a04895fe5e3/2986703/lightyear_inputs/src/input_buffer.rs`
- `crates/sidereal-net/src/lightyear_protocol/registration.rs`
- `bins/sidereal-replication/src/main.rs`
- `bins/sidereal-replication/src/replication/input.rs`
