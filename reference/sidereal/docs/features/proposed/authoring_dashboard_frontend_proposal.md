# Authoring Dashboard Frontend (/foundry + /firmament)

Status: Proposed
Lifecycle: proposed
Category: feature
Last updated: 2026-06-17
Owners: dashboard + content authoring + gateway + engine architecture
Scope: The dashboard frontend spec — routes, layout, and shared component architecture — for content authoring: /foundry (entity fabrication / blueprint catalogue + composer) and /firmament (universe-baseline world design map), reusing the /game-world and /database map and inspector components, with a hard baseline-authoring vs. live-world mode distinction.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- docs/features/proposed/content_authoring_composition_proposal.md
- docs/features/proposed/entity_authoring_system_proposal.md
- docs/features/proposed/universe_baseline_seeding_proposal.md
- docs/plans/proposed/content_authoring_composition_plan_2026-06-17.md
- docs/plans/proposed/authoring_dashboard_frontend_plan_2026-06-17.md
- docs/decisions/dr-0053_disk_authored_content_packages_durable_source_of_truth.md
- docs/decisions/dr-0054_universe_baseline_vs_evolved_world_separation.md
- docs/features/active/shipyard_ship_authoring_contract.md
- docs/features/active/genesis_planet_registry_contract.md
- .claude/skills/sidereal-frontend/SKILL.md

## 0. Status & relationship to existing work

Proposed direction. This is the concrete dashboard-frontend spec for the authoring surfaces described abstractly elsewhere:

- **Composition proposal Pillar C** — "The Composer" (plan WS3) and "World/System Map authoring" (plan WS5). This names them `/foundry` and `/firmament` and specifies their layout and shared components.
- **Entity authoring proposal** — the `entity.json`/blueprint schema, components, lifecycle hooks (§5), and the override model (§3.6) that `/foundry` and `/firmament`'s right panel edit.
- **Universe baseline proposal §8** — the two-mode (baseline/live) frontend and the Seed Manager; this folds the Seed Manager into `/firmament` (plan WS7).

Route names chosen 2026-06-17: **`/foundry`** (entity fabrication — "the workshop where forms are cast") and **`/firmament`** (universe design — "the heavens you populate," extending the `/genesis` creation theme).

No new authority/data model: all reads/writes go through the existing gateway authoring control plane (DR-0049) as decoded JSON — the dashboard never parses Lua (the WS1 guard holds).

## 1. Route map

| Route | Purpose | Source of truth | R/W |
|---|---|---|---|
| **`/foundry`** *(new)* | Entity fabrication — author blueprint catalogue (components, values, sprite/shader, lifecycle hooks) | disk baseline (entity packages, DR-0053) | author |
| **`/firmament`** *(new)* | Universe design — place blueprints, draw systems/generators, assign backdrops; Seed Manager | disk baseline (universe package, DR-0054) | author |
| `/genesis` *(exists)* | Planet editor | disk (planet registry) | author → becomes a `/foundry` preset |
| `/shipyard` *(exists)* | Ship + module editor | disk (ship registry) | author → becomes a `/foundry` preset |
| `/game-world` *(exists)* | The **live evolved** world (BRP/graph) | live runtime / graph DB | inspect (read-mostly) |
| `/database` *(exists)* | Persisted DB snapshot | graph DB | inspect (read) |

`/foundry` and `/firmament` author the **baseline** (the design); `/game-world` and `/database` view the **evolved** world. That split (DR-0054) is the organizing principle of the whole IA (§9).

## 2. The mode distinction must be unmistakable

The single biggest UX risk is blurring "editing the design" with "editing the live world." Enforce it visually and structurally:

- **Baseline (authoring) routes** (`/foundry`, `/firmament`, `/genesis`, `/shipyard`) carry a persistent mode affordance (banner/accent via a semantic theme token) reading e.g. "Authoring — Universe Baseline `main` (disk)". Edits here write the disk baseline through the gateway; they do **not** touch the live world.
- **Live/inspect routes** (`/game-world`, `/database`) carry a distinct affordance ("Live World" / "Database Snapshot") and are read-mostly.
- The same entity can appear in both with different meaning: in `/firmament` it is an authored *placement*; in `/game-world` it is a *runtime instance* that may have drifted. The shared inspector (§6) shows which it is.

## 3. Shared component architecture

The point of these routes is reuse, per the request ("share a lot of components with the game-world and database route"). The existing `ExplorerWorkspace` (`scope="gameWorld" | "database"`) already factors the map + tree + inspector; `/firmament` adds an authoring scope, and `/foundry` reuses the inspector + schema-form pieces.

| Shared component | Today | `/foundry` | `/firmament` |
|---|---|---|---|
| **MapCanvasView** — pan/zoom f64 grid, sector/cell HUD, selection, overlays | `/game-world`, `/database` | — | center canvas + **authoring layer** (drag-place, right-click-add, region draw) |
| **Inspector shell + subpanels** — the right panel: `InspectorShell` + mode subpanels (§6) | live-inspect | blueprint-edit | placement-edit |
| **ComponentSchemaForm** — renders fields from `editor_schema` (`GeneratedComponentRegistryEntry`) | inspector fields | component values | override values |
| **HooksEventsPanel** — entity-lifecycle + component hooks, override `super` | — *(new)* | yes | yes (override hooks) |
| **EntityPalette / blueprint search** — grouped, searchable catalogue + right-click-add | — *(new)* | left catalogue | add-entity popover |
| **AssetPicker / ShaderParamEditor** | shader-workshop, shipyard | visual + shader | system backdrop |

New components are `HooksEventsPanel`, `EntityPalette`, the `MapCanvasView` authoring layer, and the `SeedManagerPanel`. Everything else is an extension of what `/game-world`, `/shipyard`, `/genesis`, and `/shader-workshop` already ship. Follow the route-boundary + bundle-splitting rules (sidereal-frontend skill): each route is a code-split chunk; shared pieces live in a common feature module.

## 4. `/foundry` — entity fabrication

Three-pane layout (catalogue · composer · events):

```
┌── Blueprint Catalogue ──┬──────── Composer ─────────┬──── Hooks & Events ────┐
│ search… [+ New]         │ Identity                  │ Entity lifecycle        │
│ ▸ stations              │  display_name / tags /    │  on_create  [+ script]  │
│   station.derelict •    │  labels                   │  on_spawn               │
│ ▸ containers            │ Components       [+ add]  │  on_destroy             │
│   cargo.container ✓     │  size_m      {fields}     │ Component hooks          │
│ ▸ ships                 │  health_pool {fields}     │  destructible:           │
│   ship.corvette ✓       │  destructible{fields}     │   on_destroyed [+ script]│
│ …                       │ Visual                    │  health_pool:            │
│                         │  sprite [pick]            │   on_damage             │
│ (✓ published • draft)   │  shader + params [edit]   │ (pending-runtime ⓘ)      │
└─────────────────────────┴───────────────────────────┴─────────────────────────┘
```

- **Left — catalogue:** all entity blueprints, grouped (by tag/kind) and searchable, with draft/published status; "New" creates a blueprint package. Reuses the library pattern from Shipyard/Genesis.
- **Center — composer:** identity (`display_name`, `tags`, `labels`); a **component palette** (add any registered component); per-component field forms rendered from `editor_schema` (already powers Shipyard/Genesis forms); visual (sprite `visual_asset_id` + `map_icon` + shader/param set, inline via the Shader Workshop editor). Each component shows the Rust default it brings so "add a script" reads as an override, not a requirement.
- **Right — HooksEventsPanel:** the universal **entity lifecycle** (`on_create`/`on_spawn`/`on_despawn`/`on_destroy`/`on_tick`) plus **component-scoped hooks** that appear only when their component is present (entity authoring §5). Attaching a hook opens a small scoped Lua editor with schema/LuaCATS autocomplete; not-yet-emitted events are marked **pending-runtime**; writes go through typed intents, not accessors (entity authoring §5.1).
- **Lifecycle:** draft → validate → publish; publish writes the entity package to disk via the gateway (DR-0053). Validation errors surface inline (component payload round-trip, dangling asset, hook bound to absent component).
- **Genesis/Shipyard fold in here** as **component editor extensions**: the planet procedural preview mounts when the planet-shader component is present; the hardpoint texture overlay mounts when ship/hardpoint components are present. They stop being separate apps once parity is shown (plan WS3).

## 5. `/firmament` — universe / world design

The shared `MapCanvasView` in authoring mode, plus palette, inspector, and Seed Manager:

```
┌─ Palette ─┬──────────────── Map Canvas (shared) ───────────────┬─ Inspector ─┐
│ search…   │   · Arcturus ◯ (system, r=100km)                   │ placement   │
│ blueprints│        ☀ star   🪐 planet   ▦ belt(gen)            │ blueprint:  │
│ generators│   right-click → [ Add entity… ▾ search ]           │ cargo.cont. │
│ systems   │   drag a blueprint ⤵ to place                      │ overrides ▸ │
│           │   · Maw ◯ (nebula backdrop)                        │ events ▸    │
│           │   [region-scoped lazy load]                        │ provenance  │
├───────────┴────────────────────────────────────────────────────┴─────────────┤
│ Seed Manager:  baseline main · disk r7/ab12 · applied r6/9f3c · DRIFTED        │
│ [ Dry Run ] [ Apply to Empty DB ] [ Reset Runtime World to Baseline ] [ Recon ]│
└────────────────────────────────────────────────────────────────────────────────┘
```

- **Placement UX:** drag a blueprint from the palette onto the canvas → sets `world_position` and mints a `placement_id`; **or** right-click empty space → "Add entity…" → searchable blueprint list → place at the cursor. Click a placement → the right inspector opens in **placement-edit** mode.
- **Systems / regions:** draw a system center + `SolarSystemRadius`; assign `SolarSystemVisuals` (nebula/backdrop param set, previewed inline via Shader Workshop); drop star(s)/planets/stations/belts as members referencing the system.
- **Generators:** place a generator region (bounds), set `seed`/density/blueprints; the canvas previews the **deterministic** scatter (expand at `seed`) so the author tunes parameters before committing. Generated members are not individual placements — they are a generator record (DR-0054).
- **Scale:** region-scoped lazy loading so a huge universe never loads at once.
- **Seed Manager panel (plan WS7):** selected baseline; disk revision/hash vs. DB applied revision/hash; status `not applied | current | drifted | conflicts`; actions **Dry Run**, **Apply To Empty DB**, **Reset Runtime World To Baseline** (the dev workhorse), **Reconcile Baseline Into Live World** (production; shows conflicts). Drift *status* ships before the per-placement **seed-vs-live diff overlay** on the map (the overlay is the highest-value/highest-effort piece; "Reconcile" must not imply it is done).
- **Writes** the universe baseline package to disk via the gateway (DR-0054); never the live world.

## 6. The shared inspector (right panel) — a shell + mode subpanels, **not** a giant conditional component

The right panel is the most-reused surface and the request's "click the entity → right panel shows events/settings." It serves three modes:

| Mode | Used by | Behavior |
|---|---|---|
| **live-inspect** | `/game-world`, `/database` | read-mostly BRP/graph values; shows `authored_baseline_source` provenance + drift (server-side, via admin API) |
| **blueprint-edit** | `/foundry` | edit a blueprint's components, values, visual/shader, and hooks |
| **placement-edit** | `/firmament` | edit a placement's **overrides** (component-value overrides, added components, hook overrides with `super`) over its referenced blueprint; base vs. override shown distinctly |

**Composition rule (avoid the universal-component trap).** Do **not** build one `EntityInspectorPanel` stuffed with mode conditionals. Instead:
- a thin **`InspectorShell`** owns chrome, section layout, selection, and save/dirty state;
- **shared leaf pieces** are reused by all modes: `ComponentSchemaForm` (fields from `editor_schema`), `VisualShaderControls`, `HooksEventsPanel`;
- each mode supplies its own **subpanel** composed from those leaves — `LiveInspectSubpanel`, `BlueprintEditSubpanel`, `PlacementOverrideSubpanel` — so live-inspect, blueprint-edit, and placement-overrides evolve independently and never tangle into a conditional mega-component.

Sections (a mode's subpanel shows the relevant ones): **Identity** · **Components** (`ComponentSchemaForm`) · **Visual/Shader** · **Events/Hooks** (`HooksEventsPanel`) · **Overrides** (placement only — what diverges from the blueprint, and `super` usage) · **Provenance/Drift** (live only). `PlacementOverrideSubpanel` makes the override layering visible: a field shows the blueprint default with the override on top, and an override hook shows whether it calls `super`.

## 7. Data flow & API

All decoded JSON; the dashboard never parses Lua (WS1 guard); validation is server/CI-side.

| Surface | Endpoints (illustrative) | Source |
|---|---|---|
| Entity blueprints (`/foundry`) | `GET/POST /admin/dashboard/entities[...]/{draft,publish}` | gateway → disk entity packages |
| Universe baseline (`/firmament`) | `GET/POST /admin/dashboard/universes/{baseline_id}[...]` (placements, generators, systems) | gateway → disk universe package |
| Component schema | `GET /admin/dashboard/component-registry` (`editor_schema`, hooks map) | generated registry + `script_api_schema.json` |
| Asset library | existing asset endpoints (`/admin/assets/...`) | content-addressed store |
| Seed Manager | `GET .../seed/status`, `POST .../seed/{dry-run,apply,reset,reconcile}` | gateway → apply pipeline |
| Live world (`/game-world`) | existing `/api/graph`, BRP, `/api/render-layers` | runtime / graph DB |

Baseline routes read/write the gateway authoring catalog (disk SoT); live routes read BRP/graph. Drafts are SQL-ephemeral; publish writes disk (DR-0053 §6.2).

## 8. Frontend conventions (sidereal-frontend skill)

Binding for the implementing code:
- **Semantic theme tokens only** — no raw hex/RGB; the baseline/live mode accent is a token.
- **shadcn/ui** components; forms auto-generated from `editor_schema` with `control` hints (slider/input/toggle/select/color), as Shader Workshop already does.
- **Zod** validation at every API boundary; types mirror the gateway's decoded JSON.
- **Route-based code splitting / bundle config** — `/foundry` and `/firmament` are separate chunks; the shared map/inspector live in a common feature module to avoid duplication.
- **Security** — scoped tokens only, no secrets client-side; provenance/admin data via admin APIs; respect redaction.

## 9. Information architecture / navigation

Two clusters in the dashboard nav, matching the mode split:

- **Create (baseline):** `/firmament` (the universe), `/foundry` (entities), `/genesis`, `/shipyard`, `/shader-workshop`, `/sound-studio`, `/script-editor`. Over time `/genesis` and `/shipyard` become `/foundry` presets.
- **Inspect (live):** `/game-world`, `/database`.

The nav makes "you are designing" vs. "you are inspecting the running game" obvious at the top level, reinforcing §2.

## 10. Sequencing

Start with **extraction**, so the new routes build on shared pieces instead of forking them:

0. **Extract the shared pieces first** — (a) lift the **map canvas** out of `ExplorerWorkspace`/`GridCanvas` into a standalone `MapCanvasView` (pan/zoom, sector/cell HUD, selection, overlay slots) that `/game-world`, `/database`, and `/firmament` all consume; (b) extract the **inspector shell + leaf pieces** (`InspectorShell`, `ComponentSchemaForm`, `VisualShaderControls`, `HooksEventsPanel`) with mode-specific subpanels (§6). No behavior change to `/game-world`/`/database` — this is a refactor that de-risks everything after it.
1. **`/foundry`** (composition plan WS3) — the entity composer, on top of the entity-package backbone (WS2) and the extracted inspector. Ship first; it has no map dependency.
2. **`/firmament` placement authoring** (WS5) — the map authoring layer + `PlacementOverrideSubpanel`, on the extracted `MapCanvasView`; depends on `/foundry` blueprints + galaxy components.
3. **Seed Manager + drift status** (WS7 phase 5) in `/firmament`; **diff overlay + reconcile** (WS7 phase 6) last.
4. **Fold `/genesis` + `/shipyard` into `/foundry`** as presets once the generic composer reaches parity (WS3/WS4).

## 11. Open questions / non-goals

Open:
- **`/firmament` route vs. a mode toggle on `/game-world`** — decided: a **separate route** that *reuses* the `MapCanvasView` component, so authoring and live-inspect stay distinct surfaces while sharing the canvas.
- **How much of Genesis/Shipyard generalizes** into the composer vs. stays a component-editor extension (carried from composition proposal §8.3).
- **Multi-user editing** — out of scope for V1; rely on per-package optimistic concurrency/locking (DR-0053 §6.4); show "who has a draft."
- **In-context live preview** of a baseline edit against the running world — out of scope V1.

Non-goals:
- Not a live-world editor — editing the running game stays in `/game-world` (BRP/graph), distinct from baseline authoring.
- No new auth/data model; reuse DR-0049 control plane and DR-0053/DR-0054 storage.
- The dashboard never parses Lua; symbol-level lint is server/CI-side.

## 12. References

- `docs/features/proposed/content_authoring_composition_proposal.md` — Pillar C (Composer = WS3, world map = WS5).
- `docs/features/proposed/entity_authoring_system_proposal.md` — blueprint schema, hooks (§5), overrides (§3.6), intents (§5.1).
- `docs/features/proposed/universe_baseline_seeding_proposal.md` — baseline package, Seed Manager, two-mode frontend (§8).
- `docs/plans/proposed/content_authoring_composition_plan_2026-06-17.md` — WS3 (`/foundry`), WS5 (`/firmament` map), WS7 (Seed Manager).
- `docs/decisions/dr-0053_...` / `dr-0054_...` — disk-as-truth; baseline vs. evolved world.
- `docs/features/active/shipyard_ship_authoring_contract.md`, `genesis_planet_registry_contract.md`, `shader_editor_dashboard_contract.md` — the editors `/foundry` generalizes and reuses.
- `.claude/skills/sidereal-frontend/SKILL.md` — theme tokens, shadcn/ui, Zod, route boundaries, bundle-splitting, security.
- Dashboard code: `dashboard/src/features/explorer/ExplorerWorkspace.tsx` (map/tree/inspector, `scope`), `dashboard/src/features/{shipyard,genesis,shaders,audio-studio,script-editor}/*`, `dashboard/src/routes/_dashboard.*.tsx`, `/api/graph` + `/api/render-layers`.
