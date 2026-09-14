# Independent armor block design review — 2026-09-14

Reviewer: delegated Astra agent. Scope: design recommendation from inspected existing evidence; no new native or browser proof reviewed yet. This is not owner approval or publication authorization.

## Inspected evidence

- `reference/art/3d-rpg-after.png` (original reference).
- `assets/art-library/hull-voxel-study/wayfarer-layout-concept-r001/proposal.png` (AI concept, not runtime proof).
- `assets/art-library/framed-wayfarer/r004/browser/final-03/{concept,bow,joined,exploded}.png` (existing actual browser evidence).
- `packages/content/src/construction-floor-interfaces.json` (current nominal floor edges).
- Relevant front-part names and geometry branches in `scripts/art_library/armor_cassette_hull.py`.

## Finding

The current side façade is visually tidy but still reads as a thin decorated fence. The exploded view exposes essentially sheets and rails, with no convincing continuous block mass behind the decorative faces. By contrast, the cockpit shoulders have large vented boxes. This produces a front-heavy silhouette and makes the sides appear underbuilt. More face relief, lighting, texture or ribs alone will not resolve this owner feedback.

The reference conveys substantial horizontal depth at the perimeter crown as well as a deep continuous external belt. Its decorative inserts appear seated into this body. The replacement should demonstrate that underlying body without relying on the façade to conceal it.

## Proposed dimensional kit

Dimensions below are design recommendations, not approved gameplay values or measurements of the reference.

| Element | Recommendation |
| --- | --- |
| Heights | Exact 0.75, 1.5, 2.25 and 3 m variants on common bottom/top datums. Show four 0.75 m courses beside a single 3 m block. |
| Straight lengths | 1 and 2 m primary spans; 4 m may be assembled from two 2 m parts. Exact length follows nominal edge endpoints. |
| Exterior armor depth | Start with 0.75 m of closed solid body measured normal to the pressure wall, plus separately declared shallow decorative skin. Side and front share this depth rule. |
| Internal bulkhead blocks | Same heights and end-joint language; a separately declared thinner depth profile, initially 0.25 m, avoids consuming exterior-depth space in ordinary rooms. A deliberate reinforced 0.75 m interior variant may be useful. |
| Facade | Separate reusable plain, vent, service and identity inserts. No hidden structural dependence on a decal or decorative panel. |
| Corners | Named convex/concave transition parts for qualified adjacent direction pairs. Closure and reservation belong to these parts; do not overlap two full rectangular blocks at a corner. |

Keep the existing pressure-wall/interior datum fixed. Introduce an explicit new-family outward armor reservation, validate it against engines, mounts and openings, and preserve current live pins. Moving an old bound or disabling a containment assertion is not qualification. Any inward reinforcement needs an explicit reservation and must preserve traversable room/door clearances.

## Direction palette and joints

The current floor interface manifest contains straight axes, 1:1 diagonals (45 degrees), 2:1 diagonals (26.565051 degrees), 4:1 diagonals (14.036243 degrees), and taper edges of 1:8 (7.125016 degrees from vertical). Quarter turns and existing explicit handed variants cover the other directions. These values came from the nominal edge vectors, not eyeballing screenshots.

Use qualified endpoint-vector families and exact native spans. Either author diagonal modules in nominal XY and permit quarter turns, or qualify discrete edge orientations with matching native spans and junction profiles. Do not scale a 2 m block to an irrational diagonal length. Arbitrary yaw entry is unnecessary and would make endpoint snapping and junction closure difficult to explain. An initial subset is acceptable only when unsupported floor slopes are explicitly rejected/preserved and the report does not claim complete kit coverage.

Each straight span terminates on a named port plane. Each corner node owns the residual wedge between its incoming/outgoing span planes; neither neighbor also owns it. Single seam trim belongs to the junction or one designated edge owner. Decorative faces stop before the same joint allowance. Convex and concave nodes require separate validation because a generous outside miter can self-intersect at a recessed corner. Distinct asset IDs and installed part IDs persist through shared rendering geometry.

## Bespoke parts to replace

Remove the visual dependency on the pair of tall vented cockpit shoulder boxes. Replace their mass by ordinary armor courses following the floor edge; vents may remain reusable shallow face inserts. Replace `front-bow-bumper`, `front-diagonal-cheek`, and `front-shoulder-transition` as Wayfarer-only armor solutions with shared straight/diagonal/corner blocks. Existing `front-sill-straight`, `front-sill-diagonal45`, and `front-bow-transom` need role review: shared canopy-support/pressure interfaces may remain, but cannot secretly provide the missing armor bulk or force a unique ship silhouette. Preserve their existing sources/history and live revisions.

## Required exact-revision proof

1. Native kit lineup: every claimed height and direction family, with dimensions, source/GLB hashes and named editable source parts.
2. Neutral same-scale cross-section: pressure wall, solid armor body and decorative panel clearly separated; a closed body must be visible when the panel is removed. Quantify actual normal depth along both straight sides and bow.
3. Wayfarer: same camera and scale as final-03 concept/bow/joined/exploded; additionally top view with crown depth and continuous block course visible. Sides should read as comparably substantial to the front, with no surviving oversized shoulder pods.
4. Alternate footprint: rectangle with clipped diagonal corner and recessed return, using the same asset IDs and unit scale. Include 2:1 slope to disprove a Wayfarer-only 45-degree kit. Proof other slope families individually or mark them unqualified.
5. Joint fixture: straight-straight, convex/concave turn, mixed heights, and door end-return. No structural air gap, duplicate seam post, self-intersection or ambiguous wedge ownership.
6. Actual browser captures of these same exact GLB hashes, including plain body with decoration hidden and normal gameplay zoom. Blender-only proofs cannot establish runtime appearance; screenshots cannot establish actual solid thickness without geometry evidence.
7. Preserve sources, earlier attempts, reservations and live pins; record measured overlaps/clearances and what runtime authority remains unimplemented. Successful art/geometry checks grant no pressure, armor rating, damage or installation authority.

Current conclusion: existing evidence fails the requested bulk direction. The proposed new kit is ready for authoring exploration, not accepted art. Final exact-native and browser review remains pending.

## Coordinator refinement and palette qualification

The coordinator proposes a clearer 1 m total outward reservation: 0.75 m solid backing plus 0.25 m frame/finish, shared by bow and sides. I support this as the next explicit new-family exploration. The heights remain 0.75/1.5/2.25/3 m, with a half-height common bow course, existing cockpit glazing/interior/engines retained, and bespoke shoulder pods absent from the new review fixture.

The complete directed straight-edge palette is 32 directions: four axial, four 1:1, eight 2:1, eight 4:1 and eight 1:8. Exact floor-endpoint spans include sqrt(8), sqrt(20), sqrt(17), and sqrt(16.25) m for respective vectors (2,2), (4,2), (4,1), and (0.5,4) m. Clipped 1 m diagonal edges additionally require sqrt(2) m. Decimal angle labels are for people; actual placement comes from the exact endpoint vector and qualified profile.

Direction coverage and junction-combination coverage must be separate claims. Use canonical unsigned turn magnitude plus convex/concave classification and explicit handed transforms, with a finite registry of actually authored/verified direction-pair junctions. Every direction can have native proof without claiming every possible pair is supported. Quarantine acute/reentrant pairs exceeding the declared reservation, and reject unmatched pairs with a specific reason. This avoids manufacturing hundreds of speculative variants while preserving honest scope.

Corner registration must include endpoint trim/port planes, not just a model ID and yaw. Miter setback depends on depth and turn; stock floor-edge length plus a superimposed corner piece causes overlapping matter. Author exact port-to-port span geometry or prove a nonoverlapping square-end partition. Never round irrational lengths to the lattice or scale a convenient rectangle. Two corner reservations can consume the entire short sqrt(2) m clipped edge at this depth: qualify a compound transition or reject that configuration, rather than inserting a negative/near-zero filler.

Two genuinely different assembled footprints, plus Wayfarer, should consume the same native span/junction registry. A direction lineup may cover remaining slopes. Reports should name qualified combinations and unsupported cases explicitly. This is a technical scope recommendation; it is not owner approval or a claim that these deliverables now exist.
