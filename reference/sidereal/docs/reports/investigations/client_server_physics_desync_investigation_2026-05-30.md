# Client/Server Physics Desync Diagnosis — 2026-05-30

Status: Archived
Lifecycle: historical-report
Category: report
Last updated: 2026-06-04
Owners: report author
Scope: Client/Server Physics Desync Diagnosis — 2026-05-30.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

Author: handoff diagnosis for follow-up agent
Scope: controlled-ship movement desync, rubber-banding, and reconciliation artifacts reported after the
distribution-scaling / single-shard-hardening refactor (`docs/plans/completed/distribution_scaling_and_single_shard_hardening_plan_2026-05-21.md`)

## Reported symptoms

- Ship accelerates in directions it is not facing.
- Rotation continues after releasing keys.
- The server "ghost" (confirmed lane) in the debug overlay jumps around.
- Controlled ship randomly flips direction (suspected server reconciliation).
- Linear and rotational damping / auto-stop does not reliably work.
- Visually the server ghost looks like the thing that is jumping.

## TL;DR

Client and server **do** share the same fixed-step physics pipeline, and the IFCS controller is deterministic
and mass/inertia-invariant. The steady-state physics is not the root cause. The desync is produced in the
**prediction/reconciliation layer**:

1. **PRIMARY — `FlightComputer` is a predicted component with no rollback tolerance, so it forces a full-entity
   rollback on essentially every confirmed packet while flying.** This is the highest-confidence, most concrete
   finding and the recommended first fix.
2. **CONTRIBUTING — the custom realtime-input path is decoupled from the prediction tick timeline**, and during
   rollback the client replays *current* intent instead of per-tick historical input, so corrections cannot
   converge cleanly.
3. **MINOR — small client/server system-ordering differences** add noise but are not a primary driver.

All findings are from static analysis of the code + the vendored Lightyear fork. They have **not** yet been
confirmed with a runtime rollback-rate trace (see "Suggested validation").

## Shared pipeline confirmation (this part is healthy)

- `SiderealSharedSimulationPlugin` registers the same flight systems for both roles:
  `crates/sidereal-game/src/lib.rs:168` (server: `ServerAuthority` arm ~`:195`; client: `ClientPrediction`
  arm ~`:241`). Both run `process_flight_actions`, `apply_engine_thrust` (FixedUpdate) and
  `stabilize_idle_motion`, `clamp_angular_velocity` (FixedPostUpdate / PostPhysics).
- Both runtimes tick at `SIM_TICK_HZ = 60` (`crates/sidereal-core/src/lib.rs:37`) and configure Avian + Lightyear
  with the same `tick_duration` (server `bins/sidereal-replication/src/main.rs:115,128`; client
  `bins/sidereal-client/src/runtime/app_setup.rs:144,171`).
- The IFCS controller (`crates/sidereal-game/src/ifcs.rs`) is a deterministic P-style velocity/angular-velocity
  controller. Because force = `accel * mass` and torque = `alpha * inertia`, mass/inertia cancel against Avian's
  integration, so mass divergence between client and server is largely self-correcting.

Conclusion: a per-runtime physics divergence is unlikely; look at prediction.

## Finding A (PRIMARY): predicted `FlightComputer` causes constant spurious rollbacks

### Evidence

- `FlightComputer` is flagged `predict = true`:
  `crates/sidereal-game/src/components/flight_computer.rs:7`
  (`kind = "flight_computer", persist = true, replicate = true, predict = true, visibility = [OwnerOnly]`)
- The component macro turns `predict = true` into a bare prediction registration with **no rollback tolerance
  and no correction function**:
  `crates/sidereal-component-macros/src/lib.rs:167-173` →
  `app.register_component::<FlightComputer>().add_prediction();`
- The Avian motion components, by contrast, were given explicit rollback tolerances specifically to avoid
  float-jitter rollbacks:
  `crates/sidereal-net/src/lightyear_protocol/registration.rs:64-78`
  (Position `>= 0.03 m`, Rotation `>= 0.003 rad`, LinearVelocity `>= 0.05`, AngularVelocity `>= 0.01`),
  wired at `:204,212,220,227`.
- `FlightComputer` therefore falls back to **exact `PartialEq`** for its rollback check.
- Client rollback is configured as `RollbackMode::Check` with native input rollback disabled:
  `bins/sidereal-client/src/runtime/replication/prediction.rs:22-45`.
- In the vendored Lightyear fork, `Check` mode iterates **every predicted + replicated component** when a
  confirmed update arrives and rolls back the **whole entity** if **any** component's `check_rollback` returns
  true:
  `~/.cargo/git/checkouts/lightyear-cdfa8a04895fe5e3/c1d00a9/lightyear_prediction/src/rollback.rs:329-388`
  (component loop at `:381-388`).

### Mechanism

- The client authors `FlightComputer` **live from local input every FixedUpdate**:
  `process_flight_actions` → `sync_flight_computer_from_pilot_motion_intent`
  (`crates/sidereal-game/src/flight.rs:303` and `:337`).
- The server also authors `FlightComputer` from received input and replicates it to the owner. The confirmed
  copy is **RTT-lagged**, and the server marks it changed essentially every tick there is input (the `&mut
  computer` deref in `process_flight_actions`), so it is sent frequently.
- While actively flying, the live predicted `throttle` / `yaw_input` / `brake_active` almost never *exactly*
  equal the lagged confirmed copy. Under exact-equality checking, this triggers a **full-entity rollback on
  essentially every confirmed packet** — discarding the within-tolerance motion prediction and snapping
  Position / Rotation / LinearVelocity / AngularVelocity back to the lagged server state, then re-simulating.

### Why this matches the symptoms

- "Server ghost jumps around" / "controlled ship randomly flips direction": the predicted ship is being yanked
  back to the lagged confirmed lane on nearly every packet.
- "Damping / auto-stop doesn't reliably work": each rollback re-seeds velocity and spin from a stale tick, so
  `stabilize_idle_motion` / `clamp_angular_velocity` never get a stable steady state to settle.
- "Accelerates / rotates in unexpected directions": rollback re-simulation runs from a stale state with replayed
  input (see Finding B).

### Latent siblings (same bug shape)

- `TotalMassKg` — `predict = true` (`crates/sidereal-game/src/components/total_mass_kg.rs:7`), no tolerance.
  Stable for a steady ship, so it rarely fires, but it is the same exact-equality rollback trigger and would fire
  on any mass change (cargo, fuel, damage).
- `FlightEnvelopeProfile` — `predict = true` (`crates/sidereal-game/src/components/flight_envelope_profile.rs`),
  no tolerance. Constant in practice, so effectively dormant.

## Finding B (CONTRIBUTING): realtime-input path is decoupled from the prediction tick timeline

The project bypasses Lightyear's native input replication (native input rollback is explicitly disabled —
`prediction.rs:45`, and see the comment block at `bins/sidereal-client/src/runtime/motion.rs:96-100`) in favor of
a custom `ClientRealtimeInputMessage`. Two consequences:

1. The message `tick` is **not a simulation tick** — it is a per-send counter incremented in the `Update`
   (frame-rate) schedule: `bins/sidereal-client/src/runtime/input.rs:502-514`. The server uses it only for
   dedup / ordering and applies the *latest intent* at **drain time**, not at the client-predicted tick:
   `bins/sidereal-replication/src/replication/input.rs:770-981` (latest-wins selection `:734-743`,
   drain/apply `:954-981`). So the client's predicted tick and the server's application tick are uncorrelated;
   there is no tick-accurate reconciliation point.
2. During rollback the client **replays the current intent for every re-simulated tick** rather than the
   per-tick historical input (by design — `motion.rs:96-100`, `apply_predicted_input_to_action_queue` at
   `motion.rs:102-135`). So a rollback re-simulates a trajectory the server never produced, and corrections do
   not converge — this is the residual rubber-banding even after Finding A is addressed.

Note: input is sampled and sent in `Update` (render-frame rate) while the simulation consumes it in
`FixedUpdate` (60 Hz), with a 120 msg/s rate limit (`input.rs:287`) and `MAX_TICKS_AHEAD = 6` skip-ahead
(`bins/sidereal-replication/src/replication/input.rs:283-286`). This adds further client/server input-timing
skew on top of (1) and (2).

## Finding C (MINOR): client/server system-ordering differences

The `ServerAuthority` sim set runs `recompute_total_mass`, `apply_navigation_targets_to_desired_motion`, and
`sync_player_to_controlled_entity`; the `ClientPrediction` set does not
(`crates/sidereal-game/src/lib.rs:207-264`). Because mass cancels in the IFCS, this is secondary noise rather
than a primary driver, but it is worth keeping in mind when chasing residual divergence after A and B.

## Recommended fix order

1. **Stop predicted gameplay/control components from gating rollback (do this first).**
   Options, least invasive first:
   - Add an `add_should_rollback` for `FlightComputer` that always returns `false` (keep prediction copy but
     never let it *trigger* a state rollback), or
   - Drop `predict = true` from `FlightComputer` entirely (the client already authors it from input and does not
     need server reconciliation of it). Note: if dropped, confirm the predicted clone still receives/initializes
     a `FlightComputer` so `process_flight_actions` can run on it.
   - Apply the same treatment to `TotalMassKg` (and consider `FlightEnvelopeProfile`).
   This is small, reversible, and should immediately stop the rollback storm. It is straightforward to A/B.

2. **If rubber-banding persists under latency/loss, fix the input timeline (Finding B):** align the input message
   to the predicted simulation tick and record per-tick input history so rollback replays the inputs that were
   actually active at each tick, instead of the current intent.

3. **Optional:** reconcile the client/server sim-set ordering (Finding C) once A/B are resolved.

## Suggested validation (hard evidence not yet captured)

- Add temporary logging / read existing metrics for the **rollback rate** on the controlled entity before and
  after fix #1. Lightyear prediction diagnostics live at
  `~/.cargo/git/checkouts/lightyear-cdfa8a04895fe5e3/c1d00a9/lightyear_prediction/src/diagnostics.rs`.
  Expectation: rollbacks-per-second on the owned ship should drop sharply once `FlightComputer` no longer gates
  rollback.
- Reproduce with the two-headless-client harness / `transport_lightyear_e2e` controlled-motion path, or the
  `/verify` flow, comparing predicted vs. confirmed Position/Rotation drift during continuous input.

## Key file references

- `crates/sidereal-game/src/lib.rs:168` — shared simulation plugin (both roles)
- `crates/sidereal-game/src/flight.rs:245,303,337,655` — input → FlightComputer → desired motion → thrust
- `crates/sidereal-game/src/ifcs.rs` — deterministic velocity/angular controller
- `crates/sidereal-game/src/components/flight_computer.rs:7` — `predict = true` (PRIMARY)
- `crates/sidereal-game/src/components/total_mass_kg.rs:7` — `predict = true` (latent)
- `crates/sidereal-component-macros/src/lib.rs:167-173` — prediction registration (no tolerance)
- `crates/sidereal-net/src/lightyear_protocol/registration.rs:64-78,204-227` — motion rollback tolerances
- `bins/sidereal-client/src/runtime/replication/prediction.rs:22-45` — RollbackMode::Check, native input rollback disabled
- `bins/sidereal-client/src/runtime/motion.rs:96-135` — current-intent replay during rollback
- `bins/sidereal-client/src/runtime/input.rs:239-247,502-521` — input send + per-send `tick` counter
- `bins/sidereal-replication/src/replication/input.rs:283-286,734-743,770-981` — server latest-wins drain/apply
- `lightyear_prediction/src/rollback.rs:329-388` (vendored fork) — Check-mode whole-entity rollback on any predicted-component mismatch
