# Entity Authoring System (Dashboard + On-Disk Storage)

Status: Proposed
Lifecycle: proposed
Category: feature
Last updated: 2026-06-17
Owners: content authoring + dashboard + gateway + replication runtime + engine architecture
Scope: A dashboard-driven system for creating and defining entities (name, tags/labels, components + starting values, shader + sprite, entity + component lifecycle Lua hooks, and per-instance override layering with `super`), with the authored definition stored on disk as the durable source of truth, written and served entirely through gateway API calls, surviving database wipes.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- docs/features/proposed/content_authoring_composition_proposal.md
- docs/plans/proposed/content_authoring_composition_plan_2026-06-17.md
- docs/decisions/dr-0051_gameplay_authoring_scripting_runtime.md
- docs/plans/active/unified_content_authoring_pipeline_plan_2026-06-12.md
- docs/decisions/dr-0025_runtime_script_catalog_authority.md
- docs/decisions/dr-0053_disk_authored_content_packages_durable_source_of_truth.md
- docs/decisions/dr-0046_lua_asset_registry_gateway_http_delivery.md
- docs/decisions/dr-0049_dashboard_authoring_control_plane.md
- docs/decisions/dr-0045_engine_content_separation_achieved.md
- docs/features/active/asset_delivery_contract.md

## 0. Status & relationship to existing work

Proposed direction, not current behavior. This document **concretizes** the storage and authoring surface for one slice of the broader composition vision:

- It is the implementation-level contract for **Pillar A (Content Package)** and **Pillar B (component-implied hooks)** of `content_authoring_composition_proposal.md`, scoped to a single entity.
- It maps to **WS2 (package format)** and **WS3 (the Composer)** of `content_authoring_composition_plan_2026-06-17.md`, and depends on **WS1 (component capability-hook metadata)** and **DR-0051 WS0** (the typed `script_api_schema.json`).
- It introduces **no new authority, distribution, or persistence substrate.** It reuses the gateway authoring control plane (DR-0049), the script catalog (DR-0025), and content-addressed asset delivery (DR-0046). It adds two narrowly-scoped gateway capabilities (§6.3).

This doc records a proposed storage-architecture direction (disk as the durable source of truth, §2–§3) and a concrete on-disk schema (§4). It stays Source of truth: no while proposed; the storage model becomes operative (and a contract should be promoted to `docs/features/active/`) when WS2 of the composition plan begins implementation.

### 0.1 This is the spec for WS2, not a UI-first feature — build it in layers

This proposal is the **concrete spec for composition-plan WS2**, not a standalone Composer feature. The durability backbone (disk source of truth) is the high-leverage part; the dashboard UI is the *last* layer, not the first. Build lowest-first; **do not build the Composer UI before the storage backbone exists and is proven**:

1. **Lock the architectural decision** — authored entity packages are the disk source of truth; the catalog DB is a derived cache/index.
2. **Build the storage backbone** — package/`entity.json` validation, scoped gateway disk-writes (§6.4), seed-from-disk, and the wipe-survival test.
3. **Prove it headless** — publish one proof package through the non-UI (CLI/API) path; confirm it survives `pg-reset`.
4. **Then build the Composer UI** (composition plan WS3) on top of the proven backbone.
5. **Only later** retire the existing god-file registries (composition plan WS4).

The upstream gate is unchanged: **DR-0051 WS0** (typed `script_api_schema.json`) and **WS1** (component capability-hook metadata) land *first*; this storage/validation layer builds on them, and the Composer builds on this. Do the schema + hook-metadata work before this; do this before any UI.

## 1. What a designer does

From the dashboard, with no direct disk access — every action is a gateway API call:

1. **Create an entity** and set its `display_name`, `tags`, and `labels`.
2. **Add components** from the component registry. Each added component renders its fields (from the existing `editor_schema`) and surfaces the **lifecycle hooks it exposes** (e.g. adding `health_pool` opens `on_damage`, `on_health_depleted`, `on_destroyed`).
3. **Attach a sprite and (optionally) a custom shader** — pick a `visual_asset_id`, a `map_icon_asset_id`, and a shader asset + parameter set.
4. **Write small Lua glue** at the available hooks — the universal entity lifecycle (`on_create`/`on_spawn`/`on_despawn`/`on_destroy`/`on_tick`) and the component-scoped hooks each added component opens (e.g. `destructible → on_destroyed`). No global script-tree navigation; the glue is scoped to `(scope, hook)`.
5. **Save a draft, then publish.** Publish validates the whole definition and writes it to disk as the durable record.

The authored entity is a reusable **blueprint/template**. Placement into the world (position, solar-system membership) and **per-instance overrides** (diverging component values/hooks for one placement, with `super` chaining — §3.6) are handled by world-map authoring (composition plan WS5); this doc defines the blueprint, its storage, and the override *schema/semantics*, not the placement UI.

## 2. The durability problem (why disk, not the database)

The motivating constraint: **the database is wiped frequently, so authored entities cannot live only in the database.**

Investigated current behavior (2026-06-17):

- **Publishes land in PostgreSQL only.** `publish_script_catalog_draft` (`crates/engine-persistence/src/lib.rs:1412`) writes the published source into `script_catalog_documents` / `script_catalog_versions`. There is **no write-back to disk**. Drafts are likewise SQL-only (`save_script_catalog_draft`, `bins/sidereal-gateway/src/auth/starter_world_scripts.rs:497`).
- **A reset destroys that database.** `siderealctl pg-reset` runs `docker compose down -v`, destroying the whole Postgres volume. The gateway script catalog shares that one Postgres instance with world/graph persistence (`dev.toml`: `pg_url` is reused for both `GATEWAY_DATABASE_URL` and `SIDEREAL_PERSISTENCE_DATABASE_URL`). **A wipe clears the catalog too.**
- **Disk is seed-only today.** On boot the gateway seeds the catalog from disk and observes disk edits on a ~5 s cadence (DR-0025), but **dashboard-published content has no disk copy** — so it does **not** re-seed after a wipe. It is lost.
- **Asset bytes already survive.** The asset payload endpoint writes uploaded bytes to disk under `./data/` with path sanitization (`bins/sidereal-gateway/src/api.rs:2336`, `tokio::fs::write` + `safe_asset_source_path`). Binary assets are already durable across a wipe.

Conclusion: the real fix is not a file format choice — it is to make **disk the durable source of truth for authored entities**, written by the gateway on publish, with the existing seed-from-disk repopulating the catalog after a wipe. This extends the *already-proven* asset-bytes pattern to entity definitions. The catalog DB becomes a derived cache; drafts may remain ephemeral in SQL. This inverts DR-0025's disk-is-seed/DB-is-durable model **for authored content packages specifically** and is promoted as a decision in **DR-0053** (DR-0025 continues to govern the standalone runtime *script* catalog).

## 3. On-disk storage model

**Decision: one directory per entity, plain-text authoring files, written by the gateway. No binary bundle.**

```
data/content/entities/<package_id>/
  manifest.json      # package descriptor: package_id, kind, schema_version,
                     #   primary_blueprint, file list, revision
  entity.json        # the blueprint definition: name, tags, labels,
                     #   components[kind -> payload], visual (sprite/shader refs)
  hooks.lua          # ONLY the glue: component-keyed hook functions
  shaders/*.wgsl     # custom shaders this blueprint introduces (optional)
  params/*.json      # shader parameter sets / presets (optional)
  assets.json        # asset rows this package contributes (id -> source path + sha)
```

The directory name is the `package_id` (never a runtime entity id — see §3.4). `manifest.json` describes the package; `entity.json` is the blueprint definition inside it.

### 3.1 Format chosen per file, matched to the data's nature

| File | Format | Why |
|---|---|---|
| `entity.json` (definition) | **JSON** | Pure data (name, tags, component payloads, asset/shader ids). The dashboard already speaks decoded JSON (the WS1 no-dashboard-Lua-parsing guard); the gateway validates JSON against the typed component registry trivially and writes it back cleanly. Writing Lua *back out* is hard to do well; JSON round-trips losslessly. |
| `hooks.lua` (behavior) | **Lua** | Code is code. Flows through the existing script catalog and compiles to the current `event_hooks` runtime path. |
| `shaders/*.wgsl` | **WGSL** | Existing shader convention; authored/previewed in Shader Workshop. |
| `params/*.json` | **JSON** | Shader parameter sets are data, consistent with the generic `ShaderParameterSet`. |
| Binary assets (sprite, sound) | **by reference** | Bytes live in the content-addressed asset store (already on disk, already wipe-durable, already delivered to clients by sha). `entity.json` names asset ids; bytes are **not** embedded in the entity folder. |

### 3.2 Why not a binary `.dat` bundle

Rejected. Authoring format and *delivery* format are separate concerns:

- A binary `.dat` destroys diff/merge/code-review and blocks AI/CLI authoring, which the pipeline explicitly targets (composition plan / unified pipeline WS2 agent authoring).
- The entire existing machinery — seed-from-disk, ~5 s hot-reload, draft/publish — operates on **readable files**. A packed bundle needs a packer/unpacker and fights all of it.
- Delivery is already solved: content-addressed asset delivery (DR-0046) ships bytes to the client by sha. The client never reads the authoring folder, so there is no "bundle for shipping" to build. A sealed/signed client artifact, if ever needed, is the asset catalog's job — not the authoring store's.

### 3.3 Why assets are referenced, not embedded

Embedding PNG/WAV bytes inside each entity folder would duplicate bytes across entities that share art, break the content-addressed cache (same bytes → one `asset_guid`/sha), and bloat diffs. Instead:

- The entity records asset **ids** (`visual_asset_id`, `map_icon_asset_id`, sound cue ids).
- New source bytes authored for the entity upload through the existing asset endpoint into the content-addressed store; `assets.json` records the id → source-path + sha mapping the publish step produced.
- This keeps the entity folder small, text-only, and mergeable while binary assets stay in the layer built for them.

### 3.4 Identity model: blueprint vs. placement vs. runtime instance

Three identifiers must stay sharply distinct. Conflating them is the main modeling risk for this system, because the same authored definition — a ship, asteroid, station, NPC, or loot object — must back **many** runtime instances over time.

| Term | Names | Lives in | Lifetime |
|---|---|---|---|
| `blueprint_id` (= `package_id`) | The reusable authored definition (this package). With one-blueprint-per-package the two coincide. | `data/content/entities/<package_id>/` (disk) | Authored; edited via publish |
| `placement_id` | An authored world-map placement of a blueprint at a position (composition plan WS5). | world-init / placement records | Authored world layout |
| runtime entity GUID (UUID) | A concrete persisted/replicated **instance** in the world. | graph persistence DB | Per spawned instance |

Rules:

- `entity.json` carries a **`blueprint_id`**, never a runtime GUID. A blueprint is a template — it has no position and no instance identity.
- A runtime entity GUID is minted when a blueprint is **instantiated** through the existing birth path: a **random UUID** for dynamic spawns; for a **static singleton** placement (a unique named station/planet meant to be stable across resets) the GUID is derived deterministically at *placement* time via the fixed-identity scheme (`world_bootstrap_fixed_entity_identity_contract`). Fixed-identity GUIDs therefore belong to **placements/instances, not to blueprints**.
- `placement_id` is owned by world-map authoring (composition plan WS5), not by this doc. A placement references a `blueprint_id` + a position (+ solar-system membership). This doc defines only the blueprint and its on-disk storage.

This separation is what lets one authored blueprint back many instances without entity authoring and world placement blurring together.

### 3.5 The package manifest (`manifest.json`)

Every package carries a thin descriptor distinct from the blueprint definition, so the aggregator/seed can identify a package without parsing its full content and so publish has a place to record integrity metadata:

```json
{
  "schema_version": 1,
  "package_id": "station.derelict",
  "kind": "entity",
  "primary_blueprint": "station.derelict",
  "files": ["entity.json", "hooks.lua", "params/weathered.json", "assets.json"],
  "revision": 7
}
```

- `package_id` equals the directory name (sanitized, §6.4). `kind` is `"entity"` in V1; `"system"`, `"nebula"`, etc. become sibling kinds later.
- `primary_blueprint` names the package's main `blueprint_id` (equals `package_id` under V1's one-blueprint-per-package rule).
- `files` is the authoritative file list the publish wrote; the seed/aggregator reads only listed files.
- `revision` is a monotonic counter bumped on each successful publish. The package **content hash** is computed by the gateway over the listed files at publish and recorded in the catalog index + audit log (not stored back into the manifest, to avoid a self-referential hash).
- Keeping the manifest separate from `entity.json` future-proofs multi-blueprint packages and lets the manifest stay stable while the blueprint definition evolves.

### 3.6 Instance / placement overrides (blueprint ⊕ override layering, with `super`)

One authored blueprint backs many instances; some instances must diverge (the "treasure-hunt cargo" case). Overrides are a **layering** model over the identity split (§3.4): a placement references a `blueprint_id` and carries an **override layer** that composes onto the blueprint defaults at instantiation.

**Specificity chain** (least → most specific):

```
engine / component default      (Rust; reached only by explicit named action — never by super)
  → blueprint hook               (entity.json + hooks.lua)
  → variant hook                 (optional, reusable; DR-0007 named variant)
  → placement / instance override hook
```

An override layer may contribute: **component-value overrides**, **added components**, and **hook overrides/additions**. A placement record (authored by world-map authoring, composition plan WS5 — this doc defines the *schema*, WS5 owns the authoring UI) looks like:

```json
{
  "placement_id": "treasure.hidden_cache.cargo",
  "blueprint_id": "cargo.container",
  "position": { "x": 184200.0, "y": -53100.0 },
  "overrides": {
    "components": {
      "quest_trigger": { "quest_id": "quest.hidden_cache", "radius_m": 800.0 }
    },
    "hooks": {
      "entity":       { "on_create":   "seed_relic" },
      "destructible": { "on_destroyed": "advance_on_open" }
    }
  }
}
```

#### Override semantics: an override *replaces* the parent unless it calls `super`

The core rule — chosen for reviewability — is that **an override hook fully replaces the parent hook unless it explicitly calls `super`.** Behavior is therefore visible in the override's own text; there is no hidden auto-chaining. `ctx:super(ev)` invokes the **next less-specific Lua handler** in the chain (placement → variant → blueprint); if there is no Lua parent, `super` no-ops and returns `false`.

The override hooks file for the placement above (matching the authored intent: keep default cargo, then add the quest payload):

```lua
return {
  entity = {
    on_create = function(ctx, ev)
      ctx:super(ev)                          -- run the blueprint's normal cargo fill first
      ctx:emit_intent("inventory.add_item", {  -- then request the relic via a typed intent (§5.1)
        entity = ctx.self,
        item_id = "item.quest.relic",
        quantity = 1,
        reason = "quest.hidden_cache",
      })
    end,
  },
  destructible = {
    on_destroyed = function(ctx, ev)
      ctx:super(ev)                          -- run the blueprint's normal drop-inventory behavior
      ctx:emit_intent("advance_quest_objective", {
        quest_id = "quest.hidden_cache",
        objective = "open_cache",
      })
    end,
  },
}
```

`super` rules (enforced at runtime, and statically at publish where detectable):

- **Explicit only** — never implicit. Not calling `super` means the parent does not run.
- **At most once** per hook invocation.
- **Immediate parent only** — `super` calls the next less-specific Lua handler, not every ancestor directly. The chain still cascades because that parent may call *its own* `super`.
- **Recursion/cycle detection** — the runtime detects and rejects cyclic or re-entrant `super` chains.
- **Order is documented per hook** — each hook states whether calling `super` before vs. after local behavior matters (e.g. `on_create` mutating inventory after the default fill).
- **Side-effect hooks are strict** — for hooks that cause world side-effects (e.g. `on_destroyed` spawning/dropping), a **duplicate `super` call is a hard error**, because it could double a drop/spawn.
- **Rust defaults are not `super`** — `super` walks only the **Lua** handler chain. The engine/component Rust default at the base is reached by an **explicit named intent/default-action**, never magically via `super`. This keeps the Lua chain and the Rust default decoupled (consistent with the DR-0051/pipeline authority line: defaults stay Rust, hooks are the explicit escalation).

#### Override validation (publish-time)

- Override component kinds + payloads validate exactly like blueprint components (§4.2): registered kind, typed round-trip.
- Override hooks validate against the **composed** component set (blueprint components ⊕ added components), so a hook on a placement-added `quest_trigger` is valid even though the base blueprint lacks it.
- Statically detectable `super` violations (e.g. two `super` calls in one side-effect hook body) are rejected at publish; the rest are runtime-guarded.

> **Capability caveat.** The `inventory.add_item` / `advance_quest_objective` intents and the `quest_trigger` component / `on_proximity` quest surface are **incremental extensions**, not V1 — they ride DR-0051's intent registry and the quest/trigger system is DR-0051 future work (plan WS6). Note the writes go through **typed intents, not ad-hoc accessors** (`ctx.inventory:add` is deliberately *not* the model — see §5.1). The *override + `super`* layering is the foundation defined here; the specific intents land as the registry grows.

## 4. `entity.json` schema (concrete)

Worked example — a derelict station that drops a loot container when destroyed:

```json
{
  "schema_version": 1,
  "blueprint_id": "station.derelict",
  "display_name": "Derelict Station",
  "tags": ["station", "salvage"],
  "labels": ["Entity", "Station"],
  "components": {
    "size_m":      { "length": 220.0, "width": 180.0, "height": 180.0 },
    "health_pool": { "current": 4000.0, "maximum": 4000.0 },
    "destructible": { "destruction_profile_id": "explosion_burst", "destroy_delay_s": 0.4 },
    "inventory":   { "entries": [] },
    "map_icon":    { "asset_id": "map_icon_station_svg" }
  },
  "visual": {
    "visual_asset_id": "station_derelict_sprite",
    "map_icon_asset_id": "map_icon_station_svg",
    "shader": {
      "shader_asset_id": "station_hull_wgsl",
      "parameter_set": "params/weathered.json"
    }
  },
  "hooks": {
    "entity":       { "on_spawn": "on_spawn_setup" },
    "destructible": { "on_destroyed": "drop_salvage" }
  }
}
```

`hooks.lua` holds only the named glue, keyed by **scope** — the universal `entity` lifecycle, or a component kind:

```lua
return {
  entity = {
    -- universal lifecycle: every entity exposes on_create/on_spawn/on_despawn/on_destroy/on_tick
    on_spawn_setup = function(ctx, ev) ctx:log("derelict spawned") end,
  },
  destructible = {
    -- component-scoped: valid only because `destructible` is present in components{}
    drop_salvage = function(ctx, ev)
      ctx:emit_intent("spawn_entity", {
        bundle_id = "container.goods",
        position = ev.position,
      })
    end,
  },
}
```

> **Capability caveat.** `spawn_entity`/`despawn_entity` are shown for illustration but are **gated on the unified pipeline's runtime-spawn work** (unified content authoring pipeline plan §3 gap "No runtime spawn from Lua" / the WS4 `container.goods` path). Until that lands and the intents are registered + validated, this example's body is not executable. The Composer must offer only hook actions whose intents are actually registered in `script_api_schema.json`, so it never implies a capability that is not yet safe. The hook **binding** mechanism (compiling to `event_hooks`) is independent of which intents exist and is available now.

### 4.1 Field rules

- `blueprint_id` — stable, unique, equals the package directory name. It identifies the **reusable definition**, not a runtime instance, and is **never** a runtime GUID. Instance/placement identity (including any fixed-identity GUID for static singletons) is minted at spawn/placement time, not here (§3.4).
- `components` — a map of `component_kind → payload`. One payload per kind (ECS allows one component of a kind per entity). Each kind must exist in the generated component registry; each payload must round-trip through the real typed deserializer (no silent drops — the failure mode the unified pipeline already hardened against).
- `visual.shader.parameter_set` — a relative path into the package's `params/`, or an asset id for a shared set.
- `hooks` — a map of **scope → { hook_name → handler_id }**, with two scope kinds:
  - **`entity`** — the **universal lifecycle** every entity has by default: `on_create`, `on_spawn`, `on_despawn`, `on_destroy`, `on_tick`. Always bindable; not gated on any component.
  - **`<component_kind>`** — **component-gated** hooks: the component's own lifecycle (`on_added`, `on_removed`) plus its domain events (e.g. `health_pool → on_damage`, `destructible → on_destroyed`). Bindable only when that component is present in `components{}`.
  Each `hook_name` must be one the scope *exposes* — the fixed entity-lifecycle set, or the component→hooks map from `script_api_schema.json` (WS1). Each `handler_id` must resolve to a function under that scope in `hooks.lua`. **Binding a component-scoped hook whose component is absent is a publish-time error, not a silent no-op.**
  - Entity-lifecycle events require the runtime to *emit* them. Today the bridge is combat-only; `data/scripts/bundles/entity_registry.lua` already has an unimplemented `on_spawned` placeholder to grow from. Emitting `on_create`/`on_spawn`/`on_despawn`/`on_destroy` (and component `on_added`/`on_removed`) is a DR-0051 event-bridge extension (§9 / plan WS6). A hook bound to a not-yet-emitted event is authored and validated but inert; the Composer marks such hooks as pending-runtime so the author is not misled.

### 4.2 Validation at publish (all blocking)

1. Every `component_kind` exists in the registry; every payload decodes through the typed deserializer.
2. Every referenced asset id (`visual_asset_id`, `map_icon_asset_id`, sound ids) resolves in the asset catalog.
3. Every shader asset id resolves; every `parameter_set` resolves and validates against the shader's parameter schema.
4. Every hook binding resolves: an `entity`-scope hook is one of the universal lifecycle names; a component-scope hook's component is present and exposes that hook. Every `handler_id` exists under its scope in `hooks.lua`. Override hooks (§3.6) additionally validate against the composed (blueprint + added) component set.
5. `hooks.lua` passes the server/CI `validate_script` path (DR-0051) — symbol-level correctness (unknown `ctx`/intent/event) caught server-side, never in the dashboard.

## 5. Lifecycle hooks (entity + component scopes)

Hooks attach at two scopes:

- **Entity lifecycle (universal).** Every entity exposes `on_create`, `on_spawn`, `on_despawn`, `on_destroy`, `on_tick` regardless of its components — the "all entities have default events" surface.
- **Component-implied (gated).** The bridge from "this entity has a component" to "these hooks are available" is the WS1 component capability-hook metadata: each component declares the hooks it exposes via `hooks = [...]` on `#[sidereal_component]` (content strings validated against the `#[script_event]` allowlist), generated into `script_api_schema.json`. The dashboard offers a component's hooks only when that component is present. A component exposes its own lifecycle (`on_added`, `on_removed`) plus its domain events (e.g. `health_pool → on_damage`, `destructible → on_destroyed`).

- The author writes only small glue at those points; default behavior stays in Rust (per the unified pipeline authority line — e.g. asteroid fracture is a Rust default, hooks are the *exceptional* override path).
- At publish, the scope-keyed `hooks.lua` compiles to the existing `ScriptState.data.event_hooks` map + handler functions — **no new runtime path**, just a scoped, validated, discoverable authoring surface over the machinery that already runs. (Entity-lifecycle and component `on_added`/`on_removed` events additionally require the runtime to *emit* them — a DR-0051 event-bridge extension, plan WS6.)
- Instances may **override** these hooks per placement, with explicit `super` chaining — see §3.6.

### 5.1 Writing from hooks: typed intents, not direct accessors

A hook **reads** selected component fields and **requests writes through typed intents** that Rust validates and applies in the authoritative phase — *not* through ad-hoc component accessors. Exposing helpers like `ctx.inventory:add(...)` / `ctx.health:set(...)` / `ctx.physics:set_mass(...)` unbacked would slowly turn Lua into an unreviewed write API over ECS state. V1 policy:

- **Read** selected component fields via DR-0051 `script_read` (default-deny, per-field).
- **Write** through typed intents (e.g. `inventory.add_item`, **not** `ctx.inventory:add`); Rust owns validation + authoritative application.
- **Direct `script_patch`** is reserved for **narrow, low-risk fields**, per-component/per-field allowlisted — the exception, not the rule.
- **Never script-mutable** (not even via patch): identity, ownership, auth/session, transform/motion authority, shard/visibility, and persistence-routing fields.
- **Intents-first** (not raw patches) for gameplay-significant state: **inventory, health, quest progress, spawning, destruction, physics impulses, loot**.

So the cargo override adds its relic via an intent, never a direct accessor:

```lua
ctx:emit_intent("inventory.add_item", {
  entity = ctx.self,
  item_id = "item.quest.relic",
  quantity = 1,
  reason = "quest.hidden_cache",
})
```

The deliberate scoping — *which mutation surfaces become intents, and which fields (if any) are safe for direct `script_patch`* — is the explicit decision tracked in plan WS6 and DR-0051's `script_read`/`script_patch` follow-up. Default posture: a mutation is an intent until proven safe to expose as a narrow patch.

## 6. Gateway API surface

The dashboard never touches disk; it calls the gateway. New endpoints mirror the existing registry-editor pattern (DR-0049):

### 6.1 Endpoints (illustrative)

| Method + path | Purpose |
|---|---|
| `GET /admin/dashboard/entities` | List authored entities (decoded JSON summaries). |
| `GET /admin/dashboard/entities/{package_id}` | Fetch one entity's decoded definition + its hooks source. |
| `POST /admin/dashboard/entities/{package_id}/draft` | Save a draft (validated; SQL-backed, ephemeral). |
| `POST /admin/dashboard/entities/{package_id}/publish` | Validate fully, then **write the package directory to disk** (manifest + files) and refresh the catalog. |
| `DELETE /admin/dashboard/entities/{package_id}/draft` | Discard a draft. |
| `POST /admin/dashboard/entities/{package_id}/validate` | Dry-run validation (the §4.2 checks) without persisting. |
| (reuse) `POST /admin/assets/by-id/{id}/payload` | Upload new sprite/sound/shader bytes into the content-addressed store. |

### 6.2 Draft vs. publish durability

- **Draft** → SQL only, ephemeral. Losing a draft on a wipe is acceptable.
- **Publish** → writes `manifest.json` + `entity.json` + `hooks.lua` (+ `params/`, `shaders/`, `assets.json`) to the package directory on disk, then updates the in-catalog representation the shards consume. Disk is the durable record.

### 6.3 Two new gateway capabilities (both modeled on existing code)

1. **Scoped disk-write for new files/directories** under `data/content/entities/`. The asset uploader already proves the shape — `tokio::fs::write` plus a `safe_*_path` sanitizer confined to a root, rejecting absolute paths / `..` / NUL. The new capability extends this to **create new** files and directories within the confined entity-content root. (Today the gateway only writes to *pre-registered* asset paths; this is the one genuinely new affordance.)
2. **Seed-from-disk for entity packages on boot**, mirroring the existing script-catalog seed (`load_script_catalog_from_database_or_seed`). Once entity definitions live on disk, they re-seed into the catalog automatically after `pg-reset` — exactly as scripts do, closing the durability gap.

### 6.4 Disk-write safety (this is a trusted authoring surface, not plumbing)

Gateway-mediated writes into `data/content/` are a privileged surface — they create files the runtime then trusts and executes. The following are **required before implementation**, not optional hardening, and each needs an explicit rule + test:

- **Path confinement** — every resolved path must remain inside the entity-content root *after canonicalization*; reject absolute paths, `..`, drive/UNC prefixes, and NUL (extends `safe_asset_source_path`). All writes confined to `data/content/entities/`.
- **Symlink rejection** — never follow or create symlinks within the root; canonicalize and verify the real path is still inside the root (defeats symlink-escape to e.g. `/etc` or the scripts tree).
- **ID/path sanitization** — `package_id` validated against a strict charset (lowercase, digits, `.` `-` `_`), bounded length, no path separators; the directory name derives from the validated id, never from free-form input.
- **Atomic writes** — write to a temp file and `rename` into place (atomic on the same filesystem); never leave a half-written `entity.json` observable by the ~5 s seed/hot-reload poller.
- **Transactional multi-file publish + rollback** — a publish writes several files (`entity.json`, `hooks.lua`, `params/`, `assets.json`); stage them and commit atomically (temp dir → directory rename, or write-all-then-swap) with rollback on any failure, so a **partial publish never becomes the live package**.
- **Concurrent edits / package locking** — serialize writes per `package_id` (per-package advisory lock/mutex) and use optimistic concurrency (revision/etag) on draft→publish so two authors cannot silently clobber one another; reject stale-base publishes with a conflict.
- **Delete / rename semantics** — define explicitly: delete removes the package dir and de-indexes it from the catalog but must account for live instances/placements referencing the `blueprint_id`; rename is delete+create of the id with a migration note. Both are **soft-delete first** (trash/retain) before hard delete, and both are reversible.
- **Audit logging** — every publish/delete/rename records *who* (scoped token / account, per DR-0049), *what* (`package_id` + revision + content hash), and *when*. The disk-write surface is credentialed exactly like the rest of the authoring control plane.
- **Seed/hot-reload race safety** — the atomic rename + per-package lock above are precisely what make disk-as-source-of-truth safe to poll; the poller must never observe an intermediate state.

These requirements are part of WS2's definition of done; the proof-of-life package (§9) must pass negative tests for path-escape, symlink-escape, and partial-publish rollback.

### 6.5 Publish failure semantics (disk is authoritative, catalog is downstream)

Publish is two steps — disk commit, then catalog refresh — and they can fail independently. Because **disk is the source of truth and the catalog DB is a derived cache** (DR-0053), the ordering and failure rules are:

1. **Disk commit is the commit point.** Once the atomic package write (§6.4) succeeds, the publish is *committed*: the new `revision` on disk is the authoritative content, regardless of what the catalog reflects.
2. **Catalog refresh is downstream and retryable.** If the disk commit succeeds but the catalog index/refresh fails, publish returns success-with-pending-index (surfacing the indexing error), and the gateway **retries** catalog refresh; the on-disk package is already correct and the next boot's seed-from-disk would index it anyway. The author's content is never lost.
3. **The cache is never treated as more authoritative than disk.** On any divergence between the catalog DB and the on-disk package, **disk wins** and the catalog is re-derived from disk — never the reverse. A stale or failed catalog entry is a re-index task, not a content loss.
4. **Disk commit failure = no-op.** If the atomic write/rename fails or rolls back (§6.4), nothing is committed; the previous published revision remains live and the author retries.

This makes publish safe under partial failure without a distributed transaction across two stores: the single durable commit is the disk rename; everything after it is best-effort, retryable derivation.

## 7. Lifecycle & wipe-survival

```
author (dashboard) ─► gateway validate ─► draft (SQL, ephemeral)
                                   │
                                   └─► publish ─► WRITE TO DISK (entity dir)  ─► update catalog ─► shard hydrates
                                                       │
                          pg-reset / wipe ────────────►│  catalog DB destroyed
                                                       ▼
                          next boot: SEED FROM DISK ─► catalog repopulated from entity dirs ─► entity survives ✔
```

After this lands: a wipe clears the derived catalog DB, and the next boot rebuilds it from the on-disk entity packages (and the on-disk asset bytes), so dashboard-authored entities survive resets the same way disk-seeded scripts do today.

## 8. Engine / content boundary (DR-0045)

- **Engine (mechanism):** the package manifest/`entity.json` schema, the JSON validator + typed-payload round-trip, the scoped disk-write capability, the seed-from-disk loader, the component capability-hook metadata support, and the entity authoring API shape. None of these name a space concept.
- **Content (`data/`):** the entity packages themselves (`station.derelict`, …), the hook strings, the shaders/params/assets, the space component schemas.
- Asset bytes continue to flow through the existing content-addressed asset pipeline. The deletion test stays green; the engine-boundary guard stays clean.

## 9. Relationship to the plan (what this sharpens)

This doc **sharpens composition plan WS2** with a requirement the plan currently understates: **publish must write authored definitions to disk**, not merely aggregate the catalog. That disk-as-source-of-truth write + seed is the load-bearing durability change; without it, dashboard-authored content does not survive a wipe. WS2's aggregator and validation, WS3's Composer surface, and WS1's capability metadata are otherwise as written.

Dependency order unchanged: DR-0051 WS0 (schema artifact) → WS1 (capability hooks) → WS2 (package format **+ publish-to-disk**, this doc) → WS3 (Composer UI). The override *schema* + placement records are WS5; emitting entity-lifecycle/component add-remove events and the `super`-chaining runtime (plus collision events, `script_patch`, runtime spawn, and the quest/trigger surface the examples use) are post-foundation extensions on DR-0051's event/intent registry — plan WS6.

## 10. Decisions (resolved 2026-06-17) and remaining questions

Resolved from review (2026-06-17) — V1 takes the lower-plumbing option in each case:

1. **Asset authoring path → reference-only first.** V1 references assets that already exist in the asset library / Shader Workshop; inline upload-through-Composer (auto-ingest into the content-addressed store) is a later enhancement. Keeps the privileged disk-write surface minimal.
2. **Definition format → `entity.json` declarative is first-class; `blueprint.lua` deferred.** Procedural entities (asteroid fields, generated planets) keep their existing Lua bundles for now; an optional `blueprint.lua` escape hatch is added later, not in V1.
3. **Package root → `data/content/entities/<package_id>/`.** Confirmed (future-proof content root so systems/nebulae become sibling kinds).
4. **Draft durability → SQL-only ephemeral drafts in V1.** Losing a draft on a wipe is acceptable; only **published** content carries the disk-source-of-truth durability guarantee.
5. **Granularity → one primary entity blueprint per package in V1.** Shared assets across packages are allowed; multi-blueprint packages deferred (carried from composition proposal §8.1).
6. **Hook scopes → entity lifecycle + component-gated.** Every entity has universal `on_create`/`on_spawn`/`on_despawn`/`on_destroy`/`on_tick`; components add their own lifecycle + domain events (§5). Emitting the lifecycle events is a DR-0051 event-bridge extension (WS6); the authoring/binding surface is foundational.
7. **Instance overrides → blueprint ⊕ override layering with explicit `super` (§3.6).** An override *replaces* its parent unless it calls `super`; `super` walks the Lua chain (placement → variant → blueprint), at most once, immediate-parent-only, cycle-detected; side-effect hooks reject duplicate `super`; Rust defaults are reached by explicit named action, never via `super`. The override schema is foundational; placement authoring is WS5.
8. **Hook write model → intents-first (§5.1).** Hooks read via `script_read` and write via typed intents (e.g. `inventory.add_item`), not ad-hoc accessors; direct `script_patch` is reserved for narrow, per-field-allowlisted low-risk fields; identity/ownership/auth/session/transform/motion-authority/shard/visibility/persistence-routing are never script-mutable; gameplay-significant state (inventory/health/quest/spawn/destruction/physics-impulse/loot) is intents-first. *Still to settle (WS6/DR-0051):* the explicit catalog of which surfaces are intents and which fields, if any, are `script_patch`-safe.

Remaining open:

- **`validate_script` integration timing** for hook symbol-checking — tracked with DR-0051 WS0; the Composer does schema/form linting, server/CI does symbol-level checks.
- **Delete/rename UX + live-instance handling** (§6.4) — needs a short follow-up once the world-placement model (composition plan WS5) is concrete, since deleting a `blueprint_id` must reckon with placements/instances that reference it.

## 11. Non-goals

- No binary `.dat` / packed authoring bundle (§3.2).
- No database-as-source-of-truth for authored entities; disk is authoritative, the catalog DB is a derived cache (DR-0053).
- No client-side scripting VM; hooks are server-authoritative (DR-0051).
- No new authority, distribution, or persistence substrate; reuse DR-0049/DR-0025/DR-0046.
- No runtime instance identity in the blueprint; `entity.json` is a template keyed by `blueprint_id`, never a runtime GUID (§3.4).
- Not the placement authoring UI; this defines the entity blueprint, its storage, and the override schema/`super` semantics (§3.6), but world-map placement records and their UI are composition plan WS5.
- No implicit hook chaining; an override replaces its parent unless it explicitly calls `super` (§3.6).

## 12. References

- `docs/features/proposed/content_authoring_composition_proposal.md` — the umbrella (Pillars A/B/C) this concretizes.
- `docs/plans/proposed/content_authoring_composition_plan_2026-06-17.md` — WS1/WS2/WS3 this maps to (and sharpens WS2).
- `docs/decisions/dr-0051_gameplay_authoring_scripting_runtime.md` — typed event/intent registry, component capability gating, hooks (the `script_api_schema.json` the hook surface reads).
- `docs/plans/active/unified_content_authoring_pipeline_plan_2026-06-12.md` — gateway catalog, draft/publish, dashboard-no-Lua-parsing guard, payload round-trip validation, authority line.
- `docs/decisions/dr-0025_runtime_script_catalog_authority.md` — disk-seed vs. catalog authority and hot-reload (the model DR-0053 inverts for content packages).
- `docs/decisions/dr-0053_disk_authored_content_packages_durable_source_of_truth.md` — the decision establishing disk-authored packages as durable source of truth, catalog DB as derived cache.
- `docs/decisions/dr-0046_lua_asset_registry_gateway_http_delivery.md` + `docs/features/active/asset_delivery_contract.md` — content-addressed asset bytes on disk (the durability + delivery pattern reused).
- `docs/decisions/dr-0049_dashboard_authoring_control_plane.md` — the gateway authoring control plane this extends.
- `docs/decisions/dr-0045_engine_content_separation_achieved.md` + `.claude/skills/sidereal-engine-boundary` — the boundary the storage machinery respects.
- `docs/features/active/world_bootstrap_fixed_entity_identity_contract.md` — fixed-identity GUIDs for static authored content.
- Code: `crates/engine-persistence/src/lib.rs` (publish → SQL today), `bins/sidereal-gateway/src/api.rs` (asset upload → disk, sanitization), `bins/sidereal-gateway/src/auth/starter_world_scripts.rs` (seed-from-disk), `crates/engine-component-macros/src/lib.rs` (component metadata), `crates/sidereal-game/src/generated/components.rs` (component registry + editor_schema).
