# Visibility and Replication Contract

Status: Active
Lifecycle: source-of-truth
Category: feature
Last updated: 2026-09-06
Owners: feature owners
Scope: Visibility and Replication Contract.
Source of truth: yes
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

Primary references:
- `docs/architecture/sidereal_design_document.md`
- `AGENTS.md`
- `docs/decisions/dr-0017_dual_lane_replication_and_owner_asset_manifest.md`
- `docs/plans/superseded/scan_intel_minimap_spatial_plan_2026-03-05.md`
- `docs/features/active/visibility_system_v2_signal_detection_contract.md`

## 0. Implementation Status

2026-09-07 station authority: a ship control request and each authoritative input
drain require the requesting character to occupy a real control station. Seat exit
revokes the lease and advances its generation; sequence-zero reliable control acks
announce server-driven station transitions. Ownership/view mode do not substitute
for occupancy. Crew records remain private; see `crew_interiors_contract.md`.

2026-09-07: protocol 21 adds the receiving character's persisted Space Sim/RPG
view preference to its private crew snapshot. It is not included in other
occupants' avatar records and grants no additional visibility. Seat and mode
checks both gate pilot input; see the independent view section of the crew contract.

2026-09-06 crew update: attached characters observe from their authoritative
projected body. Their player ECS entity stays owner-only. Authorized physical
frame occupants receive a separate private deck/pose read model, with reliable
revocation and generation checks; exterior observers receive no crew payload.
See [crew interiors](crew_interiors_contract.md). Native and WASM consume the same
protocol 20 view lane; this does not widen fitting-entity ownership.

2026-09-06 modular hull privacy: `OwnerOnlyVisibility` is a persisted generic
whole-entity restriction, checked before public, faction and range delivery.
It does not make an entity a player anchor; an entity without an owner receives
no owner grant. Mounted construction fittings use this restriction so their
names, existence, masses and inventory cannot leak through otherwise-public
components. `InteriorVisual`, `HullAssembly`, `HullModule` and directional actuator
configuration are owner-only component lanes. Public `CompositeVisual`,
`CompoundCollision` and transient `PropulsionVisual` contain only exterior
presentation and physics. These travel through the existing root-owner replication
and shard handoff lanes; native and WASM use protocol 19 together.

2026-09-06 zone transport correction: protocol 19 replaces the unusable internally
tagged binary `ZoneBoundary` encoding with enum discriminants and retains every
optional slot in `ZoneLayers`/`ZoneField`. Authored boundary JSON stays tagged by
`kind`; layer/field optionals serialize as nullable fields. All world coordinates
remain f64. Ownership stays with the zone's existing shard; existing handoff and
public visibility lanes carry the same state with no additional disclosure.
Both native and WASM clients must rebuild. This is a local Serde representation
error, not a Lightyear-fork defect.


2026-08-31 motion full-state and input-identity hardening:

1. `Position`, `Rotation`, `LinearVelocity`, and `AngularVelocity` now all use full-state Lightyear replication. The final velocity delta-compression registrations and the now-unused `SIDEREAL_REPLICATION_MOTION_KEYFRAME_EVERY_N_TICKS` parser were removed after persisted loss/stall evidence continued to show retained-base fallback warnings. Protocol v17 deploys client and server together.
2. Realtime-input rate limiting is keyed by the authenticated Lightyear client entity (the bound connection identity), not `ClientRealtimeInputMessage.player_entity_id`. A changed/spoofed player claim therefore cannot create a new quota bucket; distinct connections retain independent windows. Player/control timeline cleanup no longer resets a live connection's rate limit, while disconnected client entities are removed by the existing live-client cleanup pass.
3. Authority/distribution answers: the owning shard still authors motion and accepts input; handoff continues to freeze/rebind input under the existing lease/generation path and transfers motion through the existing handoff lane; motion remains visible only through the established public/owner replication policy with no new disclosure lane or persistence shape.
4. Native/WASM impact: shared protocol registration changes, so both client targets must rebuild. The rate-limit key change is replication-server-only and does not alter the input message schema.

2026-06-15 visibility read-model f64 precision (authoritative Transform fallback hardening, audit-plan Phase 6):

1. The visibility/AOI spatial read model now represents entity world positions as f64 (`DVec2`) end-to-end: `cell_key`/`sector_key`, the spatial-index position maps (`world_position_by_entity` / `visibility_position_by_entity`), observer-anchor positions (`ClientObserverAnchorPositionMap`, `observer_anchor_world_position`), `visibility_sources`, and the candidate/distance/range gates in `spatial_index.rs`, `policy.rs`, and `membership.rs`. Previously positions were quantized to f32 (`Vec3`) before cell bucketing and range gating, losing >1 m of precision at large world coordinates (≥~1e6 m). Range/extent magnitudes remain f32; distance comparisons are computed in f64.
2. All authoritative position resolvers (`replicated_visibility_world_position`, `observer_anchor_world_position`, tactical `tactical_world_position`) prefer `Position`/`WorldPosition` (f64) and only fall back to the f32 `GlobalTransform`/`Transform` when an entity has neither — an anomaly for authoritative entities. That last-resort fallback is now explicitly documented and finiteness-guarded; it remains a lossy presentation safety net, not an authoritative source.
3. Known boundary: the serialized `VisibilityRangeSource` disclosure DTO (`engine-spatial`, replicated/persisted) is still f32 and is projected down at the `membership.rs` boundary (`x as f32`, `y as f32`, `z: 0.0`). Internal AOI authorization/delivery gating is f64; widening that wire DTO is a separate follow-up (tracked `TODO(f64)`).
4. Native/WASM impact: replication-server-only. No protocol, client runtime, ordering, or authorization-policy change — the visibility order remains `Authorization -> Delivery -> Payload`; this is a numeric-precision widening only. Coverage adds large-coordinate (~5e6 m) cell-key and distance-gate unit tests that fail under the old f32 path.

2026-06-11 target-selection owner-only action lane:

1. Target selection (`system.target_selection.v1`) adds a client→server action lane on the reliable `ControlChannel`: `ClientSelectTargetRequestMessage` / `ServerSelectTargetRejectMessage` and `ClientScanRequestMessage` / `ServerScanResultMessage`. Handlers live in `bins/sidereal-replication/src/replication/target_selection.rs`.
2. Authorization reuses the existing model: a target is selectable only if owned (`OwnerId`) or currently visible to the requesting client (per `VisibilityMembershipCache`); ghost targets are rejected with `GHOST_AUTHORITY_REJECT_REASON`; the claimed `player_entity_id` must match the authenticated binding (spoof rejected), consistent with the input-routing rule.
3. The authoritative selection lives on the player entity's `SelectedEntityGuid` (`OwnerOnly`, `persist=true`) and replicates back to the owning client only — never via tactical/faction/ghost lanes. Disclosure of target intel is governed by `docs/features/active/target_intel_and_scanner_disclosure_contract.md`.

2026-05-24 cross-shard ghost lane closure (Phase 6, Option 2: TCP-IPC):

1. The earlier `GhostChannel` Lightyear-channel registration (2026-05-23 scaffolding note below) has been removed. Subscribing a shard as a Lightyear client of its neighbour would re-register prediction/rollback in the subscriber against the same Avian2D `Position`/`Rotation`/`LinearVelocity`/`AngularVelocity` components the owning shard is authoritatively simulating (see the `Client` branch of `crates/sidereal-net/src/lightyear_protocol/registration.rs`), corrupting source-of-truth state on the subscribing shard. The user-chosen Option 2 closes Phase 6 by carrying the ghost lane on a dedicated **TCP-framed bincode IPC transport**, modelled on `sidereal-persistence-service`, instead of any Lightyear channel.
2. Runtime now lives in `bins/sidereal-replication/src/replication/ghost_lane.rs`. Each shard process opens a TCP listener bound to `SIDEREAL_GHOST_LANE_BIND` for inbound ghost traffic, and opens one outbound TCP connection per neighbour shard listed in `SIDEREAL_GHOST_LANE_PEER_ENDPOINTS` with the bounded retry schedule `[50, 100, 200, 400, 800]ms` (same schedule as the persistence-service IPC client). Frames use `sidereal_ghost_lane::{read_frame, write_frame}` exactly as designed.
3. `GhostMarker` (component) remains; only the Lightyear `GhostChannel` was deleted. The `record_is_border_adjacent_to_neighbour` filter at `bins/sidereal-replication/src/replication/simulation_entities.rs:830` and the control-reject path at `bins/sidereal-replication/src/replication/control.rs` are unchanged from the 2026-05-23 scaffolding.
4. Native/WASM impact: server-side only. Client protocol and transport are unchanged. The `GHOST_AUTHORITY_REJECT_REASON` string remains the only client-visible artifact and is identical to the previous scaffolding.

2026-05-23 cross-shard ghost lane scaffolding (Phase 6 — superseded by 2026-05-24 above for the channel topology):

1. The cross-shard ghost lane wire protocol crate `crates/engine-ghost-lane` has landed with bincode-framed `GhostLaneMessage` DTOs, a frame codec, the canonical `is_border_adjacent_to_region` helper, and the canonical reject-reason constant `GHOST_AUTHORITY_REJECT_REASON`. f64 world coordinates remain on the wire per DR-0035 / DR-0040 §2.8.1. **Carried forward unchanged.**
2. ~~`GhostChannel` is registered alongside the existing client-server channels in `crates/sidereal-net/src/lightyear_protocol/{channels,registration}.rs` (Sequenced Unreliable, priority 4.0, bidirectional).~~ **Superseded** by the 2026-05-24 closure: ghost lane is a TCP-IPC transport, not a Lightyear channel. `GhostMarker` is a runtime-only marker component (`persist=false`, `replicate=false`) in `crates/sidereal-game/src/components/ghost_marker.rs`; other systems short-circuit on its presence. **`GhostMarker` carried forward unchanged.**
3. `bins/sidereal-replication/src/replication/simulation_entities.rs` exposes the border-adjacency probe `record_is_border_adjacent_to_neighbour` as an extension of the existing shard-ownership filter (single filter pipeline; uniform-grid scope only with `TODO(phase-8)` for non-uniform regions). **Carried forward unchanged.**
4. `bins/sidereal-replication/src/replication/control.rs` rejects client control requests whose target is a `GhostMarker`-tagged entity by reusing `ServerControlRejectMessage` with `GHOST_AUTHORITY_REJECT_REASON` (no new message type). The `controllable_entities` query carries an `Option<&GhostMarker>` projection to stay under Bevy's system-parameter tuple limit. **Carried forward unchanged.**
5. Producer/subscriber Bevy systems, the inter-shard transport wiring, the two-process ghost integration test, the tier-100 bandwidth comparison, and border-zone latency measurement remain open. **Closed by the 2026-05-24 note above.**
6. Native/WASM impact: server-side scaffolding only. No client protocol or transport change. The `GHOST_AUTHORITY_REJECT_REASON` string is the only new wire-visible artifact; clients branching on it must match the exact string.

2026-05-23 monotonic delta-ack update:

1. Sidereal now depends on `Dastari/lightyear` commit `019048ca638cd3c2727054d6f3342a34f460753e`, which carries the 2026-05-21 lossless motion delta/keyframe payload plus a generic monotonic `delta_ack_ticks` fix for out-of-order ack delivery.
2. The fork continues to call `DeltaManager::receive_ack` for every ack tick so retained delta-base accounting is released, while older/equal acks no longer overwrite newer per-entity/per-component ack ticks used to select the next delta base.
3. Post-bump validation shows the direct single-client path is clean (`connect_burst_warns=0 steady_state_warns=0`), but a ten-client load-wrapper smoke still emits `3012` fallback warnings during multi-client connect/fanout. Treat the residual as a Lightyear fork follow-up, not a Sidereal-side workaround; see `docs/prompts/handoffs/open/lightyear_delta_base_multi_client_connect_burst_handoff_2026-05-23.md`.
4. Native/WASM impact: shared Lightyear dependency revision changed. No Sidereal wire format, visibility authorization, payload redaction, persistence shape, or motion keyframe default changed.

2026-05-22 observer hard-cap update:

1. Observer candidate cells and entities now have explicit default-off hard caps: `SIDEREAL_VISIBILITY_OBSERVER_CANDIDATE_CELL_HARD_BUDGET` and `SIDEREAL_VISIBILITY_OBSERVER_CANDIDATE_ENTITY_HARD_BUDGET`.
2. Soft-budget env vars remain telemetry-only. Hard-budget env vars cap the candidate workset before the reverse candidate map and membership apply path consume it.
3. Cap priority is deterministic: keep currently visible memberships first, then higher visibility classes such as owned/global/public/faction/discovered/range candidates, then nearest candidates, then stable entity/cell order.
4. Health exposes the configured hard caps and capped totals through `visibility_observer_candidate_*_hard_*` fields. Phase 0 summaries also parse the summary-log `observer_hard_cap[...]` block.
5. Native/WASM impact: replication-server visibility work budgeting and diagnostics only. No client protocol, client transport, persistence shape, or payload-redaction policy changed.

2026-05-21 lossless motion delta update:

1. Sidereal now depends on `Dastari/lightyear` commit `0192db9c9235f807f170c0f7400dd55099a41447`, which carries the generic Avian2D velocity `Diffable` support, forced delta keyframe intervals, active `ReplicationGroup::send_frequency` timers, selected upstream input/sync fixes, and a lossless base-value fallback when an acknowledged delta base has aged out.
2. Historical behavior at that date: Avian2D `Position`, `Rotation`, `LinearVelocity`, and `AngularVelocity` registered lossless delta compression with forced full-value keyframes every `SIDEREAL_REPLICATION_MOTION_KEYFRAME_EVERY_N_TICKS` ticks, default `60`. Superseded by the 2026-08-31 full-state note above.
3. The replication server inserts `DeltaManager` on Lightyear server entities so Lightyear can compute and retain component deltas for connected clients.
4. `LIGHTYEAR_PROTOCOL_VERSION` was `9` for this motion-delta change; later runtime protocol slices have since advanced it to `13`. Native and WASM clients must always rebuild with the matching protocol registration.
5. Native/WASM impact: shared Lightyear protocol registration changes for motion replication. No lossy quantization, no persistence shape change, and no visibility authorization or payload-redaction policy change.

2026-05-17 status note:

1. Tactical visibility candidate generation now includes each client's authoritative visibility-source range, not only the client-reported local-view delivery radius.
2. Range-authorized dynamic entities use a scanner-backed delivery radius equal to `max(client_delivery_range_m, max_visibility_source_range_m)` for the client. A ship that is within another player's effective scanner/default visibility range must not be dropped solely because that client's viewport-derived delivery hint is smaller than scanner range.
3. This preserves the stage order: scanner/default visibility range is still the authorization grant, delivery still cannot expose entities outside that authorization, and payload redaction remains unchanged.
4. Static landmark signal behavior is unchanged: a redacted gravity-well signal does not by itself insert `DiscoveredStaticLandmarks` or authorize full world replication. Direct discovery remains the path that discloses the planet/star identity and world entity.
5. Native/WASM impact: replication-server membership/candidate behavior only. No client protocol, client transport, prediction, or platform-specific code changed.

2026-05-09 status note:

1. The cell-dirty visibility apply worklist is now the default AOI apply path. `SIDEREAL_VISIBILITY_USE_CELL_DIRTY_WORKLIST=0`, `false`, or `off` remains an operator rollback override.
2. The worklist explicitly includes entities whose runtime policy components changed, including `ControlledBy` and runtime world visual stack changes, even when those entities did not move between cells.
3. Reason: policy changes without movement must still enter the authorization/delivery/payload evaluation path when the cell-dirty worklist is the default AOI processor.
4. Phase 0 summaries and MMO load gate artifacts include observability-backed `metrics_visibility_cell_dirty_worklist_*` / `mmo_load_visibility_cell_dirty_worklist_*` fields, plus gates for max cell-dirty worklist entities and dirty entities. The MMO load-tier wrapper now defaults the visibility worklist flag to `1` unless the caller explicitly overrides it.
5. Validation: 2026-05-09 short native headless release runs with the cell-dirty path enabled passed the MMO load gate with zero input drops and reported `mmo_load_visibility_cell_dirty_worklist_enabled=1`; the default-on validation summary is `data/debug/mmo_synthetic_load/20260509_152139_movement_only_1c/phase0_headless_summary_20260509_052139.txt`. Unit coverage verifies dirty-cell, dirty-observer, mandatory owner/policy, deferred-gain, and runtime-policy-dirty inclusion in worklist construction.
6. Remaining: continue denser multi-client churn captures before removing the rollback override.
7. Native/WASM impact: replication-server visibility worklist selection and load diagnostics only. Authorization, delivery narrowing, payload redaction, transport protocol, and client runtime behavior are unchanged.

2026-05-09 replication group send-frequency validation note:

1. Replication groups now support disabled-by-default class send-frequency overrides through `SIDEREAL_REPLICATION_GROUP_CONTROLLED_SEND_HZ`, `SIDEREAL_REPLICATION_GROUP_PROJECTILE_SEND_HZ`, `SIDEREAL_REPLICATION_GROUP_DYNAMIC_SEND_HZ`, `SIDEREAL_REPLICATION_GROUP_PLAYER_RUNTIME_SEND_HZ`, `SIDEREAL_REPLICATION_GROUP_STATIC_SEND_HZ`, and `SIDEREAL_REPLICATION_GROUP_GENERIC_SEND_HZ`.
2. The defaults remain unset, so current owner correction, projectile, dynamic, static, and generic replication cadence is unchanged unless an operator explicitly opts into a validation run.
3. Configured values must be finite, positive, and no faster than the authoritative simulation tick rate. The MMO load artifact records the configured class send rates so bandwidth and correction captures can be compared against the active policy.
4. This is an entity/group-level Lightyear `ReplicationGroup::set_send_frequency` validation hook. It is not a component-level send-rate policy, and it must not be used to lower controlled-owner correction frequency until native prediction captures prove corrections remain timely.
5. Native/WASM impact: replication-server Lightyear group policy only. Client prediction/reconciliation ownership, transport protocol, visibility authorization, and payload redaction are unchanged.

2026-05-08 status note:

1. Deferred membership gain telemetry now records the oldest pending gain age as `visibility_deferred_membership_oldest_pending_gain_age_s`.
2. Visibility apply worklist pressure can now be measured with `SIDEREAL_VISIBILITY_APPLY_WORKLIST_SOFT_BUDGET` and health fields `visibility_apply_worklist_soft_budget`, `visibility_apply_worklist_budget_exceeded`, and `visibility_apply_worklist_over_budget_entities`.
3. `SIDEREAL_VISIBILITY_MEMBERSHIP_DEFERRED_GAIN_MAX_AGE_S` optionally bounds authorized non-immediate membership gain deferral. When set, a pending gain that still passes authorization is released after the configured age even when the per-client gain budget is exhausted. Mandatory owner/control visibility remains immediate, and stale/disconnected/no-longer-authorized pending gains are still dropped instead of released.
4. Health exposes the configured max age as `visibility_deferred_membership_max_gain_age_s` and forced age releases as `visibility_deferred_membership_expired_released_gains` / `visibility_deferred_membership_expired_released_gains_total`.
5. Pending deferred gains also count as unresolved visibility interest for sector residency. A sector cannot begin cold flush/demotion while one of its entities still has a pending membership gain.
6. Reason: Phase 4 cell-owned AOI and membership budgets need queue-age and worklist-pressure signals so captures can distinguish healthy deferral from stale visibility work that is falling behind.
7. Native/WASM impact: replication-server visibility budgeting and sector residency only; no client runtime or protocol split.

2026-05-07 status note:

1. Replication payload cadence now has an explicit audit contract in section 9. High-frequency owner correction/prediction data, remote interpolation data, combat status, tactical/read-model streams, owner-only runtime state, and static/config/presentation data are separate policy classes.
2. Current implementation status: server runtime lanes now cadence-gate visibility/AOI, tactical/owner/asset streams, scripting, persistence, and diagnostics. Lightyear component replication now exposes queued/sent payload byte, component count, bandwidth-limit, and queue-depth telemetry through the `Dastari/lightyear` fork. Sidereal also applies a conservative entity-level Lightyear replication-group priority policy: controlled entities, projectiles, dynamic physics entities, player runtime entities, static world entities, and generic replicated entities are separated by priority. Lightyear component replication still needs a later validated per-entity/per-component send-rate policy before reducing remote motion snapshots or static/config replication groups.
3. The Lightyear fork exposes `ReplicationGroup::set_priority` and `ReplicationGroup::set_send_frequency` for entity/group-level throttling. Sidereal uses priority by default and supports explicit `SIDEREAL_REPLICATION_GROUP_*_SEND_HZ` validation overrides; default send-frequency reduction remains deferred until longer native prediction/interpolation captures establish safe owner correction behavior. Superseded on 2026-05-21 for entity/group timers: the fork now actively ticks `ReplicationGroup::send_frequency`; first-class component-class frequency/backpressure remains future work if entity/group controls prove insufficient.
4. Native impact: documentation and server diagnostics contract only for payload classes; no client prediction/reconciliation behavior change in this note. WASM impact: no protocol or platform split.

2026-05-06 status note:

1. Replication now exposes a bounded live spatial partition snapshot on its loopback health/diagnostics HTTP server at `/spatial-partition`. The snapshot is aggregated geometry only: occupied cells, sectors, regions, bounds, counts, lifecycle state, dirty/migration diagnostics, and truncation flags.
2. This endpoint is admin diagnostics only. It does not expose per-zone entity membership, raw Bevy `Entity` IDs, private component payloads, or gameplay payload data.
3. The dashboard reaches this data through the gateway/dashboard proxy path guarded by `dashboard:brp:proxy`; browsers must not connect directly to the replication health server.
4. The snapshot is read-only and does not alter visibility authorization, delivery narrowing, payload redaction, sector lifecycle transitions, persistence flushing, hydration, or runtime removal.
5. Native impact: replication diagnostics and dashboard tooling only. WASM impact: browser dashboard tooling only; no client gameplay runtime or transport behavior changes.

2026-05-01 status note:

1. Sector lifecycle hydration now has a default-off server-side executor behind `SIDEREAL_SECTOR_LIFECYCLE_HYDRATION_ENABLED=1`, with `SIDEREAL_SECTOR_LIFECYCLE_HYDRATION_MAX_STARTS_PER_TICK` bounding new background graph reads.
2. The executor starts only from server-derived sector/cell interest for `ColdPersisted` sectors, transitions them through `Hydrating`, loads graph records through the canonical graph persistence path, filters records by persisted world position, and hydrates through the existing generic component hydration path. Empty or failed reads return the sector to `ColdPersisted`.
3. Hydration metrics are exposed through visibility summary logs, health JSON, and the Phase 0 capture harness as `sector lifecycle hydration metrics` and `visibility_sector_hydration_*`. The executor records offline-progression seconds from the sector's `last_simulated_at_s` for later coarse simulation work; it does not yet apply gameplay-specific offline progression.
4. This remains server-only and default-off. Client free-roam/camera state does not trigger hydration or authority widening, raw Bevy `Entity` IDs are not persisted or used as sector identity, and the visibility order remains `Authorization -> Delivery -> Payload`.

2026-05-01 status note:

1. Sector flush records are annotated with server-only sector lifecycle metadata before persistence writes: `sector_key_x`, `sector_key_y`, `sector_last_simulated_at_s`, and `sector_epoch`.
2. Hydration filters may use persisted sector keys when present and fall back to persisted f64 world position only for older/unannotated records. Offline-progression measurement uses the newest persisted `sector_last_simulated_at_s` in the hydrated record set, falling back to the runtime lifecycle entry timestamp if no persisted timestamp exists.
3. These metadata fields are graph-record properties only. They do not contain raw Bevy `Entity` IDs, do not replace runtime GUID identity, and do not create a new persistence delta format.
4. Native/WASM impact: replication-server persistence metadata only. Visibility authorization, delivery narrowing, payload redaction, prediction/reconciliation, client free-roam/camera state, and asset delivery remain unchanged.

2026-05-01 status note:

1. Visibility now records dirty-cell membership inputs for the future cell-owned apply path. Spatial index refresh tracks cells whose membership, effective visibility position, or extent changed, and observer candidate-cache refresh tracks cells whose interested observers changed.
2. The cell-dirty apply worklist path is enabled by default and can be rolled back with `SIDEREAL_VISIBILITY_USE_CELL_DIRTY_WORKLIST=0`, `false`, or `off`. It builds the worklist from dirty cells plus entities visible to observers whose candidate cells changed, mandatory policy entities, active owned entities, runtime-policy-dirty entities, and pending deferred gains, then still runs the existing authorization/delivery/payload policy evaluation for selected entities. It falls back to all currently visible entities only for structural read-model/client-context changes that can invalidate visibility outside dirty cells.
3. Visibility summary logs, health JSON, and the Phase 0 capture harness expose `visibility cell dirty worklist metrics` and `visibility_cell_dirty_worklist_*` fields so captures can track the default path and compare rollback captures when needed.
4. Native/WASM impact: replication-server-only. The cell-dirty worklist does not authorize, deliver, redact, or widen anything outside the existing policy evaluation.

2026-04-24 status note:

1. Implemented: server-driven per-client visibility updates, spatial-grid candidate preselection, fail-closed policy checks, generic `VisibilityRangeM`/`VisibilityRangeBuffM`, and player-scoped debug/inspection components.
2. Implemented: discoverable static landmarks, parallax-aware delivery behavior, extent-aware large-body culling, and lower-cadence landmark discovery maintenance are current runtime behavior.
3. Implemented: tactical fog/contact and owner manifest lanes are separate read models that do not widen local-bubble authorization.
4. Partial/open: richer faction/public redaction details, large-scale tuning, and future background-simulation promotion interactions still need follow-up as those systems mature.

2026-04-27 status note:

1. Implemented partial V2 baseline: generic `SignalSignature` detection now feeds redacted unknown tactical contacts, scanner-controlled approximate contact accuracy, signal-triggered static-landmark discovery, buffered native local-view delivery requests, and render-local planet visual culling hysteresis.
2. V2 does not replace the V1 authorization order. Signal-only detection may create a tactical/intel product or trigger `StaticLandmark` discovery, but it must not grant ordinary full entity replication by itself.
3. Signal-only static-landmark discovery must not emit identity-bearing landmark notification payloads; player-facing signal messaging remains redacted until normal visibility/delivery discloses the body.
4. Rapid zoom-out culling must use buffered/hysteretic projected bounds on both server delivery requests and client local render culling so large/parallaxed bodies do not snap in at viewport edges. Current native client requests apply viewport overscan and the planet visual path applies projected-bounds hysteresis.

2026-04-27 status note:

1. Tactical sensor ring client presentation now requires an effective scanner profile on the actively controlled non-player-anchor entity before TAB can open the ring.
2. The target server contract is stricter than the first client slice: tactical contact disclosure and any scanner-derived contact detail must resolve scanner capability from the currently controlled entity, not from free-roam/player-anchor camera state.
3. Free roam/player-anchor control has no scanner source for scanner-derived tactical products. Existing full tactical-map/fog behavior remains separate until server-side scanner-tier gating is implemented.

2026-04-27 status note:

1. The tactical lane now resolves a server-side effective scanner source from the authenticated player's controlled entity before authoring live scanner cells or contacts.
2. If the player has no controlled entity, controls the player anchor/free-roam entity, or controls an entity without a usable root/direct-mounted scanner, the server emits no scanner-derived live cells or tactical contacts for that update.
3. Signal-only contacts and gravity-well signal notifications use the same scanner source as live tactical fog. This preserves the visibility order: authorization/disclosure remains server-owned, delivery stays bounded, and client presentation cannot create scanner authority.
4. Remaining open work: scanner-tier payload redaction and the M1 tactical contact spatial index.

2026-04-27 status note:

1. Runtime visibility sources are now emitted from the range-bearing owned entity when the resolved hierarchy root does not itself carry a matching visibility range.
2. Reason: dynamic hydration and control handoff can briefly leave the root cache behind the current controlled entity. Dropping the source during that window can make nearby clients observe one-way visibility, where one player receives the other ship but the reverse client has no visibility source for range authorization.
3. This does not widen authorization: the server still evaluates `Authorization -> Delivery -> Payload`, and delivery remains per-client. It only prevents a valid owned `VisibilityRangeM` source from being discarded because of stale root bookkeeping.
4. Native impact: two-client local-bubble visibility should be symmetric once both ships are within authoritative range. WASM impact: server-side behavior only; no platform-specific branch was introduced.

2026-04-28 status note:

1. Control-role topology changes no longer use a same-frame `lose_visibility()` + `gain_visibility()` rearm.
2. Reason: Lightyear visibility treats same-tick loss/gain as cancellation or duplicate-spawn behavior, which can leave a client-side runtime entity with both `Predicted` and `Interpolated` role markers during control handoff.
3. Implemented: replication now queues a role-visibility loss, removes that client from the membership cache for the affected visibility root and all entities under that root, suppresses normal visibility re-gain for one membership pass, then lets the ordinary visibility system re-add the tree with the new Lightyear role.
4. Reason: mounted children and other entities under the same visibility root may have their own `NetworkVisibility` / `ReplicationState`. Rearming only the root can despawn the parent lane while children keep sending updates to remote entities the client has already removed.
5. Native impact: selecting an already-visible owned ship should despawn the observer lane before the predicted lane is spawned, without leaving child/module update spam from stale remote entities. WASM impact: replication-server behavior only; no platform-specific branch was introduced.

2026-04-28 status note:

1. Free-roam is client-local camera state only. The replication server must not treat the player entity as an authoritative visibility/control anchor for predicted movement.
2. `PlayerControlledEntityMap` is scoped to gameplay controllables. If no gameplay target is mapped, the player entity may be used only as an owner/session fallback for delivery bookkeeping, not as a predicted control target or tactical marker.
3. Client camera position is not sent to the server and must not widen visibility authorization or tactical disclosure.
4. Native impact: local free-roam can pan independently while visibility remains bounded by the current controlled gameplay entity. WASM impact: shared runtime/protocol behavior only; no browser-only branch was introduced.

2026-04-29 status note:

1. Visibility runtime telemetry now includes apply-stage fanout counters: entities with cache, per-client policy evaluations, candidate rejections, candidate bypasses, visible evaluations, current/desired visible-client totals, policy entity buckets, and owner/global/owner-map/controlled fast-path client counts.
2. Reason: the spatial-grid candidate set is not enough to prove MMO-scale behavior if the membership apply stage still performs broad entity-by-client policy work. These counters measure the hot fanout before architectural changes move toward cell-owned membership diffs and observer query budgets.
3. Native/WASM impact: replication-server diagnostics only. Authorization, delivery narrowing, payload redaction, role rearm behavior, and client-visible replication semantics are unchanged.

2026-04-30 status note:

1. Visibility runtime telemetry now separates live Lightyear client entities, registered visibility client bindings, active registered clients used by the membership pass, and stale registered clients filtered out because their `ClientOf` entity is no longer live.
2. Reason: multi-client fanout profiling must distinguish transport presence from active authenticated player visibility bindings. Duplicate sessions for the same `player_entity_id` are not a valid fanout proxy when the auth binding path keeps one active visibility binding per player.
3. The membership pass now builds a reverse `entity -> candidate clients` map and skips per-client policy evaluation for non-candidate clients only when the entity's delivery extent fits inside the configured visibility cell envelope. Large delivery extents, such as stellar light influence, keep the conservative evaluation path so off-center overlap delivery remains correct. The skipped evaluations are reported as `apply_non_candidate_policy_eval_skips`.
4. Soft observer query-budget telemetry is available through `SIDEREAL_VISIBILITY_OBSERVER_CANDIDATE_ENTITY_SOFT_BUDGET` and `SIDEREAL_VISIBILITY_OBSERVER_CANDIDATE_CELL_SOFT_BUDGET`. These settings report pre-hard-cap pressure for their stage only. Actual work caps use the explicit hard-budget env vars documented in the 2026-05-22 note.
5. Native/WASM impact: replication-server diagnostics and server-side membership evaluation only. Visibility authorization, delivery narrowing, payload redaction, role rearm behavior, and client-visible replication semantics are unchanged.

2026-04-30 status note:

1. `SIDEREAL_VISIBILITY_DELIVERY_LOSS_HYSTERESIS_M` adds an opt-in delivery-loss hysteresis margin for clients that already have visibility membership for an entity. The default is disabled (`0` meters).
2. The hysteresis margin can only retain an already-visible client after normal authorization still passes; it cannot create a new visibility gain, cannot bypass authorization, and cannot change payload redaction.
3. Candidate preselection remains an optimization input only. When hysteresis is enabled, currently visible non-candidate clients may be evaluated once before loss so cell-boundary churn can be smoothed without treating the candidate set as authorization.
4. Metrics report retained clients through `apply_delivery_hysteresis_kept_clients`; a nonzero value must be treated as delivery retention evidence, not as hidden authorization.
5. Native/WASM impact: replication-server behavior only, default-off. No client transform, prediction, asset payload, or platform-specific behavior changes.

2026-04-30 status note:

1. Visibility runtime telemetry now includes a server-only sector lifecycle registry over the existing coarse sector occupancy map.
2. The registry exposes `Hot`, `Warm`, `ColdPendingFlush`, `ColdPersisted`, and `Hydrating` state counts plus interest, blocker, verified-pending-removal, cold-flush candidate, and transition counters.
3. Current runtime behavior is observational only: the visibility pass refreshes Hot/Warm interest and cold-flush eligibility, but it does not unload sectors, despawn authoritative entities, write persistence batches, hydrate sectors, or widen authority.
4. Player anchors, player-controlled entities, and active projectiles are counted as unload blockers in the current scaffold. Future persistence-backed unload work must keep the blocker rules in the runtime optimization plan before any `ColdPendingFlush` transition is called from production flow.
5. Native/WASM impact: replication-server diagnostics only. Visibility authorization, delivery narrowing, payload redaction, prediction, client free-roam/camera state, and asset delivery behavior are unchanged.

2026-04-30 status note:

1. The persistence-backed sector lifecycle now has a default-off sector flush coordinator gated by `SIDEREAL_SECTOR_LIFECYCLE_FLUSH_ENABLED`.
2. When enabled, the coordinator may start transactional graph persistence writes only for Warm, unblocked, dwell-ready sectors, and only through the existing graph-record persistence shape. It does not introduce a new persistence delta format.
3. Verified write completion does not mark a sector `ColdPersisted` and does not remove authoritative Bevy ECS entities. `ColdPersisted` remains reserved for a future runtime-removal step after persistence has succeeded and the server has explicitly removed the sector's runtime entities.
4. Flush diagnostics are exposed as `sector_flush[enabled/in_flight/enqueued/verified/failed/skipped_empty/last_records]` in visibility summaries and corresponding health/capture fields.
5. Default-off validation kept all flush activity counters at zero. An isolated opt-in validation enqueued and verified graph writes with zero failures while keeping `ColdPersisted` at zero.
6. Native/WASM impact: replication-server-only, default-off. Visibility authorization, delivery narrowing, payload redaction, client free-roam/camera state, prediction, and asset delivery behavior are unchanged.

2026-04-30 status note:

1. A default-off sector runtime-removal preflight diagnostic is gated by `SIDEREAL_SECTOR_LIFECYCLE_REMOVAL_PREFLIGHT_ENABLED`.
2. The preflight only classifies verified `ColdPendingFlush` sectors as ready, blocked, interested, still in-flight, or missing runtime entities. It does not despawn authoritative entities, remove indexes, hydrate sectors, or mark `ColdPersisted`.
3. Metrics are exposed as `sector_removal_preflight[enabled/candidates/ready/blocked/interested/in_flight/missing_runtime/ready_entities/ready_entity_max]` in visibility summaries and corresponding health/capture fields.
4. The current isolated opt-in validation classified one verified pending sector as ready for future removal while keeping `ColdPersisted` at zero.
5. Native/WASM impact: replication-server-only, default-off. Visibility authorization, delivery narrowing, payload redaction, client free-roam/camera state, prediction, and asset delivery behavior are unchanged.

2026-05-01 status note:

1. A default-off sector runtime-removal executor is gated by `SIDEREAL_SECTOR_LIFECYCLE_REMOVAL_ENABLED`. Per-tick limits are controlled by `SIDEREAL_SECTOR_LIFECYCLE_REMOVAL_MAX_SECTORS_PER_TICK` and `SIDEREAL_SECTOR_LIFECYCLE_REMOVAL_MAX_ENTITIES_PER_TICK`.
2. When enabled, removal is allowed only for verified `ColdPendingFlush` sectors that still have no interested entities, no unload blockers, no in-flight persistence writes, and runtime entities present in Bevy ECS.
3. The executor refuses cross-sector hierarchy/root sets, despawns the selected authoritative runtime entities, purges visibility membership/candidate/desired-membership/spatial caches, and only then marks the sector `ColdPersisted`.
4. Metrics are exposed as `sector_removal[enabled/ready/ready_entities/removed_sectors_total/removed_entities_total/blocked_after_preflight/despawn_missing/last_removed_sectors/last_removed_entities]` in visibility summaries and corresponding health/capture fields.
5. Isolated opt-in validation removed one verified sector containing 35 runtime entities, reported `ColdPersisted=1`, and kept input drops at zero.
6. Native/WASM impact: replication-server-only, default-off. Visibility authorization, delivery narrowing, payload redaction, client free-roam/camera state, prediction, transform authority, and asset delivery behavior are unchanged.

2026-05-01 status note:

1. The visibility spatial index now maintains a read-only hierarchical region occupancy map above sectors. `SIDEREAL_VISIBILITY_REGION_SIZE_SECTORS` controls how many sectors are grouped per region and defaults to `32`.
2. Region telemetry is exposed as `occupied_regions` and `max_entities_per_region` in visibility summaries plus corresponding health/capture fields.
3. Regions are measurement and architecture scaffolding only. Candidate generation, authorization, delivery narrowing, redaction, role rearm behavior, sector lifecycle decisions, and asset delivery still use the existing contract paths.
4. Isolated capture validated the parser and summary fields with `occupied_regions=4` and `max_entities_per_region=213`.
5. Native/WASM impact: replication-server diagnostics only. No client behavior, prediction, transform authority, payload, or asset-loading behavior changes.

2026-05-01 status note:

1. The visibility spatial index now records read-only cell, sector, and region migration counters for incremental entity movement.
2. Metrics are exposed as `spatial_migration[last_cell/last_sector/last_region/total_cell/total_sector/total_region/events_last/events_total]` in visibility summaries plus corresponding health/capture fields.
3. Migration telemetry is diagnostic-only. It does not emit streaming events, widen authority, alter delivery, change membership, unload sectors, or modify payload redaction.
4. Isolated capture validated the parser and default static-field behavior with all migration counters at zero.
5. Native/WASM impact: replication-server diagnostics only. No client behavior, prediction, transform authority, payload, or asset-loading behavior changes.

2026-05-01 status note:

1. Spatial migration diagnostics now retain a per-frame migration-event queue containing the moved entity and previous/next cell, sector, and region keys.
2. The queue is read-only scaffolding for future cell-owned membership diff processing and downstream cell streaming. It is reset each spatial refresh after metrics are consumed and does not drive replication policy yet.
3. Health, summary, and capture fields now include `visibility_spatial_migration_events_last` and `visibility_spatial_migration_events_total` in addition to the existing per-level counters.
4. Native/WASM impact: replication-server diagnostics only. No visibility authorization, delivery, redaction, authority, prediction, client camera/free-roam, or asset-delivery behavior changes.

2026-05-01 status note:

1. Sector lifecycle diagnostics now include default-off hydration preflight metrics behind `SIDEREAL_SECTOR_LIFECYCLE_HYDRATION_PREFLIGHT_ENABLED=1`.
2. The preflight derives observer-interest sectors from server-side candidate cells and reports `sector_hydration_preflight[enabled/interested_cold_persisted/already_hydrating]`.
3. This is a measurement hook only. It does not hydrate graph records, respawn runtime entities, widen authority from client free-roam/camera position, alter candidate authorization, or change payload redaction.
4. Native/WASM impact: replication-server diagnostics only. Browser/client behavior and asset delivery are unchanged.

2026-04-29 status note:

1. Enabled `StellarLightSource` entities are public presentation-lighting sources and use their finite positive `outer_radius_m` as delivery extent.
2. Reason: lighting must not pop or fall back when a client zooms in and the star body/source center leaves the zoom-derived delivery bubble while its light influence still overlaps visible objects.
3. This does not make all public entities globally delivered. It only expands delivery for enabled stellar light sources by their authored lighting falloff radius.
4. Native impact: planets, asteroids, and other lit world materials can continue resolving the same sun while the sun is off-screen. WASM impact: shared replication behavior only; no platform-specific branch was introduced.

2026-04-28 status note:

1. Signal detection is no longer treated as static-landmark discovery. A high-signal planet/star/black-hole can produce an unknown tactical contact and a redacted `long_range_gravity_well_detected` notification, but it must not insert `DiscoveredStaticLandmarks`.
2. Direct landmark discovery is the only path that persists `DiscoveredStaticLandmarks` and emits an identity-bearing `LandmarkDiscovery` notification payload. This prevents an early unknown signal from suppressing the later real landmark-discovery message.
3. Tactical contact streaming now adds persistent known contacts for already-discovered static landmarks, independent of live scanner range, so the tactical map/minimap does not forget discovered planets and stars when the player moves away.
4. Native impact: discovered planet/star markers remain on tactical/minimap displays after leaving local scanner range, while long-range unknown contacts remain redacted until direct discovery. WASM impact: shared server/tactical behavior only.

2026-04-24 update:
- Visibility spatial indexing and static-landmark discovery now resolve static non-physics world entities from canonical `WorldPosition` before falling back to Bevy `GlobalTransform`. This prevents static planets/celestial bodies from being indexed at stale/default transform positions before transform propagation catches up.
- Native impact: discoverable `WorldPosition` landmarks such as planets can be discovered/delivered when the player is actually near their authoritative world location. WASM impact: no protocol split; the server-side visibility fix benefits all clients.

2026-04-24 update:
- Static landmark discovery now emits a server-authored player notification after `DiscoveredStaticLandmarks` is updated. This is a presentation/history side effect only; it does not widen authorization, delivery, or payload disclosure for the discovered landmark or any related entity.
- Native impact: the selected player sees a non-blocking toast for newly discovered landmarks. WASM impact: shared notification protocol and queue path; no platform-specific discovery authority path.

2026-04-24 update:
- DR-0035 makes f64 authoritative world coordinates the accepted target for visibility and replication. Visibility candidate generation, observer anchors, static-landmark discovery, delivery checks, tactical contacts, and owner manifest positions must prefer f64 Avian `Position` / f64 `WorldPosition` before falling back to f32 Bevy transforms.
- Native impact: visibility and delivery checks remain stable at galaxy-scale coordinates. WASM impact: no platform-specific visibility model; browser clients consume the same f64 protocol payloads and project to f32 only at render/UI boundaries.

2026-04-27 update:
- Client local-view delivery radius messages are treated as hints only. The replication server clamps non-finite, too-small, and too-large requested ranges before updating per-client delivery state.
- The server-side maximum is `REPLICATION_VISIBILITY_DELIVERY_RANGE_MAX_M`, defaulting to `50000` meters. This budget bounds tactical/map delivery candidate scans even when a modified client sends `f32::MAX`, `NaN`, or infinity.
- Native impact: native client requests continue to fit under the default cap. WASM impact: future browser clients share the same server-owned cap and cannot widen delivery with transport-specific local-view messages.

## 1. Goal

Keep visibility and replication server-authoritative, scalable, and disclosure-safe:

1. Server decides what each client can know.
2. Delivery culling narrows authorized data only.
3. Component/field disclosure is policy-driven.
4. Tactical/fog/intel memory behavior is explicit and lane-based.

## 2. Canonical Stage Order (Mandatory)

All visibility-sensitive changes must preserve:

1. Authorization scope (security entitlement):
   1. ownership/public/faction policy,
   2. scanner/fog/intel grant policy.
2. Delivery scope (performance narrowing):
   1. local bubble/tactical lane range and mode.
3. Payload scope (redaction):
   1. component/field masking before serialization.

Delivery must never widen authorization.

Spatial candidate generation is optimization input only, not authorization.

## 3. Runtime Baseline (Implemented)

Current implementation baseline:

1. Per-client visibility updates are server-driven in replication fixed tick.
2. Candidate preselection uses spatial grid by default (`SIDEREAL_VISIBILITY_CANDIDATE_MODE=spatial_grid`).
3. Full policy checks run after candidates; policy exceptions (owner/public/faction/scanner) are fail-closed safe.
4. World position checks use authoritative Avian `Position` or `WorldPosition` when present; `GlobalTransform` is fallback-only for entities without an authoritative spatial component.
5. Observer anchor identity is player entity (`camera <- player <- controlled(optional)`).
6. Current runtime uses generic `VisibilityRangeM` / `VisibilityRangeBuffM` with no implicit `ShipTag` baseline.
7. `VisibilitySpatialGrid` and `VisibilityDisclosure` are mirrored onto player entity for owner debug/inspection.
8. Delivery range is dynamic per client view and reflected in runtime visibility telemetry.
   Client-provided delivery ranges are bounded by the server-owned `REPLICATION_VISIBILITY_DELIVERY_RANGE_MAX_M` cap and clamp telemetry.
   For range-authorized dynamic entities, effective delivery is never narrower than the client's authoritative visibility-source range.
9. Fullscreen authored config entities are treated as non-spatial overlays: legacy `FullscreenLayer` entities and fullscreen-phase `RuntimeRenderLayerDefinition` entities bypass delivery-range/visibility-range candidate culling and remain replicated while connected.
10. Background authoring settings such as `SpaceBackgroundShaderSettings` and `StarfieldShaderSettings` are durable world configuration and remain persistable so hydration recreates the full authored config entity rather than only the layer-definition shell.
11. Discoverable static landmarks use explicit landmark classification plus player-scoped durable discovery state; they are not modeled as generic public-visibility entities.
12. Discovery notifications are derived from authoritative discovery updates and are not client-side discovery authority.
13. Enabled `StellarLightSource` entities are authorized as public presentation-lighting sources, but delivery remains bounded by the client delivery radius plus the source's finite positive `outer_radius_m`.

2026-03-09 update:
- The native client renders fullscreen background passes directly from those authored fullscreen entities again. Client-local fullscreen renderable copies were removed because they could diverge from the authored source during zoom/hydration transitions and expose the black fallback layer.
- Delivery-scope and visibility-range distance checks must account for entity extent, not only entity center position. Large bodies such as stars and planets remain delivered/authorized while any visible portion overlaps the active delivery or visibility radius; center-point-only culling is not runtime-correct.

2026-03-09 update:
- Static discoverable landmarks now have a distinct post-discovery authorization lane. Once a player legitimately discovers a qualifying landmark, replication may authorize that landmark without requiring current scanner/visibility-range overlap, but local delivery narrowing still applies.
- Landmark discovery state is persisted on the player ECS entity, not inferred ad hoc from free-roam camera position and not stored in account-side tables.
- Discovery-based authorization grants only landmark presence for qualifying static entities; it does not widen payload disclosure for unrelated entities or turn landmarks into generic public visibility.

2026-03-09 update:
- For parallaxed discovered landmarks, delivery narrowing must account for the authored world-layer parallax factor rather than using the authoritative center alone. Otherwise the server can cull a landmark before its projected render center leaves the buffered viewport.
- Candidate prefiltering must not reject already-discovered static landmarks before the landmark-specific delivery check runs.

2026-03-11 update:
- Static-landmark discovery maintenance now runs on a lower-cadence server lane separate from the hottest per-tick visibility membership update. The current runtime default cadence is 0.25 seconds.
- Dynamic per-tick visibility still consumes the authoritative discovered-landmark state every visibility tick; the cadence split changes maintenance timing only and does not change the authorization ordering (`Authorization -> Delivery -> Payload`).

## 3.1 Static Landmark Discovery Contract

Current backend behavior:

1. Discoverable landmarks are authored with `StaticLandmark` on ordinary persisted world entities.
2. Static landmark discovery state is persisted on the player ECS entity as `DiscoveredStaticLandmarks`; it is not account-scoped and must not move to a side table.
3. Discovery checks are driven by player visibility sources resolved from the generic `VisibilityRangeM` / `VisibilityRangeBuffM` path.
4. Discovery overlap uses the visibility source range plus optional `StaticLandmark.discovery_radius_m`; when `use_extent_for_discovery=true`, the entity extent is included so large bodies can be discovered by their visible edge, not only by their center point.
5. `always_known=true` landmarks are considered discoverable/authorized without a range overlap. `discoverable=false` landmarks do not enter normal discovery unless another policy authorizes them.
6. Discovery maintenance runs at a lower cadence than the hot visibility membership tick; current runtime default is 0.25 seconds.
7. Discovery position resolution must prefer authoritative physics `Position` when present, then static `WorldPosition`, then Bevy `GlobalTransform` as a fallback only.
8. A discovered landmark may be authorized outside current scanner coverage, but it must still pass delivery narrowing before world replication is sent to the client.
9. Discovery authorization grants landmark presence only. It does not widen unrelated entity visibility, bypass payload redaction, or convert the landmark into generic public visibility.
10. Parallaxed/layered landmarks must use projected delivery bounds that account for render-layer parallax and visual-stack scale so a discovered planet is not dropped while its rendered disc remains inside the buffered view.
11. Discovered-landmark delivery range is server-authoritative: it is bounded by `delivery_range_max_m` projected by the layer parallax factor (`delivery_range_max_m / parallax`), not by the client-supplied (zoom-derived) delivery range. This keeps a discovered landmark visible at any zoom without a pop-in, while preventing a client from widening its own real delivery scope by spoofing zoom. Discovery itself is never influenced by the client delivery range/zoom — it remains sensor-driven (scanner range + signal + optional `discovery_radius_m`/extent), so zoom cannot trigger discovery.

2026-06-06 update:

- Planets render on the `midground_planets` parallax layer (`parallax_factor = 0.18`), so their rendered disc enters the frustum while their true-world center is still ~5.5x the viewport away. A discovered planet previously snapped in because its delivery scope used the client's zoom-derived `delivery_range_m / parallax`; when the client view-mode/delivery hint was small or stale (e.g. the 300 m fallback) the planet was only delivered once the ship was physically within ~1-2 km of it. Discovered static landmarks now derive their delivery scope from the server `delivery_range_max_m` (projected by parallax, ~278 km at the default cap), so they stay visible at any zoom without snapping.
- The candidate non-candidate fast-reject path (item: "Candidate prefiltering must not reject already-discovered static landmarks") now excludes any landmark-delivery policy. Small-extent landmarks were previously eligible for extent-based fast rejection, which dropped them for clients whose candidate cells (sized by the per-client delivery range) had not yet reached the body — so the server-max discovered delivery range never got a chance to run. Landmark policies now always take the full per-client policy eval, where the discovered-authorization candidate bypass and the server-max delivery scope apply.
- Anti-cheat: because discovered-landmark delivery uses the server cap and discovery is sensor-only, a tampered client that forces an extreme zoom-out cannot reveal or discover landmarks it has not legitimately sensed; the only effect of a larger client `delivery_range_m` remains ordinary (already server-clamped) delivery narrowing, which never grants authorization.
- Native/WASM impact: replication-server delivery behavior only. No client protocol, transport, prediction, or platform-specific change.

Current limitations:

1. Static-landmark discovery emits the generic notification lane's `LandmarkDiscovery` payload for direct discovery only. Signal-only discovery keeps player-facing messaging redacted through the `long_range_gravity_well_detected` generic event.
2. The client toast path exists, but there is no dedicated sonar/codex presentation for first discovery.
3. Tactical-map landmark reveal is currently implied through ordinary replicated/map-icon visibility rather than a dedicated discovery delta stream.
4. Discovery is player-local only; faction, party, or organization-shared discovery policies are not implemented.
5. Landmark intel has one binary state: undiscovered/discovered. Rich scan quality, discovery history, codex text, and partial classification tiers are future work.
6. Test coverage exists for authorization/delivery behavior, static `WorldPosition` regression, notification payload construction, and projected culling helpers, but a broader lifecycle suite is still needed for persistence/hydration, no-rediscovery-spam, end-to-end delivery, and map projection.

Planned direction:

1. Add a richer server-authored discovery/intel event if the generic notification payload is not sufficient for codex, sonar, or tactical map workflows.
2. Keep discovery UI routed from server-authored events; the UI component must not infer discoveries from local-only rendering side effects.
3. Add tactical/minimap projection support so newly discovered landmarks can reveal/update markers without requiring the client to scrape raw ECS internals.
4. Extend discovery policy later for faction/shared discovery as an explicit server rule, not a client-side cache merge.
5. Add optional scan-intel tiers for richer landmark metadata while preserving `Authorization -> Delivery -> Payload` redaction order.
6. Add lifecycle tests covering discovery persistence, hydration, notification idempotence, extent-aware overlap, `WorldPosition` indexing, and discovered-landmark delivery bounds.

## 4. Multi-Lane Contract (Current + Approved Direction)

Lane model:

1. `LocalBubbleLane`:
   1. high-rate nearby simulation state,
   2. authoritative world entities.
2. `TacticalLane`:
   1. lower-rate reduced contact/fog payload for zoomed-out map.
3. `OwnerAssetManifestLane`:
   1. owner-only asset list/state,
   2. independent of local bubble relevance.

Normative rules:

1. Owned-asset UI must not depend on local-bubble world-entity presence.
2. Owner manifest is server-authored and client-cached as read model.
3. Tactical lane never upgrades authorization; it is a reduced delivery/product lane.

## 5. Fog of War and Intel Memory Contract

Fog/intel behavior:

1. Players start with unexplored space (`0` explored coverage).
2. Exploration permanently grows discovered map coverage (`ExploredCells`).
3. Live intel is only from current visibility/live visibility.
4. Outside live visibility, only server-stored last-known intel may be shown (stale memory).
5. Tactical explored-memory persistence uses chunked binary component payloads (adaptive dense/sparse chunk encoding), not flat JSON coordinate lists.
6. Tactical fog memory cell size is 100m and independent from visibility relevance spatial grid cell size.

Authoritative placement:

1. Intel memory is server-authoritative and persisted on player-scoped data (player entity components).
2. Raw intel-memory components are not required to be standard replicated world components.
3. Client receives tactical projection products (snapshot/delta lane payloads), not unrestricted raw memory.

## 6. Disclosure Policy (Pending Scope Preserved)

Still required and explicitly preserved:

1. Faction-based visibility scopes.
2. Component/field-level visibility/redaction policy (for example inventory detail requiring scan-intel grant).
3. Snapshot-vs-stream grant semantics for scan intel.

Current status:

1. These are active contract requirements.
2. Some parts remain implementation-in-progress and must not be removed from docs.

## 7. Edit Checklist (Mandatory)

For any PR touching visibility, tactical delivery, fog/intel memory, or redaction:

1. Verify stage order remains `Authorization -> Delivery -> Payload`.
2. Verify tactical/owner lanes do not bypass authorization.
3. Verify unauthorized component/field data is never serialized.
4. Verify player observer-anchor identity rules remain consistent.
5. Verify fog/intel memory semantics:
   1. unexplored vs explored,
   2. live vs stale intel.
6. Add/update tests for changed behavior.
7. Update:
   1. this contract,
   2. any related decision detail under `docs/decisions/`,
   3. `docs/decision_register.md` links when decisions change.

## 8. Visibility Range Naming Direction (Accepted)

Canonical generic visibility-range terminology is now:

1. `VisibilityRangeM`
   - effective resolved visibility/disclosure range read by the hot visibility path
2. `VisibilityRangeBuffM`
   - generic contributing modifier to visibility range

Normative direction:

1. Visibility systems should converge on `VisibilityRangeM` / `VisibilityRangeBuffM`.
2. Genre-specific names such as `scanner` may remain in Lua/content authoring, but not as the engine-owned built-in runtime concept.
3. `ShipTag` must not imply hidden baseline visibility range.
4. Root entities may carry both effective `VisibilityRangeM` and local `VisibilityRangeBuffM`.
5. Aggregation should compute root effective range from generic contributors before hot visibility checks run.

Implementation note:

1. Runtime code now uses `VisibilityRangeM` / `VisibilityRangeBuffM`.
2. `VisibilityDisclosure` now carries `visibility_sources`, not `scanner_sources`.
3. Genre-specific `scanner_*` wording may still exist in content/action names, but not as the engine-owned runtime component names.
4. See:
   - `docs/decisions/dr-0028_generic_visibility_range_components.md`

## 9. Replication Payload Cadence Audit

Current policy classes:

| Class | Component/message examples | Target cadence/priority | Contract |
| --- | --- | --- | --- |
| Owner motion correction and prediction state | Avian `Position`, `Rotation`, `LinearVelocity`, `AngularVelocity`; predicted gameplay constraints such as `FlightComputer`, `FlightTuning`, `TotalMassKg`, `MaxVelocityMps`, `SizeM`, `EntityGuid` | Highest priority. Owner correction must remain timely enough for Lightyear reconciliation; do not lower until native prediction captures prove `input_oldest_age_ms`, correction gap, and visible rubberbanding remain within SLO. | Lightyear owns prediction/correction. Sidereal must not add client transform repair loops or trust client transforms. |
| Remote dynamic motion | Avian motion for visible non-owned ships, projectiles, and nearby dynamic entities | Target 20-30 Hz snapshots with interpolation buffers once validated. Nearby threats/projectiles outrank ordinary remote motion. | Remote clients interpolate server state; they do not author authoritative outcomes for other entities. |
| Immediate combat/projectile state | `BallisticProjectile`, `WeaponCooldownState`, `HealthPool`, destruction and weapon-fired messages | Medium/high priority during combat. Projectile and destruction visibility must remain event-correct before lowering ordinary remote motion. | Combat outcomes remain server-authored; tactical summaries may not replace authoritative combat replication. |
| Spawn/config/rare-update gameplay data | `BallisticWeapon`, `Hardpoint`, `WeaponTag`, `ModuleTag`, `Engine`, `FuelTank`, `AmmoCount`, `ScannerComponent`, `ActionCapabilities`, `AfterburnerCapability`, `FlightEnvelopeProfile`, `CollisionProfile`, `CollisionAabbM`, `CollisionOutlineM`, mass components | Spawn/visibility gain and rare-update priority. These should not consume steady high-frequency bandwidth when unchanged. | Changes remain visibility-authorized and payload-redacted by component visibility policy. |
| Hierarchy, ownership, and identity | `ParentGuid`, `MountedOn`, `OwnerId`, `AccountId`, `PlayerTag`, `ShardAssignment`, `ControlledEntityGuid`, `SelectedEntityGuid`, `FocusedEntityGuid` | Reliable or rare-update owner/authorized priority. | UUID/entity IDs only across boundaries; no raw Bevy `Entity` IDs. Control state remains player-entity scoped and server-authored. |
| Static world-space and presentation config | `WorldPosition`, `WorldRotation`, `StaticLandmark`, `DisplayName`, `EntityLabels`, `MapIcon`, `VisualAssetId`, `SpriteShaderAssetId`, shader/material/render-layer settings, `ProceduralSprite`, `StellarLightSource`, `EnvironmentLightingState` | Spawn/visibility gain or low-rate rare update. Large public/light entities may widen delivery by extent but not authorization. | Authoritative coordinates remain f64. Presentation data cannot write simulation state. |
| Visibility/disclosure/sensor policy | `VisibilityRangeM`, `VisibilityRangeBuffM`, `PublicVisibility`, `FactionId`, `FactionVisibility`, `VisibilityDisclosure`, `SignalSignature`, `ContactResolutionM`, `DiscoveredStaticLandmarks`, `PlayerExploredCells`, `TacticalMapUiSettings` | Visibility/AOI and tactical lanes, generally 5-10 Hz for membership and 0.5-2 Hz for tactical/read-model streams. | AOI narrows candidates only. Signal/tactical products do not widen ordinary entity replication. |
| Tactical, owner manifest, asset notice, notification streams | `ServerTactical*`, owner asset manifest messages, asset catalog version messages, notification messages | Dedicated low-rate/event lanes. Tactical/manifest should defer under load before input or physics age grows. | These streams are read models; they do not replace authoritative ECS state or asset payload delivery. |

Open implementation work:

1. Continue validating the active Lightyear replication-group priority policy and opt-in class send-frequency policy under native one-client, two-client, dense-sector, and distributed synthetic load captures before enabling any default send-frequency reduction. Current server-side priorities are controlled entities `10`, projectiles `9`, dynamic physics entities `7`, player runtime entities `6`, generic replicated entities `5`, and static world entities `3`.
2. Continue measuring bytes/client/sec and send queue pressure per lane/class before reducing remote motion cadence. As of 2026-05-09, replication health and Phase 0 captures report successful Sidereal-authored outbound message counts and estimated payload bytes for control, combat-event, tactical snapshot, tactical delta, owner manifest, asset notice, and notification classes. They also report Lightyear component replication queued/sent payload bytes, entity/component counts, actions/updates channel totals, queue depths, and bandwidth-limited message counts through the `Dastari/lightyear` fork commit `c2db90da93c16383d1e886b253db790acb0fbb18`, plus the configured entity/group send-frequency overrides. As of 2026-05-23, motion components use lossless Lightyear delta compression and monotonic out-of-order ack bookkeeping at fork commit `019048ca638cd3c2727054d6f3342a34f460753e`.
3. If entity/group controls are insufficient after the byte/queue telemetry is evaluated under load, prepare a project-agnostic Lightyear fork patch for component-class priority/frequency/backpressure. The initial handoff for generic component replication byte/backpressure hooks is archived at `docs/prompts/handoffs/open/lightyear_component_replication_byte_metrics_handoff_2026-05-08.md` and was completed by the `c2db90da93c16383d1e886b253db790acb0fbb18` fork patch. The handoff for Avian2D velocity deltas, forced keyframes, and active send-frequency timers is archived at `docs/prompts/handoffs/completed/lightyear_delta_keyframe_send_frequency_handoff_2026-05-21.md` and was completed by the `3f7c3d20694c6da7a3eeac9d3af4ce680b6341d5` fork patch, then carried forward in the pinned `019048ca638cd3c2727054d6f3342a34f460753e` revision.

## 10. Cross-Shard Ghost Lane Contract

Status: closed 2026-05-24 (Phase 6 of `docs/plans/completed/distribution_scaling_and_single_shard_hardening_plan_2026-05-21.md`) on TCP-IPC; the original scaffolding text below is retained for history and dated notes call out where the 2026-05-24 closure supersedes it.

Reference: DR-0040 §2.4 (`docs/decisions/dr-0040_distribution_and_persistence_authority_model.md`).

### 10.1 Purpose

Adjacent runtime shards exchange read-only "ghost" updates so that a client connected to shard B can see a low-fidelity copy of an entity authoritatively owned by shard A when the entity is close to the shared `ShardRegion` border. The ghost lane preserves continuous-space gameplay without giving the receiving shard authority over the entity.

### 10.2 Authority semantics

1. The owning shard remains authoritative. Ghost subscribers MUST NOT write authoritative simulation state for ghost entities, MUST NOT issue weapon fire / damage / inventory / control mutations against them, and MUST NOT persist ghost state to graph persistence (DR-0040 §2.2.1 single-writer rule). Ghosts are ephemeral on the subscribing shard.
2. The subscriber-side marker is `GhostMarker` (`crates/sidereal-game/src/components/ghost_marker.rs`). It is `persist=false`, `replicate=false`: it never travels over the client-server replication wire and never lands in the graph. Other runtime systems short-circuit on its presence.
3. Authoritative actions against a `GhostMarker`-tagged entity are rejected at the control system. Sidereal reuses `ServerControlRejectMessage` (no new message type) with the canonical reason string `sidereal_ghost_lane::GHOST_AUTHORITY_REJECT_REASON` = `"ghost: action requires authoritative shard for this entity"`. Clients branch on this exact string to re-target through the gateway shard route table; do not synonymize or localize this reason in server code.

### 10.3 Border-adjacency rule (uniform grid)

1. Phase 6 scope is the DR-0040 uniform `ShardRegion` grid. An entity authoritatively owned by region A is **border-adjacent** to neighbour region B when (a) B is a 4-neighbour of A in the grid and (b) the entity's perpendicular distance to the shared boundary segment between A and B is `≤ SIDEREAL_GHOST_LANE_BORDER_THICKNESS_M`.
2. Default thickness (when the env var is unset): `min(VisibilityRangeM cap, region_size_m / 2)`. The default ensures the ghost band is no wider than half the region and no wider than the active scanner-class visibility cap.
3. The canonical helper is `sidereal_ghost_lane::is_border_adjacent_to_region` (uniform grid only); replication's record-side probe wraps it as `record_is_border_adjacent_to_neighbour` in `bins/sidereal-replication/src/replication/simulation_entities.rs` so the ghost producer narrows the same authoritative result the owned-region filter already produces. There is intentionally **one** filter pipeline; do not add a parallel ghost-only one.
4. **TODO(phase-8)**: Phase 8 introduces dynamic non-uniform region splits/migrations. The 4-neighbour-only and distance-to-boundary rules must be re-derived once `ShardRegion`s can be subdivided. The helper carries an explicit `TODO(phase-8)` comment to keep the scope tied to this contract.

### 10.4 Wire shape

1. Wire DTOs and bincode framing live in `crates/engine-ghost-lane`; the crate has no Bevy dependency and mirrors the `engine-persistence-protocol` pattern. The top-level message enum is `GhostLaneMessage { Subscribe, SubscribeAck, Batch }`.
2. Ghost payload (`GhostEntitySnapshot`) is restricted to: stable entity GUID, owning `ShardRegion`, f64 position, f64 rotation (rad), f64 linear velocity, f64 angular velocity, optional bounding extent (m), optional visibility-range hint (m), and source tick. Inventory, controlled-by binding, internal AI/intent state, and asset manifests are intentionally excluded.
3. f64 world coordinates remain on the wire per DR-0035 / DR-0040 §2.8.1. Lossy quantization is out of scope for the ghost lane in Phase 6.
4. **Transport (2026-05-24 closure)**: the ghost lane is a **TCP-framed bincode IPC** transport between `sidereal-replication` processes, modelled on `sidereal-persistence-service` (`bins/sidereal-persistence-service/src/lib.rs:1130`). It is intentionally **not** a Lightyear channel; subscribing a shard as a Lightyear client of its neighbour would re-register prediction/rollback in the subscriber against the same Avian2D motion components the owning shard is authoritatively simulating, corrupting source-of-truth state. Each shard process opens one TCP listener bound to `SIDEREAL_GHOST_LANE_BIND` for inbound ghost traffic and one outbound TCP connection per neighbour shard listed in `SIDEREAL_GHOST_LANE_PEER_ENDPOINTS`. Connection setup retries on the bounded schedule `[50, 100, 200, 400, 800]ms`. The handshake is `Subscribe` (carrying `SIDEREAL_INTER_SHARD_AUTH_TOKEN`) → `SubscribeAck`; producers narrow `Batch` payloads to entities border-adjacent to the subscriber-declared regions. Drops on per-peer backpressure are handled by **coalescing in place** in a `Mutex<Option<GhostSnapshotBatch>>` slot per peer (the freshest snapshot wins) rather than by retransmission, so the wire reflects DR-0040 §2.4's "best-effort, re-published on the next cadence tick" rule.

### 10.5 Cadence, budget, and auth

1. Default publish cadence: `SIDEREAL_GHOST_LANE_HZ` = 10 Hz (matches visibility AOI cadence).
2. Default per-tick wall-time budget for the producer: `SIDEREAL_GHOST_LANE_BUDGET_MS` = 4 ms.
3. Inter-shard authentication: `SIDEREAL_INTER_SHARD_AUTH_TOKEN` is a shared symmetric bearer token rotated by the admin process. Subscribers MUST reject a producer connection that does not present the expected token; this is internal infrastructure auth (not user auth) and is separate from the gateway-issued client tokens.
4. These defaults are production-safe. No link-conditioner or chaos-mode branching is permitted in the production ghost-lane code path (AGENTS.md §3).

### 10.6 Interaction with the canonical visibility contract

1. The canonical stage order is unchanged: `Authorization → Delivery → Payload` still applies on both shards.
2. **Source shard** (the ghost producer): authorization for the entity is decided by the owning shard's normal visibility pipeline. The ghost lane is its own delivery narrowing — only entities border-adjacent to the target neighbour are published, and only the restricted ghost payload is sent.
3. **Receiving shard** (the ghost subscriber): hydrates the ghost into its local world with the `GhostMarker` component and feeds it through the receiving shard's normal client-facing visibility pipeline. Clients see the ghost via standard local replication; payload-class redaction for `GhostMarker`-tagged entities follows the ghost payload class. Receivers MUST NOT widen authorization based on a ghost.
4. Combat across the boundary: fire authorization rejects any weapon fire where shooter and intended target are on different shards (validated at the shooter's shard) using the same `ServerControlRejectMessage` shape and the ghost-authority reason string.

### 10.7 Open Phase 6 work

2026-05-24 closure: producer/subscriber Bevy systems and the inter-shard transport wiring have landed as TCP-IPC in `bins/sidereal-replication/src/replication/ghost_lane.rs`, and the `two_process_shards_ghost_visibility` integration test exercises the producer→subscriber path. Tier-100 bandwidth and border-zone latency captures are reported in the master plan row.

Remaining (tracked in DR-0040 Phase 7+): dynamic non-uniform region splitting (Phase 8) — the uniform-grid border-adjacency rule must be re-derived once `ShardRegion`s can be subdivided. The helper retains its explicit `TODO(phase-8)` to keep the scope tied to this contract.

### 10.8 Three-question check for new ghost-affecting code

Per DR-0040 §99 / AGENTS.md §3, every PR that adds ghost-lane code must answer:
1. Which shard owns this state authoritatively?
2. What happens to this state during `ShardRegion` handoff (frozen, mirrored as ghost, destroyed-then-respawned)?
3. Is this state visible across shards, and if so, through which lane and with what redaction?

2026-09-06: Replication-role reconciliation changes a persisted control target only for a bound player session. Offline topology cleanup must preserve the player’s `ControlledEntityGuid` so a restart can restore the selected ship.

2026-09-06 live verification correction: component visibility metadata alone is not a transport filter. `HullAssembly` and `InteriorVisual` are disabled by default in the server Lightyear registry and explicitly enabled only for authenticated owner senders. Fitting entities use the separate whole-entity owner-only policy. This milestone has fixed hull ownership; transferring hull ownership requires component-removal/rearm handling before it can be enabled.
