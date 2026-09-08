# Sidereal Spacetime: concrete pivot and startup plan

Status: Accepted direction; implementation staged
Last updated: 2026-09-08
Owners: Sidereal project

## Decision and boundaries

Build a new project at `/root/sidereal_spacetime`. Keep `/root/sidereal` intact as reference. All legacy game services and its Postgres container are stopped. The complete Cargo target cache was cleaned at the owner's request. The private legacy database backup is `/root/sidereal-backups/pre-spacetime-pivot-2026-09-08.dump`; the existing Docker volume is preserved. Cargo reported 195.3 GiB logical artifacts removed; the filesystem reclaimed approximately 65 GiB. Never infer that the old database was migrated.

Adopt TypeScript, SpacetimeDB 2.10.0, Babylon.js 9.25.0 and a newly designed React component UI. Use one server / one database; no shard routing, ghost simulation or distributed ownership handoff. Preserve multiplayer privacy, server authority, durable identity and authoring semantics. Initial acceptance targets: 50 concurrent players and a 100-client stress run, subject to measured results, not advertised capacity.

Babylon is selected for a complete browser 3D scene engine with glTF, materials, picking, cameras, animation and GPU tooling. Three.js remains a credible alternative but would require assembling more game rendering infrastructure. PixiJS suits 2D and is not the selected 3D world engine. WebGL2 is the first verified renderer; WebGPU is a later measured option with fallback. 3D does not automatically improve performance: use instancing, merged static ship chunks, LOD, compressed textures and bounded lights/shadows.

## Read in this order

1. [Full preserved game scope](docs/game_scope.md).
2. [Authority, schema and networking](docs/architecture.md).
3. [Dashboard and authoring rebuild](docs/authoring.md).
4. [New UI and top-down 3D](docs/graphics_ui.md).
5. [Milestones and acceptance tests](docs/implementation_plan.md).
6. [Same-box operations and recovery](docs/operations.md).
7. [Assets, Blender and provenance](docs/assets.md).
8. [Verified scaffold and limitations](docs/verification.md).
9. [Source inventory](docs/source_inventory.md) and [machine-readable hashes/headings](docs/source_inventory.json).

The entire legacy docs tree is copied under `reference/sidereal/docs`; Orchard's docs are copied under `reference/orchard/docs`. Old source remains at `/root/sidereal`. This is a scope migration, not an assertion that proposed legacy mechanics were already implemented. The latest owner instructions override obsolete references: TAB changes view, E operates seats/doors; the old TAB scanner-ring binding must not return; sharding is removed; UI is newly designed; exterior/interior rendering is 3D.

## Runnable foundation

```sh
cd ~/sidereal_spacetime
npm ci
npm run setup
npm run dev
npm run status
npm run check
npm run build
npm run smoke
npm run stop
```

The browser application is `http://10.0.1.200:5173` on this machine (or `http://localhost:5173`). It proxies its own SpacetimeDB endpoint; the database listens only on `127.0.0.1:3100`. `dev.toml` is the only local service configuration. No NPM reverse-proxy or router changes are part of this scaffold. The legacy public game host remains stopped.

The foundation includes a Blender-derived 3D ship review scene, new UI shell/components, a local development identity, private persistent character/ship rows, server-owned movement and seat interaction, an expected-revision rename transaction, generated TypeScript bindings and tests. These are development fixtures. Full modular refits, combat, inventory, OIDC/MFA, multiplayer crew admission, tactical intelligence and complete dashboard editors are milestone work, not completed features.

## Architecture changes from the reference

| Legacy mechanism | Replacement / disposition |
| --- | --- |
| Bevy ECS + Avian + Lightyear | Pure shared simulation and explicit server table domains; custom prediction/reconciliation adapter. |
| Gateway → owner shard → persistence IPC → AGE | Authenticated reducer → one database transaction → permitted views/subscriptions. |
| DR-0040 handoff/ghost lanes | Out of scope for this project. Spatial indexing and admission/load budgets remain. |
| Graph entities/components | Normalized typed rows keyed by stable UUIDs, explicit relationships and transactional deletion policy. |
| Native Windows and Bevy WASM builds | Browser distribution; optional desktop wrapper only after browser acceptance. |
| Sprite-only modular ship rendering | Modular glTF meshes, orthographic top-down camera, cutaway layers and local interior lighting. |
| Legacy UI chrome and Bevy widgets | New shared UI component library and design tokens. Preserve interactions and capabilities, not old styling. |
| Lua runtime and shader catalog | Preserve source as reference. Versioned declarative content first; sandboxed scripts/editor/compiler pipeline in a dedicated milestone. No arbitrary client code evaluation inside reducers. |
| Binary/PNG caches | Versioned HTTP asset packages; public visuals versus authorized data kept separate. |

## Source assessment and carry-forward policy

Every legacy document was inventoried by path, status, section headings and SHA-256 and copied intact. Active/proposed gameplay and authoring contracts were examined by domain. Historical diagnostics and completed migration reports are retained as references; their engine-specific work is not automatically new backlog. `docs/game_scope.md` maps substantive game families to original sources. Assets were copied through an allowlist, with an import manifest. No account database, login token, `.env`, private art reference screenshot, compiled native client or cache was added to the new repository.

Reuse Orchard's architectural lessons, especially pure simulation, transactional item movement and caller-dependent views. Do not import its friends-only public spatial tables as Sidereal security, its identity-equals-character shortcut, its pixel UI skin, its art packs, or its large mixed entrypoints. Shared reusable implementations can be extracted later after tests establish behavior.

## Research supporting the decision

- [SpacetimeDB reducer transactions](https://spacetimedb.com/docs/functions/reducers/).
- [Private tables and permission-filtered views](https://spacetimedb.com/docs/tables/access-permissions/).
- [Subscriptions and cache lifecycle](https://spacetimedb.com/docs/clients/subscriptions/).
- [Current single-database execution/storage model, September 3](https://spacetimedb.com/blog/how-does-spacetime-scale).
- [Babylon.js documentation](https://doc.babylonjs.com/) and [glTF viewer](https://www.babylonjs.com/viewer/).

Treat upstream roadmap dates as proposals. The scaffold uses currently installed software and local validation, not promised horizontal scaling.

## 2026-09-08 owner refinements

The game frontend and authoring dashboard are separate Vite/React applications: `apps/client` at port 5173 and `apps/dashboard` at port 5174. Each builds independently into its own `dist`; app builds do not publish the backend. Shared packages contain reusable contracts/components, never app entrypoints. Run `npm run build:client` or `npm run build:dashboard`; `npm run build` is the explicit all-project gate. Dashboard: http://10.0.1.200:5174.

Reuse the existing Orchard Keycloak provider with separate Sidereal clients; see [authentication](docs/authentication.md). Full owner-managed [scripting and object lifecycles](docs/scripting_lifecycle.md) are part of the core design: typed contracts exist now, authority integration follows M1/M2, and the Script Studio begins in M3. The broad content tools continue in M8.
