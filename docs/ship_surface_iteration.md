# Ship surface iteration — 2026-09-08

Status: implemented geometry and canonical Blender sampling; integrated browser comparison pending below. This is a bounded art slice, not completed target fidelity or functional modular refitting.

## Inspected references and selected features

Each image below was opened and visually inspected at its supplied resolution. The four explicit before/after files are the acceptance views; the other images provide individual compatible motifs.

| Reference in `reference/art/` | Selected visible feature | Implemented translation |
| --- | --- | --- |
| `fully-complete-constructed-space-ship.png` | Lounge sofa's separate cushions; warm wall sconces between cool screens | Segmented lounge seat/back upholstery and framed warm wall fixtures |
| `core-construction-blocks.png` | Floor tile dark perimeter joints and framed wall service insert | Corridor grate bridges backed by solid deck; pale shoulders around recessed wall panels |
| `modular-spaceship-design.png` | Corridor wall's contrasting amber vertical fixture | Recessed amber corridor kicklights on existing doorway jamb footprints |
| `modular-spaceship-design-2.png` | Bunk footboard/drawer and storage crate recessed face latch | Bunk drawer/footboard detail, steel handles, and dark cargo latch wells |
| `exploded-spaceship-view.png` | Separate pale hull frames, dark service plates, contrasting access hatches | Broad dark roof plate islands with pale end caps and radiator slots |
| `modular-components-computers.png` | Computer console's independent framed screens above keyboard deck | Three framed blue screen wells with raised key clusters on existing authoritative console footprint |
| `internal-components-2.png` | Warm strip light's pale shoulder, dark recess, and bright insert | Editable Blender wall lamp with chamfer modifier, solid sampled at 0.0625 m and merged into ship matter |
| `asteroids-and-mining.png` | Actual supplied content is the same modular component sheet, including corridor connector and doorway status panel | Doorway light recess motif; this image is not evidence for asteroid/mining content |
| `faction-ship-1.png` | Explorer pale hull panels surrounding cyan connector/status recesses | Nonmetal polymer hull material and compact cyan roof edge status accents |
| `faction-ship-2.png` | Helix machinery's tall amber service indicators in dark frames | Exterior amber vertical recesses with steel retaining clips |
| `alien-ship-1.png` | Small purple emitters set into otherwise pale/dark panel boundaries | One compact purple service telltale per side; no alien ship or faction implementation |
| `alien-ship-2.png` | Marauder mismatched red access plates over dark structure | One contrasting red service hatch per side; no spikes, weapons or faction migration |
| `3d-rpg-before.png` | Existing noisy inner wall micro-bricks, continuous pink sofa, flat cyan-lit surfaces | Baseline diagnosis: preserve layout, simplify noisy relief, build deliberate frames and material roles |
| `3d-rpg-after.png` | Warm room fixtures contrasted with cool instruments, distinct cushions and layered walls | Primary RPG/deck target for integrated comparison |
| `top-down-before.png` | Flat regular roof pattern and nearly white hull response | Baseline flight diagnosis: weak surface hierarchy and material response |
| `top-down-after.png` | Broad dark roof service plates, framed vents, selective cyan edge accents | Primary flight target; new roof plate/vent details and polymer response |

The target attachment is visually identical to the supplied RPG target and was also inspected. Selected motifs are small representative details, not claims that entire reference ships or factions exist.

## Implemented construction and materials

`voxel-wayfarer-interior.ts` replaces the previous wall blanket of tiny raised bricks with broad framed service panels, layered screen wells, amber kicklights, corridor grates, segmented upholstery, bunk drawers and bridge instruments. The existing pressure core, wall/collider/seat dimensions, room IDs and semantic mesh layers remain in use. The 2 m construction grid and 0.0625 m solid sample pitch are unchanged. Furniture additions stay in the existing furniture footprint; the central console remains within its existing two-metre width.

`build_ship_fixture_source.py` creates a closed, editable Blender lamp from six manufactured solids, applies evaluated chamfer geometry through the sampler, preserves material IDs, and emits both original GLB and actual occupied-cell data. `art:voxels` builds the source first. `build_voxel.ts` validates pitch and palette IDs, mirrors cell intervals correctly and stamps twelve fixtures into the two existing cutaway layers. The majority of the ship remains procedural voxel-first geometry exported to Blender; this is one proven Blender-first production slice, not a claim of whole-ship source migration. Subcell Blender bevels can disappear at the current matter pitch; the sampled mesh does not claim continuous smooth bevels everywhere.

The shared exporter now uses nonmetal structural polymer, true exposed steel, rubber, fabric and separate cyan/blue/warm/purple emitters. Bare steel alone retains the brushed-metal maps. Polymer has a restrained coat with no universal metal grain. Material emission is real GLB emission, while local light contribution is handled by the renderer's lighting slice. No glass/transmission enters the opaque sampler.

The ship exporter manifest now explicitly includes `voxel-wayfarer-shell.ts`, the new interior helper, Blender fixture source, authoring recipe and solid sampler dependencies.

## Light anchors

Ship source axes: X across, Y along, Z height. Babylon uses X, height, −Y.

- Twelve wall fixtures: X near ±4.45, Y ∈ {−7.125, −4.875, −2.625, −0.375, 1.875, 4.125}, height ≈2.34 m.
- Corridor jamb kicklights: X=±1.15625, Y=room centre ±0.875, height=0.5625 m.
- Exterior amber service recesses: X=±6.15625, Y∈{−6.625, 1.375, 5.375}, height≈1.28 m.
- Palette 31 warm emitter, 32 upholstery, 33 dark screen well, 34 blue emitter, 35 purple telltale.

## Validation and measured iteration

Baseline before this slice: 1,847,552 occupied matter samples, 537 chunks, 49,402 quads / 98,804 triangles, 38 semantic batches. Final generation metrics and inspected live screenshots are recorded after generation/review, rather than inferred from source code.

Canonical generation completed: 1,901,296 occupied samples, 543 chunks, 45,326 quads / 90,652 triangles, 38 semantic batches, 108 exported material primitives, 21 brushed-metal primitives. Removing undirected wall micro-relief offsets new authored detail: triangle count fell 8.25% from the baseline while actual occupied volume increased. This is geometry accounting, not a frame-rate claim.

The Blender lamp sampled six closed objects into 424 unique occupied cells and retained all four material IDs (3 steel, 13 dark polymer, 27 pale polymer, 31 warm emitter). It is repeated twelve times in the existing cutaway batches. The stable sampler epsilon correction required canonical engine/bulkhead/airlock regeneration followed by assembly regeneration; the full `npm run art:check` subsequently passed ship, sampled solids and the 203-asset assembly catalog. `npm run check` passed. Canonical output was recopied to both client and dashboard. The parent integration owns the final all-project build and live screenshot review.

Actually inspected CPU Blender comparison: `output/playwright/ship-fixture-solid-comparison.png` shows authored lamp at left and sampled matter mesh at right, with the same material identities and lighting. The pale shoulder, dark recess, two steel clips and thin warm diffuser survive. The original's small continuous chamfers simplify to square sample-grid edges. This is a visible limitation of the current 0.0625 m sampling, not a completed premium-bevel claim. The Blender source is retained for future separate visual-mesh refinement.

**Integrated deck/flight browser comparison remains pending the lead's GPU session.** No screenshot behind an entry/offline overlay is accepted as geometry evidence. The lead owns final comparison against `3d-rpg-after.png` and `top-down-after.png`, lighting iteration, and all-project `npm run build`; this subtask was released to make room for the newly requested authoritative flight-computer work.
