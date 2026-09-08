# Content Authoring Composition (Packages, Component Hooks, World Placement)

Status: Proposed
Lifecycle: proposed
Category: feature
Last updated: 2026-06-17
Owners: content authoring + scripting + dashboard + engine architecture
Scope: A designer-facing content authoring model that replaces flat per-type registries with self-contained content packages, drives Lua behavior from component-implied lifecycle hooks, and adds composition + world-map placement as the primary dashboard surfaces.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- docs/plans/proposed/content_authoring_composition_plan_2026-06-17.md
- docs/features/proposed/entity_authoring_system_proposal.md
- docs/plans/active/unified_content_authoring_pipeline_plan_2026-06-12.md
- docs/decisions/dr-0051_gameplay_authoring_scripting_runtime.md
- docs/decisions/dr-0053_disk_authored_content_packages_durable_source_of_truth.md
- docs/features/proposed/galaxy_world_structure_proposal.md
- docs/decisions/dr-0045_engine_content_separation_achieved.md
- docs/decisions/dr-0049 (unified content authoring control plane — register)
- docs/features/active/shipyard_ship_authoring_contract.md
- docs/features/active/genesis_planet_registry_contract.md
- docs/features/active/shader_editor_dashboard_contract.md

## 0. Status

Proposed direction, not current behavior. This document is the **authoring-experience umbrella** that sits above three already-active or already-proposed efforts and explains how they should converge for a content designer working in the dashboard:

- the **runtime substrate** (DR-0051 gameplay scripting runtime — typed event/intent registry, component-gated `script_read`/`script_patch`, lifecycle hooks),
- the **world model** (galaxy world structure proposal — solar systems as entities, per-system nebula visuals, `world_init.lua` placement),
- the **delivery/control plane** (unified content authoring pipeline — gateway-mediated catalog, dashboard editors decoupled from Lua, content-addressed assets).

It introduces no new authority model and no new storage substrate. It is an organization, metadata, and dashboard-surface proposal layered on top of those.

## 1. Problem

`bundle_registry.lua` and its sibling registries (`ships/registry.lua`, `planets/registry.lua`, `asteroids/registry.lua`, `assets/registry.lua`, `audio/registry.lua`) are **flat, per-type god-files**. Each new piece of content is spread across several of them: a ship is a row in `ships/registry.lua`, a graph-builder in `bundles/ship/body.lua`, a required-component list in `bundle_registry.lua`, asset rows in `assets/registry.lua`, audio rows in `audio/registry.lua`, and (when behavior is needed) a hand-wired `event_hooks` JSON blob in the entity's `ScriptState`. There is no single place that *is* "this piece of content."

Concrete consequences visible in the codebase today:

- **No content unit.** Authoring one entity touches 4–6 unrelated files. Deleting or versioning a piece of content means hunting its fragments across registries.
- **Behavior is wired by opaque convention.** A script reacts to combat events only if the entity carries a `ScriptState.data.event_hooks` map that names a global handler (`runtime_scripting.rs` `parse_event_handler_config`). Nothing connects "this entity has a `health_pool`" to "these damage/destroy hooks are available." The designer must already know the magic string `health_depleted` and hand-author the wiring.
- **The editors are per-type silos.** Shipyard, Genesis, Shader Workshop, Sound Studio, and the Script Editor are five separate dashboards, each re-implementing library / inspector / draft-publish for its own registry. A "station with custom loot and a backdrop" has no home — it is none of ships, planets, or asteroids.
- **The world map is read-only.** `/game-world` plots live entities and supports inspect/select, but a designer cannot place content. Spawn positions are typed as numbers into Shipyard/Genesis forms.
- **Registries grow without bound.** The pattern that works at 3 ships does not work at 300; the flat tables become merge-conflict magnets and lose any locality of reasoning.

The instinct in the request — "bundle an entity with its shaders, code, and sound; let a `health` component imply `onDamage`/`onDestroy`; link small scripts to entities and events rather than maintaining one giant script editor" — is the right direction and is well-supported by what other data-driven games converged on.

## 2. What other script-driven games teach us

### 2.1 Patterns worth adopting

| Engine / game | Pattern | What we take |
|---|---|---|
| **Factorio** | Two-stage **data vs. control** split; mods are self-contained folders (`info.json`, `data.lua`, `control.lua`, `graphics/`, `sounds/`, `locale/`). Prototypes are pure data; `control.lua` is event-driven (`script.on_event`). | Separate the **definition (data)** from the **behavior (control)**, but **co-locate them in one package folder** with their assets and locale. |
| **Godot** | **Scene = composable bundle** of nodes + scripts + resources, with instancing/inheritance. Behavior is wired by **signals**: a node emits a signal, you *connect* it to a method. | The **signal/connect** model is exactly "link small scripts to events." Behavior attaches at well-known emit points, not as free-floating globals. |
| **Unity / Unreal** | **Prefab / Blueprint = bundle** of an object + its components + asset references. **Components expose events** (`OnTakeAnyDamage`, `OnComponentBeginOverlap`). Data lives in ScriptableObjects / Data Tables. | **Component presence implies available behavior hooks.** Tuning data is an authored asset, not code. |
| **Minecraft Bedrock behavior packs** | The closest match to the request: an entity is **declarative JSON** — a set of `components` (`minecraft:health`, `minecraft:damage_sensor`) plus `events`. Component presence *is* the behavior surface. Packs bundle entity JSON + textures + models + sounds. | A **declarative, component-keyed entity definition** where adding a component unlocks its events/triggers; the pack bundles everything. |

The convergent lesson: **content is a composition of components; a component is what grants an entity both its data fields and its behavior surface; and a piece of content is a self-contained, version-controllable package** of definition + glue code + assets.

### 2.2 Anti-patterns to avoid (the "what not to do")

1. **One unbounded global registry table.** Factorio's `data.raw` and our `*_registry.lua` are the same failure mode at scale — every mod/author contends on one file. *Fix:* namespaced packages; the global registry becomes a **generated index**, never hand-edited.
2. **Binary / opaque content formats.** Unity `.prefab`/`.scene` and Unreal Blueprint assets are notorious for unmergeable diffs, `.meta`/GUID fragility, and logic you cannot `grep` or code-review. *Fix:* keep content as **readable text + content-addressed binaries** (we already do this — preserve it as a hard rule). This also keeps content **AI- and CLI-authorable**, which our pipeline already targets (WS2 agent credentials).
3. **Free-floating global hooks.** Garry's Mod `hook.Add` / a single global event bus produces load-order spaghetti and no isolation. *Fix:* hooks are **bound to a specific entity + component + event**, discoverable from the entity, budgeted and error-isolated (DR-0051 already requires per-handler budgets + isolation).
4. **Logic buried in graphs you can't review.** Blueprint visual scripting trades diffability for approachability. *Fix:* glue code stays **small, textual Lua** attached at named hook points — the dashboard is a *view* over text, not a replacement for it.
5. **Implicit inspector-wired references that break silently.** Unity's drag-a-reference-into-a-slot breaks on rename with no compile error. *Fix:* every link (asset id, hook handler, component override) is **validated at publish** against the typed schema (we already round-trip component payloads through the real deserializer; extend that to links).
6. **Deep inheritance chains.** Factorio prototype copy-inheritance becomes untraceable. *Fix:* favor **composition + shallow variants/overlays** over inheritance (consistent with the DR-0007 variant framework).

## 3. The proposal in three pillars

### Pillar A — The Content Package (reframe "bundle")

Today a "bundle" is an *entity-template factory script* plus scattered registry rows. Reframe the unit of authoring as a **Content Package**: a directory that co-locates everything one coherent piece of content needs, fronted by a `manifest.json`. The package is **text on disk and the durable source of truth** (DR-0053); the catalog DB is a derived cache. The concrete entity storage model — manifest, `entity.json` schema, identity split, disk-write safety, publish failure semantics — is specified in `entity_authoring_system_proposal.md`; the layout below is the umbrella view.

```
data/content/<namespace>/<package_id>/
  manifest.json        -- package descriptor: package_id, kind, schema_version, primary_blueprint, files, revision
  entity.json          -- blueprint definition (declarative): name, tags, labels, components[kind->payload], visual refs
  hooks.lua            -- behavior glue: functions bound to component hook points (code stays Lua)
  shaders/*.wgsl       -- shaders this package introduces (optional)
  params/*.json        -- shader parameter sets / variants (optional)
  assets.json          -- asset rows this package references (id -> source + sha; bytes stay content-addressed)
  locale/*.json        -- display strings (optional)
```

The declarative `entity.json` is the first-class V1 path. A procedural escape hatch (`blueprint.lua`, for generated content like asteroid fields) is a deferred addition, not V1 (entity authoring proposal §10). The blueprint carries **no `world_position`/placement** — placement is a separate concern (Pillar C.2 / WS5), keyed off the identity split (`blueprint_id` vs. `placement_id` vs. runtime GUID; entity authoring proposal §3.4).

Key properties:

- **The flat registries become generated indexes.** `bundle_registry.lua`, `ships/registry.lua`, `assets/registry.lua`, etc. are *aggregated* from package manifests at catalog-build time rather than hand-edited. Authors never touch a god-file; they add/edit a package. (This is the Factorio mod-folder insight applied without changing our gateway-mediated catalog: the gateway still decodes packages into the same catalog artifacts the shard polls — see `unified_content_authoring_pipeline_plan`.)
- **A package is the version/diff/delete unit.** It maps cleanly onto draft → validate → publish (DR-0049) and onto content-addressed asset versioning (asset delivery contract). Deleting content is deleting a directory.
- **Engine vs. content boundary is respected (DR-0045).** The *package format, manifest schema, aggregation, and validation* are an **engine** mechanism (`engine-content`/`engine-ecs`). The *packages themselves* (`ship.corvette`, `planet.helion`, `nebula.maw`) are **content** under `data/`. Space vocabulary never enters the engine.
- **Disk is the durable source of truth (DR-0053).** Authored packages live on disk and survive database wipes via seed-from-disk; the catalog DB is a derived cache. This closes the gap where dashboard-published content (PostgreSQL-only today) is lost on `pg-reset`.
- **Backwards compatible.** Declarative entities re-home to `entity.json`; existing procedural bundle scripts (`bundles/ship/body.lua`) map to the deferred `blueprint.lua` escape hatch. Migration is mechanical re-homing, not a rewrite (§7).

### Pillar B — Component-implied capability hooks

This is the heart of the request and the natural extension of DR-0051. The model: **a component declares the lifecycle hooks it exposes; possessing the component is what unlocks those hooks for an entity; the designer attaches small Lua functions to those hook points instead of memorizing event strings.**

What already exists and supports this:

- The combat→script bridge already emits `shot_fired`, `shot_impact`, `damage_applied`, `health_depleted`, `before_destroy`, `destroyed` (`combat.rs` → `ScriptEventQueue`).
- DR-0051 commits to a **typed event/intent registry** (`#[script_event]`/`#[script_intent]`, generated `script_api_schema.json`) and to **per-component `script_read`/`script_patch` metadata** on `#[sidereal_component]`.
- The `GeneratedComponentRegistry` already enumerates every component with an `editor_schema` describing its fields — this already powers the auto-generated forms in Shipyard/Genesis.

What is net-new (the bridge from "component present" → "these hooks available"):

1. **Capability metadata on components.** Extend the component registration so a component kind can declare the hooks it surfaces. **Decided (2026-06-17):** hook names are declared directly on the engine `#[sidereal_component]` macro via `hooks = [...]`, where the names are content-registered strings validated against the `#[script_event]` allowlist (matching DR-0051's string-keyed-registry rule). The *macro mechanism* stays engine-pure (it only knows "a component may list hook strings"); the *strings themselves* (`on_damage`, `on_destroyed`) are space content, so the DR-0045 boundary holds with a single declaration site per component. Example:

   ```rust
   // engine: the macro understands `hooks = [...]`; the names are content strings
   #[sidereal_component(
       kind = "health_pool",
       persist = true, replicate = true, visibility = [OwnerOnly],
       hooks = ["on_damage", "on_health_depleted", "on_destroyed"],
   )]
   pub struct HealthPool { pub current: f32, pub maximum: f32 }
   ```

   Each hook entry maps to a registered `#[script_event]` (its payload schema). Generation emits the component→hooks map into `script_api_schema.json` so the dashboard and CI know, without parsing Lua, which hooks an entity can use given its component set.

2. **Hook binding lives in the package, keyed by component.** Instead of a hand-authored `ScriptState.data.event_hooks` JSON map, `hooks.lua` reads as:

   ```lua
   return {
     -- only valid because this blueprint has a `health_pool` component
     health_pool = {
       on_damage = function(ctx, ev) ... end,
       on_destroyed = function(ctx, ev)
         ctx:emit_intent("spawn_entity", { bundle_id = "container.goods", position = ev.position })
       end,
     },
   }
   ```

   This compiles down to the **existing** `event_hooks` + handler-function machinery at publish time — no new runtime path, just an authoring surface that is component-scoped, validated, and discoverable. An attempt to bind `on_damage` on a blueprint with no `health_pool` is a **publish-time error**, not a silent no-op.

3. **Default behavior stays in Rust; hooks are the escalation path.** Per DR-0051, "asteroid shatters on death" remains a data-driven Rust path; hooks are for *exceptional* behavior. The composer must make this distinction visible (a hook point shows its default, and "add a script" is an override, not a requirement).

4. **Two hook scopes + per-instance overrides.** Hooks attach at a **universal entity lifecycle** (`on_create`/`on_spawn`/`on_despawn`/`on_destroy`/`on_tick`, on every entity) and at **component** scope (gated by component presence). A specific placement can **override** a blueprint's hooks/values, with explicit `super` chaining (an override replaces its parent unless it calls `super`). The concrete schema, `super` semantics, and lifecycle/override sequencing live in `entity_authoring_system_proposal.md` (§3.6, §5) and plan WS5/WS6.

The result is precisely the Godot/Bedrock model: the entity's components define *what can react*; the designer writes a few lines of glue at those points; instances override where they must, calling `super` to extend rather than replace; and there is no giant free-floating script registry to maintain.

### Pillar C — Composition and world placement as the primary dashboard surfaces

Two new dashboard surfaces; the five existing editors become **specialized presets/skins** over the first one rather than parallel silos. Their concrete routes, layout, and shared-component architecture are specified in `authoring_dashboard_frontend_proposal.md`: **`/foundry`** (the Composer below) and **`/firmament`** (the world map below).

**C.1 The Composer — `/foundry`** (generalizes Shipyard/Genesis):

1. Create entity → start blank or from an archetype preset (ship / planet / station / container / solar-system).
2. **Add components** from the `GeneratedComponentRegistry`. Each added component renders its fields from `editor_schema` (already built) and, in a **Hooks** panel, surfaces the hook points it exposes (from Pillar B's capability metadata).
3. **Attach glue** at a hook point: a small Lua editor scoped to that `(component, hook)` with autocomplete/lint from `script_api_schema.json` (DR-0051 WS0). No global script-tree navigation required for the common case.
4. **Assets** (visual, map icon, audio cues) are picked from the asset library and recorded in the package's `assets.json`; shaders/params author through the existing Shader Workshop, now reachable inline.
5. Save → the package's `entity.json` + `hooks.lua` are (re)generated server-side; draft/publish through the existing gateway path. (Procedural entities use the deferred `blueprint.lua` escape hatch instead of `entity.json`.)

Shipyard's hardpoint overlay and Genesis's procedural preview are **component-specific editor extensions** that the composer mounts when the relevant component is present (hardpoints → ship editor view; planet shader params → genesis preview). They stop being separate apps.

**C.2 The World / System Map — `/firmament`** (reuses the `/game-world` canvas):

`/firmament` **reuses the `/game-world` pan/zoom canvas component** (which already plots entities at f64 world coordinates with sector/cell HUD) in an **authoring mode** — it does not make `/game-world` itself writable; `/game-world` stays the live/evolved inspection surface (DR-0054):

- **Place** a published blueprint by drag-drop (or right-click → "Add entity"); the drop point sets `world_position`; this emits a fixed-identity placement record into the authored baseline (the same graph-record path `world_init.lua` uses, gated by fixed-entity-identity GUID derivation).
- **Solar systems as regions** (per the galaxy world proposal): draw a system center + `SolarSystemRadius`; assign **nebula/backdrop visuals** by selecting/authoring a `SolarSystemVisuals` parameter set (Shader Workshop preview inline); drop the star(s), planets, stations, and asteroid belts as children referencing the system via `SolarSystemId`.
- **Edit-in-place** of *live* instances stays in `/game-world` (BRP / graph POST); `/firmament` authors the *baseline* placement, distinct from live editing (DR-0054).

This turns "designing a solar system" into a spatial, direct-manipulation task — place it on the map, set its radius, pick its nebula, drop its bodies — rather than typing coordinates into per-type forms.

## 4. How this maps onto what exists

| Capability | Status today | This proposal |
|---|---|---|
| Content-addressed assets, draft/publish, gateway catalog | **Built** (asset delivery + DR-0049) | Reuse unchanged; packages aggregate into the same catalog. |
| Component enumeration + auto-form (`editor_schema`) | **Built** (`GeneratedComponentRegistry`) | Drives the Composer's component palette + field forms. |
| Typed event/intent registry, component `script_read`/`script_patch`, schema artifact | **Proposed** (DR-0051 WS0) | Dependency; Pillar B adds component→hooks capability metadata to it. |
| Combat lifecycle events to Lua | **Partly built** (`event_hooks` opt-in) | Pillar B replaces the opaque JSON wiring with component-scoped binding compiled to the same machinery. |
| Solar systems, per-system nebula, world placement records | **Proposed** (galaxy world structure) | Pillar C.2 is its dashboard authoring surface. |
| Per-type editors (shipyard/genesis/shader/audio/script) | **Built** | Become presets/extensions of the Composer; no longer parallel silos. |
| World map | **Built, read-only** | Gains authoring mode (place/region/assign visuals). |

Net-new engineering is therefore concentrated, not sprawling: (1) the **package manifest + aggregation/validation** (engine-content), (2) **component capability-hook metadata** + its schema generation (extends DR-0051 WS0), (3) the **Composer** dashboard surface (generalizes two existing editors), (4) the **world-map authoring mode** (extends one existing surface).

## 5. A designer's end-to-end workflow (worked example)

Goal: author the "Maw" black-hole system with a red nebula backdrop, a derelict station that drops loot when destroyed, and an asteroid belt.

1. **Backdrop.** In Shader Workshop, author/clone a `nebula.maw` shader param set; preview it. It is saved as a content package `data/content/space/nebula.maw/`.
2. **Station blueprint.** In the Composer, create `station.derelict`: add `display_name`, `size_m`, `health_pool`, `destructible`, `inventory`, a visual asset, a map icon. The blueprint carries no position — that is set at placement (step 3). The Hooks panel (because `destructible` is present) offers `on_destroyed`; attach a 3-line Lua hook that emits `spawn_entity("container.goods", …)` (gated on runtime-spawn work; entity authoring proposal §4). Publish — payloads and the hook binding round-trip-validate.
3. **System placement.** In the World Map authoring mode, draw the Maw system center and radius; assign `SolarSystemVisuals` = `nebula.maw`; drop the black-hole body, the `station.derelict` blueprint, and an asteroid belt blueprint inside the radius. Each drop writes a fixed-identity world-init record.
4. **Verify.** The shard hydrates the new records on the next catalog poll; the client crossfades to the Maw nebula on entering the radius; shooting the station spawns a loot container that is scannable.

Every artifact above is a text file in a package directory, content-addressed where binary, diffable and reviewable, authored entirely from the dashboard — and the only code written was three lines of glue bound to a component hook.

## 6. Non-goals / explicitly out of scope

- **No client-side scripting VM** (reaffirms DR-0051): hooks are server-authoritative; client visuals/audio flow through replicated effect events.
- **No new authority, storage, or distribution model.** Placement, hooks, and packages all ride the existing snapshot→persistence→hydrate and gateway-catalog paths (DR-0040/DR-0049).
- **No binary content format.** Text + content-addressed binaries remain mandatory.
- **No moving the IFCS flight stack or other 60 Hz hot-path math into Lua** (DR-0034/DR-0051).
- **Not a visual node-graph scripting system.** Glue is textual Lua at named hook points; the dashboard is a view over it.

## 7. Migration & sequencing (incremental, non-breaking)

The proposal is deliberately layerable so no single step is a big-bang rewrite:

1. **DR-0051 WS0 first** (its own dependency): typed event/intent registry + `script_api_schema.json` + anti-drift CI. Pillar B's capability metadata is an additive field on that.
2. **Capability metadata** — add `hooks = [...]` to a handful of components (`health_pool`, `destructible`, `inventory`) and generate the component→hooks map. Pure addition; no behavior change.
3. **Package format as an overlay** — introduce `package.lua` manifests + an aggregator that *emits the existing registry artifacts*. Author one new piece of content as a package end-to-end to prove it; leave existing registries generated-from-or-coexisting-with packages until parity.
4. **Composer** — ship as a new dashboard route that targets the package format; fold Genesis/Shipyard in as presets once parity is shown (they already share the gateway registry endpoints).
5. **World-map authoring mode** — add place/region/assign on top of the existing canvas; depends on the galaxy world structure components landing (its Phase 2).
6. **Retire god-files** — once packages are the source of truth, the hand-edited `*_registry.lua` become generated outputs; add a CI guard forbidding hand-edits (mirrors the WS1 dashboard-Lua-parsing guard).

Each step is independently shippable and reversible.

## 8. Open questions

1. **Package granularity.** Is a package one entity, or a themed set (a faction's ships + their shared shader + audio)? Leaning: allow both (a package declares ≥1 blueprint) but keep one "primary" id for indexing.
2. ~~**Capability hooks placement.**~~ **Resolved (2026-06-17):** declared on the engine `#[sidereal_component]` macro via `hooks = [...]` with content-string names validated against the `#[script_event]` allowlist (one declaration site per component; macro stays engine-pure because it only understands opaque hook strings). A separate content-side capability registry was the considered alternative and was rejected as redundant boilerplate.
3. **Composer vs. specialized editors.** How much of Shipyard's hardpoint overlay / Genesis's preview generalizes vs. stays a per-component extension? Likely the latter — formalize a "component editor extension" slot in the Composer.
4. **World-map write authority.** Does map placement write through the gateway authoring catalog (publish-time, fixed-identity, the right answer for static content) or through live BRP graph edits (for already-live instances)? Probably both, on the existing two routes — needs an explicit rule.
5. **Inheritance/variants.** How far do we lean on the DR-0007 variant framework for "the same station in three liveries" vs. duplicating packages? Favor variants; define the overlay semantics.
6. **`ScriptState` promotion timing** (carried from DR-0051): component-scoped hook binding still serializes into `ScriptState`; whether that component moves engine-side affects package compilation.

## 9. References

- `docs/plans/active/unified_content_authoring_pipeline_plan_2026-06-12.md` — gateway-mediated catalog, dashboard-off-Lua, WS0–WS7.
- `docs/decisions/dr-0051_gameplay_authoring_scripting_runtime.md` — typed event/intent registry, component-gated read/patch, lifecycle hooks (the runtime substrate Pillar B extends).
- `docs/features/reference/scripting_support_reference.md` — event bridge, sandbox, intents.
- `docs/features/proposed/galaxy_world_structure_proposal.md` — solar systems, per-system visuals, world placement model (Pillar C.2's world model).
- `docs/decisions/dr-0045_engine_content_separation_achieved.md` + `.claude/skills/sidereal-engine-boundary` — engine/content boundary the package format must respect.
- `docs/features/active/shipyard_ship_authoring_contract.md`, `genesis_planet_registry_contract.md`, `shader_editor_dashboard_contract.md` — the editors the Composer generalizes.
- `docs/features/active/asset_delivery_contract.md`, `world_bootstrap_fixed_entity_identity_contract.md` — content-addressed assets, fixed-identity placement records.
- Code: `data/scripts/bundles/bundle_registry.lua`, `bins/sidereal-replication/src/replication/runtime_scripting.rs`, `bins/sidereal-replication/src/replication/scripting/render_authoring.rs`, `crates/sidereal-game/src/generated/components.rs`, `crates/engine-component-macros/src/lib.rs`.
