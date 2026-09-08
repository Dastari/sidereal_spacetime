# Genesis Planet Registry

Status: Active
Lifecycle: source-of-truth
Category: feature
Last updated: 2026-08-31
Owners: feature owners
Scope: Genesis Planet Registry.
Source of truth: yes
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

## 0. Implementation Status

- 2026-08-31: Planet definitions are durable JSON registry-definition packages under
  `data/content/planets/`. `/genesis` now exposes the real one-step lifecycle as
  **Save / Publish Package**; obsolete Lua draft/publish/discard controls and API routes
  were removed. A successful write is validated and atomically committed by the gateway,
  and the cached thumbnail is refreshed best-effort afterward. Native impact: the typed
  planet registry and live-resync path are unchanged. WASM impact: dashboard route/API
  behavior only; the game-client authority and transport split are unchanged.

- 2026-04-24: Initial implementation has started. Lua planet definitions now live under `data/scripts/planets/` with one named file per planet/celestial body and a `planets/registry.lua` index. `crates/engine-script` validates the registry and `PlanetBodyShaderSettings` payloads, and replication/gateway script contexts expose the validated definitions to `world_init.lua`. Native impact: starter planet/star content is moving from inline `world_init.lua` tables to registry-authored definitions while preserving the existing `planet.body` bundle and render path. WASM impact: no client authority split; browser impact is limited to dashboard tooling and shared shader preview paths.
- 2026-04-24: Stage 2 dashboard authoring has begun. `/genesis` now loads full editable planet definitions, exposes metadata/spawn/shader controls, supports deterministic randomization from the selected seed, and proxies save/publish/discard actions through script-catalog draft APIs for the planet file plus `planets/registry.lua`. Dashboard mutations are guarded by the existing dashboard admin session and Zod request validation. Remaining Stage 2 work: richer live shader preview integration, create/delete planet flows, and end-to-end gateway validation tests for saved Lua.
- 2026-04-26: `/genesis` now includes an initial live WebGPU visual preview panel for the selected planet definition. The preview reuses the dashboard shader preview renderer, loads the registry-declared `planet_visual_shader_asset_id` from the shader catalog, and maps `PlanetBodyShaderSettings` into the same `PlanetBodyUniforms` layout used by the native client main planet pass. Native impact: none; this is dashboard-only preview tooling. WASM impact: uses the existing browser WebGPU shader preview path, not the Bevy client runtime. Remaining preview work: exact multi-pass composition parity for clouds/rings/corona and tighter validation against generated shader editor ranges.
- 2026-04-26: Genesis catalog reads now fall back to repository disk files under `data/scripts/planets/` when the gateway script-catalog API is unavailable, so local dashboard-only development still shows Helion and Aurelia. Save, publish, and discard remain gateway script-catalog operations and do not write directly to disk from the dashboard.
- 2026-04-27: The `/genesis` preview now uses normal alpha blending in the dashboard preview pipeline and renders the planet visual shader in the same body/cloud/ring pass categories used by the native client, with pass flags rather than separate shader assets. The dashboard form exposes the currently authored cloud alpha/scale/speed, atmosphere alpha/falloff, corona size/intensity, and related lighting/weather controls. Remaining preview work: exact native transform scale/depth parity for all pass overlays and range metadata generated from the Lua shader editor schema.
- 2026-04-28: Genesis now supports the split star shader asset path. Star definitions should use `planet_visual_shader_asset_id = "star_visual_wgsl"` so the preview and runtime load `star_visual.wgsl`; changing Body Kind to Star in the dashboard switches the draft shader asset to the star asset, and changing away from Star restores the planet asset when the star default was active. Native impact: mirrors the client `world_polygon_star` material family. WASM impact: dashboard preview uses the existing browser shader-preview renderer against the new star source.
- 2026-04-28: Publishing Genesis star definitions now reaches the running replication process through the active database-backed script catalog. Replication polls active script-catalog revisions, reloads the planet registry resource, and applies changed star registry definitions to already-hydrated star entities by updating `PlanetBodyShaderSettings`, `SpriteShaderAssetId`, visual stack, transform, icon, size, and labels. Native impact: Helion authoring changes can update the live in-game star without a world reset. WASM impact: no browser-client authority change; browser impact remains dashboard preview/tooling.
- 2026-04-29: Read-only live instance routing has started under `docs/plans/proposed/live_entity_instance_editing_plan_2026-04-29.md` Phase 1. `/game-world` can resolve supported live entity GUIDs through the protected gateway edit-context API and route planet/celestial candidates to `/genesis/entities/$entityGuid`, where the dashboard shows read-only context. Native impact: no authority or runtime mutation change. WASM impact: dashboard-only route/API work.
- 2026-05-29: Planet `spawn.entity_id` is no longer hand-authored. The registry loader derives it deterministically from the unique `planet_id` (`sidereal_core::planet_body_guid`), so all `planets/*.lua` dropped their `entity_id` line and the dashboard no longer generates or serializes one. This is part of the broader fixed-entity GUID cutover (deterministic UUIDv5 for all static world content); see `docs/features/active/world_bootstrap_fixed_entity_identity_contract.md` for the derivation scheme, CI guards, and the one-shot persistence migration. Native impact: starter/world identity is now stable and collision-free by construction. WASM impact: dashboard shows the derived GUID read-only.

## 1. Purpose

Genesis is the dedicated planet/celestial authoring module for Sidereal. It exists because the generic shader workshop edits WGSL and shader metadata, but planet creation needs a higher-level content workflow:

1. named planet/celestial library entries,
2. deterministic randomization,
3. typed `PlanetBodyShaderSettings` controls,
4. preview through the existing planet visual shader family,
5. write-back to validated JSON registry-definition packages,
6. gateway-owned atomic publishing rather than direct runtime mutation.

Genesis does not replace the `planet.body` bundle. The bundle remains the graph-record factory for authoritative entities. Genesis authors reusable data definitions that the bundle consumes.

## 2. Core System Catalog Label

Genesis belongs to:

- Human title: `Genesis Planet Authoring System V1`
- Stable label: `system.genesis_planet_authoring.v1`
- Short slug: `genesis_planet_authoring_v1`

It is a content-authoring support system layered over `system.planet.v1`, `system.rendering.v1`, and `system.scripting_content_authoring.v1`.

## 3. Package Authoring Contract

Canonical files:

```text
data/content/planets/<package_id>/manifest.json
data/content/planets/<package_id>/definition.json
data/content/planets/<package_id>/thumbnail.png
```

The manifest carries the package id, kind, revision, and file hashes. The JSON definition
contains identity, display/tags, spawn metadata, and `PlanetBodyShaderSettings`. The gateway
aggregates all planet packages into the typed registry consumed by authoring and runtime
services; Genesis does not parse or generate Lua.

Rules:

1. `planet_id` is unique across the composed planet packages.
2. Package ids and paths must pass the shared content-package confinement rules.
3. The definition `planet_id` must match the package's stable registry identity.
4. `spawn_enabled=true` requires a `spawn` table. `spawn.entity_id` is **not**
   authored — the registry loader derives it deterministically from `planet_id`
   via `sidereal_core::planet_body_guid(planet_id)` and overwrites any value
   present in legacy source. See
   `docs/features/active/world_bootstrap_fixed_entity_identity_contract.md`.
5. `shader_settings` must decode to `PlanetBodyShaderSettings`.
6. `body_kind` remains `0 = planet`, `1 = star`, `2 = black_hole`.
7. `planet_type` remains `0..5` as documented in `docs/features/reference/procedural_planets_reference.md`.
8. Planet files are content data, not direct graph-record builders.

## 4. Runtime Contract

Rust owns validation and typed resources:

1. `sidereal_game::PlanetRegistry`
2. `sidereal_game::PlanetRegistryEntry`
3. `sidereal_game::PlanetDefinition`
4. `sidereal_game::PlanetSpawnDefinition`

`engine-content` owns registry-definition package loading/writing, and gateway registry
authoring composes those packages into the typed `PlanetRegistry`. Universe-baseline
placements resolve the selected planet definition through the shared `planet.body`
bundle; `world_init.lua` does not spawn starter planets.

## 5. Genesis Dashboard Direction

Route:

```text
/genesis
/genesis/$planetId
```

V1 panels:

1. Library: planet list, search, body-kind filters, and tags.
2. Preview: planet/star visual preview using `planet_visual_wgsl` or `star_visual_wgsl` and `PlanetBodyShaderSettings`.
3. Inspector: identity, spawn metadata, shader settings, randomize controls, and one-step Save / Publish Package.

Write path:

1. Send structured JSON to the gateway planet registry-definition endpoint.
2. Let the gateway validate, revise, and atomically commit the package.
3. Treat the successful package write as publication; do not expose a second publish or discard action.
4. Do not write package files directly from the dashboard server.

Current dashboard API surface:

```text
GET /api/genesis/planets
POST /api/genesis/planets/:planetId
```

## 6. Randomization Contract

Genesis randomization is deterministic from a seed and selected body family. It must produce values that validate as `PlanetBodyShaderSettings` and stay within the shader editor schema ranges in `data/scripts/assets/registry.lua`.

Randomize affects only local editor state until the operator chooses Save / Publish Package.
Runtime services consume the newly composed typed registry through the registry-package
reload and live-resync path.

## 7. Out of Scope for V1

1. Gameplay/authority mutation of already-persisted planet entities. Supported
   registry-derived presentation/landmark fields do resync live through `RegistrySource`;
   runtime/evolved state is not overwritten.
2. Galaxy-scale batch generation.
3. Orbital simulation.
4. New shader ABI fields.
5. New physics behavior for static planets.

## 8. Tests and Acceptance

Minimum coverage:

1. Scripting tests load the repository planet registry.
2. Scripting tests reject duplicate planet IDs and missing planet scripts.
3. World-init graph-record tests continue to spawn the starter planet and star through `planet.body`.
4. Dashboard Genesis APIs use Zod validation and `requireDashboardAdmin` for mutations.
5. Native/WASM client checks remain required when shared client/runtime planet behavior changes.
