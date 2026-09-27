# Independent visual review — 2026-09-14

Reviewed each family's exact r000 reference crop and all three new actual captures: `corrected-seed38.png`, `corrected-seed38-angle2.png`, and `corrected-seed38-reference-scale.png`, under rocky-r008, volcanic-r020, and ice-r020. Parent reports a populated shadow list, diagnostic normal bias .006, and Volcanic glow enabled. These images supersede the earlier empty-shadow-list evidence for their own revisions. SwiftShader images establish visible appearance only. No hardware, transition, all-seed, moon, publication, or owner approval is claimed.

## Rocky r008: working visual gate remains open

The large bowls are genuinely recessed and now sit among some broken plates. However, at the same approximate body size as the reference, most of the face still reads as a smooth dark lavender ball carrying a few oversized crater rings and plates. The reference's distinguishing structure is cratered, battered crust at several scales, interrupted by a sparse but legible warm mineral fault. Both medium pits and that fault are effectively absent here. The more closely viewed texture is mottling; it does not substitute for the missing medium relief.

Next bounded revision: preserve the successful large bowls, add one authored intermediate crust field with several unequal embedded medium pits and chipped shelf edges, and compose it across the largest blank frontal regions. Preserve some quiet regolith. Make one interrupted warm mineral fault readable as a geological exposure, without turning every seam into lava. Parent has identified a color encoding issue: correct that before material tuning, then assess the intended pale rock versus dark recess separation under the same lighting. Brighter encoding alone cannot supply the missing relief.

## Volcanic r020: working visual gate remains open

Connected crust is an improvement over r019's isolated patches. The new result nevertheless collapses into huge almost black polygonal plateaus around a broad, nearly flat orange Y-shaped channel. Its cream hot marks read as detached rectangular bars. At reference scale, the main visual story is one large orange mark on a dark ball; the reference instead has a connected finer molten fault system among readable, irregular basalt cliffs and vents.

Next bounded revision: retain connected regions but break their largest tabletop surfaces with authored medium basalt buttresses, selected chips, and a fine PBR fracture finish. Refine the principal lava bed into an uneven narrower branching route with cooled dark margins, red/orange transitions, and irregular bright cores integrated along the route. Keep a few wider vent or pool locations, rather than a uniformly narrow wire or broad flat fill. Check the known color encoding issue first; do not compensate by arbitrary albedo brightening. Local warmth along nearby rock would help optical integration after correct source materials are visible. Small controlled smoke groups remain part of the complete family check, not a substitute for geological structure.

## Ice r020: working visual gate remains open

The deep open cut and shaft volumes survive actual shadows. Circular unit repetition is reduced somewhat by the long cut, but immense smooth white plates still dominate the planet. A few large round snow washers and scattered blue posts account for most of the detail. The reference's snow is a broken, stepped mantle with medium cavities and clustered exposed blue cliff shafts; its interesting structure persists across the face rather than mostly at the limb. At reference scale the current central cut becomes a black slash through a comparatively smooth white shell.

Next bounded revision: keep the existing deep cut and thick bank volumes. Author a smaller stepped snow-and-ice relief field that subdivides the edges and parts of those large flat banks with unequal ledges, recesses, and compact blue shaft clusters. Place clusters along selected exposed cut walls and medium cavities, not merely as freestanding peripheral posts. Add one or two smaller irregular cavities between the hero pits. Reduce the visual dominance of circular washer rims through partial broken banks and unequal snow cornices. Surface powder/ice PBR finish is useful only after this medium hierarchy reads at roughly 300px body size. Do not revert to thin white cards or reopen the already resolved unit-volume problem.

## Shared next acceptance check

These are structural blockers visible at reference scale, not demands for pixel matching. Reuse the corrected capture setup and supply the same two angles plus reference-scale view after the bounded source changes. Keep the shadow bias and source color correction explicit in evidence. LOD must retain these larger silhouettes and material identities; detail may simplify at distance, but a new texture or extra population must not bypass worker/build-ahead/shared-material/retained-node requirements.
