# Independent Astra review — desert r002

Date: 2026-09-14. Reviewer: `/root/planet_visual_reviewer`.

Viewed `desert-r002/planet-seed38.png`, exact desert main-world crop, and `desert-r002/kit-preview.png`. The kit preview is diagnostic source evidence only; it is not accepted as a complete planet. Previous r001 and fresh baseline were reviewed in this same session.

**Outcome: fail; improved attachment in places, but reference gap remains substantial.** No owner approval or transition performance acceptance.

## Technical questions to settle before further art changes

1. Large ground regions now show nested stepped contour outlines. These resemble quantized base-sphere height bands rather than authored geological terraces. The preserved r001 composition uses `Math.floor(broad * 3) * .012`; inspect the current r002 equivalent and make a diagnostic capture without that quantization. This is a suspected source, not a confirmed current-code diagnosis.
2. Kit preview shows pale horizontal caps and orange walls, whereas several prominent complete-planet top-facing surfaces read as dark brown/black. Different studio lighting alone may account for part of this, but the discrepancy warrants a controlled single-kit Babylon view under the same scene light. Verify material-role mapping, winding/normals and axis conversion before changing palette to compensate.
3. Fine striped/patterned surface edges may be quantization or overlapping coplanar/submerged shells. Inspect a close view and shadow-off diagnostic to distinguish geometry overlap from shadow artifacts. A still cannot establish z-fighting; do not label it confirmed.

## Authored differences that remain even if technical questions pass

The new aprons partly connect formations to the ground, which is a visible improvement over r001. However, the kit itself reads as repeated symmetrical stepped plinths carrying relatively flat rectangular summit blocks. The reference is less regular: shelves have uneven footprints, columns merge into cliffs, some buttresses stand separately, and compact tall groups have unequal heights and widths.

The planet still lacks a coherent middle-scale sandstone landscape. Several similarly sized dark slabs are distributed over broad bare ground, and the diagonal trench remains the primary global feature. The reference instead uses broad connected pale sandstone/sand plateaus edged by strong rust-red cliff systems, with one unmistakable summit group and varied smaller formations.

## Next priorities

- First isolate and correct any material/normal/overlap issue. Keep a diagnostic record; do not globally brighten materials to hide incorrect surface orientation.
- Replace equal nested plinth footprints with two or three irregular adjoining shelf shapes; vary terrace widths and omit some steps.
- Give the principal formation a compact cluster of three to five unequal columns rather than one broad flat wall. Add one or two eroded buttresses at its feet and integrate a shelf into the canyon rim.
- Remove or soften generated whole-planet contour quantization if the diagnostic confirms it causes the rings. Terrain should be quiet, with authored regional ledges carrying the stepped language.
- Re-evaluate palette under unchanged production comparison lighting after technical correctness: pale peach caps, warm exposed walls, burgundy localized to deep shadow.

r002 demonstrates some attachment improvement, so it is not an unchanged re-render. It does not yet establish a meaningful closure of the overall reference gap. Preserve it and test the next complete planet from the same and a second angle, including small/retained-LOD appearance.
