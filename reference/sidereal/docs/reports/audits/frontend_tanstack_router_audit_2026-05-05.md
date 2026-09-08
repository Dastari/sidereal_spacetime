# Frontend TanStack Router Audit Report

Status: Archived
Lifecycle: historical-report
Category: report
Last updated: 2026-06-04
Owners: report author
Scope: Frontend TanStack Router Audit Report.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

Audit date: 2026-05-05  
Scope: `dashboard/` TanStack Start / TanStack Router / React 19 frontend and file-route API surface  
Prompt source: `docs/prompts/audits/frontend_tanstack_router_audit_prompt.md`

Status note (2026-05-05): This report reflects the current workspace state. `dashboard/package.json` and `dashboard/pnpm-lock.yaml` were already modified before this audit; findings treat those changes as the active local state.

## Executive Summary

No critical issue was found that requires stopping development immediately. The dashboard has a strong foundation: feature-oriented routes, generated file routing, local shadcn/ui wrappers, semantic theme use, gateway-backed session enforcement, SameSite/HttpOnly cookies, and a broad Zod schema base are all good patterns worth keeping.

The largest risks are structural and bundle-related. The `dashboard/src/lib/schemas/dashboard.ts` module mixes tiny client search schemas with every server/API payload schema; because route `validateSearch` imports that file, the client entry bundle currently pays for broad Zod and feature validation code that should stay server or route-local. The database route split also looks better than it behaves: `dashboard/src/routes-lazy/database-pages.tsx` imports the explorer, accounts, and tables panels together, so account/table routes can pull in heavy explorer code.

Resilience is also incomplete. Root and several tool routes have error components, but many auth routes and param child routes lack local `errorComponent`, `pendingComponent`, and not-found handling. The shared `RoutePendingState` exists but is not wired into routes. The database tool still loads first data in a `useEffect`, despite the styling guide saying database uses route-owned initial loading.

Security posture is better than the old admin-password flow, but there are hardening gaps: one trusted gateway SVG is injected with `dangerouslySetInnerHTML`, public/auth endpoints surface gateway error strings directly, API helper patterns are duplicated, and there is no centralized API response envelope/rate-limit story yet.

## Findings

### High: Monolithic Dashboard Schemas Leak Server Validation Into Client Bundles

Severity: High  
Category: bundle-size, performance, maintainability  
Disposition: Must fix

Why it matters: `dashboard/src/lib/schemas/dashboard.ts` contains everything from two search-param schemas to auth, BRP, Genesis, Shipyard, script, audio, and admin mutation schemas. The database routes import only `databaseAccountsSearchSchema` and `databaseTablesSearchSchema`, but that import pulls the whole module into client route code. The current built client entry also contains Zod internals and Genesis/Shipyard schema definitions, which is avoidable initial JS.

Evidence:

- `dashboard/src/routes/_dashboard.database.accounts.tsx:2` imports `databaseAccountsSearchSchema` from the monolithic schema file.
- `dashboard/src/routes/_dashboard.database.tables.tsx:2` does the same for table search.
- `dashboard/src/lib/schemas/dashboard.ts:18-26` are the small search schemas that need the client.
- `dashboard/src/lib/schemas/dashboard.ts:156-502` contains broad server/API schemas for spawn, BRP, scripts, Genesis, and Shipyard.
- Existing build artifact check: `dashboard/dist/client/assets/index-BJtb696B.js` includes Zod and feature schemas in the client entry.

Recommendation:

Split schema modules by boundary:

```ts
// dashboard/src/lib/schemas/search.ts
import { z } from 'zod'

export const databaseAccountsSearchSchema = z.object({
  search: z.string().catch(''),
  sort: z.enum(['email', 'characters', 'mfa', 'created']).catch('email'),
})

export const databaseTablesSearchSchema = z.object({
  search: z.string().catch(''),
  sort: z.enum(['name', 'rows', 'schema']).catch('schema'),
})
```

Then move API-only schemas into feature/server files such as `schemas/auth.ts`, `schemas/brp.ts`, `schemas/genesis.ts`, `schemas/shipyard.ts`, and import those only from API route files or server utilities.

### High: Database Routes Still Use Effect-Owned Initial Loading

Severity: High  
Category: performance, UX/resilience, architecture  
Disposition: Must fix

Why it matters: Route-owned loading is the documented direction, but database pages pass `initialData={null}` and then fetch in `useEffect`. That creates an empty first render, pushes errors into component-local state rather than route boundaries, prevents SSR/loader preloading from carrying data, and duplicates refresh behavior across page variants.

Evidence:

- `dashboard/src/routes/_dashboard.database.accounts.tsx:12-13` passes `initialData={null}`.
- `dashboard/src/routes/_dashboard.database.tables.tsx:12-13` passes `initialData={null}`.
- `dashboard/src/routes/_dashboard.database.index.tsx:8-9` passes `initialData={null}`.
- `dashboard/src/features/database/useDatabaseAdminData.ts:36-58` fetches `/api/database` in a client effect.
- `docs/guides/frontend_ui_styling_guide.md` says the database tool should use route-owned initial data loading.

Recommendation:

Add a route loader/server function around `/api/database` or the gateway server helper, pass loader data into the page, and keep `refresh()` as the explicit client refresh path.

```ts
export const Route = createFileRoute('/_dashboard/database/accounts')({
  validateSearch: (search) => databaseAccountsSearchSchema.parse(search),
  loader: async () => loadDatabaseAdminDataServerFn(),
  pendingComponent: () => (
    <RoutePendingState title="Loading database" description="Loading account records." />
  ),
  errorComponent: ({ error, reset }) => (
    <RouteErrorState title="Database route failed" error={error} onRetry={reset} />
  ),
  component: DatabaseAccountsRoutePage,
})
```

### High: The Database Route Chunk Combines Unrelated Heavy Screens

Severity: High  
Category: bundle-size, performance, architecture  
Disposition: Must fix

Why it matters: `database-pages.tsx` statically imports `ExplorerWorkspace`, `AccountsPanel`, `TablesPanel`, and their shared layout. The account and table screens are operational table tools; the entity explorer is the heaviest dashboard workspace. Importing them from one route adapter means logical file routes do not produce clean user-workflow chunks.

Evidence:

- `dashboard/src/routes-lazy/database-pages.tsx:7-10` imports the explorer, accounts panel, tables panel, and data hook together.
- Existing build artifact check showed `ExplorerWorkspace-Bc9-kOWa.js` as the largest JS route chunk at about 339 KB.
- Account/table route chunks list database-page dependencies, so the current split should be measured after any change with bundle analyzer output.

Recommendation:

Split the adapter module by route:

- `dashboard/src/routes-lazy/database-entities-route.tsx`
- `dashboard/src/routes-lazy/database-accounts-route.tsx`
- `dashboard/src/routes-lazy/database-tables-route.tsx`

Keep `DatabaseToolbar` in a small shared file that does not import `ExplorerWorkspace`. Re-run `pnpm --dir dashboard vite build` and inspect initial and route chunk sizes after the split.

### High: Route Boundaries Are Incomplete and Inconsistent

Severity: High  
Category: UX/resilience, correctness  
Disposition: Should fix

Why it matters: The root route has a not-found and error component, and several top-level admin routes define `errorComponent`, but many important routes rely on distant fallback behavior. Param child routes, auth/setup routes, and profile/account pages lack route-local error and pending behavior. Failures in first-render auth checks and data loading often become component state or redirects instead of consistent TanStack route states.

Evidence:

- Root boundary exists in `dashboard/src/routes/__root.tsx:52-74`.
- Default router not-found exists in `dashboard/src/router.tsx:8-17`.
- Shared pending UI exists in `dashboard/src/components/feedback/route-feedback.tsx:8-35`, but `rg` found no route `pendingComponent`.
- Param routes such as `dashboard/src/routes/_dashboard.database.$entityGuid.tsx`, `_dashboard.shader-workshop.$shaderId.tsx`, and `_dashboard.sound-studio.$soundId.tsx` have no local boundary.
- Auth/setup routes such as `dashboard/src/routes/login.tsx`, `setup.tsx`, and `mfa-setup.tsx` do first-render async work in effects and do not define `errorComponent`/`pendingComponent`.

Recommendation:

Add a minimal boundary policy:

- Root: global shell crash and global not-found.
- `_dashboard`: authenticated dashboard pending/error boundary.
- Each heavy tool route: feature-specific error/pending state with retry.
- Each param route: validate params and show feature not-found for unknown IDs where the loader can tell.
- Public auth routes: local pending/error around bootstrap/session checks.

### High: Trusted Gateway QR SVG Is Injected as HTML

Severity: High  
Category: security  
Disposition: Must fix before the dashboard is exposed beyond trusted local/dev use

Why it matters: `TotpSetupPanel` renders `qrSvg` with `dangerouslySetInnerHTML`. React escapes normal text and attributes, but this bypasses that protection. If the gateway ever returns compromised SVG, or if a proxy/dependency bug alters the payload, this becomes a dashboard XSS path on an authenticated security setup screen.

Evidence:

- `dashboard/src/components/auth/TotpSetupPanel.tsx:54` passes gateway-provided `qrSvg`.
- `dashboard/src/components/auth/TotpSetupPanel.tsx:131-139` injects it with `dangerouslySetInnerHTML`.
- `dashboard/src/server/dashboard-auth.ts` maps `qr_svg` from the gateway response into `qrSvg`.

Recommendation:

Prefer generating the QR client-side from the provisioning URI using a vetted QR renderer that returns React elements/canvas, or sanitize SVG server-side with a strict allowlist before returning it to the client. If SVG remains necessary, validate it as a tiny allowlisted document: `<svg>`, `<path>`, `<rect>`, safe numeric attributes, no events, no links, no foreignObject, no scripts, no external refs.

### Medium: Route Params and Public Search Params Need a Stronger Validation Story

Severity: Medium  
Category: correctness, security, maintainability  
Disposition: Should fix

Why it matters: Some search params use Zod, but route params are mostly raw strings from `Route.useParams()`. Public auth redirect search params use handwritten parsing in multiple files. This weakens type guarantees, produces duplicated redirect normalization, and makes future auth hardening easier to miss.

Evidence:

- `dashboard/src/routes/_dashboard.game-world.$entityGuid.tsx` uses raw `entityGuid`.
- `dashboard/src/routes/_dashboard.shader-workshop.$shaderId.tsx` uses raw `shaderId`.
- `dashboard/src/routes/_dashboard.sound-studio.$soundId.tsx` uses raw `soundId`.
- `dashboard/src/routes/login.tsx:25-28`, `setup.tsx:18-21`, and `mfa-setup.tsx:18-21` manually parse `redirect`.

Recommendation:

Add `params`/search schemas per route family and a shared redirect schema:

```ts
const redirectSearchSchema = z.object({
  redirect: z.string().startsWith('/').catch('/'),
})

const entityGuidParamsSchema = z.object({
  entityGuid: z.string().uuid(),
})
```

### Medium: API Route Helpers Are Duplicated and Shaped Inconsistently

Severity: Medium  
Category: maintainability, security, correctness  
Disposition: Should fix

Why it matters: API routes repeatedly parse JSON, call auth guards, re-read the session, map gateway errors, and copy session-refresh helpers. This increases the chance that future routes miss CSRF checks, scopes, cache headers, or consistent error shaping.

Evidence:

- `dashboard/src/routes/api.account.characters.tsx:92-128` defines `prepareAccountSession`.
- `dashboard/src/routes/api.account.mfa.totp.enroll.tsx:44-74` repeats nearly the same helper.
- `dashboard/src/routes/api.admin.spawn-entity.tsx:9-12` repeats gateway URL parsing instead of using `gateway-proxy`.
- `dashboard/src/routes/api.shaders.upload.tsx:28-43` manually validates upload JSON instead of using a schema.
- `dashboard/src/server/gateway-proxy.ts:16-88` already has a good central pattern, but not all routes use it.

Recommendation:

Create focused helpers:

- `readJsonBody(schema, request)` returning typed data or a `400` JSON response.
- `requireAccountSession(request)` for non-admin account APIs with refresh-cookie support.
- `requireGatewaySession(request, scope)` for admin APIs, already present.
- `gatewayJsonResponse(path, session, init)` for direct proxy-style calls.

### Medium: Gateway/Internal Errors Are Exposed Too Directly

Severity: Medium  
Category: security, UX/resilience  
Disposition: Should fix

Why it matters: Many API routes return `error.message` or upstream `payload.error` directly. That is useful during development, but future public deployment should separate operator diagnostics from user-facing messages so gateway internals, path details, token-state hints, or validation internals do not leak to browsers.

Evidence:

- `dashboard/src/routes/api.dashboard-session.tsx:93-101`, `118-127`, and `165-170` return gateway/login error messages directly.
- `dashboard/src/routes/api.admin.spawn-entity.tsx:72-77` forwards gateway error text.
- `dashboard/src/server/gateway-proxy.ts:48-53` throws upstream error strings.

Recommendation:

Return stable public error codes/messages and log detailed upstream errors server-side. Keep detailed messages behind a development flag only if needed.

### Medium: `@faker-js/faker` Is Too Heavy for One Spawn Name

Severity: Medium  
Category: bundle-size, dependency discipline  
Disposition: Should fix

Why it matters: `faker` is imported in the explorer workspace only to generate one adjective for admin spawn display names. That dependency is large relative to the use case and lives in the dashboard’s largest interactive route chunk.

Evidence:

- `dashboard/package.json:19` includes `@faker-js/faker`.
- `dashboard/src/features/explorer/ExplorerWorkspace.tsx:2` imports `faker`.
- `dashboard/src/features/explorer/ExplorerWorkspace.tsx:1622-1625` uses `faker.word.adjective()`.
- Existing build artifact check showed `ExplorerWorkspace` as the largest JS chunk.

Recommendation:

Replace with a tiny local adjective list or generate the name server-side in the admin spawn endpoint.

### Medium: Several Tool Pages Are Large Mixed-Concern Modules

Severity: Medium  
Category: maintainability, architecture  
Disposition: Should fix

Why it matters: The largest dashboard modules combine data fetching, editor state, rendering, mutation flows, validation-ish normalization, and route-specific layout. This makes future route splitting, localized error boundaries, and tests harder.

Evidence:

- `dashboard/src/features/explorer/ExplorerWorkspace.tsx` is about 2,218 lines.
- `dashboard/src/features/genesis/GenesisPage.tsx` is about 1,776 lines.
- `dashboard/src/features/shaders/ShaderWorkshopPage.tsx` is about 1,748 lines.
- `dashboard/src/features/shipyard/ShipyardPage.tsx` is about 1,692 lines.
- `dashboard/src/components/brp-editors/SpaceBackgroundShaderSettingsEditor.tsx` is about 1,877 lines.

Recommendation:

Split by ownership boundary, not by arbitrary component size:

- data hooks/API client per feature,
- editor form state per feature,
- list/sidebar components,
- preview/canvas components,
- mutation command bar/status components.

### Medium: shadcn/ui Wrapper Usage Is Coherent but Drifting in Feature Surfaces

Severity: Medium  
Category: maintainability, UX/resilience  
Disposition: Should fix

Why it matters: The local `components/ui/` layer is coherent and should remain the default. However, feature code still contains raw `<select>`, `<input>`, `<textarea>`, and `<button>` controls in editor-heavy surfaces. Some are justified for canvas/editor internals, but repeated form controls should use local wrappers so focus, disabled, density, theme, and accessibility behavior stay consistent.

Evidence:

- Local UI wrappers exist under `dashboard/src/components/ui/`.
- Raw selects appear in `ComponentEditorRenderer.tsx`, `PlanetBodyShaderSettingsEditor.tsx`, `EnvironmentLightingStateEditor.tsx`, `SpaceBackgroundShaderSettingsEditor.tsx`, `GenesisPage.tsx`, `ShipyardPage.tsx`, and `ShaderWorkshopPage.tsx`.
- Raw buttons appear in waveform/canvas/editor surfaces where some are domain-specific, but route-level form controls should not expand that pattern.

Recommendation:

Add missing wrappers for common selects/input groups where needed, then migrate repeated form controls. Keep custom raw elements only for code editor internals, waveform/canvas hit targets, and domain-specific overlays that need precise rendering.

### Low: Lint/Format Setup Does Not Enforce Dashboard Architecture

Severity: Low  
Category: maintainability  
Disposition: Optional improvement

Why it matters: TypeScript strict mode is strong, but ESLint currently delegates only to `@tanstack/eslint-config`. That will not enforce local boundaries such as no server imports in client components, no monolithic schema imports from route components, no raw destructive browser dialogs, or component wrapper policy.

Evidence:

- `dashboard/eslint.config.js:3-5` only spreads `tanstackConfig`.
- `dashboard/tsconfig.json` is strict and includes useful checks, but TypeScript cannot enforce these architecture conventions alone.

Recommendation:

Add project-specific `no-restricted-imports` and file-pattern rules:

- disallow `@/server/*` outside `routes/api.*`, server utilities, and tests,
- disallow `@/lib/schemas/dashboard` from client route/page components after schema split,
- disallow browser-native destructive prompts,
- disallow direct Radix imports outside `components/ui/` unless allowlisted.

### Low: Build Measurement Is Ad Hoc

Severity: Low  
Category: performance, bundle-size  
Disposition: Optional improvement

Why it matters: Bundle concerns are visible, but the repo does not have a repeatable dashboard bundle report command. The existing `dist/client` artifacts were useful for this audit, but a tracked script would make regressions easier to catch.

Evidence:

- `dashboard/package.json:6-16` has build/test/lint/format scripts, but no bundle analysis script.
- `dashboard/vite.config.ts:12-27` has no analysis or chunk-size reporting configuration.

Recommendation:

Add a non-default script such as `analyze` with a Vite-compatible visualizer or a simple compressed-size report over `dist/client/assets`. Keep it opt-in so normal development remains fast.

## Route Architecture Map

Current user-facing route tree:

```text
/
├─ login
├─ forgot-password
├─ setup
├─ mfa-setup
├─ shader-workbench -> redirect to /shader-workshop
└─ _dashboard
   ├─ /                         My Account
   ├─ profile                   Account security/MFA
   ├─ database
   │  ├─ /                       Entity explorer
   │  ├─ $entityGuid             Entity explorer selection
   │  ├─ accounts                Account/character admin table
   │  └─ tables                  Database table inventory
   ├─ game-world
   │  └─ $entityGuid
   ├─ game-client
   ├─ shader-workshop
   │  └─ $shaderId
   ├─ genesis
   │  └─ entities/$entityGuid
   ├─ shipyard
   │  └─ entities/$entityGuid
   ├─ sound-studio
   │  └─ $soundId
   ├─ script-editor
   └─ settings
```

Verdict: The route tree is logically split by feature and user workflow. The main issue is not the route tree shape; it is the implementation split underneath it. Some adapter modules combine unrelated heavy screens, route params are under-validated, and route-level pending/error/not-found behavior is not applied consistently.

Current API route inventory:

```text
/api/dashboard-session
/api/bootstrap
/api/password-reset
/api/password-reset/confirm
/api/account/characters
/api/account/characters/$playerEntityId
/api/account/characters/$playerEntityId/reset
/api/account/mfa/totp
/api/account/mfa/totp/enroll
/api/account/mfa/totp/verify
/api/admin/spawn-entity
/api/database
/api/database/accounts/$accountId/mfa/totp
/api/database/accounts/$accountId/password-reset
/api/database/characters/$playerEntityId/display-name
/api/graph
/api/delete-entity/$entityId
/api/entities/$entityGuid/edit-context
/api/brp
/api/scripts
/api/scripts/detail
/api/scripts/draft
/api/scripts/publish
/api/shaders
/api/shaders/$shaderId
/api/shaders/upload
/api/audio-cues
/api/audio-cues/$soundId
/api/genesis/planets
/api/genesis/planets/$planetId/draft
/api/genesis/planets/$planetId/publish
/api/shipyard/catalog
/api/shipyard/assets/$assetId
/api/shipyard/ships/$shipId/draft
/api/shipyard/ships/$shipId/publish
/api/shipyard/modules/$moduleId/draft
/api/shipyard/modules/$moduleId/publish
```

## Code-Splitting and Bundle-Reduction Plan

Quick wins:

- Split `dashboard/src/lib/schemas/dashboard.ts` into client search schemas and server/API feature schemas.
- Replace `@faker-js/faker` in `ExplorerWorkspace` with a tiny local name helper.
- Split `routes-lazy/database-pages.tsx` by entities/accounts/tables.
- Move route-specific constants and validation into small route-local modules to avoid importing whole feature files for metadata.

Medium-effort improvements:

- Add route loaders for database data and auth/bootstrap checks so route pending/error states replace effect-owned first loads.
- Split `ExplorerWorkspace` into data, toolbar, selection/context menu, graph transform, live BRP, and render-shell modules.
- Split Genesis/Shipyard/Shader Workshop into catalog, editor, preview, and mutation command modules.
- Add a repeatable bundle report script and record gzip/brotli size deltas for major route chunks.

Architectural refactors:

- Introduce feature-owned route packages that export lazy route components without importing all feature panels from a shared adapter.
- Centralize API/session helpers so route handlers become thin transport wrappers around feature server functions.
- Add architectural lint rules after module boundaries are split.

## shadcn/ui Adoption Review

Components that should be added or emphasized:

- A local `Select` wrapper, if the current raw select patterns cannot be migrated to an existing local component.
- A shared `FormField`/field-error wrapper for auth, setup, profile, and editor forms.
- A standard route-level `PendingRoutePanel` and `RouteErrorPanel` backed by existing `RoutePendingState`/`RouteErrorState`.

Components to reuse more consistently:

- `DataTable` should remain the default for dense record lists. `AccountsPanel` and `TablesPanel` are good reference points.
- `AlertDialog`/`ConfirmDialog` should remain the default for destructive actions; no browser-native destructive prompts were found.
- `HUDFrame`, `ButtonGroup`, `Switch`, `Input`, `Textarea`, and `Tabs` should be preferred in editor surfaces before adding bespoke form chrome.

Custom components that should remain custom:

- `GridCanvas` and grid renderer internals.
- Waveform playback/editor controls that need precise timeline hit testing.
- Shader code editor internals around `use-editable` and Prism.
- BRP component editors where gameplay-specific data shapes require custom interactions, as long as common inputs still route through shared wrappers.

## Validation Strategy

Introduce Zod first:

- Route params: `entityGuid`, `shaderId`, `soundId`, `shipId`, `moduleId`, `planetId`.
- Public auth search params: `redirect`.
- API request bodies that still use manual checks, especially shader upload.
- API responses for security-sensitive client state: dashboard session, character list, MFA enrollment, database payload summaries.

Use TanStack Router validation for:

- All route search params.
- All route params where invalid IDs can be rejected before mounting the feature UI.
- Loader dependencies, so route data and URL state stay typed together.

Manual parsing remains acceptable for:

- Canvas pointer math and rendering-local controls.
- Highly local numeric input drafts before save-time schema validation.
- Binary asset responses where content-type and status are enough.

## Security and Auth-Readiness

Current strengths:

- Dashboard admin routes flow through gateway-backed account session concepts.
- Cookies are HttpOnly and SameSite=Strict.
- Mutations have same-origin checks through `rejectCrossOriginMutation`.
- Admin routes generally require role, MFA, `dashboard:access`, and route-specific scopes.
- No `window.prompt`, `window.confirm`, or `window.alert` use was found.

Current risks:

- Gateway-provided QR SVG is injected as HTML.
- Upstream error strings are commonly returned to browser callers.
- Public auth/password reset routes do not yet show rate-limit/backoff integration.
- API route helper duplication makes it easier for future endpoints to miss scope, CSRF, cache, or session-refresh behavior.
- No Content Security Policy was found in dashboard configuration or root response setup.

Recommended hardening sequence:

1. Remove or sanitize `dangerouslySetInnerHTML` QR rendering.
2. Centralize API error envelopes and suppress raw upstream errors by default.
3. Centralize JSON body parsing, account-session refresh, and gateway proxy response helpers.
4. Add rate-limit/backoff integration at gateway or dashboard edge for login, MFA, bootstrap, and password reset.
5. Add a dashboard CSP compatible with TanStack Start, inline theme bootstrapping, fonts, WASM, WebGPU, and local dev.

## API Route Optimization

Repeated patterns worth centralizing:

- JSON parse plus Zod `safeParse`.
- `getDashboardSession` after `requireDashboardAdmin`.
- Account-session refresh/cookie update for non-admin account routes.
- Gateway URL parsing and response mapping.
- Error envelope construction.

Performance and boundary recommendations:

- Use `gateway-proxy.ts` helpers consistently for admin proxy routes.
- Avoid returning full database payloads to every database subroute if account/table/entity views can request narrower shapes.
- Keep binary asset routes explicitly `no-store`, as they already do.
- Add route-level data loading for dashboard views that need initial data, starting with database.
- Do not import server helper modules from client components; enforce this in ESLint once current routes are cleaned up.

## Naming and Style Consistency

Strengths worth keeping:

- File routes are readable and mostly feature-oriented.
- `components/ui/` wrappers are centralized and aligned with shadcn/new-york.
- `features/*` directories are easy to discover.
- Generated route tree is clearly marked as generated.
- API route filenames map cleanly to URL paths.

Conventions to standardize:

- Rename `routes-lazy/*` or make it true per-route lazy ownership. The name currently hides some shared heavy imports.
- Avoid monolithic feature/page files beyond route shells; split by data, state, list, editor, preview, and command surfaces.
- Keep schema files boundary-specific: route search, API body, API response, feature editor drafts.
- Prefer `gateway-proxy.ts` for gateway URL/response handling instead of route-local helper copies.

## Specific Confirmations

- The route tree is logically split by feature and user workflow: Mostly true.
- Route-level error handling is consistently applied where it should be: False.
- The app is leaving meaningful bundle-size savings on the table: True.
- Specialized dashboard screens should be split more aggressively: True.
- The current `components/ui/` layer is being used consistently: Mostly true, but drifting in editor-heavy surfaces.
- There are custom components that should be replaced by shadcn/ui primitives: Some repeated form controls should migrate; domain canvases/editors should remain custom.
- Search params, route params, and forms need stronger validation, likely using Zod: True.
- API routes are doing more work than necessary or are shaped inconsistently: True.
- The server/client boundary is clean enough to prevent accidental bundle bloat: Partly true for server helpers, false for shared schema imports.
- Current patterns would make future auth/security hardening harder than necessary: Partly true because API helper duplication and raw errors need cleanup.
- Existing lint/format/type setup is sufficient to enforce intended conventions: False.
- The app is underusing modern TanStack Router / Start / React capabilities in ways that materially matter: True for loaders, pending boundaries, route params, and first-load data.

## Prioritized Remediation Plan

1. Split `dashboard/src/lib/schemas/dashboard.ts` by client/server and feature boundary.
2. Split `dashboard/src/routes-lazy/database-pages.tsx` into route-specific modules.
3. Replace effect-owned database first load with route loader/server function data.
4. Add route boundary policy and wire `pendingComponent`/`errorComponent` to heavy/admin/auth routes.
5. Remove or sanitize QR SVG HTML injection.
6. Centralize API helpers for JSON parsing, account-session refresh, gateway proxying, and error envelopes.
7. Add route param/search Zod schemas for all param and public auth routes.
8. Remove `@faker-js/faker` from the explorer client chunk.
9. Split the largest feature pages along data/editor/preview boundaries.
10. Add architecture lint rules and an opt-in dashboard bundle report script.
