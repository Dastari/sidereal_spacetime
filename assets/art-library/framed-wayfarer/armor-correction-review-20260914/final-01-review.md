# Final-01 independent complete-family review

Reviewer: `/root/armor_review_resume`  
Date: 2026-09-14  
Outcome: **Fail ready-for-owner review. Preserve this candidate and correct the four findings below in a new immutable revision.**

The complete candidate was compared with the saved Wayfarer modular hull proposal, the rejected baseline and proof-05's initial propagation pass. This review opened all ten final-01 native GLB-import images and all eight actual candidate-loader browser images individually. Unlike the partial prototype, the final fixture contains 28 new placed models, zero previous hull fallback entries and zero missing required models. Forty-six native model variants are available in the family. The exact source, exports, library, captures and receipts are hashed in `final-01-evidence.json`.

The new assembly demonstrably improves on the baseline. Four broad paired bays and one single vent bay per side replace the earlier repetitive narrow full-height panels. The broad plain and identity surfaces stay quiet; service and utility inserts remain bounded. Pale connectors wrap the thick navy shoulders and lower rails at bay boundaries, while narrow center seams preserve the independent 2 m modules. The deep vent louvers and recessed cassette planes remain visible in the joined browser close-up. Both assembled exterior views show readable `WF-01` text and the ringed planet emblem. Armor-only, bare and exploded views demonstrate a separate exterior shell around retained structural surfaces.

Four defects prevent this exact candidate from passing:

1. **Cyan lenses overlap the lower rail surface.** In `browser/final-01/joined.png`, the intended continuous cyan strips appear as short jagged fragments across plain, identity and utility bays. Native paired renders also show speckling on these strips. The saved source places the rail front at X 0.5 m and the lens front at the same X 0.5 m without removing the rail face behind the lens. Repair surface ownership with a real bounded aperture or stepped recess; retain the 0.5 m envelope. Check the bow cyan strip too. Increasing emission or offsetting the entire model does not resolve the underlying intersection.
2. **Bow terminal returns do not complete the bumper-to-cheek join.** `bow.png` and `armor.png` show separate pale terminal caps with visible open space between the name bumper and adjacent cheek. The bumper's ARMOR group stops at local X 0.25–3.75 m inside the retained X 0–4 m interface; its placed world span is -1.75–1.75 m instead of the available -2–2 m. Author/coordinator inspection confirmed that missing exterior terminal returns cause this gap. Complete the fitted pale returns and adjacent cheek land inside the frozen interfaces. Preserve the existing liner and glazing; do not close the gap with a cosmetic floating strip or an oversized intersecting part.
3. **The single identity variant omits the planet emblem.** `single-identity-port.png` has readable `WF-01` text but no ringed planet. The proposal's identity tile includes both. The author confirmed that the emblem is painted only in the wide-identity atlas region; this is an unapproved omission, not an intended owner-approved variant or UV crop loss. Restore both elements on the single identity atlas and verify normal and reflected exterior usage. This variant is unplaced in the current full ship, so the issue belongs to family completeness rather than the assembled paired identity bays.
4. **Diagonal rail finish uses crossed world-axis seams.** `diagonal-sill.png` and `diagonal-cheek.png` show X-shaped mapped course lines over the top rails. The author confirmed that a two-axis seam grid projected in world XY causes the pattern. Align the rail UVs to the local rail tangent/depth so the mapped courses follow the construction. The main rail geometry is sound; preserve it while correcting the mapping.

| Criterion | Finding |
| --- | --- |
| Separate armor | Pass: whole/armor/bare/exploded images show exterior groups separate from retained structure. This is presentation evidence only. |
| Shoulders, wraps and cassette depth | Pass: proof-05's pale cap repair and major depth survive the complete family and loader. |
| Bay rhythm and modular mating | Pass for the inspected assembly: four paired bays plus one single per side; no extra internal full posts. Existing native validation reports all ten paired variant/handedness combinations pass. |
| Both exterior identities | Assembled paired identities pass. The single identity family variant fails emblem coverage. |
| Complete bow | Fail: bounded parts exist, but bumper/cheek terminal fit is visibly unfinished. |
| Material/finish preservation | Source maps and exported PBR survive; cyan surface overlap and diagonal mapped courses fail the final visual check. |
| Whole concept readiness | Fail on the named repairs, while preserving the demonstrated silhouette, bay and separation improvements. |

Independent hashing confirms the source, recipe, all 46 GLBs, three maps, ten native images and eight browser images match their receipts. Native complete-family validation reports 27,328 triangles across the 46 variants. The packed library hash is `90e05fdad417878671468cc1fb03530c13d4060223a8586bd48cbc3a3a89a584`; its parity record reports exact source geometry/UV/material semantics for all 46 models. These passing technical checks do not erase the visible defects.

The browser suite is a private pure fixture using the actual candidate game loader, not authenticated gameplay or live-state evidence. The concept and separation views use alpha -2.75, beta 0.955, span 24 at 1400×950; the remaining cameras are recorded individually in `captures.json`. Both whole and separation receipts record zero application errors. Exploded placement uses a 1.5 m inspection offset. No Blender or browser process was started by this reviewer.

The next review should retain the same cameras and compare the repaired bow and continuous cyan strips first, then verify the corrected diagonal finish and both single identity orientations. Preserve final-01's passing broad bay rhythm, cap wrapping, major recesses and armor/liner separation. This failed candidate is not artistically approved, published, pressure/damage qualified or evidence of Shipyard contract completion.
