## 2026-09-22 — Studio 0.11.0

- Draw closed polygons and Bézier boundaries directly with a pen; close on the first anchor, double-click or Enter, retaining invalid drafts for correction.
- Group map tools with hover/focus tooltips, add canvas/tree context menus, and support validated tree reparenting with undo.
- Show selected orbit-guide parent distance and straight-line travel time at 30 gameplay m/s. Share one astronomical display conversion (1 gameplay metre = 100 km) across Map and live Genesis inputs, grid labels, distances and speeds; preserve stored geometry and actual ETA. UI package 0.5.0 exposes the presentation contract.

# Render 0.8.1 — exterior shadow reuse (2026-09-21)

- Reuse unchanged exterior ship depth maps with conservative camera/caster/light/material invalidation and dynamic-path fallbacks. Preserve authored geometry, shadow quality and animated local shadows.
- Isolated hardware ship fixture: 1,211 to 630 draw calls per stationary frame, with identical pixels. See [validation and limits](docs/handoffs/render_optimization_20260921.md); no public FPS or deployment claim.
- Align stale private simulation workspace dependency pins with the existing 0.4.1 package so clean installations work.

## 2026-09-21 — Studio 0.10.1

- Remove the redundant global Studio footer and reclaim its reserved height in Map and Genesis; retain workspace-specific controls.

# 0.6.0 — Studio spatial and test-ship workflows (2026-09-21)

## 2026-09-21 — Live map and Genesis (Studio 0.10.0)

- Published PR #19 through the preserved IFCS authority and Studio compositions. Verified exact artifacts, unchanged audited world rows, the public sign-in gate and unchanged game client; recorded complete source/build inventories and retained existing public portraits.

- Added the owner-retained `sidereal-development-review` game/Studio account workflow, private credential reuse, secret-free CLI arguments, temporary authoring-role management and a durable review-account runbook.

- Keep map rendering bounded to visible arcs and bodies, coalesce wheel input, scale celestial portraits to physical size, and reveal moon orbit guides only at useful zoom levels.
- Use fixed 10% planar editor background feather; remove height and feather controls. Show X/Y together with two decimal places and remove SVG focus rectangles and drawer instructions.
- Draw fields and zones in the current viewport without camera jumps; preserve point editing, undo and deselection.
- Require Studio sign-in and load the live world. Genesis edits the selected live celestial UUID through the same validated transaction as the map (name, XY, radius, native asset, composition seed and parent).
- Confirm subscription state before completing a save; preserve identity, motion, grants, expected revisions and operation replay. Native asset authority catalog is checked against runtime assets.
- Versions: content0.6.0, render0.8.0, UI0.4.0, world0.6.0. No table/schema change or public game client release required.
- Validation: full build and isolated smoke pass; typecheck and tests pass. `npm run check` remains blocked by inherited missing-document links. Authenticated browser acceptance/release status is tracked in `docs/handoffs/live_map_genesis.md`.

## Studio 0.9.0 / UI 0.3.0 / Render 0.7.1 — 2026-09-21

- Replace map command bars with drawer icon controls, searchable nested Universe tree and a Name/ID/preview context inspector. Add true deselection, suppress the right-drag context menu, and use numeric steppers, grouped coordinates, sliders, relation/shape selectors and color controls.
- Align exact render/sim workspace dependencies so clean installs resolve local packages.
- Keep the map background visible while dragging and zooming; reuse one worker and retain completed frames.
- Preserve transparent coverage in native planet, moon and star map portraits instead of packaging opaque reference screenshots.

## 0.7.1 — 2026-09-21

- Published Studio PR #15 with existing IFCS, game and editor features preserved. Added authored-frame zone traces and recorded exact separate release overlays, non-reset migration checks and preserved player records.

- Move workspace navigation to an accessible persistent left icon rail.
- Add stars-only Deep space as the game default; share system/field background selection and feathering between editor and game, with sanitized actor-admitted geometry.
- Anchor system boundaries to a chosen star; retain explicit legacy centers, static parent/moon orbit guides and descendant movement. Show lightweight actual asset portraits and an adjustable background preview height.
- Expose Shipyard template publication from every design stage, preserve complete construction metadata in save/import/export, and retain incomplete drafts for recovery.
- Add atomic dedicated test-ship switching with revision/permission/control/occupancy checks, preserving original native or legacy home and inventory. Keep qualified flight/traversal requirements intact.
- Candidate only: no production activation. Includes the existing map-editor PR11 commits. See docs/handoffs/studio_spatial_workflows.md for checks and integration limits.

# 0.5.0 — System map editor candidate (2026-09-15)

- Add Creator `/map` with metric chart, celestial movement, live ships, spherical systems and space backgrounds.
- Author box, ellipsoid and concave polygon asteroid volumes with seeded density, radius and resource occurrence controls.
- Validate privileged edits atomically, preserve ships, record source/revision checks and before/after history; expose nearby visual asteroids without resource metadata.
- Correct LFS attributes for canonical native JSON payloads and replace an obsolete smoke assertion with the pinned current celestial chart.

# Changelog

## Unreleased — Shipyard player builder design, 2026-09-25

Recorded the owner's decisions on player ship building and voxel-destructible ship structure. Added a design for the construction rules, an agent-friendly author → voxelise → style pipeline, damage authority, efficiency budget, a shared editor core and a phased plan. Evidence comes from a deterministic headless Blender prototype, `scripts/art_library/voxel_style_prototype.py`, which outputs a Wayfarer-style section with slope/arc bow, styled voxels and impact damage. Documentation and prototype only; no runtime, authority or asset changes.

r004 adds a reusable component kit prototype, `scripts/art_library/ship_kit_prototype.py`. It has 59 voxel-aligned pieces covering hull shapes, face cassettes, glazing, roof modules, external mounts, interior edge types and decorators. The pieces use nine material slots, so three faction themes render on the same meshes, and it adds tiling detail bump, mask decals and theme decorators. The design gains §12: kit contract, theming, decals, wall and pressure edge types, glazing families, hull shapes, mounts and faction strategy.

## 2026-09-15 — Stellar Observe framing (render 0.5.1)

Observe fits the enlarged stellar corona, including portrait viewports, while retaining authored physical radii and existing planet framing. Added two NullEngine projection tests. Final r013 solar migration passes isolated baseline/update/persistent-state verification and is now live with the compatible client. All live ship, character and inventory-item rows remain unchanged. Hardware performance acceptance remains unmeasured.

## 2026-09-15 — Local Agent Mail coordination

Added signature-verified Rust Agent Mail v0.3.35 installation and shared local
service lifecycle, Codex/Claude project MCP configuration, and a canonical
AGENTS.md coordination workflow. Mail state stays outside the repository;
worktrees share one project identity. See docs/agent_mail.md for verification
and client reload/approval requirements.

## 2026-09-15 — Genesis reviewed native planets (dashboard/render 0.2.1)

Genesis now defaults to all 28 reviewed Blender planet and moon variants, including selective transparent ice shards. Selection and seeded composition use validated worker-owned assets, shared PBR materials, precompiled retained LODs and ready-only replacement. Preserved the procedural editor as a separate mode. Added exact catalog/provenance, lossless bounded payload packaging and worker/NullEngine lifecycle tests.

## Unreleased — Wayfarer exterior armor native r004

Added separate Blender-authored exterior armor with broad paired bays, recessed cassettes, wrapped ribs and fitted bow returns. Fine surface details use shared color, normal and roughness maps. The 46-model final-03 family passes native checks and independent comparison of 14 native and 8 exact game-renderer images. Sources, compressed exact exports, validation and review evidence are retained in the art library. This is a review candidate; the installed ship and physical interfaces are unchanged.

- 2026-09-15: Render/dashboard0.3.0: native yellow-main-sequence star r007 passes independent Astra reference working review; animated shared flares, optically thin corona, warm-light evidence and NullEngine lifetime tests. System integration pending.

- 2026-09-15: Render/dashboard 0.3.1: Genesis planet view now includes the reviewed Yellow Main Sequence Star, active flares, star-specific controls, verified cancellable GLB loading, and restored planet illumination when switching bodies.

- 2026-09-15: Client 0.2.0, render/dashboard 0.3.2: stage exact reviewed planet and star assets independently from shared versioned celestial payloads; preserve public URLs and asset hashes.

## 2026-09-15 — Authored solar system and active stellar plasma

Added a 29-body authored celestial layout with owner-scaled radii and travel gaps, reviewed native planet/moon rendering, bounded retained LODs, distant stellar radiance and large-coordinate camera support. Added a guarded server-scheduled celestial-only migration, validated against an isolated copy of the deployed authority version; live publication remains pending game-view checks. Native r010 and plasma-r012 replace the rejected pale checkerboard/red annulus with orange-gold material regions, connected selective white-hot paths, a turbulent blended corona and shorter, broader active flares. Independent Astra original-atlas review and actual alternate/bloom-off/playback evidence qualify this revision for owner comparison; hardware timing and owner final approval remain unclaimed. Restored the two rendering helpers already referenced by upstream and added renderer startup error diagnostics.


## 2026-09-15 — Dynamic stellar relief (render/dashboard0.5.0; client/root0.4.0; content/net/world0.2.1)

Native r013 replaces permanently fixed sunspot basins with5,762 editable hexagonal/pentagonal closed tiles. Shared native PBR plugins animate rigid tile heights, drifting/dissolving dark complexes and connected hot regions without per-frame geometry generation. A wider orange corona carries rare curling eruptions with quiet intervals; retired small persistent flare actors are absent from the new native export. Genesis frames the expanded effect. Added compiled-shader regression for the vertex injection initialization defect, stable topology/shared-material checks and native byte-budget/UV/semantic tests. Actual software-browser playback and close/alternate/bloom-off evidence are saved as plasma-r018; hardware timing and owner final signoff are not claimed. Solar seed appearance now pins r013; its new hash requires isolated migration revalidation before live publication.

## 0.7.0 — 2026-09-21

- Added shared studio select/pan, duplicate/delete, undo/redo and nudge shortcuts, including Shipyard Objects/Hull and Assembly, with focused text/modal handling and gesture cancellation.
- Added named, colored nested polygon zones with cubic handles, numeric handle angles/lengths, shape-preserving insertion, subtree editing and shared preview/game background clipping.
- Added private indexed zone definitions and authoritative per-ship membership/transition journals. Accepted movement detects through-crossings, retains reconnect sequence bounds, and preserves existing physics/admission scope.
