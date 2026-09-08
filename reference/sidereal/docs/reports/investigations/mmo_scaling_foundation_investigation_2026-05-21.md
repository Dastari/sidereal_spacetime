# MMO Scaling Foundation Assessment — 2026-05-21

Status: Archived
Lifecycle: historical-report
Category: report
Last updated: 2026-06-04
Owners: report author
Scope: MMO Scaling Foundation Assessment — 2026-05-21.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

## 0.0 Status Update — 2026-05-21 (post-decision)

The "decide architecture" question raised by this assessment is resolved in **DR-0040 — Distribution and Persistence Authority Model**:

- Multi-process compute (N `sidereal-replication` shards on `ShardRegion` authority units).
- Centralized persistence service (one logical authority).
- Cross-shard ghost proxies from V1 (not deferred).
- Hard-but-client-imperceptible handoffs at `ShardRegion` boundaries.
- TiDi rejected as scaling response.

Implementation phasing in `docs/plans/completed/distribution_scaling_and_single_shard_hardening_plan_2026-05-21.md`.

The rest of this report (foundations, gaps, industry comparison, recommendations) remains the source-of-truth analysis the decision was made against, and is preserved as historical context.

## 0.1 Implementation Progress Update — 2026-05-21

Gap 1 below ("No bandwidth quantization or delta compression") is now partially addressed by DR-0040 Phase 1.1 work: Sidereal depends on `Dastari/lightyear` commit `0192db9c9235f807f170c0f7400dd55099a41447`, registers lossless Lightyear delta compression for Avian2D `Position`, `Rotation`, `LinearVelocity`, and `AngularVelocity`, and forces full-value motion keyframes every `SIDEREAL_REPLICATION_MOTION_KEYFRAME_EVERY_N_TICKS` ticks (default `60`). Lossy quantization remains deferred until typed per-entity `ShardRegion` metadata exists on the wire.

## 0.2 Implementation Progress Update — 2026-05-22

Gap 2.11 below ("No network simulation / chaos testing in CI") is now partially addressed by a default-off replication link-conditioner diagnostic hook. `SIDEREAL_REPLICATION_LINK_CONDITIONER_LOSS_RATIO`, `SIDEREAL_REPLICATION_LINK_CONDITIONER_LATENCY_MS`, `SIDEREAL_REPLICATION_LINK_CONDITIONER_JITTER_MS`, and `SIDEREAL_REPLICATION_LINK_CONDITIONER_DROP_PATTERN` can condition packets arriving at the replication server on Lightyear link entities, and the active configuration is recorded in health/observability and load summaries. Full outbound/asymmetric chaos coverage remains a future Lightyear-fork/API improvement.

## 0. TL;DR

The foundations are **above-average for a pre-production MMO codebase** — better than most Bevy/Lightyear projects of comparable maturity. The expensive things that are hard to retrofit (f64 world coords, single-writer motion ownership, three-stage visibility contract, sector lifecycle scaffolding, Lightyear fork integration with send-metrics observer, generic visibility components, channel QoS separation) are already correct.

The hard ceiling: **everything runs in one `sidereal-replication` process**. The Makefile references `cargo run -p sidereal-shard`, but `bins/sidereal-shard` does not exist in the workspace and there is no shard process, hand-off protocol, cross-shard visibility, or session router. At a single-process budget the realistic active-player ceiling is ~200–500 in one simulation, not thousands.

In addition to single-process limits, five concrete gaps need to close before "thousands of players" is real:

1. No bandwidth quantization or delta compression on the wire (replicating raw f64 motion).
2. No per-client backpressure response — soft budgets report but do not cap.
3. No load shedding / degraded mode (EVE-style time dilation, instance caps, queues).
4. No NPC simulation lifecycle (hot/warm/cold AI tiers) designed before content lands.
5. `reconcile_control_replication_roles` and `update_network_visibility` per-frame work that scales linearly with bound-client count and has not been profiled at 500-client tier.

The Lightyear fork is well integrated; nothing in this assessment requires upstream patches.

## 1. What Is Already Right (Keep)

These are genuinely industry-aligned and should not be churned.

### 1.1 Authoritative coordinate model
- f64 authoritative world coordinates throughout; f32 only at render/UI/shader/audio surfaces.
- Avian `Position`/`LinearVelocity`/`Rotation`/`AngularVelocity` are the only runtime motion authority. No legacy mirror components reintroduced.
- Galaxy-scale safe; most Unity/UE MMOs fight this for years.

### 1.2 Authority flow
- One-way: `client input → shard/replication sim → replication/distribution → persistence`.
- Session-bound input identity enforced (`AuthenticatedClientBindings`, `RealtimeInputCleanupState`).
- Client never authoritatively writes world transforms; predicted/confirmed/interpolated separation delegated to Lightyear.

### 1.3 Visibility contract
- Three-stage canonical order: `Authorization → Delivery → Payload`.
- Spatial-grid is optimization input, never authorization.
- Generic over entities (`VisibilityRangeM`, `VisibilityRangeBuffM`, `PublicVisibility`, `FactionId`/`FactionVisibility`, `DiscoveredStaticLandmarks`) rather than ship-only.
- Matches EVE's "grid"/"overview"/"local" separation and CCP's rule "spatial culling is never security".

### 1.4 Multi-lane replication
- `LocalBubbleLane` (high-rate nearby sim state), `TacticalLane` (lower-rate reduced contacts/fog), `OwnerAssetManifestLane` (owner-only manifest), independent from world replication.
- Owner manifest never depends on local-bubble entity presence.
- Tactical lane never upgrades authorization; it is a reduced delivery/product lane.

### 1.5 Sector lifecycle scaffolding
- States: `Hot`, `Warm`, `ColdPendingFlush`, `ColdPersisted`, `Hydrating`.
- Persistence flush, hydration preflight, runtime-removal preflight, hydration executor — all gated default-off behind env vars but the shape is right.
- This is the *form* of what real MMOs do for offline-region simulation.

### 1.6 Visibility optimization plumbing
- Cell-dirty visibility worklist (default-on) with reverse `entity → candidate clients` map and observer-candidate cache.
- Soft budgets for observer candidate entity/cell counts and apply-worklist size.
- Deferred membership gain queue with per-client budget and max-age release.
- Delivery-loss hysteresis (default-off, opt-in).
- Far better than naive per-tick per-client per-entity loop.

### 1.7 Replication group classes and priorities
- Controlled `10`, projectile `9`, dynamic `7`, player runtime `6`, generic `5`, static `3`.
- Per-class `set_send_frequency` hook exists in the fork and is wired through `SIDEREAL_REPLICATION_GROUP_*_SEND_HZ` env overrides (disabled by default for now).

### 1.8 Channel QoS separation
- `InputChannel` (sequenced-unreliable, latest-wins).
- `ControlChannel` (reliable).
- `AssetChannel` (reliable, isolated from input).
- `TacticalSnapshotChannel` / `TacticalDeltaChannel` / `ManifestChannel` / `NotificationChannel`.
- Asset payload delivery is gateway-HTTP-based, not over the replication transport.

### 1.9 Observability
- Replication send metrics observer in the Lightyear fork: per-channel queued/sent payload bytes, queue depth, `bandwidth_limited_messages_total`.
- Per-lane wall-time metrics with budgets and over-budget counters (`runtime_lanes.rs`).
- F3 overlay + Phase 0 capture diagnostics expose controlled-entity tick gaps, stage deltas, stage age, stall-frame samples.
- Most projects of this size fly blind here.

### 1.10 Synthetic load tooling
- `scripts/run_mmo_synthetic_load_tier.sh` supports tiers 1 / 10 / 50 / 100 / 250 / 500 / 1000.
- Phase 0 capture wrapper with deterministic input scripts.
- Replication observability samples have gate assertions (min sessions, min fixed ticks, zero writer drops).
- You can actually measure scaling decisions.

### 1.11 Server-side neutralization on stale input
- Full flight intent tuple (`ActionQueue`, `FlightComputer`, `AfterburnerState`, `PilotMotionIntent`, `RuntimeDesiredMotion`) cleared on stale/empty/mismatched/stale-generation realtime input.
- Disconnect cleanup persists controlled root + mounted tree before periodic flush.
- Prevents crashed clients from burning fuel indefinitely.

### 1.12 Lightyear fork hygiene
- Pinned at `0192db9c` with: input history 512 (vs upstream 20), interpolation convergence fix (`#1451`), UDP backpressure preservation, replication send-metrics observer, host-server change-tick freshness, Avian2D f64 compatibility, lossless Avian2D velocity deltas, forced motion keyframes, active send-frequency timers, selected upstream input/sync fixes (#1471/#1479/#1473/#1474), and lossless base-value fallback when an acknowledged delta base has aged out.
- Each fork patch documented in `docs/features/reference/lightyear_upstream_issue_snapshot_reference.md`.

## 2. Critical Structural Gaps For Thousands Of Players

Ranked by how much each limits the scale ceiling.

### 2.1 There is no second process

- Everything runs in one `sidereal-replication`. Bevy ECS is mostly single-threaded for system execution; Lightyear is one `Server` entity; Avian is one physics world.
- `Makefile` references `cargo run -p sidereal-shard` from the `run-shard` and `dev-stack` targets. `bins/sidereal-shard` does not exist. `find . -maxdepth 4 -type d -name sidereal-shard` returns nothing. These targets are dead.
- `ShardAssignment(i32)` component and `source_shard_id: i32` in persistence envelopes suggest a sector-based plan was scoped, but there is no shard process, hand-off protocol, cross-shard visibility, or session router.
- Realistic active-player ceiling for a single Bevy+Avian+Lightyear process in this shape: ~200–500 in one simulation under good conditions. Not thousands.

Industry reference points:

- **CCP / EVE Online**: one giant shard with **time dilation (TiDi)**. When load exceeds budget, simulation tick rate slows uniformly so all players experience the same slowed time. Brilliant for fairness, brutal to implement.
- **Dual Universe / SpatialOS-class**: **cell-based seamless sharding**. Each spatial cell is owned by one process, entities are handed off when they cross boundaries. Requires a distributed visibility/AOI layer.
- **WoW / most modern themepark MMOs**: **zone shards** (different processes, hard zone transitions, no cross-zone combat) plus instance shards for raids.

Sidereal has not picked one. This decision changes everything downstream and should not be deferred.

### 2.2 Per-frame Update work scales O(clients × entities)

- `update_network_visibility` runs at 10 Hz in `Update`; per-pass policy evaluation iterates `client_states × candidate_entities`. The `apply_non_candidate_policy_eval_skips` short-circuit helps only for small-extent entities. At 1000 clients × ~500 candidates each, that is ~500 k evaluations every 100 ms.
- `reconcile_control_replication_roles` runs **every frame** uncapped (`bins/sidereal-replication/src/main.rs:256`). It rebuilds `bound_client_by_player_wire` and `desired_owner_by_entity` from scratch each frame, then for each controlled ship calls `observer_interpolation_target(&bindings, owner)` which produces a `Vec<Entity>` sorted by bits and `format!("{target:?}")`-compared. At 1000 bound clients and ~1000 controlled ships, this is ~1 M ops/frame at 60 Hz.

Industry standard: **observer-side budgets per pass** (your `apply_worklist_soft_budget` only *reports*, does not *cap*) and **change-driven reconcile loops** that early-return when nothing changed.

### 2.3 No bandwidth quantization or delta compression

- Replication path sends raw `Position` (DVec2, 16 B) + `Rotation` (8 B) + `LinearVelocity` (16 B) + `AngularVelocity` (8 B) = 48 B per ship per snapshot before Lightyear envelope overhead.
- No Sidereal code references `DeltaCompression`, even though Lightyear supports it.

Industry standard for top-down 2D:

- **Quantize positions** to fixed-point at 1 mm or 1 cm precision in a local zone frame → 4 B per axis.
- **Quantize rotation** to 16-bit fraction of 2π → 2 B.
- **Quantize velocities** to 16-bit relative to max → 2 B per axis.
- **Delta-encode** against last-confirmed snapshot. Lightyear `DeltaCompression` supports this.

Realistic savings: 5–10× bandwidth reduction on motion. Required at thousands-of-players scale.

### 2.4 No per-entity-per-client send-rate control

- Controlled motion replicates every server fixed tick to every visible client.
- Class-level priorities exist (controlled 10, projectile 9, etc.) but within a class everything replicates at the same Hz.
- No distance/velocity/recency weighting.

Industry standard: per-client **priority queue** that drains within bandwidth budget, weighted by `(distance, velocity, recency, importance)`. You will hit a bandwidth wall around 50–100 visible entities per client at 60 Hz before you hit a CPU wall.

### 2.5 No load shedding or degraded mode

- When budget is exceeded today, `fixed_tick_over_budget_total` increments, replication queues grow, packets get dropped, behavior is undefined.
- There is no graceful degradation.

Industry standard: a degraded-mode contract.

- **EVE TiDi** clamps tick rate to a fraction of nominal under load and surfaces it to the UI.
- **Modern MMOs** add explicit instance caps, queue-to-enter, "this region is full" messaging.
- **Albion** adds dynamic instance creation when load thresholds are crossed.

Pick a contract. "We will slow simulation by X% under load" or "we will refuse new sector entries when Y" is a product decision, not a runtime accident.

### 2.6 No NPC / AI simulation lifecycle

- Sector lifecycle handles persistent entities, but NPCs (when they exist) are where MMO compute explodes — patrols, encounters, market makers, mining ships, station traffic.
- No AI tier model in code.

Industry standard: **tiered AI lifecycle** (`Hot` simulates full per-tick, `Warm` simulates reduced cadence, `Cold` simulates statistical/abstract). Design this before content lands, not after — it forces script/data structure decisions that are expensive to reverse.

### 2.7 Per-frame server-side iteration that scales with player count

Examples in the current code:

- `enforce_motion_ownership_for_world_entities` — iterates all root world entities per reconcile (client-side, throttled to 0.1 s, OK).
- `compute_controlled_entity_visibility_ranges` — iterates all controlled entities every `FixedPostUpdate`. At 1000 ships, ~60 000 iterations/sec.
- `update_client_observer_anchor_positions` — iterates all player entities every `FixedPostUpdate`.
- `reconcile_control_replication_roles` — per-frame, per-binding, per-ship.

Individually cheap, they stack. Capture wall-time per system at 250 and 500 tiers to find the linear ones.

### 2.8 Single Lightyear `Server` entity per process

- Lightyear `Server` is one entity per process. For horizontal scaling you need multiple processes behind a router.
- `GATEWAY_REPLICATION_CONTROL_UDP_BIND` and `replication_transport` configuration exist, but there is no `Server`-per-shard fan-out and no session-affinity routing.

### 2.9 Persistence backlog validation under load

- `persistence_hz = 2`. At 1000 active players that is a lot of graph writes coalesced into 500 ms windows.
- `persistence_lane` queues to a worker thread (good) and backlog visibility already exists: `persistence_pending_latest_records`, `persistence_pending_latest_age_s`, `persistence_coalesced_replacements`, and `persistence_coalesced_records` are exposed via replication health (`bins/sidereal-replication/src/replication/persistence.rs:293..308`, documented in `docs/features/active/server_observability_metrics_contract.md`). The MMO load wrapper already gates on p95 persistence pending age, and `shard_persistence_pending_age_slo_s` participates in shard `degraded` status.
- Remaining concern is validation, not instrumentation: confirm under sustained 1000-player load that worker throughput keeps pending age within SLO without unbounded growth in pending records, and that coalescing keeps the bounded queue effective when the worker is saturated. The bounded `SIDEREAL_PERSIST_QUEUE_CAPACITY` (default 4) plus `coalesced_records` should make growth flat-not-linear; verify with a tier capture.

### 2.10 Input ingest at scale

- Change-driven + 10 Hz heartbeat per client: at 1000 clients that is 10 000+ input messages/sec just for heartbeat traffic.
- Drain happens in `RealtimeInput` FixedUpdate lane.
- Not yet benchmarked at 1000-client tier.

If `apply_actions_to_action_queue` ever runs over budget here, batched ingest or per-shard input routing is required.

### 2.11 No network simulation / chaos testing in CI

- Lightyear has a link conditioner. Sidereal now has a default-off replication receive-path diagnostic hook, but CI coverage still needs the planned loss/jitter scenarios.
- Production rubber-banding and visibility complaints almost always come from packet loss + jitter scenarios that don't show up on localhost.
- Add link-conditioner-injected packet loss (e.g., 5 % loss + 50 ms jitter) to at least one two-client integration test.

### 2.12 Hierarchical replication cost is unverified

- Mounted children (hardpoints, modules) replicate per ship.
- Need to verify Lightyear only sends the relationship/hierarchy on spawn + change, not every tick.
- If per-tick: motion bandwidth multiplied by `(1 + module_count)`.

## 3. Industry Comparison Table

Target: PvP/PvE space MMO, EVE/Albion-scale, 1000–5000 concurrent in one universe.

| Concern | What real space MMOs do | Sidereal today |
| --- | --- | --- |
| Universe distribution | Sharded sectors, or one shard + TiDi | Single process, no TiDi |
| Hand-off | Seamless cell hand-off or zone gates | None |
| Authority | Per-entity server authority + client predict for owned | ✅ |
| Update rates | Per-entity-per-client priority queue, distance-weighted | Class-level priorities only |
| Bandwidth | Quantized fixed-point + delta compression | Raw f64, no delta |
| Interest mgmt | AOI grid + per-client budget + hysteresis | ✅ (with budgets, soft caps) |
| Tactical lane | Separate from full replication, lower rate | ✅ |
| NPC sim | Hot/warm/cold AI tiers | Not implemented |
| Persistence | Async, batched, journaled | ✅ async, batched; journaling shape unclear |
| Degraded modes | TiDi, instance caps, entry queue | None |
| Load testing | Synthetic at 10×–100× target | ✅ tooling exists, baselines patchy |
| Net chaos testing | Link conditioner in CI | Not in CI |
| Observability | Per-class, per-channel bytes/queue depth | ✅ (fork patch adds it) |
| Multi-region | Edge proxies + zone affinity | Not yet (likely not needed yet) |

Sidereal scores solidly on **engine plumbing**. It scores poorly on the **distribution and scaling story** because there is exactly one process doing everything.

## 4. Recommended Path Forward

In priority order.

### 4.A Phase A — decide architecture *(resolved by DR-0040, historical record)*

This phase was the open architectural question this report surfaced. **It is now resolved by DR-0040 (Distribution and Persistence Authority Model)**. The original A1/A2/A3 framing is preserved below as historical context for why the chosen model was selected. Do not act on the items in this subsection; act on `docs/plans/completed/distribution_scaling_and_single_shard_hardening_plan_2026-05-21.md` instead.

Original options as presented when this report was written:

- **A1 — Single-process + TiDi.** Rejected by DR-0040 §3.1.
- **A2 — Sector-sharded multi-process with hand-off.** Selected, with the additional commitment to centralized persistence authority (DR-0040 §2.2) and ghost-proxy cross-shard visibility from V1 (DR-0040 §2.4).
- **A3 — Zone-based hard shards.** Rejected by DR-0040 §3.2.

Required artifacts (all landed): `docs/decisions/dr-0040_distribution_and_persistence_authority_model.md`, `docs/plans/completed/distribution_scaling_and_single_shard_hardening_plan_2026-05-21.md`, entry in `docs/decision_register.md`.

### 4.B Phase B — close single-process scaling gaps (~4–8 weeks)

3. **Delete or implement** the broken `sidereal-shard` Makefile targets. They currently fool any developer running `make dev-stack`.
4. **Bandwidth fixes**: enable `DeltaCompression` for motion components (Lightyear supports it); add quantized position/rotation/velocity encoding for replicated motion. Target ≥3× wire reduction. Validate with `lightyear_replication_send_*.sent_payload_bytes_total` at 250 and 500 tiers.
5. **Per-client backpressure response**: per-client output-queue-depth metric and soft cap that drops low-priority updates when exceeded. Use `bandwidth_limited_messages_total` as the canonical trigger.
6. **Change-driven reconcile**: in `reconcile_control_replication_roles`, hash bindings and early-return when unchanged (`docs/reports/audits/multiplayer_prediction_visibility_audit_2026-05-21.md` §6.B.4).
7. **Stable observer-set replication target**: stop using `InterpolationTarget::manual(observer_clients)` that changes shape on every connect/disconnect (audit §3.2 / §6.B.5). Highest-leverage fix for the "lag spike when someone joins" symptom.
8. **Cap, not just report, observer-side budgets**: when `observer_candidate_entity_soft_budget` is exceeded, drop the lowest-priority candidates rather than continuing to evaluate them.
9. **Link conditioner CI test**: at least one two-client visibility integration test that injects 5 % packet loss + 50 ms jitter.

### 4.C Phase C — content prerequisites (~4 weeks)

10. **NPC simulation lifecycle**: design hot/warm/cold AI tiers before NPCs land. Otherwise the redesign happens mid-content.
11. **Persistence load validation at tier**: persistence backlog visibility already exists (`persistence_pending_latest_age_s`, `persistence_pending_latest_records`, `persistence_coalesced_*`, `shard_persistence_pending_age_slo_s`). What is missing is a sustained capture at 500/1000 tier confirming worker throughput keeps p95 pending age within SLO and coalescing keeps record growth flat under saturation. Add a baseline file from that capture so regressions are obvious.
12. **Load-tier baselines**: capture and store baseline outputs at 100/250/500 tiers so regressions show up against measurable numbers, not vibes.

### 4.D Phase D — distribution implementation (depends on 4.A, 2–6 months)

13. Implement the chosen distribution model.
    - If **A1 (TiDi)**: instrument the load source, add tick-rate clamping in the fixed-step driver, design the client UI for "simulation slowed".
    - If **A2 (sharded)**: build the hand-off protocol, the session router, the cross-shard visibility shim, the cross-shard tactical lane.
    - If **A3 (zones)**: build the gate UI, per-zone session lifecycle, cross-zone state mirror.

## 5. Concrete File / System References For Phase B

For implementer convenience.

- `bins/sidereal-replication/src/replication/control.rs:158` — `observer_interpolation_target`. Stabilize per §4.B.7.
- `bins/sidereal-replication/src/replication/control.rs:897` — `reconcile_control_replication_roles`. Change-driven gate per §4.B.6.
- `bins/sidereal-replication/src/replication/visibility/membership.rs:281..339` — observer candidate construction. Add cap per §4.B.8.
- `bins/sidereal-replication/src/replication/visibility/policy.rs:402..428` — range-checked delivery; check `client_context.delivery_range_m` clamp path before reducing motion cadence.
- `bins/sidereal-replication/src/replication/lifecycle.rs:533..573` — `ReplicationGroup::set_priority` + `set_send_frequency` wiring. Quantization should land in the message-level encoding, not here.
- `crates/sidereal-net/src/lightyear_protocol/*` — motion-component registration. Quantization/delta lands here, not in gameplay components (keeps Avian f64 path intact in-process).
- `bins/sidereal-replication/src/replication/network_metrics.rs` — add per-client output queue depth.
- `bins/sidereal-replication/src/replication/runtime_lanes.rs:32..52` — cadence defaults; consider `REPLICATION_VISIBILITY_AOI_HZ` = 20 for development once apply-time stays under budget.
- `Makefile` `run-shard` / `dev-stack` — delete or implement.

## 6. Risks Of Doing Nothing

If Phase B is deferred:

- 250-tier captures will likely still pass; 500-tier and 1000-tier will not.
- Bandwidth-driven player limits become invisible (clients see "lag" but the server `fixed_tick_wall_ms` is fine).
- Role-rearm churn on every join/leave keeps growing as more players connect, eventually visible as constant ship-pop on every login/logout.
- Persistence backlog is visible via existing metrics, but if worker throughput cannot keep up under 1000-tier load and SLO gates have not been baselined, an outage would be the first feedback signal.
- Without quantization, the bandwidth cost compounds with every replicated component you add — visibility/policy components, owner manifest entries, asset notifications.

If Phase A is deferred:

- Every Phase B optimization is bounded by single-process scale.
- The eventual distribution work has to be retrofitted across every system already written.
- Content (NPCs, market, fleet ops) is built against single-process assumptions that won't survive sharding.

## 7. Native And WASM Impact

- This is an assessment document. No code, no native impact, no WASM impact.
- Phase B recommendations are server-side only (replication-server bandwidth/cadence/role-rearm). Native client impact: less perceived flicker on join/leave, lower bandwidth, no protocol break required if delta compression is opt-in per component class. WASM impact: same gains, no browser-specific branch.
- Phase D distribution implementation will touch protocol surface (session router, possible cross-shard message types) and require coordinated client/server validation across both targets.
