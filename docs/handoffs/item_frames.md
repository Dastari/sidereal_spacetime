# Item frames and stat glyphs

Status: implemented reusable Canvas2D primitives; integration and combined reference review are owned by the coordinating UI agent. Date: 2026-09-08. This is not an owner art sign-off.

## Source direction

Inspected the actual `reference/art/ui-elements-3.png` and `reference/art/ui-elements-5.png`, using the frontend-design skill. The design adopts their sharply clipped corners, narrow paired inset borders, luminous corner shoulders, quiet dark item wells and readable rarity hierarchy. The muted common frame stays silver while rare uses cyan-blue; epic is violet, legendary gold, and optional uncommon green. Existing typography, hit areas and inventory authority remain with the integrating UI.

Design tokens: night well `#020c19`, common silver `#9db5d0`, rare cyan `#27cfff`, epic violet `#c065ff`, legendary gold `#ffcc42`, uncommon green `#33e894`. Two inset traces stay visibly separated by a dark gutter. Restrained bloom serves the rim and action glyphs, rather than obscuring the inventory image. Animated selection is opt-in.

## Files and APIs

- `packages/canvas-ui/src/item-frame.ts` exports `ItemRarity`, `ItemRarityPalette`, `ItemFrameOptions`, `ITEM_RARITY_PALETTES`, and `drawItemFrame`.
- `packages/canvas-ui/src/hud-icons.ts` exports `HudIcon`, its alias `HudIconKind`, `HudIconOptions`, and `drawHudIcon`.

```ts
drawItemFrame(ui, rect, {
  rarity: "epic", // common | uncommon | rare | epic | legendary
  selected: false,
  hovered: false,
  focused: false,
  disabled: false,
  empty: false,
  // time: elapsedSeconds, // Optional selected-tab pulse only.
});

drawHudIcon(ui, iconRect, "shield", {
  color: "#27cfff",
  glow: true,
  filled: true,
});

const label = ITEM_RARITY_PALETTES.epic.label;
const textColor = ITEM_RARITY_PALETTES.epic.edge;
```

Every palette has `label`, `edge`, `bright`, `shade`, `glow`, and `wash`. There is no `rim` field. Icons: heart, shield, bolt, stamina, scan, repair, dash, crosshair, medkit, cargo, flame, radiation, emp, corrosion, kinetic, gear. Their 24-unit vector geometry scales to the supplied rectangle without fonts or external image requests.

Draw frames **before** item imagery and count/key labels. Keep imagery inside the inset; a minimum 6 px content gutter works at 40 px slots. The frame includes no hit registration, input handler, text, item rarity inference, effect timer or server mutation. Continue to register the enclosing rectangle through the existing CanvasUI interaction system. Convey rarity through a text label in item details as well as colour. Disabled frame alpha affects the frame only; callers also dim content when needed.

Selected frames preserve rarity and add a bright lower tab; hover highlights opposed corner shoulders; keyboard focus has a separate white dotted outline; empty slots have quiet crossed diagonals. The halo is clipped to 3 px outside the frame. Every function restores the drawing context, and flame cutouts use even-odd fill so the HUD below is preserved. Reduced-motion callers omit `time`.

## Verification and evidence

`npm run typecheck` passed after adding the two modules. No authority or content definitions changed. No low-value implementation-mirroring tests were added for these visual primitives; combined inventory interaction checks remain with the coordinating agent.

A real Chromium Canvas2D capture imports the actual TypeScript modules through Vite, then renders five rarity columns at 40 px hotbar scale, 104×136 px item scale, and 104×220 px multi-cell scale. It also includes hover, selected, keyboard-focus, disabled and empty states, plus all sixteen glyphs. This is a component review, not a screenshot of the integrated game client.

- Screenshot: `output/playwright/rarity-frames/frames-r001.png`
- Reproducible browser capture: `output/playwright/rarity-frames/capture.js`

The screenshot was visually compared with both references: clipped facets, double insets and distinct rare/common hues remain readable at the smallest size. The final integrated screenshot still needs the independent reference reviewer requested by the owner; this handoff does not claim that approval.

The coordinating agent owns imports/exports and changes to `inventory.ts`, `index.ts`, and `toolkit.ts`. These files were intentionally outside this bounded implementation task. Full-project `npm run check`, `npm run build`, live client review and publication are coordinated with the complete UI change.

## Shared assembly gate audit, 2026-09-08 23:17–23:19 local

This was a read-only inspection requested during UI integration. No runtime asset, proxy, placement rule, service or database was changed by this audit.

The earlier full gate and the independently recorded `output/playwright/ship-layout/assembly-isolated.log` failed two existing assembly tests. The second reported unavailable occupancy during the cargo support test. `docs/active_agent_ownership.md` already records the same two failures after a concurrent catalog/proxy update. These are shared assembly integration findings, not Canvas2D regressions.

The audit reran `npx vitest run packages/content/src/assembly.test.ts` at 23:17:52. **The current snapshot passed four tests and failed one.** Cargo support now passes, and every placement in the current `wayfarer.json` has an occupancy source. The earlier missing-proxy result is historical; the catalogs were updated again before this audit. Their current hashes were:

| File | SHA-256 |
| --- | --- |
| `assets/runtime/assembly/catalog.json` | `a7e35b65a37b4415d6e6303eefefdd10e25bcfa6d38dedc765f35676eb5c2931` |
| `assets/runtime/assembly/catalog.voxels.json` | `7ad46f6981c125d33043f4910b19a5e689c2d19caffcba218c61c1b54aea65d3` |
| `assets/runtime/assembly/wayfarer.json` | `9a1b55119c78531a70ac49a96b931da9cb411f7e4a3811d6b24fca08625553f3` |

The remaining failure is `compiled default assembly has no occupied overlap despite intersecting part bounds` at `packages/content/src/assembly.test.ts:56`. Exact cause:

- `floor--2--4` uses new mapped square `part-a3f5c1c3caa171a94d6c`, positioned at `[-5, -9, 0]`. Its proxy fills a 2 × 2 × 0.1875 m rectangular slab: 3,072 occupied cells at 0.0625 m resolution.
- `wall--2--4` uses retained wall `part-a086c1f719d417b167f3`, positioned at `[-4, -8, 0]`, with its local lower bound `[-1, -1, 0]` and 10,556 occupied cells.
- Decoding and transforming both proxies yields **309 shared cells**, or 0.075439453125 m³. This is occupied-volume intersection around the wall foot; it is not merely overlapping visual bounding boxes or numerical contact tolerance.
- `placementError()` therefore correctly reports `Placement overlaps wall  2  4 (wall--2--4). Snap to a free face or move the part.`

Follow-up belongs to the active floor/hull release and proxy owners: reconcile the new floor slab with retained wall foot interfaces, validate the complete assembled ship, and update the visual catalog, occupancy representation and placements together. Review `assets/art-library/shipyard-floor/README.md` and the draft-proxy limitations from the floor handoff. Do not suppress the assertion, loosen solid-overlap rules, or use damage-removal state to conceal a design-interface mismatch. Also keep native asset IDs and their proxies atomic during catalog publication so the earlier missing-occupancy state cannot recur.

## Isolated browser verification when live bindings differ

The coordinating agent observed an `own_characters` decode RangeError after another session regenerated client bindings. The current managed development database can retain an older schema because ordinary builds generate bindings but do not publish it. UI visual review should use a database compiled from the matching source revision rather than alter the normal lab schema incidentally.

Inspection of `scripts/dev.py` confirms there is **no** `--config`, `--database`, review-server or alternate-state CLI option. `dev.toml` is loaded directly at import. `up-client` explicitly sets `VITE_DATABASE` from that config, so prefixing that command with another `VITE_DATABASE` value does not override it. `smoke-prepare` resets the shared `<configured database>-smoke`; it is not a fresh per-review namespace and can disrupt another active smoke run.

The existing managed helper supports a precise isolated alternative without changing shared configuration:

```python
from scripts.dev import publish
publish(database="sidereal-character-ui-review-20260908", reset=False)
```

This calls the project's pinned CLI against the configured loopback server, typechecks the world module, and publishes to the explicit database name with `--delete-data=never`. It does not restart services, modify `dev.toml`, update generated bindings, or publish to the normal development database. If that review name already exists with an incompatible schema, use a new unique review name instead of deleting it. The audit inspected this path only; the coordinating agent owns executing any publication.

The already-running client can then be used in a **dedicated fresh browser context** with a browser-only response override for its transformed `packages/net/src/index.ts`: replace the one `withDatabaseName(...)` argument with the exact review name. Assert that the intended call is replaced exactly once, and verify the actual WebSocket connects to `/v1/database/<review-name>/subscribe`. Keep the normal app modules and all other browser sessions unchanged. The existing same-origin `/v1` proxy routes separate database names to the same server. A fresh context avoids reusing another review's local identity and preferences; any new character/items are then created in the isolated review database.

Pin the generated client bindings and world source used for that review together; a concurrent schema edit between publication and capture can recreate the mismatch. Record the review database name and source revision with screenshots. This verifies the real UI and reducers against the isolated candidate and does not claim that the main lab database has been migrated or the UI has been deployed there.
