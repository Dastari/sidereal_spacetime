# Holographic character portrait

Implemented on 2026-09-08 for the character/inventory UI refresh against `reference/art/ui-elements-5.png`. The root integration agent owns the UI, live-release decision and combined checks. No gameplay authority, server rows, item ownership or statistics are changed here.

## Integration

`packages/render/src/character-preview.ts` exports `createCharacterPreview({width?, height?, assetUrl?, onInvalidate?})`. Dynamically import it when the character window first becomes visible. Pass `onInvalidate: () => ui.invalidate()` so late crew, held-item or environment readiness also wakes a static reduced-motion UI. It returns:

- `canvas`: transparent, caller-owned WebGL output for `CanvasRenderingContext2D.drawImage`.
- `ready: Promise<void>`: always settles; inspect `status` and `error` afterward. The native held-item mesh can finish loading after the character.
- `status`: `loading | ready | error | disposed`; `error` contains an asset failure, including a nonfatal held-item failure.
- `needsRender`: whether the visible caller should continue invalidating while a changed frame or shader/bloom compilation remains pending. Check after drawing, including in reduced-motion mode; stop once false. Async network completion will request a new draw through `onInvalidate`. Callbacks are suppressed after disposal; there is no private RAF or polling timer.
- `setAppearance(preset, appearance?)`: the same crew presets and cosmetic properties as the actual crew renderer, plus optional `equipmentAsset` from the existing equipment visual catalog. A valid item loads its actual GLB onto the right-hand socket and supplies the existing grip/pose binding. These are visual choices only.
- `rotate(deltaRadians)` / `setRotation(radians)`: turn the displayed character while the floor projection stays fixed. Connect drag and keyboard rotation through the UI's existing input system.
- `resize(pixelWidth, pixelHeight)`: preserve the panel aspect, with the longest buffer dimension capped at 640 pixels. Pass actual layout dimensions multiplied by a bounded device scale. The camera fits the full character, platform and current held-item mesh when turned sideways.
- `render(timeSeconds, reducedMotion?)`: explicitly draw, returning whether a frame was produced. No private animation loop runs. Call only while the portrait is visible, immediately before copying its canvas into the HUD. Calls are capped at 30 fps unless appearance, rotation, loading or size makes a new frame necessary. Reduced motion freezes breathing, rings and electrical travel and redraws only on changes or pending shader compilation.
- `dispose()`: idempotent. Abort a pending crew fetch and release the scene/context after any in-progress Babylon parsing or held-item load settles. The UI should also catch a synchronous WebGL Engine creation failure and retain its normal fallback portrait.

Default rotation is a slight three-quarter view. Equipment framing uses actual transformed mesh bounds and may pull back as a long weapon rotates sideways; it does not distort the character. The projection is an effect, not a physical platform.

## Projection implementation

`packages/render/src/holographic-disc.ts` exports `createHolographicDisc(scene, {radius?, reflections?, bloom?})`. The effect provides its `mesh`, `light`, `setSubjects(meshes)`, `update(timeSeconds, reducedMotion?)` and `dispose()`.

One ground quad (2 triangles) uses an analytic transparent shader for concentric cyan/blue rings, counter-rotating broken arcs, fine radial marks, slow scanning segments and short electrical filaments. Its centre is faint, its outer illumination fades to zero, and it has no extrusion, solid underside, picking or collision geometry. The portrait uses a 0.64 m projection radius. A separate cyan point light illuminates the boots and nearby character surfaces. A 256 px mirror target contains only the displayed character and held equipment, and contributes a faint reflection fading before the outer rings.

The half-resolution GlowLayer creates actual blurred emissive bloom. Its neutral mask clears with alpha zero and its screen composite accumulates alpha. Opaque character surfaces still contribute depth to occlude rings behind the feet, but contribute no dark alpha halo. These details matter: Babylon's default opaque glow-mask alpha initially produced a black rectangle when composited onto the navy UI and was corrected after an actual browser capture. The WebGL canvas uses premultiplied alpha to match its accumulated output; the HUD can copy it with ordinary `drawImage`.

Resource cost is one separate lazy WebGL context, the existing crew asset and optional native held item, a 64 px workshop environment, one key light, one fill light, one boot light, one 256 px mirror target, and a half-resolution glow pipeline. Character geometry is reused from `/assets/crew/frontier-crew.glb`; it is not recreated here. Hidden portraits do no rendering. This is a bounded presentation cost, not a measured whole-game performance claim.

## Evidence and checks

Real browser evidence was captured from `http://sidereal.tail7a58a6.ts.net:5173/__portrait-review`, a temporary in-browser review page importing the actual new module through the managed client server. No alternate app was started. The reviewed portrait was copied to a Canvas2D canvas on the intended navy background at 184 × 383 CSS pixels, using a 307 × 640 rendering buffer.

- `output/playwright/holographic-portrait/portrait-initial.png`: preserved first pass showing the opaque-alpha/framing defect.
- `output/playwright/holographic-portrait/portrait-alpha-framing.png`: corrected transparent compositing and larger character framing.
- `output/playwright/holographic-portrait/portrait-canvas2d.png`: real character, native carbine and projection copied into Canvas2D.
- `output/playwright/holographic-portrait/portrait-rotated.png`: side-on rotation. Its edge-adjacent carbine prompted the subsequent transformed-bounds camera fitting; the combined UI reviewer must check that final adjustment.
- `output/playwright/holographic-portrait/quality.log`: transparent corner alpha 0, 113,412 fully transparent pixels, 14,104 partially transparent pixels, static reduced-motion repeat, changed animated frames, immediate close during asset loading and repeated close all verified.

The successful shader capture had no WebGL compilation or asset errors. A first development load encountered Vite's outdated dependency-optimization URLs after introducing the new lazy imports; reloading after optimization resolved them without changing runtime logic. The dedicated browser session was closed before the main agent's integrated review.

`packages/render/src/holographic-disc.test.ts` exercises zero-thickness/nonpickable geometry, isolated subject lighting/reflections, reduced-motion light stability, replacement subjects, separate effect lifetimes and repeated disposal. Root performs the final combined `npm run check`, `npm run build` and real-client interaction review.

## Independent cargo integration failure found during the combined review

At the root agent's request, a read-only investigation reproduced the current client's `Ship model could not load: Cannot merge vertex data that do not have the same set of attributes` failure. This is in the native cargo batching path, before floor/hull loading, and is independent of the portrait implementation. No published assets or shared renderer files were changed during this investigation.

The exact call chain is `packages/render/src/index.ts` → `loadInstalledModules(scene, shipRoot, 'cargo')` → `loadEquipmentPrototypes` in `installed-equipment.ts` → `batchStaticMaterials` in `static-material-batches.ts`. The latter groups all meshes by material identity and calls `Mesh.MergeMeshes(group, true, true)` without separating differing vertex-channel sets.

Both currently placed cargo GLBs reproduce the exact error through the real Babylon loader and batching function under NullEngine:

| Cargo asset | Published GLB SHA-256 | Conflicting meshes with the same material |
| --- | --- | --- |
| `part-c06e4f5f6f6dace38e41` | `2c7f3a8a9c39ed54af84b5a42694188db99fd94c706071384dec3bf8c394e5bf` | `Cargo \| indigo frame`: 14 meshes have normal/position/UV, 3 have normal/position only. `Cargo \| pale enamel`: 17 have UVs, 3 do not. |
| `part-5382f8dbbeb54e663d33` | `9c3e1914626d0149e298d7cdcfe70fe88c64f68df36a761994f4f9dc97453cd6` | `Cargo \| indigo frame`: 13 meshes have UVs, 3 do not. `Cargo finish \| red`: 1 has UVs, 3 do not. |

Their URLs are `/assets/assembly/cargo/<asset-id>/glb.glb`, as recorded in `apps/client/public/assets/assembly/cargo-manifest.json`. The first asset occupies `room-storage-container-2.15-0.25` and `room-storage-container-3.5-0.25`; the second occupies `room-storage-container-2.15-1` and `room-storage-container-3.5-1`. The first entry fails before the second can load. UV-less pieces include `side-inset-backing.002`, `side-inset-backing.003`, `front-inset.001`, and fitted-panel meshes; this is a legal GLB channel difference, not evidence that the source surfaces should be discarded.

Recommended integration fix: partition batches by both the exact material object and the complete sorted vertex-channel signature, or leave incompatible source meshes separate. Preserve the authored UVs, tangents and other channels; do not strip all UVs or silently fill arbitrary data solely to satisfy the merge. Add a real-asset or mixed-channel regression case: the current batch test merges only boxes with matching attributes and cannot catch this failure. An in-memory diagnostic partition by signature before the existing material batching succeeds for both exact GLBs without modifying either asset. The main release integrator owns implementing and validating that correction.

### Narrow blocker correction implemented on the root agent's instruction

After the diagnosis above, the root agent authorized the concrete renderer correction for live-client acceptance. `static-material-batches.ts` now groups by material object and full sorted vertex-channel signature. The existing animation/morph/multi-material guards remain. No authored or published asset changed, no vertex channel is removed or synthesized, and material instances remain the same.

The new regression in `static-material-batches.test.ts` mixes UV-less, UV-bearing and tangent-bearing primitives sharing a material, verifies three compatible batches without throwing, checks total index preservation, checks retained UV/tangent values, and checks unchanged material identity/properties. Both batching and installed-equipment suites pass (4 tests); TypeScript checking passes. Loading each exact placed GLB through Babylon NullEngine and calling the corrected function directly also passes: 93 source meshes become 8 and 9 batches respectively, both retain all 35,940 indices, material identity and both original channel sets. The main agent owns the subsequent real-client reload and combined release checks.

## Concurrent staged crew-pose verification, 2026-09-08 23:40–23:41 AEST

The root agent reported a later combined run with 234/236 passing tests after an earlier 231-test pass. The only failures were the newly added `packages/render/src/crew/equipment-pose.test.ts` cases for both coordinate handednesses. A read-only focused rerun at 23:40:12 reproduced the failures at line 22: support-hand error was `0.033674664465638104 m` (left-handed scene) and `0.03367464042144378 m` (right-handed scene), exceeding the test's strict `< 0.025 m` requirement. This portrait agent did not modify any test, solver, rig, profile or asset during the investigation.

This test explicitly combines the current `createEquipmentPoseController`, `bindPoseEquipment`, `EQUIPMENT_POSE_PROFILES.RIFLE` and staged `POSE_REVIEW_ITEMS.carbine` sockets with three r002 files under `assets/art-library/designs/crew.animation.aim/revisions/r002/`. It does not load the portrait's default runtime crew asset:

| Dependency at the failing snapshot | SHA-256 |
| --- | --- |
| `crew-poses.glb` | `44af8cbc0bb6f08aa558b9ac2f30359c832e8b52f5a45a3f351ff2a8e25ae00c` |
| `equipment/carbine.glb` | `aba632e370f18a0be48e8f082c425e0da7f9978e3700ac7211ae1b11efa8e118` |
| `runtime-aim-space.json` | `ec269e27b11673dc9080da6114d51ddfdfff26f8acad773c4e0951c4168e1885` |
| `packages/render/src/crew/equipment-pose.test.ts` | `0e312a5325237860b297099d1b54556bddbc6c6d2397b77d32c1992b513c0921` |
| `packages/render/src/crew/equipment-pose.ts` | `54b4c01135d93a78330fe411691dcb4813095203d6eafa7d645d476156c88a5e` |
| `packages/render/src/crew/pose-review-items.ts` | `7d80c2817a87f163276a2e39962468f6185feca87616cf5f556aa2d53e4829fc` |
| `packages/content/src/equipment-poses.ts` | `d6a9f6316dc43dd49ba1d380a8fed7360aad4003d155aae494775ab943ce9535` |

While this read-only investigation ran, an external owner changed `packages/content/src/equipment-poses.ts` at 23:40:52 to SHA-256 `3d3a281aca22c57c6c2f2a224b7cb1ae10b888f638b0506a3f6710504a7021e8`. The rifle profiles' `stanceYaw` changed from `1.10` to `1.3` radians and `shoulderPocketOffset` from `[0,-.08,.22]` to `[.06,-.12,.24]` metres. The solver, test and three staged asset hashes remained unchanged. A fresh direct diagnostic then measured support error of approximately `4.58e-8 m` and `4.36e-8 m` with zero torso and upper-arm penetration. A fresh run of `npx vitest run packages/render/src/crew/equipment-pose.test.ts` at 23:41:16 passed both cases. The previously reported failure therefore became stale during the concurrent profile iteration; final release checks must pin and test the actual combined source snapshot.

There is no observed causal link to this portrait/UI work. The isolated failing test does not import `character-preview.ts`, `holographic-disc.ts`, the UI, or cargo batching; it independently reproduces through staged pose data and the shared solver. The portrait uses the existing crew/held-item visual helpers and does not call `createPoseController()` or change pose profiles. The active crew-pose owner remains responsible for the staged rig/profile/socket revision, both handedness cases, the broader pose-angle/clearance review and any eventual publication. Do not relax the support-hand threshold or republish staged art to make the UI release pass. The main integrator should rerun the combined required checks after the owner finishes the current iteration.
