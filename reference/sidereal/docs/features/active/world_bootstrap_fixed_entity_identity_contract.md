# World Bootstrap: Fixed Entity Identity

Status: Active
Lifecycle: source-of-truth
Category: feature
Last updated: 2026-06-04
Owners: feature owners
Scope: World Bootstrap: Fixed Entity Identity.
Source of truth: yes
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

rules, environment lighting, tactical-presentation defaults, asteroid-field
roots, and bundle children) get their persistent entity GUIDs during world
initialization.
Primary references:
- `docs/features/active/genesis_planet_registry_contract.md`
- `docs/decisions/dr-0027_*`, `docs/decisions/dr-0029_*`
- `docs/systems/core_systems_catalog_v1.md`
- `crates/engine-core/src/fixed_entity_guid.rs`

## 1. Problem

Static world content used to be spawned with hand-authored, sequential UUIDs in
the `0012ebad-0000-0000-0000-0000000000NN` range. Authors had to pick a unique
`NN` by hand across many Lua files (`world/world_init.lua`, every
`planets/*.lua`). This produced real incidents:

- A startup-blocking collision: two world-init graph records both claimed
  `...020`, so the persistence service rejected the world-init persist,
  replication retried 20× and then logged "replication simulation hydration
  skipped" — the world never loaded.
- A latent collision: planet GUIDs `...021`/`...022` matched the asteroid-field
  root IDs that `world_init` tests inject for the optional `asteroid_fields`
  hook.

The runtime GUID-collision validators
(`crates/engine-persistence/src/lib.rs`, `simulation_entities.rs`) only catch
this *at startup* — too late.

## 2. Rule: fixed entities derive their GUID, never hand-author it

Every fixed entity's GUID is derived deterministically from a **stable logical
id** via UUIDv5:

```text
entity_id = uuid_v5(SIDEREAL_FIXED_ENTITY_NAMESPACE, "<logical id>")
child     = uuid_v5(parent_guid,                     "<child key>")
```

Unique logical ids ⇒ unique, stable GUIDs. Two distinct logical ids can only
collide on a UUIDv5 hash collision; two identical logical ids are rejected
upstream as duplicate registry/world-init keys. This makes the historical
collision class **structurally impossible** rather than merely validated.

The helpers live in `engine-core` (`fixed_entity_guid.rs`) and are the single
source of truth:

- `derive_entity_guid(namespace, key) -> Uuid`
- `derive_child_entity_guid(parent_guid, child_key) -> Uuid`
- `planet_body_guid(planet_id) -> Uuid` (namespaced under `body:`)
- `SIDEREAL_FIXED_ENTITY_NAMESPACE` — a **frozen** root constant; changing it
  re-identifies every derived entity and requires a migration.

### Authoring contract

| Content | Where authored | How the GUID is derived | Author sets `entity_id`? |
|---|---|---|---|
| Planet / celestial body | `planets/*.lua` + `planets/registry.lua` | Rust loader: `planet_body_guid(planet_id)` | **No** — derived from the unique `planet_id` |
| Render layer | `world/world_init.lua` | `ctx.entity_guid("render_layer." .. layer_id)` | No |
| Render rule | `world/world_init.lua` | `ctx.entity_guid("render_rule." .. rule_id)` | No |
| Tactical presentation defaults | `world/world_init.lua` | `ctx.entity_guid("tactical_presentation_defaults")` | No |
| Environment lighting | `world/world_init.lua` | `ctx.entity_guid("environment_lighting.system")` | No |
| Asteroid-field root | `world/world_init.lua` | `ctx.entity_guid("asteroid_field.starter")` | No |
| Bundle child of a fixed entity | bundle Lua | `ctx.child_entity_guid(parent_guid, "<child key>")` | No |
| Procedural, per-spawn entity (asteroid members, NPCs) | bundle Lua | `ctx.new_uuid()` (random v4) | n/a — not a fixed entity |

**Two derivation sites, by design:**

- **Planets are derived Rust-side** in `inject_load_planet_definitions_fn`
  (`bins/sidereal-replication/.../lua_context.rs`). The loader always overwrites
  `spawn.entity_id` with `planet_body_guid(planet_id)`, so any `entity_id` in a
  planet `.lua` is ignored. The registry already guarantees unique `planet_id`,
  so a planet's identity is a pure function of its id with zero author input.
- **Other world-init fixed entities use the Lua helper** `ctx.entity_guid(key)`,
  keeping world authoring in `world_init.lua` where it lives, without
  hand-picked numbers.

`ctx.entity_guid` / `ctx.child_entity_guid` are injected by
`sidereal_scripting::inject_entity_guid_fns`, called from every script path —
replication world-init, gateway starter-world, and bundle spawn — so all paths
derive identical GUIDs (native / WASM / replication / persistence parity).

## 3. CI guards (fail in CI, not at startup)

- `engine-core::fixed_entity_guid` unit tests: determinism, child scoping, a
  realistic key set is collision-free, the namespace value is pinned, and the
  legacy remap table is collision-free + consistent.
- `crates/engine-script/tests/planet_registry.rs`: every planet's derived
  GUID is unique, reserved-safe (`...021`/`...022`), not in the legacy
  hand-authored range, and a valid UUIDv5.
- `bins/sidereal-replication/.../world_init.rs`
  (`world_init_fixed_entity_guids_are_unique_and_post_cutover`): loads the
  **entire** world-init graph and asserts global GUID uniqueness, that no legacy
  `0012ebad-...-NN` GUID remains, and disjointness from reserved test IDs.

## 4. Migration (full cutover)

Changing how GUIDs are derived changes entity identity, so already-persisted
worlds need migrating. Sidereal does a **full cutover** (not grandfathering):
fixed content adopts pure derived GUIDs and a one-shot migration rewrites
existing references old → new.

### What references a fixed-entity GUID in persisted data

- The entity node itself (`Entity.entity_id`) and its component nodes
  (`Component.component_id == "<guid>:<kind>"`).
- `Entity.parent_entity_id` (bundle children).
- `asteroid_field_member.field_entity_id` → the asteroid-field root.
- `discovered_static_landmarks.landmark_entity_ids` (**player-persisted**,
  `OwnerOnly`) → planet/star GUIDs.

### The migration

`sidereal_core::legacy_fixed_entity_guid_remaps()` is the source-of-truth
`(legacy GUID → derived GUID)` table for the 17 entities that shipped with
hand-authored GUIDs. It is unit-tested to be collision-free and order-independent
(no entity's new GUID equals any entity's old GUID).

`GraphPersistence::migrate_fixed_entity_guids()`
(`crates/engine-persistence/src/lib.rs`) applies it **in place** via Apache AGE
cypher: it renames each Entity node and its Component ids, and rewrites the
reference shapes above. In-place rename preserves `HAS_COMPONENT` edges and the
`script_world_init_state` marker, so world-init does **not** re-spawn duplicate
fixed content. The run is idempotent (a second run matches nothing).

**Operational runbook:**

1. Take a database snapshot.
2. Run `migrate_fixed_entity_guids()` against the snapshot in staging and verify:
   entity/landmark counts unchanged, no orphaned `0012ebad-...-NN` nodes, world
   loads, players' discovered landmarks still resolve.
3. Stop replication, run the migration against production, restart. World-init's
   marker stays set, so the renamed nodes are hydrated as-is.

> The reference set (`FIXED_ENTITY_SCALAR_REFERENCES` /
> `FIXED_ENTITY_ARRAY_REFERENCES` in `engine-persistence`) is derived from the
> current component schema. Any new component that persists a fixed-entity GUID
> must be added there (and here) before the next cutover.

New (never-persisted) fixed content needs **no** migration entry — it is born
with its derived GUID.

## 5. Adding new fixed content

1. Give it a stable logical id (planet: a unique `planet_id`; world entity: a
   stable `layer_id`/`rule_id`/key).
2. Do **not** write an `entity_id`. Planets: omit `spawn.entity_id`. World
   entities: `ctx.entity_guid("<key>")`. Children: `ctx.child_entity_guid(...)`.
3. The CI guards confirm global uniqueness automatically. No migration entry is
   needed unless the entity was previously persisted under a hand-authored GUID.
