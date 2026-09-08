# Engine / Content Separation Refactor — Execution Plan

Status: Implemented
Lifecycle: completed
Category: plan
Last updated: 2026-06-04
Owners: implementation owners
Scope: Engine / Content Separation Refactor — Execution Plan.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

  the deletion test PASSES (WI-13). All four dependency violations V1–V4 killed; the 17
  `engine-*` crates (+ `sidereal-shader-preview`) compile and pass their unit tests with
  `sidereal-game`/`sidereal-net`/bins/`data/scripts`/`data/shaders` deleted; zero leaks; the
  `engine-boundary-guard` lint is clean across all engine crates. Outcome recorded in
  `docs/decisions/dr-0045_engine_content_separation_achieved.md`. Committed scope (P0 + WI-1→7)
  plus opportunistic Phase 5 (WI-8/9/10/11a–c/11e) and the WI-15 rename pass are all DONE.
  Deliberate remainders (content by design): `PlanetBodyShaderSettings`, lighting (D5 won't-do),
  `MountedOn`/`sync_mounted_hierarchy`, `visibility_range.rs`, `procedural_sprite_generation`,
  WI-11d (deferred), and `sidereal-shader-preview` (reclassified content-adjacent — embeds
  Sidereal shader defaults in `native.rs`; correctly keeps its name). Open follow-up: reconcile the
  pre-existing 87-vs-85 protocol-guard test drift (unrelated to this refactor). `engine-ghost-lane`
  `uuid` dev-dep: fixed 2026-06-03. Not pushed.
Created: 2026-06-02
Owner: architecture
Driving decision: DR-0041 §2 ("the backend should be reusable for non-space projects
with no space code compiled into it"), generalised beyond shaders to the whole workspace.

This is a **management plan for delegating the refactor to implementation agents**. It is
the source of truth for *what* to do, *in what order*, and *how to know a step is done*.
Each work item (WI-n) is sized to be handed to one agent. Update the Status Tracker
(§7) as items land. Do not let an agent start a WI whose `Depends on` items are not
`DONE`.

---

## 0. North Star & Acceptance Test

**Goal:** the game engine is project-agnostic for any top-down, grid/coordinate-based
game. Generic machinery (ECS scaffolding + component registry, physics/mass/collision,
world coords/spatial, replication/transport, prediction, asset delivery/cache, the Lua
host, rendering pipeline + `ShaderParameterSet`, lighting contract, persistence, input/
control, camera, audio) lives in reusable `engine-*` crates. Sidereal space content
(ships, thrusters, asteroids, planets/stars, flight/GNC, factions, weapons, mining,
genesis, the concrete component schemas + Lua decoders + the space message catalog) lives
in `sidereal-game` + `data/`.

**The deletion test (the definition of done for the whole refactor):**
> Delete `sidereal-game` and `data/`, and the `engine-*` crates still compile and pass
> their own tests. Nothing in any `engine-*` crate names a space concept (ship, thruster,
> asteroid, planet, star, flight, gnc, weapon, hardpoint, warp, genesis, ore, mining).

**The RPG sanity check (apply to every ambiguous symbol):** *would a top-down RPG
(Secret of Mana / FF: tiles, NPCs, items, melee/spell, towns, dialog — no spaceships)
reuse this unchanged?* If yes → engine. If no → content. If "yes but it's named for
space" → engine after rename/parameterise.

---

## 1. Hard Invariants (every agent must obey)

1. **Dependency direction is one-way:** `sidereal-game` and `data/` depend on `engine-*`.
   No `engine-*` crate may depend on `sidereal-game`, on `sidereal-scripting`'s content
   decoders, or compile any space vocabulary. A CI lint enforces this (WI-1).
2. **Behaviour-preserving extraction.** Moves must not change semantics, wire format,
   persisted format, or replication ordering unless a WI explicitly says so. Most WIs are
   pure moves + re-exports. **WI-4, WI-6, WI-7, and WI-9 additionally introduce a new seam**
   (Lua host/content split, a protocol-registration hook, injected persistence rules, a
   mass-contributor trait) — treat these as behaviour-preserving *interface* extractions:
   design the seam deliberately and prove behaviour/wire/persisted output is unchanged.
   They are not "purely mechanical."
3. **Validate per crate during a WI; the workspace check is the merge gate.** A full
   `cargo check --workspace` (and `siderealctl check`) is required repo policy
   (`.github/pull_request_template.md`, `scripts/siderealctl:614`) and must be green before a
   WI's PR merges. **The gate is currently green** (P0 resolved upstream — verified
   2026-06-03). During iteration use **per-crate** checks (`cargo check -p <crate>` /
   `cargo test -p <crate>`) for speed, plus the downstream consumers each WI lists; run the
   full workspace check before marking the WI done. (`-p` takes the **package name**, e.g.
   `sidereal-client`, not the path `bins/sidereal-client`.)
4. **Preserve deterministic component-registration order.** The `inventory`-based
   registration sorts by `meta.kind` (`crates/sidereal-net/src/lightyear_protocol/registration.rs:263-268`).
   Any change to the registry mechanism must keep that sort and keep client/server order identical.
5. **Persistence is migration-sensitive.** Graph edges and fixed-entity GUIDs are durable.
   Never move/rename persisted component kinds, edge labels, or GUID-derivation logic without
   running the existing fixed-GUID migration tests and documenting a shim (DR-0041 §10 pattern).
6. **The `ShaderParameterSet` migration is mid-flight.** Treat
   `crates/sidereal-game/src/shader_parameter_layout.rs` and
   `crates/sidereal-game/src/components/shader_parameter_set.rs` as the *desired generic
   end-state*. Do **not** start the **rendering** extraction (WI-8) until that migration has
   landed on `main` (confirm the typed `*ShaderSettings` structs other than
   `PlanetBodyShaderSettings` are gone). The other Phase 5 WIs (physics/spatial/visibility/
   hierarchy/movement/lifecycle) do **not** depend on it. `PlanetBodyShaderSettings` staying
   typed is a deliberate exception (DR-0041 §7) — do not "fix" it.
7. **Read-then-edit.** Read a file before editing it. Match surrounding style. Keep the
   `sidereal_component` macro contract intact.
8. **One WI per branch/PR.** Keep diffs reviewable. Reference the WI id in the commit/PR.

---

## 2. Current State (as audited 2026-06-02)

### Internal dependency edges (path deps)
```
audio            → (none)            component-macros → (none)
ui               → (none)            observability    → (none)
shader-preview   → (none)
core             → audio
ghost-lane       → core
persistence      → core
persistence-protocol → core, persistence
game             → core, component-macros
scripting        → audio, core, GAME, persistence          ← VIOLATION (V2)
asset-runtime    → scripting (default-on) ⇒ transitively GAME ← VIOLATION (V4)
net              → core, GAME, asset-runtime (feat lightyear_protocol) ← VIOLATION (V1)
runtime-sync     → GAME, persistence(opt)                    ← VIOLATION (V3)
```

### Direction violations to eliminate (ranked)
- **V1 (HIGH)** `sidereal-net` → `sidereal-game`: space message catalog
  (`crates/sidereal-net/src/lightyear_protocol/messages.rs:128-221`) + `WeaponCooldownState`
  rollback (`.../registration.rs:12,201`). Transport scaffolding + the data-driven
  registration loop are generic.
- **V2 (HIGH)** `sidereal-scripting` → `sidereal-game`: content registry decoders
  (`crates/sidereal-scripting/src/lib.rs:83-86,150-490`). The Lua host is generic.
- **V3 (MEDIUM)** `sidereal-runtime-sync` → `sidereal-game`: only `GeneratedComponentRegistry`
  (`crates/sidereal-runtime-sync/src/lib.rs:11,23`). Hydration machinery is generic.
- **V4 (MEDIUM, transitive)** `sidereal-asset-runtime` → `sidereal-scripting` → game: only to
  reuse `ScriptAssetRegistryEntry` (`crates/sidereal-asset-runtime/src/lib.rs:4`).
- **Minor (data leakage)** `sidereal-core/src/fixed_entity_guid.rs:42-153` hardcodes planet/
  asteroid-field legacy GUID remap data.

### Generic machinery trapped in `sidereal-game` (extract)
`component_meta.rs` (registration framework), generic half of `generated/components.rs`
(registry container + editor registry), `editor_schema.rs`, `render_layers.rs` +
`components/runtime_render_layer_*` + `runtime_world_visual_stack.rs` +
`runtime_post_process_stack.rs`, `shader_parameter_layout.rs` +
`components/shader_parameter_set.rs`, `mass.rs` + mass/collision components,
`collision_outline_generation.rs` (RDP hull), generic half of
`procedural_sprite_generation.rs`, `hierarchy.rs` (generic mount), `world_spatial.rs`,
`visibility_range.rs` + visibility components, `character_movement.rs`, `actions.rs`,
health/destruction lifecycle half of `combat.rs` (`HealthPool`, `Destructible`,
`EntityDestroyed/DestructionStarted`).

### Correctly-placed space content (stays in `sidereal-game`/`data/`)
`flight.rs`, `ifcs.rs`, `asteroid_field*.rs`, `asteroid_fracture_network.rs`,
weapons/ballistics in `combat.rs`, `planet_registry.rs`, `ship_registry.rs`,
`asteroid_registry.rs`, and the ship/thruster/asteroid/planet/scanner/faction/afterburner/
fuel/engine components.

---

## 3. Target Architecture

Rule: **content depends on engine; engine never depends on content.**

```
ENGINE (project-agnostic — the deletion test must pass over these)
  engine-ecs       component_meta + generated-registry framework (container, not the set)
                   + editor_schema     [+ existing sidereal-component-macros]
  engine-spatial   world coords, sharding, world_spatial, visibility-range
  engine-physics   mass/inertia/collider derivation, collision-outline (RDP),
                   generic hierarchy/mounting, avian glue
  engine-render    render-layers, world-visual, post-process, ShaderParameterSet,
                   lighting contract
  engine-transport sidereal-net minus the message catalog (channels + registration loop)
  engine-script    Lua host/sandbox only (no content decoders)
  engine-assets    sidereal-asset-runtime core (no scripting/game dep)
  engine-persist   sidereal-persistence with edge/reference rules injected
  (already generic — renamed to neutral in the O1 rename pass per D2; currently still
   sidereal-named): audio · ui · observability · ghost-lane · core · component-macros
   · persistence-protocol · runtime-sync · asset-runtime

CONTENT (depends on engine)
  sidereal-game    ships, thrusters, asteroids, planets, flight/GNC, weapons, factions,
                   mining, concrete component schemas + registries, the space message
                   catalog, the asteroid/planet/ship Lua decoders
  data/scripts/**  Lua content (already external)
```

### Decisions (signed off 2026-06-02)

- **D1 — Grouping: (a) several small `engine-*` crates.** The compiler enforces the
  one-way boundary (an engine crate cannot depend on content without a rejected cycle), not
  just the vocabulary lint. Each later WI targets a distinct crate.
- **D2 — Naming rule: project-neutral by default; `sidereal-` prefix only for crates that
  carry Sidereal top-down-space ABI/content** (entities like ships, missiles, asteroids,
  planets, flight/GNC, weapons, the space message catalog, the space component schemas +
  Lua decoders). Concretely:
  - New extracted machinery crates get **neutral `engine-*` names** from creation.
  - Anything holding space entities/ABI keeps/gets a **`sidereal-`** name (`sidereal-game`,
    and any future `sidereal-content-*`).
  - **Already-generic crates currently named `sidereal-*`** (`sidereal-core`,
    `sidereal-audio`, `sidereal-observability`, `sidereal-ui`, `sidereal-ghost-lane`,
    `sidereal-component-macros`, `sidereal-persistence`, `sidereal-persistence-protocol`,
    `sidereal-asset-runtime`, `sidereal-runtime-sync`) are renamed to neutral **in a
    dedicated rename pass (WI-15), not bundled into a logic-move WI** (D3). They keep their
    current names until then; this is a known temporary naming inconsistency.
- **D3 — Rename timing: dedicated late pass (WI-15).** Do all logic extraction first; then
  one mechanical rename PR renames the already-generic `sidereal-*` crates to `engine-*`
  (touching imports workspace-wide + `dev.toml`, `scripts/siderealctl`, CI, dashboard build).
  Run it when few branches are in flight. **The `#[sidereal_component]` attribute keeps its
  name** even though its crate becomes neutral — renaming the attribute touches every
  component file for no benefit (the crate name is what D2 is about).
- **D4 — Committed scope: Phases 0–4 (P0, WI-1 → WI-7).** These kill all four dependency
  violations (V1–V4) cheaply and safely and are the committed deliverable. **Phase 5**
  (WI-8, WI-9, WI-10, WI-11a–e) is **opportunistic** — done as those areas are touched by
  other work, not scheduled up front. WI-13 (deletion test) is a someday-goal, not a sprint
  target. WI-15 runs after the committed scope (or after Phase 5 if Phase 5 happens first).
- **D5 — Lighting stays in `sidereal-game`.** WI-14 is **won't-do** unless reconsidered: the
  deletion test passes with lighting as content, and renaming the shipped Lighting V2
  contract is churn with no gameplay benefit.
- **D6 — Small placement calls locked to the plan defaults:** WI-4 space Lua decoders → a
  module in `sidereal-game`; WI-11a world-coordinate constants → move to `engine-spatial`.
  - **D6-WI6 refinement (2026-06-03):** the WI-6 message catalog does **NOT** move to
    `sidereal-game`. Instead `sidereal-net` is reframed as a `sidereal-`-prefixed content
    protocol crate that keeps the messages; only the generic transport scaffolding is extracted
    to `engine-transport`. See the WI-6 block. (Lower churn, consistent with D2.)

---

## 4. Sequencing Rationale

Phases 1–2 sever three of four bad edges (V2, V3, V4) and free the highest-reuse machinery
(registry framework + Lua host) with leaf-shaped, test-covered moves. Phase 3 severs V1.
Phase 4 de-hardcodes persistence (migration-gated). Phase 5 (render/physics) is highest
value but highest churn; its **rendering** item (WI-8) **must** wait for the in-flight
`ShaderParameterSet` migration, while the physics/spatial items do not. Phase 6 finishes
the deletion test.

```
Prerequisite          P0  (unbreak the workspace build — synthetic_load.rs)
Phase 0 (seam)        WI-1
Phase 1 (ecs/registry)WI-2 → WI-3                  (WI-3 needs WI-2)
Phase 2 (script/asset)WI-4 → WI-5                  (WI-5 needs WI-4)
Phase 3 (transport)   WI-6
Phase 4 (persistence) WI-7
Phase 5 (render)      WI-8                          (needs WI-2 + ShaderParameterSet-on-main)
Phase 5 (physics)     WI-9, WI-10                   (need WI-2 only)
Phase 5 (spatial/sim) WI-11a, WI-11b, WI-11c, WI-11d, WI-11e  (need WI-2 only; opportunistic)
Phase 6 (finish)      WI-12 → WI-13
Phase 7 (naming)      WI-15  (rename generic sidereal-* → engine-*; after committed scope)
(WI-14 lighting = WON'T-DO per D5)
```
WI-2 unblocks WI-3/6/7/8/9/10/11a–e. WI-1 unblocks everything. P0 is independent and can
run in parallel with WI-1.

---

## 5. Work Items

Each WI: **Scope · Files · Approach · Acceptance · Verify · Depends on · Risk**. Hand the
whole WI block to the agent. The agent must follow §1 invariants.

### Prerequisite — restore the workspace build

#### P0 — Unbreak `cargo check --workspace`  — ✅ DONE (resolved upstream)
- **Status:** Already green as of branch `refactor/engine-content-separation` base.
  `synthetic_load.rs` compiled when the in-flight asteroid/tooling work was committed to
  `main` (commit `f66cc4f`); verified 2026-06-03: `cargo check --workspace` exits 0 (incl. the
  four new WI-1 engine crates). No fix was needed — the standard merge gate is usable.
- **Scope (historical):** would have fixed/feature-gated
  `bins/sidereal-replication/src/replication/synthetic_load.rs` if still broken.
- **Verify:** `cargo check --workspace` (green).
- **Depends on:** none (independent; can run in parallel with WI-1).
- **Risk:** Low–medium — owned by whoever holds the synthetic-load work; coordinate so this
  isn't reverted. Until P0 lands, WIs validate per-crate per §1.3.

### Phase 0 — Erect the seam (no code moves)

#### WI-1 — Create engine crate(s) + vocabulary lint
- **DONE (commit `c43c59c` + review fix `dec3b11`).** Implemented as
  `scripts/check_engine_boundary.sh` (registered as the `engine-boundary-guard` siderealctl
  task) scanning `crates/engine-*/**/*.rs`. As-built banned regex:
  `(?i)(?:^|[^A-Za-z0-9])(ship|thruster|asteroid|planet|stellar|mining|ore|weapon|hardpoint|warp|genesis|spaceship|nebula|starfield|flight|gnc)\w*`.
  Four empty crates created: `engine-ecs`, `engine-spatial`, `engine-physics`, `engine-render`.
- **Lint vocabulary notes (resolve the rule-pack contradiction):**
  - `faction` is **intentionally not banned** — `VisibilityScope::Faction` /
    `faction_visibility` are generic MMO concepts that live in the engine (per the
    `sidereal-engine-boundary` rule pack). `faction_id` / faction *gameplay* stay in content
    but the lint does not police that (the lint only scans engine crates).
  - Leading boundary is `(?:^|[^A-Za-z0-9])` (underscore-aware) so the Rust unused-var
    convention `_spaceship` is caught while mid-word substrings (relationship, township) are
    not.
  - **Bare `star` is NOT banned** (review fix): with the trailing `\w*` it matched the
    ubiquitous generic identifiers `start`/`startup`/`started`/`starting`. The distinctive
    `stellar` and `starfield` tokens cover space-naming without that collision; star *content*
    lives in `sidereal-game` (not scanned). Lighting is still **not** extracted by WI-8
    (deferred to WI-14 = WON'T-DO per D5); `environment_lighting_state` /
    `stellar_light_source` remain in `sidereal-game`.
- **Files:** `Cargo.toml` (workspace members), new `crates/engine-*/Cargo.toml` + `src/lib.rs`,
  CI script (mirror existing CI guards, e.g. the fixed-GUID uniqueness guard).
- **Approach:** Pure additive. Crates compile empty. Lint runs in CI and locally.
- **Acceptance:** New crate(s) `cargo check` clean; lint passes (empty crates); lint *fails*
  on a planted `let ship = 1;` test. Grouping decision (§3) is recorded with sign-off.
- **Verify:** `cargo check -p <new-crate>`; run the lint script twice (clean + planted).
- **Depends on:** none (D1/D2 locked in §3).
- **Risk:** none (additive).

### Phase 1 — ECS / registration framework

#### WI-2 — Extract the component registration & editor-schema framework
- **Scope:** Move the **generic** registration machinery out of `sidereal-game` into
  `engine-ecs`: `SiderealComponentMeta`, `SiderealComponentRegistration`, `VisibilityScope`,
  `sidereal_never_rollback`, `inventory::collect!`; the **generic** parts of
  `generated/components.rs` (`ComponentRegistryEntry`, `GeneratedComponentRegistry`,
  `ShaderEditor*` registry types, register/iterate helpers) as a *container the game fills*;
  and `editor_schema.rs` whole. Repoint `sidereal-component-macros` codegen paths
  (`crate::component_meta::*`) at the engine crate. The concrete component **set**
  (`pub use crate::components::*`) stays in `sidereal-game`.
- **Files:** `crates/sidereal-game/src/component_meta.rs`,
  `crates/sidereal-game/src/editor_schema.rs`,
  `crates/sidereal-game/src/generated/components.rs` (split container vs set),
  `crates/sidereal-component-macros/src/lib.rs` (the `quote!{ crate::component_meta::... }`
  paths at `:156-263`), `crates/sidereal-game/src/lib.rs` (re-exports).
- **Approach:** Move types; have `sidereal-game` re-export them so existing
  `sidereal_game::{...}` import sites keep working. The macro must reference the new path
  (consider a `$crate`-style indirection or a fixed `engine_ecs::` path). Keep the
  `sort_by_key(meta.kind)` registration order untouched.
- **Acceptance:** `engine-ecs` compiles with zero space vocabulary (lint passes). `sidereal-game`
  re-exports keep all current `sidereal_game::ComponentEditorSchema` / `SiderealComponentRegistration`
  call sites compiling unchanged. Macro still expands and registers components.
- **Verify:** `cargo check -p engine-ecs`, `cargo test -p sidereal-game`,
  `cargo check -p sidereal-net --features lightyear_protocol`,
  `cargo check -p sidereal-runtime-sync`, `cargo check -p sidereal-replication`.
- **Depends on:** WI-1.
- **Risk:** Medium — macro path indirection; deterministic-order regression. Mitigate with the
  registration-order test.

#### WI-3 — Repoint `sidereal-runtime-sync` at `engine-ecs` (kills V3)
- **Scope:** Change `runtime-sync` to depend on `engine-ecs` for `GeneratedComponentRegistry`
  instead of `sidereal-game`. If the persistence-feature path needs only the registry, drop the
  `sidereal-game` dep entirely; if it needs the component *set*, introduce a generic registry
  handle/trait so the set is injected by the caller (the binaries already build the app).
- **Files:** `crates/sidereal-runtime-sync/Cargo.toml`,
  `crates/sidereal-runtime-sync/src/lib.rs:11,23`.
- **Approach:** Prefer full removal of the game dep. If a trait is needed, define it in
  `engine-ecs` and implement it where the registry is populated.
- **Acceptance:** `runtime-sync/Cargo.toml` no longer lists `sidereal-game` (or lists it only
  as a dev-dependency for tests).
- **Verify:** `cargo check -p sidereal-runtime-sync`, `cargo test -p sidereal-runtime-sync`,
  `cargo check -p sidereal-client`, `cargo check -p sidereal-replication`.
- **Depends on:** WI-2.
- **Risk:** Medium — verify hydration still resolves all component kinds at runtime in replication.

### Phase 2 — Lua host vs content decoders

#### WI-4 — Split the Lua host into `engine-script` (kills V2)
- **Scope:** Move the generic host into `engine-script`: sandbox policy, `load_lua_module_from_source`,
  `LoadedLuaModule`, `lua_value_to_json`, `resolve_script_path_from_root`, generic
  `editor_schema`-driven validation, and `audio_registry.rs`. Leave the Sidereal content
  decoders (`load_planet_registry_*`, `load_asteroid_registry_*`, `load_ship_registry_*`,
  `load_ship_module_registry_*`, `validate_asteroid_registry`, `forbidden_ship_module_component_kinds`,
  the `*_REGISTRY_SCRIPT_REL_PATH` consts) and their `sidereal_game::*Registry` return types in
  `sidereal-game` (D6: a new module, `crates/sidereal-game/src/lua_content.rs` — not a separate
  crate).
- **Files:** `crates/sidereal-scripting/src/lib.rs` (split `:1-149` host vs `:150-490+` decoders),
  `crates/sidereal-scripting/src/audio_registry.rs`,
  `crates/sidereal-scripting/Cargo.toml` (drop `sidereal-game` from the host crate),
  `crates/sidereal-scripting/src/bin/gen_shader_parameter_layouts.rs` (re-point).
- **Approach:** Decoders become generic over the target type via `serde`/a small trait so the
  host never names a registry. Keep the published `data/generated/shader_parameter_layouts.json`
  pipeline working (`build_shader_parameter_layout_manifest`).
- **Acceptance:** `engine-script` has no `sidereal-game` dep and passes the vocabulary lint.
  Content decoders compile in their new home and return the same types.
- **Verify:** `cargo check -p engine-script`, `cargo test -p engine-script`,
  `cargo check -p sidereal-game`, `cargo run -p <host-or-content> --bin gen-shader-parameter-layouts`
  then `cargo test -p sidereal-game shader_parameter_layouts_artifact_is_current`,
  `cargo check -p sidereal-gateway`, `cargo check -p sidereal-replication`.
- **Depends on:** WI-1 (WI-2 helpful, not required).
- **Risk:** Medium — the layout-generator bin and gateway/replication both consume scripting.

#### WI-5 — Cut `sidereal-asset-runtime`'s scripting/game dep (kills V4)
- **Scope:** Make `engine-assets` (asset catalog/cache core) depend only on the host
  (`engine-script`) or define `ScriptAssetRegistryEntry` in a place free of game. Remove the
  default-on transitive path to `sidereal-game`.
- **Files:** `crates/sidereal-asset-runtime/Cargo.toml` (the `scripting_catalog` feature →
  `sidereal-scripting`), `crates/sidereal-asset-runtime/src/lib.rs:4`.
- **Approach:** Move/relocate `ScriptAssetRegistryEntry` into `engine-script` (it is asset
  metadata, not content). Asset-runtime keeps its generic catalog/cache types.
- **Acceptance:** Building `sidereal-asset-runtime` (default features) pulls no `sidereal-game`.
  Vocabulary lint passes on the runtime types (test fixtures naming `corvette.png` etc. may stay
  under `#[cfg(test)]`).
- **Verify:** `cargo tree -p sidereal-asset-runtime` shows no `sidereal-game`;
  `cargo check -p sidereal-asset-runtime`, `cargo test -p sidereal-asset-runtime`,
  `cargo check -p sidereal-client`, `cargo check -p sidereal-gateway`.
- **Depends on:** WI-4.
- **Risk:** Low–medium.

### Phase 3 — Transport vs message catalog

#### WI-6 — Extract generic transport to `engine-transport`; reframe `sidereal-net` as content protocol (kills V1)
- **DECISION (refines D6, 2026-06-03): REFRAME, do not relocate messages.** Extract only the
  generic, game-free scaffolding into `engine-transport`; **`sidereal-net` keeps the message
  catalog + channels + `WeaponCooldownState`** and is reclassified as a legitimate
  `sidereal-`-prefixed *content protocol* crate (consistent with D2). It may keep depending on
  `sidereal-game`; that edge is no longer a "violation" because `sidereal-net` is content, not a
  generic crate. V1 is resolved by giving the engine a reusable game-free `engine-transport`,
  not by moving every message import. Lowest churn (client/replication message imports unchanged).
- **Scope:** Create `crates/engine-transport` (neutral, game-free) and move into it the genuinely
  generic transport scaffolding: the Avian `Position`/`Rotation`/velocity prediction + rollback
  tolerance config, the delta-keyframe-interval env parsing, the data-driven
  `inventory::iter::<SiderealComponentRegistration>` registration loop (`registration.rs:263-274`,
  driven off `engine-ecs`), generic channel-registration and message-registration *helpers*, and a
  **hook/trait** the game implements to register its own messages/channels/rollback types.
  `sidereal-net` keeps `messages.rs`, the concrete channels, `WeaponCooldownState` rollback, and the
  Sidereal-specific `register_lightyear_common_protocol`, now calling the `engine-transport` helpers.
- **Files:** `crates/engine-transport/*` (new), `crates/sidereal-net/src/lightyear_protocol/{registration.rs,channels.rs,messages.rs,ids.rs,input.rs}`,
  `crates/sidereal-net/Cargo.toml` (+`engine-transport`, +`engine-ecs`). Consumers `bins/sidereal-client`,
  `bins/sidereal-replication` should need minimal/no change (they keep importing from `sidereal-net`).
- **Approach:** `engine-transport` exposes the generic registration helpers + the game hook; the
  binaries' setup path is unchanged (they call `sidereal-net`, which now delegates the generic parts).
  `engine-transport` must NOT depend on `sidereal-game` (it may depend on `engine-ecs`, `lightyear`,
  `avian2d`).
- **Acceptance:** `engine-transport` has no `sidereal-game` dep and passes the boundary guard. Client
  and replication still register the identical message set and component order on the wire.
- **Verify:** `cargo check -p engine-transport`, `cargo check -p sidereal-net`,
  `cargo check -p sidereal-client`, `cargo test -p sidereal-replication`. Run an
  end-to-end connect (client ↔ replication) if a harness is available; confirm no protocol-mismatch.
- **Depends on:** WI-2.
- **Risk:** Medium-high — protocol registration order is wire-critical (§1.4). Verify ordering and
  channel set are byte-identical.

### Phase 4 — De-hardcode persistence

#### WI-7 — Inject persistence edge/reference rules instead of const tables
- **Scope:** Replace the hardcoded space-aware tables in `sidereal-persistence` with rules the
  game registers at startup: `"Hardpoint"` label + `HAS_HARDPOINT` edge
  (`lib.rs:143,726-737,1395-1403,1483`), `FIXED_ENTITY_SCALAR_REFERENCES`
  (`lib.rs:1707-1708`), `FIXED_ENTITY_ARRAY_REFERENCES` (`lib.rs:1710-1712`), and the
  `infer_script_family` planet branches (`lib.rs:939-952`). Keep `HAS_CHILD` / `MOUNTED_ON`
  as generic built-ins.
- **Files:** `crates/sidereal-persistence/src/lib.rs` (the cited ranges), callers that build the
  persistence service / replication persistence (`bins/sidereal-replication/src/replication/persistence.rs`,
  `bins/sidereal-persistence-service`).
- **Approach:** Define a `PersistenceSchemaRules { extra_edges, scalar_refs, array_refs,
  script_family_map }` passed in at construction; `sidereal-game` supplies the space values.
- **Acceptance:** `sidereal-persistence` source contains no `Hardpoint`/`asteroid_field_member`/
  `planet` literals (vocabulary lint passes). Round-trip + migration tests green.
- **Verify:** `cargo test -p sidereal-persistence` (incl. fixed-GUID migration tests),
  `cargo test -p sidereal-persistence-protocol`, `cargo check -p sidereal-persistence-service`,
  `cargo check -p sidereal-replication`.
- **Depends on:** WI-2 (for the rules-injection pattern; not strictly required but recommended).
- **Risk:** Medium — durable graph data. Do not change persisted labels/edge names, only *where the
  rule list lives*. Keep migration tests as the gate (§1.5).

### Phase 5 — Render & physics extraction

> **Only WI-8 (rendering) is gated** on DR-0041's `ShaderParameterSet` family migration
> landing on `main` (the uncommitted work in the tree — confirm via `git log`/`git status`
> that the typed `*ShaderSettings` structs other than `PlanetBodyShaderSettings` are gone).
> WI-9/WI-10/WI-11a–e do **not** depend on it and can proceed once WI-2 is done.

#### WI-8 — Extract the rendering pipeline to `engine-render`
- **Scope:** Move the generic, Lua-authored render framework: `render_layers.rs`, the render
  domain/phase constants, `components/runtime_render_layer_definition.rs`,
  `runtime_render_layer_override.rs`, `runtime_render_layer_rule.rs`, `runtime_world_visual_stack.rs`,
  `runtime_post_process_stack.rs`, `shader_parameter_layout.rs`,
  `components/shader_parameter_set.rs`.
  **Lighting is out of scope here** (`environment_lighting_state`, `stellar_light_source`):
  those carry `stellar` naming the lint bans, so they are extracted only after a generic
  rename — deferred to **WI-14**. Leave `PlanetBodyShaderSettings` in `sidereal-game`
  (DR-0041 exception).
- **Files:** the above under `crates/sidereal-game/src/`, plus client consumers
  `bins/sidereal-client/src/runtime/{visuals*,render_layers,shaders,backdrop/*,post_process,lighting}.rs`,
  and the bundled-artifact path in `shader_parameter_layout.rs:33` (`include_str!` of
  `data/generated/shader_parameter_layouts.json`).
- **Approach:** Move types; re-export from `sidereal-game` for compatibility; keep the `include_str!`
  artifact path resolvable (it is content data — engine reads it via a path/handle, or the artifact
  ships with the game and is injected).
- **Acceptance:** `engine-render` vocabulary lint passes (note: `RuntimeEffectMaterial` / "starfield"
  family identifiers may need to be data-driven — see DR-0041 §6.3; if a family name is space-specific,
  keep it as a Lua-authored string, not a Rust symbol). `cargo test -p sidereal-game` green.
- **Verify:** `cargo check -p engine-render`, `cargo test -p sidereal-game`,
  `cargo check -p sidereal-client` (native), `cargo check -p sidereal-client --target wasm32-unknown-unknown`,
  `cargo check -p sidereal-replication`.
- **Depends on:** WI-2 + ShaderParameterSet-on-main.
- **Risk:** High churn (client rendering touch points). Keep behaviour identical; the audit found
  this is already the generic pipeline, so it's a move, not a redesign.

#### WI-9 — Extract physics: mass/inertia/collider derivation to `engine-physics`
- **Scope:** Move `mass.rs` (`recompute_total_mass`, `collider_from_collision_shape`,
  `bootstrap_root_dynamic_*`, perf counters), and mass/collision components
  (`base_mass_kg`, `density`, `total_mass_kg`, `mass_kg`, `mass_dirty`, `collision_profile`,
  `collision_aabb_m`, `collision_outline_m`, `contact_resolution_m`). Introduce a
  **mass-contributor trait** so derivation stops directly reading `Inventory`/`cargo_mass_kg`/
  `module_mass_kg` (those stay in game and implement the trait).
- **Files:** `crates/sidereal-game/src/mass.rs`, the listed `components/*`, and `lib.rs` system
  wiring (`SiderealSharedSimulationPlugin` adds `recompute_total_mass`, `bootstrap_*` at
  `lib.rs:227-346`).
- **Approach:** Engine owns the derivation system + the trait; game registers contributors. Keep
  the FixedUpdate ordering identical.
- **Acceptance:** `engine-physics` mass code has no `inventory`/`cargo`/`module` symbol; lint passes.
  Mass tests (`crates/sidereal-game/tests/mass.rs`) green.
- **Verify:** `cargo test -p sidereal-game --test mass`, `cargo check -p engine-physics`,
  `cargo check -p sidereal-replication`.
- **Depends on:** WI-2.
- **Risk:** Medium — the contributor trait is the only real design work; ordering must not change.

#### WI-10 — Extract collision-outline (RDP hull) + generic sprite geometry
- **Scope:** Move `collision_outline_generation.rs` (RGBA/PNG → RDP hull, half-extent helpers)
  whole into `engine-physics` (or `engine-render` — pick where colliders live). Split
  `procedural_sprite_generation.rs`: the generic image-set/hull plumbing → engine; the
  asteroid silhouette (`AsteroidSilhouetteShape`, `asteroid_silhouette_*`, `style_silhouette_factor`)
  stays in `sidereal-game`.
- **Files:** `crates/sidereal-game/src/collision_outline_generation.rs`,
  `crates/sidereal-game/src/procedural_sprite_generation.rs`, `lib.rs` re-exports `:46-76`.
- **Approach:** Engine exposes generic `generate_rdp_collision_outline_from_rgba` etc.; game's
  asteroid silhouette calls into it.
- **Acceptance:** Engine half has no asteroid symbol; lint passes. Outline/sprite tests green.
- **Verify:** `cargo check -p engine-physics`, `cargo test -p sidereal-game`,
  `cargo check -p sidereal-client`.
- **Depends on:** WI-2 (WI-9 helpful for crate placement).
- **Risk:** Low–medium.

> **WI-11 was split into five independent WIs** (one PR each) — spatial, visibility,
> hierarchy/mount, movement+actions, lifecycle. Each depends only on WI-2 and each touches the
> shared simulation/`PostUpdate` plugin wiring in `crates/sidereal-game/src/lib.rs`, so they
> must **not** run concurrently against the same plugin file without coordination; sequence
> them or rebase carefully. All must keep `FixedUpdate`/`PostUpdate` system ordering identical
> (invariant §1.2).

#### WI-11a — Extract world-spatial to `engine-spatial`
- **Scope:** Move `world_spatial.rs` (`resolve_world_position`, `resolve_world_rotation_rad`)
  and (D6) **move the world-coord consts** in `crates/sidereal-core/src/sharding.rs` to
  `engine-spatial`. Component `size_m` and other pure world-space scalars go here too if not
  already generic.
- **Files:** `crates/sidereal-game/src/world_spatial.rs`, `crates/sidereal-core/src/sharding.rs`,
  `crates/sidereal-game/src/lib.rs` (re-exports `:91`).
- **Acceptance:** lint passes on moved code; `cargo test -p sidereal-game` green.
- **Verify:** `cargo check -p engine-spatial`, `cargo test -p sidereal-game`,
  `cargo check -p sidereal-replication`, `cargo check -p sidereal-client`.
- **Depends on:** WI-2.
- **Risk:** Low.

#### WI-11b — Extract the visibility-range framework to `engine-spatial`
- **Scope:** Move `visibility_range.rs` + visibility components (`visibility_range_m`,
  `visibility_range_buff_m`, `public_visibility`, `faction_visibility`, `visibility_disclosure`).
  `faction_visibility`/`VisibilityScope::Faction` are generic (rule pack) — they belong here;
  `faction_id`/faction gameplay stay in game.
- **Files:** `crates/sidereal-game/src/visibility_range.rs`, the listed `components/*`,
  `crates/sidereal-game/src/lib.rs` (re-exports `:90`).
- **Acceptance:** lint passes; visibility tests green.
- **Verify:** `cargo check -p engine-spatial`, `cargo test -p sidereal-game`,
  `cargo check -p sidereal-replication`.
- **Depends on:** WI-2.
- **Risk:** Low–medium.

#### WI-11c — Extract generic hierarchy/mounting
- **Scope:** Move `hierarchy.rs` (`sync_mounted_hierarchy`) + generic mount components
  (`mounted_on`, `parent_guid`). **Keep `hardpoint` in game** (named mount slot = content);
  generic parent/child + `mounted_on` are engine.
- **Files:** `crates/sidereal-game/src/hierarchy.rs`, `components/{mounted_on,parent_guid}.rs`,
  `crates/sidereal-game/src/lib.rs` (re-export `:64` + `PostUpdate` wiring `:326-338`).
- **Acceptance:** lint passes; hierarchy round-trips unchanged; ordering before
  `TransformSystems::Propagate` preserved.
- **Verify:** `cargo check -p engine-ecs`, `cargo test -p sidereal-game`,
  `cargo check -p sidereal-replication`, `cargo check -p sidereal-client`.
- **Depends on:** WI-2.
- **Risk:** Medium — touches `PostUpdate` ordering.

#### WI-11d — Extract character movement + action/control routing
- **Scope:** Move `character_movement.rs` + `components/character_movement_controller.rs`, and
  `actions.rs` + `components/{action_queue,action_capabilities,controlled_entity_guid}`.
- **Files:** the above, `crates/sidereal-game/src/lib.rs` (re-exports + the `SimulateGameplay`
  system wiring `:227-279`).
- **Acceptance:** lint passes; `crates/sidereal-game/tests/character_movement.rs` green;
  `FixedUpdate` ordering identical for both server-authority and client-prediction roles.
- **Verify:** `cargo test -p sidereal-game --test character_movement`,
  `cargo check -p engine-*`, `cargo check -p sidereal-replication`, `cargo check -p sidereal-client`.
- **Depends on:** WI-2.
- **Risk:** Medium — shared simulation plugin ordering across both runtime roles.

#### WI-11e — Extract the generic destruction/health lifecycle
- **Scope:** Move the generic lifecycle from `combat.rs`: `HealthPool`, `Destructible`,
  `EntityDestroyed`/`EntityDestructionStarted` events, `begin_pending_destructions`,
  `advance_pending_destructions`. **Leave weapons/ballistics/asteroid-damage in game**
  (`process_weapon_fire_actions`, `BallisticWeapon`/`BallisticProjectile`,
  `accumulate_asteroid_member_damage`, etc.).
- **Files:** `crates/sidereal-game/src/combat.rs` (split lifecycle vs weapons),
  `components/{health_pool,destructible,damage_type}.rs`, `crates/sidereal-game/src/lib.rs`
  (the destruction systems + messages in `SimulateGameplay`/message registration `:240-325`).
- **Acceptance:** lint passes on the lifecycle half (no `weapon`/`ballistic`/`asteroid` symbol);
  destruction-order tests green; weapon→damage→destruction sequence unchanged.
- **Verify:** `cargo test -p sidereal-game`, `cargo check -p engine-*`,
  `cargo check -p sidereal-replication`.
- **Depends on:** WI-2.
- **Risk:** Medium — `combat.rs` interleaves generic lifecycle with weapon content; split carefully.

### Phase 6 — Finish the deletion test

#### WI-12 — Move space data out of `sidereal-core`
- **Scope:** Move the legacy fixed-entity remap table + `planet_body_*` helpers
  (`crates/sidereal-core/src/fixed_entity_guid.rs:42-153`) into `sidereal-game` (migration data)
  while keeping the generic UUIDv5 derivation (`derive_entity_guid`, `derive_child_entity_guid`,
  `SIDEREAL_FIXED_ENTITY_NAMESPACE`) in core/engine. Migration consumers get the table from game.
- **Files:** `crates/sidereal-core/src/fixed_entity_guid.rs`, `crates/sidereal-core/src/lib.rs:14-18`,
  consumers in `crates/sidereal-persistence` and `bins/sidereal-replication`.
- **Acceptance:** core has no `planet`/`asteroid_field` literal; fixed-GUID uniqueness + remap tests
  move with the data and stay green.
- **Verify:** `cargo test -p sidereal-core`, `cargo test -p sidereal-game`,
  `cargo test -p sidereal-persistence`.
- **Depends on:** WI-7.
- **Risk:** Medium — migration data; do not change derived GUID values (§1.5).

#### WI-13 — Run the deletion test + document
- **Scope:** In a throwaway worktree, remove `sidereal-game` + `data/` from the workspace and
  confirm every `engine-*` crate (+ audio/ui/observability/ghost-lane/core/persistence-protocol)
  compiles and tests pass. Fix any residual leak found. Write a short DR (or update DR-0041)
  recording the achieved boundary and any remaining deliberate exceptions
  (e.g. `PlanetBodyShaderSettings`).
- **Files:** new `docs/decisions/dr-00xx_engine_content_separation_achieved.md`; this plan
  (mark complete).
- **Acceptance:** Deletion test passes; exceptions documented (`PlanetBodyShaderSettings`; and
  lighting if WI-14 has not yet run — lighting-in-game is content, so the deletion test still
  passes without it).
- **Verify:** `cargo check`/`cargo test` per engine crate in the stripped worktree; vocabulary lint
  passes across all engine crates.
- **Depends on:** WI-3, WI-5, WI-6, WI-7, WI-8, WI-9, WI-10, WI-11a, WI-11b, WI-11c, WI-11d,
  WI-11e, WI-12. (WI-14 is optional — not a blocker; lighting may stay in game.)
- **Risk:** Low (verification) — surfaces anything missed.

#### WI-14 — (WON'T-DO per D5) Extract the lighting contract after a generic rename
- **Decision (D5):** not pursued. Lighting stays in `sidereal-game` as content; the deletion
  test passes without it. Kept here only as the record of what extraction *would* require if
  reconsidered. Do not assign without re-opening D5.
- **Scope:** Rename the stellar-named lighting types to generic terms (e.g.
  `StellarLightSource` → `PrimaryLightSource`, the "stellar" fields of
  `EnvironmentLightingState` → generic light-tier names) per DR-0038, then move the generic
  lighting *contract* to `engine-render`. This is deferred because the rename touches the
  Lighting V2 material contract, the client lighting path, and the dashboard editor, and is
  not required for the deletion test (lighting can remain content).
- **Files:** `crates/sidereal-game/src/components/{environment_lighting_state,stellar_light_source}.rs`,
  `bins/sidereal-client/src/runtime/lighting.rs`, dashboard lighting editors, DR-0038.
- **Acceptance:** moved lighting code passes the `star`/`stellar` lint; Lighting V2 behaviour
  and material contract unchanged.
- **Verify:** `cargo check -p engine-render`, `cargo check -p sidereal-client`
  (native + `--target wasm32-unknown-unknown`), visual parity check via the dev tooling.
- **Depends on:** WI-8.
- **Risk:** Medium-high — cross-cutting rename of a shipped material contract; do last or skip.

### Phase 7 — Naming alignment (D2/D3)

#### WI-15 — Rename already-generic `sidereal-*` crates to neutral `engine-*`
- **Scope:** One mechanical, behaviour-neutral rename pass (D3) bringing the already-generic
  crates into line with D2: `sidereal-core`, `sidereal-audio`, `sidereal-observability`,
  `sidereal-ui`, `sidereal-ghost-lane`, `sidereal-component-macros`,
  `sidereal-persistence`, `sidereal-persistence-protocol`, `sidereal-asset-runtime`,
  `sidereal-runtime-sync` → `engine-*` names. **The `#[sidereal_component]` attribute keeps
  its name** (D3) — only the crate is renamed. Run when few branches are in flight.
- **Files:** every crate `Cargo.toml` `name`/path-dep, all `use` sites workspace-wide, plus
  `dev.toml`, `scripts/siderealctl`, CI scripts, the dashboard build, and any `include_str!`/
  path references. Pure rename — no logic change.
- **Approach:** Rename one crate per commit (re-export shim optional/short-lived), or a single
  scripted pass; either way verify nothing else changed. Decide final names per crate (e.g.
  `engine-core` vs splitting core further — out of scope here, just rename).
- **Acceptance:** No generic crate carries a `sidereal-` prefix; `cargo check --workspace`
  green; `siderealctl` tasks still resolve; dashboard build green.
- **Verify:** `cargo check --workspace` (P0 must be done), `siderealctl check`,
  dashboard build, full test pass.
- **Depends on:** committed scope (P0, WI-1 → WI-7) complete; ideally after any Phase 5 work
  to avoid double-churn. Not a blocker for WI-13.
- **Risk:** Medium — wide but mechanical; the danger is collision with in-flight branches, so
  schedule it deliberately (D3).

---

## 6. Build & Verification Notes (read before any WI)

- **Per-WI iteration uses per-crate checks; the merge gate is `cargo check --workspace` /
  `siderealctl check`** (invariant §1.3). The gate is **green** (P0 resolved upstream, verified
  2026-06-03) — run it before marking any WI done. Use per-crate checks during iteration only
  for speed.
- Standard downstream check set after touching engine machinery (note: `-p` takes the **package
  name**, not the path — e.g. `sidereal-client`, not `bins/sidereal-client`):
  `cargo check -p sidereal-game`,
  `cargo check -p sidereal-net --features lightyear_protocol`,
  `cargo check -p sidereal-runtime-sync`,
  `cargo check -p sidereal-replication`,
  `cargo check -p sidereal-client` (and `--target wasm32-unknown-unknown` for rendering WIs),
  `cargo check -p sidereal-gateway`.
- Order-sensitive tests to keep green: the component-registration order test, the fixed-GUID
  uniqueness/migration tests, `shader_parameter_layouts_artifact_is_current`,
  `crates/sidereal-game/tests/{component_registry,component_metadata,mass,character_movement}.rs`.
- Use the project dev tooling (siderealctl) per the `sidereal-dev-tooling` rules for any runtime
  verification; do not hand-launch services.
- Respect the Lightyear fork policy (AGENTS.md §3.5): protocol changes stay generic and
  project-agnostic.

---

## 7. Status Tracker

| WI | Title | Phase | Depends on | Status | PR / notes |
|----|-------|-------|------------|--------|-----------|
| P0 | Unbreak `cargo check --workspace` (synthetic_load) | pre | — | DONE | resolved upstream (f66cc4f); gate green 2026-06-03 |
| WI-1 | Engine crates + vocabulary lint | 0 | — | DONE | c43c59c + dec3b11; guard `engine-boundary-guard`; workspace green |
| WI-2 | Extract registration + editor-schema framework | 1 | WI-1 | DONE | engine-ecs holds framework; sidereal-game re-exports `component_meta`/`editor_schema`/containers so macro path `crate::component_meta::*` resolves unchanged; registration order untouched; workspace green |
| WI-3 | Repoint runtime-sync (kills V3) | 1 | WI-2 | DONE | eef7dd6; **V3 killed**; game→dev-dep for one test |
| WI-4 | Split Lua host → engine-script (kills V2) | 2 | WI-1 | DONE | 8be2402; **V2 killed**; facade game-free; **V4 fell as side effect** |
| WI-5 | Retire sidereal-scripting facade → engine-script (cleanup; V4 already dead) | 2 | WI-4 | DONE | bd9ce5c; facade deleted; consumers on engine-script |
| WI-6 | Extract engine-transport; reframe sidereal-net (kills V1) | 3 | WI-2 | DONE | e75118e; **V1 killed**; reg order + protocol v14 unchanged |
| WI-7 | Inject persistence schema rules | 4 | WI-2 | DONE | f8fc7de; rules→artifact; service game-free; no persisted strings changed |
| WI-8 | Extract rendering → engine-render | 5 | WI-2 + SPS-on-main | TODO | **only this WI** needs ShaderParameterSet |
| WI-9 | Extract mass/collider → engine-physics | 5 | WI-2 | DONE | d478c74; DerivedMassContribution seam; kinds/order unchanged |
| WI-10 | Extract RDP hull → engine-physics | 5 | WI-9 | DONE | de9bd05; verbatim move; procedural_sprite stays content |
| WI-11a | Extract world-spatial → engine-spatial | 5 | WI-2 | DONE | aa055e2; sharding consts left in core |
| WI-11a.1 | Move EntityGuid → engine-ecs; restore require | 5 | WI-11a | DONE | 8a575bc; EntityGuid generic; require restored; unblocks all require sites |
| WI-11c | Extract ParentGuid → engine-ecs | 5 | WI-11a.1 | DONE | 0784997; ParentGuid moved; **MountedOn stays in game** (`hardpoint_id` field = content); sync_mounted_hierarchy stays |
| WI-11b | Extract visibility components → engine-spatial | 5 | WI-11a.1 | DONE | 76f46fe; 5 components moved; visibility_range.rs stays |
| WI-11d | Extract character movement + actions | 5 | WI-2 | DEFERRED | content-coupled: `EntityAction` enum mixes generic verbs with space actions (weapon/afterburner/tractor/scanner); `ActionQueue` holds it; `character_movement.rs` uses `PlayerTag`. Needs DR-0013 re-architecture (split action enum), not a move — out of opportunistic scope |
| WI-11d | Extract character movement + actions | 5 | WI-2 | TODO | FixedUpdate order, both roles |
| WI-11e | Extract destruction/health lifecycle → engine-gameplay (NEW crate) | 5 | WI-11a.1 | DONE | 5ac37a6; engine-gameplay created; schedule order + kinds unchanged |
| WI-8 | Extract render pipeline → engine-render | 5 | WI-2 + SPS-landed | DONE | b97e7ce; 8 files moved; artifact byte-identical; 0 client files touched; PlanetBody + lighting stay in game |
| WI-12 | Move space data out of core | 6 | WI-7 | DONE | 80046f6; core vocab-clean; GUID values frozen; persistence stays game-free |
| WI-15 | Rename generic sidereal-* → engine-* | 7 | WI-12 | DONE | 966c419; 10 renamed; traps handled; audio hash-seed left intact; workspace+guard+fmt green. GAP: `sidereal-shader-preview` (generic but omitted from the 10; has space vocab in native.rs) — flagged follow-up, not renamed |
| WI-13 | Deletion test + DR | 6 | WI-3,5,6,7,8,9,10,11a–e,12,15 | DONE | DR-0045; throwaway worktree (HEAD) stripped game+net+4 bins+data/scripts+data/shaders (kept data/generated); `cargo check --workspace` green — all 17 engine-* (+shader-preview) compile, **zero leaks**, boundary-guard clean; engine libs/unit tests pass. Only `data/generated/` dep is engine-render's `include_str!` of shader_parameter_layouts.json. Test-fixture couplings (not leaks): engine-script audio test reads data/scripts; shader-preview test include_str!s a deleted space shader; pre-existing engine-ghost-lane uuid dev-dep gap. Worktree removed; branch clean |
| WI-14 | Lighting extraction after rename | 5 | WI-8 | WON'T-DO | D5: lighting stays in `sidereal-game` |
| WI-15 | Rename generic `sidereal-*` crates → `engine-*` | 7 | committed scope done | TODO | D3: late mechanical pass; keep `#[sidereal_component]` name |

Legend: TODO · IN-PROGRESS · IN-REVIEW · DONE · BLOCKED · DEFERRED · WON'T-DO.

**Committed scope (D4):** P0 + WI-1 → WI-7 (kills V1–V4). Phase 5 (WI-8/9/10/11a–e) is
opportunistic. WI-13 is a someday-goal. WI-14 is won't-do. WI-15 runs after the committed
scope (or after any Phase 5 work, to avoid double-churn).

**Violations status (2026-06-03): V1, V2, V3, V4 all KILLED.** Generic crates established:
`engine-ecs`, `engine-script`, `engine-transport` (game-free, guard-clean); `engine-spatial`/
`engine-physics`/`engine-render` empty pending opportunistic Phase 5.

**Failures observed during the work:**
1. **WASM client build (`mio`) — was a refactor regression, now FIXED (2026-06-04).** Earlier
   notes called this pre-existing; that was wrong. WI-4 added `sidereal-game → engine-persistence`
   (for the `lua_content` decoders), which dragged `postgres` (→ tokio `net` → `mio`) and `mlua`
   into every `sidereal-game` consumer, including the browser client (`origin/main`'s wasm client
   pulled neither). Fixed by gating the content-authoring layer (`lua_content` + `persistence_schema`
   and their `mlua`/`engine-persistence`/`engine-script` deps) behind an off-by-default
   `content-authoring` feature: servers enable it, the client doesn't. `cargo check -p
   sidereal-client --target wasm32-unknown-unknown --features bevy/webgpu` now builds.
2. `sidereal-net` test `lightyear_protocol_guard_requires_intentional_protocol_updates` fails:
   guard constant `GUARDED_REPLICATION_COMPONENT_COUNT = 87` vs actual `85`
   (`crates/sidereal-net/tests/lightyear_protocol.rs:24`). Pre-existing drift (guard last bumped
   by main commit `33db20f`; the replicated set later changed to 85 without updating the guard).
   WI-6 did not touch the test or the component set. **Needs a separate reconcile commit** (out of
   refactor scope) so `siderealctl test`/CI is green.
3. `transport_lightyear_e2e` (subprocess-spawning) fails — needs a seeded multi-service env the
   sandbox lacks; the `cargo check --workspace` merge gate is unaffected and green.

---

## 8. References

- `docs/decisions/dr-0041_generic_lua_authored_shader_parameter_schema.md` (reuse goal, SPS migration)
- `docs/decisions/dr-0027_lua_authored_render_layers_and_generic_shader_pipeline.md`
- `docs/decisions/dr-0029_runtime_shader_family_taxonomy_and_lua_authoring_model.md`
- `docs/decisions/dr-0028_generic_visibility_range_components.md`
- `docs/decisions/dr-0030_non_physics_world_spatial_components.md`,
  `dr-0035_f64_world_coordinates.md`
- `docs/decisions/dr-0013_action_acceptor_control_routing.md`
- `docs/systems/core_systems_catalog_v1.md` (generic-vs-specific system inventory)
- `AGENTS.md` §3.5 (Lightyear fork policy)
- Audit source: this refactor's originating workspace separation audit (2026-06-02).
