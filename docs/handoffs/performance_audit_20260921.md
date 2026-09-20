# Game performance: character clearance optimization — 2026-09-21

Status: measured CPU optimization, [PR #14](https://github.com/Dastari/sidereal_spacetime/pull/14)
open for review; public client unchanged.
Agent Mail identity: GrayLotus. Branch: `perf/character-pose-clearance`, based on
upstream `f19a4b21`. The owner redirected the initial regression investigation to
further measurable optimization. This delivery does not identify a single cause
of the owner's reported FPS change or claim a whole-game FPS improvement.

## Implemented

Renderer 0.5.3 removes temporary vectors and arrays from the 15-axis oriented-box
overlap check in `packages/render/src/crew/pose-math.ts`. Pose corrections invoke
this check repeatedly for weapon/body and arm clearance. Axis order,
normalization, the near-parallel threshold, margin and touching behavior are
preserved. No solver iterations, authored meshes, animation, visual quality,
authority or collision rules were removed. There is no cached pose to become
stale during movement or equipment changes.

The baseline math file is byte-identical in main, the working source and the
compatible deployed-client source: SHA-256
`7adad524ebe8442cb639e71f41f03bf2ef13a85751bc27c8017ad51b68aaaeca`.
The scalar helper therefore applies to both main's solver and the newer modular
solver retained in the live-compatible source. Renderer dependency pins are
updated together. Version 0.5.2 is already used by the separate portrait fix;
this change uses 0.5.3.

## Measurements and equivalence

Run `npx tsx scripts/benchmark_pose_clearance.ts`. It checks exact equality against
the retained vector algorithm, warms both implementations, alternates their
measurement order, and reports six measured samples of 81,920 calls each.
The 2,048 seeded box pairs cover mixed rotations, overlap and separation.

| Measurement | Before | After |
| --- | ---: | ---: |
| Median box-overlap CPU per call | 4,465 ns | 581 ns |
| Full modular rifle carry step, median of two runs | 0.241 ms | 0.169 ms |
| Full modular rifle aiming step, median of two runs | 0.255 ms | 0.174 ms |

The helper is **7.68× faster** in this Node v24.18.0 run. The complete pose step
uses approximately **30–32% less CPU** in the bounded NullEngine harness. The
absolute saving in that harness is about 0.07–0.08 ms per local character step;
do not translate the percentage into an equal game-FPS gain. Garbage-collection
pause improvement and browser gameplay timing after this patch are unmeasured.

Evidence: [helper samples](performance_20260921/clearance-benchmark.json),
[complete pose samples](performance_20260921/full-pose-comparison.json), and
[exact pose equivalence](performance_20260921/full-pose-equivalence.json).

The complete-pose diagnostic uses the live-matching r003 solver and published
r008 modular bodies/r003 handheld inputs, keeping all code except the imported
math helper identical. It compares 3,360 frames across male/female and all seven
handheld items, varying aim, carry, movement intent, sprint, seating and hidden
state. Every local transform and checked clearance diagnostic is exactly equal.
This harness holds the animation clip at its starting frame while varying pose
intent; it does not qualify an entire animated gameplay sequence. Its temporary
scripts and logs remain in the original checkout under
`.runtime/performance-audit-20260921/`; this is additional local evidence, not a
clean-checkout test dependency. The live-matching solver source hash is
`8a5af742abf961258258779fa6e32cd112475cab9c4f2b2bc30f83397a31844e`.

Committed tests cover analytical contact/separation/containment/margin and exact
agreement for 2,500 seeded mirrored, rotated and near-parallel pairs in both
argument orders, including unchanged input values. Existing pose-system tests
also pass. The benchmark has no unstable timing assertion in CI.

## Next measured opportunities

1. **Ship shadow submissions.** An isolated current-development legacy Deck
   fixture on the RTX 4080 Laptop GPU at 1574×907, MSAA4, no planets/remotes or
   handheld, measured 1,500 draws and 12.0 ms median normal render-call CPU.
   Glow off: 1,332 draws/11.4 ms. Glow and shadows off: 462 draws/6.6 ms.
   Each case warmed 120 frames then measured 180 normally scheduled frames.
   Over a separate 738-frame interval only the sun and two actor-containing
   local maps refreshed each frame; static local-map reuse still works.
   This suggests reducing admitted caster submissions, not removing shadows.
   Existing proxy batching requires real deck/placement identity; do not invent
   it for legacy meshes. This fixture is not the owner's authenticated current
   ship and does not establish a regression against the historical capture.
   [Probe values and limits](performance_20260921/deck-probe.json).
2. **Reviewed planet preparation and distant geometry.** 24/28 catalog designs
   are fixed-detail. Actual seeded worker builds retain 171,128 rocky and 185,544
   ice triangles at both LOD2 and LOD0; the tested temperate body retains 245,604
   versus 250,404. Preparation remains in the worker, so its 0.7–2.3 second build
   time is not a main-thread stall measurement. Prioritize bounded upload slices,
   reuse and properly authored distant representations while preserving native
   surfaces/materials. [Build counts](performance_20260921/planet-audit.json).

The public release at inspection was
`1ea3f5f74d3860bf3d0768462382401d4d1a22be0c277a1787ed78cf61149ae7`.
Its source composition differs from both current main and the dirty working
checkout. Do not publish a whole main build over it as part of this optimization.
The browser fixture used no database connection. A later preview transport reset
ended subsequent probes; those incomplete timings are excluded, and the fixture
was absent on reconnect.

## Validation and delivery

Validation is performed in `/root/sidereal-perf-audit` with an independent
`npm ci`. Full build uses the already installed pinned SpacetimeDB tool; it does
not start or publish any database. The fresh checkout lacks generated reviewed
planet payloads. The first generated-payload test failed on the absent files;
the dashboard's existing copies then exposed an inherited hash mismatch. The
client's existing published copies match all 31 catalog payload references and
were supplied only to this worktree's ignored dashboard public directory. No
native source, pin, test bypass or payload is added to the PR. An unrestricted
worker run also timed out in the existing heavy planet-terrain test; the final
run uses two workers without changing its timeout or assertion.

- `VITEST_MAX_WORKERS=2 npm run check`: TypeScript passes; **288 suites,
  1,442 tests pass, two skipped**. The final documentation stage fails on 36
  existing missing-link reports outside this change (for example
  `docs/visual_theme.md` and the art-library index).
- `npm run build`: passes world compilation, binding generation and both app
  builds using the existing pinned tool. No tracked bindings changed. The first
  attempt identified the fresh worktree's missing tool installation; reusing the
  installed binary resolved that environmental prerequisite.
- Focused pose math/system tests: **10 passed**, including the final near-parallel
  threshold sweep. Scoped runtime/test ESLint, Prettier and `git diff --check`
  pass. The benchmark script is outside the inherited ESLint file configuration.
- No server authority changes, so no smoke database is required. No public
  activation or merge was performed.

Local full logs: `/tmp/sidereal-perf-{check,build,targeted,lint,docs}.log`.
Agent Mail leases will be released after PR creation; no coordination conflict
or pending requested message was found.
