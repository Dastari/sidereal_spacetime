# Map pen, hierarchy and display scale — 2026-09-22

GrayLotus implemented Studio 0.11.0 on `feat/map-drawing-interactions` in
`/root/sidereal-studio-release`, based on upstream `3a768539`. The canonical
`/root/sidereal_spacetime` IFCS/art working tree was left untouched. The owner
already authorized merge/publication. This handoff records pre-publication
acceptance; the PR description records the final merge/activation evidence.

## Implemented

- P starts a closed polygon/curve zone at the current camera. Click corners,
  drag mirrored Bézier handles, then click the first point, double-click or Enter
  to finish. Escape cancels. Undo/redo applies to unfinished anchors until commit;
  a completed zone is one history operation. Validation keeps invalid drafts.
- Grouped drawer tools have hover/focus descriptions and shortcuts. More drawing
  tools and blank-canvas menus expose polygon, box and ellipse zones/fields.
  Right-click opens context actions; right-drag pans without a browser menu.
  Point actions smooth/corner/split/delete. Keyboard context menu/Shift+F10,
  arrow navigation and Escape restore the invoking control's focus.
- Tree drops reparent celestials and nested zones within the current system,
  preserving world positions/IDs/children in one undoable edit. Reject invalid
  parents, cycles, excessive nesting, ships and cross-system transfers. Catalog
  moons encoded as planet rows use their derived role for drop validation.
- Selected orbit guides update planar parent distance and straight-line ETA during
  movement; bounded arc labels fall back to readable nearby text at small radii.
- One shared presentation conversion lives in UI 0.5.0: **1 gameplay metre =
  100 displayed km**. The owner chose compressed gameplay/display conversion;
  this exact factor is the documented initial calibration, not a claimed explicit
  numeric approval. A 20 m gameplay diameter displays as 2,000 km. Map and live
  Genesis inputs edit km and invert the conversion before saving. Distances and
  speeds scale together; 30 gameplay m/s displays as 3,000 km/s, preserving ETA.
  See [the scale ADR](../adr/ADR-20260922-map-interaction-scale.md).

Construction, character and asteroid sizes remain gameplay metres. Existing
in-game instrumentation remains in gameplay units; future astronomical navigation
must reuse the shared conversion. This is no geometry/physics migration and does
not fix existing celestial/orbit proportions or implement acceleration-aware ETA.
Cross-system tree transfer needs an atomic multi-document authority operation;
this release refuses it rather than partially moving a body.

## Validation

- Full `npm run check`: typecheck and **304 suites / 1,550 tests passed**, two
  existing skips. The final docs check fails the same **36 inherited missing
  links** as before this change. No new missing-link failures.
- Full `npm run build` and final dashboard build passed. Existing large chunk
  warnings remain. Changed-file ESLint, focused 21 tests and final typecheck pass.
- Real Chromium UI fixture: mixed straight/curved four-anchor closure, one-step
  undo/redo, point context smoothing, tree reparent/undo, invalid drop rejection,
  changing orbit measurement during drag, right-pan without menu, keyboard menu
  focus restoration and more-tools availability. Edge checks cover double-click
  drift, Escape during pointer capture, and a rapid click following a curve drag
  (which must remain an unfinished four-anchor path).
- Genuine Keycloak PKCE with the retained `sidereal-development-review` account
  against isolated server3291 / database
  `sidereal-studio-review-live-map-genesis-r0001-smoke`. Curved generic zone saved
  at revision8; planet-parent reassignment saved at revision9 and reload preserved
  coordinates and all four anchors/handles. Editing displayed radius 3,225 km
  stored 32.25 gameplay metres at revision10; live Genesis showed the same value.
  No public-world writes. No authority module changed, so no new authority smoke
  was required for this UI-only release.
- Review cleanup: isolated `draft.read` revoked at revision5, `draft.write` at
  revision4; temporary provider construction-admin role removed and genuine OIDC
  browser session signed out. Account and private credential record retained as
  instructed. See [review account operations](../review_account.md).

Local browser scripts/logs are `/tmp/map-tools-*`; representative images are
`/tmp/map-tools-scale-review.png`, `/tmp/map-tools-edge-review.png` and
`/tmp/map-tools-live-save.png`. These are supplemental local artifacts; the
acceptance above does not depend on retained screenshots or expose credentials.
Independent read-only interaction review caught and verified fixes to completion
access guards, double-click handling, clipped labels and nested-drop validation.

## Scoped publication

After PR merge, overlay only changed map-editor source, the new shared unit module,
UI package version/export, dashboard version and corresponding lock metadata onto
`/root/sidereal-studio-dashboard-release`. All pre-existing changed map files match
its baseline exactly; preserve unrelated release features and dependency pins.
Run only the dashboard build and managed stop/up-dashboard lifecycle there.
Never copy review `dev.toml`, publish a world module, reset a database, or replace
that live source tree wholesale. Live Studio is
`https://sidereal.tail7a58a6.ts.net:8445`; game/authority releases are independent.
