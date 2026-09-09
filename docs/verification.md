# Verification record

Status: shared-entry release installed; authored construction remains a bounded review capability
Last updated: 2026-09-10
Owners: Sidereal project

## Current checkpoint — 2026-09-10

The installed normal shared-entry candidate passed 932 tests in 159 files, strict TypeScript, 76 document/provenance checks, the full world/client/dashboard build, installed art validation, 33 lifecycle Python and nine art Python checks, and isolated authority smoke. These counts identify that exact release; unregistered follow-up work must get new checks rather than borrowing this result.

Dedicated Dastari Keycloak at `https://auth.dastari.net/realms/dastari` supplies real PKCE login. Original-provider-token admission fixes the host's 60-second transport-ticket expiry; it does not reinstate periodic socket churn. Fresh real accounts now enter the canonical shared system atomically. Existing private actors reconnect in place and explicitly choose **Map → Join shared system**. Two actual accounts observed canonical bodies, native remote ship exteriors and authoritative movement. The normal Map/Join/no-query reload flow passed isolated browser acceptance. Public route/artifact bytes and authoritative state continuity passed; final public browser evidence is recorded in the [shared activation ledger](handoffs/shared_world_normal_activation.md).

Across public publication, 603 item rows, 165 containers, 25 characters, 25 stations, 17 inventory states, 85 hotbar rows, three appearance rows and six weapon-energy rows were unchanged. All 25 ship IDs/static columns were preserved; previously moving ships advanced only dynamic position/heading/tick between timed snapshots. The separate private-to-shared HUD fixture retained all 99 authoritative items/18 containers and its IDs; it had no custom appearance row and is not cited as a custom-appearance test.

Construction has authored multi-deck documents and exact supported native traversal/pressure fixtures. The full 262-placement, one-deck Wayfarer visual template was published/spawned twice in an isolated authority database, walked with conservative collision, shown with native roof/cutaway behavior and exited safely in the game. The normal live ship has not been replaced by a complete functional authored multi-deck vessel. General utilities, cargo stacking, pressure-rated airlocks, independent functional equipment/contents and localized native destruction are not completed by this review. See [qualified Wayfarer review](handoffs/wayfarer_walking_integration.md) and [construction requirements](ship_construction_rebuild.md).

Actual same-host isolated restore and two restarts passed for the earlier pinned cold archive. A fresh pre-release archive was captured with a 26.042-second managed writer pause; that new archive was not duplicated/restored again. Neither proof establishes off-host recovery, point-in-time recovery, abrupt-failure correctness or production capacity. Public game and dashboard retain independent release boundaries; server auth remains hybrid-development during migration.

## Historical M0 verification — 2026-09-08

The installation counts, 11-test result, Orchard discovery and screenshots below describe the original scaffold only. They are preserved as dated evidence, not current authentication, test totals or feature status.

## Preserved installation and sources

- Old managed Sidereal stack stopped through its canonical lifecycle tool; its Postgres container stopped with Compose. No unrelated host infrastructure was stopped.
- Full workspace `cargo clean`: 127,935 files / 195.3 GiB logical build artifacts removed. Actual filesystem recovery was approximately 65 GiB; the original `target` directory is absent.
- Original source, authored content, downloadable client and database volume retained. Private custom-format database backup: `/root/sidereal-backups/pre-spacetime-pivot-2026-09-08.dump`, 1,149,265,346 bytes, mode 0600. Its restore listing passed; a full legacy restore was not tested.
- 243 legacy documents copied and inventoried by path/status/headings/SHA-256; 1,196 imported source/content/art files recorded with hashes. The document/source checker verifies every imported hash. Orchard documents are retained separately; its art packs and credentials were not imported.

## Historical working software

Node 24.18.0; npm 11.16.0; TypeScript 6.0.3; SpacetimeDB CLI/server/SDK 2.10.0; Babylon.js 9.25.0; React 19.2.8; Vite 8.2.2; Blender 4.3.2. Packages are locked. A clean `npm ci` succeeded and the npm audit at installation reported zero vulnerabilities. The reviewed Blender MCP commit and frozen Python dependency versions are recorded in the asset documents/lockfile.

| Verification | Result |
| --- | --- |
| Clean install and `npm run setup` | Passed; project-local pinned SpacetimeDB, no global PATH change. |
| `npm run check` | Strict TypeScript plus 11 tests in 3 files; documentation links and imported file hashes pass. |
| Individual app TypeScript checks | Both `@sidereal/client` and `@sidereal/dashboard` pass independently. |
| `npm run build` | World module, generated bindings, game bundle and dashboard bundle built. World builds/publications explicitly run their own TypeScript check. |
| `npm run smoke` | Real two-identity reducers/subscriptions: owner-only views, private base table rejection, unauthorized edit rejection, revision conflict and idempotency, authoritative flight, unseated flight rejection, cabin walking and malformed-input rejection. |
| `npm run smoke:restart` | Same test ship UUID, renamed value and edit receipt survive a complete managed database shutdown/startup. |
| `npm run verify:isolation` | Client-only build leaves dashboard/world artifacts unchanged; dashboard-only build leaves client/world unchanged. Either app can stop/start while its sibling and database remain running. |
| `npm run art:export` | Blender collection instances realized and exported to a 1,067,628-byte GLB. Repeat export produced the same output hash; source hash remained unchanged. |
| `npm run art:verify` | Configured stdio MCP initialized, 28 tools listed, `get_scene_info` succeeded through the isolated Blender process. Session shutdown released its local port/processes. |
| Browser, Chromium/WebGL2 | Real GLB loaded; W produced server-owned velocity; TAB switched to bow-left cabin; E left the seat; walking/rename UI exercised; rename persisted after browser reload. Dashboard navigation, component specimens, model inspection and mobile layouts checked. |
| Provider discovery | Existing Orchard Keycloak discovery/JWKS endpoint metadata fetched; PKCE S256 advertised. New Sidereal client registrations prepared, not installed. Startup/publication refuses an unimplemented production auth mode. |

Tests and screenshots are locally available under `.runtime` and `output/playwright`. These paths are ignored by git; private identity evidence must not be copied into public docs or browser assets. The original disposable smoke fixture could be reset only in its isolated namespace; current named smoke publication is additive and never resets the normal database. Service addresses come from `dev.toml`, including app builds and smoke configuration.

## Historical browser evidence

Local screenshots: `output/playwright/flight.png`, `interior.png`, `shipyard-3d.png`, `dashboard.png`, `ui-components.png`, `client-mobile.png`, `dashboard-mobile.png`. Mobile verification covers layout, not touch flight controls. The collaborative inline-preview tool timed out; direct Chromium automation and HTTP checks succeeded. This is a preview-tool limitation, not a failed game/server health probe.

The native GLB study contains 887 source meshes. It is a review asset; mesh batching/instancing, full modular roofs/exteriors, LOD, memory and GPU load targets are M2/M9 work. Renderer imports were narrowed to used Babylon modules; a lazy renderer chunk remains above Vite's size advisory. SpacetimeDB's CLI also emits a hoisted-TypeScript discovery advisory; the project wrapper runs the independent world TypeScript gate explicitly, and the build passed. No MMO load capacity or production GPU performance claim follows from these tests.

## Remaining work and limitations

Shared-space rendering does not provide boarding, shared crew interiors, arbitrary remote character visibility or full multiplayer gameplay. Installed stock flight still uses bounded fixture mass/actuator policy; utilities and arbitrary installed-component capability changes need their own authority integration. General multi-character selection, latency/replay and load acceptance remain incomplete. Existing inventory, personal combat, native character/pose and graphics work is implemented in slices; this record does not reclassify it as wholly absent.

Construction remains the highest next priority: qualified support/clearance; fresh per-instance functional equipment and storage; pressure/airlock resource/interlock behavior; cargo grids and supported stacks; 3D services; elevator operation; armor and localized structural/native destruction; then a complete semantic Wayfarer and no-loss existing-ship migration. An editor label, a pure validator and an isolated static walking instance are different completion levels.

Scripting has validated manifest/lifecycle foundations, not a fully implemented Script Studio or unrestricted hot-code pipeline. No old password, MFA secret or role was automatically migrated into Dastari. Production OIDC-only enforcement, broader abuse/capacity tests, supervised static hosting, off-host recovery and upgrades under load remain open. The public NPM route now points to the managed Sidereal browser release; the old Rust game remains stopped. See [operations](operations.md) and [public routing](public_game_routing.md).
