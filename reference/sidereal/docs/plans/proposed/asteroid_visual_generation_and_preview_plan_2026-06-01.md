# Asteroid Visual Rebuild, Generation, Fracture VFX, Collision Efficiency, and Dashboard Preview Plan

Status: Proposed
Lifecycle: proposed
Category: plan
Last updated: 2026-06-04
Owners: implementation owners
Scope: Asteroid Visual Rebuild, Generation, Fracture VFX, Collision Efficiency, and Dashboard Preview Plan.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

Date: 2026-06-01
Owners: client rendering + scripting + gameplay simulation + dashboard
System labels: `system.asteroid_field.v2`, `system.genesis_shader.v1`/`.v2`, `system.rendering.v1`

Primary references:
- `docs/features/reference/procedural_asteroids_reference.md`
- `docs/features/active/asteroid_field_system_v2_contract.md`
- `docs/features/proposed/genesis_shader_system_v2_proposal.md`
- `docs/features/reference/space_backdrop_shader_stack_reference.md`
- `docs/features/reference/shader_preview_generator_reference.md`
- `docs/decisions/dr-0027_lua_authored_render_layers_and_generic_shader_pipeline.md`
- `docs/decisions/dr-0029_runtime_shader_family_taxonomy_and_lua_authoring_model.md`
- `docs/decisions/dr-0041_generic_lua_authored_shader_parameter_schema.md`
- `data/shaders/asteroid.wgsl`, `data/shaders/planet_visual.wgsl`
- `crates/sidereal-game/src/procedural_sprite_generation.rs`
- `crates/sidereal-game/src/collision_outline_generation.rs`
- `crates/sidereal-game/src/asteroid_field.rs`
- `crates/sidereal-game/src/components/procedural_sprite.rs`
- `bins/sidereal-client/src/runtime/backdrop/materials.rs` (`AsteroidSpriteShaderMaterial`, `PlanetBodyUniforms`)
- `bins/sidereal-client/src/runtime/shaders.rs` (`RuntimeShaderSlot::AsteroidSprite`, ABI validation)
- `crates/sidereal-shader-preview/src/native.rs` (`build_preview_texture_data`)
- `data/scripts/assets/registry.lua` (`asteroid_wgsl`), `data/scripts/asteroids/registry.lua`

## 1. Goals

1. Better-looking generated cell-shaded / pixel-art asteroids, using the planet
   crater / cell-shade language as the quality bar.
2. Asteroids that split and break apart into smaller ones (extend the existing
   fracture system with a believable shatter moment and fresh-chunk children).
3. Surfaces glittered with resource gems / ore nodes / metal accents that reflect
   the asteroid's authored resource profile.
4. Efficient collision-mesh generation, including at fracture time.
5. A realistic dashboard asteroid preview (today it renders as a flat circle).

## 2. Chosen Direction (decided 2026-06-01)

**Shader-procedural, planet-style.** Asteroids move from the current
texture-baked model (CPU generator bakes albedo + normal, the shader mostly
samples them) to a model where `asteroid.wgsl` computes the irregular silhouette,
relief, craters, cell-shading, and gem accents **analytically in the fragment
shader**, exactly as `planet_visual.wgsl` does for the analytic sphere. The Rust
generator is retained **only** for the irregular silhouette polygon used by
collision, plus deterministic per-instance parameters.

Rationale:
- Matches the planet crater/cell-shade quality the team already likes.
- Makes the dashboard preview "just work" the way the planet preview does (no
  baked texture needed), solving Goal 5 structurally rather than with a one-off
  placeholder.
- Eliminates today's **double crater generation**: craters are currently baked by
  `generate_asteroid_rocky_v1` *and* re-derived in UV space by `asteroid.wgsl`
  (`crater_mask`/`vein_mask`), in two unsynchronized coordinate systems.
- Keeps within the DR-0029 fixed material-family boundary (world-sprite family),
  and aligns toward the DR-0041 generic parameter direction.

### 2.1 The load-bearing invariant: silhouette parity

Because collision is server-authoritative and must match the rendered shape, the
**silhouette function must be identical in WGSL and Rust**. Today both already
compute `silhouette_radius(angle, seed, lobe params, edge noise)`; under this plan
that function becomes the single shared contract:

- WGSL `asteroid.wgsl` uses it to discard fragments outside the rock and to shade.
- Rust `procedural_sprite_generation.rs` uses it to rasterize the alpha mask that
  feeds `collision_outline_generation.rs`.

This parity is enforced by test (see §9), analogous to the existing
`fullscreen_shader_cache_entries_match_sources` source/cache parity test and the
`planet_preview_study` validation tests.

## 3. Current State (as-is, grounded in code)

- **Material ABI** (`AsteroidSpriteShaderMaterial`): `@binding(0)` albedo texture,
  `(1)` sampler, `(2)` `SharedWorldLightingUniforms` (384 B), `(3)` normal texture,
  `(4)` sampler, `(5)` `local_rotation: vec4` (16 B). Validated in `shaders.rs`
  (`ASTEROID_SPRITE_BINDINGS`, `expected_uniform_size_bytes`).
- **Generation** (`generate_asteroid_rocky_v1`): builds an irregular silhouette
  (lobes + fBm edge noise), bakes craters/cracks/veins into an 8-step quantized
  albedo, derives a normal map from a height field. Driven by the replicated
  `ProceduralSprite` component (`surface_style`, `pixel_step_px`, `crater_count`,
  `palette_*`, `mineral_*`, `edge_noise`, `lobe_amplitude`, `family_seed_key`).
- **Collision** (`collision_outline_generation.rs`): alpha → marching-squares
  contour → RDP simplify → 1× Chaikin → RDP → cap at 64 points. Half extents from
  the alpha bounding box. Visual and collision share the same alpha source.
- **Fracture** (`asteroid_field.rs`): zero-health members fracture into
  deterministic smaller children (Massive→Large→Medium→Small→debris) with mass
  retention, impulse, and per-child sprites; each child re-runs the full generator
  + contour trace for its collider. Tier/impulse/retention authored in
  `data/scripts/asteroids/registry.lua`.
- **Resource data** exists (`AsteroidResourceProfile` yield tables;
  `ProceduralSprite` mineral fields and `GemRich`/`Metallic` styles) but is **not
  rendered** as discrete gem/ore nodes.
- **Dashboard preview**: `asteroid_wgsl` is registered with
  `single_shader_editor_preview("sprite", "sprite_shader", "1:1")` but its
  `editor_schema` exposes only `local_rotation` cos/sin. The preview renderer
  (`native.rs::build_preview_texture_data`) feeds the shader a **synthetic circle
  disc** texture + flat normal, never running the real generator — hence the flat
  circle.

## 4. Target Architecture

```
Lua (data/scripts/asteroids/registry.lua + procedural_sprite payload)
  authored shape/crater/palette/mineral/resource params + seed
        │
        ├─► Rust generator (silhouette only)  ──► alpha mask ──► collision outline + convex collider
        │      crates/sidereal-game/src/procedural_sprite_generation.rs
        │      crates/sidereal-game/src/collision_outline_generation.rs
        │
        └─► ShaderParameterSet (DR-0041 generic, Lua-authored named values)
                │   schema_id="asteroid_visual" → packed into a generic
                │   world-sprite params block (opaque params[] + shared lighting header)
                ▼
            asteroid.wgsl  (analytic silhouette + planet-style cell-shade + craters + gems)
```

New material ABI (`AsteroidSpriteShaderMaterial` → procedural form):
- **No texture/sampler bindings.** Lighting is fully analytic (the shader derives
  the macro normal + crater relief from its in-shader height field, exactly like
  `planet_visual.wgsl`), so the baked albedo(0)/sampler(1)/normal(3)/sampler(4)
  bindings are removed. Only a uniform block remains.
- `@binding(0)` is a generic world-sprite uniform: a shared engine/lighting header
  (`SharedWorldLightingUniforms` + viewport/seed/local-rotation) plus an opaque
  `params: array<vec4<f32>, N>` block (DR-0041 §6.3), no semantic field names in
  the ABI.

This changes `ASTEROID_SPRITE_BINDINGS` + `expected_uniform_size_bytes` in
`shaders.rs` (down to one uniform) and the packing in `materials.rs`.

**Parameter source of truth = DR-0041 `ShaderParameterSet` (decided 2026-06-01).**
The asteroid's visual knobs (shape/lobe, crater, palette, mineral/gem, surface
style, seed) are authored as named, validated Lua parameters and delivered via the
generic `ShaderParameterSet` component, **not** a bespoke fixed struct. The
`ProceduralSprite` component is retained only for the generator's
silhouette/collision inputs; the *visual* parameters move to `ShaderParameterSet`.

**Sequencing (decided 2026-06-01): this work depends on the full DR-0041 migration
completing first.** Per `docs/plans/proposed/shader_parameter_set_transition_plan_2026-06-01.md`,
all existing typed-settings families (space background, starfield, planet/star,
effect) migrate to `ShaderParameterSet` before the asteroid rebuild begins. The
asteroid is therefore the first *new* consumer of a finished foundation, not the
migration slice. The generic runtime, catalog-layout packer, and WGSL alias prelude
are assumed available; the asteroid simply authors an `asteroid_visual` schema and
adds the new world-sprite family ABI.

## 5. Phased Plan

### Phase 0 — Decision + invariants (this doc)
- [x] Choose shader-procedural model.
- [ ] Record silhouette-parity invariant (§2.1) and fixed-family-ABI boundary.
- [ ] Confirm presentation-only: asteroid shading writes no authoritative state;
      generation authority stays server-side for collision/fracture.

### Phase 1a — Prerequisite: DR-0041 migration complete (separate plan)
The generic `ShaderParameterSet` runtime is delivered by
`docs/plans/proposed/shader_parameter_set_transition_plan_2026-06-01.md` (foundation + full
migration of space background / starfield / planet / effect), which must complete
before this plan starts. This phase is therefore a **gate**, not asteroid work:
- [ ] Generic `ShaderParameterSet` component + server validation + client name→lane
      packer + catalog-layout delivery are shipped and proven on existing families.
- [ ] WGSL alias prelude generation available (or direct-lane reads accepted).
- [ ] No `*ShaderSettings` typed structs remain in `sidereal-game`.
Asteroid-specific work below assumes that foundation exists.

### Phase 1b — Shader-procedural asteroid core (visual rewrite)
- [ ] Add the generic world-sprite uniform (`ShaderType`) in `materials.rs`: shared
      lighting/engine header + opaque `params: array<vec4<f32>, N>`.
- [ ] Author the `asteroid_visual` parameter schema (shape/lobe, crater, palette,
      mineral/gem, surface_style, seed) in `data/scripts/asteroids/registry.lua` /
      asset `editor_schema`; regenerate the layout artifact.
- [ ] Rewrite `data/shaders/asteroid.wgsl`:
  - analytic irregular silhouette from seed + lobe/edge params (discard outside),
  - port `planet_visual.wgsl` pixel/cell-shade helpers (`pa_pixel_snap`,
    `pa_quantize` banded terminator, `pa_posterize`) and the cellular crater model,
  - **analytic** macro normal + crater relief → lighting via
    `SharedWorldLightingUniforms` (no normal texture),
  - remove the redundant UV-space `crater_mask`/`vein_mask` duplication.
- [ ] Update `shaders.rs` `ASTEROID_SPRITE_BINDINGS` (single uniform, no
      texture/sampler) + `expected_uniform_size_bytes`; keep naga preflight + fail-soft.
- [ ] `ProceduralSprite` retained for the generator's silhouette/collision inputs
      only; visual knobs now live in `ShaderParameterSet`.
- [ ] Keep `generate_asteroid_rocky_v1` producing the **alpha mask + silhouette**
      for collision (drop albedo/normal baking from the default visual path).
- [ ] Native + WASM `cargo check`; republish `asteroid_wgsl` so
      `cache_stream/`+`published_assets/` match the edited source (parity test).

### Phase 2 — Dashboard asteroid preview (fast iteration loop)
- [ ] Add `data/shaders/asteroid_preview_study.wgsl` (or make `asteroid.wgsl`
      preview-safe), mirroring `planet_preview_study.wgsl`, so the renderer can draw
      a real asteroid from `AsteroidVisualUniforms` defaults with no baked texture.
- [ ] Add preview fallback defaults for the new uniform lanes in
      `crates/sidereal-shader-preview/src/native.rs`
      (`runtime_fallback_default_values`); the synthetic circle path is no longer
      used for asteroids.
- [ ] Expand the `asteroid_wgsl` `editor_schema` in `registry.lua` with
      shape/crater/palette/seed/mineral controls + presets (rocky, carbonaceous,
      metallic, gem-rich), grouped like the planet schema.
- [ ] Add an `asteroid_preview_study` validation test alongside the existing
      `planet_preview_study` tests.
- [ ] Use the preview tool (`sidereal-shader-preview-render`) to iterate on look in
      PNG before/after each visual change.

### Phase 3 — Resource gem / ore nodes + gameplay hint markers (Goal 3)
Gems are **both** a surface visual and a gameplay hint marker tied to the
`AsteroidResourceProfile` (decided 2026-06-01), not cosmetic-only.
- [ ] In `asteroid.wgsl`, add Worley feature-point gem/ore nodes: select cells as
      nodes from seed + density, render as bright posterized facets with a glint
      lobe and emissive accent (within the emissive-allowed presentation budget).
- [ ] Drive node count/color/sheen from the mineral params + `surface_style`
      (`Metallic` sheen, `GemRich` clusters, `Carbonaceous` dark matte) carried in
      the `ShaderParameterSet`.
- [ ] Add a **replicated, redaction-safe resource hint** derived from
      `AsteroidResourceProfile`: a coarse public signal (dominant resource class /
      richness tier), NOT exact yields. Per `asteroid_field_system_v2.md` §9 exact
      yields stay server-owned; this must respect the visibility/redaction lane
      (`system.visibility_replication.v1`).
- [ ] Drive both the shader accent palette **and** a client hint marker (world-space
      annotation callout and/or tactical-map marker) from that same coarse signal,
      so the glittering spot agrees with the marker and with what is minable.
- [ ] Keep node placement deterministic from seed so visual accents and the
      (future) mining extraction points can align.

**Scope note:** this phase crosses into gameplay/replication/visibility, not just
rendering. It can ship the visual gems first and layer the redaction-safe hint
signal + markers second if we want to keep the slice small.

### Phase 4 — Collision efficiency (Goal 4)
> **Delivered (2026-06-01) via the damage-driven fracture work**
> (`docs/features/implemented/asteroid_damage_driven_fracture_implemented.md`). Fracture **fragments** are
> now convex cells with convex-hull colliders derived from the shared latent
> Voronoi network (exact-to-visible), and the body collider shrinks as cells
> detach. The convex-hull-only direction below is realized for fragments; the
> intact-body hull caching specifics remain as authored.

**Convex-hull colliders only** (decided 2026-06-01). One convex hull per asteroid
(~8–16 verts) for Avian, derived from the silhouette; the 64-pt outline is kept for
debug/visual alignment only.
- [ ] Replace the concave 64-pt collider path with a convex hull computed from the
      traced silhouette (`collision_outline_generation.rs`).
- [ ] Cache hulls by `family_seed_key` to avoid recompute (esp. across a field and
      across fracture children that share a shape family).
- [ ] Accept that a convex hull fills concavities; the believability burden moves to
      the **fracture partition** (Phase 5) so the union of child hulls reads as the
      parent breaking apart rather than one hull vanishing into smaller ones.
- [ ] Keep visual/collision aligned via the §2.1 shared silhouette function.

### Phase 5 — Believable convex fracture + shatter polish (Goal 2)
> **Superseded/expanded by `docs/features/implemented/asteroid_damage_driven_fracture_implemented.md`
> (2026-06-01):** that design makes the convex partition below *damage-driven and
> progressive* — damage accumulates at impact sites, the rock cracks along a
> deterministic latent network, and convex cells shed along failed crack lines
> (slow break-apart). Phase 4 convex-hull colliders + this Phase 5 partition are
> the building blocks; implement per that doc's phasing.
>
> **Delivered (2026-06-01):** the damage-driven fracture feature shipped Phases 1–5
> (hardening done). Random radial offsets are replaced by the deterministic
> latent Voronoi partition (convex cells, centroid-aimed outward impulse,
> deterministic child keys/UUIDs, mass-retention + `AsteroidFieldDamageState`
> writeback), and a shatter dust VFX fires on each staged detach. The believable
> convex-fracture goal is met; remaining checkboxes below are subsumed by that work.

The current `build_fracture_child_plans` scatters children at random angular
offsets around the center — fine for physics, but it does not look like the parent
*breaking apart*. With convex-hull colliders this matters more, so fracture geometry
becomes a **convex partition of the parent silhouette**:
- [ ] Replace random radial offsets with a deterministic Voronoi-style partition:
      seed N points inside the parent silhouette (from the parent member key), each
      child = the convex hull of its Voronoi cell clipped to the silhouette,
      positioned at the cell centroid, with outward impulse along the centroid ray.
- [ ] Children inherit a sprite seed derived from their cell so each fragment's
      analytic silhouette roughly matches its collider hull (visual/collision parity
      for fragments, §2.1).
- [ ] Preserve existing determinism (child keys/UUIDs), mass-retention, impulse, and
      `AsteroidFieldDamageState` writeback in `asteroid_field.rs`.
- [ ] Emit a shatter VFX on fracture: `RuntimeEffect` billboard burst + brief crack
      flash at `effect_origin` (reuse the existing explosion billboard variant).
- [ ] Tune children to read as fresh sharp-faceted chunks (sharper facet ridges,
      lower crater_count) rather than shrunk copies.

### Phase 6 — Hardening + rollout
- [ ] naga validation green for all asteroid slots (bundled + preview-study).
- [ ] Native / WASM / Windows `cargo check`; browser-safe fallback if needed.
- [ ] Republish catalog; `fullscreen_shader_cache_entries_match_sources`-style
      parity for `asteroid_wgsl` green.
- [ ] Determinism tests for generation + fracture; silhouette WGSL↔Rust parity test.
- [ ] Update `docs/features/reference/procedural_asteroids_reference.md` +
      `docs/features/active/asteroid_field_system_v2_contract.md` (§7 Visual Direction) and the
      catalog note.

## 6. Files Likely Touched

- `data/shaders/asteroid.wgsl` (rewrite), `data/shaders/asteroid_preview_study.wgsl` (new)
- `bins/sidereal-client/src/runtime/backdrop/materials.rs` (`AsteroidVisualUniforms`)
- `bins/sidereal-client/src/runtime/shaders.rs` (ABI bindings + sizes)
- `bins/sidereal-client/src/runtime/visuals/materials.rs` + `streamed.rs` (material build)
- `crates/sidereal-game/src/components/procedural_sprite.rs` (params)
- `crates/sidereal-game/src/procedural_sprite_generation.rs` (silhouette-only + shared fn)
- `crates/sidereal-game/src/collision_outline_generation.rs` (coarse collider)
- `crates/sidereal-game/src/asteroid_field.rs` (child collider reuse + shatter VFX hook)
- `crates/sidereal-shader-preview/src/native.rs` (uniform defaults; retire circle path for asteroids)
- `data/scripts/assets/registry.lua` (`asteroid_wgsl` editor_schema + presets)
- `data/scripts/asteroids/registry.lua` (sprite/resource accent params)
- republished `data/cache_stream/` + `data/published_assets/` shader payloads

## 7. Non-Goals / Invariants

- No new ad-hoc Rust material type per asteroid; stay in the world-sprite family
  (DR-0029). One fixed `AsteroidVisualUniforms` ABI now; DR-0041 `ShaderParameterSet`
  migration is a later coordinated pass.
- No generation/fracture authority moved to the client; shading is presentation-only.
- Keep the pixel-art / cell-shade language consistent with the planet/star/backdrop
  stack (`system.genesis_shader.v1`).
- Preserve native/WASM parity (WGSL + Lua data path; preview must validate the same
  source the game uses).

## 8. Risks

1. **Silhouette parity drift** (WGSL vs Rust) — highest regression risk; mitigate
   with a rasterize-and-compare parity test and a single documented contract.
2. **ABI migration + persisted payloads** — changing the asteroid uniform ABI and
   `ProceduralSprite` schema needs `#[serde(default)]` and a republish; cover with
   the cache-parity test and a persisted-payload load test.
3. **In-shader cost at field scale** — analytic craters/gems per fragment across a
   dense field; mitigate with octave clamps and, if needed, bake-to-texture for
   distant/static bodies (mirrors `genesis_shader_system_v2.md` §7).
4. **Collision behavior change** — switching to a convex-hull collider fills
   concavities and alters contact response; validate against current movement/impact
   expectations and lean on the Voronoi partition (Phase 5) for believable breakup.
5. **DR-0041 dependency / scope creep** — choosing `ShaderParameterSet` pulls the
   generic shader-parameter runtime into this work; the largest schedule risk.
   Mitigate by scoping Phase 1a to the minimum needed to drive the asteroid family
   and treating the asteroid as the deliberate first slice.
6. **Server-owned yield disclosure** — the gem hint signal must not leak exact
   yields; route it through the existing redaction lane and keep the public payload
   coarse (`asteroid_field_system_v2.md` §9, `system.visibility_replication.v1`).

## 9. Tests

- Asteroid WGSL naga validation (bundled + preview-study), like `planet_preview_study`.
- Silhouette parity: Rust raster vs WGSL silhouette agree within tolerance.
- Cache/source parity for `asteroid_wgsl` (extend existing test set).
- Generation + fracture determinism (existing `asteroid_field` / `procedural_sprite` tests updated).
- Collider efficiency regression: vertex-count + generation-time bounds, esp. on fracture.
- Lua registry validation for new sprite/resource/editor schema fields.
- Native + WASM compile checks.

## 10. Resolved Decisions (2026-06-01)

1. **Texture bindings: removed.** Lighting is fully analytic (no albedo/normal
   texture), proven by `planet_visual.wgsl`. The material keeps only the uniform.
2. **Parameters: DR-0041 `ShaderParameterSet`.** No bespoke fixed struct. The full
   DR-0041 migration completes first (separate transition plan); asteroid is the
   first *new* consumer of the finished foundation, not the migration slice.
3. **Gems: gameplay hint markers**, not cosmetic-only — driven by a redaction-safe
   coarse `AsteroidResourceProfile` signal, with exact yields server-owned.
4. **Collider: convex hull only.** Believability is carried by a convex Voronoi
   fracture partition (Phase 5), not by concave colliders.

### Remaining questions
- DR-0041 scope: build the generic runtime fully now (server validation + client
  packer), or a minimal asteroid-only shim first and generalize later?
- Resource hint granularity: dominant-class only, or class + richness tier on first
  delivery? (affects redaction surface.)
- Voronoi fracture: 2D cell count per tier and whether terminal `Small` debris also
  partitions or just spawns particles.
