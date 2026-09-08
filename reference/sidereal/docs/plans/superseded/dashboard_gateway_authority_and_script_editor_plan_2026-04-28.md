# Dashboard Gateway Authority and Script Editor Plan

Status: Superseded
Lifecycle: superseded
Category: plan
Last updated: 2026-06-04
Owners: implementation owners
Scope: Dashboard Gateway Authority and Script Editor Plan.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

## 0. Implementation Status

2026-04-28:

- This plan records the audit outcome and target migration for making the dashboard server deployable separately from gateway and game servers.
- Audit starting state was mixed:
  - gateway-backed paths already exist for account auth, account character operations, admin spawn, Genesis planet drafts, and Shipyard ship/module drafts,
  - shader source/catalog reads, shader saves, audio registry reads/writes, audio payload preview, Genesis/Shipyard catalog reads, and Shipyard asset preview now use gateway script/asset APIs instead of dashboard-local disk paths,
  - dashboard-local Postgres/AGE and BRP paths existed for database explorer, graph editing, entity deletion, account admin reads, character display-name edits, and live-world inspection.
- Target state: dashboard browser code calls same-origin dashboard API routes only, and those routes proxy to protected gateway APIs using the logged-in gateway account session. The dashboard process must not require access to `data/`, `data/scripts/`, `data/shaders/`, `ASSET_ROOT`, Postgres, AGE, replication BRP, or client BRP.
- Explicit decision: gateway may keep protected disk bootstrap/reload behavior, but dashboard never falls back to disk. Gateway is responsible for making active disk edits visible through protected catalog APIs.
- Native impact: no direct gameplay/client behavior change in this plan. Gateway-admin spawn and script/catalog APIs continue to feed server-authoritative runtime paths.
- WASM impact: no direct browser runtime transport change. Asset payload access remains authenticated gateway HTTP and must stay compatible with browser cache adapters.

2026-04-28 implementation update:

- Phase 1 and Phase 2 are implemented for Lua registry-backed structured editors.
- Implemented: gateway script catalog reads refresh persisted active catalog state from disk on the bounded hot-reload cadence when direct Lua source edits are detected.
- Implemented: protected script list/detail helpers trigger the same refresh check before reading persisted script rows.
- Implemented: Genesis and Shipyard catalog reads no longer fall back to dashboard-local disk reads or static dashboard bearer-token env vars.
- Implemented: Shipyard asset preview no longer reads dashboard-local `ASSET_ROOT`.
- Implemented: gateway now exposes admin-scoped asset-by-ID metadata and payload preview routes guarded by `scripts:read`; Shipyard asset preview uses the payload route directly.
- Implemented: Shader Workshop loads shader catalog/source through gateway admin asset APIs and saves existing shader source through gateway `scripts:write` payload updates.
- Implemented: Sound Studio loads audio registry state through the gateway script catalog, resolves audio payloads through gateway admin asset APIs, and saves marker edits as gateway script drafts.
- Implemented: dashboard lint now includes a static no-local-authority guard for production `dashboard/src` code with no temporary allowlist entries.

2026-04-28 Phase 3 implementation update:

- Implemented: gateway owns dashboard database, account reset, character display-name, AGE graph, entity delete, and BRP proxy routes under protected admin APIs.
- Implemented: dashboard database explorer, graph editor, account reset, character rename, entity delete, and live-world BRP tooling proxy through gateway using the logged-in gateway dashboard session.
- Implemented: dashboard-local Postgres, AGE, and BRP helper modules were removed from production dashboard code, and the no-local-authority guard now runs without allowlist entries.
- Implemented: dashboard can run without database credentials, AGE graph configuration, BRP URLs, BRP auth tokens, `ASSET_ROOT`, or `SIDEREAL_REPO_ROOT`; those runtime placements are gateway/service concerns.
- Implemented: gateway BRP proxy accepts configured service endpoints and a bounded host allowlist. Operators can extend the allowed explicit-host set with `GATEWAY_ADMIN_BRP_ALLOWED_HOSTS`.
- Implemented: the Script Editor route is a lazy generic editor over gateway script list/detail/draft/publish/discard APIs, sharing the same catalog state used by structured editors.
- Open follow-up: family-specific validation and preview hooks can be added on top of the generic editor without changing the gateway authority path.

## 1. Goals

1. Make gateway the only backend authority for dashboard reads and mutations.
2. Remove dashboard server dependencies on local game-server filesystem, game database, and BRP network placement.
3. Keep all Lua registry-backed tooling centered on the gateway script catalog.
4. Ensure gateway reflects direct IDE/disk edits in its active script catalog on a bounded live-refresh cadence.
5. Preserve and extend the current draft/publish workflow for script editor support.
6. Keep browser security simple: the browser talks to the dashboard origin; the dashboard forwards the HttpOnly gateway session token server-side.

## 2. Authority Model

The canonical dashboard data path is:

```text
browser -> dashboard same-origin API -> protected gateway API -> authoritative backend
```

Allowed dashboard server responsibilities:

- validate route params and request bodies with Zod or equivalent schemas,
- enforce same-origin mutation checks,
- unwrap/refresh encrypted dashboard session cookies,
- verify admin role, verified MFA, `dashboard:access`, and route-specific scopes,
- forward gateway responses, including binary asset payloads, without exposing bearer tokens to browser code.

Forbidden dashboard server responsibilities:

- reading or writing `data/scripts`, `data/shaders`, `data/audio`, `data/cache_stream`, or `ASSET_ROOT`,
- opening direct Postgres/AGE connections for dashboard features,
- calling replication/client BRP endpoints directly,
- using `SIDEREAL_DASHBOARD_ADMIN_BEARER_TOKEN` or `SIDEREAL_DASHBOARD_ADMIN_PASSWORD` in normal operation,
- inventing route-local auth checks instead of using the shared gateway-backed dashboard session boundary.

## 3. Gateway Live Catalog Refresh

Gateway must keep the persisted active script catalog synchronized with direct disk edits so dashboard tools and the future script editor can see changes made in an IDE.

Required behavior:

1. Gateway polls script catalog disk state on the existing bounded cadence, defaulting to `SIDEREAL_ASSET_HOT_RELOAD_INTERVAL_S`.
2. When disk Lua sources differ from the persisted active script catalog, gateway persists the disk catalog as the new active catalog and updates its in-process script catalog cache.
3. Drafts are preserved. If a dashboard draft exists for a script, `active_source` may update from disk while `draft_source` remains the user's draft until published or discarded.
4. Protected script detail/list APIs must trigger the same refresh check before reading persisted catalog rows.
5. Runtime asset/audio catalogs derived from Lua registries must rebuild after the bounded cache interval so changed `assets/registry.lua` and `audio/registry.lua` sources are visible to dashboard preview routes and client asset manifests.
6. Gateway may keep `POST /admin/scripts/reload-from-disk` as an explicit operator action, but dashboard features must not rely on it for normal visibility.

## 4. Gateway API Additions

Add or formalize these protected gateway APIs. All require gateway-issued access tokens with admin/dev/developer role, verified MFA, `dashboard:access`, and the listed route scope.

### Script Catalog and Script Editor

- `GET /admin/scripts`: list script documents and draft state. Scope: `scripts:read`.
- `GET /admin/scripts/detail/{script_path}`: return `active_source`, active revision/origin, `draft_source`, draft origin, draft update time, inferred family, and source metadata. Scope: `scripts:read`.
- `POST /admin/scripts/draft/{script_path}`: save a draft for any editable Lua script. Scope: `scripts:write`.
- `DELETE /admin/scripts/draft/{script_path}`: discard a draft. Scope: `scripts:write`.
- `POST /admin/scripts/publish/{script_path}`: publish a draft to active catalog. Scope: `scripts:write`.
- Future script editor should use only these generic endpoints plus editor metadata APIs; route-specific editors such as Genesis, Shipyard, Sound Studio, and Shader Workshop should become structured clients over this same catalog surface.

### Asset Catalog and Payload Preview

- `GET /admin/assets/catalog`: return active runtime asset metadata derived from `assets/registry.lua`, including `asset_id`, `asset_guid`, content type, checksum, byte length, source path metadata, bootstrap/startup flags, shader family/role, and dependencies. Scope: `scripts:read`.
- `GET /admin/assets/by-id/{asset_id}`: return one metadata entry by logical asset ID. Scope: `scripts:read`.
- `GET /admin/assets/by-id/{asset_id}/payload`: stream payload bytes by resolving `asset_id -> asset_guid -> /assets/{asset_guid}` server-side. Scope: `scripts:read`.
- `POST /admin/assets/by-id/{asset_id}/payload`: save replacement source bytes for an existing source-backed asset entry, invalidate the runtime asset catalog cache, and return refreshed metadata. Scope: `scripts:write`.
- `GET /assets/{asset_guid}` remains the authenticated payload route for immutable asset versions.

### Database, Graph, and BRP

- `GET /admin/dashboard/database`: current database admin payload. Scope: `dashboard:database:read`.
- `POST /admin/dashboard/accounts/{account_id}/password-reset`: admin-triggered gateway password reset acceptance. Scope: `dashboard:database:write`.
- `POST /admin/dashboard/characters/{player_entity_id}/display-name`: update account character display name and graph display component consistently. Scope: `dashboard:database:write`.
- `GET /admin/dashboard/graph`: current graph explorer payload. Scope: `dashboard:database:read`.
- `POST /admin/dashboard/graph`: component update mutation. Scope: `dashboard:database:write`.
- `DELETE /admin/dashboard/entities/{entity_id}`: delete entity records through gateway-owned mutation logic. Scope: `dashboard:database:write`.
- `GET|POST /admin/brp`: BRP proxy with target allowlist and no arbitrary host passthrough by default. Scope: `dashboard:brp:proxy`.

## 5. Dashboard Migration

1. Add a shared dashboard gateway proxy helper that:
   - resolves `GATEWAY_API_URL`,
   - prepares/refreshed dashboard account sessions,
   - enforces admin role, MFA, `dashboard:access`, and route scope,
   - forwards JSON and binary gateway responses,
   - returns `Set-Cookie` when a refresh rotates tokens.
2. Move Genesis and Shipyard catalog reads to gateway-only behavior. Gateway errors must surface as dashboard errors; no disk fallback is allowed.
3. Move Shipyard asset preview from local `ASSET_ROOT` reads to gateway asset-by-id payload proxying.
4. Move Shader Workshop from local `data/shaders` and `data/cache_stream/shaders` to gateway asset/script APIs.
5. Move Sound Studio from local `audio/registry.lua` and audio file reads to gateway script/asset APIs.
6. Move database, graph, delete entity, account reset, character rename, and BRP logic out of dashboard-local server code and into gateway endpoints.
7. Replace route-local raw `fetch` calls with shared dashboard API helpers where those calls target dashboard JSON APIs. Binary/WASM/module loads may keep direct fetches when they are not privileged mutations.
8. Add a dashboard static guard that fails on production imports/usages of `node:fs`, `node:path`, `pg`, direct BRP URL env vars, `ASSET_ROOT`, `SIDEREAL_REPO_ROOT`, `SIDEREAL_DASHBOARD_ADMIN_BEARER_TOKEN`, or `SIDEREAL_DASHBOARD_ADMIN_PASSWORD`.

## 6. Future Script Editor Requirements

The script editor must be a generic editor over the gateway script catalog, not a new filesystem editor.

Required editor behavior:

1. Load script lists/details through `/admin/scripts`.
2. Save all changes as drafts first.
3. Publish/discard through explicit catalog draft endpoints.
4. Show active-vs-draft state, active revision, origins, and disk refresh timestamps when gateway exposes them.
5. Support script families (`asset_registry`, `audio_registry`, `planet_registry`, `ship_registry`, `ship_module_registry`, `bundle`, `world`, `ai`, `misc`) without hardcoded route-only assumptions.
6. Provide validation hooks by family, but never allow scripts to mutate runtime authority directly from the dashboard.
7. Keep structured editors and the script editor interoperable: if Genesis edits `planets/registry.lua`, the script editor must show the same draft.

## 7. Test Plan

Dashboard tests:

- Gateway proxy helper rejects unauthenticated users, non-admin users on admin routes, missing MFA, missing `dashboard:access`, missing route scopes, and cross-origin mutations.
- Genesis/Shipyard catalog helpers fail on gateway failure without disk fallback.
- Shipyard/Shader/Sound payload preview helpers call gateway asset payload routes, not local files.
- Audio marker, shader source, Genesis, Shipyard, and script editor mutations all create gateway script drafts.
- Static no-local-authority guard rejects forbidden production dashboard imports/env names.

Gateway tests:

- Protected admin routes reject unauthenticated, non-admin, non-MFA, and missing-scope callers.
- Script list/detail APIs refresh persisted active catalog from disk changes on the bounded cadence and preserve drafts.
- Runtime asset/audio manifest APIs observe changed Lua registries after the refresh interval.
- Asset-by-id payload preview rejects unknown IDs and never exposes arbitrary paths.
- Database/graph/BRP endpoints keep existing response shape while enforcing gateway scopes.

Quality gates:

```bash
pnpm -C dashboard test
pnpm -C dashboard lint
pnpm -C dashboard build
cargo fmt --all -- --check
CARGO_INCREMENTAL=0 cargo clippy --workspace --all-targets -- -D warnings
CARGO_INCREMENTAL=0 cargo check --workspace
```

Run WASM and Windows client checks if shared DTO changes affect client-consumed gateway auth/asset types.

## 8. Implementation Phases

### Phase 1: Boundary Hardening

- Add official plan.
- Make gateway script list/detail/current catalog paths refresh active sources from disk changes on the bounded cadence.
- Remove dashboard Genesis/Shipyard catalog-read disk fallback.
- Remove normal-use static dashboard admin bearer fallback from gateway-backed dashboard helpers.

### Phase 2: Asset Preview and Structured Editors

- Add gateway asset-by-id metadata/payload APIs.
- Migrate Shipyard preview, Shader Workshop, and Sound Studio to gateway script/asset APIs.
- Add dashboard static no-local-authority guard.

### Phase 3: Database and BRP Gateway Ownership

- Add gateway database/graph/BRP admin endpoints.
- Migrate dashboard database explorer, graph editor, delete entity, account reset, character rename, and BRP tooling to the gateway endpoints.
- Remove dashboard-local Postgres and BRP helpers.

### Phase 4: Generic Script Editor

- Build the script editor as a lazy dashboard route over `/admin/scripts`. Implemented 2026-04-28.
- Share draft/publish/status handling with structured editors. Implemented 2026-04-28.
- Add family-specific validation/preview hooks without breaking generic catalog behavior. Open follow-up.

## 9. Acceptance Criteria

- Dashboard server can run on a machine with only dashboard code, `GATEWAY_API_URL`, and `SIDEREAL_DASHBOARD_SESSION_SECRET`; it does not need game data files, database credentials, or BRP network access.
- Direct IDE edits to Lua files under the gateway scripts root become visible through dashboard script/catalog routes after the configured refresh interval.
- All privileged dashboard mutations use gateway-issued account tokens with verified MFA and route-specific scopes.
- Script-editor and structured-editor draft state is one shared gateway catalog state.
