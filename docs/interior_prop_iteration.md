# Interior prop iteration — 2026-09-08

Status: hydroponic vertical slice implemented, six source/sample iterations inspected with CPU renders. Integrated Babylon and dashboard acceptance remains with the lead's GPU session. This is a visual/content slice; no collider, live damage or refit authority changed.

The owner's current green-cross thumbnail and both hydroponic target crops were inspected, alongside `reference/art/internal-components-2.png` and `modular-spaceship-design-2.png`. The selected features are three visibly separate potted plants with varied heights and pointed leaves, a pale framed planter with dark service recesses, warm grow bar on two uprights, and a small feed vessel, pipe and inset control. The previous hydroponic part had three identical green cross blocks and no supporting grow/feed equipment.

`assets/source/interior_hydroponics.blend` is an original editable, deterministic Blender source from `scripts/build_interior_prop_source.py`. All parts are closed solids with explicit material IDs. The actual solid sampler produces 2,351 occupied 0.0625 m cells per tray. The sampler rejects vanished thin details; pipe diameter, controller position and service-inset placement were corrected onto sample centers in response. The final bounds are exactly 1.5 × 0.625 m, with local height 1.75 m. Existing three placed tray IDs, origins and planar collider footprints remain unchanged. Assembly reuse still separates asset IDs from placement IDs.

## Inspected iterations

| Iteration | Actual finding and resulting decision |
| --- | --- |
| 1 | Source gained separate pots, grow frame/feed controls and lance-shaped leaves. 2,269 samples / 3,412 evaluated triangles. Coarse sampled leaves remained twiggy and block-shaped. |
| 2 | Broadened and thickened leaves, added diagonal shoots, varied clusters and service recesses. 2,415 samples / 3,946 evaluated triangles. Better canopy mass, but source's pointed leaves were still lost. |
| 3 | Foliage-only short-edge bevels: 6,606 triangles. Extra edge cost did not recover the source silhouette convincingly. |
| 4 | Tested 0.03125 m sampling: 17,747 cells / 24,496 triangles. It introduced small staircase noise at much higher cost; rejected for this prop. Ship matter pitch stays unchanged. |
| 5 | Bounded foliage-only mesh relaxation: 4,424 triangles. The resulting rounded lobes looked gummy compared with the target's pointed leaves; rejected. |
| 6, selected | Retained the authored evaluated Blender leaf/stem surface over the immutable 0.0625 m occupied samples. Planter/frame/pots/feed remain welded sampled geometry with actual manufactured bevels. This is the closest inspected source match at a bounded 4,834 triangles per integrated tray. |

Close and game-scale comparison files for every iteration are `output/playwright/hydroponics-iteration-N-close.png` and `hydroponics-iteration-N-game-scale.png`. Iteration 6 explicitly labels the final comparison **SAMPLED + AUTHORED LEAVES**. It does not claim that continuous leaf contours came from the coarse greedy voxel surface. The selected image shows the original botanical silhouette preserved with the sampled planter/frame. Some small service insets and pot rounding still simplify at the matter pitch; the full reference's additional planting and wall equipment are outside this bounded tray slice.

## Representation and topology

`voxel-wayfarer-props.ts` stamps actual matter without changing source samples. It builds a separate manufactured meshing volume with botanical matter omitted, then closes that volume normally before attaching the authored botanical surface. Dropping leaf faces directly was rejected because it left open pot wells. The final topology gate detects no newly opened edges. Each integrated tray has four existing edge-touch nonmanifold edges before and after bevel, which remain excluded from bevel inputs.

The botanical surface is explicitly recorded in source JSON and GLB extras, with the same palette material identities. It is presentation; occupied samples remain the editor's immutable overlap/damage representation. Local voxel damage previews continue to remesh the sampled matter and therefore simplify authored botanical contours. A damage-aware regeneration of the authored leaf surface is not implemented. Other furniture remains the prior procedural/Blender-exported surface iteration; this pass does not claim a full source-fidelity migration of beds, lockers, crates, lounge or consoles.

The ship now evaluates to 295,738 triangles, 126 material primitives and 40 semantic layers, within the existing 325,000-triangle visual gate. These are geometry measurements, not a frame-rate claim. The three trays share one authored definition and maintain independent placement identities.

## Grow emitter anchors

Source/world-local axes are X across ship, Y along ship, Z up. Each tray source origin is snapped to the existing matter grid: X −3.6875 m, Y −2.375 / −1.5 / −0.625 m, Z 0.25 m. The warm grow diffuser center is local `(0, 0.09375, 1.53125)` m and points down. Therefore world-local light centers are X −3.6875 m, Y −2.28125 / −1.40625 / −0.53125 m, height 1.78125 m. The control display uses the existing blue emitter role and does not need a separate scene light.

## Reproduction and validation

Canonical `npm run art:voxels` and `npm run art:assembly` run the authored source recipe and use its samples in both ship and modular assets. They do not copy public assets. `npm run art:check` now verifies source/tool hashes, unique samples, exact footprint, botanical role preservation and all three tray nodes. `npm run check` passed 70 tests during integration, including the default assembly's occupied-overlap regression. Full build/public copy is deliberately coordinated with the lead so it cannot disturb active GPU diagnosis.

CPU comparison: run the source recipe with revision 6, copy its staged samples to `.runtime/art/interior-hydroponics-samples.json`, run `tsx scripts/mesh_interior_prop_review.ts`, then Blender's `scripts/render_interior_prop_comparison.py -- 6`. This writes review images only; it does not operate on the live database or publish the preview.

Final CPU integration gates passed again after canonical export: `npm run check` (70 tests) and `npm run art:check`. Canonical ship/assembly GLBs contain explicit authored-botanical presentation metadata. No public copy or full build was run during the lead's GPU review window.
