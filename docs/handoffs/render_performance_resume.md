# Rendering performance resume — 2026-09-09

Status: isolated Phase 1a CPU change implemented, unit validated and reviewed in the public browser release; owner-hardware performance acceptance pending. No complete performance phase or FPS gain is claimed. A separate Lighting Off shadow-counter discrepancy remains documented below.

## Current baseline and ownership

Read `AGENTS.md`, `PIVOT.md`, `docs/rendering_performance_plan.md` and `docs/handoffs/render_light_budget.md`. The source snapshot in the original plan is historical. Fresh controlled-browser scene counters for public release `400dc9fdda68` are recorded below; they are not an unmodified runtime or hardware timing baseline.

The installed local-light budget already has All/Off/4/8/16/32, stable placed-source identities, hysteresis, shared-frame positions, power/visibility/debug composition, independent emission and whole-light suppression for unavailable required shadows. Its existing handoff records actual-game All 27 lights/7 local shadow lights, 8→8/6, 4→4/3 and Off 0/0, with Flight hiding locals and Deck restoring them. These are earlier software-browser behavior results, not new measurements or hardware acceptance. Existing budget and adapter tests pass with this change.

Owned edits are limited to `packages/render/src/ship-shadow-cache.ts`, its existing test, new `ship-shadow-placement.test.ts`, and the narrowly approved placement-comparison wiring/disposal cleanup in `ship-lighting.ts`, plus this handoff and the performance-plan progress entry. No shared renderer entrypoint, client, construction, character, asset, service or publication edits by this task. Parent integration installed the change in public release `400dc9fdda68` before the browser follow-up.

## Finding and implementation

`refreshShadowCache` still built a Set of every occluder and local ancestor, several arrays per node and a complete joined string every visible-cabin update, even when the ship interior was unchanged. Existing geometry observers and static/actor shadow-map reuse were already implemented; this work preserves them.

The new helper retains reusable scalar snapshots keyed by node identity. Each scan compares the same local transforms, enabled/visible state, vertex/index counts and bounds; shared ancestors are visited once. Geometry revisions remain explicit. Added geometry identity comparison catches replacement surfaces with identical counts and bounds. Reparenting, removal and disposal invalidate once and remove stale entries. Caster membership is tracked independently, so removing a caster also invalidates when it remains an ancestor of another caster. Duplicate disposed casters are skipped before reading bounds. Scene disposal clears retained snapshots.

The helper excludes the common ship root's transform, preserving local shadow reuse during rigid ship motion and camera-origin rebasing. It deliberately scans Babylon's mutable properties instead of introducing new invalidation obligations across cutaway and placement owners. No approximate numeric hash can collide, and world-matrix notifications cannot accidentally turn ship flight into full local-map invalidation. Existing proxies still retain physical occlusion when their visible cutaway sources disappear; actor-containing maps still refresh for animation.

## Bounded measurements and validation

Synthetic Node/NullEngine comparison uses 185 box occluders below 12 placement ancestors, 500 warmup iterations and seven alternating samples of 1,000 scans each. It compares the previous exact signature construction against the new helper; it does not run a game frame or measure GPU rendering.

| Helper measurement | Previous | Current |
| --- | ---: | ---: |
| Median CPU milliseconds per scan | 0.152032 | 0.029143 |
| Explicit `Vector3.asArray()` calls per scan | 961 | 0 |
| Joined placement-string characters per scan | 16,411 | 0 |

The call count measures these specific temporary arrays, not total engine allocations or heap bytes. Persistent snapshot storage is allocated on first encounter with a node. Existing proxy synchronization and the rest of the lighting loop still allocate and are outside this comparison. Timing is environment-dependent microbenchmark evidence; it does not identify the dominant real-game bottleneck or establish a hardware FPS gain.

Local reproduction/evidence: `.runtime/render-performance-resume-benchmark.ts` and `.runtime/render-performance-resume-benchmark.log` (local diagnostic artifacts, not published assets).

- `npm run typecheck`: passed.
- Focused Vitest run: **7 files / 38 tests passed** across shadow placement/cache, ship lighting, local-light budget, equipment lighting, cabin visibility and occlusion.
- New coverage: local ancestors and both rotation modes; enable/visibility and bounds edits; explicit geometry revisions; equal-bounds replacement geometry; reparenting/removal/disposal; ship motion/origin rebasing; retained cutaway proxies; disabled caster removal; edits made while cabin lighting is hidden refreshing on return.
- Existing actor-map cap/reuse and local-budget lifecycle tests remain passing.
- Parent integration reports `npm run check` passed: **116 files / 534 tests**, typecheck and **75 document checks**; aggregate `npm run build` and `npm run art:check` passed before publishing release `400dc9fdda68`.

## Public browser behavior review

The named `render-performance-review` session loaded the exact compiled public release at `https://sidereal.dastari.net/`, using the established private review account. Browser-local response hooks exposed the existing scene/world/UI objects and copied presentation-state inputs; they did not replace rendering algorithms or mutate repository files. React connection observers reacquired the current connection after successful OIDC renewal instead of reading retired connection rows.

The browser reports ANGLE Vulkan **SwiftShader**, WebGL 2.0. RAF was paused and the normal update loop was stepped to settle transitions; each recorded scene-counter capture included actual complete rendered frames. This avoids the software renderer's long continuous-rendering stalls. Consequently **all FPS, frame interval and CPU fields in the raw JSON/screenshots are excluded from performance acceptance**, including the update CPU smoothing values influenced by controlled frames. GPU timing is unavailable. These captures validate scene behavior and counts only; no before/after game performance comparison is claimed.

Matched viewport: **1280 × 900**, hardware scale **1**, no selected object, default All local lights, neutral color controls and all F3 features enabled. Views use their normal different camera radii (Deck approximately 47 m; Flight approximately 215.4 m).

| Settled view | Draw calls | Active / total meshes | Active indices | Scene lights | Eligible / allocated shadow maps | Local lights / local shadow lights |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Deck | 2,312 | 581 / 1,762 | 5,203,692 | 47 | 8 / 9 | 27 / 7 |
| Flight | 2,106 | 569 / 1,762 | 3,574,020 | 21 | 2 / 9 | 0 / 0 |
| Deck return | 2,312 | 581 / 1,762 | 5,203,692 | 47 | 8 / 9 | 27 / 7 |

All three captures retained 765 materials, 416 textures, 203 physical shadow proxies, zero camera postprocesses and zero custom render targets. Scene-wide lights/maps include environment sources outside the local-light budget. The larger counts than historical documents describe the currently installed scene; they cannot be attributed to this isolated CPU optimization.

Behavior evidence:

- Actual Graphics pointer controls selected 8→8 locals/6 local shadow lights, 4→4/3, Off→0/0 and All→27/7. Per-map render observers confirmed suppressed locals rendered no shadow passes. Off rendered only the exterior sun map; restoring All refreshed all seven local maps. Neutral color controls kept the postprocess chain empty.
- Deck→Flight→Deck restored the same scene counts and local-light eligibility. Screenshots show the cabin cutaway open, exterior roofs closed in Flight, then the open cabin restored.
- Controlled presentation-state ship yaw of +0.65 radians and a ±100,000,000 m world-origin shift retained identical local caster IDs with **zero local shadow refreshes**. This is a loaded-scene presentation test, not an authoritative teleport.
- Controlled displayed-actor travel into a room changed caster membership. Once settled, **only two actor maps refreshed**; returning the actor restored the original caster lists.
- Actual D/A keyboard input moved the authoritative private review character. Actual occupied-station W/D input moved and turned its ship (sample position about 0.313 m / 0.053 m, heading −1.474 radians), with local lights off in Flight. Returning to Deck and exiting the station restored 27/7 local lights/shadow lights.
- F3 Shadows Off produced no observed shadow passes. Equipment Off reduced eligible locals from 27 to 7 at the final actor position; restoring it returned 27. Lighting Off suppressed all locals and local shadow passes; the remaining exterior pass is described below. Every control was restored afterward.
- The private review character retained its stable UUID, all seven item UUIDs/placements and unchanged appearance revision/content. The control station was unoccupied at completion. Movement changed only the review fixture's ordinary position/heading through authorized controls. The session signed out, navigated to `about:blank` and closed; GPU ownership was released.

Evidence directory: [`output/playwright/render-plan/phase-1a/`](../../output/playwright/render-plan/phase-1a/). Consolidated [`acceptance.json`](../../output/playwright/render-plan/phase-1a/acceptance.json) includes all snapshots and five behavior checks. Individual JSON covers Deck/Flight, light budget, controlled motion, actual keyboard walk, station flight and debug overrides. Screenshots include `deck-f3.png`, `flight-f3.png`, `deck-return-f3.png`, `graphics-cap-4.png`, `graphics-cap-0.png`, `occupied-station-flight.png` and `deck-final-f3.png`.

### Separate diagnostic finding: Lighting Off still submits the exterior shadow

On the reviewed release, F3 Lighting Off sets `scene.lightsEnabled=false` and suppresses every local source, but leaves `scene.shadowsEnabled=true`. A render observer still records one `exterior-key` shadow pass. `diagnostics.ts` reports zero eligible maps because its counter predicate also checks `lightsEnabled`. Babylon's installed shadow-generator scene component gathers maps based on `shadowsEnabled` and each light's own enabled/shadow state, so this discrepancy is consistent with the source.

This is outside the local-light cap and placement-cache change. F3 Shadows Off correctly stops all observed map passes. No code fix or republication was made during this bounded acceptance task. A follow-up should make the Lighting Off scheduling and diagnostic meaning consistent, with a regression test and browser pass observation.

## Remaining work

Fresh matched Deck/Flight scene counters and moving ship/actor, cutaway and budget-reactivation behavior are now captured. Phase 0 still needs an unmodified runtime CPU profile and owner-hardware update/render/GPU timings at matched resolution. The controlled SwiftShader captures cannot satisfy those requirements or close Phase 1 performance acceptance. Resolve the separate Lighting Off scheduling/counter discrepancy before treating that F3 override as proof of zero shadow work.

Per-frame receiver membership scans, proxy synchronization and the shared renderer's `JSON.stringify` debug key remain potential individually profiled CPU follow-ups. No glow, dust, batching, shadow-quality, material or postprocess changes were made. Construction batching still requires stable placement/deck/material semantics, and planets remain paused. Main-plan Phase 1 completion, publication and a phase commit are not claimed by this isolated handoff.
