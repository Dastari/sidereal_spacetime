# Genesis Shader System V2 — Field-and-Classify Procedural Bodies

Status: Proposed
Lifecycle: proposed
Category: feature
Last updated: 2026-06-04
Owners: feature owners
Scope: Genesis Shader System V2 — Field-and-Classify Procedural Bodies.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

parameter-driven bodies, evolving the current enum-typed shaders into a
field-and-classify model, while preserving the fixed runtime material ABI,
Lua-authored registry/genesis/preset pipeline, and pixel-art presentation.
Primary references: `data/shaders/planet_visual.wgsl`, `data/shaders/star_visual.wgsl`,
`data/shaders/space_background_base.wgsl`, `data/shaders/space_background_nebula.wgsl`,
`data/shaders/starfield.wgsl`, `crates/sidereal-game/src/components/planet_body_shader_settings.rs`,
`bins/sidereal-client/src/runtime/backdrop/materials.rs` (`PlanetBodyUniforms`),
`bins/sidereal-client/src/runtime/shaders.rs` (`RuntimeShaderSlot`, bundled sources, ABI size validation),
`data/scripts/assets/registry.lua` (shader presets), `data/scripts/planets/` (genesis bodies),
`docs/features/reference/procedural_planets_reference.md`, `docs/features/active/genesis_planet_registry_contract.md`,
`docs/features/reference/space_backdrop_shader_stack_reference.md`, `crates/sidereal-shader-preview`,
`docs/decisions/dr-0027_lua_authored_render_layers_and_generic_shader_pipeline.md`,
`docs/decisions/dr-0029_runtime_shader_family_taxonomy_and_lua_authoring_model.md`,
`docs/decisions/dr-0041_generic_lua_authored_shader_parameter_schema.md`.

## 0. Implementation Status

- 2026-05-29: This document defines V2. Nothing in V2 is implemented yet; it is a
  proposed evolution of the shipped V1 system. No native/WASM/replication/
  persistence/authority impact until V2 work begins. All celestial shading is and
  remains a presentation-only client concern (planets/stars are authoritative
  static entities; their shader settings are authored data, not simulation state).

## 1. What "Genesis Shader System V1" is (the baseline this evolves)

`system.genesis_shader.v1` is the currently shipped procedural-body shader stack:

- **Analytic sphere on a 2D quad.** `planet_visual.wgsl` / `star_visual.wgsl`
  reconstruct a unit sphere in the fragment shader (no mesh, no UV seam, no pole
  pinching) and sample 3D noise on the rotated surface point. The space backdrop
  (`space_background_base/nebula` + `starfield`) is a separate fullscreen stack
  (see `space_backdrop_shader_stack.md`).
- **Pixel-art / cell-shade layer.** Billboard coordinates are snapped to a chunky
  pixel grid, lighting is quantized into a few banded steps, surface albedo is
  collapsed into flat colour cells, and the result is posterized. This is the
  shipped visual language and V2 keeps it unchanged.
- **Enum-typed bodies.** Today `planet_type` (`identity_a.y`: terran, desert,
  lava, ice, gas giant, moon) and the star class (same lane on `star_visual.wgsl`:
  sun, red giant, white dwarf, magnetar, pulsar) select hard-coded per-type albedo
  and feature branches. Craters (cellular), gas bands, seed-varied rings
  (`render_ring_pass`), atmosphere rim, magnetic field loops, and polar jets are
  all present.
- **Fixed Rust material ABI.** Both shaders bind one `PlanetBodyUniforms` uniform
  (`@group(2) @binding(0)`, 736 bytes) packed from `PlanetBodyShaderSettings`
  (`materials.rs::PlanetBodyUniforms::from_settings`). `shaders.rs` validates every
  streamed/bundled shader against that fixed binding size (`expected_uniform_size_bytes`).
- **Lua-authored content.** Per-asset presets live in `data/scripts/assets/registry.lua`
  (`editor_schema.presets`, consumed by the dashboard shader workshop) and per-body
  definitions live in `data/scripts/planets/*.lua` registered through
  `planets/registry.lua` (consumed by the genesis route and `world_init.lua`).
- **Lighting V1/V2 integration.** Bodies read the shared `SharedWorldLightingUniforms`
  (top-2 stellar + ambient + local lights), so they respond to authored system lighting.

V1's limitation — and the reason for V2 — is that **planet type is an enum of
pre-made looks**. Features are selected by branch and coloured per type. You cannot
smoothly lower a world's temperature to freeze its oceans, raise sea level to flood
its continents, or interpolate between archetypes, because the look is painted per
enum rather than derived from coupled physical fields.

## 2. V2 core idea — field-and-classify, mapped onto Sidereal

V2 replaces per-type albedo selection with a **field-and-classify** model. The
"planet type" stops being an enum branch and becomes a **region of a shared
parameter space**:

1. Compute a few continuous scalar **fields** per snapped pixel on the sphere:
   `elevation`, `temperature`, `moisture`, plus auxiliaries (`tectonic`, `crater`).
2. **Couple** them: temperature decreases with latitude and altitude; sea ice forms
   where ocean meets sub-freezing temperature; snow forms on cold high land; crater
   floors lower `elevation` before anything classifies it.
3. **Classify** each point into a material + base albedo from the fields, then light
   and quantise through the existing V1 cell-shade layer.

The headline consequence is coupling: an ice world is an Earth-like world with low
`global_temperature`; Mars is a low-water, high-crater, oxidised-palette rocky world;
a gas giant flips the elevation field from domain-warped continents to latitudinal
bands. Lowering one authored knob (temperature) ripples through the whole body —
oceans become sea ice from the poles inward, peaks frost first, and at the extreme
the disc becomes a snowball with a thin equatorial sea. This is exactly the
"various stages from one slider" behaviour the genesis tooling wants.

What stays the same: analytic sphere, pixel/cell-shade layer, lighting contract,
rings/clouds/atmosphere passes, and the fixed material family. V2 changes the
**surface generation + classification + parameterisation**, not the rendering
boundary.

### 2.1 Relationship to V1 fields that already exist

V1 already exposes several fields that V2 promotes to first-class coupled inputs,
so this is an evolution rather than a rewrite:

- `continent_size` / `ocean_level` already threshold a domain-warped height field
  for terran bodies.
- `ice_cap_size` already drives a latitude-based whitening that blends terrain
  toward frost and can cover the whole planet — this is a direct precursor to the
  V2 temperature field and should be generalised into it (latitude + altitude +
  `global_temperature` → freeze contour) rather than kept as a separate cap.
- Cellular `crater_relief` already carves dented craters that read under lighting.
- The gas-giant branch already builds a band field; V2 formalises it as the
  `gas_giant` blend between the rocky and banded elevation constructions.

## 3. The classifier (where Sidereal planet types become parameter regions)

V2 introduces one `classify(elevation, temperature, moisture, latitude, slope)`
function in `planet_visual.wgsl` that returns a material + base albedo, replacing
the current `planet_surface_color` per-type branch chain:

- **Ocean vs land** by `elevation < sea_level`; ocean colour depth-graded.
- **Sea ice** where ocean temperature is below `freeze_point`, staged
  slush→solid across `freeze_band`.
- **Snow** on land below `snow_point`; **bare rock** on steep slopes / above tree
  line; otherwise a small temperature×moisture biome ramp.

The existing `planet_type` enum is **retained as preset regions**, not deleted: each
enum value becomes a named starting point in field space (e.g. "Desert" = low
`sea_level`, high `crater_density`, oxidised palette, warm-dry temperature). This
keeps the registry/genesis/preset surface and the eight planet presets + six star
presets already authored in `registry.lua` working, while letting authors move off
the presets into the continuous space.

Gas giants short-circuit the ocean/ice classifier and use the band field; the
star path (`star_visual.wgsl`) keeps its own plasma/field-loop/jet model and is not
part of the ocean/ice classifier, but shares the field/preset and ABI conventions.

## 4. Feature subsystems (Sidereal mapping)

These extend the shared fields rather than compositing overlays. Items marked
*(V1)* already exist and are reused.

- **Continents & oceans** — domain-warped FBM height + `sea_level` threshold *(V1
  for terran; V2 unifies all rocky bodies on it)*.
- **Temperature & ice staging** — new coupled `temperature` field; generalises V1
  `ice_cap_size`. The headline genesis demo.
- **Mountains & erosion** — ridged noise added to elevation; `erosion`/`age` blends
  jagged→rounded; slope drives bare-rock exposure.
- **Craters** *(V1 `crater_relief`)* — carved into `elevation` before classify so
  ice/dust can pool in floors automatically on cold/low worlds.
- **Scars / canyons / tectonics** — ridged field thresholded to thin lines that
  subtract elevation (self-shading canyons) or add an oxidised/lava colour seam.
- **Gas giants** *(V1 band branch)* — `sin(latitude·band_count + turbulence)`
  quantised into the palette, with slow Worley storm spots; `gas_giant` blends
  rocky↔banded.
- **Atmosphere composition → palette/scatter** — a small set of fractions (or one
  `atmosphere_tint` + `scatter_strength`) drives rim-glow colour, whole-disc tint,
  and cloud colour. Methane→cyan, CO₂/dust→orange haze, O₂/H₂O→blue rim + white
  clouds.
- **Clouds** — same-pass contribution, posterised, that also casts a soft shadow
  back onto the surface (coupled, not an overlay).
- **Atmosphere rim / outer glow** *(V1 rim)* — fresnel-like inner rim + outer glow
  shell beyond the disc radius.
- **Rings** *(V1 `render_ring_pass`)* — seed-varied tilt/openness/width/layers with
  front/back split already shipped; V2 adds ring shadowing of/by the planet.

## 5. Data model — how V2 parameters reach the shader

This is the load-bearing Sidereal constraint. The runtime binds **one fixed
`PlanetBodyUniforms`** (DR-0029 keeps the small fixed material-family set; `shaders.rs`
validates the binding size). V2's new field knobs (`global_temperature`,
`lat_falloff`, `alt_falloff`, `freeze_point`, `freeze_band`, `snow_point`,
`sea_level`, `moisture_*`, `scar_*`, `erosion`, `atmosphere_tint`, …) must reach the
shader without breaking that boundary. Three options, in recommended order:

1. **Reuse and reinterpret existing `PlanetBodyShaderSettings` fields.** Many V2
   fields already exist or map directly (`ocean_level`→`sea_level`,
   `ice_cap_size`→freeze coverage, `crater_density`/`crater_size`,
   `storm_intensity`, `mountain_height`, `roughness`, `surface_activity`,
   `bands_count`). Start here; it needs no ABI change.
2. **Author the remaining knobs through the DR-0041 generic
   `ShaderParameterSet`.** This is the strategic home: Lua authors named, validated
   parameters; Rust packs them into the family uniform block; the dashboard workshop
   reads the schema. New temperature/moisture/scar fields land here once DR-0041 is
   integrated, with the Lua registry as the single source of truth for
   name/range/default/description.
3. **Append to the fixed ABI only if unavoidable.** Additive `Vec4` lanes appended
   to `PlanetBodyUniforms` + `from_settings` + the WGSL struct + `expected_uniform_size_bytes`,
   with a persisted-data migration. Last resort; superseded by option 2.

V2 must not introduce a per-body Rust material type or move generation authority off
the client (DR-0027/0029 boundary). The classifier and fields live entirely in WGSL;
Rust/Lua only supply validated scalars/colours.

## 6. Authoring, genesis, and the live-tuning demo

- **Dashboard shader workshop** reads `editor_schema.presets` per shader asset.
  V2 presets author field knobs (temperature, sea level, …) so dragging a slider
  re-shades live (mutating the material uniform re-uploads automatically).
- **Genesis route** (`data/scripts/planets/*.lua` + `planets/registry.lua`, see
  `genesis_planet_registry_contract.md`) authors per-body field settings and a
  `seed`. Keeping one seed and moving only `global_temperature` (Earth→snowball) or
  `sea_level` (flood/dry) is the clearest demonstration that features are coupled
  into the field rather than painted on, and is the recommended genesis preview.
- **Deterministic galaxy population** uses `seed` through the field noise so a large
  number of unique bodies generate from parameter regions + seed, consistent with
  the V1 genesis intent.

## 7. Performance (galaxy-scale)

The body is one fragment shader over a quad — already cheap. For a galaxy full of
bodies:

- **Bake static bodies to a small offscreen image** and blit the sprite; re-bake
  only when an authored parameter changes (dirty flag). A non-spinning planet then
  costs nothing per frame. This is the most important lever for many on-screen
  bodies and pairs naturally with the pixel-art low-internal-resolution target.
- Clamp FBM octaves (3–4) at pixel-art resolution; bound the crater cellular loop;
  prefer coherent branches on the quad. Optionally bake per-material palette ramps
  to a small LUT.
- Bevy note: the repo is on `0.18`; a future `0.19` upgrade (render-graph-as-systems,
  `Core2dSystems` post-process sets, `FullscreenMaterial`) — tracked in DR-0041 §8 —
  would simplify any bake-to-target pass but is not required for V2.

## 8. Phased roadmap (Sidereal)

Because V1 already ships the sphere, pixel/cell-shade, lighting, craters, bands,
rings, and atmosphere, V2 phases focus on fields, coupling, and parameterisation:

1. **Coupled fields + classifier.** Introduce `elevation`/`temperature`/`moisture`
   in `planet_visual.wgsl`; replace `planet_surface_color`'s per-type branches with
   `classify(...)`. Map fields onto existing `PlanetBodyShaderSettings` (§5 option 1).
   No ABI change. Re-author the eight planet presets as field regions.
2. **Temperature freeze staging.** Generalise `ice_cap_size` into the temperature
   field; sea ice + snow + frost stages; wire the dashboard/genesis temperature
   slider. Headline demo.
3. **Moisture biomes + scars/erosion.** Temperature×moisture biome ramp; ridged
   scar carves; erosion/age blend.
4. **Parameter source-of-truth migration.** Move new field knobs onto the DR-0041
   generic `ShaderParameterSet` (§5 option 2); registry schema becomes the single
   source for names/ranges/defaults/descriptions; update genesis + workshop.
5. **Atmosphere composition + coupled clouds.** Composition→palette/scatter; cloud
   shadow coupling.
6. **Ring shadows + polish.** Ring/planet mutual shadowing; optional Bayer dither
   locked to the pixel grid; night-side recolour; palette LUT.
7. **Bake-to-texture caching** for galaxy-scale static bodies (§7).

## 9. Non-goals / invariants

- No per-effect Rust material types; keep the fixed family ABI (DR-0029).
- No generation authority on the server; bodies stay authoritative static entities
  with authored, persisted/replicated shader settings (presentation-only).
- Keep the pixel-art / cell-shade language from V1 unchanged.
- Preserve native/WASM parity: WGSL + Lua data path only; dashboard shader-preview
  and the `sidereal-shader-preview` software renderer must keep validating the same
  source.

## 10. Open questions

1. How far to reuse existing `PlanetBodyShaderSettings` fields vs. waiting for
   DR-0041 generic params before adding the temperature/moisture set?
2. Should the `planet_type` enum remain a visible authoring control (as preset
   regions) or be fully replaced by field sliders in genesis/workshop?
3. Bake-to-texture: client-cached only, or a shared baked sprite for very distant
   bodies in tactical/minimap lanes?
4. Do stars (`star_visual.wgsl`) adopt any field coupling (temperature→class
   colour ramp) or stay on the current class-based plasma model?
