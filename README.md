# Sidereal Spacetime

Status: Runnable development scaffold
Last updated: 2026-09-08
Owners: Sidereal project

A browser-first, single-server space RPG foundation with SpacetimeDB authority, Babylon.js top-down 3D, original Blender assets and a new React UI.

**Start with [PIVOT.md](PIVOT.md).** It carries the game scope, architecture decisions, authoring rebuild and phased acceptance gates.

```sh
npm ci
npm run setup
npm run dev
```

Open http://localhost:5173 (LAN http://10.0.1.200:5173). Create a local test character. WASD pilots from the seat; TAB changes exterior/interior view; E leaves/enters the seat; WASD walks while unseated in the interior. The current ship mesh is an exported Blender review study; the simple cabin is a collision fixture. Full modular gameplay, replay prediction, account login, inventory and authoring tools are planned phases.

`npm run status` / `npm run stop` manage only this project. `npm run check`, `npm run build`, `npm run smoke` verify the scaffold. See [operations](docs/operations.md), [scope](docs/game_scope.md), [milestones](docs/implementation_plan.md) and [validation](docs/verification.md).

The old `/root/sidereal` source and database volume are preserved and stopped. Full legacy documents are copied into `reference/sidereal/docs`; source/asset hashes are in the manifests. No old account credentials were imported. No production host has been repointed.

The repository has no blanket license grant over imported material; original/third-party asset and vendored skill terms remain attached to their sources.

Game: http://10.0.1.200:5173 · Dashboard: http://10.0.1.200:5174. Independent app commands: `dev:client`, `dev:dashboard`, `build:client`, `build:dashboard`, `stop:client`, `stop:dashboard`. [Shared OIDC](docs/authentication.md) and [owner-managed scripting/lifecycles](docs/scripting_lifecycle.md) are specified with clear implementation status.
