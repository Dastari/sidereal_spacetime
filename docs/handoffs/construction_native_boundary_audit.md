# Native construction boundary audit

Date: 2026-09-09. Scope: read-only source/catalog/interface audit; no model, runtime, catalog, service or publication changes. This is an integration decision record, not visual approval or pressure certification.

## Decision

Reuse the native floor kit r002, the Frontier roof r004 square masters, and the existing exterior armor/material vocabulary. Build a small native structural wall/door companion kit with explicit mechanical interfaces. Extend its roof and angled-wall coverage to all twelve floor footprints. Existing side armor must remain outside the structural enclosure. Neither the old voxel wall study nor the decorative pilot doorway is a complete pressure-wall/door kit.

This avoids another full ship redesign: existing Blender work is useful, but visual bounds are not sufficient to establish continuous seals, damage behavior or walking clearance.

## Evidence and actual publication status

- Floor: `shipyard.floor.mapped-deck-kit/r002`, twelve authored shapes. `docs/releases/native-ship-2026-09-08/floor-installation.json` records 51 installed placements. The design ledger is still `awaiting-owner`; installation is not final art sign-off.
- Roof: `shipyard.roof.frontier/r004`. The current ledger is `signed-off`, and `docs/releases/roof-r004/publication.json` records the owner's instruction to make it live, 26 canonical components, 73 roof placements at that publication, and 34,200 triangles. Earlier review manifests marked unsigned/unpublished are historical. Later pilot integration changes the assembly; 73 is not asserted as today's final placement count.
- Side armor: `shipyard.hull.side-armor/r003`, signed off and published in `docs/releases/side-hull-r003/publication.json`: seven canonical families, 18 placements, 33,648 triangles. This kit is expressly sacrificial exterior armor outside a separate pressure wall.
- Pilot hull: cumulative r006 source/recipe and `docs/releases/native-ship-2026-09-08/hull-installation.json` exist. The owner explicitly authorized r006 integration. Its design ledger remains `awaiting-owner`; preserve that discrepancy for the integration owner rather than rewriting approval history here. Individual unchanged parts retain older revision identifiers. The installed hull manifest also references finish-r004 visual derivatives; do not silently swap these for clean r006 exports.
- `construction.wall.service-cyan/r004` and `construction.roof.vented/r002` remain changes-requested. Their own revision text describes rendering a material-bearing voxel union. A `.blend` file does not make those historical sampled-voxel studies the desired native replacement source.
- All seven `pale-studless.door.*` designs (`airlock`, `interior-airlock`, `door`, `exterior-airlock`, `hatch`, `sliding`, `blast`) are r000/reference-only. `pale-studless.wall.standard` is also r000/reference-only. They provide references, not usable delivered mechanics.

The audited `assets/runtime/assembly/catalog.json` contains 67 wall-category entries without a native visual design ID, six pilot r001 and ten pilot r004 entries. That is an inventory of catalog records, not a count of rendered walls: publication overlays, unused entries and retained IDs must be reconciled by the integration owner.

## Datums: distinguish deck height from standing clearance

The floor contract uses 32 integer units per metre, a 64-unit/2 m module, and floor bottom/top at 0/6 units (0/.1875 m). All twelve native floor bindings currently have identity source-to-nominal transforms. Blender XY is the deck plane, Z up; renderer coordinates are `(x,z,-y)`.

Current `LayoutDocument.deck.ceiling = 96` denotes a plane 3 m above the deck origin. With this floor it provides **2.8125 m standing clearance**, not 3 m. The instance planner correctly measures ceiling minus floor top. Nothing in this audit silently changes that default or rejects it merely for being below 3 m clear.

A companion kit must explicitly choose one of these profiles:

| Profile | Walking plane | Roof underside/ceiling plane | Clear height |
| --- | --- | --- | --- |
| Existing semantic default | 6 units | 96 units | 90 units / 2.8125 m |
| Optional 3 m clear room | 6 units | 102 units | 96 units / 3 m |

Roof top, wall embed depth and service-space limits must be declared separately. The current floor-interface JSON has null roof/service datums, empty seal lists, and null structural/damage adapters. Those gaps cannot be filled by reading the GLB AABB. An upper deck must clear the actual lower roof/service envelope; cloning a deck at a nominal 3 m spacing is not automatically valid.

## Existing parts and concrete reuse limits

| Asset | Evidenced geometry/datum | Recommended use and missing adapter |
| --- | --- | --- |
| Floor r002 | 2 m module; .1875 m top; 4 mm visual perimeter bevel; exact polygon interfaces in `construction-floor-interfaces.json` | Keep authored surfaces and maps. Add separately approved structural backing/contact/seal and voxel damage adapters; visual bevels must not become pressure leaks or overlap-based seal guesses. |
| Roof r004 `center-quiet` | Native selector `GEO-center-quiet--surface`; representative ID `part-e7f6d59dd9f860ed57d6`; bounds `[-1,-1,0]..[1,1,.86]` | Concrete 2×2 square roof candidate. Authored builder has backing z=0.. .16 and top plate .77.. .86. Translate XY by +1,+1 to a lower-left 2×2 footprint, then place source z=0 at the chosen ceiling plane; no scaling. Verify underside/edge closure in the exported GLB and register mechanical interfaces before enclosure certification. |
| Other r004 center/transition/shoulder roofs | Legacy main origin height 2.6875 m; special forward shoulder origin 2.5625 m plus .125 variant offset. Some service details exceed 2 m visual footprint. | Reuse exterior visual masters where nominal footprints and clearances are explicitly mapped. For a ceiling plane 3 m, translating the old main placement upward .3125 m is a proposed placement adaptation; for 3.1875 m, +.5 m. Neither is an already approved refit. Parts have differing thickness/envelopes; do not make all into an inter-deck slab. |
| r004 pilot roof and collars | Roof polygon `(.625,0),(5.375,0),(5.375,1.625),(3.625,3.375),(2.375,3.375),(.625,1.625)`; collar local z=2.59375..3.3125 | Bespoke cockpit exterior components. Preserve existing roof-layer visibility and source datums; they are not arbitrary triangular floor companions. |
| Side armor r003 | 2 m length; 2.9375 m height; world z=-.25..2.6875; inner abs(x)=5.3125, max outer abs(x)=6.155; mount clearance .015625 m | Preserve as separate replaceable exterior layer. It does not supply structural pressure walls, an approved seal plane, or inferred pressure/armor ratings. Seven families include port/starboard origin and mount-clearance variants. |
| Pilot r006 rear partition | `part-e7dddd4628bd6be8efb7`, source bounds `[0,-.008,0]..[1.625,.383,2.4375]` | Bespoke short bridge partition; native details/materials are reusable design language. Requires an authored height/length variant to become a generic module; do not stretch this mesh. |
| Pilot r006 doorway frame | `part-70c422bca2d395c35ecb`, source bounds `[0,-.082,0]..[2,.375,2.4375]`; retained placement `pilot-r004-airlock-frame-22`; handoff specifies 1.25 m clear doorway | Retain current future-door fixture. No leaf, motion, closed seal, obstruction/sweep interface or airlock behavior is supplied. The name airlock-frame is historical and does not certify an airlock. |
| Pilot lower hull/canopies | Lower straight hull 2 m long and 1.125 m high; swept canopy and buttress bounds are irregular | Reuse for the authored bridge assembly. Their union and source transforms need an explicit bespoke enclosure adapter; they are not interchangeable full-height room walls. |

Source-backed roof geometry names such as `sealed-backing` and `sealed-structural-tray` describe modeling intent. They are not an approved pressure implementation. Existing sampled closed-solid occupancy similarly does not prove a pressure seal or runtime voxel damage path.

## Smallest new native kit and delivery order

### First enclosed rectangular room

Author a single companion `.blend` using the existing native palette/maps and explicit datums. Deliver these mechanical families before expanding cosmetic variants:

1. Structural straight wall, **2 m** run, plus a **1 m** subdivision, at the chosen ceiling profile. Separate interior/exterior faces, floor embed, top bearing interface and actual wall thickness. Neither decorative armor nor panel emissive strips may be the sole closure.
2. A tested right-angle corner closure and partition T-junction/end closure. Their mechanical coverage must meet adjacent walls without hidden overlaps or missing wedge volumes. Repeated instances may share meshes; placed IDs remain distinct.
3. A **2 m doorway wall module**, preserving the existing **1.25 m passage** where compatible with actor clearance, containing separately named frame and moving leaf parts. Declare the opening polygon, sill, closed seal plane, leaf travel, obstruction volume and sockets. Door clear height and pocket geometry remain authored interface decisions; do not invent them from the old frame bounds.
4. A square ceiling/roof interface using the actual r004 `center-quiet` master if exported underside/edge tests pass. Add a native ceiling/backing companion only where its existing geometry cannot meet the chosen mechanical profile. This is the smallest reuse-first option, not a mandate to author twelve roof variants before the first room can render.

This produces native walls, a real door and a visible roof for the first walking proof. It does not yet satisfy all-shape/multi-deck construction. Cutaway hides those native meshes only; it must not remove the collision or pressure boundaries.

### Complete the floor-shape coverage

The supported footprints are square-2m, half-2x1, quarter-1m, strip-4x1, triangle-45, triangle-long-left/right, triangle-slim-left/right, corner-clipped, taper-4m and triangle-1m. Provide matching roof/ceiling coverage for each, by validated fixed native modules or dedicated authored silhouettes, not stretched rectangular meshes or a filled bounding box.

The diagonal run/rise families are exact: **1:1**, **2:1**, **4:1**, and the taper's **8:1**. Long triangle 4×2 edges are26.565°, slim4×1 edges 14.036°, and taper edges deviate 7.125° from the long axis; these are not 22.5° approximations. Include mirrored handed exports or explicitly validated reflection handling. Current floor bindings forbid reflection.

Provide matching angled wall runs, convex/concave closure adapters, terminal caps and roof edge closures. Add .5 m subdivision support where the taper's top 1 m edge and .5 m offsets require it. Arbitrary new fractional edge intersections must be rejected unless a native supported closure can actually be compiled; the UI must not silently stretch a wall to fit.

For multiple decks add authored roof/floor traversal apertures, sealed hatch collars and stair/lift interfaces. For external airlocks reuse the door family only after it has a suitable mechanical profile, and supply the two-door chamber/pump/vent ports and clearance envelope. A single doorway is not an airlock. Service penetrations need explicit feedthrough bodies, seal plane and typed ports rather than cables clipping through an opaque wall.

## Integration acceptance before replacing boundary-debug visuals

- Pin native node selectors and hashes; preserve editable Blender sources/materials/maps. Test source-to-nominal transforms on all rotations/handed variants; never use decorative AABBs as nominal floor/wall footprints.
- Compile wall/corner/roof coverage from the floor union and explicit partitions/openings, including exact diagonal endpoints. Prove roof coverage, wall-to-floor/roof closure, door gaps, traversal apertures and deck spacing.
- Keep structural walls/floors/roofs/hull/armor/exterior hardware on the voxel-damage contract with explicit adapters; interior equipment/containers use entity health. Do not infer mass, strength, pressure limits, fire ratings, fixture power or seal performance from appearance.
- Wire server-owned opening states, obstruction checks and pressure topology to declared interfaces. Client cutaway, object selection and glow are presentation only. Airlock interlock/pumping and breach effects require authority tests.
- Review the actual native game instance with roof on/off, walking/door collision, diagonal corners and two decks; verify scene costs. This audit performed no browser or GPU review and certifies no visual result.

## Exact source pins

SHA-256 below was recalculated from the named files during this audit. Working-tree manifests may change as the integration owner proceeds; immutable art source pins are the intended selection anchors.

- `assets/art-library/shipyard-floor/r002/kit.glb`
  - SHA-256: `138b483f6052f01e23883b8d8b48bb72cdbace44727c8e717b1e6351c3593585`
- `assets/art-library/shipyard-floor/r002/floor-kit.blend`
  - SHA-256: `f1369b9ba39b1cf8ac0c68c0a7bd8397954e12a2afb5370a3272276fc716fee7`
- `assets/art-library/shipyard-floor/r002/specification.json`
  - SHA-256: `8c051bfdebd0cef4d963cb2d21299ba5b681285b5ba15e6cc3fe97a9e6cd0e1a`
- `packages/content/src/construction-floor-interfaces.json`
  - SHA-256: `76f3f46c8e479106059945be0bfe23000d235d7c1731ad3d91524c3d894e1d16`
- `assets/runtime/assembly/roof/r004/kit.glb`
  - SHA-256: `8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f`
- `assets/source/published-roof/r004/roof-kit.blend`
  - SHA-256: `d9230a4e0359b7b551c4ea45604b4850c04a515fec1b985fc0132050c0ee31d2`
- `assets/runtime/assembly/side-hull/r003/kit.glb`
  - SHA-256: `eeef5b0cd37893c28b88fd54111b9cb58f086fba23b56a62fb6d7d44052c5ff7`
- `assets/source/published-side-hull/r003/side-hull-kit.blend`
  - SHA-256: `70c57b06a2c170c28840e0566f077d3561e0b40c4f5e978d36940273ceec1abd`
- `assets/art-library/designs/shipyard.hull.pilot-section/revisions/r006/blender-source.blend`
  - SHA-256: `d4f80a18eb293dd2e379b6913f3ae22f5dd37ed91f08bfb8efc0b7127742f3c8`
- `assets/art-library/designs/shipyard.hull.pilot-section/revisions/r006/recipe.zip`
  - SHA-256: `d2d35ad2b9ed01a396b83273c26daadb5c3ea9a4914e323369d86f9c3712c482`
- `.runtime/art-library/hull/r006/airlock-frame/clean.glb`
  - SHA-256: `1bea02f353c4bec1e29101bd7426561b30514cdb08436a8c50e5cd1467480583`
- `.runtime/art-library/hull/r006/rear-partition/clean.glb`
  - SHA-256: `7a2e29d2fdd4956180afe7057d42899edd0093ef2410890530a29fcc49b12dac`
- `assets/runtime/assembly/hull/finish-r004/part-70c422bca2d395c35ecb/clean.glb`
  - SHA-256: `825a836cb96f74363c83c1d5be4efc1a11df0ef71bbdafff8b2abb222cebdad6`
- `assets/runtime/assembly/hull/finish-r004/part-e7dddd4628bd6be8efb7/clean.glb`
  - SHA-256: `53d58e142047665409aadeb232a83f0c5a1901da705234f2ffc8bda4f211e5c9`
- `assets/runtime/assembly/hull-manifest.json`
  - SHA-256: `88c5ebd4cabda48a1702d66cbc3ac48dde6cbc645ad66bc157dcdc085ac985a8`
- `assets/runtime/assembly/catalog.json`
  - SHA-256: `88c2a2535eefb89e49be3dfbef6e162b18e8525a0e6d34dfeaa68d0824eeb159`

## Reading trail

- `docs/ship_construction_rebuild.md`
- `docs/ship_tileset_interface_contract.md`
- `packages/content/src/construction-floor-interfaces.json`
- `assets/art-library/shipyard-floor/r002/specification.json`
- `assets/art-library/shipyard-roof/review-r004/specification.json`
- `assets/art-library/shipyard-side-hull/review-r003/specification.json`
- `.runtime/art-library/hull/r006/specification.json`
- `scripts/art_library/build_roof_review.py`, `repair_roof_export_origin.py`
- `scripts/hull_publication.ts`, `assets/runtime/assembly/hull-manifest.json`
- Relevant design ledgers and release receipts cited above.
