# Dashboard Systems Catalog (V1)

Status: Active
Lifecycle: source-of-truth
Category: system
Last updated: 2026-09-07
Owners: dashboard + agent workflow
Scope: Stable labels and per-route versions for the dashboard's route "mini-apps".
Source of truth: yes
Supersedes: n/a
Superseded by: n/a
Primary references:
- dashboard/src/lib/dashboard-systems.ts
- dashboard/src/components/layout/DashboardShell.tsx
- docs/systems/core_systems_catalog_v1.md

Date: 2026-06-24
Owners: dashboard + agent workflow

This catalog is the dashboard counterpart to `docs/systems/core_systems_catalog_v1.md`.
Each dashboard route is treated as its own versioned "mini-app": a system with a
stable label, a human title, and a `MAJOR.MINOR` version. The active route's
version renders in the app-bar header (top-left, under the brand).

The machine source of truth is `dashboard/src/lib/dashboard-systems.ts`. This
document mirrors it. A unit test (`dashboard/src/lib/dashboard-systems.test.ts`)
keeps the registry and the navigation in lockstep; this table must be updated in
the same change as the registry.

## 1. Purpose

Use this catalog when you need a stable label or version for a dashboard route,
for example:

1. release/change notes per route,
2. linking a route to its design/feature docs,
3. surfacing the route version in the UI,
4. future versioned route follow-ups (`v2`, `v3`, and so on).

## 2. Naming and Versioning Rules

For each route-system, keep three stable forms (mirroring the core catalog):

1. Human title — e.g. `Metrics`.
2. Stable label — e.g. `dashboard.metrics.v1` (major line only).
3. Short slug — the label's middle segment, e.g. `metrics`.

Versions are semver-lite `MAJOR.MINOR` (shown in the navbar as `v1.3`):

- **MAJOR** tracks the stable label (`dashboard.<slug>.vN`). Bump it only for a
  route rewrite/replacement, and introduce a new `.vN` label for historical docs.
- **MINOR** bumps on every user-facing feature or behavior change to the route.

**Bump rule:** when you ship a user-facing feature or behavior change to a route,
bump that route's version in `dashboard/src/lib/dashboard-systems.ts` and update
its row here in the same change. Bug-fix-only changes do not require a bump. This
mirrors the existing "client changes → bump + publish" convention and is enforced
as a `sidereal-frontend` skill rule.

## 3. Catalog

| Label | Human title | Version | Current baseline | Primary references |
| --- | --- | --- | --- | --- |
| `dashboard.account.v1` | My Account | 1.0 | Account character selection, creation, reset, and deletion; the default landing route for any authenticated account. | `dashboard/src/routes/_dashboard.index.tsx`, `docs/features/active/account_character_selection_layout_contract.md` |
| `dashboard.profile.v1` | Profile | 1.0 | Account identity, password reset, and TOTP/MFA enrollment + disable. Reflects real authenticator enrollment (not the bootstrap-token grace claim). | `dashboard/src/routes/_dashboard.profile.tsx`, `dashboard/src/server/dashboard-auth.ts` |
| `dashboard.database.v1` | Database | 1.0 | Persisted entities, accounts, and graph-backed data tools. Admin-gated. | `dashboard/src/features/database/` |
| `dashboard.game_world.v1` | Game World | 1.2 | Live BRP entity explorer, spawning, and diagnostics against the running world. Right-click modular ships to open their live Shipyard instance editor. Admin-gated. | `dashboard/src/routes/_dashboard.game-world.tsx` |
| `dashboard.firmament.v1` | Firmament | 1.9 | Universe-baseline authoring: baseline map with resizable rails + HUDFrame panels; unified asset browser (entity packages + Genesis planets, tree + card views with thumbnails) with drag-to-map placement; schema-driven per-placement component overrides; zone-boundary drawing/editing for circle, polygon, and width-swept path shapes, including authored smooth-edge falloff on every shape; WYSIWYG planet placement; on-map move/rotate/scale/delete editing; cursor-coordinate HUD; and seed manager. | `dashboard/src/features/firmament/`, `docs/decisions/dr-0054_universe_baseline_vs_evolved_world_separation.md`, `docs/plans/active/firmament_universe_authoring_and_seed_plan_2026-06-20.md` |
| `dashboard.game_client.v1` | Game Client | 1.0 | Dashboard host surface for the browser WASM client runtime. Admin-gated. | `dashboard/src/routes/_dashboard.game-client.tsx` |
| `dashboard.metrics.v1` | Metrics | 1.2 | Server observability: overview stat cards, service signals, domain-activity heatmap, charts, and events. Catalog is a collapsible right-hand dock (single-column rows with the metric key on its own line); a scope-gated "Clear" action prunes all stored samples/events via the gateway prune endpoint. GridCN chrome with true light-mode support. | `dashboard/src/features/metrics/`, `dashboard/src/components/thegridcn/` |
| `dashboard.security.v1` | Security / Auth | 1.0 | Auth counters, abuse/limit signals, and the security event feed. Admin-gated. | `dashboard/src/features/security/` |
| `dashboard.shader_workshop.v1` | Shader Workshop | 1.1 | WGSL authoring, preview, diagnostics, asset metadata, and baseline-owned per-render-layer `ShaderParameterSet` value publication with optimistic whole-baseline persistence. Admin-gated. | `dashboard/src/features/shaders/`, `docs/decisions/dr-0049_dashboard_authoring_control_plane.md` |
| `dashboard.genesis.v1` | Genesis | 1.3 | Planet package authoring, deterministic randomization, one-step validated package publishing, and cached planet card thumbnails (rendered on publish + on-demand, transparent PNGs) with a Regenerate-thumbnail action. | `dashboard/src/features/genesis/`, `docs/features/active/genesis_planet_registry_contract.md` |
| `dashboard.shipyard.v2` | Shipyard | 2.14 | Canonical canvas ship authoring at `/shipyard`, replacing the old editor, laid out like /firmament: a resizable left-rail tree (ship classes / hulls), a centre grid (block footprint editor OR hull assembler, by selection), and a resizable right rail with the active editor's details. The **hull assembler** places blocks on a class-sized grid with live §13 validation + a derived mass/CoG/power/capacity/stat-pool/thrust preview; the **block designer** is a structured BlockDefinition form (footprint editor, placement rules, linked components). Both publish decoded JSON via the gateway. A single icon-only part palette floats over the canvas or docks below it, with search, layer/category filters, hover details, block design actions and session-restored layout. Canvas editing uses a transparency checkerboard, image selectors, selection/move/box selection, rotation, delete, pan/zoom and complete per-document session undo/redo. Rooms/walls, interior equipment, hull armor, exterior hardpoints, roof and markings have separate editor controls. F/Shift+F flip the selection; Home fits the canvas. Connected faction armour plates, decals and editable hull lettering preview in the exterior; published finishes apply through owner-shard CAS and durable receipts. Roof visibility controls cutaway through the layer list. Replacement drops, placement rules and physical mass previews remain available. Live drafts and undo/redo recover across refreshes within the same tab, preserving original conflict checks. Live instance refits use owner-shard expected-value commands, preserve fitting identities and crew/cargo, and report canonical persistence receipts; published blueprints remain unchanged. Runtime hull realization uses the shared typed compiler. | `dashboard/src/features/shipyard-v2/`, `docs/plans/proposed/shipyard_v2_block_authoring_route_plan_2026-06-25.md`, `docs/features/active/ship_construction_blocks_contract.md` |
| `dashboard.entities.v1` | Entity Instances | 1.0 | UUID-addressed live component edits, persistence receipts, provenance and capture-to-baseline drafts. | `dashboard/src/routes/_dashboard.entities.$entityGuid.tsx` |
| `dashboard.foundry.v1` | Foundry | 1.1 | Entity-package composer: blueprint catalogue, fields, and hooks. | `dashboard/src/features/foundry/` |
| `dashboard.atelier.v1` | Atelier | 1.0 | Sprite & image studio: PNG/SVG asset tree, create/upload, and the full-height pixel editor. | `dashboard/src/routes/_dashboard.atelier.tsx`, `dashboard/src/features/foundry/` |
| `dashboard.sound_studio.v1` | Sound Studio | 1.0 | Audio registry browsing, waveform preview, and cue marker editing. | `dashboard/src/features/audio-studio/` |
| `dashboard.script_editor.v1` | Script Editor | 1.0 | Generic Lua script catalog editing and draft publishing. | `dashboard/src/features/script-editor/` |
| `dashboard.settings.v1` | Settings | 1.0 | Dashboard configuration and future environment settings. | `dashboard/src/routes/_dashboard.settings.tsx` |

## 4. Deferred Follow-up: Service Version Reporting

The dashboard should also surface the **gateway** and **replication** server
versions alongside its own per-route versions. This is deferred to a follow-up
phase because it requires backend additions:

- The gateway `/health` returns a bare `200` and exposes no version; add its
  `CARGO_PKG_VERSION` (and, ideally, a relayed replication version) to a
  `/health` field or a new `/version` endpoint.
- Replication knows its own version (`CARGO_PKG_VERSION`, already used in the
  auth handshake) but does not expose it on `/health`; add it to the health
  snapshot.
- The dashboard then adds an `/api/service-versions` server route that fetches
  both and surfaces them (e.g. in the Metrics "Service Signals" panel and/or the
  app-bar tooltip).

Until then, the navbar reports only the active route version and the dashboard
build version (header tooltip).

## 5. Notes on Scope

This catalog covers the user-facing dashboard routes listed in `toolNavItems`
(`dashboard/src/components/layout/DashboardShell.tsx`). It is an index, not a
replacement for the deeper feature contracts and code it links to. When a new
route is added, add it to the registry and this table in the same change.

2026-09-05: Foundry code/instance status, Firmament preview/apply/provenance links,
and generic/Genesis/Shipyard live editors advance the affected route versions.

2026-09-06: Shipyard 2.3 adds modular tile artwork and layer-aware placement, attachment, clearance and loaded-mass previews.

2026-09-06: Shipyard 2.4 adds explicit walkable floor, solid fixture and cockpit seat roles, with editable interior collision dimensions.

2026-09-06: Shipyard 2.5 replaces the footprint/assembly grids with canvases, adds document history, faction armour finishes and editable hull text/decals, and supports explicit live cosmetic application with physical-assembly guards.

2026-09-07: Shipyard 2.6 consolidates block browsing into a detachable thumbnail palette. The left library contains classes and hulls; block creation/editing remain available through the palette. Moving, docking and collapsing the palette do not modify document history.

2026-09-07: Game World 1.2 routes modular ship context-menu edits to Shipyard 2.7 live instance canvases. Applying a live refit is separate from publishing a shared blueprint.

2026-09-07: Shipyard 2.8 removes visible history lists while retaining full undo/redo. Both canvases have vertical tool strips. The right drawer holds selectable, hideable ship layers; the floating palette contains Parts and Exterior finishes tabs. Parts drag onto the grid and selected tiles support right-click rotation/deletion. Room previews derive shared corner junctions from the complete floor perimeter.

2026-09-07: Shipyard 2.9 replaces the old hardpoint editor at `/shipyard` and removes its dashboard proxy routes. The rail has one Shipyard entry. Existing `/shipyard-v2` and live-instance links redirect to the canonical routes; non-modular instances use the generic entity inspector. The Parts window resizes on every floating edge/corner, or vertically when docked, with bounds, keyboard resizing and session-restored dimensions. Resizing does not modify document undo history.

2026-09-07 Shipyard 2.9 validation: 412 dashboard unit tests and eight authenticated browser checks passed, including live refit persistence, canonical/redirected routes, resizing/restoration, docking, tile drag/drop and undo/redo. Dashboard typechecking, lint and production bundling passed; workspace Rust formatting, Clippy and check gates passed with no runtime changes.

2026-09-07: Shipyard 2.10 prioritizes canvas artwork over palette thumbnails and carries gateway content hashes in its catalogue. Both editors and the palette share versioned preview URLs, allowing private browser caching with invalidation when the asset content changes.

2026-09-07: Shipyard 2.11 adds Ctrl-drag (Cmd-drag on macOS) to duplicate a tile or active-layer selection. Copies preserve orientation and authored mount loadouts, receive fresh editor identities, remain selected, and commit as one undoable edit. Originals stay visible during dragging. Same-layer overlap and out-of-grid placement reject the whole copy; no movement and Escape/cancel create no edit. Cosmetic markings also support the gesture. Live changes still require the existing explicit Apply action and owner-shard validation.

2026-09-07: Shipyard 2.12 restores unsaved live-instance drafts and undo/redo from account/ship-scoped tab session storage, preserving the original expected-value snapshot and module identity bindings. Replacement drops remove intersecting parts within an editing domain in one undo step; right-click cancels active selection/placement before opening contextual actions on an unselected tile. Rooms/walls, interior equipment, hull armor, exterior hardpoints, roof and markings have separate editor rows. Roof visibility replaces the cutaway toggle. F/Shift+F reflect geometry and markings; Home fits the canvas.

2026-09-07: Shipyard 2.13 replaces isolated roof-panel frames with opaque flush skin and eight-neighbour perimeter joins. Roofs cover the full walkable deck union, including airlocks. Paint/text stay in the independent Markings layer; no faction stripes or vents are baked into the roof panels.

2026-09-07: Shipyard 2.14 adds light, twin and heavy roof turrets in six faction palettes. Exterior hardpoints have independent occupancy above interior equipment, require full structural support and reject airlock openings. Live rotation preserves module identity, ammunition, cooldown and aiming state. The shared runtime drives turret traverse and firing from the occupied control station’s authenticated cursor aim.
