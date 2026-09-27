# Wall depth review — 2026-09-08

The owner's overlapping gray-wall screenshot was reproduced in a real Chromium renderer at the tailnet origin using the canonical ship, default interior azimuth `Math.PI + 0.45`, RPG elevation and a fixed camera. The diagnostic imports the production `createWorld` renderer, bypassing React and network/HMR only to keep captures stable. It is not a gameplay/network acceptance screenshot.

Inspected same-angle evidence in `output/playwright/`:

- `wall-repro-alpha.png`: forcing the previous ALPHABLEND mode on fully visible cutaway walls reproduces the huge gray planes swallowing the service inserts.
- `wall-repro-opaque.png`: changing only the retained wall materials to OPAQUE restores the wall panels.
- `wall-repro-no-shadows.png`: disabling scene shadows separately clears the remaining speckled prow surface.
- `wall-repro-one-sided.png`: restoring shadows and enabling backface culling on all ship materials does not clear that speckle. Do not change exporter sidedness as a substitute for the shadow fix.

`applyCutawayVisibility` in `packages/render/src/cutaway.ts` now reserves alpha sorting for genuine fade transitions, snaps settled endpoints, writes opaque depth for retained walls/roof, and disables hidden pieces. Its NullEngine regression reproduces the prior alpha-one transparent classification and tests full→fading→hidden→full behavior. `npm run check` passed 78 tests after this fix; the lead runs final checks after concurrent changes.

Additional bounded placement corrections: imported `GEO-body` has GLB accessor minimum local Y=0, so avatar base was raised from 0.2 to the 0.25 m room-paver top; the ground marker moved from 0.205 to 0.27 m. Room sign planes were buried at X ±4.73 m behind service inserts reaching inward to ±4.375 m. They now sit at ±4.35 m / height 2.0625 m, width 1.5 m and height 0.25 m, single-sided and facing inward. The sign follow-up needs a final normal-view browser check; it was not in the frozen diagnostic's imported code.

Reproduction harness: `.runtime/wall-stable.js`. It pauses render loops before single renders and screenshots to avoid SwiftShader backlog. The first attempted angle (`wall-alpha-before.png`, `wall-opaque-after.png`) did not reproduce the user's issue and is not acceptance evidence. The retained `wall-repro-*` quartet is the valid controlled comparison. Babylon scene reported ready=true, 234 meshes.

Remaining lead work: tune the sun shadow generator for the independently demonstrated prow self-shadow artifact, inspect ordinary gameplay signs/foot contact, verify live HUD resize with the lead's resize patch, and complete dashboard placement interaction review. The geometry agent is handing the GPU back and switching to inventory UI. No generic polygon offset or source culling workaround was applied.
