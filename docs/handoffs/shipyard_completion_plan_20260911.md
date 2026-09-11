# Shipyard completion plan and acceptance contract

Date: 2026-09-11. Owner-requested implementation plan for another agent.
Status: required work; this document is not a completion or art-approval record.
Scope: the usable Creator/Shipyard, its shared construction contracts, the authored
Wayfarer template, and the authoritative gameplay connections needed to make the
authored result work. Preserve the existing cockpit appearance and player state.

## 1. Outcome and priority

A player/editor can start an empty ship, choose an editable hull-size class, draw
multiple decks, form automatic exterior boundaries, add internal walls and openings,
label rooms, choose finishes, mount exterior armor and systems, place interior
objects/cargo, connect utilities, inspect validation, publish a template and spawn
independent playable ships. The editor and game consume the same versioned design.
The existing Wayfarer is reconstructed in that system and can be edited without
undeletable legacy room/wall models fighting the semantic floorplan.

Finish this work before returning to planet generation or broad look-development.
Existing character/pose, inventory UI, login and renderer work has other owners;
coordinate narrow integration contracts and preserve their changes. Do not replace
those systems as incidental scope. The current owner authorization permits validated
implementation and deployment; final artistic sign-off on new revisions is separate.

## 2. Read and reconcile before editing

Read `AGENTS.md`, `PIVOT.md`, then these current contracts:

- `docs/ship_construction_rebuild.md`
- `docs/ship_tileset_interface_contract.md`
- `docs/authoring.md`, `docs/architecture.md`, `docs/operations.md`
- `docs/handoffs/shipyard_owner_rules_20260910.md`
- `docs/handoffs/shipyard_editor_redesign_20260910.md`
- `docs/handoffs/shipyard_wall_pressure_preview_20260911.md`
- `docs/handoffs/cockpit_boundary_variants_20260911.md`
- `docs/handoffs/wayfarer_authored_interface_audit.md`
- `docs/handoffs/coordination-current.md`, followed by the actual newest domain release records.

Read the relevant pressure, cargo, services, traversal, refit and asset handoffs
when beginning those phases. They contain historical proposals mixed with later
implementation; inspect source, registrations, tests and deployed pins before
claiming that a feature exists or is absent. Reuse implemented functionality.
The old `ship_layout_editor_design.md` remains useful background, but its original
single-playable-plane completion scope and older status descriptions are superseded.

Visual references:
`reference/art/editor-mockup-{1,2,3,4}.png` (open all four), plus the latest owner
screenshots in the conversation. Prioritize a large central canvas, compact chrome,
contextual side panels and the Systems schematic seen in the Last Starship example.
References and private handoffs must not be copied wholesale into public assets.

At takeover, record HEAD, dirty files, active owners, current native revision/hash
pins, normal game/world pair and dashboard deployment mode. The wall preview shipped
in source commits `42ae336b` and `3062d447`; these are baseline landmarks, not a request
to reset the tree to either commit. This is a shared working tree; no blanket add,
reset, clean, stale patch application or restoration over another owner's work.

## 3. Verified starting point and important gaps

| Area | Existing foundation | Work still required |
| --- | --- | --- |
| Editor | Blank/floorplan-only drafts, compact panels, shared projected viewport, layers, undo/recovery, hull envelope | Complete coherent workflows; no legacy wall/room dependence; consistent Creator theme |
| Structure | 2 m polygons, optional structural extension, partitions/openings, generated spans | Complete native adapters, joins, boundary variants, outward exterior convention, real roofs/apertures |
| Native walls | Exact installed r004 fit-preview meshes and visible unsupported-span notes | Current 125 mm envelope is centred; target exterior walls are outward. Height/profile gaps are real |
| Rooms | Informational labels; named/unnamed semantic enclosure overlay | Qualified arbitrary-layout compartments and actual pressure/door/resource integration |
| Objects | Semantic fittings plus native assembly placements | One placement contract, smaller grids, bounded fine rotation, real reservations/mates; eliminate round-trip orientation loss |
| Mounts | Source-origin grid placement, manually chosen height | Surface/socket/profile attachment with measured clearance and stable binding |
| Multi-deck | Stored decks; qualified bounded ladder/stair fixtures and server traversal paths | General supported placement and gameplay wiring; powered elevator completion |
| Services | Pure bounded 3D geometry/capacity rules in `construction-services.ts` | Editor/runtime mapping, resource/device authority and persistence; no free power/fuel/air |
| Cargo | Existing inventory/container and bounded cargo authority work | Complete cargo-grid UI and compatible supported mixed-size stacks; audit actual current release |
| Wayfarer | Pinned native 262-placement reference and authoritative starter/refit paths | Fully semantic template, corrected interfaces/lockers, glazed cockpit boundaries, navigation reservations |

Current template source `packages/content/src/wayfarer-starter-r001.json` contains
51 semantic floors and retained native parts, but no semantic partitions/openings/
room labels and no structure extension. It is not yet a complete semantic room plan.
Its deck roof flag is false while native roofs remain reference visuals. Never infer
actual vacuum or live pressure from that legacy flag alone during migration.

Current object rotation mismatch is particularly important: `LayoutFitting` uses
`quarterTurns`; native placed objects use radians; `layout-assembly.ts` rounds back
to quarter turns. Changing the UI step alone would lose orientation on conversion.

## 4. Single construction model

Implement versioned, bounded shared contracts with explicit migration. Keep source
intent, compiled geometry and runtime instances distinct. Never serialize generated
walls as ordinary equipment the user must manually delete or keep in sync.

The model must represent:

1. **Hull class:** editable, revisioned width/length/height envelope, deck limits and
   permitted reservations. Preserve the existing Wayfarer envelope as initial content;
   do not invent balance classes or material ratings. Distinguish usable structural
   limits from explicitly permitted external armor/mount overhang; validate both.
2. **Deck structure:** floor polygons, native floor styles, roof coverage/styles,
   real shaft/aperture polygons, deck datums and service voids. Default structural
   module is 2 × 2 m; subdivisions and triangular/trapezoidal/clipped shapes are real
   compatible modules. Curves need their own exact family before admission.
3. **Navigation:** walkable/support regions and explicit nonwalkable reservations,
   separate from structural floor coverage and pressure volume.
4. **Boundary graph:** stable perimeter/partition spans, joins, face finishes,
   height/variant bindings, openings, pressure/collision/damage adapters. Exterior
   boundaries follow the floor union; deleting them directly is disallowed.
5. **Room labels:** names/types/appearance/informational access design linked by
   containment, independent of physical pressure compartments and actual permissions.
6. **Equipment/armor:** stable placed IDs, pinned asset definition/revision, explicit
   placement anchor/orientation, reserved body/support/access/swept volumes, mount
   bindings, functional ports and damage policy.
7. **Cargo grids:** permitted area/height, cell and support interfaces, occupancy,
   stack graph and container compatibility. Physical cargo and inventory contents
   are separate authoritative domains.
8. **Utilities:** typed 3D routes, functional ports, explicit junctions, risers,
   sealed feedthroughs, rated capacity, source/storage/consumer definitions.
9. **Traversal/docking:** deck links, real openings, landings, stairs/ladders/lifts,
   external airlock and docking attachment contracts with supported behavior.

Derive wall IDs from stable source lineage plus exact spans, not mesh-array order.
Handle splits/merges with explicit remapping of finishes, openings and attachments.
A changed floorplan must not silently detach a reactor, delete a door or move cargo.
Report conflicts and apply the complete accepted edit atomically.

## 5. Geometry, walls, cockpit and roof

### Floorplan and automatic structure

Painting/erasing the floorplan recomputes outer/inner boundaries, floor visuals and
roof coverage. Shared edges disappear; concave outlines and real holes remain.
Generate visible native walls immediately in 3D. Missing compatible models must
produce actionable diagnostics and an asset task, not an unrelated stretched box.
Floor/roof finishes can be replaced per tile without deleting structural coverage.
Distinct layer visibility must never change simulation support or sealing.

### Wall convention and openings

- Exterior wall body/trim occupies an **outward reservation** from the usable floor
  boundary. Only qualified bearing contact may extend under the structural slab.
- Internal partitions straddle their graph line and reserve their actual thickness;
  usable space/placement checks must account for that strip.
- Draw partitions on supported grid edges/intersections, not tile centres. Support
  exact diagonal families where they meet the structural polygons. Fine object grid
  settings must not relax wall geometry rules.
- Implement straight/end/convex/concave/diagonal/T/cross junctions and matching roof
  interfaces, avoiding duplicate faces and z-fighting. Independent face panels share
  consistent thickness and inward/outward conventions.
- Doors attach to boundary spans, aligned at wall-slot midpoints, with finite allowed
  widths and authored corner/jamb setbacks. Reserve leaf sweep, approach space and
  lintel. Do not use a generic offset to force a frame into a corner.
- Door removal closes the boundary using a compatible wall variant unless the user
  explicitly chooses an open passage. Windows are not open passages.

### Preserve the cockpit

Use explicit opaque, glazed-cockpit and doorway boundary variants. Wayfarer's
existing low sill + swept glazing + frame is the target, not a full-height opaque
wall behind a decorative windshield. A low sill alone is not an airtight boundary.
Retain the exact source/material/placement pairing described in the cockpit handoff:
base placements at Z 0.1875 m; glazing begins at Z 1.3125 m; straight sill height
1.125 m. These are current model dimensions, not a universal half-height-wall rule.

Map straight, diagonal and nose variants onto exact semantic boundary spans; suppress
only the opaque geometry they replace. Preserve buttresses, rear partition/doorway,
roof collars and their intended roles. A mesh near a wall is not an automatic seal.

The two bow triangle records and exterior cheek armor are distinct. Map the owner's
nonwalkable corners explicitly. Preserve required support/enclosure beneath them;
use navigation reservations instead of deleting structural polygons and accidentally
creating a stepped cockpit outline. Retain diagonal modules for other ship designs.
Validate the actual body/head clearance under inclined glazing, not just foot support.

### Asset work

Start from the art-library workflow, preserve Blender sources, and pin exports.
Complete missing outward-wall, diagonal, junction, sill/glazing/frame, floor/roof,
opening and armor spacer/mate families needed by the admitted designs. Do not assume
an uninstalled a009 or a higher-numbered file is approved. Existing r004 centred walls
are an explicitly limited preview, not the finished outward kit.

Every part declares nominal geometry, full export reservation, origin, datums,
connection profiles, collision/support/pressure/damage proxies and material roles.
An intended 2 m reservation cannot contain a 2.04 m export. Smaller/irregular furniture
is allowed; all closed geometry must fit its own reservation. Motion uses a separately
validated swept envelope. No silent GLB scaling, visual recentering or per-placement
nudges to hide authoring mistakes. Create precise asset requests early when models
are missing, and continue independent implementation while those are authored.

### Required shared tileset specification and Blender subagent contract

Before new geometry is built, implement a versioned machine-readable interface
specification in `packages/content` and a human-readable authoring guide generated
from it. Suggested deliverables: `ship-tileset-spec.ts`/versioned JSON plus
`docs/ship_tileset_authoring_requirements.md`; choose final names after checking
existing contracts to avoid creating a competing source of truth. Extend the
existing tileset contract rather than inventing a second dimensional system.

Every native design/revision must reference the exact specification version/hash.
Validate the **exported** meshes as well as Blender source objects; unapplied scale,
mirror transforms, multiple GLB primitives or child nodes cannot evade containment.

| Family | Required dimensional and connection contract |
| --- | --- |
| Floor | Exact closed nominal XY polygon and winding; 2 m structural module or declared subdivision; source pivot; bottom, bearing and walk-top datums; full body reservation; perimeter interface for every edge; separate navigation mask |
| Roof | Corresponding footprint family; underside, structural top and decoration envelope; connection to wall tops; apertures/edge closure; clearance to next deck's floor/service void |
| Opaque exterior wall | Directed interior usable plane, outward normal, complete outward reservation, chosen thickness, base/top datums, straight/angled run lengths, end cutbacks and compatible corners; declared bearing/seal patches |
| Internal wall | Directed grid centreline, thickness/trim reservation on both sides, independent face-panel sockets, opening/junction variants and intersections with exterior structure |
| Glazed wall/cockpit | Low sill height, pane/frame envelopes, glass inclination, corner and roof mating profiles, complete closed seal coverage and standing-body clearance; solid/window/open-passage roles distinct |
| Hull/armor | Actual inside mating surface/profile, wall-to-armor spacer if required, permitted outward extent, overlap/contact patches, handed transition pieces, roof/corner/end attachments and damage representation |
| Door and frame | Finite clear widths/heights, matching wall thickness/family, jamb/lintel/sill dimensions, exact opening-slot anchor, corner setbacks, opening direction, leaf sweep/pocket reservation, threshold support, closed seal and open clearance |
| Airlock | Complete chamber reservation and volume, two compatible independently identified openings/doors, service ports, approach/egress spaces, external attachment/docking plane, chamber roof/floor closure and interlock capability |
| Stair/ladder/lift | Exact rise/datums, true floor/roof shaft apertures, tread/car/support and standing clearance, landings/guards, mount interfaces, allowed transforms and supported traversal adapter |
| Equipment/cargo | Complete default body reservation, support/contact patches, model-to-placement frame, permitted orientations, operational sweep/access space, rated stack/load interface where supplied, ports/mounts |

The specification must declare units and coordinate frames explicitly: metres in
Blender with applied transforms; 32 lattice units/m in structural authoring; source
XY is ship plane and source Z is height; renderer mapping is X/-Z with Y vertical.
The structural square is 64 lattice units per side. Floor support currently uses a
0.1875 m top datum, but every interfacing family must pin its exact datums rather
than inherit an undocumented global offset. Deck spacing must include roof thickness,
service space and the next floor; do not equate clear room height with deck pitch.

Do not choose wall thickness from a screenshot. Define it in the interface family,
check the complete interior/exterior reservation and author matching door jambs,
glazing frames, roof edges and armor adapters. Current centred r004 125 mm decorative
envelope and the draft 250 mm outward candidate are different families; they cannot
be treated as interchangeable without a measured adapter. Source geometry remains
unaltered until a deliberate new revision is authored and qualified.

For each edge/mount record at least:

- Stable family/profile/connector ID and revision, local endpoints/plane, direction,
  opposing mate normal, thickness/height interval and end/junction cutback.
- Exact compatible partner families, permitted rotations/reflections, handedness,
  partial-edge joins and any required intermediate adapter.
- Separate visual, bearing/support, collision, seal, damage, access and service
  contact regions. A socket does not certify all of those roles.
- Full closed-state reservation and every supported animated swept reservation.
- Analytic nominal seam requirement, measured export tolerance and test method.
  Nominal interfaces must coincide exactly in the shared coordinate contract.
  Record tight, justified export tolerances explicitly; do not enlarge tolerance
  to excuse authored gaps, intrusions or inconsistent snapping.

Build a compatibility matrix and executable conformance fixtures from that spec.
Required fixtures include square-to-square, square-to-triangle, complementary
triangles, trapezoid/strip joins, unequal-length subdivisions, convex/concave/diagonal
corners, T/cross junctions, wall-floor-roof stacks, mirrored pairs, door/frame/corner
setbacks, low-sill/glazing/roof closure, armor spacers/shoulders, and complete airlock
chambers. Include supported fine-angle equipment placement beside those structures.

Visual bevels may retreat from a nominal seam only when the specified backing/profile
preserves required closure. Intentional service gaps and armor seams must be declared;
undeclared visible cracks, coplanar z-fighting, floor intrusion, glass/frame holes and
unsupported contacts fail. Test both sides of every connection and transformed pair.
Perturb origins, dimensions, height, winding and socket normals in negative tests;
the validator must reject those cases with the offending asset/interface IDs.

The integration agent can give a Blender specialist a request consisting of:

1. Required family/shapes and exact specification version/hash, dimensions, pivots,
   datums, allowed transforms, material roles and compatible mate IDs.
2. Pinned existing source revisions to preserve or revise, reference crops and visual
   identity constraints (especially Wayfarer cockpit and faction hull appearance).
3. Required deliverables: editable `.blend`, native material-preserving GLB/textures,
   interface metadata, separate occupancy/collision/seal/damage proxies where needed,
   hashes, per-shape and assembled seam renders, and executable validation results.
4. Clear file ownership and handoff boundaries: specialist authors/validates; parent
   integrates catalogs/loaders/authority and publishes the exact reviewed candidate.

Use the Blender modeling skill and relevant repository art workflow. Independent
families may be delegated in parallel after dimensions are frozen. A dimensional
change must version the shared specification and notify every dependent owner;
never let two subagents privately choose incompatible heights or wall thicknesses.
Audit returned exports independently. If dimensions pass but assembled surfaces look
wrong, iterate before claiming completion. New art revisions retain explicit owner
sign-off status; keep approved historical files and live instances intact.

The final qualification test is reuse: an agent can create a second visual/faction
kit from the specification alone, and it assembles the same supported floor/wall/
roof/door/airlock fixtures without hand-tuned placements or editor-code changes.

## 6. Smaller object grid and finite rotation — required new feature

These are implementation defaults chosen for this plan, editable as bounded editor
preferences. They do not change the structural lattice or grant all orientations to
all assets.

| Placement mode | Allowed UI values / rule | Default |
| --- | --- | --- |
| Structural floor | Compatible 2 m modules and explicit subdivisions | 2 m |
| Internal walls | Current supported 0.5, 1, 2 m graph grids plus qualified boundary diagonals | 0.5 m |
| Interior object position | 2, 1, 0.5, 0.25, 0.125, 0.0625 m | 0.25 m |
| Optional precision position | 0.03125 m (1/32 m), in advanced controls | Off |
| Object rotation step | 90°, 45°, 30°, 15°, 5°, intersected with asset/mount capability | 15° where supported |
| Cargo/mount/structural rotation | Explicit compatible orientations; commonly 90° | Definition-driven |
| Vertical placement | Supported floor/shelf/mount datum; qualified stacking levels or route layers | Active support datum |

Use a finite orientation representation, for example a `yawStep` integer 0…71 on
a 5° base, normalized modulo 72. Offer clockwise/counterclockwise controls, R/Shift+R
and a snapping rotate gizmo. Numeric angle entry must resolve to a permitted finite
angle and display the accepted result. No unbounded accumulated turns, arbitrary
floating input, NaN/Infinity or free-spin persisted orientation. A 45° step advances
nine base steps; 30° advances six; 15° three; 90° eighteen.

Assets declare permitted yaw steps and reflection/handedness; unsupported orientations
remain unavailable with an explanation. Existing unqualified parts may keep their
previous qualified quarter turns while missing fine-angle support is implemented.
Complete at least one real furniture asset's full fine-angle support in the final
acceptance, rather than shipping controls that disable all useful choices.

Migrate semantic quarter-turn fittings to an exact new orientation contract and update
all consumers: compiler, validator, assembly conversion, preview, source export/import,
blueprint hashing, server installation/refit, collision, interaction anchors, sockets,
cargo checks and gameplay renderer. No rounding fine angles back to quarter turns.
Keep old drafts byte-preserved until explicit migration. Legacy arbitrary-radian
placements must not silently snap on read; retain them as legacy/unresolved if they
cannot be represented exactly, then show a proposed conversion and displacement.

Fine yaw rotates equipment reservations continuously about their declared anchor.
Do not round transformed corners back to lattice vertices: most 5°/15° rotations are
not lattice-preserving. Keep integer translation anchors and finite orientation IDs;
use shared deterministic transformed-volume rules with documented tolerances. The
exact polygon floor/wall compiler remains unchanged by furniture rotation. Validate
containment, full wall/ceiling clearance, support contacts, access/sweep and ports in
the rotated frame. Negative coordinates, symmetry and mirrored sockets need tests.

Changing snap preferences must not move existing objects. Drag, nudge, duplicate,
keyboard rotate, numeric edit and gizmo all use one command path. Commit a gesture as
one undo operation. Show the preview anchor, angle and invalid-contact reason. Floor
objects cannot float because a height field accepted a number. Exterior components
snap by compatible mount plane/profile; source-origin grid remains an explicitly
unqualified fallback for inspection, never an assertion of a valid attachment.

Persist preferences per editor user/workspace, separate from canonical placements.
Server validation enforces allowed transforms even if a client bypasses the UI.

## 7. Workspace and interaction

Use one consistent Creator theme across routes, with shared tokens/components.
Keep a compact global header/document bar and contextual Structure, Rooms, Objects,
Hull, Systems tools. Maximize canvas area; side palettes and inspectors collapse,
resize and remember layout. Keep Focus canvas and keyboard exit working.

Maintain a shared camera target/zoom/orientation between relevant tabs. Entering floor,
wall or route editing may transition to the appropriate orthographic top/deck plane
and hide unrelated layers, as requested; preserve the prior 3D camera and explicit
layer overrides so returning does not reset the view. Overlay and native scene must
remain aligned through orbit, zoom, DPI, resize and deck changes. Side/front/3D are
available for mounts, risers, height and roof inspection.

Select an existing object using one thicker silhouette outline around the complete
model, without duplicate ghost meshes, internal-edge tracing or screen flashes. In
Systems mode replace detailed equipment visuals with outline footprints, names and
functional port markers. Active placement may use a restrained valid/invalid preview;
selection must not create another model. Generated walls/floors are edited through
structure/finish tools, while fittings/armor remain independently selectable entities.

Rooms can be added, renamed, relabelled and removed without deleting enclosure or
objects. Pressure overlay includes unnamed areas; distinguish design topology,
qualified seal coverage and live pressure/O2 status. Do not display simulated gas
values for a local draft. Show leaks, open passages, closed/open doors, airlock
chambers and unqualified faces distinctly. Room access labels do not grant server
permissions.

A new design must start genuinely empty. The fully converted Wayfarer must load as
editable semantics, with a separate retained reference preview only when requested.
Provide clear draft/save/validation/publish/spawn/capture/refit actions and status.
User errors should identify and focus the affected geometry instead of surfacing IDs
without context. Keep dependency/asset-loading errors recoverable and avoid claiming
ready while required models are still pending.

## 8. Gameplay integrations required for completion

### Multi-deck and traversal

Use real deck IDs/elevations, native floor and roof openings, supported landings,
stairs, ladders and elevators. Reuse registered fixture adapters but generalize only
after their placement/height/clearance contract is validated. Stairs use ordinary
movement with server-derived support/elevation, stop/reverse and safe transitions.
Elevators require car position, shaft/landing doors, interlocks, power, reservations,
passengers/cargo and defined interruption/recovery. A button changing deck is not
traversal. Test occupied thresholds, blocked landing, power loss and reconnect.

### Doors, pressure and airlocks

Generalize actual qualified boundary coverage into deterministic compartments; closed
doors seal, open passages/doors connect, breaches vent connected volumes. Include
ceilings, real shafts and glazing. Couple doors and airlocks to finite gas, pumps and
power through existing authority rules. External airlock must support safe ingress/
egress and its chamber/interlocks; an asset named airlock-frame is not an airlock.
No fresh oxygen or charge appears on load/reconnect. Keep rendered cutaway unrelated
to pressure. Persist gas/door/chamber state and test isolation between adjacent rooms.

### Utilities and mounted systems

Implement power, fuel, coolant, data and ventilation end to end. Under-floor paths,
wall risers and cross-deck routes need real 3D clearance and sealed feedthroughs.
Crossing lines do not connect without a junction. Link functional ports on engines,
thrusters, reactor, storage, life support, lights and supported devices. Unknown
capacities stay unknown; named lines do not make a device operational. Reuse the
bounded conserved-capacity solver, with atomic withdrawals/deliveries and explicit
resource units. Implement minimum real operating behavior for admitted devices;
record future detailed electrical/fluid/thermal physics separately.

External engine/thruster/scanner/turret/weapon/tractor/missile/docking placements need
compatible mounts, body/sweep/exhaust/arc clearance and service interfaces. Provide
catalog/schema support for these families; unavailable gameplay/art must be visibly
unsupported rather than fabricated. At minimum exercise real installed propulsion,
a functional service consumer and the entry airlock in the completed Wayfarer.

### Cargo and inventory

Designate cargo-only grid regions. Container body sizes need not equal the structural
module, but supported nominal packing/support surfaces must match declared subdivisions.
Validate room/roof height, oriented support patches and center-of-support/load rules.
Required mixed stack: four compatible 1 × 1 footprints on one 2 × 2 support, then
another compatible 2 × 2 above them, if the exact interfaces and load definitions
permit it. Prevent floating, partial unsupported contact and removing a supporting
container without resolving its dependants. Do not fake this with bounding-box overlap.

Preserve cargo container/item UUIDs and inventory contents through moves/refits.
Solid storage exposes authorized inventory; fluid containers retain their separate
resource behavior. Spawned templates allocate new empty/runtime-defined contents
according to approved spawn rules, never copy another ship's live inventory or fuel.

### Collision, damage and rendering

Local walking collision uses qualified structure/equipment/body clearances; glazed
cockpit and lockers must match the rendered installation. Ship-to-ship collision uses
a coarse planar hull proxy/broad phase, not detailed furniture/voxel triangles.
Other ships render exteriors only, with an appropriate exterior-window treatment;
do not load/render all their interior equipment/lights. Preserve current optimization
work, batching, selection identity and bounded lights; measure regression costs.

Retain the owner damage split: structural walls/floor/roof/hull/armor and supported
external components use separate localized voxel damage representations; interior
beds/chairs/lockers/reactors/hydroponics/containers use entity health and later damaged
art states. Damage policy belongs to the definition, not its current location.
Native Blender visuals remain the visual source. Structural breaches must eventually
change visible surface, collision and enclosure together through authority; do not
claim destruction complete with a boolean or preview-only voxel volume. For this
completion gate demonstrate one real structural breach and pressure response, and
an interior equipment health transition preserving inventory identity.

## 9. Authority, persistence and migration

One authoritative SpacetimeDB database; shared pure geometry/rules in `packages/sim`,
content/interfaces in `packages/content`, server adapters in `packages/world`, transport
in `packages/net`, GPU in `packages/render`, composition in separate apps. Use package
exports and extract focused modules instead of growing entrypoint monoliths.

Dedicated Dastari Keycloak remains `https://auth.dastari.net/realms/dastari`; separate
public PKCE clients for dashboard/game. Private tables by default; permitted views
must restrict rows and columns. Subscription filters are not authorization. Preserve
current shared-world membership/discovery architecture and generated binding ownership.

Keep these four actions distinct:

1. Save an editable draft (local recovery plus authorized durable storage).
2. Publish an immutable blueprint revision with exact dependencies and validation.
3. Spawn an instance, allocating new IDs for every live fitting/container/door/link.
4. Capture authorized live state or refit an existing instance through separate commands.

All mutating authority uses operation IDs, expected revisions, permissions, bounded
inputs and atomic receipts. Check permission before replay acceptance. Refit must
conserve characters, inventories, item/fitting/container IDs, hotbar, appearance,
resources, occupied seats and supported actor positions; explicitly resolve displaced
or removed objects. Do not migrate every legacy ship automatically on login.

For Dastari's already converted live ship, inspect the current authoritative identity
and revision rather than assuming a username uniquely selects a record. Prepare a
before/after conservation report and dry-run refit. Do not replay an old full assembly
snapshot over newer player edits. Publish the rebuilt Wayfarer as a new immutable
revision; preserve old templates and draft bytes. New spawns must have no shared
mutable contents, pressure, energy, damage or device state.

Prevent write amplification: compile topology/routes when dirty, write changed rows
only, retain subscription handles, and use current indexed/authorized projections.
Bound document bytes, vertices, entities, route work and simulation work. Small edits
must not retransmit giant unchanged asset documents. Versioned GLB/material assets
are fetched/cached separately from authoritative state; preserve the loading barrier.

## 10. Ordered execution and ownership

Create `docs/handoffs/shipyard_completion_progress.md` with one row per deliverable:
owner, files, source pins, current state, check/evidence, next action and blockers.
Keep it current after each milestone. Do not mark an entire phase complete because
one fixed fixture passed. Do not stop after writing another proposal.

| Phase | Deliverable | Exit gate |
| --- | --- | --- |
| 0 | Current-state audit, owner/file map, approved asset gaps and migration plan | Reproducible baseline and explicit current-vs-needed matrix |
| 1 | Versioned semantic contracts, navigation reservations, boundary variants, finite placement transforms | Migration and pure geometry tests; no fine-angle round-trip loss |
| 2 | Native interface qualification + generated floor/wall/roof/cockpit assembly | Square/diagonal/taper/T/cross/opening fixtures render and fit; no opaque cockpit duplicate |
| 3 | Coherent Creator UI, smaller snap/rotate, Rooms/pressure display, mounts and editable template path | Real browser blank-to-layout and reopen/edit proof at desktop and smaller viewport |
| 4 | Qualified multi-deck traversal, doors/pressure/external airlock | Actual game movement/cycling, interruption and persisted state proof |
| 5 | 3D utilities, cargo grids/stacks, supported device integration | Resource conservation and stacking/removal tests; real game demonstrations |
| 6 | Rebuilt semantic Wayfarer, coarse collision/render integration and damage example | Two independent spawns, editable capture, state-conserving refit and breach proof |
| 7 | Combined release, multiplayer/restart, performance and final visual review | Exact tested artifacts activated; acceptance checklist and honest residual limitations |

Asset work should begin during phase 1 so it does not wait for UI completion. UI and
pure-rule work may proceed in parallel after shared contracts are agreed. One owner
controls catalogs, renderer/client entrypoints, world schema registration, generated
bindings, template assembly and release activation. The owner explicitly authorizes subagents for implementation, including Blender
geometry repairs and missing model families. Assign bounded file-owned tasks and
review their results. Asset specialists may correct walls, floors, roofs, hull/armor,
doors, airlocks, windows, mounts and equipment where interface validation exposes
defects. Do not have multiple agents rewrite shared entrypoints, overwrite the same
Blender source or publish independently. The integration agent owns acceptance and
activation; asset authoring permission is not automatic final art approval. Coordinate the single software-GPU
browser slot, use a named session, and blank/close it when done.

## 11. Concrete final acceptance suite

1. **Empty design:** choose/edit hull class; draw rectangle/triangle/trapezoid decks;
   erase/repaint; visible outer walls/roof update; invalid limits and overlaps reject.
2. **Wall/door family:** orthogonal and diagonal joins, T/cross/concave nodes, opposing
   face finishes, corner setbacks, multiple door sizes, door removal/closure and a
   glazed cockpit boundary without full-height duplicate geometry.
3. **Furniture controls:** actually place an admitted object at 0.25, 0.125 and
   0.0625 m grids; rotate at 5°,15°,45°,90°; rotate through 360° and back without drift;
   negative coordinates, reflection, nudge, copy, undo/redo, save/reload, export/import,
   publish/spawn and capture preserve accepted transforms. Illegal asset angles and
   wall/ceiling/support penetrations reject on client and server.
4. **Layout identity:** room label deletion leaves walls/pressure unchanged; bow
   walking reservations preserve cockpit structural silhouette; six legacy locker
   intersections are resolved by valid interfaces, with no invented hidden offsets.
5. **View continuity:** every tab shares alignment; temporary editing projection and
   layer choices restore predictably; resize/DPI/orbit does not shift picking; no
   selection flash, duplicate mesh or recreated viewport/asset library per click.
6. **Multi-deck:** real ordinary walking up/down stairs, stop/reverse, safe ladder,
   powered elevator/landing interlocks, occupied/obstructed destination and reconnect.
7. **Pressure:** adjacent named and unnamed compartments; open/close door changes
   connectivity; external airlock cycles; missing roof/breach vents only connected
   volume; transparent sealed window is not a passage; finite gas survives restart.
8. **Services:** all five channels, underfloor + wall riser + cross-deck feedthrough;
   mismatched ports/capacity/clearance reject; severed supply affects actual consumer;
   source and destination balances conserve across retry/reconnect/restart.
9. **Cargo:** compatible mixed-size stack and height limit, non-cargo rejection,
   support removal policy, solid-container inventory, resource-container distinction.
10. **Shared world:** two accounts see permitted same-world ships; two template spawns
    have disjoint mutable identities/state. Concurrent edits conflict safely; denied
    access, repeated commands and actual server restart preserve authoritative state.
11. **Migration:** Dastari's before/after items, containers, crew, appearance, hotbar,
    fuel, weapon energy and fitting identities are reconciled with receipts; old
    blueprints and unsupported drafts remain recoverable.
12. **Performance/damage:** coarse ship collision; remote interiors/lights suppressed;
    structural breach/collision/pressure effect and separate equipment health effect;
    measured CPU/GPU/draw counts against a comparable multi-ship baseline.

Run focused tests per phase, then `npm run check`, `npm run build`, relevant format/
lint and Python checks, `npm run art:check`, native fitting validators and authority
smokes through managed scripts against an isolated database. Use existing domain smoke
entrypoints where applicable; add missing meaningful integration scenarios. Run
`art:voxels` if the existing voxel pipeline changes. Browser-review both dashboard
and actual game using exact candidate assets. Mock-only and numerical-only proofs
are insufficient; save screenshots, timings, operation receipts and conservation
summaries with private data outside public artifacts.

Deploy only the tested compatible combination through `scripts/dev.py`/managed npm
release paths. Preserve independent dashboard/client/world build and release boundaries;
never start the old Rust stack or change Orchard. Record actual source/artifact hashes,
installation order, rollback compatibility and deployed URLs. Verify fresh normal OIDC
entry and existing-player continuity after activation. Carry owner deployment permission;
do not manufacture final approval for new art or weaken a validator to pass a release.

Final handoff must enumerate implemented, browser/game verified and deployed outcomes
separately from any unsupported family. If a required native asset is missing, deliver
its exact authoring/qualification request and continue other work; that missing asset
remains an open acceptance item. Do not call the whole Shipyard complete until the
required supported paths above work end to end.
