# Character reference calibration — stage 3, r006 runtime checkpoint

Date: 2026-09-09. Reviewer: Astra subagent `/root/character_art_review`.
Candidate: `.runtime/character-reference/r006/`.
**Overall verdict: FAIL pending one local hair correction and final runtime
evidence.** The former openings are closed. Their repair exposed a continuous
projecting crown rim, a visible regression that needs to be covered by the locks.
This is not owner approval, a publication claim or a verdict on a later revision.

Source SHA-256:
`acca8d18774cebd961b47748975622215aec0f5df9c4617e2cf893cb5e3bdf5a`.
GLB SHA-256:
`c3a9206dffed3de58f8d1eb7e2fa9ade31648a8bfe3a701e606cad66bd342420`.

## Evidence inspected

I inspected all three neutral hair styles and rear views, open medic assembly,
clay upper-rear diagnostics for all styles, side ponytail, sealed optical close-up,
and both Blender reference-light stance renders. The diagnostic capture record
identifies Cycles, 48 samples, no denoising/bloom, source hash, cameras and clay
overrides.

Actual Babylon images inspected under `output/playwright/` include the r006 female
open/sealed comparison boards, reference-stance boards, Walk/Sprint/Seated,
male Seated/rifle hold, female pistol hold, male bare swept and female bare
ponytail, female light-background rear, bloom-off view, and female 128/256 px
images. The boards include original source pixels and preserved r002 rendered
through the same review harness. This proves an isolated renderer study; it does
not prove that the existing game/inventory has been replaced.

## Current decisions

| Gate | Decision | Basis |
| --- | --- | --- |
| A — silhouette | **PASS as a focused body/armor calibration; hair exception in C** | No head enlargement is needed. The slimmer shell envelope and layered lower body are visibly closer than r002. Reference pose verification is still pending. |
| B — face | **PASS** | Improved eye/feature relationships survive actual Babylon rendering and remain readable in the 128/256 px images. Covered bases retain their authored shape. |
| C — hair | **FAIL, local regression** | Clay and neutral images confirm closure of the old voids and tail-root caps. The supporting cap now extends outside the lock masses as a broad continuous rectangular brim. This is conspicuous in the runtime render as well as close-ups and repeats the original flat-lid problem. |
| D — armor | **PASS for the bounded calibration** | Chest/straps, pouches, knees, dark boots, open comms and sealed optical treatment retain their improvement in Babylon. Detailed source-match limitations from earlier reviews remain recorded. |
| E — variants | **PASS in the isolated review harness** | Open and sealed options are rendered on both bodies. This does not establish inventory ownership or a released selection UI for the new comms component. |
| F — lighting/materials | **PASS for isolated renderer readiness** | The palette and layers remain legible with the tested neutral/portrait/cool setups and small images. Runtime visor response is more restrained than the broad Cycles area-light reflections. Exact reference saturation/rim balance and production paper-doll context remain limited. |
| G — runtime/rig/delivery | **PARTIAL; reserve final gate** | Existing walk/run/seated/weapon-hold samples visibly render intact. Final hash-matched technical matrix, production paper-doll view and corrected custom comparison pose are still required. Isolated renderer evidence does not authorize inventory or live publication changes. |

## Bounded final correction

Keep the closed support volume, but inset its visible perimeter under the actual
temple/nape/fringe locks. Carry those lock roots over the cap transition; use a
small hidden bridge beneath the two corners if needed. Do not add a second
projecting rim or erase the directional fringe. Preserve tail caps, nape coverage,
body, face, equipment, palette, scale and rig.

The main agent independently observed this same rim regression and proposed the
same inset/support-and-overlap correction. That is suitable. Only the corrected
hair close-ups and changed runtime views need visual reassessment; no new armor
redesign or density pass is requested.

## Capture limitations discovered and retained

The main agent reports that the browser's custom **Reference** pose did not alter
the linked transform nodes: the corresponding r006 browser screenshots retained
Idle. Preserve them as an ineffective diagnostic attempt; do not cite them as
successful custom-pose evidence. The separately supplied actual Walk, Seated,
Sprint, pistol and rifle captures remain valid animation samples. Blender posed
diagnostics are separate and do show the bent arm.

The male `reference-stance` board also uses the open comms variant against the male
sealed-helmet reference. That is useful unisex-option evidence but not an exact
matched-headgear comparison. Capture male **sealed** against that source and
female **open/ponytail** against her source for the final direct comparison.

The archived 128/256 px images demonstrate small displayed output, but their
capture record should state whether these are native viewport captures or derived
downsamples. Neither method changes the visual observation; the provenance must
remain accurate.

## Next consultation

Supply corrected hair/clay images, the same Babylon comparison at the new model
hash, a working documented reference-like pose, the completed fitting matrix and
actual production paper-doll presentation. If the rim disappears without reopening
slots, C can pass. Final assessment remains a bounded two-base/three-hair/medic
calibration, not final approval of all ninety components or every reference detail.
