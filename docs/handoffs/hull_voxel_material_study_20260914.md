# Hull material, voxel damage and variable height study — r002

Owner requested visual examples, including matching model/damage grain, adjustable panel heights and explosion states. This check-in delivers the offline study. It does not complete a Shipyard contract, approve new art, or install gameplay destruction.

## Review package

- [Three surface approaches, intact and damaged](../../assets/art-library/hull-voxel-study/review-r002/screenshots/comparison.png)
- [Five panel heights at the same scale](../../assets/art-library/hull-voxel-study/review-r002/screenshots/heights.png)
- [Before, staged blast and aftermath](../../assets/art-library/hull-voxel-study/review-r002/screenshots/blast.png)
- [Editable Blender source](../../assets/art-library/hull-voxel-study/review-r002/study.blend), [blast source](../../assets/art-library/hull-voxel-study/review-r002/blast-staged.blend), [findings and reproduction](../../assets/art-library/hull-voxel-study/review-r002/README.md)
- [Exact artifact hashes](../../assets/art-library/hull-voxel-study/review-r002/artifact-manifest.json), [GLB validation](../../assets/art-library/hull-voxel-study/review-r002/validation.json), [browser validation](../../assets/art-library/hull-voxel-study/review-r002/runtime-validation.json)
- [Living design ledger](../../assets/art-library/designs/shipyard.hull.voxel-material-study/design.json)

The r002 artifact manifest SHA-256 is `65ca5ebbd806ee5abcc85ce5e793d1ddeef1055d445ad4c0f9a9655245fe139e`. It includes saved recipes, fourteen GLBs, maps, occupancy records, native sources, original renders and browser screenshots. r001 is preserved: its initial shoulder sampled identically to the stepped model; r002 changes the continuous source shoulder and quantizes its finish.

## Findings

All specimens share 62.5 mm cells for geometry and damage. Actual material removal creates through-holes and exposed solid edges. The burst uses 64 recorded removed cells as same-sized fragments, with a staged cosmetic flash. It is not a physics or weapons simulation.

The mapped cuboid has the simplest intact geometry. The stepped model retains a stronger silhouette plus fine normal-mapped detail; this is the recommended visual starting point. The sampled Blender derivative also quantizes its material to one texel per cell, giving the most uniform block grain while losing small fasteners and vents. No parallax, displacement or ray-marched shader implementation is claimed.

Height examples are 0.75, 1.5, 1.8125, 2.25 and 3 m. Fixed 125 mm end caps, repeated 250 mm middle courses and exact residual fill preserve attachment origin, width, depth and texture/cell size. The intermediate height exposes clipped decorative repetition beneath the cap; production variants need a deliberate pattern termination. Heights halfway between study cells require a finer common grid rather than rounding. Study core thickness is 250 mm and maximum decorated depth 500 mm; these are not newly approved production dimensions.

Study cell faces are unmerged. Their triangle counts do not benchmark optimized production implementations. Bounded remeshing, coplanar merging, authoritative damage, collision, pressure, debris physics and live replication remain outside this visual study.

## Validation and state boundaries

- `npm run check`: passed TypeScript, 1,919 tests across 328 files, and 87 document/provenance checks.
- `npm run build`: passed; existing chunk-size advisories remain.
- `npm run art:check`: passed.
- Ten standalone study tests passed. All fourteen exported GLBs passed independent binary geometry, winding, closed-edge, lattice, material, volume and removal-conservation checks.
- All fourteen exact GLBs loaded in the installed Babylon WebGL2 renderer through a private browser route. Normal maps are present on the mapped variants; the voxel finish uses nearest filtering. Three comparison boards and three runtime views were captured and visually reviewed; no JavaScript errors. Readback driver warnings are not treated as application errors. Cumulative draw counters were excluded from performance comparisons.
- Art-library index regeneration passed. The separate whole-library check reports an unregistered `reference/art/editor-mockup-5.png`; no source hashes, evidence hashes or ledger errors were reported. This unrelated reference was left untouched and the validator was not relaxed.

Entry HEAD is `1da95ec173fe81e81b3fa005889ec7dbbc93e97e`. Entry dirty list, pins, source manifest and command logs are in `.runtime/shipyard-completion/hull-voxel-study-20260914/`. No staging, reset, restore or cleanup was performed. The only package-script addition is the managed `art:study:hull` runner; study source lives under `scripts/art_library/`.

Native catalogue SHA-256 remains `9fa3db94ed61a84f3e9d52b0d404d1433931747bbd268fceefe6a4e2a6ead237`; hull-interface SHA-256 remains `2379415fc3501b6818daa3b17174d52fa8a91c330c9a1107271b5fcc4efd4e03`. No live application deployment, world mutation, ship/account edit, collision change or native publication was performed. Browser evidence is an asset viewer, not an in-game acceptance run. Prior Shipyard check-in gates and the isolated publish/spawn workspace grant remain unchanged. Exact-revision artistic approval is still absent.
