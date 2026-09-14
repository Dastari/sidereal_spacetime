# Independent Astra review — desert r012

Date: 2026-09-14. Viewed both complete r012 angles and `planet-light-response-diagnostic.png`, compared with exact desert main-world reference inspected previously. Root records light diagnostic changes only candidate PBR directIntensity from1 to existing layered-planet1.45, without albedo retinting.

**Outcome: overall reference gate still fails, but low/mid regional coverage is now sufficiently established to focus on selective finish rather than another global relief rewrite.** The candidate has connected stepped geography and meaningful vertical wall area. Its most obvious remaining source mismatch is the summit: sparse tall rods resemble antennas instead of compact unequal monumental mesa masses.

## Next structural correction

Broaden and shorten the summit rods into compact unequal columns/buttresses sharing a foot. Keep a dominant height, but make the group a solid massif rather than several isolated needles. Add localized erosion pockets and a few real chipped edges on selected broad central shelves. Preserve the current broad composition instead of increasing geometry everywhere.

## Appropriate finishing layer

Authored UV/PBR albedo and normal detail on the existing surfaces is appropriate for fine strata, localized chips, roughness variation and restrained material color variation. It can close some of the reference's finer surface hierarchy without a large geometry increase. Avoid a uniform brick-wall pattern and avoid baking directional shadows/highlights that would conflict with actual lighting. Keep quieter sand surfaces and concentrate detail on exposed geology.

Texture detail cannot replace silhouette erosion, substantial canyon depth or the missing summit mass. Those remain authored geometry responsibilities. Review the finish in actual Babylon under consistent light, at close and gameplay scale, and with mip/LOD changes.

The directIntensity diagnostic makes exposed sand/walls brighter and their colors easier to read, but does not create missing fine hierarchy. Align with established renderer lighting deliberately; do not continue changing exposure to compensate for source gaps.

No complete-planet working pass, owner approval, moon coverage or hardware transition acceptance is established yet.
