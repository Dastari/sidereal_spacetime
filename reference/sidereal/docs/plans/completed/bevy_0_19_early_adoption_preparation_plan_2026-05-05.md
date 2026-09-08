# Bevy 0.19 Early Adoption Preparation Plan - 2026-05-05

Status: Implemented
Lifecycle: completed
Category: plan
Last updated: 2026-07-05
Owners: implementation owners
Scope: Bevy 0.19 adoption preparation and gating assessment for Sidereal — current dependency state, the upstream blockers, the migration surface, and the adoption runbook for when the gate clears.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- `Cargo.toml`, `Cargo.lock`
- `bins/sidereal-client/Cargo.toml`, `bins/sidereal-replication/Cargo.toml`, `crates/sidereal-game/Cargo.toml`, `crates/engine-runtime-sync/Cargo.toml`, `crates/engine-ui/Cargo.toml`
- `bins/sidereal-client/src/runtime/screen_effects.rs` (live custom render-graph post-process — the RenderGraph→systems migration target)
- `/root/lightyear-sidereal/Cargo.toml` (the netcode fork)
- Bevy 0.19 release announcement: https://bevy.org/news/bevy-0-19/
- Bevy 0.18→0.19 migration guide: https://bevy.org/learn/migration-guides/0-18-to-0-19/
- Bevy releases: https://github.com/bevyengine/bevy/releases
- Lightyear Cargo.toml (upstream Bevy pin): https://github.com/cBournhonesque/lightyear/blob/main/Cargo.toml
- avian2d compat: https://github.com/avianphysics/avian/blob/main/README.md

## 0. Status Notes

**2026-06-20 (current — verified):**

- **Bevy 0.19 IS released** (2026-06-19; 261 contributors, 1,185 PRs). The official 0.18→0.19 migration guide is published. The 2026-05-05 notes below are retained for provenance but are superseded by this section.
- **A full Bevy 0.19 update is GATED — do not bump yet.** It is blocked by **two** upstream dependencies that both still target Bevy 0.18 and have **no visible 0.19 work**: the **Lightyear** netcode fork and **avian2d** physics. Cargo requires a single Bevy major across the whole dependency graph, so 0.19 cannot compile until both clear. See §2A.
- The Sidereal-side migration is **meaningfully de-risked**: the client feature-split prep landed, and the v0.2.50 screen-effect refactor consolidated *all* custom render-graph code into one module (`screen_effects.rs`) — which is exactly Bevy 0.19's biggest migration hotspot (RenderGraph→systems). The migration surface is mapped (§3).
- Current pins: workspace `bevy`/`bevy_remote` `0.18.0` (lockfile `0.18.1`); `avian2d 0.6.1`; `bevy_svg 0.18.0`; `lightyear 0.26.4` from the `Dastari/lightyear` fork at rev **`ca6ef03724f3ab75cbc5dbcb61f67655806ed662`** (branch `sidereal/harden-wire-decode`).

**2026-05-05 (historical — pre-release prep):**

- Pre-release migration preparation only; Sidereal remained on Bevy 0.18 with no dependency bump. At that date the `0.19` GitHub milestone was open, the newest release was `v0.18.1` (2026-03-02), and no official `0.18 to 0.19` migration guide existed yet. Preparation was deliberately conservative: explicit client feature declarations plus local isolation of the render-graph registration point (the latter has since been superseded by the data-driven screen-effect refactor — see §3).

## 1. Current Sidereal Bevy Usage

Workspace dependency declarations / resolved versions:

- `Cargo.toml`: `bevy = { version = "0.18.0", default-features = false }`, `bevy_remote = { version = "0.18.0", default-features = false }`. No `[patch]` section — Bevy is unpatched; the only forked dep is Lightyear (git pin).
- `Cargo.lock` resolves: `bevy`/`bevy_remote` → `0.18.1`; `bevy_svg` → `0.18.0`; `avian2d` → `0.6.1`; `lightyear` → `0.26.4` from `Dastari/lightyear` at `ca6ef03724…` (branch `sidereal/harden-wire-decode`).
- `bevy_enhanced_input 0.24.4` is **transitive via the Lightyear fork**, not a direct Sidereal dep.

Crates/bins using Bevy: bins `sidereal-client` (full `["2d","ui","audio","webgpu","mp3"]` + native `bevy_remote/http`), `sidereal-replication` (headless `["bevy_asset","bevy_log","bevy_mesh","bevy_scene","serialize"]` + `bevy_remote/http`, `ScenePlugin`/`RemotePlugin`); crates `sidereal-game`, `sidereal-net`, `engine-render`, `engine-ecs`, `engine-physics`, `engine-gameplay`, `engine-spatial`, `engine-ui`, `engine-runtime-sync`, `engine-content`, `engine-transport`, `sidereal-shader-preview`. The gateway and persistence-service bins are Bevy-free.

Major Bevy API surfaces in active code:

- **UI:** `Node`, `Text`, `Interaction`, `BackgroundColor`, `BorderColor`, `BoxShadow`, `FocusPolicy`, `RelativeCursorPosition`, state-scoped UI entities, custom auth text input, custom button/focus handling.
- **Rendering/materials:** `Material2d`, `Material2dPlugin`, `AsBindGroup`, `ShaderRef`, `Mesh2d`, `MeshMaterial2d`, custom WGSL shader assets, streamed shader assignment, generated `Image` assets with explicit `RenderAssetUsages` — spread across ~21 client `runtime/` files (backdrop, starfield, lighting, sensor_ring, visuals/*, shaders.rs) plus `engine-content`.
- **Custom render-graph post-process (the hotspot):** consolidated in `bins/sidereal-client/src/runtime/screen_effects.rs` (318 lines) — the `ScreenEffectNode` `ViewNode` + `add_render_graph_node::<ViewNodeRunner<ScreenEffectNode>>(Core2d, …)` / `add_render_graph_edges` wiring (~L126-127), `FullscreenShader`, `ViewTarget`, `ComponentUniforms`. `explosion_distortion.rs` is now **content-only** (writes shockwave lane params; no pipeline/`ViewNode`).
- **Serialization/persistence:** `AppTypeRegistry`, `ReflectComponent`, `ReflectCommandExt`, `TypedReflect{De,}serializer`, `Reflect{Serialize,Deserialize}`, `TypeRegistry`, component type-path mapping through graph records (replication hydration).
- **ECS/runtime:** `Component`, `Resource`, `Query`, `Res`, `ResMut`, `Commands`, `RemovedComponents`, `Message{Reader,Writer,Cursor}`, `ChildOf`, `Children`, `On<Add, Children>`, `FixedUpdate`, `FixedPreUpdate`, `Time<Fixed>`, `State`, `NextState`, `OnEnter`, `OnExit`, `DespawnOnExit`.
- **Networking ecosystem:** Lightyear and Avian are both Bevy-version-coupled and must move with Bevy.

## 2. Bevy 0.19 — Confirmed Facts (released 2026-06-19)

Headline themes from the announcement: Next-Generation Scenes (BSN), GPU-driven rendering ("Render Bigger Scenes Faster"), Contact Shadows, more Feathers UI widgets, Text Input + Richer Text, App Settings, post-processing effects (Vignette + Lens Distortion), improved skinned-mesh culling, and the architectural **RenderGraph → ECS schedules** change. A tracked "0.19 performance regression" was **rendering-only and resolved before release** (no headless/server impact).

### 2A. THE GATE — two upstream blockers (the real reason we cannot bump)

A 0.19 bump will **not compile** until both clear; Cargo cannot unify two Bevy majors in one graph.

1. **Lightyear (forked netcode) — on Bevy 0.18.** Upstream `cBournhonesque/lightyear` `main` pins `bevy = "0.18"` (lightyear `0.26.4`); the only 0.19-ish attempt (`bevy-main` branch) is ~14 months stale (last commit 2025-03-23). Our `/root/lightyear-sidereal` fork is **26 commits ahead** of upstream with load-bearing patches concentrated in `lightyear_replication`/`_transport`/`_prediction`/`_interpolation`/`_sync` (custom server-input lane, f64-avian visual correction, delta-ack monotonicity, deeper input/interpolation/prediction history, wire-decode hardening). A 0.19 move is therefore **two-stage**: (a) a Bevy-0.19 Lightyear must exist (wait for upstream, or port in-fork), then (b) the 26-commit fork patch set must be re-applied onto it — a non-mechanical rebase through the hardest-to-rebase subsystems.
2. **avian2d (physics) — on Bevy 0.18.** Avian's compat table caps at Bevy 0.18 (Avian 0.5–0.6 + `main` → 0.18; no 0.19 release). The fork's f64-avian visual-correction patch depends on it.

Other third-party Bevy crates (`bevy_svg 0.18.0`, anything surfaced by `cargo tree -i bevy`) should be assumed 0.18-or-earlier until individually verified. Ecosystem lag of weeks-to-months after a major Bevy release is normal.

### 2B. Migration / breaking changes — relevance-ranked (from the official 0.18→0.19 guide)

**Tier 1 — ECS core (hits everywhere):**

- **Resources as Components** *(highest effort)* — resources now implement `Component` and live on singleton entities. Any type deriving **both** `Resource` and `Component` must be split. Resources gain hooks/observers/relationships.
- **Broad queries now conflict with resource access** — `Query<()>`/`Query<Entity>` and similar conflict with resource access; fix with `Without<…>` filters. Watch for new ambiguity/conflict panics in "iterate all entities" systems.
- **`#[reflect(Resource)]` → `ReflectResource` is now a ZST**; reflected resources use `ReflectComponent` *(directly relevant to reflection-driven persistence/registry hydration).*
- Immutable-resource `Mutability = Mutable` bound on generic resource params; `init_non_send_resource`→`init_non_send`; `System::type_id`→`System::system_type`; `Schedule::set_executor` replaces `ExecutorKind`; SystemParam validation moved to data-fetch time; `Access` `add_read`/`add_write` split; observer lifecycle events carry `old_archetype`/`new_archetype`; `DefaultErrorHandler`→`FallbackErrorHandler` (deprecated alias one release); **`MapEntities` no longer needed on resources** (remove the derive — relevant to replication); `Plugin`/`add_plugins` signature change (we have several custom plugins).

**Tier 1 — netcode/persistence-adjacent:**

- **`bevy_scene` → `bevy_world_serialization`** — Scene→World rename (`DynamicScene`→`DynamicWorld`, `SceneSpawner`→`WorldInstanceSpawner`, `SceneRoot`→`WorldAssetRoot`), and builders now require an explicit `&TypeRegistry`. Hits replication's `ScenePlugin`/reflected-component hydration roundtrips.
- Command error-handling rework (custom `Command` impls); new delayed commands API (additive); **`Task` drop now cancels on WASM** — call `.detach()` to keep old behavior (flag for shader-preview WASM; game-client WASM parity is deprioritized).

**Tier 2 — custom rendering / WGSL / materials:**

- **RenderGraph → ECS schedules** *(the big render lift)* — custom render nodes become systems in render-world schedules (`Core2d`/`Core3d`). Our post-process is consolidated in `screen_effects.rs`, so this rewrite **starts and ends in one module**.
- **Post-process split into `EarlyPostProcess` + `PostProcess`** (2D + 3D) — re-anchor our effect pass against the new sets (note the topmost-camera ping-pong-target subtlety: same-window cameras share the ping-pong target).
- **New `bevy_material` crate** (Material types moved out of `bevy_pbr`/`bevy_render`); **`ShaderStorageBuffer`→`ShaderBuffer`**; `bevy_shader` cleanups (`ShaderCache::new` needs `RenderDevice`); **`RenderSystems::ManageViews` split** (`CreateViews`/`Specialize`/`PrepareViews`); **mesh view bind-group layout + pipeline-key changes** (`from_primitive_topology_and_strip_index` — regenerate custom pipeline keys or pipelines silently break); `RenderMeshInstance` atomic (use accessors); `ExtractComponent` refactor + resources created in `RenderStartup` (order after `MeshPipelineSystems`); HDR moved to `bevy_camera` (`ExtractedCamera::hdr`, `ExtractedView::target_format`); **`FullscreenMaterial` `run_in/after/before` → `schedule_configs`** (full-screen passes are exactly our post-process); new `RenderErrorHandler` (additive, worth adopting).

**Tier 2 — 2D-specific:** no large `bevy_sprite` data-layout break in the guide; 2D breakage is indirect (post-process split on 2D, render-graph-as-systems `Core2d`, camera/HDR/target-format moves). New world-space `Gizmos::text`/`text_2d` debugging is additive.

**Tier 3 — assets / features / misc (broad but mechanical):**

- **Feature-flag reshuffle (will break Cargo.toml feature lists):** `audio` no longer implied by `2d`/`3d`; **`ui` no longer implied by `2d`/`3d`**; `bevy_picking` no longer pulls `bevy_input_focus`; `WgpuSettingsPriority::Compatibility`→`WebGPU` (`WGPU_SETTINGS_PRIO=webgpu`). Audit every crate's feature list — relevant to the headless server's stripped features.
- Asset API: `AssetPath::resolve(_embed)` take `&AssetPath` (string variants `resolve_str`/`resolve_embed_str`); `get_full_extension`→`Option<&str>`; `AssetServer::load` builder variants; `AssetSaver` signature change; runtime `save_using_saver` (additive).
- Reflection reorg (`bevy_reflect` module split; `DynamicStruct::index_of`→`Struct::index_of_name`; `FieldIter` yields `(name, field)`); `rand`/`glam`/`uuid` bumps (`rand` `RngCore`→`Rng`, `Rng`→`RngExt` ripples into direct `rand` use).
- **Text system `cosmic_text`→`parley`** — a real migration if the native client renders text.

## 3. Sidereal-Side Migration Surface (mapped; starts when the gate clears)

Ranked by effort/risk:

1. **Resources-as-Components split** — broadest ECS churn; audit every `Resource`+`Component` type and broad `Query<Entity>` vs resource-access conflicts. Behavior-preserving.
2. **RenderGraph→systems + post-process split** — `bins/sidereal-client/src/runtime/screen_effects.rs` (the `ScreenEffectNode` ViewNode + graph wiring) ported to render-world systems; re-anchor against `EarlyPostProcess`/`PostProcess`. Now isolated to one module (the v0.2.50 refactor did the consolidation the 2026-05-05 prep wanted; the old `register_explosion_distortion_render_path/graph` isolation point no longer exists).
3. **Custom 2D materials / WGSL** — `bevy_material` import moves, `ShaderStorageBuffer`→`ShaderBuffer`, regenerated pipeline keys across ~21 client files + `engine-content`; runtime visual re-validation (Lighting V2 contract).
4. **Reflection / world-serialization persistence** — `bevy_scene`→`bevy_world_serialization`, explicit `&TypeRegistry`; graph-hydration roundtrip tests (need lightyear `ServerPlugins`; sidereal-replication tests run via `--bins`).
5. **BRP / `bevy_remote`** — re-verify feature names + API across replication/native-client/gateway-admin.
6. **Feature-flag audit** — `ui`/`audio` no longer implied by `2d`; the headless server's stripped feature set.
7. **avian2d 0.6.1 → 0.19** and **bevy_svg 0.18.0 → 0.19** (or replace) — version-locked to Bevy.
8. **Text `cosmic_text`→`parley`** if native UI renders text; **WASM** re-check (deprioritized).

## 4. New 0.19 Features Worth Adopting (post-upgrade)

Ranked by relevance to a server-authoritative 2D space MMO:

- **Resources-as-Components + observer `run_if()` + relationship event propagation** — react to config/state-resource changes and entity lifecycle (ship spawn/destroy, mount attach/detach), propagate along `ChildOf` mount graphs with observers instead of polling systems. Cleanest win.
- **`contiguous_iter`/`_mut`** (SIMD-friendly contiguous query access) — potential **server-tick** perf win on hot loops (positions/velocities) at MMO entity counts; relevant to the shelved idle-CPU/uncapped-Update-loop optimization.
- **Delayed commands** (`commands.delayed().secs(n).spawn(...)`) — projectile TTL, respawn/debris timers without bespoke timer components.
- **App Settings** (`SettingsPlugin`, auto-persist) — native-client config (graphics/audio/keybinds).
- **GPU-driven rendering** — client-only win for dense scenes (asteroid fields, large fleets); zero server impact.
- **Post-FX: Vignette + Lens Distortion** — drop-in cockpit/cinematic framing alongside the custom post-fx.
- **Text Input (`EditableText`) + Feathers widgets (now stable)** — native chat/console/name-entry (note the `cosmic_text`→`parley` migration cost).
- **Watch, don't adopt:** Next-Gen Scenes / BSN ships **code-driven only** in 0.19 (no `.bsn` asset loader), so it does not replace the asset-driven content pipeline yet.

## 5. Adoption Checklist (perform only once the §2A gate clears, on a dedicated adoption branch)

1. **Confirm the gate is open**: a Bevy-0.19 Lightyear release exists (or port the fork) **and** avian2d has a 0.19 release. Refresh the official migration guide + release notes.
2. **Update version-coupled deps together**: workspace `bevy`/`bevy_remote`; `avian2d`; `bevy_svg` (or replacement); the `Dastari/lightyear` fork (re-apply the 26-commit patch set onto a 0.19 base — keep patches generic/upstreamable where possible); anything from `cargo tree -i bevy`.
3. **Re-check feature/crate-split names**: client UI/audio/WebGPU/MP3 explicit features; replication `bevy_scene` vs `bevy_world_serialization`; `bevy_remote/http`; the `2d`-no-longer-implies-`ui`/`audio` reshuffle.
4. **Port the render-graph post-process** in `screen_effects.rs` to render-world systems; re-anchor against `EarlyPostProcess`/`PostProcess`; regenerate custom pipeline keys; fix `bevy_material`/`ShaderBuffer` import churn; preserve shader handles, uniform layouts, and visual behavior.
5. **Fix compile errors by subsystem, behavior-preserving**: features/imports → render/material/WGSL → UI/text/focus → world-serialization/reflection → ECS resources/commands/messages → Lightyear/Avian.
6. **Re-run targeted runtime validation** (see §6).

## 6. Validation Matrix

```bash
# Adoption-branch checks after the actual Bevy 0.19 bump
cargo tree -i bevy
cargo tree -e features -p sidereal-client | rg 'bevy|bevy_ui|bevy_audio|webgpu|mp3'
cargo fmt --all -- --check
CARGO_INCREMENTAL=0 cargo clippy --workspace --all-targets -- -D warnings
CARGO_INCREMENTAL=0 cargo check --workspace
CARGO_INCREMENTAL=0 cargo check -p sidereal-client --target wasm32-unknown-unknown --features bevy/webgpu
CARGO_INCREMENTAL=0 cargo check -p sidereal-client --target x86_64-pc-windows-gnu
```

Runtime scenarios for the adoption branch:

- Replication server + native client: startup, auth, character selection, world entry.
- Native controlled movement + prediction stability with no new transform-repair path or authority widening.
- Streamed visuals, generated procedural asteroid images, custom `Material2d` paths, runtime WGSL assignment.
- Screen-effect / explosion-distortion post-process renders and does not crash on cameras without active effects.
- Tactical map, nameplates, notification/dialog UI, auth input focus, debug overlay after Bevy UI/text changes.
- Graph persistence/hydration tests still roundtrip reflected components and do not depend on raw Bevy `Entity` IDs.
- WASM target compiles with WebGPU enabled (live browser validation may remain deferred if compile-only and documented).

## 7. Acceptance Criteria

- Mainline stays on Bevy 0.18-compatible deps until the §2A gate clears and a dedicated adoption branch lands.
- The client does not rely on Bevy `2d` implicitly enabling UI/audio.
- The post-process RenderGraph hotspot remains consolidated in `screen_effects.rs` so the 0.19 rewrite starts in one module.
- This document remains the source of truth for Bevy 0.19 adoption until replaced by an official 0.19 migration implementation plan, and is kept current with upstream Lightyear/avian2d 0.19 readiness.
- No runtime behavior, authority model, persistence contract, replication contract, or asset delivery behavior changes during preparation.

## Closure Note (2026-07-05)

Shipped. The upstream gate cleared and the migration completed 2026-06-27: lightyear fork mainline `main` @ `a608a099` (Bevy 0.19-native, project-agnostic with opt-in fork extensions), game workspace on Bevy 0.19 + avian 0.7, client v0.2.57 published. See `docs/plans/completed/lightyear_fork_bevy_0_19_migration_plan_2026-06-25.md` and `docs/plans/completed/lightyear_fork_bevy_0_19_game_migration_handoff_2026-06-25.md`.
