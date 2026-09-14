# First native armor block proof review

Date: 2026-09-14. Reviewer: independent delegated Astra agent.

Verdict: **PASS to proceed to full assembly proofs**, limited to the seven exact models and fixtures in `assets/art-library/framed-wayfarer/r005/proof-03`. This is an intermediate agent geometry/design review, not owner acceptance, browser acceptance, publication permission or completion of the kit.

## Exact evidence reviewed

Visually inspected all six actual native renders: `joined-bay.png`, `solid-section.png`, `exploded-section.png`, `convex-45-half-height.png`, `concave-90.png`, and `concave-90-top.png`. Read `models.json`, `native-validation.json`, and relevant frozen `recipe.py`/`armor_block_kit_plan.py` implementation.

Independently recomputed source, recipe, planner and all seven GLB SHA-256 values; all match the manifest. Source hash: `1207f7eca4cede4baf0ea10927b622c3f455a105e1e40437c3dcb22a91ecffb9`. Recipe hash: `ff9fd39bf9b7ed20015bfca442ebc1e023e677d1ed7b6bd4545cb692dc05f9ec`. Planner hash: `a7e4d425735f22bd3d373ff6d65c0aea99215d317b0ba1ea0d358cb7282bef73`.

Earlier proofs were not reviewed or passed here. No Blender process, browser, service, code edit or Git mutation was performed by this reviewer.

## What now works

The solid/exploded sections show actual substantial bodies behind the removable finish. The 0.75 m backing and separate 0.25 m finish reservation now read as armor blocks, unlike the r004 thin-fence appearance. The native report measures the 2 m × 3 m straight backing at 4.5 m³ across three closed solids, with zero nonmanifold edges; this supports the physical-depth claim rather than relying on the render alone. The report remains author-generated evidence, not an independent Blender topology rerun by this reviewer.

The joined bay's pale end strips wrap over the top and along the entire depth, so the façade and body belong to one construction language. Adjacent half-width end strips form a coherent common rib. The exposed crown has enough width to convey bulk at ordinary angled view. Plain, vent and service inserts share the same mass/interface rather than creating different structural silhouettes.

The half-height convex 45-degree fixture looks like a common corner block between two ordinary runs. It can replace bow-specific armor without the oversized shoulder-pod appearance. The convex chamfer is broad, legible and compatible with the reference's studless modular construction. The concave 90-degree fixture is visually closed in both angled and top views. Its dark top/bottom corner inset reads as a finish recess; it is not evidence of an open backing gap.

Independently transformed incoming/outgoing contact centers from the manifest for joined-bay, convex-45-half-height and concave-90. Adjacent centers coincide within 2.4e-13 m. This checks nominal placement consistency; it does not substitute for intersection/coverage validation of the complete mesh.

## Propagation conditions and limits

- Preserve this depth and common rib treatment on the assembled Wayfarer sides and half-height bow. Only a whole-ship proof can establish that the side/front imbalance has actually gone away.
- Complete the companion overlap/coverage checker before calling the assembly technically validated. Inspect backing and finish separately: coincident ports and manifold components alone do not prove nonoverlap or watertight union.
- Capture the exact GLB bytes in the browser. Native lighting/material response does not establish GPU parity, and the packed GLBs were reported by the coordinator rather than independently inspected in a renderer here.
- Show all four heights, mixed-height joints, interior bulkhead profile, direction coverage and both distinct alternate footprints. Seven models currently demonstrate 1.5/3 m heights, one convex and one concave turn; the larger palette in metadata is a planner declaration, not visual proof that every listed variant exists.
- The planner's exact residual-length approach is technically coherent. Keep endpoint-vector and cutback provenance with every derived span, and expose them as named qualified variants or automatically selected boundary components. A future player should not have to measure and manually choose irrational-length filler blocks. Do not call this current automatic in-game construction; this is an offline authoring fixture.
- Long residuals are repartitioned when a last piece would be below 0.5 m. One-span short residuals still require visual and geometry checks; the recipe narrows ribs using `min(.1875, L/4)`, but that alone does not guarantee every finish variant remains useful. Reject unbuildable small runs or use a declared terminal/compound part.

Surface finish is simpler than the reference, particularly the broad unbroken corner connector faces. That is not a rejection of this bulk/interface proof: silhouette and reusable body construction have materially improved, and adding detail before whole-ship review would distract from the remaining assembly question.

Final exact-native-plus-browser review remains pending. No pressure, protection rating, collision/damage behavior, live installation or owner approval is inferred from this pass.
