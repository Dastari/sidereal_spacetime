# ShaderParameterSet Transition Plan (DR-0041 Execution)

Status: Proposed
Lifecycle: proposed
Category: plan
Last updated: 2026-06-04
Owners: implementation owners
Scope: ShaderParameterSet Transition Plan (DR-0041 Execution).
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

Date: 2026-06-01
Owners: client rendering + scripting + replication + gateway + dashboard
System labels: `system.rendering.v1`, `system.genesis_shader.v1`
Implements: `docs/decisions/dr-0041_generic_lua_authored_shader_parameter_schema.md`

Primary references:
- `docs/decisions/dr-0041_generic_lua_authored_shader_parameter_schema.md`
- `docs/decisions/dr-0029_runtime_shader_family_taxonomy_and_lua_authoring_model.md`
- `docs/decisions/dr-0027_lua_authored_render_layers_and_generic_shader_pipeline.md`
- `docs/features/reference/shader_parameter_layout_artifact_reference.md`
- `data/generated/shader_parameter_layouts.json`
- `data/scripts/assets/registry.lua`
- `bins/sidereal-client/src/runtime/shaders.rs` (family ABIs + naga validation)
- `bins/sidereal-client/src/runtime/backdrop/materials.rs` (`populate_space_background_uniforms`, `PlanetBodyUniforms`)
- `crates/sidereal-game/src/components/space_background_shader_settings.rs`,
  `starfield_shader_settings.rs`, `planet_body_shader_settings.rs`, thruster plume settings
- `crates/sidereal-shader-preview/` + `scripts/render_space_backdrop_preview.mjs`

## 1. Decision and Scope

**Decided 2026-06-01:** migrate **all** typed-settings shader families to the
DR-0041 generic `ShaderParameterSet` before starting new asteroid/world-sprite
visual content. Asteroid work (see
`asteroid_visual_generation_and_preview_plan_2026-06-01.md`) lands on the completed
foundation as the first *new* consumer, not as the migration slice.

In scope — the families that today compile a bespoke typed-settings struct with
hardcoded defaults into `sidereal-game`:
- `SpaceBackgroundShaderSettings` (base + nebula; shared 432 B ABI) — **DONE (T1)**
- `StarfieldShaderSettings` — **DONE (T2)**
- `ThrusterPlumeShaderSettings` (effect family) — **DONE (T4)**

**Deliberate exception (decided 2026-06-01): `PlanetBodyShaderSettings` is NOT
migrated.** Unlike the others, it is not a pure rendering-settings struct — it is
the **content-authoring schema for the Genesis planet system** (typed field on
`PlanetRegistryEntry`, per-planet `data/scripts/planets/*.lua`, the dashboard
Genesis editor, and the draft/publish API). Collapsing it into a generic float-bag
would regress the Genesis planet-editor UX and delete the typed authoring model of
a shipped feature, for the most effort of any family — and the planned **Genesis
Shader V2** (field-and-classify) will redefine the planet parameter model anyway.
Planet/star therefore keeps `PlanetBodyShaderSettings`; revisit *with* Genesis V2.
Consequence: DR-0041 Goal 1 ("no game-specific shader-settings struct in the
backend") is intentionally only *partially* met — the planet family retains a typed
domain representation. This is acceptable because every other family's settings are
pure rendering knobs (the generic component's purpose), whereas planet's are also
authored content with a non-rendering consumer.

Rationale for keeping the generic component (not five per-family typed structs): the
pipeline families are already represented by the typed *structure* components
(`RuntimeRenderLayerDefinition` phase/domain, `RuntimePostProcessStack`,
`RuntimeWorldVisualStack`, the `RuntimeEffectMaterial` family ABI). Structure stays
typed-per-family; scalar params stay generic (`ShaderParameterSet` keyed by
`schema_id`). Per-family typed *param* structs would re-introduce the hardcoded
defaults + Rust/Lua drift DR-0041 removed, with space-specific fields that aren't
actually project-reusable.

Out of scope for this plan (tracked separately):
- Bevy 0.19 upgrade + post-process pipeline (DR-0041 §8, Phase 4).
- `TacticalMapOverlayMaterial` (DR-0029 keeps it a fixed schema "for now"); it may
  follow the same pattern later but carries no migration urgency.
- New asteroid/world-sprite content (its own plan; depends on this completing).

## 2. End State

1. One generic `ShaderParameterSet` component carries named, validated parameter
   values on the wire (no space-/planet-specific terms).
2. The Lua asset registry is the single source of truth for every parameter's
   name/label/description/range/step/default/group and uniform-lane binding.
3. Rust keeps only the fixed family ABIs (opaque `params: array<vec4<f32>, N>` +
   shared engine/lighting header), validation, packing, replication, and execution.
4. No `*ShaderSettings` typed structs remain in `sidereal-game`; the backend
   compiles generic machinery + the single generic component only (DR-0041 Goal 1).
5. The dashboard editor and software preview both read the same catalog layout.

## 3. Workstream A — Generic Foundation (prerequisite for every family)

Build once, reuse for all families.

- [ ] **Component.** Add `ShaderParameterSet { schema_id: String, preset_asset_id:
      Option<String>, values: Vec<ShaderParameterValue> }`, macro-registered
      (`persist`, `replicate`, `visibility = [Public]`), `#[serde(default)]` on
      `values`/`preset_asset_id` (DR-0041 §6.1, §10).
- [ ] **Catalog layout delivery.** The generated `shader_parameter_layouts.json`
      already projects every shader's schema (`shader_parameter_layout_artifact.md`).
      Decide and implement delivery to the client: publish it as a streamed asset in
      the catalog the client already pulls, OR a replicated layout resource
      (DR-0041 §13 Q1). **Recommendation:** publish as a catalog asset (no new
      replication lane; reuses `system.asset_delivery_cache.v1`).
- [ ] **Server validation.** Gateway/replication validate authored `values` against
      the layout for `schema_id`: known names, component counts, ranges, kinds. Reuse
      the `sidereal-scripting` decode path that already parses `editor_schema`.
- [ ] **Client packer.** Resolve named values → opaque family `params[]` lanes using
      the layout (`name → (lane index, component)`), fill defaults for omitted
      values, cache the resolution per `schema_id` (resolve once, not per frame;
      DR-0041 §12 risk 2). Pack into the family uniform buffer.
- [ ] **Generic family uniform blocks.** Define, per family, a shared engine/lighting
      header + opaque `params: array<vec4<f32>, N>` with fixed `N` (fullscreen
      N≈27 to match today's 432 B; planet N≈40+header to match 736 B; effect to
      match 96 B + 384 B). Keep `shaders.rs` `expected_uniform_size_bytes` + binding
      validation as the ABI guard; preserve the naga preflight + fail-soft fallback
      (DR-0029 2026-04-28 note).
- [ ] **WGSL alias prelude generation.** Generate `let nebula_power = params[6].x;`
      style aliases from the schema at shader-install time (DR-0041 §6.3), validated
      with naga before install. This lets each migrated WGSL keep readable names
      while the ABI stays opaque/shared. (If this proves heavy, families may read
      lanes directly as an interim step.)

## 4. Workstream B — Per-Family Migration (repeat per family)

Each family migration is one reviewable slice with the same checklist:

1. [ ] Consolidate all parameter metadata into the Lua registry schema
       (label/description/range/step/default/group/lane) — most already present;
       remove any defaults still duplicated in Rust.
2. [ ] Regenerate `shader_parameter_layouts.json` (`gen-shader-parameter-layouts`).
3. [ ] Switch the client packer for that family from the typed struct path
       (e.g. `populate_space_background_uniforms`, `PlanetBodyUniforms::from_settings`)
       to the generic name→lane packer.
4. [ ] Inject the generated WGSL alias prelude (or direct-lane reads) so the shader
       compiles against the opaque params block.
5. [ ] **Persisted-data upgrade shim** (the load-bearing risk): on load, translate
       the legacy typed component blob → `ShaderParameterSet` (schema_id + field→name
       map), then drop the legacy component. Document as short-lived (DR-0027 Phase 4
       pattern). Cover with tests against real persisted blobs.
6. [ ] Remove the typed `*ShaderSettings` struct and its registration.
7. [ ] Republish the catalog; confirm source/cache parity and dashboard + software
       preview reproduce the prior look (`render_space_backdrop_preview.mjs`,
       `planet_preview_study`).
8. [ ] Native + WASM + Windows `cargo check`.

### Recommended family order (lowest migration risk first, best parity harness first)

1. **Space background (base + nebula).** Has the richest schema, a software-preview
   harness, and is DR-0041's named slice — best place to shake out the foundation
   with a known-good look to reproduce.
2. **Starfield.** Same fullscreen stack, smaller schema.
3. **Planet / star.** Shared `PlanetBodyUniforms`; has `planet_preview_study`.
4. **Effect (thruster plume).** Smallest, world-space, exercises the effect family
   header.

After family 4, no typed shader-settings structs remain and the asteroid plan's
Phase 1a prerequisite is satisfied by completed infrastructure.

## 5. Phased Delivery

- **Phase T0** — Foundation (Workstream A). No visible behavior change. **DONE.**
- **Phase T1** — Migrate space background (Workstream B); prove parity via preview.
  **DONE (2026-06-01).** The typed `SpaceBackgroundShaderSettings` component is
  deleted; both backdrop layers carry a generic `ShaderParameterSet` authored in
  `world_init.lua` (base/nebula schemas). The client
  `update_space_background_material_system` packs per-schema via
  `ShaderParameterLayouts::pack` and writes the named lanes into the material
  uniform; visibility is owned by `RuntimeRenderLayerDefinition.enabled`. Backdrop
  preview is byte-identical before/after. No back-compat shim (DB reset). Note:
  there were no persisted real-world blobs to migrate (DB reset), so the T1
  persisted-upgrade-shim risk did not apply.
- **Phase T2** — Migrate starfield. **DONE (2026-06-01).** The typed
  `StarfieldShaderSettings` component is deleted; the `bg_starfield` layer carries a
  generic `ShaderParameterSet` (`schema_id = "starfield_wgsl"`) authored in
  `world_init.lua`. The client `update_starfield_material_system` queries
  `&ShaderParameterSet` + `Res<ShaderParameterLayouts>`, packs via
  `ShaderParameterLayouts::pack` and writes the named lanes into the material's 9
  separate `vec4` bindings (header from `FullscreenExternalWorldData`; star/corona
  color `.w = 1.0` ABI constants applied). Visibility is owned by
  `RuntimeRenderLayerDefinition.enabled`. The starfield ABI was unchanged (no
  texture binding to drop, unlike space background); `starfield.wgsl` and the
  `starfield_wgsl` `editor_schema` were already correct (all 14 params map to lanes
  the shader reads — no dead params, no Lua/Rust default drift). The fullscreen
  `material_kind` for starfield is now resolved purely from `shader_asset_id` via
  shader assignments (the legacy typed-settings heuristic is removed). Parity
  asserted by `starfield_param_set_tests` before deleting the typed path. No
  back-compat shim (DB reset).
- **Phase T3** — Migrate planet/star. **DEFERRED (deliberate exception, see §1).**
  `PlanetBodyShaderSettings` is retained; revisit with Genesis Shader V2.
- **Phase T4** — Migrate effect (thruster plume). **DONE (2026-06-01).** The typed
  `ThrusterPlumeShaderSettings` component is deleted; the thruster plume's authored
  shader knobs carry a generic `ShaderParameterSet` (`schema_id =
  "runtime_effect_wgsl"`) authored on the engine module
  (`ship_modules/engine_main_mk1.lua`). The client
  `update_thruster_plume_visuals_system` queries `&ShaderParameterSet` +
  `Res<ShaderParameterLayouts>`, packs via `ShaderParameterLayouts::pack`, and builds
  the 96 B effect uniform with `runtime_effect_uniforms_from_lanes` (authored shape
  lane `effect.params_a` + palette lanes `effect.color_a/b/c`, color `.w = 1.0` ABI
  constant applied). The runtime fields stay system-owned and are overlaid every
  frame: `effect.identity_a.x` = effect-kind ABI constant, `.y` = time, `.z` = live
  thrust, `.w` = derived alpha scale, and `effect.params_b.x` = live afterburner
  level. The `runtime_effect_wgsl` schema is SHARED across all four effect kinds
  (thruster/spark/explosion/beam) and is correct as-is — every lane it authors is
  read by at least one kind, so there were no dead params and no Lua/Rust default
  drift to fix (the registry schema was never a mirror of the typed struct). The
  thruster's CPU-side geometry/reactive config (base/max length & width, idle/max
  alpha, reactive/afterburner scaling) never had a uniform lane; it is NOT a shader
  parameter, so it became fixed constants (`THRUSTER_PLUME_GEOMETRY`) in the thruster
  visual system, matching the sole authoring source's values. The legacy `enabled`
  master toggle and `debug_*` fields were dropped (plume visibility is driven by the
  computed alpha as it already was). Parity asserted by `runtime_effect_param_set_tests`
  (packed lanes + runtime overlay == the prior typed `RuntimeEffectUniforms::thruster_plume`)
  before deleting the typed path. No back-compat shim (DB reset). After T4 the sole
  `*ShaderSettings` struct left in `sidereal-game` is the intentional
  `PlanetBodyShaderSettings` exception.
- **Phase T5** — Hardening: packer-cache perf check, fail-soft telemetry,
  native/WASM/Windows parity, docs.
- **Then** — asteroid visual rebuild begins (does NOT depend on planet migration;
  uses the generic foundation + the planet shader as the crater/cell-shade reference).

## 6. Risks

1. **Persisted-data migration** (highest, DR-0041 §10/§12). Every in-scope family
   has persisted/replicated typed blobs in existing dev worlds. Mitigation: per-family
   upgrade shim + tests against captured real blobs; keep shims short-lived and
   documented; stage one family at a time so a bad shim is isolated.
2. **Look regression.** Generic packing must reproduce each shader's current look.
   Mitigation: software-preview parity (space background, planet study) and in-game
   review per family before removing the typed struct.
3. **ABI/byte-layout drift.** Opaque `params[N]` must match the existing uniform
   size per family. Mitigation: keep `expected_uniform_size_bytes` as the guard;
   add a test asserting each family's generic block equals its legacy size.
4. **Packer performance.** Per-entity name→lane resolution must be cached per schema.
5. **WGSL prelude correctness/determinism.** Generated aliases must be deterministic
   and naga-validated before install (DR-0041 §12 risk 4).
6. **Schedule.** Full migration before any asteroid value is the accepted trade-off;
   front-loaded effort and the riskiest item (persisted migration) come first.

## 7. Tests

- Generic component metadata + serde roundtrip (values, preset ref, schema_id).
- Layout-driven validation: reject unknown names / out-of-range / wrong component count.
- Packer parity: for each family, generic packing of default values produces a uniform
  buffer byte-equal to the legacy typed packing (golden test before struct removal).
- Persisted upgrade shim: legacy blob → `ShaderParameterSet` for each family, against
  real captured blobs.
- Source/cache parity for any edited WGSL; naga validation for prelude-injected sources.
- Software-preview parity snapshots (space background, planet study).
- Native + WASM + Windows compile checks.

## 8. Open Questions

1. Layout delivery: published catalog asset (recommended) vs replicated resource.
2. WGSL alias prelude now vs direct-lane reads as an interim (affects T0 size).
3. Do we keep `preset_asset_id` server-expanded at author time, or resolved at pack
   time on the client (DR-0041 §13 Q3)?
4. Tactical overlay: fold into the same pattern at the end of this plan, or leave it
   as a fixed schema per DR-0029?
