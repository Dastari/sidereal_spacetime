# Character interface reference pass

Status: In progress; owner authorizes autonomous implementation and live client integration after independent visual review. This authorization is not an invented final asset sign-off.

Sources inspected: `reference/art/ui-elements-5.png` and `ui-elements-3.png`.

Design: retain Barlow / Barlow Condensed, navy glass `#06172e`, inset blue-black `#030b1c`, cyan rails `#39dfff`, pale text `#e8f4ff`, muted blue `#94b2cf`. Rarity adds silver, blue, violet and gold rather than replacing all selected frames with cyan. Separate clipped contours and their dark gutter remain visible at small sizes. Health is red, shield blue, energy yellow, stamina cyan/green. Use luminous detail where the reference uses it; keep most of the character viewport transparent.

Wide character window: identity/vitals/attributes | rotating crew and equipment | tabbed statistics/resistances. On smaller screens, stack these sections inside the existing scrollable movable window. Inventory remains a separate movable window with its existing authority-driven grid/drag/drop behavior. Bottom action row groups eight visual positions and a distinct pair of quick slots. Existing five server hotbar bindings remain functional; extra positions must accurately describe their presentation-only state. Quick item shortcuts must use existing validated operations or open the actual item for inspection, never fabricate consumption.

Mock statistics are a stable, named presentation dataset, clearly identified once in the character sheet. They do not overwrite replicated health, weapon energy, carry mass, progression or inventory. Rarity styling is presentation metadata pending an authoritative loot-rarity contract.

Ownership: root integrates `packages/canvas-ui`; item-frame agent owns new reusable frame/icon primitives; hologram agent owns new renderer preview/disc modules; independent reviewer owns `ui_reference_review.md`. The existing world renderer, database, assets and other agents' work are preserved.

Acceptance requires independent reference review, real desktop and compact client captures, actual rotation/animation and inventory/quick-slot interactions, reduced-motion and close/reopen lifecycle review, `npm run check`, and `npm run build`. Record iterations and limitations below as evidence arrives.

## Revision history and current integration

- **r001:** three-column sheet, four vitals, initial cosmetic icons, chiseled rarity frames, eight-position bar/two quick slots and native holographic portrait. Independent review requested aligned stat values, visible captions, readable unassigned actions and recognizable equipment silhouettes.
- **r002:** addressed those desktop findings; independent desktop reference match accepted. Real browser actions assigned/equipped the existing carbine and rebound a quick slot to the scanner. Reduced motion kept the portrait PNG unchanged across elapsed time, while requested rotation still changed it. Compact review exposed a clipped full-body portrait and stale selected-item detail; both were retained as failed small-screen evidence.
- **r003:** fits the full character/disc and rotation controls into short viewports; adds dismissible item details and clears selection when the last inventory window closes. Inventory window state, authority and quick bindings remain separate. Final independent review and evidence are tracked in the canonical ledger.

The gallery uses actual production frame/glyph functions and published equipment thumbnails, including the legendary rifle absent from the real starter inventory. It is labeled a presentation gallery, not live ownership. Rarity is also present in accessible item labels and the selected-item detail. Anatomy icons are explicitly cosmetic `Appearance` slots; actual hand/back items drive the native GLB portrait.

A blocking native cargo loader defect surfaced during whole-client review. Batching by material alone attempted to merge UV-bearing and UV-less source meshes. The narrow correction additionally partitions by complete vertex-channel signature, preserving all channels and materials. A mixed-channel regression and both actual placed cargo GLBs pass. No asset sources/exports or authority rules changed.

## Functional boundaries

`C` opens character/equipment/stats; drag the character or use the arrows to rotate. `I` opens inventory. Existing server hotbar bindings `1–5` remain operational; positions `6–8` are explicitly reserved/disabled. The two quick slots use `9` and `0`: when windows are closed they open the bound actual item for inspection; while selecting an item they bind it, and item drag/drop onto a quick slot also binds it. They do not add consumable-use reducers. Bindings are local to this UI session, defaulting to actual available medkit/power-cell instances; they do not grant items.

The illustrative health/shield/energy/stamina, attributes, progression, gear power and statistics are presentation data in `character-data.ts`, marked `Preview statistics · mock values`. They never replace replicated combat health, weapon energy, inventory mass, movement or progression. Rarity is presentation metadata pending a server loot-rarity contract. The inventory keeps authoritative UUIDs, mass, multi-cell footprints, equipment, validated move/rotate/equip operations, storage reach filtering and five server bindings.

Reduced motion includes the disc/portrait as well as the camera. Async portrait assets invalidate a static UI when ready. No portrait frames are rendered while its viewport is hidden; the offscreen engine is disposed with the UI. The effect is a two-triangle transparent projection with actual shader rings, electrical traces, subject-only cyan lower-body light, a 256 px reflection texture and bounded bloom. Sources reuse the current authored crew and held-equipment GLBs. Maximum portrait target is 640 px and render cadence is capped at 30 fps; this is a resource limit, not a measured gameplay performance claim.

## Browser provenance and release boundary

The real client was reviewed at `http://sidereal.tail7a58a6.ts.net:5173/` in the dedicated `character-ui-review` Playwright session. A browser-only route selected real database `sidereal-character-ui-review-20260908`, created with the existing `scripts.dev.publish(database=..., reset=False)` helper. Actual UI/reducers created the test character/starter kit, equipped the carbine, and assigned the server hotbar. No inventory snapshot was fabricated. The normal development database had older schema than concurrently generated bindings; it was not reset or incidentally migrated by UI review.

The software GPU's requestAnimationFrame was paused in that browser only; normal registered world-frame callbacks and CanvasUI/portrait rendering were stepped for authentic still captures. This tests visual composition and input semantics, not hardware FPS. Early incomplete/failed loading captures remain preserved separately from the accepted evidence. The standalone rarity gallery has its own Canvas2D canvas and never changes main game state. The build prepares client and dashboard separately; no reference images or draft art are published.

The owner explicitly authorizes live UI integration after suitable independent review. That authorization does not invent an owner final sign-off for this exact art revision. The living design ID is `ui.character-status-and-equipment`; start at `assets/art-library/INDEX.md` for current revision, evidence, feedback and final-signoff status.

## Final acceptance — r003

Independent `ui_reference_review` inspected the final desktop, inventory, compact character/rotation/stats and four-rarity gallery and concluded **suitable reference match, no further blocking UI refinements**. This is recorded in `ui_reference_review.md` and the living ledger; owner final art sign-off remains unset.

Final real-browser results: scanner equip succeeded, `1` restored the bound Epic carbine, actual power-cell drag onto quick slot2 succeeded, and `0` opened that power cell. `9` opened the actual medkit. Compact rotation changed the preview from -0.3 to 0.223599 rad. Dismiss and last-window-close selection clearing both passed. Reduced-motion portrait pixels remained identical across elapsed time; deliberate rotation changed them. Hidden portrait frame ID stayed21→21 across three whole-game frames. The final world reported loaded with a ready real isolated database connection and no asset error.

`npm run check` passes **236 tests across65 files** and all documentation/provenance checks; `npm run build` and `npm run art:check` pass. The earlier assembly/proxy and newly landed staged crew-pose failures were resolved by their active owners; failed check logs are preserved rather than erased. Browser is closed after review. The accepted screenshots and all meaningful prior attempts, capture recipes, source bundles and validation records are retained in the art-library revision evidence.
