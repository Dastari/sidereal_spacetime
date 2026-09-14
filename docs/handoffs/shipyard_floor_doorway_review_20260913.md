# Shipyard floor and native doorway rendering review — 2026-09-13

Status: focused implementation and browser component review passed; integrated application release and authoritative game door installation remain the root release task. This is not a completed Shipyard contract or final art sign-off.

## Floor cause and correction

Structure/Rooms used the shaped floor slab renderer while Objects/Hull used imported floor GLBs. The slab already had closed, outward-facing triangles and correct normals. Its Babylon Mesh nevertheless inherited clockwise culling in the right-handed scene, so the GPU discarded the top and outward side faces and showed the dark underside and inward side faces. This exactly reproduced the owner's open-tray screenshot. Native glTF imports already set counterclockwise orientation explicitly.

`layout-floor-slabs.ts` now explicitly uses counterclockwise orientation. Back-face culling remains enabled, polygon dimensions and source data are unchanged, and the existing interchangeable color/normal/ORM finishes remain in use. Root owns the change making Objects/Hull consume this same slab path. The shared game slab path receives this correction automatically when the client is built and released.

The regression test traces rays against only the faces that the configured GPU culling would display: from above the first surface must be the 187.5 mm top, and from below it must be the bottom. Existing closed-volume, normals, arbitrary-polygon, deck visibility and disposal tests also pass.

Browser evidence, inspected at 960 × 640 canvas resolution:

- [Previous culling reproduced](../../output/playwright/shipyard-boundary/floor-winding-before.png): clockwise orientation on the same closed mesh reproduces the tray.
- [Correct top and outside thickness](../../output/playwright/shipyard-boundary/floor-winding-after.png).
- [Correct underside](../../output/playwright/shipyard-boundary/floor-winding-underside.png).

The isolated review used the actual `createHullViewport` and floor helper. At review time the development dashboard asset URLs returned HTML for missing floor textures, so only this review browser routed existing texture/HDR requests to their matching normal public game URLs. No database or deployed asset changed during this review. Integrated deployment must verify its own prepared asset paths.

## Authored doorway integration component

The new shared `loadLayoutDoorways(scene, parent, requests)` loads the exact authored frame, leaf, seat and gasket GLBs. Runtime copies under `assets/runtime/construction/doorway250-r004/` are byte-identical to preserved r004 source files. r004 is an audit-only qualification revision of the r003 native visual geometry. Its limited offline enclosure evidence does not grant runtime pressure, flow, damage or artistic approval.

Requests name an opening and deck, with ship XY/up origin in metres at the finished floor top and a yaw angle. `setDoors` consumes an accepted fraction and optional seal retraction. Missing seal state renders the gasket retracted; inconsistent moving/deployed state hides it. Leaf and gasket share the same physical hinge transform at glTF `[0.3125, -0.1875, -0.0625]` relative to the frame origin. Positive native Blender Z swing maps to positive renderer Y rotation. No geometry is resized or reconstructed.

`planLayoutDoorways` only admits a 1.25 m clear aperture in a 3 m wall on a 187.5 mm floor. The authored frame itself provides the 2.25 m vertical aperture; existing `Opening.clearance` remains a planar sweep/approach measurement. The full frame is 2 m wide and 250 mm deep. Each aperture requires 375 mm of wall on both ends. The plan returns full-frame wall exclusion spans for the ordinary wall renderer, and rejects overlapping frames, missing jamb support, and intervening wall junctions. Passages remain passages. `createLayoutDoorwayPreview` handles async replacement, stale loads, visibility, deck changes and preview pose updates.

The existing rebuilt Wayfarer has eight 1 m passages. This component does not silently turn them into doors or scale the new frame into those openings. The root game adapter must use accepted compatible openings and the existing construction door state; ordinary live installation remains separately validated.

Browser evidence used the actual 22 native primitive meshes from all four exact files, with retained materials, fixed frame/seat, and shared moving leaf/gasket:

- [Closed assembly](../../output/playwright/shipyard-boundary/doorway250-r004-closed.png).
- [Open assembly](../../output/playwright/shipyard-boundary/doorway250-r004-open.png).

This was a component review inside the existing viewport, with the new unpublished doorway requests routed only in the review browser to the exact local runtime bytes. It is not evidence of the final live candidate. The review session was left at `about:blank` after capture.

## Integrated wall and editor behavior

The actual `layout-hull.ts` lifecycle now loads these doorways with the deck's native wall preview, combines their fit notes, shares wall visibility, includes their meshes when framing the view, and disposes or cancels replaced loads. `doorwayWallSpans` removes the complete 2 m frame span from ordinary native walls and wire guides while preserving the authored 1.25 m opening and compiler result. The native inset planner consumes those clipped spans. The assembled regression verifies every requested native wall footprint against the frame's 250 mm reservation, with no positive overlap.

Admission also checks the complete frame against other wall reservations. A logical aperture can be valid while the full frame would overlap an exterior corner; such a position receives an explicit fit note and no misleading native frame. A 6 × 4 m fixture with a central door is fully covered by the current wall family.

Fresh partition creation now writes an explicit centered automatic wall reservation in the editor's ordinary draft edit. `proposeWallOpening` then remaps unpinned treatment intervals atomically before invoking the unchanged strict compiler. The opening retains its UUID; surviving treatment segments preserve their orientation and metadata. Resize and deletion restore the former wall interval only when the two adjacent treatments agree. Pinned native assemblies and ambiguous restoration require an explicit wall edit rather than silently changing their geometry. New partition defaults and deletion wiring are owned by the editor subtask; the shared remap helper and opener hook are included here.

The separate native-wall disappearance bug was an assembly-wide rejection after the exact Wayfarer path. Equipment movement, hull panel edits and room labels are now independent of wall visualization. Exact Wayfarer structural fields (decks, tiles, partitions, openings and structure) retain their pinned transition requests even when visual assembly placements or map labels change. A structural edit falls through the ordinary native planner, which preserves real unsupported-interface diagnostics. Generic assemblies no longer suppress a valid ordinary wall plan. This visual reuse does not change strict game source admission.

## Bounded game integration foundation

`packages/content/src/doorway250-review-layout.ts` provides the concrete 6 × 4 m two-room review layout: 3 m walls, a 187.5 mm floor, a 1.25 × 2.25 m aperture and the full 2 m authored frame. It compiles under existing slot, room and boundary reservation rules. It is not a published construction instance or pressure qualification.

`packages/sim/src/construction-doorway-motion.ts` supplies the new family's separate conservative leaf obstacle and continuous 90-degree obstruction envelope. It requires the exact leaf hash. Tests read all actual leaf and gasket vertices, including both gasket morph endpoints, then check closed, intermediate and open poses in every quarter-turn orientation. The leaf turns inward in positive native XY yaw. It must not reuse the reflected legacy door's motion convention.

The remaining authority adapter must bind an exact new construction family or qualified fixture, install its normal `constructionDoor` rows, and select this motion geometry by that immutable family binding. Existing actor access, expected revision, obstruction and accepted-state checks remain required. The renderer can reuse `loadLayoutDoorways(...).setDoors(...)` with those authoritative rows. The existing Wayfarer passages are 1 m wide; they remain passages. The old pressure-room proof cannot be reused as proof for the new 250 mm wall assembly. No server door installation or live pressure claim was made by this subtask.

## Validation and pins

Browser workflow follow-up used the frozen r001 source candidate at `http://127.0.0.1:5192/shipyard`, source manifest SHA-256 `88d9228891a2c10aa2a355320c1cb8cc3a32bdfc0979d5b35d82c8e82bd6230a`, with the documented public-help supplement `1101a9c46e5c259d8fef759f12ad4fe71a406b97d6e3e1945a33c58f3005192a`. No candidate files or native runtime geometry were modified. Prior browser asset interception was removed. The review imported the six-floor-only fixture, used actual pointer gestures to draw the partition from (0, 2) to (6, 2) metres, and placed the standard door at (3, 2) metres.

That normal workflow produced zero layout errors, zero native wall/floor/door fit issues, six slab meshes, one native doorway with 22 authored meshes, and 36 inset requests / 162 native wall meshes, with no per-span fallback or wire guides. The Structure inspector showed the actual 1.25 m opening. A single canvas served the viewport; the persistent eight-button layer row remained available in Structure and Objects, and toggling room labels hid them in Objects. The top camera stayed at alpha π/2 and beta 0.000001 during structural construction. Objects then showed the same solid floors and the full authored door assembly using the real 3D orbit control.

Captured and visually inspected at 1600 × 1000:

- [Fresh wall and door, Structure](../../output/playwright/shipyard-boundary/candidate-88d922-fresh-door-top.png).
- [Assembled native walls and shared floors, Objects](../../output/playwright/shipyard-boundary/candidate-88d922-door-assembled.png).
- [Authored native frame and leaf assembled into the wall](../../output/playwright/shipyard-boundary/candidate-88d922-door-front.png).

The r001 development candidate initially logged ten font-file 403 errors because its shared dependency symlink resolved outside the frozen Vite root. No native asset request failed. Root replaced those candidate dependency links with the same pinned font bytes. Root subsequently prepared r002 after removing an unnecessary digest-helper import cycle; this r001 review is not claimed as final r002 evidence. The browser returned to `about:blank` at 02:20:40 UTC and released the GPU slot. Final candidate underside capture and authoritative game evidence remain in the root review package.

At the source handoff, 50 focused tests passed across the slab renderer, native doorway renderer, inset visual planner, native door motion, opening-treatment remap, existing structural proposals, editor structural edits and deletion. The doorway tests import actual native bytes and verify source hashes, shared source geometry, independent gasket state, hinge rotation, malformed input rejection and cleanup. The ordinary opening proposal now passes directly into a valid native frame and wall plan without manually constructing jamb metadata. `npx tsc --noEmit --pretty false` and the scoped `git diff --check` passed. Root retains the full build/check/smoke and exact candidate browser/game gates. Full assembled viewport capture is pending the root's final candidate and shared GPU slot; the earlier captures above remain explicitly component evidence.

| Native part | SHA-256 |
| --- | --- |
| frame | `076c7c0b3854c3ca04ea6a792fa0b4a7a7ead03205521607e2ccca02ec376e77` |
| leaf | `6adeb2aeff19237524c7d6cc0e6761dd8c8f0e3b81219545524fa474da42981f` |
| seat | `ad65ff5381d4fc1cf805aeb9cb54ef814a8e38efc1ee023ca43c7e9c6dbd6cd8` |
| gasket | `e67f461a70867d294a7c225890cd5bb24e279ae1ede6bfca3f5fdc0a25143714` |

| Implementation file | SHA-256 at source handoff after focused checks |
| --- | --- |
| `packages/render/src/layout-floor-slabs.ts` | `55041bfbf77a3fe862c717aa068549328d06efd6ceb93ed6eaede95bc8779df0` |
| `packages/render/src/layout-floor-slabs.test.ts` | `60f65b8e693b671699a0849a30f7c71afbbd783e805c5fcb45b9980c09452dd7` |
| `packages/render/src/layout-doorway-plan.ts` | `5698e1934d0d2399d82910bce51c29ee190310491be5fe5064fe862fe507aff1` |
| `packages/render/src/layout-doorway-preview.ts` | `e3b9931163ab1baa8cef8080adfdc778767c2efa5114287272ac68d650f316a0` |
| `packages/render/src/layout-doorway-preview.test.ts` | `4c3f0106dac3cb6faa0834601dafc60d2b0878e91b3e767ef8a0c0b0179a0a51` |
| `packages/render/src/layout-doorway-walls.ts` | `995af858fd980d84ccb101c03ec4842dcdd75a6f3a06eac7855efc940a503f0d` |
| `packages/render/src/layout-inset-visual-plan.ts` | `bc0c51a88d90110aafb0e676e5fe7ac331e35686dbf5334f94575a9876d3b7e6` |
| `packages/render/src/layout-inset-visual-plan.test.ts` | `bc1585f3204092452b155f0df3a545f7937ffbe5b748842730022df3464eddc7` |
| `packages/content/src/construction-doorway-visuals.ts` | `4e609488faca71ea3b0a187ef7adbe96e22b2f83684b3e5fe200aed9879a197d` |
| `packages/content/src/doorway250-review-layout.ts` | `fad5549a244d42094928df5e63449b4c348bb63018b66165979a6e1563d43cf0` |
| `packages/sim/src/construction-doorway-motion.ts` | `5a9258ae44f62766c5e5ce969c6909052194d3d63d928ed38f9137dedde996f6` |
| `packages/sim/src/construction-doorway-motion.test.ts` | `d18774de9713d5b94962abbbf04894eaa97208ecdeb1540f4f51f41e8aaaf386` |
| `packages/sim/src/layout-opening-treatments.ts` | `647cea1e455c5fd65b681627b78040da3fca4235d37e4ed121065d5e4533c561` |
| `packages/sim/src/layout-opening-treatments.test.ts` | `0d1657005aa74ce6525d2cb698e44e2d6d289acd27b58e4869aa79babfeb477c` |
| `packages/sim/src/layout-structure.ts` | `71a10ca2d4f2a67807c71cce4d9652a74d3831b7d2cb998684cc28271dc35dfe` |
