# Storage fixture physical fit audit

Audit and coordinated binding update, 2026-09-08. The integration owner selected the 2×2 floor arrangement below; only the four authored server XY definitions and regression tests were updated by this task. The integration owner applies the visual placement transaction and normal publication. No inventory rows or approved assets were modified.

## Current mismatch

The installed standard-small neutral bounds are X [-0.3305,0.3305], Y [-0.2805,0.2050], Z [0,0.5115] metres. Existing placements retain the legacy lower Z=0.25 and upper Z=1.0. Therefore the upper neutral underside floats 0.2385 m above the lower neutral maximum. The legacy voxel body filled the old 0.75 m pitch; it did not include a shelf or rack. The current floor manifest has top Z=0.1875, so even the lower pod is 0.0625 m above the floor. Preserving old transforms did not preserve support after replacing the model.

Approved-source fit records specify small pitch0.464 m, standard-medium0.904 m, and high-value-medium0.744 m. Each corresponding r003 `fit.json` explicitly records `filled_stacking_approved:false`. Their overlapping neutral bounding boxes at the designed pitch reflect interlocking feet/receiver geometry, not automatically an invalid stack; conversely a broad AABB cannot establish support, structural capacity or operational clearance. The reviewed carrier is not a production rack installed in this ship. Do not solve the gap by scaling the approved art or declaring a filled stack load-bearing.

## Selected correction: 2×2 floor arrangement

The integration owner selected four floor-standing small pods at +PI/2 radians, Z=0.1875. Old lower IDs (`...-0.25`) move to X=-4.0625; old upper IDs (`...-1`) move to X=-3.3125. Both pairs retain their existing Y=2.0625 and Y=3.4375 respectively. Container UUIDs, item contents and binding IDs remain unchanged. The existing upper/lower strings are legacy IDs, not a height claim.

Rotated outer-row X extent[-4.2675,-3.7820] and inner-row[-3.5175,-3.0320] leave0.2645 m between neutral bodies. The two Y intervals are[1.7320,2.3930] and[3.1070,3.7680], leaving0.714 m between pairs. All four lie inside the existing furniture collider[-4.45,-2.95]×[1.6,4.4]. Floor contact is exact at0.1875 and top0.699. No collider widening or scaling is needed.

Actor X=-2.5,Y=2.75 remains outside the furniture collider with its0.3 m radius, and within1.8 m of all four pod centres. At X=-2.2 only the aisle-facing row is reachable, as the new regression test proves. The server uses the new authored binding locations despite legacy persisted container coordinate columns, so no container rewrite or revision churn is required. Partition LOS and approach X=-2.25 remain unchanged.

The rear row's physical lid sweep remains unvalidated and may intersect the front row: there is only0.2645 m between neutral bodies versus a0.52 m proposed opening clearance. This slice opens an inventory window, not the lid; do not claim articulated access or load-bearing stack approval. The alternative single row below provides better future opening access if that feature is later required.

## Alternative single row: four floor-standing small pods

Retain the two baseline and two red approved assets, all four stable placed IDs and their existing container bindings. Put them in one row along the outer storage wall. Rotate each placement by +PI/2 radians in authored XY so its local front (-Y) faces the aisle (+X). Rotation fields are radians, not quarter-turn indices.

| Existing placed ID | Position X,Y,Z (m) | Rotation |
| --- | --- | --- |
| room-storage-container-2.15-0.25 | -3.6875, 1.96875, 0.1875 | +PI/2 |
| room-storage-container-2.15-1 | -3.6875, 2.65625, 0.1875 | +PI/2 |
| room-storage-container-3.5-0.25 | -3.6875, 3.34375, 0.1875 | +PI/2 |
| room-storage-container-3.5-1 | -3.6875, 4.03125, 0.1875 | +PI/2 |

All coordinates use the existing 1/32 m placement lattice. Their rotated neutral X extent is [-3.8925,-3.4070]; their collective Y extent is [1.63825,4.36175]. Neighbouring neutral geometry has 0.0265 m clearance at 0.6875 m pitch. Top height is0.699 m. This lies within the existing storage furniture collider X[-4.45,-2.95], Y[1.6,4.4], avoiding a new collision footprint. The room partitions bound usable Y approximately[0.875,5.125]. This is a low row of small pods, not a tall rack; a visual review must accept that composition before claiming fidelity.

Keep approach X=-2.25 and update each authored approach Y to the new placement Y. Consumption continues to use distance to its bound authored placement and partition LOS to its approach. The occupied furniture collider still permits an actor at X approximately-2.4; distance to the pod centre is then1.2875 m at matching Y, within1.8 m. No inventory capacities change. Rename visible upper labels if desired, but do not rename IDs or recreate containers. The original string IDs are stable identifiers, not current coordinate encodings.

The present visual lid is closed and has no opening reducer. A future physical opening requires a swept lid/handle check; the specification's0.52 m opening-clearance proposal is not a validated installed sweep. Preserve this limitation instead of inventing an opening animation or rack.

## Larger alternative

Four unscaled standard-medium pods can fit on the floor in the room's full longitudinal span, for example X=-3.6875, Y=[1.4375,2.375,3.3125,4.25], Z=0.1875, rotation0. Their combined neutral Y interval is[0.9870,4.59585], within the partitions. Their X interval[-4.2180,-3.1570] fits the outer furniture strip. However this exceeds the existing furniture collider Y[1.6,4.4], so requires a reviewed collider adjustment and changed approach positions; the front faces are not toward the aisle. Quarter-turning four medium pods consumes almost the whole4.25 m room length with insufficient comfortable placement margins. This is a larger integration than the recommended small-pod row.

Two-high standard-medium or high-value-medium would provide a taller silhouette, but the source's filled-stack rating remains unresolved. Approving the exact loaded stacking use or authoring an approved supported rack is a separate decision; the gameplay inventory's500 kg development limit is not evidence that the art can support that load.

## Integration and acceptance

1. Update only the four placement transforms and the four `LAB_STORAGE_FIXTURES` XY/approach coordinates in one coordinated release. Reuse asset dimensions and proxy geometry. Preserve binding rows and container/item UUIDs; no starter-kit recreation or content transfer is necessary.
2. Run placement fitting using transformed conservative proxies against other cargo and retained hull/partition fitting proxies. Floors require support/contact semantics, not rejection of every touching surface. Do not inflate cargo geometry to the old voxel body.
3. Keep the existing conservative furniture collider for the recommended row. Recheck valid aisle approach for each pod and blocked cross-partition approach. Moving a binding's authored location must immediately change view/consume reach without changing inventory contents.
4. Capture actual installed front, aisle and overhead views showing all four floor contacts and no interpenetration. Validate selecting each pod opens its existing container UUID. Repeat a store/retrieve and reload check; retain development capacity labels.

Evidence read: installed cargo/floor manifests; `packages/content/src/interior.ts`; original storage branch in `voxel-wayfarer.ts`; standard-small, standard-medium and high-value-medium r003 `fit.json` and small specification. Geometry figures are neutral bounds, not engineering ratings or proof of an articulated sweep.

Validation of the selected 2×2 binding update: project typecheck and four focused tests passed; isolated `npm run smoke` passed at2026-09-08T13:51:41.143Z, including all-four reach, store/retrieve, range loss, private filtering and the existing flight/interaction/combat gates. The smoke now uses closed-loop normal movement to return to the farther outer row instead of assuming an800 ms walk always restores access. Normal publication and visual placement acceptance remain the integration owner's coordinated steps; the earlier browser screenshot predates this floor arrangement.

## Final installed layout browser gate

The integration owner normally published the new binding definitions and copied the exact floor-standing placement manifests. Actual tailnet App review then passed with these four nodes at the selected XY/Z and +PI/2 rotation; all were enabled, using two baseline and two red approved small assets. `output/playwright/cargo-floor-final-close.png` is a1280×760 actual framebuffer captured using normal orbit and wheel zoom to the existing closest Deck view (camera radius approximately20.04 m), not model scaling. It shows all four supported pods and their native lid/frame details. `cargo-floor-final-four.png` and the small `cargo-floor-final-four-detail.png` are supplementary wider/cropped evidence. The new hull material batches loaded without the prior attribute mismatch; hull windows, panel outlines and surface details remain visible. This is visual preservation evidence, not a measured performance gain.

An actual visible lid pointer click opened the existing B container UUID. Dragging the same scanner from backpack into it advanced revision14→15. A complete page reload preserved the same scanner UUID, rotation and crate cell. A second actual lid click and pointer drag retrieved it to the original backpack cell(3,0), rotated, at revision16. `cargo-floor-final-stored.png` and `cargo-floor-final-pointer-retrieved.png` record that UI cycle. This supersedes the earlier pass's missing post-reload pointer retrieval.

The initial range probe was attempted while a menu still blocked walking: the actor remained in reach, so that move correctly succeeded and was immediately restored, advancing revisions17→18. After closing the menu and walking through normal keyboard intent to approximately(-0.0784,2.9179), all four world-container projections disappeared. The same stale destination request then rejected `Item or destination is out of reach`, with revision18 unchanged. The actor walked back to exactly its starting(-2.4493779803605147,2.7798059844702294). Scanner UUID and its original backpack(3,0)/rotation, carbine hand UUID and backpack equipment UUID were retained. No resets, item recreation, balance overrides or authoritative transform writes occurred.

Browser transport used exact-server-response HTTP pass-through to avoid Chromium local-network issues; the real database WebSocket/reducers were untouched. A read-only connection handle provided assertions. During loading RAF was held; after the final gameplay loop existed, native RAF was restored and engine beginFrame/endFrame drove on-demand real renders, avoiding software-GPU saturation. A read-only scene ray scan identified an actually visible lid pixel for the post-reload click; it did not bypass occlusion or invoke selection directly. Browser cargo-final was closed and GPU explicitly handed to the next reviewer. No runtime liquid opening or rear-row lid sweep is claimed.

The same review character subsequently walked through the storage doorway and central aisle using ordinary keyboard intent to approximately(0.0488,9.4641). Actual E interaction occupied the original pilot station UUID `552a9ec4-3a15-4e3d-b09d-46ea0f5cf71c` at its migrated(0,10.25), while retaining Deck camera mode. This verifies the fitting layout still permits the storage-to-helm route; final exterior finish screenshots and return-to-start are recorded separately when completed.
