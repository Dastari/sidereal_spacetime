# Character reference calibration — independent review, stage 2

Date: 2026-09-09. Reviewer: Astra subagent `/root/character_art_review`.
Candidate: `.runtime/character-reference/r003-rendered/`.
**Decision: FAIL for appearance acceptance; make one focused corrective revision.**
This is a visibly useful improvement over r002, not a stalled iteration. It is
not ready for publication or owner final sign-off under the focused test rubric.

Native source SHA-256:
`1f581eb62dc2c181b95e92c007c52e203e1e3671e1fdc5c55f8394193caf5398`.
Combined GLB SHA-256:
`9f8ac9c0591345172f576b4ea83b7e117abe9fd856547c98e77098e10c3e1a0e`.

I reopened both full reference sheets and r002 medic/ponytail renders. I inspected
all r003 male/female base fronts, open and sealed medic renders on both bodies,
all three hair front/three-quarter and rear renders, the assembled female rear,
and the individual helmet, visor, chest, shoulders, gloves, belt, legs, boots,
backpack and open comms renders. I read `study.json` and the focused validator
result. This is a visual review of actual Blender renders and recorded technical
evidence, not a claim to have independently replayed the GLB in Babylon yet.

The [stage-1 rubric](character_reference_review_stage1.md) still applies.

## Explicit gate decisions

| Gate | Stage-2 decision | Evidence and next condition |
| --- | --- | --- |
| **A — silhouette** | **FAIL** | Base torso shaping is more deliberate, but the medic still reads as a square-shouldered robot. Broad upper-arm blocks, gauntlets and tiled hair dominate. Retain head scale for the next correction; reduce armor boxiness and give hair a reference-like silhouette before reassessing proportions. |
| **B — face** | **PASS for this Blender calibration stage** | Tall dark eyes, much smaller nose, restrained mouth and thinner brows are substantially closer. Female waist/hip and modesty shapes are improved. Retain these gains. Actual 128/256 px Babylon readability remains a stage-3 requirement, not proven by these close-ups. |
| **C — hair** | **FAIL — main blocker** | Swept, crest and ponytail all share a regularly tiled lid and vertical front curtain. Rear views expose an oversized rectangular area of bare scalp. Ponytail is a straight stacked block chain with a top cube, rather than gathered flow. Correct all three using distinct directional masses. |
| **D — armor** | **FAIL, with substantial passed subparts** | Straps, abdominal plates, pouches, dark knees and boots are much better; backpack rear treatment is a useful inferred design. Shoulders/sleeves/gauntlets remain too broad and rectangular. The sealed helmet still has a regular staircase crown, incorrect forehead emblem hierarchy, and visible skin beside the visor opening. |
| **E — variants** | **PASS for static candidate coverage** | Both bodies have open and sealed rendered options. Open comms are separate, hair remains separate, and no gender-specific forced helmet swap is implied. This proves a useful authored option, not runtime selection or inventory integration. Those remain explicit stage-3 gates. |
| **F — lighting/materials** | **FAIL as a complete evidence gate; neutral foundation passes** | Neutral bloom-off rendering is clear, with readable white/red/dark layers. Large circular visor highlights and flat dark hair still differ from the reference. Reference-like lit captures and actual Babylon captures are not present. Preserve this neutral baseline; add the missing comparison lighting rather than replacing neutral evidence. |

G (runtime/rig/delivery) is not the requested stage-2 appearance gate. The saved
validator reports 16 GLBs, 90 preserved component contracts, exact 16-bone binds
and all 12 clips, normalized data and finite accessors. That supports the
foundation; it does not override the failed visual gates.

## Keep these gains

The bare bases are substantially less mannequin-like. Eye height and reduced
nose/mouth projection immediately improve the face. The female torso has a
deliberate waist while staying covered and inside the shared fit envelope.

The medic now has visible chest straps, lower abdominal plates, asymmetric red
pouches and a real buckle. Dark knee separation and dark layered boots correct
the most obvious r002 lower-body mismatch. The boots' sloped toe and sole are a
good stylized translation. The open comms make the face-exposed female reference
possible without removing the sealed helmet option. Retain these changes while
fixing the few large silhouette issues.

## Smallest useful next correction

### 1. Reorganize hair; do not add another uniform row of cubes

In `hair-swept.png`, the crown is a near-regular array of flat rectangular tiles.
The fringe reads as roughly equal-width vertical keys. The source has several
larger **directional locks**: an asymmetric sweep across the forehead, interrupted
temple outline and variable-height crown, with steps belonging to those locks.

Author about three to five primary interlocking lock masses first. Give each a
different width, depth, direction and stepped edge; use secondary steps only to
support that direction. Raise one side of the fringe to expose more forehead,
drop a contrasting lock toward the other temple, and avoid a straight bottom line.
Keep both eyes readable. The crest should rise along a swept ridge with an offset
end; the r003 crest's dark rectangular gap under the front top shelf should go.

The rear head is a major new defect: `hair-swept-rear.png` and
`hair-crest-rear.png` leave most of the rear cube skin-colored below a high straight
hairline. The reference does not explicitly show these backs, but the visible
side coverage implies a coherent cap extending behind the ears toward the nape.
Author that continuation and label the exact unseen lock arrangement as inferred.
Do not simply paint the back skin dark; its silhouette and surface steps need to
agree with the side locks.

For ponytail, replace the isolated top cube with a gathered root that bends into
the tail. Offset successive sections backward, then outward/down, giving an
observable arc and taper. Use two or three overlapping lock ribbons with irregular
ends rather than one column of six broad boxes. The tail should contribute to the
reference-like three-quarter silhouette; currently the front image barely shows
it at all. Render both three-quarter directions before changing head scale: the
reference tail sits on the visible side, so some visibility difference is camera
azimuth. Preserve backpack clearance and use explicit fitted variants if needed.

### 2. Shape the outer armor, retaining the improved central details

The reference medic has small shaped shoulder shells over a dark sleeve/joint.
The r003 assembly combines a wide rectangular white sleeve with a wide flat
pauldron, making a straight wall from shoulder to wrist. Its relative breadth,
rather than an undersized head, explains much of the robot-like appearance.

As a first authoring correction, reduce the shell's outer width/depth by roughly
10–15% **around the existing bone/attachment**, give its outside a sloped or stepped
drop, and expose a little more dark arm separation. This is a proposed correction,
not a measured percentage from the source. The white upper-arm plate should be a
plate or sleeve panel with corners/shape, not another near-cubic cuff immediately
below the pauldron. Keep shoulder and chest meshes separately equipped.

Reduce the oversized gauntlet cuff around 10–15% and articulate its outside edge.
The current bright three-square knuckle strip reads like piano keys; lower its
contrast and make finger/knuckle divisions subordinate to the dark glove. Retain
the wrist red accent and the useful left/right device variation.

Keep the chest straps, belt pouches, knees and boots largely intact for this
correction. The backpack's attached side modules/frame and inferred rear medical
panel are useful. Its isolated `medic-back.png` currently shows the inner face
toward the body; add an isolated outward-facing render so the improvement is
visible in its own item evidence, not only the assembled rear view.

### 3. Correct the sealed helmet hierarchy and skin leak

The reference male medic forehead has a **red inset/panel with a white medical
cross**. r003 still uses a white plate with a red cross, even though the open female
chest's red-on-white marking is appropriate. Correct the helmet rather than
forcing one marking treatment onto every component.

Give the crown three purposeful main contours: central red medical panel/ridge,
white side shell and a deeper dark/white temple/cheek frame. The current evenly
spaced staircase around the entire dome remains a broad r002 characteristic.
The ear module can keep its inset, but needs enough layered edge treatment to
read as an optical/comms assembly rather than a flat side plaque.

In both sealed renders, peach-colored skin appears at the upper-left window
margin and the cheeks beside the visor/frame. The source closed helmet reads as
an uninterrupted dark optical cavity inside the white shell. Add an authored
dark gasket/interior frame or adjust the opening overlap so skin does not form
visible unsealed gaps. Do not hide the whole base to solve it, and do not rely on
black background or bloom. Preserve independent visor wearability.

Keep the optical face dark blue and restrained. Tune the relationship between
visor roughness, broad area lights and the small cyan edge treatment so large
white circles do not become the dominant visor feature. This is partly a lighting
comparison issue: show the same visor with neutral and reference-like lighting.

## Head scale versus camera/pose: no scale change yet

I do **not** recommend enlarging the head or helmet in the next revision. The
sealed helmet occupies approximately a third of the full figure in r003, already
near the source's broad ratio. The open head/hair envelope is also close in height;
its shape is wrong mainly because the hair is a rectangular cap and the ponytail
does not frame the visible face.

The reference's bent prop-holding arm, slight contrapposto and visible backpack
introduce gaps and diagonal lines that the current straight neutral stance lacks.
Keep a neutral fit pose, but add one reference-like stance using the existing rig
and bone rotations. Use the same figure height, comparable orthographic/long-lens
three-quarter camera and both azimuth directions. Document the camera instead of
changing mesh scale to compensate for view differences. Joint centers, bind
matrices and animation compatibility remain unchanged.

Only after the narrower outer armor and better hair are viewed this way should
the head envelope be reconsidered. If it still needs adjustment, make a small
explicit mesh fit revision and recheck all existing helmet/visor/hair coverage;
do not scale the skeleton or destabilize all ninety existing pieces.

## Evidence needed for the next consultation

Preserve r003 as this failed-but-improved attempt. Supply the corrected native
source/GLBs with new hashes, the same neutral shots, and a paired reference-like
three-quarter pose at equal figure height. Include both hair rear views, isolated
outward backpack, close-up sealed visor fit, and front/three-quarter ponytail
silhouettes. Keep the female and male modesty bases visible in the review set.

After that correction, an independent re-review should decide A–F again before
the actual Babylon stage. Do not interpret the passed face/static-variant gates
as overall acceptance, publication permission or owner final approval.
