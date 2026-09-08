# Asteroid Damage-Driven Progressive Fracture (V2)

Status: Implemented
Lifecycle: completed
Category: feature
Last updated: 2026-06-04
Owners: feature owners
Scope: Asteroid Damage-Driven Progressive Fracture (V2).
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

Date: 2026-06-01
Owners: gameplay simulation + client rendering + scripting + replication/persistence
System label: `system.asteroid_field.v2` (fracture evolution)
Supersedes: the random-offset child-spawn in `crates/sidereal-game/src/asteroid_field.rs`
(`build_fracture_child_plans` / `spawn_fracture_child`).

Primary references:
- `docs/features/active/asteroid_field_system_v2_contract.md` (§6 Fracture Contract — this evolves it)
- `docs/plans/proposed/asteroid_visual_generation_and_preview_plan_2026-06-01.md` (folds in its
  deferred Phase 4 convex-hull colliders + Phase 5 believable Voronoi fracture)
- `crates/sidereal-game/src/asteroid_field.rs` (current fracture)
- `crates/sidereal-game/src/components/asteroid_field_damage_state.rs`
- `crates/sidereal-game/src/combat.rs` (`ShotImpactResolvedEvent { impact_pos: DVec2, .. }`)
- `crates/sidereal-game/src/procedural_sprite_generation.rs` (shared silhouette / seed)
- `data/shaders/asteroid.wgsl` (shader-procedural asteroid; gets a crack pass)
- `data/scripts/asteroids/registry.lua` (`AsteroidFractureProfile`)

## 0. Status / scope

Implemented (2026-06-01). Phases 1–4 are in code and Phase 5 hardening is done.
Defines a damage-driven, *progressive* fracture model for asteroid
members: damage accumulates at impact sites, the rock visibly cracks along a
deterministic latent fracture network, and it sheds convex fragments along the
failed crack lines — slowly breaking apart rather than vanishing into N random
children at zero health. Server-authoritative; presentation is client-only.

Implementation notes / flags as shipped:
- Edge-stress storage resolved toward the **compact per-octant vector** (open-Q1),
  not a full per-edge `Vec<f32>` (`AsteroidMemberDamage.octant_stress`, 8 bins).
- The latent network is a fixed **7-site Voronoi** (`FRACTURE_SITE_COUNT`) built from
  the shared `f32` lobe phases for exact Rust↔WGSL parity (no `u64` on the GPU).
- Cell polygons are **clipped to a bounding disc** (`CELL_BOUND_RADIUS = 1.05`), not
  the noisy fBm silhouette — the per-pixel edge noise is not worth reproducing for a
  collider, and the body `discard` already trims the visible rock to the silhouette.
- Fracture **pacing is Lua-authored** on `AsteroidFractureProfile` (`stage_damage_gate`,
  `stage_cell_stress_threshold`, `max_cells_detached_per_tick`, `terminal_cell_count`,
  impulse range); the prior hardcoded constants remain the serde defaults.
- Detached **fragments are currently terminal** debris (open-Q2 — re-fracturable
  fragments / per-fragment latent networks — was not deepened this pass).
- Native + WASM (`wasm32-unknown-unknown`, `bevy/webgpu`) both build clean.

## 1. Goal and relationship to current fracture

Today: a member fractures only at zero `HealthPool`, despawning and spawning N
children at random angular offsets. There are no cracks, no damage-location
awareness, and the children don't tile the parent shape.

Target: a hit records *where* it landed; accumulated damage opens cracks along a
seeded fracture network; when a region's boundaries fail, that **convex cell**
detaches as a fragment (with a convex-hull collider matching the visible piece);
continued damage sheds more cells until the rock is consumed. This unifies three
roadmap items (convex-hull colliders, believable Voronoi fracture, resource/damage
state) with the damage-line idea.

## 2. Design overview (four pieces)

1. **Damage-site capture** (server): on `ShotImpactResolvedEvent` (and future
   mining), record the impact in asteroid-local space and add stress to the
   nearest fracture-network edges.
2. **Deterministic latent fracture network** (shared, seed-derived): a 2D convex
   partition (Voronoi-style) of the asteroid silhouette. Cells are potential
   fragments; shared edges are potential crack lines. Identical on server and
   client because it derives from the same seed used by the silhouette/shader.
3. **Progressive crack rendering** (client shader): a replicated damage/crack
   level (+ optionally nearest impact sites) drives a crack pass in
   `asteroid.wgsl` that draws/widens cracks along the network edges nearest the
   damage — visible cracking before any split.
4. **Damage-driven staged split** (server): when a cell's boundary stress to the
   body exceeds a threshold, that cell detaches as a fragment (convex hull
   collider, fresh seed, outward impulse). The body keeps the remaining cells.
   Continued damage sheds more; below a minimum fragment size the remainder is
   terminal debris.

## 3. Deterministic latent fracture network

- A **2D convex partition** of the silhouette polygon: seed N interior sites from
  the asteroid seed (`seed_from_key`, the same derivation the generator + shader
  share), build their Voronoi cells, clip to the silhouette. Each cell is convex.
- Cell count / coarseness is authored per size tier in the fracture profile
  (bigger rocks → more cells). Deterministic from `(seed, content_version)`.
- The network is **cacheable by seed** (compute once, reuse for crack rendering,
  split resolution, and child geometry). This addresses the per-fracture CPU cost.
- The network is a *latent* structure: it exists from spawn, but the rock only
  splits where damage fails the edges. Cell identities give deterministic child
  keys (`<member_key>#cell<NN>`), satisfying the V2 deterministic-lineage rule.

## 4. Damage accumulation model

- New per-member state (extend `AsteroidMemberStateEntry` or a sibling
  `AsteroidDamageState`): accumulated damage, and per-edge (or per-cell-boundary)
  stress keyed by network edge index.
- On impact: transform `impact_pos` into asteroid-local space (un-rotate by the
  member rotation), find the nearest network edge(s), add stress weighted by
  damage amount and proximity. Optionally radiate a fraction to connected edges
  (crack propagation feel).
- `HealthPool` remains the coarse gate (total integrity); per-edge stress decides
  *where* and *in what order* cells detach. A purely central hit weakens interior
  edges (rock holds longer); rim hits shed outer cells sooner.

## 5. Progressive crack rendering (client)

- Replicate a compact, public **crack/damage signal**: an overall `damage01` plus
  a small set of the most-stressed edge indices (or a coarse per-octant stress
  vector) — enough for the shader to draw cracks where the rock is failing.
- `asteroid.wgsl` gains a crack pass: along the latent network edges flagged as
  stressed, draw dark crack lines whose width/length scale with stress, with a
  subtle lit inner edge (consistent with the crater rim treatment). Cracks ride
  the same pixel-snap + cell-shade so they read as the rock breaking, not an
  overlay. No new material binding beyond extra uniform lanes.
- Edges that have fully failed (cell about to detach) render as open gaps.

## 6. Split resolution (server, staged)

Resolution order on the fixed-step simulation tick:
1. Recompute which network edges are "failed" (stress ≥ threshold).
2. Identify **detachable cells**: an exterior cell whose boundary edges to the
   remaining body are all failed (so it can separate without leaving a hole).
3. For each detachable cell (cap per tick for "slow" feel): write its child state
   entry, spawn a fragment entity, remove the cell from the body's active set,
   reduce body mass/health proportionally, redistribute the cell's edges as new
   exterior edges of the body.
4. If the body's remaining cell count / size falls below the terminal threshold,
   convert the remainder to its own final fragment(s) and despawn the parent.

This yields "slowly break apart along the fractured points": chunks calve off the
damaged side first, the silhouette recedes, and the rock eventually disintegrates.

## 7. Fragment generation

- A fragment's shape is its **convex cell** (clipped). Collider = convex hull of
  the cell (the asteroid plan's Phase 4 convex-hull collider, now exact-to-visible).
- Identity: deterministic `member_key#cellNN`; UUID via the existing
  `asteroid_member_uuid`. Persisted in `AsteroidFieldDamageState`.
- Mass: parent mass × cell-area fraction × profile mass-retention; remainder = dust.
- Impulse: outward along the cell centroid direction from the break, plus inherited
  parent velocity (existing behaviour).
- Appearance: inherits parent surface params (`ShaderParameterSet`) + a fresh seed
  derived from the child key, so each fragment is a coherent smaller rock. Fragments
  small enough are terminal (no further network; simple rock).
- Fragments may themselves carry a (smaller) latent network so they can be fractured
  again, bounded by `max_fracture_depth`.

## 8. Data / component contract

Extend, don't duplicate:
- `AsteroidMemberStateEntry` (or new `AsteroidMemberDamage`): `accumulated_damage`,
  `edge_stress: Vec<f32>` (indexed by network edge) or a compact octant vector,
  `failed_edges: Vec<u32>`, `detached_cells: Vec<u32>`.
- A small **replicated public** crack signal for presentation (`damage01` + coarse
  stress hint), redaction-safe.
- `AsteroidFractureProfile` (Lua-authored) gains: cell-count-by-tier, edge strength
  / threshold, max cells detached per tick (slow-break pacing), min fragment size /
  terminal rule, mass-retention, impulse range, crack-propagation factor.

All server-authoritative and persisted via the existing graph-record/component
path (consistent with V2 §3 rules). Clients never decide splits.

## 9. Lua authoring

`data/scripts/asteroids/registry.lua` `AsteroidFractureProfile` extends with the
fields in §8. The latent network coarseness, edge strength, and pacing are content
knobs; Rust owns the deterministic network construction, stress integration, split
resolution, and validation.

## 10. Determinism and authority

- **Geometry** (network cells, edges, child keys) is deterministic from
  `(seed, content_version)` → reproducible, persistable, and parity-checkable.
- **Realized fractures** (which cells failed, when) depend on damage history — that
  is legitimate server game-state, persisted in `AsteroidFieldDamageState`. On
  reload, the body rehydrates with its detached cells already gone.
- This matches V2 §3 (server decides; deterministic keys; persisted state).

## 11. Replication and redaction

- Crack/damage presentation signal is coarse and public (no exact yields).
- Exact resource yields / depletion stay server-owned (resources contract).
- Routes through the existing `system.visibility_replication.v1` lane.

## 12. Performance

- Latent network computed once and cached by seed; reused for cracks, split, and
  fragment shapes. Per-fracture cost (not per-frame). Cap cells-detached-per-tick.
- 2D only (silhouette partition), bounded cell counts per tier.
- Crack rendering is a few extra lines in the existing fragment shader.

## 13. Collision

- Active body collider updates as cells detach (the body's exterior shrinks);
  simplest implementation re-derives the body's convex outline from its remaining
  cells on each detach event (not per frame).
- Fragments get convex-hull colliders from their cell — exact-to-visible, replacing
  the current concave RDP outline for fragments (asteroid plan Phase 4).

## 14. Parity invariants

- The latent network derives from the **same seed/silhouette** the shader and
  collision generator already share (the established silhouette-parity contract),
  so cracks, fragment shapes, and colliders all agree with the rendered rock.
- A test should assert server network == client/shader network for a sample of
  seeds (same as the silhouette parity test pattern).

## 15. Phasing

1. [x] **Damage capture + state** (done): impact-local octant stress on the
   replicated/persisted `AsteroidMemberDamage`. No visual/behaviour change.
2. [x] **Latent network + crack rendering** (done): deterministic 7-site Voronoi
   from the shared lobe phases (`asteroid_fracture_network.rs`); shader crack pass in
   `data/shaders/asteroid.wgsl` driven by the replicated damage uniform lanes, with
   Rust↔WGSL parity tests.
3. [x] **Damage-driven staged split** (done): random-offset spawn replaced with
   staged cell detachment along stressed exterior cells; convex cell polygons / mask
   shrink; terminal rule (`fracture_damaged_asteroid_members`). Zero-health path
   (`fracture_depleted_asteroid_members`) remains the terminal fallback.
4. [x] **Tuning + VFX** (done): shatter dust on detach; pacing + thresholds + caps
   Lua-authored on `AsteroidFractureProfile`. Cell polygon clipped to the bounding
   disc; fragments are currently terminal (open-Q2 not deepened).
5. [x] **Hardening** (done, 2026-06-01): Rust↔WGSL network + cell-mask parity tests,
   persistence/rehydration of partially-fractured bodies, bounded per-tick detach
   test, native + WASM (`wasm32-unknown-unknown`, `bevy/webgpu`) build checks.

## 16. Risks

1. **2D convex partition + clipping** correctness/robustness (degenerate cells);
   mitigate with bounded site counts and a fallback to the current split if the
   partition fails.
2. **Body collider update on detach** — re-deriving the shrinking outline must stay
   cheap and stable; do it on detach events only.
3. **Replication volume** of crack signal — keep it coarse (damage01 + small hint),
   not per-edge floats, to avoid chatty updates.
4. **Determinism vs damage history** — keep geometry seed-deterministic; persist the
   realized state; cover rehydration with tests.
5. **Performance at field scale** — cache networks; cap detach/tick; most asteroids
   never get damaged so cost is incurred only on engaged rocks.

## 17. Open questions

1. Edge stress storage: full per-edge `Vec<f32>` vs a compact per-octant vector
   (cheaper to replicate/persist; coarser cracks)?
2. Should fragments retain a latent network (re-fracturable) or only the top tiers?
3. Crack propagation: purely local stress, or radiate along connected edges for a
   more dramatic "spider-cracking" read?
4. Do we keep the size-tier concept (Massive→…→Small) as a coarse guard alongside
   cell-area-based fragments, or replace tiers with fragment-size thresholds?
5. Mining interaction: does extraction add stress (mine-to-shatter) or only deplete?

## 18. Tests

- Deterministic network: same seed → same cells/edges/child keys.
- Server↔shader network parity (sample of seeds).
- Damage integration: impact-local mapping + nearest-edge stress; rim vs centre.
- Split resolution: detach only fully-failed exterior cells; mass/health
  conservation within retention; terminal rule; `max_fracture_depth`.
- Persistence/rehydration of a partially-fractured body.
- Lua fracture-profile validation; field smoke test.
- Performance: network cache hit; bounded detaches/tick.
