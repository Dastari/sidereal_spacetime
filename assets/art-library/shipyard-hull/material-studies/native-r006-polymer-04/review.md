# Native R006 molded front-edge study04

Status: staged derivative; actual runtime comparison reviewed, incremental improvement below the full reference target. No publication or owner approval.

This study starts from rounded02's editable Blender source and preserves its polymer material treatment and three-segment existing bevels. A direct mesh audit corrected the earlier modifier-only diagnosis: prominent R006 outer armor, structural ribs, service panels and vent surrounds are sharp eight-vertex/six-face surfaces with no bevel modifier or baked edge rounds. Increasing existing modifier segments never reached those faces.

Study04 adds 20 mm, three-segment weighted bevels to the visible front perimeter of 23 major surfaces. It excludes small hardware, seams, optical surfaces, fixtures and attachment interfaces. Thin panels retain their back planes; structural cores only round the front top/bottom edges, preserving shared vertical module joins. Original control points remain editable. Every affected mesh passed evaluated bounds containment and rear mating-corner preservation checks.

The preserved approved R006 source is unchanged. The derivative source is `candidate.blend`; the reproducible authoring script is `scripts/art_library/ship_finish_r006_major_edge_study.py`. `study.json` records exact source hashes, modified meshes and edge indices. `texture-material-audit.json` verifies all fifteen re-exported GLBs retain identical embedded images and material records against rounded02. `integration-map.json` supplies all seventeen original/candidate hash mappings, including two retained material-only outputs.

Prototype cost rises from 24,856 to 25,456 triangles; placed cost rises from 34,960 to 35,968 (+1,008). No material primitive is added. This is a geometry cost, not a measured frame-rate claim.

`blender-candidate.png` is an actual CPU Cycles source render, inspected after export. Major panel borders are visibly softened, but this whole-bow source view alone does not establish the desired premium plastic appearance under game lighting.

The prepared runtime comparison uses current static hull batching and identical cameras, actual game HDR, material specular/environment multipliers 1, exterior radius .04, 1024 PCF low shadows, depth bias .0035 and normal bias .015. These are isolated review controls until root reviews the actual frames. No global ambient increase or equipment changes are included.

## Actual game comparison

`runtime-control-bow.png` / `runtime-candidate-bow.png` compare rounded02 to04 at identical 1000×720 resolution and fixed RPG camera; the corresponding `whole` pair uses radius47. Both use the current production loader's material-compatible hull batching. Actual15 source-hash overrides were loaded per variant, with no canonical writes or database connection.

The candidate rounds the pale vent surround borders and front armor corners visibly at close range. The major triangular shoulder shadow remains; broad paint faces still read fairly flat. Whole-ship differences are restrained. No visible new join gaps, interface movement or giant white plastic hotspots appeared. This is a useful low-cost geometry correction, not evidence of full reference fidelity.

Both variants had86 active hull meshes (previous unbatched review369),868 draw calls in the bow view and1,285 in the whole view. Candidate active indices increase by9,072 across rendered passes. These draw counts include shadow passes and are not hardware frame-rate measurements. Actual shadow maps were ready at1024×1024 with422 casters; rendered frame IDs advanced40→64→88 in each scene, and all GL error checks returned0. Browser console contained only normal Babylon startup and software ReadPixels stall warnings.

`capture.json` retains all numeric camera/light/readiness evidence. The unique review browser was closed immediately after capture. Parent owns the decision and recipe application for a local combined release; original approved sources remain immutable and final art approval remains absent.

## Installed lineage audit

The parent installed15 exact hull derivatives covering23 placements. Independent SHA256 checks passed for every installed GLB in canonical runtime and both client/dashboard public copies. All15 original `approved_visual` files remain present and hash-valid. The manifest's derivative-source and integration-map hashes match this preserved study; catalogue asset records match the hull manifest. The two unused mapping entries are old floor-corner45/floor-square studies, correctly excluded from this hull finish installation so the current native floor materials remain intact.

The installed cost is35,968 triangles across affected placements versus10,336 for their approved originals: **+25,632 versus approved R006**. The previously reported+1,008 is only the final04 increment over rounded02 (34,960). This must not be presented as the entire release cost. The earlier868/1,285 draw figures describe the isolated matched review, not an actual full-App FPS benchmark.

Production support code now matches the reviewed radius.04,1024 PCF low, depth bias.0035 and normal bias.015, preserving sun intensity2.1, specular RGB.3 and global environment intensity.28. Material/channel preservation follows exact installed byte identity with the previously audited exports. Installer source only changes visual URL/hash, adds explicit finish provenance, and updates corresponding catalogue records; it does not mutate placement IDs/transforms or occupancy volumes in this finish step.

Final report acceptance checks:

- Identify the finish as a locally integrated derivative, with explicit exact owner final art sign-off still absent.
- Report preserved approved-source hashes and15 exact installed outputs, with equipment/floor excluded.
- Cite the matched close/whole screenshots and actual-App integration review separately; do not substitute the isolated review for full-App acceptance.
- State clearer rounded panel borders and restrained whole-view gain honestly; full premium plastic reference fidelity remains unproven.
- Report+25,632 affected-placement triangles versus approvedR006, and no extra draw calls versus rounded02 in the matched isolated review.
- Confirm final root check/build/native asset validation and IFCS actual combined-App rendering before release completion.
