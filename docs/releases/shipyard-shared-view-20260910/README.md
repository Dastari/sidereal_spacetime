# Shipyard editor candidate — 2026-09-10

The independent dashboard artifact is built and pinned. Its editor changes are already available through the managed dashboard source service. This record does **not** claim that the immutable artifact has been deployed.

Artifact: `.runtime/releases/shipyard-shared-view-20260910/dashboard-3d2e1b20fd36313ad40611c63884d27cb10a72f5b11690d2c11d1df78cc168de`.

SHA-256: `3d2e1b20fd36313ad40611c63884d27cb10a72f5b11690d2c11d1df78cc168de`, using `scripts/public_client.validate_build`'s file-tree digest. [candidate.json](candidate.json) records the exact source delta, baseline and runtime asset hashes.

The release agent supplied the immutable `remote-exterior-20260910` source snapshot. Only editor commits `0157b507` and `5853a5da` were applied, plus the independently reviewed placement regression test from `e8a95e8b`. The baseline predates the antialiasing exports: the sole reconciled export is `@sidereal/render/layout-hull`. No other graphics, character, inventory or authority work was pulled from the dirty shared tree.

All 1,249 runtime asset files exactly match that baseline. The new outward wall/cabinet correction candidate is **not installed**. The canonical Wayfarer template remains `362f37217f63a44a470676f104c8368bd0973ca03f5e29eab190bc4d6df71340`.

## Included behavior

- **Inspect current Wayfarer template** creates a separate editable draft through the existing recovery-preserving path, opens Objects, hides the roof and selects the first cabinet. It explicitly says this is not a live ship capture and excludes later saved game changes/additional fuel attachments.
- Structure, Rooms, Objects, Hull and Systems retain one camera, projection, orbit and zoom. The editable floor overlay projects onto the native deck; document changes do not trigger an unsolicited refit.
- Grid spacing, rotation and native placement height remain consistent. Horizontal snapping preserves the native `0.1875 m` deck-top datum. Wall creation requires a continuous shared floor-edge chain; imported legacy residual offsets are preserved rather than silently normalized.

## Validation

The isolated candidate passed dashboard TypeScript checking, all 16 focused tests across five files and `npm run build:dashboard`. The ordinary large-chunk warning remains. The artifact validator rejects internal `docs/`, `reference/` and `PIVOT.md`; this candidate passes and includes only the allowlisted public Shipyard help.

Actual browser acceptance of the editor commits is recorded in [the shared-view handoff](../../handoffs/shipyard_shared_view.md), with exact camera comparisons, cabinet rotation/height, draft recovery and viewed screenshots under `output/playwright/wayfarer-shared-view/`. The isolated artifact itself has not had another browser session; the GPU slot is reserved for the concurrent game/AA review. No hardware FPS claim is made.

The earlier full shared-tree check passed TypeScript and 1,359 tests, with one unrelated planetary stress-test timeout; its isolated rerun passed all five planetary tests. This dashboard-only candidate did not build/publish the world or rerun authority smoke tests because it contains no authority changes.

## Serving and activation boundary

Read-only checks returned HTTP 200 for:

- `http://127.0.0.1:5174/shipyard`
- `http://sidereal.tail7a58a6.ts.net:5174/shipyard`
- `https://sidereal.tail7a58a6.ts.net:8445/shipyard`

The HTTPS8445 handler proxies to `http://127.0.0.1:5174`. It currently serves managed Vite source. Existing commands are:

```sh
python3 scripts/dev.py up-dashboard
python3 scripts/dev.py stop-dashboard
```

Those commands manage the source server; they **do not activate a pinned dist artifact**. There is no `public-dashboard-stage` or `public-dashboard-activate` command in the current lifecycle. Do not pass this artifact to `public-client-stage`, change the game proxy, or describe a dashboard restart as immutable activation.

To deploy this exact artifact, the next operations slice must add an independent managed dashboard static launcher with digest-guarded activation/recovery, SPA callback fallback and the existing `/v1` WebSocket/HTTP proxy. Preserve HTTPS8445 and its registered PKCE callbacks. This is a concrete prepared candidate, not an invented activation command. The build embeds `VITE_CLIENT_URL=https://sidereal.dastari.net` and the existing dashboard auth origin, so Open game points to the live game.

Reproduce the build inside `.runtime/release-checkouts/shipyard-shared-view-20260910`:

```sh
npx tsc --noEmit -p apps/dashboard/tsconfig.json
VITE_CLIENT_URL=https://sidereal.dastari.net VITE_DASHBOARD_URL=https://sidereal.tail7a58a6.ts.net:8445 npm run build:dashboard
```

No service was restarted during this candidate preparation. No database, public client, provider setting, existing draft or live ship was modified.
