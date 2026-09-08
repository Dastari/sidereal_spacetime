# DR-0040: Distribution and Persistence Authority Model

Status: Active
Lifecycle: source-of-truth
Category: decision
Last updated: 2026-09-05
Owners: architecture
Scope: DR-0040: Distribution and Persistence Authority Model.
Source of truth: yes
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

Date: 2026-05-21
Owners: replication + persistence + gateway + client runtime

Primary references:
- `docs/architecture/sidereal_design_document.md`
- `docs/decisions/dr-0017_dual_lane_replication_and_owner_asset_manifest.md`
- `docs/decisions/dr-0028_generic_visibility_range_components.md`
- `docs/decisions/dr-0033_background_world_simulation_tiering.md`
- `docs/decisions/dr-0035_f64_world_coordinates.md`
- `docs/decisions/dr-0039_server_observability_metrics.md`
- `docs/features/active/visibility_replication_contract.md`
- `docs/features/active/server_observability_metrics_contract.md`
- `docs/features/proposed/npc_simulation_lifecycle_proposal.md`
- `docs/reports/investigations/mmo_scaling_foundation_investigation_2026-05-21.md`
- `docs/plans/completed/distribution_scaling_and_single_shard_hardening_plan_2026-05-21.md`

## 1. Context

Sidereal is rebuilding as a server-authoritative MMO and targets thousands of concurrent players in one continuous galaxy. The current runtime is a single `sidereal-replication` process that owns all gameplay authority, all client transport, and all graph persistence writes. This caps scale at the realistic single-process ceiling (~200–500 active players) and offers no migration path that does not require rewriting visibility, replication, persistence, gateway routing, and client transport simultaneously.

Two scaling models were considered:

1. Single process plus stop-the-world time dilation (TiDi).
2. Multi-process compute with some form of inter-process visibility/handoff.

The product target is a continuous world (no player-visible region gates) with seamless cross-boundary visibility and combat. The compute layer must scale horizontally; the durable-state layer must remain a single source of truth so cross-region interactions, persistence consistency, and hydration semantics stay tractable.

A separate concern is that several existing components (`ShardAssignment(i32)` on entities, `source_shard_id: i32` in persistence envelopes, `SIDEREAL_REPLICATION_SHARD_ID` for health tagging) were introduced as placeholders for a multi-shard future. No DR has committed to what they mean. `bins/sidereal-shard` is referenced from the Makefile but does not exist in the workspace.

## 2. Decision

Adopt a four-tier architecture: gateway, multi-process compute shards, centralized persistence service, client.

### 2.1 Compute tier — multi-process runtime shards

1. The runtime simulation is split across N `sidereal-replication` processes ("compute shards" or "runtime shards"). N is dynamic and scales with load.
2. Each runtime shard owns authority over a partition of `ShardRegion`s (defined below) and the entities currently rooted within those regions.
3. Authority is per-entity-root: a hierarchical entity tree (a ship with mounts, modules, hardpoints) is owned by exactly one shard at a time, determined by the root entity's world position.
4. Shards may host multiple `ShardRegion`s. A shard owning one `ShardRegion` is a degenerate case; the same code path covers single-shard milestones and multi-shard production.
5. Shards exchange read-only ghost state for entities in neighbouring shards via shard-to-shard Lightyear connections (see §2.4).

### 2.2 Persistence tier — single centralized authority

1. Durable graph persistence is owned by exactly one logical `sidereal-persistence-service`. This service is the single source of truth for graph DB writes.
2. Runtime shards stream dirty-entity snapshots to the persistence service. Runtime shards do not write directly to the graph DB.
3. Entity hydration during handoff, region promotion, or sector lifecycle hydration reads from the persistence service.
4. The persistence service may be internally scaled later (multiple writer workers, sharded graph storage) but must continue to present a single authoritative interface to runtime shards. Runtime shards must not be coupled to persistence-internal sharding.
5. In the single-shard milestone (current), the persistence service may remain in-process as a library inside `sidereal-replication`. Promotion to a separate `bins/sidereal-persistence-service` process is staged in Phase 3 of the implementation plan; the contract above applies once promoted, and the runtime API surface inside `sidereal-replication` must already conform to it before promotion lands.

### 2.2.1 Single-writer scope carve-out

The single-writer rule in §2.2 applies to the durable simulation entity graph: `GraphEntityRecord` / `GraphComponentRecord` reads and writes, entity hydration, world-init graph application, sector lifecycle graph flush/hydrate paths, and handoff snapshots. Script-catalog and content-authoring SQL tables are intentionally outside this rule because they are gateway-authored/editor-authored content metadata, not authoritative runtime simulation graph state. Direct SQL callers for those script-catalog/content-authoring tables are permitted, but any future code path that reads or writes simulation graph records must route through `sidereal-persistence-service`.

### 2.3 Authority unit — `ShardRegion`

1. The compute-authority unit is a typed `ShardRegion { x: i64, y: i64 }` keyed by integer coordinates over the world plane.
2. `ShardRegion` is distinct from the existing visibility `Sector` (used by `VisibilitySectorLifecycleRegistry`, sized via `SIDEREAL_VISIBILITY_SECTOR_SIZE_M`, currently default 100_000 m per `bins/sidereal-replication/src/replication/visibility/config.rs`). Visibility sectors remain the visibility/persistence-residency unit; `ShardRegion` is the compute-authority unit.
3. **Recommended starting scale**: `ShardRegion` size defaults to `8 * SIDEREAL_VISIBILITY_SECTOR_SIZE_M` (800_000 m at the current visibility sector default). One `ShardRegion` therefore contains 64 visibility sectors at the current configuration and gives the load migrator enough internal structure to split a region across two shards if needed. This relationship is tunable via `SIDEREAL_SHARD_REGION_SIZE_M`, which must be a positive integer multiple of the active visibility sector size and must remain ≥ the visibility sector size; values that violate that invariant are rejected at startup.
4. A `ShardRegion`'s authority is leased to one runtime shard at a time. The lease is identified by `ShardLease { shard_id: ShardId, region: ShardRegion, epoch: u64, state: ShardLeaseState, expires_at_unix_s: f64, transport_endpoints: ShardTransportEndpoints }`.
5. `ShardId` is a typed identifier (not the placeholder raw `i32`); the existing `ShardAssignment(i32)` and `source_shard_id: i32` are deprecated under Phase 2 of the plan.

### 2.4 Cross-shard visibility — ghost proxies from V1

1. Adjacent shards exchange read-only ghost updates for entities near shared `ShardRegion` borders. This is required from the first **product** multi-shard milestone, not deferred. The implementation plan's Phase 5 (multi-process runtime) is an internal scaffold step that does not constitute a product milestone on its own; the first multi-shard configuration shipped to players includes the ghost lane from Phase 6.
2. The ghost lane uses shard-to-shard Lightyear client connections. Each runtime shard runs a Lightyear server for its owned regions and connects as a Lightyear client to its neighbour shards to subscribe to ghost updates for the relevant border-region entities.
3. Ghosts are read-only: the receiving shard cannot authoritatively process input, damage, inventory, or persistence for a ghosted entity. Ghosts feed visibility, tactical, and client interpolation only.
4. The visibility contract is unchanged: ghosts still pass `Authorization → Delivery → Payload`. The ghost shard is the *source* of authorization for a ghosted entity; the *receiving* shard delivers a redacted payload to its own clients.
5. Combat across shard boundaries is not authorized in V1. A weapon fired by an entity authoritatively owned by shard A against an entity owned by shard B is rejected at fire authorization. UI/UX consequence is specified in the plan (greyed-out target or warning, TBD).
6. Tactical lane aggregation across shards is V2 work (universe-map composition); border ghosts in V1 give the local-bubble seamlessness.

### 2.5 Handoff — hard, discrete, client-imperceptible

1. When the root of an entity tree crosses a `ShardRegion` boundary, authority is handed off from the source shard to the target shard via a `Prepare → Commit → (Retire | Abort)` protocol.
2. Handoff is hard at the protocol level: there is a discrete moment at which authority changes. There is no overlapping period during which both shards write authoritatively.
3. Handoff is invisible at the client level. Target cutover is ≤100 ms (SLO). Client-side prediction plus ghost convergence hide the cutover: while authority is transferring, the entity is a ghost on the target shard's clients before it becomes authoritative, and a ghost on the source shard's clients after authority is retired. The local controlled-prediction path on the owning client continues uninterrupted.
4. The client either holds the same transport connection through handoff (gateway-proxied multi-shard awareness) or briefly re-targets to the target shard. **V1 chooses brief re-target**; gateway-proxied multi-shard transport is V2+ work. Brief re-target is acceptable if (a) total interruption is within the client's prediction budget and (b) the controlled-entity sidecar arrives on the new shard before the prediction budget is exhausted.
5. Persistence is the atomic point: source shard sends a final dirty snapshot to the persistence service, target shard hydrates from the same service. The persistence service's centralized authority guarantees the source-target snapshot pair is consistent.
6. Handoff failure modes (source crash mid-commit, target crash mid-commit, gateway crash, persistence-service unavailability) and their recovery semantics are specified in the plan.

### 2.6 Gateway routing — multi-shard route table

1. The gateway owns the canonical `ShardRouteTable` mapping `ShardRegion → ShardLease`.
2. World entry routes the client to the shard currently leasing the region containing the player's controlled entity root, or (if free-roam/no-controlled) the region containing the player anchor.
3. On handoff, the gateway updates the route table after the target shard commits.
4. The gateway is the only component clients consult for shard endpoints; runtime shards do not redirect clients directly.
5. A dedicated router service may be split out of the gateway later if the gateway becomes a bottleneck; the route-table contract above is designed so that promotion is a deployment change, not a protocol change.

2026-05-25 Phase 7 architecture update: controlled-entity handoff has a narrow exception to item 4. Source shards may deliver gateway-signed handoff route tokens to clients during cutover. The gateway remains the sole issuer and revocation authority for route credentials; shards act only as delivery vehicles for tokens the gateway pre-issued during handoff prep (see §8 of the master plan). The client trusts the gateway's signature on the token regardless of which transport carried it. This chooses the shard-delivered token path over a new gateway-to-client push channel to keep the Phase 7 p95 cutover budget reachable without adding another infrastructure round trip.

2026-05-25 Phase 7.1 implementation note: route tokens use the workspace HMAC-SHA256 primitive. The gateway signs canonical handoff token claims with `AuthConfig::auth_secret_key` (`GATEWAY_AUTH_SECRET_KEY_B64`, falling back to a SHA-256 derivation of `GATEWAY_JWT_SECRET`). Source shards request tokens from gateway `POST /internal/v1/handoff-token`, authenticated by `SIDEREAL_GATEWAY_HANDOFF_MINT_SECRET` with `GATEWAY_JWT_SECRET` as the development fallback. Clients verify the signed token before trusting the shard-delivered route message; native clients read `SIDEREAL_GATEWAY_HANDOFF_ROUTE_TOKEN_SECRET`, `GATEWAY_AUTH_SECRET_KEY_B64`, or the same development JWT fallback.

2026-05-27 Phase 7.1 Pattern A update: target replication auth accepts `ClientAuthMessage.handoff_token` as the handoff cutover credential. When present, the target shard verifies the gateway HMAC route token with the same `AuthConfig::auth_secret_key` derivation, requires the token target shard/lease/sequence/player to match an active committed target handoff, and records the accepting client entity so the same token cannot re-bind a different fresh connection. Initial world entry continues to use the JWT `access_token` path.

2026-05-23 Phase 5 implementation note: the non-product multi-process scaffold loads the gateway route table from `SIDEREAL_GATEWAY_SHARD_ROUTES`, dispatches runtime bootstrap to the selected shard via `SIDEREAL_GATEWAY_SHARD_CONTROL_ROUTES`, and updates route lease state from shard `/health` polling configured by `SIDEREAL_GATEWAY_SHARD_HEALTH_ENDPOINTS`. Gateway `GET /admin/dashboard/shard-routes` exposes the current route table to admin/dashboard callers with `metrics:read`.

### 2.7 Dynamic load response

1. Primary response: migrate or split `ShardRegion` ownership.
   - **Migrate**: move a `ShardRegion`'s lease from a hot shard to a cooler shard. Per-region migration uses the same `Prepare → Commit` shape as per-entity handoff, scaled up.
   - **Split**: subdivide a hot `ShardRegion` into two sub-regions assigned to different shards. Splitting changes the `ShardRegion` grid; an explicit per-region split policy is required (Phase 7 of the plan).
2. Secondary response: reduce noncritical lane cadence (tactical stream, diagnostics, scripting) per-shard. The current `RuntimeLaneCadence` defaults provide the dials.
3. Tertiary response: gateway enters a `Degraded` admission policy: new world-entry requests for saturated regions are queued.
4. Final fallback: a shard may enter a `Degraded` runtime state with reduced tactical/manifest cadence and a client-visible notification. This is *not* TiDi-style global tick reduction; the simulation tick rate stays at `SIM_TICK_HZ`. The contract is "degraded service before disconnect, never silent slowdown of authoritative time". Wire the policy to the existing `shard_degraded` / `shard_degraded_reasons` health fields.
5. TiDi (global simulation tick slowdown) is **rejected** as a scaling response. Sidereal's authoritative tick rate is constant; load is absorbed by migration, lane cadence reduction, admission control, and degraded mode in that order.
6. Migration trigger metrics: at minimum `fixed_tick_wall_ms_p95`, `outbound_estimated_bytes_per_client_s`, `lightyear_replication_actions_queue_depth_max`, `lightyear_replication_updates_queue_depth_max`, `shard_input_oldest_age_ms`. Numeric thresholds set per Phase 8 capture; the metric keys are reserved here.

### 2.8 Client transport semantics

1. A client maintains exactly one Lightyear transport connection at a time during V1.
2. `Replicate::to_clients(NetworkTarget::All)` semantics under sharding: "All" means all clients **connected to this shard**. The gateway plus inter-shard ghost lane is what produces a continuous experience; replication targets remain shard-local.
3. The new `observer_interpolation_target` based on `NetworkTarget::AllExceptSingle(remote_id.0)` (landing under DR-0040 Phase 1) retains this semantics: "all observers on this shard except the owner peer".

### 2.8.1 Wire-format exception to DR-0035 (f64 authoritative coordinates)

DR-0035 prohibits downcasting authoritative world positions/velocities in replication protocols. This DR establishes a narrow exception: **lossy quantized encoding is permitted only for non-durable, presentation/correction replication payloads on the wire**. The exception is bounded by these invariants, which override DR-0035 §2.6 only for the qualifying payload classes:

1. In-process authoritative state stays f64. Avian `Position`, `LinearVelocity`, `Rotation`, `AngularVelocity`, static `WorldPosition`/`WorldRotation`, and any persisted graph record remain f64.
2. Persistence envelopes (`crates/sidereal-persistence`) stay f64. No persisted record may carry a quantized motion value.
3. Scripting snapshots (`sidereal-scripting`) stay f64. Script intents and reads see authoritative precision.
4. BRP / dashboard / admin read models stay f64. JSON wire format for dashboard endpoints is unchanged.
5. Server read models (tactical lane, owner manifest, asset manifest) stay f64 in their canonical payloads; only the motion-replication payload class on the runtime client-server transport may quantize.
6. Quantized payloads must be reconstructed at the receiver to a value within documented per-component precision tolerances (default: 1 cm position, 16-bit rotation fraction, 16-bit velocity quantized against documented max). Receiver-side simulation re-promotes to f64 for client-side prediction/interpolation/correction.
7. The encoding frame of reference is recoverable from the entity's owning `ShardRegion` plus the `ShardRegion` size. Until Phase 2 establishes per-entity `ShardRegion` metadata on the wire, motion replication remains f64/lossless. Lossy region-local encoding is opt-in and tied to the typed `ShardRegion` rollout in Phases 2+.

This exception applies *only* to the qualifying wire payload classes. Any new payload class that requires lossy precision must justify its inclusion against these invariants in its DR or feature contract.

### 2.9 Decision scope: what this DR does not decide

1. Multi-region (geographic) routing: out of scope. Will be a future DR if/when needed.
2. Persistence-tier internal sharding: out of scope. The DR commits to *one logical authority*; how that authority is internally implemented (single Postgres, sharded cluster, etc.) is a persistence-tier concern.
3. NPC simulation lifecycle (Hot/Warm/Cold): `docs/features/proposed/npc_simulation_lifecycle_proposal.md` is the Phase 1 contract to prevent content-driven assumptions, but full implementation DR is separate.
4. Cross-shard fleet/party/chat: scope is fixed in the plan's Phase 7. The full UX contract is gameplay work, not networking.

## 3. Alternatives Considered

### 3.1 Single process + TiDi
Rejected. Caps single-process scale, pushes fairness/UI complexity into every gameplay system, and rules out content scenarios (events, large fleet battles) where compute scale is the primary cost. Authoritative-tick consistency under TiDi is a separate full DR's worth of complexity; preferring compute scaling avoids that.

### 3.2 Hard player-visible zone gates (WoW-style)
Rejected. Incompatible with the continuous-space product target. Would simplify multi-process scaling significantly (no ghost lane, no cross-region visibility, no seamless handoff), but the experience cost is unacceptable for the intended game.

### 3.3 Cell-level authority (`Sector` = authority unit)
Rejected. Too granular for the first multi-process architecture: handoffs would fire every few seconds per player at default sector size; ghost lane bandwidth across thousands of small borders is impractical; lease epoch churn would dominate observability. Visibility sectors remain the AOI/lifecycle unit; coarser `ShardRegion`s are the authority unit.

### 3.4 Distributed/per-shard persistence
Rejected. Multi-writer graph persistence introduces split-brain risk during handoff, complicates hydration semantics, and requires cross-shard consensus for any global operation (e.g., reading a player's full inventory while they're mid-handoff). Centralized persistence keeps source-of-truth reasoning trivial; persistence-internal scaling can be added later without touching the runtime tier.

### 3.5 Seamless multi-shard transport (client holds N connections)
Deferred (V2+). Lets handoff become truly invisible at the transport layer but adds significant client and gateway complexity. V1 uses brief client re-target within the prediction budget; V2 may promote to gateway-proxied multi-shard awareness if re-target proves perceptible in production.

### 3.6 Defer ghost lane to V2 (multi-process without ghosts first)
Rejected. Seamless border experience is the primary product reason for choosing this distribution model; without ghosts, V1 multi-process is functionally equivalent to hard zone gates (which §3.2 already rejected). Acceptance: ghost lane is in the multi-process MVP.

## 4. Consequences

### Positive

- Horizontal compute scaling without sacrificing single source of truth for durable state.
- Seamless player experience across shard boundaries.
- Centralized persistence makes hydration, handoff, and consistency reasoning straightforward.
- Reuses existing Lightyear fork capabilities: send-metrics observer, UDP backpressure, visibility lanes, channel QoS, host-server change-tick hygiene.
- Visibility/replication contract (`Authorization → Delivery → Payload`) holds unchanged across shards; the ghost lane is an additional delivery path, not a new authorization model.
- Authoritative tick rate stays constant; no TiDi-style global slowdown surfaced to gameplay or UI.

### Negative

- Multi-process MVP must include ghost lane, which expands the Phase 5–6 scope vs a "ship multi-process then add ghosts" alternative.
- Centralized persistence service will eventually be a scaling bottleneck and must be addressed by internal sharding before truly massive scale; this is a deferred problem, not an avoided one.
- Shard-to-shard Lightyear connections add operational complexity (inter-shard auth, monitoring, failure modes between trusted internal peers).
- The gateway's responsibility set grows: it gains the shard route table, world-entry shard selection, and handoff route-table updates on top of existing auth + assets + admin + bootstrap. A sibling DR may be needed to split routing out if the gateway becomes a bottleneck.
- `ShardAssignment(i32)` and `source_shard_id: i32` placeholders must be migrated to typed identifiers, which is a coordinated change across replication, persistence envelopes, and dashboard.

### Neutral

- Existing single-shard development workflow (`make run-replication` + `make run-client`) continues to work as a degenerate one-shard configuration of this architecture.
- The visibility contract is preserved; existing tests for `Authorization → Delivery → Payload` remain valid.

## 5. Follow-up

Required as part of, or immediately after, this DR landing:

1. Implementation plan: `docs/plans/completed/distribution_scaling_and_single_shard_hardening_plan_2026-05-21.md` (created alongside this DR).
2. Decision register entry pointing at this DR.
3. Update `docs/architecture/sidereal_design_document.md` to describe the four-tier architecture and `ShardRegion` authority unit.
4. Update `docs/reports/investigations/mmo_scaling_foundation_investigation_2026-05-21.md` to point at this DR.
5. Add an `AGENTS.md` rule: any PR that adds replicated state, gameplay systems, or persistence shape must answer three questions in the change description:
   - **Which shard owns this state authoritatively?**
   - **What happens to this state during `ShardRegion` handoff (frozen, mirrored as ghost, destroyed-then-respawned)?**
   - **Is this state visible across shards, and if so, through which lane and with what redaction?**
6. Update `docs/features/active/visibility_replication_contract.md` with a §10 "Cross-Shard Ghost Lane Contract" once Phase 6 of the plan starts.
7. Update `docs/features/active/server_observability_metrics_contract.md` with the migration-trigger metric reservations.

Deferred to subsequent DRs:

1. NPC simulation lifecycle (Hot/Warm/Cold AI tiers). Contract authored in `docs/features/proposed/npc_simulation_lifecycle_proposal.md` to unblock content; standalone DR follows when implementation begins (Phase 9 of the plan).
2. Cross-shard fleet/party/chat protocol. Required by Phase 7 of the plan; may produce a sibling DR if the protocol surface is large.
3. Multi-region (geographic) routing.
4. Persistence-tier internal sharding strategy.
5. Gateway route service split-out (if/when needed).

## 6. Migration / Compatibility Notes

1. `ShardAssignment(i32)` and `source_shard_id: i32` are deprecated. New APIs must not consume the raw `i32`. Migration to typed `ShardId` lands in Phase 2 of the plan, after which the placeholders are removed.
2. `bins/sidereal-shard` Makefile targets are dead. Phase 0 deletes them (or replaces with a no-op binary that prints "single-shard milestone uses sidereal-replication; see DR-0040").
3. `SIDEREAL_REPLICATION_SHARD_ID` health-tagging env var is preserved and reinterpreted as `ShardId` once the typed identifier lands.
4. `SIDEREAL_REPLICATION_SHARD_REGION_BOUNDS=min_x,min_y,max_x,max_y` is preserved and reinterpreted as the union of `ShardRegion`s owned by this shard.
5. Existing single-shard development continues to work unchanged through Phases 0–4. Multi-process runtime requires Phase 5 to ship.
6. 2026-05-23 Phase 5 persistence validation: spatial graph records in multi-route mode are validated by world position -> `ShardRegion` -> route-table lease. Non-spatial records that cannot be routed by position are validated by `shard_assignment` matching the source shard, preserving the single-writer graph rule without forcing player/root metadata records to carry artificial coordinates.

## 7. Native and WASM Impact

- This DR is documentation-only. No code, no native impact, no WASM impact at this stage.
- The implementation plan's Phase 1 single-shard hardening touches replication-server behaviour and protocol wire shape (DeltaCompression, quantization). Native and WASM clients must be rebuilt against the same protocol version when these land.
- The handoff client re-target in Phase 7 affects both native and WASM transports (UDP and WebTransport respectively). The brief-re-target contract must be validated against both transports before V1 declares done.

2026-09-05 persistence ordering update: canonical graph writes claim transactional
per-entity ordering metadata; older/equal snapshots do not overwrite newer state.
Permanent deletion retains a deletion record, preventing late snapshots from
resurrecting the UUID. This is persistence bookkeeping, not an alternate store for
player/world gameplay values. Handoff keeps identity and must not use permanent
removal. Authoring commands and baseline application execute only on the owning
shard, with normal snapshot handoff and existing replication redaction. See
[the runtime contract](../features/active/dashboard_game_authoring_runtime_contract.md).
