# Local visual comparison controls

Status: Six local controls implemented; actual renderer hide/reset behavior and matched-camera pass inventory reviewed.

F3 exposes Lighting, Equipment, Shadows, Glow, Planets and Characters On/Off buttons, plus Reset visuals. The six controls form a pinned 2×3 grid. The counters scroll independently; controls stay reachable on compact viewports. The renderer supplies `RenderDiagnostics.debugFeatures`, where true means enabled; UI actions call `diagnosticsToggle(key)` and `diagnosticsReset()`. No UI action sends an interaction, inventory or power reducer.

Closing F3 stops counter sampling but retains visual overrides. A HUD reminder lists disabled categories until reset. Reset removes local presentation overrides; it must preserve authoritative grow-light power and ordinary camera/cabin culling. Equipment scope is furnishings and their local lighting, not hull, crew or engines; root owns that renderer contract.

The focused UI regression verifies toggle, close without reset, retained disabled status, reopening and explicit reset. Actual Canvas2D browser review at the required tailnet origin clicked Equipment and Glow off, closed/reopened F3, reset, and resized to 380×520. The controls remained visible while counters scrolled independently. Evidence: `output/playwright/f3-controls-disabled.png`, `f3-controls-closed.png`, `f3-controls-compact.png`. These images explicitly use fixture counter values and are not performance measurements or proof of integrated world feature suppression. The review browser was closed.

Planets and Characters were added to the same six-feature contract after the initial four-button fixture. Planets must retain resources while hidden and suspend hidden-world LOD/weather/shadow work. Characters must hide crew and held visual children without changing character authority or equipment ownership.

## Actual renderer acceptance

A paused, actual `createWorld` scene and real CanvasUI callbacks on the required tailnet origin verified all six controls. The scene used the approved installed assets and one render-only gas-world fixture, with one grow tray explicitly off. Native pointer clicks hid all 17 fixture roots, 131 visible fixture primitives and 12 powered fixture lights. All eight primitives of the four legacy storage crates were disabled as well. Character primitives changed from 22 to zero; the hull and 21 drive primitives stayed visible. Planet hiding retained its three mesh IDs and the same 708 total scene mesh resources. Glow suppression disabled both layers; reset preserved the originally inactive celestial layer and restored the local instruments layer.

Reset restored fixtures and characters while the disabled grow tray's two lights stayed off. Reset while in Flight kept cabin meshes/lights invisible; returning to Deck restored the prior 131 visible fixture meshes and 12 powered fixture lights. Closing F3 retained the overrides. Initial instrument-warmup frames deliberately disable buttons until a completed snapshot exists; the accepted click sequence waited for a current button hit list. The open panel now invalidates every 500 ms even if no world-state update arrives, and closes/disposes that timer with the window.

Actual evidence: `output/playwright/f3-world-ready-baseline.png`, `f3-world-equipment-disabled.png`, `f3-world-six-disabled.png`, and `f3-world-reset-confirmed.png`. Earlier `f3-world-baseline.png` shows instrument warmup, and `f3-world-equipment-off.png` captured an ignored click on the then-disabled button; those are not accepted hide evidence. Counters in paused manual-frame screenshots are not a hardware FPS benchmark. The browser was closed after review.

## Matched-camera pass inventory

With all six features off, the camera was held at alpha 3.59159265, beta 0.95531662, radius 46.99580838 and target (0, 0.8, 0), at 900×620. Changing Deck to Flight changed cabin/roof presentation while preserving that camera:

| Captured inventory | Deck | Flight |
| --- | ---: | ---: |
| Active mesh entries | 195 | 205 |
| Active indices | 563,958 | 632,424 |
| Active PBR meshes | 164 | 183 |
| Clearcoat-enabled PBR meshes | 28 | 28 |
| Transparent glazing meshes | 7 | 7 |
| Dust instances | 551 | 546 |
| Camera postprocesses / custom render targets | 0 / 0 | 0 / 0 |

The same seven glazing surfaces used alpha 0.32 without depth writes in both views; no active material used refraction. Both glow layers, direct scene lighting and shadows were disabled. HDR environment reflections remained at intensity 0.28. Thus the captured difference is not an additional selection/glow render pass. This does not prove a fill-rate, transparency or shader cause for the user's approximately 5 ms difference. SwiftShader reported no timer-query support, and another independent browser was also doing shipyard work, so no timing conclusion is drawn. Evidence: `output/playwright/f3-all-off-matched-deck.png` and `f3-all-off-matched-flight.png`.

The expanded F3 rows distinguish full-frame CPU, update CPU, render CPU, optional GPU time, eligible lighting/shadow work, allocated shadow maps and transparent meshes. They use a derived scroll extent rather than a fixed row count. These row additions postdate the actual-world screenshots above; separate layout evidence is labeled as fixture data. Root owns full-loop/GPU instrumentation and subsequent CPU optimizations.

The final six-button Canvas2D fixture was reviewed at desktop and 380×520 sizes: `output/playwright/f3-controls-six-disabled.png`, `f3-controls-six-closed.png`, and `f3-controls-six-compact.png`. Equipment, Glow, Planets and Characters were toggled through actual pointer clicks; close retained the reminder and reset restored all six. The compact image shows every control and Reset without covering the independently clipped counters. GPU time explicitly reads Unavailable when unsupported. This fixture uses sample counters, not measured performance. All review browsers are closed. Seven focused diagnostics, compositing, resize and object-details tests passed.
