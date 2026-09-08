# Hand-off: finish DR-0041 T1 (space background → ShaderParameterSet)

Status: Implemented
Lifecycle: completed
Category: plan
Last updated: 2026-06-04
Owners: implementation owners
Scope: Hand-off: finish DR-0041 T1 (space background → ShaderParameterSet).
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

Paste this as the opening prompt for a fresh agent session. It is self-contained.

---

You are continuing the **DR-0041 ShaderParameterSet migration**. Read these first:
- `docs/decisions/dr-0041_generic_lua_authored_shader_parameter_schema.md` (the decision)
- `docs/plans/proposed/shader_parameter_set_transition_plan_2026-06-01.md` (the execution plan; you are in **Phase T1: space background**)
- `docs/plans/proposed/asteroid_visual_generation_and_preview_plan_2026-06-01.md` (what this all unblocks, later)

**Overall strategy (decided by the user):** migrate ALL typed-settings shader families to the generic `ShaderParameterSet` BEFORE new content work. Family order: space background (T1, in progress) → starfield (T2) → planet/star (T3) → effect (T4). **No back-compat, no migration shims — the database will be reset.** Land on the documented implementation only.

## What is already DONE and green

**T0 foundation (complete):**
- `ShaderParameterSet` component: `crates/sidereal-game/src/components/shader_parameter_set.rs` (`schema_id`, `preset_asset_id`, `values: Vec<ShaderParameterValue{name, components}>`).
- Layout + packer + validator: `crates/sidereal-game/src/shader_parameter_layout.rs` — `ShaderParameterLayout/ShaderAssetParameterLayout/ShaderParameterLayoutManifest`, `pack_shader_parameter_lanes(layout, set) -> PackedShaderLanes` (lane name → `[f32;4]`, fills layout defaults), `validate_shader_parameter_set`, `bundled_shader_parameter_layout_manifest()` (the generated artifact compiled in via `include_str!`), and the `ShaderParameterLayouts` Bevy resource with `.pack(&set)` (looks up `set.schema_id`).
- `sidereal-scripting` re-exports those types (single source of truth) and validates authored `shader_parameter_set` graph records against the layout in the `"shader_parameter_set"` arm of the `match component.component_kind` loop in `crates/sidereal-scripting/src/lib.rs` (~line 1482).
- Generated artifact `data/generated/shader_parameter_layouts.json`; regenerate with `cargo run -p sidereal-scripting --bin gen-shader-parameter-layouts`; drift guarded by test `shader_parameter_layouts_artifact_is_current`.

**T1 so far (complete):**
- **Schema corrected to actual shader usage** in `data/scripts/assets/registry.lua`: base pick = 17 params (lanes the base shader reads), nebula pick = 45 params (lanes nebula reads). Dead params dropped (`star_mask_*`, `star_color`, `star_count`, `star_size_*`, `depth_*`, `flares_blend/opacity`, `flare_texture_set`). Fixed `enable_flares_layer` default true→false (was Lua/Rust drift). Dropped vestigial `enabled` (collided with `enable_nebula_layer` on `section_flags[0]`). `zoom_rate` kept **reserved** in both (future galaxy-movement; see memory `space-backdrop-galaxy-movement-future`).
- **Flare texture removed** (procedural now): `data/shaders/space_background_base.wgsl` + `space_background_nebula.wgsl` drop bindings 1/2 and generate flare/shaft-noise in-shader; `SPACE_BACKGROUND_BINDINGS` in `bins/sidereal-client/src/runtime/shaders.rs` is now a single `uniform@0`; WASM fallbacks stripped; `flare_texture` removed from `SpaceBackgroundMaterial`/`SpaceBackgroundNebulaMaterial`; flare deps + 4 `space_bg_flare_*_png` assets removed from registry.
- **Parity proven**: `bins/sidereal-client/src/runtime/backdrop/materials.rs` has `pack_space_background_lanes` (merges base+nebula layouts — used only by the test) and `populate_space_background_uniforms_from_lanes(uniform, world_data, &lanes, flare_enabled)` (lanes→uniform + engine header + ABI `w=1.0` constants). Test `space_background_param_set_tests` confirms the packed path == typed `populate_space_background_uniforms(default)` on the **shader-read lanes** (dead lanes excluded).

**Verify current state is green:**
```
cargo test -p sidereal-game -p sidereal-scripting -p sidereal-client --lib
node scripts/render_space_backdrop_preview.mjs tmp/check.png 768 432   # backdrop must render
```

## Critical facts / invariants

- **Lane usage** (verified via `grep -oE "params\.space_bg_[a-z_]+"`):
  - base reads: `background, flare, flare_tint, params, section_flags, tint`
  - nebula reads: `backlight_color, blend_a, light_a, light_b, light_flags, nebula_color_a/b/c, noise_a/b, params, section_flags, shafts_a/b, tint`
  - **dead** (no shader reads): `star_mask_a/b/c, star_color, depth_a, blend_b`
- **Per-entity ShaderParameterSet, per-schema validation.** The base layer entity uses `schema_id="space_background_base_wgsl"`; nebula uses `"space_background_nebula_wgsl"`. Each validates against its own schema. The shared lanes (`params`/`section_flags`/`tint`) are authored in BOTH schemas (both shaders read them, with different per-layer values). Pack each entity with `ShaderParameterLayouts::pack(&set)` (per-schema) — NOT the merged `pack_space_background_lanes` (that helper exists only for the golden test's full-lane comparison).
- `data/cache_stream/` is **gitignored** (local generated seed). After editing any shader source, regenerate it:
  `cargo test -p sidereal-asset-runtime regenerate_shader_cache_seed -- --ignored` (this ignored test is the "republish shaders" tool; the parity test `fullscreen_shader_cache_entries_match_sources` guards it).
- `materials.rs` is `include!`d into `backdrop/mod.rs`; shared `use` imports live in `fullscreen.rs`. Add new imports there.
- The server validator will reject any `shader_parameter_set` value whose `name` is not in the schema — use this as your authoring check.

## Remaining work: #6 (client wiring) + #7 (Lua authoring + delete typed struct)

Do it as ONE coordinated change. Suggested order:

### Step A — Lua authoring (`data/scripts/world/world_init.lua`)
Replace the two `component(record.entity_id, "space_background_shader_settings", {...})` blocks (base ~line 328, nebula ~line 408) with `shader_parameter_set` components:
- Add a Lua helper, e.g. `local function shader_param_values(flat)` that maps each `name=value` → `{ name=name, components = (table and value) or (boolean and {v and 1.0 or 0.0}) or {value} }`.
- Author only the **live** params for that entity's schema (base = the 17; nebula = the 45). Drop `enabled` (→ render-layer visibility), `flare_texture_asset_id` (gone), and all dead params. Take the values from the existing per-layer tables (base has `intensity=0.75` etc.; nebula `intensity=0.92`, `enable_backlight=true`, etc.).
- Set the layer's visibility via `RuntimeRenderLayerDefinition.enabled` (the layer record already supports `enabled`; both backdrop layers want `true`).
- Validate: run the scripting suite — the `shader_parameter_set` validator arm checks names/ranges. Also run any world_init smoke test (`crates/sidereal-scripting/tests/script_content_smoke.rs`).

### Step B — Client wiring
**First trace how `SpaceBackgroundShaderSettings` currently reaches the `MeshMaterial2d<SpaceBackgroundMaterial>` entity** (start in `bins/sidereal-client/src/runtime/backdrop/fullscreen.rs` — how fullscreen layer entities are spawned from `RuntimeRenderLayerDefinition` and how the settings component is attached/replicated). Replicate that path for `ShaderParameterSet`.
- In `bins/sidereal-client/src/runtime/backdrop/space_background.rs`, change `update_space_background_material_system` to query `&ShaderParameterSet` (+ the layer's `enabled` for `Visibility`) instead of `&SpaceBackgroundShaderSettings`, take `Res<ShaderParameterLayouts>`, compute `let lanes = layouts.pack(&set)`, then `populate_space_background_uniforms_from_lanes(&mut material.params, &world_data, &lanes, flare_enabled)`. `flare_enabled` can just be the packed `space_bg_flare.x` (flare is a normal param now) — you can drop the separate override.
- Ensure `ShaderParameterLayouts` resource is inserted at client startup (it has `Default`).

### Step C — Delete `SpaceBackgroundShaderSettings`
- Delete `crates/sidereal-game/src/components/space_background_shader_settings.rs` + its `mod`/`pub use` in `crates/sidereal-game/src/components/mod.rs`.
- Remove `populate_space_background_uniforms` from `materials.rs` and rework/remove the golden test `space_background_param_set_tests` (it compares against the typed path; after deletion, either snapshot the expected live-lane values statically or drop it — the migration it guarded is done).
- Remove refs in: `bins/sidereal-client/src/runtime/backdrop/{fullscreen.rs,space_background.rs}`, `bins/sidereal-gateway/src/auth/starter_world_scripts.rs`, `scripts/inline_rust_test_allowlist.txt`.
- Dashboard: delete `dashboard/src/components/brp-editors/SpaceBackgroundShaderSettingsEditor.tsx`; remove its registration in `brp-editors/registry.tsx`, `constants.ts`, `registry.test.ts`, and `dashboard/src/features/component-schema/registry.ts`.
- Grep `SpaceBackgroundShaderSettings` / `space_background_shader_settings` until only docs remain.

### Verify
```
cargo test -p sidereal-game -p sidereal-scripting -p sidereal-client --lib
cargo check --workspace
node scripts/render_space_backdrop_preview.mjs tmp/after.png 768 432   # look unchanged
cargo run -p sidereal-scripting --bin gen-shader-parameter-layouts      # if registry changed
cargo test -p sidereal-asset-runtime regenerate_shader_cache_seed -- --ignored  # if shaders changed
```
Then update `docs/features/reference/space_backdrop_shader_stack_reference.md` + the transition plan T1 status, and proceed to **T2 (starfield)** using the same pattern (starfield is simpler; its uniforms are 9 separate `vec4` bindings, not a packed struct — check `StarfieldMaterial` and `starfield.wgsl`).

## Watch out for
- Don't reintroduce a migration shim or coexistence path — full conversion only.
- Keep `zoom_rate` reserved (don't delete it) per the user's future galaxy-movement intent.
- The base shader reads `section_flags` and the flare gate; base authors `enable_*` = the per-layer values (base turns nebula/stars off).
- If a `shader_parameter_set` fails validation at load, the name isn't in that schema's pick list in `registry.lua`.
