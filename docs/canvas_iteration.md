# Canvas navigation and console iteration — 2026-09-08

Implemented: the sole visible WebGL canvas now contains a collapsible known-destination selector. Its source is the authenticated `ownSpaceBodies` subscription, restricted in the composition layer to permitted planets and stars. It selects Amethyst, Pelagic or Ivory Star, computes planar XY center distance and world heading from replicated positions, and shows a shortest-turn A/D cue only at the helm in flight view. The bearing uses the simulation convention: 0° toward +Y, 90° toward -X. This is manual navigation information, not autopilot, landing, a sensor grant, or a physical surface-distance estimate. Destinations remain world anchored. The compact panel hides at very short logical viewport heights to preserve seat controls.

Console overflow now scrolls with wheel, PageUp/PageDown and visible arrow buttons. Its fixed title, tabs and footer remain reachable at 640×480; partially clipped controls are excluded from both pointer and keyboard hit lists. Scrolling clears stale focus. Menu/text focus continue to suppress gameplay intent. Native clipboard, IME, selection and a complete assistive control tree remain unimplemented.

## Reference study and actual translation

All images below were opened and visually inspected, including the full target attachment. The design retained Barlow/Barlow Condensed and the current dark navy wells (#091a30), white text (#eff6ff), cyan frame (#47dfff), muted blue (#a7c5e8), gold navigation/seat cue (#ffd26d), and green connection/helm state (#74dcbb). The center remains open for the ship; edge panels align to the existing 18-unit margin. Existing luminous corner brackets carry the frame hierarchy; inactive button glow was reduced rather than making every option equally bright.

| Inspected reference | Concrete feature translated | Result |
| --- | --- | --- |
| `ui-elements.png` | Scrollbar and framed key binding hints | Console scroll thumb/arrows; Esc/Tab/E have distinct inset keycaps. |
| `ui-elements-2.png` | Gold objective diamond plus distance | Gold destination distance/bearing with a diamond selection label; no fictitious combat lock. |
| `ui-elements-3.png` | Bright active category over quieter grid cells | Selected destination/tab remains illuminated; inactive button halo removed. |
| `ui-elements-4.png` | Separate navigation selection and detail readout | Collapsible destination list above a stable range/bearing and helm cue; no trading claims. |
| `ui-elements-5.png` | Independent appearance/equipment slot choices | Existing Crew slot grid remains separate from ship settings; overflow now reaches the suit color choices and preserves the local-preview explanation. |
| `ui-elements-6.png` | Console tabs and readable vessel numerical rows | Existing Vessel rows remain the real mass/thrust/revision values and now scroll on constrained windows. |
| `in-game-ui-interface-example-1.png` | Edge-mounted telemetry/target panel preserving scene center | Small navigation panel at upper right; existing bottom-left velocity/heading remains unobscured. |
| Supplied `efaf3d5e…png` target | Clearly boxed Esc/Tab keycaps, dark readout wells | New keycaps match the target hierarchy; center stays free of invented status bars. |
| `3d-rpg-before.png` / `3d-rpg-after.png` | Before/after deck HUD keycaps and readable bottom-left telemetry | Framed controls now match the after direction; deck hints mention Shift sprint. Renderer/ship fidelity is independently owned. |
| `top-down-before.png` / `top-down-after.png` | Framed seat action and open central flight scene | E keycap and active gold seat action retained; navigation adds real destination finding at upper right. |

## Evidence and limits

Actual browser session `canvas-nav` used Chromium with software SwiftShader. Inspected `output/playwright/nav-entry.png`, `nav-deck.png` (despite filename, this is helm-occupied **flight**), `nav-destinations.png`, and `nav-console-small.png`. The flight image shows Amethyst actually visible at seeded spawn and a 47 m / 234° readout. Expanded selection visibly lists all three permitted celestial landmarks. The small-console image is an actual 640×480 resize followed by PageDown: lower Display controls and the scroll thumb are reachable. Screenshot calls required an explicit 60-second timeout on software rendering; this is not a GPU performance benchmark.

One visible canvas and no DOM game controls were queried. During concurrent development, Vite dependency hash changes triggered a transient mixed-React invalid-hook-call and automatic reload; subsequent HMR also logged deleted WebGL program warnings. These are recorded as development lifecycle limits, not silently treated as passed regression. `nav-console-input.png` is **not valid input-focus evidence** because a reload closed the console during that attempt. Fresh reload/input verification is recorded below when completed. Final integrated renderer/planet fidelity and complete clean HMR verification remain lead-owned.

Pure navigation tests cover cardinal axes, shortest-angle wrapping, coincident destinations and a 1e12 world origin. Canvas layout/input tests pass (7 tests). Whole-project checks/build are run by the integration lead after all agents finish.

Fresh-reload input check completed: inspected `output/playwright/nav-input-verified.png`. Vessel input visibly contains `WayfarerwasedWwasedW` after typing WASD/E and Shift+W twice; the character remains on foot, world position 0.0/0.0, speed 0.0 and heading 0°. No rename was submitted (revision 1, zero receipts). This screenshot also shows the deck view and the selected destination through the single-canvas console composition. Model status still reads Loading vessel, so it is input/console evidence, not final loaded-model acceptance. Browser session was closed to hand the software GPU to crew review.

Owner-reported resize flicker had a reproducible texture-lifecycle cause: `CanvasUI.paint()` recreated the DynamicTexture before its 33 ms throttle check, allowing an empty texture to be composited. Resized layouts now bypass that throttle and resize, paint and upload in one render callback. UI scale changes alone no longer recreate an unchanged-size GPU texture. The WebGL engine resize also moved from the ResizeObserver callback into the next scene render, so buffer clearing and redraw happen together. The regression drives six successive resizes four milliseconds apart and verifies each reallocation is followed by draw/upload in the same call; normal unchanged-viewport throttling remains. Live window-resize review remains pending.

The flight hint now says release controls to brake. Vessel mass and main-engine capacity reflect the shared authored IFCS installation (12 t / 36 kN), not the older compatibility fields retained on existing ship rows. These remain fixture specifications, not live inventory/utility telemetry.
