# Historical layout editor activation — 2026-09-09

The owner requested making the local visual-layout editor checkpoint available live. This activation did not include an authored-ship path into gameplay. Later server publication and native-floor walking work is recorded separately in `construction-walking-2026-09-09.json`; full ship construction remains incomplete. That activation was served at
[the HTTPS Shipyard dashboard](https://sidereal.tail7a58a6.ts.net:8445/shipyard)
through the existing tailnet proxy. This is the configured managed Vite review
service; a production static-host release is not claimed.

`npm run build:dashboard` passed. The dashboard alone was refreshed through
`npm run stop:dashboard` and `npm run dev:dashboard`. At that checkpoint dashboard PID was 3321167;
client PID 3138575 and database PID 2854077 were unchanged. No world publication,
database reset, auth configuration change or canonical asset export occurred.

A fresh browser visited the HTTPS URL, loaded the existing Wayfarer's 262
independent placements, displayed Hull and Objects with native 3D assets, pasted
an object to reach 263 placements and undid the paste to restore 262. All five
activation checks passed with zero page errors. Actual 1680×1000 screenshots,
the exported source checkpoint, build log, browser script/results and activation
hash record are in `output/playwright/layout-live/`. The isolated `layout-live`
browser was closed after review.

Implementation validation remains recorded in
[the Hull/Objects handoff](../handoffs/ship_layout_editor_hull_objects.md):
292 tests, full build, art validation and 40 browser assertions passed.
This activation exposed the bounded local visual draft editor checkpoint. At that date, blueprint publication,
live ship refit and capture-live were unavailable authority stages.
Browser drafts remain scoped to their origin; drafts previously saved on the
HTTP dashboard remain there and can be exported/imported into the HTTPS origin.


## Subsequent construction status — 2026-09-10

This historical visual-editor release is not the current construction completion claim. Later private blueprint publication and independent review-instance spawning are connected to SpacetimeDB and the game. Exact native traversal/pressure fixtures and a full-visual one-deck Wayfarer static walking review have separate evidence. See [current verification](../verification.md) and [qualified Wayfarer walking](../handoffs/wayfarer_walking_integration.md). A complete functional multi-deck ship, supported cargo/services/damage, no-loss live refit and capture-live workflow are still incomplete. Neither the original five visual checks nor the later isolated walking review proves those milestones.
