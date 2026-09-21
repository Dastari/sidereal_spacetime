# Studio zone authoring

Status: implemented in PR #15; validation and limitations recorded in the handoff. Owner requested shared Photoshop-style editing, curved polygon zones, nested systems/zones and authoritative transitions on 2026-09-21.

## Contract

Map and Shipyard share focused keyboard commands: V select/move, H pan, Space temporary pan, Ctrl/Cmd+D duplicate, Delete remove, Ctrl/Cmd+Z undo, Shift+Z/Ctrl+Y redo, arrows nudge (Shift tenfold), Escape cancel. Map additionally uses A for anchors/handles and P for drawing. Inputs, editable text and modal dialogs retain their native shortcuts. Domain-specific construction validation remains in Shipyard. One pointer gesture produces one history entry; cancelled/no-op gestures produce none. Selected ancestors and descendants move once. Live ships and catalog celestials cannot be duplicated/deleted by map commands.

A system is an implicit root sphere zone. Existing asteroid fields are population-bearing child zones. Additive optional generic zones preserve v1 document compatibility and existing object IDs; they do not require asteroid populations. Every child has stable ID, name, color, parent, world-space origin, bounded primitive or closed polygon geometry and optional background. Parenting preserves world positions. A child's effective volume is clipped by every ancestor; logical nesting does not teleport contents. Zone duplication clones the subtree with new placed IDs and remapped parents. Deletion removes the subtree as one undoable draft action.

Polygon anchors support incoming/outgoing cubic handle offsets and corner/aligned/mirrored modes. Converting a straight edge creates collinear handles without moving its shape. Splitting a cubic uses de Casteljau and preserves shape. Direct editing supports point insertion/removal, handle dragging, angle/length fields and minimum three anchors. A deterministic bounded compiler supplies the same geometry to validation, background feathering, population and server membership. Reject excessive work, nonfinite coordinates, degenerate/self-intersecting polygons and cyclic/missing parents. Never silently lower precision. Root spheres stay analytic.

Geometric zone membership is separate from existing physics/admission systemId. Reducers author zones atomically under existing draft grants, expected revision, operation ID and source fingerprint. Private normalized definitions and per-ship membership/transition state use B-tree indexes on IDs, not floating coordinates. Gameplay views expose only the admitted authenticated character's current ship. No client enter/exit command or public base tables.

Accepted motion is swept through boundaries, including thin regions crossed entirely in one tick. Solver corrections reclassify endpoints rather than inventing flown travel. Only committed solver segments count. Simultaneous exits are deepest-first, entries parent-first, then stable ID. Overlapping siblings can both be active. Tangencies alone do not create transit events. Retain a bounded recent transition history and monotonic sequence so reconnect can detect gaps. Map edits reclassify stationary/disconnected ships atomically with reason map-edit; reconnect does not invent travel. Crossing the root changes membership/background, not physics ownership or control rights.

## Delivery and acceptance

1. Content/geometry contract, deterministic compilation, path operations, nesting and swept-transition unit tests.
2. Private indexed authority, atomic apply, accepted physics trace, admission-safe projection and isolated database smoke coverage.
3. Map object/direct tools, selection/move/duplicate/delete/history, nested outline, name/color and curve controls; shared keyboard routing in Shipyard.
4. Browser exercise of both editors, required check/build/smoke, independent diff review and PR update. No merge or deployment.

Success: one drag is undone once; cancelled drags leave identical draft JSON; subtree duplicates share no placed IDs; cubic splits preserve sampled shape; server catches outside-to-outside traversal; private transition rows cannot be subscribed to; pre-existing documents retain deterministic asteroid identities. Existing unrelated baseline check failures are recorded separately from changed-code validation.

## Decisions and evidence

See [zone authority ADR](../adr/ADR-20260921-zone-authority.md). Two independent read-only plans reviewed controls and server integration. Rejected endpoint-only membership (misses thin zones and collision bounces), changing simulation systemId (breaks scheduler/admission), and generic zones implemented as empty asteroid fields. Ancestor clipping avoids fragile full containment tests for concave curves. Geometric transitions within one simulation scope are implemented here; cross-scope travel needs a separate lifecycle design.

## Implemented bounds and storage

There are at most 48 volumes per document (including root and fields), eight ancestor levels, 64 authored anchors per polygon, 512 compiled edges per polygon and 8,192 total edges. Compiler v1 error tolerance is max(0.01 m, control extent / 16,384); subdivision depth is bounded at 16. Authoritative sweeps use a shared six-million-operation budget per scope tick and preserve pre-step motion on exhaustion. Definitions are indexed private rows; current membership and the newest 128 transitions share one private state row per ship to avoid separate journal/pruning writes. Public sequence bounds identify expired history. A stopped endpoint uses closed membership; tangent enter/exit pairs at contiguous drift joins within the tick are suppressed.

During polygon creation, Backspace/Ctrl+Z removes the last drawn point, redo restores it and Enter finishes a valid three-point-or-more outline. Existing object history stays untouched until the polygon is committed.
