# Boundary r002 additive door gasket handoff

Working geometric contact candidate. This revision deliberately stages the door/gasket subfamily first; diagonal enclosure families are not included. Original r001 artifacts and revision history remain intact. No shared catalog, renderer, authority, service, browser or publication changes were made.

## Exact delivery and dependencies

| Artifact | SHA-256 |
| --- | --- |
| Additive `kit.glb` | `c65a2c6273e8773956e555ea26879b8b4d0d58d483e42eef94b55c8052e75092` |
| Editable `boundary-kit.blend` | `4aae7f00f96c5837d009ddd8760dc523998033a4817e4e25cfb2c08d90b64f8e` |
| `interfaces.json` | `2e9f23466bc82b8b52f242eac92ae2f857deaab2ef8db73db71e67934ca59209` |
| Required unchanged r001 GLB | `4c631ad5517bf6d6cc88af29aba4a6890808c33effeed4205acb26a022758426` |
| Required unchanged r001 interfaces | `33347b32b1675fee00d36046a05de37013fa32eca6e2a4d671464da3499972d9` |

The r002 GLB contains **only two additive meshes**, not a replacement export of the eight r001 components:

- `GEO-door-perimeter-seal--surface`: 32 triangles, one elastomer material, one retained `SealRetracted` morph target.
- `GEO-door-frame-seal-seat--surface`: 36 triangles, one metal contact-seat material, fixed to the frame.

The editable Blender source includes the untouched native r001 doorway for context and the separately authored additive collection. It is not a TypeScript voxel re-export. The source's initial viewport exposes the doorway, gasket and seats. Original r001 mesh source, rigid leaf dimensions, hinge transform and old export bytes remain unchanged. Source and references stay private; only explicitly selected candidate exports should enter the later integration process.

## Geometric design

The leaf-mounted gasket sits **outside the front face** of the rigid leaf. It bridges the 2 mm rigid fit gaps onto added fixed frame seats, rather than filling them with an oversized rigid slab. Its bottom lip contacts the declared nominal floor plane. Retracting folds its outer contour inward while moving the front envelope farther outward, into an explicitly reserved and accessible space. It never sinks into the unchanged solid leaf or an imaginary pocket.

Metres in module-local Blender coordinates:

- Full clear aperture: X `.375..1.625`, Z `.1875..2.4375`, still **1.25 × 2.25 m**.
- Existing rigid leaf: **1.246 × .0625 × 2.246 m**.
- Floor top remains 6 lattice units / `.1875 m`; ceiling/wall top remains 96 / `3 m`.
- Gasket bind remains Blender `[.3125,-.0625,0]`, glTF `[.3125,0,.0625]`, exactly matching the rigid leaf bind. Preserve it once; do not add hinge socket height again.
- Deployed outer gasket contour: X `.365..1.635`, Z `.1875..2.4475`; body Y `-.0715..-.0625`.
- Retracted outer contour: X `.381..1.619`, Z `.1955..2.4295`; body Y `-.0845..-.0625`.
- The inner contour stays X `.39..1.61`, Z `.2135..2.4215`.

Three fixed U-shaped rails sit outside the aperture and present contact faces at Y `-.0625`. Their mounting bodies intentionally overlap the original frame backing to attach them; this is separate from the validated absence of **moving gasket** penetration. There is no fixed threshold reducing floor clearance. Bottom sealing instead requires the supplied floor surface at exactly `.1875 m` over the declared contact patch. This study checks an ideal flat floor plane; it does not verify the installed r002 floor GLB, its bevels or tile seams under that patch. Integration must verify actual native contact coverage or provide a compatible threshold interface before claiming a closed seal.

The fixed frame contact patches have nominal areas `.0226 m²` left, `.0226 m²` right and `.0125 m²` top. The floor patch is `.01143 m²`. The exact union of gasket-to-rigid-leaf front contact rectangles is approximately `.1071559424 m²`, with overlaps counted once. Patch polygons, normals/planes and source box coordinates are explicit in the interface/validation records. These are nominal zero-gap contacts; no manufacturing tolerance, contact force, compression-pressure law or pressure rating is certified.

## Required animation/authority integration

`SealRetracted` is exported by name and index 0, with range 0..1:

- **0**: deployed contact contour; legal only with the hinge fully closed.
- **1**: retracted contour; required throughout hinge motion.

The source/export default is 0 for the contact study. Runtime initialization must set the accepted seal state before displaying the assembly; an unknown state must not imply a sealed door. Keep fixed seats on the frame. The gasket and rigid leaf must share the same final physical hinge pose and bind compensation.

Required sequence:

1. Hold hinge at 0° while retracting the seal to weight 1.
2. Hold seal at 1 while turning the hinge from 0° to −90°.
3. For closing, hold seal at 1 until the hinge returns fully to 0°.
4. Only after authoritative closure/obstruction checks permit it, extend the seal back to weight 0.

Never turn the hinge with deployed lips, or extend them at a nonzero hinge angle. Parent-owned authority must validate obstruction, accepted seal fraction, damaged seal state and finite leakage throughout transitions. This asset provides no actuation rate, power draw, pressurization capability, flow coefficient or airlock cycle. Do not turn the geometric contact study into a `closedConductance=0` rule without its separate validated functional definition.

The retracted gasket stays inside the inherited 1.3119895197752154 m conservative hinge radius and clears the full aperture at −90°. The additional front envelope reaches Y `-.0845`; reserve it explicitly during the seal stroke. The existing hinge sweep bound alone must not be mistaken for the deployed gasket's static envelope or for obstruction validation during seal travel.

## Validation and actual evidence

`python3 validate_gasket.py <revision-directory>` passes **22 checks**. It verifies:

- The unchanged r001 dependency pin and two explicit additive selectors.
- Native normal/UV/tangent preservation, finite tangent frames and nondegenerate triangles.
- Exact bind, retained morph target name/default and actual exported position deltas.
- The deployed export contour and retracted contour inside the rigid leaf silhouette.
- Single-sided additive materials and absence of exported lights/cameras.
- No moving-gasket penetration into the fixed frame or floor across **101 seal fractions** and **361 hinge samples**.
- No gasket retraction into rigid backing, the full open aperture, fixed seats outside the aperture, positive contact areas and complete projected aperture coverage by leaf plus gasket.

Contact rectangles and projected coverage complement each other; neither is a pressure/strength test. The sampled motion checks are fitting evidence, not the later authoritative continuous sweep adapter. The morph is a geometric fold study, not a calibrated elastomer deformation model.

All seven actual source views were opened and inspected: `closed-front.png`, `closed-back.png`, `closed-contact-detail.png`, `retracted-front.png`, `open-front.png`, `open-back.png` and the transparent `seal-and-seat-cutout.png`. They use Blender Cycles CPU, 80 samples, four threads and AgX. Front/back/open views are 1000×1100; the contact detail is 1100×900. They are not installed-game screenshots. The full doorway silhouette and inherited material roles remain consistent with r001; this scope makes no broader plastic-finish claim.

## Remaining work

The parent owns runtime morph loading, physical hinge/seal sequencing, authoritative state, obstruction handling, leakage rules and real browser tests. Pressure/material/actuator definitions, native voxel clipping and final owner art approval remain absent. The existing structural voxel-damage versus interior-equipment entity-health distinction is unchanged; no stats are inferred.

Required diagonal spans and node closures for 1:1, 2:1, 4:1 and 8:1 floor/roof edge families remain a separate follow-up. This r002 must not be advertised as complete enclosure coverage for all twelve shapes.

## Repository checks

`npm run art:check` passed. `python3 scripts/art_catalog.py check` reported `Source inventory changed; inspect new/removed files` and `Stale generated index/status; run index`. Shared source inventory/index reconciliation belongs to the integration owner and was not performed here. All 19 files recorded in this revision’s delivery manifest matched their hashes. No shared software changed in this modeling task; aggregate check/build and installed-game validation remain the parent’s integration gates.
