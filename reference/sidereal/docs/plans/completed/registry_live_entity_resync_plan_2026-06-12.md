# Registry Live-Entity Resync Plan

Status: Implemented
Lifecycle: completed
Category: plan
Last updated: 2026-08-31
Owners: replication runtime + content
Scope: Resync registry-authored presentation components onto live persisted entity instances when Lua registry definitions are republished.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- `docs/decisions/dr-0049_dashboard_authoring_control_plane.md`
- `docs/systems/core_systems_catalog_v1.md`
- `bins/sidereal-replication/src/replication/scripting/persistence.rs`
- `crates/engine-runtime-sync/src/lib.rs`

## 1. Context and problem

DR-0049 establishes the authoring model: editors publish to the authoritative store (Lua
scripts / graph DB), and the fleet converges via script-catalog hot reload. That works for
*registries* (the in-memory `ShipModuleRegistry` etc. reload on catalog revision change) and for
*streamed assets* (shaders/textures re-fetch by content hash). The gap: **live persisted entity
instances spawned from a registry definition never refresh**. A ship's engine module copies its
`shader_parameter_set` (plume palette) from `engine_main_mk1.lua` at spawn time; editing the Lua
afterwards changes new spawns only. Concretely: the plasma-plume palette change could not reach
already-persisted ships. The planet registry already solves this for celestials (live refresh on
registry reload); this plan generalizes that to registry-backed instances, starting with ship
modules.

## 2. Design

### 2.1 Provenance: `RegistrySource` component

New persisted gameplay component (`crates/sidereal-game/src/components/registry_source.rs`):

```rust
#[sidereal_component(kind = "registry_source", persist = true, replicate = false, visibility = [OwnerOnly])]
pub struct RegistrySource {
    pub registry: String,      // "ship_module" (v1); "ship", "asteroid_field", ... later
    pub definition_id: String, // e.g. "module.engine.main_mk1"
}
```

Authored at spawn: `data/scripts/bundles/ship/body.lua` adds `registry_source` to each mounted
module (`registry = "ship_module"`, `definition_id = mount.module_id`) and to the ship root
(`registry = "ship"`, `definition_id = ship.ship_id`) for future ship-level resync.

### 2.2 Resync system (replication, catalog-revision triggered)

`bins/sidereal-replication/src/replication/scripting/registry_resync.rs`:

- Runs when `ScriptCatalogResource.revision` changes, ordered **after**
  `sync_ship_module_registry_resource_system` so the registry resource is current.
- For each live entity with `RegistrySource { registry: "ship_module", definition_id }`: look up
  the definition in `ShipModuleRegistry`; build `GraphComponentRecord`s from the definition's
  components filtered to the **presentation allowlist**; apply via the existing reflection path
  `engine_runtime_sync::insert_registered_components_from_graph_records`; mark the entity dirty in
  `PersistenceDirtyState` so the refresh persists.
- Presentation allowlist (v1): `shader_parameter_set`, `visual_asset_id`,
  `sprite_shader_asset_id`, `map_icon`. Gameplay/stat kinds (mass, health, scanner, engine
  performance) are intentionally excluded — refreshing them silently would change live gameplay
  state; extending the allowlist is a deliberate per-kind decision.

### 2.3 Backfill for pre-existing instances

Instances spawned before `registry_source` existed (including any world reset before this lands)
carry no provenance. A conservative one-shot backfill runs once per catalog revision: module
instances (`MountedOn` present, no `RegistrySource`) are matched against module definitions by
exact `EntityLabels` set + `DisplayName` equality; a match with exactly **one** definition infers
and persists `RegistrySource`. Ambiguous or unmatched instances are logged and left untouched.

### 2.4 End-to-end flow

Editor publish (dashboard script draft → publish, or direct Lua edit + reload) → script catalog
revision bump → registry resource reload → **resync applies allowlisted components to live
instances** → Lightyear replicates the changed components to connected clients (plume palette
updates live, no reconnect) → persistence dirty flush stores the refreshed values.

## 3. Extension path (documented, not in v1)

1. `ship` registry → ship root presentation (visual asset, sprite shader).
2. `asteroid_field` definitions → field root presentation profiles.
3. World-init per-instance values (backdrop render layers) — DR-0049's "per-instance value
   publishing" follow-up; flows through script publish, then this same resync pattern applies.
4. Allowlist growth (e.g. audio profile ids) as editor coverage grows.

## 4. Files

Create: `crates/sidereal-game/src/components/registry_source.rs`,
`bins/sidereal-replication/src/replication/scripting/registry_resync.rs`.
Modify: `crates/sidereal-game/src/components/mod.rs`, `data/scripts/bundles/ship/body.lua`,
`bins/sidereal-replication/src/replication/scripting/{mod.rs,catalog.rs}` (registration),
`docs/decisions/dr-0049_dashboard_authoring_control_plane.md` (follow-up note),
`docs/systems/core_systems_catalog_v1.md` (status note under
`system.scripting_content_authoring.v1`).

## 5. Verification

- Unit tests: resync applies an updated `shader_parameter_set` from the registry to a tagged
  instance and marks it persistence-dirty; non-allowlisted kinds are not applied; backfill infers
  provenance only on unambiguous label+name matches.
- Gates: fmt, clippy `-D warnings`, workspace check, docs-check (server-only change: no WASM
  impact beyond shared component registration, wasm check still run for the client build).
- Manual: edit `engine_main_mk1.lua` palette → publish/reload → live ship's plume recolors
  without respawn or reconnect; restart server → refreshed values persisted.

## Closure Note (2026-07-05)

Implemented. `bins/sidereal-replication/src/replication/scripting/registry_resync.rs` refreshes `RegistrySource`-tagged live instances when registry definitions republish, including backfill for pre-existing instances. Extending resync coverage (ship roots, asteroid-field profiles) is tracked as content-pipeline WS3 in the unified content authoring pipeline plan.

## Extension Note (2026-08-31)

The WS3 ladder now also refreshes ship-root visual asset/map icon values and asteroid-field
ambient profiles. Asteroid roots gain/backfill `RegistrySource` provenance from their stable
`field_profile_id`. Gameplay-changing asteroid fracture/resource profile refresh is
default-off and can be enabled only through the dedicated local
`full-stack-authoring-debug` profile (`SIDEREAL_REGISTRY_RESYNC_GAMEPLAY_STATS=true`).
Baseline-owned field radius, density, layout seed, and member placement are never rewritten
by registry resync. Native/WASM clients receive only normal replicated component updates;
the resync and policy remain server-side.
