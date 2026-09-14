# Character reference calibration — final independent review of r008

Date: 2026-09-09. Reviewer: Astra subagent `/root/character_art_review`.
Candidate: `.runtime/character-reference/r008/`, also retained in the family r008
revision directory.

**Verdict: PASS — suitable focused character/medic calibration and ready for
owner design review.** The candidate is substantially closer to the supplied
references than r002, and the staged review's blocking defects are resolved.
This is an independent agent assessment of the bounded study, **not owner final
sign-off, an exact recreation of every detail, or completion of all archetypes**.

Native source SHA-256:
`6b17eab686f9c82c67f7dd87a6b460e9c0311f29d954e43728cf93d875157f61`.
Combined GLB SHA-256:
`ae4a7e12096bd9aaac0bdfb178354d899b89af15cbc20293815c301871694150`.

## Scope of the pass

Two modesty-covered bases; swept, crest and ponytail hairstyles; the nine existing
medic components; and a separately authored unisex open medical comms option.
All existing armor sets are not being approved by association. The open comms
remain a staged visual design without a production inventory definition. Existing
item ownership, IDs, slots and gameplay effects are not changed by this review.

I examined the actual male/general and female sheets in full and at detailed crop
scale during the preceding consultations, then compared the final candidate with
those source pixels and preserved r002. This report closes the explicit gates in
[stage 1](character_reference_review_stage1.md), retaining the failures documented
in stages 2, 2.1, 2.2 and 3 as history.

## Final A–G decisions

| Gate | Decision | Evidence and practical limit |
| --- | --- | --- |
| **A — silhouette** | **PASS** | Head/body rhythm, shaped bases, narrower arm shells, dark boot/knee masses and the visible ponytail are a coherent reference-led improvement. Matched Babylon boards show the benefit without scaling the skeleton. The final custom comparison pose now visibly bends the forearm. |
| **B — face** | **PASS** | Taller dark eyes, restrained brows/nose/mouth, shaped cheeks and smaller ear treatment are closer to the source language. Both bases remain covered. Features read in the actual small Babylon outputs and the full portrait. |
| **C — hair** | **PASS** | Directional fringe, stepped crown/nape and gathered tail replace r002 slabs. r008 normal and clay views show the corner/root openings closed, r007 intersection artifacts removed and r006 projecting brim tucked inside the lock silhouette. Editable authored input solids are preserved; the final surface uses their native Boolean union. |
| **D — armor** | **PASS for this focused study** | White/red/dark hierarchy, layered chest/straps, asymmetric medical pouches, articulated knees, dark layered boots, corrected helmet emblem and optical framing carry through to Babylon. The backpack's outward render shows its inferred framed rear construction clearly. |
| **E — variants** | **PASS within the stated staged scope** | Both bodies support the authored open and sealed alternatives. Open comms/hair are separate, with no automatic gender equipment swap. Production-UI captures show the existing sealed medic equipment through real slots; they do not establish a released open-comms inventory item. |
| **F — materials/lighting** | **PASS for the calibration** | Neutral Cycles, clay diagnostics, portrait/cool Babylon lighting, light-background rear and bloom-off samples preserve readable surfaces. The candidate remains recognizable at 128/256 px canvas heights and in the real UI portrait. Precise source saturation/rim balance remains a refinement, not a claimed pixel match. |
| **G — rig/evidence/fit** | **PASS under the sampling limits below** | Recorded sixteen-GLB validation, exact shared binds/clips, both-body runtime samples, actual mixed-set captures and production-UI compatibility establish a usable revision. They do not prove every possible armor combination, full animation-time collision freedom, production performance or live publication. |

## Actual evidence inspected for the final decision

Within `.runtime/character-reference/r008/`, I inspected front/three-quarter/rear
and opposite hair views, full character views, and `diagnostics/` clay upper-rear
views for all three styles, ponytail side view, optical close-up and posed lighting
views. The diagnostic record identifies source hash, Cycles settings, orthographic
cameras and clay overrides.

Within `output/playwright/`, final evidence inspected includes:

- `character-fidelity-r008-female-final-comparison.png` — original female medic,
  r002 and r008 open medic/ponytail; the corrected bent-arm comparison pose works.
- `character-fidelity-r008-male-final-comparison.png` — original male medic,
  r002 and r008 with the sealed helmet, matching the intended headgear comparison.
- Both-body base/hair, seated and weapon-hold samples, plus locomotion samples
  across the review, light-background rear views, bloom-off output and the female
  128/256 px samples. The capture recipe resizes the Babylon canvas/engine before
  taking these small images; they are not enlarged Blender thumbnails.
- `character-fidelity-r008-paperdoll-female-reviewed.png`,
  `character-fidelity-r008-paperdoll-male-reviewed.png` and
  `character-fidelity-r008-paperdoll-small-reviewed.png` — actual production
  canvas UI with r008 routed into its portrait, including all nine equipped medic
  slots at desktop size and a smaller 900 × 700 viewport.
- `character-fidelity-r008-female-mixed-fit.png` and
  `character-fidelity-r008-male-mixed-fit.png` — medic chest/visor/shoulders/gloves/
  belt/boots, captain helmet, engineer legs and recon backpack during Walk.
  Attachment joins and independent palette grouping remain useful in these views.

The paper-doll log records an isolated test database, real equipped item UUIDs,
normal reducers, no reported UI error and a browser-only candidate asset route.
The existing live ship and installed r002 publication remain unchanged. Inventory
thumbnail icons in those UI captures are still installed r002 icons, while the
new individual model renders are saved separately. Updating those icons belongs
to a deliberate integration step; this report does not disguise the mismatch.

The earlier empty-model/closed-window r008 screenshots and ineffective r006 custom
pose are retained diagnostic attempts. They are **not** acceptance evidence.

## Sampling and implementation limits

The recorded fitting audit covers 288 states and 1,440 sampled animation frames:
two bodies, three hair choices, bare/sealed/open/mixed looks and twelve existing
clips. It checks finite skinning, expected visibility and sockets; it explicitly
does not claim geometric intersection testing or a complete visual verdict.
The actual still captures complement that audit but cannot prove continuous
collision-free motion for every possible equipment combination.

The additional visible mixed configuration is separate from the audit's
marine/mechanic/salvage configuration. Neither is exhaustive. Long hair is an
authored rigid fit in this study; no new hair physics is demonstrated. The source
and data validation preserve the existing sixteen-bone rest contract and ninety
equipment ID/slot/mass/footprint contracts. No gameplay bonuses follow from the
new surfaces or the existing mock stats shown in the UI.

The source reference's handheld med-kit/scanner, strong local hologram lighting
and composition are not reconstructed as welded armor details. Their absence is
documented scope, not evidence that the armor itself lacks those attached parts.
Unseen rear and underside details are inferred from the reference family's
construction language; they are not presented as directly observed exact designs.

## Remaining owner refinements and propagation guidance

The reference has more irregular fine hair courses and a more broken-up ponytail
surface than this candidate. The helmet crown/ear modules are still more regular,
glove knuckle marks are relatively strong, and runtime skin/white armor are less
warm/saturated than the source's lit portrait. These should stay in the living
feedback record for the owner to prioritize. They do not require another blind
detail-density pass before showing this focused result.

Use r008 as an explicit calibration example for proportion, functional layering,
closed hair construction, source-versus-runtime comparison and truthful evidence.
Do not mark the other nine archetypes remodeled. Propagate the accepted principles
through separately scoped revisions with their own matching source views and
component fit checks. Preserve the staged failures so future authors can see why
extra tiles, open seams, support brims or brighter lighting did not solve the
underlying reference mismatch.

The next decision is owner feedback on this exact bounded revision. An agent pass
means it is suitable to review; it neither manufactures satisfaction nor changes
the pending owner sign-off field.
