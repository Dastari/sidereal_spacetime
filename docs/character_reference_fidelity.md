# Character reference fidelity contract

This extends [component authoring](character_component_authoring.md). The focused
medic calibration, captures and exact current revision are linked from the
[living component index](https://github.com/Dastari/sidereal_spacetime/blob/9c58c07774d7d3c4a58a40c49e90f2a2c647249c/assets/art-library/character-components/INDEX.md).
The installed r008 bundle contains the owner-authorized focused visual swap: two
bases, three hairstyles and nine medic pieces. Other existing components retain
r002; open comms remains unissued. Use the ledger to distinguish installed visuals,
staged designs and final art sign-off. Exact source/export hashes and rollback are
in the [publication receipt](https://wiki.sidereal.dastari.net/Art/Library/Docs/character-components/publications/r008/README).

## Read the design before constructing it

Open both `reference/art/characters-weapons-items.png` and
`reference/art/characters-weapons-items-female.png`, then the relevant exact crops
in the art library. The female sheet is a separate variant source: its medics have
exposed faces, swept hair, a substantial ponytail and small white/red comms. A
closed male-sheet helmet is not the whole design. Neither body type automatically
selects or changes equipment. An exposed comms assembly is a separate unisex
helmet-slot item, with its own eventual inventory definition.

Record observed features separately from inferred construction. Front/three-quarter
color blocks, straps, pouches and hair flow are observed. The exact unseen nape,
rear pack clasps, interior helmet gasket and attachment engineering are inferred.
Keep their reference links and rationale; do not describe an invented rear surface
as a literal extraction. Cases, holographic diagnostic cards and weapons held in
the reference are separate props, not fused parts of the medic body.

The approximately two-meter shared placement envelope is retained. Use manifest
bounds in meters to inspect an individual piece. Measure head/figure ratios only
at comparable orthographic cameras, figure height and pose. The source is an
illustration, not an orthographic blueprint. The reviewer found the r004 head
scale close enough; enlarging it to compensate for wide arms would break helmet,
hair and visor compatibility while leaving the actual silhouette problem intact.

## Model the visible hierarchy

| Feature | Required construction and visual check |
| --- | --- |
| Face | Tall dark inset-like eyes, about one third of the visible face height in the source crop; little corner glint, no large white sclera. Thin brows, shallow small nose and restrained mouth. Controlled cheek/jaw taper with narrow molded edges. |
| Hair | Start with 3–5 directional primary masses, asymmetric fringe and unequal steps. A closed fitted scalp support joins crown, temples and nape beneath overlapping locks. Preserve visible forehead/eyes. No tiled lid, straight curtain, bald rectangular rear, open shell slots or isolated stud-like blocks. |
| Ponytail | A gathered root leading into an observable curved, tapering silhouette. Continuous overlapping locks with staggered tips; inset end caps and sound normals. Check both three-quarter directions, rear and side, including backpack clearance. |
| Base | Connected shoulder-to-arm rhythm, tapered forearms/calves, shaped torso and hips within the common attachment envelope. Keep mandatory opaque shorts and female chest covering/straps visible in every bare pose. |
| Medic armor | Dark flexible underlayer → harness/frame → shaped white shells → small insets/fasteners. Thin shoulders and cuffs, distinct joints, asymmetric belt pouches, dark knees and dark articulated boots. Avoid a continuous white wall from shoulder to wrist. |
| Helmet/visor | White shell, red forehead field with white cross, separate dark blue optical surface and continuous interior gasket. Inspect on a light background for peach skin leaks. Keep visor independently wearable and preserve optical PBR properties. |
| Pack | Wearable volume with harness/frame, attached side modules, meaningful clasps and vents. Its item image must show the outward-facing surface as well as the wearer fit. |
| Details | Every detail should support silhouette, material boundary, attachment, function or a specific reference mark. More cubes or triangles alone do not demonstrate fidelity. |

Preserve native editable Blender meshes and material roles. Narrow bevels give
molded highlights; broad rounds erase the stepped style. Normal/roughness detail
may supplement a surface but must not replace a silhouette feature or attachment.
Keep collision/damage proxies separate. Export authored surfaces without voxel
resampling. Resolve coplanar/internal hair intersections with exact native surface
operations when needed, preserving separate editable input locks in the source. Do not rerun the old decomposition generator over reviewed revisions.

## Focused visual test and independent gates

Use one stable body/medic calibration before propagating the treatment to every
set. Keep the same camera, figure scale, lighting and selected equipment when
comparing the installed model and candidate. The reference image remains exact;
it is never redrawn to make the model seem closer.

1. Review both full sheets, relevant crops and the installed screenshot with an
   independent Astra reviewer. Record a feature inventory and concrete failures.
2. Author one bounded revision in a new directory. Save native source, all changed
   standalone GLBs, combined bundle, transparent item renders and source hashes.
3. Have the reviewer examine bases, all changed hair front/rear views, both medic
   headgear choices on both bodies, all isolated equipment and the outward pack.
   Correct named failures in a new revision and retain rejected attempts.
4. Render matched runtime comparisons with the real `createCrewVisual` path:
   neutral portrait lighting, blue reference-like lighting, straight fit stance,
   asymmetric carrying stance, front, both three-quarter directions and rear.
   A review-only pose must be labeled and must not overwrite animation clips.
5. Capture actual 256- and 128-pixel canvas renders, bloom off, a light background,
   a visor close-up and the production paper-doll UI. Inspect hair joins with a
   diffuse clay override to separate holes from contact shadows. Review shared
   walking, sprinting, seated, rifle and pistol poses visually.
6. Independently decide silhouette, face, hair, armor, variant, lighting and runtime
   gates. Passing geometric checks does not override an appearance failure. An
   agent's suitable-match decision is permission to seek owner art review, never
   final owner sign-off.

Technical validation preserves all 90 existing inventory component contracts, the
16-bone binds and 12 original clips. The focused runtime audit samples both bodies,
three hairstyles, bare/sealed/open/mixed outfits and all clips: 288 configurations,
1,440 frames. It checks finite skinned vertices, visibility and sockets. It does
not prove all possible mixing combinations are free of clipping. Preserve the
source hash, GLB hash, camera, renderer, viewport and limitations with captures.

## Resume and expand

Start from the current per-component ledger, its rejected feedback and the exact
editable source. Advance only affected component revisions. Keep installed
revision separate from current candidate; untouched components retain their own
revisions. The focused pass covers two bases, swept/crest/ponytail hair and nine
medic pieces, plus a separate proposed open-comms design. Other sets and hairstyles
remain a follow-on queue, not implicitly remodeled by a newer combined bundle.

After owner direction on the calibration, work through engineer, captain, pilot,
security, marine, salvage, recon, scientist and mechanic using their own male and
female source variants. Preserve source-specific silhouettes and props. Apply the
same quality gates and fit checks to each; do not recolor one medic mesh into all
professions. Proposed mass/grid or environmental properties remain separate from
approved design and implemented authority. No gender stat bonus or profession
permission follows from these models.

## Facial reference pass r009 — 2026-09-10

For head/face/hair work, also open [characters-facial-assets.png](../reference/art/characters-facial-assets.png)
and its [complete exact-crop index](https://github.com/Dastari/sidereal_spacetime/blob/9c58c07774d7d3c4a58a40c49e90f2a2c647249c/assets/art-library/FACIAL_REFERENCE_INDEX.md).
The [independent A–E review](https://wiki.sidereal.dastari.net/History/Handoffs/Character%20faces%20r009%20%E2%80%94%20independent%20reference%20review)
records measured baseline proportions, rejected attempts, corrected native joins,
actual renderer evidence and limits. The previous r008 character and r003 pose
approvals remain historical approvals of exact delivered bundles. They do not
approve r009, the new facial reference queues or all options shown in this sheet.

The current refinement covers both clean heads and all eight existing native hair
styles, rather than reconstructing every one of the 26 hairstyle-row silhouettes.
It adds a 32-color hair palette and eight eye-color presets, with the existing
skin tones; vivid pink, violet, blue and cyan should still read as colored hair.
Use source-like dark recesses and bounded highlights, not unrequested full-head
emission. Subtle female narrowing is concentrated in the jaw: 2% upper width and
up to 6% lower width relative to the male loft. The common rig, height, neck and
attachments remain fixed. Keep the shared dark vertical eye language, tiny corner
glints, shallow nose, restrained mouth and independently darker brows.

Finer hair means directional information, not equal small blocks everywhere.
Preserve a few main continuous planes, then introduce unequal crown steps and
short stepped tips along the flow. Swept needs its diagonal fringe; bob needs a
distinct part and framing silhouette. Preserve gathered roots, continuous nape
coverage and closed crown/temple joins. The accepted E correction uses exact
native unions with editable input locks retained. A black region in one render
is not automatically a hole or automatically an acceptable shadow: inspect the
actual mesh, an alternate background/light and the exported surface. Rejected A/B
tiled or laminated hair and D black join slots remain available as concrete
failure examples.

Facial marks use seven independently selectable atlas layers, each with sixteen
64 × 64 cells in a 1024 × 64 texture. They provide bounded expressions, details,
age treatments and flat facial-hair styles for either body. A textured full beard
does not reproduce a projecting beard silhouette; an atlas mark does not create
an eyepatch, monocle or other accessory. Preserve original cell order, transparent
coverage, contour-following UVs, layer depth and per-character selection. The
documented export-factor correction carries native iris/brow/beard Multiply
values into glTF without repainting pixels or modifying geometry. Verify those
factors in the exported file and in the actual game renderer.

The meaningful acceptance checks are complementary:

1. Compare fixed-camera native front, both three-quarter, side and rear views at
   equal head scale. Inspect both clean heads and every changed hair silhouette.
   Use measured metres and rig-relative bounds; the illustration has no reliable
   metric depth. A narrower face must not silently shorten the neck or alter reach.
2. Validate native unchanged object/material data and exported rig, clips,
   component visibility, UV orientation/cell limits, alpha, normals and weights.
   Check actual nonempty atlas cells, not merely texture filenames. Keep exact
   source/export hashes and explain any allowed Blender roundoff explicitly.
3. Compare the final packed GLB through `createCrewVisual` with approved r008,
   using the same body, pose, lighting, dye and camera. Capture neon and natural
   hair, light and dark skin, eyes, expressions, face details and facial hair.
   A comparison harness is real renderer evidence; label it separately from the
   production paper doll or normal world game.
4. Examine both close faces and actual 256-/128-pixel output. Small freckles may
   correctly disappear at a distant camera; use a closer capture to distinguish
   subpixel detail from a missing layer before changing texture depth. Conversely,
   a close-up alone does not establish useful game-scale readability or shimmer.
5. Review native and runtime walking, sprinting, seating, rifle/pistol, bare,
   open-cap, sealed visor and mixed-equipment poses with both bodies. Keep the
   approved r003 mesh/socket/aim-space pair and all lower-body mechanics intact.
   Verify hair suppression/restoration and backpack clearance. A finite-vertex
   check or one helmet still does not accept every combination.

The reviewer found E heads and existing-hair refinements suitable for this bounded
style pass. Broad nape planes, coarse tail/braid segmentation and a richer
root/shadow/highlight palette remain possible polish. Full accessory reconstruction,
three-dimensional facial hair, every source hairstyle, every atlas state and
sustained runtime performance are not implied. Keep final runtime/fit evidence
and owner r009 approval separately recorded in the living ledger.


The final r009 G delivery now has a bounded independent review of all 35 archived
actual-renderer stills, including both bodies/all eight hair styles, sampled fits,
paused clips and 128-/256-pixel output. It also has an actual `createGameUI` Crew
controls review at four viewport sizes; the expanded palette height is measured
before scroll clamping so the last row remains reachable. See the dated final
section of the [r009 review](https://wiki.sidereal.dastari.net/History/Handoffs/Character%20faces%20r009%20%E2%80%94%20independent%20reference%20review)
for exact asset hashes, the fixed scroll defect and remaining acceptance limits.
These checks do not change owner approval state or assert continuous playback.
