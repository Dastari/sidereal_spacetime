# External agent prompt: Shipyard layout editor

Prepared 2026-09-08. Copy the prompt below into an implementation agent with access to this repository. This is an implementation handoff, not evidence that the proposed editor or simulation is already delivered.

---

You are implementing Sidereal's Shipyard layout editor in `/root/sidereal_spacetime`. Your initial assignment is Stages 0–2 of `docs/ship_layout_editor_design.md`: audit/migration contracts, the deterministic floorplan compiler, and a working local dashboard planner. Complete that foundation for ships and stations with real browser evidence. Later authority and simulation stages are the roadmap and constrain the schema; they are not prerequisites for completing this first assignment. Read the complete design before editing. Follow its current/planned distinctions and acceptance gates. Do the work, preserving existing content and live state; do not deliver only a static mockup or a second design document.

## Read first and inspect the actual implementation

1. `AGENTS.md`, `PIVOT.md`, `docs/ship_layout_editor_design.md`, `docs/ship_construction.md`.
2. `docs/authoring.md`, `docs/architecture.md`, `docs/authentication.md`, `docs/scripting_lifecycle.md`, `docs/multiplayer_status.md`.
3. `docs/blender_asset_migration.md`, `docs/visual_theme.md`, `assets/art-library/INDEX.md`, `assets/art-library/WORKFLOW.md`.
4. `docs/active_agent_ownership.md`, `docs/implementation_plan.md`, `docs/operations.md`, `dev.toml` and the current package scripts.
5. Actual code in `apps/dashboard/src/shipyard/AssemblyEditor.tsx`, its CSS, `packages/render/src/assembly-editor.ts`, `packages/content/src/assembly.ts`, and the relevant sim/world/net/UI packages. Check the working tree and active ownership again: other agents are updating the game, planets, equipment and hull assets.

Open and visually inspect all four references; do not infer their contents from filenames:

- `reference/art/editor-mockup-1.png`: floorplan, structure palette, decks, inspector and metrics.
- `reference/art/editor-mockup-2.png`: orthographic exterior assembly, faction skins, material and mounting controls.
- `reference/art/editor-mockup-3.png`: room definition, interiors, circulation and object palette.
- `reference/art/editor-mockup-4.png`: systems routes, typed ports, load readouts and diagnostics.

They establish the desired interface and workflow. Their illustrative counts, reactor ratings, armor values and occupancy figures are not approved game balance or real telemetry. Never fabricate live readouts to resemble a reference.

## Product model

The floorplan is the basis for every ship and station. Users paint/place polygonal floor tiles, including rectangles, triangles and trapezoids, on a snapped plane. A deterministic compiler derives the enclosing perimeter and its structural walls from the tile union. Shared boundaries must not create duplicate walls or z-fighting. Handle partial shared edges, corners, holes and invalid joins explicitly. Store stable tile identities even when rendering their geometry in batches.

Interior partitions and openings divide the floorplan into rooms. A named room is an authored semantic area; pressure compartments and connected gas zones are derived from actual sealed boundaries, ceilings/floors, openings and current door/breach state. A room label is not proof of an airtight space. Support future multiple decks in the document without pretending planar gameplay already supports stairs, lifts or vertical traversal.

External armor/hull skins, faction themes and decals are separate from the pressure structure. They create the ship's aesthetic without silently changing its floorplan, sealing or fitting state. Skin damage and pressure-boundary damage are distinct. Support orthographic top/side/front views and a shared 3D preview, with clear local axes and transform restrictions.

Place furniture, medical equipment, consoles, reactors, tanks, engines, thrusters, weapons and turrets through semantic footprints, support rules, mounts and socket definitions. Validate approach space, door swing/sweep, exhaust, turret traverse and installation clearance. Mirroring must transform functional ports, nozzle directions and weapon arcs correctly, not just flip the picture. Catalog definitions are reusable; every installed object has its own stable identity.

Interior doors, interlocked airlocks, external airlocks and docking ports are distinct entities. Docking requires compatible geometry and independently validated permissions; it must not grant cargo access, boarding or piloting automatically. Pressure simulation and docking physics are explicit later gates, not animations masquerading as working gameplay.

Systems mode exposes underfloor service routes. Use typed ports and networks for power, data/control, fuel, coolant and ventilation, with heat handling explicitly modeled in its stage. A crossing is not a junction without a connection. Validate medium compatibility, direction, route support, capacity, valves, clearance and sealed bulkhead penetrations. Supply must eventually feed normal engine/control/equipment validators. Graph connectivity alone does not prove sufficient power or flow. Preview simulation is labeled and cannot consume live resources.

Cargo grids are physical restraint/placement grids in the ship or station for container instances. They validate footprint, orientation, height, mass, access and support. They are different from the Diablo/Tetris inventory inside a container. Liquid tanks use capacity and quantity, not item-grid cells. Preserve nested item identities and reject containment cycles or double-counted mass. Cargo loading, moving and unloading are authoritative transactions, not mesh dragging.

In ordinary gameplay, clicking selects useful equipment and engines for inspection. Individual structural tiles belong to construction/refit or explicit structural inspection mode. GPU mesh granularity must never decide gameplay selection policy.

## Architecture and authority: non-negotiable

- `apps/dashboard` is the independent authoring application. `apps/client` remains the game. They have separate entrypoints, build outputs and servers. Never import one application into the other or make a dashboard build publish the world module.
- Put generic deterministic topology, placement, pressure and network rules in `packages/sim`; versioned authored catalogs/contracts in `packages/content`; authority/table/reducer adapters in `packages/world`; generated transport adapters in `packages/net`; GPU work in `packages/render`; reusable interface components in `packages/ui`. Keep composition in the dashboard and avoid extending a monolithic entrypoint.
- One authoritative SpacetimeDB database owns live state. No separate canonical localStorage/JSON/SQL ship state, client-authored live transforms, balances, gas quantities, damage, control grants or fitted equipment state. Local transforms are draft proposals only; reducers validate them and derive canonical results.
- Private tables by default. Permission-filtered views restrict rows **and columns** by authenticated actor and server-derived access. Client query predicates and hidden controls do not provide authorization. Never publish private base tables alongside their filtered views.
- Stable character UUIDs are separate from accounts. Resolve the actor from trusted authentication, then check capabilities, target access, revision and operational constraints on every mutation, including direct reducer calls. The current private lab is not a production shared multiplayer world.
- Reuse the selected Orchard Keycloak issuer and separate dashboard/game public OIDC clients according to `docs/authentication.md`. Existing local lab tokens are development-only. Do not claim production authentication is ready or bypass missing grants with a client-side admin flag.
- Use f64/TypeScript numbers in meters for authoritative spatial values. Keep polygon topology on a bounded exact quantized lattice. Sim world XY maps to Babylon `(x, height, -y)`; use the existing heading/frame adapters and subtract the render origin before GPU conversion. Side-view editing does not introduce six-degree-of-freedom gameplay.
- Blueprint draft saving, immutable blueprint publishing, live refit and capture-live-to-blueprint are separate commands and UI actions. A publish never silently updates existing instances; a capture never silently overwrites the source blueprint.
- Live operations carry an operation UUID, expected aggregate revision and canonical payload fingerprint. Validate the whole bounded operation before atomic commit. Retain fitting/item UUIDs, cargo, fuel, ammo, crew, damage/state, audit, tombstones and receipts. Same-ID retry returns the recorded result; changed payload with the same ID fails. Stale revision conflicts must not overwrite another editor's work.
- Removing occupied or loaded structure requires an explicit validated relocation/removal plan. Never delete contents or eject actors silently. Undo before commit is local command history; after commit it is a new validated inverse edit against current state.
- Keep expensive Blender work, HTTP fetches and artifact compilation outside reducers. Use validated immutable outputs and the lifecycle/action contracts; do not evaluate arbitrary browser-authored code in the authority runtime.

## Art, rendering and ownership

Blender-authored editable meshes/materials are the visual source. Use approved GLB catalogs with footprints, sockets and separate occupancy/collision/damage proxies. Do not redesign existing equipment or hulls through the retired TypeScript voxel generators. Do not replace approved assets with coarse sampled surfaces for convenience.

External agents currently own equipment models (beds, seats, terminals, etc.) and the native front/hull kit. Coordinate adapters and shared exports; preserve their sources, manifests, placement identities and in-progress revisions. Never reset or clean the shared working tree. Read ownership records as a starting point, then verify them because work is concurrent.

Use shared material families, instancing/merged chunks, LOD, bounded lights/shadows and normal/bump/roughness maps for shallow panel detail. Real openings, seals, large bevels and silhouettes remain geometry. Texture detail does not eliminate shadow-pass overhead or provide collision. Preserve transparent/reflective material roles. Retain per-instance selection even when GPU data is shared.

Follow the exact art-library reference/revision/evidence workflow for any new art. Passing tests and agent satisfaction are not final owner approval of an asset revision. Prepare a concrete reviewable candidate before requesting the required publication approval; ordinary reversible code work does not require repeated permission questions.

## Interface and delivery

Use the project frontend-design and playwright skills. Translate the four mockups into reusable layout controls: deck/layer lists, searchable catalog tiles, tool strips, tabs, inspectors, metrics, split panels, forms, validation lists and viewport overlays. Keep cyan selection/emissive borders readable, strong near-white active states controlled, and the central work area dominant. Support panel resize, overflow scrolling, keyboard focus, DPI/window resizing, undo/redo, drag/copy/rotate/mirror, cancellation and draft recovery. Do not let shortcuts edit the ship while typing in a field.

Preserve existing `sidereal.assembly.draft.v1` documents. Migrate explicitly to the new versioned model and identity/document/live-target scoped recovery storage. Unknown catalog revisions and unsupported drafts must remain exportable; never replace them with a default ship. Legacy meshes do not contain authoritative room topology: flag unresolved mappings for deliberate conversion.

Deliver the design's first executable slice: a tested deterministic polygon-floorplan compiler and usable dashboard layout editor, including automatic perimeter preview, room/partition/opening design, correct selection, undo/redo, save/reload/export and preserved legacy drafts. Prepare clean interfaces for the later authority, fittings, skins, cargo and systems gates without advertising them as working simulation. Finish each assigned stage and report exact evidence. Do not mark a feature complete merely because it has a tab, schema or static overlay.

Run services through `python3 scripts/dev.py` or existing npm scripts, using `dev.toml`. Do not start the stopped `/root/sidereal` stack, reset the normal database, or incidentally publish to a public host. The game preview is `http://sidereal.tail7a58a6.ts.net:5173/`; the independent dashboard is configured on the same host at port 5174. Use the actual dashboard for editor browser tests and the specified game preview for integration. Coordinate shared software-GPU browser sessions; release them after review.

Before completing changes run `npm run check` and `npm run build`. Authority changes also require `npm run smoke` against an isolated test database and the relevant restart checks; use the managed scripts. Asset changes require `npm run art:check`; run `npm run art:voxels` only when changing the existing voxel pipeline. Verify independent app builds. Do not loosen timeouts or budgets to hide contention; rerun failed checks in isolation and report real failures.

At minimum, test partial-edge polygon joins and holes, deterministic topology under insertion order, no duplicate walls, invalid overlaps, preserved IDs during edits, room versus pressure connectivity, mount/clearance and mirrored directions, cargo containment and mass, typed route junctions, stale revisions, retries, two-editor races, denied access/revocation, no cargo/crew loss, refresh/restart recovery and publish/refit/capture separation as their stages land. Capture actual dashboard screenshots against each relevant mockup at multiple sizes; never use a rendered concept image as implementation evidence. Include measured viewport/render and compiler costs for a bounded small ship and larger station fixture.

Update `docs/implementation_plan.md` only when a milestone actually passes. Leave a concise handoff with changed paths, commands/results, screenshots, implemented versus preview-only features and outstanding limitations. Continue useful authorized work autonomously; raise a question only for a material unresolved decision that blocks dependent implementation.
