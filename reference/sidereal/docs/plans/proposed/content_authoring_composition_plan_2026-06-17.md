# Content Authoring Composition Plan

Status: Proposed
Lifecycle: proposed
Category: plan
Last updated: 2026-06-17
Owners: content authoring + scripting + dashboard + gateway + replication runtime + engine architecture
Scope: Phased, non-breaking workstream plan to deliver the content authoring composition proposal — content packages replacing per-type god-files, component-implied lifecycle hooks, and composition + world-map placement as the primary dashboard surfaces.
Source of truth: yes
Supersedes: n/a
Superseded by: n/a
Primary references:
- docs/features/proposed/content_authoring_composition_proposal.md
- docs/features/proposed/entity_authoring_system_proposal.md
- docs/features/proposed/universe_baseline_seeding_proposal.md
- docs/features/proposed/authoring_dashboard_frontend_proposal.md
- docs/decisions/dr-0053_disk_authored_content_packages_durable_source_of_truth.md
- docs/decisions/dr-0054_universe_baseline_vs_evolved_world_separation.md
- docs/decisions/dr-0051_gameplay_authoring_scripting_runtime.md
- docs/plans/active/unified_content_authoring_pipeline_plan_2026-06-12.md
- docs/features/proposed/galaxy_world_structure_proposal.md
- docs/decisions/dr-0045_engine_content_separation_achieved.md
- docs/features/active/shipyard_ship_authoring_contract.md
- docs/features/active/genesis_planet_registry_contract.md

## 1. Goal

Make a *single coherent piece of content* — an entity with its components, behavior glue, shaders, assets, audio, and world placement — the unit a designer creates, versions, and deletes from the dashboard. Replace the flat per-type registries (`bundle_registry.lua`, `ships/registry.lua`, `assets/registry.lua`, …) with self-contained packages aggregated into the same gateway catalog; let a component's presence (e.g. `health_pool`) imply the lifecycle hooks an author can attach (`on_damage`, `on_destroyed`); and turn the read-only world map into a placement surface for blueprints and solar systems.

This plan executes the three pillars of `content_authoring_composition_proposal.md` along its §7 migration sequence. Each workstream is independently shippable and reversible.

## 2. Relationship to existing work (what this plan does and does not own)

This plan **owns** the package format, component capability-hook metadata, the Composer dashboard surface, and the world-map authoring mode. It **depends on** and does **not** re-decide:

- **DR-0051 / its WS0** — the typed `#[script_event]`/`#[script_intent]` registry, `data/generated/script_api_schema.json`, component `script_read`/`script_patch` gating, and the anti-drift CI gate. **Hard dependency for WS2 onward.** This plan adds one additive field (`hooks = [...]`) to that registry; it does not build the registry.
- **Unified content authoring pipeline plan** — the gateway-mediated catalog, draft→publish under scoped tokens, content-addressed asset delivery, and the dashboard-no-Lua-parsing guard (WS1). Packages aggregate into the *same* catalog artifacts; nothing in the delivery/authority path changes.
- **Galaxy world structure proposal** — the solar-system entity model, `SolarSystemRadius`/`SolarSystemVisuals` components, fixed-identity world-init records. WS5 here is the *dashboard authoring surface* for that model; the components themselves land via that proposal's Phase 2.
- **DR-0045 engine/content boundary** — every new *mechanism* (package format, aggregation, capability-hook macro support, Composer schema, map authoring) is engine; every *named space concept* (the packages, the hook strings, the solar systems) is content. The deletion test stays green.

If DR-0051 is not yet accepted/landed, WS1 (capability metadata) can be drafted but cannot generate into the schema until WS0 exists; WS2+ are blocked. This is the critical-path dependency.

## 3. Current state (summary)

The problem statement and the full inventory of what already exists live in §1 and §4 of the proposal. In brief: the primitives exist but are siloed — `GeneratedComponentRegistry` + `editor_schema` already auto-generate forms; the combat→script bridge already emits six lifecycle events; the gateway catalog + content-addressed assets + draft/publish already work; the world map already plots f64 positions. What is missing is (a) a content *unit*, (b) the bridge from "component present" to "hooks available," and (c) composition + placement dashboard surfaces. No new authority, storage, or distribution substrate is required.

## 4. Workstreams

Sequence and gating:

```
WS0 (DR-0051) ──► WS1 ──► WS2 ──► WS3 ──► WS4
   (dependency)   hooks   pkg     Composer  retire god-files
                  meta    format
                                   WS5 (world-map + per-instance overrides) depends on WS2 + galaxy Phase 2
                                   WS6 (post-foundation extensions: lifecycle emission, super runtime,
                                        collision, script_patch, spawn, quests) ride DR-0051, gated on WS0
                                   WS7 (universe baseline seeding: DR-0054) depends on WS5 + DR-0053
```

### WS0 — Dependency gate (owned by DR-0051)

Not executed here. Entry condition for this plan: DR-0051 WS0 delivered — typed event/intent registry, `script_api_schema.json` artifact, gateway schema + `validate_script` endpoints, generated LuaCATS, anti-drift CI test, and the current combat events/intents ported onto it.

**Exit / entry criteria:** `script_api_schema.json` exists, is CI-guarded against runtime drift, and enumerates the six combat events as typed `#[script_event]`s.

### WS1 — Component capability-hook metadata

**Intent:** Make "this entity has `health_pool`, therefore `on_damage`/`on_destroyed` are available" a *machine-known* fact, without changing any runtime behavior.

**Deliverables:**
- Extend `#[sidereal_component]` (engine: `crates/engine-component-macros`) to accept `hooks = ["on_damage", ...]`. The macro treats entries as **opaque content strings** — it stores them in component metadata and does not interpret them (keeps the macro engine-pure; the names are space content).
- Validate each `hooks` entry against the registered `#[script_event]` allowlist at build/registration time; an unknown hook string is a compile/registration error.
- Emit a `component → hooks` map into `script_api_schema.json` (extends the WS0 generator). Each hook entry carries the event's payload schema by reference.
- Annotate an initial set on content components: `health_pool` → `["on_damage", "on_health_depleted", "on_destroyed"]`, `destructible` → `["on_before_destroy", "on_destroyed"]`, `inventory` → `["on_inventory_changed"]` (add the matching `#[script_event]` for any not yet registered).

**Placement:** macro support + schema generation = engine; the `hooks = [...]` annotations on `HealthPool`/`Destructible`/`Inventory` and the hook strings = content.

**Verification:**
- Anti-drift CI test extended: the committed `script_api_schema.json` component→hooks map matches the runtime-registered metadata (fails on divergence), mirroring the WS0 event/intent gate.
- Unit test: a component declaring an unregistered hook string fails registration.
- No behavior change — existing `event_hooks` runtime path untouched; assert current scripting tests still pass.

**Exit criteria:** the dashboard/CI can answer "given this component set, which hooks are bindable?" purely from the schema artifact, no Lua parsing.

### WS2 — Content package format on disk, publish-to-disk (overlay, parity-first)

**Intent:** Introduce the package directory + manifest as the authoring unit, **stored on disk as the durable source of truth**, while the existing per-type registries continue to function — packages *emit* the same catalog artifacts.

The detailed storage contract — on-disk layout, `manifest.json` + `entity.json` schema, format-per-file rationale, the identity split (§3.4), the rejected `.dat`, disk-write safety (§6.4), and publish failure semantics (§6.5) — is specified in `docs/features/proposed/entity_authoring_system_proposal.md`. The disk-as-source-of-truth decision is **DR-0053**. WS2 implements both.

**Durability finding (2026-06-17) — load-bearing (now DR-0053).** Publishes currently land in PostgreSQL only (`engine-persistence` `publish_script_catalog_draft`); `pg-reset` destroys that volume; disk is seed-only, so **dashboard-published content does not survive a wipe today.** Asset *bytes* already survive (written to disk by the asset uploader). WS2 must therefore make **publish write authored packages to disk** and rely on the existing seed-from-disk to repopulate the catalog after a wipe — extending the proven asset-bytes pattern to definitions. Disk = source of truth; catalog DB = derived cache; drafts may stay ephemeral in SQL. This inverts DR-0025 for content packages and is decided in DR-0053.

**Deliverables:**
- `engine-content` (new or existing engine crate): the **package manifest + definition schema** + aggregator. A package is `data/content/<namespace>/<package_id>/` (entities under `data/content/entities/<package_id>/`) with a `manifest.json` (package_id, kind, schema_version, primary_blueprint, files, revision), a declarative `entity.json` (name, tags, labels, `component_kind → payload`, visual sprite/shader refs) **or** an optional `blueprint.lua` for procedural entities (deferred), optional `hooks.lua` (component-keyed hook functions), and optional `shaders/`, `params/`, `assets.json`, `locale/`.
- **Two new gateway capabilities** (both modeled on existing code): (a) **scoped disk-write for new files/dirs** under the entity-content root, reusing the asset uploader's `tokio::fs::write` + `safe_*_path` sanitization but allowing *create-new*; (b) **seed-from-disk for entity packages on boot**, mirroring `load_script_catalog_from_database_or_seed`.
- Aggregator that reads all package manifests and **produces the existing catalog inputs** (bundle definitions, required-component lists, asset rows, audio rows) so the shard/gateway path is unchanged. Existing `bundles/ship/body.lua` bodies are valid `blueprint.lua` content (mechanical re-home, not rewrite).
- `hooks.lua` → `event_hooks` compilation: at publish, a component-keyed hook table compiles to the existing `ScriptState.data.event_hooks` map + handler functions. Binding a hook whose component is absent from the blueprint is a **publish-time validation error** (not a silent no-op).
- Extend the existing authoring round-trip validation (the one that already round-trips component payloads through the real typed deserializer) to also validate: every referenced asset/audio/shader id resolves, every hook binding's component is present and exposes the bound hook, every component payload decodes.
- **Publish failure semantics** (DR-0053 / proposal §6.5): the atomic disk commit is the single commit point; catalog refresh is downstream and retryable; on any disk/cache divergence, disk wins and the cache is re-derived. A failed catalog refresh after a successful disk commit returns success-with-pending-index, never content loss.
- Author **one new piece of content end-to-end as a package** (candidate: a `station.derelict` or re-home `container.goods`) to prove parity through draft → validate → **publish-to-disk** → hydrate.

**Placement:** manifest/`entity.json` schema + aggregator + validation + disk-write capability + seed-from-disk = engine; the packages = content.

**Verification:**
- The proof-of-life package hydrates on a shard and is selectable/scannable in-world (reuse the WS4-style end-to-end check from the pipeline plan).
- **Wipe-survival test:** publish a package, run `pg-reset`, reboot, confirm the entity re-seeds from disk into the catalog and hydrates (the durability guarantee this workstream exists to deliver).
- A package with a dangling asset id, a hook bound to an absent/non-exposing component, or a malformed payload is **rejected at publish** with a specific error (negative tests).
- The scoped disk-write passes the §6.4 safety negative tests in the entity-authoring spec: path-escape (`..`, absolute, NUL), symlink-escape, and partial-publish rollback (a failed multi-file publish never becomes the live package).
- Golden test: aggregator output for the re-homed content byte-matches (or semantically matches) the prior hand-authored registry artifacts for that content.

**Exit criteria:** new content can be authored as a package end-to-end, **published to disk, and survives a `pg-reset`**, while legacy registries still load unchanged.

### WS3 — The Composer (dashboard)

**Intent:** One dashboard surface to create an entity, add components, fill fields, and attach glue at component hook points — generalizing Shipyard/Genesis.

**Deliverables:**
- New dashboard route **`/foundry`** targeting the package format via the existing gateway draft/publish endpoints (frontend spec: `authoring_dashboard_frontend_proposal.md`).
- Component palette from `GeneratedComponentRegistry`; per-component field forms rendered from `editor_schema` (already built — reuse the Shipyard/Genesis form renderer).
- **Hooks panel:** for each component on the blueprint, show its bindable hooks from the `script_api_schema.json` component→hooks map (WS1). Attaching a hook opens a small Lua editor scoped to `(component, hook)` with autocomplete/lint from the schema + LuaCATS (DR-0051 WS0). Show the Rust default behavior at each hook point so "add a script" reads as an *override*, not a requirement (per the DR-0051/pipeline authority line).
- **Component editor extension slot:** formalize a mount point so component-specific editors attach when their component is present — Shipyard's hardpoint overlay (ship components) and Genesis's procedural preview (planet shader params) become extensions, not separate apps. Fold Genesis/Shipyard in as presets once parity is shown.
- Asset/audio pickers write rows into the package's `assets.json`; inline reach into Shader Workshop for shader/param authoring.

**Placement:** Composer shell + component-palette/form/hook generic machinery = engine-aligned dashboard (project-agnostic); the presets and component extensions naming space concepts = content-facing config.

**Verification:**
- Author the WS2 proof-of-life package entirely from the Composer (no hand-edited files) and publish.
- Hooks panel only offers hooks whose component is present; removing the component removes its hooks and flags any orphaned binding before publish.
- The dashboard-no-Lua-parsing guard (pipeline WS1) still passes — symbol-level correctness is server/CI-side via `validate_script`, the Composer does schema/form linting only.

**Exit criteria:** a designer can compose a non-ship, non-planet entity (e.g. a station) with components + a hook + assets, fully from the dashboard.

### WS5 — World / system map authoring mode

*(WS4 is "retire god-files," kept last; WS5 runs in parallel once WS2 + galaxy Phase 2 land.)*

**Intent:** Make `/game-world` writable for static content placement and solar-system design.

**Deliverables:**
- Authoring mode on the existing pan/zoom canvas: **drag-place** a published blueprint; the drop point sets `world_position`; emit a fixed-identity world-init/placement record through the gateway authoring catalog (publish-time path), consistent with `world_bootstrap_fixed_entity_identity_contract`.
- **Per-instance override layer** (entity authoring proposal §3.6): a placement record references a `blueprint_id` and carries `overrides` — component-value overrides, added components, and hook overrides/additions. This is the schema for the "treasure-hunt cargo" case (override the default `on_create`, add a `quest_trigger`). The override-resolution runtime (chain composition + `super`) is delivered in WS6; WS5 delivers the placement/override *records + authoring UI*.
- **Solar systems as regions** (galaxy proposal): draw center + `SolarSystemRadius`; assign `SolarSystemVisuals` (nebula/backdrop) via a parameter set authored/previewed in Shader Workshop; drop star(s), planets, stations, asteroid belts as children referencing the system via `SolarSystemId`.
- Edit-in-place of already-live instances reuses the existing live-context routing (BRP / graph POST) — distinct from publish-time placement of new static content. Define explicitly which edits go through which route (open decision §7.4 of the proposal).

**Placement:** map authoring shell + placement-record emission = engine-aligned dashboard; solar systems / nebula / belts = content.

**Verification:**
- Place a solar system + nebula + a station blueprint on the map; shard hydrates on next catalog poll; client crossfades to the assigned nebula on entering the radius.
- Placement writes fixed-identity records (re-placing the same logical content is idempotent, not a duplicate).

**Exit criteria:** the §5 worked example in the proposal (author the "Maw" system end-to-end) is achievable from the dashboard.

### WS4 — Retire the god-files

**Intent:** Make packages the source of truth and prevent regression to hand-edited registries.

**Deliverables:**
- Migrate remaining hand-authored registry content into packages; the `*_registry.lua` files become **generated outputs** of the aggregator.
- CI guard forbidding hand-edits to the generated registry files (mirrors the WS1 dashboard-Lua-parsing guard pattern).
- Update `scripting_support_reference.md` / authoring contracts to point at the package model; update Shipyard/Genesis contracts to note they are Composer presets.

**Placement:** guard + generation = engine; the migrated packages = content.

**Verification:**
- Deletion test still green (DR-0045): packages live under `data/`, machinery under `engine-*`.
- `docs-check` passes; CI guard rejects a hand-edit to a generated registry file (negative test).

**Exit criteria:** no piece of content requires touching a flat per-type registry to author; god-files are generated and guarded.

### WS6 — Post-foundation capability extensions (ride DR-0051's event/intent registry)

**Intent:** Grow the authored-behavior surface incrementally on the typed event/intent registry once the foundation (WS1–WS3) exists. **None of these is required for the foundation**; each is additive and individually shippable. They are logged here so the foundation's hook/override surface is designed to accommodate them, and so the Composer never implies a capability that is not yet registered (entity authoring proposal §4 caveat).

- **Entity-lifecycle event emission** — emit `on_create`/`on_spawn`/`on_despawn`/`on_destroy` and component `on_added`/`on_removed` through the event bridge (today combat-only; `data/scripts/bundles/entity_registry.lua` `on_spawned` is the seed) as registered `#[script_event]`s. Until this lands, lifecycle hooks are authored/validated but **inert** (Composer marks them pending-runtime).
- **Override-resolution runtime + `super`** — compose the specificity chain (engine default → blueprint → variant → placement) and implement `ctx:super(ev)`: **explicit, at-most-once, immediate-parent-only, cycle-detected**; side-effect hooks (e.g. `on_destroyed`) reject a **duplicate `super` as a hard error** (would double a drop/spawn); Rust defaults are reached by an explicit named action, **never via `super`**. Statically detectable `super` violations are rejected at publish; the rest are runtime-guarded. (Override schema + records: WS5; resolution runtime: here.)
- **Collision events** — a `collision`/`contact` `#[script_event]` emitted from Avian contacts (server-authoritative, budgeted/throttled), enabling `on_collision` hooks.
- **Mutation surface = intents-first (deliberate decision — settle here).** Gameplay-significant state (inventory, health, quest progress, spawning, destruction, physics impulses, loot) is mutated only through **typed intents** (e.g. `inventory.add_item`) that Rust validates/applies authoritatively — **never** ad-hoc Lua accessors (`ctx.inventory:add` is explicitly *not* the model). `script_read` exposes selected fields; **direct `script_patch` is reserved for narrow, per-component/per-field allowlisted low-risk fields**; identity/ownership/auth/session/transform/motion-authority/shard/visibility/persistence-routing are **never** script-mutable. **The decision to produce here:** the explicit catalog of (a) which mutation surfaces become intents and (b) which fields, if any, are `script_patch`-safe — default posture: intent until proven safe to patch. (Entity authoring proposal §5.1; DR-0051 `script_read`/`script_patch` follow-up.)
- **Runtime `spawn_entity`/`despawn_entity`** — the unified content pipeline's runtime-spawn work (its §3 gap / WS4 `container.goods` path); powers destroy→spawn-items and script-driven encounters.
- **Quest / trigger surface** — proximity/trigger volumes + a quest runtime (DR-0051 lists quests/dialogue/triggers as engine-side future), with intents like `advance_quest_objective` and a `quest_trigger` component exposing `on_proximity`. Powers the treasure-hunt trigger.
- **Tag-driven shader variant selection** — bind a tag/label to a shader parameter preset via the DR-0007 variant framework (recolor a crate by `weapons`/`ore` tag).

**Placement:** event/intent registry + emitters + resolution runtime = engine; concrete event/intent names + quest/shader content = content (DR-0045).

**Sequencing:** each item is independent and gated on DR-0051 WS0; prioritize lifecycle emission + override/`super` runtime first (they unlock the authored-behavior model), then collision/`script_patch`, then spawn/quest.

**Verification (per item):** e.g. an `on_create` override that calls `super` then emits `inventory.add_item` yields base cargo **plus** the added item exactly once; a second `super` in a side-effect hook is rejected; a lifecycle hook fires on the emitted event; an attempt to mutate a non-allowlisted field (e.g. ownership) is rejected.

### WS7 — Universe baseline seeding (authored baseline → seed/apply → evolved world)

**Intent:** Replace the giant one-shot `world_init.lua` with a disk-authored **Universe Baseline** package (the durable source of truth for the initial universe), compiled and applied into the resettable graph DB via a versioned seed/apply+reconcile pipeline. Decision: **DR-0054**; spec: `docs/features/proposed/universe_baseline_seeding_proposal.md`. Depends on WS5 (placements) + DR-0053 (disk-as-truth); the override schema is reused from the entity authoring proposal §3.6.

**Pre-WS7 requirements (settle before phase 1, per DR-0054 Follow-up):** (a) the **stable generator member key** scheme (cell/sample key, not a global index); (b) how the **merge base** is materialized (content-addressed applied-revision snapshots or per-entity `baseline_content_hash`); (c) the **canonical hash** field set for drift detection (authoring-significant state only, excluding provenance/timestamps/runtime-only/shard bookkeeping). Provenance visibility is **locked: persisted, server-side only, not client-replicated**.

**Phased deliverables** (lowest-risk first; reset-to-baseline before reconcile):
1. **Baseline schema + package** — `data/content/universes/<baseline_id>/` (`manifest.json`, `universe.json`, `systems/`, `placements/`, `generators/`, `spawn_tables/`); validation of blueprint/asset/component/placement/generator references. Engine: schema + compiler; content: the packages.
2. **Deterministic generator identity (load-bearing, early)** — generator members mint `uuid_v5(ns, "gen:<generator_id>:<cell_key>:<local_member_key>")` from a **stable spatial/sample key, never a global array index**; `world_init.lua` reframed as a generator runtime driven by generator records. Includes a one-time identity migration for existing worlds.
3. **Apply pipeline + applied-revision marker + merge base** — compile a small baseline into the same graph/generator records `world_init.lua` produces today; persist transactionally; record applied `baseline_id + revision + content_hash` (replacing the opaque `init_key` marker) **and retain the merge base** (snapshot and/or per-entity hash). Keep the apply-on-empty/reset shape.
4. **Provenance** — engine-generic `authored_baseline_source` component (`baseline_id`, `baseline_revision`, `source_key`, `blueprint_id`, `baseline_content_hash`) on every seeded entity; **persisted, server-side only, not client-replicated** (admin/dashboard read via admin APIs).
5. **Dev reset-to-baseline + drift status** — `Reset Runtime World To Baseline` (the dev workhorse) and cheap drift status (disk hash vs applied hash) in the Seed Manager.
6. **Reconcile (3-way merge) + diff overlay** — the production path: merge old applied baseline (merge base) · new baseline · live over the **canonical hash**, with conflict defaults (dev = baseline wins; prod = keep live + flag); the seed-vs-live diff overlay on the map (highest value/effort — last).
7. **Migrate `world_init.lua` content** into structured baseline files; keep Lua only for hooks + validated generators.

**Placement:** baseline format/compiler/apply+reconcile/provenance/materialization API + deterministic-identity derivation = engine; the universe packages, system names, generator kinds, spawn-table content = content.

**Verification:**
- Apply a baseline to an empty DB → world hydrates; `pg-reset` → re-seeds identically (fixed + deterministic identity), and a previously-mined generated asteroid's id is stable across the reset.
- **Identity stability:** changing a generator's density/bounds elsewhere does **not** change the id of an unaffected member (proves the key is spatial/sample-based, not a global index).
- **No false drift:** an unmodified seeded entity reports `not drifted` across ticks (canonical hash excludes provenance/timestamps/runtime/shard noise); drift status flips only on a real authoring-significant mutation, and `Reset Runtime World To Baseline` restores the authored state.
- A reconcile dry-run classifies placements (add/update/keep/conflict) correctly against a hand-constructed drifted world using the retained merge base; conflict defaults apply per environment.
- The baseline never materializes a full procedural belt into graph rows (recipe, not dump); only the spec + evolved deltas persist.
- `authored_baseline_source` is not present in client replication (server-side only).

**Exit criteria:** the initial universe is authored as a disk baseline, applied via the versioned pipeline, survives `pg-reset`, and can be reset-to-baseline (dev) and dry-run-reconciled (prod) from the dashboard.

## 5. Cross-cutting invariants (hold in every workstream)

1. **Text + content-addressed binaries only.** No binary content format; everything diffs, merges, code-reviews, and is AI/CLI-authorable.
2. **Validate every link at publish.** Asset ids, hook→component bindings, component payloads, shader/param refs all round-trip through the real typed validators; failures block publish with specific errors.
3. **No new authority/storage/distribution.** All of placement, hooks, and packages ride the existing snapshot→persistence→hydrate and gateway-catalog paths (DR-0040/DR-0049).
4. **Default behavior stays in Rust; hooks are the escalation path** (DR-0051 / pipeline §4 authority line). The Composer must visibly mark hook scripts as overrides over Rust defaults.
5. **Engine/content boundary (DR-0045).** Mechanisms engine-side, space vocabulary content-side; the deletion test stays green; the engine-boundary guard lint stays clean.
6. **Server-authoritative only.** No client-side scripting VM; client visuals/audio flow through replicated effect events.
7. **Keep identity layers distinct** (`blueprint_id` = `package_id` reusable definition; `placement_id` = authored world-map placement; runtime entity GUID = concrete instance). A blueprint is a template with no position or instance identity; fixed-identity GUIDs belong to placements/instances, not blueprints. WS2 stores blueprints; WS5 owns placements; the birth path mints instance GUIDs. See entity-authoring spec §3.4.
8. **Authored baseline vs. evolved world stay separate** (DR-0054). Disk holds the authored *initial* universe (recipe + curated placements); the graph DB holds the *evolved* world derived from it. Generated content has deterministic identity from a stable spatial/sample key (`gen:<id>:<cell>:<member>`, never a global array index or random); seeded entities carry server-side `authored_baseline_source` provenance; production updates reconcile (3-way merge), never blind-reset. The baseline is never a world dump.

## 6. Risks & sequencing notes

- **Critical path is WS0 (external).** Nothing past WS1 builds without DR-0051's schema artifact. If DR-0051 slips, WS1 can land its macro support + annotations but the schema map and Composer hooks panel wait.
- **Per-event Lua dispatch cost at scale** (carried from DR-0051): component-scoped binding must compile to the same opt-in, budgeted, error-isolated handler path — composition must not silently broaden which entities run handlers.
- **Aggregator parity is load-bearing.** WS2 must prove byte/semantic parity with current registry artifacts before WS4 retires them; keep legacy + packages coexisting until parity is demonstrated.
- **Composer scope creep.** Resist rebuilding Shipyard/Genesis; fold them in as presets/extensions only after the generic surface reaches parity (proposal open decision §8.3).
- **`ScriptState` promotion timing** (DR-0051 follow-up): component-scoped hook bindings serialize into `ScriptState`; if/when that component moves engine-side it affects package compilation — sequence accordingly.

## 7. Open decisions

Resolved in the proposal (2026-06-17): hook names declared on the engine `#[sidereal_component]` macro as content strings (proposal §8.2); full three-pillar umbrella scope retained; mutation surface is intents-first (entity authoring proposal §5.1).

Still open (proposal §8 + WS6): package granularity (one entity vs. themed set), how much of Shipyard/Genesis generalizes vs. stays a component extension, the publish-time-vs-live-BRP rule for map writes, variant/overlay semantics for liveries, `ScriptState` promotion timing, and — the WS6 decision the mutation policy forces — **the explicit catalog of which mutation surfaces are intents and which fields, if any, are `script_patch`-safe**. These are decided per-workstream against the DR-0045 RPG test as each is reached.

## 8. References

- `docs/features/proposed/content_authoring_composition_proposal.md` — the proposal this plan executes (pillars + §7 sequence).
- `docs/decisions/dr-0051_gameplay_authoring_scripting_runtime.md` — typed event/intent registry, schema artifact, component read/patch gating (WS0 dependency).
- `docs/plans/active/unified_content_authoring_pipeline_plan_2026-06-12.md` — gateway catalog, draft/publish, dashboard-no-Lua-parsing guard, authority line.
- `docs/features/proposed/galaxy_world_structure_proposal.md` — solar-system/world model (WS5 surface).
- `docs/decisions/dr-0045_engine_content_separation_achieved.md` + `.claude/skills/sidereal-engine-boundary` — engine/content boundary.
- `docs/features/active/shipyard_ship_authoring_contract.md`, `genesis_planet_registry_contract.md`, `shader_editor_dashboard_contract.md`, `asset_delivery_contract.md`, `world_bootstrap_fixed_entity_identity_contract.md`.
- Code: `crates/engine-component-macros/src/lib.rs`, `crates/sidereal-game/src/generated/components.rs`, `data/scripts/bundles/bundle_registry.lua`, `bins/sidereal-replication/src/replication/runtime_scripting.rs`, `bins/sidereal-replication/src/replication/scripting/render_authoring.rs`.
