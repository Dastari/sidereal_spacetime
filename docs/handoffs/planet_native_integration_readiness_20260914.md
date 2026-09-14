# Native planet integration readiness — 2026-09-14

Status: read-only implementation audit; no runtime activation, art change, deployment or owner sign-off. Root is executing broader seed captures separately. The nine main and nineteen moon revisions below have working visual assessments, not final owner approval. This audit does not claim the running public service matches this checkout.

## Present loading path and specific incompatibilities

`packages/render/src/index.ts` creates one `createSpaceEnvironment(scene)` and exposes `planetBuildSnapshot()` to F3. `packages/render/src/environment/index.ts:createSpaceEnvironment` creates one `createPlanetWorkerClient()` per environment. Its `ready` awaits asteroid assets and two native kit loaders. `native-planet-assets.ts:loadNativeIceKit` pins **ice-r015**, requires `glacial-interior`, and validates by composing a body. `native-volcanic-runtime.ts:loadNativeVolcanicKit` pins **volcanic-r018**, requires `volcanic-geology`, and also composes during validation. Replacing those constants with Ice26/Volcanic23 would fail the layout checks and would not select the new composers/materials.

`index.ts:add` derives a recipe with `packages/content/src/environment.ts:planetRecipeForAppearance`. It special-cases gas before native selection, building a 48-segment shader sphere. Remaining planets select legacy native Ice/Volcanic only when their existing compatibility predicates pass, otherwise `createPlanetLODRuntime` / `createLayeredPlanet`. Thus none of the 28 review pins is selected by this production path. The late generic ring block additionally creates a shader ground plane; native Gas integration must suppress that duplicate when the authored kit owns rings.

`planet-worker-client.ts` submits `{id,recipe,lod,phase,nativeKit}` to the shared worker. `planet-worker.ts` currently treats any native layout other than `glacial-interior` as legacy Volcanic. It cannot safely receive a new kit without an explicit validated dispatch. Native kit objects are currently cloned in each request. The shared scheduler in `planet-build-scheduler.ts` is a **FIFO, one continuation per animation frame**, not an implemented priority queue. Preserve that shared resource boundary; do not claim prioritization already exists.

The isolated `scripts/art_library/planet_reference_candidate.ts` has the required modern PBR, UV, transmission, weather, smoke, part identity and fixed-detail behavior, but owns a worker per body and reads `location.search`. Its worker and per-body requestAnimationFrame upload yield must not be installed wholesale alongside the R15 shared worker/scheduler.

## Exact migration inventory

Composer names below are `.ts` modules currently under `scripts/art_library/`. Preserve their final output; move reusable implementations into the render package and make review tooling import the same implementations. Do not leave production importing tooling or app entrypoints.

| Exact selected kit | Runtime recipe style | Actual reviewed composer | Complete-output LOD |
| --- | --- | --- | --- |
| `desert-r014` | `desert` | `planet_reference_composition` | varying |
| `rocky-r010` | `rock` | `rocky_reference_composition_r010` | fixed |
| `ocean-r007` | `ocean` | `ocean_reference_composition_r007` | varying |
| `temperate-r003` | `temperate` | `temperate_reference_composition_r003` | varying |
| `toxic-r007` | `toxic` | `toxic_reference_composition_r007` | fixed |
| `crystal-r013` | `crystal` | `crystal_reference_composition_r013` | fixed |
| `volcanic-r023` | `volcanic` | `volcanic_reference_composition_r023` | varying |
| `ice-r026` | `ice` | `ice_reference_composition_r025` | fixed |
| `gas-r005` | `gas` | `gas_reference_composition` | fixed |
| `rocky-moon-r002` | `moon` | `rocky_reference_composition_r010` | fixed |
| `rocky-moon-2-r001` | `moon` | `solid_moon_reference_composition_r001` | fixed |
| `desert-moon-1-r001` | `moon` | `solid_moon_reference_composition_r001` | fixed |
| `desert-moon-2-r001` | `moon` | `solid_moon_reference_composition_r001` | fixed |
| `gas-giant-moon-1-r005` | `moon` | `solid_moon_reference_composition_r001` | fixed |
| `gas-giant-moon-2-r001` | `moon` | `solid_moon_reference_composition_r001` | fixed |
| `gas-giant-moon-3-r005` | `moon` | `solid_moon_reference_composition_r001` | fixed |
| `ocean-moon-1-r001` | `moon` | `hybrid_moon_reference_composition_r001` | fixed |
| `ocean-moon-2-r002` | `moon` | `hybrid_moon_reference_composition_r001` | fixed |
| `temperate-moon-1-r002` | `moon` | `hybrid_moon_reference_composition_r001` | fixed |
| `temperate-moon-2-r002` | `moon` | `hybrid_moon_reference_composition_r001` | fixed |
| `toxic-moon-1-r001` | `moon` | `toxic_moon_reference_composition_r001` | fixed |
| `toxic-moon-2-r001` | `moon` | `toxic_moon_reference_composition_r001` | fixed |
| `ice-moon-1-r002` | `moon` | `ice_moon_reference_composition_r004` | fixed |
| `ice-moon-2-r003` | `moon` | `ice_moon_reference_composition_r004` | fixed |
| `volcanic-moon-1-r003` | `moon` | `volcanic_moon_reference_composition_r004` | fixed |
| `volcanic-moon-2-r006` | `moon` | `volcanic_moon_reference_composition_r004` | fixed |
| `crystal-moon-1-r010` | `moon` | `crystal_moon_reference_composition_r008` | fixed |
| `crystal-moon-2-r010` | `moon` | `crystal_moon_reference_composition_r008` | fixed |

All kits are under `output/playwright/planet-reference-20260914/<revision>/kit.json`; the 56-job manifest in `reviews/broader-seed-capture-manifest.json` pins their SHA256 values. Toxic main uses **toxic-fog-r005**; Ocean and Temperate use **cloud-r002**. Other candidates have zero default cloud coverage. Volcanic main preserves its reviewed smoke path. Exact glow and Crystal main local-light flags are recorded per candidate in that manifest. These are material/effect descriptors to integrate deliberately, not query strings for normal gameplay.

## Concrete integration sequence using existing R15 machinery

1. **Keep the mapping renderer-owned and immutable.** The original owner task forbids `packages/content` changes except role/instanceable fields and forbids world/sim writes. No content registry, recipe schema or world mapping edit is authorized. A renderer descriptor registry may map an **existing stable authored appearance identity** to exact revision/weather/material behavior, separately from `PlanetRecipe`. `SpaceBodyState` currently provides id, kind, appearance, seed, radius and optional generic recipe; `packages/content/src/shared-system.ts` and `space.ts` expose one generic `moon` appearance, and `planetRecipeForAppearance` additionally recognizes generic `companion`. Neither input carries the reference family/ordinal needed to distinguish all 19 moons. Therefore full 19-moon automatic selection is **blocked by absent authored identity**, not solved by a seed modulo, body name substring, appearance substring, radius heuristic or arbitrary UUID assignment. A future independently authorized upstream identity contract would be needed for those specific variants. Existing exact main appearance keys can be mapped in renderer code subject to recipe compatibility; custom `temperate-volcanic` and explicit effects remain unchanged. No activation mapping is implemented in this preparation.

2. **Make the asset boundary typed and immutable.** Extend `native-planet-assets.ts` into the existing native asset loading layer with exact revision/hash manifests and material/geometry validation. `native-planet-composition.ts:NativePlanetKit` currently models only old layouts, positions/indices/triangleMaterials and minimal color/roughness: it omits the reviewed normals, UVs, full PBR fields and part ranges. Introduce validated modern kit/result types without coercing arbitrary new layouts into that old union. Validate schema/indices/finite attributes/paths/budgets without a full main-thread composition. Register immutable assets with the existing worker once and send compact revision/body/seed/LOD descriptors thereafter; reject unregistered/unknown layouts. Existing `stage_planet_reference.py` is explicitly isolated-review staging, not a production publisher. Its bounded, hash-verified Ice-moon projections may be reused only with source-to-projection provenance; retain original Blender/GLB/full JSON and maps as art authority.

3. **Extend the shared worker result contract and dispatch.** Move the exact composer modules and their pure native helpers into `packages/render/src/environment`, retaining revision dispatch equivalent to `planet_reference_worker.ts` (including partitioned Crystal's `nativePartRanges` branch). Extend `planet-worker-client.ts` and `planet-worker.ts`, reusing its recursive transferable-buffer collection and error envelope. Return complete batches, authored UV/normals, stable placement ranges, full weather/smoke and tight per-batch shadow radii. Do not convert authored surfaces into legacy voxel/sphere output. Cache kit registration per worker lifetime; on worker failure reject jobs, invalidate registrations, and allow controlled reinitialization. No synchronous browser fallback.

4. **Add the modern native upload adapter within the existing runtime contract.** Follow `planet-lod-runtime.ts` and `native-ice-lod-runtime.ts`: one body root, a disabled unpublished level, shared body material ownership, `worker.nextFrame()` between uploads/compiles, `createPlanetLODCache` ready-only swap, disposal guards before/after awaits. Extract the reviewed behavior from `planet_reference_materials.ts`, `planet_reference_transmission.ts`, `toxic_fog_reference_material.ts`, `reference_volcanic_smoke_{build,runtime}.ts`, and `planet_reference_local_lights.ts`; production must not depend on query parameters or hardcoded `reference-review` identities. Preserve texture color spaces/invertY, normal-map handedness, UV channels, metallic/roughness channels, emission strength, alpha modes, IOR, attenuation, selective transmission and shared refraction-target ownership. The old Ice finish cannot substitute for Ice26's authored selective glass.

5. **Wire native selection before the gas special case in `index.ts:add`.** Return the existing runtime shape (`root`, `updateLOD`, `snapshot`, weather/smoke, emitters, animated materials, `dispose`) so environment updates, F3 and body lifecycle remain shared. Preserve world XY→X/−Z, origin subtraction, height, body radius and axial spin. Native bodies must avoid the legacy nonnative tilt; move the shared content root under the existing spin node so future asynchronously uploaded levels follow it. Suppress only the generic effects that the selected descriptor already supplies (especially Gas rings), and preserve the existing atmosphere and lighting controls. Keep source geometry/winding unchanged and register actual `role=planet`, weather/smoke exceptions, and worker-computed `planetShadowRadius` with the existing `createPlanetShadows`/glow managers. Scope local lights to each body's meshes; no global brightness compensation or per-candidate shadow managers.

6. **Carry exact asset identity through retained caching.** Extend `body-visual-revision.ts:createBodyVisualRevision` with selected asset/weather descriptor identity; its current signature has only Ice/Volcanic availability booleans. A kit revision becoming available must replace the old visual once; camera size, position and axial rotation must not reconstruct the body. Keep 24 qualified candidates at one retained LOD0 while retaining requested geometric LOD separately for shadow quality. Desert14/Ocean7/Temperate3/Volcanic23 keep their actual distinct levels and ready-only transitions; smoke/weather are included in that decision. Transfer the exact tested revision allowlist from `planet_reference_worker_lifetime.ts`, retain unknown-successor rejection, and qualify custom effect combinations separately. Gas's legacy broad layout exception is existing behavior, not permission to qualify arbitrary new revisions without evidence.

## Required validation before activation is concrete

- Run actual shared-worker dispatch parity against the review worker for every exact pin, seeds 38/117/904 and all LODs, including weather/smoke/shadow bounds and source attributes. Existing `reference_full_output_fixed_detail.test.ts` establishes the 14 newest fixed policies, but does not exercise the production worker. Register these checks in the normal suite after extraction; preserve old review fixtures and source hashes.
- Extend `environment/runtime.test.ts`, `planet-lod-runtime.test.ts`, native runtime/cache and `body-visual-revision.test.ts` coverage for all descriptor families, late asset availability, recipe edits, two simultaneous bodies, failed loading/build/compile, disposal during upload, reinitialization, and one shared scheduler. Test that Gas gets exactly its authored rings, moon selection remains stable, Crystal part IDs include the real body ID, and one Ice transmission target/material set survives approach/retreat.
- Validate optics, shadows, effects and asset paths in the normal game, including actual Flight and Map→Observe using the same focus action. Record F3 build/pending counters and synchronized visible geometry, approach/retreat/abrupt jumps, settled Deck/Flight, scale 2 and Glow/Shadows/Lighting isolation. `docs/planet_lod_authoring.md` and R15 in `docs/rendering_performance_plan.md` require no missing body and no transition frame over 20 ms on the acceptance hardware. Software evidence does not close this gate; existing 22.3 ms and earlier 34.7 ms evidence are failures, and later stalled animation is not readiness.
- Run required project check/build and asset validation on the concrete candidate release. The current unrelated missing-module failures recorded in review docs must remain explicit until resolved; do not treat focused passes as a complete build. No authority reducer/data change is needed for rendering-only selection. World/sim writes and content changes beyond the stated role/instanceable exception are out of this task; absent moon identities remain an explicit blocker rather than an implied follow-up authorization.

## Preservation and publication boundary

Keep every native Blender successor and failed iteration, exact GLB/kit triangle/normal/UV/material provenance, Crystal's documented orientation/export cache, and validated runtime projection manifests. The r010 Crystal assignment-only changes and Ice26 selective optical triangles are accepted working art constraints; integration is not permission for another redesign, decimation, culling workaround or generic material substitution.

Prepare an immutable `/assets/planets/<exact revision>/` runtime bundle and client release with a reviewable file/hash manifest, isolated check/build logs and normal-game evidence. Do not expose `output/` or `/@fs` review routes as a public asset contract. Activation must use the existing managed `scripts/dev.py` / npm workflow and expected staged/live digest guards documented by the R15 releases, without publishing the world or dashboard as a side effect. Root owns PR/release coordination. Current authoring/capture authorization does not itself authorize public activation of these 28 revisions; explicit authorization of that concrete release is the remaining publication step. Publication permission and final owner artistic sign-off are separate, and neither is inferred from root/Astra working passes.


## Inactive schema preparation

`packages/render/src/environment/modern-native-planet-schema.ts` adds renderer-only readonly descriptor/material/variant/part types and pure validators. No existing runtime imports it; it fetches nothing, composes nothing and selects no body. Header validation is explicitly separate from full geometry validation. The modern fixture file contains only metadata prefixes read from at most 64 KiB per selected source, with source byte sizes and prior manifest hash pins; those header checks do not claim full 28-kit geometry validation. Full validator tests use bounded synthetic geometry to check finite attributes, exact lengths, index/material references and exhaustive Crystal part ranges without modifying arrays.

The inherited 64 MiB payload limit is retained. Three full source kits exceed it: Desert r014 (68,398,818 bytes), Toxic r007 (69,968,891 bytes), and Ice moon1 r002 (95,700,105 bytes). This prep does not raise the cap or drop variants. Ice moon1 already has a documented projection workflow; each eventual runtime payload needs its own verified packaging/projection evidence. Geometry count limits are import safety bounds, not performance acceptance or composer-output budgets.

Validation of inactive preparation: five focused tests pass (173 ms), reading at most 64 KiB of each actual kit to compare the frozen header and byte count, plus malformed-data tests on tiny geometry. Scoped strict TypeScript compilation with Node types passes. No production import/activation, full geometry scan, browser or Blender job was added. Main project check/build remains the coordinator closeout gate.


## Shared implementation extraction — 2026-09-15

The nine main composers, five common geometry/bounds helpers, five cloud/fog/smoke helpers and three PBR/transmission/local-light helpers now live in `packages/render/src/environment/reviewed-native/`. The original review modules are compatibility re-exports, so review callers use the same implementation. Twenty-two implementations are preserved byte-for-byte except relative import relocation; no algorithm, art, PBR setting, mesh selector, worker lifetime, runtime selection or authority behavior changes. Exact relocation maps and dependent tests are under pr-preparation/reviewed-*-extraction-*.json. Full strict reference checking and20 focused material/optical/light tests pass; the complete fixture rerun now passes42 TypeScript files/233tests and20 Python tests, with source identity verified for all22 extractions. Required whole-project checks still report the documented baseline failures.

The proposed nine-main validated builder is still a proposal, recorded in pr-preparation/reviewed-main-builder-proposal.md. The current legacy mutable composer input types require a structural readonly contract before accepting the modern schema directly. Native cloud/fog layouts also need a dedicated bounded weather contract; body validation does not cover them. Do not bypass these distinctions with an arbitrary legacy-layout cast or the review worker's default-to-Desert branch. This extraction does not activate a game loader or resolve the19 moon identity gap.
