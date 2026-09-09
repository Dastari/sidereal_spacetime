# F3 Lighting Off shadow submission fix — 2026-09-09

Status: implemented, focused tests and exact development-source browser behavior passed. Aggregate gates and any publication belong to the integration owner. This does not complete a rendering-performance phase or claim hardware FPS gains.

The discrepancy described in [the performance resume](render_performance_resume.md) is fixed in `packages/render/src/debug-features.ts`: the effective scene shadow flag now requires both effective lighting and independent Shadows intent. Babylon 9.25.0 gathers shadow maps using `scene.shadowsEnabled` without checking `scene.lightsEnabled`. Lighting Off therefore must close both gates. Toggling Shadows while lighting is off preserves the independent intent; returning lighting cannot override Shadows Off. Reset and disposal preserve the originally configured defaults. No light-owned shadow intent, shadow allocation, local-light cap, deck state or authority data is changed by this helper.

`diagnostics.ts` counts eligible maps using the actual scene shadow gate, without using lighting as a second hiding predicate. These are eligible maps, not a count of passes rendered this frame: cached maps can skip refresh. Allocated maps remain separately visible.

Focused validation: **4 files / 30 tests passed**, covering debug features, diagnostics, local-light budget and Graphics settings. New regressions exercise the pinned Babylon render-target collection stage and its agreement with diagnostics, both toggle orders, toggling Shadows On while Lighting remains Off, reset/disposal, originally disabled defaults and preserved light/map intent. `npm run typecheck` passed. The integration owner runs `npm run check` and `npm run build` for the combined workspace.

## Browser evidence

Named session `debug-shadow-review` reviewed `http://sidereal.tail7a58a6.ts.net:5173/`, using the existing private development inventory review identity. This is the current source candidate, not the earlier immutable public release. Exact edited-source hashes and evidence are in [`output/playwright/render-plan/debug-shadow/`](../../output/playwright/render-plan/debug-shadow/): `source-sha256.txt`, `tests.json`, `acceptance.json`, `lighting-off.png`, `deck-restored.png` and `reset-cap-4.png`.

Browser-only hooks exposed existing scene/UI objects. RAF was paused, transitions stepped through the normal update loop, and actual complete frames rendered for observations. Every allocated shadow map had an `onBeforeRenderObservable` observer. Actual canvas pointer controls operated the F3 and Graphics settings. Viewport was 1280×900 at hardware scale 1. ANGLE Vulkan SwiftShader was reported; screenshot FPS/CPU values are excluded from performance acceptance.

| Settled state | Observed shadow passes | Eligible / allocated maps | Local lights / local shadow lights |
| --- | ---: | ---: | ---: |
| Deck, default All | 8 | 8 / 9 | 27 / 7 |
| Lighting Off | 0 | 0 / 9 | 0 / 0 |
| Lighting restored, Shadows still Off | 0 | 0 / 9 | 27 / 7 |
| Both restored | 8 | 8 / 9 | 27 / 7 |
| Shadows toggled On while Lighting Off | 0 | 0 / 9 | 0 / 0 |
| Flight, Lighting Off | 0 | 0 / 9 | 0 / 0 |
| Flight, lighting restored | 2 | 2 / 9 | 0 / 0 |
| Deck restored | 8 | 8 / 9 | 27 / 7 |
| Cap 4, Lighting Off | 0 | 0 / 9 | 0 / 0 |
| Reset visuals retains cap 4 | 4 | 4 / 9 | 4 / 3 |

The exterior sun and planet shadow are both suppressed by Lighting Off. Returning to Deck restores all seven local maps. Graphics All, Deck and all F3 flags were restored before completion; the final budget snapshot was All with 27/7 lights. All 99 inventory item UUIDs/placements, appearance and character position remained unchanged. No gameplay movement, inventory edit, appearance edit, new identity or publication occurred.

After all captures and restoration, concurrent development HMR requested `construction-instance.ts` during another owner's edit, received HTTP 500 and disposed the scene. This is recorded in the JSON and was after the last reviewed complete frame. The retained before/after fixture snapshots were compared read-only. The named session navigated to `about:blank` and closed; GPU ownership was released.

The initial candidate exposed a separate integration limitation: the renderer called `createLocalLightBudget()` without storage, so the cap was session-only. Root subsequently fixed the no-argument browser-storage default, with restricted-storage fallback and regression coverage. A later actual-browser check in `native-pressure-review` selected 4, reloaded to 4 lights/3 local shadows, used Lighting Off then Reset visuals, and reloaded again to 4/3. Both reloads retained the saved `4`. All (27/7) and the original absent preference key were restored. Evidence: [`local-light-persistence.json`](../../output/playwright/render-plan/debug-shadow/local-light-persistence.json). This later candidate check used normal pointer controls and reloads, and makes no hardware performance claim.

The source hashes in the original debug-shadow capture describe those files before the integration owner's requested post-capture formatting. The formatting did not change behavior.
