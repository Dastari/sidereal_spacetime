# Live Entity Instance Editing from Registry Definitions

Status: Proposed
Lifecycle: proposed
Category: plan
Last updated: 2026-06-04
Owners: implementation owners
Scope: Live Entity Instance Editing from Registry Definitions.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

## 0. Status Notes

2026-04-29:

- This plan records the target direction for adding live **instance editing** to dashboard tools that currently edit Lua registry **definitions**.
- Current `/genesis` and `/shipyard` behavior edits reusable Lua catalog definitions and script-catalog drafts. Those definitions control newly spawned or refreshed content, but they do not by themselves represent one live in-game entity instance.
- The requested target behavior is: from `/game-world`, right-click a live entity and choose `Edit`; the dashboard resolves what kind of entity it is, routes to the correct editor, loads the live entity payload plus registry/default schema context, and applies live edits through protected gateway APIs.
- This plan intentionally keeps the existing registry-definition authoring path. It adds an instance editing path beside it.
- Native impact: live edits must update authoritative runtime state through shard/gateway-controlled mutation paths, not client-side or dashboard-local authority.
- WASM impact: no direct browser client transport change is intended. Browser impact is dashboard-only routing/UI/API work.
- Documentation impact for implementation: once any phase lands, update the relevant feature contract sections that currently list live mutation as out of scope, especially `docs/features/active/genesis_planet_registry_contract.md` section 7 and `docs/features/active/shipyard_ship_authoring_contract.md` section 7.

2026-04-29 Phase 1 implementation update:

- Implemented: `dashboard:entity:read` is now granted to first-admin bootstrap accounts and enforced by a gateway read-only entity edit-context endpoint.
- Implemented: the gateway exposes `GET /admin/dashboard/entities/{entity_guid}/edit-context`, backed by graph entity/component/relationship snapshots and conservative classifier evidence. Unsupported entities return an `unsupported` editor target rather than failing.
- Implemented: the dashboard proxies `GET /api/entities/$entityGuid/edit-context`, validates UUID route params, adds shared TypeScript DTOs, and resolves Game World context-menu `Edit...` actions from stable entity GUIDs only.
- Implemented: placeholder read-only routes exist at `/genesis/entities/$entityGuid` and `/shipyard/entities/$entityGuid`; they show the resolved context and do not expose live mutation controls.
- Open: Genesis/Shipyard instance payload views, registry-definition diffing, and all live patch endpoints remain future phases.

## 1. Core Concept

Sidereal needs two different editing modes that share schema and registry metadata but write to different authoritative stores.

Definition mode:

```text
Lua registry definition -> future spawns / registry refresh / draft-publish workflow
```

Instance mode:

```text
live entity_guid -> current graph/shard component state -> gateway-authorized live mutation
```

Examples:

- `planet.helion` in `data/scripts/planets/helion.lua` is a reusable planet definition.
- Entity `0012ebad-0000-0000-0000-000000000012` is a concrete Helion instance in the world.
- `ship.corvette` in `data/scripts/ships/corvette.lua` is a reusable ship definition.
- A spawned player corvette with its own root `EntityGuid`, hardpoints, mounted modules, mass, damage, inventory, owner, position, and runtime state is a concrete instance.

The dashboard should make this distinction visible:

- `/genesis` edits planet/celestial definitions.
- `/genesis/entities/$entityGuid` edits a live planet/celestial entity instance.
- `/shipyard` edits ship/module definitions.
- `/shipyard/entities/$entityGuid` edits a live ship entity instance.
- `/script-editor` remains generic Lua source editing.
- `/game-world` remains the live explorer and entry point for entity-context actions.

## 2. Non-Negotiable Constraints

Follow the repository contract in `AGENTS.md`:

1. Dashboard must not directly read/write disk, Postgres, AGE, or BRP for privileged operations.
2. Browser code calls same-origin dashboard API routes only.
3. Dashboard server routes proxy through protected gateway APIs using the gateway account session.
4. Gateway admin endpoints require:
   - gateway-issued access token,
   - admin/dev role,
   - verified MFA in session context,
   - `dashboard:access`,
   - route-specific scope.
5. Live instance edits must not bypass authoritative simulation ownership.
6. Authoritative world coordinates remain f64 in Rust and JSON numbers at dashboard boundaries. Do not round, stringify, integer-coerce, or f32-coerce positions/velocities at API/schema boundaries.
7. Persisted gameplay changes must use canonical graph/component records and existing component registry/generation paths.
8. Do not introduce new dashboard-local auth, dashboard-local database writes, or filesystem fallback.
9. Route params, search params, request bodies, and mutation payloads must be validated with Zod or Rust equivalents at boundaries.
10. Major dashboard tool routes must stay lazily split.

## 3. Current State

### 3.1 Registry Definition Editors

Genesis:

- Route: `dashboard/src/routes/_dashboard.genesis.tsx`
- Lazy entry: `dashboard/src/routes-lazy/genesis-route.tsx`
- Page: `dashboard/src/features/genesis/GenesisPage.tsx`
- Types: `dashboard/src/features/genesis/types.ts`
- Dashboard APIs:
  - `GET /api/genesis/planets`
  - `POST /api/genesis/planets`
  - `POST /api/genesis/planets/$planetId/draft`
  - `POST /api/genesis/planets/$planetId/publish`
  - `DELETE /api/genesis/planets/$planetId/draft`
- Server helpers: `dashboard/src/lib/genesis.server.ts`
- Validation: `dashboard/src/lib/schemas/dashboard.ts`
- Lua files:
  - `data/scripts/planets/registry.lua`
  - `data/scripts/planets/*.lua`
  - `data/scripts/bundles/starter/planet_body.lua`

Shipyard:

- Route: `dashboard/src/routes/_dashboard.shipyard.tsx`
- Lazy entry: `dashboard/src/routes-lazy/shipyard-route.tsx`
- Page: `dashboard/src/features/shipyard/ShipyardPage.tsx`
- Types: `dashboard/src/features/shipyard/types.ts`
- Dashboard APIs:
  - `GET /api/shipyard/catalog`
  - `GET /api/shipyard/assets/$assetId`
  - `POST /api/shipyard/ships/$shipId/draft`
  - `POST /api/shipyard/ships/$shipId/publish`
  - `DELETE /api/shipyard/ships/$shipId/draft`
  - `POST /api/shipyard/modules/$moduleId/draft`
  - `POST /api/shipyard/modules/$moduleId/publish`
  - `DELETE /api/shipyard/modules/$moduleId/draft`
- Server helpers: `dashboard/src/lib/shipyard.server.ts`
- Validation: `dashboard/src/lib/schemas/dashboard.ts`
- Lua files:
  - `data/scripts/ships/registry.lua`
  - `data/scripts/ships/*.lua`
  - `data/scripts/ship_modules/registry.lua`
  - `data/scripts/ship_modules/*.lua`
  - `data/scripts/bundles/ship/body.lua`

### 3.2 Game World Explorer

Relevant files:

- `dashboard/src/routes/_dashboard.game-world.tsx`
- `dashboard/src/routes/_dashboard.game-world.$entityGuid.tsx`
- `dashboard/src/routes-lazy/game-world-route.tsx`
- `dashboard/src/features/explorer/ExplorerWorkspace.tsx`
- `dashboard/src/features/explorer/explorer-utils.ts`
- `dashboard/src/components/sidebar/EntityTree.tsx`
- `dashboard/src/components/grid/GridCanvas.tsx`
- `dashboard/src/components/sidebar/DetailPanel.tsx`
- `dashboard/src/components/brp-editors/*`

Current behavior:

- `GameWorldToolPage` supports selection by entity GUID with `/game-world/$entityGuid`.
- `ExplorerWorkspace` builds BRP/database snapshots and has a custom right-click context menu.
- Context menu currently supports actions like assign owner, repair/refuel, move, spawn, and delete.
- BRP and graph operations flow through dashboard API routes backed by gateway:
  - `dashboard/src/routes/api.brp.tsx`
  - `dashboard/src/routes/api.graph.tsx`
  - `dashboard/src/server/gateway-proxy.ts`
- `DetailPanel` already has component-level editors through `dashboard/src/components/brp-editors/*`, but those are local component editors inside the explorer, not feature-specific Genesis/Shipyard instance editors.

### 3.3 Gateway Admin Surface

Relevant files:

- `bins/sidereal-gateway/src/admin_dashboard.rs`
- `bins/sidereal-gateway/src/api.rs`
- `bins/sidereal-gateway/src/auth/service.rs`
- `dashboard/src/server/gateway-proxy.ts`

Current protected gateway admin routes include:

```text
GET    /admin/dashboard/database
POST   /admin/dashboard/accounts/{account_id}/password-reset
POST   /admin/dashboard/characters/{player_entity_id}/display-name
GET    /admin/dashboard/graph
POST   /admin/dashboard/graph
DELETE /admin/dashboard/entities/{entity_id}
GET    /admin/brp
POST   /admin/brp
GET    /admin/scripts
GET    /admin/scripts/detail/{*script_path}
POST   /admin/scripts/draft/{*script_path}
DELETE /admin/scripts/draft/{*script_path}
POST   /admin/scripts/publish/{*script_path}
GET    /admin/assets/catalog
GET    /admin/assets/by-id/{asset_id}
GET    /admin/assets/by-id/{asset_id}/payload
POST   /admin/assets/by-id/{asset_id}/payload
```

Missing for this plan:

- A gateway endpoint that resolves an entity into an editor/edit-context.
- Gateway-owned instance patch endpoints shaped around entity GUIDs and schema/registry metadata.
- Dashboard same-origin API routes for those endpoints.
- Genesis/Shipyard entity routes and UI modes.

## 4. Target User Flow

1. Operator opens `/game-world`.
2. Operator right-clicks an entity in the tree or map.
3. Context menu shows `Edit...` if the gateway can resolve an editor target, or a disabled `Edit unavailable` item with a reason if not.
4. Selecting `Edit...` routes to:
   - `/genesis/entities/$entityGuid` for planet/celestial instances,
   - `/shipyard/entities/$entityGuid` for ship root instances,
   - future routes for asteroid fields, environment lighting, etc.
5. The target editor loads:
   - live entity identity and component payloads,
   - registry/default definition that likely produced the entity,
   - editable schema metadata,
   - mutation capabilities and warnings,
   - child entity context if relevant, for example ship hardpoints/modules.
6. User edits allowed fields.
7. Save applies a live instance patch through a protected gateway API.
8. Gateway validates the patch, applies it to the authoritative persistence/runtime path, and returns refreshed entity context.
9. Editor shows live state and, when possible, a diff against the registry definition/defaults.

## 5. Data Model and DTOs

Add shared DTOs in Rust gateway and matching TypeScript types under dashboard feature code. Keep names stable and explicit.

### 5.1 Entity Edit Context

Proposed gateway route:

```text
GET /admin/dashboard/entities/{entity_guid}/edit-context
Scope: dashboard:entity:read
```

Dashboard route:

```text
GET /api/entities/$entityGuid/edit-context
```

Response shape:

```ts
type EntityEditContext = {
  entityGuid: string
  numericRuntimeEntityId?: number | null
  displayName?: string | null
  labels: Array<string>
  tags: Array<string>
  editor: EntityEditorTarget
  classification: EntityClassification
  registryLink?: RegistryDefinitionLink | null
  components: Array<EntityComponentSnapshot>
  relationships: Array<EntityRelationshipSnapshot>
  children: Array<EntityChildSummary>
  capabilities: EntityEditCapabilities
  warnings: Array<EntityEditWarning>
}

type EntityEditorTarget =
  | 'genesis_planet_instance'
  | 'shipyard_ship_instance'
  | 'scripted_entity_instance'
  | 'unsupported'

type EntityClassification = {
  kind:
    | 'planet'
    | 'star'
    | 'black_hole'
    | 'ship'
    | 'ship_hardpoint'
    | 'ship_module'
    | 'asteroid_field'
    | 'environment_lighting'
    | 'player'
    | 'unknown'
  confidence: 'exact' | 'inferred' | 'unknown'
  evidence: Array<string>
}

type RegistryDefinitionLink = {
  family:
    | 'planet_registry'
    | 'ship_registry'
    | 'ship_module_registry'
    | 'bundle_registry'
    | 'unknown'
  definitionId: string
  scriptPath?: string | null
  registryScriptPath?: string | null
  bundleId?: string | null
  source: 'component' | 'spawn_entity_id' | 'bundle_id' | 'labels' | 'inferred'
}

type EntityComponentSnapshot = {
  componentKind: string
  typePath?: string | null
  componentId?: string | null
  value: unknown
  editable: boolean
  schema?: unknown
}

type EntityRelationshipSnapshot = {
  relationshipKind: 'parent' | 'mounted_on' | 'graph_edge' | string
  fromEntityGuid: string
  toEntityGuid: string
  properties?: Record<string, unknown>
}

type EntityChildSummary = {
  entityGuid: string
  displayName?: string | null
  labels: Array<string>
  relationshipKind?: string | null
}

type EntityEditCapabilities = {
  canEditLiveInstance: boolean
  canEditDefinition: boolean
  canPatchComponents: boolean
  canPatchHierarchy: boolean
  canPatchRegistryLink: boolean
  reason?: string | null
}

type EntityEditWarning = {
  code: string
  message: string
}
```

### 5.2 Genesis Instance Context

Proposed gateway route:

```text
GET /admin/dashboard/entities/{entity_guid}/genesis-context
Scope: dashboard:entity:read
```

Dashboard route:

```text
GET /api/genesis/entities/$entityGuid
```

Response shape:

```ts
type GenesisPlanetInstanceContext = {
  editContext: EntityEditContext
  registryDefinition?: GenesisPlanetDefinition | null
  liveDefinition: GenesisPlanetInstanceDefinition
  diffFromRegistry: Array<EntityFieldDiff>
}

type GenesisPlanetInstanceDefinition = {
  entity_guid: string
  display_name: string
  entity_labels: Array<string>
  tags: Array<string>
  size_m: number
  world_position: [number, number]
  world_rotation: number
  map_icon_asset_id: string
  planet_visual_shader_asset_id: string
  shader_settings: GenesisPlanetShaderSettings
}

type EntityFieldDiff = {
  path: string
  registryValue: unknown
  liveValue: unknown
}
```

Patch route:

```text
PATCH /admin/dashboard/entities/{entity_guid}/genesis-instance
Scope: dashboard:entity:write
```

Dashboard route:

```text
PATCH /api/genesis/entities/$entityGuid
```

Patch request should initially accept the full editable live-definition payload and later support smaller JSON-patch style updates if needed:

```ts
type SaveGenesisPlanetInstanceRequest = {
  definition: GenesisPlanetInstanceDefinition
  expectedRevision?: string | null
}
```

### 5.3 Shipyard Instance Context

Proposed gateway route:

```text
GET /admin/dashboard/entities/{entity_guid}/shipyard-context
Scope: dashboard:entity:read
```

Dashboard route:

```text
GET /api/shipyard/entities/$entityGuid
```

Response shape:

```ts
type ShipyardShipInstanceContext = {
  editContext: EntityEditContext
  registryDefinition?: ShipyardShipDefinition | null
  liveDefinition: ShipyardShipInstanceDefinition
  modules: Array<ShipyardModuleInstanceContext>
  diffFromRegistry: Array<EntityFieldDiff>
}

type ShipyardShipInstanceDefinition = {
  entity_guid: string
  ship_id?: string | null
  bundle_id?: string | null
  display_name: string
  entity_labels: Array<string>
  tags: Array<string>
  visual: ShipyardVisualDefinition
  dimensions: ShipyardDimensionsDefinition
  root: ShipyardRootDefinition
  hardpoints: Array<ShipyardHardpointInstanceDefinition>
  mounted_modules: Array<ShipyardMountedModuleInstanceDefinition>
}

type ShipyardHardpointInstanceDefinition = ShipyardHardpointDefinition & {
  entity_guid: string
}

type ShipyardMountedModuleInstanceDefinition = ShipyardMountedModuleDefinition & {
  entity_guid: string
  parent_hardpoint_entity_guid: string
}

type ShipyardModuleInstanceContext = {
  entity_guid: string
  module_id?: string | null
  registryDefinition?: ShipyardModuleDefinition | null
  componentPayloads: Array<ShipyardModuleComponentDefinition>
}
```

Patch route:

```text
PATCH /admin/dashboard/entities/{entity_guid}/shipyard-instance
Scope: dashboard:entity:write
```

Dashboard route:

```text
PATCH /api/shipyard/entities/$entityGuid
```

Initial patch request:

```ts
type SaveShipyardShipInstanceRequest = {
  definition: ShipyardShipInstanceDefinition
  expectedRevision?: string | null
}
```

## 6. Entity Classification Strategy

Gateway should classify entities server-side. Frontend can optimistically show a loading `Edit...` menu item, but it should not make final editor decisions from labels alone.

Resolution priority:

1. **Explicit registry link component** if one exists or is added.
2. Existing component evidence.
3. Known spawn IDs from registries.
4. Entity labels.
5. Bundle/spawn metadata.
6. Unsupported fallback.

### 6.1 Recommended New Component

Add a persistable gameplay component in `crates/sidereal-game/src/components/`:

```rust
#[sidereal_component(
    kind = "registry_definition_ref",
    persist = true,
    replicate = false,
    visibility = ["owner", "admin"]
)]
pub struct RegistryDefinitionRef {
    pub registry_family: String,
    pub definition_id: String,
    pub script_path: Option<String>,
    pub registry_script_path: Option<String>,
    pub bundle_id: Option<String>,
}
```

Use exact field names only after checking current component macro conventions. If implementation adds this component, update:

- `crates/sidereal-game/src/components/mod.rs`
- generated component registry path
- persistence/hydration mapping
- Lua bundle emission where definitions are used
- tests for graph persistence roundtrip

Lua bundles should emit this component for new content:

- `planet.body` emits `registry_definition_ref` with `planet_registry`, `planet.<id>`, and `planets/<slug>.lua`.
- `ship.body` emits `registry_definition_ref` with `ship_registry`, `ship.<id>`, `ships/<slug>.lua`, and `bundle_id`.
- mounted modules may emit `registry_definition_ref` with `ship_module_registry`, `module.<id>`, and `ship_modules/<slug>.lua`.

Do not block Phase 1 on this component if faster inference is useful, but treat the component as the long-term canonical link.

### 6.2 Interim Planet Detection

A planet/celestial instance likely has:

- `planet_body_shader_settings`,
- `sprite_shader_asset_id`,
- `runtime_world_visual_stack`,
- `world_position`,
- `world_rotation`,
- `size_m`,
- labels like `Planet`, `CelestialBody`, `Star`, or `BlackHole`.

Registry linking can be inferred by matching:

- `entity_guid == planet.spawn.entity_id`, when the registry definition has a fixed spawn entity ID,
- `planet_body_shader_settings` and display name similarity as weaker evidence.

### 6.3 Interim Ship Detection

A ship root likely has:

- labels like `Ship`,
- ship root gameplay components from `ShipyardRootDefinition`, for example mass, max velocity, flight tuning, health/destructible, collision, visual/map icon,
- hardpoint child entities via `parent_guid`,
- mounted module children via `mounted_on`.

Registry linking can be inferred by:

- `registry_definition_ref` if present,
- bundle ID if stored in a component after adding such metadata,
- matching visual asset, dimensions, hardpoint layout, and display name as weaker evidence.

Avoid deriving authority from `ShipTag` alone. It is useful evidence, not a complete editor contract.

## 7. Gateway Implementation Plan

### 7.1 Add Scopes

Add new scopes in `bins/sidereal-gateway/src/auth/service.rs`:

```rust
dashboard:entity:read
dashboard:entity:write
```

Include them in admin/dev dashboard scope grants and scope validation tests.

### 7.2 Add Entity Context Routes

In `bins/sidereal-gateway/src/admin_dashboard.rs`, add routes:

```rust
.route(
  "/admin/dashboard/entities/{entity_guid}/edit-context",
  get(get_entity_edit_context),
)
.route(
  "/admin/dashboard/entities/{entity_guid}/genesis-context",
  get(get_genesis_entity_context),
)
.route(
  "/admin/dashboard/entities/{entity_guid}/genesis-instance",
  patch(patch_genesis_entity_instance),
)
.route(
  "/admin/dashboard/entities/{entity_guid}/shipyard-context",
  get(get_shipyard_entity_context),
)
.route(
  "/admin/dashboard/entities/{entity_guid}/shipyard-instance",
  patch(patch_shipyard_entity_instance),
)
```

If `patch` is not imported yet, add it from `axum::routing`.

### 7.3 Load Entity Snapshot

Implement a gateway helper that loads all graph data for one entity GUID:

```rust
fn load_entity_snapshot(entity_guid: &Uuid) -> AdminResult<EntitySnapshot>
```

It should include:

- entity node,
- all component nodes,
- direct graph relationships,
- parent/child relationships,
- mounted relationships,
- enough component payload to drive editor forms.

Use existing AGE graph conventions already present in `admin_dashboard.rs`:

- `LOAD 'age'; SET search_path = ag_catalog, public`
- configured `GRAPH_NAME`
- agtype parsing helpers already present in file
- safe identifier handling

Do not expose raw SQL errors directly beyond existing admin error style.

### 7.4 Resolve Registry Definitions

Add gateway-side registry lookup helpers. Prefer Rust typed loaders where they exist. Avoid duplicating dashboard-side TypeScript Lua parsers in Rust if a typed registry loader already exists.

Useful existing capabilities to inspect:

- `crates/sidereal-scripting` planet/ship/module registry loaders.
- `bins/sidereal-gateway/src/api.rs` asset/audio registry loading patterns.
- `bins/sidereal-gateway/src/auth/starter_world_scripts.rs` script catalog load/draft helpers.
- `data/scripts/planets/registry.lua`
- `data/scripts/ships/registry.lua`
- `data/scripts/ship_modules/registry.lua`

The gateway should resolve definitions from the active script catalog, which already incorporates bounded disk refresh from `docs/plans/superseded/dashboard_gateway_authority_and_script_editor_plan_2026-04-28.md`.

### 7.5 Patch Live Instances

Start with a conservative patch surface:

Genesis live instance patch allows:

- `display_name`
- `entity_labels`
- `size_m`
- `world_position`
- `world_rotation`
- `map_icon`
- `sprite_shader_asset_id`
- `planet_body_shader_settings`
- `runtime_world_visual_stack` only if it can be deterministically derived from shader/body kind fields

Shipyard live instance patch allows:

- root display/labels/tags,
- visual/map icon components,
- dimensions/collision components,
- root authoring components already represented in `ShipyardRootDefinition`,
- hardpoint local offsets/slot/display metadata,
- mounted module component overrides only where component kinds are allowed by generated component registry.

Do not initially allow:

- owner changes through Genesis/Shipyard instance editors,
- arbitrary entity ID changes,
- arbitrary parent/mounted relationship rewiring,
- direct authoritative transform/velocity mutation for simulated physics entities unless the gateway explicitly routes through the existing BRP/admin mutation contract and the design is approved,
- deleting child entities as a side effect of normal save.

### 7.6 Runtime Application Path

The first implementation may write through graph persistence and require refresh/reload for unloaded entities, but live loaded entities need a path to update the authoritative runtime.

Recommended phased behavior:

1. Phase 1-2: return context only, no live mutations.
2. Phase 3: apply safe patches to graph persistence and document whether running shards need a refresh.
3. Phase 4: add server-authoritative live application for loaded entities, probably by enqueueing gateway admin commands or using a bounded BRP/server admin path owned by gateway.

Do not make the dashboard call BRP directly. If BRP is used, it must remain behind the gateway `/admin/brp` or a more specific gateway entity mutation endpoint.

## 8. Dashboard Implementation Plan

### 8.1 Add API Routes

Add same-origin dashboard API routes:

```text
dashboard/src/routes/api.entities.$entityGuid.edit-context.tsx
dashboard/src/routes/api.genesis.entities.$entityGuid.tsx
dashboard/src/routes/api.shipyard.entities.$entityGuid.tsx
```

Each route must:

- validate `entityGuid` with Zod UUID schema,
- use `requireGatewaySession(request, "dashboard:entity:read")` for GET,
- use `requireGatewaySession(request, "dashboard:entity:write")` for PATCH,
- validate bodies with Zod schemas in `dashboard/src/lib/schemas/dashboard.ts`,
- proxy through `dashboard/src/server/gateway-proxy.ts`.

### 8.2 Add TypeScript Types

Add or extend:

```text
dashboard/src/features/entities/types.ts
dashboard/src/features/genesis/types.ts
dashboard/src/features/shipyard/types.ts
```

Keep shared entity context types out of route files.

### 8.3 Game World Context Menu

Modify `dashboard/src/features/explorer/ExplorerWorkspace.tsx`:

- Add state for edit-context loading/cache keyed by entity ID.
- Add `Edit...` menu item when `contextMenu.entityId` exists.
- On hover or menu open, fetch `/api/entities/$entityGuid/edit-context`.
- If context resolves:
  - route to `/genesis/entities/$entityGuid` for `genesis_planet_instance`,
  - route to `/shipyard/entities/$entityGuid` for `shipyard_ship_instance`,
  - show disabled text for unsupported.
- Use `useNavigate` from TanStack Router.
- Keep menu styling aligned with local GridCN/shadcn wrappers where possible. If this custom menu grows, consider replacing it with the shared context-menu wrapper if available.

Important: `ExplorerWorkspace` entity IDs may be runtime numeric IDs in live BRP mode and stable entity GUIDs in graph/database mode. Before routing, resolve the stable `EntityGuid`:

- Prefer `WorldEntity.entityGuid` if available.
- Otherwise inspect the entity’s `EntityGuid` component in graph nodes.
- If only numeric runtime ID is available, ask the gateway edit-context route to resolve numeric ID to GUID, or add a gateway endpoint that accepts runtime ID plus BRP target. Do not route numeric runtime IDs as entity GUIDs.

### 8.4 Add Entity Routes

Add lazy routes:

```text
dashboard/src/routes/_dashboard.genesis.entities.$entityGuid.tsx
dashboard/src/routes/_dashboard.shipyard.entities.$entityGuid.tsx
```

Update lazy entries as needed:

```text
dashboard/src/routes-lazy/genesis-route.tsx
dashboard/src/routes-lazy/shipyard-route.tsx
```

Preferred route components:

```tsx
<GenesisPage mode="instance" entityGuid={entityGuid} />
<ShipyardPage mode="instance" entityGuid={entityGuid} />
```

Avoid duplicating the entire editor. Instead, refactor current page state/loading into mode-aware hooks:

```text
dashboard/src/features/genesis/useGenesisDefinitionCatalog.ts
dashboard/src/features/genesis/useGenesisInstanceContext.ts
dashboard/src/features/shipyard/useShipyardDefinitionCatalog.ts
dashboard/src/features/shipyard/useShipyardInstanceContext.ts
```

If a full refactor is too large for the first slice, implement an instance-only wrapper that reuses existing child panels where practical, then consolidate.

### 8.5 Editor UX

Definition mode UI:

- existing behavior unchanged,
- save means script draft,
- publish means script catalog publish.

Instance mode UI:

- page header must clearly state `Live Entity Instance`.
- show linked registry/default definition if found.
- show diff from registry defaults when available.
- save button should read `Apply Live Edit`.
- include a warning when a field is registry-defined but now being overridden on this instance.
- include a link/button to `Edit Definition` that navigates to `/genesis` or `/shipyard` with the matched definition selected.
- do not show publish/discard draft actions in instance mode unless the UI also supports editing the definition.

## 9. Schema and Validation

Reuse existing Zod schemas where possible:

- `genesisPlanetShaderSettingsSchema`
- `genesisPlanetDefinitionSchema`
- `shipyardShipDefinitionSchema`
- `shipyardModuleDefinitionSchema`

Add instance-specific schemas because live entity payloads are not identical to registry definitions:

- `entityGuidParamSchema`
- `entityEditContextSchema`
- `genesisPlanetInstanceDefinitionSchema`
- `genesisPlanetInstanceSaveSchema`
- `shipyardShipInstanceDefinitionSchema`
- `shipyardShipInstanceSaveSchema`

Do not loosen validation to `unknown` for normal editable fields. Use `unknown` only for component payloads that already have no richer schema and are already treated that way in definition mode.

## 10. Tests

Dashboard tests:

- Route schemas reject invalid entity GUIDs.
- `/api/entities/$entityGuid/edit-context` requires `dashboard:entity:read`.
- PATCH routes require `dashboard:entity:write`.
- Game World context menu routes planet edit context to `/genesis/entities/$entityGuid`.
- Game World context menu routes ship edit context to `/shipyard/entities/$entityGuid`.
- Unsupported edit context renders disabled/unavailable state.
- Genesis instance route loads live context and does not show publish/discard script controls.
- Shipyard instance route loads live context and does not show publish/discard script controls.
- Existing definition mode tests continue to pass.

Gateway tests:

- New routes reject missing bearer token.
- New routes reject tokens without admin/dev role, verified MFA, `dashboard:access`, or route-specific scope.
- Entity snapshot query returns components and relationships for a fixture graph entity.
- Planet classification works from `registry_definition_ref`.
- Planet classification falls back to registry spawn `entity_id`.
- Ship classification works from `registry_definition_ref`.
- Unsupported entities return `editor: "unsupported"` with a reason, not a 500.
- Patch validation rejects entity GUID changes, owner changes, non-finite numbers, malformed f64 world coordinates, and component kinds outside the allowlist.

Scripting/game tests if `registry_definition_ref` is added:

- Planet bundle emits `registry_definition_ref`.
- Ship bundle emits `registry_definition_ref` for root and mounted module records where appropriate.
- Component persists/hydrates through graph records.
- Generated component registry includes the component.

Quality gates:

```bash
pnpm -C dashboard exec tsc --noEmit
pnpm -C dashboard lint
pnpm -C dashboard test
pnpm -C dashboard build
cargo fmt --all -- --check
CARGO_INCREMENTAL=0 cargo clippy --workspace --all-targets -- -D warnings
CARGO_INCREMENTAL=0 cargo check --workspace
```

If new shared Rust component code or client-consumed types are touched, also run:

```bash
CARGO_INCREMENTAL=0 cargo check -p sidereal-client --target wasm32-unknown-unknown --features bevy/webgpu
CARGO_INCREMENTAL=0 cargo check -p sidereal-client --target x86_64-pc-windows-gnu
```

## 11. Implementation Phases

### Phase 1: Read-Only Edit Context

Goal: right-click live entity and resolve where it would be edited.

Tasks:

1. Add `dashboard:entity:read` scope.
2. Add gateway `GET /admin/dashboard/entities/{entity_guid}/edit-context`.
3. Add dashboard `GET /api/entities/$entityGuid/edit-context`.
4. Add TypeScript DTOs.
5. Add Game World context menu `Edit...` item.
6. Route planets to `/genesis/entities/$entityGuid` and ships to `/shipyard/entities/$entityGuid`.
7. Add placeholder entity routes that display read-only edit context.

Acceptance:

- Right-clicking a supported entity opens the correct route.
- Unsupported entities do not crash and show a clear unavailable state.
- No live mutations yet.

### Phase 2: Genesis Planet Instance View

Goal: live planet/celestial entity can be opened in Genesis instance mode.

Tasks:

1. Add `GET /admin/dashboard/entities/{entity_guid}/genesis-context`.
2. Add `GET /api/genesis/entities/$entityGuid`.
3. Build `GenesisPage` instance mode or a temporary `GenesisInstancePage`.
4. Load live component payloads:
   - `display_name`
   - `entity_labels`
   - `size_m`
   - `world_position`
   - `world_rotation`
   - `map_icon`
   - `sprite_shader_asset_id`
   - `planet_body_shader_settings`
   - `runtime_world_visual_stack`
5. Link registry definition by `registry_definition_ref` or spawn `entity_id`.
6. Show diff from registry definition.

Acceptance:

- `/genesis/entities/$entityGuid` shows the live planet instance and linked registry definition.
- The route is read-only or save-disabled until Phase 3.

### Phase 3: Genesis Planet Live Patch

Goal: safe live planet fields can be edited through gateway.

Tasks:

1. Add `dashboard:entity:write` scope.
2. Add PATCH gateway/dashboard routes for Genesis instances.
3. Add Zod and Rust validation.
4. Apply changes to graph persistence.
5. If running shard application is available, enqueue/apply live update through gateway-owned runtime path.
6. Return refreshed context after save.

Acceptance:

- Changing a planet shader setting through `/genesis/entities/$entityGuid` updates the authoritative live/persisted entity path.
- No dashboard-local database, disk, or BRP bypass is introduced.

### Phase 4: Shipyard Ship Instance View

Goal: live ship root entity can be opened in Shipyard instance mode.

Tasks:

1. Add `GET /admin/dashboard/entities/{entity_guid}/shipyard-context`.
2. Add `GET /api/shipyard/entities/$entityGuid`.
3. Build `ShipyardPage` instance mode or a temporary `ShipyardInstancePage`.
4. Load root components, hardpoint children, mounted modules, and module component payloads.
5. Link registry ship/module definitions when possible.
6. Show diff from registry defaults.

Acceptance:

- `/shipyard/entities/$entityGuid` shows live root, hardpoints, modules, and linked registry data.
- Definition mode remains unchanged.

### Phase 5: Shipyard Ship Live Patch

Goal: safe live ship fields can be edited through gateway.

Tasks:

1. Add PATCH gateway/dashboard routes for Shipyard instances.
2. Validate hardpoint/module/component payloads against generated component registry and Shipyard schemas.
3. Patch graph persistence and live runtime path where safe.
4. Recompute dependent mass/inertia where gameplay contracts require it.
5. Return refreshed context after save.

Acceptance:

- Safe ship instance edits apply without corrupting hierarchy, mounts, owner state, mass/inertia parity, or authoritative motion ownership.

### Phase 6: Canonical Registry Link Component

Goal: remove weak heuristics from entity-to-definition matching.

Tasks:

1. Add `RegistryDefinitionRef` component.
2. Emit it from planet and ship bundles.
3. Persist/hydrate it.
4. Add dashboard/gateway classification preference for it.
5. Decide how existing dev databases are reset or backfilled. Since this repo is in strict early-development schema mode, prefer reset over compatibility shims unless explicitly approved.

Acceptance:

- New entities can be resolved to registry definitions exactly.
- Heuristic matching remains fallback only.

## 12. Risks and Design Decisions

### Risk: Definition edits vs instance edits become confusing

Mitigation:

- Use explicit page mode labels.
- Use different save verbs: `Save Draft` for definitions, `Apply Live Edit` for instances.
- Show linked definition and diff in instance mode.

### Risk: Runtime edits bypass authoritative systems

Mitigation:

- Gateway owns all live mutation endpoints.
- Start with read-only context and safe component patches.
- Defer physics/motion-changing edits until a proper authoritative runtime command path exists.

### Risk: Entity classification by labels is weak

Mitigation:

- Add `registry_definition_ref` as the canonical solution.
- Treat labels as low-confidence evidence only.

### Risk: Ship edits can break hierarchy/mount semantics

Mitigation:

- Phase Shipyard patching after read-only instance view.
- Do not allow arbitrary relationship rewiring in the first patch version.
- Validate hardpoint/module links and maintain `ParentGuid`/`MountedOn` invariants.

### Risk: Registry schema metadata is split between Rust and dashboard parsers

Mitigation:

- Prefer gateway/Rust typed registry loaders for edit context.
- Keep dashboard TypeScript parsers only as structured editor serialization helpers until gateway provides richer schema metadata.

## 13. Fresh Agent Handoff Checklist

Before coding, a fresh agent should:

1. Read this file completely.
2. Read `AGENTS.md`.
3. Read `docs/plans/superseded/dashboard_gateway_authority_and_script_editor_plan_2026-04-28.md`.
4. Read `docs/features/active/genesis_planet_registry_contract.md`.
5. Read `docs/features/active/shipyard_ship_authoring_contract.md`.
6. Inspect:
   - `dashboard/src/features/explorer/ExplorerWorkspace.tsx`
   - `dashboard/src/features/genesis/GenesisPage.tsx`
   - `dashboard/src/features/shipyard/ShipyardPage.tsx`
   - `dashboard/src/server/gateway-proxy.ts`
   - `bins/sidereal-gateway/src/admin_dashboard.rs`
   - `bins/sidereal-gateway/src/auth/service.rs`
   - `dashboard/src/lib/schemas/dashboard.ts`
7. Start with Phase 1 only unless the user explicitly asks for broader implementation.
8. Keep all privileged reads/mutations gateway-scoped.
9. Update relevant feature docs when behavior moves from proposed to implemented.
