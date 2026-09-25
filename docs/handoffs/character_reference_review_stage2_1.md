# Character reference calibration — independent review, stage 2.1

Date: 2026-09-09. Reviewer: Astra subagent `/root/character_art_review`.
Candidate: `.runtime/character-reference/r004/`.

**Authored correction verdict: FAIL on one remaining hair construction gate.
The bases and medic armor are suitable to advance to matched runtime review.**
This is a second demonstrated improvement, not a no-progress iteration. No owner
sign-off is granted. Runtime, posed and reference-lighting gates are reserved for
the next stage, rather than failed merely because those captures are being made.

Native source SHA-256:
`8553fedc09c3328396a5573e847f98d17da99dc61d5af23de3d2b85df9fc69dd`.
Combined GLB SHA-256:
`29b9e560b909d8e709a1e87ae374613f6c9ce3b8ecb7671f0cfafb85c6fb8737`.

## Evidence inspected

I inspected both bare base fronts; male/female open and sealed medic assemblies;
female rear; swept, crest and ponytail three-quarter and rear hair views; and
isolated chest, helmet, visor, shoulders, gloves, belt, legs, boots and backpack.
I compared the corrected appearance with the actual male/female source crops and
the preceding stage's source-sheet observations and r003 failure record.

The saved technical records report sixteen GLBs, ninety preserved component
contracts, exact bind matrices/clips, finite data, and 288 Babylon fitting states
sampled over 1,440 frames. Their own statement correctly reserves visual clipping
and reference fidelity for human/agent review. These are supporting records;
I have not yet independently inspected the forthcoming actual runtime captures.

## A–F decisions for the authored correction

| Gate | Decision now | Reason |
| --- | --- | --- |
| **A — silhouette** | **PASS for advancement to posed/runtime comparison** | Narrower arm shells restore useful dark separation and reduce the robot-like width. Ponytail now contributes a large curved silhouette. Head/helmet proportions are adequate for the focused calibration; no enlargement is justified. Pose/camera confirmation remains next. |
| **B — face** | **PASS, retained** | Tall restrained eyes, small facial features, shaped bodies and covered bases retain the r003 gains. No need to disturb these during the final hair correction. Small-size runtime readability remains reserved. |
| **C — hair** | **FAIL — local construction correction only** | Directional locks, arc and nape coverage are major improvements. Long black slots between crown and side/rear panels read as separated shell pieces. Isolated raised blocks on the ponytail read as attached studs on a broad blade. Integrate those transitions into the lock masses. |
| **D — armor** | **PASS for the focused authored study** | Reduced bulk, clear chest/belt layers, dark knee/boot grouping, corrected red panel/white helmet cross and optical gasket resolve the major stage-2 issues. Some contours remain simpler than the reference; those are explicit later refinements, not reasons to restart this bounded calibration. |
| **E — variants** | **PASS for authored coverage** | Open and sealed options remain unisex and distinct, with separately authored hair/comms. Runtime selection semantics are still a separate gate. |
| **F — lighting/materials** | **PASS for neutral authored foundation; runtime/reference lighting RESERVED** | White/red/dark hierarchy remains readable without bloom. Dark optical seals fix the skin margin problem. Broad visor highlights still need assessment in the forthcoming matched light/camera setup; neutral images alone do not demonstrate the final paper-doll appearance. |

## Final local hair correction

### Close the crown-to-cap slots without flattening the locks

`hair-swept-rear.png` shows a nearly continuous black horizontal break below the
crown. `hair-crest.png` shows long black openings at both side edges of the top
cap. The same construction is visible around the ponytail's crown. These may be
deep shadows over an underlying cap rather than literal missing triangles; either
way, they read visually as separate hard shell panels, which differs from the
reference's coherent layered hair mass.

Overlap the crown, side locks and rear cap enough to remove the exposed black
slits, using a supporting shaped mass underneath where needed. Keep short local
creases and varying lock heights; do not erase all separation or replace the
whole hairstyle with one smooth helmet. A simple rear/upper three-quarter neutral
capture on a light background will verify that the long openings are gone.

Nape coverage itself is now successful. Preserve it. The exact unseen rear lock
arrangement remains an explicitly inferred continuation of the visible reference.

### Turn ponytail protrusions into continuous locks

The new tail has the needed arc and visible near-side mass. However,
`hair-ponytail.png` shows three upright isolated raised blocks along its outside,
set onto a large uninterrupted bent slab. They resemble construction studs or
accessories more than stepped hair. The reference tail's local steps continue the
direction of the gathered locks.

Merge the visual role of those blocks into two or three longer overlapping lock
ribbons or stepped ridges that follow the arc. Reduce isolated upward knobs and
break the broad slab with directed depth changes, not additional scattered cubes.
Retain its current taper, general size, location and backpack clearance. This is
a local surface/transition correction, not another wholesale hairstyle redesign.

## Armor differences retained honestly

The sealed helmet crown is still a more regular staircase than the source's
panelized silhouette; its ear modules are simpler. Glove knuckle marks remain
relatively bright. The shirt/arm panels are still intentionally blocky, but their
reduced breadth now makes the major white/red/dark hierarchy useful and consistent.
The real backpack rear has a medical panel and frame, although `medic-back.png`
continues to show its plain inward-facing surface. Capture the outward side for
the component's own evidence.

These remaining details belong in the living feedback record. They do not erase
the demonstrated improvement, nor justify calling this a pixel-exact recreation.
The authored model is now suitable for a focused calibration once the local hair
construction issue is corrected. Actual runtime appearance can still expose a
material, visibility or fit failure that requires a new correction.

## Precise next captures

1. Corrected swept/crest rear-upper three-quarter views and ponytail near-side
   three-quarter plus side view, neutral light with a light background as well
   as the existing dark presentation. These resolve C directly.
2. Female open medic with ponytail and male sealed medic in the same Babylon
   camera, at approximately the same displayed figure height as the source
   portrait. Include one neutral stance and one reference-like pose using the
   existing rig. Do not rescale the skeleton or head to compensate for pose.
3. Actual 128 px and 256 px figure-height comparisons and the real paper-doll
   capture. Record model hash, camera, light preset, viewport and bloom setting.
4. Sealed visor close-up under the same neutral and reference-like runtime lights;
   one rear/mixed-set fitting view; and an isolated outward-facing backpack shot.

The main agent is already preparing the runtime captures. Their absence is not
an authored-geometry failure here. Once the local hair images and game-renderer
evidence arrive, the next independent consultation can issue the complete A–G
verdict for this bounded study. Owner final approval remains separate and pending.
