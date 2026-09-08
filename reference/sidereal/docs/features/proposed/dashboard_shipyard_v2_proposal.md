# Dashboard Shipyard V2 Proposal

Status: Proposed
Lifecycle: proposed
Category: feature
Last updated: 2026-06-14
Owners: dashboard/frontend + gateway + content authoring
Scope: The dashboard authoring surface for the block construction system — a hull-component (block) designer with an in-browser pixel painter and image import/resize for block tile art, plus a hull assembler that places designed blocks on the grid with live rule/budget validation and CoG/power/capacity/thrust preview, all writing through the gateway via decoded typed JSON (never raw Lua).
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- docs/features/active/ship_construction_blocks_contract.md
- docs/features/active/shipyard_ship_authoring_contract.md
- docs/plans/active/unified_content_authoring_pipeline_plan_2026-06-12.md
- docs/decisions/dr-0046_lua_asset_registry_gateway_http_delivery.md
- docs/decisions/dr-0049_dashboard_authoring_control_plane.md
- docs/features/active/asset_delivery_contract.md

Date: 2026-06-14

## 1. Goal & system label

`system.shipyard_authoring.v2` — the dashboard authoring surface for
`system.ship_construction_blocks.v1`. It evolves the texture-overlay-hardpoint editor of
`system.shipyard_ship_authoring.v1` into three linked tools:

1. **Component (block) designer** — define a hull component's footprint, edge/attach/clearance rules,
   linked Bevy components (contributions + behaviours), mass, and cost/capacity.
2. **Pixel painter + image import** — create the block's tile art in-browser, or import/resize an
   existing image to the block footprint, and save it as a content-addressed asset.
3. **Hull assembler** — place designed blocks on a ship/station grid with live validation and
   CoG / power / capacity / thrust preview, and publish the `HullDefinition`.

V1 of the construction system can ship with Lua-authored blocks/hulls; Shipyard V2 is the human
authoring surface and is sequenced after the runtime exists (construction plan WS9). It is proposed
as its own feature because the pixel painter + asset pipeline are a substantial, separable capability.

## 2. Why its own feature

The pixel painter, image import/resize, and the content-addressed asset save flow are a general
in-dashboard art pipeline that overlaps the asset delivery contract (DR-0046) and could later serve
other content (planet decals, UI icons). Keeping it a distinct feature lets the construction contract
stay about gameplay/runtime while this owns the authoring UX, and lets the painter be reused.

## 3. Scope

In scope: the component designer, pixel painter, image import/resize, and hull assembler as dashboard
routes; their gateway read/write APIs (typed JSON in/out); block tile-art asset creation/upload through
the existing asset pipeline; live validation + physics/budget preview rendered client-side from the
typed definition.

Out of scope: the runtime/gameplay (owned by the construction contract); the weapon loadout/fitting
inventory UI (separate, deferred); animated/multi-frame tile art beyond a single tile per facing;
collaborative/multi-user editing; in-game (non-dashboard) building.

## 4. Component (block) designer

- Edit a `BlockDefinition` as a structured form (no raw Lua): `block_id`, `display_name`, `category`,
  `footprint` (grid cell picker with per-`facing` arrangement preview), `placement` (per-edge
  attach/blocked toggles, `attach_to` category multiselect, `min_attachments`, `clearance` edges,
  keep-clear phantom cells), `mass_kg`, `health`, `cost { credits, capacity }`, and the **linked
  components** list (`{ kind, properties }`) chosen from the component-role registry — contributions
  (e.g. `armor`, `cargo_capacity`, `fuel_capacity`, `power_*`, `shield_strength`) and behaviours
  (`engine` with `thrust_face`/`thruster_role`, `mount`/turret with `arc_deg`/`traverse_rate_deg_s`,
  `scanner`).
- The editor renders the live footprint + edge profile so an author sees, e.g., the angled-hull's
  blocked-left edge before saving.
- Reads/writes the decoded typed block JSON via gateway draft→publish under MFA'd scoped tokens
  (DR-0049); the gateway round-trips into the Lua block source. The dashboard never parses Lua
  (unified content authoring pipeline WS1).

## 5. Pixel painter + image import/resize

> **Revised (2026-06-25): reuse `/atelier`, do not build a new painter.** The existing Atelier route
> (`AtelierStudio` + `SpriteEditor`) already provides the pixel editor, arbitrary-size canvas
> creation, and the DR-0046 content-addressed save/payload flow, and Foundry's `AssetPicker` already
> references assets by id. Block tile art is therefore authored in Atelier and referenced from the
> block designer; the only additions are a footprint-aware "new tile" handoff (canvas sized from
> `footprint × tile_resolution`) and an optional footprint grid overlay. See
> `docs/plans/proposed/shipyard_v2_block_authoring_route_plan_2026-06-25.md` Phase E. The original
> in-route-painter description below is superseded by that reuse.

- **Pixel painter:** an in-browser canvas sized to the block footprint × a configurable tile
  resolution (e.g. 32 px/cell); standard pixel tools (pencil, fill, eraser, eyedropper, palette,
  mirror, grid, undo/redo); exports a PNG sized to the footprint.
- **Image import/resize:** import an existing PNG/SVG, crop/resize/letterbox to the footprint
  dimensions, with nearest-neighbour or smooth scaling; preview against the cell grid and the block's
  edge profile.
- **Save pipeline:** the resulting tile is uploaded as a **content-addressed asset** via the existing
  asset routes (create-asset + `POST /admin/assets/by-id/{id}/payload`, DR-0046), yielding an
  immutable `asset_guid` + sha256; the block's `visual.tile_asset_id` references the logical id; live
  `catalog_version` invalidation pushes it to in-world clients. Per the frontend rules, large editor
  bundles (canvas/painter) are lazy/route-split.

## 6. Hull assembler

- Place designed blocks onto a ship/station grid sized by the chosen **ship class** (`grid_cap`).
- **Live validation** mirrors the authoring gate (construction contract §13): overlap, out-of-bounds,
  edge/attach/clearance/connectivity rules, exactly-one-bridge, ≥1 thruster, mount-size, and **budget**
  (`Σ capacity_cost ≤ class.capacity_budget`, power balance) — surfaced inline as the author builds.
- **Preview** the derived physics + budgets the runtime will compute: **center of gravity** marker,
  mass, inertia hint, **power** (generation/draw/storage), **capacity** used/remaining, aggregated
  **stat pools** (armor/cargo/fuel/…), and per-thruster **thrust vectors** + a coarse maneuver-authority
  readout (can it strafe/yaw?). All computed client-side from the typed definition for instant feedback;
  the server remains authoritative on spawn.
- Default **loadout** assignment per mount (which weapon), feeding the blueprint default.
- Publish the `HullDefinition` via gateway draft→publish; `RegistrySource` resync refreshes live
  instances (DR-0049).

## 7. Data flow, security, authority

- All reads return **decoded typed JSON** from the gateway's validated registries; all writes go
  through gateway draft→publish under account session + verified MFA + scoped tokens (DR-0036/0049).
  The dashboard holds no Lua parser (unified content authoring pipeline WS1).
- Asset uploads use the authenticated asset routes; payloads are content-addressed and immutable
  (DR-0004/0006/0046).
- The dashboard is an authoring control plane only; it never spawns or mutates live world authority
  directly — the server validates and applies on publish/spawn.
- Frontend rules apply: semantic theme tokens, shadcn/ui, Zod-validated forms/APIs, route boundaries,
  and bundle-splitting for the painter/canvas.

## 8. Relationship to Shipyard V1

V1 (`system.shipyard_ship_authoring.v1`) authors hardpoint ships (texture overlay + hardpoint table +
module mounting). It remains while the hardpoint ships run side-by-side. At the construction system's
cutover (construction plan WS11), V2 supersedes V1 and the V1 hardpoint editor is retired.

## 9. Open questions

- Tile resolution + per-`facing` art (one tile rotated vs four authored tiles).
- How much of the placement-rule DSL is editable in the designer vs authored in Lua for V1.
- Whether the painter is built in-house (canvas) or wraps an embeddable pixel-art editor library.
- Reusing the painter/asset pipeline for non-block art (icons, decals) — generalize now or later.
- Versioning/forking of block definitions and their art (immutable asset history vs editable drafts).

## 10. References

- `docs/features/active/ship_construction_blocks_contract.md`
- `docs/features/active/shipyard_ship_authoring_contract.md`
- `docs/plans/active/unified_content_authoring_pipeline_plan_2026-06-12.md`
- `docs/decisions/dr-0046_lua_asset_registry_gateway_http_delivery.md`
- `docs/decisions/dr-0049_dashboard_authoring_control_plane.md`
- `docs/features/active/asset_delivery_contract.md`
- `.claude/skills/sidereal-frontend/SKILL.md`
