# Prompt: Engine vs Sidereal code-separation audit (project-agnostic engine)

Status: Reference
Lifecycle: reusable-prompt
Category: prompt
Last updated: 2026-06-04
Owners: documentation
Scope: Prompt: Engine vs Sidereal code-separation audit (project-agnostic engine).
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

Paste the section below as the opening prompt of a fresh agent session. It is
self-contained (assume the agent has no prior context).

---

You are auditing the `/root/sidereal` Rust workspace for **code separation**. This
is a **read-only investigation and report** — do NOT modify code, move files, or
implement anything. Ground every claim in concrete file paths / crate names.

## The goal (the lens for the whole audit)

The owner wants the **game engine to be project-agnostic for any top-down,
grid/coordinate-based game**. Concretely:

- **Generic engine concerns** — physics, ECS scaffolding, world/grid coordinates &
  spatial partitioning, replication/transport, prediction/reconciliation, asset
  delivery & cache, the Lua scripting/content-authoring host, the component
  registration/macro system, persistence, rendering material/shader *families*
  (the generic pipeline, not the content), input/control routing, camera, audio
  runtime — should live in **reusable core/service crates** with **no Sidereal
  (space-game) specifics compiled in**.
- **Sidereal-specific content** — ships, thrusters, asteroids, planets/stars,
  space flight GNC, factions, mining/ore, weapons, the space setting, genesis
  bodies, and the concrete component *schemas* for those — should live in
  **`crates/sidereal-game`** (and Lua content under `data/`).

**Hypothetical test to apply throughout:** imagine you wanted to reuse this engine
to build a **top-down RPG like Secret of Mana or Final Fantasy** (tiles/grid,
characters, NPCs, items/inventory, melee/spell combat, towns, dialog, no
spaceships). For each engine concern ask: *"would the RPG reuse this unchanged, or
is it Sidereal-specific?"* The cleanly-separated end state is: **delete all the
space content and a working generic top-down engine remains.** Use this to find
both (a) Sidereal specifics leaking into supposedly-generic crates and (b) generic
engine machinery trapped inside `sidereal-game`.

This is the same intent as the project's own DR-0041 ("the backend should be
reusable for non-space projects with no space code compiled into it") — check how
far that principle already extends beyond shaders.

## Orient yourself first

- Read the workspace `Cargo.toml` and enumerate every member of `crates/` and
  `bins/` authoritatively (don't assume the list). For each, read its `Cargo.toml`
  to get its dependency edges (especially which crates depend on
  `sidereal-game`, and whether any "core/service" crate does).
- Read these for the existing system taxonomy & stated intent:
  - `docs/systems/core_systems_catalog_v1.md` (the labelled systems — a ready-made
    generic-vs-specific inventory; note which are presentation/runtime/engine vs
    gameplay/content).
  - `docs/decisions/dr-0041_generic_lua_authored_shader_parameter_schema.md`,
    `dr-0029_*`, `dr-0027_*` (the rendering genericisation + the "no space struct
    in the backend" goal).
  - `AGENTS.md` and any `docs/` architecture/overview docs.
- Note: the working tree has substantial **uncommitted** work — a `ShaderParameterSet`
  generic-shader migration (space background / starfield / effect moved off typed
  structs; `PlanetBodyShaderSettings` kept as a deliberate exception) and a new
  shader-procedural asteroid + damage-driven fracture. Treat the current files as
  the source of truth. Build/check per-crate; do NOT rely on `cargo check
  --workspace` (an unrelated in-progress `bins/sidereal-replication` `synthetic_load`
  module currently breaks the full workspace build).

## What to investigate and answer

1. **Crate inventory & dependency graph.** For each crate/bin: one-line purpose,
   and classify it as *generic-engine*, *Sidereal-specific*, or *mixed*. Draw the
   dependency edges and flag any **direction violation**: a crate that *should* be
   generic (core/net/asset-runtime/scripting/persistence/audio/etc.) that depends
   on `sidereal-game` or otherwise compiles Sidereal concepts.

2. **Leakage OUT of generic crates** (the worst kind): Sidereal-specific names
   (ship, thruster, asteroid, planet, star, mining/ore, faction, weapon, hardpoint,
   warp, genesis, "space") appearing in crates meant to be generic. List each with
   file:line and assess whether it's truly engine-generic, a thin coupling that can
   be parameterised, or hard Sidereal content that must move to `sidereal-game`.

3. **Generic machinery trapped IN `sidereal-game`** (the RPG would need it):
   physics setup (avian2d integration), mass/inertia derivation, collision
   profile/outline generation, spatial partitioning / world coordinates / grid,
   the component macro + registry + Reflect/replication plumbing, hierarchy &
   mounting, render-layer/world-visual/post-process *framework* (vs the space
   shaders), lighting framework, the generic `ShaderParameterSet` system,
   character movement, inventory framework, destructible/health lifecycle, the
   editor-schema framework. For each: is it generic enough to extract to a core
   crate, or is it entangled with Sidereal types? Identify the entanglements.

4. **Content vs framework inside data/Lua and scripting.** Where is the boundary
   between the Lua *host/contract* (generic) and the Sidereal *content* (`data/scripts/*`)?
   Does the scripting crate hardcode any Sidereal component kinds or schemas it
   shouldn't?

5. **The RPG thought-experiment, concretely.** Produce a short table: for the
   Secret-of-Mana/FF top-down RPG, list the major engine subsystems and mark
   KEEP-AS-IS (reusable today), KEEP-AFTER-EXTRACTION (generic but currently stuck
   in sidereal-game), or REPLACE (Sidereal content). Call out the biggest blockers
   to standing up a non-space game on this engine today.

## Deliverable (the report)

Write a findings report (in chat, and optionally propose saving it to
`docs/reports/`) containing:
- **Crate-by-crate classification table** (generic / specific / mixed + purpose +
  who depends on it).
- **Dependency-direction violations** (generic→sidereal-game edges), if any, ranked
  by severity.
- **Mis-placement list**, two buckets with file refs: (a) Sidereal specifics in
  generic crates to move *out*; (b) generic engine code in `sidereal-game` to
  extract *into* core. Each item: what it is, where it lives, where it should live,
  and how entangled it is (clean move / needs a trait or generic param / hard).
- **Recommended target architecture**: the desired crate boundaries for a
  project-agnostic top-down-grid engine (you may propose new crate names like
  `*-engine` / `*-physics` / `*-spatial`, or a re-grouping of the existing
  `sidereal-*` crates), with the dependency rule (`sidereal-game` and content
  depend on engine; engine never depends on them).
- **The RPG KEEP/EXTRACT/REPLACE table** and the top blockers.
- **A phased, low-risk extraction path** (what to separate first for the most
  reuse with least churn) + risks. Do not implement it — just plan it.

Constraints: read-only; cite files; prefer your own breadth tools; do not spawn
sub-agents unless the search genuinely fans out beyond what you can track. Be
honest where something is genuinely dual-use or where the line is a judgment call.
