# Working through the living art library

Status: Initial reference inventory and revision workflow implemented. Six construction targets have initial reconstructed cutouts, editable Blender sources, voxel exports and actual Shipyard captures. Reconstruction of the rest of the library remains unfinished. Read `status.json` and each design ledger for current owner approvals; an approved design does not imply the rest of the library is complete.

Start with [INDEX.md](INDEX.md), [status.json](status.json), [SOURCE_AUDIT.md](SOURCE_AUDIT.md) and [STYLE_AND_PIPELINE.md](STYLE_AND_PIPELINE.md). The owner asked for every reference image to be inspected, every discernible item/UI element to have its own image and brief, and a persistent record of revisions, feedback and **explicit owner final sign-off**. The owner chose exact crops **plus reconstructed cutouts**, sharing canonical designs across repeated appearances while preserving every crop.

**Owner model-authoring clarification:** current TypeScript voxel-solid models are being phased out in favor of authored Blender models, meshes and materials. Follow [Blender model migration](../../docs/blender_asset_migration.md). Replacement visuals preserve their Blender surface through validated GLB export. Existing voxel recipes and the six early sampled construction experiments are implementation/history evidence; any needed occupancy/collision/damage proxy remains a separate representation. Do not fulfil a redesign by refining TypeScript shape generators or merely wrapping their old mesh in a `.blend` file.

For the equipment tab, use [the reusable equipment prompt](prompts/REDESIGN_CURRENT_EQUIPMENT.md) and [current equipment queue](CURRENT_EQUIPMENT.md), which map the ten starting catalog designs and seventeen placements.

## What is authoritative here

| Record | Meaning | Edit policy |
| --- | --- | --- |
| `sources.json` | Original paths, image dimensions, SHA-256, inspection notes and duplicate mapping | Preserve original pixels; new/changed sources require a new inspection. |
| `assets/<reference-id>/reference.json` | Stable reference UUID, exact crop rectangle, source hash, identification and initial scale/stats brief | r000 is immutable. Correction is a new reference revision with its own rectangle, reason and hash. |
| `assets/<reference-id>/revisions/r000/reference.png` | Exact original source pixels | Never overwrite, upscale in place, inpaint, relabel as a render, or replace with a generated image. |
| `assets/<reference-id>/BRIEF.md` | Identification, scale/role/stats proposal and recreation steps | Initial briefs are generated, category-based proposals. Put refined specifications in the design revision; do not lose them by regenerating a brief. |
| `designs/<design-id>/design.json` | Shared design queue, stable reusable asset UUID, current revision, assignment, blocker, feedback, evidence and approval | This is the living canonical ledger. Every agent must update it after every meaningful iteration. |
| `designs/<design-id>/revisions/rNNN/` | Immutable iteration artifacts | Never overwrite prior work. Preserve failures and their reasons. |
| `INDEX.md`, `DESIGN.md`, `status.json`, `index.html` | Human/agent views generated from canonical ledgers | Run `python3 scripts/art_catalog.py index` after changes. Do not hand-edit generated status fields. |

An appearance ID identifies a crop, not a live item instance. A shared design UUID identifies an authored reusable design. A placed/installed item will have its own UUID in the normal content/authority model. Neither screenshot filenames nor merged GPU meshes merge gameplay identities.

The broad queues are **proposed production families**, not approved interchangeable meshes. A family may include an assembled object, exploded components, camera views, color/size variants and historical comparisons. Before implementation, inspect all relevant appearances and select a precise deliverable. Split incompatible silhouettes into distinct canonical designs, preserving the reference links, UUID provenance and the reason. Shared geometry can support material variants; different dimensions, rigging, footprints or functional assemblies generally require explicit variants. Do not collapse them solely because they share a word such as “wall.” The first six explicitly resolved targets use `construction.*` IDs; the other families still require that resolution.

## Start or resume work

1. Read the active root AGENTS/PIVOT contract, then this file and the style/pipeline document. Inspect `git status`; this repository has substantial existing work. Do not reset or overwrite it.
2. Read `status.json` and the current `design.json`. Select the lowest-priority-number unsigned, unblocked design unless the owner names another. Prioritize the calibration set: floor, wall, corner, door, window, console, bed, crate, crew, engine, turret and asteroid.
3. Open **the actual full source**, the exact crop, the latest revision and its feedback. A contact sheet is a navigation aid, not a substitute for zooming into the source. Confirm that the crop contains the intended complete visible object. Record uncertainty about clipped/occluded geometry; do not invent that the back face was observed.
4. Resolve the selected variant and source IDs. Refine the initial category brief into a precise specification: dimensions in metres, construction interfaces, material roles, origin/axes, collision, clearance, sockets, animation, LOD and gameplay fields. Every stat needs unit, status (`proposed`, `approved-design`, `implemented`) and basis. Do not copy unreadable or inconsistent concept-screen numbers into production.
5. Claim the task by starting an explicit next revision. Record one concrete hypothesis tied to feedback, for example “reduce plate depth and align the ten jamb courses to the reference.” Do not claim an asset is improving merely because its revision increased.

```sh
python3 scripts/art_catalog.py status
python3 scripts/art_catalog.py start pale-studless.wall.standard \
  --covers core-construction-blocks--wall-tile \
  --change "Refine the wall reference into a measured source model" \
  --hypothesis "A continuous pressure core, ten aligned jamb courses and a narrow right emitter preserve the reference silhouette" \
  --agent "session/task identifier"
```

`--covers` is an explicit list of appearances/variants this deliverable addresses. It is **not** an invitation to silently approve every member of a large family. Historical “before” images normally remain comparison evidence, not reconstruction targets.

## Produce and retain a revision

For a physical item, keep these files inside the revision directory:

```text
specification.json           measured scale, materials, ports, proposed/approved stats
generator.py                 deterministic authoring recipe where applicable
blender-source.blend        editable source and named solids/rig
glb.glb                     validated export, separate from source
cutout.png                  actual RGBA concept/render cutout
blender-close.png           actual Blender image with calibrated lighting
blender-top.png             actual Blender overhead image
runtime-close.png           actual Babylon gameplay close/angled capture
runtime-top.png             actual Babylon overhead capture
comparison.png              source / previous revision / current revision
validation.json             measured bounds, normals, material/mesh/texture counts, hashes
capture.json                camera, viewport, renderer, scene/asset hash, commit and command
review.md                   observations, differences, failures and next change
```

For native UI, retain component/vector source, actual desktop and smaller-viewport screenshots, focus/disabled/error states and interaction checks. Blender is used only for linked 3D item/ship thumbnails, never to turn a normal text input into a mesh. For animation/VFX, retain source/rig or effect recipe, key-frame strip and an actual playback capture. A still cannot verify timing.

Use `image_gen` for generated raster reconstructions; preserve prompt, model/tool identity when available, referenced source paths, output hash and all meaningful attempts. A reconstructed concept is **not** proof of a Blender model or an in-game asset. Verify that transparent cutouts have real alpha and are not checkerboard paintings. Review edges against dark and light backgrounds. Preserve rejected attempts as `concept` evidence with the failure reason. If generation cannot return valid alpha, record the blocker; use a real transparent Blender render from reconstructed geometry when appropriate. Never silently substitute a white-background image and call it transparent.

Use the managed npm / `scripts/dev.py` art commands described in the pipeline document. A new review generator may be exposed through a narrow npm command; it must read `dev.toml` and must not publish the world or update a live item. Review outputs belong here until explicitly published. Preserve imported Blender sources.

```sh
python3 scripts/art_catalog.py evidence pale-studless.wall.standard \
  --revision 1 --role blender-source --file /absolute/path/to/review.blend
python3 scripts/art_catalog.py evidence pale-studless.wall.standard \
  --revision 1 --role cutout --file /absolute/path/to/transparent.png
python3 scripts/art_catalog.py evidence pale-studless.wall.standard \
  --revision 1 --role runtime-close --file /absolute/path/to/capture.png \
  --context "Actual app URL; asset SHA-256; commit; fixed 35.264 degree camera; 1920x1080; WebGL2; lighting preset"
```

The example revision number is illustrative; always read the current ledger. The command checks the expected revision, copies evidence into the revision directory, hashes it and refuses to overwrite a saved artifact. `cutout` decodes 8-bit RGBA/gray-alpha PNG pixels and requires both visible and transparent pixels. RGB, fully opaque alpha, empty alpha and painted checkerboards fail. A passing alpha check still does not prove a correct silhouette; inspect the image. Capture roles require context, but software cannot prove that an agent told the truth about screenshot provenance. The agent remains responsible for authentic evidence.

## Review against the reference and prior feedback

Review in this order: silhouette and useful scale; studless construction and seams; bevel/stepped edge response; plastic/enamel/metal distinction; lighting/contact shadow; emission with bloom off/on; joins and attachment fit; secondary details; wear. Compare at ordinary gameplay zoom as well as close-up. Do not hide a silhouette failure behind more greebles or stronger bloom.

Record for each iteration:

- Owner feedback verbatim, its actual message/date reference and the revision it addresses.
- Agent observations separately, including concrete differences from the source and previous revision.
- The change made, hypothesis, evidence paths/hashes and validation results.
- Which feedback IDs were resolved, which remain and why; preserve the original text.
- Remaining uncertainties, blocked pipeline features and the next smallest useful step.

```sh
python3 scripts/art_catalog.py feedback pale-studless.wall.standard \
  --revision 1 --author agent --text "The side emitter is too wide; reduce it before the next render."
python3 scripts/art_catalog.py review pale-studless.wall.standard \
  --revision 1 --outcome fail --notes "Emitter width and mating edge still differ from the reference."
```

Agent `pass` means **ready for owner review**, not final approval. It requires the appropriate source, export, cutout, Blender/runtime or UI captures, validation record and explicit reference coverage. If an optical/rig/runtime gate prevents the next step, use `block` with the specific missing feature and work on another unblocked design. Do not invent screenshots or continuously regenerate the same unchanged image. After two consecutive iterations with no demonstrated improvement, checkpoint the issue and request focused owner feedback before continuing that design.

An agent can continue producing useful iterations and other unsigned assets while the user reviews. It cannot keep iterating “until happy” after running out of owner feedback and then decide that silence is happiness. Actual owner feedback determines satisfaction.

## Owner final sign-off

Only the owner can authorize final design approval. A supplied reference image, “continue,” “looks better,” a filename containing `after`, passing checks, an agent rating, or previous approval of a related asset **is not final sign-off**.

Record the exact owner statement and an actual conversation/review reference. Tie approval to the revision, hashes and explicit covered appearances/variants. If the statement only approves a concept, color, scale or stat proposal, record that limited approval in `approvals` with its scope; do not call the final-signoff command.

```sh
# Run only after the owner explicitly approves this exact final revision.
python3 scripts/art_catalog.py signoff DESIGN_ID --revision N \
  --owner-quote "EXACT OWNER STATEMENT" \
  --message-reference "ACTUAL MESSAGE OR REVIEW REFERENCE"
```

Never fabricate those arguments. This is a record-keeping tool, not authenticated proof that the person running it is the owner. Its checks prevent incomplete evidence and stale revisions; the operating contract prevents agents from inventing authorization. Sign-off also does not publish the asset or approve changes to server mechanics. Publication remains an explicit, separately validated action.

If the owner explicitly approves the delivered art while technical captures or agent readiness remain incomplete, record that actual decision with `signoff --art-only --technical-notes "FACTUAL REMAINING CHECKS"` and the same required exact owner quote/message reference. This records `approval_mode: artistic-with-technical-pending` and the outstanding readiness checks; it does not create a passing review, missing image, animation playback or technical acceptance. Evidence hashes, explicit reference coverage and factual runtime capture context remain mandatory. The normal sign-off command retains its complete-evidence requirements. Use this mode only for explicit owner approval, never to substitute an agent's judgment. Immutable earlier receipts may correctly say approval was absent when they were produced; the current ledger and dated approval event record the later decision.

New work starts a new revision. Retain prior approvals in history; an approval for r003 does not apply to r004. New owner change requests reopen the design and remove the current final designation without deleting the earlier statement. If a shared material, geometry generator, rig or renderer change invalidates earlier visual acceptance, record affected dependencies, create new revisions and obtain renewed review. Never overwrite the approved artifact in place.

## Finish every working session

Update the canonical ledger with current revision, assignment, artifact paths, feedback, blocker and next action. Checkpoint a partial revision honestly. Regenerate views and validate:

```sh
python3 scripts/art_catalog.py index
python3 scripts/art_catalog.py check
# Deep source-pixel audit, after extraction/crop changes:
.tools/art/bin/python scripts/art_catalog.py check --deep
npm run check
npm run build
```

Authority changes additionally require isolated `npm run smoke`. Actual art pipeline changes require `npm run art:voxels` / `npm run art:check` as applicable. Actual UI changes require a real browser review. Do not mark a project milestone complete merely because this library exists.

Report what changed and link the exact revision, rendered evidence and current ledger. State which assets still need reconstruction, model work, runtime capture or owner feedback. Nothing may be called final merely to finish an agent turn.

## Progress-only prompt

> Read assets/art-library/INDEX.md and WORKFLOW.md. Validate the ledger, then report counts by state, latest revisions, actual saved evidence, unresolved owner feedback, blockers and exact owner sign-offs. Inspect the relevant renders before making quality claims. Do not regenerate or publish assets for a progress-only request.

## Extraction maintenance

The initial visual rectangles live in `scripts/art_library/annotations.py`; category-based modeling/stat proposals live in `profiles.py`. Extraction needs Pillow from the pinned `requirements.txt` installed into the existing art environment. It refuses to change existing r000 pixels and preserves corrected crop pointers, refined briefs and explicit design mappings. `extract --append` permits strictly additive discovery while retaining prior approval coverage. Never edit r000 rectangles to apply a correction. The reviewed framing adjustments are recorded in `crop_corrections.json` and in each reference's history.

Use the guarded commands for corrections and unworked family splits:

```sh
.tools/art/bin/python scripts/art_catalog.py revise-crop REFERENCE_ID \
  --expected-revision N --box LEFT TOP RIGHT BOTTOM --reason "Observed framing correction"
.tools/art/bin/python scripts/art_catalog.py contacts
python3 scripts/art_catalog.py split FAMILY_ID NEW_DESIGN_ID \
  --references REFERENCE_ID --reason "Specific geometry/variant distinction"
```

`revise-crop` preserves prior images, hashes and boxes and updates the current crop/brief pointers. `split` creates a new reusable asset UUID, preserves reference UUIDs and records the mapping history. It refuses to move appearances already covered by design iterations; such a migration must preserve and explicitly account for that existing history. Neither operation copies final approval to a new deliverable. Regenerate contacts after mapping or crop changes.

## Inspect the first construction iterations

The `construction.*` design pages contain actual evidence from the initial calibration run. Raw-solid renders exposed coplanar surface artifacts; later revisions use the same `voxelize_blender.py` sampler and `meshChunk` implementation as the project. The voxel union fixes those artifacts but also reveals seams/bevels too fine for the chosen sampling grid. Those differences are recorded as unresolved agent feedback.

These early sampled visual experiments predate the owner's Blender migration clarification. Preserve their evidence and feedback; subsequent revisions should carry authored Blender meshes/materials into the visual export, with sampled gameplay proxies separate where needed.

The saved `runtime-*` captures are actual **dashboard Shipyard** renders with the unsigned review catalog/GLB routed into an isolated Playwright browser. They do not show a published item or a live ship installation. The overhead capture uses an explicitly recorded camera override for review; it does not demonstrate a native flight camera mode. Full in-ship flight/cutaway acceptance remains a separate required review. Preserve this distinction when reporting progress.

The editable `.blend` retains hidden `AUTHORING-CLOSED-SOLIDS` and a visible cooked voxel mesh. Raw sampled material-bearing cells are in `voxel-data.json`; the recipe archive retains the generator, sampler, mesher and job manifests. Use a fresh revision/output directory to reproduce work. Never resample the cooked mesh or render the hidden raw overlap surfaces by accident.

For browsing, open `index.html` locally or run `npm run art:library:serve` and visit the configured local URL (currently `http://127.0.0.1:5175`). The server only serves the art library and explicitly inventoried original reference images. The searchable browser and per-design visual histories are generated views of the same JSON ledgers. Run `npm run art:library:test` to test revision/approval/crop invariants in an isolated temporary library.
# Explicit native history origins

Existing extracted-reference designs retain their original r000 and complete revision history. A new native companion that was actually first authored as r001 may record `first_recorded_revision: 1` with a factual `history_note`, provided it owns no extracted reference crops. This records an existing origin; it does not permit deleting earlier artifacts, skipping interior revisions, renumbering pinned deliverables or inventing an r000. Owner approval still names the exact revision and evidence hashes. Prefer the established r000 start for future designs.
