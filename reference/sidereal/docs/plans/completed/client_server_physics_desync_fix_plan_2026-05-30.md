# Client/Server Physics Desync — Fix Plan

Status: Implemented
Lifecycle: completed
Category: plan
Last updated: 2026-06-10
Owners: implementation owners
Scope: Client/Server Physics Desync — Fix Plan.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

- Date: 2026-05-30
- Status: Active implementation plan
- Owners: client runtime + replication server + shared simulation
- Source diagnosis: `docs/reports/investigations/client_server_physics_desync_investigation_2026-05-30.md`
- Related decision: `docs/decisions/dr-0031_lightyear_native_input_runtime_split_followup.md`
- Related plans: `docs/plans/superseded/prediction_parity_layer_and_input_auth_plan_2026-04-26.md`,
  `docs/plans/completed/control_handoff_input_prediction_stabilization_plan_2026-04-27.md`
- Upstream status reference: `docs/features/reference/lightyear_upstream_issue_snapshot_reference.md` (2026-05-30 note)

## Implementation status (2026-05-30)

- **Phase 0 — DONE.** Per-entity rollback observability landed in the working tree: client reads
  Lightyear `PredictionMetrics` (`rollbacks` / `rollback_ticks`) in `track_client_phase0_diagnostics_system`,
  derives windowed rates in `ClientPhase0Diagnostics::record_rollback_metrics`
  (`bins/sidereal-client/src/runtime/resources.rs`), surfaces a `Rollback/s` F3 overlay row
  (`debug_overlay/formatting.rs`, warn >2/s, error >10/s), and logs `phase0_rollback*` fields in both the
  windowed and headless Phase 0 capture systems (`phase0a_capture.rs`). Baseline capture (the recorded
  rollback rate at localhost and under the conditioner) is still owed before the Phase 1 A/B.
- **Phase 1 — IMPLEMENTED, static gates green; runtime A/B pending.** Macro-level fix landed:
  - `sidereal_component` macro gained `predict_rollback: LitBool` (default `true`) with a
    `MetaArg::PredictRollback` arm. When `predict && !predict_rollback`, the client registration emits
    `.add_prediction().add_should_rollback(crate::component_meta::sidereal_never_rollback::<T>)`
    (`crates/sidereal-component-macros/src/lib.rs`).
  - Generic helper `sidereal_never_rollback<C>(&C, &C) -> bool { false }` added to
    `crates/sidereal-game/src/component_meta.rs` (matches `lightyear`'s `ShouldRollbackFn<C>`).
  - `predict_rollback = false` applied to `FlightComputer`, `TotalMassKg`, `FlightEnvelopeProfile`.
  - Gates run green: `cargo fmt --all -- --check`; `cargo check --workspace` (exercises the
    feature-gated generated `add_should_rollback` via the client); `cargo test -p sidereal-game
    -p sidereal-component-macros`; `clippy` on the touched crates; WASM (`wasm32-unknown-unknown`,
    `bevy/webgpu`) and Windows (`x86_64-pc-windows-gnu`) client checks.
  - **Caveat:** the full `clippy --workspace --all-targets -- -D warnings` gate currently fails on a
    pre-existing, unrelated error in `crates/sidereal-ghost-lane` test code (`uuid` used without the
    dependency, `src/lib.rs:397`). Not touched by this work; likely in-flight in another worktree. The
    Phase 1 clippy gate was satisfied on the touched crates instead.
- **Phase 1 A/B + Phase 2 gate — MEASURED 2026-05-30. Verdict: Phase 1 resolves the localhost rollback
  storm; residual divergence under latency/loss persists → Phase 3 is warranted.**
  Method: headless Phase 0a capture (`scripts/capture_phase0_dense_baseline.sh`, `CAPTURE_MODE=headless`,
  `HEADLESS_PHASE0A_CAPTURE=1`, `forward:30`, 30 s active input, debug profile, auto-seeded single client).
  Baseline = the three control components reverted to `predict_rollback = true` (exact-equality gating);
  Fix = `predict_rollback = false`. Owned-ship `PredictionMetrics` rollbacks read from the new Phase 0
  counters. Raw logs (gitignored): `data/debug/desync_phase1/{before,after}_{localhost,conditioned}/`.

  | Condition | Rollbacks (30 s) | Peak/s | Avg depth |
  |---|---|---|---|
  | Baseline, localhost | 271 | 53.9 | 0.92 |
  | **Fix, localhost** | **46** | **7.86** | **0.83** |
  | Baseline, conditioned (5% loss / 25 ms / 25 ms jitter) | 1478 | 57.5 | 1.36 |
  | **Fix, conditioned** | **1442** | **53.9** | **1.59** |

  - Localhost: **−83% rollbacks, −85% peak rate.** The baseline's ~54/s peak ≈ the 60 Hz tick rate
    (rollback on nearly every confirmed packet) — Finding A confirmed and resolved. The post-fix 7.9/s
    peak is residual genuine physics divergence on a clean link.
  - Conditioned: **no meaningful change (1478 → 1442, ~2%).** Under 5% loss + latency/jitter the dominant
    rollback driver is real predicted-vs-confirmed physics-state divergence (Position/Rotation/velocity),
    which legitimately gates rollback via its own tolerances; the `FlightComputer` exact-equality
    contribution that Phase 1 removes is a small fraction of that. This is exactly the §3/§4 branch point.
  - **Decision:** Phase 1 ships (clear localhost win, no regression, independently reversible). Phase 2
    gate result routes to **Phase 3** (B1 tick-correlate the input message + B2 per-tick input history for
    rollback replay) to address the residual under-latency divergence. Phase 4 remains optional.
  - Owed before closing Phase 1: full `clippy --workspace --all-targets` once the unrelated
    `sidereal-ghost-lane` `uuid` test-dep breakage is fixed; the parity harness acceptance gate.
- **Phase 3 B2 — IMPLEMENTED, static gates green; runtime validation blocked by environment.**
  Per-tick predicted-input history + rollback replay landed client-side:
  - New `ClientPredictedInputHistory` resource (`bins/sidereal-client/src/runtime/motion.rs`): a
    `VecDeque<(Tick, PlayerInput)>` ring buffer sized to `max_rollback_ticks + 16`.
  - `apply_predicted_input_to_action_queue` now records current intent keyed by `LocalTimeline::tick()`
    on normal FixedUpdate ticks, and during rollback (`is_in_rollback`) replays the input recorded for
    the re-simulated tick instead of current intent (falling back to current intent only when a tick is
    older than the buffer). Resource registered in `ClientPredictionPlugin::build`.
  - 3 unit tests (record/replay-by-tick, same-tick overwrite, capacity eviction). Gates green: `fmt`,
    `clippy -p sidereal-client --all-targets`, WASM, Windows.
  - **Environment limitation (important):** the headless client does **not** schedule
    `apply_predicted_input_to_action_queue` (only `send_lightyear_input_messages`); the seed/apply/enforce
    FixedUpdate chain is non-headless only (`replication_plugins.rs`). So B2 — and B1's effect on the
    client's predicted trajectory — **cannot be runtime-measured by the headless Phase 0 harness**, and
    the windowed client needs a display this box lacks. Phase 3 runtime/visual validation is owed on a
    workstation with a display. (This is also why the Phase 1 headless A/B worked: Finding A triggers via
    component registration regardless of the input-apply path; Phase 3 targets input-apply fidelity.)
- **Phase 3 B1 — IMPLEMENTED (option (a), user-chosen), validated via e2e.** Latest-wins application
  timing preserved (no added latency); the wire `tick` now carries the predicted simulation tick.
  - Client: `send_lightyear_input_messages` (already in `FixedPreUpdate`) stamps the message with an
    **unwrapped monotonic sim tick** derived from `LocalTimeline::tick()`. It tracks the wrapping `u16`
    sim tick in `ClientInputSendState.last_wrapped_sim_tick` and advances `ClientNetworkTick` by the
    forward sim-tick delta, clamped `>=1` so every message carries a strictly increasing, unique tick
    across `u16` wraps and skipped sends. The tracker resets on lease-inactive so a resumed/handed-off
    stream restarts at +1.
  - **No protocol-version bump needed.** Wire format is unchanged (`tick: u64`); the server only uses
    `tick` as a per-stream monotonic ordering key and computes `accepted_to_applied_tick_gap` from client
    tick values only, so an unwrapped sim tick is wire-compatible with the existing server (and with old
    clients). The plan's earlier "bump protocol version" assumed option (b)'s changed server consumption.
  - Server `replication/input.rs` unchanged. `accepted_to_applied_tick_gap` is now a real sim-tick lag.
  - Validation: `cargo test -p sidereal-client --lib` (201 green); `fmt` / `clippy --all-targets` /
    WASM / Windows green. Authoritative-path e2e: `two_headless_clients_receive_remote_motion_diagnostics`
    (clean **+ 1% uplink loss**) pass; `controlled_root_handoff_e2e` 100/100 handoffs with
    `entity_loss=0`, `entity_duplication=0`, `input_drop_total=0`, and **every** input rejection counter
    (`future_tick`, `duplicate_or_out_of_order`, `rate_limited`, …) at 0 on both shards — the sim-tick
    stamp does not trip future/out-of-order rejection across fresh-client cutovers. Cutover p95 251 ms /
    prepare-to-commit p95 220 ms (within SLO).
- **Phase 3 remaining: windowed-client runtime/visual validation** (rollback-rate + correction-smoothness
  A/B under the conditioner) is owed on a workstation with a display — the headless harness cannot
  exercise the predicted-trajectory apply path (see the B2 environment note). All code + automated gates
  for B1/B2 are green.
- **Phase 3 windowed validation — COMPLETE (2026-06-10).** Live play on real hardware with the windowed
  native client confirmed: flight feel and latency are good, no rubber-banding observed, corrections are
  smooth, multi-client visibility behaves correctly, and frame rates are stable. Per the decision gate
  below, Phase 3 is closed. **Phase 3.1 stays deferred (not needed on current evidence)** and Phase 4
  remains optional/not pursued. This plan is now fully complete.

### Phase 3 windowed validation procedure (run on a machine with a display)

The F3 overlay already exposes the Phase 0 `Rollback/s` row (`now / max / depth / n`; warn >2/s, error
>10/s). Use it for the A/B. Run the server optimized so server-lag does not confound the read:

```bash
make pg-up
make run-replication-release          # optimized server (avoids debug-build rubber-banding)
make run-gateway
make run-client-release               # windowed client; F3 toggles the overlay
```

1. **Baseline feel:** fly a deterministic path (hold forward + occasional turns) at localhost. Note the
   `Rollback/s` max and whether corrections feel smooth.
2. **Under loss/jitter:** restart `run-replication-release` with the conditioner the Phase 1 A/B used, and
   repeat the same flight:
   ```bash
   SIDEREAL_REPLICATION_LINK_CONDITIONER_LOSS_RATIO=0.05 \
   SIDEREAL_REPLICATION_LINK_CONDITIONER_LATENCY_MS=25 \
   SIDEREAL_REPLICATION_LINK_CONDITIONER_JITTER_MS=25 \
   make run-replication-release
   ```
   Watch for snapback magnitude at input edges (press/release while turning), not just rollback count —
   B2 targets correction *smoothness*, so the read is "do corrections jump less," with `Rollback/s` as the
   secondary signal.
3. **A/B against pre-Phase-3:** compare this build to one with B1+B2 reverted but Phase 1 kept
   (`git stash` the Phase 3 hunks in `motion.rs` / `input.rs` / `resources.rs` / `control.rs`, or build the
   commit before Phase 3). Same flight path, same conditioner, eyeball + `Rollback/s`.

Decision after the windowed read:
- Smooth enough at localhost **and** under the conditioner → Phase 3 done; close it.
- Residual edge snapback under loss persists → proceed to **Phase 3.1 (deferred)** below — **not** the
  latency-adding buffered apply.

### Phase 3.1 — No-added-latency reconciliation (DEFERRED; only if §windowed validation shows residual)

Not designed or built yet, per "don't build until tested." One-line intent so it is not lost: server stays
latest-wins (no buffering latency) but **echoes the authoritative tick at which it applied each input** on
the ack; the client aligns its rollback replay to the server's application timing instead of its own
prediction timing. This closes the input-edge timing skew that option (a) leaves, without the input-buffer
latency option (b) would add. It adds an ack-path field, so it crosses the wire-contract bar and would get
its own DR when/if pursued.

## 0. Carry-forward discoveries (anchor the plan)

1. **Upstream `#1200` and `#1283` are still open (verified live via the GitHub API on 2026-05-30).**
   The custom authoritative server-input lane (`ClientRealtimeInputMessage`) stays. Finding B is "finish the
   custom design," **not** "switch back to Lightyear native input."
2. **Doc/code drift, now reconciled in DR-0031 (2026-05-30 note):** rollback replays *current* intent
   (`bins/sidereal-client/src/runtime/motion.rs:95-135`); Lightyear input rollback is `Disabled`
   (`bins/sidereal-client/src/runtime/replication/prediction.rs:45`); the 512-tick input-history fork patch was
   sized for the now-disabled native input rollback and does **not** drive the custom replay path.
3. **Finding A is a macro-level defect, not a one-component defect.** `predict = true` emits a bare
   `add_prediction()` with no rollback tolerance (`crates/sidereal-component-macros/src/lib.rs:167-174`) →
   exact-`PartialEq` rollback trigger. Fixing it at the macro fixes the latent siblings (`TotalMassKg`,
   `FlightEnvelopeProfile`) in the same change.

## 1. Guardrails (from DR-0013, control-handoff plan §12, AGENTS.md)

- Do not weaken input auth: input stays authenticated, `control_generation`-scoped, and target-validated.
- Fixed-step time only for force/integration math; no frame-delta math.
- No client authoritative transform writes or snapback shims.
- Client changes must keep WASM (`wasm32-unknown-unknown`) and Windows (`x86_64-pc-windows-gnu`) cross-checks green.

## 2. Phase 0 — Make rollback observable (before any change)

Goal: turn the highest-confidence static finding into a measured number so Phase 1 is A/B-provable.

- Surface per-entity rollback rate for the owned ship from Lightyear's prediction diagnostics
  (`lightyear_prediction/src/diagnostics.rs`), routed to the F3 overlay and/or the Phase 0 capture log.
- Capture a baseline: rollbacks/sec on the controlled ship during continuous input, both at localhost and
  under the conditioner (`_LOSS_RATIO=0.05 _LATENCY_MS=25 _JITTER_MS=25`).
- Exit criteria: a recorded baseline rollback rate. No behavior change.

## 3. Phase 1 — Finding A (PRIMARY): stop predicted control components from gating rollback

Root cause: `FlightComputer` is authored live every FixedUpdate from local input; the confirmed copy is
RTT-lagged; exact-equality ⇒ full-entity rollback on nearly every confirmed packet.

Approach (macro-level, reusable):

1. Extend the `sidereal_component` macro (`crates/sidereal-component-macros/src/lib.rs`):
   - Add `predict_rollback: LitBool` (default `true`) to `SiderealComponentArgs` and a
     `MetaArg::PredictRollback` arm (`:11-94`).
   - In `client_lightyear_body` (`:167-175`), when `predict && !predict_rollback`, emit:
     `app.register_component::<T>().add_prediction().add_should_rollback(__sidereal_never_rollback);`
   - Provide a generic `fn __sidereal_never_rollback<C>(_: &C, _: &C) -> bool { false }` in the macro's
     runtime-support location. Verify the vendored fork's `add_should_rollback` signature accepts a named `fn`
     item (the motion components pass named `fn`s, so a named generic fn is the safest form).
2. Apply `predict_rollback = false` to:
   - `FlightComputer` (`crates/sidereal-game/src/components/flight_computer.rs:7`) — primary
   - `TotalMassKg` (`crates/sidereal-game/src/components/total_mass_kg.rs:7`) — latent sibling
   - `FlightEnvelopeProfile` (`crates/sidereal-game/src/components/flight_envelope_profile.rs`) — latent sibling
3. Why `add_should_rollback(false)` over dropping `predict`: keeps the component on the predicted clone so
   `process_flight_actions` still runs on it (the diagnosis's caveat about dropping `predict`), but it can never
   *trigger* a whole-entity rollback. Real physics state (`Position`/`Rotation`/`LinearVelocity`/
   `AngularVelocity`) still gates rollback via the existing tolerances
   (`crates/sidereal-net/src/lightyear_protocol/registration.rs:64-78,202-231`).

Validation:

- Re-measure Phase 0 rollback rate — expect a sharp drop on the owned ship.
- Two-headless-client / `transport_lightyear_e2e` controlled-motion path: predicted-vs-confirmed
  Position/Rotation drift during continuous input should settle; ghost-jumping, random flips, and damping not
  settling should largely clear.
- Decision gate: if symptoms resolve at localhost **and** under the conditioner → Phase 1 is sufficient and
  Phases 3-4 become optional hardening. If residual rubber-banding under latency/loss persists → Phase 3.

## 4. Phase 2 — Re-measure under latency/loss (cheap gate, no code)

Run the conditioned diagnostic again post-Phase-1. This is the explicit branch point the diagnosis calls out
("if rubber-banding persists under latency/loss"). Record the result before committing to Phase 3, which is
materially more invasive.

## 5. Phase 3 — Finding B (CONTRIBUTING, conditional): make the custom lane tick-accurate

Only if Phase 2 shows residual divergence. This completes the custom design rather than replacing it. Two
coupled sub-fixes:

### B1 — Tick-correlate the input message

- Stamp `ClientRealtimeInputMessage` with the predicted **simulation tick** (FixedUpdate), replacing the
  per-send Update counter (`bins/sidereal-client/src/runtime/input.rs:502-514`).
- Server applies input indexed by that tick instead of latest-wins-at-drain
  (`bins/sidereal-replication/src/replication/input.rs:734-743,954-981`). Preserve dedup/ordering, the 120
  msg/s rate limit (`input.rs:287`), and `MAX_TICKS_AHEAD` skip-ahead (`replication/input.rs:283-286`).
  Do **not** weaken auth/generation/target checks.

### B2 — Per-tick input history for rollback replay

- Record a client-side ring buffer of `PlayerInput` keyed by sim tick (Sidereal-owned, because Lightyear's
  native input history feeds the disabled `Rollback::FromInputs` — see the reconciled DR-0031 note).
- In `apply_predicted_input_to_action_queue` (`bins/sidereal-client/src/runtime/motion.rs:102-135`), during
  rollback re-simulation replay the input active at the tick being re-simulated instead of current intent.
  Keep current-intent behavior for normal (non-rollback) ticks.
- Size the buffer to the rollback budget (`max_rollback_ticks`), not the legacy 512.

Validation: conditioned two-client e2e; corrections should converge without re-simulating trajectories the
server never produced.

## 6. Phase 4 — Finding C (MINOR, optional): reconcile sim-set ordering

After A/B settle, decide per-system whether `recompute_total_mass`,
`apply_navigation_targets_to_desired_motion`, and `sync_player_to_controlled_entity` should also run on the
`ClientPrediction` set (`crates/sidereal-game/src/lib.rs:207-264`), or document why they are server-only. Mass
cancels in the IFCS, so this is noise reduction, not a primary driver.

## 7. Quality gates (each phase touching client code)

```bash
cargo fmt --all -- --check
CARGO_INCREMENTAL=0 cargo clippy --workspace --all-targets -- -D warnings
CARGO_INCREMENTAL=0 cargo check --workspace
CARGO_INCREMENTAL=0 cargo check -p sidereal-client --target wasm32-unknown-unknown --features bevy/webgpu
CARGO_INCREMENTAL=0 cargo check -p sidereal-client --target x86_64-pc-windows-gnu
```

Plus targeted tests per touched crate, and the parity harness
(`docs/plans/superseded/prediction_parity_layer_and_input_auth_plan_2026-04-26.md` §3) as the acceptance gate.

## 8. Risk / sequencing summary

- Phase 1 is small, reversible, high-confidence, and independently shippable. It should resolve most symptoms.
- Phase 3 is the only heavy change (touches the authoritative drain path) and is deliberately gated behind a
  measurement so its cost is not paid speculatively.
- Re-enabling Lightyear native server input remains out of scope while `#1200` and `#1283` are open.
