# Runtime Optimization and Scalability Plan - 2026-04-29

Status: Implemented
Lifecycle: completed
Category: plan
Last updated: 2026-07-05
Owners: implementation owners
Scope: Runtime Optimization and Scalability Plan - 2026-04-29.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

Primary references:

- `docs/architecture/sidereal_design_document.md`
- `docs/decision_register.md`
- `docs/features/active/visibility_replication_contract.md`
- `docs/features/reference/prediction_runtime_tuning_and_validation_reference.md`
- `docs/features/active/asset_delivery_contract.md`
- `docs/reports/audits/bevy_2d_rendering_optimization_audit_2026-04-23.md`
- `docs/reports/audits/client_server_network_audit_2026-04-23.md`
- `docs/reports/audits/gateway_replication_client_full_audit_2026-04-27.md`
- `docs/plans/completed/server_authoritative_tactical_scanner_and_contact_index_plan_2026-04-27.md`
- `docs/plans/proposed/spatial_partitioning_implementation_plan_2026-03-04.md`
- `docs/plans/superseded/multiplayer_prediction_interpolation_reliability_plan_2026-03-15.md`
- `docs/plans/completed/control_handoff_input_prediction_stabilization_plan_2026-04-27.md`

## 0. Status Notes

2026-05-06:

- Phase 4 dashboard visual diagnostics update: replication now maintains a bounded aggregate `SpatialPartitionSnapshot` from the live visibility spatial index and sector lifecycle registry, exposes it through the loopback health diagnostics server at `/spatial-partition`, and lets the gateway/dashboard proxy it behind `dashboard:brp:proxy` for an optional `/game-world` spatial zones overlay. The snapshot is aggregate-only cells/sectors/regions geometry, counts, lifecycle state, migration/dirty diagnostics, and truncation flags; it excludes entity membership, raw Bevy `Entity` IDs, private component payloads, and graph persistence data. Native impact: replication diagnostics/dashboard only. WASM impact: dashboard/browser tooling only, no client gameplay runtime change. This is read-only visualization and does not change candidate generation, authorization, delivery, redaction, lifecycle transitions, persistence, hydration, or runtime removal.

2026-05-01:

- Phase 2 prediction/cadence decomposition update: client Phase 0 diagnostics now expose controlled tick-stage deltas separately from the all-active and post-authority `Ctrl TickGap` lanes. The F3 overlay includes `Stage Dlt` (`confirmed sidecar - confirmed history`, `prediction history - confirmed sidecar`, and `local timeline - prediction history`), the native Phase 0 capture status log emits `phase0_sidecar_to_history_delta_last`, `phase0_prediction_to_sidecar_gap_last`, and `phase0_local_to_prediction_delta_last`, and `scripts/capture_phase0_dense_baseline.sh` reports the last observed values. This is measurement-only and preserves Lightyear-owned prediction/reconciliation; no Sidereal transform repair shim, cadence workaround, or authority change was introduced.
- Phase 2 prediction/cadence lane-age update (2026-05-01): client Phase 0 diagnostics now record wall-clock staleness for the controlled entity's confirmed history tick, confirmed sidecar tick, and prediction history tick. F3 shows `Stage Age`, the native Phase 0 capture status log emits `phase0_confirmed_history_tick_age_ms`, `phase0_confirmed_sidecar_tick_age_ms`, and `phase0_prediction_history_tick_age_ms`, and the dense capture summary reports the last observed values. This is measurement-only and helps separate a stale confirmed/network lane from delayed client application or presentation stalls. Native/WASM impact: shared client diagnostics only; no target-specific branch, prediction/reconciliation behavior, transform repair shim, authority change, or asset/visibility behavior changed.
- Phase 2 nameplate target-cache update: client nameplate sync now maintains a sorted dirty target cache from `WorldEntity`/`CanonicalPresentationEntity`/`HealthPool` add/remove signals instead of collecting and sorting every eligible entity each frame. Stable frames with matching active nameplates now fast-skip allocation/release work, while position projection and health-fill updates remain in the existing post-update presentation pass. F3 and Phase 0 capture logs expose `nameplate_target_full_scans_last`, dirty add/remove counts, and `nameplate_sync_fast_skips_last` so dense captures can prove stable nameplate sync is quiet. Native impact: shared client UI optimization only. WASM impact: shared client code only; no target-specific branch, prediction behavior, asset delivery contract, or authoritative state path changed.
- Phase 3 owner-manifest read-model update: server owner asset manifest streaming now maintains an indexed owner read model instead of scanning all controllable owned entities on every stream pass. The read model does a one-time full rebuild, then processes only dirty owned-asset candidates, relevant component removals, and player control-target map changes. Manifest entry `updated_at_tick` remains stable on semantic no-ops, and snapshots/deltas still use the existing manifest protocol. Replication summary logs and the capture harness now expose `owner_manifest_metrics`, read-model owner/entry counts, dirty candidates, upserts/removals/no-ops, and snapshot/delta counts. `data/debug/phase0_baseline/phase0_headless_summary_20260430_183854.txt` completed with `baseline_complete=true`, `owner_manifest_metrics=5`, `owner_manifest_read_model_full_rebuilds_total_last=1`, `owner_manifest_read_model_entries_last=26`, `owner_manifest_read_model_dirty_candidates_last=4`, `owner_manifest_read_model_upserts_last=0`, `owner_manifest_read_model_removals_last=0`, and zero input drops after bootstrap. Native/WASM impact: replication-server-only; no client protocol, asset delivery, prediction, visibility authorization, or payload redaction behavior changed.
- Phase 3 tactical membership-churn dirty maintenance update: tactical authoring cache maintenance no longer rebuilds the full contact authoring/index read model just because the visibility pass reported any gain/loss. Membership churn is now handled through `Changed<ReplicationState>` dirty entities, while empty caches, active-client changes, and tactical index cell-size changes still force rebuilds. Tactical summary logs and dense captures expose `authoring_dirty_replication_state`, `tactical_authoring_full_rebuild_count_last`, and `tactical_replicated_scans_last` so the next dense run can prove visibility churn does not reintroduce broad tactical scans. Native/WASM impact: replication-server tactical read-model maintenance only; tactical protocol, scanner authority, visibility authorization, redaction, prediction, and asset delivery are unchanged.
- Phase 3 owner-manifest health update: the owner manifest read model now deduplicates same-frame dirty/removal candidates into one final-state pass, and `/health` exposes the same read-model and stream counters that were previously only available in summary logs/capture output. This keeps owner-manifest scalability measurements aligned with visibility and tactical health snapshots. Native/WASM impact: replication-server diagnostics only; no manifest protocol, client behavior, authority, visibility, prediction, or asset-delivery behavior changed.
- Phase 4 spatial migration event-queue update: incremental spatial index movement now records a per-frame read-only migration event for each entity crossing a visibility cell, sector, or region, including previous/next cell, sector, and region keys. Visibility summaries, health JSON, and the dense capture harness now expose `spatial_migration[last_cell/last_sector/last_region/total_cell/total_sector/total_region/events_last/events_total]` plus `visibility_spatial_migration_events_*`. This is the first downstream queue needed for cell-owned membership diffs and cell streaming, but it is still diagnostic-only and does not drive replication policy, unload, hydration, authority widening, payload redaction, or transform repair.
- Phase 4 hydration-interest preflight update: sector lifecycle diagnostics now have a default-off hydration preflight behind `SIDEREAL_SECTOR_LIFECYCLE_HYDRATION_PREFLIGHT_ENABLED=1`. It derives observer-interest sectors from server-side candidate cells and reports how many `ColdPersisted` sectors would need graph hydration, plus sectors already marked `Hydrating`, as `sector_hydration_preflight[enabled/interested_cold_persisted/already_hydrating]` and matching health/capture fields. This is a measurement hook for the later graph-hydration worker only; it does not load records, respawn entities, widen authority from client free-roam/camera state, alter membership, change delivery, or change payload redaction.
- Phase 2 overlay pooling update: tactical map markers and tactical sensor-ring elements now hide/reactivate keyed presentation entities instead of despawning them on overlay close or transient contact disappearance. F3 and Phase 0 capture logs split `hidden`/`reactivated` counts from true spawns/despawns so dense-area runs can prove map/ring toggles are reusing warmed Bevy entities and SVG/material handles. Native impact: client presentation only. WASM impact: shared client code only; no prediction, replication, visibility, asset delivery, or authoritative-state behavior changed.
- Phase 5 shared gameplay-sim instrumentation update (2026-05-01): `apply_engine_thrust` now records shared `FlightRuntimePerfCounters` for duration, controlled roots, engine modules, fuel tanks, force/kinematic body scans, requested-burn parents, thrust-budget parents, and actuator-state parents. `recompute_total_mass` now records `MassRuntimePerfCounters` for duration, dirty roots, roots/modules/inventory scans, clean sync roots, and clean fast skips. The replication health snapshot and dense capture harness expose these as `gameplay_apply_engine_*`, `gameplay_mass_*`, and `gameplay sim metrics` log lines. A no-control flight fast path preserves actuator cleanup while skipping fuel/body aggregation when no entity owns `FlightControlAuthority + SimulationMotionWriter`; clean mass ticks now sync only changed/newly hydrated Avian mass/inertia rows instead of walking every clean root every fixed tick. Native impact: shared gameplay diagnostics plus behavior-preserving fast paths. WASM impact: shared gameplay code only; no target-specific branch, prediction ownership change, transform repair shim, or asset/visibility contract change.
- Phase 2/4 streamed material update-churn reduction (2026-05-01): world-sprite shader lighting updates now compare the existing per-entity material uniforms before taking a mutable material handle, so unchanged lighting/rotation does not mark the material asset dirty every frame. F3 and Phase 0 capture logs expose `streamed_visual_lighting_update_candidates_last`, material updates, no-op skips, and last/max update milliseconds. This preserves per-entity material handles because lighting and rotation remain entity-specific; it deliberately does not pool shader materials across entities. Native impact: client presentation only. WASM impact: shared client code only; no prediction, replication, visibility, authority, or asset delivery behavior changed.
- Phase 2 prediction/cadence stall-frame correlation update (2026-05-01): client Phase 0 diagnostics now sample raw sidecar `Ctrl TickGap`, post-authority tick gap, and update-delta milliseconds on frames that cross the runtime stall threshold. F3 shows `Stall Tick`, native Phase 0 capture logs emit `phase0_stall_frame_*`, and `scripts/capture_phase0_dense_baseline.sh` reports last/max observed stall-frame values. This is measurement-only and is intended to prove whether dense-area confirmation gaps grow during client update stalls; it does not add transform repair, prediction repair, authority widening, or replication-cadence changes.
- Phase 4 sector hydration executor update (2026-05-01): persistence-backed sector lifecycle now has a default-off hydration executor behind `SIDEREAL_SECTOR_LIFECYCLE_HYDRATION_ENABLED=1`. It starts from server-derived observer-interest sectors only, transitions `ColdPersisted -> Hydrating`, loads graph records in a background reader, filters by persisted world position/sector key, hydrates through the existing generic graph component path, and finishes as Hot or Warm based on current server interest. Failed or empty reads return to `ColdPersisted`. Visibility summary logs, health JSON, and the capture harness expose `sector lifecycle hydration metrics` and `visibility_sector_hydration_*`, including last offline-progression seconds from `last_simulated_at_s`. This is server-only and default-off; it does not use client camera/free-roam state, does not persist raw Bevy `Entity` IDs, does not widen authority, and does not change visibility authorization, delivery, payload redaction, prediction, or asset delivery.
- Phase 4 persisted sector metadata/offline-progression update (2026-05-01): sector flush records now carry server-only graph-record metadata for `sector_key_x`, `sector_key_y`, `sector_last_simulated_at_s`, and `sector_epoch` before transactional persistence writes. Hydration uses persisted sector keys when present, falls back to persisted f64 world position for older records, and computes offline-progression measurement from the newest persisted `sector_last_simulated_at_s` in the hydrated record set. Unit coverage verifies that metadata does not persist raw Bevy `Entity` IDs, that persisted sector keys override position-derived buckets, that invalid timestamps are ignored, and that negative timestamps are clamped on write. Native/WASM impact: replication-server persistence metadata only; no visibility authorization, delivery, payload redaction, prediction/reconciliation, client camera/free-roam authority, or asset-delivery behavior changed.
- Phase 4 dirty-cell membership worklist update (2026-05-01): the visibility spatial index now tracks cells dirtied by cell membership changes and by effective visibility position/extent changes, while observer candidate refresh tracks cells whose interested observer set changed. A default-off worklist path behind `SIDEREAL_VISIBILITY_USE_CELL_DIRTY_WORKLIST=1` can build apply work from dirty cells plus current visible, mandatory, active owned, and deferred-gain entities, then still runs the existing policy checks. Visibility summary logs, health JSON, and the capture harness expose `visibility cell dirty worklist metrics` and `visibility_cell_dirty_worklist_*` so captures can compare it against the candidate-reverse worklist before defaulting it. Native/WASM impact: replication-server-only and default-off; no authorization, delivery, redaction, prediction, transform, or asset behavior changes on the default path.
- Phase 4 dirty-observer membership reverse-index update (2026-05-01): the default-off cell-dirty worklist now maintains a reverse visible-membership index (`client -> visible entities`). In opt-in cell-dirty mode, stable observer/cell changes re-evaluate dirty cells plus entities visible to dirty observers instead of every currently visible entity; broad visible-member inclusion is reserved for structural entity/client-context changes that can invalidate visibility outside dirty cells. Unit coverage verifies that clean-client visible entities are skipped by the scoped path and included only by the structural fallback. Native/WASM impact: replication-server-only, default-off. Authorization, delivery, payload redaction, role rearm, prediction, transform authority, and asset delivery remain unchanged.
- Phase 4 default promotion update (2026-05-09): the cell-dirty worklist is now the default AOI apply path after runtime-policy-dirty, deferred-gain, dirty-cell, dirty-observer, mandatory-policy, and active-owned inclusion coverage plus a short native headless MMO load gate run. `SIDEREAL_VISIBILITY_USE_CELL_DIRTY_WORKLIST=0`, `false`, or `off` remains available for rollback/comparison captures. Native/WASM impact: replication-server work selection and load diagnostics only; authorization, delivery, payload redaction, protocol shape, prediction, transform authority, and asset delivery are unchanged.
- Phase 2 streamed visual lifecycle update (2026-05-01): the streamed visual image/procedural cache is now an explicit client runtime resource instead of a hidden system-local cache, and Phase 0 capture logs/F3 diagnostics expose decoded image creates, procedural image creates, shader material creates, cache entry counts, pending procedural generations, and family-seed cache candidates. Procedural asteroid cache keys now reuse generated images when the replicated `ProceduralSprite.family_seed_key` makes the generated content independent of runtime entity GUID; GUID-seeded sprites keep per-entity cache identity. Native impact: client presentation/cache diagnostics plus behavior-preserving cache reuse for shared procedural seeds. WASM impact: shared client code only; no asset payload delivery, replication transport, prediction, authority, or transform behavior changed.
- Phase 5 shared flight/IFCS tick-churn update (2026-05-01): `apply_engine_thrust` now avoids dirtying `PropulsionActuatorCommand` and `PropulsionActuatorState` when the computed inactive/allocated values are unchanged, and it skips unrelated fuel-tank and body-kinematics/body-force aggregation for roots that do not currently own `FlightControlAuthority + SimulationMotionWriter`. Health JSON, gameplay summary logs, and dense captures expose actuator command updates, actuator state updates, and actuator no-op skips. Native impact: shared gameplay hot-path reduction with behavior-preserving no-op writes. WASM impact: shared gameplay code only; no target-specific branch, authority change, transform repair shim, or prediction/reconciliation ownership change.
- Phase 5 script intent application update (2026-05-01): runtime script intents now build one `EntityGuid -> Entity` target index per pending-intent batch and then apply intents by direct entity lookup, replacing the previous per-intent scan over all script-capable entities. Controllability validation and the intent-only Lua authority boundary are unchanged; scripts still do not write authoritative transforms/velocities. Replication health exposes `lua_runtime.last_intent_apply_ms`, `last_intent_count`, `last_intent_target_index_entities`, `last_intent_target_misses`, `last_intent_uncontrollable_targets`, and `intent_apply_runs`. Native impact: replication-server scripting hot path changes from O(entities * intents) to O(entities + intents) per batch. WASM impact: no client-side scripting, protocol, prediction, transport, or asset-delivery behavior changed.
- Phase 5 collision bootstrap scan-reduction update (2026-05-01): `bootstrap_root_dynamic_entity_colliders` now queries only root entities that still lack an Avian `Collider` and already have `SizeM`, `CollisionProfile`, and `RigidBody`, instead of revisiting every sized root body after colliders are attached. Shared `CollisionRuntimePerfCounters`, replication health JSON, `gameplay sim metrics`, and dense capture summaries expose collider bootstrap duration, candidates, inserted colliders, and skipped non-collidable roots. Unit coverage verifies the system goes quiet for already-bootstrapped collidable entities while continuing to report intentional non-collidable roots. Native impact: shared gameplay post-update scan reduction and diagnostics. WASM impact: shared gameplay code only; no authority, prediction, transform repair, asset delivery, visibility policy, or gameplay collision behavior change.
- Phase 5 sector simulation-tier telemetry update (2026-05-01): persistence-backed sector lifecycle now derives diagnostic background-simulation tier counts aligned with DR-0033: `Hot` sectors are `FullRuntime`, `Warm` and `ColdPendingFlush` sectors are `ReducedCadence`, `ColdPersisted` sectors are `PersistedCold`, and `Hydrating` sectors remain a separate transition tier. Health JSON, `sector simulation tier metrics`, and dense capture summaries expose sector/entity counts per tier. This is telemetry scaffolding for future cadence scheduling only; it does not change gameplay system cadence, offline progression, promotion/demotion, visibility authorization, replication delivery, prediction, transform authority, or asset delivery.
- Broad validation update (2026-05-01): the current local implementation slice covers the remaining plan phases as instrumentation, behavior-preserving hot-path reductions, indexed read models, and default-off server streaming/lifecycle executors. Required gates passed locally: `cargo fmt --all -- --check`, `CARGO_INCREMENTAL=0 cargo check --workspace`, `CARGO_INCREMENTAL=0 cargo clippy --workspace --all-targets -- -D warnings`, `CARGO_INCREMENTAL=0 cargo check -p sidereal-client --target wasm32-unknown-unknown --features bevy/webgpu`, and `CARGO_INCREMENTAL=0 cargo check -p sidereal-client --target x86_64-pc-windows-gnu`. Production-default MMO policy changes remain intentionally gated: membership gain budgets, sector flush/removal/hydration, and background simulation tier scheduling must be promoted only after capture-based parity and starvation validation. The cell-dirty visibility worklist was promoted to default on 2026-05-09 with a rollback override. Native impact: validated on the native-focused workspace gates. WASM impact: shared client/gameplay code still compiles for the WebGPU WASM target.

2026-04-29:

- This document began as a planning audit only. Later dated bullets in this section record follow-up implementation and validation work against the plan.
- The requested source `removed March 2026 native runtime ownership audit` is not present in this checkout. The nearest available runtime, networking, and rendering audit reports listed above were reviewed instead.
- Current observed dense-area symptom to explain: around asteroid fields with roughly 150-200 nearby entities, the server appears to accept roughly 60 realtime inputs per second with zero drops and visibility query timings around 1-2 ms, while the client overlay can show `Ctrl TickGap` growing from a few ticks to 50+ ticks and the confirmed/server ghost visibly lags the predicted controlled entity.
- The current evidence points first at client-side replication processing, presentation work, or churn delaying confirmed state application. It does not prove raw entity count or server simulation overload. The first implementation phase must measure stage latency before optimizing.
- Latest control-stability finding: client control tag sync was re-granting `SimulationMotionWriter` outside the input authority path. Optimization work is blocked until a Phase 0a gate verifies that `SimulationMotionWriter`, `InputMarker<PlayerInput>`, and `ActionState<PlayerInput>` are owned only by the active input authority path.
- Added a dedicated persistence-backed sector lifecycle requirement for future server-side cell/sector streaming. Sector unload is server-only, must verify graph persistence success before despawning authoritative runtime entities, and must not be driven by client camera/free-roam state.
- Phase 0a implementation follow-up: client diagnostics now expose local authority markers and confirmed/prediction tick lanes, and the input-marker cleanup path is hardened to remove stray `SimulationMotionWriter`, `InputMarker<PlayerInput>`, and `ActionState<PlayerInput>` components in inactive/pending/no-session states.
- Phase 0a repro update: an empty-space native headless capture after the authority fix showed the active predicted controlled entity with `SimulationMotionWriter`, `InputMarker<PlayerInput>`, `ActionState<PlayerInput>`, and `FlightControlAuthority` present together through the input authority path, while non-controlled observed entities had none of those local authority components.
- Phase 0a dense repro update: `data/debug/phase0a/dense_headless_summary_20260429_160203.txt` captured a dense native headless run with 150 `asteroid_field_member` entities. The client received session-ready, the subsequent control request was acknowledged for controlled entity `036fe941-8a37-4be1-a440-fbde196e9867`, server auth binding succeeded, realtime input was received and applied by the server, and client motion diagnostics showed the active predicted controlled entity with `SimulationMotionWriter`, `InputMarker<PlayerInput>`, `ActionState<PlayerInput>`, and `FlightControlAuthority` present together while sampled non-controlled entities had none of those local authority components. This satisfies the dense asteroid/headless slice only; it does not exercise native presentation overlays.
- Phase 0a code-level acceptance update: focused Bevy system tests now cover the input authority path granting the local authority tuple only for the active focused predicted controlled entity, and removing `SimulationMotionWriter`, `InputMarker<PlayerInput>`, and `ActionState<PlayerInput>` during unfocused, recovery, hard-resync pending, camera-only free-roam, pending-control, and no-session states.
- Phase 0a windowed capture update: `data/debug/phase0a/windowed_phase0a_summary_20260429_163809.txt` captured the native presentation runtime with overlay off/on and focus loss/recovery. The run reached session-ready, acknowledged control for `036fe941-8a37-4be1-a440-fbde196e9867`, authenticated replication, collected overlay snapshots with the separated authority/tick diagnostics, showed the active focused controlled entity regaining `SimulationMotionWriter`, `InputMarker<PlayerInput>`, and `ActionState<PlayerInput>` together, showed the unfocused state with all three absent, and showed recovery restoring the tuple through the input authority path. Phase 0a is complete; dense-area profiling may begin next, but no optimization phase has started in this change.
- Phase 0 measurement scaffolding update: client runtime now has an always-on `ClientPhase0Diagnostics` resource that records local/confirmed/prediction tick lanes, rolling controlled `Ctrl TickGap` percentiles, and per-frame churn for `WorldEntity`, visibility adoption, Lightyear lane markers, streamed visual children, canonical presentation markers, and duplicate suppression markers. The debug overlay and native Phase 0a capture status log surface those counters even when overlay-driven candidate snapshots are unavailable. This is measurement-only; no spatial partitioning, presentation optimization, or prediction repair behavior has started.
- Phase 0 server measurement scaffolding update: replication tactical streaming now records stream duration, players considered/streamed, replicated entity scan count, exact/signal/landmark contact counts, contact budget truncation, contact snapshot/delta sizes, and fog snapshot/delta cell counts. It logs those counters when `SIDEREAL_REPLICATION_SUMMARY_LOGS=1` or `SIDEREAL_DEBUG_TACTICAL_STREAM_METRICS=1`. This is measurement-only and does not change tactical delivery policy, redaction, visibility authorization, or scanner behavior.
- Phase 0 input/message measurement update: replication realtime input diagnostics now separate messages received, latest-input acceptance, action-queue applies, receive duration, drain duration, receive-to-drain delay, and highest received/accepted/applied input ticks. Client diagnostics now separately measure Sidereal-owned tactical fog/contact message apply time, owner-manifest message apply time, tactical snapshot/delta counts, owner snapshot/delta counts, and tactical resnapshot requests. These counters are intended to distinguish server input handling, network/message arrival, client message application, and render/presentation delay before any optimization work starts.
- Phase 0 dense baseline harness update: `scripts/capture_phase0_dense_baseline.sh` now launches a local replication server plus native client against a real persisted player/control target, records headless or windowed capture logs under `data/debug/phase0_baseline/`, and reports explicit `baseline_complete`, session-ready, control-ack, auth, bootstrap-timeout, input, tactical, and client message-apply counters. The capture harness keeps the native Phase 0 repro in world during startup preload and suppresses the early bootstrap-timeout false positive once auth binding is in flight; it does not add prediction repair, transform repair, spatial partitioning, or presentation optimization.
- Phase 0 dense windowed baseline update: `data/debug/phase0_baseline/phase0_windowed_summary_20260429_084234.txt` captured 150 `asteroid_field_member` entities with overlay toggling and focus loss/recovery. The run exited cleanly with `baseline_complete=true`, `session_ready=2`, `control_ack=1`, `server_auth_bound=1`, `server_control_resolved=1`, `server_auth_denied=0`, `session_timeout=0`, and `bootstrap_timeout=0`. Server input summaries still showed roughly 60 accepted action-queue applies/sec with zero drops. Client-side evidence showed `phase0_churn_total_max=354`, `phase0_gap_max=47`, tactical receive max about 2.84 ms, and owner-manifest receive max about 0.13 ms in this run. This is the first valid windowed dense baseline for Phase 0; it is measurement evidence, not an optimization.
- Phase 0 overlay ergonomics update: native annotation callouts now live on a separate F4 debug layer so F3 can remain a readable numeric/text profiling overlay. Snapshot collection runs when either F3 or F4 is enabled. This is diagnostic presentation gating only; it does not change gameplay, prediction, replication, visibility, or transform ownership.
- Phase 1 tactical SVG prewarm quick win: `update_tactical_map_overlay_system` now skips marker SVG prewarm while the tactical map is fully hidden and gates prewarm work by asset reload generation, tactical contact revision, and the active controlled marker icon. The debug overlay and Phase 0 capture log expose `Tact SVG`/`tactical_icon_prewarm_*` run/skip, role, resolve, and timing counters so the next dense capture can prove whether the path is quiet between contact/icon revisions. This does not change tactical disclosure, visibility authorization, replication payloads, prediction, or asset delivery policy.
- Phase 1 post-change dense capture update: `data/debug/phase0_baseline/phase0_windowed_summary_20260429_092637.txt` completed with `baseline_complete=true`, 150 asteroid field members, overlay/focus toggles, authenticated control, and 11 `tactical_icon_prewarm_*` status lines. With tactical map mode still off, `tactical_icon_prewarm_runs=0` and `tactical_icon_prewarm_skips=0`, confirming hidden-map frames do not prewarm marker SVGs. A follow-up capture should set `SIDEREAL_PHASE0_TACTICAL_MAP_TOGGLE_AFTER_S` to exercise map-on prewarm dirty gating.
- Phase 1 tactical-map-on dense capture update: `data/debug/phase0_baseline/phase0_windowed_summary_20260429_093117.txt` completed with `baseline_complete=true`, `tactical_map_toggle=1`, focus loss/recovery, and 13 tactical SVG status lines. With map mode enabled, prewarm counters reached `tactical_icon_prewarm_runs=9`, `tactical_icon_prewarm_skips=2`, `tactical_icon_prewarm_roles_last=5`, and `tactical_icon_prewarm_resolved_last=5`; steady-state prewarm was roughly 0.05-0.07 ms, but the first map-on prewarm produced a 119 ms max and matched `tactical_overlay_max_ms=119.9`. This validates the dirty gate and identifies first-use SVG/material/mesh creation as the next client presentation spike to remove or shift out of the interactive frame.
- Phase 1 shared tactical SVG cache and marker diff update: tactical map and sensor ring now share the same marker SVG cache resource, tactical map marker drawing no longer synchronously resolves marker SVGs during the draw loop, prewarm is budgeted to one uncached icon role per run, and existing tactical map markers skip component inserts when `Svg2d` and `Transform` are unchanged. `data/debug/phase0_baseline/phase0_windowed_summary_20260429_101723.txt` completed with `baseline_complete=true`, `tactical_map_toggle=1`, and 14 tactical SVG status lines. The first-use tactical prewarm max dropped from 119.4 ms to 37.2 ms, `tactical_overlay_max_ms` dropped from 119.9 ms to 38.9 ms, and steady-state frames reported `tactical_marker_noop_skips_last=52` with no marker update inserts. Remaining work: move the one-role SVG parse/tessellate cost out of active gameplay entirely or replace synchronous SVG creation with an async/prebuilt lifecycle.
- Phase 1 tactical prewarm split update: tactical marker SVG prewarm now runs in a dedicated cache-prewarm system before the tactical map draw pass, includes default tactical icon bindings in the dirty signature, and leaves the draw pass cache-only. `data/debug/phase0_baseline/phase0_windowed_summary_20260429_102522.txt` completed with `baseline_complete=true`, `tactical_map_toggle=1`, 14 tactical SVG status lines, and steady-state `tactical_marker_noop_skips_last=52`. `tactical_overlay_max_ms` dropped again from 38.9 ms to 0.53 ms. The remaining one-role SVG parse/tessellate cost is now visible as `tactical_icon_prewarm_max_ms=26.86`, outside the tactical overlay draw timer; next work should move that cost into asset-loading/prebuilt GPU lifecycle or an async SVG preparation path.
- Phase 1 sensor-ring diff/counter update: sensor ring presentation now records element count, spawn/update/despawn/no-op counts, and last/max overlay duration in both F3 diagnostics and Phase 0 capture logs; the capture harness can toggle the ring with `SIDEREAL_PHASE0_SENSOR_RING_TOGGLE_AFTER_S`. Existing ring rect/SVG elements now update only changed material color, `Transform`, `Svg2d`, or visibility instead of reinserting full bundles every frame. `data/debug/phase0_baseline/phase0_windowed_summary_20260429_104054.txt` completed with `baseline_complete=true`, `sensor_ring_toggle=1`, and 16 sensor-ring status lines. First ring-open spawned 194 elements and cost 67.08 ms; once warm, frames settled to 193 no-op skips out of 194 elements with one changing element and roughly 1.6-2.5 ms ring update time. Remaining work: move first-use SVG/material creation into a prebuilt/async asset lifecycle and consider pooling/open-transition budgets if the ring must open during combat.
- Phase 1 nameplate health no-op update: nameplate health-fill width writes now skip unchanged percentages and expose `nameplate_health_noop_skips_last` beside update counts. `data/debug/phase0_baseline/phase0_windowed_summary_20260429_104633.txt` completed with `baseline_complete=true`; settled status lines show `nameplate_health_updates_last=0` and `nameplate_health_noop_skips_last=4`, confirming stable health bars are no longer rewritten every frame. This is presentation-only and does not alter health replication, authoritative state, visibility, or prediction.
- Phase 1 dirty-reason instrumentation update: asset dependency graph rebuilds now record dirty reason plus last/max rebuild duration, render-layer assignment records dirty entity count plus watched-component archetype/entity scan counts and last/max duration, and duplicate visual resolution records dirty GUID count, recomputed group count, and last/max duration. These counters are surfaced in the F3 debug rows and native Phase 0 capture status logs. Native impact: denser diagnostics for dense-area captures. WASM impact: shared diagnostic counters compile in the client crate but no browser transport, asset delivery, prediction, or runtime-default behavior changes are intended. This is diagnostic-only and does not change asset delivery, render-layer assignment policy, duplicate lane selection, prediction, visibility, or authoritative state.
- Phase 1 dirty-reason capture update: `data/debug/phase0_baseline/phase0_windowed_summary_20260429_115232.txt` completed with `baseline_complete=true`, F3 overlay on, tactical map toggle on, focus loss/recovery, and the new dirty-reason counters in every status line. In this run, asset dependency graph rebuild cost stayed under 0.71 ms and reported `streamed-visual` as the steady rebuild reason after startup, render-layer assignment stayed under 2.05 ms while scanning 22 watched-component archetypes and 2 watched entities, and duplicate visual resolution stayed under 3.0 ms while recomputing 1-3 dirty GUID groups per sampled frame. Tactical SVG prewarm remains the larger measured presentation spike at 24.37 ms max. This capture does not replace the prior dedicated sensor-ring run because the tactical-map toggle suppressed the ring open path.
- Phase 1 tactical SVG asset update: the Lua-registered `map_icon_asteroid_svg` source at `data/icons/asteroid.svg` was reduced from a complex 3.8 KB path to a 371 byte `bevy_svg`-compatible single-path icon, preserving the same logical asset ID, source path, generated catalog/checksum path, and authenticated HTTP delivery contract. A first attempt using SVG opacity triggered a `bevy_svg` group-isolation panic and was replaced with a solid-path asset. `data/debug/phase0_baseline/phase0_windowed_summary_20260429_115603.txt` completed with `baseline_complete=true`; tactical SVG prewarm max dropped to 10.94 ms from the previous 24-27 ms range, and tactical overlay max stayed below 0.82 ms. Remaining first-use prewarm cost likely includes the other map icon SVGs and should be handled by supported-SVG authoring constraints plus prebuilt/async SVG lifecycle work rather than Rust asset ID special cases.
- Phase 1 streamed visual instrumentation update: streamed visual attach/cleanup now records candidate counts, material path counts, missing/deferred counts, image cache hits/misses, procedural generation queue/completion/error counts, and last/max attach/cleanup durations. `data/debug/phase0_baseline/phase0_windowed_summary_20260429_120310.txt` captured the previously hidden dense-entry spike: first-use streamed visual attach reached 947.62 ms while the server still reported roughly 60 accepted inputs/sec with zero drops. This confirmed the dense-field issue was at least partly a client presentation stall, not raw server input loss.
- Phase 1 streamed visual budget update: streamed visual attachment is now capped by `SIDEREAL_CLIENT_STREAMED_VISUAL_ATTACH_BUDGET` (default 24) and procedural generation by `SIDEREAL_CLIENT_STREAMED_VISUAL_PROCEDURAL_BUDGET` (then synchronous default 1 during the first validation pass). `data/debug/phase0_baseline/phase0_windowed_summary_20260429_121352.txt` completed with `baseline_complete=true`; attach max dropped from 947.62 ms to 19.14 ms, proving the burst was smoothed, but one synchronous procedural asteroid generation still consumed roughly a frame on the main thread.
- Phase 1 async procedural visual update: procedural asteroid sprite generation now uses a bounded Bevy async compute queue, with `SIDEREAL_CLIENT_STREAMED_VISUAL_PROCEDURAL_BUDGET` defaulting to 4 queued jobs/frame and `SIDEREAL_CLIENT_STREAMED_VISUAL_PENDING_PROCEDURAL_BUDGET` defaulting to 8 in-flight jobs. The main thread polls completed image payloads, creates Bevy image handles, and attaches ready visuals without generating procedural pixels inside the presentation frame. `data/debug/phase0_baseline/phase0_windowed_summary_20260429_122010.txt` completed with `baseline_complete=true`; streamed visual attach max dropped to 2.84 ms, no procedural generation errors were reported, and later controlled tick-gap samples settled around 11-35 ticks after bootstrap/focus transitions.
- Phase 1 streamed visual cleanup dirty-gate update: streamed visual cleanup now skips the full parent scan unless the asset catalog or shader assignments changed, a relevant streamed visual/procedural/render-role component changed, or a relevant component removal was observed. `data/debug/phase0_baseline/phase0_windowed_summary_20260429_122330.txt` completed with `baseline_complete=true`; cleanup max dropped from about 7.08 ms in the previous async-generation capture to 2.14 ms, and stable cleanup samples stayed near 0.02 ms. The run still recorded `phase0_gap_max=642` at initial control bootstrap, where local time had advanced before confirmed sidecar history caught up and before the active input-authority tuple was present; later samples were back in the tens of ticks. This should be treated as a bootstrap diagnostic artifact unless reproduced after active `SimulationMotionWriter`/`InputMarker`/`ActionState` ownership is present.
- Phase 1 capture summary update: `scripts/capture_phase0_dense_baseline.sh` now includes `phase0_streamed_visual_status_lines` and a `latest_streamed_visual_status` tail so visual attach, procedural queue, and cleanup counters are available directly in the summary file without manually grepping the client log.
- Phase 1 post-authority TickGap metric update: client diagnostics now maintain a second rolling sidecar `Ctrl TickGap` lane that samples only when the runtime is focused, recovery is not suppressing input, and the active predicted controlled entity has the full local input-authority tuple: `SimulationMotionWriter`, `InputMarker<PlayerInput>`, and `ActionState<PlayerInput>`. The F3 overlay shows this as `Auth Gap`, the Phase 0 capture status log emits `phase0_post_authority_gap_*`, and `scripts/capture_phase0_dense_baseline.sh` reports both `phase0_gap_max_observed` and `phase0_post_authority_gap_max_observed`. Dense-area optimization decisions should use the post-authority lane when separating real active-control delay from bootstrap, pending-control, focus-loss, and recovery samples.
- Phase 1 post-authority dense capture update: `data/debug/phase0_baseline/phase0_windowed_summary_20260429_124148.txt` completed with `baseline_complete=true`, 150 asteroid field members, overlay toggle, and focus loss/recovery. The all-active lane still reported `phase0_gap_max_observed=665`, while the focused post-authority lane reported `phase0_post_authority_gap_max_observed=69` across 9 capture-log samples. Server input summaries continued to show roughly 60 accepted action-queue applies/sec with zero drops, streamed visual attach max was 2.51 ms, cleanup max was 2.08 ms, and tactical receive max was 5.49 ms. This confirms the new lane removes the bootstrap artifact but still shows an active-control confirmation gap worth investigating before server spatial work is used to explain client-visible lag.
- Phase 2 visibility fanout instrumentation update: replication visibility summaries now include apply-stage counters for entities with cache, per-client policy evaluations, candidate rejections/bypasses, visible evaluations, current and desired visible-client totals, policy entity buckets, and fast-path client counts. The dense baseline capture script also tails `replication visibility summary` lines. This is measurement-only and preserves the visibility contract; it is the evidence gate before replacing the broad membership apply loop with cell-owned membership diffs or observer query budgets.
- Phase 2 visibility fanout capture update: `data/debug/phase0_baseline/phase0_headless_summary_20260429_124718.txt` completed with `baseline_complete=true` and 150 asteroid field members. Visibility summaries reported roughly `query_ms=1.02-1.37`, `entities=202`, `candidates_per_client=201.0`, `occupied_cells=6`, `max_entities_per_cell=52`, `apply_entities_with_cache=202`, and `apply_client_policy_evaluations=194` for one connected client. This validates the new counters and shows the current dense test still fits in a few cells, so the next server scalability slice should measure and then reduce apply-stage client fanout under multi-client and multi-sector scenarios rather than treating the spatial candidate grid alone as complete.
- Phase 2 multi-client harness update: `scripts/capture_phase0_dense_baseline.sh` can launch extra headless clients and can bind them to distinct player entities with `SIDEREAL_PHASE0_EXTRA_PLAYER_ENTITY_IDS` plus optional `SIDEREAL_PHASE0_EXTRA_ACCOUNT_IDS` and `SIDEREAL_PHASE0_EXTRA_CONTROLLED_ENTITY_IDS`. Same-player extra clients are useful for duplicate-session/auth behavior only, not visibility fanout, because replication auth keeps one active visibility binding per player.
- Phase 2 client-binding telemetry update: replication visibility summaries and health snapshots now separate `live_client_entities`, `registered_client_bindings`, `active_registered_clients`, and `stale_registered_clients`. This is a measurement-only guard so fanout captures can prove whether connected sessions are actually participating in visibility membership before any spatial partitioning or cell-owned membership rewrite begins.
- Phase 2 distinct-player fanout capture update: `data/debug/phase0_baseline/phase0_headless_summary_20260429_211705.txt` ran one primary headless client plus one extra distinct player. It completed with `baseline_complete=true`, `server_unique_auth_players=2`, and visibility `client_bindings[live/registered/active/stale]=2/2/2/0`. With `SIDEREAL_VISIBILITY_CELL_SIZE_M=100`, candidate sets stayed small at `candidates_per_client=23.5`, but the broad apply path still performed `apply_client_policy_evaluations=389`, proving the next scalability target was the apply loop rather than authentication or candidate discovery.
- Phase 2 candidate-client reverse map update: visibility membership now builds a reverse `entity -> candidate clients` map and avoids per-client policy evaluation for non-candidate clients when the entity delivery extent is no larger than the configured cell envelope. Large delivery extents, including stellar light sources, keep the conservative evaluation path. The skipped work is exposed as `apply_non_candidate_policy_eval_skips`. The follow-up two-player capture `data/debug/phase0_baseline/phase0_headless_summary_20260429_212609.txt` completed with unchanged visible output totals (`apply_current_visible_clients_total=45`, `apply_desired_visible_clients_total=45`) while `apply_client_policy_evaluations` dropped from 389 to 42 and `apply_non_candidate_policy_eval_skips=347`. This is a first structural step toward cell-owned membership diffs, not the final sector/grid architecture.
- Phase 2 soft observer-budget telemetry update: visibility summaries and health snapshots now report per-observer candidate entity/cell maxima, total candidate cells, optional soft budget values, clients over budget, and total over-budget entity/cell counts. The env vars `SIDEREAL_VISIBILITY_OBSERVER_CANDIDATE_ENTITY_SOFT_BUDGET` and `SIDEREAL_VISIBILITY_OBSERVER_CANDIDATE_CELL_SOFT_BUDGET` are diagnostics only; they do not defer or cap delivery. `data/debug/phase0_baseline/phase0_headless_summary_20260429_224326.txt` validated the counters with deliberately low soft budgets, reporting `observer_candidates[entity_max/cell_total/cell_max]=39/98/49` and `observer_budget[entity/cell/exceeded_entity_clients/exceeded_cell_clients/entity_over/cell_over]=20/25/1/2/19/48` while keeping visible totals unchanged. This prepares the observer query budget/deferred delivery work without changing the visibility contract.
- Phase 3 tactical contact index first cut: `stream_tactical_snapshot_messages` now refreshes an owned tactical contact authoring cache when needed, indexes non-player contact candidates into f64-derived world-space cells, and queries scanner candidates from the index instead of scanning every replicated entity inside each streamed player loop. Discovered landmarks now resolve by GUID lookup from the same authoring cache instead of a second per-player replicated-entity scan. Tactical snapshot/delta schemas, scanner source authority, final range checks, `ReplicationState` visibility checks, signal redaction, and contact budgets are unchanged. Metrics now include streamed players with/without scanner sources, per-player stream timing, authoring entries, contact index cells, index queried cells, unindexed-entry fallback count, candidate evaluations, max candidate evaluations per streamed player, full-scan fallbacks, and discovered-landmark lookups. Validation so far is code-level: `cargo test -p sidereal-replication replication::tactical::tests:: -- --nocapture` passed with new contact-index coverage. A follow-up dense/multi-player capture should prove the candidate reduction under an active scanner source.
- Phase 3 tactical metric capture update: `data/debug/phase0_baseline/phase0_headless_summary_20260429_230807.txt` completed with `baseline_complete=true`, 150 asteroid field members, and four tactical stream metric lines showing the new authoring/index fields (`replicated_scans=202`, `authoring_entries=200`, `contact_index_cells=33`, `contact_index_unindexed_entries=0`). The default short headless scenario did not log a streamed scanner frame in the five-second tactical metrics sample, so the tactical metrics logger now emits frames with `players_streamed_last > 0` immediately when tactical summary logging is enabled. The next validation should use an active-scanner scenario and compare `contact_candidate_evaluations` against `authoring_entries * streamed_players`.
- Phase 3 active-scanner tactical capture update: `data/debug/phase0_baseline/phase0_headless_summary_20260429_231318.txt` completed with active scanner frames after the immediate-stream-frame logging change. It reported `players_streamed=1`, `players_with_scanner_source=1`, `authoring_entries=200`, `contact_index_cells=33`, `contact_index_unindexed_entries=0`, `contact_index_full_scan_fallbacks=0`, `contact_candidate_evaluations=199`, `exact_contacts=37`, and `landmark_contacts=1`. This proves the stream consumes the index without fallback, but it does not prove meaningful candidate reduction because the dense asteroid setup lies almost entirely inside the scanner candidate area. The next proof case should place multiple dense fields/sectors outside scanner radius and compare candidate evaluations against total authoring entries across all sectors.
- Phase 3 tactical cache promotion update: the temporary borrowed authoring frame has been replaced by an owned `TacticalContactAuthoringCache` Bevy resource. It snapshots the public tactical read-model fields plus the currently visible client set on refresh, so stream construction no longer borrows Bevy component references after the cache is built. Refresh is lazy: frames with no streamed player, no scanner contacts, and no discovered landmark lookups do not scan replicated tactical entities. Metrics now include authoring cache refresh count and total/max refresh milliseconds. This is still a whole-cache refresh when needed; per-entity dirty cache maintenance remains the next architectural step.
- Phase 3 sparse tactical index query update: tactical candidate collection now chooses occupied-cell scanning when a scanner radius would otherwise walk more empty coordinate cells than there are occupied cells in the index. This keeps wide-radius/sparse-sector queries from spending time on empty cells while preserving the same final range, visibility, and redaction checks.
- Phase 3 lazy-cache/sparse-query capture update: `data/debug/phase0_baseline/phase0_headless_summary_20260429_233443.txt` completed with `baseline_complete=true`. Non-stream tactical frames now report `replicated_scans=0`, `authoring_cache_refresh_count=0`, and no candidate work. Active scanner frames report one cache refresh around `0.33-0.36 ms`, `replicated_scans=202`, `authoring_entries=200`, `contact_index_cells=33`, `contact_candidate_evaluations=199`, and `contact_index_queried_cells=35` instead of the prior `2916-2952` empty-cell query span. This validates lazy refresh and sparse occupied-cell query selection in the current dense-field scenario.
- Phase 3 health snapshot update: replication health snapshots now include the tactical stream/cache counters needed by capture and BRP/debug tooling: stream duration, streamed players with/without scanner sources, authoring cache refresh count/timing, authoring entries, contact index cells, unindexed entries, candidate evaluations, queried cells, full-scan fallbacks, and exact/signal/landmark contact counts.
- Phase 3 scanner-source cache update: tactical streaming now owns an `EffectiveScannerSourceCache` keyed by player entity ID and records the resolved scanner source used by the stream. Entries are removed when the player has no effective scanner source or when the authenticated binding is no longer active. Tactical logs and replication health snapshots now separate scanner-source cache entries, resolution count, and resolution total/max milliseconds from authoring-cache refresh timing. This is instrumentation/read-model work only; scanner authority, range checks, visibility checks, signal redaction, contact budgets, and tactical message schemas are unchanged.
- Phase 3 tactical metrics scheduling update: `report_tactical_stream_metrics` now runs in the same fixed-post-update streaming chain immediately after tactical stream construction instead of later in `Update`. This prevents streamed-frame counters from being reset by a subsequent non-stream fixed tick before they are logged.
- Phase 3 scanner-source cache capture update: `data/debug/phase0_baseline/phase0_headless_summary_20260430_001611.txt` completed with `baseline_complete=true`. Active scanner frames now log `players_streamed=1`, `players_with_scanner_source=1`, `scanner_source_cache_entries=1`, `scanner_source_resolutions=1`, scanner-source resolution around `0.02-0.03 ms`, authoring-cache refresh around `0.33-0.84 ms`, `authoring_entries=200`, `contact_index_cells=33`, `contact_candidate_evaluations=199`, and `contact_index_queried_cells=35`.
- Phase 3 candidate disposition metrics update: tactical logs and replication health snapshots now split scanner candidate disposition into visible candidates, hidden candidates, scanner-range rejections, no-signal redactions, and signal-detection rejections. This makes it possible to tell whether a dense-area tactical frame is spending work on authorized visible contacts, hidden candidates that correctly redact, or candidates only reached by signal padding.
- Phase 3 candidate disposition capture update: `data/debug/phase0_baseline/phase0_headless_summary_20260430_002100.txt` completed with `baseline_complete=true`. Active scanner frames reported `contact_candidate_visible=37`, `contact_candidate_hidden=162`, `contact_candidate_range_rejected=0`, `contact_candidate_no_signal_redactions=161`, and `contact_candidate_signal_rejected=1` alongside `exact_contacts=37` and `signal_contacts=0`.
- Phase 3 keyed authoring-cache maintenance update: `TacticalContactAuthoringCache` is now maintained before tactical streaming and keyed internally by server-runtime Bevy `Entity`, while public contact identity remains GUID-based. The cache performs full rebuilds only when the active client set, index cell size, or visibility membership changes, otherwise it applies component-change and removal-driven per-entity updates. Tactical streaming no longer refreshes the whole authoring cache. Metrics now split authoring cache full rebuilds, real upserts, removals, and semantic no-op dirty candidates in logs and replication health snapshots.
- Phase 3 keyed-cache capture update: `data/debug/phase0_baseline/phase0_headless_summary_20260430_004940.txt` showed the first naive dirty path still upserting 200 entries per active scanner frame; `data/debug/phase0_baseline/phase0_headless_summary_20260430_005129.txt` reduced that to 153 after removing broad dirty sources; `data/debug/phase0_baseline/phase0_headless_summary_20260430_005457.txt` now reports stable active-scanner frames with `authoring_cache_refresh_count=0`, `authoring_cache_upserts=0`, `authoring_cache_removals=0`, `authoring_cache_noops=153`, and `replicated_scans=153`. This proves real reindex/upsert work is quiet on stable frames, but 153 noisy dirty candidates still need attribution and reduction before M1 is considered complete.
- Phase 3 tactical dirty-source attribution update: tactical logs now break authoring dirty candidates down by `Position`, `WorldPosition`, `Rotation`, `LinearVelocity`, `SizeM`, `TotalMassKg`, and `SignalSignature`. `data/debug/phase0_baseline/phase0_headless_summary_20260430_010422.txt` showed `authoring_dirty_mass=150`, identifying persistent `MassDirty` recomputation as the source of most unchanged tactical candidates. `recompute_total_mass` now skips assignments for unchanged derived mass and Avian mass/inertia values while preserving the existing `MassDirty` marker semantics.
- Phase 3 post-mass-fix capture update: `data/debug/phase0_baseline/phase0_headless_summary_20260430_011747.txt` completed with `baseline_complete=true`; stable active-scanner frames now report `authoring_cache_noops=3`, `replicated_scans=3`, `authoring_dirty_mass=0`, `authoring_dirty_position=3`, `authoring_dirty_rotation=3`, and `authoring_dirty_linear_velocity=3`. This removes the asteroid-field mass churn from tactical authoring maintenance. The remaining 3 dirty candidates are moving/control-side motion candidates and should be kept measured rather than optimized away blindly.
- Phase 3 multi-sector validation update: `world_init.lua` now supports an optional fresh-world `asteroid_fields` list with required unique `field_entity_id` values, preserving the default single-field bootstrap. The dense capture harness now records last tactical authoring entries, contact-index cells, candidate evaluations, queried cells, full-scan fallbacks, and candidate/authoring ratio so multi-sector captures can prove index reduction without manual log scraping. Code-level tactical index coverage now explicitly verifies that far dense fields outside scanner range do not enter the local scanner candidate set and that candidate count remains below total authored contacts without falling back to a full scan. A live multi-sector capture should still be run against a clean/fresh graph or isolated database, because rerunning the existing starter asteroid bootstrap against a non-reset graph would duplicate randomly generated member UUIDs.
- Phase 3 harness validation update: `data/debug/phase0_baseline/phase0_headless_summary_20260430_015714.txt` completed with `baseline_complete=true` on the existing single-field database and confirmed the new summary fields are emitted: `tactical_authoring_entries_last=200`, `tactical_candidate_evaluations_last=199`, `tactical_queried_cells_last=35`, `tactical_full_scan_fallbacks_last=0`, and `tactical_candidate_authoring_ratio_last=0.9950`. This verifies the harness reporting path only; it remains intentionally not a multi-sector reduction proof.
- Phase 4 visibility fanout harness update: `scripts/capture_phase0_dense_baseline.sh` now extracts visibility apply-stage fanout fields from the replication summary into first-class summary keys, including entity count, candidates per client, observer candidate maxima, apply policy evaluations, non-candidate skips, candidate rejections/bypasses, visible evaluations, current/desired visible-client totals, candidate-per-entity ratio, apply-evaluation-per-entity ratio, and non-candidate skip ratio. This is measurement-only and is the next evidence gate before any cell-owned membership diff or observer-budget delivery behavior changes.
- Phase 4 visibility fanout harness validation update: `data/debug/phase0_baseline/phase0_headless_summary_20260430_022838.txt` completed against the existing default single-field world with `baseline_complete=true` and confirmed the new summary fields parse from live visibility logs. The sample reported `visibility_entities_last=202`, `visibility_candidates_per_client_last=201.0`, `visibility_apply_entities_with_cache_last=202`, `visibility_apply_client_policy_evaluations_last=193`, `visibility_apply_non_candidate_policy_eval_skips_last=1`, `visibility_candidate_per_entity_ratio_last=0.9950`, and `visibility_apply_policy_eval_entity_ratio_last=0.9554`. This is a parser/baseline validation only; it does not replace the pending clean multi-sector or multi-observer fanout proof.
- Phase 4 visibility spatial guard update: code-level coverage now verifies that the server visibility spatial candidate set excludes far dense cells from an observer's candidate set while preserving local-cell candidates. This locks in the existing spatial candidate contract before replacing the broad membership apply loop with a more selective diff processor.
- Phase 4 candidate worklist telemetry update: replication visibility summaries and health snapshots now expose `candidate_reverse_map[entities/client_links]`, and the dense capture harness records reverse-map entity/link counts plus ratios against total replicated entities. `data/debug/phase0_baseline/phase0_headless_summary_20260430_023313.txt` validated the parser on the current default field with `visibility_candidate_reverse_entities_last=201`, `visibility_candidate_reverse_client_links_last=201`, and `visibility_candidate_reverse_entity_ratio_last=0.9950`. The current one-field baseline intentionally shows little worklist reduction; the same counters are intended to prove the reduction in clean multi-sector and multi-observer captures before implementing cell-owned membership diffs.
- Phase 4 isolated multi-sector capture update: `scripts/capture_phase0_dense_baseline.sh` now supports a configurable `SIDEREAL_PHASE0_REPLICATION_STARTUP_TIMEOUT_S` so clean-world scenario hydration does not trip the old fixed 30s startup wait. `data/debug/phase0_baseline/phase0_headless_summary_20260430_024120.txt` completed against an isolated `multi_sector_far_fields` clone with 450 asteroid members and `baseline_complete=true`. Tactical authoring grew to `tactical_authoring_entries_last=502`, while scanner candidate work stayed at `tactical_candidate_evaluations_last=199`, `tactical_full_scan_fallbacks_last=0`, and `tactical_candidate_authoring_ratio_last=0.3964`. Visibility reported `visibility_entities_last=504`, `visibility_candidate_reverse_entities_last=201`, `visibility_apply_non_candidate_policy_eval_skips_last=303`, `visibility_candidate_reverse_entity_ratio_last=0.3988`, and `visibility_non_candidate_skip_ratio_last=0.6109`. This is the first live proof that the current spatial candidate/index lanes exclude far dense fields; the broad apply loop still visits all 504 cached replicated entities and remains the next server scalability target.
- Phase 4 two-observer fanout capture update: `data/debug/phase0_baseline/phase0_headless_summary_20260430_024511.txt` completed the isolated `multi_sector_far_fields` run with two distinct authenticated players (`server_unique_auth_players=2`, `client_bindings[live/registered/active/stale]=2/2/2/0`). Visibility held `visibility_entities_last=504` and `visibility_candidate_reverse_entities_last=201`, while candidate links rose to `visibility_candidate_reverse_client_links_last=389`, non-candidate skips rose to `visibility_apply_non_candidate_policy_eval_skips_last=619`, and `visibility_non_candidate_skip_ratio_last=0.6234`. Server input summaries still reported 60 accepted action-queue applies/sec with zero drops. This confirms the next server-side target is not candidate discovery but replacing the all-cached-entity apply pass with candidate/current-visible/dirty worklists.
- Phase 4 apply worklist update: `update_network_visibility` now builds the membership apply pass from candidate entities, currently visible entities, active owner entities, and mandatory policy recheck entities instead of applying over every cached replicated entity. Test-only bypass mode still applies over the full cached set. The worklist keeps static landmarks, stellar/global render config entities, player anchors, active owned entities, and large delivery extents in the conservative policy path, so the `Authorization -> Delivery -> Payload` contract in `docs/features/active/visibility_replication_contract.md` is unchanged. `data/debug/phase0_baseline/phase0_headless_summary_20260430_030923.txt` reran the isolated two-observer `multi_sector_far_fields` scenario with `baseline_complete=true`; `visibility_apply_entities_with_cache_last` dropped from 504 to 202, `visibility_apply_entity_worklist_skips_last=302`, and visible output totals stayed at `visibility_apply_current_visible_clients_total_last=45` / `visibility_apply_desired_visible_clients_total_last=45`. Candidate discovery and policy evaluations stayed intentionally equivalent for the same candidate links (`visibility_candidate_reverse_client_links_last=389`, `visibility_apply_client_policy_evaluations_last=374`). The next server target is dirty/cell-owned membership diff maintenance so scratch/candidate state does not need to be rebuilt from all cached replicated entities on stable frames.
- Phase 4 visibility read-model cache update: the membership pass now uses a persistent `VisibilityEntityReadModel` for stable policy/topology lookups, owned-entity buckets, visibility source candidates, runtime layer definitions, and mandatory policy recheck entities. `VisibilityEntityCache` generation now advances only on semantic cached-value changes, so Bevy `Changed<T>` noise does not force a read-model rebuild. `VisibilitySpatialIndex` now tracks topology and cell-membership generations/cell epochs as the basis for observer candidate-cache invalidation. The capture harness records `visibility_read_model_rebuilt_last`, `visibility_read_model_rebuilds_total_last`, and `visibility_read_model_rebuild_ms_last`. `data/debug/phase0_baseline/phase0_headless_summary_20260430_032630.txt` reran the isolated two-observer `multi_sector_far_fields` scenario with `baseline_complete=true`; stable visibility summaries reported `cache_upserts=0`, `read_model[rebuilt/rebuilds/rebuild_ms]=false/1/0.00`, `visibility_apply_entities_with_cache_last=202`, `visibility_apply_entity_worklist_skips_last=302`, and unchanged visible output totals at `45/45`. This is still policy-preserving read-model maintenance, not deferred delivery or a visibility-budget behavior change.
- Phase 4 observer candidate-cache update: `update_network_visibility` now reuses per-observer candidate sets when candidate mode, read-model generation, spatial topology generation, queried candidate cells, and cell epochs are unchanged. Candidate set rebuilds still use the existing spatial grid/full-scan code path, and authorization/policy evaluation remains unchanged. The capture harness records `visibility_observer_candidate_cache_entries_last`, `visibility_observer_candidate_cache_hits_last`, and `visibility_observer_candidate_cache_misses_last`. `data/debug/phase0_baseline/phase0_headless_summary_20260430_033339.txt` reran the isolated two-observer `multi_sector_far_fields` scenario with `baseline_complete=true`; stable visibility summaries reported `observer_candidate_cache[entries/hits/misses]=2/2/0`, `read_model[rebuilt/rebuilds/rebuild_ms]=false/1/0.00`, `visibility_apply_entities_with_cache_last=202`, `visibility_apply_entity_worklist_skips_last=302`, and unchanged visible output totals at `45/45`. The remaining Phase 4 scalability work is to stop rebuilding the reverse `entity -> candidate clients` map and desired membership from scratch on stable frames by maintaining cell/observer/entity dirty diffs.
- Phase 4 candidate reverse-map cache update: the reverse `entity -> candidate clients` map now has its own generation-based cache keyed by observer candidate-cache generation plus the active client set. Stable frames reuse the reverse map instead of walking every observer candidate set again. The capture harness records `visibility_candidate_reverse_cache_rebuilt_last`, `visibility_candidate_reverse_cache_rebuilds_total_last`, and `visibility_candidate_reverse_cache_rebuild_ms_last`. `data/debug/phase0_baseline/phase0_headless_summary_20260430_042628.txt` reran the isolated two-observer `multi_sector_far_fields` scenario with `baseline_complete=true`; stable visibility summaries reported `observer_candidate_cache[entries/hits/misses]=2/2/0`, `candidate_reverse_cache[rebuilt/rebuilds/rebuild_ms]=false/1/0.00`, `visibility_candidate_reverse_entities_last=201`, `visibility_candidate_reverse_client_links_last=389`, `visibility_apply_entities_with_cache_last=202`, `visibility_apply_entity_worklist_skips_last=302`, and unchanged visible output totals at `45/45`. The next dirty-diff slice must be more careful than a simple cache hit: exact delivery decisions can still change when observer anchors or visibility sources move inside the same cells, so desired-membership reuse must be gated by observer/source movement thresholds, policy dirty state, current-visible loss checks, and full-scan parity tests.
- Phase 4 desired-membership cache update: `update_network_visibility` now caches each entity's desired visible-client set and skips the Lightyear membership diff when the client context generation, candidate reverse-map generation, prepared entity policy, and current visible membership all still match. Role rearm suppression disables reuse for affected entities. This is the first true desired-membership apply skip; it still recomputes when observer anchors, visibility sources, candidate membership, entity policy, entity position/extent, controlled owner, or current membership change. The capture harness records `visibility_desired_membership_cache_entries_last`, `visibility_desired_membership_cache_hits_last`, `visibility_desired_membership_cache_misses_last`, and `visibility_apply_membership_diff_skips_last`. `data/debug/phase0_baseline/phase0_headless_summary_20260430_045216.txt` reran the isolated two-observer `multi_sector_far_fields` scenario with `baseline_complete=true`; stable visibility summaries reported `desired_membership_cache[entries/hits/misses/diff_skips]=202/202/0/202`, `candidate_reverse_cache[rebuilt/rebuilds/rebuild_ms]=false/1/0.00`, `visibility_apply_client_policy_evaluations_last=0`, `visibility_apply_entities_with_cache_last=202`, `visibility_apply_entity_worklist_skips_last=302`, and matched current/desired visible-client totals at `32/32`. This capture did not emit server input summaries, so treat it as a visibility-path proof only; the next validation should repeat with confirmed active input/movement and compare visible totals against a no-cache/full-evaluation parity mode before broadening skip conditions.
- Phase 4 desired-membership parity correction update: validation added `SIDEREAL_VISIBILITY_DISABLE_DESIRED_MEMBERSHIP_CACHE=1` as a full-evaluation comparison mode. The first cache-on/cache-off comparison exposed a real invalidation bug: cache-off `data/debug/phase0_baseline/phase0_headless_summary_20260430_045842.txt` reached current/desired visible totals `45/45`, while cache-on `data/debug/phase0_baseline/phase0_headless_summary_20260430_050054.txt` held `32/32` by caching the one-pass role-rearm suppression state. The cache now removes desired-membership entries touched by pending role rearm instead of storing that transient suppressed set, with unit coverage for the rule. The repaired pair `data/debug/phase0_baseline/phase0_headless_summary_20260430_050631.txt` and `data/debug/phase0_baseline/phase0_headless_summary_20260430_050837.txt` both completed with `baseline_complete=true`, `server_input_summary=3`, zero input drops, and visible totals `45/45`. Cache-on reported `desired_membership_cache[entries/hits/misses/diff_skips]=202/202/0/202`, `visibility_apply_client_policy_evaluations_last=0`, and `query_ms` around `0.87-1.00`; cache-off reported `202/0/202/0`, `visibility_apply_client_policy_evaluations_last=374`, and `query_ms` around `1.27-1.32`. Future membership-cache broadening must keep the cache-disabled parity gate and must not cache role-rearm, ownership-handoff, or other transient authority-suppression states.
- Phase 4 sector-grid telemetry update: the visibility spatial index now maintains a coarse sector occupancy map in addition to the existing cell map. `SIDEREAL_VISIBILITY_SECTOR_SIZE_M` defaults to `100000` meters and is clamped to at least the active cell size; this is measurement-only and does not change candidate generation, authorization, delivery, or persistence lifecycle behavior. Replication visibility summaries, health snapshots, and the dense capture harness now expose `occupied_sectors` and `max_entities_per_sector`. `data/debug/phase0_baseline/phase0_headless_summary_20260430_051642.txt` reran the isolated two-observer `multi_sector_far_fields` scenario with `baseline_complete=true`, `server_input_summary=3`, visible totals `45/45`, and stable cache output `desired_membership_cache[entries/hits/misses/diff_skips]=202/202/0/202`; it reported `visibility_occupied_sectors_last=10` and `visibility_max_entities_per_sector_last=101` alongside `visibility_occupied_cells_last` equivalent log values of `14` cells and `52` entities per cell. This creates a live measurement surface for later sector hysteresis, sector lifecycle, and deferred cell/sector membership queues without widening authority or delivery.
- Phase 4 deferred membership gain queue update: an opt-in per-client visibility gain budget now exists behind `SIDEREAL_VISIBILITY_MEMBERSHIP_GAIN_BUDGET_PER_CLIENT`. The queue only defers non-immediate visibility gains; losses remain immediate so authorization revocations are not delayed. Owner/control/global visibility gains bypass the budget, pending gain entities stay in the apply worklist, and stale pending gains are dropped when the client/entity is gone or the entity is no longer desired. Desired-membership cache reuse is disabled while a gain budget is active because budget state is intentionally pass-local. Visibility summaries, health snapshots, and the capture harness expose `deferred_membership[budget/pending/enqueued/released/deferred/dropped]`. Unit coverage verifies that non-immediate gains defer/release across passes, immediate gains never defer, and pending deferred entities remain in the apply worklist. Default-path capture `data/debug/phase0_baseline/phase0_headless_summary_20260430_060526.txt` completed with `baseline_complete=true`, `server_input_summary=3`, `deferred_membership[...]=0/0/0/0/0/0`, cache hits `202/202/0/202`, and visible totals `45/45`. Opt-in capture `data/debug/phase0_baseline/phase0_headless_summary_20260430_060803.txt` completed with `budget=1`, desired-cache disabled as expected (`entries/hits/misses=0/0/202`), pending queue drained by the logged stable frames, and visible totals still `45/45`. The next step is to add better burst-window/cumulative budget counters before enabling real deferred delivery in normal runtime defaults.
- Phase 4 deferred membership burst-counter update (2026-04-30): the deferred gain queue now retains cumulative `enqueued/released/deferred/dropped` totals and a `max_pending` watermark alongside the existing per-pass counters. This is required before using queue captures to judge dense-area churn because the stable 5-second visibility summary can otherwise observe `pending=0` after a short burst has already drained. The counters are diagnostic-only, preserve immediate owner/control/global gains and immediate losses, and are exposed through visibility summary logs as `deferred_membership_totals[enqueued/released/deferred/dropped/max_pending]`, replication health JSON, and `scripts/capture_phase0_dense_baseline.sh`. Unit coverage proves that drained bursts are still visible in cumulative totals and that stale pending gains pruned during live-client/entity cleanup increment the dropped total. Live dense capture remains blocked in the current shell because the source database has active gateway/replication sessions that prevent template cloning; a dump-based prepared clone was attempted with the container-matched `pg_dump`, but AGE cypher world-init writes failed repeatedly on that clone, so it was discarded and is not treated as validation evidence.
- Phase 4 candidate reverse-map copy removal update (2026-04-30): the membership pass now reads the cached `entity -> candidate clients` reverse map directly after refresh instead of cloning it into per-frame scratch state. This is a policy-preserving stable-frame allocation/copy reduction only; candidate generation, observer cache invalidation, authorization, delivery checks, and membership diffs remain unchanged. This is a small preparatory step for cell/observer dirty-diff membership maintenance because the reverse map is now a single cache-owned surface rather than duplicated scratch state.
- Phase 4 client-context churn instrumentation update (2026-04-30): visibility summaries, health snapshots, and the dense capture harness now classify client context upsert causes as `new/player_identity/player_entity/anchor/sources/discovery/faction/view/range`. This is measurement-only and is intended to prove which inputs invalidate the global client-context generation before replacing that broad invalidation with per-client or per-observer dirty membership maintenance.
- Phase 4 post-block validation update (2026-04-30): after stopping the local gateway/replication sessions that were holding the source Postgres database open, isolated dense captures completed again. `data/debug/phase0_baseline/phase0_headless_summary_20260430_101649.txt` reran the two-player `multi_sector_far_fields` baseline with `baseline_complete=true`, `server_unique_auth_players=2`, `control_ack=1`, four input summaries, zero input drops, `visibility_apply_entities_with_cache_last=202`, `visibility_apply_entity_worklist_skips_last=302`, stable desired-membership cache hits `202/202/0/202`, and `client_context_changes[...]=0/0/0/0/0/0/0/0/0`. The opt-in gain-budget run `data/debug/phase0_baseline/phase0_headless_summary_20260430_101905.txt` completed with `SIDEREAL_VISIBILITY_MEMBERSHIP_GAIN_BUDGET_PER_CLIENT=1`, `baseline_complete=true`, `server_unique_auth_players=2`, desired-cache disabled as expected (`entries/hits/misses=0/0/202`), and final stable `pending=0` while cumulative `deferred_membership_totals[enqueued/released/deferred/dropped/max_pending]=18/18/171/0/18`. This supersedes the earlier capture blocker note and proves the burst counters retain evidence after short deferred-gain bursts drain.
- Phase 4 scoped client-context invalidation update (2026-04-30): desired-membership cache reuse now keys against a structural client-context generation plus the per-client revisions that actually participated in an entity's desired membership result. Structural changes still include new/removed contexts, player identity/entity, visibility-source, discovery, faction, and view-mode changes. Observer-anchor and delivery-range churn are now tracked as per-client revisions, so unrelated observer movement no longer invalidates every cached entity result. Unit coverage verifies anchor/range-only changes are non-structural, unrelated client revisions do not invalidate an entity, relevant client revisions do invalidate it, and role-rearm suppression still avoids caching transient membership. `data/debug/phase0_baseline/phase0_headless_summary_20260430_103541.txt` reran the isolated two-observer `multi_sector_far_fields` scenario with `baseline_complete=true`, `server_unique_auth_players=2`, zero input drops, stable desired cache `202/202/0/202`, `visibility_apply_entities_with_cache_last=202`, `visibility_apply_entity_worklist_skips_last=302`, visible totals `45/45`, and `client_context_changes[...]=0/0/0/0/0/0/0/0/0`. This is still a cache-invalidation refinement; it does not change authorization, delivery, payload redaction, or the visibility contract.
- Phase 4 entity-local candidate invalidation update (2026-04-30): desired-membership cache reuse now stores the sorted candidate-client list for the specific entity instead of depending on the global candidate reverse-map generation. A reverse-map rebuild caused by an unrelated observer/entity therefore no longer invalidates every cached desired-membership entry; an entity still recomputes when its own candidate-client list changes. Unit coverage now verifies candidate-client changes for the entity invalidate reuse while unrelated client-context revisions do not. `data/debug/phase0_baseline/phase0_headless_summary_20260430_104052.txt` reran the pinned two-observer `multi_sector_far_fields` capture with `baseline_complete=true`, `server_unique_auth_players=2`, zero input drops, stable desired cache `202/202/0/202`, `visibility_candidate_reverse_client_links_last=389`, `visibility_apply_entities_with_cache_last=202`, `visibility_apply_entity_worklist_skips_last=302`, and visible totals `45/45`. This is another invalidation-scope reduction only; it does not change spatial candidate construction, authorization, delivery, or payload redaction.
- Phase 4 incremental reverse-map update (2026-04-30): `VisibilityCandidateReverseMapCache` now keeps per-client candidate sets and updates `entity -> candidate clients` links only for removed or changed observer candidate sets. If the observer candidate-cache generation changes but the reverse links are identical, the reverse-map generation no longer advances and the stable desired-membership cache is not disturbed. Cached observer candidate sets are shared into per-frame scratch through `Arc<HashSet<Entity>>`, so candidate-cache hits no longer clone the full candidate set each visibility pass. Unit coverage verifies no-op generation changes, one-client incremental link updates, and deterministic sorted client vectors. `data/debug/phase0_baseline/phase0_headless_summary_20260430_105755.txt` reran the pinned two-observer `multi_sector_far_fields` capture with `baseline_complete=true`, `server_unique_auth_players=2`, zero input drops, `observer_candidate_cache[entries/hits/misses]=2/2/0`, `candidate_reverse_cache[rebuilt/rebuilds/rebuild_ms]=false/1/0.00`, stable desired cache `202/202/0/202`, visible totals `45/45`, and unchanged candidate link totals `201/389`. This is the first observer-level dirty-diff maintenance step; it preserves the existing visibility contract and does not yet remove the stable-frame apply worklist visit.
- Phase 4 stable-frame desired-membership fast-skip update (2026-04-30): desired-membership reuse now has explicit per-entity invalidators for the stable entity read model, spatial visibility position/extent, and runtime policy components (`ControlledBy` and `RuntimeWorldVisualStack`). Stable worklist entities can now skip policy preparation and Lightyear membership diff entirely when their candidate-client list, relevant client-context revisions, current visible membership, entity-cache generation, spatial revision, and runtime-policy revision all still match the cached desired membership. Visibility summaries, health JSON, and the dense capture harness expose `desired_membership_cache[entries/hits/misses/diff_skips/fast_skips]` plus `visibility_apply_desired_membership_fast_skips_last`. `data/debug/phase0_baseline/phase0_headless_summary_20260430_114124.txt` reran the pinned two-observer `multi_sector_far_fields` capture with `baseline_complete=true`, `server_unique_auth_players=2`, zero input drops, visible totals `45/45`, desired cache `202/202/0/202/202`, `visibility_apply_entities_with_cache_last=0`, `visibility_apply_client_policy_evaluations_last=0`, and `query_ms` around `0.65-0.91`. Cache-disabled parity capture `data/debug/phase0_baseline/phase0_headless_summary_20260430_114413.txt` matched the same visible totals `45/45` with full evaluation (`202/0/202/0/0`, `visibility_apply_entities_with_cache_last=202`, `visibility_apply_client_policy_evaluations_last=374`) and zero input drops. This is a policy-preserving stable-frame optimization only; candidate construction, authorization, delivery, payload redaction, observer anchoring, and the visibility contract are unchanged.
- Phase 4 delivery-loss hysteresis update (2026-04-30): an opt-in `SIDEREAL_VISIBILITY_DELIVERY_LOSS_HYSTERESIS_M` margin now allows an already-visible client to be retained when normal authorization still passes and only the delivery boundary would otherwise drop the entity. The default remains `0` meters. This is not used for new gains, owner/control/global state remains prioritized by the existing paths, and a currently visible non-candidate client can be evaluated before loss when hysteresis is enabled so candidate cells do not become hidden authorization. Visibility summaries, health JSON, and the dense capture harness expose `apply_delivery_hysteresis_kept_clients`. Unit coverage verifies that exact delivery still fails outside range with no hysteresis and that the same authorized entity can be retained when the configured loss margin covers the gap. Default-path capture `data/debug/phase0_baseline/phase0_headless_summary_20260430_115455.txt` completed with `baseline_complete=true`, `server_unique_auth_players=2`, zero input drops, desired cache `202/202/0/202/202`, visible totals `45/45`, `visibility_apply_entities_with_cache_last=0`, and `visibility_apply_delivery_hysteresis_kept_clients_last=0`, confirming the default-off path is behaviorally unchanged. This is the first default-off hysteresis primitive for later cell/sector streaming; it preserves `Authorization -> Delivery -> Payload` and does not change the default visibility contract.
- Phase 4 persistence-backed sector lifecycle scaffolding update (2026-04-30): the replication visibility pass now maintains a server-only `VisibilitySectorLifecycleRegistry` over the existing sector occupancy map. It models the required `Hot`, `Warm`, `ColdPendingFlush`, `ColdPersisted`, and `Hydrating` states, tracks player-anchor/player-controlled/projectile unload blockers, records `last_simulated_at` and a runtime sector epoch, and exposes lifecycle metrics through visibility summaries, health JSON, and the dense capture harness as `sector_lifecycle[entries/hot/warm/cold_pending/verified_pending/cold_persisted/hydrating/interested/blocked/blockers/cold_candidates/transitions]`. The runtime hook only refreshes Hot/Warm interest and cold-flush eligibility; it does not unload, despawn, widen authority, or write persistence yet. Explicit future transition helpers require a Warm, unblocked sector before `ColdPendingFlush` and require a verified write before `ColdPersisted`, preserving the persistence lifecycle contract. `data/debug/phase0_baseline/phase0_headless_summary_20260430_123733.txt` validated the default path with `baseline_complete=true`, `control_ack=1`, four input summaries, 60 accepted inputs/sec after bootstrap, zero drops, `visibility_occupied_sectors_last=10`, and `visibility_sector_lifecycle_*` reporting `entries=10`, `hot=4`, `warm=6`, `cold_pending_flush=0`, `cold_persisted=0`, `hydrating=0`, `blocked_sectors=2`, `blocker_entities=3`, and `cold_flush_candidates=0`. Native impact: new server diagnostics for sector streaming readiness. WASM impact: none; this is replication-server-only.
- Phase 4 persistence-backed sector flush coordinator update (2026-04-30): a default-off server-side sector flush coordinator now exists behind `SIDEREAL_SECTOR_LIFECYCLE_FLUSH_ENABLED=1`, with `SIDEREAL_SECTOR_LIFECYCLE_FLUSH_MAX_STARTS_PER_TICK` limiting new background writes. It selects only Warm, unblocked, dwell-ready sectors, serializes entities through the existing graph-record persistence path, writes with the existing transactional graph persistence API, and records in-flight/queued/verified/failed/skipped-empty/last-record counters through visibility summaries, health JSON, and the dense capture harness as `sector_flush[enabled/in_flight/enqueued/verified/failed/skipped_empty/last_records]`. A verified write now only marks write verification on the lifecycle entry; `ColdPersisted` remains reserved for a later runtime-removal phase after authoritative ECS entities are actually removed. The default path remains behaviorally inert: `data/debug/phase0_baseline/phase0_headless_summary_20260430_125859.txt` completed with `baseline_complete=true`, four input summaries, zero input drops, `visibility_sector_flush_enabled_last=false`, and all flush activity counters at zero. The isolated opt-in write proof `data/debug/phase0_baseline/phase0_headless_summary_20260430_131147.txt` completed with `baseline_complete=true`, three input summaries, zero input drops, `visibility_sector_flush_enabled_last=true`, `visibility_sector_flush_enqueued_total_last=2`, `visibility_sector_flush_verified_total_last=1`, `visibility_sector_flush_failed_total_last=0`, `visibility_sector_lifecycle_cold_pending_flush_last=2`, `visibility_sector_lifecycle_verified_pending_removal_last=1`, and `visibility_sector_lifecycle_cold_persisted_last=0`; one background write was still in flight at harness shutdown, so this is treated as a write-path proof, not an unload/removal proof. Native impact: replication-server diagnostics plus a guarded opt-in write path. WASM impact: none; this is replication-server-only and does not affect client free-roam, prediction, visibility authorization, delivery, payload redaction, or asset delivery.
- Phase 4 sector runtime-removal preflight update (2026-04-30): a default-off preflight diagnostic now exists behind `SIDEREAL_SECTOR_LIFECYCLE_REMOVAL_PREFLIGHT_ENABLED=1`. It classifies verified `ColdPendingFlush` sectors as ready, blocked, interested, still in-flight, or missing runtime entities, and reports ready entity totals/max through visibility summaries, health JSON, and the dense capture harness as `sector_removal_preflight[enabled/candidates/ready/blocked/interested/in_flight/missing_runtime/ready_entities/ready_entity_max]`. This is deliberately not an unload implementation: it does not call `mark_cold_persisted_after_runtime_removal`, despawn ECS entities, remove visibility/tactical/physics indexes, or hydrate anything. Unit coverage verifies that verified pending sectors become preflight-ready only when enabled and still count as not `ColdPersisted`. Isolated opt-in capture `data/debug/phase0_baseline/phase0_headless_summary_20260430_140735.txt` completed with `baseline_complete=true`, zero input drops, `visibility_sector_lifecycle_verified_pending_removal_last=1`, `visibility_sector_lifecycle_cold_persisted_last=0`, `visibility_sector_removal_preflight_enabled_last=true`, `visibility_sector_removal_preflight_candidates_last=1`, `visibility_sector_removal_preflight_ready_last=1`, all blocker/interest/in-flight/missing-runtime preflight counts at zero, and `visibility_sector_removal_preflight_ready_entities_total_last=35`. Native impact: replication-server diagnostics only, default-off. WASM impact: none.
- Phase 4 sector runtime-removal executor update (2026-05-01): a default-off server-side runtime-removal executor now exists behind `SIDEREAL_SECTOR_LIFECYCLE_REMOVAL_ENABLED=1`, with `SIDEREAL_SECTOR_LIFECYCLE_REMOVAL_MAX_SECTORS_PER_TICK` and `SIDEREAL_SECTOR_LIFECYCLE_REMOVAL_MAX_ENTITIES_PER_TICK` limiting authoritative ECS despawn work. It only selects verified `ColdPendingFlush` sectors that still have no interest, blockers, in-flight writes, or missing runtime entities; it additionally refuses cross-sector hierarchy/root sets so mount and hierarchy relationships are not split by unload. Successful removal despawns the sector's authoritative runtime entities, purges visibility membership/candidate/desired-membership/spatial caches, and only then marks the sector `ColdPersisted`. Visibility summaries, health JSON, and the dense capture harness expose `sector_removal[enabled/ready/ready_entities/removed_sectors_total/removed_entities_total/blocked_after_preflight/despawn_missing/last_removed_sectors/last_removed_entities]`. Unit coverage verifies readiness caps, cross-sector hierarchy blocking, actual despawn, cache/index cleanup, and the `ColdPersisted` transition. Isolated opt-in capture `data/debug/phase0_baseline/phase0_headless_summary_20260430_142849.txt` completed with `baseline_complete=true`, zero input drops, 60 accepted action-queue applies/sec after bootstrap, `visibility_sector_lifecycle_cold_persisted_last=1`, `visibility_sector_removal_enabled_last=true`, `visibility_sector_removal_removed_sectors_total_last=1`, `visibility_sector_removal_removed_entities_total_last=35`, `visibility_sector_removal_blocked_after_preflight_total_last=0`, and `visibility_sector_removal_despawn_missing_total_last=0`; one later flush remained in flight at harness shutdown, so the capture proves one clean removal while not claiming all eligible sectors drained. Native impact: replication-server-only, default-off. WASM impact: none; no client authority, prediction, transform repair, free-roam, visibility authorization, payload redaction, or asset-delivery behavior changes.
- Phase 4 hierarchical region telemetry update (2026-05-01): the server visibility spatial index now maintains `entities_by_region` and `region_by_entity` above the existing sector map. `SIDEREAL_VISIBILITY_REGION_SIZE_SECTORS` defaults to `32` sectors per region, uses Euclidean bucketing for negative sector coordinates, and is tracked through full rebuilds, incremental movement, and sector runtime-removal cleanup. Visibility summaries, health JSON, and the dense capture harness now expose `occupied_regions` and `max_entities_per_region`. This is measurement-only hierarchical grid scaffolding; it does not change spatial candidate generation, authorization, delivery, redaction, persistence unload selection, or client-visible replication behavior. Isolated capture `data/debug/phase0_baseline/phase0_headless_summary_20260430_143902.txt` completed with `baseline_complete=true`, `visibility_occupied_regions_last=4`, `visibility_max_entities_per_region_last=213`, default removal disabled, and zero input drops. Native impact: replication-server diagnostics only. WASM impact: none.
- Phase 4 spatial migration telemetry update (2026-05-01): the server visibility spatial index now records diagnostic migration counters whenever an incrementally updated replicated entity crosses a visibility cell, sector, or region. Visibility summaries, health JSON, and the dense capture harness expose `spatial_migration[last_cell/last_sector/last_region/total_cell/total_sector/total_region]` and matching `visibility_spatial_*_migrations_*` summary fields. This is measurement-only cell-streaming scaffolding; it does not emit streaming events, widen authority, change membership, defer delivery, unload sectors, or alter payload redaction. Unit coverage verifies last-vs-total counter behavior. Isolated capture `data/debug/phase0_baseline/phase0_headless_summary_20260430_181201.txt` completed with `baseline_complete=true`, default static-field migration counters at zero, and the new fields parsed from real visibility logs. Native impact: replication-server diagnostics only. WASM impact: none.
- Native validation is the immediate priority. WASM parity must stay recoverable: shared gameplay, prediction, replication, asset, and presentation logic should remain target-compatible, with platform branching only through `cfg(target_arch = "wasm32")`.

## 1. Executive Summary

Sidereal has the right authority model: client input flows to the shard sim, then replication/distribution, then persistence. The optimization work must preserve that model. Spatial partitioning, cell streaming, and interest management are candidate generation and delivery controls only; they must never become authorization.

The server visibility path is already improved from the oldest full-scan design: `spatial_grid` is the default candidate mode, cell keys are `i64`, cell size and delivery range are configurable, observer anchors resolve from authoritative position lanes, and the runtime exposes useful visibility metrics. The remaining server scalability issue is structural: `update_network_visibility` still has a broad per-replicated-entity apply loop that evaluates each entity against per-client computed state after candidates are built. That can work at small and medium scale but will not be enough for galaxy-wide play areas.

The dense asteroid-field symptom should be treated as a client-stage latency problem until instrumentation proves otherwise. A focused server accepting 60 inputs/sec with no drops and 1-2 ms visibility query times is unlikely to be the immediate source of a 50+ tick local confirmation gap. Candidate client causes include visibility membership churn, spawn/despawn bursts, streamed visual child creation, procedural asteroid image/material allocation, runtime asset dependency scans, render-layer dirty scans, duplicate winner swaps, tactical map/nameplate/debug overlay rebuilding, and delayed Lightyear confirmed-state processing after frame stalls or focus transitions.

The optimization strategy should be staged:

1. Pass the Phase 0a prediction/control stability gate so authority components cannot corrupt profiling results.
2. Add stage-specific metrics and a repeatable dense-field repro before changing behavior.
3. Apply quick client wins that reduce needless per-frame and per-membership-churn work without changing gameplay.
4. Replace server tactical and visibility global scans with reusable authoring caches and spatial indexes.
5. Move visibility from "candidate filter plus broad apply loop" toward cell-owned membership diffs and bounded observer query budgets.
6. Stabilize asset/material lifecycles so entering dense areas creates predictable one-time work, not repeated allocation or cache scanning.
7. Then profile and optimize AI, physics, and shared gameplay systems with behavior-preserving dirty caches and cadence tiers.

## 2. Non-Negotiable Constraints

- Preserve `docs/features/active/visibility_replication_contract.md`: `Authorization -> Delivery -> Payload` remains the enforced order.
- Spatial candidate generation may narrow work only. It must not widen authorization, delivery, or payload disclosure.
- Observer anchoring remains server-side: the authenticated player entity is the observer identity; the effective anchor follows the controlled entity when present and falls back to the player entity. Client free-roam camera state must not widen server authorization or delivery.
- Use generic entity terminology. Do not create ship-only visibility, ownership, or replication systems unless behavior is truly ship-specific.
- Clients never authoritatively set world transforms or replicated runtime state.
- Do not add transform repair shims, recurring resync loops, fallback control paths, or duplicate motion systems. Lightyear owns prediction and reconciliation.
- `SimulationMotionWriter`, `InputMarker<PlayerInput>`, and `ActionState<PlayerInput>` must be granted only by the active input authority path. Update, PostUpdate, adoption, and control-tag systems must not reinsert motion/input authority components.
- Do not reintroduce legacy motion mirror components such as `PositionM`, `VelocityMps`, or `HeadingRad`.
- Authoritative world-space coordinates remain f64. Rendering/UI projections can be f32, but persistence, server read models, replication protocols, and dashboard/runtime boundaries must not downcast authoritative world state.
- Asset payloads stay gateway HTTP-based via authenticated `/assets/<asset_guid>` fetches. Replication transport must not stream asset bytes.
- Shared simulation, prediction, and gameplay logic stays in shared crates and must remain native/WASM compatible unless the branch is strictly at the platform boundary.

## 3. Current Hypotheses

### H1: The dense-field `Ctrl TickGap` is probably client-stage delay, not server input loss.

Evidence:

- Reported server input acceptance remains near 60 realtime inputs/sec with zero drops.
- Visibility query timings remain around 1-2 ms.
- The client confirmed/server ghost falls behind the predicted entity while prediction continues locally.
- Dense-area overlays show high layer recompute, winner swap, and debug rendering activity.

What to prove:

- Whether confirmed state is late at network receipt, late at Lightyear/client replication application, or applied on time but rendered/presented late.
- Whether the gap grows only when the client frame/update loop stalls, when debug/tactical overlays are enabled, when visuals spawn, or when visibility membership churn happens.

### H2: Entity count is a proxy for churn, not the root variable.

The important variables are likely:

- visibility gains/losses per second;
- Lightyear spawn/despawn or role mutation count;
- visual child attach/detach count;
- material/image allocations;
- render-layer dirty entities and watched-component scans;
- duplicate visual dirty GUID count and winner swaps;
- tactical contact marker upserts/despawns;
- nameplate activation and projection count;
- asset dependency graph rebuilds and cache validation calls;
- debug overlay snapshot/gizmo entity count;
- confirmed-state messages received but not processed during a client frame stall.

### H3: Server visibility is locally adequate but not galaxy-scale.

Current server visibility has good foundations but still includes:

- per-client candidate generation from `VisibilitySpatialIndex`;
- per-entity membership apply across all client states for many policies;
- tactical streaming that still scans all replicated entities per active player at the tactical cadence;
- owner manifest streaming that rebuilds owned asset read models by scanning controllable entities.

This can scale to local scenes with hundreds of entities. Galaxy-scale play requires cell/sector-owned indexes, cached per-cell read models, migration events, query budgets, and diffing from changed cells instead of scanning all entities against all observers.

### H4: Presentation systems can delay networking indirectly.

Even if networking code is correct, heavy Bevy `Update`, `PostUpdate`, or `Last` work can delay:

- polling message receivers;
- Lightyear confirmed-state application;
- fixed-step catch-up;
- debug overlay snapshot collection;
- rendering of the confirmed ghost.

This is especially plausible after focus loss, frame stalls, large visual attach bursts, or tactical/debug overlay updates. Stage timing must distinguish these paths.

## 4. Exact Files and Systems to Inspect

### Server visibility and replication

- `bins/sidereal-replication/src/plugins.rs`
  - `ReplicationVisibilitySet`: ordering for transform sync, observer anchors, visibility ranges, entity cache, spatial index, landmark discovery, membership update, and streaming.
- `bins/sidereal-replication/src/replication/visibility/membership.rs`
  - `update_network_visibility`: full visibility membership pipeline; candidate generation plus broad apply loop; visibility gain/loss churn; motion component resend on visibility gain.
  - `apply_visibility_membership_diff`: actual Lightyear `gain_visibility` / `lose_visibility` calls.
  - `queue_visibility_gain_spatial_resend`: current targeted bootstrap resend on visibility gain.
- `bins/sidereal-replication/src/replication/visibility/spatial_index.rs`
  - `cell_key`, `add_entities_in_radius`, `build_candidate_set_for_client`, `build_candidate_cells_for_client`.
  - `refresh_visibility_spatial_index`, `rebuild_visibility_spatial_index`, root/mounted child inheritance and cell migration.
- `bins/sidereal-replication/src/replication/visibility/entity_cache.rs`
  - `VisibilityRuntimeConfig`, `VisibilityRuntimeMetrics`, local view range clamp metrics.
- `bins/sidereal-replication/src/replication/visibility/context_cache.rs`
  - `VisibilityClientContextCache` and cached observer/player/faction/source context.
- `bins/sidereal-replication/src/replication/visibility/policy.rs`
  - `authorize_visibility`, `passes_delivery_scope`, and redaction-sensitive policy helpers.
- `bins/sidereal-replication/src/replication/visibility/landmarks.rs`
  - `refresh_static_landmark_discoveries`, landmark spatial query cadence and separate cell index.
- `bins/sidereal-replication/src/replication/runtime_state.rs`
  - `update_client_observer_anchor_positions`.
  - `compute_controlled_entity_visibility_ranges`.
- `bins/sidereal-replication/src/replication/control.rs`
  - role rearm, staged loss/regain behavior, and membership churn caused by control/role changes.
- `bins/sidereal-replication/src/replication/tactical.rs`
  - `stream_tactical_snapshot_messages`, `resolve_effective_scanner_source`, live contact loops, signal contacts, discovered landmark contact loops, contact budget enforcement.
- `bins/sidereal-replication/src/replication/owner_manifest.rs`
  - `stream_owner_asset_manifest_messages`.
- `bins/sidereal-replication/src/replication/input.rs`
  - `receive_latest_realtime_input_messages`, `drain_realtime_player_inputs_to_action_queue`, `report_input_drop_metrics`.

### Client prediction, replication, and control cadence

- `bins/sidereal-client/src/runtime/plugins/replication_plugins.rs`
  - ordering for Lightyear input send, control result receive, bootstrap seeding, prediction gap diagnostics.
- `bins/sidereal-client/src/runtime/transport.rs`
  - Lightyear client transport setup, input and interpolation timeline configs, focus-state timeline behavior.
- `bins/sidereal-client/src/runtime/input.rs`
  - `send_lightyear_input_messages`, `active_control_input_target`, `enforce_single_input_marker_owner`.
- `bins/sidereal-client/src/runtime/motion.rs`
  - `log_controlled_prediction_gap_diagnostics`.
  - `seed_controlled_predicted_motion_from_confirmed` as bootstrap/recovery only, not recurring repair.
- `bins/sidereal-client/src/runtime/replication/`
  - Lightyear adoption, control tag sync, predicted/interpolated/confirmed lifecycle. Inspect before changing any prediction-stage instrumentation.
- `bins/sidereal-client/src/runtime/replication/control_tags.rs`
  - verify control tag sync does not grant `SimulationMotionWriter` outside the input authority path.
- `bins/sidereal-client/src/runtime/replication/adoption.rs`
  - verify adoption paths do not reinsert `SimulationMotionWriter`, `InputMarker<PlayerInput>`, or `ActionState<PlayerInput>`.
- `bins/sidereal-client/src/runtime/debug_overlay/diagnostics.rs`
  - `track_runtime_stall_diagnostics_system`.
- `bins/sidereal-client/src/runtime/resources.rs`
  - `DebugOverlayStats`, `RuntimeStallDiagnostics`, `DuplicateVisualResolutionState`, `RuntimeAssetPerfCounters`, `HudPerfCounters`, `RenderLayerPerfCounters`, prediction tuning resources.

### Client rendering and presentation

- `bins/sidereal-client/src/runtime/plugins/presentation_plugins.rs`
  - ordering of shader assignments, render layers, duplicate suppression, streamed visuals, thrusters, effects, lighting, backdrop systems.
- `bins/sidereal-client/src/runtime/plugins/ui_plugins/in_world.rs`
  - in-world UI update systems, tactical map, sensor ring profile cache, nameplate sync, stall diagnostics, debug toggle.
- `bins/sidereal-client/src/runtime/plugins/ui_plugins/post_update.rs`
  - camera follow after Lightyear interpolation/correction, streamed layer transforms, planet visual updates, sensor ring, nameplates, debug overlay snapshot/draw scheduling.
- `bins/sidereal-client/src/runtime/visuals/duplicate_resolution.rs`
  - `suppress_duplicate_predicted_interpolated_visuals_system`.
  - Dirty GUID collection currently reacts to role markers and motion/confirmed changes; measure before narrowing.
- `bins/sidereal-client/src/runtime/render_layers.rs`
  - `sync_runtime_render_layer_registry_system`.
  - `resolve_runtime_render_layer_assignments_system`.
  - `collect_watched_component_dirty_entities`, which scans archetypes containing watched components.
- `bins/sidereal-client/src/runtime/visuals/streamed.rs`
  - `cleanup_streamed_visual_children_system`.
  - `attach_streamed_visual_assets_system`, procedural asteroid image generation, per-entity material creation, streamed child spawn.
- `bins/sidereal-client/src/runtime/visuals/planets.rs`, `visuals/thrusters.rs`, `visuals/effects.rs`, `visuals/materials.rs`
  - planet pass lifecycle, plume visual updates, effect pools, material update patterns.
- `bins/sidereal-client/src/runtime/ui/nameplates.rs`
  - `sync_entity_nameplates_system`, `update_entity_nameplate_positions_system`.
- `bins/sidereal-client/src/runtime/ui/tactical_map.rs`
  - `update_tactical_map_overlay_system`, `upsert_tactical_map_marker`, `prewarm_tactical_map_marker_svgs`.
- `bins/sidereal-client/src/runtime/sensor_ring.rs`
  - `update_tactical_sensor_ring_overlay_system`, sensor ring SVG/rect upserts and contact projection.
- `bins/sidereal-client/src/runtime/debug_overlay/snapshot.rs`
  - `collect_debug_overlay_snapshot_system`.
- `bins/sidereal-client/src/runtime/debug_overlay/gizmos.rs`, `velocity_arrows.rs`, `candidates.rs`
  - debug draw cost and collision outline visualization.
- `bins/sidereal-client/src/runtime/backdrop/starfield.rs`
  - `update_starfield_material_system`.
- `bins/sidereal-client/src/runtime/backdrop/tactical_overlay.rs`, `fullscreen.rs`, `fullscreen_sync.rs`, `space_background.rs`
  - fullscreen layer and tactical/map backdrop material lifecycle.

### Client assets and material streaming

- `docs/features/active/asset_delivery_contract.md`
  - asset delivery invariants and cache requirements.
- `bins/sidereal-client/src/runtime/assets.rs`
  - `mark_runtime_asset_dependency_state_dirty_system`.
  - `sync_runtime_asset_dependency_state_system`.
  - `queue_missing_catalog_assets_system`.
  - `poll_runtime_asset_http_fetches_system`.
  - `cached_asset_bytes`, `cached_image_handle`, `cached_svg_handle`.
- `bins/sidereal-client/src/runtime/startup_assets.rs`
  - bootstrap-required asset flow and world-loading transition.
- `bins/sidereal-client/src/runtime/shaders.rs`
  - shader assignment dirtying, streamed shader reloads, cache/source shader parity.
- `crates/engine-asset-runtime` and generated Lua catalogs
  - asset dependency metadata, cache index, checksum/version handling.

### AI, physics, and shared gameplay simulation

- `crates/sidereal-game/src/flight.rs`
  - `process_flight_actions`.
  - `apply_navigation_targets_to_desired_motion`.
  - `apply_engine_thrust`, including per-tick hash maps for control, engines, fuel, kinematics, and actuator state.
  - `clamp_angular_velocity`, `stabilize_idle_motion`.
- `crates/sidereal-game/src/ifcs.rs`
  - IFCS math and allocation helpers.
- `crates/sidereal-game/src/mass.rs`
  - `recompute_total_mass`, `bootstrap_root_dynamic_entity_colliders`, collider construction.
- `crates/sidereal-game/src/asteroid_field.rs`
  - `fracture_depleted_asteroid_members`, fracture child spawning, procedural collision outline generation.
- `crates/sidereal-game/src/collision_outline_generation.rs`
  - PNG/RGBA outline extraction and simplification.
- `bins/sidereal-replication/src/replication/runtime_scripting.rs`
  - `refresh_script_world_snapshot`, `run_script_intervals`, `run_script_events`, `apply_script_intents`.
- `bins/sidereal-client/src/platform/native/config.rs`
  - nearby collision proxy radius/max flags.

## 5. Baseline Measurement and Instrumentation Plan

Measure before optimizing, but do not begin profiling until the Phase 0a prediction/control stability gate passes. The first profiling slice should add diagnostics and run the same repro with controlled toggles.

### Phase 0a prediction/control stability gate

This gate must pass before dense-area profiling, spatial partitioning, render-layer optimization, streamed visual optimization, or tactical/contact-index optimization begins.

The latest repro finding is that client control tag sync could re-grant `SimulationMotionWriter` outside the input authority path. That invalidates dense-area profiling because a growing `Ctrl TickGap` can be amplified or masked by incorrect local authority ownership. First verify component ownership in a post-fix repro:

- Active focused predicted controlled entity:
  - may regain `SimulationMotionWriter` only through the active input authority path;
  - may have `InputMarker<PlayerInput>` and `ActionState<PlayerInput>` only while the control lease is active and predicted.
- Unfocused, recovery, hard-resync pending, camera-only free-roam, and pending control states:
  - must have no `SimulationMotionWriter`;
  - must have no `InputMarker<PlayerInput>`;
  - must have no `ActionState<PlayerInput>`.
- `Update`, `PostUpdate`, adoption, and control-tag systems:
  - must not reinsert `SimulationMotionWriter`;
  - must not reinsert `InputMarker<PlayerInput>`;
  - must not reinsert `ActionState<PlayerInput>`.
- Diagnostics must expose these fields separately for the local controlled candidate and confirmed sidecar:
  - `has_motion_writer`;
  - `has_input_marker`;
  - `has_action_state`;
  - `has_flight_authority`;
  - confirmed history newest tick;
  - confirmed sidecar tick;
  - prediction history newest tick.
- Capture the post-fix repro in:
  - empty space;
  - dense asteroid space;
  - overlay off and overlay on;
  - focus loss and recovery.

The gate is complete only when these captures show that authority components are absent in every inactive/pending state and that the active focused predicted controlled entity regains `SimulationMotionWriter` exclusively through the input authority path.

Current capture status as of 2026-04-29:

- Empty-space native headless capture: complete for authority tuple ownership.
- Dense asteroid native headless capture: complete for authority tuple ownership against 150 `asteroid_field_member` entities.
- Native overlay off/on capture: complete in `data/debug/phase0a/windowed_phase0a_summary_20260429_163809.txt`.
- Native focus loss/recovery capture: complete in `data/debug/phase0a/windowed_phase0a_summary_20260429_163809.txt`.
- Dense windowed Phase 0 baseline: complete in `data/debug/phase0_baseline/phase0_windowed_summary_20260429_084234.txt` for the current local persisted world. It proves the harness reaches authenticated session-ready/control state without the stale bootstrap-timeout dialog and records client churn, message-apply, focus, and overlay counters.
- Dense headless Phase 0 baseline: available in `data/debug/phase0_baseline/phase0_headless_summary_20260429_083112.txt`; it is useful for server input/tactical timing but does not exercise native presentation overlays.

Current Phase 0 baseline harness:

- Script: `scripts/capture_phase0_dense_baseline.sh`.
- Modes: `SIDEREAL_PHASE0_CAPTURE_MODE=headless|windowed`.
- Tunables: `SIDEREAL_PHASE0_CAPTURE_DURATION_S`, `SIDEREAL_PHASE0_INPUT_SCRIPT`, `SIDEREAL_PHASE0_PLAYER_ENTITY_ID`, `SIDEREAL_PHASE0_CONTROLLED_ENTITY_ID`, `SIDEREAL_PHASE0_EXTRA_HEADLESS_CLIENTS`, `SIDEREAL_PHASE0_EXTRA_PLAYER_ENTITY_IDS`, `SIDEREAL_PHASE0_EXTRA_ACCOUNT_IDS`, `SIDEREAL_PHASE0_EXTRA_CONTROLLED_ENTITY_IDS`, `SIDEREAL_PHASE0_DATABASE_URL`, `SIDEREAL_PHASE0_SESSION_READY_TIMEOUT_S`, `SIDEREAL_PHASE0_OUT_DIR`.
- Output: timestamped replication log, client log, build log, and summary under `data/debug/phase0_baseline/`.
- Baseline validity: require `baseline_complete=true`, `client_exit_status=0`, `session_ready>0`, `control_ack>0`, `server_auth_bound>0`, `server_auth_denied=0`, `session_timeout=0`, and `bootstrap_timeout=0` before comparing performance counters.

### Repro scenes

Run each scene with the same controlled entity, input script, window state, and camera path:

1. Empty local space: no dense asteroid field.
2. Static asteroid field: 150-200 nearby entities, no active AI and no fracture/destruction.
3. Churn field: same density, with controlled entry/exit across visibility boundaries.
4. Presentation-heavy field: nameplates, tactical map, sensor ring, and debug overlay enabled in combinations.
5. Focus/stall case: native focus loss and regain, including a deliberately heavy presentation frame.

For each scene, record at least 60 seconds after warmup and separate:

- focused native client;
- unfocused/recovered native client;
- debug overlay off;
- debug overlay on;
- tactical map off/on;
- nameplates off/on;
- shader/material hot reload disabled/enabled only if testing asset lifecycle.

### Server metrics to capture

- Fixed tick duration and fixed overrun count.
- `receive_latest_realtime_input_messages`:
  - messages received per second;
  - accepted per second;
  - drop counts by reason;
  - highest received tick and accepted tick per control stream;
  - input receive wall time.
- `drain_realtime_player_inputs_to_action_queue`:
  - accepted tick applied to action queue;
  - time from input receive to action drain;
  - controlled target/generation mismatch count.
- Physics/sim:
  - Avian prepare/step/writeback duration if accessible through Bevy/Avian diagnostics;
  - `process_flight_actions` duration and action count;
  - `apply_engine_thrust` duration, controlled roots, mounted engines, tanks, map sizes;
  - `recompute_total_mass` duration, dirty roots, module edges, inventory entries.
- Visibility:
  - existing `VisibilityRuntimeMetrics` fields;
  - add evaluated policy pair count;
  - add candidate bypass count;
  - add membership diff count by client and by entity;
  - add visibility gain/loss reliable message volume if available;
  - add role rearm staged loss/regain suppression counts.
- Tactical/owner lanes:
  - tactical active scanner sources;
  - replicated entities scanned;
  - candidate contacts before redaction;
  - contacts sent;
  - contact budget truncations;
  - tactical stream duration per player and total;
  - owner manifest entities scanned, entries sent, delta sizes.

### Network metrics to capture

Add diagnostic-only timestamps and ticks where possible:

- client input created at local monotonic time and input tick;
- server receive time and server generated tick;
- server action-drain time;
- server replication send time for confirmed state, if accessible without invasive Lightyear changes;
- client packet/message receive time;
- client confirmed-state application time;
- client frame presented time.

The goal is to calculate:

- client input creation -> server receive;
- server receive -> action drain;
- action drain -> replicated confirmed send;
- replicated confirmed send -> client receive;
- client receive -> confirmed state applied;
- confirmed state applied -> rendered/debug ghost visible.

If Lightyear internals make some timestamps unavailable, add Sidereal diagnostic messages or counters around the Sidereal-owned channels first and use Lightyear logging only as secondary evidence.

### Client metrics to capture

- `Ctrl TickGap` at p50/p95/p99 and max, plus local timeline tick and freshest confirmed tick.
- `RuntimeStallDiagnostics`: update delta, stall gap, fixed runs per frame, focus transition age.
- Message receive/application:
  - confirmed state messages received per frame;
  - confirmed ticks received per controlled GUID;
  - confirmed tick age at receipt and after application;
  - time spent polling/applying Sidereal tactical/control/manifest messages;
  - Lightyear receiver/apply timing if accessible.
- Prediction/control authority diagnostics:
  - `has_motion_writer`;
  - `has_input_marker`;
  - `has_action_state`;
  - `has_flight_authority`;
  - confirmed history newest tick;
  - confirmed sidecar tick;
  - prediction history newest tick;
  - control bootstrap phase and active input authority target;
  - component grant/removal system name for any authority-component transition when detailed tracing is enabled.
- Churn:
  - entities spawned/despawned per frame;
  - `WorldEntity` added/removed;
  - visibility gain/loss messages observed per frame if accessible;
  - predicted/interpolated/confirmed lane marker added/removed;
  - `CanonicalPresentationEntity` and `SuppressedPredictedDuplicateVisual` inserts/removals.
- Duplicate resolution:
  - dirty GUID count;
  - recomputed group count;
  - winner swap count per frame;
  - system duration.
- Render layers:
  - registry sync duration and rebuild reason;
  - assignment full scans vs targeted scans;
  - dirty entities;
  - watched component archetypes scanned;
  - assignment recompute duration.
- Streamed visuals:
  - visual child attach/detach counts;
  - procedural asteroid image generations and duration;
  - generated images added;
  - material assets added by material type;
  - child spawn duration;
  - cleanup clears by reason: reload, suppression, procedural fingerprint, material kind change, player/control marker, missing asset.
- Asset runtime:
  - dependency dirty reasons;
  - dependency graph rebuild duration;
  - cache sync reads per frame;
  - cache misses;
  - queued fetches;
  - fetch/persist completion durations;
  - shader reload count and duration.
- UI and debug:
  - nameplate sync and position durations already exist; add target-set diff counts and health-only updates.
  - tactical map overlay duration already exists; add marker upsert reasons and component insert counts.
  - sensor ring overlay duration, element spawns/updates/despawns, SVG cache hits/misses.
  - debug overlay snapshot entity count, grouping duration, gizmo draw duration, velocity arrow mesh sync duration.
- Rendering/backdrop:
  - material update counts for starfield/backdrop/fullscreen materials;
  - fullscreen layer rebuilds;
  - lighting collection/update duration and emitter counts.

### Instrumentation rollout

Implement instrumentation in layers so measurement itself does not become the bottleneck:

1. Cheap always-on counters:
   - frame/tick counters;
   - entity/message/churn counts;
   - p50/p95/max rolling durations for known hot systems;
   - dirty-reason enums stored in existing diagnostics resources.
2. Opt-in detailed profiling:
   - per-GUID duplicate-resolution samples;
   - per-cell visibility query samples;
   - per-contact tactical candidate samples;
   - per-asset cache validation/fetch traces.
3. Correlated trace IDs:
   - use player entity ID, controlled entity ID, control generation, local input tick, server generated tick, and confirmed tick where available;
   - avoid raw Bevy `Entity` IDs in persisted logs or cross-service diagnostics.
4. Repro output:
   - write summary lines to the existing workspace-relative `./logs/` files;
   - keep detailed per-frame dumps behind explicit env flags;
   - make dense-field runs comparable by recording app build, scene seed, asset cache state, overlay toggles, and focus state.
5. Exit criteria for instrumentation:
   - every proposed quick win must name the metric it expects to improve;
   - every optimization phase must re-run the baseline scene set;
   - if a metric regresses, keep the measurement and explain the tradeoff before proceeding.

## 6. Server Visibility and Replication Scalability Plan

### Current server visibility path

The current path is contractually sound:

1. `refresh_visibility_entity_cache` builds entity policy/source metadata.
2. `refresh_visibility_spatial_index` indexes replicated entities by effective root world position and extent.
3. `update_client_observer_anchor_positions` resolves each authenticated observer anchor from controlled entity first, player entity fallback second.
4. `compute_controlled_entity_visibility_ranges` aggregates generic `VisibilityRangeM` from controlled roots and mounted `VisibilityRangeBuffM`.
5. `update_network_visibility` builds per-client context, spatial candidates, disclosure components, desired membership, and calls Lightyear visibility gain/loss.

The scaling limitation is the final membership apply shape. Even when spatial candidates are small, the system still iterates over replicated entities and then over relevant client states for many policies. The broad apply loop should be replaced over time with cell-owned candidate diffs and per-observer membership state that processes changed cells, moved roots, changed policies, and changed observers.

### Sector grids

Use a deterministic f64-derived sector address as the first partition:

- `SectorCoord { x: i64, y: i64 }` or a region/system ID plus sector-local cell coordinates.
- Sector size should be large enough to amortize cross-sector migration and small enough to bound per-sector active entity sets. Start with a data-driven default such as 100 km to 1,000 km depending on authored system scale, then tune by density.
- Keep sector identity server-side and persistence-friendly. Do not expose raw Bevy `Entity` IDs or use sector IDs as authorization.
- A sector owns:
  - loose grid cells for dynamic replicated entities;
  - static landmark/public-light indexes;
  - tactical contact authoring buckets;
  - observer membership subscriptions whose anchors are inside or near the sector.
- For galaxy-wide play, shard processes can own sector sets or solar-system regions. Cross-sector handoff remains server authoritative; the client never authors migration.

### Loose grids

Within a sector, use a loose uniform grid for top-down space gameplay:

- Store root entities by effective visibility/collision extent so large objects do not churn at exact cell boundaries.
- Keep mounted children tied to root migration for visibility membership unless a child has an explicit independently visible world-space lane.
- Use hysteresis: do not migrate a root to a new cell until it exits a padded loose cell bound.
- Track per-cell:
  - dynamic roots;
  - static roots;
  - public/faction/global exceptions;
  - tactical signal sources;
  - max entity extent and max signal extent.
- Make cell keying f64-safe. The current `i64` cell keys are good; future galaxy-scale code should avoid f32 `Vec3` in the server index internals.

### Hierarchical grids

Use a two- or three-level hierarchy:

1. Galaxy/region/solar-system coarse directory.
2. Sector grid for active simulation and replication ownership.
3. Loose cell grid inside active sectors.

Use the hierarchy to skip work:

- If an observer's delivery/scanner radius cannot overlap a sector, skip the sector entirely.
- If a sector has no relevant public/faction/owned exceptions and no overlapped cells, skip all contained entities.
- Static landmark discovery can use a separate static index with longer cadence, as the current landmark system already does, but should share sector/cell primitives.

Avoid introducing an adaptive tree until measured cell saturation proves uniform loose grids are insufficient. Space gameplay is sparse and top-down; sector plus loose grid usually gives more predictable update costs than a complex tree with frequent rebalance.

### Persistence-Backed Sector Lifecycle

Galaxy-scale runtime memory must eventually be bounded by unloading inactive space from Bevy ECS, but unload must be persistence-backed and server-authoritative. Sector lifecycle state belongs on the authoritative server/shard runtime and in graph persistence metadata. It must not be controlled by client camera position, debug free-roam, or presentation-only interest.

Required lifecycle states:

- `Hot`: loaded in Bevy ECS, fully simulated, and near a player, observer, combat interaction, or other immediate interaction source.
- `Warm`: loaded in Bevy ECS at reduced cadence, with no immediate player interaction but still eligible for nearby reactivation without hydration.
- `ColdPendingFlush`: no players nearby and unload is requested, but dirty graph components, hierarchy/mount relationships, tactical/index state, or script state are still being written.
- `ColdPersisted`: persistence writes succeeded and the sector's runtime entities were removed from authoritative Bevy ECS memory.
- `Hydrating`: graph records are being loaded back into Bevy ECS and indexes are being rebuilt before the sector can become `Hot` or `Warm`.

Unload blockers:

- Do not unload player-controlled entities or player anchor entities.
- Do not unload entities in combat, active projectiles, pending script/event targets, or entities referenced by pending gameplay events.
- Do not unload entities or sectors with in-flight persistence writes.
- Do not unload an entity whose mounted children, hierarchy edges, inventory/mass dependencies, or active physics/collision relationships cannot be flushed in the same sector transaction.
- Do not use client free-roam/camera position as an authority widening signal or a reason to keep server-side authoritative simulation hot.

Sector and cell interest should use hysteresis:

- Promote `Warm -> Hot` before an observer reaches the interaction boundary.
- Demote `Hot -> Warm` only after all nearby observers have remained outside a padded boundary for a configured dwell time.
- Enter `ColdPendingFlush` only after a longer unload dwell time, no unload blockers, and no pending observer/cell interest.
- Keep loose-cell and sector padding large enough that entities do not churn load/unload as players cross exact boundaries.
- Treat sector transitions as diffed membership events, not despawn/respawn loops for entities that remain active in an adjacent hot sector.

Persistence and despawn sequence:

1. Stop admitting new nonessential work into the sector and mark it `ColdPendingFlush`.
2. Flush dirty graph components, durable runtime components, hierarchy edges, mount relationships, inventory relationships, and sector metadata.
3. Persist `last_simulated_at`, sector epoch/revision, and any coarse offline-progression inputs needed to advance cold state during hydration.
4. Verify write success for every required entity/component/relationship batch.
5. Re-check interest, unload blockers, in-flight writes, runtime entity presence, and hierarchy/root containment immediately before runtime removal.
6. Only after verification and the final pre-removal checks, remove authoritative runtime entities from Bevy ECS memory, purge runtime visibility indexes/caches, and mark the sector `ColdPersisted`.
7. Record enough audit metadata to distinguish a clean cold unload from a crash/restart recovery path.

Hydration sequence:

1. Mark the sector `Hydrating` and block authoritative interaction until hydration finishes.
2. Load graph entity records and component records by stable IDs. No raw Bevy `Entity` IDs may appear in persisted sector state.
3. Rebuild Bevy hierarchy and mount relationships deterministically.
4. Recompute mass/inertia, physics bodies, collision proxies, visibility indexes, tactical indexes, scanner/contact authoring caches, asset ownership read models, and script snapshots from durable state.
5. Apply coarse offline progression from `last_simulated_at` and sector epoch before exposing the sector as `Hot` or `Warm`.
6. Publish cell/sector membership diffs after indexes are ready, preserving the `Authorization -> Delivery -> Payload` visibility contract.

Acceptance for this architecture:

- A sector never reaches `ColdPersisted` until graph persistence acknowledges all required dirty data.
- A sector never reaches `ColdPersisted` until the authoritative server has also removed the flushed runtime entities from Bevy ECS memory.
- Hydrating the same persisted sector twice produces deterministic hierarchy, mount, mass/inertia, physics, visibility, tactical, and script snapshot state.
- Player control, combat, active projectile, event target, and in-flight write blockers prevent unload even when observer interest is absent.
- Client camera/free-roam state has no effect on server authority scope or sector hotness.

### Interest management and cell streaming

Define interest at two levels:

- Authorization interest: owner, faction, public, discovered, scanner/range policy.
- Delivery interest: which cells and entities are currently worth sending to an observer.

Target server model:

- Each observer owns an `ObserverInterestState`:
  - authenticated player entity ID;
  - current observer anchor position;
  - controlled entity ID/generation if any;
  - delivery radius and local view mode;
  - scanner/visibility sources;
  - current subscribed cells;
  - current visible entities;
  - pending membership gain/loss queues.
- Each cell owns reverse membership:
  - observers overlapping the cell;
  - roots inside the cell;
  - dirty flags when roots/policies/source ranges change.
- Visibility update then processes:
  - moved observers;
  - moved roots;
  - changed policy components;
  - changed ownership/faction/public/discovery state;
  - changed local-view settings;
  - role rearm events.

Membership diffs should be calculated from changed cell/entity/observer sets, not from `all_entities x all_clients` every tick.

Cell streaming rules:

- Stream current cells first, adjacent cells next, distant cells never unless authorized by tactical/stale-intel lane.
- Use gain/loss budgets per observer per tick to avoid burst spikes when crossing dense sector boundaries.
- Prioritize controlled entity, owned entities, threats/contacts already authorized, and closest visible entities.
- Defer lower-priority gains under budget pressure, but never drop required owner/control state.
- Use hysteresis and minimum-residency windows to prevent cell-edge add/remove thrash.

### Entity migration

Migration must be root-based and deterministic:

- Compute root position from authoritative Avian `Position` or `WorldPosition`, not render `Transform`, unless no authoritative lane exists.
- Migrate root and inherited mounted children together for visibility membership.
- Keep old cell membership until the new cell membership is committed, then emit a single migration event.
- For cross-sector migration, update sector-local indexes and observer interest states atomically from the point of view of visibility membership.
- Avoid same-tick lose/regain churn when an entity crosses a cell boundary inside the same observer interest radius.

### Observer query budgets

Add budget controls after instrumentation:

- max sectors queried per observer update;
- max cells queried per observer update;
- max candidates evaluated per observer update;
- max visibility gains/losses sent per observer per tick;
- max reliable spawn/resend bytes per observer per tick if Lightyear exposes usable estimates;
- max tactical contacts considered per scanner per interval;
- deferral queue age and starvation counters.

Budgets must preserve contract correctness:

- Authorization is still evaluated before delivery/payload.
- Deferred delivery is allowed; unauthorized delivery is not.
- Owned/currently controlled state must be prioritized.
- A budget miss should be visible in metrics, not hidden as "not visible".

### Tactical lane scalability

`stream_tactical_snapshot_messages` now consumes an owned tactical authoring cache and spatial candidate index instead of scanning all replicated entities inside each streamed player loop. Discovered landmarks resolve from the same cache by GUID lookup.

Implement the already planned target model from `server_authoritative_tactical_scanner_and_contact_index_plan_2026-04-27.md`:

- `EffectiveScannerSourceCache` keyed by player entity ID. The first implementation exists and reports cache/resolution metrics; dirty invalidation and multi-sector validation remain open.
- `TacticalContactAuthoringCache` keyed internally by server-runtime world entity and externally by GUID. Dirty per-entity maintenance exists; the remaining work is to remove noisy semantic no-op dirty scans and validate under multi-sector membership.
- `TacticalContactSpatialIndex` keyed by f64-derived cell.
- `PlayerTacticalStreamState` consumes candidate sets from the index instead of scanning all replicated entities.

Extend metrics with active scanner sources, spatial cells scanned, candidate count, redacted count, contact budget truncation count, discovered landmark candidates, and per-player tactical stream duration. The first implementation now covers scanner-source cache timing, authoring cache rebuild/upsert/removal/no-op counts, spatial queried cells, candidate disposition, contact budget truncation, discovered landmark lookups, and per-player tactical stream duration.

## 7. Client Dense-Area Performance Plan

### What not to assume

Do not assume 150-200 replicated entities is inherently too many. Bevy can handle that count when work is stable and batched. The dense-field problem is likely the amount of changed work caused by entering the area.

### Churn paths to instrument first

1. Replication lifecycle:
   - `WorldEntity` added/removed.
   - Lightyear predicted/interpolated/replicated markers added/removed.
   - `CanonicalPresentationEntity` and `SuppressedPredictedDuplicateVisual` changes.
   - visibility gain/loss bursts and role rearm events.
2. Visual lifecycle:
   - `cleanup_streamed_visual_children_system` clear reasons.
   - `attach_streamed_visual_assets_system` child spawn count and per-entity material/image creation.
   - procedural asteroid image generation count and duration.
3. Material and asset lifecycle:
   - material asset additions per frame;
   - runtime asset dependency dirty reasons;
   - cache sync reads/misses;
   - shader reloads.
4. Presentation diff systems:
   - duplicate dirty GUIDs and winner swaps;
   - render-layer watched component dirty scans;
   - tactical marker upserts/despawns;
   - sensor ring element upserts/despawns;
   - nameplate target sync and projection work.
5. Debug systems:
   - debug overlay snapshot grouping duration;
   - gizmo draw count;
   - velocity arrow mesh sync duration;
   - debug labels/callouts rebuild count.
6. Confirmed-state path:
   - newest confirmed tick received;
   - newest confirmed tick applied;
   - local timeline tick when applied;
   - delay in frames and milliseconds.

### Quick client wins after metrics

These are behavior-preserving and should be implemented before larger architecture:

- Add per-system timers and dirty-reason counters for duplicate resolution, render layers, streamed visuals, tactical map, sensor ring, debug overlay, and asset dependencies.
- Add a runtime diagnostic toggle to disable only presentation overlays and debug draw, not simulation/replication, so the dense-field repro can isolate rendering/UI cost.
- Throttle or split debug overlay snapshot work when enabled. Keep `Ctrl TickGap` visible, but make heavy collision/gizmo/group data optional or sampled.
- In `update_tactical_map_overlay_system`, avoid inserting `Svg2d`, `Transform`, and `RenderLayers` every frame when marker state did not change. Diff marker state and update only changed fields.
- Avoid prewarming tactical marker SVGs every frame for unchanged contact/icon sets. Prewarm on contact revision or icon-set revision.
- Pool tactical map and sensor ring marker entities. Hide/reuse markers instead of despawning on transient close/reopen or contact churn where possible.
- In `sync_entity_nameplates_system`, convert desired target tracking to a dirty/event-driven set, or cap target activation by on-screen/frustum priority before spawning all bars.
- In `update_entity_nameplate_positions_system`, avoid health bar node writes when health ratio did not change.
- In duplicate resolution, measure whether `Changed<Position>`, `Changed<Rotation>`, and `Confirmed<T>` are dirtying many stable groups. If so, narrow readiness dirties to lane/role/bootstrap changes or sample confirmed readiness only for groups that actually have duplicate candidates.
- In render-layer assignment, measure watched-component archetype scans. If a watched component changes every frame on many entities, move that rule away from high-frequency components or add a component-specific dirty index.
- In streamed visuals, separate one-time attach cost from repeated cleanup/reattach. Repeated clearing because of suppression, reload generation, or procedural fingerprint changes should be treated as a bug unless intentional.

## 8. Prediction and Replication Cadence Plan

### Stage definitions

Use separate metrics for four delay classes:

1. Server simulation delay:
   - input is received on server but not drained/applied to the simulation promptly;
   - fixed step overruns or falls behind wall time;
   - physics/writeback or visibility/streaming blocks fixed post-update.
2. Network delay:
   - server sends confirmed state, but the client receives it late;
   - transport queues, packet loss, jitter, or channel backlog are visible.
3. Client replication processing delay:
   - client receives confirmed state but does not apply it promptly because message polling or Lightyear processing is delayed.
4. Render/presentation delay:
   - confirmed state is applied, but the frame displaying it is late or overloaded by presentation work.

### Metrics by stage

Server simulation:

- server fixed tick index and wall-clock timestamp at:
  - input receive;
  - action queue drain;
  - physics writeback;
  - visibility membership update;
  - replication send, if available.
- fixed-step duration p50/p95/p99.
- number of fixed ticks executed per real second.
- input accepted tick vs server generated tick.

Network:

- client monotonic send timestamp and input tick, echoed in diagnostic-only server logs where safe.
- server receipt timestamp and remote ID.
- server send timestamp/tick for diagnostic messages.
- client receive timestamp.
- reliable/unreliable channel queue depth if exposed.

Client replication processing:

- messages received per frame by channel.
- newest confirmed tick received for the controlled GUID.
- newest confirmed tick applied for the controlled GUID.
- wall time from receive to apply.
- local timeline tick at apply.
- number of Bevy fixed updates run before application.

Render/presentation:

- frame time and update delta.
- fixed runs per frame.
- time spent in presentation systems listed above.
- time from confirmed application to debug ghost presentation.
- focus transitions and stall gap counters.

### Prediction guardrails

- Do not add recurring Sidereal transform repair. `seed_controlled_predicted_motion_from_confirmed` remains bootstrap/recovery only.
- Do not overwrite pending local input intent for the controlled predicted entity with replicated server intent.
- Do not neutralize active input solely because local prediction is ahead of latest confirmed tick.
- Do not bind input to confirmed/interpolated fallback entities.
- Do not let control tag sync, adoption, Update, or PostUpdate systems grant `SimulationMotionWriter`, `InputMarker<PlayerInput>`, or `ActionState<PlayerInput>`.
- The only allowed authority-component grant path is the active input authority path for the active focused predicted controlled entity.
- Lightyear remains responsible for rollback, prediction, reconciliation, and visual correction.
- Sidereal diagnostics may observe and report gaps, but must not create a second transform correction authority.

## 9. Rendering and Presentation Layer Plan

### Render layers

Current risk:

- Registry sync is mostly change-driven, but assignment can still scan watched-component archetypes.
- A rule watching a high-churn component can make dense scenes look like render-layer churn even when layer membership is conceptually stable.

Plan:

- Add timings for registry sync, full assignment scan, targeted scan, watched-component scan, and entity assignment writes.
- Add dirty-reason counters: added world entity, labels changed, override changed, unresolved, removed labels/override, watched component changed.
- Audit runtime layer rules authored by Lua/assets. Avoid rules depending on components that change every frame.
- Introduce a small watched-component dirty index if measurements show archetype scans are hot.
- Keep render-layer resolution deterministic and data-driven; do not hardcode asteroid/ship-specific layer shortcuts.

### Asteroid visuals and streamed visual children

Current risk:

- Entering a procedural asteroid field can trigger 150-200 image generations, material allocations, and child spawns.
- Repeated cleanup/reattach would multiply that cost.

Plan:

- Measure first attach separately from repeated attach.
- Pool or cache generated procedural asteroid image sets. Current cache is keyed by `(guid, fingerprint)`, which is correct for unique procedural bodies but expensive for many unique asteroids; consider a content-authored sprite-family cache or lower-resolution impostor tier if art direction allows.
- Reuse material handles when shader/image/normal/static params match. If per-entity lighting/rotation requires unique uniforms, measure whether a GPU buffer/instance path is justified later.
- Keep a stable `StreamedVisualAttached` state across frames; do not clear on unchanged material kind or unchanged procedural fingerprint.
- Add frustum/distance gating for optional high-cost child visuals only after confirming it does not affect authoritative state or visibility policy.

### Tactical map, sensor ring, and minimap-style overlays

Current risk:

- Tactical map marker upserts run every frame while active and can insert components even when unchanged.
- Marker SVG prewarm iterates contact/icon sets every frame.
- Sensor ring has similar element upsert patterns and may scale with tactical contacts.

Plan:

- Key overlay updates by tactical contact cache revision, map zoom bucket, pan/camera state, and active settings.
- Split contact diff from per-frame transform smoothing.
- Only update marker components when position, rotation, icon, layer, visibility, or scale actually changes.
- Pool markers and hide stale ones after a grace period.
- Add max visible marker budgets with deterministic priority for map mode only; this must not affect server tactical disclosure.

### Nameplates and debug labels

Current risk:

- Nameplate target sync collects, sorts, and hashes all canonical health-bearing world entities when enabled.
- Debug overlay snapshot groups world entities by GUID and builds labels/collision/debug data.

Plan:

- Make nameplate target set dirty-driven from entity added/removed, canonical winner changes, health component changes, and setting toggles.
- Apply screen/frustum/distance priority before allocating active bars.
- Update health bars only when the displayed ratio changes.
- Keep heavy debug labels/callouts/gizmos gated behind explicit debug mode and add sampling or per-frame budgets.

### Starfield/backdrop/fullscreen layers

Current risk:

- Backdrop material updates are expected every frame, but should be bounded by a small number of fullscreen materials.
- Tactical map/backdrop interaction should not rebuild fullscreen entities or material handles during dense entity entry unless settings/catalog changed.

Plan:

- Add backdrop/fullscreen rebuild counters.
- Ensure starfield and tactical overlay material updates mutate existing materials only.
- Treat any dense-field-related fullscreen layer rebuild as a regression unless caused by an authored catalog hot reload.

## 10. Asset and Material Streaming Plan

The asset delivery contract remains intact:

- Asset definitions stay Lua-authored and generated into catalogs.
- Runtime code uses asset IDs and dependency metadata, not hardcoded paths.
- Payload bytes come from gateway HTTP `/assets/<asset_guid>` and the authenticated cache adapter.
- Replication transport never carries asset payload bytes.
- WASM mounting remains byte-backed through authenticated cache/fetch adapters, not filesystem-style `AssetServer` paths.

### Dense-area asset questions to answer

- Does entering the asteroid field dirty `RuntimeAssetDependencyState`?
- Does it rebuild the dependency graph?
- Does it call synchronous cache validation for many assets?
- Are any asset IDs missing from bootstrap or runtime cache before entering the field?
- Are SVG/material/shader caches hit or missed?
- Are shader reloads or catalog reload generation changes happening during the repro?
- Are asteroid images generated once or repeatedly?
- Are materials created once per entity, once per frame, or only when visuals attach?

### Stable lifecycle target

- Required dense-field assets are known before entering the area:
  - asteroid sprite/shader/material dependencies;
  - map icons;
  - tactical/sensor ring SVGs;
  - collision/debug optional assets if needed.
- Runtime dependency graph rebuilds occur only on catalog/reload/authored asset component changes, not every frame.
- Cache validation uses in-memory readiness state for already-checked assets; avoid repeated sync reads on hot frames.
- Streamed visuals attach once per entity visibility lifetime and reuse cached image/material resources where possible.
- Asset fetch misses are visible in metrics and do not block the main presentation loop longer than the budget.
- Source shader paths and streamed cache shader paths remain schema-compatible in the same change.

## 11. AI, Physics, and Gameplay Sim Load Plan

### IFCS flight and engine thrust

Current shape:

- `process_flight_actions` is action-queue driven.
- `apply_navigation_targets_to_desired_motion` maps script navigation targets to shared IFCS desired motion.
- `apply_engine_thrust` builds several per-tick `HashMap<Uuid, ...>` aggregations for controlled roots, engines, tanks, fuel, kinematics, and actuator state.

Measure:

- controlled roots;
- mounted engines;
- fuel tanks;
- active propulsion demand count;
- map allocation duration;
- IFCS allocation duration;
- forces applied.

Staged improvements:

- Cache mounted propulsion/fuel module lists by root and dirty them on `MountedOn`, engine, tank, ownership, or module lifecycle changes.
- Cache per-root static thrust capability and fuel tank list; update dynamic fuel quantities separately.
- Keep IFCS math in shared code and fixed-step only.
- Do not duplicate client/server flight math.

### Runtime scripting and AI patrols

Current shape:

- `refresh_script_world_snapshot` clears and rebuilds a snapshot over all scripted/queryable entities.
- `run_script_intervals` clones the snapshot map into `Rc<HashMap<...>>` and iterates interval handlers by schedule.
- `run_script_events` can broadcast events to all entities when no target entity is specified.
- Scripts emit intent only, which is correct.

Measure:

- snapshot entity count and duration;
- snapshot clone bytes/count;
- interval handler candidates and actual runs;
- event fanout count;
- Lua execution duration and instruction budget hits;
- intents emitted per tick.

Staged improvements:

- Add cadence tiers for non-combat patrol logic.
- Keep a dirty snapshot or spatial/script interest subset if global snapshots become hot.
- Require broad broadcast events to have explicit budgets or target filters.
- Keep scripts intent-only; no authoritative transform/velocity mutation from Lua.

### Avian physics and collision proxies

Measure:

- dynamic, kinematic, and static body counts;
- active collider count;
- asteroid collider count;
- collision pair count if exposed;
- physics prepare/step/writeback duration;
- nearby collision proxy counts on native client.

Staged improvements:

- Keep non-physics static world entities on `WorldPosition` / `WorldRotation`, not Avian bodies.
- Use simplified asteroid collision proxies where gameplay allows.
- Apply collision layers/groups so distant decorative or tactical-only entities do not participate in unnecessary broadphase checks.
- Deactivate or downgrade collision for far entities based on server authority rules, not client visuals.
- For local client collision proxies, keep radius/max tunables and measure proxy churn when entering dense fields.

### Asteroid fields

Current shape:

- Asteroid fracture only runs for depleted members and spawns children on fracture.
- Procedural collision outlines can be generated from sprite data and should not happen repeatedly in normal dense-field entry.

Measure:

- asteroid member count;
- fractured/depleted events per second;
- collision outline generation duration;
- child spawn count;
- physics body/collider count after entry.

Staged improvements:

- Keep static asteroids as static physics bodies only if collision is needed; use generic `WorldPosition` otherwise.
- Consider field-level aggregate tactical/discovery products for far asteroids, then expand to individual entities only inside close delivery cells.
- Preserve gameplay behavior for mining/fracture; do not collapse individual authoritative entities that can be interacted with at close range.

## 12. Phased Optimization Plan: Quick Wins vs Architectural Work

### Phase 0a: Prediction/control stability gate

- Verify `SimulationMotionWriter`, `InputMarker<PlayerInput>`, and `ActionState<PlayerInput>` are owned only by the active input authority path.
- Verify the active focused predicted controlled entity can regain `SimulationMotionWriter` only through input authority.
- Verify unfocused, recovery, hard-resync pending, camera-only free-roam, and pending control states have none of the three authority components.
- Verify no `Update`, `PostUpdate`, adoption, or control-tag system reinserts the three authority components.
- Expose `has_motion_writer`, `has_input_marker`, `has_action_state`, `has_flight_authority`, confirmed history newest tick, confirmed sidecar tick, and prediction history newest tick as separate diagnostics.
- Capture the post-fix repro in empty space, dense asteroid space, overlay off/on, and focus loss/recovery.
- Block Phase 0 profiling and every optimization phase until this gate passes.

### Phase 0: Measurement and repro hardening

- Add missing timings and dirty-reason counters around existing systems.
- Add reproducible dense-field profiling toggles for debug overlay, tactical map, sensor ring, nameplates, and streamed visual attachment.
- Add tactical receive/apply timings on the client.
- Add server tactical stream duration and entity scan counts.
- Run the baseline scenes before changing behavior.

### Phase 1: Quick wins

- Reduce no-op component inserts in tactical map/sensor ring markers.
- Stop per-frame SVG prewarm for unchanged contact/icon sets.
- Add duplicate-resolution dirty GUID and duration counters before changing dirty rules.
- Add render-layer watched-component scan counters and timings.
- Add streamed visual attach/cleanup reason counters.
- Add asset dependency dirty-reason and graph rebuild duration counters.

### Phase 2: Client structural cleanup

- Make nameplate target tracking dirty-driven.
- Pool and diff tactical/sensor markers.
- Stabilize material/image caches for asteroid visuals.
- Add client confirmed tick receipt/application metrics.

### Phase 3: Server tactical and visibility read models

- Replace server tactical global scan with contact authoring cache and spatial index.
- Convert owner manifest streaming to a dirty indexed read model if owner asset count grows.
- Add role rearm and visibility membership churn budgets/metrics.

### Phase 4: MMO-scale visibility architecture

- Complete the transition from the current candidate/current-visible apply worklist to observer/cell/entity dirty diff processing.
- Introduce sector-owned loose grids and hierarchical region/sector/cell indexes.
- Add observer query budgets and deferred delivery queues.
- Add cell streaming and migration events with hysteresis.
- Add sector/shard handoff while preserving server-authoritative motion and persistence.

### Phase 5: Gameplay sim optimization

- Add background simulation tiering for distant sectors, aligned with DR-0033.
- Optimize IFCS, mass, scripting, and physics with dirty caches and cadence tiers only after visibility/client hotspots are proven.

## 13. Acceptance Criteria

### Prediction/control stability gate acceptance

- Active focused predicted controlled entity may regain `SimulationMotionWriter` only through input authority.
- Unfocused, recovery, hard-resync pending, camera-only free-roam, and pending control states have no `SimulationMotionWriter`, no `InputMarker<PlayerInput>`, and no `ActionState<PlayerInput>`.
- No `Update`, `PostUpdate`, adoption, or control-tag system reinserts `SimulationMotionWriter`, `InputMarker<PlayerInput>`, or `ActionState<PlayerInput>`.
- Diagnostics expose `has_motion_writer`, `has_input_marker`, `has_action_state`, `has_flight_authority`, confirmed history newest tick, confirmed sidecar tick, and prediction history newest tick as separate values.
- The post-fix repro is captured in empty space, dense asteroid space, overlay off/on, and focus loss/recovery.
- Spatial partitioning, render optimization, streamed visual optimization, and tactical/contact-index optimization do not begin until this gate passes.

### Measurement acceptance

- Dense-field repro captures server, network, client replication, and presentation timings in one correlated run.
- `Ctrl TickGap` can be decomposed into:
  - server sim delay;
  - network delay;
  - client replication processing delay;
  - render/presentation delay.
- Runs compare overlay off/on, tactical map off/on, nameplates off/on, and focus loss/recovery.
- Metrics report p50/p95/p99/max for relevant frame, tick, and system durations.

### Dense-area client acceptance

- In a focused native run entering a 150-200 entity asteroid field, `Ctrl TickGap` remains bounded below the configured rollback warning threshold after initial visibility warmup.
- Any initial gap spike has a known cause and bounded recovery time.
- Visibility gain and visual attachment bursts do not cause repeated attach/detach or repeated asset dependency rebuilds after warmup.
- Debug overlay, tactical map, sensor ring, and nameplate overhead can be measured independently.
- Dense-area performance remains acceptable with debug overlay disabled, even if debug mode is allowed to be heavier.

### Server visibility scalability acceptance

- Spatial candidate mode produces the same authorized visibility result as full scan in validation tests.
- Candidate preselection never widens owner/faction/public/discovered/range authorization.
- Membership churn counters stay bounded when observers cross cell boundaries.
- Tactical contact streaming no longer scans all replicated entities per active player after the contact index phase.
- Visibility update cost scales with changed observers/cells/entities, not total galaxy entities.

### Asset/material acceptance

- Entering a dense field with all required assets cached produces zero runtime asset fetches.
- Runtime asset dependency graph rebuilds happen only on real dependency/catalog changes.
- Procedural asteroid image/material creation is one-time per intended visual identity, not repeated every frame.
- Asset changes preserve the gateway HTTP asset payload path and cache checksum/version contract.

### Gameplay sim acceptance

- IFCS, mass, scripting, and physics timings are visible per fixed tick.
- Proposed optimizations do not change gameplay behavior or authority ownership.
- Shared gameplay and prediction code continues to compile for native and WASM targets.

## 14. Risks

- Instrumentation overhead can change the profile. Use cheap counters by default and sample expensive detail.
- `Ctrl TickGap` can combine multiple delays. Treat it as a symptom, not a root-cause metric.
- Debug overlay can both reveal and cause performance issues. Always compare overlay off/on.
- Spatial budgets can become invisible starvation if deferred work is not surfaced in metrics.
- Loose-grid hysteresis can hide migration bugs unless tests cover boundary crossing.
- Reusing material handles can be incorrect if per-entity uniforms are embedded in material assets. Verify shader/material binding contracts before pooling.
- Reducing duplicate-resolution dirties can reintroduce stale lane winners if the readiness contract is not explicit and tested.
- Client-side frustum/visibility gating must not be confused with server authorization. It is presentation-only.
- WASM browser throttling differs from native focus behavior. Do not build native-only assumptions into shared prediction/runtime code.

## 15. Do Not Do

- Do not add client-authoritative transform or velocity writes.
- Do not add Sidereal transform repair shims or recurring hard resync loops.
- Do not bind input to confirmed/interpolated fallback entities.
- Do not overwrite local predicted input intent with replicated confirmed intent.
- Do not let control tag sync, adoption, Update, or PostUpdate systems reinsert `SimulationMotionWriter`, `InputMarker<PlayerInput>`, or `ActionState<PlayerInput>`.
- Do not start dense-area profiling, spatial partitioning, render optimization, streamed visual optimization, or tactical/contact-index optimization until the Phase 0a prediction/control stability gate passes.
- Do not make visibility, tactical, or ownership systems ship-only.
- Do not use spatial partitioning as authorization.
- Do not widen local-view delivery range beyond the server clamp.
- Do not use client free-roam camera position to authorize or deliver server world state.
- Do not stream asset bytes over replication channels.
- Do not hardcode asset IDs, filenames, shader paths, or material definitions in Rust runtime code when they belong in Lua catalogs.
- Do not add per-player SQL side tables for runtime control/selection/camera/progression state.
- Do not downcast authoritative world positions/velocities at persistence, replication, server read-model, or dashboard/runtime boundaries.
- Do not hide dense-area problems by despawning authorized entities aggressively without a documented delivery budget and stale/intel policy.
- Do not bypass Lightyear prediction/reconciliation with a parallel local correction system.

## 16. Recommended Implementation Order

1. Complete the Phase 0a prediction/control stability gate:
   - verify authority-component ownership in active focused predicted control;
   - verify inactive, pending, free-roam, unfocused, recovery, and hard-resync pending states have no authority components;
   - verify adoption/control-tag/Update/PostUpdate systems do not reinsert authority components;
   - capture empty space, dense asteroid space, overlay off/on, and focus loss/recovery repros.
2. Add measurement scaffolding only:
   - server visibility/tactical/input timings;
   - client confirmed receipt/application timings;
   - presentation dirty-reason counters;
   - asset/material lifecycle counters.
3. Capture the dense-field baseline:
   - overlay off/on;
   - tactical map off/on;
   - nameplates off/on;
   - focus loss/recovery;
   - cached assets vs forced cold cache.
   - Current completed slice: windowed dense asteroid baseline with overlay off/on and focus loss/recovery in `data/debug/phase0_baseline/phase0_windowed_summary_20260429_084234.txt`.
4. Fix obvious no-op presentation churn:
   - marker diffing;
   - SVG prewarm revision gating;
   - duplicate/render-layer/asset dirty reason visibility;
   - nameplate health no-op writes.
5. Stabilize streamed visual and material lifecycle:
   - attach once;
   - cache procedural asteroid outputs intentionally;
   - avoid repeated material/image creation unless inputs changed.
6. Implement server tactical contact authoring cache and spatial index.
7. Re-measure dense-field behavior and confirm whether `Ctrl TickGap` is still client-stage delay.
8. Continue visibility scalability by moving from the current persistent read model, observer candidate cache, and candidate/current-visible apply worklist to cell/observer/entity dirty diff maintenance behind metrics, preserving full-scan validation.
9. Add query budgets, hysteresis, and deferred membership queues.
10. Add sector/hierarchical grid architecture for galaxy scale.
11. Optimize IFCS/mass/scripting/physics with dirty caches and cadence tiers after visibility/client hotspots are proven.

## 17. Native and WASM Impact Notes

Native:

- Native remains the primary validation target during current stabilization.
- Dense-field profiling should use persisted process logs and in-game diagnostics.
- Focus-loss recovery must be measured explicitly because native clients can continue running unfocused with current settings but may still accumulate presentation or replication delay.
- Windows target checks are required for client runtime changes that touch shared client code.

WASM:

- No native-only architecture should be introduced in shared gameplay, prediction, replication, visibility, or asset lifecycle code.
- WASM transport remains WebTransport-first; WebSocket is only an explicit fallback.
- Browser throttling/focus behavior differs from native, so focus recovery metrics should be target-aware.
- Asset/cache changes must keep byte-backed authenticated cache/fetch adapters and must not rely on filesystem-style runtime asset paths.
- Client code touching shared runtime, transport/bootstrap boundaries, dependencies, or asset/loading paths must continue to compile for `wasm32-unknown-unknown` with `bevy/webgpu`.

## 18. Documentation Follow-Up

Update these docs when implementation begins:

- `docs/features/active/visibility_replication_contract.md` if visibility budgeting, cell streaming, observer query semantics, tactical delivery, or redaction behavior changes.
- `docs/features/reference/prediction_runtime_tuning_and_validation_reference.md` when new `Ctrl TickGap` stage metrics or prediction cadence guardrails are added.
- `docs/features/active/asset_delivery_contract.md` if runtime asset lifecycle, cache state machine, or material dependency behavior changes.
- `docs/plans/completed/server_authoritative_tactical_scanner_and_contact_index_plan_2026-04-27.md` when tactical contact index phases are implemented or superseded.
- `docs/decision_register.md` plus a `docs/decisions/dr-XXXX_<slug>.md` detail file if sector streaming, query budgets, or shard/sector ownership becomes a project-wide decision.

## Closure Note (2026-07-05)

Phases 0-5 implemented (async procedural asteroid generation, tactical prewarm split, budgeted streamed-visual attach, nameplate no-op gate); the cell-dirty visibility worklist is the default AOI apply path since 2026-05-09 (env rollback available). Remaining dense-area A/B captures are evidence-only and tracked in `docs/plans/active/gap_closure_and_finalization_plan_2026-07-05.md`, as is the deliberately deferred idle-CPU Update-loop throttling.
