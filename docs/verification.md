# Scaffold verification record

Status: M0 foundation verified; later gameplay phases remain open
Last updated: 2026-09-08
Owners: Sidereal project

## Current checkpoint — 2026-09-09

The sections below preserve the original M0 verification, including its 11-test count and then-planned Orchard registration. They are **historical**, not the current test total or authentication state.

The construction walking checkpoint passed 415 tests in 94 files, typecheck, build, art validation and isolated authority smoke. Dedicated Dastari Keycloak login, identity transfer, inventory/appearance preservation, occupied-session renewal and managed database restart were tested. Character pose and Graphics/local-light controls passed functional browser review with documented art limitations.

Actual Shipyard save/load/publication, two independently allocated instances and native-floor walking/collision/reload/return passed. Multi-deck document storage is implemented; operational inter-deck traversal, complete pressure/doors/services and the full Wayfarer rebuild remain incomplete. See [the exact construction checkpoint](releases/construction-walking-2026-09-09.json) and [current integration work](handoffs/integration_continuation_worklist.md). Later edits need fresh checks; these counts identify a dated snapshot.

Visible shared-space multiplayer and production OIDC-only rollout are not claimed. Original installation, failure-recovery and capacity limitations below must be interpreted against their recorded date.

## Preserved installation and sources

- Old managed Sidereal stack stopped through its canonical lifecycle tool; its Postgres container stopped with Compose. No unrelated host infrastructure was stopped.
- Full workspace `cargo clean`: 127,935 files / 195.3 GiB logical build artifacts removed. Actual filesystem recovery was approximately 65 GiB; the original `target` directory is absent.
- Original source, authored content, downloadable client and database volume retained. Private custom-format database backup: `/root/sidereal-backups/pre-spacetime-pivot-2026-09-08.dump`, 1,149,265,346 bytes, mode 0600. Its restore listing passed; a full legacy restore was not tested.
- 243 legacy documents copied and inventoried by path/status/headings/SHA-256; 1,196 imported source/content/art files recorded with hashes. The document/source checker verifies every imported hash. Orchard documents are retained separately; its art packs and credentials were not imported.

## Working software

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

Tests and screenshots are locally available under `.runtime` and `output/playwright`. These paths are ignored by git; private identity evidence must not be copied into public docs or browser assets. Smoke tests reset only the explicitly isolated database ending in `-smoke`, never the normal lab database. Service addresses come from `dev.toml`, including app builds and smoke configuration.

## Browser evidence

Local screenshots: `output/playwright/flight.png`, `interior.png`, `shipyard-3d.png`, `dashboard.png`, `ui-components.png`, `client-mobile.png`, `dashboard-mobile.png`. Mobile verification covers layout, not touch flight controls. The collaborative inline-preview tool timed out; direct Chromium automation and HTTP checks succeeded. This is a preview-tool limitation, not a failed game/server health probe.

The native GLB study contains 887 source meshes. It is a review asset; mesh batching/instancing, full modular roofs/exteriors, LOD, memory and GPU load targets are M2/M9 work. Renderer imports were narrowed to used Babylon modules; a lazy renderer chunk remains above Vite's size advisory. SpacetimeDB's CLI also emits a hoisted-TypeScript discovery advisory; the project wrapper runs the independent world TypeScript gate explicitly, and the build passed. No MMO load capacity or production GPU performance claim follows from these tests.

## Remaining work and limitations

This is a runnable scaffold, not a migrated complete game. The lab currently uses private per-identity fixture ships, a simple cabin collider/crew proxy and fixed fixture mass/thrust. Multi-character accounts, shared crew admission, full interest/redaction, input acknowledgement/replay, real component-derived capabilities, utilities, inventories, combat, tactical instruments, factions, industry and the full authoring tools remain phased work.

Scripting currently has validated type/manifest/lifecycle contracts. It does not yet execute or hot-publish owner scripts. Core lifecycle integration begins M1/M2; Script Studio starts M3. OIDC reuses the selected existing provider, but real login, registration deployment, server audience policy and trusted admin bootstrap remain M1. No old account password, MFA secret or role was automatically migrated.

Durability verification used graceful restart. Abrupt failure, complete new-world restore, upgrades under load and production TLS/auth/abuse checks are M9 acceptance gates. New app servers are development Vite processes managed by the project runner. The legacy public reverse proxies/router were not redirected; use the new LAN addresses in [operations](operations.md).
