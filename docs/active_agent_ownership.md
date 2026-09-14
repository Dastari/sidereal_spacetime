# Current Astra and equipment ownership

Status: Active coordination record; 2026-09-08

All paths below are relative to `/root/sidereal_spacetime`. External equipment authoring proceeds independently. Root integrates narrow shared entrypoint changes without replacing authored assets or rolling back other agents' work.

| Owner | Current or retained paths |
| --- | --- |
| External equipment agent | Equipment Blender/art-library revisions, approved equipment exports, `assets/runtime/assembly/equipment/`, equipment manifest and native loader/fixture-light integration (`packages/render/src/installed-equipment.ts`, `equipment-lighting.ts`). Beds, seats, terminals and other fixture models are reserved for this owner. |
| Root | `packages/render/src/index.ts`, camera/dust integration, diagnostics, `object-presentation.ts`, `apps/client/src/App.tsx` and `objects.ts`, final lighting/performance integration and managed publication. |
| Astra `authoritative_ifcs` | Authoritative IFCS/inventory/proximity interaction modules and their pure rules, filtered network contracts/tests/smoke; ship-lighting/occlusion/shadow-cache implementation handed to root for final integration. |
| Astra `procedural_planets` | `packages/content/src/environment.ts`, planet files under `packages/render/src/environment/` excluding root dust, Genesis planet studio and planet iteration docs. Ice optical helper has been handed into this ownership. |
| Astra `geometry_snap_bevel` | Current object-details canvas UI and tests. Prior character source/runtime work is complete. Structural plastic helper/tests remain staged; no canonical ship material publication is claimed. |

`scripts/export_voxel_blender.py` is a shared collision point: its ship/assembly output and equipment retirement hooks must be coordinated. The structural material helper is `scripts/ship_materials.py`; it deliberately retains the existing equipment/assembly mapping. Plastic candidates remain at `.runtime/art/wayfarer-plastic.blend` and `.glb`. Do not overwrite canonical ship/assembly exports to publish an unaccepted material experiment.

Root's grow-light switches clone material instances only for the selected placement at runtime. They preserve the approved source materials, geometry, optical inputs and shared textures. Selection outlines likewise modify presentation flags, not asset files.

The software-GPU browser is shared serially. Close or navigate to `about:blank` before handover. Code checks can run independently; coordinate asset copies and shared renderer imports around screenshots. Required real browser origin is `http://sidereal.tail7a58a6.ts.net:5173/`.

Follow-up: the planet specialist owns the bounded Observe camera and floating-window pointer-routing correction. Root owns the whole-object binary silhouette renderer. The geometry specialist's new finish study is isolated under `assets/art-library/shipyard-hull/material-studies/native-r001-polymer-01/`, with its own source/evidence ledger. It does not alter the external hull author's active r002 or publish material drafts over the current native hull.

2026-09-08 Ship layout editor Stages 0–2: this implementation session owns new
`packages/content/src/ship-layout.ts`, `packages/sim/src/layout-*`,
`packages/render/src/layout-preview.ts`, `packages/ui/src/editor-controls.tsx`,
`apps/dashboard/src/shipyard/layout/`, associated tests and
`docs/handoffs/ship_layout_editor_stages_0_2.md`. Narrow integration only in the
dashboard App (Shipyard route and legacy-assembly access). Existing AssemblyEditor,
planet studio, gameplay/world/net, native equipment/hull assets and shared renderer
entrypoint are not edited. Browser review uses an isolated named CLI session and
releases it on completion. Build gates regenerate protocol bindings but do not
publish the database. This claim does not supersede existing asset owners.

Ship-layout build audit: narrow shared `scripts/prepare_app.py` change excludes
reference art/images from app copies and removes only the previous generated
`public/reference/art` copy during each app build. Original references and
canonical asset exports are unchanged. This closes an incidental-publication
path required by the editor handoff.

Ship-layout validation notice (2026-09-08 23:04 local): the earlier full gate
passed 208 tests. After `assets/runtime/assembly/catalog.json` and
`catalog.voxels.json` changed at 23:01:52, the later gate passed 220 tests but
failed two existing `packages/content/src/assembly.test.ts` cases: default
`floor--2--4` overlaps `wall--2--4`, and the cargo support fixture reports missing
occupancy. An isolated rerun reproduces both. The layout editor session has not
edited these asset files or legacy placement rules and will not replace another
owner's catalogs/proxies to force a pass. See
`output/playwright/ship-layout/assembly-isolated.log` for the asset-owner follow-up.

Ship-layout final handoff: local planner code and review evidence are delivered
in `docs/handoffs/ship_layout_editor_stages_0_2.md`. The supplemental native UI
review namespace is `assets/art-library/ship-layout-editor/`; it does not modify
the equipment/hull owners' canonical ledgers. `art:check` additionally reproduces
a manifest-hash failure for the externally updated runtime `catalog.json`.
The build and independent application isolation checks pass. No world/asset
publication or reset was performed by this editor session.

Ship layout Stages 0–2 final cleanup: closed only the `ship-layout` Playwright browser session after evidence verification. Managed dashboard/client/database services remain running. Owned implementation is ready for review; validation limitations are recorded in the handoff.

2026-09-09 Hull workspace follow-up: layout editor session owns new
`packages/content/src/layout-assembly.ts`, `packages/render/src/layout-hull.ts`,
`apps/dashboard/src/shipyard/layout/HullWorkspace.tsx` and narrow changes to the
existing layout schema/validation/composition. Reuses current assembly catalog,
Wayfarer placements and exported GLBs read-only; no shared asset, gameplay,
legacy renderer or publication edits. Browser session `layout-hull` is released
on completion. User requests an orbitable Hull workspace and individual editable
existing ship building blocks.

2026-09-09 08:31 layout Hull/Objects browser review: `layout-hull` is active.
Concurrent `hull-decals` software-GPU review was observed; no other browser or
asset process is touched. Hull source integration remains read-only. The layout
viewport now pauses rendering while idle; review is moving to a smaller browser
viewport while GPU-heavy art sessions coexist.

2026-09-09 08:48 layout review: shared Hull/Objects integration now includes the
hull-decals session's `HullDecalPanel` / `updateHullDecals` additions. These are
preserved; the layout session does not claim their authoring or approval.
All 20 Hull interaction checks and 14 Objects checks passed, plus six import,
projection, DPI/mobile checks. The browser was closed for the full validation
rerun: 292 tests and documentation/type checks pass; build and art:check pass.
Final UI polish corrects component-list row shrinkage and reveals inspector
properties when selecting a row. A short final screenshot pass will use only
`layout-hull`, then release it again.

Layout Hull/Objects follow-up complete: final exact-source screenshots and native
UI source preserved in `assets/art-library/ship-layout-editor/revisions/r002/`.
Only `layout-hull` was closed; other browsers and all managed services remain.
Final screenshot capture has zero page errors. Review details and boundaries:
`docs/handoffs/ship_layout_editor_hull_objects.md`.

2026-09-09 layout editor live activation: owner explicitly requested making the
editor live. This session builds and refreshes only the managed dashboard on
5174, verifies its existing HTTPS 8445 proxy with isolated `layout-live` browser,
and preserves client/database processes, auth proxy configuration and other
owners’ assets. This activates local draft editing, not live ship refit.

2026-09-09 editor motion follow-up: layout session owns changes to
`packages/render/src/layout-hull.ts` to remove the active render cap and camera
inertia and avoid redundant automatic mesh picking during drag/orbit. Uses only
`layout-motion` browser. Existing asset, decal, gameplay and auth work is preserved.

Editor motion follow-up complete: live HTTPS review passes seven interaction
checks, including surface picking/drag and exact undo, with zero page errors.
Full check passes 297 tests and full build passes. Only `layout-motion` browser
was closed. Evidence and current motion policy are in the Hull/Objects handoff.
Managed dashboard serves the verified change; all service PIDs are unchanged.

2026-09-09 character components: character authoring session owns
`scripts/character_components/`, `assets/runtime/crew/components/`, the new
modular crew source, component catalog, armor-slot inventory integration and
`docs/character_component_authoring.md`. Preserve `crew-astra.blend`, staged
combat pose sources, existing item UUIDs and other agents' working files.

2026-09-09 character component checkpoint complete: native modular crew r002,
90 real armor items, both body types, eight hair styles, four original-crate
uniform delivery and bidirectional paper-doll drag are active in development.
Published with data deletion disabled. Full checks/build/art and isolated smoke
pass; 121 real Babylon fitting views and connected UI pointer evidence are
archived. Only the `components-light` review browser was closed. No owner art
sign-off was inferred. Resume from `assets/art-library/character-components/INDEX.md`
and `docs/handoffs/character_components.md`; preserve staged combat sources.

2026-09-09 character fidelity follow-up: character authoring session owns an
isolated medic/base/hair calibration revision and `scripts/character_components/`
reference-study tooling, character reference crops and guide updates. Independent
Astra reviewer owns `docs/handoffs/character_reference_review_stage*.md`. Preserve
r002 runtime, inventory IDs and staged combat poses. This focused study is a new
visual quality pass, not owner sign-off of the current coarse shapes.

2026-09-09 character/pose release integration: this root owns narrow shared pose wiring and the development-only paired asset route; r008 normal modular publication is delegated within this thread. GPU ownership rechecked: specialist is closed, inventory-live and planet-final are blank, authoring-proof/cargo-loose have no live Babylon engines; art-library/floor-kit-review are static galleries. Named session `character-pose-release` claims the serial review slot now and will be blanked/closed afterward. Other sessions are preserved.

2026-09-09 character/pose release complete: owner-authorized normal-game r008 models and paired r002 equipment poses are active without a query gate. `character-pose-release` was blanked and closed; the software-GPU slot is released. Other browser sessions and database/dashboard services were preserved. Full check/build/art validation pass. Lowering intersections, rifle/scope fit, limited continuous playback and WebGL warnings remain explicitly open in `docs/handoffs/character_pose_live_release.md`; publication is not final artistic sign-off.

2026-09-09 inventory quality-of-life: this thread owns CanvasUI inventory/tooltips/character tabs, the additive transfer/drop reducers and filtered ground projection, narrow App/net/renderer ground-item integration, and its evidence. Preserve concurrent performance changes. Browser/GPU slot request is pending the existing `render-performance-review` session; that session currently has no render loops and paused RAF but remains open. No other browser is changed. Intended new session: `inventory-qol`.

2026-09-09 inventory QoL browser review: render-performance handoff records sign-out, blank/close and GPU release; browser list confirms that session is closed. `inventory-qol` now claims the serial software-GPU slot for connected inventory/ground-item review. Its earlier Canvas2D/NullEngine fixture is presentation-only evidence. Other sessions remain unchanged.

2026-09-09 inventory QoL complete: additive validated transfer/drop authority and the owner-authorized UI are active in the normal game. Public release `f36662364a8298de7db3e83e46e2375537fdecbe4aa1636c8b176d534c7f6bb2` was reviewed at https://sidereal.dastari.net/. Full check (548 tests), build, art validation, isolated smoke and independent visual review pass. Review inventory placements were restored, with no ground drops remaining. The private review account was signed out, and only `inventory-qol` was blanked and closed; the serial software-GPU slot is released. Database, development client, dashboard and other browser sessions were preserved. Living revisions and remaining scope are recorded in `docs/handoffs/inventory_qol.md`; final owner artistic sign-off remains unset.

2026-09-09 inventory Tetris correction: this thread owns the narrow CanvasUI grid/held-footprint correction and `ui.inventory-slots` r002. The owner requires multi-cell spatial inventory throughout. Current browser list matches the previously idle preserved sessions, with no new GPU claimant recorded. `inventory-tetris` claims the serial review slot; only that session will be opened and closed. No authority or model changes are planned.

2026-09-09 inventory correction validation note: current full check passes typecheck and 631 tests, but the concurrently updated `packages/world/src/construction-traversal.test.ts` fails "same owner two-character contention reserves both landings while a second instance remains independent" at line 427 (`constructionTraversalPositionAllowed` returns false instead of true). This thread has not changed traversal source/tests. Inventory UI, fixed-cell scrolling, fit and transfer focused tests pass; aggregate build passes. The traversal owner should reconcile the new landing-reservation expectation.

Inventory correction validation update: the traversal test passed in isolation and the subsequent complete check passed all 632 tests / 126 files, typecheck and 75 document checks. No traversal changes were made by this thread. The earlier shared-tree failure is retained in the validation logs.

2026-09-09 inventory and character polish complete: fixed 48-unit Slots grids, simplified transfer/capacity headers, validated Store all and Escape Crew skin/hair colors are active in the normal game. Full check passes 635 tests; build, isolated authority smoke, connected/public browser checks and independent desktop review pass. Live public release is `2affa484dc8bc4cf457ad4f7baa68f756ae0919e986ade98ae87d3497b88f048`. All 71 review item placements and the original appearance were restored through validated reducers. Sign-out was verified by reloading the public origin to its sign-in screen. Only `inventory-tetris` was blanked and closed; the serial software-GPU slot is released. Database, development client, dashboard and other browsers were preserved. Living revisions are inventory r003 and character UI r005, with no final owner artistic sign-off. See `docs/handoffs/inventory_tetris_and_polish.md`.
