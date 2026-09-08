# Shipyard Ship Authoring Contract

Status: Active
Lifecycle: source-of-truth
Category: feature
Last updated: 2026-09-07
Owners: feature owners
Scope: Shipyard Ship Authoring Contract.
Source of truth: yes
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

## 0. Implementation Status

2026-09-07 dashboard retirement: the V1 dashboard editor, hardpoint overlay and exclusive `/api/shipyard/*` proxies are removed. The modular canvas editor now owns `/shipyard`; see `docs/features/active/ship_construction_blocks_contract.md`. The dashboard behavior described below is historical. The ship/module package registries, gateway validators and runtime bundle generation described in sections 2–4 remain implemented for existing content. No runtime data or package definitions are deleted by this dashboard replacement. Native/WASM gameplay is unchanged.

2026-08-31 status note:
- Ship and module definitions are durable JSON registry-definition packages under
  `data/content/ships/` and `data/content/ship_modules/`. The gateway validates and
  atomically publishes those packages, then composes the typed runtime registries.
- `/shipyard` now presents the actual one-step lifecycle: **Save / Publish Package**.
  The removed Draft/Published badges and later Publish/Discard controls targeted legacy
  Lua script-catalog paths and did not describe the package write that already committed
  the content.
- Native impact: published definitions continue to reach bundle spawning and registry
  live-resync through the existing typed registries. WASM impact: dashboard route/API
  behavior only; the game-client authority and transport split are unchanged.

2026-04-28 status note:
- Implemented in this slice: canonical Lua ship and module registries under `data/scripts/ships/` and `data/scripts/ship_modules/`, typed Rust registry definitions/loaders/validation in `sidereal-game` and `engine-script`, gateway/replication script-context accessors, generic `data/scripts/bundles/ship/body.lua`, and the dashboard `/shipyard` route with hardpoint overlay editing.
- Implemented dashboard V1 behavior: ship library search, draft badges, identity/visual/dimension/root payload editing, hardpoint table, mounted-module assignment, module library default editing, JSON component payload editing, validation panel, and draft/publish/discard APIs backed by the gateway script catalog.
- Hardpoint authoring uses the canonical local X/Y plane: `+X` is starboard/right, `+Y` is forward/up on the overlay, and V1-authored `offset_m[3]` must be `0`.
- Texture hardpoint authoring supports mouse wheel zoom, empty-space mouse panning, marker dragging, reset view, optional grid overlay, snap spacing from `0.1m` to `10m`, and mirror mode across local X with mirrored `x = -x`, same `y`, `z = 0`.
- Native impact: authoritative ship spawning now resolves `ship.corvette` and `ship.rocinante` through registry-authored definitions while preserving the existing bundle IDs and starter `controlled_bundle_id = "ship.corvette"`.
- WASM impact: no client authority or transport change. Browser/native clients continue consuming replicated entity/component results and asset IDs.

2026-04-29 status note:
- Read-only live instance routing has started under `docs/plans/proposed/live_entity_instance_editing_plan_2026-04-29.md` Phase 1. `/game-world` can resolve supported live entity GUIDs through the protected gateway edit-context API and route ship candidates to `/shipyard/entities/$entityGuid`, where the dashboard shows read-only context. Native impact: no authority, hierarchy, mount, mass, or runtime mutation change. WASM impact: dashboard-only route/API work.

## 1. System Label

Shipyard V1 is cataloged as:

`system.shipyard_ship_authoring.v1` | `Shipyard Ship Authoring System V1`

The system covers dashboard ship and module package authoring, texture-overlay hardpoint
editing, module-library mounting, component payload editing, and validated atomic package
publishing through the gateway.

## 2. Registry Layout

Canonical ship packages:

```text
data/content/ships/<package_id>/manifest.json
data/content/ships/<package_id>/definition.json
```

Canonical module packages:

```text
data/content/ship_modules/<package_id>/manifest.json
data/content/ship_modules/<package_id>/definition.json
```

Package manifests carry the package id, kind, revision, and file hashes. Definitions keep
stable runtime IDs such as `ship_id`, `bundle_id`, and `module_id`. The gateway aggregates
the packages into typed registries; editor code does not parse or generate Lua.

Module definitions are global library defaults. Ship-mounted modules may override component payload fields through `mounted_modules[].component_overrides` without changing the module default.

## 3. Validation Contract

Rust loaders must reject:

1. duplicate `ship_id`, `bundle_id`, `module_id`, registry script paths, or per-ship `hardpoint_id`;
2. indexed scripts that are missing or whose returned IDs do not match the registry;
3. ship `visual_asset_id` values that do not exist in the asset registry or do not resolve to image content;
4. non-finite hardpoint coordinates or V1 hardpoints with non-zero `z`;
5. mounted modules that reference missing hardpoints or missing modules;
6. module mounts where `hardpoint.slot_kind` is not listed in `module.compatible_slot_kinds`;
7. module component kinds outside the generated component registry;
8. module-authored generated hierarchy/identity fields such as `parent_guid`, `mounted_on`, `owner_id`, and `entity_guid`.

## 4. Bundle Generation

`data/scripts/bundles/ship/body.lua` is the generic ship bundle builder for registry-authored ships.

It must:

1. load the ship definition by `ctx.bundle_id`;
2. synthesize exactly one root ship graph record;
3. synthesize deterministic hardpoint child records with `ParentGuid`;
4. synthesize mounted module records with `ParentGuid` and `MountedOn`;
5. preserve UUID/entity-ID-only hierarchy and mount references;
6. generate collision AABB/outline from the selected texture when `collision_from_texture = true`;
7. keep Avian runtime mass components and gameplay mass components synchronized from authored values.

## 5. Historical Dashboard Contract (retired 2026-09-07)

The `/shipyard` dashboard route follows the Genesis layout pattern:

1. left library for ships, search, tags, bundle IDs, and texture summary;
2. main inspector for identity, visuals, dimensions, root components, hardpoints, module slots, and advanced payload editing;
3. texture workbench for visual hardpoint placement;
4. right action panel for validation, dirty state, one-step Save / Publish Package, and module-library edit state.

All reads require `requireDashboardAdmin(request, "scripts:read")`.
All mutations require `requireDashboardAdmin(request, "scripts:write")` and write
structured JSON through the gateway registry-definition endpoints. The gateway owns
validation, path confinement, revisioning, and the atomic package commit. There is no
second dashboard publish/discard step after a successful package write.

`GET /api/shipyard/assets/:assetId` may serve existing registry image bytes for preview, but it must resolve asset IDs through `assets/registry.lua` and must not expose arbitrary filesystem paths.

## 6. Migration Note

Current ship data moved from `data/scripts/bundles/ship/corvette.lua` and `data/scripts/bundles/ship/rocinante.lua` into registry definitions and module-library defaults.

Legacy hardpoint offsets were normalized into the Shipyard X/Y plane:

1. old `{ x, y, z }` values where `z` represented longitudinal placement become `{ x, z, 0 }`;
2. old values with `z = 0` and meaningful `y` keep `{ x, y, 0 }`;
3. all V1 hardpoints must serialize `z = 0`.

## 7. Out Of Scope For V1

V1 does not include live mutation of already persisted/spawned ships, texture uploads, full asset-registry editing, procedural ship generation, arbitrary nested module graphs beyond one module per hardpoint, or separate player-owned loadout persistence. Read-only live instance context/routing is allowed through the gateway-owned edit-context API.
