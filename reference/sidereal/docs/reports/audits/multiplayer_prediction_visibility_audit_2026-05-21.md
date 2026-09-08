# Multiplayer Prediction and Visibility Audit — 2026-05-21

Status: Archived
Lifecycle: historical-report
Category: report
Last updated: 2026-06-04
Owners: report author
Scope: Multiplayer Prediction and Visibility Audit — 2026-05-21.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

## 0. Status Notes

2026-05-21 status note:

1. Audited prediction and visibility runtime against the design documents and the last week of changes (`MMO Restructure`, `Implement audit remediation phases 1-3`, `Add dashboard summary APIs and tighten overlay bindings`, `Expand visibility candidate range to scanner sources`).
2. Build/test gates passed: `cargo fmt --all -- --check`, `cargo check -p sidereal-client`, `cargo check -p sidereal-replication`, `cargo test -p sidereal-replication` (218 + 4 + 1 + 1 + 3 = 227 tests, all green; the `transport_lightyear_e2e` suite took ~61s and passed all three flows).
3. No code changes were made in this audit. Ranked recommendations and follow-up patches are listed below; runtime evidence collection is required before applying the speculative ones.
4. Native impact: pure inspection; nothing changed. WASM impact: nothing changed.

2026-05-29 update note: Client-side nearby interpolated collision proxies now suppress Lightyear-written linear/angular velocity after interpolation and before Avian simulation, keeping interpolation as the sole transform authority while preserving proxy collision for native; WASM impact: shared client schedule only, no target-specific branch.

## 1. Repro Plan and Evidence to Collect

The audit identifies several plausible root causes but cannot rank them definitively without runtime evidence. The following captures should be taken before applying any fix beyond the obvious cleanups in §6.A.

### 1.1 Single-player rubber-banding repro

Goal: distinguish authoritative server lag from client presentation/timeline lag.

```bash
# terminal 1
make pg-up
SIDEREAL_DIAGNOSTICS=standard,prediction=debug,interpolation=debug,visibility=debug \
make run-replication
# terminal 2
make run-gateway
# terminal 3
SIDEREAL_DIAGNOSTICS=standard,prediction=debug,interpolation=debug \
make run-client-release
```

Drive a deterministic flight path (forward thrust + occasional turn). Watch F3 overlay:

- `Local`, `Sidecar`, `Hist` ticks
- `Stage Dlt` (sidecar-to-history, prediction-to-sidecar, local-to-prediction)
- `Stage Age` (history/sidecar/prediction wall-clock staleness in ms)
- `Auth Gap` (post-authority controlled tick gap)
- `Stall Tick` (frame-stall tick-gap samples)
- `Ctrl TickGap` rolling p95/p99

Cross-reference replication `/health` JSON (loopback `127.0.0.1:15713/health` per `REPLICATION_BRP_PORT`) for:

- `fixed_tick_wall_ms_*` and `fixed_tick_over_budget_total`
- `input_drops_total`, `realtime_input_*` rejection/stale counters
- `visibility_apply_*` per-frame, `apply_worklist_*` budgets, `deferred_membership_*`
- `outbound_message_metrics_*` (sent/queued payload bytes per class)
- `lightyear_replication_send_*` (queued/sent payload bytes, bandwidth-limited messages)
- `runtime_lane_*` `last_ms` / `over_budget_total` for visibility AOI, motion replication, tactical stream

Headless capture wrapper:

```bash
SIDEREAL_PHASE0_INPUT_SCRIPT=forward:30 \
SIDEREAL_PHASE0_ASTEROID_FIELD_COUNT=150 \
SIDEREAL_PHASE0_CAPTURE_DURATION_S=40 \
SIDEREAL_DIAGNOSTICS=standard,prediction=debug,interpolation=debug \
scripts/capture_phase0_dense_baseline.sh
```

Expected decision tree:

- If `fixed_tick_wall_ms_max` < ~12 ms and `fixed_tick_over_budget_total` ≈ 0 and `input_drops_total` ≈ 0, the server is not behind. Look at client `Stage Age`/`Stage Dlt` / `Stall Tick` for presentation/timeline lag.
- If `lightyear_replication_send_*.bandwidth_limited_messages_total` > 0 or `outbound_message_metrics_*.queued_bytes` is climbing, replication is bandwidth-limited (likely tactical/manifest streaming, not motion).
- If `Stage Age (sidecar)` > a few hundred ms while `fixed_tick_wall_ms` is healthy, network or Lightyear `ConfirmedTick` advance is lagging — not server simulation.

### 1.2 Two-client visibility repro

Repro of asymmetric visibility:

```bash
# T1
SIDEREAL_DIAGNOSTICS=standard,visibility=debug make run-replication
# T2
make run-gateway
# T3 — client A
make run-client-release
# T4 — client B (separate window/account)
CLIENT_UDP_BIND=127.0.0.1:0 CLIENT_BRP_PORT=15715 make run-client2
```

Procedure:

1. A logs in, selects ship at origin. Confirm `controlled_entity_id` is set and `VisibilityRangeM` is present on A's ship via the replication BRP snapshot:

   ```bash
   curl -s -H "Authorization: Bearer $BRP_AUTH_TOKEN" \
     -d '{"jsonrpc":"2.0","id":1,"method":"world.query","params":{"data":{"option":["sidereal_game::generated::components::VisibilityRangeM","sidereal_game::generated::components::OwnerId","avian2d::dynamics::Position"]}}}' \
     -H 'Content-Type: application/json' \
     http://127.0.0.1:15713/ | jq
   ```

2. B logs in, selects ship in same sector but at +1200 m offset (within starter scanner range of 1300 m).
3. Both clients should see the other ship within ~100–300 ms (one visibility AOI cycle plus a Lightyear spawn round-trip).
4. If asymmetric: snapshot per-client `VisibilityDisclosure` and `VisibilitySpatialGrid` for each player ECS entity and compare:
   - `visibility_sources` (must contain the controlled ship pose+range for both)
   - `delivery_range_m` and `candidate_mode`
   - `queried_cells` for both clients

Then snapshot the membership cache by inspecting `apply_*` counters in `/health` and look for `apply_non_candidate_policy_eval_skips` rising while `candidate_entities_with_clients` is asymmetric across clients.

### 1.3 Bandwidth/queue depth under load

Use the synthetic MMO load tier:

```bash
SIDEREAL_MMO_LOAD_CLIENTS=10 SIDEREAL_MMO_LOAD_WORKLOAD=movement_only \
  scripts/run_mmo_synthetic_load_tier.sh
```

The capture wrapper writes a `mmo_load_*` summary JSON. Confirm:

- `mmo_load_visibility_cell_dirty_worklist_enabled=1`
- `mmo_load_input_drops=0`
- `mmo_load_replication_bandwidth_limited_messages_total=0`
- Per-class `outbound_message_metrics` sent vs queued bytes match

## 2. What the Code Currently Does

### 2.1 Visibility pipeline (server, FixedPostUpdate + Update lane)

Per-tick (FixedPostUpdate, after `PhysicsSystems::Writeback`, ordered set chain in `bins/sidereal-replication/src/plugins.rs:160`):

1. `simulation_entities::sync_controlled_entity_transforms` + `sync_world_entity_transforms_from_world_space`
2. `runtime_state::update_client_observer_anchor_positions` — observer anchor is controlled entity's f64 `Position` when bound, else player anchor (`bins/sidereal-replication/src/replication/runtime_state.rs:152`).
3. `runtime_state::compute_controlled_entity_visibility_ranges` — aggregates `VisibilityRangeM` + buffs onto controlled root.
4. `visibility::refresh_visibility_entity_cache`
5. `visibility::refresh_visibility_spatial_index` — rebuilds `entities_by_cell`, `world_position_by_entity`, `root_entity_by_entity`, sector/region maps, dirty-cell sets, per-entity visibility revisions (`spatial_index.rs:644`).
6. `visibility::refresh_static_landmark_discoveries` (lower-cadence, default 0.25 s)
7. `visibility::ensure_network_visibility_for_replicated_entities`

Per Update at 10 Hz cadence (`REPLICATION_VISIBILITY_AOI_HZ=10`, `bins/sidereal-replication/src/replication/runtime_lanes.rs:36`):

8. `visibility::update_network_visibility` (`bins/sidereal-replication/src/replication/visibility/membership.rs:1`) — builds per-client visibility context, candidate cells, candidate sets, the apply worklist; evaluates `prepare_entity_apply_policy` then `evaluate_prepared_entity_policy_for_client`; diffs membership against `VisibilityMembershipCache`; calls `ReplicationState::gain_visibility`/`lose_visibility`. Then `RoleVisibilityRearmState::advance_after_membership_pass` ticks down rearm suppression.

Per Update (uncapped):

9. `control::reconcile_control_replication_roles` (`bins/sidereal-replication/src/main.rs:256`) — recomputes desired `ControlledBy`, `Replicate`, `PredictionTarget`, `InterpolationTarget` for each player/ship from current `AuthenticatedClientBindings`. When the desired interpolation target's `Debug` differs from the current one, it inserts the new component and queues `rearm_visibility_tree_for_role_change` for the affected root.

### 2.2 Prediction pipeline (client)

- `bins/sidereal-client/src/runtime/transport.rs:62..107` defines `input_timeline_config_from_tuning` (sets minimum/maximum input-delay ticks, max-predicted ticks, sync config) and `interpolation_config_from_tuning`.
- Defaults (`bins/sidereal-client/src/runtime/resources.rs:822..847`):
  - `SIDEREAL_CLIENT_INPUT_DELAY_TICKS = 3` (changed from `2` in `e5f114a client: bound prediction lead during focus churn`; the 2026-03-22 status note in `prediction_runtime_tuning_and_validation.md` still says `2`)
  - `SIDEREAL_CLIENT_MAX_PREDICTED_TICKS = 30`
  - `SIDEREAL_CLIENT_UNFOCUSED_MAX_PREDICTED_TICKS = 0`
- Defaults (`resources.rs:1750..1764`):
  - `SIDEREAL_CLIENT_MAX_ROLLBACK_TICKS = 100`
  - `SIDEREAL_CLIENT_ROLLBACK_STATE = Check`
  - `SIDEREAL_CLIENT_INSTANT_CORRECTION = false`
- Focus recovery defaults (`resources.rs:965..985`):
  - `min_unfocused_s = 0.5`
  - `suppress_input_s = 0.15`
  - `resync_after_s = Some(1.0)` (hard resync default-on, matching the latest 2026-05-05 doc note)
  - `max_tick_gap = 60`
- `replication::configure_prediction_manager_tuning` (`replication/prediction.rs:8`) idempotently applies tuning to all `PredictionManager`s; input rollback is forced to `Disabled`; state rollback follows the env.
- Client FixedUpdate (`runtime/plugins/replication_plugins.rs:138`):
  1. `seed_controlled_predicted_motion_from_confirmed` (skips during rollback)
  2. `apply_predicted_input_to_action_queue`
  3. `enforce_controlled_planar_motion`
  4. `SiderealSimulationSet::SimulateGameplay` (shared simulation systems from `sidereal-game`)
- `enforce_motion_ownership_for_world_entities` (`runtime/motion.rs:542`) runs on Update with dirty-gated and time-throttled reconciliation; only the Predicted clone receives `FlightControlAuthority`, `RigidBody::Dynamic`, `Mass`, `AngularInertia`; nearby remote roots become kinematic `NearbyCollisionProxy`s; other replicated roots are stripped of physics components.

### 2.3 Authority-flow verification

Spot-checked from code:

- Server authoritative input comes only from `ClientRealtimeInputMessage` (`replication/input.rs`), session-bound via `AuthenticatedClientBindings`; native server input receiver is not installed (confirmed by lack of any `lightyear_inputs_native::server` plugin in `bins/sidereal-replication/src/plugins.rs`).
- Controlled predicted entity owns all three of `SimulationMotionWriter`, `InputMarker<PlayerInput>`, `ActionState<PlayerInput>` together (`runtime/motion.rs:80..108`, with the active-entity check). Non-active or fallback entities lose them.
- Confirmed/interpolated fallback targets are explicitly refused (`runtime/control.rs` adoption path + 2026-04-28 status note).
- Predicted clone seeding uses `PredictedMotionBootstrapSeed.generation` to ignore stale seeds (`motion.rs:266`); freshest same-GUID `ConfirmedHistory<Position>` is preferred over the predicted entity's `ConfirmedTick` sidecar (`motion.rs:284`).
- Old control ack/reject is filtered by generation (per 2026-05-14 status note; deterministic regression coverage already exists).

## 3. Findings — Visibility / Inter-Client Failures

### 3.1 (Confirmed fix) Scanner-source candidate range — 2c71348

`bins/sidereal-replication/src/replication/visibility/spatial_index.rs:77..152` and `policy.rs:402..428` now include each client's visibility-source ranges when building `candidate_cells` / `candidate_set` and use `max(client_delivery_range_m, max_visibility_source_range_m)` for range-checked delivery. Two regression tests in `metrics.rs` cover the symmetric/tactical-view cases.

Caveats:

- The fix is correct but partial cleanup: `build_candidate_cells_for_client` (`spatial_index.rs:82`) still accepts `_view_mode` (now unused). `build_candidate_set_for_client` (`spatial_index.rs:124`) still has a `Map`-mode early branch that seeds `owned_entities_by_player` into the candidate set. This is dead-code-ish (the apply-worklist independently adds owned entities, `context_cache.rs:1153..1157`), but it is misleading to readers and tempts a regression. Recommend removing both.
- Widening applies only to `PreparedEntityApplyPolicy::RangeChecked`. `PublicVisible`, `FactionVisible`, and `DiscoveredLandmark` still use `client_context.delivery_range_m` (`policy.rs:319..400`). That is intentional (landmarks have their own discovered-delivery scaling, public/faction visibility is policy-bound), but should be made explicit in code or comments because a future bug could quietly affect public/faction ships.

### 3.2 Role-rearm churn on every connect/disconnect (likely real, observable)

`control::reconcile_control_replication_roles` (`bins/sidereal-replication/src/replication/control.rs:897..1102`) runs every Update frame. Each frame it rebuilds `bound_client_by_player_wire`, then for each controlled ship computes:

```rust
let desired_interpolation = match desired_owner {
    Some(owner) => observer_interpolation_target(&bindings, owner)
        .map(DesiredInterpolationTarget::Manual),
    None => Some(DesiredInterpolationTarget::Network(NetworkTarget::All)),
};
```

`observer_interpolation_target` (`control.rs:158..170`) collects all *other* authenticated clients (sorted by entity bits) and wraps them as `InterpolationTarget::manual(observer_clients)`. The current vs desired check compares `format!("{:?}", target)`. So:

- On any frame where `bindings.by_client_entity` does NOT change, the formatted strings match and nothing happens. Good.
- On the frame a new client connects (or disconnects), the formatted string for every controlled ship changes (the manual list now has one more / one fewer entity). Every controlled ship gets a fresh `InterpolationTarget` insert plus a queued `rearm_visibility_tree_for_role_change`.
- The rearm closure calls `lose_visibility()` on every currently visible client for every entity under the affected root, removes them from the membership cache, and queues `RoleVisibilityRearmState::queue_loss_pass` so the next membership pass cannot immediately re-gain. With `visibility_aoi_hz=10`, the re-gain happens up to ~100 ms later.

Symptom this produces for users: when any player joins or leaves, *all* existing players briefly lose visibility (predicted/interpolated despawn + respawn) for *every* other player's ship — visible as a flash/flicker, and possibly as the "client logged in and other clients still cannot see that client's ship" report if a downstream race makes the re-gain pass miss the now-stale snapshot.

Evidence to capture: increment `RoleVisibilityRearmState::queue_loss_pass` count metric (not currently exposed) or, until then, watch `visible_losses` in `/health`'s visibility metrics — a spike of `visible_losses` larger than the number of actually-changed ships, coincident with auth changes, confirms this churn.

### 3.3 `update_network_visibility` runs at 10 Hz, spatial refresh at 60 Hz

The membership update is intentionally rate-limited. For two clients approaching each other, this means up to 100 ms between "you crossed into AOI" and "you actually receive the spawn". Combined with one Lightyear send tick on top, total time-to-see is ~100–200 ms on a healthy localhost.

This is by design (avoid `update_network_visibility` running every fixed tick), but at the M1 target client count is fine. It will need to be reconsidered for combat-density scenes where 100 ms can hide a relevant projectile.

### 3.4 Default `ClientLocalViewMode = Tactical`

`bins/sidereal-replication/src/replication/visibility/membership.rs:215` defaults new clients to `Tactical` view mode if they have not sent a `ClientLocalViewModeMessage`. The client must explicitly send a view-mode message to switch. Verify that the client actually sends one on entry; if not, the server treats it as Tactical and the `Map` fast-paths (owner-in-map shortcut at `membership.rs:880..887` and the dead `Map` branch in `build_candidate_set_for_client`) never apply, but the visibility contract remains correct.

There is no `Default` mode used by the server; the enum is `Tactical | Map`. That matches the contract; ensure the client never inadvertently leaves view-mode unset during character switching or refocus, because the server stale-entry filter only retains live-client entries.

### 3.5 Observer anchor schedule

`update_client_observer_anchor_positions` runs in **FixedPostUpdate** (`plugins.rs:182`), not Update — good. That means visibility runs at 10 Hz Update reads an observer position last updated at the most recent fixed tick (worst case one server tick stale, ~16 ms). Acceptable.

Edge case: if `controlled_entity_map.by_player_entity_id.get(&player_id)` returns `Some` but the entity is despawned in the same tick, `anchor_positions.get(...)` fails and the function does not write anything for that player. The previous observer position remains in `ClientObserverAnchorPositionMap`. That is the right behavior (use last-known) but should not be relied upon long-term — it would mask a despawned-controlled-entity bug.

### 3.6 Worklist always evaluates active players' owned entities

`build_visibility_apply_worklist` and `build_visibility_cell_dirty_apply_worklist` (`context_cache.rs:1133..1209`) explicitly include `owned_entities_by_player[active_player_id]`. So an active player's own ship is always processed for every visibility pass, regardless of dirty-cell tracking. This is the right safety rail and means the symmetric-visibility fix in 2c71348 should reach the apply path even in the cell-dirty worklist mode.

### 3.7 Same-GUID role transitions still rely on staged rearm

The 2026-04-28 staged-rearm fix is preserved (`control.rs:856..895`). The risk surface is now:

- If `RoleVisibilityRearmState::SUPPRESS_MEMBERSHIP_PASSES = 1`, the role loss is suppressed for exactly one Update visibility pass. The visibility pass runs at 10 Hz; the rearm is queued from Update (every frame). If two role changes happen between visibility passes, the second one's loss can be queued before the first one's suppression has aged out. Verify by adding a metric for `pending_loss_passes.len()` snapshots before and after each visibility pass; if it never exceeds the number of ships, the model holds.

## 4. Findings — Rubber Banding / Lag

The investigation could not reproduce live with this audit, but the code review surfaces these candidates ranked by likelihood. Use §1.1 to choose between them.

### 4.1 Most likely: client presentation/timeline lag, not server lag

Evidence in favor:

- Server has explicit `fixed_tick_over_budget_total` and the recent server-side stable-input neutralization should keep `fixed_tick_wall_ms` flat.
- `Stage Age (sidecar)`, `Stage Age (history)`, `Stage Dlt`, `Auth Gap`, and `Stall Tick` exist precisely to catch this and have been used in earlier captures.
- `enforce_motion_ownership_for_world_entities` is dirty-gated and time-throttled (default `0.1 s`); it should not cause per-frame churn under steady flight.

What to confirm at runtime:

- Single-player: `fixed_tick_over_budget_total` ≈ 0 and `input_drops_total` ≈ 0 while user feels rubber band. If true, the server is healthy and the issue is on the client side.
- On the client side, watch `Stall Tick` and `Stage Age`. A nonzero `Stall Tick` with the corresponding sidecar/history `Stage Age` spike correlates the user-visible snap with a frame stall, not with server lateness.

### 4.2 Possible: `fixed_input_delay_ticks` default drifted from 2 to 3

`bins/sidereal-client/src/runtime/resources.rs:832` defaults the input delay to 3 ticks (50 ms at 60 Hz). `docs/features/reference/prediction_runtime_tuning_and_validation_reference.md` 2026-03-22 note still says `2`. The change happened in `e5f114a client: bound prediction lead during focus churn`. With higher input delay, the predicted entity is reacting to slightly older input than the user expects, which can feel like "the ship is sluggish" rather than rubber banding but contributes to perceived input lag.

Action: confirm the doc note (it is stale), and decide whether the live default should be `2` or `3`. If it stays `3`, document why (the focus-churn note implies a stability tradeoff; that rationale should be in the doc).

### 4.3 Possible: `apply_predicted_input_to_action_queue` does not gate `is_in_rollback`

`bins/sidereal-client/src/runtime/motion.rs:76..108` runs in FixedUpdate before `SiderealSimulationSet::SimulateGameplay`. It does not check `is_in_rollback`. With input rollback `Disabled`, `ActionState<PlayerInput>` is the "current" action state during rollback resimulation — not the historical state at the replayed tick. The system writes that current state into `ActionQueue`, which the simulation systems then consume.

This is deliberate (input is not rolled back), but it has two side effects worth verifying:

- The non-active-entity cleanup branch (`commands.entity(entity).remove::<(InputMarker<PlayerInput>, ActionState<PlayerInput>, SimulationMotionWriter)>();`) fires during rollback resimulation too. If an entity transiently has those markers during rollback for any reason, they get removed. Should be a no-op in practice; verify with a test.
- During rollback, the action queue is rewritten each FixedUpdate cycle with current intent. Combined with `process_flight_actions` running in the shared simulation, the predicted state during replay reflects "current input applied since `confirmed_tick`", which is the intended behavior but means thrust/turn changes show up immediately after a server correction. If the user observes "ship snaps to a different rotation that takes a moment to recover from", this is the mechanism (correct, but worth understanding).

### 4.4 Possible: prediction lead vs confirmed-state lag mismatch

With `max_predicted_ticks = 30` (~500 ms at 60 Hz), `fixed_input_delay_ticks = 3` (~50 ms), and `max_rollback_ticks = 100` (~1.67 s), the budgets are fine for localhost. But two design-time concerns:

- Lightyear fork retains 512 input ticks (~8.5 s), so input-history exhaustion is not the rubber band source.
- The state rollback mode is `Check`, not `Always`. Per the 2026-04-28 note, `Always` was previously aborting hundreds of negative rollbacks per second (confirmed-state ahead of local timeline) and producing visible snapback. Keep `Check` as the default; document this explicitly in `prediction_runtime_tuning_and_validation.md` (the doc currently says it "remains available for focused diagnostics" but the env default is `Check`).

### 4.5 Possible: focus-stall hard resync visible during dev/test

`resync_after_s = Some(1.0)` is default-on. Any focus loss longer than 1 s queues a hard resync. The next focus regain calls `seed_controlled_predicted_motion_from_confirmed` (`motion.rs:180`), which rebuilds `Position`/`Rotation`/`LinearVelocity`/`AngularVelocity`/`Transform`/`PredictionHistory<*>` from confirmed state.

If a developer alt-tabs often (or the OS yanks focus, e.g., a notification or screen lock), every regain triggers a visible snap. This is expected behavior for the MMO (the 2026-04-29 reasoning that "after a long enough stall, replaying local prediction history is the wrong recovery model"), but it is easy to misattribute to "server is behind". Make sure `Stage Age` confirms this case before chasing other root causes.

## 5. Findings — Server "Falling Behind"

### 5.1 No evidence of authoritative server simulation lag in the codebase

The server fixed-tick path has the right gates: `fixed_tick_wall_ms` is sampled, `fixed_tick_over_budget_total` is exposed, stale-input neutralization protects against runaway thrust, and persistence/tactical/scripting/diagnostics lanes are throttled and budgeted (`runtime_lanes.rs`).

The only place the server can legitimately fall behind is:

- The Update-lane work that piggybacks on the same thread. `reconcile_control_replication_roles` (Update, uncapped) is dominated by the inner loop over bound clients × controlled entities. With single-digit clients and ships, this is microseconds. With many ships, it scales linearly.
- The visibility AOI lane (`update_network_visibility`) at 10 Hz. The `apply_worklist_soft_budget` exists to flag this.
- The persistence lane (`flush_simulation_state_persistence`) at 2 Hz.

Authoritative simulation runs in FixedUpdate/FixedPostUpdate, mostly independent. The most likely server-side amplifier of "feels behind" is the role-rearm churn in §3.2: when a client joins, the server queues `rearm_visibility_tree_for_role_change` closures that on the next visibility pass run `lose_visibility` for every visible client for every ship under the rearmed root. That is observer-visible as a flicker/lag spike but is *not* the authoritative simulation being slow.

### 5.2 Replication group send frequency

Per `visibility_replication_contract.md` 2026-05-09 note, `SIDEREAL_REPLICATION_GROUP_*_SEND_HZ` overrides are disabled by default and Lightyear sends per-tick by default. That keeps owner correction timely. No change recommended without a live capture proving the bandwidth headroom.

### 5.3 Replication send metrics observer

The fork-side `c2db90da Add replication send metrics observer` patch is present and Sidereal already exposes the resulting fields (`bandwidth_limited_messages_total`, queued/sent payload bytes per channel) via `network_metrics.rs`. Captures should record these — `bandwidth_limited_messages_total > 0` is the canonical signal for replication-side backpressure.

## 6. Recommendations

### 6.A Safe cleanup (can land independently, low risk)

1. **Remove the dead `_view_mode` parameter from `build_candidate_cells_for_client`** (`spatial_index.rs:82`). Also remove the now-dead `Map`-mode early branch in `build_candidate_set_for_client` (`spatial_index.rs:124`) and the parameter from `build_candidate_set_for_client`. Update the call sites in `membership.rs:281..339` and the tests in `metrics.rs`. Net: clearer code, no behavior change.

2. **Update `prediction_runtime_tuning_and_validation.md`** 2026-03-22 note to reflect the current `SIDEREAL_CLIENT_INPUT_DELAY_TICKS=3` default and the reason recorded in commit `e5f114a`. Same doc: add an explicit note that `SIDEREAL_CLIENT_ROLLBACK_STATE` defaults to `Check` (the file already says `Check`, but the most recent dated note narrates the previous "`Always`" period and is easy to misread).

3. **Document the deliberate "input is not rolled back" behavior** as a single short comment near `apply_predicted_input_to_action_queue` (`runtime/motion.rs:76`). The behavior is correct; the comment removes the temptation for a future contributor to add `if is_in_rollback { return; }`.

### 6.B Probable wins to evaluate after capture

4. **Skip `reconcile_control_replication_roles` work when bindings have not changed.** Cache a small hash of `bindings.by_client_entity` (count + sorted list of `(client_entity_bits, player_wire_hash)`) in a `Local<u64>` and early-return when unchanged. The per-frame work is currently a `format!("{target:?}")` per controlled ship; under steady state with no auth changes, this is wasted work and (more importantly) it gates the closure-queue path that triggers rearm.

5. **Stop using a manual observer list that changes whenever any client connects.** Either:
   - Switch `observer_interpolation_target` to `InterpolationTarget::to_clients(NetworkTarget::AllExceptSingle(owner_peer_id))`. This is server-stable across other-client churn — Lightyear evaluates membership per-send. **Caveat**: the existing comment at `owner_interpolation_target` calls out that `Manual(client_entity)` is preferred over `NetworkTarget` to avoid `PeerMetadata` lookup races during handoff. Confirm whether the same concern applies to the observer side; if so, an alternative is to keep manual but only re-insert when the set actually grew/shrunk (compare sorted `Vec` length first, then content).
   - Or keep manual but guard the comparison/insert with a per-ship `Local` HashMap so identical lists never re-insert. Either approach eliminates the systematic rearm-on-every-join symptom.

6. **Add a metric for `RoleVisibilityRearmState::queue_loss_pass` counts.** Expose to `/health` as `visibility_role_rearm_loss_passes_total` so captures can quantify §3.2 directly.

7. **Increase `SIDEREAL_VISIBILITY_AOI_HZ` to ~20 Hz for development.** The 10 Hz cadence is fine for steady-state load but doubles the worst-case "I just walked into AOI but my ship has not appeared yet" window. Validate `apply_ms` stays well under `visibility_aoi_budget_ms` before changing the production default.

### 6.C Speculative (need evidence first)

8. **Confirm `update_client_observer_anchor_positions` always finds a position when controlled entity exists.** Add a debug-level diagnostic if `controlled_entity` is present but `anchor_positions.get(...)` returns `Err` — this should never happen and indicates a despawned-but-mapped entity.

9. **Confirm `enforce_motion_ownership_for_world_entities` only marks `dirty` when needed.** The current `mark_motion_ownership_dirty_signals` (`motion.rs:42..70`) marks dirty on `session.is_changed()`, `player_view_state.is_changed()`, any added `WorldEntity`, or any changed physics setup. Under streaming/AOI churn, this can mark dirty every frame. If so, the throttling fall-through (`reconcile_interval_s = 0.1`) still saves us, but the dirty signal could be tightened to compare actual control target/predicted-entity identity instead of any `WorldEntity` add.

10. **Add an integration test for symmetric two-client visibility** that validates the 2c71348 fix end-to-end, not just at the policy unit-test level. The existing `two_headless_clients_receive_remote_motion_diagnostics` test confirms motion flows but does not exercise viewports smaller than scanner range. A new test should:
    - Spawn two headless clients with `delivery_range_m < scanner_range_m`.
    - Place ships within scanner range of each other.
    - Wait one visibility AOI cycle plus a Lightyear send tick.
    - Assert both clients receive the other client's replicated ship root entity.
    - Assert membership cache lists both clients as visible to each other's ship.

### 6.D Lightyear fork follow-up — none required from this audit

The fork pin `0192db9c` is current and the relevant patches (input history 512, interpolation convergence `#1451`, UDP backpressure, replication send metrics, host-server change-tick hygiene, Avian2D f64, lossless motion deltas/keyframes, selected upstream input/sync fixes #1471/#1479/#1473/#1474, and retained-delta-base fallback) are all in place. Sidereal-side validation has been captured in `lightyear_upstream_issue_snapshot.md` 2026-05-21 note. If §6.B fixes do not resolve the visibility flicker after a 2-client capture, the next candidate is upstream `#1450`/`#1451` (interpolated entities not converging when `ConfirmedHistory` collapses); validate with the existing fork patch under a capture of a brief packet-loss simulation rather than re-patching.

A separate, project-agnostic fork follow-up is open in `prediction_runtime_tuning_and_validation.md` for first-class component-class send-frequency control. That is not blocking this audit and not in scope here.

## 7. Native and WASM Impact

- This document does not change code. No native, no WASM impact yet.
- Recommendations in §6.A are documentation/dead-code only; native impact zero, WASM impact zero.
- §6.B (skip-when-unchanged + observer-target stability) is server-side only; native impact: less visibility flicker on join/leave; WASM impact: same (server change).
- §6.C.10 (integration test) adds test-only code under `bins/sidereal-replication/tests/`; native impact: none in production; WASM impact: none.

## 8. Quality Gates Run for This Audit

```text
cargo fmt --all -- --check                                 EXIT=0
CARGO_INCREMENTAL=0 cargo check -p sidereal-client         EXIT=0
CARGO_INCREMENTAL=0 cargo check -p sidereal-replication    EXIT=0
CARGO_INCREMENTAL=0 cargo test -p sidereal-replication     EXIT=0  (227 tests, 0 failures, transport_lightyear_e2e ~61s)
```

WASM and Windows target builds were not run for this audit because no client code was touched. They must be run before landing any of the §6.B/§6.C recommendations that touch client code (they target server code only, but the AGENTS.md rule still applies if a follow-up patch touches the client).
