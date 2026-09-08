# Shader Parameter Layout Artifact

Status: Reference
Lifecycle: active-reference
Category: feature
Last updated: 2026-06-04
Owners: feature owners
Scope: Shader Parameter Layout Artifact.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

Primary references:
- `docs/decisions/dr-0027_lua_authored_render_layers_and_generic_shader_pipeline.md`
- `docs/decisions/dr-0029_runtime_shader_family_taxonomy_and_lua_authoring_model.md`
- `data/scripts/assets/registry.lua`
- `crates/sidereal-scripting/src/lib.rs`
- `crates/sidereal-scripting/src/bin/gen_shader_parameter_layouts.rs`

## 1. What It Is

`data/generated/shader_parameter_layouts.json` is a compact, deterministic
projection of every authored shader's `editor_schema` from the Lua asset
registry. For each shader asset that declares an `editor_schema`, it lists each
parameter as:

```json
{
  "name": "intensity",
  "uniform": "params.space_bg_params",
  "components": [0],
  "kind": "Float",
  "default": 0.92,
  "min": 0.0,
  "max": 2.0,
  "label": "Intensity",
  "description": "Overall brightness multiplier applied to the composited background.",
  "group": "Global"
}
```

The top-level shape is:

```json
{
  "schema_version": 1,
  "shaders": [
    {
      "asset_id": "space_background_nebula_wgsl",
      "shader_family": "fullscreen_space_background_nebula",
      "parameters": [ /* sorted by name */ ]
    }
    /* sorted by asset_id */
  ]
}
```

It is the single place a frontend shader editor (or other tooling) can read, per
parameter, which uniform lane/components it packs into plus its editor metadata
(kind, range, default, label, description, group) without parsing Lua.

## 2. Why It Exists As A Generated Data File

The Lua schema in `data/scripts/assets/registry.lua` is the source of truth, but
it is Lua, not directly consumable by frontend/tooling. The existing publish path
(`data/published_assets/`, see `crates/sidereal-asset-runtime`) only materializes
raw asset bytes (textures, shaders) keyed by checksum; it does not carry editor
schema. The dashboard otherwise reads editor schema from the gateway at runtime.

To give tooling a stable, diffable, build-independent layout without touching the
gateway/replication delivery path, the layout is emitted as a committed generated
data file derived deterministically from the registry.

## 3. How It Is Generated

The generator parses the registry through the existing
`sidereal-scripting` decode path (so it reuses the same
`ScriptShaderEditorFieldSchema` parsing the runtime uses), projects it via
`build_shader_parameter_layout_manifest`, and serializes it deterministically
(assets sorted by `asset_id`, parameters sorted by `name`, pretty JSON with a
trailing newline).

Regenerate:

```bash
cargo run -p sidereal-scripting --bin gen-shader-parameter-layouts
```

Check (CI / pre-commit; fails on drift without writing):

```bash
cargo run -p sidereal-scripting --bin gen-shader-parameter-layouts -- --check
```

The same invariant is enforced by the test
`shader_parameter_layouts_artifact_is_current` in
`crates/sidereal-scripting/tests/asset_registry_repo_file.rs`. If you change any
shader `editor_schema` in the registry, regenerate the artifact or the test
fails.

## 4. How It Is Meant To Be Consumed

A frontend shader editor (or validation tooling) reads
`data/generated/shader_parameter_layouts.json`, looks up the shader asset by
`asset_id`, and uses each parameter's `uniform`/`components` to know where the
value packs, plus `kind`/`min`/`max`/`default`/`label`/`description`/`group` to
render and validate the editor control. This pairs with the additive generic
component `ShaderParameterSet` (DR-0041 §6.1), whose `values` carry the authored
parameter values that this layout describes.

## 5. Out Of Scope (Later Coordinated Pass)

This artifact is read-only metadata. It does not by itself:

- pack values into WGSL uniforms (the generic packer / WGSL prelude generation),
- perform server-side validation in gateway/replication,
- migrate persisted typed shader-settings components, or
- remove the typed structs (`SpaceBackgroundShaderSettings`, etc.).

Those land in later DR-0041 phases.
