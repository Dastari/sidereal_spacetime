# Six solid moon variants — independent review, 2026-09-14

Individually opened each exact `assets/art-library/assets/planets--<variant>/revisions/r000/reference.png`, and all three corrected-seed38 images for each correspondingly named r001 candidate under this evidence directory: two close angles and actual reference-scale view. Eighteen actual images and six exact crops inspected. Small crop dimensions limit conclusions about fine or hidden detail. These are scoped SwiftShader appearance judgments, not hardware/LOD, all-seed or owner approval.

| Exact variant / candidate r001 | Working decision | Specific finding and remaining gap |
| --- | --- | --- |
| rocky-moon-2 | Pass | Cool pale/lilac pitted broken crust and dark hero recesses read at small scale. It preserves this crop's solid battered identity. Larger plates and weaker directional pale-edge contrast are refinements. |
| desert-moon-1 | Pass | Pale warm/pinkish stone and dark crater interiors distinguish the small solid body from the cool rocky variants and from the desert main world's mesas. The crop has stronger warm lower-side lighting and finer pitting; these remain refinements, not a new morphology requirement. |
| desert-moon-2 | Pass | Rust/terracotta pitted body with unequal recessed craters clearly covers the red desert-moon variant. Current color is more muted/brown and the reference has brighter orange/pink highlights. Preserve intended source color and evaluate contextual lighting before any further finish; no geometry restart needed. |
| gas-giant-moon-1 | Morphology subpass; full gate open | The solid pitted moon is correct, but the exact crop has conspicuous saturated violet/magenta highlights. Current actual is a muted grey-lilac body and loses this distinct optical appearance. Resolve material/lighting context before acceptance. |
| gas-giant-moon-2 | Pass | The subdued pale-lilac solid cratered variant reads appropriately at small scale. Reference is smoother/finer in places and has stronger directional lighting, but meaningful identity gap is closed. |
| gas-giant-moon-3 | Morphology subpass; full gate open | Large craters and fractured solid crust cover the shape, but the crop's prominent violet/magenta areas and localized warm pink/orange highlight are absent in the muted actual. Optical differentiation from moon2 remains unresolved. |

For gas moons 1 and 3, keep the successful geometry fixed. First use a bounded parent-context purple-light/material-parity diagnostic. The tiny crops alone cannot establish whether their bright magenta is intrinsic material, illumination from the surrounding scene, or both. Do not blindly bake a one-sided highlight into albedo or introduce emission simply to force one screenshot. Once contextual response is shown, judge whether the intended native material needs a bounded authored variation.

These are individual decisions; passing one named moon does not cover other moon crops or future seeds. Preserve explicit variant recipes, immutable authored source/material provenance and retained LOD identity. No gas sphere/rings morphology is justified for these solid moons.
