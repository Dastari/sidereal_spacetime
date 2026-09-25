Current follow-up: [Slots default, fixed cell sizes and subsequent header/character polish](inventory_tetris_and_polish.md). This document preserves the earlier QoL release.

# Inventory interaction and visual QoL

2026-09-09. Implemented, reviewed and active in the normal public game. Owner authorized live UI integration; final artistic sign-off remains unset. Living revisions: `ui.character-status-and-equipment` r004, `ui.inventory-slots` r001 and `ui.feedback` r001.

All three revisions have immutable source, screenshots, validation and capture records registered in the [living library](../../assets/art-library/INDEX.md). Independent agent review passes; each revision is awaiting exact owner artistic sign-off. The review account was signed out and the named browser was blanked and closed after public verification, releasing the shared software-GPU slot.

## Delivered behavior

- Left-click holds an item on the cursor; click a valid target to place it. Dragging works with cumulative movement, including slow drags. R rotates the held item in physical Slots view. Escape or right-click cancels pickup.
- Shift-click quick-transfers between an open world container and carried storage. With no world crate open, carried transfers use backpack/pockets. Right-click offers equip/unequip, quick transfer, open nested storage, rotate and ground drop.
- Backpack icons and the paper-doll backpack slot accept contents. Matching equipment slots equip/swap using existing server rules. Nested packs cannot contain themselves.
- Uniform icon cards use the existing common/uncommon/rare/epic/legendary double inset frames. Names move to accessible labels and hover cards. Cards include descriptions, mass, rarity and preview price/stat bars. Actual storage dimensions remain actual; mock bonuses are labelled.
- Backpacks and crates share category, search, rarity, sort and view controls. Icons is a readable presentation list; Slots preserves physical item footprints and placement. Sorting never rearranges authoritative coordinates.
- Nearby storage opens by clicking its model, without opening the inspector or personal inventory. Take all transfers only what fits; excess stays in the source. Each window keeps an independent preferred size, including after viewport resize. Opening Character does not change a crate's dimensions.
- Character defaults to equipment/preview; identity, attributes, vitals and statistics live on Stats & details.
- Drop on ground from the context menu or by placing a cursor-held item outside UI. The server chooses the standing character's position. Published GLBs appear in the ship world, with rarity nameplates and hover details; click to pick up when in reach. Z toggles nameplates. Dense labels stay in the visible play area; excess is counted until collecting items reveals room.

## Authority and scope

All persistent changes use validated reducers, current revision and operation IDs. Item/backpack/reservoir UUIDs and contents are retained. Ground discovery is filtered by the existing character/lab ownership, same ship, distance and partition visibility; pickup rechecks reach. No client transform, damage, price/economy or cross-character inventory authority was added. Shared crew ground loot is not claimed. Salvage reward-choice crates remain planned, as requested.

Additive normal database publication used `delete-data=never`; no normal database reset or service restart. The managed cold-backup command refused while services were running, so no cold backup is claimed. The existing services were preserved. The immutable public client release is `f36662364a8298de7db3e83e46e2375537fdecbe4aa1636c8b176d534c7f6bb2` at https://sidereal.dastari.net/. Only the managed public-client process changed (3599917→3634614); database3360655, development client3555852 and dashboard3541237 were preserved.

## Sources

Canvas UI: `packages/canvas-ui/src/inventory.ts`, `item-details.ts`, `ground-loot.ts`, `character-sheet.ts`, `windows.ts`, `toolkit.ts`. World rules: `packages/world/src/inventory-operations.ts`, existing `inventory.ts`; pure placement: `packages/sim/src/inventory.ts`. Narrow composition/projection wiring: `apps/client/src/App.tsx`, `packages/net/src/index.ts`, generated bindings, `packages/render/src/ground-items.ts` and render entrypoint. Existing r008 modular bodies and paired r002 handheld publication are preserved.

## Validation and evidence

Final full check passed: **119 files / 548 tests**, typechecks and 75 document checks. Aggregate build, current public client build, `npm run art:check` and isolated `npm run smoke` passed. The only build warning is the existing large-chunk advisory. Smoke verifies persistent drop/pickup UUIDs, exact retries, server-derived position, foreign-character privacy and rejection. Focused tests cover click/drag/context/shift, nested backpack targets, independent windows, filters/compact controls, partial take-all, stale operations, range and seated rejection.

Canvas2D/NullEngine fixture captures under `output/playwright/inventory-qol-*` validate presentation only; their fixture actions do not prove server mutations. Initial `inventory-qol-fixture.png` and `inventory-qol-tooltip.png` are failed/stale setup captures retained honestly. Use the later named connected screenshots for gameplay evidence.

Independent Astra review identified and prompted cumulative drag, child-pack targets, modal interception, compact toolbar, stale hotbar hover, dense ground labels and scene-lifecycle checks, plus larger weapon thumbnails, tighter tooltip header, filter icons and weight bar. The reviewer judged the revised layout suitable for a live QoL iteration; this is not owner final approval.


### Connected acceptance

The named `inventory-qol` session rechecked and acquired the released software-GPU slot. It used the existing private review account and actual authority at the HTTPS development review origin, then verified the compiled normal public release with no query gate. Read-only browser hooks exposed current UI/scene/connection objects; RAF was paused and actual game frames were stepped. SwiftShader reported ReadPixels stall warnings; these captures establish UI/game behavior, not hardware FPS or continuous animation quality. No source GLB, authority snapshot or transform was replaced by the browser review.

- Click pickup left inventory unchanged; right-click equipped the pistol and restored the carbine. Actual drag to the primary paper-doll slot and context unequip also passed.
- Context drop and cursor placement outside the UI both created the scanner at the server character position. Full reload retained its UUID and ground row. Actual nameplate click retrieved it. Z hid/revealed labels; model/root cleanup left zero matching ground nodes.
- Dropping after creating a character preview kept both ground transform nodes in the world scene. Dense128-item nameplate layout has separate compact, nonoverlap and overflow-count test coverage.
- Keyboard walking navigated the narrow bridge and storage doorways to approximately(-2.380,2.891). Initial long waypoint attempts hit physical jambs; nearer waypoints succeeded. Initial crate projections hit an opaque hull/actor, so the reviewer orbited and clicked a genuinely visible crate surface. Opaque geometry blocking was preserved.
- A visible storage model click opened just that crate. Shift-click moved an item into the backpack without its window open. Slow pointer dragging returned it. Take all moved10 items and retained8 that could not fit; contents were restored through the validated move reducer.
- Opening Character preserved the crate's exact620×622 logical rectangle. Equipment and inventory retained620px and500px preferred widths. Resize restored the inventory's500px width.
- Actual backpack icon/tab and paper-doll backpack transfers are covered by focused tests; connected pointer drops specifically verified the Backpack tab, paper-doll backpack and primary weapon slot.
- Rapid typing produced exactly `scanner` and one result. Ctrl+A replacement produced `medkit`; clear/Enter released text focus. Category filtering and physical Slots view worked. A first scripted search exposed lost characters between repaints and was fixed before final acceptance.
- At700×580 the action bar is hidden while inventory windows are open, avoiding item overlap; it returns all eight action positions when windows close. At390×600 all filter controls remain inside the viewport and scrolling reveals the full item list.
- All71 projected review items were restored to their baseline placements, including the original seven starter UUIDs; zero review ground drops remain. The character's movement was ordinary server-validated review movement. Appearance remained revision4, male/crest/medic.
- The exact compiled public UI bundle `index-CcxojKAE.js` was loaded at https://sidereal.dastari.net/. Actual rendered public Character and Inventory windows measured620px and500px; the original r008/r002 models remained installed.

Evidence: `output/playwright/inventory-qol-public-release.png`, `inventory-qol-crate-alone-live.png`, `inventory-qol-armor-tooltip-live.png`, `inventory-qol-weapon-final-live.png`, `inventory-qol-stats-final-live.png`, `inventory-qol-ground-live.png`, `inventory-qol-compact-final-live.png`, `inventory-qol-narrow-final-live.png` and `inventory-qol-narrow-scrolled-live.png`. The earlier compact screenshot is retained as failed overlap evidence. Curated results, source snapshot and captures are copied into the living revision evidence, with the [independent review](inventory_qol_review.md).

### Follow-up boundaries

Owner final sign-off is unset for all three revisions. Minor narrow-screen polish remains: shorten the rarity label and wrap the instruction hint. Salvage reward choice, shared crew ground loot, item selling, consumable effects and authoritative bonuses remain outside this pass. Original component art and pose fit/playback limitations retain their existing ledgers.

The library refresh encountered another specialist's unfinished boundary-kit revision using `state/notes/artifacts` fields. The catalog reader now accepts that explicitly in-progress record in memory, preserving its source JSON and refusing to invent coverage or approval; the complete index/hash validation then passed. UI evidence covers only each revision's listed reference appearances, not every unrelated notification or stacked-item variant in those broad provisional families.
