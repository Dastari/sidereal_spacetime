# Independent Astra — fresh desert baseline

Date: 2026-09-14. Reviewer: `/root/planet_visual_reviewer`.

Viewed `output/playwright/planet-reference-20260914/desert-baseline.png` and the exact `assets/art-library/assets/planets--desert-world/revisions/r000/reference.png` individually.

Capture provenance supplied by root: isolated actual `createSpaceEnvironment`, Babylon WebGL2, current desert recipe seed38, HDR intensity0.28, sun2.1/fill0.2, camera radius4.7/FOV0.52; SwiftShader; naturally advanced138frames before loop stopped for still capture. This is a fresh runtime appearance baseline, not hardware timing or live-game acceptance.

## Findings

The fresh baseline confirms the historical macro-hierarchy problem. The globe is covered in small overlapping rectangular plates with slight elevation differences; most protrusions blend into the general surface tessellation. There are no unmistakable monumental mesa groups or deep coherent canyons at the scale shown by the reference.

The reference has large pale peach/cream quiet surface regions cut by rust-red and burgundy vertical cliffs. A tall grouped mesa cluster on the upper-right hemisphere establishes a focal hierarchy, with smaller groups around the lower-left and middle. The baseline uses related earth tones but distributes them as a muted brown/orange/tan mosaic. It lacks clear material roles tied to sand basin versus vertical sandstone versus deep shadow.

The baseline's visible dark lines largely look like shallow tile seams or thin radial divisions. The reference's dark burgundy cavities are larger and spatially coherent, allowing plateau heights to read immediately. The baseline's atmosphere is a broad dim brown halo; the reference has a bright warm sun-facing limb with stronger cool/purple shadow contrast. Geometry and material hierarchy should be corrected before chasing this exposure/rim difference.

## Candidate gate

1. Broad connected pale sand/basin surfaces must become visibly quieter than the current tiling.
2. At least one primary mesa cluster and several secondary clusters must dominate the silhouette and cast readable shadows; they must not become evenly spaced spikes.
3. Vertical rust/burgundy rock faces and deep canyon regions must separate from cream/peach horizontal sand.
4. A second camera angle and a smaller gameplay-size image must retain those identities.
5. Compare actual complete planet composition, not isolated kit geometry. A new kit render alone cannot establish this gate.

The baseline is recorded as **reference gap open**. No working pass or owner approval is conferred. LOD and real-hardware transition gates remain separate.
