# Ship, room and station layout editor
> **2026-09-09 owner scope update:** The full multi-deck construction system, pressure/airlocks, separate armor, supported cargo stacks, 3D services, matching roofs and complete spawnable Wayfarer rebuild are now required after auth and character/rig integration. See [the superseding construction plan](ship_construction_rebuild.md). Earlier one-playable-deck limits below describe the initial implementation, not the new completion goal.

Status: Proposed implementation design requested by the owner. This document does not implement the editor or mark a construction milestone complete.
Date: 2026-09-08
Scope: The independent authoring dashboard, its shared layout compiler, and future validated blueprint/refit authority.

## Purpose and governing contracts

Build a top-down layout designer in which an author draws a usable floor plan, divides it into rooms, installs equipment, routes services, and applies a separate exterior identity. The same document model supports a small ship or a bounded station module. The primary result is a versioned, validated design, not a screenshot or a mutable copy of live world state.

Read [PIVOT](../PIVOT.md), [ship construction](ship_construction.md), [authoring](authoring.md), [architecture](architecture.md), [scripting lifecycle](scripting_lifecycle.md), [authentication](authentication.md), and [Blender migration](blender_asset_migration.md) with this document. Their authority and asset rules remain in force. Earlier reference engines, graph persistence and shard designs are not implementation dependencies.

An author may propose local design coordinates in a draft. A browser never commits live transforms, inventory balances, grants, pressure or utility state directly. The server compiles and validates a requested refit, then commits the resulting authoritative changes atomically. Camera motion and preview animation have no authority.

## Reference review and translation

All four supplied images were visually inspected at full size. They are concept references, not proof of existing features or approved numerical stats.

| Reference | Observed design cues | Implementation interpretation |
| --- | --- | --- |
| [Mockup 1](../reference/art/editor-mockup-1.png) | Large orthographic deck canvas, left deck list and structural tile thumbnails, right placement inspector, dimension ruler, deck miniatures | Make the floor plan the dominant workspace. Use real asset thumbnails, explicit active deck and measured dimensions. Derive walls from topology rather than placing a wall around every tile. |
| [Mockup 2](../reference/art/editor-mockup-2.png) | Side elevation, top-view navigator, hull/armor/marking palette, faction variants and independent color channels | Provide orthographic elevations and an optional 3D preview for exterior work. Skin selection cannot change pressure geometry or gameplay stats implicitly. Reference armor/HP values and faction names are illustrative, not production definitions. |
| [Mockup 3](../reference/art/editor-mockup-3.png) | A selected lounge outlined as one room, room types, furniture palette, corridor path overlay and access inspector | Room selection aggregates member faces and partitions without losing tile identities. Show validated navigation/clearance overlays. Labels such as “breathable” or occupancy counts require actual simulation or must be explicitly marked design assumptions. |
| [Mockup 4](../reference/art/editor-mockup-4.png) | Underfloor colored routes, distinct junctions, reactor/engine ports, typed legend and actionable diagnostics | Routes are explicit typed graph edges. A line crossing another line is not automatically a connection. Show computed design estimates separately from live measurements. “Simulate systems” remains unavailable until its bounded preview solver exists. |

The recognizable feature should be the ship plan with readable layers and meaningful colored routes. Keep surrounding chrome restrained; do not turn the inspector into a wall of glowing metric cards. The reference engine exhaust is decorative in a design view and defaults off unless an author explicitly starts an isolated preview.

## Current implementation audit

This is a source audit at the date above. Re-audit the named files before implementation because other agents are actively working in the repository.

| Area | Actual support | Missing for this design |
| --- | --- | --- |
| Dashboard | `apps/dashboard/src/App.tsx` composes an independent React application; `shipyard/AssemblyEditor.tsx` loads the part catalog and Wayfarer assembly, offers selection/movement/copy/rotate/flip/delete, category visibility, local history and JSON export | Topological floor plans, deck model, semantic room editing, service routing, server draft storage, publication/refit/capture workflow |
| Draft identity and recovery | `sidereal.assembly-draft.v1` has document ID, name and placed parts. Each part has its own ID, asset ID, local position, rotation, reflection and damage-preview cells. Local history stores up to 40 states and preserves unsupported saved data | Current browser key `sidereal.assembly.draft.v1` is not account/document/live-entity scoped. No authoritative collaborative document revision, conflict resolution or durable draft service |
| Placement rules | `packages/content/src/assembly.ts` validates at most 2000 parts, finite positions, unique IDs, quarter-turn placement and separate sampled occupancy. Existing snap is 1/32 m | Polygon edge union, manifold validation, authoritative mounting, compartment formation and typed installed services |
| Visual assets | Native Blender hull/equipment manifests and loader paths exist alongside legacy placement/proxy data. Authored surfaces and separate occupancy references are retained | Complete interchangeable polygon floor/perimeter/door/roof kit, all faction skins, utility fittings and docking families; current assets must not be relabeled as that complete kit |
| World authority | `packages/world/src/index.ts` exposes private fixture views and validated movement, helm, rename, inventory, interaction and bounded handheld combat actions | No layout draft/publish/refit/capture reducers or normalized construction aggregate. Existing `renameShip` revision receipts are a useful pattern, not a refit implementation |
| Working fixture domains | Real actuator allocation, persistent item/container instances, couch seating and hydroponic toggles exist. Handheld combat owns aim/energy/cooldown only | Installed reactor/power/fuel/heat networks, hull damage/pressure, general doors/airlocks, docking, installed turret combat and ship cargo-bay occupancy |
| Scripting and access | Typed lifecycle contracts/tests exist; private authority views are used by the lab | General behavior execution/editor, production OIDC integration, dashboard authoring capabilities, shared crew admission and other-player projections remain staged |

The existing private lab per identity is not a shared multiplayer shipyard. See [multiplayer status](multiplayer_status.md). The editor must not advertise multiplayer collaboration or production authentication merely because it uses SpacetimeDB.

## Workspace and reusable UI

Use `apps/dashboard` for composition, `packages/ui` for reusable React widgets, and shared render/content/simulation packages for their respective responsibilities. Do not import the gameplay app or copy its canvas inventory window implementation into the dashboard.

Prefer the existing shared dashboard tokens and components; the following is a reference-matching palette proposal only where those lack a role, not a gratuitous reskin. Proposed visual tokens: deep navy canvas `#071923`, panel `#102B39`, quiet divider `#2B5265`, near-white text `#E3F3FA`, cyan selection `#45D8F5`, amber diagnostics `#F4B95F`. These are design defaults, not mandatory new global tokens. Reuse the installed Barlow and Barlow Condensed families: ordinary UI/body text in Barlow, compact section titles in Condensed; numeric units remain readable at normal UI sizes. Selection gets one bright contour; passive borders stay quiet. Reserve red for invalid/destructive states, not ordinary faction accents.

Desktop composition, approximately 1440 px wide:

```text
┌ Project / document / Draft or Live reference ─ Save draft ─ Review changes ┐
│ Workspaces │ Structure  Rooms  Objects  Hull  Systems │ Top / Side / 3D   │
├────────────┬───────────────────────────────────────────┬─────────────────┤
│ Decks      │                                           │ Inspector       │
│ Deck A     │         Orthographic editing canvas       │ selected entity │
│ Deck B     │         grid / ruler / local axes          │ real dimensions │
│            │         selection / handles / overlays    │ typed settings  │
│ Palette    │                                           │ ports / mounts  │
│ search     │                                           │ Layers tab      │
│ filters    │                                           │                 │
│ thumbnails │                                           │                 │
├────────────┴───────────────────────────────────────────┴─────────────────┤
│ Active deck • grid • tool hint │ Validation: 2 errors │ Fit │ 3D preview  │
└─────────────────────────────────────────────────────────────────────────┘
```

Default left rail 272 px and inspector 304 px, resizable and collapsible with minimum canvas width 480 px. The searchable icon-first palette may detach into a resizable floating window. Do not duplicate its entire list in project navigation. Below 1100 px use one open side drawer at a time; below 720 px provide an honest inspection/light-edit layout with full-screen canvas tools and a bottom inspector, rather than squeezing three columns. Preserve keyboard access to operations hidden in drawers.

Reusable components: `EditorShell`, `DocumentStatus`, `ModeTabs`, `DeckList`, `AssetPalette`, `AssetCard`, `ViewportToolbar`, `LayerTree`, `PropertyField` with units/errors, `PortList`, `ValidationList`, `CommandBar`, `ReviewDiff` and accessible `ConfirmDialog`. Names describe proposed responsibilities, not required exports. Use a common loading/error/empty/recovery pattern. The asset loader must allow missing thumbnails/GLB to show metadata and diagnostics without destroying the draft.

Mode behavior:

| Mode | Canvas and palette | Inspector and validation |
| --- | --- | --- |
| Structure | Rectangle/triangle/trapezoid tile stamps, line/area fill, perimeter and roof overlay | Shape dimensions, snap, mirror axes, selected tile IDs, union errors |
| Rooms | Partition drawing, door openings, room selection, corridor/accessibility overlay | Room name/type, floor/wall themes, intended use, opening membership; computed area |
| Objects | Equipment and cargo-bay placements with support/clearance ghosts | Installed definition, mount, collision/approach/exhaust zones, supported parameters |
| Hull | Outer shell, armor attachments, trims, decals; top/side/front/back projections | Pinned faction kit, material roles, socket/variant, authored mass where defined |
| Systems | Muted floor plan, underfloor routing plane and typed channels | Port compatibility, junctions, route capacity, design connectivity and solver diagnostics |

“Orthographic” is a view control rather than a competing semantic mode. Match the reference's elevations while avoiding two separate places to edit the same hull. A deck overview is a low-cost cached thumbnail; do not keep a WebGL scene rendering for every deck.

Input contract: click selects, drag moves after a threshold, palette drag previews placement, box selection and shift-click extend selection, Ctrl/Cmd-drag copies with new IDs, quarter-turn rotation and F/Shift+F reflection follow asset constraints. Escape/right-click cancels the active tool/gesture first; right-click an unselected object then opens its context menu. Wheel zoom anchors at the pointer; middle drag or Space+drag pans. Fit, undo/redo, delete and numeric inspector edits have visible equivalents. Text editing, dialogs and drag capture suppress viewport shortcuts. Group changes, symmetry placement, replace and fill are single undoable commands. Replacement requires an explicit compatible domain and never silently deletes occupants or contents.

Restore camera, visible layers, active deck and local command history under identity/document/live-reference keys. Keep original expected authority revision on refresh. Catalog mismatches enter recovery/export mode without overwriting unsupported data. Undo before apply is local; undo after apply is a new validated operation against current state.

## Document model and coordinates

Introduce a new versioned layout schema rather than silently interpreting all assembly-v1 meshes as functional construction. A conservative importer preserves every legacy placement and its source document, marking unknown structure as an unresolved visual reference. Authors explicitly resolve it before functional publication.

Use frame-local east/north coordinates in metres and separate deck elevation. Renderer mapping remains `(x, height, -y)` and subtracts a camera origin before GPU conversion. Authoring a station does not change this convention. Ship motion remains one authoritative rigid frame; local edits never become world-motion commands.

Proposed document entities:

| Entity | Required identity and data |
| --- | --- |
| Layout draft | Draft UUID, schema/compiler version, source blueprint revision or live frame/revision reference, catalog dependency hashes, name, kind (`ship` / `station-module`) |
| Deck | UUID, name, ordered presentation index, quantized elevation and ceiling height, floor/roof policy |
| Floor tile | UUID, deck ID, pinned shape definition or validated polygon, quantized local transform, structural material/variant |
| Partition/opening | UUID, deck ID, anchored normalized edge/path, wall/seal definition; opening type, span, sill and required clearances |
| Room | UUID, deck ID, semantic name/type, region seed plus explicit boundary/partition references and design access policy |
| Fitting | UUID, pinned definition revision, local placement intent, mount reference, permitted parameters, lifecycle binding references |
| Exterior attachment | UUID, structural support/socket reference, skin/armor/decal definition, allowed variant/material overrides |
| Route | UUID, typed endpoint port references, explicit junctions and quantized path segments, service channel and size definition |
| Cargo bay | UUID, deck/support reference, physical cell dimensions and extent, restraint/interface rules and mass limit |
| Connector | UUID, paired deck or external interface references, clearance volume, transport kind and declared functional status |

Blueprint placement IDs identify authored slots; instantiated fitting/item UUIDs are separate. An initial spawn creates new instance UUIDs and records the slot-to-instance mapping. Updating an existing fitting retains its instance UUID. GPU batches, shared meshes, tile merging, names and reusable asset IDs never replace these identities.

Default authoring lattice: 1/32 m, compatible with the current assembly snap. The normal visible floor grid is 1 m with 0.5 m and fine-grid choices. A polygon definition has 3–8 vertices on the integer lattice; v1 supports catalog rectangles, right triangles and trapezoids plus quarter turns/reflections. Arbitrary rotation, curved pressure edges and freely drawn concave tiles wait for a separately tested schema extension. Room outlines can be concave unions of valid tiles.

Initial hard limits, to be measured before expansion: 8 decks, 2048 floor tiles total, 2000 fittings/skin attachments total, 8192 normalized structural edges and 8192 utility segments per document, 256 m span per horizontal axis, 100 authored commands per submitted edit batch, 1 MiB serialized proposal. These are admission defaults, not advertised station capacity. Reject oversized input before expensive topology work. Chunked private uploads may stage larger proposals later, but live application still requires one bounded atomic commit.

## Deterministic floor and enclosure compiler

The compiler is pure shared code under `packages/sim`, consuming validated shape definitions from `packages/content`. Browser preview may run it in a worker; the server must independently run the authoritative path. Pin its version and all inputs. Never use mesh-pixel overlap, renderer bounding boxes or unordered iteration as structural truth.

1. Convert approved vertices/transforms into bounded integer lattice coordinates. Reject non-finite values, invalid winding, duplicate/zero-length edges, self-intersections and zero-area polygons. Normalize polygon winding and canonical vertex order.
2. Use a spatial edge/tile index to find candidate overlaps. Reject positive-area tile overlap; touching edges are allowed. At collinear partial joins, split edges at all incident endpoints. T-junctions are therefore segmented identically before cancellation. Non-collinear crossings through tile interiors are errors, not a floating-point weld operation.
3. Create canonical undirected segment keys from ordered endpoints. One incident floor face means an exposed boundary; two opposite incidences mean an interior shared segment; more than two or repeated same-side incidences is invalid. Keep tile-to-segment provenance.
4. Traverse the exposed segments in deterministic order to form oriented closed loops. Reject dangling vertices, point-only connections and ambiguous/non-manifold joins. Report disconnected floor islands explicitly; v1 publication requires one edge-connected component per deck unless a named disconnected module policy with explicit validated structural connectors is added later. Merely sharing a document or touching at one point does not connect two live islands.
5. Distinguish exterior loops from holes by containment/winding. “Single perimeter” means one derived enclosure edge set with no duplicate shared walls, not an assumption that every valid floor plan has exactly one loop. A courtyard/shaft hole has its own boundary and must be explicitly declared; otherwise publication reports an unclassified void.
6. Generate pressure-wall spans on that edge set, then resolve internal partitions and explicit opening spans. Deduplicate coincident wall spans. Corners/junctions select compatible authored adapters. Produce a ceiling/roof cover from the floor union; roof visual seam batching must not erase structural tile ownership.
7. Build room/portal, support, navigation-clearance and utility attachment graphs. Emit deterministic sorted diagnostics with IDs and locations, derived area/bounds/mass estimates and an input fingerprint. Incomplete definitions yield “unknown,” never a plausible invented total.

Use exact integer predicates within proven numeric bounds, or BigInt intermediates for cross products/areas; do not rely on an arbitrary epsilon that makes client/server disagree. If future clipping creates rational vertices, introduce canonical rational handling explicitly rather than rounding pressure edges independently.

Derived mesh IDs are cache keys, not durable gameplay IDs. Reuse an unchanged wall record by exact semantic anchor; a split/merge requires an explicit state-transfer plan and new IDs where appropriate. Never discard damage, seal state or inventory by regenerating every wall as a new object. The first design-only compiler can emit ephemeral spans; the live-refit stage must add identity reconciliation before deployment.

## Rooms, access, doors and pressure boundaries

A room is a named semantic region, not a box-shaped mesh. A pressure compartment is a computed sealed volume; a pressure zone is the current connected gas system after evaluating openings. Several named rooms may share one compartment/zone, and a breach or door transition may split or join zones without renaming the rooms. Keep room UUIDs separate from compartment/zone identities and transfer conserved state explicitly when topology changes. Its walkable polygon comes from the floor arrangement clipped by partitions. Adjacent rooms share one partition representation. Renaming or changing furniture does not change pressure. A room boundary with no sealing wall remains an open connection, even if its color overlay stops there.

Door placement reserves a span in a valid partition or perimeter, its frame/seal interfaces, sweep volume and both approach zones. The door UUID persists through state changes. A door has distinct desired state, physical transition state, seal state, obstruction and permission; an animation is not proof of passage or pressure sealing. Validate corridor width and actual collision clearance using the actor proxy, not the artwork's transparent pixels.

Airlocks are explicit small chambers with paired door references, a vent/pump interface and a validated state machine. External airlocks connect a compartment to vacuum/exterior; internal airlocks connect two pressure zones. Reject bypassing the interlock through direct door actions. Loss of power, obstruction, emergency override and pressure mismatch need declared failure states and separate gameplay acceptance. Until that implementation exists, show the authored assembly and an “airlock behavior not implemented” diagnostic.

Pressure design metadata includes ceiling/volume assumptions and declared sealed surfaces. Actual gas species/quantity/temperature and exchange are future authoritative rows. Tests must conserve gas during room merge/split, model exterior loss, and establish door/breach updates before reporting “breathable.” Do not read oxygen, pressure, health or reactor output numbers from the mockups into production balance.

Room access presets are references to future server policies (crew, visitors, restricted role), not access grants made by an editor checkbox. Navigation reachability and authorization are separate: a visible door may still reject entry. Publish validates policy references; live interactions recheck the actor's current permission.

## Fittings, propulsion, weapons and docking

Definitions declare support footprint/volume, mass and centre of mass, compatible mount classes, orientation, clearance, service ports and available behavior capabilities. The editor previews these with distinct support/clearance/exhaust overlays. Geometry placement alone never installs a functional engine, grants helm control or supplies energy.

| Fitting family | Required validation |
| --- | --- |
| Engines and maneuver thrusters | Structural attachment, authored force direction and lever arm, unobstructed exhaust volume, symmetry transformation, compatible fuel/power/heat ports, installed capability limits |
| Reactor, battery, tanks and cooling | Support and payload rating, maintenance clearance, typed inlet/outlet/storage definitions, declared resource and heat behavior |
| Control stations and flight computers | Actor approach/seat region, installed operational state, explicit control permissions; ownership alone still grants no piloting |
| Fixed weapons | Hardpoint class, feed/energy/data ports, muzzle clearance and authored aiming constraints |
| Turrets | Structural load interface, pivot/socket axes, allowed traverse/elevation, swept collision volume, service feed and blocked firing arc checks |
| Docking ports | External mount frame and mate normal, interface class/size, capture and approach clearance, paired airlock where applicable, power/data/fluid connector declarations |

Mirroring transforms socket normals, force directions, lever arms, handed variants, decals and turret arcs consistently. Negative GPU scale alone is insufficient. Show a diagnostic if an asset has no approved mirrored variant or optical/winding-safe transform.

Docking is initially an authored interface with compatibility preview, not a reducer that teleports two ships into alignment. Future docking authority must validate relative pose/velocity, both grants, obstruction, latch/undock states and frame relationships; link services only after a validated connection. Do not merge the two inventories, ownership principals or blueprint identities. A docking latch grants no inventory withdrawal, interior admission or helm control; those remain separately validated permissions on each frame. Station modules use the same interfaces without inheriting ship pilot or propulsion requirements. Authoring modules separately is not permission to introduce sharding.

## Underfloor utilities

Service ports have stable IDs relative to a fitting instance, type/medium, direction, capacity unit, compatibility class and local anchor. Routes have explicit endpoints and junctions. Suggested initial channels:

| Channel | Required distinction | Overlay |
| --- | --- | --- |
| Power | Bus class, voltage where modeled, producer/storage/consumer, W capacity | Yellow plus lightning markers |
| Data | Protocol/class, endpoint role and modeled bandwidth | Green plus dotted signal markers |
| Fuel/other fluid | Specific fluid type, L/s capacity, pressure class, inlet/outlet direction | Orange plus flow arrows |
| Coolant/heat | Coolant circuit separate from thermal transfer/heat-rejection capability; kg/s or L/s and W carry declared units | Cyan fluid lines and separate thermal annotation |
| Ventilation | Gas medium, duct section, flow direction and valve/fan junctions | Purple plus duct markers |

Color is accompanied by labels, patterns and port symbols. Crossing lines are disconnected unless a same-channel junction UUID explicitly connects them. Parallel utilities occupy finite tray/conduit capacity; incompatible fluids cannot share a pipe. Route segments must lie in supported service corridors with allowed bend radii and penetrations. Passing through a pressure wall requires a rated sealed feedthrough; drilling a rendered line across it does not preserve the seal automatically. Deck transitions use explicit riser ports and reserved shaft volume.

Start with deterministic connectivity and capacity validation, not a promised complete electrical/fluid solver. A bounded isolated preview may later compute supply allocation and expose disconnected/overloaded components. Label it “design simulation” with assumptions and unsupported effects. Live networks own resource quantities and dispatch; routing changes alone do not create fuel or charge. Power loss must feed the same installed IFCS/equipment validators rather than leaving fixture “powered” constants as a hidden bypass. Preview controls never write live balances.

## Cargo: physical placement versus inventory contents

A cargo bay is a physical grid or approved polygonal occupancy region on a deck. Its cells have dimensions in metres and support/restraint ratings. A crate or tank instance occupies a real volume, with orientation, handling clearance, loading route and total payload mass. A floor tile count is not automatically a cargo capacity.

A container's internal Tetris grid is separate: it stores item UUIDs using authored cell footprints, rotation and mass rules. Moving the physical container moves the same container UUID and all descendants; it never repacks or recreates those items. Liquid storage is a reservoir with litres, fluid type/density and capacity, not grid squares. A filled 5 L canister has both a physical/item placement and its child reservoir; liquid mass contributes through the containment tree.

Validate physical collision and restraint, internal grid bounds/overlap, exclusive item location, no containment cycles, ancestor payload limits and overall frame mass. Published blueprints may specify empty container capacity and optional separately authorized spawn loadouts; capturing a live ship must not copy its current cargo balances into a blueprint that duplicates them on spawn.

When a refit removes cargo floor/support, require an explicit legal relocation or reject. No “clear room,” replace, resize or undo command may discard cargo, equipped items, fuel or crew. Keep a relocation diff visible in the review dialog and recheck it against current state at commit.

## Multi-deck scope

Deck elevation, ceiling height, floor/roof overlap, vertical fitting clearance, stair/lift shafts and service risers belong in authoring from the schema's first version. Show an active deck with optional ghosted adjacent decks and side elevation; a deck switch is editor navigation.

Initial playable output remains one explicitly selected planar deck. Multiple authored decks may be saved and previewed, but publication marks unavailable traversal and live application rejects designs that require unsupported vertical gameplay. Stairs, ramps and lifts can be authored reservations until their traversal authority exists. Adding elevations, turret meshes or a side-view camera does not introduce six-degree-of-freedom flight, gravity simulation, EVA or arbitrary client vertical movement.

## Authority, persistence and four separate workflows

Use private normalized rows, not a giant publicly subscribed JSON ship. Proposed domains are `layout_draft`, `layout_revision`, `layout_dependency`, deck/tile/partition/room/fitting/route rows, blueprint revisions, instance-to-blueprint mappings, refit receipts, audit entries and tombstones. Exact table names should follow the implemented schema conventions. Bound histories and queries; document archival and restore behavior rather than retaining every draft in hot memory forever.

| Operation | Meaning | Must not do |
| --- | --- | --- |
| Save draft | Persist an authorized design revision and local command checkpoint; may be incomplete/invalid with diagnostics | Change a live ship or publish a reusable catalog definition |
| Publish blueprint | Validate and create a new immutable blueprint revision with pinned dependencies | Refit existing instances or treat a thumbnail export as publication |
| Apply live refit | Revalidate a reviewed proposal against a live aggregate and atomically commit permitted differences | Reset inventory, fittings, damage, crew, power state or unrelated player actions |
| Capture live to draft | Read authorized source/current state and create a provenance-bearing design draft for review | Publish automatically, duplicate live item resources or erase deletion history |

JSON export/import is a portable draft operation, separate from all four. A local unsaved document remains clearly labeled local. A live inspector is read-only until the caller has the specific refit capability.

Proposed commands include create/save draft, validate draft, publish blueprint, preview refit, apply refit and capture live. Every write carries expected revision and operation ID; receipts bind caller, exact bounded payload fingerprint, target, outcome and result revision. Reuse of an operation ID with different content rejects. Receipt eviction must leave revision/liveness protection against replay. Revision checks are per aggregate; unrelated motion ticks must not make a structural edit stale, but material changes to cargo/occupancy/resources involved in the refit must be guarded or revalidated.

A refit transaction must:

1. Resolve authenticated account/character and required `blueprint.write` or `world.refit` capabilities; verify current frame access and operational constraints. Dashboard login and ship ownership alone do not authorize all operations.
2. Load the current relevant aggregate, dependencies and expected revisions. Recompute topology, mounting, clearances and resource/crew relocation against the submitted design intent.
3. Resolve retained/added/removed instances explicitly. Preserve retained UUIDs, containment, fuel/charge, damage, occupancy, grants and script state. Reject deletion of occupied or nonempty objects unless a valid explicit transition handles them.
4. Apply normalized row changes, derived mass/inertia/topology, deletion records, audit and receipt in one transaction. Clear stale control intents if their station is removed or invalidated. A failed validation/hook leaves all affected rows unchanged.
5. Return the canonical result and revision. Clients rebase after acknowledgment; a conflict shows what changed and preserves the uncommitted proposal. Undo is another validated edit, never a database rollback.

A dry-run result is advisory unless bound to an expiring server-owned preview record and all relevant revisions. Always revalidate on consumption. Slow Blender/export/HTTP work stays outside reducers; a worker can stage content hashes, but it cannot return unchecked authoritative transforms. An oversized refit rejects; chunking a proposal upload must not create a partially applied live ship.

Views enforce permissions before interest filtering and redact columns. Separate authoring design access, live engineering detail, public exterior appearance and admitted interior information. Do not expose private base tables beside filtered views. Revoking access removes projected rows and invalidates editor action state; UI hiding is not authorization. Asset manifests contain public visual metadata only, not secret installed devices or cargo.

Production access must use the existing Orchard Keycloak issuer with distinct public PKCE clients for game and dashboard, exact configured origins/audiences and server-side issuer/audience/session validation. Prepared registrations are not live authentication. Local lab identities must remain explicitly development-only; no silent production fallback. Authoring roles/scopes are private revocable game records, not a client-side “admin” flag. See [authentication](authentication.md) for deployment prerequisites.

## Lifecycles and asset integration

An installed component pins definition and behavior revisions. Creation, restoration, installation, removal, interaction, supply change and destruction follow [scripting lifecycle](scripting_lifecycle.md). Restoring a layout after restart does not rerun creation rewards or refill containers. Validation hooks participate in the same transaction; post-commit external work uses a durable outbox. Live behavior requests use ordinary action validators and bounded execution; no dashboard-authored `eval` inside reducers.

Blender remains the visible source: editable meshes, materials, UVs/textures, animation and sockets exported as validated GLB. The layout compiler chooses and places compatible authored floor/wall/corner/roof modules; if an unsupported boundary needs a missing adapter, report it or use a clearly labeled draft proxy. Do not fulfill the redesign by reviving TypeScript voxel solids or sampling the visible mesh back to a coarse surface.

Keep structural/occupancy/collision/damage proxies separate from visuals and version their relationship. Preserve seal surfaces, openings, plate thickness and silhouette detail as real geometry. Use normal/bump, roughness, metallic and baked contact-detail maps for shallow surface detail; validate tangent response, color-space handling, texture channels and mipmaps. Glass/transmission remains optical material data, not an opaque proxy assumption. Batch by material/LOD while retaining a selection lookup from rendered primitives to placed IDs. Whole-room/object selection should not expose every submesh edge.

External agents currently own equipment/hull model revisions and canonical asset outputs. The implementation agent must coordinate ownership before touching their sources, manifests, export scripts or public copies. Consume approved interfaces and stage missing adapters separately. Preserve exact references, prior iterations and ledger provenance under [the art-library workflow](../assets/art-library/WORKFLOW.md). Passing checks or being installed is not final owner approval of an asset revision. Do not republish reference images or draft assets as an incidental app build side effect.

## Delivery stages and acceptance

Stages are proposed task boundaries, not declarations that existing M2/M3/M4 milestones are complete. Each stage ships a reviewable vertical slice and updates current-versus-planned status.

| Stage | Deliverable | Required acceptance |
| --- | --- | --- |
| 0. Inventory and contracts | Re-audit live code/asset ownership; versioned schema and bounded compiler API; preserved assembly-v1 importer | Existing drafts remain recoverable; no asset IDs or authority rows altered; explicit fixture support matrix |
| 1. Pure floor topology | Rectangle/triangle/trapezoid union, edge splitting, perimeter/roof preview and diagnostics | Tile-order invariance, reflection/rotation invariance, partial shared edges, T-junctions, holes, concave unions, point contact, self-crossing/overlap rejection, budget overflow; byte-stable normalized output across browser/server |
| 2. Local dashboard planner | Reference-led shell, decks, tools, palette, inspector, room/partition/opening design, save/recovery/export and 3D preview | Real browser pointer/keyboard/DPI/resize review, command undo/redo including symmetry and replacement, refresh recovery, missing assets, no gameplay mutation, no duplicate perimeter faces |
| 3. Private draft and blueprint service | OIDC/capability prerequisite, durable drafts, pinned publication and scoped views | Wrong role/issuer/audience, revoked access, base-table rejection, two-editor revision conflict, exact retry/conflicting retry, server rejection of malicious geometry, restart persistence; no automatic live changes |
| 4. Bounded live refit/capture | One selected planar-deck fixture, semantic state reconciliation and explicit relocation review | Retained item/fitting/room IDs, occupied seat rejection/control clearing, cargo and reservoir conservation, no-fit rollback, concurrent inventory activity, crash/restart, capture/publish/refit separation and inverse-edit conflict |
| 5. Installed systems and room behavior | Functional door/airlock state machines, compartment authority and typed utility supply, introduced independently | Gas/resource conservation, interlock failure modes, blocked clearances, sealed penetrations, disconnected engine cannot thrust, supply loss resets, permissions on consume; no claims before each subsystem passes |
| 6. Expansion | Station interfaces/docking, broader hull families, cargo handling, multi-deck gameplay if separately approved | Dock/undock authority and cross-frame state preservation; measured larger-layout budgets; vertical traversal tests only after an explicit gameplay design |

Every authority stage runs `npm run smoke` on the isolated database. Use `npm run check` and `npm run build` for completion, with separate `build:dashboard`/`build:client` isolation checks where appropriate. Services run only through npm or `scripts/dev.py`; normal publication is an explicit non-destructive coordinated step. Never reset the development database to make a migration easy.

Performance tests should measure representative 256/1024/2048-tile plans and mixed fittings, worst-case collinear subdivision and route branches. Initial targets: ordinary local pointer preview within one frame using cached incremental results, committed worker validation p95 below 100 ms on the documented review machine, no main-thread stall over 50 ms during ordinary edits, and bounded server validation below the measured scheduling budget. These are proposed engineering targets, not verified promises; report failures and adjust stage limits rather than silently skipping validators. GPU gates record draw calls, active meshes/indices, texture memory and shadow work; no one-light-per-tile or per-frame full topology rebuild.

Evidence must include actual dashboard screenshots corresponding to the four reference modes, a triangle/trapezoid bow with a clean continuous perimeter, room opening/sweep validation, a typed crossing with no implicit junction, a cargo-container versus contents inspection, and a complete rejected/accepted refit with retained UUIDs. Keep the screenshot seed/document hash, camera and viewport. Mockups may explain a proposed state, but do not label them implemented runtime proof.

## Defaults and decisions still requiring explicit follow-up

Proceed with the documented v1 defaults: 1/32 m lattice, quarter-turn catalog shapes, one connected floor component per deck, explicit holes, eight authored decks with one playable planar deck, empty blueprint container instances unless a separate spawn loadout is authorized, and no resource simulation claims for design-only routes.

The following remain product/engineering decisions rather than reasons to invent support:

- Exact polygon module sizes, pressure-wall thickness/ceiling defaults and faction kit compatibility require agreement with the external Blender asset owners. Missing approved geometry blocks visual acceptance, not schema drafting.
- Which refit environments permit structural work (docked yard, owner sandbox, authorized admin operation) and what resource/time costs apply need a gameplay policy. Default production live refits disabled until that policy and permissions exist; development fixture tests may use explicit scoped test grants.
- Pressure/gas units and solver, utility allocation priorities/failure behavior, docking capture rules and vertical traversal each need their own bounded authority design. This editor supplies interfaces and diagnostics, not implied implementations.
- The production OIDC origins, account bootstrap and authoring role grants remain deployment work. Do not expose authoring mutation publicly using the development token path.
- Larger stations may need authoring modules and aggregate budget changes. Measure first; do not split one logical refit into non-atomic updates or introduce shard persistence.

## External implementation handoff contract

Use [the external implementation prompt](handoffs/ship_layout_editor_implementation_prompt.md) with this design. The external agent should receive this document, the four exact reference paths, active repository instructions, and an explicitly chosen stage range. Start with Stages 0–2 unless the owner also authorizes the corresponding authority prerequisites. Return a source audit, implementation plan/file ownership, concrete changes, tests and actual browser evidence; keep unimplemented buttons honest. Coordinate asset ownership and preserve existing work before edits. The parent handoff prompt can select a broader scope, but must retain the save/publish/refit/capture separation, privacy and no-loss rules above. This document itself authorizes no runtime implementation or asset publication.
