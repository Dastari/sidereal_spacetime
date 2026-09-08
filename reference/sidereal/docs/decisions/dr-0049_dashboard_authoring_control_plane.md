# DR-0049: Dashboard Authoring Control-Plane (Authoritative Store, Not a Live Shard)

Status: Active
Lifecycle: source-of-truth
Category: decision
Last updated: 2026-09-05
Owners: dashboard + gateway + replication runtime
Scope: DR-0049: Dashboard Authoring Control-Plane (Authoritative Store, Not a Live Shard).
Source of truth: yes
Supersedes: n/a
Superseded by: n/a
Primary references:
- docs/decisions/dr-0040_distribution_and_persistence_authority_model.md
- docs/decisions/dr-0046_lua_asset_registry_gateway_http_delivery.md

Date: 2026-06-08
Owners: dashboard + gateway + replication runtime

## Context

Replication runs as a fleet of servers sharded by `ShardRegion` (sector). Each server
owns a subset of regions (`SIDEREAL_REPLICATION_OWNED_REGIONS` / region bounds) and, on
load, filters its world to entities in its owned regions
(`filter_records_for_shard_runtime`, `bins/sidereal-replication/src/replication/simulation_entities.rs`).
Position-less config entities (e.g. backdrop render layers) fail the owned-region test
and are not guaranteed to live on any given shard.

The dashboard reaches replication BRP through the gateway, which proxies to **one**
configured `REPLICATION_BRP_URL` (`bins/sidereal-gateway/src/admin_dashboard.rs`) with no
shard-aware routing. The shader workshop briefly read in-game backdrop values from that
single live shard's snapshot (`/api/brp?snapshot=1`). That is correct only in
single-shard dev; under multi-shard it reads an arbitrary shard's RAM and can miss
config entities entirely.

Authored content already has the right model: assets are content-addressed and served by
the gateway (DR-0046); Genesis, Shipyard, and other structured editors publish validated
disk-backed JSON packages through gateway-owned endpoints, while the generic script editor
retains the DB-backed Lua draft→publish flow.
Only authoring *reads* of world state had drifted onto a single shard.

## Decision

1. **Authoritative store, not a live shard.** Dashboard authoring tools (shader
   workshop, genesis, script editor) READ world/content state from the gateway-fronted
   authoritative store — the global persisted graph DB (`/api/graph` →
   `/admin/dashboard/graph`) or gateway content/registry endpoints — and WRITE via
   gateway publish. They must not depend on a single replication shard's live BRP for
   world state.
2. **Per-shard live BRP is debug-only.** Reading a shard's live world (`snapshot=1`,
   `world.query`, `world.list_entities`, `world.get_entity`, `world.get_components`) is
   reserved for the explorer's inspection/debug scope.
3. **Global resources are exempt.** Reading global resources that are identical on every
   shard (e.g. `GeneratedComponentRegistry` via `world.get_resources`) from any one
   server is acceptable; decoupling them onto a gateway content endpoint is a desirable
   hardening but not required for correctness.
4. **Eventual fleet convergence.** Live edits publish to the authoritative store; every
   server converges through the matching package/script reload and registry live-resync
   lane. No instant fleet push is required.

## Alternatives Considered

1. Read from a single live shard's BRP snapshot: rejected (shard-partitioned, arbitrary
   server, drops position-less config entities under region filtering).
2. Aggregate BRP across all shards at the gateway: rejected (more coupling and infra than
   reading the global persisted graph, which is already the authoritative copy).
3. Parse authored Lua directly in the dashboard: rejected (the persisted graph DB is the
   resolved, structured per-instance registry without client-side Lua parsing).

## Consequences

### Positive

1. Authoring reads are shard-independent and correct under multi-shard.
2. One consistent model across the three editors: read authoritative store, write via
   publish, fleet reloads eventually.
3. A CI guard (`dashboard/scripts/check-authoring-reads.mjs`) prevents regressions.

### Negative

1. Authoring reads reflect persisted/authored state, not a shard's live RAM (the correct
   trade-off for an authoring tool, but it means uncommitted live entity pokes are not
   surfaced in the editors).
2. Future per-instance value editing must go through the authored/publish path rather
   than live entity mutation.

## Status of follow-up work

- Done: parity read repointed to the global graph DB; dedicated gateway render-layer
  endpoint (`/admin/dashboard/render-layers`) + `/api/render-layers` proxy so the
  workshop reads only the backdrop subset; shader workshop has explicit Publish
  (authoritative content store → fleet hot-reload) and Discard actions on-model with the
  chosen publish+auto-reload semantics; CI guard added.
- Deferred (acceptable as-is): moving the `GeneratedComponentRegistry` shader-schema
  read off shard BRP onto a gateway content endpoint. The registry is a global resource
  identical on every shard, so reading it from any one server is correct; the decoupling
  is a cross-crate refactor with marginal value and is not required.
- Done (2026-08-31): **per-instance render-layer value publishing** — the shipped global
  fullscreen backdrop layers live in `maw`'s `default_background`, and each
  `BaselineLayer` may carry a typed generic `shader_parameter_set`. Seeded graph entities
  retain `universe_baseline_id` provenance. Shader Workshop uses that provenance to patch
  the owning baseline layer through `/api/render-layers`, and the server republishes the
  complete baseline with its loaded `base_revision`. It never mutates a shard entity or
  generates Lua. A concurrent baseline edit returns the normal 409 conflict. Restarting
  replication applies the bumped baseline revision through the existing Ui reseed lane.
  Zone-layer parameter sets ride the replicated `ZoneLayers` payload and are attached to
  the client-derived composited layer on both native and WASM.
- Done (2026-06-12): **registry → live-instance presentation resync** — republishing a
  registry definition (v1: ship modules) now refreshes registry-authored presentation
  components on live persisted instances via the `RegistrySource` provenance component,
  then persists the refreshed values. Closes the gap where definition edits only reached
  newly spawned entities. See `docs/plans/completed/registry_live_entity_resync_plan_2026-06-12.md`.
- Done (2026-08-31): the resync ladder covers ship-root presentation and asteroid-field
  ambient/profile values. Gameplay-changing asteroid fracture/resource refresh is
  default-off and available only in the explicit local authoring profile; baseline-owned
  field layout/radius/seed are never mutated by registry publication.
- Done (2026-08-31): **structured package lifecycle truthfulness** — Genesis and Shipyard
  use a single Save / Publish Package action. Their JSON registry-definition write is the
  validated atomic commit; the dashboard no longer probes deleted Lua catalog paths or
  advertises a fictitious later publish/discard step.
- Done (2026-08-31): **baseline placement component overrides** — Firmament edits
  `BaselinePlacement.component_overrides` through the generated component schema and
  publishes them with the universe baseline. This is the canonical per-instance authored
  value lane for baseline placements. Runtime/evolved values remain shard-owned and are
  not mutated directly from the dashboard.

## References

- `dashboard/src/lib/backdrop-render-layers.ts`
- `dashboard/scripts/check-authoring-reads.mjs`
- `bins/sidereal-replication/src/replication/simulation_entities.rs`
- `bins/sidereal-gateway/src/admin_dashboard.rs`

2026-09-05 update: authored source reads remain gateway-fronted. New live mutations
use UUID-addressed owner-shard operations with expected-value checks and distinct
application/persistence receipts; they never patch a live graph from the dashboard.
Baseline save, reviewed live application and capture-to-draft are separate operations.
See [the runtime contract](../features/active/dashboard_game_authoring_runtime_contract.md).
