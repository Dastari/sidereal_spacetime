# Blender, 3D asset migration and skills

Status: Accepted direction; implementation staged
Last updated: 2026-09-08
Owners: Sidereal project

Current owner direction: [Blender model migration](blender_asset_migration.md). TypeScript voxel-solid model authoring is being retired. Replacement visual assets use editable Blender meshes, materials and validated GLB exports; existing voxel exports below document the implementation being migrated. Keep any required gameplay proxies separate from the authored visual surface.

## Preserved material

`assets/import_manifest.json` lists every copied source/content file, its size and SHA-256. The original repository remains the source of additional reference assets. This project includes original `.blend` kit/ship/station/frigate studies, selected top views, semantic faction palettes, legacy construction/hull/universe packages and Lua scripts. Original documents are in `reference`. Legacy source scripts are retained under `assets/source/legacy_art_tools` for provenance; they are not imported as gameplay code.

No screenshot reference pixels, account/session data, original `.env`, downloaded native binaries or old runtime caches were copied. Orchard art and its restricted commercial/noncommercial packs were not imported. Fonts come from self-hosted Fontsource packages; vendored skills preserve upstream license text.

## Working 3D export

`npm run art:export` opens the copied `ship_3d_study.blend`, realizes collection instances, selects only mesh objects and exports GLB without cameras/lights. The export writes `assets/runtime/wayfarer.glb` and a source/output hash manifest in `assets/runtime_manifest.json`. NumPy is required by Blender's bundled glTF exporter; it was installed on this machine. Blender exits nonzero on script errors. The output is a review assembly with many source meshes; it is not yet a functional part-built runtime ship or an optimized final asset.

M2 must export each reusable part with stable semantic IDs, pivots, mount/utility sockets, footprint/clearance, collision geometry, animation clips and material roles. Authoritative mass/capabilities live in content definitions, not inferred from GLB bounds. Validate units (meters; existing grid 2 m), applied transforms, normals, scales, material slots, triangle counts, bounds, texture budgets, LOD and GLB external references. Render thumbnails automatically and keep source `.blend` plus versioned outputs.

## Blender MCP

The project-local MCP uses the reviewed upstream `ahujasid/blender-mcp` commit `c5f35d9cc54451d785ac4c00c48bf9e98a2e8db9`. `npm run art:setup` creates `.tools/art`; `npm run art:mcp` owns an isolated Xvfb/Blender process and upstream stdio server. It binds `127.0.0.1:9886`, enables safe mode and disables telemetry. It does not attach to an arbitrary existing Blender window or overwrite the user's saved Blender preferences. Exit cleans up only its child processes. `.mcp.json` configures the new absolute project command; MCP hosts load it on configuration refresh/new session. A CLI smoke verifies handshake and scene query; this does not claim tools hot-loaded into the current conversation.

## AI-assisted content path

Prompt/reference/style → generated draft → Blender modeling/material/rig cleanup → semantic metadata → glTF/thumbnail export → validation/review → versioned asset package → privileged publish. Image generation remains useful for concept sheets, texture drafts, icons and decals. Generated visual geometry never directly creates inventory, weapons, fuel or world state. External model/generation services operate in a worker with budgets/credentials outside SpacetimeDB reducers. Record provenance/license/prompt/model/tool version where available; reject missing or incompatible assets before publication.

## Faction libraries

`assets/themes.json` preserves six material palettes and shape languages: practical Frontier Industrial, naval Aegis, clean Helix research, patched Corsair salvage, broad Verdant logistics and swept Umbra. Political faction records are separate from these visual skins. Start every new model/material family from these roles rather than repeatedly inventing unrelated colors. Extend curved/organic/porcelain alternatives as authored themes without changing gameplay footprints.

## Installed project skills

| Skill | Provenance | Use |
| --- | --- | --- |
| frontend-design | anthropics/skills, `skills/frontend-design` | new deliberate UI/design system |
| playwright | openai/skills, `.curated/playwright` | browser interaction and screenshots |
| security-best-practices | openai/skills, `.curated/security-best-practices` | requested security review and sensitive TS implementation |
| blender-modeling | existing reviewed `roble3/cc-blender-skill`, commit in imported provenance | original mesh/attachment geometry |
| pixel-art-sprites | existing reviewed `omer-metin/skills-for-antigravity`, commit in imported provenance | icons, decals and retained sprite references |

Skills are under `.agents/skills` and available on the next turn/session discovery. New project rules live in root `AGENTS.md`; copied legacy rules are inert reference material.

2026-09-08 separate apps: each app build copies the canonical review GLB and documents into only its own public directory via `scripts/prepare_app.py`. Exporting the Blender source updates the canonical asset; rebuild/prepare each desired consumer explicitly.

2026-09-13 explicit publication: `scripts/prepare_app.py` now publishes only the `PUBLISHED_RUNTIME` allowlist from `assets/runtime` (plus the public help allowlist) and rebuilds each app's `public/assets` from scratch, so review packages, preview builds and rebuild experiments written under `assets/runtime` stay private until they are listed. Review renders matched by `UNPUBLISHED_PATTERNS` are dropped from published directories. Preparation fails if an allowlisted entry is missing or a published manifest references an unpublished `/assets/...` path; `scripts/test_prepare_app.py` also checks that every literal asset path in app and package source resolves inside the allowlist. Each app build then writes `.br`/`.gz` sidecars beside compressible files (`scripts/precompress_assets.mjs`, cached by content hash under `node_modules/.cache`). The client artifact fell from 898 MB to 405 MB on disk including sidecars; the compressible 245 MB transfers as 26 MB brotli.

## 2026-09-08 voxel and metal asset path

`npm run art:voxels` builds semantic voxel room/hull data, meshes visible faces, bakes original brushed-metal normal and roughness maps in Blender, renders a neutral HDR reflection rig, saves editable Blender sources and exports the ship plus a reusable asteroid. The camera modes share this exact new ship. In dashboard Shipyard, the Source model selector also loads the original 887-mesh Blender assembly as a separate source study. The new voxel ship is newly authored, not a claimed automatic conversion of that original mesh.

`npm run art:check` checks model and material integrity. The material bake is cached by recipe hash, while voxel compilation/export is deterministic source-driven work. Originals under `assets/source/blender` remain unchanged. New sources are `voxel_wayfarer.blend`, `voxel_asteroid.blend`, `brushed_metal.blend` and `reflection_workshop.blend`; the corresponding recipes live in `scripts/` and `packages/content/src/voxel-wayfarer.ts`. Future live destruction consumes the canonical voxel data and authored material physics, never a screenshot or mesh triangle count.
