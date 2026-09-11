# Shipyard HMR and database availability recovery

2026-09-11, approximately01:07–01:15 UTC. Two separate failures reported by owner.

## Dashboard

The source exported `LayoutInspector` correctly, but the managed Vite server returned
an empty179-byte transformed module (only source-map content) for both ordinary and
timestamped requests. `LayoutPanels.tsx` consequently could not re-export the symbol.
The evidence is consistent with a transient in-place file rewrite being cached; this
was not repaired by changing a valid named export to a default export.

Configured dashboard `server.watch.awaitWriteFinish` with200ms stability/50ms polling,
then ran `python3 scripts/dev.py stop-dashboard` and `up-dashboard`. The transformed
module was121,274bytes afterwards. Fresh HTTPS browser entry, Rooms/Inspector tabs,
reload and dynamic import of `LayoutPanels.tsx` passed: both named exports present,
one inspector, no page errors. Evidence screenshot:
`output/playwright/shipyard-walls/export-fix.png`. Named session `shipyard-hmr-fix`
was blanked and closed. Saved drafts were not altered by the repair. Prefer atomic
file replacement for future shared-tree scripted edits.

## Game502

Public POST `/v1/identity/websocket-token` returned502. The public frontend remained
running, but the managed database had stopped and loopback3100 refused connections.
The database log ended with a SpacetimeDB durability-actor panic. The filesystem was
100% full with168MB available; no explicit ENOSPC entry was present, so disk exhaustion
is a strong suspected trigger, not a directly logged definitive cause.

Removed only freshly generated, reproducible `apps/client/dist` and
`apps/dashboard/dist` outputs (~432MB combined) after verifying that the live public
client points to a separate immutable release. Also removed the re-downloadable npm
`_cacache` (~2.6GB); installed packages and running browser tooling remain. No authored
assets, source, recovery archives, live database files or current public release
were deleted. Free space recovered to approximately3.2GB.

Ran `python3 scripts/dev.py database-up`. This command uses
`database_up(publish_module=False)` and starts the existing data directory without
publishing/resetting a module or restoring an archive. Local/public `/v1/ping` then
returned200; unauthenticated token POST returned401 rather than502. The server log
recorded actual authenticated accepted connections again. All four managed services
reported running. This is an availability proof; no full inventory conservation
comparison or final crash-cause proof was performed during this recovery.

Recovery archives dominate `.runtime` storage; release checkouts consume32GB, including
repeated art-library copies. Do not delete these blindly. Future release work must
budget peak disk space, reuse immutable source pins and avoid duplicating entire art
libraries unnecessarily.3.2GB is limited headroom, not a durable storage solution.

## Validation

`npm run build` passed (existing large-chunk advisory). Generated outputs were then
removed as described above; they are reproducible and were not deployed. Formatting
check passed for the Vite config. Initial aggregate check passed1546tests but hit the
existing20-second planet-terrain test timeout while the review browser/build ran.
A final check after closing the browser is recorded below.

Final `npm run check` passed:1,549tests in274files, typecheck and77document checks.
