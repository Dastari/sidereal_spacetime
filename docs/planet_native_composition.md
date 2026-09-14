# Native planet kit composition proposal

Status: proposed after two failed ice blockouts; no replacement published.
Owner request: procedural worlds with controllable seeded composition, using the
new Blender visual-source pipeline. Whole-globe GLBs alone do not satisfy this.

The first ice studies tested macro hierarchy in editable Blender. r001 exposed too
much smooth core and detached plates; r002 made the crust coherent but replaced the
problem with a uniform staircase and excessive bevel cost. Preserve both failures.

The next proposed source kit contains quiet snow crust, deep shaft/crater, stepped
ravine, ravine bend and a connected blue-column wall. Each piece is a native Blender
mesh with named snow/ice/deep-cavity material regions and deliberate bevels. Matching
edge geometry allows patches to meet without cracks. Broad quiet regions must
surround a few connected hero cuts; small details cannot drive the composition.

Runtime TypeScript may select, rotate and deform these authored surface patches onto
a spherical domain using a seed and bounded macro rules. It must preserve authored
surface topology/materials, merge by role and retain geometry identity separately
from authority. No legacy voxel sampling is the default visual export. Recipe
parameters control broad crust coverage, canyon count/depth, formation clustering
and palette within validated limits. Mixed volcanic regions remain composable.

Review requires at least three visibly distinct seeds using the same kit, repeated
seed determinism, finite geometry and shared-edge checks, measured triangles/draws,
and actual Babylon PNGs against the exact ice crop. Target initial close-LOD budget
is below 150,000 triangles and 12 opaque material batches, one existing hero shadow
map, and no per-column lights. These are proposed limits, not achieved metrics.

First prove one coherent ice world. Root reviews every meaningful rendered
iteration and records remaining gaps. Owner approval of the exact revision and
publication remains distinct. Existing accepted worlds stay live until that step.

## Current isolated implementation checkpoint

The runtime compositor now exists in
`packages/render/src/environment/native-planet-composition.ts`. It reads native
Blender patch geometry, chooses seeded variants/rotations, maps their authored
surfaces onto a cube-sphere domain and merges five material roles. The connected
kit adds explicitly paired edge ports and seeded paths across neighboring patches.
Tests cover repeatability, distinct seeds, shared cube-face corners, reciprocal
edge topology, matching port connectivity and invalid authored input rejection.

This is not imported by the live environment. r004 compositions (~45.7k triangles)
were rejected as isolated square windows on a snowball. r005 (~46.5k triangles)
connects ravines but still leaves one seed's front too empty and keeps excessive
smooth regular crust. Both seeds' actual Blender PNGs and native sources are
preserved. Root explicitly rejected spending a browser capture on the already-wrong
r004 composition; real Babylon comparison remains a required subsequent gate.
A prepared isolated viewer is `scripts/art_library/native_planet_browser_review.ts`.

Next proposed correction is bounded, deterministic layout scoring over multiple
view directions, broader shared opening profiles, and authored medium white shelves
and blue outcrops. This is proposed after r005, not implemented or accepted.

### Draft audit output

The composition review script now writes a separate `composed-SEED-audit.json`
with actual triangle/batch counts, radius bounds and quantiles, material surface
areas, and the 26-direction macro-patch distribution. A non-rendering regression
run used a copied r005 kit in `.runtime/art-library/planets/ice-audit-check`, leaving
preserved r005 sources and images intact: seeds 131/9187 produced 49,362/49,010
triangles and five batches. Snow represents about 46%/47% of geometric surface
area, despite the previously rejected images reading as mostly white. This is
concrete evidence that area counts cannot replace actual image comparison:
occluded cavity walls contribute to these totals, and vertex radius quantiles
are weighted by tessellation. r006 must still pass two actual rendered seed
comparisons; no visual acceptance follows from these diagnostics.
