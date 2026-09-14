# Shipyard editor fixes — flicker, double outline, hidden walls, shortcuts

Date: 2026-09-11. Owner-reported issues on the Shipyard route, fixed in the working
tree. Not committed: the touched files also carry another owner's uncommitted
Shipyard work, so the integration owner commits them with that slice.

## What the owner saw and why

**Whole UI flickered while moving the camera.** The floorplan SVG overlays were
projected onto the deck plane with a CSS `matrix3d` that included the full zoom
factor, so the browser composited a layer of roughly 12,000 × 10,000 CSS pixels
and re-clipped it with a new `clip-path` polygon on every rendered frame. The
render loop also invoked that DOM update on every warm frame for 1.5 s after any
input, and toggled `visibility` unconditionally. Measured in the live dev server:
`svg.layout-plan` bounding box 12,098 × 10,175 px under
`matrix3d(40.08, …, 9.12)`.

**Two blue outlines plus an L-shaped line.** Only one hull envelope is drawn. The
second outline was the structural wall guide mesh: each compiled wall is traced as
a closed quad (floor edge plus wall-top edge), and in Top view the top ring projects
offset from the base ring. The guides were also drawn on top of fully rendered
native walls instead of only where a native wall was missing.

**Walls showed as wireframe only.** The native wall preview is all-or-nothing per
deck and reported only "Invalid or stale compiled layout". Any floorplan validation
error, most often a positive-area floor overlap, withholds every native wall and
leaves the wireframe guides. Stamping a tile on top of existing floor was allowed,
which is how overlaps appeared. If a draft predates the v2 boundary-treatment
schema it also stays on the legacy centred r004 path; the palette note under
Structure says which applies. Start a New design to get the v2 path.

**Publish.** The Publish button opens the publication dialog, which requires a
signed-in Shipyard workspace (`Workspace · Signed out / Sign in to Shipyard`) and
then saves a remote draft before "Publish immutable blueprint" becomes available.
That flow is unchanged and was not exercised here because it needs the owner's
provider login.

## Changes

| Area | File | Change |
| --- | --- | --- |
| Overlay projection, plan views | `apps/dashboard/src/shipyard/layout/plane-overlay-transform.ts` (new) | Top/Side/Front are affine: the plan SVG draws at screen scale through an SVG `matrix()` on its content group, with no CSS transform and no oversized layer. The module also factors a general homography, with a unit test proving the split reproduces the projection to 1e-3 px, but the perspective branch is no longer used for the 3D view (see below). |
| Overlay projection, 3D view | `LayoutCanvas.tsx`, `packages/render/src/layout-hull-envelope.ts` (new), `layout-hull.ts`, `layout-assembly-preview.ts` | A first attempt kept a screen-scale raster and warped it with a residual perspective; at shallow angles that smeared dashes and text into streaks (owner screenshots). The 3D projection now renders no SVG content at all. The scene supplies what the plan drew: native floor meshes, the build grid (`showGrid` on in 3D) and a new dashed hull-envelope `LinesMesh` on the deck plane. The plan SVG stays only as the transparent pointer surface; clicks resolve the floor tile under the picked plane point. Hover ghost, dimension label and partition/route gestures are Top-view affordances and are not drawn in 3D. |
| Overlay wiring | `apps/dashboard/src/shipyard/layout/LayoutCanvas.tsx` | Both SVGs wrapped in ref'd groups, `overflow: hidden`, `viewBox`/box/transform applied imperatively with equality guards, guarded by try/catch; hover state only updates when the snapped cell changes and never during camera drags. |
| Render loop | `packages/render/src/layout-hull.ts` | `viewChanged` fires only when camera parameters or render size change, not every warm frame. |
| Guides | `packages/render/src/layout-structural-guides.ts`, `layout-hull.ts` | `baseOnly` option traces floor-level spans in Top/Side/Front; guides are hidden once every span on the deck has a native mesh and no issues; mesh rebuilds when the point count changes; F3-style `structuralWallGuides` reports 0 when hidden. |
| Wall diagnostics | `packages/render/src/layout-inset-visual-plan.ts` | Compiler gate now reports the error count and first message, e.g. "Native walls stay hidden until the floorplan validates: 14 errors (first: Positive-area floor overlap…)". |
| Overlap prevention | `apps/dashboard/src/shipyard/layout/state.ts`, `layout-gestures.ts` | `placeTiles` skips stamps that positively overlap existing floor on the deck; the gesture explains "That tile would overlap existing floor…" instead of committing an invalid layout. |
| Shortcuts | `apps/dashboard/src/shipyard/layout/LayoutEditor.tsx`, `HullWorkspace.tsx` | Ctrl+D deselects (owner convention), Ctrl+Shift+D duplicates and selects the copy, Ctrl+A selects everything on the deck, Ctrl+C / Ctrl+V copy and paste, R rotates clockwise and Shift+R counter-clockwise. Duplicates land on the first free offset so they never start overlapped. |
| Reference | `reference/art/editor-mockup-5.png`, completion plan section 2 | Owner's chosen UI basis recorded for Contract B and future routes. |

Existing behaviour confirmed, not changed: palette drag-and-drop onto the canvas
(`application/sidereal-layout`), Escape deselect, Delete, F / Shift+F mirror,
arrow nudges, middle-drag orbit, right-drag or Space pan, wheel zoom, Ctrl+Z / Y.

## Evidence

Headless Chromium against the dev server (SwiftShader, so no timing claims),
`output/playwright/shipyard-fix-20260911/`:

- `top.png`, `three-d.png`: 3 × 3 floor, 0 errors, native walls rendered (34 pieces,
  136 meshes, no issues), one hull envelope, no top-ring outline.
- Overlay in 3D: element box 1,354 × 515 px with a trapezoid clip instead of
  12,098 × 10,175 px; orbit of 30 pointer moves produced 67 DOM mutations, all
  transform/clip updates.
- Overlap stamp refused with the new message; duplicate, repeated duplicate,
  Shift+R, Ctrl+C/V produced 5 tiles with 0 errors (`top-duplicates.png`).
- Ctrl+A populated the inspector selection; Ctrl+D cleared it.
- `publish-dialog.png`: publication dialog requires sign-in.

Checks: `npm run check` passed (typecheck, 1,5xx tests, 86 docs); focused layout
and render suites pass (75 tests including the new overlay, guide and overlap
tests). Builds: see the integration note in `coordination-current.md`.

## Owner questions answered

- **Why no walls?** Native walls are withheld for the deck while the floorplan has
  any validation error; the "Native fit" note now states the count and first
  cause. Overlapping tiles drawn before this change are the usual cause and are
  listed under Validation; delete or replace them. Disconnected floor islands are
  the other common cause. A legacy draft (pre-v2 structure) uses the centred
  r004 wall path; start a New design for the current inward-wall path.
- **Why floor plates on some tiles only?** The native kit covers all twelve
  palette shapes and every shape stamped in the headless check received a plate
  (`three-d-native.png`). A tile without a plate did not match a native model,
  typically an old draft tile from before the native kit or a shape variant the
  matcher cannot resolve; the note reads "Floor at x, y m has no matching native
  model. Select a catalogue floor shape or check its model override."

## Open items

- Hardware confirmation of the flicker fix on the owner's machine; the
  collaborative preview tab reported `document.hidden` so its render loop was idle.
- The all-or-nothing native wall gate is intentional per its tests; per-span
  fallback remains a Contract A decision.
- Creator theme alignment to `editor-mockup-5.png` is Contract B work, not done here.
