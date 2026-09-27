# F3 Deck versus Flight residual-cost audit

Status: CPU/source audit, 2026-09-09. No new hardware benchmark and no production changes. The owner's reported approximately95 versus170 FPS remains unexplained by a measured GPU breakdown.

## What the six switches leave running

`packages/render/src/debug-features.ts` sets `scene.lightsEnabled` and `scene.shadowsEnabled`, suppresses equipment/character nodes and effect layers; the environment separately suppresses planets. It does not replace materials with flat shaders or disable textures, IBL, the sky, dust, room signs, floor/partitions, CanvasUI or selected-object outlining.

Babylon9.25 local source confirms direct lighting and IBL are independent: `Materials/materialHelper.functions.js:639` prepares direct light defines only when scene lights are enabled; `:723` prepares IBL when a reflection texture exists. `Materials/PBR/pbrBaseMaterial.pure.js:1273` prepares IBL separately, and `:1834` resolves the scene environment texture. The renderer retains its128px HDR and environmentIntensity.28. Normal/ORM sampling, material clearcoat, alpha blending and emissive output remain. Setting environment intensity to zero alone is not a reliable shader-cost isolation because reflection defines/sampling can remain compiled.

Deck/Flight is not a matched-camera comparison: `index.ts` changes camera elevation from fixedRPG.955 radians toFlight.015, target and zoom. `cabin-visibility.ts` disables deck/room/partition meshes only after Flight settles. Thus visible pixel coverage, occlusion and expensive material coverage differ even if aggregate triangles/draw calls are similar. Settled legacy cutaway walls are correctly clamped opaque or disabled (`cutaway.ts`); persistent alpha blending of every retained wall is no longer the default. Authored glass and room-sign alpha remain.

A selected object retains `object-selection-mask`, a full-resolution target, plus a full-screen postprocess independently of all six switches. `selection-silhouette.ts` uses37 neighboring mask samples plus center and scene-color reads per output pixel. Deselecting detaches the postprocess and active target. This is an evidenced additional pass when selected, not proof it caused the historical timing gap. Sky/dust likewise remain; dust layout changes between Deck and Flight and updates its instance buffer and bounds each frame.

## Current counters and limitations

The GPU timer is already implemented, capability-gated by `timerQuery`. Babylon `Engines/Extensions/engine.query.pure.js:167` captures actual engine begin/end frames and accepts only available, non-disjoint query results. Manually calling `scene.render()` does not bracket this timer, so standalone manual SwiftShader captures must not be used as hardware GPU timing evidence.

Frame CPU covers renderer update plus scene submission; Render CPU covers scene instrumentation. Their smoothing windows differ and CPU samples are recorded after the scene's completed-frame observer, so displayed CPU values need not sum exactly. FPS/frame interval includes browser scheduling/presentation, not simply CPU plus GPU arithmetic. Hardware timer absence must remain explicitly unavailable.

`shadowMaps` is an enabled-light generator count when both `scene.shadowsEnabled` and `scene.lightsEnabled`, not a count of shadow maps actually refreshed. Root corrected the missing lighting gate and added a regression using an actual DirectionalLight/ShadowGenerator: Lighting off reports zero eligible maps while retaining the allocated count. Cached maps can remain eligible but not render. Allocated maps/materials/textures are resource inventories, not work totals. `transparentMeshes` counts parent materials and can undercount mixed MultiMaterial submeshes. Draw calls include render-target passes; triangle count does not measure fragment work.

## Smallest useful next patch and experiment

1. On-demand F3 rows now expose attached camera postprocess count/names, custom render-target count, scene IBL texture presence and current camera radius/elevation. These are attached/resource state, not proof that a pass executed. The eligible/allocated shadow distinction is also corrected; a render-map refresh counter, if added, should observe actual shadow-map renders rather than infer work from allocation.
2. Use the existing hardware GPU timer on the user's real browser; show capability/sample availability explicitly. Compare settled frames with no selection and identical viewport. Record Frame CPU, Update CPU, Render CPU and GPU together; no SwiftShader FPS claim.
3. For diagnosis only, freeze one camera while toggling cabin visibility, then repeat at half linear render resolution. A strong GPU reduction with pixel count would support fragment/fill/bandwidth pressure, not identify which shader by itself.
4. If needed, isolate IBL with a reversible null scene environment texture (and any explicit material reflection textures), warming changed shaders before measurement; keep lighting/authority unchanged. A separate flat-material override can isolate full PBR cost while retaining geometry and alpha/occlusion semantics. Restore exact prior values after each probe. Do not silently redefine the current Lighting switch or publish a flat-material workaround.

No source evidence justifies assigning the full5ms difference to lights, shadows, transparent walls, selection or IBL individually. Current native hull batching and other intervening fixes also mean the older screenshot is not a benchmark of this exact build.

Actual normal-client review passed for the new rows. Real wheel scrolling exposed all five added rows; Lighting off reported0 lit lights/0 eligible maps while the scene IBL texture remained present and9 shadow maps remained allocated. TAB changed camera distance/elevation from47.8m/35.5° to210.8m/87.7° without changing the actor UUID or coordinates. The screenshot `output/playwright/f3-final-ibl-camera-lighting-off.png` shows the half-second cached UI sample during that transition (207.1m/86.5°). This is UI/state verification, not hardware timing evidence; GPU timing was unavailable in this browser. Lighting, Deck and closed F3 were restored afterwards. Optional selected-object pass-count transition was not exercised in this bounded review.
