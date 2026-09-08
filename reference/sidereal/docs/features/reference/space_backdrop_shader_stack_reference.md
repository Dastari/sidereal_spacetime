# Space Backdrop Shader Stack

Status: Reference
Lifecycle: active-reference
Category: feature
Last updated: 2026-06-04
Owners: feature owners
Scope: Space Backdrop Shader Stack.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

## 0. Implementation Status

2026-05-22: The dashboard shader editor supports registry-authored fullscreen stack metadata through `editor_preview` on Lua asset entries. Fullscreen backdrop layers preserve the existing fullscreen runtime material ABI. The dashboard can render one selected shader or the full stack as separate WebGPU pipelines overlaid into a 16:9 preview surface.

2026-05-22: Native runtime defaults were initially unchanged while the pixel-art shaders were registered as alternate assets. WASM impact was limited to asset catalog visibility and dashboard/browser WebGPU preview; no gameplay, transport, persistence, or authoritative state changes were introduced.

2026-05-22: The dashboard has a server-side Rust preview route for browsers or hosts without WebGPU. `/api/shaders/preview-render` calls the native `sidereal-shader-preview-render` binary, which uses `wgpu` offscreen rendering against the same WGSL source and can run on Mesa software Vulkan/GL adapters such as lavapipe or llvmpipe. This is a dashboard-only presentation path and does not change game-client rendering authority or runtime shader registration.

2026-05-23: The pixel-art backdrop is now the default canonical fullscreen
stack. Active stack ID is `space_backdrop`; active asset IDs are
`space_background_base_wgsl`, `space_background_nebula_wgsl`, and
`starfield_wgsl`. The legacy default background sources and unused shader
experiments were moved to `/root/backup/sidereal-shaders-2026-05-23/`. Native
and WASM runtime layers still use the same canonical asset IDs, so the visual
switch is an asset/registry change only; no authoritative gameplay,
persistence, replication, or transport behavior changed.

2026-05-23: The default backdrop art direction was retuned after in-game
review. The base layer now stays near-black with lower tint lift, the nebula
layer uses a localized river/void mask instead of full-screen wash, Bayer
dither was removed from the default stack, and the nebula shader now returns
standard alpha output for the runtime `AlphaMode2d::Blend` path. Lua defaults,
component defaults, and native software-preview fallbacks were aligned to the
same darker cyan-ribbon preset. This remains a presentation-only client and
dashboard change with no native/WASM authority or transport impact.

2026-05-23: The backdrop shaders were hardened against stale persisted
pre-retune values. The base layer clamps high legacy tint values and demotes
the old fullscreen flare texture to a subtle accent. Nebula light shafts are
now gated by cloud coverage and edge presence, so enabling shafts can no
longer produce a radial burst across empty space. Existing development worlds
with old palettes may still use old values, but those should no longer flood
the frame or create the fullscreen fan artifact.

2026-06-01: DR-0041 T1 complete. The space-background layers no longer carry
the typed `SpaceBackgroundShaderSettings` component (deleted) — they now carry
the generic `ShaderParameterSet` (`schema_id` = `space_background_base_wgsl` or
`space_background_nebula_wgsl`, plus authored named values). The client
`update_space_background_material_system` packs each set per-schema via
`ShaderParameterLayouts::pack` and writes the named lanes into the
`SpaceBackgroundMaterial`/`SpaceBackgroundNebulaMaterial` uniform; layer
visibility is owned by `RuntimeRenderLayerDefinition.enabled` (the legacy
`enabled` master toggle is gone). The lens flare is generated procedurally
in-shader; the flare gate is a normal authored `flare_enabled` parameter on the
packed `space_bg_flare.x` lane. `zoom_rate` stays reserved (unauthored). This
is a presentation/authoring change only; no transport or authoritative state
behavior changed, and the rendered backdrop is byte-identical.

2026-05-24: Added `scripts/render_space_backdrop_preview.mjs` as a local
software-renderer feedback loop for the canonical backdrop stack. The script
uses the same native `sidereal-shader-preview-render` path as the dashboard
fallback and writes a PNG of the base, nebula, and starfield layers. The
default stack was retuned with this loop: the base has slightly more dark-navy
lift, nebula clouds use a tighter river mask with softer broad dust, and the
starfield preserves small stars through posterization while adding rare
cross-shaped glints. This is still presentation-only and has no native/WASM
authority, persistence, replication, or transport impact.

## 1. Registry Metadata

Shader assets that need explicit dashboard display behavior should use `editor_preview` in `data/scripts/assets/registry.lua` instead of relying on filename heuristics:

```lua
editor_preview = {
  shader_class = "fullscreen",
  display_mode = "fullscreen_stack_layer",
  stack_id = "space_backdrop",
  stack_role = "nebula",
  stack_order = 10,
  default_stack = true,
  aspect_ratio = "16:9",
}
```

`shader_class` drives dashboard grouping. `display_mode`, `stack_id`, `stack_role`, and `stack_order` tell the shader editor how to compose fullscreen layers. `aspect_ratio` is a preview hint; fullscreen backdrop stacks currently use `16:9`.

## 2. Backdrop Stack

The default pixel-art stack currently contains:

- `space_background_base_wgsl`: near-black posterized space base with restrained tint lift and small distant planets.
- `space_background_nebula_wgsl`: localized nebula rivers/clouds with quantized color bands, edge backlight, and optional light shaft controls.
- `starfield_wgsl`: crisp square stars and rare brighter cross glints using the existing starfield uniforms.

These shaders are presentation-only, emissive backdrop layers. They are exempt from Lighting V2 because they do not represent world-lit gameplay surfaces and do not write authoritative simulation state.

## 3. Dashboard Preview

The shader editor renders fullscreen stacks as multiple shader sources in one preview surface. The selected shader remains editable; non-selected stack layers use their registered schema defaults. The editor should prefer `editor_preview` metadata for classification and display hints, with filename-based classification kept only as a fallback for older assets.

Browser WebGPU remains the interactive preview path. When the browser cannot create a WebGPU adapter, the editor posts the same layer WGSL and uniform values to `/api/shaders/preview-render`. The route validates dashboard admin `scripts:read` access, validates the request body with Zod, and returns a PNG preview plus diagnostics. The renderer is intentionally non-authoritative and non-realtime; animation controls may still update values, but each software frame is a discrete server render.

The software renderer discovers its binary through `SIDEREAL_SHADER_PREVIEW_RENDERER_BIN`, then `target/debug/sidereal-shader-preview-render`, then falls back to `cargo run --quiet -p sidereal-shader-preview --bin sidereal-shader-preview-render --` for development. `SIDEREAL_SHADER_PREVIEW_BACKENDS` can restrict backends, for example `vulkan` for lavapipe in a GPU-less VM.
