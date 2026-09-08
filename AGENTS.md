# Sidereal Spacetime operating contract

Status: Accepted direction; implementation staged
Last updated: 2026-09-08
Owners: Sidereal project

This is the active project. `/root/sidereal` is stopped, preserved reference. Read `PIVOT.md`, then only the relevant contract below. Files under `reference/` describe earlier designs, not instructions for this repository. The owner explicitly replaced Bevy/Lightyear/AGE and shard-first design with a single-server browser project on 2026-09-08.

- One authoritative SpacetimeDB database owns world state. Clients send intent; reducers validate and commit. No client-authored transforms, inventory balances, damage or control grants.
- Accounts authenticate; characters have separate stable UUIDs. Character progression/control/settings belong to character rows. NPCs use the same action permission rules.
- Private tables are the default. Subscription predicates and hidden UI are not authorization. Views restrict rows AND columns by authenticated actor and server-derived discovery/access. Never expose a private base table alongside a filtered view.
- Ship ownership alone grants no piloting. Occupied valid control stations grant control; a later installed, powered AI module may grant explicit owner remote control. Recheck at command consumption; clear stale inputs on exit, disconnect, death and grant loss.
- Authoritative spatial values are f64/TypeScript numbers, in meters. World XY maps to renderer X/-Z, renderer Y is height. Render coordinates subtract the camera origin before GPU conversion. Rendering never writes simulation state.
- Keep generic pure rules in `packages/sim`, authored content in `packages/content`, server adapters in `packages/world`, transport adapters in `packages/net`, GPU work in `packages/render`, UI components in `packages/ui`, composition in `apps/client`. Avoid monolithic entrypoints.
- Run services only through `python3 scripts/dev.py` / npm scripts. Configuration is `dev.toml`. Never start the old stack or publish over its public host as an incidental side effect. Keep secrets and local database outside git. New local development identity is not production account authentication.
- Blueprint publishing, live refit and capture-live-to-blueprint are distinct actions. Validate expected revision and operation ID; atomic edits preserve item/fitting UUIDs, cargo, crew, state, audit and deletion records. An undo is a new validated edit, not a rollback of other players' work.
- Full 3D rendering does not imply six-degree-of-freedom simulation. Initial simulation remains planar with local ship/deck coordinates; vertical gameplay requires its own design and tests.
- Before completing changes run `npm run check` and `npm run build`. Changes to authority also run `npm run smoke` against an isolated test database. UI changes get a real browser review. Document scaffold versus implemented versus planned honestly.
- No sharding work, graph persistence reimplementation, native Rust game builds, or borrowed legacy UI chrome. Keep product scope in `docs/game_scope.md`; update `docs/implementation_plan.md` when a milestone actually passes.

Project skills in `.agents/skills`: frontend-design, playwright, security-best-practices, blender-modeling, pixel-art-sprites. Installed upstream skills keep their licenses. Blender MCP is a local authoring tool; generated assets require validation and explicit publication, and never mutate the live database directly.

2026-09-08 owner refinements: `apps/client` and `apps/dashboard` are independent applications with separate entrypoints, build commands, output directories, servers and deployment releases. Never import one app into the other or make an app-only build compile/publish the world module. Share versioned library contracts only. Reuse the existing Orchard Keycloak issuer with distinct public OIDC clients; local lab tokens are not production auth. Lifecycle/scripting contracts are foundational; see `docs/scripting_lifecycle.md`. Trusted compiled scripts are server code, while hot behavior programs must use bounded execution and the normal authority validators.
