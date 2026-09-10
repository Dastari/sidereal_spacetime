# Rendering performance and fidelity plan

Status: Owner-requested work plan. Rewritten 2026-09-10 against the first hardware measurement. Phase 1a and the local-light budget are integrated; everything else is open.
Last updated: 2026-09-10
Owners: Sidereal project

This plan is written for a fresh agent. It is self-contained: read this file, `AGENTS.md`, then the referenced source lines, and start with the issue register in priority order. Every claim about the current code was verified against source on 2026-09-10; re-verify line numbers before editing because the tree changes daily.

## What the hardware measurement says

First measurement on real hardware, 2026-09-10: laptop with an NVIDIA RTX 4080, Chromium, render resolution 1574 × 907, hardware scale 1.0, nothing selected, F3 open.

| Counter | Flight (936 m, 89°) | Deck (70 m, 35°) |
| --- | --- | --- |
| Frame rate | 37.3 fps | 26.0 fps |
| Frame interval | 26.80 ms | 38.45 ms |
| Frame CPU | 27.09 ms | 36.67 ms |
| Update CPU | 0.31 ms | 0.31 ms |
| Render CPU | 26.96 ms | 37.36 ms |
| GPU frame | unavailable | unavailable |
| Draw calls | 4,920 | 7,304 |
| Active / total meshes | 1,033 / 2,662 | 1,448 / 2,663 |
| Active indices | 5.74 M | 11.2 M |
| Materials / textures | 636 / 85 | 637 / 85 |
| Lit lights / eligible maps | 4 / 1 | 5 / 2 |
| Allocated shadow maps | 2 | 2 |
| Transparent meshes | 14 | 15 |
| Attached camera passes | 3 | 3 |

**Diagnosis: the frame is CPU-bound on draw-call submission.** Frame CPU equals the frame interval in both views and Render CPU is 99% of it. Update CPU is negligible, which confirms the Phase 1a shadow-cache fix worked. Cost per draw call is 5.5 µs in Flight and 5.1 µs in Deck, a straight line through the origin. At this resolution an RTX 4080 is idle; 11 million indices is trivial for it.

Three multipliers produce the count:

1. **Each active mesh is drawn about five times.** Deck: 7,304 calls for 1,448 active meshes. The main pass, the glow layer (which still includes every imported ship mesh), the shadow maps and multi-material submeshes each re-submit the scene.
2. **636 materials.** Base assets carry a few dozen. The rest are per-mesh clones for cutaway fading, per-placement light switching, remote glass, and per-placement batching. Every material change is an effect bind plus uniform upload.
3. **2,663 meshes with nothing frozen.** Babylon recomputes world matrices and bounds and frustum-tests all of them every frame before drawing.

The browser is not the limit. A native engine would submit these calls cheaper and hide the problem for one more ship. The fix is the same in any engine: an order of magnitude fewer draw calls, a large reduction in materials, and a frozen static scene.

**Targets after the register below is worked through**, same hardware and resolution:

| Counter | Deck target | Flight target |
| --- | --- | --- |
| Draw calls | under 900 | under 600 |
| Total meshes | under 500 | under 500 |
| Materials | under 80 | under 80 |
| Render CPU | under 6 ms | under 4 ms |

Those numbers give vsync-capped frame rates on this hardware with headroom for a second ship, remote crew and the Phase 4 image pipeline.

## Scheduling constraints (owner, 2026-09-09)

The owner requested a configurable maximum light count under Graphics and a bounded measurement task alongside authentication and rig acceptance. Full authored ship construction remains the next highest priority. This plan is not authorization to start every workstream at once; take items from the register in order and measure each.

- **Phase 2 batching and instancing must consume stable placement IDs and explicit structural, deck and material roles.** Preserve picking, damage, refit and independently hidden decks through an instance-to-placement or triangle-to-placement mapping. Today's unselectable hull and floor assumption is not a permanent construction contract.
- **Phase 4 appearance changes, shadow-quality increases and broad material tuning remain deferred.** Phase 5 compression and Phase 6 quality features are separate measured follow-ups. Planet work remains paused.

Corrections that override earlier suggestions in this file:

- `maxSimultaneousLights` is a per-material shader cap. Reducing it does not bound enabled scene lights, stop shadow rendering, or prove permutations halve. Measure separately.
- Do not merge solely by name prefix or first-source name. A batch must retain compatible semantic roles, visibility, receiver and caster membership and placement lookup. Never lose future construction or damage identities to a draw-call optimization.
- Dust still moves while camera and ship velocity are constant. Skip updates only when all time-dependent motion is stationary, or move the animation into a shader.
- A glow texture ratio of 0.25 is not necessarily cheaper than the fixed 512 px target at a large viewport. Compare actual target dimensions and GPU cost. Merged glow occluders must preserve cutaways and floor and wall occlusion.
- PCF and contact hardening are alternative filtering modes to evaluate independently; raising shadow size or quality is a quality cost, not a performance fix.
- Bloom, SSAO, depth of field and tone mapping are not presumed cheap or guaranteed to reach reference parity. Add them independently behind measured quality settings. Preserve the brightness, contrast, gamma and saturation transfer semantics if a pipeline replaces the current pass.
- Compression is a derived, versioned runtime artifact with recorded hashes and material, socket, animation and selection validation. Quantization is lossy. Count equality alone is not a fidelity test. Preserve source assets and provenance.

## Rules for the agent

- Rendering never writes simulation or authority state. Nothing in `packages/world`, `packages/sim` or `packages/content` changes for this plan except type additions if instancing needs a role or placement field.
- Do not change what the Deck, Flight and Observe views mean, what the cutaway hides, or what the F3 switches do. `docs/render_debug_controls.md` and `docs/f3_deck_flight_cost_audit.md` describe the switches and counters; keep them truthful. Known discrepancy to fix along the way: Lighting Off suppresses local shadows but still renders the exterior sun map while F3 reports zero.
- Preserve authored Blender surfaces. No decimation, no re-export, no shader that replaces PBR materials.
- Every register item ends with `npm run check`, `npm run build`, an F3 measurement in a real hardware browser at the same resolution as the baseline, screenshots and JSON under `output/playwright/render-plan/<item>/`, and a dated note in the progress log. SwiftShader captures prove counts, never timing.
- Keep or add a test for every behaviour change. Render tests use `NullEngine` (see `packages/render/src/ship-lighting.test.ts`). `NullEngine` cannot count draw calls, so test scene-graph invariants there and measure in the browser.
- Commit at the end of each item with a message naming it. Check `git status` first and do not sweep unrelated construction or art work into the commit.
- If an item conflicts with the name-based mesh selection described under Hazards, fix the selection rather than adding regexes.

## How to measure

1. Start services with `npm run dev`, open the game at the address in `dev.toml`, enter the lab.
2. Press F3. The overlay reads from `packages/render/src/diagnostics.ts`. Record every row, not only FPS.
3. Record two settled states with nothing selected and the same viewport: Deck (walk-around, roof open) and Flight (seated, roof closed). Wait for transitions to finish.
4. GPU frame time shows "unavailable" in current Chromium because the WebGL timer-query extension is disabled by default. Do not chase it. Use the two isolation tests below instead.
5. For CPU attribution use the browser profiler on the render loop in `packages/render/src/index.ts` (search `runRenderLoop`). Expect nearly all time inside `scene.render`: `_evaluateActiveMeshes`, `_renderForCamera`, material `bind`, and `drawElementsType`.
6. Playwright: the project skill is in `.agents/skills/playwright`, Chromium builds are under `~/.cache/ms-playwright`. Existing capture scripts under `output/playwright/render-plan/phase-1a/` show the probe pattern.

**Two ten-minute isolation tests, run before any code change and after each item:**

- **Hardware scale 2.0** (half resolution) from F3. If frame rate barely moves, the GPU is confirmed irrelevant and the item list below is the right list.
- **Glow off, then Shadows off, then Lighting off** from the Visuals tab. Record draw calls after each. The drops tell you the exact cost of each extra pass and are the acceptance evidence for items R1 to R3.

## Current architecture, verified 2026-09-10

| Area | Current state | Where |
| --- | --- | --- |
| Engine | WebGL2 `Engine`, MSAA requested, `preserveDrawingBuffer: true`, `stencil: true`. No `adaptToDeviceRatio`, no `powerPreference`, no WebGPU path, no snapshot rendering. | `packages/render/src/index.ts:193` |
| Antialiasing | Custom pipeline: a `PassPostProcess` capture named `sidereal-aa-scene` owning MSAA coverage (up to 8 samples), then either TAA with history reprojection (`samples = 8`, `disableOnCameraMove`) or FXAA. Three passes attached to the camera. | `packages/render/src/antialiasing-pipeline.ts:105-160` |
| Base hull | `assets/runtime/voxels/wayfarer.glb`, about 219k vertices, 12 materials. | `index.ts` (search `wayfarer.glb`) |
| Hull, roof, floor, equipment | Manifest-driven. Prototype GLB loaded once per asset, then `source.clone()` per placement. Batching by material applies only to cargo and the pilot-section hull id. | `installed-equipment.ts:29`, `:39`; `installed-hull.ts` |
| Native walls | Per-placement material batching landed (commit "Qualify per-placement native wall material batching"); walls are still one batch per placement, not per material across the deck. | `construction-instance.ts` |
| Construction authored assembly | `source.clone()` per placement, world matrix cloned per mesh. | `construction-authored-assembly.ts:135` |
| Remote ships | `createInstance` per part with shared geometry, glass cloned once per material. This is the pattern the local ship should follow. | `remote-ships.ts:330`, `remote-exterior-glass.ts:16` |
| Instancing on the local ship | None. Thin instances used only for dust. | `environment/index.ts` (search `thinInstanceSetBuffer`) |
| Freezing | None. Zero `freezeWorldMatrix`, `material.freeze`, `doNotSyncBoundingInfo`, `freezeActiveMeshes`, `blockMaterialDirtyMechanism`, `cullingStrategy` or mesh LOD in game code. | grep |
| Material clones | Cutaway: one clone per roof and upper-wall mesh. Object presentation: one clone per material per switchable placement (cached in a map). Remote glass: one per material. Sum is 636 scene materials against a few dozen authored. | `index.ts:419`, `object-presentation.ts:74`, `remote-exterior-glass.ts:16` |
| Lights | Hemispheric fill, directional sun, 6 room spots, 6 door accents, bridge spot, up to 2 fixture spots per equipment placement. Local-light budget (Off/4/8/16/32) implemented and wired to F3. `maxSimultaneousLights = 8` forced on ship materials. | `ship-lighting.ts`, `equipment-lighting.ts`, `local-light-budget.ts` |
| Shadows | Three generators: ship sun (1024, PCF low), construction sun (1024), planet key (1024). Seven 256 px spot maps, `FILTER_NONE`, nearest, render-once with dirty invalidation. Structural meshes cloned as invisible shadow proxies. | `ship-lighting.ts:461`, `:136-152`; `construction-instance.ts:343`; `environment/planet-shadows.ts:20` |
| Shadow cache | Phase 1a done: scalar snapshots, no per-frame strings. Update CPU 0.31 ms confirms. | `ship-lighting.ts`, `ship-shadow-cache.ts` |
| Glow | Main `GlowLayer` fixed 512 px, kernel 24, intensity 0.4. Still includes every imported ship mesh and every crew mesh so opaque geometry writes depth into the mask. Planet glow layer at 0.25 ratio. | `index.ts:536-544`, `environment/index.ts` |
| Post-processing | Antialiasing pipeline above plus a detached brightness/contrast/gamma/saturation pass. No tone mapping, bloom, SSAO. | `graphics-settings.ts` |
| IBL | `HDRCubeTexture` 128 px, `environmentIntensity = 0.28`. | `index.ts` (search `HDRCubeTexture`) |
| Planets | Procedural cube-sphere terrain, layered planet with up to 11 meshes each, 17 lab bodies, per-frame JSON signature for LOD. Paused by owner. | `environment/layered-planet.ts`, `environment/index.ts`, `content/src/space.ts` |
| Per-frame allocations | Dust recomposes 576 matrices and refreshes bounds each frame. Planet LOD signature is `JSON.stringify` per body per frame. Debug-feature key is `JSON.stringify` per frame. | `environment/index.ts`, `index.ts` (search `beforeFrame(JSON`) |
| Assets | No KTX2, Draco or meshopt. Embedded PNG textures. `prepare_app.py` is a plain copy. | `scripts/prepare_app.py` |
| Tests | 40+ render test files on `NullEngine`; none asserts draw calls, pixels or frame cost. | `packages/render/src/*.test.ts` |

## Hazards to read before touching geometry

**Mesh selection is by name regex.** Lighting membership, cutaway, cabin visibility, shadow casters and glow inclusion select meshes with patterns like `/GEO-(deck|walls|partitions|cutaway|roof)/` (`ship-lighting.ts`, `index.ts`, `cabin-visibility.ts`; `installed-hull.ts` renames roof meshes to `GEO-roof-hull-...`). Anything that merges or instances must keep a name that still matches, and per the owner correction above must also keep the semantic role explicit. The durable fix is a `metadata.role` set at placement time and selectors that read it; do that for every selector you touch.

**Per-mesh material clones exist for a reason.** Cutaway fading clones so it can set transparency per mesh; object presentation clones so it can toggle emissive per placement. Babylon instances share the source material, so an instance cannot carry its own material state. Either keep those meshes as clones with a shared material and use `mesh.visibility` (a mesh property, no clone needed) for fading, or move per-placement state into instance attributes. Item R5 below covers this.

**Object selection and construction identity are per placement.** `object-presentation.ts` picks meshes and reads `metadata.partId`. Instances carry their own metadata and are pickable. Merged meshes cannot be picked per placement, so any merge must build a triangle-range-to-placement map and resolve picks through it, or be limited to categories that are never picked, damaged or refit individually. The owner has said hull and floor will not stay unselectable.

**Shadow render lists and glow include lists hold mesh references.** `setCabinVisible` rebuilds the sun render list from a captured caster array. Replacing meshes after lighting is created leaves stale references. Do batching and instancing before lighting, which is the current load order.

**Equipment lights are bound to placement meshes.** `createEquipmentLighting(...).setMeshes(meshes)` sets `includedOnlyMeshes` per placement. Instances are fine. Merging across placements would break per-fixture light bounding.

**The antialiasing pipeline holds the first offscreen target.** Any new pipeline (Phase 4) must chain after `sidereal-aa-scene` or replace it deliberately; two MSAA captures would double GPU cost for nothing.

## Issue register

Ordered by expected effect per effort. Each item has evidence, the fix, the expected movement in the F3 counters, and its status. Work them top to bottom unless the owner's scheduling section says otherwise. The register supersedes the old phase numbering; phase names are kept in parentheses for continuity with earlier handoffs.

### R0. Harness: role breakdown and budget test (Phase 0)

Status: implemented with hardware Deck and TAB-Flight measurements (2026-09-10); seated Flight acceptance remains outstanding. See the progress entry below. The harness and role inventory are available for R1.

- Add a `metadata.role` field at every mesh creation site: `hull`, `roof`, `floor`, `wall`, `equipment`, `cargo`, `crew`, `remote`, `planet`, `environment`, `effect`, `proxy`. Add an F3 row "Meshes by role" listing active and total per role. Without this nobody can say where 2,663 meshes come from.
- Add `packages/render/src/render-budget.test.ts` on `NullEngine` that builds the ship through the real loaders with fetch stubbed to the manifests under `assets/runtime/assembly/`, and asserts upper bounds on total meshes, materials, lights and shadow generators. Set bounds to today's numbers plus a small margin; lower them as items land.
- Save the 2026-09-10 hardware numbers above as `output/playwright/render-plan/00-baseline/hardware-2026-09-10.json`.

Acceptance: role row visible in F3, budget test passes, baseline JSON committed.

### R1. Glow layer re-renders the entire ship (Phase 1b)

Evidence: `packages/render/src/index.ts:544` adds every imported mesh to the glow layer's include list, and `:541` adds every crew mesh, so opaque geometry is drawn a second time into the 512 px glow target purely to occlude bloom. This is roughly one full extra pass.

Fix: build one merged, invisible, black unlit occluder mesh per structural group (hull shell, partitions, roof when closed, deck floor) and include only those plus the true emitters. `glow-occluders.ts` already implements this shape for the planet layer. Keep the cutaway relationship: when the roof is open, the roof occluder must be excluded exactly as the roof meshes are hidden; when a deck is hidden its occluder is hidden.

Expected: Deck draw calls fall by roughly the active mesh count. Verify with Glow off before and after; the delta should shrink to the emitter count.

### R2. Shadow passes draw the ship again per map

Evidence: about 185 structural meshes are cloned as invisible shadow proxies (`ship-lighting.ts:136-152`), each a separate draw in the sun map. Two maps are allocated in the measured views; seven spot maps exist but are render-once.

Fix: after R4 merges structural geometry, the proxies collapse automatically because the merged meshes cast. If proxies remain necessary for the material-independent occlusion they provide, merge the proxies themselves into one mesh per structural group. Reconcile the Lighting Off discrepancy (sun map still rendering) while here.

Expected: Shadows off delta becomes tens of calls, not hundreds.

### R3. Antialiasing capture cost

Evidence: `antialiasing-pipeline.ts:136-143` renders the scene into a `PassPostProcess` with up to 8 MSAA samples, then TAA at `samples = 8`. This is GPU cost, not draw-call cost, so it is not the current bottleneck, but it will be once submission is fixed.

Fix: none now. Add an F3 row for the capture's actual target size and sample count. When R1 to R6 have landed, re-measure with the capture at 4 samples and at 1 sample plus FXAA, and pick the default by measurement. Do not stack a second MSAA target in Phase 4.

### R4. Static geometry is cloned per placement, not merged or instanced (Phase 2a, 2b)

Evidence: `installed-equipment.ts:39` clones every prototype mesh per placement. Hull manifest alone yields several hundred meshes; the floor kit is dozens of copies of one asset; native walls batch per placement only; construction authored assembly clones per placement (`construction-authored-assembly.ts:135`). Remote ships already use `createInstance` (`remote-ships.ts:330`) and are the model.

Fix, in this order:

1. **Instances for repeated kits.** In `equipmentPlacement`, for categories flagged instanceable in the manifest (`floor`, standard walls, repeated equipment without per-placement material state), use `source.createInstance(name)` parented to the placement node. Instances keep `metadata.partId`, pickability and per-instance `visibility`. Extend `object-presentation.ts` to accept `InstancedMesh`. Keep the `GEO-` prefix and set `metadata.role`.
2. **Merge across placements for structural categories.** Extend `batchStaticMaterials` to split by `subMeshes[i].materialIndex` instead of throwing, then merge hull shell, roof and deck floor by material across placements. Build a `Map<mergedMesh, Array<{ start, count, placementId }>>` from the merge so picks, damage highlights and refit can resolve a triangle back to a placement. Expose it through the same metadata the selectors already read.
3. **Thin instances for the floor kit** if it is never picked individually; otherwise standard instances are enough.

Expected: Deck total meshes from about 2,660 to well under 1,000 before planets are addressed; draw calls fall proportionally in every pass.

### R5. 636 materials

Evidence: `index.ts:419` clones a material per roof and upper-wall mesh for cutaway fading; `object-presentation.ts:74` clones per material per switchable placement; `remote-exterior-glass.ts:16` clones per material; per-placement wall batching creates per-placement material copies. Each distinct material in a pass costs an effect bind and uniform upload, and defeats Babylon's material sorting.

Fix:

- Cutaway fading: drop the clone. Set `transparencyMode` once on the shared material and drive `mesh.visibility` per mesh, which is what the fade code already writes.
- Object presentation: keep one "on" and one "off" material per authored material (two materials per source, not one per placement), swap the reference per mesh on toggle.
- Wall batching: batch by material across the deck, not per placement (see R4 step 2).
- After load, `material.freeze()` every material that no animation touches; mark the switchable set as unfrozen and call `unfreeze()` before mutation.

Expected: materials from 636 to under 80. This also makes R4's merges possible, since merges require a shared material.

### R6. Nothing is frozen (Phase 2c, 2d)

Evidence: zero freeze or culling-strategy calls in game code. Babylon recomputes world matrices and bounding info for all 2,663 meshes every frame and frustum-tests each.

Fix, after R4 and R5 so the mesh set is final:

```ts
scene.blockMaterialDirtyMechanism = true;   // during bulk setup only, reset after
for (const mesh of staticShipMeshes) {
  mesh.freezeWorldMatrix();                  // see note on the moving ship root
  mesh.doNotSyncBoundingInfo = true;
  mesh.cullingStrategy = AbstractMesh.CULLINGSTRATEGY_BOUNDINGSPHERE_ONLY;
}
```

The ship root moves in flight, and `freezeWorldMatrix()` freezes the composed matrix. Two workable options: freeze children and re-freeze them from one `onAfterWorldMatrixUpdateObservable` on the ship root using `freezeWorldMatrix(newMatrix)`, or leave matrices live but set `doNotSyncBoundingInfo` and the sphere-only culling strategy, then measure. Try `scene.freezeActiveMeshes(true)` in Flight where the active set is stable and unfreeze on any view or visibility change.

Expected: measurable drop in `_evaluateActiveMeshes` in the profiler; Render CPU falls even at constant draw calls.

### R7. Planet and environment mesh population

Evidence: total meshes are the same in both views (2,662 and 2,663), so the ship is not the only contributor. Layered planets carry up to 11 meshes each including a hidden core sphere; 17 lab bodies exist. Exact attribution needs R0's role row.

Fix, within the owner's pause: do not iterate planet visuals. Only ensure bodies outside the camera far plane or below a projected size threshold are `setEnabled(false)` rather than left active, that the planet LOD signature is a revision counter rather than `JSON.stringify` per body per frame, and that the hidden core sphere is either removed or reduced to a few segments. Anything further waits for the pause to lift.

Expected: active meshes in Flight drop; Flight draw calls approach the ship-only count.

### R8. Remaining per-frame CPU (Phase 1c, 1d)

Evidence: debug-feature key via `JSON.stringify` each frame; dust recomposes 576 matrices and refreshes bounding info each frame.

Fix: compare primitives for the debug key. For dust, set `alwaysSelectAsActiveMesh = true`, `doNotSyncBoundingInfo = true`, never refresh bounds, and move the streak animation into the shader so the CPU rebuild happens only on layout changes. Per the owner correction, constant velocity is not a stationary condition.

Expected: small; Update CPU is already 0.31 ms. Do these because they are cheap and they remove noise from later measurements.

### R9. Lights and shadow filtering (Phase 3 remainder)

Status: local-light budget done and wired to F3. Remaining items are measured experiments, not presumed wins.

- Measure `maxSimultaneousLights` at 8 versus 4 on structural materials with the F3 lit-light row and the profiler's shader compile count. Keep whichever is faster with no visible change.
- Measure spot shadow filtering: `FILTER_NONE` today versus PCF at the same 256 px size. Softness is a fidelity goal, not a performance one; record cost and defer the choice to Phase 4.

### R10. WebGPU backend and snapshot rendering

Evidence: WebGL draw submission costs about 5 µs per call in this scene. Babylon's WebGPU engine lowers per-call CPU cost and its snapshot rendering mode records command bundles for static geometry and replays them, which is exactly what a ship interior is.

Fix, after R1 to R6 so the scene is static enough to snapshot: add a graphics setting to create `WebGPUEngine` when `navigator.gpu` is present, fall back to WebGL2 otherwise. Enable `engine.snapshotRendering = true` with `snapshotRenderingMode = SNAPSHOTRENDERING_FAST` in views where the ship and camera relationship is stable, and reset the snapshot on any scene-graph change (placement, visibility, view switch). Verify the antialiasing pipeline, glow layer, and thin-instance dust under WebGPU; Babylon's shader plugins for TAA need a check.

Expected: Render CPU roughly halves at equal draw calls. This is the single largest lever available to a browser client after the scene is batched, and it has no equivalent need in native engines.

### R11. Image pipeline and reflections (Phase 4, deferred by owner)

Retained from the original plan; do not start until the owner lifts the deferral. Each item goes behind a measured graphics setting and chains after `sidereal-aa-scene`.

- `DefaultRenderingPipeline` with ACES tone mapping, bloom (threshold about 0.85, weight about 0.35), optional vignette. Wire the existing brightness, contrast, gamma and saturation controls into it only after proving the transfer is equivalent; otherwise keep the existing pass.
- `SSAO2RenderingPipeline` at half resolution, radius about 0.3 m at ship scale, Deck view first.
- Prefiltered 256 px `.env` environment texture at intensity near 0.7, with `useRadianceOcclusion` and `useHorizonOcclusion` on PBR materials; re-tune sun intensity afterwards.
- Nebula textures sampled trilinear rather than nearest; clear colour re-tuned under tone mapping.
- Depth of field in Deck only, user-toggleable.

### R12. Asset compression and load time (Phase 5)

Retained. A build-output step in `scripts/prepare_app.py` or a new `scripts/optimize_assets.py` using gltf-transform: dedup, prune, quantize colour, texcoord and weights (not positions without lattice validation), meshopt or Draco, KTX2 with UASTC for normal and ORM maps and ETC1S for albedo. Vendor decoder WASM under `assets/runtime/decoders/` and point Babylon's decoder URL configs at it. Record hashes and run the material, socket, animation and selection validation the owner requires. Not a frame-time item.

### R13. Engine flags and quality dial (Phase 6)

- Drop `preserveDrawingBuffer: true` at `index.ts:193`; use `Tools.CreateScreenshotUsingRenderTarget` for captures.
- Add `powerPreference: "high-performance"`.
- Expose render scale (`setHardwareScalingLevel`) and a low-quality preset (SSAO and DoF off, half shadow sizes, TAA off) in Graphics.
- Distance LOD for the base hull in Flight (`addLODLevel` with a merged low-poly shell) once R4 has produced merged shells.

### R14. Planets (Phase 7, owner-paused)

Only when the pause lifts: remove or shrink the hidden core sphere (`environment/layered-planet.ts:81`), cache the volcanic emissive texture per seed, move terrain and cloud generation into the worker pattern from `voxel-worker.ts`, replace the atmosphere billboard with a Fresnel rim shell.

## Out of scope for the renderer agent

**Bevels.** Reference bricks show chamfers catching specular highlights. That is authored geometry or a detail normal map and belongs to the Blender pipeline in `docs/blender_asset_migration.md`. After R11 lands, capture a side-by-side and hand it to the art workflow in `assets/art-library/WORKFLOW.md`.

**Engine choice.** The owner is weighing a Godot client. These numbers are not a reason to switch: submission cost would drop but the scene graph would still be five times too large. Any engine comparison should be run after R1 to R6 so both sides are batched.

## Order and dependencies

```
R0 harness (role row, budget test, baseline JSON)
 ├─ R1 glow occluders          independent, do first, biggest single delta
 ├─ R8 per-frame CPU           independent, cheap
 ├─ R5 materials  ──┐
 └─ R4 merge/instance ─┴─ R6 freeze ─ R2 shadow proxies ─ R7 environment population
                                       └─ R3 AA capture re-measure
                                       └─ R10 WebGPU + snapshot
R9 lights/shadows experiments: any time after R0, measured
R11 image pipeline, R12 compression, R13 flags, R14 planets: gated by owner
```

R1 alone should be visible in a day. R4 to R6 together are the bulk of the work, about a week, and are what move Deck from 7,300 draw calls to under 900.

## Progress log

Append one dated entry per completed item with: what changed (files), before and after counters at the baseline resolution, screenshot and JSON paths, tests added, and anything deliberately left undone.

- 2026-09-09: plan written.
- 2026-09-09 integration status correction: the Graphics local-light cap and F3 eligibility counts are wired in the game. Actual pointer tests exercised All, 8, 4 and Off, equipment and debug gates and Deck/Flight transitions; see [light-budget evidence](handoffs/render_light_budget.md). This is the light-budget portion of R9, not completion of the plan.
- 2026-09-09: Phase 1a (shadow placement comparison) now uses reusable scalar snapshots instead of per-frame arrays and string serialization. Synthetic helper median 0.152 to 0.029 ms. Transform, cutaway, geometry and caster-membership regressions added. Included in public client release 400dc9fdda68. See [bounded implementation evidence](handoffs/render_performance_resume.md).
- 2026-09-09 browser follow-up: release 400dc9fdda68 passed bounded cache behaviour review. SwiftShader captures at 1280 × 900 recorded Deck 2,312 draw calls / 581 active / 1,762 total, Flight 2,106 / 569 / 1,762. Local-light caps produced the expected eligible counts. Evidence under [`output/playwright/render-plan/phase-1a/`](../output/playwright/render-plan/phase-1a/). No timing field from these captures is performance evidence. Discrepancy noted: Lighting Off suppresses local shadows but still renders the exterior sun map while diagnostics report zero.
- 2026-09-10: first hardware baseline recorded from the owner's laptop RTX 4080 (table at the top of this file). Deck 7,304 draw calls, 2,663 total meshes, 637 materials, 37.36 ms Render CPU; Flight 4,920 / 2,662 / 636 / 26.96 ms. Diagnosis: CPU-bound on draw submission at about 5 µs per call; Update CPU 0.31 ms confirms Phase 1a. Plan rewritten as the issue register above. No register item started.

### 2026-09-10 — R0 harness implementation and hardware review

Added `mesh-roles.ts`, import-time role assignment across renderer primitive/import/placement sites, and the on-demand F3 “Meshes by role” section in `diagnostics.ts` and CanvasUI. Unknown roles are explicitly reported as `unclassified`; selectors in the new harness read metadata, never names. The retained voxel GLB adapter reads authored `sidereal_layer` extras. No geometry, authority, visibility or material behavior changed. Exact changed paths are in this item's commit.

Added NullEngine `mesh-roles.test.ts` (active instances, disabled sources, missing roles, identity and disposal), CanvasUI `diagnostics-roles.test.ts`, and `render-budget.test.ts`. The budget loads actual GLBs through real installed and semantic Wayfarer loaders with local transport stubs; only decal canvas drawing is stubbed. Installed ship measured 1,303 meshes / 182 materials / 45 lights / 8 generators (bounds 1,360 / 190 / 48 / 8). Current semantic ship measured 1,570 / 173 / 2 / 1 (bounds 1,630 / 181 / 2 / 1), with zero unclassified meshes and placement identities retained. These ship-loader budgets exclude crew, environment and remote inventories; browser totals include them.

`npm run check` passed 243 files / 1,459 tests and the documentation audit; `npm run build` passed. An initial full-run planet-terrain test timed out at its existing 20-second limit; the subsequent full checks passed without changing that limit. Existing large-chunk build warnings remain.

Hardware: t3 shared browser reports ANGLE NVIDIA RTX 4080 Laptop GPU / D3D11. Canvas constrained to **1574 × 907**, scale 1, F3 open, nothing selected; shared preview screenshots are scaled to 1280 × 800 because its viewport resize command timed out. Current build uses MSAA4 (one attached capture); its TAA implementation now uses two passes rather than the historical three-pass chain. Fresh before measurements therefore accompany the original owner baseline instead of attributing unrelated build differences to R0. An exploratory TAA switch before the initial captures left extra allocated textures; after reload they returned to 85. Geometry/draw comparisons remain identical.

| View | Draw calls before → after | Active / total meshes before → after | Materials before → after | Render CPU ms before → after |
| --- | --- | --- | --- | --- |
| Deck, radius 70.008 m | 5,539 → 5,539 | 1,396 / 2,688 → 1,396 / 2,688 | 632 → 632 | 53.26 → 43.82 |
| TAB-Flight, radius 938.715 m | 4,926 → 4,926 | 1,106 / 2,687 → 1,106 / 2,687 | 631 → 631 | 68.73 → 56.12 |

Timing variance is recorded, **not claimed as a metadata performance improvement**. Flight was entered via TAB with the character on foot: the requested seated control-station acceptance is still outstanding, so R0 is not given final completion sign-off.

Isolation draw calls were identical before/after: Deck scale2 **5,539**, Glow off **2,769**, then Shadows off **1,395**, then Lighting off **1,395**. Flight scale2 **3,854**, Glow off **3,041**, then Shadows off **2,106**, then Lighting off **2,106**. Flight scale2 changes planet LOD and population (2,687 → 2,685 meshes), so it is not a pure pixel-cost comparison. All switches and scale were restored. Normal Deck roles account for all meshes, including 671 remote, 423 wall, 372 cargo, 362 crew, 314 hull, 179 roof and 127 floor meshes; disabled prototypes count toward totals.

Evidence: `output/playwright/render-plan/00-baseline/hardware-2026-09-10.json` preserves the owner-provided baseline; `output/playwright/render-plan/R0/before.json`, `after.json`, `before-{deck,flight}.png`, and `after-*.png` contain fresh hardware captures and isolation results. The initial local SwiftShader probe was abandoned once hardware became available; no software timing is used here. R1 source re-verification also found `glow-occluders.ts` registers existing meshes rather than implementing the merged proxy described in the register; R1 needs a new implementation.

Commit isolation note: pre-existing construction, character/F3 and editor changes remain unstaged. `packages/render/src/debug-overlays.ts` was already an untracked file owned by the other F3 work; its small role-tag delta remains in the working tree and is preserved as `output/playwright/render-plan/R0/untracked-overlay-role.patch`, rather than committing the unrelated file. Validation above covers the shared working tree, not a claim that its unrelated pending changes are included in this commit.
