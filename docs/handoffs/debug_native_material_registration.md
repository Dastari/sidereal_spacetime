# Native material registration for lighting and shadow toggles

Date: 2026-09-10
Status: source, focused checks and fresh-scene hardware review complete. Included in the combined character/F3 source candidate; public refit release remains separately coordinated.

Manual clones in `packages/render/src/construction-authored-assembly.ts` retained materials from an unloaded Babylon AssetContainer without registering those material objects in `scene.materials`. Babylon's scene Lighting and Shadows setters invalidate only registered materials. The native walls and furniture consequently kept stale lighting/shadow shader defines after either toggle. The hardware investigation found the meshes still enabled, visible and ready, with no compilation errors; the suspected frozen-material cause was disproved.

The loader now calls `registerReferencedSceneMaterial()` from `packages/render/src/scene-material-registration.ts` after each manual clone. This follows Babylon's own `AssetContainer.instantiateModelsToScene` convention. The helper registers the original material object once, recursively handles MultiMaterial children, and preserves asset-container disposal ownership. It adds no prototype meshes, clones no materials, and changes no alpha, cutaway, power, inventory or combat state. Normal graphics settings benefit from the same repair; no duplicate F3 invalidation workaround was added.

Changed files:

- `packages/render/src/construction-authored-assembly.ts`: one import and one material registration call after cloning. Preserve concurrent refit placement code.
- `packages/render/src/scene-material-registration.ts`: shared registration helper.
- `packages/render/src/construction-authored-assembly.test.ts`: verifies referenced materials on all 211 authored objects are registered and disposed with the owning assets.
- `packages/render/src/debug-features.test.ts`: actual native `assets/runtime/assembly/parts.glb` regression and MultiMaterial/idempotency coverage.

Validation: 12 focused tests pass and `npm run typecheck` passes. The native regression first reproduces stale SHADOWS defines on an unregistered cloned `MAT-structural-polymer`, then exercises Babylon's real define invalidation after registration for F3 Lighting, F3 Shadows and direct scene graphics changes. It also preserves the native material identity, partial visibility and an intentionally hidden sibling. NullEngine does not prove rendered pixels; the integration owner separately captured successful hardware registration probes and is reviewing a freshly loaded scene using the final loader source.

Final hardware review loaded the repaired source into a new scene:628 registered materials, zero orphan live mesh materials and62 enabled wall meshes. Both [Shadows Off](../../output/playwright/combat-r003/hardware-final-shadows-off.jpg) and [Lighting Off](../../output/playwright/combat-r003/hardware-final-lighting-off.jpg) retain the authored walls and furniture. An independent Astra reviewer confirmed both images. No runtime material-registration injection was used for these final captures. Earlier files ending `registration-probe` remain diagnostic experiments.

The final combined check passes1,231tests/205files and77documents; full build and art validation pass. See [the exact browser evidence and limitations](../../assets/art-library/designs/crew.animation.aim/revisions/r003/runtime-review-20260910/capture-record.json).
