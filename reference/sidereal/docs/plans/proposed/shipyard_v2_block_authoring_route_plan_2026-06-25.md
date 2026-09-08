# Shipyard V2 Block Authoring Route Plan

Status: Proposed
Lifecycle: proposed
Category: plan
Last updated: 2026-06-25
Owners: dashboard/frontend + gateway + content authoring
Scope: A focused, frontend-led implementation plan for a TEMPORARY new `/shipyard-v2` dashboard route that lets an author design and publish block-based ships (and stations) — a block (component) designer plus a grid hull assembler with live validation and derived-physics/budget preview — backed by the minimal block/hull/ship-class registry plumbing it needs, and explicitly deferring the runtime (spawn, physics, IFCS, persistence-of-live-entities, cutover) to the broader ship-construction-blocks plan.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- docs/features/active/ship_construction_blocks_contract.md
- docs/features/proposed/dashboard_shipyard_v2_proposal.md
- docs/plans/proposed/ship_construction_blocks_system_v1_plan_2026-06-13.md
- docs/decisions/dr-0050_block_based_ship_construction.md
- docs/decisions/dr-0049_dashboard_authoring_control_plane.md
- docs/decisions/dr-0046_lua_asset_registry_gateway_http_delivery.md
- docs/features/active/shipyard_ship_authoring_contract.md
- docs/plans/active/unified_content_authoring_pipeline_plan_2026-06-12.md
- docs/decisions/dr-0045_engine_content_separation_achieved.md
- docs/systems/dashboard_systems_catalog_v1.md
- .claude/skills/sidereal-frontend/SKILL.md

## 1. Goal & positioning

Ship the **dashboard authoring surface** for block-based ships as a standalone, temporary
`/shipyard-v2` route — ahead of the construction runtime, and side-by-side with the live
`/shipyard` (v1 hardpoint) route. An author can:

1. **Design a block** (`BlockDefinition`): footprint, placement/connection rules, linked Bevy
   components (contributions + behaviours), mass, and cost — as a structured form (never raw Lua).
2. **Assemble a hull** (`HullDefinition`): place designed blocks on a class-sized grid with **live
   validation** and a **derived-physics + budget preview** (CoG, mass, power, capacity, stat pools,
   per-thruster thrust vectors), then publish.

This is the **authoring half** of `system.ship_construction_blocks.v1`; its system label is
`system.shipyard_authoring.v2` (the Shipyard V2 proposal). The design authority is the **Ship
Construction Blocks Contract** (`docs/features/active/ship_construction_blocks_contract.md`) — this
plan does not redefine the data model, it implements the tooling for it. Read that contract and
`docs/features/proposed/dashboard_shipyard_v2_proposal.md` first.

**Why now, ahead of the runtime:** the broader plan
(`docs/plans/proposed/ship_construction_blocks_system_v1_plan_2026-06-13.md`) is backend-first and
sequences the dashboard last (its WS9, after WS1–WS8). The authoring UX, the pixel/asset pipeline,
and the client-side preview math are large and separable, and authored block/hull artifacts are
useful forward-compatible inputs the runtime will consume when it lands. Building the route now
unblocks content authoring and de-risks the eventual runtime by producing real `HullDefinition`s to
spawn.

## 2. Relationship to existing work (the carve-out)

This plan is a frontend-led **slice** of the broader plan, not a replacement. It delivers a minimal
subset of WS1 (schema + decode/validate + registry plumbing — **no** runtime) plus all of WS9
(dashboard editor) plus the client-side preview math, and explicitly defers everything else.

| Broader-plan workstream | This plan |
|---|---|
| WS1 block/hull Lua schema + decoders + validation gate | **Subset**: typed structs + decode + the §13 validation gate, as **authoring-time only**. No `Hull` entity. |
| WS9 dashboard hull editor | **Full** (this is the centrepiece). |
| Shipyard V2 pixel painter + asset pipeline | **In scope, phased last** (Phase E; deferrable). |
| WS2 entity/spawn, WS3 physics+engine seam, WS4 IFCS, WS5 mounts/loadout, WS6 power runtime, WS7 client render, WS8 persistence/replication, WS10 stations runtime, WS11 cutover | **Deferred** — owned by the broader plan. Published hulls/blocks sit in the registry until the runtime exists. |

**On-disk format correction (important).** The broader plan (2026-06-13) shows blocks/hulls as
god-Lua files under `data/scripts/blocks/registry.lua`. That predates the D2 disk-SoT migration:
registries are now **per-entity packages** (`data/content/<kind>/<package_id>/` with `manifest.json`
+ `definition.json`, read via the `registry_package_index` cache — see `ships`/`ship_modules`). This
slice MUST follow the **current per-entity-package convention**, mirroring `data/content/ships/`,
NOT the old god-Lua layout. (See the script-catalog disk-SoT work and `registry_authoring.rs`.)

## 3. Scope

**In scope:**
- A new admin-gated `/shipyard-v2` route (side-by-side with `/shipyard`), lazy-split.
- The **block (component) designer** and the **hull assembler** as **two sub-views of this one route**
  (the proposal §4/§6). Block authoring lives HERE, not in a separate route: a block is a
  ship-construction primitive (footprint/`facing`/placement rules are grid concepts), and the
  design→place loop is the core UX. (Decision §10 #7.)
- **Live validation** mirroring the contract §13 gate, and a **client-side derived-physics + budget
  preview** mirroring contract §8/§10 (advisory; the server stays authoritative at spawn).
- The **minimal backend** the UI needs: `block`/`hull`/`ship_class` registry kinds — typed Rust
  structs, Lua decode + the authoring validation gate, and gateway read/write (draft→publish)
  endpoints mirroring `ships`. A small seed catalog (a few blocks + a ship-class table) so the
  editor has content on day one.
- **Block tile art is authored in the existing `/atelier` route** (the pixel/image studio) and
  **referenced** in the block designer via Foundry's reusable `AssetPicker` — this slice does NOT
  build its own painter. A small footprint-aware "new tile" handoff to Atelier is the only art-side
  addition. (Decision §10 #4.)

**Out of scope (deferred to the broader plan / other efforts):**
- The `Hull` ECS entity, `spawn_hull`, derived-physics engine seam, IFCS allocator, mounts/turret
  runtime, weapon loadout/fitting, power brown-out, persistence/replication of live hulls, client
  rendering of hulls, stations runtime, and the v1→v2 cutover (broader plan WS2–WS8, WS10, WS11).
- Hex grid (square only in V1), tech unlocks/economy pricing, in-world (non-dashboard) build UI,
  multi-user editing.

The deliverable is an authoring tool that **produces validated, typed `BlockDefinition` and
`HullDefinition` registry packages on disk**. Nothing spawns or runs them yet.

## 4. Data model (authored by this route)

Defined by the contract — restated here only as what the editor reads/writes. Do not diverge.

- **`BlockDefinition`** (contract §5): `block_id`, `display_name`, `category` (`bridge`/`hull`/`armor`/
  `structure`/`reactor`/`battery`/`thruster`/`mount`/`fuel`/`cargo`/`scanner`/`shield`/`jump_drive`/
  `generic`), `footprint` (`[[x,y],…]`, rotates with `facing`), `mass_kg`, `health`, `cost
  {credits, capacity}`, `placement` (edge attachability, `attach_to`, `min_attachments`, `clearance`,
  keep-clear cells), `directional`, `visual {tile_asset_id}`, and `components` (`[{kind, properties}]`
  — contributions and/or behaviours per the component-role registry, contract §7).
- **`HullDefinition`** (contract §6): `hull_id`, `bundle_id`, `kind` (`ship`|`station`), `class`,
  `display_name`, `grid {kind, cell_size_m}`, `hull_size {width, length}`, `root` (non-derived stats),
  `visual {map_icon_asset_id}`, `components` (the array of `HullComponent` `{block_id, cell, facing}`),
  and `loadout` (`[{mount_cell, weapon_id}]`).
- **`ShipClassDefinition`** (contract §9): per class (`small`/`medium`/`large`/`capital`) a
  `grid_cap` and `capacity_budget`.

**Derived, never authored** (contract §10): mass, CoG, inertia, collision outline, aggregated stat
pools, `capacity_cost`/`credit_cost` sums, power balance. In this slice these are computed
**client-side for preview only** (§7 below); the runtime recomputes authoritatively later.

## 5. Phase A — minimal backend enablement (no runtime)

Goal: gateway-served typed JSON for blocks/hulls/ship-classes + a draft→publish write path, plus the
authoring validation gate. This is the only Rust work in this plan; it adds **no** ECS components,
**no** spawn, **no** physics, and **no** engine change (DR-0045 deletion test stays green).

- **Typed registry structs (content, `crates/sidereal-game/`):** `block_registry.rs`
  (`BlockDefinition`), `hull_registry.rs` (`HullDefinition`, `HullComponent`), `ship_class_registry.rs`
  (`ShipClassDefinition`). Additive; `ship_registry.rs` (v1) untouched. Serde-mirror the contract
  field-for-field.
- **Decode + validation gate (`lua_content.rs` + the authoring round-trip):** implement the contract
  §13 checks as pure, unit-tested functions (unknown `block_id`/component kind; cell overlap; cell
  outside `HullSize`; `HullSize` over `class.grid_cap`; `Σ capacity_cost` over `class.capacity_budget`;
  placement-rule violations — open edge, missing `attach_to`, clearance; not edge-connected to the
  bridge; not exactly one bridge; zero thrusters for ships; mount-size vs loadout; power balance). The
  gateway enforces this on publish; the dashboard mirrors it client-side (§7).
- **Per-entity packages on disk:** `data/content/blocks/<package_id>/`,
  `data/content/hulls/<package_id>/`, `data/content/ship_classes/<package_id>/` — `manifest.json` +
  `definition.json` envelope, exactly like `data/content/ships/<id>/`. Reuse `registry_authoring.rs`
  (`EntityPackageEnvelope`, `load_registry_definitions_from_dir`, `write_registry_definition`, the
  `registry_package_index` cache).
- **Gateway endpoints (mirror `ships`, `admin_dashboard.rs`):**
  `GET /admin/dashboard/registries/blocks` | `.../hulls` | `.../ship-classes` (return
  `AuthoringRegistryEnvelope` typed JSON); `POST .../blocks/definition` + `.../blocks/index` (and the
  hull/ship-class equivalents). Same scoped-token + MFA auth as the ship endpoints (DR-0049). Extend
  `RegistrySource` resync to the new kinds (no-op until the runtime consumes them).
- **Seed content:** a handful of starter blocks (bridge, reactor, battery, a main + maneuver
  thruster, an armor plate, a turret mount, a fuel tank, a cargo bay) and a `ship_class` table, as
  packages, so the editor is usable immediately. Tile art may be placeholder until Phase E.
- **Tests:** decoder round-trip + each validation-gate rejection; gateway read/write round-trip
  (mirror `bins/sidereal-gateway/tests/`).

## 6. Phases B–E — the dashboard route

Follow the v1 shipyard wiring (the explore map below lists the touch points). All routes/components
are `.ts/.tsx` content — none of this is engine.

### Phase B — route scaffolding
- Route file `dashboard/src/routes/_dashboard.shipyard-v2.tsx` → lazy `dashboard/src/routes-lazy/shipyard-v2-route.tsx` → `dashboard/src/features/shipyard-v2/ShipyardV2Page.tsx` (heavy editor stays lazy/route-split per the frontend rules).
- Register: a new row in `dashboard/src/lib/dashboard-systems.ts` (`route: '/shipyard-v2'`,
  `systemLabel: 'dashboard.shipyard.v2'`, `title: 'Shipyard V2'`, start `version: '2.0'`) and a
  matching admin-gated `toolNavItems` entry in `dashboard/src/components/layout/DashboardShell.tsx`;
  add the catalog row in `docs/systems/dashboard_systems_catalog_v1.md` in the same change. (The
  existing `dashboard.shipyard.v1` row stays until cutover.)
- `dashboard/src/features/shipyard-v2/types.ts` (mirror the Rust structs) + Zod schemas in
  `dashboard/src/lib/schemas/` (validate route params, draft bodies, definitions at the boundary).
- API client + proxy routes `dashboard/src/routes/api.shipyard-v2.*` + server lib
  `dashboard/src/lib/shipyard-v2.server.ts`, mirroring `shipyard.server.ts` (scoped `scripts:read`/
  `scripts:write`). Route-owned initial data loading of the block catalog + ship classes + existing
  hulls (no first-render `useEffect` fetch).

### Phase C — block (component) designer (a sub-view of this route)
- Structured form for `BlockDefinition` (proposal §4): footprint grid-cell picker with per-`facing`
  arrangement preview; per-edge attach/blocked toggles + `attach_to` multiselect + `min_attachments`
  + `clearance` + keep-clear cells; `mass_kg`/`health`/`cost`. Live edge-profile preview.
  Draft→publish via the gateway. No raw Lua in the dashboard.
- **Reuse, don't duplicate** for the two overlapping pieces:
  - The **linked-components list** (`[{kind, properties}]`, contributions + behaviours) is exactly
    what Foundry's schema-driven `ComponentEditorRenderer`
    (`dashboard/src/components/brp-editors/ComponentEditorRenderer.tsx`) already edits against the
    component registry — reuse it rather than building a second component editor.
  - The **block tile reference** (`visual.tile_asset_id`) uses Foundry's reusable `AssetPicker`
    (`dashboard/src/features/foundry/FoundryVisualSection.tsx`) — the same control Shipyard V1 uses
    for sprite/map-icon. Its built-in "new" action is the handoff to Atelier (Phase E).

### Phase D — hull assembler + preview (the centrepiece)
- A grid canvas sized by the chosen ship class (`grid_cap`). Place / rotate (`facing`) / mirror /
  delete blocks. Reuse the firmament/grid interaction idioms where they fit (selection, handles,
  pointer-capture), but this is its own editor.
- **Live validation** inline as the author builds (mirrors §7).
- **Preview** the derived physics + budgets (proposal §6): CoG marker, mass, inertia hint, power
  (generation/draw/storage), capacity used/remaining, aggregated stat pools, per-thruster thrust
  vectors + a coarse maneuver-authority readout (can it strafe/yaw?). Default loadout assignment per
  mount. Publish the `HullDefinition` draft→publish.

### Phase E — Atelier integration for block tile art (deferrable / last)
**Do NOT build a new painter.** The existing `/atelier` route (`AtelierStudio` + `SpriteEditor`,
under `dashboard/src/features/foundry/`) already has the full pixel editor (pencil/fill/eraser/
eyedropper/line/rect/ellipse/grid/undo-redo), arbitrary-size canvas creation (`NewBlankDialog`,
1–256 px), and content-addressed asset save/payload via the DR-0046 routes
(`POST /admin/assets/by-id/{id}` + `.../payload`). The block designer references the result by
`asset_id` through the reused `AssetPicker` (Phase C). The only additions are small Atelier UX
handoffs, each independently shippable (placeholder tiles work until then):
- A **footprint-aware "new tile"** path: compute the canvas size from `footprint × tile_resolution`
  (default 32 px/cell) instead of free-entry, and name it by convention (`block_tile_<slug>`). Either
  a deep link to `/atelier/$assetId` pre-sized, or a small embedded variant of `NewBlankDialog`.
- An optional **footprint grid overlay** in the editor so the author sees which cells matter.
- **Constraint:** Atelier's canvas caps at 256 px, so at 32 px/cell a block footprint is bounded to
  ~8×8 cells in V1 (ample). Note this in the designer.
- Per-`facing` art is out of scope for V1 (one tile rotated by `facing`; decision §10 #3).

## 7. Client-side validation + preview math (pure, unit-tested)

The dashboard's value is instant feedback, so the preview math is real work and a place to get wrong.
Factor it into pure modules (e.g. `dashboard/src/features/shipyard-v2/hull-preview.ts` +
`block-placement.ts`) with unit tests, mirroring how firmament factored gizmo geometry into a tested
helper. It MUST mirror the contract exactly and is **advisory only** (server authoritative at spawn):

- **Placement (contract §8):** footprint within `HullSize`, no overlap, no keep-clear violation;
  per-edge open/blocked attachment; `attach_to` + `min_attachments`; clearance; edge-connectivity to
  exactly one bridge; ≥1 thruster (ships).
- **Derived physics (contract §10):** `M = Σ mᵢ`; `CoG = (Σ mᵢ·cᵢ)/M` with `cᵢ = cell_size_m ·
  centroid(footprint)`; `Iz = Σ[mᵢ·|cᵢ−CoG|² + mᵢ·(wᵢ²+hᵢ²)/12]`; footprint outline/AABB.
- **Pools + budgets (contract §7/§9):** sum contributions per pool id (one generic aggregator — no
  per-pool code); `Σ capacity_cost ≤ class.capacity_budget`; `HullSize ≤ class.grid_cap`; power
  balance (`Σ draw ≤ generation + storage`).
- **Thrust readout (contract §11, coarse):** per-thruster direction + position relative to CoG; a
  qualitative "can strafe / yaw" indicator. The full bounded-NNLS allocator is runtime (deferred); the
  preview only needs the geometry to flag obviously under-thrustered layouts.

## 8. Engine/content boundary, skills & rules (for the implementer)

- **DR-0045 boundary:** all block/hull/class vocabulary is **content** (`sidereal-game` + `data/`) +
  dashboard; the gateway endpoints are gateway. **No** `engine-*` change in this slice (the lone
  engine change in the whole effort — the `DerivedMassContribution` mass seam — is runtime WS3,
  deferred). The deletion test MUST stay green.
- **Skills to invoke:**
  - `sidereal-frontend` — the route, Zod boundaries, lazy-split, **route versioning** (bump
    `dashboard-systems.ts` + the catalog row), semantic theme tokens, shadcn/ui, **no
    `window.confirm`/`prompt`/`alert`** (use the AlertDialog pattern), route-owned data loading.
  - `sidereal-dev-tooling` — never raw `cargo run`; use `scripts/siderealctl` for build/test/run; env
    via `dev.toml`.
  - `sidereal-engine-boundary` — keep block/hull vocabulary out of `engine-*`.
  - `sidereal-docs` — `scripts/siderealctl docs-check` after doc edits; header schema.
  - `sidereal-shaders-assets` — only for Phase E (the DR-0046 content-addressed asset pipeline the
    Atelier handoff rides on).
  - `sidereal-observability-net` — for the gateway admin endpoint auth/scopes/security.
  - `sidereal-components` — only if a later change adds ECS components (this slice adds **none**).
- The dashboard holds **no Lua parser** — it reads decoded typed JSON from the gateway and publishes
  typed JSON the gateway round-trips to the package source (unified content authoring pipeline; DR-0049).

## 9. Verification

- **Phase A (Rust):** `cargo fmt`, `clippy -D warnings`, decoder + validation-gate unit tests, gateway
  read/write round-trip tests; engine **deletion test** green; via `scripts/siderealctl`.
- **Phases B–E (dashboard):** `tsc`, `eslint` + the frontend guard scripts, `npm run lint`, vitest
  (the `hull-preview`/`block-placement` math + Zod schemas), `vite build`; dashboard health (`:3000`
  → 200). Bump `/shipyard-v2` version + catalog row in the same change.
- **Docs:** `python3 scripts/check_docs.py` (run from repo root) green.
- **Manual acceptance (this slice):** open `/shipyard-v2`; design a block (footprint + a contribution
  + a behaviour) and publish it; assemble a hull from seed blocks; see live validation reject a
  disconnected block / a missing bridge / an over-budget layout; see the CoG/power/capacity/thrust
  preview update live; publish a `HullDefinition`; reload and confirm it round-trips from the gateway.
  (No in-world spawn — that is the runtime, deferred.)

## 10. Open decisions (recommended defaults; confirm with the user before/at implementation)

These mostly inherit the broader plan §15 and the proposal §9; this slice only needs the authoring
ones resolved:

1. **Grid:** `square`, `cell_size_m = 2.0` (contract §4; hex stays expressible behind `GridKind`).
   Recommended — proceed.
2. **Designer depth vs Lua:** how much of the placement-rule DSL is editable in the block designer in
   V1 vs authored in Lua. Recommended: edit footprint + edges + `attach_to` + `min_attachments` +
   `clearance` in the designer; leave exotic rules to Lua initially.
3. **Tile art / facing:** one authored tile rotated by `facing` (recommended) vs four authored tiles.
4. **Tile-art tool (decided): reuse `/atelier`.** Block tile art is authored in the existing Atelier
   pixel/image studio and referenced via Foundry's `AssetPicker`; this slice does NOT build a painter
   (Phase E). The only remaining sub-question is whether the footprint-aware "new tile" handoff is a
   deep link to `/atelier/$assetId` or a small embedded `NewBlankDialog` variant — an implementation
   detail for Phase E.
5. **Route label/version at cutover:** this slice uses a distinct `dashboard.shipyard.v2` row at
   `/shipyard-v2`; at the broader plan's WS11 cutover it either replaces `/shipyard` or is renamed —
   a cutover-time decision, out of scope here.
6. **Backend stance:** Phase A builds the **real** gateway-backed registries (required by DR-0049 +
   the unified authoring pipeline — the dashboard must not parse Lua and must read decoded JSON). A
   dashboard-server-only stub is explicitly discouraged and would have to be torn out.
7. **Block authoring location (decided): inside Shipyard V2.** Block authoring is a "Block Designer"
   sub-view of `/shipyard-v2`, not a separate route — a block is a ship-construction primitive and
   the design→place loop is the core UX (reusing Foundry's component editor + asset picker). Not a
   Foundry/Genesis-style separate registry route.

## 11. Out of scope / hand-back

When this slice is done, the registry has validated `BlockDefinition`/`HullDefinition`/
`ShipClassDefinition` packages an author produced through the UI. The broader plan
(`docs/plans/proposed/ship_construction_blocks_system_v1_plan_2026-06-13.md`) then consumes them:
WS2 spawns a `Hull`, WS3 derives physics via the engine mass seam, WS4 feeds the IFCS allocator, WS5
mounts/loadout, WS6 power, WS7 client render, WS8 persistence/replication, WS10 stations, WS11
cutover (which also retires this temporary route or promotes it to replace `/shipyard`). This plan
deliberately stops at "authored + validated + published artifacts."

## 12. Phase A implementation notes (progress + A2/A3 map)

> **Status (2026-06-25): Phases A–D COMPLETE.** A1 (schema + gate), A2 (JSON-native compose + seed),
> A3 (gateway endpoints), B (route scaffold + catalog load), C (block designer), and D (hull assembler
> + client-side preview) are all shipped + committed. `/shipyard-v2` (`dashboard.shipyard.v2` @ 2.1) is
> live with three tabs — Overview, Assemble hull, Design block — reading + publishing decoded JSON via
> the gateway. **Only Phase E (Atelier tile-art handoff) remains, and it is deferrable.**
>
> Phase C/D files: `dashboard/src/features/shipyard-v2/` (`hull-preview.ts` + `hull-preview.test.ts`
> — the pure, unit-tested validation/derived-physics core mirroring the Rust gate + contract §10;
> `HullAssembler.tsx` grid editor; `BlockDesigner.tsx` form; `block-visuals.ts`), the write proxies
> (`api.shipyard-v2.{hulls,blocks}.definition`), and the `saveShipyardV2{Block,Hull}Definition` server
> publishers.
>
> **Phase C/D deferrals (noted, not blocking):** linked components are edited as kind + JSON (the
> Foundry `ComponentEditorRenderer` reuse is a refinement); the tile reference is a plain `asset_id`
> field (the Foundry `AssetPicker` / Atelier handoff is Phase E); multi-cell footprints place at the
> anchor (rotation preview is engine-side); the placement-rule DSL covers attach-to/min/clearance
> (keep-clear + per-edge profiles are iterative).

### A1 — SHIPPED (2026-06-25)
Schema + pure validation gate landed in `sidereal-game` (no runtime, no engine change; clippy
`-D warnings` clean, 15 unit tests):
- `hull_grid.rs` — `GridKind`/`Facing` + cell math (footprint rotation by facing, occupied cells,
  centred bounds, orthogonal neighbours): the single grid module the contract mandates.
- `block_registry.rs` / `hull_registry.rs` / `ship_class_registry.rs` — the typed definition +
  registry structs, serde-mirroring the contract; additive (`ship_registry` untouched).
- `hull_validation.rs` — pure `validate_hull(hull, &[BlockDefinition], &[ShipClassDefinition]) ->
  Vec<String>` collecting every §13 violation (unknown block, bounds/overlap/keep-clear, class grid +
  capacity caps, one-bridge + ≥1 thruster for ships, bridge connectivity, attach-to/min-attachments,
  clearance edges, steady-state power balance, loadout mount refs).

### A2/A3 — the registry-kind copy (mapped, JSON-native)
Adding `blocks`/`hulls`/`ship_classes` is a faithful copy of the `ships`/`ship_modules` registry
pattern. **Key decision: make the new kinds JSON-package-native** — decode each package's
`definition.json` envelope (`{ordinal, entry, definition}`) straight into the typed structs via serde
and validate with `hull_validation`; do **NOT** build a Lua render/load codec (that JSON→Lua→strict-load
round-trip in `registry_authoring.rs`/`registry_compose.rs` exists only because `ships`/`ship_modules`
predate JSON packages). New kinds have no Lua source-of-truth, so they skip it. This shrinks the work
to a serde decode + validate + serve/persist.

Gateway touch points (mirror `ships`, all `bins/sidereal-gateway/src/`):
- `registry_authoring.rs`: add `RegistryKind::{Block,Hull,ShipClass}` + their `kind()`
  (`"block"`/`"hull"`/`"ship_class"`) and `subdir()` (`"blocks"`/`"hulls"`/`"ship_classes"`) arms;
  add `definition_entity_id`/`publish_entity_definition` id-field arms (`block_id`/`hull_id`/
  `class_id`); add JSON-native `read_*_for_authoring_from_packages()` (decode envelopes → typed
  `AuthoringRegistryEnvelope`, no Lua render).
- `admin_dashboard.rs`: `GET /admin/dashboard/registries/{blocks,hulls,ship-classes}` + `POST
  .../{kind}/definition` + `.../{kind}/index`, mirroring the ship handlers; the hull definition
  write calls `hull_validation::validate_hull` (fetch the block + ship_class registries from packages
  for context, as the ship write fetches modules) and rejects on any error.
- `registry_packages.rs`: add the three kinds to the package-seeding `REGISTRY_KINDS` so the
  `registry_package_index` includes them.

Seed content (A2): author starter packages by hand on disk under
`data/content/{blocks,hulls,ship_classes}/<package_id>/` (`manifest.json` `{schema_version:1,
package_id, kind, primary_blueprint, files:["definition.json"], revision:1}` + `definition.json`
`{ordinal, entry, definition}`), mirroring `data/content/ships/ship__rocinante/`. Starter set:
bridge, reactor, battery, main + maneuver thruster, armor plate, turret mount, fuel tank, cargo bay,
plus a `ship_class` table (small/medium/large/capital caps).

Replication runtime (DEFER): the replication boot composes registries from the package index but is
**fail-soft on unknown kinds** (warn-and-skip, no panic), so block/hull/ship_class rows are safely
ignored until a runtime consumer exists. Add the replication grouping/compose/resources
(`bins/sidereal-replication/src/replication/scripting/registry_packages.rs` + `catalog.rs` +
`resources.rs`) only when WS2 (spawn) lands — out of scope for this authoring slice.
