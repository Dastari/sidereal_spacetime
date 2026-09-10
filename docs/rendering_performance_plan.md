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

Status: implemented with hardware Deck and TAB-Flight measurements (2026-09-10); seated Flight and detailed occlusion acceptance remain outstanding.

Evidence: `packages/render/src/index.ts:544` adds every imported mesh to the glow layer's include list, and `:541` adds every crew mesh, so opaque geometry is drawn a second time into the 512 px glow target purely to occlude bloom. This is roughly one full extra pass.

Fix: build one merged, invisible, black unlit occluder mesh per structural group (hull shell, partitions, roof when closed, deck floor) and include only those plus the true emitters. `glow-occluders.ts` already implements this shape for the planet layer. Keep the cutaway relationship: when the roof is open, the roof occluder must be excluded exactly as the roof meshes are hidden; when a deck is hidden its occluder is hidden.

Expected: Deck draw calls fall by roughly the active mesh count. Verify with Glow off before and after; the delta should shrink to the emitter count.

### R2. Shadow passes draw the ship again per map

Status: partial implementation, unmeasured (2026-09-10). Legacy proxy merging is blocked by missing explicit deck identity; see progress entry.

Evidence: about 185 structural meshes are cloned as invisible shadow proxies (`ship-lighting.ts:136-152`), each a separate draw in the sun map. Two maps are allocated in the measured views; seven spot maps exist but are render-once.

Fix: after R4 merges structural geometry, the proxies collapse automatically because the merged meshes cast. If proxies remain necessary for the material-independent occlusion they provide, merge the proxies themselves into one mesh per structural group. Reconcile the Lighting Off discrepancy (sun map still rendering) while here.

Expected: Shadows off delta becomes tens of calls, not hundreds.

### R3. Antialiasing capture cost

Status: capture diagnostics implemented, hardware comparison unmeasured (2026-09-10). Default unchanged.

Evidence: `antialiasing-pipeline.ts:136-143` renders the scene into a `PassPostProcess` with up to 8 MSAA samples, then TAA at `samples = 8`. This is GPU cost, not draw-call cost, so it is not the current bottleneck, but it will be once submission is fixed.

Fix: none now. Add an F3 row for the capture's actual target size and sample count. When R1 to R6 have landed, re-measure with the capture at 4 samples and at 1 sample plus FXAA, and pick the default by measurement. Do not stack a second MSAA target in Phase 4.

### R4. Static geometry is cloned per placement, not merged or instanced (Phase 2a, 2b)

Status: implemented, unmeasured for acceptance (2026-09-10). Partial hardware evidence below.

Evidence: `installed-equipment.ts:39` clones every prototype mesh per placement. Hull manifest alone yields several hundred meshes; the floor kit is dozens of copies of one asset; native walls batch per placement only; construction authored assembly clones per placement (`construction-authored-assembly.ts:135`). Remote ships already use `createInstance` (`remote-ships.ts:330`) and are the model.

Fix, in this order:

1. **Instances for repeated kits.** In `equipmentPlacement`, for categories flagged instanceable in the manifest (`floor`, standard walls, repeated equipment without per-placement material state), use `source.createInstance(name)` parented to the placement node. Instances keep `metadata.partId`, pickability and per-instance `visibility`. Extend `object-presentation.ts` to accept `InstancedMesh`. Keep the `GEO-` prefix and set `metadata.role`.
2. **Merge across placements for structural categories.** Extend `batchStaticMaterials` to split by `subMeshes[i].materialIndex` instead of throwing, then merge hull shell, roof and deck floor by material across placements. Build a `Map<mergedMesh, Array<{ start, count, placementId }>>` from the merge so picks, damage highlights and refit can resolve a triangle back to a placement. Expose it through the same metadata the selectors already read.
3. **Thin instances for the floor kit** if it is never picked individually; otherwise standard instances are enough.

Expected: Deck total meshes from about 2,660 to well under 1,000 before planets are addressed; draw calls fall proportionally in every pass.

### R5. 636 materials

Status: material sharing implemented with hardware Deck/TAB-Flight review (2026-09-10); seated acceptance and static freezing with R6 remain pending.

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

Status: owner-limited implementation complete, unmeasured (2026-09-10). No planet visual changes.

Evidence: total meshes are the same in both views (2,662 and 2,663), so the ship is not the only contributor. Layered planets carry up to 11 meshes each including a hidden core sphere; 17 lab bodies exist. Exact attribution needs R0's role row.

Fix, within the owner's pause: do not iterate planet visuals. Only ensure bodies outside the camera far plane or below a projected size threshold are `setEnabled(false)` rather than left active, that the planet LOD signature is a revision counter rather than `JSON.stringify` per body per frame, and that the hidden core sphere is either removed or reduced to a few segments. Anything further waits for the pause to lift.

Expected: active meshes in Flight drop; Flight draw calls approach the ship-only count.

### R8. Remaining per-frame CPU (Phase 1c, 1d)

Status: implemented, unmeasured (2026-09-10). Hardware acceptance blocked by first-frame readiness; see progress log.

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


### 2026-09-10 — R1 merged local glow occluders, partial hardware acceptance

Implemented `ship-glow-occluders.ts`, integrated its lifecycle and held-equipment refresh in `index.ts`, added `ship-glow-occluders.test.ts`, and included the helper in both real-loader `render-budget.test.ts` scenes. Opaque static placement geometry is copied into black offscreen-only proxies grouped by explicit structural role, deck, rendering group, orientation and compatible material/depth state. Every proxy has `metadata.role = proxy` and triangle ranges resolving the original placement and source mesh. Original surfaces, materials, picking and shadow membership are retained. No instances or authored asset changes. Animated crew, actual emitters, glass, fading and unsupported material states retain their original glow draws. Visibility, geometry, local transforms and material-state changes invalidate the proxies; ship-root motion and moving nonmergeable crew do not rebuild them. NullEngine regressions exercise these boundaries, identity lookup, deck/cutaway changes and disposal. Existing scene mesh/material bounds remain appropriate because R1 adds proxy resources; it reduces pass submissions rather than original mesh population.

Validation: `VITEST_MAX_WORKERS=2 npm run check` passed 246 files / 1,467 tests and documentation audit; `npm run build` passed. Default-concurrency runs encountered the pre-existing planet terrain timeout; the limit was not changed. An unrelated editor test failure was fixed by its owning workstream. Validation covers the shared working tree, with unrelated construction/art/editor changes excluded from this commit.

Hardware: visible, focused t3 `tab_b`, ANGLE NVIDIA RTX 4080 Laptop GPU / D3D11, actual canvas 1574 × 907, MSAA4, F3 open and nothing selected. The preview service still reported hidden/rejected snapshots after reopen, although the document reported visible and accepted keyboard actions. Evidence therefore uses the actual canvas export (including F3) rather than preview snapshots. These are hardware captures, not SwiftShader. Camera radii and elevations match R0. R0 after-counters are the immediate prior-item reference; sessions differ, so timing is not a controlled speedup result.

| View | Draw calls R0 → R1 | Active / total meshes R0 → R1 | Materials R0 → R1 | Render CPU ms R0 → R1 |
| --- | --- | --- | --- | --- |
| Deck, radius 70.008 m | 5,539 → 4,348 | 1,396 / 2,688 → 1,396 / 2,693 | 632 → 638 | 43.82 → 54.31 |
| TAB-Flight, radius 938.715 m | 4,926 → 4,155 | 1,106 / 2,687 → 1,106 / 2,691 | 631 → 637 | 56.12 → 72.05 |

Draw reductions: Deck 1,191 (21.5%), TAB-Flight 771 (15.7%). No CPU timing improvement is claimed. All F3 counter fields are in the JSON files. Proxy totals are five in Deck and four in Flight, with zero active in the main pass and zero unclassified meshes.

Isolation before → after draw counts: Deck scale2 5,539 → 4,348; Glow off 2,769 → 2,769; then Shadows off 1,395 → 1,395; then Lighting off 1,395 → 1,395. TAB-Flight scale2 3,854 → 3,083; Glow off 3,041 → 3,041; then Shadows off 2,106 → 2,106; then Lighting off 2,106 → 2,106. Scale restored to 1 before the sequential switches. Flight scale2 still changes planet LOD, so it is not a pure pixel-cost comparison. All switches were restored afterward.

Evidence: `output/playwright/render-plan/R1/{deck,flight-tab}.json`, corresponding JPEGs, each view's `-scale2`, `-glow-off`, `-shadows-off`, `-lighting-off` JSON/JPEG files, plus a full-resolution `after-deck.png`. Prior-item evidence remains in `R0/`. JSON sampling and image rendering may straddle F3's 500 ms sample boundary, so timing rows can differ slightly.

Left undone: seated control-station Flight acceptance remains outstanding. Ordinary walking inputs reached an interior collision boundary and did not seat the character; no authority state was edited. Roof-open/closed captures and NullEngine visibility regressions exist, but close-up emitter occlusion and independently hidden-deck hardware review still need acceptance. The separate planet glow layer still submits original occluders; planet visuals remain paused. Total Glow-off delta therefore remains 1,579 Deck / 1,114 TAB-Flight, rather than just emitter draws. R1 is implemented with partial hardware measurement, not marked done.


### 2026-09-10 — R8 per-frame work implemented, unmeasured

Re-verified the cited `index.ts` debug-key and `environment/index.ts` dust update paths. Added `debug-visibility-revision.ts` with scalar cabin/placement/power snapshots, including in-place mutations; `debug-features.ts` accepts its numeric revision while retaining legacy string callers. Extracted dust into `environment/dust-field.ts`: the original unlit StandardMaterial now has a vertex plugin for fractional world-origin translation, streak orientation/length and perspective grain-size cap. Seeded cell matrices and grain attributes upload only on cell-boundary or layout changes; dust remains active with bounding synchronization disabled and never refreshes instance bounds. Constant velocity still moves dust as the replicated origin changes. No authored PBR surface, simulation, authority or planet visual changed.

Added NullEngine `debug-visibility-revision.test.ts` and `environment/dust-field.test.ts`. Tests cover stable override suppression, power/identity/cabin changes, constant-velocity motion without matrix uploads, world-cell crossings, reduced motion, depth cap and layout changes. Numerical vertex comparisons cover the old CPU Matrix.Compose placement and streak geometry. Existing population/material bounds are unchanged because this item removes per-frame CPU work, not scene resources.

`VITEST_MAX_WORKERS=2 npm run check` passed 251 files / 1,490 tests and documentation audit. `npm run build` passed with existing chunk-size warnings. Shared-tree unrelated work remains excluded from the commit. Evidence: `output/playwright/render-plan/R8/check.log`, `build.log`, `browser-blocker.json`.

Before reference: R1 Deck 4,348 calls / 1,396 active / 2,693 total / 638 materials / 54.31 ms Render CPU; TAB-Flight 4,155 / 1,106 / 2,691 / 637 / 72.05 ms. Before isolation is preserved in R1 (Deck scale2 4,348, Glow off 2,769, Shadows off 1,395, Lighting off 1,395; TAB-Flight 3,083 / 3,041 / 2,106 / 2,106). After counters and isolation: **unmeasured**. RTX 4080 hardware compiled the dust shader without errors, but the clean normal-client load remained covered by “Preparing the first frame.” `opaqueSceneTexture.isReadyForRendering()` was false, with authored floor meshes failing readiness in that render pass; all queried shader compilation errors were empty. The preview also repeatedly reported a hidden document and rejected snapshots. No readiness gate or authority state was bypassed; no screenshot or timing acceptance is claimed. Seated Flight and R0/R1 occlusion acceptance remain pending. Continue R5 and retry hardware acceptance after the material work.


### 2026-09-10 — R5 material sharing and R8 combined hardware retry

Implemented shared immutable on/off emissive variants in `object-presentation.ts`: the authored source is the on state, and only one off clone per emitting source is allocated. Non-emitting materials need no clone; switching a placement swaps its material reference. Disposal restores source references and retains shared textures. Instances needing independent switches remain excluded from R4 until their per-placement material state is representable.

Removed per-roof material clones and per-frame transparency-mode mutation. `cutaway.ts` configures automatic transparency once, then drives `mesh.visibility`; settled opaque meshes remain depth-writing, fading siblings blend independently, and authored hull paint retains its alpha mode. The new role-based selector also requires explicit `cutawayFade` metadata, assigned by `installed-hull.ts`, `hull-decals.ts` and the retained GLB extras adapter in `legacy-mesh-role.ts`. This preserves construction roofs' separate deck gate. `index.ts` consumes that metadata instead of the old name regex. Real-loader assertions prove the selected fade set is identical to the former names for both retained GLB and installed hull. Current native wall batching already shares source materials (`native-wall-batches.ts` / `remote-exterior-batches.ts`); the register's per-placement material-copy claim is stale. Cross-placement geometry batching stays in R4. Static material freezing stays with R6, after R4 determines final receiver/caster and visibility compatibility; no speculative freezing during a fade.

NullEngine tests cover two independently fading roofs on one material, decal alpha preservation, shared on/off state across placements, authored optical properties and disposal. Real-loader budget now includes cutaway preparation without material growth and tightens installed material bound 190 → 188. `VITEST_MAX_WORKERS=2 npm run check` passed 251 files / 1,491 tests and docs; `npm run build` passed. An additional retained-GLB selector equivalence assertion passed the real-loader test afterward. Exact files are in the R5 commit; unrelated shared-tree changes remain excluded.

The browser eventually became visible and passed first-frame readiness without a readiness bypass. R8's initial blocker is preserved as history. This is the first successful hardware capture of the combined R8/R5 state, not an isolated R8 timing comparison. The actual render canvas is 1574 × 907, MSAA4, F3 visibly open, nothing selected; Deck camera radius 70.008 m / elevation 35.264° / azimuth 3.591593; TAB-Flight 938.715 m / 89.141°. ANGLE NVIDIA RTX 4080 Laptop GPU / D3D11. Document visibility was visible, but document focus reported false. Preliminary captures without F3 were discarded. The dust and ship appear in the reviewed screenshots; original PBR surfaces and roof cutaway remain intact.

| View | R1 reference → R8/R5 draw calls | Active / total meshes | Materials | Render CPU ms |
| --- | --- | --- | --- | --- |
| Deck | 4,348 → 4,348 | 1,396 / 2,693 → 1,396 / 2,618 | 638 → 602 | 54.31 → 21.57 |
| TAB-Flight | 4,155 → 4,145 | 1,106 / 2,691 → 1,031 / 2,616 | 637 → 601 | 72.05 → 26.44 |

Remote population changed independently: 671 → 596 total remote meshes; Flight active remote meshes 150 → 75. Do not attribute those 75 meshes or the 10-call Flight reduction to R5. Timing reflects different sessions/focus/population and is **not a controlled speedup claim**. Current Update CPU samples are 0.17/0.18 ms, but R8 likewise lacks an isolated before/after timing comparison.

Isolation draw calls R1 → R8/R5: Deck scale2 4,348 → 4,348; Glow off 2,769 → 2,769; Shadows off 1,395 → 1,395; Lighting off 1,395 → 1,395. TAB-Flight scale2 3,083 → 3,078; Glow off 3,041 → 3,031; Shadows off 2,106 → 2,096; Lighting off 2,106 → 2,096. Scale restored before the sequential switches, and all switches restored afterward. Flight scale2 still changes planet LOD.

Evidence: `output/playwright/render-plan/R5/{deck,flight-tab}.json` / `.jpg` and each view's `-scale2`, `-glow-off`, `-shadows-off`, `-lighting-off` JSON/JPEGs; check/build logs alongside. R8 retains its unmeasured-at-commit record, with this combined-state follow-up. Seated Flight, close-up R1 emitter occlusion/independently hidden decks, and static freezing remain outstanding; no final completion claim for those items. Material count is still far above the under-80 target and needs subsequent work.


### 2026-09-10 — R4 placement instances and structural batches, implemented, unmeasured

Added a renderer-owned `instanceable-assets.json` opt-in manifest pinned to exact floor/cargo asset IDs and visual hashes. The content floor catalog participates in the construction blueprint hash, so adding flags there would change accepted construction identity. The presentation manifest avoids that conflict without changing content, simulation, authority or assets. `placement-instance.ts` permits only unchanged opaque, non-emitting, non-animated single-material sources without fixture-local lights. Installed and semantic authored loaders create ordinary instances with independent `metadata.partId`, semantic role and unchanged source material. Switchable/transparent/unsupported sources remain clones.

`static-material-batches.ts` preserves authored vertex channels, normals, tangents, winding, actual submaterial membership and transparent/decal separation. Cargo prototypes are batched once per asset; placement identities are bound on each instance or clone. `structural-batches.ts` merges compatible opaque hull/wall/roof material groups inside explicit deck, instance, visibility and receiver-light policies before lighting/glow capture their lists. Triangle ranges retain every placement UUID; roots remain separate and construction roofs retain their deck gate. Native doors and independently controlled fixtures stay outside the merge. No authored Blender surfaces or PBR materials are replaced. `object-presentation.ts` resolves picked triangle ranges; `selection-silhouette.ts` isolates instance and merged-placement selection masks without changing shared source material or index buffers.

NullEngine tests in `placement-instance.test.ts`, `structural-batches.test.ts`, and `static-material-batches.test.ts` cover independent identity/material/transform/selection, mirrored nonuniform geometry, UV/tangent preservation, mixed submaterials, ray-pick triangle boundaries, independently hidden decks and disposal. Real-loader `render-budget.test.ts` tightens semantic mesh bound **1,630 → 430**, retaining placement-map assertions and existing material/light bounds. Installed material bound remains 188. Full `VITEST_MAX_WORKERS=2 npm run check` and `npm run build` passed; logs are included. Validation covers the shared working tree, with unrelated construction/art/character changes excluded from this commit.

Partial hardware probe, ANGLE RTX 4080 Laptop GPU / D3D11, actual canvas 1574 × 907, MSAA4, Deck roof open and F3 visible:

| Counter | R5 Deck reference | R4 initial Deck probe |
| --- | --- | --- |
| Draw calls | 4,348 | 896 |
| Active / total meshes | 1,396 / 2,618 | 393 / 1,439 |
| Materials | 602 | 597 |
| Render CPU | 21.57 ms | Not accepted: preview throttled near 1 FPS |

Role totals fell cargo 372 → 34, hull 314 → 25, wall 423 → 47 and roof 179 → 7. Remote population stayed 596. Initial full-resolution screenshot shows intact authored ship surfaces and cutaway. A subsequent focused probe ran at 137.8 FPS / 6.50 ms Render CPU / 896 calls, but radius was 70.494 m and no matched timing capture completed. Camera movement then invalidated the attempted Deck/scale2 capture (radius 17.38 m, changed azimuth), and preview evaluation became intermittent/reloaded. Those files are explicitly named `exploratory-*`; they are not baseline acceptance or a timing speedup claim.

Evidence: `output/playwright/render-plan/R4/deck-initial.{json,jpg}`, `exploratory-*`, `measurement-status.json`, check/build logs. **After Flight and complete isolation sequences remain unmeasured.** Prior R5 isolation references are Deck 4,348 / 2,769 / 1,395 / 1,395; TAB-Flight 3,078 / 3,031 / 2,096 / 2,096 (scale2, Glow off, Shadows off, Lighting off). Seated Flight, hardware selected-instance/mapped-placement review and R1 close-up occlusion/deck acceptance remain outstanding. R4 is implemented, unmeasured for acceptance; continue R6 and retry the shared hardware browser.


### 2026-09-10 — R6 static transform cache, partial implementation, unmeasured

Added `static-transform-cache.ts` and integrated it into `construction-authored-assembly.ts` after the final R4 mesh list is assembled. The explicitly immutable authored placement adapter caches each mesh's matrix relative to the common ship parent. Idle frames do not recompute child matrices or world bounds; root movement recomposes cached matrices and refreshes bounds before scene rendering. Roof/deck enabled state and mesh visibility remain live, with original geometry, materials and placement identity unchanged. Disposal restores live matrices/bound synchronization. No simulation or authority changes. `doNotSyncBoundingInfo` applies only to these cache-owned static placements, including ordinary instances; animated actors and functional doors are outside this adapter.

NullEngine `static-transform-cache.test.ts` catches idle redundant work, moving/scaled/rotated parent hierarchies, world bounds, independent deck hiding, visibility and cleanup. Real loader tests still pass the R4 resource bounds (this item changes CPU work, not inventories). `VITEST_MAX_WORKERS=2 npm run check` passed 254 files / 1,496 tests and docs; `npm run build` passed. Existing large-chunk warnings remain.

Before: R4 partial Deck probe 896 calls / 393 active / 1,439 total / 597 materials, with no accepted timing or Flight baseline. After counters and both isolation sequences: **unmeasured**. The hardware preview reloaded and remained covered by “Preparing the first frame”; no ready controller was exposed for baseline captures. Evidence: `output/playwright/render-plan/R6/{check.log,build.log,measurement-status.json}`. No hardware or SwiftShader timing claim.

R6 remains **partial**, not complete. Static material freezing and whole-scene active-list freezing are still open: Babylon's frozen PBR path returns before checking changed defines, while F3/local-light eligibility and per-placement visibility remain dynamic. Flight also retains moving crew, remote contacts and planet LOD. A whole-scene frozen list without explicit admission/removal invalidation conflicts with those required semantics. Keep normal material/active-list updates and existing culling until their invalidation is implemented and measured. Bulk material dirty suppression likewise remains unapplied pending complete setup/error-path restoration coverage. The safe transform portion is committed separately; proceed to the independent R2 shadow correction and revisit the remaining R6 work.


### 2026-09-10 — R2 semantic shadow policy and bounded batches; legacy identity conflict

Re-verified `ship-lighting.ts` caster creation, spot membership cache and cabin transition lists. Added `shadow-policy.ts`: structural caster selection reads explicit role/structural metadata; retained GLB extras supply that policy at the import boundary, and `installed-hull.ts` supplies the published roof flag. Removed structural/marking name regexes from caster selection. `render-budget.test.ts` compares the new selector to the previous selector over actual installed GLBs to prove membership parity. Existing sun cabin filtering runs on the original source list before batching; new batch names never enter that compatibility selector.

Added `shadow-batches.ts`, one controller per shadow map. It batches only physical opaque proxies with **both stable part ID and explicit deck ID**, retaining role/deck boundaries and triangle ranges for every placement. Sources lacking that contract stay separate. Source transforms, geometry and parent visibility invalidate the existing shadow cache; Flight separately updates exterior batches when a parent deck is hidden/re-enabled while local spots remain paused. Material-independent shadow opacity still ignores the source's presentation cutaway fade. Source materials/geometry and local-light membership stay intact. Original source references remain available for subsequent cache and cabin transitions.

**Conflict:** the retained installed-hull placement adapter has stable `partId` but no explicit `deckId`; retained base meshes can lack placement IDs too. Merging those proxies would violate the owner's structural/deck/placement identity requirement. No synthetic authoritative deck IDs were invented, no content/simulation/authority fields were changed, and no legacy identity workaround was applied. That portion of R2 is stopped. The map-scoped helper is integrated for contract-complete inputs and covered by fixtures, but it does not claim a legacy production draw reduction. Current construction shadow geometry already consumes R4's deck-aware structural batches. Legacy proxy collapse remains open until its missing identity contract is supplied.

The known Lighting Off discrepancy is already fixed in committed `debug-features.ts`: the shadow gate also requires `scene.lightsEnabled`. The committed NullEngine regression invokes Babylon's real shadow-target scheduling stage and verifies zero submitted maps with Lighting Off while preserving allocated maps and independent Shadows intent. This R2 check re-ran it; unrelated pending F3/character changes were not included in this commit.

`shadow-batches.test.ts`, added integration coverage in `ship-lighting.test.ts`, and updated explicit shadow fixture roles in `ship-shadow-cache.test.ts` cover per-map membership, triangle identity, cutaway-independent occlusion, missing-deck fallback, independent Flight deck hiding and disposal. `VITEST_MAX_WORKERS=2 npm run check` passed 255 files / 1,498 tests and docs; `npm run build` passed. A final missing-deck regression assertion also passed its targeted test. Resource bounds remain at R4 levels because the blocked legacy sources remain separate; no reduced population is claimed.

Hardware after counters and both isolation sequences: **unmeasured**. The shared RTX preview reopened, but the normal client remained at “Preparing the first frame,” scene render ID 1, with no shader compilation errors. Newly changed crew face layers and first offscreen targets reported unready; character work was left untouched. No readiness gate was bypassed. Before reference remains R4's partial Deck probe: 896 calls / 393 active / 1,439 total / 597 materials; R6 and seated Flight lack accepted measurements. Evidence: `output/playwright/render-plan/R2/{check.log,build.log,browser-blocker.json}`. R2 is partial, not done; move to independent, owner-limited R7.


### 2026-09-10 — R7 out-of-range admission and scalar visual revisions, implemented, unmeasured

Changed only `environment/index.ts` admission/revision work and new `body-visibility.ts` / `body-visual-revision.ts` helpers. Bodies beyond the camera far plane or below a conservative subpixel envelope are disabled with `setEnabled(false)` and skip per-body rendering updates. A generous eight-radius envelope retains existing rings/halos/weather; far-plane intersection uses the actual view/projection plane, not radial distance that would wrongly reject off-axis bodies. Cached bodies retain geometry/materials and re-enable on re-entry; bodies never yet admitted are not constructed out of range. Normal mesh frustum culling and F3 planet/root gates remain intact.

Replaced both per-body JSON signatures with a numeric revision and a snapshot made only when visual inputs change. Primitive and nested recipe comparisons detect in-place edits, palette/effect changes, LOD and native-kit readiness while excluding replicated motion. No per-frame JSON serialization or recipe cloning. Original body positions and authority remain read-only. **No planet geometry, hidden-core sphere, materials, shaders, authored surfaces, weather shapes or appearance settings changed**; the owner's stricter R7 limit overrides the register's hidden-core suggestion.

NullEngine `body-visibility.test.ts` checks actual camera far-plane geometry, subpixel admission, unchanged enabled-state suppression and cached-resource reactivation. `body-visual-revision.test.ts` checks mutation/revision behavior and no repeated snapshot cloning. Full environment `runtime.test.ts` now verifies out-of-range disable/re-entry with identical mesh identities, in-place recipe rebuilding and unchanged authority coordinates. `VITEST_MAX_WORKERS=2 npm run check` passed 257 files / 1,501 tests and docs; `npm run build` passed. Ship-only `render-budget.test.ts` bounds remain unchanged because R7 changes body admission, not the ship-loader resource contract. Browser population reductions are not asserted without measurement.

Before reference: last partial hardware Deck probe in R4 was 896 calls / 393 active / 1,439 total / 597 materials; R6/R2 and seated Flight remain unmeasured. After Deck/Flight counters and both isolation sequences: **unmeasured**. Normal lab entry was retried after preview reload/sign-out. The visible, focused browser still did not advance its animation-frame callback (scene frame ID 1). One diagnostic-only render-loop invocation completed without exception and advanced scene passes to ID 7; subsequent normal frames still did not advance. Background/context-loss flags were false, and requestAnimationFrame was wrapped by the browser environment. The first-frame readiness cover remained. That manual diagnostic is not a timing or acceptance measurement, and no readiness check was bypassed. A request to resume the preview animation was sent to the owner while independent work continues.

Evidence: `output/playwright/render-plan/R7/{check.log,build.log,browser-blocker.json}`. R7 is implemented, unmeasured, not finally accepted. R3's capture diagnostics can proceed; its hardware default comparison and R10 snapshot acceptance still require the outstanding scene/hardware gates.


### 2026-09-10 — R3 actual capture diagnostics, hardware comparison unmeasured

Added `capture-diagnostics.ts`, sampled by `diagnostics.ts`, with F3 “Scene capture” and “Capture size / MSAA” rows in CanvasUI. The values come from allocated Babylon render-target wrappers, not requested settings. The helper reads the enabled scene-default prepass target when present, otherwise the first camera pass's shared/forced/own input target according to Babylon 9.25 activation order. Detached passes report no capture; unallocated targets report “Awaiting allocation.” No rendering settings, geometry, materials, or authority change.

Source correction: current `TAARenderingPipeline.samples = 8` counts accumulated temporal history samples; MSAA has a separate `msaaSamples` property. It is not evidence of eight-sample MSAA. The F3 row reports the actual wrapper sample count, including the scene prepass used for temporal reprojection. The existing MSAA4 preference/default remains unchanged; no unmeasured default selection.

NullEngine `capture-diagnostics.test.ts` exercises real postprocess allocations, requested versus actual samples, forced target dimensions, diagnostics sampling, disposal and enabled prepass precedence. Extended CanvasUI `diagnostics-roles.test.ts` verifies the actual target row while retaining role inventory scrolling. `VITEST_MAX_WORKERS=2 npm run check` passed 258 files / 1,503 tests and docs, then `npm run build` passed. Ship budget bounds remain unchanged because this item adds on-demand counters, not resources. Only the new diagnostic hunks are included from shared F3 files.

Hardware MSAA4 versus single-sample FXAA comparison, Deck/seated Flight counters and both isolation sequences: **unmeasured**. Existing `tab_b` remained stalled; a fresh `tab_c` at the same development URL also stopped at scene render ID 1 under “Preparing the first frame.” Both use wrapped browser animation-frame callbacks. Normal lab entry was used; no first-frame gate or authority state was bypassed. Fresh-tab replication strengthens the evidence that a ready hardware measurement is unavailable; it does not establish a renderer timing regression or its cause. Browser UI review of the new rows remains outstanding.

Evidence: `output/playwright/render-plan/R3/{check.log,build.log,browser-blocker.json}`. Before reference remains R4's partial Deck 896 calls / 393 active / 1,439 total / 597 materials, with no accepted timing comparison. R3 is not complete: hardware default choice awaits the measurement gate and remaining R6 qualification. R10 backend compatibility can be prepared without claiming snapshot acceptance.

### 2026-09-10 — R10 backend implementation; snapshot scheduling gate remains open

**Implemented, unmeasured (partial R10).** Graphics now persists an experimental WebGPU backend preference, shows the active backend and offers an explicit reload to apply it. WebGL remains the default. Unsupported/failed WebGPU initialization falls back to WebGL; a canvas already locked to a failed WebGPU context recovers on a fresh WebGL page without an automatic reload loop. Compiler JS/WASM comes from the pinned Babylon dependency and is bundled locally. F3 reports the active backend and the snapshot qualification gate. Existing WebGL flags, AA defaults and view semantics are unchanged.

WebGPU compatibility work preserves the dust StandardMaterial and implements the existing dust displacement in WGSL. Real GPU probes found and fixed three Babylon integration requirements: explicitly register the multiple-render-target extension for TAA; seed static previous-instance buffers before the first velocity draw; and include previous-instance attributes for the linear-velocity prepass (Babylon 9.25's WGSL declares them while its attribute helper only handles the other velocity define). A material plugin supplies only missing bindings, retaining authored PBR/Standard materials. Its scene-scoped creation observer admits late-loaded materials before compilation, with no per-frame material scan.

**Scheduling conflict retained, not bypassed:** R10 says snapshot activation follows R1–R6 qualification; R6 remains partial and required hardware gates are outstanding. `fast-snapshot.ts` and `snapshot-revision.ts` are tested scaffolding, deliberately not imported by the runtime. F3 says “Awaiting R6 qualification” under WebGPU. The scaffold tests stable admission, scene/camera/geometry/material/visibility changes, disposal and animated/TAA exclusions, but do not qualify full-scene replay, morphs, animated environments or temporal replay. Snapshot activation and CPU-halving acceptance are explicitly undone.

Files: renderer backend preference/factory/WebGPU initialization modules; `environment/dust-field.ts`; `temporal-instance-attributes.ts`; `antialiasing-pipeline.ts`; snapshot scaffolding; renderer `index.ts`/`diagnostics.ts`; Canvas UI renderer menu/graphics/index/diagnostics; client App callbacks. NullEngine tests cover engine fallback and scene ownership, static previous dust buffers and revision invalidation, retained PBR/Standard materials with complete temporal instance bindings (including late creation), snapshot invalidation/disposal. Canvas UI tests cover save versus explicit reload. The render-budget bounds stay at the R4 values because this item does not remove meshes/materials.

Validation: `npm run check` passes 262 files / 1,510 tests and document checks; `npm run build` passes. One intermediate full run hit the existing 20-second planet-terrain test timeout; a subsequent complete run passed without changes to that deferred work. The new late-material test also exposed asynchronous scene notification and was fixed with the synchronous material-created event before the final full pass.

Hardware evidence is **compatibility only**, not settled gameplay acceptance: a 320 × 240 isolated scene on the shared GPU preview rendered 560 thin dust instances with a 512 px glow layer through MSAA4, TAA and FXAA, with no GPU validation errors after the fixes. Frames were explicitly submitted for this bounded compatibility test; no timing is accepted and no manually submitted frame is presented as a normal-game measurement. Bone/rig temporal behavior and full installed-scene WebGPU appearance still require review.

| Required measurement | Before reference | R10 after |
| --- | --- | --- |
| Deck, 1574 × 907, F3/no selection | R4 partial count capture: 896 calls / 393 active / 1,439 total / 597 materials; no accepted timing | Unavailable |
| Seated Flight, same conditions | Owner baseline: 4,920 calls / 2,662 total / 636 materials / 26.96 ms CPU; not a matched current scene | Unavailable |

The normal preview remained at engine frame 0 / scene render ID 1, behind “Preparing the first frame”, despite a visible pane. Thus settled Deck/Flight, scale2 isolation, sequential Glow/Shadows/Lighting-off counters, and normal Graphics browser review remain undone. Snapshot attempts on both shared tabs failed; no screenshot was fabricated. Evidence is in `output/playwright/render-plan/R10/` (check/build logs, JSON compatibility probes and browser blocker). No hardware performance target or register completion is claimed. Deferred R9/R11–R14 and paused planet visuals remain untouched.

### 2026-09-10 — R6 follow-up: conservative static sphere culling, implemented, unmeasured

The authored construction loader already passes its final role-tagged, identity-preserving mesh set to `cacheStaticTransforms` (`construction-authored-assembly.ts:193–194`, reverified before editing). That cache now applies `CULLINGSTRATEGY_BOUNDINGSPHERE_ONLY`, retains each mesh's previous strategy and restores it on disposal. Moving-root refresh still updates both world sphere and box bounds; the box remains available for picking. No source geometry, placement/deck identity, material or authority data changes.

Files: `static-transform-cache.ts` and its NullEngine test. Added a frustum test with an elongated hull and translated/rotated root: every standard-culling admission remains admitted, fully distant meshes are rejected, sphere-only admission never invokes the box-frustum test, world box centers stay correct, and disposal restores the original strategy. `npm run check` passes 262 files / 1,511 tests; `npm run build` passes. Budget bounds remain unchanged because no meshes/materials were removed. Sphere-only admission is conservative and may increase edge-of-frustum draws; this is an implementation, not a measured performance win.

Post-build hardware attempt on the visible shared preview again reports engine frame 0 / scene render ID 1 with “Preparing the first frame”. Snapshot capture failed. Required settled Deck/seated Flight, scale2 and Glow/Shadows/Lighting isolation captures remain unavailable. Before reference remains the partial R4 Deck 896 calls / 393 active / 1,439 total / 597 materials, without accepted timing; no after counters are claimed. Evidence: `output/playwright/render-plan/R6/culling/`. R6 remains partial and unmeasured: bulk dirty suppression and Flight active-set qualification are still open, along with R5's material freeze/invalidation work. R10 snapshot activation remains gated.

### 2026-09-10 — R6 follow-up: synchronous bulk material setup, implemented, unmeasured

`construction-authored-assembly.ts` previously interleaved network/GLB awaits with placement creation (reverified before editing). Holding `scene.blockMaterialDirtyMechanism` over that loop would suppress dirty propagation for an already-running scene during network waits. The loader now validates and loads its libraries first, then creates placements, structural batches and static caches in one synchronous `withMaterialSetup` block. A `finally` restores the caller's previous flag, including nested blocks and exceptions; Babylon flushes dirty state once on outer release. IDs, roles, authored surfaces, materials and returned view behavior remain the same.

Files: `material-setup.ts` and its NullEngine test, plus loader and loader-test changes. The helper test verifies coalesced dirty propagation and failure/nesting restoration. The real 211-placement / 28-library test verifies suppression during creation, normal tracking at every asset request and restoration at return, alongside existing placement/roof/material/disposal checks. `npm run check` passes 263 files / 1,512 tests; `npm run build` passes. Mesh/material budget bounds remain unchanged; no per-frame performance gain is claimed from a setup-only change.

Post-build shared GPU preview attempt still reports frame 0 / scene ID 1 behind “Preparing the first frame”; screenshot capture fails. Settled Deck/seated Flight and both isolation sequences remain unavailable. Before reference remains partial R4 Deck 896 calls / 393 active / 1,439 total / 597 materials with no accepted timing; after counters are unavailable. Evidence: `output/playwright/render-plan/R6/bulk/`. R6 remains partial/unmeasured pending Flight active-set qualification and hardware acceptance; R5's material-freeze/invalidation work remains open. Unrelated scene-material registration changes in the shared loader/test were excluded from this commit.
