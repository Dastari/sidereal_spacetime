# Exterior ship shadow reuse — 2026-09-21

2026-09-22: PR #17 is merged and the live-baseline composition is deployed. See
[verified release](shadow_cache_release_20260922.md). The remaining text records
the original pre-release measurements and limits.

Agent: GrayLotus. Branch: `perf/shadow-and-planet-work`, based on upstream
`0ea05476`. Renderer candidate 0.7.1; no public deployment or merge.

Delivery: [PR #17](https://github.com/Dastari/sidereal_spacetime/pull/17), open.
GitHub Source quality checks were still running at closeout; local inherited
quality blockers are listed below. Implementation commit: `d22a503d`.

## Scope and acceptance

Continue the owner's requested client performance work after pose-clearance
PR #14. This change targets redundant exterior sun depth passes while preserving
the installed art, shadow resolution/filtering and existing local actor shadows.
Accept when unchanged scenes reuse their sun map, depth-affecting edits refresh
before rendering, dynamic unsupported paths fall back, and browser image checks
and the project gates have been run. This does not close the full rendering plan.

## Implementation

`createShipLighting` installs an exterior cache before render-target selection.
Exact reusable snapshots cover caster membership, world transforms, geometry
identity/updates, visibility, bounds, submeshes, depth-relevant material settings,
the actual Babylon light projection, camera matrices, shadow settings and target
identity/size. Context restoration invalidates. Regular explicitly listed native
instances use their own transform and their source geometry/materials.

Skinned/morphing meshes, updatable buffers, thin instances, source meshes with
implicit instance sets, LOD/custom lists, custom depth shaders, alpha-tested
textures, transparent shadow casting, clipping and multiple cameras retain
per-frame rendering. Geometry edits must use Babylon Geometry APIs, as existing
ship batches do. Babylon's shader-readiness retries remain intact. Disposal
releases observers and restores the map refresh policy.

Camera changes are deliberately conservative. An experimental camera-independent
cache produced tiny framebuffer differences (3 and 19 RGBA channel values during
two orbit/zoom comparisons); it was rejected. The submitted version refreshes on
view/projection changes. Expect benefits while the relevant ship/camera/light
inputs are stable; this is not a measured walking, flying or multiplayer FPS gain.

No authored surfaces, placement/deck identities, simulation or authority code
changes. No planet optimization is included: that remains a separate investigation.

The clean upstream checkout could not install: render/net/world and both apps
still requested private `@sidereal/sim@0.4.0`, while the workspace was 0.4.1.
Aligned these existing pins, updated render dependents to 0.7.1 and regenerated
the lockfile; no external dependency versions changed.

## Hardware evidence

Isolated `createWorld` legacy ship fixture in a Chromium WebGL2 browser, NVIDIA
GeForce GT 730, 1280 × 800. No database connection, planets, remote crew or equipped
handheld. Scene rendering was manually stepped with animation ignored after
warmup. The exact cache module was transpiled and injected into the existing
development fixture without changing its scene assets. This isolates the exterior
pass; it is not an authenticated public-client frame-rate measurement.

- 701 listed exterior casters; 120 measured frames per condition.
- Baseline: 1,211 draw calls/frame, 120 exterior passes.
- Cached: 630 draw calls/frame, zero exterior passes after warmup.
- Reduction: 581 draws/frame (48.0%). Full-frame RGBA comparison: zero differences
  across all 4,096,000 channel values in the stationary scene.
- A separate 60-frame comparison with `gl.finish()` measured median render-call
  times of 13.7 ms forced-normal versus 10.3 ms cached, means 24.05 versus 18.9 ms.
  Large timing spikes and inconsistent medians in earlier runs make these
  directional evidence only, not a reliable FPS prediction or GPU timing claim.
- Light direction, instance placement and bias edits each refreshed the sun map
  and matched an unconditional redraw exactly in that browser.

The hardware automation host disconnected before the full game-loop follow-up.
The integrated branch is additionally reviewed in local Chromium/SwiftShader;
software-renderer timings must not be presented as player performance.

Integrated full-loop fixture (960 × 600, MSAA 4, default enabled effects):
[per-frame counts](render_optimization_20260921/integrated-counts.json) are exactly
1,488 with forced exterior redraw versus 916 cached across six frames each (38.4%
fewer draws). Both nearby actor maps render every frame in both conditions; five
other local maps remain cached. An earlier 20-frame observation also confirmed
zero exterior passes and 20 passes for each of the two nearby actor maps.
[Framebuffer comparisons](render_optimization_20260921/integrated-pixels.json)
match unconditional redraw exactly for stationary, orbit, zoom, sun-direction
and native-instance-placement cases (2,304,000 RGBA values per comparison).
[Browser image](render_optimization_20260921/integrated-deck.png) shows the scene
after these diagnostic placement/camera mutations, not a new authored revision.

The retained Playwright CLI `run-code` probes are
[initialization](render_optimization_20260921/start-browser.cjs),
[image comparison](render_optimization_20260921/pixel-compare.cjs) and
[pass counts](render_optimization_20260921/count-passes.cjs). They use this dated
worktree's absolute import path; change it when reproducing elsewhere. Initialize
in a fresh logged-out dev tab, wait for `audit.ready`, manually run at least 20
`audit.frame()` calls, then enable `audit.world.getDiagnostics(true)` and run the
image and count probes in that order. Export `audit.pixels` and `audit.finalCounts`
with the CLI `eval --filename` option. The count probe undoes the image probe's
temporary instance displacement. No probe connects to the database.

## Validation and continuation

- `npm ci --ignore-scripts`: clean installation passed after workspace pin repair.
- `npm run check`: typecheck passed; 297 test files, 1,520 tests passed and two
  skipped. The final documentation step fails on 36 pre-existing missing links.
- `npm run build`: world build/binding generation and separate client/dashboard
  builds passed. Existing bundle-size warnings remain.
- 26 new cache tests cover unchanged frames, transforms, camera/light/material
  changes, equal-count geometry edits, explicit native instances, dynamic fallbacks,
  shader retries and observer cleanup. Existing shadow tests pass as well.
- Source quality has inherited blockers: 150 lint violations and 277 formatting
  violations relative to the repository's old baseline files. An isolated export
  of unchanged upstream source produces the same 150 lint errors and 278 format
  errors. This change introduces none and formats the touched lighting file.
- Managed client-only review used port 5297 via `scripts/dev.py`'s `app_up` routine;
  the normal `up-client` command also tries to start a database in a new worktree,
  so that combined command was not used after its occupied-port rejection. Review
  does not start/publish a database. Temporary configuration is restored afterward.

Public release remains an explicit later action; PR #14 is independent.
Review client and browser are stopped; temporary port configuration and tool
symlink are removed. GrayLotus releases this task's reservations at closeout.
Next measurement should compare settled Deck/Flight and moving frames on the
owner's normal hardware and actual constructed ship, with F3 and consistent
resolution. Keep local actor maps live and do not manufacture deck IDs to enable
the existing semantic shadow batches.
