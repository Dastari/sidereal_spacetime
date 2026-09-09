# Authored Wayfarer: cockpit support, inspection and cargo UI

2026-09-10 — implemented in source; combined cargo/interaction browser acceptance and release pending.

The client subscribes to the server-filtered keyed cargo roots/items and carried revision sidecars. Native accepted document placements resolve to the existing published display catalog by asset ID, with their new instance placement UUIDs. Visible native meshes participate in picking; structural categories prevent floor/wall/roof selection and keep opaque geometry in the pick ray. Selection remains a presentation feature, never access authority.

Reachable solid containers open the existing inventory UI. Drag/rotate submits exact placement and expected item/source/destination/character revisions to `transferScopedCargoItem`. Quick transfer proposes a fit using the existing complete inventory solver. Pickup tries carried grids (backpack before pockets); it never sends an empty implicit destination to the new reducer. Bulk transfer is a sequence of independently accepted transactions, waiting for the accepted cache revision between items, stopping and reporting exact partial progress on error. Equipped items must be stowed before this cargo transfer. Legacy private inventory actions retain their existing reducer path.

No private base tables or hidden contents are cached for this feature. Revoking access/range removes projected contents. Nested liquid payload fields remain truthful; reservoirs never become solid item grids. Instance light rows use actual placed UUIDs in the renderer's per-placement material copies. Minimum own-seat state blocks locomotion during safe recovery without restoring a revoked instance document.

## Cockpit acceptance

The exact qualified sill support scalar is passed to the character presentation without adding the floor datum twice. Actual keyboard travel across the authored doorway produced `standingElevationM = 0.21875`, matching `crew-placement.position.y = 0.21875`. Walking toward the pilot-seat approach and back returned to `0.1875` floor support. Returning through the actual review button preserved actor `babceca2-d1d9-455e-8902-94248434a6db`, original ship `b57b30c3-6fc7-485d-9c2e-1006b27b4e67` and original position `(0, 10.25)`.

Evidence: `output/playwright/wayfarer-browser-review/support.json`, `threshold.png`, `threshold-return.json`, `threshold-return.png`, `exit.json`. The named browser is closed. Its final sign-out button disappeared during development hot reload, so provider logout is not claimed for that closing step.

Focused tests cover new instance identity mapping, revoked/malformed document handling, actual nested liquid display, independent revision requests, auto-fitting and equipped/access rejection. The existing actual-native GLB test now checks category/pickability as well as preserved material/transform/library/roof/disposal behavior. Full release evidence will be appended after the combined candidate passes.
