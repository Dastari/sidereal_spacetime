# Independent Astra — r004 and fresh family baselines

Date: 2026-09-14. Reviewer: `/root/planet_visual_reviewer`.

Individually viewed `desert-r004/planet-seed38.png`, `rock-baseline.png`, `ocean-baseline.png`, and `toxic-baseline.png` under `output/playwright/planet-reference-20260914/`. Exact main-world reference crops were individually viewed earlier in this same review session. These are still-image visual findings, not hardware performance acceptance.

## Desert r004

**Fail.** Broad triangular wedge surfaces visibly cross the intended regional forms, notably upper-left and lower-right. Root identifies sparse long planar cap triangles becoming chords during spherical deformation. The image is consistent with that cause; preserving authored planar surfaces while tessellating them before spherical mapping is the appropriate correction to test. Do not hide the problem with extra scatter or brightness.

There is still excessive bare substrate in the reviewed hemisphere, but fix the mapping defect before judging the final visible coverage of regional shelves. The new connected region is conceptually useful; its current distorted actual render does not pass.

## Rocky fresh baseline

The current image confirms a tiled grey/lilac crust with shallow block-like depressions and isolated low protrusions. The reference's defining deep craters, circular/irregular rims, major collapsed shelves and sparse warm seam are missing at planetary scale.

Priority: compose a few large dark crater bowls with thick broken rims and connected fractured shelves. Ensure the dark interiors read as geometric depth, not painted spots. Add the sparse warm mineral seam only after that structure works; it must not turn into volcanic lava coverage. Preserve large crater openings across LOD levels. Native kit presence alone cannot establish this.

## Ocean fresh baseline

The current hemisphere already contains substantial open water, so the historical claim of excessive land is not the only or strongest issue in this exact fresh view. It has a long connected central green island strip and a mostly continuous land rim, with water that reads as a dark tiled blue surface. There is little clear cyan shelf/shallow-water hierarchy and only narrow pale coast edges.

Priority: break the central strip into several separated steep islands, retain mostly uninterrupted ocean, and establish cobalt deep water through blue shelves to cyan/turquoise shallows and pale beaches. Give islands clear tall cliffs and localized clustered canopies. The reference's island silhouette, beach/water contrast and moist bright cloud bands are defining cues.

Current clouds are segmented rows of repeated white bead/block forms, and foliage is predominantly squat repeated cube-like crowns. After land/water hierarchy improves, author varied grouped canopy and cloud masses with quieter gaps. Do not compensate for flat water by raising a uniform cyan halo; surface optical/depth response and atmosphere are separate.

## Toxic fresh baseline

The current image has clear lime/dark color contrast, but nearly everything is formed from similarly scaled tiled protrusions. Bright regions appear as raised solid plates instead of chemicals collecting in low basins. Dark formations lack a few dominant tall chimney clusters. Green cloud puffs look like bead/voxel bundles rather than irregular fog obscuring the limb.

Priority: create connected low acid basins/fissures beneath fewer, taller dark chimney and cliff groups. Establish dark cavity/contact shadows, then bounded green proximity response at their feet. Localized irregular gas banks should obscure portions of silhouette while leaving quiet gaps; a global smooth halo and brighter solid puffs do not establish fog.

## Acceptance distinction

These fresh baselines replace uncertainty about historical screenshots for these specific views only. No family receives new working acceptance. Actual complete candidates need repeatable camera/reference comparisons, second-angle and gameplay-scale review, and separate approach/retreat/Map→Observe transition evidence under the LOD contract.
