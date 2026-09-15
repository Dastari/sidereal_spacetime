# Redesign the current Shipyard equipment

**Owner direction: the TypeScript voxel-solid models are being phased out. Rebuild replacement visual assets in Blender, using authored meshes and materials.** Read `docs/blender_asset_migration.md`. Existing TypeScript shapes are migration references for dimensions, placement and gameplay interfaces; they are not the target art authoring pipeline.

Copy this instruction into an agent session in `/root/sidereal_spacetime`:

> Read and follow `assets/art-library/prompts/REDESIGN_CURRENT_EQUIPMENT.md` and `docs/blender_asset_migration.md`. The TypeScript voxel-solid models are being phased out: rebuild every unsigned Shipyard equipment design as authored Blender meshes and materials, preserving those surfaces in validated runtime exports. Keep the living art ledger and review evidence current after each iteration. Begin with the control seat and command console, then continue through the remaining equipment while I review. Only my explicit approval makes an exact revision final.

## Assignment

Rebuild the models behind the Shipyard **Parts → equipment** tab to match the selected reference designs and the active studless construction art direction. Produce editable Blender sources and validated authored mesh/material exports that work in the real runtime. Migrate the narrow asset adapter when the current path assumes TypeScript voxel-generated visuals. Carry useful work through the entire equipment queue; a plan or one improved thumbnail does not complete the assignment.

Start with the active root `AGENTS.md` and `PIVOT.md`, then read:

- `assets/art-library/INDEX.md`, `WORKFLOW.md`, `STYLE_AND_PIPELINE.md` and `CURRENT_EQUIPMENT.md`.
- `docs/blender_asset_migration.md`, `docs/visual_theme.md`, `docs/art_reference_guide.md`, `docs/voxel_construction.md`, `docs/geometry_iteration.md` and `docs/interior_prop_iteration.md`. Existing voxel-study reports describe the implementation being migrated, not the replacement visual source.
- The relevant art, scale and equipment sections of `reference/Astra_Voxel_Space_Game_Art_Technical_Design.md`. Resolve historical technology and scale conflicts using the active contract.

Use the project's Blender modeling skill and inspect the actual images. Use the imagegen skill for generated raster concepts when needed. Use the Playwright skill for actual runtime review. Check for concurrent work before touching shared sources or output paths.

## Establish the exact scope

Enumerate **every asset with `category === "equipment"`** in `assets/runtime/assembly/catalog.json`. Join `assets/runtime/assembly/wayfarer.json` by `assetId` to retain all placed instances. The initial snapshot has **10 reusable assets and 17 placements**: a control seat, command console, locker, engineering reactor, hydroponic tray, crew bunk, medical bed, lounge sofa and two bridge-bank variants. Re-read the current files; this snapshot does not freeze future scope.

Use `CURRENT_EQUIPMENT.md` and `current-equipment.json` for measured starting bounds, current IDs, source paths and candidate reference crops. The similar bridge-bank cards require a geometry/orientation/interface comparison before sharing a new design. Preserve each placed identity even if both ultimately share geometry.

The separate `assets/runtime/equipment` kit and `art:equipment` command serve carried/worn character equipment. The screenshot's equipment tab comes from the **assembly catalog**. Trace its real source chain before choosing an export command.

Most current furniture is defined in `packages/content/src/voxel-wayfarer.ts` and `voxel-wayfarer-interior.ts`, then exported to Blender/glTF. Hydroponics already uses `scripts/build_interior_prop_source.py`, `assets/source/interior_hydroponics.blend`, sampled matter and an explicitly authored botanical surface. Retain and improve that work. Do not claim the other nine catalog designs already have independent authored Blender sources.

Modeling and material work belongs in Blender. Deterministic Blender Python recipes are supported. Editing TypeScript `box(...)` definitions, recoloring existing voxel blocks, or exporting the same coarse voxel mesh into a `.blend` file does not satisfy this assignment. TypeScript remains appropriate for catalog metadata, placement, gameplay definitions and runtime loading. Preserve old fixtures as migration evidence until their replacement is integrated.

## Map references and specify each deliverable

Open the full reference image, every relevant crop, the current model and any existing iteration evidence. Candidate mappings in the equipment snapshot are starting points; inspect them before selecting a target. Split broad library families into precise canonical designs when silhouettes, dimensions or functions differ. Use the guarded library commands and retain every crop, reference UUID and previous mapping.

Record the current runtime asset ID, all placement IDs and chosen reference IDs in the canonical design revision's specification. Update the equipment work table with its design ledger link. Keep one shared authored design for genuine repeats such as the six lockers, with independent placements. Resolve variants explicitly.

Before modeling, document:

- Function and recognizable silhouette; exact target features and uncertain/occluded faces.
- Measured current bounds versus proposed new bounds in metres; origin, axes, floor contact, mounting footprint and construction interfaces.
- Fit to the actual crew rig: seated posture, reach, entry/exit, aisle/service clearance, bed length, bunk headroom and climbing access as applicable.
- Material roles, plate/seam widths, bevels, display/emitter areas, moving parts, collision/interaction envelopes and oriented attachment/service sockets.
- Relevant gameplay fields with units and a basis: mass, health, power/heat, storage volume, crew/bed capacity, generation output, growth/medical behavior, as applicable. Distinguish measured geometry, existing implemented values, proposed balance and owner-approved design. Use an explicit unresolved value where the evidence does not support a number.

Do not turn a visual reactor into a functional power source, a chair into a piloting grant, or a locker into authorized storage merely by adding metadata. New mechanics require the normal content/authority work. The first design pass preserves current installation footprints unless a measured fit problem justifies a separately documented layout proposal.

## Iterate through the real pipeline

Work in this order unless the owner prioritizes otherwise: control seat → command console → locker → reactor → hydroponics → bunk → medical bed → sofa → both bridge-bank variants. Read existing owner feedback before starting another revision.

For each revision:

1. Start the next canonical revision with explicit covered reference IDs, one concrete change and a hypothesis tied to observed shortcomings. Preserve earlier work.
2. Build deterministic, editable Blender geometry with named parts, material roles, UVs/textures where needed and relevant rigs/sockets. Use pale shells, indigo cavities, burgundy service panels and restrained copper/cyan according to the selected source. Check the silhouette before adding detail. Author deliberate construction courses, clean joins, bevels and curves in the mesh itself.
3. Save the `.blend`, recipe, materials/textures and validated authored GLB in the revision folder. Use the managed npm/`scripts/dev.py` entrypoints and `dev.toml`. Stage review output separately from published runtime assets. Preserve the distinction between source geometry, any separate gameplay proxy, reusable asset identity and placed-object identity.
4. Preserve the authored Blender surface and materials in the runtime export. Do not route replacement visuals through the old voxel mesher by default. If the current editor/gameplay needs sampled occupancy, derive and validate it as a separate proxy. Keep collision/damage/material authority intact; document any adapter or damage-preview limitation. Do not accept vanished bevels, stair-stepped thin details, overlapping black faces or flattened material roles merely because an old export gate passes. Validate glass/transmission in the selected Blender-to-Babylon path rather than silently making it opaque.
5. Render a real transparent RGBA cutout, close/angled and overhead Blender views. Verify actual transparent pixels and inspect edges on light and dark backgrounds. Save a reference/previous/current comparison at matching framing.
6. Load that exact revision into an isolated review instance of the real dashboard Shipyard and capture the equipment card, close view, ordinary placement scale, rear/top review views and furnished context with a crew scale reference. Also review the shared ship in the client walk-around/flight/cutaway modes when integration is available. A Shipyard-only capture does not prove client acceptance. Record the actual viewport, camera, renderer, source/export hashes and capture method. Label any review-only camera override.
7. Compare and record silhouette, proportions, seams, material response, emission, join/clearance, readability and runtime cost. Inspect images before claiming improvement. Register all evidence and agent observations with `scripts/art_catalog.py`; update the design ledger, equipment work table and generated index after every iteration.

Keep at least: `specification.json`, editable `.blend`, recipe, authored meshes/materials and needed texture files, `.glb`, true-alpha cutout, Blender renders, actual runtime screenshots, reference comparison, validation results and capture provenance. Retain any required occupancy/collision proxies separately. Save animation/playback evidence for moving components. Never use generated concept art as proof of a rendered in-game model.

## Identity, review and completion

`scripts/build_assembly.ts` derives runtime asset IDs from geometry signatures. A geometry change may produce a new ID. Keep the library's stable design UUID, old runtime artifact identity, proposed replacement ID and compatibility mapping explicit. Preserve placed UUIDs, transforms, cargo/state and unsupported drafts. Do not silently overwrite immutable asset volumes, discard a draft on catalog mismatch, or regenerate placement identities.

Final design approval belongs only to the owner. An agent pass means ready for review. Record the owner's exact feedback and message reference against the addressed revision; retain historical approvals without copying them to a new revision. “Continue,” silence, a reference image or successful tests do not mean final approval. Approval and publication are separate actions.

Request focused feedback when a design is ready, then work on another unblocked unsigned design. Apply new feedback when it arrives. If two consecutive attempts show no demonstrable improvement, record why and seek direction for that asset; continue useful work elsewhere. Never invent satisfaction or run unchanged renders indefinitely.

Before checkpointing, regenerate the index, run `npm run art:library:check`, the relevant art checks, `npm run check` and `npm run build`; use an isolated smoke database if authority changes were actually authorized and made. Review UI changes in a real browser. Report exact current revisions, evidence links, unresolved feedback and remaining work. Do not mark the equipment pass complete until every in-scope design has the required evidence and explicit owner final sign-off. Leave publication staged unless the owner authorizes it.

## Progress-only variation

> Read `assets/art-library/CURRENT_EQUIPMENT.md`, `INDEX.md` and `WORKFLOW.md`. Reconcile the current Shipyard equipment catalog with the mapped canonical design ledgers. Report each design's revision, saved renders, validation, outstanding feedback and exact owner sign-off. Identify unmapped or newly added equipment. Inspect the evidence before assessing quality. Make no model or publication changes for this progress review.
