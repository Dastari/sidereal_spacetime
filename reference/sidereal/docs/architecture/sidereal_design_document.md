# Sidereal v3 Design Document

Status: Active
Lifecycle: source-of-truth
Category: architecture
Last updated: 2026-09-01
Owners: architecture
Scope: Sidereal v3 Design Document.
Source of truth: yes
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

Audience: engineers and maintainers

## 1. Product and Gameplay Focus

Sidereal is a server-authoritative multiplayer space RPG built around:

- deterministic fixed-step simulation,
- capability-driven Bevy ECS gameplay,
- persistent world state,
- smooth client prediction/interpolation for responsive control.

Core player loop:

1. Authenticate an account.
2. Select a character (player entity) and explicitly request Enter World.
3. Control a modular ship (flight computer + engines + fuel + hardpoints).
4. Observe and interact with nearby entities under server-enforced visibility.
5. Persist state changes through replication-owned durability pipelines.

## 2. Hard Rules

1. Authority is one-way: `client input -> replication simulation -> persistence`.
2. Clients send intent only; clients never authoritatively set world transforms/state.
3. Cross-boundary identity is UUID/entity-id only; runtime Bevy `Entity` ids never cross service boundaries.
4. Runtime entity GUIDs must be globally unique across entity families (player/ship/module/hardpoint). Do not reuse the same GUID for different entity categories.
5. Persistence/hydration must fail closed on runtime GUID collisions. Persistence batches with duplicate runtime GUIDs are rejected, and hydration aborts when collisions are detected in stored graph records.
4. Runtime simulation state is authoritative in memory; persistence is durability/hydration.
5. Visibility and redaction are server-side concerns before serialization.
6. Behavior is capability-driven; labels like "Ship" are descriptive, not branching logic.
7. Motion authority for physics entities uses Avian components directly (`Position`, `Rotation`, `LinearVelocity`, `AngularVelocity`); legacy gameplay mirror motion components are not used.
8. Static non-physics world entities use `WorldPosition` / `WorldRotation`; Avian transform components are reserved for actual physics/simulation participants.

## 3. Runtime Architecture

### 3.1 Services

- `sidereal-gateway`: auth and identity lifecycle.
- `sidereal-replication`: authoritative simulation host, visibility, client fanout, persistence staging.
- PostgreSQL + AGE: persistence.
- `sidereal-client`: native + WASM targets from one crate.

### 3.2 Current Networking

- Lightyear is the active runtime framework for:
  - replication,
  - prediction/rollback,
  - interpolation,
  - native input transport.
- Runtime protocol traffic is bincode-driven through Lightyear registrations.
- Legacy JSON envelope helpers are persistence/test fixtures only.
- Production native runtime transport is currently UDP (`UdpIo` / `ServerUdpIo`).
- Browser/WASM transport now targets a WebTransport-first browser boundary through Lightyear-compatible adapters, with WebSocket allowed only as an explicit fallback.
- The WASM client still does not implement the full native runtime, but it now shares the fixed-step gameplay core bootstrap with native instead of being a completely separate render-only shell.
- Native client reaches `InWorld` and renders replicated entities. 2026-06-10 update: in-world control, flight feel, latency, and motion/correction stability are validated in live play on real hardware — no rubber-banding observed, multi-client visibility correct, frame rates stable. The native control/prediction stabilization priority is closed; WASM parity validation work is unblocked.
- Gateway HTTP must answer browser CORS preflight for local dashboard/client origins. The runtime default allows `http://localhost:3000` and `http://127.0.0.1:3000`; set comma-separated `GATEWAY_ALLOWED_ORIGINS` when the browser host origin differs.
- Gateway and replication tracing output is written to both the console and workspace-relative `./logs/`, using a fresh timestamped log file for each process start.

Update note (2026-03-11):
- Replication and gateway startup configuration is no longer intended to be Makefile-only. Both binaries now accept CLI arguments for their core runtime configuration, with precedence `CLI > env > built-in default`.
- 2026-05-05 update: backend diagnostic verbosity is centralized through `SIDEREAL_DIAGNOSTICS`. New server/networking diagnostics should be emitted through `engine-observability` and persisted to PostgreSQL for gateway/dashboard/agent access; do not add new ad hoc debug/logging env vars for backend diagnostics.
- 2026-05-07 temporary native-stabilization update: replication server simulation DB writeback is disabled by default with `SIDEREAL_PERSIST_WRITES=off` while rubber-banding/fixed-tick debt is isolated. Startup hydration still reads persisted graph state. Set `SIDEREAL_PERSIST_WRITES=on` to re-enable periodic simulation snapshots, critical control/disconnect snapshots, shutdown simulation flushes, and sector lifecycle flush starts. 2026-06-10 follow-up: the rubber-banding that motivated this temporary default is resolved and validated in live play; re-enabling `SIDEREAL_PERSIST_WRITES=on` as the default is now unblocked (the built-in default remains `off` until explicitly flipped). 2026-06-15 resolution: the built-in default is flipped to `on` — authoritative simulation DB writeback is now enabled unless `SIDEREAL_PERSIST_WRITES=off` is set, and an unrecognized value warns and falls back to `on` rather than silently dropping writeback. Startup hydration is unchanged.
- 2026-05-21 update: Lightyear protocol version `9` enables lossless delta compression for Avian2D `Position`, `Rotation`, `LinearVelocity`, and `AngularVelocity`. The replication server adds `DeltaManager` to Lightyear server entities. Motion delta full-value keyframes default to every `60` ticks and can be tuned with `SIDEREAL_REPLICATION_MOTION_KEYFRAME_EVERY_N_TICKS`.
- 2026-08-31 update: protocol version `17` supersedes that motion-delta configuration. All four Avian motion components now replicate full-state; the motion-keyframe environment parser is retired. The same protocol batch adds shaped-zone falloff, zone-layer shader parameter sets, and pins the generic Lightyear server-conditioner propagation port at `1758f81a`. Native and WASM clients must rebuild with the matching server.
- 2026-08-31 update: registry live-resync refreshes authored presentation on ship modules,
  ship roots, planets, and asteroid-field ambient profiles. Gameplay-changing asteroid
  fracture/resource refresh is disabled by default via
  `SIDEREAL_REGISTRY_RESYNC_GAMEPLAY_STATS=false`; only the local
  `full-stack-authoring-debug` profile opts in. Universe-baseline field layout, radius,
  seed, and generated-member positions are never rewritten by this registry lane.
- Local-dev built-in defaults now align with the long-standing non-debug Makefile defaults:
  - replication UDP bind: `0.0.0.0:7001`
  - replication WebTransport bind: `0.0.0.0:7003`
  - replication control UDP bind: `127.0.0.1:9004`
  - replication health bind: `127.0.0.1:15716`
  - persistence service IPC bind: `127.0.0.1:9010`
  - persistence service health bind: `127.0.0.1:15717`
  - gateway HTTP bind: `0.0.0.0:8080`
  - asset root: `./data`
  - scripts root: `./data/scripts`
  - gateway allowed origins: `http://localhost:3000,http://127.0.0.1:3000`
- BRP remains opt-in and loopback-only. Those defaults were not changed to always-on runtime behavior.

Update note (2026-04-24):
- Gateway world-entry responses should advertise a client-reachable native replication endpoint through `REPLICATION_UDP_PUBLIC_ADDR` / `--replication-udp-public-addr`; do not advertise `127.0.0.1:7001` to clients on another host.
- Native clients now guard the common remote-host misconfiguration case: when a remote `GATEWAY_URL` is used but the advertised/fallback UDP endpoint resolves to loopback, the client derives the replication host from the gateway URL and keeps the advertised UDP port, logging the rewrite. This is a compatibility fallback, not a substitute for correct public server configuration.
- Native clients also choose a wildcard local UDP bind (`0.0.0.0:0`) by default when the resolved replication target is remote, while preserving loopback bind defaults for local replication and respecting explicit `CLIENT_UDP_BIND` configuration.
- Native impact: remote Windows/native clients can connect when the gateway and replication server share a host but the gateway still advertises the local-dev loopback default. WASM impact: no change; browser clients still require explicit WebTransport address and certificate digest.

### 3.2.1 Server-Only Admin Spawn Control Path (Current)

Server-authoritative entity spawning for dashboard/dev tooling uses a dedicated gateway-admin path:

1. Gateway endpoint: `POST /admin/spawn-entity`.
2. Caller must present a valid gateway access token with role `admin`, `dev_tool`, or `developer`, `session_context.mfa_verified=true`, and scope `admin:spawn`.
3. Gateway forwards a control command to replication over the replication control channel.
4. Replication validates:
   - canonical `player_entity_id` UUID,
   - allowed `bundle_id` from Lua bundle registry,
   - allowed override keys/shape/size.
5. Replication executes Lua bundle spawn via `bundles/entity_registry.lua` (`build_graph_records` path), enforces `owner_id` server-side, persists graph records, hydrates runtime entities, and lets normal replication/owner-manifest flows publish results.

Security rules:

1. Game client transport is never allowed to issue spawn commands.
2. Caller-supplied owner overrides are ignored/replaced by server-authoritative target player id.
3. Spawn requests are audit-logged with actor, target player, bundle, and spawned entity id.

### 3.2.2 Bevy Remote Inspection (Current)

- `bevy_remote` is available for client/replication inspection in development.
- Current hardening policy is loopback-only bind.
- A BRP auth token is still required in config, but it is not yet the primary network security boundary.
- Non-loopback BRP exposure is not allowed until an authenticated HTTP gate exists in front of the endpoint.

### 3.3 WASM Transport Direction (Current)

WASM client direction is WebTransport-first:

- Lightyear browser transport uses WebTransport as the primary runtime lane.
- Gateway auth/bootstrap/asset payloads remain authenticated HTTP, not replication transport.
- WebSocket may exist only as an explicit fallback path; it is not the default browser runtime transport.

Gameplay/simulation systems remain shared between native and WASM; only transport and browser I/O adapters differ at the boundary.
Live browser parity validation beyond the current bootstrap state was temporarily deferred while native in-world control and correction issues were being stabilized; 2026-06-10 update: native stability is validated in live play, so that deferral is lifted and browser parity validation can resume.

## 4. Bevy ECS Gameplay Model

### 4.1 ECS Principles

- Composition over inheritance.
- Generic entity terminology for generic systems.
- Domain behavior through components/capabilities, not hardcoded entity classes.
- Shared gameplay logic in `crates/sidereal-game` is source-of-truth for runtime behavior.

### 4.2 Core Gameplay Components (Current)

Identity and ownership:

- `EntityGuid`
- `DisplayName`
- `OwnerId`
- `FactionId`, `FactionVisibility`, `PublicVisibility`
- `ShardAssignment`

Ship/modularity:

- `Hardpoint`
- `MountedOn`
- `FlightComputer`
- `Engine`
- `FuelTank`
- `ActionQueue`

Physics/mass:

- Avian: `RigidBody`, `Collider`, `Position`, `Rotation`, `LinearVelocity`, `AngularVelocity`, `Mass`, `AngularInertia`, `LockedAxes`
- Gameplay: `MassKg`, `BaseMassKg`, `CargoMassKg`, `ModuleMassKg`, `TotalMassKg`, `MassDirty`, `SizeM`

Visibility/scanning:

- `VisibilityRangeM`
- `ScannerComponent`
- `VisibilityRangeBuffM`

Visual identity (2D migration path):

- `VisualAssetId` (entity-generic sprite asset identity)
- `SpriteShaderAssetId` (optional sprite pixel-shader asset identity)
- Render composition uses baseline-authored global/zone fullscreen layer instances plus Lua-authored generic world-space definitions/rules, executed through a fixed set of generic client material schemas. Concrete per-instance values use `ShaderParameterSet`; see `docs/decisions/dr-0027_lua_authored_render_layers_and_generic_shader_pipeline.md`.
- Runtime shader/material ownership follows a family taxonomy rather than one Rust material type per effect; see `docs/decisions/dr-0029_runtime_shader_family_taxonomy_and_lua_authoring_model.md`.

### 4.2.1 Render Layer Contract (Planned Direction)

The generic 2D render composition direction is:

1. Default non-fullscreen entities render in the main world layer.
2. Lua-authored rules may redirect entities to other world layers by labels/archetype/component presence.
3. Fullscreen background and foreground layers are authored separately from generic gameplay spawn paths.
4. Camera-scoped post-process passes are authored separately from world-layer assignment.
5. Layer depth/parallax is render-derived only; it must not mutate authoritative entity positions or other simulation motion state.

### 4.3 Capability Rules

Any entity with:

- `Engine` + `FuelTank` can generate thrust.
- `FlightComputer` can consume flight intent.
- `HealthPool` can be damaged/destroyed.
- scanner components can participate in visibility extension.
- hardpoints and mount links can host modular behavior.

### 4.4 Hierarchy and Relationships

- Parent-child and mount relationships must persist and hydrate deterministically.
- `MountedOn.parent_entity_id` is canonical across boundaries.
- Bevy hierarchy is rebuilt from persisted relationships on hydration.

### 4.5 Possible Future Gameplay Systems (Planning)

The following are non-exhaustive candidate systems for future phases.  
These are directional planning notes and do not override phase gating or enforceable rules.

- **Control and intent**
  - control handoff validation/ack flow,
  - intent queue conflict resolution and stale-intent pruning,
  - capability-based action rejection with explicit reasons.
- **Flight and propulsion**
  - fuel request/allocation policy across multiple tanks,
  - engine degradation/failure effects,
  - collision-aware correction tuning for predicted controlled entities.
- **Hierarchy and modular runtime**
  - parent-link and hardpoint occupancy validation,
  - module attach/detach transitions with deterministic hierarchy rebuild,
  - module disable/destroy propagation into parent capabilities.
- **Combat and survivability**
  - weapon fire intent -> projectile spawn/authority routing,
  - hit resolution and damage pipeline (shield/armor/hull),
  - destroy/disable lifecycle state transitions.
- **Sensors and visibility**
  - scanner contribution aggregation and dynamic range buffs,
  - faction/public visibility policy expansion and redaction,
  - delivery-scope throttling under load.
- **Economy/inventory progression**
  - inventory transfer validation and ownership checks,
  - cargo mass coupling to runtime physics updates,
  - persistent progression mutations on player-scoped entities.

## 5. Simulation, Tick, and Prediction

### 5.1 Timing Contract

- Fixed simulation tick: 60 Hz.
- Gameplay physics and prediction logic run in fixed schedules.
- Frame-time deltas are render/UI only, never authoritative simulation math.

### 5.2 Input Contract

Client writes per-tick `PlayerInput` intent:

```rust
pub struct PlayerInput {
    pub actions: Vec<EntityAction>,
}
```

Server input routing is bound to authenticated session identity and controlled entity mapping.
The realtime-input rate-limit bucket is keyed by the bound Lightyear client entity, not the packet's claimed player ID; spoofed claims cannot create quota buckets.
Authoritative replication input is carried by Sidereal's authenticated realtime input lane; Lightyear native input remains client-local prediction support and native-client protocol compatibility, not the server's authoritative input source.
Authoritative realtime input snapshots are short-lived: the replication server expires them after `REPLICATION_REALTIME_INPUT_TIMEOUT_SECONDS` (default `0.35s`) so stale held input cannot persist across focus loss or background throttling.

2026-04-24 update: `ClientRealtimeInputMessage` carries the server-issued `control_generation` lease observed by the client. The replication server rejects realtime input whose generation does not match the currently authoritative player lease so delayed packets from a previous controlled entity cannot apply intent to a newly controlled target.

2026-04-27 update: native clients keep Lightyear native input for local `ActionState<PlayerInput>` and rollback replay history, but Lightyear input-based rollback is disabled because replication does not run Lightyear's native server input receiver. Authoritative reconciliation is server state rollback/correction from Sidereal realtime input.

2026-04-27 update: `ServerSessionReadyMessage` includes the server's current `control_generation` and authoritative controlled target. A reconnecting client must adopt that lease before sending realtime input; otherwise the server will reject input as stale generation.

2026-05-28 update: `ServerSessionReadyMessage` also includes the server's current shard `lease_epoch`. Native clients must adopt that epoch into `ClientInputSendState` before sending realtime input so initial login and fresh Pattern A handoff connections do not emit epoch `0` packets that the shard correctly rejects as stale.

2026-04-27 update: realtime input snapshots are discarded when they expire, carry a stale control generation, or target an entity the player no longer controls. Client disconnect notify clears per-player realtime input tick/latest-state resources. As of 2026-08-31 the rate-limit window is connection-scoped and is removed by disconnected-client cleanup rather than player-state cleanup. This keeps latest-intent state from surviving disconnects or control handoffs as reusable input residue without allowing a live connection to reset its quota through rebinds.

### 5.2.1 Control and Camera Chain (Normative)

Authoritative runtime chain:

1. `camera <- player entity <- controlled entity (optional)`

Rules:

1. `ControlledEntityGuid = Some(target)`:
- action routing target is controlled entity by default,
- player entity follows controlled entity position/state,
- camera follows player entity.
2. `ControlledEntityGuid = Some(self player guid)`:
- action routing target is player entity,
- player movement acceptor handles free-roam actions (WASD),
- camera follows player entity.
3. Detached free-camera is an explicit camera mode:
- enabled/disabled by explicit client mode switch,
- gameplay movement intent emission is suppressed while detached (camera-only pan),
- detached mode does not redefine server-authoritative control routing semantics.

Single-writer motion principle:

1. Controlled mode: controlled entity simulation writes controlled motion; player-follow system writes player anchor.
2. Uncontrolled mode: player movement system writes player motion.
3. Camera systems never write authoritative simulation motion state.

2026-04-27 update: self-controlled player anchors may be non-physics entities with `LinearVelocity` but no Avian `RigidBody`. Shared fixed-step player movement must therefore integrate their `Position`/`Transform` directly, while physics-backed controlled entities continue to leave integration to Avian.

### 5.3 Prediction and Interpolation

Controlled entity:

- runs Lightyear predicted mode (`Predicted`),
- rollback rewinds to confirmed state and resimulates with shared gameplay + Avian physics,
- correction policy is tunable via client env vars.

Remote entities:

- run Lightyear interpolation (`Interpolated`) + frame interpolation for smooth rendering.

### 5.4 Rollback Performance Expectations

- rollback can re-run fixed-step systems multiple ticks,
- expensive non-authoritative systems should guard with rollback checks where appropriate,
- authoritative flight/mass systems must still run during rollback.

## 6. Persistence and Hydration

### 6.1 Canonical Shape

Persistence uses graph records:

- `GraphEntityRecord`
- `GraphComponentRecord`
- relationship edges for parent-child and modular mounts

World-delta legacy persistence shapes are not used.

### 6.2 Runtime Persistence Flow

1. Replication sim updates ECS state.
2. Persistence snapshot system serializes registered durable components.
3. Upserts/removals are persisted in graph form.
4. Startup hydration reconstructs ECS entities/components/relationships deterministically.

2026-05-01 update: replication admin shutdown now performs a final synchronous graph snapshot
flush before emitting `AppExit`. This keeps the existing one-way authority flow intact: only the
server's authoritative ECS state is persisted, payloads remain `GraphEntityRecord` /
`GraphComponentRecord`, and clients do not authoritatively write transform or fuel state. Native
impact: movement or fuel changes made shortly before a normal TUI/admin `quit` are not lost to the
periodic snapshot interval. WASM impact: none.

2026-05-05 update: replication admin shutdown still synchronously flushes authoritative state
before `AppExit`, but now reuses the periodic persistence fingerprint baseline when available. A
shutdown with no changed persistable records can skip the duplicate full graph write after any
already-enqueued worker write has completed; changed records are written synchronously as a delta.
The path falls back to a full synchronous snapshot when no fingerprint baseline exists or an unsent
worker batch is still held locally. Native impact: normal TUI/admin `quit` should terminate much
faster when the world is already persisted, without weakening final movement/fuel durability. WASM
impact: none.

2026-05-05 update: graph schema initialization now creates the canonical AGE vertex labels
(`Entity`, `Component`) up front and adds GIN indexes on their `properties` columns. AGE Cypher
lookups by `entity_id` / `component_id` compile to `properties @> ...` filters, so these indexes
are required for shutdown and periodic graph writes to avoid repeated vertex-table scans. Native
impact: replication persistence writes and shutdown flushes should scale with indexed graph
lookups rather than full scans. WASM impact: none.

### 6.3 Persistence Boundaries

- Avian transient internals are not persisted.
- Durable gameplay state required after restart must be represented in persistable gameplay components.
- New persistable gameplay components must support `Reflect` + serde and include roundtrip coverage.
- Custom gameplay component definitions live in `crates/sidereal-game/src/components/` as individual component files and are registered through the shared game component registry.
- Persisted/replicated component metadata is declared with `#[sidereal_component(kind = \"...\", persist = bool, replicate = bool, visibility = [...])]`; visibility defaults to owner-only when omitted.
- Visibility policy metadata supports multiple scopes (`[OwnerOnly, Faction, Public]`) so the server can enforce field delivery by authorization policy rather than client-side assumptions.
- Detailed authoring workflow and examples live in `docs/guides/component_authoring_guide.md`.

## 7. Visibility and Data Permissions

Implementation contract for contributors: `docs/features/active/visibility_replication_contract.md`.

Server enforces three scopes:

1. world truth,
2. authorization scope,
3. delivery scope.

Rules:

- unauthorized data is never serialized,
- ownership/faction/public policies are applied server-side,
- visibility is computed over entities generically (not ship-only assumptions).
- client visibility is server-decided; clients cannot self-upgrade visibility by local inference/culling tricks.

### 7.1 Scope Definitions

- `world truth`: authoritative shard/replication runtime state for all entities/components.
- `authorization scope`: what the player is allowed to know at all (ownership, attachments, scanner reach, scan grants, faction/public policy).
- `delivery scope`: what the active client session receives right now (camera/focus culling and stream policy) from the authorized set.

A client may be authorized for more than it currently receives on a given stream.

Pipeline contract:

1. Authorization decides entitlement (security gate).
2. Delivery narrows authorized data for efficiency (interest management gate).
3. Payload redaction enforces component/field disclosure policy (serialization gate).

Implementation note:
- A performance-oriented candidate preselection step (for example spatial nearby-cell query) may run before full authorization evaluation.
- Such preselection is an optimization input only and must be fail-closed safe:
  - it must never be treated as authorization by itself,
  - it must not exclude entities that policy requires to be considered (ownership/public/faction/scan-grant exceptions),
  - final outbound delivery remains a strict narrowing of authorization.

### 7.2 Authorization and Fog-of-War Contract

- Scanner range is server-enforced fog-of-war for non-owned entities.
- There is no hidden `ShipTag` or player-observer baseline visibility floor. Visibility-range capability must be authored explicitly in data/components.
- Scanner authorization aggregates over all owned entities (not only the currently controlled entity), including valid ownership/attachment chains.
- Non-public entities outside active scanner authorization must not be delivered.
- Visibility exceptions are explicit and server-enforced:
  - entities owned by the player are always authorized,
  - entities marked `PublicVisibility` are authorized as policy allows,
  - entities marked `FactionVisibility` are authorized to matching factions.
- Unauthorized entities previously delivered must be removed via authoritative removal flow.

### 7.3 Sensitive Data Rule and Redaction

- Physical presence visibility does not imply internal state visibility.
- By default, non-owned observed entities expose physical/render-safe data only (for example position, velocity, orientation, render/body identifiers).
- Sensitive internals must be omitted unless explicitly authorized:
  - cargo manifests and transfer details,
  - private subsystem internals/loadouts,
  - hidden operational state.
- Redaction is applied server-side before transport encoding on every stream.

### 7.4 Scan Intel Grant Model

- Deep intel is unlocked by explicit, temporary server-side scan grants.
- A grant binds observer, target, field scope, source, and expiry.
- Initial field scopes include:
  - `physical_public`,
  - `combat_profile`,
  - `cargo_summary`,
  - `cargo_manifest`,
  - `systems_detail`.
- Final payload masking is computed by server policy:
  - base authorization,
  - active grants for `(observer, target)`,
  - resulting field redaction mask.
- Grant expiry or revocation must immediately restore redacted output.

### 7.5 Camera-Centered Delivery Contract (Required)

- In addition to scanner/authorization visibility, replication delivery must apply camera-centered network culling as a client optimization filter.
- Client `ClientViewUpdateMessage.camera_position_m` is the culling anchor for delivery scope, not a persistence-only field.
- For top-down gameplay, camera delivery culling uses XY coordinates only (`x`, `y`); `z` is not part of the culling decision.
- The server must avoid delivering replication updates for entities outside the camera delivery volume that the client cannot render.
- Camera delivery culling includes an additional configurable edge buffer radius beyond the visible viewport bounds so fast-moving entities do not snap/pop in at the boundary.
- Camera-centered delivery culling must never bypass authorization/ownership/faction/public visibility policy; it is an additional narrowing filter only.

### 7.6 Stream Tiers (Direction)

- Visibility and redaction policy is shared across streams; streams differ by rate/radius/detail.
- `focus_stream`: high-rate, local gameplay fidelity.
- `strategic_stream`: lower-rate, wider-radius minimap/contact picture with coarse kinematics.
- `intel_stream`: event-driven scan/intel grant updates with only grant-authorized fields.
- Client subscription to additional streams must not widen authorization rules.

### 7.7 Spatial Query and Scaling Requirements

- Visibility selection must use spatial indexing/query acceleration, not full-world scans per client tick.
- Spatial queries must include:
  - nearby cells for focus/delivery radii,
  - owned/visibility-range-derived authorization coverage.
- Keep explicit performance telemetry for visibility queries:
  - candidates per frame,
  - included entities per frame,
  - query time budget per client.

### 7.8 Scale and Control-Swap Readiness (Current vs Target)

**Is the current network system robust enough for thousands of entities, multiple owners, and players swapping which ship they control?**

**No.** The current implementation is suitable for small sessions (handful of players, tens of entities). The following gaps must be closed for the target scale and control model.

**Visibility and scale**

- **Current runtime modes:** `update_network_visibility` has a pluggable candidate stage:
  - default: `spatial_grid` (uniform-grid candidate preselection + policy exception bypass paths),
  - fallback: `full_scan` (O(clients × entities), useful for debug/validation).
- **Safety rule:** candidate preselection is optimization-only; ownership/public/faction/scanner exceptions must still be considered even if an entity misses candidate preselection.
- **Target (see 7.7):** move production/default operation to spatial indexing (and later LOD/culling tiers) with telemetry-backed tuning.

**Observer and scanner aggregation**

- **Current:** One observer position per client from persisted player runtime camera state (`position_m`/`Transform.translation` on the player entity), with visibility-source union over owned entities.
- **Target (see 7.2):** Keep scanner authorization aggregated over *all* owned entities (e.g. all ships the player owns), with observer/visibility logic supporting multiple observer points or equivalent aggregated coverage per client.

**Control swap (player changes which ship they control)**

- **Current:** Implemented via persisted `controlled_entity_guid` on the player entity. Client sends `ClientControlRequestMessage { player_entity_id, controlled_entity_id, request_seq }`; server validates ownership and updates `ControlledBy` plus `PlayerControlledEntityMap`.
- **Rule:** Control handoff is explicit request/response:
  - success: `ServerControlAckMessage { player_entity_id, request_seq, control_generation, controlled_entity_id }`,
  - failure: `ServerControlRejectMessage { player_entity_id, request_seq, control_generation, reason, authoritative_controlled_entity_id }`.
  Client clears pending control only on matching ack/reject. Free-roam is self-control (`controlled_entity_guid = player guid`), not null control.
  `control_generation` is the server-issued lease generation for the currently authoritative target; clients must key bootstrap/handoff state off that generation instead of inventing a local sequence from clone discovery alone.
  Realtime input must include the same `control_generation`; stale-generation input is rejected before it can update or drain from the latest-input snapshot.
  2026-04-27 update: a hydrated authoritative control lease is generation 1 before the first client handoff request; the first target change after startup must therefore acknowledge generation 2, and handoff updates write a targeted player-entity persistence snapshot for `controlled_entity_guid`. Graph persistence treats `last_tick` as a stale-write guard so older queued snapshots cannot overwrite newer control state.
  2026-04-27 update: graph schema/write operations are serialized in-process because Apache AGE graph mutations are not safe for concurrent targeted control snapshots and broad world snapshots against the same graph. Critical control persistence must not spawn a stampede of simultaneous AGE writes.
- **Camera/anchor contract:** camera always follows the player entity. When controlled target is not self, server continuously anchors player transform to the controlled entity.

**Multiple ships per player**

- **Current:** A player can own multiple ships; only the server-authoritative controlled ship receives input. Player can switch control among owned ships; missing targets resolve to player self-control.
- **Target:** Keep this model while extending scanner/visibility to aggregate over all owned entities at scale.

**Summary**

- **Thousands of entities, multiple players:** Not robust under `full_scan`; use `spatial_grid` (then next-stage index/LOD improvements) for large sessions as described in 7.5–7.7.
- **Players swapping between ships they own:** Implemented with server-side ownership validation and persisted player runtime state.

### 7.9 Shard and Overload Contract

2026-05-08 update: the current replication process is a single authoritative shard. Scaling to thousands of connected clients is a multi-shard/zone architecture, not a promise that one Bevy world should carry every hot entity at full cadence.

2026-05-22 update: gateway and replication now validate the DR-0040 `ShardRegion` size relationship at startup and publish the active sizing through replication health/observability.

2026-05-23 update: DR-0040 Phase 5 adds a development-only multi-process scaffold. `make dev-stack-multi` starts one persistence service, one gateway, two replication shards, and two headless clients. This is not a product multi-shard milestone until Phase 6 ghost visibility lands.

2026-05-29 update: Phase 8.3e extends gateway handoff-token minting with optional migration context. Normal handoff token requests still resolve target endpoints only from `ShardRouteTable` leases in `Active` or `Degraded` state. Region-migration requests with `migration_id` resolve the target `Migrating` lease from a `CommandsAcked` load-coordinator migration job; this keeps the route table one-lease-per-region while migration handoff execution remains a later slice.

2026-05-29 update: Phase 8.3f threads optional migration context through source handoff token request construction. Ordinary boundary-triggered source handoffs still mint tokens with no migration context, while future command-driven region migration handoff requests can carry `migration_id` and `target_region` so the gateway can resolve the command-acked migration target lease. This remains plumbing only; migration command execution is still out of scope.

2026-05-29 update: Phase 8.3g adds optional migration context to `EntityHandoffPrepare` and gates target-side migration prepares on a ready target migration-command preflight record before any target ghost despawn or hydrate. Ordinary handoffs carry no migration context and keep the existing prepare path. Passing migration prepares also record the target lease epoch in target handoff state so Commit keeps enforcing the migration target epoch.

2026-05-29 update: Phase 8.3h adds acked shard-to-gateway migration preflight reports. Source and target shards publish terminal ready/rejected preflight state to `POST /internal/v1/shard-migration-preflight-report` using the existing internal handoff mint secret header; gateway load-coordinator jobs become `preflight_ready` only after both roles report ready, or `preflight_rejected` after any rejection. Migration-aware handoff-token minting now requires `preflight_ready` instead of only `commands_acked`. This remains orchestration metadata only and does not start source migration handoffs or mutate route ownership.

2026-05-29 update: Phase 8.3i adds an explicit gateway-authorized migration execution barrier. After both source and target preflight reports are ready, the gateway marks the load-coordinator job `execution_dispatching` and sends a source-only `ShardMigrationExecutionCommand` to `POST /internal/v1/shard-migration-execution-command` with `Authorization: Bearer <SIDEREAL_INTER_SHARD_AUTH_TOKEN>`. Source shards stage the command in memory and ack duplicates idempotently; this still does not queue source handoff requests, freeze roots, send `EntityHandoffPrepare`, execute handoff, mutate route ownership, mutate shard-owned regions, write persistence, reduce cadence, or admission-control users.

2026-05-29 update: Phase 8.3j drains staged source migration execution commands into the existing source handoff path. Migration-aware handoff-token minting now requires the load-coordinator job to be `execution_command_acked`. Source shards validate the staged execution command against the ready source preflight record, deterministic source preflight report ID, source route lease epoch/state, expected root counts, and the `Migrating` target lease before building `SourceHandoffRequest` values with migration context for the preflight root GUIDs. Existing handoff concurrency, token mint, prepare, freeze, retry, and health counters apply; this does not mutate route ownership, mutate shard-owned regions, mark migration complete, retire source regions, add a new persistence/hydration path, reduce cadence, or admission-control users.

2026-05-29 update: Phase 8.3k adds source-to-gateway terminal migration execution reports. Source shards now track migration execution progress for roots queued from a staged execution command and publish one `ShardMigrationExecutionReport` to `POST /internal/v1/shard-migration-execution-report` using `x-sidereal-handoff-mint-secret`: `completed` only after all expected migration roots commit-ack, or `failed` on the first migration root abort, timeout, pre-prepare failure, token mint failure, snapshot failure, or prepare-send failure. Gateway load-coordinator jobs record `execution_completed` or `execution_failed` after validating the report against the command, leases, source preflight counts, and expected IDs; this still does not mutate route ownership, mutate shard-owned regions, finalize migration/route flip, add persistence or hydration paths, reduce cadence, or admission-control users.

2026-05-29 update: Phase 8.3l adds a gateway-controlled finalization command barrier after migration execution completion. When a load-coordinator job records `execution_completed`, the gateway marks finalization dispatch state and sends `ShardMigrationFinalizationCommand` payloads to both source and target shards at `POST /internal/v1/shard-migration-finalization-command` using `Authorization: Bearer <SIDEREAL_INTER_SHARD_AUTH_TOKEN>`. Shards stage the commands in memory and ack duplicates idempotently; no Bevy finalization processing, route flip, shard-owned-region mutation, persistence/hydration change, cadence reduction, or admission control is added in this slice. Follow-up commit `0e7c6d0` also ensures invalid source execution drain/progress-unavailable failures publish `Failed` execution reports instead of leaving jobs stuck at `execution_command_acked`.

2026-05-29 update: Phase 8.3m processes staged finalization commands on shards and reports readiness to the gateway. Target-role finalization validates the `Migrating` target lease, adds the migrated region to the target shard's local owned-region set if needed, and installs an `Active` target lease in the target's local `HandoffRouteTable` before publishing `Ready`. Source-role finalization verifies the source still owns and routes the region and that no eligible authoritative roots remain, then publishes `Ready` without removing the source owned region or changing the source local route table. Gateway accepts `POST /internal/v1/shard-migration-finalization-report` with `x-sidereal-handoff-mint-secret`, records source/target reports, and moves jobs to `finalization_ready_for_route_flip` only after both roles report ready, or `finalization_rejected` after any rejection. The canonical gateway route table is still unchanged.

2026-05-29 update: Phase 8.3n flips the gateway canonical route table after finalization readiness. When a migration job reaches `finalization_ready_for_route_flip`, the gateway requires the current canonical route for the region to still match the source shard and source lease epoch, then replaces it with the migration target lease converted to `Active`. An already-flipped target `Active` lease with the target epoch is accepted idempotently. Jobs record `route_flip_committed` or `route_flip_failed` with timestamp/error metadata. Source shard owned-region retirement is still pending and no shard route-retirement command is sent in this slice.

2026-05-29 update: Phase 8.3o retires source shard compute ownership after the gateway route flip commits. The gateway sends a source-only `ShardMigrationRouteRetirementCommand` to the source shard after `route_flip_committed`; the source validates that it still owns and locally routes the region with the source epoch and that no eligible authoritative roots remain, then removes the region from local `ReplicationShardRuntimeConfig.owned_regions`, installs the target `Active` lease in its local `HandoffRouteTable`, and reports `retired` or `rejected` back to the gateway. This does not perform another gateway route flip, add persistence/hydration changes, reduce cadence, admission-control users, or flip the Phase 8 ledger row.

2026-06-01 update: Phase 8.3p makes terminal migration cooldown and active-job semantics explicit in the gateway load coordinator. A successful `source_retired` report starts a five-minute per-region cooldown; completed `source_retired` jobs remain visible in coordinator history but no longer count as active blockers or `in_flight_migration_job_count`. Failed and rejected jobs remain blocking until a later retry/cleanup policy exists. `GET /admin/dashboard/load-coordinator` exposes sorted `region_cooldowns` and prunes expired cooldowns before snapshot generation. This is gateway planning policy only and does not mutate routes, send shard commands, mutate shard-owned regions, reduce cadence, admission-control users, or change persistence/hydration paths.

2026-05-29 update: Phase 8.3c adds gateway-side migration command dispatch for already-planned migration jobs. The gateway sends acked JSON `ShardMigrationCommand` payloads to each shard's internal migration-command receiver and records dispatch/ack state on the load-coordinator job; this does not execute region migration, mutate route ownership, mutate shard-owned regions, run handoff, write persistence, reduce cadence, or admission-control users.

Current single-shard metadata:

- `SIDEREAL_REPLICATION_SHARD_ID` sets the numeric DR-0040 `ShardId` reported through replication health and observability. The default is local shard `0`.
- `SIDEREAL_REPLICATION_OWNED_REGIONS=x,y;x,y;...` reports the compute-authority `ShardRegion` set owned by this process. The default is origin region `(0,0)`.
- `SIDEREAL_SHARD_REGION_SIZE_M` sets compute-authority `ShardRegion` size in authoritative meters for gateway/replication. Unset defaults to `8 * active_visibility_sector_size_m`, where the active visibility sector size includes visibility's sector-vs-cell clamp; explicit values are rejected at startup unless they are finite, positive, at least the active visibility sector size, and an integer multiple of that sector size.
- `SIDEREAL_REPLICATION_SHARD_REGION_BOUNDS=min_x,min_y,max_x,max_y` optionally reports shard-owned planar region bounds in authoritative meters.
- Health exposes `shard_connected_clients`, `shard_active_sectors`, `shard_hot_entities`, `shard_input_oldest_age_ms`, `shard_region_size_m`, `shard_region_visibility_sector_size_m`, and `shard_region_visibility_sectors_per_axis` as explicit single-shard operational counters. Host CPU/memory metrics remain provided by `engine-observability` process/host samples for the same process instance.
- Health `status` becomes `degraded` and `shard_degraded=true` when the shard exceeds configured SLO thresholds for input age, fixed catch-up, pending persistence age, or deferred visibility gain age. Threshold knobs are `SIDEREAL_REPLICATION_INPUT_AGE_SLO_MS`, `SIDEREAL_REPLICATION_FIXED_TICKS_LAST_UPDATE_SLO`, `SIDEREAL_REPLICATION_PERSISTENCE_PENDING_AGE_SLO_S`, and `SIDEREAL_REPLICATION_VISIBILITY_DEFERRED_GAIN_AGE_SLO_S`.

Phase 5 development multi-shard metadata:

- `SIDEREAL_GATEWAY_SHARD_ROUTES=shard_id,region_x,region_y,udp_addr,webtransport_addr[,cert_sha256];...` populates the gateway `ShardRouteTable` at startup. World entry computes the selected character's `ShardRegion`, returns the matching `ShardLease`, and uses that same shard for bootstrap dispatch.
- `SIDEREAL_GATEWAY_SHARD_CONTROL_ROUTES=shard_id,control_udp_addr;...` maps gateway bootstrap-control UDP messages to the replication shard selected by world entry. If unset, the gateway falls back to `REPLICATION_CONTROL_UDP_ADDR` for local single-shard development.
- `SIDEREAL_GATEWAY_SHARD_HEALTH_ENDPOINTS=shard_id,http://host:port/health;...` enables gateway health polling. `SIDEREAL_GATEWAY_SHARD_HEALTH_POLL_INTERVAL_MS` controls the poll interval and defaults to `1000`. A reported degraded shard, unreachable health endpoint, or mismatched health `shard_id` marks the matching route-table leases `Degraded`.
- `SIDEREAL_GATEWAY_SHARD_MIGRATION_COMMAND_ENDPOINTS=shard_id,http://host:port/internal/v1/shard-migration-command;...` maps each shard ID to the authenticated internal receiver used for Phase 8 migration command staging. Gateway dispatch uses `Authorization: Bearer <SIDEREAL_INTER_SHARD_AUTH_TOKEN>`, and replication receivers reject unset or mismatched bearer tokens.
- `SIDEREAL_SHARD_MIGRATION_EXECUTION_ENDPOINTS=shard_id,http://host:port/internal/v1/shard-migration-execution-command;...` maps source shard IDs to the authenticated internal receiver used for Phase 8.3i migration execution-command staging. Gateway dispatch uses the same `Authorization: Bearer <SIDEREAL_INTER_SHARD_AUTH_TOKEN>` bearer contract and records execution ack/failure state on the load-coordinator job; as of Phase 8.3j, a successfully acked execution command authorizes the source shard to drain the preflight root inventory into the existing source handoff path.
- `SIDEREAL_SHARD_MIGRATION_FINALIZATION_ENDPOINTS=shard_id,http://host:port/internal/v1/shard-migration-finalization-command;...` maps source and target shard IDs to the authenticated internal receiver used for Phase 8.3l finalization-command staging after `execution_completed`. Gateway dispatch uses the same inter-shard bearer-token contract and records finalization ack/failure state on the load-coordinator job without flipping routes.
- `POST /internal/v1/shard-migration-execution-report` accepts Phase 8.3k source terminal execution reports with the existing `x-sidereal-handoff-mint-secret` gateway internal-auth header. Reports transition load-coordinator jobs to `execution_completed` or `execution_failed` after validation, but do not perform the migration route flip.
- `POST /internal/v1/shard-migration-finalization-report` accepts Phase 8.3m source/target finalization readiness reports with the same `x-sidereal-handoff-mint-secret` gateway internal-auth header. Reports transition load-coordinator jobs to `finalization_ready_for_route_flip` or `finalization_rejected`; the gateway route table remains unchanged until a later route-flip slice.
- As of Phase 8.3n, `finalization_ready_for_route_flip` immediately attempts the gateway canonical route update. Successful flips replace the region lease with the target shard's `Active` lease and mark the job `route_flip_committed`; failed precondition checks leave the current route unchanged and mark `route_flip_failed`. Source shard owned-region retirement remains a later slice.
- `SIDEREAL_SHARD_MIGRATION_ROUTE_RETIREMENT_ENDPOINTS=shard_id,http://host:port/internal/v1/shard-migration-route-retirement-command;...` maps source shard IDs to the authenticated internal receiver used for Phase 8.3o source route-retirement staging after `route_flip_committed`.
- `POST /internal/v1/shard-migration-route-retirement-report` accepts Phase 8.3o source retirement terminal reports with the existing `x-sidereal-handoff-mint-secret` gateway internal-auth header. Reports transition load-coordinator jobs to `source_retired` or `source_retirement_rejected`; the gateway canonical route was already flipped by Phase 8.3n and is not changed by this report path.
- As of Phase 8.3p, a `source_retired` migration job starts a five-minute per-region coordinator cooldown. Completed `source_retired` jobs remain in load-coordinator history but do not count as active in `in_flight_migration_job_count`; failed/rejected jobs remain active blockers until a retry/cleanup policy exists. `GET /admin/dashboard/load-coordinator` includes sorted `region_cooldowns` in addition to `cooldown_count`.
- Gateway `GET /admin/dashboard/shard-routes` exposes a sorted route-table snapshot to admin/dashboard callers with `metrics:read`; the dashboard proxy is `GET /api/routing/shard-routes`.
- When `SIDEREAL_REPLICATION_OWNED_REGIONS` or explicit region bounds are configured, replication startup/deferred hydration keeps only owned spatial graph records plus required non-spatial player, owner, controlled-target, and relationship records. Spatial records outside the shard-owned region are not included through closure.

Shard contracts:

- Each loaded entity has exactly one authoritative shard writer at a time.
- Shard identity must include shard ID, region/sector ownership, player session assignment, and future handoff metadata before gateway routing fans out beyond one shard.
- Gateway routing may assign sessions to shards, but it must not introduce dual authoritative DB writers for the same loaded entity.
- Cross-shard handoff is future explicit work and must preserve the same one-way authority flow: `client input -> shard sim -> replication/distribution -> persistence`.

Overload behavior:

- Reduce or defer noncritical lanes first: visibility/AOI gains, tactical/owner/asset stream cadence, persistence flush freshness, scripting interval/event work, diagnostics sampling, and far-entity replication detail.
- Never silently delay authoritative input beyond SLO. Input age, receive-to-drain delay, fixed catch-up, lane over-budget counts, visibility deferred age, and persistence pending age must mark the shard unhealthy through health/observability.
- Dense-sector admission restrictions are allowed only as explicit policy after metrics show noncritical-lane deferral is insufficient.
- Cold/persisted sectors must not run full physics, visibility, scripting, or tactical work until promoted/hydrated by player interest.

2026-05-22 update: NPC Hot/Warm/Cold simulation tiering is documented as a contract in `docs/features/proposed/npc_simulation_lifecycle_proposal.md`. Implementation remains DR-0040 Phase 9; until then, content must not assume all NPCs are always fully simulated at fixed-tick cadence.

## 8. Auth and Session Identity

- Gateway owns auth lifecycle (`register/login/refresh/reset`).
- 2026-04-26 target update: gateway auth is being expanded to own dashboard account sessions, SMTP-backed password reset/email login, TOTP MFA, scoped JWT claims, refresh-token rotation, JWKS, and explicit character creation. The implementation plan is `docs/plans/superseded/gateway_dashboard_auth_character_flow_plan_2026-04-26.md`, with decision detail `docs/decisions/dr-0036_gateway_account_auth_dashboard_and_character_creation.md`.
- 2026-04-26 implementation update: gateway v1 email login now supports one-time code and magic-link token requests/verification, v1 password reset request delivers by email without returning raw reset tokens, and delivery can run in `GATEWAY_EMAIL_DELIVERY=noop|log|smtp` mode. SMTP mode requires `GATEWAY_SMTP_RELAY`, `GATEWAY_SMTP_USERNAME`, `GATEWAY_SMTP_PASSWORD`, and `GATEWAY_SMTP_FROM`; challenge links use `GATEWAY_PUBLIC_BASE_URL`, and delivery throttles use `GATEWAY_EMAIL_RESEND_COOLDOWN_S` plus `GATEWAY_EMAIL_MAX_PER_EMAIL_PER_HOUR`.
- 2026-04-26 implementation update: gateway v1 TOTP enrollment supports `/auth/v1/mfa/totp/enroll` and `/auth/v1/mfa/totp/verify`, returning a provisioning URI and QR SVG and storing encrypted pending/verified TOTP secrets. `GATEWAY_AUTH_SECRET_KEY_B64` should be a 32-byte base64 key in production; `GATEWAY_TOTP_ISSUER`, `GATEWAY_TOTP_STEP_S`, `GATEWAY_TOTP_DIGITS`, `GATEWAY_TOTP_ALLOWED_DRIFT_STEPS`, and `GATEWAY_TOTP_ENROLLMENT_TTL_S` configure the primitive.
- 2026-04-26 implementation update: gateway v1 password login returns a persisted TOTP login challenge for accounts with verified TOTP, `/auth/v1/login/challenge/totp` consumes successful challenges, and issued access tokens include defaulted `scope` plus `session_context` claims. TOTP-authenticated tokens set `auth_method=password_totp`, `mfa_verified=true`, and `mfa_methods=["totp"]`.
- 2026-04-26 implementation update: native/WASM game-client login uses the v1 password/TOTP challenge flow. Legacy `/auth/login` must not issue direct tokens for accounts with verified TOTP.
- 2026-04-26 implementation update: game-client auth UI is login-only. Registration and password reset request/confirm are dashboard web flows; native clients open dashboard `/forgot-password` via `SIDEREAL_DASHBOARD_URL` (default `http://127.0.0.1:3000`). Legacy gateway `/auth/password-reset/*` routes are removed in favor of `/auth/v1/password-reset/*`.
- 2026-04-26 implementation update: `/auth/v1/mfa/totp/verify` returns fresh MFA-verified tokens after enrollment, and dashboard `/mfa-setup` uses those tokens to let newly bootstrapped admin/dev accounts complete authenticator setup before entering guarded dashboard routes.
- 2026-04-29 implementation update: `/auth/v1/accounts/{account_id}/mfa/totp` soft-disables a verified TOTP secret. The authenticated account may disable its own MFA only with a current MFA-verified session when TOTP is enabled; admins may reset another account's MFA only with verified MFA and `admin:accounts:write`. Self-disable returns fresh non-MFA tokens so dashboard admin access is removed immediately.
- 2026-04-26 implementation update: gateway stores account roles/scopes in `auth_account_roles` and `auth_account_scopes`; issued access tokens include persisted roles, a space-delimited `scope` string, and `session_context.active_scope`. Gateway admin spawn and script-management endpoints now require admin/dev role, verified MFA, and route-specific scopes (`admin:spawn`, `scripts:read`, `scripts:write`).
- 2026-04-26 implementation update: dashboard `/login` proxies gateway login/register/TOTP challenge completion and stores gateway tokens in an encrypted HttpOnly `sidereal_dashboard_auth` cookie using `SIDEREAL_DASHBOARD_SESSION_SECRET`. The pathless dashboard route uses a TanStack Router `beforeLoad` auth guard, and dashboard API handlers now use the gateway-backed admin/MFA/scope guard.
- 2026-09-01 implementation update: dashboard mutation CSRF validation accepts the direct request origin plus exact origins configured in `SIDEREAL_DASHBOARD_TRUSTED_ORIGINS`, enabling HTTPS reverse-proxy termination without trusting arbitrary forwarded headers. Cookies issued through an allowed HTTPS browser origin retain `Secure` across an internal HTTP proxy hop.
- 2026-04-26 implementation update: first administrator setup is gateway-owned through `/auth/v1/bootstrap/status` and `/auth/v1/bootstrap/admin`. Bootstrap requires `GATEWAY_BOOTSTRAP_TOKEN`, is eligible only while the database has no bootstrap state and no admin/dev role, records completion in `auth_bootstrap_state`, and is surfaced by dashboard `/setup` before normal login.
- 2026-04-26 implementation update: authenticated dashboard root `/` is now the `My Account` character-selection surface. Account character list/create/delete/reset operations are gateway-owned and documented with the reusable layout contract in `docs/features/active/account_character_selection_layout_contract.md`.
- 2026-04-26 implementation update: regular authenticated dashboard users may access only `/` for My Account character management. All other dashboard tool routes remain admin-only and require admin/dev/developer role, verified MFA, `dashboard:access`, and route-specific scopes where applicable.
- 2026-04-26 implementation update: gateway world entry now returns fresh character-scoped tokens whose `player_entity_id` claim and `session_context.active_character_id` match the selected character. The native client uses those tokens for replication auth and renders character display names from gateway character summaries in the character-select roster.
- 2026-05-22 implementation update: gateway world entry also returns the selected DR-0040 `ShardLease` and `ShardRegion`. The current single-shard default is a one-entry route table for region `(0,0)`; development route scaffolds can use `SIDEREAL_GATEWAY_SHARD_ROUTES=shard_id,region_x,region_y,udp_addr,webtransport_addr[,cert_sha256];...`.
- Registration creates account/auth state only; it must not create a default character or starter-world graph records after the `DR-0036` migration lands.
- Explicit character creation creates and persists the account-owned character/player entity and starter graph records in durability storage.
- Public dashboard/web registration is the account creation surface; the game client supports login and character selection/creation, but not public account registration.
- Dashboard admin access uses gateway account sessions with admin/dev role, route-specific scopes, and verified MFA. The legacy standalone dashboard admin password is superseded by the `DR-0036` target.
- Register/login are auth-only and must not implicitly bind a runtime world session.
- Runtime bootstrap handoff from gateway to replication is explicit `Enter World` behavior and must be idempotent per `player_entity_id`.
- Runtime replication auth must use the character-scoped token returned by `Enter World`, not the account login token.
- `Enter World` requests must ensure runtime presence/bind for the selected character on every reconnect attempt; idempotency must not prevent reconnect rebind when runtime entities are missing.
- Player-specific runtime/persistent data is player-entity scoped. Authoritative control state persists via `controlled_entity_guid` on the player entity; score, quest progression, and other character-local settings persist on the player entity in graph persistence.
- Account identity is an auth container and external reference. An account may own multiple player entities (characters); `player_entity_id` selects which character/session identity is bound for runtime control.
- Replication binds session transport identity to authenticated `player_entity_id`.
- 2026-04-28 update: replication auth fails closed when the selected player entity is missing its persisted `AccountId` binding or the binding does not match the authenticated account subject. Replication must reject the session with `ServerSessionDeniedMessage` rather than patching account ownership at runtime, because missing bindings are persistence/hydration faults and must not be hidden during session bind.
- Replication must validate character-scoped world tokens for session bind. The `DR-0036` target replaces shared symmetric gateway JWT secret validation with asymmetric JWT/JWKS validation.
- Replication auth denial must be explicit: invalid player ids, rejected tokens, ownership mismatches, and temporarily unavailable player runtime entities return `ServerSessionDeniedMessage` rather than only logging and dropping the request.
- Client world entry state transition is `Auth -> CharacterSelect -> WorldLoading -> AssetLoading -> InWorld`; replication session-ready bind acknowledgment for the selected `player_entity_id` is the gate that starts bootstrap-required asset validation/download, and transition to `InWorld` occurs only after session-ready, required asset validation/download, and replicated player-entity presence on client.
- Input packets with mismatched identity claims are rejected.
- Gameplay control selection remains ownership-authorized.
- Runtime systems must fail closed on ownership/identity mismatches (reject and log) rather than silently creating replacement state.

## 9. Asset Delivery

- Asset definitions are authored in Lua runtime asset registry scripts and compiled into authoritative catalog metadata.
- Rust runtime code must not hardcode concrete gameplay asset IDs, filenames, shader names, material names, sprite names, or audio names.
- Each published asset version has an immutable generated `asset_guid`; payload download route is authenticated gateway HTTP `GET /assets/<asset_guid>`.
- Client startup receives server-authoritative asset manifest metadata (required assets and optional full catalog) including `asset_id`, `asset_guid`, checksum, and fetch URL.
- Client world entry lifecycle includes a dedicated `AssetLoading` state between `WorldLoading` and `InWorld`; required assets must validate/download before `InWorld`.
- Runtime missing assets are fetched lazily by `asset_guid` when new `asset_id` references appear in replicated data.
- Target cache shape remains `assets.pak` + `assets.index`; rollout and schema details are tracked in `docs/features/active/asset_delivery_contract.md`.
- Missing assets must fail soft (no gameplay crash).
- Shader asset metadata should evolve toward domain/signature/schema compatibility metadata rather than singleton hard-coded runtime role dispatch; details live in `docs/decisions/dr-0027_lua_authored_render_layers_and_generic_shader_pipeline.md` and `docs/features/active/asset_delivery_contract.md`.

## 10. Client Platform Model

- One client crate (`bins/sidereal-client`) with:
  - native `[[bin]]` target,
  - WASM `[lib]` target.
- Platform branching is `cfg(target_arch = "wasm32")` only.
- Native and WASM gameplay behavior stay in lockstep; transport adapters are platform-specific boundary code.
- Native renderer backend selection uses `SIDEREAL_CLIENT_WGPU_BACKENDS` first, then `WGPU_BACKEND`, then defaults to `PRIMARY` backends (`VULKAN | METAL | DX12 | BROWSER_WEBGPU`) when unset.
- Native client startup does not perform multi-instance lock/tracking; separate local client processes are treated identically.
- `SIDEREAL_CLIENT_FORCE_SOFTWARE_ADAPTER` is explicit opt-in only (`1`/`true` forces software adapter; unset or `0`/`false` keeps hardware adapter selection).
- Native primary window is user-resizable with enforced minimum logical size `960x540`; resize/minimize transitions treat non-positive viewport dimensions as non-renderable for fullscreen backdrop/material uniform updates.
- 2026-03-11 update: native client runtime configuration now supports command-line overrides as well as environment variables. `sidereal-client --help` is the canonical discovery surface for native launch options, and CLI flags take precedence over env vars for the current process.
- 2026-03-11 update: env-driven debug toggles and diagnostic kill-switch startup flags were removed from the native client startup surface. Native startup config is now limited to real transport/render/bootstrap/runtime tuning inputs rather than debug-only launch switches.
- 2026-03-11 update: native client bootstrap now initializes runtime resources by domain (transport, asset runtime, control/prediction, diagnostics, tactical/UI, scene/render), and shared replication/control scheduling is composed once before headless-vs-interactive divergences are applied. This keeps entrypoint ownership closer to documented domain boundaries without introducing a native-only runtime fork.
- 2026-03-14 update: native windowed client now runs the Bevy/winit event loop in continuous mode even while unfocused. Native impact: alt-tabbed local clients keep ticking prediction/replication/UI maintenance instead of dropping into Bevy's default low-power unfocused mode, which reduces oversized rollback aborts and stale delta-cache mismatches after refocus. WASM impact: no WASM impact; browser focus/background throttling behavior remains platform-managed.
- 2026-04-29 update: streamed world-visual presentation has bounded dense-entry work. `SIDEREAL_CLIENT_STREAMED_VISUAL_ATTACH_BUDGET` limits main-thread visual attachments per frame (default 24), `SIDEREAL_CLIENT_STREAMED_VISUAL_PROCEDURAL_BUDGET` limits procedural sprite generation jobs queued per frame (default 4), and `SIDEREAL_CLIENT_STREAMED_VISUAL_PENDING_PROCEDURAL_BUDGET` limits in-flight procedural generation jobs (default 8). Procedural image generation runs on Bevy's async compute pool; the presentation frame only polls completed payloads and creates/attaches ready visual assets.

## 11. Engineering Boundaries

- Keep gameplay logic in shared crates, not duplicated across client/server binaries.
- Keep entrypoints focused on wiring/plugin composition.
- Split mixed domains into focused modules (input, visibility, persistence, auth, rendering, etc.).
- Do not reintroduce legacy world-delta or legacy gameplay mirror-motion pathways.

## 12. Operational Validation Baseline

Minimum checks for significant runtime changes:

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo check --workspace
```

If client behavior/protocol/prediction changes:

```bash
cargo check -p sidereal-client --target wasm32-unknown-unknown --features bevy/webgpu
cargo check -p sidereal-client --target x86_64-pc-windows-gnu
```

---

For prediction runtime tuning and validation backlog details, see `docs/features/reference/prediction_runtime_tuning_and_validation_reference.md`.
This document is the current-state architecture contract.
