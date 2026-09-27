Current follow-up: [fixed Tetris grids, storage headers and character colors](handoffs/inventory_tetris_and_polish.md). The earlier iteration history below is preserved.

# Inventory interface iteration

Current implementation: [2026-09-09 inventory QoL handoff](handoffs/inventory_qol.md). Icon-only rarity cards, hover details, independent windows, filters, click pickup, Shift transfer, context actions, paper-doll targets and persistent ground drops supersede the historical UI below. The following sections preserve earlier iteration evidence.

The interface uses the cyan cut-corner frames and dark blue wells from `reference/art/ui-elements-5.png` and `ui-elements-3.png`. Its paper doll reports actual hand/back equipment and carried mass, without invented combat statistics. Item silhouettes are original small Canvas2D drawings, not extracted reference-sheet graphics or photographs of the equipped crew model.

`packages/canvas-ui/src/inventory.ts` consumes authoritative item/container/hotbar snapshots and emits intents. It never edits the supplied inventory. Physical storage footprints span multiple cells. Pointer dragging previews snapped placement in cyan/red; rotation, equipment drops and click-item/click-cell placement are supported. Wider boards include a second accessible grid; smaller boards select containers with header arrows. Liquid reservoirs show litres rather than fictitious grid cells. The server must still validate access, weight, nesting and expected revision for every action.

The inventory opens with I or its HUD button; 1–5 activates assigned tools. The five-slot hotbar can be assigned from the selected item and cleared individually. Opening the inventory blocks gameplay input while the world continues. Overflow clips both pixels and hit targets, with wheel scrolling and a visible scroll button. CanvasUI now has reusable drag completion/cancellation and shortcut hooks.

Real-browser Canvas2D reviews at the required tailnet client URL are `output/playwright/inventory-desktop.png` and `output/playwright/inventory-compact.png`, both inspected. The first iteration had excessive empty space; the final desktop review includes a second accessible container panel and selected-item controls. The compact capture verifies clipped overflow with a reachable scroll button; `inventory-compact-scrolled.png` verifies the bottom controls and hotbar remain reachable. A browser fixture also invokes the actual drag completion callback and asserts a carbine move intent to cell (4,2), while the supplied snapshot remains unchanged. These isolated presentation fixtures are not evidence of a live reducer transaction. The full live authoritative equip/move/unequip review remains an integration acceptance check.

Validation: TypeScript passes; all 10 CanvasUI tests pass, including rotation/edge contact, occupied-cell rejection, liquid/grid distinction and self-containing storage rejection. Full `npm run check` currently reaches five unrelated in-progress planet geometry test failures; root coordinates the final build and authoritative smoke run.

## Live authoritative acceptance — 2026-09-08

The independent `inventory-live` browser connected to `http://sidereal.tail7a58a6.ts.net:5173/` and created the persistent test character **Inventory Review** through the actual entry UI. Vite HMR was blocked only in this diagnostic browser; the `/v1/` database websocket stayed connected. RAF was paused while the planet reviewer used software GPU, then normal presentation callbacks/crossfade observers were advanced for static gameplay captures. No inventory snapshot or authoritative transform was edited by the review.

Passed against the normal published database:

- Automatic one-time kit: Field backpack equipped; carried mass **9.7 / 32 kg**. Reload retained the same item UUIDs, equipped pistol and hotbar assignment without duplicating the kit.
- `I` opens/closes inventory. Actual pointer selection and Equip load `equipment-placement:carbine` (seven enabled authored mesh primitives). Equipping the pistol swaps the carbine back into a legal grid placement and loads `equipment-placement:compact-pistol`.
- Returning the carbine to a grid cell produces **Hand · empty** and removes every `GEO-carbine_*` primitive. Assigning hotbar slot 0 and pressing keyboard `1` equips it again through the server.
- Actual pointer rotation and dragging changed the carbine from an 88×180 pixel footprint to 180×88 at the new grid row. Dragging over occupied cells reports **These slots are occupied** and preserves its previous rectangle.
- Resize from desktop to **700×580** leaves both the visible canvas and HUD texture at 700×580. The scroll control reveals Rotate, Equip and all five tool hits.
- Carried liquid container reports **2.0 / 5 L**, `fuel`, and no item-grid hit targets.

Inspected artifacts:

- `output/playwright/inventory-live-pistol-held.png`: actual imported pistol held by the crew, **Idle-Pistol weight 1**.
- `output/playwright/inventory-live-carbine-held.png`: actual imported carbine held by the crew, **Idle-Rifle weight 1**.
- `output/playwright/inventory-live-board.png`: live authoritative inventory composited over the actual game scene.
- `output/playwright/inventory-live-compact.png`: resize review; subsequent hit inspection verifies bottom controls become reachable on scroll.
- `output/playwright/inventory-live-authored-icons.png`: actual live HUD raster isolated over a dark background without another WebGL render. Loads the published original Blender equipment PNGs, retains authoritative equipment/mass after reload, and defaults to the equipped backpack.

Acceptance fixes: equipped backpack is now the default container; actual source PNG icons load with a vector fallback; server errors appear in a dismissible inventory notice rather than behind its modal; item hit labels use their actual names. TypeScript, all 10 CanvasUI tests, and the document check passed after these changes. The root agent owns the final full build/authority smoke gate.

The owner subsequently requested a second UI pass with separate movable character, inventory and container windows. CanvasUI ownership has been handed to the dedicated UI agent. That pass should preserve the live acceptance above and improve PNG fitting: crop using the icon manifest's `boundsPixels`, rotate long rifle thumbnails for portrait footprints, and add thumbnail treatment to equipment slots. The generic paper-doll silhouette remains a presentation foundation rather than an actual crew portrait.
