# Character reference calibration — independent review, stage 2.2

Date: 2026-09-09. Reviewer: Astra subagent `/root/character_art_review`.
Candidate: `.runtime/character-reference/r005/`.
**Verdict: gate C remains FAIL on small construction openings; no broader
character/armor redesign is requested.** Other authored decisions from stage 2.1
remain unchanged. Runtime/pose/lighting gates remain reserved. This record applies
only to r005 and grants no owner sign-off.

Source SHA-256:
`dc6d1717cdec349e3dc5d578c1fcfce0e6337185f9526c7aab09905e26867ece`.
GLB SHA-256:
`c0637b8325e04200d2b54ef563042cfc67bc107d7118c1cb9c7d5091492ab378`.

I inspected swept/crest/ponytail close-ups and rear views, opposite-side ponytail,
the open female assembly, and the newly supplied outward backpack render. I also
read the hair/loft authoring recipe to suggest a bounded structural correction.

## Demonstrated improvement

The long central rear seam is closed; the cap and nape now read as one mass.
The ponytail's isolated studs have been removed and its ribbons follow the arc.
The outward backpack capture clearly demonstrates its medical panel, framed shell,
corner protection, handle and side modules. These are useful improvements over
r004. Retain them. The inferred rear detail is now reviewable as its own component.

## Remaining defect and bounded remedy

`hair-crest.png` and `hair-crest-rear.png` still show black slots at the upper side
corners. The swept and opposite ponytail views show the same issue. Two small
openings are also visible at the gathered ponytail's capped upper root. They look
like holes or separated shell pieces; a dark-background beauty render cannot
establish whether the underlying cause is geometry, normals or deep contact shadow.

Use a **single closed fitted support cap** overlapping the crown, temples and
nape under the decorative locks. Extend that support beneath the corner slots;
do not add conspicuous patch cubes to the visible hairstyle. Preserve the current
outer lock silhouette. A support cap is an authored scalp/hair mesh, not a change
to skin visibility or a black paint workaround.

At the ponytail root, overlap the two ribbons into the main gathered volume so
their end caps sit inside it. Keep the root-to-tip flow and offset lower tips.
Check face winding/normals and evaluated bevel geometry before changing the whole
tail. The recipe's loft function generates end caps, so these need inspection
after modifiers: verify narrow-ring chamfers are smaller than half of both ring
dimensions and that intersections do not expose internal or reversed faces.

The main agent is already inspecting the actual geometry. That inspection should
determine which of these causes is present; this visual review does not assert an
unverified topology diagnosis. A clay/diffuse render on a light background, plus
the existing neutral material render, will make the result clear.

## Stop scope and next evidence

Do not change head scale, rig, face, armor, palette or tail location for this
correction. Do not add another density/detail pass. Retain r005 and make the
small closed-surface repair in the next recorded revision.

Provide the repaired upper-rear/side hair views, tail-root close-up and the
already-planned actual Babylon source/r002/candidate comparisons. If the black
slots are removed without silhouette regression, gate C can pass on those images;
the complete study still needs the reserved runtime, pose and scale evidence.
