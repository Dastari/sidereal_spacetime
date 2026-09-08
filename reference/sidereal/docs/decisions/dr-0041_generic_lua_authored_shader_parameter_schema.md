# DR-0041: Generic Lua-Authored Shader Parameter Schema

Status: Active
Lifecycle: source-of-truth
Category: decision
Last updated: 2026-06-04
Owners: architecture
Scope: DR-0041: Generic Lua-Authored Shader Parameter Schema.
Source of truth: yes
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

Date: 2026-05-29
Owners: client rendering + scripting + replication + gateway + dashboard

Status note (2026-06-01):

1. Execution sequencing decided: complete the **full migration of all typed-settings
   shader families** to `ShaderParameterSet` before any new asteroid/world-sprite
   visual content. This supersedes the earlier idea of using a brand-new asteroid
   shader as the first vertical slice.
2. Family migration order: space background (base + nebula) → starfield →
   planet/star → effect (thruster plume). Space background remains the first slice
   per §11 because it has a software-preview parity harness.
3. The persisted-data upgrade shim (§10) is the central risk and is staged one
   family at a time.
4. Execution plan: `docs/plans/proposed/shader_parameter_set_transition_plan_2026-06-01.md`.
   The asteroid rebuild (`docs/plans/proposed/asteroid_visual_generation_and_preview_plan_2026-06-01.md`)
   depends only on the generic foundation (done) + the planet shader as a reference,
   NOT on completing every family migration.
5. **`PlanetBodyShaderSettings` is a deliberate exception and is NOT migrated**
   (decided 2026-06-01). It is not a pure rendering-settings struct: it is the
   Genesis planet content-authoring schema (`PlanetRegistryEntry`, per-planet Lua,
   dashboard Genesis editor, draft/publish API). Migrating it would regress the
   Genesis planet-editor UX and will be re-decided as part of Genesis Shader V2.
   Goal 1 ("no game-specific settings struct in the backend") is therefore only
   partially met by design — the planet family keeps a typed domain representation;
   all other families use the generic component. The pipeline-family identity lives
   in the typed *structure* components (`RuntimeRenderLayerDefinition`,
   `RuntimePostProcessStack`, `RuntimeWorldVisualStack`, `RuntimeEffectMaterial`),
   not in per-family param structs.

Primary references:
- `docs/decisions/dr-0027_lua_authored_render_layers_and_generic_shader_pipeline.md`
- `docs/decisions/dr-0029_runtime_shader_family_taxonomy_and_lua_authoring_model.md`
- `docs/features/reference/space_backdrop_shader_stack_reference.md`
- `docs/features/reference/shader_preview_generator_reference.md`
- `crates/sidereal-game/src/components/space_background_shader_settings.rs`
- `bins/sidereal-client/src/runtime/backdrop/materials.rs`
- `bins/sidereal-client/src/runtime/shaders.rs`
- `data/scripts/assets/registry.lua`

## 1. Decision Summary

Shader *parameter settings* (the named values, defaults, ranges, and descriptions
for a shader) should be authored entirely in the Lua asset registry and delivered
to the runtime as a single **generic, validated shader-parameter component** —
not as one hand-written, project-specific Rust struct per shader with hardcoded
defaults.

Rust keeps ownership of exactly what it must: a small fixed set of material/shader
*family ABIs*, component registration, validation, replication/persistence, and
runtime execution. Everything that is "what does this shader's knob mean, what is
its range, what is its default, what does it describe" moves to Lua, which is
already the source of truth for most of it.

This finishes the migration that DR-0027 (§13.1) and DR-0029 (§4) already accepted
as the target direction, for the one area that was never converted: fullscreen
background / starfield / planet / effect *parameter payloads*.

## 2. Motivation

The user goal: the backend server should be reusable for non-space projects with
no "space" code compiled into it. Concretely, files like
`space_background_shader_settings.rs` should not exist as bespoke Rust types; shader
settings should be Lua data. Bevy components/materials may still be registered in
Rust.

Three concrete problems today:

### 2.1 Project-specific shader structs are compiled into the backend

`SpaceBackgroundShaderSettings`, `StarfieldShaderSettings`,
`PlanetBodyShaderSettings`, and `ThrusterPlumeShaderSettings` are hand-written
typed structs in the shared `sidereal-game` crate. They carry ~60 space-specific
fields each plus **hardcoded default values**. The servers
(`sidereal-gateway`, `sidereal-replication`, `sidereal-persistence-service`) link
`sidereal-game`, so this content schema is compiled into the backend even though
the backend never reads a single field — it round-trips these components purely by
registered `kind` + Reflect (every non-test reference in the server binaries is a
`component_kind` string literal or a `#[cfg(test)]` use).

So the backend is *already generic at runtime*; the coupling is that the **type
definitions and their defaults** are space-specific Rust code that the engine
crate forces every server to compile.

### 2.2 Uniform variable names are semantic but were designed per-shader, then shared

Several WGSL shaders share one Rust uniform ABI. Example: `SpaceBackgroundUniforms`
(432 bytes = a shared engine header + 24 named `vec4` blocks) is used by **both**
`space_background_base.wgsl` and `space_background_nebula.wgsl`. The base shader
never reads `space_bg_shafts_a` / `space_bg_backlight_color`; the nebula shader
ignores other fields. `PlanetBodyUniforms` is shared by planet and star visuals the
same way. The result is a struct full of names that are meaningful for one shader
and meaningless noise for another. The names are baked into the Rust ABI and the
WGSL, so they cannot be specialized per shader without editing Rust.

### 2.3 Defaults and descriptions are duplicated and partly missing

`registry.lua` already defines, per parameter: `kind`, `label`, `min`, `max`,
`step`, `default`, `group`, an optional `description`, and the uniform binding
(`uniform = "params.space_bg_noise_b", components = {3}`). The Rust struct then
*re-declares the same defaults* (e.g. `nebula_power = 1.05` in both). They drift.
The dashboard shader editor wants authoritative descriptions/ranges for every
variable; today that lives in Lua for some families and only implicitly (field
names) in Rust for others.

### 2.4 The model must scale to all future shaders

The game will accumulate many more shaders: a full post-process pipeline (bloom,
distortion, vignette, color grade, heat haze, warp), screen overlays (tactical,
scanner, radar), more world effects (shields, shockwaves, beams, smoke), and
world-space material variants. We should not add a new Rust struct + hardcoded
defaults per shader each time.

## 3. Current Architecture (as-is)

1. **Backend is generic.** Components are declared with
   `#[sidereal_component(kind=..., persist=..., replicate=..., visibility=...)]`,
   which registers Reflect + Lightyear replication + metadata via `inventory`.
   Gateway/replication/persistence validate, persist, and replicate by `kind`
   string and Reflect; they never interpret shader fields.
2. **Fixed family ABIs live in the client.** `bins/.../runtime/shaders.rs` defines
   `RuntimeShaderSlot` (Starfield, SpaceBackgroundBase/Nebula, GenericSprite,
   AsteroidSprite, PlanetVisual, StarVisual, RuntimeEffect, TacticalMapOverlay) and
   validates every streamed WGSL against an expected binding list + expected uniform
   byte size (e.g. SpaceBackground = 432 B, PlanetVisual = 736 B, RuntimeEffect =
   96 + 384 B). This is the real engine ABI boundary and it is good — keep it.
3. **Client packs typed → uniforms by hand.** `materials.rs`
   `populate_space_background_uniforms` maps each typed field to a `vec4` lane. This
   is the per-field Rust code we want to delete.
4. **Lua already holds most of the schema.** `registry.lua` has
   `space_background_uniform_schema` (+ base/nebula picks), starfield schema, and
   planet bindings, including labels/ranges/defaults/descriptions and uniform-lane
   bindings.
5. **A generic params reference already exists.** `RuntimeRenderLayerDefinition` and
   `RuntimePostProcessPass` already carry `params_asset_id: Option<String>` and
   `texture_bindings`, and the render-layer / world-visual-stack / post-process-stack
   components are fully generic and Lua-authored. The fullscreen background params
   were simply never moved onto that path.

Relationship to prior DRs: DR-0027 §13.1 lists "fixed fullscreen layer kinds" and
the fixed shader-settings fields as known conflicts to migrate. DR-0029 §4 states
"Lua owns named, validated parameter payloads; Rust packs them into uniform blocks"
and keeps `StarfieldMaterial` / `SpaceBackgroundMaterial` as fixed schemas "for now."
This DR is the concrete execution of that for parameters.

## 4. Goals

1. No game-/space-specific shader *settings* types or defaults compiled into the
   backend. The server compiles generic render/material machinery + a single generic
   params component only.
2. Lua registry is the single source of truth for every shader parameter's
   name, label, description, group, range, step, default, and uniform-lane binding.
3. Per-shader parameter naming: each shader sees only the parameters it actually
   uses, with readable names; shared family ABIs no longer force meaningless names
   onto a shader.
4. The dashboard shader editor derives all controls + descriptions from that single
   schema with no Rust duplication.
5. The model scales to fullscreen background, post-process, screen overlay, world
   sprite/polygon, planet, and effect families without new bespoke Rust types.
6. Preserve the existing fixed family ABI validation and fail-soft streamed-shader
   behavior (DR-0029 status note 2026-04-28).

## 5. Non-Goals

1. Generating new Bevy `Material2d` types from Lua at runtime (Bevy materials are
   type-static; this remains a Rust-owned boundary — unchanged by Bevy 0.19).
2. Collapsing the family ABIs themselves. We keep the small fixed family set.
3. Removing Bevy component *registration* from Rust. Components are still registered
   in `.rs`; only their *content schema/values* move to Lua.
4. Rewriting gameplay components (ships, asteroids, weapons). This DR is scoped to
   shader parameter settings.

## 6. The Decision in Detail

### 6.1 One generic shader-parameter component

Replace the per-shader typed settings structs with a single generic component, e.g.:

```rust
#[sidereal_component(kind = "shader_parameter_set", persist = true, replicate = true, visibility = [Public])]
pub struct ShaderParameterSet {
    /// Schema/shader identity this payload conforms to (catalog key).
    pub schema_id: String,
    /// Optional shared preset reference (large/common defaults by asset id).
    pub preset_asset_id: Option<String>,
    /// Per-instance named overrides. Validated against the catalog schema.
    pub values: Vec<ShaderParameterValue>,
}

pub struct ShaderParameterValue {
    pub name: String,     // e.g. "nebula_power"
    pub data: SmallVec<[f32; 4]>, // 1..=4 components
}
```

This is generic, self-describing on the wire, and contains no space terms. It is
the DR-0029 "named, validated parameters" model made concrete. It can attach to the
same config entities that already carry render-layer definitions.

### 6.2 Lua schema is the single source of truth

The registry entry for a shader asset declares its parameter schema once:

```lua
shader_parameters = {
  nebula_power = {
    kind = "Float", label = "Nebula Power",
    description = "Sharpness of the nebula density falloff.",
    min = 0.2, max = 4.0, step = 0.05, default = 1.05, group = "Nebula Noise",
    uniform = { lane = "noise_b", component = 0 },   -- family-relative lane name
  },
  nebula_hue_drift = {
    kind = "Float", label = "Nebula Hue Drift",
    description = "0 = single hue, 1 = full violet drift across the band.",
    min = 0.0, max = 1.0, step = 0.01, default = 1.0, group = "Nebula Color",
    uniform = { lane = "noise_b", component = 3 },
  },
  -- ...
}
```

When the registry is published, the build emits a compact **parameter layout** per
shader asset into the asset catalog: `name -> (family lane index, component,
default, range, kind)`. This layout is the contract shared by:
- the gateway/replication **validator** (server-side, already loads the catalog),
- the **client** packer (resolves names → uniform offsets, fills defaults),
- the **dashboard** editor (labels, descriptions, ranges, groups).

No Rust file restates any of this.

### 6.3 Generalized family ABI and per-shader readable names

Keep the fixed family ABIs from `shaders.rs`, but make the uniform block **opaque**
at the Rust/ABI level:

- a shared **engine header** lane block (the genuinely shared inputs: time,
  viewport, camera/drift/velocity, exposure, seed) — one struct, reused by all
  families;
- a generic **params block** `params: array<vec4<f32>, N>` (N fixed per family,
  e.g. fullscreen N≈24, planet N≈40, effect N≈6) with **no semantic field names**;
- fixed **texture/sampler slots**.

Readable, per-shader names come back via a tiny **generated WGSL prelude** built
from the Lua schema and injected at shader-install time (the preview crate and the
runtime shader installer already normalize/validate WGSL, so this is a natural hook):

```wgsl
// generated from registry schema for space_background_nebula
let nebula_power     = params[6].x;
let nebula_hue_drift = params[6].w;
let nebula_color_hot = params[16].xyz;
```

This fixes §2.2 directly: each shader aliases only the lanes it uses, with names it
chooses, while the Rust ABI stays generic and shared. Unused lanes are simply never
aliased, so there are no "meaningless variables" in any individual shader.

### 6.4 Keep fixed Rust material families

Per DR-0029, the engine still ships the bounded set of `Material2d`/material
families (fullscreen background, world sprite, world polygon, planet visual, effect,
post-process, screen overlay). Lua selects which family + shader asset + params; Rust
owns the family ABI and execution. This DR does not change that boundary.

## 7. Recommended Wire Format

The user asked for a recommendation between (a) inline pre-packed uniform block,
(b) inline named values, (c) `params_asset_id` payload.

**Recommendation: inline named values (6.1), plus an optional `preset_asset_id`
reference for large/shared presets.** Rationale:

- **Named values** keep the payload self-describing and let the server validate
  names, component counts, and ranges against the catalog schema — impossible with a
  pre-packed float blob, which the server cannot meaningfully check and which forces
  byte-layout knowledge into Lua content.
- It matches the already-accepted DR-0029 "named validated parameters, Rust packs"
  model and the existing `registry.lua` binding metadata.
- **Pre-packed uniform block** is rejected as the primary format: it defeats
  validation, defeats the editor's ability to reason about variables, and couples
  Lua to byte offsets. (The *client* still produces a packed block internally — but
  from validated named values, not from the wire.)
- **`params_asset_id`** is kept as an *optional* mechanism for shared/large presets
  (the field already exists on layer/pass components). Per-entity overrides stay
  inline. This gives "preset by reference + small named overrides inline," which is
  the most ergonomic and the least chatty.

So: catalog-published layout (from Lua) is the schema; the wire carries named values
(+ optional preset ref); the server validates; the client packs into the fixed
family buffer.

## 8. Bevy 0.19 Opportunity

The repo pins Bevy `0.18.0`. Bevy `0.19.0-rc.2` shipped 2026-05-22 and contains
changes that make the generic fullscreen + post-process pipeline materially simpler.
We should plan this generalization to **land on or just after a 0.19 upgrade** rather
than hand-rolling adapters we would then rewrite.

Relevant 0.19 changes:

1. **Render Graph as Systems** (PR #22144). The `RenderGraph` node API is removed;
   render passes become ordinary systems in `Core2d`/`Core3d` schedules using a
   `ViewQuery` + `RenderContext` system param, ordered with `.before()/.after()`.
   Our current fullscreen/post-process execution uses bespoke content adapters
   (DR-0027 §5.0 item 1, §14.3 risk 1). On 0.19 each authored pass can be a plain
   system, which is a large reduction in custom-render boilerplate and fits a
   data-driven, Lua-authored pass list cleanly.
2. **`FullscreenMaterial` trait** (`FullScreenMaterial` API; PR #23786). Bevy now has
   a first-class fullscreen-material abstraction with `schedule_configs(...)` ordering.
   This is close to what our `RuntimeFullscreenShaderMaterial` / post-process passes
   want to be; we can build the generic fullscreen + post-process families on top of
   it instead of custom quads.
3. **Core2d post-process split** (PR #23098). `Core2dSystems` now exposes `Prepass`,
   `MainPass`, `EarlyPostProcess`, `PostProcess` sets (2D gains a `Prepass`). This
   gives clean, ordered insertion points for: fullscreen background (before MainPass),
   fullscreen foreground (after MainPass / EarlyPostProcess), and the post-process
   stack (PostProcess) — matching DR-0027's four phases without a custom scheduler.
4. **`bevy_material` crate** (PR #22426) and **`bevy_shader`** extraction: mostly
   re-exports; minor mechanical migration. Confirms material machinery is being
   modularized in the direction we depend on.

What 0.19 does **not** change: `Material2d` is still type-static, so the fixed
family ABI boundary (Non-Goal 1) stays. 0.19 improves *execution/composition*, not
runtime material-type generation.

Recommendation: treat the Bevy 0.19 upgrade as a prerequisite/companion workstream
for the post-process pipeline portion, and implement the new generic fullscreen +
post-process families using `FullscreenMaterial` + `Core2dSystems` + render-graph-as-
systems. The parameter-schema generalization (§6) is independent of the Bevy version
and can begin first.

## 9. Coverage for Future Shader Families

The model in §6 scales without new bespoke types:

- **Fullscreen background** (starfield, nebula, base): generic params block + engine
  header; today's 432 B layout becomes opaque `params[0..N]` + schema.
- **Post-process pipeline** (bloom, distortion, vignette, grade, warp, heat haze):
  authored `RuntimePostProcessStack` passes, each a `FullscreenMaterial` system on
  `Core2dSystems::PostProcess`, parameters via the same `ShaderParameterSet`.
- **Screen overlays** (tactical, scanner, radar): fullscreen-foreground family, same
  params model (DR-0029 §3.5 keeps tactical as a fixed schema for now — compatible).
- **World sprite / polygon**: already generic per DR-0027; gains the same params
  schema instead of asteroid/sprite-specific fields.
- **Planet visual & effects**: collapse the remaining typed `PlanetBodyUniforms` /
  effect fields onto opaque params + schema; family ABIs already unified per DR-0029.

## 10. Persisted Data and Compatibility

This is the main risk surface. Existing worlds already persist
`space_background_shader_settings` (and friends) component blobs.

Approach:
1. Keep the old `kind` strings readable during migration via a one-time **upgrade
   shim**: on load, translate a legacy typed settings blob into a
   `shader_parameter_set` using the published schema's field→name map, then drop the
   legacy component. Document it as short-lived (consistent with DR-0027 Phase 4
   "temporary migration shim only if documented and short-lived").
2. The generic component must use `#[serde(default)]` on `values`/`preset_asset_id`
   so partial/missing payloads load (matches existing component conventions).
3. Defaults are filled from the catalog layout at pack time, so a payload that omits
   a value is well-defined without Rust defaults.

## 11. Phased Plan

Phase 0 — Decision + schema contract (this DR)
- [x] Confirm backend is generic-by-kind; confirm Lua already holds most schema.
- [ ] Agree wire format (§7) and family ABI generalization (§6.3).
- [ ] Specify the catalog "parameter layout" artifact emitted from the Lua registry.

Phase 1 — Schema source-of-truth consolidation (no behavior change)
- [ ] Move all per-parameter metadata (label/description/range/default/group/lane)
      into the Lua registry for every shader family; remove duplicated Rust defaults.
- [ ] Emit the compact parameter-layout artifact into the published catalog.
- [ ] Dashboard editor reads layout from the catalog (single source).

Phase 2 — Generic component + validation + packing (vertical slice: space background)
- [ ] Add `ShaderParameterSet` generic component (+ macro registration).
- [ ] Gateway/replication validation against the catalog layout (names, counts,
      ranges, schema_id).
- [ ] Client generic packer: named values + defaults → fixed family uniform buffer,
      using the layout; delete `populate_space_background_uniforms` field code.
- [ ] Generated WGSL alias prelude from schema at shader-install time.
- [ ] Persisted-data upgrade shim for `space_background_shader_settings`.
- [ ] Verify in-game + software preview parity (`render_space_backdrop_preview.mjs`).

Phase 3 — Migrate remaining families
- [ ] Starfield, planet/star, effect families onto `ShaderParameterSet`.
- [ ] Remove `SpaceBackgroundShaderSettings`, `StarfieldShaderSettings`,
      `PlanetBodyShaderSettings`, `ThrusterPlumeShaderSettings` typed structs.
- [ ] Confirm no space-specific shader settings type remains in `sidereal-game`.

Phase 4 — Bevy 0.19 upgrade + post-process pipeline
- [ ] Upgrade to Bevy 0.19; adopt render-graph-as-systems + `Core2dSystems` sets.
- [ ] Build generic fullscreen background/foreground + post-process families on
      `FullscreenMaterial`; drive passes from authored stacks + `ShaderParameterSet`.
- [ ] Build out the post-process pipeline content (bloom/distortion/grade/etc.).

Phase 5 — Hardening
- [ ] Compile/churn budgeting, fail-soft fallback telemetry.
- [ ] Native/WASM/Windows parity (`cargo check` across targets).

## 12. Risks

1. **Client schema availability.** The client must have the parameter layout to pack.
   Mitigation: publish it in the asset catalog the client already streams; or
   replicate a compact layout resource. Decide in Phase 1.
2. **Performance of generic packing.** Per-entity name→offset resolution must be
   cached (resolve once per schema, not per frame).
3. **Persisted-data migration** (see §10) is the highest-regression area; the shim
   must be covered by tests against real persisted blobs.
4. **WGSL prelude generation** must be deterministic and validated (naga) before
   install, consistent with the 2026-04-28 streamed-shader safety contract.
5. **Bevy 0.19 upgrade scope.** Render-graph-as-systems touches all custom passes;
   keep it a separate workstream (Phase 4) so the parameter migration is not blocked.

## 13. Open Questions

1. Should the parameter layout be a published **asset** (client streams it) or a
   **replicated resource** (server pushes it)? (Affects Phase 1/2 boundary.)
2. Do we want one universal family-relative lane vocabulary (`header`, `params[i]`)
   or keep per-family lane names in the schema only?
3. Should `preset_asset_id` presets be validated/expanded server-side at author time,
   or stay references resolved at pack time on the client?
4. Timeline: do we want Phase 1–3 (parameter generalization) to land before the Bevy
   0.19 upgrade, or fold them together? (Recommendation: parameters first, 0.19 +
   post-process second.)
