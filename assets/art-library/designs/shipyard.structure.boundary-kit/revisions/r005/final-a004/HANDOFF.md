# Boundary r005 — native wall-to-floor contact inserts

This additive candidate repairs the measured floor-r002 bevel paths beneath r004 structural wall cores. Earlier boundaryr001–r004 and all floor/roof sources remain unchanged. It is geometric contact-ready evidence for explicit game sealing definitions, not a pressure rating or owner art sign-off.

## Exact pins

- `kit.glb`: SHA256 `c31c946c54d9e797ea592541c7eb728083fc12a2e18b5713c307ece3c5bd1b60`.
- `boundary-kit.blend`: SHA256 `ec0417de1046ac4b79d40c48d9b627b97c32e1b3d0dd5b54c420513d175ffbbe`.
- `interfaces.json`: SHA256 `4622708cd371c3e4764e28f718279d43f1d9cc8084e40d8384101d17e719a004`.
- `contact-plan.json`: SHA256 `2d94b1365fa0be3770b46b6d9bdd35a275fc7a5de14b9cd4fbb8bbc3641259ba`.
- Floor dependency SHA256 `138b483f6052f01e23883b8d8b48bb72cdbace44727c8e717b1e6351c3593585`.
- Boundaryr004 interface dependency SHA256 `136afd89f22c1cbea3ba590fca4ebc4cd81f82615f71fcadcedc2d041b73544b`.

22 authored native floor/core-mask signature parts,6,240 triangles across the complete library,one shared single-sided PBR contact-alloy material,zero lights/cameras. Every group has normals,UVs and tangents. Main source retains named editable compound solids and real imported floor/r004 wall evidence fixtures; export includes only the inserts.

## What is physically modeled

Actual upward native floor bevel triangles are clipped against the structural wall footprint. Each clipped triangle becomes a closed native wedge from its actual affine floor height up to floorTop6=.1875m. Maximum depth is4.000008mm. No floor geometry moves or changes, no walking step is introduced, and the insert does not extend above the walk datum. Native contact faces intentionally have no rounding modifier because that would reopen the measured gap.

The solids exactly complement the actual beveled surface under walls. Disjoint wedge interiors retain their shared internal contact faces in the compound native mesh; they are not duplicate overlapping volumes. The separate solid volume in interfaces can support explicit geometry accounting but is not a mass/stat. Functional pressure/flow constants remain parent-supplied game definitions, not values inferred from the copper-colored surface.

## Deterministic integration

Read `interfaces.json`; source selectors are `GEO-boundary-r005-<partId>--surface`. Place at the matched native floor origin and quarterTurns with scale1. Mesh Z is already in deck-origin coordinates; do not add floorTop again. Apply standard Blender-to-render coordinate mapping once.

The bounded signature is pinned native floor kind plus the union of structural wall core footprints in that floor's local coordinates. `contact-plan.json` records each exact clipped contact patch, corresponding actual native floor triangle and local mask WKT. `interfaces.fixtures` supplies exact placements for all18 audited configurations, including the12 individual floor shapes, mixedL/square-triangle/T/collinear fixtures and quarter-tile substitutions. An integration matcher must compare the needed clipped contact region/profile to an authored signature (1micrometre export tolerance), or use the exact fixture map. A floor kind alone is insufficient: quarter tiles with different wall occupancy use different inserts. Unmatched masks must reject; do not stretch, mirror, substitute all edges or generate new runtime visual solids.

Part UUID is reusable asset identity; parent assigns distinct placed identities from instance-floor identity and mask key. These inserts are not separately selectable gameplay inventory and do not change preserved floor UUIDs. Parent owns batching, authority adapter and persistence.

## Actual proof

`validation.json` has130 passing checks against the final GLB. It checks top footprints, unchanged top datum, native solid volume, balanced oriented closed compound edges, normal/UV/tangent attributes and bottom triangles on actual pinned floor triangles. Every one of18 audited configurations has zero remaining under-wall room-to-vacuum or cross-room path under the same conservative1micrometre connectivity test used for r004. Both leak types were present before, including the eight-quarterT fixture. Exact before/after paths are preserved.

The visible dark line below a tile corner in the close view is the native floor side seam; the measured upper bevel path is filled. Contact validation uses the actual surfaces and occupied region, not a broad visual AABB or idealized floor plane. Geometric contact-ready status is enough for the parent to assign deliberate prototype gameplay seal/flow rules; it does not require a real-world material pressure rating.

Eight actual CPU PNGs include paired seam before/after, installed T floor/walls, all12 board, diagonal exploded and RGBA cutout. Exploded views translate the insert upward only to expose the otherwise concealed4mm part; native geometry is never scaled. Final source is an assembled T scene. First attempt failed because the local Blender build lacks OpenImageDenoise; second attempt exposed inserts poorly, so a003 corrects evidence framing. Final a004 fixes imported context quaternion rotation; the earlier root snapshot is retained and superseded by this final-a004 directory. Previous attempts/logs remain in the isolated runtime revision directory.

## Explicit remaining boundaries

This is a no-opening wall-base family. r001 frame, r002 retracting gasket and r003 local threshold need their own compatible masks/contact sequencing. Combining them without clipping/reservation can duplicate solids; do not silently overlay this family across a doorway. Roof underside/butt contact is separate. Unknown floor/wall mask grammar, arbitrary service/traversal apertures and damaged interfaces are not covered. Parent supplies prototype flow, seal states and gas initialization through normal authority, without inventing art-derived mass/HP/rating. Browser installation and complete software regression gates remain parent-owned.

Recipes run from repo root and default to `.runtime/construction-boundary-kit/r005/candidate-a004`; derivation originally preserved a001 then copied its plan into later evidence iterations. Host checks reuse the exact preserved r004 GLB helper and isolated Shapely authoring dependency. No runtime package dependency changed. No shared code/catalog/database/service was mutated by this delivery.
