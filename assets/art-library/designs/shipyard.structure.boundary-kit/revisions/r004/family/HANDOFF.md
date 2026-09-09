# Boundary r004 native family — working integration candidate

The final family is in this directory. The earlier r004 study at the parent path remains preserved and is not this installable candidate. All r001–r003 history remains unchanged.

## Exact delivery

- GLB: `kit.glb` SHA256 `568d491623f03df932a9c5c120a94e4a60b00bd0fd421ae3cf928c89543505db`.
- Editable native source: `boundary-kit.blend` SHA256 `3f615eeca6bbec35b45b207e0a0a6d42ad6edca5de781c1fa994d0abc5efc166`.
- Interfaces/planner maps: `interfaces.json` SHA256 `136afd89f22c1cbea3ba590fca4ebc4cd81f82615f71fcadcedc2d041b73544b`.
- Separate structural collision proxy/proof: `collision-proxies.json` SHA256 `83a408e22f8c56b1c515827938273297ed41e6d70a94eeb13180290158c8e399`.
- `delivery-manifest.json` pins every delivered file; no publication or final owner approval.

46 reusable native mesh groups (19 node signatures,27 span/end variants),86,244 triangles across the whole library,6 shared single-sided PBR materials with authored normal detail. Export contains no lights/cameras. Source meshes, modifiers, UVs, native bevels, material roles and embedded maps remain editable. Source gallery and actual native floor/roof fixture board are preserved in the blend.

## Placement grammar

32 units/metre; floor top6=.1875m; wall top/ceiling96=3m. These provide2.8125m clear standing height, not3m clear. Core thickness=.09375m; decorative straight envelope=.125m. Acute node miters exceed the straight envelope and are explicitly included in core polygons and collision proxies.

`interfaces.json` retains the family-plan schema and adds pins/native selectors/collision data. `parts[].id` is the stable reusable semantic part key; `assetUuid` is asset identity, never a placed-object identity. Select `GEO-boundary-r004-<partId>--surface`. Apply originUnits/32 and quarterTurns once; never stretch or reflect. glTF conversion is already applied by Blender export.

For nodes, canonicalize primitive outgoing rays over four quarter-turns using numeric lexicographic comparison; choose the first rotation in a tie. The canonicalizing rotation is the inverse of placement rotation. Match the exact signature and cutback table. For spans, match exact integer source delta and start/end cutbacks after quarter-turn or correctly reversed endpoint lookup. Preserve T endpoints and explicit collinear module nodes; arbitrary meshing of lengths is unsupported. All12 single-floor loops plus reentrantL, square/triangle, orthogonalT and collinear-module fixtures have explicit placement maps. Unlisted diagonalT, cross/dead-end or length/profile combinations must reject.

Each `ports[]` entry supplies a real native contact segment, outward normal and vertical interval. Native triangle area is checked against the .263671875m² port area. Convex decomposition supplies103 disjoint convex polygons over46 cores, exact nominal union within1e-12m² and native exported alignment within2.351e-7m². Decoration outside the structural core is explicitly not part of this collision proxy. Apply every convex polygon, preserve deck/height, and inflate for the actor separately.

## Existing door dependency

No door/frame/gasket mesh is duplicated in this GLB. `r001-door-compatibility.json` checks real r001 frame end triangles against .0625m-cutback nodes at X=.0625 and1.9375m. The centered40-unit aperture in a64-unit frame remains valid only for those endpoint profiles. Larger acute cutbacks require an explicit adapter/new variant. Opening reservation, full hinge sweep, r002 gasket sequencing and r003 threshold contact remain separate dependencies; this compatibility proof does not certify a sealed door.

## Contact and pressure limits

`floor-roof-contact-audit.json` evaluates actual pinned floor/roof/wall GLB triangles in18 configurations. All12 single-floor loops retain a continuous interior contact barrier despite only about42–45% full wall-bottom face contact and46–49% wall-top contact: centered perimeter walls extend outboard of the nominal floor/roof.

Several mixed-floor fixtures have actual bevel trough paths under the wall. Four-quarter floors and the eight-quarterT fixture expose room-to-vacuum paths; the latter also exposes cross-room paths. Approximately4mm deep native floor bevels require physical under-wall inserts/backing, not a logical airtight flag. r003 only addresses a local doorway strip. This follow-up is assigned as a new revision and does not silently modify r004.

Flat roof undersides show no potential cross-room/vacuum path in the18 tested nominal configurations, but material permeability and exact butt seam functional sealing remain unapproved. No pressure capacity, initial gas, mass, strength, inventory or damage-ready behavior is inferred from art.

## Evidence and reproduction

`validation.json`:313 checks pass over46 meshes and16 fixtures. Separate collision and existing-door contact proofs pass. Twenty actual CPU-rendered PNGs are preserved with dimensions/hashes in `capture-record.json`; the normal texture is separate. Acute tips have visibly broad simple closure faces; this is accepted working geometry evidence, not final visual sign-off.

Recipes preserve exact authoring/check scripts. Run from repository root; their default working directory is `.runtime/construction-boundary-kit/r004/candidate-a006`. Host polygon checks use the isolated Shapely wheel recorded in `recipes/authoring-tool-dependency.json`, not a runtime dependency. Re-run validators against this canonical directory with `python3 <recipe> <this-directory>`; current helper imports reference the preserved runtime validator. Modeling/rendering uses Blender4.3.2 CPU. Parent owns runtime integration, browser gameplay review and complete software checks. No live assembly or shared catalog was changed by this delivery.
