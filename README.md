# Sidereal Spacetime

Status: Runnable development scaffold
Last updated: 2026-09-08
Owners: Sidereal project

A browser-first, single-server space RPG foundation with SpacetimeDB authority, Babylon.js top-down 3D, original Blender assets and a new React UI.

**Start with [PIVOT.md](https://wiki.sidereal.dastari.net/Vision/Documents/Sidereal%20Spacetime%20-%20concrete%20pivot%20and%20startup%20plan).** It carries the game scope, architecture decisions, authoring rebuild and phased acceptance gates.

```sh
npm ci
npm run setup
npm run dev
```

Open http://localhost:5173 (LAN http://10.0.1.200:5173). Create a local test character. WASD pilots from the seat; TAB changes exterior/interior view; E leaves/enters the seat; WASD walks while unseated in the interior. The same voxel-built Blender ship is used in flight and on foot. E transitions smoothly between the seat’s overhead camera and a fixed-elevation isometric camera; right-drag orbits and the wheel zooms. Rooms and furnishings have server-side collision in this lab fixture. Full modular gameplay, replay prediction, account login, inventory and authoring tools are planned phases.

`npm run status` / `npm run stop` manage only this project. `npm run check`, `npm run build`, `npm run smoke` verify the scaffold. See [operations](https://wiki.sidereal.dastari.net/Operations/Documents/Same-box%20setup%2C%20lifecycle%20and%20recovery), [scope](https://wiki.sidereal.dastari.net/Vision/Documents/Complete%20game%20scope%20carried%20into%20the%20pivot), [milestones](https://wiki.sidereal.dastari.net/Architecture/Documents/Implementation%20sequence%20and%20acceptance%20gates) and [validation](https://wiki.sidereal.dastari.net/Architecture/Documents/Verification%20record).

The old `/root/sidereal` source and database volume are preserved and stopped. Full legacy documents are copied into `reference/sidereal/docs`; source/asset hashes are in the manifests. No old account credentials were imported. No production host has been repointed.

The repository has no blanket license grant over imported material; original/third-party asset and vendored skill terms remain attached to their sources.

Game: http://10.0.1.200:5173 · Dashboard: http://10.0.1.200:5174. Independent app commands: `dev:client`, `dev:dashboard`, `build:client`, `build:dashboard`, `stop:client`, `stop:dashboard`. [Shared OIDC](https://wiki.sidereal.dastari.net/Architecture/Documents/Dedicated%20account%20authentication) and [owner-managed scripting/lifecycles](https://wiki.sidereal.dastari.net/Architecture/Documents/Object%20lifecycles%20and%20owner-managed%20scripting) are specified with clear implementation status.

2026-09-08 visual prototype: [theme and art direction](https://wiki.sidereal.dastari.net/Art/Documents/Sidereal%20visual%20theme%20%E2%80%94%20the%20inhabited%20frontier), [voxel construction/destruction](https://wiki.sidereal.dastari.net/Systems/Construction/Voxel%20construction%2C%20rendering%20and%20destruction), [IFCS implementation and next integration](https://wiki.sidereal.dastari.net/Systems/Flight/Component-driven%20IFCS%20integration). `npm run art:voxels` builds the Blender ship/asteroid and baked metal materials; `npm run art:check` validates them.
