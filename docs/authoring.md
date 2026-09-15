# Dashboard and authoring rebuild

Status: Accepted direction; implementation staged
Last updated: 2026-09-08
Owners: Sidereal project

## Preserve capability; design the interface anew

The new dashboard uses the new component library and shared Babylon rendering/compiler adapters. No old GridCN/Bevy visual skin is carried over. Implement navigation, empty/loading/error states and permissions per route; a visible route tile is not a completed editor. Current scaffold links each work area to its milestone and provides an actual revision-checked live ship-name edit.

| Workspace | Required features | Server boundary | Milestone |
| --- | --- | --- | --- |
| Account/profile | login/recovery, MFA, multiple characters, session management, roles/scopes | trusted identity/character binding and admin grants | M1 |
| World explorer | spatial search, entity tree, inspect, right-click ship → live Shipyard, spawn/move/delete with provenance | permission-filtered admin views and validated world commands | M3/M8 |
| Entity instances | typed components, original/current/expected values, receipts, revert or capture | revision-checked aggregate operations | M3 |
| Shipyard | block designer, hull assembly, utility routes, mass/CoM/inertia, attachment rules, floors/compartments | shared compiler + validated blueprint/refit commands | M2/M3/M4 |
| Foundry | entity/component package composition, dependency graph, inheritance/overrides, preview, lifecycle bindings | immutable package revisions and schema validation | M3/M8 |
| Firmament | original universe baseline, stars/planets/fields/zones, galaxy map, semantic placement and seed preview | baseline publish/apply/capture with merge and deletion history | M8 |
| Genesis | planet families, deterministic seeds, asteroid fields/voxel shapes, thumbnails and material controls | versioned generation packages, never pixel-derived collision | M8 |
| Atelier/Blender | glTF mesh gallery, import/export, pivots, sockets, clearance, colliders, LOD, animations, previews | external worker validates artifacts, publishes manifests | M2 |
| Material workshop | PBR/GLSL/WGSL or node-material preview, parameter schemas, lighting, roof/interior variants and diagnostics | validated shader/material package versions; no raw runtime state writes | M8 |
| Sound Studio | waveform, looping, cue markers, buses, spatial/occlusion previews | versioned asset/cue catalogs | M8 |
| Script Studio | code editor, type/API help, compile/lint, sandbox runs, lifecycle hooks, revisions, rollback | bounded behavior / trusted build-worker boundary and privileged publishing | M3/M8 |
| Economy | item/resource/recipe/facility catalogs, dependency graph, queues and stock inspection | schema validation and explicit live resync | M5/M7 |
| Factions | visual families, membership/roles, standings, permissions, recipes and fleets | explicit faction administration and audit | M5/M7 |
| Metrics | runtime health, tick percentiles, active rows, subscriptions, memory, assets and client errors | scoped operational views | M1/M9 |
| Security | auth/access failures, rate limits, bans, moderation, grants and revocation | admin-only audited commands | M1/M9 |
| Settings/releases | configuration, schema/content versions, backup/restore workflow, release gates | operator tools; credentials never client-side | M9 |

## Shipyard interaction contract

The owner-requested [layout editor design](ship_layout_editor_design.md) translates the four editor mockups into floorplan, rooms, exterior, cargo and utility authoring stages. Use its [external implementation prompt](handoffs/ship_layout_editor_implementation_prompt.md) to begin the local planner/compiler slice. It extends this contract; no live construction milestone is completed by the document.

A central 3D viewport can use an orthographic editing plane and transparency checkerboard. The tool strip sits beside the canvas; layer selection/visibility lives in a right drawer. The parts palette is floating/dockable, fully resizable, icon-first, searchable and tabbed for all placeable things including exterior finishes/markings. Left navigation contains hulls/classes/library, not a second block list. Inspector details appear for a selected part rather than long palette panels.

Support drag from palette, drag to move, box/multi-select, snap, replace-on-drop within the appropriate editing domain, rotate, F/Shift+F flip, delete, Ctrl/Cmd-drag copy, pan/zoom and fit. Right-click first cancels active selection/placement; on an unselected part it offers contextual actions. Undo/redo is complete and command-based, including replacement and grouping; no permanent visual history panel. Refresh restores drafts AND undo/redo scoped to identity/document/live entity while retaining the original expected revision. Detect conflicts before apply. Session state cannot store auth secrets or become canonical world state.

Layer order: rooms/internal walls/doors; interior equipment and cargo/stations; hull armor; exterior hardpoints; roof; markings; utilities (with independently visible channels). Exterior/cutaway is controlled by layers. Joined room boundaries generate compartments and wall corners without duplicate geometry. Roof panels skin the deck union and only expose perimeter seams; text and decals project independently with an explicit draw/depth bias. Room and equipment placement validation is semantic, independent of opaque model pixels.

Model sockets declare mount face, compatible tags, orientation, clearance and port locations. Equipment requires room support; doors reserve sweep/approach areas; engines require valid exterior attachment and clear exhaust; turrets require top support and arc clearance. Mirroring updates sockets/thrust/UV/material handedness as needed. Placement preview, server compile and collision share definitions and tests.

## Authoring transaction workflow

1. Load the authorized live aggregate plus expected revision and baseline provenance.
2. Edit a local command document and show validated mass, layout, supplies and any displaced crew/cargo.
3. Run dry-run validation using the same server rules. Report actionable errors.
4. Apply one bounded operation with UUID, expected revision and fingerprint. Validate capability, ownership, topology, mounting and operational constraints.
5. Commit all affected state/identities/tombstones/audit/receipt atomically. Acknowledge the canonical result and rebase the draft.
6. Publishing a blueprint creates a new shared source revision; it never silently refits every existing ship. Capturing live state creates a reviewed source draft. Applying a universe baseline performs an explicit merge with deletion history.

Failure/cancel creates no partial refit. Deleting a fitting must resolve fuel/items/cargo and occupied seats through a defined policy; never silently discard them. Concurrent editors get conflicts, not last-writer-wins data loss. Retrying a successful operation returns the same outcome. Undo after commit submits an inverse command against current state; it cannot undo unrelated subsequent player activity.

## Required editor tests

Cover input focus, viewport DPI/resize, every drag/rotate/flip gesture, replacing overlapping pieces, undo/redo and refresh recovery, mirrored mount rules, corner/roof topology, inaccessible live entities, two editors racing, operation retries, blocked cargo/crew displacement, restart persistence and capture/publish/apply separation. Asset viewers must handle missing/invalid glTF and shader compile errors without crashing the whole dashboard.

## 2026-09-08 script and application refinement

All tools run in the independent `apps/dashboard` application on port 5174; rebuilding it never rebuilds or restarts the game app. Script Studio starts in M3 with early lifecycle integration in M1/M2. Its complete source/hook/state/version/trace workflow is specified in [scripting lifecycle](scripting_lifecycle.md), including trusted compiled code versus bounded live behavior. Reuse the [existing OIDC provider](authentication.md) with distinct dashboard scopes.

## Map editor candidate

The first Firmament/world explorer surface is `/map`: metric top-down chart, live ship overlay, celestial movement, spherical system/background authoring and deterministic asteroid volumes. See [user guide](public/system-map.md) and [implementation specification](specs/system-map-editor.md). This does not complete the broader M8 universe or economy milestones.
