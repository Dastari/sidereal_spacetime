# Map context drawers, navigation and transparent portraits

Date: 2026-09-21. Agent Mail: GrayLotus. Follow-up to the published Studio release. User reports flicker during pan/zoom and supplies a star portrait whose opaque black rectangle covers the map.

## Evidence and fix

The background effect depended on camera state. Every update assigned canvas dimensions (which clears its bitmap even when unchanged), created a worker, and terminated the previous worker. In real Chromium, a 35-step drag plus ten wheel events created 45 workers and yielded 90 transparent/blank samples out of 138 frames.

The canvas now owns one worker for its mount. A bounded scheduler retains one active frame and only the newest waiting view; it paints completed frames during continuous movement rather than starving the output. Image plates and compiled region inputs are cached across camera-only updates. Canvas resizing happens in the same task as the replacement paint. Unmount cancels pending presentation and terminates the worker.

The same browser sequence after the fix created zero workers and yielded zero blank samples out of 149 frames. Four viewport resizes yielded zero blank samples out of 69 frames. Unit coverage checks latest-view coalescing, delayed preparation, disposal and failed preparation without clearing prior output.

Old map portraits were packaged from opaque reference screenshots and explicitly converted to RGB. The new native-preview capture option clears to transparent and exports renderer-produced RGBA, preserving dark surfaces instead of treating black as empty. `scripts/art_library/capture_map_portraits.mjs` drives a local dashboard through the Playwright CLI; `package_map_snapshots.py` verifies runtime pins and rejects opaque/incomplete captures before preserving alpha in WebP. New URLs avoid reusing cached opaque thumbnails. Loaded portraits also suppress the marker disk fill beneath their alpha pixels, preserving the outline and click target. Old portraits and exact capture PNG/metadata are retained as evidence/history.

## Validation / delivery

- `npm run check`: TypeScript passes; 297 suites / 1,497 tests pass, two existing skips. The command still fails at the inherited missing documentation-link gate.
- Pan/zoom and resize browser probes pass as described above.
- `npm run build`: passed after the drawer redesign, including world, generated bindings, client and dashboard. Final dashboard build also passes after the narrow-screen layout adjustment.
- Python packaging regression tests: two pass (dark opaque/partial-alpha preservation and opaque-capture rejection).
- `npm run art:check` stops at the existing absent `assets/source/voxel_wayfarer.blend`; no native source assets were changed.
- Native capture of Crystal at the initial larger size timed out while preparing meshes; capture resumed at the final 192px thumbnail resolution. Completed capture PNGs and matching metadata remain intact.
- All 29 native portraits captured, runtime pins verified and packaged as WebP with transparent corners and opaque surfaces. Browser review confirms the grid remains visible outside star and planet surfaces.
- Owner expanded this follow-up to include drawer icon controls, searchable Universe tree, explicit system/no-selection distinction and typed context properties. Browser checks pass for header ordering, celestial/nested-zone collapse and search, Escape/blank deselection, native right-drag context cancellation, numeric stepping/undo/empty input, curve insertion/removal and local save/reload. Catalog identity/radius/appearance/seed and live ships remain read-only under the existing reducer contract.

Source branch: `fix/map-background-flicker` in `/root/sidereal-studio-release`, based on upstream main after PR #16. Preserve canonical dirty `ifcs-update` work. The live Studio is managed from `/root/sidereal-studio-dashboard-release`; updates must be limited to this fix and must preserve the prior release's compatibility overlay. No database or game-client change is needed.

Versioned candidate: Studio 0.9.0, UI 0.3.0, Render 0.7.1. The narrow-screen workbench scrolls to both drawers; browser verification confirms inspector reachability at 390px without horizontal overflow. Tree arrow navigation leaves object coordinates unchanged.
