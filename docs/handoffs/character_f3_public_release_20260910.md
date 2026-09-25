# Approved character, pose and F3 public release

Status: live at https://sidereal.dastari.net/ with normal provider login and no query gate. The owner approved the current art and publication, then explicitly instructed **“Don't backup.”** No backup, world publication or database restart was performed for this release. Dashboard and development services retain their existing processes.

The public client now contains the r003 paired handhelds/pose corrections, modular r008 character/armor bundle, combat cursor and F3 skeleton/light/collision/GI controls. Lighting and Shadows no longer hide native walls or furniture: their original cloned materials are registered with the scene so shader settings update normally. Existing inventory/UI and refit behavior are retained.

## Exact release

| Artifact | SHA-256 |
| --- | --- |
| Public client tree | `8246fafc6e13048bd1eaabd5a63d6c06dc9ca1ba983de4bdb6e466de676c4a35` |
| `/assets/index-B4bNcXSU.js` | `492d8bfb7e1abfc0a9a03aab3c2d7887e8342fe6182f3c5f4afdbb20f6d72bc9` |
| Existing live world, unchanged | `2ade8d75a75f75e5d555c8f2c3a666c69c736300dff13611dd7964ea6984ac8c` |
| Previous retained client | `f9e323997ab7319a1ec52b76cc703eb40c7d8813119977432c64d272a0d0ec67` |

The isolated source checkout is `.runtime/release-checkouts/combat-r003-owner-release`, based on `a1b5052c` with33 recorded renderer/CanvasUI/content/helper overlays. It retains the HEAD generated bindings matching the already live refit world. Ongoing cargo authority and its new generated bindings were excluded because they belong to a separate unfinished release. Source hashes, exact ten r003 files plus the modular GLB HTTP hashes, staging/activation records and private data audit are in `.runtime/releases/combat-r003-owner-release/`.

Activation used the managed prebuilt-artifact path and expected-live/staged SHA guards. The actual live module bytes and database identity were checked before and after. The database process stayed running; only the public-client service changed process to serve the new immutable build.

## Approval and validation

The exact owner statement was: “I'm happy to confirm all art, you can push all changes to the live game please.” Approval is recorded against [r003 paired art](../../assets/art-library/designs/crew.animation.aim/revisions/r003/owner-approval-20260910.json) and the [installed r008 bundle](../../assets/art-library/character-components/publications/r008/owner-approval-20260910.json). This approves the delivered art; it does not fabricate missing playback/performance evidence or sign off unrelated reference-only catalog designs.

The isolated release passed TypeScript,1,199tests/204files and77document checks, client build and art validation. The preceding combined workspace passed1,231tests/205files and full build/art checks; that larger count included other development tests. Missing historical screenshot links in the first isolated document check were supplied from11.6MB of pinned existing evidence; the final aggregate check passed without skipping or weakening checks. Existing bundle-size warnings remain.

Normal public authentication, complete2210-mesh scene, removal of the loading/inert cover, actual paired r003 requests and the character window were reviewed in a hardware browser. [The character capture](../../output/playwright/combat-r003-public/normal-public-character.jpg), [Lighting/Shadows Off](../../output/playwright/combat-r003-public/normal-public-lighting-shadows-off.jpg) and [debug overlays with GI Off](../../output/playwright/combat-r003-public/normal-public-overlays-gi-off.jpg) were independently reviewed. There were no authentication, request, database or asset overrides in this public check. A few actual render callbacks were advanced during background preview startup/capture; this is not sustained performance acceptance. The normal Account → Sign out flow completed and the named review tab was blanked.

The data audit found no added/deleted rows. All190containers, four appearances,95hotbars and27durable character records matched. Four of709existing items changed placement/equipment fields and one inventory revision advanced76→79; accepted transfer/equip receipts fully explain these concurrent player actions. Item UUIDs, definitions, quantities and payloads were unchanged. Do not call the entire inventory byte-identical while players are actively using it.

## Continuing technical work

Art approval is complete for the delivered revisions. Clean continuous acquisition/gait/sprint/seating playback and crowd-performance measurements remain technical follow-up; exploratory captures do not establish those claims. Collision debugging currently projects admitted static walking footprints, not moving cargo/carrier support or all3D traversal volumes. The original hip-held heavy-tool stance remains available as its own profile. See [the integration contract](combat_pose_r003_integration.md) and [F3 coverage](../render_debugging.md).

For a client correction, preserve this release and the compatible prior client; use the guarded managed client activation path. No schema downgrade, database restore or independent cargo-world publication belongs to this client release.

Post-release catalog note: a concurrent new reference, `reference/art/characters-facial-assets.png`, appeared after the approval/release snapshot. The final global catalog check correctly reports this source as unindexed; there are no removed reference files. This does not change the passed installed-runtime art validation or the approved released artifacts. Catalog that new source separately; do not call it approved or shipped by this release.
