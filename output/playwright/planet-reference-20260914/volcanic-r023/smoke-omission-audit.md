# Volcanic23 smoke compatibility audit — 2026-09-14

Read-only source investigation; no new smoke kit, compositor, helper or runtime/viewer edits were created. New authoring paused on parent clarification.

There is an existing intended smoke layer omitted by the isolated candidate viewer. `packages/content/src/environment.ts` sets default volcanic `cloudCoverage` to0, but `defaultPlanetEffects` independently sets volcanic `smoke` to0.14. Cloud absence does not imply smoke absence.

`packages/render/src/environment/native-volcanic-build.ts:150` builds smoke at LOD0/1 with the established `buildPlanetClouds` path: seed+909, coverage0.14, radius1.145, detail48, muted tint[0.24,0.2,0.22]. `native-volcanic-lod-runtime.ts:64` creates it through `createPlanetSmoke`, shares its material and attaches it to the active native body. The same smoke creator is used by the layered path. `planet-smoke.ts` uses ordinary PBR, roughness1, metallic0, alpha0.48, no emission and no depth writes. Existing smoke is absent at LOD2 by design; altering that is outside this compatibility audit.

`scripts/art_library/planet_reference_worker.ts:17–19` composes generic native clouds or Toxic fog gated by cloudCoverage. It never emits recipe-effect smoke. `planet_reference_candidate.ts:22` fetches a cloud kit only if cloudCoverage>0. `planet_reference_review.ts:38–40` disables the baseline body and meshes outside the candidate, so baseline volcanic smoke cannot supplement the candidate.

The `smokeImplemented:true` entry in corrected-seed38.json belongs to the disabled `volcanic-r018` baseline (`enabled:false`), not the active r023 candidate. It is not evidence of visible candidate smoke.

Recommended bounded compatibility restore: carry the exact existing smoke builder/creator and recipe+LOD behavior into the isolated candidate path, preserving existing tint/alpha/material settings and worker preparation. Do not introduce a new smoke authoring subsystem, change body geometry or imply fixed-radius old smoke is proven to clear taller r023 native geometry. If hidden/intersecting smoke appears after restoration, record that concrete compatibility limitation separately. Current r023 source/body appearance progress remains preserved; combined-layer appearance still needs an actual recapture. Hardware timing and owner approval remain separate.
