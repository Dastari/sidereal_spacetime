# DR-0045: Engine / Content Separation Achieved — The Deletion Test Passes

Status: Active
Lifecycle: source-of-truth
Category: decision
Last updated: 2026-06-04
Owners: architecture
Scope: DR-0045: Engine / Content Separation Achieved — The Deletion Test Passes.
Source of truth: yes
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

Date: 2026-06-03
Owners: architecture

Primary references:
- `docs/plans/completed/engine_content_separation_refactor_plan_2026-06-02.md` (the execution plan;
  WIs, decisions D1–D6, §7 tracker)
- `docs/decisions/dr-0041_generic_lua_authored_shader_parameter_schema.md` (the reuse goal
  this refactor generalised beyond shaders to the whole workspace)
- Branch `refactor/engine-content-separation`

## 1. Context

DR-0041 §2 set the north star: *"the backend should be reusable for non-space projects
with no space code compiled into it."* The engine/content separation refactor
(plan `..._2026-06-02.md`) generalised that from shaders to the entire Rust workspace and
defined a **deletion test** as the definition of done:

> Delete `sidereal-game` and `data/`, and the `engine-*` crates still compile and pass
> their own tests. Nothing in any `engine-*` crate names a space concept (ship, thruster,
> asteroid, planet, star, flight, gnc, weapon, hardpoint, warp, genesis, ore, mining).

The committed scope (P0 + WI-1 → WI-7) killed all four dependency-direction violations;
the opportunistic Phase 5 (WI-8/9/10/11a–c/11e) and the WI-15 rename pass then moved the
trapped generic machinery into neutral crates and renamed the already-generic crates.
WI-13 is the capstone: actually run the deletion test and record the achieved boundary.

## 2. Decision

The engine/content boundary is **achieved and validated**. The workspace splits cleanly:

### 2.1 The achieved boundary

**Engine (project-agnostic — the deletion test passes over these 17 crates + shader-preview):**

`engine-ecs`, `engine-gameplay`, `engine-physics`, `engine-render`, `engine-spatial`,
`engine-script`, `engine-transport`, `engine-core`, `engine-audio`, `engine-observability`,
`engine-ui`, `engine-ghost-lane`, `engine-component-macros`, `engine-persistence`,
`engine-persistence-protocol`, `engine-asset-runtime`, `engine-runtime-sync`
(+ `sidereal-shader-preview`, content-adjacent — embeds Sidereal shader defaults, correctly
`sidereal-`-named; see §4).

These carry no space vocabulary (the `engine-boundary-guard` lint passes over all of them),
and none depends on content at the library level.

**Content / app (depends on engine; engine never depends on it):**

`sidereal-game` (ships, thrusters, asteroids, planets/stars, flight/GNC, weapons, factions,
mining, the concrete component schemas + Lua decoders), `sidereal-net` (the space message
catalog — a deliberately `sidereal-`-prefixed *content protocol* crate per the WI-6/D6
refinement), `data/scripts` + `data/shaders` (authored Lua + WGSL content), and the four
binaries (`sidereal-replication`, `sidereal-gateway`, `sidereal-client`,
`sidereal-persistence-service`).

### 2.2 The four dependency violations are dead

- **V1** (`sidereal-net` → `sidereal-game`): resolved by extracting game-free
  `engine-transport` and reframing `sidereal-net` as a content protocol crate — **WI-6** (`e75118e`).
- **V2** (`sidereal-scripting` → `sidereal-game`): resolved by splitting the Lua host into
  `engine-script` — **WI-4** (`8be2402`).
- **V3** (`sidereal-runtime-sync` → `sidereal-game`): resolved by repointing at `engine-ecs` —
  **WI-3** (`eef7dd6`).
- **V4** (`sidereal-asset-runtime` → scripting → game): fell as a side effect of WI-4 and was
  finished by **WI-5** (`bd9ce5c`).

(`sidereal-core`'s hardcoded planet/asteroid GUID-remap data was also moved to game — **WI-12**,
`80046f6` — and the persistence schema rules were de-hardcoded into an injected/artifact path —
**WI-7**, `f8fc7de`.)

### 2.3 The deletion test result — PASS, zero leaks

Run in a throwaway `git worktree` at `HEAD` (no deletions committed to the branch). Removed
the `sidereal-game`/`sidereal-net` crates, the four bins, and `data/scripts` + `data/shaders`
from the workspace; **kept `data/generated/`** (engine DATA inputs, not code — see §2.4).

- **`cargo check --workspace` (stripped): green.** All 17 `engine-*` crates and
  `sidereal-shader-preview` **compiled** with content gone. **Zero leaks** — no engine crate
  failed to compile because it needed a `sidereal-game` type. The `engine-boundary-guard` lint
  passes over all engine crates (no space vocabulary).
- **`cargo test` (stripped): all engine *libraries* and unit tests pass.** Tests pass for
  `engine-core`, `engine-ecs`, `engine-render`, `engine-persistence`,
  `engine-persistence-protocol`, `engine-asset-runtime`, `engine-runtime-sync`, `engine-script`
  (lib + `asset_registry`), and the rest.

Three **test-fixture couplings** (not library leaks, not boundary violations — the libraries
compile and the boundary guard is clean; these are integration tests that read deleted authored
content or a deleted fixture crate):

1. `engine-script` integration test `loads_shared_audio_registry_from_workspace_scripts`
   reads `data/scripts/` to validate the loader against real authored content. Fails only
   because the authored Lua was deleted; the `engine-script` library is game-free.
2. `sidereal-shader-preview` test `extracts_uniforms_from_default_nebula_shader`
   `include_str!`s the deleted authored shader `data/shaders/space_background_nebula.wgsl`
   (test-only; the library compiled). This reinforces the §4 follow-up that shader-preview still
   carries space vocabulary in `native.rs`.
3. A **pre-existing** (refactor-unrelated) failure: `engine-ghost-lane`'s `lib.rs` test module
   uses `uuid::Uuid` without `uuid` as a dev-dependency, so `cargo test -p engine-ghost-lane`
   fails to compile its test binary. **This reproduces identically on the branch with content
   fully present** — it is a missing dev-dependency, not a deletion-test result.

Bottom line: **the compilation pass condition is met with zero leaks.** The remaining test
failures are content-fixture couplings (expected: the tests assert against deleted authored
content) and one pre-existing dev-dep gap.

### 2.4 The documented `data/generated/` data dependency (NOT a leak)

`data/generated/` was deliberately **kept** during the deletion test because it holds committed
*engine data inputs*, not game code:

- **`engine-render`** bundles `data/generated/shader_parameter_layouts.json` via
  `include_str!` (`crates/engine-render/src/shader_parameter_layout.rs:34`). This is the only
  `include_str!` of `data/generated/` from any engine crate.
- `data/generated/persistence_schema_rules.json` is **not** `include_str!`'d by `engine-persistence`
  (whose `PersistenceSchemaRules::default()` is intentionally empty); it is loaded at runtime by
  **`sidereal-game`** (`crates/sidereal-game/src/persistence_schema.rs`) and injected. So the only
  engine-crate compile-time dependency on `data/generated/` is `engine-render`'s shader-layout
  artifact.

These artifacts are produced from Lua by `sidereal-game`'s generator bins
(`gen_shader_parameter_layouts`, `gen_persistence_schema_rules`) and committed; the engine reads
the committed JSON. This is the expected, documented data dependency — an engine consuming a data
file is reuse, not a content code leak.

## 3. Deliberate exceptions and content-coupling findings

Captured from the §7 tracker so the boundary is honestly described:

- **`PlanetBodyShaderSettings` stays typed in `sidereal-game`** — a deliberate exception
  (DR-0041 §7); the other typed `*ShaderSettings` structs are gone (migrated to the generic
  `ShaderParameterSet`). Do not "fix" it.
- **Lighting stays in `sidereal-game`** — WI-14 is **won't-do** (D5). `environment_lighting_state`
  / `stellar_light_source` carry `stellar` naming and are content; the deletion test passes with
  lighting as content, so the rename churn of the shipped Lighting V2 contract is not justified.
- **`MountedOn` stays in game** (WI-11c, `0784997`): its `hardpoint_id` field is content (a named
  mount slot). Only the generic `ParentGuid` moved to `engine-ecs`. **`sync_mounted_hierarchy`
  stays in game** for the same reason.
- **`visibility_range.rs` stays in game** (WI-11b, `76f46fe`): the five generic visibility
  *components* moved to `engine-spatial`, but the range *system module* stayed.
- **`procedural_sprite_generation` stays content** (WI-10): the RDP collision-outline hull moved
  to `engine-physics`, but the asteroid-silhouette sprite generation is space content.
- **WI-11d (character movement + `EntityAction`) is DEFERRED**: the `EntityAction` enum welds
  generic verbs to space-specific actions (weapon/afterburner/tractor/scanner) and `ActionQueue`
  holds it, so this needs a DR-0013 re-architecture (split the action enum), not a mechanical move.
  Out of opportunistic scope.
- **The `b"sidereal-audio-registry-v1"` hash seed is kept** in `engine-audio`
  (`crates/engine-audio/src/lib.rs:16`) — a stable wire/format seed string, intentionally left
  intact through the WI-15 rename (renaming it would change the hash).

### Open follow-ups (not blocking; recorded for honesty)

- **`sidereal-shader-preview` is content-adjacent and correctly keeps the `sidereal-` prefix
  (reclassified 2026-06-03).** Earlier the audit guessed it was a misnamed generic crate. On
  inspection it is **mixed**: the core (`validate_wgsl_source`, the preview render pipeline in
  `lib.rs`) is generic, but `native.rs` embeds a **Sidereal-specific shader default-value table**
  (`runtime_fallback_default_values` / `infer_default_values`: `starfield`/`asteroid`/`ore`/
  `stellar` parameter defaults, ~21 space-specific lines) used to render standalone previews of
  *Sidereal's* shaders. By the RPG test an RPG would not reuse it unchanged, so it stays
  `sidereal-`-named (no boundary violation — the boundary guard only scans `engine-*`). A fully
  generic `engine-shader-preview` would require **injecting** those defaults from the shader
  schema/game rather than hardcoding them (a small seam, like the mass-contributor seam), changing
  the preview API + dashboard consumers — deferred as optional future work, not a gap.
- **Pre-existing protocol-guard test drift (`87` vs `85`).** `sidereal-net`'s
  `lightyear_protocol_guard_requires_intentional_protocol_updates` asserts
  `GUARDED_REPLICATION_COMPONENT_COUNT = 87` (`crates/sidereal-net/tests/lightyear_protocol.rs:24`)
  while the replicated set is 85. This drift predates and is unrelated to this refactor (guard last
  bumped on `main` `33db20f`; the set later changed without updating the guard). Needs a separate
  reconcile commit so CI is green; out of refactor scope.
- **`engine-ghost-lane` missing `uuid` dev-dependency** (surfaced in §2.3): **RESOLVED
  2026-06-03** — added `uuid.workspace = true` to `[dev-dependencies]`; `cargo test -p
  engine-ghost-lane` now compiles and passes (9 tests). Unrelated to the boundary.

## 4. Consequences

- **Positive:** the engine is reusable for any top-down, grid/coordinate-based game with **no
  space code compiled in** — proven, not asserted. All four direction violations are gone and the
  compiler now enforces the one-way boundary (an engine crate cannot depend on content without a
  rejected cycle), backed by the `engine-boundary-guard` vocabulary lint. A team could fork
  `engine-*` + `data/generated/` and build a different game on top.
- **Negative / residual:** the deletion test passes for *compilation and unit tests*, but a few
  integration tests assume the authored content fixtures (`data/scripts`, `data/shaders`) and one
  fixture crate are present — they are content-coupled by design and would need their fixtures
  swapped to run against a different game. Only the protocol-guard drift remains open (the
  shader-preview crate was reclassified content-adjacent, and the `engine-ghost-lane` dev-dep was
  fixed). Lighting and a handful of named-slot/sprite modules remain deliberately as content.

## 5. Maintenance notes

- New machinery that a top-down RPG would reuse unchanged goes in an `engine-*` crate; anything
  naming a space concept goes in `sidereal-game` / `data/`. The `engine-boundary-guard` lint and
  the one-way dependency edges enforce this — keep them green.
- When touching `data/generated/`, remember `engine-render` `include_str!`s the shader-layout
  artifact: regenerate it via `sidereal-game`'s generator bin and keep it byte-current
  (`shader_parameter_layouts_artifact_is_current`).
- To re-run the deletion test: `git worktree add /tmp/deltest HEAD`, drop the content members
  from the worktree `Cargo.toml`, delete the content crates/bins + `data/scripts`/`data/shaders`
  (keep `data/generated/`), strip the `engine-runtime-sync` `sidereal-game` *dev*-dependency + its
  one fixture test, then `cargo check --workspace`. Pass = all engine crates compile; any
  compile failure that names a `sidereal-game` type is a real leak.
