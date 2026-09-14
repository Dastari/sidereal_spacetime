# Ice26 and Gas5 shadow technical review — 2026-09-14

Independent read-only review after the nine main-world and nineteen moon working art passes. Read the current iteration and LOD contracts and preceding Ice/Gas reports. Reopened both exact reference crops and actual saved shadow diagnostics. No browser, Blender or tests were run. Passed art is not reopened by this technical review.

## Ice26: self-shadow pattern remains unresolved

Exact evidence under `output/playwright/planet-reference-20260914/ice-r026/`:

- `glass-wired-seed38.png` and `glass-wired-seed38-angle2.png`.
- `shadow-slope-diagnostic-seed38.png` and `shadow-slope-diagnostic-seed38-angle2.png`.
- Corresponding `glass-wired-seed38.json` and `shadow-slope-diagnostic-seed38.json`.

The first default view has dense regular diagonal/striped patterns on selected otherwise broad opaque caps, especially approximately x500–590/y210–280 and x600–660/y470–550 in the 900px image. This is not the reference's irregular snow erosion. The diagnostic reduces those fine patterns but retains coarser serrated bands and some thin central markings. Its cleaner second view does not resolve the first-view defect. JSON records the same kit hash, seven casters and two transmission materials/one target; normalBias changes .003→.008 and depth bias .0005→.003. Several small ledge shadows weaken with the larger bias, so the diagnostic is not proof of zero contact-shadow regression.

Evidence supports a shadow-dependent precision/bias problem; images do not identify its exact implementation cause. Next directed diagnostic should keep source/materials fixed, inspect light-space bounds and shadow texel/depth precision, and separately test caster/receiver self-interaction on an actually affected cap. Map that cap to its source/placement before making any source claim. Tightening useful shadow coverage or correcting scale-aware bias is a hypothesis, not an accepted solution. Verify a clean cap retains nearby short-block contact and cavity shade at both angles and movement/scales; simply disabling shadows or detaching them with excessive bias is insufficient.

Preserve reference-defining white snow districts, cobalt blue walls/cavities, unequal shaft groups and stepped depth. Preserve the owner-requested selected glass sides and opaque caps. Do not bevel, thicken or remesh snow to conceal the pattern, or increase transparency to hide it.

## Gas5: shadow effect exists, correct planet/ring cast response is unproven

Exact evidence under `output/playwright/planet-reference-20260914/gas-r005/`:

- `low-sun-shadow-corrected.png` versus `low-sun-shadows-off-corrected.png`.
- `planet-seed38.png` as the accepted normal appearance context.

The corrected on/off pair is visibly non-identical. Most obvious change is fine regular contour/diagonal hatching over broad parts of the body, including upper polar bands and the lower-right hemisphere. This does not by itself demonstrate a coherent ring cast-shadow band or a body shadow crossing the ring. Ring grain/color can hide small differences; absence of an obvious dark wedge in these stills alone does not prove that ring receiving is disabled. The earlier uncorrected files are preserved history and should not substitute for the corrected caster-list pair.

Next directed diagnostic: isolate body-only caster→ring receiver, ring-only caster→body receiver and body self-casting, holding the source, camera and light fixed. Confirm the projected light/geometry actually places a shadow on visible receiving surfaces. Inspect alpha shadow participation for dust: the shadow should follow authored density instead of a solid annulus or no dust shadow. Distinguish dust from opaque debris. Verify near/far occlusion and both face lighting under the existing glTF double-sided behavior. These are hypotheses/checks for the renderer investigation, not claims that any one setting is already proven defective.

Preserve the accepted stratified violet/magenta body with warm accents/vortices, unequal granular ring belts and gaps, grouped debris and correct two-sided PBR response. Do not repaint the dust or brighten emission to compensate for a shadow defect. Do not require a shadow in a screen location copied from the illustration irrespective of actual sun geometry.

Exact references reopened: `assets/art-library/assets/planets--ice-world/revisions/r000/reference.png` and `assets/art-library/assets/planets--ringed-gas-giant/revisions/r000/reference.png`. Existing bounded art passes remain intact. Shadow technical acceptance, hardware timing and normal Flight/Map transitions remain separate and open.
