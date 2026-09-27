# Independent Astra review — desert r001

Date: 2026-09-14. Reviewer: `/root/planet_visual_reviewer`.

Viewed complete actual candidate `output/playwright/planet-reference-20260914/desert-r001/planet-seed38.png`, fresh `desert-baseline.png`, and exact `assets/art-library/assets/planets--desert-world/revisions/r000/reference.png`.

**Outcome: fail; meaningful reference gap remains open.** This is an agent working review, not owner approval. Candidate provenance supplied by root: Blender-authored native kit composed in worker, actual shared Babylon sun/HDR/shadow helper, roughly41.5k unique triangles and six material meshes. No hardware timing claim.

## What changed visibly

The baseline's uniform tiny tile coverage has been removed, leaving quiet sand-colored substrate and clearly separated large rock groups. This demonstrates the intended shift in feature scale, but it does not yet yield the reference's integrated geology. The new candidate has a weaker natural/stylized planetary reading than the baseline in some respects.

## Why the candidate fails

- The large rock groups read as isolated rectangular towers attached to a smooth faceted ball. They have narrow feet, nearly uninterrupted flat walls and little transition into the surrounding terrain. The reference's towers grow out of connected shelves and terraces.
- Large groups sit around much of the circumference at comparable sizes, creating a spiked-ball silhouette. The reference instead has one principal group, secondary formations and long quieter arcs.
- There is a missing middle scale between tiny paired rock chips and monumental towers. Sparse tiny chips do not bridge that scale and some visually resemble loose floating debris.
- The single clean diagonal trench reads as a groove cut through a low-poly sphere. It needs broad ledges, irregular branching and adjacent elevated shelves to become a canyon system.
- Sand and rock are separated, but the ground is dull beige and large rock faces are nearly black brown. The reference uses luminous cream/peach horizontal surfaces, orange/rust walls and burgundy chiefly in deep shadows. Current dark tower faces hide their own form.
- Broad triangular substrate shading conflicts with the reference's intentional stepped regional surfaces. Merely raising base sphere resolution would hide facets without supplying the missing geology.

## Smallest next revision

1. Author a coherent **mesa, apron and terrace assembly**: a wide low basal shelf, two or three medium ledges, then a compact irregular-height summit group. Replace narrow tower attachment feet with that assembly so rock and ground visibly join.
2. Add two or three broad shallow regional terraces that cross the terrain and connect to formation feet. Preserve quiet sand between them. Integrate the canyon with these ledges and one secondary branch rather than making the existing trench deeper.
3. Establish one primary hero group. Reduce the height/coverage of other large groups and break their evenly distributed perimeter positions. Remove the repeated tiny paired chips until the middle-scale forms work.
4. Give horizontal sand/caps pale peach color, exposed walls warm orange/rust, and reserve very dark burgundy for occluded cuts. Judge this under unchanged comparison lighting before adding brighter atmosphere.

Do not increase scattered detail density, glow or global sphere subdivision as a substitute for these structural corrections. Preserve the failed r001 complete render for the next comparison.

## Next evidence

Render the complete next candidate at the same seed/camera/light, plus a second view and a gameplay-size view. Preserve the dominant mesa/apron/canyon forms in all LOD levels; reduce secondary detail instead of replacing those landmarks. Neither this still nor a bare kit render establishes worker transition performance.
