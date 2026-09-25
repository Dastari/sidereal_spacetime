# Shipyard player builder and voxel ship structure

Status: **proposed design**. The owner decisions in §1 are recorded; nothing below is implemented unless it is marked *exists*.
Date: 2026-09-25
Evidence: `docs/shipyard_player_builder/*.jpg`, `scripts/art_library/voxel_style_prototype.py`

The goal is Cosmoteer-style ship design in our 3D world. The same construction system serves developer prefab authoring (the dashboard Shipyard) and player modification in game. All floor, wall, hull and module pieces snap under one rule set. Hull and walls are voxel-destructible and look like the `reference/art` target (`3d-rpg-after.png`, `core-construction-blocks.png`, `editor-mockup-*.png`).

## 1. Owner decisions, 2026-09-25

| Topic | Decision |
|---|---|
| Structure art and damage | Hull and walls are **voxel-destructible** so repair can come later. Pick whichever approach lets an agent generate hull and wall assets without thinking about voxels, followed by a separate **voxelise process**. The earlier "preserve authored Blender surfaces in the visual export" rule may be reversed for ship structure. The priorities are the reference look, efficiency and voxel destructibility. |
| In-game objects | Props, modules and equipment have **health and proper damage states**. They are not voxel-destructible. |
| Grading | Game colour needs **gamma up, contrast down, saturation up** to match the reference's vibrancy. |
| Build grid | **1 m × 1 m is the smallest placeable tile.** Shape tiles exist at that scale (for example a 1×1 triangle or a 2×1 triangle). Walls and objects may snap to much finer increments. |
| Shapes | **More slopes, and curves** where possible, so outlines like `editor-mockup-3.png` can be built. |
| Rooms | **Labels only** for now. |
| Acquisition | **Both.** Developers author a range of prefab ships. Players may modify them, bounded by the ship's **blueprint size** (maximum extent) and by the engines they have access to. A big ship with small engines is slow. |
| Decks | **Launch single-deck.** The data model and rules must carry multi-deck from day one. |

## 2. Audit baseline: what exists

Most of the audited code is on `main`. The R16 Shipyard rebuild commit (`9c58c077`) lives only on the `ifcs-update` branch (draft PR #1). That commit adds `docs/blender_asset_migration.md`, `scripts/voxelize_blender.py`, the Wayfarer-only flight qualification and the inset/complex-perimeter kits.

**Editor (`apps/dashboard/src/shipyard`).**
- One `LayoutDocument` is edited by two interaction systems plus the legacy `AssemblyEditor`:
  - Structure/Systems is an SVG canvas.
  - Objects/Hull is a Babylon workspace.
- Structure mode has multi-select, a tiles-only marquee, select-all, 90° rotate, X/Y mirror, clone, and a clipboard that stores IDs rather than data.
- Objects/Hull mode is single-select only, has its own clipboard and key handler, and snaps in metres.
- Nowhere in the editor are there groups/prefabs, replace, an eyedropper, cross-deck paste, symmetry beyond floor stamps, or a red "invalid" ghost.
- Undo is a 40-deep whole-document snapshot stack.
- Bug found on the `ifcs-update` branch only: Hull snap values of 0.0625, 0.125 and 0.25 m persist as `view.grid` 2, 4 and 8. The checkpoint reader rejects those values, so the editor falls into recovery on reload. `main` offers only 0.03125/0.5/1/2 m and is not affected.

**Rules (`packages/content`, `packages/sim`).**
- The base units agree everywhere: a 1/32 m lattice, a 2 m module, floor top at 6 units, and the 3.5 m pitch the owner approved.
- Everything above the base units diverges:
  - five wall thickness/position models
  - wall top at 96 units in some places and 102 in others
  - `LayoutDeck.ceiling` measured from the floor bottom
  - six rotation systems
  - about seven bespoke per-family planners
- The only declarative socket fitter, `fitTileset`, is used by floors alone.
- Armor is a set of hand-drawn polygons.
- Stairs and lifts are fixed, hash-pinned fixtures.
- Pre-authoring every perimeter combination produced kits of 1,104 and 2,288 GLBs (on `ifcs-update`).

**Authority (`packages/world`).**
- The draft → blueprint → spawn path *exists*. Publishing re-runs the same pure compiler that the editor uses (`compileConstruction`).
- The limits:
  - Design rights are admin-granted per workspace.
  - Publish compiles synchronously inside the reducer.
  - There are no part costs, build time or construction jobs.
  - On `ifcs-update`, flight is gated to three Wayfarer blueprint hashes.
  - There is no in-game editor.

**Voxel runtime (*exists*, on `main`).**
- `packages/sim/src/voxels.ts`: 32³ chunks, `meshChunk`, `removeVoxels` and run-length encoding.
- `packages/render/src/voxel-worker.ts`: remeshing.
- `PartPlacement.removedCells` in `packages/content/src/assembly.ts`.
- `constructionDamageMode` in `packages/content/src/tileset-interfaces.ts` already maps floor, roof, pressure-wall, partition, armor and external-system to `voxel`, and everything else to `entity-health` or `none`. That matches the §1 decision exactly.

**Rendering.**
- The frame is CPU-bound on draw calls: 4,920 in flight view and 7,304 in deck view (`docs/rendering_performance_plan.md`).
- `packages/render/src/graphics-settings.ts` already exposes brightness, contrast, gamma and saturation, all defaulting to 1.

## 3. Construction grammar: one rulebook

A single versioned module, proposed as `packages/content/src/construction-grammar.v1.ts` plus JSON, is read by the editor, the sim validators, the voxel pipeline and the reducers. No kit restates these numbers.

### 3.1 Units and datums

| Quantity | Value |
|---|---|
| Lattice | 1/32 m (unchanged) |
| **Build cell** | **1 m (32 u)**, the smallest placeable floor or hull tile |
| Door/window module | 2 m frame spanning two cell edges; 1.25 m × 2.25 m clear door; 1.5 m × 1.5 m window |
| Fine snap (props, wall fixtures, mounts) | 0.25 m default; 1/16 m minimum |
| **Voxel** | **1/16 m (62.5 mm) = 2 lattice units**, 16 per build cell |
| Deck profile | floor 0.1875 + clear 3.0 + roof 0.125 + service 0.1875 = **3.5 m pitch** (56 voxels). Wall top at 102 u everywhere; the 96-unit values are retired to explicit legacy profiles |
| Exterior wall | 250 mm **inward** of the tile boundary (owner rule, 2026-09-11) |
| Internal partition | 250 mm **centred** on a cell edge |
| Hull/armor | Voxel cells **outside** the boundary. Thickness is a class: 0.5, 1 or 2 m |

With inward walls a one-cell corridor leaves only 0.5 m clear, so the validator's minimum walkable corridor is 2 cells.

### 3.2 Three lattices on one grid

- **Cells** hold floor shape tiles, hull/armor classes, module footprints and cargo grids.
- **Edges** hold walls, partitions, doors, windows and airlocks. The player paints edges; a door occupies two collinear edges.
- **Vertices** hold junctions (end, straight, L, T, cross). These are **derived, never placed**. The derivation uses the 4-bit occupancy of the four edges meeting at the vertex, which gives six cases after symmetry, plus height variants.

This replaces pre-authored perimeter combinations. A family needs a few rules, not thousands of GLBs.

### 3.3 Shape tiles: slopes and curves as data

A shape tile is a **polygon on the 1 m lattice**, not an asset. A ship footprint is the union of its shape tiles; the floor, walls and hull are all generated from that footprint.

| Shape set | Tiles |
|---|---|
| Square | 1×1 |
| Slopes (rise:run) | 1:1 in 1×1; 1:2 in 2×1 and 1×2; 1:3 in 3×1; 1:4 in 4×1. Each has a convex (triangle) and a concave (square minus triangle) form |
| Arcs | Quarter circles of radius 1, 2, 3 and 4 m spanning r×r cells, convex and concave. The prototype uses r = 3 |
| Compound corners | 45° chamfer of 1–2 cells |

- Allowed boundary directions are axis, 1:1, 1:2, 1:3 and 1:4. The existing 32 rational directions in the complex-perimeter work already contain this set, apart from 1:3.
- Arcs are exact circles, quantised only by the voxeliser. Sample 04 shows a stepped curve like the reference bow.
- Adding a new shape tile means adding a polygon and a test, with no new art.
- The vertical profile of the hull's top edge (square, 45° chamfer or round) is a per-segment parameter, handled the same way.

### 3.4 Orientation and sockets

- Placed parts use 4 yaws plus a mirror flag, with **one** field name (`reflected`) and one value set.
- The shape set is closed under that group.
- The 72-step yaw and the free-radian part rotation are retired for player content.
- Every module declares:
  - a cell footprint with a height class
  - typed face sockets (structure, pressure seal, power, data, air, mount/hardpoint, cargo bearing), each with a normal and an interval
  - a mates table
- One generalised fitter (the current `fitTileset` semantics) checks every family. The per-family planners are retired.

### 3.5 Multi-deck from day one

- Voxel and cell coordinates are ship-global.
- A deck is `{ index, elevation = index × pitch, profile }`. Launch validation enforces `decks.length === 1`.
- Stairs, ladders and lifts are reserved as **shaft tiles**: 2×2-cell footprints with vertical sockets that carve floor and roof voxels on the decks they connect.
- Hull thickness classes and style bands are expressed per deck, so stacking needs no new art rules.

### 3.6 Bow, cockpit and hero modules

Generic grammar produces floor, walls, the wall ring and the roof. Silhouette-defining parts are **authored modules** that snap to grammar sockets. They are never generated.

- **Bow socket.** The footprint's forward facets are a socket class, such as `bow.facet3` (a 45°/flat/45° three-facet nose) or `bow.point`.
- **Cockpit module.** A module for that socket carries:
  - a `shellvoid` volume that cuts the canopy aperture through the ring and roof
  - optical glass meshes (never voxelised)
  - posts, mullions, sill and head, as authored voxel parts
  - an optional glazed roof
  - the pilot-seat/console station socket
  - its own interior layout

  Cockpits are swapped per socket class and per faction, so the nose can change without touching the rest of the ship.
- **Rear and side hardpoints.** Engine, thruster, turret and pod modules sit on these. Size classes bound what a blueprint size class may mount.
- **Glass under damage.** Glass is presentation with entity health. When its frame cells are destroyed, the pane shatters to an open aperture and the pressure boundary breaks.

### 3.7 Two presentation views from one ship

**Flight view** (top-down, the view players spend most time in) shows the full roof cap. The roof is part of structure and is voxel-destructible like the hull. Its cassette layout follows the room plan beneath it:
- a charcoal spine over the corridor, with the logo and hazard rows
- roofboxes, vents, crimson hatches and greebles over the rooms
- a louvred roof over engineering
- a glazed skylight over the bridge

**Deck view** (walking) is the same cells with the roof removed and the shell and partitions cut away at render time. The cut is presentation only: authority never changes cells because of the camera. Flight and deck share one geometry and frame, as `AGENTS.md` requires. Each deck view is generated per deck.

## 4. Structure art pipeline: author → sample → style → mesh

![Rules sample](shipyard_player_builder/01_rules_source.jpg)

*Sample 01: the proposed rules.*
- 1 m cells, with the 2 m module lines drawn thicker.
- The exterior wall sits 250 mm inside the boundary, and the partition is centred on its edge.
- The door and window use the 2 m module.
- Armor is 1 m cells outside the boundary, with a 45° corner.
- Magenta dots are sockets.

![Wayfarer-style section](shipyard_player_builder/04_wayfarer_section_voxel.jpg)

*Sample 04: a 14 × 8 m Wayfarer-style section made from about 90 plain primitives by the prototype script.*
- It has a 45° starboard bow slope, an r = 3 m port bow arc and cylinder engines.
- It is voxelised at 62.5 mm and styled by the deterministic pass: panel seams, raised plates, vents, running lights, rim greebles, two-tone walls and floor grating.
- The grade raises gamma and saturation and lowers contrast, with bloom.

### 4.1 Authoring contract (agent-friendly)

Structure is written as **ordered, role-tagged layers** of simple solids: boxes, footprint prisms, cylinders, or any closed mesh.
- Later layers win.
- The `void` role carves.
- Roles select style rules (`hull`, `wall`, `partition`, `floor`, `doorframe`, light roles, and so on).
- Glass and other optical surfaces are separate real meshes and are never voxelised.
- Author detail at 2 or more voxels (≥125 mm), aligned to the 1/16 m grid. Sample 03 shows the failure mode: at 125 mm, off-grid detail slips and merges.

The author does **not** model panels, seams or greebles, so an agent needs no voxel knowledge. For grammar-generated structure (floor, walls, hull wrap, doors) the layers come straight from §3 data. Blender is only needed for bespoke silhouettes and for props.

![Resolution comparison](shipyard_player_builder/03_hull_source_vs_62mm_vs_125mm.jpg)

*Sample 03: source, then 62.5 mm, then 125 mm. 62.5 mm keeps panel seams, vent slats and bolts; 125 mm loses them.*

### 4.2 Sampling

- Cell centres are sampled on the **global ship lattice**, so adjacent tiles always share one grid and mate seamlessly.
- The only stored value per cell is a small role/material id.
- The prototype uses scanline ray casts in Blender, which is the same technique as `scripts/voxelize_blender.py` on `ifcs-update`.
- Production should do this in TypeScript directly from the layer JSON for grammar structure, and in Blender only for arbitrary meshes. Both produce the same cell format.

### 4.3 Faction style kits

The detail comes from a **deterministic style pass** parameterised by a style kit: palette weights, panel widths, band heights, and probabilities for seams, raised plates, vents and lights.
- It is seeded by world cell coordinates and blueprint id, never by RNG state. Identical input always gives identical output, and panels continue across tile seams and around slopes and curves (via arc-length along the boundary).
- Variants such as Frontier, Union, Karst, Virell and Dredge (`editor-mockup-2.png`) are just different kits over the same cells.
- The pass must have **one implementation**. That should be TypeScript in `packages/sim`, run in a render worker. The server never needs it, because style is presentation.

### 4.4 Props, modules and equipment

- These stay authored meshes (Blender GLBs). For a consistent look they may be voxelised offline with the same sampler.
- They use `entity-health` with authored damage-state variants: pristine, scuffed, damaged, destroyed (`editor-mockup-2.png`).
- They are not cell-destructible.

### 4.5 Grading

- Change the `graphics-settings.ts` defaults toward gamma > 1, contrast < 1 and saturation > 1.
- Add bloom on emissives.
- The prototype grade (Blender compositor: saturation 1.3, contrast −4, gamma 1.06) is only a starting point. Final values need browser review against `3d-rpg-after.png`.

## 5. Destructibility and authority

![Damaged section](shipyard_player_builder/05_wayfarer_section_damaged.jpg)
![Damage close-up](shipyard_player_builder/06_damage_closeup.jpg)

*Samples 05 and 06: impacts remove cells. 13,048 cells are removed in four craters. The lip is scorched with sparse embers, while untouched panels keep their seams.*

**Base volume.**
- Each published blueprint compiles to an immutable base volume: role-id cells, run-length encoded (reusing `encodeVoxels`) and content-addressed.
- Live ships reference the base volume and store only a **damage delta**: removed or repaired cells per 32³ chunk.
- This extends the existing `removedCells` idea to a chunked bitset.

**Damage.**
- The server applies impacts deterministically, using integer cell math and a hashed jitter.
- It checks permission, revision and resources before committing, as `AGENTS.md` already requires for runtime damage.
- Clients rebuild **dirty chunks only after** the commit.
- Derived gameplay is recomputed from surviving cells: integrity per 1 m cell, pressure breaches (a cell path through wall and hull), and mass changes.

**Repair.**
- Repair restores cells from the base volume as validated jobs that consume resources.
- It is a new validated edit, never a rollback.

**What is never stored per cell server-side.** Colours, styles and scorch are presentation, recomputed by clients from cells plus the style kit.

## 6. Efficiency budget

Prototype numbers for the section (14 × 8 m floor, 1 m hull, two 4.5 m engines):

| Measure | Value |
|---|---|
| Solid cells | 1,117,161 (hull 551k, engines 179k, walls 101k, partitions 89k, floor 81k) |
| Exposed quads, naive | 225,808 in **one material** |
| Damaged (four craters) | 234,694 quads |
| Headless prototype time (Python, Blender 4.3) | about 2 min including three renders |

Runtime plan:
- **Render batches of 4 m (64³ cells).** A Wayfarer-sized hull (about 36 × 14 × 3.5 m) is roughly 30–40 draw calls, compared with 4,920 for the whole frame today. One vertex-colour material, with emission in the same vertex stream.
- **Greedy meshing** per chunk and per colour/role. Flat panels collapse strongly; the reduction is not yet measured and should be the P2 gate.
- **No geometric bevel at runtime.** The Blender bevel modifier is offline evidence only. At runtime, use baked per-vertex ambient occlusion plus an edge-highlight term in the shader to get the molded-brick look.
- **LOD:** 2× downsampled volumes (125 mm) for distant or flight views; meshes are cached per LOD.
- **Damage:** remesh only dirty chunks in the existing voxel worker. Undamaged chunks of identical content can share GPU buffers.

## 7. Editor core, shared by dashboard and game

Build a new framework-light package, for example `packages/ship-editor`, containing the state machine, commands and validators. React panels go in `packages/ui`. `apps/dashboard` and `apps/client` each compose it; neither app imports the other.

**Selection.** One model: a set of typed refs (cell, edge, part, deck, route) shared by every mode.
- click
- Shift/Ctrl add or toggle
- marquee in 2D and 3D (frustum)
- select all, invert, select similar, select connected/room
- Esc and Ctrl+D deselect

**Commands.** Every edit is an undoable command with an inverse patch: move, nudge, rotate (R/Shift+R), mirror (F/Shift+F), clone (Ctrl+Shift+D, Ctrl-drag), delete, replace, paint and fill.
- This replaces snapshot undo.
- The same commands carry operation IDs to the server.

**Clipboard and prefabs.**
- The clipboard holds serialised sub-documents with relative coordinates.
- Paste works across decks and documents.
- **Save selection as prefab**, for example a 3×3 crew-quarters pod, into a blueprint library.

**Tools.**
- Select
- Paint cells, with drag fill and shape-tile picker
- Wall line along edges
- Room rectangle (floor, walls and door in one drag)
- Place part
- Erase
- Eyedropper
- Replace variant
- Measure
- Symmetry X/Y for every tool

**Feedback.**
- A live green/red ghost with the failing rule at the cursor, from an incremental validator call per hover.
- Errors focus the offending geometry.

**Keymap.** One module, with an in-editor overlay (`?`). PgUp/PgDn switches deck, and the deck below shows as a ghost.

## 8. Player builder flow

1. **Prefab ships.** Developers author them in the dashboard Shipyard and publish immutable blueprints. Each carries a **blueprint size class**: maximum cell extents, deck count and hull-thickness classes.
2. **Acquisition.** A player acquires a ship instance. Modification happens at a shipyard: the player edits a private draft copy validated by the same grammar, bounded by the size class.
3. **Performance.** Mass comes from cells and modules. Thrust and actuators come from installed engines. Flight compiles from part definitions, which removes the Wayfarer-hash gate from `ifcs-update`.
4. **Applying changes.** The difference between live ship and draft becomes construction and refit jobs: cost, resources and time, with UUID-preserving refit through the existing identity planner.
5. **Authority.**
   - Designing uses auto-provisioned private workspaces and a `player.design` capability.
   - Each player gets rate limits and size limits.
   - Publish and compile run in a **queued job** processed a few per tick, like the flight dirty queue, not inside the request.

## 9. Phased plan and acceptance gates

| Phase | Scope | Gate |
|---|---|---|
| P0 | This design and the owner decision record. Fix the grid-persist bug on `ifcs-update` (PR #1) | Owner review |
| P1 | Grammar module (datums, lattices, shape tiles, sockets, orientation) plus pure validator in `packages/sim` | Unit tests: union/offset of every shape tile, edge/vertex derivation, corridor minimum, multi-deck fields, 1-deck launch rule |
| P2 | Structure pipeline: layer JSON → TS sampler → style kit v1 (Frontier) → greedy chunk mesher and vertex-colour shader; grading defaults | Browser evidence against `3d-rpg-after.png`; draw calls and ms for a Wayfarer-sized ship; deterministic hash of cells and meshes |
| P3 | `packages/ship-editor` core adopted by the dashboard (tools in §7) | Playwright interaction tests for every tool; browser review |
| P4 | Damage delta tables and reducers, repair jobs, dirty-chunk rebuild | `npm run smoke` on an isolated DB; permission, revision and replay tests |
| P5 | Generic part-to-flight compile, size classes, costs | Flight parity with the current Wayfarer; big-ship/small-engine acceptance |
| P6 | In-game shipyard builder in `apps/client`, prefab catalog | Player edit → refit job → fly |
| P7 | Multi-deck enablement: shaft tiles, deck profiles | Traversal and pressure tests across decks |

## 10. Supersessions, risks and non-goals

**Supersessions.**
- For **ship structure** (hull, armor, exterior walls, partitions, floors, roofs), this supersedes the 2026-09-08 direction to preserve authored Blender surfaces in the visual export (`AGENTS.md`, and `docs/blender_asset_migration.md` on `ifcs-update`).
- Blender remains the authoring source for props, modules, equipment, characters and bespoke silhouettes.
- Existing native kits (inset250, complex perimeter, armor r005, framed Wayfarer) and all live pins stay unchanged as history until an explicit migration.

**Risks and constraints.**
- The samples are proposals, not approved art. `assets/art-library` approval rules still apply to any production style kit.
- The style pass needs one implementation. If Python (Blender) and TypeScript (runtime) both implement it, they will drift.
- Runtime visual quality without geometric bevels is unproven; that is the P2 gate.
- Voxel memory per ship must be budgeted. Base volumes are shared across instances of a blueprint; only deltas are per ship.

**Non-goals now.** Functional rooms, six-degree-of-freedom simulation, and arbitrary vertical slopes in the hull cross-section beyond top-edge profiles.

## 12. Reusable component kit, theming, decals and detail maps

This section records owner direction from 2026-09-25:
- Build pieces in Blender with more detail.
- Theme them through swappable materials.
- Support decals for wording and logos.
- Use bump/normal detail for metal and rivets.
- Everything snaps together under rotations and sizes.
- The kit must cover Cosmoteer-style hull shapes, external mounts, stations, fighters and shuttles, pirate variants and alien ships.

**Evidence.**
- Script: `scripts/art_library/ship_kit_prototype.py` (r004).
- Manifest: `shipyard_player_builder/kit_r004.json`.
- Renders: `shipyard_player_builder/r004_*`.

### 12.1 Piece contract

Every piece is authored once and reused everywhere. A piece declares:

| Field | Meaning |
|---|---|
| `id`, `family` | For example `cas.hatch.w2.h24` in the `cassette` family |
| `mount` | Which socket class it plugs into: `plan` (hull cell), `face` (exterior face), `top` (roof cell), `edge` (interior cell edge), `rear`/`face` hardpoint |
| `size` | Footprint in 1 m cells plus height, in 1/16 m texels |
| `boxes` | Geometry: boxes on the 1/16 m brick grid. `voxel_aligned: true` means voxelising the piece for destruction is lossless |
| `slots` | Material slots used (§12.2) |
| `decal_sockets` | Rectangles that accept decals (`name`, `emblem`, `number`) |
| `decorator_sockets` | Points that accept theme decorators (§12.7) |

**Local frames.**
- Face pieces: +X runs along the face, +Y points outward and +Z points up.
- Plan and roof pieces: +X/+Y in plan and +Z up.

**Placement and orientation.**
- A placement is a socket plus a transform: 4 yaw turns and a mirror flag, with the socket normal fixing the remaining axes.
- A side cannon on a port face and a starboard face is the same piece; the socket normal decides which way it faces.
- The r004 corvette places 657 instances (per-theme generated hull body included) using **61 unique meshes (22.5 k triangles in total)**. All 59 kit pieces pass the voxel-alignment check.

**Runtime rendering.**
- **Intact pieces** render as GPU instances of the authored mesh. This is cheap and batched by piece id.
- **Damaged pieces** switch to their voxel remesh (§5), which shows the holes. Because pieces are brick-aligned, the swap is visually lossless.

### 12.2 Material slots and themes

**Nine slots:** `primary`, `secondary`, `accent`, `trim`, `metal`, `dark`, `emit_a`, `emit_b` and `glass`.

**A theme is only a slot → material table.** Each material has albedo, roughness, metalness, detail-bump strength, emission, and a wear/grime/rust parameter.

The r004 renders show three themes on the **same mesh datablocks**, using object-level material overrides:
- **Federation:** warm white, navy and crimson; cyan and amber lights.
- **Riftjack:** rusted brown, black, blood red and hazard yellow; orange and red lights; heavy wear.
- **Aurelian:** lavender, violet and gold; magenta and cyan lights.

**Player paint** (the existing local primary/secondary component-paint work) becomes per-placement overrides of `primary`/`secondary`/`accent` on top of the theme.

**Runtime.** One PBR material per theme and slot. Slot ids travel in the mesh (material index) and in voxel cells (the cell material id), so damaged remeshes keep their colours.

### 12.3 Detail normal maps

- A tiling 1 m detail height map (`r004_detail_height.png`) contains 0.5 m panel seams, rivet rows beside them, fine noise and light scratches.
- It is box-projected in piece-object space, so seams line up with piece edges.
- It drives bump, with strength set per slot (`metal` low, `primary`/`accent` higher).
- Wear is a noise-masked colour and roughness mix controlled by the theme.

**Production.**
- Bake the height into a tangent-space normal map plus a packed ORM texture.
- Offer a small detail set: plate/rivet, tread, grate and brushed.
- Select the set per slot per theme.
- At runtime, use triplanar or brick-UV sampling on the voxel remesh.

**Cost.** One or two shared 512² textures in total, not per piece.

### 12.4 Decals

The data model already exists: `HullDecal` has kinds `text` / `frontier-planet`, faces `top`, `front`, `right` and `left`, a limit of 4 per part and 128 per assembly, and a shared canvas texture (`docs/hull_markings.md`). The kit adds:

- **Decal sockets on pieces.** For example, the logo cassette has a `name` rectangle, the roof logo module has an `emblem` square, and wing tops have a `number` strip. Theme decals auto-fill sockets, and players can override the text and colour.
- **Masks, not colours.** A decal is an alpha mask multiplied by a theme or player colour: rendered text, or emblems such as the planet, skull and crystal. One mask therefore serves every theme.
- **Damage.** Decals are presentation. They are clipped by the damage mask of the underlying piece and removed with destroyed cells.
- **To extend.** More emblem kinds, faction emblem sets and decal sockets on sloped faces (currently flat faces only).

### 12.5 Walls, half-height walls and pressure

Every interior cell edge has exactly one **edge type**. The pressure compiler uses edge types, never the rendered height:

| Edge type | Seals pressure | Looks like | Use |
|---|---|---|---|
| `wall.full` | yes | full-height wall | normal rooms |
| `wall.glazed` | yes | half-height wall with glass up to the ceiling | the half-wall look with a working pressure boundary (bridges, labs, observation) |
| `wall.half` | **no** | true half wall or railing | lounges, cargo decks, balconies; both sides are one compartment |
| `door.*` | yes when closed | door module | as now |
| `window.*` | yes | exterior or interior glazing | §12.6 |
| `open` | no | nothing | open-plan areas |

**Deck-view cutaway.** Separately, deck view renders every full wall cut at about 1.9 m. That is the "assume it extends to the ceiling" presentation: seen from above it looks like a half wall, but it seals.

**What the three choices mean in practice:**
1. The **cutaway** is automatic and presentation-only.
2. `wall.glazed` is the authored half-wall look that still seals.
3. `wall.half` is the honest non-sealing half wall.

**Validation.**
- A room label spanning a `wall.half` or `open` edge is one compartment.
- If the player intended two sealed rooms, the editor warns.

### 12.6 Glazing families

Glazing covers exterior faces, roofs and interior edges. Every variant uses the same frame/glass/mullion slots, with glass kept optical (§4):

| Family | Sizes | Notes |
|---|---|---|
| Porthole | 1 m | round stepped ring |
| Band window | 1–4 m wide, upper tier | mullion every 1 m |
| Full-height viewport | 2–4 m wide, floor to ceiling | transom at mid-height |
| Corner window | derived at a vertex where two glazed faces meet | vertex rule (§3.2) |
| Faceted canopy | per bow socket class | cockpit modules (§3.6) |
| Skylight | 2×2, 2×3 and 3×3 roof modules | |
| Observation dome | 3×3 and 4×4 roof modules | stepped dome |
| Curtain wall | a run of full-height viewports along a face | stations and large ships, with a vertex rule for corners |

**Glass under damage.** Each pane has entity health. The frame cells are voxels. When a pane breaks, the pressure boundary on that edge opens.

### 12.7 Hull shapes (Cosmoteer-style)

Hull cells are painted independently of the floor, as in Cosmoteer. Wings, fins and armour belts are hull cells with no floor beneath them, at any of the height classes (full deck, 1.125 m wing, 0.5 m plate).

- **Shape tiles** are data polygons (§3.3): square; 1:1, 1:2, 1:3 and 1:4 slopes (convex and concave); quarter arcs of radius 1–4 m; and chamfers.
- **Stepping.** Tiles rasterise to stepped 1/8 m bricks, so slopes and curves read as stepped voxel edges, as in the reference Aurelian curves.
- **Faces take cassettes by face class:**
  - Straight faces take the cassette packing.
  - Slope faces take a **slope skin** matched to the slope ratio (one per ratio).
  - Arc faces take an arc skin per radius.

  Only these common patterns are supported. Unsupported face combinations fall back to plain plating with trim, never a broken seam.

**Cassette packing.**
- Cassettes pack deterministically along each straight face in two tiers plus a rim band.
- Packing respects reservations for mounts, doors, airlocks and logo plates.

### 12.8 External mounts

Every external object is a mount piece on a typed hardpoint socket. Each socket declares:
- a face class: `top`, `side`, `rear`, `bottom` or `edge`
- a footprint of 1×1, 2×2, 3×3 or 4×2 m
- a size class (S, M, L)
- service ports: power, ammo, data
- a **clearance volume**: fire arc, thrust plume, dish sweep or door swing, which must be unobstructed

The r004 kit includes:
- a top turret (2×2, twin barrel)
- a side cannon (1×1 sponson)
- engines (3 m and 2 m, with louvred housings and stepped nozzles)
- a small thruster
- a tractor emitter
- a sensor dish
- a 4 m cargo bay door (an `edge` module that also forms a pressure boundary)
- a 2 m airlock

Also in scope: shield emitters, missile pods, docking clamps, mining lasers, antennas and more engine sizes. Size classes are bounded by the blueprint size class (§8).

### 12.9 Faction and variant strategy

The geometry is shared, and silhouette and character come from three cheap layers:

1. **Theme** (§12.2): colour, material, wear and lights.
2. **Decorators.** Small pieces on decorator sockets, chosen by theme: Riftjack spikes, patch plates, chains and exposed frames; Aurelian crystal spires and fins; Federation antennas and sensor masts. r004 places spikes on rim plates and wing tips (Riftjack) and crystals on roof modules and wing tips (Aurelian) without touching base geometry.
3. **Faction shape packs.** A few faction-only pieces on the *same sockets*:
   - Aurelian: curved hull arcs, crescent wing segments, spires and domes.
   - Riftjack: asymmetric scrap plates and cage frames.
   - Federation: cylindrical habitat modules and big engine blocks.

**Scale classes** reuse the same kit:
- **Fighters and shuttles** use a small-craft deck profile (roughly a 2 m pitch, cockpit-only interior), 1 m hull cells and S mounts.
- **Frigates and stations** add multi-deck stacks, curtain-wall glazing and L/XL mounts.

### 12.10 Authoring workflow (agent-friendly)

**Build each piece with the Blender kit builder**, a script or add-on:
1. Use boxes and stepped discs on the 1/16 m grid, one slot name per box.
2. Declare decal and decorator sockets.
3. Run the checks:
   - voxel alignment
   - slot names valid
   - footprint and sockets within size
   - triangle budget
   - no unsupported glass
4. Export the GLB with the 9 material slots in fixed order, plus a JSON manifest entry.

**Agents author pieces, not ships.**
- Ships and prefabs are grammar data (cells, edges, sockets and placements) that the editor and server validate.
- Themes and decals are data.
- Adding a faction means adding a theme table, decorators and optionally a small shape pack.

### 12.11 r004 assessment and next steps

**What r004 demonstrates:**
- the piece contract
- instancing (61 meshes for 657 placements)
- three-theme re-skinning on identical geometry
- tiling detail bump
- decal sockets with mask decals
- theme decorators
- external mounts and interior edge types
- lossless voxel alignment

**Next steps:**
1. Refine cassette and roof designs toward the reference density, especially the upper-tier stacks and roof greebles.
2. Add slope and arc skins and the corner-window vertex rule.
3. Add a faction shape pack, starting with Aurelian curves.
4. Export the kit as GLB plus manifest and load it in the Babylon Shipyard with instancing and the slot materials (gate P2).

## 11. Prototype iteration log

### r001 (samples 01–06)
Owner feedback, 2026-09-25, comparing `3d-rpg-after.png`, the current game, and sample 04: "I don't think we're close to being there yet, but I think you've made progress."

Gap analysis against crops of the reference:

1. Every block is its own rounded brick. The bevel highlights and grooves between blocks are the signature of the look; r001 painted seams onto flat panels.
2. The hull has deep relief: 3+ layers of protruding plates, recessed slatted vents, light boxes, framed hatches and a stepped skirt. r001 was nearly flat.
3. The palette is warm light grey, charcoal navy and muted crimson; r001 used toy primaries.
4. Partitions are cut away with thick dark caps, and door jambs are pillars with light tops.
5. Engines are boxy segmented modules, not striped cylinders.
6. Room light pools, ambient occlusion and a purple nebula.
7. Props are dense and multi-part.

### r002 (samples r002_*)

![r002 overview](shipyard_player_builder/r002_overview.jpg)
![r002 hull close-up](shipyard_player_builder/r002_hull_closeup.jpg)

**Changes, all in the same author → sample → style → mesh pipeline:**
- **Brick meshing.** The style kit assigns every surface cell a brick id. The mesher emits brick-boundary faces on the surface skin and never shares vertices across bricks, so the offline bevel rounds every brick edge. At runtime this is meant to become a brick-edge shader term (brick-local UV distance to edge) rather than extra geometry.
- **Hull modules.** Plates with 0–2 voxels of relief, inset groove panels and greebles, slatted vents, framed crimson hatches, protruding light boxes, recesses, a stepped skirt, and a rim with raised caps and lights.
- **Deck-view cut-away.** Shell at about 2.5 m, partitions at about 1.9 m. Walls have charcoal caps and wainscot bands, and derived junction/jamb pillars carry light strips.
- **Other.** Boxy engines, multi-part props, the reference palette, per-room lights, a nebula backdrop and the grading note.

**Numbers:**

| Measure | Value |
|---|---|
| Authored objects | 164 |
| Sampled cells | 1,135,629 |
| Bricks | 1,701 |
| Surface faces (before the offline bevel) | 285,824 |
| Headless build, no render | 15 s |
| Four renders | about 8 min |

**Assessment.** The hull close-up is the first result that reads like the reference's kitbash hull. The overview and interior are still well short, for these reasons:

1. **Props dominate the reference interior.** They are authored Blender models, not structure. Box stand-ins cannot close that gap; a real prop library in the reference style is needed (§4.4 and the `modular-spaceship-design-2` / `internal-components-2` sheets).
2. **The hull rim is too broad and plain from above.** The reference rim is a busy strip of small blocks and trim.
3. **Too many pillars.** Junction pillars make the interior read as a colonnade; the reference mainly lights door jambs.
4. **Scale and composition.** The reference ship is about 34 m with many small rooms; this section is 14 m.
5. **Offline lighting does not transfer to the game.** The look has to be proven in the Babylon renderer (gate P2) before more Blender tuning is worthwhile.

**Next options:**
- **(a)** Author a 10–15 piece prop set in the reference style and voxelise it through the same sampler.
- **(b)** Port the style kit and brick-edge shader to TypeScript and evaluate in-game on the real Wayfarer footprint.
- **(c)** Continue offline rim and interior-wall density passes.

(b) gives the most information per effort.

### r003 (samples r003_*)

Owner feedback on r002, 2026-09-25: "I don't really see it". It also had no plan for the front of the ship or cockpits, and none for the top-down flight view.

![r003 flight top-down](shipyard_player_builder/r003_flight_topdown.jpg)
![r003 deck view](shipyard_player_builder/r003_deck_view.jpg)
![r003 cockpit](shipyard_player_builder/r003_cockpit.jpg)
![r003 hull side](shipyard_player_builder/r003_hull_side.jpg)
![r003 engines](shipyard_player_builder/r003_engines.jpg)

**Changes:**
- **Layer stack.** Follows `modular-spaceship-design.png`: hull base, floor grid, interior walls, wall ring and roof cap.
- **Wayfarer-scale section.** 25 × 10 m floor, 36 × 12 m with engines, ten rooms and a central corridor.
- **Designed cassettes instead of noise.** Wall-ring cassettes (panel, grille, crimson hatch, light bar, stacked box, logo plate, dark) are packed along the perimeter in two staggered tiers. Roof cassettes (spine, logo, roofbox, crimson hatch, greeble, vent) are laid out over the room plan.
- **Cockpit nose module (§3.6).** Faceted canopy glass with posts and mullions, a lit sill, a glazed skylight and a bridge interior.
- **Engine modules.** Louvred tops in orange frames, crimson bands and stepped nozzles.
- **Two views (§3.7).** Flight (roofed) and deck (cut-away).

**Numbers:**

| Measure | Value |
|---|---|
| Authored objects | 284 |
| Sampled cells | 2.20 M |
| Flight mesh | 3,032 bricks, 847 k faces |
| Deck mesh | 2,126 bricks, 523 k faces |
| Build, no render | 30 s |

**Assessment.**
- The top-down composition now reads as the reference archetype: light/charcoal/crimson blocks, logo spine and engine pods.
- It is still visibly flatter than the reference. Reference roof modules are stacked 2–4 tiers high with bevelled edges and dense small greebles. Here they are single slabs with sparse detail.
- The hull side still lacks the reference's large logo panels and label decals.
- Props remain box stand-ins.

**Next.**
1. Taller multi-tier roof and ring cassettes, with the cassette library authored in Blender rather than hand-coded.
2. A decal layer for names and logos.
3. The in-engine (Babylon) test described in the r002 notes.

### r004 (samples r004_*): reusable themed component kit

Owner direction, 2026-09-25, after r003:
- "Yes build them in blender, give them more detail."
- Pieces must be swappable-material themeable, with decals and bump maps.
- Answer half-height walls against pressure.
- Add glazing variants.
- Everything must snap under rotations and sizes.
- Cover Cosmoteer hull shapes, external mounts, faction/pirate/alien ships, fighters and shuttles.

Design answers are in §12.

![r004 three themes top-down](shipyard_player_builder/r004_themes_topdown.jpg)
![r004 lineup](shipyard_player_builder/r004_themes_lineup.jpg)
![r004 federation](shipyard_player_builder/r004_federation_hero.jpg)
![r004 detail](shipyard_player_builder/r004_detail_closeup.jpg)
![r004 riftjack](shipyard_player_builder/r004_riftjack_closeup.jpg)
![r004 aurelian](shipyard_player_builder/r004_aurelian_closeup.jpg)
![r004 kit sheet](shipyard_player_builder/r004_kit_sheet.jpg)

**Numbers** (`kit_r004.json`):

| Measure | Value |
|---|---|
| Kit pieces | 59 |
| Unique meshes | 61 (22.5 k triangles) |
| Placements | 657 (three themed corvettes plus the kit sheet) |
| Voxel-aligned | all pieces |
| Build, no render | 8 s |

Detail texture and decal masks: `r004_detail_height.png`, `r004_emblem_*.png`.

**Assessment.**
- The piece contract, material-slot theming, decal sockets, detail bump and decorator variation all work on shared geometry.
- The corvette is recognisably the same hull in three factions.

**Still short of the references:**
- Cassette density: fewer large flat panels, more stacked sub-modules.
- Slope and arc skins, so slopes are not bare steps.
- A curved Aurelian shape pack.
- Cockpit canopies from r003 are not yet kit pieces.
- Interiors are not included in r004.
- Runtime proof in Babylon is still gate P2.
