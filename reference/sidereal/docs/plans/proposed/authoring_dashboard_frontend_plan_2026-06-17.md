# Authoring Dashboard Frontend Implementation Plan (/foundry + /firmament)

Status: Proposed
Lifecycle: proposed
Category: plan
Last updated: 2026-06-18
Owners: dashboard + content authoring + gateway
Scope: Phased, extraction-first implementation plan for the content-authoring dashboard frontend — extract the shared map canvas and inspector shell from the live explorer, then build /foundry (entity composer) and /firmament (universe-baseline map + Seed Manager) on those shared pieces.
Source of truth: yes
Supersedes: n/a
Superseded by: n/a
Primary references:
- docs/features/proposed/authoring_dashboard_frontend_proposal.md
- docs/features/proposed/entity_authoring_system_proposal.md
- docs/features/proposed/universe_baseline_seeding_proposal.md
- docs/plans/proposed/content_authoring_composition_plan_2026-06-17.md
- docs/decisions/dr-0053_disk_authored_content_packages_durable_source_of_truth.md
- docs/decisions/dr-0054_universe_baseline_vs_evolved_world_separation.md
- .claude/skills/sidereal-frontend/SKILL.md

## 1. Goal

Implement the dashboard frontend spec (`authoring_dashboard_frontend_proposal.md`): the `/foundry` entity composer and the `/firmament` universe-baseline map, built by **reusing** the existing `/game-world`/`/database` map and inspector rather than forking them. The plan is **extraction-first** — the first shippable is a behavior-preserving refactor that pulls the shared canvas and inspector out of `ExplorerWorkspace`, de-risking every route built after it.

## 2. Relationship & dependencies

- Implements the **frontend proposal**; corresponds to composition plan **WS3** (`/foundry`), **WS5** (`/firmament` map + per-instance overrides), and **WS7** (Seed Manager) on the frontend side.
- **Backend dependencies** (frontend can build against the schemas and a mock, but real wiring is gated):
  - `/foundry` needs the WS2 entity-package gateway APIs (draft/publish; component registry + `editor_schema`).
  - Hook authoring needs DR-0051 WS0's `script_api_schema.json` (the component→hooks map) for the hooks panel; until then the panel renders from a stub and marks hooks pending-runtime.
  - `/firmament` placement/seed needs the WS5/WS7 universe-baseline gateway APIs.
- **Frontend-only**, server-authoritative reads/writes through the gateway proxy; the dashboard never parses Lua (WS1 guard holds).

## 3. Current state (file-level)

| Piece | File | Reuse posture |
|---|---|---|
| Map renderer | `dashboard/src/components/grid/GridCanvas.tsx` | **Low coupling, props-driven** — reuse near-verbatim |
| Live explorer workspace | `dashboard/src/features/explorer/ExplorerWorkspace.tsx` (~2045 lines) | **Very high coupling** (BRP, spatial-partition, context menu, `scope`, `nuqs` URL state) — the extraction target |
| Inspector | `dashboard/src/components/sidebar/DetailPanel.tsx` (~1000 lines) | Medium — already delegates component editing to a generic renderer |
| Generic field renderer | `dashboard/src/components/brp-editors/ComponentEditorRenderer.tsx` | **Already generic**, schema-driven, debounced — reuse |
| Component schema | `dashboard/src/features/component-schema/{registry.ts,types.ts}` | Pure utils — reuse |
| Special editors | `dashboard/src/components/brp-editors/*` + `registry.tsx` (`getEditorForNode`) | Reuse; planet/hardpoint editors become `/foundry` extensions |
| Editor page pattern | `dashboard/src/features/{shipyard,genesis}/*Page.tsx` | Library/draft-publish **duplicated** in each — extract a shared shell |
| Layout | `dashboard/src/components/layout/*` (`AppLayout`, split panels) | Reuse |
| Gateway proxy | `dashboard/src/server/gateway-proxy.ts` (`gatewayJson`, `requireGatewaySession`) | Reuse; add Zod |
| Client helpers | `dashboard/src/lib/api/client.ts` (`apiGet/apiPost/apiDelete`) | Reuse; wrap with Zod-validated variants |
| Routing | `dashboard/src/routes/_dashboard.*.tsx` + `routes-lazy/*` (TanStack file-based, code-split) | Follow pattern for new routes |
| Theme | semantic CSS vars (`theme-colors.ts`, `grid-theme.ts`), `components/ui/` (shadcn) | Reuse; mode banner is a token |

Notable gaps to close as part of this work: **no Zod at API boundaries today** (loose `as T`); selection state is `nuqs` URL params baked into `ExplorerWorkspace`; data fetching is `useEffect`+`useState` (no loaders/React Query).

## 4. Phases

### Phase 0 — Extraction (behavior-preserving; the keystone)

**Intent:** Factor the shared canvas + inspector out of `ExplorerWorkspace`/`DetailPanel` with **no behavior change** to `/game-world` and `/database`, so the new routes consume shared pieces instead of forking 2045 lines.

**Deliverables:**
- **0a `MapCanvasView`** — a headless map-workspace wrapper around `GridCanvas` that owns camera state, selection, entity plotting from a **generic data source**, and **overlay slots** (for spatial-partition today, seed-vs-live diff later). Lift the reusable bits (`handleCameraStateChange`, `updateSelection`, plotting) out of `ExplorerWorkspace`; leave BRP/spatial-partition/context-menu as a **live-explorer adapter** that `ExplorerWorkspace` supplies. `GridCanvas` itself is unchanged.
- **0b Inspector shell + leaves** — decompose `DetailPanel` into `InspectorShell` (chrome, sections, selection, save/dirty) + reusable leaves: `ComponentSchemaForm` (wraps `ComponentEditorRenderer` + `component-schema/registry`), `VisualShaderControls`, and the new `HooksEventsPanel` (stub until DR-0051 schema). Keep current behavior as the `LiveInspectSubpanel`. **No giant conditional component** — modes are separate subpanels (proposal §6).
- **0c Data-source + mode generalization** — **DEFERRED to Phase 2** (decided 2026-06-18). Phase 0's exit goal is already met: `MapCanvasView` is **fully controlled**, so a non-explorer route can drive the canvas today *without* these abstractions. The remaining work has no concrete second consumer yet, so doing it now is speculative: the `dataSource` (live-BRP | baseline-catalog) / `editMode` (`read` | `blueprint-edit` | `placement-edit`) enums would abstract for `/foundry`/`/firmament` before they exist, and extracting the `nuqs` selection into a `useMapSelection` hook (the most coupled explorer logic — selection ↔ URL ↔ `entityGuid` cross-link to `/database` ↔ snapshot/tab-restore) would design its interface against an unknown consumer. `/foundry` is **not** that consumer — it has no map canvas (it's a library + inspector composer on `LibraryInspectorLayout`), so it never touches the explorer's map selection. The real second map-canvas consumer is `/firmament` (Phase 2). Per the rule-of-three `0c` lands as the **first Phase 2 task** (see Phase 2), extracted against `/firmament`'s real map-selection needs. Intended (still): replace the hard `scope`/`sourceMode` branching with the injected `dataSource`/`editMode` and a reusable selection hook.
- **0d Shared `LibraryInspectorLayout`** — extract the duplicated library-list + draft/publish/dirty shell from `ShipyardPage`/`GenesisPage` into one layout (`HorizontalSplitPanels`-based) that `/foundry` and the folded presets share.

**Verification:**
- `/game-world` and `/database` are **visually and behaviorally unchanged** (manual smoke + a Playwright snapshot of the explorer before/after; the existing `dashboard/e2e` harness).
- Bundle still route-splits (no regression in initial chunk; check the Vite/TanStack output).
- No new BRP coupling leaks into `MapCanvasView`/`InspectorShell` (they compile with the live adapter removed).

**Exit:** the canvas and inspector are consumable by a new route with a non-live data source, and the explorer routes are untouched in behavior. **Shipped as 0a + 0b + 0d** (plus the Playwright behavior-preservation harness + dashboard CI job); **0c is carried into Phase 2** (above). The controlled `MapCanvasView` already satisfies "consumable by a non-live data source," so the exit is met without 0c.

### Phase 1 — `/foundry` (entity composer)

**Intent:** The blueprint catalogue + component composer + hooks panel (proposal §4), on the extracted shell + WS2 entity-package APIs.

**Deliverables:**
- Route `dashboard/src/routes/_dashboard.foundry.tsx` + `routes-lazy/foundry-route.tsx` (code-split, follows the game-world route pattern).
- Built on `LibraryInspectorLayout`: **left** blueprint catalogue (grouped/searchable, draft/published status, "New") from the gateway entity catalog; **center** composer — identity fields, component palette (add from the component registry), per-component `ComponentSchemaForm`, `VisualShaderControls` (sprite/map-icon/shader+params, inline Shader Workshop); **right** `HooksEventsPanel` in **blueprint-edit** mode (entity lifecycle + component hooks; scoped Lua editor; pending-runtime markers; intents-not-accessors).
- API routes `dashboard/src/routes/api.foundry.*.tsx` proxying to gateway `/admin/dashboard/entities/*` via `gatewayJson`; **Zod schemas** for `entity.json`/catalog responses (introduce `apiGetValidated`/`apiPostValidated`).
- Draft → validate → publish wired to the gateway; validation errors surfaced inline. Baseline-authoring **mode banner** (semantic token).

**Verification:** author the WS2 proof-of-life package (e.g. `station.derelict`) end-to-end from `/foundry` with no hand-edited files; publish; the no-dashboard-Lua-parse guard still passes; Zod rejects a malformed gateway response in a unit test.

**Exit:** a designer composes a non-ship/non-planet entity (components + a hook + assets) entirely in `/foundry`.

#### Exit proof — manual compose-and-publish smoke (F5)

Phase 1 `/foundry` is functionally complete: catalogue (F1) + identity/component composer (F2) + visual section (F3) + hooks & events editor (F4) + publish/validate/delete action panel (F5, this slice). The composer never hand-edits files; all writes go through the gateway content-package write API (`POST /admin/dashboard/entity-packages/{id}/publish|/validate`, `DELETE .../{id}`), proxied server-side at `/api/foundry/packages/{id}/publish|validate` and `/api/foundry/packages/{id}` so the Bearer token stays off the client.

This 5-minute smoke needs the **live stack** (gateway + dashboard dev server) — do NOT start it as part of CI; run it by hand against a running stack:

1. Open `/foundry` and click **New** (routes to `/foundry/new`).
2. **Identity:** type a namespaced Package ID, e.g. `container.crate` (the panel validates well-formedness — lowercase `[a-z0-9._-]`, no leading `.`, not `.`/`..` — and disables Save until it is valid). Set a Display name (e.g. `Cargo Crate`); optionally add a tag/label.
3. **Component:** in the center composer, **Add component** → pick one from the palette (e.g. `cargo_mass_kg` or `destructible`) and edit its starting value in the schema form.
4. **Hook:** in the right Hooks & Events panel, bind a hook edge (e.g. `destructible.destroyed → drop_salvage`) and/or paste an opaque `hooks.lua` module (the dashboard never parses it — passthrough only).
5. **Sprite:** in the Visual section, set a sprite (`visual.visual_asset_id`) (and optionally a map-icon / shader).
6. In the **Publish** panel (right detail panel): click **Validate** to dry-run (errors surface inline), then **Save / Publish**. On success the panel shows the published revision, re-baselines to clean (Save disables until the next edit), refreshes the catalogue, and softly notes `index_pending` if the catalog-cache refresh lagged (content is already durable on disk). A new package navigates to its real id (`/foundry/container.crate`).

**Confirm it landed:**
- On disk: `data/content/entities/container.crate/` exists with `entity.json` (and `hooks.lua` if you authored one). This is the gateway's source of truth (DR-0053), written by the WS2 `PackageWriter`.
- In the catalogue: `container.crate` appears in the left list immediately after publish (the gateway lists from disk, not the derived DB cache).

**Concurrency / cleanup paths to exercise:**
- **409 (stale):** if the package changed on disk since load, Publish surfaces "changed since you loaded — reload" with a **Reload current version** action that re-fetches get-one and discards local edits.
- **Delete:** for an existing package, **Delete** opens a shadcn `AlertDialog` confirm (never `window.confirm` — the route-boundary guard forbids it); on confirm it soft-deletes to the gateway's reversible `.trash`, refreshes the catalogue, and navigates back to the bare `/foundry`.

The get-one **read boundary** is Zod-validated (`features/foundry/response-schema.ts`): the load path parses the gateway payload through `entityPackageGetOneResponseSchema`, so a malformed/partial response is rejected loudly instead of producing a broken editable draft (unit-proven in `response-schema.test.ts`). The serializer→gateway contract is proven at unit level: the serialized `entity` field set matches `engine-content`'s `EntityBlueprint` (`crates/engine-content/src/schema.rs`, `deny_unknown_fields`) exactly.

### Phase 2 — `/firmament` (placement authoring)

**Intent:** The universe-baseline map (proposal §5) on the extracted `MapCanvasView`, in authoring mode.

**Deliverables:**
- **First (0c, carried from Phase 0): `useMapSelection` + data-source/mode generalization** — extract the explorer's `nuqs` selection + `updateSelection` into a reusable `useMapSelection` hook **against `/firmament`'s real selection needs**, then introduce `dataSource` (live-BRP | baseline-catalog) / `editMode` (`read` | `blueprint-edit` | `placement-edit`) only where the routes actually branch. `/firmament` is the concrete second map-canvas consumer that makes the shape observable (rule-of-three), so this precedes the authoring-input wiring below.
- Route `_dashboard.firmament.tsx` + lazy route; consumes `MapCanvasView` with the **baseline-catalog** data source and an **authoring input layer**: drag a blueprint from the palette to place (sets `world_position`, mints `placement_id`); right-click empty space → "Add entity…" → searchable blueprint list; draw system center + radius; place generator regions.
- **`PlacementOverrideSubpanel`** (placement-edit mode of the inspector): edit overrides (component-value overrides, added components, hook overrides with `super`); base-vs-override shown distinctly.
- **Generator preview**: deterministic scatter rendered on the canvas (expand at `seed`) via an overlay slot; region-scoped lazy loading.
- API routes `api.firmament.*` proxying to the gateway universe-baseline endpoints (placements/generators/systems); Zod schemas. Writes the baseline package; never the live world.

**Verification:** drag-place a blueprint → a baseline placement record is written; a system + nebula renders; a generator region previews the same scatter for a given seed across reloads; placement-edit overrides round-trip.

**Exit:** the §5 "Maw system" worked example is authorable from `/firmament`.

### Phase 3 — Seed Manager: status + reset (WS7 phase 5)

**Deliverables:** `SeedManagerPanel` in `/firmament` — baseline selector; disk rev/hash vs. applied rev/hash; status `not applied | current | drifted | conflicts`; actions **Dry Run**, **Apply To Empty DB**, **Reset Runtime World To Baseline** (the dev workhorse). API `api.firmament.seed.*` → gateway seed endpoints.

**Verification:** drift status reflects the backend (flips after a live mutation); `Reset Runtime World To Baseline` triggers the backend and the panel reflects `current` after.

### Phase 4 — Seed-vs-live diff overlay + reconcile (WS7 phase 6)

**Deliverables:** the per-placement **diff overlay** on the canvas (uses the Phase 0 overlay slot) — present-in-baseline-absent-in-live, evolved, live-only; the **Reconcile** action with an explicit conflict list. Highest value/effort; **last**. The "Reconcile" button is disabled/clearly-marked until the overlay exists (don't imply a diff that isn't there).

**Verification:** a hand-constructed drifted world renders correct add/update/keep/conflict classes in the overlay; reconcile dry-run lists conflicts.

### Phase 5 — Fold `/genesis` + `/shipyard` into `/foundry` presets

**Deliverables:** reimplement Genesis's procedural planet preview and Shipyard's hardpoint texture overlay as **component-editor extensions** mounted in `LibraryInspectorLayout` when the relevant component is present (reusing the existing `PlanetBodyShaderSettingsEditor`/`HardpointEditor`); migrate the routes to `/foundry` presets; keep `/genesis` and `/shipyard` as redirects until parity is confirmed, then retire.

**Verification:** authoring a planet and a ship from `/foundry` presets matches the prior dedicated editors; redirects work; no orphaned routes.

## 5. Cross-cutting requirements (every phase)

1. **Extraction stays behavior-preserving** — `/game-world` and `/database` never regress; Phase 0 lands before any new route.
2. **Inspector = shell + subpanels**, never a universal conditional component (proposal §6).
3. **Zod at every new API boundary** — new authoring routes validate gateway JSON (close the current `as T` gap); types mirror the gateway decoded JSON.
4. **Semantic theme tokens only** — no raw hex; the baseline/live mode accent is a token.
5. **Route-based code-splitting** — `/foundry` and `/firmament` are separate lazy chunks; shared canvas/inspector live in a common module (no duplication).
6. **shadcn/ui** primitives from `components/ui/`; forms auto-generated from `editor_schema` with control hints (as Shader Workshop already does).
7. **No dashboard Lua parsing**; symbol-level hook lint is server/CI-side (`validate_script`).
8. **Security & a11y** — scoped tokens only, no secrets client-side, provenance via admin APIs; keyboard support for palette/right-click-add/canvas selection.

## 6. Risks & sequencing notes

- **`ExplorerWorkspace` is large and highly coupled** (2045 lines, BRP + spatial-partition + context menu + `nuqs`). The extraction must be incremental and snapshot-guarded; prefer **extract-the-headless-core, keep `ExplorerWorkspace` as a thin live adapter** over a big-bang rewrite. This is the top risk.
- **Backend gating:** `/foundry` is blocked on WS2 entity APIs; the hooks panel is degraded until DR-0051 `script_api_schema.json`; `/firmament` placement/seed is blocked on WS5/WS7. Build against the schemas + a mock gateway so frontend progress isn't fully serialized behind backend, but mark mocked surfaces clearly.
- **Canvas authoring input** (drag-place, right-click-add, region-draw, generator-preview hit-testing) is **net-new interaction** on `GridCanvas` — budget for input/hit-testing work in Phase 2, and design the overlay-slot API in Phase 0 so the diff overlay (Phase 4) reuses it.
- **Data-fetching pattern:** the codebase uses `useEffect`+`useState`. The authoring routes are draft/dirty/publish-heavy; decide early whether to adopt React Query for them (§7) rather than retrofitting later.
- **Diff overlay is the long pole** — keep it last and don't let Seed Manager actions imply it exists.

## 7. Open decisions

- **Data layer for authoring routes:** keep `useEffect`+`useState`, or adopt **React Query** (+ Zod) for the draft/catalog/seed data the new routes manage? Leaning React Query for the new routes only (don't retrofit explorer).
- **Extraction depth:** how much of `ExplorerWorkspace` becomes the shared `MapCanvasView` vs. stays in the live adapter (selection/overlay generalization boundary).
- **Zod backfill scope:** new routes only (recommended) vs. also hardening existing `/api/*` boundaries.
- **Preset migration timing:** fold `/genesis`/`/shipyard` in Phase 5, or run them in parallel longer behind the parity check.

## 8. References

- `docs/features/proposed/authoring_dashboard_frontend_proposal.md` — the spec this implements (routes, layout, §6 shell+subpanels, §10 sequencing).
- `docs/features/proposed/entity_authoring_system_proposal.md` — blueprint schema, hooks (§5), overrides (§3.6), intents (§5.1).
- `docs/features/proposed/universe_baseline_seeding_proposal.md` — baseline package, Seed Manager (§8).
- `docs/plans/proposed/content_authoring_composition_plan_2026-06-17.md` — WS2 (entity APIs), WS3/WS5/WS7 (the backend this frontend rides).
- `.claude/skills/sidereal-frontend/SKILL.md` — theme tokens, shadcn/ui, Zod, route boundaries, bundle-splitting, security.
- Dashboard code: `dashboard/src/components/grid/GridCanvas.tsx`, `dashboard/src/features/explorer/ExplorerWorkspace.tsx`, `dashboard/src/components/sidebar/DetailPanel.tsx`, `dashboard/src/components/brp-editors/{ComponentEditorRenderer.tsx,registry.tsx}`, `dashboard/src/features/component-schema/{registry.ts,types.ts}`, `dashboard/src/features/{shipyard,genesis}/*Page.tsx`, `dashboard/src/server/gateway-proxy.ts`, `dashboard/src/lib/api/client.ts`, `dashboard/src/routes/_dashboard.*.tsx` + `routes-lazy/*`.
